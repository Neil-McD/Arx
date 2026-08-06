import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const schema = read("convex/schema.ts");
const lifecycle = read("shared/communityLifecycle.ts");
const archive = read("convex/communityColdArchive.ts");
const founderBilling = read("convex/founderBilling.ts");
const httpBilling = read("convex/httpBilling.ts");
const criticalAudit = read("convex/criticalAudit.ts");

assert.match(
  lifecycle,
  /restoreCommunityLifecycle\([\s\S]*status: "active"[\s\S]*nextCommunityLifecycleGeneration\(previous\.generation\)/,
  "restoration must be one canonical archived-to-active generation transition",
);
assert.match(
  archive,
  /requireCompletedCommunityArchiveBillingCleanup\([\s\S]*job\.status !== "complete"[\s\S]*community_restore_billing_cleanup_incomplete/,
  "restoration eligibility must require the exact archive generation cleanup receipt",
);
assert.match(
  founderBilling,
  /createPendingFounderSubscriptionCheckoutInternal[\s\S]*requireFounderCheckoutLifecycle\(ctx, community\)[\s\S]*mode: "founder_subscription"[\s\S]*communityLifecycleGeneration: lifecycle\.generation/,
  "archived restoration must reuse the existing generation-bound founder subscription checkout",
);
assert.match(
  founderBilling,
  /communityLifecycleGenerationMatches\([\s\S]*checkout\.communityLifecycleGeneration[\s\S]*verifiedCheckoutPayment !== true[\s\S]*requireCompletedCommunityArchiveBillingCleanup/,
  "only a verified paid checkout for the exact archived generation may gain restoration authority",
);
assert.match(
  founderBilling,
  /community_restore_subscription_inactive[\s\S]*restoreCommunityLifecycle\(community\)[\s\S]*eventType: "community_restored"/,
  "inactive billing must fail before the atomic lifecycle transition and critical audit",
);
assert.match(
  criticalAudit,
  /"community_restored"[\s\S]*community_restored: \["lifecycleGeneration"\]/,
  "successful restoration must leave one bounded critical audit receipt",
);

const verifiedAuthorityUses = [
  ...httpBilling.matchAll(/verifiedCheckoutPayment:\s*true/g),
];
assert.equal(
  verifiedAuthorityUses.length,
  1,
  "exactly one Stripe webhook path may assert verified restoration payment",
);
assert.match(
  httpBilling,
  /event\.type === "checkout\.session\.completed"[\s\S]*event\.type === "checkout\.session\.async_payment_succeeded"[\s\S]*readStripePaymentReady\(session\.payment_status\)[\s\S]*verifiedCheckoutPayment: true/,
  "verified restoration payment must originate only from a signed payment-ready checkout event",
);
assert.doesNotMatch(
  httpBilling,
  /syncFounderSubscriptionFromStripeSubscription[\s\S]{0,1800}verifiedCheckoutPayment/,
  "ordinary subscription lifecycle webhooks must never acquire restoration authority",
);

for (const forbidden of [
  "community_restore_checkout",
  "communityRestoreCheckout",
  "communityLifecycleOperations",
  "restoreCheckoutGeneration",
  "restoreCommunity = mutation",
]) {
  assert.equal(
    [schema, archive, founderBilling, httpBilling].some((source) =>
      source.includes(forbidden),
    ),
    false,
    `restoration must not introduce duplicate surface ${forbidden}`,
  );
}

console.log("community cold archive restore contract proof passed");
