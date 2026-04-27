import { internal } from "./_generated/api";
import {
  DAYTONA_WORKSPACE_ROOT,
  getDaytonaSignedPreviewUrl,
  type DaytonaConfig,
} from "./daytonaSandboxClient";
import { downloadDaytonaToolboxFileText } from "./daytonaToolboxFileSystem";
import { executeDaytonaCommand } from "./daytonaToolboxExecutor";
import {
  createDaytonaProcessSession,
  deleteDaytonaProcessSession,
  executeDaytonaProcessSessionCommand,
  sendDaytonaProcessSessionCommandInput,
} from "./daytonaProcessSessions";
import { mintPreviewProxySessionToken } from "./previewProxySessionToken";

export type WorkspaceTerminalStatus =
  | "starting"
  | "running"
  | "exited"
  | "failed"
  | "stopped";

export type WorkspaceTerminalLifecycleOwner = "project_background";

export type WorkspaceTerminalHealthStatus =
  | "unknown"
  | "starting"
  | "healthy"
  | "unhealthy"
  | "exited"
  | "stale";

export type WorkspaceTerminalPreviewStatus =
  | "none"
  | "starting"
  | "running"
  | "blank"
  | "render_error_suspected"
  | "unreachable"
  | "server_exited";

export type WorkspaceTerminalStartArgs = {
  command: string;
  cwd: string | null;
  previewPort: number | null;
  previewPath: string | null;
  previewLabel: string | null;
};

export type WorkspaceTerminalProcessContext = {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  providerSandboxId: string;
};

const ACTIVE_TERMINAL_STATUSES = new Set(["starting", "running"]);
const TERMINAL_OUTPUT_TAIL_MAX_CHARS = 6000;
const TERMINAL_SUMMARY_MAX_CHARS = 500;

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeSummaryString(value: unknown): string | null {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  return normalized.length > TERMINAL_SUMMARY_MAX_CHARS
    ? `${normalized.slice(0, TERMINAL_SUMMARY_MAX_CHARS - 1).trimEnd()}…`
    : normalized;
}

export function normalizeWorkspaceTerminalLifecycleOwner(
  value: unknown,
): WorkspaceTerminalLifecycleOwner {
  const normalized = String(value ?? "").trim();
  if (normalized === "project_background") return "project_background";
  return "project_background";
}

function normalizeWorkspaceTerminalHealthStatus(
  value: unknown,
): WorkspaceTerminalHealthStatus | null {
  const normalized = String(value ?? "").trim();
  return normalized === "unknown" ||
    normalized === "starting" ||
    normalized === "healthy" ||
    normalized === "unhealthy" ||
    normalized === "exited" ||
    normalized === "stale"
    ? normalized
    : null;
}

export function deriveWorkspaceTerminalHealthStatus(row: any): WorkspaceTerminalHealthStatus {
  const explicit = normalizeWorkspaceTerminalHealthStatus(row?.healthStatus);
  if (explicit) return explicit;
  const status = String(row?.status ?? "").trim().toLowerCase();
  if (status === "starting") return "starting";
  if (status === "running") return "healthy";
  if (status === "failed") return "unhealthy";
  if (status === "exited" || status === "stopped") return "exited";
  return "unknown";
}

function normalizeWorkspaceTerminalPreviewStatus(
  value: unknown,
): WorkspaceTerminalPreviewStatus | null {
  const normalized = String(value ?? "").trim();
  return normalized === "none" ||
    normalized === "starting" ||
    normalized === "running" ||
    normalized === "blank" ||
    normalized === "render_error_suspected" ||
    normalized === "unreachable" ||
    normalized === "server_exited"
    ? normalized
    : null;
}

export function deriveWorkspaceTerminalPreviewStatus(row: any): WorkspaceTerminalPreviewStatus {
  const explicit = normalizeWorkspaceTerminalPreviewStatus(row?.previewStatus);
  if (explicit) return explicit;
  const previewPort = typeof row?.previewPort === "number" ? row.previewPort : null;
  if (!previewPort) return "none";
  const status = String(row?.status ?? "").trim().toLowerCase();
  if (status === "starting") return "starting";
  if (status === "running") return "running";
  if (status === "failed" || status === "exited") return "server_exited";
  return "none";
}

