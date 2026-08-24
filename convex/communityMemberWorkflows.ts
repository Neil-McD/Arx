import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  COMMUNITY_MEMBER_WORKFLOW_MAX_STAGES,
  COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES,
  COMMUNITY_MEMBER_WORKFLOW_EVIDENCE_REF_MAX_COUNT,
  normalizeCommunityMemberWorkflowMilestone,
  normalizeCommunityMemberWorkflowSourceRef,
  normalizeCommunityMemberWorkflowStageKey,
  normalizeCommunityMemberWorkflowStageName,
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

const managerIdentityArgs = {
  userId: v.optional(v.id("users")),
  authSubject: v.optional(v.string()),
};

const WORKFLOW_BOARD_DEFAULT_PAGE_SIZE = 50;
const WORKFLOW_BOARD_MAX_PAGE_SIZE = 100;

type WorkflowRow = Doc<"communityMemberWorkflows">;
type MemberStageRow = Doc<"communityMemberWorkflowMemberStages">;
type EvaluationRow = Doc<"communityMemberWorkflowMilestoneEvaluations">;
type TransitionRow = Doc<"communityMemberWorkflowTransitions">;
type ChannelContributionRow =
  | Doc<"communityInteractionRoots">
  | Doc<"communityInteractionReplies">;

const EVALUATION_LEASE_MS = 10 * 60_000;
const EVALUATION_MAX_ATTEMPTS = 3;
const EVALUATION_EVIDENCE_LIMIT_PER_KIND = 100;

async function sha256HexText(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
    .query("communityMemberWorkflows" as any)
    .withIndex("by_community", (q: any) =>
      q.eq("communityId", args.communityId),
    )
    .take(2)) as WorkflowRow[];
  if (rows.length > 1) {
    throw new Error("community_member_workflow_ambiguous");
  }
  return rows[0] ?? null;
}

async function getMemberStage(args: {
  ctx: any;
  workflowId: any;
  membershipId: any;
}): Promise<MemberStageRow | null> {
  const rows = (await args.ctx.db
    .query("communityMemberWorkflowMemberStages" as any)
    .withIndex("by_workflow_membership", (q: any) =>
      q
        .eq("workflowId", args.workflowId)
        .eq("membershipId", args.membershipId),
    )
    .take(2)) as MemberStageRow[];
  if (rows.length > 1) {
    throw new Error("community_member_workflow_member_stage_ambiguous");
  }
  return rows[0] ?? null;
}

function nextWorkflowStageKey(stages: Array<{ key: string }>): string {
  const existing = new Set(stages.map((stage) => stage.key));
  for (;;) {
    const candidate = `stage-${crypto.randomUUID()}`;
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

async function getTransitionByMilestoneEvaluation(args: {
  ctx: any;
  milestoneEvaluationId: any;
}): Promise<TransitionRow | null> {
  const rows = (await args.ctx.db
    .query("communityMemberWorkflowTransitions" as any)
    .withIndex("by_milestoneEvaluation", (q: any) =>
      q.eq("milestoneEvaluationId", args.milestoneEvaluationId),
    )
    .take(2)) as TransitionRow[];
  if (rows.length > 1) {
    throw new Error("community_member_workflow_transition_ambiguous");
  }
  return rows[0] ?? null;
}

export const createBuilderWorkflowStage = mutation({
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
    const name = normalizeCommunityMemberWorkflowStageName(args.name);
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
      const stage = { key: nextWorkflowStageKey([]), name };
      const workflowId = await ctx.db.insert(
        "communityMemberWorkflows" as any,
        {
          communityId: args.communityId,
          stages: [stage],
          revision: 1,
          createdByUserId: userId,
          updatedByUserId: userId,
          createdAt: nowMs,
          updatedAt: nowMs,
        },
      );
      return { workflow_id: String(workflowId), revision: 1, stage };
    }
    requireWorkflowRevision(existing, expectedRevision);
    if (existing.stages.length >= COMMUNITY_MEMBER_WORKFLOW_MAX_STAGES) {
      throw new Error("community_member_workflow_stage_count_invalid");
    }
    const stage = { key: nextWorkflowStageKey(existing.stages), name };
    const revision = expectedRevision + 1;
    await ctx.db.patch(existing._id, {
      stages: [...existing.stages, stage],
      revision,
      updatedByUserId: userId,
      updatedAt: nowMs,
    });
    return { workflow_id: String(existing._id), revision, stage };
  },
});

