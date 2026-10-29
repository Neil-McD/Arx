import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  type CommunityBlockLike,
  type CommunityLike,
  type CommunityMemberSettingsLike,
  type CommunityMembershipLike,
  type CommunityPricePointLike,
  type CommunitySubscriptionLike,
  adjustCommunityActiveMemberCountForMembershipTransition,
  communityMembershipRowIsActive,
  countCanonicalCommunityMembers,
  getCommunityAndMembership,
  getActiveCommunityBlock,
  getUniqueCommunityMembershipByPair,
  listCommunityMembershipRowsForManager,
  mapCommunityMemberSettingsRow,
  normalizeCommunityRoleForOutput,
  normalizeRoleAssignment,
  parseIsoMs,
  pickMostRelevantCommunityMembership,
  requireCommunityChatAccess,
  requireCommunityModerator,
  requireCommunityManager,
  requireCommunityUserNotBlocked,
  resolveCommunityLens,
  resolveCommunityEntryPolicy,
  resolveCommunityBrandingFields,
  buildCommunityVisualIdentity,
  resolvePublicUserId,
  resolveUserIdForAuthenticatedRequest,
  syncCommunityActiveMemberCount,
  toIsoString,
} from "./communityCore";
import {
  COMMUNITY_JOIN_REAPPLY_COOLDOWN_MS,
  COMMUNITY_REMOVAL_REAPPLY_COOLDOWN_MS,
  type CommunityJoinRequestLike,
  assertCanonicalCommunityJoinRequest,
  deleteCommunityJoinRequestByPair,
  denyCommunityJoinRequestCore,
  ensureDeniedCommunityJoinRequest,
  getCurrentCommunityJoinRequestByPair,
} from "./communityJoinRequestCore";
import { logStructuredError } from "./errorLogging";
import { enqueueCommunityAccessGrantedEmailInternal } from "./emailEvents";
import {
  isPlatformHomeCommunity,
  PLATFORM_HOME_MEMBER_LEFT_REVOKED_REASON,
} from "./platformHomeCommunity";
import { cancelStripeSubscriptionIfActive } from "./stripeSubscriptionCancellation";
import { syncCommunityAccessForUser } from "./communityAccessSync";
import {
  activateCommunityMembershipCore,
} from "./communityMembershipLifecycle";
import { deleteCommunityReadCursorsForUserCommunity } from "./communityReadCursorCore";
import { deleteCommunityPresenceForUser } from "./communityPresenceCore";
import { communityIsActive } from "../shared/communityLifecycle";
import { recordCriticalAuditEvent } from "./criticalAudit";
import { deleteMemberWorkflowPosition } from "./communityMemberWorkflowReadCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";

type AnalyticsRangeValue = "7d" | "30d" | "90d" | "1y" | "all";
type AnalyticsBucketValue = "day" | "week" | "month";
type AnalyticsPointOutput = {
  label: string;
  value: number;
};
type CommunityMemberBillingHistoryEventOutput = {
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
type CommunityMemberBillingCurrentPlanOutput = {
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

const MAX_ANALYTICS_SNAPSHOT_EVENT_ROWS = 10_000;
const COMMUNITY_MEMBER_BILLING_HISTORY_DEFAULT_LIMIT = 20;
const COMMUNITY_MEMBER_BILLING_HISTORY_MAX_LIMIT = 50;
const OPEN_ACCESS_PENDING_APPROVAL_BATCH_LIMIT = 100;

const ACTIVE_RECURRING_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "past_due",
  "cancel_at_period_end",
]);

function normalizeAnalyticsRange(rawRange: unknown): AnalyticsRangeValue {
  const range = String(rawRange ?? "30d").trim();
  return range === "7d" || range === "90d" || range === "1y" || range === "all"
    ? range
    : "30d";
}

function resolveAnalyticsWindowStartMs(params: {
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

function resolveAnalyticsBucket(range: AnalyticsRangeValue): AnalyticsBucketValue {
  return range === "7d" || range === "30d" ? "day" : range === "90d" ? "week" : "month";
}

function startOfAnalyticsBucket(ms: number, bucket: AnalyticsBucketValue): Date {
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

function addAnalyticsBucket(date: Date, bucket: AnalyticsBucketValue): Date {
  if (bucket === "month") return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 12));
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + (bucket === "week" ? 7 : 1));
  return next;
}

