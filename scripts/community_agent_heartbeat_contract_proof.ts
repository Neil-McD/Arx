import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const heartbeat = readFileSync(join(root, "convex/communityAgentHeartbeat.ts"), "utf8");
const runtime = readFileSync(join(root, "convex/communityAgentRuntime.ts"), "utf8");
const fundingRuntime = readFileSync(join(root, "convex/founderInferenceRuntime.ts"), "utf8");
const crons = readFileSync(join(root, "convex/crons.ts"), "utf8");
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");
const docs = readFileSync(join(root, "docs/community-agent-cognition-contract-v1.md"), "utf8");

function exportedFunctionBlock(source: string, exportName: string): string {
  const startToken = `export const ${exportName} =`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${exportName} should exist`);
  const nextConst = source.indexOf("\nexport const ", start + startToken.length);
  return source.slice(start, nextConst === -1 ? source.length : nextConst);
}

assert.match(
  packageJson,
  /"check:community-agent-heartbeat-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_agent_heartbeat_contract_proof\.ts"/,
  "package scripts should expose the community agent heartbeat proof",
);

assert.match(heartbeat, /export const enqueueCommunityAgentHeartbeatInternal = internalMutation/);
assert.match(heartbeat, /export const runCommunityAgentHeartbeatInternal = internalAction/);
assert.doesNotMatch(heartbeat, /export const .* = action\(|export const .* = mutation\(/);
assert.doesNotMatch(heartbeat, /userPrompt|prompt: v\.string|authSubject/);
assert.doesNotMatch(heartbeat, /\.collect\(\)/);
assert.doesNotMatch(
  heartbeat,
  /providerConnections|getChatgptConnectionForUserInternal|owner_connection_missing/,
  "heartbeat scheduling must not guess community funding from owner credentials",
);
assert.match(
  crons,
  /canonical runtime admits founder[\s\S]*funding before any model call/,
  "cron contract should identify the runtime as founder-funding authority",
);
assert.doesNotMatch(
  crons,
  /asker-funded|requester-funded|no owner connection/,
  "community-agent cron comments should not restore retired requester or credential funding",
);

{
  const singleCommunityHeartbeatSurface = heartbeat.slice(
    0,
    heartbeat.indexOf("export const listCommunityMemorySweepTargetsInternal"),
  );
  assert.doesNotMatch(
    singleCommunityHeartbeatSurface,
    /query\("communities"/,
    "single-community heartbeat enqueue/run path should not enumerate communities",
  );
}
assert.match(
  heartbeat,
  /listCommunityMemorySweepTargetsInternal[\s\S]*by_memoryMetabolismPending_requestedAt[\s\S]*by_compilerState_pendingSince[\s\S]*by_agentHandoffState_createdAt[\s\S]*by_agentHandoffState_agentClaimedAt/,
  "the platform sweep should discover only indexed due memory, compiler, and handoff work",
);
assert.doesNotMatch(
  heartbeat,
  /query\("communities" as any\)\.take\(limit\)/,
  "the platform sweep must not enumerate the first communities regardless of work",
);

assert.match(
  heartbeat,
  /args: \{[\s\S]*communityId: v\.id\("communities"\)[\s\S]*heartbeatId: v\.optional\(v\.string\(\)\)[\s\S]*runAfterMs: v\.optional\(v\.number\(\)\)/,
  "heartbeat enqueue should be bound to one explicit community id",
);
assert.match(
  heartbeat,
  /const community = await ctx\.db\.get\(args\.communityId\)[\s\S]*community_agent_heartbeat_community_not_found/,
  "heartbeat enqueue should fail closed when the single target community is missing",
);
assert.match(
  heartbeat,
  /ctx\.scheduler\.runAfter\([\s\S]*internalRefs\.communityAgentHeartbeat\.runCommunityAgentHeartbeatInternal[\s\S]*communityId: args\.communityId[\s\S]*heartbeatId/,
  "heartbeat enqueue should schedule a single-community heartbeat action",
);
assert.match(
  heartbeat,
  /ctx\.runAction\([\s\S]*internalRefs\.communityAgentRuntime\.runCommunityAgentCycleInternal[\s\S]*communityId: args\.communityId[\s\S]*triggerType: "heartbeat"[\s\S]*heartbeatId/,
  "heartbeat action should bridge into the canonical runtime with heartbeat trigger",
);
const heartbeatAction = exportedFunctionBlock(heartbeat, "runCommunityAgentHeartbeatInternal");
assert.doesNotMatch(
  heartbeatAction,
  /resolveCommunityAgentRunContextInternal|providerConnections/,
  "heartbeat action should leave context and funding resolution to the canonical runtime",
);
assert.match(
  heartbeat,
  /drainSelfAuthoredPendingSourceTracesInternal[\s\S]*assessCommunityAgentCycleInternal/,
  "heartbeat action should drain self-authored traces before using the canonical work planner",
);
assert.match(
  heartbeat,
  /assessCommunityAgentCycleInternal = internalQuery[\s\S]*by_community_agentHandoffState_createdAt[\s\S]*measureCommunityCompilerEvidenceForCommunity/,
  "one planner should join durable digest handoff work with compiler evidence",
);
assert.match(
  heartbeat,
  /agent_disabled[\s\S]*daily_cycle_cap_reached[\s\S]*handoff_already_running[\s\S]*pending_compiler_handoff[\s\S]*no_compiler_work/,
  "planner should keep control gates independent from compiler and handoff work truth",
);
assert.doesNotMatch(
  heartbeat,
  /newestTrace|lastOkObserver|no_new_signal|no_source_traces|first_cycle|reason: "new_signal"/,
  "raw trace and observer timestamps must not decide durable work",
);
assert.match(
  heartbeat,
  /runCommunityCompilerDigestPassInternal[\s\S]*requireTrigger: true[\s\S]*claimCommunityCompilerDigestHandoffInternal[\s\S]*runCommunityAgentCycleInternal[\s\S]*compilerDigestId: claim\.digest_id[\s\S]*compilerDigestVersionKey: claim\.version_key[\s\S]*settleCommunityCompilerDigestHandoffInternal/,
  "heartbeat should own compile, exact claim, cycle, and terminal settlement",
);
assert.match(
  heartbeat,
  /claimCommunityCompilerDigestHandoffInternal = internalMutation[\s\S]*agentHandoffState: "running" as const[\s\S]*agentClaimId: claimId[\s\S]*agentAttemptCount/,
  "handoff claim should atomically lease one exact digest version",
);
assert.match(
  heartbeat,
  /classifyCommunityCompilerDigestWork[\s\S]*"claimable" \| "settled" \| "superseded"[\s\S]*buildCommunitySourceTraceRevision[\s\S]*agentTerminalReason: workState/,
  "stale or already-settled immutable work must drain instead of poisoning the oldest handoff forever",
);
assert.match(
  schema,
  /agentTerminalReason: v\.optional\([\s\S]*v\.literal\("settled"\)[\s\S]*v\.literal\("superseded"\)/,
  "terminal handoff drainage should remain auditable",
);
assert.match(
  heartbeat,
  /settleCommunityCompilerDigestHandoffInternal = internalMutation[\s\S]*v\.literal\("handled"\)[\s\S]*v\.literal\("retry"\)[\s\S]*community_compiler_handoff_version_mismatch[\s\S]*community_compiler_handoff_claim_mismatch/,
  "settlement should fail closed on stale version or claim identity",
);
assert.match(
  heartbeat,
  /args\.outcome === "handled"[\s\S]*classifyCommunityCompilerDigestWork[\s\S]*workState !== "settled"[\s\S]*community_compiler_handoff_unsettled/,
  "the storage boundary must reject a handled handoff until every exact work item is durably settled",
);
assert.match(
  heartbeat,
  /cycle\.ok === true && cycle\.completed === true[\s\S]*outcome: handled \? "handled" : "retry"/,
  "only a completed role cycle should terminally handle a digest",
);

const sweepBlock = exportedFunctionBlock(heartbeat, "runCommunityMemorySweepInternal");
assert.doesNotMatch(
  sweepBlock,
  /ownerId|providerConnections|owner_connection_missing/,
  "memory sweep should schedule by community work only and leave funding admission to the runtime",
);
assert.match(
  sweepBlock,
  /target\.hasMemoryWork[\s\S]*settleCommunityMemorySignalsInternal[\s\S]*settleCommunityMemoryMetabolismRevisionInternal[\s\S]*target\.hasCompilerWork[\s\S]*assessCommunityAgentCycleInternal[\s\S]*enqueueCommunityAgentHeartbeatInternal/,
  "memory sweep should conditionally metabolize and conditionally enqueue compiler work",
);
assert.doesNotMatch(
  sweepBlock,
  /runCommunityCompilerDigestPassInternal|COMMUNITY_AGENT_SWEEP_HEARTBEAT_DELAY_MS/,
  "memory sweep must not compile or own an arbitrary delay",
);
assert.match(sweepBlock, /enqueueCommunityAgentHeartbeatInternal[\s\S]*runAfterMs: 0/);
assert.match(
  sweepBlock,
  /settleCommunityMemorySignalsInternal[\s\S]*communityId: target\.communityId/,
  "metabolizer settlement should be scoped to the same single community target as the sweep",
);
assert.match(
  sweepBlock,
  /catch \(error\) \{[\s\S]*Score settlement is mechanical memory metabolism[\s\S]*block compiler work for the same community/,
  "metabolizer failures should not block heartbeat evidence assessment",
);
assert.match(
  sweepBlock,
  /memoryTargets[\s\S]*compilerTargets[\s\S]*memorySettled/,
  "memory sweep should expose compact due-work and settlement diagnostics",
);
assert.match(sweepBlock, /settled_node_count[\s\S]*metabolized/);
assert.match(sweepBlock, /skipped/);
assert.match(
  heartbeat,
  /settleCommunityMemoryMetabolismRevisionInternal[\s\S]*currentRevision !== args\.revision[\s\S]*newer_memory_work[\s\S]*memoryMetabolismPending: false[\s\S]*memoryMetabolismSettledRevision: args\.revision/,
  "memory settlement must leave a newer concurrent revision pending",
);

assert.match(
  runtime,
  /COMMUNITY_AGENT_RUNNING_RUN_STALE_MS = 30 \* 60 \* 1000/,
  "runtime should define a bounded stale-running window",
);
const runtimeLoop = exportedFunctionBlock(runtime, "runCommunityAgentLoopInternal");
const fundingAdmissionIndex = runtimeLoop.indexOf("resolveCommunityInferenceFundingForAction");
const fundingClaimIndex = runtimeLoop.indexOf("claimCommunityInferenceFundingSession");
const runCompletionIndex = runtimeLoop.indexOf("runCompletion: async");
const providerStartIndex = runtimeLoop.indexOf(
  "markCommunityInferenceFundingSessionProviderStarted",
);
const providerRequestIndex = runtimeLoop.indexOf("runOpenAiNativeToolCompletion");
assert.ok(fundingAdmissionIndex >= 0, "community runtime should resolve canonical founder funding");
assert.ok(
  fundingClaimIndex > fundingAdmissionIndex,
  "community runtime should admit canonical founder funding before claiming provider spend",
);
assert.ok(
  providerStartIndex > runCompletionIndex && providerRequestIndex > providerStartIndex,
  "community runtime should mark provider start inside the completion boundary immediately before the provider request",
);
assert.doesNotMatch(
  fundingRuntime,
  /owner_api_key|getOpenAiConnectionForUserInternal|decryptStoredSecret|apiKeyOverride/,
  "community runtime funding must never load an owner credential",
);
assert.match(
  runtime,
  /\.query\("communityAgentRuns"[\s\S]*\.withIndex\("by_community_status_createdAt"[\s\S]*q\.eq\("communityId", args\.communityId\)\.eq\("status", "running"\)[\s\S]*\.take\(20\)/,
  "runtime should check running runs inside the same community before creating a new run",
);
assert.match(
  runtime,
  /skipped_reason: "running_run_exists"/,
  "runtime should skip fresh overlapping runs",
);
assert.match(
  runtime,
  /stopReason: "stale_running_run_replaced"[\s\S]*community_agent_runtime_stale_running_run/,
  "runtime should mark stale running runs as replaced before creating a new run",
);
assert.match(
  runtime,
  /if \(row\.status !== "running"\) return mapRun\(row\)/,
  "finish should not overwrite a terminal run that was already stale-replaced",
);
assert.match(
  schema,
  /communityAgentRuns: defineTable\(\{[\s\S]*heartbeatId: v\.optional\(v\.string\(\)\)[\s\S]*v\.literal\("skipped"\)[\s\S]*wakeReason: v\.optional\(v\.string\(\)\)[\s\S]*wakeEvidence: v\.optional\(v\.object/,
  "schema should persist heartbeat skip/run wake reason and evidence diagnostics",
);
assert.match(
  schema,
  /\.index\("by_community_status_createdAt", \["communityId", "status", "createdAt"\]\)/,
  "schema should support same-community running-run lookup",
);
assert.match(
  heartbeat,
  /by_community_role_triggerType_createdAt[\s\S]*\.eq\("role", "steward"\)[\s\S]*\.eq\("triggerType", "heartbeat"\)[\s\S]*\.gte\("createdAt", dayStartMs\)[\s\S]*\.take\(COMMUNITY_AGENT_CYCLES_PER_DAY_CAP\)/,
  "daily cost gating should use an exact bounded index instead of a recent-row scan",
);
assert.match(
  schema,
  /communityCompilerDigests: defineTable\([\s\S]*versionKey: v\.optional\(v\.string\(\)\)[\s\S]*agentHandoffState: v\.optional\([\s\S]*v\.literal\("pending"\)[\s\S]*v\.literal\("running"\)[\s\S]*v\.literal\("handled"\)[\s\S]*by_community_versionKey[\s\S]*by_community_agentHandoffState_createdAt/,
  "schema should persist versioned autonomous digest handoffs with bounded lookup indexes",
);
assert.match(
  docs,
  /Tenth Implementation Slice[\s\S]*single-community heartbeat bridge[\s\S]*`enqueueCommunityAgentHeartbeatInternal`[\s\S]*one explicit `communityId`[\s\S]*`runCommunityAgentHeartbeatInternal`[\s\S]*`triggerType`: `heartbeat`[\s\S]*fresh running run exists[\s\S]*`running_run_exists`[\s\S]*stale running runs/,
  "docs should describe the heartbeat bridge and concurrency guard",
);
assert.match(
  docs,
  /Canonical Compiler-to-Agent Handoff[\s\S]*immutable digest version[\s\S]*`pending` is claimable[\s\S]*`running` has a bounded lease[\s\S]*`handled` is\s+terminal[\s\S]*never compiles evidence itself/,
  "docs should describe the durable autonomous handoff contract",
);
assert.match(
  docs,
  /Memory is founder-funded[\s\S]*canonical founder-funding admission[\s\S]*active attached Builder[\s\S]*subscription or the operator grant/,
  "docs should describe every canonical autonomous-cognition funding lane",
);

console.log("community_agent_heartbeat_contract_proof: ok");
