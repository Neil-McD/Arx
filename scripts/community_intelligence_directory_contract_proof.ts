import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");
const directory = readFileSync(join(root, "convex/communityIntelligenceDirectory.ts"), "utf8");

assert.doesNotMatch(directory, /communityIntelligenceProposals|reviewCommunityIntelligenceProposal|needs_review/, "directory substrate should not use legacy queue naming");

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
assert.doesNotMatch(
  directory,
  /export const (createCommunityIntelligenceChangeRequest|decideCommunityIntelligenceChangeRequest|applyCommunityIntelligenceChangeRequest|createCommunityIntelligenceNode|updateCommunityIntelligenceNode|createCommunityIntelligenceEdge|listCommunityIntelligenceEdges) =/,
  "the uncalled directory change-request and node/edge endpoints stay deleted; outcomes enter through recordCommunityOutcomeObservationInternal",
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
  /requireChangeRequestReferencesAllowedForApply[\s\S]*createdByActorType === "member"[\s\S]*createdByUserId[\s\S]*requireTraceIdsReadableByViewer[\s\S]*requireOutcomeIdsReadableByViewer[\s\S]*requireNodeIdsReadableByViewer[\s\S]*requireEdgeIdsReadableByViewer[\s\S]*requireChangeRequestPayloadReferencesAllowed/,
  "apply should revalidate member-authored change request references against the original requester readability",
);
assert.doesNotMatch(
  directory,
  /export const (retrieveCommunityIntelligenceForWorkflow|recordCommunityIntelligenceRetrievalFeedback|recordCommunityOutcomeObservation) =/,
  "legacy workflow retrieval, receipt-wide feedback, and general public outcomes should be deleted",
);
assert.equal(
  (directory.match(/insert\("communityIntelligenceRetrievalLogs"/g) ?? []).length,
  1,
  "the directory should have exactly one retrieval receipt writer",
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
console.log("community_intelligence_directory_contract_proof: ok");
