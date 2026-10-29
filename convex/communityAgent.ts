import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { resolveCommunityChannelActor } from "./communityChannelAccess";
import { listAuthorizedCommunityChannelPage } from "./communityChannelCore";
import {
  resolveAuthenticatedActorByTrustedSubject,
} from "./authActor";
import {
  type CommunityAgentConfigLike,
  getCommunityAndMembership,
  requireCommunityManager,
  resolveCommunityAccessBundle,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import { normalizeCommunityLensAuthority } from "../shared/communityLensAuthority";
import { readCommunityAgentProfile } from "./communityAgentContext";

function normalizeCommunitySystemPrompt(raw: unknown): string {
  const prompt = String(raw ?? "").trim();
  return prompt.slice(0, 40_000);
}

function mapCommunityAgentConfigRow(row: CommunityAgentConfigLike) {
  return {
    id: String(row._id),
    community_id: String(row.communityId),
    landing_json: row.landingJson ?? null,
    community_system_prompt: row.systemPrompt,
    system_prompt: row.systemPrompt,
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

async function resolveRuntimeCommunityPromptContextForUser(args: {
  ctx: any;
  userId: any;
  communityId: any;
}) {
  const { community, membership } = await getCommunityAndMembership({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
  });
  const access = await resolveCommunityAccessBundle({
    ctx: args.ctx,
    community,
    membership,
    userId: args.userId,
  });
  const communityLensAuthority = normalizeCommunityLensAuthority({
    relation: access.relation,
    effective_role: access.effective_role,
    can_manage_members: access.can_manage_members,
    can_manage_resources: access.can_manage_resources,
    can_moderate_content: access.can_moderate_content,
    can_review_join_requests: access.can_review_join_requests,
  });
  if (!access.can_enter_community || !communityLensAuthority) {
    throw new Error("community_entitlement_required");
  }
  const config = selectPrimaryCommunityAgentConfigRow(
    await listCommunityAgentConfigRows(args.ctx, args.communityId),
  );
  const communityName = String(community.name ?? "").trim() || String(community.slug ?? "").trim() || null;
  const communitySlug = String(community.slug ?? "").trim() || null;
  const communityOneLiner = String(community.oneLiner ?? "").trim() || null;
  const communityAbout = String(community.about ?? "").trim() || null;
  // The member's map: shared channels they can read (private rooms stay discoverable via channels/).
  let communityChannels: Array<{ slug: string; name: string }> = [];
  try {
    const actor = await resolveCommunityChannelActor({ ctx: args.ctx, communityId: args.communityId, userId: args.userId });
    const page = await listAuthorizedCommunityChannelPage({
      ctx: args.ctx, communityId: args.communityId, actor, section: "shared",
      paginationOpts: { cursor: null, numItems: 20 },
    });
    communityChannels = page.page
      .map((channel: any) => ({ slug: String(channel.slug ?? "").trim(), name: String(channel.name ?? "").trim() }))
      .filter((channel) => channel.slug);
  } catch {
    // The map is a shortcut; the agent can still list channels/.
  }
  return {
    community_id: String(args.communityId),
    community_name: communityName,
    community_slug: communitySlug,
    community_one_liner: communityOneLiner,
    community_about: communityAbout,
    community_channels: communityChannels,
    community_system_prompt: config?.systemPrompt ?? null,
    community_lens_authority: communityLensAuthority,
    system_prompt: config?.systemPrompt ?? null,
  };
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
    communitySystemPrompt: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
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
    const nextCommunitySystemPrompt = normalizeCommunitySystemPrompt(
      args.communitySystemPrompt ?? args.systemPrompt,
    );
    const rows = await listCommunityAgentConfigRows(ctx, args.communityId);
    const existing = selectPrimaryCommunityAgentConfigRow(rows);

    if (existing) {
      await ctx.db.patch(existing._id as any, {
        landingJson: args.landingJson ?? null,
        systemPrompt: nextCommunitySystemPrompt,
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
      systemPrompt: nextCommunitySystemPrompt,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id as any)) as CommunityAgentConfigLike | null;
    if (!created) throw new Error("community_agent_config_create_failed");
    return mapCommunityAgentConfigRow(created);
  },
});

const AGENT_NAME_MAX = 60;

function normalizeAgentName(raw: unknown): string | undefined {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!name) return undefined;
  if (name.length > AGENT_NAME_MAX) throw new Error("community_agent_name_too_long");
  return name;
}

function normalizeAgentAvatarUrl(raw: unknown): string | undefined {
  const url = String(raw ?? "").trim();
  if (!url) return undefined;
  if (!/^https:\/\/\S+$/i.test(url) || url.length > 2_000) throw new Error("community_agent_avatar_url_invalid");
  return url;
}

// The agent's name and photo, shown wherever it appears. Public, like the
// community's own name and icon.
export const getCommunityAgentProfile = query({
  args: { communityId: v.id("communities") },
  handler: async (ctx, args) => readCommunityAgentProfile(ctx, args.communityId),
});

// Settings > Agent > Profile, and community.agent.profile.save for agents.
// Leave a field out to keep it; null puts the community's name or icon back.
export const saveCommunityAgentProfile = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    displayName: v.optional(v.union(v.string(), v.null())),
    avatarStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    avatarUrl: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    if (args.avatarStorageId && args.avatarUrl) throw new Error("community_agent_avatar_ambiguous");
    const nowMs = args.nowMs ?? Date.now();
    const patch: Record<string, unknown> = { updatedAt: nowMs };
    if (args.displayName !== undefined) patch.agentDisplayName = normalizeAgentName(args.displayName);
    if (args.avatarStorageId !== undefined || args.avatarUrl !== undefined) {
      // One photo at a time: setting either replaces the other.
      patch.agentAvatarStorageId = args.avatarStorageId ?? undefined;
      patch.agentAvatarUrl = normalizeAgentAvatarUrl(args.avatarUrl);
    }
    const rows = await listCommunityAgentConfigRows(ctx, args.communityId);
    const existing = selectPrimaryCommunityAgentConfigRow(rows) as (CommunityAgentConfigLike & { agentAvatarStorageId?: any }) | null;
    if (existing) {
      const previousStorageId = existing.agentAvatarStorageId;
      await ctx.db.patch(existing._id as any, patch);
      await pruneCommunityAgentConfigRows(ctx, rows, existing._id);
      if (previousStorageId && "agentAvatarStorageId" in patch && String(patch.agentAvatarStorageId ?? "") !== String(previousStorageId)) {
        await ctx.storage.delete(previousStorageId);
      }
    } else {
      await ctx.db.insert("communityAgentConfigs" as any, {
        communityId: args.communityId, landingJson: null, systemPrompt: "", createdAt: nowMs, ...patch,
      });
    }
    return readCommunityAgentProfile(ctx, args.communityId);
  },
});

export const resolveRuntimeCommunityPromptContextInternal = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.string(),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActorByTrustedSubject({
      ctx,
      authSubject: args.authSubject,
      userId: args.userId,
    });
    return await resolveRuntimeCommunityPromptContextForUser({
      ctx,
      communityId: args.communityId,
      userId: actor.dbUserId,
    });
  },
});

