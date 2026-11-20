/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { MEMORY_REFUSAL_WORDS, memoryIndexRefusal, parseMemoryAbout, parseMemoryApplyCall } from "../shared/communityMemory";
import { brainFact, latestLearned } from "../shared/communityBrain";
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

test("re-submitting a guide note with the same title updates in place instead of creating a duplicate", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  const { runId } = await run(t, w.communityId);
  expect(await observe(t, w.communityId, runId, [`post:${w.open}`], { title: "Home request reminder", body: "Original body." }))
    .toMatchObject({ ok: true, slug: "home-request-reminder", change: "added" });
  // Retrying the exact same note in the same review is an idempotent no-op.
  expect(await observe(t, w.communityId, runId, [`post:${w.open}`], { title: "  home request reminder  ", body: "Original body." }))
    .toMatchObject({ ok: true, slug: "home-request-reminder", change: "changed" });
  // Re-submitting with updated text updates the same note rather than cloning -2.
  expect(await observe(t, w.communityId, runId, [`post:${w.open}`, `reply:${w.reply}`], { title: "Home request reminder", body: "Updated body." }))
    .toMatchObject({ ok: true, slug: "home-request-reminder", change: "changed" });
  const notes: any[] = await t.run((ctx: any) => ctx.db.query("communityNotes").collect());
  expect(notes).toHaveLength(1);
  expect(notes[0]).toMatchObject({ slug: "home-request-reminder", bodyMd: "Updated body." });
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

test("a builder sees what a guide note was learned from; a removed post shows as gone; members can't look", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  const asOwner = t.withIdentity({ subject: "owner" });
  const asMember = t.withIdentity({ subject: "member" });
  const night = await run(t, w.communityId);
  await observe(t, w.communityId, night.runId, [`post:${w.open}`, `reply:${w.reply}`]);
  await t.mutation(internal.communityMemory.finishMemoryReviewRunInternal, { communityId: w.communityId, runId: night.runId, nowMs: NOW });

  const seen: any = await asOwner.query(api.communityMemory.listNoteSources, { communityId: w.communityId, slug: "refunds" });
  expect(seen.sources).toEqual([
    expect.objectContaining({ ref: `post:${w.open}`, available: true, author: "Jon", channel_name: "general", excerpt: "Refunds go through Stripe within 7 days." }),
    expect.objectContaining({ ref: `reply:${w.reply}`, available: true, author: "Owner", excerpt: "Yes, and say so in the welcome." }),
  ]);
  await expect(asMember.query(api.communityMemory.listNoteSources, { communityId: w.communityId, slug: "refunds" })).rejects.toThrow();

  // The post is taken down: the note still says it came from somewhere, without showing it.
  await t.run((ctx: any) => ctx.db.patch(w.open, { status: "hidden" }));
  const after: any = await asOwner.query(api.communityMemory.listNoteSources, { communityId: w.communityId, slug: "refunds" });
  expect(after.sources[0]).toEqual({ ref: `post:${w.open}`, kind: "post", available: false });
  // The reply belongs to the hidden post, so it's gone too.
  expect(after.sources[1]).toMatchObject({ available: false });
});

test("what the community learned: a member sees only names learned from posts they can read; a builder sees all; never the text", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  const asOwner = t.withIdentity({ subject: "owner" });
  const asMember = t.withIdentity({ subject: "member" });
  const night = await run(t, w.communityId);
  await observe(t, w.communityId, night.runId, [`post:${w.open}`, `reply:${w.reply}`]);
  await t.mutation(internal.communityMemory.finishMemoryReviewRunInternal, { communityId: w.communityId, runId: night.runId, nowMs: NOW });
  const learnedTitle: string = (await t.run((ctx: any) => ctx.db.query("communityNotes").first()) as any).title;
  // A note a builder taught the guide: its name is the builders' to see.
  await t.run((ctx: any) => ctx.db.insert("communityNotes", { communityId: w.communityId, scopeKey: `community:${String(w.communityId)}`,
    slug: "vip-exceptions", title: "VIP refund exceptions", bodyMd: "Only for the first ten.", source: "founder", searchText: "vip refund exceptions",
    createdAt: Date.now(), updatedAt: Date.now() }));

  // The panels read it from the community brain's map.
  const member: any = await asMember.query(api.communityBrain.getBrainMap, { communityId: w.communityId });
  expect(member).toMatchObject({ counts: { learned: 2 }, can_manage: false });
  expect(latestLearned(member, 3).map((note) => note.title)).toEqual([learnedTitle]);
  expect(JSON.stringify(member)).not.toContain("first ten");
  expect(JSON.stringify(member)).not.toContain("VIP refund");
  const builder: any = await asOwner.query(api.communityBrain.getBrainMap, { communityId: w.communityId });
  expect(builder.can_manage).toBe(true);
  expect(latestLearned(builder, 3).map((note) => note.title).sort()).toEqual([learnedTitle, "VIP refund exceptions"].sort());
  expect(brainFact(builder)).toBe("2 learned · 1 new this week");
  expect(brainFact({ ...builder, counts: { ...builder.counts, this_week: 0 } })).toBe("2 learned");

  // The post it was learned from is taken down: a member no longer sees its name.
  await t.run((ctx: any) => ctx.db.patch(w.open, { status: "hidden" }));
  const after: any = await asMember.query(api.communityBrain.getBrainMap, { communityId: w.communityId });
  expect(after.counts.learned).toBe(2);
  expect(latestLearned(after, 3)).toEqual([]);
  // Someone outside the community gets nothing.
  await expect(t.withIdentity({ subject: "stranger" }).query(api.communityBrain.getBrainMap, { communityId: w.communityId })).rejects.toThrow();
});

