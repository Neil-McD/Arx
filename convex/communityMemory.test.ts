/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = 1_790_000_000_000;

// A community with an open channel, a pod (a restricted room), a member, and
// posts in each place, plus a private talk with the guide and a guide post.
async function world(t: any) {
  return await t.run(async (ctx: any) => {
    const ownerId = await ctx.db.insert("users", { authSubject: "owner", displayName: "Owner", createdAt: NOW, updatedAt: NOW });
    const memberId = await ctx.db.insert("users", { authSubject: "member", displayName: "Jon", createdAt: NOW, updatedAt: NOW });
    const communityId = await ctx.db.insert("communities", { ownerId, slug: "memory-club", name: "Memory club", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 2, createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityMemberships", { communityId, userId: memberId, role: "member", accessSource: "free_grant", state: "active", createdAt: NOW, updatedAt: NOW });
    const channel = (slug: string, accessMode: "all_members" | "restricted", position: number) => ctx.db.insert("communityChannels", {
      communityId, slug, name: slug, accessMode, postingPolicy: "members", status: "active", position, createdAt: NOW, updatedAt: NOW });
    const general = await channel("general", "all_members", 0);
    const pod = await channel("founders", "restricted", 1);
    const root = (extra: Record<string, unknown>) => ctx.db.insert("communityInteractionRoots", {
      communityId, actorType: "human", actorUserId: memberId, kind: "discussion", status: "live", visibilityScope: "community",
      contentSummary: "Refunds go through Stripe within 7 days.", replyCount: 0, reactionSummary: [], idempotencyKey: `k${Math.random()}`,
      createdAt: NOW, updatedAt: NOW, ...extra });
    const open = await root({ channelId: general });
    const podPost = await root({ channelId: pod });
    const privateTalk = await root({ visibilityScope: "private" });
    const guidePost = await root({ channelId: general, actorType: "community_agent", actorUserId: undefined, actorAgentKey: "guide" });
    const hidden = await root({ channelId: general, status: "hidden" });
    const reply = await ctx.db.insert("communityInteractionReplies", {
      communityId, channelId: general, rootId: open, seq: 1, actorType: "human", actorUserId: ownerId, status: "live",
      visibilityScope: "community", contentSummary: "Yes, and say so in the welcome.", reactionSummary: [], idempotencyKey: "r1",
      createdAt: NOW, updatedAt: NOW });
    const otherOwner = await ctx.db.insert("users", { authSubject: "other", displayName: "Other", createdAt: NOW, updatedAt: NOW });
    const other = await ctx.db.insert("communities", { ownerId: otherOwner, slug: "other", name: "Other", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 1, createdAt: NOW, updatedAt: NOW });
    const otherChannel = await ctx.db.insert("communityChannels", { communityId: other, slug: "general", name: "general",
      accessMode: "all_members", postingPolicy: "members", status: "active", position: 0, createdAt: NOW, updatedAt: NOW });
    const elsewhere = await ctx.db.insert("communityInteractionRoots", { communityId: other, channelId: otherChannel, actorType: "human",
      actorUserId: otherOwner, kind: "discussion", status: "live", visibilityScope: "community", contentSummary: "x", replyCount: 0,
      reactionSummary: [], idempotencyKey: "o1", createdAt: NOW, updatedAt: NOW });
    return { communityId, ownerId, memberId, open, podPost, privateTalk, guidePost, hidden, reply, elsewhere };
  });
}

async function run(t: any, communityId: any) {
  return await t.mutation(internal.communityMemory.openMemoryReviewRunInternal, { communityId, windowStart: NOW - 86_400_000, windowEnd: NOW, nowMs: NOW });
}

const observe = (t: any, communityId: any, runId: any, refs: string[], extra: Record<string, unknown> = {}) =>
  t.mutation(internal.communityMemory.observeCommunityMemoryInternal, {
    communityId, runId, title: "Refunds", body: "Refunds go through Stripe within 7 days.", evidenceRefs: refs, nowMs: NOW, ...extra });

test("only what a person said in an open channel can become community memory", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  const { runId } = await run(t, w.communityId);
  expect(await observe(t, w.communityId, runId, [`post:${w.podPost}`])).toEqual({ ok: false, code: "evidence_not_shared" });
  expect(await observe(t, w.communityId, runId, [`post:${w.privateTalk}`])).toEqual({ ok: false, code: "evidence_not_shared" });
  expect(await observe(t, w.communityId, runId, [`post:${w.guidePost}`])).toEqual({ ok: false, code: "evidence_not_by_a_person" });
  expect(await observe(t, w.communityId, runId, [`post:${w.hidden}`])).toEqual({ ok: false, code: "evidence_not_live" });
  expect(await observe(t, w.communityId, runId, [`post:${w.elsewhere}`])).toEqual({ ok: false, code: "evidence_other_community" });
  expect(await observe(t, w.communityId, runId, ["post:doesnotexist"])).toEqual({ ok: false, code: "evidence_missing" });
  expect(await observe(t, w.communityId, runId, [])).toEqual({ ok: false, code: "evidence_required" });
  expect(await observe(t, w.communityId, runId, ["https://example.com"])).toEqual({ ok: false, code: "evidence_invalid" });
  // One bad citation among good ones refuses the whole note.
  expect(await observe(t, w.communityId, runId, [`post:${w.open}`, `post:${w.podPost}`])).toEqual({ ok: false, code: "evidence_not_shared" });

  const written = await observe(t, w.communityId, runId, [`post:${w.open}`, `reply:${w.reply}`]);
  expect(written).toMatchObject({ ok: true, slug: "refunds", change: "added" });
  const note: any = await t.run((ctx: any) => ctx.db.query("communityNotes").first());
  expect(note).toMatchObject({ source: "learned", authorKind: "guide", evidenceRefs: [`post:${w.open}`, `reply:${w.reply}`], lastRunId: runId });
  const record: any = await t.run((ctx: any) => ctx.db.get(runId));
  expect(record.added).toEqual(["refunds"]);
  // Every refusal is kept on the review's record, with its reason.
  expect(record.refused.map((row: any) => row.reason)).toContain("evidence_not_shared");
  expect(record.refused).toHaveLength(9);
});

test("the guide never changes a builder's note, only its own", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  await t.run((ctx: any) => ctx.db.insert("communityNotes", { scopeKey: `community:${String(w.communityId)}`, communityId: w.communityId, slug: "refund-policy", title: "Refund policy",
    bodyMd: "Ask the owner.", source: "founder", searchText: "refund policy", createdAt: NOW, updatedAt: NOW }));
  const { runId } = await run(t, w.communityId);
  expect(await observe(t, w.communityId, runId, [`post:${w.open}`], { supersedes: "refund-policy" })).toEqual({ ok: false, code: "builder_note" });
  expect(await observe(t, w.communityId, runId, [`post:${w.open}`], { supersedes: "no-such-note" })).toEqual({ ok: false, code: "note_missing" });
  await observe(t, w.communityId, runId, [`post:${w.open}`]);
  const changed = await observe(t, w.communityId, runId, [`post:${w.open}`, `reply:${w.reply}`], { supersedes: "refunds", body: "Within 7 days, and say so in the welcome." });
  expect(changed).toMatchObject({ ok: true, slug: "refunds", change: "changed" });
  const builderNote: any = await t.run((ctx: any) => ctx.db.query("communityNotes").withIndex("by_scope_slug", (q: any) => q.eq("scopeKey", `community:${String(w.communityId)}`).eq("slug", "refund-policy")).first());
  expect(builderNote.bodyMd).toBe("Ask the owner.");
});

