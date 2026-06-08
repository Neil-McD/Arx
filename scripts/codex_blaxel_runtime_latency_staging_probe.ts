import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";

const EXPECTED_CONVEX_DEPLOYMENT = "dev:quick-porcupine-949";

type RuntimeEvent = {
  seq: number;
  eventType: string;
  createdAt: number;
};

type ProbeResult = {
  ok?: boolean;
  reason?: string;
  thread?: {
    threadKey?: string | null;
    latestUserVisibleCompletedRunId?: string | null;
  } | null;
  run?: {
    runId: string;
    status: string;
    modelId?: string | null;
    engineId?: string | null;
    executionMode?: string | null;
    sandboxMode?: string | null;
    harnessProfile?: string | null;
    startedAt: number;
    finishedAt?: number | null;
  } | null;
  events?: RuntimeEvent[];
  providerCost?: {
    costKey: string;
    component: string;
    billingDisposition: string;
    rawVendorCostUsd: number;
    metadata?: Record<string, unknown> | null;
  } | null;
};

type UiTiming = {
  runId?: string;
  sendAtMs?: number;
  sentAtMs?: number;
  clickSendAtMs?: number;
  firstVisibleTokenAtMs?: number;
  firstAssistantVisibleAtMs?: number;
  finishVisibleAtMs?: number;
  composerRestoredAtMs?: number;
};

function usage() {
  return [
    "Usage:",
    "  npm run probe:codex-blaxel-runtime-latency-staging -- --thread-key <threadKey>",
    "  npm run probe:codex-blaxel-runtime-latency-staging -- --run-id <agent_web:...>",
    "",
    "Optional:",
    "  --ui-timings-file <path>",
    "  --ui-timings-json <json>",
  ].join("\n");
}

function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

function fail(reason: string, includeUsage = false): never {
  printJson({ ok: false, reason, ...(includeUsage ? { usage: usage() } : null) });
  process.exit(1);
}

