import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getPolynetMcpToolDefinitions } from "../shared/polynetMcp.ts";
import { POLYNET_CANONICAL_TOOL_NAMES } from "../shared/polynetCanonicalToolContract.ts";

const root = process.cwd();
const read = (path: string): string =>
  readFileSync(join(root, path), "utf8");

const evidenceContract = read("shared/communityEvidenceContract.ts");
const schema = read("convex/schema.ts");
const directory = read("convex/communityIntelligenceDirectory.ts");
const executor = read("convex/polynetCanonicalExecutor.ts");
const runtime = read("convex/runtimeAgentLoop.ts");
const httpMcp = read("convex/httpMcp.ts");
const mcp = read("shared/polynetMcp.ts");
const contract = read("docs/polynet-workspace-mcp-contract-v0.md");

assert.match(
  evidenceContract,
  /COMMUNITY_MEMORY_RETRIEVAL_RECEIPT_VERSION\s*=\s*\n?\s*"community_memory_retrieval_receipt:v1"/,
);
assert.match(
  evidenceContract,
  /COMMUNITY_EVIDENCE_SURFACES = \[[\s\S]*"member_agent_dock"[\s\S]*"external_mcp"[\s\S]*"community_concierge"/,
);

const receiptSchema = schema.slice(
  schema.indexOf("communityIntelligenceRetrievalLogs: defineTable"),
  schema.indexOf("communityOutcomeObservations: defineTable"),
);
assert.match(
  receiptSchema,
  /receiptVersion: v\.optional\(v\.literal\("community_memory_retrieval_receipt:v1"\)\)/,
);
assert.match(receiptSchema, /query: v\.optional\(v\.string\(\)\)/);

assert.equal(
  (directory.match(/insert\("communityIntelligenceRetrievalLogs"/g) ?? [])
    .length,
  1,
  "one canonical helper must own accepted-memory retrieval receipts",
);
assert.match(
  directory,
  /createCommunityMemoryRetrievalReceipt[\s\S]*receiptVersion: COMMUNITY_MEMORY_RETRIEVAL_RECEIPT_VERSION[\s\S]*surface: args\.surface/,
);
assert.doesNotMatch(
  directory,
  /insert\("communityIntelligenceRetrievalLogs"[\s\S]{0,900}\bquery\s*:/,
  "new receipts must not persist raw search text",
);
assert.match(
  directory,
  /requireCanonicalCommunityMemoryReceipt[\s\S]*receipt\.communityId[\s\S]*receipt\.userId[\s\S]*receipt\.surface !== args\.surface/,
  "receipt use must remain bound to community, viewer, and invocation surface",
);
assert.match(
  directory,
  /readCommunityMemoryInternal[\s\S]*requiredNodeState: "returned"/,
);
assert.match(
  directory,
  /recordCommunityOutcomeObservationInternal[\s\S]*deduplicated: result\.deduplicated/,
);
assert.match(
  directory,
  /community_memory_outcome_conflict/,
  "materially different outcome replays must fail closed",
);

assert.deepEqual(
  getPolynetMcpToolDefinitions().map((tool) => tool.name),
  POLYNET_CANONICAL_TOOL_NAMES,
);
assert.match(runtime, /executePolynetCanonicalTool/);
assert.match(
  executor,
  /POLYNET_MEMORY_DIRECTORY_PATH[\s\S]*searchCommunityMemoryInternal/,
);
assert.match(executor, /readCommunityMemoryInternal/);
assert.match(executor, /community\.memory\.record_outcome/);
assert.match(executor, /recordCommunityOutcomeObservationInternal/);
assert.match(executor, /surface: args\.evidenceSurface/);
for (const source of [mcp, httpMcp]) {
  assert.doesNotMatch(
    source,
    /polynet_workspace_memory_|polynet_workspace_record_outcome/,
    "retired memory-specific MCP verbs must be physically absent",
  );
}
assert.match(contract, /community\.memory\.record_outcome/);

console.log("community_memory_retrieval_receipt_contract_proof: ok");
