import { internal } from "./_generated/api";
import {
  executeBlaxelWorkspaceCommand,
  getBlaxelWorkspacePreviewUrl,
  readBlaxelWorkspaceProcess,
  stopBlaxelWorkspaceProcess,
} from "./blaxelWorkspaceComputerProvider.ts";
import { BLAXEL_WORKSPACE_ROOT } from "./blaxelWorkspaceClient.ts";
import { mintPreviewProxySessionToken } from "./previewProxySessionToken";
import {
  normalizeWorkspacePreviewPort,
} from "../shared/workspacePreviewPort";

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

export type WorkspaceTerminalPreviewTransportStatus =
  | "not_started"
  | "loading"
  | "loaded"
  | "failed";

export type WorkspaceTerminalPreviewInspectionStatus =
  | "not_attempted"
  | "same_origin_dom"
  | "cross_origin_uninspectable"
  | "dom_unavailable";

export type WorkspaceTerminalPreviewRenderStatus =
  | "unknown"
  | "visible_content"
  | "blank_suspected"
  | "transport_error";

export type WorkspaceTerminalStartArgs = {
  command: string;
  cwd: string | null;
  previewPort: number | null;
  previewPath: string | null;
  previewLabel: string | null;
};

export type WorkspaceTerminalProcessContext = {
  providerId: "blaxel";
  providerSandboxId: string;
  workspaceRoot?: string | null;
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
  return normalizeWorkspacePreviewPort(raw);
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
  if (!cwd || cwd === ".") return BLAXEL_WORKSPACE_ROOT;
  return `${BLAXEL_WORKSPACE_ROOT}/${cwd}`;
}

function resolveBlaxelWorkspaceRoot(session: WorkspaceTerminalProcessContext): string {
  const normalized = String(session.workspaceRoot ?? "").trim();
  return normalized || BLAXEL_WORKSPACE_ROOT;
}

function resolveWorkspaceCwdForSession(
  session: WorkspaceTerminalProcessContext,
  cwd: string | null,
): string {
  const root = resolveBlaxelWorkspaceRoot(session);
  if (!cwd || cwd === ".") return root;
  return `${root}/${cwd}`;
}

