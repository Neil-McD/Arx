import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  POLYNET_CODEX_WORKER_ACTIVE_RUN_WINDOW_MS,
  POLYNET_CODEX_WORKER_DEPLOYMENT_CONCURRENT_RUN_LIMIT,
  POLYNET_CODEX_WORKER_PROJECT_CONCURRENT_RUN_LIMIT,
  POLYNET_CODEX_WORKER_USER_CONCURRENT_RUN_LIMIT,
} from "../shared/polynetCodexWorkerLimits";

type LeaseRow = {
  _id: unknown;
  status?: unknown;
  expiresAt?: unknown;
};

async function expireStaleLeases(ctx: any, nowMs: number): Promise<number> {
  const staleRows = (await (ctx.db.query as any)(
    "polynetCodexWorkerCapacityLeases",
  )
    .withIndex("by_status_expiresAt", (q: any) =>
      q.eq("status", "active").lt("expiresAt", nowMs),
    )
    .take(50)) as LeaseRow[];
  for (const row of staleRows) {
    await ctx.db.patch(row._id as any, {
      status: "expired",
      releaseReason: "lease_expired",
      updatedAt: nowMs,
    });
  }
  return staleRows.length;
}

async function activeLeaseCountByIndex(
  ctx: any,
  indexName: string,
  buildQuery: (q: any) => any,
): Promise<number> {
  const rows = (await (ctx.db.query as any)(
    "polynetCodexWorkerCapacityLeases",
  )
    .withIndex(indexName, buildQuery)
    .collect()) as LeaseRow[];
  return rows.length;
}

export const tryAcquirePolynetCodexWorkerLease = internalMutation({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    runId: v.string(),
    projectId: v.optional(v.id("cloudProjects")),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs =
      typeof args.nowMs === "number" && Number.isFinite(args.nowMs)
        ? args.nowMs
        : Date.now();
    const expiresAt = nowMs + POLYNET_CODEX_WORKER_ACTIVE_RUN_WINDOW_MS;

    await expireStaleLeases(ctx, nowMs);

    const existing = (await (ctx.db.query as any)(
      "polynetCodexWorkerCapacityLeases",
    )
      .withIndex("by_owner_runId", (q: any) =>
        q.eq("ownerId", args.ownerId).eq("runId", args.runId),
      )
      .unique()) as LeaseRow | null;
    if (existing) {
      const existingStatus = String(existing.status ?? "");
      const existingExpiresAt = Number(existing.expiresAt ?? 0);
      if (existingStatus === "active" && existingExpiresAt > nowMs) {
        return {
          ok: true,
          alreadyAcquired: true,
          leaseId: String(existing._id),
          expiresAt: existingExpiresAt,
          limits: {
            deployment: POLYNET_CODEX_WORKER_DEPLOYMENT_CONCURRENT_RUN_LIMIT,
            user: POLYNET_CODEX_WORKER_USER_CONCURRENT_RUN_LIMIT,
            project: POLYNET_CODEX_WORKER_PROJECT_CONCURRENT_RUN_LIMIT,
          },
        };
      }
      return {
        ok: false,
        status: 409,
        code: "codex_runtime_lease_reused",
        message: "This Codex runtime turn already has a completed capacity lease.",
      };
    }

    const deploymentActive = await activeLeaseCountByIndex(
      ctx,
      "by_status_expiresAt",
      (q) => q.eq("status", "active").gte("expiresAt", nowMs),
    );
    if (deploymentActive >= POLYNET_CODEX_WORKER_DEPLOYMENT_CONCURRENT_RUN_LIMIT) {
      return {
        ok: false,
        status: 429,
        code: "codex_runtime_capacity_full",
        message:
          "Codex runtime is at capacity. Wait for an active run to finish and try again.",
        counts: { deploymentActive },
        limits: {
          deployment: POLYNET_CODEX_WORKER_DEPLOYMENT_CONCURRENT_RUN_LIMIT,
          user: POLYNET_CODEX_WORKER_USER_CONCURRENT_RUN_LIMIT,
          project: POLYNET_CODEX_WORKER_PROJECT_CONCURRENT_RUN_LIMIT,
        },
      };
    }

    const userActive = await activeLeaseCountByIndex(
      ctx,
      "by_owner_status_expiresAt",
      (q) =>
        q.eq("ownerId", args.ownerId).eq("status", "active").gte("expiresAt", nowMs),
    );
    if (userActive >= POLYNET_CODEX_WORKER_USER_CONCURRENT_RUN_LIMIT) {
      return {
        ok: false,
        status: 429,
        code: "user_run_limit_reached",
        message: `You already have ${POLYNET_CODEX_WORKER_USER_CONCURRENT_RUN_LIMIT} Codex runs in flight across your workspaces. Wait for one to finish or stop one.`,
        counts: { deploymentActive, userActive },
        limits: {
          deployment: POLYNET_CODEX_WORKER_DEPLOYMENT_CONCURRENT_RUN_LIMIT,
          user: POLYNET_CODEX_WORKER_USER_CONCURRENT_RUN_LIMIT,
          project: POLYNET_CODEX_WORKER_PROJECT_CONCURRENT_RUN_LIMIT,
        },
      };
    }

    let projectActive = 0;
    if (args.projectId) {
      projectActive = await activeLeaseCountByIndex(
        ctx,
        "by_project_status_expiresAt",
        (q) =>
          q
            .eq("projectId", args.projectId)
            .eq("status", "active")
            .gte("expiresAt", nowMs),
      );
      if (projectActive >= POLYNET_CODEX_WORKER_PROJECT_CONCURRENT_RUN_LIMIT) {
        return {
          ok: false,
          status: 429,
          code: "project_run_limit_reached",
          message: `This workspace already has ${POLYNET_CODEX_WORKER_PROJECT_CONCURRENT_RUN_LIMIT} Codex runs in flight. Wait for one to finish or stop one.`,
          counts: { deploymentActive, userActive, projectActive },
          limits: {
            deployment: POLYNET_CODEX_WORKER_DEPLOYMENT_CONCURRENT_RUN_LIMIT,
            user: POLYNET_CODEX_WORKER_USER_CONCURRENT_RUN_LIMIT,
            project: POLYNET_CODEX_WORKER_PROJECT_CONCURRENT_RUN_LIMIT,
          },
        };
      }
    }

    const leaseId = await (ctx.db.insert as any)(
      "polynetCodexWorkerCapacityLeases",
      {
        runId: args.runId,
        ownerId: args.ownerId,
        threadId: args.threadId,
        ...(args.projectId ? { projectId: args.projectId } : {}),
        status: "active",
        acquiredAt: nowMs,
        expiresAt,
        createdAt: nowMs,
        updatedAt: nowMs,
      },
    );
    return {
      ok: true,
      alreadyAcquired: false,
      leaseId: String(leaseId),
      expiresAt,
      counts: { deploymentActive, userActive, projectActive },
      limits: {
        deployment: POLYNET_CODEX_WORKER_DEPLOYMENT_CONCURRENT_RUN_LIMIT,
        user: POLYNET_CODEX_WORKER_USER_CONCURRENT_RUN_LIMIT,
        project: POLYNET_CODEX_WORKER_PROJECT_CONCURRENT_RUN_LIMIT,
      },
    };
  },
});

