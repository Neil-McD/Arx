/// <reference types="vite/client" />
// The guide drafts a reply to a question nobody answered
// (convex/communityReplyDrafts.ts): due a day after a post, one model request
// from the lessons that share the question's words, and nothing in the
// thread until the host posts it.
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { markReplyDraftDue } from "./communityReplyDrafts";
import { parseReplyDraftCall, pickLessonsFor, replyDraftPost, replyDraftWaited, REPLY_DRAFT_MAX_CHARS } from "../shared/communityReplyDrafts";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.UTC(2026, 10, 18, 15, 0, 0);
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

async function world(t: any) {
  return await t.run(async (ctx: any) => {
    const ownerId = await ctx.db.insert("users", { authSubject: "owner", displayName: "Owner", createdAt: NOW, updatedAt: NOW });
    const mayaId = await ctx.db.insert("users", { authSubject: "maya", displayName: "Maya", createdAt: NOW, updatedAt: NOW });
    const communityId = await ctx.db.insert("communities", { ownerId, slug: "draft-club", name: "Draft club", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 2, createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityMemberships", { communityId, userId: mayaId, role: "member", accessSource: "free_grant", state: "active", createdAt: NOW, updatedAt: NOW });
    // Funded: the owner is the platform operator.
    await ctx.db.insert("operatorRoles", { userId: ownerId, role: "owner", active: true, createdAt: NOW, updatedAt: NOW });
    const general = await ctx.db.insert("communityChannels", { communityId, systemRole: "general", slug: "general", name: "General",
      accessMode: "all_members", postingPolicy: "members", status: "active", position: 0, createdByUserId: ownerId, createdAt: NOW, updatedAt: NOW } as any);
    const pod = await ctx.db.insert("communityChannels", { communityId, slug: "founders", name: "founders", accessMode: "restricted",
      postingPolicy: "members", status: "active", position: 1, createdByUserId: ownerId, createdAt: NOW, updatedAt: NOW } as any);
    const course = await ctx.db.insert("communityResourceModules", { communityId, createdByUserId: ownerId, status: "live", name: "Start Here", sortOrder: 1, createdAt: NOW, updatedAt: NOW });
    const draftCourse = await ctx.db.insert("communityResourceModules", { communityId, createdByUserId: ownerId, status: "draft", name: "Not ready", sortOrder: 2, createdAt: NOW, updatedAt: NOW });
    const lesson = (moduleId: any, title: string, bodyMd: string, sortOrder: number) => ctx.db.insert("communityResources", {
      communityId, createdByUserId: ownerId, moduleId, type: "post", role: "page", status: "draft", title, bodyMd, pinned: false, sortOrder, createdAt: NOW, updatedAt: NOW });
    const pricing = await lesson(course, "Pricing your offer", "Price a first client on the hours you save them, not on your own hours. Most people start between $500 and $1,500 a month.", 1);
    await lesson(course, "Your first workflow", "Pick one task you repeat every week and automate it.", 2);
    await lesson(draftCourse, "Secret pricing notes", "DRAFT ONLY: price a client at ten thousand.", 1);
    return { ownerId, mayaId, communityId, general, pod, pricing };
  });
}

const ask = (t: any, w: any, extra: Record<string, unknown> = {}) => t.run((ctx: any) => ctx.db.insert("communityInteractionRoots", {
  communityId: w.communityId, channelId: w.general, actorType: "human", actorUserId: w.mayaId, kind: "discussion", status: "live",
  visibilityScope: "community", contentSummary: "How do I price a first client? I keep guessing.", replyCount: 0, reactionSummary: [],
  idempotencyKey: `k${Math.random()}`, createdAt: NOW - 25 * HOUR, updatedAt: NOW - 25 * HOUR, ...extra }));
const work = (t: any, communityId: any) => t.run((ctx: any) => ctx.db.query("agentWork")
  .withIndex("by_scope_kind", (q: any) => q.eq("scopeKey", `community:${String(communityId)}`).eq("kind", "reply_draft")).first());
const drafts = (t: any) => t.run((ctx: any) => ctx.db.query("communityReplyDrafts").collect());

function stubProvider() {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS", "1000000");
  vi.stubEnv("POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS", "2000000");
  vi.stubEnv("POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS", "1000000");
}
const usage = { input_tokens: 1500, output_tokens: 120, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } };
const writeCall = (id: string, input: Record<string, unknown>) => ({ id, model: "gpt-6-luna", service_tier: "default", usage,
  output: [{ type: "function_call", call_id: id, name: "polynet_call", arguments: JSON.stringify({ operation: "reply.draft", input }) }] });
function fakeModel(replies: any[]) {
  const bodies: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: any, options: any) => {
    bodies.push(JSON.parse(options.body));
    return new Response(JSON.stringify(replies[Math.min(bodies.length - 1, replies.length - 1)]), { status: 200 });
  }));
  return bodies;
}
// Runs the community's draft work now.
async function run(t: any, w: any) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  const { workId } = await t.mutation(internal.communityReplyDrafts.requestReplyDraftNowInternal, { communityId: w.communityId });
  return await t.action(internal.communityReplyDrafts.runReplyDraftInternal, { workId });
}

