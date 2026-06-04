"use node";

import { randomUUID } from "node:crypto";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import {
  CODEX_BRIDGE_CONTEXT_URL_ENV_NAME,
  CODEX_BRIDGE_EVENT_URL_ENV_NAME,
  CODEX_BRIDGE_FINISH_URL_ENV_NAME,
  CODEX_BRIDGE_RUN_ID_ENV_NAME,
  CODEX_BRIDGE_TOKEN_ENV_NAME,
} from "../shared/codexBridgeContract.ts";
import {
  mintCodexBridgeOperatorTokenForServer,
  verifyCodexBridgeOperatorToken,
} from "./codexBridgeOperatorGate.ts";
import { mintCodexBridgeRunToken } from "./codexBridgeToken.ts";
import {
  ensureBlaxelWorkspaceComputer,
  executeBlaxelWorkspaceCommand,
} from "./blaxelWorkspaceComputerProvider.ts";
import { buildBlaxelProjectWorkspaceNames } from "./blaxelWorkspaceProjectNames.ts";
import { resolveWorkspaceComputerProviderFromServerEnv } from "./workspaceComputerProviderPolicy.ts";

type CodexExecSmokeEvidence = {
  stagingOnly: boolean;
  operatorAuthorized: boolean;
  providerPolicySelected: boolean;
  projectLoaded: boolean;
  codexAuthAvailable: boolean;
  sandboxEnsured: boolean;
  runStarted: boolean;
  tokenMinted: boolean;
  commandRan: boolean;
  contextCallbackOk: boolean;
  codexCliInvoked: boolean;
  codexJsonlStreamStarted: boolean;
  codexJsonlParsed: boolean;
  codexFinalCaptured: boolean;
  eventCallbackOk: boolean;
  finishCallbackOk: boolean;
  ledgerEventVisible: boolean;
  runFinished: boolean;
};

type CodexExecSmokeError = {
  errorName?: string;
  errorMessage?: string;
  responseStatus?: number;
  providerCode?: string;
};

type CodexExecSmokeResult = {
  ok: boolean;
  code: string;
  deploymentKind: string;
  projectId: string;
  threadId: string;
  ownerId: string | null;
  runId: string;
  sandboxName: string | null;
  evidence: CodexExecSmokeEvidence;
  outputs: {
    stdout?: string | null;
    stderr?: string | null;
    status?: string | null;
    exitCode?: number | null;
  };
  failures: string[];
  errors: CodexExecSmokeError[];
};

const CODEX_EXEC_MARKER = "BRIDGE_CODEX_OK";
const DEFAULT_CODEX_NPM_SPEC = "@openai/codex@0.137.0";

