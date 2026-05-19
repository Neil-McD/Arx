export const CODEX_HARNESS_PROBE_RESULT_MARKER = "POLYNET_CODEX_HARNESS_PROBE_RESULT ";
export const CODEX_HARNESS_PROBE_EVENT_MARKER = "POLYNET_CODEX_HARNESS_EVENT ";

export function buildCodexHarnessProbeScript(): string {
  return String.raw`import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const RESULT_MARKER = "POLYNET_CODEX_HARNESS_PROBE_RESULT ";
const EVENT_MARKER = "POLYNET_CODEX_HARNESS_EVENT ";
let harnessEventSequence = 0;
const timeoutMs = Number.parseInt(process.env.POLYNET_CODEX_PROBE_TIMEOUT_MS || "20000", 10);
const executionMode = String(process.env.POLYNET_CODEX_EXECUTION_MODE || "").trim().toLowerCase();
const executionSmokeRequested = /^(1|true|yes|on)$/i.test(
  String(process.env.POLYNET_CODEX_EXECUTION_SMOKE || "").trim(),
) || executionMode === "execution_canary";
const shadowTurnRequested = executionMode === "shadow_turn";
const primaryTurnRequested = executionMode === "primary_turn";
const toolCallCanaryRequested = executionMode === "tool_call_canary";
const promptBackedTurnRequested = shadowTurnRequested || primaryTurnRequested;
const runtimeTurnRequested = shadowTurnRequested || primaryTurnRequested || toolCallCanaryRequested;
const executionRequested = executionSmokeRequested || runtimeTurnRequested;
const executionExpectedText =
  String(process.env.POLYNET_CODEX_EXECUTION_EXPECTED || "").trim() ||
  "polynet codex execution ok";
const executionModel =
  String(process.env.POLYNET_CODEX_EXECUTION_MODEL || "").trim() ||
  "gpt-5.3-codex-spark";
const shadowPromptFile = String(process.env.POLYNET_CODEX_SHADOW_PROMPT_FILE || "").trim();
const shadowPromptEnv = String(process.env.POLYNET_CODEX_SHADOW_PROMPT || "");
const runtimePromptFile = String(process.env.POLYNET_CODEX_RUNTIME_PROMPT_FILE || "").trim();
const runtimePromptEnv = String(process.env.POLYNET_CODEX_RUNTIME_PROMPT || "");
const runtimeInstructionsFile = String(process.env.POLYNET_CODEX_RUNTIME_INSTRUCTIONS_FILE || "").trim();
const runtimeInstructionsEnv = String(process.env.POLYNET_CODEX_RUNTIME_INSTRUCTIONS || "");
const codexHomeDirEnv = String(process.env.POLYNET_CODEX_HOME_DIR || "").trim();
const resumeThreadIdEnv = String(process.env.POLYNET_CODEX_RESUME_THREAD_ID || "").trim();
const toolCanaryFileName =
  String(process.env.POLYNET_CODEX_TOOL_CANARY_FILE || "").trim() ||
  "polynet-codex-tool-canary.txt";
const toolCanaryExpectedText = String(process.env.POLYNET_CODEX_TOOL_CANARY_EXPECTED || "").trim();
const shadowInstructions =
  String(process.env.POLYNET_CODEX_SHADOW_INSTRUCTIONS || "").trim() ||
  [
    "You are PolyNet's read-only shadow Codex executor.",
    "Answer the user's latest turn as a hidden diagnostic run.",
    "Do not use tools, inspect files, run shell commands, or mutate workspace state.",
    "Do not include secrets or credentials.",
    "Keep the answer concise.",
  ].join(" ");
const startedAt = Date.now();
const result = {
  ok: false,
  stage: "started",
  elapsedMs: 0,
  codexPathPresent: false,
  codexVersion: null,
  appServerStarted: false,
  initialized: false,
  authApplied: false,
  accountResolved: false,
  rateLimitsPresent: false,
  serverInfo: null,
  userAgent: null,
  account: null,
  rateLimits: null,
  notificationRateLimits: null,
  executionMode: executionMode || (executionSmokeRequested ? "execution_canary" : "off"),
  executionRequested,
  executionSmokeRequested,
  shadowTurnRequested,
  primaryTurnRequested,
  toolCallCanaryRequested,
  shadowPromptChars: null,
  runtimePromptChars: null,
  toolCanaryFileName: toolCallCanaryRequested ? toolCanaryFileName : null,
  toolCanaryExpectedTextChars: toolCallCanaryRequested ? toolCanaryExpectedText.length : null,
  toolCanaryExpectedTextSha256: toolCallCanaryRequested ? sha256Text(toolCanaryExpectedText) : null,
  executionStarted: false,
	  codexHomePersistent: false,
	  codexHomeRuntimeIsolated: false,
	  codexHomeCleanupAction: null,
	  threadSandboxMode: null,
	  threadApprovalPolicy: null,
	  sandboxPolicyType: null,
	  sandboxPolicyNetworkAccess: null,
	  sandboxPolicyWritableRootCount: null,
	  sandboxPolicyExcludeTmpdirEnvVar: null,
	  sandboxPolicyExcludeSlashTmp: null,
	  codexSessionArchivePresent: false,
  codexSessionArchiveRestored: false,
  codexSessionArchivePersisted: false,
  codexSessionArchiveErrorMessage: null,
  codexThreadStarted: false,
  codexThreadResumed: false,
  codexThreadResumeAttempted: false,
  codexThreadResumeFailed: false,
  codexThreadResumeThreadIdMatched: null,
  codexThreadResumeErrorMessage: null,
  codexThreadLifecycleAction: null,
  codexThreadId: null,
  codexTurnStarted: false,
  codexTurnId: null,
  executionCompleted: false,
  executionExpectedText,
  executionFinalText: null,
  executionFinalTextChars: null,
  executionFinalTextSha256: null,
  executionMatchedExpected: false,
  shadowOutputPresent: false,
  shadowOutputChars: null,
  shadowOutputSha256: null,
  toolCallCanaryMatchedExpected: false,
  toolCallCanaryToolStarted: false,
  executionModel,
  adapterEvents: [],
  nativeToolSteps: [],
  nativeToolStepCount: 0,
  dynamicToolSpecs: [],
  dynamicToolBridgeConfigured: false,
  dynamicToolBridgeUrlPresent: false,
  dynamicToolCallRequestCount: 0,
  dynamicToolCallResponseCount: 0,
  dynamicToolCallFailureCount: 0,
  dynamicToolCalls: [],
  adapterSummary: {
    totalNotifications: 0,
    capturedEvents: 0,
    assistantDeltaEvents: 0,
    reasoningDeltaEvents: 0,
    itemStartedEvents: 0,
    toolStartedEvents: 0,
    toolCompletedEvents: 0,
    commandOutputDeltaEvents: 0,
    fileChangeOutputDeltaEvents: 0,
    nativeToolOutputChars: 0,
    turnCompletedEvents: 0,
    errorEvents: 0,
    methodCounts: {},
  },
  stderrTail: "",
  errorCode: null,
  errorMessage: null,
};

function appendTail(current, next, max = 2000) {
  const merged = String(current || "") + String(next || "");
  return merged.length > max ? merged.slice(merged.length - max) : merged;
}

function sha256Text(value) {
  return createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function shellQuote(value) {
  return "'" + String(value || "").replaceAll("'", "'\\''") + "'";
}

function sanitizeTextPreview(value, max = 2000) {
  const text = String(value || "")
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-<redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, "Bearer <redacted>");
  return text.length > max ? text.slice(0, max) + "\n...(truncated)..." : text;
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (/token|authorization|secret|api[_-]?key|credential|email/i.test(key)) {
      out[key] = "<redacted>";
      continue;
    }
    out[key] = sanitize(raw);
  }
  return out;
}

function finish(ok, code, message) {
  result.ok = Boolean(ok);
  result.elapsedMs = Date.now() - startedAt;
  if (code) result.errorCode = code;
  if (message) result.errorMessage = message;
  console.log(RESULT_MARKER + JSON.stringify(sanitize(result)));
}

function emitHarnessEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return;
  harnessEventSequence += 1;
  const payload = sanitize({
    sequence: harnessEventSequence,
    elapsed_ms: Date.now() - startedAt,
    ...event,
  });
  try {
    process.stdout.write(EVENT_MARKER + JSON.stringify(payload) + "\n");
  } catch {
    // Best-effort streaming evidence only; final result parsing is the fallback.
  }
}

function runShell(command, timeout = 5000) {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-lc", command], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeout);
    child.stdout.on("data", (chunk) => {
      stdout = appendTail(stdout, chunk.toString("utf8"), 4000);
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendTail(stderr, chunk.toString("utf8"), 4000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: 127, stdout, stderr: error.message || stderr });
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code: Number.isFinite(Number(code)) ? Number(code) : 1, stdout, stderr });
    });
  });
}

async function restorePersistentCodexSessions(params) {
  if (!params.persistentCodexHome || !params.archivePath) return;
  mkdirSync(params.persistentCodexHome, { recursive: true });
  if (!existsSync(params.archivePath)) return;
  result.codexSessionArchivePresent = true;
  const archiveListPath = path.join(params.codexHome, ".polynet-codex-sessions.list");
  const restore = await runShell(
    [
      "set -eu",
      "tar -tf " + shellQuote(params.archivePath) + " > " + shellQuote(archiveListPath),
      "while IFS= read -r entry; do case \"$entry\" in sessions|sessions/*|./sessions|./sessions/*) ;; *) exit 23 ;; esac; case \"$entry\" in /*|../*|*/../*|*/..) exit 23 ;; esac; done < " + shellQuote(archiveListPath),
      "(tar --no-same-owner -xf " + shellQuote(params.archivePath) + " -C " + shellQuote(params.codexHome) + " 2>/dev/null || tar -xf " + shellQuote(params.archivePath) + " -C " + shellQuote(params.codexHome) + ")",
    ].join(" && "),
    20000,
  );
  if (restore.code === 0) {
    result.codexSessionArchiveRestored = true;
    return;
  }
  result.codexSessionArchiveErrorMessage =
    sanitizeTextPreview(restore.stderr || restore.stdout || "Codex session archive restore failed.", 500);
}

async function persistCodexSessions(params) {
  if (!params.persistentCodexHome || !params.archivePath) return;
  const sessionsDir = path.join(params.codexHome, "sessions");
  if (!existsSync(sessionsDir)) return;
  mkdirSync(params.persistentCodexHome, { recursive: true });
  const persist = await runShell(
    [
      "rm -f " + shellQuote(params.archivePath),
      "tar -cf " + shellQuote(params.archivePath) + " -C " + shellQuote(params.codexHome) + " sessions",
    ].join(" && "),
    20000,
  );
  if (persist.code === 0) {
    result.codexSessionArchivePersisted = true;
    return;
  }
  result.codexSessionArchiveErrorMessage =
    sanitizeTextPreview(persist.stderr || persist.stdout || "Codex session archive persist failed.", 500);
}

function readAndRemoveAuthPayload() {
  const authFile = String(process.env.POLYNET_CODEX_AUTH_FILE || "").trim();
  if (!authFile) {
    throw new Error("POLYNET_CODEX_AUTH_FILE is required.");
  }
  const raw = readFileSync(authFile, "utf8");
  try {
    unlinkSync(authFile);
  } catch {
    // The outer shell also removes the file.
  }
  const parsed = JSON.parse(raw);
  const accessToken = String(parsed.accessToken || "").trim();
  const chatgptAccountId = String(parsed.chatgptAccountId || "").trim();
  if (!accessToken || !chatgptAccountId) {
    throw new Error("Codex ChatGPT auth payload is incomplete.");
  }
  return {
    type: "chatgptAuthTokens",
    accessToken,
    chatgptAccountId,
    chatgptPlanType:
      typeof parsed.chatgptPlanType === "string" && parsed.chatgptPlanType.trim()
        ? parsed.chatgptPlanType.trim()
        : null,
  };
}

function readAndRemoveRuntimePrompt() {
  const promptFile = runtimePromptFile || shadowPromptFile;
  if (!promptFile) return (runtimePromptEnv || shadowPromptEnv).trim();
  const raw = readFileSync(promptFile, "utf8");
  try {
    unlinkSync(promptFile);
  } catch {
    // The outer shell also removes the file.
  }
  return String(raw || "").trim();
}

function readAndRemoveRuntimeInstructions() {
  if (!runtimeInstructionsFile) return runtimeInstructionsEnv.trim() || shadowInstructions;
  const raw = readFileSync(runtimeInstructionsFile, "utf8");
  try {
    unlinkSync(runtimeInstructionsFile);
  } catch {
    // The outer shell also removes the file.
  }
  return String(raw || "").trim() || shadowInstructions;
}

function readCodexDynamicToolSpecs() {
  const raw = String(process.env.POLYNET_CODEX_DYNAMIC_TOOLS_JSON || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((tool) => isRecord(tool) && typeof tool.name === "string" && tool.name.trim())
      .map((tool) => ({
        name: String(tool.name).trim(),
        description: typeof tool.description === "string" ? tool.description : "",
        inputSchema: isRecord(tool.inputSchema) ? tool.inputSchema : {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
      }));
  } catch {
    return [];
  }
}

function readAndRemoveDynamicToolBridgeConfig() {
  const bridgeConfigFile = String(process.env.POLYNET_CODEX_DYNAMIC_TOOL_BRIDGE_FILE || "").trim();
  if (!bridgeConfigFile) {
    return {
      bridgeUrl: "",
      bridgeToken: "",
      bridgeSessionId: "",
      bridgeRunId: "",
      configured: false,
    };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(readFileSync(bridgeConfigFile, "utf8"));
  } catch {
    parsed = null;
  }
  try {
    unlinkSync(bridgeConfigFile);
  } catch {
    // The outer shell also removes the file.
  }
  const bridgeUrl = String(parsed?.bridgeUrl || "").trim();
  const bridgeToken = String(parsed?.bridgeToken || "").trim();
  const bridgeSessionId = String(parsed?.bridgeSessionId || "").trim();
  const bridgeRunId = String(parsed?.bridgeRunId || "").trim();
  return {
    bridgeUrl,
    bridgeToken,
    bridgeSessionId,
    bridgeRunId,
    configured: Boolean(bridgeUrl && bridgeToken && bridgeSessionId && bridgeRunId),
  };
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(record, key) {
  const value = isRecord(record) ? record[key] : undefined;
  return typeof value === "string" ? value : undefined;
}

function isTerminalTurn(turn) {
  return (
    isRecord(turn) &&
    (turn.status === "completed" || turn.status === "interrupted" || turn.status === "failed")
  );
}

function readNotificationTurnId(params) {
  const direct = readString(params, "turnId");
  if (direct) return direct;
  return isRecord(params?.turn) ? readString(params.turn, "id") : undefined;
}

function collectAssistantTextFromItems(items) {
  if (!Array.isArray(items)) return "";
  return items
    .filter((item) => isRecord(item) && item.type === "agentMessage")
    .map((item) => String(item.text || "").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function readNotificationItem(params) {
  if (!isRecord(params)) return null;
  return isRecord(params.item) ? params.item : null;
}

const nativeToolStepById = new Map();

function readItemToolName(item) {
  if (!isRecord(item)) return null;
  const itemType = readString(item, "type") || "";
  if (itemType === "commandExecution") return "bash";
  if (itemType === "fileChange") return "apply_patch";
  if (itemType === "webSearch") return "web_search";
  if (itemType === "mcpToolCall") {
    const server = readString(item, "server");
    const tool = readString(item, "tool");
    if (server && tool) return server + "." + tool;
    if (tool) return tool;
  }
  if (itemType === "dynamicToolCall") {
    const tool = readString(item, "tool");
    if (tool) return tool;
  }
  const direct = readString(item, "toolName") || readString(item, "tool_name") || readString(item, "name");
  if (direct) return direct;
  const call = isRecord(item.call) ? item.call : null;
  const callName = readString(call, "toolName") || readString(call, "tool_name") || readString(call, "name");
  if (callName) return callName;
  if (/tool|command|exec|shell|terminal|patch|file/i.test(itemType)) {
    return "codex_builtin:" + itemType;
  }
  return null;
}

function readItemId(item, params) {
  return readString(item, "id") || readString(params, "itemId") || readString(params, "id") || null;
}

function readItemStatus(item) {
  if (!isRecord(item)) return null;
  const status = readString(item, "status");
  if (status) return status;
  if (item.type === "commandExecution" && Number.isFinite(Number(item.exitCode))) {
    return Number(item.exitCode) === 0 ? "completed" : "failed";
  }
  return null;
}

function readItemNativeToolArguments(item) {
  if (!isRecord(item)) return {};
  if (item.type === "commandExecution") {
    return {
      command: readString(item, "command") || "",
      ...(readString(item, "cwd") ? { cwd: readString(item, "cwd") } : {}),
    };
  }
  if (item.type === "fileChange") {
    return {
      changes: Array.isArray(item.changes)
        ? item.changes
            .filter((change) => isRecord(change))
            .map((change) => ({
              path: readString(change, "path") || "",
              kind: readString(change, "kind") || "",
            }))
        : [],
    };
  }
  if (item.type === "webSearch") {
    return { query: readString(item, "query") || "" };
  }
  if (isRecord(item.arguments)) return item.arguments;
  return {};
}

function readItemOutputText(item) {
  if (!isRecord(item)) return "";
  if (typeof item.aggregatedOutput === "string") return item.aggregatedOutput;
  if (typeof item.output === "string") return item.output;
  if (typeof item.result === "string") return item.result;
  if (isRecord(item.error)) return JSON.stringify(sanitize(item.error));
  if (item.result !== undefined && item.result !== null) {
    try {
      return JSON.stringify(sanitize(item.result));
    } catch {
      return String(item.result);
    }
  }
  return "";
}

function getNativeToolStep(itemId, item, params) {
  if (!itemId) return null;
  const toolName = readItemToolName(item);
  if (!toolName) return null;
  const existing = nativeToolStepById.get(itemId);
  if (existing) return existing;
  const step = {
    id: itemId,
    toolName,
    itemType: readString(item, "type") || null,
    status: readItemStatus(item) || "started",
    started: false,
    completed: false,
    exitCode: Number.isFinite(Number(item?.exitCode)) ? Number(item.exitCode) : null,
    rawArguments: sanitize(readItemNativeToolArguments(item)),
    outputPreview: null,
    outputChars: 0,
    outputSha256: null,
    outputTruncated: false,
    threadIdPresent: Boolean(readString(params, "threadId")),
    turnIdPresent: Boolean(readNotificationTurnId(params)),
  };
  nativeToolStepById.set(itemId, step);
  result.nativeToolSteps.push(step);
  result.nativeToolStepCount = result.nativeToolSteps.length;
  return step;
}

function appendNativeToolOutput(step, delta) {
  if (!step || !delta) return;
  const text = String(delta);
  step.outputChars += text.length;
  result.adapterSummary.nativeToolOutputChars += text.length;
  const current = String(step.outputPreview || "");
  const next = sanitizeTextPreview(current + text);
  step.outputPreview = next;
  step.outputTruncated = next.length < current.length + text.length || /\(truncated\)/.test(next);
  step.outputSha256 = sha256Text(current + text);
}

function recordNativeToolItem(params, phase) {
  const item = readNotificationItem(params);
  const itemId = readItemId(item, params);
  const step = getNativeToolStep(itemId, item, params);
  if (!step) return null;
  if (phase === "started") {
    step.started = true;
    step.status = "started";
    return step;
  }
  step.completed = true;
  step.status = readItemStatus(item) || "completed";
  step.exitCode = Number.isFinite(Number(item?.exitCode)) ? Number(item.exitCode) : step.exitCode;
  step.rawArguments = sanitize(readItemNativeToolArguments(item));
  const finalOutput = readItemOutputText(item);
  if (finalOutput && !step.outputPreview) {
    appendNativeToolOutput(step, finalOutput);
  }
  return step;
}

function recordNativeToolOutputDelta(params, toolName, method) {
  const itemId = readString(params, "itemId") || readString(params, "id");
  if (!itemId) return;
  const item = { id: itemId, type: toolName === "bash" ? "commandExecution" : "fileChange" };
  const step = getNativeToolStep(itemId, item, params);
  if (!step) return;
  appendNativeToolOutput(step, readString(params, "delta") || "");
  if (method === "item/commandExecution/outputDelta") {
    result.adapterSummary.commandOutputDeltaEvents += 1;
  }
  if (method === "item/fileChange/outputDelta") {
    result.adapterSummary.fileChangeOutputDeltaEvents += 1;
  }
}

function recordNativeToolItemsFromTurn(turn) {
  if (!Array.isArray(turn?.items)) return;
  for (const item of turn.items) {
    if (!isRecord(item) || !readItemToolName(item)) continue;
    const params = { item, threadId: result.codexThreadId, turnId: result.codexTurnId };
    recordNativeToolItem(params, "completed");
  }
}

function incrementAdapterCount(name) {
  result.adapterSummary.methodCounts[name] = Number(result.adapterSummary.methodCounts[name] || 0) + 1;
}

function pushAdapterEvent(event) {
  result.adapterSummary.capturedEvents += 1;
  if (result.adapterEvents.length >= 40) return;
  result.adapterEvents.push(sanitize(event));
}

function recordAdapterNotification(message) {
  if (!executionRequested || !isRecord(message) || !message.method) return;
  const method = String(message.method);
  const params = isRecord(message.params) ? message.params : null;
  result.adapterSummary.totalNotifications += 1;
  incrementAdapterCount(method);

  if (method === "thread/started") {
    emitHarnessEvent({
      type: "thread_started",
      method,
      thread_id_present: Boolean(readString(params, "threadId") || readString(params?.thread, "id")),
    });
    pushAdapterEvent({
      type: "thread_started",
      method,
      thread_id_present: Boolean(readString(params, "threadId") || readString(params?.thread, "id")),
    });
    return;
  }
  if (method === "turn/started") {
    emitHarnessEvent({
      type: "turn_started",
      method,
      thread_id_present: Boolean(readString(params, "threadId")),
      turn_id_present: Boolean(readNotificationTurnId(params)),
    });
    pushAdapterEvent({
      type: "turn_started",
      method,
      thread_id_present: Boolean(readString(params, "threadId")),
      turn_id_present: Boolean(readNotificationTurnId(params)),
    });
    return;
  }
  if (method === "item/started") {
    const item = readNotificationItem(params);
    const itemType = readString(item, "type");
    const toolName = readItemToolName(item);
    result.adapterSummary.itemStartedEvents += 1;
    if (toolName) result.adapterSummary.toolStartedEvents += 1;
    if (toolName) recordNativeToolItem(params, "started");
    pushAdapterEvent({
      type: toolName ? "tool_started" : "item_started",
      method,
      thread_id_present: Boolean(readString(params, "threadId")),
      turn_id_present: Boolean(readNotificationTurnId(params)),
      item_id_present: Boolean(readString(params, "itemId") || readString(item, "id")),
      item_type: itemType || null,
      tool_name: toolName || null,
    });
    return;
  }
  if (method === "item/completed") {
    const item = readNotificationItem(params);
    const itemType = readString(item, "type");
    const toolName = readItemToolName(item);
    if (toolName) {
      result.adapterSummary.toolCompletedEvents += 1;
      const step = recordNativeToolItem(params, "completed");
      pushAdapterEvent({
        type: "tool_completed",
        method,
        thread_id_present: Boolean(readString(params, "threadId")),
        turn_id_present: Boolean(readNotificationTurnId(params)),
        item_id_present: Boolean(readString(params, "itemId") || readString(item, "id")),
        item_type: itemType || null,
        tool_name: toolName,
        status: readItemStatus(item),
        output_chars: step?.outputChars ?? null,
      });
      return;
    }
    pushAdapterEvent({
      type: "item_completed",
      method,
      thread_id_present: Boolean(readString(params, "threadId")),
      turn_id_present: Boolean(readNotificationTurnId(params)),
      item_id_present: Boolean(readString(params, "itemId") || readString(item, "id")),
      item_type: itemType || null,
    });
    return;
  }
  if (method === "item/commandExecution/outputDelta") {
    const delta = readString(params, "delta") || "";
    recordNativeToolOutputDelta(params, "bash", method);
    emitHarnessEvent({
      type: "tool_output_delta",
      method,
      tool_name: "bash",
      thread_id_present: Boolean(readString(params, "threadId")),
      turn_id_present: Boolean(readNotificationTurnId(params)),
      item_id_present: Boolean(readString(params, "itemId") || readString(params, "id")),
      delta_chars: delta.length,
    });
    pushAdapterEvent({
      type: "tool_output_delta",
      method,
      tool_name: "bash",
      thread_id_present: Boolean(readString(params, "threadId")),
      turn_id_present: Boolean(readNotificationTurnId(params)),
      item_id_present: Boolean(readString(params, "itemId") || readString(params, "id")),
      delta_chars: delta.length,
    });
    return;
  }
  if (method === "item/fileChange/outputDelta") {
    const delta = readString(params, "delta") || "";
    recordNativeToolOutputDelta(params, "apply_patch", method);
    emitHarnessEvent({
      type: "tool_output_delta",
      method,
      tool_name: "apply_patch",
      thread_id_present: Boolean(readString(params, "threadId")),
      turn_id_present: Boolean(readNotificationTurnId(params)),
      item_id_present: Boolean(readString(params, "itemId") || readString(params, "id")),
      delta_chars: delta.length,
    });
    pushAdapterEvent({
      type: "tool_output_delta",
      method,
      tool_name: "apply_patch",
      thread_id_present: Boolean(readString(params, "threadId")),
      turn_id_present: Boolean(readNotificationTurnId(params)),
      item_id_present: Boolean(readString(params, "itemId") || readString(params, "id")),
      delta_chars: delta.length,
    });
    return;
  }
  if (method === "item/agentMessage/delta") {
    const delta = readString(params, "delta") || "";
    result.adapterSummary.assistantDeltaEvents += 1;
    emitHarnessEvent({
      type: "assistant_delta",
      method,
      thread_id_present: Boolean(readString(params, "threadId")),
      turn_id_present: Boolean(readNotificationTurnId(params)),
      item_id_present: Boolean(readString(params, "itemId") || readString(params, "id")),
      delta,
      delta_chars: delta.length,
    });
    pushAdapterEvent({
      type: "assistant_delta",
      method,
      thread_id_present: Boolean(readString(params, "threadId")),
      turn_id_present: Boolean(readNotificationTurnId(params)),
      item_id_present: Boolean(readString(params, "itemId") || readString(params, "id")),
      delta_chars: delta.length,
    });
    return;
  }
  if (method === "item/agentReasoning/delta") {
    const delta = readString(params, "delta") || "";
    result.adapterSummary.reasoningDeltaEvents += 1;
    emitHarnessEvent({
      type: "reasoning_delta",
      method,
      thread_id_present: Boolean(readString(params, "threadId")),
      turn_id_present: Boolean(readNotificationTurnId(params)),
      item_id_present: Boolean(readString(params, "itemId") || readString(params, "id")),
      delta_chars: delta.length,
    });
    pushAdapterEvent({
      type: "reasoning_delta",
      method,
      thread_id_present: Boolean(readString(params, "threadId")),
      turn_id_present: Boolean(readNotificationTurnId(params)),
      item_id_present: Boolean(readString(params, "itemId") || readString(params, "id")),
      delta_chars: delta.length,
    });
    return;
  }
  if (method === "turn/completed") {
    const turn = isRecord(params?.turn) ? params.turn : null;
    recordNativeToolItemsFromTurn(turn);
    result.adapterSummary.turnCompletedEvents += 1;
    emitHarnessEvent({
      type: "turn_completed",
      method,
      thread_id_present: Boolean(readString(params, "threadId")),
      turn_id_present: Boolean(readNotificationTurnId(params)),
      status: readString(turn, "status") || null,
      item_count: Array.isArray(turn?.items) ? turn.items.length : null,
    });
    pushAdapterEvent({
      type: "turn_completed",
      method,
      thread_id_present: Boolean(readString(params, "threadId")),
      turn_id_present: Boolean(readNotificationTurnId(params)),
      status: readString(turn, "status") || null,
      item_count: Array.isArray(turn?.items) ? turn.items.length : null,
    });
    return;
  }
  if (method === "error") {
    const error = isRecord(params?.error) ? params.error : null;
    result.adapterSummary.errorEvents += 1;
    pushAdapterEvent({
      type: "error",
      method,
      thread_id_present: Boolean(readString(params, "threadId")),
      turn_id_present: Boolean(readNotificationTurnId(params)),
      code: readString(error, "code") || null,
      message: readString(error, "message") || null,
    });
  }
}

const executionCollector = {
  threadId: null,
  turnId: null,
  completedTurn: null,
  errorMessage: null,
  pending: [],
  assistantTextByItem: new Map(),
  assistantItemOrder: [],
  resolveCompletion: null,
};
const executionCompletion = new Promise((resolve) => {
  executionCollector.resolveCompletion = resolve;
});

function rememberAssistantText(itemId, text) {
  if (!itemId || !text) return;
  if (!executionCollector.assistantTextByItem.has(itemId)) {
    executionCollector.assistantItemOrder.push(itemId);
  }
  executionCollector.assistantTextByItem.set(
    itemId,
    String(executionCollector.assistantTextByItem.get(itemId) || "") + text,
  );
}

function handleExecutionNotification(notification) {
  if (!executionRequested) return;
  const params = isRecord(notification?.params) ? notification.params : null;
  if (!params || !executionCollector.threadId || readString(params, "threadId") !== executionCollector.threadId) {
    return;
  }
  if (!executionCollector.turnId) {
    executionCollector.pending.push(notification);
    return;
  }
  const notificationTurnId = readNotificationTurnId(params);
  if (notificationTurnId !== executionCollector.turnId) return;
  if (notification.method === "item/agentMessage/delta") {
    const itemId = readString(params, "itemId") || readString(params, "id") || "assistant";
    rememberAssistantText(itemId, readString(params, "delta") || "");
    return;
  }
  if (notification.method === "turn/completed") {
    executionCollector.completedTurn = isRecord(params.turn) ? params.turn : executionCollector.completedTurn;
    executionCollector.resolveCompletion?.();
    return;
  }
  if (notification.method === "error") {
    const errorRecord = isRecord(params.error) ? params.error : null;
    executionCollector.errorMessage =
      readString(errorRecord, "message") || "codex app-server execution canary failed";
    executionCollector.resolveCompletion?.();
  }
}

function startExecutionCollection(threadId, turn) {
  executionCollector.threadId = threadId;
  executionCollector.turnId = readString(turn, "id") || null;
  result.codexTurnId = executionCollector.turnId;
  if (isTerminalTurn(turn)) {
    executionCollector.completedTurn = turn;
  }
  for (const notification of executionCollector.pending.splice(0)) {
    handleExecutionNotification(notification);
  }
}

function waitForExecutionCompletion(timeout = 25000) {
  if (executionCollector.completedTurn || executionCollector.errorMessage) return Promise.resolve();
  return Promise.race([
    executionCompletion,
    new Promise((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("codex app-server turn timed out"));
      }, timeout);
      timer.unref?.();
    }),
  ]);
}

function collectExecutionText() {
  const itemText = collectAssistantTextFromItems(executionCollector.completedTurn?.items);
  const deltaText = executionCollector.assistantItemOrder
    .map((itemId) => String(executionCollector.assistantTextByItem.get(itemId) || "").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
  return (itemText || deltaText).trim();
}

function failedDynamicToolResponse(message) {
  return {
    success: false,
    contentItems: [{ type: "inputText", text: String(message || "Dynamic tool call failed.") }],
  };
}

function normalizeDynamicToolOutputContentItems(value) {
  if (!Array.isArray(value)) return null;
  const items = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const itemType = readString(item, "type");
    if (itemType === "inputText") {
      items.push({ type: "inputText", text: String(item.text ?? "") });
      continue;
    }
    if (itemType === "inputImage") {
      const imageUrl = readString(item, "imageUrl");
      if (imageUrl) items.push({ type: "inputImage", imageUrl });
    }
  }
  return items.length > 0 ? items : null;
}

function summarizeDynamicToolOutput(response) {
  const contentItems = Array.isArray(response?.contentItems) ? response.contentItems : [];
  const text = contentItems
    .map((item) => (isRecord(item) && typeof item.text === "string" ? item.text : ""))
    .filter(Boolean)
    .join("\n");
  return {
    outputChars: text.length,
    outputSha256: text ? sha256Text(text) : null,
  };
}

async function callDynamicToolBridge(params, bridgeConfig) {
  if (!bridgeConfig.configured) {
    return failedDynamicToolResponse("PolyNet dynamic tool bridge is not configured for this Codex run.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(bridgeConfig.bridgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + bridgeConfig.bridgeToken,
      },
      body: JSON.stringify({
        bridgeSessionId: bridgeConfig.bridgeSessionId,
        runId: bridgeConfig.bridgeRunId,
        threadId: readString(params, "threadId") || null,
        turnId: readString(params, "turnId") || null,
        callId: readString(params, "callId") || null,
        toolName: readString(params, "tool") || "",
        arguments: isRecord(params?.arguments) ? params.arguments : {},
      }),
      signal: controller.signal,
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const message =
        readString(payload, "message") ||
        readString(payload, "error") ||
        readString(payload, "errorCode") ||
        "PolyNet dynamic tool bridge request failed.";
      return {
        ...failedDynamicToolResponse(message),
        errorCode: readString(payload, "errorCode") || "codex_bridge_http_error",
      };
    }
    const contentItems = normalizeDynamicToolOutputContentItems(payload?.contentItems);
    if (!contentItems) {
      return failedDynamicToolResponse("PolyNet dynamic tool bridge returned no content.");
    }
    return {
      success: payload?.success === true,
      contentItems,
      errorCode: readString(payload, "errorCode") || null,
    };
  } catch (error) {
    return {
      ...failedDynamicToolResponse(error instanceof Error ? error.message : String(error)),
      errorCode: "codex_bridge_request_failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function handleDynamicToolServerRequest(message, bridgeConfig, dynamicToolNames) {
  const params = isRecord(message?.params) ? message.params : {};
  const toolName = readString(params, "tool") || "";
  const callId = readString(params, "callId") || readString(params, "id") || "";
  result.dynamicToolCallRequestCount += 1;
  const record = {
    callId: callId || null,
    toolName: toolName || null,
    status: "started",
    success: false,
    argsPresent: isRecord(params?.arguments),
    outputChars: null,
    outputSha256: null,
    errorCode: null,
  };
  if (result.dynamicToolCalls.length < 25) {
    result.dynamicToolCalls.push(record);
  }
  if (!toolName || !dynamicToolNames.has(toolName)) {
    record.status = "blocked";
    record.errorCode = "codex_dynamic_tool_not_allowed";
    result.dynamicToolCallFailureCount += 1;
    return failedDynamicToolResponse("This dynamic tool is not available for this Codex run.");
  }
  const response = await callDynamicToolBridge(params, bridgeConfig);
  const outputSummary = summarizeDynamicToolOutput(response);
  record.status = response.success ? "completed" : "failed";
  record.success = response.success === true;
  record.outputChars = outputSummary.outputChars;
  record.outputSha256 = outputSummary.outputSha256;
  record.errorCode = readString(response, "errorCode");
  result.dynamicToolCallResponseCount += 1;
  if (!response.success) result.dynamicToolCallFailureCount += 1;
  return response;
}

function createRpcClient(child, loginParams, bridgeConfig, dynamicToolNames) {
  let nextId = 1;
  const pending = new Map();
  const rl = readline.createInterface({ input: child.stdout });

  rl.on("line", (line) => {
    const trimmed = String(line || "").trim();
    if (!trimmed) return;
    let message;
    try {
      message = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (message && typeof message === "object" && "id" in message && ("result" in message || "error" in message)) {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) {
        entry.reject(new Error(String(message.error.message || "Codex app-server request failed.")));
      } else {
        entry.resolve(message.result);
      }
      return;
    }
    if (message && typeof message === "object" && message.method && "id" in message) {
      if (message.method === "account/chatgptAuthTokens/refresh") {
        child.stdin.write(JSON.stringify({
          id: message.id,
          result: {
            accessToken: loginParams.accessToken,
            chatgptAccountId: loginParams.chatgptAccountId,
            chatgptPlanType: loginParams.chatgptPlanType,
          },
        }) + "\n");
        return;
      }
      if (message.method === "item/tool/call") {
        void handleDynamicToolServerRequest(message, bridgeConfig, dynamicToolNames)
          .then((toolResponse) => {
            child.stdin.write(JSON.stringify({
              id: message.id,
              result: toolResponse,
            }) + "\n");
          })
          .catch((error) => {
            result.dynamicToolCallFailureCount += 1;
            child.stdin.write(JSON.stringify({
              id: message.id,
              result: failedDynamicToolResponse(
                error instanceof Error ? error.message : String(error),
              ),
            }) + "\n");
          });
        return;
      }
      child.stdin.write(JSON.stringify({
        id: message.id,
        error: {
          code: -32601,
          message: "Unsupported Codex app-server request.",
        },
      }) + "\n");
      return;
    }
    if (message && typeof message === "object" && message.method) {
      recordAdapterNotification(message);
      handleExecutionNotification(message);
      if (message.method === "account/rateLimits/updated") {
        result.notificationRateLimits = sanitize(message.params || null);
        result.rateLimitsPresent = true;
      }
    }
  });

  function request(method, params, requestTimeoutMs = 8000) {
    const id = nextId++;
    const payload = params === undefined ? { id, method } : { id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(method + " timed out"));
      }, requestTimeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify(payload) + "\n", (error) => {
        if (!error) return;
        pending.delete(id);
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  function notify(method, params) {
    const payload = params === undefined ? { method } : { method, params };
    child.stdin.write(JSON.stringify(payload) + "\n");
  }

  return { request, notify, close: () => rl.close() };
}

async function main() {
  result.stage = "auth_payload_read";
  const loginParams = readAndRemoveAuthPayload();

  result.stage = "codex_binary_lookup";
  const codexPath = await runShell("command -v codex");
  result.codexPathPresent = codexPath.code === 0 && Boolean(codexPath.stdout.trim());
  if (!result.codexPathPresent) {
    finish(false, "codex_binary_missing", "Codex binary was not found in the Daytona workspace environment.");
    return;
  }

  const codexVersion = await runShell("codex --version || codex -V || true");
  result.codexVersion = String(codexVersion.stdout || codexVersion.stderr || "").trim().slice(0, 200) || null;

  const requestedCodexHome =
    codexHomeDirEnv && path.isAbsolute(codexHomeDirEnv) ? codexHomeDirEnv : "";
  const persistentCodexHome = requestedCodexHome;
  const codexSessionArchivePath = persistentCodexHome
    ? path.join(persistentCodexHome, "codex-sessions.tar")
    : "";
  const codexHome = mkdtempSync(path.join(os.tmpdir(), "polynet-codex-home-"));
  mkdirSync(codexHome, { recursive: true });
  result.codexHomePersistent = Boolean(requestedCodexHome);
  result.codexHomeRuntimeIsolated = Boolean(requestedCodexHome);
  result.codexHomeCleanupAction = "runtime_home_removed_after_probe";
  await restorePersistentCodexSessions({
    persistentCodexHome,
    archivePath: codexSessionArchivePath,
    codexHome,
  });
  const nativeHome = path.join(codexHome, "home");
  mkdirSync(nativeHome, { recursive: true });
  const dynamicToolSpecs = readCodexDynamicToolSpecs();
  const dynamicToolNames = new Set(dynamicToolSpecs.map((tool) => tool.name));
  const dynamicToolBridgeConfig = readAndRemoveDynamicToolBridgeConfig();
  result.dynamicToolSpecs = dynamicToolSpecs.map((tool) => ({
    name: tool.name,
    descriptionChars: String(tool.description || "").length,
    inputSchemaPresent: Boolean(tool.inputSchema),
  }));
  result.dynamicToolBridgeConfigured = dynamicToolBridgeConfig.configured;
  result.dynamicToolBridgeUrlPresent = Boolean(dynamicToolBridgeConfig.bridgeUrl);
  const env = { ...process.env, CODEX_HOME: codexHome, HOME: nativeHome };
  delete env.OPENAI_API_KEY;
  delete env.CODEX_API_KEY;
  delete env.POLYNET_CODEX_AUTH_FILE;
  delete env.POLYNET_CODEX_HOME_DIR;
  delete env.POLYNET_CODEX_RESUME_THREAD_ID;
  delete env.POLYNET_CODEX_SHADOW_PROMPT;
  delete env.POLYNET_CODEX_SHADOW_PROMPT_FILE;
  delete env.POLYNET_CODEX_SHADOW_INSTRUCTIONS;
  delete env.POLYNET_CODEX_TOOL_CANARY_FILE;
  delete env.POLYNET_CODEX_TOOL_CANARY_EXPECTED;
  delete env.POLYNET_CODEX_DYNAMIC_TOOLS_JSON;
  delete env.POLYNET_CODEX_DYNAMIC_TOOL_BRIDGE_URL;
  delete env.POLYNET_CODEX_DYNAMIC_TOOL_BRIDGE_TOKEN;
  delete env.POLYNET_CODEX_DYNAMIC_TOOL_BRIDGE_SESSION_ID;
  delete env.POLYNET_CODEX_DYNAMIC_TOOL_BRIDGE_RUN_ID;
  delete env.POLYNET_CODEX_DYNAMIC_TOOL_BRIDGE_FILE;

  result.stage = "app_server_start";
  const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
    cwd: process.cwd(),
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  result.appServerStarted = true;
  let childStartError = null;
  child.once("error", (error) => {
    childStartError = error;
    result.appServerStarted = false;
    result.stderrTail = appendTail(
      result.stderrTail,
      error instanceof Error ? error.message : String(error),
    );
  });
  child.stderr.on("data", (chunk) => {
    result.stderrTail = appendTail(result.stderrTail, chunk.toString("utf8"));
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  if (childStartError) {
    finish(
      false,
      "codex_app_server_spawn_failed",
      childStartError instanceof Error ? childStartError.message : String(childStartError),
    );
    return;
  }

  const rpc = createRpcClient(child, loginParams, dynamicToolBridgeConfig, dynamicToolNames);
  const globalTimeout = setTimeout(() => {
    child.kill("SIGKILL");
  }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 20000);

  try {
    result.stage = "initialize";
    const initialized = await rpc.request(
      "initialize",
      {
        clientInfo: {
          name: "polynet",
          title: "PolyNet",
          version: "codex-harness-probe",
        },
        capabilities: {
          experimentalApi: true,
        },
      },
      60000,
    );
    result.initialized = true;
    result.serverInfo = sanitize(initialized?.serverInfo || null);
    result.userAgent = typeof initialized?.userAgent === "string" ? initialized.userAgent : null;
    rpc.notify("initialized");

    result.stage = "account_login";
    await rpc.request("account/login/start", loginParams, 12000);
    result.authApplied = true;

    result.stage = "account_read";
    const account = await rpc.request("account/read", { refreshToken: false }, 8000);
    result.accountResolved = true;
    result.account = sanitize(account || null);

    result.stage = "rate_limits_read";
    try {
      const rateLimits = await rpc.request("account/rateLimits/read", undefined, 8000);
      result.rateLimits = sanitize(rateLimits || null);
      result.rateLimitsPresent = result.rateLimitsPresent || Boolean(rateLimits);
    } catch (error) {
      result.rateLimits = {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }

    if (executionRequested) {
      const runtimePrompt = promptBackedTurnRequested ? readAndRemoveRuntimePrompt() : "";
      result.shadowPromptChars = shadowTurnRequested ? runtimePrompt.length : null;
      result.runtimePromptChars = primaryTurnRequested ? runtimePrompt.length : null;
      if (promptBackedTurnRequested && !runtimePrompt) {
        finish(
          false,
          primaryTurnRequested ? "codex_primary_prompt_missing" : "codex_shadow_prompt_missing",
          primaryTurnRequested
            ? "Codex primary turn did not receive a runtime prompt."
            : "Codex shadow turn did not receive a user prompt.",
        );
        return;
      }
      const executionInstructions = shadowTurnRequested
        ? shadowInstructions
        : primaryTurnRequested
          ? readAndRemoveRuntimeInstructions()
        : toolCallCanaryRequested
          ? [
              "You are PolyNet's Codex app-server read-only tool-call canary.",
              "Use the available read-only tools or shell to inspect the current working directory.",
              "Read the file named " + toolCanaryFileName + ".",
              "Reply with exactly the file contents and no extra text.",
              "Do not mutate files, start servers, access network, or include any other text.",
            ].join(" ")
        : [
            "You are PolyNet's bounded Codex execution canary.",
            "Reply with exactly the requested text.",
            "Do not inspect files, do not run shell commands, and do not call tools.",
          ].join(" ");
      const executionInput = [
        {
          type: "text",
          text: promptBackedTurnRequested
            ? runtimePrompt
            : toolCallCanaryRequested
              ? "Use tools to read the file named " + toolCanaryFileName + " in the current working directory. Reply with exactly its full contents and no extra text."
              : "Reply with exactly: " + executionExpectedText,
          text_elements: [],
        },
      ];

	      result.executionStarted = true;
	      let threadResponse = null;
	      let threadId = "";
	      const threadApprovalPolicy = primaryTurnRequested ? "never" : "on-request";
	      const threadSandboxMode = primaryTurnRequested ? "workspace-write" : "read-only";
	      const turnSandboxPolicy = primaryTurnRequested
	        ? {
	            type: "workspaceWrite",
	            writableRoots: [process.cwd()],
	            networkAccess: false,
	            excludeTmpdirEnvVar: true,
	            excludeSlashTmp: true,
	          }
	        : { type: "readOnly", networkAccess: false };
	      result.threadApprovalPolicy = threadApprovalPolicy;
	      result.threadSandboxMode = threadSandboxMode;
	      result.sandboxPolicyType = turnSandboxPolicy.type;
	      result.sandboxPolicyNetworkAccess = turnSandboxPolicy.networkAccess === true;
	      result.sandboxPolicyWritableRootCount = Array.isArray(turnSandboxPolicy.writableRoots)
	        ? turnSandboxPolicy.writableRoots.length
	        : 0;
	      result.sandboxPolicyExcludeTmpdirEnvVar =
	        turnSandboxPolicy.excludeTmpdirEnvVar === true;
	      result.sandboxPolicyExcludeSlashTmp = turnSandboxPolicy.excludeSlashTmp === true;
	      const threadStartParams = {
	        model: executionModel,
	        modelProvider: "openai",
	        cwd: process.cwd(),
	        approvalPolicy: threadApprovalPolicy,
	        sandbox: threadSandboxMode,
	        serviceName: "PolyNet",
        developerInstructions: executionInstructions,
        dynamicTools: dynamicToolSpecs,
        experimentalRawEvents: true,
        persistExtendedHistory: primaryTurnRequested,
        ephemeral: !primaryTurnRequested,
      };
      const resumeThreadId =
        primaryTurnRequested && resumeThreadIdEnv ? resumeThreadIdEnv : "";
      if (resumeThreadId) {
        result.stage = "execution_thread_resume";
        result.codexThreadResumeAttempted = true;
        try {
          threadResponse = await rpc.request(
            "thread/resume",
            {
	              threadId: resumeThreadId,
	              model: executionModel,
	              modelProvider: "openai",
	              approvalPolicy: threadApprovalPolicy,
	              sandbox: threadSandboxMode,
              serviceName: "PolyNet",
              developerInstructions: executionInstructions,
              experimentalRawEvents: true,
              persistExtendedHistory: true,
            },
            15000,
          );
          const resumedThread = isRecord(threadResponse?.thread)
            ? threadResponse.thread
            : null;
          threadId = readString(resumedThread, "id");
          if (!threadId) {
            throw new Error("Codex app-server did not return a resumed thread id.");
          }
          if (threadId !== resumeThreadId) {
            result.codexThreadResumeThreadIdMatched = false;
            throw new Error("Codex app-server returned a different thread id for thread/resume.");
          }
          result.codexThreadResumeThreadIdMatched = true;
          result.codexThreadResumed = true;
          result.codexThreadLifecycleAction = "resumed";
          pushAdapterEvent({
            type: "thread_resume_response",
            method: "thread/resume",
            thread_id_present: true,
            model: readString(threadResponse, "model") || executionModel,
          });
        } catch (error) {
          result.codexThreadResumeFailed = true;
          result.codexThreadResumeErrorMessage =
            error instanceof Error ? error.message : String(error);
          result.codexThreadLifecycleAction = "resume_failed_started";
          pushAdapterEvent({
            type: "thread_resume_failed",
            method: "thread/resume",
            thread_id_present: false,
          });
          threadResponse = null;
          threadId = "";
        }
      }
      if (!threadId) {
        result.stage = "execution_thread_start";
        threadResponse = await rpc.request("thread/start", threadStartParams, 15000);
        const thread = isRecord(threadResponse?.thread) ? threadResponse.thread : null;
        threadId = readString(thread, "id");
        if (!result.codexThreadLifecycleAction) {
          result.codexThreadLifecycleAction = "started";
        }
      }
      if (!threadId) {
        finish(false, "codex_execution_thread_missing", "Codex app-server did not return a thread id.");
        return;
      }
      result.codexThreadStarted = true;
      result.codexThreadId = threadId;
      if (result.codexThreadLifecycleAction !== "resumed") {
        pushAdapterEvent({
          type: "thread_start_response",
          method: "thread/start",
          thread_id_present: true,
          model: readString(threadResponse, "model") || executionModel,
        });
      }

      result.stage = "execution_turn_start";
      const turnResponse = await rpc.request(
        "turn/start",
        {
          threadId,
	          input: executionInput,
	          cwd: process.cwd(),
	          approvalPolicy: threadApprovalPolicy,
	          sandboxPolicy: turnSandboxPolicy,
          model: executionModel,
          effort: "low",
          collaborationMode: {
            mode: "default",
            settings: {
              model: executionModel,
              reasoning_effort: "low",
              developer_instructions: executionInstructions,
            },
          },
        },
        30000,
      );
      const turn = isRecord(turnResponse?.turn) ? turnResponse.turn : null;
      const turnId = readString(turn, "id");
      if (!turn || !turnId) {
        finish(false, "codex_execution_turn_missing", "Codex app-server did not return a turn id.");
        return;
      }
      result.codexTurnStarted = true;
      startExecutionCollection(threadId, turn);
      pushAdapterEvent({
        type: "turn_start_response",
        method: "turn/start",
        thread_id_present: true,
        turn_id_present: true,
        status: readString(turn, "status") || null,
      });

      result.stage = "execution_collect";
      await waitForExecutionCompletion(30000);
      if (executionCollector.errorMessage) {
        finish(false, "codex_execution_failed", executionCollector.errorMessage);
        return;
      }
      const finalText = collectExecutionText();
      result.executionCompleted = true;
      result.executionFinalTextChars = finalText.length;
      result.executionFinalTextSha256 = sha256Text(finalText);
      if (executionSmokeRequested) {
        result.executionFinalText = finalText;
        result.executionMatchedExpected = finalText.trim() === executionExpectedText;
      }
      if (toolCallCanaryRequested) {
        result.executionFinalText = null;
        result.executionMatchedExpected = false;
        result.toolCallCanaryMatchedExpected = Boolean(toolCanaryExpectedText) && finalText.trim() === toolCanaryExpectedText;
        result.toolCallCanaryToolStarted = Number(result.adapterSummary.toolStartedEvents || 0) > 0;
      }
      if (shadowTurnRequested) {
        result.executionFinalText = null;
        result.executionMatchedExpected = false;
        result.shadowOutputPresent = finalText.trim().length > 0;
        result.shadowOutputChars = finalText.length;
        result.shadowOutputSha256 = sha256Text(finalText);
      }
      if (primaryTurnRequested) {
        result.executionFinalText = finalText;
        result.executionMatchedExpected = false;
      }
      pushAdapterEvent({
        type: "execution_text_collected",
        method: "adapter/collect",
        thread_id_present: true,
        turn_id_present: Boolean(result.codexTurnId),
        final_text_chars: finalText.length,
        matched_expected: result.executionMatchedExpected,
        shadow_turn: shadowTurnRequested,
        tool_call_canary: toolCallCanaryRequested,
      });
      if (executionSmokeRequested && !result.executionMatchedExpected) {
        finish(false, "codex_execution_output_mismatch", "Codex execution canary returned unexpected text.");
        return;
      }
      if (toolCallCanaryRequested && !result.toolCallCanaryMatchedExpected) {
        finish(false, "codex_tool_call_canary_output_mismatch", "Codex tool-call canary did not return the expected file contents.");
        return;
      }
      if (toolCallCanaryRequested && !result.toolCallCanaryToolStarted) {
        finish(false, "codex_tool_call_canary_no_tool_event", "Codex tool-call canary completed without a captured tool start event.");
        return;
      }
      if (shadowTurnRequested && !result.shadowOutputPresent) {
        finish(false, "codex_shadow_output_missing", "Codex shadow turn produced no assistant text.");
        return;
      }
      if (primaryTurnRequested && !finalText.trim()) {
        finish(false, "codex_primary_output_missing", "Codex primary turn produced no assistant text.");
        return;
      }
    }

    await persistCodexSessions({
      persistentCodexHome,
      archivePath: codexSessionArchivePath,
      codexHome,
    });

    result.stage = "completed";
    finish(true, null, null);
  } finally {
    clearTimeout(globalTimeout);
    rpc.close();
    try {
      child.stdin.end();
    } catch {
      // ignore
    }
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      rmSync(codexHome, { recursive: true, force: true });
      result.codexHomeCleanupAction = "runtime_home_removed_after_probe";
    } catch {
      result.codexHomeCleanupAction = "runtime_home_cleanup_failed";
    }
  }
}

main().catch((error) => {
  finish(false, "codex_probe_failed", error instanceof Error ? error.message : String(error));
});
`;
}
