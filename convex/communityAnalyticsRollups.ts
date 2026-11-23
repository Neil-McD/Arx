// Pre-computed daily community analytics rollups, live community billing
// summaries, and pre-computed Discover activity stats.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { communityMembershipRowIsActive } from "./communityCore";
import { BASE_TIER_KEY } from "./communityTiers";
import { communityLooksFinished, computeCommunityDiscoverActivity } from "./communityPublic";
import { communityIsActive } from "../shared/communityLifecycle";

const ACTIVE_RECURRING_STATUSES = ["active", "past_due", "cancel_at_period_end"] as const;
const BACKFILL_BATCH_SIZE = 200;
const SWEEP_COMMUNITIES_PAGE_SIZE = 50;
const SWEEP_MAX_PER_RUN = 5;
const DISCOVER_ACTIVITY_BATCH_SIZE = 20;

export function analyticsDayBucket(ms: number): { dayKey: string; dayStartMs: number } {
  const safeMs = Number.isFinite(ms) ? ms : Date.now();
  const date = new Date(safeMs);
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const dayKey = new Date(start).toISOString().slice(0, 10);
  return { dayKey, dayStartMs: start };
}

export async function incrementCommunityDailyAnalytics(
  ctx: any,
  args: {
    communityId: any;
    nowMs: number;
    visitsDelta?: number;
    joinStartsDelta?: number;
    newMembersDelta?: number;
    mrrBaseUnits?: number | null;
    fromBackfill?: boolean;
  },
): Promise<void> {
  const visitsDelta = Math.floor(args.visitsDelta ?? 0);
  const joinStartsDelta = Math.floor(args.joinStartsDelta ?? 0);
  const newMembersDelta = Math.floor(args.newMembersDelta ?? 0);
  const hasMrr = typeof args.mrrBaseUnits === "number" && Number.isFinite(args.mrrBaseUnits);
  if (visitsDelta === 0 && joinStartsDelta === 0 && newMembersDelta === 0 && !hasMrr) return;

  // Fence live additive increments against historical backfill so events on or
  // before the backfill cutoff are never double-counted.
  if (!args.fromBackfill) {
    const community = await ctx.db.get(args.communityId);
    if (!community) return;
    if (typeof (community as any).analyticsRollupIndexedAt !== "number") {
      const cutoffMs = (community as any).analyticsRollupBackfillCutoffMs;
      if (typeof cutoffMs !== "number" || args.nowMs <= cutoffMs) return;
    }
  }

  const { dayKey, dayStartMs } = analyticsDayBucket(args.nowMs);
  const existing = await ctx.db
    .query("communityDailyAnalytics")
    .withIndex("by_community_dayKey", (q: any) =>
      q.eq("communityId", args.communityId).eq("dayKey", dayKey),
    )
    .first();

  const mrrPatch = hasMrr
    ? { mrrBaseUnits: Math.max(0, Math.floor(args.mrrBaseUnits!)), hasMrrSnapshot: true }
    : {};

  if (existing) {
    await ctx.db.patch(existing._id, {
      visits: Math.max(0, Number(existing.visits ?? 0) + visitsDelta),
      joinStarts: Math.max(0, Number(existing.joinStarts ?? 0) + joinStartsDelta),
      newMembers: Math.max(0, Number(existing.newMembers ?? 0) + newMembersDelta),
      ...mrrPatch,
      updatedAt: args.nowMs,
    });
    return;
  }

  await ctx.db.insert("communityDailyAnalytics", {
    communityId: args.communityId,
    dayKey,
    dayStartMs,
    visits: Math.max(0, visitsDelta),
    joinStarts: Math.max(0, joinStartsDelta),
    newMembers: Math.max(0, newMembersDelta),
    ...mrrPatch,
    updatedAt: args.nowMs,
  });
}

