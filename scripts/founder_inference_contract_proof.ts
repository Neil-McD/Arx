import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
const lifecycle = read("convex/communityLifecycle.ts");
const communityPublic = read("convex/communityPublic.ts");
const intake = read("convex/communityAgentConciergeCore.ts");
const worker = read("convex/communityAgentServeWorker.ts");
const autonomousRuntime = read("convex/communityAgentRuntime.ts");
const memberRuntime = read("convex/runtimeAgentLoop.ts");
const memberTurnHandlers = read("convex/runtimeTurnHandlers.ts");
const wikiArchitect = read("convex/communityWikiArchitect.ts");
const fundedGateway = read("convex/fundedInferenceGateway.ts");
const usageCollector = read("convex/founderInferenceUsage.ts");
const communityAdminGateway = read("shared/cloudCommunityAdminGateway.ts");
const modelCatalog = read("shared/modelCatalog.ts");
const settings = read("apps/web/src/components/WebAccountSettingsSection.tsx");
const billingSettings = read("apps/web/src/components/WebBillingSettingsSection.tsx");
const billingGateway = read("shared/cloudFounderBillingGateway.ts");
const billingController = read("apps/web/src/controllers/useWebFounderBillingController.ts");
const globalOverlayHost = read("apps/web/src/components/WebGlobalOverlayHost.tsx");
const globalOverlayPropsBuilder = read("apps/web/src/controllers/buildWebGlobalOverlayHostProps.ts");
const createController = read("shared/useCommunityCreateController.ts");
const createModal = read("apps/web/src/components/WebCreateCommunityModal.tsx");
const webApp = read("apps/web/src/App.tsx");
const historicalLegal = read("docs/legal/community-owner-inference-funding-v2.md");
const activeLegal = read("docs/legal/terms-of-service-v3.md");
const cognitionContract = read("docs/community-agent-cognition-contract-v1.md");
const billingContract = read("docs/product/reference/billing-entitlements.md");
const packageJson = read("package.json");
const admissionResolver = core.slice(
  core.indexOf("export async function resolveCommunityInferenceFundingAdmission"),
  core.indexOf("export type AdditionalManagedCommunityAdmission"),
);
const receiptExpiration = backend.slice(
  backend.indexOf("export const expireCommunityInferenceReceiptInternal"),
  backend.indexOf("export const settleCommunityInferenceReceiptInternal"),
);
const expiredReceiptFinalizer = backend.slice(
  backend.indexOf("async function finalizeExpiredAuthorizedFounderInferenceReceipt"),
  backend.indexOf("const FOUNDER_INFERENCE_BYOK_RETIRED"),
);
const knownNoSpendFinalizer = core.slice(
  core.indexOf("export async function finalizeKnownNoSpendFounderInferenceReceipt"),
);
const failureFinalizer = backend.slice(
  backend.indexOf("export const finalizeCommunityInferenceFailureInternal"),
);
const providerStart = backend.slice(
  backend.indexOf("export const markCommunityInferenceProviderStartedInternal"),
  backend.indexOf("export const finalizeCommunityInferenceFailureInternal"),
);

