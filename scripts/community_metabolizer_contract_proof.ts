import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
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
  directory,
  /METABOLIZER_RETRIEVAL_LOG_LIMIT = 500[\s\S]*METABOLIZER_OUTCOME_LIMIT = 500[\s\S]*METABOLIZER_NODE_UPDATE_LIMIT = 200/,
  "metabolizer should use fixed bounded settlement limits",
);
assert.match(
  directory,
  /METABOLIZER_EXCLUDED_AGENT_KEYS = new Set\(\["community_agent"\]\)/,
  "metabolizer should explicitly exclude the canonical community agent from self-authored outcome evidence",
);
assert.match(
  directory,
  /function metabolizedRetrievalUsefulnessScore[\s\S]*function hasMetabolizerRetrievalSignal[\s\S]*function metabolizedOutcomeImpactScore[\s\S]*function hasMetabolizerOutcomeSignal[\s\S]*function metabolizedStalenessScore/,
  "metabolizer should compute the three derived learning scores deterministically",
);

const block = exportedFunctionBlock(directory, "settleCommunityMemorySignalsInternal");
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
  block,
  /insertMutationLog\(\{[\s\S]*operation: "update_node"[\s\S]*actorType: "system"[\s\S]*beforeSnapshot[\s\S]*afterSnapshot[\s\S]*reason: "metabolizer_score_settlement"/,
  "metabolizer score settlement should still write an audit mutation with before/after snapshots",
);
assert.match(
  block,
  /if \(outcome\.nodeId\)[\s\S]*else if \(outcome\.retrievalLogId\)[\s\S]*retrievalLogNodeIds\(retrievalLog\)/,
  "outcomes should apply directly to nodeId when present and otherwise fall back to retrieved nodes from retrieval provenance",
);
assert.match(
  block,
  /for \(const outcome of outcomes\) \{[\s\S]*METABOLIZER_EXCLUDED_AGENT_KEYS\.has\(String\(outcome\.observedByAgentKey \?\? ""\)\)[\s\S]*continue/,
  "metabolizer should skip community-agent-authored outcome observations before applying outcome signal",
);

assert.match(
  docs,
  /Metabolizer v0[\s\S]*deterministic score settlement[\s\S]*settles persistent derived scores for nodes touched by recent bounded evidence[\s\S]*no-signal nodes are left unchanged[\s\S]*node update cap limits actual settled nodes/,
  "architecture doc should describe the metabolizer v0 boundary",
);

console.log("community_metabolizer_contract_proof: ok");
