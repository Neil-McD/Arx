import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildChatgptCodexRequestHeaders,
  buildChatgptCodexRequestPayload,
  classifyChatgptCodexHttpFailure,
} from "../convex/chatgptResponsesTransport.ts";

function readRepoFile(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function proveCodexHeadersUseChatgptAuthEnvelope() {
  const headers = buildChatgptCodexRequestHeaders({
    auth: {
      accessToken: "access-token",
      accountId: "acct_123",
    },
    requestMetadata: {
      sessionId: "session_123",
      threadId: "thread_456",
    },
  });

  assert.equal(headers.get("authorization"), "Bearer access-token");
  assert.equal(headers.get("chatgpt-account-id"), "acct_123");
  assert.equal(headers.get("originator"), "codex_cli_rs");
  assert.equal(headers.get("session-id"), "session_123");
  assert.equal(headers.get("thread-id"), "thread_456");
  assert.equal(headers.get("accept"), "text/event-stream");
  assert.match(headers.get("user-agent") ?? "", /^codex_cli_rs\//);

  const headerKeys = Array.from(headers.keys()).join("\n").toLowerCase();
  assert.equal(headerKeys.includes("api-key"), false, "ChatGPT auth path must not add API key headers");

  console.log("PASS: ChatGPT auth headers match the Codex request envelope");
}

function proveFallbackIdsAreStableAndHeaderSafe() {
  const first = buildChatgptCodexRequestHeaders({
    auth: {
      accessToken: "access-token",
      accountId: "acct_123\nbad",
    },
    requestMetadata: {
      userId: "user_123\nbad",
    },
  });
  const second = buildChatgptCodexRequestHeaders({
    auth: {
      accessToken: "access-token",
      accountId: "acct_123\nbad",
    },
    requestMetadata: {
      userId: "user_123\nbad",
    },
  });

  assert.match(first.get("session-id") ?? "", /^polynet-session-/);
  assert.match(first.get("thread-id") ?? "", /^polynet-thread-/);
  assert.equal(first.get("session-id"), second.get("session-id"));
  assert.equal(first.get("thread-id"), second.get("thread-id"));
  assert.equal(first.get("chatgpt-account-id"), "acct_123 bad");
  assert.doesNotMatch(first.get("chatgpt-account-id") ?? "", /[\r\n]/);

  console.log("PASS: fallback Codex IDs are deterministic and header-safe");
}

function proveCodexPayloadPreservesReasoningAndMetadata() {
  const payload = buildChatgptCodexRequestPayload({
    modelId: "gpt-5.5",
    maxTokens: 1200,
    messages: [
      {
        role: "system",
        content: "You are concise.",
      },
      {
        role: "user",
        content: "hello",
      },
    ],
    tools: [
      {
        type: "function",
        name: "list_dir",
        description: "List files",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {},
          required: [],
        },
        strict: true,
      },
    ],
    parallelToolCalls: false,
    reasoningSummary: "auto",
    reasoningEffort: "medium",
    requestMetadata: {
      installationId: "install_123",
    },
  });

  assert.equal(payload.model, "gpt-5.5");
  assert.equal(payload.store, false);
  assert.equal(payload.stream, true);
  assert.equal(Object.hasOwn(payload, "max_output_tokens"), false);
  assert.equal(payload.instructions, "You are concise.");
  assert.deepEqual(payload.include, ["reasoning.encrypted_content"]);
  assert.deepEqual(payload.reasoning, {
    effort: "medium",
    summary: "auto",
  });
  assert.deepEqual(payload.client_metadata, {
    "x-codex-installation-id": "install_123",
  });
  assert.equal(payload.tool_choice, "auto");
  assert.equal(payload.parallel_tool_calls, false);
  assert.equal(Array.isArray(payload.input), true);

  const forcedToolPayload = buildChatgptCodexRequestPayload({
    modelId: "gpt-5.5",
    maxTokens: 1200,
    messages: [{ role: "user", content: "orient" }],
    tools: [
      {
        type: "function",
        name: "get_active_community_context",
        description: "Read active community context",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {},
          required: [],
        },
        strict: true,
      },
    ],
    toolChoice: { type: "function", name: "get_active_community_context" },
  });
  assert.deepEqual(forcedToolPayload.tool_choice, {
    type: "function",
    name: "get_active_community_context",
  });

  const finalAnswerPayload = buildChatgptCodexRequestPayload({
    modelId: "gpt-5.5",
    maxTokens: 1200,
    messages: [{ role: "user", content: "answer" }],
    tools: [
      {
        type: "function",
        name: "get_active_community_context",
        description: "Read active community context",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {},
          required: [],
        },
        strict: true,
      },
    ],
    toolChoice: "none",
  });
  assert.equal(finalAnswerPayload.tool_choice, "none");

  const defaultMetadataPayload = buildChatgptCodexRequestPayload({
    modelId: "gpt-5.5",
    maxTokens: 1200,
    messages: [
      {
        role: "user",
        content: "hello",
      },
    ],
  });
  const defaultClientMetadata = defaultMetadataPayload.client_metadata as Record<string, unknown>;
  assert.match(
    String(defaultClientMetadata["x-codex-installation-id"] ?? ""),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );

  console.log("PASS: Codex payload preserves metadata, tool choice, streaming, and encrypted reasoning");
}

