import { listMemberVisibleLessonPages, readProgressRows } from "./communityResourceProgress";
import { communityTracksFinishedByLesson } from "./communityLessonTracks";
import { COMMUNITY_MAIN_TRACK_KEY } from "../shared/communityLessonTracks";
import { setValue as setClientPropertyValue } from "./communityClients";
import { normalizeCommunityClientPropertyValue } from "../shared/communityClients";
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
import { setChannelParticipantCore } from "./communityChannelParticipants";
import { enrollWorkflowMilestoneTimers, resolveWorkflowTimer, startWorkflowSourceTimer } from "./communityMemberWorkflowTimerCore";
import {
  COMMUNITY_MEMBER_WORKFLOW_MAX_AUTOMATIONS_PER_MILESTONE,
  COMMUNITY_MEMBER_WORKFLOW_MAX_MILESTONES,
  COMMUNITY_MEMBER_WORKFLOW_MIN_MILESTONES,
  COMMUNITY_MEMBER_WORKFLOW_EMAIL_BODY_MAX_LENGTH,
  COMMUNITY_MEMBER_WORKFLOW_EMAIL_SUBJECT_MAX_LENGTH,
  normalizeCommunityMemberWorkflowActionKey,
  normalizeCommunityMemberWorkflowAutomationKey,
  normalizeCommunityMemberWorkflowMilestoneKey,
  normalizeCommunityMemberWorkflowMilestoneName,
  normalizeCommunityMemberWorkflowStageColor,
  normalizeCommunityMemberWorkflowPrompt,
  normalizeWorkflowAgentSees,
  normalizeWorkflowCondition,
  normalizeWorkflowOffsetDays,
  workflowPropertyDateDueAt,
  workflowConditionClauses,
  workflowConditionGroupHolds,
  workflowConditionHolds,
  workflowRuleUsesTimer,
  workflowRunWasSkipped,
  normalizeWorkflowMilestoneContext,
  normalizeCommunityMemberWorkflowSourceRef,
  normalizeWorkflowDelayMinutes,
  normalizeWorkflowStageDelayMinutes,
  workflowTriggerIdentity,
  workflowActionIsInstant,
  workflowTriggerIsReactive,
  splitPausedWorkflowAutomations,
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
  normalizeOptionalUrl,
  welcomeLessonIsLive,
  type CommunityMembershipLike,
  listActiveTestMemberUserIds,
} from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { recordWorkflowStageChange } from "./communityWorkflowChangeLog";
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
import { normalizeWelcomeLayout, welcomeLayoutIssue, welcomeLayoutSteps, WELCOME_LESSONS_MAX, type WelcomeBlock } from "../shared/communityWelcomeLayout";
import { intakeCommunityAgentWorkflowAction } from "./communityAgentConciergeCore";
import { resolveNotificationRecipientSource } from "./communityNotificationAccess";
import { bindMemberServiceChannel } from "./communityMemberServiceChannelCore";
import { testMemberAutoplayIsOn, testMemberAutoplayPreviewsAgent } from "./communityTestMemberCore";
import { sendWorkflowEmail } from "./communityWorkflowEmailCore";

// Departed members' positions cleared per call; past this the call clears a
// batch and asks the caller to call again (the gateway does), so any number clears.
const DEPARTED_POSITIONS_PER_CALL = 1_000;

