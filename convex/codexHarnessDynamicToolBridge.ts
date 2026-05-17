import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function normalizeToolNames(value: readonly string[]): string[] {
  const out: string[] = [];
  for (const entry of value) {
    const toolName = String(entry ?? "").trim();
    if (!toolName || out.includes(toolName)) continue;
    out.push(toolName);
  }
  return out;
}

export async function hashCodexHarnessBridgeToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(String(token ?? ""));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export const createCodexHarnessBridgeSessionInternal = internalMutation({
  args: {
    bridgeSessionId: v.string(),
    tokenHash: v.string(),
    userId: v.string(),
    authSubject: v.optional(v.string()),
    runId: v.string(),
    threadId: v.optional(v.string()),
    projectId: v.optional(v.string()),
    communityId: v.optional(v.string()),
    allowedToolNames: v.array(v.string()),
    expiresAt: v.number(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const bridgeSessionId = normalizeOptionalString(args.bridgeSessionId);
    const tokenHash = normalizeOptionalString(args.tokenHash);
    const userId = normalizeOptionalString(args.userId);
    const runId = normalizeOptionalString(args.runId);
    if (!bridgeSessionId) throw new Error("codex_bridge_session_id_required");
    if (!tokenHash) throw new Error("codex_bridge_token_hash_required");
    if (!userId) throw new Error("codex_bridge_user_required");
    if (!runId) throw new Error("codex_bridge_run_required");

    const nowMs = Number.isFinite(args.nowMs) ? Math.floor(args.nowMs as number) : Date.now();
    const expiresAt = Math.max(nowMs + 1000, Math.floor(args.expiresAt));
    const allowedToolNames = normalizeToolNames(args.allowedToolNames);
    if (allowedToolNames.length === 0) {
      throw new Error("codex_bridge_allowed_tool_required");
    }

    const existing = await ctx.db
      .query("codexHarnessBridgeSessions")
      .withIndex("by_bridgeSessionId", (q) => q.eq("bridgeSessionId", bridgeSessionId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        tokenHash,
        userId,
        authSubject: normalizeOptionalString(args.authSubject),
        runId,
        threadId: normalizeOptionalString(args.threadId),
        projectId: normalizeOptionalString(args.projectId),
        communityId: normalizeOptionalString(args.communityId),
        allowedToolNames,
        expiresAt,
        revokedAt: undefined,
        revokedReason: undefined,
        createdAt: nowMs,
      });
      return { ok: true, bridgeSessionId };
    }

    await ctx.db.insert("codexHarnessBridgeSessions", {
      bridgeSessionId,
      tokenHash,
      userId,
      authSubject: normalizeOptionalString(args.authSubject),
      runId,
      threadId: normalizeOptionalString(args.threadId),
      projectId: normalizeOptionalString(args.projectId),
      communityId: normalizeOptionalString(args.communityId),
      allowedToolNames,
      expiresAt,
      createdAt: nowMs,
    });
    return { ok: true, bridgeSessionId };
  },
});

function buildAuditContext(session: {
  userId?: unknown;
  threadId?: unknown;
  runId?: unknown;
  communityId?: unknown;
} | null): Record<string, unknown> {
  return {
    userId: normalizeOptionalString(session?.userId),
    threadId: normalizeOptionalString(session?.threadId),
    runId: normalizeOptionalString(session?.runId),
    communityId: normalizeOptionalString(session?.communityId),
  };
}

export const resolveCodexHarnessBridgeSessionForCallInternal = internalMutation({
  args: {
    bridgeSessionId: v.string(),
    tokenHash: v.string(),
    runId: v.string(),
    toolName: v.string(),
    callId: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const bridgeSessionId = normalizeOptionalString(args.bridgeSessionId);
    const tokenHash = normalizeOptionalString(args.tokenHash);
    const runId = normalizeOptionalString(args.runId);
    const toolName = normalizeOptionalString(args.toolName);
    if (!bridgeSessionId || !tokenHash || !runId || !toolName) {
      return {
        ok: false,
        status: 401,
        code: "codex_bridge_auth_required",
        message: "Codex dynamic tool bridge authentication is required.",
      };
    }

    const session = await ctx.db
      .query("codexHarnessBridgeSessions")
      .withIndex("by_bridgeSessionId", (q) => q.eq("bridgeSessionId", bridgeSessionId))
      .first();
    const nowMs = Number.isFinite(args.nowMs) ? Math.floor(args.nowMs as number) : Date.now();
    if (!session || session.tokenHash !== tokenHash || session.runId !== runId) {
      return {
        ok: false,
        status: 401,
        code: "codex_bridge_auth_invalid",
        message: "Codex dynamic tool bridge authentication failed.",
        ...buildAuditContext(session),
      };
    }
    if (session.revokedAt || nowMs >= session.expiresAt) {
      return {
        ok: false,
        status: 401,
        code: "codex_bridge_session_expired",
        message: "Codex dynamic tool bridge session expired.",
        ...buildAuditContext(session),
      };
    }
    if (!session.allowedToolNames.includes(toolName)) {
      return {
        ok: false,
        status: 403,
        code: "codex_bridge_tool_not_enabled",
        message: "This tool is not enabled for the active Codex run.",
        ...buildAuditContext(session),
      };
    }

    await ctx.db.patch(session._id, {
      lastUsedAt: nowMs,
      lastToolName: toolName,
      lastCallId: normalizeOptionalString(args.callId),
    });
    return {
      ok: true,
      userId: session.userId,
      authSubject: session.authSubject ?? null,
      runId: session.runId,
      threadId: session.threadId ?? null,
      projectId: session.projectId ?? null,
      communityId: session.communityId ?? null,
      allowedToolNames: session.allowedToolNames,
      expiresAt: session.expiresAt,
    };
  },
});

export const revokeCodexHarnessBridgeSessionInternal = internalMutation({
  args: {
    bridgeSessionId: v.string(),
    revokedReason: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const bridgeSessionId = normalizeOptionalString(args.bridgeSessionId);
    if (!bridgeSessionId) return { ok: false, code: "codex_bridge_session_id_required" };
    const session = await ctx.db
      .query("codexHarnessBridgeSessions")
      .withIndex("by_bridgeSessionId", (q) => q.eq("bridgeSessionId", bridgeSessionId))
      .first();
    if (!session) return { ok: true, revoked: false };
    const nowMs = Number.isFinite(args.nowMs) ? Math.floor(args.nowMs as number) : Date.now();
    await ctx.db.patch(session._id, {
      revokedAt: session.revokedAt ?? nowMs,
      revokedReason: normalizeOptionalString(args.revokedReason) ?? "codex_turn_finished",
    });
    return { ok: true, revoked: true };
  },
});

export const cleanupExpiredCodexHarnessBridgeSessionsInternal = internalMutation({
  args: {
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = Number.isFinite(args.nowMs) ? Math.floor(args.nowMs as number) : Date.now();
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 25)));
    const expired = await ctx.db
      .query("codexHarnessBridgeSessions")
      .withIndex("by_expiresAt", (q) => q.lte("expiresAt", nowMs))
      .take(limit);
    for (const session of expired) {
      await ctx.db.delete(session._id);
    }
    return { ok: true, deleted: expired.length };
  },
});
