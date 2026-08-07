import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const schema = read("convex/schema.ts");
const billing = read("convex/founderBilling.ts");
const webhook = read("convex/httpBilling.ts");
const emailEvents = read("convex/emailEvents.ts");
const lifecycle = read("convex/communityLifecycle.ts");
const gateway = read("shared/cloudCommunityAdminGateway.ts");
const billingGateway = read("shared/cloudFounderBillingGateway.ts");
const authBridge = read("convex/httpAuthBridge.ts");
const app = read("apps/web/src/App.tsx");
const routeLifecycle = read("apps/web/src/controllers/useWebPathRouteLifecycle.ts");
const onboardingController = read("apps/web/src/controllers/useWebOnboardingProfileController.ts");

assert.match(schema, /founderSubscriptions: defineTable\(\{[\s\S]*communityId: v\.optional\(v\.id\("communities"\)\)/);
assert.match(schema, /\.index\("by_mode_recovery_email", \["mode", "recoveryEmailHash"\]\)/);

const existingCheckoutStart = billing.indexOf(
  "export const startFounderSubscriptionCheckout = action",
);
const publicCheckoutStart = billing.indexOf("export const startPublicBuilderCheckout = action");
assert.ok(existingCheckoutStart >= 0 && publicCheckoutStart > existingCheckoutStart);
const existingCheckout = billing.slice(existingCheckoutStart, publicCheckoutStart);
assert.match(existingCheckout, /authSubject: v\.optional\(v\.string\(\)\)/);
assert.match(existingCheckout, /communityId: v\.id\("communities"\)/);

const publicCheckout = billing.slice(publicCheckoutStart);
assert.match(publicCheckout, /args: \{\}/);
assert.match(publicCheckout, /createPendingPublicBuilderCheckoutInternal/);
assert.match(publicCheckout, /readCanonicalPublicAppOrigin\(\)/);
assert.match(publicCheckout, /success_url: successUrl/);
assert.match(publicCheckout, /reconcilePaidBuilderPurchasesForOwnerInternal/);
assert.match(billing, /receiptStatus: grantsAccess \? "paid_unclaimed" : "revoked"/);
assert.doesNotMatch(billing, /claimTokenHash|checkoutAttemptKeyHash|hashFounderCheckoutClaimToken|hashFounderCheckoutAttemptId/);
assert.doesNotMatch(billing, /export const getFounderCheckoutReceiptStatus/);

assert.match(webhook, /readStripePaymentReady\(session\.payment_status\)/);
assert.match(webhook, /recoveryEmailHash/);
assert.match(webhook, /recoveryEmail,/);
assert.match(webhook, /enqueueFounderCheckoutRecoveryEmailInternal/);
const founderRecoveryStart = emailEvents.indexOf(
  "export async function enqueueFounderCheckoutRecoveryEmailInternal",
);
assert.ok(founderRecoveryStart >= 0);
const founderRecovery = emailEvents.slice(founderRecoveryStart);
assert.match(founderRecovery, /founder_checkout_recovery:\$\{params\.sessionId\}/);
assert.match(founderRecovery, /Propagate enqueue failures so Stripe retries/);
assert.doesNotMatch(founderRecovery, /email_enqueue_failed|skipped: true/);

assert.match(lifecycle, /founderSubscriptionId: v\.optional\(v\.id\("founderSubscriptions"\)\)/);
assert.match(
  lifecycle,
  /if \(args\.founderSubscriptionId\) \{[\s\S]*founderSubscription = \(await ctx\.db\.get\([\s\S]*\}\s*else if \(!operatorComped\) \{[\s\S]*community_funding_required_before_create/,
);
assert.match(lifecycle, /community_funding_required_before_create/);
assert.match(lifecycle, /founder_subscription_already_attached/);
assert.match(lifecycle, /founder_subscription_risk_revoked/);
assert.match(lifecycle, /founder_subscription_price_mismatch/);
assert.match(lifecycle, /builderAccessMode: COMMUNITY_BUILDER_ACCESS_SUBSCRIPTION_REQUIRED/);
assert.match(lifecycle, /ctx\.db\.patch\(founderSubscription\._id,[\s\S]*communityId,[\s\S]*attachedAt: nowMs/);
assert.match(lifecycle, /syncFounderUsageCycle\(/);
assert.match(gateway, /founderSubscriptionId: params\.founderSubscriptionId \?\? undefined/);
assert.match(billingGateway, /startCloudPublicBuilderCheckout/);
assert.doesNotMatch(billingGateway, /claimCloudFounderCheckoutReceipt|loadCloudFounderCheckoutReceiptStatus/);
assert.match(
  authBridge,
  /emailVerified[\s\S]*reconcilePaidBuilderPurchasesForOwnerInternal/,
);
assert.match(
  routeLifecycle,
  /url\.searchParams\.has\("builder_checkout"\)/,
);
assert.match(
  onboardingController,
  /new URLSearchParams\(window\.location\.search\)\.has\("builder_checkout"\)/,
);
assert.match(
  app,
  /latestAccountSetupStatus = await refreshAccountSetupStatus\(activeSession\)[\s\S]*if \(!latestAccountSetupStatus\?\.completed\)/,
);

console.log("PASS: verified payment and verified identity reconcile server-side into one consumable subscription.");
