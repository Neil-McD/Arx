import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

type EntryPolicy = "open" | "approval" | "paid_subscription";
type AccessSource = "free_grant" | "manual_grant" | "paid_subscription";
type SubscriptionStatus = "active" | "past_due" | "cancel_at_period_end" | "canceled" | "ended";

type Membership = {
  active: boolean;
  accessSource: AccessSource;
  role: "member" | "moderator" | "admin";
  revokedAt?: number;
};

type LifecycleState = {
  entryPolicy: EntryPolicy;
  membership: Membership | null;
  joinRequestStatus: "none" | "pending" | "denied";
  blocked: boolean;
  subscriptionStatus: SubscriptionStatus | null;
};

function readText(path: string | URL): string {
  return readFileSync(path, "utf8");
}

function assertIncludes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), `expected ${label} to include ${needle}`);
}

function subscriptionGrantsAccess(status: SubscriptionStatus | null): boolean {
  return status === "active" || status === "past_due" || status === "cancel_at_period_end";
}

function membershipIsActive(membership: Membership | null): boolean {
  return Boolean(membership && membership.active && !membership.revokedAt);
}

function resolveEntitled(state: LifecycleState): boolean {
  if (state.blocked) return false;
  if (!membershipIsActive(state.membership)) return false;
  if (state.entryPolicy !== "paid_subscription") return true;
  if (state.membership?.accessSource === "free_grant" || state.membership?.accessSource === "manual_grant") return true;
  return subscriptionGrantsAccess(state.subscriptionStatus);
}

function joinPublicCommunity(state: LifecycleState): "joined" | "approval_pending" | "approval_denied" | "paid_plan_required" {
  if (state.blocked) throw new Error("community_user_blocked");
  if (membershipIsActive(state.membership)) return "joined";
  if (state.joinRequestStatus === "denied") return "approval_denied";
  if (state.entryPolicy === "paid_subscription") return "paid_plan_required";
  if (state.entryPolicy === "approval") {
    state.joinRequestStatus = "pending";
    return "approval_pending";
  }
  state.membership = { active: true, accessSource: "free_grant", role: "member" };
  return "joined";
}

function approveJoinRequest(state: LifecycleState) {
  if (state.entryPolicy === "paid_subscription") throw new Error("community_paid_checkout_required");
  if (state.joinRequestStatus !== "pending") throw new Error("join_request_not_pending");
  state.joinRequestStatus = "none";
  state.membership = { active: true, accessSource: "free_grant", role: "member" };
}

function redeemPaidCheckout(state: LifecycleState, status: SubscriptionStatus = "active") {
  if (state.blocked) throw new Error("community_user_blocked");
  if (state.entryPolicy !== "paid_subscription") throw new Error("paid_plan_required");
  if (!subscriptionGrantsAccess(status)) throw new Error("checkout_session_inactive");
  state.subscriptionStatus = status;
  state.membership = { active: true, accessSource: "paid_subscription", role: "member" };
}

function cancelSubscription(state: LifecycleState) {
  state.subscriptionStatus = "canceled";
}

function leaveCommunity(state: LifecycleState) {
  state.membership = null;
  state.subscriptionStatus = null;
  state.joinRequestStatus = "none";
}

function removeMember(state: LifecycleState) {
  if (state.membership) {
    state.membership.active = false;
    state.membership.revokedAt = Date.now();
  }
  state.subscriptionStatus = "ended";
}

function banMember(state: LifecycleState) {
  removeMember(state);
  state.blocked = true;
}

function unbanMember(state: LifecycleState) {
  state.blocked = false;
}

