import { api } from "./_generated/api";
import {
  DAYTONA_WORKSPACE_ROOT,
  createDaytonaSandbox,
  deleteDaytonaSandbox,
  getDaytonaToolboxProxyUrl,
  loadDaytonaConfig,
  stopDaytonaSandbox,
  waitForDaytonaSandboxReady,
  type DaytonaConfig,
} from "./daytonaSandboxClient";
import { executeDaytonaCommand } from "./daytonaToolboxExecutor";

export type DaytonaProbeExecution =
  | {
      ok: true;
      providerSandboxId: string;
      toolboxProxyUrl: string;
      region: string | null;
      exitCode: number | null;
      outputText: string;
      lifecycleMode: "native_stop_delete" | "manual_delete_fallback";
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    };

export type WorkspaceSandboxSession = {
  config: DaytonaConfig;
  projectId: string;
  projectVolumeId: string | null;
  providerSandboxId: string;
  toolboxProxyUrl: string;
  region: string | null;
  lifecycleMode: "native_stop_delete" | "manual_delete_fallback";
};

function buildRunPinnedDaytonaConfig(config: DaytonaConfig): DaytonaConfig {
  return {
    ...config,
    // Workspace sandboxes are created per active run and explicitly stopped in cleanup.
    // Disable Daytona idle auto-stop so mixed web+workspace turns cannot lose the sandbox
    // during research gaps before the run finishes.
    autoStopInterval: 0,
  };
}

export async function resolveWorkspaceProjectLabel(params: {
  ctx: any;
  projectId?: string | null;
  authSubject?: string | null;
}): Promise<string | null> {
  if (!params.projectId || !params.authSubject) return null;
  return await params.ctx.runQuery(api.projects.getCloudProjectDisplayLabel as any, {
    projectId: params.projectId,
    authSubject: params.authSubject,
  });
}

export async function executeDaytonaProbeToolCall(params: {
  config: DaytonaConfig;
  userId: string;
  projectId: string;
  runId: string;
  projectVolumeId?: string | null;
}): Promise<DaytonaProbeExecution> {
  const created = await createDaytonaSandbox({
    config: buildRunPinnedDaytonaConfig(params.config),
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
    lifecycleMode: created.lifecycleMode,
  };
}

export async function createWorkspaceSandboxSession(params: {
  ctx: any;
  userId: string;
  authSubject: string;
  projectId: string;
  runId: string;
}): Promise<
  | { ok: true; session: WorkspaceSandboxSession }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const runtimeProject = await params.ctx.runAction(api.projects.ensureCloudProjectVolume as any, {
    authSubject: params.authSubject,
    projectId: params.projectId,
  });
  const loadedDaytonaConfig = loadDaytonaConfig();
  if (!loadedDaytonaConfig.ok) {
    return {
      ok: false,
      status: 503,
      code: loadedDaytonaConfig.code,
      message: loadedDaytonaConfig.message,
    };
  }
  const projectVolumeId = String((runtimeProject as any)?.providerVolumeId ?? "").trim() || null;
  const runPinnedConfig = buildRunPinnedDaytonaConfig(loadedDaytonaConfig.config);
  const probe = await executeDaytonaProbeToolCall({
    config: runPinnedConfig,
    userId: params.userId,
    projectId: params.projectId,
    runId: params.runId,
    projectVolumeId,
  });
  if (!probe.ok) return probe;
  return {
    ok: true,
    session: {
      config: runPinnedConfig,
      projectId: params.projectId,
      projectVolumeId,
      providerSandboxId: probe.providerSandboxId,
      toolboxProxyUrl: probe.toolboxProxyUrl,
      region: probe.region,
      lifecycleMode: probe.lifecycleMode,
    },
  };
}

export async function cleanupWorkspaceSandboxSession(params: {
  session: WorkspaceSandboxSession;
  runId: string;
  projectId: string;
  appendRunEvent: (params: {
    eventType: string;
    eventKey?: string;
    payload: Record<string, unknown>;
  }) => Promise<void>;
}): Promise<void> {
  const stopped = await stopDaytonaSandbox({
    config: params.session.config,
    sandboxId: params.session.providerSandboxId,
  });
  await params.appendRunEvent({
    eventType: "sandbox_stopped",
    eventKey: `${params.runId}:workspace_sandbox_stopped:1`,
    payload: {
      run_id: params.runId,
      sandbox_id: params.session.providerSandboxId,
      status: stopped.ok ? "ok" : "error",
      error_code: stopped.ok ? null : stopped.code,
      error_message: stopped.ok ? null : stopped.message,
    },
  });
  const deleted = params.session.lifecycleMode === "manual_delete_fallback"
    ? await deleteDaytonaSandbox({
        config: params.session.config,
        sandboxId: params.session.providerSandboxId,
      })
    : { ok: true as const };
  await params.appendRunEvent({
    eventType: "sandbox_deleted",
    eventKey: `${params.runId}:workspace_sandbox_deleted:1`,
    payload: {
      run_id: params.runId,
      sandbox_id: params.session.providerSandboxId,
      status: deleted.ok ? "ok" : "error",
      error_code: deleted.ok ? null : deleted.code,
      error_message: deleted.ok ? null : deleted.message,
      lifecycle_mode: params.session.lifecycleMode,
    },
  });
}