export function deriveWorkspaceTerminalHealthSummary(row: any): string | null {
  const explicit = normalizeSummaryString(row?.healthSummary);
  if (explicit) return explicit;
  const healthStatus = deriveWorkspaceTerminalHealthStatus(row);
  const exitCode = typeof row?.exitCode === "number" ? row.exitCode : null;
  if (healthStatus === "healthy") return "Process is running.";
  if (healthStatus === "starting") return "Process is starting.";
  if (healthStatus === "unhealthy") {
    return exitCode === null
      ? "Process failed."
      : `Process failed with exit code ${exitCode}.`;
  }
  if (healthStatus === "exited") {
    return exitCode === null
      ? "Process is no longer running."
      : `Process exited with code ${exitCode}.`;
  }
  if (healthStatus === "stale") return "Process state is stale.";
  return null;
}

function workspaceTerminalHasPreview(row: any): boolean {
  return typeof row?.previewPort === "number" && Number.isFinite(row.previewPort);
}

function previewStatusForTerminalStatus(
  status: WorkspaceTerminalStatus,
  hasPreview: boolean,
): WorkspaceTerminalPreviewStatus {
  if (!hasPreview) return "none";
  if (status === "starting") return "starting";
  if (status === "running") return "running";
  return "server_exited";
}

function healthStatusForTerminalStatus(
  status: WorkspaceTerminalStatus,
): WorkspaceTerminalHealthStatus {
  if (status === "starting") return "starting";
  if (status === "running") return "healthy";
  if (status === "failed") return "unhealthy";
  return "exited";
}

export function normalizeRelativeWorkspaceCwd(raw: unknown): string | null {
  const candidate = String(raw ?? "").trim().replaceAll("\\", "/");
  if (!candidate) return null;
  if (candidate.startsWith("/")) throw new Error("cwd_outside_workspace");
  const parts = candidate
    .split("/")
    .filter((part) => part.length > 0 && part !== ".");
  if (parts.some((part) => part === "..")) {
    throw new Error("cwd_outside_workspace");
  }
  const segments =
    parts[0]?.toLowerCase() === "workspace" ? parts.slice(1) : parts;
  if (segments.length === 0) return ".";
  return segments.join("/");
}

export function normalizePreviewPort(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const parsed =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw)
        : Number.NaN;
  if (!Number.isFinite(parsed)) throw new Error("invalid_preview_port");
  const integer = Math.floor(parsed);
  if (integer < 3000 || integer > 9999) throw new Error("invalid_preview_port");
  return integer;
}

export function normalizePreviewPath(raw: unknown): string | null {
  const normalized = String(raw ?? "").trim();
  if (!normalized) return null;
  if (normalized.includes("://") || normalized.startsWith("//")) {
    throw new Error("invalid_preview_path");
  }
  return (normalized.startsWith("/") ? normalized : `/${normalized}`).slice(
    0,
    1024,
  );
}

export function normalizePreviewLabel(raw: unknown): string | null {
  const normalized = String(raw ?? "").trim();
  return normalized ? normalized.slice(0, 120) : null;
}

export function normalizeWorkspaceTerminalStartArgs(
  args: Record<string, unknown>,
): WorkspaceTerminalStartArgs {
  return {
    command: String(args.command ?? ""),
    cwd: normalizeRelativeWorkspaceCwd(args.cwd),
    previewPort: normalizePreviewPort(args.preview_port),
    previewPath: normalizePreviewPath(args.preview_path),
    previewLabel: normalizePreviewLabel(args.preview_label),
  };
}

export function resolveWorkspaceCwd(cwd: string | null): string {
  if (!cwd || cwd === ".") return DAYTONA_WORKSPACE_ROOT;
  return `${DAYTONA_WORKSPACE_ROOT}/${cwd}`;
}

function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function sanitizeTerminalLogId(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, "_")
    .slice(0, 160);
}