export const managerIdentityArgs = {
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

// One "Only if" clause: a member property compared with a value.
const workflowConditionClauseValidator = v.object({
  propertyKey: v.string(),
  op: v.union(v.literal("is"), v.literal("is_not"), v.literal("is_set"), v.literal("is_empty")),
  value: v.optional(v.union(v.string(), v.number(), v.boolean())),
});

export const automationInputValidator = v.object({
  key: v.optional(v.string()),
  condition: v.optional(v.object({
    propertyKey: v.string(),
    op: v.union(v.literal("is"), v.literal("is_not"), v.literal("is_set"), v.literal("is_empty")),
    value: v.optional(v.union(v.string(), v.number(), v.boolean())),
    // More clauses, joined by match (all = AND, any = OR); otherwise runs when they don't hold.
    match: v.optional(v.union(v.literal("all"), v.literal("any"))),
    also: v.optional(v.array(workflowConditionClauseValidator)),
    otherwise: v.optional(v.boolean()),
  })),
  sequenceEnabledAt: v.optional(v.number()),
  sequenceEnabledRevision: v.optional(v.number()),
  // Server-owned; accepted so a rule read from /builder/settings.json can be sent back as is.
  timerGeneration: v.optional(v.string()),
  trigger: v.union(
    v.object({ type: v.literal("member_joined") }),
    v.object({ type: v.literal("previous_action_completed"), predecessorActionKey: v.string(), delayMinutes: v.optional(v.number()) }),
    v.object({ type: v.literal("form_submitted"), formKey: v.string() }),
    v.object({ type: v.literal("member_contributed"), channelId: v.optional(v.string()) }),
    v.object({ type: v.literal("milestone_elapsed"), delayMinutes: v.number(), nudge: v.optional(v.boolean()) }),
    v.object({ type: v.literal("lesson_completed"), resourceId: v.optional(v.string()) }),
    v.object({ type: v.literal("course_completed"), moduleId: v.optional(v.string()) }),
    v.object({ type: v.literal("track_completed"), trackKey: v.optional(v.string()) }),
    v.object({ type: v.literal("client_property_changed"), propertyKey: v.string(), value: v.optional(v.union(v.string(), v.number(), v.boolean())) }),
    v.object({ type: v.literal("property_date"), propertyKey: v.string(), offsetDays: v.number() }),
    v.object({ type: v.literal("offer_started"), offerKey: v.optional(v.string()) }),
    v.object({ type: v.literal("offer_ended"), offerKey: v.optional(v.string()) }),
    v.object({ type: v.literal("pod_member_added"), channelId: v.optional(v.string()) }),
  ),
  action: v.union(
    v.object({ key: v.optional(v.string()), type: v.literal("create_service_channel") }),
    v.object({ key: v.optional(v.string()), type: v.literal("request_form"), formKey: v.string() }),
    v.object({
      key: v.optional(v.string()),
      type: v.literal("prompt_agent"),
      prompt: v.string(),
      sees: v.optional(v.array(v.string())),
    }),
    v.object({
      key: v.optional(v.string()),
      type: v.literal("set_client_property"),
      propertyKey: v.string(),
      value: v.union(v.string(), v.number(), v.boolean(), v.array(v.string()), v.null()),
    }),
    v.object({ key: v.optional(v.string()), type: v.literal("send_email"), subject: v.string(), body: v.string() }),
    v.object({ key: v.optional(v.string()), type: v.literal("set_pod_member"), channelId: v.string(), active: v.boolean() }),
  ),
  /** Switched off: kept but never run. Steps after it are off too. */
  paused: v.optional(v.boolean()),
});

function normalizeWorkflowEmailAction(key: string, input: { subject: string; body: string }): CommunityMemberWorkflowAction {
  const subject = String(input.subject ?? "").replace(/\s+/g, " ").trim();
  const body = String(input.body ?? "").replace(/\r\n?/g, "\n").trim();
  if (!subject || subject.length > COMMUNITY_MEMBER_WORKFLOW_EMAIL_SUBJECT_MAX_LENGTH) throw new Error("workflow_email_subject_invalid");
  if (!body || body.length > COMMUNITY_MEMBER_WORKFLOW_EMAIL_BODY_MAX_LENGTH) throw new Error("workflow_email_body_invalid");
  return { key, type: "send_email", subject, body };
}

function normalizeExpectedRevision(value: unknown): number {
  const revision = Number(value);
  if (!Number.isFinite(revision) || revision < 0) {
    throw new Error("community_member_workflow_revision_invalid");
  }
  return Math.floor(revision);
}

export async function requireWorkflowManager(args: {
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
            ...(() => { const sees = normalizeWorkflowAgentSees(input.action.sees); return sees ? { sees } : {}; })(),
          }
        : input.action.type === "request_form" ? { key: actionKey, type: "request_form", formKey: input.action.formKey }
        : input.action.type === "set_client_property"
        ? { key: actionKey, type: "set_client_property", propertyKey: String(input.action.propertyKey).trim(), value: input.action.value }
        : input.action.type === "send_email" ? normalizeWorkflowEmailAction(actionKey, input.action)
        : input.action.type === "set_pod_member" ? { key: actionKey, type: "set_pod_member", channelId: String(input.action.channelId).trim(), active: input.action.active === true }
        : { key: actionKey, type: "create_service_channel" };
    if (action.type === "set_client_property" && !action.propertyKey) throw new Error("client_property_required");
    if (action.type === "set_pod_member" && !action.channelId) throw new Error("workflow_pod_required");
    if ((action.type === "request_form" && !action.formKey.trim()) || (input.trigger.type === "form_submitted" && !input.trigger.formKey.trim())) throw new Error("form_required");
    if ((action.type === "create_service_channel" && input.trigger.type !== "member_joined")
      || (input.trigger.type === "member_joined" && action.type !== "create_service_channel" && action.type !== "request_form")) throw new Error("workflow_join_action_invalid");
    // Lesson and course completion request a Form, write a property, or ask the
    // agent (through a timer that starts the moment the lesson is done).
    if ((input.trigger.type === "lesson_completed" || input.trigger.type === "course_completed" || input.trigger.type === "track_completed"
        || input.trigger.type === "offer_started" || input.trigger.type === "offer_ended"
        || workflowTriggerIsReactive(input.trigger.type))
      && action.type !== "request_form" && action.type !== "prompt_agent" && !workflowActionIsInstant(action.type)) {
      throw new Error("lesson_trigger_action_invalid");
    }
    // A nudge is an agent check-in; nothing else may skip holding the stage.
    if (input.trigger.type === "milestone_elapsed" && input.trigger.nudge === true && action.type !== "prompt_agent") {
      throw new Error("workflow_nudge_action_invalid");
    }
    if (input.trigger.type === "form_submitted") {
      if (action.type === "request_form") throw new Error("form_submission_action_invalid");
      const submissionLane = action.type === "set_client_property"
        ? `${action.type}:${action.propertyKey}:${input.trigger.formKey}` : `${action.type}:${input.trigger.formKey}`;
      if (submittedForms.has(submissionLane)) throw new Error("form_submission_trigger_duplicate");
      submittedForms.add(submissionLane);
    }
    const sameSequence = existing?.trigger.type === "previous_action_completed"
      && workflowTriggerIdentity(existing.trigger) === workflowTriggerIdentity(input.trigger)
      && existing.action.key === action.key && existing.action.type === action.type
      && (action.type !== "prompt_agent" || (existing.action.type === "prompt_agent" && existing.action.prompt === action.prompt))
      && (action.type !== "request_form" || (existing.action.type === "request_form" && existing.action.formKey === action.formKey))
      && action.type !== "set_client_property";
    const condition = normalizeWorkflowCondition(input.condition);
    const waitMinutes = input.trigger.type === "previous_action_completed" && input.trigger.delayMinutes
      ? normalizeWorkflowDelayMinutes(input.trigger.delayMinutes) : 0;
    const usesTimer = workflowRuleUsesTimer({ trigger: input.trigger.type === "previous_action_completed"
      ? { type: "previous_action_completed", predecessorActionKey: "", ...(waitMinutes ? { delayMinutes: waitMinutes } : {}) } : input.trigger, action });
    return {
      key: automationKey,
      ...(condition ? { condition } : {}),
      ...(input.trigger.type === "previous_action_completed" ? { sequenceEnabledAt:
        sameSequence ? existing.sequenceEnabledAt ?? Date.now() : Date.now(),
        sequenceEnabledRevision: sameSequence ? existing.sequenceEnabledRevision ?? revision : revision } : {}),
      ...(usesTimer ? {
        timerGeneration: existing && existing.trigger.type === input.trigger.type && workflowRuleUsesTimer(existing)
          ? existing.timerGeneration ?? crypto.randomUUID() : crypto.randomUUID(),
      } : {}),
      trigger: input.trigger.type === "previous_action_completed" ? { type: "previous_action_completed", predecessorActionKey: input.trigger.predecessorActionKey, ...(waitMinutes ? { delayMinutes: waitMinutes } : {}) }
        : input.trigger.type === "member_joined" ? { type: "member_joined" }
        : input.trigger.type === "form_submitted" ? { type: "form_submitted", formKey: input.trigger.formKey }
        : input.trigger.type === "lesson_completed" ? { type: "lesson_completed", ...(input.trigger.resourceId ? { resourceId: input.trigger.resourceId } : {}) }
        : input.trigger.type === "course_completed" ? { type: "course_completed", ...(input.trigger.moduleId ? { moduleId: input.trigger.moduleId } : {}) }
        : input.trigger.type === "track_completed" ? { type: "track_completed", ...(input.trigger.trackKey ? { trackKey: input.trigger.trackKey } : {}) }
        : input.trigger.type === "property_date" ? { type: "property_date", propertyKey: input.trigger.propertyKey.trim(), offsetDays: normalizeWorkflowOffsetDays(input.trigger.offsetDays) }
        : input.trigger.type === "client_property_changed" ? { type: "client_property_changed", propertyKey: input.trigger.propertyKey.trim(),
          ...(input.trigger.value === undefined || input.trigger.value === "" ? {} : { value: typeof input.trigger.value === "string" ? input.trigger.value.trim().slice(0, 200) : input.trigger.value }) }
        : input.trigger.type === "offer_started" || input.trigger.type === "offer_ended"
        ? { type: input.trigger.type, ...(input.trigger.offerKey ? { offerKey: input.trigger.offerKey } : {}) }
        : input.trigger.type === "pod_member_added" ? { type: "pod_member_added", ...(input.trigger.channelId ? { channelId: input.trigger.channelId } : {}) }
        : input.trigger.type === "milestone_elapsed"
        ? { type: "milestone_elapsed", delayMinutes: normalizeWorkflowStageDelayMinutes(input.trigger.delayMinutes, input.trigger.nudge === true), ...(input.trigger.nudge === true ? { nudge: true } : {}) }
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

// A left-out colour keeps the stage's colour; "none" clears it.
function stageColor(value: string | undefined): Pick<CommunityMemberWorkflowMilestone, "color"> {
  const color = value === undefined ? undefined : normalizeCommunityMemberWorkflowStageColor(value);
  return color ? { color } : {};
}

export const createBuilderWorkflowMilestone = mutation({
  args: {
    requireHumanApproval: v.optional(v.boolean()),
    color: v.optional(v.string()),
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
    const context = { instructions: normalizeWorkflowMilestoneContext(args.instructions), goal: normalizeWorkflowMilestoneContext(args.goal), requireHumanApproval: args.requireHumanApproval ?? false,
      ...stageColor(args.color) };
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
    color: v.optional(v.string()),
    instructions: v.optional(v.string()),
    goal: v.optional(v.string()),
    ...managerIdentityArgs,
    communityId: v.id("communities"),
    expectedRevision: v.number(),
    milestoneKey: v.string(),
    name: v.string(),
    automations: v.array(automationInputValidator),
    // Set by the MCP/CLI path (polynetBuilderSettings), never by the app.
    via: v.optional(v.literal("agent")),
    changedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireWorkflowManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    return updateWorkflowStageCore(ctx, userId, args);
  },
});

export type WorkflowStageUpdate = {
  communityId: Id<"communities">; expectedRevision: number; milestoneKey: string; name: string;
  automations: any[]; instructions?: string; goal?: string; requireHumanApproval?: boolean; color?: string;
  via?: "agent"; changedBy?: string;
};

/** Validates and saves one stage. With dryRun it validates only and returns the stage as it would be saved
 *  (proposals from agents are checked this way when they're made, and saved this way when applied). */
export async function updateWorkflowStageCore(ctx: MutationCtx, userId: Id<"users">, args: WorkflowStageUpdate,
  options: { dryRun?: boolean; approvedByUserId?: Id<"users"> } = {}) {
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
      ...(args.color === undefined ? current.color ? { color: current.color } : {} : stageColor(args.color)),
      ...(() => {
        // One list in, so a step can follow any rule; then off rules (and the steps after them) are set aside.
        const all = normalizeAutomations(args.automations, [...(current.automations ?? []), ...(current.pausedAutomations ?? [])], workflow.revision + 1);
        const { active, paused } = splitPausedWorkflowAutomations(all, (_rule, index) => args.automations[index]?.paused === true);
        return { automations: active, ...(paused.length ? { pausedAutomations: paused } : {}) };
      })(),
    };
    const everyRule = [...milestone.automations, ...(milestone.pausedAutomations ?? [])];
    const joinRules = milestone.automations.filter(a => a.trigger.type === "member_joined");
    if (joinRules.length > 0 && milestoneIndex !== 0) throw new Error("workflow_join_requires_first_milestone");
    const joinLanes = joinRules.map(a => a.action.type === "request_form" ? `form:${a.action.formKey}` : a.action.type);
    if (new Set(joinLanes).size !== joinLanes.length) throw new Error("workflow_join_action_duplicate");
    for (const rawChannelId of new Set(everyRule.flatMap((automation) =>
      automation.trigger.type === "member_contributed" && automation.trigger.channelId !== undefined ? [automation.trigger.channelId] : []))) {
      const channelId = ctx.db.normalizeId("communityChannels", rawChannelId);
      const channel = channelId ? await ctx.db.get(channelId) : null;
      if (!channel || channel.communityId !== args.communityId || channel.status !== "active") {
        throw new Error("community_member_workflow_channel_unavailable");
      }
    }
    // A pod is an invite-only channel in this community, a member's personal pod
    // included; the general channel never is.
    const podChannelIds = new Set(everyRule.flatMap((automation) => [
      ...(automation.action.type === "set_pod_member" ? [automation.action.channelId] : []),
      ...(automation.trigger.type === "pod_member_added" && automation.trigger.channelId ? [automation.trigger.channelId] : []),
    ]));
    for (const rawChannelId of podChannelIds) {
      const channelId = ctx.db.normalizeId("communityChannels", rawChannelId);
      const channel = channelId ? await ctx.db.get(channelId) : null;
      if (!channel || channel.communityId !== args.communityId || channel.status !== "active"
        || channel.accessMode !== "restricted" || channel.systemRole === "general") throw new Error("workflow_pod_unavailable");
    }
    for (const automation of everyRule) {
      // The property must exist and the value must fit it now; the run checks
      // again, because the owner can change the property later.
      if (automation.action.type === "set_client_property") {
        const property = await ctx.db.query("communityClientProperties")
          .withIndex("by_community_key", q => q.eq("communityId", args.communityId).eq("key", (automation.action as any).propertyKey))
          .unique();
        if (!property || property.archivedAt) throw new Error("client_property_not_found");
        automation.action.value = normalizeCommunityClientPropertyValue(property, automation.action.value);
      }
      if (automation.trigger.type === "lesson_completed" && automation.trigger.resourceId) {
        const id = ctx.db.normalizeId("communityResources", automation.trigger.resourceId);
        const page = id ? await ctx.db.get(id) : null;
        if (!page || page.communityId !== args.communityId) throw new Error("workflow_lesson_unavailable");
      }
      if (automation.trigger.type === "course_completed" && automation.trigger.moduleId) {
        const id = ctx.db.normalizeId("communityResourceModules", automation.trigger.moduleId);
        const module = id ? await ctx.db.get(id) : null;
        if (!module || module.communityId !== args.communityId) throw new Error("workflow_course_unavailable");
      }
      if (automation.trigger.type === "client_property_changed" || automation.trigger.type === "property_date") {
        const propertyKey = automation.trigger.propertyKey;
        const property = propertyKey ? await ctx.db.query("communityClientProperties")
          .withIndex("by_community_key", q => q.eq("communityId", args.communityId).eq("key", propertyKey)).unique() : null;
        if (!property || property.archivedAt) throw new Error("client_property_not_found");
        if (automation.trigger.type === "property_date" && property.type !== "date") throw new Error("workflow_property_not_a_date");
      }
      if (automation.trigger.type === "track_completed" && automation.trigger.trackKey && automation.trigger.trackKey !== COMMUNITY_MAIN_TRACK_KEY) {
        const trackKey = automation.trigger.trackKey;
        const track = await ctx.db.query("communityLessonTracks")
          .withIndex("by_community_key", q => q.eq("communityId", args.communityId).eq("key", trackKey))
          .unique();
        if (!track || track.archivedAt) throw new Error("workflow_track_unavailable");
      }
      if ((automation.trigger.type === "offer_started" || automation.trigger.type === "offer_ended") && automation.trigger.offerKey) {
        const offerKey = automation.trigger.offerKey;
        const offer = await ctx.db.query("communityOffers")
          .withIndex("by_community_key", q => q.eq("communityId", args.communityId).eq("key", offerKey))
          .unique();
        if (!offer || offer.archivedAt) throw new Error("workflow_offer_unavailable");
      }
    }
    for (const formKey of new Set(everyRule.flatMap(a => [
      ...(a.action.type === "request_form" ? [a.action.formKey] : []),
      ...(a.trigger.type === "form_submitted" ? [a.trigger.formKey] : []),
    ]))) {
      const form = await ctx.db.query("communityForms").withIndex("by_community_key", q => q.eq("communityId", args.communityId).eq("key", formKey)).unique();
      if (!form?.publishedRevision || form.deletedAt) throw new Error("form_not_published");
    }
    if (JSON.stringify(current) === JSON.stringify(milestone)) {
      return {
        workflow_id: String(workflow._id),
        revision: expectedRevision,
        milestone: current,
      };
    }
    if (options.dryRun) return { workflow_id: String(workflow._id), revision: expectedRevision, milestone };
    const revision = expectedRevision + 1;
    await ctx.db.patch(workflow._id, {
      milestones: workflow.milestones.map((item, index) =>
        index === milestoneIndex ? milestone : item,
      ),
      revision,
      updatedByUserId: userId,
      updatedAt: Date.now(),
    });
    await recordWorkflowStageChange(ctx, { communityId: args.communityId, milestoneKey, userId, revision,
      via: args.via ?? "app", changedBy: args.changedBy, approvedByUserId: options.approvedByUserId, before: current, after: milestone });
    if (JSON.stringify(current.automations) !== JSON.stringify(milestone.automations)
      && current.automations.some((a) => workflowRuleUsesTimer(a))) {
      await ctx.scheduler.runAfter(0, internal.communityMemberWorkflows.refreshMilestoneTimersInternal,
        { workflowId: workflow._id, milestoneKey, cursor: null });
    }
    return { workflow_id: String(workflow._id), revision, milestone };
}

// The welcome flow: new members see only the forms the first stage's "member
// joins" rules request until they submit them. Off by default; the gate itself
// lives in requireCommunityChatAccess so every member surface honours it.
export const setBuilderWelcomeGate = mutation({
  args: { ...managerIdentityArgs, communityId: v.id("communities"), expectedRevision: v.number(), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const { userId } = await requireWorkflowManager({ ctx, communityId: args.communityId, userId: args.userId, authSubject: args.authSubject });
    const expectedRevision = normalizeExpectedRevision(args.expectedRevision);
    const workflow = requireWorkflowRevision(
      await getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId }), expectedRevision);
    if (args.enabled && !(workflow.milestones[0]?.automations ?? []).some(a => a.trigger.type === "member_joined" && a.action.type === "request_form")
      && !workflow.welcomeLessonIds?.length) {
      throw new Error("welcome_gate_requires_join_form");
    }
    if ((workflow.welcomeGate ?? false) === args.enabled) return { workflow_id: String(workflow._id), revision: expectedRevision, welcome_gate: args.enabled };
    const revision = expectedRevision + 1;
    const now = Date.now();
    await ctx.db.patch(workflow._id, { welcomeGate: args.enabled, ...(args.enabled ? { welcomeGateEnabledAt: now } : {}),
      revision, updatedByUserId: userId, updatedAt: now });
    return { workflow_id: String(workflow._id), revision, welcome_gate: args.enabled };
  },
});

