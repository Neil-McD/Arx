
export { resolveUserIdForAuthenticatedRequest } from "./authActor";
import {
  communitySubscriptionStatusGrantsAccess,
  normalizeCommunitySubscriptionStatus,
  requireCommunityUserNotBlocked,
  resolveCommunityEntryPolicy,
} from "./communityCore";
import { enqueueCommunityAccessGrantedEmailInternal } from "./emailEvents";
import { recordCriticalAuditEventBestEffort } from "./criticalAudit";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import {
  communityIsActive,
  communityLifecycleGenerationMatches,
} from "../shared/communityLifecycle";

export type CommunityLike = {
  _id: any;
  ownerId?: any;
  slug: string;
  name: string;
  oneLiner?: string;
  entryPolicy?: "open" | "approval" | "paid_subscription";
  lifecycleStatus?: "active" | "archived";
  lifecycleGeneration?: number;
};

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
  providerAccountId?: string;
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

export type PurchaseClaimLike = {
  _id: any;
  claimToken: string;
  communityId: any;
  billingPeriod?: "monthly" | "annual";
  pricePointId?: any;
  amountBaseUnits?: number;
  currency?: string;
  currencyDecimals?: number;
  ownerUserId?: any;
  status: "pending" | "redeemed" | "expired";
  sourceSessionId?: string;
  redeemedByUserId?: any;
  redeemedAt?: number;
  expiresAt: number;
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

export function normalizeClaimToken(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) throw new Error("claim_token_required");
  return value.slice(0, 300);
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

export function buildCheckoutCancelUrl(cancelUrlRaw: unknown, sessionId: string): string {
  const cancelUrl = requireCanonicalCheckoutReturnUrl(
    cancelUrlRaw,
    "checkout_cancel_url_invalid",
  );
  if (cancelUrl.includes("{CHECKOUT_SESSION_ID}")) {
    return cancelUrl.replaceAll("{CHECKOUT_SESSION_ID}", sessionId);
  }
  const parsed = new URL(cancelUrl);
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
  return { membership: activation.membership, accessGranted: activation.accessGranted };
}

export async function createCommunitySubscriptionForMembership(args: {
  ctx: any;
  communityId: any;
  membershipId: any;
  userId: any;
  pricePointId: any;
  source?: "stripe" | "external_sync";
  providerAccountId?: string | null;
  providerSubscriptionId?: string | null;
  providerCustomerId?: string | null;
  currentPeriodStartAt?: number | null;
  currentPeriodEndAt?: number | null;
  status?: "active" | "past_due" | "cancel_at_period_end" | "canceled" | "ended";
  cancelAtPeriodEnd?: boolean | null;
  nowMs: number;
}): Promise<void> {
  const source = args.source ?? "stripe";
  const status = args.status ?? "active";
  const cancelAtPeriodEnd = Boolean(args.cancelAtPeriodEnd ?? status === "cancel_at_period_end");
  const endedAt = status === "canceled" || status === "ended" ? args.nowMs : undefined;
  const providerAccountId = String(args.providerAccountId ?? "").trim();
  if (source === "stripe" && !providerAccountId) {
    throw new Error("community_subscription_provider_account_required");
  }
  const existingRows = await args.ctx.db
    .query("communitySubscriptions" as any)
    .withIndex("by_membership", (q: any) => q.eq("membershipId", args.membershipId))
    .collect();
  const existing = source === "stripe"
    ? existingRows.find(
        (row: any) => String(row.providerAccountId ?? "").trim() === providerAccountId,
      ) ?? null
    : existingRows[0] ?? null;
  if (existing) {
    await args.ctx.db.patch(existing._id, {
      source,
      pricePointId: args.pricePointId,
      status,
      providerAccountId: providerAccountId || existing.providerAccountId,
      providerSubscriptionId:
        String(args.providerSubscriptionId ?? "").trim() || existing.providerSubscriptionId,
      providerCustomerId:
        String(args.providerCustomerId ?? "").trim() || existing.providerCustomerId,
      currentPeriodStartAt:
        typeof args.currentPeriodStartAt === "number" ? args.currentPeriodStartAt : undefined,
      currentPeriodEndAt:
        typeof args.currentPeriodEndAt === "number" ? args.currentPeriodEndAt : undefined,
      cancelAtPeriodEnd,
      endedAt,
      updatedAt: args.nowMs,
    });
    await recordCriticalAuditEventBestEffort(args.ctx, {
      eventKey: `community_subscription_synced:${args.providerSubscriptionId ?? existing.providerSubscriptionId ?? args.membershipId}:${status}:${args.nowMs}`,
      eventType: "community_subscription_synced",
      status: "succeeded",
      actorUserId: args.userId,
      subjectUserId: args.userId,
      communityId: args.communityId,
      provider: source === "stripe" ? "stripe" : "polynet",
      providerObjectId: String(args.providerSubscriptionId ?? existing.providerSubscriptionId ?? "").trim() || undefined,
      metadata: {
        membershipId: String(args.membershipId),
        pricePointId: String(args.pricePointId),
        subscriptionStatus: status,
        source,
        providerAccountId: providerAccountId || null,
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
    source,
    status,
    providerAccountId: providerAccountId || undefined,
    providerSubscriptionId: String(args.providerSubscriptionId ?? "").trim() || undefined,
    providerCustomerId: String(args.providerCustomerId ?? "").trim() || undefined,
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
    eventKey: `community_subscription_synced:${args.providerSubscriptionId ?? args.membershipId}:${status}:${args.nowMs}`,
    eventType: "community_subscription_synced",
    status: "succeeded",
    actorUserId: args.userId,
    subjectUserId: args.userId,
    communityId: args.communityId,
    provider: source === "stripe" ? "stripe" : "polynet",
    providerObjectId: String(args.providerSubscriptionId ?? "").trim() || undefined,
    metadata: {
      membershipId: String(args.membershipId),
      pricePointId: String(args.pricePointId),
      subscriptionStatus: status,
      source,
      providerAccountId: providerAccountId || null,
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

export async function redeemClaimRow(args: {
  ctx: any;
  claim: PurchaseClaimLike;
  userId: any;
  nowMs: number;
}): Promise<{
  communityId: string | null;
  accessGranted: boolean;
  grantMarker: string | null;
}> {
  if (args.claim.status !== "pending") {
    if (args.claim.status === "redeemed" && args.claim.redeemedByUserId === args.userId) {
      return {
        communityId: String(args.claim.communityId),
        accessGranted: false,
        grantMarker: null,
      };
    }
    return {
      communityId: null,
      accessGranted: false,
      grantMarker: null,
    };
  }
  if (args.claim.expiresAt <= args.nowMs) {
    await args.ctx.db.patch(args.claim._id, {
      status: "expired",
      updatedAt: args.nowMs,
    });
    return {
      communityId: null,
      accessGranted: false,
      grantMarker: null,
    };
  }
  let checkoutSession:
    | {
        mode?: string;
        communityId?: any;
        claimToken?: string;
        status?: string;
        expiresAt?: number;
        providerAccountId?: string;
        providerSubscriptionId?: string;
        providerCustomerId?: string;
        currentPeriodStartAt?: number;
        currentPeriodEndAt?: number;
        communitySubscriptionStatus?:
          | "active"
          | "past_due"
          | "cancel_at_period_end"
          | "canceled"
          | "ended";
        cancelAtPeriodEnd?: boolean;
        communityLifecycleGeneration?: number;
      }
    | null = null;
  if (args.claim.sourceSessionId) {
    checkoutSession = await args.ctx.db
      .query("checkoutSessions" as any)
      .withIndex("by_sessionId", (q: any) => q.eq("sessionId", args.claim.sourceSessionId))
      .first();
    if (!checkoutSession) {
      return {
        communityId: null,
        accessGranted: false,
        grantMarker: null,
      };
    }
    if (String(checkoutSession.mode ?? "").trim().toLowerCase() !== "community_join") {
      return {
        communityId: null,
        accessGranted: false,
        grantMarker: null,
      };
    }
    if (String(checkoutSession.claimToken ?? "").trim() !== args.claim.claimToken) {
      return {
        communityId: null,
        accessGranted: false,
        grantMarker: null,
      };
    }
    if (String(checkoutSession.communityId ?? "") !== String(args.claim.communityId)) {
      return {
        communityId: null,
        accessGranted: false,
        grantMarker: null,
      };
    }
    if (
      args.nowMs > Number(checkoutSession.expiresAt ?? 0) ||
      String(checkoutSession.status ?? "").trim().toLowerCase() !== "complete"
    ) {
      return {
        communityId: null,
        accessGranted: false,
        grantMarker: null,
      };
    }
    const checkoutStatus =
      normalizeCommunitySubscriptionStatus(checkoutSession.communitySubscriptionStatus ?? "active") ??
      "active";
    if (!communitySubscriptionStatusGrantsAccess(checkoutStatus)) {
      return {
        communityId: null,
        accessGranted: false,
        grantMarker: null,
      };
    }
  }
  const community = (await args.ctx.db.get(args.claim.communityId)) as CommunityLike | null;
  if (!community) {
    return {
      communityId: null,
      accessGranted: false,
      grantMarker: null,
    };
  }
  if (
    !communityIsActive(community) ||
    !communityLifecycleGenerationMatches(
      community,
      checkoutSession?.communityLifecycleGeneration,
    )
  ) {
    return {
      communityId: null,
      accessGranted: false,
      grantMarker: null,
    };
  }
  await requireCommunityUserNotBlocked({
    ctx: args.ctx,
    communityId: args.claim.communityId,
    userId: args.userId,
  });
  const { membership, accessGranted } = await ensureCommunityMembership({
    ctx: args.ctx,
    community,
    communityId: args.claim.communityId,
    userId: args.userId,
    pricePointId: args.claim.pricePointId,
    nowMs: args.nowMs,
  });
  if (args.claim.pricePointId && resolveCommunityEntryPolicy(community as any) === "paid_subscription") {
    await createCommunitySubscriptionForMembership({
      ctx: args.ctx,
      communityId: args.claim.communityId,
      membershipId: membership._id,
      userId: args.userId,
      pricePointId: args.claim.pricePointId,
      source: "stripe",
      providerAccountId: checkoutSession?.providerAccountId ?? null,
      providerSubscriptionId: checkoutSession?.providerSubscriptionId ?? null,
      providerCustomerId: checkoutSession?.providerCustomerId ?? null,
      currentPeriodStartAt: checkoutSession?.currentPeriodStartAt ?? null,
      currentPeriodEndAt: checkoutSession?.currentPeriodEndAt ?? null,
      status:
        normalizeCommunitySubscriptionStatus(checkoutSession?.communitySubscriptionStatus ?? "active") ??
        "active",
      cancelAtPeriodEnd: checkoutSession?.cancelAtPeriodEnd ?? false,
      nowMs: args.nowMs,
    });
  }
  await args.ctx.db.patch(args.claim._id, {
    status: "redeemed",
    redeemedByUserId: args.userId,
    redeemedAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const communityId = String(args.claim.communityId);
  if (accessGranted) {
    await enqueueCommunityAccessGrantedEmailInternal({
      ctx: args.ctx,
      userId: args.userId,
      communityId: args.claim.communityId,
      grantMarker: `${String(membership._id)}:${membership.updatedAt}`,
      nowMs: args.nowMs,
    });
  }
  return {
    communityId,
    accessGranted,
    grantMarker: accessGranted
      ? `${String(membership._id)}:${membership.updatedAt}`
      : null,
  };
}
