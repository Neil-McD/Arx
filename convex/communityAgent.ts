import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityAgentDraftLike,
  requireCommunityChatAccess,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";

function normalizeDraftSlot(raw: unknown): number {
  const slot = Math.max(1, Math.min(3, Math.floor(Number(raw))));
  if (!Number.isFinite(slot)) return 1;
  return slot;
}

function normalizeSystemPrompt(raw: unknown): string {
  const prompt = String(raw ?? "").trim();
  return prompt.slice(0, 40_000);
}

function normalizeOptionalName(raw: unknown): string | undefined {
  const name = String(raw ?? "").trim();
  if (!name) return undefined;
  return name.slice(0, 120);
}

function mapCommunityAgentDraftRow(row: CommunityAgentDraftLike) {
  return {
    id: String(row._id),
    community_id: String(row.communityId),
    slot: Math.max(1, Math.floor(row.slot)),
    name: row.name ?? null,
    landing_json: row.landingJson ?? null,
    system_prompt: row.systemPrompt,
    is_active: Boolean(row.isActive),
    updated_at: toIsoString(row.updatedAt),
  };
}

export const listCommunityAgentDrafts = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const rows = (await ctx.db
      .query("communityAgentDrafts" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityAgentDraftLike[];
    return rows
      .slice()
      .sort((a, b) => Math.floor(a.slot) - Math.floor(b.slot))
      .map((row) => mapCommunityAgentDraftRow(row));
  },
});

export const upsertCommunityAgentDraft = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    slot: v.number(),
    name: v.optional(v.union(v.string(), v.null())),
    landingJson: v.optional(v.any()),
    systemPrompt: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = args.nowMs ?? Date.now();
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const slot = normalizeDraftSlot(args.slot);
    const nextName = normalizeOptionalName(args.name);
    const nextSystemPrompt = normalizeSystemPrompt(args.systemPrompt);
    const existing = (await ctx.db
      .query("communityAgentDrafts" as any)
      .withIndex("by_community_slot", (q: any) => q.eq("communityId", args.communityId).eq("slot", slot))
      .first()) as CommunityAgentDraftLike | null;

    if (existing) {
      await ctx.db.patch(existing._id as any, {
        name: nextName,
        landingJson: args.landingJson ?? null,
        systemPrompt: nextSystemPrompt,
        updatedAt: nowMs,
      });
      const updated = (await ctx.db.get(existing._id as any)) as CommunityAgentDraftLike | null;
      if (!updated) throw new Error("community_agent_draft_not_found");
      return mapCommunityAgentDraftRow(updated);
    }

    const id = await ctx.db.insert("communityAgentDrafts" as any, {
      communityId: args.communityId,
      slot,
      name: nextName,
      landingJson: args.landingJson ?? null,
      systemPrompt: nextSystemPrompt,
      isActive: false,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id as any)) as CommunityAgentDraftLike | null;
    if (!created) throw new Error("community_agent_draft_create_failed");
    return mapCommunityAgentDraftRow(created);
  },
});

export const setActiveCommunityAgentDraft = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    slot: v.number(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = args.nowMs ?? Date.now();
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const slot = normalizeDraftSlot(args.slot);
    const rows = (await ctx.db
      .query("communityAgentDrafts" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityAgentDraftLike[];
    const target = rows.find((row) => Math.floor(row.slot) === slot) ?? null;
    if (!target) throw new Error("community_agent_draft_not_found");

    for (const row of rows) {
      const nextIsActive = row._id === target._id;
      if (Boolean(row.isActive) === nextIsActive) continue;
      await ctx.db.patch(row._id as any, {
        isActive: nextIsActive,
        updatedAt: nowMs,
      });
    }
    return { ok: true };
  },
});

export const getActiveCommunityAgentSystemPrompt = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const active = (await ctx.db
      .query("communityAgentDrafts" as any)
      .withIndex("by_community_active", (q: any) => q.eq("communityId", args.communityId).eq("isActive", true))
      .first()) as CommunityAgentDraftLike | null;
    if (!active) return null;
    return {
      system_prompt: active.systemPrompt,
      draft_id: String(active._id),
    };
  },
});

export const getActiveCommunityAgentLanding = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const active = (await ctx.db
      .query("communityAgentDrafts" as any)
      .withIndex("by_community_active", (q: any) => q.eq("communityId", args.communityId).eq("isActive", true))
      .first()) as CommunityAgentDraftLike | null;
    if (!active) return null;
    return mapCommunityAgentDraftRow(active);
  },
});