function proveFailureClassificationAvoidsBlind404s() {
  const usageLimit = classifyChatgptCodexHttpFailure({
    status: 404,
    bodyPreview: '{"error":{"code":"usage_limit_reached","message":"usage limit reached"}}',
  });
  assert.equal(usageLimit.status, 429);
  assert.equal(usageLimit.code, "provider_usage_limit");
  assert.equal(usageLimit.retryWithFreshAuth, false);

  const unsupportedModel = classifyChatgptCodexHttpFailure({
    status: 400,
    bodyPreview: "The selected model is not supported when using Codex with this account.",
  });
  assert.equal(unsupportedModel.status, 400);
  assert.equal(unsupportedModel.code, "provider_model_unavailable");
  assert.equal(unsupportedModel.retryWithFreshAuth, false);

  const transientNotFound = classifyChatgptCodexHttpFailure({
    status: 404,
    bodyPreview: null,
  });
  assert.equal(transientNotFound.status, 404);
  assert.equal(transientNotFound.code, "provider_error");
  assert.equal(transientNotFound.retryWithFreshAuth, true);

  console.log("PASS: Codex HTTP failures classify usage/model/transient cases separately");
}

function proveRuntimeCallersPassRealRequestMetadata() {
  const httpChatgpt = readRepoFile("convex/httpChatgpt.ts");
  const runtimeTurnHandlers = readRepoFile("convex/runtimeTurnHandlers.ts");
  const runtimeAgentLoop = readRepoFile("convex/runtimeAgentLoop.ts");

  const wrapperMetadataOccurrences = httpChatgpt.match(/requestMetadata\?: ChatgptCodexRequestMetadata \| null;/g) ?? [];
  assert.equal(
    wrapperMetadataOccurrences.length,
    3,
    "expected all ChatGPT wrapper entry points to accept Codex request metadata",
  );

  assert.match(
    runtimeTurnHandlers,
    /const chatgptCodexRequestMetadata = \{\s*sessionId: String\(ownedThread\._id\),\s*threadId: String\(ownedThread\._id\),\s*\};/s,
    "expected visible thread turns to derive Codex request metadata from the durable thread id",
  );
  const runtimeTurnMetadataUses = runtimeTurnHandlers.match(/requestMetadata: chatgptCodexRequestMetadata/g) ?? [];
  assert.equal(
    runtimeTurnMetadataUses.length,
    3,
    "expected streaming, non-streaming, and failure-finalization ChatGPT calls to pass metadata",
  );

  assert.match(
    runtimeAgentLoop,
    /requestMetadata\?: ChatgptCodexRequestMetadata \| null;/,
    "expected native tool completion helper to accept Codex request metadata",
  );
  assert.match(
    runtimeAgentLoop,
    /requestMetadata: params\.requestMetadata/,
    "expected native tool completion helper to forward Codex request metadata",
  );
  assert.match(
    runtimeAgentLoop,
    /const chatgptCodexRequestId = String\(params\.threadId \?\? ""\)\.trim\(\) \|\| params\.runId;/,
    "expected retrieval agent loop to normalize the Codex request id",
  );
  assert.match(
    runtimeAgentLoop,
    /requestMetadata: \{\s*sessionId: chatgptCodexRequestId,\s*threadId: chatgptCodexRequestId,\s*\}/s,
    "expected retrieval agent loop to pass thread/run metadata into ChatGPT native tool calls",
  );

  console.log("PASS: runtime ChatGPT callers pass durable Codex request metadata");
}

proveCodexHeadersUseChatgptAuthEnvelope();
proveFallbackIdsAreStableAndHeaderSafe();
proveCodexPayloadPreservesReasoningAndMetadata();
proveFailureClassificationAvoidsBlind404s();
proveRuntimeCallersPassRealRequestMetadata();
