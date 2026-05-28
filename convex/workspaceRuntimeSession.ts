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
  PAID_TOOL_PRICING_VERSION,
  PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
  priceWorkspaceUsageCredits,
} from "../shared/workspaceCredits";

type WorkspaceRuntimeSessionFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type BlaxelRuntimeWorkspaceSession = {
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
  | { ok: true; session: BlaxelRuntimeWorkspaceSession }
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

export async function settleRuntimeWorkspaceSession(params: {
  ctx: any;
  userId: any;
  runId: string;
  session: RuntimeWorkspaceSession;
  endedAt?: number;
}): Promise<
  | {
      ok: true;
      skipped?: boolean;
      creditReservationKey?: string | null;
      creditsDebited?: number;
      computeCostUsd?: number;
      durationSeconds?: number;
    }
  | {
      ok: false;
      creditReservationKey: string;
      creditsDebited: number;
      computeCostUsd: number;
      durationSeconds: number;
      error: string;
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
  const durationSeconds = Math.max(0, (endedAt - params.session.startedAt) / 1000);
  const computeCostUsd = estimateWorkspaceComputeUsd({
    durationSeconds,
    sandboxCpu: params.session.sandboxCpu,
    sandboxMemoryGiB: params.session.sandboxMemoryGiB,
  });
  const creditsDebited = priceWorkspaceUsageCredits({ computeCostUsd });
  const metadata = {
    pricing_version: PAID_TOOL_PRICING_VERSION,
    target_gross_margin_bps: PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
    provider: "blaxel",
    pricing_model: "blaxel_memory_gib_seconds_estimate",
    provider_billing_reconciliation: "pending",
    provider_billing_evidence: "delayed_billing_api",
    provider_sandbox_id: params.session.providerSandboxId,
    duration_seconds: durationSeconds,
    sandbox_cpu: params.session.sandboxCpu,
    sandbox_memory_gib: params.session.sandboxMemoryGiB,
    sandbox_disk_gib: params.session.sandboxDiskGiB,
  };
  try {
    await params.ctx.runMutation(
      internal.workspaceCredits.recordWorkspaceComputeChargeInternal as any,
      {
        chargeKey: creditReservationKey,
        userId: params.userId,
        projectId: params.session.projectId,
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
        nowMs: endedAt,
      },
    );
    return {
      ok: true,
      creditReservationKey,
      creditsDebited,
      computeCostUsd,
      durationSeconds,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    try {
      await params.ctx.runMutation(
        internal.workspaceCredits.queueCreditSettlementRetryInternal as any,
        {
          creditKey: creditReservationKey,
          status: "succeeded",
          creditsSettled: creditsDebited,
          rawVendorCostUsd: computeCostUsd,
          metadata: {
            ...metadata,
            settlement_source: "workspace_compute_charge_recording_failed",
          },
          error: message || null,
          nowMs: endedAt,
        },
      );
    } catch {
      // The reservation expiry reconciler remains the final fail-safe.
    }
    return {
      ok: false,
      creditReservationKey,
      creditsDebited,
      computeCostUsd,
      durationSeconds,
      error: message || "workspace_compute_charge_recording_failed",
    };
  }
}
