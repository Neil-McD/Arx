import { BASE_TIER_KEY } from "./communityHeldTiers";
import { formatMoneyBaseUnits } from "../shared/contentFormatting";
import {
  type CommunityLike,
  type CommunityMembershipLike,
  type CommunityPricePointLike,
  type CommunitySubscriptionLike,
  communityMembershipRowIsActive,
  readCommunityActiveMemberCount,
  toIsoString,
} from "./communityCore";
import { analyticsDayBucket } from "./communityAnalyticsRollups";

export type AnalyticsRangeValue = "7d" | "30d" | "90d" | "1y" | "all";
export type AnalyticsBucketValue = "day" | "week" | "month";
export type AnalyticsPointOutput = {
  label: string;
  value: number;
};

const MAX_ANALYTICS_SNAPSHOT_EVENT_ROWS = 10_000;
const ACTIVE_RECURRING_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "past_due",
  "cancel_at_period_end",
]);

export function normalizeAnalyticsRange(rawRange: unknown): AnalyticsRangeValue {
  const range = String(rawRange ?? "30d").trim();
  return range === "7d" || range === "90d" || range === "1y" || range === "all"
    ? range
    : "30d";
}

export function resolveAnalyticsWindowStartMs(params: {
  range: AnalyticsRangeValue;
  nowMs: number;
  communityCreatedAt: number;
}): number {
  if (params.range === "7d") return params.nowMs - 7 * 86400000;
  if (params.range === "90d") return params.nowMs - 90 * 86400000;
  if (params.range === "1y") return params.nowMs - 365 * 86400000;
  if (params.range === "all") return params.communityCreatedAt;
  return params.nowMs - 30 * 86400000;
}

export function resolveAnalyticsBucket(range: AnalyticsRangeValue): AnalyticsBucketValue {
  return range === "7d" || range === "30d" ? "day" : range === "90d" ? "week" : "month";
}

export function startOfAnalyticsBucket(ms: number, bucket: AnalyticsBucketValue): Date {
  const date = new Date(ms);
  if (bucket === "month") return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12));
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
  if (bucket === "week") {
    const day = start.getUTCDay();
    const diff = (day + 6) % 7;
    start.setUTCDate(start.getUTCDate() - diff);
  }
  return start;
}

export function addAnalyticsBucket(date: Date, bucket: AnalyticsBucketValue): Date {
  if (bucket === "month") return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 12));
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + (bucket === "week" ? 7 : 1));
  return next;
}

export function buildAnalyticsBucketStarts(params: {
  startMs: number;
  endMs: number;
  bucket: AnalyticsBucketValue;
}): Date[] {
  const starts: Date[] = [];
  for (
    let cursor = startOfAnalyticsBucket(params.startMs, params.bucket);
    cursor.getTime() <= params.endMs && starts.length < 500;
    cursor = addAnalyticsBucket(cursor, params.bucket)
  ) {
    starts.push(cursor);
  }
  return starts;
}

export function analyticsBucketLabel(date: Date, bucket: AnalyticsBucketValue): string {
  if (bucket === "month") {
    return date.toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    });
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function buildAnalyticsCountSeries(params: {
  rows: Array<{ createdAt: number }>;
  bucketStarts: Date[];
  bucket: AnalyticsBucketValue;
}): AnalyticsPointOutput[] {
  const counts = new Map<number, number>();
  const firstBucketStartMs = params.bucketStarts[0]?.getTime() ?? 0;
  for (const row of params.rows) {
    if (!Number.isFinite(row.createdAt) || row.createdAt < firstBucketStartMs) continue;
    const bucketStartMs = startOfAnalyticsBucket(row.createdAt, params.bucket).getTime();
    counts.set(bucketStartMs, (counts.get(bucketStartMs) ?? 0) + 1);
  }
  return params.bucketStarts.map((bucketStart) => ({
    label: analyticsBucketLabel(bucketStart, params.bucket),
    value: counts.get(bucketStart.getTime()) ?? 0,
  }));
}