/** Full page (the community shows only the welcome until it's done) or a pop-up over the open community. */
export const setBuilderWelcomeDisplay = mutation({
  args: { ...managerIdentityArgs, communityId: v.id("communities"), expectedRevision: v.number(), display: v.union(v.literal("page"), v.literal("popup")) },
  handler: async (ctx, args) => {
    const { userId } = await requireWorkflowManager({ ctx, communityId: args.communityId, userId: args.userId, authSubject: args.authSubject });
    const expectedRevision = normalizeExpectedRevision(args.expectedRevision);
    const workflow = requireWorkflowRevision(
      await getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId }), expectedRevision);
    if ((workflow.welcomeDisplay ?? "page") === args.display) return { workflow_id: String(workflow._id), revision: expectedRevision, welcome_display: args.display };
    const revision = expectedRevision + 1;
    await ctx.db.patch(workflow._id, { welcomeDisplay: args.display, revision, updatedByUserId: userId, updatedAt: Date.now() });
    return { workflow_id: String(workflow._id), revision, welcome_display: args.display };
  },
});

const WELCOME_TITLE_MAX = 120;
const WELCOME_MESSAGE_MAX = 4_000;
const welcomeBlockValidator = v.union(
  v.object({ type: v.literal("text"), markdown: v.string() }),
  v.object({ type: v.literal("choice"), prompt: v.string(), options: v.array(v.object({ label: v.string(), hint: v.string(), markdown: v.string(), icon: v.optional(v.string()) })), agent: v.optional(v.boolean()) }),
  v.object({ type: v.literal("form"), formKey: v.string() }),
  v.object({ type: v.literal("lesson"), resourceId: v.string() }),
  v.object({ type: v.literal("next") }),
);

