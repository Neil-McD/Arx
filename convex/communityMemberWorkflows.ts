import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  COMMUNITY_MEMBER_WORKFLOW_EVIDENCE_REF_MAX_COUNT,
  COMMUNITY_MEMBER_WORKFLOW_MAX_CHECKS_PER_MILESTONE,
  COMMUNITY_MEMBER_WORKFLOW_MAX_MILESTONES,
  COMMUNITY_MEMBER_WORKFLOW_MIN_MILESTONES,
  communityMemberWorkflowCheckDefinition,
  normalizeCommunityMemberWorkflowAutomaticSignal,
  normalizeCommunityMemberWorkflowCheckKey,
  normalizeCommunityMemberWorkflowJudgmentCriterion,
  normalizeCommunityMemberWorkflowMilestoneKey,
  normalizeCommunityMemberWorkflowMilestoneName,
  normalizeCommunityMemberWorkflowSourceRef,
  type CommunityMemberWorkflowCheck,
  type CommunityMemberWorkflowMilestone,
} from "../shared/communityMemberWorkflow";
import {
  communityMembershipRowIsActive,
  getUniqueCommunityMembershipByPair,
  readCommunityActiveMemberCount,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
  type CommunityMembershipLike,
} from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { buildCommunityInteractionEvidenceRef } from "../shared/communityEvidenceContract";
import {
  communityInteractionEvidenceSourceIsReadable,
  resolveCommunityInteractionEvidenceSource,
} from "./communityInteractionEvidenceCore";
import { readMemberFactsForLens } from "./memberOntologyCore";
import {
  COMMUNITY_MEMBER_SUCCESS_HISTORY_LIMIT,
  renderCommunityMemberSuccessDossierMarkdown,
  type CommunityMemberSuccessDossier,
} from "../shared/communityMemberSuccessDossier";

const managerIdentityArgs = {
  userId: v.optional(v.id("users")),
  authSubject: v.optional(v.string()),
};

const WORKFLOW_BOARD_DEFAULT_PAGE_SIZE = 50;
const WORKFLOW_BOARD_MAX_PAGE_SIZE = 100;
const EVALUATION_LEASE_MS = 10 * 60_000;
const EVALUATION_MAX_ATTEMPTS = 3;
const EVALUATION_EVIDENCE_LIMIT_PER_KIND = 100;

type WorkflowRow = Doc<"communityMemberWorkflows">;
type MemberMilestoneRow = Doc<"communityMemberWorkflowMemberMilestones">;
type EvaluationRow = Doc<"communityMemberWorkflowMilestoneEvaluations">;
type PassRow = Doc<"communityMemberWorkflowMilestonePasses">;
type ChannelContributionRow =
  | Doc<"communityInteractionRoots">
  | Doc<"communityInteractionReplies">;

type EligibleEvidence = {
  ref: string;
  occurred_at: string;
  kind: "channel_root" | "channel_reply";
  text: string;
};

type AutomaticCheckResult = {
  checkKey: string;
  type: "automatic";
  passed: boolean;
  evidenceRefs: string[];
};

const checkInputValidator = v.union(
  v.object({
    key: v.optional(v.string()),
    type: v.literal("automatic"),
    signal: v.string(),
  }),
  v.object({
    key: v.optional(v.string()),
    type: v.literal("judgment"),
    criterion: v.string(),
  }),
);

async function sha256HexText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function milestoneChecksHash(
  milestone: CommunityMemberWorkflowMilestone,
): Promise<string> {
  return await sha256HexText(
    JSON.stringify({
      key: milestone.key,
      name: milestone.name,
      checks: milestone.checks.map(communityMemberWorkflowCheckDefinition),
    }),
  );
}

function normalizeExpectedRevision(value: unknown): number {
  const revision = Number(value);
  if (!Number.isFinite(revision) || revision < 0) {
    throw new Error("community_member_workflow_revision_invalid");
  }
  return Math.floor(revision);
}

async function requireWorkflowManager(args: {
  ctx: any;
  communityId: any;
  userId?: any;
  authSubject?: string | null;
}) {
  const userId = await resolveUserIdForAuthenticatedRequest({
    ctx: args.ctx,
    userId: args.userId,
    authSubject: args.authSubject ?? null,
  });
  const { community } = await requireCommunityManager({
    ctx: args.ctx,
    communityId: args.communityId,
    userId,
  });
  return { userId, community };
}

export async function getCommunityMemberWorkflowByCommunity(args: {
  ctx: any;
  communityId: any;
}): Promise<WorkflowRow | null> {
  const rows = (await args.ctx.db
    .query("communityMemberWorkflows")
    .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
    .take(2)) as WorkflowRow[];
  if (rows.length > 1) throw new Error("community_member_workflow_ambiguous");
  return rows[0] ?? null;
}

async function getMemberMilestone(args: {
  ctx: any;
  workflowId: any;
  membershipId: any;
}): Promise<MemberMilestoneRow | null> {
  const rows = (await args.ctx.db
    .query("communityMemberWorkflowMemberMilestones")
    .withIndex("by_workflow_membership", (q: any) =>
      q.eq("workflowId", args.workflowId).eq("membershipId", args.membershipId),
    )
    .take(2)) as MemberMilestoneRow[];
  if (rows.length > 1) {
    throw new Error("community_member_workflow_member_milestone_ambiguous");
  }
  return rows[0] ?? null;
}

function nextOpaqueKey(prefix: "milestone" | "check", existing: Set<string>): string {
  for (;;) {
    const candidate = `${prefix}-${crypto.randomUUID()}`;
    if (!existing.has(candidate)) return candidate;
  }
}

function requireWorkflowRevision(
  workflow: WorkflowRow | null,
  expectedRevision: number,
): WorkflowRow {
  if (!workflow) throw new Error("community_member_workflow_not_found");
  if (Number(workflow.revision) !== expectedRevision) {
    throw new Error("community_member_workflow_revision_conflict");
  }
  return workflow;
}

function normalizeChecks(
  inputs: Array<any>,
  existingChecks: CommunityMemberWorkflowCheck[],
): CommunityMemberWorkflowCheck[] {
  if (inputs.length > COMMUNITY_MEMBER_WORKFLOW_MAX_CHECKS_PER_MILESTONE) {
    throw new Error("community_member_workflow_check_count_invalid");
  }
  const existingByKey = new Map(existingChecks.map((check) => [check.key, check]));
  const used = new Set<string>();
  return inputs.map((input) => {
    const suppliedKey = input.key
      ? normalizeCommunityMemberWorkflowCheckKey(input.key)
      : null;
    if (suppliedKey && !existingByKey.has(suppliedKey)) {
      throw new Error("community_member_workflow_check_invalid");
    }
    const key = suppliedKey ?? nextOpaqueKey("check", new Set([...existingByKey.keys(), ...used]));
    if (used.has(key)) throw new Error("community_member_workflow_check_duplicate");
    used.add(key);
    if (input.type === "automatic") {
      return {
        key,
        type: "automatic" as const,
        signal: normalizeCommunityMemberWorkflowAutomaticSignal(input.signal),
      };
    }
    return {
      key,
      type: "judgment" as const,
      criterion: normalizeCommunityMemberWorkflowJudgmentCriterion(input.criterion),
    };
  });
}

