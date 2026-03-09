import { api } from "./_generated/api";
import {
  runOpenRouterCompletion,
} from "./httpRuntimeSupport";
import { runChatgptCompletion } from "./httpChatgpt";
import {
  buildFoundationContextPrompt,
  joinPromptBlocks,
} from "../shared/doctrinePrompt";

type InferenceRole = "user" | "assistant" | "system";
type InferenceMessage = {
  role: InferenceRole;
  content: string;
};

type DaytonaConfig = {
  apiBaseUrl: string;
  apiKey: string;
  orgId: string | null;
  target: string | null;
  snapshot: string | null;
  autoStopInterval: number;
  autoArchiveInterval: number;
  autoDeleteInterval: number;
};

type DaytonaSandboxApiDto = {
  id?: string | null;
  state?: string | null;
  target?: string | null;
};

type DaytonaToolboxProxyUrlDto = {
  url?: string | null;
};

type DaytonaProcessExecuteDto = {
  result?: unknown;
  stdout?: unknown;
  stderr?: unknown;
  exitCode?: number | null;
  code?: number | null;
  message?: unknown;
  error?: unknown;
};

type DaytonaProbeExecution =
  | {
      ok: true;
      providerSandboxId: string;
      toolboxProxyUrl: string;
      region: string | null;
      exitCode: number | null;
      outputText: string;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    };

type DaytonaToolName =
  | "read"
  | "list_dir"
  | "glob"
  | "grep"
  | "sha256"
  | "community_search"
  | "community_write"
  | "write"
  | "edit"
  | "bash";

type DaytonaToolCallDecision = {
  type: "tool_call";
  tool_name: DaytonaToolName;
  args?: Record<string, unknown> | null;
  reason?: string | null;
};

type DaytonaAssistantDecision = {
  type: "assistant";
  text: string;
};

type DaytonaAgentDecision = DaytonaToolCallDecision | DaytonaAssistantDecision;

type DaytonaToolPolicyDecision = {
  allowed: boolean;
  requiresApproval: boolean;
  policyBasis: string;
  denialCode: string | null;
  denialMessage: string | null;
};

type DaytonaToolExecutionResult = {
  status: "ok" | "error";
  exitCode: number | null;
  outputText: string;
  errorCode: string | null;
  errorMessage: string | null;
};

type DaytonaAgentLoopSuccess = {
  ok: true;
  assistantText: string;
  promptTokens: number | null;
  completionTokens: number | null;
};

type DaytonaAgentLoopFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  pendingToolCallId?: string;
  pendingToolName?: DaytonaToolName;
};

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

const DAYTONA_AUTO_STOP_INTERVAL_DEFAULT_MINUTES = 1;
const DAYTONA_AUTO_ARCHIVE_INTERVAL_DEFAULT_MINUTES = 0;
const DAYTONA_AUTO_DELETE_INTERVAL_DEFAULT_MINUTES = 5;
const DAYTONA_WORKSPACE_ROOT = "/home/daytona/workspace";
const CODING_INSTRUCTION_FILENAMES = ["AGENTS.md", "CLAUDE.md"] as const;
const MAX_CODING_INSTRUCTION_DOCS = 3;
const MAX_CODING_INSTRUCTION_BYTES = 1800;

function parseIntegerEnv(name: string, fallback: number): number {
  const raw = readEnv(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizeDaytonaApiBaseUrl(rawUrl: string): string | null {
  const raw = String(rawUrl ?? "").trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  const cleanedPath = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = cleanedPath.length === 0 ? "/api" : cleanedPath;
  return parsed.toString().replace(/\/+$/, "");
}

function loadDaytonaConfig(): { ok: true; config: DaytonaConfig } | { ok: false; code: string; message: string } {
  const apiKey = readEnv("DAYTONA_API_KEY");
  if (!apiKey) {
    return {
      ok: false,
      code: "runner_unavailable",
      message: "Daytona runner is unavailable. Missing DAYTONA_API_KEY.",
    };
  }
  const apiBaseUrl = normalizeDaytonaApiBaseUrl(readEnv("DAYTONA_API_URL"));
  if (!apiBaseUrl) {
    return {
      ok: false,
      code: "runner_unavailable",
      message: "Daytona runner is unavailable. DAYTONA_API_URL is missing or invalid.",
    };
  }
  const orgId = readEnv("DAYTONA_ORG_ID") || null;
  const target = readEnv("DAYTONA_TARGET") || null;
  const snapshot = readEnv("DAYTONA_SNAPSHOT") || null;
  const autoStopInterval = parseIntegerEnv(
    "DAYTONA_AUTO_STOP_INTERVAL_MINUTES",
    DAYTONA_AUTO_STOP_INTERVAL_DEFAULT_MINUTES,
  );
  const autoArchiveInterval = parseIntegerEnv(
    "DAYTONA_AUTO_ARCHIVE_INTERVAL_MINUTES",
    DAYTONA_AUTO_ARCHIVE_INTERVAL_DEFAULT_MINUTES,
  );
  const autoDeleteInterval = parseIntegerEnv(
    "DAYTONA_AUTO_DELETE_INTERVAL_MINUTES",
    DAYTONA_AUTO_DELETE_INTERVAL_DEFAULT_MINUTES,
  );
  return {
    ok: true,
    config: {
      apiBaseUrl,
      apiKey,
      orgId,
      target,
      snapshot,
      autoStopInterval,
      autoArchiveInterval,
      autoDeleteInterval,
    },
  };
}

function daytonaHeaders(config: DaytonaConfig, includeJsonContentType = true): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
  };
  if (includeJsonContentType) {
    headers["Content-Type"] = "application/json";
  }
  if (config.orgId) headers["X-Daytona-Organization-ID"] = config.orgId;
  return headers;
}

async function parseDaytonaResponseBody(response: Response): Promise<{ text: string; json: unknown | null }> {
  const text = await response.text();
  if (!text.trim()) return { text, json: null };
  try {
    return { text, json: JSON.parse(text) as unknown };
  } catch {
    return { text, json: null };
  }
}

async function daytonaApiRequest<T>(params: {
  config: DaytonaConfig;
  path: string;
  method: "GET" | "POST";
  body?: Record<string, unknown> | null;
}): Promise<
  | { ok: true; payload: T }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  let response: Response;
  try {
    response = await fetch(`${params.config.apiBaseUrl}${params.path}`, {
      method: params.method,
      headers: daytonaHeaders(params.config, true),
      ...(params.body ? { body: JSON.stringify(params.body) } : null),
    });
  } catch (error) {
    return {
      ok: false,
      status: 503,
      code: "runner_unavailable",
      message: error instanceof Error ? error.message : "Daytona API request failed.",
    };
  }
  const { text, json } = await parseDaytonaResponseBody(response);
  if (!response.ok) {
    return {
      ok: false,
      status: 503,
      code: "runner_unavailable",
      message: `Daytona API ${params.method} ${params.path} failed (${response.status}).`,
      details: {
        response_text: text.slice(0, 2000),
      },
    };
  }
  if (!json || typeof json !== "object") {
    return {
      ok: false,
      status: 503,
      code: "runner_unavailable",
      message: `Daytona API ${params.path} returned invalid JSON.`,
    };
  }
  return {
    ok: true,
    payload: json as T,
  };
}