/** What the welcome page says and which steps members finish, in order. With a
 * layout, its form blocks are the forms new members are asked on joining: the
 * first stage's "member joins" form rules are added or removed to match. */
const welcomePageArgs = {
  communityId: v.id("communities"), expectedRevision: v.number(),
  title: v.string(), message: v.string(), mediaUrl: v.string(), lessonIds: v.array(v.string()),
  layout: v.optional(v.array(welcomeBlockValidator)),
};

export const saveBuilderWelcomePage = mutation({
  args: { ...managerIdentityArgs, ...welcomePageArgs },
  handler: async (ctx, args) => {
    const { userId } = await requireWorkflowManager({ ctx, communityId: args.communityId, userId: args.userId, authSubject: args.authSubject });
    return await saveWelcomePage(ctx, userId, args);
  },
});

async function saveWelcomePage(ctx: MutationCtx, userId: Id<"users">, args: {
  communityId: Id<"communities">; expectedRevision: number; title: string; message: string; mediaUrl: string; lessonIds: string[]; layout?: WelcomeBlock[];
}) {
  const expectedRevision = normalizeExpectedRevision(args.expectedRevision);
  const workflow = requireWorkflowRevision(
    await getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId }), expectedRevision);
  const title = args.title.replace(/\s+/g, " ").trim();
  const message = args.message.replace(/\r\n?/g, "\n").trim();
  if (title.length > WELCOME_TITLE_MAX) throw new Error("welcome_title_too_long");
  if (message.length > WELCOME_MESSAGE_MAX) throw new Error("welcome_message_too_long");
  let mediaUrl: string | undefined;
  try { mediaUrl = normalizeOptionalUrl(args.mediaUrl); } catch { throw new Error("welcome_media_url_invalid"); }
  const layout = args.layout ? normalizeWelcomeLayout(args.layout) : null;
  if (layout) {
    const issue = welcomeLayoutIssue(layout);
    if (issue) throw new Error(issue);
  }
  const ids = layout ? welcomeLayoutSteps(layout).lessonIds : [...new Set(args.lessonIds.map(id => id.trim()).filter(Boolean))];
  if (ids.length > WELCOME_LESSONS_MAX) throw new Error("welcome_lessons_too_many");
  const lessonIds = [];
  for (const raw of ids) {
    const resourceId = ctx.db.normalizeId("communityResources", raw);
    if (!resourceId || !(await welcomeLessonIsLive(ctx, args.communityId, resourceId))) throw new Error("welcome_lesson_unavailable");
    lessonIds.push(resourceId);
  }
  let milestones = workflow.milestones;
  if (layout) {
    const first = workflow.milestones[0] as CommunityMemberWorkflowMilestone | undefined;
    if (!first) throw new Error("community_member_workflow_milestone_invalid");
    const wanted = welcomeLayoutSteps(layout).formKeys;
    const isJoinForm = (a: CommunityMemberWorkflowAutomation) => a.trigger.type === "member_joined" && a.action.type === "request_form";
    const joinFormKey = (a: CommunityMemberWorkflowAutomation) => (a.action.type === "request_form" ? a.action.formKey : "");
    const current = first.automations.filter(isJoinForm).map(joinFormKey);
    if (JSON.stringify([...current].sort()) !== JSON.stringify([...wanted].sort())) {
      for (const formKey of wanted.filter(key => !current.includes(key))) {
        const form = await ctx.db.query("communityForms").withIndex("by_community_key", q => q.eq("communityId", args.communityId).eq("key", formKey)).unique();
        if (!form?.publishedRevision || form.deletedAt) throw new Error("form_not_published");
      }
      const drafts = [
        ...first.automations.filter(a => !isJoinForm(a) || wanted.includes(joinFormKey(a))),
        ...wanted.filter(key => !current.includes(key))
          .map(formKey => ({ trigger: { type: "member_joined" as const }, action: { type: "request_form" as const, formKey } })),
      ];
      // A rule chained after a removed form ("then…") would lose its start: Workflows has to change it first.
      const automations = normalizeAutomations(drafts, first.automations, expectedRevision + 1);
      milestones = [{ ...first, automations }, ...workflow.milestones.slice(1)];
    }
  }
  const hasJoinForm = (milestones[0]?.automations ?? []).some(a => a.trigger.type === "member_joined" && a.action.type === "request_form");
  if (!lessonIds.length && workflow.welcomeGate && !hasJoinForm) throw new Error("welcome_gate_requires_join_form");
  const revision = expectedRevision + 1;
  await ctx.db.patch(workflow._id, {
    welcomePage: layout
      ? { ...(title ? { title } : {}), layout }
      : { ...(title ? { title } : {}), ...(message ? { message } : {}), ...(mediaUrl ? { mediaUrl } : {}) },
    welcomeLessonIds: lessonIds, milestones, revision, updatedByUserId: userId, updatedAt: Date.now(),
  });
  // Same as a Workflows save: a stage with timed rules re-reads them when its rules change.
  const first = workflow.milestones[0];
  if (first && milestones !== workflow.milestones && first.automations.some((a) => a.trigger.type === "milestone_elapsed")) {
    await ctx.scheduler.runAfter(0, internal.communityMemberWorkflows.refreshMilestoneTimersInternal,
      { workflowId: workflow._id, milestoneKey: first.key, cursor: null });
  }
  return { workflow_id: String(workflow._id), revision };
}

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
    if (milestoneIndex === 0) {
      const activeMemberCount = readCommunityActiveMemberCount(community);
      if (activeMemberCount === null) {
        throw new Error("community_member_workflow_member_count_unknown");
      }
      if (activeMemberCount > 1) {
        throw new Error("community_member_workflow_milestone_has_members");
      }
    }
    // Leaving now removes a member's position, but members who left before
    // that kept one, with their membership gone (a rejoin starts a new one).
    // Those rows go with the stage instead of blocking it; anyone still a
    // member holds it.
    const positions = await ctx.db
      .query("communityMemberWorkflowMemberMilestones")
      .withIndex("by_workflow_milestone", (q: any) =>
        q.eq("workflowId", workflow._id).eq("currentMilestoneKey", milestoneKey),
      )
      .take(DEPARTED_POSITIONS_PER_CALL + 1);
    for (const position of positions.slice(0, DEPARTED_POSITIONS_PER_CALL)) {
      if (await ctx.db.get(position.membershipId)) throw new Error("community_member_workflow_milestone_has_members");
      await ctx.db.delete(position._id);
    }
    // More to clear: keep this batch, leave the stage, and say to call again.
    if (positions.length > DEPARTED_POSITIONS_PER_CALL) {
      return { workflow_id: String(workflow._id), revision: expectedRevision, pending_cleanup: true as const };
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
    const testCount = (await listActiveTestMemberUserIds(ctx, args.communityId)).size;
    return {
      workflow: {
        id: String(workflow._id),
        community_id: String(workflow.communityId),
        revision: workflow.revision,
        milestones: workflow.milestones,
        welcome_gate: workflow.welcomeGate ?? false,
        welcome_lesson_ids: (workflow.welcomeLessonIds ?? []).map(String),
        welcome_display: workflow.welcomeDisplay ?? "page",
        welcome_page: {
          title: workflow.welcomePage?.title ?? "",
          message: workflow.welcomePage?.message ?? "",
          media_url: workflow.welcomePage?.mediaUrl ?? "",
          layout: workflow.welcomePage?.layout ?? null,
        },
        updated_at: toIsoString(workflow.updatedAt),
      },
      page: members,
      continueCursor: rawPage.isDone ? null : rawPage.continueCursor,
      isDone: rawPage.isDone,
      // Members as people see them (no owner, no test members); tests apart.
      totalCount:
        activeMemberCount === null ? null : Math.max(0, activeMemberCount - 1 - testCount),
      testCount,
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
    const completed = [...progress.actions, ...(progress.reactive_actions ?? [])].find(a => a.evidence?.run_id === String(run._id));
    if (!completed) return { status: "incomplete" };
    for (const automation of current.milestone.automations) {
      if (automation.trigger.type !== "previous_action_completed"
        || automation.trigger.predecessorActionKey !== completed.action_key
        || !workflowSequenceCompletionIsNew(automation, completed.evidence!.completed_at, run.workflowRevision)) continue;
      // A wait: start its timer from when the earlier step finished. A skipped
      // path doesn't wait; its steps are skipped straight away.
      if ((automation.trigger.delayMinutes ?? 0) > 0 && !workflowRunWasSkipped(run)) {
        await startWorkflowSourceTimer({ ctx, workflow, membership, current, transitionSeq: Number(state?.transitionSeq ?? 0), automation,
          startedAt: completed.evidence!.completed_at, sourceRef: workflowSequenceReceipt({ ...run, actionSnapshot: automation.action }) });
        continue;
      }
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

// A lesson- or course-done property write that failed (say the option was
// removed), or ran before the builder changed the rule. The lesson won't be
// finished again, so the builder runs the current rule once more in this
// visit, answering the rule's newest run so each one is retried once.
export const retryBuilderMemberWorkflowAction = mutation({
  args: { ...managerIdentityArgs, communityId: v.id("communities"), membershipId: v.id("communityMemberships"),
    expectedWorkflowId: v.id("communityMemberWorkflows"), expectedWorkflowRevision: v.number(),
    expectedMilestoneKey: v.string(), expectedMilestoneEnteredAt: v.number(),
    expectedActivationSequence: v.number(), expectedTransitionSeq: v.number(), automationKey: v.string() },
  handler: async (ctx, args) => {
    await requireWorkflowManager({ ctx, ...args });
    const workflow = await getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId });
    const membership = await ctx.db.get(args.membershipId);
    if (!workflow || workflow._id !== args.expectedWorkflowId || workflow.revision !== args.expectedWorkflowRevision
      || !membership || membership.communityId !== args.communityId || !communityMembershipRowIsActive(membership))
      throw new Error("community_member_workflow_action_retry_authority_changed");
    const state = await getMemberMilestone({ ctx, workflowId: workflow._id, membershipId: membership._id });
    const current = resolveCurrentMilestone({ workflow, membership, state });
    const activation = Number(membership.activationSequence ?? 0), transitionSeq = Number(state?.transitionSeq ?? 0);
    if (current.completedAt || current.milestone.key !== args.expectedMilestoneKey
      || current.milestoneEnteredAt !== args.expectedMilestoneEnteredAt
      || activation !== args.expectedActivationSequence || transitionSeq !== args.expectedTransitionSeq)
      throw new Error("community_member_workflow_action_retry_evidence_changed");
    const automation = (current.milestone as CommunityMemberWorkflowMilestone).automations.find(a => a.key === args.automationKey);
    const progress = await readWorkflowActionProgress(ctx, { workflow, membership, milestone: current.milestone,
      milestoneEnteredAt: current.milestoneEnteredAt, transitionSeq });
    const item = progress.actions.find(a => a.automation_key === args.automationKey);
    if (!automation || automation.action.type !== "set_client_property" || !item?.retryable || item.evidence || item.status === "running")
      throw new Error("community_member_workflow_action_retry_unavailable");
    const runs = await ctx.db.query("communityMemberWorkflowRuns")
      .withIndex("by_workflow_membership_createdAt", q => q.eq("workflowId", workflow._id).eq("membershipId", membership._id))
      .order("desc").take(256);
    const last = runs.find(run => run.automationKey === automation.key && run.milestoneKey === current.milestone.key
      && run.milestoneEnteredAt === current.milestoneEnteredAt && run.activationSequence === activation
      && run.transitionSeq === transitionSeq && run.triggerSnapshot
      && workflowTriggerIdentity(run.triggerSnapshot) === workflowTriggerIdentity(automation.trigger));
    if (!last || last.status === "running") throw new Error("community_member_workflow_action_retry_unavailable");
    const result = await executeWorkflowAutomation({ ctx, workflow, membership, current, automation,
      timerReceiptRef: `workflow_action_retry:${last._id}` });
    if (result.status === "already_executed") throw new Error("community_member_workflow_action_retry_unavailable");
    return result.status === "action_failed"
      ? { status: "action_failed" as const, error_code: "error_code" in result ? result.error_code : undefined }
      : { status: "client_property_set" as const };
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
  principalKind: v.literal("external_mcp"),
  expectedActivationSequence: v.number(), reviewRef: v.string(), idempotencyKey: v.string(),
}, handler: async (ctx, args): Promise<Record<string, any>> => {
  const { community } = await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  const membership = await ctx.db.get(args.membershipId);
  if (!membership || membership.communityId !== args.communityId || !communityMembershipRowIsActive(membership))
    throw new Error("workflow_approval_unavailable");
  await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: membership.userId, allowWelcome: true });
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
  // A path not taken: the step before was skipped, or this step's "Only if" doesn't hold.
  const predecessorRun = args.workflowPreviousRunId ? await args.ctx.db.get(args.workflowPreviousRunId) : null;
  let skipCode: "path_skipped" | "condition_skipped" | null = workflowRunWasSkipped(predecessorRun) ? "path_skipped" : null;
  if (!skipCode && args.automation.condition) {
    const values = new Map<string, any>();
    for (const clause of workflowConditionClauses(args.automation.condition)) {
      if (values.has(clause.propertyKey)) continue;
      const row = await args.ctx.db.query("communityClientValues")
        .withIndex("by_membership_property", (q: any) => q.eq("membershipId", args.membership._id).eq("propertyKey", clause.propertyKey))
        .unique();
      values.set(clause.propertyKey, row?.value);
    }
    if (!workflowConditionGroupHolds(args.automation.condition, (key) => values.get(key))) skipCode = "condition_skipped";
  }
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
    ...(args.automation.condition ? { conditionSnapshot: args.automation.condition } : {}),
    actionSnapshot: args.automation.action,
    status: skipCode ? "finished" : "running",
    ...(skipCode ? { actionResult: { actionKey: args.automation.action.key, status: "complete" as const, resultCode: skipCode }, finishedAt: nowMs } : {}),
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  if (skipCode) {
    // Skipped counts as done. The steps after it are on the same path, so they're
    // skipped now too (waits included), then the stage can move on.
    for (const next of args.current.milestone.automations as CommunityMemberWorkflowAutomation[]) {
      if (next.trigger.type !== "previous_action_completed" || next.trigger.predecessorActionKey !== args.automation.action.key
        || !workflowSequenceCompletionIsNew(next, nowMs, args.workflow.revision)) continue;
      await executeWorkflowAutomation({ ctx: args.ctx, workflow: args.workflow, membership: args.membership, current: args.current,
        automation: next, workflowPreviousRunId: workflowRunId,
        timerReceiptRef: workflowSequenceReceipt({ membershipId: args.membership._id, activationSequence: Number(args.membership.activationSequence ?? 0),
          transitionSeq: Number((await getMemberMilestone({ ctx: args.ctx, workflowId: args.workflow._id, membershipId: args.membership._id }))?.transitionSeq ?? 0),
          milestoneKey: args.current.milestone.key, milestoneEnteredAt: args.current.milestoneEnteredAt, actionSnapshot: next.action }) });
    }
    await args.ctx.scheduler.runAfter(0, internal.communityMemberWorkflows.reconcileCompletedWorkflowActionsInternal, { workflowRunId });
    return { status: "skipped" as const, workflow_run_id: String(workflowRunId), skip: skipCode, replayed: false };
  }
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
    if (args.automation.action.type === "set_client_property") {
      const result = await setClientPropertyValue(args.ctx, {
        communityId: args.workflow.communityId, userId: args.workflow.updatedByUserId,
        membershipId: String(args.membership._id), key: args.automation.action.propertyKey,
        value: args.automation.action.value, via: "workflow",
      });
      await args.ctx.db.patch(workflowRunId, { status: "finished", actionResult: {
        actionKey: args.automation.action.key, status: "complete", resultCode: "client_property_set",
      }, finishedAt: nowMs, updatedAt: nowMs });
      // A lesson- or course-triggered write is the stage's work, so it can complete the stage.
      await args.ctx.scheduler.runAfter(0, internal.communityMemberWorkflows.reconcileCompletedWorkflowActionsInternal, { workflowRunId });
      return { status: "client_property_set" as const, workflow_run_id: String(workflowRunId), key: result.key, replayed: false };
    }
    if (args.automation.action.type === "set_pod_member") {
      const channelId = args.ctx.db.normalizeId("communityChannels", args.automation.action.channelId);
      const channel = channelId ? await args.ctx.db.get(channelId) : null;
      if (!channel || channel.communityId !== args.workflow.communityId || channel.status !== "active"
        || channel.accessMode !== "restricted" || channel.systemRole === "general") throw new Error("workflow_pod_unavailable");
      const result = await setChannelParticipantCore(args.ctx, { communityId: args.workflow.communityId, channelId: channel._id,
        createdByUserId: args.workflow.updatedByUserId, active: args.automation.action.active,
        target: { kind: "member", userId: args.membership.userId }, via: "workflow" });
      const resultCode = args.automation.action.active ? "pod_member_added" : "pod_member_removed";
      await args.ctx.db.patch(workflowRunId, { status: "finished", actionResult: {
        actionKey: args.automation.action.key, status: "complete", resultCode,
      }, finishedAt: nowMs, updatedAt: nowMs });
      await args.ctx.scheduler.runAfter(0, internal.communityMemberWorkflows.reconcileCompletedWorkflowActionsInternal, { workflowRunId });
      return { status: resultCode, workflow_run_id: String(workflowRunId), changed: result.changed, replayed: false };
    }
    if (args.automation.action.type === "send_email") {
      // Queued, opted out or not sendable, the step is done: an email never holds a member up.
      const email = await sendWorkflowEmail(args.ctx, { communityId: args.workflow.communityId, membership: args.membership,
        action: args.automation.action, workflowRunId, autoplay: await testMemberAutoplayIsOn(args.ctx, args.membership.userId, nowMs), nowMs });
      await args.ctx.db.patch(workflowRunId, { status: "finished", actionResult: {
        actionKey: args.automation.action.key, status: "complete", resultCode: email.resultCode,
      }, finishedAt: nowMs, updatedAt: nowMs });
      await args.ctx.scheduler.runAfter(0, internal.communityMemberWorkflows.reconcileCompletedWorkflowActionsInternal, { workflowRunId });
      return { status: email.resultCode, workflow_run_id: String(workflowRunId), replayed: false };
    }
    if (args.automation.action.type === "prompt_agent") {
      // Autoplay tests the sequence without sending (unless the agent runs free): the step is marked as a preview.
      if (await testMemberAutoplayPreviewsAgent(args.ctx, args.membership.userId, nowMs)) {
        await args.ctx.db.patch(workflowRunId, { status: "finished", actionResult: {
          actionKey: args.automation.action.key, status: "complete", resultCode: "agent_previewed",
        }, finishedAt: nowMs, updatedAt: nowMs });
        await args.ctx.scheduler.runAfter(0, internal.communityMemberWorkflows.reconcileCompletedWorkflowActionsInternal, { workflowRunId });
        return { status: "agent_previewed" as const, workflow_run_id: String(workflowRunId), replayed: false };
      }
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
    // A property that was archived or changed since the save fails the run, not
    // the lesson, form or post that triggered it.
    const propertyRejected = workflowActionIsInstant(args.automation.action.type);
    if (!capacityRejected && !propertyRejected && (args.workflowTimerId || args.automation.action.type !== "prompt_agent")) throw error;
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

// A lesson the member just finished, and the course if that lesson completed
// it. Each progress row (and each course per activation) is one receipt, so a
// replay never runs a rule twice. Only work done in the current stage counts.
export const handleLessonCompletedInternal = internalMutation({
  args: { communityId: v.id("communities"), userId: v.id("users"), resourceId: v.id("communityResources") },
  handler: async (ctx, args) => {
    const workflow = await getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId });
    if (!workflow || workflow.milestones.length < 1) return { status: "workflow_ineligible" as const };
    const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId: args.communityId, userId: args.userId });
    if (!membership || !communityMembershipRowIsActive(membership)) return { status: "membership_ineligible" as const };
    const state = await getMemberMilestone({ ctx, workflowId: workflow._id, membershipId: membership._id });
    const current = resolveCurrentMilestone({ workflow, membership, state });
    if (current.completedAt) return { status: "workflow_completed" as const };
    const since = Math.max(current.milestoneEnteredAt, membership.activatedAt ?? membership.createdAt);
    const row = await ctx.db.query("communityResourceProgress")
      .withIndex("by_community_user_resource", q => q.eq("communityId", args.communityId).eq("userId", args.userId).eq("resourceId", args.resourceId))
      .unique();
    if (!row || row.status !== "done" || !row.completedAt || row.completedAt < since) return { status: "action_before_milestone" as const };
    const automations = (current.milestone as CommunityMemberWorkflowMilestone).automations;
    const results = [];
    // An agent step needs a durable source, so a lesson starts it through a timer due now.
    const runRule = async (automation: CommunityMemberWorkflowAutomation, receipt: string) => {
      if (automation.action.type !== "prompt_agent") return executeWorkflowAutomation({ ctx, workflow, membership, current, automation, timerReceiptRef: receipt });
      const timer = await startWorkflowSourceTimer({ ctx, workflow, membership, current, transitionSeq: Number(state?.transitionSeq ?? 0),
        automation, startedAt: Date.now(), sourceRef: receipt });
      return { status: await runWorkflowTimerNow(ctx, timer) ? "agent_started" as const : "already_executed" as const };
    };
    for (const automation of automations.filter(a => a.trigger.type === "lesson_completed"
        && (!a.trigger.resourceId || a.trigger.resourceId === String(args.resourceId)))) {
      results.push(await runRule(automation, `lesson_completed:${row._id}`));
    }
    const courseRules = automations.filter(a => a.trigger.type === "course_completed");
    const page = await ctx.db.get(args.resourceId);
    if (courseRules.length && page?.moduleId) {
      const lessons = await listMemberVisibleLessonPages(ctx, args.communityId);
      const inCourse = lessons.pages.filter((lesson: any) => String(lesson.moduleId) === String(page.moduleId));
      const rows = await readProgressRows(ctx, args.communityId, args.userId);
      const doneById = new Map(rows.filter((r: any) => r.status === "done").map((r: any) => [String(r.resourceId), r]));
      const finished = inCourse.length > 0 && inCourse.every((lesson: any) => doneById.has(String(lesson._id)));
      if (finished && !lessons.truncated) {
        for (const automation of courseRules.filter(a => a.trigger.type === "course_completed"
            && (!a.trigger.moduleId || a.trigger.moduleId === String(page.moduleId)))) {
          results.push(await runRule(automation, `course_completed:${page.moduleId}:${membership._id}:${membership.activationSequence ?? 0}`));
        }
      }
    }
    // A skill track this lesson finished (its last open step).
    const trackRules = automations.filter(a => a.trigger.type === "track_completed");
    if (trackRules.length) {
      for (const track of await communityTracksFinishedByLesson(ctx, args.communityId, args.userId, args.resourceId)) {
        for (const automation of trackRules.filter(a => a.trigger.type === "track_completed" && (!a.trigger.trackKey || a.trigger.trackKey === track.key))) {
          results.push(await runRule(automation, `track_completed:${track.key}:${membership._id}:${membership.activationSequence ?? 0}`));
        }
      }
    }
    return { status: results.length ? "handled" as const : "trigger_unconfigured" as const, results };
  },
});