function resolveCurrentMilestone(args: {
  workflow: WorkflowRow;
  membership: CommunityMembershipLike;
  state: MemberMilestoneRow | null;
}) {
  const currentMilestoneKey =
    args.state?.currentMilestoneKey ?? args.workflow.milestones[0]?.key;
  const milestoneIndex = args.workflow.milestones.findIndex(
    (milestone) => milestone.key === currentMilestoneKey,
  );
  if (milestoneIndex < 0) {
    throw new Error("community_member_workflow_member_milestone_invalid");
  }
  return {
    milestone: args.workflow.milestones[milestoneIndex],
    milestoneIndex,
    milestoneEnteredAt:
      args.state?.milestoneEnteredAt ??
      args.membership.activatedAt ??
      args.membership.createdAt,
    completedAt: args.state?.completedAt ?? null,
  };
}

export const createBuilderWorkflowMilestone = mutation({
  args: {
    ...managerIdentityArgs,
    communityId: v.id("communities"),
    expectedRevision: v.number(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireWorkflowManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    const name = normalizeCommunityMemberWorkflowMilestoneName(args.name);
    const expectedRevision = normalizeExpectedRevision(args.expectedRevision);
    const existing = await getCommunityMemberWorkflowByCommunity({
      ctx,
      communityId: args.communityId,
    });
    const nowMs = Date.now();
    if (!existing) {
      if (expectedRevision !== 0) {
        throw new Error("community_member_workflow_revision_conflict");
      }
      const milestone = {
        key: nextOpaqueKey("milestone", new Set()),
        name,
        checks: [],
      };
      const workflowId = await ctx.db.insert("communityMemberWorkflows", {
        communityId: args.communityId,
        milestones: [milestone],
        revision: 1,
        createdByUserId: userId,
        updatedByUserId: userId,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      return { workflow_id: String(workflowId), revision: 1, milestone };
    }
    requireWorkflowRevision(existing, expectedRevision);
    if (existing.milestones.length >= COMMUNITY_MEMBER_WORKFLOW_MAX_MILESTONES) {
      throw new Error("community_member_workflow_milestone_count_invalid");
    }
    const milestone = {
      key: nextOpaqueKey(
        "milestone",
        new Set(existing.milestones.map((item) => item.key)),
      ),
      name,
      checks: [],
    };
    const revision = expectedRevision + 1;
    await ctx.db.patch(existing._id, {
      milestones: [...existing.milestones, milestone],
      revision,
      updatedByUserId: userId,
      updatedAt: nowMs,
    });
    return { workflow_id: String(existing._id), revision, milestone };
  },
});

export const updateBuilderWorkflowMilestone = mutation({
  args: {
    ...managerIdentityArgs,
    communityId: v.id("communities"),
    expectedRevision: v.number(),
    milestoneKey: v.string(),
    name: v.string(),
    checks: v.array(checkInputValidator),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireWorkflowManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    const expectedRevision = normalizeExpectedRevision(args.expectedRevision);
    const workflow = requireWorkflowRevision(
      await getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId }),
      expectedRevision,
    );
    const milestoneKey = normalizeCommunityMemberWorkflowMilestoneKey(args.milestoneKey);
    const milestoneIndex = workflow.milestones.findIndex(
      (milestone) => milestone.key === milestoneKey,
    );
    if (milestoneIndex < 0) {
      throw new Error("community_member_workflow_milestone_invalid");
    }
    const current = workflow.milestones[milestoneIndex];
    const milestone = {
      key: current.key,
      name: normalizeCommunityMemberWorkflowMilestoneName(args.name),
      checks: normalizeChecks(args.checks, current.checks),
    };
    if (JSON.stringify(current) === JSON.stringify(milestone)) {
      return {
        workflow_id: String(workflow._id),
        revision: expectedRevision,
        milestone: current,
      };
    }
    const milestones = workflow.milestones.map((item, index) =>
      index === milestoneIndex ? milestone : item,
    );
    const revision = expectedRevision + 1;
    const nowMs = Date.now();
    await ctx.db.patch(workflow._id, {
      milestones,
      revision,
      updatedByUserId: userId,
      updatedAt: nowMs,
    });
    return {
      workflow_id: String(workflow._id),
      revision,
      milestone,
    };
  },
});

export const deleteBuilderWorkflowMilestone = mutation({
  args: {
    ...managerIdentityArgs,
    communityId: v.id("communities"),
    expectedRevision: v.number(),
    milestoneKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, community } = await requireWorkflowManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    const expectedRevision = normalizeExpectedRevision(args.expectedRevision);
    const workflow = requireWorkflowRevision(
      await getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId }),
      expectedRevision,
    );
    if (workflow.milestones.length <= COMMUNITY_MEMBER_WORKFLOW_MIN_MILESTONES) {
      throw new Error("community_member_workflow_milestone_count_invalid");
    }
    const milestoneKey = normalizeCommunityMemberWorkflowMilestoneKey(args.milestoneKey);
    const milestoneIndex = workflow.milestones.findIndex(
      (milestone) => milestone.key === milestoneKey,
    );
    if (milestoneIndex < 0) {
      throw new Error("community_member_workflow_milestone_invalid");
    }
    const occupied = await ctx.db
      .query("communityMemberWorkflowMemberMilestones")
      .withIndex("by_workflow_milestone", (q: any) =>
        q.eq("workflowId", workflow._id).eq("currentMilestoneKey", milestoneKey),
      )
      .first();
    if (occupied) {
      throw new Error("community_member_workflow_milestone_has_members");
    }
    if (milestoneIndex === 0) {
      const activeMemberCount = readCommunityActiveMemberCount(community);
      if (activeMemberCount === null) {
        throw new Error("community_member_workflow_member_count_unknown");
      }
      if (activeMemberCount > 1) {
        throw new Error("community_member_workflow_milestone_has_members");
      }
    }
    const revision = expectedRevision + 1;
    await ctx.db.patch(workflow._id, {
      milestones: workflow.milestones.filter((item) => item.key !== milestoneKey),
      revision,
      updatedByUserId: userId,
      updatedAt: Date.now(),
    });
    return { workflow_id: String(workflow._id), revision };
  },
});

