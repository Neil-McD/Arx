import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  getCommunityChannelCapabilities,
  requireCommunityChannelCapability,
  resolveCommunityChannelActor,
} from "./communityChannelAccess";
import { channelActorKindValidator, channelAccessModeValidator } from "./communityChannelValidators";
import {
  type CommunityChannelLike,
  GENERAL_CHANNEL_SYSTEM_ROLE,
  LEGACY_CHANNEL_LIST_LIMIT,
  requireCommunityChannelCapacity,
  archiveActiveCommunityChannel,
  createActiveCommunityChannel,
  listAuthorizedCommunityChannels,
  listAuthorizedCommunityChannelPage,
  moveActiveCommunityChannel,
  normalizeCommunityChannelName,
  renameActiveCommunityChannel,
  resolveAuthorizedCommunityChannel,
  setActiveCommunityChannelPinnedRoot,
} from "./communityChannelCore";
import {
  normalizeIdValue,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import { MAX_TOTAL_COMMUNITY_CHANNELS } from "../shared/communityChannelCapacity";

function mapCommunityChannel(channel: CommunityChannelLike) {
  return {
    id: normalizeIdValue(channel._id),
    community_id: normalizeIdValue(channel.communityId),
    system_role: channel.systemRole ?? null,
    is_general: channel.systemRole === GENERAL_CHANNEL_SYSTEM_ROLE,
    slug: channel.slug,
    name: channel.name,
    position: channel.position,
    access_mode: channel.accessMode,
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
    const channels = await listAuthorizedCommunityChannels({
      ctx,
      communityId: args.communityId,
      actor,
    });
    return {
      channels: await Promise.all(channels.map(async (channel) => ({
        ...mapCommunityChannel(channel),
        capabilities: await requireCommunityChannelCapability({ ctx, channel, actor, capability: "canRead" }),
      }))),
      max_active_channels: LEGACY_CHANNEL_LIST_LIMIT,
    };
  },
});

// Directory pagination is separate from the current creation cap. Members scan
// only shared rooms and their own indexed grants, never every client's room.
export const listCommunityChannelPage = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"),
    section: v.union(v.literal("shared"), v.literal("private")), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId });
    const result = await listAuthorizedCommunityChannelPage({ ctx, communityId: args.communityId, actor,
      section: args.section, paginationOpts: args.paginationOpts });
    const channels = await Promise.all(result.page.map(async channel => ({ ...mapCommunityChannel(channel),
      capabilities: await getCommunityChannelCapabilities({ ctx, channel, actor }) })));
    return { ...result, page: channels, max_active_channels: MAX_TOTAL_COMMUNITY_CHANNELS };
  },
});

export const createCommunityChannel = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    name: v.string(),
    accessMode: v.optional(channelAccessModeValidator),
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
      accessMode: args.accessMode,
    }));
  },
});

export const setChannelAccess = mutation({
  args: { userId: v.optional(v.id("users")), authSubject: v.optional(v.string()),
    communityId: v.id("communities"), channelId: v.id("communityChannels"),
    accessMode: channelAccessModeValidator, expectedAccessMode: channelAccessModeValidator,
    acknowledgeHistoryExposure: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId });
    const channel = await resolveAuthorizedCommunityChannel({ ctx, communityId: args.communityId, channelId: args.channelId, actor, capability: "canManage" });
    if (channel.systemRole === "general") throw new Error("community_general_channel_immutable");
    if (channel.accessMode !== args.expectedAccessMode) throw new Error("community_channel_access_changed");
    if (channel.accessMode === args.accessMode) return mapCommunityChannel(channel);
    if (!args.acknowledgeHistoryExposure) throw new Error("community_channel_history_acknowledgement_required");
    await requireCommunityChannelCapacity({ ctx, communityId: args.communityId, accessMode: args.accessMode });
    await ctx.db.patch(args.channelId, { accessMode: args.accessMode, updatedAt: Date.now() });
    return mapCommunityChannel({ ...channel, accessMode: args.accessMode });
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

// Cached clients may still call this name. Never accept a stale full-directory
// rewrite: preserve the transport boundary only, with an explicit refresh error.
export const reorderCommunityChannels = mutation({
  args: {
    userId: v.optional(v.id("users")), authSubject: v.optional(v.string()),
    communityId: v.id("communities"), orderedChannelIds: v.array(v.id("communityChannels")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    throw new Error("community_channel_refresh_required");
  },
});

export const moveCommunityChannel = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.id("communityChannels"),
    afterChannelId: v.union(v.id("communityChannels"), v.null()),
    beforeChannelId: v.union(v.id("communityChannels"), v.null()),
    expectedPosition: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const channel = await moveActiveCommunityChannel({
      ctx,
      ...args,
    });
    return mapCommunityChannel(channel);
  },
});

