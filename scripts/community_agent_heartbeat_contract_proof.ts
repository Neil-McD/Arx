import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const heartbeat = readFileSync(join(root, "convex/communityAgentHeartbeat.ts"), "utf8");
const runtime = readFileSync(join(root, "convex/communityAgentRuntime.ts"), "utf8");
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
  /listCommunityMemorySweepTargetsInternal[\s\S]*query\("communities" as any\)\.take\(limit\)/,
  "only the platform sweep target lister should enumerate communities, and it must be bounded",
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
  /ctx\.runAction\(internalRefs\.communityAgentRuntime\.runCommunityAgentCycleInternal[\s\S]*communityId: args\.communityId[\s\S]*triggerType: "heartbeat"[\s\S]*heartbeatId/,
  "heartbeat action should bridge into the canonical runtime with heartbeat trigger",
);
assert.match(
  heartbeat,
  /drainSelfAuthoredPendingSourceTracesInternal[\s\S]*measureCommunityCompilerEvidenceInternal/,
  "heartbeat action should drain self-authored pending traces before measuring trigger evidence",
);
assert.match(
  heartbeat,
  /measureCommunityCompilerEvidenceInternal[\s\S]*communityId: args\.communityId/,
  "heartbeat action should measure eligible compiler evidence for exactly one community before runtime",
);
assert.match(
  heartbeat,
  /if \(!compilerEvidence\.should_run\) \{[\s\S]*recordCommunityAgentSkippedRunInternal[\s\S]*triggerType: "heartbeat"[\s\S]*wakeReason: wakeEvidence\.reason[\s\S]*wakeEvidence/,
  "heartbeat action should persist a skipped run when compiler evidence does not warrant a wake",
);
assert.match(
  heartbeat,
  /runCommunityAgentCycleInternal[\s\S]*wakeReason: wakeEvidence\.reason[\s\S]*wakeEvidence/,
  "heartbeat action should pass wake reason and evidence into real community-agent runs",
);
assert.match(
  heartbeat,
  /selectedEvidenceFromMeasurement[\s\S]*selected_evidence_units[\s\S]*expectedUpdatedAt = Date\.parse[\s\S]*selected\.length >= 100/,
  "heartbeat should carry a bounded id-plus-version evidence snapshot selected by the wake measurement",
);
assert.match(
  heartbeat,
  /if \(!cycleResult\.evidence_processed\)[\s\S]*cognition_cycle_did_not_process_evidence[\s\S]*settled_count: 0/,
  "failed, interrupted, or overlapping cognition cycles must leave selected evidence pending",
);
assert.match(
  heartbeat,
  /cycleResult\.evidence_processed[\s\S]*settleCommunityCompilerEvidenceCycleInternal[\s\S]*communityId: args\.communityId[\s\S]*evidence: selectedEvidence[\s\S]*compilerDigestId: args\.compilerDigestId/,
  "a completed cognition cycle should settle exactly its selected evidence in the same community",
);
assert.match(
  heartbeat,
  /compilerDigestId: v\.optional\(v\.id\("communityCompilerDigests"\)\)[\s\S]*ctx\.scheduler\.runAfter[\s\S]*compilerDigestId: args\.compilerDigestId/,
  "scheduled heartbeats should carry the digest provenance produced by the sweep",
);
assert.match(
  heartbeat,
  /if \(args\.compilerDigestId\)[\s\S]*ctx\.db\.get\(args\.compilerDigestId\)[\s\S]*digest\.communityId[\s\S]*community_agent_heartbeat_digest_not_found/,
  "heartbeat enqueue should reject cross-community digest provenance before scheduling spend",
);

const sweepBlock = exportedFunctionBlock(heartbeat, "runCommunityMemorySweepInternal");
assert.match(
  sweepBlock,
  /runCommunityCompilerDigestPassInternal[\s\S]*compilerDigestId = boundedText\(digest\?\.id[\s\S]*settleCommunityMemorySignalsInternal[\s\S]*enqueueCommunityAgentHeartbeatInternal[\s\S]*compilerDigestId/,
  "memory sweep should refresh digest, settle metabolizer scores, then enqueue the delayed heartbeat",
);
assert.match(
  heartbeat,
  /communityArchiveDocuments[\s\S]*by_community_createdAt[\s\S]*communityOutcomeObservations[\s\S]*by_community_observedAt[\s\S]*newestSignalAt/,
  "cycle assessment should allow archive and outcome signal to earn a digest/heartbeat attempt before source traces exist",
);
assert.match(
  heartbeat,
  /newestSignalAt <= Number\(lastOkObserver\.startedAt/,
  "cycle assessment delta gate should compare the newest raw learning signal against the last successful observer",
);
assert.match(
  heartbeat,
  /COMPILER_EVIDENCE_VISIBILITY_SCOPES\.map[\s\S]*by_community_compilerState_visibility_pendingSince[\s\S]*\.eq\("compilerState", "pending"\)[\s\S]*reason: "pending_evidence"[\s\S]*newestSignalAt/,
  "unfinished pending evidence should retry before the raw-signal delta gate can suppress it",
);
assert.match(
  sweepBlock,
  /settleCommunityMemorySignalsInternal[\s\S]*communityId: target\.communityId/,
  "metabolizer settlement should be scoped to the same single community target as the sweep",
);
assert.match(
  sweepBlock,
  /catch \{[\s\S]*Score settlement is mechanical memory metabolism[\s\S]*block the heartbeat's evidence gate/,
  "metabolizer failures should not block heartbeat evidence assessment",
);
assert.match(
  sweepBlock,
  /metabolized[\s\S]*settled_node_count[\s\S]*return \{ ok: true, targets: targets\.length, enqueued, metabolized, skipped \}/,
  "memory sweep should expose compact metabolizer settlement diagnostics",
);

assert.match(
  runtime,
  /COMMUNITY_AGENT_RUNNING_RUN_STALE_MS = 30 \* 60 \* 1000/,
  "runtime should define a bounded stale-running window",
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
  docs,
  /Tenth Implementation Slice[\s\S]*single-community heartbeat bridge[\s\S]*`enqueueCommunityAgentHeartbeatInternal`[\s\S]*one explicit `communityId`[\s\S]*`runCommunityAgentHeartbeatInternal`[\s\S]*`triggerType`: `heartbeat`[\s\S]*fresh running run exists[\s\S]*`running_run_exists`[\s\S]*stale running runs/,
  "docs should describe the heartbeat bridge and concurrency guard",
);
assert.match(
  docs,
  /Thirteenth Implementation Slice[\s\S]*measure eligible pending evidence[\s\S]*status: skipped[\s\S]*wakeReason[\s\S]*wakeEvidence[\s\S]*does not give members, admins, or prompts a direct wake path/,
  "docs should describe heartbeat evidence measurement and skipped-run persistence",
);

console.log("community_agent_heartbeat_contract_proof: ok");