// A client property on the member's record changed. The change's timeline
// event is the receipt, so a replay never runs a rule twice. Writes made by a
// Workflow step never get here (communityClients skips them), so rules can't loop.
export const handleClientPropertyChangedInternal = internalMutation({
  args: { communityId: v.id("communities"), membershipId: v.id("communityMemberships"), eventId: v.id("communityClientEvents") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event || event.type !== "property_set" || !event.propertyKey || String(event.membershipId) !== String(args.membershipId)) return { status: "event_missing" as const };
    const workflow = await getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId });
    if (!workflow || workflow.milestones.length < 1) return { status: "workflow_ineligible" as const };
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.communityId !== args.communityId || !communityMembershipRowIsActive(membership)) return { status: "membership_ineligible" as const };
    const state = await getMemberMilestone({ ctx, workflowId: workflow._id, membershipId: membership._id });
    const current = resolveCurrentMilestone({ workflow, membership, state });
    if (current.completedAt) return { status: "workflow_completed" as const };
    const matches = (current.milestone as CommunityMemberWorkflowMilestone).automations.filter(a => a.trigger.type === "client_property_changed"
      && a.trigger.propertyKey === event.propertyKey
      && (a.trigger.value === undefined || workflowConditionHolds({ propertyKey: a.trigger.propertyKey, op: "is", value: a.trigger.value }, event.value as any)));
    const results = [];
    for (const automation of matches) {
      const receipt = `client_property_changed:${args.eventId}`;
      if (automation.action.type !== "prompt_agent") {
        results.push(await executeWorkflowAutomation({ ctx, workflow, membership, current, automation, timerReceiptRef: receipt }));
        continue;
      }
      // An agent step needs a durable source, so the change starts it through a timer due now.
      const timer = await startWorkflowSourceTimer({ ctx, workflow, membership, current, transitionSeq: Number(state?.transitionSeq ?? 0),
        automation, startedAt: Date.now(), sourceRef: receipt });
      results.push({ status: await runWorkflowTimerNow(ctx, timer) ? "agent_started" as const : "already_executed" as const });
    }
    return { status: results.length ? "handled" as const : "trigger_unconfigured" as const, results };
  },
});