function buildAnalyticsBucketStarts(params: {
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

function analyticsBucketLabel(date: Date, bucket: AnalyticsBucketValue): string {
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

function buildAnalyticsCountSeries(params: {
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

function buildAnalyticsRecurringRevenueSeries(params: {
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

async function resolveCommunityAdminMembersContext(args: {
  ctx: any;
  userId?: any;
  authSubject?: string | null;
  communityId: any;
}): Promise<{
  userId: any;
  community: CommunityLike;
  viewerCanManageMembers: boolean;
}> {
  const userId = await resolveUserIdForAuthenticatedRequest({
    ctx: args.ctx,
    userId: args.userId,
    authSubject: args.authSubject ?? null,
  });
  const { community, membership: viewerMembership } = await getCommunityAndMembership({
    ctx: args.ctx,
    communityId: args.communityId,
    userId,
  });
  const lens = await resolveCommunityLens({ ctx: args.ctx, community, membership: viewerMembership, userId });
  if (lens.unavailableCode) throw new Error(lens.unavailableCode);
  if (lens.isBlocked) throw new Error("community_user_blocked");
  if (!lens.can.readChat) throw new Error("community_entitlement_required");
  return {
    userId,
    community,
    viewerCanManageMembers: lens.can.manageMembers,
  };
}

async function endCommunitySubscriptionsForMembership(args: {
  ctx: any;
  membershipId: any;
  nowMs: number;
}): Promise<void> {
  const rows = await args.ctx.db
    .query("communitySubscriptions" as any)
    .withIndex("by_membership", (q: any) =>
      q.eq("membershipId", args.membershipId),
    )
    .collect();
  for (const row of rows) {
    await args.ctx.db.patch(row._id, {
      status: "ended",
      cancelAtPeriodEnd: false,
      endedAt: args.nowMs,
      updatedAt: args.nowMs,
    });
  }
}

async function listCommunitySubscriptionRowsForMembership(args: {
  ctx: any;
  membershipId: any;
}): Promise<CommunitySubscriptionLike[]> {
  return (await args.ctx.db
    .query("communitySubscriptions" as any)
    .withIndex("by_membership", (q: any) =>
      q.eq("membershipId", args.membershipId),
    )
    .collect()) as CommunitySubscriptionLike[];
}

function isCommunityOwnerUser(community: CommunityLike, userId: any): boolean {
  return String(community.ownerId) === String(userId);
}

function requireOwnerForAdminAuthorityChange(args: {
  community: CommunityLike;
  actorUserId: any;
  targetMembership: CommunityMembershipLike;
  nextRole?: "admin" | "moderator" | "member" | null;
}): void {
  const currentRole = normalizeCommunityRoleForOutput(args.targetMembership.role) || "member";
  const nextRole = args.nextRole ?? currentRole;
  if (
    (currentRole === "admin" || nextRole === "admin") &&
    !isCommunityOwnerUser(args.community, args.actorUserId)
  ) {
    throw new Error("community_owner_required_for_admin_role");
  }
}

function normalizeBillingHistoryLimit(rawLimit: number | undefined): number {
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

async function runLoggedCommunityAdminMutation<T>(params: {
  operation: string;
  context: Record<string, unknown>;
  handler: () => Promise<T>;
}): Promise<T> {
  try {
    return await params.handler();
  } catch (error) {
    const errorMessage =
      error instanceof Error && typeof error.message === "string"
        ? error.message.trim()
        : "";
    const expectedDomainErrors = new Set([
      "join_request_not_found",
      "community_membership_not_found",
      "community_owner_role_fixed",
      "community_owner_remove_forbidden",
      "community_free_access_mode_invalid",
      "community_not_found",
      "community_owner_cannot_leave",
      "community_paid_checkout_required",
      "join_request_already_decided",
      "community_forbidden",
      "community_owner_required",
      "community_entitlement_required",
    ]);
    if (expectedDomainErrors.has(errorMessage)) {
      throw error;
    }
    logStructuredError("community_admin_mutation_failed", {
      error,
      operation: params.operation,
      ...params.context,
    });
    throw error;
  }
}

function resolveCommunityJoinRequestDecision(
  request: CommunityJoinRequestLike,
  targetStatus: "denied",
): "apply" | "already_applied" {
  const currentStatus = assertCanonicalCommunityJoinRequest(request);
  if (currentStatus === targetStatus) return "already_applied";
  if (currentStatus !== "pending") {
    throw new Error("join_request_already_decided");
  }
  return "apply";
}

async function approveCommunityJoinRequestForFreeAccess(args: {
  ctx: any;
  community: CommunityLike;
  request: CommunityJoinRequestLike;
  nowMs: number;
  grantReason: string;
}): Promise<{ grantedMembership: boolean; membership: CommunityMembershipLike }> {
  if (String(args.community.ownerId) === String(args.request.userId)) {
    throw new Error("community_owner_join_request_forbidden");
  }
  await requireCommunityUserNotBlocked({
    ctx: args.ctx,
    communityId: args.request.communityId,
    userId: args.request.userId,
  });
  const existingMembership = await getUniqueCommunityMembershipByPair({
    ctx: args.ctx,
    communityId: args.request.communityId,
    userId: args.request.userId,
  });
  if (assertCanonicalCommunityJoinRequest(args.request) !== "pending") {
    throw new Error("join_request_already_decided");
  }
  const restoredAccessSource =
    existingMembership?.accessSource === "paid_subscription" ||
    existingMembership?.accessSource === "free_grant" ||
    existingMembership?.accessSource === "manual_grant"
      ? existingMembership.accessSource
      : "free_grant";
  const activation = await activateCommunityMembershipCore({
    ctx: args.ctx,
    communityId: args.request.communityId,
    userId: args.request.userId,
    accessSource: restoredAccessSource,
    activationReason: args.grantReason,
    nowMs: args.nowMs,
  });
  const grantedMembershipMarker = activation.activationMarker;
  if (grantedMembershipMarker) {
    await enqueueCommunityAccessGrantedEmailInternal({
      ctx: args.ctx,
      userId: args.request.userId,
      communityId: args.request.communityId,
      grantMarker: grantedMembershipMarker,
      nowMs: args.nowMs,
    });
  }
  return { grantedMembership: Boolean(grantedMembershipMarker), membership: activation.membership };
}

async function approvePendingJoinRequestsForOpenAccessBatch(args: {
  ctx: any;
  community: CommunityLike;
  nowMs: number;
  limit: number;
}): Promise<{ approvedCount: number; hasMore: boolean }> {
  const rows = (await args.ctx.db
    .query("communityJoinRequests")
    .withIndex("by_community_status_createdAt", (q: any) =>
      q.eq("communityId", args.community._id).eq("status", "pending"),
    )
    .order("asc")
    .take(args.limit + 1)) as CommunityJoinRequestLike[];
  const batch = rows.slice(0, args.limit);
  let approvedCount = 0;
  for (const request of batch) {
    const impossibleApplicant =
      String(args.community.ownerId) === String(request.userId) ||
      Boolean(await getActiveCommunityBlock({
        ctx: args.ctx,
        communityId: args.community._id,
        userId: request.userId,
      }));
    if (impossibleApplicant) {
      await deleteCommunityJoinRequestByPair({
        ctx: args.ctx,
        communityId: args.community._id,
        userId: request.userId,
      });
      continue;
    }
    await approveCommunityJoinRequestForFreeAccess({
      ctx: args.ctx,
      community: args.community,
      request,
      nowMs: args.nowMs,
      grantReason: "free_access_mode_opened",
    });
    approvedCount += 1;
  }
  return {
    approvedCount,
    hasMore: rows.length > args.limit,
  };
}

async function scheduleOpenAccessPendingApprovalContinuation(args: {
  ctx: any;
  communityId: any;
  actorUserId: any;
  startedAt: number;
}): Promise<void> {
  await args.ctx.scheduler.runAfter(
    0,
    internal.communityAdmin.approvePendingJoinRequestsForOpenAccessInternal,
    {
      communityId: args.communityId,
      startedAt: args.startedAt,
      ...(args.actorUserId ? { actorUserId: args.actorUserId } : {}),
    },
  );
}

export const listCommunityMemberships = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    selectMode: v.optional(v.union(v.literal("full"), v.literal("minimal"))),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const selectMode = args.selectMode ?? "full";
    const membershipRows = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()) as CommunityMembershipLike[];
    const membershipRowsByCommunityId = new Map<
      string,
      CommunityMembershipLike[]
    >();
    for (const row of membershipRows) {
      const key = String(row.communityId);
      const existing = membershipRowsByCommunityId.get(key);
      if (existing) {
        existing.push(row);
      } else {
        membershipRowsByCommunityId.set(key, [row]);
      }
    }
    const effectiveRows = Array.from(membershipRowsByCommunityId.values())
      .map((rows) => pickMostRelevantCommunityMembership(rows))
      .filter((row): row is CommunityMembershipLike => Boolean(row))
      .sort((a, b) => a.createdAt - b.createdAt);
    const ownedCommunities = (await ctx.db
      .query("communities")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect()) as CommunityLike[];
    const userIdCache = new Map<string, string | null>();

    const buildCommunityProjection = async (community: CommunityLike, role: string) => {
      const branding = await resolveCommunityBrandingFields(ctx, community);
      const base = {
        id: String(community._id),
        slug: community.slug,
        name: community.name,
        owner_id:
          (await resolvePublicUserId(ctx, community.ownerId, userIdCache)) ??
          String(community.ownerId),
        created_at: toIsoString(community.createdAt),
        branding_revision: community.brandingRevision ?? community.updatedAt,
        visual_identity: buildCommunityVisualIdentity(community, branding),
      };
      return selectMode === "minimal"
        ? base
        : {
            ...base,
            one_liner: community.oneLiner ?? null,
            about: community.about ?? null,
            avatar_url: branding.avatar_url,
            avatar_storage_id: branding.avatar_storage_id,
            avatar_focus_x: branding.avatar_focus_x,
            avatar_focus_y: branding.avatar_focus_y,
            avatar_zoom: branding.avatar_zoom,
            banner_url: branding.banner_url,
            banner_storage_id: branding.banner_storage_id,
            banner_focus_x: branding.banner_focus_x,
            banner_focus_y: branding.banner_focus_y,
            banner_zoom: branding.banner_zoom,
            visibility: community.visibility,
            entry_policy: resolveCommunityEntryPolicy(community),
            builder_knowledge_setup_pending:
              role === "owner" && community.builderKnowledgeSetupPending === true,
            updated_at: toIsoString(community.updatedAt),
          };
    };

    const out: Array<{
      sort_ms: number;
      community_id: string;
      role: string;
      communities: Record<string, unknown>;
    }> = [];
    for (const community of ownedCommunities
      .filter((row) => communityIsActive(row))
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt)) {
      out.push({
        sort_ms: community.createdAt,
        community_id: String(community._id),
        role: "owner",
        communities: await buildCommunityProjection(community, "owner"),
      });
    }
    for (const row of effectiveRows) {
      const community = (await ctx.db.get(
        row.communityId,
      )) as CommunityLike | null;
      if (!community || !communityIsActive(community)) continue;
      if (String(community.ownerId) === String(row.userId)) continue;
      const lens = await resolveCommunityLens({ ctx, community, membership: row, userId: row.userId });
      if (!lens.membershipEntitled) continue;
      if (out.some((entry) => entry.community_id === String(row.communityId)))
        continue;
      const role = normalizeCommunityRoleForOutput(row.role) || "member";
      out.push({
        sort_ms: row.createdAt,
        community_id: String(row.communityId),
        role,
        communities: await buildCommunityProjection(community, role),
      });
    }
    return out
      .sort((a, b) => a.sort_ms - b.sort_ms)
      .map(({ sort_ms: _sortMs, ...row }) => row);
  },
});

export const getCommunityMemberBillingHistory = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    targetMembershipId: v.id("communityMemberships"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = normalizeBillingHistoryLimit(args.limit);
    const { community, viewerCanManageMembers } =
      await resolveCommunityAdminMembersContext({
        ctx,
        userId: args.userId,
        authSubject: args.authSubject ?? null,
        communityId: args.communityId,
      });
    if (!viewerCanManageMembers) throw new Error("community_forbidden");

    const membership = (await ctx.db.get(
      args.targetMembershipId,
    )) as CommunityMembershipLike | null;
    if (!membership || String(membership.communityId) !== String(args.communityId)) {
      throw new Error("community_membership_not_found");
    }

    const subscriptions = (await listCommunitySubscriptionRowsForMembership({
      ctx,
      membershipId: membership._id,
    })).sort((a, b) => b.updatedAt - a.updatedAt);
    const pricePointCache = new Map<string, CommunityPricePointLike | null>();
    const subscriptionEvents: CommunityMemberBillingHistoryEventOutput[] = [];
    let currentPlan: CommunityMemberBillingCurrentPlanOutput | null = null;
    for (const subscription of subscriptions) {
      const pricePoint = await readBillingHistoryPricePointFromCache({
        ctx,
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
      ctx,
      communityId: community._id,
      subscriptions,
    });
    const subscriptionAuditEvents = await listSubscriptionAuditBillingHistoryEvents({
      ctx,
      communityId: community._id,
      membershipId: membership._id,
      subscriptions,
      pricePointCache,
    });
    const events = [...subscriptionEvents, ...subscriptionAuditEvents, ...checkoutEvents]
      .sort((a, b) => billingHistoryEventSortMs(b) - billingHistoryEventSortMs(a))
      .slice(0, limit);

    return {
      community_id: String(community._id),
      member_id: String(membership._id),
      current_plan: currentPlan,
      events,
    };
  },
});

export const countCommunityMemberships = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    sinceIso: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const sinceMs = parseIsoMs(args.sinceIso);
    const { community } = await resolveCommunityAdminMembersContext({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
      communityId: args.communityId,
    });
    if (sinceMs === null) {
      return await countCanonicalCommunityMembers({
        ctx,
        communityId: args.communityId,
        community,
      });
    }
    const rows = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_createdAt", (q) =>
        q.eq("communityId", args.communityId),
      )
      .collect()) as CommunityMembershipLike[];
    const ownerIncluded =
      sinceMs === null || community.createdAt >= sinceMs ? 1 : 0;
    return (
      ownerIncluded +
      rows.reduce((count, row) => {
        if (String(row.userId) === String(community.ownerId)) return count;
        if (!communityMembershipRowIsActive(row)) return count;
        if (sinceMs !== null && row.createdAt < sinceMs) return count;
        return count + 1;
      }, 0)
    );
  },
});