// Zero-write fast path when no billing summary exists for an unindexed
// community or when it is already marked stale (while still fencing writes
// that arrive mid-recomputation and self-healing indexed communities).
export async function markCommunityBillingSummaryStale(
  ctx: any,
  communityId: any,
  nowMs: number,
): Promise<void> {
  const existing = await ctx.db
    .query("communityBillingSummary")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .first();
  if (!existing) {
    const community = await ctx.db.get(communityId);
    if (typeof (community as any)?.analyticsRollupIndexedAt !== "number") return;
    await ctx.db.insert("communityBillingSummary", {
      communityId,
      mrrBaseUnits: 0,
      mixedCurrency: false,
      activePaidMembers: 0,
      paidUserCount: 0,
      plans: [],
      computedAt: 0,
      staleAt: nowMs,
      dirtyWhileRecomputing: false,
    });
    return;
  }
  if (typeof existing.recomputingStartedAt === "number") {
    if (existing.dirtyWhileRecomputing) return;
    await ctx.db.patch(existing._id, {
      staleAt: nowMs,
      dirtyWhileRecomputing: true,
    });
    return;
  }
  if (typeof existing.staleAt === "number") return;
  await ctx.db.patch(existing._id, { staleAt: nowMs });
}

export const recomputeCommunityBillingSummaryInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    startedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community) return { ok: false as const };
    const startedAt = args.startedAt ?? Date.now();

    // Establish recomputation fence so concurrent writes are never lost.
    const existingFence = await ctx.db
      .query("communityBillingSummary")
      .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
      .first();
    if (existingFence) {
      await ctx.db.patch(existingFence._id, {
        recomputingStartedAt: startedAt,
        dirtyWhileRecomputing: false,
      });
    } else {
      await ctx.db.insert("communityBillingSummary", {
        communityId: args.communityId,
        mrrBaseUnits: 0,
        mixedCurrency: false,
        activePaidMembers: 0,
        paidUserCount: 0,
        plans: [],
        computedAt: 0,
        staleAt: startedAt,
        recomputingStartedAt: startedAt,
        dirtyWhileRecomputing: false,
      });
    }

    const [activeSubs, pastDueSubs, cancellingSubs, appGrants, pricePoints, tiers] = await Promise.all([
      ctx.db
        .query("communitySubscriptions")
        .withIndex("by_community_status", (q) => q.eq("communityId", args.communityId).eq("status", "active"))
        .take(5_000),
      ctx.db
        .query("communitySubscriptions")
        .withIndex("by_community_status", (q) => q.eq("communityId", args.communityId).eq("status", "past_due"))
        .take(5_000),
      ctx.db
        .query("communitySubscriptions")
        .withIndex("by_community_status", (q) => q.eq("communityId", args.communityId).eq("status", "cancel_at_period_end"))
        .take(5_000),
      ctx.db
        .query("communityAppGrants")
        .withIndex("by_community_user", (q) => q.eq("communityId", args.communityId))
        .take(5_000),
      ctx.db
        .query("communityPricePoints")
        .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
        .take(200),
      ctx.db
        .query("communityTiers")
        .withIndex("by_community_key", (q) => q.eq("communityId", args.communityId))
        .take(100),
    ]);

    const priceById = new Map<string, any>(pricePoints.map((p) => [String(p._id), p]));
    const tierNameByKey = new Map<string, string>(
      tiers.map((t) => [String(t.key), String(t.name ?? "").trim() || "Membership"]),
    );

    const recurring = [...activeSubs, ...pastDueSubs, ...cancellingSubs];
    let mrrBaseUnits = 0;
    let currency: string | undefined;
    let currencyDecimals: number | undefined;
    let mixedCurrency = false;
    const planTotals = new Map<string, { mrr: number; users: Set<string> }>();

    for (const subscription of recurring) {
      let pricePoint = priceById.get(String(subscription.pricePointId));
      if (pricePoint === undefined) {
        pricePoint = (await ctx.db.get(subscription.pricePointId)) ?? null;
        priceById.set(String(subscription.pricePointId), pricePoint);
      }
      if (!pricePoint) continue;
      const rowCurrency = String(pricePoint.currency ?? "").trim().toUpperCase() || undefined;
      const rowDecimals = Math.max(0, Math.floor(pricePoint.currencyDecimals ?? 0));
      if (currency && rowCurrency && currency !== rowCurrency) mixedCurrency = true;
      currency = currency ?? rowCurrency;
      currencyDecimals = currencyDecimals ?? rowDecimals;
      const period = String(pricePoint.billingPeriod ?? "").trim().toLowerCase();
      const monthlyBaseUnits =
        period === "annual"
          ? Math.round(Math.max(0, pricePoint.amountBaseUnits) / 12)
          : Math.max(0, Math.floor(pricePoint.amountBaseUnits));
      mrrBaseUnits += monthlyBaseUnits;
      const planKey = String(pricePoint.tierKey ?? BASE_TIER_KEY);
      const plan = planTotals.get(planKey) ?? { mrr: 0, users: new Set<string>() };
      plan.mrr += monthlyBaseUnits;
      plan.users.add(String(subscription.userId ?? subscription._id));
      planTotals.set(planKey, plan);
    }

    // Active connected-app grants for active members (checked in parallel chunks).
    const activeGrantRows = appGrants.filter((g) => g.active && g.userId);
    for (let i = 0; i < activeGrantRows.length; i += 25) {
      const chunk = activeGrantRows.slice(i, i + 25);
      const memberships = await Promise.all(
        chunk.map((g) =>
          String(g.userId) === String(community.ownerId)
            ? Promise.resolve({ owner: true })
            : ctx.db
                .query("communityMemberships")
                .withIndex("by_community_user", (q) =>
                  q.eq("communityId", args.communityId).eq("userId", g.userId!),
                )
                .first(),
        ),
      );
      for (let j = 0; j < chunk.length; j += 1) {
        const grant = chunk[j]!;
        const mem = memberships[j] as any;
        if (!mem) continue;
        if (!mem.owner && !communityMembershipRowIsActive(mem)) continue;
        const planKey = String(grant.tierKey ?? BASE_TIER_KEY);
        const plan = planTotals.get(planKey) ?? { mrr: 0, users: new Set<string>() };
        plan.users.add(String(grant.userId));
        planTotals.set(planKey, plan);
      }
    }

    const paidUsers = new Set<string>();
    const plans: Array<{ key: string; name: string; members: number; mrr_base_units: number | null }> = [];
    for (const [key, plan] of planTotals) {
      plan.users.forEach((id) => paidUsers.add(id));
      plans.push({
        key,
        name: tierNameByKey.get(key) ?? "Membership",
        members: plan.users.size,
        mrr_base_units: mixedCurrency ? null : plan.mrr,
      });
    }
    plans.sort((a, b) => (b.mrr_base_units ?? 0) - (a.mrr_base_units ?? 0) || b.members - a.members);

    const nowMs = Date.now();
    const existing = await ctx.db
      .query("communityBillingSummary")
      .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
      .first();
    const interrupted =
      Boolean(existing?.dirtyWhileRecomputing) ||
      (typeof existing?.staleAt === "number" && existing.staleAt > startedAt);

    const payload = {
      mrrBaseUnits: mixedCurrency ? 0 : mrrBaseUnits,
      currency: mixedCurrency ? undefined : currency,
      currencyDecimals: mixedCurrency ? undefined : currencyDecimals,
      mixedCurrency,
      activePaidMembers: recurring.length,
      paidUserCount: paidUsers.size,
      plans,
      computedAt: nowMs,
      staleAt: interrupted ? nowMs : undefined,
      recomputingStartedAt: undefined,
      dirtyWhileRecomputing: false,
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("communityBillingSummary", {
        communityId: args.communityId,
        ...payload,
      });
    }

    if (!mixedCurrency) {
      await incrementCommunityDailyAnalytics(ctx, {
        communityId: args.communityId,
        nowMs,
        mrrBaseUnits,
        fromBackfill: true,
      });
    }

    return { ok: true as const, mrrBaseUnits: mixedCurrency ? null : mrrBaseUnits };
  },
});