export const getBuilderWorkflowBoardPage = query({
  args: {
    ...managerIdentityArgs,
    communityId: v.id("communities"),
    cursor: v.optional(v.union(v.string(), v.null())),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { community } = await requireWorkflowManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    const workflow = await getCommunityMemberWorkflowByCommunity({
      ctx,
      communityId: args.communityId,
    });
    if (!workflow) {
      return {
        workflow: null,
        page: [],
        continueCursor: null,
        isDone: true,
        totalCount: 0,
      };
    }
    const pageSize = Math.max(
      1,
      Math.min(
        WORKFLOW_BOARD_MAX_PAGE_SIZE,
        Math.floor(args.pageSize ?? WORKFLOW_BOARD_DEFAULT_PAGE_SIZE),
      ),
    );
    const rawPage = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_createdAt", (q: any) =>
        q.eq("communityId", args.communityId),
      )
      .order("asc")
      .paginate({
        cursor: args.cursor ?? null,
        numItems: pageSize,
        maximumRowsRead: pageSize * 3,
      });
    const visibleMemberships = (rawPage.page as CommunityMembershipLike[]).filter(
      (membership) =>
        communityMembershipRowIsActive(membership) &&
        String(membership.userId) !== String(community.ownerId),
    );
    const firstMilestone = workflow.milestones[0];
    if (!firstMilestone) {
      throw new Error("community_member_workflow_milestone_count_invalid");
    }
    const members = await Promise.all(
      visibleMemberships.map(async (membership) => {
        const state = await getMemberMilestone({
          ctx,
          workflowId: workflow._id,
          membershipId: membership._id,
        });
        const milestoneKey = state?.currentMilestoneKey ?? firstMilestone.key;
        if (!workflow.milestones.some((item) => item.key === milestoneKey)) {
          throw new Error("community_member_workflow_member_milestone_invalid");
        }
        const profile = await resolveUserProfileDisplayProjection(ctx, membership.userId);
        return {
          membership_id: String(membership._id),
          current_milestone_key: milestoneKey,
          current_milestone_entered_at: toIsoString(
            state?.milestoneEnteredAt ?? membership.activatedAt ?? membership.createdAt,
          ),
          workflow_completed_at: state?.completedAt
            ? toIsoString(state.completedAt)
            : null,
          display_name: profile.display_name ?? "Member",
          avatar_url: profile.avatar_url,
          avatar_focus_x: profile.avatar_focus_x,
          avatar_focus_y: profile.avatar_focus_y,
          avatar_zoom: profile.avatar_zoom,
        };
      }),
    );
    const activeMemberCount = readCommunityActiveMemberCount(community);
    return {
      workflow: {
        id: String(workflow._id),
        community_id: String(workflow.communityId),
        revision: workflow.revision,
        milestones: workflow.milestones,
        updated_at: toIsoString(workflow.updatedAt),
      },
      page: members,
      continueCursor: rawPage.isDone ? null : rawPage.continueCursor,
      isDone: rawPage.isDone,
      totalCount:
        activeMemberCount === null ? null : Math.max(0, activeMemberCount - 1),
    };
  },
});

export const getBuilderWorkflowBoardProjectionToken = query({
  args: {
    ...managerIdentityArgs,
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const { community } = await requireWorkflowManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    const workflow = await getCommunityMemberWorkflowByCommunity({
      ctx,
      communityId: args.communityId,
    });
    const [latestPass, latestEvaluation] = workflow
      ? await Promise.all([
          ctx.db
            .query("communityMemberWorkflowMilestonePasses")
            .withIndex("by_community_occurredAt", (q: any) =>
              q.eq("communityId", args.communityId),
            )
            .order("desc")
            .first() as Promise<PassRow | null>,
          ctx.db
            .query("communityMemberWorkflowMilestoneEvaluations")
            .withIndex("by_workflow_updatedAt", (q: any) =>
              q.eq("workflowId", workflow._id),
            )
            .order("desc")
            .first() as Promise<EvaluationRow | null>,
        ])
      : [null, null];
    return {
      workflow_id: workflow ? String(workflow._id) : null,
      workflow_revision: workflow?.revision ?? 0,
      active_member_count: readCommunityActiveMemberCount(community),
      latest_pass_id: latestPass ? String(latestPass._id) : null,
      latest_evaluation_id: latestEvaluation ? String(latestEvaluation._id) : null,
      latest_evaluation_updated_at: latestEvaluation?.updatedAt ?? null,
    };
  },
});

