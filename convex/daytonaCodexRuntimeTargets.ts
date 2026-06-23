import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  DAYTONA_CODEX_DEFAULT_AUTO_ARCHIVE_MINUTES,
  DAYTONA_CODEX_DEFAULT_AUTO_DELETE_MINUTES,
  DAYTONA_CODEX_DEFAULT_AUTO_STOP_MINUTES,
  DAYTONA_CODEX_DEFAULT_PREVIEW_LEASE_MINUTES,
  DAYTONA_CODEX_WORKER_PORT,
} from "../shared/daytonaCodexRuntimePolicy";

const WORKER_PORT = DAYTONA_CODEX_WORKER_PORT;
const READY_URL_REFRESH_BUFFER_MS = 60_000;
const DEFAULT_PREVIEW_LEASE_MINUTES =
  DAYTONA_CODEX_DEFAULT_PREVIEW_LEASE_MINUTES;
const DEFAULT_EXPIRED_TARGET_SWEEP_LIMIT = 20;

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

function normalizeActivePreviewPorts(rawPorts: unknown): number[] {
  if (!Array.isArray(rawPorts)) return [];
  const ports = new Set<number>();
  for (const rawPort of rawPorts) {
    const port = Number(rawPort);
    if (Number.isFinite(port) && port > 0) ports.add(Math.floor(port));
  }
  return Array.from(ports);
}

function defaultPreviewLeaseExpiresAt(nowMs: number): number {
  return (
    nowMs +
    readIntegerEnv("POLYNET_DAYTONA_PREVIEW_LEASE_MINUTES", DEFAULT_PREVIEW_LEASE_MINUTES) *
      60_000
  );
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

export const getDaytonaCodexRuntimeTargetByIdInternal = internalQuery({
  args: {
    targetId: v.id("daytonaCodexRuntimeTargets"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.targetId);
  },
});

export const getActiveDaytonaCodexRuntimeSubstrateForThreadInternal = internalQuery({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const targets = await (ctx.db.query as any)("daytonaCodexRuntimeTargets")
      .withIndex("by_owner_threadId", (q: any) =>
        q.eq("ownerId", args.ownerId).eq("threadId", args.threadId),
      )
      .collect();
    const candidates = targets
      .filter((target: any) => {
        const sandboxId = String(target.sandboxId ?? "").trim();
        if (!sandboxId) return false;
        if (
          String(target.sandboxState ?? "") === "deleted" ||
          String(target.sandboxState ?? "") === "stopped"
        ) return false;
        if (
          String(target.providerTeardownState ?? "") === "deleted" ||
          String(target.providerTeardownState ?? "") === "stopped"
        ) return false;
        if (String(target.workerState ?? "") === "error") return false;
        const previewLeaseActive =
          String(target.previewLeaseState ?? "") === "active" &&
          Number(target.previewLeaseExpiresAt ?? 0) > nowMs &&
          normalizeActivePreviewPorts(target.activePreviewPorts).length > 0;
        return String(target.workerState ?? "") === "ready" || previewLeaseActive;
      })
      .sort((left: any, right: any) => {
        const leftPreviewActive =
          String(left.previewLeaseState ?? "") === "active" &&
          Number(left.previewLeaseExpiresAt ?? 0) > nowMs
            ? 1
            : 0;
        const rightPreviewActive =
          String(right.previewLeaseState ?? "") === "active" &&
          Number(right.previewLeaseExpiresAt ?? 0) > nowMs
            ? 1
            : 0;
        if (leftPreviewActive !== rightPreviewActive) {
          return rightPreviewActive - leftPreviewActive;
        }
        return (
          Number(right.lastUsedAt ?? right.updatedAt ?? 0) -
          Number(left.lastUsedAt ?? left.updatedAt ?? 0)
        );
      });
    const target = candidates[0];
    if (!target) return null;
    const activePreviewPorts = normalizeActivePreviewPorts(target.activePreviewPorts);
    const previewLeaseExpiresAt = Number(target.previewLeaseExpiresAt ?? 0);
    const previewLeaseActive =
      String(target.previewLeaseState ?? "") === "active" &&
      Number.isFinite(previewLeaseExpiresAt) &&
      previewLeaseExpiresAt > nowMs &&
      activePreviewPorts.length > 0;
    return {
      provider: "daytona",
      targetId: String(target._id),
      runId: String(target.runId ?? ""),
      scope: String(target.scope ?? ""),
      lifecycleMode: String(target.lifecycleMode ?? ""),
      sandboxId: String(target.sandboxId ?? ""),
      sandboxState: String(target.sandboxState ?? ""),
      workerState: String(target.workerState ?? ""),
      workspaceRoot: String(target.workspaceRoot ?? ""),
      activePreviewPorts,
      previewLeaseState: String(target.previewLeaseState ?? "none"),
      previewLeaseExpiresAt: Number.isFinite(previewLeaseExpiresAt)
        ? previewLeaseExpiresAt
        : null,
      previewLeaseActive,
    };
  },
});

