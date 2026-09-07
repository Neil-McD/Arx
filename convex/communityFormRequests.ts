import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { resolveUserIdForAuthenticatedRequest, requireCommunityChatAccess, requireCommunityManager, getUniqueCommunityMembershipByPair } from "./communityCore";
import { requestIsCurrent } from "./communityFormRequestCore";
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
export const listMyRequests = query({ args: scope, handler: async (ctx, args) => {
  const userId = await actor(ctx, args);
  const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId: args.communityId, userId });
  if (!membership) return [];
  const rows = await ctx.db.query("communityFormRequests").withIndex("by_member_status", q => q.eq("membershipId", membership._id).eq("status", "pending")).collect();
  const result = [];
  for (const row of rows) {
    if (!await requestIsCurrent(ctx, row)) continue;
    const version = await ctx.db.get(row.versionId);
    if (version) result.push({ id: row._id, name: version.name, answered: version.questions.filter(q => formQuestionAnswered(q, row.answers)).length, total: version.questions.length, createdAt: row.createdAt });
  }
  return result.sort((a, b) => a.createdAt - b.createdAt);
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
  if (args.submit) await processSubmittedWorkflowForm(ctx, row);
  return { revision, submitted: args.submit };
} });
export const listBuilderResponses = query({ args: { ...scope, membershipId: v.id("communityMemberships") }, handler: async (ctx, args) => {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
  await requireCommunityManager({ ctx, communityId: args.communityId, userId });
  const membership = await ctx.db.get(args.membershipId);
  if (!membership || membership.communityId !== args.communityId) throw new Error("form_request_not_found");
  const { records } = await readSubmittedFormRecords(ctx, membership);
  return records.map(({ request, version }) => ({ id: request._id, answers: request.answers, submittedAt: request.submittedAt, form: version }));
} });