const CODEX_EXEC_COMMAND = `node - <<'POLYNET_CODEX_BRIDGE_NODE'
const { existsSync, mkdirSync, readFileSync, rmSync } = require("node:fs");
const { spawn, spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const token = process.env.POLYNET_CODEX_BRIDGE_TOKEN;
const runId = process.env.POLYNET_CODEX_BRIDGE_RUN_ID;
const eventUrl = process.env.POLYNET_CODEX_BRIDGE_EVENT_URL;
const finishUrl = process.env.POLYNET_CODEX_BRIDGE_FINISH_URL;
const contextUrl = process.env.POLYNET_CODEX_BRIDGE_CONTEXT_URL;
const marker = process.env.POLYNET_CODEX_BRIDGE_EXPECTED_MARKER || "BRIDGE_CODEX_OK";
const npmSpec = process.env.POLYNET_CODEX_BRIDGE_CODEX_NPM_SPEC || "@openai/codex@0.137.0";
const model = process.env.POLYNET_CODEX_BRIDGE_CODEX_MODEL || "";
const maxEvents = Number(process.env.POLYNET_CODEX_BRIDGE_MAX_JSONL_EVENTS || 80);
const promptText = process.env.POLYNET_CODEX_EXEC_PROMPT || "";

function clipText(value, limit) {
  const text = String(value ?? "");
  return text.length > limit ? text.slice(0, limit) : text;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    console.error(text.slice(0, 2000));
    process.exit(1);
  }
  return text ? JSON.parse(text) : {};
}

function commandExists(name) {
  const result = spawnSync("sh", ["-lc", "command -v " + name], {
    encoding: "utf8",
    timeout: 10_000,
  });
  return result.status === 0 && String(result.stdout || "").trim();
}

function extractAgentText(event) {
  const item = event && typeof event === "object" ? event.item : null;
  if (!item || typeof item !== "object") return "";
  if (item.type !== "agent_message") return "";
  return typeof item.text === "string" ? item.text : "";
}

function summarizeCodexJsonlEvent(event, rawChars) {
  const item = event && typeof event === "object" ? event.item : null;
  const itemType = item && typeof item === "object" && typeof item.type === "string" ? item.type : null;
  const itemStatus = item && typeof item === "object" && typeof item.status === "string" ? item.status : null;
  return {
    type: event && typeof event === "object" && typeof event.type === "string" ? event.type : "unknown",
    item_type: itemType,
    item_status: itemStatus,
    agent_message_chars: extractAgentText(event).length,
    raw_chars: rawChars,
  };
}

function appendLimitedText(current, next, maxChars) {
  const combined = String(current || "") + String(next || "");
  return combined.length > maxChars ? combined.slice(combined.length - maxChars) : combined;
}

async function runCodexExecStreaming(command, args, options) {
  return await new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let stdoutChars = 0;
    let stderrChars = 0;
    let stdoutBuffer = "";
    let exitCode = null;
    let signal = null;
    let error = null;
    let timedOut = false;
    let killTimer = null;
    let eventPostQueue = Promise.resolve();
    const timeoutMs = Math.max(1, Number(options.timeoutMs || 120000));

    const flushStdoutLine = (line) => {
      const trimmed = String(line || "").trim();
      if (!trimmed) return;
      eventPostQueue = eventPostQueue.then(() => options.onStdoutLine(trimmed));
    };

    const child = spawn(command, args, {
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
      killTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
      }, 5000);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      const text = String(chunk || "");
      stdoutChars += text.length;
      stdout = appendLimitedText(stdout, text, 4 * 1024 * 1024);
      stdoutBuffer += text;
      while (true) {
        const index = stdoutBuffer.indexOf("\\n");
        if (index < 0) break;
        const line = stdoutBuffer.slice(0, index).replace(/\\r$/, "");
        stdoutBuffer = stdoutBuffer.slice(index + 1);
        flushStdoutLine(line);
      }
    });

    child.stderr.on("data", (chunk) => {
      const text = String(chunk || "");
      stderrChars += text.length;
      stderr = appendLimitedText(stderr, text, 2 * 1024 * 1024);
    });

    child.on("error", (childError) => {
      error = childError;
    });

    child.on("close", (code, childSignal) => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      if (stdoutBuffer.trim()) flushStdoutLine(stdoutBuffer);
      exitCode = typeof code === "number" ? code : null;
      signal = childSignal || null;
      eventPostQueue
        .then(() => {
          resolve({
            stdout,
            stderr,
            stdoutChars,
            stderrChars,
            exitCode,
            signal,
            timedOut,
            error,
          });
        })
        .catch((queueError) => {
          resolve({
            stdout,
            stderr,
            stdoutChars,
            stderrChars,
            exitCode,
            signal,
            timedOut,
            error: queueError,
          });
        });
    });

    child.stdin.write(options.input || "");
    child.stdin.end();
  });
}

async function main() {
if (!token || !runId || !eventUrl || !finishUrl || !contextUrl) {
  console.error("missing_bridge_env");
  process.exit(1);
}

const startedAt = Date.now();
const safeRunId = runId.replace(/[^A-Za-z0-9_.-]+/g, "-").slice(0, 80) || "run";
const codexHome = "/tmp/polynet-codex-home-" + safeRunId + "-" + randomUUID();
let contextPrompt = "";
  let finalText = "";
  let parsedEventCount = 0;
  let invalidJsonlCount = 0;
  let streamedJsonlEventCount = 0;
  let codexExitCode = null;
  let status = "failed";
  let errorMessage = "";

try {
  const contextResponse = await postJson(contextUrl, {
    version: 1,
    runId,
    includePrompt: true,
    latestUserText: promptText,
  });
  contextPrompt = String(contextResponse?.context?.contextPrompt || "");

  await postJson(eventUrl, {
    version: 1,
    runId,
    eventType: "codex_exec_invoked",
    eventKey: "codex_exec_invoked",
    source: "bridge_worker",
    payload: {
      npm_spec: npmSpec,
      model: model || null,
      context_prompt_chars: contextPrompt.length,
      expected_marker: marker,
    },
    createdAt: Date.now(),
  });

  await postJson(eventUrl, {
    version: 1,
    runId,
    eventType: "codex_exec_stream_started",
    eventKey: "codex_exec_stream_started",
    source: "bridge_worker",
    payload: {
      stream_source: "codex_stdout_jsonl",
      max_jsonl_events: maxEvents,
    },
    createdAt: Date.now(),
  });

  const finalPath = "/tmp/polynet-codex-final-" + randomUUID() + ".txt";
  const args = [
    "exec",
    "--json",
    "--skip-git-repo-check",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--dangerously-bypass-approvals-and-sandbox",
    "--output-last-message",
    finalPath,
  ];
  if (model) args.push("-m", model);
  args.push("-");

  const prompt = [
    "You are Codex running headlessly inside a Blaxel sandbox for a PolyNet bridge smoke.",
    "Do not modify files. Do not inspect unrelated repository state.",
    "PolyNet has already fetched the bounded run context below. Treat it as orientation only.",
    contextPrompt ? "POLYNET_CONTEXT\\n" + clipText(contextPrompt, 12000) : "POLYNET_CONTEXT\\n(none)",
    "Task: answer with exactly " + marker + " and nothing else.",
  ].join("\\n\\n");

  const localCodex = commandExists("codex");
  const command = localCodex ? "codex" : "npx";
  const execCommandArgs = localCodex ? args : ["-y", npmSpec, ...args];
  const loginCommandArgs = localCodex
    ? ["login", "--with-api-key"]
    : ["-y", npmSpec, "login", "--with-api-key"];
  const home = process.env.HOME || "/tmp";
  mkdirSync(codexHome, { recursive: true });
  mkdirSync(home, { recursive: true });
  const loginEnv = {
    ...process.env,
    CODEX_HOME: codexHome,
    HOME: home,
    NO_COLOR: "1",
  };
  const execEnv = { ...loginEnv };
  delete execEnv.OPENAI_API_KEY;
  async function handleCodexJsonlLine(line) {
    let parsed = null;
    try {
      parsed = JSON.parse(line);
    } catch {
      invalidJsonlCount += 1;
      return;
    }
    const eventIndex = parsedEventCount;
    parsedEventCount += 1;
    const eventType = typeof parsed.type === "string" && parsed.type ? parsed.type : "codex_exec_jsonl";
    const maybeText = extractAgentText(parsed);
    if (maybeText) finalText = maybeText;
    if (eventIndex < maxEvents) {
      streamedJsonlEventCount += 1;
      await postJson(eventUrl, {
        version: 1,
        runId,
        eventType,
        eventKey: "codex_exec_jsonl:" + eventIndex,
        source: "codex_exec_jsonl",
        payload: summarizeCodexJsonlEvent(parsed, line.length),
        createdAt: Date.now(),
      });
    }
  }

  const login = spawnSync(command, loginCommandArgs, {
    input: String(process.env.OPENAI_API_KEY || "") + "\\n",
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 2 * 1024 * 1024,
    env: loginEnv,
  });
  let child = login;
  delete process.env.OPENAI_API_KEY;
  if (login.status === 0 && !login.error) {
    child = await runCodexExecStreaming(command, execCommandArgs, {
      input: prompt,
      env: execEnv,
      timeoutMs: Number(process.env.POLYNET_CODEX_BRIDGE_TIMEOUT_MS || 120000),
      onStdoutLine: handleCodexJsonlLine,
    });
  } else {
    errorMessage = clipText(String(login.stderr || login.stdout || login.error?.message || "codex_login_failed"), 1000);
  }
  codexExitCode =
    typeof child.status === "number"
      ? child.status
      : typeof child.exitCode === "number"
        ? child.exitCode
        : null;
  if (child.error) errorMessage = child.error.message || String(child.error);
  if (child.timedOut) errorMessage = errorMessage || "codex_exec_timed_out";

  const stdout = String(child.stdout || "");
  const stderr = String(child.stderr || "");

  if (existsSync(finalPath)) {
    finalText = String(readFileSync(finalPath, "utf8") || "").trim() || finalText;
  }
  if (child.signal) errorMessage = errorMessage || "codex_exec_signal_" + child.signal;
  if (codexExitCode !== 0) {
    errorMessage = errorMessage || clipText(stderr || stdout || "codex_exec_failed", 1000);
  }

  await postJson(eventUrl, {
    version: 1,
    runId,
    eventType: "codex_exec_final",
    eventKey: "codex_exec_final",
    source: "bridge_worker",
    payload: {
      exit_code: codexExitCode,
      parsed_event_count: parsedEventCount,
      streamed_jsonl_event_count: streamedJsonlEventCount,
      invalid_jsonl_count: invalidJsonlCount,
      final_text_matches_marker: finalText.trim() === marker,
      final_text_chars: finalText.length,
      error_present: Boolean(errorMessage),
      stdout_chars: typeof child.stdoutChars === "number" ? child.stdoutChars : stdout.length,
      stderr_chars: typeof child.stderrChars === "number" ? child.stderrChars : stderr.length,
      timed_out: Boolean(child.timedOut),
      elapsed_ms: Date.now() - startedAt,
    },
    createdAt: Date.now(),
  });

  status =
    child.timedOut
      ? "timed_out"
      : codexExitCode === 0 && finalText.trim() === marker
        ? "succeeded"
        : "failed";
  await postJson(finishUrl, {
    version: 1,
    runId,
    status,
    reason: "codex_bridge_codex_exec_smoke",
    errorCode:
      status === "succeeded"
        ? null
        : status === "timed_out"
          ? "codex_exec_smoke_timed_out"
          : "codex_exec_smoke_failed",
    errorMessage:
      status === "succeeded"
        ? null
        : status === "timed_out"
          ? "Codex exec smoke timed out before producing the expected marker."
          : "Codex exec smoke failed before producing the expected marker.",
    finishedAt: Date.now(),
  });

  console.log(status === "succeeded" ? "BRIDGE_CODEX_EXEC_SMOKE_OK" : "BRIDGE_CODEX_EXEC_SMOKE_FAILED");
  console.log(JSON.stringify({
    status,
    codex_exit_code: codexExitCode,
    parsed_event_count: parsedEventCount,
    streamed_jsonl_event_count: streamedJsonlEventCount,
    invalid_jsonl_count: invalidJsonlCount,
    final_text_matches_marker: finalText.trim() === marker,
    final_text_chars: finalText.length,
    error_present: Boolean(errorMessage),
  }));
  process.exitCode = status === "succeeded" ? 0 : 1;
  return;
} catch (error) {
  const message = error && typeof error === "object" && "message" in error ? error.message : String(error);
  await postJson(eventUrl, {
    version: 1,
    runId,
    eventType: "codex_exec_bridge_error",
    eventKey: "codex_exec_bridge_error",
    source: "bridge_worker",
    payload: {
      error_present: true,
      parsed_event_count: parsedEventCount,
      invalid_jsonl_count: invalidJsonlCount,
    },
    createdAt: Date.now(),
  }).catch(() => {});
  await postJson(finishUrl, {
    version: 1,
    runId,
    status: "failed",
    reason: "codex_bridge_codex_exec_smoke",
    errorCode: "codex_exec_bridge_error",
    errorMessage: "Codex exec bridge failed before producing the expected marker.",
    finishedAt: Date.now(),
  }).catch(() => {});
  console.error("codex_exec_bridge_error");
  process.exitCode = 1;
  return;
} finally {
  try {
    rmSync(codexHome, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup only.
  }
}
}

main().catch(() => {
  console.error("codex_exec_bridge_error");
  process.exit(1);
});
POLYNET_CODEX_BRIDGE_NODE`;

