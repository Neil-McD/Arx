import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getUniqueCommunityMembershipByPair,
  normalizeIdValue,
  requireCommunityChatAccess,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import {
  assertLiveInteractionTarget,
  createCommunityInteractionComposerMessageCore,
  loadCommunityInteractionTarget,
  requireTargetChannelAccess,
} from "./communityInteractions";
import { memberFormQuestions } from "./communityFormRequests";
import { writeMappedFormAnswers } from "./communityClients";
import { scheduleCommunityInteractionEvidenceSync } from "./communityInteractionEvidence";
import {
  POST_CARD_READ_CAP,
  newPostCardReadCache,
  postCardPerson,
  readPollCard,
  viewerManagesCommunity,
} from "./communityPostCardRead";
import { formAnswersIssue } from "../shared/communityFormAnswers";
import { COMMUNITY_FORM_MAX_FORMS } from "../shared/communityForms";
import {
  POST_FORM_NOTE_MAX_CHARS,
  formFallbackText,
  normalizePollInput,
  pollFallbackText,
  type PostFormResponseRow,
} from "../shared/communityPostCards";

// Polls and shared Forms in posts. A card post is an ordinary post (same
// channel rules, replies, reactions, pins, notifications); the card rides
// beside it, keyed by the post. The web composer, the posts feed and the
// Polynet MCP (polynetCanonicalExecutor.ts) all use these cores.

const viewerArgs = { userId: v.optional(v.id("users")), authSubject: v.optional(v.string()) };
const answersValidator = v.record(v.string(), v.union(v.string(), v.array(v.string())));

async function viewerId(ctx: any, args: { userId?: any; authSubject?: string }) {
  return await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
}

// A readable, live post in a channel the viewer can read.
async function readableRoot(ctx: any, rootId: string, userId: any) {
  const { target, communityId } = await loadCommunityInteractionTarget({ ctx, targetType: "root", targetId: rootId });
  assertLiveInteractionTarget(target);
  await requireCommunityChatAccess({ ctx, communityId, userId });
  await requireTargetChannelAccess({ ctx, target, userId });
  return target as any;
}

async function pollForRoot(ctx: any, rootId: any) {
  const poll = await ctx.db.query("communityInteractionPolls").withIndex("by_root", (q: any) => q.eq("rootId", rootId)).first();
  if (!poll) throw new Error("poll_not_found");
  return poll;
}

async function shareForRoot(ctx: any, rootId: any) {
  const share = await ctx.db.query("communityInteractionFormShares").withIndex("by_root", (q: any) => q.eq("rootId", rootId)).first();
  if (!share) throw new Error("post_form_not_found");
  return share;
}

type CardPostArgs = {
  communityId: any;
  channelId?: any;
  idempotencyKey: string;
  // The member's own agent posting for them (the MCP), as polynet_write does.
  asCommunityAgent?: boolean;
};

async function createCardRoot(ctx: any, args: CardPostArgs & { text: string }, userId: any) {
  const result = await createCommunityInteractionComposerMessageCore(ctx, {
    communityId: args.communityId,
    ...(args.channelId ? { channelId: args.channelId } : {}),
    idempotencyKey: args.idempotencyKey,
    text: args.text,
    ...(args.asCommunityAgent ? { asCommunityAgent: true } : {}),
  }, userId) as { interaction: { root_id: string; deduped: boolean } };
  const root = await ctx.db.get(result.interaction.root_id as any);
  if (!root) throw new Error("interaction_root_create_failed");
  return { root, deduped: result.interaction.deduped };
}

