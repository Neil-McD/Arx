import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

type BindingDecision =
  | {
      action: "disabled";
      reason: "thread_required" | "project_required" | "projection_fingerprint_required";
      bindingKey: null;
      codexThreadId: null;
      codexHomePath: string | null;
      previousCodexThreadId: null;
      previousCodexMcpProjectionFingerprint: null;
      previousCodexDynamicToolSurfaceFingerprint: null;
      duplicateBindingCount: 0;
    }
  | {
      action: "create" | "resume" | "rotate";
      reason:
        | "binding_missing"
        | "projection_fingerprint_match"
        | "projection_fingerprint_changed"
        | "dynamic_tool_surface_fingerprint_match"
        | "dynamic_tool_surface_fingerprint_changed";
      bindingKey: string;
      codexThreadId: string | null;
      codexHomePath: string;
      previousCodexThreadId: string | null;
      previousCodexMcpProjectionFingerprint: string | null;
      previousCodexDynamicToolSurfaceFingerprint: string | null;
      duplicateBindingCount: number;
    };

function normalizeString(value: unknown, max = 1_000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function buildBindingKey(args: {
  userId: string;
  threadId: string;
  projectId: string;
}): string {
  return [args.userId, args.threadId, args.projectId].join(":");
}

function normalizeTtlMs(value: unknown): number {
  const raw = Number(value ?? 5 * 60 * 1000);
  if (!Number.isFinite(raw)) return 5 * 60 * 1000;
  return Math.max(60 * 1000, Math.min(10 * 60 * 1000, Math.floor(raw)));
}

async function loadBindingRows(ctx: any, bindingKey: string, limit = 20): Promise<any[]> {
  return await ctx.db
    .query("codexHarnessThreadBindings")
    .withIndex("by_bindingKey", (q: any) => q.eq("bindingKey", bindingKey))
    .take(limit);
}

function compareBindingRows(left: any, right: any): number {
  const leftActive = left?.status === "active" ? 1 : 0;
  const rightActive = right?.status === "active" ? 1 : 0;
  if (leftActive !== rightActive) return rightActive - leftActive;
  const leftUpdated = Number(left?.updatedAt ?? left?.createdAt ?? 0);
  const rightUpdated = Number(right?.updatedAt ?? right?.createdAt ?? 0);
  if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;
  return String(left?._id ?? "").localeCompare(String(right?._id ?? ""));
}

function pickCanonicalBindingRow(rows: readonly any[]): any | null {
  return [...rows].sort(compareBindingRows)[0] ?? null;
}

async function rotateDuplicateBindingRows(args: {
  ctx: any;
  rows: readonly any[];
  canonicalId: unknown;
  nowMs: number;
}): Promise<number> {
  let repaired = 0;
  for (const row of args.rows) {
    if (String(row?._id) === String(args.canonicalId)) continue;
    await args.ctx.db.patch(row._id, {
      status: "rotated",
      updatedAt: args.nowMs,
      previousCodexThreadId: normalizeString(row?.codexThreadId, 240) || undefined,
      previousCodexMcpProjectionFingerprint:
        normalizeString(row?.codexMcpProjectionFingerprint, 240) || undefined,
      previousCodexDynamicToolSurfaceFingerprint:
        normalizeString(row?.codexDynamicToolSurfaceFingerprint, 240) || undefined,
      rotatedAt: args.nowMs,
      rotatedReason: "duplicate_binding_row_repaired",
    });
    repaired += 1;
  }
  return repaired;
}

export const resolveCodexHarnessThreadBindingForTurnInternal = internalQuery({
  args: {
    userId: v.string(),
    threadId: v.optional(v.string()),
    projectId: v.optional(v.string()),
    codexHomePath: v.optional(v.string()),
    codexMcpProjectionFingerprint: v.optional(v.string()),
    codexDynamicToolSurfaceFingerprint: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<BindingDecision> => {
    const userId = normalizeString(args.userId, 240);
    const threadId = normalizeString(args.threadId, 240);
    const projectId = normalizeString(args.projectId, 240);
    const codexHomePath = normalizeString(args.codexHomePath, 1_000);
    const mcpProjectionFingerprint = normalizeString(args.codexMcpProjectionFingerprint, 240);
    const dynamicToolSurfaceFingerprint = normalizeString(
      args.codexDynamicToolSurfaceFingerprint,
      240,
    );
    const comparisonFingerprint =
      dynamicToolSurfaceFingerprint || mcpProjectionFingerprint;
    if (!threadId) {
      return {
        action: "disabled",
        reason: "thread_required",
        bindingKey: null,
        codexThreadId: null,
        codexHomePath: codexHomePath || null,
        previousCodexThreadId: null,
        previousCodexMcpProjectionFingerprint: null,
        previousCodexDynamicToolSurfaceFingerprint: null,
        duplicateBindingCount: 0,
      };
    }
    if (!projectId) {
      return {
        action: "disabled",
        reason: "project_required",
        bindingKey: null,
        codexThreadId: null,
        codexHomePath: codexHomePath || null,
        previousCodexThreadId: null,
        previousCodexMcpProjectionFingerprint: null,
        previousCodexDynamicToolSurfaceFingerprint: null,
        duplicateBindingCount: 0,
      };
    }
    if (!comparisonFingerprint) {
      return {
        action: "disabled",
        reason: "projection_fingerprint_required",
        bindingKey: null,
        codexThreadId: null,
        codexHomePath: codexHomePath || null,
        previousCodexThreadId: null,
        previousCodexMcpProjectionFingerprint: null,
        previousCodexDynamicToolSurfaceFingerprint: null,
        duplicateBindingCount: 0,
      };
    }
    const bindingKey = buildBindingKey({ userId, threadId, projectId });
    const bindingRows = await loadBindingRows(ctx, bindingKey);
    const existing = pickCanonicalBindingRow(bindingRows);
    const duplicateBindingCount = Math.max(0, bindingRows.length - 1);
    const effectiveCodexHomePath =
      normalizeString(existing?.codexHomePath, 1_000) || codexHomePath;
    if (!existing) {
      return {
        action: "create",
        reason: "binding_missing",
        bindingKey,
        codexThreadId: null,
        codexHomePath: effectiveCodexHomePath,
        previousCodexThreadId: null,
        previousCodexMcpProjectionFingerprint: null,
        previousCodexDynamicToolSurfaceFingerprint: null,
        duplicateBindingCount,
      };
    }
    const existingMcpProjectionFingerprint = normalizeString(
      existing.codexMcpProjectionFingerprint,
      240,
    );
    const existingDynamicToolSurfaceFingerprint = normalizeString(
      existing.codexDynamicToolSurfaceFingerprint,
      240,
    );
    const existingComparisonFingerprint =
      dynamicToolSurfaceFingerprint && existingDynamicToolSurfaceFingerprint
        ? existingDynamicToolSurfaceFingerprint
        : existingMcpProjectionFingerprint;
    const existingCodexThreadId = normalizeString(existing.codexThreadId, 240);
    if (
      existing.status === "active" &&
      existingComparisonFingerprint === comparisonFingerprint
    ) {
      return {
        action: "resume",
        reason: dynamicToolSurfaceFingerprint
          ? "dynamic_tool_surface_fingerprint_match"
          : "projection_fingerprint_match",
        bindingKey,
        codexThreadId: existingCodexThreadId || null,
        codexHomePath: effectiveCodexHomePath,
        previousCodexThreadId: existingCodexThreadId || null,
        previousCodexMcpProjectionFingerprint:
          existingMcpProjectionFingerprint || null,
        previousCodexDynamicToolSurfaceFingerprint:
          existingDynamicToolSurfaceFingerprint || null,
        duplicateBindingCount,
      };
    }
    return {
      action: "rotate",
      reason: dynamicToolSurfaceFingerprint
        ? "dynamic_tool_surface_fingerprint_changed"
        : "projection_fingerprint_changed",
      bindingKey,
      codexThreadId: null,
      codexHomePath: effectiveCodexHomePath,
      previousCodexThreadId: existingCodexThreadId || null,
      previousCodexMcpProjectionFingerprint:
        existingMcpProjectionFingerprint || null,
      previousCodexDynamicToolSurfaceFingerprint:
        existingDynamicToolSurfaceFingerprint || null,
      duplicateBindingCount,
    };
  },
});

export const upsertCodexHarnessThreadBindingAfterRunInternal = internalMutation({
  args: {
    bindingKey: v.string(),
    userId: v.string(),
    threadId: v.string(),
    projectId: v.string(),
    codexThreadId: v.string(),
    codexHomePath: v.string(),
    codexMcpProjectionVersion: v.string(),
    codexMcpProjectionFingerprint: v.string(),
    codexDynamicToolSurfaceVersion: v.optional(v.string()),
    codexDynamicToolSurfaceFingerprint: v.optional(v.string()),
    runId: v.string(),
    providerSandboxId: v.optional(v.string()),
    projectVolumeId: v.optional(v.string()),
    lifecycleAction: v.union(
      v.literal("created"),
      v.literal("resumed"),
      v.literal("rotated"),
    ),
    previousCodexThreadId: v.optional(v.string()),
    previousCodexMcpProjectionFingerprint: v.optional(v.string()),
    previousCodexDynamicToolSurfaceFingerprint: v.optional(v.string()),
    rotatedReason: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const bindingKey = normalizeString(args.bindingKey, 1_000);
    const userId = normalizeString(args.userId, 240);
    const threadId = normalizeString(args.threadId, 240);
    const projectId = normalizeString(args.projectId, 240);
    const codexThreadId = normalizeString(args.codexThreadId, 240);
    const codexHomePath = normalizeString(args.codexHomePath, 1_000);
    const fingerprint = normalizeString(args.codexMcpProjectionFingerprint, 240);
    const version = normalizeString(args.codexMcpProjectionVersion, 120);
    const dynamicToolSurfaceVersion = normalizeString(
      args.codexDynamicToolSurfaceVersion,
      120,
    );
    const dynamicToolSurfaceFingerprint = normalizeString(
      args.codexDynamicToolSurfaceFingerprint,
      240,
    );
    if (
      !bindingKey ||
      !userId ||
      !threadId ||
      !projectId ||
      !codexThreadId ||
      !codexHomePath ||
      !fingerprint ||
      !version
    ) {
      throw new Error("codex_harness_thread_binding_required");
    }
    const nowMs = Number.isFinite(args.nowMs)
      ? Math.floor(args.nowMs as number)
      : Date.now();
    const bindingRows = await loadBindingRows(ctx, bindingKey);
    const existing = pickCanonicalBindingRow(bindingRows);
    const duplicateBindingCount = Math.max(0, bindingRows.length - 1);
    const patch = {
      userId,
      threadId,
      projectId,
      codexThreadId,
      codexHomePath,
      codexMcpProjectionVersion: version,
      codexMcpProjectionFingerprint: fingerprint,
      codexDynamicToolSurfaceVersion: dynamicToolSurfaceVersion || undefined,
      codexDynamicToolSurfaceFingerprint:
        dynamicToolSurfaceFingerprint || undefined,
      status: "active" as const,
      updatedAt: nowMs,
      lastRunId: normalizeString(args.runId, 240) || undefined,
      lastProviderSandboxId:
        normalizeString(args.providerSandboxId, 240) || undefined,
      lastProjectVolumeId:
        normalizeString(args.projectVolumeId, 240) || undefined,
      previousCodexThreadId:
        normalizeString(args.previousCodexThreadId, 240) || undefined,
      previousCodexMcpProjectionFingerprint:
        normalizeString(args.previousCodexMcpProjectionFingerprint, 240) ||
        undefined,
      previousCodexDynamicToolSurfaceFingerprint:
        normalizeString(
          args.previousCodexDynamicToolSurfaceFingerprint,
          240,
        ) || undefined,
      rotatedAt: args.lifecycleAction === "rotated" ? nowMs : undefined,
      rotatedReason:
        args.lifecycleAction === "rotated"
          ? normalizeString(args.rotatedReason, 240) || "rotation"
          : undefined,
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      const repairedDuplicateBindingCount = await rotateDuplicateBindingRows({
        ctx,
        rows: bindingRows,
        canonicalId: existing._id,
        nowMs,
      });
      return {
        ok: true,
        bindingKey,
        lifecycleAction: args.lifecycleAction,
        inserted: false,
        duplicateBindingCount,
        repairedDuplicateBindingCount,
      };
    }
    await ctx.db.insert("codexHarnessThreadBindings", {
      bindingKey,
      ...patch,
      createdAt: nowMs,
    });
    return {
      ok: true,
      bindingKey,
      lifecycleAction: args.lifecycleAction,
      inserted: true,
      duplicateBindingCount: 0,
      repairedDuplicateBindingCount: 0,
    };
  },
});

export const acquireCodexHarnessThreadBindingLockInternal = internalMutation({
  args: {
    bindingKey: v.string(),
    userId: v.string(),
    threadId: v.string(),
    projectId: v.string(),
    runId: v.string(),
    nowMs: v.optional(v.number()),
    ttlMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const bindingKey = normalizeString(args.bindingKey, 1_000);
    const userId = normalizeString(args.userId, 240);
    const threadId = normalizeString(args.threadId, 240);
    const projectId = normalizeString(args.projectId, 240);
    const runId = normalizeString(args.runId, 240);
    if (!bindingKey || !userId || !threadId || !projectId || !runId) {
      throw new Error("codex_harness_thread_binding_lock_required");
    }
    const nowMs = Number.isFinite(args.nowMs)
      ? Math.floor(args.nowMs as number)
      : Date.now();
    const expiresAt = nowMs + normalizeTtlMs(args.ttlMs);
    const existingRows = await ctx.db
      .query("codexHarnessThreadBindingLocks")
      .withIndex("by_bindingKey", (q) => q.eq("bindingKey", bindingKey))
      .take(20);
    const expiredRows = existingRows.filter((row: any) => Number(row.expiresAt ?? 0) <= nowMs);
    for (const row of expiredRows) {
      await ctx.db.delete(row._id);
    }
    const activeRows = existingRows.filter((row: any) => Number(row.expiresAt ?? 0) > nowMs);
    const activeOther = activeRows
      .sort((left: any, right: any) => Number(right.expiresAt ?? 0) - Number(left.expiresAt ?? 0))
      .find((row: any) => row.runId !== runId);
    const duplicateLockCount = Math.max(0, activeRows.length - 1);
    if (activeOther) {
      return {
        acquired: false,
        reason: "binding_locked",
        bindingKey,
        blockingRunId: activeOther.runId,
        expiresAt: activeOther.expiresAt,
        duplicateLockCount,
      };
    }
    const existing = activeRows
      .filter((row: any) => row.runId === runId)
      .sort((left: any, right: any) => Number(right.expiresAt ?? 0) - Number(left.expiresAt ?? 0))[0] ?? null;
    let repairedDuplicateLockCount = 0;
    for (const row of activeRows) {
      if (!existing || String(row._id) === String(existing._id)) continue;
      await ctx.db.delete(row._id);
      repairedDuplicateLockCount += 1;
    }
    const patch = {
      bindingKey,
      userId,
      threadId,
      projectId,
      runId,
      acquiredAt: nowMs,
      expiresAt,
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return {
        acquired: true,
        reason: existing.runId === runId ? "lock_reentered" : "expired_lock_replaced",
        bindingKey,
        blockingRunId: null,
        expiresAt,
        duplicateLockCount,
        repairedDuplicateLockCount,
      };
    }
    await ctx.db.insert("codexHarnessThreadBindingLocks", patch);
    return {
      acquired: true,
      reason: "lock_acquired",
      bindingKey,
      blockingRunId: null,
      expiresAt,
      duplicateLockCount: 0,
      repairedDuplicateLockCount: 0,
    };
  },
});

export const releaseCodexHarnessThreadBindingLockInternal = internalMutation({
  args: {
    bindingKey: v.string(),
    runId: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const bindingKey = normalizeString(args.bindingKey, 1_000);
    const runId = normalizeString(args.runId, 240);
    if (!bindingKey || !runId) {
      return { released: false, reason: "lock_key_required" };
    }
    const existingRows = await ctx.db
      .query("codexHarnessThreadBindingLocks")
      .withIndex("by_bindingKey", (q) => q.eq("bindingKey", bindingKey))
      .take(20);
    if (existingRows.length === 0) return { released: false, reason: "lock_missing" };
    const ownedRows = existingRows.filter((row: any) => row.runId === runId);
    if (ownedRows.length > 0) {
      for (const row of ownedRows) {
        await ctx.db.delete(row._id);
      }
      return {
        released: true,
        reason: "lock_released",
        duplicateLockCount: Math.max(0, existingRows.length - 1),
        releasedRowCount: ownedRows.length,
      };
    }
    const blocking = existingRows
      .sort((left: any, right: any) => Number(right.expiresAt ?? 0) - Number(left.expiresAt ?? 0))[0];
    if (blocking) {
      return {
        released: false,
        reason: "lock_owned_by_another_run",
        blockingRunId: blocking.runId,
        duplicateLockCount: Math.max(0, existingRows.length - 1),
      };
    }
    return { released: false, reason: "lock_missing" };
  },
});

export const cleanupExpiredCodexHarnessThreadBindingLocksInternal = internalMutation({
  args: {
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = Number.isFinite(args.nowMs)
      ? Math.floor(args.nowMs as number)
      : Date.now();
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 25)));
    const expired = await ctx.db
      .query("codexHarnessThreadBindingLocks")
      .withIndex("by_expiresAt", (q) => q.lte("expiresAt", nowMs))
      .take(limit);
    for (const lock of expired) {
      await ctx.db.delete(lock._id);
    }
    return { ok: true, deleted: expired.length };
  },
});
