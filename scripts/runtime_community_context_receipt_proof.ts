import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RUNTIME_COMMUNITY_CONTEXT_RECEIPT_TOOL_NAMES,
  RUNTIME_COMMUNITY_CONTEXT_RECEIPT_VERSION,
  projectRuntimeCommunityContextEventPayload,
  readRuntimeCommunityContextReceipt,
  runtimeCommunityContextReceiptResultSummary,
} from "../shared/runtimeCommunityContextReceipt.ts";
import { buildRuntimeContextFragmentsFromParts } from "../shared/runtimeContextFragments.ts";
import { buildRuntimeLiveTimeline } from "../shared/runtimeTimelineUi.ts";
import { buildRuntimeRecentToolAttemptsFromEvents } from "../shared/runtimeTurnContextPacket.ts";

function record(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  assert.ok(Array.isArray(value));
  return value;
}

function project(
  eventType: string,
  payload: Record<string, unknown>,
  communityScopeId: unknown = null,
): Record<string, unknown> {
  return record(
    projectRuntimeCommunityContextEventPayload({ eventType, payload, communityScopeId }),
  );
}

const expectedTools = [
  "polynet_list",
  "polynet_read",
  "community_search",
  "community_memory_search",
  "community_memory_read",
  "community_chat_search",
  "community_chat_read",
  "community_ai_feed_search",
  "community_ai_feed_read",
  "community_resources_map",
  "community_resources_list",
  "community_resources_read",
  "community_resource_read",
  "community_resources_search",
];
assert.deepEqual([...RUNTIME_COMMUNITY_CONTEXT_RECEIPT_TOOL_NAMES], expectedTools);

const started = project("tool_call_started", {
  run_id: "run_1",
  tool_call_id: "call_1",
  provider_call_id: "provider_1",
  tool_name: "community_chat_search",
  community_scope_id: "community_1",
  args: {
    query: "private acquisition strategy",
    limit: 7,
    headers: { authorization: "Bearer secret-session-token" },
    body_md: "private source body",
  },
  attempt: 1,
  harness: { kind: "chat_tools", secret: "do-not-store" },
}, "community_1");
assert.equal(started.tool_name, "community_chat_search");
assert.equal(started.community_scope_id, "community_1");
assert.equal(started.status, "running");
assert.equal(started.error_code, null);
assert.equal("args" in started, false);
assert.equal("arguments" in started, false);
const startedReceipt = record(started.community_context_receipt);
assert.equal(startedReceipt.version, RUNTIME_COMMUNITY_CONTEXT_RECEIPT_VERSION);
assert.equal(startedReceipt.phase, "started");
const startedInput = record(startedReceipt.input);
assert.equal(startedInput.query_present, true);
assert.equal(startedInput.query_char_count, "private acquisition strategy".length);
assert.equal(record(startedInput.numeric_options).limit, 7);
const startedSerialized = JSON.stringify(started);
for (const forbidden of [
  "private acquisition strategy",
  "secret-session-token",
  "private source body",
  "do-not-store",
]) {
  assert.equal(startedSerialized.includes(forbidden), false, `started receipt leaked ${forbidden}`);
}

const finished = project("tool_call_finished", {
  run_id: "run_1",
  tool_call_id: "call_1",
  provider_call_id: "provider_1",
  tool_name: "community_chat_search",
  community_scope_id: "community_1",
  args: { query: "private acquisition strategy", limit: 7 },
  status: "ok",
  success: true,
  output: JSON.stringify({
    ok: true,
    matches: [
      {
        ref: "interaction:root:root_1",
        source_id: "interaction:root:root_1",
        snippet: "private conversation text",
      },
    ],
    retrieval_id: "evidence_receipt_1",
    source_counts: { interaction: 1, ai_feed: 0, resource: 0 },
  }),
  output_preview: "private conversation text",
  details: { transcript: "private transcript" },
  harness: { kind: "chat_tools" },
}, "community_1");
for (const forbiddenKey of ["args", "arguments", "output", "output_preview", "details"]) {
  assert.equal(forbiddenKey in finished, false, `finished receipt retained ${forbiddenKey}`);
}
const finishedReceipt = record(readRuntimeCommunityContextReceipt(finished));
assert.equal(finishedReceipt.phase, "finished");
const finishedResult = record(finishedReceipt.result);
assert.equal(finishedResult.parse_status, "parsed");
assert.equal(finishedResult.item_count, 1);
assert.deepEqual(finishedResult.refs, ["interaction:root:root_1"]);
assert.deepEqual(finishedResult.source_ids, ["interaction:root:root_1"]);
assert.deepEqual(finishedResult.retrieval_ids, ["evidence_receipt_1"]);
assert.deepEqual(record(finishedResult.source_counts).source_counts, {
  interaction: 1,
  ai_feed: 0,
  resource: 0,
});
assert.equal(JSON.stringify(finished).includes("private conversation text"), false);
assert.equal(JSON.stringify(finished).includes("private transcript"), false);
assert.equal(
  runtimeCommunityContextReceiptResultSummary(finished),
  "1 item; 1 reference; 1 retrieval receipt",
);

