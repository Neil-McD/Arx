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
import { communityMembershipRowIsActive } from "./communityCore";
import { resolveAuthorizedCommunityChannel } from "./communityChannelCore";
import { executePolynetCanonicalTool } from "./polynetCanonicalExecutor";
import { GUIDE_ASK_ALWAYS_ALLOWABLE, type GuideAsk } from "../shared/operationCatalog";
import {
  GUIDE_QUESTION_ITEM_TEXT_MAX, GUIDE_QUESTION_ITEMS_SHOWN, GUIDE_QUESTION_TEXT_MAX, GUIDE_QUESTION_WAIT_MS,
  changeResultLine, messageResultLine, NOT_A_MEMBER_HERE, OWN_AI_WAITING_MAX, postResultLine, removeResultLine, type GuideAnswerResult, type GuideQuestionView,
} from "../shared/guideQuestions";
import { messagesConversationId } from "../shared/operationCatalog";
import { buildCommunityTabPath } from "../shared/webAppRouteState";

const internalRefs = internal as any;
const INPUT_MAX_CHARS = 60_000;

// Questions still waiting and still in date (asked within GUIDE_QUESTION_WAIT_MS):
// bounded in the index, so ones that expired unanswered never crowd out the rest.
function waitingRows(ctx: any, communityId: any, userId: any) {
  const since = Date.now() - GUIDE_QUESTION_WAIT_MS;
  return ctx.db.query("communityGuideQuestions")
    .withIndex("by_community_user_status_createdAt", (q: any) => q.eq("communityId", communityId).eq("userId", userId).eq("status", "waiting").gt("createdAt", since))
    .order("asc").take(20);
}

async function view(ctx: any, row: any): Promise<GuideQuestionView> {
  const shown: GuideQuestionView = { id: String(row._id), kind: row.kind, question: row.question, text: row.text ?? null, items: row.items ?? [],
    canAlways: !row.ownAiApp && GUIDE_ASK_ALWAYS_ALLOWABLE[row.kind as GuideAsk] === true,
    ...(row.ownAiApp ? { askedBy: String(row.ownAiApp) } : {}) };
  if (!row.pictures?.length) return shown;
  // Drawn from the person's own talk files, as the talk draws them; a
  // picture whose message they deleted since has no address.
  const pictures = await Promise.all(row.pictures.map(async (picture: { id: any; name: string }) => {
    const file: any = await ctx.db.get(picture.id);
    const url = file && String(file.ownerId) === String(row.userId) ? await ctx.storage.getUrl(file.storageId) : null;
    return { id: String(picture.id), name: picture.name, url: url ?? null };
  }));
  return { ...shown, pictures };
}

// ---- the executor's side

