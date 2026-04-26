import { internal } from "./_generated/api";
import type { WorkspaceSandboxSession } from "./daytonaWorkspaceSession";
import {
  DAYTONA_WORKSPACE_ROOT,
  getDaytonaSignedPreviewUrl,
  type DaytonaConfig,
} from "./daytonaSandboxClient";
import {
  createDaytonaProcessSession,
  deleteDaytonaProcessSession,
  executeDaytonaProcessSessionCommand,
  findDaytonaProcessSessionCommand,
  getDaytonaProcessSession,
  getDaytonaProcessSessionCommandLogs,
  readDaytonaProcessSessionCommandExitCode,
  sendDaytonaProcessSessionCommandInput,
} from "./daytonaProcessSessions";
import { mintPreviewProxySessionToken } from "./previewProxySessionToken";

export type WorkspaceTerminalStatus =
  | "starting"
  | "running"
  | "exited"
  | "failed"
  | "stopped";

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
const RUNTIME_TERMINAL_START_READINESS_MS = 1_500;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
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

export function isWorkspaceTerminalActiveStatus(status: unknown): boolean {
  return ACTIVE_TERMINAL_STATUSES.has(
    String(status ?? "").trim().toLowerCase(),
  );
}

export function summarizeWorkspaceTerminalRow(row: any): Record<string, unknown> {
  return {
    terminal_session_id: String(row?._id ?? "").trim(),
    id: String(row?._id ?? "").trim(),
    run_id_started_by: normalizeOptionalString(row?.runIdStartedBy),
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
  };
}