// Multi-phase historical backfill for communityDailyAnalytics:
// phase 0: clear obsolete daily rows and establish cutoffMs fence
// phase 1: paginate funnel_visit events (createdAt <= cutoffMs)
// phase 2: paginate funnel_join_started events (createdAt <= cutoffMs)
// phase 3: paginate active non-owner memberships (createdAt <= cutoffMs)
// phase 4: reconstruct historical daily MRR snapshots from subscriptions
export const backfillCommunityDailyAnalyticsBatchInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    phase: v.union(
      v.literal("clear"),
      v.literal("visits"),
      v.literal("join_starts"),
      v.literal("members"),
      v.literal("revenue"),
    ),
    cursor: v.union(v.string(), v.null()),
    cutoffMs: v.optional(v.number()),
    revenueAcc: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community) return { done: true };
    const nowMs = Date.now();

    if (args.phase === "clear") {
      const obsolete = await ctx.db
        .query("communityDailyAnalytics")
        .withIndex("by_community_dayStartMs", (q) => q.eq("communityId", args.communityId))
        .take(BACKFILL_BATCH_SIZE);
      for (const row of obsolete) await ctx.db.delete(row._id);
      if (obsolete.length >= BACKFILL_BATCH_SIZE) {
        await ctx.scheduler.runAfter(0, (internal as any).communityAnalyticsRollups.backfillCommunityDailyAnalyticsBatchInternal, {
          communityId: args.communityId,
          phase: "clear",
          cursor: null,
        });
        return { done: false };
      }
      const cutoffMs = nowMs;
      await ctx.db.patch(args.communityId, {
        analyticsRollupBackfillStartedAt: cutoffMs,
        analyticsRollupBackfillCutoffMs: cutoffMs,
      });
      await ctx.scheduler.runAfter(0, (internal as any).communityAnalyticsRollups.backfillCommunityDailyAnalyticsBatchInternal, {
        communityId: args.communityId,
        phase: "visits",
        cursor: null,
        cutoffMs,
      });
      return { done: false };
    }

    const cutoffMs = args.cutoffMs ?? (community as any).analyticsRollupBackfillCutoffMs ?? nowMs;

    if (args.phase === "visits" || args.phase === "join_starts") {
      const eventType = args.phase === "visits" ? "funnel_visit" : "funnel_join_started";
      const page = await ctx.db
        .query("communityAnalyticsEvents")
        .withIndex("by_community_event_createdAt", (q) =>
          q.eq("communityId", args.communityId).eq("eventType", eventType).lte("createdAt", cutoffMs),
        )
        .paginate({ cursor: args.cursor, numItems: BACKFILL_BATCH_SIZE });

      const countsByDay = new Map<string, { dayStartMs: number; count: number }>();
      for (const row of page.page) {
        const bucket = analyticsDayBucket(row.createdAt);
        const entry = countsByDay.get(bucket.dayKey) ?? { dayStartMs: bucket.dayStartMs, count: 0 };
        entry.count += 1;
        countsByDay.set(bucket.dayKey, entry);
      }
      for (const { dayStartMs, count } of countsByDay.values()) {
        await incrementCommunityDailyAnalytics(ctx, {
          communityId: args.communityId,
          nowMs: dayStartMs,
          ...(args.phase === "visits" ? { visitsDelta: count } : { joinStartsDelta: count }),
          fromBackfill: true,
        });
      }

      if (!page.isDone) {
        await ctx.scheduler.runAfter(0, (internal as any).communityAnalyticsRollups.backfillCommunityDailyAnalyticsBatchInternal, {
          communityId: args.communityId,
          phase: args.phase,
          cursor: page.continueCursor,
          cutoffMs,
        });
        return { done: false };
      }

      const nextPhase = args.phase === "visits" ? "join_starts" : "members";
      await ctx.scheduler.runAfter(0, (internal as any).communityAnalyticsRollups.backfillCommunityDailyAnalyticsBatchInternal, {
        communityId: args.communityId,
        phase: nextPhase,
        cursor: null,
        cutoffMs,
      });
      return { done: false };
    }

    if (args.phase === "members") {
      const page = await ctx.db
        .query("communityMemberships")
        .withIndex("by_community_createdAt", (q) =>
          q.eq("communityId", args.communityId).lte("createdAt", cutoffMs),
        )
        .order("asc")
        .paginate({ cursor: args.cursor, numItems: BACKFILL_BATCH_SIZE });

      const countsByDay = new Map<string, { dayStartMs: number; count: number }>();
      for (const row of page.page) {
        if (String(row.userId) === String(community.ownerId)) continue;
        if (!communityMembershipRowIsActive(row as any)) continue;
        const bucket = analyticsDayBucket(row.createdAt);
        const entry = countsByDay.get(bucket.dayKey) ?? { dayStartMs: bucket.dayStartMs, count: 0 };
        entry.count += 1;
        countsByDay.set(bucket.dayKey, entry);
      }
      for (const { dayStartMs, count } of countsByDay.values()) {
        await incrementCommunityDailyAnalytics(ctx, {
          communityId: args.communityId,
          nowMs: dayStartMs,
          newMembersDelta: count,
          fromBackfill: true,
        });
      }

      if (!page.isDone) {
        await ctx.scheduler.runAfter(0, (internal as any).communityAnalyticsRollups.backfillCommunityDailyAnalyticsBatchInternal, {
          communityId: args.communityId,
          phase: "members",
          cursor: page.continueCursor,
          cutoffMs,
        });
        return { done: false };
      }

      await ctx.scheduler.runAfter(0, (internal as any).communityAnalyticsRollups.backfillCommunityDailyAnalyticsBatchInternal, {
        communityId: args.communityId,
        phase: "revenue",
        cursor: null,
        cutoffMs,
      });
      return { done: false };
    }

    // phase === "revenue": reconstruct historical daily MRR snapshots
    const revAcc: {
      currency: string | null;
      mixedCurrency: boolean;
      deltasByDay: Record<string, number>;
    } = args.revenueAcc
      ? {
          currency: args.revenueAcc.currency ?? null,
          mixedCurrency: Boolean(args.revenueAcc.mixedCurrency),
          deltasByDay: { ...(args.revenueAcc.deltasByDay ?? {}) },
        }
      : { currency: null, mixedCurrency: false, deltasByDay: {} };

    const [page, pricePoints] = await Promise.all([
      ctx.db
        .query("communitySubscriptions")
        .withIndex("by_community_status", (q) => q.eq("communityId", args.communityId))
        .paginate({ cursor: args.cursor, numItems: BACKFILL_BATCH_SIZE }),
      ctx.db
        .query("communityPricePoints")
        .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
        .take(200),
    ]);
    const priceById = new Map<string, any>(pricePoints.map((p) => [String(p._id), p]));
    const cutoffDayStartMs = analyticsDayBucket(cutoffMs).dayStartMs;

    for (const sub of page.page) {
      if (Number(sub.createdAt ?? 0) > cutoffMs) continue;
      const status = String(sub.status ?? "");
      const isCurrentRecurring = (ACTIVE_RECURRING_STATUSES as readonly string[]).includes(status);
      const endedAtRaw = Number((sub as any).endedAt ?? NaN);
      const endedAt = Number.isFinite(endedAtRaw)
        ? endedAtRaw
        : isCurrentRecurring
          ? null
          : Number(sub.updatedAt ?? NaN);
      if (!isCurrentRecurring && !Number.isFinite(Number(endedAt))) continue;

      let pricePoint = priceById.get(String(sub.pricePointId));
      if (pricePoint === undefined) {
        pricePoint = (await ctx.db.get(sub.pricePointId)) ?? null;
        priceById.set(String(sub.pricePointId), pricePoint);
      }
      if (!pricePoint) continue;
      const rowCurrency = String(pricePoint.currency ?? "").trim().toUpperCase() || null;
      if (revAcc.currency && rowCurrency && revAcc.currency !== rowCurrency) {
        revAcc.mixedCurrency = true;
      }
      revAcc.currency = revAcc.currency ?? rowCurrency;
      const period = String(pricePoint.billingPeriod ?? "").trim().toLowerCase();
      const monthlyBaseUnits =
        period === "annual"
          ? Math.round(Math.max(0, Number(pricePoint.amountBaseUnits ?? 0)) / 12)
          : Math.max(0, Math.floor(Number(pricePoint.amountBaseUnits ?? 0)));
      if (monthlyBaseUnits <= 0) continue;

      const startDay = analyticsDayBucket(sub.createdAt).dayStartMs;
      revAcc.deltasByDay[String(startDay)] = (revAcc.deltasByDay[String(startDay)] ?? 0) + monthlyBaseUnits;
      if (endedAt != null && endedAt <= cutoffMs) {
        const nextDayAfterEnd = analyticsDayBucket(endedAt).dayStartMs + 86_400_000;
        if (nextDayAfterEnd <= cutoffDayStartMs) {
          revAcc.deltasByDay[String(nextDayAfterEnd)] =
            (revAcc.deltasByDay[String(nextDayAfterEnd)] ?? 0) - monthlyBaseUnits;
        }
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, (internal as any).communityAnalyticsRollups.backfillCommunityDailyAnalyticsBatchInternal, {
        communityId: args.communityId,
        phase: "revenue",
        cursor: page.continueCursor,
        cutoffMs,
        revenueAcc: revAcc,
      });
      return { done: false };
    }

    if (!revAcc.mixedCurrency) {
      const sortedDays = Object.keys(revAcc.deltasByDay)
        .map((k) => Number(k))
        .filter((ms) => Number.isFinite(ms))
        .sort((a, b) => a - b);
      let runningMrr = 0;
      for (const dayStartMs of sortedDays) {
        runningMrr = Math.max(0, runningMrr + (revAcc.deltasByDay[String(dayStartMs)] ?? 0));
        await incrementCommunityDailyAnalytics(ctx, {
          communityId: args.communityId,
          nowMs: dayStartMs,
          mrrBaseUnits: runningMrr,
          fromBackfill: true,
        });
      }
    }

    await ctx.db.patch(args.communityId, {
      analyticsRollupIndexedAt: nowMs,
      analyticsRollupBackfillStartedAt: undefined,
      analyticsRollupBackfillCutoffMs: undefined,
    });
    await ctx.scheduler.runAfter(0, (internal as any).communityAnalyticsRollups.recomputeCommunityBillingSummaryInternal, {
      communityId: args.communityId,
      startedAt: nowMs,
    });
    return { done: true };
  },
});