const chatResultShape = project("tool_call_finished", {
  tool_name: "community_chat_search",
  status: "ok",
  success: true,
  output: JSON.stringify({
    ok: true,
    results: [{ ref: "interaction:root:root_2" }, { ref: "interaction:reply:reply_1" }],
  }),
});
assert.equal(record(record(chatResultShape.community_context_receipt).result).item_count, 2);

const memoryFinished = project("tool_call_finished", {
  tool_name: "community_memory_search",
  status: "ok",
  success: true,
  args: { query: "private memory query", types: ["playbook"], limit: 3 },
  output: JSON.stringify({
    ok: true,
    nodes: [{ id: "node_1", title: "private title", body_md: "private memory body" }],
    retrieval_log_id: "memory_receipt_1",
    retrieval_receipt: {
      version: "community_memory_retrieval_receipt:v1",
      surface: "member_agent_dock",
      retrieved_node_ids: ["node_1"],
      injected_node_ids: [],
    },
  }),
});
const memoryResult = record(record(memoryFinished.community_context_receipt).result);
assert.deepEqual(memoryResult.node_ids, ["node_1"]);
assert.deepEqual(memoryResult.retrieval_ids, ["memory_receipt_1"]);
assert.equal(memoryResult.retrieval_receipt_surface, "member_agent_dock");
assert.equal(
  memoryResult.retrieval_receipt_version,
  "community_memory_retrieval_receipt:v1",
);
assert.equal(JSON.stringify(memoryFinished).includes("private memory body"), false);
assert.equal(JSON.stringify(memoryFinished).includes("private title"), false);
assert.equal(JSON.stringify(memoryFinished).includes("private memory query"), false);

const malformed = project("tool_call_finished", {
  tool_name: "community_resources_search",
  status: "ok",
  success: true,
  args: { query: "private resource query" },
  output: "not-json private resource contents",
});
const malformedResult = record(record(malformed.community_context_receipt).result);
assert.equal(malformedResult.parse_status, "unparseable");
assert.equal(malformedResult.raw_output_char_count, "not-json private resource contents".length);
assert.equal(JSON.stringify(malformed).includes("private resource contents"), false);

const boundedError = project("tool_call_finished", {
  tool_name: "community_memory_read",
  status: "error",
  success: false,
  error_code: "provider_failed",
  error_message: "Authorization:Bearer abc.def.ghi access_token=super-secret-value",
  args: { node_id: "node_2" },
}, "community_1");
assert.equal("error_message" in boundedError, false);
assert.equal("errorMessage" in boundedError, false);
assert.equal(boundedError.error_code, "provider_failed");
assert.equal(boundedError.status, "error");
assert.equal(boundedError.success, false);
const boundedErrorSerialized = JSON.stringify(boundedError);
assert.equal(boundedErrorSerialized.includes("super-secret-value"), false);
assert.equal(boundedErrorSerialized.includes("abc.def.ghi"), false);

const malformedError = project("tool_call_finished", {
  tool_name: "community_memory_read",
  community_scope_id: "forged_payload_scope",
  status: "error Bearer secret-status-token",
  success: false,
  error_code: "Authorization: Bearer secret-error-code",
  error_message: "access_token=secret-error-message",
}, "community_from_run");
assert.equal(malformedError.community_scope_id, "community_from_run");
assert.equal(malformedError.status, "error");
assert.equal(malformedError.error_code, "community_context_tool_failed");
const malformedErrorSerialized = JSON.stringify(malformedError);
for (const forbidden of [
  "forged_payload_scope",
  "secret-status-token",
  "secret-error-code",
  "secret-error-message",
]) {
  assert.equal(malformedErrorSerialized.includes(forbidden), false);
}

const successfulWithInjectedFailure = project("tool_call_finished", {
  tool_name: "community_chat_search",
  status: "ok",
  success: true,
  error_code: "provider_failed",
});
assert.equal(successfulWithInjectedFailure.status, "ok");
assert.equal(successfulWithInjectedFailure.success, true);
assert.equal(successfulWithInjectedFailure.error_code, null);

const failedAttempts = buildRuntimeRecentToolAttemptsFromEvents({
  events: [
    {
      eventType: "tool_call_finished",
      payload: boundedError,
      createdAt: Date.now(),
    },
  ],
});
assert.equal(failedAttempts.length, 1);
assert.equal(failedAttempts[0]?.toolName, "community_memory_read");
assert.equal(failedAttempts[0]?.status, "error");
assert.equal(failedAttempts[0]?.errorCode, "provider_failed");
assert.equal(failedAttempts[0]?.errorMessage, null);

