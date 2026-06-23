import assert from "node:assert/strict";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import {
  POLYNET_CODEX_WORKER_CONTRACT_NAME,
  POLYNET_CODEX_WORKER_CONTRACT_VERSION,
  POLYNET_CODEX_WORKER_ENGINE_ID,
  startPolynetCodexWorkerRun,
} from "../convex/polynetCodexWorkerBridge.ts";
import {
  createPolynetCodexWorkerServer,
  type PolynetCodexWorkerServiceConfig,
} from "../services/polynet-codex-worker/src/server.ts";

type JsonRecord = Record<string, unknown>;

type RecordedEvent = {
  eventType: string;
  eventKey?: string;
  payload: JsonRecord;
};

const workerAuthToken = "e2e-worker-token";
const appServerAuthToken = "e2e-app-server-token";
const latestUserText = "Can you help onboard me end to end?";

function asRecord(value: unknown): JsonRecord {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as JsonRecord;
}

async function closeServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function withMockAppServer<T>(
  fn: (params: { url: string; requests: JsonRecord[] }) => Promise<T>,
): Promise<T> {
  const requests: JsonRecord[] = [];
  const server = http.createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      assert.equal(request.method, "POST");
      assert.equal(request.url, "/codex-turn");
      assert.equal(request.headers.authorization, `Bearer ${appServerAuthToken}`);
      let rawBody = "";
      request.setEncoding("utf8");
      for await (const chunk of request) rawBody += String(chunk);
      const body = asRecord(JSON.parse(rawBody));
      requests.push(body);
      response.statusCode = 200;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(
        JSON.stringify({
          ok: true,
          assistant_text: "E2E app-server answer.",
          prompt_tokens: 77,
          completion_tokens: 11,
        }),
      );
    })().catch((error) => {
      response.statusCode = 500;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(
        JSON.stringify({
          ok: false,
          code: "mock_app_server_error",
          message: error instanceof Error ? error.message : "mock failed",
          retryable: false,
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  try {
    return await fn({
      url: `http://127.0.0.1:${address.port}/codex-turn`,
      requests,
    });
  } finally {
    await closeServer(server);
  }
}

async function withWorkerServer<T>(
  config: PolynetCodexWorkerServiceConfig,
  fn: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = createPolynetCodexWorkerServer(config);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await closeServer(server);
  }
}

function buildBaseParams(overrides: JsonRecord = {}) {
  return {
    ownerId: "user_e2e",
    threadId: "thread_e2e",
    runId: "run_e2e",
    requestId: "request_e2e",
    runtimeEngine: "codex" as const,
    modelId: "gpt-5.5",
    maxTokens: 2048,
    lane: "chatgpt",
    inferenceSource: "chatgpt",
    allowedToolNames: ["search_product_docs", "get_active_community_context"] as const,
    conversationMessages: [
      { role: "user" as const, content: latestUserText },
    ],
    latestUserText,
    promptParams: {
      loopBudget: {
        maxToolSteps: 50,
        maxRepeatedIdenticalCalls: 2,
        maxConsecutiveFailures: 5,
        maxNoProgressSteps: 5,
      },
      allowedToolNames: ["search_product_docs", "get_active_community_context"] as const,
      communityResourceLane: {
        lane: "member" as const,
        can_read_live_resources: true,
        can_use_resource_builder: false,
      },
      harnessName: "chat_tools" as const,
      communityId: "community_e2e",
      communityName: "Polynet",
      communitySlug: "polynet",
      communityOneLiner: "Collective intelligence.",
      communityAbout: "A test community.",
      communitySystemPrompt: "Help members use Polynet.",
      agentName: "Atom",
      agentSoul: "Direct and useful.",
      projectLabel: "General",
      projectDescription: "Default cloud project",
      runtimeTurnContext: {
        latestUserText,
        projectContext: null,
        threadWorkingState: null,
        activeBackgroundTerminals: [],
        recentBackgroundProcessEvents: [],
        recentToolAttempts: [],
      },
      currentDateTimeIso: "2026-06-23T12:00:00.000Z",
      currentDateLabel: "Tuesday, June 23, 2026 at 12:00:00 PM UTC",
      currentTimeZone: "UTC",
      conversationMessages: [
        { role: "user" as const, content: latestUserText },
      ],
      latestUserText,
    },
    ...overrides,
  };
}

async function proveEndToEndWorkerChain(): Promise<void> {
  await withMockAppServer(async ({ url: appServerUrl, requests: appServerRequests }) => {
    await withWorkerServer(
      {
        authToken: workerAuthToken,
        executionMode: "app_server",
        staticAssistantText: null,
        appServer: {
          url: appServerUrl,
          authToken: appServerAuthToken,
          timeoutMs: 10_000,
        },
        codexStdio: null,
        maxBodyBytes: 1_000_000,
      },
      async (workerBaseUrl) => {
        const events: RecordedEvent[] = [];
        const workerRequests: JsonRecord[] = [];
        const result = await startPolynetCodexWorkerRun({
          ...buildBaseParams(),
          env: {
            POLYNET_CODEX_WORKER_RUNTIME_ENABLED: "true",
            POLYNET_CODEX_WORKER_URL: "https://worker.polynet.test/runtime",
            POLYNET_CODEX_WORKER_AUTH_TOKEN: workerAuthToken,
            POLYNET_CODEX_WORKER_TIMEOUT_MS: "10000",
          },
          fetchFn: async (url, init) => {
            assert.equal(url, "https://worker.polynet.test/runtime");
            assert.equal(init.headers.authorization, `Bearer ${workerAuthToken}`);
            assert.equal(
              init.headers["x-polynet-worker-contract"],
              POLYNET_CODEX_WORKER_CONTRACT_NAME,
            );
            assert.equal(
              init.headers["x-polynet-worker-contract-version"],
              POLYNET_CODEX_WORKER_CONTRACT_VERSION,
            );
            const bridgePayload = asRecord(JSON.parse(init.body));
            workerRequests.push(bridgePayload);
            return await fetch(`${workerBaseUrl}/runtime`, {
              method: init.method,
              headers: init.headers,
              body: init.body,
              signal: init.signal,
            });
          },
          appendRunEvent: async (event) => {
            events.push(event);
          },
        });

        assert.equal(result.ok, true);
        assert.equal(result.assistantText, "E2E app-server answer.");
        assert.equal(result.promptTokens, 77);
        assert.equal(result.completionTokens, 11);

        assert.equal(workerRequests.length, 1);
        const workerPayload = workerRequests[0];
        assert.equal(workerPayload.contract_name, POLYNET_CODEX_WORKER_CONTRACT_NAME);
        assert.equal(workerPayload.contract_version, POLYNET_CODEX_WORKER_CONTRACT_VERSION);
        assert.equal(workerPayload.engine_id, POLYNET_CODEX_WORKER_ENGINE_ID);
        assert.equal(workerPayload.run_id, "run_e2e");
        assert.equal(workerPayload.thread_id, "thread_e2e");
        assert.equal(workerPayload.request_id, "request_e2e");
        assert.equal(workerPayload.runtime_engine, "codex");
        assert.equal(workerPayload.model_id, "gpt-5.5");
        assert.equal(workerPayload.max_tokens, 2048);
        assert.equal(typeof workerPayload.developer_instructions, "string");
        assert.ok(String(workerPayload.developer_instructions).includes("POLYNET_CODEX_RUNTIME_AUTHORITY"));
        assert.ok(String(workerPayload.prompt).includes(latestUserText));

        assert.equal(appServerRequests.length, 1);
        const appServerRequest = appServerRequests[0];
        assert.equal(appServerRequest.run_id, "run_e2e");
        assert.equal(appServerRequest.thread_id, "thread_e2e");
        assert.equal(appServerRequest.request_id, "request_e2e");
        assert.equal(appServerRequest.model_id, "gpt-5.5");
        assert.equal(appServerRequest.max_tokens, 2048);
        assert.equal(appServerRequest.developer_instructions, workerPayload.developer_instructions);
        assert.equal(appServerRequest.prompt, workerPayload.prompt);
        const metadata = asRecord(appServerRequest.metadata);
        assert.equal(metadata.runtime_engine, "codex");
        assert.equal(metadata.lane, "chatgpt");
        assert.equal(metadata.inference_source, "chatgpt");
        assert.deepEqual(metadata.polynet_platform_tool_names, [
          "search_product_docs",
          "get_active_community_context",
        ]);

        assert.deepEqual(
          events.map((event) => event.eventType),
          ["codex_worker_transport_started", "codex_worker_transport_finished"],
        );
        const serializedEvents = JSON.stringify(events);
        assert.equal(serializedEvents.includes(latestUserText), false);
        assert.equal(serializedEvents.includes("POLYNET_CODEX_RUNTIME_AUTHORITY"), false);
        assert.equal(serializedEvents.includes(workerAuthToken), false);
        assert.equal(serializedEvents.includes(appServerAuthToken), false);
      },
    );
  });
}

await proveEndToEndWorkerChain();

console.log("polynet_codex_worker_end_to_end_contract_proof: ok");