function isDaytonaStartedState(daytonaState: string | null | undefined): boolean {
  return String(daytonaState ?? "").trim().toLowerCase() === "started";
}

function isDaytonaTerminalErrorState(daytonaState: string | null | undefined): boolean {
  const state = String(daytonaState ?? "").trim().toLowerCase();
  return (
    state === "error" ||
    state === "build_failed" ||
    state === "destroyed" ||
    state === "destroying" ||
    state === "unknown"
  );
}

async function createDaytonaSandbox(params: {
  config: DaytonaConfig;
  userId: string;
  projectId: string;
  runId: string;
  projectVolumeId?: string | null;
}): Promise<
  | { ok: true; sandbox: DaytonaSandboxApiDto }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const payloadBase: Record<string, unknown> = {
    labels: {
      arx_user_id: params.userId,
      arx_project_id: params.projectId,
      arx_run_id: params.runId,
      arx_source: "convex_runtime_turn",
    },
    ephemeral: false,
  };
  if (params.config.target) payloadBase.target = params.config.target;
  if (params.config.snapshot) payloadBase.snapshot = params.config.snapshot;
  if (params.projectVolumeId) {
    payloadBase.volumes = [
      {
        volumeId: params.projectVolumeId,
        mountPath: DAYTONA_WORKSPACE_ROOT,
      },
    ];
  }
  const payloadWithLifecycle = {
    ...payloadBase,
    autoStopInterval: params.config.autoStopInterval,
    autoArchiveInterval: params.config.autoArchiveInterval,
    autoDeleteInterval: params.config.autoDeleteInterval,
  };
  const createPrimary = await daytonaApiRequest<DaytonaSandboxApiDto>({
    config: params.config,
    path: "/sandbox",
    method: "POST",
    body: payloadWithLifecycle,
  });
  if (createPrimary.ok) {
    return {
      ok: true,
      sandbox: createPrimary.payload,
    };
  }
  const detailsText = String(createPrimary.details?.response_text ?? "").toLowerCase();
  const unsupportedLifecycleField =
    detailsText.includes("autostopinterval") ||
    detailsText.includes("autoarchiveinterval") ||
    detailsText.includes("autodeleteinterval") ||
    detailsText.includes("auto_stop_interval") ||
    detailsText.includes("auto_archive_interval") ||
    detailsText.includes("auto_delete_interval") ||
    detailsText.includes("unknown field") ||
    detailsText.includes("additional properties");
  if (!unsupportedLifecycleField) return createPrimary;
  const fallbackCreate = await daytonaApiRequest<DaytonaSandboxApiDto>({
    config: params.config,
    path: "/sandbox",
    method: "POST",
    body: payloadBase,
  });
  if (!fallbackCreate.ok) return fallbackCreate;
  return {
    ok: true,
    sandbox: fallbackCreate.payload,
  };
}

export async function stopDaytonaSandbox(params: {
  config: DaytonaConfig;
  sandboxId: string;
}): Promise<
  | { ok: true }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const res = await daytonaApiRequest<Record<string, unknown>>({
    config: params.config,
    path: `/sandbox/${encodeURIComponent(params.sandboxId)}/stop`,
    method: "POST",
  });
  if (!res.ok) return res;
  return { ok: true };
}

async function fetchDaytonaSandbox(params: {
  config: DaytonaConfig;
  sandboxId: string;
}): Promise<
  | { ok: true; sandbox: DaytonaSandboxApiDto }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const res = await daytonaApiRequest<DaytonaSandboxApiDto>({
    config: params.config,
    path: `/sandbox/${encodeURIComponent(params.sandboxId)}`,
    method: "GET",
  });
  if (!res.ok) return res;
  return { ok: true, sandbox: res.payload };
}