export const listExpiredDaytonaCodexRuntimeTargetsInternal = internalQuery({
  args: {
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const limit = Math.min(
      100,
      Math.max(1, Math.floor(args.limit ?? DEFAULT_EXPIRED_TARGET_SWEEP_LIMIT)),
    );
    const expiredRetentionTargets = await (ctx.db.query as any)("daytonaCodexRuntimeTargets")
      .withIndex("by_workspaceRetentionState_expiresAt", (q: any) =>
        q
          .eq("workspaceRetentionState", "human_save_pending")
          .lte("workspaceRetentionExpiresAt", nowMs),
      )
      .take(limit);
    const remaining = Math.max(0, limit - expiredRetentionTargets.length);
    const expiredPreviewLeaseTargets =
      remaining > 0
        ? await (ctx.db.query as any)("daytonaCodexRuntimeTargets")
            .withIndex("by_previewLeaseState_expiresAt", (q: any) =>
              q.eq("previewLeaseState", "active").lte("previewLeaseExpiresAt", nowMs),
            )
            .take(remaining)
        : [];
    return {
      nowMs,
      expiredRetentionTargets,
      expiredPreviewLeaseTargets,
    };
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
    lifecycleMode: v.union(
      v.literal("prepared_staging_reuse"),
      v.literal("thread_ephemeral"),
      v.literal("per_turn_ephemeral"),
    ),
    providerEphemeral: v.boolean(),
    workspaceRoot: v.optional(v.string()),
    autoStopMinutes: v.optional(v.number()),
    autoArchiveMinutes: v.optional(v.number()),
    autoDeleteMinutes: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const expectedWorkspaceRoot = String(args.workspaceRoot ?? "").trim() || null;
    const expectedSnapshotId = String(args.snapshotId ?? "").trim() || null;
    const workspaceRootMatches = (target: any) =>
      !expectedWorkspaceRoot || String(target.workspaceRoot ?? "").trim() === expectedWorkspaceRoot;
    const snapshotMatches = (target: any) =>
      (String(target.snapshotId ?? "").trim() || null) === expectedSnapshotId;
    const retireIncompatibleTarget = async (target: any) => {
      await ctx.db.patch(target._id, {
        workerState: "released",
        leaseRunId: undefined,
        releasedAt: nowMs,
        releaseReason: "workspace_root_changed",
        lastUsedAt: nowMs,
        updatedAt: nowMs,
      });
    };
    const claimExistingTarget = async (target: any) => {
      if (
        String(target.workerState ?? "") === "ready" &&
        String(target.workerUrl ?? "").trim() &&
        Number(target.signedPreviewExpiresAt ?? 0) > nowMs + READY_URL_REFRESH_BUFFER_MS
      ) {
        await ctx.db.patch(target._id, {
          threadId: args.threadId,
          ...(args.projectId ? { projectId: args.projectId } : { projectId: undefined }),
          runId: args.runId,
          scope: args.lifecycleMode === "thread_ephemeral" ? "thread" : "run",
          leaseRunId: args.runId,
          lifecycleMode: args.lifecycleMode,
          providerEphemeral: args.providerEphemeral,
          ...(expectedWorkspaceRoot ? { workspaceRoot: expectedWorkspaceRoot } : {}),
          lastUsedAt: nowMs,
          updatedAt: nowMs,
          releasedAt: undefined,
          releaseReason: undefined,
          providerTeardownState: "pending",
          providerTeardownReason: undefined,
          providerTeardownAt: undefined,
          providerTeardownErrorCode: undefined,
          providerTeardownErrorMessage: undefined,
          errorCode: undefined,
          errorMessage: undefined,
        });
        return {
          ok: true,
          targetId: String(target._id),
          ready: true,
          target: await ctx.db.get(target._id),
        };
      }
      await ctx.db.patch(target._id, {
        threadId: args.threadId,
        ...(args.projectId ? { projectId: args.projectId } : { projectId: undefined }),
        runId: args.runId,
        scope: args.lifecycleMode === "thread_ephemeral" ? "thread" : "run",
        workerState: "starting",
        leaseRunId: args.runId,
        lifecycleMode: args.lifecycleMode,
        providerEphemeral: args.providerEphemeral,
        ...(expectedWorkspaceRoot ? { workspaceRoot: expectedWorkspaceRoot } : {}),
        lastUsedAt: nowMs,
        updatedAt: nowMs,
        releasedAt: undefined,
        releaseReason: undefined,
        providerTeardownState: "pending",
        providerTeardownReason: undefined,
        providerTeardownAt: undefined,
        providerTeardownErrorCode: undefined,
        providerTeardownErrorMessage: undefined,
        errorCode: undefined,
        errorMessage: undefined,
      });
      return {
        ok: true,
        targetId: String(target._id),
        ready: false,
        target: await ctx.db.get(target._id),
      };
    };

    const existing = await (ctx.db.query as any)("daytonaCodexRuntimeTargets")
      .withIndex("by_owner_runId", (q: any) =>
        q.eq("ownerId", args.ownerId).eq("runId", args.runId),
      )
      .unique();
    if (existing) {
      if (workspaceRootMatches(existing)) return await claimExistingTarget(existing);
      await retireIncompatibleTarget(existing);
    }

    if (args.lifecycleMode === "thread_ephemeral") {
      const threadTargets = await (ctx.db.query as any)("daytonaCodexRuntimeTargets")
        .withIndex("by_owner_threadId", (q: any) =>
          q.eq("ownerId", args.ownerId).eq("threadId", args.threadId),
        )
        .collect();
      const reusable = threadTargets
        .filter((target: any) => {
          const sandboxId = String(target.sandboxId ?? "").trim();
          if (!sandboxId) return false;
          if (String(target.scope ?? "") !== "thread") return false;
          if (String(target.lifecycleMode ?? "") !== "thread_ephemeral") return false;
          if (target.providerEphemeral !== args.providerEphemeral) return false;
          if (!workspaceRootMatches(target)) return false;
          if (!snapshotMatches(target)) return false;
          if (String(target.workerState ?? "") === "error") return false;
          if (String(target.sandboxState ?? "") === "deleted") return false;
          if (String(target.providerTeardownState ?? "") === "deleted") return false;
          return true;
        })
        .sort(
          (left: any, right: any) =>
            Number(right.lastUsedAt ?? right.updatedAt ?? 0) -
            Number(left.lastUsedAt ?? left.updatedAt ?? 0),
        )[0];
      if (reusable) {
        return await claimExistingTarget(reusable);
      }
    }

    const targetId = await (ctx.db.insert as any)("daytonaCodexRuntimeTargets", {
      ownerId: args.ownerId,
      threadId: args.threadId,
      ...(args.projectId ? { projectId: args.projectId } : {}),
      runId: args.runId,
      scope: args.lifecycleMode === "thread_ephemeral" ? "thread" : "run",
      provider: "daytona",
      workerState: "creating",
      workerPort: WORKER_PORT,
      workerAuthMode: "shared_env_token",
      ...(expectedWorkspaceRoot ? { workspaceRoot: expectedWorkspaceRoot } : {}),
      ...(args.snapshotId ? { snapshotId: args.snapshotId } : {}),
      ...(args.targetRegion ? { targetRegion: args.targetRegion } : {}),
      leaseRunId: args.runId,
      lifecycleMode: args.lifecycleMode,
      providerEphemeral: args.providerEphemeral,
      autoStopMinutes:
        args.autoStopMinutes ??
        readIntegerEnv(
          "POLYNET_DAYTONA_DIRECT_AUTO_STOP_MINUTES",
          DAYTONA_CODEX_DEFAULT_AUTO_STOP_MINUTES,
        ),
      autoArchiveMinutes:
        args.autoArchiveMinutes ??
        readIntegerEnv(
          "POLYNET_DAYTONA_DIRECT_AUTO_ARCHIVE_MINUTES",
          DAYTONA_CODEX_DEFAULT_AUTO_ARCHIVE_MINUTES,
        ),
      autoDeleteMinutes:
        args.autoDeleteMinutes ??
        readIntegerEnv(
          "POLYNET_DAYTONA_DIRECT_AUTO_DELETE_MINUTES",
          DAYTONA_CODEX_DEFAULT_AUTO_DELETE_MINUTES,
        ),
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
    activePreviewPorts: v.optional(v.array(v.number())),
    previewLeaseExpiresAt: v.optional(v.number()),
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
    const incomingPreviewPorts = normalizeActivePreviewPorts(args.activePreviewPorts);
    const existingPreviewPorts =
      String(target.previewLeaseState ?? "") === "active"
        ? normalizeActivePreviewPorts(target.activePreviewPorts)
        : [];
    const activePreviewPorts = Array.from(
      new Set([...existingPreviewPorts, ...incomingPreviewPorts]),
    );
    const requestedPreviewLeaseExpiresAt = Number(args.previewLeaseExpiresAt ?? 0);
    const existingPreviewLeaseExpiresAt = Number(target.previewLeaseExpiresAt ?? 0);
    const previewLeaseExpiresAt =
      activePreviewPorts.length > 0
        ? Math.max(
            defaultPreviewLeaseExpiresAt(nowMs),
            Number.isFinite(requestedPreviewLeaseExpiresAt)
              ? requestedPreviewLeaseExpiresAt
              : 0,
            Number.isFinite(existingPreviewLeaseExpiresAt)
              ? existingPreviewLeaseExpiresAt
              : 0,
          )
        : undefined;
    if (String(target.workerState ?? "") === "released") {
      if (incomingPreviewPorts.length === 0) {
        return { ok: true, released: false, reason: "target_already_released" };
      }
      await ctx.db.patch(target._id, {
        activePreviewPorts,
        previewLeaseState: "active",
        previewLeaseExpiresAt,
        updatedAt: nowMs,
      });
      return {
        ok: true,
        released: false,
        reason: "target_already_released_preview_merged",
        targetId: String(target._id),
      };
    }
    await ctx.db.patch(target._id, {
      workerState: "released",
      leaseRunId: undefined,
      releasedAt: nowMs,
      releaseReason: args.reason,
      activePreviewPorts,
      previewLeaseState: activePreviewPorts.length > 0 ? "active" : "none",
      previewLeaseExpiresAt,
      updatedAt: nowMs,
    });
    return { ok: true, released: true, targetId: String(target._id) };
  },
});

export const markDaytonaCodexRuntimeTargetWorkspaceLifecycleInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    runId: v.string(),
    workspaceChangeState: v.union(
      v.literal("unknown"),
      v.literal("clean"),
      v.literal("dirty"),
      v.literal("scan_failed"),
    ),
    workspaceRetentionState: v.union(
      v.literal("none"),
      v.literal("human_save_pending"),
      v.literal("discarded"),
      v.literal("saved"),
      v.literal("expired"),
    ),
    workspaceRetentionExpiresAt: v.optional(v.number()),
    workspaceMeaningfulFileCount: v.optional(v.number()),
    workspaceMeaningfulFilePreview: v.optional(v.array(v.string())),
    cleanupDecision: v.union(
      v.literal("delete_clean_workspace"),
      v.literal("delete_without_active_lease"),
      v.literal("stop_for_human_save"),
      v.literal("keep_running_active_preview"),
      v.literal("skip_prepared_staging_reuse"),
      v.literal("retain_scan_failed"),
      v.literal("delete_expired_retention"),
      v.literal("cleanup_failed"),
    ),
    cleanupEligibleAt: v.optional(v.number()),
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
      workspaceChangeState: args.workspaceChangeState,
      workspaceRetentionState: args.workspaceRetentionState,
      workspaceRetentionExpiresAt: args.workspaceRetentionExpiresAt,
      workspaceMeaningfulFileCount: args.workspaceMeaningfulFileCount,
      workspaceMeaningfulFilePreview: args.workspaceMeaningfulFilePreview,
      lastWorkspaceScanAt: nowMs,
      cleanupDecision: args.cleanupDecision,
      cleanupEligibleAt: args.cleanupEligibleAt,
      updatedAt: nowMs,
    });
    return { ok: true, updated: true, targetId: String(target._id) };
  },
});

