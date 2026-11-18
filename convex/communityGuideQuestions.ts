// What the guide asks a person before doing something for them in their
// private talk (shared/guideQuestions.ts; which actions ask:
// shared/operationCatalog.ts, guideAskFor). The executor saves the exact call
// here instead of running it; the person answers above the box where they
// type; yes runs that same call as them, through the same executor and the
// same checks. Nothing here decides who may do what.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { resolveCommunityChannelActor } from "./communityChannelAccess";
import { resolveAuthorizedCommunityChannel } from "./communityChannelCore";
import { executePolynetCanonicalTool } from "./polynetCanonicalExecutor";
import { GUIDE_ASK_ALWAYS_ALLOWABLE } from "../shared/operationCatalog";
import {
  GUIDE_QUESTION_ITEM_TEXT_MAX, GUIDE_QUESTION_ITEMS_SHOWN, GUIDE_QUESTION_TEXT_MAX, GUIDE_QUESTION_WAIT_MS,
  postResultLine, removeResultLine, type GuideAnswerResult, type GuideQuestionView,
} from "../shared/guideQuestions";
import { buildCommunityTabPath } from "../shared/webAppRouteState";

const internalRefs = internal as any;
const INPUT_MAX_CHARS = 60_000;

function waitingRows(ctx: any, communityId: any, userId: any) {
  return ctx.db.query("communityGuideQuestions")
    .withIndex("by_community_user_status_createdAt", (q: any) => q.eq("communityId", communityId).eq("userId", userId).eq("status", "waiting"))
    .order("asc").take(20);
}

function view(row: any): GuideQuestionView {
  return { id: String(row._id), kind: row.kind, question: row.question, text: row.text ?? null, items: row.items ?? [],
    canAlways: GUIDE_ASK_ALWAYS_ALLOWABLE[row.kind as "post" | "remove"] === true };
}

// ---- the executor's side

export const isAlwaysAllowedInternal = internalQuery({
  args: { communityId: v.id("communities"), userId: v.id("users"), kind: v.literal("post") },
  handler: async (ctx, args) => Boolean(await ctx.db.query("communityGuideAlwaysAllowed")
    .withIndex("by_community_user_kind", (q) => q.eq("communityId", args.communityId).eq("userId", args.userId).eq("kind", args.kind)).first()),
});

// Who wrote each post and how it starts, for a question about removing them.
// A post in a channel this person can't read is never described to them.
export const describePostsInternal = internalQuery({
  args: { communityId: v.id("communities"), userId: v.id("users"), refs: v.array(v.string()) },
  handler: async (ctx, args) => {
    const items: Array<{ who: string; text: string }> = [];
    const hidden = { who: "A post", text: "It isn't there, or isn't one you can see." };
    let actor: any = null;
    for (const ref of args.refs.slice(0, GUIDE_QUESTION_ITEMS_SHOWN)) {
      const match = /^interaction:(root|reply):([A-Za-z0-9_-]{1,64})$/.exec(ref);
      const id = match ? ctx.db.normalizeId(match[1] === "root" ? "communityInteractionRoots" : "communityInteractionReplies", match[2]) : null;
      const row: any = id ? await ctx.db.get(id) : null;
      const root: any = row && "rootId" in row ? await ctx.db.get(row.rootId) : row;
      if (!row || !root || String(row.communityId) !== String(args.communityId) || String(root.communityId) !== String(args.communityId)) { items.push(hidden); continue; }
      try {
        actor = actor ?? await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId: args.userId });
        await resolveAuthorizedCommunityChannel({ ctx, communityId: args.communityId, channelId: root.channelId, actor, capability: "canRead" });
      } catch { items.push(hidden); continue; }
      const author: any = row.actorUserId ? await ctx.db.get(row.actorUserId) : null;
      items.push({ who: String(author?.displayName ?? author?.handle ?? "The guide"),
        text: String(row.contentSummary ?? "").replace(/\s+/g, " ").trim().slice(0, GUIDE_QUESTION_ITEM_TEXT_MAX) || "(no words)" });
    }
    return items;
  },
});

