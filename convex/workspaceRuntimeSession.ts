import { api, internal } from "./_generated/api";
import {
  ensureBillableBlaxelWorkspaceComputer,
} from "./blaxelWorkspaceWake.ts";
import {
  buildBlaxelProjectWorkspaceNames,
} from "./blaxelWorkspaceProjectNames.ts";
import {
  resolveWorkspaceComputerProviderFromServerEnv,
} from "./workspaceComputerProviderPolicy.ts";
import {
  resolveRecordedWorkspaceResourceProviderId,
  type WorkspaceComputerProviderId,
} from "../shared/workspaceComputerProvider";
import {
  estimateWorkspaceComputeUsd,
} from "../shared/workspaceCredits";
import { recordPlatformToolCostBestEffort } from "./platformToolCostAccounting";

type WorkspaceRuntimeSessionFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type BlaxelRuntimeProjectWorkspaceSession = {
  kind: "project_workspace";
  providerId: "blaxel";
  projectId: string;
  projectVolumeId: string | null;
  providerSandboxId: string;
  workspaceRoot: string;
  startedAt: number;
  creditReservationKey?: string | null;
  creditBudgetCredits?: number;
  creditBudgetExpiresAt?: number;
  sandboxCpu: number;
  sandboxMemoryGiB: number;
  sandboxDiskGiB: number;
  lifecycleMode: "provider_standby";
};

export type BlaxelRuntimeWorkspaceSession = BlaxelRuntimeProjectWorkspaceSession;

export type RuntimeWorkspaceSession = BlaxelRuntimeWorkspaceSession;

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function workspaceProviderMismatchFailure(params: {
  resourceKind: "sandbox" | "volume";
  expectedProviderId: WorkspaceComputerProviderId;
  actualProviderId: WorkspaceComputerProviderId | null;
  resourceId: string | null;
}): WorkspaceRuntimeSessionFailure {
  return {
    ok: false,
    status: 409,
    code: "workspace_computer_provider_mismatch",
    message: "This workspace computer is managed by a different provider.",
    details: {
      resource_kind: params.resourceKind,
      expected_provider_id: params.expectedProviderId,
      actual_provider_id: params.actualProviderId,
      resource_id: params.resourceId,
    },
  };
}

function workspaceResourceMismatchFailure(params: {
  resourceKind: "sandbox" | "volume";
  expectedResourceId: string;
  actualResourceId: string;
}): WorkspaceRuntimeSessionFailure {
  return {
    ok: false,
    status: 409,
    code: "workspace_computer_resource_mismatch",
    message: "This workspace computer is bound to a different provider resource.",
    details: {
      resource_kind: params.resourceKind,
      expected_resource_id: params.expectedResourceId,
      actual_resource_id: params.actualResourceId,
    },
  };
}

function mapProviderFailure(result: {
  status?: number;
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}): WorkspaceRuntimeSessionFailure {
  return {
    ok: false,
    status: Number.isFinite(Number(result.status)) ? Number(result.status) : 503,
    code: String(result.code ?? "workspace_computer_unavailable"),
    message: String(result.message ?? "Workspace computer is unavailable."),
    details: result.details,
  };
}

