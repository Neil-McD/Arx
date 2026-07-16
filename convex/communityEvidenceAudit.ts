import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { truncateText } from "./communityArchiveDocuments";
import { requireLiveCommunityForCognitionWrite } from "./communityCognitionLifecycle";

export const communityEvidenceSurfaceValidator = v.union(
  v.literal("member_agent_dock"),
  v.literal("external_mcp"),
  v.literal("community_concierge"),
);

export const communityEvidenceCapabilityValidator = v.union(
  v.literal("community_chat_search"),
  v.literal("community_chat_read"),
  v.literal("community_resources_search"),
  v.literal("community_resources_read"),
  v.literal("community_resource_read"),
  v.literal("community_ai_feed_search"),
  v.literal("community_ai_feed_read"),
);

export async function resolveTrustedCommunityEvidenceUserId(args: {
  ctx: any;
  userId?: any;
  authSubject?: string | null;
}): Promise<any> {
  const authSubject = String(args.authSubject ?? "").trim();
  if (!authSubject) {
    if (args.userId) return args.userId;
    throw new Error("authenticated_user_required");
  }
  const actor = (await args.ctx.runQuery(
    (internal as any).authActor.resolveAuthenticatedActorByTrustedSubjectInternal,
    {
      authSubject,
      ...(args.userId ? { userId: args.userId } : null),
    },
  )) as { dbUserId?: unknown } | null;
  if (!actor?.dbUserId) throw new Error("authenticated_user_required");
  return actor.dbUserId;
}

export const recordCommunityEvidenceRetrievalInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    userId: v.id("users"),
    surface: communityEvidenceSurfaceValidator,
    capability: communityEvidenceCapabilityValidator,
    resultRefs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireLiveCommunityForCognitionWrite(ctx, args.communityId);
    return await ctx.db.insert("communityEvidenceRetrievalLogs" as any, {
      communityId: args.communityId,
      userId: args.userId,
      surface: args.surface,
      capability: args.capability,
      resultRefs: args.resultRefs
        .slice(0, 40)
        .map((ref) => truncateText(ref, 512)),
      createdAt: Date.now(),
    });
  },
});
