import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { shouldOpenFounderInferencePrompt } from "../apps/web/src/controllers/buildWebGlobalOverlayHostProps.ts";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const schema = read("convex/schema.ts");
const shared = read("shared/founderInference.ts");
const founderPlan = read("shared/founderPlan.ts");
const core = read("convex/founderInferenceCore.ts");
const planCore = read("convex/founderPlanCore.ts");
const pricing = read("convex/founderPlanPricing.ts");
const founderBilling = read("convex/founderBilling.ts");
const communityCommerce = read("convex/communityCommerce.ts");
const auth = read("convex/auth.ts");
const httpBilling = read("convex/httpBilling.ts");
const accountSetup = read("convex/accountSetupCore.ts");
const envExample = read(".env.example");
const backend = read("convex/founderInference.ts");
const fundingRuntime = read("convex/founderInferenceRuntime.ts");
const migration = read("convex/founderInferenceMigration.ts");
const lifecycle = read("convex/communityLifecycle.ts");
const communityPublic = read("convex/communityPublic.ts");
const intake = read("convex/communityAgentConciergeCore.ts");
const worker = read("convex/communityAgentServeWorker.ts");
const autonomousRuntime = read("convex/communityAgentRuntime.ts");
const wikiArchitect = read("convex/communityWikiArchitect.ts");
const communityAdminGateway = read("shared/cloudCommunityAdminGateway.ts");
const modelCatalog = read("shared/modelCatalog.ts");
const settings = read("apps/web/src/components/WebAccountSettingsSection.tsx");
const billingSettings = read("apps/web/src/components/WebBillingSettingsSection.tsx");
const billingGateway = read("shared/cloudFounderBillingGateway.ts");
const billingController = read("apps/web/src/controllers/useWebFounderBillingController.ts");
const inferenceController = read("apps/web/src/controllers/useWebFounderInferenceController.ts");
const inferencePrompt = read("apps/web/src/components/WebFounderInferencePrompt.tsx");
const globalOverlayHost = read("apps/web/src/components/WebGlobalOverlayHost.tsx");
const globalOverlayPropsBuilder = read("apps/web/src/controllers/buildWebGlobalOverlayHostProps.ts");
const createController = read("shared/useCommunityCreateController.ts");
const createModal = read("apps/web/src/components/WebCreateCommunityModal.tsx");
const webApp = read("apps/web/src/App.tsx");
const legal = read("docs/legal/community-owner-inference-funding-v2.md");
const cognitionContract = read("docs/community-agent-cognition-contract-v1.md");
const billingContract = read("docs/product/reference/billing-entitlements.md");
const packageJson = read("package.json");