async function createBlaxelRuntimeWorkspaceSession(params: {
  ctx: any;
  authSubject: string;
  userId: any;
  projectId: string;
  runId?: string | null;
}): Promise<
  | { ok: true; session: BlaxelRuntimeProjectWorkspaceSession }
  | WorkspaceRuntimeSessionFailure
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

  const names = buildBlaxelProjectWorkspaceNames(params.projectId);
  const existingSandboxId = normalizeOptionalString(project.providerSandboxId);
  const existingSandboxProviderId = resolveRecordedWorkspaceResourceProviderId({
    providerId: project.providerSandboxProviderId,
    resourceId: existingSandboxId,
  });
  if (existingSandboxId && existingSandboxProviderId !== "blaxel") {
    return workspaceProviderMismatchFailure({
      resourceKind: "sandbox",
      expectedProviderId: "blaxel",
      actualProviderId: existingSandboxProviderId,
      resourceId: existingSandboxId,
    });
  }
  if (existingSandboxId && existingSandboxId !== names.sandboxName) {
    return workspaceResourceMismatchFailure({
      resourceKind: "sandbox",
      expectedResourceId: names.sandboxName,
      actualResourceId: existingSandboxId,
    });
  }

  const existingVolumeId = normalizeOptionalString(project.providerVolumeId);
  const existingVolumeProviderId = resolveRecordedWorkspaceResourceProviderId({
    providerId: project.providerVolumeProviderId,
    resourceId: existingVolumeId,
  });
  if (existingVolumeId && existingVolumeProviderId !== "blaxel") {
    return workspaceProviderMismatchFailure({
      resourceKind: "volume",
      expectedProviderId: "blaxel",
      actualProviderId: existingVolumeProviderId,
      resourceId: existingVolumeId,
    });
  }
  if (existingVolumeId && existingVolumeId !== names.volumeName) {
    return workspaceResourceMismatchFailure({
      resourceKind: "volume",
      expectedResourceId: names.volumeName,
      actualResourceId: existingVolumeId,
    });
  }

  const ensured = await ensureBillableBlaxelWorkspaceComputer({
    ctx: params.ctx,
    projectId: params.projectId,
    ownerId: params.userId,
    runId: params.runId ?? null,
    lifecycleIntent: "agent_run",
    reservationAction: "runtime_workspace_session",
    labels: {
      purpose: "workspace-agent-tools",
      project_id: String(params.projectId),
      owner_id: String(params.userId),
    },
    clearSandboxAccounting: true,
  });
  if (!ensured.ok) {
    return mapProviderFailure(ensured);
  }

  return {
    ok: true,
    session: {
      kind: "project_workspace",
      providerId: "blaxel",
      projectId: params.projectId,
      projectVolumeId: ensured.projectVolumeId,
      providerSandboxId: ensured.providerSandboxId,
      workspaceRoot: ensured.workspaceRoot,
      startedAt: ensured.startedAt,
      creditReservationKey: ensured.creditReservationKey,
      creditBudgetCredits: ensured.creditBudgetCredits,
      creditBudgetExpiresAt: ensured.creditBudgetExpiresAt,
      sandboxCpu: ensured.sandboxCpu,
      sandboxMemoryGiB: ensured.sandboxMemoryGiB,
      sandboxDiskGiB: ensured.sandboxDiskGiB,
      lifecycleMode: "provider_standby",
    },
  };
}

export async function createProjectRuntimeWorkspaceSession(params: {
  ctx: any;
  authSubject: string | null | undefined;
  userId: any;
  projectId: string | null | undefined;
  runId?: string | null;
}): Promise<
  | { ok: true; session: RuntimeWorkspaceSession }
  | WorkspaceRuntimeSessionFailure
> {
  const authSubject = String(params.authSubject ?? "").trim();
  const projectId = String(params.projectId ?? "").trim();
  if (!authSubject || !projectId) {
    return {
      ok: false,
      status: 400,
      code: "project_required",
      message: "Workspace session requires a bound computer workspace.",
    };
  }

  resolveWorkspaceComputerProviderFromServerEnv();
  return await createBlaxelRuntimeWorkspaceSession({
    ctx: params.ctx,
    authSubject,
    userId: params.userId,
    projectId,
    runId: params.runId ?? null,
  });
}

export async function createRuntimeSandboxSession(params: {
  ctx: any;
  authSubject: string | null | undefined;
  userId: any;
  projectId?: string | null;
  threadId?: string | null;
  runId?: string | null;
}): Promise<
  | { ok: true; session: RuntimeWorkspaceSession }
  | WorkspaceRuntimeSessionFailure
> {
  const authSubject = String(params.authSubject ?? "").trim();
  if (!authSubject) {
    return {
      ok: false,
      status: 401,
      code: "auth_required",
      message: "Sandbox session requires an authenticated user.",
    };
  }
  const projectId = String(params.projectId ?? "").trim();
  if (projectId) {
    return await createProjectRuntimeWorkspaceSession({
      ctx: params.ctx,
      authSubject,
      userId: params.userId,
      projectId,
      runId: params.runId ?? null,
    });
  }

  return {
    ok: false,
    status: 400,
    code: "project_required",
    message: "Workspace tools require a bound computer workspace.",
  };
}

