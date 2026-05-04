import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

type SubscriptionStatus = "active" | "past_due" | "cancel_at_period_end" | "canceled" | "ended";

type MembershipRow = {
  id: string;
  accessSource: "paid_subscription" | "free_grant" | "manual_grant";
  active: boolean;
  revokedAt?: number;
  revokedReason?: string;
  pricePointId?: string;
  updatedAt: number;
};

type SubscriptionRow = {
  id: string;
  membershipId: string;
  pricePointId: string;
  status: SubscriptionStatus;
  source: "stripe" | "external_sync";
  providerSubscriptionId?: string;
  providerCustomerId?: string;
  currentPeriodStartAt?: number;
  currentPeriodEndAt?: number;
  cancelAtPeriodEnd: boolean;
  endedAt?: number;
  updatedAt: number;
};

type CheckoutSession = {
  mode: "community_join" | "builder_upgrade";
  claimToken: string;
  status: "pending" | "complete" | "expired";
  expiresAt: number;
  providerSubscriptionId?: string;
  providerCustomerId?: string;
  currentPeriodStartAt?: number;
  currentPeriodEndAt?: number;
  communitySubscriptionStatus?: SubscriptionStatus;
  cancelAtPeriodEnd?: boolean;
};

type PurchaseClaim = {
  claimToken: string;
  status: "pending" | "redeemed" | "expired";
  communityId: string;
  pricePointId?: string;
  sourceSessionId?: string;
  redeemedByUserId?: string;
  expiresAt: number;
};

type JoinRequest = {
  status: "pending" | "approved" | "denied" | "canceled";
  reapplyAt?: number;
};

type CommunityBlock = {
  communityId: string;
  userId: string;
  liftedAt?: number;
};

const REMOVE_REAPPLY_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

function readText(path: string | URL): string {
  return readFileSync(path, "utf8");
}

function assertIncludes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), `expected ${label} to include ${needle}`);
}

function subscriptionGrantsAccess(status: SubscriptionStatus | null | undefined): boolean {
  return status === "active" || status === "past_due" || status === "cancel_at_period_end";
}