assert.match(packageJson, /"check:founder-inference-proof"/);
assert.match(shared, /EXISTING_FOUNDER_INFERENCE_COHORT_KEY = "existing_founder_cutover_v1"/);
assert.match(shared, /COMMUNITY_OWNER_FUNDED_MODEL_ID = "gpt-5\.6-luna"/);
assert.match(shared, /COMMUNITY_OWNER_INFERENCE_TERMS_VERSION = "community_owner_inference_funding_v2"/);
assert.match(
  shared,
  /COMMUNITY_INFERENCE_SURFACES = \[[\s\S]*"community_agent_mention"[\s\S]*"community_autonomous_cognition"[\s\S]*"community_setup_generation"/,
);
assert.match(founderPlan, /POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS = 7_900/);
assert.match(founderPlan, /POLYNET_FOUNDER_PLAN_INCLUDED_COST_MICROS = 20_000_000/);
assert.match(founderPlan, /POLYNET_FOUNDER_PLAN_INCLUDED_COMMUNITIES = 1/);
assert.match(modelCatalog, /DEFAULT_ACTIVE_MODEL_ID = "gpt-5\.6-sol"/);
const founderFundingSchema = schema.slice(
  schema.indexOf("founderSubscriptions: defineTable"),
  schema.indexOf("communityInferenceReceipts: defineTable"),
);
assert.match(founderFundingSchema, /founderSubscriptions: defineTable\(\{[\s\S]*communityId: v\.id\("communities"\)/);
assert.match(founderFundingSchema, /founderUsageCycles: defineTable\(\{[\s\S]*communityId: v\.id\("communities"\)/);
assert.doesNotMatch(founderFundingSchema, /communityId: v\.optional/);
assert.doesNotMatch(planCore, /communityId\?:/);

assert.match(
  schema,
  /founderInferenceGrants: defineTable\(\{[\s\S]*userId: v\.id\("users"\)[\s\S]*cohortKey: v\.string\(\)[\s\S]*v\.literal\("approved"\)[\s\S]*v\.literal\("active"\)[\s\S]*v\.literal\("suspended"\)[\s\S]*\.index\("by_user_cohort", \["userId", "cohortKey"\]\)/,
);
assert.match(
  schema,
  /inferenceFundingPolicy: v\.union\([\s\S]*legacy_byok_allowed[\s\S]*managed_required/,
);
assert.doesNotMatch(schema, /inferenceFundingPolicy: v\.optional/);
assert.doesNotMatch(
  core,
  /normalizeCommunityInferenceFundingPolicy|resolveCommunityInferenceFundingPolicy/,
);
assert.match(
  core,
  /community\.inferenceFundingPolicy !== COMMUNITY_FUNDING_POLICY_LEGACY_BYOK[\s\S]*founder_plan_required/,
);
assert.doesNotMatch(founderBilling, /setCommunityFundingPolicyInternal/);
assert.match(
  schema,
  /communityInferenceReceipts: defineTable\(\{[\s\S]*receiptKey: v\.string\(\)[\s\S]*actorUserId: v\.id\("users"\)[\s\S]*payerUserId: v\.id\("users"\)[\s\S]*fundingMode: v\.union[\s\S]*founderGrantId: v\.optional\(v\.id\("founderInferenceGrants"\)\)[\s\S]*founderSubscriptionId: v\.optional\(v\.id\("founderSubscriptions"\)\)[\s\S]*v\.literal\("authorized"\)[\s\S]*v\.literal\("settled"\)[\s\S]*v\.literal\("indeterminate"\)[\s\S]*\.index\("by_receipt_key", \["receiptKey"\]\)/,
);
const receiptSchema = schema.slice(
  schema.indexOf("communityInferenceReceipts: defineTable"),
  schema.indexOf("workspaceCreditBalances: defineTable"),
);
assert.match(
  receiptSchema,
  /surface: v\.union\([\s\S]*community_agent_mention[\s\S]*community_autonomous_cognition[\s\S]*community_setup_generation/,
);
assert.doesNotMatch(receiptSchema, /apiKey|encryptedSecret|prompt:|response:|toolOutput|costDollars/);

assert.doesNotMatch(migration, /initializeExistingFounderInferenceCohortInternal/);
assert.doesNotMatch(migration, /communityInferencePolicies/);
assert.doesNotMatch(migration, /EXPECTED_EXISTING_FOUNDER_COUNT|EXPECTED_LEGACY_POLICY_COUNT/);
assert.match(migration, /transitionExistingFounderToManagedInternal/);
assert.match(migration, /founder_transition_community_set_mismatch/);
assert.match(migration, /inferenceFundingPolicy: COMMUNITY_FUNDING_POLICY_MANAGED/);
assert.doesNotMatch(migration, /alreadyTransitioned[\s\S]{0,300}community\.visibility/);
assert.doesNotMatch(migration, /inferenceFundingPolicy: COMMUNITY_FUNDING_POLICY_MANAGED,[\s\S]{0,160}visibility:/);
assert.match(migration, /next_visibility: String\(community\.visibility\)/);
assert.match(migration, /await ctx\.db\.delete\(grant\._id\)/);
assert.doesNotMatch(migration, /legacyProgramGrants|sourcePartnerRecordId/);

assert.doesNotMatch(lifecycle, /requireExistingFounderCommunityCreationEligibility/);
assert.doesNotMatch(lifecycle, /community_founder_funding_required_to_publish|requireCommunityFounderFundingForPublish/);
assert.match(lifecycle, /requireCommunityPublishReadinessTransition\([\s\S]*nextVisibility: requestedVisibility/);
assert.match(lifecycle, /visibility: requestedVisibility/);
assert.doesNotMatch(lifecycle, /attachFounderSubscriptionToCommunity\(\{/);
assert.match(lifecycle, /inferenceFundingPolicy: COMMUNITY_FUNDING_POLICY_MANAGED/);
assert.doesNotMatch(core, /existingFounderInferenceCohortIsInitialized|legacy_requester_chatgpt/);
assert.doesNotMatch(core, /communityFounderFundingAllowsPublicAccess|requireCommunityFounderFundingForPublish/);
assert.doesNotMatch(communityPublic, /founderInference|FounderFunding|community_founder_funding|community_not_available/);
assert.match(core, /return \{ ok: false, code: "founder_plan_required" \}/);
assert.match(core, /grant\.status === "approved"[\s\S]*owner_funding_choice_required/);
assert.match(core, /grant\.status === "suspended"[\s\S]*owner_funding_suspended/);
assert.match(core, /mode: "owner_api_key"[\s\S]*payerUserId: community\.ownerId/);
assert.match(core, /mode: "platform_subscription"[\s\S]*subscriptionId: attachedSubscription\._id/);
assert.match(planCore, /reserveFounderUsage/);
assert.match(planCore, /nextReserved \+ cycle\.settledCostMicros > cycle\.includedCostMicros/);
assert.match(planCore, /founder_subscription_community_missing/);
assert.match(planCore, /founder_usage_cycle_community_mismatch/);
assert.match(core, /founder_usage_cycle_community_mismatch/);
assert.match(pricing, /founder_inference_pricing_misconfigured/);
assert.match(pricing, /Math\.ceil\(numerator \/ 1_000_000\)/);
assert.match(founderBilling, /startFounderSubscriptionCheckout = action/);
assert.match(founderBilling, /communityId: v\.id\("communities"\)/);
assert.match(founderBilling, /getFounderBillingOverview = query/);
assert.match(founderBilling, /startFounderBillingPortal = action/);
assert.match(founderBilling, /idempotencyKey: `founder-subscription-checkout:\$\{sessionId\}`/);
assert.match(founderBilling, /community_id: String\(args\.communityId\)/);
assert.match(founderBilling, /inferenceFundingPolicy: COMMUNITY_FUNDING_POLICY_MANAGED/);
assert.doesNotMatch(planCore, /attachFounderSubscriptionToCommunity/);
assert.doesNotMatch(communityCommerce, /resolveCommunityInferenceFundingAdmission|community_founder_funding_required/);
assert.match(communityCommerce, /POLYNET_COMMUNITY_PLATFORM_FEE_BPS/);
assert.doesNotMatch(communityCommerce, /POLYNET_(MANAGED|LEGACY_BYOK)_COMMUNITY_PLATFORM_FEE_BPS/);
assert.match(auth, /function accountTierMeta\(\)[\s\S]*platformFeeBps: POLYNET_COMMUNITY_PLATFORM_FEE_BPS/);
assert.match(auth, /CACHED_CLIENT_UNBOUNDED_COMMUNITY_LIMIT = Number\.MAX_SAFE_INTEGER/);
assert.doesNotMatch(auth, /POLYNET_FREE_MAX_COMMUNITIES|PLATFORM_OWNER_COMPLIMENTARY_MAX_COMMUNITIES|maxCommunities/);
assert.match(auth, /getCanonicalTierByUserIdInternal[\s\S]*return "free"/);
assert.doesNotMatch(auth, /if \(tier === "architect"\)/);
assert.match(founderBilling, /founder_stripe_price_contract_invalid/);
assert.match(founderBilling, /getMyAccountSetupStatus[\s\S]*profile_setup_required/);
assert.match(founderBilling, /syncFounderSubscriptionFromStripeInternal = internalMutation/);
assert.match(founderBilling, /syncFounderSubscriptionRiskStatusInternal = internalMutation/);
assert.match(founderBilling, /founder_subscription_customer_mismatch/);
assert.match(founderBilling, /founder_subscription_community_owner_mismatch/);
assert.match(founderBilling, /founder_subscription_price_changed/);
assert.doesNotMatch(
  founderBilling,
  /getCurrentFounderPlanStatus|getFounderSubscriptionByProviderSubscriptionIdInternal/,
);
assert.match(httpBilling, /syncFounderSubscriptionFromStripeSubscription/);
assert.match(httpBilling, /getFounderSubscriptionCheckoutSessionInternal/);
assert.match(httpBilling, /syncFounderSubscriptionRiskStatus[\s\S]*subscription_refunded/);
assert.match(httpBilling, /subscription_dispute_opened/);
assert.match(httpBilling, /event\.type === "invoice\.payment_failed"[\s\S]*forceStatus: "past_due"/);
assert.match(
  httpBilling,
  /event\.type === "customer\.subscription\.deleted"[\s\S]*forceStatus: "ended"/,
);
assert.match(envExample, /POLYNET_FOUNDER_STRIPE_PRICE_ID=/);
assert.match(envExample, /POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS=200000/);
assert.match(envExample, /POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS=1200000/);
assert.match(envExample, /POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS=1000000/);
assert.match(accountSetup, /founderSubscriptions[\s\S]*hasManagedInference/);
assert.match(accountSetup, /founderSubscriptionStatusGrantsAccess/);

assert.match(backend, /activateFounderInference = action/);
assert.match(backend, /acceptedTerms: v\.boolean\(\)/);
assert.match(backend, /acceptedTermsVersion: v\.string\(\)/);
assert.match(backend, /founder_inference_terms_acceptance_required/);
assert.match(backend, /prepareFounderInferenceActivationInternal = internalMutation/);
assert.match(
  backend,
  /const activation = \(await ctx\.runMutation\([\s\S]*prepareFounderInferenceActivationInternal[\s\S]*const probe = await runOpenAiNativeToolCompletion/,
);
assert.match(backend, /decryptStoredSecret\(connection\)/);
assert.match(backend, /runOpenAiNativeToolCompletion\(\{[\s\S]*modelId: COMMUNITY_OWNER_FUNDED_MODEL_ID[\s\S]*maxTokens: 16[\s\S]*apiKeyOverride: apiKey/);
assert.match(backend, /COMMUNITY_OWNER_INFERENCE_TERMS_VERSION/);
assert.match(backend, /claimCommunityInferenceReceiptInternal = internalMutation/);
assert.match(backend, /surface: communityInferenceSurfaceValidator/);
assert.match(backend, /surface: args\.surface/);
assert.match(backend, /providerStartedAt[\s\S]*status: "indeterminate"[\s\S]*ambiguous_provider_retry_blocked/);
assert.match(backend, /COMMUNITY_OWNER_INFERENCE_ACTOR_TURNS_PER_MINUTE/);
assert.match(backend, /COMMUNITY_OWNER_INFERENCE_COMMUNITY_TURNS_PER_MINUTE/);

assert.match(intake, /resolveCommunityInferenceFundingAdmission/);
assert.match(intake, /owner_funding_choice_required[\s\S]*activate an OpenAI API key or fund this community at \$79\/month/);
assert.doesNotMatch(intake + worker + core, /legacy_requester_chatgpt|requesterHasChatgptConnection/);
assert.match(worker, /const directOpenAiFunded =[\s\S]*context\.funding\.mode === "platform_subscription"/);
assert.match(worker, /runOpenAiNativeToolCompletion\(\{[\s\S]*modelId: COMMUNITY_OWNER_FUNDED_MODEL_ID[\s\S]*context\.funding\.mode === "owner_api_key" \? ownerApiKey : undefined/);
assert.match(worker, /aggregatePromptTokens \+=/);
assert.match(worker, /claimCommunityInferenceReceiptInternal/);
assert.match(worker, /surface: "community_agent_mention"/);
assert.match(worker, /markCommunityInferenceProviderStartedInternal/);
assert.match(
  worker,
  /executeRetrievalHarnessTool\(\{[\s\S]*userId: normalizeIdValue\(args\.context\.request\.sponsorUserId\)[\s\S]*authSubject: normalizeIdValue\(args\.context\.request\.authSubject\)/,
);
assert.doesNotMatch(worker, /executeRetrievalHarnessTool\(\{[\s\S]{0,300}userId: normalizeIdValue\(context\.funding\.payerUserId\)/);

assert.match(fundingRuntime, /resolveCommunityInferenceFundingAdmissionInternal/);
assert.match(fundingRuntime, /beginCommunityInferenceFundingSession/);
assert.match(fundingRuntime, /surface: args\.surface/);
assert.match(fundingRuntime, /COMMUNITY_OWNER_FUNDED_MODEL_ID/);
assert.match(fundingRuntime, /markCommunityInferenceProviderStartedInternal/);
assert.match(fundingRuntime, /settleCommunityInferenceReceiptInternal/);
assert.match(autonomousRuntime, /resolveCommunityInferenceFundingForAction\(ctx, args\.communityId\)/);
assert.match(autonomousRuntime, /surface: "community_autonomous_cognition"/);
assert.match(autonomousRuntime, /receiptKey: `community_autonomous_cognition:\$\{runId\}`/);
assert.match(autonomousRuntime, /modelId: fundingSession\.modelId/);
assert.match(autonomousRuntime, /apiKeyOverride: fundingSession\.apiKeyOverride/);
assert.match(autonomousRuntime, /settleCommunityInferenceFundingSession/);
assert.match(wikiArchitect, /surface: "community_setup_generation"/g);
assert.match(wikiArchitect, /receiptKey: `community_setup_generation:wiki_architect:\$\{requestId\}`/);
assert.match(wikiArchitect, /receiptKey: `community_setup_generation:resource_writer:\$\{requestId\}`/);
assert.match(wikiArchitect, /modelIdOverride: fundingSession\.modelId/g);
assert.match(wikiArchitect, /apiKeyOverride: fundingSession\.apiKeyOverride/g);
assert.match(communityAdminGateway, /runCommunityWikiArchitectProposal[\s\S]*requestId: crypto\.randomUUID\(\)/);
assert.match(communityAdminGateway, /draftCommunityResourceContentFromSources[\s\S]*requestId: crypto\.randomUUID\(\)/);

assert.match(settings, /Community inference funding/);
assert.match(settings, /eligible legacy communities listed here/);
assert.match(settings, /Activate for eligible communities/);
assert.doesNotMatch(settings, /GPT 5\.6|\bLuna\b/i);
assert.match(billingSettings, /Community funding/);
assert.match(billingSettings, /Polynet-hosted inference/);
assert.doesNotMatch(billingSettings, /GPT 5\.6|\bLuna\b|\$20/i);
assert.doesNotMatch(billingSettings, /Personal tools|Premium|tool balance|Add credits/i);
assert.doesNotMatch(billingSettings, /label: "Communities"/);
assert.match(billingGateway, /founderBilling:getFounderBillingOverview/);
assert.match(billingGateway, /founderBilling:startFounderSubscriptionCheckout/);
assert.match(billingGateway, /founderBilling:startFounderBillingPortal/);
assert.doesNotMatch(
  billingGateway,
  /model_id|included_cost_micros|(?:reserved|settled|remaining)_cost_micros/,
);
assert.match(billingController, /founder_community/);
assert.match(billingController, /scrubCurrentRouteSearchParams/);
assert.match(billingController, /fundingAttentionCommunities/);
assert.match(billingController, /startCheckoutAfterCommunityCreated[\s\S]*await refresh\(\);[\s\S]*await startCheckout\(communityId\)/);
assert.equal(existsSync(join(root, "apps/web/src/components/WebFounderFundingPrompt.tsx")), false);
assert.doesNotMatch(billingController, /isFundingPromptDismissed|dismissFundingPrompt/);
assert.match(inferencePrompt, /Connect your OpenAI API key/);
assert.match(inferencePrompt, /Your key powers AI for your existing communities/);
assert.match(inferencePrompt, /Activate community AI/);
assert.match(inferencePrompt, /Connect API key/);
assert.match(inferencePrompt, /Not now/);
assert.doesNotMatch(inferencePrompt, /\$79/);
assert.match(inferenceController, /isActivationPromptDismissed/);
assert.match(inferenceController, /dismissActivationPrompt/);
assert.doesNotMatch(inferenceController, /GPT 5\.6|\bLuna\b|model_id/i);
assert.match(globalOverlayHost, /WebFounderInferencePrompt/);
assert.doesNotMatch(globalOverlayHost, /WebFounderFundingPrompt|founderFundingPromptProps/);
assert.match(
  globalOverlayPropsBuilder,
  /fundingAttentionCommunities\.length === 0[\s\S]*status\.status === "approved"/,
);
assert.match(webApp, /shouldOpenFounderInferencePrompt\(\{ session, founderInference, founderBilling \}\)/);
assert.match(webApp, /founderInference\.dismissActivationPrompt\(\);[\s\S]*openGlobalSettings\("account"\)/);
const activationPromptReady = {
  session: { user: { id: "founder" } },
  founderInference: {
    isLoading: false,
    isActivationPromptDismissed: false,
    status: { eligible: true, status: "approved", communities: [{ id: "legacy" }] },
  },
  founderBilling: {
    isLoading: false,
    overview: { communities: [{ id: "legacy" }] },
    fundingAttentionCommunities: [],
  },
};
assert.equal(shouldOpenFounderInferencePrompt(activationPromptReady), true);
assert.equal(shouldOpenFounderInferencePrompt({
  ...activationPromptReady,
  founderBilling: { ...activationPromptReady.founderBilling, fundingAttentionCommunities: [{}] },
}), false);
assert.equal(shouldOpenFounderInferencePrompt({
  ...activationPromptReady,
  founderInference: {
    ...activationPromptReady.founderInference,
    status: { ...activationPromptReady.founderInference.status, status: "active" },
  },
}), false);
assert.equal(shouldOpenFounderInferencePrompt({
  ...activationPromptReady,
  founderInference: { ...activationPromptReady.founderInference, isActivationPromptDismissed: true },
}), false);
assert.equal(shouldOpenFounderInferencePrompt({
  ...activationPromptReady,
  founderBilling: { ...activationPromptReady.founderBilling, overview: { communities: [] } },
}), false);
assert.match(createController, /visibility: "unlisted"/);
assert.doesNotMatch(createModal, /option value="published"/);
assert.match(createModal, /Create and continue to payment/);
assert.match(webApp, /founderBilling\.startCheckoutAfterCommunityCreated\(community\.id\)/);
assert.match(legal, /does not transfer the founder's administrative permissions to a member/);
assert.match(legal, /Receipts do not contain the API key, prompts, responses, or tool output/);
assert.match(
  cognitionContract,
  /Direct Concierge chat, autonomous cognition, and AI-assisted setup generation are community-founder-funded/,
);
assert.match(billingContract, /\$79 USD monthly for Builder on each managed community/);
assert.match(billingContract, /Community visibility, public access, and member commerce remain independent from Builder funding/);
assert.match(billingContract, /exactly three funding lanes/);
assert.match(billingContract, /frozen legacy-eligible community/);
assert.match(billingContract, /Every other community, including every newly created community, uses Builder/);
assert.match(billingContract, /only AI execution fails closed/);
assert.match(billingContract, /Each \$79 monthly cycle includes up to \$20 in raw GPT 5\.6 Luna model cost/);
assert.match(billingContract, /Stripe webhook state, not the redirect, is authoritative/);
assert.match(billingContract, /2\.9% application fee/);
assert.match(billingContract, /transitional requester-ChatGPT lane is retired/);
assert.doesNotMatch(
  cognitionContract,
  /member_concierge`[\s\S]{0,300}requester-funded through the requester's provider connection/,
);
assert.doesNotMatch(cognitionContract, /Chat is asker-funded/);

console.log("founder_inference_contract_proof: ok");
