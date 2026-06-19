import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

type JsonRecord = Record<string, unknown>;

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

function buildToolUrlFromIngestUrl(ingestUrl: string): string {
  if (!ingestUrl.includes("/runtime/polynet_codex_worker_ingest")) {
    throw new Error("POLYNET_CODEX_WORKER_INGEST_URL must point at the worker ingest endpoint.");
  }
  return ingestUrl.replace(
    "/runtime/polynet_codex_worker_ingest",
    "/runtime/polynet_codex_worker_tool",
  );
}

async function assertBusyResponse(params: {
  baseUrl: string;
  authToken: string;
  machineId?: string | null;
}): Promise<void> {
  const response = await fetchJson(`${params.baseUrl}/v1/workspace/probe`, {
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

async function assertTurnControlEndpointsFailClosed(params: {
  baseUrl: string;
  authToken: string;
  machineId?: string | null;
}): Promise<void> {
  const unauthCancel = await fetchJson(`${params.baseUrl}/v1/codex/turn/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: "not-a-real-run" }),
  });
  assert.equal(unauthCancel.status, 401, "cancel endpoint must reject missing bearer auth");

  const missingCancelRunId = await fetchJson(`${params.baseUrl}/v1/codex/turn/cancel`, {
    method: "POST",
    headers: pinnedHeaders(params),
    body: "{}",
  });
  assert.equal(missingCancelRunId.status, 400, "cancel endpoint must require run_id");
  assert.equal(missingCancelRunId.body.code, "run_id_required", "cancel missing run_id code mismatch");

  const cancelMismatch = await fetchJson(`${params.baseUrl}/v1/codex/turn/cancel`, {
    method: "POST",
    headers: pinnedHeaders(params),
    body: JSON.stringify({ run_id: "not-a-real-run" }),
  });
  assert.equal(cancelMismatch.status, 409, "cancel with unknown run id must 409");
  assert.equal(cancelMismatch.body.code, "no_matching_turn", "cancel mismatch code");

  const unauthSteer = await fetchJson(`${params.baseUrl}/v1/codex/turn/steer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: "not-a-real-run", text: "keep going" }),
  });
  assert.equal(unauthSteer.status, 401, "steer endpoint must reject missing bearer auth");

  const missingSteerText = await fetchJson(`${params.baseUrl}/v1/codex/turn/steer`, {
    method: "POST",
    headers: pinnedHeaders(params),
    body: JSON.stringify({ run_id: "not-a-real-run" }),
  });
  assert.equal(missingSteerText.status, 400, "steer endpoint must require run_id and text");
  assert.equal(missingSteerText.body.code, "run_id_and_text_required", "steer missing text code mismatch");

  const steerMismatch = await fetchJson(`${params.baseUrl}/v1/codex/turn/steer`, {
    method: "POST",
    headers: pinnedHeaders(params),
    body: JSON.stringify({ run_id: "not-a-real-run", text: "keep going" }),
  });
  assert.equal(steerMismatch.status, 409, "steer with unknown run id must 409");
  assert.equal(steerMismatch.body.code, "no_matching_turn", "steer mismatch code");
}

async function assertBusyWhileWorkspaceProbeInFlight(params: {
  baseUrl: string;
  authToken: string;
  machineId?: string | null;
}): Promise<void> {
  const blockingProbe = fetchJson(
    `${params.baseUrl}/v1/workspace/probe`,
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

async function assertPlatformToolEndpointFailsClosed(params: {
  authToken: string;
}): Promise<void> {
  const ingestUrl = readEnv("POLYNET_CODEX_WORKER_INGEST_URL");
  if (!ingestUrl) return;
  const toolUrl = buildToolUrlFromIngestUrl(ingestUrl);
  const context = {
    owner_id: "jx70000000000000000000000000000f",
    thread_id: "jd70000000000000000000000000000f",
    run_id: `forged-tool-${randomUUID()}`,
    assistant_message_key: "forged-tool",
    model_id: "gpt-5.5",
    lane: "chatgpt",
    inference_source: "chatgpt",
  };

  const unauth = await fetchJson(toolUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      context,
      run_token: "forged",
      tool_name: "search_product_docs",
      arguments: { query: "billing" },
    }),
  });
  assert.equal(unauth.status, 401, "platform tool endpoint must reject missing bearer auth");
  assert.equal(unauth.body.code, "unauthorized", "platform tool unauthorized code mismatch");

  const missingRunToken = await fetchJson(toolUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      context,
      tool_name: "search_product_docs",
      arguments: { query: "billing" },
    }),
  });
  assert.equal(missingRunToken.status, 401, "platform tool endpoint must require a tool run token");
  assert.equal(
    missingRunToken.body.code,
    "polynet_codex_worker_run_token_required",
    "platform tool missing run-token code mismatch",
  );
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
        `${params.baseUrl}/v1/workspace/probe`,
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

async function runWorkspaceProbe(params: {
  baseUrl: string;
  authToken: string;
  machineId?: string | null;
}): Promise<JsonRecord> {
  const response = await fetchJson(
    `${params.baseUrl}/v1/workspace/probe`,
    {
      method: "POST",
      headers: pinnedHeaders(params),
      body: JSON.stringify({
        run_id: `polynet-worker-fly-workspace-proof-${randomUUID().slice(0, 8)}`,
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

  const unauth = await fetchJson(`${baseUrl}/v1/workspace/probe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(unauth.status, 401, "workspace probe endpoint must reject missing bearer auth");

  const invalidSandbox = await fetchJson(`${baseUrl}/v1/workspace/probe`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sandbox_name: "!!!" }),
  });
  assert.equal(invalidSandbox.status, 400, "workspace probe endpoint must reject invalid sandbox names");
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
  const missingProbeChatgptAuth = await fetchJson(`${baseUrl}/v1/codex/probe`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt: "say hi" }),
  });
  assert.equal(
    missingProbeChatgptAuth.status,
    400,
    "Codex probe endpoint must reject probes without per-user chatgpt_auth",
  );
  assert.equal(
    missingProbeChatgptAuth.body.code,
    "chatgpt_auth_required",
    "missing Codex probe chatgpt_auth response code mismatch",
  );
  await assertTurnControlEndpointsFailClosed({ baseUrl, authToken, machineId: pinnedMachineId });

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
  await assertPlatformToolEndpointFailsClosed({ authToken });

  await assertBusyWhileWorkspaceProbeInFlight({ baseUrl, authToken, machineId: pinnedMachineId });

  if (readEnv("POLYNET_CODEX_WORKER_EXPECT_MULTI_MACHINE") === "true") {
    await assertPoolServesConcurrentTurns({ baseUrl, authToken });
  }

  const workspaceProbe = await runWorkspaceProbe({ baseUrl, authToken, machineId: pinnedMachineId });
  const timingBuckets = assertWorkspaceProbeBody(workspaceProbe);

  console.log(
    JSON.stringify(
      {
        ok: true,
        service_url: baseUrl,
        health: {
          codex: health.body.codex,
            blaxel: health.body.blaxel,
          },
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
}

await main();
