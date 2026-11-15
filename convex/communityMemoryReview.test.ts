/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, vi, afterEach } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { markCommunityMemoryReviewDue } from "./communityMemory";

afterEach(() => { vi.useRealTimers(); });
const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.UTC(2026, 10, 14, 15, 0, 0);

async function world(t: any) {
  return await t.run(async (ctx: any) => {
    const ownerId = await ctx.db.insert("users", { authSubject: "owner", displayName: "Owner", createdAt: NOW, updatedAt: NOW });
    const communityId = await ctx.db.insert("communities", { ownerId, slug: "review-club", name: "Review club", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 1, createdAt: NOW, updatedAt: NOW });
    const channel = (slug: string, accessMode: "all_members" | "restricted") => ctx.db.insert("communityChannels", {
      communityId, slug, name: slug, accessMode, postingPolicy: "members", status: "active", position: 0, createdAt: NOW, updatedAt: NOW });
    const general = await channel("general", "all_members");
    const pod = await channel("founders", "restricted");
    return { ownerId, communityId, general, pod };
  });
}

const work = (t: any, communityId: any) => t.run((ctx: any) => ctx.db.query("agentWork")
  .withIndex("by_scope_kind", (q: any) => q.eq("scopeKey", `community:${String(communityId)}`).eq("kind", "memory_review")).first());

test("a person's post in an open channel makes the review due at the quiet hour; a pod, the guide or a private talk don't", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  await t.run((ctx: any) => markCommunityMemoryReviewDue(ctx, { communityId: w.communityId, channelId: w.pod, actorType: "human", nowMs: NOW }));
  await t.run((ctx: any) => markCommunityMemoryReviewDue(ctx, { communityId: w.communityId, channelId: w.general, actorType: "community_agent", nowMs: NOW }));
  await t.run((ctx: any) => markCommunityMemoryReviewDue(ctx, { communityId: w.communityId, channelId: undefined, actorType: "human", nowMs: NOW }));
  expect(await work(t, w.communityId)).toBeNull();

  await t.run((ctx: any) => markCommunityMemoryReviewDue(ctx, { communityId: w.communityId, channelId: w.general, actorType: "human", nowMs: NOW }));
  await t.run((ctx: any) => markCommunityMemoryReviewDue(ctx, { communityId: w.communityId, channelId: w.general, actorType: "human", nowMs: NOW + 1_000 }));
  const row: any = await work(t, w.communityId);
  // 3 am UTC the next day (no time zone set), and the first review reads the last day.
  expect(row).toMatchObject({ pending: 2, dueAt: Date.UTC(2026, 10, 15, 3, 0, 0), reviewedThrough: NOW - 86_400_000, failures: 0 });
  const scheduled = await t.run((ctx: any) => ctx.db.system.query("_scheduled_functions").collect());
  expect(scheduled).toHaveLength(1);
});

test("a review is claimed once, carries over posts written while it ran, and retries a failure twice", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  // Funded: the owner is the platform operator.
  await t.run((ctx: any) => ctx.db.insert("operatorRoles", { userId: w.ownerId, role: "owner", active: true, createdAt: NOW, updatedAt: NOW }));
  await t.run((ctx: any) => markCommunityMemoryReviewDue(ctx, { communityId: w.communityId, channelId: w.general, actorType: "human", nowMs: NOW }));
  const row: any = await work(t, w.communityId);
  expect(await t.mutation(internal.communityMemoryReview.claimMemoryReviewInternal, { workId: row._id, nowMs: NOW })).toBeNull();
  const at = row.dueAt;
  const claim: any = await t.mutation(internal.communityMemoryReview.claimMemoryReviewInternal, { workId: row._id, nowMs: at });
  expect(claim).toMatchObject({ communitySlug: "review-club", windowStart: NOW - 86_400_000, windowEnd: at, claimedPending: 1 });
  expect(await t.mutation(internal.communityMemoryReview.claimMemoryReviewInternal, { workId: row._id, nowMs: at + 1 })).toBeNull();

  // A post arrives while the review runs.
  await t.run((ctx: any) => markCommunityMemoryReviewDue(ctx, { communityId: w.communityId, channelId: w.general, actorType: "human", nowMs: at + 5 }));
  const done: any = await t.mutation(internal.communityMemoryReview.completeMemoryReviewInternal, {
    workId: row._id, outcome: "reviewed", windowEnd: at, claimedPending: 1, nowMs: at + 10 });
  expect(done.dueAt).toBe(Date.UTC(2026, 10, 16, 3, 0, 0));
  expect(await work(t, w.communityId)).toMatchObject({ pending: 1, reviewedThrough: at, failures: 0 });

  const next: any = await work(t, w.communityId);
  for (let i = 1; i <= 3; i++) {
    const claimAt = next.dueAt + i * 3_600_000;
    await t.run((ctx: any) => ctx.db.patch(next._id, { dueAt: claimAt, leaseUntil: undefined }));
    await t.mutation(internal.communityMemoryReview.claimMemoryReviewInternal, { workId: next._id, nowMs: claimAt });
    const failed: any = await t.mutation(internal.communityMemoryReview.completeMemoryReviewInternal, {
      workId: next._id, outcome: "failed", windowEnd: claimAt, claimedPending: 1, errorCode: "provider_exception", nowMs: claimAt });
    expect(failed.dueAt === null).toBe(i === 3);
  }
  expect(await work(t, w.communityId)).toMatchObject({ failures: 3, lastErrorCode: "provider_exception" });
  // The next post starts it again.
  await t.run((ctx: any) => markCommunityMemoryReviewDue(ctx, { communityId: w.communityId, channelId: w.general, actorType: "human", nowMs: next.dueAt + 5 * 3_600_000 }));
  expect(await work(t, w.communityId)).toMatchObject({ failures: 0 });
});

