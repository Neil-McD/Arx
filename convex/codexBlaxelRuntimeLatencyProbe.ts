import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

export const getCodexBlaxelRuntimeLatencyProbeDataInternal = internalQuery({
  args: {
    threadKey: v.optional(v.string()),
    runId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const threadKey = String(args.threadKey ?? "").trim();
    const runId = String(args.runId ?? "").trim();
    let thread: any | null = null;
    let run: any | null = null;

    if (threadKey) {
      const threads = await ctx.db
        .query("threads")
        .filter((q) => q.eq(q.field("threadKey"), threadKey))
        .take(2);
      thread = threads[0] || null;
      if (thread) {
        const runs = await ctx.db
          .query("runtimeRuns")
          .withIndex("by_thread_startedAt", (q) => q.eq("threadId", thread._id))
          .order("desc")
          .take(20);
        run = runId
          ? runs.find((row) => row.runId === runId) || null
          : runs.find((row) => row.runId === thread.latestUserVisibleCompletedRunId) || runs[0] || null;
      }
    }

    if (!run && runId) {
      const runs = await ctx.db
        .query("runtimeRuns")
        .filter((q) => q.eq(q.field("runId"), runId))
        .take(2);
      run = runs[0] || null;
      if (run && !thread) thread = await ctx.db.get(run.threadId);
    }

    if (!thread && threadKey) return { ok: false, reason: "thread_not_found" };
    if (!run) return { ok: false, reason: "runtime_run_not_found" };

    const events = await ctx.db
      .query("runtimeRunEvents")
      .withIndex("by_thread_run_seq", (q) => q.eq("threadId", run.threadId).eq("runId", run.runId))
      .order("asc")
      .take(500);

    const providerCost = await ctx.db
      .query("providerCostEntries")
      .withIndex("by_costKey", (q) => q.eq("costKey", `codex_blaxel_runtime:${run.runId}:provider_cost`))
      .unique();

    return {
      ok: true,
      thread: thread
        ? {
            threadKey: thread.threadKey || null,
            latestUserVisibleCompletedRunId: thread.latestUserVisibleCompletedRunId || null,
          }
        : null,
      run: {
        runId: run.runId,
        status: run.status,
        modelId: run.modelId || null,
        engineId: run.engineId || null,
        executionMode: run.executionMode || null,
        sandboxMode: run.sandboxMode || null,
        harnessProfile: run.harnessProfile || null,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt || null,
      },
      events: events.map((event) => ({
        seq: event.seq,
        eventType: event.eventType,
        createdAt: event.createdAt,
        payload: event.payload || null,
      })),
      providerCost: providerCost
        ? {
            costKey: providerCost.costKey,
            component: providerCost.component,
            billingDisposition: providerCost.billingDisposition,
            rawVendorCostUsd: providerCost.rawVendorCostUsd,
            metadata: providerCost.metadata || null,
          }
        : null,
    };
  },
});
