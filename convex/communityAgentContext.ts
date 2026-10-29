export type CanonicalCommunityAgentContext = {
  communityId: any;
  communityName: string | null;
  communitySlug: string | null;
  communityOneLiner: string | null;
  communityAbout: string | null;
  ownerUserId: any | null;
  agentEnabled: boolean;
  agentDisplayName: string;
  communitySystemPrompt: string | null;
};

function boundedText(raw: unknown, maxLength: number): string {
  return String(raw ?? "").trim().slice(0, maxLength);
}

export function resolveCommunityAgentDisplayName(args: {
  configuredDisplayName?: unknown;
  communityName?: unknown;
}): string {
  return boundedText(args.configuredDisplayName, 120) ||
    boundedText(args.communityName, 120) ||
    "Community agent";
}

export async function readCanonicalCommunityAgentContext(
  ctx: any,
  communityId: any,
): Promise<CanonicalCommunityAgentContext | null> {
  const community = (await ctx.db.get(communityId)) as Record<string, any> | null;
  if (!community) return null;

  const config = (await ctx.db
    .query("communityAgentConfigs" as any)
    .withIndex("by_community_updatedAt", (q: any) => q.eq("communityId", communityId))
    .order("desc")
    .first()) as Record<string, any> | null;

  return {
    communityId,
    communityName: boundedText(community.name, 200) || null,
    communitySlug: boundedText(community.slug, 200) || null,
    communityOneLiner: boundedText(community.oneLiner, 500) || null,
    communityAbout: boundedText(community.about, 4_000) || null,
    ownerUserId: community.ownerId ?? null,
    agentEnabled: config?.agentEnabled !== false,
    agentDisplayName: resolveCommunityAgentDisplayName({
      configuredDisplayName: config?.agentDisplayName,
      communityName: community.name,
    }),
    communitySystemPrompt: boundedText(config?.systemPrompt, 40_000) || null,
  };
}

// The agent's name and photo as members see them (Settings > Agent > Profile):
// the owner's name, else the community's; the owner's photo, else the
// community's icon (community_avatar_url), else none.
export async function readCommunityAgentProfile(ctx: any, communityId: any) {
  const community = (await ctx.db.get(communityId)) as Record<string, any> | null;
  if (!community) return null;
  const config = (await ctx.db
    .query("communityAgentConfigs" as any)
    .withIndex("by_community_updatedAt", (q: any) => q.eq("communityId", communityId))
    .order("desc")
    .first()) as Record<string, any> | null;
  const customName = boundedText(config?.agentDisplayName, 120) || null;
  const uploaded = config?.agentAvatarStorageId ? await ctx.storage.getUrl(config.agentAvatarStorageId) : null;
  const communityIcon = community.avatarStorageId
    ? await ctx.storage.getUrl(community.avatarStorageId)
    : boundedText(community.avatarUrl, 50_000) || null;
  return {
    community_id: String(communityId),
    name: resolveCommunityAgentDisplayName({ configuredDisplayName: customName, communityName: community.name }),
    custom_name: customName,
    // null: the agent wears the community's icon.
    avatar_url: uploaded ?? (boundedText(config?.agentAvatarUrl, 2_000) || null),
    avatar_storage_id: config?.agentAvatarStorageId ? String(config.agentAvatarStorageId) : null,
    community_avatar_url: communityIcon,
  };
}