function buildTerminalOutputLogPath(providerSessionId: string): string {
  const normalized = sanitizeTerminalLogId(providerSessionId) || "unknown";
  return `/tmp/polynet-terminal-${normalized}.log`;
}

function wrapTerminalCommandWithOutputLog(command: string, logPath: string): string {
  const inner = [
    "set -o pipefail",
    `: > ${shellQuote(logPath)}`,
    `${command} 2>&1 | tee -a ${shellQuote(logPath)}`,
  ].join("\n");
  return `bash -lc ${shellQuote(inner)}`;
}

function parseNpmRunScriptName(command: string): string | null {
  const match = /^\s*npm\s+(?:run\s+)?([A-Za-z0-9:_@./-]+)(?:\s|$)/.exec(
    command,
  );
  if (!match) return null;
  const script = match[1]?.trim() ?? "";
  if (!script || script === "install" || script === "i") return null;
  return script;
}

function isPreviewCommandWorthPreflighting(command: string): boolean {
  const normalized = command.trim();
  return (
    parseNpmRunScriptName(normalized) !== null ||
    /\bnode_modules\/(?:\.bin\/vite|vite\/bin\/vite\.js)\b/.test(normalized) ||
    /(^|\s)(vite|npx\s+vite)(\s|$)/.test(normalized)
  );
}

export function normalizeWorkspaceTerminalCommand(
  command: string,
  workspaceCwd: string,
): string {
  const normalized = String(command ?? "").trim();
  if (!normalized) return normalized;
  const isPythonHttpServer =
    /^python(?:3)?\s+-m\s+http\.server(?:\s|$)/i.test(normalized) ||
    /^python(?:3)?\s+-m\s+simplehttpserver(?:\s|$)/i.test(normalized);
  if (!isPythonHttpServer) return normalized;
  if (/\s--directory(?:\s|=)/i.test(normalized.toLowerCase())) {
    return normalized;
  }
  return `${normalized} --directory ${shellQuote(workspaceCwd)}`;
}