// A member moved onto or off an offer (joined on it, upgraded, downgraded,
// left). The sync that saw the change is the receipt, so a replay never runs a
// rule twice; buying the same offer again later is a new change.
export const handleOfferChangedInternal = internalMutation({
  args: { communityId: v.id("communities"), userId: v.id("users"), membershipId: v.id("communityMemberships"),
    activationSequence: v.number(), started: v.array(v.string()), ended: v.array(v.string()), at: v.number() },
  handler: async (ctx, args) => {
    const workflow = await getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId });
    if (!workflow || workflow.milestones.length < 1) return { status: "workflow_ineligible" as const };
    const membership = await ctx.db.get(args.membershipId);
    // Someone who left the community entirely has no steps left to run; a downgrade keeps them in.
    if (!membership || membership.communityId !== args.communityId || !communityMembershipRowIsActive(membership)
      || Number(membership.activationSequence ?? 0) !== args.activationSequence) return { status: "membership_ineligible" as const };
    const state = await getMemberMilestone({ ctx, workflowId: workflow._id, membershipId: membership._id });
    const current = resolveCurrentMilestone({ workflow, membership, state });
    if (current.completedAt) return { status: "workflow_completed" as const };
    const automations = (current.milestone as CommunityMemberWorkflowMilestone).automations;
    const results = [];
    const runRule = async (automation: CommunityMemberWorkflowAutomation, receipt: string) => {
      if (automation.action.type !== "prompt_agent") return executeWorkflowAutomation({ ctx, workflow, membership, current, automation, timerReceiptRef: receipt });
      const timer = await startWorkflowSourceTimer({ ctx, workflow, membership, current, transitionSeq: Number(state?.transitionSeq ?? 0),
        automation, startedAt: Date.now(), sourceRef: receipt });
      return { status: await runWorkflowTimerNow(ctx, timer) ? "agent_started" as const : "already_executed" as const };
    };
    for (const [type, keys] of [["offer_started", args.started], ["offer_ended", args.ended]] as const) {
      if (!keys.length) continue;
      for (const automation of automations.filter(a => a.trigger.type === type)) {
        const wanted = (automation.trigger as { offerKey?: string }).offerKey;
        // "Any offer" runs once per change, not once per offer in the ladder.
        const offerKey = wanted ? keys.find((key) => key === wanted) : keys[keys.length - 1];
        if (!offerKey) continue;
        results.push(await runRule(automation, `${type}:${offerKey}:${membership._id}:${args.activationSequence}:${args.at}`));
      }
    }
    return { status: results.length ? "handled" as const : "trigger_unconfigured" as const, results };
  },
});

