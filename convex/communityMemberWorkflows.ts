import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { enrollWorkflowMilestoneTimers, resolveWorkflowTimer } from "./communityMemberWorkflowTimerCore";
import {
  COMMUNITY_MEMBER_WORKFLOW_MAX_AUTOMATIONS_PER_MILESTONE,
  COMMUNITY_MEMBER_WORKFLOW_MAX_MILESTONES,
  COMMUNITY_MEMBER_WORKFLOW_MIN_MILESTONES,
  normalizeCommunityMemberWorkflowActionKey,
  normalizeCommunityMemberWorkflowAutomationKey,
  normalizeCommunityMemberWorkflowMilestoneKey,
  normalizeCommunityMemberWorkflowMilestoneName,
  normalizeCommunityMemberWorkflowPrompt,
  normalizeCommunityMemberWorkflowSourceRef,
  normalizeWorkflowDelayMinutes,
  type CommunityMemberWorkflowAction,
  type CommunityMemberWorkflowAutomation,
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
import { renderCommunityMemberSuccessDossierMarkdown } from "../shared/communityMemberSuccessDossier";
import {
  getCommunityMemberWorkflowByCommunity,
  getMemberMilestone,
  resolveCurrentMilestone,
} from "./communityMemberWorkflowReadCore";
import { resolveBuilderCommunityMembershipContext } from "./communityMembershipContextCore";
import { intakeCommunityAgentWorkflowAction } from "./communityAgentConciergeCore";
import { resolveNotificationRecipientSource } from "./communityNotificationAccess";
import { resolveMemberServiceChannel } from "./communityMemberServiceChannelCore";

const managerIdentityArgs = {
  userId: v.optional(v.id("users")),
  authSubject: v.optional(v.string()),
};

export const setBuilderMemberServiceChannel = mutation({
  args: {
    ...managerIdentityArgs,
    communityId: v.id("communities"), membershipId: v.id("communityMemberships"),
    channelId: v.union(v.id("communityChannels"), v.null()), expectedRevision: v.number(),
  },
  handler: async (ctx, args) => {
    await requireWorkflowManager({ ctx, ...args });
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.communityId !== args.communityId || !communityMembershipRowIsActive(membership)) {
      throw new Error("community_member_workflow_member_not_found");
    }
    const revision = membership.serviceChannelRevision ?? 0;
    if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision !== revision) {
      throw new Error("community_member_service_channel_revision_conflict");
    }
    if (args.channelId !== null) {
      const resolved = await resolveMemberServiceChannel({ ctx, membership, channelId: args.channelId });
      if (resolved.status !== "available") throw new Error("community_member_service_channel_unavailable");
    }
    if ((membership.serviceChannelId ?? null) === args.channelId) return { revision };
    await ctx.db.patch(membership._id, { serviceChannelId: args.channelId ?? undefined,
      serviceChannelRevision: revision + 1, updatedAt: Date.now() });
    return { revision: revision + 1 };
  },
});

const WORKFLOW_BOARD_DEFAULT_PAGE_SIZE = 50;
const WORKFLOW_BOARD_MAX_PAGE_SIZE = 100;

type WorkflowRow = Doc<"communityMemberWorkflows">;
type WorkflowRunRow = Doc<"communityMemberWorkflowRuns">;
type WorkflowTransitionRow = Doc<"communityMemberWorkflowTransitions">;
type ChannelContributionRow =
  | Doc<"communityInteractionRoots">
  | Doc<"communityInteractionReplies">;

const automationInputValidator = v.object({
  key: v.optional(v.string()),
  trigger: v.union(
    v.object({ type: v.literal("member_contributed"), channelId: v.optional(v.string()) }),
    v.object({ type: v.literal("milestone_elapsed"), delayMinutes: v.number() }),
  ),
  action: v.union(
    v.object({
      key: v.optional(v.string()),
      type: v.literal("prompt_agent"),
      prompt: v.string(),
    }),
    v.object({
      key: v.optional(v.string()),
      type: v.literal("move_member"),
      destination: v.literal("next_or_complete"),
    }),
  ),
});

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

