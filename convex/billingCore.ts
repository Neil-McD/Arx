
export { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { communitySubscriptionStatusFields } from "./communitySubscriptionLifecycle";
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
  return fillCheckoutSuccessUrl(
    requireCanonicalCheckoutReturnUrl(successUrlRaw, "checkout_success_url_invalid"),
    sessionId,
  );
}

// A success URL its caller already validated (Studio's origin, or a community
// site's private twin), with Polynet's own checkout session id filled in.
export function fillCheckoutSuccessUrl(successUrl: string, sessionId: string): string {
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
  status?: string;
  cancelAtPeriodEnd?: boolean | null;
  nowMs: number;
}): Promise<void> {
  const source = args.source ?? "stripe";
  const status = normalizeCommunitySubscriptionStatus(args.status ?? "active");
  if (!status) throw new Error("community_subscription_status_invalid");
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
    const statusFields = communitySubscriptionStatusFields({ status, cancelAtPeriodEnd: args.cancelAtPeriodEnd, current: existing, nowMs: args.nowMs });
    await args.ctx.db.patch(existing._id, {
      source,
      pricePointId: args.pricePointId,
      providerAccountId: providerAccountId || existing.providerAccountId,
      providerSubscriptionId:
        String(args.providerSubscriptionId ?? "").trim() || existing.providerSubscriptionId,
      // A new purchase is not the subscription they once left: its leave request goes.
      ...(String(args.providerSubscriptionId ?? "").trim()
        && String(args.providerSubscriptionId).trim() !== String(existing.providerSubscriptionId ?? "").trim()
        ? { cancelRequestedAt: undefined }
        : {}),
      providerCustomerId:
        String(args.providerCustomerId ?? "").trim() || existing.providerCustomerId,
      currentPeriodStartAt:
        typeof args.currentPeriodStartAt === "number" ? args.currentPeriodStartAt : undefined,
      currentPeriodEndAt:
        typeof args.currentPeriodEndAt === "number" ? args.currentPeriodEndAt : undefined,
      ...statusFields,
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
        cancelAtPeriodEnd: statusFields.cancelAtPeriodEnd,
      },
      createdAt: args.nowMs,
    });
    return;
  }
  const statusFields = communitySubscriptionStatusFields({ status, cancelAtPeriodEnd: args.cancelAtPeriodEnd, nowMs: args.nowMs });
  await args.ctx.db.insert("communitySubscriptions" as any, {
    communityId: args.communityId,
    userId: args.userId,
    membershipId: args.membershipId,
    pricePointId: args.pricePointId,
    source,
    providerAccountId: providerAccountId || undefined,
    providerSubscriptionId: String(args.providerSubscriptionId ?? "").trim() || undefined,
    providerCustomerId: String(args.providerCustomerId ?? "").trim() || undefined,
    currentPeriodStartAt:
      typeof args.currentPeriodStartAt === "number" ? args.currentPeriodStartAt : undefined,
    currentPeriodEndAt:
      typeof args.currentPeriodEndAt === "number" ? args.currentPeriodEndAt : undefined,
    ...statusFields,
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
      cancelAtPeriodEnd: statusFields.cancelAtPeriodEnd,
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

// A paid community checkout becomes membership here, once: called from Stripe's
// verified notice (never from a return page), for the buyer who started it.
// The checkout records the moment (membershipGrantedAt); a notice sent again
// finds it there and changes nothing.
export async function grantCommunityCheckout(args: {
  ctx: any;
  checkoutSession: any;
  nowMs: number;
}): Promise<{
  communityId: string | null;
  accessGranted: boolean;
  grantMarker: string | null;
}> {
  const none = { communityId: null, accessGranted: false, grantMarker: null };
  const session = args.checkoutSession;
  const userId = session?.ownerUserId;
  if (!session || !userId || !session.communityId) return none;
  if (String(session.mode ?? "").trim().toLowerCase() !== "community_join") return none;
  if (typeof session.membershipGrantedAt === "number") {
    return { communityId: String(session.communityId), accessGranted: false, grantMarker: null };
  }
  if (session.communityHold) return none;
  // Paid is paid: a checkout's expiry is for starting it, so a payment made
  // before signing in still grants whenever its buyer turns up. Access then
  // runs through the paid-through date and Stripe's later notices.
  if (String(session.status ?? "").trim().toLowerCase() !== "complete") return none;
  const checkoutStatus =
    normalizeCommunitySubscriptionStatus(session.communitySubscriptionStatus ?? "active") ?? "active";
  if (!communitySubscriptionStatusGrantsAccess(checkoutStatus)) return none;
  const community = (await args.ctx.db.get(session.communityId)) as CommunityLike | null;
  if (
    !community ||
    !communityIsActive(community) ||
    !communityLifecycleGenerationMatches(community, session.communityLifecycleGeneration)
  ) {
    return none;
  }
  await requireCommunityUserNotBlocked({
    ctx: args.ctx,
    communityId: session.communityId,
    userId,
  });
  const { membership, accessGranted } = await ensureCommunityMembership({
    ctx: args.ctx,
    community,
    communityId: session.communityId,
    userId,
    pricePointId: session.pricePointId,
    nowMs: args.nowMs,
  });
  if (session.pricePointId && resolveCommunityEntryPolicy(community as any) === "paid_subscription") {
    await createCommunitySubscriptionForMembership({
      ctx: args.ctx,
      communityId: session.communityId,
      membershipId: membership._id,
      userId,
      pricePointId: session.pricePointId,
      source: "stripe",
      providerAccountId: session.providerAccountId ?? null,
      providerSubscriptionId: session.providerSubscriptionId ?? null,
      providerCustomerId: session.providerCustomerId ?? null,
      currentPeriodStartAt: session.currentPeriodStartAt ?? null,
      currentPeriodEndAt: session.currentPeriodEndAt ?? null,
      status: checkoutStatus,
      cancelAtPeriodEnd: session.cancelAtPeriodEnd ?? false,
      nowMs: args.nowMs,
    });
  }
  await args.ctx.db.patch(session._id, { membershipGrantedAt: args.nowMs, updatedAt: args.nowMs });
  if (accessGranted) {
    await enqueueCommunityAccessGrantedEmailInternal({
      ctx: args.ctx,
      userId,
      communityId: session.communityId,
      grantMarker: `${String(membership._id)}:${membership.updatedAt}`,
      nowMs: args.nowMs,
    });
  }
  return {
    communityId: String(session.communityId),
    accessGranted,
    grantMarker: accessGranted ? `${String(membership._id)}:${membership.updatedAt}` : null,
  };
}
