import { internal } from "./_generated/api";
import {
  buildBlaxelTerminalProcessContextFromRow,
  normalizeWorkspaceTerminalStartArgs,
  readWorkspaceTerminalProcess,
  readWorkspaceToolFailureOutputPreview,
  startWorkspaceTerminalProcess,
  stopWorkspaceTerminalProcess,
  summarizeWorkspaceTerminalRow,
  writeWorkspaceTerminalProcessInput,
} from "./workspaceTerminalProcessCore";
import {
  releaseBlaxelWorkspaceComputerIfIdle,
} from "./blaxelWorkspaceComputerProvider.ts";
import {
  createRuntimeSandboxSession,
  releaseRuntimeWorkspaceSessionAccountingIfCurrent,
  settleRuntimeWorkspaceSession,
  type RuntimeWorkspaceSession,
} from "./workspaceRuntimeSession.ts";
import {
  buildWorkspaceCreditBudgetSignal,
  isWorkspaceCreditBudgetExpired,
} from "./workspaceCreditBudgetSignal.ts";
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
import {
  buildToolObservationMessage,
  type NativeToolAwareMessage,
} from "../shared/nativeToolProtocol";
import type { NativeToolExecutionResult } from "../shared/nativeToolLoop";
import {
  type RetrievalToolName,
  isComputerUseToolName,
} from "../shared/retrievalTools";
import {
  buildRuntimeToolPolicySurface,
  type RuntimeToolPolicy,
  type RuntimeToolPolicySummary,
} from "../shared/runtimeToolPolicy";

const WORKSPACE_RUN_HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;
const WORKSPACE_SESSION_STATE_PERSIST_MAX_ATTEMPTS = 3;
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

export type ActiveDaytonaRuntimeSubstrateForTools = {
  provider: "daytona";
  targetId: string | null;
  runId: string | null;
  sandboxId: string | null;
  workspaceRoot: string | null;
  activePreviewPorts: number[];
  previewLeaseActive: boolean;
  previewStartAvailable?: boolean;
};

function isTerminalToolName(toolName: string): toolName is TerminalToolName {
  return TERMINAL_TOOL_NAMES.has(toolName as TerminalToolName);
}

function normalizeInferredDaytonaPreviewPort(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const port = Math.floor(parsed);
  return port >= 3000 && port <= 9999 ? port : null;
}

