/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import {
  COMMUNITY_WEEKLY_DIGEST_CONTINUATION_DELAY_MS,
  COMMUNITY_WEEKLY_DIGEST_MAX_COMMUNITIES_PER_RUN,
} from "../shared/communityWeeklyDigestSchedule";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityWeeklyDigestSchedule.ts",
  "./_generated/**/*.*s",
]);
const internalRefs = internal as any;

async function insertCommunity(ctx: any, suffix: string, nowMs: number) {
  const ownerId = await ctx.db.insert("users", {
    authSubject: `digest-owner-${suffix}`,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  const communityId = await ctx.db.insert("communities", {
    ownerId,
    slug: `digest-${suffix}`,
    name: `Digest ${suffix}`,
    lifecycleStatus: "active",
    lifecycleGeneration: 0,
    visibility: "unlisted",
    inferenceFundingPolicy: "managed_required",
    entryPolicy: "open",
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  return communityId;
}

describe("community weekly digest schedule foundation", () => {
  it("creates exactly one future schedule for an active community", async () => {
    const t = convexTest(schema, modules);
    const nowMs = 1_000;
    const communityId = await t.run((ctx) => insertCommunity(ctx, "one", nowMs));

    const created = await t.mutation(
      internalRefs.communityWeeklyDigestSchedule.ensureCommunityWeeklyDigestScheduleInternal,
      { communityId, nowMs },
    );
    const existing = await t.mutation(
      internalRefs.communityWeeklyDigestSchedule.ensureCommunityWeeklyDigestScheduleInternal,
      { communityId, nowMs: nowMs + 1 },
    );

    expect(created.status).toBe("created");
    expect(existing).toEqual({ status: "existing", scheduleId: created.scheduleId });
    const rows = await t.run((ctx) =>
      ctx.db.query("communityWeeklyDigestSchedules").collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      communityId,
      communityLifecycleGeneration: 0,
      status: "scheduled",
      failureCount: 0,
    });
    expect(rows[0]!.nextAttemptAt).toBeGreaterThan(nowMs);
  });

  it("claims only the global community ceiling and never overlaps an active lease", async () => {
    const t = convexTest(schema, modules);
    const nowMs = 50_000;
    for (let index = 0; index < COMMUNITY_WEEKLY_DIGEST_MAX_COMMUNITIES_PER_RUN + 2; index += 1) {
      const communityId = await t.run((ctx) => insertCommunity(ctx, `cap-${index}`, nowMs));
      const ensured = await t.mutation(
        internalRefs.communityWeeklyDigestSchedule.ensureCommunityWeeklyDigestScheduleInternal,
        { communityId, nowMs },
      );
      await t.run((ctx) =>
        ctx.db.patch(ensured.scheduleId, { nextAttemptAt: nowMs - 1 }),
      );
    }

    const firstClaims = await t.mutation(
      internalRefs.communityWeeklyDigestSchedule.claimDueCommunityWeeklyDigestSchedulesInternal,
      { limit: 999, nowMs },
    );
    const secondClaims = await t.mutation(
      internalRefs.communityWeeklyDigestSchedule.claimDueCommunityWeeklyDigestSchedulesInternal,
      { limit: 999, nowMs },
    );

    expect(firstClaims).toHaveLength(COMMUNITY_WEEKLY_DIGEST_MAX_COMMUNITIES_PER_RUN);
    expect(secondClaims).toHaveLength(2);
    expect(
      new Set([...firstClaims, ...secondClaims].map((claim: any) => String(claim.scheduleId))).size,
    ).toBe(COMMUNITY_WEEKLY_DIGEST_MAX_COMMUNITIES_PER_RUN + 2);
  });

  it("checkpoints recipient continuation and rejects a stale settlement", async () => {
    const t = convexTest(schema, modules);
    const nowMs = 80_000;
    const communityId = await t.run((ctx) => insertCommunity(ctx, "continue", nowMs));
    const ensured = await t.mutation(
      internalRefs.communityWeeklyDigestSchedule.ensureCommunityWeeklyDigestScheduleInternal,
      { communityId, nowMs },
    );
    await t.run((ctx) =>
      ctx.db.patch(ensured.scheduleId, { nextAttemptAt: nowMs - 1 }),
    );
    const [claim] = await t.mutation(
      internalRefs.communityWeeklyDigestSchedule.claimDueCommunityWeeklyDigestSchedulesInternal,
      { nowMs },
    );

    await expect(
      t.mutation(
        internalRefs.communityWeeklyDigestSchedule.settleCommunityWeeklyDigestScheduleInternal,
        {
          scheduleId: ensured.scheduleId,
          leaseToken: "wrong-token",
          outcome: "complete",
          nowMs: nowMs + 1,
        },
      ),
    ).resolves.toEqual({ status: "stale_lease" });
    await expect(
      t.mutation(
        internalRefs.communityWeeklyDigestSchedule.settleCommunityWeeklyDigestScheduleInternal,
        {
          scheduleId: ensured.scheduleId,
          leaseToken: claim.leaseToken,
          outcome: "continue",
          recipientCursor: "next-page",
          periodStartDay: "2026-08-07",
          periodEndDay: "2026-08-14",
          digestSnapshot: {
            communityName: "Digest continue",
            communitySlug: "digest-continue",
            dateLabel: "Aug 7 - Aug 14",
            intro: "1 conversation",
            items: [{ title: "A conversation", tab: "chat" }],
          },
          nowMs: nowMs + 1,
        },
      ),
    ).resolves.toEqual({ status: "continued" });

    await expect(t.run((ctx) => ctx.db.get(ensured.scheduleId))).resolves.toMatchObject({
      status: "scheduled",
      nextAttemptAt: nowMs + 1 + COMMUNITY_WEEKLY_DIGEST_CONTINUATION_DELAY_MS,
      recipientCursor: "next-page",
      periodStartDay: "2026-08-07",
      periodEndDay: "2026-08-14",
      digestSnapshot: {
        communityName: "Digest continue",
        communitySlug: "digest-continue",
      },
      failureCount: 0,
    });
  });

  it("rejects malformed digest continuation snapshots at the mutation boundary", async () => {
    const t = convexTest(schema, modules);
    const nowMs = 100_000;
    const communityId = await t.run((ctx) => insertCommunity(ctx, "invalid-snapshot", nowMs));
    const ensured = await t.mutation(
      internalRefs.communityWeeklyDigestSchedule.ensureCommunityWeeklyDigestScheduleInternal,
      { communityId, nowMs },
    );
    await t.run((ctx) =>
      ctx.db.patch(ensured.scheduleId, { nextAttemptAt: nowMs - 1 }),
    );
    const [claim] = await t.mutation(
      internalRefs.communityWeeklyDigestSchedule.claimDueCommunityWeeklyDigestSchedulesInternal,
      { nowMs },
    );

    await expect(
      t.mutation(
        internalRefs.communityWeeklyDigestSchedule.settleCommunityWeeklyDigestScheduleInternal,
        {
          scheduleId: ensured.scheduleId,
          leaseToken: claim.leaseToken,
          outcome: "continue",
          recipientCursor: "next-page",
          digestSnapshot: {
            communityName: "Digest invalid snapshot",
            communitySlug: "digest-invalid-snapshot",
            dateLabel: "Aug 7 - Aug 14",
            intro: "1 conversation",
            items: [{ title: "Private admin activity", tab: "admin" }],
          },
          nowMs: nowMs + 1,
        },
      ),
    ).rejects.toThrow();
  });

  it("pauses work when the community lifecycle generation changes", async () => {
    const t = convexTest(schema, modules);
    const nowMs = 120_000;
    const communityId = await t.run((ctx) => insertCommunity(ctx, "archive", nowMs));
    const ensured = await t.mutation(
      internalRefs.communityWeeklyDigestSchedule.ensureCommunityWeeklyDigestScheduleInternal,
      { communityId, nowMs },
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(communityId, {
        lifecycleStatus: "archived",
        lifecycleGeneration: 1,
        updatedAt: nowMs + 1,
      });
      await ctx.db.patch(ensured.scheduleId, { nextAttemptAt: nowMs - 1 });
    });

    await expect(
      t.mutation(
        internalRefs.communityWeeklyDigestSchedule.claimDueCommunityWeeklyDigestSchedulesInternal,
        { nowMs },
      ),
    ).resolves.toEqual([]);
    await expect(t.run((ctx) => ctx.db.get(ensured.scheduleId))).resolves.toMatchObject({
      status: "paused",
      lastErrorCode: "community_lifecycle_changed",
    });
  });

  it("synchronizes archive and restore immediately without creating a second row", async () => {
    const t = convexTest(schema, modules);
    const nowMs = 140_000;
    const communityId = await t.run((ctx) => insertCommunity(ctx, "lifecycle-sync", nowMs));
    const created = await t.mutation(
      internalRefs.communityWeeklyDigestSchedule.ensureCommunityWeeklyDigestScheduleInternal,
      { communityId, nowMs },
    );
    await t.run((ctx) =>
      ctx.db.patch(communityId, {
        lifecycleStatus: "archived",
        lifecycleGeneration: 1,
        updatedAt: nowMs + 1,
      }),
    );

    await expect(
      t.mutation(
        internalRefs.communityWeeklyDigestSchedule.ensureCommunityWeeklyDigestScheduleInternal,
        { communityId, nowMs: nowMs + 1 },
      ),
    ).resolves.toEqual({ status: "community_inactive", scheduleId: created.scheduleId });
    await expect(t.run((ctx) => ctx.db.get(created.scheduleId))).resolves.toMatchObject({
      status: "paused",
      lastErrorCode: "community_lifecycle_changed",
    });

    await t.run((ctx) =>
      ctx.db.patch(communityId, {
        lifecycleStatus: "active",
        lifecycleGeneration: 2,
        updatedAt: nowMs + 2,
      }),
    );
    await expect(
      t.mutation(
        internalRefs.communityWeeklyDigestSchedule.ensureCommunityWeeklyDigestScheduleInternal,
        { communityId, nowMs: nowMs + 2 },
      ),
    ).resolves.toEqual({ status: "rescheduled", scheduleId: created.scheduleId });
    const rows = await t.run((ctx) => ctx.db.query("communityWeeklyDigestSchedules").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      communityId,
      communityLifecycleGeneration: 2,
      status: "scheduled",
      failureCount: 0,
    });
    expect(rows[0]!.nextAttemptAt).toBeGreaterThan(nowMs + 2);
  });

  it("requires explicit recovery after the finite failure budget is exhausted", async () => {
    const t = convexTest(schema, modules);
    const nowMs = 160_000;
    const communityId = await t.run((ctx) => insertCommunity(ctx, "recover", nowMs));
    const ensured = await t.mutation(
      internalRefs.communityWeeklyDigestSchedule.ensureCommunityWeeklyDigestScheduleInternal,
      { communityId, nowMs },
    );
    await t.run((ctx) =>
      ctx.db.patch(ensured.scheduleId, {
        status: "processing",
        failureCount: 2,
        leaseToken: "final-attempt",
        leaseExpiresAt: nowMs + 1_000,
        nextAttemptAt: undefined,
      }),
    );

    await expect(
      t.mutation(
        internalRefs.communityWeeklyDigestSchedule.settleCommunityWeeklyDigestScheduleInternal,
        {
          scheduleId: ensured.scheduleId,
          leaseToken: "final-attempt",
          outcome: "retry",
          errorCode: "provider_unavailable",
          nowMs,
        },
      ),
    ).resolves.toEqual({ status: "needs_attention" });
    await expect(t.run((ctx) => ctx.db.get(ensured.scheduleId))).resolves.toMatchObject({
      status: "needs_attention",
      failureCount: 3,
      lastErrorCode: "provider_unavailable",
    });

    await expect(
      t.mutation(
        internalRefs.communityWeeklyDigestSchedule.resumeCommunityWeeklyDigestScheduleInternal,
        { scheduleId: ensured.scheduleId, nowMs: nowMs + 1 },
      ),
    ).resolves.toEqual({ status: "scheduled" });
    await expect(t.run((ctx) => ctx.db.get(ensured.scheduleId))).resolves.toMatchObject({
      status: "scheduled",
      failureCount: 0,
      nextAttemptAt: nowMs + 1,
    });
  });

  it("never uses recovery to displace an active processing lease", async () => {
    const t = convexTest(schema, modules);
    const nowMs = 200_000;
    const communityId = await t.run((ctx) => insertCommunity(ctx, "busy", nowMs));
    const ensured = await t.mutation(
      internalRefs.communityWeeklyDigestSchedule.ensureCommunityWeeklyDigestScheduleInternal,
      { communityId, nowMs },
    );
    await t.run((ctx) =>
      ctx.db.patch(ensured.scheduleId, {
        status: "processing",
        leaseToken: "active-token",
        leaseExpiresAt: nowMs + 60_000,
        nextAttemptAt: undefined,
      }),
    );

    await expect(
      t.mutation(
        internalRefs.communityWeeklyDigestSchedule.resumeCommunityWeeklyDigestScheduleInternal,
        { scheduleId: ensured.scheduleId, nowMs: nowMs + 1 },
      ),
    ).resolves.toEqual({ status: "processing" });
    await expect(t.run((ctx) => ctx.db.get(ensured.scheduleId))).resolves.toMatchObject({
      status: "processing",
      leaseToken: "active-token",
      leaseExpiresAt: nowMs + 60_000,
    });
  });
});
