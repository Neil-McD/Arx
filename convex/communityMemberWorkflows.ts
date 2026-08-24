import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  normalizeCommunityMemberWorkflowDefinition,
  normalizeCommunityMemberWorkflowIdempotencyKey,
  normalizeCommunityMemberWorkflowSourceRef,
  normalizeCommunityMemberWorkflowStageKey,
  type CommunityMemberWorkflowTransitionActorType,
  type CommunityMemberWorkflowTransitionCauseType,
} from "../shared/communityMemberWorkflow";
import {
  communityMembershipRowIsActive,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
  type CommunityMembershipLike,
} from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";

const workflowStageInputValidator = v.object({
  key: v.string(),
  name: v.string(),
});

const workflowDefinitionInputValidator = v.object({
  stages: v.array(workflowStageInputValidator),
});

const transitionCauseValidator = v.union(
  v.literal("builder"),
  v.literal("in_app"),
  v.literal("time"),
  v.literal("external"),
  v.literal("system"),
);

const transitionActorValidator = v.union(
  v.literal("builder"),
  v.literal("agent"),
  v.literal("system"),
);

const managerIdentityArgs = {
  userId: v.optional(v.id("users")),
  authSubject: v.optional(v.string()),
};

const WORKFLOW_BOARD_MEMBER_LIMIT = 200;
const WORKFLOW_BOARD_MEMBERSHIP_SCAN_LIMIT = 500;

type WorkflowRow = any;
type MemberStageRow = any;

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

export const saveBuilderWorkflow = mutation({
  args: {
    ...managerIdentityArgs,
    communityId: v.id("communities"),
    expectedRevision: v.number(),
    definition: workflowDefinitionInputValidator,
  },
  handler: async (ctx, args) => {
    const { userId } = await requireWorkflowManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    const definition = normalizeCommunityMemberWorkflowDefinition(
      args.definition,
    );
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
      const workflowId = await ctx.db.insert(
        "communityMemberWorkflows" as any,
        {
          communityId: args.communityId,
          stages: definition.stages,
          revision: 1,
          createdByUserId: userId,
          updatedByUserId: userId,
          createdAt: nowMs,
          updatedAt: nowMs,
        },
      );
      return { workflow_id: String(workflowId), revision: 1 };
    }
    if (Number(existing.revision) !== expectedRevision) {
      throw new Error("community_member_workflow_revision_conflict");
    }

    const nextStageKeys = new Set(
      definition.stages.map((stage) => stage.key),
    );
    const memberStages = (await ctx.db
      .query("communityMemberWorkflowMemberStages" as any)
      .withIndex("by_workflow", (q: any) =>
        q.eq("workflowId", existing._id),
      )
      .collect()) as MemberStageRow[];
    if (
      memberStages.some((row) => !nextStageKeys.has(row.currentStageKey))
    ) {
      throw new Error("community_member_workflow_stage_has_members");
    }

    const revision = expectedRevision + 1;
    await ctx.db.patch(existing._id, {
      stages: definition.stages,
      revision,
      updatedByUserId: userId,
      updatedAt: nowMs,
    });
    return { workflow_id: String(existing._id), revision };
  },
});

