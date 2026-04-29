import { api, internal } from "./_generated/api";
import {
  DAYTONA_WORKSPACE_ROOT,
  createDaytonaSandbox,
  deleteDaytonaSandbox,
  getDaytonaToolboxProxyUrl,
  loadDaytonaConfig,
  stopDaytonaSandbox,
  waitForDaytonaSandboxReady,
  waitForDaytonaSandboxStopped,
  type DaytonaConfig,
} from "./daytonaSandboxClient";
import { executeDaytonaCommand } from "./daytonaToolboxExecutor";
import { isCreatorDevTierOverrideEmail } from "../shared/devTierOverride";

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
  sandboxCpu: number;
  sandboxMemoryGiB: number;
  sandboxDiskGiB: number;
  startedAt: number;
  lifecycleMode: "native_stop_delete" | "manual_delete_fallback";
};

export type WorkspaceSandboxCleanupResult = {
  ok: boolean;
  stopStatus: "ok" | "error";
  stopCode: string | null;
  stopMessage: string | null;
  deleteStatus: "ok" | "error";
  deleteCode: string | null;
  deleteMessage: string | null;
  chargeRecorded: boolean;
  chargeErrorMessage: string | null;
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

export async function resolveWorkspaceProjectContext(params: {
  ctx: any;
  projectId?: string | null;
  authSubject?: string | null;
}): Promise<{ label: string | null; description: string | null }> {
  if (!params.projectId || !params.authSubject) {
    return { label: null, description: null };
  }
  const row = await params.ctx.runQuery(api.projects.getCloudProjectById as any, {
    projectId: params.projectId,
    authSubject: params.authSubject,
  });
  if (!row) {
    return { label: null, description: null };
  }
  const normalizedLabel = String(row.name ?? "").trim();
  const label =
    !normalizedLabel || normalizedLabel.toLowerCase() === "workspace"
      ? "Project 1"
      : normalizedLabel;
  const description = String(row.description ?? "").trim() || null;
  return { label, description };
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
  userId: any;
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
  const nowMs = Date.now();
  const canonicalTier = await params.ctx.runQuery(api.entitlements.getCanonicalTierByUserId as any, {
    userId: params.userId,
  });
  if (canonicalTier === "free") {
    return {
      ok: false,
      status: 403,
      code: "plan_required",
      message: "Workspace tools require Builder access.",
    };
  }
  const runtimeActor = await params.ctx.runQuery(
    internal.authActor.resolveAuthenticatedActorInternal as any,
    {
      authSubject: params.authSubject,
    },
  );
  const creatorDevCreditBypass = isCreatorDevTierOverrideEmail(runtimeActor?.email ?? null);
  let creditBalance = await params.ctx.runQuery(
    internal.workspaceCredits.getWorkspaceCreditBalanceInternal as any,
    {
      userId: params.userId,
    },
  );
  if (canonicalTier !== "free") {
    let provisioningWindow:
      | { cycleStartedAt: number; cycleEndsAt: number }
      | null = null;
    const latestBuilderBillingCycle = await params.ctx.runQuery(
      internal.builderCommerce.getLatestBuilderBillingCycleForOwnerInternal as any,
      {
        ownerUserId: params.userId,
      },
    );
    if (
      typeof latestBuilderBillingCycle?.currentPeriodStartAt === "number" &&
      typeof latestBuilderBillingCycle?.currentPeriodEndAt === "number"
    ) {
      provisioningWindow = {
        cycleStartedAt: latestBuilderBillingCycle.currentPeriodStartAt,
        cycleEndsAt: latestBuilderBillingCycle.currentPeriodEndAt,
      };
    } else {
      provisioningWindow = await params.ctx.runQuery(
        internal.workspaceCredits.getActiveBuilderCreditProvisioningWindowInternal as any,
        {
          userId: params.userId,
          nowMs,
        },
      );
    }
    const needsProvisioningSync =
      !!provisioningWindow &&
      (!creditBalance ||
        creditBalance.includedCycleStartedAt !== provisioningWindow.cycleStartedAt ||
        creditBalance.includedCycleEndsAt !== provisioningWindow.cycleEndsAt);
    if (provisioningWindow && needsProvisioningSync) {
      await params.ctx.runMutation(internal.workspaceCredits.syncBuilderMonthlyCreditsInternal as any, {
        userId: params.userId,
        targetTier: canonicalTier === "architect" ? "architect" : "builder",
        grantsAccess: true,
        cycleStartedAt: provisioningWindow.cycleStartedAt,
        cycleEndsAt: provisioningWindow.cycleEndsAt,
        nowMs,
      });
      creditBalance = await params.ctx.runQuery(
        internal.workspaceCredits.getWorkspaceCreditBalanceInternal as any,
        {
          userId: params.userId,
        },
      );
    }
  }
  if (!creditBalance && canonicalTier !== "free" && !creatorDevCreditBypass) {
    return {
      ok: false,
      status: 503,
      code: "workspace_credits_unavailable",
      message: "Workspace compute credits are unavailable for this account.",
    };
  }
  const remainingCredits =
    Number(creditBalance?.includedCreditsBalance ?? 0) +
    Number(creditBalance?.purchasedCreditsBalance ?? 0);
  if (creatorDevCreditBypass) {
    console.info("[workspace_tools] creator dev credit bypass active", {
      userId: String(params.userId),
      canonicalTier,
      hasCreditBalance: Boolean(creditBalance),
      remainingCredits,
    });
  }
  if (creditBalance && remainingCredits <= 0 && !creatorDevCreditBypass) {
    return {
      ok: false,
      status: 402,
      code: "workspace_credits_exhausted",
      message: "You've used your included workspace compute credits.",
    };
  }

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
      sandboxCpu: runPinnedConfig.sandboxCpu,
      sandboxMemoryGiB: runPinnedConfig.sandboxMemoryGiB,
      sandboxDiskGiB: runPinnedConfig.sandboxDiskGiB,
      startedAt: Date.now(),
      lifecycleMode: probe.lifecycleMode,
    },
  };
}

