import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");
const directory = readFileSync(join(root, "convex/communityIntelligenceDirectory.ts"), "utf8");
const aiFeed = readFileSync(join(root, "convex/communityAiFeed.ts"), "utf8");

assert.doesNotMatch(directory, /communityIntelligenceProposals|reviewCommunityIntelligenceProposal|needs_review/, "directory substrate should not use legacy queue naming");

function exportedFunctionBlock(source: string, exportName: string): string {
  const startToken = `export const ${exportName} =`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${exportName} should exist`);
  const nextConst = source.indexOf("\nexport const ", start + startToken.length);
  const nextAsync = source.indexOf("\nexport async function ", start + startToken.length);
  const nextCandidates = [nextConst, nextAsync].filter((index) => index !== -1);
  const next = nextCandidates.length ? Math.min(...nextCandidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

function exportedAsyncFunctionBlock(source: string, exportName: string): string {
  const startToken = `export async function ${exportName}`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${exportName} should exist`);
  const nextConst = source.indexOf("\nexport const ", start + startToken.length);
  const nextAsync = source.indexOf("\nexport async function ", start + startToken.length);
  const nextCandidates = [nextConst, nextAsync].filter((index) => index !== -1);
  const next = nextCandidates.length ? Math.min(...nextCandidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

function assertInternalCanonicalRepairFunction(functionName: string) {
  const block = exportedFunctionBlock(directory, functionName);
  assert.match(block, new RegExp(`export const ${functionName} = internalMutation`), `${functionName} should be internal-only repair infrastructure`);
  assert.match(block, /resolveAdminTruthActor/, `${functionName} should use admin-only truth actor resolution`);
  assert.doesNotMatch(block, /actorType: v\./, `${functionName} should not expose caller-selected actor identity`);
  assert.doesNotMatch(block, /actorAgentKey/, `${functionName} should not expose agent attribution through direct repair writes`);
  assert.doesNotMatch(block, /v\.literal\("agent"\)|v\.literal\("compiler"\)|v\.literal\("system"\)/, `${functionName} should not allow autonomous actors to write canonical truth directly`);
}

function assertPolicyGatedApply(functionName: string) {
  const block = exportedFunctionBlock(directory, functionName);
  const trustedCore = exportedAsyncFunctionBlock(directory, "applyTrustedCommunityIntelligenceChangeRequestCore");
  assert.match(block, /resolvePolicyDecisionActor/, `${functionName} should use policy decision actor resolution`);
  assert.doesNotMatch(block, /actorAgentKey/, `${functionName} should not accept or write caller-supplied agent attribution`);
  assert.doesNotMatch(block, /v\.literal\("agent"\)|v\.literal\("compiler"\)|v\.literal\("system"\)/, `${functionName} should not allow public autonomous policy actors`);
  assert.match(block, /applyTrustedCommunityIntelligenceChangeRequestCore/, `${functionName} should delegate canonical writes to the trusted apply core`);
  assert.match(trustedCore, /changeRequest\.status !== "accepted"/, `${functionName} should require an accepted change request`);
  assert.match(trustedCore, /requireChangeRequestTargetsCurrent/, `${functionName} should reject stale targets`);
  assert.match(trustedCore, /insertMutationLog/, `${functionName} should still write audited mutations`);
  assert.match(trustedCore, /policyDecisionId: normalizeIdValue\(changeRequest\._id\)/, `${functionName} should link mutations to the accepted change request`);
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
  /communityIntelligenceNodes: defineTable\([\s\S]*originChangeRequestId: v\.optional\(v\.id\("communityIntelligenceChangeRequests"\)\)/,
  "retained nodes should preserve the change request that created them",
);
assert.match(
  exportedAsyncFunctionBlock(directory, "applyTrustedCommunityIntelligenceChangeRequestCore"),
  /originChangeRequestId: changeRequest\._id/,
  "create-node apply should persist stable lifecycle lineage",
);

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
  schema,
  /communitySourceTraces: defineTable\([\s\S]*v\.literal\("feedback"\)[\s\S]*v\.literal\("transcript"\)/,
  "source traces should include feedback and transcript evidence types",
);
assert.match(
  schema,
  /communitySourceTraces: defineTable\([\s\S]*compilerState: v\.optional\([\s\S]*v\.literal\("pending"\)[\s\S]*v\.literal\("compiled"\)[\s\S]*v\.literal\("excluded_by_visibility"\)[\s\S]*compilerPendingSince: v\.optional\(v\.number\(\)\)[\s\S]*compilerLastHandledAt: v\.optional\(v\.number\(\)\)[\s\S]*compilerLastDigestId: v\.optional\(v\.id\("communityCompilerDigests"\)\)/,
  "source traces should carry explicit compiler lifecycle state",
);
assert.match(
  schema,
  /\.index\("by_community_compilerState_visibility_pendingSince", \[[\s\S]*"communityId",[\s\S]*"compilerState",[\s\S]*"visibilityScope",[\s\S]*"compilerPendingSince",[\s\S]*\]\)/,
  "source traces should support bounded visibility-aware pending-backlog reads",
);
assert.match(
  directory,
  /createCommunityIntelligenceChangeRequest[\s\S]*insertChangeRequest/,
  "activity should be able to create policy-gated directory change requests",
);
assert.doesNotMatch(
  directory,
  /recordTrustedCommunitySourceTraceInternal/,
  "trusted product evidence should not expose a generic internal mutation; source-specific product bridges should call the core helper",
);
assert.match(
  directory,
  /export async function recordTrustedCommunitySourceTraceCore[\s\S]*community_source_trace_trusted_source_type_required/,
  "trusted product evidence core should reject manual/external source types",
);
assert.match(
  directory,
  /recordTrustedCommunitySourceTraceCore[\s\S]*const visibilityScope = args\.visibilityScope \?\? "admin"/,
  "trusted product evidence core should default to restricted visibility",
);
assert.match(
  directory,
  /recordTrustedCommunitySourceTraceCore[\s\S]*allowExistingUpdate: true/,
  "trusted product evidence core should explicitly opt into idempotent source updates",
);
assert.match(
  directory,
  /recordTrustedCommunitySourceTraceCore[\s\S]*actorType === "member" \|\| actorType === "admin"[\s\S]*community_source_trace_actor_user_required/,
  "trusted human-attributed evidence should require a user id",
);
assert.match(
  directory,
  /recordTrustedCommunitySourceTraceCore[\s\S]*outcomeObservationIds = args\.outcomeObservationIds \?\? \[\][\s\S]*requireOutcomeIdsBelongToCommunity\(args\.ctx, args\.communityId, outcomeObservationIds\)/,
  "trusted source traces should validate attached outcomes belong to the same community",
);
assert.doesNotMatch(
  directory,
  /export const recordCommunitySourceTrace = mutation/,
  "raw source-trace intake must not be a public mutation; product bridges own evidence admission",
);
assert.match(
  directory,
  /allowExistingUpdate\?: boolean[\s\S]*if \(existing\) \{[\s\S]*if \(!args\.allowExistingUpdate\) \{[\s\S]*community_source_trace_source_conflict/,
  "source trace upserts should reject source-id collisions unless trusted overwrite is explicit",
);
assert.match(
  directory,
  /sourceTraceMaterialChanged[\s\S]*shouldMarkSourceTracePending[\s\S]*nextSourceTracePendingSince/,
  "source trace upserts should mark material evidence updates pending without reopening idempotent writes",
);
assert.match(
  directory,
  /sourceTraceCompilerLifecyclePatch[\s\S]*compilerState: nextState[\s\S]*compilerPendingSince: undefined[\s\S]*compilerLastHandledAt: undefined[\s\S]*compilerState: "pending" as const[\s\S]*compilerPendingSince: nextSourceTracePendingSince/,
  "source trace lifecycle should exclude private traces and return eligible material updates to pending",
);
assert.match(
  directory,
  /const compilerLifecyclePatch = sourceTraceCompilerLifecyclePatch\([\s\S]*ctx\.db\.insert\("communitySourceTraces"[\s\S]*\.\.\.compilerLifecyclePatch/,
  "new source traces should start from the visibility-aware compiler lifecycle patch",
);
assert.match(
  aiFeed,
  /upsertCommunitySourceTrace\([\s\S]*sourceType: "ai_feed"[\s\S]*allowExistingUpdate: true/,
  "trusted product-owned AI feed traces should explicitly opt into existing-source updates",
);
{
  const block = exportedFunctionBlock(directory, "createCommunityIntelligenceChangeRequest");
  assert.match(
    block,
    /actorType: v\.optional\(\s*v\.union\(\s*v\.literal\("member"\),\s*v\.literal\("admin"\),?\s*\)/,
    "public change requests should only allow member/admin actor identity",
  );
  assert.doesNotMatch(
    block,
    /v\.literal\("agent"\)|v\.literal\("compiler"\)|v\.literal\("system"\)|actorAgentKey/,
    "public change requests should not impersonate community-agent or compiler actors",
  );
  assert.match(
    block,
    /if \(actor\.isManager\) \{[\s\S]*requireTraceIdsBelongToCommunity[\s\S]*\} else \{[\s\S]*requireTraceIdsReadableByViewer/,
    "member change requests should validate trace readability, not only community ownership",
  );
  assert.match(
    block,
    /requireOutcomeIdsReadableByViewer[\s\S]*requireNodeIdsReadableByViewer[\s\S]*requireEdgeIdsReadableByViewer/,
    "member change requests should validate readable outcomes, nodes, and edges",
  );
}
assert.match(
  directory,
  /function canViewerReadTrace[\s\S]*row\.sourceVisibility === "redacted"[\s\S]*if \(isManager\) return true;[\s\S]*actorUserId[\s\S]*row\.visibilityScope === "private"[\s\S]*community_source_trace_not_readable/,
  "trace readability should reject redaction before manager expansion while still allowing owned private traces",
);
assert.match(
  directory,
  /async function canViewerReadOutcome[\s\S]*observedByUserId[\s\S]*retrievalLogBelongsToUser[\s\S]*community_outcome_observation_not_readable/,
  "outcome readability should be limited to managers, observers, or retrieval-log owners",
);
assert.match(
  directory,
  /function isSourceTraceRow[\s\S]*function isOutcomeObservationRow/,
  "readability validators should verify referenced rows are the expected directory/evidence row shape",
);
assert.match(
  directory,
  /requireChangeRequestPayloadReferencesAllowed[\s\S]*payload\.toReferenceType[\s\S]*requireTraceIdsReadableByViewer[\s\S]*requireOutcomeIdsReadableByViewer[\s\S]*payload\.deprecatedByNodeId/,
  "change request payload references should be validated for readability before they can enter the airlock",
);
assert.match(
  directory,
  /createCommunityIntelligenceChangeRequest[\s\S]*requireChangeRequestPayloadReferencesAllowed/,
  "public change requests should validate payload references before insertion",
);
assert.match(
  directory,
  /requireChangeRequestReferencesAllowedForApply[\s\S]*createdByActorType === "member"[\s\S]*createdByUserId[\s\S]*requireTraceIdsReadableByViewer[\s\S]*requireOutcomeIdsReadableByViewer[\s\S]*requireNodeIdsReadableByViewer[\s\S]*requireEdgeIdsReadableByViewer[\s\S]*requireChangeRequestPayloadReferencesAllowed/,
  "apply should revalidate member-authored change request references against the original requester readability",
);
assertInternalCanonicalRepairFunction("createCommunityIntelligenceNode");
assertInternalCanonicalRepairFunction("updateCommunityIntelligenceNode");
assertInternalCanonicalRepairFunction("createCommunityIntelligenceEdge");
assertPolicyGatedApply("applyCommunityIntelligenceChangeRequest");
assert.match(
  directory,
  /async function resolvePolicyDecisionActor[\s\S]*requireCommunityManager[\s\S]*actorType: "admin"/,
  "public policy decisions should resolve to explicit admin override attribution only",
);
{
  const block = exportedFunctionBlock(directory, "decideCommunityIntelligenceChangeRequest");
  const trustedCore = exportedAsyncFunctionBlock(directory, "decideTrustedCommunityIntelligenceChangeRequestCore");
  assert.match(
    block,
    /resolvePolicyDecisionActor[\s\S]*decideTrustedCommunityIntelligenceChangeRequestCore/,
    "change request decisions should resolve a policy actor before delegating to the trusted decision core",
  );
  assert.match(
    trustedCore,
    /status: args\.status[\s\S]*decidedByActorType: actor\.actorType/,
    "change request decisions should be attributed to a policy actor",
  );
  assert.doesNotMatch(
    block,
    /actorAgentKey|v\.literal\("agent"\)|v\.literal\("compiler"\)|v\.literal\("system"\)/,
    "public change request decisions should not impersonate autonomous actors",
  );
}
assert.doesNotMatch(
  directory,
  /export const (retrieveCommunityIntelligenceForWorkflow|recordCommunityIntelligenceRetrievalFeedback|recordCommunityOutcomeObservation) =/,
  "legacy workflow retrieval, receipt-wide feedback, and general public outcomes should be deleted",
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
assert.equal(
  (directory.match(/insert\("communityIntelligenceRetrievalLogs"/g) ?? []).length,
  1,
  "the directory should have exactly one retrieval receipt writer",
);
assert.match(
  directory,
  /listCommunityIntelligenceEdges[\s\S]*canViewerReadEdge\(\{ ctx, communityId: args\.communityId, edge: row, userId, isManager \}\)/,
  "edge listing should use the same readability gate as edge change request validation",
);
assert.match(
  directory,
  /recordCommunityOutcomeObservationCore[\s\S]*requiredNodeState: "injected"[\s\S]*resolveExistingReceiptOutcomeForNode[\s\S]*deduplicated: true[\s\S]*evidenceStrength: "observed"[\s\S]*insertChangeRequest\([\s\S]*operation: "attach_outcome"/,
  "the internal outcome path should require an injected canonical receipt node, deduplicate before writing, fix evidence strength, and create one change request",
);
assert.match(
  directory,
  /export const recordCommunityOutcomeObservationInternal = internalMutation[\s\S]*nodeId: v\.id\("communityIntelligenceNodes"\)[\s\S]*retrievalLogId: v\.id\("communityIntelligenceRetrievalLogs"\)/,
  "the only outcome API should be internal and require one node plus one receipt",
);
assert.match(
  directory,
  /canViewerReadNode[\s\S]*MEMBER_READABLE_STATUSES/,
  "member directory reads should exclude draft and candidate nodes",
);
assert.match(
  directory,
  /export const createCommunityIntelligenceNode = internalMutation[\s\S]*resolveAdminTruthActor/,
  "canonical node creation should be internal repair infrastructure with admin truth resolution",
);
console.log("community_intelligence_directory_contract_proof: ok");