export async function settleRuntimeWorkspaceSession(params: {
  ctx: any;
  userId: any;
  runId: string;
  session: RuntimeWorkspaceSession;
  endedAt?: number;
  providerStandbyGraceSeconds?: number | null;
  providerReleaseReason?: string | null;
  providerReleaseConfirmed?: boolean | null;
}): Promise<
  | {
      ok: true;
      skipped?: boolean;
      creditReservationKey?: string | null;
      computeCostUsd?: number;
      durationSeconds?: number;
      measuredDurationSeconds?: number;
      providerStandbyGraceSeconds?: number;
    }
> {
  const creditReservationKey = normalizeOptionalString(params.session.creditReservationKey);
  if (!creditReservationKey) {
    return {
      ok: true,
      skipped: true,
      creditReservationKey: null,
    };
  }
  const endedAt = params.endedAt ?? Date.now();
  const measuredDurationSeconds = Math.max(
    0,
    (endedAt - params.session.startedAt) / 1000,
  );
  const providerStandbyGraceSeconds =
    typeof params.providerStandbyGraceSeconds === "number" &&
      Number.isFinite(params.providerStandbyGraceSeconds)
      ? Math.max(0, params.providerStandbyGraceSeconds)
      : 0;
  const durationSeconds = measuredDurationSeconds + providerStandbyGraceSeconds;
  const computeCostUsd = estimateWorkspaceComputeUsd({
    durationSeconds,
    sandboxCpu: params.session.sandboxCpu,
    sandboxMemoryGiB: params.session.sandboxMemoryGiB,
  });
  const metadata = {
    provider: "blaxel",
    pricing_model: "blaxel_memory_gib_seconds_estimate",
    provider_billing_reconciliation: "pending",
    provider_billing_evidence: "delayed_billing_api",
    provider_sandbox_id: params.session.providerSandboxId,
    duration_seconds: durationSeconds,
    measured_duration_seconds: measuredDurationSeconds,
    provider_standby_grace_seconds: providerStandbyGraceSeconds,
    provider_release_reason: normalizeOptionalString(params.providerReleaseReason),
    provider_release_confirmed: params.providerReleaseConfirmed === true,
    sandbox_cpu: params.session.sandboxCpu,
    sandbox_memory_gib: params.session.sandboxMemoryGiB,
    sandbox_disk_gib: params.session.sandboxDiskGiB,
  };
  await recordPlatformToolCostBestEffort({
    ctx: params.ctx,
    costKey: creditReservationKey,
    userId: params.userId,
    projectId: params.session.projectId,
    runId: params.runId,
    rawVendorCostUsd: computeCostUsd,
    metadata,
    nowMs: endedAt,
  });
  return {
    ok: true,
    creditReservationKey,
    computeCostUsd,
    durationSeconds,
    measuredDurationSeconds,
    providerStandbyGraceSeconds,
  };
}

export async function releaseRuntimeWorkspaceSessionAccountingIfCurrent(params: {
  ctx: any;
  session: RuntimeWorkspaceSession;
  endedAt?: number;
}): Promise<{ ok: true; released: boolean; reason: string } | { ok: false; error: string }> {
  const creditReservationKey = normalizeOptionalString(params.session.creditReservationKey);
  if (!creditReservationKey) {
    return { ok: true, released: false, reason: "missing_credit_reservation_key" };
  }
  try {
    const result = await params.ctx.runMutation(
      internal.workspaceTerminals.releaseProjectBackgroundSandboxAccountingIfCurrentInternal as any,
      {
        projectId: params.session.projectId,
        providerSandboxId: params.session.providerSandboxId,
        providerSandboxProviderId: params.session.providerId,
        providerSandboxCreditReservationKey: creditReservationKey,
        providerSandboxStartedAt: params.session.startedAt,
        nowMs: params.endedAt ?? Date.now(),
      },
    ) as { released?: boolean; reason?: string } | null;
    return {
      ok: true,
      released: result?.released === true,
      reason: normalizeOptionalString(result?.reason) ?? "unknown",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error ?? ""),
    };
  }
}