function isConfirmedProcessSessionGone(value: unknown): boolean {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const code = String(record?.code ?? "").trim().toLowerCase();
  const details =
    record?.details && typeof record.details === "object" && !Array.isArray(record.details)
      ? (record.details as Record<string, unknown>)
      : null;
  const responseText = String(details?.response_text ?? "").toLowerCase();
  return code === "terminal_not_found" || responseText.includes("not found");
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

export async function requireRuntimeSessionOwnedTerminalRow(params: {
  ctx: any;
  ownerId: any;
  runId: string;
  terminalSessionId: string;
}): Promise<
  | { ok: true; row: any }
  | { ok: false; status: number; code: string; message: string }
> {
  const normalizedTerminalSessionId = String(params.terminalSessionId ?? "").trim();
  if (!normalizedTerminalSessionId) {
    return {
      ok: false,
      status: 400,
      code: "invalid_tool_args",
      message: "terminal_session_id is required.",
    };
  }
  const row = await params.ctx.runQuery(
    internal.workspaceTerminals.getWorkspaceTerminalSessionInternal as any,
    {
      terminalSessionId: normalizedTerminalSessionId as any,
    },
  );
  if (
    !row ||
    String(row.ownerId ?? "") !== String(params.ownerId ?? "") ||
    String(row.runIdStartedBy ?? "").trim() !== params.runId
  ) {
    return {
      ok: false,
      status: 404,
      code: "terminal_not_found",
      message: "Runtime terminal session not found.",
    };
  }
  return { ok: true, row };
}

export async function startWorkspaceTerminalProcess(params: {
  ctx: any;
  ownerId: any;
  projectId: string;
  threadId?: any;
  runIdStartedBy?: string | null;
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
  const executed = await executeDaytonaProcessSessionCommand({
    config: params.session.config,
    toolboxProxyUrl: params.session.toolboxProxyUrl,
    sandboxId: params.session.providerSandboxId,
    sessionId: processSession.sessionId,
    command: normalizeWorkspaceTerminalCommand(
      params.terminal.command,
      workspaceCwd,
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
      runIdStartedBy: params.runIdStartedBy ?? undefined,
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

export async function startRuntimeSessionTerminal(params: {
  ctx: any;
  ownerId: any;
  projectId: string;
  runId: string;
  session: WorkspaceSandboxSession;
  terminal: WorkspaceTerminalStartArgs;
}): Promise<Record<string, unknown>> {
  const started = await startWorkspaceTerminalProcess({
    ctx: params.ctx,
    ownerId: params.ownerId,
    projectId: params.projectId,
    runIdStartedBy: params.runId,
    session: params.session,
    terminal: params.terminal,
    providerSessionIdPrefix: "arx-run-term",
  });
  if (started.ok !== true) return started;

  const terminalSessionId = String(started.terminal_session_id ?? "").trim();
  if (!terminalSessionId) return started;

  await sleep(RUNTIME_TERMINAL_START_READINESS_MS);

  const row = await params.ctx.runQuery(
    internal.workspaceTerminals.getWorkspaceTerminalSessionInternal as any,
    {
      terminalSessionId: terminalSessionId as any,
    },
  );
  if (!row) {
    return {
      ok: false,
      status: 404,
      code: "terminal_not_found",
      message: "Background terminal disappeared before it became ready.",
      terminal_session_id: terminalSessionId,
    };
  }

  const summary = await reconcileRuntimeSessionTerminalRow({
    ctx: params.ctx,
    row,
    session: params.session,
  });
  const status = String(summary.status ?? "").trim().toLowerCase();
  if (isWorkspaceTerminalActiveStatus(status)) {
    return {
      ...started,
      ...summary,
      ok: true,
    };
  }

  const exitCode =
    typeof summary.exit_code === "number" && Number.isFinite(summary.exit_code)
      ? Math.floor(summary.exit_code)
      : null;
  const outputTail =
    typeof summary.output_tail === "string" && summary.output_tail.trim()
      ? summary.output_tail.trim()
      : "";
  return {
    ...summary,
    ok: false,
    status: 409,
    code: "terminal_exited_before_ready",
    message: `Background terminal exited before it became ready${exitCode === null ? "" : ` (exit ${exitCode})`}.`,
    terminal_session_id: terminalSessionId,
    output_tail: outputTail || null,
  };
}

export async function reconcileRuntimeSessionTerminalRow(params: {
  ctx: any;
  row: any;
  session: WorkspaceSandboxSession;
}): Promise<Record<string, unknown>> {
  const row = params.row;
  if (!isWorkspaceTerminalActiveStatus(row.status)) {
    return summarizeWorkspaceTerminalRow(row);
  }
  if (
    String(row.providerSandboxId ?? "").trim() !==
    params.session.providerSandboxId
  ) {
    return summarizeWorkspaceTerminalRow(row);
  }

  const nowMs = Date.now();
  const markFailed = async (): Promise<Record<string, unknown>> => {
    const patched = await params.ctx.runMutation(
      internal.workspaceTerminals.updateWorkspaceTerminalSessionInternal as any,
      {
        terminalSessionId: row._id,
        status: "failed",
        finishedAt: nowMs,
        updatedAt: nowMs,
      },
    );
    return summarizeWorkspaceTerminalRow(patched ?? row);
  };

  const providerSessionId = String(row.providerSessionId ?? "").trim();
  const providerCommandId = String(row.providerCommandId ?? "").trim();
  const processSession = await getDaytonaProcessSession({
    config: params.session.config,
    toolboxProxyUrl: params.session.toolboxProxyUrl,
    sandboxId: params.session.providerSandboxId,
    sessionId: providerSessionId,
  });
  if (!processSession.ok) {
    return isConfirmedProcessSessionGone(processSession)
      ? await markFailed()
      : summarizeWorkspaceTerminalRow(row);
  }

  const command = findDaytonaProcessSessionCommand(
    processSession.session,
    providerCommandId,
  );
  if (!command) return await markFailed();

  const logs = await getDaytonaProcessSessionCommandLogs({
    config: params.session.config,
    toolboxProxyUrl: params.session.toolboxProxyUrl,
    sandboxId: params.session.providerSandboxId,
    sessionId: providerSessionId,
    commandId: providerCommandId,
  });
  const exitCode = readDaytonaProcessSessionCommandExitCode(command);
  if (!logs.ok && exitCode === null) return summarizeWorkspaceTerminalRow(row);

  const nextStatus: WorkspaceTerminalStatus =
    exitCode === null ? "running" : exitCode === 0 ? "exited" : "failed";
  const patched = await params.ctx.runMutation(
    internal.workspaceTerminals.updateWorkspaceTerminalSessionInternal as any,
    {
      terminalSessionId: row._id,
      status: nextStatus,
      updatedAt: nowMs,
      ...(exitCode === null ? null : { finishedAt: nowMs, exitCode }),
      ...(logs.ok
        ? { lastOutputTail: truncateTerminalOutputTail(logs.output) }
        : null),
    },
  );

  if (exitCode !== null) {
    await deleteDaytonaProcessSession({
      config: params.session.config,
      toolboxProxyUrl: params.session.toolboxProxyUrl,
      sandboxId: params.session.providerSandboxId,
      sessionId: providerSessionId,
    });
  }

  return summarizeWorkspaceTerminalRow(patched ?? row);
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
    },
  );
  return {
    ok: true,
    ...summarizeWorkspaceTerminalRow(patched ?? params.row),
  };
}

export async function writeRuntimeSessionTerminalRow(params: {
  ctx: any;
  row: any;
  session: WorkspaceSandboxSession;
  input: string;
}): Promise<Record<string, unknown>> {
  return await writeWorkspaceTerminalProcessInput(params);
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
    },
  );
  return summarizeWorkspaceTerminalRow(patched ?? row);
}

export async function stopRuntimeSessionTerminalRow(params: {
  ctx: any;
  row: any;
  session: WorkspaceSandboxSession | null;
}): Promise<Record<string, unknown>> {
  return await stopWorkspaceTerminalProcess(params);
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

export async function resolveRuntimeSessionTerminalPreview(params: {
  row: any;
  session: WorkspaceSandboxSession | null;
}): Promise<Record<string, unknown>> {
  return await resolveWorkspaceTerminalPreview({
    row: params.row,
    session: params.session,
    workspaceRequiredMessage:
      "Runtime preview is only available while its workspace session is active.",
    previewNotEnabledMessage:
      "This runtime terminal does not expose an app preview.",
    workspaceMismatchMessage:
      "Preview terminal is not attached to this workspace session.",
  });
}
