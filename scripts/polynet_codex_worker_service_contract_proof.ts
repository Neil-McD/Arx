import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

type JsonRecord = Record<string, unknown>;

const args = new Set(process.argv.slice(2));
const requireLive = args.has("--require-live");
const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const runnerPath = path.join(rootDir, "scripts/run_polynet_codex_worker_service_local.sh");
const blaxelToolSource = readFileSync(
  path.join(rootDir, "services/polynet-codex-worker/src/blaxelTool.ts"),
  "utf8",
);
const port = readIntegerEnv("POLYNET_CODEX_WORKER_PROOF_PORT", 8800 + Math.floor(Math.random() * 500));
const authToken = `polynet-worker-proof-${randomUUID()}`;
const serviceUrl = `http://127.0.0.1:${port}`;
const stdoutTail: string[] = [];
const stderrTail: string[] = [];

function readIntegerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(String(process.env[name] ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pushTail(target: string[], text: string): void {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    target.push(trimmed);
    while (target.length > 80) target.shift();
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function serviceEvents(): JsonRecord[] {
  return stdoutTail.flatMap((line) => {
    try {
      const parsed = asRecord(JSON.parse(line));
      return parsed?.kind === "polynet_codex_worker_service_event" ? [parsed] : [];
    } catch {
      return [];
    }
  });
}

assert.match(
  blaxelToolSource,
  /resolveBlaxelWorkspaceComputerIfReady[\s\S]*params\.requireExisting === true[\s\S]*ensureBlaxelWorkspaceComputer/,
  "provided project sandboxes must be adopted/resolved by the worker, not recreated from Fly defaults",
);

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 15_000): Promise<{
  status: number;
  body: JsonRecord;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...(init ?? {}),
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      status: response.status,
      body: asRecord(text ? JSON.parse(text) : {}) ?? {},
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForHealth(proc: ChildProcessWithoutNullStreams, timeoutMs = 120_000): Promise<JsonRecord> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    if (proc.exitCode !== null || proc.signalCode !== null) {
      throw new Error(
        `worker service exited before healthz: code=${proc.exitCode ?? "null"} signal=${proc.signalCode ?? "null"}`,
      );
    }
    try {
      const response = await fetchJson(
        `${serviceUrl}/healthz`,
        { headers: { Authorization: `Bearer ${authToken}` } },
        5000,
      );
      if (response.status === 200) return response.body;
      lastError = `status=${response.status} body=${JSON.stringify(response.body)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error ?? "unknown error");
    }
    await sleep(500);
  }
  throw new Error(`worker service did not become reachable: ${lastError}`);
}

async function runWorkspaceProbe(): Promise<JsonRecord> {
  const response = await fetchJson(
    `${serviceUrl}/v1/workspace/probe`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        run_id: `polynet-worker-service-workspace-proof-${randomUUID().slice(0, 8)}`,
        destroy_after_run: true,
        command: "pwd && echo POLYNET_CODEX_WORKER_SERVICE_PROBE && uname -s",
      }),
    },
    180_000,
  );
  assert.equal(
    response.status,
    200,
    `workspace probe status must be 200: ${JSON.stringify(response.body)}`,
  );
  return response.body;
}

function assertWorkspaceProbeBody(body: JsonRecord): JsonRecord {
  assert.equal(body.ok, true, `workspace probe must succeed: ${JSON.stringify(body)}`);
  assert.equal(body.engine_id, "polynet_codex_worker", "workspace probe engine mismatch");
  assert.equal(body.probe_kind, "workspace", "workspace probe kind mismatch");

  const proof = asRecord(body.proof);
  assert.equal(proof?.ok, true, `workspace proof must pass: ${JSON.stringify(proof)}`);
  assert.deepEqual(asArray(proof?.failures), [], "workspace proof must have no failures");

  const toolCalls = asArray(body.tool_calls);
  assert.equal(toolCalls.length, 1, "workspace probe must execute exactly one workspace command");
  const toolCall = asRecord(toolCalls[0]);
  assert.equal(toolCall?.ok, true, `workspace command must succeed: ${JSON.stringify(toolCall)}`);
  const stdout = String(toolCall?.stdout_preview ?? "");
  assert.ok(
    stdout.includes("POLYNET_CODEX_WORKER_SERVICE_PROBE"),
    `workspace stdout must include probe marker: ${stdout}`,
  );
  assert.ok(stdout.includes("/workspace"), `workspace stdout must include /workspace: ${stdout}`);

  const timing = asRecord(body.timing);
  const buckets = asRecord(timing?.buckets);
  assert.ok(buckets, "workspace probe timing must include buckets");
  for (const key of ["sandbox_ensure_ms", "workspace_exec_ms", "sandbox_destroy_ms"]) {
    assert.equal(typeof buckets[key], "number", `workspace timing bucket missing: ${key}`);
  }

  const eventTypes = asArray(body.events)
    .map((event) => String(asRecord(event)?.event_type ?? ""))
    .filter(Boolean);
  for (const eventType of [
    "workspace_probe_started",
    "sandbox_ensure_started",
    "sandbox_ensure_finished",
    "workspace_exec_requested",
    "workspace_exec_finished",
    "workspace_probe_finished",
    "sandbox_destroy_finished",
  ]) {
    assert.ok(eventTypes.includes(eventType), `workspace event missing: ${eventType}`);
  }
  return buckets;
}

async function assertBusyResponse(): Promise<void> {
  const response = await fetch(`${serviceUrl}/v1/workspace/probe`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      run_id: `polynet-worker-service-busy-proof-${randomUUID().slice(0, 8)}`,
      destroy_after_run: true,
    }),
  });
  const text = await response.text();
  const body = asRecord(text ? JSON.parse(text) : {}) ?? {};
  assert.equal(response.status, 409, `concurrent request must return 409, got ${response.status}: ${text}`);
  assert.equal(response.headers.get("retry-after"), "1", "busy response must include Retry-After: 1");
  assert.equal(body.code, "worker_busy", `busy response code mismatch: ${text}`);
}

async function assertTurnControlEndpointsFailClosed(): Promise<void> {
  const unauthCancel = await fetchJson(`${serviceUrl}/v1/codex/turn/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: "not-a-real-run" }),
  });
  assert.equal(unauthCancel.status, 401, "cancel endpoint must reject missing bearer auth");

  const missingCancelRunId = await fetchJson(`${serviceUrl}/v1/codex/turn/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(missingCancelRunId.status, 400, "cancel endpoint must require run_id");
  assert.equal(missingCancelRunId.body.code, "run_id_required", "cancel missing run_id code mismatch");

  const cancelMismatch = await fetchJson(`${serviceUrl}/v1/codex/turn/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ run_id: "not-a-real-run" }),
  });
  assert.equal(cancelMismatch.status, 409, "cancel with unknown run id must 409");
  assert.equal(cancelMismatch.body.code, "no_matching_turn", "cancel mismatch code");

  const unauthSteer = await fetchJson(`${serviceUrl}/v1/codex/turn/steer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: "not-a-real-run", text: "keep going" }),
  });
  assert.equal(unauthSteer.status, 401, "steer endpoint must reject missing bearer auth");

  const missingSteerText = await fetchJson(`${serviceUrl}/v1/codex/turn/steer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ run_id: "not-a-real-run" }),
  });
  assert.equal(missingSteerText.status, 400, "steer endpoint must require run_id and text");
  assert.equal(missingSteerText.body.code, "run_id_and_text_required", "steer missing text code mismatch");

  const steerMismatch = await fetchJson(`${serviceUrl}/v1/codex/turn/steer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ run_id: "not-a-real-run", text: "keep going" }),
  });
  assert.equal(steerMismatch.status, 409, "steer with unknown run id must 409");
  assert.equal(steerMismatch.body.code, "no_matching_turn", "steer mismatch code");
}

async function assertBusyWhileWorkspaceProbeInFlight(): Promise<void> {
  const blockingProbe = fetchJson(
    `${serviceUrl}/v1/workspace/probe`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        run_id: `polynet-worker-service-blocking-proof-${randomUUID().slice(0, 8)}`,
        destroy_after_run: true,
        command: "pwd && echo POLYNET_CODEX_WORKER_SERVICE_PROBE && uname -s && sleep 8",
      }),
    },
    180_000,
  );

  await sleep(2_000);
  await assertBusyResponse();

  const response = await blockingProbe;
  assert.equal(response.status, 200, `blocking workspace probe must finish: ${JSON.stringify(response.body)}`);
  assert.equal(response.body.ok, true, `blocking workspace probe must succeed: ${JSON.stringify(response.body)}`);
}

async function stopService(proc: ChildProcessWithoutNullStreams): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  proc.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL");
      resolve();
    }, 2500);
    proc.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function main() {
  const codexHome = await mkdtemp(path.join(tmpdir(), "polynet-codex-worker-proof-"));
  const proc = spawn("bash", [runnerPath], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(port),
      POLYNET_CODEX_WORKER_AUTH_TOKEN: authToken,
      POLYNET_CODEX_WORKER_CODEX_HOME: codexHome,
      POLYNET_CODEX_WORKER_DESTROY_AFTER_RUN: "true",
      POLYNET_CODEX_WORKER_COMMAND_TIMEOUT_SECONDS: process.env.POLYNET_CODEX_WORKER_COMMAND_TIMEOUT_SECONDS ?? "60",
      POLYNET_CODEX_WORKER_HOST: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout.on("data", (chunk) => pushTail(stdoutTail, String(chunk ?? "")));
  proc.stderr.on("data", (chunk) => pushTail(stderrTail, String(chunk ?? "")));

  try {
    const health = await waitForHealth(proc);
    if (health.ok !== true && !requireLive) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            skipped: true,
            reason: "worker_service_health_degraded",
            health,
          },
          null,
          2,
        ),
      );
      return;
    }
    assert.equal(health.ok, true, `worker health must be ok for live proof: ${JSON.stringify(health)}`);
    assert.equal(asRecord(health.codex)?.initialized, true, "Codex app-server must be initialized");
    assert.equal(asRecord(health.blaxel)?.configured, true, "Blaxel env must be configured");

    const unauth = await fetchJson(`${serviceUrl}/v1/workspace/probe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(unauth.status, 401, "workspace probe endpoint must reject missing bearer auth");

    const invalidSandbox = await fetchJson(`${serviceUrl}/v1/workspace/probe`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sandbox_name: "!!!",
      }),
    });
    assert.equal(invalidSandbox.status, 400, "workspace probe endpoint must reject invalid sandbox names");
    assert.equal(invalidSandbox.body.code, "invalid_sandbox_name", "invalid sandbox response code mismatch");

    const missingCodexAuth = await fetchJson(`${serviceUrl}/v1/codex/probe`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: "say hi" }),
    });
    assert.equal(missingCodexAuth.status, 400, "Codex probe must require per-user ChatGPT auth");
    assert.equal(missingCodexAuth.body.code, "chatgpt_auth_required", "missing Codex auth code mismatch");
    await assertTurnControlEndpointsFailClosed();

    await assertBusyWhileWorkspaceProbeInFlight();

    const workspaceProbe = await runWorkspaceProbe();
    const timingBuckets = assertWorkspaceProbeBody(workspaceProbe);

    console.log(
      JSON.stringify(
        {
          ok: true,
          service_url: serviceUrl,
          service_events: serviceEvents(),
          event_count: asArray(workspaceProbe.events).length,
          runtime_event_types: asArray(workspaceProbe.events)
            .map((event) => String(asRecord(event)?.event_type ?? ""))
            .filter(Boolean),
          timing_buckets_ms: timingBuckets,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: error instanceof Error ? error.message : String(error ?? "unknown error"),
          service_stdout_tail: stdoutTail,
          service_stderr_tail: stderrTail,
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    await stopService(proc);
    await rm(codexHome, { recursive: true, force: true });
  }
}

await main();
