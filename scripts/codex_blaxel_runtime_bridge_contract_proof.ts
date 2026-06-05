import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeCodexAppServerNotification } from "../shared/codexAppServerEventNormalizer.ts";
import { mintCodexBridgeRunToken, verifyCodexBridgeRunToken } from "../convex/codexBridgeToken.ts";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function assertIncludes(source: string, needle: string, message: string): void {
  assert.ok(source.includes(needle), message);
}

function assertOrderWithin(source: string, startNeedle: string, orderedNeedles: string[], message: string): void {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `${message}: missing start ${startNeedle}`);
  let cursor = start;
  for (const needle of orderedNeedles) {
    const index = source.indexOf(needle, cursor + 1);
    assert.notEqual(index, -1, `${message}: missing ${needle}`);
    assert.ok(index > cursor, `${message}: expected ${needle} after prior invariant`);
    cursor = index;
  }
}

const assistantDelta = normalizeCodexAppServerNotification({
  runId: "run_1",
  ordinal: 7,
  message: {
    method: "item/agentMessage/delta",
    params: {
      threadId: "codex_thread_1",
      turnId: "codex_turn_1",
      itemId: "assistant_item_1",
      delta: "hello",
    },
  },
});
assert.equal(assistantDelta?.eventType, "assistant_text_delta");
assert.equal(assistantDelta?.payload.delta, "hello");
assert.equal(assistantDelta?.assistantTextDelta, "hello");
assert.match(assistantDelta?.eventKey ?? "", /assistant_text_delta/);

const reasoningDelta = normalizeCodexAppServerNotification({
  runId: "run_1",
  ordinal: 8,
  message: {
    method: "item/agentReasoning/delta",
    params: {
      threadId: "codex_thread_1",
      turnId: "codex_turn_1",
      itemId: "reasoning_item_1",
      delta: "thinking",
    },
  },
});
assert.equal(reasoningDelta?.eventType, "reasoning_summary_text_delta");
assert.equal(reasoningDelta?.payload.delta, "thinking");
assert.equal(reasoningDelta?.payload.summary_index, 0);

const toolStarted = normalizeCodexAppServerNotification({
  runId: "run_1",
  ordinal: 9,
  message: {
    method: "item/started",
    params: {
      threadId: "codex_thread_1",
      turnId: "codex_turn_1",
      item: {
        id: "tool_item_1",
        type: "toolCall",
        name: "bash",
        args: {
          command: "pwd",
        },
      },
    },
  },
});
assert.equal(toolStarted?.eventType, "tool_call_started");
assert.equal(toolStarted?.payload.tool_name, "bash");
assert.deepEqual(toolStarted?.payload.args, { command: "pwd" });

const toolFinished = normalizeCodexAppServerNotification({
  runId: "run_1",
  ordinal: 10,
  message: {
    method: "item/completed",
    params: {
      threadId: "codex_thread_1",
      turnId: "codex_turn_1",
      item: {
        id: "tool_item_1",
        type: "toolCall",
        name: "bash",
        status: "completed",
        output: "/workspace",
      },
    },
  },
});
assert.equal(toolFinished?.eventType, "tool_call_finished");
assert.equal(toolFinished?.payload.status, "ok");
assert.equal(toolFinished?.payload.output_text, "/workspace");

const skipped = normalizeCodexAppServerNotification({
  runId: "run_1",
  ordinal: 11,
  message: {
    method: "account/updated",
    params: {},
  },
});
assert.equal(skipped, null);

const secret = "x".repeat(48);
const token = await mintCodexBridgeRunToken({
  runId: "run_1",
  ownerId: "owner_1",
  threadId: "thread_1",
  operations: ["event"],
  nowMs: 10_000,
  ttlMs: 60_000,
  secret,
});
assert.equal(token.ok, true);
if (!token.ok) throw new Error("token mint failed");
const verifiedEvent = await verifyCodexBridgeRunToken({
  token: token.token,
  requiredOperation: "event",
  nowMs: 20_000,
  secret,
});
assert.equal(verifiedEvent.ok, true);
const deniedFinish = await verifyCodexBridgeRunToken({
  token: token.token,
  requiredOperation: "finish",
  nowMs: 20_000,
  secret,
});
assert.equal(deniedFinish.ok, false);
if (deniedFinish.ok) throw new Error("finish should be denied");
assert.equal(deniedFinish.code, "codex_bridge_token_operation_denied");
const expired = await verifyCodexBridgeRunToken({
  token: token.token,
  requiredOperation: "event",
  nowMs: 80_001,
  secret,
});
assert.equal(expired.ok, false);
if (expired.ok) throw new Error("expired token should fail");
assert.equal(expired.code, "codex_bridge_token_expired");
const tamperedToken = `${token.token.slice(0, -1)}${token.token.endsWith("x") ? "y" : "x"}`;
const tampered = await verifyCodexBridgeRunToken({
  token: tamperedToken,
  requiredOperation: "event",
  nowMs: 20_000,
  secret,
});
assert.equal(tampered.ok, false);
if (tampered.ok) throw new Error("tampered token should fail");
assert.equal(tampered.code, "codex_bridge_token_invalid");

