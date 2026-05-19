import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { inspectProjectBackgroundSandboxLifecycle } from "./daytonaWorkspaceLifecycle";
import {
  assertStagingMaintenanceAllowed,
  ensureExpectedProject,
  findOwnerUser,
  normalizeLimit,
  normalizeText,
} from "./stagingMaintenance";
import { ensureProjectBackgroundSandbox } from "./workspaceTerminalBackgroundService";
import { isWorkspaceTerminalActiveStatus } from "./workspaceTerminalProcessCore";
import { DAYTONA_WORKSPACE_IDLE_STOP_SECONDS } from "../shared/workspaceCredits";

const DEFAULT_PROJECT_NAME = "General";
const STAGING_LIFECYCLE_CANARY_PROJECT_NAME = "Lifecycle Canary";

function normalizeOptionalNumber(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function requireLifecycleCanaryProjectName(projectName: string): void {
  if (projectName !== STAGING_LIFECYCLE_CANARY_PROJECT_NAME) {
    throw new Error("staging_lifecycle_canary_project_required");
  }
}

function objectMetadata(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

function summarizeLifecycleReleaseDiagnostics(args: {
  candidateEvents: any[];
  completedEvents: any[];
  projectId: unknown;
  sinceMs: number;
}) {
  const projectId = String(args.projectId);
  const candidates = args.candidateEvents.filter((row) => {
    const createdAt = normalizeOptionalNumber(row?.createdAt) ?? 0;
    return createdAt >= args.sinceMs && String(row?.projectId ?? "") === projectId;
  });
  const releasedCandidates = candidates.filter((row) => {
    const metadata = objectMetadata(row?.metadata);
    return row?.status === "succeeded" && metadata.reason === "released";
  });
  const blockedCandidates = candidates.filter((row) => row?.status === "blocked");
  const failedCandidates = candidates.filter((row) => row?.status === "failed");
  const completions = args.completedEvents.filter((row) => {
    const createdAt = normalizeOptionalNumber(row?.createdAt) ?? 0;
    return createdAt >= args.sinceMs;
  });
  const completedReleased = completions.reduce((sum, row) => {
    const metadata = objectMetadata(row?.metadata);
    const released = Math.floor(Number(metadata.released ?? 0));
    return sum + (Number.isFinite(released) && released > 0 ? released : 0);
  }, 0);
  return {
    candidateCount: candidates.length,
    releasedCandidateCount: releasedCandidates.length,
    blockedCandidateCount: blockedCandidates.length,
    failedCandidateCount: failedCandidates.length,
    completionCount: completions.length,
    completedReleased,
  };
}

export const getDaytonaWorkspaceLifecycleInspection = query({
  args: {
    maintenanceToken: v.string(),
    ownerId: v.optional(v.string()),
    ownerEmail: v.optional(v.string()),
    ownerAuthSubject: v.optional(v.string()),
    projectId: v.optional(v.id("cloudProjects")),
    projectName: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertStagingMaintenanceAllowed({ maintenanceToken: args.maintenanceToken });
    const owner = await findOwnerUser({
      ctx,
      ownerId: args.ownerId ?? null,
      ownerEmail: args.ownerEmail ?? null,
      ownerAuthSubject: args.ownerAuthSubject ?? null,
    });
    const projectName = normalizeText(args.projectName) || DEFAULT_PROJECT_NAME;
    let project = args.projectId ? await ctx.db.get(args.projectId) : null;
    if (!project) {
      const projects = await ctx.db
        .query("cloudProjects")
        .withIndex("by_owner", (q: any) => q.eq("ownerId", owner._id))
        .collect();
      project =
        projects
          .filter((row: any) => normalizeText(row.name) === projectName)
          .sort((a: any, b: any) => (a.createdAt ?? 0) - (b.createdAt ?? 0))[0] ?? null;
    }
    if (!project || String(project.ownerId) !== String(owner._id)) {
      return {
        ok: false,
        reason: "project_not_found",
        nowMs: args.nowMs ?? Date.now(),
        owner: {
          id: String(owner._id),
          email: owner.email ?? null,
        },
        project: {
          expectedName: projectName,
          id: args.projectId ? String(args.projectId) : null,
        },
      };
    }

    const inspection = await inspectProjectBackgroundSandboxLifecycle(ctx, {
      projectId: project._id,
      ownerId: owner._id,
      nowMs: args.nowMs,
    });
    return {
      ...inspection,
      owner: {
        id: String(owner._id),
        email: owner.email ?? null,
      },
      project: {
        expectedName: projectName,
        id: String(project._id),
        name: project.name ?? null,
      },
    };
  },
});

export const prepareDaytonaWorkspaceLifecycleReleaseCanaryInternal = internalMutation({
  args: {
    ownerId: v.optional(v.string()),
    ownerEmail: v.optional(v.string()),
    ownerAuthSubject: v.optional(v.string()),
    projectName: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = Math.floor(args.nowMs ?? Date.now());
    const projectName =
      normalizeText(args.projectName) || STAGING_LIFECYCLE_CANARY_PROJECT_NAME;
    requireLifecycleCanaryProjectName(projectName);
    const owner = await findOwnerUser({
      ctx,
      ownerId: args.ownerId ?? null,
      ownerEmail: args.ownerEmail ?? null,
      ownerAuthSubject: args.ownerAuthSubject ?? null,
    });
    const project = await ensureExpectedProject({
      ctx,
      ownerId: owner._id,
      projectName,
      dryRun: false,
      nowMs,
    });
    if (!project.row) throw new Error("staging_lifecycle_canary_project_missing");
    const providerSandboxId = normalizeText(project.row.providerSandboxId);
    return {
      ok: true,
      owner: {
        id: owner._id,
        email: owner.email ?? null,
        authSubject: normalizeText(owner.authSubject) || null,
      },
      project: {
        id: project.row._id,
        name: project.row.name ?? null,
        existingCount: project.existingCount,
        providerSandboxPresent: Boolean(providerSandboxId),
        providerSandboxId: providerSandboxId || null,
      },
      action: project.action,
    };
  },
});

export const forceDaytonaWorkspaceLifecycleCanaryIdleInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    projectId: v.id("cloudProjects"),
    providerSandboxId: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || String(project.ownerId) !== String(args.ownerId)) {
      return { ok: false, reason: "project_not_found" };
    }
    if (normalizeText(project.name) !== STAGING_LIFECYCLE_CANARY_PROJECT_NAME) {
      return { ok: false, reason: "project_not_lifecycle_canary" };
    }
    const providerSandboxId = normalizeText(project.providerSandboxId);
    if (!providerSandboxId || providerSandboxId !== args.providerSandboxId) {
      return { ok: false, reason: "sandbox_changed" };
    }
    const sandboxState = normalizeText(project.providerSandboxState) || "started";
    if (!["started", "stopping", "error"].includes(sandboxState)) {
      return { ok: false, reason: "sandbox_not_releasable", sandboxState };
    }
    const activeTerminalRows = await ctx.db
      .query("workspaceTerminalSessions")
      .withIndex("by_providerSandboxId", (q: any) =>
        q.eq("providerSandboxId", providerSandboxId),
      )
      .collect();
    if (activeTerminalRows.some((row: any) => isWorkspaceTerminalActiveStatus(row.status))) {
      return { ok: false, reason: "active_terminal" };
    }
    const activeRuntimeRows = await ctx.db
      .query("runtimeRuns")
      .withIndex("by_workspaceSessionState_providerSandboxId_status", (q: any) =>
        q
          .eq("workspaceSessionState", "active")
          .eq("workspaceProviderSandboxId", providerSandboxId)
          .eq("status", "running"),
      )
      .take(1);
    if (activeRuntimeRows.length > 0) {
      return { ok: false, reason: "active_runtime_run" };
    }

    const nowMs = Math.floor(args.nowMs);
    const idleExpiresAt = Math.max(1, nowMs - 1_000);
    const lastActivityAt = Math.max(
      1,
      idleExpiresAt - DAYTONA_WORKSPACE_IDLE_STOP_SECONDS * 1000,
    );
    await ctx.db.patch(args.projectId, {
      providerSandboxState: sandboxState,
      providerSandboxLastActivityAt: lastActivityAt,
      providerSandboxIdleExpiresAt: idleExpiresAt,
      providerSandboxStopLeaseExpiresAt: undefined,
      updatedAt: nowMs,
    });
    return {
      ok: true,
      projectId: args.projectId,
      ownerId: args.ownerId,
      sandboxState,
      idleExpiresAt,
    };
  },
});

