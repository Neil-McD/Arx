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
    agentDisplayName: boundedText(config?.agentDisplayName, 120) || "Polynet",
    communitySystemPrompt: boundedText(config?.systemPrompt, 40_000) || null,
  };
}
