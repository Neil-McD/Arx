import { internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

type MoneyMetric = {
  currency: string;
  amountBaseUnits: number;
  currencyDecimals: number;
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "past_due", "cancel_at_period_end"]);
const CHECKOUT_STATUSES = ["pending", "complete", "expired"] as const;

function normalizeLimit(value: number | undefined, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value)));
}

function normalizeRangeStart(range: string | undefined, nowMs: number): number | null {
  switch (range) {
    case "7d":
      return nowMs - 7 * 86400000;
    case "30d":
      return nowMs - 30 * 86400000;
    case "90d":
      return nowMs - 90 * 86400000;
    case "all":
    default:
      return null;
  }
}

function moneyFromPrice(price: any): MoneyMetric | null {
  if (!price) return null;
  return {
    currency: String(price.currency ?? "usd").toLowerCase(),
    amountBaseUnits: Number(price.amountBaseUnits ?? 0),
    currencyDecimals: Number(price.currencyDecimals ?? 2),
  };
}

function monthlyMoneyFromPricePoint(price: any): MoneyMetric | null {
  const metric = moneyFromPrice(price);
  if (!metric) return null;
  const billingPeriod = String(price?.billingPeriod ?? "monthly").toLowerCase();
  if (billingPeriod !== "annual") return metric;
  return {
    ...metric,
    amountBaseUnits: metric.amountBaseUnits / 12,
  };
}

function addMoney(a: MoneyMetric | null, b: MoneyMetric | null): MoneyMetric | null {
  if (!a) return b;
  if (!b) return a;
  if (a.currency !== b.currency || a.currencyDecimals !== b.currencyDecimals) return a;
  return {
    currency: a.currency,
    currencyDecimals: a.currencyDecimals,
    amountBaseUnits: a.amountBaseUnits + b.amountBaseUnits,
  };
}

function mapEvent(row: any) {
  return {
    id: String(row._id),
    eventKey: String(row.eventKey ?? ""),
    eventType: String(row.eventType ?? ""),
    severity: row.severity ?? "info",
    status: row.status ?? "started",
    actorUserId: row.actorUserId ? String(row.actorUserId) : null,
    subjectUserId: row.subjectUserId ? String(row.subjectUserId) : null,
    communityId: row.communityId ? String(row.communityId) : null,
    checkoutSessionId: row.checkoutSessionId ?? null,
    provider: row.provider ?? "polynet",
    providerObjectId: row.providerObjectId ?? null,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
  };
}

function mapDiagnosticEvent(row: any) {
  return {
    id: String(row._id),
    eventKey: String(row.eventKey ?? ""),
    eventType: String(row.eventType ?? ""),
    subsystem: row.subsystem ?? "diagnostics",
    severity: row.severity ?? "info",
    status: row.status ?? "started",
    surface: row.surface ?? null,
    userId: row.userId ? String(row.userId) : null,
    communityId: row.communityId ? String(row.communityId) : null,
    projectId: row.projectId ? String(row.projectId) : null,
    threadId: row.threadId ? String(row.threadId) : null,
    runId: row.runId ?? null,
    requestId: row.requestId ?? null,
    release: row.release ?? null,
    latencyMs: typeof row.latencyMs === "number" ? row.latencyMs : null,
    errorCode: row.errorCode ?? null,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
  };
}

async function readDiagnosticEventsBySubsystem(
  ctx: any,
  subsystem: "auth" | "access",
  rangeStart: number | null,
  limit: number,
) {
  const query = ctx.db.query("platformDiagnosticEvents").withIndex("by_subsystem_createdAt", (q: any) => {
    const scoped = q.eq("subsystem", subsystem);
    return rangeStart == null ? scoped : scoped.gte("createdAt", rangeStart);
  });
  return await query.order("desc").take(limit);
}

