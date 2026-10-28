import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  getCommunityAndMembership,
  resolveCommunityAccessBundle,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import {
  buildCommunityResourceRuntimeLaneState,
  type CommunityResourceRuntimeLaneState,
} from "../shared/communityResourceLane";

// The resource lane for one agent turn. Builders who can manage resources get
// the builder lane (and with it the resources architect instructions); other
// members read live resources. A turn outside the community fails closed.
async function resolveCommunityResourceRuntimeLane(args: {
  ctx: any;
  communityId: any | null;
  userId: any;
}): Promise<CommunityResourceRuntimeLaneState> {
  if (!args.communityId) {
    return buildCommunityResourceRuntimeLaneState("none");
  }
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
  if (!access.can_enter_community) {
    throw new Error("community_entitlement_required");
  }
  return buildCommunityResourceRuntimeLaneState(
    access.can_manage_resources ? "builder" : "member",
  );
}

export const resolveRuntimeCommunityResourceLaneInternal = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    // Set only for a turn from a community front end, whose member was
    // authenticated by its session without a Convex identity.
    trustedUserId: v.optional(v.id("users")),
    communityId: v.optional(v.id("communities")),
  },
  handler: async (ctx, args): Promise<CommunityResourceRuntimeLaneState> => {
    const userId = args.trustedUserId ?? await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    return await resolveCommunityResourceRuntimeLane({
      ctx,
      communityId: args.communityId ?? null,
      userId,
    });
  },
});