function inferDaytonaPreviewPortFromCommand(command: string): number {
  const normalized = String(command ?? "");
  const explicitPatterns = [
    /\b(?:PORT|VITE_PORT|NEXT_PORT)=["']?(\d{2,5})\b/i,
    /\b--port(?:=|\s+)(\d{2,5})\b/i,
    /\b-p\s+(\d{2,5})\b/i,
    /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})\b/i,
  ];
  for (const pattern of explicitPatterns) {
    const match = normalized.match(pattern);
    const port = normalizeInferredDaytonaPreviewPort(match?.[1]);
    if (port !== null) return port;
  }

  const pythonHttpServer = normalized.match(
    /\b(?:python3?|python)\s+-m\s+http\.server(?:\s+(\d{2,5}))?\b/i,
  );
  if (pythonHttpServer) {
    return normalizeInferredDaytonaPreviewPort(pythonHttpServer[1]) ?? 8000;
  }

  if (/\b(?:vite|vite\s+--host|npm\s+run\s+dev|pnpm\s+dev|yarn\s+dev)\b/i.test(normalized)) {
    return 5173;
  }
  if (/\bastro\b/i.test(normalized)) return 4321;
  return 3000;
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
  if (record?.ok === false) {
    const message = String(record.message ?? "Background terminal failed to start.").trim();
    const outputTail = String(record.output_tail ?? "").trim();
    return [
      message || "Background terminal failed to start.",
      outputTail ? `Output:\n${outputTail}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }
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

function buildTerminalToolResultDetails(
  payload: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!payload) return null;
  const details: Record<string, unknown> = {};
  for (const key of [
    "terminal_session_id",
    "status",
    "lifecycle_owner",
    "command",
    "cwd",
    "preview_port",
    "preview_path",
    "preview_label",
    "preview_status",
    "preview_transport_status",
    "preview_inspection_status",
    "preview_render_status",
    "health_status",
    "health_summary",
    "last_heartbeat_at",
    "last_preview_probe_summary",
    "last_browser_observation_summary",
    "provider_sandbox_provider_id",
    "exit_code",
    "output_tail",
    "code",
    "message",
    "tool_kind",
    "required_credits",
    "provider_id",
    "target_run_id",
    "target_id",
    "sandbox_id",
    "stopped_preview_ports",
    "stopped_process_ids",
    "teardown_state",
    "teardown_reason",
  ]) {
    const value = payload[key];
    if (value !== undefined && value !== null && value !== "") {
      details[key] = value;
    }
  }
  return Object.keys(details).length > 0 ? details : null;
}

function buildTerminalProcessContextFromWorkspaceSession(
  session: RuntimeWorkspaceSession,
) {
  return {
    providerId: "blaxel" as const,
    providerSandboxId: session.providerSandboxId,
    workspaceRoot: session.workspaceRoot,
  };
}

async function requireRuntimeAccessibleTerminalRow(params: {
  ctx: any;
  ownerId: any;
  projectId: string;
  runId: string;
  terminalSessionId: string;
}): Promise<
  | { ok: true; row: any }
  | { ok: false; status: number; code: string; message: string }
> {
  const row = await params.ctx.runQuery(
    internal.workspaceTerminals.getWorkspaceTerminalSessionInternal as any,
    {
      terminalSessionId: params.terminalSessionId as any,
    },
  );
  if (
    !row ||
    String(row.ownerId ?? "") !== String(params.ownerId ?? "") ||
    String(row.projectId ?? "") !== params.projectId
  ) {
    return {
      ok: false,
      status: 404,
      code: "terminal_not_found",
      message: "Terminal session not found.",
    };
  }
  return {
    ok: true,
    row,
  };
}

export function createPolynetExecutionSession(params: {
  ctx: any;
  userId: any;
  authSubject?: string | null;
  projectId?: string | null;
  threadId?: string | null;
  runId: string;
  mountedTools: RuntimeMountedMcpTool[];
  mountedToolDiscoveryCatalog?: RuntimeMountedMcpTool[] | null;
  mountedPromptSuffix?: string | null;
  initialWorkspaceSession?: RuntimeWorkspaceSession | null;
  activeDaytonaRuntimeSubstrate?: ActiveDaytonaRuntimeSubstrateForTools | null;
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
    discoveryCatalog: params.mountedToolDiscoveryCatalog ?? null,
  });
  const mountedToolByName = new Map(
    params.mountedTools.map((tool) => [tool.runtime_tool_name, tool]),
  );
  let workspaceSession = params.initialWorkspaceSession ?? null;
  let daytonaRuntimeSubstrate = params.activeDaytonaRuntimeSubstrate
    ? { ...params.activeDaytonaRuntimeSubstrate }
    : null;
  let daytonaRuntimeSubstrateUsed = false;
  let workspaceSessionFailure: {
    status: number;
    code: string;
    message: string;
    details?: Record<string, unknown> | null;
  } | null = null;
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

  const updateDaytonaRuntimeSubstrateFromPayload = (
    payload: Record<string, unknown> | null,
  ) => {
    if (!daytonaRuntimeSubstrate || !payload) return;
    daytonaRuntimeSubstrateUsed = true;
    const targetId = String(payload.target_id ?? "").trim();
    const runId = String(payload.target_run_id ?? payload.run_id ?? "").trim();
    const sandboxId = String(payload.sandbox_id ?? "").trim();
    const workspaceRoot = String(payload.workspace_root ?? "").trim();
    if (targetId) daytonaRuntimeSubstrate.targetId = targetId;
    if (runId) daytonaRuntimeSubstrate.runId = runId;
    if (sandboxId) daytonaRuntimeSubstrate.sandboxId = sandboxId;
    if (workspaceRoot) daytonaRuntimeSubstrate.workspaceRoot = workspaceRoot;
    const previewPort = Math.floor(Number(payload.preview_port ?? payload.port));
    if (Number.isFinite(previewPort) && previewPort > 0) {
      const ports = new Set(daytonaRuntimeSubstrate.activePreviewPorts);
      ports.add(previewPort);
      daytonaRuntimeSubstrate.activePreviewPorts = Array.from(ports);
      daytonaRuntimeSubstrate.previewLeaseActive = true;
    }
  };

  const persistWorkspaceSessionState = async (paramsForPersist: {
    state: "active" | "released" | "failed";
    session: RuntimeWorkspaceSession;
    projectId: string | null;
    phase: "create" | "dispose";
  }): Promise<{ ok: true } | { ok: false; attemptCount: number }> => {
    let attemptCount = 0;
    for (
      let attempt = 1;
      attempt <= WORKSPACE_SESSION_STATE_PERSIST_MAX_ATTEMPTS;
      attempt += 1
    ) {
      attemptCount = attempt;
      try {
        await params.ctx.runMutation(
          internal.threads.setCloudRuntimeRunWorkspaceSessionInternal as any,
          {
            ownerId: params.userId,
            runId: params.runId,
            state: paramsForPersist.state,
            providerSandboxId: paramsForPersist.session.providerSandboxId,
            toolboxProxyUrl: undefined,
            region: undefined,
          },
        );
        return { ok: true };
      } catch (error) {
        if (attempt >= WORKSPACE_SESSION_STATE_PERSIST_MAX_ATTEMPTS) {
          const message =
            error instanceof Error ? error.message : String(error ?? "");
          await emitRunEvent(
            "workspace_session_state_persist_failed",
            {
              run_id: params.runId,
              sandbox_id: paramsForPersist.session.providerSandboxId,
              project_id: paramsForPersist.projectId ?? null,
              sandbox_scope: paramsForPersist.session.kind,
              target_state: paramsForPersist.state,
              phase: paramsForPersist.phase,
              attempt_count: attemptCount,
              error_message: message || null,
            },
            `${params.runId}:workspace_session_state_persist_failed:${paramsForPersist.phase}:${paramsForPersist.state}`,
          );
          return {
            ok: false,
            attemptCount,
          };
        }
      }
    }
    return {
      ok: false,
      attemptCount,
    };
  };

  const resolveWorkspaceSessionAccountingReleaseDecision = async (
    session: RuntimeWorkspaceSession,
  ): Promise<{
    ok: boolean;
    shouldRelease: boolean;
    reason: string;
    activeTerminalCount?: number;
    checkedTerminalCount?: number;
    refreshedTerminalCount?: number;
    errorMessage?: string | null;
  }> => {
    try {
      const activeTerminalStatus = await params.ctx.runAction(
        internal.workspaceTerminals.refreshProjectSandboxActiveTerminalStatusInternal as any,
        {
          ownerId: params.userId,
          projectId: session.projectId,
          providerSandboxId: session.providerSandboxId,
        },
      ) as {
        hasActiveTerminal?: boolean;
        activeCount?: number;
        checkedCount?: number;
        refreshedCount?: number;
      } | null;
      const activeTerminalCount = Math.max(
        0,
        Number(activeTerminalStatus?.activeCount ?? 0) || 0,
      );
      const hasActiveTerminal =
        activeTerminalStatus?.hasActiveTerminal === true ||
        activeTerminalCount > 0;
      return {
        ok: true,
        shouldRelease: !hasActiveTerminal,
        reason: hasActiveTerminal
          ? "active_terminal_still_running"
          : "no_active_terminal_remaining",
        activeTerminalCount,
        checkedTerminalCount: Math.max(
          0,
          Number(activeTerminalStatus?.checkedCount ?? 0) || 0,
        ),
        refreshedTerminalCount: Math.max(
          0,
          Number(activeTerminalStatus?.refreshedCount ?? 0) || 0,
        ),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error ?? "");
      return {
        ok: false,
        shouldRelease: false,
        reason: "active_terminal_refresh_failed",
        errorMessage,
      };
    }
  };

  return {
    buildPromptSuffix(): string {
      return String(params.mountedPromptSuffix ?? "");
    },
    hasWorkspaceSession(): boolean {
      return workspaceSession !== null && workspaceSessionFailure === null;
    },
    getWorkspaceSession(): RuntimeWorkspaceSession | null {
      return workspaceSessionFailure ? null : workspaceSession;
    },
    getActiveDaytonaRuntimeSubstrate(): ActiveDaytonaRuntimeSubstrateForTools | null {
      return daytonaRuntimeSubstrate;
    },
    async executeDaytonaWorkspaceTool(paramsForTool: {
      toolName: RetrievalToolName | string;
      normalizedArgs: Record<string, unknown>;
    }): Promise<NativeToolExecutionResult> {
      if (daytonaRuntimeSubstrate?.provider !== "daytona") {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "daytona_workspace_unavailable",
          errorMessage: "Daytona workspace is not active for this run.",
        };
      }
      const threadId = String(params.threadId ?? "").trim();
      if (!threadId) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "thread_required",
          errorMessage: "Daytona workspace tools require a thread.",
        };
      }
      const payload = (await params.ctx.runAction(
        (internal as any).daytonaCodexRuntimeTargetActions
          .executeDaytonaWorkspaceToolInternal as any,
        {
          ownerId: params.userId,
          threadId: threadId as any,
          runId: params.runId,
          ...(params.projectId ? { projectId: params.projectId as any } : {}),
          toolName: paramsForTool.toolName,
          normalizedArgs: paramsForTool.normalizedArgs,
        },
      )) as Record<string, unknown>;
      updateDaytonaRuntimeSubstrateFromPayload(payload);
      if (payload?.ok !== true) {
        return {
          status: "error",
          exitCode:
            typeof payload?.exit_code === "number" &&
            Number.isFinite(payload.exit_code)
              ? Math.floor(payload.exit_code)
              : null,
          outputText: String(payload?.output_preview ?? ""),
          errorCode: String(payload?.code ?? "daytona_workspace_tool_failed"),
          errorMessage: String(payload?.message ?? "Daytona workspace tool failed."),
          details:
            payload && typeof payload === "object" && !Array.isArray(payload)
              ? payload
              : null,
        };
      }
      return {
        status: "ok",
        exitCode:
          typeof payload.exit_code === "number" && Number.isFinite(payload.exit_code)
            ? Math.floor(payload.exit_code)
            : 0,
        outputText: String(payload.output_text ?? "(no output)"),
        errorCode: null,
        errorMessage: null,
        details: payload,
      };
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
            details: workspaceSessionFailure.details ?? undefined,
          };
        }
        if (isWorkspaceCreditBudgetExpired(workspaceSession)) {
          workspaceSessionFailure = {
            status: 402,
            code: "workspace_credits_exhausted",
            message: "This workspace tool budget expired. Add balance to keep using workspace tools.",
            details: {
              tool_kind: "workspace_tools",
            },
          };
          return {
            ok: false as const,
            status: workspaceSessionFailure.status,
            code: workspaceSessionFailure.code,
            message: workspaceSessionFailure.message,
            details: workspaceSessionFailure.details ?? undefined,
          };
        }
        return {
          ok: true as const,
          session: workspaceSession,
        };
      }
      const projectId = String(params.projectId ?? "").trim();
      const source = projectId ? "project_background" : "project_required";
      const createStartedAt = Date.now();
      await emitRunEvent(
        "workspace_session_create_started",
        {
          run_id: params.runId,
          project_id: projectId || null,
          source,
          tool_name: String(paramsForCreate?.toolName ?? "").trim() || null,
          provider_id: null,
        },
        `${params.runId}:workspace_session_create_started:1`,
      );
      const createdWorkspace = await createRuntimeSandboxSession({
        ctx: params.ctx,
        authSubject: params.authSubject,
        userId: params.userId,
        projectId: projectId || null,
        threadId: params.threadId ?? null,
        runId: params.runId,
      });
      if (!createdWorkspace.ok) {
        await emitRunEvent(
          "workspace_session_create_completed",
          {
            run_id: params.runId,
            project_id: projectId || null,
            source,
            tool_name: String(paramsForCreate?.toolName ?? "").trim() || null,
            latency_ms: Date.now() - createStartedAt,
            status: "error",
            code: createdWorkspace.code,
            provider_id: null,
          },
          `${params.runId}:workspace_session_create_completed:error`,
        );
        workspaceSessionFailure = {
          status: createdWorkspace.status,
          code: createdWorkspace.code,
          message: createdWorkspace.message,
          details: ((createdWorkspace as { details?: Record<string, unknown> | null }).details ?? null),
        };
        return {
          ok: false as const,
          status: createdWorkspace.status,
          code: createdWorkspace.code,
          message: createdWorkspace.message,
          details: (createdWorkspace as { details?: unknown }).details,
        };
      }

      workspaceSessionFailure = null;
      workspaceSession = createdWorkspace.session;
      ensureWorkspaceHeartbeat();
      await emitRunEvent(
        "workspace_session_adopted",
        {
          run_id: params.runId,
          sandbox_id: workspaceSession.providerSandboxId,
          project_id: workspaceSession.projectId ?? null,
          source,
          sandbox_scope: workspaceSession.kind,
          provider_id: workspaceSession.providerId,
          toolbox_proxy_url: null,
        },
        `${params.runId}:workspace_session_adopted:${source}`,
      );
      const persisted = await persistWorkspaceSessionState({
        state: "active",
        session: workspaceSession,
        projectId: workspaceSession.projectId ?? null,
        phase: "create",
      });
      if (!persisted.ok) {
        workspaceSessionFailure = {
          status: 500,
          code: "workspace_session_persist_failed",
          message: "Failed to persist workspace session metadata.",
          details: null,
        };
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
          project_id: workspaceSession.projectId ?? null,
          source,
          sandbox_scope: workspaceSession.kind,
          tool_name: String(paramsForCreate?.toolName ?? "").trim() || null,
          latency_ms: Date.now() - createStartedAt,
          status: "ok",
          sandbox_id: workspaceSession.providerSandboxId,
          provider_id: workspaceSession.providerId,
          region: null,
        },
        `${params.runId}:workspace_session_create_completed:ok`,
      );
      return {
        ok: true as const,
        session: workspaceSession,
      };
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
      if (daytonaRuntimeSubstrateUsed && daytonaRuntimeSubstrate?.runId) {
        const targetRunId = String(daytonaRuntimeSubstrate.runId ?? "").trim();
        try {
          await params.ctx.runMutation(
            (internal as any).daytonaCodexRuntimeTargets
              .releaseDaytonaCodexRuntimeTargetInternal as any,
            {
              ownerId: params.userId,
              runId: targetRunId,
              reason: workspaceSessionFailure
                ? "polynet_turn_failed"
                : "polynet_turn_finished",
              activePreviewPorts: daytonaRuntimeSubstrate.activePreviewPorts,
            },
          );
          await emitRunEvent(
            "daytona_codex_runtime_provider_teardown_started",
            {
              run_id: params.runId,
              provider: "daytona",
              transport: "daytona_direct",
              target_id: daytonaRuntimeSubstrate.targetId,
              sandbox_id: daytonaRuntimeSubstrate.sandboxId,
              reason: workspaceSessionFailure
                ? "polynet_turn_failed"
                : "polynet_turn_finished",
              cleanup_mode: "scheduled",
              active_preview_ports: daytonaRuntimeSubstrate.activePreviewPorts,
            },
            `${params.runId}:daytona_codex_runtime_provider_teardown_started:polynet`,
          );
          await params.ctx.scheduler.runAfter(
            0,
            (internal as any).daytonaCodexRuntimeTargetActions
              .teardownAndRecordDaytonaCodexRuntimeTargetInternal as any,
            {
              ownerId: params.userId,
              runId: targetRunId,
              reason: workspaceSessionFailure
                ? "polynet_turn_failed"
                : "polynet_turn_finished",
            },
          );
        } catch (error) {
          await emitRunEvent(
            "daytona_codex_runtime_provider_teardown_failed",
            {
              run_id: params.runId,
              provider: "daytona",
              transport: "daytona_direct",
              target_id: daytonaRuntimeSubstrate.targetId,
              sandbox_id: daytonaRuntimeSubstrate.sandboxId,
              reason: "polynet_dispose_failed",
              message: error instanceof Error ? error.message : String(error ?? ""),
            },
            `${params.runId}:daytona_codex_runtime_provider_teardown_failed:polynet_dispose`,
          );
        }
      }
      const finalWorkspaceState: "released" | "failed" =
        workspaceSessionFailure ? "failed" : "released";
      if (workspaceSession) {
        try {
          await persistWorkspaceSessionState({
            state: finalWorkspaceState,
            session: workspaceSession,
            projectId: workspaceSession.projectId ?? null,
            phase: "dispose",
          });
        } catch {
          // Persistence helper emits explicit runtime evidence for failure paths.
        }
        const releaseDecision =
          await resolveWorkspaceSessionAccountingReleaseDecision(workspaceSession);
        if (!releaseDecision.shouldRelease) {
          await emitRunEvent(
            "workspace_session_accounting_kept_alive",
            {
              run_id: params.runId,
              sandbox_id: workspaceSession.providerSandboxId,
              project_id: workspaceSession.projectId ?? null,
              sandbox_scope: workspaceSession.kind,
              credit_reservation_key: workspaceSession.creditReservationKey ?? null,
              reason: releaseDecision.reason,
              active_terminal_count: releaseDecision.activeTerminalCount ?? null,
              checked_terminal_count: releaseDecision.checkedTerminalCount ?? null,
              refreshed_terminal_count: releaseDecision.refreshedTerminalCount ?? null,
              error_message: releaseDecision.errorMessage ?? null,
            },
            `${params.runId}:workspace_session_accounting_kept_alive:${workspaceSession.creditReservationKey ?? "none"}`,
          );
          return;
        }
        const providerRelease = await releaseBlaxelWorkspaceComputerIfIdle({
          sandboxName: workspaceSession.providerSandboxId,
        });
        if (!providerRelease.ok) {
          await emitRunEvent(
            "workspace_session_provider_release_failed",
            {
              run_id: params.runId,
              sandbox_id: workspaceSession.providerSandboxId,
              project_id: workspaceSession.projectId ?? null,
              sandbox_scope: workspaceSession.kind,
              credit_reservation_key: workspaceSession.creditReservationKey ?? null,
              code: providerRelease.code,
              message: providerRelease.message,
            },
            `${params.runId}:workspace_session_provider_release_failed:${workspaceSession.creditReservationKey ?? "none"}`,
          );
          return;
        }
        const settlement = await settleRuntimeWorkspaceSession({
          ctx: params.ctx,
          userId: params.userId,
          runId: params.runId,
          session: workspaceSession,
          providerStandbyGraceSeconds: providerRelease.billableGraceSeconds,
          providerReleaseReason: providerRelease.reason,
          providerReleaseConfirmed: providerRelease.releaseConfirmed,
        });
        if (settlement.ok && !settlement.skipped) {
          await emitRunEvent(
            "workspace_compute_charge_settled",
            {
              run_id: params.runId,
              sandbox_id: workspaceSession.providerSandboxId,
              project_id: workspaceSession.projectId ?? null,
              credit_reservation_key: settlement.creditReservationKey ?? null,
              credits_debited: settlement.creditsDebited ?? null,
              compute_cost_usd: settlement.computeCostUsd ?? null,
              duration_seconds: settlement.durationSeconds ?? null,
              measured_duration_seconds: settlement.measuredDurationSeconds ?? null,
              provider_standby_grace_seconds:
                settlement.providerStandbyGraceSeconds ?? null,
              provider_release_reason: providerRelease.reason,
              provider_release_confirmed: providerRelease.releaseConfirmed,
            },
            `${params.runId}:workspace_compute_charge_settled:${settlement.creditReservationKey ?? "none"}`,
          );
          const released = await releaseRuntimeWorkspaceSessionAccountingIfCurrent({
            ctx: params.ctx,
            session: workspaceSession,
          });
          await emitRunEvent(
            released.ok
              ? "workspace_session_accounting_release_checked"
              : "workspace_session_accounting_release_failed",
            released.ok
              ? {
                  run_id: params.runId,
                  sandbox_id: workspaceSession.providerSandboxId,
                  project_id: workspaceSession.projectId ?? null,
                  credit_reservation_key: settlement.creditReservationKey ?? null,
                  released: released.released,
                  reason: released.reason,
                  release_decision_reason: releaseDecision.reason,
                  active_terminal_count: releaseDecision.activeTerminalCount ?? null,
                  checked_terminal_count: releaseDecision.checkedTerminalCount ?? null,
                  refreshed_terminal_count: releaseDecision.refreshedTerminalCount ?? null,
                }
              : {
                  run_id: params.runId,
                  sandbox_id: workspaceSession.providerSandboxId,
                  project_id: workspaceSession.projectId ?? null,
                  credit_reservation_key: settlement.creditReservationKey ?? null,
                  error_message: released.error,
                },
            `${params.runId}:workspace_session_accounting_release:${settlement.creditReservationKey ?? "none"}`,
          );
        } else if (!settlement.ok) {
          await emitRunEvent(
            "workspace_compute_charge_settlement_failed",
            {
              run_id: params.runId,
              sandbox_id: workspaceSession.providerSandboxId,
              project_id: workspaceSession.projectId ?? null,
              credit_reservation_key: settlement.creditReservationKey,
              credits_debited: settlement.creditsDebited,
              compute_cost_usd: settlement.computeCostUsd,
              duration_seconds: settlement.durationSeconds,
              error_message: settlement.error,
            },
            `${params.runId}:workspace_compute_charge_settlement_failed:${settlement.creditReservationKey}`,
          );
        }
      }
    },
    buildProviderTools<TFixedToolName extends RetrievalToolName, TOpenAiTool, TResponsesTool>(params: {
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
      activeToolPolicies: RuntimeToolPolicy[];
      activeToolPolicySummary: RuntimeToolPolicySummary;
    } {
      const exposedMountedTools = mountedToolExposureState.getExposedTools();
      const includeResolver = mountedToolExposureState.hasMountedTools();
      const policySurface = buildRuntimeToolPolicySurface({
        fixedToolNames: params.allowedToolNames,
        includeResolver,
        resolverToolName: RESOLVE_MOUNTED_TOOLS_TOOL_NAME,
        mountedTools: exposedMountedTools,
      });
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
        activeToolPolicies: policySurface.policies,
        activeToolPolicySummary: policySurface.summary,
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
        daytonaRuntimeSubstrate?.provider === "daytona"
      ) {
        let terminalStartArgs:
          | ReturnType<typeof normalizeWorkspaceTerminalStartArgs>
          | null = null;
        try {
          terminalStartArgs = normalizeWorkspaceTerminalStartArgs(
            paramsForTool.normalizedArgs,
          );
        } catch {
          return {
            status: "error",
            exitCode: null,
            outputText: "",
            errorCode: "invalid_tool_args",
            errorMessage: "Terminal cwd or preview settings are invalid.",
          };
        }
        const threadId = String(params.threadId ?? "").trim();
        if (!threadId) {
          return {
            status: "error",
            exitCode: null,
            outputText: "",
            errorCode: "thread_required",
            errorMessage: "Daytona terminal_start requires a thread.",
          };
        }
        const previewPort =
          terminalStartArgs.previewPort ??
          inferDaytonaPreviewPortFromCommand(terminalStartArgs.command);
        const terminalStartedAt = Date.now();
        const payload = (await params.ctx.runAction(
          (internal as any).daytonaCodexRuntimeTargetActions
            .startDaytonaAppPreviewInternal as any,
          {
            ownerId: params.userId,
            threadId: threadId as any,
            runId: params.runId,
            ...(projectId ? { projectId: projectId as any } : {}),
            command: terminalStartArgs.command,
            ...(terminalStartArgs.cwd ? { cwd: terminalStartArgs.cwd } : {}),
            previewPort,
            ...(terminalStartArgs.previewPath
              ? { previewPath: terminalStartArgs.previewPath }
              : {}),
            ...(terminalStartArgs.previewLabel
              ? { previewLabel: terminalStartArgs.previewLabel }
              : {}),
            reason: "polynet_terminal_start",
          },
        )) as Record<string, unknown>;
        updateDaytonaRuntimeSubstrateFromPayload(payload);
        const payloadRecord =
          payload && typeof payload === "object" && !Array.isArray(payload)
            ? payload
            : null;
        if (payload?.ok !== true) {
          await emitRunEvent("terminal_tool_completed", {
            run_id: params.runId,
            tool_name: paramsForTool.toolName,
            latency_ms: Date.now() - terminalStartedAt,
            status: "error",
            terminal_session_id:
              typeof payload?.terminal_session_id === "string"
                ? payload.terminal_session_id
                : null,
          });
          return {
            status: "error",
            exitCode:
              typeof payload?.exit_code === "number" &&
              Number.isFinite(payload.exit_code)
                ? Math.floor(payload.exit_code)
                : null,
            outputText: formatTerminalStartToolOutput(payload),
            errorCode: String(payload?.code ?? "daytona_preview_start_failed"),
            errorMessage: String(payload?.message ?? "Daytona preview failed to start."),
            details: buildTerminalToolResultDetails(payloadRecord),
          };
        }
        await emitRunEvent("workspace_preview_ready", {
          run_id: params.runId,
          provider: "daytona",
          transport: "daytona_direct",
          target_run_id: params.runId,
          target_id: payload.target_id ?? null,
          sandbox_id: payload.sandbox_id ?? null,
          terminal_session_id: payload.terminal_session_id ?? null,
          port: payload.preview_port,
          preview_port: payload.preview_port,
          preview_path: payload.preview_path ?? null,
          preview_label: payload.preview_label ?? null,
          command: payload.command ?? terminalStartArgs.command,
          cwd: payload.cwd ?? terminalStartArgs.cwd ?? null,
        });
        await emitRunEvent("terminal_tool_completed", {
          run_id: params.runId,
          tool_name: paramsForTool.toolName,
          latency_ms: Date.now() - terminalStartedAt,
          status: "ok",
          terminal_session_id:
            typeof payload.terminal_session_id === "string"
              ? payload.terminal_session_id
              : null,
        });
        return {
          status: "ok",
          exitCode: 0,
          outputText: formatTerminalStartToolOutput(payload),
          errorCode: null,
          errorMessage: null,
          details: buildTerminalToolResultDetails(payloadRecord),
        };
      }
      if (
        paramsForTool.toolName === "terminal_start" &&
        (!projectId || !authSubject)
      ) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "project_required",
          errorMessage: `${paramsForTool.toolName} requires a bound computer workspace.`,
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
      async function markWorkspaceDirectorySnapshotsStaleBestEffort(reason: string) {
        if (!projectId) return;
        try {
          await params.ctx.runMutation(
            (internal as any).workspaceInspector.markWorkspaceDirectorySnapshotsStaleInternal,
            {
              projectId,
              ownerId: params.userId,
              reason,
            },
          );
        } catch {
          // Cache invalidation should not make an otherwise successful terminal operation fail.
        }
      }
      try {
        let payload: Record<string, unknown> | null = null;
        if (paramsForTool.toolName === "terminal_start") {
          let terminalStartArgs:
            | ReturnType<typeof normalizeWorkspaceTerminalStartArgs>
            | null = null;
          try {
            terminalStartArgs = normalizeWorkspaceTerminalStartArgs(
              paramsForTool.normalizedArgs,
            );
          } catch {
            payload = {
              ok: false,
              status: 400,
              code: "invalid_tool_args",
              message: "Terminal cwd or preview settings are invalid.",
            };
          }
          if (!payload && !terminalStartArgs) {
            payload = {
              ok: false,
              status: 400,
              code: "invalid_tool_args",
              message: "Terminal cwd or preview settings are invalid.",
            };
          }
          if (!payload && terminalStartArgs) {
            const workspace = await this.ensureWorkspaceForTool({
              toolName: paramsForTool.toolName,
            });
            if (!workspace.ok) {
              payload = {
                ok: false,
                status: workspace.status,
                code: workspace.code,
                message: workspace.message,
                details: (workspace as { details?: unknown }).details ?? null,
              };
            } else {
              const activeWorkspaceSession = workspace.session;
              payload = await startWorkspaceTerminalProcess({
                ctx: params.ctx,
                ownerId: params.userId,
                projectId,
                threadId: params.threadId as any,
                session:
                  buildTerminalProcessContextFromWorkspaceSession(
                    activeWorkspaceSession,
                  ),
                terminal: terminalStartArgs,
                providerSessionIdPrefix:
                  "pn-bg-term",
              });
            }
          }
        } else if (
          paramsForTool.toolName === "terminal_stop" &&
          daytonaRuntimeSubstrate?.provider === "daytona"
        ) {
          const activeDaytona = daytonaRuntimeSubstrate;
          const targetRunId = String(activeDaytona.runId ?? "").trim();
          const requestedTerminalSessionId = String(
            paramsForTool.normalizedArgs.terminal_session_id ?? "",
          ).trim();
          const requestedPreviewPortRaw = Number(
            paramsForTool.normalizedArgs.preview_port,
          );
          const requestedPreviewPort =
            Number.isFinite(requestedPreviewPortRaw) && requestedPreviewPortRaw > 0
              ? Math.floor(requestedPreviewPortRaw)
              : null;
          if (!targetRunId) {
            payload = {
              ok: false,
              status: 404,
              code: "daytona_runtime_target_not_found",
              message: "No active Daytona runtime target is available to stop.",
            };
          } else if (
            requestedPreviewPort !== null &&
            !activeDaytona.activePreviewPorts.includes(requestedPreviewPort)
          ) {
            payload = {
              ok: false,
              status: 404,
              code: "daytona_preview_port_not_active",
              message: `Daytona preview port ${requestedPreviewPort} is not active for this thread.`,
              provider_id: "daytona",
              target_run_id: targetRunId,
              target_id: activeDaytona.targetId,
              sandbox_id: activeDaytona.sandboxId,
            };
          } else if (
            requestedTerminalSessionId !== "active_daytona_preview" &&
            requestedTerminalSessionId !== String(activeDaytona.targetId ?? "") &&
            requestedTerminalSessionId !== String(activeDaytona.runId ?? "")
          ) {
            payload = {
              ok: false,
              status: 400,
              code: "daytona_preview_stop_selector_required",
              message:
                'Use terminal_session_id "active_daytona_preview" to stop the active Daytona app preview.',
              provider_id: "daytona",
              target_run_id: targetRunId,
              target_id: activeDaytona.targetId,
              sandbox_id: activeDaytona.sandboxId,
            };
          } else {
            const stopped = (await params.ctx.runAction(
              (internal as any).daytonaCodexRuntimeTargetActions
                .stopDaytonaAppPreviewInternal as any,
              {
                ownerId: params.userId,
                runId: targetRunId,
                ...(requestedPreviewPort !== null
                  ? { previewPort: requestedPreviewPort }
                  : {}),
                reason: "polynet_terminal_stop",
              },
            )) as Record<string, unknown>;
            payload = {
              ok: stopped.ok === true,
              provider_id: "daytona",
              terminal_session_id:
                requestedTerminalSessionId || "active_daytona_preview",
              target_run_id: targetRunId,
              target_id: activeDaytona.targetId,
              sandbox_id: activeDaytona.sandboxId,
              ...(stopped &&
              typeof stopped === "object" &&
              !Array.isArray(stopped)
                ? stopped
                : {}),
            };
            if (payload.ok === true) {
              const stoppedPorts = Array.isArray(payload.stopped_preview_ports)
                ? payload.stopped_preview_ports
                    .map((port) => Math.floor(Number(port)))
                    .filter((port) => Number.isFinite(port) && port > 0)
                : activeDaytona.activePreviewPorts;
              if (stoppedPorts.length > 0) {
                const stopped = new Set(stoppedPorts);
                daytonaRuntimeSubstrate.activePreviewPorts =
                  daytonaRuntimeSubstrate.activePreviewPorts.filter(
                    (port) => !stopped.has(port),
                  );
                daytonaRuntimeSubstrate.previewLeaseActive =
                  daytonaRuntimeSubstrate.activePreviewPorts.length > 0;
              }
              await emitRunEvent("workspace_preview_stopped", {
                run_id: params.runId,
                provider: "daytona",
                target_run_id: targetRunId,
                target_id: activeDaytona.targetId,
                sandbox_id: activeDaytona.sandboxId,
                preview_ports: Array.isArray(payload.stopped_preview_ports)
                  ? payload.stopped_preview_ports
                  : activeDaytona.activePreviewPorts,
                terminal_session_id:
                  requestedTerminalSessionId || "active_daytona_preview",
                reason: "polynet_terminal_stop",
                teardown_state:
                  typeof payload.teardown_state === "string"
                    ? payload.teardown_state
                    : null,
              });
            }
          }
        } else {
          const terminalSessionId = String(
            paramsForTool.normalizedArgs.terminal_session_id ?? "",
          ).trim();
          if (!terminalSessionId) {
            payload = {
              ok: false,
              status: 400,
              code: "invalid_tool_args",
              message: "terminal_session_id is required.",
            };
          } else {
            const access = await requireRuntimeAccessibleTerminalRow({
              ctx: params.ctx,
              ownerId: params.userId,
              projectId,
              runId: params.runId,
              terminalSessionId,
            });
            if (!access.ok) {
              payload = access;
            } else if (paramsForTool.toolName === "terminal_read") {
              const summary = await readWorkspaceTerminalProcess({
                ctx: params.ctx,
                row: access.row,
                session: buildBlaxelTerminalProcessContextFromRow(access.row),
              });
              const summaryOk =
                !(
                  summary &&
                  typeof summary === "object" &&
                  !Array.isArray(summary) &&
                  (summary as { ok?: unknown }).ok === false
                );
              payload = {
                ok: summaryOk,
                terminal_session_id: String(access.row?._id ?? "").trim(),
                ...(summary &&
                typeof summary === "object" &&
                !Array.isArray(summary)
                ? summary
                : {}),
              };
            } else if (paramsForTool.toolName === "terminal_write") {
              const providerSandboxId = String(
                access.row?.providerSandboxId ?? "",
              ).trim();
              const wrote = await writeWorkspaceTerminalProcessInput({
                ctx: params.ctx,
                row: access.row,
                session: {
                  providerId: "blaxel",
                  providerSandboxId,
                },
                input: String(paramsForTool.normalizedArgs.input ?? ""),
              });
              payload = {
                ok: Boolean((wrote as { ok?: boolean } | null)?.ok),
                terminal_session_id: String(access.row?._id ?? "").trim(),
                ...(wrote &&
                typeof wrote === "object" &&
                !Array.isArray(wrote)
                  ? wrote
                  : {}),
              };
            } else {
              const providerSandboxId = String(
                access.row?.providerSandboxId ?? "",
              ).trim();
              const stopped = await stopWorkspaceTerminalProcess({
                ctx: params.ctx,
                row: access.row,
                session: {
                  providerId: "blaxel",
                  providerSandboxId,
                },
                forceStoppedStatus: true,
              });
              payload = {
                ok: true,
                terminal_session_id: String(access.row?._id ?? "").trim(),
                  ...(stopped &&
                  typeof stopped === "object" &&
                  !Array.isArray(stopped)
                    ? stopped
                    : {}),
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
          const payloadRecord =
            payload && typeof payload === "object" && !Array.isArray(payload)
              ? (payload as Record<string, unknown>)
              : null;
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
            details: buildTerminalToolResultDetails(payloadRecord),
          };
        }
        const payloadRecord =
          payload && typeof payload === "object" && !Array.isArray(payload)
            ? (payload as Record<string, unknown>)
            : null;
        if (
          paramsForTool.toolName === "terminal_start" ||
          paramsForTool.toolName === "terminal_write"
        ) {
          await markWorkspaceDirectorySnapshotsStaleBestEffort(
            `runtime_tool_${paramsForTool.toolName}`,
          );
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
          details: buildTerminalToolResultDetails(payloadRecord),
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
      const computerToolName = paramsForComputer.toolName;
      if (computerToolName === "computer_open_url") {
        const opened = (await params.ctx.runAction(
          (internal as any).daytonaCodexRuntimeTargetActions
            .openDaytonaComputerUseUrlInternal as any,
          {
            ownerId: params.userId,
            runId: params.runId,
            url: String(paramsForComputer.normalizedArgs.url ?? ""),
            reason: "runtime_computer_open_url_tool",
          },
        )) as Record<string, unknown>;
        if (opened?.ok !== true) {
          const errorCode =
            String(opened?.code ?? "").trim() ||
            "daytona_computer_open_url_unavailable";
          return {
            status: "error",
            exitCode: null,
            outputText: "",
            errorCode,
            errorMessage:
              String(opened?.message ?? "").trim() ||
              "Daytona Computer Use browser navigation is unavailable for this run.",
            details: {
              provider_id: "daytona",
              computer_use: {
                provider: "daytona",
                error_code: errorCode,
              },
            },
          };
        }
        const summary =
          String(opened.summary ?? "").trim() ||
          "Opened URL in the Daytona computer browser.";
        return {
          status: "ok",
          exitCode: 0,
          outputText: summary,
          errorCode: null,
          errorMessage: null,
          details: {
            provider_id: "daytona",
            computer_use: {
              provider: "daytona",
              summary,
              command_exit_code: opened.command_exit_code ?? null,
              display_keys: opened.display_keys ?? [],
              window_count: opened.window_count ?? null,
              capture_reason: opened.capture_reason ?? null,
            },
          },
        };
      }
      if (computerToolName === "computer_screenshot") {
        const captured = (await params.ctx.runAction(
          (internal as any).daytonaCodexRuntimeTargetActions
            .captureDaytonaComputerUseScreenshotInternal as any,
          {
            ownerId: params.userId,
            runId: params.runId,
            reason: "runtime_computer_screenshot_tool",
          },
        )) as Record<string, unknown>;
        if (captured?.ok !== true) {
          const errorCode =
            String(captured?.code ?? "").trim() ||
            "daytona_computer_use_screenshot_unavailable";
          return {
            status: "error",
            exitCode: null,
            outputText: "",
            errorCode,
            errorMessage:
              String(captured?.message ?? "").trim() ||
              "Daytona Computer Use screenshot is unavailable for this run.",
            details: {
              provider_id: "daytona",
              computer_use: {
                provider: "daytona",
                error_code: errorCode,
              },
            },
          };
        }

        const frameUrl = String(captured.frame_url ?? "").trim();
        const frameStorageId = String(captured.frame_storage_id ?? "").trim();
        const summary =
          String(captured.summary ?? "").trim() ||
          "Captured Daytona desktop screenshot.";
        if (!frameUrl || !frameStorageId) {
          return {
            status: "error",
            exitCode: null,
            outputText: "",
            errorCode: "daytona_computer_use_screenshot_frame_unavailable",
            errorMessage: "Daytona captured a screenshot but did not return a readable frame.",
            details: {
              provider_id: "daytona",
              computer_use: {
                provider: "daytona",
                frame_storage_id: frameStorageId || null,
              },
            },
          };
        }

        const observationMessage = buildToolObservationMessage({
          summaryText: summary,
          imageUrl: frameUrl,
        });
        return {
          status: "ok",
          exitCode: 0,
          outputText: summary,
          errorCode: null,
          errorMessage: null,
          details: {
            provider_id: "daytona",
            computer_use: {
              provider: "daytona",
              summary,
              frame_storage_id: frameStorageId,
              frame_mime_type: captured.frame_mime_type ?? null,
              frame_size_bytes: captured.frame_size_bytes ?? null,
              screenshot_method: captured.screenshot_method ?? null,
              screenshot_width: captured.screenshot_width ?? null,
              screenshot_height: captured.screenshot_height ?? null,
              capture_reason: captured.capture_reason ?? null,
              status_keys: captured.status_keys ?? [],
              result_keys: captured.result_keys ?? [],
            },
          },
          observationContent: Array.isArray(observationMessage.content)
            ? observationMessage.content
            : null,
        };
      }
      await emitRunEvent("computer_tool_completed", {
        run_id: params.runId,
        tool_name: computerToolName,
        latency_ms: Date.now() - computerStartedAt,
        status: "error",
        error_code: "computer_use_not_supported",
        used_existing_workspace: hadWorkspaceSession,
        sandbox_id: workspaceSession?.providerSandboxId ?? null,
      });
      return {
        status: "error",
        exitCode: null,
        outputText: "",
        errorCode: "computer_use_not_supported",
        errorMessage:
          "Computer-use tools are not available on the Blaxel workspace provider yet.",
        details: {
          provider_id: "blaxel",
        },
      };
    },
  };
}
