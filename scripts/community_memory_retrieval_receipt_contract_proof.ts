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

const workflowStart = directory.indexOf(
  "export const retrieveCommunityIntelligenceForWorkflow =",
);
const workflowEnd = directory.indexOf(
  "\nexport async function searchCommunityMemoryCore",
  workflowStart,
);
assert.notEqual(workflowStart, -1);
assert.notEqual(workflowEnd, -1);
const workflowBlock = directory.slice(workflowStart, workflowEnd);
const workflowInsertStart = workflowBlock.indexOf(
  'ctx.db.insert("communityIntelligenceRetrievalLogs"',
);
const workflowInsertEnd = workflowBlock.indexOf(
  "\n    const log =",
  workflowInsertStart,
);
assert.notEqual(workflowInsertStart, -1);
assert.notEqual(workflowInsertEnd, -1);
const workflowInsertBlock = workflowBlock.slice(
  workflowInsertStart,
  workflowInsertEnd,
);
assert.doesNotMatch(
  workflowInsertBlock,
  /\bquery:\s*queryText/,
  "the compatibility workflow retrieval path must also stop persisting raw query text",
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
  /retrievalLog\.communityId[\s\S]*retrievalLog\.userId[\s\S]*retrievalReceiptMatchesSurface/,
  "memory read should bind a provided receipt to community, viewer, and surface",
);
assert.match(
  readBlock,
  /retrievalReceiptContainsNode\(retrievalLog, node\._id\)[\s\S]*community_intelligence_retrieval_node_not_returned/,
  "memory read should reject an accepted but unreturned node",
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

const feedbackBlock = exportedFunctionBlock(
  directory,
  "recordCommunityIntelligenceRetrievalFeedback",
);
assert.match(
  feedbackBlock,
  /retrievalLogBelongsToUser\(log, userId\)[\s\S]*community_intelligence_retrieval_feedback_forbidden/,
  "feedback should require same-viewer receipt ownership",
);
assert.doesNotMatch(
  feedbackBlock,
  /viewerCanManageCommunity|isManager/,
  "manager authority must not bypass feedback receipt ownership",
);

const outcomeCore = directory.slice(
  directory.indexOf("async function recordCommunityOutcomeObservationCore"),
  directory.indexOf("\nexport const recordCommunityOutcomeObservationInternal"),
);
assert.match(
  outcomeCore,
  /retrievalLogBelongsToUser\(retrievalLog, args\.userId\)[\s\S]*community_intelligence_outcome_retrieval_forbidden/,
  "receipt-bound outcomes should require same-viewer ownership for every role",
);
assert.match(
  outcomeCore,
  /receiptSurface[\s\S]*retrievalReceiptMatchesSurface/,
  "surface-bound outcome tools should preserve receipt continuity",
);
assert.match(
  outcomeCore,
  /retrievalNodeIds[\s\S]*community_intelligence_outcome_node_not_retrieved/,
  "node outcomes should remain bound to returned or injected nodes",
);

assert.match(
  cognitionContract,
  /Thirty-Second Implementation Slice: Canonical Retrieval Receipts/,
);
assert.match(
  cognitionContract,
  /New receipts[\s\S]*never persist it|New accepted-memory receipts[\s\S]*never persist/,
);
assert.match(
  mcpContract,
  /same-user, same-community, `external_mcp` retrieval receipt/,
);

assert.equal(
  stagingAcceptance.schema_version,
  "community_memory_retrieval_receipt_staging_acceptance:v1",
);
assert.equal(stagingAcceptance.deployment_kind, "staging");
assert.deepEqual(stagingAcceptance.happy_path?.surfaces, [
  "member_agent_dock",
  "community_concierge",
  "external_mcp",
]);
assert.equal(stagingAcceptance.happy_path?.same_memory_identity_across_surfaces, true);
assert.equal(stagingAcceptance.happy_path?.search_read_same_receipt, true);
assert.equal(stagingAcceptance.happy_path?.raw_query_persisted, false);
assert.deepEqual(stagingAcceptance.happy_path?.feedback_states_recorded, [
  "useful",
  "wrong",
  "stale",
]);
assert.equal(
  stagingAcceptance.adversarial?.unreturned_node_read,
  "community_intelligence_retrieval_node_not_returned",
);
assert.equal(
  stagingAcceptance.adversarial?.cross_surface_read,
  "community_intelligence_retrieval_receipt_surface_mismatch",
);
assert.equal(
  stagingAcceptance.adversarial?.manager_foreign_receipt_read,
  "community_intelligence_retrieval_log_forbidden",
);
assert.equal(
  stagingAcceptance.adversarial?.manager_foreign_receipt_feedback,
  "community_intelligence_retrieval_feedback_forbidden",
);
assert.equal(
  stagingAcceptance.adversarial?.manager_foreign_receipt_outcome,
  "community_intelligence_outcome_retrieval_forbidden",
);
assert.equal(stagingAcceptance.adversarial?.revoked_node_absent_from_search, true);
assert.equal(stagingAcceptance.cleanup?.fixture_communities_remaining, 0);
assert.equal(stagingAcceptance.cleanup?.retrieval_logs_remaining, 0);
assert.equal(stagingAcceptance.cleanup?.acceptance_function_removed, true);
assert.equal(stagingAcceptance.cleanup?.acceptance_flag_removed, true);

console.log("community_memory_retrieval_receipt_contract_proof: ok");
