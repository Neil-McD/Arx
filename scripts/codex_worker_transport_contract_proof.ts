import assert from "node:assert/strict";

import {
  startPolynetCodexWorkerRun,
  POLYNET_CODEX_WORKER_CONTRACT_NAME,
  POLYNET_CODEX_WORKER_CONTRACT_VERSION,
  POLYNET_CODEX_WORKER_ENGINE_ID,
} from "../convex/polynetCodexWorkerBridge.ts";

type RecordedEvent = {
  eventType: string;
  eventKey?: string;
  payload: Record<string, unknown>;
};

function buildBaseParams(overrides: Record<string, unknown> = {}) {
  return {
    ownerId: "user_1",
    threadId: "thread_1",
    runId: "run_1",
    requestId: "request_1",
    runtimeEngine: "codex" as const,
    modelId: "gpt-5.5",
    maxTokens: 2048,
    lane: "chatgpt",
    inferenceSource: "chatgpt",
    allowedToolNames: ["search_product_docs", "get_active_community_context"] as const,
    conversationMessages: [
      { role: "user" as const, content: "Can you help onboard me?" },
    ],
    latestUserText: "Can you help onboard me?",
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
      communityId: "community_1",
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
        latestUserText: "Can you help onboard me?",
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
        { role: "user" as const, content: "Can you help onboard me?" },
      ],
      latestUserText: "Can you help onboard me?",
    },
    ...overrides,
  };
}

async function proveDisabledDoesNotFetch(): Promise<void> {
  let fetched = false;
  const result = await startPolynetCodexWorkerRun({
    ...buildBaseParams(),
    env: {},
    fetchFn: async () => {
      fetched = true;
      throw new Error("fetch should not run when disabled");
    },
  });
  assert.equal(fetched, false);
  assert.equal(result.ok, false);
  assert.equal(result.code, "codex_worker_unavailable");
  assert.equal(result.status, 503);
  assert.equal(result.retryable, true);
}

async function proveSuccessfulTransportContract(): Promise<void> {
  const events: RecordedEvent[] = [];
  let requestUrl = "";
  let requestHeaders: Record<string, string> = {};
  let requestBody: Record<string, unknown> = {};
  const result = await startPolynetCodexWorkerRun({
    ...buildBaseParams(),
    env: {
      POLYNET_CODEX_WORKER_RUNTIME_ENABLED: "true",
      POLYNET_CODEX_WORKER_URL: "https://worker.polynet.test/runtime",
      POLYNET_CODEX_WORKER_AUTH_TOKEN: "service-token",
      POLYNET_CODEX_WORKER_TIMEOUT_MS: "2500",
    },
    fetchFn: async (url, init) => {
      requestUrl = url;
      requestHeaders = init.headers;
      requestBody = JSON.parse(init.body) as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            assistant_text: "Onboarding started.",
            prompt_tokens: 12,
            completion_tokens: 5,
          }),
      };
    },
    appendRunEvent: async (event) => {
      events.push(event);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.assistantText, "Onboarding started.");
  assert.equal(result.promptTokens, 12);
  assert.equal(result.completionTokens, 5);
  assert.equal(requestUrl, "https://worker.polynet.test/runtime");
  assert.equal(requestHeaders.authorization, "Bearer service-token");
  assert.equal(requestHeaders["x-polynet-worker-contract"], POLYNET_CODEX_WORKER_CONTRACT_NAME);
  assert.equal(
    requestHeaders["x-polynet-worker-contract-version"],
    POLYNET_CODEX_WORKER_CONTRACT_VERSION,
  );
  assert.equal(requestBody.contract_name, POLYNET_CODEX_WORKER_CONTRACT_NAME);
  assert.equal(requestBody.contract_version, POLYNET_CODEX_WORKER_CONTRACT_VERSION);
  assert.equal(requestBody.engine_id, POLYNET_CODEX_WORKER_ENGINE_ID);
  assert.equal(requestBody.run_id, "run_1");
  assert.equal(requestBody.model_id, "gpt-5.5");
  assert.equal(requestBody.max_tokens, 2048);
  assert.equal(typeof requestBody.developer_instructions, "string");
  assert.equal(typeof requestBody.prompt, "string");
  assert.deepEqual(requestBody.polynet_platform_tool_names, [
    "search_product_docs",
    "get_active_community_context",
  ]);
  assert.deepEqual(requestBody.community_resource_lane, {
    lane: "member",
    can_read_live_resources: true,
    can_use_resource_builder: false,
  });
  assert.deepEqual(
    events.map((event) => event.eventType),
    ["codex_worker_transport_started", "codex_worker_transport_finished"],
  );
  const serializedEvents = JSON.stringify(events);
  assert.equal(
    serializedEvents.includes("Latest user request"),
    false,
    "transport events must not persist raw prompt text",
  );
}

async function proveWorkerFailureContract(): Promise<void> {
  const events: RecordedEvent[] = [];
  const result = await startPolynetCodexWorkerRun({
    ...buildBaseParams(),
    env: {
      POLYNET_CODEX_WORKER_RUNTIME_ENABLED: "true",
      POLYNET_CODEX_WORKER_URL: "https://worker.polynet.test/runtime",
    },
    fetchFn: async () => ({
      ok: false,
      status: 503,
      text: async () =>
        JSON.stringify({
          ok: false,
          code: "worker_busy",
          message: "worker is busy",
          retryable: false,
        }),
    }),
    appendRunEvent: async (event) => {
      events.push(event);
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "codex_worker_transport_failed");
  assert.equal(result.status, 503);
  assert.equal(result.retryable, false);
  assert.ok(result.message.includes("worker_busy"));
  assert.deepEqual(
    events.map((event) => event.eventType),
    ["codex_worker_transport_started", "codex_worker_transport_failed"],
  );
}

async function proveInvalidResponseFailsClosed(): Promise<void> {
  const result = await startPolynetCodexWorkerRun({
    ...buildBaseParams(),
    env: {
      POLYNET_CODEX_WORKER_RUNTIME_ENABLED: "true",
      POLYNET_CODEX_WORKER_URL: "https://worker.polynet.test/runtime",
    },
    fetchFn: async () => ({
      ok: true,
      status: 200,
      text: async () => "not json",
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "codex_worker_invalid_response");
  assert.equal(result.status, 502);
}

async function proveInsecureWorkerUrlFailsClosed(): Promise<void> {
  let fetched = false;
  const result = await startPolynetCodexWorkerRun({
    ...buildBaseParams(),
    env: {
      POLYNET_CODEX_WORKER_RUNTIME_ENABLED: "true",
      POLYNET_CODEX_WORKER_URL: "http://worker.polynet.test/runtime",
    },
    fetchFn: async () => {
      fetched = true;
      throw new Error("fetch should not run for insecure worker URL");
    },
  });
  assert.equal(fetched, false);
  assert.equal(result.ok, false);
  assert.equal(result.code, "codex_worker_unavailable");
  assert.ok(String(result.disabledReason ?? "").includes("https URL"));
}

await proveDisabledDoesNotFetch();
await proveSuccessfulTransportContract();
await proveWorkerFailureContract();
await proveInvalidResponseFailsClosed();
await proveInsecureWorkerUrlFailsClosed();

console.log("codex_worker_transport_contract_proof: ok");