test("a person's post in an open channel makes the look due a day later; a pod's or the guide's doesn't", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  await t.run((ctx: any) => markReplyDraftDue(ctx, { communityId: w.communityId, channelId: w.pod, actorType: "human", nowMs: NOW }));
  await t.run((ctx: any) => markReplyDraftDue(ctx, { communityId: w.communityId, channelId: w.general, actorType: "community_agent", nowMs: NOW }));
  expect(await work(t, w.communityId)).toBeNull();
  await t.run((ctx: any) => markReplyDraftDue(ctx, { communityId: w.communityId, channelId: w.general, actorType: "human", nowMs: NOW }));
  await t.run((ctx: any) => markReplyDraftDue(ctx, { communityId: w.communityId, channelId: w.general, actorType: "human", nowMs: NOW + 5_000 }));
  expect(await work(t, w.communityId)).toMatchObject({ kind: "reply_draft", pending: 1, dueAt: NOW + DAY });
});

test("one request: the guide reads the question and the lessons members can see, and its draft waits for the host", async () => {
  stubProvider();
  const t = convexTest(schema, modules);
  const w = await world(t);
  const rootId = await ask(t, w);
  const bodies = fakeModel([writeCall("c1", { text: "Maya, the Pricing your offer lesson covers this: price on the hours you save them.", source: `lesson:${String(w.pricing)}` })]);
  expect(await run(t, w)).toMatchObject({ status: "drafted" });
  expect(bodies).toHaveLength(1);
  const shown = JSON.stringify(bodies[0]);
  expect(shown).toContain("How do I price a first client?");
  expect(shown).toContain("Start Here \u00b7 Lesson 1: Pricing your offer");
  // A lesson in a course members can't see is never shown to the guide.
  expect(shown).not.toContain("DRAFT ONLY");
  expect(await drafts(t)).toMatchObject([{ status: "waiting", rootId, sourceLabel: "Start Here · Lesson 1: Pricing your offer" }]);
  // Nothing is in the thread yet.
  expect(await t.run((ctx: any) => ctx.db.query("communityInteractionReplies").collect())).toHaveLength(0);

  // Only the owner sees it.
  await expect(t.withIdentity({ subject: "maya" }).query(api.communityReplyDrafts.listReplyDrafts, { communityId: w.communityId })).rejects.toThrow();
  const asOwner = t.withIdentity({ subject: "owner" });
  const [view] = await asOwner.query(api.communityReplyDrafts.listReplyDrafts, { communityId: w.communityId });
  expect(view).toMatchObject({ author: "Maya", channel: "General", hours_waiting: 25, source: "Start Here · Lesson 1: Pricing your offer" });

  // The host edits and posts: it goes in the thread as the guide, with the lesson.
  await asOwner.mutation(api.communityReplyDrafts.postReplyDraft, { communityId: w.communityId, draftId: view.id as any, text: "Maya, price on the hours you save them." });
  const replies: any[] = await t.run((ctx: any) => ctx.db.query("communityInteractionReplies").collect());
  expect(replies).toHaveLength(1);
  expect(replies[0]).toMatchObject({ actorType: "community_agent", rootId, status: "live" });
  expect(replies[0].actorUserId).toBeUndefined();
  expect(replies[0].contentSummary).toContain("Maya, price on the hours you save them.");
  expect(replies[0].contentSummary).toContain("From Start Here · Lesson 1: Pricing your offer");
  expect(await drafts(t)).toMatchObject([{ status: "posted" }]);
  expect(await asOwner.query(api.communityReplyDrafts.listReplyDrafts, { communityId: w.communityId })).toEqual([]);
  // Posting again does nothing more.
  await asOwner.mutation(api.communityReplyDrafts.postReplyDraft, { communityId: w.communityId, draftId: view.id as any });
  expect(await t.run((ctx: any) => ctx.db.query("communityInteractionReplies").collect())).toHaveLength(1);
});

test("no lesson shares the question's words: no request is made, and the question isn't looked at again", async () => {
  stubProvider();
  const t = convexTest(schema, modules);
  const w = await world(t);
  await ask(t, w, { contentSummary: "Which microphone do podcasters like?" });
  const bodies = fakeModel([writeCall("c1", { nothing: true })]);
  expect(await run(t, w)).toMatchObject({ status: "empty" });
  expect(bodies).toHaveLength(0);
  expect(await drafts(t)).toMatchObject([{ status: "no_source" }]);
  expect(await run(t, w)).toMatchObject({ status: "empty" });
  expect(await drafts(t)).toHaveLength(1);
});

