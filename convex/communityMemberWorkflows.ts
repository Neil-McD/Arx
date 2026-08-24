import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  COMMUNITY_MEMBER_WORKFLOW_MAX_STAGES,
  COMMUNITY_MEMBER_WORKFLOW_MIN_STAGES,
  normalizeCommunityMemberWorkflowSourceRef,
  normalizeCommunityMemberWorkflowStageKey,
  normalizeCommunityMemberWorkflowStageName,
  type CommunityMemberWorkflowTriggerType,
} from "../shared/communityMemberWorkflow";
import {
  communityMembershipRowIsActive,
  readCommunityActiveMemberCount,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
  type CommunityMembershipLike,
} from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";

const workflowTriggerValidator = v.union(
  v.literal("in_app"),
  v.literal("time"),
  v.literal("external"),
);

const managerIdentityArgs = {
  userId: v.optional(v.id("users")),
  authSubject: v.optional(v.string()),
};

const WORKFLOW_BOARD_DEFAULT_PAGE_SIZE = 50;
const WORKFLOW_BOARD_MAX_PAGE_SIZE = 100;

type WorkflowRow = Doc<"communityMemberWorkflows">;
type MemberStageRow = Doc<"communityMemberWorkflowMemberStages">;

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

function requireSourceReceiptRefForTrigger(
  triggerType: CommunityMemberWorkflowTriggerType,
  value: unknown,
): string {
  const sourceReceiptRef = normalizeCommunityMemberWorkflowSourceRef(value);
  if (!sourceReceiptRef.startsWith(`${triggerType}:`)) {
    throw new Error("community_member_workflow_source_ref_type_mismatch");
  }
  return sourceReceiptRef;
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

export const renameBuilderWorkflowStage = mutation({
  args: {
    ...managerIdentityArgs,
    communityId: v.id("communities"),
    expectedRevision: v.number(),
    stageKey: v.string(),
    name: v.string(),
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
    if (workflow.stages[stageIndex].name === name) {
      return {
        workflow_id: String(workflow._id),
        revision: expectedRevision,
        stage: workflow.stages[stageIndex],
      };
    }
    const stages = workflow.stages.map((stage, index) =>
      index === stageIndex ? { ...stage, name } : stage,
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
    await ctx.db.patch(workflow._id, {
      stages: workflow.stages.filter((stage) => stage.key !== stageKey),
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

export async function transitionCommunityMemberWorkflowStageCore(args: {
  ctx: any;
  communityId: any;
  membershipId: any;
  targetStageKey: string;
  expectedStageKey?: string | null;
  triggerType: CommunityMemberWorkflowTriggerType;
  sourceReceiptRef: string;
  nowMs: number;
}) {
  const workflow = await getCommunityMemberWorkflowByCommunity({
    ctx: args.ctx,
    communityId: args.communityId,
  });
  if (!workflow) throw new Error("community_member_workflow_not_found");
  const membership = (await args.ctx.db.get(
    args.membershipId,
  )) as CommunityMembershipLike | null;
  if (
    !membership ||
    String(membership.communityId) !== String(args.communityId) ||
    !communityMembershipRowIsActive(membership)
  ) {
    throw new Error("community_member_workflow_membership_inactive");
  }

  const targetStageKey = normalizeCommunityMemberWorkflowStageKey(
    args.targetStageKey,
  );
  if (!workflow.stages.some((stage) => stage.key === targetStageKey)) {
    throw new Error("community_member_workflow_stage_invalid");
  }
  const sourceReceiptRef = requireSourceReceiptRefForTrigger(
    args.triggerType,
    args.sourceReceiptRef,
  );
  const replays = (await args.ctx.db
    .query("communityMemberWorkflowTransitions" as any)
    .withIndex("by_workflow_membership_source", (q: any) =>
      q
        .eq("workflowId", workflow._id)
        .eq("membershipId", membership._id)
        .eq("sourceReceiptRef", sourceReceiptRef),
    )
    .take(2)) as any[];
  if (replays.length > 1) {
    throw new Error("community_member_workflow_transition_ambiguous");
  }
  if (replays[0]) {
    if (
      replays[0].toStageKey !== targetStageKey ||
      replays[0].triggerType !== args.triggerType
    ) {
      throw new Error("community_member_workflow_idempotency_conflict");
    }
    return {
      transition_id: String(replays[0]._id),
      changed: true,
      replayed: true,
    };
  }

  const state = await getMemberStage({
    ctx: args.ctx,
    workflowId: workflow._id,
    membershipId: membership._id,
  });
  const currentStageKey = state?.currentStageKey ?? workflow.stages[0].key;
  if (
    args.expectedStageKey &&
    normalizeCommunityMemberWorkflowStageKey(args.expectedStageKey) !==
      currentStageKey
  ) {
    throw new Error("community_member_workflow_stage_conflict");
  }
  if (currentStageKey === targetStageKey) {
    return { transition_id: null, changed: false, replayed: false };
  }

  const seq = Number(state?.transitionSeq ?? 0) + 1;
  if (state) {
    await args.ctx.db.patch(state._id, {
      currentStageKey: targetStageKey,
      stageEnteredAt: args.nowMs,
      transitionSeq: seq,
      updatedAt: args.nowMs,
    });
  } else {
    await args.ctx.db.insert(
      "communityMemberWorkflowMemberStages" as any,
      {
        workflowId: workflow._id,
        membershipId: membership._id,
        currentStageKey: targetStageKey,
        stageEnteredAt: args.nowMs,
        transitionSeq: seq,
        createdAt: args.nowMs,
        updatedAt: args.nowMs,
      },
    );
  }
  const transitionId = await args.ctx.db.insert(
    "communityMemberWorkflowTransitions" as any,
    {
      communityId: args.communityId,
      workflowId: workflow._id,
      membershipId: membership._id,
      seq,
      fromStageKey: currentStageKey,
      toStageKey: targetStageKey,
      triggerType: args.triggerType,
      sourceReceiptRef,
      occurredAt: args.nowMs,
      createdAt: args.nowMs,
    },
  );
  return {
    transition_id: String(transitionId),
    changed: true,
    replayed: false,
  };
}

export const transitionMemberStageInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    membershipId: v.id("communityMemberships"),
    targetStageKey: v.string(),
    expectedStageKey: v.optional(v.string()),
    triggerType: workflowTriggerValidator,
    sourceReceiptRef: v.string(),
    occurredAt: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    await transitionCommunityMemberWorkflowStageCore({
      ctx,
      communityId: args.communityId,
      membershipId: args.membershipId,
      targetStageKey: args.targetStageKey,
      expectedStageKey: args.expectedStageKey,
      triggerType: args.triggerType,
      sourceReceiptRef: args.sourceReceiptRef,
      nowMs: args.occurredAt ?? Date.now(),
    }),
});
