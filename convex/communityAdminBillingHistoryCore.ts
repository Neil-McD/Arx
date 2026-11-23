import {
  type CommunityPricePointLike,
  type CommunitySubscriptionLike,
  toIsoString,
} from "./communityCore";

export type CommunityMemberBillingHistoryEventOutput = {
  id: string;
  kind: "checkout" | "subscription" | "subscription_event";
  status: string;
  source: string | null;
  billing_period: "monthly" | "annual" | null;
  amount_base_units: number | null;
  currency: string | null;
  currency_decimals: number | null;
  occurred_at: string;
  created_at: string | null;
  updated_at: string | null;
  current_period_start_at: string | null;
  current_period_end_at: string | null;
  ended_at: string | null;
  cancel_at_period_end: boolean | null;
};

export type CommunityMemberBillingCurrentPlanOutput = {
  status: string;
  source: string | null;
  billing_period: "monthly" | "annual" | null;
  amount_base_units: number | null;
  currency: string | null;
  currency_decimals: number | null;
  current_period_start_at: string | null;
  current_period_end_at: string | null;
  cancel_at_period_end: boolean | null;
};

type CheckoutSessionLike = {
  _id: any;
  mode?: string;
  provider?: string;
  providerSubscriptionId?: string;
  communityId?: any;
  billingPeriod?: string;
  pricePointId?: any;
  amountBaseUnits?: number;
  currency?: string;
  currencyDecimals?: number;
  status?: string;
  communitySubscriptionStatus?: string;
  currentPeriodStartAt?: number;
  currentPeriodEndAt?: number;
  cancelAtPeriodEnd?: boolean;
  createdAt?: number;
  updatedAt?: number;
};

type CriticalAuditEventLike = {
  _id: any;
  eventType?: string;
  status?: string;
  communityId?: any;
  provider?: string;
  providerObjectId?: string;
  metadata?: unknown;
  createdAt?: number;
};

const COMMUNITY_MEMBER_BILLING_HISTORY_DEFAULT_LIMIT = 20;
const COMMUNITY_MEMBER_BILLING_HISTORY_MAX_LIMIT = 50;
const ACTIVE_RECURRING_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "past_due",
  "cancel_at_period_end",
]);

export function normalizeBillingHistoryLimit(rawLimit: number | undefined): number {
  return Math.max(
    1,
    Math.min(
      COMMUNITY_MEMBER_BILLING_HISTORY_MAX_LIMIT,
      Math.floor(rawLimit ?? COMMUNITY_MEMBER_BILLING_HISTORY_DEFAULT_LIMIT),
    ),
  );
}

function normalizeBillingHistoryPeriod(
  rawPeriod: unknown,
): "monthly" | "annual" | null {
  const period = String(rawPeriod ?? "").trim().toLowerCase();
  if (period === "annual") return "annual";
  if (period === "monthly") return "monthly";
  return null;
}

function normalizeBillingHistoryCurrency(rawCurrency: unknown): string | null {
  const currency = String(rawCurrency ?? "").trim().toUpperCase();
  return currency || null;
}

function normalizeBillingHistoryAmount(rawAmount: unknown): number | null {
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.floor(amount);
}

function normalizeBillingHistoryCurrencyDecimals(
  rawDecimals: unknown,
): number | null {
  const decimals = Number(rawDecimals);
  if (!Number.isFinite(decimals) || decimals < 0) return null;
  return Math.floor(decimals);
}

function optionalIsoString(rawMs: unknown): string | null {
  const ms = Number(rawMs);
  return Number.isFinite(ms) && ms > 0 ? toIsoString(ms) : null;
}

function readBillingHistoryAuditMetadata(
  metadata: unknown,
): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return metadata as Record<string, unknown>;
}

function readBillingHistoryAuditString(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = String(metadata[key] ?? "").trim();
  return value || null;
}

function readBillingHistoryAuditBoolean(
  metadata: Record<string, unknown>,
  key: string,
): boolean | null {
  const value = metadata[key];
  return typeof value === "boolean" ? value : null;
}