export const releasePolynetCodexWorkerLease = internalMutation({
  args: {
    ownerId: v.id("users"),
    runId: v.string(),
    reason: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs =
      typeof args.nowMs === "number" && Number.isFinite(args.nowMs)
        ? args.nowMs
        : Date.now();
    const existing = (await (ctx.db.query as any)(
      "polynetCodexWorkerCapacityLeases",
    )
      .withIndex("by_owner_runId", (q: any) =>
        q.eq("ownerId", args.ownerId).eq("runId", args.runId),
      )
      .unique()) as LeaseRow | null;
    if (!existing) {
      return { ok: true, released: false, reason: "lease_missing" };
    }
    if (String(existing.status ?? "") !== "active") {
      return {
        ok: true,
        released: false,
        reason: `lease_${String(existing.status ?? "unknown")}`,
      };
    }
    await ctx.db.patch(existing._id as any, {
      status: "released",
      releasedAt: nowMs,
      releaseReason: args.reason,
      updatedAt: nowMs,
    });
    return { ok: true, released: true, reason: args.reason };
  },
});

// Counts the caller's active worker runs (including the run being admitted,
// which has already been started by the time admission runs). Windowed on
// startedAt so zombie runs cannot hold concurrency slots.
export const countActivePolynetCodexWorkerRuns = internalQuery({
  args: {
    ownerId: v.id("users"),
    projectId: v.optional(v.id("cloudProjects")),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs =
      typeof args.nowMs === "number" && Number.isFinite(args.nowMs)
        ? args.nowMs
        : Date.now();
    const windowStart = nowMs - POLYNET_CODEX_WORKER_ACTIVE_RUN_WINDOW_MS;
    const rows = await ctx.db
      .query("runtimeRuns")
      .withIndex("by_owner_startedAt", (q: any) =>
        q.eq("ownerId", args.ownerId).gte("startedAt", windowStart),
      )
      .collect();
    let userActive = 0;
    let projectActive = 0;
    for (const row of rows as Array<{
      status?: unknown;
      engineId?: unknown;
      projectId?: unknown;
    }>) {
      if (String(row.status ?? "") !== "running") continue;
      if (String(row.engineId ?? "") !== "polynet_codex_worker") continue;
      userActive += 1;
      if (args.projectId && String(row.projectId ?? "") === String(args.projectId)) {
        projectActive += 1;
      }
    }
    return { userActive, projectActive };
  },
});
