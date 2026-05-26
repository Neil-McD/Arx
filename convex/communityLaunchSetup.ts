import { query } from "./_generated/server";
import { v } from "convex/values";
import {
  buildCommunityLaunchSetupStatus,
} from "../shared/communityLaunchSetup";
import {
  type CommunityAgentConfigLike,
  type CommunityLike,
  type CommunityPricePointLike,
  type CommunityResourceModuleLike,
  type CommunityResourceLike,
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
  requireCommunityManager,
  resolveCommunityEntryPolicy,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";

function hasAgentConfig(row: CommunityAgentConfigLike | null): boolean {
  if (!row) return false;
  const systemPrompt = String(row.systemPrompt ?? "").trim();
  if (systemPrompt) return true;
  return row.landingJson !== null && row.landingJson !== undefined;
}

function hasUsablePaidAccessConfig(rows: CommunityPricePointLike[]): boolean {
  return rows.some((row) => Boolean(row.isCurrent) && typeof row.archivedAt !== "number");
}

async function getKnowledgeResourceProgress(ctx: any, communityId: any): Promise<{
  hasKnowledgeMaterial: boolean;
  hasLiveKnowledge: boolean;
}> {
  const [modules, recentResources] = await Promise.all([
    ctx.db
      .query("communityResourceModules" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
      .take(250),
    ctx.db
      .query("communityResources" as any)
      .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId))
      .order("desc")
      .take(50),
  ]);
  const liveModuleIds = new Set(
    (modules as CommunityResourceModuleLike[])
      .filter(communityResourceModuleIsLive)
      .map((module) => String(module._id)),
  );
  const rows = recentResources as CommunityResourceLike[];
  return {
    hasKnowledgeMaterial: rows.length > 0,
    hasLiveKnowledge: rows.some((row) => communityResourceIsLiveModulePage(row, liveModuleIds)),
  };
}

export const getCommunityLaunchSetupStatus = query({
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
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });

    const [knowledgeResourceProgress, agentConfigRows, currentPricePointRows] =
      await Promise.all([
        getKnowledgeResourceProgress(ctx, args.communityId),
        ctx.db
          .query("communityAgentConfigs" as any)
          .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
          .take(5),
        ctx.db
          .query("communityPricePoints" as any)
          .withIndex("by_community_current", (q: any) => q.eq("communityId", args.communityId).eq("isCurrent", true))
          .take(10),
      ]);
    const primaryAgentConfig =
      (agentConfigRows as CommunityAgentConfigLike[])
        .slice()
        .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null;

    return buildCommunityLaunchSetupStatus({
      name: (community as CommunityLike).name,
      oneLiner: (community as CommunityLike).oneLiner ?? null,
      avatarUrl: (community as CommunityLike).avatarUrl ?? null,
      avatarStorageId: (community as CommunityLike).avatarStorageId ?? null,
      bannerUrl: (community as CommunityLike).bannerUrl ?? null,
      bannerStorageId: (community as CommunityLike).bannerStorageId ?? null,
      about: (community as CommunityLike).about ?? null,
      hasKnowledgeMaterial: knowledgeResourceProgress.hasKnowledgeMaterial,
      hasLiveKnowledge: knowledgeResourceProgress.hasLiveKnowledge,
      hasAgentConfig: hasAgentConfig(primaryAgentConfig),
      entryPolicy: resolveCommunityEntryPolicy(community as CommunityLike),
      hasPaidAccessConfig: hasUsablePaidAccessConfig(currentPricePointRows as CommunityPricePointLike[]),
      visibility: (community as CommunityLike).visibility,
    });
  },
});
