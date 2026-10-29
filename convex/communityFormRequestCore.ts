import { communityMembershipRowIsActive, requireCommunityChatAccess } from "./communityCore";
import { getMemberMilestone, resolveCurrentMilestone } from "./communityMemberWorkflowReadCore";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

export const MAX_PENDING_MEMBER_FORMS = 12;
export const FORM_CLEANUP_BATCH_SIZE = 25;
export type FormVisit = { membershipId: Id<"communityMemberships">; workflowId: Id<"communityMemberWorkflows">; activationSequence: number; milestoneKey: string; milestoneEnteredAt: number };
export function pendingFormsForVisit(ctx: Pick<QueryCtx, "db">, visit: FormVisit) {
  return ctx.db.query("communityFormRequests").withIndex("by_member_visit_status", q => q
    .eq("membershipId", visit.membershipId).eq("workflowId", visit.workflowId)
    .eq("activationSequence", visit.activationSequence).eq("milestoneKey", visit.milestoneKey)
    .eq("milestoneEnteredAt", visit.milestoneEnteredAt).eq("status", "pending"));
}

export async function requestIsCurrent(ctx: any, request: any) {
  const membership = await ctx.db.get(request.membershipId);
  const workflow = await ctx.db.get(request.workflowId);
  if (!communityMembershipRowIsActive(membership) || !workflow || workflow.communityId !== request.communityId
    || membership.communityId !== request.communityId || (membership.activationSequence ?? 0) !== request.activationSequence) return false;
  try {
    await requireCommunityChatAccess({ ctx, communityId: request.communityId, userId: membership.userId, allowWelcome: true });
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
  const visit = { membershipId: membership._id, workflowId: workflow._id,
    activationSequence: membership.activationSequence ?? 0, milestoneKey: current.milestone.key,
    milestoneEnteredAt: current.milestoneEnteredAt };
  // The indexed range read and insertion share one transaction, including concurrent assignments.
  if ((await pendingFormsForVisit(ctx, visit).take(MAX_PENDING_MEMBER_FORMS)).length >= MAX_PENDING_MEMBER_FORMS) {
    throw new Error("form_pending_limit_reached");
  }
  await requireCommunityChatAccess({ ctx, communityId: workflow.communityId, userId: membership.userId, allowWelcome: true });
  const form = await ctx.db.query("communityForms").withIndex("by_community_key", (q: any) => q
    .eq("communityId", workflow.communityId).eq("key", automation.action.formKey)).unique();
  if (!form?.publishedRevision || form.deletedAt) throw new Error("form_not_published");
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

export async function cancelMilestoneFormRequests(ctx: any, visit: any) {
  const rows = await pendingFormsForVisit(ctx, visit).take(FORM_CLEANUP_BATCH_SIZE + 1);
  for (const row of rows.slice(0, FORM_CLEANUP_BATCH_SIZE)) await ctx.db.patch(row._id, { status: "cancelled", updatedAt: Date.now() });
  if (rows.length > FORM_CLEANUP_BATCH_SIZE) await ctx.scheduler.runAfter(0, internal.communityFormRequests.cancelVisitPendingInternal, visit);
}
