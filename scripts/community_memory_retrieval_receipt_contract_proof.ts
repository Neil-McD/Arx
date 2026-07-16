import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function exportedFunctionBlock(source: string, exportName: string): string {
  const startToken = `export const ${exportName} =`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${exportName} should exist`);
  const nextExport = source.indexOf("\nexport const ", start + startToken.length);
  return source.slice(start, nextExport === -1 ? source.length : nextExport);
}

function functionBlock(source: string, functionName: string, nextToken: string): string {
  const startToken = `function ${functionName}`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const end = source.indexOf(nextToken, start + startToken.length);
  assert.notEqual(end, -1, `${functionName} should have a bounded proof block`);
  return source.slice(start, end);
}

function conditionalBlock(source: string, conditionToken: string, nextConditionToken: string): string {
  const start = source.indexOf(conditionToken);
  assert.notEqual(start, -1, `${conditionToken} should exist`);
  const end = source.indexOf(nextConditionToken, start + conditionToken.length);
  assert.notEqual(end, -1, `${conditionToken} should have a bounded proof block`);
  return source.slice(start, end);
}

const contract = read("shared/communityEvidenceContract.ts");
const schema = read("convex/schema.ts");
const directory = read("convex/communityIntelligenceDirectory.ts");
const runtimeLoop = read("convex/runtimeAgentLoop.ts");
const concierge = read("convex/communityAgentServeWorker.ts");
const httpMcp = read("convex/httpMcp.ts");
const cognitionContract = read("docs/community-agent-cognition-contract-v1.md");
const mcpContract = read("docs/polynet-workspace-mcp-contract-v0.md");
const stagingAcceptance = JSON.parse(
  read("scripts/fixtures/community_memory_retrieval_receipt_staging_acceptance_20260716.json"),
);

assert.match(
  contract,
  /COMMUNITY_MEMORY_RETRIEVAL_RECEIPT_VERSION\s*=\s*\n?\s*"community_memory_retrieval_receipt:v1"/,
  "the receipt version should have one shared constant",
);
assert.match(
  contract,
  /COMMUNITY_EVIDENCE_SURFACES = \[[\s\S]*"member_agent_dock"[\s\S]*"external_mcp"[\s\S]*"community_concierge"/,
  "the receipt surfaces should reuse the canonical evidence surfaces",
);

const receiptSchema = schema.slice(
  schema.indexOf("communityIntelligenceRetrievalLogs: defineTable"),
  schema.indexOf("communityOutcomeObservations: defineTable"),
);
assert.match(
  receiptSchema,
  /receiptVersion: v\.optional\(v\.literal\("community_memory_retrieval_receipt:v1"\)\)/,
  "historical rows may omit the receipt version",
);
assert.match(
  receiptSchema,
  /surface: v\.optional\([\s\S]*"member_agent_dock"[\s\S]*"external_mcp"[\s\S]*"community_concierge"/,
  "historical rows may omit surface while new receipts use one of three canonical surfaces",
);
assert.match(
  receiptSchema,
  /Historical compatibility only[\s\S]*query: v\.optional\(v\.string\(\)\)/,
  "the raw query field should be documented as historical compatibility only",
);
assert.match(
  receiptSchema,
  /Historical compatibility only[\s\S]*node-specific outcomes[\s\S]*feedback: v\.optional/,
  "receipt-wide feedback columns should be historical storage only",
);

const createReceiptBlock = functionBlock(
  directory,
  "createCommunityMemoryRetrievalReceipt",
  "\nfunction mapTraceRow",
);
assert.match(
  createReceiptBlock,
  /receiptVersion: COMMUNITY_MEMORY_RETRIEVAL_RECEIPT_VERSION[\s\S]*surface: args\.surface/,
  "new receipts should write version and surface",
);
assert.doesNotMatch(
  createReceiptBlock,
  /\bquery\s*:/,
  "new receipts must not persist raw search text",
);

assert.doesNotMatch(
  directory,
  /insert\("communityIntelligenceRetrievalLogs"[\s\S]{0,900}\bquery\s*:/,
  "no accepted-memory retrieval-log insert should persist raw query text",
);
assert.equal(
  (directory.match(/insert\("communityIntelligenceRetrievalLogs"/g) ?? []).length,
  1,
  "the canonical receipt helper should be the only retrieval-log writer",
);
assert.doesNotMatch(
  directory,
  /export const (retrieveCommunityIntelligenceForWorkflow|recordCommunityIntelligenceRetrievalFeedback|recordCommunityOutcomeObservation) =/,
  "legacy workflow retrieval, receipt-wide feedback, and the general public outcome API should be deleted",
);

const validatorBlock = functionBlock(
  directory,
  "requireCanonicalCommunityMemoryReceipt",
  "\nfunction retrievalLogBelongsToUser",
);
assert.match(
  validatorBlock,
  /receipt\.receiptVersion !== COMMUNITY_MEMORY_RETRIEVAL_RECEIPT_VERSION[\s\S]*community_intelligence_retrieval_receipt_version_required/,
  "active receipt use should reject historical unversioned rows",
);
assert.match(
  validatorBlock,
  /receipt\.communityId[\s\S]*receipt\.userId[\s\S]*receipt\.surface !== args\.surface/,
  "one validator should bind community, viewer, and surface",
);
assert.match(
  validatorBlock,
  /requiredNodeState === "injected"[\s\S]*receipt\.injectedNodeIds[\s\S]*receipt\.retrievedNodeIds/,
  "one validator should support returned-node reads and injected-node outcomes",
);

const searchBlock = exportedFunctionBlock(directory, "searchCommunityMemoryInternal");
assert.match(
  searchBlock,
  /surface: communityEvidenceSurfaceValidator/,
  "memory search should require an explicit trusted surface",
);
assert.match(
  searchBlock,
  /searchCommunityMemoryCore\([\s\S]*surface: args\.surface/,
  "memory search should pass surface into the canonical receipt writer",
);
assert.match(
  directory,
  /export async function searchCommunityMemoryCore[\s\S]*createCommunityMemoryRetrievalReceipt\([\s\S]*retrieval_receipt: mapCommunityMemoryRetrievalReceipt/,
  "memory search should create and return the canonical receipt",
);

const readBlock = exportedFunctionBlock(directory, "readCommunityMemoryInternal");
assert.match(
  readBlock,
  /surface: communityEvidenceSurfaceValidator/,
  "memory read should require an explicit trusted surface",
);
assert.match(
  readBlock,
  /requireCanonicalCommunityMemoryReceipt\([\s\S]*nodeId: node\._id[\s\S]*requiredNodeState: "returned"/,
  "memory read should require one canonical receipt that returned the requested node",
);
assert.match(
  readBlock,
  /createCommunityMemoryRetrievalReceipt\([\s\S]*retrievedNodeIds: \[node\._id\][\s\S]*injectedNodeIds: \[node\._id\]/,
  "direct read should create one receipt containing the node as returned and injected",
);
assert.match(
  readBlock,
  /retrieval_receipt: mapCommunityMemoryRetrievalReceipt/,
  "memory read should return the updated canonical receipt",
);
const receiptMapper = functionBlock(
  directory,
  "mapCommunityMemoryRetrievalReceipt",
  "\nfunction mapOutcomeObservationRow",
);
assert.doesNotMatch(
  receiptMapper,
  /feedback/,
  "the active V1 receipt response should not expose deleted receipt-wide feedback",
);

const archiveSearchToolBlock = conditionalBlock(
  runtimeLoop,
  'if (params.toolName === "community_search")',
  'if (params.toolName === "community_memory_search")',
);
assert.doesNotMatch(
  archiveSearchToolBlock,
  /surface:/,
  "raw archive search should not receive an accepted-memory receipt surface",
);
const memorySearchToolBlock = conditionalBlock(
  runtimeLoop,
  'if (params.toolName === "community_memory_search")',
  'if (params.toolName === "community_memory_read")',
);
assert.match(
  memorySearchToolBlock,
  /surface: params\.evidenceSurface \?\? "member_agent_dock"/,
  "native search should write the actual personal-agent or Concierge surface",
);
const memoryReadToolBlock = conditionalBlock(
  runtimeLoop,
  'if (params.toolName === "community_memory_read")',
  'if (params.toolName === "community_chat_search")',
);
assert.match(
  memoryReadToolBlock,
  /surface: params\.evidenceSurface \?\? "member_agent_dock"/,
  "native read should preserve the same surface",
);
assert.match(
  concierge,
  /executeRetrievalHarnessTool\([\s\S]*evidenceSurface: "community_concierge"/,
  "Concierge should explicitly identify its surface",
);

for (const toolName of [
  "polynet_workspace_memory_search",
  "polynet_workspace_memory_read",
  "polynet_workspace_record_outcome",
] as const) {
  const start = httpMcp.indexOf(`if (toolName === "${toolName}")`);
  assert.notEqual(start, -1, `${toolName} should exist`);
  const nextTool = httpMcp.indexOf("\n  if (toolName === ", start + 1);
  const block = httpMcp.slice(start, nextTool === -1 ? httpMcp.length : nextTool);
  assert.match(
    block,
    /surface: "external_mcp"/,
    `${toolName} should bind receipt activity to external_mcp`,
  );
}

const outcomeCore = directory.slice(
  directory.indexOf("async function recordCommunityOutcomeObservationCore"),
  directory.indexOf("\nexport const recordCommunityOutcomeObservationInternal"),
);
assert.match(
  outcomeCore,
  /requireCanonicalCommunityMemoryReceipt\([\s\S]*receiptSurface[\s\S]*nodeId: node\._id[\s\S]*requiredNodeState: "injected"/,
  "receipt-bound outcomes should require the same-viewer, same-surface V1 receipt to have injected one explicit node",
);
assert.match(
  outcomeCore,
  /evidenceStrength: "observed"/,
  "the active outcome path should use fixed observed evidence strength",
);
assert.match(
  directory,
  /export const recordCommunityOutcomeObservationInternal = internalMutation[\s\S]*nodeId: v\.id\("communityIntelligenceNodes"\)/,
  "the only outcome function should be internal and node-specific",
);
const outcomeDispatchStart = httpMcp.indexOf('if (toolName === "polynet_workspace_record_outcome")');
const outcomeDispatch = httpMcp.slice(
  outcomeDispatchStart,
  httpMcp.indexOf("\n  if (toolName === ", outcomeDispatchStart + 1),
);
assert.match(outcomeDispatch, /node_id is required/);

assert.match(
  cognitionContract,
  /Thirty-Second Implementation Slice: Canonical Retrieval Receipts/,
);
assert.match(
  cognitionContract,
  /New receipts[\s\S]*never persist it|New accepted-memory receipts[\s\S]*never persist/,
);
assert.match(
  cognitionContract,
  /generic workflow retrieval API, receipt-wide feedback API, and general[\s\S]*public outcome API are deleted/,
);
assert.doesNotMatch(
  cognitionContract,
  /`community_record_outcome`/,
  "the architecture contract should not claim a nonexistent native outcome tool",
);
assert.match(
  cognitionContract,
  /current first-party caller is the[\s\S]*external MCP adapter[\s\S]*native member-agent and Concierge tools remain[\s\S]*search\/read-only/,
);
assert.match(
  mcpContract,
  /same-user, same-community, `external_mcp`, `community_memory_retrieval_receipt:v1` receipt/,
);

assert.equal(
  stagingAcceptance.schema_version,
  "community_memory_retrieval_receipt_canonicalization_staging_acceptance:v1",
);
assert.equal(stagingAcceptance.deployment_kind, "staging");
assert.equal(stagingAcceptance.self_expiring_deployment, true);
assert.equal(stagingAcceptance.production_touched, false);
assert.equal(
  stagingAcceptance.member_path?.code,
  "community_memory_receipt_member_acceptance_passed",
);
assert.deepEqual(stagingAcceptance.member_path?.failures, []);
assert.deepEqual(stagingAcceptance.member_path?.surfaces, [
  "member_agent_dock",
  "community_concierge",
  "external_mcp",
]);
assert.equal(stagingAcceptance.member_path?.same_memory_identity_across_surfaces, true);
assert.equal(stagingAcceptance.member_path?.search_read_same_receipt, true);
assert.equal(stagingAcceptance.member_path?.raw_query_persisted, false);
assert.equal(stagingAcceptance.member_path?.receipt_wide_feedback_exposed, false);
assert.equal(stagingAcceptance.member_path?.legacy_receipt_metabolizer_audit_only, true);
assert.equal(stagingAcceptance.member_path?.external_mcp_outcome_after_read, true);
assert.equal(
  stagingAcceptance.owner_path?.code,
  "community_memory_receipt_owner_acceptance_passed",
);
assert.deepEqual(stagingAcceptance.owner_path?.failures, []);
assert.equal(
  stagingAcceptance.adversarial?.unreturned_node_read,
  "community_intelligence_retrieval_node_not_returned",
);
assert.equal(
  stagingAcceptance.adversarial?.cross_surface_read,
  "community_intelligence_retrieval_receipt_surface_mismatch",
);
assert.equal(
  stagingAcceptance.owner_path?.manager_foreign_receipt_read,
  "community_intelligence_retrieval_log_forbidden",
);
assert.equal(
  stagingAcceptance.owner_path?.manager_foreign_receipt_outcome,
  "community_intelligence_retrieval_log_forbidden",
);
assert.equal(
  stagingAcceptance.adversarial?.legacy_receipt_read,
  "community_intelligence_retrieval_receipt_version_required",
);
assert.equal(
  stagingAcceptance.adversarial?.legacy_receipt_outcome,
  "community_intelligence_retrieval_receipt_version_required",
);
assert.equal(stagingAcceptance.adversarial?.missing_outcome_node_id, "node_id is required");
assert.equal(
  stagingAcceptance.adversarial?.outcome_for_returned_but_uninjected_node,
  "community_intelligence_retrieval_node_not_injected",
);
assert.equal(stagingAcceptance.deployed_surface?.canonical_receipt_writer_count, 1);
assert.equal(stagingAcceptance.deployed_surface?.canonical_internal_outcome_present, true);
assert.equal(stagingAcceptance.deployed_surface?.public_workflow_retrieval_absent, true);
assert.equal(stagingAcceptance.deployed_surface?.public_receipt_feedback_absent, true);
assert.equal(stagingAcceptance.deployed_surface?.public_general_outcome_absent, true);
assert.equal(stagingAcceptance.cleanup?.fixture_communities_remaining, 0);
assert.equal(stagingAcceptance.cleanup?.fixture_users_remaining, 0);
assert.equal(stagingAcceptance.deployed_surface?.acceptance_function_removed, true);
assert.equal(stagingAcceptance.cleanup?.acceptance_flag_removed, true);

console.log("community_memory_retrieval_receipt_contract_proof: ok");