function billingHistoryEventSortMs(
  event: CommunityMemberBillingHistoryEventOutput,
): number {
  const parsed = Date.parse(event.occurred_at);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function readCommunityPricePointForBillingHistory(args: {
  ctx: any;
  pricePointId: any;
}): Promise<CommunityPricePointLike | null> {
  if (!args.pricePointId) return null;
  return (await args.ctx.db.get(args.pricePointId as any)) as CommunityPricePointLike | null;
}

function mapSubscriptionBillingHistoryEvent(args: {
  row: CommunitySubscriptionLike;
  pricePoint: CommunityPricePointLike | null;
}): CommunityMemberBillingHistoryEventOutput {
  const pricePoint = args.pricePoint;
  const createdAt = Number(args.row.createdAt ?? 0);
  const updatedAt = Number(args.row.updatedAt ?? createdAt);
  const endedAt = Number(args.row.endedAt ?? NaN);
  const occurredAt = Number.isFinite(endedAt) && endedAt > 0
    ? endedAt
    : Number.isFinite(updatedAt) && updatedAt > 0
      ? updatedAt
      : Date.now();
  return {
    id: `subscription:${String(args.row._id)}`,
    kind: "subscription",
    status: String(args.row.status ?? "").trim().toLowerCase() || "unknown",
    source: String(args.row.source ?? "").trim() || null,
    billing_period: normalizeBillingHistoryPeriod(pricePoint?.billingPeriod),
    amount_base_units: normalizeBillingHistoryAmount(pricePoint?.amountBaseUnits),
    currency: normalizeBillingHistoryCurrency(pricePoint?.currency),
    currency_decimals: normalizeBillingHistoryCurrencyDecimals(pricePoint?.currencyDecimals),
    occurred_at: toIsoString(occurredAt),
    created_at: optionalIsoString(createdAt),
    updated_at: optionalIsoString(updatedAt),
    current_period_start_at: optionalIsoString(args.row.currentPeriodStartAt),
    current_period_end_at: optionalIsoString(args.row.currentPeriodEndAt),
    ended_at: optionalIsoString(args.row.endedAt),
    cancel_at_period_end: Boolean(args.row.cancelAtPeriodEnd),
  };
}

function mapSubscriptionCurrentPlan(args: {
  row: CommunitySubscriptionLike;
  pricePoint: CommunityPricePointLike | null;
}): CommunityMemberBillingCurrentPlanOutput {
  return {
    status: String(args.row.status ?? "").trim().toLowerCase() || "unknown",
    source: String(args.row.source ?? "").trim() || null,
    billing_period: normalizeBillingHistoryPeriod(args.pricePoint?.billingPeriod),
    amount_base_units: normalizeBillingHistoryAmount(args.pricePoint?.amountBaseUnits),
    currency: normalizeBillingHistoryCurrency(args.pricePoint?.currency),
    currency_decimals: normalizeBillingHistoryCurrencyDecimals(args.pricePoint?.currencyDecimals),
    current_period_start_at: optionalIsoString(args.row.currentPeriodStartAt),
    current_period_end_at: optionalIsoString(args.row.currentPeriodEndAt),
    cancel_at_period_end: Boolean(args.row.cancelAtPeriodEnd),
  };
}

function mapCheckoutBillingHistoryEvent(
  row: CheckoutSessionLike,
): CommunityMemberBillingHistoryEventOutput {
  const createdAt = Number(row.createdAt ?? 0);
  const updatedAt = Number(row.updatedAt ?? createdAt);
  const occurredAt = Number.isFinite(updatedAt) && updatedAt > 0
    ? updatedAt
    : Number.isFinite(createdAt) && createdAt > 0
      ? createdAt
      : Date.now();
  return {
    id: `checkout:${String(row._id)}`,
    kind: "checkout",
    status: String(row.status ?? "").trim().toLowerCase() || "unknown",
    source: String(row.provider ?? "stripe").trim() || null,
    billing_period: normalizeBillingHistoryPeriod(row.billingPeriod),
    amount_base_units: normalizeBillingHistoryAmount(row.amountBaseUnits),
    currency: normalizeBillingHistoryCurrency(row.currency),
    currency_decimals: normalizeBillingHistoryCurrencyDecimals(row.currencyDecimals),
    occurred_at: toIsoString(occurredAt),
    created_at: optionalIsoString(createdAt),
    updated_at: optionalIsoString(updatedAt),
    current_period_start_at: optionalIsoString(row.currentPeriodStartAt),
    current_period_end_at: optionalIsoString(row.currentPeriodEndAt),
    ended_at: null,
    cancel_at_period_end:
      typeof row.cancelAtPeriodEnd === "boolean" ? row.cancelAtPeriodEnd : null,
  };
}

function mapSubscriptionAuditBillingHistoryEvent(args: {
  row: CriticalAuditEventLike;
  pricePoint: CommunityPricePointLike | null;
}): CommunityMemberBillingHistoryEventOutput {
  const metadata = readBillingHistoryAuditMetadata(args.row.metadata);
  const createdAt = Number(args.row.createdAt ?? Date.now());
  const fallbackStatus = String(args.row.status ?? "").trim().toLowerCase();
  const fallbackSource = String(args.row.provider ?? "").trim();
  const status = (
    readBillingHistoryAuditString(metadata, "subscriptionStatus") ??
    readBillingHistoryAuditString(metadata, "communitySubscriptionStatus") ??
    fallbackStatus
  ) || "unknown";
  const source =
    readBillingHistoryAuditString(metadata, "source") ??
    (fallbackSource || null);
  return {
    id: `subscription_event:${String(args.row._id)}`,
    kind: "subscription_event",
    status,
    source,
    billing_period: normalizeBillingHistoryPeriod(args.pricePoint?.billingPeriod),
    amount_base_units: normalizeBillingHistoryAmount(args.pricePoint?.amountBaseUnits),
    currency: normalizeBillingHistoryCurrency(args.pricePoint?.currency),
    currency_decimals: normalizeBillingHistoryCurrencyDecimals(args.pricePoint?.currencyDecimals),
    occurred_at: toIsoString(Number.isFinite(createdAt) && createdAt > 0 ? createdAt : Date.now()),
    created_at: optionalIsoString(createdAt),
    updated_at: null,
    current_period_start_at: optionalIsoString(metadata.currentPeriodStartAt),
    current_period_end_at: optionalIsoString(metadata.currentPeriodEndAt),
    ended_at: null,
    cancel_at_period_end: readBillingHistoryAuditBoolean(metadata, "cancelAtPeriodEnd"),
  };
}

async function readBillingHistoryPricePointFromCache(args: {
  ctx: any;
  pricePointCache: Map<string, CommunityPricePointLike | null>;
  pricePointId: any;
}): Promise<CommunityPricePointLike | null> {
  const pricePointId = String(args.pricePointId ?? "");
  if (!pricePointId) return null;
  if (!args.pricePointCache.has(pricePointId)) {
    args.pricePointCache.set(
      pricePointId,
      await readCommunityPricePointForBillingHistory({
        ctx: args.ctx,
        pricePointId: args.pricePointId,
      }),
    );
  }
  return args.pricePointCache.get(pricePointId) ?? null;
}

async function listCheckoutBillingHistoryEventsForSubscriptions(args: {
  ctx: any;
  communityId: any;
  subscriptions: CommunitySubscriptionLike[];
}): Promise<CommunityMemberBillingHistoryEventOutput[]> {
  const providerSubscriptionIds = args.subscriptions
    .map((row) => String(row.providerSubscriptionId ?? "").trim())
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
  const events: CommunityMemberBillingHistoryEventOutput[] = [];
  const seenCheckoutIds = new Set<string>();
  for (const providerSubscriptionId of providerSubscriptionIds) {
    const rows = (await args.ctx.db
      .query("checkoutSessions" as any)
      .withIndex("by_providerSubscriptionId", (q: any) =>
        q.eq("providerSubscriptionId", providerSubscriptionId),
      )
      .collect()) as CheckoutSessionLike[];
    for (const row of rows) {
      if (String(row.mode ?? "").trim().toLowerCase() !== "community_join") continue;
      if (String(row.communityId ?? "") !== String(args.communityId)) continue;
      const checkoutId = String(row._id);
      if (seenCheckoutIds.has(checkoutId)) continue;
      seenCheckoutIds.add(checkoutId);
      events.push(mapCheckoutBillingHistoryEvent(row));
    }
  }
  return events;
}

async function listSubscriptionAuditBillingHistoryEvents(args: {
  ctx: any;
  communityId: any;
  membershipId: any;
  subscriptions: CommunitySubscriptionLike[];
  pricePointCache: Map<string, CommunityPricePointLike | null>;
}): Promise<CommunityMemberBillingHistoryEventOutput[]> {
  const providerSubscriptionIds = args.subscriptions
    .map((row) => String(row.providerSubscriptionId ?? "").trim())
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
  const events: CommunityMemberBillingHistoryEventOutput[] = [];
  const seenAuditIds = new Set<string>();
  for (const providerSubscriptionId of providerSubscriptionIds) {
    for (const provider of ["stripe", "polynet"] as const) {
      const rows = (await args.ctx.db
        .query("criticalAuditEvents" as any)
        .withIndex("by_providerObject", (q: any) =>
          q.eq("provider", provider).eq("providerObjectId", providerSubscriptionId),
        )
        .collect()) as CriticalAuditEventLike[];
      for (const row of rows) {
        if (String(row.eventType ?? "") !== "community_subscription_synced") continue;
        if (String(row.communityId ?? "") !== String(args.communityId)) continue;
        const metadata = readBillingHistoryAuditMetadata(row.metadata);
        if (readBillingHistoryAuditString(metadata, "membershipId") !== String(args.membershipId)) {
          continue;
        }
        const auditId = String(row._id);
        if (seenAuditIds.has(auditId)) continue;
        seenAuditIds.add(auditId);
        const pricePoint = await readBillingHistoryPricePointFromCache({
          ctx: args.ctx,
          pricePointCache: args.pricePointCache,
          pricePointId: readBillingHistoryAuditString(metadata, "pricePointId"),
        });
        events.push(mapSubscriptionAuditBillingHistoryEvent({ row, pricePoint }));
      }
    }
  }
  return events;
}

export async function buildCommunityMemberBillingHistory(args: {
  ctx: any;
  communityId: any;
  membershipId: any;
  subscriptions: CommunitySubscriptionLike[];
  limit: number;
}): Promise<{
  community_id: string;
  member_id: string;
  current_plan: CommunityMemberBillingCurrentPlanOutput | null;
  events: CommunityMemberBillingHistoryEventOutput[];
}> {
  const sortedSubscriptions = [...args.subscriptions].sort((a, b) => b.updatedAt - a.updatedAt);
  const pricePointCache = new Map<string, CommunityPricePointLike | null>();
  const subscriptionEvents: CommunityMemberBillingHistoryEventOutput[] = [];
  let currentPlan: CommunityMemberBillingCurrentPlanOutput | null = null;
  for (const subscription of sortedSubscriptions) {
    const pricePoint = await readBillingHistoryPricePointFromCache({
      ctx: args.ctx,
      pricePointCache,
      pricePointId: subscription.pricePointId,
    });
    if (
      currentPlan === null &&
      ACTIVE_RECURRING_SUBSCRIPTION_STATUSES.has(
        String(subscription.status ?? "").trim().toLowerCase(),
      )
    ) {
      currentPlan = mapSubscriptionCurrentPlan({
        row: subscription,
        pricePoint,
      });
    }
    subscriptionEvents.push(
      mapSubscriptionBillingHistoryEvent({
        row: subscription,
        pricePoint,
      }),
    );
  }
  const checkoutEvents = await listCheckoutBillingHistoryEventsForSubscriptions({
    ctx: args.ctx,
    communityId: args.communityId,
    subscriptions: sortedSubscriptions,
  });
  const subscriptionAuditEvents = await listSubscriptionAuditBillingHistoryEvents({
    ctx: args.ctx,
    communityId: args.communityId,
    membershipId: args.membershipId,
    subscriptions: sortedSubscriptions,
    pricePointCache,
  });
  const events = [...subscriptionEvents, ...subscriptionAuditEvents, ...checkoutEvents]
    .sort((a, b) => billingHistoryEventSortMs(b) - billingHistoryEventSortMs(a))
    .slice(0, args.limit);

  return {
    community_id: String(args.communityId),
    member_id: String(args.membershipId),
    current_plan: currentPlan,
    events,
  };
}
