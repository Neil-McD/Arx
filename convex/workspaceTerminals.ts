import { api, internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { v } from "convex/values";
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
import {
  deleteDaytonaProcessSession,
  findDaytonaProcessSessionCommand,
  getDaytonaProcessSession,
  getDaytonaProcessSessionCommandLogs,
  listDaytonaProcessSessions,
  readDaytonaProcessSessionCommandExitCode,
  type DaytonaProcessSessionDto,
} from "./daytonaProcessSessions";
import {
  isWorkspaceTerminalActiveStatus,
  normalizeWorkspaceTerminalCommand,
  normalizeWorkspaceTerminalStartArgs,
  resolveWorkspaceTerminalPreview,
  resolveWorkspaceCwd,
  startWorkspaceTerminalProcess,
  stopWorkspaceTerminalProcess,
  summarizeWorkspaceTerminalRow,
  truncateTerminalOutputTail,
  writeWorkspaceTerminalProcessInput,
} from "./workspaceTerminalProcessCore";
import { isCreatorDevTierOverrideEmail } from "../shared/devTierOverride";

const BACKGROUND_TERMINAL_MAX_ACTIVE_PER_PROJECT = 10;
const PROJECT_TERMINAL_RECONCILE_FRESH_MS = 8_000;

type WorkspaceTerminalStatus = "starting" | "running" | "exited" | "failed" | "stopped";
type WorkspaceTerminalSummary = {
  id: string;
  run_id_started_by: string | null;
  status: WorkspaceTerminalStatus;
  command: string;
  cwd: string | null;
  preview_port: number | null;
  preview_path: string | null;
  preview_label: string | null;
  started_at: number;
  updated_at: number;
  finished_at: number | null;
  exit_code: number | null;
  output_tail: string | null;
};

function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeBackgroundTerminalIdentityCommand(command: string, cwd: string | null): string {
  return normalizeWorkspaceTerminalCommand(command, resolveWorkspaceCwd(cwd))
    .replace(/\s+/g, " ")
    .trim();
}

function findReusableActivePreviewTerminal(params: {
  active: readonly WorkspaceTerminalSummary[];
  command: string;
  cwd: string | null;
  previewPort: number | null;
  previewPath: string | null;
}): WorkspaceTerminalSummary | null {
  if (params.previewPort == null) return null;
  const targetCommand = normalizeBackgroundTerminalIdentityCommand(params.command, params.cwd);
  for (const terminal of params.active) {
    if (terminal.preview_port !== params.previewPort) continue;
    if ((terminal.preview_path ?? null) !== params.previewPath) continue;
    if ((terminal.cwd ?? null) !== params.cwd) continue;
    if (normalizeBackgroundTerminalIdentityCommand(terminal.command, terminal.cwd) !== targetCommand) continue;
    return terminal;
  }
  return null;
}

function isTerminalActiveStatus(status: string | null | undefined): boolean {
  return isWorkspaceTerminalActiveStatus(status);
}

function readFailureText(value: unknown): string {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  return String(record?.response_text ?? "").trim().toLowerCase();
}

function failureMessageIncludes(value: unknown, needle: string): boolean {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const message = String(record?.message ?? "").trim().toLowerCase();
  return message.includes(needle.toLowerCase());
}

function isConfirmedSandboxGoneFailure(value: unknown): boolean {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const code = String(record?.code ?? "").trim().toLowerCase();
  const failureText = readFailureText(record?.details);
  if (code === "terminal_not_found" || code === "sandbox_not_found") return true;
  if (failureText.includes("not found")) return true;
  if (failureMessageIncludes(value, "terminal state 'destroyed'")) return true;
  if (failureMessageIncludes(value, "terminal state 'destroying'")) return true;
  if (failureMessageIncludes(value, "terminal state 'error'")) return true;
  if (failureMessageIncludes(value, "terminal state 'build_failed'")) return true;
  return false;
}

function isConfirmedSessionGoneFailure(value: unknown): boolean {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const code = String(record?.code ?? "").trim().toLowerCase();
  const failureText = readFailureText(record?.details);
  if (code === "terminal_not_found") return true;
  if (failureText.includes("not found")) return true;
  return false;
}

function findDaytonaProcessSessionById(
  sessions: DaytonaProcessSessionDto[],
  sessionId: string,
): DaytonaProcessSessionDto | null {
  return (
    sessions.find((session) => String(session?.sessionId ?? session?.id ?? "").trim() === sessionId) ??
    null
  );
}

function buildBackgroundSandboxRunId(projectId: string, providerSandboxId?: string | null): string {
  const sandboxId = normalizeString(providerSandboxId ?? "");
  if (sandboxId) return `background_terminal:${projectId}:${sandboxId}`;
  return `background_terminal:${projectId}`;
}

function summarizeTerminalRow(row: any): WorkspaceTerminalSummary {
  return summarizeWorkspaceTerminalRow(row) as WorkspaceTerminalSummary;
}

function buildTerminalSnapshot(rows: any[]): {
  active: WorkspaceTerminalSummary[];
} {
  const summaries = rows.map((row) => summarizeTerminalRow(row));
  const active = summaries
    .filter((row) => isTerminalActiveStatus(row.status))
    .sort((a, b) => b.updated_at - a.updated_at);
  return { active };
}

async function ensureWorkspaceTerminalStartAccess(params: {
  ctx: any;
  userId: any;
  authSubject: string | null | undefined;
}): Promise<
  | { ok: true; canonicalTier: "builder" | "architect" }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    }