test("with AI off the review doesn't run and waits for the next post", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  await t.run((ctx: any) => markCommunityMemoryReviewDue(ctx, { communityId: w.communityId, channelId: w.general, actorType: "human", nowMs: NOW }));
  const row: any = await work(t, w.communityId);
  vi.useFakeTimers();
  vi.setSystemTime(row.dueAt);
  expect(await t.action(internal.communityMemoryReview.runMemoryReviewInternal, { workId: row._id })).toEqual({ status: "skipped" });
  const after: any = await work(t, w.communityId);
  expect(after.pending).toBe(1);
  expect(after.dueAt).toBeUndefined();
  expect(await t.run((ctx: any) => ctx.db.query("agentWorkRuns").collect())).toEqual([]);
});

test("the review is handed what people said in open channels only", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  await t.run(async (ctx: any) => {
    const root = (channelId: any, createdAt: number, status = "live") => ctx.db.insert("communityInteractionRoots", { communityId: w.communityId, channelId,
      actorType: "human", actorUserId: w.ownerId, kind: "discussion", status, visibilityScope: "community", contentSummary: "x", replyCount: 0,
      reactionSummary: [], idempotencyKey: `k${Math.random()}`, createdAt, updatedAt: createdAt });
    await root(w.general, NOW - 10);
    await root(w.general, NOW + 10);
    await root(w.general, NOW + 20, "hidden");
    await root(w.pod, NOW + 10);
    await ctx.db.insert("communityInteractionRoots", { communityId: w.communityId, channelId: w.general, actorType: "community_agent",
      kind: "discussion", status: "live", visibilityScope: "community", contentSummary: "The guide's own answer.", replyCount: 0,
      reactionSummary: [], idempotencyKey: "guide", createdAt: NOW + 30, updatedAt: NOW + 30 });
  });
  const input: any = await t.query(internal.communityMemory.readMemoryReviewInputInternal, { communityId: w.communityId, sinceMs: NOW, untilMs: NOW + 1_000 });
  expect(input).toMatchObject({ posts: 2, readUntil: NOW + 1_000 });
  // The guide's own words are context without a name to cite.
  expect(input.text).toContain("- the guide (not citable) · ");
  expect(input.text).toContain("## #general");
  expect(input.text).not.toContain("founders");
});