export const syncCommunityMembershipCount = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const { community } = await resolveCommunityAdminMembersContext({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
      communityId: args.communityId,
    });
    return await syncCommunityActiveMemberCount({
      ctx,
      communityId: args.communityId,
      community,
    });
  },
});

// Read-only founder projection. The existing moderator RPC below retains its contract.
async function mapPendingAdmissionRequest(ctx: any, row: CommunityJoinRequestLike) {
  if (assertCanonicalCommunityJoinRequest(row) !== "pending" ||
      !Number.isFinite(row.createdAt) || !Number.isFinite(row.updatedAt)) {
    throw new Error("community_join_request_unavailable");
  }
  const current = await getCurrentCommunityJoinRequestByPair({
    ctx, communityId: row.communityId, userId: row.userId,
  });
  if (!current || String(current._id) !== String(row._id)) {
    throw new Error("community_join_request_unavailable");
  }
  return {
    ref: `join-request:${row._id}`,
    applicant_ref: `user:${(await resolvePublicUserId(ctx, row.userId)) ?? String(row.userId)}`,
    status: "pending" as const,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

export const listPendingAdmissionRequestsInternal = internalQuery({
  args: {
    userId: v.id("users"), communityId: v.id("communities"),
    cursor: v.optional(v.string()), limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    const limit = args.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 2 || limit > 50) {
      throw new Error("community_join_request_limit_invalid");
    }
    const scope = JSON.stringify([args.userId, args.communityId, "pending", "createdAt:desc", 1]);
    let cursor: string | null = null;
    if (args.cursor !== undefined) {
      let decoded;
      try { decoded = JSON.parse(args.cursor); } catch { throw new Error("community_join_request_cursor_invalid"); }
      if (args.cursor.length > 2048 || decoded?.scope !== scope ||
          typeof decoded.cursor !== "string" || !decoded.cursor) {
        throw new Error("community_join_request_cursor_invalid");
      }
      cursor = decoded.cursor;
    }
    const result = await ctx.db.query("communityJoinRequests")
      .withIndex("by_community_status_createdAt", q => q.eq("communityId", args.communityId).eq("status", "pending"))
      .order("desc").paginate({ cursor, numItems: limit });
    return {
      requests: await Promise.all(result.page.map(row => mapPendingAdmissionRequest(ctx, row))),
      next_cursor: result.isDone ? null : JSON.stringify({ scope, cursor: result.continueCursor }),
    };
  },
});

export const readPendingAdmissionRequestInternal = internalQuery({
  args: { userId: v.id("users"), communityId: v.id("communities"), requestId: v.id("communityJoinRequests") },
  handler: async (ctx, args) => {
    await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    const row = await ctx.db.get(args.requestId);
    if (!row || row.communityId !== args.communityId) throw new Error("community_join_request_unavailable");
    return await mapPendingAdmissionRequest(ctx, row);
  },
});

// Reservation, domain effects and completed result share one transaction.
const freshAdmissionArgs = {
  userId: v.id("users"), communityId: v.id("communities"),
  principalKind: v.literal("external_mcp"),
  requestId: v.id("communityJoinRequests"),
  expectedCreatedAt: v.number(), expectedUpdatedAt: v.number(),
  idempotencyKey: v.string(),
};

type FreshAdmissionArgs = {
  userId: Id<"users">; communityId: Id<"communities">;
  principalKind: "external_mcp"; requestId: Id<"communityJoinRequests">;
  expectedCreatedAt: number; expectedUpdatedAt: number; idempotencyKey: string;
};

async function decideFreshAdmission(ctx: MutationCtx, args: FreshAdmissionArgs,
  operation: "community.admission.approve" | "community.admission.deny"): Promise<Record<string, any>> {
  const { community } = await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
  if (!args.idempotencyKey.trim() || args.idempotencyKey.length > 200 ||
      !Number.isSafeInteger(args.expectedCreatedAt) || !Number.isSafeInteger(args.expectedUpdatedAt)) {
    throw new Error("invalid_tool_args");
  }
  const scope = { communityId: args.communityId, userId: args.userId,
    principalKind: args.principalKind, toolName: "polynet_call" as const, idempotencyKey: args.idempotencyKey };
  const requestFingerprint = JSON.stringify([operation, 1, args.requestId,
    args.expectedCreatedAt, args.expectedUpdatedAt]);
  const reservation = await ctx.runMutation(internal.polynetCanonicalReceipts.reserveCanonicalOperationReceiptInternal,
    { ...scope, requestFingerprint });
  if (!reservation.ok) return reservation;
  if (reservation.status === "completed") {
    const value = reservation.result;
    return { ...value, deduped: true, receipt: { ...value.receipt, deduped: true } };
  }
  const nowMs = Date.now();
  if (!reservation.attemptToken || !reservation.leaseExpiresAt || reservation.leaseExpiresAt <= nowMs) {
    throw new Error("operation_in_progress");
  }
  const request = await ctx.db.get(args.requestId);
  if (!request || request.communityId !== args.communityId ||
      request.createdAt !== args.expectedCreatedAt || request.updatedAt !== args.expectedUpdatedAt ||
      resolveCommunityEntryPolicy(community) !== "approval") {
    throw new Error("admission_request_unavailable");
  }
  // Validates pending fields and the canonical pair; never repairs a read.
  const projection = await mapPendingAdmissionRequest(ctx, request);
  const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId: args.communityId, userId: request.userId });
  const subscription = await ctx.db.query("communitySubscriptions")
    .withIndex("by_community_user", q => q.eq("communityId", args.communityId).eq("userId", request.userId)).first();
  if (membership || subscription) throw new Error("admission_request_unavailable");
  let result: Record<string, unknown>;
  if (operation === "community.admission.approve") {
    const activation = await approveCommunityJoinRequestForFreeAccess({ ctx, community, request,
      nowMs, grantReason: "join_request_approved" });
    result = { status: "approved", request_ref: projection.ref, applicant_ref: projection.applicant_ref,
      membership_ref: `membership:${activation.membership._id}`, decided_at: toIsoString(nowMs) };
  } else {
    if (community.ownerId === request.userId) throw new Error("admission_request_unavailable");
    await requireCommunityUserNotBlocked({ ctx, communityId: args.communityId, userId: request.userId });
    const denied = await denyCommunityJoinRequestCore({ ctx, request, nowMs,
      cooldownMs: COMMUNITY_JOIN_REAPPLY_COOLDOWN_MS });
    result = { status: "denied", request_ref: projection.ref, applicant_ref: projection.applicant_ref,
      denied_at: toIsoString(denied.request.deniedAt!), reapply_at: toIsoString(denied.request.reapplyAt!) };
  }
  const eventType = operation === "community.admission.approve"
    ? "community_join_request_approved" : "community_join_request_denied";
  const eventKey = operation === "community.admission.approve"
    ? `${eventType}:${request._id}`
    : `${eventType}:${request._id}:${args.expectedCreatedAt}:${args.expectedUpdatedAt}`;
  await recordCriticalAuditEvent(ctx, {
    eventKey, eventType, severity: "info", status: "succeeded",
    actorUserId: args.userId, subjectUserId: request.userId, communityId: args.communityId,
    provider: "polynet", providerObjectId: String(request._id), createdAt: nowMs,
  });
  const value = { ok: true, operation, result,
    deduped: false,
    receipt: { contract: "polynet.canonical.operation:v1", tool: "polynet_call",
      principal_kind: args.principalKind, community_id: String(args.communityId), community_slug: community.slug,
      authority_lane: "builder", relation: community.ownerId === args.userId ? "owner" : "admin",
      idempotency_key: args.idempotencyKey, deduped: false } };
  await ctx.runMutation(internal.polynetCanonicalReceipts.completeCanonicalOperationReceiptInternal,
    { ...scope, requestFingerprint, attemptToken: reservation.attemptToken, result: value });
  return value;

}

