import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");
const metabolizer = readFileSync(join(root, "convex/communityMemoryMetabolizer.ts"), "utf8");
const heartbeat = readFileSync(join(root, "convex/communityAgentHeartbeat.ts"), "utf8");
const directory = readFileSync(join(root, "convex/communityIntelligenceDirectory.ts"), "utf8");
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
  /"check:community-metabolizer-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_metabolizer_contract_proof\.ts"/,
  "package scripts should expose the community metabolizer proof",
);

assert.match(
  metabolizer,
  /METABOLIZER_RETRIEVAL_LOG_LIMIT = 500[\s\S]*METABOLIZER_OUTCOME_LIMIT = 500[\s\S]*METABOLIZER_NODE_UPDATE_LIMIT = 200/,
  "metabolizer should use fixed bounded settlement limits",
);
assert.match(
  metabolizer,
  /METABOLIZER_EXCLUDED_AGENT_KEYS = new Set\(\["community_agent"\]\)/,
  "metabolizer should explicitly exclude the canonical community agent from self-authored outcome evidence",
);
assert.match(
  schema,
  /communityMemoryMetabolizerRuns: defineTable\(\{[\s\S]*communityId: v\.id\("communities"\)[\s\S]*status: v\.union\([\s\S]*v\.literal\("settled"\)[\s\S]*v\.literal\("noop"\)[\s\S]*v\.literal\("error"\)[\s\S]*trigger: v\.union\([\s\S]*v\.literal\("sweep"\)[\s\S]*v\.literal\("manual"\)[\s\S]*v\.literal\("internal"\)[\s\S]*changedNodeIds: v\.array\(v\.id\("communityIntelligenceNodes"\)\)[\s\S]*\.index\("by_community_finishedAt", \["communityId", "finishedAt"\]\)/,
  "schema should include a same-community metabolizer run ledger with settled/noop/error statuses",
);
assert.match(
  metabolizer,
  /function metabolizedRetrievalUsefulnessScore[\s\S]*function hasMetabolizerRetrievalSignal[\s\S]*function metabolizedOutcomeImpactScore[\s\S]*function hasMetabolizerOutcomeSignal[\s\S]*function metabolizedStalenessScore/,
  "metabolizer should compute the three derived learning scores deterministically",
);
assert.match(
  heartbeat,
  /internalRefs\.communityMemoryMetabolizer\.settleCommunityMemorySignalsInternal/,
  "memory sweep should call the dedicated metabolizer module, not the directory module",
);
assert.match(
  schema,
  /memoryMetabolismPending: v\.optional\(v\.boolean\(\)\)[\s\S]*memoryMetabolismRevision: v\.optional\(v\.number\(\)\)[\s\S]*memoryMetabolismSettledRevision: v\.optional\(v\.number\(\)\)[\s\S]*by_memoryMetabolismPending_requestedAt/,
  "community rows should carry the minimal indexed memory due-work revision",
);
assert.match(
  directory,
  /recordCommunityOutcomeObservationCore[\s\S]*memoryMetabolismRevision[\s\S]*memoryMetabolismPending: true[\s\S]*memoryMetabolismRequestedAt: nowMs/,
  "new canonical outcomes should atomically mark their community for metabolism",
);
assert.match(
  heartbeat,
  /settleCommunityMemoryMetabolismRevisionInternal[\s\S]*currentRevision !== args\.revision[\s\S]*newer_memory_work[\s\S]*memoryMetabolismPending: false/,
  "sweep settlement should clear only the exact observed memory revision",
);

const block = exportedFunctionBlock(metabolizer, "settleCommunityMemorySignalsInternal");
const errorBlock = exportedFunctionBlock(metabolizer, "recordCommunityMemoryMetabolizerErrorRunInternal");
assert.doesNotMatch(
  metabolizer,
  /export const listCommunityMemoryMetabolizerRuns\b/,
  "the unread metabolizer run listing stays deleted; runs remain an operational ledger",
);
assert.match(
  block,
  /export const settleCommunityMemorySignalsInternal = internalMutation/,
  "metabolizer settlement should be internal-only",
);
assert.match(
  block,
  /communityId: v\.id\("communities"\)/,
  "metabolizer settlement must be scoped to one explicit community",
);
assert.match(
  block,
  /trigger: v\.optional\(v\.union\(v\.literal\("sweep"\), v\.literal\("manual"\), v\.literal\("internal"\)\)\)/,
  "metabolizer settlement should record the source trigger for the run ledger",
);
assert.match(
  block,
  /const community = await ctx\.db\.get\(args\.communityId\)[\s\S]*community_metabolizer_community_not_found/,
  "metabolizer settlement should fail closed when the target community is missing",
);
assert.match(
  block,
  /query\("communityIntelligenceRetrievalLogs"[\s\S]*withIndex\("by_community_createdAt"[\s\S]*q\.eq\("communityId", args\.communityId\)[\s\S]*\.take\(retrievalLogLimit\)/,
  "metabolizer should read retrieval logs through a bounded same-community index",
);
assert.match(
  block,
  /query\("communityOutcomeObservations"[\s\S]*withIndex\("by_community_observedAt"[\s\S]*q\.eq\("communityId", args\.communityId\)[\s\S]*\.take\(outcomeLimit\)/,
  "metabolizer should read outcomes through a bounded same-community index",
);
assert.doesNotMatch(
  block,
  /\.collect\(\)|query\("communities"|runAction|openai|generateText|modelId|prompt: v\.string/,
  "metabolizer v0 should be deterministic, bounded, and should not call an LLM or enumerate communities",
);
assert.doesNotMatch(
  block,
  /insertChangeRequest|communityIntelligenceChangeRequests|createCommunityIntelligenceNode|updateCommunityIntelligenceNode|createCommunityIntelligenceEdge/,
  "metabolizer score settlement should not create change requests or call canonical directory write APIs",
);
assert.match(
  block,
  /if \(!ACTIVE_RETRIEVAL_STATUSES\.includes\(node\.status\)\) continue/,
  "metabolizer should only settle accepted retrieval statuses",
);
assert.match(
  block,
  /const hasRetrievalSignal = hasMetabolizerRetrievalSignal\(signal\)[\s\S]*const hasOutcomeSignal = hasMetabolizerOutcomeSignal\(signal\)[\s\S]*nextRetrievalUsefulnessScore = hasRetrievalSignal[\s\S]*: node\.retrievalUsefulnessScore[\s\S]*nextOutcomeImpactScore = hasOutcomeSignal[\s\S]*: node\.outcomeImpactScore/,
  "metabolizer should not erase one learning score dimension when only another dimension has fresh evidence",
);
assert.match(
  block,
  /ctx\.db\.patch\(node\._id as any, \{[\s\S]*retrievalUsefulnessScore: nextRetrievalUsefulnessScore[\s\S]*outcomeImpactScore: nextOutcomeImpactScore[\s\S]*stalenessScore: nextStalenessScore[\s\S]*\}\)/,
  "metabolizer should patch only derived score fields",
);
assert.match(
  block,
  /insertMetabolizerRunLedger\(\{[\s\S]*status: changedNodes\.length > 0 \? "settled" : "noop"[\s\S]*inspectedRetrievalLogCount: retrievalLogs\.length[\s\S]*inspectedOutcomeCount: outcomes\.length[\s\S]*signalNodeCount: signals\.size[\s\S]*inspectedNodeCount: inspectedNodes[\s\S]*settledNodeCount: changedNodes\.length[\s\S]*changedNodeIds: changedNodes\.map\(\(node\) => node\.id\)/,
  "metabolizer should write a compact run ledger for both settled and noop runs",
);
assert.match(
  block,
  /run_id: normalizeIdValue\(runId\)[\s\S]*status: changedNodes\.length > 0 \? "settled" : "noop"/,
  "settlement response should expose the ledger run id and status",
);
assert.match(
  block,
  /changedNodes\.push\(\{[\s\S]*outcome_impact_score: updated\.outcomeImpactScore[\s\S]*\}\);[\s\S]*if \(changedNodes\.length >= nodeUpdateLimit\) break/,
  "nodeUpdateLimit should cap actual settled nodes, not noisy signal inspection",
);
assert.doesNotMatch(
  block,
  /if \(inspectedNodes >= nodeUpdateLimit\) break/,
  "nodeUpdateLimit should not stop before validating whether a signal can settle a node",
);

const patchStart = block.indexOf("await ctx.db.patch(node._id as any, {");
assert.notEqual(patchStart, -1, "metabolizer should patch node scores");
const patchEnd = block.indexOf("});", patchStart);
assert.notEqual(patchEnd, -1, "metabolizer patch block should close");
const patchBlock = block.slice(patchStart, patchEnd);
assert.doesNotMatch(
  patchBlock,
  /(status|title|bodyMd|confidence|version|updatedAt|lastUpdatedByActorType|lastUpdatedByUserId|lastUpdatedByAgentKey):/,
  "metabolizer score settlement should not mutate canonical content, status, confidence, version, updatedAt, or last-updated attribution",
);
assert.match(
  metabolizer,
  /insertMetabolizerMutationLog[\s\S]*operation: "update_node"[\s\S]*actorType: "system"[\s\S]*beforeSnapshot[\s\S]*afterSnapshot[\s\S]*reason: "metabolizer_score_settlement"/,
  "metabolizer score settlement should still write an audit mutation with before/after snapshots",
);
assert.match(
  metabolizer,
  /insertMetabolizerRunLedger[\s\S]*ctx\.db\.insert\("communityMemoryMetabolizerRuns"/,
  "metabolizer should write run/noop/error audit rows to the dedicated run ledger",
);
assert.match(
  block,
  /if \(outcome\.retrievalLogId\)[\s\S]*if \(!isCanonicalMemoryReceipt\(retrievalLog\)\) continue[\s\S]*if \(outcome\.nodeId\)[\s\S]*canonicalReceiptInjectedNode\(retrievalLog, outcome\.nodeId\)/,
  "receipt-bound outcomes should apply only to one injected node on a canonical V1 receipt",
);
assert.match(
  block,
  /if \(!isCanonicalMemoryReceipt\(log\) \|\| !log\.feedback\) continue/,
  "legacy retrieval logs should remain audit-only and must not feed metabolizer feedback",
);
assert.match(
  block,
  /for \(const outcome of outcomes\) \{[\s\S]*METABOLIZER_EXCLUDED_AGENT_KEYS\.has\(String\(outcome\.observedByAgentKey \?\? ""\)\)[\s\S]*continue/,
  "metabolizer should skip community-agent-authored outcome observations before applying outcome signal",
);
assert.match(
  errorBlock,
  /export const recordCommunityMemoryMetabolizerErrorRunInternal = internalMutation/,
  "error run recording should be internal-only",
);
assert.match(
  errorBlock,
  /const community = await ctx\.db\.get\(args\.communityId\)[\s\S]*community_metabolizer_community_not_found[\s\S]*status: "error"[\s\S]*changedNodeIds: \[\]/,
  "error run recording should fail closed on missing community and never invent changed nodes",
);
assert.match(
  heartbeat,
  /settleCommunityMemorySignalsInternal[\s\S]*communityId: target\.communityId[\s\S]*trigger: "sweep"[\s\S]*recordCommunityMemoryMetabolizerErrorRunInternal[\s\S]*status|settleCommunityMemorySignalsInternal[\s\S]*communityId: target\.communityId[\s\S]*trigger: "sweep"[\s\S]*recordCommunityMemoryMetabolizerErrorRunInternal/,
  "memory sweep should pass the sweep trigger and record error runs without blocking the heartbeat",
);

assert.match(
  docs,
  /Metabolizer v0[\s\S]*deterministic score settlement[\s\S]*settles persistent derived scores for nodes touched by recent bounded evidence[\s\S]*no-signal nodes are left unchanged[\s\S]*communityMemoryMetabolizerRuns[\s\S]*noop[\s\S]*manager-readable/,
  "architecture doc should describe the metabolizer v0 boundary and run ledger",
);

console.log("community_metabolizer_contract_proof: ok");