async function waitForDaytonaSandboxReady(params: {
  config: DaytonaConfig;
  sandboxId: string;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<
  | { ok: true; sandbox: DaytonaSandboxApiDto }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const timeoutMs = Math.max(1000, Math.floor(params.timeoutMs ?? 30_000));
  const intervalMs = Math.max(250, Math.floor(params.intervalMs ?? 1000));
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const lookup = await fetchDaytonaSandbox({
      config: params.config,
      sandboxId: params.sandboxId,
    });
    if (!lookup.ok) return lookup;
    if (isDaytonaStartedState(lookup.sandbox.state)) return lookup;
    if (isDaytonaTerminalErrorState(lookup.sandbox.state)) {
      return {
        ok: false,
        status: 503,
        code: "runner_unavailable",
        message: `Daytona sandbox entered terminal state '${String(lookup.sandbox.state ?? "unknown")}'.`,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return {
    ok: false,
    status: 503,
    code: "runner_unavailable",
    message: "Timed out waiting for Daytona sandbox readiness.",
  };
}

async function getDaytonaToolboxProxyUrl(params: {
  config: DaytonaConfig;
  sandboxId: string;
}): Promise<
  | { ok: true; toolboxProxyUrl: string }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const res = await daytonaApiRequest<DaytonaToolboxProxyUrlDto>({
    config: params.config,
    path: `/sandbox/${encodeURIComponent(params.sandboxId)}/toolbox-proxy-url`,
    method: "GET",
  });
  if (!res.ok) return res;
  const rawUrl = String(res.payload.url ?? "").trim();
  if (!rawUrl) {
    return {
      ok: false,
      status: 503,
      code: "runner_unavailable",
      message: "Daytona toolbox proxy URL is missing.",
    };
  }
  try {
    const parsed = new URL(rawUrl);
    return { ok: true, toolboxProxyUrl: parsed.toString().replace(/\/+$/, "") };
  } catch {
    return {
      ok: false,
      status: 503,
      code: "runner_unavailable",
      message: "Daytona toolbox proxy URL is invalid.",
    };
  }
}

function normalizeUrlPath(pathname: string): string {
  const cleaned = String(pathname ?? "").trim();
  if (!cleaned || cleaned === "/") return "/";
  return `/${cleaned.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function joinUrlPath(pathname: string, ...segments: string[]): string {
  const base = normalizeUrlPath(pathname).replace(/^\/+|\/+$/g, "");
  const normalizedSegments = segments
    .map((segment) => String(segment ?? "").trim().replace(/^\/+|\/+$/g, ""))
    .filter((segment) => segment.length > 0);
  const parts = [base, ...normalizedSegments].filter((part) => part.length > 0);
  return parts.length > 0 ? `/${parts.join("/")}` : "/";
}

function buildToolboxExecuteBaseCandidates(toolboxProxyUrl: string, sandboxId: string): string[] {
  const out: string[] = [];
  const pushUnique = (value: string) => {
    const normalized = value.replace(/\/+$/, "");
    if (!normalized) return;
    if (!out.includes(normalized)) out.push(normalized);
  };
  let parsed: URL;
  try {
    parsed = new URL(String(toolboxProxyUrl ?? "").trim());
  } catch {
    pushUnique(String(toolboxProxyUrl ?? "").trim());
    return out;
  }
  pushUnique(parsed.toString());
  const encodedSandboxId = encodeURIComponent(String(sandboxId ?? "").trim());
  if (!encodedSandboxId) return out;
  const normalizedPath = normalizeUrlPath(parsed.pathname);
  const toolboxIndex = normalizedPath.indexOf("/toolbox");
  const pathCandidates = new Set<string>();
  pathCandidates.add(joinUrlPath(normalizedPath, encodedSandboxId));
  if (toolboxIndex >= 0) {
    const pathPrefix = normalizedPath.slice(0, toolboxIndex);
    pathCandidates.add(joinUrlPath(pathPrefix, "toolbox"));
    pathCandidates.add(joinUrlPath(pathPrefix, "toolbox", encodedSandboxId));
    pathCandidates.add(joinUrlPath(pathPrefix, "toolbox", encodedSandboxId, "toolbox"));
  } else {
    pathCandidates.add(joinUrlPath(normalizedPath, "toolbox"));
    pathCandidates.add(joinUrlPath(normalizedPath, "toolbox", encodedSandboxId));
    pathCandidates.add(joinUrlPath(normalizedPath, "toolbox", encodedSandboxId, "toolbox"));
    pathCandidates.add(joinUrlPath("/", "toolbox", encodedSandboxId));
    pathCandidates.add(joinUrlPath("/", "toolbox", encodedSandboxId, "toolbox"));
  }
  for (const candidatePath of pathCandidates) {
    parsed.pathname = candidatePath;
    pushUnique(parsed.toString());
  }
  return out;
}

function shouldRetryWithAlternateToolboxBase(status: number, text: string): boolean {
  const body = String(text ?? "").toLowerCase();
  if (status === 401 && body.includes("failed to get auth url")) return true;
  if (body.includes("invalid host format")) return true;
  if (body.includes("sandbox id not found")) return true;
  if (status === 404 && body.includes("toolbox")) return true;
  return false;
}

function readLooseString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return "";
}

async function executeDaytonaCommand(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  command: string;
  cwd?: string;
  timeoutSeconds?: number;
  allowNonZero?: boolean;
}): Promise<
  | { ok: true; stdout: string; exitCode: number }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const timeout = typeof params.timeoutSeconds === "number" && Number.isFinite(params.timeoutSeconds)
    ? Math.max(1, Math.min(120, Math.floor(params.timeoutSeconds)))
    : null;
  const baseCandidates = buildToolboxExecuteBaseCandidates(params.toolboxProxyUrl, params.sandboxId);
  let lastFailure: { status: number; code: string; message: string; details?: Record<string, unknown> } | null = null;
  for (let index = 0; index < baseCandidates.length; index += 1) {
    const baseUrl = baseCandidates[index];
    const hasNext = index < baseCandidates.length - 1;
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/process/execute`, {
        method: "POST",
        headers: daytonaHeaders(params.config, true),
        body: JSON.stringify({
          command: params.command,
          ...(params.cwd ? { cwd: params.cwd } : null),
          ...(timeout !== null ? { timeout } : null),
        }),
      });
    } catch (error) {
      lastFailure = {
        status: 503,
        code: "runner_unavailable",
        message: error instanceof Error ? error.message : "Failed to call Daytona toolbox.",
      };
      continue;
    }

    const { text, json } = await parseDaytonaResponseBody(response);
    if (!response.ok) {
      const retryable = hasNext && shouldRetryWithAlternateToolboxBase(response.status, text);
      const failure = {
        status: 503,
        code: "runner_unavailable",
        message: `Daytona toolbox command failed (${response.status}).`,
        details: { response_text: text.slice(0, 2000), base_url: baseUrl },
      };
      if (retryable) {
        lastFailure = failure;
        continue;
      }
      return { ok: false, ...failure };
    }

    const parsed = (json ?? {}) as DaytonaProcessExecuteDto;
    const nestedResult = parsed.result && typeof parsed.result === "object" && !Array.isArray(parsed.result)
      ? (parsed.result as Record<string, unknown>)
      : null;
    const exitCodeCandidates = [parsed.exitCode, parsed.code, nestedResult?.exitCode, nestedResult?.code];
    let exitCode = 0;
    for (const candidate of exitCodeCandidates) {
      const parsedCode = Number(candidate);
      if (Number.isFinite(parsedCode)) {
        exitCode = parsedCode;
        break;
      }
    }
    const resultText = readLooseString(parsed.result);
    const nestedResultText = nestedResult
      ? readLooseString(nestedResult.result) ||
        readLooseString(nestedResult.output) ||
        readLooseString(nestedResult.message) ||
        readLooseString(nestedResult.error)
      : "";
    const stdoutText = readLooseString(parsed.stdout) || readLooseString(nestedResult?.stdout);
    const stderrText = readLooseString(parsed.stderr) || readLooseString(nestedResult?.stderr);
    const messageText = readLooseString(parsed.message);
    const errorText = readLooseString(parsed.error) || readLooseString(nestedResult?.error);
    const primaryOutput = resultText || stdoutText || nestedResultText || messageText || errorText || text;
    if (exitCode !== 0 && params.allowNonZero !== true) {
      return {
        ok: false,
        status: 502,
        code: "daytona_command_failed",
        message: `Daytona command failed with exit code ${exitCode}.`,
        details: {
          output_preview: primaryOutput.slice(0, 2000),
          stderr_preview: stderrText.slice(0, 1000),
        },
      };
    }
    return {
      ok: true,
      exitCode,
      stdout: primaryOutput || stderrText,
    };
  }
  if (lastFailure) return { ok: false, ...lastFailure };
  return {
    ok: false,
    status: 503,
    code: "runner_unavailable",
    message: "Daytona toolbox command failed with no usable execution endpoint.",
  };
}

async function executeDaytonaProbeToolCall(params: {
  config: DaytonaConfig;
  userId: string;
  projectId: string;
  runId: string;
  projectVolumeId?: string | null;
}): Promise<DaytonaProbeExecution> {
  const created = await createDaytonaSandbox({
    config: params.config,
    userId: params.userId,
    projectId: params.projectId,
    runId: params.runId,
    projectVolumeId: params.projectVolumeId ?? null,
  });
  if (!created.ok) return created;
  const providerSandboxId = String(created.sandbox.id ?? "").trim();
  if (!providerSandboxId) {
    return {
      ok: false,
      status: 503,
      code: "runner_unavailable",
      message: "Daytona sandbox ID is missing from create response.",
    };
  }
  const ready = await waitForDaytonaSandboxReady({
    config: params.config,
    sandboxId: providerSandboxId,
  });
  if (!ready.ok) return ready;
  const toolbox = await getDaytonaToolboxProxyUrl({
    config: params.config,
    sandboxId: providerSandboxId,
  });
  if (!toolbox.ok) return toolbox;

  const ensureWorkspace = await executeDaytonaCommand({
    config: params.config,
    toolboxProxyUrl: toolbox.toolboxProxyUrl,
    sandboxId: providerSandboxId,
    command: `mkdir -p ${DAYTONA_WORKSPACE_ROOT}`,
    timeoutSeconds: 15,
  });
  if (!ensureWorkspace.ok) return ensureWorkspace;

  const probe = await executeDaytonaCommand({
    config: params.config,
    toolboxProxyUrl: toolbox.toolboxProxyUrl,
    sandboxId: providerSandboxId,
    command: "pwd",
    cwd: DAYTONA_WORKSPACE_ROOT,
    timeoutSeconds: 15,
    allowNonZero: true,
  });
  if (!probe.ok) return probe;

  return {
    ok: true,
    providerSandboxId,
    toolboxProxyUrl: toolbox.toolboxProxyUrl,
    region: String(ready.sandbox.target ?? "").trim() || null,
    exitCode: probe.exitCode,
    outputText: String(probe.stdout ?? "").trim(),
  };
}

