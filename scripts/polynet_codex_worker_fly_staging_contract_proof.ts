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

function pinnedHeaders(params: {
  authToken: string;
  machineId?: string | null;
}): Record<string, string> {
  return {
    Authorization: `Bearer ${params.authToken}`,
    "Content-Type": "application/json",
    ...(params.machineId ? { "fly-force-instance-id": params.machineId } : {}),
  };
}

async function assertBusyResponse(params: {
  baseUrl: string;
  authToken: string;
  machineId?: string | null;
}): Promise<void> {
  const response = await fetchJson(`${params.baseUrl}/v1/codex/probe`, {
    method: "POST",
    headers: pinnedHeaders(params),
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
  machineId?: string | null;
}): Promise<void> {
  const blockingProbe = fetchJson(
    `${params.baseUrl}/v1/codex/probe`,
    {
      method: "POST",
      headers: pinnedHeaders(params),
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

async function assertCancelStopsTurn(params: {
  baseUrl: string;
  authToken: string;
  machineId?: string | null;
}): Promise<void> {
  const runId = `polynet-worker-fly-cancel-proof-${randomUUID().slice(0, 8)}`;
  const longProbe = fetchJson(
    `${params.baseUrl}/v1/codex/probe`,
    {
      method: "POST",
      headers: pinnedHeaders(params),
      body: JSON.stringify({
        run_id: runId,
        destroy_after_run: true,
        command: "pwd && echo POLYNET_CODEX_WORKER_SERVICE_PROBE && sleep 25",
      }),
    },
    180_000,
  );

  await delay(2_500);
  const mismatch = await fetchJson(`${params.baseUrl}/v1/codex/turn/cancel`, {
    method: "POST",
    headers: pinnedHeaders(params),
    body: JSON.stringify({ run_id: "not-a-real-run" }),
  });
  assert.equal(mismatch.status, 409, "cancel with unknown run id must 409");
  assert.equal(mismatch.body.code, "no_matching_turn", "cancel mismatch code");

  const steerMismatch = await fetchJson(`${params.baseUrl}/v1/codex/turn/steer`, {
    method: "POST",
    headers: pinnedHeaders(params),
    body: JSON.stringify({ run_id: "not-a-real-run", text: "go faster" }),
  });
  assert.equal(steerMismatch.status, 409, "steer with unknown run id must 409");
  assert.equal(steerMismatch.body.code, "no_matching_turn", "steer mismatch code");

  const cancelStartedAt = Date.now();
  const cancelled = await fetchJson(`${params.baseUrl}/v1/codex/turn/cancel`, {
    method: "POST",
    headers: pinnedHeaders(params),
    body: JSON.stringify({ run_id: runId }),
  });
  assert.equal(cancelled.status, 200, `cancel must succeed: ${JSON.stringify(cancelled.body)}`);

  const finished = await longProbe;
  const cancelToFinishMs = Date.now() - cancelStartedAt;
  assert.ok(
    cancelToFinishMs < 20_000,
    `cancelled turn must finish well before the sleep completes (took ${cancelToFinishMs}ms)`,
  );
  assert.equal(finished.body.ok, false, "cancelled probe must not report ok");
  const finishedError = asRecord(finished.body.error);
  assert.equal(
    String(finishedError?.code ?? finished.body.code ?? ""),
    "user_cancelled",
    `cancelled turn must carry user_cancelled: ${JSON.stringify(finished.body)}`,
  );

  const followUp = await fetchJson(`${params.baseUrl}/v1/codex/probe`, {
    method: "POST",
    headers: pinnedHeaders(params),
    body: JSON.stringify({
      run_id: `polynet-worker-fly-post-cancel-${randomUUID().slice(0, 8)}`,
      destroy_after_run: true,
    }),
  });
  assert.equal(followUp.status, 200, "worker must accept a new turn after cancel");
  assert.equal(followUp.body.ok, true, "post-cancel probe must succeed");
}

async function assertPoolServesConcurrentTurns(params: {
  baseUrl: string;
  authToken: string;
}): Promise<void> {
  const probe = async (label: string) => {
    // Mirror the bridge contract: 409 means a pool sibling is still waking
    // (stopped machines cold-boot and log into Codex), so retry with the
    // same wake-sized backoff before judging the pool.
    const delays = [1_500, 3_000, 4_500, 6_000];
    for (let attempt = 0; ; attempt += 1) {
      const result = await fetchJson(
        `${params.baseUrl}/v1/codex/probe`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${params.authToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            run_id: `polynet-worker-pool-proof-${label}-${attempt}-${randomUUID().slice(0, 8)}`,
            destroy_after_run: true,
            command: "pwd && echo POLYNET_CODEX_WORKER_SERVICE_PROBE && sleep 6",
          }),
        },
        180_000,
      );
      if (result.status !== 409 || attempt >= delays.length) return result;
      await delay(delays[attempt]);
    }
  };
  const [first, second] = await Promise.all([probe("a"), probe("b")]);
  assert.equal(first.body.ok, true, `pool probe A must succeed: ${JSON.stringify(first.body)}`);
  assert.equal(second.body.ok, true, `pool probe B must succeed: ${JSON.stringify(second.body)}`);
  const machineA = String(first.body.machine_id ?? "").trim();
  const machineB = String(second.body.machine_id ?? "").trim();
  assert.ok(machineA && machineB, "pool probes must report machine ids");
  assert.notEqual(
    machineA,
    machineB,
    "concurrent unpinned turns must be served by different pool machines",
  );
}

// Positive live proof for the platform-tool rail: a probe turn forces a
// polynet tool call. This worker-only proof intentionally lacks a
// Convex-minted run token, so the expected END STATE is the endpoint's
// run-token refusal — which proves the chain live through spec projection,
// namespace routing, worker relay, endpoint auth, and fail-closed run-token
// enforcement, with platform_tool_requested/finished events emitted.
async function assertPlatformToolProbe(params: {
  baseUrl: string;
  authToken: string;
}): Promise<void> {
  const ingestUrl = readEnv("POLYNET_CODEX_WORKER_INGEST_URL");
  if (!ingestUrl) return;
  const toolUrl = ingestUrl.replace(
    "/runtime/polynet_codex_worker_ingest",
    "/runtime/polynet_codex_worker_tool",
  );
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
        run_id: `polynet-worker-fly-tool-proof-${randomUUID().slice(0, 8)}`,
        stream: true,
        destroy_after_run: true,
        platform_tool_probe: "search_product_docs",
        platform_tools: [
          {
            name: "search_product_docs",
            description: "Search PolyNet product documentation.",
            input_schema: {
              type: "object",
              properties: { query: { type: "string" } },
              required: ["query"],
              additionalProperties: false,
            },
          },
        ],
        ingest: {
          url: ingestUrl,
          token: params.authToken,
          tool_url: toolUrl,
          context: {
            owner_id: "jx70000000000000000000000000000f",
            thread_id: "jd70000000000000000000000000000f",
            run_id: `forged-tool-probe-${randomUUID()}`,
            assistant_message_key: "tool-probe",
            model_id: "probe",
            lane: "chatgpt",
            inference_source: "chatgpt",
          },
        },
      }),
      signal: controller.signal,
    });
    assert.equal(response.status, 200, `platform tool probe status must be 200, got ${response.status}`);
    const events = await readSseEvents(response);
    const finalized = events.find((event) => event.event === "run_finalized");
    assert.ok(finalized, "platform tool probe must finalize");
    assert.equal(
      finalized.data.ok,
      true,
      `platform tool probe proof must pass: ${JSON.stringify(finalized.data)}`,
    );
    const eventTypes = runtimeEventTypes(events);
    assert.ok(
      eventTypes.includes("platform_tool_requested"),
      "platform tool probe must emit platform_tool_requested",
    );
    assert.ok(
      eventTypes.includes("platform_tool_finished"),
      "platform tool probe must emit platform_tool_finished",
    );
    const finishedEvent = events.find(
      (event) =>
        event.event === "runtime_event" &&
        String(asRecord(event.data)?.event_type ?? "") === "platform_tool_finished",
    );
    const finishedPayload = asRecord(asRecord(finishedEvent?.data)?.payload);
    assert.equal(
      finishedPayload?.ok,
      false,
      "worker-only platform tool call must be refused by the endpoint",
    );
    assert.equal(
      String(finishedPayload?.failure_code ?? ""),
      "polynet_codex_worker_run_token_required",
      `platform tool refusal must require a run token: ${JSON.stringify(finishedPayload)}`,
    );
  } finally {
    clearTimeout(timeout);
  }
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
    "first_workspace_exec_ms",
    "latest_workspace_exec_latency_ms",
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
    "workspace_exec_requested",
    "workspace_exec_finished",
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

  const publicHealth = await fetchJson(`${baseUrl}/healthz`);
  assert.equal(publicHealth.status, 200, "public health must be 200");
  assert.equal(
    publicHealth.body.machine_id,
    undefined,
    "public health must not leak machine ids or runtime diagnostics",
  );
  const health = await fetchJson(`${baseUrl}/healthz`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  assert.equal(health.status, 200, `health status must be 200: ${JSON.stringify(health.body)}`);
  assert.equal(health.body.ok, true, `worker health must be ok: ${JSON.stringify(health.body)}`);
  assert.equal(asRecord(health.body.codex)?.initialized, true, "Codex app-server must be initialized");
  assert.equal(asRecord(health.body.blaxel)?.configured, true, "Blaxel env must be configured");
  const pinnedMachineId = String(health.body.machine_id ?? "").trim() || null;
  assert.ok(pinnedMachineId, "healthz must report machine_id for pool routing affinity");

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

  const missingChatgptAuth = await fetchJson(`${baseUrl}/v1/codex/turn`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt: "say hi" }),
  });
  assert.equal(
    missingChatgptAuth.status,
    400,
    "turn endpoint must reject turns without per-user chatgpt_auth",
  );
  assert.equal(
    missingChatgptAuth.body.code,
    "chatgpt_auth_required",
    "missing chatgpt_auth response code mismatch",
  );

  const ingestUrl = readEnv("POLYNET_CODEX_WORKER_INGEST_URL");
  if (ingestUrl) {
    const forged = await fetchJson(ingestUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        context: {
          owner_id: "jx70000000000000000000000000000f",
          thread_id: "jd70000000000000000000000000000f",
          run_id: `forged-${randomUUID()}`,
          assistant_message_key: "forged",
          model_id: "gpt-5.5",
          lane: "chatgpt",
          inference_source: "chatgpt",
        },
        status: "ok",
        assistant_text: "forged",
        events: [],
      }),
    });
    assert.equal(
      forged.status,
      404,
      `forged ingest context must 404: ${JSON.stringify(forged.body)}`,
    );
    assert.equal(forged.body.code, "invalid_run", "forged ingest code mismatch");
  }

  await assertBusyWhileTurnInFlight({ baseUrl, authToken, machineId: pinnedMachineId });

  await assertCancelStopsTurn({ baseUrl, authToken, machineId: pinnedMachineId });

  if (readEnv("POLYNET_CODEX_WORKER_EXPECT_MULTI_MACHINE") === "true") {
    await assertPoolServesConcurrentTurns({ baseUrl, authToken });
  }

  const events = await runStreamedProbe({ baseUrl, authToken });
  const timingBuckets = assertProbeEvents(events);

  await assertPlatformToolProbe({ baseUrl, authToken });

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
