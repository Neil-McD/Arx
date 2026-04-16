import { internal } from "./_generated/api";
import {
  loadDaytonaConfig,
  type DaytonaConfig,
} from "./daytonaSandboxClient";
import type { WorkspaceSandboxSession } from "./daytonaWorkspaceSession";

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

type RuntimeOwnedTerminalSessionResolution =
  | {
      ok: true;
      session: WorkspaceSandboxSession;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

export async function isRuntimeSessionOwnedTerminalRow(params: {
  ctx: any;
  row: any;
}): Promise<boolean> {
  const runIdStartedBy = normalizeOptionalString(params.row?.runIdStartedBy);
  if (!runIdStartedBy) return false;
  const rowSandboxId = normalizeOptionalString(params.row?.providerSandboxId);
  if (!rowSandboxId) return false;
  const project = await params.ctx.runQuery(
    internal.projects.getCloudProjectByIdInternal as any,
    {
      projectId: String(params.row?.projectId ?? "").trim(),
    },
  );
  const projectSandboxId = normalizeOptionalString(project?.providerSandboxId);
  return !projectSandboxId || projectSandboxId !== rowSandboxId;
}

export async function resolveRuntimeOwnedTerminalSession(params: {
  ctx: any;
  ownerId: any;
  row: any;
  runId: string;
}): Promise<RuntimeOwnedTerminalSessionResolution> {
  const run = await params.ctx.runQuery(
    internal.threads.getRuntimeRunByOwnerRunIdInternal as any,
    {
      ownerId: params.ownerId,
      runId: params.runId,
    },
  );
  if (!run) {
    return {
      ok: false,
      status: 404,
      code: "runtime_run_not_found",
      message: "Runtime workspace session not found.",
    };
  }
  const sessionState = normalizeOptionalString(run?.workspaceSessionState);
  if (sessionState !== "active") {
    return {
      ok: false,
      status: 409,
      code: "workspace_session_required",
      message:
        "Runtime preview is only available while its workspace session is active.",
    };
  }
  const providerSandboxId = normalizeOptionalString(
    run?.workspaceProviderSandboxId,
  );
  const toolboxProxyUrl = normalizeOptionalString(
    run?.workspaceToolboxProxyUrl,
  );
  if (!providerSandboxId || !toolboxProxyUrl) {
    return {
      ok: false,
      status: 409,
      code: "workspace_session_required",
      message:
        "Runtime preview is only available while its workspace session is active.",
    };
  }
  if (
    providerSandboxId !== normalizeOptionalString(params.row?.providerSandboxId)
  ) {
    return {
      ok: false,
      status: 409,
      code: "workspace_session_mismatch",
      message: "Preview terminal is not attached to this workspace session.",
    };
  }
  const loadedConfig = loadDaytonaConfig();
  if (!loadedConfig.ok) {
    return {
      ok: false,
      status: 503,
      code: loadedConfig.code,
      message: loadedConfig.message,
    };
  }
  const config: DaytonaConfig = {
    ...loadedConfig.config,
    autoStopInterval: 0,
  };
  return {
    ok: true,
    session: {
      config,
      projectId: String(params.row?.projectId ?? "").trim(),
      projectVolumeId: null,
      providerSandboxId,
      toolboxProxyUrl,
      region: normalizeOptionalString(run?.workspaceSessionRegion),
      sandboxCpu: config.sandboxCpu,
      sandboxMemoryGiB: config.sandboxMemoryGiB,
      sandboxDiskGiB: config.sandboxDiskGiB,
      startedAt: Number(run?.startedAt ?? Date.now()) || Date.now(),
      lifecycleMode: "native_stop_delete",
    },
  };
}
