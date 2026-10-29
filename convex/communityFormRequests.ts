import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveUserIdForAuthenticatedRequest, requireCommunityChatAccess, communityMembershipRowIsActive, requireCommunityManager, getUniqueCommunityMembershipByPair } from "./communityCore";
import { requestIsCurrent, pendingFormsForVisit, cancelMilestoneFormRequests } from "./communityFormRequestCore";
import { getCommunityMemberWorkflowByCommunity, getMemberMilestone, resolveCurrentMilestone } from "./communityMemberWorkflowReadCore";
import { readSubmittedFormRecord, readSubmittedFormRecords } from "./communityFormEvidenceCore";
import { processSubmittedWorkflowForm } from "./communityMemberWorkflows";
import { writeMappedFormAnswers } from "./communityClients";
import { formAnswersIssue, formQuestionAnswered } from "../shared/communityFormAnswers";
import { communityClientAnswerFormat } from "../shared/communityClients";
import type { CommunityFormQuestion } from "../shared/communityForms";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
const scope = { communityId: v.id("communities"), authSubject: v.optional(v.string()) };
async function actor(ctx: any, args: any) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
  await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId, allowWelcome: true });
  return userId;
}
async function ownRequest(ctx: any, args: any): Promise<Doc<"communityFormRequests">> {
  const userId = await actor(ctx, args);
  const request = await ctx.db.get(args.requestId);
  const membership = request ? await ctx.db.get(request.membershipId) : null;
  if (!request || request.communityId !== args.communityId || membership?.userId !== userId) throw new Error("form_request_not_found");
  return request;
}
async function listOwnRequests(ctx: QueryCtx, args: { communityId: Id<"communities">; userId: Id<"users">; paged?: boolean; cursor?: string | null; visit?: string | null }) {
  const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId: args.communityId, userId: args.userId });
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
    if (version) result.push({ id: row._id, form_key: row.formKey, name: version.name, answered: version.questions.filter(q => formQuestionAnswered(q, row.answers)).length, total: version.questions.length, createdAt: row.createdAt });
  }
  result.sort((a, b) => a.createdAt - b.createdAt);
  return args.paged ? { rows: result, nextCursor: page.isDone ? null : page.continueCursor, visit: visitKey } : result;
}
export const listMyRequests = query({ args: { ...scope, paged: v.optional(v.boolean()), cursor: v.optional(v.union(v.string(), v.null())), visit: v.optional(v.union(v.string(), v.null())) }, handler: async (ctx, args) => {
  const userId = await actor(ctx, args);
  return listOwnRequests(ctx, { ...args, userId });
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
// Questions as the member answers them: a short answer that fills a number, date
// or link property says so, so the member is asked for that shape up front.
export async function memberFormQuestions(ctx: QueryCtx, communityId: Id<"communities">, questions: CommunityFormQuestion[]): Promise<CommunityFormQuestion[]> {
  return await Promise.all(questions.map(async (question) => {
    if (!question.clientPropertyKey || question.type !== "short_text") return question;
    const property = await ctx.db.query("communityClientProperties")
      .withIndex("by_community_key", (q: any) => q.eq("communityId", communityId).eq("key", question.clientPropertyKey!)).unique();
    const answerFormat = property && !property.archivedAt ? communityClientAnswerFormat(property.type) : null;
    return answerFormat ? { ...question, answerFormat } : question;
  }));
}
export const getMyRequest = query({ args: { ...scope, requestId: v.id("communityFormRequests") }, handler: async (ctx, args) => {
  const row = await ownRequest(ctx, args);
  if (row.status !== "pending" || !await requestIsCurrent(ctx, row)) throw new Error("form_request_expired");
  const version = await ctx.db.get(row.versionId);
  if (!version) throw new Error("form_version_missing");
  return { id: row._id, name: version.name, questions: await memberFormQuestions(ctx, row.communityId, version.questions), answers: row.answers, revision: row.revision };
} });
export async function saveOwnAnswers(ctx: MutationCtx, args: { expectedRevision: number; answers: Record<string, string | string[]>; submit: boolean }, row: Doc<"communityFormRequests">) {
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
  const issue = formAnswersIssue(args.submit ? await memberFormQuestions(ctx, row.communityId, version.questions) : version.questions, args.answers, args.submit);
  if (issue) throw new Error(issue);
  const revision = row.revision + 1;
  await ctx.db.patch(row._id, { answers: args.answers, revision, updatedAt: Date.now(),
    ...(args.submit ? { status: "submitted" as const, submittedAt: Date.now() } : {}) });
  if (args.submit) {
    // Answers fill the client properties their questions map to before any
    // Workflow rule on this submission runs, so those rules see the new values.
    await writeMappedFormAnswers(ctx, { communityId: row.communityId, membership: await ctx.db.get(row.membershipId),
      questions: version.questions, answers: args.answers });
    await processSubmittedWorkflowForm(ctx, await ctx.db.get(row._id));
  }
  return { revision, submitted: args.submit };
}
export const saveMyAnswers = mutation({ args: { ...scope, requestId: v.id("communityFormRequests"), expectedRevision: v.number(), answers: v.record(v.string(), v.union(v.string(), v.array(v.string()))), submit: v.boolean() }, handler: async (ctx, args) => {
  const row = await ownRequest(ctx, args);
  return saveOwnAnswers(ctx, args, row);
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

// These adapters accept only the actor resolved by the canonical executor, never a
// caller-selected self identity. Current authority is checked before receipt replay.
const selfScope = { communityId: v.id("communities"), userId: v.id("users") };
async function selfMembership(ctx: QueryCtx, args: { communityId: Id<"communities">; userId: Id<"users"> }) {
  await requireCommunityChatAccess({ ctx, ...args, allowWelcome: true });
  const membership = await getUniqueCommunityMembershipByPair({ ctx, ...args });
  if (!communityMembershipRowIsActive(membership)) throw new Error("form_request_unavailable");
  const row = membership ? await ctx.db.get(membership._id as Id<"communityMemberships">) : null;
  if (!row) throw new Error("form_request_unavailable");
  return row;
}
async function selfRequest(ctx: QueryCtx, args: { communityId: Id<"communities">; userId: Id<"users">; requestId: Id<"communityFormRequests"> }) {
  const membership = await selfMembership(ctx, args);
  const row = await ctx.db.get(args.requestId);
  if (!row || row.communityId !== args.communityId || row.membershipId !== membership._id ||
      row.activationSequence !== (membership.activationSequence ?? 0)) throw new Error("form_request_unavailable");
  return { membership, row };
}
async function pinnedVersion(ctx: QueryCtx, row: Doc<"communityFormRequests">) {
  const version = await ctx.db.get(row.versionId);
  const form = version ? await ctx.db.get(version.formId) : null;
  if (!version || version.communityId !== row.communityId || !form ||
      form.communityId !== row.communityId || form.key !== row.formKey) throw new Error("form_request_unavailable");
  return version;
}
function formDocument(row: Doc<"communityFormRequests">, version: Doc<"communityFormVersions">) {
  const value = { ref: `form-request:${row._id}`, form_version_ref: `form-version:${version._id}`,
    name: version.name, questions: version.questions, answers: row.answers, revision: row.revision,
    status: row.status, submitted_at: row.submittedAt ?? null,
    assignment: { workflow_ref: `workflow:${row.workflowId}`, activation_sequence: row.activationSequence,
      milestone_key: row.milestoneKey, milestone_entered_at: row.milestoneEnteredAt } };
  if (JSON.stringify(value, null, 2).length > 24_000) throw new Error("form_payload_too_large");
  return value;
}
export const listOwnFormsInternal = internalQuery({ args: { ...selfScope, cursor: v.optional(v.string()) }, handler: async (ctx, args) => {
  await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: args.userId, allowWelcome: true });
  const scope = JSON.stringify([args.userId, args.communityId, 1]);
  let decoded: { scope: string; cursor: string; visit: string } | undefined;
  if (args.cursor !== undefined) {
    try { decoded = JSON.parse(args.cursor); } catch { throw new Error("form_cursor_invalid"); }
    if (args.cursor.length > 2048 || decoded?.scope !== scope || typeof decoded.cursor !== "string" ||
        !decoded.cursor || typeof decoded.visit !== "string") throw new Error("form_cursor_invalid");
  }
  const page = await listOwnRequests(ctx, { ...args, paged: true, cursor: decoded?.cursor, visit: decoded?.visit });
  if (Array.isArray(page)) throw new Error("form_cursor_invalid");
  return { rows: page.rows, next_cursor: page.nextCursor ? JSON.stringify({ scope, cursor: page.nextCursor, visit: page.visit }) : null,
    visit_changed: !!decoded && decoded.visit !== page.visit };
} });
export const readOwnFormInternal = internalQuery({ args: { ...selfScope, requestId: v.id("communityFormRequests") }, handler: async (ctx, args) => {
  const { membership, row } = await selfRequest(ctx, args);
  const record = row.status === "submitted" ? await readSubmittedFormRecord(ctx, membership, row) :
    row.status === "pending" && await requestIsCurrent(ctx, row) ? { version: await pinnedVersion(ctx, row) } : null;
  if (!record?.version) throw new Error("form_request_unavailable");
  return formDocument(row, record.version);
} });
export const submitOwnFormInternal = internalMutation({ args: { ...selfScope,
  principalKind: v.union(v.literal("community_agent_for_member"), v.literal("external_mcp"), v.literal("community_app")),
  requestId: v.id("communityFormRequests"), versionId: v.id("communityFormVersions"), expectedRevision: v.number(),
  answers: v.record(v.string(), v.union(v.string(), v.array(v.string()))), idempotencyKey: v.string(),
}, handler: async (ctx, args): Promise<Record<string, any>> => {
  const { membership, row } = await selfRequest(ctx, args);
  if (!args.idempotencyKey.trim() || args.idempotencyKey.length > 200 ||
      !Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0) throw new Error("invalid_tool_args");
  const answers = Object.fromEntries(Object.keys(args.answers).sort().map(key => [key, args.answers[key]]));
  if (JSON.stringify(answers).length > 24_000) throw new Error("form_payload_too_large");
  const receiptScope = { communityId: args.communityId, userId: args.userId, principalKind: args.principalKind,
    toolName: "polynet_call" as const, idempotencyKey: args.idempotencyKey };
  const requestFingerprint = JSON.stringify(["community.form.submit", 1, args.requestId, args.versionId, args.expectedRevision, answers]);
  const reservation = await ctx.runMutation(internal.polynetCanonicalReceipts.reserveCanonicalOperationReceiptInternal,
    { ...receiptScope, requestFingerprint });
  if (!reservation.ok) return reservation;
  if (reservation.status === "completed") {
    const value = reservation.result;
    return { ...value, deduped: true, receipt: { ...value.receipt, deduped: true } };
  }
  if (!reservation.attemptToken || !reservation.leaseExpiresAt || reservation.leaseExpiresAt <= Date.now()) throw new Error("operation_in_progress");
  if (row.status !== "pending" || row.versionId !== args.versionId || !await requestIsCurrent(ctx, row)) throw new Error("form_request_unavailable");
  const version = await pinnedVersion(ctx, row);
  // Check the exact same representation served by reads, including JSON escaping.
  formDocument({ ...row, answers, revision: row.revision + 1, status: "submitted", submittedAt: Date.now() }, version);
  const saved = await saveOwnAnswers(ctx, { ...args, answers, submit: true }, row);
  const submitted = (await ctx.db.get(row._id))!;
  const community = (await ctx.db.get(args.communityId))!;
  const value = { ok: true, operation: "community.form.submit", deduped: false,
    result: { status: "submitted", form_request_ref: `form-request:${row._id}`, form_version_ref: `form-version:${row.versionId}`,
      revision: saved.revision, submitted_at: submitted.submittedAt },
    receipt: { contract: "polynet.canonical.operation:v1", tool: "polynet_call", principal_kind: args.principalKind,
      community_id: String(args.communityId), community_slug: community.slug, authority_lane: "member", relation: membership.role,
      idempotency_key: args.idempotencyKey, deduped: false } };
  await ctx.runMutation(internal.polynetCanonicalReceipts.completeCanonicalOperationReceiptInternal,
    { ...receiptScope, requestFingerprint, attemptToken: reservation.attemptToken, result: value });
  return value;
} });
