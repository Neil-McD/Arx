import { resolveUserIdForAuthenticatedRequest } from "./authActor";
export { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { internal } from "./_generated/api";
import {
  communitySubscriptionStatusGrantsAccess,
  getUniqueCommunitySubscriptionByMembership,
  normalizeCommunitySubscriptionStatus,
} from "./communityCore";
import { recordCriticalAuditEventBestEffort } from "./criticalAudit";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";
import { attachStripeCustomerToUser } from "./stripeCustomers";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";

export type CommunityLike = {
  _id: any;
  ownerId?: any;
  slug: string;
  name: string;
  oneLiner?: string;
  entryPolicy?: "open" | "approval" | "paid_subscription";
};

async function scheduleCommunityAppGrantSeedingBestEffort(args: {
  ctx: any;
  communityId: any;
  userId: any;
  nowMs: number;
  reason: string;
}): Promise<void> {
  try {
    await args.ctx.scheduler.runAfter(
      0,
      internal.userPlatformAppMounts.seedCommunityAppGrantsForUserInternal,
      {
        communityId: args.communityId,
        userId: args.userId,
        nowMs: args.nowMs,
      },
    );
  } catch (error) {
    console.warn("community_app_grant_seed_schedule_failed", {
      community_id: String(args.communityId),
      user_id: String(args.userId),
      reason: args.reason,
      error: error instanceof Error ? error.message : String(error ?? ""),
    });
  }
}

export type CommunityPricePointLike = {
  _id: any;
  communityId: any;
  billingPeriod: "monthly" | "annual";
  name: string;
  description?: string;
  amountBaseUnits: number;
  currency: string;
  currencyDecimals: number;
  isCurrent: boolean;
  archivedAt?: number;
  providerPriceId?: string;
  createdAt: number;
  updatedAt: number;
};

export type CommunityMembershipLike = {
  _id: any;
  communityId: any;
  userId: any;
  role: string;
  accessSource?: string;
  pricePointId?: any;
  active?: boolean;
  revokedAt?: number;
  revokedReason?: string;
  createdAt: number;
  updatedAt: number;
};

export function normalizeBillingPeriod(raw: unknown): "monthly" | "annual" {
  const period = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (period === "annual") return "annual";
  return "monthly";
}

export function normalizeSlug(raw: unknown): string {
  const slug = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!slug) throw new Error("community_slug_required");
  if (!/^[a-z0-9-]{3,64}$/.test(slug)) throw new Error("community_slug_invalid");
  return slug;
}

export function requireCanonicalCheckoutReturnUrl(
  urlRaw: unknown,
  errorCode: string,
): string {
  const raw = String(urlRaw ?? "").trim();
  if (!raw) throw new Error(errorCode);
  const parseTarget = raw.replaceAll("{CHECKOUT_SESSION_ID}", "CHECKOUT_SESSION_ID");
  let parsed: URL;
  try {
    parsed = new URL(parseTarget);
  } catch {
    throw new Error(errorCode);
  }
  if (parsed.username || parsed.password) throw new Error(errorCode);
  if (parsed.origin !== readCanonicalPublicAppOrigin()) throw new Error(errorCode);
  return raw;
}

export function normalizeSessionId(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) throw new Error("checkout_session_id_required");
  return value.slice(0, 200);
}

export function toIsoString(value: number): string {
  return new Date(Math.floor(value)).toISOString();
}

