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
import {
  DAYTONA_WORKSPACE_SESSION_BUDGET_SECONDS,
  DAYTONA_WORKSPACE_SESSION_RESERVE_SECONDS,
  DAYTONA_WORKSPACE_SESSION_RESERVATION_EXPIRY_MS,
  creditsToUsd,
  estimateDaytonaWorkspaceReservationCredits,
  estimateDaytonaWorkspaceComputeUsd,
  PAID_TOOL_PRICING_VERSION,
  PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
  priceDaytonaWorkspaceUsageCredits,
} from "../shared/workspaceCredits";

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
  creditReservationKey?: string | null;
  creditBudgetCredits?: number;
  creditBudgetExpiresAt?: number;
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

function newCreditKey(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

async function settleReservedCreditsBestEffort(params: {
  ctx: any;
  creditKey: string;
  status: "succeeded" | "refunded";
  creditsSettled?: number;
  failureReason?: string | null;
  nowMs?: number;
}): Promise<void> {
  try {
    await params.ctx.runMutation(internal.workspaceCredits.settleCreditsInternal as any, {
      creditKey: params.creditKey,
      status: params.status,
      creditsSettled: params.creditsSettled,
      failureReason: params.failureReason ?? undefined,
      nowMs: params.nowMs ?? Date.now(),
    });
  } catch {
    // Expired-reservation reconciliation is the durable fallback.
  }
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
  creditReservationKey?: string | null;
  creditBudgetCredits?: number | null;
  creditBudgetExpiresAt?: number | null;
}): Promise<DaytonaProbeExecution> {
  const created = await createDaytonaSandbox({
    config: buildRunPinnedDaytonaConfig(params.config),
    userId: params.userId,
    projectId: params.projectId,
    runId: params.runId,
    projectVolumeId: params.projectVolumeId ?? null,
    creditReservationKey: params.creditReservationKey ?? null,
    creditBudgetCredits: params.creditBudgetCredits ?? null,
    creditBudgetExpiresAt: params.creditBudgetExpiresAt ?? null,
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
  const creditBalance = await params.ctx.runQuery(
    internal.workspaceCredits.getWorkspaceCreditBalanceInternal as any,
    {
      userId: params.userId,
    },
  );
  if (!creditBalance) {
    return {
      ok: false,
      status: 402,
      code: "workspace_credits_exhausted",
      message: "Daytona workspaces use paid sandbox compute, so they need tool balance before they run.",
    };
  }
  const remainingCredits =
    Number(creditBalance?.includedCreditsBalance ?? 0) +
    Number(creditBalance?.purchasedCreditsBalance ?? 0);
  if (remainingCredits <= 0) {
    return {
      ok: false,
      status: 402,
      code: "workspace_credits_exhausted",
      message: "Daytona workspaces use paid sandbox compute, so they need tool balance before they run.",
    };
  }

  const loadedDaytonaConfig = loadDaytonaConfig();
  if (!loadedDaytonaConfig.ok) {
    return {
      ok: false,
      status: 503,
      code: loadedDaytonaConfig.code,
      message: loadedDaytonaConfig.message,
    };
  }
  const runPinnedConfig = buildRunPinnedDaytonaConfig(loadedDaytonaConfig.config);
  const creditReservationKey = newCreditKey("daytona");
  const creditBudgetExpiresAt = nowMs + DAYTONA_WORKSPACE_SESSION_BUDGET_SECONDS * 1000;
  const creditBudgetCredits = estimateDaytonaWorkspaceReservationCredits({
    sandboxCpu: runPinnedConfig.sandboxCpu,
    sandboxMemoryGiB: runPinnedConfig.sandboxMemoryGiB,
  });
  const creditBudgetVendorCostUsd = estimateDaytonaWorkspaceComputeUsd({
    durationSeconds: DAYTONA_WORKSPACE_SESSION_RESERVE_SECONDS,
    sandboxCpu: runPinnedConfig.sandboxCpu,
    sandboxMemoryGiB: runPinnedConfig.sandboxMemoryGiB,
  });
  try {
    await params.ctx.runMutation(internal.workspaceCredits.reserveCreditsInternal as any, {
      creditKey: creditReservationKey,
      userId: params.userId,
      projectId: params.projectId,
      runId: params.runId,
      toolName: "daytona_workspace",
      action: "sandbox_session",
      vendor: "daytona",
      credits: creditBudgetCredits,
      rawVendorCostUsd: creditBudgetVendorCostUsd,
      polynetPriceUsd: creditsToUsd(creditBudgetCredits),
      metadata: {
        sandbox_cpu: runPinnedConfig.sandboxCpu,
        sandbox_memory_gib: runPinnedConfig.sandboxMemoryGiB,
        sandbox_disk_gib: runPinnedConfig.sandboxDiskGiB,
        pricing_version: PAID_TOOL_PRICING_VERSION,
        target_gross_margin_bps: PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
      },
      expiresAt: nowMs + DAYTONA_WORKSPACE_SESSION_RESERVATION_EXPIRY_MS,
      nowMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: 402,
      code: message === "credits_exhausted" ? "workspace_credits_exhausted" : "workspace_credits_unavailable",
      message:
        message === "credits_exhausted"
          ? "Daytona workspaces use paid sandbox compute, so they need tool balance before they run."
          : "Tool balance is unavailable for workspace tools.",
    };
  }

  let runtimeProject: any;
  try {
    runtimeProject = await params.ctx.runAction(api.projects.ensureCloudProjectVolume as any, {
      authSubject: params.authSubject,
      projectId: params.projectId,
    });
  } catch (error) {
    await settleReservedCreditsBestEffort({
      ctx: params.ctx,
      creditKey: creditReservationKey,
      status: "refunded",
      failureReason: "project_volume_unavailable",
      nowMs: Date.now(),
    });
    return {
      ok: false,
      status: 503,
      code: "project_volume_unavailable",
      message:
        error instanceof Error && error.message
          ? error.message
          : "Project volume is unavailable.",
    };
  }
  const projectVolumeId = String((runtimeProject as any)?.providerVolumeId ?? "").trim() || null;

  let probe: Awaited<ReturnType<typeof executeDaytonaProbeToolCall>>;
  try {
    probe = await executeDaytonaProbeToolCall({
      config: runPinnedConfig,
      userId: params.userId,
      projectId: params.projectId,
      runId: params.runId,
      projectVolumeId,
      creditReservationKey,
      creditBudgetCredits,
      creditBudgetExpiresAt,
    });
  } catch (error) {
    await settleReservedCreditsBestEffort({
      ctx: params.ctx,
      creditKey: creditReservationKey,
      status: "refunded",
      failureReason: "daytona_probe_threw",
      nowMs: Date.now(),
    });
    const message = error instanceof Error ? error.message : String(error ?? "");
    return {
      ok: false,
      status: 503,
      code: "daytona_probe_failed",
      message: message || "Failed to create Daytona workspace.",
    };
  }
  if (!probe.ok) {
    await settleReservedCreditsBestEffort({
      ctx: params.ctx,
      creditKey: creditReservationKey,
      status: "refunded",
      failureReason: probe.code,
      nowMs: Date.now(),
    });
    return probe;
  }
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
      creditReservationKey,
      creditBudgetCredits,
      creditBudgetExpiresAt,
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
      const durationSeconds = Math.max(0, (endedAt - params.session.startedAt) / 1000);
      const computeCostUsd = estimateDaytonaWorkspaceComputeUsd({
        durationSeconds,
        sandboxCpu: params.session.sandboxCpu,
        sandboxMemoryGiB: params.session.sandboxMemoryGiB,
      });
      const creditReservationKey = String(params.session.creditReservationKey ?? "").trim();
      const creditsDebited = creditReservationKey
        ? Math.min(
            Number(params.session.creditBudgetCredits ?? 0),
            priceDaytonaWorkspaceUsageCredits({ computeCostUsd }),
          )
        : priceDaytonaWorkspaceUsageCredits({ computeCostUsd });
      if (creditReservationKey) {
        await settleReservedCreditsBestEffort({
          ctx: params.ctx,
          creditKey: creditReservationKey,
          status: "succeeded",
          creditsSettled: creditsDebited,
          nowMs: endedAt,
        });
      }
      await params.ctx.runMutation(internal.workspaceCredits.recordWorkspaceComputeChargeInternal as any, {
        chargeKey: params.session.providerSandboxId,
        userId: params.userId,
        projectId: params.projectId,
        runId: params.runId,
        providerSandboxId: params.session.providerSandboxId,
        startedAt: params.session.startedAt,
        endedAt,
        durationSeconds,
        sandboxCpu: params.session.sandboxCpu,
        sandboxMemoryGiB: params.session.sandboxMemoryGiB,
        sandboxDiskGiB: params.session.sandboxDiskGiB,
        computeCostUsd,
        creditsDebited,
        creditReservationKey,
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