export const getDaytonaWorkspaceLifecycleCanaryChargeEvidenceInternal = internalQuery({
  args: {
    ownerId: v.id("users"),
    projectId: v.id("cloudProjects"),
    providerSandboxId: v.string(),
    sinceMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("workspaceComputeCharges")
      .withIndex("by_providerSandboxId", (q: any) =>
        q.eq("providerSandboxId", args.providerSandboxId),
      )
      .collect();
    const sinceMs = normalizeOptionalNumber(args.sinceMs) ?? 0;
    const matching = rows.filter((row: any) => {
      const createdAt = normalizeOptionalNumber(row.createdAt) ?? 0;
      return (
        String(row.userId) === String(args.ownerId) &&
        String(row.projectId) === String(args.projectId) &&
        createdAt >= sinceMs
      );
    });
    return {
      ok: true,
      chargeCount: matching.length,
      totalDurationSeconds: matching.reduce(
        (sum: number, row: any) => sum + Number(row.durationSeconds ?? 0),
        0,
      ),
      totalCreditsDebited: matching.reduce(
        (sum: number, row: any) => sum + Number(row.creditsDebited ?? 0),
        0,
      ),
      rows: matching.slice(0, 5).map((row: any) => ({
        chargeKey: row.chargeKey,
        runId: row.runId,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        durationSeconds: row.durationSeconds,
        creditsDebited: row.creditsDebited,
        debitSource: row.debitSource,
        createdAt: row.createdAt,
      })),
    };
  },
});

