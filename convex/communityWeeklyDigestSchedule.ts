import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { communityWeeklyDigestSnapshotValidator } from "./communityWeeklyDigestValidators";
import {
  communityIsActive,
  communityLifecycleGenerationMatches,
  normalizeCommunityLifecycle,
} from "../shared/communityLifecycle";
import {
  COMMUNITY_WEEKLY_DIGEST_CONTINUATION_DELAY_MS,
  COMMUNITY_WEEKLY_DIGEST_LEASE_MS,
  COMMUNITY_WEEKLY_DIGEST_MAX_COMMUNITIES_PER_RUN,
  COMMUNITY_WEEKLY_DIGEST_MAX_FAILURES,
  communityWeeklyDigestRetryDelayMs,
  nextCommunityWeeklyDigestAt,
} from "../shared/communityWeeklyDigestSchedule";

function boundedCommunityLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return COMMUNITY_WEEKLY_DIGEST_MAX_COMMUNITIES_PER_RUN;
  }
  return Math.min(
    COMMUNITY_WEEKLY_DIGEST_MAX_COMMUNITIES_PER_RUN,
    Math.max(1, Math.floor(parsed)),
  );
}

async function pauseInvalidCommunitySchedule(
  ctx: any,
  row: any,
  nowMs: number,
): Promise<boolean> {
  const community = await ctx.db.get(row.communityId);
  if (
    community &&
    communityIsActive(community) &&
    communityLifecycleGenerationMatches(community, row.communityLifecycleGeneration)
  ) {
    return false;
  }
  await ctx.db.patch(row._id, {
    status: "paused",
    nextAttemptAt: undefined,
    leaseToken: undefined,
    leaseExpiresAt: undefined,
    lastErrorCode: community ? "community_lifecycle_changed" : "community_missing",
    updatedAt: nowMs,
  });
  return true;
}

export const ensureCommunityWeeklyDigestScheduleInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = Number.isFinite(args.nowMs) ? Math.floor(args.nowMs as number) : Date.now();
    const community = await ctx.db.get(args.communityId);
    if (!community || !communityIsActive(community)) {
      return { status: "community_inactive" as const, scheduleId: null };
    }
    const lifecycle = normalizeCommunityLifecycle(community);
    const existing = await ctx.db
      .query("communityWeeklyDigestSchedules")
      .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
      .unique();
    if (existing) {
      if (
        existing.communityLifecycleGeneration === lifecycle.generation &&
        existing.status !== "paused"
      ) {
        return { status: "existing" as const, scheduleId: existing._id };
      }
      await ctx.db.patch(existing._id, {
        communityLifecycleGeneration: lifecycle.generation,
        status: "scheduled",
        nextAttemptAt: nextCommunityWeeklyDigestAt(args.communityId, nowMs),
        recipientCursor: undefined,
        periodStartDay: undefined,
        periodEndDay: undefined,
        digestSnapshot: undefined,
        failureCount: 0,
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        lastErrorCode: undefined,
        updatedAt: nowMs,
      });
      return { status: "rescheduled" as const, scheduleId: existing._id };
    }
    const scheduleId = await ctx.db.insert("communityWeeklyDigestSchedules", {
      communityId: args.communityId,
      communityLifecycleGeneration: lifecycle.generation,
      status: "scheduled",
      nextAttemptAt: nextCommunityWeeklyDigestAt(args.communityId, nowMs),
      failureCount: 0,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { status: "created" as const, scheduleId };
  },
});

export const claimDueCommunityWeeklyDigestSchedulesInternal = internalMutation({
  args: {
    limit: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = Number.isFinite(args.nowMs) ? Math.floor(args.nowMs as number) : Date.now();
    const limit = boundedCommunityLimit(args.limit);
    const [dueRows, expiredLeaseRows] = await Promise.all([
      ctx.db
        .query("communityWeeklyDigestSchedules")
        .withIndex("by_status_nextAttemptAt", (q) =>
          q.eq("status", "scheduled").lte("nextAttemptAt", nowMs),
        )
        .take(limit),
      ctx.db
        .query("communityWeeklyDigestSchedules")
        .withIndex("by_status_leaseExpiresAt", (q) =>
          q.eq("status", "processing").lte("leaseExpiresAt", nowMs),
        )
        .take(limit),
    ]);
    const candidates = [...dueRows, ...expiredLeaseRows].slice(0, limit);
    const claims = [];
    for (const row of candidates) {
      if (await pauseInvalidCommunitySchedule(ctx, row, nowMs)) continue;
      const expiredLease = row.status === "processing";
      const failureCount = row.failureCount + (expiredLease ? 1 : 0);
      if (failureCount >= COMMUNITY_WEEKLY_DIGEST_MAX_FAILURES) {
        await ctx.db.patch(row._id, {
          status: "needs_attention",
          failureCount,
          nextAttemptAt: undefined,
          leaseToken: undefined,
          leaseExpiresAt: undefined,
          lastErrorCode: "weekly_digest_attempts_exhausted",
          updatedAt: nowMs,
        });
        continue;
      }
      const leaseToken = crypto.randomUUID();
      const leaseExpiresAt = nowMs + COMMUNITY_WEEKLY_DIGEST_LEASE_MS;
      await ctx.db.patch(row._id, {
        status: "processing",
        failureCount,
        nextAttemptAt: undefined,
        leaseToken,
        leaseExpiresAt,
        lastErrorCode: expiredLease ? "weekly_digest_lease_expired" : undefined,
        updatedAt: nowMs,
      });
      claims.push({
        scheduleId: row._id,
        communityId: row.communityId,
        communityLifecycleGeneration: row.communityLifecycleGeneration,
        recipientCursor: row.recipientCursor ?? null,
        periodStartDay: row.periodStartDay ?? null,
        periodEndDay: row.periodEndDay ?? null,
        digestSnapshot: row.digestSnapshot ?? null,
        leaseToken,
        leaseExpiresAt,
      });
    }
    return claims;
  },
});

