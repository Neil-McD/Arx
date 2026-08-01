import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityChannelLike,
  GENERAL_CHANNEL_SYSTEM_ROLE,
  MAX_ACTIVE_COMMUNITY_CHANNELS,
  createActiveCommunityChannel,
  getGeneralChannel,
  listActiveCommunityChannels,
} from "./communityChannelCore";
import {
  normalizeIdValue,
  requireCommunityChatAccess,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";

function mapCommunityChannel(channel: CommunityChannelLike) {
  return {
    id: normalizeIdValue(channel._id),
    community_id: normalizeIdValue(channel.communityId),
    system_role: channel.systemRole ?? null,
    is_general: channel.systemRole === GENERAL_CHANNEL_SYSTEM_ROLE,
    slug: channel.slug,
    name: channel.name,
    position: channel.position,
  };
}

export const listCommunityChannels = query({
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
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const general = await getGeneralChannel(ctx, args.communityId);
    if (!general) throw new Error("community_general_channel_missing");
    const channels = await listActiveCommunityChannels({
      ctx,
      communityId: args.communityId,
    });
    return {
      channels: channels.map(mapCommunityChannel),
      max_active_channels: MAX_ACTIVE_COMMUNITY_CHANNELS,
    };
  },
});

export const createCommunityChannel = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    return mapCommunityChannel(await createActiveCommunityChannel({
      ctx,
      communityId: args.communityId,
      createdByUserId: userId,
      name: args.name,
    }));
  },
});

export const getGeneralChannelInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const channel = await getGeneralChannel(ctx, args.communityId);
    if (!channel) return null;
    return {
      id: normalizeIdValue(channel._id),
      community_id: normalizeIdValue(channel.communityId),
      system_role: channel.systemRole ?? null,
      slug: channel.slug,
      name: channel.name,
      access_mode: channel.accessMode,
      posting_policy: channel.postingPolicy,
      status: channel.status,
      position: channel.position,
    };
  },
});
