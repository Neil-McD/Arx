import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");
const directory = readFileSync(join(root, "convex/communityIntelligenceDirectory.ts"), "utf8");
const communityExports = readFileSync(join(root, "convex/community.ts"), "utf8");

assert.doesNotMatch(directory, /communityIntelligenceProposals|reviewCommunityIntelligenceProposal|needs_review/, "directory substrate should not use legacy queue naming");
assert.doesNotMatch(communityExports, /CommunityIntelligenceProposal|reviewCommunityIntelligenceProposal/, "community exports should expose change request APIs, not legacy queue APIs");

function exportedFunctionBlock(source: string, exportName: string): string {
  const startToken = `export const ${exportName}`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${exportName} should exist`);
  const next = source.indexOf("\nexport const ", start + startToken.length);
  return source.slice(start, next === -1 ? source.length : next);
}

function assertNoAutonomousCanonicalActor(functionName: string) {
  const block = exportedFunctionBlock(directory, functionName);
  assert.match(block, /resolveAdminTruthActor/, `${functionName} should use admin-only truth actor resolution`);
  assert.match(block, /actorType: v\.optional\(\s*v\.literal\("admin"\),?\s*\)/, `${functionName} should only accept admin as direct truth actor`);
  assert.doesNotMatch(block, /v\.literal\("agent"\)|v\.literal\("compiler"\)|v\.literal\("system"\)/, `${functionName} should not allow autonomous actors to write canonical truth directly`);
}

function assertPolicyGatedApply(functionName: string) {
  const block = exportedFunctionBlock(directory, functionName);
  assert.match(block, /resolvePolicyDecisionActor/, `${functionName} should use policy decision actor resolution`);
  assert.match(block, /changeRequest\.status !== "accepted"/, `${functionName} should require an accepted change request`);
  assert.match(block, /requireChangeRequestTargetsCurrent/, `${functionName} should reject stale targets`);
  assert.match(block, /insertMutationLog/, `${functionName} should still write audited mutations`);
  assert.match(block, /policyDecisionId: normalizeIdValue\(changeRequest\._id\)/, `${functionName} should link mutations to the accepted change request`);
}

for (const tableName of [
  "communitySourceTraces",
  "communityIntelligenceNodes",
  "communityIntelligenceEdges",
  "communityIntelligenceMutations",
  "communityIntelligenceChangeRequests",
  "communityIntelligenceRetrievalLogs",
  "communityOutcomeObservations",
]) {
  assert.match(schema, new RegExp(`${tableName}: defineTable`), `${tableName} table should exist`);
}

assert.match(
  schema,
  /operation: v\.union\([\s\S]*v\.literal\("create_node"\)[\s\S]*v\.literal\("create_edge"\)[\s\S]*v\.literal\("attach_outcome"\)/,
  "directory mutations should be typed operations",
);
assert.match(
  schema,
  /communityIntelligenceEdges: defineTable\([\s\S]*type: v\.union\([\s\S]*v\.literal\("supports"\)[\s\S]*v\.literal\("contradicts"\)[\s\S]*v\.literal\("validated_by"\)/,
  "directory edges should use typed operational relationships",
);
assert.match(
  directory,
  /insertMutationLog\([\s\S]*communityIntelligenceMutations/,
  "directory writes should flow through an audit mutation log helper",
);
assert.match(
  schema,
  /communityIntelligenceChangeRequests: defineTable\([\s\S]*status: v\.union\([\s\S]*v\.literal\("pending_decision"\)[\s\S]*v\.literal\("accepted"\)[\s\S]*v\.literal\("applied"\)/,
  "directory change requests should model the policy decision airlock before truth mutation",
);
assert.match(
  schema,
  /communityIntelligenceChangeRequests: defineTable\([\s\S]*decidedByActorType: v\.optional\([\s\S]*v\.literal\("agent"\)[\s\S]*decidedByAgentKey: v\.optional/,
  "directory change request decisions should support community cognition actor attribution",
);
assert.match(
  schema,
  /communityIntelligenceChangeRequests: defineTable\([\s\S]*targetNodeSnapshots: v\.array\([\s\S]*version: v\.number\(\)[\s\S]*targetEdgeSnapshots: v\.array/,
  "directory change requests should snapshot target state before decision/apply",
);
assert.match(
  directory,
  /createCommunityIntelligenceChangeRequest[\s\S]*insertChangeRequest/,
  "activity should be able to create policy-gated directory change requests",
);
{
  const block = exportedFunctionBlock(directory, "recordCommunitySourceTrace");
  assert.match(
    block,
    /sourceType: v\.union\(v\.literal\("manual"\), v\.literal\("external"\)\)/,
    "public source trace writes should be limited to manual/external evidence",
  );
  assert.doesNotMatch(
    block,
    /v\.literal\("chat"\)|v\.literal\("ai_feed"\)|v\.literal\("resource"\)|v\.literal\("workflow_run"\)|v\.literal\("agent_run"\)|v\.literal\("artifact"\)|v\.literal\("tool_call"\)|v\.literal\("outcome"\)/,
    "public source trace writes should not impersonate product-owned source types",
  );
  assert.match(
    block,
    /actorType: v\.optional\(\s*v\.union\(\s*v\.literal\("member"\),\s*v\.literal\("admin"\),?\s*\)/,
    "public source trace writes should only allow member/admin actor identity",
  );
  assert.doesNotMatch(
    block,
    /v\.literal\("agent"\)|v\.literal\("compiler"\)|v\.literal\("system"\)/,
    "public source trace writes should not claim autonomous actor identity",
  );
}
assertNoAutonomousCanonicalActor("createCommunityIntelligenceNode");
assertNoAutonomousCanonicalActor("updateCommunityIntelligenceNode");
assertNoAutonomousCanonicalActor("createCommunityIntelligenceEdge");
assertPolicyGatedApply("applyCommunityIntelligenceChangeRequest");
assert.match(
  directory,
  /decideCommunityIntelligenceChangeRequest[\s\S]*resolvePolicyDecisionActor[\s\S]*status: args\.status[\s\S]*decidedByActorType/,
  "community cognition decisions should be attributed to a policy actor",
);
assert.match(
  directory,
  /createCommunityIntelligenceNode[\s\S]*insertMutationLog\([\s\S]*operation: "create_node"/,
  "node creation should write an audit mutation",
);
assert.match(
  directory,
  /updateCommunityIntelligenceNode[\s\S]*insertMutationLog\([\s\S]*beforeSnapshot[\s\S]*afterSnapshot/,
  "node updates should audit before and after snapshots",
);
assert.match(
  directory,
  /createCommunityIntelligenceEdge[\s\S]*insertMutationLog\([\s\S]*operation: "create_edge"/,
  "edge creation should write an audit mutation",
);
assert.match(
  directory,
  /retrieveCommunityIntelligenceForWorkflow[\s\S]*communityIntelligenceRetrievalLogs/,
  "workflow retrieval should log retrieved and injected nodes",
);
assert.match(
  directory,
  /recordCommunityOutcomeObservation[\s\S]*community_intelligence_outcome_retrieval_required[\s\S]*insertChangeRequest\([\s\S]*operation: "attach_outcome"/,
  "member outcome observations should require retrieval context and create change requests instead of direct truth writes",
);
assert.match(
  directory,
  /recordCommunityOutcomeObservation[\s\S]*if \(node\) \{[\s\S]*insertChangeRequest\([\s\S]*operation: "attach_outcome"/,
  "outcome observations should become change requests before they can alter directory truth",
);
assert.match(
  directory,
  /canViewerReadNode[\s\S]*MEMBER_READABLE_STATUSES/,
  "member directory reads should exclude draft and candidate nodes",
);
assert.match(
  directory,
  /export const createCommunityIntelligenceNode[\s\S]*requireCommunityManager\(\{ ctx, communityId: args\.communityId, userId \}\);/,
  "canonical node creation should require community manager authority",
);
assert.match(
  directory,
  /export const retrieveCommunityIntelligenceForWorkflow[\s\S]*requireCommunityChatAccess\(\{ ctx, communityId: args\.communityId, userId \}\);/,
  "retrieval should require community access",
);
assert.match(
  communityExports,
  /createCommunityIntelligenceNodeImpl/,
  "community module should re-export directory node creation",
);
assert.match(
  communityExports,
  /retrieveCommunityIntelligenceForWorkflowImpl/,
  "community module should re-export workflow retrieval",
);
assert.match(
  communityExports,
  /createCommunityIntelligenceChangeRequestImpl[\s\S]*applyCommunityIntelligenceChangeRequestImpl/,
  "community module should re-export change request decision and application functions",
);

console.log("community_intelligence_directory_contract_proof: ok");