// Cron sweep: refreshes stale communityBillingSummary rows and backfills
// unindexed communities into communityDailyAnalytics.
export const sweepCommunityAnalyticsRollupsInternal = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    scheduledSoFar: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    let scheduled = Math.max(0, Math.floor(args.scheduledSoFar ?? 0));

    if (!args.cursor && scheduled === 0) {
      const staleBilling = await ctx.db
        .query("communityBillingSummary")
        .withIndex("by_staleAt", (q) => q.gt("staleAt", 0))
        .take(SWEEP_MAX_PER_RUN);
      for (const row of staleBilling) {
        if (scheduled >= SWEEP_MAX_PER_RUN) break;
        await ctx.scheduler.runAfter(0, (internal as any).communityAnalyticsRollups.recomputeCommunityBillingSummaryInternal, {
          communityId: row.communityId,
          startedAt: nowMs,
        });
        scheduled += 1;
      }
      if (scheduled >= SWEEP_MAX_PER_RUN) return { done: false, scheduled };
    }

    const page = await ctx.db
      .query("communities")
      .paginate({ cursor: args.cursor ?? null, numItems: SWEEP_COMMUNITIES_PAGE_SIZE });

    for (const community of page.page) {
      if (scheduled >= SWEEP_MAX_PER_RUN) break;
      if (community.lifecycleStatus === "archived") continue;
      if (typeof (community as any).analyticsRollupIndexedAt === "number") continue;
      const startedAt = (community as any).analyticsRollupBackfillStartedAt;
      if (typeof startedAt === "number" && nowMs - startedAt < 10 * 60_000) continue;
      await ctx.db.patch(community._id, {
        analyticsRollupBackfillStartedAt: nowMs,
        analyticsRollupBackfillCutoffMs: undefined,
      });
      await ctx.scheduler.runAfter(0, (internal as any).communityAnalyticsRollups.backfillCommunityDailyAnalyticsBatchInternal, {
        communityId: community._id,
        phase: "clear",
        cursor: null,
      });
      scheduled += 1;
    }

    if (!page.isDone && scheduled < SWEEP_MAX_PER_RUN) {
      await ctx.scheduler.runAfter(0, (internal as any).communityAnalyticsRollups.sweepCommunityAnalyticsRollupsInternal, {
        cursor: page.continueCursor,
        scheduledSoFar: scheduled,
      });
      return { done: false, scheduled };
    }

    return { done: page.isDone, scheduled };
  },
});

// Pre-computes Discover card 7-day activity stats for published, finished communities
// in paginated batches so listPublicDiscoverCommunities runs in O(1) reads per card.
export const refreshDiscoverActivityStatsBatchInternal = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const page = await ctx.db
      .query("communities")
      .withIndex("by_visibility_updatedAt", (q) => q.eq("visibility", "published"))
      .order("desc")
      .paginate({ cursor: args.cursor ?? null, numItems: DISCOVER_ACTIVITY_BATCH_SIZE });

    let updated = 0;
    for (const community of page.page) {
      if (!communityIsActive(community as any) || !communityLooksFinished(community as any)) {
        continue;
      }
      const stats = await computeCommunityDiscoverActivity(ctx, community._id, nowMs);
      await ctx.db.patch(community._id, {
        discoverLastActiveAt: stats.lastActiveAt ?? undefined,
        discoverPosts7dCount: stats.postsThisWeek,
        discoverActivityComputedAt: nowMs,
      });
      updated += 1;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, (internal as any).communityAnalyticsRollups.refreshDiscoverActivityStatsBatchInternal, {
        cursor: page.continueCursor,
      });
    }

    return { done: page.isDone, updated };
  },
});