export async function cleanupTemporaryWorkspaceSandboxSession(params: {
  ctx: any;
  userId: any;
  session: WorkspaceSandboxSession;
  runId: string;
  projectId: string;
}): Promise<WorkspaceSandboxCleanupResult> {
  const stopped = await stopDaytonaSandbox({
    config: params.session.config,
    sandboxId: params.session.providerSandboxId,
  });

  const stopSettled = stopped.ok
    ? await waitForDaytonaSandboxStopped({
        config: params.session.config,
        sandboxId: params.session.providerSandboxId,
      })
    : { ok: false as const, status: stopped.status, code: stopped.code, message: stopped.message, details: stopped.details };

  const deleted =
    stopSettled.ok
      ? stopSettled.sandbox === null
        ? ({ ok: true as const })
        : await deleteDaytonaSandbox({
            config: params.session.config,
            sandboxId: params.session.providerSandboxId,
          })
      : ({
          ok: false as const,
          status: stopSettled.status,
          code: stopSettled.code,
          message: stopSettled.message,
          details: stopSettled.details,
        });

  const computeTerminated = stopSettled.ok || deleted.ok;
  let chargeRecorded = false;
  let chargeErrorMessage: string | null = null;
  if (computeTerminated) {
    const endedAt = Date.now();
    try {
      await params.ctx.runMutation(internal.workspaceCredits.recordWorkspaceComputeChargeInternal as any, {
        chargeKey: params.session.providerSandboxId,
        userId: params.userId,
        projectId: params.projectId,
        runId: params.runId,
        providerSandboxId: params.session.providerSandboxId,
        startedAt: params.session.startedAt,
        endedAt,
        sandboxCpu: params.session.sandboxCpu,
        sandboxMemoryGiB: params.session.sandboxMemoryGiB,
        sandboxDiskGiB: params.session.sandboxDiskGiB,
      });
      chargeRecorded = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      chargeErrorMessage =
        message || "Failed to record workspace compute charge.";
    }
  }
  return {
    ok: deleted.ok,
    stopStatus: stopped.ok ? "ok" : "error",
    stopCode: stopped.ok ? null : stopped.code,
    stopMessage: stopped.ok ? null : stopped.message,
    deleteStatus: deleted.ok ? "ok" : "error",
    deleteCode: deleted.ok ? null : deleted.code,
    deleteMessage: deleted.ok ? null : deleted.message,
    chargeRecorded,
    chargeErrorMessage,
  };
}