function flagValue(argv: string[], name: string): string {
  const equalsPrefix = `${name}=`;
  const equalsMatch = argv.find((arg) => arg.startsWith(equalsPrefix));
  if (equalsMatch) return equalsMatch.slice(equalsPrefix.length).trim();
  const index = argv.indexOf(name);
  if (index < 0) return "";
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${name.slice(2).replaceAll("-", "_")}_value_required`, true);
  return value.trim();
}

function parseJsonFromConvex(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error("convex_run_returned_empty_stdout");
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1));
    throw new Error("convex_run_returned_non_json_stdout");
  }
}

function readUiTiming(argv: string[]): UiTiming | null {
  const inline = flagValue(argv, "--ui-timings-json");
  const file = flagValue(argv, "--ui-timings-file");
  if (inline && file) fail("use_ui_timings_json_or_file_not_both", true);
  const raw = inline || (file ? readFileSync(file, "utf8") : "");
  return raw.trim() ? (JSON.parse(raw) as UiTiming) : null;
}

function buildQuery(params: { threadKey?: string; runId?: string }) {
  return `
const params = ${JSON.stringify(params)};
let thread = null;
let run = null;

if (params.threadKey) {
  const threads = await ctx.db
    .query("threads")
    .filter((q) => q.eq(q.field("threadKey"), params.threadKey))
    .take(2);
  thread = threads[0] || null;
  if (thread) {
    const runs = await ctx.db
      .query("runtimeRuns")
      .withIndex("by_thread_startedAt", (q) => q.eq("threadId", thread._id))
      .order("desc")
      .take(20);
    run = params.runId
      ? runs.find((row) => row.runId === params.runId) || null
      : runs.find((row) => row.runId === thread.latestUserVisibleCompletedRunId) || runs[0] || null;
  }
}

if (!run && params.runId) {
  const runs = await ctx.db
    .query("runtimeRuns")
    .filter((q) => q.eq(q.field("runId"), params.runId))
    .take(2);
  run = runs[0] || null;
  if (run && !thread) thread = await ctx.db.get(run.threadId);
}

if (!thread && params.threadKey) return { ok: false, reason: "thread_not_found" };
if (!run) return { ok: false, reason: "runtime_run_not_found" };

const events = await ctx.db
  .query("runtimeRunEvents")
  .withIndex("by_thread_run_seq", (q) => q.eq("threadId", run.threadId).eq("runId", run.runId))
  .order("asc")
  .take(500);

const providerCost = await ctx.db
  .query("providerCostEntries")
  .withIndex("by_costKey", (q) => q.eq("costKey", "codex_blaxel_runtime:" + run.runId + ":provider_cost"))
  .unique();

return {
  ok: true,
  thread: thread ? {
    threadKey: thread.threadKey || null,
    latestUserVisibleCompletedRunId: thread.latestUserVisibleCompletedRunId || null,
  } : null,
  run: {
    runId: run.runId,
    status: run.status,
    modelId: run.modelId || null,
    engineId: run.engineId || null,
    executionMode: run.executionMode || null,
    sandboxMode: run.sandboxMode || null,
    harnessProfile: run.harnessProfile || null,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt || null,
  },
  events: events.map((event) => ({
    seq: event.seq,
    eventType: event.eventType,
    createdAt: event.createdAt,
  })),
  providerCost: providerCost ? {
    costKey: providerCost.costKey,
    component: providerCost.component,
    billingDisposition: providerCost.billingDisposition,
    rawVendorCostUsd: providerCost.rawVendorCostUsd,
    metadata: providerCost.metadata || null,
  } : null,
};
`;
}

function runConvexQuery(threadKey: string, runId: string): ProbeResult {
  const deployment = String(process.env.CONVEX_DEPLOYMENT ?? "").trim();
  if (deployment !== EXPECTED_CONVEX_DEPLOYMENT) {
    fail(`CONVEX_DEPLOYMENT must be ${EXPECTED_CONVEX_DEPLOYMENT}`);
  }

  const result = spawnSync(
    "npx",
    [
      "convex",
      "run",
      "--deployment",
      deployment.replace(/^dev:/, ""),
      "--typecheck",
      "disable",
      "--codegen",
      "disable",
      "--inline-query",
      buildQuery({ threadKey: threadKey || undefined, runId: runId || undefined }),
    ],
    { cwd: process.cwd(), encoding: "utf8", env: process.env },
  );

  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    fail(`convex_inline_query_failed_${result.status ?? "unknown"}`);
  }
  return parseJsonFromConvex(result.stdout) as ProbeResult;
}

function first(events: RuntimeEvent[], eventType: string): number | null {
  return events.find((event) => event.eventType === eventType)?.createdAt ?? null;
}

function last(events: RuntimeEvent[], eventType: string): number | null {
  return [...events].reverse().find((event) => event.eventType === eventType)?.createdAt ?? null;
}

function numberValue(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function uiValue(ui: UiTiming | null, keys: Array<keyof UiTiming>): number | null {
  if (!ui) return null;
  for (const key of keys) {
    const value = numberValue(ui[key]);
    if (value !== null) return value;
  }
  return null;
}

function duration(start: number | null, end: number | null): number | null {
  return start !== null && end !== null ? Math.max(0, Math.round(end - start)) : null;
}

function phase(name: string, start: number | null, end: number | null, source: string) {
  return {
    name,
    durationMs: duration(start, end),
    status: start !== null && end !== null ? "ok" : "missing",
    source,
  };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    return;
  }

  const threadKey =
    flagValue(argv, "--thread-key") || String(process.env.POLYNET_CODEX_LATENCY_THREAD_KEY ?? "").trim();
  const runId = flagValue(argv, "--run-id") || String(process.env.POLYNET_CODEX_LATENCY_RUN_ID ?? "").trim();
  if (!threadKey && !runId) fail("thread_key_or_run_id_required", true);

  const ui = readUiTiming(argv);
  const data = runConvexQuery(threadKey, runId);
  if (data.ok !== true || !data.run) fail(data.reason ?? "convex_probe_not_ok");

  const run = data.run;
  const events = data.events ?? [];
  const metadata = data.providerCost?.metadata ?? {};

  const marks = {
    runStarted: first(events, "run_started") ?? run.startedAt,
    sandboxEnsureStarted: first(events, "codex_sandbox_ensure_started"),
    sandboxEnsureCompleted: first(events, "codex_sandbox_ensure_completed"),
    appServerLaunchRequested: first(events, "codex_app_server_launch_requested"),
    bridgeStarted: first(events, "codex_app_server_runtime_bridge_started"),
    appServerInitialized: first(events, "codex_app_server_initialized"),
    accountLoginSucceeded: first(events, "codex_account_login_succeeded"),
    accountReadSucceeded: first(events, "codex_account_read_succeeded"),
    codexTurnStarted: first(events, "codex_turn_started"),
    firstTextDelta: first(events, "assistant_text_delta"),
    codexTurnCompleted: last(events, "codex_turn_completed"),
    runFinished: last(events, "run_finished") ?? run.finishedAt ?? null,
    providerSandboxStarted: numberValue(metadata.sandbox_started_at),
    providerSandboxFinished: numberValue(metadata.sandbox_finished_at),
    uiSend: uiValue(ui, ["sendAtMs", "sentAtMs", "clickSendAtMs"]),
    uiFirstToken: uiValue(ui, ["firstVisibleTokenAtMs", "firstAssistantVisibleAtMs"]),
    uiFinish: uiValue(ui, ["finishVisibleAtMs", "composerRestoredAtMs"]),
  };

  const counts = events.reduce<Record<string, number>>((acc, event) => {
    acc[event.eventType] = (acc[event.eventType] ?? 0) + 1;
    return acc;
  }, {});

  const failures: string[] = [];
  if (run.status !== "ok") failures.push(`runtime_run_status_${run.status}`);
  if (!marks.runFinished) failures.push("run_finished_missing");
  if (!marks.firstTextDelta) failures.push("assistant_text_delta_missing");
  if (!data.providerCost) failures.push("provider_cost_missing");
  if (data.providerCost?.component !== "blaxel_active_runtime") failures.push("provider_cost_component_mismatch");
  if (data.providerCost?.billingDisposition !== "tracked_only") {
    failures.push("provider_cost_billing_disposition_not_tracked_only");
  }
  if (metadata.pricing_policy !== "codex_blaxel_runtime_v1") failures.push("provider_cost_pricing_policy_mismatch");
  if (metadata.destroyed_after_run !== true) failures.push("sandbox_destroyed_after_run_missing");
  if (metadata.sandbox_destroy_succeeded !== true) failures.push("sandbox_destroy_succeeded_missing");
  if (ui?.runId && ui.runId !== run.runId) failures.push("ui_timings_run_id_mismatch");

  const phases = [
    phase("run_started_to_sandbox_ensure_start", marks.runStarted, marks.sandboxEnsureStarted, "convex"),
    phase("sandbox_ensure", marks.sandboxEnsureStarted, marks.sandboxEnsureCompleted, "convex"),
    phase("app_server_launch_to_bridge_started", marks.appServerLaunchRequested, marks.bridgeStarted, "convex"),
    phase("bridge_started_to_app_server_initialized", marks.bridgeStarted, marks.appServerInitialized, "convex"),
    phase("codex_auth_login_to_account_read", marks.accountLoginSucceeded, marks.accountReadSucceeded, "convex"),
    phase("run_started_to_first_text_delta", marks.runStarted, marks.firstTextDelta, "convex"),
    phase("codex_turn_start_to_first_text_delta", marks.codexTurnStarted, marks.firstTextDelta, "convex"),
    phase("first_text_delta_to_turn_completed", marks.firstTextDelta, marks.codexTurnCompleted, "convex"),
    phase("turn_completed_to_run_finished", marks.codexTurnCompleted, marks.runFinished, "convex"),
    phase("end_to_end_persisted_run", marks.runStarted, marks.runFinished, "convex"),
    phase("post_run_cleanup_until_provider_cost_end", marks.runFinished, marks.providerSandboxFinished, "provider_cost"),
    phase("metered_provider_runtime", marks.providerSandboxStarted, marks.providerSandboxFinished, "provider_cost"),
    phase("ui_send_to_convex_run_started", marks.uiSend, marks.runStarted, "ui+convex"),
    phase("ui_send_to_first_visible_token", marks.uiSend, marks.uiFirstToken, "ui"),
    phase("backend_first_text_delta_to_ui_first_visible_token", marks.firstTextDelta, marks.uiFirstToken, "ui+convex"),
    phase("backend_run_finished_to_ui_finish", marks.runFinished, marks.uiFinish, "ui+convex"),
  ];

  printJson({
    ok: failures.length === 0,
    probe: "codex_blaxel_runtime_latency_staging_probe",
    deployment: EXPECTED_CONVEX_DEPLOYMENT,
    failures,
    blindSpots: ui ? [] : ["No UI timing JSON supplied; UI phases are intentionally missing."],
    run: {
      runId: run.runId,
      threadKey: data.thread?.threadKey ?? null,
      status: run.status,
      modelId: run.modelId ?? null,
      engineId: run.engineId ?? null,
      executionMode: run.executionMode ?? null,
      sandboxMode: run.sandboxMode ?? null,
      harnessProfile: run.harnessProfile ?? null,
      eventCount: events.length,
      assistantTextDeltaCount: counts.assistant_text_delta ?? 0,
      toolCallStartedCount: counts.tool_call_started ?? 0,
      toolCallFinishedCount: counts.tool_call_finished ?? 0,
    },
    providerCost: data.providerCost
      ? {
          component: data.providerCost.component,
          billingDisposition: data.providerCost.billingDisposition,
          rawVendorCostUsd: data.providerCost.rawVendorCostUsd,
          pricingPolicy: metadata.pricing_policy ?? null,
          destroyedAfterRun: metadata.destroyed_after_run ?? null,
          sandboxDestroySucceeded: metadata.sandbox_destroy_succeeded ?? null,
        }
      : null,
    marksIso: Object.fromEntries(
      Object.entries(marks).map(([key, value]) => [
        key,
        typeof value === "number" && Number.isFinite(value) ? new Date(value).toISOString() : null,
      ]),
    ),
    phases,
    eventCountsByType: counts,
  });

  if (failures.length > 0) process.exit(1);
}

main();
