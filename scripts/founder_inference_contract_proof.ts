import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const schema = read("convex/schema.ts");
const shared = read("shared/founderInference.ts");
const core = read("convex/founderInferenceCore.ts");
const backend = read("convex/founderInference.ts");
const migration = read("convex/founderInferenceMigration.ts");
const lifecycle = read("convex/communityLifecycle.ts");
const intake = read("convex/communityAgentConciergeCore.ts");
const worker = read("convex/communityAgentServeWorker.ts");
const modelCatalog = read("shared/modelCatalog.ts");
const settings = read("apps/web/src/components/WebAccountSettingsSection.tsx");
const legal = read("docs/legal/community-owner-inference-funding-v1.md");
const cognitionContract = read("docs/community-agent-cognition-contract-v1.md");
const packageJson = read("package.json");

assert.match(packageJson, /"check:founder-inference-proof"/);
assert.match(shared, /EXISTING_FOUNDER_INFERENCE_COHORT_KEY = "existing_founder_cutover_v1"/);
assert.match(shared, /COMMUNITY_OWNER_FUNDED_MODEL_ID = "gpt-5\.6-luna"/);
assert.match(modelCatalog, /DEFAULT_ACTIVE_MODEL_ID = "gpt-5\.6-sol"/);

assert.match(
  schema,
  /founderInferenceGrants: defineTable\(\{[\s\S]*userId: v\.id\("users"\)[\s\S]*cohortKey: v\.string\(\)[\s\S]*v\.literal\("approved"\)[\s\S]*v\.literal\("active"\)[\s\S]*v\.literal\("suspended"\)[\s\S]*\.index\("by_user_cohort", \["userId", "cohortKey"\]\)/,
);
assert.match(
  schema,
  /communityInferenceReceipts: defineTable\(\{[\s\S]*receiptKey: v\.string\(\)[\s\S]*actorUserId: v\.id\("users"\)[\s\S]*payerUserId: v\.id\("users"\)[\s\S]*founderGrantId: v\.id\("founderInferenceGrants"\)[\s\S]*v\.literal\("authorized"\)[\s\S]*v\.literal\("settled"\)[\s\S]*v\.literal\("indeterminate"\)[\s\S]*\.index\("by_receipt_key", \["receiptKey"\]\)/,
);
const receiptSchema = schema.slice(
  schema.indexOf("communityInferenceReceipts: defineTable"),
  schema.indexOf("workspaceCreditBalances: defineTable"),
);
assert.doesNotMatch(receiptSchema, /apiKey|encryptedSecret|prompt:|response:|toolOutput|costDollars/);

assert.match(migration, /EXPECTED_EXISTING_FOUNDER_COUNT = 9/);
assert.match(migration, /EXPECTED_LEGACY_POLICY_COUNT = 8/);
assert.match(migration, /ownerUserIds: v\.array\(v\.id\("users"\)\)/);
assert.match(migration, /existing_founder_must_own_community/);
assert.match(migration, /existing_founder_current_owner_count_mismatch/);
assert.match(migration, /existing_founder_owner_set_mismatch/);
assert.match(migration, /sourceProgram !== "builder_partner_v1"/);
assert.match(migration, /await ctx\.db\.delete\(policy\._id\)/);
assert.doesNotMatch(migration, /legacyProgramGrants|sourcePartnerRecordId/);

assert.match(lifecycle, /requireExistingFounderCommunityCreationEligibility\(ctx, ownerId\)/);
assert.match(core, /if \(!\(await existingFounderInferenceCohortIsInitialized\(ctx\)\)\) return/);
assert.match(core, /throw new Error\("founder_plan_required"\)/);
assert.match(core, /grant\.status === "approved"[\s\S]*mode: "legacy_requester_chatgpt"/);
assert.match(core, /grant\.status === "suspended"[\s\S]*owner_funding_suspended/);
assert.match(core, /mode: "owner_api_key"[\s\S]*payerUserId: community\.ownerId/);

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
assert.match(backend, /providerStartedAt[\s\S]*status: "indeterminate"[\s\S]*ambiguous_provider_retry_blocked/);
assert.match(backend, /COMMUNITY_OWNER_INFERENCE_ACTOR_TURNS_PER_MINUTE/);
assert.match(backend, /COMMUNITY_OWNER_INFERENCE_COMMUNITY_TURNS_PER_MINUTE/);

assert.match(intake, /resolveCommunityInferenceFundingAdmission/);
assert.match(intake, /funding\.mode === "legacy_requester_chatgpt"[\s\S]*requesterHasChatgptConnection/);
assert.match(worker, /const ownerFunded = context\.funding\.mode === "owner_api_key"/);
assert.match(worker, /runOpenAiNativeToolCompletion\(\{[\s\S]*modelId: COMMUNITY_OWNER_FUNDED_MODEL_ID[\s\S]*apiKeyOverride: ownerApiKey/);
assert.match(worker, /aggregatePromptTokens \+=/);
assert.match(worker, /claimCommunityInferenceReceiptInternal/);
assert.match(worker, /markCommunityInferenceProviderStartedInternal/);
assert.match(
  worker,
  /executeRetrievalHarnessTool\(\{[\s\S]*userId: normalizeIdValue\(args\.context\.request\.sponsorUserId\)[\s\S]*authSubject: normalizeIdValue\(args\.context\.request\.authSubject\)/,
);
assert.doesNotMatch(worker, /executeRetrievalHarnessTool\(\{[\s\S]{0,300}userId: normalizeIdValue\(context\.funding\.payerUserId\)/);

assert.match(settings, /Community inference funding/);
assert.match(settings, /every community I own/);
assert.match(settings, /Activate for all communities/);
assert.match(legal, /does not transfer the founder's administrative permissions to a member/);
assert.match(legal, /Receipts do not contain the API key, prompts, responses, or tool output/);
assert.match(cognitionContract, /Direct Concierge chat is community-founder-funded/);
assert.doesNotMatch(
  cognitionContract,
  /member_concierge`[\s\S]{0,300}requester-funded through the requester's provider connection/,
);
assert.doesNotMatch(cognitionContract, /Chat is asker-funded/);

console.log("founder_inference_contract_proof: ok");
