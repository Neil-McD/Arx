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
  "shared/communityAgentConversationContext.ts",
);
assert.doesNotMatch(
  memberConversationContext,
  /COMMUNITY_AGENT_CONTEXT_MAX_CHARS|COMMUNITY_AGENT_CONTEXT_MAX_MESSAGE_CHARS|maxCharacters/,
  "Member provider context must not apply a separate raw character budget before model-aware admission",
);

// Every guide run (a private talk, tagged in a channel, the nightly review)
// goes through one run entry: convex/communityAgentRun.ts.
for (const path of [
  "convex/communityAgentRun.ts",
]) {
  const source = read(path);
  const callAt = source.indexOf("runPiRuntimeKernel<");
  const budgetAt = source.indexOf("inputBudget:", callAt);
  const completionAt = source.indexOf("runCompletion:", callAt);
  assert.ok(callAt >= 0, `${path} must call the selected shared kernel`);
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
assert.doesNotMatch(memberRuntime, /runPiRuntimeKernel|buildActiveProviderTools/, "a private talk has no loop of its own");
assert.match(
  memberRuntime,
  /runFundedCommunityAgent\(\{[\s\S]*lens: params\.communityLens\?\.lens \?\? "member_private"[\s\S]*beforeFirstCompletion: recordContextReceipt/,
  "a private talk runs on the run entry under its lens, with its context receipt",
);
assert.match(
  read("convex/communityAgentRun.ts"),
  /if \(!firstCompletionChecked\)[\s\S]*args\.beforeFirstCompletion![\s\S]*claimCommunityInferenceFundingSession\(/,
  "the context receipt is recorded with the actual provider messages before funding is claimed",
);
assert.match(
  memberRuntime,
  /if \(stoppedBeforeAnything\) throw new Error\(run\.failureCode\)/,
  "a refused funding claim escapes unchanged for the handler to explain",
);

const conciergeRuntime = read("convex/communityAgentRun.ts");
assert.match(
  conciergeRuntime,
  /const lensTools = LENS_TOOLS\[args\.lens\];[\s\S]*const tools = buildResponsesApiFunctionTools\(lensTools\)[\s\S]*toolSchemas: tools[\s\S]*\btools,/,
  "The guide's run must budget and send one resolved provider tool surface",
);
assert.match(read("convex/communityAgentServeWorker.ts"), /runFundedCommunityAgent\(\{/, "the tagged guide runs on the shared run entry");
assert.match(read("convex/communityMemoryReview.ts"), /runFundedCommunityAgent\(\{/, "the nightly review runs on the shared run entry");

// Funding is claimed only by the run entry, after admission (below); a
// private talk's handler never claims it.
assert.doesNotMatch(read("convex/runtimeTurnHandlers.ts"), /claimCommunityFundingSession|claimCommunityInferenceFundingSession/);

for (const path of [
  "convex/communityAgentRun.ts",
]) {
  const source = read(path);
  const completionAt = source.indexOf("runCompletion:");
  const claimAt = source.indexOf("fundingSession = await claimCommunityInferenceFundingSession", completionAt);
  assert.ok(
    claimAt > completionAt,
    `${path} must not claim funding before shared-kernel admission`,
  );
}

for (const path of ["convex/openAiNativeToolCompletion.ts"]) {
  assert.doesNotMatch(read(path), /messages_exceed_size_budget/);
}


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
