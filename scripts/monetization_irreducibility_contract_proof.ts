import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const founderPlan = read("shared/founderPlan.ts");
const builderOffer = read("shared/builderOffer.ts");
const builderFunding = read("shared/builderFunding.ts");
const founderPlanCore = read("convex/founderPlanCore.ts");
const founderBilling = read("convex/founderBilling.ts");
const founderInference = read("convex/founderInferenceCore.ts");
const ownerFunding = read("convex/communityOwnerFundingCore.ts");
const founderInferenceApi = read("convex/founderInference.ts");
const communityLifecycle = read("convex/communityLifecycle.ts");
const communityCommerce = read("convex/communityCommerce.ts");
const auth = read("convex/auth.ts");
const httpBilling = read("convex/httpBilling.ts");
const stripeCore = read("convex/stripeCore.ts");
const creatorCommerce = read("convex/creatorCommerce.ts");
const premiumBilling = read("convex/premiumBilling.ts");
const stripeCustomers = read("convex/stripeCustomers.ts");
const toolCosts = read("convex/platformToolCostAccounting.ts");
const workspaceCredits = read("convex/workspaceCredits.ts");
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");
const runtimeTurnHandlers = read("convex/runtimeTurnHandlers.ts");
const voice = read("convex/httpVoice.ts");
const crons = read("convex/crons.ts");
const schema = read("convex/schema.ts");
const billingUi = read("apps/web/src/components/WebBillingSettingsSection.tsx");
const accountUi = read("apps/web/src/components/WebAccountSettingsSection.tsx");
const founderInferenceController = read("apps/web/src/controllers/useWebFounderInferenceController.ts");
const founderBillingGateway = read("shared/cloudFounderBillingGateway.ts");
const founderInferenceGateway = read("shared/cloudFounderInferenceGateway.ts");
const publicLanding = read("apps/web/src/components/polynetLanding/ConversionLanding.tsx");
const publicLandingStyles = read("apps/web/src/components/polynetLanding/ConversionLanding.css");
const envExample = read(".env.example");
const modelCatalog = read("shared/modelCatalog.ts");
const legalRegistry = read("shared/legalDocuments.ts");
const legalAcceptances = read("convex/legalAcceptances.ts");
const legalContent = read("apps/web/src/docs/legalDocumentsContent.ts");
const historicalTerms = read("docs/legal/terms-of-service-v1.md");
const currentTerms = read("docs/legal/terms-of-service-v2.md");
const termsSupersessionNotice = read("docs/legal/terms-of-service-v1-supersession-notice.md");
const historicalBuilderPartnerTerms = read("docs/legal/builder-partner-terms-v2.md");
const builderPartnerRetirementNotice = read("docs/legal/builder-partner-terms-v2-retirement-notice.md");
const billingDocs = read("docs/product/reference/billing-entitlements.md");
const retiredPremiumStyles = [
  read("apps/web/src/index.css"),
  read("apps/web/src/styles/shell-and-onboarding.css"),
  read("apps/web/src/styles/community-and-content.css"),
  read("apps/web/src/styles/settings-runtime-and-theme-overrides.css"),
].join("\n");

