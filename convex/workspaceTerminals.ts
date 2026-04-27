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
  deleteDaytonaProcessSession,
  findDaytonaProcessSessionCommand,
  listDaytonaProcessSessions,
  readDaytonaProcessSessionCommandExitCode,
} from "./daytonaProcessSessions";
import {
  releaseProjectBackgroundSandboxIfIdle,
  resolveTerminalSandboxContext,
} from "./workspaceTerminalBackgroundService";
import {
  findDaytonaProcessSessionById,
  isConfirmedSandboxGoneFailure,
  isConfirmedSessionGoneFailure,
  reconcileWorkspaceTerminalRow,
} from "./workspaceTerminalReconciliation";
import {
  isWorkspaceTerminalActiveStatus,
  resolveWorkspaceTerminalPreview,
  stopWorkspaceTerminalProcess,
  summarizeWorkspaceTerminalRow,
  type WorkspaceTerminalHealthStatus,
  type WorkspaceTerminalLifecycleOwner,
  type WorkspaceTerminalPreviewStatus,
} from "./workspaceTerminalProcessCore";

const PROJECT_TERMINAL_RECONCILE_FRESH_MS = 8_000;
const RECENT_TERMINAL_FAILURE_VISIBLE_MS = 5 * 60_000;
const RECENT_TERMINAL_FAILURE_LIMIT = 4;
const PROJECT_BACKGROUND_SANDBOX_CREATE_LEASE_MS = 60_000;

type WorkspaceTerminalStatus = "starting" | "running" | "exited" | "failed" | "stopped";
type WorkspaceTerminalSummary = {
  id: string;
  lifecycle_owner: WorkspaceTerminalLifecycleOwner;
  started_by_thread_id: string | null;
  started_by_run_id: string | null;
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
  last_heartbeat_at: number | null;
  health_status: WorkspaceTerminalHealthStatus;
  health_summary: string | null;
  preview_status: WorkspaceTerminalPreviewStatus;
  last_preview_probe_at: number | null;
  last_preview_probe_summary: string | null;
  last_browser_observation_at: number | null;
  last_browser_observation_summary: string | null;
};

const workspaceTerminalLifecycleOwnerValidator = v.union(
  v.literal("project_background"),
);

const workspaceTerminalHealthStatusValidator = v.union(
  v.literal("unknown"),
  v.literal("starting"),
  v.literal("healthy"),
  v.literal("unhealthy"),
  v.literal("exited"),
  v.literal("stale"),
);

const workspaceTerminalPreviewStatusValidator = v.union(
  v.literal("none"),
  v.literal("starting"),
  v.literal("running"),
  v.literal("blank"),
  v.literal("render_error_suspected"),
  v.literal("unreachable"),
  v.literal("server_exited"),
);

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeObservationSummary(value: unknown, maxLen = 240): string | null {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > maxLen
    ? `${normalized.slice(0, maxLen - 1).trimEnd()}…`
    : normalized;
}

function isTerminalActiveStatus(status: string | null | undefined): boolean {
  return isWorkspaceTerminalActiveStatus(status);
}

function summarizeTerminalRow(row: any): WorkspaceTerminalSummary {
  return summarizeWorkspaceTerminalRow(row) as WorkspaceTerminalSummary;
}