export const approveFreshAdmissionInternal = internalMutation({
  args: freshAdmissionArgs,
  handler: (ctx, args): Promise<Record<string, any>> => decideFreshAdmission(ctx, args, "community.admission.approve"),
});

export const denyFreshAdmissionInternal = internalMutation({
  args: freshAdmissionArgs,
  handler: (ctx, args): Promise<Record<string, any>> => decideFreshAdmission(ctx, args, "community.admission.deny"),
});

export const listCommunityJoinRequests = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
    includeStatuses: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    await requireCommunityModerator({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const statuses = Array.from(new Set(
      (args.includeStatuses ?? ["pending"])
        .map((status) =>
          String(status ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter((status) => status === "pending" || status === "denied"),
    ));
    if (statuses.length === 0) return [];
    const limit = Math.max(1, Math.min(5000, Math.floor(args.limit ?? 200)));
    const rows = (
      await Promise.all(
        statuses.map(async (status) =>
          (await ctx.db
            .query("communityJoinRequests")
            .withIndex("by_community_status_createdAt", (q: any) =>
              q.eq("communityId", args.communityId).eq("status", status),
            )
            .order("desc")
            .take(limit)) as CommunityJoinRequestLike[],
        ),
      )
    ).flat();
    const userIdCache = new Map<string, string | null>();
    return await Promise.all(
      rows
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map(async (row) => {
          const status = assertCanonicalCommunityJoinRequest(row);
          return {
            id: String(row._id),
            community_id: String(row.communityId),
            user_id:
              (await resolvePublicUserId(ctx, row.userId, userIdCache)) ??
              String(row.userId),
            status,
            created_at: toIsoString(row.createdAt),
            updated_at: toIsoString(row.updatedAt),
          };
        }),
    );
  },
});

export const approveCommunityJoinRequest = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    requestId: v.id("communityJoinRequests"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const logContext: Record<string, unknown> = {
      actorUserId: args.userId,
      requestId: args.requestId,
    };
    return await approveCommunityJoinRequestCore(ctx, { requestId: args.requestId, userId: args.userId, logContext });
  },
});