async function resolveBuilderWorkflowMemberSuccessDossier(args: {
  ctx: any;
  communityId: any;
  membershipId: any;
}): Promise<CommunityMemberSuccessDossier> {
  const membership = (await args.ctx.db.get(
    args.membershipId,
  )) as CommunityMembershipLike | null;
  if (
    !communityMembershipRowIsActive(membership) ||
    String(membership!.communityId) !== String(args.communityId)
  ) {
    throw new Error("community_member_workflow_member_not_found");
  }
  const workflow = await getCommunityMemberWorkflowByCommunity({
    ctx: args.ctx,
    communityId: args.communityId,
  });
  if (!workflow) throw new Error("community_member_workflow_not_found");
  const state = await getMemberMilestone({
    ctx: args.ctx,
    workflowId: workflow._id,
    membershipId: membership!._id,
  });
  const current = resolveCurrentMilestone({ workflow, membership: membership!, state });
  const currentChecksHash = await milestoneChecksHash(current.milestone);
  const [profile, approvedFacts, recentEvaluations, passRows, eligibleEvidence] = await Promise.all([
    resolveUserProfileDisplayProjection(args.ctx, membership!.userId),
    readMemberFactsForLens(args.ctx, {
      subjectUserId: membership!.userId,
      lens: {
        kind: "founder_admin",
        communityId: String(args.communityId),
      },
      scope: { communityId: args.communityId },
    }),
    args.ctx.db
      .query("communityMemberWorkflowMilestoneEvaluations")
      .withIndex("by_workflow_membership_createdAt", (q: any) =>
        q.eq("workflowId", workflow._id).eq("membershipId", membership!._id),
      )
      .order("desc")
      .take(COMMUNITY_MEMBER_SUCCESS_HISTORY_LIMIT) as Promise<EvaluationRow[]>,
    args.ctx.db
      .query("communityMemberWorkflowMilestonePasses")
      .withIndex("by_workflow_membership_seq", (q: any) =>
        q.eq("workflowId", workflow._id).eq("membershipId", membership!._id),
      )
      .order("desc")
      .take(COMMUNITY_MEMBER_SUCCESS_HISTORY_LIMIT) as Promise<PassRow[]>,
    listEligibleMilestoneEvidence({
      ctx: args.ctx,
      communityId: args.communityId,
      memberUserId: membership!.userId,
      milestoneEnteredAt: current.milestoneEnteredAt,
      evidenceThroughAt: Date.now(),
    }),
  ]);
  const latestEvaluation = recentEvaluations.find(
    (evaluation) =>
      evaluation.milestoneKey === current.milestone.key &&
      evaluation.milestoneEnteredAt === current.milestoneEnteredAt &&
      evaluation.checksHash === currentChecksHash,
  ) ?? null;
  const currentPass = passRows.find(
    (pass) =>
      pass.milestoneKey === current.milestone.key &&
      pass.checksHash === currentChecksHash,
  ) ?? null;
  const passResultByCheck = new Map(
    (currentPass?.checkResults ?? []).map((result) => [result.checkKey, result]),
  );
  const automaticResultByCheck = new Map(
    resolveAutomaticChecks(current.milestone, eligibleEvidence).map((result) => [
      result.checkKey,
      result,
    ]),
  );
  const evaluationResultByCheck = new Map(
    (latestEvaluation?.checkResults ?? []).map((result) => [result.checkKey, result]),
  );
  const checkStatuses = current.milestone.checks.map((check) => {
    const passed = passResultByCheck.get(check.key);
    if (passed) {
      return {
        check_key: check.key,
        type: check.type,
        status: "complete" as const,
        evidence_refs: passed.evidenceRefs,
      };
    }
    if (check.type === "automatic") {
      const result = automaticResultByCheck.get(check.key);
      return {
        check_key: check.key,
        type: check.type,
        status: result?.passed ? "complete" as const : "pending" as const,
        evidence_refs: result?.evidenceRefs ?? [],
      };
    }
    const result = evaluationResultByCheck.get(check.key);
    return {
      check_key: check.key,
      type: check.type,
      status:
        result?.decision === "complete"
          ? "complete" as const
          : result?.decision === "uncertain"
            ? "uncertain" as const
            : "pending" as const,
      evidence_refs: result?.evidenceRefs ?? [],
    };
  });
  const milestoneName = (milestoneKey: string | undefined) =>
    milestoneKey
      ? workflow.milestones.find((item) => item.key === milestoneKey)?.name ?? "Milestone"
      : null;
  return {
    membership_id: String(membership!._id),
    display_name: profile.display_name ?? "Member",
    avatar_url: profile.avatar_url,
    avatar_focus_x: profile.avatar_focus_x,
    avatar_focus_y: profile.avatar_focus_y,
    avatar_zoom: profile.avatar_zoom,
    joined_at: toIsoString(membership!.activatedAt ?? membership!.createdAt),
    workflow: {
      id: String(workflow._id),
      revision: workflow.revision,
      current_milestone_key: current.milestone.key,
      current_milestone_name: current.milestone.name,
      current_milestone_entered_at: toIsoString(current.milestoneEnteredAt),
      completed_at: current.completedAt ? toIsoString(current.completedAt) : null,
      checks: current.milestone.checks,
      check_statuses: checkStatuses,
    },
    approved_community_context: approvedFacts
      .map((fact) => ({ kind: fact.kind, body: fact.body }))
      .sort((left, right) =>
        left.kind === right.kind
          ? left.body.localeCompare(right.body)
          : left.kind.localeCompare(right.kind),
      ),
    latest_evaluation: latestEvaluation
      ? {
          id: String(latestEvaluation._id),
          status: latestEvaluation.status,
          decision: latestEvaluation.decision ?? null,
          evaluator_kind: latestEvaluation.evaluatorKind ?? null,
          explanation: latestEvaluation.explanation ?? null,
          missing_evidence: latestEvaluation.missingEvidence ?? [],
          evidence_refs: latestEvaluation.evidenceRefs ?? [],
          action_kind: latestEvaluation.actionKind,
          check_results: (latestEvaluation.checkResults ?? []).map((result) => ({
            check_key: result.checkKey,
            decision: result.decision,
            evidence_refs: result.evidenceRefs,
            explanation: result.explanation,
            missing_evidence: result.missingEvidence,
          })),
          created_at: toIsoString(latestEvaluation.createdAt),
          finished_at: latestEvaluation.finishedAt
            ? toIsoString(latestEvaluation.finishedAt)
            : null,
        }
      : null,
    milestone_history: passRows
      .slice()
      .reverse()
      .map((pass) => ({
        id: String(pass._id),
        sequence: pass.seq,
        milestone_key: pass.milestoneKey,
        milestone_name: milestoneName(pass.milestoneKey) ?? "Milestone",
        next_milestone_key: pass.nextMilestoneKey ?? null,
        next_milestone_name: milestoneName(pass.nextMilestoneKey),
        completed_workflow: pass.completedWorkflow,
        milestone_evaluation_id: pass.milestoneEvaluationId
          ? String(pass.milestoneEvaluationId)
          : null,
        occurred_at: toIsoString(pass.occurredAt),
      })),
  };
}

export const getBuilderWorkflowMemberSuccessDossier = query({
  args: {
    ...managerIdentityArgs,
    communityId: v.id("communities"),
    membershipId: v.id("communityMemberships"),
  },
  handler: async (ctx, args) => {
    await requireWorkflowManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    const source = await resolveBuilderWorkflowMemberSuccessDossier({
      ctx,
      communityId: args.communityId,
      membershipId: args.membershipId,
    });
    return {
      ...source,
      markdown: renderCommunityMemberSuccessDossierMarkdown(source),
    };
  },
});

async function listEligibleMilestoneEvidence(args: {
  ctx: any;
  communityId: any;
  memberUserId: any;
  milestoneEnteredAt: number;
  evidenceThroughAt: number;
}): Promise<EligibleEvidence[]> {
  const [roots, replies] = await Promise.all([
    args.ctx.db
      .query("communityInteractionRoots")
      .withIndex("by_community_actorUser_createdAt", (q: any) =>
        q
          .eq("communityId", args.communityId)
          .eq("actorUserId", args.memberUserId)
          .gte("createdAt", args.milestoneEnteredAt),
      )
      .order("desc")
      .take(EVALUATION_EVIDENCE_LIMIT_PER_KIND),
    args.ctx.db
      .query("communityInteractionReplies")
      .withIndex("by_community_actorUser_createdAt", (q: any) =>
        q
          .eq("communityId", args.communityId)
          .eq("actorUserId", args.memberUserId)
          .gte("createdAt", args.milestoneEnteredAt),
      )
      .order("desc")
      .take(EVALUATION_EVIDENCE_LIMIT_PER_KIND),
  ]);
  const candidates = [
    ...roots.map((row: any) => ({ objectType: "root" as const, row })),
    ...replies.map((row: any) => ({ objectType: "reply" as const, row })),
  ]
    .filter(({ row }) => row.createdAt <= args.evidenceThroughAt)
    .sort((left, right) => right.row.createdAt - left.row.createdAt)
    .slice(0, COMMUNITY_MEMBER_WORKFLOW_EVIDENCE_REF_MAX_COUNT);
  const resolved = await Promise.all(
    candidates.map(async ({ objectType, row }) => ({
      objectType,
      row,
      source: await resolveCommunityInteractionEvidenceSource({
        ctx: args.ctx,
        communityId: args.communityId,
        objectType,
        objectId: row._id,
      }),
    })),
  );
  return resolved
    .filter(({ row, source }) =>
      Boolean(
        source &&
          communityInteractionEvidenceSourceIsReadable(source) &&
          source.row.actorType === "human" &&
          String(source.row.actorUserId ?? "") === String(args.memberUserId) &&
          source.row.channelId &&
          row.createdAt >= args.milestoneEnteredAt &&
          row.createdAt <= args.evidenceThroughAt,
      ),
    )
    .sort((left, right) => left.row.createdAt - right.row.createdAt)
    .map(({ objectType, row }) => ({
      ref: buildCommunityInteractionEvidenceRef({
        objectType,
        objectId: String(row._id),
      }),
      occurred_at: toIsoString(row.createdAt),
      kind: objectType === "root" ? "channel_root" as const : "channel_reply" as const,
      text: String(row.contentSummary ?? "").trim().slice(0, 4_000),
    }))
    .filter((item) => item.text);
}