const httpBridge = read("convex/httpCodexBridge.ts");
assertIncludes(httpBridge, 'path: "/runtime/codex_bridge/event"', "event callback route must be registered");
assertIncludes(httpBridge, 'path: "/runtime/codex_bridge/finish"', "finish callback route must be registered");
assertIncludes(httpBridge, "verifyCodexBridgeRunToken", "callbacks must verify bridge tokens");
assertIncludes(httpBridge, "normalizeCodexAppServerNotification", "event callback must normalize Codex messages server-side");
assertIncludes(httpBridge, "appendCloudRuntimeRunEventByBridgeClaimsInternal", "events must append through bridge-claim mutation");
assertIncludes(httpBridge, "finishCloudRuntimeRunByBridgeClaimsInternal", "finish must go through bridge-claim finalizer");
assertIncludes(httpBridge, "detail: redactSensitiveText(message)", "bridge callback failures must return sanitized diagnostic detail");

const threads = read("convex/threads.ts");
assertIncludes(threads, "appendCloudRuntimeRunEventByBridgeClaimsInternal", "bridge event internal mutation must exist");
assertIncludes(threads, "finishCloudRuntimeRunByBridgeClaimsInternal", "bridge finish internal mutation must exist");
assertIncludes(threads, "assertRuntimeRunMatchesBridgeClaims", "bridge mutations must validate run claims");
assertIncludes(threads, "runtime_run_already_finished", "bridge event append must reject new events after finalization");
assertIncludes(threads, 'engineId: "codex_blaxel_app_server"', "assistant message must be attributed to Codex Blaxel runtime");
assertOrderWithin(
  threads,
  "async function appendRuntimeRunEventByBridgeClaims",
  [
    "if (existing) return existing;",
    'if (run.status !== "running") throw new Error("runtime_run_already_finished");',
    "const seq = Math.max(0, Math.floor(run.lastEventSeq ?? 0)) + 1;",
  ],
  "bridge event append must allow duplicate idempotency before rejecting terminal runs",
);
assertOrderWithin(
  threads,
  "export const finishCloudRuntimeRunByBridgeClaimsInternal",
  [
    "assertRuntimeRunMatchesBridgeClaims({",
    'if (run.status !== "running") return run;',
    "await upsertBridgeAssistantMessage({",
    "return await finalizeRuntimeRunRecord({",
  ],
  "bridge finish replay must return before assistant message upsert on terminal runs",
);

const bridge = read("convex/codexBlaxelAppServerBridge.ts");
assertIncludes(bridge, "buildCodexWebSocketRuntimeBridgeClientCommand", "runtime bridge client command must exist");
assertIncludes(bridge, "codexMessage: message", "runtime bridge client must post raw Codex notifications for server normalization");
assertIncludes(bridge, "finishBridge('succeeded'", "runtime bridge client must finish successful runs");
assertIncludes(bridge, "POLYNET_CODEX_RUNTIME_PAYLOADS_REMOVED", "runtime bridge client must remove auth/runtime payloads");