async function readActiveTier(ctx: any, userId: any, nowMs: number): Promise<"free" | "builder" | "architect" | "unknown"> {
  const rows = await ctx.db
    .query("userEntitlements")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  let tier: "free" | "builder" | "architect" | "unknown" = "unknown";
  for (const row of rows) {
    if (row.startsAt > nowMs) continue;
    if (typeof row.endsAt === "number" && row.endsAt <= nowMs) continue;
    if (row.tier === "architect") return "architect";
    if (row.tier === "builder") tier = "builder";
    if (row.tier === "free" && tier === "unknown") tier = "free";
  }
  return tier;
}

async function readPayoutStatus(ctx: any, userId: any) {
  const row = await ctx.db
    .query("userStripeConnectAccounts")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
  return row?.status ?? "not_connected";
}

async function readCommunitySubscriptionsByStatuses(ctx: any, communityId: any, statuses: Set<string>) {
  const rows = [];
  for (const status of statuses) {
    const statusRows = await ctx.db
      .query("communitySubscriptions")
      .withIndex("by_community_status", (q: any) => q.eq("communityId", communityId).eq("status", status))
      .collect();
    rows.push(...statusRows);
  }
  return rows;
}

async function readCheckoutSessionsByCommunity(ctx: any, communityId: any) {
  const rows = [];
  for (const status of CHECKOUT_STATUSES) {
    const statusRows = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_community_status", (q: any) => q.eq("communityId", communityId).eq("status", status))
      .collect();
    rows.push(...statusRows);
  }
  return rows;
}

async function estimateSubscriptionMrr(ctx: any, subscriptions: any[]): Promise<MoneyMetric | null> {
  let total: MoneyMetric | null = null;
  for (const subscription of subscriptions) {
    const pricePoint = await ctx.db.get(subscription.pricePointId);
    total = addMoney(total, monthlyMoneyFromPricePoint(pricePoint));
  }
  return total;
}

async function buildBuilderRecord(ctx: any, community: any, nowMs: number) {
  const owner = await ctx.db.get(community.ownerId);
  const memberships = await ctx.db
    .query("communityMemberships")
    .withIndex("by_community", (q: any) => q.eq("communityId", community._id))
    .collect();
  const activeMemberships = memberships.filter((row: any) => row.active !== false && !row.revokedAt);
  const removedMemberships = memberships.filter((row: any) => row.active === false || Boolean(row.revokedAt));
  const price = await ctx.db
    .query("communityPricePoints")
    .withIndex("by_community_current", (q: any) => q.eq("communityId", community._id).eq("isCurrent", true))
    .first();
  const revenueSubscriptions = await readCommunitySubscriptionsByStatuses(ctx, community._id, ACTIVE_SUBSCRIPTION_STATUSES);
  const activePaidMembers = revenueSubscriptions.length;
  const checkouts = await readCheckoutSessionsByCommunity(ctx, community._id);
  const pendingCheckouts = checkouts.filter((row: any) => row.status === "pending");
  const completedCheckouts = checkouts.filter((row: any) => row.status === "complete");
  const currentPrice = moneyFromPrice(price);
  const estimatedMrr = await estimateSubscriptionMrr(ctx, revenueSubscriptions);
  const riskFlags: string[] = [];
  if (community.entryPolicy === "paid_subscription" && activePaidMembers === 0) {
    riskFlags.push("paid_enabled_no_sales");
  }
  const payoutStatus = await readPayoutStatus(ctx, community.ownerId);
  if (community.entryPolicy === "paid_subscription" && payoutStatus !== "ready") {
    riskFlags.push("payout_not_ready");
  }
  if (pendingCheckouts.length > completedCheckouts.length && pendingCheckouts.length >= 3) {
    riskFlags.push("checkout_abandonment");
  }

  const tier = await readActiveTier(ctx, community.ownerId, nowMs);
  const checkoutStarts = checkouts.length;
  return {
    builder: {
      userId: String(community.ownerId),
      displayName: owner?.displayName ?? null,
      email: owner?.email ?? null,
      avatarUrl: owner?.avatarUrl ?? null,
      tier,
      payoutStatus,
    },
    community: {
      communityId: String(community._id),
      slug: community.slug,
      name: community.name,
      visibility: community.visibility,
      entryPolicy: community.entryPolicy ?? "open",
      createdAt: community.createdAt,
      updatedAt: community.updatedAt,
    },
    money: {
      currentPrice,
      activePaidMembers,
      estimatedMrr,
      checkoutStarts,
      checkoutCompletions: completedCheckouts.length,
      checkoutConversionRate: checkoutStarts > 0 ? completedCheckouts.length / checkoutStarts : null,
    },
    members: {
      totalMembers: activeMemberships.length,
      activeMemberships: activeMemberships.length,
      removedMembers: removedMemberships.length,
    },
    activity: {
      lastMemberActivityAt: activeMemberships.reduce((latest: number | null, row: any) => {
        const updatedAt = typeof row.updatedAt === "number" ? row.updatedAt : null;
        if (updatedAt == null) return latest;
        return latest == null ? updatedAt : Math.max(latest, updatedAt);
      }, null),
    },
    risk: {
      flags: riskFlags,
      severity: riskFlags.length > 0 ? "warning" : "none",
    },
    evidence: {
      sourceTables: [
        "users",
        "userEntitlements",
        "userStripeConnectAccounts",
        "communities",
        "communityMemberships",
        "communityPricePoints",
        "communitySubscriptions",
        "checkoutSessions",
      ],
      eventIds: [],
      computedAt: nowMs,
    },
  };
}

