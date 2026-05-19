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
    "stagingMaintenance:runCodexPrimaryStreamingCanaryTurn",
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

assert(result?.run?.ok === true, "Codex primary streaming canary turn should succeed");

const sse = result?.run?.response?.sse ?? {};
assert(Number(sse.deltaEventCount ?? 0) > 0, "streaming canary should emit SSE delta events");
assert(Number(sse.deltaChars ?? 0) > 0, "streaming canary should emit non-empty assistant deltas");
assert(Number(sse.doneEventCount ?? 0) === 1, "streaming canary should emit one done event");
assert(Number(sse.errorEventCount ?? 0) === 0, "streaming canary should not emit SSE error events");
assert(
  Number(sse.doneFullContentChars ?? 0) > 0,
  "streaming canary should include final full content in the done event",
);

const evidenceRun = Array.isArray(result?.evidence?.runs)
  ? result.evidence.runs[0]
  : null;
assert(Boolean(evidenceRun), "streaming canary evidence should include the run");

const selected = findEvent(evidenceRun, "runtime_agent_harness_selected");
const primaryCompleted = findEvent(evidenceRun, "codex_harness_primary_completed");
const streamSummary = findEvent(evidenceRun, "codex_harness_stream_event_summary");
const fallbackStarted = findEvent(evidenceRun, "runtime_agent_harness_fallback_started");
const fallbackSkipped = findEvent(evidenceRun, "runtime_agent_harness_fallback_skipped");

assert(
  selected?.payload?.selected_harness_id === "codex_app_server",
  "streaming canary should select the Codex app-server harness",
);
assert(selected?.payload?.stream === true, "streaming canary should run as a streaming turn");
assert(
  selected?.payload?.codex_primary_streaming_enabled === true,
  "streaming canary should prove the primary streaming rollout flag is enabled",
);
assert(
  primaryCompleted?.payload?.status === "ok",
  "Codex primary streaming canary should complete successfully",
);
assert(
  Number(primaryCompleted?.payload?.live_stream_delta_events ?? 0) > 0,
  "Codex primary completion should record live stream delta relay events",
);
assert(
  Number(primaryCompleted?.payload?.live_stream_delta_chars ?? 0) > 0,
  "Codex primary completion should record live stream delta chars",
);
assert(
  Number(primaryCompleted?.payload?.live_stream_delta_emit_failures ?? 0) === 0,
  "Codex primary completion should not record live stream delta emit failures",
);
assert(
  Number(primaryCompleted?.payload?.stream_event_count ?? 0) > 0,
  "Codex primary completion should record parsed stream events",
);
assert(
  streamSummary?.payload?.raw_delta_storage_policy ===
    "assistant_delta_live_only_audit_metadata_only",
  "stream summary should document live-only raw delta handling",
);
assert(
  Number(streamSummary?.payload?.assistant_delta_events ?? 0) > 0,
  "stream summary should record assistant delta events",
);
assert(
  Number(streamSummary?.payload?.assistant_delta_chars ?? 0) > 0,
  "stream summary should record assistant delta chars",
);
assert(!fallbackStarted, "streaming canary should not start PolyNet-native fallback");
assert(
  !fallbackSkipped || fallbackSkipped?.payload?.skipped_reason === "visible_output_started",
  "if fallback is skipped, it should be because visible Codex output had started",
);

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
        sse,
      },
      evidence: {
        runId: evidenceRun.runId,
        status: evidenceRun.status,
        selected: selected?.payload ?? null,
        primaryCompleted: primaryCompleted?.payload ?? null,
        streamSummary: streamSummary?.payload ?? null,
        fallbackSkipped: fallbackSkipped?.payload ?? null,
      },
    },
    null,
    2,
  ),
);
