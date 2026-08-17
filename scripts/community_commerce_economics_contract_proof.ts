import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const founderPlan = read("shared/founderPlan.ts");
const schema = read("convex/schema.ts");
const auth = read("convex/auth.ts");
const billingCore = read("convex/billingCore.ts");
const communityCommerce = read("convex/communityCommerce.ts");
const founderBilling = read("convex/founderBilling.ts");
const httpBilling = read("convex/httpBilling.ts");
const refundCore = read("convex/communityApplicationFeeRefundCore.ts");
const refundLedger = read("convex/communityApplicationFeeRefunds.ts");
const stripeCore = read("convex/stripeCore.ts");
const operatorIntelligence = read("convex/operatorIntelligence.ts");
const billingDocs = read("docs/product/reference/billing-entitlements.md");
const envExample = read(".env.example");

assert.match(
  founderPlan,
  /POLYNET_COMMUNITY_PLATFORM_FEE_BPS = 290/,
  "Community commerce must have one canonical 2.9% fee.",
);
assert.doesNotMatch(
  founderPlan,
  /MANAGED_COMMUNITY_PLATFORM_FEE_BPS|LEGACY_BYOK_PLATFORM_FEE_BPS/,
  "Funding mode must not fork community revenue fees.",
);
assert.match(auth, /platformFeeBps: POLYNET_COMMUNITY_PLATFORM_FEE_BPS/g);
assert.match(
  operatorIntelligence,
  /applyBpsToMoneyMetric\([\s\S]*moneyFromCheckout\(row\),[\s\S]*POLYNET_COMMUNITY_PLATFORM_FEE_BPS/,
  "Operator revenue must use the same universal fee as checkout.",
);

assert.match(
  schema,
  /communityStripeCustomers: defineTable\(\{[\s\S]*providerAccountId: v\.string\(\)[\s\S]*providerCustomerId: v\.string\(\)[\s\S]*\.index\("by_user_account", \["userId", "providerAccountId"\]\)[\s\S]*\.index\("by_account_customer", \["providerAccountId", "providerCustomerId"\]\)/,
  "Member customers must be keyed inside one connected account.",
);
assert.match(
  schema,
  /communityApplicationFeeRefunds: defineTable\(\{[\s\S]*providerAccountId: v\.string\(\)[\s\S]*providerApplicationFeeId: v\.string\(\)[\s\S]*providerRefundId: v\.string\(\)[\s\S]*v\.literal\("processing"\)[\s\S]*v\.literal\("succeeded"\)[\s\S]*v\.literal\("indeterminate"\)[\s\S]*\.index\("by_providerAccount_refund", \["providerAccountId", "providerRefundId"\]\)/,
  "Application-fee reversal must keep an idempotent provider-scoped ledger.",
);
assert.match(
  schema,
  /communityApplicationFeeRefundLocks: defineTable\(\{[\s\S]*providerApplicationFeeId: v\.string\(\)[\s\S]*leaseExpiresAt: v\.number\(\)[\s\S]*\.index\("by_providerApplicationFee", \["providerApplicationFeeId"\]\)/,
  "Application-fee reversal must serialize work per Stripe application fee.",
);
assert.match(
  schema,
  /communityPricePoints: defineTable\(\{[\s\S]*providerAccountId: v\.optional\(v\.string\(\)\)[\s\S]*providerPriceId:/,
  "Connected-account price IDs must carry their account identity.",
);
assert.match(
  schema,
  /communitySubscriptions: defineTable\(\{[\s\S]*providerAccountId: v\.optional\(v\.string\(\)\)[\s\S]*\.index\("by_providerAccount_subscription", \["providerAccountId", "providerSubscriptionId"\]\)/,
  "Subscription lookup must use account plus subscription ID.",
);

assert.match(communityCommerce, /ensureCommunityStripeCustomerForUser/);
assert.match(
  communityCommerce,
  /customers\.create\([\s\S]*stripeAccount: providerAccountId/,
  "Member customers must be created on the founder account.",
);
assert.match(
  communityCommerce,
  /products\.create\([\s\S]*stripeAccount: checkoutConfig\.providerAccountId/,
  "Community products must be created on the founder account.",
);
assert.match(
  communityCommerce,
  /prices\.create\([\s\S]*stripeAccount: checkoutConfig\.providerAccountId/,
  "Community prices must be created on the founder account.",
);
assert.match(
  communityCommerce,
  /checkout\.sessions\.create\([\s\S]*application_fee_percent: checkoutConfig\.platformFeeBps \/ 100[\s\S]*stripeAccount: checkoutConfig\.providerAccountId/,
  "Member checkout must be a direct connected-account charge with Polynet application fee.",
);
assert.doesNotMatch(
  communityCommerce,
  /transfer_data\s*:/,
  "Destination charges must be deleted from community checkout.",
);
assert.doesNotMatch(
  communityCommerce,
  /ensureStripeCustomerForUser|attachStripeCustomerToUser/,
  "Community commerce must not pollute the platform customer identity table.",
);
assert.doesNotMatch(
  billingCore,
  /attachStripeCustomerToUser/,
  "Claim redemption must preserve connected-account customer ownership.",
);
assert.match(
  billingCore,
  /source === "stripe" && !providerAccountId[\s\S]*community_subscription_provider_account_required/,
  "Stripe-backed access must fail closed without account identity.",
);

assert.match(httpBilling, /function readStripeEventAccountId/);
assert.match(stripeCore, /STRIPE_CONNECT_WEBHOOK_SECRET/);
assert.match(communityCommerce, /requireStripeConnectWebhookConfiguration\(\)/);
assert.match(stripeCore, /stripeWebhookScopeMatchesEvent/);
assert.match(stripeCore, /stripe_webhook_livemode_mismatch/);
assert.match(
  stripeCore,
  /scope: "account" as const[\s\S]*scope: "connect" as const[\s\S]*constructEventAsync/,
  "Platform and Connect endpoints must each verify against their own signing secret.",
);
assert.match(envExample, /STRIPE_CONNECT_WEBHOOK_SECRET=/);
assert.match(
  httpBilling,
  /getCommunitySubscriptionByProviderSubscriptionIdInternal[\s\S]*providerAccountId,[\s\S]*providerSubscriptionId/,
  "Webhook subscription lookup must include event account identity.",
);
assert.match(
  httpBilling,
  /requireCommunityProviderAccountMatch\(\{[\s\S]*expectedProviderAccountId: communityCheckoutSession\.providerAccountId,[\s\S]*mismatchCode: "community_checkout_provider_account_mismatch"/,
  "Checkout webhook must reject the wrong connected account.",
);
assert.match(
  httpBilling,
  /stripeAccount: providerAccountId/,
  "Webhook evidence retrieval must use connected-account request scope.",
);
assert.match(
  httpBilling,
  /founder_subscription_connected_event/,
  "Connected-account events must not mutate platform founder subscriptions.",
);
assert.doesNotMatch(founderBilling, /stripeAccount\s*:/);
assert.equal(existsSync(new URL("../convex/premiumBilling.ts", import.meta.url)), false);

assert.match(refundCore, /Math\.floor\(\(applicationFeeAmount \* refundedBefore\) \/ chargeAmount\)/);
assert.match(refundCore, /Math\.floor\(\(applicationFeeAmount \* refundedAfter\) \/ chargeAmount\)/);
assert.match(refundLedger, /community_application_fee_refund_identity_conflict/);
assert.match(refundLedger, /community_application_fee_refund_in_progress/);
assert.match(refundLedger, /community_application_fee_refund_lock_busy/);
assert.match(httpBilling, /reverseCommunityApplicationFeesForRefund/);
assert.match(httpBilling, /calculateApplicationFeeRefundAllocation/);
assert.match(httpBilling, /applicationFees\.createRefund/);
assert.match(
  httpBilling,
  /idempotencyKey:[\s\S]*`community-application-fee-refund:\$\{providerAccountId\}:\$\{refund\.id\}`/,
);
assert.match(
  httpBilling,
  /event\.type === "refund\.created"[\s\S]{0,100}event\.type === "refund\.updated"/,
);
assert.match(httpBilling, /event\.type === "charge\.refunded"/);

assert.match(billingDocs, /Polynet keeps a 2\.9% application fee from paid-member community revenue/);
assert.match(billingDocs, /community_join` checkout on the builder's connected account/);
assert.match(billingDocs, /Stripe processing fees are separate/);
assert.match(billingDocs, /reverses the cumulative proportional share of Polynet's application fee/);

console.log("Community commerce economics contract proof passed.");