export const listOperatorBuildersInternal = internalQuery({
  args: {
    query: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const limit = normalizeLimit(args.limit, 50, 200);
    const rows = await ctx.db.query("communities").collect();
    const records = [];
    const normalizedQuery = String(args.query ?? "").trim().toLowerCase();
    for (const community of rows) {
      const record = await buildBuilderRecord(ctx, community, nowMs);
      if (normalizedQuery) {
        const haystack = [
          record.builder.displayName,
          record.builder.email,
          record.community.name,
          record.community.slug,
        ].join(" ").toLowerCase();
        if (!haystack.includes(normalizedQuery)) continue;
      }
      records.push(record);
    }
    return records.slice(0, limit);
  },
});

export const getOperatorBuilderSnapshotInternal = internalQuery({
  args: {
    communityId: v.optional(v.id("communities")),
    builderUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    let community = args.communityId ? await ctx.db.get(args.communityId) : null;
    if (!community && args.builderUserId) {
      community = await ctx.db
        .query("communities")
        .withIndex("by_owner", (q: any) => q.eq("ownerId", args.builderUserId))
        .first();
    }
    if (!community) return null;
    return await buildBuilderRecord(ctx, community, Date.now());
  },
});

export const getOperatorOverviewInternal = internalQuery({
  args: {
    range: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("all"))),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const rangeStart = normalizeRangeStart(args.range, nowMs);
    const communities = await ctx.db.query("communities").collect();
    let estimatedMrr: MoneyMetric | null = null;
    let activePaidMembers = 0;
    let paidCommunities = 0;
    let riskItems = 0;
    for (const community of communities) {
      const record = await buildBuilderRecord(ctx, community, nowMs);
      activePaidMembers += record.money.activePaidMembers;
      if (record.money.activePaidMembers > 0) paidCommunities += 1;
      estimatedMrr = addMoney(estimatedMrr, record.money.estimatedMrr);
      if (record.risk.flags.length > 0) riskItems += record.risk.flags.length;
    }
    const events = await ctx.db.query("criticalAuditEvents").collect();
    const recentCriticalEvents = rangeStart == null
      ? events.length
      : events.filter((row: any) => row.createdAt >= rangeStart).length;
    return {
      computedAt: nowMs,
      totals: {
        builders: new Set(communities.map((row: any) => String(row.ownerId))).size,
        communities: communities.length,
        paidCommunities,
        activePaidMembers,
        estimatedMrr,
        riskItems,
        recentCriticalEvents,
      },
      evidence: {
        sourceTables: [
          "communities",
          "communityMemberships",
          "communityPricePoints",
          "communitySubscriptions",
          "checkoutSessions",
          "criticalAuditEvents",
        ],
      },
    };
  },
});