function normalizeDaytonaToolName(value: unknown): DaytonaToolName | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "read" ||
    normalized === "list_dir" ||
    normalized === "glob" ||
    normalized === "grep" ||
    normalized === "sha256" ||
    normalized === "community_search" ||
    normalized === "community_write" ||
    normalized === "write" ||
    normalized === "edit" ||
    normalized === "bash"
  ) {
    return normalized;
  }
  return null;
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const firstNewline = trimmed.indexOf("\n");
  if (firstNewline <= 0) return trimmed;
  const closingFence = trimmed.lastIndexOf("```");
  if (closingFence <= firstNewline) return trimmed;
  return trimmed.slice(firstNewline + 1, closingFence).trim();
}

function parseDaytonaAgentDecision(rawText: string): DaytonaAgentDecision | null {
  const stripped = stripCodeFence(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const type = String(record.type ?? "").trim().toLowerCase();
  if (type === "assistant") {
    const text = String(record.text ?? "").trim();
    if (!text) return null;
    return { type: "assistant", text };
  }
  if (type === "tool_call") {
    const toolName = normalizeDaytonaToolName(record.tool_name);
    if (!toolName) return null;
    const args = record.args && typeof record.args === "object" && !Array.isArray(record.args)
      ? (record.args as Record<string, unknown>)
      : {};
    const reason = String(record.reason ?? "").trim() || null;
    return {
      type: "tool_call",
      tool_name: toolName,
      args,
      reason,
    };
  }
  return null;
}

function buildDaytonaAgentSystemPrompt(params: {
  projectId: string;
  sandboxId: string;
  maxIterations: number;
  communityId?: string | null;
}): string {
  const communityToolList = params.communityId ? "|community_search|community_write" : "";
  const workspacePrompt = [
    "WORKSPACE_MODE",
    "You are the Arx cloud coding agent running inside a Daytona sandbox.",
    "Return only strict JSON (no prose, no markdown).",
    "Allowed JSON outputs:",
    '1) {"type":"assistant","text":"..."}',
    `2) {"type":"tool_call","tool_name":"read|list_dir|glob|grep|sha256${communityToolList}|edit|write|bash","args":{...},"reason":"..."}`,
    "Rules:",
    "- At most one tool_call per response.",
    "- Prefer read/list_dir/glob/grep/sha256 to inspect before taking action.",
      ...(params.communityId
        ? [
          "- Use community_search to ground community-specific questions in compiled community context.",
          "- Use community_write only to publish a grounded community insight into the live AI feed.",
          '- community_write args should use: {"post_type":"observation|recommendation|action","title":"optional","body":"required","why_now":"optional","evidence":["1-4 grounding bullets"],"publish_confidence":0-6,"novelty_key":"optional"}.',
        ]
      : []),
    "- Prefer edit/write for file creation and modification.",
    "- Use bash only when direct file tools are not appropriate, such as builds, tests, or shell-only inspection.",
    "- Never use bash to create or edit files if read/edit/write can do the job directly.",
    "- Never claim sandbox tools are unavailable in this lane.",
    "- Keep paths relative to workspace root ('.' for root).",
    "- If a tool result indicates denial/error, adapt and continue.",
    "- edit/write/bash are available for this run, but bash is the last resort.",
    `- Max ${params.maxIterations} tool iterations.`,
    `Context: project_id=${params.projectId}, sandbox_id=${params.sandboxId}`,
  ].join("\n");
  return joinPromptBlocks([
    buildFoundationContextPrompt({
      communityId: params.communityId,
      workspaceMode: "coding",
    }),
    workspacePrompt,
  ]);
}

function resolveDaytonaToolPolicy(toolName: DaytonaToolName): DaytonaToolPolicyDecision {
  if (
    toolName === "read" ||
    toolName === "list_dir" ||
    toolName === "glob" ||
    toolName === "grep" ||
    toolName === "sha256" ||
    toolName === "community_search"
  ) {
    return {
      allowed: true,
      requiresApproval: false,
      policyBasis: "runtime_daytona_policy_v1:read_allow",
      denialCode: null,
      denialMessage: null,
    };
  }
  return {
    allowed: true,
    requiresApproval: false,
    policyBasis: "runtime_daytona_policy_v1:agent_full_allow",
    denialCode: null,
    denialMessage: null,
  };
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  return Array.from(view).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function makeToolCallKey(params: {
  toolName: DaytonaToolName;
  args: Record<string, unknown>;
  projectId: string;
}): Promise<string> {
  const canonicalEntries = Object.entries(params.args).sort(([left], [right]) => left.localeCompare(right));
  const canonicalArgs = JSON.stringify(Object.fromEntries(canonicalEntries));
  return await sha256Hex(`${params.projectId}:${params.toolName}:${canonicalArgs}`);
}

function normalizeRelativeWorkspacePath(raw: unknown): string {
  const candidate = String(raw ?? "").trim().replaceAll("\\", "/");
  if (!candidate) throw new Error("tool_path_required");
  if (candidate.startsWith("/")) throw new Error("path_outside_workspace");
  const parts = candidate.split("/").filter((part) => part.length > 0 && part !== ".");
  if (parts.some((part) => part === "..")) throw new Error("path_outside_workspace");
  const segments = parts[0]?.toLowerCase() === "workspace" ? parts.slice(1) : parts;
  if (segments.length === 0) return ".";
  return segments.join("/");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function normalizeOptionalWorkspaceDir(raw: unknown): string {
  const candidate = String(raw ?? "").trim();
  if (!candidate || candidate === ".") return ".";
  return normalizeRelativeWorkspacePath(candidate);
}

function listInstructionDirectoriesForRelevantFiles(relevantFiles: string[] | null | undefined): string[] {
  const directories = new Set<string>(["."]);
  for (const raw of relevantFiles ?? []) {
    const candidate = String(raw ?? "").trim();
    if (!candidate) continue;
    let normalized = ".";
    try {
      normalized = normalizeRelativeWorkspacePath(candidate);
    } catch {
      continue;
    }
    if (normalized === ".") continue;
    const parts = normalized.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    const treatAsFile = last.includes(".");
    const limit = treatAsFile ? parts.length - 1 : parts.length;
    for (let index = 1; index <= limit; index += 1) {
      const nextDir = parts.slice(0, index).join("/");
      if (nextDir) directories.add(nextDir);
    }
  }
  return Array.from(directories);
}

function buildCodingInstructionCandidatePaths(relevantFiles: string[] | null | undefined): string[] {
  const candidates: string[] = [];
  for (const directory of listInstructionDirectoriesForRelevantFiles(relevantFiles)) {
    for (const filename of CODING_INSTRUCTION_FILENAMES) {
      candidates.push(directory === "." ? filename : `${directory}/${filename}`);
    }
  }
  return candidates;
}

type CodingInstructionDoc = {
  path: string;
  content: string;
  truncated: boolean;
};

async function loadCodingInstructionDocs(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  relevantFiles?: string[] | null;
}): Promise<CodingInstructionDoc[]> {
  const docs: CodingInstructionDoc[] = [];
  for (const candidatePath of buildCodingInstructionCandidatePaths(params.relevantFiles)) {
    if (docs.length >= MAX_CODING_INSTRUCTION_DOCS) break;
    const result = await executeDaytonaCommand({
      config: params.config,
      toolboxProxyUrl: params.toolboxProxyUrl,
      sandboxId: params.sandboxId,
      cwd: DAYTONA_WORKSPACE_ROOT,
      command: `if [ -f ${shellQuote(candidatePath)} ]; then head -c ${MAX_CODING_INSTRUCTION_BYTES} -- ${shellQuote(candidatePath)}; fi`,
    });
    if (!result.ok) continue;
    const content = String(result.stdout ?? "").trim();
    if (!content) continue;
    docs.push({
      path: candidatePath,
      content,
      truncated: content.length >= MAX_CODING_INSTRUCTION_BYTES,
    });
  }
  return docs;
}

function buildCodingInstructionPrompt(docs: CodingInstructionDoc[]): string | null {
  if (!docs.length) return null;
  return [
    "PROJECT_INSTRUCTIONS",
    "These local project instruction files apply to the current coding context.",
    "Prefer more specific instructions over broader ones if they conflict.",
    ...docs.flatMap((doc) => [
      `[path=${doc.path}${doc.truncated ? "; truncated=true" : ""}]`,
      doc.content,
    ]),
  ].join("\n\n");
}

type NormalizedExpectedBeforeSha = {
  provided: boolean;
  value: string | null;
};

function normalizeExpectedBeforeSha(args: Record<string, unknown>): NormalizedExpectedBeforeSha {
  let raw: unknown = undefined;
  if (Object.prototype.hasOwnProperty.call(args, "expected_before_sha256")) {
    raw = args.expected_before_sha256;
  } else if (Object.prototype.hasOwnProperty.call(args, "expectedBeforeSha256")) {
    raw = args.expectedBeforeSha256;
  }
  if (raw === undefined) return { provided: false, value: null };
  if (raw === null) return { provided: true, value: null };
  const normalized = String(raw).trim().toLowerCase();
  if (!normalized) return { provided: true, value: null };
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new Error("invalid_expected_before_sha256");
  return { provided: true, value: normalized };
}

async function readWorkspaceFileSha256(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  relPath: string;
}): Promise<
  | { ok: true; sha: string | null }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const markerMissing = "__ARX_FILE_MISSING__";
  const markerNotFile = "__ARX_NOT_A_FILE__";
  const cmd =
    `FILE=${shellQuote(params.relPath)}; ` +
    `if [ ! -e "$FILE" ]; then echo ${shellQuote(markerMissing)}; exit 0; fi; ` +
    `if [ ! -f "$FILE" ]; then echo ${shellQuote(markerNotFile)}; exit 3; fi; ` +
    `shasum -a 256 "$FILE" | awk '{print $1}'`;
  const result = await executeDaytonaCommand({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    command: cmd,
    cwd: DAYTONA_WORKSPACE_ROOT,
    timeoutSeconds: 15,
    allowNonZero: true,
  });
  if (!result.ok) return result;
  const output = result.stdout.trim();
  if (result.exitCode === 3 || output === markerNotFile) {
    return {
      ok: false,
      status: 400,
      code: "invalid_tool_args",
      message: `Path '${params.relPath}' is not a file.`,
    };
  }
  if (output === markerMissing) return { ok: true, sha: null };
  if (!output) return { ok: true, sha: null };
  if (!/^[0-9a-f]{64}$/i.test(output)) {
    return {
      ok: false,
      status: 502,
      code: "tool_execution_failed",
      message: "Unexpected sha256 output.",
    };
  }
  return { ok: true, sha: output.toLowerCase() };
}

