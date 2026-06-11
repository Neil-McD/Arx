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
  releaseBlaxelWorkspaceComputerIfIdle,
} from "./blaxelWorkspaceComputerProvider.ts";
import {
  ensureBillableBlaxelWorkspaceComputer,
  settleBillableBlaxelWorkspaceLeaseBestEffort,
} from "./blaxelWorkspaceWake.ts";
import { buildBlaxelProjectWorkspaceNames } from "./blaxelWorkspaceProjectNames.ts";
import {
  buildBlaxelTerminalProcessContextFromRow,
  isWorkspaceTerminalActiveStatus,
  readWorkspaceTerminalProcess,
  resolveWorkspaceTerminalPreview,
  stopWorkspaceTerminalProcess,
  summarizeWorkspaceTerminalRow,
  type WorkspaceTerminalHealthStatus,
  type WorkspaceTerminalPreviewInspectionStatus,
  type WorkspaceTerminalPreviewRenderStatus,
  type WorkspaceTerminalLifecycleOwner,
  type WorkspaceTerminalPreviewStatus,
  type WorkspaceTerminalPreviewTransportStatus,
} from "./workspaceTerminalProcessCore";
import { classifyRuntimePreviewProbe } from "../shared/runtimePreviewProbe";
import {
  normalizeRecordedWorkspaceResourceProviderId,
  resolveRecordedWorkspaceResourceProviderId,
} from "../shared/workspaceComputerProvider";

const PROJECT_TERMINAL_RECONCILE_FRESH_MS = 8_000;
const RECENT_TERMINAL_ISSUE_VISIBLE_MS = 5 * 60_000;
const RECENT_TERMINAL_ISSUE_LIMIT = 4;
const PROJECT_BACKGROUND_SANDBOX_CREATE_LEASE_MS = 60_000;
const workspaceResourceProviderIdValidator = v.literal("blaxel");

type WorkspaceTerminalStatus = "starting" | "running" | "exited" | "failed" | "stopped";
type WorkspaceTerminalCompletionReason =
  | "exited"
  | "failed"
  | "stopped"
  | "sandbox_missing"
  | "session_missing"
  | "command_missing"
  | "preflight_failed";
type WorkspaceTerminalSummary = {
  id: string;
  lifecycle_owner: WorkspaceTerminalLifecycleOwner;
  started_by_thread_id: string | null;
  started_by_run_id: string | null;
  provider_sandbox_provider_id: "blaxel" | null;
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
  completion_recorded_at: number | null;
  completion_reason: WorkspaceTerminalCompletionReason | null;
  output_tail: string | null;
  last_heartbeat_at: number | null;
  health_status: WorkspaceTerminalHealthStatus;
  health_summary: string | null;
  preview_status: WorkspaceTerminalPreviewStatus;
  last_preview_probe_at: number | null;
  last_preview_probe_summary: string | null;
  last_browser_observation_at: number | null;
  last_browser_observation_summary: string | null;
  preview_transport_status: WorkspaceTerminalPreviewTransportStatus | null;
  preview_inspection_status: WorkspaceTerminalPreviewInspectionStatus | null;
  preview_render_status: WorkspaceTerminalPreviewRenderStatus | null;
};
type ProjectSandboxActiveTerminalStatus = {
  hasActiveTerminal: boolean;
  activeCount: number;
};
type ProjectSandboxActiveTerminalRefreshStatus =
  ProjectSandboxActiveTerminalStatus & {
    checkedCount: number;
    refreshedCount: number;
  };
