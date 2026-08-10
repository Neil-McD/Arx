import { mutation } from "./_generated/server";
import { v } from "convex/values";

import {
  getCommunityAndMembership,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import { completeBuilderKnowledgeSetupForOwner } from "./communityBuilderKnowledgeSetupCore";

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
    const { changed } = await completeBuilderKnowledgeSetupForOwner({
      ctx,
      community,
      userId,
      nowMs: Date.now(),
    });
    return {
      ok: true,
      changed,
      community_id: String(community._id),
      builder_knowledge_setup_pending: false,
    };
  },
});