async function readWorkspaceFileContent(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  relPath: string;
}): Promise<
  | { ok: true; content: string }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const markerMissing = "__ARX_FILE_MISSING__";
  const cmd =
    `FILE=${shellQuote(params.relPath)}; ` +
    `if [ ! -f "$FILE" ]; then echo ${shellQuote(markerMissing)}; exit 2; fi; ` +
    `cat "$FILE"`;
  const result = await executeDaytonaCommand({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    command: cmd,
    cwd: DAYTONA_WORKSPACE_ROOT,
    timeoutSeconds: 20,
    allowNonZero: true,
  });
  if (!result.ok) return result;
  if (result.exitCode === 2 || result.stdout.trim() === markerMissing) {
    return {
      ok: false,
      status: 404,
      code: "file_not_found",
      message: `File not found: ${params.relPath}`,
    };
  }
  if (result.exitCode !== 0) {
    return {
      ok: false,
      status: 502,
      code: "tool_execution_failed",
      message: `Failed to read file '${params.relPath}' (exit ${result.exitCode}).`,
    };
  }
  return { ok: true, content: result.stdout };
}

function makeHereDocTag(content: string): string {
  let tag = `ARX_${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`;
  while (content.includes(tag)) {
    tag = `${tag}_X`;
  }
  return tag;
}

async function writeWorkspaceFile(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  relPath: string;
  content: string;
  expectedBeforeSha: NormalizedExpectedBeforeSha;
}): Promise<DaytonaToolExecutionResult> {
  const currentShaRes = await readWorkspaceFileSha256({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    relPath: params.relPath,
  });
  if (!currentShaRes.ok) {
    return {
      status: "error",
      exitCode: null,
      outputText: "",
      errorCode: currentShaRes.code,
      errorMessage: currentShaRes.message,
    };
  }
  const currentSha = currentShaRes.sha;

  if (params.expectedBeforeSha.provided) {
    if (params.expectedBeforeSha.value === null) {
      if (currentSha !== null) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "expected_before_mismatch",
          errorMessage: "Expected file to not exist before write.",
        };
      }
    } else if (currentSha !== params.expectedBeforeSha.value) {
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "expected_before_mismatch",
        errorMessage: "expected_before_sha256 mismatch.",
      };
    }
  }

  const hereDocTag = makeHereDocTag(params.content);
  const cmd = [
    `FILE=${shellQuote(params.relPath)}`,
    'mkdir -p "$(dirname "$FILE")"',
    `cat <<'${hereDocTag}' > "$FILE"`,
    params.content,
    hereDocTag,
    `shasum -a 256 "$FILE" | awk '{print $1}'`,
  ].join("\n");
  const writeResult = await executeDaytonaCommand({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    command: cmd,
    cwd: DAYTONA_WORKSPACE_ROOT,
    timeoutSeconds: 45,
    allowNonZero: true,
  });
  if (!writeResult.ok) {
    return {
      status: "error",
      exitCode: null,
      outputText: "",
      errorCode: writeResult.code,
      errorMessage: writeResult.message,
    };
  }
  const nextSha = writeResult.stdout.trim();
  return {
    status: writeResult.exitCode === 0 ? "ok" : "error",
    exitCode: writeResult.exitCode,
    outputText: writeResult.exitCode === 0
      ? [`wrote:${params.relPath}`, `sha256:${nextSha}`].join("\n")
      : writeResult.stdout.trim(),
    errorCode: writeResult.exitCode === 0 ? null : "tool_execution_failed",
    errorMessage: writeResult.exitCode === 0 ? null : `write failed with exit code ${writeResult.exitCode}`,
  };
}