test("the guide may say no lesson answers it; a reply that is too long, has a link or names a lesson it wasn't shown is refused", async () => {
  stubProvider();
  const t = convexTest(schema, modules);
  const w = await world(t);
  await ask(t, w);
  fakeModel([writeCall("c1", { nothing: true })]);
  expect(await run(t, w)).toMatchObject({ status: "drafted" });
  expect(await drafts(t)).toMatchObject([{ status: "no_source" }]);

  const shown = new Set(["lesson:a"]);
  const call = (input: Record<string, unknown>) => parseReplyDraftCall({ operation: "reply.draft", input }, shown);
  expect(call({ text: "Fine.", source: "lesson:a" })).toEqual({ text: "Fine.", source: "lesson:a" });
  expect(call({ nothing: true })).toEqual({ nothing: true });
  expect(call({ text: "x".repeat(REPLY_DRAFT_MAX_CHARS + 1), source: "lesson:a" })).toMatchObject({ error: "reply_too_long" });
  expect(call({ text: "See https://example.com", source: "lesson:a" })).toMatchObject({ error: "reply_has_link" });
  expect(call({ text: "Hi @everyone", source: "lesson:a" })).toMatchObject({ error: "reply_mentions_everyone" });
  expect(call({ text: "Fine.", source: "lesson:b" })).toMatchObject({ error: "source_not_shown" });
  expect(parseReplyDraftCall({ operation: "brief.write", input: {} }, shown)).toMatchObject({ error: "operation_not_found" });
});

test("a question under a day old, answered, or over a week old gets no draft; three drafts in a day is the limit", async () => {
  stubProvider();
  const t = convexTest(schema, modules);
  const w = await world(t);
  await ask(t, w, { createdAt: NOW - 2 * HOUR });
  await ask(t, w, { replyCount: 1 });
  await ask(t, w, { createdAt: NOW - 8 * DAY });
  await ask(t, w, { channelId: w.pod });
  const bodies = fakeModel([writeCall("c1", { text: "Price on hours saved.", source: `lesson:${String(w.pricing)}` })]);
  expect(await run(t, w)).toMatchObject({ status: "empty" });
  expect(bodies).toHaveLength(0);
  // It looks again when the two-hour-old question is a day old.
  expect((await work(t, w.communityId)).dueAt).toBe(NOW + 22 * HOUR);

  // Three already drafted today: a fourth question waits for tomorrow's allowance.
  await ask(t, w);
  await t.run(async (ctx: any) => {
    for (const hoursAgo of [20, 10, 5]) {
      const rootId = await ctx.db.insert("communityInteractionRoots", { communityId: w.communityId, channelId: w.general, actorType: "human", actorUserId: w.mayaId,
        kind: "discussion", status: "live", visibilityScope: "community", contentSummary: "Old?", replyCount: 1, reactionSummary: [], idempotencyKey: `o${hoursAgo}`,
        createdAt: NOW - 3 * DAY, updatedAt: NOW });
      await ctx.db.insert("communityReplyDrafts", { communityId: w.communityId, rootId, channelId: w.general, status: "waiting", text: "x",
        createdAt: NOW - hoursAgo * HOUR, updatedAt: NOW });
    }
  });
  expect(await run(t, w)).toMatchObject({ status: "empty" });
  expect(bodies).toHaveLength(0);
  expect((await work(t, w.communityId)).dueAt).toBe(NOW + 4 * HOUR);
});

test("Skip drops a draft for good; a draft whose question someone answered is no longer offered or postable", async () => {
  stubProvider();
  const t = convexTest(schema, modules);
  const w = await world(t);
  const rootId = await ask(t, w);
  fakeModel([writeCall("c1", { text: "Price on hours saved.", source: `lesson:${String(w.pricing)}` })]);
  await run(t, w);
  const asOwner = t.withIdentity({ subject: "owner" });
  const [view] = await asOwner.query(api.communityReplyDrafts.listReplyDrafts, { communityId: w.communityId });
  // Someone answers first.
  await t.run((ctx: any) => ctx.db.patch(rootId, { replyCount: 1 }));
  expect(await asOwner.query(api.communityReplyDrafts.listReplyDrafts, { communityId: w.communityId })).toEqual([]);
  await expect(asOwner.mutation(api.communityReplyDrafts.postReplyDraft, { communityId: w.communityId, draftId: view.id as any }))
    .rejects.toThrow("community_reply_draft_no_longer_needed");
  await t.run((ctx: any) => ctx.db.patch(rootId, { replyCount: 0 }));
  await expect(t.withIdentity({ subject: "maya" }).mutation(api.communityReplyDrafts.skipReplyDraft, { communityId: w.communityId, draftId: view.id as any })).rejects.toThrow();
  await asOwner.mutation(api.communityReplyDrafts.skipReplyDraft, { communityId: w.communityId, draftId: view.id as any });
  expect(await drafts(t)).toMatchObject([{ status: "skipped" }]);
  expect(await asOwner.query(api.communityReplyDrafts.listReplyDrafts, { communityId: w.communityId })).toEqual([]);
  // The question is never drafted for again.
  expect(await run(t, w)).toMatchObject({ status: "empty" });
});

