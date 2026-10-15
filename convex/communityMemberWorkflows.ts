import { workflowSequenceCompletionIsNew, workflowSequenceIssue, workflowSequenceReceipt } from "../shared/communityMemberWorkflow";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { WORKFLOW_ASSESSMENT_PROMPT } from "../shared/communityWorkflowAssessment";
import { readWorkflowActionProgress, readWorkflowApprovalObservation } from "./communityWorkflowCompletionCore";
import { COMPLETION_REVIEW_KEY, readCompletionReviewSnapshot, requireCompletionReview } from "./communityWorkflowGoalReviewCore";
import { internal } from "./_generated/api";
import { workflowJoinArgs, resolveFirstMemberWorkflowJoin, provisionJoinedMemberServiceChannel } from "./communityMemberWorkflowJoinCore";
import { assignWorkflowForm, cancelMilestoneFormRequests, requestIsCurrent } from "./communityFormRequestCore";
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
  normalizeWorkflowMilestoneContext,
  normalizeCommunityMemberWorkflowSourceRef,
  normalizeWorkflowDelayMinutes,
  workflowTriggerIdentity,
  type CommunityMemberWorkflowAction,
  type CommunityMemberWorkflowAutomation,
  type CommunityMemberWorkflowMilestone,
} from "../shared/communityMemberWorkflow";
import {
  communityMembershipRowIsActive,
  getUniqueCommunityMembershipByPair,
  readCommunityActiveMemberCount,
  requireCommunityManager,
  requireCommunityChatAccess,
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
import { resolveBuilderCommunityMembershipContext, resolveWorkflowExecutionMembershipContext } from "./communityMembershipContextCore";
import { resolveViewerProfileRelationship } from "./profileRelationshipCore";
import { getUniqueUserProfileDetailByUserId } from "./profileCore";
import { normalizeSocialProfileLinks } from "../shared/socialProfileLinks";
import { validateProfileHandle } from "../shared/profileHandle";
import { intakeCommunityAgentWorkflowAction } from "./communityAgentConciergeCore";
import { resolveNotificationRecipientSource } from "./communityNotificationAccess";
import { bindMemberServiceChannel } from "./communityMemberServiceChannelCore";

const managerIdentityArgs = {
  userId: v.optional(v.id("users")),
  authSubject: v.optional(v.string()),
};

// Internal runtime read; not registered as a member/MCP tool or channel context.
export const getWorkflowExecutionContextInternal = internalQuery({
  args: { requestId: v.id("communityAgentServeRequests"), expectedAttempt: v.number() },
  handler: (ctx, args) => resolveWorkflowExecutionMembershipContext({ ctx, ...args }),
});

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
    return bindMemberServiceChannel({ ctx, membership, channelId: args.channelId, expectedRevision: args.expectedRevision });
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
  sequenceEnabledAt: v.optional(v.number()),
  sequenceEnabledRevision: v.optional(v.number()),
  trigger: v.union(
    v.object({ type: v.literal("member_joined") }),
    v.object({ type: v.literal("previous_action_completed"), predecessorActionKey: v.string() }),
    v.object({ type: v.literal("form_submitted"), formKey: v.string() }),
    v.object({ type: v.literal("member_contributed"), channelId: v.optional(v.string()) }),
    v.object({ type: v.literal("milestone_elapsed"), delayMinutes: v.number() }),
  ),
  action: v.union(
    v.object({ key: v.optional(v.string()), type: v.literal("create_service_channel") }),
    v.object({ key: v.optional(v.string()), type: v.literal("request_form"), formKey: v.string() }),
    v.object({
      key: v.optional(v.string()),
      type: v.literal("prompt_agent"),
      prompt: v.string(),
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
  revision: number,
): CommunityMemberWorkflowAutomation[] {
  if (inputs.length > COMMUNITY_MEMBER_WORKFLOW_MAX_AUTOMATIONS_PER_MILESTONE) {
    throw new Error("community_member_workflow_automation_count_invalid");
  }
  const existingByKey = new Map(
    existingAutomations.map((automation) => [automation.key, automation]),
  );
  const usedAutomationKeys = new Set<string>();
  const usedActionKeys = new Set<string>();
  const submittedForms = new Set<string>();
  const draftActionKeys = new Map<string, string>();
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
    const draftKey = !existing && String(input.action?.key ?? "").startsWith("draft-") ? input.action.key : null;
    const suppliedActionKey = input.action?.key && !draftKey
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
    if (draftKey) {
      if (draftActionKeys.has(draftKey)) throw new Error("community_member_workflow_action_duplicate");
      draftActionKeys.set(draftKey, actionKey);
    }
    const action: CommunityMemberWorkflowAction =
      input.action.type === "prompt_agent"
        ? {
            key: actionKey,
            type: "prompt_agent",
            prompt: normalizeCommunityMemberWorkflowPrompt(input.action.prompt),
          }
        : input.action.type === "request_form" ? { key: actionKey, type: "request_form", formKey: input.action.formKey }
        : { key: actionKey, type: "create_service_channel" };
    if ((action.type === "request_form" && !action.formKey.trim()) || (input.trigger.type === "form_submitted" && !input.trigger.formKey.trim())) throw new Error("form_required");
    if ((action.type === "create_service_channel" && input.trigger.type !== "member_joined")
      || (input.trigger.type === "member_joined" && action.type !== "create_service_channel" && action.type !== "request_form")) throw new Error("workflow_join_action_invalid");
    if (input.trigger.type === "form_submitted") {
      if (action.type === "request_form") throw new Error("form_submission_action_invalid");
      const submissionLane = `${action.type}:${input.trigger.formKey}`;
      if (submittedForms.has(submissionLane)) throw new Error("form_submission_trigger_duplicate");
      submittedForms.add(submissionLane);
    }
    const sameSequence = existing?.trigger.type === "previous_action_completed"
      && workflowTriggerIdentity(existing.trigger) === workflowTriggerIdentity(input.trigger)
      && existing.action.key === action.key && existing.action.type === action.type
      && (action.type !== "prompt_agent" || (existing.action.type === "prompt_agent" && existing.action.prompt === action.prompt))
      && (action.type !== "request_form" || (existing.action.type === "request_form" && existing.action.formKey === action.formKey));
    return {
      key: automationKey,
      ...(input.trigger.type === "previous_action_completed" ? { sequenceEnabledAt:
        sameSequence ? existing.sequenceEnabledAt ?? Date.now() : Date.now(),
        sequenceEnabledRevision: sameSequence ? existing.sequenceEnabledRevision ?? revision : revision } : {}),
      ...(input.trigger.type === "milestone_elapsed" ? {
        timerGeneration: existing?.trigger.type === "milestone_elapsed"
          ? existing.timerGeneration ?? crypto.randomUUID() : crypto.randomUUID(),
      } : {}),
      trigger: input.trigger.type === "previous_action_completed" ? { type: "previous_action_completed", predecessorActionKey: input.trigger.predecessorActionKey }
        : input.trigger.type === "member_joined" ? { type: "member_joined" }
        : input.trigger.type === "form_submitted" ? { type: "form_submitted", formKey: input.trigger.formKey }
        : input.trigger.type === "milestone_elapsed"
        ? { type: "milestone_elapsed", delayMinutes: normalizeWorkflowDelayMinutes(input.trigger.delayMinutes) }
        : { type: "member_contributed", ...(input.trigger.channelId !== undefined ? { channelId: input.trigger.channelId } : {}) },
      action,
    };
  });
  for (const rule of automations) {
    if (rule.trigger.type === "previous_action_completed") rule.trigger.predecessorActionKey = draftActionKeys.get(rule.trigger.predecessorActionKey) ?? rule.trigger.predecessorActionKey;
  }
  if (workflowSequenceIssue(automations)) throw new Error("workflow_previous_action_invalid");
  return automations;
}

export const createBuilderWorkflowMilestone = mutation({
  args: {
    requireHumanApproval: v.optional(v.boolean()),
    instructions: v.optional(v.string()),
    goal: v.optional(v.string()),
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
    const context = { instructions: normalizeWorkflowMilestoneContext(args.instructions), goal: normalizeWorkflowMilestoneContext(args.goal), requireHumanApproval: args.requireHumanApproval ?? false };
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
        ...context,
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
      ...context,
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
    requireHumanApproval: v.optional(v.boolean()),
    instructions: v.optional(v.string()),
    goal: v.optional(v.string()),
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
      instructions: normalizeWorkflowMilestoneContext(args.instructions ?? current.instructions),
      goal: normalizeWorkflowMilestoneContext(args.goal ?? current.goal),
      requireHumanApproval: args.requireHumanApproval ?? current.requireHumanApproval ?? false,
      automations: normalizeAutomations(args.automations, current.automations ?? [], workflow.revision + 1),
    };
    const joinRules = milestone.automations.filter(a => a.trigger.type === "member_joined");
    if (joinRules.length > 0 && milestoneIndex !== 0) throw new Error("workflow_join_requires_first_milestone");
    const joinLanes = joinRules.map(a => a.action.type === "request_form" ? `form:${a.action.formKey}` : a.action.type);
    if (new Set(joinLanes).size !== joinLanes.length) throw new Error("workflow_join_action_duplicate");
    for (const rawChannelId of new Set(milestone.automations.flatMap((automation) =>
      automation.trigger.type === "member_contributed" && automation.trigger.channelId !== undefined ? [automation.trigger.channelId] : []))) {
      const channelId = ctx.db.normalizeId("communityChannels", rawChannelId);
      const channel = channelId ? await ctx.db.get(channelId) : null;
      if (!channel || channel.communityId !== args.communityId || channel.status !== "active") {
        throw new Error("community_member_workflow_channel_unavailable");
      }
    }
    for (const formKey of new Set(milestone.automations.flatMap(a => [
      ...(a.action.type === "request_form" ? [a.action.formKey] : []),
      ...(a.trigger.type === "form_submitted" ? [a.trigger.formKey] : []),
    ]))) {
      const form = await ctx.db.query("communityForms").withIndex("by_community_key", q => q.eq("communityId", args.communityId).eq("key", formKey)).unique();
      if (!form?.publishedRevision) throw new Error("form_not_published");
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
// Paginated identity discovery only; answers remain in the authorized dossier read.
export const listBuilderWorkflowContextMembers = query({
  args: { ...managerIdentityArgs, communityId: v.id("communities"), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actorUserId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId: actorUserId });
    const page = await ctx.db.query("communityMemberships")
      .withIndex("by_community", q => q.eq("communityId", args.communityId))
      .paginate({ numItems: 50, cursor: args.cursor ?? null });
    const members = await Promise.all(page.page.filter(communityMembershipRowIsActive).map(async membership => {
      const [profile, user] = await Promise.all([resolveUserProfileDisplayProjection(ctx, membership.userId), ctx.db.get(membership.userId)]);
      const handle = validateProfileHandle(user?.normalizedHandle ?? user?.handle);
      return { membership_id: String(membership._id), user_id: String(membership.userId), name: profile.display_name,
        handle: handle.ok ? handle.normalizedHandle : null };
    }));
    return { members, next_cursor: page.isDone ? null : page.continueCursor };
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
    const [detail, relationship] = await Promise.all([
      getUniqueUserProfileDetailByUserId<{ bio?: string; socialLinks?: { youtube?: string; x?: string; instagram?: string } }>(ctx, source.user_id),
      resolveViewerProfileRelationship({ ctx, viewerUserId: actorUserId, targetUserId: source.user_id,
        preferredCommunityId: args.communityId }),
    ]);
    // Match the platform profile gate: an active dossier membership alone does
    // not grant access to someone's global bio or cross-community projection.
    const canReadProfile = relationship.is_self || relationship.mutual_communities
      .some(row => String(row.id) === String(args.communityId));
    const context = { ...source, ...(canReadProfile ? { visible_profile: {
      bio: detail?.bio ?? null,
      social_links: normalizeSocialProfileLinks(detail?.socialLinks ?? {}),
      owned_communities: relationship.owned_communities.map(row => ({ name: row.name, slug: row.slug })),
      mutual_communities: relationship.mutual_communities.map(row => ({ name: row.name, slug: row.slug })),
    } } : {}) };
    return {
      ...context,
      markdown: renderCommunityMemberSuccessDossierMarkdown(context),
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
  automaticCompletion?: boolean;
  completedGoalReview?: boolean;
  workflowRunId?: any;
  override?: { workflowId: any; membershipId: any; actorUserId: any; activationSequence: number; transitionSeq: number };
  approval?: { workflowId: any; membershipId: any; actorUserId: any; activationSequence: number; transitionSeq: number };
  actionKey: string;
  expectedWorkflowRevision: number;
  expectedMilestoneKey: string;
  expectedMilestoneEnteredAt: number;
  nowMs: number;
}) {
  const replay = args.workflowRunId ? await getTransitionByRunAction({
    ctx: args.ctx,
    workflowRunId: args.workflowRunId,
    actionKey: args.actionKey,
  }) : null;
  if (replay) {
    return {
      transitionId: replay._id,
      completedWorkflow: replay.completedWorkflow,
      replayed: true,
    };
  }
  const run = args.workflowRunId ? (await args.ctx.db.get(args.workflowRunId)) as WorkflowRunRow | null : null;
  const human = args.override ?? args.approval;
  if (!human && (!run || run.status !== (args.automaticCompletion || args.completedGoalReview ? "finished" : "running"))) {
    throw new Error("community_member_workflow_run_authority_invalid");
  }
  const workflow = (await args.ctx.db.get(human?.workflowId ?? run!.workflowId)) as WorkflowRow | null;
  const membership = (await args.ctx.db.get(
    human?.membershipId ?? run!.membershipId,
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
  if (human && (Number(membership!.activationSequence ?? 0) !== human.activationSequence || Number(state?.transitionSeq ?? 0) !== human.transitionSeq)) {
    throw new Error("community_member_workflow_transition_authority_changed");
  }
  if (
    current.completedAt ||
    current.milestone.key !== args.expectedMilestoneKey ||
    current.milestoneEnteredAt !== args.expectedMilestoneEnteredAt
  ) {
    throw new Error("community_member_workflow_transition_authority_changed");
  }
  let completionEvidence;
  if (!human && current.milestone.requireHumanApproval) return { status: "awaiting_human_approval" as const };
  if (args.completedGoalReview) {
    if (human || args.automaticCompletion) throw new Error("workflow_assessment_source_invalid");
    const request = run?.actionResult?.serveRequestId ? await args.ctx.db.get(run.actionResult.serveRequestId) : null;
    if (!request) throw new Error("workflow_assessment_stale");
    const { review } = await requireCompletionReview(args.ctx, request, true);
    completionEvidence = review.progress.actions.map(action => ({ actionKey: action.action_key,
      automationKey: action.automation_key, ...action.evidence! }));
  }
  if (args.approval) {
    if (!current.milestone.requireHumanApproval) throw new Error("workflow_human_approval_unavailable");
    const progress = await readWorkflowActionProgress(args.ctx, { workflow: workflow as any, membership: membership as any,
      milestone: current.milestone, milestoneEnteredAt: current.milestoneEnteredAt, transitionSeq: Number(state?.transitionSeq ?? 0) });
    if ((progress.actions.length > 0 && !progress.all_actions_complete) || progress.scan_truncated) throw new Error("workflow_actions_incomplete");
    completionEvidence = progress.actions.map(action => ({ actionKey: action.action_key, automationKey: action.automation_key, ...action.evidence! }));
  }
  if (args.automaticCompletion) {
    if (args.override || current.milestone.goal?.trim()
      || run!.activationSequence !== Number(membership!.activationSequence ?? 0)
      || run!.transitionSeq !== Number(state?.transitionSeq ?? 0)
      || run!.communityId !== workflow.communityId) return { status: "not_eligible" as const };
    const progress = await readWorkflowActionProgress(args.ctx, { workflow: workflow as any, membership: membership as any,
      milestone: current.milestone, milestoneEnteredAt: current.milestoneEnteredAt,
      transitionSeq: Number(state?.transitionSeq ?? 0) });
    if (!progress.all_actions_complete || progress.scan_truncated
      || !progress.actions.some(action => action.evidence?.run_id === String(run!._id))) return { status: "incomplete" as const };
    completionEvidence = progress.actions.map(action => ({ actionKey: action.action_key,
      automationKey: action.automation_key, ...action.evidence! }));
  }
  if (!human && !args.automaticCompletion && !args.completedGoalReview) throw new Error("workflow_transition_source_invalid");
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
    ...(completionEvidence ? { completionEvidence } : {}),
    ...(args.approval ? { approval: { actorUserId: args.approval.actorUserId, goal: current.milestone.goal ?? "", activationSequence: args.approval.activationSequence } } : {}),
    ...(args.override ? { forcedByUserId: args.override.actorUserId } : {}),
    actionKey: args.actionKey,
    occurredAt: args.nowMs,
    createdAt: args.nowMs,
  });
  await cancelMilestoneFormRequests(args.ctx, { membershipId: membership!._id, workflowId: workflow._id,
    activationSequence: Number(membership!.activationSequence ?? 0), milestoneKey: current.milestone.key,
    milestoneEnteredAt: current.milestoneEnteredAt });
  if (nextMilestone) await enrollWorkflowMilestoneTimers({ ctx: args.ctx, membership: membership!, nowMs: args.nowMs });
  return { transitionId, completedWorkflow, replayed: false };
}

// Called only after product outcomes change, never from reads or definition edits.
export const reconcileCompletedWorkflowActionsInternal = internalMutation({
  args: { workflowRunId: v.id("communityMemberWorkflowRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run || run.status !== "finished") return { status: "stale" };
    const workflow = await ctx.db.get(run.workflowId);
    const membership = await ctx.db.get(run.membershipId);
    if (!workflow || !membership || !communityMembershipRowIsActive(membership)
      || membership.communityId !== workflow.communityId) return { status: "stale" };
    const state = await getMemberMilestone({ ctx, workflowId: workflow._id, membershipId: membership._id });
    const current = resolveCurrentMilestone({ workflow, membership, state });
    if (current.completedAt || run.milestoneKey !== current.milestone.key
      || run.milestoneEnteredAt !== current.milestoneEnteredAt
      || run.activationSequence !== Number(membership.activationSequence ?? 0)
      || run.transitionSeq !== Number(state?.transitionSeq ?? 0)) return { status: "stale" };
    const progress = await readWorkflowActionProgress(ctx, { workflow, membership, milestone: current.milestone,
      milestoneEnteredAt: current.milestoneEnteredAt, transitionSeq: state?.transitionSeq ?? 0 });
    if (progress.scan_truncated) return { status: "completion_scan_truncated" };
    const completed = progress.actions.find(a => a.evidence?.run_id === String(run._id));
    if (!completed) return { status: "incomplete" };
    for (const automation of current.milestone.automations) {
      if (automation.trigger.type !== "previous_action_completed"
        || automation.trigger.predecessorActionKey !== completed.action_key
        || !workflowSequenceCompletionIsNew(automation, completed.evidence!.completed_at, run.workflowRevision)) continue;
      await executeWorkflowAutomation({ ctx, workflow, membership, current, automation,
        workflowPreviousRunId: run._id,
        timerReceiptRef: workflowSequenceReceipt({ ...run, actionSnapshot: automation.action }) });
    }
    if (current.milestone.goal?.trim()) {
      const review = await readCompletionReviewSnapshot(ctx, workflow, membership);
      if (!review || !review.progress.actions.some(a => a.evidence?.run_id === String(run._id))) return { status: "not_eligible" };
      const existing = await ctx.db.query("communityMemberWorkflowRuns")
        .withIndex("by_workflow_membership_trigger_automation", q => q.eq("workflowId", workflow._id)
          .eq("membershipId", membership._id).eq("triggerReceiptRef", review.receiptRef).eq("automationKey", COMPLETION_REVIEW_KEY)).first();
      if (existing) return { status: "already_reviewed" };
      const nowMs = Date.now();
      const reviewRunId = await ctx.db.insert("communityMemberWorkflowRuns", {
        communityId: workflow.communityId, workflowId: workflow._id, membershipId: membership._id,
        activationSequence: membership.activationSequence ?? 0, transitionSeq: state?.transitionSeq ?? 0,
        milestoneKey: current.milestone.key, milestoneName: current.milestone.name, milestoneEnteredAt: current.milestoneEnteredAt,
        milestoneContextSnapshot: { goal: current.milestone.goal, instructions: current.milestone.instructions ?? "" },
        workflowRevision: workflow.revision, automationKey: COMPLETION_REVIEW_KEY, triggerType: "all_actions_complete",
        triggerReceiptRef: review.receiptRef, completionReviewSnapshot: review.snapshot,
        actionSnapshot: { key: COMPLETION_REVIEW_KEY, type: "evaluate_goal" }, status: "running", createdAt: nowMs, updatedAt: nowMs,
      });
      const intake = await intakeCommunityAgentWorkflowAction({ ctx, communityId: workflow.communityId,
        requesterUserId: membership.userId, workflowRunId: reviewRunId, workflowActionKey: COMPLETION_REVIEW_KEY,
        workflowPromptSnapshot: WORKFLOW_ASSESSMENT_PROMPT, workflowAssessment: true, workflowCompletionReview: true, nowMs });
      const admitted = intake.status === "queued" || intake.status === "duplicate";
      await ctx.db.patch(reviewRunId, { status: admitted ? "finished" : "failed", finishedAt: nowMs, updatedAt: nowMs,
        ...(admitted ? {} : { errorCode: intake.intake_reason }),
        actionResult: { actionKey: COMPLETION_REVIEW_KEY, status: admitted ? "complete" : "failed",
          ...(intake.request_id ? { serveRequestId: ctx.db.normalizeId("communityAgentServeRequests", intake.request_id)! } : {}) } });
      return { status: admitted ? "review_queued" : "review_unavailable" };
    }
    return transitionMemberForWorkflowAction({ ctx, workflowRunId: run._id, automaticCompletion: true,
      actionKey: "all_actions_complete", expectedWorkflowRevision: workflow.revision,
      expectedMilestoneKey: current.milestone.key, expectedMilestoneEnteredAt: current.milestoneEnteredAt, nowMs: Date.now() });
  },
});

export const applyCompletedGoalReviewInternal = internalMutation({
  args: { workflowRunId: v.id("communityMemberWorkflowRuns") },
  handler: async (ctx, { workflowRunId }) => {
    const run = await ctx.db.get(workflowRunId);
    if (!run || run.triggerType !== "all_actions_complete" || run.goalAssessment?.verdict !== "achieved" || run.errorCode) return { status: "not_eligible" };
    try {
      // Catch only read-only preflight failures. A writer failure must roll back
      // the entire mutation, never commit a partially applied transition.
      const replay = await getTransitionByRunAction({ ctx, workflowRunId, actionKey: COMPLETION_REVIEW_KEY });
      if (replay) return { transitionId: replay._id, completedWorkflow: replay.completedWorkflow, replayed: true };
      const request = run.actionResult?.serveRequestId ? await ctx.db.get(run.actionResult.serveRequestId) : null;
      if (!request) throw new Error("workflow_assessment_stale");
      const { review } = await requireCompletionReview(ctx, request, true);
      if (review.current.milestone.requireHumanApproval) return { status: "awaiting_human_approval" as const };
    } catch (error) {
      if (!(error instanceof Error) || !/^(workflow_|community_member_workflow_)/.test(error.message)) throw error;
      await ctx.db.patch(run._id, { errorCode: error.message, updatedAt: Date.now() });
      return { status: "stale", reason: error.message };
    }
    return await transitionMemberForWorkflowAction({ ctx, workflowRunId, completedGoalReview: true,
      actionKey: COMPLETION_REVIEW_KEY, expectedWorkflowRevision: run.workflowRevision,
      expectedMilestoneKey: run.milestoneKey, expectedMilestoneEnteredAt: run.milestoneEnteredAt, nowMs: Date.now() });
  },
});

export const retryBuilderMemberGoalReview = mutation({
  args: { ...managerIdentityArgs, communityId: v.id("communities"), membershipId: v.id("communityMemberships"),
    expectedWorkflowId: v.id("communityMemberWorkflows"), expectedWorkflowRevision: v.number(),
    expectedMilestoneKey: v.string(), expectedMilestoneEnteredAt: v.number(),
    expectedActivationSequence: v.number(), expectedTransitionSeq: v.number(), expectedReceiptRef: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireWorkflowManager({ ctx, ...args });
    const workflow = await getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId });
    const membership = await ctx.db.get(args.membershipId);
    if (!workflow || workflow._id !== args.expectedWorkflowId || workflow.revision !== args.expectedWorkflowRevision
      || !membership || membership.communityId !== args.communityId || !communityMembershipRowIsActive(membership))
      throw new Error("community_member_workflow_goal_review_authority_changed");
    const review = await readCompletionReviewSnapshot(ctx, workflow, membership);
    if (!review || review.receiptRef !== args.expectedReceiptRef
      || review.current.milestone.key !== args.expectedMilestoneKey
      || review.current.milestoneEnteredAt !== args.expectedMilestoneEnteredAt
      || Number(membership.activationSequence ?? 0) !== args.expectedActivationSequence
      || Number(review.state?.transitionSeq ?? 0) !== args.expectedTransitionSeq)
      throw new Error("community_member_workflow_goal_review_evidence_changed");
    const run = await getWorkflowRunByTrigger({ ctx, workflowId: workflow._id, membershipId: membership._id,
      triggerReceiptRef: review.receiptRef, automationKey: COMPLETION_REVIEW_KEY });
    const request = run?.actionResult?.serveRequestId ? await ctx.db.get(run.actionResult.serveRequestId) : null;
    if (!run || run.status !== "failed" || run.actionResult?.status !== "failed" || run.goalAssessment
      || run.completionReviewRetry || run.completionReviewSnapshot !== review.snapshot
      || run.workflowRevision !== workflow.revision || run.milestoneKey !== review.current.milestone.key
      || run.milestoneEnteredAt !== review.current.milestoneEnteredAt
      || run.activationSequence !== Number(membership.activationSequence ?? 0)
      || run.transitionSeq !== Number(review.state?.transitionSeq ?? 0)
      || !request || request.status !== "skipped" || request.attempt !== undefined || request.runId
      || request.workflowRunId !== run._id || request.workflowAssessment === false
      || request.workflowCompletionReview === false || request.communityId !== args.communityId
      || request.requesterUserId !== membership.userId || request.sponsorUserId !== membership.userId)
      throw new Error("community_member_workflow_goal_review_retry_unavailable");
    const nowMs = Date.now();
    await ctx.db.patch(run._id, { status: "running", errorCode: undefined, updatedAt: nowMs });
    const intake = await intakeCommunityAgentWorkflowAction({ ctx, communityId: args.communityId,
      requesterUserId: membership.userId, workflowRunId: run._id, workflowActionKey: COMPLETION_REVIEW_KEY,
      workflowPromptSnapshot: WORKFLOW_ASSESSMENT_PROMPT, workflowAssessment: true,
      workflowCompletionReview: true, retrySkippedRequestId: request._id, nowMs });
    if (intake.status !== "queued" || intake.request_id !== String(request._id)) {
      // A failed re-admission changes nothing, including the one allowed retry.
      throw new Error(`community_member_workflow_goal_review_still_unavailable:${intake.intake_reason}`);
    }
    await ctx.db.patch(run._id, { status: "finished", finishedAt: nowMs, updatedAt: nowMs,
      completionReviewRetry: { requestedAt: nowMs, requestedByUserId: actor.userId,
        originalIntakeReason: request.intakeReason },
      actionResult: { actionKey: COMPLETION_REVIEW_KEY, status: "complete", serveRequestId: request._id } });
    return { status: "review_queued" as const };
  },
});

export const forceBuilderMemberMilestone = mutation({
  args: { ...managerIdentityArgs, communityId: v.id("communities"), membershipId: v.id("communityMemberships"),
    expectedWorkflowId: v.id("communityMemberWorkflows"),
    expectedWorkflowRevision: v.number(), expectedMilestoneKey: v.string(), expectedMilestoneEnteredAt: v.number(),
    expectedActivationSequence: v.number(), expectedTransitionSeq: v.number() },
  handler: async (ctx, args) => {
    const actor = await requireWorkflowManager({ ctx, ...args });
    const workflow = await getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId });
    if (!workflow || workflow._id !== args.expectedWorkflowId) throw new Error("community_member_workflow_transition_authority_changed");
    return transitionMemberForWorkflowAction({ ctx, actionKey: "builder_forced_override", nowMs: Date.now(),
      expectedWorkflowRevision: args.expectedWorkflowRevision, expectedMilestoneKey: args.expectedMilestoneKey,
      expectedMilestoneEnteredAt: args.expectedMilestoneEnteredAt,
      override: { workflowId: workflow._id, membershipId: args.membershipId, actorUserId: actor.userId,
        activationSequence: args.expectedActivationSequence, transitionSeq: args.expectedTransitionSeq } });
  },
});

type MilestoneApprovalArgs = {
  communityId: Id<"communities">; membershipId: Id<"communityMemberships">;
  expectedWorkflowId: Id<"communityMemberWorkflows">; expectedWorkflowRevision: number;
  expectedMilestoneKey: string; expectedMilestoneEnteredAt: number;
  expectedActivationSequence: number; expectedTransitionSeq: number;
};
async function approveMemberMilestoneCore(ctx: MutationCtx, args: MilestoneApprovalArgs, actorUserId: Id<"users">) {
    const workflow = await getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId });
    if (!workflow || workflow._id !== args.expectedWorkflowId) throw new Error("community_member_workflow_transition_authority_changed");
    return transitionMemberForWorkflowAction({ ctx, actionKey: "human_approved", nowMs: Date.now(),
      expectedWorkflowRevision: args.expectedWorkflowRevision, expectedMilestoneKey: args.expectedMilestoneKey,
      expectedMilestoneEnteredAt: args.expectedMilestoneEnteredAt,
      approval: { workflowId: workflow._id, membershipId: args.membershipId, actorUserId: actorUserId,
        activationSequence: args.expectedActivationSequence, transitionSeq: args.expectedTransitionSeq } });
}