// "Joins a pod": someone (the owner, an admin, an agent or an offer) added the
// member to a pod. A Workflow step's own add never schedules this, so rules can't loop.
export const handlePodMemberAddedInternal = internalMutation({
  args: { communityId: v.id("communities"), membershipId: v.id("communityMemberships"), activationSequence: v.number(),
    channelId: v.id("communityChannels"), at: v.number() },
  handler: async (ctx, args) => {
    const workflow = await getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId });
    if (!workflow || workflow.milestones.length < 1) return { status: "workflow_ineligible" as const };
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.communityId !== args.communityId || !communityMembershipRowIsActive(membership)
      || Number(membership.activationSequence ?? 0) !== args.activationSequence) return { status: "membership_ineligible" as const };
    const state = await getMemberMilestone({ ctx, workflowId: workflow._id, membershipId: membership._id });
    const current = resolveCurrentMilestone({ workflow, membership, state });
    if (current.completedAt) return { status: "workflow_completed" as const };
    const matches = (current.milestone as CommunityMemberWorkflowMilestone).automations.filter(a => a.trigger.type === "pod_member_added"
      && (!a.trigger.channelId || a.trigger.channelId === String(args.channelId)));
    // Creating someone's personal pod adds them to it; that isn't someone adding them to a pod.
    if (String(membership.serviceChannelId ?? "") === String(args.channelId)) return { status: "own_personal_pod" as const };
    const results = [];
    for (const automation of matches) {
      const receipt = `pod_member_added:${args.channelId}:${membership._id}:${args.activationSequence}:${args.at}`;
      if (automation.action.type !== "prompt_agent") {
        results.push(await executeWorkflowAutomation({ ctx, workflow, membership, current, automation, timerReceiptRef: receipt }));
        continue;
      }
      const timer = await startWorkflowSourceTimer({ ctx, workflow, membership, current, transitionSeq: Number(state?.transitionSeq ?? 0),
        automation, startedAt: Date.now(), sourceRef: receipt });
      results.push({ status: await runWorkflowTimerNow(ctx, timer) ? "agent_started" as const : "already_executed" as const });
    }
    return { status: results.length ? "handled" as const : "trigger_unconfigured" as const, results };
  },
});

