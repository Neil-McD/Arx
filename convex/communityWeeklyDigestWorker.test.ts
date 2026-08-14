/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import {
  COMMUNITY_WEEKLY_DIGEST_CONTINUATION_DELAY_MS,
  COMMUNITY_WEEKLY_DIGEST_MAX_RECIPIENTS_PER_RUN,
} from "../shared/communityWeeklyDigestSchedule";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityWeeklyDigestWorker.ts",
  "./communityWeeklyDigestSchedule.ts",
  "./email.ts",
  "./_generated/**/*.*s",
]);
const internalRefs = internal as any;
const originalPublicAppUrl = process.env.ARX_PUBLIC_APP_URL;
const NOW_MS = Date.parse("2026-08-14T12:00:00.000Z");
const ACTIVITY_MS = Date.parse("2026-08-12T12:00:00.000Z");

beforeAll(() => {
  process.env.ARX_PUBLIC_APP_URL = "https://polynet.test";
});

afterAll(() => {
  if (originalPublicAppUrl === undefined) delete process.env.ARX_PUBLIC_APP_URL;
  else process.env.ARX_PUBLIC_APP_URL = originalPublicAppUrl;
});

async function insertUser(ctx: any, suffix: string, weeklyDigestEnabled?: boolean) {
  const userId = await ctx.db.insert("users", {
    authSubject: `digest-worker-user-${suffix}`,
    displayName: `Digest user ${suffix}`,
    handle: `digest-worker-${suffix}`,
    normalizedHandle: `digest-worker-${suffix}`,
    email: `digest-worker-${suffix}@example.com`,
    emailVerifiedAt: NOW_MS,
    createdAt: NOW_MS,
    updatedAt: NOW_MS,
  });
  if (weeklyDigestEnabled !== undefined) {
    await ctx.db.insert("emailPreferences", {
      userId,
      weeklyDigestEnabled,
      eventReminderEnabled: true,
      founderAdminEmailsEnabled: true,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
  }
  return userId;
}

async function insertDigestCommunity(
  ctx: any,
  suffix: string,
  memberCount: number,
  ownerWeeklyDigestEnabled?: boolean,
) {
  const ownerId = await insertUser(ctx, `${suffix}-owner`, ownerWeeklyDigestEnabled);
  const communityId = await ctx.db.insert("communities", {
    ownerId,
    slug: `digest-worker-${suffix}`,
    name: `Digest Worker ${suffix}`,
    lifecycleStatus: "active",
    lifecycleGeneration: 0,
    visibility: "published",
    inferenceFundingPolicy: "managed_required",
    entryPolicy: "open",
    createdAt: NOW_MS,
    updatedAt: NOW_MS,
  });
  const channelId = await ctx.db.insert("communityChannels", {
    communityId,
    systemRole: "general",
    slug: "general",
    name: "General",
    accessMode: "all_members",
    postingPolicy: "members",
    status: "active",
    position: 0,
    createdByUserId: ownerId,
    createdAt: NOW_MS,
    updatedAt: NOW_MS,
  });
  await ctx.db.insert("communityInteractionRoots", {
    communityId,
    channelId,
    actorType: "human",
    actorUserId: ownerId,
    kind: "discussion",
    status: "live",
    visibilityScope: "community",
    title: "This week in the community",
    contentSummary: "Members shared progress and planned the next workshop.",
    replyCount: 0,
    reactionSummary: [],
    idempotencyKey: `digest-worker-root-${suffix}`,
    createdAt: ACTIVITY_MS,
    updatedAt: ACTIVITY_MS,
  });
  const memberIds = [];
  for (let index = 0; index < memberCount; index += 1) {
    const userId = await insertUser(ctx, `${suffix}-member-${index}`, index === 0 ? false : undefined);
    memberIds.push(userId);
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId,
      role: "member",
      accessSource: "free_grant",
      active: true,
      createdAt: NOW_MS - index,
      updatedAt: NOW_MS - index,
    });
  }
  return { communityId, ownerId, memberIds };
}

async function makeScheduleDue(t: ReturnType<typeof convexTest>, communityId: any, nowMs = NOW_MS) {
  const ensured = await t.mutation(
    internalRefs.communityWeeklyDigestSchedule.ensureCommunityWeeklyDigestScheduleInternal,
    { communityId, nowMs },
  );
  await t.run((ctx) => ctx.db.patch(ensured.scheduleId, { nextAttemptAt: nowMs - 1 }));
  return ensured.scheduleId;
}