function buildTerminalSnapshot(rows: any[]): {
  active: WorkspaceTerminalSummary[];
  recent: WorkspaceTerminalSummary[];
} {
  const nowMs = Date.now();
  const summaries = rows.map((row) => summarizeTerminalRow(row));
  const active = summaries
    .filter((row) => isTerminalActiveStatus(row.status))
    .sort((a, b) => b.updated_at - a.updated_at);
  const activeIds = new Set(active.map((row) => row.id));
  const recent = summaries
    .filter((row) => {
      if (activeIds.has(row.id)) return false;
      const isRecentFailure = row.status === "failed" || row.status === "exited";
      const lastSeenAt = row.finished_at ?? row.updated_at;
      return (
        isRecentFailure &&
        Number.isFinite(lastSeenAt) &&
        lastSeenAt > 0 &&
        nowMs - lastSeenAt <= RECENT_TERMINAL_FAILURE_VISIBLE_MS
      );
    })
    .sort((a, b) => b.updated_at - a.updated_at)
    .slice(0, RECENT_TERMINAL_FAILURE_LIMIT);
  return { active, recent };
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

async function resolveTerminalAccess(params: {
  ctx: any;
  authSubject: string | null | undefined;
  terminalSessionId: any;
  runId?: string | null | undefined;
}): Promise<
  | {
      ok: true;
      actor: { dbUserId: string; authSubject: string | null };
      row: any;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    }
> {
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
    return {
      ok: false,
      status: 404,
      code: "terminal_not_found",
      message: "Terminal session not found.",
    };
  }
  return {
    ok: true,
    actor,
    row,
  };
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
    lifecycleOwner: v.optional(workspaceTerminalLifecycleOwnerValidator),
    startedByThreadId: v.optional(v.string()),
    startedByRunId: v.optional(v.string()),
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
    lastHeartbeatAt: v.optional(v.number()),
    healthStatus: v.optional(workspaceTerminalHealthStatusValidator),
    healthSummary: v.optional(v.string()),
    previewStatus: v.optional(workspaceTerminalPreviewStatusValidator),
    lastPreviewProbeAt: v.optional(v.number()),
    lastPreviewProbeSummary: v.optional(v.string()),
    lastBrowserObservationAt: v.optional(v.number()),
    lastBrowserObservationSummary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("workspaceTerminalSessions", args);
    return await ctx.db.get(id);
  },
});