type ProjectTerminalReconcileLease = {
  acquired: boolean;
  reason:
    | "acquired"
    | "fresh"
    | "project_not_found"
    | "sandbox_missing"
    | "sandbox_mismatch";
  providerSandboxId: string | null;
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

const workspaceTerminalPreviewTransportStatusValidator = v.union(
  v.literal("not_started"),
  v.literal("loading"),
  v.literal("loaded"),
  v.literal("failed"),
);

const workspaceTerminalPreviewInspectionStatusValidator = v.union(
  v.literal("not_attempted"),
  v.literal("same_origin_dom"),
  v.literal("cross_origin_uninspectable"),
  v.literal("dom_unavailable"),
);

const workspaceTerminalPreviewRenderStatusValidator = v.union(
  v.literal("unknown"),
  v.literal("visible_content"),
  v.literal("blank_suspected"),
  v.literal("transport_error"),
);

const workspaceTerminalCompletionReasonValidator = v.union(
  v.literal("exited"),
  v.literal("failed"),
  v.literal("stopped"),
  v.literal("sandbox_missing"),
  v.literal("session_missing"),
  v.literal("command_missing"),
  v.literal("preflight_failed"),
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

function patchChangesRow(row: Record<string, unknown>, patch: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(patch)) {
    if (row[key] !== value) return true;
  }
  return false;
}

function isInternalDiagnosticTerminal(row: WorkspaceTerminalSummary): boolean {
  return row.cwd === ".polynet-smoke" || row.command.includes(".polynet-smoke");
}

function isRecentTerminalIssue(row: WorkspaceTerminalSummary, nowMs: number): boolean {
  if (isTerminalActiveStatus(row.status)) return false;
  if (isInternalDiagnosticTerminal(row)) return false;
  if (row.status === "stopped") return false;
  if (row.completion_reason === "stopped") return false;

  const lastSeenAt = row.finished_at ?? row.updated_at;
  if (
    !Number.isFinite(lastSeenAt) ||
    lastSeenAt <= 0 ||
    nowMs - lastSeenAt > RECENT_TERMINAL_ISSUE_VISIBLE_MS
  ) {
    return false;
  }

  if (row.status === "failed") return true;
  if (row.status === "exited") {
    return (
      row.preview_port !== null ||
      row.preview_status === "server_exited" ||
      row.health_status === "unhealthy"
    );
  }
  return false;
}

async function probeWorkspaceTerminalPreviewUrl(
  previewUrl: string,
): Promise<{
  previewStatus: WorkspaceTerminalPreviewStatus;
  previewTransportStatus: WorkspaceTerminalPreviewTransportStatus;
  previewRenderStatus: WorkspaceTerminalPreviewRenderStatus;
  previewProbeSummary: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await fetch(previewUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const contentType = response.headers.get("content-type");
    const bodySnippet = await response.text().then(
      (text) => text.slice(0, 2_000),
      () => "",
    );
    const classified = classifyRuntimePreviewProbe({
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      contentType,
      bodySnippet,
    });
    return {
      previewStatus: classified.previewStatus,
      previewTransportStatus: classified.transportStatus,
      previewRenderStatus: classified.renderStatus,
      previewProbeSummary: classified.summary,
    };
  } catch (error) {
    const classified = classifyRuntimePreviewProbe({
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : String(error),
      timedOut: error instanceof Error && error.name === "AbortError",
    });
    return {
      previewStatus: classified.previewStatus,
      previewTransportStatus: classified.transportStatus,
      previewRenderStatus: classified.renderStatus,
      previewProbeSummary: classified.summary,
    };
  } finally {
    clearTimeout(timeout);
  }
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
      return isRecentTerminalIssue(row, nowMs);
    })
    .sort((a, b) => b.updated_at - a.updated_at)
    .slice(0, RECENT_TERMINAL_ISSUE_LIMIT);
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

export const readProjectSandboxActiveTerminalStatusInternal = internalQuery({
  args: {
    ownerId: v.id("users"),
    projectId: v.id("cloudProjects"),
    providerSandboxId: v.string(),
  },
  handler: async (ctx, args): Promise<ProjectSandboxActiveTerminalStatus> => {
    const rows = await ctx.db
      .query("workspaceTerminalSessions")
      .withIndex("by_providerSandboxId", (q) =>
        q.eq("providerSandboxId", args.providerSandboxId),
      )
      .collect();
    const activeRows = rows.filter(
      (row) =>
        String(row.ownerId ?? "") === String(args.ownerId) &&
        String(row.projectId ?? "") === String(args.projectId) &&
        isTerminalActiveStatus(row.status),
    );
    return {
      hasActiveTerminal: activeRows.length > 0,
      activeCount: activeRows.length,
    };
  },
});