export function buildAnalyticsRecurringRevenueSeries(params: {
  rows: Array<{
    createdAt: number;
    endedAt: number | null;
    amountBaseUnits: number;
  }>;
  bucketStarts: Date[];
  bucket: AnalyticsBucketValue;
  nowMs: number;
}): AnalyticsPointOutput[] {
  return params.bucketStarts.map((bucketStart, index) => {
    const nextBucketStart =
      params.bucketStarts[index + 1] ?? addAnalyticsBucket(bucketStart, params.bucket);
    const bucketStartMs = bucketStart.getTime();
    const bucketEndMs = Math.min(nextBucketStart.getTime() - 1, params.nowMs);
    const value = params.rows.reduce((sum, row) => {
      if (row.createdAt > bucketEndMs) return sum;
      if (row.endedAt != null && row.endedAt < bucketStartMs) return sum;
      return sum + row.amountBaseUnits;
    }, 0);
    return {
      label: analyticsBucketLabel(bucketStart, params.bucket),
      value,
    };
  });
}

export type CommunityAnalyticsSnapshot = Awaited<ReturnType<typeof computeCommunityAnalyticsSnapshot>>;

export async function tryComputeCommunityAnalyticsFromRollups(ctx: any, args: {
  communityId: any;
  community: CommunityLike;
  range: AnalyticsRangeValue;
  nowMs: number;
}): Promise<CommunityAnalyticsSnapshot | null> {
  const { community, range, nowMs } = args;
  if (typeof (community as any).analyticsRollupIndexedAt !== "number") return null;
  const billingSummary = await ctx.db
    .query("communityBillingSummary" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
    .first();
  if (!billingSummary || billingSummary.staleAt !== undefined) return null;

  const sinceMs = resolveAnalyticsWindowStartMs({
    range,
    nowMs,
    communityCreatedAt: community.createdAt,
  });
  const bucket = resolveAnalyticsBucket(range);
  const bucketStarts = buildAnalyticsBucketStarts({
    startMs: sinceMs,
    endMs: nowMs,
    bucket,
  });
  const windowStartDayMs = analyticsDayBucket(sinceMs).dayStartMs;

  const [dailyRows, openingMrrRow, presenceRows] = await Promise.all([
    ctx.db
      .query("communityDailyAnalytics" as any)
      .withIndex("by_community_dayStartMs", (q: any) =>
        q.eq("communityId", args.communityId).gte("dayStartMs", windowStartDayMs),
      )
      .take(4_000) as Promise<
      Array<{
        dayStartMs: number;
        visits: number;
        joinStarts: number;
        newMembers: number;
        mrrBaseUnits?: number;
      }>
    >,
    ctx.db
      .query("communityDailyAnalytics" as any)
      .withIndex("by_community_hasMrr_dayStartMs", (q: any) =>
        q
          .eq("communityId", args.communityId)
          .eq("hasMrrSnapshot", true)
          .lt("dayStartMs", windowStartDayMs),
      )
      .order("desc")
      .first() as Promise<{ mrrBaseUnits?: number } | null>,
    ctx.db
      .query("communityPresence" as any)
      .withIndex("by_community_lastSeenAt", (q: any) =>
        q.eq("communityId", args.communityId).gte("lastSeenAt", sinceMs),
      )
      .take(MAX_ANALYTICS_SNAPSHOT_EVENT_ROWS) as Promise<
      Array<{
        userId: any;
        lastSeenAt: number;
        createdAt: number;
        activeUntil?: number;
      }>
    >,
  ]);

  let visitsTotal = 0;
  let joinStartsTotal = 0;
  let newMembersTotal = 0;
  const visitsByBucket = new Map<number, number>();
  const membersByBucket = new Map<number, number>();
  const revenueByBucket = new Map<number, number>();
  for (const dayRow of dailyRows) {
    if (dayRow.dayStartMs > nowMs) continue;
    visitsTotal += Number(dayRow.visits ?? 0);
    joinStartsTotal += Number(dayRow.joinStarts ?? 0);
    newMembersTotal += Number(dayRow.newMembers ?? 0);
    const bucketKey = startOfAnalyticsBucket(dayRow.dayStartMs, bucket).getTime();
    visitsByBucket.set(bucketKey, (visitsByBucket.get(bucketKey) ?? 0) + Number(dayRow.visits ?? 0));
    membersByBucket.set(bucketKey, (membersByBucket.get(bucketKey) ?? 0) + Number(dayRow.newMembers ?? 0));
    if (typeof dayRow.mrrBaseUnits === "number" && Number.isFinite(dayRow.mrrBaseUnits)) {
      revenueByBucket.set(bucketKey, dayRow.mrrBaseUnits);
    }
  }

  // Verify active membership only for recently active presence rows (parallel chunks).
  const candidatePresenceUsers = Array.from(
    new Map(
      presenceRows
        .filter((row) => row.activeUntil != null || row.lastSeenAt > row.createdAt)
        .map((row) => [String(row.userId), row.userId]),
    ).values(),
  );
  let activeMembers = 0;
  for (let i = 0; i < candidatePresenceUsers.length; i += 25) {
    const chunk = candidatePresenceUsers.slice(i, i + 25);
    const checks = await Promise.all(
      chunk.map(async (uid) => {
        if (String(uid) === String(community.ownerId)) return true;
        const mem = await ctx.db
          .query("communityMemberships" as any)
          .withIndex("by_community_user", (q: any) =>
            q.eq("communityId", args.communityId).eq("userId", uid),
          )
          .first();
        return Boolean(mem && communityMembershipRowIsActive(mem));
      }),
    );
    for (const ok of checks) if (ok) activeMembers += 1;
  }

  const totalMembers = Math.max(1, readCommunityActiveMemberCount(community) ?? 1);
  const plans: Array<{ key: string; name: string; members: number; mrr_base_units: number | null }> =
    (billingSummary.plans ?? []).map((p: any) => ({ ...p }));
  const freeMembers = Math.max(0, totalMembers - Number(billingSummary.paidUserCount ?? 0));
  if (freeMembers > 0) plans.push({ key: "free", name: "Free", members: freeMembers, mrr_base_units: 0 });

  const mixedCurrency = Boolean(billingSummary.mixedCurrency);
  const currentMrr = mixedCurrency ? null : Number(billingSummary.mrrBaseUnits ?? 0);
  const openingMrrFromRollup =
    typeof openingMrrRow?.mrrBaseUnits === "number" && Number.isFinite(openingMrrRow.mrrBaseUnits)
      ? openingMrrRow.mrrBaseUnits
      : null;
  let carriedMrr =
    openingMrrFromRollup != null
      ? openingMrrFromRollup
      : revenueByBucket.size === 0 &&
          currentMrr != null &&
          currentMrr > 0 &&
          Number(billingSummary.computedAt ?? 0) < windowStartDayMs
        ? currentMrr
        : 0;
  const revenueSeries = mixedCurrency
    ? []
    : bucketStarts.map((bucketStart, index) => {
        const key = bucketStart.getTime();
        if (revenueByBucket.has(key)) {
          carriedMrr = revenueByBucket.get(key)!;
        } else if (index === bucketStarts.length - 1 && currentMrr != null) {
          carriedMrr = currentMrr;
        }
        return {
          bucket_start: bucketStart.toISOString(),
          label: analyticsBucketLabel(bucketStart, bucket),
          value: carriedMrr,
        };
      });

  return {
    range,
    bucket,
    generated_at: toIsoString(nowMs),
    summary: {
      plans,
      page_visits_window: visitsTotal,
      join_starts_window: joinStartsTotal,
      total_members: totalMembers,
      new_members_window: newMembersTotal,
      conversion_rate_window: visitsTotal > 0 ? newMembersTotal / visitsTotal : null,
      mrr_base_units: currentMrr,
      currency: mixedCurrency ? null : (billingSummary.currency ?? null),
      currency_decimals: mixedCurrency ? null : (billingSummary.currencyDecimals ?? null),
      active_members_window: activeMembers,
      retention_window: null,
      total_resources: null,
      resources_added_window: null,
    },
    series: {
      visits: bucketStarts.map((bucketStart) => ({
        bucket_start: bucketStart.toISOString(),
        label: analyticsBucketLabel(bucketStart, bucket),
        value: visitsByBucket.get(bucketStart.getTime()) ?? 0,
      })),
      members: bucketStarts.map((bucketStart) => ({
        bucket_start: bucketStart.toISOString(),
        label: analyticsBucketLabel(bucketStart, bucket),
        value: membersByBucket.get(bucketStart.getTime()) ?? 0,
      })),
      revenue: revenueSeries,
    },
  };
}

// The figures as the Analytics page words and works them out
// (apps/web/src/v1/KitAnalyticsPage.tsx): kept short, it is read into a model.
export function communityAnalyticsDocument(args: {
  nowMs: number;
  communityCreatedAt: number;
  last30Days: CommunityAnalyticsSnapshot;
  last7Days: CommunityAnalyticsSnapshot;
}) {
  const current = args.last30Days.summary;
  const money = (value: number | null) => formatMoneyBaseUnits(value, current.currency, current.currency_decimals);
  const percent = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;
  // Nothing has ever been paid: no currency to show money in.
  const unpaid = !current.mrr_base_units && !current.currency;
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const window = (snapshot: CommunityAnalyticsSnapshot) => {
    const summary = snapshot.summary;
    const visits = summary.page_visits_window ?? 0;
    const revenue = snapshot.series.revenue;
    const change = revenue.length > 1 && summary.mrr_base_units != null ? summary.mrr_base_units - (revenue[0]?.value ?? 0) : null;
    return {
      from: day(resolveAnalyticsWindowStartMs({ range: snapshot.range, nowMs: args.nowMs, communityCreatedAt: args.communityCreatedAt })),
      to: day(args.nowMs),
      new_members: summary.new_members_window,
      active: `${summary.active_members_window} of ${summary.total_members} (${percent(summary.active_members_window, summary.total_members)})`,
      visits_to_the_join_page: visits,
      started_joining: summary.join_starts_window,
      join_rate: visits > 0 ? `${percent(summary.new_members_window, visits)} of visitors` : "No visits yet",
      ...(unpaid || change == null ? {} : { monthly_revenue_change: change === 0 ? "No change" : `${change < 0 ? "−" : "+"}${money(Math.abs(change))}` }),
    };
  };
  return {
    as_of: new Date(args.nowMs).toISOString(),
    members: current.total_members,
    monthly_revenue: unpaid ? "None: no paid plans yet" : money(current.mrr_base_units),
    by_plan: current.plans.map((plan) => ({
      plan: plan.name,
      members: plan.members,
      ...(plan.mrr_base_units ? { monthly_revenue: `${money(plan.mrr_base_units)}/mo` } : {}),
    })),
    last_30_days: window(args.last30Days),
    last_7_days: window(args.last7Days),
  };
}

export async function computeCommunityAnalyticsSnapshot(ctx: any, args: {
  communityId: any;
  community: CommunityLike;
  rows: CommunityMembershipLike[];
  range: AnalyticsRangeValue;
  nowMs: number;
}) {
  const { community, rows, range, nowMs } = args;
  const sinceMs = resolveAnalyticsWindowStartMs({
    range,
    nowMs,
    communityCreatedAt: community.createdAt,
  });
  const bucket = resolveAnalyticsBucket(range);
  const bucketStarts = buildAnalyticsBucketStarts({
    startMs: sinceMs,
    endMs: nowMs,
    bucket,
  });

  const memberRowsWindow = rows.filter((row) => row.createdAt >= sinceMs);
  const visitRows = (await ctx.db
    .query("communityAnalyticsEvents" as any)
    .withIndex("by_community_event_createdAt", (q: any) =>
      q
        .eq("communityId", args.communityId)
        .eq("eventType", "funnel_visit")
        .gte("createdAt", sinceMs),
    )
    .take(MAX_ANALYTICS_SNAPSHOT_EVENT_ROWS)) as Array<{ createdAt: number }>;
  // Acted on the doorstep: started a checkout, joined or asked to.
  const startedRows = (await ctx.db
    .query("communityAnalyticsEvents" as any)
    .withIndex("by_community_event_createdAt", (q: any) =>
      q
        .eq("communityId", args.communityId)
        .eq("eventType", "funnel_join_started")
        .gte("createdAt", sinceMs),
    )
    .take(MAX_ANALYTICS_SNAPSHOT_EVENT_ROWS)) as Array<{ createdAt: number }>;

  const subscriptions = (await ctx.db
    .query("communitySubscriptions" as any)
    .withIndex("by_community_status", (q: any) => q.eq("communityId", args.communityId))
    .collect()) as CommunitySubscriptionLike[];
  const pricePointCache = new Map<string, CommunityPricePointLike | null>();
  const monthlyRows: Array<{
    createdAt: number;
    endedAt: number | null;
    amountBaseUnits: number;
  }> = [];
  let mrrBaseUnits = 0;
  let currency: string | null = null;
  let currencyDecimals: number | null = null;
  let mixedCurrency = false;
  // Who is on which plan now, by tier key (BASE_TIER_KEY: the base membership).
  const planTotals = new Map<string, { mrr: number; users: Set<string> }>();

  for (const subscription of subscriptions) {
    const status = String(subscription.status ?? "");
    const isCurrentRecurring = ACTIVE_RECURRING_SUBSCRIPTION_STATUSES.has(status);
    const endedAtRaw = Number(subscription.endedAt ?? NaN);
    const endedAt = Number.isFinite(endedAtRaw)
      ? endedAtRaw
      : isCurrentRecurring
        ? null
        : Number(subscription.updatedAt ?? NaN);
    if (!isCurrentRecurring && !Number.isFinite(Number(endedAt))) continue;

    const pricePointId = String(subscription.pricePointId);
    if (!pricePointCache.has(pricePointId)) {
      pricePointCache.set(
        pricePointId,
        (await ctx.db.get(subscription.pricePointId as any)) as CommunityPricePointLike | null,
      );
    }
    const pricePoint = pricePointCache.get(pricePointId);
    if (!pricePoint) continue;
    const rowCurrency = String(pricePoint.currency ?? "").trim().toUpperCase() || null;
    const rowDecimals = Math.max(0, Math.floor(pricePoint.currencyDecimals ?? 0));
    if (currency && rowCurrency && currency !== rowCurrency) mixedCurrency = true;
    currency = currency ?? rowCurrency;
    currencyDecimals = currencyDecimals ?? rowDecimals;
    const period = String(pricePoint.billingPeriod ?? "").trim().toLowerCase();
    const monthlyBaseUnits =
      period === "annual"
        ? Math.round(Math.max(0, pricePoint.amountBaseUnits) / 12)
        : Math.max(0, Math.floor(pricePoint.amountBaseUnits));
    if (isCurrentRecurring) {
      mrrBaseUnits += monthlyBaseUnits;
      const planKey = String(pricePoint.tierKey ?? BASE_TIER_KEY);
      const plan = planTotals.get(planKey) ?? { mrr: 0, users: new Set<string>() };
      plan.mrr += monthlyBaseUnits;
      plan.users.add(String(subscription.userId ?? subscription._id));
      planTotals.set(planKey, plan);
    }
    monthlyRows.push({
      createdAt: subscription.createdAt,
      endedAt: endedAt == null ? null : endedAt,
      amountBaseUnits: monthlyBaseUnits,
    });
  }

  // Active: a member (or the owner) who had the community open in the window.
  const memberIds = new Set<string>([String(community.ownerId), ...rows.map((row) => String(row.userId))]);
  const presenceRows = (await ctx.db
    .query("communityPresence" as any)
    .withIndex("by_community_lastSeenAt", (q: any) =>
      q.eq("communityId", args.communityId).gte("lastSeenAt", sinceMs),
    )
    .take(MAX_ANALYTICS_SNAPSHOT_EVENT_ROWS)) as Array<{
    userId: string;
    lastSeenAt: number;
    createdAt: number;
    activeUntil?: number;
  }>;
  // Joining writes a baseline row (lastSeenAt = createdAt, no lease); only a
  // heartbeat after that is a visit.
  const activeMembers = new Set(
    presenceRows
      .filter((row) => row.activeUntil != null || row.lastSeenAt > row.createdAt)
      .map((row) => String(row.userId))
      .filter((id) => memberIds.has(id)),
  ).size;
  // A plan bought through a connected app is held as an app grant, not a
  // subscription (communityHeldTiers): count those members on their plan.
  const appGrants = (await ctx.db
    .query("communityAppGrants" as any)
    .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId))
    .take(MAX_ANALYTICS_SNAPSHOT_EVENT_ROWS)) as Array<{ userId?: string; tierKey?: string; active: boolean }>;
  for (const grant of appGrants) {
    if (!grant.active || !grant.userId || !memberIds.has(String(grant.userId))) continue;
    const planKey = String(grant.tierKey ?? BASE_TIER_KEY);
    const plan = planTotals.get(planKey) ?? { mrr: 0, users: new Set<string>() };
    plan.users.add(String(grant.userId));
    planTotals.set(planKey, plan);
  }

  const paidUsers = new Set<string>();
  const plans: Array<{ key: string; name: string; members: number; mrr_base_units: number | null }> = [];
  for (const [key, plan] of planTotals) {
    plan.users.forEach((id) => paidUsers.add(id));
    const tier = (await ctx.db
      .query("communityTiers" as any)
      .withIndex("by_community_key", (q: any) => q.eq("communityId", args.communityId).eq("key", key))
      .first()) as { name?: string } | null;
    plans.push({
      key,
      name: String(tier?.name ?? "").trim() || "Membership",
      members: plan.users.size,
      mrr_base_units: mixedCurrency ? null : plan.mrr,
    });
  }
  plans.sort((a, b) => (b.mrr_base_units ?? 0) - (a.mrr_base_units ?? 0) || b.members - a.members);
  // Everyone else, the owner included, is on no paid plan.
  const freeMembers = Math.max(0, 1 + rows.length - paidUsers.size);
  if (freeMembers > 0) plans.push({ key: "free", name: "Free", members: freeMembers, mrr_base_units: 0 });

  return {
    range,
    bucket,
    generated_at: toIsoString(nowMs),
    summary: {
      plans,
      page_visits_window: visitRows.length,
      join_starts_window: startedRows.length,
      total_members: 1 + rows.length,
      new_members_window: memberRowsWindow.length,
      conversion_rate_window:
        visitRows.length > 0 ? memberRowsWindow.length / visitRows.length : null,
      mrr_base_units: mixedCurrency ? null : mrrBaseUnits,
      currency: mixedCurrency ? null : currency,
      currency_decimals: mixedCurrency ? null : currencyDecimals,
      active_members_window: activeMembers,
      retention_window: null,
      total_resources: null,
      resources_added_window: null,
    },
    series: {
      visits: buildAnalyticsCountSeries({
        rows: visitRows,
        bucketStarts,
        bucket,
      }),
      members: buildAnalyticsCountSeries({
        rows: memberRowsWindow,
        bucketStarts,
        bucket,
      }),
      revenue: mixedCurrency
        ? []
        : buildAnalyticsRecurringRevenueSeries({
            rows: monthlyRows,
            bucketStarts,
            bucket,
            nowMs,
          }),
    },
  };
}