test("a review adds at most five notes, and a finished review writes nothing", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  const { runId } = await run(t, w.communityId);
  for (let i = 0; i < 5; i++) expect((await observe(t, w.communityId, runId, [`post:${w.open}`], { title: `Note ${i}` })).ok).toBe(true);
  expect(await observe(t, w.communityId, runId, [`post:${w.open}`], { title: "Note 6" })).toEqual({ ok: false, code: "run_note_limit" });
  expect(await t.mutation(internal.communityMemory.finishMemoryReviewRunInternal, { communityId: w.communityId, runId, nowMs: NOW })).toEqual({ status: "done" });
  expect(await observe(t, w.communityId, runId, [`post:${w.open}`], { title: "Late" })).toEqual({ ok: false, code: "run_not_open" });
  const second = await run(t, w.communityId);
  expect(await t.mutation(internal.communityMemory.finishMemoryReviewRunInternal, { communityId: w.communityId, runId: second.runId, nowMs: NOW })).toEqual({ status: "empty" });
});

test("memory.md stays short and links only to notes that exist", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  const { runId } = await run(t, w.communityId);
  await observe(t, w.communityId, runId, [`post:${w.open}`]);
  const write = (bodyMd: string) => t.mutation(internal.communityMemory.writeCommunityMemoryIndexInternal, { communityId: w.communityId, runId, bodyMd, nowMs: NOW });
  expect(await write("- Refunds: see memory/missing.md")).toEqual({ ok: false, code: "index_links_missing_note" });
  expect(await write("x".repeat(2_201))).toEqual({ ok: false, code: "index_too_long" });
  expect(await write("- Refunds go through Stripe within 7 days: memory/refunds.md")).toEqual({ ok: true });
  expect(await t.query(internal.communityMemory.readCommunityMemoryIndexInternal, { communityId: w.communityId })).toMatchObject({ bodyMd: "- Refunds go through Stripe within 7 days: memory/refunds.md" });
});

