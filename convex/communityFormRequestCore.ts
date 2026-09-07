import { communityMembershipRowIsActive, requireCommunityChatAccess } from "./communityCore";
import { getMemberMilestone, resolveCurrentMilestone } from "./communityMemberWorkflowReadCore";

export async function requestIsCurrent(ctx: any, request: any) {
  const membership = await ctx.db.get(request.membershipId);
  const workflow = await ctx.db.get(request.workflowId);
  if (!communityMembershipRowIsActive(membership) || !workflow || workflow.communityId !== request.communityId
    || membership.communityId !== request.communityId || (membership.activationSequence ?? 0) !== request.activationSequence) return false;
  try {
    await requireCommunityChatAccess({ ctx, communityId: request.communityId, userId: membership.userId });
    const state = await getMemberMilestone({ ctx, workflowId: workflow._id, membershipId: membership._id });
    const current = resolveCurrentMilestone({ workflow, membership, state });
    return !current.completedAt && current.milestone.key === request.milestoneKey
      && current.milestoneEnteredAt === request.milestoneEnteredAt;
  } catch { return false; }
}

export async function assignWorkflowForm(args: any) {
  const { ctx, workflow, membership, current, automation, workflowRunId } = args;
  const prior = await ctx.db.query("communityFormRequests").withIndex("by_assignment", (q: any) => q
    .eq("workflowId", workflow._id).eq("membershipId", membership._id)
    .eq("activationSequence", membership.activationSequence ?? 0).eq("milestoneKey", current.milestone.key)
    .eq("milestoneEnteredAt", current.milestoneEnteredAt).eq("automationKey", automation.key)).unique();
  if (prior) return prior._id;
  await requireCommunityChatAccess({ ctx, communityId: workflow.communityId, userId: membership.userId });
  const form = await ctx.db.query("communityForms").withIndex("by_community_key", (q: any) => q
    .eq("communityId", workflow.communityId).eq("key", automation.action.formKey)).unique();
  if (!form?.publishedRevision) throw new Error("form_not_published");
  const version = await ctx.db.query("communityFormVersions").withIndex("by_form_revision", (q: any) => q
    .eq("formId", form._id).eq("revision", form.publishedRevision)).unique();
  if (!version) throw new Error("form_version_missing");
  return ctx.db.insert("communityFormRequests", {
    communityId: workflow.communityId, workflowId: workflow._id, membershipId: membership._id,
    workflowRunId, automationKey: automation.key, milestoneKey: current.milestone.key,
    milestoneEnteredAt: current.milestoneEnteredAt, activationSequence: membership.activationSequence ?? 0,
    formKey: form.key, versionId: version._id, status: "pending", answers: {}, revision: 0,
    createdAt: Date.now(), updatedAt: Date.now(),
  });
}

export async function cancelMilestoneFormRequests(ctx: any, membershipId: any) {
  const rows = await ctx.db.query("communityFormRequests").withIndex("by_member_status", (q: any) => q.eq("membershipId", membershipId).eq("status", "pending")).collect();
  for (const row of rows) await ctx.db.patch(row._id, { status: "cancelled", updatedAt: Date.now() });
}
