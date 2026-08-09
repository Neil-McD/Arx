import { internal } from "./_generated/api";
import { mutation } from "./_generated/server";
import { v } from "convex/values";

import {
  getCommunityAndMembership,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import {
  communityFounderWelcomeIdempotencyKey,
} from "../shared/communityFounderWelcome";

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
    const changed = community.builderKnowledgeSetupPending === true;
    if (changed) {
      await ctx.db.patch(community._id as any, {
        builderKnowledgeSetupPending: false,
        updatedAt: Date.now(),
      });
    }
    await ctx.scheduler.runAfter(
      0,
      internal.communityInteractions.createCommunityAgentCanonicalInteractionInternal,
      {
        userId,
        communityId: community._id,
        idempotencyKey: communityFounderWelcomeIdempotencyKey(community._id),
        founderBootstrap: true,
      },
    );
    return {
      ok: true,
      changed,
      community_id: String(community._id),
      builder_knowledge_setup_pending: false,
    };
  },
});
