import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

import {
  createPolynetCodexWorkerServer,
  runPolynetCodexWorkerRequest,
  validatePolynetCodexWorkerPayload,
  type PolynetCodexWorkerServiceConfig,
} from "../services/polynet-codex-worker/src/server.ts";
import {
  POLYNET_CODEX_WORKER_CONTRACT_NAME,
  POLYNET_CODEX_WORKER_CONTRACT_VERSION,
  POLYNET_CODEX_WORKER_ENGINE_ID,
  type PolynetCodexWorkerTransportPayload,
} from "../convex/polynetCodexWorkerBridge.ts";

type JsonRecord = Record<string, unknown>;

const root = process.cwd();
const authToken = "worker-service-proof-token";
const secretPrompt = "SECRET_PROMPT_SHOULD_NOT_LEAK";

function readText(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function asRecord(value: unknown): JsonRecord {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as JsonRecord;
}

function buildPayload(overrides: JsonRecord = {}): PolynetCodexWorkerTransportPayload {
  return {
    contract_name: POLYNET_CODEX_WORKER_CONTRACT_NAME,
    contract_version: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
    engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
    run_id: "run_worker_service_proof",
    thread_id: "thread_worker_service_proof",
    request_id: "request_worker_service_proof",
    runtime_engine: "codex",
    model_id: "gpt-5.5",
    max_tokens: 2048,
    lane: "chatgpt",
    inference_source: "chatgpt",
    developer_instructions: "Use the PolyNet prompt bundle.",
    prompt: secretPrompt,
    polynet_platform_tool_names: [
      "search_product_docs",
      "get_active_community_context",
    ],
    community_resource_lane: {
      lane: "member",
      can_read_live_resources: true,
      can_use_resource_builder: false,
    } as any,
    prompt_projection_receipt: {
      runtimePromptChars: 120,
      developerInstructionChars: 80,
      promptChars: secretPrompt.length,
    } as any,
    ...overrides,
  };
}

async function withServer<T>(
  config: PolynetCodexWorkerServiceConfig,
  fn: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = createPolynetCodexWorkerServer(config);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function fetchJson(url: string, init?: RequestInit): Promise<{
  status: number;
  body: JsonRecord;
  rawText: string;
}> {
  const response = await fetch(url, init);
  const rawText = await response.text();
  return {
    status: response.status,
    body: asRecord(rawText ? JSON.parse(rawText) : {}),
    rawText,
  };
}

function proveServiceIsMinimal(): void {
  const source = readText("services/polynet-codex-worker/src/server.ts");
  const packageJson = readText("package.json");
  assert.equal(/daytona|blaxel/i.test(source), false);
  assert.equal(source.includes("node:child_process"), false);
  assert.ok(source.includes("POST") && source.includes("/runtime"));
  assert.ok(source.includes("codex_execution_not_configured"));
  assert.ok(
    packageJson.includes(
      '"serve:polynet-codex-worker": "node --experimental-strip-types --experimental-specifier-resolution=node services/polynet-codex-worker/src/server.ts"',
    ),
  );
}

function provePayloadValidation(): void {
  assert.equal(validatePolynetCodexWorkerPayload(buildPayload()).ok, true);
  const badContract = validatePolynetCodexWorkerPayload(
    buildPayload({ contract_name: "wrong_contract" }),
  );
  assert.equal(badContract.ok, false);
  assert.equal(badContract.code, "unsupported_contract_name");
  const badRuntime = validatePolynetCodexWorkerPayload(
    buildPayload({ runtime_engine: "polynet" }),
  );
  assert.equal(badRuntime.ok, false);
  assert.equal(badRuntime.code, "unsupported_runtime_engine");
}

async function proveExecutionDisabledIsExplicit(): Promise<void> {
  const result = await runPolynetCodexWorkerRequest(buildPayload(), {
    authToken: null,
    staticAssistantText: null,
    maxBodyBytes: 1_000_000,
  });
  assert.equal(result.status, 503);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.code, "codex_execution_not_configured");
  assert.equal(JSON.stringify(result.body).includes(secretPrompt), false);
}

async function proveHttpContract(): Promise<void> {
  await withServer(
    {
      authToken,
      staticAssistantText: "Worker service contract response.",
      maxBodyBytes: 1_000_000,
    },
    async (baseUrl) => {
      const health = await fetchJson(`${baseUrl}/healthz`);
      assert.equal(health.status, 200);
      assert.equal(health.body.ok, true);
      assert.equal(health.body.engine_id, POLYNET_CODEX_WORKER_ENGINE_ID);
      assert.equal(health.body.auth_required, true);
      assert.equal(health.rawText.includes(authToken), false);

      const unauthenticated = await fetchJson(`${baseUrl}/runtime`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      assert.equal(unauthenticated.status, 401);
      assert.equal(unauthenticated.body.code, "unauthorized");
      assert.equal(unauthenticated.rawText.includes(secretPrompt), false);

      const invalidContract = await fetchJson(`${baseUrl}/runtime`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${authToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(buildPayload({ contract_version: "v999" })),
      });
      assert.equal(invalidContract.status, 400);
      assert.equal(invalidContract.body.code, "unsupported_contract_version");
      assert.equal(invalidContract.rawText.includes(secretPrompt), false);

      const success = await fetchJson(`${baseUrl}/runtime`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${authToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(buildPayload()),
      });
      assert.equal(success.status, 200);
      assert.equal(success.body.ok, true);
      assert.equal(success.body.assistant_text, "Worker service contract response.");
      assert.equal(success.body.prompt_tokens, null);
      assert.equal(success.body.completion_tokens, null);
      assert.equal(success.body.engine_id, POLYNET_CODEX_WORKER_ENGINE_ID);
      assert.equal(success.body.contract_name, POLYNET_CODEX_WORKER_CONTRACT_NAME);
      assert.equal(
        success.body.contract_version,
        POLYNET_CODEX_WORKER_CONTRACT_VERSION,
      );
      assert.equal(success.rawText.includes(secretPrompt), false);
      assert.equal(success.rawText.includes(authToken), false);
    },
  );
}

proveServiceIsMinimal();
provePayloadValidation();
await proveExecutionDisabledIsExplicit();
await proveHttpContract();

console.log("polynet_codex_worker_service_contract_proof: ok");