export const approveBuilderMemberMilestone = mutation({
  args: { ...managerIdentityArgs, communityId: v.id("communities"), membershipId: v.id("communityMemberships"),
    expectedWorkflowId: v.id("communityMemberWorkflows"), expectedWorkflowRevision: v.number(),
    expectedMilestoneKey: v.string(), expectedMilestoneEnteredAt: v.number(),
    expectedActivationSequence: v.number(), expectedTransitionSeq: v.number() },
  handler: async (ctx, args) => {
    const actor = await requireWorkflowManager({ ctx, ...args });
    return approveMemberMilestoneCore(ctx, args, actor.userId);
  },
});

// Current authority, exact observed decision, transition and receipt share one transaction.
export const approveObservedMilestoneInternal = internalMutation({ args: {
  communityId: v.id("communities"), userId: v.id("users"), membershipId: v.id("communityMemberships"),
  principalKind: v.union(v.literal("personal_agent"), v.literal("external_mcp")),
  expectedActivationSequence: v.number(), reviewRef: v.string(), idempotencyKey: v.string(),
}, handler: async (ctx, args): Promise<Record<string, any>> => {
  const { community } = await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  const membership = await ctx.db.get(args.membershipId);
  if (!membership || membership.communityId !== args.communityId || !communityMembershipRowIsActive(membership))
    throw new Error("workflow_approval_unavailable");
  await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: membership.userId });
  const pair = await getUniqueCommunityMembershipByPair({ ctx, communityId: args.communityId, userId: membership.userId });
  if (pair?._id !== membership._id || (membership.activationSequence ?? 0) !== args.expectedActivationSequence)
    throw new Error("workflow_approval_unavailable");
  if (!Number.isSafeInteger(args.expectedActivationSequence) || args.expectedActivationSequence < 0 ||
      !/^workflow-approval:v1:[a-f0-9]{64}$/.test(args.reviewRef) || !args.idempotencyKey.trim() || args.idempotencyKey.length > 200)
    throw new Error("invalid_tool_args");
  const scope = { communityId: args.communityId, userId: args.userId, principalKind: args.principalKind,
    toolName: "polynet_call" as const, idempotencyKey: args.idempotencyKey };
  const requestFingerprint = JSON.stringify(["community.workflow.approve_milestone", 1, args.membershipId, args.expectedActivationSequence, args.reviewRef]);
  const reservation = await ctx.runMutation(internal.polynetCanonicalReceipts.reserveCanonicalOperationReceiptInternal, { ...scope, requestFingerprint });
  if (!reservation.ok) return reservation;
  if (reservation.status === "completed") {
    const value = reservation.result;
    return { ...value, deduped: true, receipt: { ...value.receipt, deduped: true } };
  }
  if (!reservation.attemptToken || !reservation.leaseExpiresAt || reservation.leaseExpiresAt <= Date.now()) throw new Error("operation_in_progress");
  const workflow = await getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId });
  const observation = workflow ? await readWorkflowApprovalObservation(ctx, { workflow, membership }) : null;
  if (!workflow || !observation || observation.review_ref !== args.reviewRef) throw new Error("workflow_approval_unavailable");
  const state = await getMemberMilestone({ ctx, workflowId: workflow._id, membershipId: membership._id });
  const current = resolveCurrentMilestone({ workflow, membership, state });
  const result = await approveMemberMilestoneCore(ctx, { communityId: args.communityId, membershipId: membership._id,
    expectedWorkflowId: workflow._id, expectedWorkflowRevision: workflow.revision,
    expectedMilestoneKey: current.milestone.key, expectedMilestoneEnteredAt: current.milestoneEnteredAt,
    expectedActivationSequence: args.expectedActivationSequence, expectedTransitionSeq: state?.transitionSeq ?? 0 }, args.userId);
  if (!("transitionId" in result)) throw new Error("workflow_approval_unavailable");
  const value = { ok: true, operation: "community.workflow.approve_milestone", deduped: false,
    result: { status: "approved", transition_ref: `workflow-transition:${result.transitionId}`,
      completed_workflow: result.completedWorkflow, membership_ref: `membership:${membership._id}`, review_ref: args.reviewRef },
    receipt: { contract: "polynet.canonical.operation:v1", tool: "polynet_call", principal_kind: args.principalKind,
      community_id: String(args.communityId), community_slug: community.slug, authority_lane: "builder",
      relation: community.ownerId === args.userId ? "owner" : "admin", idempotency_key: args.idempotencyKey, deduped: false } };
  await ctx.runMutation(internal.polynetCanonicalReceipts.completeCanonicalOperationReceiptInternal,
    { ...scope, requestFingerprint, attemptToken: reservation.attemptToken, result: value });
  return value;
} });