async function executeDaytonaTool(params: {
  ctx: any;
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  toolName: DaytonaToolName;
  args: Record<string, unknown>;
  userId: string;
  communityId?: string | null;
}): Promise<DaytonaToolExecutionResult> {
  try {
    if (params.toolName === "read") {
      const relPath = normalizeRelativeWorkspacePath(params.args.path);
      const offsetRaw = Number(params.args.offset ?? 0);
      const limitRaw = Number(params.args.limit ?? 200);
      const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(400, Math.floor(limitRaw))) : 200;
      const start = offset + 1;
      const end = offset + limit;
      const cmd =
        `FILE=${shellQuote(relPath)}; ` +
        `if [ ! -f "$FILE" ]; then echo "file_not_found:$FILE"; exit 2; fi; ` +
        `nl -ba "$FILE" | sed -n '${start},${end}p'`;
      const result = await executeDaytonaCommand({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        command: cmd,
        cwd: DAYTONA_WORKSPACE_ROOT,
        timeoutSeconds: 25,
        allowNonZero: true,
      });
      if (!result.ok) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: result.code,
          errorMessage: result.message,
        };
      }
      return {
        status: result.exitCode === 0 ? "ok" : "error",
        exitCode: result.exitCode,
        outputText: result.stdout.trim(),
        errorCode: result.exitCode === 0 ? null : "tool_execution_failed",
        errorMessage: result.exitCode === 0 ? null : `read failed with exit code ${result.exitCode}`,
      };
    }
    if (params.toolName === "list_dir") {
      const rawPath = String(params.args.path ?? "").trim();
      const relPath = !rawPath || rawPath === "." ? "." : normalizeRelativeWorkspacePath(rawPath);
      const cmd = relPath === "." ? "ls -la" : `ls -la ${shellQuote(relPath)}`;
      const result = await executeDaytonaCommand({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        command: cmd,
        cwd: DAYTONA_WORKSPACE_ROOT,
        timeoutSeconds: 25,
        allowNonZero: true,
      });
      if (!result.ok) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: result.code,
          errorMessage: result.message,
        };
      }
      return {
        status: result.exitCode === 0 ? "ok" : "error",
        exitCode: result.exitCode,
        outputText: result.stdout.trim(),
        errorCode: result.exitCode === 0 ? null : "tool_execution_failed",
        errorMessage: result.exitCode === 0 ? null : `list_dir failed with exit code ${result.exitCode}`,
      };
    }
    if (params.toolName === "glob") {
      const rawPath = String(params.args.path ?? "").trim();
      const relPath = !rawPath || rawPath === "." ? "." : normalizeRelativeWorkspacePath(rawPath);
      const pattern = String(params.args.pat ?? params.args.pattern ?? "").trim();
      if (!pattern) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "invalid_tool_args",
          errorMessage: "glob requires pat/pattern.",
        };
      }
      const cmd = relPath === "."
        ? `find . -path ${shellQuote(pattern)} | sed 's#^\\./##'`
        : `cd ${shellQuote(relPath)} && find . -path ${shellQuote(pattern)} | sed 's#^\\./##'`;
      const result = await executeDaytonaCommand({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        command: cmd,
        cwd: DAYTONA_WORKSPACE_ROOT,
        timeoutSeconds: 25,
        allowNonZero: true,
      });
      if (!result.ok) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: result.code,
          errorMessage: result.message,
        };
      }
      return {
        status: result.exitCode === 0 ? "ok" : "error",
        exitCode: result.exitCode,
        outputText: result.stdout.trim(),
        errorCode: result.exitCode === 0 ? null : "tool_execution_failed",
        errorMessage: result.exitCode === 0 ? null : `glob failed with exit code ${result.exitCode}`,
      };
    }
    if (params.toolName === "grep") {
      const rawPath = String(params.args.path ?? "").trim();
      const relPath = !rawPath || rawPath === "." ? "." : normalizeRelativeWorkspacePath(rawPath);
      const pattern = String(params.args.pat ?? params.args.pattern ?? "").trim();
      if (!pattern) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "invalid_tool_args",
          errorMessage: "grep requires pat/pattern.",
        };
      }
      const include = String(params.args.include ?? "").trim();
      const cmd = `rg -n --no-heading --color=never ${
        include ? `-g ${shellQuote(include)} ` : ""
      }-- ${shellQuote(pattern)} ${shellQuote(relPath)}`;
      const result = await executeDaytonaCommand({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        command: cmd,
        cwd: DAYTONA_WORKSPACE_ROOT,
        timeoutSeconds: 30,
        allowNonZero: true,
      });
      if (!result.ok) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: result.code,
          errorMessage: result.message,
        };
      }
      return {
        status: result.exitCode === 0 ? "ok" : "error",
        exitCode: result.exitCode,
        outputText: result.stdout.trim(),
        errorCode: result.exitCode === 0 ? null : "tool_execution_failed",
        errorMessage: result.exitCode === 0 ? null : `grep failed with exit code ${result.exitCode}`,
      };
    }
    if (params.toolName === "sha256") {
      const relPath = normalizeRelativeWorkspacePath(params.args.path);
      const cmd = `shasum -a 256 ${shellQuote(relPath)} | awk '{print $1}'`;
      const result = await executeDaytonaCommand({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        command: cmd,
        cwd: DAYTONA_WORKSPACE_ROOT,
        timeoutSeconds: 20,
        allowNonZero: true,
      });
      if (!result.ok) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: result.code,
          errorMessage: result.message,
        };
      }
      return {
        status: result.exitCode === 0 ? "ok" : "error",
        exitCode: result.exitCode,
        outputText: result.stdout.trim(),
        errorCode: result.exitCode === 0 ? null : "tool_execution_failed",
        errorMessage: result.exitCode === 0 ? null : `sha256 failed with exit code ${result.exitCode}`,
      };
    }
    if (params.toolName === "write") {
      const relPath = normalizeRelativeWorkspacePath(params.args.path);
      const content = String(params.args.content ?? "");
      return await writeWorkspaceFile({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        relPath,
        content,
        expectedBeforeSha: normalizeExpectedBeforeSha(params.args),
      });
    }
    if (params.toolName === "edit") {
      const relPath = normalizeRelativeWorkspacePath(params.args.path);
      const oldText = String(params.args.old ?? "");
      if (!oldText) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "invalid_tool_args",
          errorMessage: "edit requires non-empty 'old'.",
        };
      }
      const newText = String(params.args.new ?? "");
      const replaceAll = params.args.all === true;
      const fileBeforeRes = await readWorkspaceFileContent({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        relPath,
      });
      if (!fileBeforeRes.ok) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: fileBeforeRes.code,
          errorMessage: fileBeforeRes.message,
        };
      }
      const currentShaRes = await readWorkspaceFileSha256({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        relPath,
      });
      if (!currentShaRes.ok) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: currentShaRes.code,
          errorMessage: currentShaRes.message,
        };
      }
      const currentSha = currentShaRes.sha;
      if (!currentSha) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "file_not_found",
          errorMessage: `File not found: ${relPath}`,
        };
      }
      const expected = normalizeExpectedBeforeSha(params.args);
      if (expected.provided && expected.value !== null && expected.value !== currentSha) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "expected_before_mismatch",
          errorMessage: "expected_before_sha256 mismatch.",
        };
      }
      const fileBefore = fileBeforeRes.content;
      const replacementCount = replaceAll
        ? fileBefore.split(oldText).length - 1
        : fileBefore.includes(oldText)
          ? 1
          : 0;
      if (replacementCount < 1) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "edit_target_not_found",
          errorMessage: "Could not find requested text to edit.",
        };
      }
      const fileAfter = replaceAll ? fileBefore.split(oldText).join(newText) : fileBefore.replace(oldText, newText);
      const writeResult = await writeWorkspaceFile({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        relPath,
        content: fileAfter,
        expectedBeforeSha: expected.provided ? expected : { provided: true, value: currentSha },
      });
      if (writeResult.status !== "ok") return writeResult;
      return {
        status: "ok",
        exitCode: 0,
        outputText: [`edited:${relPath}`, `replacements:${replacementCount}`, writeResult.outputText]
          .filter((line) => line.length > 0)
          .join("\n"),
        errorCode: null,
        errorMessage: null,
      };
    }
    if (params.toolName === "community_search") {
      const communityId = String(params.communityId ?? "").trim();
      if (!communityId) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "community_context_required",
          errorMessage: "community_search requires an active community context.",
        };
      }
      const query = String(params.args.query ?? "").trim();
      if (!query) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "invalid_tool_args",
          errorMessage: "community_search requires query.",
        };
      }
      const limitRaw = Number(params.args.limit ?? 8);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(12, Math.floor(limitRaw))) : 8;
      const payload = await params.ctx.runQuery(api.community.readCompiledCommunityContext as any, {
        userId: params.userId,
        communityId,
        query,
        limit,
      });
      return {
        status: "ok",
        exitCode: 0,
        outputText: JSON.stringify(payload ?? { ok: false }),
        errorCode: null,
        errorMessage: null,
      };
    }
    if (params.toolName === "community_write") {
      const communityId = String(params.communityId ?? "").trim();
      if (!communityId) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "community_context_required",
          errorMessage: "community_write requires an active community context.",
        };
      }
      const body = String(params.args.body ?? "").trim();
      if (!body) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "invalid_tool_args",
          errorMessage: "community_write requires body.",
        };
      }
      const postTypeRaw = String(params.args.post_type ?? "").trim().toLowerCase();
      const postType =
        postTypeRaw === "recommendation" || postTypeRaw === "action" ? postTypeRaw : "observation";
      const title = String(params.args.title ?? "").trim() || null;
      const whyNow = String(params.args.why_now ?? "").trim() || null;
      const evidence = Array.isArray(params.args.evidence)
        ? params.args.evidence
            .map((entry) => String(entry ?? "").trim())
            .filter((entry): entry is string => entry.length > 0)
            .slice(0, 4)
        : [];
      const authorLabel = String(params.args.author_label ?? "").trim() || null;
      const noveltyKey = String(params.args.novelty_key ?? "").trim() || null;
      const publishConfidenceRaw = Number(params.args.publish_confidence);
      const publishConfidence = Number.isFinite(publishConfidenceRaw)
        ? Math.max(0, Math.min(6, Math.round(publishConfidenceRaw)))
        : undefined;
      if (evidence.length === 0) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "invalid_tool_args",
          errorMessage: "community_write requires evidence.",
        };
      }
      const payload = await params.ctx.runMutation(api.community.publishCommunityAiFeedAgentPost as any, {
        userId: params.userId,
        communityId,
        agentKey: "community_write",
        authorLabel,
        postType,
        title,
        body,
        whyNow,
        evidence,
        publishConfidence,
        noveltyKey,
      });
      return {
        status: "ok",
        exitCode: 0,
        outputText: JSON.stringify(payload ?? { ok: false }),
        errorCode: null,
        errorMessage: null,
      };
    }
    if (params.toolName === "bash") {
      const command = String(params.args.cmd ?? params.args.command ?? "").trim();
      if (!command) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "invalid_tool_args",
          errorMessage: "bash requires cmd.",
        };
      }
      const timeoutRaw = Number(params.args.timeout_seconds ?? params.args.timeout ?? 45);
      const timeoutSeconds = Number.isFinite(timeoutRaw) ? Math.max(1, Math.min(120, Math.floor(timeoutRaw))) : 45;
      const cwd = normalizeOptionalWorkspaceDir(params.args.cwd);
      const result = await executeDaytonaCommand({
        config: params.config,
        toolboxProxyUrl: params.toolboxProxyUrl,
        sandboxId: params.sandboxId,
        command,
        cwd,
        timeoutSeconds,
        allowNonZero: true,
      });
      if (!result.ok) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: result.code,
          errorMessage: result.message,
        };
      }
      return {
        status: result.exitCode === 0 ? "ok" : "error",
        exitCode: result.exitCode,
        outputText: result.stdout.trim(),
        errorCode: result.exitCode === 0 ? null : "tool_execution_failed",
        errorMessage: result.exitCode === 0 ? null : `bash failed with exit code ${result.exitCode}`,
      };
    }
    return {
      status: "error",
      exitCode: null,
      outputText: "",
      errorCode: "tool_not_enabled_for_cloud_daytona_v1",
      errorMessage: "Tool is not enabled for cloud Daytona.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = message === "path_outside_workspace" ? "path_outside_workspace" : "tool_execution_failed";
    return {
      status: "error",
      exitCode: null,
      outputText: "",
      errorCode: code,
      errorMessage: message || "Tool execution failed.",
    };
  }
}

