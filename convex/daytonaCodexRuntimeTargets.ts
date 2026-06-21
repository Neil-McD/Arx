import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const WORKER_PORT = 8877;
const READY_URL_REFRESH_BUFFER_MS = 60_000;

function readEnv(name: string): string {
  try {
    return String(process.env[name] ?? "").trim();
  } catch {
    return "";
  }
}

function readIntegerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(readEnv(name), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const getDaytonaCodexRuntimeTargetByRunIdInternal = internalQuery({
  args: {
    ownerId: v.id("users"),
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    return await (ctx.db.query as any)("daytonaCodexRuntimeTargets")
      .withIndex("by_owner_runId", (q: any) =>
        q.eq("ownerId", args.ownerId).eq("runId", args.runId),
      )
      .unique();
  },
});

export const claimDaytonaCodexRuntimeTargetInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    runId: v.string(),
    projectId: v.optional(v.id("cloudProjects")),
    snapshotId: v.optional(v.string()),
    targetRegion: v.optional(v.string()),
    lifecycleMode: v.union(v.literal("prepared_staging_reuse"), v.literal("per_turn_ephemeral")),
    autoStopMinutes: v.optional(v.number()),
    autoArchiveMinutes: v.optional(v.number()),
    autoDeleteMinutes: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const existing = await (ctx.db.query as any)("daytonaCodexRuntimeTargets")
      .withIndex("by_owner_runId", (q: any) =>
        q.eq("ownerId", args.ownerId).eq("runId", args.runId),
      )
      .unique();
    if (existing) {
      if (
        String(existing.workerState ?? "") === "ready" &&
        String(existing.workerUrl ?? "").trim() &&
        Number(existing.signedPreviewExpiresAt ?? 0) > nowMs + READY_URL_REFRESH_BUFFER_MS
      ) {
        return { ok: true, targetId: String(existing._id), ready: true, target: existing };
      }
      await ctx.db.patch(existing._id, {
        workerState: "starting",
        leaseRunId: args.runId,
        lifecycleMode: args.lifecycleMode,
        lastUsedAt: nowMs,
        updatedAt: nowMs,
        errorCode: undefined,
        errorMessage: undefined,
        providerTeardownErrorCode: undefined,
        providerTeardownErrorMessage: undefined,
      });
      return {
        ok: true,
        targetId: String(existing._id),
        ready: false,
        target: await ctx.db.get(existing._id),
      };
    }
    const targetId = await (ctx.db.insert as any)("daytonaCodexRuntimeTargets", {
      ownerId: args.ownerId,
      threadId: args.threadId,
      ...(args.projectId ? { projectId: args.projectId } : {}),
      runId: args.runId,
      scope: "run",
      provider: "daytona",
      workerState: "creating",
      workerPort: WORKER_PORT,
      workerAuthMode: "shared_env_token",
      ...(args.snapshotId ? { snapshotId: args.snapshotId } : {}),
      ...(args.targetRegion ? { targetRegion: args.targetRegion } : {}),
      leaseRunId: args.runId,
      lifecycleMode: args.lifecycleMode,
      autoStopMinutes: args.autoStopMinutes ?? readIntegerEnv("POLYNET_DAYTONA_DIRECT_AUTO_STOP_MINUTES", 5),
      autoArchiveMinutes: args.autoArchiveMinutes ?? readIntegerEnv("POLYNET_DAYTONA_DIRECT_AUTO_ARCHIVE_MINUTES", 60),
      autoDeleteMinutes: args.autoDeleteMinutes ?? readIntegerEnv("POLYNET_DAYTONA_DIRECT_AUTO_DELETE_MINUTES", 180),
      providerTeardownState: "pending",
      lastUsedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return {
      ok: true,
      targetId: String(targetId),
      ready: false,
      target: await ctx.db.get(targetId),
    };
  },
});