export const refreshProjectSandboxActiveTerminalStatusInternal = internalAction({
  args: {
    ownerId: v.id("users"),
    projectId: v.id("cloudProjects"),
    providerSandboxId: v.string(),
  },
  handler: async (ctx, args): Promise<ProjectSandboxActiveTerminalRefreshStatus> => {
    const rows = (await ctx.runQuery(
      internal.workspaceTerminals.listWorkspaceTerminalSessionsBySandboxInternal as any,
      {
        providerSandboxId: args.providerSandboxId,
      },
    )) as any[];
    const activeRows = rows.filter(
      (row) =>
        String(row.ownerId ?? "") === String(args.ownerId) &&
        String(row.projectId ?? "") === String(args.projectId) &&
        isTerminalActiveStatus(row.status),
    );
    let refreshedCount = 0;
    for (const row of activeRows) {
      const refreshed = await readWorkspaceTerminalProcess({
        ctx,
        row,
        session: buildBlaxelTerminalProcessContextFromRow(row),
      });
      if (
        refreshed &&
        typeof refreshed === "object" &&
        !Array.isArray(refreshed) &&
        (refreshed as { ok?: unknown }).ok === false
      ) {
        const code = normalizeOptionalString(
          (refreshed as { code?: unknown }).code,
        );
        const message =
          normalizeOptionalString((refreshed as { message?: unknown }).message) ??
          "Terminal process refresh failed.";
        throw new Error(code ? `${code}: ${message}` : message);
      }
      refreshedCount += 1;
    }
    const current: ProjectSandboxActiveTerminalStatus = await ctx.runQuery(
      internal.workspaceTerminals.readProjectSandboxActiveTerminalStatusInternal as any,
      {
        ownerId: args.ownerId,
        projectId: args.projectId,
        providerSandboxId: args.providerSandboxId,
      },
    );
    return {
      hasActiveTerminal: Boolean((current as any)?.hasActiveTerminal),
      activeCount: Math.max(
        0,
        Number((current as any)?.activeCount ?? 0) || 0,
      ),
      checkedCount: activeRows.length,
      refreshedCount,
    };
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
    providerSandboxProviderId: v.optional(workspaceResourceProviderIdValidator),
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
    completionRecordedAt: v.optional(v.number()),
    completionReason: v.optional(workspaceTerminalCompletionReasonValidator),
    lastOutputTail: v.optional(v.string()),
    lastHeartbeatAt: v.optional(v.number()),
    healthStatus: v.optional(workspaceTerminalHealthStatusValidator),
    healthSummary: v.optional(v.string()),
    previewStatus: v.optional(workspaceTerminalPreviewStatusValidator),
    lastPreviewProbeAt: v.optional(v.number()),
    lastPreviewProbeSummary: v.optional(v.string()),
    lastBrowserObservationAt: v.optional(v.number()),
    lastBrowserObservationSummary: v.optional(v.string()),
    previewTransportStatus: v.optional(workspaceTerminalPreviewTransportStatusValidator),
    previewInspectionStatus: v.optional(workspaceTerminalPreviewInspectionStatusValidator),
    previewRenderStatus: v.optional(workspaceTerminalPreviewRenderStatusValidator),
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
      providerSandboxProviderId: "blaxel",
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
      providerSandboxProviderId: undefined,
      providerSandboxState: undefined,
      providerSandboxLastSeenAt: undefined,
      updatedAt: args.nowMs,
    });
    return await ctx.db.get(project._id);
  },
});

// Terminal rows can outlive their processes: Blaxel deletes cold sandboxes
// (48h idle) and nothing else flips the row. But heartbeats are
// observation-driven (UI polling / provider reads refresh them), so a stale
// heartbeat alone does NOT mean the process is dead — a healthy app nobody
// is watching also goes stale. Stale rows are therefore routed through the
// existing provider-truth reconciler, which reads real process status and
// marks rows from evidence instead of guesses.
export const reconcileStaleWorkspaceTerminalSessionsInternal = internalMutation({
  args: {
    limit: v.optional(v.number()),
    staleAfterMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 100)));
    const staleAfterMs = Math.max(
      60_000,
      Math.floor(args.staleAfterMs ?? 30 * 60 * 1000),
    );
    const cutoff = Date.now() - staleAfterMs;
    const staleProjects = new Map<string, { ownerId: any; projectId: any }>();
    for (const status of ["running", "starting"] as const) {
      const rows = await ctx.db
        .query("workspaceTerminalSessions")
        .withIndex("by_status_updatedAt", (q: any) =>
          q.eq("status", status).lt("updatedAt", cutoff),
        )
        .take(limit);
      for (const row of rows as Array<{ ownerId: any; projectId: any }>) {
        staleProjects.set(`${String(row.ownerId)}:${String(row.projectId)}`, {
          ownerId: row.ownerId,
          projectId: row.projectId,
        });
      }
    }
    let scheduled = 0;
    for (const target of staleProjects.values()) {
      await ctx.scheduler.runAfter(
        scheduled * 2_000,
        internal.workspaceTerminals.reconcileProjectWorkspaceTerminalsInternal as any,
        { ownerId: target.ownerId, projectId: target.projectId },
      );
      scheduled += 1;
      if (scheduled >= 25) break;
    }
    return { staleProjects: staleProjects.size, scheduled };
  },
});

export const acquireProjectTerminalReconcileLeaseInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    projectId: v.id("cloudProjects"),
    providerSandboxId: v.optional(v.string()),
    nowMs: v.number(),
    freshMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ProjectTerminalReconcileLease> => {
    const project = await ctx.db.get(args.projectId);
    if (!project || String(project.ownerId ?? "") !== String(args.ownerId)) {
      return {
        acquired: false,
        reason: "project_not_found",
        providerSandboxId: null,
      };
    }

    const currentSandboxId = normalizeOptionalString(project.providerSandboxId);
    const requestedSandboxId = normalizeOptionalString(args.providerSandboxId);
    if (currentSandboxId && requestedSandboxId && currentSandboxId !== requestedSandboxId) {
      return {
        acquired: false,
        reason: "sandbox_mismatch",
        providerSandboxId: currentSandboxId,
      };
    }
    const providerSandboxId = currentSandboxId ?? requestedSandboxId;
    if (!providerSandboxId) {
      return {
        acquired: false,
        reason: "sandbox_missing",
        providerSandboxId: null,
      };
    }

    const freshMs = Math.max(
      1_000,
      Math.min(60_000, Math.floor(args.freshMs ?? PROJECT_TERMINAL_RECONCILE_FRESH_MS)),
    );
    const lastSeenAt = Number(project.providerSandboxLastSeenAt ?? 0);
    if (
      Number.isFinite(lastSeenAt) &&
      lastSeenAt > 0 &&
      Math.max(0, args.nowMs - lastSeenAt) <= freshMs
    ) {
      return {
        acquired: false,
        reason: "fresh",
        providerSandboxId,
      };
    }

    await ctx.db.patch(args.projectId, {
      providerSandboxId,
      providerSandboxProviderId: "blaxel",
      providerSandboxState: "started",
      providerSandboxLastSeenAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return {
      acquired: true,
      reason: "acquired",
      providerSandboxId,
    };
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
    completionRecordedAt: v.optional(v.number()),
    completionReason: v.optional(workspaceTerminalCompletionReasonValidator),
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
    previewTransportStatus: v.optional(workspaceTerminalPreviewTransportStatusValidator),
    previewInspectionStatus: v.optional(workspaceTerminalPreviewInspectionStatusValidator),
    previewRenderStatus: v.optional(workspaceTerminalPreviewRenderStatusValidator),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.terminalSessionId);
    if (!row) return null;
    const patch: Record<string, unknown> = {};
    if (args.status !== undefined) patch.status = args.status;
    if (args.updatedAt !== undefined) patch.updatedAt = args.updatedAt;
    if (args.finishedAt !== undefined) patch.finishedAt = args.finishedAt;
    if (args.exitCode !== undefined) patch.exitCode = args.exitCode;
    if (args.completionRecordedAt !== undefined) patch.completionRecordedAt = args.completionRecordedAt;
    if (args.completionReason !== undefined) patch.completionReason = args.completionReason;
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
    if (args.previewTransportStatus !== undefined) patch.previewTransportStatus = args.previewTransportStatus;
    if (args.previewInspectionStatus !== undefined) patch.previewInspectionStatus = args.previewInspectionStatus;
    if (args.previewRenderStatus !== undefined) patch.previewRenderStatus = args.previewRenderStatus;
    if (!patchChangesRow(row as Record<string, unknown>, patch)) return row;
    await ctx.db.patch(args.terminalSessionId, patch);
    return { ...row, ...patch };
  },
});