assert.match(packageJson, /"check:founder-inference-proof"/);
assert.match(shared, /COMMUNITY_OWNER_FUNDED_MODEL_ID = "gpt-6-luna"/);
assert.doesNotMatch(shared, /LEGACY_BYOK|OWNER_INFERENCE_TERMS|FounderInferenceGrantStatus/);
assert.match(
  shared,
  /COMMUNITY_INFERENCE_SURFACES = \[[\s\S]*"member_agent_dock"[\s\S]*"community_funnel_builder"[\s\S]*"community_agent_mention"[\s\S]*"community_autonomous_cognition"[\s\S]*"community_workflow_action"[\s\S]*"community_setup_generation"/,
);
assert.match(founderPlan, /POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS = 7_900/);
assert.match(founderPlan, /POLYNET_FOUNDER_PLAN_INCLUDED_COST_MICROS = 20_000_000/);
assert.match(founderPlan, /POLYNET_FOUNDER_PLAN_INCLUDED_COMMUNITIES = 1/);
assert.match(modelCatalog, /DEFAULT_ACTIVE_MODEL_ID = "gpt-5\.6-sol"/);
const founderFundingSchema = schema.slice(
  schema.indexOf("founderSubscriptions: defineTable"),
  schema.indexOf("communityInferenceReceipts: defineTable"),
);
assert.match(founderFundingSchema, /founderSubscriptions: defineTable\(\{[\s\S]*communityId: v\.optional\(v\.id\("communities"\)\)/);
assert.match(founderFundingSchema, /founderUsageCycles: defineTable\(\{[\s\S]*communityId: v\.id\("communities"\)/);
assert.match(planCore, /communityId\?:/);

assert.doesNotMatch(schema, /founderInferenceGrants: defineTable/);
assert.match(schema, /inferenceFundingPolicy: v\.literal\("managed_required"\)/);
assert.doesNotMatch(schema, /inferenceFundingPolicy: v\.optional/);
assert.doesNotMatch(
  core,
  /normalizeCommunityInferenceFundingPolicy|resolveCommunityInferenceFundingPolicy/,
);
assert.match(admissionResolver, /return \{ ok: false, code: "founder_plan_required" \}/);
assert.doesNotMatch(admissionResolver, /userProviderConnections|founderInferenceGrants|owner_api_key/);
assert.doesNotMatch(founderBilling, /setCommunityFundingPolicyInternal/);
const receiptSchema = schema.slice(
  schema.indexOf("communityInferenceReceipts: defineTable"),
  schema.indexOf("workspaceCreditBalances: defineTable"),
);
assert.match(receiptSchema, /fundingMode: v\.union\([\s\S]*platform_subscription[\s\S]*platform_operator_grant/);
assert.match(receiptSchema, /founderSubscriptionId: v\.optional\(v\.id\("founderSubscriptions"\)\)/);
assert.match(receiptSchema, /v\.literal\("authorized"\)[\s\S]*v\.literal\("settled"\)[\s\S]*v\.literal\("indeterminate"\)/);
assert.match(receiptSchema, /\.index\("by_receipt_key", \["receiptKey"\]\)/);
assert.doesNotMatch(receiptSchema, /owner_api_key|founderGrantId|founderInferenceGrants/);
assert.match(
  receiptSchema,
  /surface: v\.union\([\s\S]*member_agent_dock[\s\S]*community_funnel_builder[\s\S]*community_agent_mention[\s\S]*community_autonomous_cognition[\s\S]*community_workflow_action[\s\S]*community_setup_generation/,
);
assert.match(
  backend,
  /const communityInferenceSurfaceValidator = v\.union\([\s\S]*member_agent_dock[\s\S]*community_funnel_builder[\s\S]*community_agent_mention[\s\S]*community_autonomous_cognition[\s\S]*community_workflow_action[\s\S]*community_setup_generation/,
);
assert.doesNotMatch(receiptSchema, /apiKey|encryptedSecret|prompt:|response:|toolOutput|costDollars/);

assert.equal(existsSync(join(root, "convex/founderInferenceMigration.ts")), false);
assert.doesNotMatch(
  schema + core + backend,
  /founderInferenceGrants|founderGrantId|owner_api_key|legacy_byok_allowed/,
);

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
assert.doesNotMatch(shared, /mode: "owner_api_key"/);
assert.doesNotMatch(admissionResolver, /owner_funding_choice_required|owner_funding_suspended|owner_credential_missing/);
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
assert.doesNotMatch(accountSetup, /founderSubscriptions[\s\S]*hasManagedInference/);
assert.doesNotMatch(accountSetup, /founderSubscriptionStatusGrantsAccess/);

assert.doesNotMatch(
  backend,
  /export const (?:prepareFounderInferenceActivationInternal|completeFounderInferenceActivationInternal)\b/,
);
assert.doesNotMatch(
  backend,
  /getCurrentFounderInferenceStatus|activateFounderInference|suspendFounderInference|founder_inference_byok_retired/,
  "retired founder BYOK compatibility functions must stay deleted",
);
assert.doesNotMatch(backend, /decryptStoredSecret|apiKeyOverride|userProviderConnections/);
assert.match(backend, /claimCommunityInferenceReceiptInternal = internalMutation/);
assert.match(backend, /surface: communityInferenceSurfaceValidator/);
assert.match(backend, /surface: args\.surface/);
assert.match(
  core,
  /getUniqueFounderInferenceReceiptByKey[\s\S]*\.take\(2\)[\s\S]*founder_inference_receipt_ambiguous/,
);
assert.doesNotMatch(
  core,
  /query\("communityInferenceReceipts"[\s\S]{0,240}\.first\(\)/,
);
assert.match(
  core,
  /founderInferenceReceiptIdentityMatches[\s\S]*sourceRunId[\s\S]*communityId[\s\S]*actorUserId[\s\S]*payerUserId[\s\S]*fundingMode[\s\S]*founderSubscriptionId[\s\S]*surface/,
);
assert.match(backend, /founderInferenceReceiptIdentityMatches\(existing/);
assert.match(backend, /founder_inference_receipt_conflict/);
assert.match(backend, /founder_inference_receipt_key_invalid/);
assert.match(backend, /founder_inference_source_run_invalid/);
assert.match(backend, /founder_inference_claim_token_invalid/);
assert.match(backend, /scheduleFounderInferenceReceiptExpiration/);
assert.match(
  backend,
  /ctx\.scheduler\.runAfter\([\s\S]*expireCommunityInferenceReceiptInternal[\s\S]*expectedClaimToken/,
);
assert.match(backend, /claimToken,[\s\S]*scheduleFounderInferenceReceiptExpiration/);
assert.match(receiptExpiration, /const nowMs = Date\.now\(\)/);
assert.doesNotMatch(receiptExpiration, /nowMs: v\.(?:optional\()?number/);
assert.match(receiptExpiration, /receipt\.claimToken !== expectedClaimToken/);
assert.doesNotMatch(receiptExpiration, /status: "provider_started"/);
assert.match(
  receiptExpiration,
  /receipt\.leaseExpiresAt > nowMs[\s\S]*scheduleFounderInferenceReceiptExpiration[\s\S]*finalizeExpiredAuthorizedFounderInferenceReceipt/,
);
assert.match(
  expiredReceiptFinalizer,
  /receipt\.providerStartedAt !== undefined[\s\S]*settleAuthorizedFounderInferenceReceipt\([\s\S]*usageComplete: false[\s\S]*outcomeCode: "provider_execution_deadline_exceeded"[\s\S]*failureCode: "provider_execution_deadline_exceeded"[\s\S]*status: "indeterminate"/,
);
assert.match(
  expiredReceiptFinalizer,
  /finalizeKnownNoSpendFounderInferenceReceipt\([\s\S]*authorization_expired_before_provider/,
);
assert.doesNotMatch(
  receiptExpiration,
  /releaseFounderUsageReservation|settleFounderUsageReservation|settleAuthorizedFounderInferenceReceipt|finalizeKnownNoSpendFounderInferenceReceipt|ctx\.db\.patch/,
);
assert.doesNotMatch(backend, /releaseFounderUsageReservation/);
assert.equal(
  (backend.match(/finalizeKnownNoSpendFounderInferenceReceipt\(/g) ?? []).length,
  3,
);
assert.match(
  providerStart,
  /receipt\.leaseExpiresAt <= args\.nowMs[\s\S]*finalizeExpiredAuthorizedFounderInferenceReceipt\([\s\S]*receipt\.providerStartedAt !== undefined[\s\S]*return \{ ok: true \}[\s\S]*resolveCommunityInferenceFundingAdmission/,
);
assert.equal(
  (providerStart.match(/providerStartedAt: args\.nowMs/g) ?? []).length,
  1,
);
assert.match(
  knownNoSpendFinalizer,
  /receipt\.status !== "authorized"[\s\S]*receipt\.claimToken !== args\.claimToken/,
);
assert.match(
  knownNoSpendFinalizer,
  /requireFounderInferenceSettlementCycle\([\s\S]*Number\.isSafeInteger\(reservedCostMicros\)[\s\S]*reservedCostMicros <= 0[\s\S]*founder_usage_receipt_authority_missing/,
);
assert.match(
  knownNoSpendFinalizer,
  /settleFounderUsageReservation\([\s\S]*reservedCostMicros,[\s\S]*settledCostMicros: 0/,
);
assert.match(
  knownNoSpendFinalizer,
  /status: "failed"[\s\S]*failureCode,[\s\S]*failedAt: args\.nowMs/,
);
assert.match(
  failureFinalizer,
  /args\.usageComplete === false[\s\S]*args\.disposition === "indeterminate" && promptTokens === 0 && completionTokens === 0[\s\S]*settleAuthorizedFounderInferenceReceipt\([\s\S]*usageComplete: false[\s\S]*failureCode: "provider_token_usage_missing"/,
);
assert.match(
  backend,
  /providerStartedAt[\s\S]*settleAuthorizedFounderInferenceReceipt\(\{[\s\S]*usageComplete: false[\s\S]*failureCode: "ambiguous_provider_retry_blocked"/,
);
assert.match(backend, /COMMUNITY_OWNER_INFERENCE_ACTOR_TURNS_PER_MINUTE/);
assert.match(backend, /COMMUNITY_OWNER_INFERENCE_COMMUNITY_TURNS_PER_MINUTE/);
assert.match(planCore, /settledCostMicros > reservedCostMicros[\s\S]*founder_usage_settlement_exceeds_reservation/);
assert.match(planCore, /founder_usage_cycle_ledger_invalid/);
assert.match(
  core,
  /usageComplete === false[\s\S]*settledCostMicros = Number\(receipt\.reservedCostMicros\)[\s\S]*settleFounderUsageReservation/,
);

assert.match(intake, /resolveCommunityInferenceFundingAdmission/);
assert.doesNotMatch(intake, /connect an OpenAI API key|activate an OpenAI API key/);
assert.doesNotMatch(intake + worker + admissionResolver, /legacy_requester_chatgpt|requesterHasChatgptConnection|owner_api_key/);
assert.match(worker, /const isWorkflowAction = context\.request\.triggerKind === "workflow"/);
assert.match(worker, /const receiptKey = isWorkflowAction[\s\S]*communityWorkflowActionReceiptKey\(requestId\)[\s\S]*communityAgentMentionReceiptKey\(requestId\)/);
assert.match(worker, /runOpenAiNativeToolCompletion\(\{[\s\S]*modelId: fundingSession\.modelId/);
assert.doesNotMatch(worker, /userProviderConnections|getOpenAiConnectionForUserInternal|decryptStoredSecret|runChatgptNativeToolCompletion|apiKeyOverride/);
assert.match(worker, /observeFounderProviderResult\(usage, toolCompletion/);
assert.match(usageCollector, /recordFounderProviderSuccess\(totals, result\)/);
assert.doesNotMatch(worker, /claimCommunityInferenceReceiptInternal|markCommunityInferenceProviderStartedInternal|finalizeCommunityInferenceFailureInternal/);
assert.match(worker, /claimCommunityInferenceFundingSession/);
assert.match(worker, /surface: isWorkflowAction[\s\S]*"community_workflow_action"[\s\S]*"community_agent_mention"/);
assert.match(
  worker,
  /runCompletion: async[\s\S]*if \(!providerStarted\)[\s\S]*markCommunityInferenceFundingSessionProviderStarted\([\s\S]*providerStarted = true[\s\S]*runOpenAiNativeToolCompletion/,
);
assert.match(
  worker,
  /if \(providerStarted && !founderInferenceBudgetFailureCode\(error\)\) usage\.complete = false[\s\S]*observeFounderProviderResult\(usage, toolCompletion,[\s\S]*providerFailureIsKnownPreSpend\(toolCompletion\.code\)/,
);
assert.match(
  worker,
  /executeRetrievalHarnessTool\(\{[\s\S]*userId: normalizeIdValue\(args\.context\.request\.sponsorUserId\)[\s\S]*authSubject: normalizeIdValue\(args\.context\.request\.authSubject\)/,
);
assert.doesNotMatch(worker, /executeRetrievalHarnessTool\(\{[\s\S]{0,300}userId: normalizeIdValue\(context\.funding\.payerUserId\)/);

assert.match(fundingRuntime, /resolveCommunityInferenceFundingAdmissionInternal/);
assert.doesNotMatch(fundingRuntime, /beginCommunityInferenceFundingSession/);
assert.match(fundingRuntime, /surface: args\.surface/);
assert.match(fundingRuntime, /modelId: claim\.modelId/);
assert.doesNotMatch(fundingRuntime, /modelId: COMMUNITY_OWNER_FUNDED_MODEL_ID/);
assert.match(fundingRuntime, /markCommunityInferenceProviderStartedInternal/);
assert.match(fundingRuntime, /settleCommunityInferenceReceiptInternal/);
assert.doesNotMatch(fundingRuntime, /owner_api_key|userProviderConnections|getOpenAiConnectionForUserInternal|decryptStoredSecret|apiKeyOverride/);
assert.doesNotMatch(memberTurnHandlers, /beginMemberAgentFundingSession/);
assert.doesNotMatch(memberTurnHandlers, /claimMemberAgentFundingSession/);
assert.match(memberTurnHandlers, /claimCommunityFundingSession/);
assert.match(
  memberTurnHandlers,
  /invocationSurface === "member_agent_dock" \? invocationSurface : null[\s\S]*surface: communityInferenceSurface[\s\S]*receiptKey: `\$\{communityInferenceSurface\}:\$\{runId\}`/,
);
assert.match(
  memberTurnHandlers,
  /beforeProviderRequest: async[\s\S]*markCommunityFundingProviderStarted[\s\S]*observeProviderResult: observeCommunityFundingProviderResult/,
);
assert.match(
  memberRuntime,
  /operation: async \(signal\) => \{[\s\S]*beforeProviderRequest\?\.\(\)[\s\S]*runProviderNativeToolCompletion/,
);
assert.match(
  memberRuntime,
  /class RuntimeProviderLifecycleHookError[\s\S]*throw new RuntimeProviderLifecycleHookError\(error\)[\s\S]*throw error\.originalError/,
  "pre-provider funding failures must reach the existing turn-level funding mapper unchanged",
);
assert.match(
  memberTurnHandlers,
  /function resolveCommunityFundingClaimFailure\([\s\S]*rawCode === "founder_usage_exhausted"[\s\S]*code: "community_ai_usage_exhausted"/,
  "Member and Funnel must retain their specific pre-provider funding error mapping",
);
assert.match(
  memberRuntime,
  /recordInitialProviderContextAttestation\(attestation\)[\s\S]*runNativeRuntimeKernel/,
  "Member and Funnel evidence must persist before the provider/tool kernel starts",
);
assert.match(
  memberTurnHandlers,
  /communityFundingProviderStarted[\s\S]*usageComplete: communityFundingProviderStarted[\s\S]*disposition: communityFundingProviderStarted \? "indeterminate" : "failed"/,
  "pre-provider attestation failures must finalize claimed funding as failed, not indeterminate",
);
assert.match(
  memberTurnHandlers,
  /observeFounderProviderResult\(communityFundingUsage, result,[\s\S]*settleCommunityInferenceFundingSession\([\s\S]*promptTokens: communityFundingUsage\.promptTokens[\s\S]*completionTokens: communityFundingUsage\.completionTokens/,
);
assert.match(
  autonomousRuntime,
  /resolveCommunityInferenceFundingForAction\([\s\S]*ctx,[\s\S]*args\.communityId[\s\S]*\)/,
);
assert.match(autonomousRuntime, /surface: "community_autonomous_cognition"/);
assert.match(autonomousRuntime, /receiptKey: `community_autonomous_cognition:\$\{runId\}`/);
assert.doesNotMatch(autonomousRuntime, /beginCommunityInferenceFundingSession/);
assert.match(autonomousRuntime, /resolveCommunityInferenceModelForReceipt[\s\S]*startFundedInferenceRun\([\s\S]*fundingState\.run\.modelId !== modelId/);
assert.match(
  autonomousRuntime,
  /runCompletion: async[\s\S]*fundingState\.run\.request\([\s\S]*fundingState\.run\.usage\(\)\.complete/,
);
assert.match(
  autonomousRuntime,
  /fundingClaimAttempted = true[\s\S]*preProviderFundingErrorCode[\s\S]*errorCode: runtimeErrorCode/,
  "Steward must retain a failed pre-provider funding claim's original bounded code",
);
assert.match(
  autonomousRuntime,
  /fundingState\.run\.usage\(\)[\s\S]*fundingState\.run\.settle\("provider_completed"\)[\s\S]*fundingState\.run\.fail\(runtimeErrorCode\)/,
);
assert.match(autonomousRuntime, /modelRef: `openai\/\$\{modelId\}`/);
assert.doesNotMatch(autonomousRuntime, /runChatgptNativeToolCompletion|runOpenAiNativeToolCompletion|claimCommunityInferenceFundingSession|fundingSession\.apiKeyOverride/);
assert.match(wikiArchitect, /surface: "community_setup_generation"/g);
assert.match(wikiArchitect, /receiptKey: `community_setup_generation:wiki_architect:\$\{requestId\}`/);
assert.match(wikiArchitect, /receiptKey: `community_setup_generation:resource_writer:\$\{requestId\}`/);
assert.equal((wikiArchitect.match(/startFundedInferenceRun\(/g) ?? []).length, 2);
assert.match(fundedGateway, /claimCommunityInferenceFundingSession/);
assert.match(fundedGateway, /markCommunityInferenceFundingSessionProviderStarted/);
assert.match(fundedGateway, /modelId: session\.modelId/);
assert.match(fundedGateway, /settleCommunityInferenceFundingSession/);
assert.doesNotMatch(wikiArchitect, /fundingSession\.apiKeyOverride/);
assert.doesNotMatch(communityAdminGateway, /runCommunityWikiArchitectProposal/);
assert.doesNotMatch(communityAdminGateway, /draftCommunityResourceContentFromSources/);

assert.doesNotMatch(settings, /Legacy API funding|legacy-eligible|Activate for eligible|Personal AI connection|API key/i);
assert.doesNotMatch(settings, /GPT 5\.6|\bLuna\b/i);
assert.match(billingSettings, /Builder/);
assert.match(billingSettings, /Polynet-hosted community AI/);
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
assert.doesNotMatch(billingController, /startCheckoutAfterCommunityCreated/);
assert.equal(existsSync(join(root, "apps/web/src/components/WebFounderFundingPrompt.tsx")), false);
assert.doesNotMatch(billingController, /isFundingPromptDismissed|dismissFundingPrompt/);
assert.equal(existsSync(join(root, "apps/web/src/components/WebFounderInferencePrompt.tsx")), false);
assert.equal(existsSync(join(root, "apps/web/src/controllers/useWebFounderInferenceController.ts")), false);
assert.equal(existsSync(join(root, "shared/cloudFounderInferenceGateway.ts")), false);
assert.doesNotMatch(globalOverlayHost, /FounderInference|founderInference/);
assert.doesNotMatch(globalOverlayPropsBuilder, /FounderInference|founderInference/);
assert.doesNotMatch(webApp, /FounderInference|founderInference/);
assert.match(createController, /visibility: "unlisted"/);
assert.doesNotMatch(createModal, /option value="published"/);
assert.match(createModal, /Create community/);
assert.doesNotMatch(webApp, /startCheckoutAfterCommunityCreated/);
assert.match(historicalLegal, /status: superseded/);
assert.match(historicalLegal, /superseded_by: terms_of_service_v3/);
assert.match(historicalLegal, /Historical acceptance evidence only/);
assert.match(activeLegal, /status: active/);
assert.match(activeLegal, /Builder for \$79 USD per month for each attached community/);
assert.match(activeLegal, /Polynet-hosted AI for a grandfathered community still requires one current Builder subscription/);
assert.match(
  cognitionContract,
  /The member agent under an authorized community lens, direct Concierge chat,[\s\S]*autonomous cognition, and AI-assisted setup generation are[\s\S]*community-founder-funded/,
);
assert.match(billingContract, /\$79 USD monthly for Builder on each managed community/);
assert.match(billingContract, /Visibility, membership, roles, paid-member commerce, Builder payment, AI allowance, and lifecycle remain separate canonical facts/);
assert.match(billingContract, /Existing grandfathered communities retain ordinary platform operation without Builder/);
assert.match(billingContract, /Newly created non-operator communities are subscription-required/);
assert.match(billingContract, /Grandfathering grants platform operation, not hosted AI/);
assert.match(billingContract, /Funding suspension does not mutate or delete the community/);
assert.match(billingContract, /Each `\$79` monthly cycle includes up to `\$20` in combined raw provider cost for hosted AI inference and paid web research or crawl tools/);
assert.match(billingContract, /Redirects are UX only; verified provider\/webhook state is authoritative/);
assert.match(billingContract, /2\.9% application fee/);
assert.match(billingContract, /Community BYOK and requester ChatGPT are retired as authority/);
assert.doesNotMatch(
  cognitionContract,
  /member_concierge`[\s\S]{0,300}requester-funded through the requester's provider connection/,
);
assert.doesNotMatch(cognitionContract, /Chat is asker-funded/);

console.log("founder_inference_contract_proof: ok");