test("a builder undoes one note or a whole night, and removed posts don't bring a note back", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  const asOwner = t.withIdentity({ subject: "owner" });
  const asMember = t.withIdentity({ subject: "member" });

  const first = await run(t, w.communityId);
  await observe(t, w.communityId, first.runId, [`post:${w.open}`]);
  await t.mutation(internal.communityMemory.writeCommunityMemoryIndexInternal, { communityId: w.communityId, runId: first.runId, bodyMd: "- memory/refunds.md", nowMs: NOW });
  await t.mutation(internal.communityMemory.finishMemoryReviewRunInternal, { communityId: w.communityId, runId: first.runId, nowMs: NOW });

  // The next night changes the note and adds another.
  const second = await run(t, w.communityId);
  await observe(t, w.communityId, second.runId, [`post:${w.open}`, `reply:${w.reply}`], { supersedes: "refunds", body: "Changed." });
  await observe(t, w.communityId, second.runId, [`reply:${w.reply}`], { title: "Welcome", body: "Say it in the welcome." });
  await t.mutation(internal.communityMemory.writeCommunityMemoryIndexInternal, { communityId: w.communityId, runId: second.runId, bodyMd: "- memory/refunds.md\n- memory/welcome.md", nowMs: NOW });
  await t.mutation(internal.communityMemory.finishMemoryReviewRunInternal, { communityId: w.communityId, runId: second.runId, nowMs: NOW });

  await expect(asMember.mutation(api.communityMemory.undoMemoryRun, { communityId: w.communityId, runId: second.runId })).rejects.toThrow();
  expect(await asOwner.mutation(api.communityMemory.undoMemoryRun, { communityId: w.communityId, runId: second.runId })).toEqual({ undone: 3, kept: 0 });
  const notes: any = await t.run((ctx: any) => ctx.db.query("communityNotes").collect());
  expect(notes.map((note: any) => [note.slug, note.bodyMd])).toEqual([["refunds", "Refunds go through Stripe within 7 days."]]);
  expect((await t.query(internal.communityMemory.readCommunityMemoryIndexInternal, { communityId: w.communityId }))?.bodyMd).toBe("- memory/refunds.md");
  expect((await asOwner.query(api.communityMemory.listMemoryRuns, { communityId: w.communityId })).map((row: any) => row.status)).toEqual(["undone", "done"]);

  // Undo the remaining note: it goes, and the same post can't bring it back.
  expect(await asOwner.mutation(api.communityMemory.undoLearnedNote, { communityId: w.communityId, slug: "refunds" })).toEqual({ undone: "removed" });
  const third = await run(t, w.communityId);
  expect(await observe(t, w.communityId, third.runId, [`post:${w.open}`])).toEqual({ ok: false, code: "evidence_removed" });
  // New evidence can.
  expect((await observe(t, w.communityId, third.runId, [`post:${w.open}`, `reply:${w.reply}`])).ok).toBe(true);
});

