import { internal } from "./_generated/api";
import type { WorkspaceSandboxSession } from "./daytonaWorkspaceSession";
import { runDaytonaComputerUseTool } from "./daytonaComputerUse";
import {
  isWorkspaceTerminalActiveStatus,
  normalizeWorkspaceTerminalCommand,
  normalizeWorkspaceTerminalStartArgs,
  readWorkspaceToolFailureOutputPreview,
  resolveWorkspaceCwd,
  startWorkspaceTerminalProcess,
  stopWorkspaceTerminalProcess,
  summarizeWorkspaceTerminalRow,
  writeWorkspaceTerminalProcessInput,
} from "./workspaceTerminalProcessCore";
import {
  ensureProjectBackgroundSandbox,
  releaseProjectBackgroundSandboxIfIdle,
  resolveTerminalSandboxContext,
} from "./workspaceTerminalBackgroundService";
import { reconcileWorkspaceTerminalRow } from "./workspaceTerminalReconciliation";
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
    "exit_code",
    "output_tail",
    "code",
    "message",
  ]) {
    const value = payload[key];
    if (value !== undefined && value !== null && value !== "") {
      details[key] = value;
    }
  }
  return Object.keys(details).length > 0 ? details : null;
}

function normalizeRuntimeTerminalIdentityCommand(
  command: string,
  cwd: string | null,
): string {
  return normalizeWorkspaceTerminalCommand(command, resolveWorkspaceCwd(cwd))
    .replace(/\s+/g, " ")
    .trim();
}

function isWorkspaceCreditBudgetExpired(
  session: WorkspaceSandboxSession | null | undefined,
): boolean {
  const expiresAt = Number(session?.creditBudgetExpiresAt ?? 0);
  return Number.isFinite(expiresAt) && expiresAt > 0 && Date.now() >= expiresAt;
}