function readEnv(name: string): string {
  try {
    const value = (globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }).process?.env?.[name];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function normalizeDeploymentKind(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeBaseUrl(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function resolveBridgeBaseUrl(raw: unknown): string | null {
  return (
    normalizeBaseUrl(raw) ??
    normalizeBaseUrl(readEnv("POLYNET_CODEX_BRIDGE_BASE_URL")) ??
    normalizeBaseUrl(readEnv("CONVEX_SITE_URL")) ??
    normalizeBaseUrl(readEnv("VITE_CONVEX_SITE_URL")) ??
    normalizeBaseUrl(readEnv("PUBLIC_CONVEX_SITE_URL"))
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function redactSensitiveText(value: string): string {
  const clipped = value.slice(0, 800);
  if (/(authorization|api[_-]?key|x-api-key|token|secret|headers|config|bearer\s+|sk-[a-z0-9_-]+)/i.test(clipped)) {
    return "[redacted_provider_error]";
  }
  return clipped;
}

function safeText(value: unknown): string | undefined {
  if (typeof value === "string") return redactSensitiveText(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value).slice(0, 800);
  return undefined;
}

function safeNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sanitizeSmokeError(error: unknown): CodexExecSmokeError {
  const record = asRecord(error);
  const response = asRecord(record?.response);
  const responseData = asRecord(response?.data);
  return {
    errorName: error instanceof Error ? safeText(error.name) : safeText(record?.name),
    errorMessage:
      error instanceof Error
        ? safeText(error.message)
        : safeText(record?.message) ??
          safeText(record?.error) ??
          safeText(responseData?.message) ??
          safeText(responseData?.error),
    responseStatus: safeNumber(record?.status ?? record?.statusCode ?? response?.status),
    providerCode: safeText(record?.code ?? responseData?.code),
  };
}

function initialEvidence(): CodexExecSmokeEvidence {
  return {
    stagingOnly: false,
    operatorAuthorized: false,
    providerPolicySelected: false,
    projectLoaded: false,
    codexAuthAvailable: false,
    sandboxEnsured: false,
    runStarted: false,
    tokenMinted: false,
    commandRan: false,
    contextCallbackOk: false,
    codexCliInvoked: false,
    codexJsonlStreamStarted: false,
    codexJsonlParsed: false,
    codexFinalCaptured: false,
    eventCallbackOk: false,
    finishCallbackOk: false,
    ledgerEventVisible: false,
    runFinished: false,
  };
}

function buildRunId(raw: unknown): string {
  const provided = String(raw ?? "").trim();
  if (provided) return provided.slice(0, 180);
  return `codex_bridge_codex_exec_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

function resolveCodexExecApiKey(): { key: string; source: string } | null {
  const dedicated = readEnv("POLYNET_CODEX_BRIDGE_OPENAI_API_KEY");
  if (dedicated) return { key: dedicated, source: "bridge_specific" };
  return null;
}

function readOptionalPositiveIntegerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(readEnv(name), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const smokeCodexBridgeCodexExec = action({
  args: {
    projectId: v.id("cloudProjects"),
    threadId: v.id("threads"),
    operatorToken: v.string(),
    runId: v.optional(v.string()),
    baseUrl: v.optional(v.string()),
    prompt: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<CodexExecSmokeResult> => {
    const deploymentKind = normalizeDeploymentKind(readEnv("POLYNET_DEPLOYMENT_KIND"));
    const evidence = initialEvidence();
    const failures: string[] = [];
    const errors: CodexExecSmokeError[] = [];
    const runId = buildRunId(args.runId);
    const explicitBaseUrl = String(args.baseUrl ?? "").trim();
    let projectId = String(args.projectId);
    let threadId = String(args.threadId);
    let names = buildBlaxelProjectWorkspaceNames(args.projectId);
    let ownerId: string | null = null;

    evidence.stagingOnly = deploymentKind === "staging";
    if (!evidence.stagingOnly) {
      return {
        ok: false,
        code: "codex_bridge_codex_exec_smoke_staging_only",
        deploymentKind,
        projectId: String(args.projectId),
        threadId: String(args.threadId),
        ownerId,
        runId,
        sandboxName: names.sandboxName,
        evidence,
        outputs: {},
        failures: ["not_staging_deployment"],
        errors,
      };
    }

    const operator = await verifyCodexBridgeOperatorToken(args.operatorToken, {
      action: "codex_bridge_codex_exec_smoke",
      runId,
      projectId: String(args.projectId),
      threadId: String(args.threadId),
      baseUrl: explicitBaseUrl || null,
    });
    evidence.operatorAuthorized = operator.ok;
    if (!operator.ok) {
      failures.push(operator.code);
      errors.push({
        providerCode: operator.code,
        errorMessage: operator.message,
      });
      return {
        ok: false,
        code: "codex_bridge_codex_exec_smoke_failed",
        deploymentKind,
        projectId: String(args.projectId),
        threadId: String(args.threadId),
        ownerId,
        runId,
        sandboxName: names.sandboxName,
        evidence,
        outputs: {},
        failures,
        errors,
      };
    }

    const policy = resolveWorkspaceComputerProviderFromServerEnv();
    evidence.providerPolicySelected = policy.providerId === "blaxel";
    if (!evidence.providerPolicySelected) failures.push("blaxel_policy_not_selected");

    const baseUrl = resolveBridgeBaseUrl(args.baseUrl);
    if (!baseUrl) failures.push("bridge_base_url_missing");

    const apiKey = resolveCodexExecApiKey();
    evidence.codexAuthAvailable = Boolean(apiKey);
    if (!evidence.codexAuthAvailable) failures.push("codex_exec_openai_api_key_missing");

    try {
      const scope = (await ctx.runQuery(
        (internal as any).threads.resolveCodexBridgeRunScopeInternal as any,
        {
          threadId: args.threadId,
          expectedProjectId: args.projectId,
        },
      )) as Record<string, unknown> | null;
      evidence.projectLoaded = Boolean(scope);
      ownerId = normalizeOptionalString(scope?.ownerId);
      projectId = normalizeOptionalString(scope?.projectId) ?? projectId;
      threadId = normalizeOptionalString(scope?.threadId) ?? threadId;
      names = buildBlaxelProjectWorkspaceNames(projectId);
      const communityId = normalizeOptionalString(scope?.communityId);
      const communityContextVersion =
        typeof scope?.communityContextVersion === "number" &&
        Number.isFinite(scope.communityContextVersion)
          ? Math.floor(scope.communityContextVersion)
          : undefined;
      if (!scope) failures.push("bridge_scope_missing");
      if (!ownerId) failures.push("bridge_scope_owner_missing");
      if (!projectId) failures.push("bridge_scope_project_missing");
      if (!threadId) failures.push("bridge_scope_thread_missing");

      if (failures.length > 0 || !ownerId || !projectId || !threadId || !baseUrl || !apiKey) {
        return {
          ok: false,
          code: "codex_bridge_codex_exec_smoke_failed",
          deploymentKind,
          projectId,
          threadId,
          ownerId,
          runId,
          sandboxName: names.sandboxName,
          evidence,
          outputs: {},
          failures,
          errors,
        };
      }

      const minted = await mintCodexBridgeRunToken({
        runId,
        ownerId,
        threadId,
        projectId,
        communityId,
        operations: ["event", "finish", "context"],
        ttlMs: 15 * 60 * 1000,
      });
      if (!minted.ok) {
        failures.push(minted.code);
        errors.push({
          responseStatus: minted.status,
          providerCode: minted.code,
          errorMessage: minted.message,
        });
        return {
          ok: false,
          code: "codex_bridge_codex_exec_smoke_failed",
          deploymentKind,
          projectId,
          threadId,
          ownerId,
          runId,
          sandboxName: names.sandboxName,
          evidence,
          outputs: {},
          failures,
          errors,
        };
      }
      evidence.tokenMinted = true;

      const ensured = await ensureBlaxelWorkspaceComputer({
        sandboxName: names.sandboxName,
        volumeName: names.volumeName,
        lifecycleIntent: "agent_run",
        labels: {
          purpose: "codex-bridge-codex-exec-smoke",
          project_id: projectId,
          owner_id: ownerId,
        },
      });
      if (!ensured.ok) {
        failures.push("sandbox_ensure_failed");
        errors.push({
          responseStatus: ensured.status,
          providerCode: ensured.code,
          errorMessage: redactSensitiveText(ensured.message),
        });
        return {
          ok: false,
          code: "codex_bridge_codex_exec_smoke_failed",
          deploymentKind,
          projectId,
          threadId,
          ownerId,
          runId,
          sandboxName: names.sandboxName,
          evidence,
          outputs: {},
          failures,
          errors,
        };
      }
      evidence.sandboxEnsured = true;

      const prompt =
        String(args.prompt ?? "").trim() ||
        "Run the PolyNet Codex bridge smoke and produce the required marker.";
      const run = (await ctx.runMutation(
        (internal as any).threads.ensureCloudRuntimeRunStartedByBridgeInternal as any,
        {
          ownerId: ownerId as any,
          threadId: args.threadId,
          runId,
          lane: "runtime",
          visibility: "internal_hidden",
          projectId: projectId as any,
          ...(communityId ? { communityId: communityId as any } : null),
          ...(typeof communityContextVersion === "number" ? { communityContextVersion } : null),
          executionMode: "codex_exec_jsonl",
          contractName: "codex_blaxel_bridge",
          contractVersion: "v1",
          harnessProfile: "codex_blaxel_bridge_poc",
          harnessProfileSource: "codex_bridge_codex_exec_smoke",
          capabilityFamilies: ["codex_bridge", "blaxel_process", "codex_exec_jsonl", "polynet_context"],
          nowMs: Date.now(),
        },
      )) as Record<string, unknown> | null;
      evidence.runStarted = Boolean(run);

      const commandResult = await executeBlaxelWorkspaceCommand({
        sandboxName: names.sandboxName,
        cwd: ".",
        command: CODEX_EXEC_COMMAND,
        processName: `codex-bridge-codex-${randomUUID().slice(0, 8)}`,
        waitForCompletion: true,
        timeoutSeconds: readOptionalPositiveIntegerEnv("POLYNET_CODEX_BRIDGE_COMMAND_TIMEOUT_SECONDS", 180),
        env: {
          [CODEX_BRIDGE_TOKEN_ENV_NAME]: minted.token,
          [CODEX_BRIDGE_RUN_ID_ENV_NAME]: runId,
          [CODEX_BRIDGE_EVENT_URL_ENV_NAME]: `${baseUrl}/runtime/codex_bridge/event`,
          [CODEX_BRIDGE_FINISH_URL_ENV_NAME]: `${baseUrl}/runtime/codex_bridge/finish`,
          [CODEX_BRIDGE_CONTEXT_URL_ENV_NAME]: `${baseUrl}/runtime/codex_bridge/context`,
          OPENAI_API_KEY: apiKey.key,
          POLYNET_CODEX_BRIDGE_EXPECTED_MARKER: CODEX_EXEC_MARKER,
          POLYNET_CODEX_EXEC_PROMPT: prompt,
          POLYNET_CODEX_BRIDGE_CODEX_NPM_SPEC:
            readEnv("POLYNET_CODEX_BRIDGE_CODEX_NPM_SPEC") || DEFAULT_CODEX_NPM_SPEC,
          POLYNET_CODEX_BRIDGE_CODEX_MODEL: readEnv("POLYNET_CODEX_BRIDGE_CODEX_MODEL"),
          POLYNET_CODEX_BRIDGE_TIMEOUT_MS: String(
            readOptionalPositiveIntegerEnv("POLYNET_CODEX_BRIDGE_TIMEOUT_MS", 120_000),
          ),
          POLYNET_CODEX_BRIDGE_API_KEY_SOURCE: apiKey.source,
        },
        readyRetryMs: 60_000,
      });
      const outputs = commandResult.ok
        ? {
            stdout: redactSensitiveText(String(commandResult.stdout ?? "").slice(0, 1200)),
            stderr: redactSensitiveText(String(commandResult.stderr ?? "").slice(0, 1200)),
            status: commandResult.status,
            exitCode: commandResult.exitCode,
          }
        : {};
      if (!commandResult.ok) {
        failures.push("codex_exec_command_failed");
        errors.push({
          responseStatus: commandResult.status,
          providerCode: commandResult.code,
          errorMessage: redactSensitiveText(commandResult.message),
        });
      } else {
        evidence.commandRan =
          commandResult.exitCode === 0 ||
          String(commandResult.stdout ?? "").includes("BRIDGE_CODEX_EXEC_SMOKE_OK") ||
          String(commandResult.stdout ?? "").includes("BRIDGE_CODEX_EXEC_SMOKE_FAILED") ||
          commandResult.status === "completed";
        if (!evidence.commandRan) failures.push("codex_exec_command_unverified");
      }

      const events = (await ctx.runQuery(
        (internal as any).threads.listRuntimeRunEventsByOwnerRunIdInternal as any,
        {
          ownerId: ownerId as any,
          runId,
        },
      )) as Array<Record<string, unknown>>;
      evidence.contextCallbackOk = events.some((event) => event.eventType === "codex_bridge_context_fetched");
      evidence.codexCliInvoked = events.some((event) => event.eventType === "codex_exec_invoked");
      evidence.codexJsonlStreamStarted = events.some((event) => event.eventType === "codex_exec_stream_started");
      evidence.codexJsonlParsed = events.some((event) =>
        ["thread.started", "turn.started", "turn.completed", "item.completed"].includes(
          String(event.eventType ?? ""),
        ),
      );
      evidence.codexFinalCaptured = events.some((event) => event.eventType === "codex_exec_final");
      evidence.eventCallbackOk =
        evidence.codexCliInvoked &&
        evidence.codexJsonlStreamStarted &&
        evidence.codexFinalCaptured;
      evidence.finishCallbackOk = events.some((event) => event.eventType === "run_finished");
      evidence.ledgerEventVisible =
        evidence.contextCallbackOk &&
        evidence.eventCallbackOk &&
        evidence.finishCallbackOk;
      if (!evidence.finishCallbackOk) {
        try {
          await ctx.runMutation(
            (internal as any).threads.finishCloudRuntimeRunByBridgeClaimsInternal as any,
            {
              ownerId: ownerId as any,
              threadId: args.threadId,
              runId,
              claimProjectId: projectId,
              claimCommunityId: communityId ?? undefined,
              status: "error",
              reason: "codex_bridge_codex_exec_smoke_failed_before_finish_callback",
              errorCode: "codex_bridge_codex_exec_smoke_failed",
              errorMessage: failures.join(", ").slice(0, 1000) || "Codex exec smoke failed.",
              nowMs: Date.now(),
            },
          );
        } catch {
          // Best-effort smoke cleanup. The callback evidence above remains the verification source.
        }
      }

      const refreshedRun = (await ctx.runQuery(
        (internal as any).threads.getRuntimeRunByOwnerRunIdInternal as any,
        {
          ownerId: ownerId as any,
          runId,
        },
      )) as Record<string, unknown> | null;
      evidence.runFinished = refreshedRun?.status === "ok";
      if (!evidence.contextCallbackOk) failures.push("bridge_context_not_visible");
      if (!evidence.codexCliInvoked) failures.push("codex_exec_invocation_not_visible");
      if (!evidence.codexJsonlStreamStarted) failures.push("codex_exec_stream_start_not_visible");
      if (!evidence.codexJsonlParsed) failures.push("codex_exec_jsonl_not_visible");
      if (!evidence.codexFinalCaptured) failures.push("codex_exec_final_not_visible");
      if (!evidence.finishCallbackOk) failures.push("bridge_finish_not_visible");
      if (!evidence.runFinished) failures.push("bridge_run_not_finished");

      return {
        ok:
          failures.length === 0 &&
          Object.values(evidence).every((value) => value === true),
        code: "codex_bridge_codex_exec_smoke",
        deploymentKind,
        projectId,
        threadId,
        ownerId,
        runId,
        sandboxName: names.sandboxName,
        evidence,
        outputs,
        failures,
        errors,
      };
    } catch (error) {
      failures.push("unexpected_codex_exec_smoke_error");
      errors.push(sanitizeSmokeError(error));
      return {
        ok: false,
        code: "codex_bridge_codex_exec_smoke_failed",
        deploymentKind,
        projectId,
        threadId,
        ownerId,
        runId,
        sandboxName: names.sandboxName,
        evidence,
        outputs: {},
        failures,
        errors,
      };
    }
  },
});

export const startOperatorCodexBridgeCodexExecRun = action({
  args: {
    authSubject: v.optional(v.string()),
    projectId: v.id("cloudProjects"),
    threadId: v.id("threads"),
    runId: v.optional(v.string()),
    baseUrl: v.optional(v.string()),
    prompt: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<CodexExecSmokeResult> => {
    const deploymentKind = normalizeDeploymentKind(readEnv("POLYNET_DEPLOYMENT_KIND"));
    const runId = buildRunId(args.runId);
    const sandboxName = buildBlaxelProjectWorkspaceNames(args.projectId).sandboxName;

    if (deploymentKind !== "staging") {
      return {
        ok: false,
        code: "codex_bridge_codex_exec_smoke_staging_only",
        deploymentKind,
        projectId: String(args.projectId),
        threadId: String(args.threadId),
        ownerId: null,
        runId,
        sandboxName,
        evidence: initialEvidence(),
        outputs: {},
        failures: ["not_staging_deployment"],
        errors: [],
      };
    }

    await ctx.runQuery((internal as any).operatorAccess.getOperatorWriteAccessInternal as any, {
      authSubject: args.authSubject,
    });

    const operatorToken = await mintCodexBridgeOperatorTokenForServer({
      action: "codex_bridge_codex_exec_smoke",
      runId,
      projectId: String(args.projectId),
      threadId: String(args.threadId),
      baseUrl: args.baseUrl ?? null,
    });
    if (!operatorToken.ok) {
      return {
        ok: false,
        code: "codex_bridge_codex_exec_smoke_failed",
        deploymentKind,
        projectId: String(args.projectId),
        threadId: String(args.threadId),
        ownerId: null,
        runId,
        sandboxName,
        evidence: {
          ...initialEvidence(),
          stagingOnly: true,
          operatorAuthorized: true,
        },
        outputs: {},
        failures: [operatorToken.code],
        errors: [
          {
            providerCode: operatorToken.code,
            errorMessage: operatorToken.message,
          },
        ],
      };
    }

    return (await ctx.runAction((api as any).codexBridgeCodexExecSmoke.smokeCodexBridgeCodexExec as any, {
      projectId: args.projectId,
      threadId: args.threadId,
      runId,
      operatorToken: operatorToken.token,
      ...(args.baseUrl ? { baseUrl: args.baseUrl } : null),
      ...(args.prompt ? { prompt: args.prompt } : null),
    })) as CodexExecSmokeResult;
  },
});