// "On a date in their record": every 15 minutes, run each date rule for the
// members in its stage whose date (plus the rule's offset) has just come round.
// A date that passed more than a day and a half ago, or before they reached the
// stage, never fires, so adding a rule doesn't flood old dates. The member, the
// rule and the date are the receipt, so a date runs once and a new date runs again.
const PROPERTY_DATE_WINDOW_MS = 36 * 3_600_000;
export const processDuePropertyDateTriggersInternal = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const page = await ctx.db.query("communityMemberWorkflows").paginate({ numItems: 20, cursor: args.cursor ?? null });
    let matched = 0;
    for (const workflow of page.page) {
      for (const milestone of workflow.milestones as CommunityMemberWorkflowMilestone[]) {
        for (const automation of milestone.automations) {
          if (automation.trigger.type !== "property_date") continue;
          const { propertyKey, offsetDays } = automation.trigger;
          const values = await ctx.db.query("communityClientValues")
            .withIndex("by_community_property", q => q.eq("communityId", workflow.communityId).eq("propertyKey", propertyKey)).take(2000);
          for (const value of values) {
            const dueAt = workflowPropertyDateDueAt(value.value, offsetDays);
            if (dueAt === null || dueAt > nowMs || dueAt < nowMs - PROPERTY_DATE_WINDOW_MS) continue;
            const membership = await ctx.db.get(value.membershipId);
            if (!membership || !communityMembershipRowIsActive(membership)) continue;
            const state = await getMemberMilestone({ ctx, workflowId: workflow._id, membershipId: membership._id });
            const current = resolveCurrentMilestone({ workflow, membership, state });
            if (current.completedAt || current.milestone.key !== milestone.key || dueAt < current.milestoneEnteredAt) continue;
            const live = (current.milestone as CommunityMemberWorkflowMilestone).automations.find(a => a.key === automation.key);
            if (!live) continue;
            const receipt = `property_date:${String(value.value)}:${membership._id}:${Number(membership.activationSequence ?? 0)}`;
            if (live.action.type !== "prompt_agent") {
              await executeWorkflowAutomation({ ctx, workflow, membership, current, automation: live, timerReceiptRef: receipt });
            } else {
              // An agent step needs a durable source, so the date starts it through a timer due now.
              const timer = await startWorkflowSourceTimer({ ctx, workflow, membership, current, transitionSeq: Number(state?.transitionSeq ?? 0),
                automation: live, startedAt: nowMs, sourceRef: receipt });
              await runWorkflowTimerNow(ctx, timer);
            }
            matched++;
          }
        }
      }
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.communityMemberWorkflows.processDuePropertyDateTriggersInternal, { cursor: page.continueCursor });
    return { workflows: page.page.length, matched };
  },
});

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
  const lane = (a: CommunityMemberWorkflowAutomation) => a.action.type === "set_client_property" ? `${a.action.type}:${a.action.propertyKey}` : a.action.type;
  if (new Set(matches.map(lane)).size !== matches.length) return;
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

/** Runs one pending timed step now, as if its wait were over. Test runs use it to skip waits. */
export async function runWorkflowTimerNow(ctx: any, timer: any): Promise<boolean> {
  const nowMs = Date.now();
  if (timer.status !== "pending") return false;
  const resolved = await resolveWorkflowTimer(ctx, timer);
  if (!resolved) {
    await ctx.db.patch(timer._id, { status: "obsolete", finishedAt: nowMs });
    return false;
  }
  // Ahead of time: the agent step's authority check needs to know it was skipped on purpose.
  if (resolved.dueAt > nowMs) await ctx.db.patch(timer._id, { runEarlyAt: nowMs });
  await executeWorkflowAutomation({ ctx, ...resolved, workflowTimerId: timer._id, timerReceiptRef: `workflow-timer:${timer._id}` });
  await ctx.db.patch(timer._id, { status: "consumed", finishedAt: nowMs });
  return true;
}

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
