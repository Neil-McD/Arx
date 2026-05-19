import { internal } from "./_generated/api";
import {
  internalAction,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { releaseProjectBackgroundSandboxIfIdle } from "./workspaceTerminalBackgroundService";
import { isWorkspaceTerminalActiveStatus } from "./workspaceTerminalProcessCore";
import { DAYTONA_WORKSPACE_IDLE_STOP_SECONDS } from "../shared/workspaceCredits";

const LIFECYCLE_DIAGNOSTIC_SURFACE = "daytona_workspace_lifecycle";
const DAYTONA_WORKSPACE_IDLE_STOP_MS = DAYTONA_WORKSPACE_IDLE_STOP_SECONDS * 1000;

function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeLimit(value: unknown): number {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return 25;
  return Math.min(100, numeric);
}

function normalizeTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isExpiredTimestamp(value: unknown, nowMs: number): boolean {
  const timestamp = normalizeTimestamp(value);
  return timestamp !== null && timestamp > 0 && timestamp <= nowMs;
}

function isActiveStopLease(expiresAt: unknown, nowMs: number): boolean {
  const timestamp = normalizeTimestamp(expiresAt);
  return timestamp !== null && timestamp > nowMs;
}

function deriveProjectSandboxIdleExpiresAt(project: {
  providerSandboxIdleExpiresAt?: unknown;
  providerSandboxLastActivityAt?: unknown;
  providerSandboxLastSeenAt?: unknown;
  providerSandboxStartedAt?: unknown;
}): number | null {
  const explicitExpiresAt = normalizeTimestamp(project.providerSandboxIdleExpiresAt);
  if (explicitExpiresAt !== null && explicitExpiresAt > 0) return explicitExpiresAt;
  const lastActivityAt =
    normalizeTimestamp(project.providerSandboxLastActivityAt) ??
    normalizeTimestamp(project.providerSandboxLastSeenAt) ??
    normalizeTimestamp(project.providerSandboxStartedAt);
  return lastActivityAt !== null && lastActivityAt > 0
    ? lastActivityAt + DAYTONA_WORKSPACE_IDLE_STOP_MS
    : null;
}

type LifecycleDiagnosticStatus =
  | "started"
  | "succeeded"
  | "failed"
  | "blocked"
  | "ignored";

type LifecycleDiagnosticInput = {
  runKey: string;
  eventName: "started" | "candidate" | "completed";
  status: LifecycleDiagnosticStatus;
  severity?: "info" | "warning" | "error";
  projectId?: unknown;
  userId?: unknown;
  candidateIndex?: number;
  metadata?: Record<string, unknown>;
  latencyMs?: number | null;
  errorCode?: string | null;
  createdAt: number;
};

async function recordLifecycleDiagnostic(
  ctx: Pick<ActionCtx, "runMutation">,
  input: LifecycleDiagnosticInput,
): Promise<void> {
  const eventType = `runtime.daytona_workspace_lifecycle.${input.eventName}`;
  const eventKeyParts = [
    LIFECYCLE_DIAGNOSTIC_SURFACE,
    input.runKey,
    input.eventName,
    input.candidateIndex ?? "run",
    input.status,
  ];
  const mutationArgs: Record<string, unknown> = {
    eventKey: eventKeyParts.join(":"),
    eventType,
    subsystem: "runtime",
    status: input.status,
    surface: LIFECYCLE_DIAGNOSTIC_SURFACE,
    createdAt: input.createdAt,
  };
  if (input.severity) mutationArgs.severity = input.severity;
  if (input.userId) mutationArgs.userId = input.userId;
  if (input.projectId) mutationArgs.projectId = input.projectId;
  if (input.latencyMs != null) mutationArgs.latencyMs = input.latencyMs;
  if (input.errorCode) mutationArgs.errorCode = input.errorCode;
  if (input.metadata) mutationArgs.metadata = input.metadata;
  try {
    await ctx.runMutation(
      (internal as any).platformDiagnostics.recordPlatformDiagnosticEventInternal,
      mutationArgs,
    );
  } catch (error) {
    console.error("daytona_workspace_lifecycle_diagnostic_failed", {
      eventType,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function lifecycleCandidateStatusForReason(reason: string): LifecycleDiagnosticStatus {
  if (
    reason === "active_runtime_run" ||
    reason === "active_terminal" ||
    reason === "stop_in_progress" ||
    reason === "release_retained_sandbox"
  ) {
    return "blocked";
  }
  return "ignored";
}

export const reconcileIdleProjectSandboxesInternal = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const runKey = String(nowMs);
    const limit = normalizeLimit(args.limit);
    const candidates = (await ctx.runQuery(
      (internal as any).workspaceTerminals.listIdleProjectBackgroundSandboxesInternal,
      {
        nowMs,
        limit,
      },
    )) as Array<{
      projectId?: unknown;
      ownerId?: unknown;
      providerSandboxId?: unknown;
      providerSandboxState?: unknown;
      providerSandboxIdleExpiresAt?: unknown;
      providerSandboxStopLeaseExpiresAt?: unknown;
    }>;

    let scanned = 0;
    let released = 0;
    let skipped = 0;
    let activeRuns = 0;
    let failed = 0;

    if (candidates.length > 0) {
      await recordLifecycleDiagnostic(ctx, {
        runKey,
        eventName: "started",
        status: "started",
        createdAt: nowMs,
        metadata: {
          limit,
          candidateCount: candidates.length,
        },
      });
    }

    for (const candidate of candidates) {
      scanned += 1;
      const candidateIndex = scanned;
      const projectId = candidate.projectId;
      const ownerId = candidate.ownerId;
      const providerSandboxId = normalizeString(candidate.providerSandboxId);
      const candidateMetadata = {
        candidateIndex,
        sandboxState:
          normalizeOptionalString(candidate.providerSandboxState) ?? "unknown",
        idleExpired: isExpiredTimestamp(
          candidate.providerSandboxIdleExpiresAt,
          nowMs,
        ),
        stopLeaseActive: isActiveStopLease(
          candidate.providerSandboxStopLeaseExpiresAt,
          nowMs,
        ),
        providerSandboxPresent: Boolean(providerSandboxId),
      };
      if (!projectId || !ownerId || !providerSandboxId) {
        skipped += 1;
        await recordLifecycleDiagnostic(ctx, {
          runKey,
          eventName: "candidate",
          candidateIndex,
          status: "ignored",
          createdAt: Date.now(),
          metadata: {
            ...candidateMetadata,
            reason: "invalid_candidate",
            leaseAcquired: false,
          },
        });
        continue;
      }

      let leaseAcquired = false;
      try {
        const stopLease = (await ctx.runMutation(
          (internal as any).workspaceTerminals
            .acquireProjectBackgroundSandboxStopLeaseInternal,
          {
            projectId,
            ownerId,
            providerSandboxId,
            nowMs,
          },
        )) as { acquired?: unknown; reason?: unknown } | null;
        if (stopLease?.acquired !== true) {
          const reason =
            normalizeOptionalString(stopLease?.reason) ?? "lease_not_acquired";
          if (reason === "active_runtime_run") {
            activeRuns += 1;
          }
          skipped += 1;
          await recordLifecycleDiagnostic(ctx, {
            runKey,
            eventName: "candidate",
            candidateIndex,
            status: lifecycleCandidateStatusForReason(reason),
            projectId,
            userId: ownerId,
            createdAt: Date.now(),
            metadata: {
              ...candidateMetadata,
              reason,
              leaseAcquired: false,
            },
          });
          continue;
        }
        leaseAcquired = true;

        await releaseProjectBackgroundSandboxIfIdle({
          ctx,
          ownerId,
          projectId: projectId as string,
          providerSandboxId,
        });
        const project = (await ctx.runQuery(
          (internal as any).projects.getCloudProjectByIdInternal,
          {
            projectId,
          },
        )) as { providerSandboxId?: unknown } | null;
        if (normalizeString(project?.providerSandboxId) === providerSandboxId) {
          skipped += 1;
          await recordLifecycleDiagnostic(ctx, {
            runKey,
            eventName: "candidate",
            candidateIndex,
            status: "blocked",
            projectId,
            userId: ownerId,
            createdAt: Date.now(),
            metadata: {
              ...candidateMetadata,
              reason: "release_retained_sandbox",
              leaseAcquired,
            },
          });
        } else {
          released += 1;
          await recordLifecycleDiagnostic(ctx, {
            runKey,
            eventName: "candidate",
            candidateIndex,
            status: "succeeded",
            projectId,
            userId: ownerId,
            createdAt: Date.now(),
            metadata: {
              ...candidateMetadata,
              reason: "released",
              leaseAcquired,
            },
          });
        }
      } catch {
        failed += 1;
        await recordLifecycleDiagnostic(ctx, {
          runKey,
          eventName: "candidate",
          candidateIndex,
          status: "failed",
          severity: "error",
          projectId,
          userId: ownerId,
          errorCode: "daytona_workspace_lifecycle_candidate_failed",
          createdAt: Date.now(),
          metadata: {
            ...candidateMetadata,
            reason: "exception",
            leaseAcquired,
          },
        });
      }
    }

    if (candidates.length > 0) {
      await recordLifecycleDiagnostic(ctx, {
        runKey,
        eventName: "completed",
        status: failed > 0 ? "failed" : "succeeded",
        severity: failed > 0 ? "warning" : "info",
        latencyMs: Date.now() - nowMs,
        createdAt: Date.now(),
        metadata: {
          limit,
          candidateCount: candidates.length,
          scanned,
          released,
          skipped,
          activeRuns,
          failed,
        },
      });
    }

    return {
      ok: failed === 0,
      scanned,
      released,
      skipped,
      activeRuns,
      failed,
      nowMs,
    };
  },
});

export async function inspectProjectBackgroundSandboxLifecycle(
  ctx: { db: any },
  args: {
    projectId: any;
    ownerId?: any;
    nowMs?: number;
  },
) {
  const nowMs = args.nowMs ?? Date.now();
  const project = await ctx.db.get(args.projectId);
  if (!project || (args.ownerId && project.ownerId !== args.ownerId)) {
    return {
      ok: false,
      reason: "project_not_found",
      nowMs,
    };
  }

  const providerSandboxId = normalizeOptionalString(project.providerSandboxId);
  let activeTerminalCount = 0;
  let activeRuntimeRunCount = 0;
  if (providerSandboxId) {
    const terminalRows = await ctx.db
      .query("workspaceTerminalSessions")
      .withIndex("by_providerSandboxId", (q: any) =>
        q.eq("providerSandboxId", providerSandboxId),
      )
      .collect();
    activeTerminalCount = terminalRows.filter((row: any) =>
      isWorkspaceTerminalActiveStatus(row.status),
    ).length;

    const runtimeRows = await ctx.db
      .query("runtimeRuns")
      .withIndex("by_workspaceSessionState_providerSandboxId_status", (q: any) =>
        q
          .eq("workspaceSessionState", "active")
          .eq("workspaceProviderSandboxId", providerSandboxId)
          .eq("status", "running"),
      )
      .collect();
    activeRuntimeRunCount = runtimeRows.length;
  }

  const providerSandboxLastSeenAt = normalizeTimestamp(
    project.providerSandboxLastSeenAt,
  );
  const providerSandboxLastActivityAt = normalizeTimestamp(
    project.providerSandboxLastActivityAt,
  );
    const providerSandboxIdleExpiresAt = normalizeTimestamp(
      project.providerSandboxIdleExpiresAt,
    );
    const providerSandboxEffectiveIdleExpiresAt =
      deriveProjectSandboxIdleExpiresAt(project);
  const providerSandboxStopLeaseExpiresAt = normalizeTimestamp(
    project.providerSandboxStopLeaseExpiresAt,
  );
  const providerSandboxCreditBudgetExpiresAt = normalizeTimestamp(
    project.providerSandboxCreditBudgetExpiresAt,
  );
    const idleExpired = isExpiredTimestamp(
      providerSandboxEffectiveIdleExpiresAt,
      nowMs,
    );
  const stopLeaseActive = isActiveStopLease(
    providerSandboxStopLeaseExpiresAt,
    nowMs,
  );
  const creditBudgetExpired = isExpiredTimestamp(
    providerSandboxCreditBudgetExpiresAt,
    nowMs,
  );

  return {
    ok: true,
    nowMs,
    projectId: project._id,
    ownerId: project.ownerId,
    providerSandboxPresent: Boolean(providerSandboxId),
    providerSandboxState: normalizeOptionalString(project.providerSandboxState),
    providerSandboxLastSeenAt,
    providerSandboxLastActivityAt,
    providerSandboxIdleExpiresAt,
    providerSandboxEffectiveIdleExpiresAt,
    providerSandboxStopLeaseExpiresAt,
    providerSandboxStartedAt: normalizeTimestamp(project.providerSandboxStartedAt),
    providerSandboxCreditBudgetExpiresAt,
    idleExpired,
    stopLeaseActive,
    creditBudgetExpired,
    activeTerminalCount,
    activeRuntimeRunCount,
    blockingActivityPresent: activeTerminalCount > 0 || activeRuntimeRunCount > 0,
    shouldReconcile:
      Boolean(providerSandboxId) && idleExpired && !stopLeaseActive,
  };
}

export const inspectProjectBackgroundSandboxLifecycleInternal = internalQuery({
  args: {
    projectId: v.id("cloudProjects"),
    ownerId: v.optional(v.id("users")),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await inspectProjectBackgroundSandboxLifecycle(ctx, args);
  },
});