export async function createPollPostCore(ctx: any, args: CardPostArgs & { question: string; options: string[]; multiple?: boolean }, userId: any) {
  const poll = normalizePollInput(args);
  if ("issue" in poll) throw new Error(poll.issue);
  const { root, deduped } = await createCardRoot(ctx, { ...args, text: pollFallbackText(poll.question, poll.options) }, userId);
  const existing = await ctx.db.query("communityInteractionPolls").withIndex("by_root", (q: any) => q.eq("rootId", root._id)).first();
  if (!existing) {
    const nowMs = Date.now();
    await ctx.db.insert("communityInteractionPolls", {
      communityId: root.communityId,
      rootId: root._id,
      question: poll.question,
      options: poll.options.map((label, index) => ({ key: `o${index + 1}`, label })),
      multiple: poll.multiple,
      createdByUserId: userId,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.patch(root._id, { cardKind: "poll" });
  }
  return { root_id: normalizeIdValue(root._id), deduped: deduped && Boolean(existing) };
}

export async function createFormPostCore(ctx: any, args: CardPostArgs & { formKey: string; note?: string; answersVisibleTo?: "everyone" | "builders" }, userId: any) {
  await requireCommunityManager({ ctx, communityId: args.communityId, userId });
  const form = await ctx.db.query("communityForms")
    .withIndex("by_community_key", (q: any) => q.eq("communityId", args.communityId).eq("key", args.formKey)).unique();
  if (!form) throw new Error("post_form_not_found");
  if (typeof form.publishedRevision !== "number") throw new Error("post_form_unpublished");
  const version = await ctx.db.query("communityFormVersions")
    .withIndex("by_form_revision", (q: any) => q.eq("formId", form._id).eq("revision", form.publishedRevision)).unique();
  if (!version) throw new Error("post_form_unpublished");
  const note = String(args.note ?? "").trim().slice(0, POST_FORM_NOTE_MAX_CHARS);
  const { root, deduped } = await createCardRoot(ctx, { ...args, text: formFallbackText(version.name, note) }, userId);
  const existing = await ctx.db.query("communityInteractionFormShares").withIndex("by_root", (q: any) => q.eq("rootId", root._id)).first();
  if (!existing) {
    await ctx.db.insert("communityInteractionFormShares", {
      communityId: root.communityId,
      rootId: root._id,
      formId: form._id,
      versionId: version._id,
      note,
      answersVisibleTo: args.answersVisibleTo === "builders" ? "builders" : "everyone",
      createdByUserId: userId,
      createdAt: Date.now(),
    });
    await ctx.db.patch(root._id, { cardKind: "form" });
  }
  return { root_id: normalizeIdValue(root._id), deduped: deduped && Boolean(existing) };
}

// Sets the viewer's choices on a poll; an empty list takes their vote back.
export async function setPollVoteCore(ctx: any, args: { rootId: string; optionKeys: string[] }, userId: any) {
  const root = await readableRoot(ctx, args.rootId, userId);
  const poll = await pollForRoot(ctx, root._id);
  if (typeof poll.closedAt === "number") throw new Error("poll_closed");
  const wanted = [...new Set(args.optionKeys)];
  const known = new Set((poll.options as Array<{ key: string }>).map((option) => option.key));
  if (wanted.some((key) => !known.has(key)) || (!poll.multiple && wanted.length > 1)) throw new Error("poll_choice_invalid");
  const current = await ctx.db.query("communityInteractionPollVotes")
    .withIndex("by_poll_user", (q: any) => q.eq("pollId", poll._id).eq("userId", userId)).take(32);
  const nowMs = Date.now();
  for (const row of current) if (!wanted.includes(row.optionKey)) await ctx.db.delete(row._id);
  for (const key of wanted) {
    if (!current.some((row: any) => row.optionKey === key)) {
      await ctx.db.insert("communityInteractionPollVotes", { communityId: poll.communityId, pollId: poll._id, userId, optionKey: key, createdAt: nowMs });
    }
  }
  return await readPollCard(ctx, poll, userId, newPostCardReadCache());
}

export async function setPollClosedCore(ctx: any, args: { rootId: string; closed: boolean; communityId?: any }, userId: any) {
  const root = await readableRoot(ctx, args.rootId, userId);
  const poll = await pollForRoot(ctx, root._id);
  // An owner's agent is mounted on one community and closes polls only there.
  if (args.communityId && normalizeIdValue(poll.communityId) !== normalizeIdValue(args.communityId)) throw new Error("community_forbidden");
  const cache = newPostCardReadCache();
  const allowed = normalizeIdValue(poll.createdByUserId) === normalizeIdValue(userId) ||
    await viewerManagesCommunity(ctx, poll.communityId, userId, cache);
  if (!allowed) throw new Error("community_forbidden");
  const closedAt = args.closed ? (poll.closedAt ?? Date.now()) : undefined;
  await ctx.db.patch(poll._id, { closedAt, updatedAt: Date.now() });
  return await readPollCard(ctx, { ...poll, closedAt }, userId, cache);
}

async function ownResponse(ctx: any, shareId: any, userId: any) {
  return await ctx.db.query("communityInteractionFormResponses")
    .withIndex("by_share_user", (q: any) => q.eq("shareId", shareId).eq("userId", userId)).first();
}

export async function readPostFormForViewerCore(ctx: any, args: { rootId: string }, userId: any) {
  const root = await readableRoot(ctx, args.rootId, userId);
  const share = await shareForRoot(ctx, root._id);
  const version = await ctx.db.get(share.versionId);
  if (!version) throw new Error("post_form_not_found");
  const own = await ownResponse(ctx, share._id, userId);
  return {
    id: normalizeIdValue(share._id),
    name: version.name,
    questions: await memberFormQuestions(ctx, share.communityId, version.questions),
    answers: own?.answers ?? {},
    revision: own?.revision ?? 0,
    status: own?.status ?? "none",
  };
}

// The same save contract as a member's assigned forms (communityFormRequests.ts):
// drafts autosave by revision, a submit freezes the answers, and an exact
// retry of a submit succeeds.
export async function savePostFormAnswersCore(ctx: any, args: {
  rootId: string; expectedRevision: number; answers: Record<string, string | string[]>; submit: boolean;
}, userId: any) {
  const root = await readableRoot(ctx, args.rootId, userId);
  const share = await shareForRoot(ctx, root._id);
  const own = await ownResponse(ctx, share._id, userId);
  if (own?.status === "submitted") {
    if (args.submit && JSON.stringify(own.answers) === JSON.stringify(args.answers)) return { revision: own.revision, submitted: true };
    throw new Error("form_already_submitted");
  }
  if (!args.submit && own && JSON.stringify(own.answers) === JSON.stringify(args.answers)) return { revision: own.revision, submitted: false };
  if ((own?.revision ?? 0) !== args.expectedRevision) throw new Error("form_answer_conflict");
  const version = await ctx.db.get(share.versionId);
  if (!version) throw new Error("post_form_not_found");
  const issue = formAnswersIssue(args.submit ? await memberFormQuestions(ctx, share.communityId, version.questions) : version.questions, args.answers, args.submit);
  if (issue) throw new Error(issue);
  const nowMs = Date.now();
  const revision = (own?.revision ?? 0) + 1;
  const status = args.submit ? "submitted" as const : "draft" as const;
  const patch = { answers: args.answers, revision, status, updatedAt: nowMs, ...(args.submit ? { submittedAt: nowMs } : {}) };
  if (own) await ctx.db.patch(own._id, patch);
  else await ctx.db.insert("communityInteractionFormResponses", { ...patch, communityId: share.communityId, shareId: share._id, userId, createdAt: nowMs });
  if (args.submit) {
    // A mapped question fills the member's client property, as it does from an assigned form.
    const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId: share.communityId, userId });
    if (membership) await writeMappedFormAnswers(ctx, { communityId: share.communityId, membership, questions: version.questions, answers: args.answers });
    await scheduleCommunityInteractionEvidenceSync({ ctx, communityId: root.communityId, objectType: "root", objectId: root._id });
  }
  return { revision, submitted: args.submit };
}

