import { communityMembershipRowIsActive, type CommunityMembershipLike } from "./communityCore";
import { getCommunityMemberWorkflowByCommunity, getMemberMilestone, resolveCurrentMilestone } from "./communityMemberWorkflowReadCore";
import { normalizeWorkflowDelayMinutes, normalizeWorkflowStageDelayMinutes, workflowRuleUsesTimer } from "../shared/communityMemberWorkflow";
import { communityIsActive, normalizeCommunityLifecycle } from "../shared/communityLifecycle";
import { internal } from "./_generated/api";

/** Called only by an actual entry writer, never by a read or a rule save. */
export async function enrollWorkflowMilestoneTimers(args: {
  ctx: any; membership: CommunityMembershipLike; nowMs: number;
}) {
  const { ctx, membership, nowMs } = args;
  if (!communityMembershipRowIsActive(membership)) return;
  const workflow = await getCommunityMemberWorkflowByCommunity({ ctx, communityId: membership.communityId });
  if (!workflow) return;
  const community = await ctx.db.get(workflow.communityId);
  if (!community || !communityIsActive(community)) return;
  const state = await getMemberMilestone({ ctx, workflowId: workflow._id, membershipId: membership._id });
  const current = resolveCurrentMilestone({ workflow, membership, state });
  // Reactivation does not reset a persisted milestone or resurrect its old timers.
  if (current.completedAt || current.milestoneEnteredAt !== nowMs) return;
  const activationSequence = Number(membership.activationSequence ?? 0);
  const transitionSeq = Number(state?.transitionSeq ?? 0);
  const existing = await ctx.db.query("communityMemberWorkflowTimers")
    .withIndex("by_member_entry", (q: any) => q.eq("workflowId", workflow._id)
      .eq("membershipId", membership._id).eq("activationSequence", activationSequence).eq("transitionSeq", transitionSeq))
    .take(13);
  let arrivalDue = false;
  for (const rule of current.milestone.automations) {
  if (rule.trigger.type !== "milestone_elapsed" || !rule.timerGeneration
    || existing.some((timer: any) => timer.automationKey === rule.key)) continue;
  await ctx.db.insert("communityMemberWorkflowTimers", {
    workflowId: workflow._id, membershipId: membership._id,
    communityLifecycleGeneration: normalizeCommunityLifecycle(community).generation,
    milestoneKey: current.milestone.key, milestoneEnteredAt: current.milestoneEnteredAt,
    transitionSeq, activationSequence, automationKey: rule.key, timerGeneration: rule.timerGeneration,
    dueAt: current.milestoneEnteredAt + normalizeWorkflowStageDelayMinutes(rule.trigger.delayMinutes, rule.trigger.nudge) * 60_000,
    status: "pending", createdAt: nowMs,
  });
  if (rule.trigger.delayMinutes === 0) arrivalDue = true;
  }
  // "Reaches this stage" runs now rather than on the next minute's sweep.
  if (arrivalDue) await ctx.scheduler.runAfter(0, internal.communityMemberWorkflows.processDueMilestoneTimersInternal, {});
}

/** Latest authority wins, even if an edit's background refresh has not run yet. */
export async function resolveWorkflowTimer(ctx: any, timer: any) {
  const workflow = await ctx.db.get(timer.workflowId);
  const membership = await ctx.db.get(timer.membershipId);
  if (!workflow || !communityMembershipRowIsActive(membership)
    || String(membership.communityId) !== String(workflow.communityId)
    || Number(membership.activationSequence ?? 0) !== timer.activationSequence) return null;
  const community = await ctx.db.get(workflow.communityId);
  if (!community || !communityIsActive(community)
    || normalizeCommunityLifecycle(community).generation !== timer.communityLifecycleGeneration) return null;
  const state = await getMemberMilestone({ ctx, workflowId: workflow._id, membershipId: membership._id });
  if (!workflow.milestones.some((m: any) => m.key === (state?.currentMilestoneKey ?? workflow.milestones[0]?.key))) return null;
  if (Number(state?.transitionSeq ?? 0) !== timer.transitionSeq) return null;
  const current = resolveCurrentMilestone({ workflow, membership, state });
  if (current.completedAt || current.milestone.key !== timer.milestoneKey
    || current.milestoneEnteredAt !== timer.milestoneEnteredAt) return null;
  const automation = current.milestone.automations.find((a: any) => a.key === timer.automationKey);
  if (!automation || automation.timerGeneration !== timer.timerGeneration || !workflowRuleUsesTimer(automation)) return null;
  if (automation.trigger.type === "milestone_elapsed") {
    if (timer.startedAt !== undefined) return null;
    return { workflow, membership, current, automation,
      dueAt: current.milestoneEnteredAt + normalizeWorkflowStageDelayMinutes(automation.trigger.delayMinutes, automation.trigger.nudge) * 60_000 };
  }
  // A wait after another step, or an agent step a lesson or course started.
  if (timer.startedAt === undefined || !timer.sourceRef) return null;
  const delay = automation.trigger.type === "previous_action_completed" ? normalizeWorkflowDelayMinutes(automation.trigger.delayMinutes) : 0;
  return { workflow, membership, current, automation, dueAt: timer.startedAt + delay * 60_000 };
}

/** One timer per receipt and rule: a wait that began, or an event-started agent step.
 * Returns the timer (new or the one this receipt already made). */
export async function startWorkflowSourceTimer(args: {
  ctx: any; workflow: any; membership: CommunityMembershipLike; current: { milestone: any; milestoneEnteredAt: number };
  transitionSeq: number; automation: any; startedAt: number; sourceRef: string;
}) {
  const { ctx, workflow, membership, current, automation } = args;
  if (!automation.timerGeneration || !workflowRuleUsesTimer(automation) || automation.trigger.type === "milestone_elapsed") {
    throw new Error("workflow_timer_rule_invalid");
  }
  const activationSequence = Number(membership.activationSequence ?? 0);
  const existing = (await ctx.db.query("communityMemberWorkflowTimers")
    .withIndex("by_member_entry", (q: any) => q.eq("workflowId", workflow._id)
      .eq("membershipId", membership._id).eq("activationSequence", activationSequence).eq("transitionSeq", args.transitionSeq))
    .take(200)).find((timer: any) => timer.automationKey === automation.key && timer.sourceRef === args.sourceRef);
  if (existing) return existing;
  const community = await ctx.db.get(workflow.communityId);
  const delay = automation.trigger.type === "previous_action_completed" ? normalizeWorkflowDelayMinutes(automation.trigger.delayMinutes) : 0;
  const timerId = await ctx.db.insert("communityMemberWorkflowTimers", {
    workflowId: workflow._id, membershipId: membership._id,
    communityLifecycleGeneration: normalizeCommunityLifecycle(community).generation,
    milestoneKey: current.milestone.key, milestoneEnteredAt: current.milestoneEnteredAt,
    transitionSeq: args.transitionSeq, activationSequence, automationKey: automation.key, timerGeneration: automation.timerGeneration,
    dueAt: args.startedAt + delay * 60_000, startedAt: args.startedAt, sourceRef: args.sourceRef,
    status: "pending", createdAt: Date.now(),
  });
  return await ctx.db.get(timerId);
}
