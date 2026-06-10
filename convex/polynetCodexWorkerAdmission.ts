import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { POLYNET_CODEX_WORKER_ACTIVE_RUN_WINDOW_MS } from "../shared/polynetCodexWorkerLimits";

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
