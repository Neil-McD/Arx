import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { resolveUserIdForAuthenticatedRequest, requireCommunityChatAccess, requireCommunityManager, getUniqueCommunityMembershipByPair } from "./communityCore";
import { requestIsCurrent, pendingFormsForVisit, cancelMilestoneFormRequests } from "./communityFormRequestCore";
import { getCommunityMemberWorkflowByCommunity, getMemberMilestone, resolveCurrentMilestone } from "./communityMemberWorkflowReadCore";
import { readSubmittedFormRecords } from "./communityFormEvidenceCore";
import { processSubmittedWorkflowForm } from "./communityMemberWorkflows";
import { formAnswersIssue, formQuestionAnswered } from "../shared/communityFormAnswers";
const scope = { communityId: v.id("communities"), authSubject: v.optional(v.string()) };
async function actor(ctx: any, args: any) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
  await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
  return userId;
}
async function ownRequest(ctx: any, args: any): Promise<Doc<"communityFormRequests">> {
  const userId = await actor(ctx, args);
  const request = await ctx.db.get(args.requestId);
  const membership = request ? await ctx.db.get(request.membershipId) : null;
  if (!request || request.communityId !== args.communityId || membership?.userId !== userId) throw new Error("form_request_not_found");
  return request;
}
export const listMyRequests = query({ args: { ...scope, paged: v.optional(v.boolean()), cursor: v.optional(v.union(v.string(), v.null())), visit: v.optional(v.union(v.string(), v.null())) }, handler: async (ctx, args) => {
  const userId = await actor(ctx, args);
  const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId: args.communityId, userId });
  const empty = args.paged ? { rows: [], nextCursor: null, visit: null } : [];
  if (!membership) return empty;
  const workflow = await getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId });
  if (!workflow) return empty;
  const state = await getMemberMilestone({ ctx, workflowId: workflow._id, membershipId: membership._id });
  const current = resolveCurrentMilestone({ workflow, membership, state });
  if (current.completedAt) return empty;
  const visit = { membershipId: membership._id, workflowId: workflow._id, activationSequence: membership.activationSequence ?? 0,
    milestoneKey: current.milestone.key, milestoneEnteredAt: current.milestoneEnteredAt };
  const visitKey = JSON.stringify(visit);
  // A live paginated query's journal belongs to one immutable index range.
  // Tell new clients to rebind before paging a different visit, even at cursor=null.
  // Undefined preserves the already-deployed client ABI; null requests discovery.
  if (args.paged && args.visit !== undefined && args.visit !== visitKey)
    return { rows: [], nextCursor: null, visit: visitKey };
  const page = await pendingFormsForVisit(ctx, visit).paginate({ cursor: args.paged ? args.cursor ?? null : null, numItems: 12 });
  const rows = page.page;
  const result = [];
  for (const row of rows) {
    if (!await requestIsCurrent(ctx, row)) continue;
    const version = await ctx.db.get(row.versionId);
    if (version) result.push({ id: row._id, name: version.name, answered: version.questions.filter(q => formQuestionAnswered(q, row.answers)).length, total: version.questions.length, createdAt: row.createdAt });
  }
  result.sort((a, b) => a.createdAt - b.createdAt);
  return args.paged ? { rows: result, nextCursor: page.isDone ? null : page.continueCursor, visit: visitKey } : result;
} });
export const cancelVisitPendingInternal = internalMutation({ args: {
  membershipId: v.id("communityMemberships"), workflowId: v.id("communityMemberWorkflows"), activationSequence: v.number(), milestoneKey: v.string(), milestoneEnteredAt: v.number(),
}, handler: async (ctx, args) => {
  // A stale or accidentally early job must never cancel the active visit.
  const membership = await ctx.db.get(args.membershipId);
  const workflow = await ctx.db.get(args.workflowId);
  if (membership && workflow && (membership.activationSequence ?? 0) === args.activationSequence) {
    const state = await getMemberMilestone({ ctx, workflowId: workflow._id, membershipId: membership._id });
    const current = resolveCurrentMilestone({ workflow, membership, state });
    if (!current.completedAt && current.milestone.key === args.milestoneKey && current.milestoneEnteredAt === args.milestoneEnteredAt) return;
  }
  await cancelMilestoneFormRequests(ctx, args);
} });
export const getMyRequest = query({ args: { ...scope, requestId: v.id("communityFormRequests") }, handler: async (ctx, args) => {
  const row = await ownRequest(ctx, args);
  if (row.status !== "pending" || !await requestIsCurrent(ctx, row)) throw new Error("form_request_expired");
  const version = await ctx.db.get(row.versionId);
  if (!version) throw new Error("form_version_missing");
  return { id: row._id, name: version.name, questions: version.questions, answers: row.answers, revision: row.revision };
} });
export const saveMyAnswers = mutation({ args: { ...scope, requestId: v.id("communityFormRequests"), expectedRevision: v.number(), answers: v.record(v.string(), v.union(v.string(), v.array(v.string()))), submit: v.boolean() }, handler: async (ctx, args) => {
  const row = await ownRequest(ctx, args);
  // A lost submit response may safely retry, never overwrite completed answers.
  if (row.status === "submitted" && args.submit) {
    if (JSON.stringify(row.answers) !== JSON.stringify(args.answers)) throw new Error("form_already_submitted");
    return { revision: row.revision, submitted: true };
  }
  if (row.status !== "pending" || !await requestIsCurrent(ctx, row)) throw new Error("form_request_expired");
  if (!args.submit && JSON.stringify(row.answers) === JSON.stringify(args.answers)) return { revision: row.revision, submitted: false };
  if (row.revision !== args.expectedRevision) throw new Error("form_answer_conflict");
  const version = await ctx.db.get(row.versionId);
  if (!version) throw new Error("form_version_missing");
  const issue = formAnswersIssue(version.questions, args.answers, args.submit);
  if (issue) throw new Error(issue);
  const revision = row.revision + 1;
  await ctx.db.patch(row._id, { answers: args.answers, revision, updatedAt: Date.now(),
    ...(args.submit ? { status: "submitted" as const, submittedAt: Date.now() } : {}) });
  if (args.submit) await processSubmittedWorkflowForm(ctx, await ctx.db.get(row._id));
  return { revision, submitted: args.submit };
} });
export const listBuilderResponses = query({ args: { ...scope, membershipId: v.id("communityMemberships"), includeCompleteness: v.optional(v.boolean()) }, handler: async (ctx, args) => {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
  await requireCommunityManager({ ctx, communityId: args.communityId, userId });
  const membership = await ctx.db.get(args.membershipId);
  if (!membership || membership.communityId !== args.communityId) throw new Error("form_request_not_found");
  const { records, scan_truncated, unavailable } = await readSubmittedFormRecords(ctx, membership);
  const rows = records.map(({ request, version }) => ({ id: request._id, answers: request.answers, submittedAt: request.submittedAt, form: version }));
  // Preserve the array ABI for already-open clients during deployment.
  return args.includeCompleteness ? { rows, truncated: scan_truncated, unavailable_records: unavailable } : rows;
} });