export const settleCommunityWeeklyDigestScheduleInternal = internalMutation({
  args: {
    scheduleId: v.id("communityWeeklyDigestSchedules"),
    leaseToken: v.string(),
    outcome: v.union(
      v.literal("continue"),
      v.literal("complete"),
      v.literal("retry"),
    ),
    recipientCursor: v.optional(v.string()),
    periodStartDay: v.optional(v.string()),
    periodEndDay: v.optional(v.string()),
    digestSnapshot: v.optional(communityWeeklyDigestSnapshotValidator),
    errorCode: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = Number.isFinite(args.nowMs) ? Math.floor(args.nowMs as number) : Date.now();
    const row = await ctx.db.get(args.scheduleId);
    if (
      !row ||
      row.status !== "processing" ||
      row.leaseToken !== args.leaseToken
    ) {
      return { status: "stale_lease" as const };
    }
    if (await pauseInvalidCommunitySchedule(ctx, row, nowMs)) {
      return { status: "community_inactive" as const };
    }
    if (args.outcome === "continue") {
      const recipientCursor = String(args.recipientCursor ?? "").trim();
      if (!recipientCursor) throw new Error("weekly_digest_recipient_cursor_missing");
      await ctx.db.patch(row._id, {
        status: "scheduled",
        nextAttemptAt: nowMs + COMMUNITY_WEEKLY_DIGEST_CONTINUATION_DELAY_MS,
        recipientCursor,
        periodStartDay: args.periodStartDay ?? row.periodStartDay,
        periodEndDay: args.periodEndDay ?? row.periodEndDay,
        digestSnapshot: args.digestSnapshot ?? row.digestSnapshot,
        failureCount: 0,
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        lastErrorCode: undefined,
        updatedAt: nowMs,
      });
      return { status: "continued" as const };
    }
    if (args.outcome === "complete") {
      await ctx.db.patch(row._id, {
        status: "scheduled",
        nextAttemptAt: nextCommunityWeeklyDigestAt(row.communityId, nowMs),
        recipientCursor: undefined,
        periodStartDay: undefined,
        periodEndDay: undefined,
        digestSnapshot: undefined,
        failureCount: 0,
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        lastErrorCode: undefined,
        updatedAt: nowMs,
      });
      return { status: "completed" as const };
    }
    const failureCount = row.failureCount + 1;
    const exhausted = failureCount >= COMMUNITY_WEEKLY_DIGEST_MAX_FAILURES;
    await ctx.db.patch(row._id, {
      status: exhausted ? "needs_attention" : "scheduled",
      nextAttemptAt: exhausted
        ? undefined
        : nowMs + communityWeeklyDigestRetryDelayMs(failureCount),
      failureCount,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: String(args.errorCode ?? "weekly_digest_failed").slice(0, 120),
      updatedAt: nowMs,
    });
    return { status: exhausted ? ("needs_attention" as const) : ("retry_scheduled" as const) };
  },
});

export const resumeCommunityWeeklyDigestScheduleInternal = internalMutation({
  args: {
    scheduleId: v.id("communityWeeklyDigestSchedules"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = Number.isFinite(args.nowMs) ? Math.floor(args.nowMs as number) : Date.now();
    const row = await ctx.db.get(args.scheduleId);
    if (!row) return { status: "missing" as const };
    if (row.status !== "paused" && row.status !== "needs_attention") {
      return { status: row.status };
    }
    const community = await ctx.db.get(row.communityId);
    if (!community || !communityIsActive(community)) {
      await pauseInvalidCommunitySchedule(ctx, row, nowMs);
      return { status: "community_inactive" as const };
    }
    const lifecycle = normalizeCommunityLifecycle(community);
    await ctx.db.patch(row._id, {
      communityLifecycleGeneration: lifecycle.generation,
      status: "scheduled",
      nextAttemptAt: nowMs,
      failureCount: 0,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: undefined,
      recipientCursor: undefined,
      periodStartDay: undefined,
      periodEndDay: undefined,
      digestSnapshot: undefined,
      updatedAt: nowMs,
    });
    return { status: "scheduled" as const };
  },
});