> {
  const canonicalTier = await params.ctx.runQuery(api.entitlements.getCanonicalTierByUserId as any, {
    userId: params.userId,
  });
  if (canonicalTier !== "builder" && canonicalTier !== "architect") {
    return {
      ok: false,
      status: 403,
      code: "plan_required",
      message: "Workspace terminals require Builder access.",
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

  if (!creditBalance && canonicalTier === "builder") {
    const latestBuilderBillingCycle = await params.ctx.runQuery(
      internal.builderCommerce.getLatestBuilderBillingCycleForOwnerInternal as any,
      {
        ownerUserId: params.userId,
      },
    );
    if (
      latestBuilderBillingCycle?.currentPeriodStartAt &&
      latestBuilderBillingCycle?.currentPeriodEndAt
    ) {
      await params.ctx.runMutation(internal.workspaceCredits.syncBuilderMonthlyCreditsInternal as any, {
        userId: params.userId,
        targetTier: "builder",
        grantsAccess: true,
        cycleStartedAt: latestBuilderBillingCycle.currentPeriodStartAt,
        cycleEndsAt: latestBuilderBillingCycle.currentPeriodEndAt,
      });
      creditBalance = await params.ctx.runQuery(
        internal.workspaceCredits.getWorkspaceCreditBalanceInternal as any,
        {
          userId: params.userId,
        },
      );
    }
  }

  if (!creditBalance && canonicalTier === "builder" && !creatorDevCreditBypass) {
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
  if (creditBalance && remainingCredits <= 0 && !creatorDevCreditBypass) {
    return {
      ok: false,
      status: 402,
      code: "workspace_credits_exhausted",
      message: "You've used your included workspace compute credits.",
    };
  }

  return { ok: true, canonicalTier };
}

async function resolveAuthenticatedActorForActionContext(params: {
  ctx: any;
  authSubject: string | null | undefined;
}): Promise<{ dbUserId: string; authSubject: string | null }> {
  return await params.ctx.runQuery(
    internal.authActor.resolveAuthenticatedActorInternal as any,
    {
      authSubject: params.authSubject ?? null,
    },
  );
}

async function resolveOwnedProject(params: {
  ctx: any;
  authSubject: string | null | undefined;
  projectId: string;
}) {
  const actor = await resolveAuthenticatedActorForActionContext({
    ctx: params.ctx,
    authSubject: params.authSubject,
  });
  const project = await params.ctx.runQuery(api.projects.getCloudProjectById as any, {
    authSubject: params.authSubject,
    ownerId: actor.dbUserId,
    projectId: params.projectId,
  });
  if (!project) {
    throw new Error("project_not_found");
  }
  return {
    actor,
    project,
  };
}

async function resolveTerminalRow(params: {
  ctx: any;
  authSubject: string | null | undefined;
  terminalSessionId: any;
}): Promise<{ actor: { dbUserId: string; authSubject: string | null }; row: any }> {
  const actor = await resolveAuthenticatedActorForActionContext({
    ctx: params.ctx,
    authSubject: params.authSubject,
  });
  const row: any = await params.ctx.runQuery(
    internal.workspaceTerminals.getWorkspaceTerminalSessionInternal as any,
    {
      terminalSessionId: params.terminalSessionId,
    },
  );
  if (!row || row.ownerId !== actor.dbUserId) {
    throw new Error("terminal_not_found");
  }
  return {
    actor,
    row,
  };
}

async function ensureProjectBackgroundSandbox(params: {
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

  const runtimeProject = await params.ctx.runAction(api.projects.ensureCloudProjectVolume as any, {
    authSubject: params.authSubject,
    projectId: params.projectId,
  });

  const created = await createDaytonaSandbox({
    config,
    userId: String(params.userId),
    projectId: params.projectId,
    runId: null,
    sourceLabel: "convex_background_terminal",
    projectVolumeId: String((runtimeProject as any)?.providerVolumeId ?? "").trim() || null,
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

async function resolveTerminalSandboxContext(params: {
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

async function isRuntimeSessionOwnedTerminalRow(params: {
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

async function releaseProjectBackgroundSandboxIfIdle(params: {
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
        isTerminalActiveStatus(row.status) &&
        String(row.providerSandboxId ?? "").trim() === params.providerSandboxId,
    )
  ) {
    return;
  }

  const project = await params.ctx.runQuery(internal.projects.getCloudProjectByIdInternal as any, {
    projectId: params.projectId,
  });
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
      await params.ctx.runMutation(internal.workspaceCredits.recordWorkspaceComputeChargeInternal as any, {
        chargeKey: params.providerSandboxId,
        userId: params.ownerId,
        projectId: params.projectId,
        runId: buildBackgroundSandboxRunId(params.projectId, params.providerSandboxId),
        providerSandboxId: params.providerSandboxId,
        startedAt,
        endedAt: Date.now(),
        sandboxCpu: config.sandboxCpu,
        sandboxMemoryGiB: config.sandboxMemoryGiB,
        sandboxDiskGiB: config.sandboxDiskGiB,
      });
    } catch {
      // Best-effort charge recording after sandbox teardown.
    }
    await params.ctx.runMutation(internal.workspaceTerminals.clearProjectBackgroundSandboxInternal as any, {
      projectId: params.projectId,
    });
    return;
  }

  await params.ctx.runMutation(internal.workspaceTerminals.setProjectBackgroundSandboxInternal as any, {
    projectId: params.projectId,
    providerSandboxId: params.providerSandboxId,
    providerSandboxState: "error",
    providerSandboxLastSeenAt: Date.now(),
  });
}

async function reconcileWorkspaceTerminalRow(params: {
  ctx: any;
  ownerId: any;
  row: any;
  lifecycleOwner?: "project_background" | "runtime_session";
}): Promise<WorkspaceTerminalSummary> {
  const row = params.row;
  const lifecycleOwner = params.lifecycleOwner ?? "project_background";
  if (!isTerminalActiveStatus(row.status)) {
    return summarizeTerminalRow(row);
  }

  const projectId = String(row.projectId ?? "").trim();
  const providerSandboxId = String(row.providerSandboxId ?? "").trim();
  const providerSessionId = String(row.providerSessionId ?? "").trim();
  const providerCommandId = String(row.providerCommandId ?? "").trim();
  const nowMs = Date.now();

  const failAndRelease = async (status: WorkspaceTerminalStatus = "failed"): Promise<WorkspaceTerminalSummary> => {
    const patched = await params.ctx.runMutation(
      internal.workspaceTerminals.updateWorkspaceTerminalSessionInternal as any,
      {
        terminalSessionId: row._id,
        status,
        finishedAt: nowMs,
        updatedAt: nowMs,
      },
    );
    if (lifecycleOwner === "project_background") {
      await releaseProjectBackgroundSandboxIfIdle({
        ctx: params.ctx,
        ownerId: params.ownerId,
        projectId,
        providerSandboxId,
      });
    }
    return summarizeTerminalRow(patched ?? row);
  };

  const sandbox = await resolveTerminalSandboxContext({
    ctx: params.ctx,
    projectId,
    providerSandboxId,
    touchProjectBackground: lifecycleOwner === "project_background",
  });
  if (!sandbox.ok) {
    if (isConfirmedSandboxGoneFailure(sandbox)) {
      return await failAndRelease("failed");
    }
    return summarizeTerminalRow(row);
  }

  const session = await getDaytonaProcessSession({
    config: sandbox.config,
    toolboxProxyUrl: sandbox.toolboxProxyUrl,
    sandboxId: providerSandboxId,
    sessionId: providerSessionId,
  });
  if (!session.ok) {
    if (isConfirmedSessionGoneFailure(session)) {
      return await failAndRelease("failed");
    }
    return summarizeTerminalRow(row);
  }

  const command = findDaytonaProcessSessionCommand(session.session, providerCommandId);
  if (!command) {
    return await failAndRelease("failed");
  }

  const logs = await getDaytonaProcessSessionCommandLogs({
    config: sandbox.config,
    toolboxProxyUrl: sandbox.toolboxProxyUrl,
    sandboxId: providerSandboxId,
    sessionId: providerSessionId,
    commandId: providerCommandId,
  });

  const exitCode = readDaytonaProcessSessionCommandExitCode(command);
  if (!logs.ok && exitCode === null) {
    return summarizeTerminalRow(row);
  }

  const nextStatus: WorkspaceTerminalStatus =
    exitCode === null ? "running" : exitCode === 0 ? "exited" : "failed";
  const patched = await params.ctx.runMutation(
    internal.workspaceTerminals.updateWorkspaceTerminalSessionInternal as any,
    {
      terminalSessionId: row._id,
      status: nextStatus,
      updatedAt: nowMs,
      ...(exitCode === null ? null : { finishedAt: nowMs, exitCode }),
      ...(logs.ok ? { lastOutputTail: truncateTerminalOutputTail(logs.output) } : null),
    },
  );

  if (exitCode !== null) {
    await deleteDaytonaProcessSession({
      config: sandbox.config,
      toolboxProxyUrl: sandbox.toolboxProxyUrl,
      sandboxId: providerSandboxId,
      sessionId: providerSessionId,
    });
    if (lifecycleOwner === "project_background") {
      await releaseProjectBackgroundSandboxIfIdle({
        ctx: params.ctx,
        ownerId: params.ownerId,
        projectId,
        providerSandboxId,
      });
    }
  }

  return summarizeTerminalRow(patched ?? row);
}

export const getWorkspaceTerminalSessionInternal = internalQuery({
  args: {
    terminalSessionId: v.id("workspaceTerminalSessions"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.terminalSessionId);
  },
});

export const listProjectWorkspaceTerminalSessionsInternal = internalQuery({
  args: {
    ownerId: v.id("users"),
    projectId: v.id("cloudProjects"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workspaceTerminalSessions")
      .withIndex("by_owner_project", (q) => q.eq("ownerId", args.ownerId).eq("projectId", args.projectId))
      .collect();
  },
});

export const listWorkspaceTerminalSessionsBySandboxInternal = internalQuery({
  args: {
    providerSandboxId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workspaceTerminalSessions")
      .withIndex("by_providerSandboxId", (q) => q.eq("providerSandboxId", args.providerSandboxId))
      .collect();
  },
});

export const createWorkspaceTerminalSessionInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    projectId: v.id("cloudProjects"),
    threadId: v.optional(v.id("threads")),
    runIdStartedBy: v.optional(v.string()),
    providerSandboxId: v.string(),
    providerSessionId: v.string(),
    providerCommandId: v.string(),
    command: v.string(),
    cwd: v.optional(v.string()),
    previewPort: v.optional(v.number()),
    previewPath: v.optional(v.string()),
    previewLabel: v.optional(v.string()),
    status: v.union(
      v.literal("starting"),
      v.literal("running"),
      v.literal("exited"),
      v.literal("failed"),
      v.literal("stopped"),
    ),
    startedAt: v.number(),
    updatedAt: v.number(),
    finishedAt: v.optional(v.number()),
    exitCode: v.optional(v.number()),
    lastOutputTail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("workspaceTerminalSessions", args);
    return await ctx.db.get(id);
  },
});

export const updateWorkspaceTerminalSessionInternal = internalMutation({
  args: {
    terminalSessionId: v.id("workspaceTerminalSessions"),
    status: v.optional(
      v.union(
        v.literal("starting"),
        v.literal("running"),
        v.literal("exited"),
        v.literal("failed"),
        v.literal("stopped"),
      ),
    ),
    updatedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    exitCode: v.optional(v.number()),
    lastOutputTail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.terminalSessionId);
    if (!row) return null;
    const patch: Record<string, unknown> = {};
    if (args.status !== undefined) patch.status = args.status;
    if (args.updatedAt !== undefined) patch.updatedAt = args.updatedAt;
    if (args.finishedAt !== undefined) patch.finishedAt = args.finishedAt;
    if (args.exitCode !== undefined) patch.exitCode = args.exitCode;
    if (args.lastOutputTail !== undefined) patch.lastOutputTail = args.lastOutputTail;
    await ctx.db.patch(args.terminalSessionId, patch);
    return await ctx.db.get(args.terminalSessionId);
  },
});

export const setProjectBackgroundSandboxInternal = internalMutation({
  args: {
    projectId: v.id("cloudProjects"),
    providerSandboxId: v.string(),
    providerSandboxState: v.optional(v.string()),
    providerSandboxLastSeenAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      providerSandboxId: args.providerSandboxId,
      providerSandboxState: args.providerSandboxState,
      providerSandboxLastSeenAt: args.providerSandboxLastSeenAt,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(args.projectId);
  },
});

export const clearProjectBackgroundSandboxInternal = internalMutation({
  args: {
    projectId: v.id("cloudProjects"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      providerSandboxId: undefined,
      providerSandboxState: undefined,
      providerSandboxLastSeenAt: undefined,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(args.projectId);
  },
});

export const reconcileProjectWorkspaceTerminalsInternal = internalAction({
  args: {
    ownerId: v.id("users"),
    projectId: v.id("cloudProjects"),
  },
  handler: async (ctx, args) => {
    let rows = (await ctx.runQuery(
      internal.workspaceTerminals.listProjectWorkspaceTerminalSessionsInternal as any,
      {
        ownerId: args.ownerId,
        projectId: args.projectId,
      },
    )) as any[];
    const nowMs = Date.now();
    let activeRows = rows.filter((row) => isTerminalActiveStatus(row.status));
    if (activeRows.length === 0) {
      return buildTerminalSnapshot(rows);
    }

    const project = await ctx.runQuery(internal.projects.getCloudProjectByIdInternal as any, {
      projectId: args.projectId,
    });
    const projectProviderSandboxId = normalizeOptionalString(project?.providerSandboxId);
    const runtimeSessionRows = activeRows.filter((row) => {
      const runIdStartedBy = normalizeOptionalString(row.runIdStartedBy);
      const rowSandboxId = normalizeOptionalString(row.providerSandboxId);
      return Boolean(
        runIdStartedBy &&
          rowSandboxId &&
          (!projectProviderSandboxId || rowSandboxId !== projectProviderSandboxId),
      );
    });
    for (const row of runtimeSessionRows) {
      await reconcileWorkspaceTerminalRow({
        ctx,
        ownerId: args.ownerId,
        row,
        lifecycleOwner: "runtime_session",
      });
    }
    if (runtimeSessionRows.length > 0) {
      rows = (await ctx.runQuery(
        internal.workspaceTerminals.listProjectWorkspaceTerminalSessionsInternal as any,
        {
          ownerId: args.ownerId,
          projectId: args.projectId,
        },
      )) as any[];
      activeRows = rows.filter((row) => isTerminalActiveStatus(row.status));
    }
    activeRows = activeRows.filter((row) => {
      const runIdStartedBy = normalizeOptionalString(row.runIdStartedBy);
      const rowSandboxId = normalizeOptionalString(row.providerSandboxId);
      return !(
        runIdStartedBy &&
        rowSandboxId &&
        (!projectProviderSandboxId || rowSandboxId !== projectProviderSandboxId)
      );
    });
    if (activeRows.length === 0) {
      return buildTerminalSnapshot(rows);
    }

    const projectLastSeenAt = Number(project?.providerSandboxLastSeenAt ?? 0);
    if (
      Number.isFinite(projectLastSeenAt) &&
      projectLastSeenAt > 0 &&
      Math.max(0, nowMs - projectLastSeenAt) <= PROJECT_TERMINAL_RECONCILE_FRESH_MS
    ) {
      return buildTerminalSnapshot(rows);
    }

    const providerSandboxId =
      normalizeOptionalString(project?.providerSandboxId) ??
      normalizeOptionalString(activeRows[0]?.providerSandboxId);
    if (!providerSandboxId) {
      return buildTerminalSnapshot(rows);
    }

    const markRowsFailed = async () => {
      for (const row of activeRows) {
        await ctx.runMutation(internal.workspaceTerminals.updateWorkspaceTerminalSessionInternal as any, {
          terminalSessionId: row._id,
          status: "failed",
          finishedAt: nowMs,
          updatedAt: nowMs,
        });
      }
      await releaseProjectBackgroundSandboxIfIdle({
        ctx,
        ownerId: args.ownerId,
        projectId: args.projectId,
        providerSandboxId,
      });
      const failedRows = (await ctx.runQuery(
        internal.workspaceTerminals.listProjectWorkspaceTerminalSessionsInternal as any,
        {
          ownerId: args.ownerId,
          projectId: args.projectId,
        },
      )) as any[];
      return buildTerminalSnapshot(failedRows);
    };

    const sandbox = await resolveTerminalSandboxContext({
      ctx,
      projectId: args.projectId,
      providerSandboxId,
    });
    if (!sandbox.ok) {
      if (isConfirmedSandboxGoneFailure(sandbox)) {
        return await markRowsFailed();
      }
      return buildTerminalSnapshot(rows);
    }

    const sessions = await listDaytonaProcessSessions({
      config: sandbox.config,
      toolboxProxyUrl: sandbox.toolboxProxyUrl,
      sandboxId: providerSandboxId,
    });
    if (!sessions.ok) {
      if (isConfirmedSessionGoneFailure(sessions)) {
        return await markRowsFailed();
      }
      return buildTerminalSnapshot(rows);
    }

    for (const row of activeRows) {
      const providerSessionId = String(row.providerSessionId ?? "").trim();
      const providerCommandId = String(row.providerCommandId ?? "").trim();
      const session = findDaytonaProcessSessionById(sessions.sessions, providerSessionId);
      if (!session) {
        await ctx.runMutation(internal.workspaceTerminals.updateWorkspaceTerminalSessionInternal as any, {
          terminalSessionId: row._id,
          status: "failed",
          finishedAt: nowMs,
          updatedAt: nowMs,
        });
        continue;
      }

      const command = findDaytonaProcessSessionCommand(session, providerCommandId);
      if (!command) {
        await ctx.runMutation(internal.workspaceTerminals.updateWorkspaceTerminalSessionInternal as any, {
          terminalSessionId: row._id,
          status: "failed",
          finishedAt: nowMs,
          updatedAt: nowMs,
        });
        continue;
      }

      const exitCode = readDaytonaProcessSessionCommandExitCode(command);
      if (exitCode === null) {
        if (String(row.status ?? "").trim().toLowerCase() !== "running") {
          await ctx.runMutation(internal.workspaceTerminals.updateWorkspaceTerminalSessionInternal as any, {
            terminalSessionId: row._id,
            status: "running",
            updatedAt: nowMs,
          });
        }
        continue;
      }

      await ctx.runMutation(internal.workspaceTerminals.updateWorkspaceTerminalSessionInternal as any, {
        terminalSessionId: row._id,
        status: exitCode === 0 ? "exited" : "failed",
        finishedAt: nowMs,
        exitCode,
        updatedAt: nowMs,
      });
      await deleteDaytonaProcessSession({
        config: sandbox.config,
        toolboxProxyUrl: sandbox.toolboxProxyUrl,
        sandboxId: providerSandboxId,
        sessionId: providerSessionId,
      });
    }

    await ctx.runMutation(internal.workspaceTerminals.setProjectBackgroundSandboxInternal as any, {
      projectId: args.projectId,
      providerSandboxId,
      providerSandboxState: "started",
      providerSandboxLastSeenAt: nowMs,
    });

    const nextRows = (await ctx.runQuery(
      internal.workspaceTerminals.listProjectWorkspaceTerminalSessionsInternal as any,
      {
        ownerId: args.ownerId,
        projectId: args.projectId,
      },
    )) as any[];
    const hasActiveProjectBackgroundRows = nextRows.some((row) => {
      if (!isTerminalActiveStatus(row.status)) return false;
      const runIdStartedBy = normalizeOptionalString(row.runIdStartedBy);
      const rowSandboxId = normalizeOptionalString(row.providerSandboxId);
      return !(
        runIdStartedBy &&
        rowSandboxId &&
        (!projectProviderSandboxId || rowSandboxId !== projectProviderSandboxId)
      );
    });
    if (!hasActiveProjectBackgroundRows) {
      await releaseProjectBackgroundSandboxIfIdle({
        ctx,
        ownerId: args.ownerId,
        projectId: args.projectId,
        providerSandboxId,
      });
      const releasedRows = (await ctx.runQuery(
        internal.workspaceTerminals.listProjectWorkspaceTerminalSessionsInternal as any,
        {
          ownerId: args.ownerId,
          projectId: args.projectId,
        },
      )) as any[];
      return buildTerminalSnapshot(releasedRows);
    }

    return buildTerminalSnapshot(nextRows);
  },
});

export const listProjectWorkspaceTerminalSnapshot = action({
  args: {
    authSubject: v.optional(v.string()),
    projectId: v.id("cloudProjects"),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const actor: { dbUserId: string } = await resolveAuthenticatedActorForActionContext({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const project = await ctx.runQuery(api.projects.getCloudProjectById as any, {
      authSubject: args.authSubject ?? null,
      ownerId: actor.dbUserId,
      projectId: args.projectId,
    });
    if (!project) return { active: [] };
    const snapshot: any = await ctx.runAction(
      internal.workspaceTerminals.reconcileProjectWorkspaceTerminalsInternal as any,
      {
        ownerId: actor.dbUserId,
        projectId: args.projectId,
      },
    );
    return {
      active: Array.isArray(snapshot?.active) ? snapshot.active : [],
    };
  },
});

export const stopProjectWorkspaceTerminal = action({
  args: {
    authSubject: v.optional(v.string()),
    terminalSessionId: v.id("workspaceTerminalSessions"),
  },
  handler: async (ctx, args): Promise<unknown> => {
    return await ctx.runAction(internal.workspaceTerminals.stopWorkspaceTerminalInternal as any, {
      authSubject: args.authSubject ?? null,
      terminalSessionId: args.terminalSessionId,
    });
  },
});

export const stopAllProjectWorkspaceTerminals = action({
  args: {
    authSubject: v.optional(v.string()),
    projectId: v.id("cloudProjects"),
  },
  handler: async (ctx, args) => {
    const { actor, project } = await resolveOwnedProject({
      ctx,
      authSubject: args.authSubject ?? null,
      projectId: args.projectId,
    });
    void project;
    const rows = (await ctx.runQuery(
      internal.workspaceTerminals.listProjectWorkspaceTerminalSessionsInternal as any,
      {
        ownerId: actor.dbUserId,
        projectId: args.projectId,
      },
    )) as any[];
    const activeRows = rows.filter((row) => isTerminalActiveStatus(row.status));
    for (const row of activeRows) {
      await ctx.runAction(internal.workspaceTerminals.stopWorkspaceTerminalInternal as any, {
        authSubject: args.authSubject ?? null,
        terminalSessionId: row._id,
      });
    }
    return {
      ok: true,
      stopped_count: activeRows.length,
    };
  },
});

export const startWorkspaceTerminalInternal = internalAction({
  args: {
    authSubject: v.optional(v.string()),
    projectId: v.id("cloudProjects"),
    threadId: v.optional(v.id("threads")),
    runId: v.optional(v.string()),
    command: v.string(),
    cwd: v.optional(v.string()),
    previewPort: v.optional(v.number()),
    previewPath: v.optional(v.string()),
    previewLabel: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const { actor, project } = await resolveOwnedProject({
      ctx,
      authSubject: args.authSubject ?? null,
      projectId: args.projectId,
    });
    void project;
    const access = await ensureWorkspaceTerminalStartAccess({
      ctx,
      userId: actor.dbUserId,
      authSubject: actor.authSubject,
    });
    if (!access.ok) {
      return access;
    }

    let terminalStartArgs: ReturnType<typeof normalizeWorkspaceTerminalStartArgs>;
    try {
      terminalStartArgs = normalizeWorkspaceTerminalStartArgs({
        command: args.command,
        cwd: args.cwd,
        preview_port: args.previewPort,
        preview_path: args.previewPath,
        preview_label: args.previewLabel,
      });
    } catch {
      return {
        ok: false,
        status: 400,
        code: "invalid_tool_args",
        message: "Terminal cwd or preview settings are invalid.",
      };
    }

    const snapshot = await ctx.runAction(
      internal.workspaceTerminals.reconcileProjectWorkspaceTerminalsInternal as any,
      {
        ownerId: actor.dbUserId,
        projectId: args.projectId,
      },
    );
    const reusableTerminal = findReusableActivePreviewTerminal({
      active: Array.isArray(snapshot?.active) ? snapshot.active : [],
      command: terminalStartArgs.command,
      cwd: terminalStartArgs.cwd,
      previewPort: terminalStartArgs.previewPort,
      previewPath: terminalStartArgs.previewPath,
    });
    if (reusableTerminal) {
      return {
        ok: true,
        terminal_session_id: reusableTerminal.id,
        provider_session_id: null,
        reused_existing: true,
        status: reusableTerminal.status,
        command: reusableTerminal.command,
        cwd: reusableTerminal.cwd,
        preview_port: reusableTerminal.preview_port,
        preview_path: reusableTerminal.preview_path,
        preview_label: reusableTerminal.preview_label,
        output_tail: reusableTerminal.output_tail,
      };
    }
    if (snapshot.active.length >= BACKGROUND_TERMINAL_MAX_ACTIVE_PER_PROJECT) {
      return {
        ok: false,
        status: 409,
        code: "too_many_background_terminals",
        message: `Background terminal limit reached (${BACKGROUND_TERMINAL_MAX_ACTIVE_PER_PROJECT}).`,
      };
    }

    const sandbox = await ensureProjectBackgroundSandbox({
      ctx,
      authSubject: actor.authSubject,
      userId: actor.dbUserId,
      projectId: args.projectId,
    });
    if (!sandbox.ok) return sandbox;

    return await startWorkspaceTerminalProcess({
      ctx,
      ownerId: actor.dbUserId,
      projectId: args.projectId,
      threadId: args.threadId,
      runIdStartedBy: normalizeOptionalString(args.runId),
      session: sandbox,
      terminal: terminalStartArgs,
      providerSessionIdPrefix: "arx-term",
    });
  },
});

export const readWorkspaceTerminalInternal = internalAction({
  args: {
    authSubject: v.optional(v.string()),
    terminalSessionId: v.id("workspaceTerminalSessions"),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const { actor, row } = await resolveTerminalRow({
      ctx,
      authSubject: args.authSubject ?? null,
      terminalSessionId: args.terminalSessionId,
    });
    const runtimeSessionOwned = await isRuntimeSessionOwnedTerminalRow({
      ctx,
      row,
    });
    const summary = await reconcileWorkspaceTerminalRow({
      ctx,
      ownerId: actor.dbUserId,
      row,
      lifecycleOwner: runtimeSessionOwned ? "runtime_session" : "project_background",
    });

    return {
      ok: true,
      terminal_session_id: String(row._id ?? "").trim(),
      ...summary,
    };
  },
});

export const writeWorkspaceTerminalInternal = internalAction({
  args: {
    authSubject: v.optional(v.string()),
    terminalSessionId: v.id("workspaceTerminalSessions"),
    input: v.string(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const { row } = await resolveTerminalRow({
      ctx,
      authSubject: args.authSubject ?? null,
      terminalSessionId: args.terminalSessionId,
    });
    const runtimeSessionOwned = await isRuntimeSessionOwnedTerminalRow({
      ctx,
      row,
    });
    const sandbox = await resolveTerminalSandboxContext({
      ctx,
      projectId: String(row.projectId ?? "").trim(),
      providerSandboxId: String(row.providerSandboxId ?? "").trim(),
      touchProjectBackground: !runtimeSessionOwned,
    });
    if (!sandbox.ok) return sandbox;
    const result = await writeWorkspaceTerminalProcessInput({
      ctx,
      row,
      session: {
        config: sandbox.config,
        toolboxProxyUrl: sandbox.toolboxProxyUrl,
        providerSandboxId: String(row.providerSandboxId ?? "").trim(),
      },
      input: args.input,
    });
    if (result.ok === false) return result;
    return {
      ok: true,
      terminal_session_id: String(row._id ?? "").trim(),
      ...result,
    };
  },
});

export const stopWorkspaceTerminalInternal = internalAction({
  args: {
    authSubject: v.optional(v.string()),
    terminalSessionId: v.id("workspaceTerminalSessions"),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const { actor, row } = await resolveTerminalRow({
      ctx,
      authSubject: args.authSubject ?? null,
      terminalSessionId: args.terminalSessionId,
    });
    const runtimeSessionOwned = await isRuntimeSessionOwnedTerminalRow({
      ctx,
      row,
    });

    const sandbox = await resolveTerminalSandboxContext({
      ctx,
      projectId: String(row.projectId ?? "").trim(),
      providerSandboxId: String(row.providerSandboxId ?? "").trim(),
      touchProjectBackground: !runtimeSessionOwned,
    });
    const result = await stopWorkspaceTerminalProcess({
      ctx,
      row,
      session: sandbox.ok
        ? {
            config: sandbox.config,
            toolboxProxyUrl: sandbox.toolboxProxyUrl,
            providerSandboxId: String(row.providerSandboxId ?? "").trim(),
          }
        : null,
      forceStoppedStatus: true,
    });

    if (!runtimeSessionOwned) {
      await releaseProjectBackgroundSandboxIfIdle({
        ctx,
        ownerId: actor.dbUserId,
        projectId: String(row.projectId ?? "").trim(),
        providerSandboxId: String(row.providerSandboxId ?? "").trim(),
      });
    }

    return {
      ok: true,
      terminal_session_id: String(row._id ?? "").trim(),
      ...result,
    };
  },
});

export const getWorkspaceTerminalPreviewUrl = action({
  args: {
    authSubject: v.optional(v.string()),
    terminalSessionId: v.id("workspaceTerminalSessions"),
  },
  handler: async (ctx, args) => {
    const { row } = await resolveTerminalRow({
      ctx,
      authSubject: args.authSubject ?? null,
      terminalSessionId: args.terminalSessionId,
    });
    const runtimeSessionOwned = await isRuntimeSessionOwnedTerminalRow({
      ctx,
      row,
    });
    const sandbox = await resolveTerminalSandboxContext({
      ctx,
      projectId: String(row.projectId ?? "").trim(),
      providerSandboxId: String(row.providerSandboxId ?? "").trim(),
      touchProjectBackground: !runtimeSessionOwned,
    });
    if (!sandbox.ok) return sandbox;
    return await resolveWorkspaceTerminalPreview({
      row,
      session: {
        config: sandbox.config,
        toolboxProxyUrl: sandbox.toolboxProxyUrl,
        providerSandboxId: String(row.providerSandboxId ?? "").trim(),
      },
      workspaceRequiredMessage:
        "Preview is only available while its workspace session is active.",
      previewNotEnabledMessage: "This terminal does not expose an app preview.",
      workspaceMismatchMessage:
        "Preview terminal is not attached to this workspace session.",
    });
  },
});
