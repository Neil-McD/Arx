import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
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
import { isHost, podRecord } from "./communityPods";

// Matches communityPods.isInPod: an active participant grant for this viewer
// or a host seat on the pod. Managers can read every restricted room without
// belonging to it; sidebar shortcuts show only pods the viewer is actually in.
async function viewerIsInPod(
  ctx: any,
  communityId: any,
  channelId: any,
  actor: { principalKey: string },
  userId: any,
): Promise<boolean> {
  const grant = await ctx.db
    .query("communityChannelParticipants")
    .withIndex("by_channel_principal", (q: any) =>
      q.eq("channelId", channelId).eq("principalKey", actor.principalKey),
    )
    .first();
  if (grant?.status === "active") return true;
  const record = await podRecord(ctx, communityId, channelId);
  return isHost(record, userId);
}

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
    description: channel.description ?? null,
    // Whether a post is pinned, so the app knows before it draws the channel
    // that its right column will hold it (the post itself is read separately).
    has_pinned_root: Boolean(channel.pinnedRootId),
  };
}

export const COMMUNITY_CHANNEL_DESCRIPTION_MAX = 120;

export function normalizeCommunityChannelDescription(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, COMMUNITY_CHANNEL_DESCRIPTION_MAX);
}

// A manager sets the line shown next to the channel's name; empty clears it.
export const setCommunityChannelDescription = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.id("communityChannels"),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId });
    const channel = await resolveAuthorizedCommunityChannel({ ctx, communityId: args.communityId, channelId: args.channelId, actor, capability: "canManage" });
    const description = normalizeCommunityChannelDescription(args.description);
    await ctx.db.patch(args.channelId, { description: description || undefined, updatedAt: Date.now() } as any);
    return mapCommunityChannel({ ...(channel as any), description: description || undefined });
  },
});

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
        ...(channel.accessMode === "restricted"
          ? { is_pod_member: await viewerIsInPod(ctx, args.communityId, channel._id, actor, userId) }
          : {}),
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
    const channels = await Promise.all(result.page.map(async channel => ({
      ...mapCommunityChannel(channel),
      ...(channel.accessMode === "restricted"
        ? { is_pod_member: await viewerIsInPod(ctx, args.communityId, channel._id, actor, userId) }
        : {}),
      capabilities: await getCommunityChannelCapabilities({ ctx, channel, actor }),
    })));
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
    // The channel's search rows take the new access key.
    await ctx.scheduler.runAfter(0, (internal as any).communitySearchDocs.relabelCommunitySearchChannelInternal, { channelId: args.channelId });
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
    const renamed = await renameActiveCommunityChannel({
      ctx,
      communityId: args.communityId,
      channelId: args.channelId,
      name: args.name,
    });
    // The channel's search rows are indexed under its name.
    await ctx.scheduler.runAfter(0, (internal as any).communitySearchDocs.relabelCommunitySearchChannelInternal, { channelId: args.channelId });
    return mapCommunityChannel(renamed);
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
    // An archived channel's posts leave search.
    await ctx.scheduler.runAfter(0, (internal as any).communitySearchDocs.relabelCommunitySearchChannelInternal, { channelId: args.channelId });
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
    // The pod a guide run started in: its room opens to that run, no other.
    podRoomId: v.optional(v.string()),
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
    if (args.actorKind === "community_agent" && channel.accessMode !== "all_members" &&
        !(args.podRoomId && String(args.podRoomId) === String(channel._id))) return null;
    const capabilities = await getCommunityChannelCapabilities({ ctx, channel, actor });
    return capabilities.canRead ? { ...mapCommunityChannelForRepository(channel), capabilities } : null;
  },
});

// ---------------------------------------------------------------------------
// Channels through a builder's own AI (the MCP; docs/specs/agent-access-v0.md,
// slice 4). The executor has established who the person is; this is the app's
// own rules for each change (owners and admins, a channel they may manage,
// General left as it is), with a channel named by its slug. Deleting a
// channel, changing who may see it and pinning are not here: they take
// something from members and wait for the two-step confirm.
export const applyChannelOperationForTrustedUserInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities"), operation: v.string(), input: v.any() },
  handler: async (ctx, args) => {
    await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    const input = (args.input ?? {}) as Record<string, unknown>;
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId: args.userId });
    const bySlug = async (raw: unknown) => {
      const slug = String(raw ?? "").trim().toLowerCase();
      const row = slug ? await ctx.db.query("communityChannels")
        .withIndex("by_community_slug", (q) => q.eq("communityId", args.communityId).eq("slug", slug)).first() : null;
      if (!row || row.status !== "active") throw new Error("community_channel_not_found");
      return await resolveAuthorizedCommunityChannel({ ctx, communityId: args.communityId, channelId: row._id, actor, capability: "canManage" });
    };
    const view = (channel: CommunityChannelLike) => ({ channel: { slug: channel.slug, name: channel.name, description: channel.description ?? null,
      is_general: channel.systemRole === GENERAL_CHANNEL_SYSTEM_ROLE, position: channel.position } });
    const relabel = (channelId: any) => ctx.scheduler.runAfter(0, (internal as any).communitySearchDocs.relabelCommunitySearchChannelInternal, { channelId });

    if (args.operation === "community.channel.create") {
      // Open to every member: a private channel is made in the app.
      return view(await createActiveCommunityChannel({ ctx, communityId: args.communityId, createdByUserId: args.userId, name: input.name }));
    }
    const channel = await bySlug(input.channel);
    if (args.operation === "community.channel.rename") {
      const renamed = await renameActiveCommunityChannel({ ctx, communityId: args.communityId, channelId: channel._id, name: input.name });
      await relabel(channel._id);
      return view(renamed);
    }
    if (args.operation === "community.channel.describe") {
      const description = normalizeCommunityChannelDescription(String(input.description ?? ""));
      await ctx.db.patch(channel._id, { description: description || undefined, updatedAt: Date.now() } as any);
      return view({ ...(channel as any), description: description || undefined });
    }
    if (args.operation === "community.channel.move") {
      // After the named channel, or first when none is named. The one that
      // follows it now becomes the one after the moved channel.
      // General is always first, so "after General" is first among the rest.
      const named = input.after === null || input.after === undefined ? null : await bySlug(input.after);
      const after = named && named.systemRole !== GENERAL_CHANNEL_SYSTEM_ROLE ? named : null;
      const following = await ctx.db.query("communityChannels")
        .withIndex("by_community_status_position", (q) => q.eq("communityId", args.communityId).eq("status", "active").gt("position", after?.position ?? 0))
        .take(2);
      const before = following.find((row) => String(row._id) !== String(channel._id)) ?? null;
      if (after && String(after._id) === String(channel._id)) throw new Error("community_channel_order_duplicate_id");
      return view(await moveActiveCommunityChannel({ ctx, communityId: args.communityId, channelId: channel._id,
        afterChannelId: after?._id ?? null, beforeChannelId: before?._id ?? null, expectedPosition: channel.position }));
    }
    throw new Error("operation_not_found");
  },
});
