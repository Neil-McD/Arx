import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const count = (value: string, pattern: RegExp) =>
  Array.from(value.matchAll(pattern)).length;

const kernel = read("shared/runtimeKernel.ts");
assert.match(kernel, /inputBudget: RuntimeKernelInputBudgetConfig/);
assert.match(kernel, /toolSchemas: readonly unknown\[\]/);
assert.doesNotMatch(
  kernel,
  /getToolSchemas/,
  "the kernel must budget an exact immutable tool-schema value",
);
assert.match(
  kernel,
  /!planned\.plan\.fits[\s\S]*projectProviderContextToBudget\([\s\S]*planProviderMessages\(providerMessages\)/,
  "a preflight overflow must project and re-plan before provider execution",
);
assert.match(
  kernel,
  /completion\.code === CONTEXT_WINDOW_EXCEEDED_CODE[\s\S]*projectProviderContextToBudget\([\s\S]*planProviderMessages\([\s\S]*recoveryProjection\.messages[\s\S]*runProviderCompletion\(recoveryProjection\.messages\)/,
  "the single provider-overflow retry must make measurable savings and re-plan",
);
assert.doesNotMatch(
  kernel,
  /prepareProviderTranscript|onProviderContextCompacted|providerContextCompactionActive/,
  "the optional role-owned legacy compaction path must be deleted",
);
assert.equal(
  count(kernel, /params\.runCompletion\(/g),
  1,
  "the shared budget helper must be the only direct provider-completion seam",
);

const providerContext = read("shared/providerContextWindow.ts");
assert.match(
  providerContext,
  /estimateRuntimeMessageInputTokens\(\s*messages,\s*imageInputTokens,\s*\)\.estimatedTokens/,
  "provider-overflow evidence must reuse the canonical message estimator",
);
assert.doesNotMatch(providerContext, /ESTIMATED_CHARS_PER_TOKEN/);

const memberConversationContext = read(
  "shared/memberAgentConversationContext.ts",
);
assert.doesNotMatch(
  memberConversationContext,
  /MEMBER_AGENT_CONTEXT_MAX_CHARS|MEMBER_AGENT_CONTEXT_MAX_MESSAGE_CHARS|maxCharacters/,
  "Member provider context must not apply a separate raw character budget before model-aware admission",
);

for (const path of [
  "convex/runtimeAgentLoop.ts",
  "convex/communityAgentServeWorker.ts",
  "convex/communityAgentRuntime.ts",
]) {
  const source = read(path);
  const callAt = source.indexOf("runNativeRuntimeKernel<");
  const budgetAt = source.indexOf("inputBudget:", callAt);
  const completionAt = source.indexOf("runCompletion:", callAt);
  assert.ok(callAt >= 0, `${path} must call the shared native kernel`);
  assert.ok(
    budgetAt > callAt && budgetAt < completionAt,
    `${path} must configure admission before its provider callback`,
  );
  assert.match(source, /buildRuntimeInputBudgetEvidence/);
  assert.match(source, /recordProjection:/);
  assert.match(source, /buildRuntimeContextProjectionEvidence/);
  assert.doesNotMatch(
    source,
    /getToolSchemas/,
    `${path} must not rebuild tool schemas through the budget seam`,
  );
}

const memberRuntime = read("convex/runtimeAgentLoop.ts");
assert.match(
  memberRuntime,
  /const activeProviderTools = \{[\s\S]*toolSchemas:[\s\S]*activeProviderTools\.responsesTools[\s\S]*tools: activeProviderTools\.responsesTools/,
  "Member and Funnel must budget and send one resolved provider tool surface",
);
assert.match(
  memberRuntime,
  /ensureInitialProviderContextAttestation\(messages\)[\s\S]*beforeProviderRequest/,
  "Member and Funnel must attest the actual projected provider messages before funding",
);
assert.doesNotMatch(memberRuntime, /buildActiveProviderTools/);
assert.match(
  memberRuntime,
  /class RuntimeProviderLifecycleHookError[\s\S]*throw new RuntimeProviderLifecycleHookError\(error\)[\s\S]*throw error\.originalError/,
  "pre-provider lifecycle failures must escape unchanged for role-level mapping",
);

const conciergeRuntime = read("convex/communityAgentServeWorker.ts");
assert.match(
  conciergeRuntime,
  /const conciergeProviderTools =[\s\S]*buildCommunityAgentConciergeFunctionTools\(\)[\s\S]*toolSchemas: conciergeProviderTools[\s\S]*tools: conciergeProviderTools/,
  "Concierge must budget and send one resolved provider tool surface",
);

const stewardRuntime = read("convex/communityAgentRuntime.ts");
assert.match(
  stewardRuntime,
  /const stewardProviderTools = buildCommunityAgentFunctionTools\([\s\S]*toolSchemas: stewardProviderTools[\s\S]*tools: stewardProviderTools/,
  "Steward must budget and send one resolved provider tool surface",
);
assert.match(
  stewardRuntime,
  /fundingClaimAttempted = true[\s\S]*preProviderFundingErrorCode[\s\S]*runtimeErrorCode[\s\S]*errorCode: runtimeErrorCode/,
  "Steward must preserve pre-provider funding error semantics",
);

const turnHandlers = read("convex/runtimeTurnHandlers.ts");
const turnFundingClaims = Array.from(
  turnHandlers.matchAll(
    /communityFundingSession = await claimCommunityFundingSession\(\)/g,
  ),
);
assert.equal(turnFundingClaims.length, 2);
for (const match of turnFundingClaims) {
  const prefix = turnHandlers.slice(Math.max(0, match.index! - 220), match.index);
  assert.match(
    prefix,
    /beforeProviderRequest:/,
    "Member/Funnel funding must remain lazy until after kernel admission",
  );
}

for (const path of [
  "convex/communityAgentServeWorker.ts",
  "convex/communityAgentRuntime.ts",
]) {
  const source = read(path);
  const completionAt = source.indexOf("runCompletion:");
  const claimAt = source.indexOf(
    path.endsWith("communityAgentRuntime.ts")
      ? "fundingState.run = await startFundedInferenceRun"
      : "fundingSession = await claimCommunityInferenceFundingSession",
    completionAt,
  );
  assert.ok(
    claimAt > completionAt,
    `${path} must not claim funding before shared-kernel admission`,
  );
}

for (const path of ["convex/openAiNativeToolCompletion.ts"]) {
  assert.doesNotMatch(read(path), /messages_exceed_size_budget/);
}

const runtimeEvents = read("convex/communityAgentRuntime.ts");
assert.match(runtimeEvents, /v\.literal\("input_budget"\)/);
assert.match(runtimeEvents, /v\.literal\("context_projection"\)/);

const capacityRegistry = read("shared/runtimeInputBudget.ts");
assert.doesNotMatch(
  capacityRegistry,
  /openrouter_chat_completions|chatgpt_responses/,
  "agent turns budget only the OpenAI transport",
);
assert.match(capacityRegistry, /"openai\/gpt-6-luna"/, "the community model must have a reviewed capacity profile");
assert.match(capacityRegistry, /openai\/gpt-5\.6-luna/);

const contract = read("docs/native-agent-runtime-context-contract-v1.md");
assert.match(contract, /resolved transport\/model\s+reference/);
assert.match(contract, /Unknown capacity\s+rejects admission/);
assert.match(
  contract,
  /native-only Slice 10 cleanup are production-released/,
  "the runtime contract must record the released losing-kernel cleanup",
);
assert.match(
  contract,
  /only final Steward live acceptance remains/,
  "the runtime contract must preserve the exact remaining Steward evidence gate",
);
assert.doesNotMatch(
  contract,
  /Slice 10 cleanup is locally complete|Slice 10 final release proof remains|Pi feasibility residue deleted locally/,
  "the runtime contract must not regress to the pre-release Slice 10 status",
);

console.log("runtime_input_budget_contract_proof: ok");