export const markDaytonaCodexRuntimeTargetPreviewLeaseExpiredInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    runId: v.string(),
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
    if (String(target.previewLeaseState ?? "") !== "active") {
      return { ok: true, updated: false, reason: "preview_lease_not_active" };
    }
    await ctx.db.patch(target._id, {
      previewLeaseState: "expired",
      cleanupEligibleAt: nowMs,
      updatedAt: nowMs,
    });
    return { ok: true, updated: true, targetId: String(target._id) };
  },
});

export const markDaytonaCodexRuntimeTargetPreviewPortsStoppedInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    runId: v.string(),
    stoppedPreviewPorts: v.array(v.number()),
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
    const stoppedPreviewPorts = new Set(
      normalizeActivePreviewPorts(args.stoppedPreviewPorts),
    );
    if (stoppedPreviewPorts.size === 0) {
      return { ok: true, updated: false, reason: "no_stopped_preview_ports" };
    }
    const remainingPreviewPorts = normalizeActivePreviewPorts(
      target.activePreviewPorts,
    ).filter((port) => !stoppedPreviewPorts.has(port));
    const previewLeaseExpiresAt = Number(target.previewLeaseExpiresAt ?? 0);
    const previewLeaseStillActive =
      remainingPreviewPorts.length > 0 &&
      String(target.previewLeaseState ?? "") === "active" &&
      Number.isFinite(previewLeaseExpiresAt) &&
      previewLeaseExpiresAt > nowMs;
    await ctx.db.patch(target._id, {
      activePreviewPorts: remainingPreviewPorts,
      previewLeaseState: previewLeaseStillActive ? "active" : "expired",
      ...(previewLeaseStillActive ? {} : { cleanupEligibleAt: nowMs }),
      updatedAt: nowMs,
    });
    return {
      ok: true,
      updated: true,
      targetId: String(target._id),
      remainingPreviewPorts,
      previewLeaseState: previewLeaseStillActive ? "active" : "expired",
    };
  },
});

export const markDaytonaCodexRuntimeTargetRetentionExpiredInternal = internalMutation({
  args: {
    ownerId: v.id("users"),
    runId: v.string(),
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
      workspaceRetentionState: "expired",
      cleanupDecision: "delete_expired_retention",
      cleanupEligibleAt: nowMs,
      updatedAt: nowMs,
    });
    return { ok: true, updated: true, targetId: String(target._id) };
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
