import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";

function toIso(value: number): string {
  return new Date(value).toISOString();
}

function normalizeScopeId(scopeId: string | undefined): string | null {
  const normalized = String(scopeId ?? "").trim();
  return normalized || null;
}

function mapMemoryRow(row: {
  _id: string;
  content: string;
  scope: "global" | "workspace";
  scopeId?: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}) {
  return {
    id: String(row._id),
    content: row.content,
    scope: row.scope,
    scope_id: row.scopeId ?? null,
    pinned: Boolean(row.pinned),
    created_at: toIso(row.createdAt),
    updated_at: toIso(row.updatedAt),
  };
}

export const listPersonalMemoryItems = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    scope: v.optional(v.union(v.literal("global"), v.literal("workspace"))),
    scopeId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const limit = Math.max(1, Math.min(1000, Number(args.limit ?? 200)));
    const scope = args.scope;
    const scopeId = normalizeScopeId(args.scopeId);

    const rows = scope
      ? await ctx.db
          .query("personalMemoryItems")
          .withIndex("by_user_scope", (q) => q.eq("userId", userId).eq("scope", scope))
          .collect()
      : await ctx.db
          .query("personalMemoryItems")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect();

    const filtered = rows.filter((row) => {
      if (scope !== "workspace") return true;
      return normalizeScopeId(row.scopeId) === scopeId;
    });

    filtered.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
      return b.createdAt - a.createdAt;
    });

    return filtered.slice(0, limit).map(mapMemoryRow);
  },
});

export const createPersonalMemoryItem = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    content: v.string(),
    scope: v.union(v.literal("global"), v.literal("workspace")),
    scopeId: v.optional(v.string()),
    pinned: v.boolean(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const id = await ctx.db.insert("personalMemoryItems", {
      userId,
      content: String(args.content ?? "").trim(),
      scope: args.scope,
      scopeId: normalizeScopeId(args.scopeId) ?? undefined,
      pinned: Boolean(args.pinned),
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const row = await ctx.db.get(id);
    if (!row) throw new Error("personal_memory_item_missing_after_insert");
    return mapMemoryRow(row as any);
  },
});

export const updatePersonalMemoryItemPinned = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    id: v.id("personalMemoryItems"),
    pinned: v.boolean(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("personal_memory_item_not_found");
    if (String((row as any).userId) !== String(userId)) {
      throw new Error("personal_memory_item_access_denied");
    }
    const nowMs = args.nowMs ?? Date.now();
    await ctx.db.patch(args.id, {
      pinned: Boolean(args.pinned),
      updatedAt: nowMs,
    });
    const updated = await ctx.db.get(args.id);
    if (!updated) throw new Error("personal_memory_item_not_found");
    return mapMemoryRow(updated as any);
  },
});

export const deletePersonalMemoryItem = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    id: v.id("personalMemoryItems"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const row = await ctx.db.get(args.id);
    if (!row) return { ok: true };
    if (String((row as any).userId) !== String(userId)) {
      throw new Error("personal_memory_item_access_denied");
    }
    await ctx.db.delete(args.id);
    return { ok: true };
  },
});