export const isAlwaysAllowedInternal = internalQuery({
  args: { communityId: v.id("communities"), userId: v.id("users"), kind: v.union(v.literal("post"), v.literal("message")) },
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

// Each person's name and the role they hold now, for a question about their
// role or about removing or banning them. Someone who was removed or left is
// not a member here.
export const describeMembersInternal = internalQuery({
  args: { communityId: v.id("communities"), userIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    const people: Array<{ who: string; text: string }> = [];
    for (const raw of args.userIds.slice(0, GUIDE_QUESTION_ITEMS_SHOWN)) {
      const userId = ctx.db.normalizeId("users", raw);
      const user: any = userId ? await ctx.db.get(userId) : null;
      const membership = userId ? (await ctx.db.query("communityMemberships")
        .withIndex("by_community_user", (q) => q.eq("communityId", args.communityId).eq("userId", userId)).collect())
        .find((row: any) => communityMembershipRowIsActive(row)) : null;
      const owner = String(community?.ownerId) === String(userId);
      if (!user || (!membership && !owner)) { people.push({ who: "Someone", text: NOT_A_MEMBER_HERE }); continue; }
      const now = owner ? "owner" : membership!.role;
      people.push({ who: String(user.displayName ?? user.handle ?? "A member"), text: `Now: ${now}` });
    }
    return people;
  },
});

// The call without its retry key. The guide's key is made per tool call
// (shared/actionTools.ts, guideActionKey), so the same words asked twice in
// one turn differ only there; they are still the same question.
function keyOf(inputJson: string): string | null {
  try {
    const parsed = JSON.parse(inputJson);
    const key = parsed.idempotency_key ?? parsed.idempotencyKey;
    return typeof key === "string" && key ? key : null;
  } catch {
    return null;
  }
}

function withoutKey(inputJson: string): string {
  try {
    const { idempotency_key: _key, idempotencyKey: _camel, ...rest } = JSON.parse(inputJson);
    return JSON.stringify(rest);
  } catch {
    return inputJson;
  }
}

// Saves the question. A question still waiting from an earlier turn is
// dropped: the person moved on, so nothing from it is done. The saved call
// keeps its key, so a yes runs it under that one key, once.
export const askInternal = internalMutation({
  args: {
    communityId: v.id("communities"), userId: v.id("users"),
    kind: v.union(v.literal("post"), v.literal("remove"), v.literal("change"), v.literal("message")),
    toolName: v.string(), inputJson: v.string(), question: v.string(), place: v.optional(v.string()), text: v.optional(v.string()),
    items: v.optional(v.array(v.object({ who: v.string(), text: v.string() }))), runId: v.optional(v.string()),
    pictures: v.optional(v.array(v.object({ id: v.id("cloudThreadAttachments"), name: v.string() }))),
    ownAiApp: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.inputJson.length > INPUT_MAX_CHARS || (args.text ?? "").length > GUIDE_QUESTION_TEXT_MAX) return { ok: false as const, reason: "too_long" as const };
    const nowMs = Date.now();
    if (args.ownAiApp) return await askForOwnAi(ctx, args, nowMs);
    for (const row of await waitingRows(ctx, args.communityId, args.userId)) {
      // A person's own AI's request is its own: the guide moving on drops nothing of it.
      if (row.ownAiApp) continue;
      // The same call asked again in the same turn is the same question.
      if (row.runId === args.runId && withoutKey(row.inputJson) === withoutKey(args.inputJson)) return { ok: true as const, questionId: String(row._id) };
      if (!args.runId || row.runId !== args.runId) await ctx.db.patch(row._id, { status: "declined", answeredAt: nowMs, dropped: true });
    }
    const questionId = await ctx.db.insert("communityGuideQuestions", {
      communityId: args.communityId, userId: args.userId, kind: args.kind, toolName: args.toolName, inputJson: args.inputJson,
      question: args.question.slice(0, 300),
      ...(args.place ? { place: args.place.slice(0, 120) } : {}),
      ...(args.text ? { text: args.text } : {}),
      ...(args.items ? { items: args.items } : {}),
      ...(args.pictures?.length ? { pictures: args.pictures } : {}),
      status: "waiting", ...(args.runId ? { runId: args.runId } : {}), createdAt: nowMs,
    });
    return { ok: true as const, questionId: String(questionId) };
  },
});

// A person's own AI asks. Each request stands alone (there is no turn to
// move on from). While one waits, the same request again is that same card,
// whatever key the AI gave it this time (and the AI is told the card's key).
// Once answered, the very same call (same key) is told what happened, so it
// never runs twice; a new key is a new request, put to the person again (it
// may be asked for again on purpose: banned, unbanned, banned again). At most
// OWN_AI_WAITING_MAX wait at once.
const ANSWER_STATUSES = ["waiting", "running", "done", "declined", "failed"] as const;
// A Yes still running after this long didn't finish (the run stopped): it is
// marked failed, so the AI isn't told "waiting" for ever.
const OWN_AI_RUNNING_STALE_MS = 10 * 60 * 1000;

async function ownAiMatch(ctx: any, args: { communityId: any; userId: any; toolName: string; inputJson: string }, nowMs: number, statuses: readonly string[]) {
  const since = nowMs - GUIDE_QUESTION_WAIT_MS;
  const bare = withoutKey(args.inputJson);
  for (const status of statuses) {
    const rows = await ctx.db.query("communityGuideQuestions")
      .withIndex("by_community_user_status_createdAt", (q: any) => q.eq("communityId", args.communityId).eq("userId", args.userId).eq("status", status).gt("createdAt", since))
      .order("desc").take(50);
    const exactOnly = status !== "waiting" && status !== "running";
    const same = rows.find((row: any) => row.ownAiApp && row.toolName === args.toolName &&
      (exactOnly ? row.inputJson === args.inputJson : withoutKey(row.inputJson) === bare));
    if (same) return { status, row: same };
  }
  return null;
}

async function askForOwnAi(ctx: any, args: any, nowMs: number) {
  const since = nowMs - GUIDE_QUESTION_WAIT_MS;
  let found = await ownAiMatch(ctx, args, nowMs, ANSWER_STATUSES);
  if (found?.status === "running" && Number(found.row.answeredAt ?? found.row.createdAt) < nowMs - OWN_AI_RUNNING_STALE_MS) {
    await ctx.db.patch(found.row._id, { status: "failed", resultLine: "It didn't finish. Nothing more will be done unless it is asked again." });
    found = await ownAiMatch(ctx, args, nowMs, ANSWER_STATUSES);
  }
  if (found) {
    if (found.status === "waiting" || found.status === "running") {
      return { ok: true as const, questionId: String(found.row._id), settled: null, key: keyOf(found.row.inputJson) };
    }
    return { ok: true as const, questionId: String(found.row._id), settled: { status: found.status, line: found.row.resultLine ?? "" } };
  }
  const waiting = (await waitingRows(ctx, args.communityId, args.userId)).filter((row: any) => row.ownAiApp && row.createdAt > since);
  if (waiting.length >= OWN_AI_WAITING_MAX) return { ok: false as const, reason: "too_many_waiting" as const };
  const questionId = await ctx.db.insert("communityGuideQuestions", {
    communityId: args.communityId, userId: args.userId, kind: args.kind, toolName: args.toolName, inputJson: args.inputJson,
    question: args.question.slice(0, 300),
    ...(args.place ? { place: args.place.slice(0, 120) } : {}),
    ...(args.text ? { text: args.text } : {}),
    ...(args.items ? { items: args.items } : {}),
    status: "waiting", ownAiApp: String(args.ownAiApp).slice(0, 60), createdAt: nowMs,
  });
  return { ok: true as const, questionId: String(questionId), settled: null };
}

// What happened to an own AI's request already answered (the same rules):
// asked again, the AI is told this before anything else is checked, since a
// person removed or banned is no longer a member to name.
export const ownAiOutcomeInternal = internalQuery({
  args: { communityId: v.id("communities"), userId: v.id("users"), toolName: v.string(), inputJson: v.string() },
  handler: async (ctx, args) => {
    const found = await ownAiMatch(ctx, args, Date.now(), ["done", "declined", "failed"]);
    return found ? { status: found.status, line: found.row.resultLine ?? "" } : null;
  },
});

// ---- the person's side

export const listGuideQuestions = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args): Promise<GuideQuestionView[]> => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    const since = Date.now() - GUIDE_QUESTION_WAIT_MS;
    return await Promise.all((await waitingRows(ctx, args.communityId, userId)).filter((row: any) => row.createdAt > since).map((row: any) => view(ctx, row)));
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
    // "Always allow" is kept only for what may be always allowed (posts and
    // message replies), and never for a question an outside AI asked.
    if (args.answer === "always" && !row.ownAiApp && (row.kind === "post" || row.kind === "message")) {
      const kind = row.kind as "post" | "message";
      const has = await ctx.db.query("communityGuideAlwaysAllowed")
        .withIndex("by_community_user_kind", (q) => q.eq("communityId", row.communityId).eq("userId", userId).eq("kind", kind)).first();
      if (!has) await ctx.db.insert("communityGuideAlwaysAllowed", { communityId: row.communityId, userId, kind, createdAt: nowMs });
    }
    await ctx.db.patch(row._id, { status: "running", answeredAt: nowMs });
    const user: any = await ctx.db.get(userId);
    const community: any = await ctx.db.get(row.communityId);
    return { run: true as const, userId: String(userId), authSubject: String(user?.authSubject ?? ""), communitySlug: String(community?.slug ?? ""),
      toolName: row.toolName, inputJson: row.inputJson, kind: row.kind, place: row.place ?? null, ownAiApp: row.ownAiApp ?? null,
      pictures: (row.pictures ?? []).map((picture: any) => String(picture.id)) };
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
      // Run as whoever asked: the guide, or the person's own AI (so it is
      // marked, counted and replayed as that AI's, under the key it gave).
      const execution = await executePolynetCanonicalTool({
        ctx, authSubject: claimed.authSubject, userId: claimed.userId,
        ...(claimed.ownAiApp
          ? { principalKind: "external_mcp" as const, evidenceSurface: "external_mcp" as const, ownAiApp: claimed.ownAiApp }
          : { principalKind: "community_agent_for_member" as const, mountedCommunityId: String(args.communityId), evidenceSurface: "member_agent_dock" as const }),
        toolName: claimed.toolName, input,
        personSaidYes: true,
        // The pictures the person was shown, never chosen again.
        ...(claimed.pictures.length ? { approvedPictures: claimed.pictures } : {}),
      });
      // Changing, removing or banning members: done for each person on its own.
      const members = String(input.operation ?? "").startsWith("community.members.");
      if (!execution.ok) result = { status: "failed", line: execution.message, path: null };
      else if (claimed.kind === "change" || (claimed.kind === "remove" && (members || String(input.operation ?? "") === "community.course.delete"))) {
        const outcome = (execution.value as any)?.result ?? {};
        const asked = Number(outcome.succeeded ?? 0) + Number(outcome.failed ?? 0);
        const failedAll = members && Number(outcome.succeeded ?? 0) === 0;
        result = { status: failedAll ? "failed" : "done", path: null,
          line: failedAll && outcome.results?.[0]?.message ? String(outcome.results[0].message)
            : changeResultLine({ operation: String(input.operation), succeeded: Number(outcome.succeeded ?? 0), asked }) };
      } else if (claimed.kind === "remove" && claimed.toolName === "polynet_call" && String(input.operation ?? "") === "community.interaction.remove") {
        const outcome = (execution.value as any)?.result ?? {};
        const asked = Number(outcome.succeeded ?? 0) + Number(outcome.failed ?? 0);
        const removed = Number(outcome.succeeded ?? 0);
        result = { status: removed > 0 ? "done" : "failed", line: removeResultLine({ removed, asked }), path: null };
      } else if (claimed.kind === "message") {
        const conversation = messagesConversationId(input.path);
        const inbox = buildCommunityTabPath(claimed.communitySlug, "inbox");
        result = { status: "done", line: messageResultLine(claimed.place ?? "them"),
          path: inbox && conversation ? `${inbox}/${encodeURIComponent(conversation)}` : inbox };
      } else {
        const slug = channelSlugOf(input.path);
        const mode = String(input.mode ?? "create");
        // Nothing to open once a post is deleted.
        result = { status: "done", line: postResultLine({ mode, channelName: claimed.place ?? slug ?? "the channel" }),
          path: mode === "delete" ? null : buildCommunityTabPath(claimed.communitySlug, "chat", null, null, slug) };
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
    const rows = await ctx.db.query("communityGuideAlwaysAllowed")
      .withIndex("by_community_user_kind", (q) => q.eq("communityId", args.communityId).eq("userId", userId)).take(10);
    return { post: rows.some((row) => row.kind === "post"), message: rows.some((row) => row.kind === "message") };
  },
});

export const setGuideAlwaysAllowed = mutation({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), kind: v.union(v.literal("post"), v.literal("message")), on: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    const rows = await ctx.db.query("communityGuideAlwaysAllowed")
      .withIndex("by_community_user_kind", (q) => q.eq("communityId", args.communityId).eq("userId", userId).eq("kind", args.kind)).take(5);
    if (args.on && rows.length === 0) await ctx.db.insert("communityGuideAlwaysAllowed", { communityId: args.communityId, userId, kind: args.kind, createdAt: Date.now() });
    if (!args.on) for (const row of rows) await ctx.db.delete(row._id);
    return { [args.kind]: args.on };
  },
});