function resolveWorkspaceToolCwdForSession(
  _session: WorkspaceTerminalProcessContext,
  cwd: string | null,
): string {
  return cwd || ".";
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

function normalizeWorkspaceTerminalIdentityCommand(params: {
  command: string;
  cwd: string | null;
  session: WorkspaceTerminalProcessContext;
}): string {
  return normalizeWorkspaceTerminalCommand(
    params.command,
    resolveWorkspaceCwdForSession(params.session, params.cwd),
  )
    .replace(/\s+/g, " ")
    .trim();
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

// One listener per port per sandbox is physics, so the port is the identity
// key: a serve request lands on whichever active row already owns the port.
async function findActiveWorkspaceTerminalOnPort(params: {
  ctx: any;
  ownerId: any;
  projectId: string;
  session: WorkspaceTerminalProcessContext;
  previewPort: number;
}): Promise<any | null> {
  const rows = (await params.ctx.runQuery(
    internal.workspaceTerminals.listProjectWorkspaceTerminalSessionsInternal as any,
    {
      ownerId: params.ownerId,
      projectId: params.projectId,
    },
  )) as any[];
  const newestFirst = [...rows].sort(
    (left, right) => Number(right?.updatedAt ?? 0) - Number(left?.updatedAt ?? 0),
  );
  for (const row of newestFirst) {
    if (!isWorkspaceTerminalActiveStatus(row?.status)) continue;
    if (
      String(row?.providerSandboxId ?? "").trim() !==
      params.session.providerSandboxId
    ) {
      continue;
    }
    const rowPreviewPort =
      typeof row?.previewPort === "number" && Number.isFinite(row.previewPort)
        ? Math.floor(row.previewPort)
        : null;
    if (rowPreviewPort === params.previewPort) return row;
  }
  return null;
}

export function truncateTerminalOutputTail(value: string): string {
  const normalized = String(value ?? "");
  if (normalized.length <= TERMINAL_OUTPUT_TAIL_MAX_CHARS) return normalized;
  return normalized.slice(normalized.length - TERMINAL_OUTPUT_TAIL_MAX_CHARS);
}

// Readiness is decided by us, not the provider SDK: one in-sandbox exec polls
// the port with bash /dev/tcp (no curl dependency, no HTTP-status opinions —
// a TCP accept is the bar for "the server started").
async function probeWorkspaceTerminalPort(params: {
  session: WorkspaceTerminalProcessContext;
  port: number;
  attempts?: number;
}): Promise<{ ok: boolean }> {
  const attempts = Math.max(1, Math.min(30, Math.floor(params.attempts ?? 15)));
  const script = `for i in $(seq 1 ${attempts}); do (exec 3<>/dev/tcp/127.0.0.1/${params.port}) 2>/dev/null && exit 0; sleep 1; done; exit 1`;
  const result = await executeBlaxelWorkspaceCommand({
    sandboxName: params.session.providerSandboxId,
    command: `bash -c ${shellQuote(script)}`,
    waitForCompletion: true,
    timeoutSeconds: attempts + 10,
  });
  return { ok: result.ok === true && result.exitCode === 0 };
}

async function readWorkspaceTerminalProcessOutputTail(params: {
  session: WorkspaceTerminalProcessContext;
  processName: string;
}): Promise<string> {
  try {
    const proc = await readBlaxelWorkspaceProcess({
      sandboxName: params.session.providerSandboxId,
      processName: params.processName,
    });
    if (proc.ok !== true) return "";
    return truncateTerminalOutputTail(
      [
        typeof (proc as any).stderr === "string" ? (proc as any).stderr : "",
        typeof (proc as any).stdout === "string" ? (proc as any).stdout : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  } catch {
    return "";
  }
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
    completion_recorded_at:
      typeof row?.completionRecordedAt === "number"
        ? row.completionRecordedAt
        : null,
    completion_reason: normalizeOptionalString(row?.completionReason),
    lifecycle_owner: normalizeWorkspaceTerminalLifecycleOwner(row?.lifecycleOwner),
    provider_sandbox_provider_id: normalizeOptionalString(row?.providerSandboxProviderId),
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
    preview_transport_status: normalizeOptionalString(row?.previewTransportStatus),
    preview_inspection_status: normalizeOptionalString(row?.previewInspectionStatus),
    preview_render_status: normalizeOptionalString(row?.previewRenderStatus),
  };
}

export function resolveWorkspaceTerminalRowProviderId(_row: any): "blaxel" {
  return "blaxel";
}

export function buildBlaxelTerminalProcessContextFromRow(
  row: any,
): WorkspaceTerminalProcessContext {
  return {
    providerId: "blaxel",
    providerSandboxId: String(row?.providerSandboxId ?? "").trim(),
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

function mapBlaxelProcessStatus(params: {
  status: string | null;
  exitCode: number | null;
  fallbackStatus: unknown;
}): WorkspaceTerminalStatus {
  const normalized = String(params.status ?? "").trim().toLowerCase();
  if (normalized.includes("stop") || normalized.includes("kill")) return "stopped";
  if (normalized.includes("run") || normalized.includes("start") || normalized.includes("pending")) {
    return "running";
  }
  if (params.exitCode !== null) return params.exitCode === 0 ? "exited" : "failed";
  if (normalized.includes("success") || normalized.includes("complete") || normalized.includes("exit")) {
    return "exited";
  }
  if (normalized.includes("fail") || normalized.includes("error")) return "failed";
  const fallback = String(params.fallbackStatus ?? "").trim().toLowerCase();
  return isWorkspaceTerminalActiveStatus(fallback) ? "running" : "stopped";
}

export async function readWorkspaceTerminalProcess(params: {
  ctx: any;
  row: any;
  session: WorkspaceTerminalProcessContext | null;
}): Promise<Record<string, unknown>> {
  if (!params.session || params.session.providerId !== "blaxel") {
    return summarizeWorkspaceTerminalRow(params.row);
  }
  const processName =
    normalizeOptionalString(params.row?.providerSessionId) ??
    normalizeOptionalString(params.row?.providerCommandId);
  if (!processName) {
    return {
      ok: false,
      status: 404,
      code: "terminal_not_found",
      message: "Terminal process id is missing.",
    };
  }
  const read = await readBlaxelWorkspaceProcess({
    sandboxName: params.session.providerSandboxId,
    processName,
  });
  if (!read.ok) {
    if (
      read.code === "blaxel_sandbox_not_found" ||
      read.code === "blaxel_process_not_found"
    ) {
      const nowMs = Date.now();
      const patched = await params.ctx.runMutation(
        internal.workspaceTerminals.updateWorkspaceTerminalSessionInternal as any,
        {
          terminalSessionId: params.row._id,
          status: "stopped",
          updatedAt: nowMs,
          finishedAt: nowMs,
          completionRecordedAt: params.row.completionRecordedAt ?? nowMs,
          completionReason:
            read.code === "blaxel_sandbox_not_found"
              ? "sandbox_missing"
              : "session_missing",
          healthStatus: "stale",
          healthSummary:
            read.code === "blaxel_sandbox_not_found"
              ? "Workspace computer is no longer active."
              : "Workspace process is no longer available.",
          previewStatus: workspaceTerminalHasPreview(params.row)
            ? "server_exited"
            : "none",
        },
      );
      return {
        ok: true,
        ...summarizeWorkspaceTerminalRow(patched ?? params.row),
      };
    }
    return {
      ok: false,
      status: read.status,
      code: read.code,
      message: read.message,
    };
  }
  const nextStatus = mapBlaxelProcessStatus({
    status: read.status,
    exitCode: read.exitCode,
    fallbackStatus: params.row?.status,
  });
  const nowMs = Date.now();
  const outputTail = truncateTerminalOutputTail(
    [read.logs, read.stdout, read.stderr].filter(Boolean).join("\n"),
  );
  const patch: Record<string, unknown> = {
    terminalSessionId: params.row._id,
    status: nextStatus,
    updatedAt: nowMs,
    lastHeartbeatAt: nowMs,
    lastOutputTail: outputTail,
    healthStatus: healthStatusForTerminalStatus(nextStatus),
    healthSummary:
      nextStatus === "running"
        ? "Process is running."
        : nextStatus === "failed"
          ? `Process failed${read.exitCode === null ? "" : ` with exit code ${read.exitCode}`}.`
          : nextStatus === "stopped"
            ? "Process was stopped."
            : `Process exited${read.exitCode === null ? "" : ` with code ${read.exitCode}`}.`,
    previewStatus: previewStatusForTerminalStatus(
      nextStatus,
      workspaceTerminalHasPreview(params.row),
    ),
  };
  if (!isWorkspaceTerminalActiveStatus(nextStatus)) {
    patch.finishedAt = nowMs;
    patch.completionRecordedAt = params.row.completionRecordedAt ?? nowMs;
    patch.completionReason =
      nextStatus === "failed"
        ? "failed"
        : nextStatus === "stopped"
          ? "stopped"
          : "exited";
    if (read.exitCode !== null) patch.exitCode = read.exitCode;
  }
  const patched = await params.ctx.runMutation(
    internal.workspaceTerminals.updateWorkspaceTerminalSessionInternal as any,
    patch,
  );
  return {
    ok: true,
    ...summarizeWorkspaceTerminalRow(patched ?? params.row),
  };
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
  const requestedPort = params.terminal.previewPort;
  if (requestedPort !== null) {
    const portPeer = await findActiveWorkspaceTerminalOnPort({
      ctx: params.ctx,
      ownerId: params.ownerId,
      projectId: params.projectId,
      session: params.session,
      previewPort: requestedPort,
    });
    if (portPeer) {
      const summary = await readWorkspaceTerminalProcess({
        ctx: params.ctx,
        row: portPeer,
        session: params.session,
      });
      const peerAlive = isWorkspaceTerminalActiveStatus(
        (summary as { status?: unknown } | null)?.status,
      );
      const sameCommand =
        normalizeWorkspaceTerminalIdentityCommand({
          command: String(portPeer.command ?? ""),
          cwd: normalizeOptionalString(portPeer.cwd),
          session: params.session,
        }) ===
        normalizeWorkspaceTerminalIdentityCommand({
          command: params.terminal.command,
          cwd: params.terminal.cwd,
          session: params.session,
        });
      if (peerAlive && sameCommand) {
        return {
          ok: true,
          reused_existing: true,
          provider_session_id: normalizeOptionalString(portPeer.providerSessionId),
          ...summary,
        };
      }
      if (peerAlive) {
        // Same port, different command: the new serve supersedes the old one.
        await stopWorkspaceTerminalProcess({
          ctx: params.ctx,
          row: portPeer,
          session: params.session,
          forceStoppedStatus: true,
        });
      }
    }
  }

  const providerSessionId = buildWorkspaceTerminalSessionId(
    params.providerSessionIdPrefix,
  );
  const workspaceCwd = resolveWorkspaceCwdForSession(
    params.session,
    params.terminal.cwd,
  );
  const executed = await executeBlaxelWorkspaceCommand({
    sandboxName: params.session.providerSandboxId,
    processName: providerSessionId,
    command: normalizeWorkspaceTerminalCommand(
      params.terminal.command,
      workspaceCwd,
    ),
    cwd: resolveWorkspaceToolCwdForSession(params.session, params.terminal.cwd),
    waitForCompletion: false,
    timeoutSeconds: 86_400,
  });
  if (!executed.ok) {
    // The provider call failed, but the process may still have launched; stop
    // it by name so a failed start can never leave an untracked listener.
    try {
      await stopBlaxelWorkspaceProcess({
        sandboxName: params.session.providerSandboxId,
        processName: providerSessionId,
      });
    } catch {
      // Best effort only; reconciliation sweeps anything that survives.
    }
    return {
      ok: false,
      status: executed.status,
      code: executed.code,
      message: executed.message,
    };
  }

  // Every launch gets a row immediately — a row is what makes a process
  // stoppable, reconcilable, and visible.
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
      providerSandboxProviderId: "blaxel",
      providerSessionId,
      providerCommandId: executed.providerCommandId ?? providerSessionId,
      command: params.terminal.command,
      cwd: params.terminal.cwd ?? undefined,
      previewPort: params.terminal.previewPort ?? undefined,
      previewPath: params.terminal.previewPath ?? undefined,
      previewLabel: params.terminal.previewLabel ?? undefined,
      status: requestedPort !== null ? "starting" : "running",
      startedAt: nowMs,
      updatedAt: nowMs,
      lastHeartbeatAt: nowMs,
      healthStatus: requestedPort !== null ? "starting" : "healthy",
      healthSummary:
        requestedPort !== null
          ? "Waiting for the server to accept connections."
          : "Process is running.",
      previewStatus: requestedPort !== null ? "starting" : "none",
      lastOutputTail: truncateTerminalOutputTail(
        [executed.stdout, executed.stderr].filter(Boolean).join("\n"),
      ),
    },
  );
  const terminalSessionId = String(createdRow?._id ?? "").trim();
  if (requestedPort === null) {
    return {
      ok: true,
      terminal_session_id: terminalSessionId,
      provider_session_id: providerSessionId,
      reused_existing: false,
      ...summarizeWorkspaceTerminalRow(createdRow),
    };
  }

  const probe = await probeWorkspaceTerminalPort({
    session: params.session,
    port: requestedPort,
  });
  if (probe.ok) {
    const readyMs = Date.now();
    const patched = await params.ctx.runMutation(
      internal.workspaceTerminals.updateWorkspaceTerminalSessionInternal as any,
      {
        terminalSessionId: createdRow?._id,
        status: "running",
        updatedAt: readyMs,
        lastHeartbeatAt: readyMs,
        healthStatus: "healthy",
        healthSummary: "Process is running.",
        previewStatus: "running",
      },
    );
    return {
      ok: true,
      terminal_session_id: terminalSessionId,
      provider_session_id: providerSessionId,
      reused_existing: false,
      ...summarizeWorkspaceTerminalRow(patched ?? createdRow),
    };
  }

  // The server never accepted connections: report the truth with the actual
  // process output, and stop both the process and the row.
  const outputTail = await readWorkspaceTerminalProcessOutputTail({
    session: params.session,
    processName: providerSessionId,
  });
  try {
    await stopBlaxelWorkspaceProcess({
      sandboxName: params.session.providerSandboxId,
      processName: providerSessionId,
    });
  } catch {
    // Best effort only; reconciliation sweeps anything that survives.
  }
  const failedMs = Date.now();
  await params.ctx.runMutation(
    internal.workspaceTerminals.updateWorkspaceTerminalSessionInternal as any,
    {
      terminalSessionId: createdRow?._id,
      status: "failed",
      updatedAt: failedMs,
      finishedAt: failedMs,
      completionRecordedAt: failedMs,
      completionReason: "failed",
      healthStatus: "unhealthy",
      healthSummary: `The server did not accept connections on port ${requestedPort}.`,
      previewStatus: "server_exited",
      ...(outputTail ? { lastOutputTail: outputTail } : {}),
    },
  );
  return {
    ok: false,
    status: 502,
    code: "server_start_failed",
    message: `The server did not accept connections on port ${requestedPort} within 15 seconds.`,
    terminal_session_id: terminalSessionId,
    output_tail: outputTail || null,
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
  return {
    ok: false,
    status: 501,
    code: "terminal_input_not_supported",
    message: "Interactive terminal input is not available for Blaxel workspace processes yet.",
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
      const nowMs = Date.now();
      const patched = await params.ctx.runMutation(
        internal.workspaceTerminals.updateWorkspaceTerminalSessionInternal as any,
        {
          terminalSessionId: row._id,
          status: "stopped",
          updatedAt: nowMs,
          finishedAt: nowMs,
          completionRecordedAt: row.completionRecordedAt ?? nowMs,
          completionReason: row.completionReason ?? "stopped",
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
    const processName =
      normalizeOptionalString(row.providerSessionId) ??
      normalizeOptionalString(row.providerCommandId);
    if (processName) {
      await stopBlaxelWorkspaceProcess({
        sandboxName: params.session.providerSandboxId,
        processName,
      });
    }
  }
  const nowMs = Date.now();
  const patched = await params.ctx.runMutation(
    internal.workspaceTerminals.updateWorkspaceTerminalSessionInternal as any,
    {
      terminalSessionId: row._id,
      status: "stopped",
      updatedAt: nowMs,
      finishedAt: nowMs,
      completionRecordedAt: row.completionRecordedAt ?? nowMs,
      completionReason: row.completionReason ?? "stopped",
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

  const preview = await getBlaxelWorkspacePreviewUrl({
    sandboxName: params.session.providerSandboxId,
    port: previewPort,
    previewName:
      normalizeOptionalString(params.row.previewLabel) ?? `port-${previewPort}`,
    public: true,
  });
  if (!preview.ok) return preview;

  const previewProxyToken = await mintPreviewProxySessionToken({
    kind: "workspace_preview",
    previewUrl: preview.url,
    previewToken: null,
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
    preview_url: preview.url,
    preview_proxy_token: previewProxyToken.token,
    preview_path: normalizeOptionalString(params.row.previewPath),
    preview_label: normalizeOptionalString(params.row.previewLabel),
    expires_in_seconds: 3600,
  };
}