export const getBuilderWorkflowBoard = query({
  args: {
    ...managerIdentityArgs,
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    await requireWorkflowManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    const workflow = await getCommunityMemberWorkflowByCommunity({
      ctx,
      communityId: args.communityId,
    });
    if (!workflow) return { workflow: null };

    const scannedMemberships = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_createdAt", (q: any) =>
        q.eq("communityId", args.communityId),
      )
      .take(WORKFLOW_BOARD_MEMBERSHIP_SCAN_LIMIT + 1)) as CommunityMembershipLike[];
    const activeMemberships = scannedMemberships.filter(
      communityMembershipRowIsActive,
    );
    const visibleMemberships = activeMemberships.slice(
      0,
      WORKFLOW_BOARD_MEMBER_LIMIT,
    );
    const memberStages = (await ctx.db
      .query("communityMemberWorkflowMemberStages" as any)
      .withIndex("by_workflow", (q: any) =>
        q.eq("workflowId", workflow._id),
      )
      .take(WORKFLOW_BOARD_MEMBERSHIP_SCAN_LIMIT + 1)) as MemberStageRow[];
    const stateByMembershipId = new Map<string, MemberStageRow>();
    for (const row of memberStages) {
      const key = String(row.membershipId);
      if (stateByMembershipId.has(key)) {
        throw new Error("community_member_workflow_member_stage_ambiguous");
      }
      stateByMembershipId.set(key, row);
    }
    const firstStage = workflow.stages[0];
    if (!firstStage) {
      throw new Error("community_member_workflow_stage_count_invalid");
    }

    const members = [];
    for (const membership of visibleMemberships) {
      const state = stateByMembershipId.get(String(membership._id));
      const stageKey = state?.currentStageKey ?? firstStage.key;
      if (!workflow.stages.some((stage: any) => stage.key === stageKey)) {
        throw new Error("community_member_workflow_member_stage_invalid");
      }
      const profile = await resolveUserProfileDisplayProjection(
        ctx,
        membership.userId,
      );
      members.push({
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
      });
    }

    return {
      workflow: {
        id: String(workflow._id),
        community_id: String(workflow.communityId),
        revision: workflow.revision,
        stages: workflow.stages,
        members,
        members_truncated:
          scannedMemberships.length > WORKFLOW_BOARD_MEMBERSHIP_SCAN_LIMIT ||
          activeMemberships.length > WORKFLOW_BOARD_MEMBER_LIMIT ||
          memberStages.length > WORKFLOW_BOARD_MEMBERSHIP_SCAN_LIMIT,
        updated_at: toIsoString(workflow.updatedAt),
      },
    };
  },
});

export async function transitionCommunityMemberWorkflowStageCore(args: {
  ctx: any;
  communityId: any;
  membershipId: any;
  targetStageKey: string;
  expectedStageKey?: string | null;
  causeType: CommunityMemberWorkflowTransitionCauseType;
  sourceRef?: string | null;
  actorType: CommunityMemberWorkflowTransitionActorType;
  actorUserId?: any;
  idempotencyKey: string;
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
  if (!workflow.stages.some((stage: any) => stage.key === targetStageKey)) {
    throw new Error("community_member_workflow_stage_invalid");
  }
  const idempotencyKey = normalizeCommunityMemberWorkflowIdempotencyKey(
    args.idempotencyKey,
  );
  const sourceRef = normalizeCommunityMemberWorkflowSourceRef(args.sourceRef);
  const fingerprint = JSON.stringify({
    workflowId: String(workflow._id),
    membershipId: String(membership._id),
    targetStageKey,
    causeType: args.causeType,
    sourceRef,
    actorType: args.actorType,
  });
  const replays = (await args.ctx.db
    .query("communityMemberWorkflowTransitions" as any)
    .withIndex("by_workflow_membership_idempotency", (q: any) =>
      q
        .eq("workflowId", workflow._id)
        .eq("membershipId", membership._id)
        .eq("idempotencyKey", idempotencyKey),
    )
    .take(2)) as any[];
  if (replays.length > 1) {
    throw new Error("community_member_workflow_transition_ambiguous");
  }
  if (replays[0]) {
    if (replays[0].idempotencyFingerprint !== fingerprint) {
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
      revision: Number(state.revision ?? 0) + 1,
      updatedAt: args.nowMs,
    });
  } else {
    await args.ctx.db.insert(
      "communityMemberWorkflowMemberStages" as any,
      {
        communityId: args.communityId,
        workflowId: workflow._id,
        membershipId: membership._id,
        currentStageKey: targetStageKey,
        stageEnteredAt: args.nowMs,
        transitionSeq: seq,
        revision: 1,
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
      causeType: args.causeType,
      ...(sourceRef ? { sourceRef } : {}),
      actorType: args.actorType,
      ...(args.actorUserId ? { actorUserId: args.actorUserId } : {}),
      idempotencyKey,
      idempotencyFingerprint: fingerprint,
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
    causeType: transitionCauseValidator,
    sourceRef: v.optional(v.string()),
    actorType: transitionActorValidator,
    actorUserId: v.optional(v.id("users")),
    idempotencyKey: v.string(),
    occurredAt: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    await transitionCommunityMemberWorkflowStageCore({
      ctx,
      communityId: args.communityId,
      membershipId: args.membershipId,
      targetStageKey: args.targetStageKey,
      expectedStageKey: args.expectedStageKey,
      causeType: args.causeType,
      sourceRef: args.sourceRef,
      actorType: args.actorType,
      actorUserId: args.actorUserId,
      idempotencyKey: args.idempotencyKey,
      nowMs: args.occurredAt ?? Date.now(),
    }),
});
