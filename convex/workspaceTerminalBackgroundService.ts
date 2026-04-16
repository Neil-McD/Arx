import { api, internal } from "./_generated/api";
import {
  createDaytonaSandbox,
  deleteDaytonaSandbox,
  getDaytonaToolboxProxyUrl,
  loadDaytonaConfig,
  stopDaytonaSandbox,
  waitForDaytonaSandboxReady,
  waitForDaytonaSandboxStopped,
  type DaytonaConfig,
} from "./daytonaSandboxClient";
import { isWorkspaceTerminalActiveStatus } from "./workspaceTerminalProcessCore";

function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function buildBackgroundSandboxRunId(
  projectId: string,
  providerSandboxId?: string | null,
): string {
  const sandboxId = normalizeString(providerSandboxId ?? "");
  if (sandboxId) return `background_terminal:${projectId}:${sandboxId}`;
  return `background_terminal:${projectId}`;
}

export async function ensureProjectBackgroundSandbox(params: {
  ctx: any;
  authSubject: string | null | undefined;
  userId: any;
  projectId: string;
}): Promise<
  | {
      ok: true;
      config: DaytonaConfig;
      providerSandboxId: string;
      toolboxProxyUrl: string;
      sandboxCpu: number;
      sandboxMemoryGiB: number;
      sandboxDiskGiB: number;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const project = await params.ctx.runQuery(api.projects.getCloudProjectById as any, {
    authSubject: params.authSubject,
    ownerId: params.userId,
    projectId: params.projectId,
  });
  if (!project) {
    return {
      ok: false,
      status: 404,
      code: "project_not_found",
      message: "Project not found.",
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

  const existingSandboxId = normalizeOptionalString(project.providerSandboxId);
  if (existingSandboxId) {
    const ready = await waitForDaytonaSandboxReady({
      config,
      sandboxId: existingSandboxId,
      timeoutMs: 10_000,
    });
    if (ready.ok) {
      const toolbox = await getDaytonaToolboxProxyUrl({
        config,
        sandboxId: existingSandboxId,
      });
      if (toolbox.ok) {
        await params.ctx.runMutation(
          internal.workspaceTerminals.setProjectBackgroundSandboxInternal as any,
          {
            projectId: params.projectId,
            providerSandboxId: existingSandboxId,
            providerSandboxState: String(ready.sandbox.state ?? "").trim() || "started",
            providerSandboxLastSeenAt: Date.now(),
          },
        );
        return {
          ok: true,
          config,
          providerSandboxId: existingSandboxId,
          toolboxProxyUrl: toolbox.toolboxProxyUrl,
          sandboxCpu: config.sandboxCpu,
          sandboxMemoryGiB: config.sandboxMemoryGiB,
          sandboxDiskGiB: config.sandboxDiskGiB,
        };
      }
    }

    await params.ctx.runMutation(
      internal.workspaceTerminals.clearProjectBackgroundSandboxInternal as any,
      {
        projectId: params.projectId,
      },
    );
  }

  const runtimeProject = await params.ctx.runAction(
    api.projects.ensureCloudProjectVolume as any,
    {
      authSubject: params.authSubject,
      projectId: params.projectId,
    },
  );

  const created = await createDaytonaSandbox({
    config,
    userId: String(params.userId),
    projectId: params.projectId,
    runId: null,
    sourceLabel: "convex_background_terminal",
    projectVolumeId:
      String((runtimeProject as any)?.providerVolumeId ?? "").trim() || null,
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
    config,
    sandboxId: providerSandboxId,
  });
  if (!ready.ok) return ready;

  const toolbox = await getDaytonaToolboxProxyUrl({
    config,
    sandboxId: providerSandboxId,
  });
  if (!toolbox.ok) return toolbox;

  await params.ctx.runMutation(
    internal.workspaceTerminals.setProjectBackgroundSandboxInternal as any,
    {
      projectId: params.projectId,
      providerSandboxId,
      providerSandboxState: String(ready.sandbox.state ?? "").trim() || "started",
      providerSandboxLastSeenAt: Date.now(),
    },
  );

  return {
    ok: true,
    config,
    providerSandboxId,
    toolboxProxyUrl: toolbox.toolboxProxyUrl,
    sandboxCpu: config.sandboxCpu,
    sandboxMemoryGiB: config.sandboxMemoryGiB,
    sandboxDiskGiB: config.sandboxDiskGiB,
  };
}

export async function resolveTerminalSandboxContext(params: {
  ctx: any;
  projectId: string;
  providerSandboxId: string;
  touchProjectBackground?: boolean;
}): Promise<
  | { ok: true; config: DaytonaConfig; toolboxProxyUrl: string }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    }
> {
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
  const ready = await waitForDaytonaSandboxReady({
    config,
    sandboxId: params.providerSandboxId,
    timeoutMs: 10_000,
  });
  if (!ready.ok) {
    return ready;
  }
  const toolbox = await getDaytonaToolboxProxyUrl({
    config,
    sandboxId: params.providerSandboxId,
  });
  if (!toolbox.ok) return toolbox;
  if (params.touchProjectBackground !== false) {
    await params.ctx.runMutation(
      internal.workspaceTerminals.setProjectBackgroundSandboxInternal as any,
      {
        projectId: params.projectId,
        providerSandboxId: params.providerSandboxId,
        providerSandboxState: String(ready.sandbox.state ?? "").trim() || "started",
        providerSandboxLastSeenAt: Date.now(),
      },
    );
  }
  return {
    ok: true,
    config,
    toolboxProxyUrl: toolbox.toolboxProxyUrl,
  };
}

export async function releaseProjectBackgroundSandboxIfIdle(params: {
  ctx: any;
  ownerId: any;
  projectId: string;
  providerSandboxId: string;
}): Promise<void> {
  const activeRows = (await params.ctx.runQuery(
    internal.workspaceTerminals.listProjectWorkspaceTerminalSessionsInternal as any,
    {
      ownerId: params.ownerId,
      projectId: params.projectId,
    },
  )) as any[];
  if (
    activeRows.some(
      (row) =>
        isWorkspaceTerminalActiveStatus(row.status) &&
        String(row.providerSandboxId ?? "").trim() === params.providerSandboxId,
    )
  ) {
    return;
  }

  const project = await params.ctx.runQuery(
    internal.projects.getCloudProjectByIdInternal as any,
    {
      projectId: params.projectId,
    },
  );
  if (String(project?.providerSandboxId ?? "").trim() !== params.providerSandboxId) {
    return;
  }

  const loadedConfig = loadDaytonaConfig();
  if (!loadedConfig.ok) return;
  const config: DaytonaConfig = {
    ...loadedConfig.config,
    autoStopInterval: 0,
  };

  const stopped = await stopDaytonaSandbox({
    config,
    sandboxId: params.providerSandboxId,
  });
  const stopSettled = stopped.ok
    ? await waitForDaytonaSandboxStopped({
        config,
        sandboxId: params.providerSandboxId,
      })
    : ({
        ok: false as const,
        status: stopped.status,
        code: stopped.code,
        message: stopped.message,
      });
  const deleted =
    stopSettled.ok
      ? stopSettled.sandbox === null
        ? ({ ok: true as const })
        : await deleteDaytonaSandbox({
            config,
            sandboxId: params.providerSandboxId,
          })
      : await deleteDaytonaSandbox({
          config,
          sandboxId: params.providerSandboxId,
        });

  if (deleted.ok) {
    const sandboxRows = (await params.ctx.runQuery(
      internal.workspaceTerminals.listWorkspaceTerminalSessionsBySandboxInternal as any,
      {
        providerSandboxId: params.providerSandboxId,
      },
    )) as any[];
    const startedAtCandidates = sandboxRows
      .map((row) => Number(row.startedAt ?? 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    const startedAt =
      startedAtCandidates.length > 0 ? Math.min(...startedAtCandidates) : Date.now();
    try {
      await params.ctx.runMutation(
        internal.workspaceCredits.recordWorkspaceComputeChargeInternal as any,
        {
          chargeKey: params.providerSandboxId,
          userId: params.ownerId,
          projectId: params.projectId,
          runId: buildBackgroundSandboxRunId(
            params.projectId,
            params.providerSandboxId,
          ),
          providerSandboxId: params.providerSandboxId,
          startedAt,
          endedAt: Date.now(),
          sandboxCpu: config.sandboxCpu,
          sandboxMemoryGiB: config.sandboxMemoryGiB,
          sandboxDiskGiB: config.sandboxDiskGiB,
        },
      );
    } catch {
      // Best-effort charge recording after sandbox teardown.
    }
    await params.ctx.runMutation(
      internal.workspaceTerminals.clearProjectBackgroundSandboxInternal as any,
      {
        projectId: params.projectId,
      },
    );
    return;
  }

  await params.ctx.runMutation(
    internal.workspaceTerminals.setProjectBackgroundSandboxInternal as any,
    {
      projectId: params.projectId,
      providerSandboxId: params.providerSandboxId,
      providerSandboxState: "error",
      providerSandboxLastSeenAt: Date.now(),
    },
  );
}
