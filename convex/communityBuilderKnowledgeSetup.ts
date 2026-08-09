import { mutation } from "./_generated/server";
import { v } from "convex/values";

import {
  getCommunityAndMembership,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";

export const completeBuilderKnowledgeSetup = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const { community } = await getCommunityAndMembership({
      ctx,
      communityId: args.communityId,
      userId,
    });
    if (String(community.ownerId) !== String(userId)) {
      throw new Error("community_owner_required");
    }
    if (community.builderKnowledgeSetupPending !== true) {
      return {
        ok: true,
        changed: false,
        community_id: String(community._id),
        builder_knowledge_setup_pending: false,
      };
    }
    await ctx.db.patch(community._id as any, {
      builderKnowledgeSetupPending: false,
      updatedAt: Date.now(),
    });
    return {
      ok: true,
      changed: true,
      community_id: String(community._id),
      builder_knowledge_setup_pending: false,
    };
  },
});
