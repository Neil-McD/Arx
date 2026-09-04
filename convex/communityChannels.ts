import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getCommunityChannelCapabilities,
  requireCommunityChannelCapability,
  resolveCommunityChannelActor,
} from "./communityChannelAccess";
import { channelActorKindValidator } from "./communityChannelValidators";
import {
  type CommunityChannelLike,
  GENERAL_CHANNEL_SYSTEM_ROLE,
  MAX_ACTIVE_COMMUNITY_CHANNELS,
  archiveActiveCommunityChannel,
  createActiveCommunityChannel,
  getGeneralChannel,
  listSharedCommunityChannels,
  reorderActiveCommunityChannels,
  renameActiveCommunityChannel,
  resolveAuthorizedCommunityChannel,
  setActiveCommunityChannelPinnedRoot,
} from "./communityChannelCore";
import {
  normalizeIdValue,
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
    const actor = await resolveCommunityChannelActor({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const channels = await listSharedCommunityChannels({
      ctx,
      communityId: args.communityId,
    });
    return {
      channels: await Promise.all(channels.map(async (channel) => ({
        ...mapCommunityChannel(channel),
        capabilities: await requireCommunityChannelCapability({ ctx, channel, actor, capability: "canRead" }),
      }))),
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

export const renameCommunityChannel = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.id("communityChannels"),
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
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId });
    await resolveAuthorizedCommunityChannel({ ctx, communityId: args.communityId, channelId: args.channelId, actor, capability: "canManage" });
    return mapCommunityChannel(await renameActiveCommunityChannel({
      ctx,
      communityId: args.communityId,
      channelId: args.channelId,
      name: args.name,
    }));
  },
});

export const reorderCommunityChannels = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    orderedChannelIds: v.array(v.id("communityChannels")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const channels = await reorderActiveCommunityChannels({
      ctx,
      communityId: args.communityId,
      orderedChannelIds: args.orderedChannelIds,
    });
    return { channels: channels.map(mapCommunityChannel) };
  },
});

export const setCommunityChannelPinnedRoot = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.optional(v.id("communityChannels")),
    rootId: v.union(v.id("communityInteractionRoots"), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId });
    await resolveAuthorizedCommunityChannel({ ctx, communityId: args.communityId, channelId: args.channelId, actor, capability: "canManage", ensureGeneralForWrite: true });
    const channel = await setActiveCommunityChannelPinnedRoot({
      ctx,
      communityId: args.communityId,
      channelId: args.channelId,
      rootId: args.rootId,
      actorUserId: userId,
    });
    return {
      channel: mapCommunityChannel(channel),
      pinned_root_id: channel.pinnedRootId
        ? normalizeIdValue(channel.pinnedRootId)
        : null,
    };
  },
});

export const deleteCommunityChannel = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.id("communityChannels"),
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
    const archived = await archiveActiveCommunityChannel({
      ctx,
      communityId: args.communityId,
      channelId: args.channelId,
      actorUserId: userId,
    });
    return {
      deleted_channel_id: normalizeIdValue(archived._id),
      deleted_channel_slug: archived.slug,
    };
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

function mapCommunityChannelForRepository(channel: CommunityChannelLike) {
  return {
    ...mapCommunityChannel(channel),
    id: normalizeIdValue(channel._id) || null,
    access_mode: channel.accessMode,
    posting_policy: channel.postingPolicy,
    status: channel.status,
    pinned_root_id: channel.pinnedRootId
      ? normalizeIdValue(channel.pinnedRootId)
      : null,
  };
}

export const listCommunityChannelsInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    actorKind: v.optional(channelActorKindValidator),
  },
  handler: async (ctx, args) => {
    const actor = await resolveCommunityChannelActor({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      kind: args.actorKind,
    });
    return {
      channels: await Promise.all((await listSharedCommunityChannels({
        ctx,
        communityId: args.communityId,
      })).map(async (channel) => ({
        ...mapCommunityChannelForRepository(channel),
        capabilities: await requireCommunityChannelCapability({ ctx, channel, actor, capability: "canRead" }),
      }))),
      max_active_channels: MAX_ACTIVE_COMMUNITY_CHANNELS,
    };
  },
});

export const resolveCommunityChannelBySlugInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    slug: v.string(),
    actorKind: v.optional(channelActorKindValidator),
  },
  handler: async (ctx, args) => {
    const actor = await resolveCommunityChannelActor({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      kind: args.actorKind,
    });
    const channel = (await listSharedCommunityChannels({
      ctx,
      communityId: args.communityId,
    })).find((candidate) => candidate.slug === args.slug);
    if (!channel) return null;
    const capabilities = await getCommunityChannelCapabilities({ ctx, channel, actor });
    return capabilities.canRead ? { ...mapCommunityChannelForRepository(channel), capabilities } : null;
  },
});