describe("bounded community weekly digest worker", () => {
  it("does no work when the indexed due queue is empty", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.action(internalRefs.communityWeeklyDigestWorker.processDueCommunityWeeklyDigestsInternal, {
        nowMs: NOW_MS,
      }),
    ).resolves.toEqual({
      ok: true,
      communities: 0,
      recipients: 0,
      enqueued: 0,
      deduped: 0,
      suppressed: 0,
      continued: 0,
      completed: 0,
      failed: 0,
    });
  });

  it("checkpoints one bounded recipient page and reuses its digest snapshot", async () => {
    const t = convexTest(schema, modules);
    const fixture = await t.run((ctx) => insertDigestCommunity(ctx, "paged", 60, false));
    const scheduleId = await makeScheduleDue(t, fixture.communityId);

    const first = await t.action(
      internalRefs.communityWeeklyDigestWorker.processDueCommunityWeeklyDigestsInternal,
      { nowMs: NOW_MS },
    );
    expect(first).toMatchObject({
      communities: 1,
      recipients: 50,
      enqueued: 49,
      suppressed: 1,
      continued: 1,
      failed: 0,
    });
    const checkpoint = await t.run((ctx) => ctx.db.get(scheduleId)) as any;
    expect(checkpoint).toMatchObject({
      status: "scheduled",
      periodStartDay: "2026-08-07",
      periodEndDay: "2026-08-13",
    });
    expect(checkpoint?.recipientCursor).toEqual(expect.any(String));
    expect(checkpoint?.digestSnapshot).toMatchObject({
      communityName: "Digest Worker paged",
    });

    const second = await t.action(
      internalRefs.communityWeeklyDigestWorker.processDueCommunityWeeklyDigestsInternal,
      { nowMs: NOW_MS + COMMUNITY_WEEKLY_DIGEST_CONTINUATION_DELAY_MS + 1 },
    );
    expect(second).toMatchObject({
      communities: 1,
      recipients: 11,
      enqueued: 10,
      suppressed: 1,
      completed: 1,
      failed: 0,
    });
    const completed = await t.run((ctx) => ctx.db.get(scheduleId)) as any;
    expect(completed).toMatchObject({ status: "scheduled" });
    expect(completed?.recipientCursor).toBeUndefined();
    expect(completed?.digestSnapshot).toBeUndefined();
    const outbox = await t.run((ctx) => ctx.db.query("emailOutbox").collect());
    expect(outbox).toHaveLength(61);
    expect(new Set(outbox.map((row) => row.dedupeKey)).size).toBe(61);
  });

  it("never exceeds the global recipient ceiling", async () => {
    const t = convexTest(schema, modules);
    for (let index = 0; index < 3; index += 1) {
      const fixture = await t.run((ctx) => insertDigestCommunity(ctx, `cap-${index}`, 60));
      await makeScheduleDue(t, fixture.communityId);
    }
    const result = await t.action(
      internalRefs.communityWeeklyDigestWorker.processDueCommunityWeeklyDigestsInternal,
      { nowMs: NOW_MS },
    );
    expect(result.recipients).toBe(COMMUNITY_WEEKLY_DIGEST_MAX_RECIPIENTS_PER_RUN);
    expect(result.communities).toBe(2);
    const outbox = await t.run((ctx) => ctx.db.query("emailOutbox").collect());
    expect(outbox).toHaveLength(COMMUNITY_WEEKLY_DIGEST_MAX_RECIPIENTS_PER_RUN);
  });

  it("replay uses outbox dedupe rather than creating duplicate jobs", async () => {
    const t = convexTest(schema, modules);
    const fixture = await t.run((ctx) => insertDigestCommunity(ctx, "replay", 1));
    const scheduleId = await makeScheduleDue(t, fixture.communityId);
    await t.action(
      internalRefs.communityWeeklyDigestWorker.processDueCommunityWeeklyDigestsInternal,
      { nowMs: NOW_MS },
    );
    const firstOutbox = await t.run((ctx) => ctx.db.query("emailOutbox").collect());
    expect(firstOutbox).toHaveLength(2);

    await t.run((ctx) => ctx.db.patch(scheduleId, { nextAttemptAt: NOW_MS - 1 }));
    const replay = await t.action(
      internalRefs.communityWeeklyDigestWorker.processDueCommunityWeeklyDigestsInternal,
      { nowMs: NOW_MS },
    );
    expect(replay).toMatchObject({ recipients: 2, deduped: 2, enqueued: 0 });
    const replayOutbox = await t.run((ctx) => ctx.db.query("emailOutbox").collect());
    expect(replayOutbox).toHaveLength(2);
  });

  it("pauses archived communities without building or enqueueing a digest", async () => {
    const t = convexTest(schema, modules);
    const fixture = await t.run((ctx) => insertDigestCommunity(ctx, "archived", 3));
    const scheduleId = await makeScheduleDue(t, fixture.communityId);
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.communityId, {
        lifecycleStatus: "archived",
        lifecycleGeneration: 1,
        updatedAt: NOW_MS + 1,
      });
    });
    const result = await t.action(
      internalRefs.communityWeeklyDigestWorker.processDueCommunityWeeklyDigestsInternal,
      { nowMs: NOW_MS + 1 },
    );
    expect(result).toMatchObject({ communities: 0, recipients: 0, enqueued: 0 });
    const schedule = await t.run((ctx) => ctx.db.get(scheduleId));
    expect(schedule).toMatchObject({
      status: "paused",
      lastErrorCode: "community_lifecycle_changed",
    });
    const outbox = await t.run((ctx) => ctx.db.query("emailOutbox").collect());
    expect(outbox).toEqual([]);
  });
});