test("a funded community whose owner switched the guide off is skipped; switched on, it's claimed", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  await t.run(async (ctx: any) => {
    await ctx.db.insert("operatorRoles", { userId: w.ownerId, role: "owner", active: true, createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityAgentConfigs", { communityId: w.communityId, systemPrompt: "", agentEnabled: false, createdAt: NOW, updatedAt: NOW });
  });
  await t.run((ctx: any) => markCommunityMemoryReviewDue(ctx, { communityId: w.communityId, channelId: w.general, actorType: "human", nowMs: NOW }));
  const row: any = await work(t, w.communityId);
  expect(await t.mutation(internal.communityMemoryReview.claimMemoryReviewInternal, { workId: row._id, nowMs: row.dueAt })).toEqual({ skipped: true });

  await t.run(async (ctx: any) => {
    await ctx.db.insert("communityAgentConfigs", { communityId: w.communityId, systemPrompt: "", agentEnabled: true, createdAt: NOW, updatedAt: NOW + 1 });
    await ctx.db.patch(row._id, { dueAt: row.dueAt });
  });
  expect(await t.mutation(internal.communityMemoryReview.claimMemoryReviewInternal, { workId: row._id, nowMs: row.dueAt }))
    .toMatchObject({ communitySlug: "review-club", claimedPending: 1 });
});

test("a busy window is read through its 100th post; the rest is reviewed 15 minutes later", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  await t.run(async (ctx: any) => {
    for (let i = 1; i <= 205; i++) {
      await ctx.db.insert("communityInteractionRoots", { communityId: w.communityId, channelId: w.general, actorType: "human", actorUserId: w.ownerId,
        kind: "discussion", status: "live", visibilityScope: "community", contentSummary: "x", replyCount: 0, reactionSummary: [],
        idempotencyKey: `busy${i}`, createdAt: NOW + i, updatedAt: NOW + i });
    }
  });
  const offered: any = await t.query(internal.communityMemory.readMemoryReviewInputInternal, { communityId: w.communityId, sinceMs: NOW, untilMs: NOW + 1_000 });
  expect(offered).toMatchObject({ posts: 100, readUntil: NOW + 100 });
  expect(offered.text).toContain("The rest is read in the next review.");

  await t.run((ctx: any) => markCommunityMemoryReviewDue(ctx, { communityId: w.communityId, channelId: w.general, actorType: "human", nowMs: NOW }));
  const row: any = await work(t, w.communityId);
  await t.mutation(internal.communityMemoryReview.claimMemoryReviewInternal, { workId: row._id, nowMs: row.dueAt });
  const done: any = await t.mutation(internal.communityMemoryReview.completeMemoryReviewInternal, {
    workId: row._id, outcome: "reviewed", windowEnd: offered.readUntil, claimedPending: 1, backlog: true, nowMs: NOW + 2_000 });
  expect(done.dueAt).toBe(NOW + 2_000 + 15 * 60_000);
  expect(await work(t, w.communityId)).toMatchObject({ reviewedThrough: NOW + 100, pending: 1 });
});

test("replies in a deleted thread aren't offered to the review", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  await t.run(async (ctx: any) => {
    const rootId = await ctx.db.insert("communityInteractionRoots", { communityId: w.communityId, channelId: w.general, actorType: "human", actorUserId: w.ownerId,
      kind: "discussion", status: "deleted", visibilityScope: "community", contentSummary: "x", replyCount: 1, reactionSummary: [],
      idempotencyKey: "gone", createdAt: NOW - 100, updatedAt: NOW });
    await ctx.db.insert("communityInteractionReplies", { communityId: w.communityId, channelId: w.general, rootId, actorType: "human", actorUserId: w.ownerId,
      status: "live", visibilityScope: "community", contentSummary: "reply", reactionSummary: [], idempotencyKey: "gone-reply", seq: 1, createdAt: NOW + 10, updatedAt: NOW + 10 });
  });
  expect(await t.query(internal.communityMemory.readMemoryReviewInputInternal, { communityId: w.communityId, sinceMs: NOW, untilMs: NOW + 1_000 }))
    .toMatchObject({ posts: 0 });
});