export const markDaytonaCodexRuntimeTargetReadyInternal = internalMutation({
  args: {
    targetId: v.id("daytonaCodexRuntimeTargets"),
    sandboxId: v.string(),
    sandboxName: v.optional(v.string()),
    sandboxState: v.optional(v.string()),
    workerUrl: v.string(),
    signedPreviewExpiresAt: v.number(),
    lastHealthAt: v.number(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    await ctx.db.patch(args.targetId, {
      sandboxId: args.sandboxId,
      ...(args.sandboxName ? { sandboxName: args.sandboxName } : {}),
      ...(args.sandboxState ? { sandboxState: args.sandboxState } : {}),
      workerState: "ready",
      workerUrl: args.workerUrl,
      signedPreviewExpiresAt: args.signedPreviewExpiresAt,
      lastHealthAt: args.lastHealthAt,
      lastUsedAt: nowMs,
      providerTeardownState: "pending",
      providerTeardownReason: undefined,
      providerTeardownAt: undefined,
      providerTeardownErrorCode: undefined,
      providerTeardownErrorMessage: undefined,
      errorCode: undefined,
      errorMessage: undefined,
      updatedAt: nowMs,
    });
    return await ctx.db.get(args.targetId);
  },
});

export const markDaytonaCodexRuntimeTargetErrorInternal = internalMutation({
  args: {
    targetId: v.id("daytonaCodexRuntimeTargets"),
    errorCode: v.string(),
    errorMessage: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    await ctx.db.patch(args.targetId, {
      workerState: "error",
      errorCode: args.errorCode,
      errorMessage: args.errorMessage.slice(0, 4000),
      providerTeardownState: "failed",
      providerTeardownReason: "target_start_failed",
      providerTeardownAt: nowMs,
      providerTeardownErrorCode: args.errorCode,
      providerTeardownErrorMessage: args.errorMessage.slice(0, 4000),
      updatedAt: nowMs,
    });
    return await ctx.db.get(args.targetId);
  },
});

export const releaseDaytonaCodexRuntimeTargetInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    runId: v.string(),
    reason: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const target = await (ctx.db.query as any)("daytonaCodexRuntimeTargets")
      .withIndex("by_owner_runId", (q: any) =>
        q.eq("ownerId", args.ownerId).eq("runId", args.runId),
      )
      .unique();
    if (!target) return { ok: true, released: false, reason: "target_missing" };
    if (String(target.workerState ?? "") === "released") {
      return { ok: true, released: false, reason: "target_already_released" };
    }
    await ctx.db.patch(target._id, {
      workerState: "released",
      leaseRunId: undefined,
      releasedAt: nowMs,
      releaseReason: args.reason,
      updatedAt: nowMs,
    });
    return { ok: true, released: true, targetId: String(target._id) };
  },
});

export const markDaytonaCodexRuntimeTargetProviderTeardownInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    runId: v.string(),
    state: v.union(
      v.literal("pending"),
      v.literal("skipped"),
      v.literal("stopped"),
      v.literal("deleted"),
      v.literal("failed"),
    ),
    reason: v.string(),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const target = await (ctx.db.query as any)("daytonaCodexRuntimeTargets")
      .withIndex("by_owner_runId", (q: any) =>
        q.eq("ownerId", args.ownerId).eq("runId", args.runId),
      )
      .unique();
    if (!target) return { ok: true, updated: false, reason: "target_missing" };
    await ctx.db.patch(target._id, {
      providerTeardownState: args.state,
      providerTeardownReason: args.reason,
      providerTeardownAt: nowMs,
      providerTeardownErrorCode: args.errorCode,
      providerTeardownErrorMessage: args.errorMessage?.slice(0, 4000),
      ...(args.state === "deleted" ? { sandboxState: "deleted" } : {}),
      ...(args.state === "stopped" ? { sandboxState: "stopped" } : {}),
      updatedAt: nowMs,
    });
    return { ok: true, updated: true, targetId: String(target._id), state: args.state };
  },
});
