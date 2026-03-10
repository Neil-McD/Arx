import { resolveAuthenticatedSubject } from "./authIdentity";
import { resolveCommunityEntryPolicy } from "./communityCore";

export type CommunityLike = {
  _id: any;
  slug: string;
  name: string;
  entryPolicy?: "open" | "approval" | "paid_unlock" | "paid_subscription";
};

export type CommunityPricePointLike = {
  _id: any;
  communityId: any;
  kind: "unlock" | "subscription";
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

function normalizeIdValue(raw: unknown): string {
  return String(raw ?? "").trim();
}

export async function resolveUserIdForAuthenticatedRequest(args: {
  ctx: any;
  userId?: any;
  authSubject?: string | null;
}): Promise<any> {
  const userIdInput = normalizeIdValue(args.userId);
  const authSubject = await resolveAuthenticatedSubject({
    ctx: args.ctx,
    authSubject: args.authSubject ?? null,
  });
  const user = await args.ctx.db
    .query("users")
    .withIndex("by_authSubject", (q: any) => q.eq("authSubject", authSubject))
    .first();
  if (!user) throw new Error("user_not_found");
  const resolvedUserId = normalizeIdValue(user._id);
  if (userIdInput && userIdInput !== resolvedUserId) {
    throw new Error("user_id_mismatch");
  }
  return user._id;
}

export function normalizeBillingPeriod(raw: unknown): "monthly" | "annual" {
  const period = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (period === "annual") return "annual";
  return "monthly";
}

export function normalizeBuilderTier(raw: unknown): "builder" | "architect" {
  const tier = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (tier === "builder") return "builder";
  if (tier === "architect" || tier === "pro") return "architect";
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
  nowMs: number;
}): Promise<CommunityMembershipLike> {
  const existing = await args.ctx.db
    .query("communityMemberships")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", args.userId))
    .first() as CommunityMembershipLike | null;
  const accessSource =
    resolveCommunityEntryPolicy(args.community as any) === "paid_subscription" ? "paid_subscription" : "paid_unlock";
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
    return refreshed;
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
  return created;
}

export async function createCommunitySubscriptionForMembership(args: {
  ctx: any;
  communityId: any;
  membershipId: any;
  userId: any;
  pricePointId: any;
  nowMs: number;
}): Promise<void> {
  const existing = await args.ctx.db
    .query("communitySubscriptions" as any)
    .withIndex("by_membership", (q: any) => q.eq("membershipId", args.membershipId))
    .first();
  if (existing) {
    await args.ctx.db.patch(existing._id, {
      pricePointId: args.pricePointId,
      status: "active",
      cancelAtPeriodEnd: false,
      endedAt: undefined,
      updatedAt: args.nowMs,
    });
    return;
  }
  await args.ctx.db.insert("communitySubscriptions" as any, {
    communityId: args.communityId,
    userId: args.userId,
    membershipId: args.membershipId,
    pricePointId: args.pricePointId,
    status: "active",
    cancelAtPeriodEnd: false,
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
}): Promise<string | null> {
  if (args.claim.status !== "pending") {
    if (args.claim.status === "redeemed" && args.claim.redeemedByUserId === args.userId) {
      return String(args.claim.communityId);
    }
    return null;
  }
  if (args.claim.expiresAt <= args.nowMs) {
    await args.ctx.db.patch(args.claim._id, {
      status: "expired",
      updatedAt: args.nowMs,
    });
    return null;
  }
  const community = (await args.ctx.db.get(args.claim.communityId)) as CommunityLike | null;
  if (!community) return null;
  const membership = await ensureCommunityMembership({
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
      nowMs: args.nowMs,
    });
  }
  await args.ctx.db.patch(args.claim._id, {
    status: "redeemed",
    redeemedByUserId: args.userId,
    redeemedAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  return String(args.claim.communityId);
}