function buildWorkspaceCreditBudgetSignal(
  session: WorkspaceSandboxSession,
  parentSignal?: AbortSignal,
): { signal?: AbortSignal; cleanup: () => void } {
  const expiresAt = Number(session.creditBudgetExpiresAt ?? 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    return { signal: parentSignal, cleanup: () => {} };
  }
  const remainingMs = Math.max(0, expiresAt - Date.now());
  const controller = new AbortController();
  let settled = false;
  const cleanupFns: Array<() => void> = [];
  const abort = () => {
    if (settled) return;
    settled = true;
    controller.abort();
  };
  const timeout = setTimeout(abort, remainingMs);
  cleanupFns.push(() => clearTimeout(timeout));
  if (parentSignal) {
    if (parentSignal.aborted) {
      abort();
    } else {
      const onAbort = () => abort();
      parentSignal.addEventListener("abort", onAbort, { once: true });
      cleanupFns.push(() => parentSignal.removeEventListener("abort", onAbort));
    }
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      settled = true;
      for (const cleanup of cleanupFns) cleanup();
    },
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
  threadId?: string | null;
  runId: string;
  mountedTools: RuntimeMountedMcpTool[];
  mountedToolDiscoveryCatalog?: RuntimeMountedMcpTool[] | null;
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
    discoveryCatalog: params.mountedToolDiscoveryCatalog ?? null,
  });
  const mountedToolByName = new Map(
    params.mountedTools.map((tool) => [tool.runtime_tool_name, tool]),
  );
  let workspaceSession = params.initialWorkspaceSession ?? null;
  let workspaceSessionFailure: {
    status: number;
    code: string;
    message: string;
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

  const persistWorkspaceSessionState = async (paramsForPersist: {
    state: "active" | "released" | "failed";
    session: WorkspaceSandboxSession;
    projectId: string;
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
            toolboxProxyUrl: paramsForPersist.session.toolboxProxyUrl,
            region: paramsForPersist.session.region ?? undefined,
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
              project_id: paramsForPersist.projectId,
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
        if (isWorkspaceCreditBudgetExpired(workspaceSession)) {
          workspaceSessionFailure = {
            status: 402,
            code: "workspace_credits_exhausted",
            message: "Workspace credit budget expired. Add credits to use workspace tools.",
          };
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
      const backgroundSandbox = await ensureProjectBackgroundSandbox({
        ctx: params.ctx,
        authSubject,
        userId: params.userId,
        projectId,
      });
      if (!backgroundSandbox.ok) {
        await emitRunEvent(
          "workspace_session_create_completed",
          {
            run_id: params.runId,
            project_id: projectId,
            tool_name: String(paramsForCreate?.toolName ?? "").trim() || null,
            latency_ms: Date.now() - createStartedAt,
            status: "error",
            code: backgroundSandbox.code,
            source: "project_background",
          },
          `${params.runId}:workspace_session_create_completed:error`,
        );
        workspaceSessionFailure = {
          status: backgroundSandbox.status,
          code: backgroundSandbox.code,
          message: backgroundSandbox.message,
        };
        return {
          ok: false as const,
          status: backgroundSandbox.status,
          code: backgroundSandbox.code,
          message: backgroundSandbox.message,
          details: (backgroundSandbox as { details?: unknown }).details,
        };
      }

      workspaceSessionFailure = null;
      workspaceSession = {
        config: backgroundSandbox.config,
        projectId,
        projectVolumeId: backgroundSandbox.projectVolumeId,
        providerSandboxId: backgroundSandbox.providerSandboxId,
        toolboxProxyUrl: backgroundSandbox.toolboxProxyUrl,
        region: null,
        sandboxCpu: backgroundSandbox.sandboxCpu,
        sandboxMemoryGiB: backgroundSandbox.sandboxMemoryGiB,
        sandboxDiskGiB: backgroundSandbox.sandboxDiskGiB,
        startedAt: backgroundSandbox.startedAt,
        creditReservationKey: backgroundSandbox.creditReservationKey,
        creditBudgetCredits: backgroundSandbox.creditBudgetCredits,
        creditBudgetExpiresAt: backgroundSandbox.creditBudgetExpiresAt,
        lifecycleMode: "native_stop_delete",
      };
      ensureWorkspaceHeartbeat();
      await emitRunEvent(
        "workspace_session_adopted",
        {
          run_id: params.runId,
          sandbox_id: backgroundSandbox.providerSandboxId,
          project_id: projectId,
          source: "project_background",
          toolbox_proxy_url: backgroundSandbox.toolboxProxyUrl,
        },
        `${params.runId}:workspace_session_adopted:project_background`,
      );
      const persisted = await persistWorkspaceSessionState({
        state: "active",
        session: workspaceSession,
        projectId,
        phase: "create",
      });
      if (!persisted.ok) {
        workspaceSessionFailure = {
          status: 500,
          code: "workspace_session_persist_failed",
          message: "Failed to persist workspace session metadata.",
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
          project_id: projectId,
          tool_name: String(paramsForCreate?.toolName ?? "").trim() || null,
          latency_ms: Date.now() - createStartedAt,
          status: "ok",
          sandbox_id: backgroundSandbox.providerSandboxId,
          region: null,
          source: "project_background",
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
      const finalWorkspaceState: "released" | "failed" =
        workspaceSessionFailure ? "failed" : "released";
      if (workspaceSession) {
        try {
          await persistWorkspaceSessionState({
            state: finalWorkspaceState,
            session: workspaceSession,
            projectId: String(
              params.projectId ?? workspaceSession.projectId ?? "",
            ).trim(),
            phase: "dispose",
          });
        } catch {
          // Persistence helper emits explicit runtime evidence for failure paths.
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
            const backgroundSandbox = await ensureProjectBackgroundSandbox({
              ctx: params.ctx,
              authSubject,
              userId: params.userId,
              projectId,
            });
            if (!backgroundSandbox.ok) {
              payload = {
                ok: false,
                status: backgroundSandbox.status,
                code: backgroundSandbox.code,
                message: backgroundSandbox.message,
                details: (backgroundSandbox as { details?: unknown }).details ?? null,
              };
            } else {
              const rows = (await params.ctx.runQuery(
                internal.workspaceTerminals
                  .listProjectWorkspaceTerminalSessionsInternal as any,
                {
                  ownerId: params.userId,
                  projectId: projectId as any,
                },
              )) as any[];
              const requestedCommandIdentity =
                normalizeRuntimeTerminalIdentityCommand(
                  terminalStartArgs.command,
                  terminalStartArgs.cwd,
                );
              for (const row of rows) {
                if (
                  String(row?.providerSandboxId ?? "").trim() !==
                  backgroundSandbox.providerSandboxId
                ) {
                  continue;
                }
                const summary = await reconcileWorkspaceTerminalRow({
                  ctx: params.ctx,
                  ownerId: params.userId,
                  row,
                  lifecycleOwner: "project_background",
                });
                if (
                  !isWorkspaceTerminalActiveStatus(
                    (summary as { status?: unknown } | null)?.status,
                  )
                ) {
                  continue;
                }
                const summaryRecord =
                  summary &&
                  typeof summary === "object" &&
                  !Array.isArray(summary)
                    ? (summary as Record<string, unknown>)
                    : null;
                const summaryCommandIdentity =
                  normalizeRuntimeTerminalIdentityCommand(
                    String(summaryRecord?.command ?? ""),
                    typeof summaryRecord?.cwd === "string"
                      ? summaryRecord.cwd
                      : null,
                  );
                const summaryPreviewPort =
                  typeof summaryRecord?.preview_port === "number" &&
                  Number.isFinite(summaryRecord.preview_port)
                    ? Math.floor(summaryRecord.preview_port)
                    : null;
                const summaryPreviewPath =
                  typeof summaryRecord?.preview_path === "string" &&
                  summaryRecord.preview_path.trim()
                    ? summaryRecord.preview_path.trim()
                    : null;
                if (
                  summaryCommandIdentity !== requestedCommandIdentity ||
                  summaryPreviewPort !== terminalStartArgs.previewPort ||
                  summaryPreviewPath !== terminalStartArgs.previewPath
                ) {
                  continue;
                }
                payload = {
                  ok: true,
                  provider_session_id: null,
                  reused_existing: true,
                  terminal_session_id: String(
                    summaryRecord?.terminal_session_id ??
                      summaryRecord?.id ??
                      "",
                  ).trim(),
                  ...(summaryRecord ?? {}),
                };
                break;
              }
              if (!payload) {
                payload = await startWorkspaceTerminalProcess({
                  ctx: params.ctx,
                  ownerId: params.userId,
                  projectId,
                  threadId: params.threadId as any,
                  session: {
                    config: backgroundSandbox.config,
                    toolboxProxyUrl: backgroundSandbox.toolboxProxyUrl,
                    providerSandboxId: backgroundSandbox.providerSandboxId,
                  },
                  terminal: terminalStartArgs,
                  providerSessionIdPrefix: "arx-bg-term",
                });
              }
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
              const summary = await reconcileWorkspaceTerminalRow({
                ctx: params.ctx,
                ownerId: params.userId,
                row: access.row,
                lifecycleOwner: "project_background",
              });
              payload = {
                ok: true,
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
              const sandbox = await resolveTerminalSandboxContext({
                ctx: params.ctx,
                projectId,
                providerSandboxId,
                touchProjectBackground: true,
              });
              if (!sandbox.ok) {
                payload = sandbox;
              } else {
                const wrote = await writeWorkspaceTerminalProcessInput({
                  ctx: params.ctx,
                  row: access.row,
                  session: {
                    config: sandbox.config,
                    toolboxProxyUrl: sandbox.toolboxProxyUrl,
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
              }
            } else {
              const providerSandboxId = String(
                access.row?.providerSandboxId ?? "",
              ).trim();
              const sandbox = await resolveTerminalSandboxContext({
                ctx: params.ctx,
                projectId,
                providerSandboxId,
                touchProjectBackground: true,
              });
              const stopped = await stopWorkspaceTerminalProcess({
                ctx: params.ctx,
                row: access.row,
                session: sandbox.ok
                  ? {
                      config: sandbox.config,
                      toolboxProxyUrl: sandbox.toolboxProxyUrl,
                      providerSandboxId,
                    }
                  : null,
                forceStoppedStatus: true,
              });
              await releaseProjectBackgroundSandboxIfIdle({
                ctx: params.ctx,
                ownerId: params.userId,
                projectId,
                providerSandboxId,
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
      let activeWorkspaceSession = workspaceSession;
      if (!activeWorkspaceSession) {
        const created = await this.ensureWorkspaceForTool({
          toolName: paramsForComputer.toolName,
        });
        if (!created.ok) {
          return {
            status: "error",
            exitCode: null,
            outputText: readWorkspaceToolFailureOutputPreview(
              (created as any).details,
            ),
            errorCode: created.code,
            errorMessage: created.message,
          };
        }
        activeWorkspaceSession = created.session;
      }
      if (isWorkspaceCreditBudgetExpired(activeWorkspaceSession)) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "workspace_credits_exhausted",
          errorMessage: "Workspace credit budget expired. Add credits to use workspace tools.",
        };
      }
      const budgetSignal = buildWorkspaceCreditBudgetSignal(
        activeWorkspaceSession,
        paramsForComputer.signal,
      );
      const computerResult = await (async () => {
        try {
          return await runDaytonaComputerUseTool({
            config: activeWorkspaceSession.config,
            toolboxProxyUrl: activeWorkspaceSession.toolboxProxyUrl,
            sandboxId: activeWorkspaceSession.providerSandboxId,
            toolName: computerToolName,
            args: paramsForComputer.normalizedArgs,
            signal: budgetSignal.signal,
          });
        } finally {
          budgetSignal.cleanup();
        }
      })();
      if (
        budgetSignal.signal?.aborted &&
        isWorkspaceCreditBudgetExpired(activeWorkspaceSession)
      ) {
        return {
          status: "error",
          exitCode: null,
          outputText: "",
          errorCode: "workspace_credits_exhausted",
          errorMessage: "Workspace credit budget expired. Add credits to use workspace tools.",
        };
      }
      const enriched = await enrichComputerUseToolResult({
        toolName: computerToolName,
        toolResult: computerResult,
      });
      await emitRunEvent("computer_tool_completed", {
        run_id: params.runId,
        tool_name: computerToolName,
        latency_ms: Date.now() - computerStartedAt,
        status: enriched.status,
        used_existing_workspace: hadWorkspaceSession,
        sandbox_id: activeWorkspaceSession.providerSandboxId,
      });
      return enriched;
    },
  };
}