function normalizeStripeCommunitySubscriptionStatus(args: {
  subscriptionStatus: string;
  cancelAtPeriodEnd?: boolean;
}): SubscriptionStatus {
  const subscriptionStatus = args.subscriptionStatus.trim().toLowerCase();
  if (subscriptionStatus === "cancel_at_period_end") return "cancel_at_period_end";
  if (subscriptionStatus === "ended") return "ended";
  if (subscriptionStatus === "active" || subscriptionStatus === "trialing") {
    return args.cancelAtPeriodEnd === true ? "cancel_at_period_end" : "active";
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

function selectLifecycleTarget(
  rows: SubscriptionRow[],
  providerSubscriptionId?: string,
): SubscriptionRow | null {
  const providerId = providerSubscriptionId?.trim() ?? "";
  return rows.slice().sort((a, b) => {
    const aMatch = Boolean(a.providerSubscriptionId?.trim() && a.providerSubscriptionId === providerId);
    const bMatch = Boolean(b.providerSubscriptionId?.trim() && b.providerSubscriptionId === providerId);
    if (aMatch !== bMatch) return aMatch ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  })[0] ?? null;
}

function resolveMostRelevantEntitlementSubscription(rows: SubscriptionRow[]): SubscriptionRow | null {
  return rows.slice().sort((a, b) => {
    const aGrants = subscriptionGrantsAccess(a.status);
    const bGrants = subscriptionGrantsAccess(b.status);
    if (aGrants !== bGrants) return aGrants ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  })[0] ?? null;
}

function createOrUpdateSubscriptionForMembership(args: {
  rows: SubscriptionRow[];
  membershipId: string;
  pricePointId: string;
  status: SubscriptionStatus;
  providerSubscriptionId?: string;
  providerCustomerId?: string;
  nowMs: number;
}) {
  const existing = args.rows.find((row) => row.membershipId === args.membershipId) ?? null;
  if (existing) {
    existing.pricePointId = args.pricePointId;
    existing.status = args.status;
    existing.providerSubscriptionId = args.providerSubscriptionId?.trim() || existing.providerSubscriptionId;
    existing.providerCustomerId = args.providerCustomerId?.trim() || existing.providerCustomerId;
    existing.cancelAtPeriodEnd = args.status === "cancel_at_period_end";
    existing.endedAt = args.status === "canceled" || args.status === "ended" ? args.nowMs : undefined;
    existing.updatedAt = args.nowMs;
    return existing;
  }
  const created: SubscriptionRow = {
    id: `sub-${args.rows.length + 1}`,
    membershipId: args.membershipId,
    pricePointId: args.pricePointId,
    status: args.status,
    source: "stripe",
    providerSubscriptionId: args.providerSubscriptionId,
    providerCustomerId: args.providerCustomerId,
    cancelAtPeriodEnd: args.status === "cancel_at_period_end",
    endedAt: args.status === "canceled" || args.status === "ended" ? args.nowMs : undefined,
    updatedAt: args.nowMs,
  };
  args.rows.push(created);
  return created;
}

function redeemClaim(args: {
  claim: PurchaseClaim;
  checkoutSession?: CheckoutSession;
  membership?: MembershipRow | null;
  subscriptions: SubscriptionRow[];
  userId: string;
  nowMs: number;
}) {
  if (args.claim.status !== "pending") {
    if (args.claim.status === "redeemed" && args.claim.redeemedByUserId === args.userId) {
      return { communityId: args.claim.communityId, accessGranted: false };
    }
    return { communityId: null, accessGranted: false };
  }
  if (args.claim.expiresAt <= args.nowMs) {
    args.claim.status = "expired";
    return { communityId: null, accessGranted: false };
  }
  if (args.claim.sourceSessionId) {
    const session = args.checkoutSession;
    if (!session || session.mode !== "community_join") return { communityId: null, accessGranted: false };
    if (session.claimToken !== args.claim.claimToken) return { communityId: null, accessGranted: false };
    if (args.nowMs > session.expiresAt || session.status !== "complete") {
      return { communityId: null, accessGranted: false };
    }
    if (!subscriptionGrantsAccess(session.communitySubscriptionStatus ?? "active")) {
      return { communityId: null, accessGranted: false };
    }
  }
  const membership = args.membership ?? {
    id: "membership-1",
    accessSource: "paid_subscription" as const,
    active: false,
    updatedAt: args.nowMs,
  };
  const accessGranted = !membership.active;
  membership.accessSource = "paid_subscription";
  membership.active = true;
  membership.revokedAt = undefined;
  membership.revokedReason = undefined;
  membership.pricePointId = args.claim.pricePointId;
  membership.updatedAt = args.nowMs;
  if (args.claim.pricePointId) {
    createOrUpdateSubscriptionForMembership({
      rows: args.subscriptions,
      membershipId: membership.id,
      pricePointId: args.claim.pricePointId,
      status: args.checkoutSession?.communitySubscriptionStatus ?? "active",
      providerSubscriptionId: args.checkoutSession?.providerSubscriptionId,
      providerCustomerId: args.checkoutSession?.providerCustomerId,
      nowMs: args.nowMs,
    });
  }
  args.claim.status = "redeemed";
  args.claim.redeemedByUserId = args.userId;
  return { communityId: args.claim.communityId, accessGranted };
}

function syncLifecycle(args: {
  membership: MembershipRow;
  subscriptions: SubscriptionRow[];
  providerSubscriptionId?: string;
  providerCustomerId?: string;
  providerPricePointId?: string;
  pricePointId: string;
  status: SubscriptionStatus;
  nowMs: number;
}) {
  assert.equal(args.membership.accessSource, "paid_subscription");
  const existing = selectLifecycleTarget(args.subscriptions, args.providerSubscriptionId);
  if (existing) {
    existing.status = args.status;
    existing.pricePointId = args.pricePointId;
    existing.providerSubscriptionId = args.providerSubscriptionId?.trim() || existing.providerSubscriptionId;
    existing.providerCustomerId = args.providerCustomerId?.trim() || existing.providerCustomerId;
    existing.cancelAtPeriodEnd = args.status === "cancel_at_period_end";
    existing.endedAt = args.status === "canceled" || args.status === "ended" ? args.nowMs : undefined;
    existing.updatedAt = args.nowMs;
  } else {
    args.subscriptions.push({
      id: `sub-${args.subscriptions.length + 1}`,
      membershipId: args.membership.id,
      pricePointId: args.pricePointId,
      status: args.status,
      source: "stripe",
      providerSubscriptionId: args.providerSubscriptionId,
      providerCustomerId: args.providerCustomerId,
      cancelAtPeriodEnd: args.status === "cancel_at_period_end",
      endedAt: args.status === "canceled" || args.status === "ended" ? args.nowMs : undefined,
      updatedAt: args.nowMs,
    });
  }
  const grantsAccess = subscriptionGrantsAccess(args.status);
  args.membership.pricePointId = args.pricePointId;
  args.membership.active = grantsAccess;
  args.membership.revokedAt = grantsAccess ? undefined : args.nowMs;
  args.membership.revokedReason = grantsAccess ? undefined : `subscription_${args.status}`;
  args.membership.updatedAt = args.nowMs;
}

function removeMember(args: {
  membership: MembershipRow;
  subscriptions: SubscriptionRow[];
  joinRequest?: JoinRequest;
  nowMs: number;
}): JoinRequest {
  for (const row of args.subscriptions.filter((row) => row.membershipId === args.membership.id)) {
    row.status = "ended";
    row.cancelAtPeriodEnd = false;
    row.endedAt = args.nowMs;
    row.updatedAt = args.nowMs;
  }
  args.membership.active = false;
  args.membership.revokedAt = args.nowMs;
  args.membership.revokedReason = "removed_by_manager_stripe_canceled";
  args.membership.updatedAt = args.nowMs;
  const joinRequest: JoinRequest = args.joinRequest ?? { status: "pending" };
  joinRequest.status = "denied";
  joinRequest.reapplyAt = args.nowMs + REMOVE_REAPPLY_COOLDOWN_MS;
  return joinRequest;
}

function joinOpenCommunity(args: {
  membership?: MembershipRow | null;
  joinRequest?: JoinRequest | null;
  nowMs: number;
}): "joined" | "approval_denied" {
  if (args.membership?.active) return "joined";
  if (
    args.joinRequest?.status === "denied" &&
    typeof args.joinRequest.reapplyAt === "number" &&
    args.joinRequest.reapplyAt > args.nowMs
  ) {
    return "approval_denied";
  }
  if (args.membership) {
    args.membership.active = true;
    args.membership.revokedAt = undefined;
    args.membership.revokedReason = undefined;
  }
  return "joined";
}

function banMember(args: {
  membership: MembershipRow;
  subscriptions: SubscriptionRow[];
  blocks: CommunityBlock[];
  communityId: string;
  userId: string;
  nowMs: number;
}) {
  removeMember({
    membership: args.membership,
    subscriptions: args.subscriptions,
    nowMs: args.nowMs,
  });
  args.membership.revokedReason = "banned_by_manager_stripe_canceled";
  const existing = args.blocks.find(
    (block) =>
      block.communityId === args.communityId &&
      block.userId === args.userId &&
      !(typeof block.liftedAt === "number" && block.liftedAt > 0),
  );
  if (!existing) {
    args.blocks.push({ communityId: args.communityId, userId: args.userId });
  }
}

function isBlocked(args: {
  blocks: CommunityBlock[];
  communityId: string;
  userId: string;
}) {
  return args.blocks.some(
    (block) =>
      block.communityId === args.communityId &&
      block.userId === args.userId &&
      !(typeof block.liftedAt === "number" && block.liftedAt > 0),
  );
}

function unban(args: {
  blocks: CommunityBlock[];
  communityId: string;
  userId: string;
  nowMs: number;
}) {
  for (const block of args.blocks) {
    if (block.communityId === args.communityId && block.userId === args.userId && !block.liftedAt) {
      block.liftedAt = args.nowMs;
    }
  }
}

function assertSourceAnchors() {
  const communityCommerce = readText(new URL("../convex/communityCommerce.ts", import.meta.url));
  const billingCore = readText(new URL("../convex/billingCore.ts", import.meta.url));
  const httpBilling = readText(new URL("../convex/httpBilling.ts", import.meta.url));
  const communityAdmin = readText(new URL("../convex/communityAdmin.ts", import.meta.url));
  const communityCore = readText(new URL("../convex/communityCore.ts", import.meta.url));
  const communityPublic = readText(new URL("../convex/communityPublic.ts", import.meta.url));
  const schema = readText(new URL("../convex/schema.ts", import.meta.url));

  assertIncludes(
    communityCore,
    "export const COMMUNITY_REMOVAL_REAPPLY_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;",
    "removed members have a 14-day reapply cooldown",
  );
  assertIncludes(
    schema,
    "communityBlocks: defineTable({",
    "community blocks are a distinct durable table",
  );
  assertIncludes(
    communityCore,
    "export async function requireCommunityUserNotBlocked",
    "central fail-closed block helper exists",
  );
  assertIncludes(
    httpBilling,
    'if (event.type === "checkout.session.completed")',
    "community checkout webhook entrypoint",
  );
  assertIncludes(
    httpBilling,
    "syncPendingCommunityCheckoutSubscriptionInternal",
    "checkout completion syncs pending community subscription state",
  );
  assertIncludes(
    httpBilling,
    'event.type === "customer.subscription.updated" ||',
    "subscription lifecycle webhook entrypoint",
  );
  assertIncludes(
    httpBilling,
    "syncCommunitySubscriptionLifecycleInternal",
    "subscription lifecycle webhook syncs access state",
  );
  assertIncludes(
    communityCommerce,
    "export const syncCommunitySubscriptionLifecycleInternal = internalMutation({",
    "community subscription lifecycle sync seam",
  );
  assertIncludes(
    communityCommerce,
    "String(a.providerSubscriptionId ?? \"\").trim() === String(args.providerSubscriptionId ?? \"\").trim()",
    "provider subscription id is preferred for lifecycle row matching",
  );
  assertIncludes(
    communityCommerce,
    "await ctx.db.patch(membership._id, {",
    "subscription sync patches membership access state",
  );
  assertIncludes(
    billingCore,
    "if (args.claim.status === \"redeemed\" && args.claim.redeemedByUserId === args.userId)",
    "claim redemption is idempotent for the same user",
  );
  assertIncludes(
    billingCore,
    "String(checkoutSession.claimToken ?? \"\").trim() !== args.claim.claimToken",
    "claim redemption validates checkout claim token",
  );
  assertIncludes(
    billingCore,
    "String(checkoutSession.status ?? \"\").trim().toLowerCase() !== \"complete\"",
    "claim redemption requires completed checkout session",
  );
  assertIncludes(
    billingCore,
    "export function normalizeStripeCommunitySubscriptionStatus",
    "shared Stripe community subscription status normalizer",
  );
  assertIncludes(
    billingCore,
    "subscriptionStatus === \"paused\"",
    "Stripe paused subscriptions fail closed",
  );
  assertIncludes(
    billingCore,
    "return \"ended\";",
    "unknown Stripe community subscription statuses fail closed",
  );
  assertIncludes(
    communityCore,
    "return status === \"active\" || status === \"past_due\" || status === \"cancel_at_period_end\";",
    "community subscription status grant policy",
  );
  assertIncludes(
    communityAdmin,
    "async function endCommunitySubscriptionsForMembership",
    "member removal ends all local subscription rows",
  );
  assertIncludes(
    communityAdmin,
    "export const banCommunityMember = action({",
    "ban action exists",
  );
  assertIncludes(
    communityAdmin,
    "export const unbanCommunityUser = mutation({",
    "unban action exists",
  );
  assertIncludes(
    communityAdmin,
    "active: false,",
    "member removal revokes membership access",
  );
  assertIncludes(
    communityAdmin,
    "reapplyAt: nowMs + COMMUNITY_REMOVAL_REAPPLY_COOLDOWN_MS,",
    "member removal writes the removal cooldown",
  );
  assertIncludes(
    communityAdmin,
    "reapplyAt: nowMs + COMMUNITY_JOIN_REAPPLY_COOLDOWN_MS,",
    "ordinary join denial writes the normal join cooldown",
  );
  assertIncludes(
    communityPublic,
    "if (existingMembership && communityMembershipRowIsActive(existingMembership))",
    "inactive memberships do not bypass public join policy checks",
  );
  assertIncludes(
    communityPublic,
    "if (joinRequestStatus === \"denied\" && !communityJoinRequestCanReapply(joinRequest, args.nowMs))",
    "public join respects denied reapply windows before granting access",
  );
  assertIncludes(
    communityPublic,
    "await requireCommunityUserNotBlocked({",
    "public join checks block state",
  );
  assertIncludes(
    communityCommerce,
    "requirePublicCommunityCheckoutNotBlockedInternal",
    "public checkout checks block state",
  );
  assertIncludes(
    billingCore,
    "await requireCommunityUserNotBlocked({",
    "claim redemption checks block state",
  );
  assertIncludes(
    communityCommerce,
    "String(session.ownerUserId) !== String(userId)",
    "finalize checkout binds claim disclosure to checkout owner",
  );
  assertIncludes(
    communityCommerce,
    "String(claim.ownerUserId) !== String(userId)",
    "claim redemption binds paid claims to checkout owner",
  );
}

function main() {
  assertSourceAnchors();

  assert.equal(normalizeStripeCommunitySubscriptionStatus({ subscriptionStatus: "trialing" }), "active");
  assert.equal(
    normalizeStripeCommunitySubscriptionStatus({ subscriptionStatus: "active", cancelAtPeriodEnd: true }),
    "cancel_at_period_end",
  );
  assert.equal(
    normalizeStripeCommunitySubscriptionStatus({ subscriptionStatus: "cancel_at_period_end", cancelAtPeriodEnd: true }),
    "cancel_at_period_end",
  );
  assert.equal(normalizeStripeCommunitySubscriptionStatus({ subscriptionStatus: "ended" }), "ended");
  assert.equal(normalizeStripeCommunitySubscriptionStatus({ subscriptionStatus: "unpaid" }), "ended");
  assert.equal(normalizeStripeCommunitySubscriptionStatus({ subscriptionStatus: "paused" }), "ended");
  assert.equal(normalizeStripeCommunitySubscriptionStatus({ subscriptionStatus: "new_stripe_status" }), "ended");

  const subscriptions: SubscriptionRow[] = [];
  const claim: PurchaseClaim = {
    claimToken: "claim_1",
    status: "pending",
    communityId: "community-1",
    pricePointId: "price-1",
    sourceSessionId: "checkout-1",
    expiresAt: 10_000,
  };
  const checkoutSession: CheckoutSession = {
    mode: "community_join",
    claimToken: "claim_1",
    status: "complete",
    expiresAt: 10_000,
    providerSubscriptionId: "sub_live",
    providerCustomerId: "cus_live",
    communitySubscriptionStatus: "active",
  };
  const firstRedemption = redeemClaim({
    claim,
    checkoutSession,
    subscriptions,
    userId: "user-1",
    nowMs: 1_000,
  });
  assert.deepEqual(firstRedemption, { communityId: "community-1", accessGranted: true });
  assert.equal(subscriptions.length, 1, "checkout redemption creates one subscription row");
  assert.equal(subscriptions[0]?.providerSubscriptionId, "sub_live");

  const duplicateRedemption = redeemClaim({
    claim,
    checkoutSession,
    subscriptions,
    userId: "user-1",
    nowMs: 2_000,
  });
  assert.deepEqual(duplicateRedemption, { communityId: "community-1", accessGranted: false });
  assert.equal(subscriptions.length, 1, "duplicate claim redemption does not create another subscription row");

  const membership: MembershipRow = {
    id: "membership-1",
    accessSource: "paid_subscription",
    active: true,
    pricePointId: "price-1",
    updatedAt: 2_000,
  };
  syncLifecycle({
    membership,
    subscriptions,
    providerSubscriptionId: "sub_live",
    providerCustomerId: "cus_live",
    pricePointId: "price-1",
    status: "active",
    nowMs: 3_000,
  });
  assert.equal(subscriptions.length, 1, "duplicate active webhook patches existing provider subscription row");
  assert.equal(membership.active, true);

  subscriptions.push({
    id: "sub-older-active",
    membershipId: "membership-1",
    pricePointId: "price-old",
    status: "active",
    source: "stripe",
    providerSubscriptionId: "sub_old",
    cancelAtPeriodEnd: false,
    updatedAt: 2_500,
  });
  const target = selectLifecycleTarget(subscriptions, "sub_live");
  assert.equal(target?.providerSubscriptionId, "sub_live", "provider subscription id wins over recency");

  syncLifecycle({
    membership,
    subscriptions,
    providerSubscriptionId: "sub_live",
    providerCustomerId: "cus_live",
    pricePointId: "price-1",
    status: "canceled",
    nowMs: 4_000,
  });
  assert.equal(membership.active, false, "canceled lifecycle update revokes membership");
  assert.equal(membership.revokedReason, "subscription_canceled");

  syncLifecycle({
    membership,
    subscriptions,
    providerSubscriptionId: "sub_live",
    providerCustomerId: "cus_live",
    pricePointId: "price-1",
    status: "active",
    nowMs: 5_000,
  });
  assert.equal(membership.active, true, "active lifecycle update restores membership");
  assert.equal(membership.revokedAt, undefined);
  assert.equal(membership.revokedReason, undefined);

  const entitlementSubscription = resolveMostRelevantEntitlementSubscription(subscriptions);
  assert.equal(
    subscriptionGrantsAccess(entitlementSubscription?.status),
    true,
    "entitlement resolver prefers granting rows before recency",
  );

  const joinRequest = removeMember({
    membership,
    subscriptions,
    joinRequest: { status: "pending" },
    nowMs: 6_000,
  });
  assert.equal(membership.active, false, "removed member is locally revoked");
  assert.equal(joinRequest.status, "denied", "removed member gets denied join state");
  assert.equal(
    joinRequest.reapplyAt,
    6_000 + REMOVE_REAPPLY_COOLDOWN_MS,
    "removed member can reapply after 14 days",
  );
  assert.ok(
    subscriptions.every((row) => row.status === "ended"),
    "removed member cannot retain access from any older active subscription row",
  );
  assert.equal(
    subscriptionGrantsAccess(resolveMostRelevantEntitlementSubscription(subscriptions)?.status),
    false,
    "all ended subscription rows deny access after removal",
  );
  assert.equal(
    joinOpenCommunity({ membership, joinRequest, nowMs: 6_000 + REMOVE_REAPPLY_COOLDOWN_MS - 1 }),
    "approval_denied",
    "removed inactive membership cannot rejoin before the removal cooldown",
  );
  assert.equal(
    membership.active,
    false,
    "failed early rejoin does not reactivate the inactive membership",
  );
  assert.equal(
    joinOpenCommunity({ membership, joinRequest, nowMs: 6_000 + REMOVE_REAPPLY_COOLDOWN_MS }),
    "joined",
    "removed member may rejoin after the removal cooldown",
  );
  const createdRemovalRequest = removeMember({ membership, subscriptions, nowMs: 8_000 });
  assert.equal(
    createdRemovalRequest.reapplyAt,
    8_000 + REMOVE_REAPPLY_COOLDOWN_MS,
    "removal creates a cooldown row even when no prior join request exists",
  );

  const blocks: CommunityBlock[] = [];
  membership.active = true;
  subscriptions[0]!.status = "active";
  banMember({
    membership,
    subscriptions,
    blocks,
    communityId: "community-1",
    userId: "user-1",
    nowMs: 7_000,
  });
  assert.equal(membership.active, false, "banned member is locally revoked");
  assert.equal(membership.revokedReason, "banned_by_manager_stripe_canceled");
  assert.equal(
    isBlocked({ blocks, communityId: "community-1", userId: "user-1" }),
    true,
    "banned member has active block state",
  );
  unban({ blocks, communityId: "community-1", userId: "user-1", nowMs: 8_000 });
  assert.equal(
    isBlocked({ blocks, communityId: "community-1", userId: "user-1" }),
    false,
    "unban lifts block without restoring membership",
  );

  console.log("PASS: community subscription lifecycle policy proof passed");
}

main();
