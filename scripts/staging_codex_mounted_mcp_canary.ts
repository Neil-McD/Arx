import {
  assert,
  buildMaintenancePayload,
  convexRunJson,
  parseCommonOptions,
  readFlag,
  withMaintenanceToken,
} from "./staging_maintenance_cli.ts";

const options = parseCommonOptions();
const ownerId = readFlag("--owner-id");
const threadKey = readFlag("--thread-key");
const runtimeToolName =
  readFlag("--runtime-tool-name") ??
  "me__polynet_staging_canary__read_canary_record";

function eventsOfType(run: any, eventType: string): any[] {
  return Array.isArray(run?.events)
    ? run.events.filter((event: any) => event?.eventType === eventType)
    : [];
}

function findEvent(run: any, eventType: string): any | null {
  return eventsOfType(run, eventType)[0] ?? null;
}

function successfulDynamicToolNames(run: any): string[] {
  const names = new Set<string>();
  for (const event of [
    ...eventsOfType(run, "codex_harness_dynamic_tool_bridge_call_finished"),
    ...eventsOfType(run, "codex_harness_primary_dynamic_tool_event"),
  ]) {
    if (event?.payload?.success !== true) continue;
    const name = String(event?.payload?.tool_name ?? "").trim();
    if (name) names.add(name);
  }
  return [...names].sort();
}

const result = withMaintenanceToken(options, (token) => {
  const run = convexRunJson(
    options,
    "stagingMaintenance:runCodexMountedMcpCanaryTurn",
    buildMaintenancePayload(options, token, {
      ownerId: ownerId ?? undefined,
      threadKey: threadKey ?? undefined,
      nowMs: Date.now(),
    }),
  );
  const evidence = convexRunJson(
    options,
    "stagingMaintenance:getCodexThreadBindingCanaryEvidence",
    buildMaintenancePayload(options, token, {
      ownerId: ownerId ?? undefined,
      runId: run?.runId,
      limit: 1,
    }),
  );
  return { run, evidence };
});

assert(result?.run?.ok === true, "mounted MCP Codex canary turn should succeed");
assert(
  result?.run?.mount?.runtimeToolName === runtimeToolName,
  "mounted MCP canary should seed the expected runtime tool name",
);

const evidenceRun = Array.isArray(result?.evidence?.runs)
  ? result.evidence.runs[0]
  : null;
assert(Boolean(evidenceRun), "mounted MCP canary evidence should include the run");

const prepared = findEvent(evidenceRun, "runtime_agent_harness_prepared");
const handoffStarted = findEvent(evidenceRun, "codex_workspace_handoff_started");
const handoffCompleted = findEvent(evidenceRun, "codex_workspace_handoff_completed");
const projection = findEvent(evidenceRun, "codex_mcp_projection_resolved");
const primaryStarted = findEvent(evidenceRun, "codex_harness_primary_started");
const mcpExecution = eventsOfType(evidenceRun, "mcp_tool_execution_completed")
  .find((event: any) => event?.payload?.runtime_tool_name === runtimeToolName);
const successfulTools = successfulDynamicToolNames(evidenceRun);

assert(
  prepared?.payload?.harness_id === "polynet_native",
  "mounted MCP canary should start in PolyNet native before the Codex handoff",
);
assert(Boolean(handoffStarted), "mounted MCP canary should enter Codex through codex_workspace");
assert(
  handoffCompleted?.payload?.status === "ok",
  "mounted MCP canary codex_workspace handoff should complete successfully",
);
assert(
  Array.isArray(projection?.payload?.eligible_runtime_tool_names) &&
    projection.payload.eligible_runtime_tool_names.includes(runtimeToolName),
  "Codex MCP projection should mark the staging mounted MCP tool eligible",
);
assert(
  Array.isArray(primaryStarted?.payload?.dynamic_mcp_tool_active_names) &&
    primaryStarted.payload.dynamic_mcp_tool_active_names.includes(runtimeToolName),
  "Codex handoff harness should activate the staging mounted MCP dynamic tool",
);
assert(
  successfulTools.includes(runtimeToolName),
  "Codex should successfully call the staging mounted MCP dynamic tool",
);
assert(
  successfulTools.includes("get_active_community_context") &&
    successfulTools.includes("community_search"),
  "Codex should still successfully call both PolyNet read-only platform tools",
);
assert(
  mcpExecution?.payload?.status === "ok" &&
    mcpExecution?.payload?.error_code == null,
  "PolyNet runtime MCP manager should execute the staging tool successfully",
);

console.log(
  JSON.stringify(
    {
      ok: true,
      deploymentName: options.deploymentName,
      stagingUrl: options.stagingUrl,
      run: result.run,
      evidence: {
        runId: evidenceRun.runId,
        status: evidenceRun.status,
        prepared: prepared?.payload ?? null,
        handoffStarted: handoffStarted?.payload ?? null,
        handoffCompleted: handoffCompleted?.payload ?? null,
        projection: projection?.payload ?? null,
        primaryStarted: primaryStarted?.payload ?? null,
        successfulDynamicToolNames: successfulTools,
        mcpExecution: mcpExecution?.payload ?? null,
      },
    },
    null,
    2,
  ),
);