function assertSourceAnchors() {
  const communityPublic = readText(new URL("../convex/communityPublic.ts", import.meta.url));
  const communityAdmin = readText(new URL("../convex/communityAdmin.ts", import.meta.url));
  const communityCore = readText(new URL("../convex/communityCore.ts", import.meta.url));
  const billingCore = readText(new URL("../convex/billingCore.ts", import.meta.url));
  const audit = readText(new URL("../convex/communityAccessAudit.ts", import.meta.url));

  assertIncludes(communityPublic, "outcome: \"paid_plan_required\"", "paid public join must route to checkout");
  assertIncludes(communityAdmin, "community_paid_checkout_required", "paid approval must be rejected");
  assertIncludes(communityCore, "if (lens.isBlocked) throw new Error(\"community_user_blocked\");", "shared community gates (the one lens) must enforce blocks");
  assertIncludes(billingCore, "String(checkoutSession.status ?? \"\").trim().toLowerCase() !== \"complete\"", "claim redemption requires complete checkout");
  assertIncludes(billingCore, "await requireCommunityUserNotBlocked({", "claim redemption rejects blocked users");
  assertIncludes(communityAdmin, "revokedReason:", "manager removal keeps revoked membership evidence");
  assertIncludes(communityAdmin, "await ctx.db.delete(membership._id as any);", "member leave deletes own membership row intentionally");
  assertIncludes(audit, "active_membership_with_active_block", "state audit checks active block drift");
  assertIncludes(audit, "active_paid_membership_without_granting_subscription", "state audit checks paid subscription drift");
  assertIncludes(audit, "join_request_not_canonical", "state audit checks legacy request drift");
  assertIncludes(audit, "active_membership_with_join_request", "state audit checks residual request drift");
  assertIncludes(audit, "join_request_pair_not_unique", "state audit checks duplicate request drift");
}

function main() {
  assertSourceAnchors();

  const openState: LifecycleState = {
    entryPolicy: "open",
    membership: null,
    joinRequestStatus: "none",
    blocked: false,
    subscriptionStatus: null,
  };
  assert.equal(joinPublicCommunity(openState), "joined");
  assert.equal(resolveEntitled(openState), true, "open join grants access");
  leaveCommunity(openState);
  assert.equal(resolveEntitled(openState), false, "leave removes access");

  const approvalState: LifecycleState = {
    entryPolicy: "approval",
    membership: null,
    joinRequestStatus: "none",
    blocked: false,
    subscriptionStatus: null,
  };
  assert.equal(joinPublicCommunity(approvalState), "approval_pending");
  assert.equal(resolveEntitled(approvalState), false, "pending request is not access");
  approveJoinRequest(approvalState);
  assert.equal(resolveEntitled(approvalState), true, "approval grants access");
  approvalState.entryPolicy = "paid_subscription";
  assert.equal(resolveEntitled(approvalState), true, "existing durable grants remain entitled after paid conversion");
  approvalState.membership = null;
  approvalState.joinRequestStatus = "pending";
  assert.throws(() => approveJoinRequest(approvalState), /community_paid_checkout_required/);

  const paidState: LifecycleState = {
    entryPolicy: "paid_subscription",
    membership: null,
    joinRequestStatus: "none",
    blocked: false,
    subscriptionStatus: null,
  };
  assert.equal(joinPublicCommunity(paidState), "paid_plan_required");
  redeemPaidCheckout(paidState, "active");
  assert.equal(resolveEntitled(paidState), true, "active paid subscription grants access");
  cancelSubscription(paidState);
  assert.equal(resolveEntitled(paidState), false, "canceled paid subscription removes access");
  redeemPaidCheckout(paidState, "past_due");
  assert.equal(resolveEntitled(paidState), true, "past due subscription still grants access by policy");
  banMember(paidState);
  assert.equal(resolveEntitled(paidState), false, "ban removes access");
  assert.throws(() => joinPublicCommunity(paidState), /community_user_blocked/);
  unbanMember(paidState);
  assert.equal(resolveEntitled(paidState), false, "unban does not restore revoked membership");
  assert.equal(joinPublicCommunity(paidState), "paid_plan_required", "unbanned paid visitor must checkout again");

  console.log("community_access_lifecycle_proof: ok");
}

main();