// Approving a join request, for Studio and for a site's private twin: the
// reviewer must moderate this community (owner, admin or moderator).
async function approveCommunityJoinRequestCore(ctx: any, args: {
  requestId: any;
  userId: any;
  logContext: Record<string, unknown>;
  communityId?: any;
}) {
  const logContext = args.logContext;
    return await runLoggedCommunityAdminMutation({
      operation: "approve_join_request",
      context: logContext,
      handler: async () => {
        const nowMs = Date.now();
        const approvalReceiptKey = `community_join_request_approved:${String(args.requestId)}`;
        const request = (await ctx.db.get(args.requestId)) as CommunityJoinRequestLike | null;
        if (!request) {
          const receipt = await ctx.db
            .query("criticalAuditEvents")
            .withIndex("by_eventKey", (q: any) => q.eq("eventKey", approvalReceiptKey))
            .unique();
          if (
            receipt?.status === "succeeded" &&
            String(receipt.actorUserId ?? "") === String(args.userId)
          ) {
            return { ok: true };
          }
          throw new Error("join_request_not_found");
        }
        logContext.communityId = String(request.communityId);
        logContext.targetUserId = String(request.userId);
        if (args.communityId && String(args.communityId) !== String(request.communityId)) {
          throw new Error("join_request_not_found");
        }
        const { community } = await requireCommunityModerator({
          ctx,
          communityId: request.communityId,
          userId: args.userId,
        });
        if (assertCanonicalCommunityJoinRequest(request) !== "pending") {
          throw new Error("join_request_already_decided");
        }
        if (resolveCommunityEntryPolicy(community) === "paid_subscription") {
          throw new Error("community_paid_checkout_required");
        }
        await approveCommunityJoinRequestForFreeAccess({
          ctx,
          community,
          request,
          nowMs,
          grantReason: "join_request_approved",
        });
        await recordCriticalAuditEvent(ctx, {
          eventKey: approvalReceiptKey,
          eventType: "community_join_request_approved",
          severity: "info",
          status: "succeeded",
          actorUserId: args.userId,
          subjectUserId: request.userId,
          communityId: request.communityId,
          provider: "polynet",
          providerObjectId: String(args.requestId),
          createdAt: nowMs,
        });
        return { ok: true };
      },
    });
}

export const denyCommunityJoinRequest = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    requestId: v.id("communityJoinRequests"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const logContext: Record<string, unknown> = {
      actorUserId: args.userId,
      requestId: args.requestId,
    };
    return await denyCommunityJoinRequestForReviewerCore(ctx, { requestId: args.requestId, userId: args.userId, logContext });
  },
});

// Denying a join request, for Studio and for a site's private twin.
async function denyCommunityJoinRequestForReviewerCore(ctx: any, args: {
  requestId: any;
  userId: any;
  logContext: Record<string, unknown>;
  communityId?: any;
}) {
  const logContext = args.logContext;
    return await runLoggedCommunityAdminMutation({
      operation: "deny_join_request",
      context: logContext,
      handler: async () => {
        const nowMs = Date.now();
        const request = (await ctx.db.get(args.requestId)) as CommunityJoinRequestLike | null;
        if (!request) throw new Error("join_request_not_found");
        if (args.communityId && String(args.communityId) !== String(request.communityId)) {
          throw new Error("join_request_not_found");
        }
        logContext.communityId = String(request.communityId);
        logContext.targetUserId = String(request.userId);
        const { community } = await requireCommunityModerator({
          ctx,
          communityId: request.communityId,
          userId: args.userId,
        });
        if (String(community.ownerId) === String(request.userId)) {
          throw new Error("community_owner_join_request_forbidden");
        }
        if (resolveCommunityJoinRequestDecision(request, "denied") === "already_applied") {
          return { ok: true };
        }
        await denyCommunityJoinRequestCore({
          ctx,
          request,
          nowMs,
          cooldownMs: COMMUNITY_JOIN_REAPPLY_COOLDOWN_MS,
        });
        return { ok: true };
      },
    });
}

// A request id from outside (the twin): a join request's, or refused.
function requireJoinRequestId(ctx: any, raw: string) {
  const id = ctx.db.normalizeId("communityJoinRequests", raw);
  if (!id) throw new Error("join_request_not_found");
  return id;
}

// Join review on a site's private twin (httpCommunityApps, private sessions
// only): the pending requests of the session's own community, with the names
// a reviewer needs, and Studio's approve and deny for exactly that community.
export const listPendingJoinRequestsForTrustedReviewerInternal = internalQuery({
  args: { userId: v.id("users"), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const { community } = await requireCommunityModerator({ ctx, communityId: args.communityId, userId: args.userId });
    const rows = (await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_status_createdAt", (q: any) => q.eq("communityId", args.communityId).eq("status", "pending"))
      .order("desc")
      .take(100)) as CommunityJoinRequestLike[];
    const requests = [];
    for (const row of rows) {
      if (assertCanonicalCommunityJoinRequest(row) !== "pending") continue;
      const user = (await ctx.db.get(row.userId)) as { handle?: string } | null;
      const display = await resolveUserProfileDisplayProjection(ctx, row.userId);
      requests.push({
        id: String(row._id),
        name: display.display_name ?? user?.handle ?? "Someone",
        handle: typeof user?.handle === "string" ? user.handle : null,
        avatar_url: display.avatar_url ?? null,
        asked_at: toIsoString(row.createdAt),
      });
    }
    // A paid community admits through checkout only; there's nothing to approve.
    return { paid: resolveCommunityEntryPolicy(community) === "paid_subscription", requests };
  },
});

export const approveJoinRequestForTrustedReviewerInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities"), requestId: v.string() },
  handler: async (ctx, args) => await approveCommunityJoinRequestCore(ctx, {
    requestId: requireJoinRequestId(ctx, args.requestId), userId: args.userId, communityId: args.communityId,
    logContext: { actorUserId: args.userId, requestId: args.requestId, surface: "community_site_twin" },
  }),
});

export const denyJoinRequestForTrustedReviewerInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities"), requestId: v.string() },
  handler: async (ctx, args) => await denyCommunityJoinRequestForReviewerCore(ctx, {
    requestId: requireJoinRequestId(ctx, args.requestId), userId: args.userId, communityId: args.communityId,
    logContext: { actorUserId: args.userId, requestId: args.requestId, surface: "community_site_twin" },
  }),
});

export const setCommunityMemberRole = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    targetMembershipId: v.id("communityMemberships"),
    // co_creator: an admin shown publicly as a creator who can also change
    // the look and the sales page. Owner only, like admin.
    role: v.union(
      v.literal("co_creator"),
      v.literal("admin"),
      v.literal("moderator"),
      v.literal("member"),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    return await runLoggedCommunityAdminMutation({
      operation: "set_member_role",
      context: {
        actorUserId: args.userId,
        communityId: String(args.communityId),
        targetMembershipId: String(args.targetMembershipId),
        nextRole: args.role,
      },
      handler: async () => {
        const nowMs = Date.now();
        const coCreator = args.role === "co_creator";
        const role = coCreator ? "admin" : normalizeRoleAssignment(args.role);
        const { community } = await requireCommunityManager({
          ctx,
          communityId: args.communityId,
          userId: args.userId,
        });
        const membership = (await ctx.db.get(
          args.targetMembershipId,
        )) as CommunityMembershipLike | null;
        if (!membership) throw new Error("community_membership_not_found");
        if (String(membership.communityId) !== String(args.communityId)) {
          throw new Error("community_membership_not_found");
        }
        if (String(community.ownerId) === String(membership.userId)) {
          throw new Error("community_owner_role_fixed");
        }
        requireOwnerForAdminAuthorityChange({
          community,
          actorUserId: args.userId,
          targetMembership: membership,
          nextRole: role,
        });
        await ctx.db.patch(membership._id as any, {
          role,
          coCreator: coCreator ? true : undefined,
          updatedAt: nowMs,
        });
        return { ok: true };
      },
    });
  },
});