function answerText(question: { type: string; options: string[] }, answer: string | string[] | undefined): string {
  if (answer === undefined) return "";
  if (question.type === "single_choice") return question.options[Number(answer)] ?? "";
  if (question.type === "multiple_choice") return (Array.isArray(answer) ? answer : []).map((index) => question.options[Number(index)] ?? "").filter(Boolean).join(", ");
  return Array.isArray(answer) ? answer.join(", ") : answer;
}

export async function listPostFormResponsesCore(ctx: any, args: { rootId: string }, userId: any): Promise<{ rows: PostFormResponseRow[]; can_view_answers: boolean }> {
  const root = await readableRoot(ctx, args.rootId, userId);
  const share = await shareForRoot(ctx, root._id);
  const version = await ctx.db.get(share.versionId);
  const cache = newPostCardReadCache();
  const canViewAnswers = share.answersVisibleTo === "everyone" || await viewerManagesCommunity(ctx, share.communityId, userId, cache);
  const rows = (await ctx.db.query("communityInteractionFormResponses")
    .withIndex("by_share", (q: any) => q.eq("shareId", share._id)).take(POST_CARD_READ_CAP))
    .filter((row: any) => row.status === "submitted")
    .sort((a: any, b: any) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0));
  return {
    can_view_answers: canViewAnswers,
    rows: await Promise.all(rows.map(async (row: any) => ({
      person: await postCardPerson(ctx, row.userId, cache),
      submitted_at: toIsoString(row.submittedAt ?? row.updatedAt),
      answers: canViewAnswers && version
        ? version.questions.map((question: any) => ({ question: question.title, answer: answerText(question, row.answers[question.key]) }))
        : null,
    }))),
  };
}

