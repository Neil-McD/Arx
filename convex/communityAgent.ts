import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityAgentDraftLike,
  requireCommunityChatAccess,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";

function normalizeSystemPrompt(raw: unknown): string {
  const prompt = String(raw ?? "").trim();
  return prompt.slice(0, 40_000);
}

function mapCommunityAgentConfigRow(row: CommunityAgentDraftLike) {
  return {
    id: String(row._id),
    community_id: String(row.communityId),
    landing_json: row.landingJson ?? null,
    system_prompt: row.systemPrompt,
    updated_at: toIsoString(row.updatedAt),
  };
}

async function listCommunityAgentRows(ctx: any, communityId: any): Promise<CommunityAgentDraftLike[]> {
  return (await ctx.db
    .query("communityAgentDrafts" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .collect()) as CommunityAgentDraftLike[];
}

function selectCanonicalCommunityAgentRow(rows: CommunityAgentDraftLike[]): CommunityAgentDraftLike | null {
  if (rows.length === 0) return null;
  const active = rows.find((row) => Boolean(row.isActive));
  if (active) return active;
  return rows
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt || a.updatedAt - b.updatedAt)[0] ?? null;
}

export const getCommunityAgentConfig = query({
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
    await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    const row = selectCanonicalCommunityAgentRow(await listCommunityAgentRows(ctx, args.communityId));
    return row ? mapCommunityAgentConfigRow(row) : null;
  },
});

export const saveCommunityAgentConfig = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
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
    await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    const nextSystemPrompt = normalizeSystemPrompt(args.systemPrompt);
    const rows = await listCommunityAgentRows(ctx, args.communityId);
    const existing = selectCanonicalCommunityAgentRow(rows);

    if (existing) {
      await ctx.db.patch(existing._id as any, {
        landingJson: args.landingJson ?? null,
        systemPrompt: nextSystemPrompt,
        slot: 1,
        isActive: true,
        updatedAt: nowMs,
      });
      for (const row of rows) {
        if (row._id === existing._id) continue;
        await ctx.db.delete(row._id as any);
      }
      const updated = (await ctx.db.get(existing._id as any)) as CommunityAgentDraftLike | null;
      if (!updated) throw new Error("community_agent_draft_not_found");
      return mapCommunityAgentConfigRow(updated);
    }

    const id = await ctx.db.insert("communityAgentDrafts" as any, {
      communityId: args.communityId,
      slot: 1,
      name: undefined,
      landingJson: args.landingJson ?? null,
      systemPrompt: nextSystemPrompt,
      isActive: true,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id as any)) as CommunityAgentDraftLike | null;
    if (!created) throw new Error("community_agent_config_create_failed");
    return mapCommunityAgentConfigRow(created);
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
    const active = selectCanonicalCommunityAgentRow(await listCommunityAgentRows(ctx, args.communityId));
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
    const active = selectCanonicalCommunityAgentRow(await listCommunityAgentRows(ctx, args.communityId));
    if (!active) return null;
    return mapCommunityAgentConfigRow(active);
  },
});