export const getOperatorMonetizationInternal = internalQuery({
  args: {
    range: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("all"))),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const rangeStart = normalizeRangeStart(args.range, nowMs);
    const checkouts = await ctx.db.query("checkoutSessions").collect();
    const inRangeCheckouts = rangeStart == null
      ? checkouts
      : checkouts.filter((row: any) => row.createdAt >= rangeStart);
    const activeSubscriptions = [];
    for (const status of ACTIVE_SUBSCRIPTION_STATUSES) {
      const rows = await ctx.db
        .query("communitySubscriptions")
        .withIndex("by_status", (q: any) => q.eq("status", status))
        .collect();
      activeSubscriptions.push(...rows);
    }
    let estimatedCommunityMrr: MoneyMetric | null = null;
    for (const row of activeSubscriptions) {
      const price = await ctx.db.get(row.pricePointId);
      estimatedCommunityMrr = addMoney(estimatedCommunityMrr, monthlyMoneyFromPricePoint(price));
    }
    return {
      computedAt: nowMs,
      creditTopupCheckoutStarts: inRangeCheckouts.filter((row: any) => row.mode === "workspace_credit_topup").length,
      creditTopupCheckoutCompletions: inRangeCheckouts.filter((row: any) => row.mode === "workspace_credit_topup" && row.status === "complete").length,
      communityCheckoutStarts: inRangeCheckouts.filter((row: any) => row.mode === "community_join").length,
      communityCheckoutCompletions: inRangeCheckouts.filter((row: any) => row.mode === "community_join" && row.status === "complete").length,
      activeCommunitySubscriptions: activeSubscriptions.length,
      estimatedCommunityMrr,
      evidence: {
        sourceTables: ["checkoutSessions", "communitySubscriptions", "communityPricePoints"],
      },
    };
  },
});