export const prepareCommunityMemberRemovalInternal = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    targetMembershipId: v.id("communityMemberships"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const membership = (await ctx.db.get(
      args.targetMembershipId,
    )) as CommunityMembershipLike | null;
    if (!membership) {
      return {
        ok: true,
        noop: true,
        provider_subscription_targets: [],
      };
    }
    if (String(membership.communityId) !== String(args.communityId)) {
      return {
        ok: true,
        noop: true,
        provider_subscription_targets: [],
      };
    }
    if (String(community.ownerId) === String(membership.userId)) {
      throw new Error("community_owner_remove_forbidden");
    }
    requireOwnerForAdminAuthorityChange({
      community,
      actorUserId: userId,
      targetMembership: membership,
    });
    const subscriptionRows = await listCommunitySubscriptionRowsForMembership({
      ctx,
      membershipId: membership._id,
    });
    const providerSubscriptionTargets = Array.from(
      new Map(
        subscriptionRows
          .map((row) => ({
            provider_subscription_id: String(row.providerSubscriptionId ?? "").trim(),
            provider_account_id: String(row.providerAccountId ?? "").trim() || null,
          }))
          .filter((target) => target.provider_subscription_id)
          .map((target) => [
            `${target.provider_account_id ?? "platform"}:${target.provider_subscription_id}`,
            target,
          ]),
      ).values(),
    );
    if (providerSubscriptionTargets.some((target) => !target.provider_account_id)) {
      throw new Error("community_subscription_provider_account_missing");
    }
    return {
      ok: true,
      noop: false,
      community_slug: community.slug,
      target_user_id: membership.userId,
      provider_subscription_targets: providerSubscriptionTargets,
    };
  },
});

export const revokeCommunityMemberInternal = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    targetMembershipId: v.id("communityMemberships"),
    revokedReason: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    return await runLoggedCommunityAdminMutation({
      operation: "remove_member",
      context: {
        actorUserId: userId,
        communityId: String(args.communityId),
        targetMembershipId: String(args.targetMembershipId),
      },
      handler: async () => {
        const nowMs = args.nowMs ?? Date.now();
        const { community } = await requireCommunityManager({
          ctx,
          communityId: args.communityId,
          userId,
        });
        const membership = (await ctx.db.get(
          args.targetMembershipId,
        )) as CommunityMembershipLike | null;
        if (!membership) return { ok: true };
        if (String(membership.communityId) !== String(args.communityId)) {
          return { ok: true };
        }
        if (String(community.ownerId) === String(membership.userId)) {
          throw new Error("community_owner_remove_forbidden");
        }
        requireOwnerForAdminAuthorityChange({
          community,
          actorUserId: userId,
          targetMembership: membership,
        });
        const alreadyManagerRevoked =
          !communityMembershipRowIsActive(membership) &&
          String(membership.revokedReason ?? "").startsWith("removed_by_manager");
        if (!communityMembershipRowIsActive(membership) && !alreadyManagerRevoked) {
          return { ok: true };
        }
        const revokedAt = alreadyManagerRevoked && typeof membership.revokedAt === "number"
          ? membership.revokedAt
          : nowMs;
        const revokedReason = alreadyManagerRevoked
          ? String(membership.revokedReason)
          : String(args.revokedReason ?? "").trim() || "removed_by_manager";
        if (!alreadyManagerRevoked) {
          await endCommunitySubscriptionsForMembership({
            ctx,
            membershipId: membership._id,
            nowMs,
          });
        }
        const revokedMembership = {
          ...membership,
          active: false,
          revokedAt,
          revokedReason,
          updatedAt: alreadyManagerRevoked ? membership.updatedAt : nowMs,
        } as CommunityMembershipLike;
        if (!alreadyManagerRevoked) {
          await ctx.db.patch(membership._id as any, {
            active: false,
            revokedAt,
            revokedReason,
            updatedAt: nowMs,
          });
          await adjustCommunityActiveMemberCountForMembershipTransition({
            ctx,
            communityId: args.communityId,
            before: membership,
            after: revokedMembership,
          });
        }
        const memberSettings = (await ctx.db
          .query("communityMemberSettings" as any)
          .withIndex("by_community_user", (q: any) =>
            q
              .eq("communityId", args.communityId)
              .eq("userId", membership.userId),
          )
          .first()) as CommunityMemberSettingsLike | null;
        if (memberSettings) {
          await ctx.db.delete(memberSettings._id as any);
        }
        await deleteCommunityReadCursorsForUserCommunity(
          ctx,
          args.communityId,
          membership.userId,
        );
        await deleteCommunityPresenceForUser({
          ctx,
          communityId: args.communityId,
          userId: membership.userId,
        });

        await ensureDeniedCommunityJoinRequest({
          ctx,
          communityId: args.communityId,
          userId: membership.userId,
          nowMs: revokedAt,
          cooldownMs: COMMUNITY_REMOVAL_REAPPLY_COOLDOWN_MS,
        });
        await syncCommunityAccessForUser(ctx, {
          communityId: args.communityId,
          userId: membership.userId,
          nowMs,
          reason: revokedReason,
        });
        return { ok: true };
      },
    });
  },
});

export const removeCommunityMember = action({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    targetMembershipId: v.id("communityMemberships"),
  },
  handler: async (ctx, args) => {
    const prepared = (await ctx.runQuery(
      internal.communityAdmin.prepareCommunityMemberRemovalInternal as any,
      {
        userId: args.userId,
        authSubject: args.authSubject ?? undefined,
        communityId: args.communityId,
        targetMembershipId: args.targetMembershipId,
      },
    )) as {
      noop?: boolean;
      provider_subscription_targets?: Array<{
        provider_subscription_id: string;
        provider_account_id: string | null;
      }>;
    } | null;
    if (prepared?.noop) return { ok: true, stripe_canceled_count: 0 };

    const providerSubscriptionTargets = Array.isArray(prepared?.provider_subscription_targets)
      ? prepared.provider_subscription_targets
      : [];
    let stripeCanceledCount = 0;
    for (const target of providerSubscriptionTargets) {
      await cancelStripeSubscriptionIfActive({
        providerSubscriptionId: target.provider_subscription_id,
        providerAccountId: target.provider_account_id,
      });
      stripeCanceledCount += 1;
    }

    await ctx.runMutation(
      internal.communityAdmin.revokeCommunityMemberInternal as any,
      {
        userId: args.userId,
        authSubject: args.authSubject ?? undefined,
        communityId: args.communityId,
        targetMembershipId: args.targetMembershipId,
        revokedReason: providerSubscriptionTargets.length > 0
          ? "removed_by_manager_stripe_canceled"
          : "removed_by_manager",
        nowMs: Date.now(),
      },
    );
    return {
      ok: true,
      stripe_canceled_count: stripeCanceledCount,
    };
  },
});