export const updateBuilderWorkflowStage = mutation({
  args: {
    ...managerIdentityArgs,
    communityId: v.id("communities"),
    expectedRevision: v.number(),
    stageKey: v.string(),
    name: v.string(),
    milestone: v.union(v.string(), v.null()),
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
      await getCommunityMemberWorkflowByCommunity({
        ctx,
        communityId: args.communityId,
      }),
      expectedRevision,
    );
    const stageKey = normalizeCommunityMemberWorkflowStageKey(args.stageKey);
    const stageIndex = workflow.stages.findIndex(
      (stage) => stage.key === stageKey,
    );
    if (stageIndex < 0) {
      throw new Error("community_member_workflow_stage_invalid");
    }
    const name = normalizeCommunityMemberWorkflowStageName(args.name);
    const milestone = normalizeCommunityMemberWorkflowMilestone(args.milestone);
    if (milestone && stageIndex === workflow.stages.length - 1) {
      throw new Error("community_member_workflow_terminal_stage_milestone_invalid");
    }
    const existingStage = workflow.stages[stageIndex];
    if (
      existingStage.name === name &&
      (existingStage.milestone ?? null) === milestone
    ) {
      return {
        workflow_id: String(workflow._id),
        revision: expectedRevision,
        stage: existingStage,
      };
    }
    const stages = workflow.stages.map((stage, index) =>
      index === stageIndex
        ? {
            key: stage.key,
            name,
            ...(milestone ? { milestone } : {}),
          }
        : stage,
    );
    const revision = expectedRevision + 1;
    const nowMs = Date.now();
    await ctx.db.patch(workflow._id, {
      stages,
      revision,
      updatedByUserId: userId,
      updatedAt: nowMs,
    });
    return {
      workflow_id: String(workflow._id),
      revision,
      stage: stages[stageIndex],
    };
  },
});

