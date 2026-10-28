import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const founderPlan = read("shared/founderPlan.ts");
const builderOffer = read("shared/builderOffer.ts");
const builderFunding = read("shared/builderFunding.ts");
const founderPlanCore = read("convex/founderPlanCore.ts");
const founderBilling = read("convex/founderBilling.ts");
const founderInference = read("convex/founderInferenceCore.ts");
const founderInferenceApi = read("convex/founderInference.ts");
const communityLifecycle = read("convex/communityLifecycle.ts");
const communityBuilderAccessCore = read("convex/communityBuilderAccessCore.ts");
const communityCommerce = read("convex/communityCommerce.ts");
const auth = read("convex/auth.ts");
const httpBilling = read("convex/httpBilling.ts");
const stripeCore = read("convex/stripeCore.ts");
const creatorCommerce = read("convex/creatorCommerce.ts");
const stripeCustomers = read("convex/stripeCustomers.ts");
const toolCosts = read("convex/voiceProviderCostAccounting.ts");
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");
const runtimeTurnHandlers = read("convex/runtimeTurnHandlers.ts");
const voice = read("convex/httpVoice.ts");
const crons = read("convex/crons.ts");
const schema = read("convex/schema.ts");
const billingUi = read("apps/web/src/components/WebBillingSettingsSection.tsx");
const accountUi = read("apps/web/src/components/WebAccountSettingsSection.tsx");
const founderBillingGateway = read("shared/cloudFounderBillingGateway.ts");
const publicLanding = read("apps/web/src/components/polynetLanding/ConversionLanding.tsx");
const publicLandingStyles = read("apps/web/src/components/polynetLanding/ConversionLanding.css");
const envExample = read(".env.example");
const modelCatalog = read("shared/modelCatalog.ts");
const legalRegistry = read("shared/legalDocuments.ts");
const legalAcceptances = read("convex/legalAcceptances.ts");
const legalContent = read("apps/web/src/docs/legalDocumentsContent.ts");
const legacyTerms = read("docs/legal/terms-of-service-v1.md");
const historicalTerms = read("docs/legal/terms-of-service-v2.md");
const currentTerms = read("docs/legal/terms-of-service-v3.md");
const legacyTermsSupersessionNotice = read("docs/legal/terms-of-service-v1-supersession-notice.md");
const termsSupersessionNotice = read("docs/legal/terms-of-service-v2-supersession-notice.md");
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
assert.match(founderPlan, /COMMUNITY_BUILDER_ACCESS_GRANDFATHERED = "grandfathered"/);
assert.match(founderPlan, /COMMUNITY_BUILDER_ACCESS_SUBSCRIPTION_REQUIRED/);
assert.match(schema, /builderAccessMode: v\.optional/);
assert.match(communityBuilderAccessCore, /normalizeCommunityLifecycle/);
assert.match(communityBuilderAccessCore, /reason: "community_archived"/);
assert.match(communityBuilderAccessCore, /parseCommunityBuilderAccessMode/);
assert.match(communityBuilderAccessCore, /getFounderSubscriptionByCommunity/);
assert.match(communityBuilderAccessCore, /hasPlatformOwnerComplimentaryAccess/);
for (const lane of ["builder_included", "builder"]) {
  assert.match(builderFunding, new RegExp(`"${lane}"`));
}
for (const action of [
  "buy_builder",
  "resume_checkout",
  "manage_builder",
]) {
  assert.match(builderFunding, new RegExp(`"${action}"`));
}
assert.match(builderFunding, /if \(input\.operatorComplimentaryAccess\)/);
assert.doesNotMatch(
  builderFunding,
  /legacy|owner_api|fundingPolicy|ApiKey/i,
  "Builder projection must derive only from subscription, checkout, and operator authority",
);
assert.match(founderBilling, /POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS/);
assert.match(founderBilling, /resolveBuilderFundingProjection/);
assert.match(founderBilling, /funding_lane: fundingProjection\.lane/);
assert.match(founderBilling, /funding_state: fundingProjection\.state/);
assert.match(founderBilling, /builder_access_mode: builderAccessMode \?\? "invalid"/);
assert.match(
  founderBilling,
  /allowed_actions:[\s\S]*?lifecycle\.status === "active"[\s\S]*?archiveJob\?\.status === "complete" &&[\s\S]*?!operatorComped &&[\s\S]*?builderAccessMode === "subscription_required"[\s\S]*?pendingCheckout \? "resume_checkout" as const : "buy_builder" as const/,
  "archived communities must fail closed until cleanup completes; only subscription-required communities expose the canonical Builder purchase action",
);
assert.match(founderBillingGateway, /BuilderFundingLane/);
assert.match(founderBillingGateway, /BuilderFundingState/);
assert.match(founderBillingGateway, /BuilderFundingAction/);
assert.match(founderBilling, /communityId/);
assert.match(
  schema,
  /founderSubscriptions: defineTable\(\{[\s\S]*?communityId: v\.optional\(v\.id\("communities"\)\)[\s\S]*?founderUsageCycles: defineTable\(\{[\s\S]*?communityId: v\.id\("communities"\)/,
);
const founderFundingSchema = schema.slice(
  schema.indexOf("founderSubscriptions: defineTable"),
  schema.indexOf("communityInferenceReceipts: defineTable"),
);
assert.match(founderFundingSchema, /founderSubscriptions:[\s\S]*communityId: v\.optional/);
assert.match(founderFundingSchema, /founderUsageCycles:[\s\S]*communityId: v\.id/);
assert.match(founderPlanCore, /communityId\?:/);
assert.match(founderPlanCore, /founder_subscription_community_missing/);
assert.match(founderPlanCore, /founder_usage_cycle_community_mismatch/);
assert.match(founderBilling, /founder_subscription_community_owner_mismatch/);
assert.doesNotMatch(
  founderBilling,
  /getCurrentFounderPlanStatus|getFounderSubscriptionByProviderSubscriptionIdInternal/,
);
assert.match(founderInference, /return \{ ok: false, code: "founder_plan_required" \}/);
assert.doesNotMatch(
  founderInference,
  /owner_funding_choice_required|owner_funding_suspended|owner_credential_missing/,
  "community inference admission must be hosted-only",
);
assert.match(founderInference, /founder_usage_cycle_community_mismatch/);
assert.doesNotMatch(founderInference, /legacy_requester_chatgpt/);
assert.match(
  founderInference,
  /resolveAdditionalManagedCommunityAdmission[\s\S]*query\("communities"[\s\S]*by_owner[\s\S]*resolveCommunityInferenceFundingAdmission/,
);
assert.doesNotMatch(founderInference, /MAX_COMMUNITIES|fundedCommunityCount\s*[><=]/);
assert.doesNotMatch(communityLifecycle, /resolveAdditionalManagedCommunityAdmission\(ctx, ownerId\)/);
assert.match(communityLifecycle, /founderSubscriptionId: v\.optional\(v\.id\("founderSubscriptions"\)\)/);
assert.match(communityLifecycle, /founderSubscriptionStatusGrantsAccess/);
assert.match(communityLifecycle, /founder_subscription_already_attached/);
assert.match(communityLifecycle, /builderAccessMode: COMMUNITY_BUILDER_ACCESS_SUBSCRIPTION_REQUIRED/);
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

assert.equal(existsSync(resolve(root, "convex/premiumBilling.ts")), false);
assert.doesNotMatch(billingUi, /Premium|tool balance|auto recharge|Add credits/i);
assert.match(billingUi, /Polynet-hosted community AI/);
const founderCustomerSurface = [
  billingUi,
  accountUi,
  builderOffer,
  founderBillingGateway,
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
assert.doesNotMatch(
  founderInferenceApi,
  /export const (?:prepareFounderInferenceActivationInternal|completeFounderInferenceActivationInternal)\b/,
  "community BYOK activation internals must not remain deployable",
);
assert.doesNotMatch(
  founderInferenceApi,
  /getCurrentFounderInferenceStatus|activateFounderInference|suspendFounderInference|founder_inference_byok_retired/,
);
assert.doesNotMatch(
  stripeCustomers,
  /refreshWorkspaceCardOnFileStatus|getWorkspaceCardOnFileStatus|startWorkspaceCardSetupCheckout|workspace_tool_billing_retired/,
);

assert.match(toolCosts, /billingDisposition: "platform_absorbed"/);
assert.match(toolCosts, /recordVoiceProviderCostInternal/);
for (const runtimeSource of [runtimeAgentLoop, runtimeTurnHandlers, voice]) {
  assert.doesNotMatch(runtimeSource, /reserveCreditsInternal|settleCreditsInternal/);
}
assert.doesNotMatch(
  runtimeAgentLoop,
  /recordVoiceProviderCostBestEffort/,
  "paid web tools must settle provider cost through their canonical receipt mutation",
);
assert.match(runtimeAgentLoop, /settleFounderPaidToolFundingSession/);
assert.doesNotMatch(
  runtimeTurnHandlers,
  /recordVoiceProviderCostBestEffort/,
  "the native turn handler must not retain retired Workspace provider-cost accounting",
);
assert.match(voice, /recordVoiceProviderCostBestEffort/);
assert.doesNotMatch(crons, /auto.?recharge|collectWorkspaceUsageByCard|reconcileExpiredCreditReservations/i);
assert.equal(
  existsSync(new URL("../convex/workspaceCredits.ts", import.meta.url)),
  false,
  "the old Workspace credits module stays deleted (POL-24)",
);

// Public offer truth stays conceptual. Allowances, model versions, and cost controls are internal.
assert.match(publicLanding, /\$79\/month for one managed community/);
assert.match(publicLanding, /Hosted AI allowance included/);
assert.match(publicLanding, /(?:shared|collective) intelligence/i);
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
assert.doesNotMatch(
  modelCatalog,
  /CONNECTED_PROVIDER_MODELS|FREE_MODELS|supportedFundingSources/,
  "there is no model catalog to sell or connect: every turn runs the founder-funded community model",
);
assert.doesNotMatch(
  retiredPremiumStyles,
  /premium-gate-|premium-locked|premium-member-badge|billing-plan-col--premium/,
);

// Accepted legal bodies are immutable evidence. Current legal and product surfaces
// project the present funding boundary without rewriting historical acceptance.
assert.equal(
  createHash("sha256").update(legacyTerms).digest("hex"),
  "35b58f601f6be0725a4db36ffce87928640b0d554275b9c290747e8abd184b10",
  "accepted Terms v1 must remain byte-for-byte immutable",
);
assert.equal(
  createHash("sha256").update(historicalTerms).digest("hex"),
  "e5e9cadb23bd7eae9400274e9f67399ad98f061db601ad01caae6996001dbdaa",
  "accepted Terms v2 must remain byte-for-byte immutable",
);
assert.equal(
  createHash("sha256").update(historicalBuilderPartnerTerms).digest("hex"),
  "63f0cc88984aadbb40999e100d370381a8fe84f57d5b3e6651edf9460091b11a",
  "accepted Builder Partner terms must remain byte-for-byte immutable",
);
assert.match(legalRegistry, /TERMS_OF_SERVICE_VERSION = "terms_of_service_v3"/);
assert.match(legalRegistry, /HISTORICAL_TERMS_OF_SERVICE_VERSION = "terms_of_service_v2"/);
assert.match(legalRegistry, /LEGACY_TERMS_OF_SERVICE_VERSION = "terms_of_service_v1"/);
assert.match(legalRegistry, /sourcePath: "docs\/legal\/terms-of-service-v3\.md"/);
assert.match(legalRegistry, /sourcePath: "docs\/legal\/terms-of-service-v2\.md"/);
assert.match(legalRegistry, /sourcePath: "docs\/legal\/terms-of-service-v1\.md"/);
assert.match(legalAcceptances, /row\.documentVersion === document\.version/);
assert.match(legalAcceptances, /args\.termsVersion !== TERMS_OF_SERVICE_DOCUMENT\.version/);
assert.match(
  legalAcceptances,
  /documentVersion: TERMS_OF_SERVICE_DOCUMENT\.version/,
  "new Terms acceptance writes must record only the current version",
);
assert.match(legalContent, /terms-of-service-v3\.md\?raw/);
assert.doesNotMatch(legalContent, /terms-of-service-v2\.md\?raw/);
assert.doesNotMatch(legalContent, /terms-of-service-v1\.md\?raw/);
assert.match(currentTerms, /newly created non-operator community requires its own current Builder subscription/);
assert.match(currentTerms, /Existing communities that Polynet classifies as grandfathered/);
assert.match(currentTerms, /Archiving is a separate lifecycle action/);
assert.match(billingDocs, /Existing grandfathered communities retain ordinary platform operation without Builder/);
assert.match(billingDocs, /Newly created non-operator communities are subscription-required/);
assert.match(billingDocs, /Archive is a lifecycle action, not a billing status/);
assert.match(billingDocs, /Community BYOK and requester ChatGPT are retired as authority/);
assert.match(billingDocs, /Builder is not an account-wide tier/);
assert.match(legacyTermsSupersessionNotice, /accepted by 27\s+production users/);
assert.match(termsSupersessionNotice, /do not satisfy current v3\s+acceptance/);
assert.match(termsSupersessionNotice, /New acceptance writes require `terms_of_service_v3`/);
assert.match(
  legacyTermsSupersessionNotice,
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