function resolveAutomaticChecks(
  milestone: CommunityMemberWorkflowMilestone,
  evidence: EligibleEvidence[],
): AutomaticCheckResult[] {
  return milestone.checks
    .filter((check) => check.type === "automatic")
    .map((check) => {
      const kind = check.signal === "channel_posted" ? "channel_root" : "channel_reply";
      const matches = evidence.filter((item) => item.kind === kind);
      return {
        checkKey: check.key,
        type: "automatic" as const,
        passed: matches.length > 0,
        evidenceRefs: matches.map((item) => item.ref),
      };
    });
}

async function getEvaluationByActionReceipt(args: {
  ctx: any;
  workflowId: any;
  membershipId: any;
  actionReceiptRef: string;
}): Promise<EvaluationRow | null> {
  const rows = (await args.ctx.db
    .query("communityMemberWorkflowMilestoneEvaluations")
    .withIndex("by_workflow_membership_actionReceipt", (q: any) =>
      q
        .eq("workflowId", args.workflowId)
        .eq("membershipId", args.membershipId)
        .eq("actionReceiptRef", args.actionReceiptRef),
    )
    .take(2)) as EvaluationRow[];
  if (rows.length > 1) {
    throw new Error("community_member_workflow_evaluation_ambiguous");
  }
  return rows[0] ?? null;
}

async function getActiveEvaluation(args: {
  ctx: any;
  workflowId: any;
  membershipId: any;
  milestoneKey: string;
  milestoneEnteredAt: number;
  checksHash: string;
}): Promise<EvaluationRow | null> {
  const recent = (await args.ctx.db
    .query("communityMemberWorkflowMilestoneEvaluations")
    .withIndex("by_workflow_membership_createdAt", (q: any) =>
      q.eq("workflowId", args.workflowId).eq("membershipId", args.membershipId),
    )
    .order("desc")
    .take(8)) as EvaluationRow[];
  return recent.find(
    (row) =>
      (row.status === "queued" || row.status === "running") &&
      row.milestoneKey === args.milestoneKey &&
      row.milestoneEnteredAt === args.milestoneEnteredAt &&
      row.checksHash === args.checksHash,
  ) ?? null;
}

async function getPassByEvaluation(args: {
  ctx: any;
  evaluationId: any;
}): Promise<PassRow | null> {
  const rows = (await args.ctx.db
    .query("communityMemberWorkflowMilestonePasses")
    .withIndex("by_milestoneEvaluation", (q: any) =>
      q.eq("milestoneEvaluationId", args.evaluationId),
    )
    .take(2)) as PassRow[];
  if (rows.length > 1) {
    throw new Error("community_member_workflow_milestone_pass_ambiguous");
  }
  return rows[0] ?? null;
}

