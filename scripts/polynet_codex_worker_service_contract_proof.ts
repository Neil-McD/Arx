import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

type JsonRecord = Record<string, unknown>;

type SseEvent = {
  event: string;
  data: JsonRecord;
};

const args = new Set(process.argv.slice(2));
const requireLive = args.has("--require-live");
const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const runnerPath = path.join(rootDir, "scripts/run_polynet_codex_worker_service_local.sh");
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

function runtimeEventTypes(events: SseEvent[]): string[] {
  return events
    .filter((event) => event.event === "runtime_event")
    .map((event) => String(event.data.event_type ?? ""))
    .filter(Boolean);
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
      const response = await fetchJson(`${serviceUrl}/healthz`, undefined, 5000);
      if (response.status === 200) return response.body;
      lastError = `status=${response.status} body=${JSON.stringify(response.body)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error ?? "unknown error");
    }
    await sleep(500);
  }
  throw new Error(`worker service did not become reachable: ${lastError}`);
}

function parseSseBlock(block: string): SseEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }
  if (dataLines.length === 0) return null;
  const rawData = dataLines.join("\n");
  return {
    event,
    data: asRecord(JSON.parse(rawData)) ?? {},
  };
}

async function readSseEvents(response: Response, timeoutMs = 360_000): Promise<SseEvent[]> {
  assert.ok(response.body, "streaming response must include a body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events: SseEvent[] = [];
  let buffer = "";
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex >= 0) {
      const rawBlock = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const parsed = parseSseBlock(rawBlock);
      if (parsed) events.push(parsed);
      separatorIndex = buffer.indexOf("\n\n");
    }
  }

  if (buffer.trim()) {
    const parsed = parseSseBlock(buffer);
    if (parsed) events.push(parsed);
  }
  return events;
}

async function runStreamedProbe(): Promise<SseEvent[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 390_000);
  try {
    const response = await fetch(`${serviceUrl}/v1/codex/probe?stream=1`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        run_id: `polynet-worker-service-proof-${randomUUID().slice(0, 8)}`,
        stream: true,
        destroy_after_run: true,
        command: "pwd && echo POLYNET_CODEX_WORKER_SERVICE_PROBE && uname -s",
      }),
      signal: controller.signal,
    });
    assert.equal(response.status, 200, `streamed probe status must be 200, got ${response.status}`);
    assert.match(
      response.headers.get("content-type") ?? "",
      /text\/event-stream/,
      "streamed probe must return text/event-stream",
    );
    await assertBusyResponse();
    return await readSseEvents(response);
  } finally {
    clearTimeout(timeout);
  }
}

async function assertBusyResponse(): Promise<void> {
  const response = await fetch(`${serviceUrl}/v1/codex/probe`, {
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

function assertProbeEvents(events: SseEvent[]): JsonRecord {
  assert.ok(events.some((event) => event.event === "start"), "stream must include start event");
  assert.ok(events.some((event) => event.event === "delta"), "stream must include assistant token deltas");
  const errorEvent = events.find((event) => event.event === "error");
  assert.equal(errorEvent, undefined, `stream must not include error event: ${JSON.stringify(errorEvent?.data)}`);
  const modelFinished = events.find((event) => event.event === "run_model_finished");
  assert.ok(modelFinished, "stream must include run_model_finished event");
  const done = events.find((event) => event.event === "done");
  assert.ok(done, "stream must include done event");
  const finalized = events.find((event) => event.event === "run_finalized");
  assert.ok(finalized, "stream must include run_finalized event");

  const proof = asRecord(finalized.data.proof ?? done.data.proof);
  assert.equal(proof?.ok, true, `probe proof must pass: ${JSON.stringify(proof)}`);
  assert.deepEqual(asArray(proof?.failures), [], "probe proof must have no failures");
  assert.equal(finalized.data.ok, true, `run_finalized must be ok: ${JSON.stringify(finalized.data)}`);
  assert.equal(finalized.data.error, null, `run_finalized error must be null: ${JSON.stringify(finalized.data.error)}`);

  const timing = asRecord(finalized.data.timing);
  const buckets = asRecord(timing?.buckets);
  assert.ok(buckets, "finalized timing must include buckets");
  for (const key of [
    "sandbox_ensure_ms",
    "codex_thread_start_ms",
    "codex_turn_start_ack_ms",
    "codex_turn_total_ms",
    "first_codex_event_ms",
    "first_blaxel_tool_call_ms",
    "latest_blaxel_tool_latency_ms",
    "first_assistant_delta_ms",
    "sandbox_destroy_ms",
  ]) {
    assert.equal(typeof buckets[key], "number", `timing bucket missing: ${key}`);
  }

  const eventTypes = runtimeEventTypes(events);
  for (const eventType of [
    "sandbox_ensure_started",
    "sandbox_ensure_finished",
    "codex_thread_started",
    "codex_turn_start_acknowledged",
    "blaxel_bash_requested",
    "blaxel_bash_finished",
    "codex_turn_completed",
    "sandbox_destroy_finished",
    "run_model_finished",
    "run_finalized",
  ]) {
    assert.ok(eventTypes.includes(eventType), `runtime event missing: ${eventType}`);
  }

  return buckets;
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

    const unauth = await fetchJson(`${serviceUrl}/v1/codex/probe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(unauth.status, 401, "probe endpoint must reject missing bearer auth");

    const invalidSandbox = await fetchJson(`${serviceUrl}/v1/codex/probe`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sandbox_name: "!!!",
      }),
    });
    assert.equal(invalidSandbox.status, 400, "probe endpoint must reject invalid sandbox names");
    assert.equal(invalidSandbox.body.code, "invalid_sandbox_name", "invalid sandbox response code mismatch");

    const events = await runStreamedProbe();
    const timingBuckets = assertProbeEvents(events);

    console.log(
      JSON.stringify(
        {
          ok: true,
          service_url: serviceUrl,
          service_events: serviceEvents(),
          event_count: events.length,
          runtime_event_types: runtimeEventTypes(events),
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
