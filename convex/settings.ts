import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";

function normalizeAgentSoul(raw: unknown): string {
  return String(raw ?? "").trim().slice(0, 40_000);
}

function normalizeAgentName(raw: unknown): string {
  return String(raw ?? "").trim().slice(0, 80);
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
      agent_name: row.agentName ?? "",
      agent_soul: row.agentSoul ?? "",
      created_at: firstIsoOrNull(row.createdAt),
      updated_at: firstIsoOrNull(row.updatedAt),
    };
  },
});

export const getUserAgentSoulInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("userMemorySettings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    return {
      agent_name: row?.agentName ?? "",
      agent_soul: row?.agentSoul ?? "",
    };
  },
});

export const saveUserMemorySettings = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    memoryMode: v.union(v.literal("off"), v.literal("suggest"), v.literal("auto")),
    rememberIntentEnabled: v.boolean(),
    agentName: v.optional(v.string()),
    agentSoul: v.optional(v.string()),
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
    const nextAgentSoul =
      args.agentSoul === undefined
        ? existing?.agentSoul ?? ""
        : normalizeAgentSoul(args.agentSoul);
    const nextAgentName =
      args.agentName === undefined
        ? existing?.agentName ?? ""
        : normalizeAgentName(args.agentName);

    if (!existing) {
      const id = await ctx.db.insert("userMemorySettings", {
        userId,
        memoryMode: args.memoryMode,
        rememberIntentEnabled: args.rememberIntentEnabled,
        agentName: nextAgentName,
        agentSoul: nextAgentSoul,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      return {
        id,
        memory_mode: args.memoryMode,
        remember_intent_enabled: args.rememberIntentEnabled,
        agent_name: nextAgentName,
        agent_soul: nextAgentSoul,
      };
    }

    await ctx.db.patch(existing._id, {
      memoryMode: args.memoryMode,
      rememberIntentEnabled: args.rememberIntentEnabled,
      agentName: nextAgentName,
      agentSoul: nextAgentSoul,
      updatedAt: nowMs,
    });

    return {
      id: existing._id,
      memory_mode: args.memoryMode,
      remember_intent_enabled: args.rememberIntentEnabled,
      agent_name: nextAgentName,
      agent_soul: nextAgentSoul,
    };
  },
});
