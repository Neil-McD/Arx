import assert from "node:assert/strict";
import type { RetrievalToolName } from "../shared/retrievalTools.ts";
import {
  buildRuntimeToolPolicySurface,
  classifyRuntimeToolSchedule,
} from "../shared/runtimeToolPolicy.ts";

const fixedToolNames: RetrievalToolName[] = [
  "polynet_list",
  "polynet_read",
  "polynet_search",
  "search_product_docs",
  "web_research",
  "polynet_write",
];
const surface = buildRuntimeToolPolicySurface({ fixedToolNames });

const parallelReads = classifyRuntimeToolSchedule({
  toolCalls: [
    { providerCallId: "list", toolName: "polynet_list" },
    { providerCallId: "docs", toolName: "search_product_docs" },
    { providerCallId: "web", toolName: "web_research" },
  ],
  policies: surface.policies,
  enableParallelReadBatches: true,
});
assert.equal(parallelReads.decision, "parallel_read_batch_enabled");
assert.equal(parallelReads.executionMode, "parallel_read_batch");
assert.equal(parallelReads.summary.parallelEligible, 3);
assert.equal(parallelReads.summary.mutating, 0);
assert.equal(parallelReads.summary.requiresWorkspace, 0);

const mixed = classifyRuntimeToolSchedule({
  toolCalls: [
    { providerCallId: "read", toolName: "polynet_list" },
    { providerCallId: "write", toolName: "polynet_write" },
    { providerCallId: "unknown", toolName: "missing_tool" },
  ],
  policies: surface.policies,
  enableParallelReadBatches: true,
});
assert.equal(mixed.decision, "serial_execution_enforced");
assert.equal(mixed.executionMode, "serial_batch");
assert.equal(mixed.summary.total, 3);
assert.equal(mixed.summary.parallelEligible, 1);
assert.equal(mixed.summary.exclusive, 2);
assert.equal(mixed.summary.mutating, 2);
assert.equal(mixed.summary.unknown, 1);
assert.equal(mixed.summary.requiresWorkspace, 0);

console.log("runtime_tool_scheduler_proof: ok");