// The community brain: every note is filed under the lesson it adds to, or a
// subject when no lesson fits.
async function course(t: any, w: any) {
  return await t.run(async (ctx: any) => {
    const module = (name: string, status: "live" | "draft", sortOrder: number) => ctx.db.insert("communityResourceModules", {
      communityId: w.communityId, createdByUserId: w.ownerId, status, name, sortOrder, createdAt: NOW, updatedAt: NOW });
    const lesson = (moduleId: any, title: string, sortOrder: number, extra: Record<string, unknown> = {}) => ctx.db.insert("communityResources", {
      communityId: w.communityId, moduleId, createdByUserId: w.ownerId, type: "page", title, bodyMd: "What the lesson says.", bodyChars: 21, sortOrder, pinned: false, createdAt: NOW, updatedAt: NOW, ...extra } as any);
    const basics = await module("Money basics", "live", 0);
    const draft = await module("Not out yet", "draft", 1);
    return {
      refunds: await lesson(basics, "How refunds work", 0),
      pricing: await lesson(basics, "Pricing", 1),
      file: await lesson(basics, "A file the guide read", 2, { role: "source" }),
      unpublished: await lesson(draft, "Secret lesson", 0),
      // Titled, with nothing in it yet: members aren't shown it.
      empty: await lesson(basics, "Coming soon", 3, { bodyMd: undefined, bodyChars: undefined }),
    };
  });
}

test("the guide files a note under a lesson members can take, or a subject; never a draft lesson, a file, or another place's", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  const c = await course(t, w);
  const { runId } = await run(t, w.communityId);
  const refs = [`post:${w.open}`];
  const note = async (slug: string) => await t.run((ctx: any) => ctx.db.query("communityNotes").filter((q: any) => q.eq(q.field("slug"), slug)).first()) as any;

  // Under a lesson.
  expect(await observe(t, w.communityId, runId, refs, { about: `lesson:${c.refunds}` })).toMatchObject({ ok: true, slug: "refunds" });
  expect(await note("refunds")).toMatchObject({ aboutLessonId: c.refunds });
  expect((await note("refunds")).subject).toBeUndefined();
  // A subject, tidied; it replaces the lesson when the note is rewritten that way.
  expect(await observe(t, w.communityId, runId, refs, { supersedes: "refunds", about: "  money and   refunds. " })).toMatchObject({ ok: true });
  expect(await note("refunds")).toMatchObject({ subject: "Money and refunds" });
  expect((await note("refunds")).aboutLessonId).toBeUndefined();
  // Rewritten without saying where it belongs: it stays where it was.
  expect(await observe(t, w.communityId, runId, refs, { supersedes: "refunds", body: "Refunds take 7 days." })).toMatchObject({ ok: true });
  expect(await note("refunds")).toMatchObject({ subject: "Money and refunds", bodyMd: "Refunds take 7 days." });

  // Refused, with the reason, so the guide can fix it.
  for (const [about, code] of [
    [`lesson:${c.unpublished}`, "about_lesson_missing"], [`lesson:${c.file}`, "about_lesson_missing"], [`lesson:${c.empty}`, "about_lesson_missing"], ["lesson:nope", "about_lesson_missing"],
    // Its own title is no subject for it.
    ["another", "about_is_a_title"],
    ["memory/refunds.md", "about_invalid"], ["x".repeat(41), "about_invalid"], ["post:abc", "about_invalid"],
    ["How we handle every refund", "about_invalid"], ["refunds", "about_is_a_title"],
  ]) {
    expect(await observe(t, w.communityId, runId, refs, { title: "Another", about })).toEqual({ ok: false, code });
  }
  expect(MEMORY_REFUSAL_WORDS.about_lesson_missing).toBeTruthy();
});