export const deleteBuilderWorkflowStage = mutation({
  args: {
    ...managerIdentityArgs,
    communityId: v.id("communities"),
    expectedRevision: v.number(),
    stageKey: v.string(),
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
      await getCommunityMemberWorkflowByCommunity({
        ctx,
        communityId: args.communityId,
      }),
      expectedRevision,
    );
    if (workflow.stages.length <= COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES) {
      throw new Error("community_member_workflow_stage_count_invalid");
    }
    const stageKey = normalizeCommunityMemberWorkflowStageKey(args.stageKey);
    const stageIndex = workflow.stages.findIndex(
      (stage) => stage.key === stageKey,
    );
    if (stageIndex < 0) {
      throw new Error("community_member_workflow_stage_invalid");
    }
    const occupied = await ctx.db
      .query("communityMemberWorkflowMemberStages" as any)
      .withIndex("by_workflow_stage", (q: any) =>
        q.eq("workflowId", workflow._id).eq("currentStageKey", stageKey),
      )
      .first();
    if (occupied) {
      throw new Error("community_member_workflow_stage_has_members");
    }
    if (stageIndex === 0) {
      const activeMemberCount = readCommunityActiveMemberCount(community);
      if (activeMemberCount === null) {
        throw new Error("community_member_workflow_member_count_unknown");
      }
      if (activeMemberCount > 1) {
        throw new Error("community_member_workflow_stage_has_members");
      }
    }
    const revision = expectedRevision + 1;
    const nowMs = Date.now();
    const remainingStages = workflow.stages.filter(
      (stage) => stage.key !== stageKey,
    );
    const stages = remainingStages.map((stage, index) =>
      index === remainingStages.length - 1
        ? { key: stage.key, name: stage.name }
        : stage,
    );
    await ctx.db.patch(workflow._id, {
      stages,
      revision,
      updatedByUserId: userId,
      updatedAt: nowMs,
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
    const firstStage = workflow.stages[0];
    if (!firstStage) {
      throw new Error("community_member_workflow_stage_count_invalid");
    }

    const members = await Promise.all(
      visibleMemberships.map(async (membership) => {
        const state = await getMemberStage({
          ctx,
          workflowId: workflow._id,
          membershipId: membership._id,
        });
        const stageKey = state?.currentStageKey ?? firstStage.key;
        if (!workflow.stages.some((stage) => stage.key === stageKey)) {
          throw new Error("community_member_workflow_member_stage_invalid");
        }
        const profile = await resolveUserProfileDisplayProjection(
          ctx,
          membership.userId,
        );
        return {
          membership_id: String(membership._id),
          current_stage_key: stageKey,
          current_stage_entered_at: toIsoString(
            state?.stageEnteredAt ??
              membership.activatedAt ??
              membership.createdAt,
          ),
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
        stages: workflow.stages,
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
    const latestTransition = workflow
      ? ((await ctx.db
          .query("communityMemberWorkflowTransitions" as any)
          .withIndex("by_community_occurredAt", (q: any) =>
            q.eq("communityId", args.communityId),
          )
          .order("desc")
          .first()) as TransitionRow | null)
      : null;

    return {
      workflow_id: workflow ? String(workflow._id) : null,
      workflow_revision: workflow?.revision ?? 0,
      active_member_count: readCommunityActiveMemberCount(community),
      latest_transition_id: latestTransition
        ? String(latestTransition._id)
        : null,
    };
  },
});

async function getEvaluationByWakeReceipt(args: {
  ctx: any;
  workflowId: any;
  membershipId: any;
  wakeReceiptRef: string;
}): Promise<EvaluationRow | null> {
  const rows = (await args.ctx.db
    .query("communityMemberWorkflowMilestoneEvaluations" as any)
    .withIndex("by_workflow_membership_wakeReceipt", (q: any) =>
      q
        .eq("workflowId", args.workflowId)
        .eq("membershipId", args.membershipId)
        .eq("wakeReceiptRef", args.wakeReceiptRef),
    )
    .take(2)) as EvaluationRow[];
  if (rows.length > 1) {
    throw new Error("community_member_workflow_evaluation_ambiguous");
  }
  return rows[0] ?? null;
}

function resolveCurrentStage(args: {
  workflow: WorkflowRow;
  membership: CommunityMembershipLike;
  state: MemberStageRow | null;
}) {
  const currentStageKey = args.state?.currentStageKey ?? args.workflow.stages[0]?.key;
  const stageIndex = args.workflow.stages.findIndex(
    (stage) => stage.key === currentStageKey,
  );
  if (stageIndex < 0) {
    throw new Error("community_member_workflow_member_stage_invalid");
  }
  return {
    stage: args.workflow.stages[stageIndex],
    stageIndex,
    stageEnteredAt:
      args.state?.stageEnteredAt ??
      args.membership.activatedAt ??
      args.membership.createdAt,
  };
}

async function listEligibleMilestoneEvidence(args: {
  ctx: any;
  evaluation: EvaluationRow;
  membership: CommunityMembershipLike;
}) {
  const [roots, replies] = await Promise.all([
    args.ctx.db
      .query("communityInteractionRoots")
      .withIndex("by_community_actorUser_createdAt", (q: any) =>
        q
          .eq("communityId", args.evaluation.communityId)
          .eq("actorUserId", args.membership.userId)
          .gte("createdAt", args.evaluation.evidenceWindowStartAt),
      )
      .order("desc")
      .take(EVALUATION_EVIDENCE_LIMIT_PER_KIND),
    args.ctx.db
      .query("communityInteractionReplies")
      .withIndex("by_community_actorUser_createdAt", (q: any) =>
        q
          .eq("communityId", args.evaluation.communityId)
          .eq("actorUserId", args.membership.userId)
          .gte("createdAt", args.evaluation.evidenceWindowStartAt),
      )
      .order("desc")
      .take(EVALUATION_EVIDENCE_LIMIT_PER_KIND),
  ]);
  const candidates = [
    ...roots.map((row: any) => ({ objectType: "root" as const, row })),
    ...replies.map((row: any) => ({ objectType: "reply" as const, row })),
  ]
    .filter(({ row }) => row.createdAt <= args.evaluation.evidenceThroughAt)
    .sort((left, right) => right.row.createdAt - left.row.createdAt)
    .slice(0, COMMUNITY_MEMBER_WORKFLOW_EVIDENCE_REF_MAX_COUNT);
  const resolved = await Promise.all(
    candidates.map(async ({ objectType, row }) => ({
      objectType,
      row,
      source: await resolveCommunityInteractionEvidenceSource({
        ctx: args.ctx,
        communityId: args.evaluation.communityId,
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
          String(source.row.actorUserId ?? "") === String(args.membership.userId) &&
          source.row.channelId &&
          row.createdAt >= args.evaluation.evidenceWindowStartAt &&
          row.createdAt <= args.evaluation.evidenceThroughAt,
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
    .filter((row) => row.text);
}

async function enqueueChannelContributionEvaluationCore(args: {
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
  if (!workflow || workflow.stages.length < 2) {
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

  const wakeReceiptRef = normalizeCommunityMemberWorkflowSourceRef(
    buildCommunityInteractionEvidenceRef({
      objectType: args.objectType,
      objectId: String(row._id),
    }),
  );
  const replay = await getEvaluationByWakeReceipt({
    ctx: args.ctx,
    workflowId: workflow._id,
    membershipId: membership!._id,
    wakeReceiptRef,
  });
  if (replay) {
    return {
      status: "already_queued" as const,
      evaluation_id: String(replay._id),
    };
  }

  const state = await getMemberStage({
    ctx: args.ctx,
    workflowId: workflow._id,
    membershipId: membership!._id,
  });
  const current = resolveCurrentStage({ workflow, membership: membership!, state });
  const milestone = normalizeCommunityMemberWorkflowMilestone(
    current.stage.milestone,
  );
  if (!workflow.stages[current.stageIndex + 1] || !milestone) {
    return { status: "milestone_not_configured" as const };
  }
  const milestoneHash = await sha256HexText(milestone);
  const nowMs = Date.now();
  const evaluationId = await args.ctx.db.insert(
    "communityMemberWorkflowMilestoneEvaluations" as any,
    {
      communityId: row.communityId,
      workflowId: workflow._id,
      membershipId: membership!._id,
      stageKey: current.stage.key,
      workflowRevision: workflow.revision,
      stageEnteredAt: current.stageEnteredAt,
      milestoneText: milestone,
      milestoneHash,
      wakeKind: "in_app",
      wakeReceiptRef,
      evidenceWindowStartAt: current.stageEnteredAt,
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
    (internal as any).communityMemberWorkflowEvaluator
      .runMilestoneEvaluationInternal,
    { evaluationId },
  );
  return {
    status: "queued" as const,
    evaluation_id: String(evaluationId),
  };
}

export const enqueueChannelContributionRootEvaluationInternal = internalMutation({
  args: { rootId: v.id("communityInteractionRoots") },
  handler: async (ctx, args) =>
    await enqueueChannelContributionEvaluationCore({
      ctx,
      objectType: "root",
      row: await ctx.db.get(args.rootId),
    }),
});

export const enqueueChannelContributionReplyEvaluationInternal = internalMutation({
  args: { replyId: v.id("communityInteractionReplies") },
  handler: async (ctx, args) =>
    await enqueueChannelContributionEvaluationCore({
      ctx,
      objectType: "reply",
      row: await ctx.db.get(args.replyId),
    }),
});

export const claimMilestoneEvaluationInternal = internalMutation({
  args: { evaluationId: v.id("communityMemberWorkflowMilestoneEvaluations") },
  handler: async (ctx, args) => {
    const evaluation = (await ctx.db.get(args.evaluationId)) as EvaluationRow | null;
    if (!evaluation) return { ok: false, code: "evaluation_missing" as const };
    const nowMs = Date.now();
    if (
      evaluation.status === "finished" ||
      evaluation.status === "failed" ||
      evaluation.status === "stale"
    ) {
      return { ok: false, code: "evaluation_terminal" as const };
    }
    if (
      evaluation.status === "running" &&
      Number(evaluation.leaseExpiresAt ?? 0) > nowMs
    ) {
      return { ok: false, code: "evaluation_leased" as const };
    }
    if (
      evaluation.status === "queued" &&
      Number(evaluation.availableAt) > nowMs
    ) {
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
      });
      return { ok: false, code: "evaluation_attempts_exhausted" as const };
    }
    const workflow = (await ctx.db.get(evaluation.workflowId)) as WorkflowRow | null;
    const membership = (await ctx.db.get(
      evaluation.membershipId,
    )) as CommunityMembershipLike | null;
    if (
      !workflow ||
      !membership ||
      !communityMembershipRowIsActive(membership)
    ) {
      await ctx.db.patch(evaluation._id, {
        status: "stale",
        errorCode: "evaluation_authority_changed",
        finishedAt: nowMs,
        updatedAt: nowMs,
      });
      return { ok: false, code: "evaluation_stale" as const };
    }
    const state = await getMemberStage({
      ctx,
      workflowId: workflow._id,
      membershipId: membership._id,
    });
    const current = resolveCurrentStage({ workflow, membership, state });
    const milestone = normalizeCommunityMemberWorkflowMilestone(
      current.stage.milestone,
    );
    const milestoneHash = milestone ? await sha256HexText(milestone) : null;
    if (
      workflow.revision !== evaluation.workflowRevision ||
      current.stage.key !== evaluation.stageKey ||
      current.stageEnteredAt !== evaluation.stageEnteredAt ||
      milestoneHash !== evaluation.milestoneHash ||
      !workflow.stages[current.stageIndex + 1]
    ) {
      await ctx.db.patch(evaluation._id, {
        status: "stale",
        errorCode: "evaluation_definition_changed",
        finishedAt: nowMs,
        updatedAt: nowMs,
      });
      return { ok: false, code: "evaluation_stale" as const };
    }
    const claimToken = crypto.randomUUID();
    const leaseExpiresAt = nowMs + EVALUATION_LEASE_MS;
    await ctx.db.patch(evaluation._id, {
      status: "running",
      claimToken,
      leaseExpiresAt,
      attempt: evaluation.attempt + 1,
      errorCode: undefined,
      updatedAt: nowMs,
    });
    await ctx.scheduler.runAfter(
      EVALUATION_LEASE_MS,
      (internal as any).communityMemberWorkflowEvaluator
        .runMilestoneEvaluationInternal,
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
      evaluation.claimToken !== args.claimToken
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
      evaluation,
      membership,
    });
    return {
      evaluation_id: String(evaluation._id),
      community_id: String(evaluation.communityId),
      sponsor_user_id: String((community as any).ownerId),
      stage_key: evaluation.stageKey,
      stage_name:
        workflow.stages.find((stage) => stage.key === evaluation.stageKey)?.name ??
        "Stage",
      stage_entered_at: toIsoString(evaluation.stageEnteredAt),
      evidence_through_at: toIsoString(evaluation.evidenceThroughAt),
      milestone: evaluation.milestoneText,
      milestone_hash: evaluation.milestoneHash,
      evidence,
    };
  },
});

export const finalizeMilestoneEvaluationInternal = internalMutation({
  args: {
    evaluationId: v.id("communityMemberWorkflowMilestoneEvaluations"),
    claimToken: v.string(),
    decision: v.union(
      v.literal("complete"),
      v.literal("not_complete"),
      v.literal("uncertain"),
    ),
    evaluatorKind: v.union(
      v.literal("deterministic"),
      v.literal("model"),
    ),
    evidenceRefs: v.array(v.string()),
    explanation: v.string(),
    missingEvidence: v.array(v.string()),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const evaluation = (await ctx.db.get(args.evaluationId)) as EvaluationRow | null;
    if (
      !evaluation ||
      evaluation.status !== "running" ||
      evaluation.claimToken !== args.claimToken
    ) {
      throw new Error("community_member_workflow_evaluation_claim_invalid");
    }
    const workflow = (await ctx.db.get(evaluation.workflowId)) as WorkflowRow | null;
    const membership = (await ctx.db.get(
      evaluation.membershipId,
    )) as CommunityMembershipLike | null;
    if (!workflow || !membership || !communityMembershipRowIsActive(membership)) {
      await ctx.db.patch(evaluation._id, {
        status: "stale",
        errorCode: "evaluation_authority_changed",
        finishedAt: args.nowMs,
        updatedAt: args.nowMs,
        claimToken: undefined,
        leaseExpiresAt: undefined,
      });
      return { status: "stale" as const, transition_id: null };
    }
    const state = await getMemberStage({
      ctx,
      workflowId: workflow._id,
      membershipId: membership._id,
    });
    const current = resolveCurrentStage({ workflow, membership, state });
    const milestone = normalizeCommunityMemberWorkflowMilestone(
      current.stage.milestone,
    );
    const milestoneHash = milestone ? await sha256HexText(milestone) : null;
    if (
      workflow.revision !== evaluation.workflowRevision ||
      current.stage.key !== evaluation.stageKey ||
      current.stageEnteredAt !== evaluation.stageEnteredAt ||
      milestoneHash !== evaluation.milestoneHash ||
      !workflow.stages[current.stageIndex + 1]
    ) {
      await ctx.db.patch(evaluation._id, {
        status: "stale",
        errorCode: "evaluation_definition_changed",
        finishedAt: args.nowMs,
        updatedAt: args.nowMs,
        claimToken: undefined,
        leaseExpiresAt: undefined,
      });
      return { status: "stale" as const, transition_id: null };
    }
    const evidenceRefs = Array.from(
      new Set(
        args.evidenceRefs
          .map((value) => normalizeCommunityMemberWorkflowSourceRef(value))
          .slice(0, COMMUNITY_MEMBER_WORKFLOW_EVIDENCE_REF_MAX_COUNT),
      ),
    );
    if (args.decision === "complete" && evidenceRefs.length === 0) {
      throw new Error("community_member_workflow_evaluation_evidence_required");
    }
    const eligibleEvidence = await listEligibleMilestoneEvidence({
      ctx,
      evaluation,
      membership,
    });
    const eligibleEvidenceRefs = new Set<string>(
      eligibleEvidence.map((item) => item.ref),
    );
    if (evidenceRefs.some((ref) => !eligibleEvidenceRefs.has(ref))) {
      throw new Error("community_member_workflow_evaluation_evidence_invalid");
    }
    const explanation = String(args.explanation ?? "").trim().slice(0, 2_000);
    if (!explanation) {
      throw new Error("community_member_workflow_evaluation_explanation_required");
    }
    await ctx.db.patch(evaluation._id, {
      status: "finished",
      decision: args.decision,
      evaluatorKind: args.evaluatorKind,
      evidenceRefs,
      explanation,
      missingEvidence: args.missingEvidence
        .map((value) => String(value ?? "").trim().slice(0, 500))
        .filter(Boolean)
        .slice(0, 12),
      finishedAt: args.nowMs,
      updatedAt: args.nowMs,
      claimToken: undefined,
      leaseExpiresAt: undefined,
      errorCode: undefined,
    });
    if (args.decision !== "complete") {
      return { status: args.decision, transition_id: null };
    }
    const replay = await getTransitionByMilestoneEvaluation({
      ctx,
      milestoneEvaluationId: evaluation._id,
    });
    if (replay) {
      return {
        status: "complete" as const,
        transition_id: String(replay._id),
        replayed: true,
      };
    }
    const targetStage = workflow.stages[current.stageIndex + 1];
    if (!targetStage) {
      throw new Error("community_member_workflow_next_stage_missing");
    }
    const seq = Number(state?.transitionSeq ?? 0) + 1;
    if (state) {
      await ctx.db.patch(state._id, {
        currentStageKey: targetStage.key,
        stageEnteredAt: args.nowMs,
        transitionSeq: seq,
        updatedAt: args.nowMs,
      });
    } else {
      await ctx.db.insert("communityMemberWorkflowMemberStages" as any, {
        workflowId: workflow._id,
        membershipId: membership._id,
        currentStageKey: targetStage.key,
        stageEnteredAt: args.nowMs,
        transitionSeq: seq,
        createdAt: args.nowMs,
        updatedAt: args.nowMs,
      });
    }
    const transitionId = await ctx.db.insert(
      "communityMemberWorkflowTransitions" as any,
      {
        communityId: evaluation.communityId,
        workflowId: workflow._id,
        membershipId: membership._id,
        seq,
        fromStageKey: current.stage.key,
        toStageKey: targetStage.key,
        milestoneEvaluationId: evaluation._id,
        workflowRevision: evaluation.workflowRevision,
        milestoneHash: evaluation.milestoneHash,
        occurredAt: args.nowMs,
        createdAt: args.nowMs,
      },
    );
    return {
      status: "complete" as const,
      transition_id: String(transitionId),
      replayed: false,
    };
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
    });
    if (retry) {
      await ctx.scheduler.runAfter(
        Math.max(0, availableAt - args.nowMs),
        (internal as any).communityMemberWorkflowEvaluator
          .runMilestoneEvaluationInternal,
        { evaluationId: evaluation._id },
      );
    }
    return { status: retry ? "queued" as const : "failed" as const };
  },
});
