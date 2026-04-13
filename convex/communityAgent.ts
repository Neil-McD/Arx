import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  normalizeCommunityAgentAppsForSave,
  normalizeCommunityAgentSkillsForSave,
} from "../shared/communityAgentCapabilities";
import {
  type CommunityAgentConfigLike,
  requireCommunityChatAccess,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";

function normalizeSystemPrompt(raw: unknown): string {
  const prompt = String(raw ?? "").trim();
  return prompt.slice(0, 40_000);
}

function mapCommunityAgentConfigRow(row: CommunityAgentConfigLike) {
  return {
    id: String(row._id),
    community_id: String(row.communityId),
    landing_json: row.landingJson ?? null,
    system_prompt: row.systemPrompt,
    skills_json: normalizeCommunityAgentSkillsForSave(row.skillsJson),
    apps_json: normalizeCommunityAgentAppsForSave(row.appsJson),
    updated_at: toIsoString(row.updatedAt),
  };
}

async function listCommunityAgentConfigRows(ctx: any, communityId: any): Promise<CommunityAgentConfigLike[]> {
  return (await ctx.db
    .query("communityAgentConfigs" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .collect()) as CommunityAgentConfigLike[];
}

function selectPrimaryCommunityAgentConfigRow(
  rows: CommunityAgentConfigLike[],
): CommunityAgentConfigLike | null {
  if (rows.length === 0) return null;
  return rows
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)[0] ?? null;
}

async function pruneCommunityAgentConfigRows(
  ctx: any,
  rows: CommunityAgentConfigLike[],
  keepId: any,
): Promise<void> {
  for (const row of rows) {
    if (String(row._id) === String(keepId)) continue;
    await ctx.db.delete(row._id as any);
  }
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
    const row = selectPrimaryCommunityAgentConfigRow(await listCommunityAgentConfigRows(ctx, args.communityId));
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
    skillsJson: v.optional(v.any()),
    appsJson: v.optional(v.any()),
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
    const nextSkills = normalizeCommunityAgentSkillsForSave(args.skillsJson);
    const nextApps = normalizeCommunityAgentAppsForSave(args.appsJson);
    const rows = await listCommunityAgentConfigRows(ctx, args.communityId);
    const existing = selectPrimaryCommunityAgentConfigRow(rows);

    if (existing) {
      await ctx.db.patch(existing._id as any, {
        landingJson: args.landingJson ?? null,
        systemPrompt: nextSystemPrompt,
        skillsJson: nextSkills,
        appsJson: nextApps,
        updatedAt: nowMs,
      });
      await pruneCommunityAgentConfigRows(ctx, rows, existing._id);
      const updated = (await ctx.db.get(existing._id as any)) as CommunityAgentConfigLike | null;
      if (!updated) throw new Error("community_agent_config_not_found");
      return mapCommunityAgentConfigRow(updated);
    }

    const id = await ctx.db.insert("communityAgentConfigs" as any, {
      communityId: args.communityId,
      landingJson: args.landingJson ?? null,
      systemPrompt: nextSystemPrompt,
      skillsJson: nextSkills,
      appsJson: nextApps,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id as any)) as CommunityAgentConfigLike | null;
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
    const config = selectPrimaryCommunityAgentConfigRow(await listCommunityAgentConfigRows(ctx, args.communityId));
    if (!config) return null;
    return {
      system_prompt: config.systemPrompt,
    };
  },
});

export const resolveRuntimeCommunityPromptContextInternal = internalQuery({
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
    const { community } = await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const config = selectPrimaryCommunityAgentConfigRow(await listCommunityAgentConfigRows(ctx, args.communityId));
    const communityName = String(community.name ?? "").trim() || String(community.slug ?? "").trim() || null;
    const communitySlug = String(community.slug ?? "").trim() || null;
    const communityOneLiner = String(community.oneLiner ?? "").trim() || null;
    const communityAbout = String(community.about ?? "").trim() || null;
    return {
      community_id: String(args.communityId),
      community_name: communityName,
      community_slug: communitySlug,
      community_one_liner: communityOneLiner,
      community_about: communityAbout,
      system_prompt: config?.systemPrompt ?? null,
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
    const config = selectPrimaryCommunityAgentConfigRow(await listCommunityAgentConfigRows(ctx, args.communityId));
    if (!config) return null;
    return mapCommunityAgentConfigRow(config);
  },
});