export const listOperatorEventsInternal = internalQuery({
  args: {
    eventType: v.optional(v.string()),
    severity: v.optional(v.union(v.literal("info"), v.literal("warning"), v.literal("error"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = normalizeLimit(args.limit, 50, 200);
    if (args.eventType) {
      const rows = await ctx.db
        .query("criticalAuditEvents")
        .withIndex("by_type_createdAt", (q: any) => q.eq("eventType", args.eventType))
        .order("desc")
        .take(limit);
      return rows
        .filter((row: any) => !args.severity || row.severity === args.severity)
        .map(mapEvent);
    }
    if (args.severity) {
      const rows = await ctx.db
        .query("criticalAuditEvents")
        .withIndex("by_severity_createdAt", (q: any) => q.eq("severity", args.severity))
        .order("desc")
        .take(limit);
      return rows.map(mapEvent);
    }
    const rows = await ctx.db.query("criticalAuditEvents").order("desc").take(limit);
    return rows.map(mapEvent);
  },
});

export const getOperatorAuthAccessDiagnosticsInternal = internalQuery({
  args: {
    range: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("all"))),
  },
  handler: async (ctx, args): Promise<any> => {
    const nowMs = Date.now();
    const range = args.range ?? "30d";
    const rangeStart = normalizeRangeStart(range, nowMs);
    const scannedEventLimit = 500;
    const [authRows, accessRows, entitlementFindings]: [any[], any[], any] = await Promise.all([
      readDiagnosticEventsBySubsystem(ctx, "auth", rangeStart, scannedEventLimit),
      readDiagnosticEventsBySubsystem(ctx, "access", rangeStart, scannedEventLimit),
      ctx.runQuery((internal as any).communityAccessAudit.listCommunityAccessStateAuditFindingsInternal, {
        limit: 500,
      }),
    ]);
    const rows: any[] = [...authRows, ...accessRows].sort((a: any, b: any) => b.createdAt - a.createdAt);
    const warningRows = rows.filter((row: any) => row.severity === "warning");
    const errorRows: any[] = rows.filter((row: any) => row.severity === "error");
    const authFailureRows = rows.filter((row: any) => row.subsystem === "auth" && row.status === "failed");
    const entitlementFindingsList = Array.isArray(entitlementFindings) ? entitlementFindings : [];
    const entitlementErrorFindings = entitlementFindingsList.filter((finding: any) => finding.severity === "error").length;
    const unknownAuthErrors = authFailureRows.filter((row: any) => {
      const errorCode = String(row.errorCode ?? "").trim().toLowerCase();
      return !errorCode || errorCode === "unknown" || errorCode === "auth_unknown";
    }).length;
    const health: "healthy" | "degraded" | "incident" =
      errorRows.length > 0 || entitlementErrorFindings > 0
        ? "incident"
        : warningRows.length > 0 || authFailureRows.length > 0 || entitlementFindingsList.length > 0
          ? "degraded"
          : "healthy";

    return {
      computedAt: nowMs,
      range,
      health,
      totals: {
        events: rows.length,
        warnings: warningRows.length,
        errors: errorRows.length,
        authFailures: authFailureRows.length,
        sessionEstablished: rows.filter((row: any) => row.eventType === "auth.session_established").length,
        sessionRefreshFailures: rows.filter((row: any) => row.eventType === "auth.session_refresh_failed").length,
        operatorAccessGranted: rows.filter((row: any) => row.eventType === "access.operator_access_granted").length,
        operatorAccessDenied: rows.filter((row: any) => row.eventType === "access.operator_access_denied").length,
        communityAccessDenied: rows.filter((row: any) => row.eventType === "access.community_denied").length,
        entitlementFindings: entitlementFindingsList.length,
        entitlementErrorFindings,
        unknownAuthErrors,
      },
      latestEvents: rows.slice(0, 8).map(mapDiagnosticEvent),
      evidence: {
        sourceTables: ["platformDiagnosticEvents", "communityAccessAudit"],
        scannedEventLimit,
        isTruncated: authRows.length >= scannedEventLimit || accessRows.length >= scannedEventLimit,
      },
    };
  },
});

export const listOperatorRisksInternal = internalQuery({
  args: {
    severity: v.optional(v.union(v.literal("warning"), v.literal("error"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const limit = normalizeLimit(args.limit, 50, 200);
    const errorEvents = await ctx.db
      .query("criticalAuditEvents")
      .withIndex("by_severity_createdAt", (q: any) => q.eq("severity", "error"))
      .order("desc")
      .take(limit);
    const riskItems: any[] = errorEvents.map((event: any) => ({
      id: `event:${String(event._id)}`,
      severity: "error",
      kind: event.eventType,
      title: `${event.eventType} ${event.status}`,
      builderUserId: event.subjectUserId ? String(event.subjectUserId) : null,
      communityId: event.communityId ? String(event.communityId) : null,
      eventId: String(event._id),
      createdAt: event.createdAt,
      evidence: {
        sourceTables: ["criticalAuditEvents"],
      },
    }));
    if (args.severity === "error") return riskItems.slice(0, limit);

    const communities = await ctx.db.query("communities").collect();
    for (const community of communities) {
      const record = await buildBuilderRecord(ctx, community, nowMs);
      for (const flag of record.risk.flags) {
        riskItems.push({
          id: `builder:${record.community.communityId}:${flag}`,
          severity: "warning",
          kind: flag,
          title: `${record.community.name}: ${flag}`,
          builderUserId: record.builder.userId,
          communityId: record.community.communityId,
          eventId: null,
          createdAt: record.community.updatedAt,
          evidence: {
            sourceTables: record.evidence.sourceTables,
          },
        });
      }
    }
    return riskItems.slice(0, limit);
  },
});