test("a builder's correction makes a guide note theirs; deleting one remembers its posts", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  const asOwner = t.withIdentity({ subject: "owner" });
  const first = await run(t, w.communityId);
  await observe(t, w.communityId, first.runId, [`post:${w.open}`]);
  await observe(t, w.communityId, first.runId, [`reply:${w.reply}`], { title: "Welcome", body: "Say it in the welcome." });
  await asOwner.mutation(api.communityNotes.updateCommunityNote, { communityId: w.communityId, slug: "refunds", title: "Refunds", text: "Corrected by the owner." });
  const second = await run(t, w.communityId);
  expect(await observe(t, w.communityId, second.runId, [`post:${w.open}`], { supersedes: "refunds" })).toEqual({ ok: false, code: "builder_note" });
  await asOwner.mutation(api.communityNotes.deleteCommunityNote, { communityId: w.communityId, slug: "welcome" });
  expect(await observe(t, w.communityId, second.runId, [`reply:${w.reply}`], { title: "Welcome again" })).toEqual({ ok: false, code: "evidence_removed" });
  const listed = await asOwner.query(api.communityNotes.listCommunityNotes, { communityId: w.communityId });
  expect(listed.notes.map((note: any) => [note.slug, note.author_kind])).toEqual([["refunds", "builder"]]);
});

test("undoing an older review keeps what a later review wrote over it", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  const asOwner = t.withIdentity({ subject: "owner" });
  const first = await run(t, w.communityId);
  await observe(t, w.communityId, first.runId, [`post:${w.open}`]);
  await observe(t, w.communityId, first.runId, [`post:${w.open}`], { supersedes: "refunds", body: "B" });
  await observe(t, w.communityId, first.runId, [`post:${w.open}`], { supersedes: "refunds", body: "C" });
  await t.mutation(internal.communityMemory.writeCommunityMemoryIndexInternal, { communityId: w.communityId, runId: first.runId, bodyMd: "- memory/refunds.md", nowMs: NOW });
  await t.mutation(internal.communityMemory.finishMemoryReviewRunInternal, { communityId: w.communityId, runId: first.runId, nowMs: NOW });
  const second = await run(t, w.communityId);
  await observe(t, w.communityId, second.runId, [`post:${w.open}`, `reply:${w.reply}`], { supersedes: "refunds", body: "D, from the next night." });
  await t.mutation(internal.communityMemory.writeCommunityMemoryIndexInternal, { communityId: w.communityId, runId: second.runId, bodyMd: "- Refunds: memory/refunds.md", nowMs: NOW });
  await t.mutation(internal.communityMemory.finishMemoryReviewRunInternal, { communityId: w.communityId, runId: second.runId, nowMs: NOW });

  const result: any = await asOwner.mutation(api.communityMemory.undoMemoryRun, { communityId: w.communityId, runId: first.runId });
  expect(result.kept).toBe(4);
  const note: any = await t.run((ctx: any) => ctx.db.query("communityNotes").first());
  expect(note.bodyMd).toBe("D, from the next night.");
  expect((await t.query(internal.communityMemory.readCommunityMemoryIndexInternal, { communityId: w.communityId }))?.bodyMd).toBe("- Refunds: memory/refunds.md");

  // Undoing the later night first, then the earlier one, walks the note back
  // in order: to C, then through B and A to gone.
  await asOwner.mutation(api.communityMemory.undoMemoryRun, { communityId: w.communityId, runId: second.runId });
  expect(((await t.run((ctx: any) => ctx.db.query("communityNotes").first())) as any).bodyMd).toBe("C");
  expect((await t.query(internal.communityMemory.readCommunityMemoryIndexInternal, { communityId: w.communityId }))?.bodyMd).toBe("- memory/refunds.md");
  expect(await asOwner.mutation(api.communityMemory.undoMemoryRun, { communityId: w.communityId, runId: first.runId })).toEqual({ undone: 4, kept: 0 });
  expect(await t.run((ctx: any) => ctx.db.query("communityNotes").collect())).toEqual([]);
  expect(await t.query(internal.communityMemory.readCommunityMemoryIndexInternal, { communityId: w.communityId })).toBeNull();
});
