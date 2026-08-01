import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const entitlement = read("convex/operatorEntitlementsCore.ts");
const admission = read("convex/founderInferenceCore.ts");
const receipts = read("convex/founderInference.ts");
const runtime = read("convex/founderInferenceRuntime.ts");
const worker = read("convex/communityAgentServeWorker.ts");
const billing = read("convex/founderBilling.ts");
const billingGateway = read("shared/cloudFounderBillingGateway.ts");
const billingUi = read("apps/web/src/components/WebBillingSettingsSection.tsx");
const billingController = read("apps/web/src/controllers/useWebFounderBillingController.ts");
const auth = read("convex/auth.ts");
const premiumBilling = read("convex/premiumBilling.ts");
const schema = read("convex/schema.ts");

assert.match(
  entitlement,
  /query\("operatorRoles"[\s\S]*withIndex\("by_user"[\s\S]*collect\(\)[\s\S]*activeRows\.length === 1 && activeRows\[0\]\?\.role === "owner"/,
  "operator complimentary access must come only from one active canonical owner role",
);
assert.doesNotMatch(
  [entitlement, admission, billing, auth].join("\n"),
  /neilmcdevitt|@gmail\.com/i,
  "operator complimentary access must not depend on a hard-coded person or email",
);
assert.match(
  admission,
  /hasPlatformOwnerComplimentaryAccess\(ctx, community\.ownerId\)[\s\S]*mode: "platform_operator_grant"[\s\S]*getFounderSubscriptionByCommunity/,
  "operator admission must precede paid and legacy founder funding",
);
assert.match(
  schema,
  /communityInferenceReceipts: defineTable[\s\S]*v\.literal\("platform_operator_grant"\)/,
  "operator-funded inference must remain auditable in canonical receipts",
);
assert.match(
  receipts,
  /COMMUNITY_OWNER_INFERENCE_ACTOR_TURNS_PER_MINUTE[\s\S]*COMMUNITY_OWNER_INFERENCE_COMMUNITY_TURNS_PER_MINUTE[\s\S]*expectedFundingMode === "platform_operator_grant"[\s\S]*requireFounderInferencePricingFromEnv\(\)\.pricingVersion/,
  "operator-funded inference must preserve rate limits and pricing evidence",
);
assert.match(
  admission,
  /receipt\.fundingMode === "platform_operator_grant"[\s\S]*calculateFounderInferenceCostMicros/,
  "operator-funded inference must settle internal token cost",
);
assert.match(
  runtime,
  /fundingMode: "owner_api_key" \| "platform_subscription" \| "platform_operator_grant"/,
  "the shared inference runtime must admit the operator funding mode",
);
assert.match(
  worker,
  /directOpenAiFunded =[\s\S]*context\.funding\.mode === "platform_operator_grant"[\s\S]*runOpenAiNativeToolCompletion/,
  "operator-funded community turns must use the bounded platform OpenAI path",
);
assert.match(
  billing,
  /status = "operator_comped"[\s\S]*funding_mode: operatorComped[\s\S]*"operator_comp"/,
  "founder billing must project explicit complimentary operator access",
);
assert.match(
  billing,
  /getFounderBillingExemptionInternal[\s\S]*if \(exemption\?\.operatorComped\) throw new Error\("operator_billing_exempt"\)/,
  "operator checkout must fail closed before creating Stripe state",
);
assert.match(
  billingGateway,
  /funding_mode: "managed" \| "legacy_byok" \| "operator_comp"/,
  "the billing gateway must preserve the operator funding projection",
);
assert.match(
  billingUi,
  /Operator access included[\s\S]*isOperatorComped \? null/,
  "the billing UI must explain operator access without showing a checkout action",
);
assert.match(
  billingController,
  /startCheckoutAfterCommunityCreated[\s\S]*params\.operatorComplimentaryAccess[\s\S]*return;[\s\S]*community\.funding_mode === "operator_comp"[\s\S]*return;[\s\S]*await startCheckout\(communityId\)/,
  "new operator-owned communities must not redirect into founder checkout",
);
assert.match(
  premiumBilling,
  /getAccountCommerceAccessForUserInternal[\s\S]*access\?\.operator_complimentary_access[\s\S]*throw new Error\("operator_billing_exempt"\)[\s\S]*ensureStripeCustomerForUser/,
  "operator Premium checkout must fail before creating Stripe customer or checkout state",
);
assert.match(
  billingUi,
  /operator_complimentary_access === true[\s\S]*Operator access included[\s\S]*Included with the platform owner role/,
  "personal billing must project operator access without a Premium checkout",
);
assert.match(
  auth,
  /PLATFORM_OWNER_COMPLIMENTARY_MAX_COMMUNITIES[\s\S]*operator_complimentary_access: operatorComplimentaryAccess[\s\S]*max_communities: meta\.maxCommunities/,
  "operator product access must include a bounded community-count override",
);

console.log("operator complimentary access contract proof passed");