test("one pass: the guide gets everything in one prompt and writes once; refused notes come back with the reason", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS", "1000000");
  vi.stubEnv("POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS", "2000000");
  vi.stubEnv("POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS", "1000000");
  const t = convexTest(schema, modules);
  const w = await world(t);
  await t.run((ctx: any) => ctx.db.insert("operatorRoles", { userId: w.ownerId, role: "owner", active: true, createdAt: NOW, updatedAt: NOW }));
  const postId = await t.run((ctx: any) => ctx.db.insert("communityInteractionRoots", { communityId: w.communityId, channelId: w.general,
    actorType: "human", actorUserId: w.ownerId, kind: "discussion", status: "live", visibilityScope: "community",
    contentSummary: "Saturday climbs meet at 8 am at the north wall.", replyCount: 0, reactionSummary: [], idempotencyKey: "meet", createdAt: NOW + 10, updatedAt: NOW + 10 }));
  await t.run((ctx: any) => markCommunityMemoryReviewDue(ctx, { communityId: w.communityId, channelId: w.general, actorType: "human", nowMs: NOW }));
  const row: any = await work(t, w.communityId);
  await t.run((ctx: any) => ctx.db.patch(row._id, { reviewedThrough: NOW }));

  const usage = { input_tokens: 3000, output_tokens: 200, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } };
  const apply = { operation: "memory.apply", input: {
    notes: [
      { title: "Saturday meet", body: "Saturday climbs meet at 8 am at the north wall.", evidence_refs: [`post:${postId}`] },
      { title: "Made up", body: "Nobody said this.", evidence_refs: ["post:nope"] },
      { title: "Unseen", body: "Rewrites a note it never saw.", evidence_refs: [`post:${postId}`], supersedes: "never-shown" },
    ],
    index: "- [Saturday meet](memory/saturday-meet.md)",
  } };
  const replies = [
    { id: "r1", model: "gpt-6-luna", service_tier: "default", usage,
      output: [{ type: "function_call", call_id: "c1", name: "polynet_call", arguments: JSON.stringify(apply) }] },
    { id: "r2", model: "gpt-6-luna", service_tier: "default", usage, output_text: "Added when Saturday climbs meet." },
  ];
  const bodies: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: any, options: any) => {
    bodies.push(JSON.parse(options.body));
    return new Response(JSON.stringify(replies[bodies.length - 1] ?? replies[1]), { status: 200 });
  }));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(row.dueAt);
  const result = await t.action(internal.communityMemoryReview.runMemoryReviewInternal, { workId: row._id });
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();

  expect(result).toEqual({ status: "reviewed" });
  // Two model calls; the first already holds the posts.
  expect(bodies).toHaveLength(2);
  expect(JSON.stringify(bodies[0].input)).toContain("Saturday climbs meet at 8 am");
  const toolOutput = JSON.stringify(bodies[1].input);
  expect(toolOutput).toContain("memory/saturday-meet.md");
  expect(toolOutput).toContain("evidence_missing");
  expect(toolOutput).toContain("note_not_shown");
  const notes: any[] = await t.run((ctx: any) => ctx.db.query("communityNotes").collect());
  expect(notes.map((note: any) => [note.slug, note.authorKind, note.evidenceRefs])).toEqual([["saturday-meet", "guide", [`post:${postId}`]]]);
  const index: any = await t.run((ctx: any) => ctx.db.query("communityMemoryIndex").first());
  expect(index.bodyMd).toContain("memory/saturday-meet.md");
  const runs: any[] = await t.run((ctx: any) => ctx.db.query("agentWorkRuns").collect());
  expect(runs[0]).toMatchObject({ summary: "Added when Saturday climbs meet.", promptTokens: 6000 });
});

test("the guide's notes are shown whole within a budget; only those can be rewritten", async () => {
  const t = convexTest(schema, modules);
  const w = await world(t);
  await t.run(async (ctx: any) => {
    for (let i = 0; i < 8; i++) {
      await ctx.db.insert("communityNotes", { scopeKey: `community:${String(w.communityId)}`, communityId: w.communityId, slug: `long-${i}`, title: `Long ${i}`, bodyMd: `${i} `.repeat(2_000),
        source: "learned", searchText: "", authorKind: "guide", createdAt: NOW + i, updatedAt: NOW + i });
    }
    await ctx.db.insert("communityInteractionRoots", { communityId: w.communityId, channelId: w.general, actorType: "human", actorUserId: w.ownerId,
      kind: "discussion", status: "live", visibilityScope: "community", contentSummary: "x", replyCount: 0, reactionSummary: [],
      idempotencyKey: "one", createdAt: NOW + 10, updatedAt: NOW + 10 });
  });
  const input: any = await t.query(internal.communityMemory.readMemoryReviewInputInternal, { communityId: w.communityId, sinceMs: NOW, untilMs: NOW + 1_000 });
  // 4,000 characters each in a 24,000 budget: the six newest.
  expect(input.rewritable).toEqual(["long-7", "long-6", "long-5", "long-4", "long-3", "long-2"]);
  expect(input.text).toContain("Long 1 · by you (not shown; can't be rewritten in this review)");
});
