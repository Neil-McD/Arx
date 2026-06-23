import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  POLYNET_CODEX_WORKER_CONTRACT_NAME,
  POLYNET_CODEX_WORKER_CONTRACT_VERSION,
  POLYNET_CODEX_WORKER_ENGINE_ID,
  type PolynetCodexWorkerTransportPayload,
} from "../convex/polynetCodexWorkerBridge.ts";
import {
  probeCodexStdioAppServer,
  runCodexStdioAppServerRequest,
} from "../services/polynet-codex-worker/src/codexStdioAppServerClient.ts";

type JsonRecord = Record<string, unknown>;

const root = process.cwd();
const secretPrompt = "SECRET_STDIO_PROMPT_SHOULD_NOT_LEAK";

function readText(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function asRecord(value: unknown): JsonRecord {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as JsonRecord;
}

function buildPayload(overrides: Partial<PolynetCodexWorkerTransportPayload> = {}): PolynetCodexWorkerTransportPayload {
  return {
    contract_name: POLYNET_CODEX_WORKER_CONTRACT_NAME,
    contract_version: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
    engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
    run_id: "run_stdio_contract_proof",
    thread_id: "thread_stdio_contract_proof",
    request_id: "request_stdio_contract_proof",
    runtime_engine: "codex",
    model_id: "gpt-5.5",
    max_tokens: 2048,
    lane: "chatgpt",
    inference_source: "chatgpt",
    developer_instructions: "Use the PolyNet Codex runtime authority.",
    prompt: secretPrompt,
    polynet_platform_tool_names: [],
    community_resource_lane: {
      lane: "member",
      can_read_live_resources: true,
      can_use_resource_builder: false,
    } as any,
    prompt_projection_receipt: {
      promptChars: secretPrompt.length,
      developerInstructionChars: 45,
    } as any,
    ...overrides,
  };
}

class FakeCodexStdioClient {
  readonly requests: Array<{ method: string; params: unknown }> = [];
  readonly errors: Array<{ id: unknown; code: number; message: string }> = [];
  private readonly options: any;

  constructor(options: any) {
    this.options = options;
  }

  async initialize(): Promise<JsonRecord> {
    return {
      codexHome: "/tmp/fake-codex-home",
      platformFamily: "unix",
      platformOs: "macos",
      userAgent: "fake-codex-app-server",
    };
  }

  async request(method: string, params: unknown): Promise<unknown> {
    this.requests.push({ method, params });
    if (method === "thread/start") {
      return {
        thread: {
          id: "codex_thread_fake",
        },
      };
    }
    if (method === "turn/start") {
      setTimeout(() => {
        void this.options.onServerRequest(
          {
            method: "item/tool/call",
            id: 99,
            params: {},
          },
          this,
        );
        this.options.onNotification({
          method: "agent-message/delta",
          params: {
            threadId: "codex_thread_fake",
            turnId: "codex_turn_fake",
            itemId: "agent_message_fake",
            delta: "Hello ",
          },
        });
        this.options.onNotification({
          method: "agent-message/delta",
          params: {
            threadId: "codex_thread_fake",
            turnId: "codex_turn_fake",
            itemId: "agent_message_fake",
            delta: "from Codex.",
          },
        });
        this.options.onNotification({
          method: "turn/completed",
          params: {
            threadId: "codex_thread_fake",
            turn: {
              id: "codex_turn_fake",
              status: "completed",
              error: null,
              items: [
                {
                  type: "agentMessage",
                  id: "agent_message_fake",
                  text: "Hello from Codex.",
                  phase: null,
                  memoryCitation: null,
                },
              ],
            },
          },
        });
      }, 0);
      return {
        turn: {
          id: "codex_turn_fake",
          status: "inProgress",
          items: [],
        },
      };
    }
    throw new Error(`unexpected method ${method}`);
  }

  notify(): void {}

  respond(): void {}

  respondError(id: unknown, code: number, message: string): void {
    this.errors.push({ id, code, message });
  }

  async stop(): Promise<void> {}
}

function proveSourceBoundary(): void {
  const clientSource = readText(
    "services/polynet-codex-worker/src/codexStdioAppServerClient.ts",
  );
  const serverSource = readText("services/polynet-codex-worker/src/server.ts");
  const packageJson = readText("package.json");
  assert.equal(/daytona|blaxel/i.test(clientSource), false);
  assert.ok(clientSource.includes('"app-server", "--listen", "stdio://"'));
  assert.ok(clientSource.includes('"thread/start"'));
  assert.ok(clientSource.includes('"turn/start"'));
  assert.ok(clientSource.includes('"agent-message/delta"'));
  assert.ok(clientSource.includes('"turn/completed"'));
  assert.ok(clientSource.includes("approvalPolicy: \"on-request\""));
  assert.ok(clientSource.includes("sandbox: \"read-only\""));
  assert.ok(clientSource.includes("networkAccess: false"));
  assert.ok(serverSource.includes("codex_stdio"));
  assert.ok(packageJson.includes("check:polynet-codex-worker-codex-stdio-contract-proof"));
}

async function proveRunContractWithFakeClient(): Promise<void> {
  let fakeClient: FakeCodexStdioClient | null = null;
  const result = await runCodexStdioAppServerRequest({
    payload: buildPayload(),
    config: {
      codexBin: "codex",
      cwd: root,
      timeoutMs: 10_000,
    },
    createClient: (options) => {
      fakeClient = new FakeCodexStdioClient(options);
      return fakeClient as any;
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.assistantText, "Hello from Codex.");
  assert.equal(result.promptTokens, null);
  assert.equal(result.completionTokens, null);
  assert.ok(fakeClient);

  const requests = fakeClient!.requests;
  assert.deepEqual(
    requests.map((request) => request.method),
    ["thread/start", "turn/start"],
  );
  const threadStart = asRecord(requests[0].params);
  assert.equal(threadStart.model, "gpt-5.5");
  assert.equal(threadStart.cwd, root);
  assert.equal(threadStart.approvalPolicy, "on-request");
  assert.equal(threadStart.sandbox, "read-only");
  assert.equal(threadStart.ephemeral, true);
  assert.equal(asRecord(threadStart.config).web_search, false);
  assert.equal(
    threadStart.developerInstructions,
    "Use the PolyNet Codex runtime authority.",
  );

  const turnStart = asRecord(requests[1].params);
  assert.equal(turnStart.threadId, "codex_thread_fake");
  assert.equal(turnStart.approvalPolicy, "on-request");
  assert.equal(asRecord(turnStart.sandboxPolicy).type, "readOnly");
  assert.equal(asRecord(turnStart.sandboxPolicy).networkAccess, false);
  assert.deepEqual(turnStart.input, [
    { type: "text", text: secretPrompt, text_elements: [] },
  ]);

  assert.equal(fakeClient!.errors.length, 1);
  assert.equal(fakeClient!.errors[0].id, 99);
  assert.equal(fakeClient!.errors[0].code, -32000);
  assert.equal(JSON.stringify(result).includes(secretPrompt), false);
}

async function proveLocalCodexAppServerReadiness(): Promise<void> {
  const result = await probeCodexStdioAppServer({
    config: {
      codexBin: "codex",
      cwd: root,
      timeoutMs: 20_000,
    },
  });
  assert.equal(result.ok, true);
  assert.ok(result.result.userAgent?.includes("Codex"));
  assert.ok(result.result.codexHome?.includes(".codex"));
  assert.ok(result.result.platformFamily);
  assert.ok(result.result.platformOs);
}

proveSourceBoundary();
await proveRunContractWithFakeClient();
await proveLocalCodexAppServerReadiness();

console.log("polynet_codex_worker_codex_stdio_contract_proof: ok");
