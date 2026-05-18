import { internal } from "./_generated/api";
import { action, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  assertStagingMaintenanceAllowed,
  findOwnerUser,
  normalizeLimit,
  normalizeText,
} from "./stagingMaintenance";
import { isWorkspaceTerminalActiveStatus } from "./workspaceTerminalProcessCore";

const STAGING_PROJECT_HYGIENE_PROJECT_NAME = "General";
const ARCHIVED_DUPLICATE_NAME_PREFIX = "__staging_archived_duplicate__";
const ARCHIVED_DUPLICATE_STATUS = "staging_archived_duplicate";
const STALE_RUNTIME_RUN_BLOCKER_MS = 15 * 60 * 1000;
const ACTIVE_PROJECT_SANDBOX_STATES = new Set([
  "creating",
  "started",
  "stopping",
  "error",
]);
const INACTIVE_PROJECT_SANDBOX_STATES = new Set([
  "stopped",
  "destroyed",
  "released",
  "cleared",
  "deleted",
]);

const stagingProjectHygieneArgs = {
  maintenanceToken: v.string(),
  ownerId: v.optional(v.string()),
  ownerEmail: v.optional(v.string()),
  ownerAuthSubject: v.optional(v.string()),
  projectName: v.optional(v.string()),
  nowMs: v.optional(v.number()),
};

function normalizeProjectName(raw: unknown): string {
  const projectName =
    normalizeText(raw) || STAGING_PROJECT_HYGIENE_PROJECT_NAME;
  if (projectName !== STAGING_PROJECT_HYGIENE_PROJECT_NAME) {
    throw new Error("staging_project_hygiene_project_required");
  }
  return projectName;
}