async function recordMilestonePass(args: {
  ctx: any;
  workflow: WorkflowRow;
  membership: CommunityMembershipLike;
  state: MemberMilestoneRow | null;
  current: ReturnType<typeof resolveCurrentMilestone>;
  checksHash: string;
  evaluationId?: any;
  actionReceiptRef: string;
  completionKind: "automatic" | "judgment" | "composite";
  checkResults: Array<{
    checkKey: string;
    type: "automatic" | "judgment";
    evidenceRefs: string[];
  }>;
  nowMs: number;
}) {
  if (args.current.completedAt) {
    return { status: "already_completed" as const, pass_id: null };
  }
  if (args.evaluationId) {
    const replay = await getPassByEvaluation({
      ctx: args.ctx,
      evaluationId: args.evaluationId,
    });
    if (replay) {
      return {
        status: "complete" as const,
        pass_id: String(replay._id),
        replayed: true,
      };
    }
  }
  const nextMilestone = args.workflow.milestones[args.current.milestoneIndex + 1];
  const completedWorkflow = !nextMilestone;
  const seq = Number(args.state?.transitionSeq ?? 0) + 1;
  if (args.state) {
    await args.ctx.db.patch(args.state._id, {
      currentMilestoneKey: nextMilestone?.key ?? args.current.milestone.key,
      milestoneEnteredAt: nextMilestone ? args.nowMs : args.current.milestoneEnteredAt,
      transitionSeq: seq,
      completedAt: completedWorkflow ? args.nowMs : undefined,
      updatedAt: args.nowMs,
    });
  } else {
    await args.ctx.db.insert("communityMemberWorkflowMemberMilestones", {
      workflowId: args.workflow._id,
      membershipId: args.membership._id,
      currentMilestoneKey: nextMilestone?.key ?? args.current.milestone.key,
      milestoneEnteredAt: nextMilestone ? args.nowMs : args.current.milestoneEnteredAt,
      transitionSeq: seq,
      completedAt: completedWorkflow ? args.nowMs : undefined,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
  }
  const passId = await args.ctx.db.insert(
    "communityMemberWorkflowMilestonePasses",
    {
      communityId: args.workflow.communityId,
      workflowId: args.workflow._id,
      membershipId: args.membership._id,
      seq,
      milestoneKey: args.current.milestone.key,
      nextMilestoneKey: nextMilestone?.key,
      completedWorkflow,
      milestoneEvaluationId: args.evaluationId,
      workflowRevision: args.workflow.revision,
      checksHash: args.checksHash,
      completionKind: args.completionKind,
      checkResults: args.checkResults,
      actionReceiptRef: args.actionReceiptRef,
      occurredAt: args.nowMs,
      createdAt: args.nowMs,
    },
  );
  return {
    status: "complete" as const,
    pass_id: String(passId),
    workflow_completed: completedWorkflow,
    replayed: false,
  };
}

async function handleChannelContributionCore(args: {
  ctx: any;
  objectType: "root" | "reply";
  row: ChannelContributionRow | null;
}) {
  const row = args.row;
  if (!row) return { status: "receipt_missing" as const };
  if (
    row.actorType !== "human" ||
    !row.actorUserId ||
    !row.channelId ||
    row.status !== "live" ||
    (row.visibilityScope !== "community" && row.visibilityScope !== "public")
  ) {
    return { status: "receipt_ineligible" as const };
  }
  const workflow = await getCommunityMemberWorkflowByCommunity({
    ctx: args.ctx,
    communityId: row.communityId,
  });
  if (!workflow || workflow.milestones.length < 1) {
    return { status: "workflow_ineligible" as const };
  }
  const membership = await getUniqueCommunityMembershipByPair({
    ctx: args.ctx,
    communityId: row.communityId,
    userId: row.actorUserId,
  });
  if (!communityMembershipRowIsActive(membership)) {
    return { status: "membership_ineligible" as const };
  }
  const state = await getMemberMilestone({
    ctx: args.ctx,
    workflowId: workflow._id,
    membershipId: membership!._id,
  });
  const current = resolveCurrentMilestone({ workflow, membership: membership!, state });
  if (current.completedAt) return { status: "workflow_completed" as const };
  if (row.createdAt < current.milestoneEnteredAt) {
    return { status: "action_before_milestone" as const };
  }
  if (current.milestone.checks.length === 0) {
    return { status: "milestone_not_configured" as const };
  }
  const actionReceiptRef = normalizeCommunityMemberWorkflowSourceRef(
    buildCommunityInteractionEvidenceRef({
      objectType: args.objectType,
      objectId: String(row._id),
    }),
  );
  const actionKind = args.objectType === "root"
    ? "channel_posted" as const
    : "channel_replied" as const;
  const evidence = await listEligibleMilestoneEvidence({
    ctx: args.ctx,
    communityId: row.communityId,
    memberUserId: membership!.userId,
    milestoneEnteredAt: current.milestoneEnteredAt,
    evidenceThroughAt: row.createdAt,
  });
  const automaticResults = resolveAutomaticChecks(current.milestone, evidence);
  if (automaticResults.some((result) => !result.passed)) {
    return {
      status: "requirements_pending" as const,
      automatic_results: automaticResults,
    };
  }
  const checksHash = await milestoneChecksHash(current.milestone);
  const judgmentChecks = current.milestone.checks.filter(
    (check) => check.type === "judgment",
  );
  if (judgmentChecks.length === 0) {
    return await recordMilestonePass({
      ctx: args.ctx,
      workflow,
      membership: membership!,
      state,
      current,
      checksHash,
      actionReceiptRef,
      completionKind: "automatic",
      checkResults: automaticResults.map((result) => ({
        checkKey: result.checkKey,
        type: result.type,
        evidenceRefs: result.evidenceRefs,
      })),
      nowMs: Date.now(),
    });
  }
  const replay = await getEvaluationByActionReceipt({
    ctx: args.ctx,
    workflowId: workflow._id,
    membershipId: membership!._id,
    actionReceiptRef,
  });
  if (replay) {
    return { status: "already_queued" as const, evaluation_id: String(replay._id) };
  }
  const active = await getActiveEvaluation({
    ctx: args.ctx,
    workflowId: workflow._id,
    membershipId: membership!._id,
    milestoneKey: current.milestone.key,
    milestoneEnteredAt: current.milestoneEnteredAt,
    checksHash,
  });
  if (active) {
    const evidenceThroughAt = Math.max(active.evidenceThroughAt, row.createdAt);
    await args.ctx.db.patch(active._id, {
      evidenceThroughAt,
      actionReceiptRef,
      actionKind,
      rerunRequested:
        active.status === "running" &&
        evidenceThroughAt > Number(active.claimedEvidenceThroughAt ?? active.evidenceThroughAt),
      updatedAt: Date.now(),
    });
    return { status: "coalesced" as const, evaluation_id: String(active._id) };
  }
  const nowMs = Date.now();
  const evaluationId = await args.ctx.db.insert(
    "communityMemberWorkflowMilestoneEvaluations",
    {
      communityId: row.communityId,
      workflowId: workflow._id,
      membershipId: membership!._id,
      milestoneKey: current.milestone.key,
      workflowRevision: workflow.revision,
      milestoneEnteredAt: current.milestoneEnteredAt,
      milestoneName: current.milestone.name,
      checksSnapshot: current.milestone.checks,
      checksHash,
      actionKind,
      actionReceiptRef,
      evidenceWindowStartAt: current.milestoneEnteredAt,
      evidenceThroughAt: row.createdAt,
      evidenceRefs: [],
      status: "queued",
      availableAt: nowMs,
      attempt: 0,
      createdAt: nowMs,
      updatedAt: nowMs,
    },
  );
  await args.ctx.scheduler.runAfter(
    0,
    internal.communityMemberWorkflowEvaluator.runMilestoneEvaluationInternal,
    { evaluationId },
  );
  return { status: "queued" as const, evaluation_id: String(evaluationId) };
}

export const handleChannelContributionRootInternal = internalMutation({
  args: { rootId: v.id("communityInteractionRoots") },
  handler: async (ctx, args) =>
    await handleChannelContributionCore({
      ctx,
      objectType: "root",
      row: await ctx.db.get(args.rootId),
    }),
});

export const handleChannelContributionReplyInternal = internalMutation({
  args: { replyId: v.id("communityInteractionReplies") },
  handler: async (ctx, args) =>
    await handleChannelContributionCore({
      ctx,
      objectType: "reply",
      row: await ctx.db.get(args.replyId),
    }),
});

async function markEvaluationStale(args: {
  ctx: any;
  evaluation: EvaluationRow;
  errorCode: string;
  nowMs: number;
}) {
  await args.ctx.db.patch(args.evaluation._id, {
    status: "stale",
    errorCode: args.errorCode,
    finishedAt: args.nowMs,
    updatedAt: args.nowMs,
    claimToken: undefined,
    leaseExpiresAt: undefined,
    claimedEvidenceThroughAt: undefined,
    rerunRequested: undefined,
  });
}

async function evaluationAuthorityIsCurrent(args: {
  workflow: WorkflowRow;
  membership: CommunityMembershipLike;
  state: MemberMilestoneRow | null;
  evaluation: EvaluationRow;
}) {
  const current = resolveCurrentMilestone({
    workflow: args.workflow,
    membership: args.membership,
    state: args.state,
  });
  const checksHash = await milestoneChecksHash(current.milestone);
  return {
    current,
    checksHash,
    valid:
      !current.completedAt &&
      args.workflow.revision === args.evaluation.workflowRevision &&
      current.milestone.key === args.evaluation.milestoneKey &&
      current.milestoneEnteredAt === args.evaluation.milestoneEnteredAt &&
      checksHash === args.evaluation.checksHash &&
      current.milestone.checks.some((check) => check.type === "judgment"),
  };
}

export const claimMilestoneEvaluationInternal = internalMutation({
  args: { evaluationId: v.id("communityMemberWorkflowMilestoneEvaluations") },
  handler: async (ctx, args) => {
    const evaluation = (await ctx.db.get(args.evaluationId)) as EvaluationRow | null;
    if (!evaluation) return { ok: false, code: "evaluation_missing" as const };
    const nowMs = Date.now();
    if (["finished", "failed", "stale"].includes(evaluation.status)) {
      return { ok: false, code: "evaluation_terminal" as const };
    }
    if (
      evaluation.status === "running" &&
      Number(evaluation.leaseExpiresAt ?? 0) > nowMs
    ) {
      return { ok: false, code: "evaluation_leased" as const };
    }
    if (evaluation.status === "queued" && evaluation.availableAt > nowMs) {
      return { ok: false, code: "evaluation_not_available" as const };
    }
    if (evaluation.attempt >= EVALUATION_MAX_ATTEMPTS) {
      await ctx.db.patch(evaluation._id, {
        status: "failed",
        errorCode: "evaluation_attempts_exhausted",
        finishedAt: nowMs,
        updatedAt: nowMs,
        claimToken: undefined,
        leaseExpiresAt: undefined,
        claimedEvidenceThroughAt: undefined,
        rerunRequested: undefined,
      });
      return { ok: false, code: "evaluation_attempts_exhausted" as const };
    }
    const workflow = (await ctx.db.get(evaluation.workflowId)) as WorkflowRow | null;
    const membership = (await ctx.db.get(
      evaluation.membershipId,
    )) as CommunityMembershipLike | null;
    if (!workflow || !membership || !communityMembershipRowIsActive(membership)) {
      await markEvaluationStale({
        ctx,
        evaluation,
        errorCode: "evaluation_authority_changed",
        nowMs,
      });
      return { ok: false, code: "evaluation_stale" as const };
    }
    const state = await getMemberMilestone({
      ctx,
      workflowId: workflow._id,
      membershipId: membership._id,
    });
    const authority = await evaluationAuthorityIsCurrent({
      workflow,
      membership,
      state,
      evaluation,
    });
    if (!authority.valid) {
      await markEvaluationStale({
        ctx,
        evaluation,
        errorCode: "evaluation_definition_changed",
        nowMs,
      });
      return { ok: false, code: "evaluation_stale" as const };
    }
    const claimToken = crypto.randomUUID();
    const leaseExpiresAt = nowMs + EVALUATION_LEASE_MS;
    const claimedEvidenceThroughAt = evaluation.evidenceThroughAt;
    await ctx.db.patch(evaluation._id, {
      status: "running",
      claimToken,
      leaseExpiresAt,
      claimedEvidenceThroughAt,
      rerunRequested: false,
      attempt: evaluation.attempt + 1,
      errorCode: undefined,
      updatedAt: nowMs,
    });
    await ctx.scheduler.runAfter(
      EVALUATION_LEASE_MS,
      internal.communityMemberWorkflowEvaluator.runMilestoneEvaluationInternal,
      { evaluationId: evaluation._id },
    );
    return {
      ok: true,
      evaluation_id: String(evaluation._id),
      claim_token: claimToken,
    };
  },
});

export const buildMilestoneEvaluationContextInternal = internalQuery({
  args: {
    evaluationId: v.id("communityMemberWorkflowMilestoneEvaluations"),
    claimToken: v.string(),
  },
  handler: async (ctx, args) => {
    const evaluation = (await ctx.db.get(args.evaluationId)) as EvaluationRow | null;
    if (
      !evaluation ||
      evaluation.status !== "running" ||
      evaluation.claimToken !== args.claimToken ||
      !evaluation.claimedEvidenceThroughAt
    ) {
      throw new Error("community_member_workflow_evaluation_claim_invalid");
    }
    const membership = (await ctx.db.get(
      evaluation.membershipId,
    )) as CommunityMembershipLike | null;
    const workflow = (await ctx.db.get(evaluation.workflowId)) as WorkflowRow | null;
    const community = await ctx.db.get(evaluation.communityId);
    if (!membership || !workflow || !community) {
      throw new Error("community_member_workflow_evaluation_context_missing");
    }
    const evidence = await listEligibleMilestoneEvidence({
      ctx,
      communityId: evaluation.communityId,
      memberUserId: membership.userId,
      milestoneEnteredAt: evaluation.milestoneEnteredAt,
      evidenceThroughAt: evaluation.claimedEvidenceThroughAt,
    });
    return {
      evaluation_id: String(evaluation._id),
      community_id: String(evaluation.communityId),
      sponsor_user_id: String(community.ownerId),
      milestone_key: evaluation.milestoneKey,
      milestone_name: evaluation.milestoneName,
      milestone_entered_at: toIsoString(evaluation.milestoneEnteredAt),
      evidence_through_at: toIsoString(evaluation.claimedEvidenceThroughAt),
      checks_hash: evaluation.checksHash,
      judgment_checks: evaluation.checksSnapshot
        .filter((check) => check.type === "judgment")
        .map((check) => ({ key: check.key, criterion: check.criterion })),
      evidence,
    };
  },
});

const judgmentResultValidator = v.object({
  checkKey: v.string(),
  decision: v.union(
    v.literal("complete"),
    v.literal("not_complete"),
    v.literal("uncertain"),
  ),
  evidenceRefs: v.array(v.string()),
  explanation: v.string(),
  missingEvidence: v.array(v.string()),
});

export const finalizeMilestoneEvaluationInternal = internalMutation({
  args: {
    evaluationId: v.id("communityMemberWorkflowMilestoneEvaluations"),
    claimToken: v.string(),
    checkResults: v.array(judgmentResultValidator),
    evaluatorKind: v.union(v.literal("deterministic"), v.literal("model")),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const evaluation = (await ctx.db.get(args.evaluationId)) as EvaluationRow | null;
    if (
      !evaluation ||
      evaluation.status !== "running" ||
      evaluation.claimToken !== args.claimToken ||
      !evaluation.claimedEvidenceThroughAt
    ) {
      throw new Error("community_member_workflow_evaluation_claim_invalid");
    }
    if (
      evaluation.rerunRequested &&
      evaluation.evidenceThroughAt > evaluation.claimedEvidenceThroughAt
    ) {
      await ctx.db.patch(evaluation._id, {
        status: "queued",
        availableAt: args.nowMs,
        attempt: 0,
        claimToken: undefined,
        leaseExpiresAt: undefined,
        claimedEvidenceThroughAt: undefined,
        rerunRequested: false,
        updatedAt: args.nowMs,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.communityMemberWorkflowEvaluator.runMilestoneEvaluationInternal,
        { evaluationId: evaluation._id },
      );
      return { status: "queued" as const, pass_id: null };
    }
    const workflow = (await ctx.db.get(evaluation.workflowId)) as WorkflowRow | null;
    const membership = (await ctx.db.get(
      evaluation.membershipId,
    )) as CommunityMembershipLike | null;
    if (!workflow || !membership || !communityMembershipRowIsActive(membership)) {
      await markEvaluationStale({
        ctx,
        evaluation,
        errorCode: "evaluation_authority_changed",
        nowMs: args.nowMs,
      });
      return { status: "stale" as const, pass_id: null };
    }
    const state = await getMemberMilestone({
      ctx,
      workflowId: workflow._id,
      membershipId: membership._id,
    });
    const authority = await evaluationAuthorityIsCurrent({
      workflow,
      membership,
      state,
      evaluation,
    });
    if (!authority.valid) {
      await markEvaluationStale({
        ctx,
        evaluation,
        errorCode: "evaluation_definition_changed",
        nowMs: args.nowMs,
      });
      return { status: "stale" as const, pass_id: null };
    }
    const judgmentChecks = authority.current.milestone.checks.filter(
      (check) => check.type === "judgment",
    );
    if (
      args.checkResults.length !== judgmentChecks.length ||
      args.checkResults.some((result, index) => result.checkKey !== judgmentChecks[index].key)
    ) {
      throw new Error("community_member_workflow_evaluation_check_invalid");
    }
    const eligibleEvidence = await listEligibleMilestoneEvidence({
      ctx,
      communityId: evaluation.communityId,
      memberUserId: membership.userId,
      milestoneEnteredAt: evaluation.milestoneEnteredAt,
      evidenceThroughAt: evaluation.claimedEvidenceThroughAt,
    });
    const eligibleRefs = new Set(eligibleEvidence.map((item) => item.ref));
    const normalizedResults = args.checkResults.map((result) => {
      const evidenceRefs = Array.from(
        new Set(
          result.evidenceRefs
            .map(normalizeCommunityMemberWorkflowSourceRef)
            .slice(0, COMMUNITY_MEMBER_WORKFLOW_EVIDENCE_REF_MAX_COUNT),
        ),
      );
      if (evidenceRefs.some((ref) => !eligibleRefs.has(ref))) {
        throw new Error("community_member_workflow_evaluation_evidence_invalid");
      }
      if (result.decision === "complete" && evidenceRefs.length === 0) {
        throw new Error("community_member_workflow_evaluation_evidence_required");
      }
      const explanation = String(result.explanation ?? "").trim().slice(0, 2_000);
      if (!explanation) {
        throw new Error("community_member_workflow_evaluation_explanation_required");
      }
      return {
        checkKey: normalizeCommunityMemberWorkflowCheckKey(result.checkKey),
        decision: result.decision,
        evidenceRefs,
        explanation,
        missingEvidence: result.missingEvidence
          .map((value) => String(value ?? "").trim().slice(0, 500))
          .filter(Boolean)
          .slice(0, 12),
      };
    });
    const automaticResults = resolveAutomaticChecks(
      authority.current.milestone,
      eligibleEvidence,
    );
    const automaticComplete = automaticResults.every((result) => result.passed);
    const judgmentComplete = normalizedResults.every(
      (result) => result.decision === "complete",
    );
    const decision = automaticComplete && judgmentComplete
      ? "complete" as const
      : normalizedResults.some((result) => result.decision === "not_complete")
        ? "not_complete" as const
        : "uncertain" as const;
    const evidenceRefs = Array.from(
      new Set(normalizedResults.flatMap((result) => result.evidenceRefs)),
    );
    const missingEvidence = Array.from(
      new Set(normalizedResults.flatMap((result) => result.missingEvidence)),
    ).slice(0, 12);
    const explanation = normalizedResults
      .map((result) => result.explanation)
      .filter(Boolean)
      .join(" ")
      .slice(0, 2_000);
    await ctx.db.patch(evaluation._id, {
      status: "finished",
      decision,
      evaluatorKind: args.evaluatorKind,
      checkResults: normalizedResults,
      evidenceRefs,
      explanation,
      missingEvidence,
      finishedAt: args.nowMs,
      updatedAt: args.nowMs,
      claimToken: undefined,
      leaseExpiresAt: undefined,
      claimedEvidenceThroughAt: undefined,
      rerunRequested: undefined,
      errorCode: undefined,
    });
    if (decision !== "complete") {
      return { status: decision, pass_id: null };
    }
    const completionKind = automaticResults.length > 0
      ? "composite" as const
      : "judgment" as const;
    return await recordMilestonePass({
      ctx,
      workflow,
      membership,
      state,
      current: authority.current,
      checksHash: authority.checksHash,
      evaluationId: evaluation._id,
      actionReceiptRef: evaluation.actionReceiptRef,
      completionKind,
      checkResults: [
        ...automaticResults.map((result) => ({
          checkKey: result.checkKey,
          type: result.type,
          evidenceRefs: result.evidenceRefs,
        })),
        ...normalizedResults.map((result) => ({
          checkKey: result.checkKey,
          type: "judgment" as const,
          evidenceRefs: result.evidenceRefs,
        })),
      ],
      nowMs: args.nowMs,
    });
  },
});

export const failMilestoneEvaluationInternal = internalMutation({
  args: {
    evaluationId: v.id("communityMemberWorkflowMilestoneEvaluations"),
    claimToken: v.string(),
    errorCode: v.string(),
    retryable: v.boolean(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const evaluation = (await ctx.db.get(args.evaluationId)) as EvaluationRow | null;
    if (
      !evaluation ||
      evaluation.status !== "running" ||
      evaluation.claimToken !== args.claimToken
    ) {
      return { status: "claim_changed" as const };
    }
    const retry = args.retryable && evaluation.attempt < EVALUATION_MAX_ATTEMPTS;
    const availableAt = args.nowMs + Math.max(1_000, evaluation.attempt * 5_000);
    await ctx.db.patch(evaluation._id, {
      status: retry ? "queued" : "failed",
      availableAt: retry ? availableAt : evaluation.availableAt,
      errorCode: String(args.errorCode ?? "evaluation_failed").trim().slice(0, 120),
      finishedAt: retry ? undefined : args.nowMs,
      updatedAt: args.nowMs,
      claimToken: undefined,
      leaseExpiresAt: undefined,
      claimedEvidenceThroughAt: undefined,
      rerunRequested: undefined,
    });
    if (retry) {
      await ctx.scheduler.runAfter(
        Math.max(0, availableAt - args.nowMs),
        internal.communityMemberWorkflowEvaluator.runMilestoneEvaluationInternal,
        { evaluationId: evaluation._id },
      );
    }
    return { status: retry ? "queued" as const : "failed" as const };
  },
});