test("a draft whose lesson members can no longer read is withdrawn", async () => {
  stubProvider();
  const t = convexTest(schema, modules);
  const w = await world(t);
  await ask(t, w);
  fakeModel([writeCall("c1", { text: "Price on hours saved.", source: `lesson:${String(w.pricing)}` })]);
  await run(t, w);
  const asOwner = t.withIdentity({ subject: "owner" });
  const [view] = await asOwner.query(api.communityReplyDrafts.listReplyDrafts, { communityId: w.communityId });
  expect(view).toBeTruthy();
  // The course goes back to draft.
  const lesson: any = await t.run((ctx: any) => ctx.db.get(w.pricing));
  await t.run((ctx: any) => ctx.db.patch(lesson.moduleId, { status: "draft" }));
  expect(await asOwner.query(api.communityReplyDrafts.listReplyDrafts, { communityId: w.communityId })).toEqual([]);
  await expect(asOwner.mutation(api.communityReplyDrafts.postReplyDraft, { communityId: w.communityId, draftId: view.id as any }))
    .rejects.toThrow("community_reply_draft_no_longer_needed");
  expect(await t.run((ctx: any) => ctx.db.query("communityInteractionReplies").collect())).toHaveLength(0);
});

test("an older question isn't hidden by a busy day, and questions no lesson answers don't use up the day's three", async () => {
  stubProvider();
  const t = convexTest(schema, modules);
  const w = await world(t);
  await ask(t, w);
  await t.run(async (ctx: any) => {
    // A hundred newer posts that aren't questions.
    for (let i = 0; i < 100; i++) {
      await ctx.db.insert("communityInteractionRoots", { communityId: w.communityId, channelId: w.general, actorType: "human", actorUserId: w.mayaId,
        kind: "discussion", status: "live", visibilityScope: "community", contentSummary: `Ran ${i} km today.`, replyCount: 0, reactionSummary: [],
        idempotencyKey: `busy${i}`, createdAt: NOW - HOUR - i, updatedAt: NOW });
    }
    // Sixty questions today that no lesson could answer.
    for (let i = 0; i < 60; i++) {
      const rootId = await ctx.db.insert("communityInteractionRoots", { communityId: w.communityId, channelId: w.general, actorType: "human", actorUserId: w.mayaId,
        kind: "discussion", status: "live", visibilityScope: "community", contentSummary: "Mic?", replyCount: 1, reactionSummary: [], idempotencyKey: `ns${i}`,
        createdAt: NOW - 3 * DAY, updatedAt: NOW });
      await ctx.db.insert("communityReplyDrafts", { communityId: w.communityId, rootId, channelId: w.general, status: "no_source", createdAt: NOW - HOUR, updatedAt: NOW });
    }
  });
  const bodies = fakeModel([writeCall("c1", { text: "Price on hours saved.", source: `lesson:${String(w.pricing)}` })]);
  expect(await run(t, w)).toMatchObject({ status: "drafted" });
  expect(bodies).toHaveLength(1);
  expect((await drafts(t)).filter((row: any) => row.status === "waiting")).toHaveLength(1);
});

test("lessons are picked by the question's words, the title counting double; the post names its lesson", () => {
  const lessons = [
    { title: "Your first workflow", text: "Pick one task and automate it." },
    { title: "Pricing your offer", text: "Charge for hours saved." },
    { title: "Finding a client", text: "Your first client comes from who you know. Price comes later." },
  ];
  expect(pickLessonsFor("How do I price a first client?", lessons).map((lesson) => lesson.title)).toEqual(["Finding a client", "Your first workflow"]);
  expect(pickLessonsFor("pricing?", lessons).map((lesson) => lesson.title)).toEqual(["Pricing your offer"]);
  expect(pickLessonsFor("Which microphone?", lessons)).toEqual([]);
  expect(pickLessonsFor("how do I?", lessons)).toEqual([]);
  expect(replyDraftPost("  Hello.  ", "Start Here · Lesson 1: Pricing")).toBe("Hello.\n\nFrom Start Here · Lesson 1: Pricing");
  expect(replyDraftPost("Hello.", "")).toBe("Hello.");
  expect(replyDraftWaited(26)).toBe("26 hours");
  expect(replyDraftWaited(50)).toBe("2 days");
});