// Read-only preparation. The operator must aggregate ALL pages to detect
// duplicate normalized names across page boundaries before running the backfill.
export const inspectChannelNamesInternal = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db.query("communityChannels").paginate({
      ...args.paginationOpts, numItems: Math.max(1, Math.min(100, args.paginationOpts.numItems)),
    });
    return { ...result, page: result.page.map(channel => {
      let normalizedName: string | null = null;
      try { normalizedName = normalizeCommunityChannelName(channel.name).toLocaleLowerCase("en-US"); } catch { /* report invalid; never rename */ }
      return { channelId: String(channel._id), communityId: String(channel.communityId), status: channel.status,
        normalizedName, needsBackfill: normalizedName !== channel.normalizedName };
    }) };
  },
});

// Bounded, resumable deployment migration. No public identity can invoke it.
export const backfillChannelNamesInternal = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db.query("communityChannels").paginate({
      ...args.paginationOpts, numItems: Math.min(100, args.paginationOpts.numItems),
    });
    let updated = 0;
    for (const channel of result.page) {
      const normalizedName = normalizeCommunityChannelName(channel.name).toLocaleLowerCase("en-US");
      if (channel.normalizedName === normalizedName) continue;
      if (channel.status === "active") {
        const collision = await ctx.db.query("communityChannels").withIndex(
          "by_community_status_normalizedName",
          (q) => q.eq("communityId", channel.communityId).eq("status", "active").eq("normalizedName", normalizedName),
        ).first();
        if (collision && collision._id !== channel._id) throw new Error("community_channel_name_taken");
      }
      await ctx.db.patch(channel._id, { normalizedName });
      updated += 1;
    }
    return { updated, isDone: result.isDone, continueCursor: result.continueCursor };
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
      actor,
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

export const listCommunityChannelPageInternal = internalQuery({
  args: {
    userId: v.id("users"), communityId: v.id("communities"),
    actorKind: v.optional(channelActorKindValidator),
    cursor: v.optional(v.string()), limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId,
      userId: args.userId, kind: args.actorKind });
    const scope = JSON.stringify([args.communityId, actor.principalKey, actor.kind,
      actor.isManager, actor.membershipId, actor.membershipActivationSequence]);
    let section: "shared" | "private" = "shared";
    let cursor: string | null = null;
    if (args.cursor) {
      let decoded: any;
      try { decoded = JSON.parse(args.cursor); } catch { throw new Error("community_channel_cursor_invalid"); }
      if (decoded?.scope !== scope || !["shared", "private"].includes(decoded.section)
        || !(decoded.cursor === null || typeof decoded.cursor === "string")) throw new Error("community_channel_cursor_invalid");
      section = decoded.section; cursor = decoded.cursor;
    }
    const result = await listAuthorizedCommunityChannelPage({ ctx, communityId: args.communityId,
      actor, section, paginationOpts: { cursor, numItems: args.limit ?? 50 } });
    const next = !result.isDone ? { section, cursor: result.continueCursor }
      : section === "shared" && actor.kind !== "community_agent" ? { section: "private", cursor: null } : null;
    return {
      channels: await Promise.all(result.page.map(async channel => ({
        ...mapCommunityChannelForRepository(channel),
        capabilities: await requireCommunityChannelCapability({ ctx, channel, actor, capability: "canRead" }),
      }))),
      next_cursor: next ? JSON.stringify({ scope, ...next }) : null,
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
    let channel;
    try {
      channel = await resolveAuthorizedCommunityChannel({ ctx, communityId: args.communityId,
        channelSlug: args.slug, actor, capability: "canRead" });
    } catch (error) {
      if (error instanceof Error && error.message === "community_channel_unavailable") return null;
      throw error;
    }
    // Broad community-agent repository lookup remains shared-only, even when
    // that agent has an explicit grant for an originating private thread.
    if (args.actorKind === "community_agent" && channel.accessMode !== "all_members") return null;
    const capabilities = await getCommunityChannelCapabilities({ ctx, channel, actor });
    return capabilities.canRead ? { ...mapCommunityChannelForRepository(channel), capabilities } : null;
  },
});