export const banCommunityMember = action({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    targetMembershipId: v.id("communityMemberships"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const prepared = (await ctx.runQuery(
      internal.communityAdmin.prepareCommunityMemberRemovalInternal as any,
      {
        userId: args.userId,
        authSubject: args.authSubject ?? undefined,
        communityId: args.communityId,
        targetMembershipId: args.targetMembershipId,
      },
    )) as {
      noop?: boolean;
      target_user_id?: any;
      provider_subscription_targets?: Array<{
        provider_subscription_id: string;
        provider_account_id: string | null;
      }>;
    } | null;
    if (prepared?.noop || !prepared?.target_user_id) return { ok: true, stripe_canceled_count: 0 };

    const providerSubscriptionTargets = Array.isArray(prepared?.provider_subscription_targets)
      ? prepared.provider_subscription_targets
      : [];
    let stripeCanceledCount = 0;
    for (const target of providerSubscriptionTargets) {
      await cancelStripeSubscriptionIfActive({
        providerSubscriptionId: target.provider_subscription_id,
        providerAccountId: target.provider_account_id,
      });
      stripeCanceledCount += 1;
    }

    const nowMs = Date.now();
    await ctx.runMutation(
      internal.communityAdmin.revokeCommunityMemberInternal as any,
      {
        userId: args.userId,
        authSubject: args.authSubject ?? undefined,
        communityId: args.communityId,
        targetMembershipId: args.targetMembershipId,
        revokedReason: providerSubscriptionTargets.length > 0
          ? "banned_by_manager_stripe_canceled"
          : "banned_by_manager",
        nowMs,
      },
    );
    await ctx.runMutation(
      internal.communityAdmin.blockCommunityUserInternal as any,
      {
        userId: args.userId,
        authSubject: args.authSubject ?? undefined,
        communityId: args.communityId,
        targetUserId: prepared.target_user_id,
        reason: args.reason,
        nowMs,
      },
    );
    return {
      ok: true,
      stripe_canceled_count: stripeCanceledCount,
    };
  },
});

export const blockCommunityUserInternal = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    targetUserId: v.id("users"),
    reason: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    if (String(community.ownerId) === String(args.targetUserId)) {
      throw new Error("community_owner_ban_forbidden");
    }
    const targetMembershipRows = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q: any) =>
        q.eq("communityId", args.communityId).eq("userId", args.targetUserId),
      )
      .collect()) as CommunityMembershipLike[];
    const targetMembership = pickMostRelevantCommunityMembership(targetMembershipRows);
    if (targetMembership) {
      requireOwnerForAdminAuthorityChange({
        community,
        actorUserId: userId,
        targetMembership,
      });
    }
    const existing = await getActiveCommunityBlock({
      ctx,
      communityId: args.communityId,
      userId: args.targetUserId,
    });
    const reason = String(args.reason ?? "").trim().slice(0, 1000) || undefined;
    if (existing) {
      await ctx.db.patch(existing._id as any, {
        reason,
        updatedAt: nowMs,
      });
      return { ok: true };
    }
    await ctx.db.insert("communityBlocks" as any, {
      communityId: args.communityId,
      userId: args.targetUserId,
      createdByUserId: userId,
      reason,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { ok: true };
  },
});

export const unbanCommunityUser = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = Date.now();
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const block = (await getActiveCommunityBlock({
      ctx,
      communityId: args.communityId,
      userId: args.targetUserId,
    })) as CommunityBlockLike | null;
    if (!block) return { ok: true };
    await ctx.db.patch(block._id as any, {
      liftedAt: nowMs,
      updatedAt: nowMs,
    });
    return { ok: true };
  },
});

export const getCommunityMemberSettings = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    return await readCommunityMemberSettingsForUser(ctx, { communityId: args.communityId, userId });
  },
});

// A member's own settings in one community (mute), for Studio and a site's private twin.
async function readCommunityMemberSettingsForUser(ctx: any, args: { communityId: any; userId: any }) {
  await requireCommunityChatAccess({
    ctx,
    communityId: args.communityId,
    userId: args.userId,
  });
  const row = (await ctx.db
    .query("communityMemberSettings" as any)
    .withIndex("by_community_user", (q: any) =>
      q.eq("communityId", args.communityId).eq("userId", args.userId),
    )
    .first()) as CommunityMemberSettingsLike | null;
  return row ? await mapCommunityMemberSettingsRow(ctx, row) : null;
}

export const saveCommunityMemberSettings = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    muted: v.boolean(),
    mutedUntilIso: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    return await saveCommunityMemberSettingsForUser(ctx, { ...args, userId });
  },
});

// The one write of a member's own settings in a community, for Studio's
// signed-in user and a community site's private twin.
async function saveCommunityMemberSettingsForUser(
  ctx: any,
  args: { userId: any; communityId: any; muted: boolean; mutedUntilIso?: string | null },
) {
  return await runLoggedCommunityAdminMutation({
    operation: "save_member_settings",
    context: {
      actorUserId: args.userId,
      communityId: String(args.communityId),
      targetUserId: String(args.userId),
      muted: Boolean(args.muted),
    },
    handler: async () => {
      const nowMs = Date.now();
      await requireCommunityChatAccess({
        ctx,
        communityId: args.communityId,
        userId: args.userId,
      });
      const mutedUntil = parseIsoMs(args.mutedUntilIso);
      const existing = (await ctx.db
        .query("communityMemberSettings" as any)
        .withIndex("by_community_user", (q: any) =>
          q.eq("communityId", args.communityId).eq("userId", args.userId),
        )
        .first()) as CommunityMemberSettingsLike | null;
      if (existing) {
        await ctx.db.patch(existing._id as any, {
          muted: Boolean(args.muted),
          mutedUntil: typeof mutedUntil === "number" ? mutedUntil : undefined,
          updatedAt: nowMs,
        });
        const updated = (await ctx.db.get(
          existing._id as any,
        )) as CommunityMemberSettingsLike | null;
        if (!updated) throw new Error("community_member_settings_not_found");
        return await mapCommunityMemberSettingsRow(ctx, updated);
      }
      const id = await ctx.db.insert("communityMemberSettings" as any, {
        communityId: args.communityId,
        userId: args.userId,
        muted: Boolean(args.muted),
        mutedUntil: typeof mutedUntil === "number" ? mutedUntil : undefined,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const created = (await ctx.db.get(
        id as any,
      )) as CommunityMemberSettingsLike | null;
      if (!created)
        throw new Error("community_member_settings_create_failed");
      return await mapCommunityMemberSettingsRow(ctx, created);
    },
  });
}

// The same three member actions for a member whose private-twin session the
// caller (httpCommunityApps) already checked, in that session's community.
export const getCommunityMemberSettingsForTrustedUserInternal = internalQuery({
  args: { userId: v.id("users"), communityId: v.id("communities") },
  handler: async (ctx, args) => await readCommunityMemberSettingsForUser(ctx, args),
});

export const saveCommunityMemberSettingsForTrustedUserInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities"), muted: v.boolean() },
  handler: async (ctx, args) => await saveCommunityMemberSettingsForUser(ctx, { ...args, mutedUntilIso: null }),
});

export const leaveCommunityForTrustedUserInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities") },
  handler: async (ctx, args) => await leaveCommunityForUser(ctx, args),
});