// Saves the question. A question still waiting from an earlier turn is
// dropped: the person moved on, so nothing from it is done.
export const askInternal = internalMutation({
  args: {
    communityId: v.id("communities"), userId: v.id("users"), kind: v.union(v.literal("post"), v.literal("remove")),
    toolName: v.string(), inputJson: v.string(), question: v.string(), text: v.optional(v.string()),
    items: v.optional(v.array(v.object({ who: v.string(), text: v.string() }))), runId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.inputJson.length > INPUT_MAX_CHARS) return { ok: false as const };
    const nowMs = Date.now();
    for (const row of await waitingRows(ctx, args.communityId, args.userId)) {
      // The same call asked again in the same turn is the same question.
      if (row.runId === args.runId && row.inputJson === args.inputJson) return { ok: true as const, questionId: String(row._id) };
      if (!args.runId || row.runId !== args.runId) await ctx.db.patch(row._id, { status: "declined", answeredAt: nowMs, dropped: true });
    }
    const questionId = await ctx.db.insert("communityGuideQuestions", {
      communityId: args.communityId, userId: args.userId, kind: args.kind, toolName: args.toolName, inputJson: args.inputJson,
      question: args.question.slice(0, 300),
      ...(args.text ? { text: args.text.slice(0, GUIDE_QUESTION_TEXT_MAX) } : {}),
      ...(args.items ? { items: args.items } : {}),
      status: "waiting", ...(args.runId ? { runId: args.runId } : {}), createdAt: nowMs,
    });
    return { ok: true as const, questionId: String(questionId) };
  },
});

// ---- the person's side

export const listGuideQuestions = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args): Promise<GuideQuestionView[]> => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    const since = Date.now() - GUIDE_QUESTION_WAIT_MS;
    return (await waitingRows(ctx, args.communityId, userId)).filter((row: any) => row.createdAt > since).map(view);
  },
});

// Takes the question for answering, once. "always" also remembers the choice.
export const claimInternal = internalMutation({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), questionId: v.id("communityGuideQuestions"),
    answer: v.union(v.literal("yes"), v.literal("no"), v.literal("always")) },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    const row = await ctx.db.get(args.questionId);
    if (!row || String(row.userId) !== String(userId) || String(row.communityId) !== String(args.communityId)) throw new Error("guide_question_not_found");
    if (row.status !== "waiting") return { run: false as const, status: row.status, resultLine: row.resultLine ?? null, resultPath: row.resultPath ?? null };
    const nowMs = Date.now();
    if (args.answer === "no" || row.createdAt <= nowMs - GUIDE_QUESTION_WAIT_MS) {
      await ctx.db.patch(row._id, { status: "declined", answeredAt: nowMs });
      return { run: false as const, status: "declined" as const, resultLine: null, resultPath: null };
    }
    if (args.answer === "always" && row.kind === "post") {
      const has = await ctx.db.query("communityGuideAlwaysAllowed")
        .withIndex("by_community_user_kind", (q) => q.eq("communityId", row.communityId).eq("userId", userId).eq("kind", "post")).first();
      if (!has) await ctx.db.insert("communityGuideAlwaysAllowed", { communityId: row.communityId, userId, kind: "post", createdAt: nowMs });
    }
    await ctx.db.patch(row._id, { status: "running", answeredAt: nowMs });
    const user: any = await ctx.db.get(userId);
    const community: any = await ctx.db.get(row.communityId);
    return { run: true as const, userId: String(userId), authSubject: String(user?.authSubject ?? ""), communitySlug: String(community?.slug ?? ""),
      toolName: row.toolName, inputJson: row.inputJson, kind: row.kind };
  },
});

