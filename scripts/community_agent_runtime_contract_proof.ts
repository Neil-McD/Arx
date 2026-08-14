import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const runtime = readFileSync(
  join(root, "convex/communityAgentRuntime.ts"),
  "utf8",
);
const stewardPrompt = readFileSync(
  join(root, "shared/communityAgentStewardPrompt.ts"),
  "utf8",
);
const roles = readFileSync(join(root, "shared/communityAgentRoles.ts"), "utf8");
const protocol = readFileSync(
  join(root, "shared/communityAgentToolProtocol.ts"),
  "utf8",
);
const filesystem = readFileSync(
  join(root, "convex/communityAgentFilesystem.ts"),
  "utf8",
);
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");

assert.match(
  runtime,
  /export const runCommunityAgentLoopInternal = internalAction/,
);
assert.match(
  runtime,
  /export const runCommunityAgentCycleInternal = internalAction/,
);
assert.match(runtime, /readCanonicalCommunityAgentContext/);
assert.doesNotMatch(
  runtime,
  /userPrompt|prompt: v\.string|authSubject|userId: v\.optional/,
);
assert.match(
  roles,
  /COMMUNITY_AGENT_CYCLE_ROLES[\s\S]*\[\s*"steward",\s*\]/,
  "one cognition pass should replace the mandatory three-role chain",
);
assert.match(
  roles,
  /Make one explicit decision for every exact evidence item[\s\S]*call write once with the complete decision batch[\s\S]*toolNames: \["search", "write"\]/,
  "the steward must settle every work key with only duplicate lookup and one atomic write",
);
assert.doesNotMatch(
  protocol,
  /name: "list"|name: "read"/,
  "the model should not rediscover compiler context already preloaded by the runtime",
);
assert.match(
  runtime,
  /if \(exactCompilerWindow\) \{[\s\S]*compilerWindow = exactCompilerWindow[\s\S]*path: "\/compiler\/window"[\s\S]*role: roleDefinition/,
  "the steward should receive the exact bounded compiler window",
);
assert.doesNotMatch(runtime, /slimCompilerWindowForSteward/);
assert.match(
  stewardPrompt,
  /renderCompilerWindowForPrompt[\s\S]*items\.slice\(0, 96\)[\s\S]*work_key:[\s\S]*source_revision:[\s\S]*compiler_group_key:[\s\S]*renderCompilerWindowForPrompt\(context\.compilerWindow\)/,
  "prompt compaction must preserve every bounded work identity instead of truncating serialized JSON",
);
assert.doesNotMatch(
  `${runtime}\n${protocol}`,
  /cycleLedger|CycleLedger|toolName === "note"|name: "note"/,
  "the deleted multi-role ledger must not remain in the active runtime or model tool surface",
);
assert.doesNotMatch(
  schema,
  /communityAgentCycleLedgers/,
  "the retired multi-role cycle ledger table must not remain in canonical schema",
);
assert.doesNotMatch(roles, /observer:\s*\{|questioner:\s*\{/);
assert.match(
  runtime,
  /inspectCommunityCompilerDigestSettlementInternal[\s\S]*settlementComplete = settlement\.complete === true[\s\S]*unsettled_compiler_work/,
  "a successful model response alone must not terminally handle evidence",
);
assert.match(
  protocol,
  /settle_compiler_digest_items[\s\S]*COMMUNITY_MEMORY_DECISION_DISPOSITIONS[\s\S]*normalizeCommunityMemoryDecision/,
  "runtime writes should use the structured decision contract",
);
assert.match(
  filesystem,
  /writeCommunityAgentFilesystemInternal[\s\S]*settleCommunityIntelligenceFromDigestItemsCore/,
  "runtime writes should land on the atomic settlement core",
);
assert.match(runtime, /runNativeRuntimeKernel<CommunityAgentToolName>/);
assert.match(runtime, /parallelToolCalls: false/);
assert.doesNotMatch(runtime, /beginCommunityInferenceFundingSession/);
assert.match(runtime, /claimCommunityInferenceFundingSession/);
assert.match(
  runtime,
  /runCompletion: async[\s\S]*if \(!providerStarted\)[\s\S]*markCommunityInferenceFundingSessionProviderStarted\([\s\S]*providerStarted = true[\s\S]*runOpenAiNativeToolCompletion/,
  "community cognition should mark provider start once at the exact first provider request",
);
assert.match(
  runtime,
  /fundingClaimAttempted = true[\s\S]*preProviderFundingErrorCode[\s\S]*runtimeErrorCode[\s\S]*errorCode: runtimeErrorCode/,
  "community cognition should preserve pre-provider funding failures instead of relabeling them as runtime exceptions",
);
assert.match(
  runtime,
  /usageComplete: !providerStarted[\s\S]*disposition: providerStarted \? "indeterminate" : "failed"/,
  "runtime exceptions should release pre-provider reservations and conservatively settle post-provider uncertainty",
);
assert.doesNotMatch(
  runtime,
  /runChatgptNativeToolCompletion|apiKeyOverride|carryReasoningItems/,
  "community cognition must execute through hosted funding without user-provider state",
);
assert.match(runtime, /recordCommunityAgentRunEventsInternal/);
assert.match(
  runtime,
  /recordCommunityAgentStewardContextSnapshotInternal[\s\S]*seq: 0[\s\S]*kind: "context_snapshot"/,
  "the exact initial Steward messages should have a dedicated sequence-zero receipt",
);
assert.match(
  runtime,
  /snapshotJson[\s\S]*recordCommunityAgentStewardContextSnapshotInternal[\s\S]*if \(!contextSnapshot\?\.ok\)[\s\S]*runNativeRuntimeKernel/,
  "context persistence must succeed before the first provider-capable kernel step",
);
assert.doesNotMatch(
  runtime,
  /kind: "system_prompt", content: String\(messages\[0\]/,
  "new Steward runs should not retain the lossy split prompt events",
);
assert.match(
  stewardPrompt,
  /compileRuntimePromptSections[\s\S]*id: "community_agent_identity"[\s\S]*id: "steward_shared_rules"[\s\S]*id: "steward_role_definition"[\s\S]*id: "community_system_prompt"/,
  "the Steward system prompt should expose four canonical sections",
);
assert.match(
  runtime,
  /operation === "settle_compiler_digest_items"[\s\S]*applied_change_request_ids[\s\S]*appliedChangeRequestIds\.add/,
  "run receipts should collect applied memory audit ids from the batch result",
);
assert.match(
  schema,
  /communityAgentRuns: defineTable\([\s\S]*appliedChangeRequestIds: v\.optional\(v\.array\(v\.string\(\)\)\)/,
);
assert.doesNotMatch(
  runtime,
  /ctx\.db\.insert\("communityIntelligenceNodes"|ctx\.db\.patch\([^)]*communityIntelligenceNodes/,
  "the runtime must not bypass the directory mutation boundary",
);

console.log("community_agent_runtime_contract_proof: ok");
