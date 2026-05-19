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

function eventsOfType(run: any, eventType: string): any[] {
  return Array.isArray(run?.events)
    ? run.events.filter((event: any) => event?.eventType === eventType)
    : [];
}

function findEvent(run: any, eventType: string): any | null {
  return eventsOfType(run, eventType)[0] ?? null;
}

const result = withMaintenanceToken(options, (token) => {
  const run = convexRunJson(
    options,
    "stagingMaintenance:runNativeDefaultHarnessCanaryTurn",
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
      compact: true,
    }),
  );
  return { run, evidence };
});

assert(result?.run?.ok === true, "native default harness canary turn should succeed");
assert(
  result?.run?.response?.markerPresent === true,
  "native default harness canary should return the expected marker",
);

const evidenceRun = Array.isArray(result?.evidence?.runs)
  ? result.evidence.runs[0]
  : null;
assert(Boolean(evidenceRun), "native default harness evidence should include the run");

const selected = findEvent(evidenceRun, "runtime_agent_harness_selected");
const prepared = findEvent(evidenceRun, "runtime_agent_harness_prepared");
const codexPrimaryStarted = findEvent(evidenceRun, "codex_harness_primary_started");
const codexPrimaryCompleted = findEvent(evidenceRun, "codex_harness_primary_completed");
const codexProbeStarted = findEvent(evidenceRun, "codex_harness_probe_started");
const codexProbeCompleted = findEvent(evidenceRun, "codex_harness_probe_completed");
const workspaceStarted = findEvent(evidenceRun, "workspace_session_create_started");
const workspaceCompleted = findEvent(evidenceRun, "workspace_session_create_completed");

assert(
  selected?.payload?.selected_harness_id === "polynet_native",
  "plain default canary should select the PolyNet native harness",
);
assert(
  selected?.payload?.codex_route_selected === false,
  "plain default canary should not select the Codex route",
);
assert(
  prepared?.payload?.codex_primary_canary?.forcePolyNetReadOnlyDynamicTools !== true,
  "plain default canary should not set the explicit Codex primary canary flag",
);
assert(!codexPrimaryStarted, "plain default canary should not start Codex primary");
assert(!codexPrimaryCompleted, "plain default canary should not complete Codex primary");
assert(!codexProbeStarted, "plain default canary should not start a Codex probe");
assert(!codexProbeCompleted, "plain default canary should not complete a Codex probe");
assert(!workspaceStarted, "plain default canary should not start a Daytona workspace");
assert(!workspaceCompleted, "plain default canary should not complete Daytona workspace startup");

console.log(
  JSON.stringify(
    {
      ok: true,
      deploymentName: options.deploymentName,
      stagingUrl: options.stagingUrl,
      run: {
        runId: result.run.runId,
        status: result.run.status,
        latencyMs: result.run.latencyMs,
        response: result.run.response,
      },
      evidence: {
        runId: evidenceRun.runId,
        status: evidenceRun.status,
        selected: selected?.payload ?? null,
        prepared: prepared?.payload ?? null,
      },
    },
    null,
    2,
  ),
);
