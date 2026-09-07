import { communityMembershipRowIsActive, type CommunityMembershipLike } from "./communityCore";
import { getCommunityMemberWorkflowByCommunity, getMemberMilestone, resolveCurrentMilestone } from "./communityMemberWorkflowReadCore";
import { normalizeWorkflowDelayMinutes } from "../shared/communityMemberWorkflow";
import { communityIsActive, normalizeCommunityLifecycle } from "../shared/communityLifecycle";

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
  for (const rule of current.milestone.automations) {
  if (rule.trigger.type !== "milestone_elapsed" || !rule.timerGeneration
    || existing.some((timer: any) => timer.automationKey === rule.key)) continue;
  await ctx.db.insert("communityMemberWorkflowTimers", {
    workflowId: workflow._id, membershipId: membership._id,
    communityLifecycleGeneration: normalizeCommunityLifecycle(community).generation,
    milestoneKey: current.milestone.key, milestoneEnteredAt: current.milestoneEnteredAt,
    transitionSeq, activationSequence, automationKey: rule.key, timerGeneration: rule.timerGeneration,
    dueAt: current.milestoneEnteredAt + normalizeWorkflowDelayMinutes(rule.trigger.delayMinutes) * 60_000,
    status: "pending", createdAt: nowMs,
  });
  }
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
  if (!automation || automation.timerGeneration !== timer.timerGeneration
    || automation.trigger.type !== "milestone_elapsed") return null;
  return { workflow, membership, current, automation,
    dueAt: current.milestoneEnteredAt + normalizeWorkflowDelayMinutes(automation.trigger.delayMinutes) * 60_000 };
}