export function newOpaqueToken(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

export type LocalCommunitySubscriptionStatus =
  | "active"
  | "past_due"
  | "cancel_at_period_end"
  | "canceled"
  | "ended";

export function normalizeStripeCommunitySubscriptionStatus(args: {
  subscriptionStatus: unknown;
  cancelAtPeriodEnd?: unknown;
}): LocalCommunitySubscriptionStatus {
  const subscriptionStatus = String(args.subscriptionStatus ?? "")
    .trim()
    .toLowerCase();
  const cancelAtPeriodEnd = Boolean(args.cancelAtPeriodEnd);
  if (subscriptionStatus === "cancel_at_period_end") {
    return "cancel_at_period_end";
  }
  if (subscriptionStatus === "ended") return "ended";
  if (subscriptionStatus === "active" || subscriptionStatus === "trialing") {
    return cancelAtPeriodEnd ? "cancel_at_period_end" : "active";
  }
  if (subscriptionStatus === "past_due") return "past_due";
  if (subscriptionStatus === "canceled") return "canceled";
  if (
    subscriptionStatus === "unpaid" ||
    subscriptionStatus === "incomplete" ||
    subscriptionStatus === "incomplete_expired" ||
    subscriptionStatus === "paused"
  ) {
    return "ended";
  }
  return "ended";
}

export function buildCheckoutSuccessUrl(successUrlRaw: unknown, sessionId: string): string {
  const successUrl = requireCanonicalCheckoutReturnUrl(
    successUrlRaw,
    "checkout_success_url_invalid",
  );
  if (successUrl.includes("{CHECKOUT_SESSION_ID}")) {
    return successUrl.replaceAll("{CHECKOUT_SESSION_ID}", sessionId);
  }
  const parsed = new URL(successUrl);
  parsed.searchParams.set("session_id", sessionId);
  return parsed.toString();
}

export async function ensureCommunityMembership(args: {
  ctx: any;
  community: CommunityLike;
  communityId: any;
  userId: any;
  pricePointId?: any;
  accessSourceOverride?: "free_grant" | "manual_grant" | "paid_subscription";
  nowMs: number;
}): Promise<{ membership: CommunityMembershipLike; accessGranted: boolean }> {
  const defaultAccessSource = "paid_subscription";
  const accessSource = args.accessSourceOverride ?? defaultAccessSource;
  const activation = await activateCommunityMembershipCore({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
    role: "member",
    accessSource,
    pricePointId: args.pricePointId,
    activationReason: "billing_entitlement",
    nowMs: args.nowMs,
  });
  await scheduleCommunityAppGrantSeedingBestEffort({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
    nowMs: args.nowMs,
    reason: activation.accessGranted
      ? "community_membership_ensured_activated"
      : "community_membership_ensured_existing",
  });
  return { membership: activation.membership, accessGranted: activation.accessGranted };
}

export async function createCommunitySubscriptionForMembership(args: {
  ctx: any;
  communityId: any;
  membershipId: any;
  userId: any;
  pricePointId: any;
  providerSubscriptionId: string;
  providerCustomerId?: string | null;
  platformFeeBps?: number | null;
  currentPeriodStartAt?: number | null;
  currentPeriodEndAt?: number | null;
  status?: "active" | "past_due" | "cancel_at_period_end" | "canceled" | "ended";
  cancelAtPeriodEnd?: boolean | null;
  nowMs: number;
}): Promise<void> {
  const status = args.status ?? "active";
  const cancelAtPeriodEnd = Boolean(args.cancelAtPeriodEnd ?? status === "cancel_at_period_end");
  const endedAt = status === "canceled" || status === "ended" ? args.nowMs : undefined;
  const providerSubscriptionId = String(args.providerSubscriptionId ?? "").trim();
  if (!providerSubscriptionId) throw new Error("community_subscription_provider_id_required");
  await attachStripeCustomerToUser({
    ctx: args.ctx,
    userId: args.userId,
    providerCustomerId: args.providerCustomerId,
    nowMs: args.nowMs,
  });
  const existing = await getUniqueCommunitySubscriptionByMembership({
    ctx: args.ctx,
    membershipId: args.membershipId,
  });
  const providerRows = await args.ctx.db
    .query("communitySubscriptions" as any)
    .withIndex("by_providerSubscriptionId", (q: any) =>
      q.eq("providerSubscriptionId", providerSubscriptionId),
    )
    .take(2);
  if (providerRows.length > 1) throw new Error("community_subscription_duplicate_provider");
  if (
    providerRows[0] &&
    String(providerRows[0].membershipId) !== String(args.membershipId)
  ) {
    throw new Error("community_subscription_provider_conflict");
  }
  const existingProviderSubscriptionId = String(existing?.providerSubscriptionId ?? "").trim();
  if (
    existingProviderSubscriptionId &&
    existingProviderSubscriptionId !== providerSubscriptionId &&
    communitySubscriptionStatusGrantsAccess(
      normalizeCommunitySubscriptionStatus(existing?.status),
    )
  ) {
    throw new Error("community_subscription_active_provider_conflict");
  }
  const normalizedPlatformFeeBps =
    typeof args.platformFeeBps === "number" && Number.isFinite(args.platformFeeBps)
      ? Math.max(0, Math.min(10000, Math.round(args.platformFeeBps)))
      : undefined;
  if (existing) {
    await args.ctx.db.patch(existing._id, {
      source: "stripe",
      pricePointId: args.pricePointId,
      status,
      providerSubscriptionId,
      providerCustomerId:
        String(args.providerCustomerId ?? "").trim() || existing.providerCustomerId,
      platformFeeBps: normalizedPlatformFeeBps ?? existing.platformFeeBps,
      currentPeriodStartAt:
        typeof args.currentPeriodStartAt === "number"
          ? args.currentPeriodStartAt
          : existing.currentPeriodStartAt,
      currentPeriodEndAt:
        typeof args.currentPeriodEndAt === "number"
          ? args.currentPeriodEndAt
          : existing.currentPeriodEndAt,
      cancelAtPeriodEnd,
      endedAt,
      updatedAt: args.nowMs,
    });
    await recordCriticalAuditEventBestEffort(args.ctx, {
      eventKey: `community_subscription_synced:${providerSubscriptionId}:${status}:${args.nowMs}`,
      eventType: "community_subscription_synced",
      status: "succeeded",
      actorUserId: args.userId,
      subjectUserId: args.userId,
      communityId: args.communityId,
      provider: "stripe",
      providerObjectId: providerSubscriptionId,
      metadata: {
        membershipId: String(args.membershipId),
        pricePointId: String(args.pricePointId),
        subscriptionStatus: status,
        source: "stripe",
        cancelAtPeriodEnd,
      },
      createdAt: args.nowMs,
    });
    return;
  }
  await args.ctx.db.insert("communitySubscriptions" as any, {
    communityId: args.communityId,
    userId: args.userId,
    membershipId: args.membershipId,
    pricePointId: args.pricePointId,
    source: "stripe",
    status,
    providerSubscriptionId,
    providerCustomerId: String(args.providerCustomerId ?? "").trim() || undefined,
    platformFeeBps: normalizedPlatformFeeBps,
    currentPeriodStartAt:
      typeof args.currentPeriodStartAt === "number" ? args.currentPeriodStartAt : undefined,
    currentPeriodEndAt:
      typeof args.currentPeriodEndAt === "number" ? args.currentPeriodEndAt : undefined,
    cancelAtPeriodEnd,
    endedAt,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  await recordCriticalAuditEventBestEffort(args.ctx, {
    eventKey: `community_subscription_synced:${providerSubscriptionId}:${status}:${args.nowMs}`,
    eventType: "community_subscription_synced",
    status: "succeeded",
    actorUserId: args.userId,
    subjectUserId: args.userId,
    communityId: args.communityId,
    provider: "stripe",
    providerObjectId: providerSubscriptionId,
    metadata: {
      membershipId: String(args.membershipId),
      pricePointId: String(args.pricePointId),
      subscriptionStatus: status,
      source: "stripe",
      cancelAtPeriodEnd,
    },
    createdAt: args.nowMs,
  });
}

export async function resolveCheckoutPricePoint(args: {
  ctx: any;
  community: CommunityLike;
  billingPeriod: "monthly" | "annual";
  nowMs: number;
}): Promise<CommunityPricePointLike | null> {
  const currentRows = (await args.ctx.db
    .query("communityPricePoints" as any)
    .withIndex("by_community_billingPeriod", (q: any) =>
      q.eq("communityId", args.community._id).eq("billingPeriod", args.billingPeriod),
    )
    .collect()) as CommunityPricePointLike[];
  const current =
    currentRows
      .filter((row) => Boolean(row.isCurrent) && !row.archivedAt)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
  if (current) return current;
  return null;
}