function nextOpaqueKey(
  prefix: "milestone" | "automation" | "action",
  existing: Set<string>,
): string {
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

function normalizeAutomations(
  inputs: Array<any>,
  existingAutomations: CommunityMemberWorkflowAutomation[],
): CommunityMemberWorkflowAutomation[] {
  if (inputs.length > COMMUNITY_MEMBER_WORKFLOW_MAX_AUTOMATIONS_PER_MILESTONE) {
    throw new Error("community_member_workflow_automation_count_invalid");
  }
  const existingByKey = new Map(
    existingAutomations.map((automation) => [automation.key, automation]),
  );
  const usedAutomationKeys = new Set<string>();
  const usedActionKeys = new Set<string>();
  const automations: CommunityMemberWorkflowAutomation[] = inputs.map((input) => {
    const suppliedAutomationKey = input.key
      ? normalizeCommunityMemberWorkflowAutomationKey(input.key)
      : null;
    if (suppliedAutomationKey && !existingByKey.has(suppliedAutomationKey)) {
      throw new Error("community_member_workflow_automation_invalid");
    }
    const existing = suppliedAutomationKey
      ? existingByKey.get(suppliedAutomationKey)
      : null;
    const automationKey = suppliedAutomationKey ?? nextOpaqueKey(
      "automation",
      new Set([...existingByKey.keys(), ...usedAutomationKeys]),
    );
    if (usedAutomationKeys.has(automationKey)) {
      throw new Error("community_member_workflow_automation_duplicate");
    }
    usedAutomationKeys.add(automationKey);
    const suppliedActionKey = input.action?.key
      ? normalizeCommunityMemberWorkflowActionKey(input.action.key)
      : null;
    if (
      suppliedActionKey &&
      suppliedActionKey !== existing?.action.key
    ) {
      throw new Error("community_member_workflow_action_invalid");
    }
    const actionKey = suppliedActionKey ?? nextOpaqueKey(
      "action",
      new Set([
        ...existingAutomations.map((automation) => automation.action.key),
        ...usedActionKeys,
      ]),
    );
    if (usedActionKeys.has(actionKey)) {
      throw new Error("community_member_workflow_action_duplicate");
    }
    usedActionKeys.add(actionKey);
    const action: CommunityMemberWorkflowAction =
      input.action.type === "prompt_agent"
        ? {
            key: actionKey,
            type: "prompt_agent",
            prompt: normalizeCommunityMemberWorkflowPrompt(input.action.prompt),
          }
        : {
            key: actionKey,
            type: "move_member",
            destination: "next_or_complete",
          };
    return {
      key: automationKey,
      ...(input.trigger.type === "milestone_elapsed" ? {
        timerGeneration: existing?.trigger.type === "milestone_elapsed"
          ? existing.timerGeneration ?? crypto.randomUUID() : crypto.randomUUID(),
      } : {}),
      trigger: input.trigger.type === "milestone_elapsed"
        ? { type: "milestone_elapsed", delayMinutes: normalizeWorkflowDelayMinutes(input.trigger.delayMinutes) }
        : { type: "member_contributed", ...(input.trigger.channelId !== undefined ? { channelId: input.trigger.channelId } : {}) },
      action,
    };
  });
  if (
    automations.filter((automation) => automation.action.type === "move_member")
      .length > 1
  ) {
    throw new Error("community_member_workflow_move_action_count_invalid");
  }
  return automations;
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
      const milestone: CommunityMemberWorkflowMilestone = {
        key: nextOpaqueKey("milestone", new Set()),
        name,
        automations: [],
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
    const milestone: CommunityMemberWorkflowMilestone = {
      key: nextOpaqueKey(
        "milestone",
        new Set(existing.milestones.map((item) => item.key)),
      ),
      name,
      automations: [],
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
    automations: v.array(automationInputValidator),
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
    const current = workflow.milestones[milestoneIndex] as CommunityMemberWorkflowMilestone;
    const milestone: CommunityMemberWorkflowMilestone = {
      key: current.key,
      name: normalizeCommunityMemberWorkflowMilestoneName(args.name),
      automations: normalizeAutomations(args.automations, current.automations ?? []),
    };
    for (const rawChannelId of new Set(milestone.automations.flatMap((automation) =>
      automation.trigger.type === "member_contributed" && automation.trigger.channelId !== undefined ? [automation.trigger.channelId] : []))) {
      const channelId = ctx.db.normalizeId("communityChannels", rawChannelId);
      const channel = channelId ? await ctx.db.get(channelId) : null;
      if (!channel || channel.communityId !== args.communityId || channel.status !== "active") {
        throw new Error("community_member_workflow_channel_unavailable");
      }
    }
    if (JSON.stringify(current) === JSON.stringify(milestone)) {
      return {
        workflow_id: String(workflow._id),
        revision: expectedRevision,
        milestone: current,
      };
    }
    const revision = expectedRevision + 1;
    await ctx.db.patch(workflow._id, {
      milestones: workflow.milestones.map((item, index) =>
        index === milestoneIndex ? milestone : item,
      ),
      revision,
      updatedByUserId: userId,
      updatedAt: Date.now(),
    });
    if (JSON.stringify(current.automations) !== JSON.stringify(milestone.automations)
      && current.automations.some((a) => a.trigger.type === "milestone_elapsed")) {
      await ctx.scheduler.runAfter(0, internal.communityMemberWorkflows.refreshMilestoneTimersInternal,
        { workflowId: workflow._id, milestoneKey, cursor: null });
    }
    return { workflow_id: String(workflow._id), revision, milestone };
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
    if (occupied) throw new Error("community_member_workflow_milestone_has_members");
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
    const [latestTransition, latestRun] = workflow
      ? await Promise.all([
          ctx.db
            .query("communityMemberWorkflowTransitions")
            .withIndex("by_community_occurredAt", (q: any) =>
              q.eq("communityId", args.communityId),
            )
            .order("desc")
            .first() as Promise<WorkflowTransitionRow | null>,
          ctx.db
            .query("communityMemberWorkflowRuns")
            .withIndex("by_workflow_updatedAt", (q: any) =>
              q.eq("workflowId", workflow._id),
            )
            .order("desc")
            .first() as Promise<WorkflowRunRow | null>,
        ])
      : [null, null];
    return {
      workflow_id: workflow ? String(workflow._id) : null,
      workflow_revision: workflow?.revision ?? 0,
      active_member_count: readCommunityActiveMemberCount(community),
      latest_transition_id: latestTransition ? String(latestTransition._id) : null,
      latest_run_id: latestRun ? String(latestRun._id) : null,
      latest_run_updated_at: latestRun?.updatedAt ?? null,
    };
  },
});
export const getBuilderWorkflowMemberSuccessDossier = query({
  args: {
    ...managerIdentityArgs,
    communityId: v.id("communities"),
    membershipId: v.id("communityMemberships"),
  },
  handler: async (ctx, args) => {
    const actorUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    const source = await resolveBuilderCommunityMembershipContext({
      ctx,
      actorUserId,
      communityId: args.communityId,
      membershipId: args.membershipId,
    });
    return {
      ...source,
      markdown: renderCommunityMemberSuccessDossierMarkdown(source),
    };
  },
});

async function getWorkflowRunByTrigger(args: {
  ctx: any;
  workflowId: any;
  membershipId: any;
  triggerReceiptRef: string;
  automationKey: string;
}): Promise<WorkflowRunRow | null> {
  const rows = (await args.ctx.db
    .query("communityMemberWorkflowRuns")
    .withIndex("by_workflow_membership_trigger_automation", (q: any) =>
      q
        .eq("workflowId", args.workflowId)
        .eq("membershipId", args.membershipId)
        .eq("triggerReceiptRef", args.triggerReceiptRef)
        .eq("automationKey", args.automationKey),
    )
    .take(2)) as WorkflowRunRow[];
  if (rows.length > 1) {
    throw new Error("community_member_workflow_run_ambiguous");
  }
  return rows[0] ?? null;
}

async function getTransitionByRunAction(args: {
  ctx: any;
  workflowRunId: any;
  actionKey: string;
}): Promise<WorkflowTransitionRow | null> {
  const rows = (await args.ctx.db
    .query("communityMemberWorkflowTransitions")
    .withIndex("by_workflowRun_action", (q: any) =>
      q.eq("workflowRunId", args.workflowRunId).eq("actionKey", args.actionKey),
    )
    .take(2)) as WorkflowTransitionRow[];
  if (rows.length > 1) {
    throw new Error("community_member_workflow_transition_ambiguous");
  }
  return rows[0] ?? null;
}

async function transitionMemberForWorkflowAction(args: {
  ctx: any;
  workflowRunId: any;
  actionKey: string;
  expectedWorkflowRevision: number;
  expectedMilestoneKey: string;
  expectedMilestoneEnteredAt: number;
  nowMs: number;
}) {
  const replay = await getTransitionByRunAction({
    ctx: args.ctx,
    workflowRunId: args.workflowRunId,
    actionKey: args.actionKey,
  });
  if (replay) {
    return {
      transitionId: replay._id,
      completedWorkflow: replay.completedWorkflow,
      replayed: true,
    };
  }
  const run = (await args.ctx.db.get(args.workflowRunId)) as WorkflowRunRow | null;
  if (!run || run.status !== "running") {
    throw new Error("community_member_workflow_run_authority_invalid");
  }
  const workflow = (await args.ctx.db.get(run.workflowId)) as WorkflowRow | null;
  const membership = (await args.ctx.db.get(
    run.membershipId,
  )) as CommunityMembershipLike | null;
  if (
    !workflow ||
    !communityMembershipRowIsActive(membership) ||
    String(membership!.communityId) !== String(workflow.communityId) ||
    workflow.revision !== args.expectedWorkflowRevision
  ) {
    throw new Error("community_member_workflow_transition_authority_changed");
  }
  const state = await getMemberMilestone({
    ctx: args.ctx,
    workflowId: workflow._id,
    membershipId: membership!._id,
  });
  const current = resolveCurrentMilestone({ workflow, membership: membership!, state });
  if (
    current.completedAt ||
    current.milestone.key !== args.expectedMilestoneKey ||
    current.milestoneEnteredAt !== args.expectedMilestoneEnteredAt
  ) {
    throw new Error("community_member_workflow_transition_authority_changed");
  }
  const nextMilestone = workflow.milestones[current.milestoneIndex + 1];
  const completedWorkflow = !nextMilestone;
  const seq = Number(state?.transitionSeq ?? 0) + 1;
  if (state) {
    await args.ctx.db.patch(state._id, {
      currentMilestoneKey: nextMilestone?.key ?? current.milestone.key,
      milestoneEnteredAt: nextMilestone ? args.nowMs : current.milestoneEnteredAt,
      transitionSeq: seq,
      completedAt: completedWorkflow ? args.nowMs : undefined,
      updatedAt: args.nowMs,
    });
  } else {
    await args.ctx.db.insert("communityMemberWorkflowMemberMilestones", {
      workflowId: workflow._id,
      membershipId: membership!._id,
      currentMilestoneKey: nextMilestone?.key ?? current.milestone.key,
      milestoneEnteredAt: nextMilestone ? args.nowMs : current.milestoneEnteredAt,
      transitionSeq: seq,
      completedAt: completedWorkflow ? args.nowMs : undefined,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
  }
  const transitionId = await args.ctx.db.insert("communityMemberWorkflowTransitions", {
    communityId: workflow.communityId,
    workflowId: workflow._id,
    membershipId: membership!._id,
    seq,
    fromMilestoneKey: current.milestone.key,
    fromMilestoneName: current.milestone.name,
    toMilestoneKey: nextMilestone?.key,
    toMilestoneName: nextMilestone?.name,
    completedWorkflow,
    workflowRevision: workflow.revision,
    milestoneEnteredAt: current.milestoneEnteredAt,
    workflowRunId: args.workflowRunId,
    actionKey: args.actionKey,
    occurredAt: args.nowMs,
    createdAt: args.nowMs,
  });
  if (nextMilestone) await enrollWorkflowMilestoneTimers({ ctx: args.ctx, membership: membership!, nowMs: args.nowMs });
  return { transitionId, completedWorkflow, replayed: false };
}

async function executeWorkflowAutomation(args: {
  ctx: any;
  objectType?: "root" | "reply";
  row?: ChannelContributionRow;
  timerReceiptRef?: string;
  workflowTimerId?: any;
  workflow: WorkflowRow;
  membership: CommunityMembershipLike;
  current: ReturnType<typeof resolveCurrentMilestone>;
  automation: CommunityMemberWorkflowAutomation;
}) {
  const triggerReceiptRef = normalizeCommunityMemberWorkflowSourceRef(
    args.timerReceiptRef ?? buildCommunityInteractionEvidenceRef({
      objectType: args.objectType!,
      objectId: String(args.row!._id),
    }),
  );
  const existingRun = await getWorkflowRunByTrigger({
    ctx: args.ctx,
    workflowId: args.workflow._id,
    membershipId: args.membership._id,
    triggerReceiptRef,
    automationKey: args.automation.key,
  });
  if (existingRun) {
    return {
      status: "already_executed" as const,
      workflow_run_id: String(existingRun._id),
      replayed: true,
    };
  }
  const nowMs = Date.now();
  const workflowRunId = await args.ctx.db.insert("communityMemberWorkflowRuns", {
    communityId: args.workflow.communityId,
    workflowId: args.workflow._id,
    membershipId: args.membership._id,
    milestoneKey: args.current.milestone.key,
    milestoneName: args.current.milestone.name,
    milestoneEnteredAt: args.current.milestoneEnteredAt,
    workflowRevision: args.workflow.revision,
    automationKey: args.automation.key,
    triggerType: args.automation.trigger.type,
    triggerSnapshot: args.automation.trigger,
    triggerReceiptRef,
    actionSnapshot: args.automation.action,
    status: "running",
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  try {
    if (args.automation.action.type === "prompt_agent") {
      if (!args.workflowTimerId && (!args.row || !args.objectType || args.automation.trigger.type !== "member_contributed")) {
        throw new Error("community_member_workflow_timer_action_invalid");
      }
      const intake = await intakeCommunityAgentWorkflowAction({
        ctx: args.ctx,
        communityId: args.workflow.communityId,
        workflowTimerId: args.workflowTimerId,
        rootId: args.row ? (args.objectType === "root" ? args.row._id : (args.row as any).rootId) : undefined,
        replyId: args.objectType === "reply" ? args.row?._id : undefined,
        requesterUserId: args.membership.userId,
        workflowRunId,
        workflowActionKey: args.automation.action.key,
        workflowPromptSnapshot: args.automation.action.prompt,
        nowMs,
      });
      const succeeded = intake.status === "queued" || intake.status === "duplicate";
      await args.ctx.db.patch(workflowRunId, {
        status: succeeded ? "finished" : "failed",
        actionResult: {
          actionKey: args.automation.action.key,
          status: succeeded ? "complete" : "failed",
          resultCode: `agent_${intake.status}`,
          serveRequestId: intake.request_id
            ? (intake.request_id as any)
            : undefined,
        },
        errorCode: succeeded ? undefined : `agent_${intake.intake_reason}`,
        finishedAt: nowMs,
        updatedAt: nowMs,
      });
      return {
        status: succeeded ? "agent_queued" as const : "agent_skipped" as const,
        workflow_run_id: String(workflowRunId),
        serve_request_id: intake.request_id,
        replayed: false,
      };
    }
    const transition = await transitionMemberForWorkflowAction({
      ctx: args.ctx,
      workflowRunId,
      actionKey: args.automation.action.key,
      expectedWorkflowRevision: args.workflow.revision,
      expectedMilestoneKey: args.current.milestone.key,
      expectedMilestoneEnteredAt: args.current.milestoneEnteredAt,
      nowMs,
    });
    await args.ctx.db.patch(workflowRunId, {
      status: "finished",
      actionResult: {
        actionKey: args.automation.action.key,
        status: "complete",
        resultCode: transition.completedWorkflow
          ? "workflow_completed"
          : "member_moved",
        transitionId: transition.transitionId,
      },
      finishedAt: nowMs,
      updatedAt: nowMs,
    });
    return {
      status: "member_moved" as const,
      workflow_run_id: String(workflowRunId),
      transition_id: String(transition.transitionId),
      workflow_completed: transition.completedWorkflow,
      replayed: false,
    };
  } catch (error) {
    // Timer admission, transition and consumption are one transaction. Never
    // commit a partial timer action as a terminal failure.
    if (args.automation.action.type === "move_member") throw error;
    const errorCode = String(
      error instanceof Error ? error.message : error ?? "workflow_action_failed",
    ).slice(0, 120);
    await args.ctx.db.patch(workflowRunId, {
      status: "failed",
      actionResult: {
        actionKey: args.automation.action.key,
        status: "failed",
        errorCode,
      },
      errorCode,
      finishedAt: nowMs,
      updatedAt: nowMs,
    });
    return {
      status: "action_failed" as const,
      workflow_run_id: String(workflowRunId),
      error_code: errorCode,
      replayed: false,
    };
  }
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
  const authorizedSource = await resolveNotificationRecipientSource({ ctx: args.ctx, communityId: row.communityId,
    userId: row.actorUserId, channelId: row.channelId,
    ...(args.objectType === "root" ? { rootId: row._id } : { replyId: row._id }),
  });
  if (!authorizedSource) return { status: "receipt_ineligible" as const };
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
  const automations = (current.milestone as CommunityMemberWorkflowMilestone)
    .automations.filter(
      (automation) => automation.trigger.type === "member_contributed"
        && (automation.trigger.channelId === undefined || automation.trigger.channelId === String(row.channelId)),
    );
  if (automations.length === 0) {
    return { status: "trigger_unconfigured" as const };
  }
  const promptAutomations = automations.filter(
    (automation) => automation.action.type === "prompt_agent",
  );
  const moveAutomation = automations.find(
    (automation) => automation.action.type === "move_member",
  );
  const results = [];
  for (const automation of promptAutomations) {
    results.push(await executeWorkflowAutomation({
      ctx: args.ctx,
      objectType: args.objectType,
      row,
      workflow,
      membership: membership!,
      current,
      automation,
    }));
  }
  if (moveAutomation) {
    results.push(await executeWorkflowAutomation({
      ctx: args.ctx,
      objectType: args.objectType,
      row,
      workflow,
      membership: membership!,
      current,
      automation: moveAutomation,
    }));
  }
  return { status: "handled" as const, results };
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

export const refreshMilestoneTimersInternal = internalMutation({
  args: { workflowId: v.id("communityMemberWorkflows"), milestoneKey: v.string(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("communityMemberWorkflowTimers")
      .withIndex("by_workflow_milestone_status", q => q.eq("workflowId", args.workflowId)
        .eq("milestoneKey", args.milestoneKey).eq("status", "pending"))
      .paginate({ cursor: args.cursor, numItems: 50 });
    for (const timer of page.page) {
      const resolved = await resolveWorkflowTimer(ctx, timer);
      await ctx.db.patch(timer._id, resolved ? { dueAt: resolved.dueAt }
        : { status: "obsolete", finishedAt: Date.now() });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0,
      internal.communityMemberWorkflows.refreshMilestoneTimersInternal,
      { ...args, cursor: page.continueCursor });
  },
});

export const processDueMilestoneTimersInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const nowMs = Date.now();
    const timers = await ctx.db.query("communityMemberWorkflowTimers")
      .withIndex("by_status_dueAt", q => q.eq("status", "pending").lte("dueAt", nowMs)).take(25);
    for (const timer of timers) {
      const resolved = await resolveWorkflowTimer(ctx, timer);
      if (!resolved) {
        await ctx.db.patch(timer._id, { status: "obsolete", finishedAt: nowMs });
        continue;
      }
      if (resolved.dueAt > nowMs) {
        await ctx.db.patch(timer._id, { dueAt: resolved.dueAt });
        continue;
      }
      await executeWorkflowAutomation({ ctx, ...resolved, workflowTimerId: timer._id, timerReceiptRef: `workflow-timer:${timer._id}` });
      await ctx.db.patch(timer._id, { status: "consumed", finishedAt: nowMs });
    }
    if (timers.length === 25) await ctx.scheduler.runAfter(0,
      internal.communityMemberWorkflows.processDueMilestoneTimersInternal, {});
    return { processed: timers.length };
  },
});