function normalizeTimestamp(raw: unknown): number | null {
  const value = Math.floor(Number(raw ?? 0));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeDurationMs(raw: unknown, fallback: number): number {
  const value = Math.floor(Number(raw ?? fallback));
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(24 * 60 * 60 * 1000, Math.max(5 * 60 * 1000, value));
}

function projectSortValue(project: any): number {
  return (
    normalizeTimestamp(project?.createdAt) ??
    normalizeTimestamp(project?._creationTime) ??
    normalizeTimestamp(project?.updatedAt) ??
    0
  );
}

function sortProjectsByCanonicalOrder(projects: any[]): any[] {
  return [...projects].sort((a, b) => {
    const byCreatedAt = projectSortValue(a) - projectSortValue(b);
    if (byCreatedAt !== 0) return byCreatedAt;
    return String(a?._id ?? "").localeCompare(String(b?._id ?? ""));
  });
}

function isProjectSandboxActive(project: any): boolean {
  const providerSandboxId = normalizeText(project?.providerSandboxId);
  const state = normalizeText(project?.providerSandboxState).toLowerCase();
  if (state && ACTIVE_PROJECT_SANDBOX_STATES.has(state)) return true;
  if (!providerSandboxId) return false;
  if (!state) return true;
  return !INACTIVE_PROJECT_SANDBOX_STATES.has(state);
}

function archiveNameForProject(project: any): string {
  return `${ARCHIVED_DUPLICATE_NAME_PREFIX}${STAGING_PROJECT_HYGIENE_PROJECT_NAME}__${String(project._id)}`;
}

function archiveSlugForProject(project: any): string {
  return `staging-archived-duplicate-${String(project._id).toLowerCase()}`;
}

function buildArchivePatch(args: {
  project: any;
  canonicalProject: any;
  nowMs: number;
}) {
  const archivedAt = new Date(args.nowMs).toISOString();
  const originalName = normalizeText(args.project.name) || STAGING_PROJECT_HYGIENE_PROJECT_NAME;
  const originalSlug = normalizeText(args.project.slug);
  return {
    name: archiveNameForProject(args.project),
    slug: archiveSlugForProject(args.project),
    status: ARCHIVED_DUPLICATE_STATUS,
    description: [
      "Staging duplicate archived by maintenance hygiene.",
      `Original name: ${originalName}.`,
      originalSlug ? `Original slug: ${originalSlug}.` : null,
      `Canonical project: ${String(args.canonicalProject._id)}.`,
      `Archived at: ${archivedAt}.`,
    ]
      .filter(Boolean)
      .join(" "),
    updatedAt: args.nowMs,
  };
}

async function collectProjectEvidence(args: {
  ctx: { db: any };
  ownerId: any;
  project: any;
  nowMs: number;
}) {
  const projectId = args.project._id;
  const projectIdString = String(projectId);
  const ownerIdString = String(args.ownerId);
  const providerSandboxId = normalizeText(args.project.providerSandboxId);
  const providerSandboxState = normalizeText(args.project.providerSandboxState);

  const terminalRows = await args.ctx.db
    .query("workspaceTerminalSessions")
    .withIndex("by_owner_project", (q: any) =>
      q.eq("ownerId", args.ownerId).eq("projectId", projectId),
    )
    .collect();
  const activeTerminalRows = terminalRows.filter((row: any) =>
    isWorkspaceTerminalActiveStatus(row.status),
  );

  const threadRows = await args.ctx.db
    .query("threads")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .collect();

  const runtimeRows = (
    await args.ctx.db
      .query("runtimeRuns")
      .withIndex("by_owner_startedAt", (q: any) =>
        q.eq("ownerId", args.ownerId),
      )
      .collect()
  ).filter((row: any) => String(row.projectId ?? "") === projectIdString);
  const activeRuntimeRows = runtimeRows.filter((row: any) => row.status === "running");
  const activeRuntimeRunSamples = activeRuntimeRows.slice(0, 10).map((row: any) => {
    const lastProgressAt =
      normalizeTimestamp(row.updatedAt) ??
      normalizeTimestamp(row.startedAt) ??
      args.nowMs;
    return {
      runId: row.runId,
      threadId: String(row.threadId ?? ""),
      startedAt: row.startedAt ?? null,
      updatedAt: row.updatedAt ?? null,
      ageMs: Math.max(0, args.nowMs - lastProgressAt),
      visibility: row.visibility ?? null,
      harnessProfile: row.harnessProfile ?? null,
      workspaceSessionState: row.workspaceSessionState ?? null,
      workspaceProviderSandboxPresent: Boolean(
        normalizeText(row.workspaceProviderSandboxId),
      ),
    };
  });

  const workspaceChargeRows = (
    await args.ctx.db
      .query("workspaceComputeCharges")
      .withIndex("by_user", (q: any) => q.eq("userId", args.ownerId))
      .collect()
  ).filter((row: any) => String(row.projectId) === projectIdString);

  const creditLedgerRows = (
    await args.ctx.db
      .query("creditLedgerEntries")
      .withIndex("by_user_createdAt", (q: any) =>
        q.eq("userId", args.ownerId),
      )
      .collect()
  ).filter((row: any) => String(row.projectId ?? "") === projectIdString);

  const diagnosticRows = (
    await args.ctx.db
      .query("platformDiagnosticEvents")
      .withIndex("by_user_createdAt", (q: any) =>
        q.eq("userId", args.ownerId),
      )
      .collect()
  ).filter((row: any) => String(row.projectId ?? "") === projectIdString);

  const activeBridgeSessionRows = (
    await args.ctx.db
      .query("codexHarnessBridgeSessions")
      .withIndex("by_expiresAt", (q: any) => q.gt("expiresAt", args.nowMs))
      .collect()
  ).filter(
    (row: any) =>
      String(row.userId ?? "") === ownerIdString &&
      String(row.projectId ?? "") === projectIdString &&
      !row.revokedAt,
  );

  const activeBindingLockRows = (
    await args.ctx.db
      .query("codexHarnessThreadBindingLocks")
      .withIndex("by_expiresAt", (q: any) => q.gt("expiresAt", args.nowMs))
      .collect()
  ).filter(
    (row: any) =>
      String(row.userId ?? "") === ownerIdString &&
      String(row.projectId ?? "") === projectIdString,
  );

  const threadBindingRows = (
    await args.ctx.db
      .query("codexHarnessThreadBindings")
      .withIndex("by_user_thread_project", (q: any) =>
        q.eq("userId", ownerIdString),
      )
      .collect()
  ).filter((row: any) => String(row.projectId ?? "") === projectIdString);
  const activeThreadBindingRows = threadBindingRows.filter(
    (row: any) => row.status === "active",
  );

  const activeSandboxPresent = isProjectSandboxActive(args.project);
  const blockers = [
    activeSandboxPresent ? "active_project_sandbox" : null,
    activeTerminalRows.length > 0 ? "active_terminal_session" : null,
    activeRuntimeRows.length > 0 ? "active_runtime_run" : null,
    activeBridgeSessionRows.length > 0 ? "active_codex_bridge_session" : null,
    activeBindingLockRows.length > 0 ? "active_codex_binding_lock" : null,
  ].filter(Boolean) as string[];

  return {
    providerSandboxPresent: Boolean(providerSandboxId),
    providerSandboxState: providerSandboxState || null,
    activeSandboxPresent,
    referenceCounts: {
      terminalSessions: terminalRows.length,
      activeTerminalSessions: activeTerminalRows.length,
      threads: threadRows.length,
      runtimeRuns: runtimeRows.length,
      activeRuntimeRuns: activeRuntimeRows.length,
      workspaceComputeCharges: workspaceChargeRows.length,
      creditLedgerEntries: creditLedgerRows.length,
      platformDiagnosticEvents: diagnosticRows.length,
      codexBridgeSessionsActive: activeBridgeSessionRows.length,
      codexThreadBindings: threadBindingRows.length,
      codexThreadBindingsActive: activeThreadBindingRows.length,
      codexBindingLocksActive: activeBindingLockRows.length,
    },
    blockerSamples: {
      activeRuntimeRuns: activeRuntimeRunSamples,
    },
    blockers,
  };
}

async function buildDuplicateGeneralProjectInspection(args: {
  ctx: { db: any };
  ownerId?: string | null;
  ownerEmail?: string | null;
  ownerAuthSubject?: string | null;
  projectName?: string | null;
  nowMs?: number;
}) {
  const nowMs = Math.floor(args.nowMs ?? Date.now());
  const projectName = normalizeProjectName(args.projectName);
  const owner = await findOwnerUser({
    ctx: args.ctx,
    ownerId: args.ownerId ?? null,
    ownerEmail: args.ownerEmail ?? null,
    ownerAuthSubject: args.ownerAuthSubject ?? null,
  });
  const ownerProjects = await args.ctx.db
    .query("cloudProjects")
    .withIndex("by_owner", (q: any) => q.eq("ownerId", owner._id))
    .collect();
  const matchingProjects = sortProjectsByCanonicalOrder(
    ownerProjects.filter((row: any) => normalizeText(row.name) === projectName),
  );
  const canonicalProject = matchingProjects[0] ?? null;
  const duplicateProjects = canonicalProject ? matchingProjects.slice(1) : [];
  const duplicates = [];
  for (const project of duplicateProjects) {
    const evidence = await collectProjectEvidence({
      ctx: args.ctx,
      ownerId: owner._id,
      project,
      nowMs,
    });
    duplicates.push({
      id: String(project._id),
      name: project.name ?? null,
      slug: project.slug ?? null,
      status: project.status ?? null,
      createdAt: project.createdAt ?? null,
      updatedAt: project.updatedAt ?? null,
      proposedName: archiveNameForProject(project),
      proposedSlug: archiveSlugForProject(project),
      ...evidence,
    });
  }
  const blocked = duplicates.filter((row) => row.blockers.length > 0);
  return {
    ok: blocked.length === 0,
    reason: blocked.length > 0 ? "duplicate_project_blocked" : null,
    nowMs,
    projectName,
    owner: {
      id: String(owner._id),
      email: owner.email ?? null,
      normalizedEmail: owner.normalizedEmail ?? null,
    },
    duplicateNameCount: matchingProjects.length,
    canonicalProject: canonicalProject
      ? {
          id: String(canonicalProject._id),
          name: canonicalProject.name ?? null,
          slug: canonicalProject.slug ?? null,
          status: canonicalProject.status ?? null,
          createdAt: canonicalProject.createdAt ?? null,
          updatedAt: canonicalProject.updatedAt ?? null,
        }
      : null,
    duplicateCount: duplicateProjects.length,
    blockedCount: blocked.length,
    duplicates,
  };
}

export const inspectDuplicateGeneralProjects = query({
  args: stagingProjectHygieneArgs,
  handler: async (ctx, args) => {
    assertStagingMaintenanceAllowed({ maintenanceToken: args.maintenanceToken });
    return await buildDuplicateGeneralProjectInspection({
      ctx,
      ownerId: args.ownerId ?? null,
      ownerEmail: args.ownerEmail ?? null,
      ownerAuthSubject: args.ownerAuthSubject ?? null,
      projectName: args.projectName ?? null,
      nowMs: args.nowMs,
    });
  },
});

export const cleanupDuplicateGeneralProjects = mutation({
  args: {
    ...stagingProjectHygieneArgs,
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertStagingMaintenanceAllowed({ maintenanceToken: args.maintenanceToken });
    const dryRun = args.dryRun !== false;
    const inspection = await buildDuplicateGeneralProjectInspection({
      ctx,
      ownerId: args.ownerId ?? null,
      ownerEmail: args.ownerEmail ?? null,
      ownerAuthSubject: args.ownerAuthSubject ?? null,
      projectName: args.projectName ?? null,
      nowMs: args.nowMs,
    });

    const actions = inspection.duplicates.map((duplicate: any) => ({
      entity: "cloudProject",
      id: duplicate.id,
      key: inspection.projectName,
      action:
        duplicate.blockers.length > 0
          ? "blocked"
          : dryRun
            ? "would_archive"
            : "archived",
      changedFields:
        duplicate.blockers.length > 0
          ? []
          : ["name", "slug", "status", "description", "updatedAt"],
      blockers: duplicate.blockers,
      proposedName: duplicate.proposedName,
      proposedSlug: duplicate.proposedSlug,
    }));

    if (inspection.blockedCount > 0) {
      return {
        ...inspection,
        ok: false,
        dryRun,
        actions,
        postDuplicateNameCount: inspection.duplicateNameCount,
      };
    }

    if (!dryRun && inspection.canonicalProject) {
      for (const duplicate of inspection.duplicates) {
        const project = (await ctx.db.get(duplicate.id as any)) as any | null;
        if (!project || normalizeText(project.name) !== inspection.projectName) {
          throw new Error("staging_project_hygiene_duplicate_changed");
        }
        await ctx.db.patch(project._id, buildArchivePatch({
          project,
          canonicalProject: { _id: inspection.canonicalProject.id },
          nowMs: inspection.nowMs,
        }));
      }
    }

    const postInspection = dryRun
      ? inspection
      : await buildDuplicateGeneralProjectInspection({
          ctx,
          ownerId: inspection.owner.id,
          projectName: inspection.projectName,
          nowMs: inspection.nowMs,
        });

    return {
      ...inspection,
      ok: true,
      dryRun,
      actions,
      postDuplicateNameCount: postInspection.duplicateNameCount,
    };
  },
});

async function buildStaleDuplicateProjectRuntimeRunPlan(args: {
  ctx: { db: any };
  ownerId?: string | null;
  ownerEmail?: string | null;
  ownerAuthSubject?: string | null;
  projectName?: string | null;
  nowMs?: number;
  staleAfterMs?: number;
  limit?: number;
}) {
  const nowMs = Math.floor(args.nowMs ?? Date.now());
  const staleAfterMs = normalizeDurationMs(
    args.staleAfterMs,
    STALE_RUNTIME_RUN_BLOCKER_MS,
  );
  const limit = normalizeLimit(args.limit, 20, 50);
  const inspection = await buildDuplicateGeneralProjectInspection({
    ctx: args.ctx,
    ownerId: args.ownerId ?? null,
    ownerEmail: args.ownerEmail ?? null,
    ownerAuthSubject: args.ownerAuthSubject ?? null,
    projectName: args.projectName ?? null,
    nowMs,
  });
  const ownerId = inspection.owner.id as any;
  const duplicateIds = new Set(inspection.duplicates.map((row: any) => row.id));
  const candidates: any[] = [];
  const freshActiveRuns: any[] = [];
  const nonRuntimeBlockedProjects = inspection.duplicates
    .filter((row: any) =>
      row.blockers.some((blocker: string) => blocker !== "active_runtime_run"),
    )
    .map((row: any) => ({
      projectId: row.id,
      blockers: row.blockers.filter((blocker: string) => blocker !== "active_runtime_run"),
    }));

  if (duplicateIds.size > 0) {
    const runtimeRows = await args.ctx.db
      .query("runtimeRuns")
      .withIndex("by_owner_startedAt", (q: any) => q.eq("ownerId", ownerId))
      .collect();
    const duplicateRuntimeRows = runtimeRows.filter(
      (row: any) =>
        row.status === "running" &&
        duplicateIds.has(String(row.projectId ?? "")),
    );
    for (const row of duplicateRuntimeRows) {
      const lastProgressAt =
        normalizeTimestamp(row.updatedAt) ??
        normalizeTimestamp(row.startedAt) ??
        nowMs;
      const ageMs = Math.max(0, nowMs - lastProgressAt);
      const workspaceSessionState = normalizeText(row.workspaceSessionState);
      const workspaceProviderSandboxPresent = Boolean(
        normalizeText(row.workspaceProviderSandboxId),
      );
      const workspaceSessionStillAttached =
        workspaceProviderSandboxPresent || workspaceSessionState === "active";
      const item = {
        ownerId: inspection.owner.id,
        projectId: String(row.projectId ?? ""),
        threadId: String(row.threadId ?? ""),
        runId: row.runId,
        startedAt: row.startedAt ?? null,
        updatedAt: row.updatedAt ?? null,
        ageMs,
        staleAfterMs,
        visibility: row.visibility ?? null,
        harnessProfile: row.harnessProfile ?? null,
        workspaceSessionState: workspaceSessionState || null,
        workspaceProviderSandboxPresent,
        unsafeReason: workspaceSessionStillAttached
          ? "workspace_session_still_attached"
          : ageMs >= staleAfterMs
            ? null
            : "runtime_recently_updated",
      };
      if (ageMs >= staleAfterMs && !workspaceSessionStillAttached) {
        candidates.push(item);
      } else {
        freshActiveRuns.push(item);
      }
    }
  }

  return {
    ok: nonRuntimeBlockedProjects.length === 0 && freshActiveRuns.length === 0,
    reason:
      nonRuntimeBlockedProjects.length > 0
        ? "duplicate_project_non_runtime_blocked"
        : freshActiveRuns.length > 0
          ? "duplicate_project_fresh_runtime_run"
          : null,
    nowMs,
    staleAfterMs,
    limit,
    owner: inspection.owner,
    projectName: inspection.projectName,
    duplicateNameCount: inspection.duplicateNameCount,
    duplicateCount: inspection.duplicateCount,
    nonRuntimeBlockedProjects,
    freshActiveRunCount: freshActiveRuns.length,
    freshActiveRuns: freshActiveRuns.slice(0, 10),
    staleCandidateCount: candidates.length,
    candidates: candidates.slice(0, limit),
  };
}

export const planStaleDuplicateProjectRuntimeRunsInternal = internalQuery({
  args: {
    ownerId: v.optional(v.string()),
    ownerEmail: v.optional(v.string()),
    ownerAuthSubject: v.optional(v.string()),
    projectName: v.optional(v.string()),
    nowMs: v.optional(v.number()),
    staleAfterMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await buildStaleDuplicateProjectRuntimeRunPlan({
      ctx,
      ownerId: args.ownerId ?? null,
      ownerEmail: args.ownerEmail ?? null,
      ownerAuthSubject: args.ownerAuthSubject ?? null,
      projectName: args.projectName ?? null,
      nowMs: args.nowMs,
      staleAfterMs: args.staleAfterMs,
      limit: args.limit,
    });
  },
});

export const reconcileStaleDuplicateProjectRuntimeRuns: any = action({
  args: {
    ...stagingProjectHygieneArgs,
    dryRun: v.optional(v.boolean()),
    staleAfterMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    assertStagingMaintenanceAllowed({ maintenanceToken: args.maintenanceToken });
    const dryRun = args.dryRun !== false;
    const nowMs = Math.floor(args.nowMs ?? Date.now());
    const plan = (await ctx.runQuery(
      (internal as any).stagingProjectHygiene
        .planStaleDuplicateProjectRuntimeRunsInternal,
      {
        ownerId: args.ownerId ?? undefined,
        ownerEmail: args.ownerEmail ?? undefined,
        ownerAuthSubject: args.ownerAuthSubject ?? undefined,
        projectName: args.projectName ?? undefined,
        nowMs,
        staleAfterMs: args.staleAfterMs,
        limit: args.limit,
      },
    )) as any;
    if (!plan.ok) {
      return {
        ...plan,
        dryRun,
        reconciledCount: 0,
      };
    }
    if (dryRun) {
      return {
        ...plan,
        dryRun,
        reconciledCount: 0,
      };
    }

    const reconciled = [];
    for (const candidate of plan.candidates ?? []) {
      const result = (await ctx.runMutation(
        (internal as any).threads.finishCloudRuntimeRunInternal,
        {
          ownerId: candidate.ownerId,
          threadId: candidate.threadId,
          runId: candidate.runId,
          status: "error",
          reason: "staging_project_hygiene_stale_run_reconciled",
          errorCode: "staging_project_hygiene_stale_run_reconciled",
          errorMessage:
            "Staging project hygiene reconciled a stale running runtime before duplicate project archival.",
          nowMs,
          finishedAt: nowMs,
        },
      )) as any;
      reconciled.push({
        projectId: candidate.projectId,
        threadId: candidate.threadId,
        runId: candidate.runId,
        status: (result as any)?.status ?? null,
        reason: (result as any)?.reason ?? null,
      });
    }
    const after = (await ctx.runQuery(
      (internal as any).stagingProjectHygiene
        .planStaleDuplicateProjectRuntimeRunsInternal,
      {
        ownerId: args.ownerId ?? undefined,
        ownerEmail: args.ownerEmail ?? undefined,
        ownerAuthSubject: args.ownerAuthSubject ?? undefined,
        projectName: args.projectName ?? undefined,
        nowMs,
        staleAfterMs: args.staleAfterMs,
        limit: args.limit,
      },
    )) as any;
    return {
      ...plan,
      dryRun,
      reconciledCount: reconciled.length,
      reconciled,
      after,
    };
  },
});