test("a review files notes that exist without rewriting them, a builder's too; the review is shown the lessons and what is unfiled", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  const c = await course(t, w);
  await t.run((ctx: any) => ctx.db.insert("communityNotes", { communityId: w.communityId, scopeKey: `community:${String(w.communityId)}`,
    slug: "house-rules", title: "House rules", bodyMd: "Be kind.", source: "founder", searchText: "house rules", createdAt: NOW, updatedAt: NOW }));
  const { runId } = await run(t, w.communityId);
  await observe(t, w.communityId, runId, [`post:${w.open}`]);

  const before: any = await t.query(internal.communityMemory.readMemoryReviewInputInternal, { communityId: w.communityId, sinceMs: NOW - 86_400_000, untilMs: NOW });
  expect(before.text).toContain(`- lesson:${c.refunds} · Money basics › 1. How refunds work`);
  expect(before.text).toContain(`- lesson:${c.pricing} · Money basics › 2. Pricing`);
  expect(before.text).not.toContain("Secret lesson");
  expect(before.text).not.toContain("A file the guide read");
  expect(before.text).not.toContain("Coming soon");
  expect(before.text).toMatch(/memory\/house-rules\.md · House rules · by a builder · unfiled/);
  expect(before.text).toMatch(/memory\/refunds\.md · Refunds · by you · unfiled/);

  const file = (slug: string, about: string) => t.mutation(internal.communityMemory.fileCommunityNoteInternal, { communityId: w.communityId, runId, slug, about });
  expect(await file("house-rules", "House rules")).toEqual({ ok: false, code: "about_is_a_title" });
  expect(await file("house-rules", "The house")).toEqual({ ok: true, slug: "house-rules" });
  expect(await file("refunds", `lesson:${c.refunds}`)).toEqual({ ok: true, slug: "refunds" });
  expect(await file("nothing-here", "The house")).toEqual({ ok: false, code: "note_missing" });
  expect(await file("refunds", "lesson:nope")).toEqual({ ok: false, code: "about_lesson_missing" });
  const builders: any = await t.run((ctx: any) => ctx.db.query("communityNotes").filter((q: any) => q.eq(q.field("slug"), "house-rules")).first());
  // Filed, and otherwise untouched: still the builder's words.
  expect(builders).toMatchObject({ subject: "The house", bodyMd: "Be kind.", source: "founder" });

  const after: any = await t.query(internal.communityMemory.readMemoryReviewInputInternal, { communityId: w.communityId, sinceMs: NOW - 86_400_000, untilMs: NOW });
  expect(after.text).toContain("# Subjects in use: The house");
  expect(after.text).toContain(`memory/refunds.md · Refunds · by you · filed: lesson:${c.refunds}`);
  expect(after.text).toContain("by a builder · filed: The house");
  // A finished review files nothing more.
  await t.mutation(internal.communityMemory.finishMemoryReviewRunInternal, { communityId: w.communityId, runId, nowMs: NOW });
  expect(await file("refunds", "Money")).toEqual({ ok: false, code: "run_not_open" });
});

test("memory.apply carries where each note belongs, and a list of existing notes to file", () => {
  const apply: any = parseMemoryApplyCall({ operation: "memory.apply", input: {
    notes: [{ title: "Refunds", body: "Seven days.", evidence_refs: ["post:a"], about: " lesson:abc " }, { title: "Chalk", body: "Tuesdays.", evidence_refs: ["post:b"] }],
    file: [{ note: "memory/house-rules.md", about: "House rules" }, { note: "guest-passes", about: "lesson:abc" }, { note: "", about: "x" }, { note: "no-about" }],
  } });
  expect(apply.notes.map((note: any) => note.about)).toEqual(["lesson:abc", undefined]);
  expect(apply.filings).toEqual([{ slug: "house-rules", about: "House rules" }, { slug: "guest-passes", about: "lesson:abc" }]);
  expect(parseMemoryAbout("lesson:abc_1")).toEqual({ kind: "lesson", id: "abc_1" });
  expect(parseMemoryAbout("comp prep!")).toEqual({ kind: "subject", name: "Comp prep" });
  for (const bad of ["", "   ", "123", "memory/x.md", "post:abc", "y".repeat(41)]) expect(parseMemoryAbout(bad)).toBeNull();
});

test("memory.md links notes only: where notes are filed is kept with the notes", () => {
  const slugs = new Set(["refunds"]);
  expect(memoryIndexRefusal("- [Refunds](memory/refunds.md)", slugs)).toBeNull();
  expect(memoryIndexRefusal("- [Refunds](memory/refunds.md)\n- lesson:abc · Money › 1. Refunds", slugs)).toBe("index_has_filing");
  expect(memoryIndexRefusal("- [Refunds](memory/refunds.md)\n## Subjects in use\nMoney", slugs)).toBe("index_has_filing");
  expect(MEMORY_REFUSAL_WORDS.index_has_filing).toContain("links notes only");
});
