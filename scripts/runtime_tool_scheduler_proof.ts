import assert from "node:assert/strict";
import type { RetrievalToolName } from "../shared/retrievalTools.ts";
import {
  buildRuntimeToolPolicySurface,
  classifyRuntimeToolSchedule,
} from "../shared/runtimeToolPolicy.ts";

function fixedToolNames(names: string[]): RetrievalToolName[] {
  return names as RetrievalToolName[];
}

const readOnlySurface = buildRuntimeToolPolicySurface({
  fixedToolNames: fixedToolNames(["read", "grep", "web_research"]),
  includeResolver: false,
  resolverToolName: "resolve_mounted_tools",
  mountedTools: [],
});
const readOnlyBatch = classifyRuntimeToolSchedule({
  toolCalls: [
    { providerCallId: "call_read", toolName: "read" },
    { providerCallId: "call_grep", toolName: "grep" },
    { providerCallId: "call_web", toolName: "web_research" },
  ],
  policies: readOnlySurface.policies,
});
assert.equal(readOnlyBatch.decision, "serial_execution_enforced");
assert.equal(readOnlyBatch.executionMode, "serial_batch");
assert.equal(readOnlyBatch.reason, "parallel_capable_batch_serialized");
assert.equal(readOnlyBatch.summary.total, 3);
assert.equal(readOnlyBatch.summary.parallelEligible, 3);
assert.deepEqual(
  readOnlyBatch.calls.map((call) => call.reasons),
  [
    ["parallel_safe_read_only"],
    ["parallel_safe_read_only"],
    ["parallel_safe_read_only"],
  ],
);

const parallelReadOnlyBatch = classifyRuntimeToolSchedule({
  toolCalls: [
    { providerCallId: "call_read", toolName: "read" },
    { providerCallId: "call_grep", toolName: "grep" },
    { providerCallId: "call_web", toolName: "web_research" },
  ],
  policies: readOnlySurface.policies,
  enableParallelReadBatches: true,
});
assert.equal(parallelReadOnlyBatch.decision, "parallel_read_batch_enabled");
assert.equal(parallelReadOnlyBatch.executionMode, "parallel_read_batch");
assert.equal(parallelReadOnlyBatch.reason, "parallel_read_batch_enabled");
assert.equal(parallelReadOnlyBatch.summary.parallelEligible, 3);

const mixedSurface = buildRuntimeToolPolicySurface({
  fixedToolNames: fixedToolNames([
    "read",
    "write",
    "terminal_read",
    "computer_screenshot",
  ]),
  includeResolver: true,
  resolverToolName: "resolve_mounted_tools",
  mountedTools: [],
});
const mixedBatch = classifyRuntimeToolSchedule({
  toolCalls: [
    { providerCallId: "call_read", toolName: "read" },
    { providerCallId: "call_write", toolName: "write" },
    { providerCallId: "call_terminal", toolName: "terminal_read" },
    { providerCallId: "call_computer", toolName: "computer_screenshot" },
    { providerCallId: "call_missing", toolName: "missing_tool" },
  ],
  policies: mixedSurface.policies,
});
assert.equal(mixedBatch.reason, "contains_non_parallel_tools");
assert.equal(mixedBatch.executionMode, "serial_batch");
assert.equal(mixedBatch.summary.total, 5);
assert.equal(mixedBatch.summary.parallelEligible, 1);
assert.equal(mixedBatch.summary.exclusive, 4);
assert.equal(mixedBatch.summary.unknown, 1);
assert.equal(mixedBatch.summary.mutating, 2);
assert.equal(mixedBatch.summary.requiresApproval, 2);
assert.equal(mixedBatch.summary.requiresWorkspace, 4);
assert.deepEqual(
  mixedBatch.calls.find((call) => call.toolName === "write")?.reasons,
  [
    "exclusive_tool",
    "mutates_state",
    "not_read_only",
    "not_parallel_safe",
    "requires_approval",
  ],
);
assert.deepEqual(
  mixedBatch.calls.find((call) => call.toolName === "terminal_read")?.reasons,
  ["exclusive_tool", "not_parallel_safe"],
);
assert.deepEqual(
  mixedBatch.calls.find((call) => call.toolName === "missing_tool")?.reasons,
  [
    "unknown_policy",
    "exclusive_tool",
    "mutates_state",
    "not_read_only",
    "not_parallel_safe",
    "requires_approval",
  ],
);

const mcpSurface = buildRuntimeToolPolicySurface({
  fixedToolNames: fixedToolNames([]),
  includeResolver: false,
  resolverToolName: "resolve_mounted_tools",
  mountedTools: [
    {
      scope: "community",
      runtime_tool_name: "community__slack_search",
      risk_level: "read",
    },
  ],
});
const mcpBatch = classifyRuntimeToolSchedule({
  toolCalls: [
    {
      providerCallId: "call_mcp",
      toolName: "community__slack_search",
      index: 7,
    },
  ],
  policies: mcpSurface.policies,
});
assert.equal(mcpBatch.reason, "single_tool_call_serialized");
assert.equal(mcpBatch.executionMode, "serial_batch");
assert.equal(mcpBatch.summary.parallelEligible, 0);
assert.equal(mcpBatch.summary.exclusive, 1);
assert.equal(mcpBatch.summary.requiresCommunity, 1);
assert.equal(mcpBatch.summary.requiresMcpSession, 1);
assert.equal(mcpBatch.calls[0]?.index, 7);
assert.deepEqual(mcpBatch.calls[0]?.reasons, [
  "exclusive_tool",
  "not_parallel_safe",
  "requires_mcp_session",
]);

console.log("runtime tool scheduler proof passed");
