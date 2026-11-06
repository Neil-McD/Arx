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
const pendingAuthIntent = read(
  "apps/web/src/controllers/useWebPendingAuthIntentController.ts",
);
const routeLifecycle = read("apps/web/src/controllers/useWebPathRouteLifecycle.ts");
const onboardingController = read("apps/web/src/controllers/useWebOnboardingProfileController.ts");

assert.match(schema, /founderSubscriptions: defineTable\(\{[\s\S]*communityId: v\.optional\(v\.id\("communities"\)\)/);

const existingCheckoutStart = billing.indexOf(
  "export const startFounderSubscriptionCheckout = action",
);
const existingCheckoutEnd = billing.indexOf("\n});\n", existingCheckoutStart);
assert.ok(existingCheckoutStart >= 0 && existingCheckoutEnd > existingCheckoutStart);
const existingCheckout = billing.slice(existingCheckoutStart, existingCheckoutEnd);
assert.match(existingCheckout, /authSubject: v\.optional\(v\.string\(\)\)/);
assert.match(existingCheckout, /communityId: v\.id\("communities"\)/);

// The public Builder checkout is deleted (retired Nov 5, removed Nov 6): no
// founder checkout starts without a signed-in owner.
assert.doesNotMatch(billing, /startPublicBuilderCheckout/);
// The anonymous Builder purchase is gone with its recovery: a founder
// checkout always has its owner from the start.
assert.match(billing, /if \(!ownerUserId\) throw new Error\("founder_subscription_owner_missing"\)/);
assert.doesNotMatch(billing, /paid_unclaimed|reconcilePaidBuilderPurchasesForOwnerInternal|createPendingPublicBuilderCheckoutInternal|recoveryEmail/);
assert.doesNotMatch(billing, /claimTokenHash|checkoutAttemptKeyHash|hashFounderCheckoutClaimToken|hashFounderCheckoutAttemptId/);
assert.doesNotMatch(billing, /export const getFounderCheckoutReceiptStatus/);

assert.match(webhook, /readStripePaymentReady\(session\.payment_status\)/);
assert.doesNotMatch(webhook, /recoveryEmail|enqueueFounderCheckoutRecoveryEmailInternal/);
assert.doesNotMatch(emailEvents, /enqueueFounderCheckoutRecoveryEmailInternal/);

assert.match(lifecycle, /founderSubscriptionId: v\.optional\(v\.id\("founderSubscriptions"\)\)/);
assert.match(
  lifecycle,
  /if \(args\.founderSubscriptionId\) \{[\s\S]*founderSubscription = \(await ctx\.db\.get\(/,
);
// Pricing v2: creating needs no plan (a plan bought first still attaches);
// every new community is free and only its agent needs a plan.
assert.doesNotMatch(lifecycle, /community_funding_required_before_create/);
assert.match(lifecycle, /builderAccessMode: COMMUNITY_BUILDER_ACCESS_FREE,/);
assert.match(lifecycle, /founder_subscription_already_attached/);
assert.match(lifecycle, /founder_subscription_risk_revoked/);
assert.match(lifecycle, /founder_subscription_price_mismatch/);
assert.doesNotMatch(lifecycle, /builderAccessMode: COMMUNITY_BUILDER_ACCESS_SUBSCRIPTION_REQUIRED,/);
assert.match(lifecycle, /ctx\.db\.patch\(founderSubscription\._id,[\s\S]*communityId,[\s\S]*attachedAt: nowMs/);
assert.match(lifecycle, /syncFounderUsageCycle\(/);
assert.match(gateway, /founderSubscriptionId: params\.founderSubscriptionId \?\? undefined/);
assert.doesNotMatch(billingGateway, /startCloudPublicBuilderCheckout/);
assert.doesNotMatch(billingGateway, /claimCloudFounderCheckoutReceipt|loadCloudFounderCheckoutReceiptStatus/);
assert.doesNotMatch(authBridge, /reconcilePaidBuilderPurchasesForOwnerInternal/);
assert.doesNotMatch(routeLifecycle + onboardingController, /builder_checkout/);
assert.match(
  app,
  /pendingBuilderSetupSubscription[\s\S]*isAccountSetupCompleteForBuilderActions[\s\S]*openRequiredCreateCommunityModal/,
  "authenticated bootstrap must force unresolved paid setup from canonical billing state",
);
assert.doesNotMatch(pendingAuthIntent, /resume_builder_checkout/);
assert.match(
  app,
  /onCompleteAccountSetup: completeAccountSetupAndContinue/,
  "modal account completion must share the canonical pending-intent continuation",
);
assert.doesNotMatch(app, /preparePaidBuilderCommunityCreation/);

console.log("PASS: a founder plan is bought signed in; the anonymous Builder purchase and its recovery stay gone.");