async function executeWorkflowAutomation(args: {
  ctx: any;
  objectType?: "root" | "reply";
  row?: ChannelContributionRow;
  timerReceiptRef?: string;
  workflowPreviousRunId?: any;
  workflowTimerId?: any;
  workflowFormRequestId?: any;
  workflowJoin?: any;
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
    activationSequence: Number(args.membership.activationSequence ?? 0),
    transitionSeq: Number((await getMemberMilestone({ ctx: args.ctx,
      workflowId: args.workflow._id, membershipId: args.membership._id }))?.transitionSeq ?? 0),
    communityId: args.workflow.communityId,
    workflowId: args.workflow._id,
    membershipId: args.membership._id,
    milestoneKey: args.current.milestone.key,
    milestoneName: args.current.milestone.name,
    milestoneContextSnapshot: { instructions: args.current.milestone.instructions ?? "", goal: args.current.milestone.goal ?? "" },
    milestoneEnteredAt: args.current.milestoneEnteredAt,
    workflowRevision: args.workflow.revision,
    automationKey: args.automation.key,
    triggerType: args.automation.trigger.type,
    triggerSnapshot: args.automation.trigger,
    triggerReceiptRef,
    ...(args.workflowPreviousRunId ? { predecessorRunId: args.workflowPreviousRunId } : {}),
    actionSnapshot: args.automation.action,
    status: "running",
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  try {
    if (args.workflowJoin) {
      if (args.automation.trigger.type !== "member_joined") throw new Error("workflow_join_action_invalid");
      // Isolate provisioning writes so a failure can retain a receipt without a partial room.
      let result;
      try {
        result = await args.ctx.runMutation((internal as any).communityMemberWorkflows.executeJoinedMemberActionInternal,
          { ...args.workflowJoin, automationKey: args.automation.key, workflowRunId });
      } catch (error) {
        const errorCode = String(error instanceof Error ? error.message : error).slice(0, 120);
        await args.ctx.db.patch(workflowRunId, { status: "failed", actionResult: {
          actionKey: args.automation.action.key, status: "failed", errorCode,
        }, errorCode, finishedAt: nowMs, updatedAt: nowMs });
        return { status: "action_failed" as const, workflow_run_id: String(workflowRunId), replayed: false };
      }
      await args.ctx.db.patch(workflowRunId, { status: "finished", actionResult: {
        actionKey: args.automation.action.key, status: "complete", ...result,
      }, finishedAt: nowMs, updatedAt: nowMs });
      await args.ctx.scheduler.runAfter(0, internal.communityMemberWorkflows.reconcileCompletedWorkflowActionsInternal, { workflowRunId });
      return { status: args.automation.action.type === "request_form" ? "form_requested" as const : "service_channel_ready" as const,
        workflow_run_id: String(workflowRunId), replayed: false };
    }
    if (args.automation.action.type === "request_form") {
      const formRequestId = await assignWorkflowForm({ ...args, workflowRunId });
      await args.ctx.db.patch(workflowRunId, { status: "finished", actionResult: {
        actionKey: args.automation.action.key, status: "complete", resultCode: "form_requested", formRequestId,
      }, finishedAt: nowMs, updatedAt: nowMs });
      return { status: "form_requested" as const, workflow_run_id: String(workflowRunId), replayed: false };
    }
    if (args.automation.action.type === "prompt_agent") {
      if (!args.workflowPreviousRunId && !args.workflowTimerId && !args.workflowFormRequestId && (!args.row || !args.objectType || args.automation.trigger.type !== "member_contributed")) {
        throw new Error("community_member_workflow_timer_action_invalid");
      }
      const intake = await intakeCommunityAgentWorkflowAction({
        ctx: args.ctx,
        communityId: args.workflow.communityId,
        workflowPreviousRunId: args.workflowPreviousRunId,
        workflowTimerId: args.workflowTimerId,
        workflowFormRequestId: args.workflowFormRequestId,
        rootId: args.row ? (args.objectType === "root" ? args.row._id : (args.row as any).rootId) : undefined,
        replyId: args.objectType === "reply" ? args.row?._id : undefined,
        requesterUserId: args.membership.userId,
        workflowRunId,
        workflowActionKey: args.automation.action.key,
        workflowPromptSnapshot: args.automation.action.prompt,
        workflowAssessment: false,
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
    throw new Error("workflow_action_unsupported");
  } catch (error) {
    const errorCode = String(
      error instanceof Error ? error.message : error ?? "workflow_action_failed",
    ).slice(0, 120);
    // Capacity rejects before any assignment write. It may be recorded without
    // rolling back the source event or blocking independent completion rules.
    const capacityRejected = args.automation.action.type === "request_form" && errorCode === "form_pending_limit_reached";
    if (!capacityRejected && (args.workflowTimerId || args.automation.action.type !== "prompt_agent")) throw error;
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

// The submitted request is the exact replay receipt for follow-on actions.
export async function processSubmittedWorkflowForm(ctx: any, request: any) {
  if (!request || request.status !== "submitted") throw new Error("form_submission_missing");
  if (!await requestIsCurrent(ctx, request)) throw new Error("form_request_expired");
  if (request.workflowRunId) await ctx.scheduler.runAfter(0, internal.communityMemberWorkflows.reconcileCompletedWorkflowActionsInternal,
    { workflowRunId: request.workflowRunId });
  const workflow = await ctx.db.get(request.workflowId);
  const membership = await ctx.db.get(request.membershipId);
  const state = await getMemberMilestone({ ctx, workflowId: workflow._id, membershipId: membership._id });
  const current = resolveCurrentMilestone({ workflow, membership, state });
  const matches = current.milestone.automations.filter((a: CommunityMemberWorkflowAutomation) =>
    a.trigger.type === "form_submitted" && a.trigger.formKey === request.formKey);
  if (new Set(matches.map((a: CommunityMemberWorkflowAutomation) => a.action.type)).size !== matches.length) return;
  for (const automation of matches) {
    await executeWorkflowAutomation({ ctx, workflow, membership, current, automation,
      workflowFormRequestId: request._id, timerReceiptRef: `form_submission:${request._id}` });
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
  if (row.createdAt < Math.max(current.milestoneEnteredAt, membership!.activatedAt ?? membership!.createdAt)) {
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
  const results = [];
  for (const automation of automations) {
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
  return { status: "handled" as const, results };
}

export const handleFirstMemberJoinInternal = internalMutation({
  args: workflowJoinArgs,
  handler: async (ctx, args) => {
    const resolved = await resolveFirstMemberWorkflowJoin(ctx, args);
    if (!resolved) return { status: "stale" };
    const results = [];
    for (const automation of resolved.current.milestone.automations.filter(a => a.trigger.type === "member_joined")) {
      results.push(await executeWorkflowAutomation({ ctx, ...resolved, automation, workflowJoin: args,
        timerReceiptRef: `member_joined:${args.membershipId}:1` }));
    }
    return results.length === 1 ? results[0] : { status: "handled", results };
  },
});

export const executeJoinedMemberActionInternal = internalMutation({
  args: { ...workflowJoinArgs, automationKey: v.string(), workflowRunId: v.id("communityMemberWorkflowRuns") },
  handler: async (ctx, args) => {
    const resolved = await resolveFirstMemberWorkflowJoin(ctx, args);
    if (!resolved) throw new Error("workflow_join_authority_changed");
    const { workflow, membership, current } = resolved;
    await requireCommunityManager({ ctx, communityId: workflow.communityId, userId: workflow.updatedByUserId });
    const automation = current.milestone.automations.find(a => a.key === args.automationKey && a.trigger.type === "member_joined");
    const run = await ctx.db.get(args.workflowRunId);
    if (!automation || !run || run.status !== "running" || run.workflowId !== workflow._id
      || run.communityId !== workflow.communityId || run.milestoneKey !== current.milestone.key
      || run.milestoneEnteredAt !== current.milestoneEnteredAt || run.triggerType !== "member_joined"
      || run.membershipId !== membership._id || run.automationKey !== automation.key
      || run.workflowRevision !== workflow.revision || run.triggerReceiptRef !== `member_joined:${membership._id}:1`
      || JSON.stringify(run.actionSnapshot) !== JSON.stringify(automation.action)) throw new Error("workflow_join_action_invalid");
    if (automation.action.type === "request_form") {
      return { resultCode: "form_requested", formRequestId: await assignWorkflowForm({ ctx, ...resolved, automation, workflowRunId: run._id }) };
    }
    if (automation.action.type !== "create_service_channel") throw new Error("workflow_join_action_invalid");
    const result = await provisionJoinedMemberServiceChannel(ctx, args, resolved);
    return { resultCode: result.resultCode, serviceChannelId: result.channelId };
  },
});

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