// Published Forms an owner can drop into a post.
export const listShareablePostForms = query({
  args: { ...viewerArgs, communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const userId = await viewerId(ctx, args);
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const forms = await ctx.db.query("communityForms").withIndex("by_community_key", (q) => q.eq("communityId", args.communityId)).take(COMMUNITY_FORM_MAX_FORMS);
    return forms.filter((form) => typeof form.publishedRevision === "number")
      .map((form) => ({ key: form.key, name: form.name, question_count: form.questions.length }));
  },
});

const cardPostArgs = {
  communityId: v.id("communities"),
  channelId: v.optional(v.id("communityChannels")),
  idempotencyKey: v.string(),
};
const pollArgs = { question: v.string(), options: v.array(v.string()), multiple: v.optional(v.boolean()) };
const formShareArgs = { formKey: v.string(), note: v.optional(v.string()), answersVisibleTo: v.optional(v.union(v.literal("everyone"), v.literal("builders"))) };
const trusted = { trustedUserId: v.id("users"), asCommunityAgent: v.optional(v.boolean()) };

export const createPollPost = mutation({
  args: { ...viewerArgs, ...cardPostArgs, ...pollArgs },
  handler: async (ctx, { userId, authSubject, ...args }) => createPollPostCore(ctx, args, await viewerId(ctx, { userId, authSubject })),
});
export const createFormPost = mutation({
  args: { ...viewerArgs, ...cardPostArgs, ...formShareArgs },
  handler: async (ctx, { userId, authSubject, ...args }) => createFormPostCore(ctx, args, await viewerId(ctx, { userId, authSubject })),
});
export const votePostPoll = mutation({
  args: { ...viewerArgs, rootId: v.string(), optionKeys: v.array(v.string()) },
  handler: async (ctx, { userId, authSubject, ...args }) => setPollVoteCore(ctx, args, await viewerId(ctx, { userId, authSubject })),
});
export const setPostPollClosed = mutation({
  args: { ...viewerArgs, rootId: v.string(), closed: v.boolean(), communityId: v.optional(v.id("communities")) },
  handler: async (ctx, { userId, authSubject, ...args }) => setPollClosedCore(ctx, args, await viewerId(ctx, { userId, authSubject })),
});
export const getPostFormForViewer = query({
  args: { ...viewerArgs, rootId: v.string() },
  handler: async (ctx, { userId, authSubject, ...args }) => readPostFormForViewerCore(ctx, args, await viewerId(ctx, { userId, authSubject })),
});
export const savePostFormAnswers = mutation({
  args: { ...viewerArgs, rootId: v.string(), expectedRevision: v.number(), answers: answersValidator, submit: v.boolean() },
  handler: async (ctx, { userId, authSubject, ...args }) => savePostFormAnswersCore(ctx, args, await viewerId(ctx, { userId, authSubject })),
});
export const listPostFormResponses = query({
  args: { ...viewerArgs, rootId: v.string() },
  handler: async (ctx, { userId, authSubject, ...args }) => listPostFormResponsesCore(ctx, args, await viewerId(ctx, { userId, authSubject })),
});

// For the Polynet MCP: the caller was already authenticated by the canonical executor.
export const createPollPostForTrustedUserInternal = internalMutation({
  args: { ...trusted, ...cardPostArgs, ...pollArgs },
  handler: async (ctx, { trustedUserId, ...args }) => createPollPostCore(ctx, args, trustedUserId),
});
export const createFormPostForTrustedUserInternal = internalMutation({
  args: { ...trusted, ...cardPostArgs, ...formShareArgs },
  handler: async (ctx, { trustedUserId, ...args }) => createFormPostCore(ctx, args, trustedUserId),
});
export const votePostPollForTrustedUserInternal = internalMutation({
  args: { trustedUserId: v.id("users"), rootId: v.string(), optionKeys: v.array(v.string()) },
  handler: async (ctx, { trustedUserId, ...args }) => setPollVoteCore(ctx, args, trustedUserId),
});
export const savePostFormAnswersForTrustedUserInternal = internalMutation({
  args: { trustedUserId: v.id("users"), rootId: v.string(), expectedRevision: v.number(), answers: answersValidator, submit: v.boolean() },
  handler: async (ctx, { trustedUserId, ...args }) => savePostFormAnswersCore(ctx, args, trustedUserId),
});
export const readPollForTrustedUserInternal = internalQuery({
  args: { trustedUserId: v.id("users"), rootId: v.string() },
  handler: async (ctx, { trustedUserId, rootId }) => {
    const root = await readableRoot(ctx, rootId, trustedUserId);
    return await readPollCard(ctx, await pollForRoot(ctx, root._id), trustedUserId, newPostCardReadCache());
  },
});