assert.match(founderPlan, /MONTHLY_PRICE_BASE_UNITS = 7_900/);
assert.match(founderPlan, /INCLUDED_COST_MICROS = 20_000_000/);
assert.match(founderPlan, /INCLUDED_COMMUNITIES = 1/);
assert.match(founderPlan, /COMMUNITY_PLATFORM_FEE_BPS = 290/);
assert.match(founderPlan, /POLYNET_BUILDER_OFFER_NAME = "Builder"/);
for (const lane of ["legacy_choice", "builder_included", "builder"]) {
  assert.match(builderFunding, new RegExp(`"${lane}"`));
}
for (const action of [
  "activate_owner_api",
  "manage_owner_api",
  "buy_builder",
  "resume_checkout",
  "manage_builder",
]) {
  assert.match(builderFunding, new RegExp(`"${action}"`));
}
assert.match(builderFunding, /fundingPolicy === COMMUNITY_FUNDING_POLICY_LEGACY_BYOK/);
assert.match(builderFunding, /if \(input\.operatorComplimentaryAccess\)/);
assert.doesNotMatch(builderFunding, /createdAt|Date\./, "legacy eligibility must never expand with time");
assert.match(founderBilling, /POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS/);
assert.match(founderBilling, /resolveBuilderFundingProjection/);
assert.match(founderBilling, /funding_lane: fundingProjection\.lane/);
assert.match(founderBilling, /funding_state: fundingProjection\.state/);
assert.match(founderBilling, /allowed_actions: fundingProjection\.allowedActions/);
assert.match(founderBillingGateway, /BuilderFundingLane/);
assert.match(founderBillingGateway, /BuilderFundingState/);
assert.match(founderBillingGateway, /BuilderFundingAction/);
assert.match(founderBilling, /communityId/);
assert.match(
  schema,
  /founderSubscriptions: defineTable\(\{[\s\S]*?communityId: v\.id\("communities"\)[\s\S]*?founderUsageCycles: defineTable\(\{[\s\S]*?communityId: v\.id\("communities"\)/,
);
const founderFundingSchema = schema.slice(
  schema.indexOf("founderSubscriptions: defineTable"),
  schema.indexOf("communityInferenceReceipts: defineTable"),
);
assert.doesNotMatch(founderFundingSchema, /communityId: v\.optional/);
assert.doesNotMatch(founderPlanCore, /communityId\?:/);
assert.match(founderPlanCore, /founder_subscription_community_missing/);
assert.match(founderPlanCore, /founder_usage_cycle_community_mismatch/);
assert.match(founderBilling, /founder_subscription_community_owner_mismatch/);
assert.doesNotMatch(
  founderBilling,
  /getCurrentFounderPlanStatus|getFounderSubscriptionByProviderSubscriptionIdInternal/,
);
assert.match(ownerFunding, /owner_funding_choice_required/);
assert.match(founderInference, /founder_usage_cycle_community_mismatch/);
assert.doesNotMatch(founderInference, /legacy_requester_chatgpt/);
assert.match(
  founderInference,
  /resolveAdditionalManagedCommunityAdmission[\s\S]*query\("communities"[\s\S]*by_owner[\s\S]*resolveCommunityInferenceFundingAdmission/,
);
assert.doesNotMatch(founderInference, /MAX_COMMUNITIES|fundedCommunityCount\s*[><=]/);
assert.match(communityLifecycle, /resolveAdditionalManagedCommunityAdmission\(ctx, ownerId\)/);
assert.match(communityLifecycle, /community_funding_required_before_create/);
assert.doesNotMatch(communityLifecycle, /max_communities|community_owner_limit_reached/);
assert.match(auth, /CACHED_CLIENT_UNBOUNDED_COMMUNITY_LIMIT = Number\.MAX_SAFE_INTEGER/);
assert.doesNotMatch(
  auth,
  /POLYNET_FREE_MAX_COMMUNITIES|PLATFORM_OWNER_COMPLIMENTARY_MAX_COMMUNITIES|maxCommunities/,
);

assert.match(communityCommerce, /application_fee_percent: checkoutConfig\.platformFeeBps \/ 100/);
assert.match(communityCommerce, /paid_subscription/);
assert.match(communityCommerce, /community_join/);
assert.match(creatorCommerce, /stripeConnect/);
assert.match(stripeCore, /STRIPE_CONNECT_WEBHOOK_SECRET/);
assert.match(httpBilling, /communityApplicationFeeRefunds/);
assert.match(httpBilling, /applicationFees\.createRefund/);
assert.match(httpBilling, /syncCommunitySubscriptionFromStripeSubscription/);

assert.match(premiumBilling, /premium_subscription_retired/);
assert.doesNotMatch(premiumBilling, /getStripeClient|checkout\.sessions|ctx\.runMutation/);
assert.doesNotMatch(billingUi, /Premium|tool balance|auto recharge|Add credits/i);
assert.match(billingUi, /Polynet-hosted community AI/);
const founderCustomerSurface = [
  billingUi,
  accountUi,
  builderOffer,
  founderInferenceController,
  founderBillingGateway,
  founderInferenceGateway,
].join("\n");
for (const internalOfferDetail of [
  /GPT 5\.6/i,
  /\bLuna\b/i,
  /\$20\b/,
  /included_cost_micros/,
  /(?:reserved|settled|remaining)_cost_micros/,
  /model_id/,
]) {
  assert.doesNotMatch(founderCustomerSurface, internalOfferDetail);
}
const founderBillingOverviewQuery = founderBilling.slice(
  founderBilling.indexOf("export const getFounderBillingOverview"),
  founderBilling.indexOf("export const getFounderBillingPortalTargetInternal"),
);
assert.doesNotMatch(
  founderBillingOverviewQuery,
  /founderUsageCycles|model_id|included_cost_micros|(?:reserved|settled|remaining)_cost_micros/,
);
const founderInferenceStatusQuery = founderInferenceApi.slice(
  founderInferenceApi.indexOf("export const getCurrentFounderInferenceStatus"),
  founderInferenceApi.indexOf("export const prepareFounderInferenceActivationInternal"),
);
assert.doesNotMatch(founderInferenceStatusQuery, /model_id/);

const retiredCardFunctions = stripeCustomers.slice(
  stripeCustomers.indexOf("export const refreshWorkspaceCardOnFileStatus"),
);
assert.match(retiredCardFunctions, /workspace_tool_billing_retired/);
assert.doesNotMatch(retiredCardFunctions, /checkout\.sessions\.create|paymentMethods\.list/);

assert.match(toolCosts, /billingDisposition: "platform_absorbed"/);
assert.match(toolCosts, /recordProviderCostInternal/);
for (const runtimeSource of [runtimeAgentLoop, runtimeTurnHandlers, voice]) {
  assert.doesNotMatch(runtimeSource, /reserveCreditsInternal|settleCreditsInternal/);
}
assert.match(runtimeAgentLoop, /recordPlatformToolCostBestEffort/);
assert.match(runtimeTurnHandlers, /recordPlatformToolCostBestEffort/);
assert.match(voice, /recordPlatformToolCostBestEffort/);
assert.doesNotMatch(crons, /auto.?recharge|collectWorkspaceUsageByCard|reconcileExpiredCreditReservations/i);
assert.match(crons, /recordBlaxelStorageProviderCostsInternal/);
for (const retiredEndpoint of [
  "collectWorkspaceUsageByCardInternal",
  "getWorkspaceCreditBalance",
  "getWorkspaceBillingOverview",
  "completeWorkspaceCreditTopupCheckoutSessionInternal",
  "recordWorkspaceComputeChargeInternal",
  "reserveCreditsInternal",
  "settleCreditsInternal",
  "retryPendingCreditSettlementsInternal",
  "reconcileExpiredCreditReservationsInternal",
]) {
  assert.doesNotMatch(
    workspaceCredits,
    new RegExp(`export const ${retiredEndpoint}\\b`),
    `${retiredEndpoint} must not remain a deployed Convex endpoint`,
  );
}
assert.match(
  workspaceCredits,
  /export const getWorkspaceToolBalance = query\([\s\S]*workspace_tool_billing_retired/,
  "the one cached-client balance endpoint must fail closed without reading financial state",
);

// Public offer truth stays conceptual. Allowances, model versions, and cost controls are internal.
assert.match(publicLanding, /\$79\/month per community/);
assert.match(publicLanding, /Create as many communities as you want; each is billed separately\./);
assert.match(publicLanding, /Polynet-hosted inference/);
assert.match(publicLanding, /2\.9% platform fee/);
assert.match(publicLanding, /Stripe processing fees apply separately/);
assert.match(publicLanding, /collective intelligence/i);
for (const forbiddenPublicClaim of [
  /Start free/i,
  /No card/i,
  /Live in an afternoon/i,
  /You don't pay until you get paid/i,
  /Pro, when you're ready/i,
  /No monthly bill/i,
  /free until your community pays/i,
  /optional Pro/i,
  /AI-first community platform/i,
  /GPT 5\.6/i,
  /\bLuna\b/i,
  /\$20\b/,
  /AI credits?/i,
  /\btokens?\b/i,
]) {
  assert.doesNotMatch(publicLanding, forbiddenPublicClaim);
}
assert.doesNotMatch(`${publicLanding}\n${publicLandingStyles}`, /premium-simplified/i);

assert.match(envExample, /POLYNET_FOUNDER_STRIPE_PRICE_ID=/);
assert.doesNotMatch(envExample, /STRIPE_BUILDER_PLAN_(?:BUILDER|PRO)_PRICE_ID/);
assert.doesNotMatch(modelCatalog, /PREMIUM_MODELS|PremiumModelCatalogEntry|getPremiumModelCatalog/);
assert.match(modelCatalog, /CONNECTED_PROVIDER_MODELS/);
assert.doesNotMatch(
  retiredPremiumStyles,
  /premium-gate-|premium-locked|premium-member-badge|billing-plan-col--premium/,
);

// Accepted legal bodies are immutable evidence. Current legal and product surfaces
// project the present funding boundary without rewriting historical acceptance.
assert.equal(
  createHash("sha256").update(historicalTerms).digest("hex"),
  "35b58f601f6be0725a4db36ffce87928640b0d554275b9c290747e8abd184b10",
  "accepted Terms v1 must remain byte-for-byte immutable",
);
assert.equal(
  createHash("sha256").update(historicalBuilderPartnerTerms).digest("hex"),
  "63f0cc88984aadbb40999e100d370381a8fe84f57d5b3e6651edf9460091b11a",
  "accepted Builder Partner terms must remain byte-for-byte immutable",
);
assert.match(legalRegistry, /TERMS_OF_SERVICE_VERSION = "terms_of_service_v2"/);
assert.match(legalRegistry, /HISTORICAL_TERMS_OF_SERVICE_VERSION = "terms_of_service_v1"/);
assert.match(
  legalRegistry,
  /TERMS_OF_SERVICE_ACCEPTANCE_VERSIONS = \[[\s\S]*TERMS_OF_SERVICE_VERSION,[\s\S]*HISTORICAL_TERMS_OF_SERVICE_VERSION/,
);
assert.match(legalRegistry, /sourcePath: "docs\/legal\/terms-of-service-v2\.md"/);
assert.match(legalRegistry, /sourcePath: "docs\/legal\/terms-of-service-v1\.md"/);
assert.match(legalAcceptances, /new Set<string>\(TERMS_OF_SERVICE_ACCEPTANCE_VERSIONS\)/);
assert.match(legalAcceptances, /args\.termsVersion !== TERMS_OF_SERVICE_DOCUMENT\.version/);
assert.match(
  legalAcceptances,
  /documentVersion: TERMS_OF_SERVICE_DOCUMENT\.version/,
  "new Terms acceptance writes must record only the current version",
);
assert.match(legalContent, /terms-of-service-v2\.md\?raw/);
assert.doesNotMatch(legalContent, /terms-of-service-v1\.md\?raw/);
assert.doesNotMatch(currentTerms, /managed-community AI and public acquisition/);
for (const currentFundingTruth of [currentTerms, billingDocs]) {
  assert.match(currentFundingTruth, /managed-community AI|only AI execution fails closed/);
  assert.match(currentFundingTruth, /public funnels/);
  assert.match(currentFundingTruth, /public joins/);
  assert.match(currentFundingTruth, /paid-member checkout/);
  assert.match(currentFundingTruth, /inactive or exhausted|funding is missing or inactive/);
}
assert.match(billingDocs, /exactly three funding lanes/);
assert.match(billingDocs, /frozen legacy-eligible community/);
assert.match(billingDocs, /platform operator included Builder funding/);
assert.match(billingDocs, /Every other community, including every newly created community, uses Builder/);
assert.match(billingDocs, /per community rather than as an account tier/);
assert.match(termsSupersessionNotice, /accepted by 27\s+production users/);
assert.match(termsSupersessionNotice, /Existing v1 acceptances continue to satisfy account setup/);
assert.match(termsSupersessionNotice, /New acceptance writes require `terms_of_service_v2`/);
assert.match(
  termsSupersessionNotice,
  /35b58f601f6be0725a4db36ffce87928640b0d554275b9c290747e8abd184b10/,
);
assert.match(builderPartnerRetirementNotice, /Builder Partner v1 is retired/);
assert.match(builderPartnerRetirementNotice, /four `builder_partner_terms_v2` acceptances/);
assert.match(builderPartnerRetirementNotice, /four corresponding[\s\S]*`legacyProgramGrants`/);
assert.match(builderPartnerRetirementNotice, /new product contract and new legal[\s\S]*version/);
assert.match(
  builderPartnerRetirementNotice,
  /63f0cc88984aadbb40999e100d370381a8fe84f57d5b3e6651edf9460091b11a/,
);

// Historical financial schemas stay readable until liabilities are reconciled.
assert.match(schema, /v\.literal\("premium_subscription"\)/);
assert.match(schema, /v\.literal\("workspace_credit_topup"\)/);
assert.match(schema, /workspaceCreditBalances: defineTable/);
assert.match(schema, /creditLedgerEntries: defineTable/);

console.log("monetization_irreducibility_contract_proof: ok");
