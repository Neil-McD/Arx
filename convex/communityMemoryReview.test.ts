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
  .withIndex("by_community_scope_kind", (q: any) => q.eq("communityId", communityId).eq("scope", "community").eq("kind", "memory_review")).first());

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

test("only open channels with something new are offered to the review", async () => {
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
  });
  expect(await t.query(internal.communityMemoryReview.listOpenChannelsWithNewInternal, { communityId: w.communityId, sinceMs: NOW }))
    .toEqual([{ slug: "general", name: "general", count: 1 }]);
});
