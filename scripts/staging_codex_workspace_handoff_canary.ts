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
    "stagingMaintenance:runCodexWorkspaceHandoffCanaryTurn",
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

assert(result?.run?.ok === true, "Codex workspace handoff canary turn should succeed");
assert(
  result?.run?.response?.markerPresent === true,
  "Codex workspace handoff canary should return the expected marker",
);

const evidenceRun = Array.isArray(result?.evidence?.runs)
  ? result.evidence.runs[0]
  : null;
assert(Boolean(evidenceRun), "workspace handoff evidence should include the run");

const prepared = findEvent(evidenceRun, "runtime_agent_harness_prepared");
const handoffStarted = findEvent(evidenceRun, "codex_workspace_handoff_started");
const handoffCompleted = findEvent(evidenceRun, "codex_workspace_handoff_completed");
const codexPrimaryCompleted = findEvent(evidenceRun, "codex_harness_primary_completed");
const fallbackStarted = findEvent(evidenceRun, "runtime_agent_harness_fallback_started");

assert(
  prepared?.payload?.harness_id === "polynet_native",
  "workspace handoff canary should start in PolyNet native",
);
assert(
  prepared?.payload?.execution_placement === "convex_action",
  "workspace handoff canary should not pre-route the turn to a Daytona-sidecar harness",
);
assert(Boolean(handoffStarted), "workspace handoff should emit start evidence");
assert(
  handoffStarted?.payload?.execution_placement === "daytona_sidecar",
  "workspace handoff should target the Daytona sidecar placement",
);
assert(
  handoffCompleted?.payload?.status === "ok",
  "workspace handoff should complete successfully",
);
assert(
  Number(handoffCompleted?.payload?.output_chars ?? 0) > 0,
  "workspace handoff should return Codex output",
);
assert(
  codexPrimaryCompleted?.payload?.stage === "completed" ||
    codexPrimaryCompleted?.payload?.status === "ok" ||
    Number(codexPrimaryCompleted?.payload?.stdout_chars ?? 0) > 0,
  "workspace handoff should execute the Codex app-server harness",
);
assert(!fallbackStarted, "workspace handoff canary should not start PolyNet fallback");

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
        prepared: prepared?.payload ?? null,
        handoffStarted: handoffStarted?.payload ?? null,
        handoffCompleted: handoffCompleted?.payload ?? null,
        codexPrimaryCompleted: codexPrimaryCompleted?.payload ?? null,
      },
    },
    null,
    2,
  ),
);