async function executeDaytonaAgentLoop(params: {
  ctx: any;
  req: Request;
  userId: string;
  requestedModelId: string;
  inferenceSource: "platform" | "chatgpt" | "user_key";
  modelRef: string;
  messages: InferenceMessage[];
  maxTokens: number;
  runId: string;
  projectId: string;
  daytonaConfig: DaytonaConfig;
  providerSandboxId: string;
  toolboxProxyUrl: string;
  initialProbeOutput: string | null;
  codingContinuationPrompt?: string | null;
  codingRelevantFiles?: string[] | null;
  communityId?: string | null;
  appendRunEvent: (params: {
    eventType: string;
    eventKey?: string;
    payload: Record<string, unknown>;
  }) => Promise<void>;
}): Promise<DaytonaAgentLoopSuccess | DaytonaAgentLoopFailure> {
  const maxIterations = 8;
  const codingInstructionPrompt = buildCodingInstructionPrompt(
    await loadCodingInstructionDocs({
      config: params.daytonaConfig,
      toolboxProxyUrl: params.toolboxProxyUrl,
      sandboxId: params.providerSandboxId,
      relevantFiles: params.codingRelevantFiles,
    }),
  );
  const transcript: InferenceMessage[] = [
    {
      role: "system",
      content: buildDaytonaAgentSystemPrompt({
        projectId: params.projectId,
        sandboxId: params.providerSandboxId,
        maxIterations,
        communityId: params.communityId,
      }),
    },
    ...(params.codingContinuationPrompt
      ? [
          {
            role: "system" as const,
            content: params.codingContinuationPrompt,
          },
        ]
      : []),
    ...(codingInstructionPrompt
      ? [
          {
            role: "system" as const,
            content: codingInstructionPrompt,
          },
        ]
      : []),
    ...params.messages,
  ];
  if (params.initialProbeOutput) {
    transcript.push({
      role: "system",
      content: [
        "DAYTONA_TOOL_RESULT",
        "tool_name=bash",
        "status=ok",
        "cwd=workspace",
        "output:",
        params.initialProbeOutput,
      ].join("\n"),
    });
  }

  let invalidJsonRetries = 0;
  const maxInvalidJsonRetries = 1;
  let lastPromptTokens: number | null = null;
  let lastCompletionTokens: number | null = null;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const completion =
      params.inferenceSource === "chatgpt"
        ? await runChatgptCompletion({
            ctx: params.ctx,
            userId: params.userId,
            modelId: params.requestedModelId,
            messages: transcript,
            maxTokens: params.maxTokens,
          })
        : await runOpenRouterCompletion({
            req: params.req,
            modelRef: params.modelRef,
            messages: transcript,
            maxTokens: params.maxTokens,
          });
    if ("ok" in completion && completion.ok === false) {
      return completion;
    }
    lastPromptTokens = completion.promptTokens;
    lastCompletionTokens = completion.completionTokens;
    const rawAssistantText = completion.content.trim();
    if (!rawAssistantText) {
      return {
        ok: false,
        status: 502,
        code: "empty_response",
        message: "Daytona lane model returned an empty response.",
      };
    }

    const decision = parseDaytonaAgentDecision(rawAssistantText);
    if (!decision) {
      if (invalidJsonRetries < maxInvalidJsonRetries) {
        invalidJsonRetries += 1;
        await params.appendRunEvent({
          eventType: "model_output_invalid_json",
          eventKey: `${params.runId}:model_output_invalid_json:${iteration}:${invalidJsonRetries}`,
          payload: {
            run_id: params.runId,
            iteration,
            attempt: invalidJsonRetries,
            output_preview: rawAssistantText.slice(0, 2000),
          },
        });
        transcript.push({
          role: "assistant",
          content: rawAssistantText,
        });
        transcript.push({
          role: "system",
          content: [
            "INVALID_FORMAT",
            "Your previous response was not strict JSON.",
            "Reply again using exactly one JSON object and no prose/markdown.",
            'Allowed schemas: {"type":"assistant","text":"..."} or {"type":"tool_call","tool_name":"...","args":{...}}',
          ].join("\n"),
        });
        continue;
      }
      return {
        ok: true,
        assistantText: rawAssistantText,
        promptTokens: lastPromptTokens,
        completionTokens: lastCompletionTokens,
      };
    }
    invalidJsonRetries = 0;

    if (decision.type === "assistant") {
      return {
        ok: true,
        assistantText: decision.text,
        promptTokens: lastPromptTokens,
        completionTokens: lastCompletionTokens,
      };
    }

    const toolCallId = `runtime_tools:${params.runId}:${iteration}`;
    const normalizedArgs = decision.args ?? {};
    const toolCallKey = await makeToolCallKey({
      toolName: decision.tool_name,
      args: normalizedArgs,
      projectId: params.projectId,
    });
    const policy = resolveDaytonaToolPolicy(decision.tool_name);

    await params.appendRunEvent({
      eventType: "tool_call_requested",
      eventKey: `${params.runId}:tool_call_requested:${iteration}`,
      payload: {
        run_id: params.runId,
        tool_call_id: toolCallId,
        tool_call_key: toolCallKey,
        tool_name: decision.tool_name,
        args: normalizedArgs,
        requires_approval: policy.requiresApproval,
        policy_basis: policy.policyBasis,
        reason: decision.reason ?? null,
        iteration,
      },
    });

    if (!policy.allowed) {
      await params.appendRunEvent({
        eventType: "tool_call_denied",
        eventKey: `${params.runId}:tool_call_denied:${iteration}`,
        payload: {
          run_id: params.runId,
          tool_call_id: toolCallId,
          approved: false,
          approved_by: "policy",
          code: policy.denialCode,
          message: policy.denialMessage,
          iteration,
        },
      });
      transcript.push({
        role: "assistant",
        content: rawAssistantText,
      });
      transcript.push({
        role: "system",
        content: [
          "TOOL_RESULT",
          `tool_name=${decision.tool_name}`,
          "status=denied",
          `code=${policy.denialCode ?? "tool_denied"}`,
          `message=${policy.denialMessage ?? "Tool call denied by cloud policy."}`,
        ].join("\n"),
      });
      continue;
    }

    await params.appendRunEvent({
      eventType: "tool_call_approved",
      eventKey: `${params.runId}:tool_call_approved:${iteration}`,
      payload: {
        run_id: params.runId,
        tool_call_id: toolCallId,
        approved: true,
        approved_by: "policy",
        note: "Auto-approved by cloud tool policy.",
        iteration,
      },
    });

    await params.appendRunEvent({
      eventType: "tool_call_started",
      eventKey: `${params.runId}:tool_call_started:${iteration}`,
      payload: {
        run_id: params.runId,
        tool_call_id: toolCallId,
        attempt: 1,
        cwd: DAYTONA_WORKSPACE_ROOT,
        workspace_scope_id: params.projectId,
        sandbox: {
          mode: "daytona",
          provider_sandbox_id: params.providerSandboxId,
        },
      },
    });

    const toolResult = await executeDaytonaTool({
      ctx: params.ctx,
      config: params.daytonaConfig,
      toolboxProxyUrl: params.toolboxProxyUrl,
      sandboxId: params.providerSandboxId,
      toolName: decision.tool_name,
      args: normalizedArgs,
      userId: params.userId,
      communityId: params.communityId ?? null,
    });

    await params.appendRunEvent({
      eventType: "tool_call_finished",
      eventKey: `${params.runId}:tool_call_finished:${iteration}`,
      payload: {
        run_id: params.runId,
        tool_call_id: toolCallId,
        attempt: 1,
        status: toolResult.status,
        exit_code: toolResult.exitCode,
        error_code: toolResult.errorCode,
        error_message: toolResult.errorMessage,
        output_preview: toolResult.outputText.slice(0, 2000),
      },
    });

    transcript.push({
      role: "assistant",
      content: rawAssistantText,
    });
    transcript.push({
      role: "system",
      content: [
        "TOOL_RESULT",
        `tool_name=${decision.tool_name}`,
        `status=${toolResult.status}`,
        `exit_code=${toolResult.exitCode ?? ""}`,
        toolResult.errorCode ? `error_code=${toolResult.errorCode}` : "",
        toolResult.errorMessage ? `error_message=${toolResult.errorMessage}` : "",
        "output:",
        toolResult.outputText || "(empty)",
      ]
        .filter((line) => line.length > 0)
        .join("\n"),
    });
  }

  return {
    ok: false,
    status: 502,
    code: "run_loop_limit_exceeded",
    message: `Daytona run exceeded max tool iterations (${maxIterations}).`,
  };
}

export type { DaytonaConfig };
export {
  executeDaytonaAgentLoop,
  executeDaytonaProbeToolCall,
  loadDaytonaConfig,
};