export const setProjectBackgroundSandboxInternal = internalMutation({
  args: {
    projectId: v.id("cloudProjects"),
    providerSandboxId: v.string(),
    providerSandboxProviderId: workspaceResourceProviderIdValidator,
    providerSandboxState: v.optional(v.string()),
    providerSandboxLastSeenAt: v.optional(v.number()),
    providerSandboxStartedAt: v.optional(v.number()),
    providerSandboxCreditReservationKey: v.optional(v.string()),
    providerSandboxCreditBudgetCredits: v.optional(v.number()),
    providerSandboxCreditBudgetExpiresAt: v.optional(v.number()),
    clearSandboxAccounting: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    const previousSandboxCreditReservationKey = normalizeOptionalString(
      project?.providerSandboxCreditReservationKey,
    );
    const previousSandboxCreditBudgetExpiresAt =
      typeof project?.providerSandboxCreditBudgetExpiresAt === "number"
        ? project.providerSandboxCreditBudgetExpiresAt
        : null;
    const previousProviderId = resolveRecordedWorkspaceResourceProviderId({
      providerId: project?.providerSandboxProviderId,
      resourceId: project?.providerSandboxId,
    });
    const previousSandboxId = normalizeOptionalString(project?.providerSandboxId);
    const sandboxOwnershipChanged =
      previousProviderId !== null &&
      (previousProviderId !== args.providerSandboxProviderId ||
        previousSandboxId !== normalizeOptionalString(args.providerSandboxId));
    const clearSandboxAccounting =
      args.clearSandboxAccounting === true || sandboxOwnershipChanged;
    await ctx.db.patch(args.projectId, {
      providerSandboxId: args.providerSandboxId,
      providerSandboxProviderId: args.providerSandboxProviderId,
      providerSandboxState: args.providerSandboxState,
      providerSandboxLastSeenAt: args.providerSandboxLastSeenAt,
      providerSandboxStartedAt:
        args.providerSandboxStartedAt ??
        (clearSandboxAccounting ? undefined : project?.providerSandboxStartedAt),
      providerSandboxCreditReservationKey:
        args.providerSandboxCreditReservationKey ??
        (clearSandboxAccounting
          ? undefined
          : project?.providerSandboxCreditReservationKey),
      providerSandboxCreditBudgetCredits:
        args.providerSandboxCreditBudgetCredits ??
        (clearSandboxAccounting
          ? undefined
          : project?.providerSandboxCreditBudgetCredits),
      providerSandboxCreditBudgetExpiresAt:
        args.providerSandboxCreditBudgetExpiresAt ??
        (clearSandboxAccounting
          ? undefined
          : project?.providerSandboxCreditBudgetExpiresAt),
      updatedAt: Date.now(),
    });
    const updatedProject = await ctx.db.get(args.projectId);
    return {
      project: updatedProject,
      previousSandboxCreditReservationKey,
      previousSandboxCreditBudgetExpiresAt,
    };
  },
});

export const releaseProjectBackgroundSandboxAccountingIfCurrentInternal = internalMutation({
  args: {
    projectId: v.id("cloudProjects"),
    providerSandboxId: v.string(),
    providerSandboxProviderId: workspaceResourceProviderIdValidator,
    providerSandboxCreditReservationKey: v.string(),
    providerSandboxStartedAt: v.number(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      return { released: false, reason: "project_not_found" };
    }
    const currentProviderId = resolveRecordedWorkspaceResourceProviderId({
      providerId: project.providerSandboxProviderId,
      resourceId: project.providerSandboxId,
    });
    if (currentProviderId !== args.providerSandboxProviderId) {
      return { released: false, reason: "provider_mismatch" };
    }
    if (
      normalizeOptionalString(project.providerSandboxId) !==
      normalizeOptionalString(args.providerSandboxId)
    ) {
      return { released: false, reason: "sandbox_mismatch" };
    }
    if (
      normalizeOptionalString(project.providerSandboxCreditReservationKey) !==
      normalizeOptionalString(args.providerSandboxCreditReservationKey)
    ) {
      return { released: false, reason: "reservation_mismatch" };
    }
    if (
      Number(project.providerSandboxStartedAt) !==
      Number(args.providerSandboxStartedAt)
    ) {
      return { released: false, reason: "started_at_mismatch" };
    }
    const nowMs = args.nowMs ?? Date.now();
    await ctx.db.patch(args.projectId, {
      providerSandboxState: "standby",
      providerSandboxLastSeenAt: nowMs,
      providerSandboxStartedAt: undefined,
      providerSandboxCreditReservationKey: undefined,
      providerSandboxCreditBudgetCredits: undefined,
      providerSandboxCreditBudgetExpiresAt: undefined,
      updatedAt: nowMs,
    });
    return { released: true, reason: "released" };
  },
});