export const finishInternal = internalMutation({
  args: { questionId: v.id("communityGuideQuestions"), status: v.union(v.literal("done"), v.literal("failed")),
    resultLine: v.string(), resultPath: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.questionId);
    if (!row || row.status !== "running") return;
    await ctx.db.patch(row._id, { status: args.status, resultLine: args.resultLine.slice(0, 300), ...(args.resultPath ? { resultPath: args.resultPath } : {}) });
  },
});

function channelSlugOf(path: unknown): string | null {
  return /^\/communities\/[^/]+\/channels\/([a-z0-9-]+)\//.exec(String(path ?? ""))?.[1] ?? null;
}

// The person's answer. Yes (or Always allow) runs the call the guide made,
// unchanged, as them; the executor checks it again as it would any call.
export const answerGuideQuestion = action({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), questionId: v.id("communityGuideQuestions"),
    answer: v.union(v.literal("yes"), v.literal("no"), v.literal("always")) },
  handler: async (ctx, args): Promise<GuideAnswerResult> => {
    const claimed: any = await ctx.runMutation(internalRefs.communityGuideQuestions.claimInternal, args);
    if (!claimed.run) {
      const status = claimed.status === "done" || claimed.status === "failed" ? claimed.status : "declined";
      return { status, line: claimed.resultLine ?? (status === "declined" ? "Nothing was done." : "Done."), path: claimed.resultPath ?? null };
    }
    const input = JSON.parse(claimed.inputJson) as Record<string, any>;
    let result: GuideAnswerResult;
    try {
      const execution = await executePolynetCanonicalTool({
        ctx, authSubject: claimed.authSubject, userId: claimed.userId, principalKind: "community_agent_for_member",
        mountedCommunityId: String(args.communityId), evidenceSurface: "member_agent_dock", toolName: claimed.toolName, input,
        personSaidYes: true,
      });
      if (!execution.ok) result = { status: "failed", line: execution.message, path: null };
      else if (claimed.kind === "remove" && claimed.toolName === "polynet_call") {
        const outcome = (execution.value as any)?.result ?? {};
        const asked = Number(outcome.succeeded ?? 0) + Number(outcome.failed ?? 0);
        const removed = Number(outcome.succeeded ?? 0);
        result = { status: removed > 0 ? "done" : "failed", line: removeResultLine({ removed, asked }), path: null };
      } else {
        const slug = channelSlugOf(input.path);
        const mode = String(input.mode ?? "create");
        result = { status: "done", line: postResultLine({ mode, channelName: slug ?? "the channel" }),
          path: buildCommunityTabPath(claimed.communitySlug, "chat", null, null, slug) };
      }
    } catch {
      result = { status: "failed", line: "It couldn't be done just now. Ask your guide to try again.", path: null };
    }
    await ctx.runMutation(internalRefs.communityGuideQuestions.finishInternal, {
      questionId: args.questionId, status: result.status === "done" ? "done" : "failed", resultLine: result.line, ...(result.path ? { resultPath: result.path } : {}) });
    return result;
  },
});

// ---- Settings: what the guide may do without asking

export const getGuideAlwaysAllowed = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    const row = await ctx.db.query("communityGuideAlwaysAllowed")
      .withIndex("by_community_user_kind", (q) => q.eq("communityId", args.communityId).eq("userId", userId).eq("kind", "post")).first();
    return { post: Boolean(row) };
  },
});

export const setGuideAlwaysAllowed = mutation({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), kind: v.literal("post"), on: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    const rows = await ctx.db.query("communityGuideAlwaysAllowed")
      .withIndex("by_community_user_kind", (q) => q.eq("communityId", args.communityId).eq("userId", userId).eq("kind", args.kind)).take(5);
    if (args.on && rows.length === 0) await ctx.db.insert("communityGuideAlwaysAllowed", { communityId: args.communityId, userId, kind: args.kind, createdAt: Date.now() });
    if (!args.on) for (const row of rows) await ctx.db.delete(row._id);
    return { post: args.on };
  },
});
