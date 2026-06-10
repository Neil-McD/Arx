import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

type JsonRecord = Record<string, unknown>;

type SseEvent = {
  event: string;
  data: JsonRecord;
};

function readEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
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

function normalizeBaseUrl(rawUrl: string): string {
  const url = rawUrl.replace(/\/+$/, "");
  if (!/^https?:\/\//.test(url)) {
    throw new Error("POLYNET_CODEX_WORKER_URL must start with http:// or https://");
  }
  return url;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 20_000): Promise<{
  status: number;
  headers: Headers;
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
      headers: response.headers,
      body: asRecord(text ? JSON.parse(text) : {}) ?? {},
    };
  } finally {
    clearTimeout(timeout);
  }
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
  return {
    event,
    data: asRecord(JSON.parse(dataLines.join("\n"))) ?? {},
  };
}

async function readSseEvents(response: Response, timeoutMs = 420_000): Promise<SseEvent[]> {
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

async function assertBusyResponse(params: {
  baseUrl: string;
  authToken: string;
}): Promise<void> {
  const response = await fetchJson(`${params.baseUrl}/v1/codex/probe`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      run_id: `polynet-worker-fly-busy-proof-${randomUUID().slice(0, 8)}`,
      destroy_after_run: true,
    }),
  });
  assert.equal(response.status, 409, `concurrent request must return 409: ${JSON.stringify(response.body)}`);
  assert.equal(response.headers.get("retry-after"), "1", "busy response must include Retry-After: 1");
  assert.equal(response.body.code, "worker_busy", "busy response code mismatch");
}

async function assertBusyWhileTurnInFlight(params: {
  baseUrl: string;
  authToken: string;
}): Promise<void> {
  const blockingProbe = fetchJson(
    `${params.baseUrl}/v1/codex/probe`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        run_id: `polynet-worker-fly-blocking-proof-${randomUUID().slice(0, 8)}`,
        destroy_after_run: true,
        command: "pwd && echo POLYNET_CODEX_WORKER_SERVICE_PROBE && uname -s && sleep 8",
      }),
    },
    180_000,
  );

  await delay(2_000);
  await assertBusyResponse(params);

  const response = await blockingProbe;
  assert.equal(response.status, 200, `blocking probe must finish after busy assertion: ${JSON.stringify(response.body)}`);
  assert.equal(response.body.ok, true, `blocking probe must succeed: ${JSON.stringify(response.body)}`);
}

async function runStreamedProbe(params: {
  baseUrl: string;
  authToken: string;
}): Promise<SseEvent[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 450_000);
  try {
    const response = await fetch(`${params.baseUrl}/v1/codex/probe?stream=1`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        run_id: `polynet-worker-fly-proof-${randomUUID().slice(0, 8)}`,
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
    return await readSseEvents(response);
  } finally {
    clearTimeout(timeout);
  }
}

function assertProbeEvents(events: SseEvent[]): JsonRecord {
  assert.ok(events.some((event) => event.event === "start"), "stream must include start event");
  assert.ok(events.some((event) => event.event === "delta"), "stream must include assistant token deltas");
  assert.equal(
    events.find((event) => event.event === "error"),
    undefined,
    "stream must not include error event",
  );
  assert.ok(events.find((event) => event.event === "run_model_finished"), "stream must include run_model_finished");
  assert.ok(events.find((event) => event.event === "done"), "stream must include done");
  const finalized = events.find((event) => event.event === "run_finalized");
  assert.ok(finalized, "stream must include run_finalized");
  assert.equal(finalized.data.ok, true, `run_finalized must be ok: ${JSON.stringify(finalized.data)}`);
  assert.equal(finalized.data.error, null, `run_finalized error must be null: ${JSON.stringify(finalized.data.error)}`);

  const proof = asRecord(finalized.data.proof);
  assert.equal(proof?.ok, true, `probe proof must pass: ${JSON.stringify(proof)}`);
  assert.deepEqual(asArray(proof?.failures), [], "probe proof must have no failures");

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
    "run_model_finished",
    "sandbox_destroy_finished",
    "run_finalized",
  ]) {
    assert.ok(eventTypes.includes(eventType), `runtime event missing: ${eventType}`);
  }

  return buckets;
}

async function main() {
  const baseUrl = normalizeBaseUrl(
    readEnv("POLYNET_CODEX_WORKER_URL") || "https://polynet-codex-worker-staging.fly.dev",
  );
  const authToken = readEnv("POLYNET_CODEX_WORKER_AUTH_TOKEN");
  if (!authToken) throw new Error("POLYNET_CODEX_WORKER_AUTH_TOKEN is required for remote proof.");

  const health = await fetchJson(`${baseUrl}/healthz`);
  assert.equal(health.status, 200, `health status must be 200: ${JSON.stringify(health.body)}`);
  assert.equal(health.body.ok, true, `worker health must be ok: ${JSON.stringify(health.body)}`);
  assert.equal(asRecord(health.body.codex)?.initialized, true, "Codex app-server must be initialized");
  assert.equal(asRecord(health.body.blaxel)?.configured, true, "Blaxel env must be configured");

  const unauth = await fetchJson(`${baseUrl}/v1/codex/probe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(unauth.status, 401, "probe endpoint must reject missing bearer auth");

  const invalidSandbox = await fetchJson(`${baseUrl}/v1/codex/probe`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sandbox_name: "!!!" }),
  });
  assert.equal(invalidSandbox.status, 400, "probe endpoint must reject invalid sandbox names");
  assert.equal(invalidSandbox.body.code, "invalid_sandbox_name", "invalid sandbox response code mismatch");

  await assertBusyWhileTurnInFlight({ baseUrl, authToken });

  const events = await runStreamedProbe({ baseUrl, authToken });
  const timingBuckets = assertProbeEvents(events);

  console.log(
    JSON.stringify(
      {
        ok: true,
        service_url: baseUrl,
        health: {
          codex: health.body.codex,
          blaxel: health.body.blaxel,
        },
        event_count: events.length,
        runtime_event_types: runtimeEventTypes(events),
        timing_buckets_ms: timingBuckets,
      },
      null,
      2,
    ),
  );
}

await main();
