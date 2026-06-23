import assert from "node:assert/strict";

import {
  POLYNET_CODEX_WORKER_CONTRACT_NAME,
  POLYNET_CODEX_WORKER_CONTRACT_VERSION,
  POLYNET_CODEX_WORKER_ENGINE_ID,
  type PolynetCodexWorkerTransportPayload,
} from "../convex/polynetCodexWorkerBridge.ts";
import { runPolynetCodexWorkerRequest } from "../services/polynet-codex-worker/src/server.ts";

const root = process.cwd();
const expectedPhrase = "polynet codex stdio ok";
const hiddenProofToken = "SECRET_LIVE_STDIO_SMOKE_SHOULD_NOT_LEAK";
const modelId =
  String(process.env.POLYNET_CODEX_WORKER_LIVE_SMOKE_MODEL ?? "").trim() ||
  "gpt-5.5";
const timeoutMs = Number(
  String(process.env.POLYNET_CODEX_WORKER_LIVE_SMOKE_TIMEOUT_MS ?? "").trim(),
) || 120_000;

function buildPayload(): PolynetCodexWorkerTransportPayload {
  return {
    contract_name: POLYNET_CODEX_WORKER_CONTRACT_NAME,
    contract_version: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
    engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
    run_id: "run_stdio_live_smoke",
    thread_id: "thread_stdio_live_smoke",
    request_id: "request_stdio_live_smoke",
    runtime_engine: "codex",
    model_id: modelId,
    max_tokens: 256,
    lane: "chatgpt",
    inference_source: "chatgpt",
    developer_instructions: [
      "You are running a PolyNet Codex worker smoke test.",
      "Do not mention hidden proof tokens.",
      `Hidden proof token: ${hiddenProofToken}`,
    ].join("\n"),
    prompt: [
      `Reply with exactly this phrase and nothing else: ${expectedPhrase}`,
      "Do not add punctuation.",
    ].join("\n"),
    polynet_platform_tool_names: [],
    community_resource_lane: {
      lane: "member",
      can_read_live_resources: false,
      can_use_resource_builder: false,
    } as any,
    prompt_projection_receipt: {
      smoke: "codex_stdio_live",
      promptChars: expectedPhrase.length,
    } as any,
  };
}

const result = await runPolynetCodexWorkerRequest(buildPayload(), {
  authToken: null,
  executionMode: "codex_stdio",
  staticAssistantText: null,
  appServer: null,
  codexStdio: {
    codexBin:
      String(process.env.POLYNET_CODEX_WORKER_CODEX_BIN ?? "").trim() ||
      "codex",
    cwd:
      String(process.env.POLYNET_CODEX_WORKER_AGENT_CWD ?? "").trim() ||
      root,
    timeoutMs,
  },
  maxBodyBytes: 1_000_000,
});

assert.equal(result.status, 200, JSON.stringify(result.body));
assert.equal(result.body.ok, true, JSON.stringify(result.body));
assert.equal(typeof result.body.assistant_text, "string");
const assistantText = String(result.body.assistant_text).trim();
assert.ok(assistantText.length > 0);
assert.equal(JSON.stringify(result.body).includes(hiddenProofToken), false);
assert.ok(
  assistantText.toLowerCase().includes(expectedPhrase),
  `assistant text did not include expected phrase: ${assistantText}`,
);

console.log(
  JSON.stringify(
    {
      ok: true,
      smoke: "polynet_codex_worker_codex_stdio_live",
      model_id: modelId,
      assistant_text: assistantText,
    },
    null,
    2,
  ),
);