export const acquireProjectBackgroundSandboxLeaseInternal = internalMutation({
  args: {
    projectId: v.id("cloudProjects"),
    ownerId: v.id("users"),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.ownerId !== args.ownerId) {
      throw new Error("project_not_found");
    }
    const existingSandboxId = normalizeOptionalString(project.providerSandboxId);
    if (existingSandboxId) {
      return {
        acquired: false,
        reason: "registered",
        providerSandboxId: existingSandboxId,
      };
    }

    const state = normalizeOptionalString(project.providerSandboxState);
    const lastSeenAt = Number(project.providerSandboxLastSeenAt ?? 0);
    const leaseAgeMs =
      Number.isFinite(lastSeenAt) && lastSeenAt > 0
        ? Math.max(0, args.nowMs - lastSeenAt)
        : PROJECT_BACKGROUND_SANDBOX_CREATE_LEASE_MS + 1;
    if (
      state === "creating" &&
      leaseAgeMs < PROJECT_BACKGROUND_SANDBOX_CREATE_LEASE_MS
    ) {
      return {
        acquired: false,
        reason: "creating",
        retryAfterMs: Math.max(
          250,
          PROJECT_BACKGROUND_SANDBOX_CREATE_LEASE_MS - leaseAgeMs,
        ),
      };
    }

    await ctx.db.patch(project._id, {
      providerSandboxState: "creating",
      providerSandboxLastSeenAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return {
      acquired: true,
      reason: "acquired",
      leaseExpiresAt: args.nowMs + PROJECT_BACKGROUND_SANDBOX_CREATE_LEASE_MS,
    };
  },
});

export const clearProjectBackgroundSandboxLeaseInternal = internalMutation({
  args: {
    projectId: v.id("cloudProjects"),
    ownerId: v.id("users"),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.ownerId !== args.ownerId) return null;
    if (
      normalizeOptionalString(project.providerSandboxId) ||
      normalizeOptionalString(project.providerSandboxState) !== "creating"
    ) {
      return await ctx.db.get(project._id);
    }
    await ctx.db.patch(project._id, {
      providerSandboxState: undefined,
      providerSandboxLastSeenAt: undefined,
      updatedAt: args.nowMs,
    });
    return await ctx.db.get(project._id);
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
    lifecycleOwner: v.optional(workspaceTerminalLifecycleOwnerValidator),
    startedByThreadId: v.optional(v.string()),
    startedByRunId: v.optional(v.string()),
    lastHeartbeatAt: v.optional(v.number()),
    healthStatus: v.optional(workspaceTerminalHealthStatusValidator),
    healthSummary: v.optional(v.string()),
    previewStatus: v.optional(workspaceTerminalPreviewStatusValidator),
    lastPreviewProbeAt: v.optional(v.number()),
    lastPreviewProbeSummary: v.optional(v.string()),
    lastBrowserObservationAt: v.optional(v.number()),
    lastBrowserObservationSummary: v.optional(v.string()),
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
    if (args.lifecycleOwner !== undefined) patch.lifecycleOwner = args.lifecycleOwner;
    if (args.startedByThreadId !== undefined) patch.startedByThreadId = args.startedByThreadId;
    if (args.startedByRunId !== undefined) patch.startedByRunId = args.startedByRunId;
    if (args.lastHeartbeatAt !== undefined) patch.lastHeartbeatAt = args.lastHeartbeatAt;
    if (args.healthStatus !== undefined) patch.healthStatus = args.healthStatus;
    if (args.healthSummary !== undefined) patch.healthSummary = args.healthSummary;
    if (args.previewStatus !== undefined) patch.previewStatus = args.previewStatus;
    if (args.lastPreviewProbeAt !== undefined) patch.lastPreviewProbeAt = args.lastPreviewProbeAt;
    if (args.lastPreviewProbeSummary !== undefined) patch.lastPreviewProbeSummary = args.lastPreviewProbeSummary;
    if (args.lastBrowserObservationAt !== undefined) patch.lastBrowserObservationAt = args.lastBrowserObservationAt;
    if (args.lastBrowserObservationSummary !== undefined) patch.lastBrowserObservationSummary = args.lastBrowserObservationSummary;
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
    activeRows = activeRows.filter((row) => {
      const rowSandboxId = normalizeOptionalString(row?.providerSandboxId);
      return !projectProviderSandboxId || rowSandboxId === projectProviderSandboxId;
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
          lastHeartbeatAt: nowMs,
          healthStatus: "unhealthy",
          healthSummary: "Process session is no longer available.",
          previewStatus: row.previewPort ? "server_exited" : "none",
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
          lastHeartbeatAt: nowMs,
          healthStatus: "unhealthy",
          healthSummary: "Process session is no longer available.",
          previewStatus: row.previewPort ? "server_exited" : "none",
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
            lastHeartbeatAt: nowMs,
            healthStatus: "healthy",
            healthSummary: "Process is running.",
            previewStatus: row.previewPort ? "running" : "none",
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
        lastHeartbeatAt: nowMs,
        healthStatus: exitCode === 0 ? "exited" : "unhealthy",
        healthSummary:
          exitCode === 0
            ? `Process exited with code ${exitCode}.`
            : `Process failed with exit code ${exitCode}.`,
        previewStatus: row.previewPort ? "server_exited" : "none",
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
    let hasActiveProjectBackgroundRows = false;
    for (const row of nextRows) {
      if (!isTerminalActiveStatus(row.status)) continue;
      if (
        !projectProviderSandboxId ||
        normalizeOptionalString(row?.providerSandboxId) === projectProviderSandboxId
      ) {
        hasActiveProjectBackgroundRows = true;
        break;
      }
    }
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
    if (!project) return { active: [], recent: [] };
    const snapshot: any = await ctx.runAction(
      internal.workspaceTerminals.reconcileProjectWorkspaceTerminalsInternal as any,
      {
        ownerId: actor.dbUserId,
        projectId: args.projectId,
      },
    );
    return {
      active: Array.isArray(snapshot?.active) ? snapshot.active : [],
      recent: Array.isArray(snapshot?.recent) ? snapshot.recent : [],
    };
  },
});

export const stopProjectWorkspaceTerminal = action({
  args: {
    authSubject: v.optional(v.string()),
    terminalSessionId: v.id("workspaceTerminalSessions"),
    runId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    return await ctx.runAction(internal.workspaceTerminals.stopWorkspaceTerminalInternal as any, {
      authSubject: args.authSubject ?? null,
      terminalSessionId: args.terminalSessionId,
      runId: args.runId ?? undefined,
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

export const stopWorkspaceTerminalInternal = internalAction({
  args: {
    authSubject: v.optional(v.string()),
    terminalSessionId: v.id("workspaceTerminalSessions"),
    runId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const access = await resolveTerminalAccess({
      ctx,
      authSubject: args.authSubject ?? null,
      terminalSessionId: args.terminalSessionId,
      runId: args.runId ?? null,
    });
    if (!access.ok) return access;
    const { actor, row } = access;

    const sandbox = await resolveTerminalSandboxContext({
      ctx,
      projectId: String(row.projectId ?? "").trim(),
      providerSandboxId: String(row.providerSandboxId ?? "").trim(),
      touchProjectBackground: true,
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

    await releaseProjectBackgroundSandboxIfIdle({
      ctx,
      ownerId: actor.dbUserId,
      projectId: String(row.projectId ?? "").trim(),
      providerSandboxId: String(row.providerSandboxId ?? "").trim(),
    });

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
    runId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await resolveTerminalAccess({
      ctx,
      authSubject: args.authSubject ?? null,
      terminalSessionId: args.terminalSessionId,
      runId: args.runId ?? null,
    });
    if (!access.ok) return access;
    const { row } = access;
    const sandbox = await resolveTerminalSandboxContext({
      ctx,
      projectId: String(row.projectId ?? "").trim(),
      providerSandboxId: String(row.providerSandboxId ?? "").trim(),
      touchProjectBackground: true,
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

export const recordWorkspaceTerminalPreviewObservation = action({
  args: {
    authSubject: v.optional(v.string()),
    terminalSessionId: v.id("workspaceTerminalSessions"),
    runId: v.optional(v.string()),
    previewStatus: v.optional(workspaceTerminalPreviewStatusValidator),
    previewProbeSummary: v.optional(v.string()),
    browserObservationSummary: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const access = await resolveTerminalAccess({
      ctx,
      authSubject: args.authSubject ?? null,
      terminalSessionId: args.terminalSessionId,
      runId: args.runId ?? null,
    });
    if (!access.ok) return access;

    const nowMs = Date.now();
    const patch: {
      terminalSessionId: any;
      updatedAt: number;
      previewStatus?: WorkspaceTerminalPreviewStatus;
      lastPreviewProbeAt?: number;
      lastPreviewProbeSummary?: string;
      lastBrowserObservationAt?: number;
      lastBrowserObservationSummary?: string;
    } = {
      terminalSessionId: args.terminalSessionId,
      updatedAt: nowMs,
    };

    if (args.previewStatus !== undefined) {
      patch.previewStatus = args.previewStatus;
    }
    const previewProbeSummary = normalizeObservationSummary(
      args.previewProbeSummary,
    );
    if (previewProbeSummary) {
      patch.lastPreviewProbeAt = nowMs;
      patch.lastPreviewProbeSummary = previewProbeSummary;
    }
    const browserObservationSummary = normalizeObservationSummary(
      args.browserObservationSummary,
    );
    if (browserObservationSummary) {
      patch.lastBrowserObservationAt = nowMs;
      patch.lastBrowserObservationSummary = browserObservationSummary;
    }

    const updated: any = await ctx.runMutation(
      internal.workspaceTerminals.updateWorkspaceTerminalSessionInternal as any,
      patch,
    );
    return {
      ok: true,
      terminal_session_id: String(args.terminalSessionId ?? "").trim(),
      ...(updated ? summarizeTerminalRow(updated) : {}),
    };
  },
});
