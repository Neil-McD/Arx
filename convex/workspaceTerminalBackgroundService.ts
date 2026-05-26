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
import { settleReservedCreditsBestEffort } from "./workspaceCreditSettlement";
import {
  DAYTONA_WORKSPACE_SESSION_HOLD_SECONDS,
  DAYTONA_WORKSPACE_SESSION_IDLE_AUTOSTOP_MINUTES,
  DAYTONA_WORKSPACE_SESSION_MAX_SECONDS,
  DAYTONA_WORKSPACE_SESSION_RESERVATION_EXPIRY_MS,
  creditsToUsd,
  estimateDaytonaWorkspaceComputeUsd,
  estimateDaytonaWorkspaceReservationCredits,
  PAID_TOOL_PRICING_VERSION,
  PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
  priceDaytonaWorkspaceUsageCredits,
} from "../shared/workspaceCredits";
import {
  resolveRecordedWorkspaceResourceProviderId,
  type WorkspaceComputerProviderId,
} from "../shared/workspaceComputerProvider";

const PROJECT_BACKGROUND_SANDBOX_CREATE_LEASE_MS = 60_000;
const PROJECT_BACKGROUND_SANDBOX_WAIT_MS = 65_000;
const PROJECT_BACKGROUND_SANDBOX_WAIT_POLL_MS = 1_000;

function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function workspaceProviderMismatchFailure(params: {
  resourceKind: "sandbox" | "volume";
  expectedProviderId: WorkspaceComputerProviderId;
  actualProviderId: WorkspaceComputerProviderId | null;
}) {
  return {
    ok: false as const,
    status: 409,
    code: "workspace_computer_provider_mismatch",
    message: "This workspace computer is managed by a different provider.",
    details: {
      resource_kind: params.resourceKind,
      expected_provider_id: params.expectedProviderId,
      actual_provider_id: params.actualProviderId,
    },
  };
}

function isProjectBackgroundSandboxGoneFailure(value: unknown): boolean {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const details =
    record.details && typeof record.details === "object" && !Array.isArray(record.details)
      ? (record.details as Record<string, unknown>)
      : {};
  const code = normalizeString(record.code).toLowerCase();
  const status = Number(details.response_status ?? record.status);
  const text = [
    record.message,
    details.response_text,
  ].map((part) => normalizeString(part).toLowerCase()).join("\n");
  return (
    code === "sandbox_not_found" ||
    code === "background_sandbox_not_found" ||
    status === 404 ||
    text.includes("not found") ||
    text.includes("failed (404)")
  );
}

