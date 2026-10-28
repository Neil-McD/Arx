import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const packageJson = read("package.json");
const schema = read("convex/schema.ts");
const founderPlan = read("shared/founderPlan.ts");
const paidToolPricing = read("shared/founderPaidTools.ts");
const planCore = read("convex/founderPlanCore.ts");
const paidToolReceipts = read("convex/founderPaidTools.ts");
const paidToolRuntime = read("convex/founderPaidToolRuntime.ts");
const providerCostCore = read("convex/providerCostCore.ts");
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");
const communityResources = read("convex/communityResources.ts");
const runtimePolicy = read("shared/runtimeToolPolicy.ts");
const runtimeInvocationSurface = read("shared/runtimeInvocationSurface.ts");
const providerPricing = read("shared/providerPricing.ts");

assert.match(packageJson, /"check:founder-paid-tool-accounting-proof"/);
assert.match(founderPlan, /POLYNET_FOUNDER_PLAN_INCLUDED_COST_MICROS = 20_000_000/);
assert.match(
  paidToolPricing,
  /FOUNDER_PAID_TOOL_RESERVATION_MICROS_BY_ACTION[\s\S]*search: 50_000[\s\S]*open_page: 10_000[\s\S]*find_in_page: 10_000[\s\S]*crawl: 100_000/,
);
assert.match(paidToolPricing, /providerCostUsdToMicros[\s\S]*Math\.ceil\(numeric \* 1_000_000\)/);

const receiptSchema = schema.slice(
  schema.indexOf("communityPaidToolReceipts: defineTable"),
  schema.indexOf("workspaceCreditBalances: defineTable"),
);
assert.match(receiptSchema, /receiptKey: v\.string\(\)/);
assert.match(receiptSchema, /usageCycleId: v\.optional\(v\.id\("founderUsageCycles"\)\)/);
assert.match(receiptSchema, /reservedCostMicros: v\.number\(\)/);
assert.match(receiptSchema, /settledCostMicros: v\.optional\(v\.number\(\)\)/);
assert.doesNotMatch(receiptSchema, /providerCostKey/);
assert.match(receiptSchema, /\.index\("by_receipt_key", \["receiptKey"\]\)/);
assert.match(receiptSchema, /\.index\("by_actor_community_createdAt", \["actorUserId", "communityId", "createdAt"\]\)/);

assert.match(planCore, /reservationCostMicros\?: number/);
assert.match(planCore, /assertFounderUsageCycleLedgerState\(cycle\)/);
assert.match(planCore, /founder_usage_settlement_exceeds_reservation/);
assert.match(planCore, /nextReservedCostMicros \+ nextSettledCostMicros > cycle\.includedCostMicros/);

assert.match(paidToolReceipts, /getUniqueFounderPaidToolReceiptByKey[\s\S]*\.take\(2\)/);
assert.match(paidToolReceipts, /founder_paid_tool_receipt_ambiguous/);
assert.match(paidToolReceipts, /receiptIntentMatches/);
assert.match(paidToolReceipts, /founder_paid_tool_actor_rate_limited/);
assert.match(paidToolReceipts, /founder_paid_tool_community_rate_limited/);
assert.match(paidToolReceipts, /providerStartedAt !== undefined[\s\S]*replayed: true/);
assert.match(paidToolReceipts, /resolveCommunityInferenceFundingAdmission/);
assert.match(paidToolReceipts, /founderPaidToolReservationCostMicros\(args\.action\)/);
assert.doesNotMatch(paidToolReceipts, /expectedPayerUserId|expectedFundingMode|expectedFounderSubscriptionId/);
assert.match(paidToolReceipts, /reserveFounderUsage\(\{/);
assert.match(paidToolReceipts, /markFounderPaidToolProviderStartedInternal/);
assert.match(paidToolReceipts, /settleFounderPaidToolReceiptInternal/);
assert.match(paidToolReceipts, /finalizeFounderPaidToolFailureInternal/);
assert.match(paidToolReceipts, /expireFounderPaidToolReceiptInternal/);
assert.match(paidToolReceipts, /recordProviderCostEntry\([\s\S]*failOnIdentityMismatch: true/);
assert.doesNotMatch(paidToolReceipts, /providerMayHaveStarted/);
assert.match(providerCostCore, /export async function recordProviderCostEntry/);
assert.match(providerCostCore, /provider_cost_entry_ambiguous/);

assert.match(paidToolRuntime, /crypto\.subtle\.digest\([\s\S]*"SHA-256"/);
assert.match(paidToolRuntime, /authorizeFounderPaidToolFundingSession/);
assert.match(paidToolRuntime, /markFounderPaidToolProviderStarted/);
assert.doesNotMatch(paidToolRuntime, /beginFounderPaidToolFundingSession/);

for (const toolName of ["web_crawl", "web_research"]) {
  const start = runtimeAgentLoop.indexOf(`if (params.toolName === "${toolName}")`);
  assert.notEqual(start, -1, `missing ${toolName} runtime branch`);
  const branch = runtimeAgentLoop.slice(start, start + 12_000);
  assert.match(branch, /authorizeFounderPaidToolFundingSession\(\{/);
  assert.match(branch, /markFounderPaidToolProviderStarted\(\{/);
  assert.match(branch, /toolCallId: String\(params\.toolCallId \?\? ""\)\.trim\(\)/);
  assert.match(branch, /settleFounderPaidToolFundingSession\(\{/);
  assert.doesNotMatch(branch, /recordVoiceProviderCostBestEffort\(\{/);
}
const webResearchBranchStart = runtimeAgentLoop.indexOf('if (params.toolName === "web_research")');
const webResearchBranch = runtimeAgentLoop.slice(webResearchBranchStart, webResearchBranchStart + 12_000);
assert.match(
  webResearchBranch,
  /const query = String\(normalizedArgs\.query \?\? ""\)\.trim\(\)[\s\S]*invalid_tool_args[\s\S]*authorizeFounderPaidToolFundingSession/,
);
assert.doesNotMatch(runtimeAgentLoop, /crypto\.randomUUID\(\)[\s\S]{0,200}provider_cost/);

assert.match(communityResources, /export const crawlWebRoot: any = internalAction\(\{/);
assert.doesNotMatch(
  communityResources,
  /processCommunitySourceCrawlJobInternal[\s\S]*authorizeFounderPaidToolFundingSession|processCommunitySourceCrawlJobInternal[\s\S]*settleFounderPaidToolFundingSession/,
);

assert.match(
  runtimePolicy,
  /web_research:[\s\S]*requiresCommunity: true[\s\S]*web_crawl:[\s\S]*requiresCommunity: true/,
);
assert.match(
  runtimeInvocationSurface,
  /COMMUNITY_AGENT_DOCK_CAPABILITY_FAMILY_SET[\s\S]*"web_research"/,
);
assert.match(
  runtimeInvocationSurface,
  /COMMUNITY_AGENT_DOCK_TOOL_NAME_SET[\s\S]*"web_research"[\s\S]*"web_crawl"/,
);
assert.doesNotMatch(providerPricing, /WEB_RESEARCH_CREDITS_PER_CALL/);
assert.doesNotMatch(providerPricing, /priceWebResearchCredits/);
assert.doesNotMatch(providerPricing, /priceFixedPaidToolCredits/);

console.log("PASS founder paid tool accounting contract proof");