const failedFragments = buildRuntimeContextFragmentsFromParts({
  runtimeRunEvents: [
    {
      seq: 3,
      eventType: "tool_call_finished",
      payload: boundedError,
      createdAt: Date.now(),
    },
  ],
});
const failedActionLedger = failedFragments.find((fragment) => fragment.kind === "action_ledger");
assert.ok(failedActionLedger);
assert.match(failedActionLedger.body, /status=error/);
assert.match(failedActionLedger.body, /error_code=provider_failed/);
assert.equal(failedActionLedger.body.includes("super-secret-value"), false);

const ambiguousFinished = project("tool_call_finished", {
  tool_name: "community_resources_map",
});
assert.equal(ambiguousFinished.status, "unknown");
assert.equal(ambiguousFinished.success, null);

const finishedWithRunScope = record(
  projectRuntimeCommunityContextEventPayload({
    eventType: "tool_call_finished",
    communityScopeId: "community_from_run",
    payload: {
      tool_name: "community_chat_search",
      community_scope_id: "forged_payload_scope",
      status: "ok",
      success: true,
    },
  }),
);
assert.equal(finishedWithRunScope.community_scope_id, "community_from_run");

const finishedWithoutRunScope = record(
  projectRuntimeCommunityContextEventPayload({
    eventType: "tool_call_finished",
    communityScopeId: null,
    payload: {
      tool_name: "community_chat_search",
      community_scope_id: "forged_payload_scope",
      status: "ok",
      success: true,
    },
  }),
);
assert.equal(finishedWithoutRunScope.community_scope_id, null);

const builderPayload = {
  tool_name: "polynet_write",
  args: { summary: "must remain for Apply or Reject UI" },
  output: "must remain for Apply or Reject UI",
};
assert.strictEqual(
  projectRuntimeCommunityContextEventPayload({
    eventType: "tool_call_finished",
    payload: builderPayload,
    communityScopeId: null,
  }),
  builderPayload,
);
const unrelatedPayload = { tool_name: "web_research", args: { query: "kept" }, output: "kept" };
assert.strictEqual(
  projectRuntimeCommunityContextEventPayload({
    eventType: "tool_call_finished",
    payload: unrelatedPayload,
    communityScopeId: null,
  }),
  unrelatedPayload,
);
assert.strictEqual(
  projectRuntimeCommunityContextEventPayload({
    eventType: "run_started",
    payload: unrelatedPayload,
    communityScopeId: null,
  }),
  unrelatedPayload,
);

const resourceStarted = project("tool_call_started", {
  run_id: "run_2",
  tool_call_id: "call_2",
  tool_name: "community_resource_read",
  args: { ref: "resource:resource_1", limit: 1_000 },
});
const resourceFinished = project("tool_call_finished", {
  run_id: "run_2",
  tool_call_id: "call_2",
  tool_name: "community_resource_read",
  status: "ok",
  success: true,
  args: { ref: "resource:resource_1", limit: 1_000 },
  output: JSON.stringify({
    ok: true,
    resource: { ref: "resource:resource_1", body_md: "private resource body" },
    retrieval_id: "resource_receipt_1",
  }),
});
const timeline = buildRuntimeLiveTimeline([
  { seq: 1, event_type: "tool_call_started", payload: resourceStarted },
  { seq: 2, event_type: "tool_call_finished", payload: resourceFinished },
]);
const timelineSerialized = JSON.stringify(timeline);
assert.match(timelineSerialized, /Read resource: resource:resource_1/);
assert.equal(timelineSerialized.includes("private resource body"), false);

const fragments = buildRuntimeContextFragmentsFromParts({
  runtimeRunEvents: [
    {
      seq: 2,
      eventType: "tool_call_finished",
      payload: resourceFinished,
      createdAt: Date.now(),
    },
  ],
});
const actionLedger = fragments.find((fragment) => fragment.kind === "action_ledger");
assert.ok(actionLedger);
assert.match(actionLedger.body, /target=resource:resource_1/);
assert.equal(actionLedger.body.includes("private resource body"), false);

const threads = readFileSync(new URL("../convex/threads.ts", import.meta.url), "utf8");
assert.equal(
  (threads.match(/projectRuntimeCommunityContextEventPayload\(/g) ?? []).length,
  1,
  "the runtime event append path must project payloads",
);
assert.match(
  threads,
  /const persistedPayload = projectRuntimeCommunityContextEventPayload\([\s\S]*?communityScopeId: run\.communityId[\s\S]*?applyRuntimeHarnessTelemetryEvent\([\s\S]*?payload: persistedPayload[\s\S]*?runtimeRunEvents[\s\S]*?payload: persistedPayload/,
);

console.log("runtime_community_context_receipt_proof: ok");