function buildBackgroundSandboxRunId(
  projectId: string,
  providerSandboxId?: string | null,
): string {
  const sandboxId = normalizeString(providerSandboxId ?? "");
  if (sandboxId) return `background_terminal:${projectId}:${sandboxId}`;
  return `background_terminal:${projectId}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function newCreditKey(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function readPositiveNumber(value: unknown, fallback: number): number {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
}

function readBackgroundCreditReservation(project: any): {
  creditReservationKey: string | null;
  creditBudgetCredits: number;
  creditBudgetExpiresAt: number;
  startedAt: number | null;
} {
  return {
    creditReservationKey: normalizeOptionalString(project?.providerSandboxCreditReservationKey),
    creditBudgetCredits: readPositiveNumber(project?.providerSandboxCreditBudgetCredits, 0),
    creditBudgetExpiresAt: readPositiveNumber(project?.providerSandboxCreditBudgetExpiresAt, 0),
    startedAt: readPositiveNumber(project?.providerSandboxStartedAt, 0) || null,
  };
}

async function waitForProjectBackgroundSandboxRegistration(params: {
  ctx: any;
  authSubject: string | null | undefined;
  userId: any;
  projectId: string;
}): Promise<Awaited<ReturnType<typeof resolveProjectBackgroundSandboxIfReady>> | null> {
  const deadlineMs = Date.now() + PROJECT_BACKGROUND_SANDBOX_WAIT_MS;
  while (Date.now() < deadlineMs) {
    const resolved = await resolveProjectBackgroundSandboxIfReady({
      ctx: params.ctx,
      authSubject: params.authSubject,
      userId: params.userId,
      projectId: params.projectId,
    });
    if (resolved.ok) return resolved;

    const project = await params.ctx.runQuery(
      api.projects.getCloudProjectById as any,
      {
        authSubject: params.authSubject,
        ownerId: params.userId,
        projectId: params.projectId,
      },
    );
    const state = normalizeOptionalString(project?.providerSandboxState);
    const lastSeenAt = Number(project?.providerSandboxLastSeenAt ?? 0);
    const leaseAgeMs =
      Number.isFinite(lastSeenAt) && lastSeenAt > 0
        ? Math.max(0, Date.now() - lastSeenAt)
        : PROJECT_BACKGROUND_SANDBOX_CREATE_LEASE_MS + 1;
    if (
      state !== "creating" ||
      leaseAgeMs >= PROJECT_BACKGROUND_SANDBOX_CREATE_LEASE_MS
    ) {
      return null;
    }
    await sleep(
      Math.min(
        PROJECT_BACKGROUND_SANDBOX_WAIT_POLL_MS,
        Math.max(0, deadlineMs - Date.now()),
      ),
    );
  }
  return null;
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
      projectVolumeId: string | null;
      sandboxCpu: number;
      sandboxMemoryGiB: number;
      sandboxDiskGiB: number;
      startedAt: number;
      creditReservationKey: string | null;
      creditBudgetCredits: number;
      creditBudgetExpiresAt: number;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
> {
  const existing = await resolveProjectBackgroundSandboxIfReady({
    ctx: params.ctx,
    authSubject: params.authSubject,
    userId: params.userId,
    projectId: params.projectId,
  });
  if (existing.ok) return existing;
  if (existing.code === "workspace_credits_exhausted") return existing;
  if (existing.code === "workspace_computer_provider_mismatch") return existing;

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
      message: "Computer not found.",
    };
  }
  const projectVolumeId = normalizeOptionalString(project.providerVolumeId);
  const projectVolumeProviderId = resolveRecordedWorkspaceResourceProviderId({
    providerId: project.providerVolumeProviderId,
    resourceId: projectVolumeId,
  });
  if (projectVolumeId && projectVolumeProviderId !== "daytona") {
    return workspaceProviderMismatchFailure({
      resourceKind: "volume",
      expectedProviderId: "daytona",
      actualProviderId: projectVolumeProviderId,
    });
  }

  let leaseAcquired = false;
  for (let attempt = 0; attempt < 2 && !leaseAcquired; attempt += 1) {
    const lease = await params.ctx.runMutation(
      internal.workspaceTerminals.acquireProjectBackgroundSandboxLeaseInternal as any,
      {
        projectId: params.projectId,
        ownerId: params.userId,
        nowMs: Date.now(),
      },
    );
    if (Boolean((lease as { acquired?: unknown } | null)?.acquired)) {
      leaseAcquired = true;
      break;
    }
    const waited = await waitForProjectBackgroundSandboxRegistration({
      ctx: params.ctx,
      authSubject: params.authSubject,
      userId: params.userId,
      projectId: params.projectId,
    });
    if (waited?.ok) return waited;
  }
  if (!leaseAcquired) {
    return {
      ok: false,
      status: 409,
      code: "background_sandbox_creation_in_progress",
      message:
        "A background workspace is already starting for this computer. Retry once it finishes.",
    };
  }

  const clearCreationLease = async () => {
    try {
      await params.ctx.runMutation(
        internal.workspaceTerminals.clearProjectBackgroundSandboxLeaseInternal as any,
        {
          projectId: params.projectId,
          ownerId: params.userId,
          nowMs: Date.now(),
        },
      );
    } catch {
      // Best-effort lease cleanup; the short lease will expire if this fails.
    }
  };

  const loadedConfig = loadDaytonaConfig();
  if (!loadedConfig.ok) {
    await clearCreationLease();
    return {
      ok: false,
      status: 503,
      code: loadedConfig.code,
      message: loadedConfig.message,
    };
  }
  const config: DaytonaConfig = {
    ...loadedConfig.config,
    autoStopInterval: DAYTONA_WORKSPACE_SESSION_IDLE_AUTOSTOP_MINUTES,
  };

  const creditReservationKey = newCreditKey("daytona_bg");
  const creditBudgetCredits = estimateDaytonaWorkspaceReservationCredits({
    sandboxCpu: config.sandboxCpu,
    sandboxMemoryGiB: config.sandboxMemoryGiB,
  });
  const creditBudgetVendorCostUsd = estimateDaytonaWorkspaceComputeUsd({
    durationSeconds: DAYTONA_WORKSPACE_SESSION_HOLD_SECONDS,
    sandboxCpu: config.sandboxCpu,
    sandboxMemoryGiB: config.sandboxMemoryGiB,
  });
  const reservedAt = Date.now();
  const creditBudgetExpiresAt = reservedAt + DAYTONA_WORKSPACE_SESSION_MAX_SECONDS * 1000;
  try {
    await params.ctx.runMutation(
      internal.workspaceCredits.reserveCreditsInternal as any,
      {
        creditKey: creditReservationKey,
        userId: params.userId,
        projectId: params.projectId,
        runId: buildBackgroundSandboxRunId(params.projectId),
        toolName: "daytona_workspace",
        action: "background_sandbox",
        vendor: "daytona",
        credits: creditBudgetCredits,
        rawVendorCostUsd: creditBudgetVendorCostUsd,
        polynetPriceUsd: creditsToUsd(creditBudgetCredits),
        metadata: {
          sandbox_cpu: config.sandboxCpu,
          sandbox_memory_gib: config.sandboxMemoryGiB,
          sandbox_disk_gib: config.sandboxDiskGiB,
          hold_seconds: DAYTONA_WORKSPACE_SESSION_HOLD_SECONDS,
          max_seconds: DAYTONA_WORKSPACE_SESSION_MAX_SECONDS,
          idle_autostop_minutes: DAYTONA_WORKSPACE_SESSION_IDLE_AUTOSTOP_MINUTES,
          billing_mode: "raw_elapsed_seconds",
          pricing_version: PAID_TOOL_PRICING_VERSION,
          target_gross_margin_bps: PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
        },
        expiresAt: reservedAt + DAYTONA_WORKSPACE_SESSION_RESERVATION_EXPIRY_MS,
        nowMs: reservedAt,
      },
    );
  } catch (error) {
    await clearCreationLease();
    const message = error instanceof Error ? error.message : String(error ?? "");
    return {
      ok: false,
      status: 402,
      code: message === "credits_exhausted" ? "workspace_credits_exhausted" : "workspace_credits_unavailable",
      message:
        message === "credits_exhausted"
          ? "Workspace tools use paid sandbox compute, so they need tool balance before they run."
          : "Tool balance is unavailable for workspace tools.",
      details: {
        tool_kind: "workspace_tools",
        required_credits: creditBudgetCredits,
      },
    };
  }

  let runtimeProject: any;
  try {
    runtimeProject = await params.ctx.runAction(
      api.projects.ensureCloudProjectVolume as any,
      {
        authSubject: params.authSubject,
        projectId: params.projectId,
      },
    );
  } catch (error) {
    await clearCreationLease();
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

  const created = await createDaytonaSandbox({
    config,
    userId: String(params.userId),
    projectId: params.projectId,
    runId: null,
    sourceLabel: "convex_background_terminal",
    projectVolumeId:
      String((runtimeProject as any)?.providerVolumeId ?? "").trim() || null,
  });
  if (!created.ok) {
    await clearCreationLease();
    await settleReservedCreditsBestEffort({
      ctx: params.ctx,
      creditKey: creditReservationKey,
      status: "refunded",
      failureReason: created.code,
    });
    return created;
  }

  const providerSandboxId = String(created.sandbox.id ?? "").trim();
  if (!providerSandboxId) {
    await clearCreationLease();
    await settleReservedCreditsBestEffort({
      ctx: params.ctx,
      creditKey: creditReservationKey,
      status: "refunded",
      failureReason: "sandbox_id_missing",
    });
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
  if (!ready.ok) {
    await clearCreationLease();
    try {
      await stopDaytonaSandbox({ config, sandboxId: providerSandboxId });
      await deleteDaytonaSandbox({ config, sandboxId: providerSandboxId });
    } catch {
      // Orphan reconciliation will clean up if Daytona cleanup fails here.
    }
    await settleReservedCreditsBestEffort({
      ctx: params.ctx,
      creditKey: creditReservationKey,
      status: "refunded",
      failureReason: ready.code,
    });
    return ready;
  }

  const toolbox = await getDaytonaToolboxProxyUrl({
    config,
    sandboxId: providerSandboxId,
  });
  if (!toolbox.ok) {
    await clearCreationLease();
    try {
      await stopDaytonaSandbox({ config, sandboxId: providerSandboxId });
      await deleteDaytonaSandbox({ config, sandboxId: providerSandboxId });
    } catch {
      // Orphan reconciliation will clean up if Daytona cleanup fails here.
    }
    await settleReservedCreditsBestEffort({
      ctx: params.ctx,
      creditKey: creditReservationKey,
      status: "refunded",
      failureReason: toolbox.code,
    });
    return toolbox;
  }

  const sandboxStartedAt = Date.now();
  try {
    await params.ctx.runMutation(
      internal.workspaceTerminals.setProjectBackgroundSandboxInternal as any,
      {
        projectId: params.projectId,
        providerSandboxId,
        providerSandboxProviderId: "daytona",
        providerSandboxState: String(ready.sandbox.state ?? "").trim() || "started",
        providerSandboxLastSeenAt: sandboxStartedAt,
        providerSandboxStartedAt: sandboxStartedAt,
        providerSandboxCreditReservationKey: creditReservationKey,
        providerSandboxCreditBudgetCredits: creditBudgetCredits,
        providerSandboxCreditBudgetExpiresAt: creditBudgetExpiresAt,
      },
    );
  } catch {
    await clearCreationLease();
    try {
      await stopDaytonaSandbox({ config, sandboxId: providerSandboxId });
      await deleteDaytonaSandbox({ config, sandboxId: providerSandboxId });
    } catch {
      // Orphan reconciliation will clean up if Daytona cleanup fails here.
    }
    await settleReservedCreditsBestEffort({
      ctx: params.ctx,
      creditKey: creditReservationKey,
      status: "refunded",
      failureReason: "background_sandbox_register_failed",
    });
    return {
      ok: false,
      status: 500,
      code: "background_sandbox_register_failed",
      message: "Failed to register the background workspace.",
    };
  }

  return {
    ok: true,
    config,
    providerSandboxId,
    toolboxProxyUrl: toolbox.toolboxProxyUrl,
    projectVolumeId:
      String((runtimeProject as any)?.providerVolumeId ?? "").trim() || null,
    sandboxCpu: config.sandboxCpu,
    sandboxMemoryGiB: config.sandboxMemoryGiB,
    sandboxDiskGiB: config.sandboxDiskGiB,
    startedAt: sandboxStartedAt,
    creditReservationKey,
    creditBudgetCredits,
    creditBudgetExpiresAt,
  };
}

export async function resolveProjectBackgroundSandboxIfReady(params: {
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
      projectVolumeId: string | null;
      sandboxCpu: number;
      sandboxMemoryGiB: number;
      sandboxDiskGiB: number;
      startedAt: number;
      creditReservationKey: string | null;
      creditBudgetCredits: number;
      creditBudgetExpiresAt: number;
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
      message: "Computer not found.",
    };
  }

  const existingSandboxId = normalizeOptionalString(project.providerSandboxId);
  if (!existingSandboxId) {
    return {
      ok: false,
      status: 404,
      code: "background_sandbox_not_found",
      message: "No active computer background sandbox is registered.",
    };
  }
  const existingSandboxProviderId = resolveRecordedWorkspaceResourceProviderId({
    providerId: project.providerSandboxProviderId,
    resourceId: existingSandboxId,
  });
  if (existingSandboxProviderId !== "daytona") {
    return workspaceProviderMismatchFailure({
      resourceKind: "sandbox",
      expectedProviderId: "daytona",
      actualProviderId: existingSandboxProviderId,
    });
  }
  const existingProjectVolumeId = normalizeOptionalString(project.providerVolumeId);
  const existingVolumeProviderId = resolveRecordedWorkspaceResourceProviderId({
    providerId: project.providerVolumeProviderId,
    resourceId: existingProjectVolumeId,
  });
  if (existingProjectVolumeId && existingVolumeProviderId !== "daytona") {
    return workspaceProviderMismatchFailure({
      resourceKind: "volume",
      expectedProviderId: "daytona",
      actualProviderId: existingVolumeProviderId,
    });
  }
  const credit = readBackgroundCreditReservation(project);
  if (
    credit.creditBudgetExpiresAt > 0 &&
    Date.now() >= credit.creditBudgetExpiresAt
  ) {
    await releaseProjectBackgroundSandboxIfIdle({
      ctx: params.ctx,
      ownerId: params.userId,
      projectId: params.projectId,
      providerSandboxId: existingSandboxId,
    });
    const refreshedProject = await params.ctx.runQuery(api.projects.getCloudProjectById as any, {
      authSubject: params.authSubject,
      ownerId: params.userId,
      projectId: params.projectId,
    });
    if (normalizeOptionalString(refreshedProject?.providerSandboxId) !== existingSandboxId) {
      return {
        ok: false,
        status: 404,
        code: "background_sandbox_not_found",
        message: "Turn on computer to view files.",
      };
    }
    return {
      ok: false,
      status: 402,
      code: "workspace_credits_exhausted",
      message: "This workspace tool budget expired. Add balance to keep using workspace tools.",
      details: {
        tool_kind: "workspace_tools",
      },
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
    autoStopInterval: DAYTONA_WORKSPACE_SESSION_IDLE_AUTOSTOP_MINUTES,
  };

  const ready = await waitForDaytonaSandboxReady({
    config,
    sandboxId: existingSandboxId,
    timeoutMs: 10_000,
  });
  if (!ready.ok) {
    if (isProjectBackgroundSandboxGoneFailure(ready)) {
      await releaseProjectBackgroundSandboxIfIdle({
        ctx: params.ctx,
        ownerId: params.userId,
        projectId: params.projectId,
        providerSandboxId: existingSandboxId,
      });
      return {
        ok: false,
        status: 404,
        code: "background_sandbox_not_found",
        message: "Turn on computer to view files.",
      };
    }
    await params.ctx.runMutation(
      internal.workspaceTerminals.clearProjectBackgroundSandboxInternal as any,
      {
        projectId: params.projectId,
        providerSandboxId: existingSandboxId,
        providerSandboxProviderId: "daytona",
      },
    );
    return {
      ok: false,
      status: ready.status,
      code: ready.code,
      message: ready.message,
    };
  }

  const toolbox = await getDaytonaToolboxProxyUrl({
    config,
    sandboxId: existingSandboxId,
  });
  if (!toolbox.ok) {
    await params.ctx.runMutation(
      internal.workspaceTerminals.clearProjectBackgroundSandboxInternal as any,
      {
        projectId: params.projectId,
        providerSandboxId: existingSandboxId,
        providerSandboxProviderId: "daytona",
      },
    );
    return {
      ok: false,
      status: toolbox.status,
      code: toolbox.code,
      message: toolbox.message,
    };
  }

  await params.ctx.runMutation(
    internal.workspaceTerminals.setProjectBackgroundSandboxInternal as any,
    {
      projectId: params.projectId,
      providerSandboxId: existingSandboxId,
      providerSandboxProviderId: "daytona",
      providerSandboxState: String(ready.sandbox.state ?? "").trim() || "started",
      providerSandboxLastSeenAt: Date.now(),
    },
  );

  return {
    ok: true,
    config,
    providerSandboxId: existingSandboxId,
    toolboxProxyUrl: toolbox.toolboxProxyUrl,
    projectVolumeId: existingProjectVolumeId,
    sandboxCpu: config.sandboxCpu,
    sandboxMemoryGiB: config.sandboxMemoryGiB,
    sandboxDiskGiB: config.sandboxDiskGiB,
    startedAt: credit.startedAt ?? Date.now(),
    creditReservationKey: credit.creditReservationKey,
    creditBudgetCredits: credit.creditBudgetCredits,
    creditBudgetExpiresAt: credit.creditBudgetExpiresAt,
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
      details?: Record<string, unknown>;
    }
> {
  const project = await params.ctx.runQuery(
    internal.projects.getCloudProjectByIdInternal as any,
    {
      projectId: params.projectId,
    },
  );
  if (
    String(project?.providerSandboxId ?? "").trim() === params.providerSandboxId
  ) {
    const providerId = resolveRecordedWorkspaceResourceProviderId({
      providerId: project?.providerSandboxProviderId,
      resourceId: project?.providerSandboxId,
    });
    if (providerId !== "daytona") {
      return workspaceProviderMismatchFailure({
        resourceKind: "sandbox",
        expectedProviderId: "daytona",
        actualProviderId: providerId,
      });
    }
    const credit = readBackgroundCreditReservation(project);
    if (
      credit.creditBudgetExpiresAt > 0 &&
      Date.now() >= credit.creditBudgetExpiresAt
    ) {
      return {
        ok: false,
        status: 402,
        code: "workspace_credits_exhausted",
        message: "This workspace tool budget expired. Add balance to keep using workspace tools.",
        details: {
          tool_kind: "workspace_tools",
        },
      };
    }
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
    autoStopInterval: DAYTONA_WORKSPACE_SESSION_IDLE_AUTOSTOP_MINUTES,
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
        providerSandboxProviderId: "daytona",
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
  const providerId = resolveRecordedWorkspaceResourceProviderId({
    providerId: project?.providerSandboxProviderId,
    resourceId: project?.providerSandboxId,
  });
  if (providerId !== "daytona") {
    return;
  }

  const loadedConfig = loadDaytonaConfig();
  if (!loadedConfig.ok) return;
  const config: DaytonaConfig = {
    ...loadedConfig.config,
    autoStopInterval: DAYTONA_WORKSPACE_SESSION_IDLE_AUTOSTOP_MINUTES,
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
    const credit = readBackgroundCreditReservation(project);
    const startedAt =
      credit.startedAt ??
      (startedAtCandidates.length > 0 ? Math.min(...startedAtCandidates) : Date.now());
    try {
      const endedAt = Date.now();
      const durationSeconds = Math.max(0, (endedAt - startedAt) / 1000);
      const computeCostUsd = estimateDaytonaWorkspaceComputeUsd({
        durationSeconds,
        sandboxCpu: config.sandboxCpu,
        sandboxMemoryGiB: config.sandboxMemoryGiB,
      });
      const creditsDebited = priceDaytonaWorkspaceUsageCredits({ computeCostUsd });
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
          endedAt,
          durationSeconds,
          sandboxCpu: config.sandboxCpu,
          sandboxMemoryGiB: config.sandboxMemoryGiB,
          sandboxDiskGiB: config.sandboxDiskGiB,
          computeCostUsd,
          creditsDebited,
          creditReservationKey: credit.creditReservationKey,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "");
      const durationSeconds = Math.max(0, (Date.now() - startedAt) / 1000);
      const computeCostUsd = estimateDaytonaWorkspaceComputeUsd({
        durationSeconds,
        sandboxCpu: config.sandboxCpu,
        sandboxMemoryGiB: config.sandboxMemoryGiB,
      });
      const creditReservationKey = String(credit.creditReservationKey ?? "").trim();
      if (creditReservationKey) {
        try {
          await params.ctx.runMutation(internal.workspaceCredits.queueCreditSettlementRetryInternal as any, {
            creditKey: creditReservationKey,
            status: "succeeded",
            creditsSettled: priceDaytonaWorkspaceUsageCredits({ computeCostUsd }),
            rawVendorCostUsd: computeCostUsd,
            metadata: {
              settlement_source: "workspace_compute_charge_recording_failed",
              provider_sandbox_id: params.providerSandboxId,
              duration_seconds: durationSeconds,
            },
            error: message || "Failed to record workspace compute charge.",
          });
        } catch {
          // Best-effort recovery queue after sandbox teardown.
        }
      }
    }
    await params.ctx.runMutation(
      internal.workspaceTerminals.clearProjectBackgroundSandboxInternal as any,
      {
        projectId: params.projectId,
        providerSandboxId: params.providerSandboxId,
        providerSandboxProviderId: "daytona",
      },
    );
    return;
  }

  await params.ctx.runMutation(
    internal.workspaceTerminals.setProjectBackgroundSandboxInternal as any,
    {
      projectId: params.projectId,
      providerSandboxId: params.providerSandboxId,
      providerSandboxProviderId: "daytona",
      providerSandboxState: "error",
      providerSandboxLastSeenAt: Date.now(),
    },
  );
}