export function buildWorkspaceTerminalSessionId(prefix: string): string {
  const cryptoObject = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  const randomSuffix =
    typeof cryptoObject?.randomUUID === "function"
      ? cryptoObject.randomUUID().replace(/-/g, "").slice(0, 18)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${randomSuffix}`;
}

export function truncateTerminalOutputTail(value: string): string {
  const normalized = String(value ?? "");
  if (normalized.length <= TERMINAL_OUTPUT_TAIL_MAX_CHARS) return normalized;
  return normalized.slice(normalized.length - TERMINAL_OUTPUT_TAIL_MAX_CHARS);
}

async function readTerminalFallbackOutputLog(params: {
  config: DaytonaConfig;
  toolboxProxyUrl: string;
  sandboxId: string;
  providerSessionId: string;
}): Promise<string> {
  const result = await downloadDaytonaToolboxFileText({
    config: params.config,
    toolboxProxyUrl: params.toolboxProxyUrl,
    sandboxId: params.sandboxId,
    path: buildTerminalOutputLogPath(params.providerSessionId),
  });
  if (!result.ok) return "";
  return String(result.value ?? "");
}

async function runPreviewStartPreflight(params: {
  session: WorkspaceTerminalProcessContext;
  command: string;
  workspaceCwd: string;
}): Promise<{ ok: true } | { ok: false; message: string; output: string }> {
  const normalizedCommand = params.command.trim();
  if (!isPreviewCommandWorthPreflighting(normalizedCommand)) return { ok: true };

  const scriptName = parseNpmRunScriptName(normalizedCommand);
  const nodeScript = `
const fs = require("fs");
const scriptName = process.argv[1] || "";
function fail(message) {
  console.error(message);
  process.exit(1);
}
if (!fs.existsSync("package.json")) fail("package.json was not found in the preview working directory.");
let pkg;
try {
  pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
} catch (error) {
  fail("package.json could not be parsed: " + (error && error.message ? error.message : String(error)));
}
const scripts = pkg && typeof pkg === "object" && pkg.scripts && typeof pkg.scripts === "object" ? pkg.scripts : {};
const scriptCommand = scriptName ? String(scripts[scriptName] || "") : "";
if (scriptName && !scriptCommand) fail("package.json does not define an npm script named '" + scriptName + "'.");
const launchCommand = [scriptCommand, ${JSON.stringify(normalizedCommand)}].join(" ");
if (/\\bvite\\b/.test(launchCommand) || /node_modules\\/vite\\/bin\\/vite\\.js/.test(launchCommand)) {
  const hasVite =
    fs.existsSync("node_modules/.bin/vite") ||
    fs.existsSync("node_modules/vite/bin/vite.js");
  if (!hasVite) fail("Vite is required for this preview, but node_modules/.bin/vite is missing. Install or repair dependencies before starting the preview.");
}
console.log("preview preflight ok");
`.trim();
  const result = await executeDaytonaCommand({
    config: params.session.config,
    toolboxProxyUrl: params.session.toolboxProxyUrl,
    sandboxId: params.session.providerSandboxId,
    command: `node -e ${shellQuote(nodeScript)}${scriptName ? ` ${shellQuote(scriptName)}` : ""}`,
    cwd: params.workspaceCwd,
    timeoutSeconds: 15,
    allowNonZero: true,
  });
  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      output: readWorkspaceToolFailureOutputPreview(result.details),
    };
  }
  if (result.exitCode !== 0) {
    const output = String(result.stdout ?? "").trim();
    return {
      ok: false,
      message: output || `Preview preflight failed with exit code ${result.exitCode}.`,
      output,
    };
  }
  return { ok: true };
}

async function createFailedWorkspaceTerminalStartRow(params: {
  ctx: any;
  ownerId: any;
  projectId: string;
  threadId?: any;
  startedByRunId?: string | null;
  session: WorkspaceTerminalProcessContext;
  terminal: WorkspaceTerminalStartArgs;
  providerSessionIdPrefix: string;
  code: string;
  message: string;
  output: string;
}): Promise<Record<string, unknown>> {
  const providerSessionId = buildWorkspaceTerminalSessionId(
    `${params.providerSessionIdPrefix}-preflight`,
  );
  const nowMs = Date.now();
  const createdRow = await params.ctx.runMutation(
    internal.workspaceTerminals.createWorkspaceTerminalSessionInternal as any,
    {
      ownerId: params.ownerId,
      projectId: params.projectId,
      threadId: params.threadId ?? undefined,
      lifecycleOwner: "project_background",
      startedByThreadId: params.threadId
        ? String(params.threadId)
        : undefined,
      startedByRunId: params.startedByRunId ?? undefined,
      providerSandboxId: params.session.providerSandboxId,
      providerSessionId,
      providerCommandId: "preflight",
      command: params.terminal.command,
      cwd: params.terminal.cwd ?? undefined,
      previewPort: params.terminal.previewPort ?? undefined,
      previewPath: params.terminal.previewPath ?? undefined,
      previewLabel: params.terminal.previewLabel ?? undefined,
      status: "failed",
      startedAt: nowMs,
      updatedAt: nowMs,
      finishedAt: nowMs,
      exitCode: 1,
      lastHeartbeatAt: nowMs,
      healthStatus: "unhealthy",
      healthSummary: params.message || "Preview preflight failed.",
      previewStatus:
        params.terminal.previewPort !== null ? "server_exited" : "none",
      lastOutputTail: truncateTerminalOutputTail(
        [params.message, params.output].filter(Boolean).join("\n"),
      ),
    },
  );
  return {
    ok: false,
    status: 409,
    code: params.code,
    message: params.message,
    terminal_session_id: String(createdRow?._id ?? "").trim(),
    output_tail:
      typeof createdRow?.lastOutputTail === "string"
        ? createdRow.lastOutputTail
        : null,
    ...summarizeWorkspaceTerminalRow(createdRow),
  };
}

export function isWorkspaceTerminalActiveStatus(status: unknown): boolean {
  return ACTIVE_TERMINAL_STATUSES.has(
    String(status ?? "").trim().toLowerCase(),
  );
}

export function summarizeWorkspaceTerminalRow(row: any): Record<string, unknown> {
  return {
    terminal_session_id: String(row?._id ?? "").trim(),
    id: String(row?._id ?? "").trim(),
    status:
      (String(row?.status ?? "stopped").trim().toLowerCase() || "stopped") as
        | WorkspaceTerminalStatus
        | string,
    command: String(row?.command ?? "").trim(),
    cwd: normalizeOptionalString(row?.cwd),
    preview_port:
      typeof row?.previewPort === "number" ? Math.floor(row.previewPort) : null,
    preview_path: normalizeOptionalString(row?.previewPath),
    preview_label: normalizeOptionalString(row?.previewLabel),
    started_at: Number(row?.startedAt ?? 0) || 0,
    updated_at: Number(row?.updatedAt ?? 0) || 0,
    finished_at: typeof row?.finishedAt === "number" ? row.finishedAt : null,
    output_tail: normalizeOptionalString(row?.lastOutputTail),
    exit_code: typeof row?.exitCode === "number" ? row.exitCode : null,
    lifecycle_owner: normalizeWorkspaceTerminalLifecycleOwner(row?.lifecycleOwner),
    started_by_thread_id: normalizeOptionalString(
      row?.startedByThreadId ?? row?.threadId,
    ),
    started_by_run_id: normalizeOptionalString(row?.startedByRunId),
    last_heartbeat_at:
      typeof row?.lastHeartbeatAt === "number" ? row.lastHeartbeatAt : null,
    health_status: deriveWorkspaceTerminalHealthStatus(row),
    health_summary: deriveWorkspaceTerminalHealthSummary(row),
    preview_status: deriveWorkspaceTerminalPreviewStatus(row),
    last_preview_probe_at:
      typeof row?.lastPreviewProbeAt === "number"
        ? row.lastPreviewProbeAt
        : null,
    last_preview_probe_summary: normalizeSummaryString(
      row?.lastPreviewProbeSummary,
    ),
    last_browser_observation_at:
      typeof row?.lastBrowserObservationAt === "number"
        ? row.lastBrowserObservationAt
        : null,
    last_browser_observation_summary: normalizeSummaryString(
      row?.lastBrowserObservationSummary,
    ),
  };
}

export function readWorkspaceToolFailureOutputPreview(details: unknown): string {
  const record =
    details && typeof details === "object" && !Array.isArray(details)
      ? (details as Record<string, unknown>)
      : null;
  if (!record) return "";
  const preferred = String(record.output_preview ?? "").trim();
  if (preferred) return preferred;
  const responseText = String(record.response_text ?? "").trim();
  if (responseText) return responseText;
  return "";
}

export async function startWorkspaceTerminalProcess(params: {
  ctx: any;
  ownerId: any;
  projectId: string;
  threadId?: any;
  startedByRunId?: string | null;
  session: WorkspaceTerminalProcessContext;
  terminal: WorkspaceTerminalStartArgs;
  providerSessionIdPrefix: string;
}): Promise<Record<string, unknown>> {
  const providerSessionId = buildWorkspaceTerminalSessionId(
    params.providerSessionIdPrefix,
  );
  const processSession = await createDaytonaProcessSession({
    config: params.session.config,
    toolboxProxyUrl: params.session.toolboxProxyUrl,
    sandboxId: params.session.providerSandboxId,
    sessionId: providerSessionId,
  });
  if (!processSession.ok) {
    return {
      ok: false,
      status: processSession.status,
      code: processSession.code,
      message: processSession.message,
    };
  }

  const workspaceCwd = resolveWorkspaceCwd(params.terminal.cwd);
  if (params.terminal.previewPort !== null) {
    const preflight = await runPreviewStartPreflight({
      session: params.session,
      command: params.terminal.command,
      workspaceCwd,
    });
    if (!preflight.ok) {
      await deleteDaytonaProcessSession({
        config: params.session.config,
        toolboxProxyUrl: params.session.toolboxProxyUrl,
        sandboxId: params.session.providerSandboxId,
        sessionId: processSession.sessionId,
      });
      return await createFailedWorkspaceTerminalStartRow({
        ctx: params.ctx,
        ownerId: params.ownerId,
        projectId: params.projectId,
        threadId: params.threadId,
        startedByRunId: params.startedByRunId,
        session: params.session,
        terminal: params.terminal,
        providerSessionIdPrefix: params.providerSessionIdPrefix,
        code: "preview_preflight_failed",
        message: preflight.message || "Preview preflight failed.",
        output: preflight.output,
      });
    }
  }
  const terminalOutputLogPath = buildTerminalOutputLogPath(
    processSession.sessionId,
  );
  const executed = await executeDaytonaProcessSessionCommand({
    config: params.session.config,
    toolboxProxyUrl: params.session.toolboxProxyUrl,
    sandboxId: params.session.providerSandboxId,
    sessionId: processSession.sessionId,
    command: wrapTerminalCommandWithOutputLog(
      normalizeWorkspaceTerminalCommand(params.terminal.command, workspaceCwd),
      terminalOutputLogPath,
    ),
    cwd: workspaceCwd,
    runAsync: true,
  });
  if (!executed.ok) {
    await deleteDaytonaProcessSession({
      config: params.session.config,
      toolboxProxyUrl: params.session.toolboxProxyUrl,
      sandboxId: params.session.providerSandboxId,
      sessionId: processSession.sessionId,
    });
    return {
      ok: false,
      status: executed.status,
      code: executed.code,
      message: executed.message,
    };
  }

  const nowMs = Date.now();
  const createdRow = await params.ctx.runMutation(
    internal.workspaceTerminals.createWorkspaceTerminalSessionInternal as any,
    {
      ownerId: params.ownerId,
      projectId: params.projectId,
      threadId: params.threadId ?? undefined,
      lifecycleOwner: "project_background",
      startedByThreadId: params.threadId
        ? String(params.threadId)
        : undefined,
      startedByRunId: params.startedByRunId ?? undefined,
      providerSandboxId: params.session.providerSandboxId,
      providerSessionId: processSession.sessionId,
      providerCommandId: executed.commandId,
      command: params.terminal.command,
      cwd: params.terminal.cwd ?? undefined,
      previewPort: params.terminal.previewPort ?? undefined,
      previewPath: params.terminal.previewPath ?? undefined,
      previewLabel: params.terminal.previewLabel ?? undefined,
      status: "running",
      startedAt: nowMs,
      updatedAt: nowMs,
      lastHeartbeatAt: nowMs,
      healthStatus: "healthy",
      healthSummary: "Process is running.",
      previewStatus:
        params.terminal.previewPort !== null ? "running" : "none",
      lastOutputTail: truncateTerminalOutputTail(executed.outputText || ""),
    },
  );
  const terminalSessionId = String(createdRow?._id ?? "").trim();
  return {
    ok: true,
    terminal_session_id: terminalSessionId,
    provider_session_id: processSession.sessionId,
    reused_existing: false,
    ...summarizeWorkspaceTerminalRow(createdRow),
  };
}

export async function writeWorkspaceTerminalProcessInput(params: {
  ctx: any;
  row: any;
  session: WorkspaceTerminalProcessContext;
  input: string;
}): Promise<Record<string, unknown>> {
  if (!isWorkspaceTerminalActiveStatus(params.row.status)) {
    return {
      ok: false,
      status: 409,
      code: "terminal_not_running",
      message: "Terminal is not running.",
    };
  }
  const sent = await sendDaytonaProcessSessionCommandInput({
    config: params.session.config,
    toolboxProxyUrl: params.session.toolboxProxyUrl,
    sandboxId: params.session.providerSandboxId,
    sessionId: String(params.row.providerSessionId ?? "").trim(),
    commandId: String(params.row.providerCommandId ?? "").trim(),
    data: params.input,
  });
  if (!sent.ok) {
    return {
      ok: false,
      status: sent.status,
      code: sent.code,
      message: sent.message,
    };
  }
  const patched = await params.ctx.runMutation(
    internal.workspaceTerminals.updateWorkspaceTerminalSessionInternal as any,
    {
      terminalSessionId: params.row._id,
      updatedAt: Date.now(),
      lastHeartbeatAt: Date.now(),
    },
  );
  return {
    ok: true,
    ...summarizeWorkspaceTerminalRow(patched ?? params.row),
  };
}

export async function stopWorkspaceTerminalProcess(params: {
  ctx: any;
  row: any;
  session: WorkspaceTerminalProcessContext | null;
  forceStoppedStatus?: boolean;
}): Promise<Record<string, unknown>> {
  const row = params.row;
  if (!isWorkspaceTerminalActiveStatus(row.status)) {
    if (params.forceStoppedStatus) {
      const patched = await params.ctx.runMutation(
        internal.workspaceTerminals.updateWorkspaceTerminalSessionInternal as any,
        {
          terminalSessionId: row._id,
          status: "stopped",
          updatedAt: Date.now(),
          finishedAt: Date.now(),
          healthStatus: "exited",
          healthSummary: "Process was stopped.",
          previewStatus: workspaceTerminalHasPreview(row)
            ? "server_exited"
            : "none",
        },
      );
      return summarizeWorkspaceTerminalRow(patched ?? row);
    }
    return summarizeWorkspaceTerminalRow(row);
  }
  if (
    params.session &&
    String(row.providerSandboxId ?? "").trim() ===
      params.session.providerSandboxId
  ) {
    await deleteDaytonaProcessSession({
      config: params.session.config,
      toolboxProxyUrl: params.session.toolboxProxyUrl,
      sandboxId: params.session.providerSandboxId,
      sessionId: String(row.providerSessionId ?? "").trim(),
    });
  }
  const patched = await params.ctx.runMutation(
    internal.workspaceTerminals.updateWorkspaceTerminalSessionInternal as any,
    {
      terminalSessionId: row._id,
      status: "stopped",
      updatedAt: Date.now(),
      finishedAt: Date.now(),
      healthStatus: "exited",
      healthSummary: "Process was stopped.",
      previewStatus: workspaceTerminalHasPreview(row)
        ? "server_exited"
        : "none",
    },
  );
  return summarizeWorkspaceTerminalRow(patched ?? row);
}

export async function resolveWorkspaceTerminalPreview(params: {
  row: any;
  session: WorkspaceTerminalProcessContext | null;
  workspaceRequiredMessage: string;
  previewNotEnabledMessage: string;
  workspaceMismatchMessage: string;
}): Promise<Record<string, unknown>> {
  const previewPort =
    typeof params.row.previewPort === "number"
      ? Math.floor(params.row.previewPort)
      : null;
  if (!params.session) {
    return {
      ok: false,
      status: 409,
      code: "workspace_session_required",
      message: params.workspaceRequiredMessage,
    };
  }
  if (!previewPort) {
    return {
      ok: false,
      status: 409,
      code: "preview_not_enabled",
      message: params.previewNotEnabledMessage,
    };
  }
  if (
    String(params.row.providerSandboxId ?? "").trim() !==
    params.session.providerSandboxId
  ) {
    return {
      ok: false,
      status: 409,
      code: "workspace_session_mismatch",
      message: params.workspaceMismatchMessage,
    };
  }

  const signed = await getDaytonaSignedPreviewUrl({
    config: params.session.config,
    sandboxId: params.session.providerSandboxId,
    port: previewPort,
    expiresInSeconds: 3600,
  });
  if (!signed.ok) return signed;

  const previewProxyToken = await mintPreviewProxySessionToken({
    kind: "workspace_preview",
    previewUrl: signed.url,
    previewToken: signed.token,
    expiresAtMs: Date.now() + 3600 * 1000,
  });
  if (!previewProxyToken.ok) {
    return {
      ok: false,
      status: 503,
      code: previewProxyToken.code,
      message: previewProxyToken.message,
    };
  }

  return {
    ok: true,
    terminal_session_id: String(params.row._id ?? "").trim(),
    preview_port: previewPort,
    preview_url: signed.url,
    preview_proxy_token: previewProxyToken.token,
    preview_path: normalizeOptionalString(params.row.previewPath),
    preview_label: normalizeOptionalString(params.row.previewLabel),
    expires_in_seconds: 3600,
  };
}
