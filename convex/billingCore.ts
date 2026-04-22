import { resolveUserIdForAuthenticatedRequest } from "./authActor";
export { resolveUserIdForAuthenticatedRequest } from "./authActor";
import {
  communitySubscriptionStatusGrantsAccess,
  normalizeCommunitySubscriptionStatus,
  resolveCommunityEntryPolicy,
} from "./communityCore";
import { enqueueCommunityAccessGrantedEmailInternal } from "./emailEvents";

export type CommunityLike = {
  _id: any;
  ownerId?: any;
  slug: string;
  name: string;
  oneLiner?: string;
  entryPolicy?: "open" | "approval" | "paid_subscription";
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

export function normalizeBuilderTier(raw: unknown): "builder" {
  const tier = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (tier === "builder") return "builder";
  if (tier === "architect" || tier === "pro") return "builder";
  throw new Error("builder_tier_invalid");
}

export function normalizeSlug(raw: unknown): string {
  const slug = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!slug) throw new Error("community_slug_required");
  if (!/^[a-z0-9-]{3,64}$/.test(slug)) throw new Error("community_slug_invalid");
  return slug;
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

export function buildCheckoutSuccessUrl(successUrlRaw: unknown, sessionId: string): string {
  const successUrl = String(successUrlRaw ?? "").trim();
  if (!successUrl) throw new Error("checkout_success_url_required");
  if (successUrl.includes("{CHECKOUT_SESSION_ID}")) {
    return successUrl.replaceAll("{CHECKOUT_SESSION_ID}", sessionId);
  }
  try {
    const parsed = new URL(successUrl);
    parsed.searchParams.set("session_id", sessionId);
    return parsed.toString();
  } catch {
    const separator = successUrl.includes("?") ? "&" : "?";
    return `${successUrl}${separator}session_id=${encodeURIComponent(sessionId)}`;
  }
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
  const existing = await args.ctx.db
    .query("communityMemberships")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", args.userId))
    .first() as CommunityMembershipLike | null;
  const defaultAccessSource = "paid_subscription";
  const accessSource = args.accessSourceOverride ?? defaultAccessSource;
  if (existing) {
    const patch: Record<string, unknown> = {
      accessSource,
      active: true,
      revokedAt: undefined,
      revokedReason: undefined,
      updatedAt: args.nowMs,
    };
    if (args.pricePointId) patch.pricePointId = args.pricePointId;
    await args.ctx.db.patch(existing._id, patch);
    const refreshed = (await args.ctx.db.get(existing._id)) as CommunityMembershipLike | null;
    if (!refreshed) throw new Error("community_membership_not_found");
    return {
      membership: refreshed,
      accessGranted: !Boolean(existing.active),
    };
  }
  const membershipId = await args.ctx.db.insert("communityMemberships", {
    communityId: args.communityId,
    userId: args.userId,
    role: "member",
    accessSource,
    pricePointId: args.pricePointId,
    active: true,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const created = (await args.ctx.db.get(membershipId)) as CommunityMembershipLike | null;
  if (!created) throw new Error("community_membership_create_failed");
  return {
    membership: created,
    accessGranted: true,
  };
}

export async function createCommunitySubscriptionForMembership(args: {
  ctx: any;
  communityId: any;
  membershipId: any;
  userId: any;
  pricePointId: any;
  source?: "stripe" | "external_sync";
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
  const existing = await args.ctx.db
    .query("communitySubscriptions" as any)
    .withIndex("by_membership", (q: any) => q.eq("membershipId", args.membershipId))
    .first();
  if (existing) {
    await args.ctx.db.patch(existing._id, {
      source,
      pricePointId: args.pricePointId,
      status,
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
    return;
  }
  await args.ctx.db.insert("communitySubscriptions" as any, {
    communityId: args.communityId,
    userId: args.userId,
    membershipId: args.membershipId,
    pricePointId: args.pricePointId,
    source,
    status,
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
        claimToken?: string;
        status?: string;
        expiresAt?: number;
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