export const runDaytonaWorkspaceLifecycleReleaseCanary: any = action({
  args: {
    maintenanceToken: v.string(),
    ownerId: v.optional(v.string()),
    ownerEmail: v.optional(v.string()),
    ownerAuthSubject: v.optional(v.string()),
    projectName: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    assertStagingMaintenanceAllowed({ maintenanceToken: args.maintenanceToken });
    const canaryStartedAt = Date.now();
    const projectName =
      normalizeText(args.projectName) || STAGING_LIFECYCLE_CANARY_PROJECT_NAME;
    requireLifecycleCanaryProjectName(projectName);
    const limit = normalizeLimit(args.limit, 25, 100);

    const prepared = (await ctx.runMutation(
      (internal as any).stagingDaytonaWorkspaceLifecycleCanary
        .prepareDaytonaWorkspaceLifecycleReleaseCanaryInternal,
      {
        ownerId: args.ownerId ?? undefined,
        ownerEmail: args.ownerEmail ?? undefined,
        ownerAuthSubject: args.ownerAuthSubject ?? undefined,
        projectName,
        nowMs: canaryStartedAt,
      },
    )) as any;
    const ownerId = prepared.owner.id;
    const projectId = prepared.project.id;

    const inspect = async (): Promise<any> =>
      (await ctx.runQuery(
        (internal as any).daytonaWorkspaceLifecycle
          .inspectProjectBackgroundSandboxLifecycleInternal,
        {
          projectId,
          ownerId,
          nowMs: Date.now(),
        },
      )) as any;

    const preflight: any = await inspect();
    let preflightCleanup: any = null;
    if (preflight.providerSandboxPresent) {
      if (preflight.blockingActivityPresent) {
        return {
          ok: false,
          reason: "existing_canary_sandbox_active",
          project: {
            id: String(projectId),
            name: prepared.project.name ?? null,
          },
          preflight,
        };
      }
      const existingSandboxId = normalizeText(prepared.project.providerSandboxId);
      if (!existingSandboxId) {
        return {
          ok: false,
          reason: "existing_canary_sandbox_id_missing",
          project: {
            id: String(projectId),
            name: prepared.project.name ?? null,
          },
          preflight,
        };
      }
      const forcedExisting = await ctx.runMutation(
        (internal as any).stagingDaytonaWorkspaceLifecycleCanary
          .forceDaytonaWorkspaceLifecycleCanaryIdleInternal,
        {
          ownerId,
          projectId,
          providerSandboxId: existingSandboxId,
          nowMs: Date.now(),
        },
      );
      const reconciledExisting = await ctx.runAction(
        (internal as any).daytonaWorkspaceLifecycle
          .reconcileIdleProjectSandboxesInternal,
        { limit },
      );
      const afterExisting = await inspect();
      preflightCleanup = {
        forced: forcedExisting,
        reconcile: reconciledExisting,
        providerSandboxPresentAfter: afterExisting.providerSandboxPresent,
      };
      if (afterExisting.providerSandboxPresent) {
        return {
          ok: false,
          reason: "existing_canary_sandbox_cleanup_failed",
          project: {
            id: String(projectId),
            name: prepared.project.name ?? null,
          },
          preflight,
          preflightCleanup,
        };
      }
    }

    const ensureStarted = await ensureProjectBackgroundSandbox({
      ctx,
      authSubject: prepared.owner.authSubject ?? null,
      userId: ownerId,
      projectId,
    });
    if (!ensureStarted.ok) {
      return {
        ok: false,
        reason: "canary_sandbox_start_failed",
        project: {
          id: String(projectId),
          name: prepared.project.name ?? null,
        },
        start: {
          ok: false,
          code: ensureStarted.code,
          status: ensureStarted.status,
          message: ensureStarted.message,
        },
        preflightCleanup,
      };
    }

    const startedInspection = await inspect();
    if (
      !startedInspection.providerSandboxPresent ||
      startedInspection.blockingActivityPresent
    ) {
      return {
        ok: false,
        reason: "canary_sandbox_start_inspection_failed",
        project: {
          id: String(projectId),
          name: prepared.project.name ?? null,
        },
        start: {
          ok: true,
          startedAt: ensureStarted.startedAt,
          sandboxCpu: ensureStarted.sandboxCpu,
          sandboxMemoryGiB: ensureStarted.sandboxMemoryGiB,
          sandboxDiskGiB: ensureStarted.sandboxDiskGiB,
        },
        startedInspection,
        preflightCleanup,
      };
    }

    const forced: any = await ctx.runMutation(
      (internal as any).stagingDaytonaWorkspaceLifecycleCanary
        .forceDaytonaWorkspaceLifecycleCanaryIdleInternal,
      {
        ownerId,
        projectId,
        providerSandboxId: ensureStarted.providerSandboxId,
        nowMs: Date.now(),
      },
    );
    if ((forced as any)?.ok !== true) {
      return {
        ok: false,
        reason: "canary_force_idle_failed",
        project: {
          id: String(projectId),
          name: prepared.project.name ?? null,
        },
        forced,
        startedInspection,
        preflightCleanup,
      };
    }

    const forcedInspection = await inspect();
    const reconcile = (await ctx.runAction(
      (internal as any).daytonaWorkspaceLifecycle
        .reconcileIdleProjectSandboxesInternal,
      { limit },
    )) as any;
    const after = await inspect();
    const [candidateEvents, completedEvents, chargeEvidence]: [any[], any[], any] = await Promise.all([
      ctx.runQuery(
        (internal as any).platformDiagnostics.listPlatformDiagnosticEventsInternal,
        {
          eventType: "runtime.daytona_workspace_lifecycle.candidate",
          limit: 100,
        },
      ),
      ctx.runQuery(
        (internal as any).platformDiagnostics.listPlatformDiagnosticEventsInternal,
        {
          eventType: "runtime.daytona_workspace_lifecycle.completed",
          limit: 25,
        },
      ),
      ctx.runQuery(
        (internal as any).stagingDaytonaWorkspaceLifecycleCanary
          .getDaytonaWorkspaceLifecycleCanaryChargeEvidenceInternal,
        {
          ownerId,
          projectId,
          providerSandboxId: ensureStarted.providerSandboxId,
          sinceMs: canaryStartedAt,
        },
      ),
    ]);
    const diagnostics = summarizeLifecycleReleaseDiagnostics({
      candidateEvents: candidateEvents as any[],
      completedEvents: completedEvents as any[],
      projectId,
      sinceMs: canaryStartedAt,
    });
    const ok: boolean =
      forcedInspection.providerSandboxPresent === true &&
      forcedInspection.idleExpired === true &&
      after.providerSandboxPresent === false &&
      Number(reconcile.released ?? 0) >= 1 &&
      diagnostics.releasedCandidateCount >= 1 &&
      diagnostics.completedReleased >= 1 &&
      Number((chargeEvidence as any)?.chargeCount ?? 0) >= 1;

    return {
      ok,
      reason: ok ? null : "canary_release_assertion_failed",
      project: {
        id: String(projectId),
        name: prepared.project.name ?? null,
        existingCount: prepared.project.existingCount,
      },
      preflightCleanup,
      start: {
        ok: true,
        providerSandboxPresent: startedInspection.providerSandboxPresent,
        providerSandboxState: startedInspection.providerSandboxState,
        providerSandboxIdleExpiresAt: startedInspection.providerSandboxIdleExpiresAt,
        providerSandboxEffectiveIdleExpiresAt:
          startedInspection.providerSandboxEffectiveIdleExpiresAt,
        startedAt: ensureStarted.startedAt,
        sandboxCpu: ensureStarted.sandboxCpu,
        sandboxMemoryGiB: ensureStarted.sandboxMemoryGiB,
        sandboxDiskGiB: ensureStarted.sandboxDiskGiB,
        creditBudgetExpiresAt: ensureStarted.creditBudgetExpiresAt,
      },
      forced: {
        ok: true,
        idleExpired: forcedInspection.idleExpired,
        providerSandboxPresent: forcedInspection.providerSandboxPresent,
        providerSandboxIdleExpiresAt: forcedInspection.providerSandboxIdleExpiresAt,
        providerSandboxEffectiveIdleExpiresAt:
          forcedInspection.providerSandboxEffectiveIdleExpiresAt,
        stopLeaseActive: forcedInspection.stopLeaseActive,
        blockingActivityPresent: forcedInspection.blockingActivityPresent,
      },
      reconcile,
      after: {
        providerSandboxPresent: after.providerSandboxPresent,
        providerSandboxState: after.providerSandboxState,
        activeTerminalCount: after.activeTerminalCount,
        activeRuntimeRunCount: after.activeRuntimeRunCount,
        shouldReconcile: after.shouldReconcile,
      },
      diagnostics,
      chargeEvidence: {
        ok: (chargeEvidence as any)?.ok === true,
        chargeCount: Number((chargeEvidence as any)?.chargeCount ?? 0),
        totalDurationSeconds: Number(
          (chargeEvidence as any)?.totalDurationSeconds ?? 0,
        ),
        totalCreditsDebited: Number(
          (chargeEvidence as any)?.totalCreditsDebited ?? 0,
        ),
      },
    };
  },
});
