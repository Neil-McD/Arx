import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { resolveAuthenticatedSubject } from "./authIdentity";

function normalizeIdValue(raw: unknown): string {
  return String(raw ?? "").trim();
}

async function resolveUserIdForAuthenticatedRequest(args: {
  ctx: any;
  userId?: any;
  authSubject?: string | null;
}): Promise<any> {
  const userIdInput = normalizeIdValue(args.userId);
  const authSubject = await resolveAuthenticatedSubject({
    ctx: args.ctx,
    authSubject: args.authSubject ?? null,
  });
  const user = await args.ctx.db
    .query("users")
    .withIndex("by_authSubject", (q: any) => q.eq("authSubject", authSubject))
    .first();
  if (!user) throw new Error("user_not_found");
  const resolvedUserId = normalizeIdValue(user._id);
  if (userIdInput && userIdInput !== resolvedUserId) {
    throw new Error("user_id_mismatch");
  }
  return user._id;
}

function firstIsoOrNull(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value).toISOString();
}

export const getUserMemorySettings = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const row = await ctx.db
      .query("userMemorySettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!row) return null;
    return {
      memory_mode: row.memoryMode,
      remember_intent_enabled: row.rememberIntentEnabled,
      created_at: firstIsoOrNull(row.createdAt),
      updated_at: firstIsoOrNull(row.updatedAt),
    };
  },
});

export const saveUserMemorySettings = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    memoryMode: v.union(v.literal("off"), v.literal("suggest"), v.literal("auto")),
    rememberIntentEnabled: v.boolean(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const existing = await ctx.db
      .query("userMemorySettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (!existing) {
      const id = await ctx.db.insert("userMemorySettings", {
        userId,
        memoryMode: args.memoryMode,
        rememberIntentEnabled: args.rememberIntentEnabled,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      return {
        id,
        memory_mode: args.memoryMode,
        remember_intent_enabled: args.rememberIntentEnabled,
      };
    }

    await ctx.db.patch(existing._id, {
      memoryMode: args.memoryMode,
      rememberIntentEnabled: args.rememberIntentEnabled,
      updatedAt: nowMs,
    });

    return {
      id: existing._id,
      memory_mode: args.memoryMode,
      remember_intent_enabled: args.rememberIntentEnabled,
    };
  },
});