export const clearProjectBackgroundSandboxInternal = internalMutation({
  args: {
    projectId: v.id("cloudProjects"),
    providerSandboxId: v.optional(v.string()),
    providerSandboxProviderId: v.optional(workspaceResourceProviderIdValidator),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    const expectedSandboxId = normalizeOptionalString(args.providerSandboxId);
    const expectedProviderId = normalizeRecordedWorkspaceResourceProviderId(
      args.providerSandboxProviderId,
    );
    if (
      expectedSandboxId &&
      normalizeOptionalString(project?.providerSandboxId) !== expectedSandboxId
    ) {
      return project;
    }
    if (
      expectedProviderId &&
      resolveRecordedWorkspaceResourceProviderId({
        providerId: project?.providerSandboxProviderId,
        resourceId: project?.providerSandboxId,
      }) !== expectedProviderId
    ) {
      return project;
    }
    await ctx.db.patch(args.projectId, {
      providerSandboxId: undefined,
      providerSandboxProviderId: undefined,
      providerSandboxState: undefined,
      providerSandboxLastSeenAt: undefined,
      providerSandboxStartedAt: undefined,
      providerSandboxCreditReservationKey: undefined,
      providerSandboxCreditBudgetCredits: undefined,
      providerSandboxCreditBudgetExpiresAt: undefined,
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
    const reconcileLease: ProjectTerminalReconcileLease = await ctx.runMutation(
      internal.workspaceTerminals.acquireProjectTerminalReconcileLeaseInternal as any,
      {
        ownerId: args.ownerId,
        projectId: args.projectId,
        providerSandboxId,
        nowMs,
        freshMs: PROJECT_TERMINAL_RECONCILE_FRESH_MS,
      },
    );
    if (!reconcileLease.acquired) {
      return buildTerminalSnapshot(rows);
    }

    for (const row of activeRows) {
      await readWorkspaceTerminalProcess({
        ctx,
        row,
        session: buildBlaxelTerminalProcessContextFromRow(row),
      });
    }

    await ctx.runMutation(internal.workspaceTerminals.setProjectBackgroundSandboxInternal as any, {
      projectId: args.projectId,
      providerSandboxId,
      providerSandboxProviderId: "blaxel",
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

export const startProjectWorkspaceComputer = action({
  args: {
    authSubject: v.optional(v.string()),
    projectId: v.id("cloudProjects"),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const { actor, project } = await resolveOwnedProject({
      ctx,
      authSubject: args.authSubject ?? null,
      projectId: args.projectId,
    });
    void project;

    const started = await ensureBillableBlaxelWorkspaceComputer({
      ctx,
      projectId: args.projectId,
      ownerId: actor.dbUserId,
      lifecycleIntent: "interactive",
      reservationAction: "interactive_workspace_computer",
      reuseExistingLease: true,
      labels: {
        purpose: "workspace-user-computer",
        project_id: String(args.projectId),
        owner_id: String(actor.dbUserId),
      },
    });
    if (!started.ok) return started;
    return {
      ok: true,
      status: "active",
      provider_sandbox_id: started.providerSandboxId,
      provider_id: "blaxel",
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

export const stopProjectWorkspaceComputer = action({
  args: {
    authSubject: v.optional(v.string()),
    projectId: v.id("cloudProjects"),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const { actor, project } = await resolveOwnedProject({
      ctx,
      authSubject: args.authSubject ?? null,
      projectId: args.projectId,
    });
    const providerSandboxId = normalizeOptionalString(project.providerSandboxId);
    if (!providerSandboxId) {
      return {
        ok: true,
        status: "inactive",
        stopped_count: 0,
        provider_sandbox_id: null,
      };
    }

    const rows = (await ctx.runQuery(
      internal.workspaceTerminals.listProjectWorkspaceTerminalSessionsInternal as any,
      {
        ownerId: actor.dbUserId,
        projectId: args.projectId,
      },
    )) as any[];
    const activeRows = rows.filter(
      (row) =>
        isTerminalActiveStatus(row.status) &&
        normalizeOptionalString(row.providerSandboxId) === providerSandboxId,
    );
    for (const row of activeRows) {
      await ctx.runAction(internal.workspaceTerminals.stopWorkspaceTerminalInternal as any, {
        authSubject: args.authSubject ?? null,
        terminalSessionId: row._id,
      });
    }

    const nowMs = Date.now();
    const providerRelease = await releaseBlaxelWorkspaceComputerIfIdle({
      sandboxName: providerSandboxId,
    });
    if (!providerRelease.ok) {
      return {
        ok: false,
        status: "release_failed",
        stopped_count: activeRows.length,
        provider_sandbox_id: providerSandboxId,
        provider_id: "blaxel",
        code: providerRelease.code,
        message: providerRelease.message,
      };
    }
    const startedAt = Number(
      project.providerSandboxStartedAt ??
        project.providerSandboxLastSeenAt ??
        nowMs,
    );
    const measuredDurationSeconds = Math.max(
      0,
      (nowMs - (Number.isFinite(startedAt) ? startedAt : nowMs)) / 1000,
    );
    const settledLease = await settleBillableBlaxelWorkspaceLeaseBestEffort({
      ctx,
      projectId: args.projectId,
      ownerId: actor.dbUserId,
      providerSandboxId,
      settlementReason: "workspace_computer_stopped",
      billableDurationSeconds: measuredDurationSeconds,
      providerStandbyGraceSeconds: providerRelease.billableGraceSeconds,
      providerReleaseReason: providerRelease.reason,
      providerReleaseConfirmed: providerRelease.releaseConfirmed,
      nowMs,
    });

    await ctx.runMutation(
      internal.workspaceTerminals.setProjectBackgroundSandboxInternal as any,
      {
        projectId: args.projectId,
        providerSandboxId,
        providerSandboxProviderId: "blaxel",
        providerSandboxState: "standby",
        providerSandboxLastSeenAt: nowMs,
        clearSandboxAccounting: true,
      },
    );

    return {
      ok: true,
      status: "standby",
      stopped_count: activeRows.length,
      provider_sandbox_id: providerSandboxId,
      provider_id: "blaxel",
      settled_credit_reservation_key: settledLease.creditReservationKey,
      provider_release_reason: providerRelease.reason,
      provider_release_confirmed: providerRelease.releaseConfirmed,
      provider_standby_grace_seconds: providerRelease.billableGraceSeconds,
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
    const { row } = access;
    const result = await stopWorkspaceTerminalProcess({
      ctx,
      row,
      session: buildBlaxelTerminalProcessContextFromRow(row),
      forceStoppedStatus: true,
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
    const preview = await resolveWorkspaceTerminalPreview({
      row,
      session: buildBlaxelTerminalProcessContextFromRow(row),
      workspaceRequiredMessage:
        "Preview is only available while its workspace session is active.",
      previewNotEnabledMessage: "This terminal does not expose an app preview.",
      workspaceMismatchMessage:
        "Preview terminal is not attached to this workspace session.",
    });
    if (preview.ok !== true) return preview;
    const previewUrl = String(preview.preview_url ?? "").trim();
    if (!previewUrl) return preview;
    const probe = await probeWorkspaceTerminalPreviewUrl(previewUrl);
    const nowMs = Date.now();
    await ctx.runMutation(
      internal.workspaceTerminals.updateWorkspaceTerminalSessionInternal as any,
      {
        terminalSessionId: row._id,
        updatedAt: nowMs,
        previewStatus: probe.previewStatus,
        lastPreviewProbeAt: nowMs,
        lastPreviewProbeSummary: probe.previewProbeSummary,
        previewTransportStatus: probe.previewTransportStatus,
        previewRenderStatus: probe.previewRenderStatus,
      },
    );
    return {
      ...preview,
      preview_probe_summary: probe.previewProbeSummary,
      preview_transport_status: probe.previewTransportStatus,
      preview_render_status: probe.previewRenderStatus,
    };
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
    previewTransportStatus: v.optional(workspaceTerminalPreviewTransportStatusValidator),
    previewInspectionStatus: v.optional(workspaceTerminalPreviewInspectionStatusValidator),
    previewRenderStatus: v.optional(workspaceTerminalPreviewRenderStatusValidator),
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
      previewTransportStatus?: WorkspaceTerminalPreviewTransportStatus;
      previewInspectionStatus?: WorkspaceTerminalPreviewInspectionStatus;
      previewRenderStatus?: WorkspaceTerminalPreviewRenderStatus;
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
    if (args.previewTransportStatus !== undefined) {
      patch.previewTransportStatus = args.previewTransportStatus;
    }
    if (args.previewInspectionStatus !== undefined) {
      patch.previewInspectionStatus = args.previewInspectionStatus;
    }
    if (args.previewRenderStatus !== undefined) {
      patch.previewRenderStatus = args.previewRenderStatus;
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