export const approvePendingJoinRequestsForOpenAccessInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    actorUserId: v.optional(v.id("users")),
    startedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await runLoggedCommunityAdminMutation({
      operation: "approve_pending_join_requests_for_open_access",
      context: {
        actorUserId: args.actorUserId ?? null,
        communityId: String(args.communityId),
        startedAt: args.startedAt,
      },
      handler: async () => {
        const community = (await ctx.db.get(args.communityId)) as CommunityLike | null;
        if (!community) throw new Error("community_not_found");
        if (resolveCommunityEntryPolicy(community) !== "open") {
          return {
            approved_pending_request_count: 0,
            pending_request_overflow: false,
          };
        }
        const batch = await approvePendingJoinRequestsForOpenAccessBatch({
          ctx,
          community,
          nowMs: Date.now(),
          limit: OPEN_ACCESS_PENDING_APPROVAL_BATCH_LIMIT,
        });
        if (batch.hasMore) {
          await scheduleOpenAccessPendingApprovalContinuation({
            ctx,
            communityId: community._id,
            actorUserId: args.actorUserId,
            startedAt: args.startedAt,
          });
        }
        return {
          approved_pending_request_count: batch.approvedCount,
          pending_request_overflow: batch.hasMore,
        };
      },
    });
  },
});

export const setCommunityFreeAccessMode = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    mode: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    return await runLoggedCommunityAdminMutation({
      operation: "set_free_access_mode",
      context: {
        actorUserId: args.userId,
        communityId: String(args.communityId),
        mode: String(args.mode ?? "")
          .trim()
          .toLowerCase(),
      },
      handler: async () => {
        const nowMs = Date.now();
        const { community } = await requireCommunityManager({
          ctx,
          communityId: args.communityId,
          userId: args.userId,
        });
        const nextMode = String(args.mode ?? "")
          .trim()
          .toLowerCase();
        if (nextMode !== "open" && nextMode !== "approval") {
          throw new Error("community_free_access_mode_invalid");
        }
        const currentEntryPolicy = resolveCommunityEntryPolicy(community);
        const nextEntryPolicy =
          currentEntryPolicy === "paid_subscription"
            ? currentEntryPolicy
            : nextMode;
        await ctx.db.patch(community._id as any, {
          entryPolicy: nextEntryPolicy,
          updatedAt: nowMs,
        });
        const updated = (await ctx.db.get(
          community._id as any,
        )) as CommunityLike | null;
        if (!updated) throw new Error("community_not_found");
        const entryPolicy = resolveCommunityEntryPolicy(updated);
        let approvedPendingRequestCount = 0;
        let pendingRequestOverflow = false;
        if (entryPolicy === "open" && currentEntryPolicy !== "paid_subscription") {
          const batch = await approvePendingJoinRequestsForOpenAccessBatch({
            ctx,
            community: updated,
            nowMs,
            limit: OPEN_ACCESS_PENDING_APPROVAL_BATCH_LIMIT,
          });
          approvedPendingRequestCount = batch.approvedCount;
          pendingRequestOverflow = batch.hasMore;
          if (batch.hasMore) {
            await scheduleOpenAccessPendingApprovalContinuation({
              ctx,
              communityId: updated._id,
              actorUserId: args.userId,
              startedAt: nowMs,
            });
          }
        }
        return {
          community_id: String(updated._id),
          entry_policy: entryPolicy,
          approved_pending_request_count: approvedPendingRequestCount,
          pending_request_overflow: pendingRequestOverflow,
          updated_at: toIsoString(updated.updatedAt),
        };
      },
    });
  },
});

export const leaveCommunity = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    return await leaveCommunityForUser(ctx, { communityId: args.communityId, userId });
  },
});

// The one way a member leaves, for Studio's signed-in user and a community
// site's private twin. The owner can't.
async function leaveCommunityForUser(ctx: any, args: { communityId: any; userId: any }) {
  return await runLoggedCommunityAdminMutation({
    operation: "leave_community",
    context: {
      actorUserId: args.userId,
      communityId: String(args.communityId),
    },
    handler: async () => {
      const nowMs = Date.now();
      const community = (await ctx.db.get(
        args.communityId,
      )) as CommunityLike | null;
      if (!community) throw new Error("community_not_found");
      if (String(community.ownerId) === String(args.userId)) {
        throw new Error("community_owner_cannot_leave");
      }
      const membership = await getUniqueCommunityMembershipByPair({
        ctx,
        communityId: args.communityId,
        userId: args.userId,
      });
      if (membership) {
        await endCommunitySubscriptionsForMembership({
          ctx,
          membershipId: membership._id,
          nowMs,
        });
        const preservePlatformHomeRelationship = isPlatformHomeCommunity({
          communitySlug: community.slug,
        });
        const after = preservePlatformHomeRelationship
          ? ({
              ...membership,
              active: false,
              revokedAt: nowMs,
              revokedReason: PLATFORM_HOME_MEMBER_LEFT_REVOKED_REASON,
              updatedAt: nowMs,
            } as CommunityMembershipLike)
          : null;
        if (after) {
          await ctx.db.patch(membership._id as any, {
            active: false,
            revokedAt: nowMs,
            revokedReason: PLATFORM_HOME_MEMBER_LEFT_REVOKED_REASON,
            updatedAt: nowMs,
          });
        } else {
          await ctx.db.delete(membership._id as any);
          await deleteMemberWorkflowPosition({ ctx, communityId: args.communityId, membershipId: membership._id as any });
        }
        await adjustCommunityActiveMemberCountForMembershipTransition({
          ctx,
          communityId: args.communityId,
          before: membership,
          after,
        });
      }
      const memberSettings = (await ctx.db
        .query("communityMemberSettings" as any)
        .withIndex("by_community_user", (q: any) =>
          q.eq("communityId", args.communityId).eq("userId", args.userId),
        )
        .first()) as CommunityMemberSettingsLike | null;
      if (memberSettings) {
        await ctx.db.delete(memberSettings._id as any);
      }
      await deleteCommunityReadCursorsForUserCommunity(
        ctx,
        args.communityId,
        args.userId,
      );
      await deleteCommunityJoinRequestByPair({
        ctx,
        communityId: args.communityId,
        userId: args.userId,
      });
      await syncCommunityAccessForUser(ctx, {
        communityId: args.communityId,
        userId: args.userId,
        nowMs,
        reason: "member_left",
      });
      return { ok: true };
    },
  });
}

export const getCommunityAnalyticsSnapshot = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    range: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const range = normalizeAnalyticsRange(args.range);
    const { community, rows } = await listCommunityMembershipRowsForManager({
      ctx,
      communityId: args.communityId,
      userId,
      authSubject: args.authSubject ?? null,
    });

    const nowMs = Date.now();
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
      }
      monthlyRows.push({
        createdAt: subscription.createdAt,
        endedAt: endedAt == null ? null : endedAt,
        amountBaseUnits: monthlyBaseUnits,
      });
    }

    return {
      range,
      bucket,
      generated_at: toIsoString(nowMs),
      summary: {
        page_visits_window: visitRows.length,
        total_members: 1 + rows.length,
        new_members_window: memberRowsWindow.length,
        conversion_rate_window:
          visitRows.length > 0 ? memberRowsWindow.length / visitRows.length : null,
        mrr_base_units: mixedCurrency ? null : mrrBaseUnits,
        currency: mixedCurrency ? null : currency,
        currency_decimals: mixedCurrency ? null : currencyDecimals,
        active_members_window: null,
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
  },
});