const action = read("convex/blaxelCodexRuntimeTurn.ts");
assertIncludes(action, "runBlaxelCodexRuntimeTurn", "productized Blaxel Codex runtime action must exist");
assertIncludes(action, "ensureCloudRuntimeRunStartedByOwnerInternal", "action must create a real runtime run");
assertIncludes(action, "mintCodexBridgeRunToken", "action must mint a scoped bridge token");
assertIncludes(action, "setCloudRuntimeRunContextSnapshotInternal", "action must persist context snapshots");
assertIncludes(action, "eventSummary", "action must return a runtime event summary for staging verification");
assertIncludes(action, "isWorkspaceProcessTerminalStatus", "runtime action must gate Blaxel process completion on terminal status");
assertIncludes(action, "throwIfRuntimeRunCancelled", "runtime action must observe user cancellation while waiting on Blaxel");
assertIncludes(action, "USER_CANCELLED_RUNTIME_CODE", "runtime action must preserve canonical cancellation status codes");
assertIncludes(
  action,
  "isWorkspaceProcessTerminalStatus(current.status) || (exitCode !== undefined && !normalizeString(current.status))",
  "runtime action must not treat a running Blaxel process with exitCode 0 as complete",
);
assertIncludes(
  action,
  'safeResourceName(`${runId}-${randomUUID().slice(0, 8)}`).slice(-25)',
  "runtime sandbox and volume names must fit Blaxel's 49 character resource limit",
);
assertIncludes(action, "const threadCommunityId = normalizeString(thread.communityId);", "action must normalize thread community lens once");
assertIncludes(
  action,
  "communityContextVersion: threadCommunityId && Number.isFinite(Number(thread.contextVersion))",
  "action must not send community context version without a community lens",
);
assertOrderWithin(
  action,
  "async function throwIfCancelledAndStopBridgeProcess",
  [
    "await throwIfRuntimeRunCancelled({",
    "if (isRuntimeRunCancelledError(error)) {",
    "await stopBlaxelWorkspaceProcess({",
    "throw error;",
  ],
  "runtime cancellation must stop the active Blaxel client process before surfacing cancellation",
);
assertOrderWithin(
  action,
  "async function waitForBridgeProcessCompletion(params: {",
  [
    "ctx: any;",
    "ownerId: any;",
    "runId: string;",
    "await throwIfCancelledAndStopBridgeProcess(params);",
    "await sleep(params.intervalMs);",
    "await throwIfCancelledAndStopBridgeProcess(params);",
  ],
  "runtime wait loop must check cancellation before and after sleeping",
);
assertIncludes(action, "let clientProcessName: string | null = null;", "runtime action must track the Codex client process for cleanup");
assertIncludes(
  action,
  "ownerId: actor.userId as any,\n            runId,\n            sandboxName: names.sandboxName",
  "runtime process wait must receive run identity for cancellation checks",
);
assertOrderWithin(
  action,
  "} catch (error) {",
  [
    "const wasCancelled = isRuntimeRunCancelledError(error);",
    "const failureCode = wasCancelled",
    "USER_CANCELLED_RUNTIME_CODE",
    'status: wasCancelled ? "cancelled" : "error",',
    "failure: safeFailure(failureCode, message)",
  ],
  "runtime cancellation must finalize as cancelled instead of generic runtime failure",
);
assertOrderWithin(
  action,
  "finally {",
  [
    "if (clientProcessName) {",
    "processName: clientProcessName",
    "if (webSocketProcessName) {",
  ],
  "runtime cleanup must stop the Codex client before the websocket sidecar",
);
assert.doesNotMatch(action, /\bowner_id:\s*actor\.userId\b/, "Blaxel labels must not include raw owner ids");
assert.doesNotMatch(action, /\brun_id:\s*runId\b/, "Blaxel labels must not include raw runtime run ids");

const uiRecovery = read("apps/web/src/controllers/useWebRuntimeRunLifecycle.ts");
assertIncludes(uiRecovery, "assistant_text_delta", "recovery polling must understand assistant text deltas");
assertIncludes(uiRecovery, "readAssistantTextDelta", "recovery polling must assemble assistant delta content");

const stagingSmoke = read("scripts/codex_blaxel_runtime_bridge_staging_smoke.ts");
assertIncludes(stagingSmoke, "blaxelCodexRuntimeTurn:runBlaxelCodexRuntimeTurn", "staging smoke must call the productized action");
assertIncludes(stagingSmoke, "hasAssistantTextDelta", "staging smoke must verify assistant delta events");
assertIncludes(stagingSmoke, "hasRunFinished", "staging smoke must verify run completion events");

const packageJson = read("package.json");
assertIncludes(packageJson, "smoke:codex-blaxel-runtime-bridge-staging", "package scripts must expose the staging bridge smoke");

console.log("codex_blaxel_runtime_bridge_contract_proof: ok");
