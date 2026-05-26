import { api, internal } from "./_generated/api";
import type { DaytonaConfig } from "./daytonaSandboxClient";
import {
  ensureProjectBackgroundSandbox,
} from "./workspaceTerminalBackgroundService";
import {
  ensureBlaxelWorkspaceComputer,
} from "./blaxelWorkspaceComputerProvider.ts";
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

type WorkspaceRuntimeSessionFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type DaytonaRuntimeWorkspaceSession = {
  providerId: "daytona";
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
  lifecycleMode: "provider_standby";
};

export type RuntimeWorkspaceSession =
  | DaytonaRuntimeWorkspaceSession
  | BlaxelRuntimeWorkspaceSession;

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

  const ensured = await ensureBlaxelWorkspaceComputer({
    sandboxName: names.sandboxName,
    volumeName: names.volumeName,
    lifecycleIntent: "agent_run",
    labels: {
      purpose: "workspace-agent-tools",
      project_id: String(params.projectId),
      owner_id: String(params.userId),
    },
  });
  if (!ensured.ok) return mapProviderFailure(ensured);

  const nowMs = Date.now();
  await params.ctx.runMutation(internal.projects.attachCloudProjectVolumeInternal as any, {
    projectId: params.projectId,
    providerVolumeId: names.volumeName,
    providerId: "blaxel",
    nowMs,
  });
  await params.ctx.runMutation(
    internal.workspaceTerminals.setProjectBackgroundSandboxInternal as any,
    {
      projectId: params.projectId,
      providerSandboxId: ensured.providerSandboxId,
      providerSandboxProviderId: "blaxel",
      providerSandboxState: "active",
      providerSandboxLastSeenAt: nowMs,
      providerSandboxStartedAt: ensured.startedAt,
      clearSandboxAccounting: true,
    },
  );

  return {
    ok: true,
    session: {
      providerId: "blaxel",
      projectId: params.projectId,
      projectVolumeId: names.volumeName,
      providerSandboxId: ensured.providerSandboxId,
      workspaceRoot: ensured.workspaceRoot,
      startedAt: ensured.startedAt,
      lifecycleMode: "provider_standby",
    },
  };
}

async function createDaytonaRuntimeWorkspaceSession(params: {
  ctx: any;
  authSubject: string;
  userId: any;
  projectId: string;
}): Promise<
  | { ok: true; session: DaytonaRuntimeWorkspaceSession }
  | WorkspaceRuntimeSessionFailure
> {
  const backgroundSandbox = await ensureProjectBackgroundSandbox({
    ctx: params.ctx,
    authSubject: params.authSubject,
    userId: params.userId,
    projectId: params.projectId,
  });
  if (!backgroundSandbox.ok) return mapProviderFailure(backgroundSandbox);

  return {
    ok: true,
    session: {
      providerId: "daytona",
      config: backgroundSandbox.config,
      projectId: params.projectId,
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
    },
  };
}

export async function createProjectRuntimeWorkspaceSession(params: {
  ctx: any;
  authSubject: string | null | undefined;
  userId: any;
  projectId: string | null | undefined;
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

  const policy = resolveWorkspaceComputerProviderFromServerEnv();
  if (policy.providerId === "blaxel") {
    return await createBlaxelRuntimeWorkspaceSession({
      ctx: params.ctx,
      authSubject,
      userId: params.userId,
      projectId,
    });
  }

  return await createDaytonaRuntimeWorkspaceSession({
    ctx: params.ctx,
    authSubject,
    userId: params.userId,
    projectId,
  });
}
