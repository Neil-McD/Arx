import { internal } from "./_generated/api";
import {
  cleanupWorkspaceSandboxSession,
  createWorkspaceSandboxSession,
  type WorkspaceSandboxSession,
} from "./daytonaWorkspaceSession";
import { runDaytonaComputerUseTool } from "./daytonaComputerUse";
import {
  DAYTONA_WORKSPACE_ROOT,
  getDaytonaSignedPreviewUrl,
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
import {
  createRuntimeMcpManager,
  type RuntimeMcpConnectionBundle,
  type RuntimeMountedMcpTool,
} from "./runtimeMcpManager";
import {
  createRuntimeMountedToolExposureState,
  normalizeResolveMountedToolsArguments,
  RESOLVE_MOUNTED_TOOLS_TOOL_NAME,
} from "./runtimeMountedToolExposure";
import type {
  NativeToolAwareMessage,
  NativeToolInputContentPart,
} from "../shared/nativeToolProtocol";
import type { NativeToolExecutionResult } from "../shared/nativeToolLoop";
import {
  type RetrievalToolName,
  isComputerUseToolName,
} from "../shared/retrievalTools";

const WORKSPACE_RUN_HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;
const TERMINAL_TOOL_NAMES = new Set([
  "terminal_start",
  "terminal_read",
  "terminal_write",
  "terminal_stop",
] as const);

type RuntimeExecutionSessionRunEvent = {
  eventType: string;
  eventKey?: string;
  payload: Record<string, unknown>;
};

type TerminalToolName =
  | "terminal_start"
  | "terminal_read"
  | "terminal_write"
  | "terminal_stop";

function isTerminalToolName(toolName: string): toolName is TerminalToolName {
  return TERMINAL_TOOL_NAMES.has(toolName as TerminalToolName);
}

function formatJsonToolOutput(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function formatTerminalStartToolOutput(value: unknown): string {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const status =
    typeof record?.status === "string" && record.status.trim()
      ? record.status.trim()
      : "running";
  const previewAvailable =
    typeof record?.preview_port === "number" &&
    Number.isFinite(record.preview_port);
  return [
    "Workspace terminal started successfully.",
    `Current status: ${status}.`,
    previewAvailable
      ? "Inline preview is available."
      : "No inline preview was exposed.",
  ].join("\n");
}

function formatToolOutput(toolName: string, value: unknown): string {
  if (toolName === "terminal_start") {
    return formatTerminalStartToolOutput(value);
  }
  return formatJsonToolOutput(value);
}

type RuntimeWorkspaceTerminalStatus =
  | "starting"
  | "running"
  | "exited"
  | "failed"
  | "stopped";

const ACTIVE_TERMINAL_STATUSES = new Set(["starting", "running"]);
const TERMINAL_OUTPUT_TAIL_MAX_CHARS = 6000;

function normalizeRuntimeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeRelativeWorkspaceCwd(raw: unknown): string | null {
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

function normalizePreviewPort(raw: unknown): number | null {
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

function normalizePreviewPath(raw: unknown): string | null {
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

function normalizePreviewLabel(raw: unknown): string | null {
  const normalized = String(raw ?? "").trim();
  return normalized ? normalized.slice(0, 120) : null;
}

function resolveWorkspaceCwd(cwd: string | null): string {
  if (!cwd || cwd === ".") return DAYTONA_WORKSPACE_ROOT;
  return `${DAYTONA_WORKSPACE_ROOT}/${cwd}`;
}

function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function normalizeRuntimeTerminalCommand(
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

function buildRuntimeTerminalSessionId(): string {
  const cryptoObject = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  const randomSuffix =
    typeof cryptoObject?.randomUUID === "function"
      ? cryptoObject.randomUUID().replace(/-/g, "").slice(0, 18)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `arx-run-term-${randomSuffix}`;
}

function truncateTerminalOutputTail(value: string): string {
  const normalized = String(value ?? "");
  if (normalized.length <= TERMINAL_OUTPUT_TAIL_MAX_CHARS) return normalized;
  return normalized.slice(normalized.length - TERMINAL_OUTPUT_TAIL_MAX_CHARS);
}

function isTerminalActiveStatus(status: unknown): boolean {
  return ACTIVE_TERMINAL_STATUSES.has(
    String(status ?? "").trim().toLowerCase(),
  );
}

function summarizeTerminalRow(row: any): Record<string, unknown> {
  return {
    terminal_session_id: String(row?._id ?? "").trim(),
    id: String(row?._id ?? "").trim(),
    run_id_started_by: normalizeRuntimeOptionalString(row?.runIdStartedBy),
    status:
      (String(row?.status ?? "stopped").trim().toLowerCase() || "stopped") as
        | RuntimeWorkspaceTerminalStatus
        | string,
    command: String(row?.command ?? "").trim(),
    cwd: normalizeRuntimeOptionalString(row?.cwd),
    preview_port:
      typeof row?.previewPort === "number" ? Math.floor(row.previewPort) : null,
    preview_path: normalizeRuntimeOptionalString(row?.previewPath),
    preview_label: normalizeRuntimeOptionalString(row?.previewLabel),
    output_tail: normalizeRuntimeOptionalString(row?.lastOutputTail),
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

function readFailureOutputPreview(details: unknown): string {
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

function isInlineImageDataUrl(value: unknown): value is string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .startsWith("data:image/");
}

function dataUrlToBlob(dataUrl: string): { blob: Blob; mimeType: string } {
  const trimmed = dataUrl.trim();
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(trimmed);
  if (!match) throw new Error("invalid_image_data_url");
  const mimeType = match[1]!.trim() || "application/octet-stream";
  const binary = atob(match[2]!.trim());
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return {
    blob: new Blob([bytes], { type: mimeType }),
    mimeType,
  };
}

function extractComputerUseObservation(
  observationContent: NativeToolInputContentPart[] | null | undefined,
): { summary: string | null; imageUrl: string | null } {
  if (!Array.isArray(observationContent) || observationContent.length === 0) {
    return { summary: null, imageUrl: null };
  }
  let summary: string | null = null;
  let imageUrl: string | null = null;
  for (const part of observationContent) {
    if (!part || part.source !== "computer_use_observation") continue;
    if (part.type === "text" && !summary) {
      const nextSummary = String(part.text ?? "").trim();
      if (nextSummary) summary = nextSummary;
      continue;
    }
    if (part.type === "image" && !imageUrl) {
      const nextUrl = String(part.imageUrl ?? "").trim();
      if (nextUrl) imageUrl = nextUrl;
    }
  }
  return { summary, imageUrl };
}

export function createPolyNetExecutionSession(params: {
  ctx: any;
  userId: any;
  authSubject?: string | null;
  projectId?: string | null;
  runId: string;
  mountedTools: RuntimeMountedMcpTool[];
  mountedPromptSuffix?: string | null;
  initialWorkspaceSession?: WorkspaceSandboxSession | null;
  appendRunEvent: (event: RuntimeExecutionSessionRunEvent) => Promise<void>;
  touchRunHeartbeat?: () => Promise<void>;
  loadConnectionBundle: (params: {
    developerAppId: string;
  }) => Promise<RuntimeMcpConnectionBundle>;
}) {
  const runtimeMcpManager = createRuntimeMcpManager({
    runId: params.runId,
    mountedTools: params.mountedTools,
    loadConnectionBundle: params.loadConnectionBundle,
    appendRunEvent: params.appendRunEvent,
  });
  const mountedToolExposureState = createRuntimeMountedToolExposureState({
    mountedTools: params.mountedTools,
  });
  const mountedToolByName = new Map(
    params.mountedTools.map((tool) => [tool.runtime_tool_name, tool]),
  );
  const ownsWorkspaceSession = !params.initialWorkspaceSession;
  let workspaceSession = params.initialWorkspaceSession ?? null;
  let workspaceSessionFailure: {
    status: number;
    code: string;
    message: string;
  } | null = null;
  const runtimeTerminalSessionIds = new Set<string>();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatInFlight = false;

  const ensureWorkspaceHeartbeat = () => {
    if (!params.touchRunHeartbeat || !workspaceSession || heartbeatTimer) return;
    const touchRunHeartbeat = params.touchRunHeartbeat;
    heartbeatTimer = setInterval(() => {
      if (!workspaceSession || heartbeatInFlight) return;
      heartbeatInFlight = true;
      void Promise.resolve(touchRunHeartbeat())
        .catch(() => {})
        .finally(() => {
          heartbeatInFlight = false;
        });
    }, WORKSPACE_RUN_HEARTBEAT_INTERVAL_MS);
  };

  if (workspaceSession) ensureWorkspaceHeartbeat();

  const emitRunEvent = async (
    eventType: string,
    payload: Record<string, unknown>,
    eventKey?: string,
  ): Promise<void> => {
    try {
      await params.appendRunEvent({
        eventType,
        eventKey,
        payload,
      });
    } catch {
      // Best-effort runtime evidence only.
    }
  };

  const enrichComputerUseToolResult = async (paramsForEnrich: {
    toolName: RetrievalToolName;
    toolResult: NativeToolExecutionResult;
  }): Promise<NativeToolExecutionResult> => {
    if (!isComputerUseToolName(paramsForEnrich.toolName)) {
      return paramsForEnrich.toolResult;
    }
    const existingDetails =
      paramsForEnrich.toolResult.details &&
      typeof paramsForEnrich.toolResult.details === "object" &&
      !Array.isArray(paramsForEnrich.toolResult.details)
        ? {
            ...(paramsForEnrich.toolResult.details as Record<string, unknown>),
          }
        : {};
    const existingComputerUseDetails =
      existingDetails.computer_use &&
      typeof existingDetails.computer_use === "object" &&
      !Array.isArray(existingDetails.computer_use)
        ? { ...(existingDetails.computer_use as Record<string, unknown>) }
        : {};
    const { summary, imageUrl } = extractComputerUseObservation(
      paramsForEnrich.toolResult.observationContent,
    );
    const computerUseDetails: Record<string, unknown> = {
      ...existingComputerUseDetails,
      action: paramsForEnrich.toolName,
      summary:
        summary ||
        (typeof paramsForEnrich.toolResult.outputText === "string" &&
        paramsForEnrich.toolResult.outputText.trim()
          ? paramsForEnrich.toolResult.outputText.trim()
          : null),
    };
    if (isInlineImageDataUrl(imageUrl)) {
      const { blob, mimeType } = dataUrlToBlob(imageUrl);
      const storageId = await params.ctx.storage.store(blob);
      const frameUrl = await params.ctx.storage.getUrl(storageId);
      computerUseDetails.frame_storage_id =
        String(storageId ?? "").trim() || null;
      computerUseDetails.frame_url = frameUrl ?? null;
      computerUseDetails.frame_mime_type = mimeType;
    }
    return {
      ...paramsForEnrich.toolResult,
      details: {
        ...existingDetails,
        computer_use: computerUseDetails,
      },
    };
  };

  const requireSessionOwnedTerminalRow = async (
    terminalSessionId: string,
  ): Promise<
    | { ok: true; row: any }
    | { ok: false; status: number; code: string; message: string }
  > => {
    const normalizedTerminalSessionId = String(terminalSessionId ?? "").trim();
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
      String(row.ownerId ?? "") !== String(params.userId ?? "") ||
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
  };

  const reconcileSessionOwnedTerminalRow = async (paramsForReconcile: {
    row: any;
    session: WorkspaceSandboxSession;
  }): Promise<Record<string, unknown>> => {
    const row = paramsForReconcile.row;
    const activeWorkspaceSession = paramsForReconcile.session;
    if (!isTerminalActiveStatus(row.status)) return summarizeTerminalRow(row);
    if (
      String(row.providerSandboxId ?? "").trim() !==
      activeWorkspaceSession.providerSandboxId
    ) {
      return summarizeTerminalRow(row);
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
      return summarizeTerminalRow(patched ?? row);
    };

    const providerSessionId = String(row.providerSessionId ?? "").trim();
    const providerCommandId = String(row.providerCommandId ?? "").trim();
    const processSession = await getDaytonaProcessSession({
      config: activeWorkspaceSession.config,
      toolboxProxyUrl: activeWorkspaceSession.toolboxProxyUrl,
      sandboxId: activeWorkspaceSession.providerSandboxId,
      sessionId: providerSessionId,
    });
    if (!processSession.ok) {
      return isConfirmedProcessSessionGone(processSession)
        ? await markFailed()
        : summarizeTerminalRow(row);
    }

    const command = findDaytonaProcessSessionCommand(
      processSession.session,
      providerCommandId,
    );
    if (!command) return await markFailed();

    const logs = await getDaytonaProcessSessionCommandLogs({
      config: activeWorkspaceSession.config,
      toolboxProxyUrl: activeWorkspaceSession.toolboxProxyUrl,
      sandboxId: activeWorkspaceSession.providerSandboxId,
      sessionId: providerSessionId,
      commandId: providerCommandId,
    });
    const exitCode = readDaytonaProcessSessionCommandExitCode(command);
    if (!logs.ok && exitCode === null) return summarizeTerminalRow(row);

    const nextStatus: RuntimeWorkspaceTerminalStatus =
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
        config: activeWorkspaceSession.config,
        toolboxProxyUrl: activeWorkspaceSession.toolboxProxyUrl,
        sandboxId: activeWorkspaceSession.providerSandboxId,
        sessionId: providerSessionId,
      });
    }

    return summarizeTerminalRow(patched ?? row);
  };

  const stopSessionOwnedTerminalRow = async (paramsForStop: {
    row: any;
    session: WorkspaceSandboxSession | null;
  }): Promise<Record<string, unknown>> => {
    const row = paramsForStop.row;
    const activeWorkspaceSession = paramsForStop.session;
    if (!isTerminalActiveStatus(row.status)) {
      return summarizeTerminalRow(row);
    }
    if (
      activeWorkspaceSession &&
      String(row.providerSandboxId ?? "").trim() ===
        activeWorkspaceSession.providerSandboxId
    ) {
      await deleteDaytonaProcessSession({
        config: activeWorkspaceSession.config,
        toolboxProxyUrl: activeWorkspaceSession.toolboxProxyUrl,
        sandboxId: activeWorkspaceSession.providerSandboxId,
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
    return summarizeTerminalRow(patched ?? row);
  };

  return {
    buildPromptSuffix(): string {
      return String(params.mountedPromptSuffix ?? "");
    },
    hasWorkspaceSession(): boolean {
      return workspaceSession !== null && workspaceSessionFailure === null;
    },
    getWorkspaceSession(): WorkspaceSandboxSession | null {
      return workspaceSessionFailure ? null : workspaceSession;
    },
    async createWorkspaceSession(paramsForCreate?: {
      toolName?: string | null;
    }) {
      if (workspaceSession) {
        if (workspaceSessionFailure) {
          return {
            ok: false as const,
            status: workspaceSessionFailure.status,
            code: workspaceSessionFailure.code,
            message: workspaceSessionFailure.message,
          };
        }
        return {
          ok: true as const,
          session: workspaceSession,
        };
      }
      const authSubject = String(params.authSubject ?? "").trim();
      const projectId = String(params.projectId ?? "").trim();
      if (!authSubject || !projectId) {
        return {
          ok: false as const,
          status: 400,
          code: "project_required",
          message: "Workspace session requires a bound project workspace.",
        };
      }
      const createStartedAt = Date.now();
      await emitRunEvent(
        "workspace_session_create_started",
        {
          run_id: params.runId,
          project_id: projectId,
          tool_name: String(paramsForCreate?.toolName ?? "").trim() || null,
        },
        `${params.runId}:workspace_session_create_started:1`,
      );
      const created = await createWorkspaceSandboxSession({
        ctx: params.ctx,
        userId: params.userId,
        authSubject,
        projectId,
        runId: params.runId,
      });
      if (created.ok) {
        workspaceSessionFailure = null;
        workspaceSession = created.session;
        ensureWorkspaceHeartbeat();
        try {
          await params.appendRunEvent({
            eventType: "workspace_session_created",
            eventKey: `${params.runId}:workspace_session_created:1`,
            payload: {
              run_id: params.runId,
              sandbox_id: created.session.providerSandboxId,
              region: created.session.region,
              project_id: projectId,
              toolbox_proxy_url: created.session.toolboxProxyUrl,
            },
          });
          await params.appendRunEvent({
            eventType: "sandbox_started",
            eventKey: `${params.runId}:workspace_sandbox_started:1`,
            payload: {
              run_id: params.runId,
              sandbox_id: created.session.providerSandboxId,
              region: created.session.region,
              project_id: projectId,
            },
          });
          await params.ctx.runMutation(
            internal.threads.setCloudRuntimeRunWorkspaceSessionInternal as any,
            {
              ownerId: params.userId,
              runId: params.runId,
              state: "active",
              providerSandboxId: created.session.providerSandboxId,
              toolboxProxyUrl: created.session.toolboxProxyUrl,
              region: created.session.region ?? undefined,
            },
          );
        } catch {
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
          }
          await emitRunEvent(
            "workspace_session_state_persist_failed",
            {
              run_id: params.runId,
              sandbox_id: created.session.providerSandboxId,
              project_id: projectId,
              latency_ms: Date.now() - createStartedAt,
            },
            `${params.runId}:workspace_session_state_persist_failed:1`,
          );
          workspaceSessionFailure = {
            status: 500,
            code: "workspace_session_persist_failed",
            message:
              "Failed to persist workspace session metadata.",
          };
          await emitRunEvent(
            "workspace_session_create_completed",
            {
              run_id: params.runId,
              project_id: projectId,
              tool_name: String(paramsForCreate?.toolName ?? "").trim() || null,
              latency_ms: Date.now() - createStartedAt,
              status: "error",
              code: workspaceSessionFailure.code,
              sandbox_id: created.session.providerSandboxId,
            },
            `${params.runId}:workspace_session_create_completed:error`,
          );
          return {
            ok: false as const,
            status: workspaceSessionFailure.status,
            code: workspaceSessionFailure.code,
            message: workspaceSessionFailure.message,
          };
        }
        await emitRunEvent(
          "workspace_session_create_completed",
          {
            run_id: params.runId,
            project_id: projectId,
            tool_name: String(paramsForCreate?.toolName ?? "").trim() || null,
            latency_ms: Date.now() - createStartedAt,
            status: "ok",
            sandbox_id: created.session.providerSandboxId,
            region: created.session.region ?? null,
          },
          `${params.runId}:workspace_session_create_completed:ok`,
        );
      }
      return created;
    },
    async ensureWorkspaceForTool(paramsForEnsure?: {
      toolName?: RetrievalToolName | string | null;
    }) {
      return await this.createWorkspaceSession({
        toolName: paramsForEnsure?.toolName ?? null,
      });
    },
    async dispose(): Promise<void> {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      let finalWorkspaceState: "released" | "failed" =
        workspaceSessionFailure ? "failed" : "released";
      if (workspaceSession) {
        if (ownsWorkspaceSession) {
          for (const terminalSessionId of runtimeTerminalSessionIds) {
            try {
              const loaded = await requireSessionOwnedTerminalRow(terminalSessionId);
              if (loaded.ok) {
                await stopSessionOwnedTerminalRow({
                  row: loaded.row,
                  session: workspaceSession,
                });
              }
            } catch {
              // Best-effort terminal process cleanup before sandbox teardown.
            }
          }
          const cleanupStartedAt = Date.now();
          let cleanupResult:
            | Awaited<ReturnType<typeof cleanupWorkspaceSandboxSession>>
            | null = null;
          try {
            cleanupResult = await cleanupWorkspaceSandboxSession({
              ctx: params.ctx,
              userId: params.userId,
              session: workspaceSession,
              runId: params.runId,
              projectId: String(
                params.projectId ?? workspaceSession.projectId ?? "",
              ).trim(),
              appendRunEvent: params.appendRunEvent,
            });
            if (!cleanupResult.ok) {
              finalWorkspaceState = "failed";
            }
          } catch {
            finalWorkspaceState = "failed";
          }
          await emitRunEvent(
            "workspace_session_cleanup_completed",
            {
              run_id: params.runId,
              sandbox_id: workspaceSession.providerSandboxId,
              project_id: String(
                params.projectId ?? workspaceSession.projectId ?? "",
              ).trim(),
              latency_ms: Date.now() - cleanupStartedAt,
              final_state: finalWorkspaceState,
              stop_status: cleanupResult?.stopStatus ?? "error",
              stop_code: cleanupResult?.stopCode ?? "cleanup_failed",
              delete_status: cleanupResult?.deleteStatus ?? "error",
              delete_code: cleanupResult?.deleteCode ?? "cleanup_failed",
              charge_recorded: cleanupResult?.chargeRecorded ?? false,
            },
            `${params.runId}:workspace_session_cleanup_completed:1`,
          );
        }
        try {
          await params.ctx.runMutation(
            internal.threads.setCloudRuntimeRunWorkspaceSessionInternal as any,
            {
              ownerId: params.userId,
              runId: params.runId,
              state: finalWorkspaceState,
              providerSandboxId: workspaceSession.providerSandboxId,
              toolboxProxyUrl: workspaceSession.toolboxProxyUrl,
              region: workspaceSession.region ?? undefined,
            },
          );
        } catch {
          // Best-effort fail-closed state transition for live desktop discovery.
        }
      }
    },
    buildProviderTools<TFixedToolName extends string, TOpenAiTool, TResponsesTool>(params: {
      allowedToolNames: readonly TFixedToolName[];
      buildFixedOpenAiTools: (
        allowedToolNames: readonly TFixedToolName[],
      ) => TOpenAiTool[];
      buildFixedResponsesTools: (
        allowedToolNames: readonly TFixedToolName[],
      ) => TResponsesTool[];
      buildMountedOpenAiTools: (
        mountedTools: RuntimeMountedMcpTool[],
      ) => TOpenAiTool[];
      buildMountedResponsesTools: (
        mountedTools: RuntimeMountedMcpTool[],
      ) => TResponsesTool[];
      buildResolverOpenAiTool: () => TOpenAiTool;
      buildResolverResponsesTool: () => TResponsesTool;
    }): {
      openAiTools: TOpenAiTool[];
      responsesTools: TResponsesTool[];
      activeToolNames: string[];
    } {
      const exposedMountedTools = mountedToolExposureState.getExposedTools();
      const includeResolver = mountedToolExposureState.hasMountedTools();
      return {
        openAiTools: [
          ...params.buildFixedOpenAiTools(params.allowedToolNames),
          ...(includeResolver ? [params.buildResolverOpenAiTool()] : []),
          ...params.buildMountedOpenAiTools(exposedMountedTools),
        ],
        responsesTools: [
          ...params.buildFixedResponsesTools(params.allowedToolNames),
          ...(includeResolver ? [params.buildResolverResponsesTool()] : []),
          ...params.buildMountedResponsesTools(exposedMountedTools),
        ],
        activeToolNames: [
          ...params.allowedToolNames,
          ...(includeResolver ? [RESOLVE_MOUNTED_TOOLS_TOOL_NAME] : []),
          ...exposedMountedTools.map((tool) => tool.runtime_tool_name),
        ],
      };
    },
    normalizeToolArguments<TFixedToolName extends string>(params: {
      toolName: string;
      rawArgs: Record<string, unknown> | null | undefined;
      allowedToolNames: readonly TFixedToolName[];
      normalizeFixedToolArguments: (
        toolName: TFixedToolName,
        rawArgs: Record<string, unknown>,
      ) => Record<string, unknown>;
    }): Record<string, unknown> {
      if (params.toolName === RESOLVE_MOUNTED_TOOLS_TOOL_NAME) {
        return normalizeResolveMountedToolsArguments(params.rawArgs);
      }
      if (params.allowedToolNames.includes(params.toolName as TFixedToolName)) {
        return params.normalizeFixedToolArguments(
          params.toolName as TFixedToolName,
          params.rawArgs && typeof params.rawArgs === "object"
            ? params.rawArgs
            : {},
        );
      }
      return params.rawArgs &&
        typeof params.rawArgs === "object" &&
        !Array.isArray(params.rawArgs)
        ? params.rawArgs
        : {};
    },
    getMountedTool(runtimeToolName: string): RuntimeMountedMcpTool | null {
      return mountedToolByName.get(runtimeToolName) ?? null;
    },
    resolveMountedToolExposure(
      normalizedArgs: ReturnType<typeof normalizeResolveMountedToolsArguments>,
    ) {
      return mountedToolExposureState.resolve(normalizedArgs);
    },
    async executeMountedTool(params: {
      runtimeToolName: string;
      argumentsObject: Record<string, unknown>;
      signal?: AbortSignal;
    }) {
      return await runtimeMcpManager.execute(params);
    },
    async executeTerminalTool(paramsForTool: {
      toolName: TerminalToolName | string;
      normalizedArgs: Record<string, unknown>;
    }): Promise<NativeToolExecutionResult> {
      if (!isTerminalToolName(paramsForTool.toolName)) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "invalid_tool_name",
          errorMessage: `${paramsForTool.toolName} is not a terminal tool.`,
        };
      }
      const authSubject = String(params.authSubject ?? "").trim();
      const projectId = String(params.projectId ?? "").trim();
      if (
        paramsForTool.toolName === "terminal_start" &&
        (!projectId || !authSubject)
      ) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "project_required",
          errorMessage: `${paramsForTool.toolName} requires a bound project workspace.`,
        };
      }
      if (
        (paramsForTool.toolName === "terminal_read" ||
          paramsForTool.toolName === "terminal_write" ||
          paramsForTool.toolName === "terminal_stop") &&
        !authSubject
      ) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "auth_required",
          errorMessage: `${paramsForTool.toolName} requires an authenticated workspace run.`,
        };
      }

      const terminalStartedAt = Date.now();
      try {
        let payload: Record<string, unknown> | null = null;
        if (paramsForTool.toolName === "terminal_start") {
          let normalizedCwd: string | null = null;
          let normalizedPreviewPort: number | null = null;
          let normalizedPreviewPath: string | null = null;
          let normalizedPreviewLabel: string | null = null;
          try {
            normalizedCwd = normalizeRelativeWorkspaceCwd(
              paramsForTool.normalizedArgs.cwd,
            );
            normalizedPreviewPort = normalizePreviewPort(
              paramsForTool.normalizedArgs.preview_port,
            );
            normalizedPreviewPath = normalizePreviewPath(
              paramsForTool.normalizedArgs.preview_path,
            );
            normalizedPreviewLabel = normalizePreviewLabel(
              paramsForTool.normalizedArgs.preview_label,
            );
          } catch {
            payload = {
              ok: false,
              status: 400,
              code: "invalid_tool_args",
              message: "Terminal cwd or preview settings are invalid.",
            };
          }
          if (!payload) {
            const createdWorkspace = await this.ensureWorkspaceForTool({
              toolName: paramsForTool.toolName,
            });
            if (!createdWorkspace.ok) {
              payload = {
                ok: false,
                status: createdWorkspace.status,
                code: createdWorkspace.code,
                message: createdWorkspace.message,
              };
            } else {
              const activeWorkspaceSession = createdWorkspace.session;
              const providerSessionId = buildRuntimeTerminalSessionId();
              const processSession = await createDaytonaProcessSession({
                config: activeWorkspaceSession.config,
                toolboxProxyUrl: activeWorkspaceSession.toolboxProxyUrl,
                sandboxId: activeWorkspaceSession.providerSandboxId,
                sessionId: providerSessionId,
              });
              if (!processSession.ok) {
                payload = {
                  ok: false,
                  status: processSession.status,
                  code: processSession.code,
                  message: processSession.message,
                };
              } else {
                const workspaceCwd = resolveWorkspaceCwd(normalizedCwd);
                const executed = await executeDaytonaProcessSessionCommand({
                  config: activeWorkspaceSession.config,
                  toolboxProxyUrl: activeWorkspaceSession.toolboxProxyUrl,
                  sandboxId: activeWorkspaceSession.providerSandboxId,
                  sessionId: processSession.sessionId,
                  command: normalizeRuntimeTerminalCommand(
                    String(paramsForTool.normalizedArgs.command ?? ""),
                    workspaceCwd,
                  ),
                  cwd: workspaceCwd,
                  runAsync: true,
                });
                if (!executed.ok) {
                  await deleteDaytonaProcessSession({
                    config: activeWorkspaceSession.config,
                    toolboxProxyUrl: activeWorkspaceSession.toolboxProxyUrl,
                    sandboxId: activeWorkspaceSession.providerSandboxId,
                    sessionId: processSession.sessionId,
                  });
                  payload = {
                    ok: false,
                    status: executed.status,
                    code: executed.code,
                    message: executed.message,
                  };
                } else {
                  const nowMs = Date.now();
                  const createdRow = await params.ctx.runMutation(
                    internal.workspaceTerminals
                      .createWorkspaceTerminalSessionInternal as any,
                    {
                      ownerId: params.userId,
                      projectId,
                      runIdStartedBy: params.runId,
                      providerSandboxId:
                        activeWorkspaceSession.providerSandboxId,
                      providerSessionId: processSession.sessionId,
                      providerCommandId: executed.commandId,
                      command: String(
                        paramsForTool.normalizedArgs.command ?? "",
                      ),
                      cwd: normalizedCwd ?? undefined,
                      previewPort: normalizedPreviewPort ?? undefined,
                      previewPath: normalizedPreviewPath ?? undefined,
                      previewLabel: normalizedPreviewLabel ?? undefined,
                      status: "running",
                      startedAt: nowMs,
                      updatedAt: nowMs,
                      lastOutputTail: truncateTerminalOutputTail(
                        executed.outputText || "",
                      ),
                    },
                  );
                  const terminalSessionId = String(
                    createdRow?._id ?? "",
                  ).trim();
                  if (terminalSessionId) {
                    runtimeTerminalSessionIds.add(terminalSessionId);
                  }
                  payload = {
                    ok: true,
                    terminal_session_id: terminalSessionId,
                    provider_session_id: processSession.sessionId,
                    reused_existing: false,
                    ...summarizeTerminalRow(createdRow),
                  };
                }
              }
            }
          }
        } else {
          const loaded = await requireSessionOwnedTerminalRow(
            String(paramsForTool.normalizedArgs.terminal_session_id ?? "").trim(),
          );
          if (!loaded.ok) {
            payload = loaded;
          } else {
            const activeWorkspaceSession = workspaceSessionFailure
              ? null
              : workspaceSession;
            if (!activeWorkspaceSession) {
              payload = {
                ok: false,
                status: 409,
                code: "workspace_session_required",
                message:
                  "Runtime terminal is only available while its workspace session is active.",
              };
            } else if (paramsForTool.toolName === "terminal_read") {
              payload = {
                ok: true,
                ...(await reconcileSessionOwnedTerminalRow({
                  row: loaded.row,
                  session: activeWorkspaceSession,
                })),
              };
            } else if (paramsForTool.toolName === "terminal_write") {
              if (!isTerminalActiveStatus(loaded.row.status)) {
                payload = {
                  ok: false,
                  status: 409,
                  code: "terminal_not_running",
                  message: "Terminal is not running.",
                };
              } else {
                const sent = await sendDaytonaProcessSessionCommandInput({
                  config: activeWorkspaceSession.config,
                  toolboxProxyUrl: activeWorkspaceSession.toolboxProxyUrl,
                  sandboxId: activeWorkspaceSession.providerSandboxId,
                  sessionId: String(loaded.row.providerSessionId ?? "").trim(),
                  commandId: String(loaded.row.providerCommandId ?? "").trim(),
                  data: String(paramsForTool.normalizedArgs.input ?? ""),
                });
                if (!sent.ok) {
                  payload = {
                    ok: false,
                    status: sent.status,
                    code: sent.code,
                    message: sent.message,
                  };
                } else {
                  const patched = await params.ctx.runMutation(
                    internal.workspaceTerminals
                      .updateWorkspaceTerminalSessionInternal as any,
                    {
                      terminalSessionId: loaded.row._id,
                      updatedAt: Date.now(),
                    },
                  );
                  payload = {
                    ok: true,
                    ...summarizeTerminalRow(patched ?? loaded.row),
                  };
                }
              }
            } else {
              payload = {
                ok: true,
                ...(await stopSessionOwnedTerminalRow({
                  row: loaded.row,
                  session: activeWorkspaceSession,
                })),
              };
            }
          }
        }
        if (!payload) {
          payload = {
            ok: false,
            status: 500,
            code: "terminal_operation_failed",
            message: "Terminal operation failed.",
          };
        }
        const ok = Boolean((payload as { ok?: boolean } | null)?.ok);
        if (!ok) {
          await emitRunEvent("terminal_tool_completed", {
            run_id: params.runId,
            tool_name: paramsForTool.toolName,
            latency_ms: Date.now() - terminalStartedAt,
            status: "error",
            terminal_session_id:
              typeof (payload as Record<string, unknown> | null)?.terminal_session_id ===
              "string"
                ? (payload as Record<string, unknown>).terminal_session_id
                : null,
          });
          return {
            status: "error",
            exitCode: null,
            outputText: formatToolOutput(paramsForTool.toolName, payload),
            errorCode: String(
              (payload as { code?: unknown } | null)?.code ??
                "terminal_operation_failed",
            ),
            errorMessage: String(
              (payload as { message?: unknown } | null)?.message ??
                "Terminal operation failed.",
            ),
          };
        }
        await emitRunEvent("terminal_tool_completed", {
          run_id: params.runId,
          tool_name: paramsForTool.toolName,
          latency_ms: Date.now() - terminalStartedAt,
          status: "ok",
          terminal_session_id:
            payload &&
            typeof payload === "object" &&
            !Array.isArray(payload) &&
            typeof (payload as Record<string, unknown>).terminal_session_id ===
              "string"
              ? (payload as Record<string, unknown>).terminal_session_id
              : null,
        });
        return {
          status: "ok",
          exitCode: 0,
          outputText: formatToolOutput(paramsForTool.toolName, payload),
          errorCode: null,
          errorMessage: null,
          details:
            paramsForTool.toolName === "terminal_start" &&
            payload &&
            typeof payload === "object" &&
            !Array.isArray(payload)
              ? {
                  terminal_session_id:
                    typeof (payload as Record<string, unknown>)
                      .terminal_session_id === "string"
                      ? (payload as Record<string, unknown>).terminal_session_id
                      : null,
                  status:
                    typeof (payload as Record<string, unknown>).status ===
                    "string"
                      ? (payload as Record<string, unknown>).status
                      : null,
                  command:
                    typeof (payload as Record<string, unknown>).command ===
                    "string"
                      ? (payload as Record<string, unknown>).command
                      : null,
                  cwd:
                    typeof (payload as Record<string, unknown>).cwd === "string"
                      ? (payload as Record<string, unknown>).cwd
                      : null,
                  preview_port:
                    typeof (payload as Record<string, unknown>)
                      .preview_port === "number"
                      ? (payload as Record<string, unknown>).preview_port
                      : null,
                  preview_path:
                    typeof (payload as Record<string, unknown>)
                      .preview_path === "string"
                      ? (payload as Record<string, unknown>).preview_path
                      : null,
                  preview_label:
                    typeof (payload as Record<string, unknown>)
                      .preview_label === "string"
                      ? (payload as Record<string, unknown>).preview_label
                      : null,
                  output_tail:
                    typeof (payload as Record<string, unknown>).output_tail ===
                    "string"
                      ? (payload as Record<string, unknown>).output_tail
                      : null,
                }
              : null,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await emitRunEvent("terminal_tool_completed", {
          run_id: params.runId,
          tool_name: paramsForTool.toolName,
          latency_ms: Date.now() - terminalStartedAt,
          status: "error",
          error_message: message || "Terminal operation failed.",
        });
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "terminal_operation_failed",
          errorMessage: message || "Terminal operation failed.",
        };
      }
    },
    async getTerminalPreview(paramsForPreview: {
      terminalSessionId: string;
    }): Promise<unknown> {
      const previewStartedAt = Date.now();
      const authSubject = String(params.authSubject ?? "").trim();
      if (!authSubject) {
        await emitRunEvent("terminal_preview_lookup_completed", {
          run_id: params.runId,
          terminal_session_id: paramsForPreview.terminalSessionId,
          latency_ms: Date.now() - previewStartedAt,
          status: "error",
          code: "auth_required",
        });
        return {
          ok: false,
          status: 401,
          code: "auth_required",
          message: "Preview access requires an authenticated workspace run.",
        };
      }
      const loaded = await requireSessionOwnedTerminalRow(
        paramsForPreview.terminalSessionId,
      );
      let result: Record<string, unknown>;
      if (!loaded.ok) {
        result = loaded;
      } else {
        const activeWorkspaceSession = workspaceSessionFailure
          ? null
          : workspaceSession;
        const previewPort =
          typeof loaded.row.previewPort === "number"
            ? Math.floor(loaded.row.previewPort)
            : null;
        if (!activeWorkspaceSession) {
          result = {
            ok: false,
            status: 409,
            code: "workspace_session_required",
            message:
              "Runtime preview is only available while its workspace session is active.",
          };
        } else if (!previewPort) {
          result = {
            ok: false,
            status: 409,
            code: "preview_not_enabled",
            message: "This runtime terminal does not expose an app preview.",
          };
        } else if (
          String(loaded.row.providerSandboxId ?? "").trim() !==
          activeWorkspaceSession.providerSandboxId
        ) {
          result = {
            ok: false,
            status: 409,
            code: "workspace_session_mismatch",
            message: "Preview terminal is not attached to this workspace session.",
          };
        } else {
          const signed = await getDaytonaSignedPreviewUrl({
            config: activeWorkspaceSession.config,
            sandboxId: activeWorkspaceSession.providerSandboxId,
            port: previewPort,
            expiresInSeconds: 3600,
          });
          if (!signed.ok) {
            result = signed;
          } else {
            const previewProxyToken = await mintPreviewProxySessionToken({
              kind: "workspace_preview",
              previewUrl: signed.url,
              previewToken: signed.token,
              expiresAtMs: Date.now() + 3600 * 1000,
            });
            if (!previewProxyToken.ok) {
              result = {
                ok: false,
                status: 503,
                code: previewProxyToken.code,
                message: previewProxyToken.message,
              };
            } else {
              result = {
                ok: true,
                terminal_session_id: String(loaded.row._id ?? "").trim(),
                preview_port: previewPort,
                preview_url: signed.url,
                preview_proxy_token: previewProxyToken.token,
                preview_path: normalizeRuntimeOptionalString(
                  loaded.row.previewPath,
                ),
                preview_label: normalizeRuntimeOptionalString(
                  loaded.row.previewLabel,
                ),
                expires_in_seconds: 3600,
              };
            }
          }
        }
      }
      await emitRunEvent("terminal_preview_lookup_completed", {
        run_id: params.runId,
        terminal_session_id: paramsForPreview.terminalSessionId,
        latency_ms: Date.now() - previewStartedAt,
        status:
          Boolean(
            result &&
              typeof result === "object" &&
              !Array.isArray(result) &&
              (result as Record<string, unknown>).ok,
          )
            ? "ok"
            : "error",
      });
      return result;
    },
    async executeComputerTool(paramsForComputer: {
      toolName: RetrievalToolName | string;
      normalizedArgs: Record<string, unknown>;
      signal?: AbortSignal;
    }): Promise<NativeToolExecutionResult> {
      const computerStartedAt = Date.now();
      const hadWorkspaceSession = workspaceSession !== null;
      if (!isComputerUseToolName(paramsForComputer.toolName)) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "invalid_tool_name",
          errorMessage: `${paramsForComputer.toolName} is not a computer-use tool.`,
        };
      }
      let activeWorkspaceSession = workspaceSession;
      if (!activeWorkspaceSession) {
        const created = await this.ensureWorkspaceForTool({
          toolName: paramsForComputer.toolName,
        });
        if (!created.ok) {
          return {
            status: "error",
            exitCode: null,
            outputText: readFailureOutputPreview((created as any).details),
            errorCode: created.code,
            errorMessage: created.message,
          };
        }
        activeWorkspaceSession = created.session;
      }
      const computerResult = await runDaytonaComputerUseTool({
        config: activeWorkspaceSession.config,
        toolboxProxyUrl: activeWorkspaceSession.toolboxProxyUrl,
        sandboxId: activeWorkspaceSession.providerSandboxId,
        toolName: paramsForComputer.toolName,
        args: paramsForComputer.normalizedArgs,
        signal: paramsForComputer.signal,
      });
      const enriched = await enrichComputerUseToolResult({
        toolName: paramsForComputer.toolName,
        toolResult: computerResult,
      });
      await emitRunEvent("computer_tool_completed", {
        run_id: params.runId,
        tool_name: paramsForComputer.toolName,
        latency_ms: Date.now() - computerStartedAt,
        status: enriched.status,
        used_existing_workspace: hadWorkspaceSession,
        sandbox_id: activeWorkspaceSession.providerSandboxId,
      });
      return enriched;
    },
  };
}
