import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { resolveMentionRecipientSource } from "./communityNotificationAccess";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import {
  type CommunityMemberSettingsLike,
  type CommunityResourceModuleLike,
  type CommunityResourceLike,
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
  normalizeIdValue,
  requireCommunityChatAccess,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import {
  advanceCommunityChatReadCursor,
  readCommunityChatReadState,
} from "./communityReadCursorCore";
import {
  type CommunityChannelLike,
  listChannelReadableRows,
  listAuthorizedCommunityChannels,
  listAuthorizedCommunityChannelPage,
  resolveAuthorizedCommunityChannel,
  resolveRequestedCommunityChannel,
} from "./communityChannelCore";
import { MAX_COMMUNITY_ATTENTION_COMMUNITIES_PER_QUERY } from "../shared/communityAttentionContract";
import { resolveCommunityChannelActor, type ChannelActor } from "./communityChannelAccess";

type CommunityAttentionSurface = "chat" | "ai_feed" | "resources" | "events" | "mentions";

type CommunityAttentionRow = {
  community_id: string;
  chat: boolean;
  ai_feed: boolean;
  resources: boolean;
  events: boolean;
  // Someone tagged this user and they have not seen it yet. Rides the chat
  // surface visually (accent dot) but has its own marker so a mention ping is
  // distinguishable from ordinary chatter.
  mentions: boolean;
  chat_last_seen_at: number | null;
  channels: CommunityChannelAttentionRow[];
};

type CommunityChannelAttentionRow = {
  channel_id: string | null;
  channel_slug: string;
  chat: boolean;
  mentions: boolean;
  chat_last_seen_at: number | null;
  latest_activity_at: number | null;
};

type CommunityInteractionRootLike = {
  _id: any;
  communityId: any;
  channelId?: any;
  status: "live" | "hidden" | "deleted";
  visibilityScope: "private" | "admin" | "community" | "public";
  lastReplyAt?: number;
  createdAt: number;
};

type CommunityInteractionReplyLike = {
  _id: any;
  communityId: any;
  channelId?: any;
  status: "live" | "hidden" | "deleted";
  visibilityScope: "private" | "admin" | "community" | "public";
  createdAt: number;
};

type CommunityEventLike = {
  _id: any;
  communityId: any;
  status: "live" | "cancelled";
  updatedAt: number;
};

const MAX_COMMUNITY_ATTENTION_RECENT_RESOURCES = 50;

function normalizePositiveMarker(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function isSkippableCommunityAccessError(error: unknown): boolean {
  const message =
    error instanceof Error && typeof error.message === "string"
      ? error.message.trim()
      : String(error ?? "").trim();
  return new Set([
    "community_not_found",
    "community_forbidden",
    "community_entitlement_required",
  ]).has(message);
}

async function getCommunityMemberSettingsRow(
  ctx: any,
  communityId: any,
  userId: any,
): Promise<CommunityMemberSettingsLike | null> {
  return (await ctx.db
    .query("communityMemberSettings" as any)
    .withIndex("by_community_user", (q: any) =>
      q.eq("communityId", communityId).eq("userId", userId),
    )
    .first()) as CommunityMemberSettingsLike | null;
}

async function getLatestCommunityChannelChatActivityAt(
  ctx: any,
  communityId: any,
  channel: CommunityChannelLike,
  actor?: ChannelActor,
): Promise<number | null> {
  const [roots, replies] =
    await Promise.all([
      listChannelReadableRows<CommunityInteractionRootLike>({
        ctx,
        actor,
        tableName: "communityInteractionRoots",
        communityId,
        channel,
        limit: 1,
      }),
      listChannelReadableRows<CommunityInteractionReplyLike>({
        ctx,
        actor,
        tableName: "communityInteractionReplies",
        communityId,
        channel,
        limit: 1,
      }),
    ]);
  const latestRoot = roots[0] ?? null;
  const latestReply = replies[0] ?? null;
  const markers = [
    normalizePositiveMarker(latestRoot?.createdAt),
    normalizePositiveMarker(latestRoot?.lastReplyAt),
    normalizePositiveMarker(latestReply?.createdAt),
  ].filter((value): value is number => value !== null);
  return markers.length > 0 ? Math.max(...markers) : null;
}

async function getLatestCommunityChatActivityAt(
  ctx: any,
  communityId: any,
): Promise<number | null> {
  const generalChannel = await resolveRequestedCommunityChannel({
    ctx,
    communityId,
  });
  return await getLatestCommunityChannelChatActivityAt(
    ctx,
    communityId,
    generalChannel,
  );
}

async function getLatestCommunityResourcesCreatedAt(
  ctx: any,
  communityId: any,
): Promise<number | null> {
  const recentRows = (await ctx.db
    .query("communityResources" as any)
    .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId))
    .order("desc")
    .take(MAX_COMMUNITY_ATTENTION_RECENT_RESOURCES)) as CommunityResourceLike[];
  const referencedModuleIds = Array.from(
    new Map(
      recentRows.flatMap((row) => {
        const moduleId = normalizeIdValue(row.moduleId);
        return moduleId ? [[moduleId, row.moduleId] as const] : [];
      }),
    ).values(),
  );
  const modules = (await Promise.all(
    referencedModuleIds.map(async (moduleId) =>
      await ctx.db.get(moduleId as any) as CommunityResourceModuleLike | null,
    ),
  )).filter(
    (module): module is CommunityResourceModuleLike =>
      module !== null && normalizeIdValue(module.communityId) === normalizeIdValue(communityId),
  );
  const liveModuleIds = new Set(
    modules
      .filter(communityResourceModuleIsLive)
      .map((module) => String(module._id)),
  );
  const createdAt = recentRows.find((row) => communityResourceIsLiveModulePage(row, liveModuleIds))?.createdAt;
  return typeof createdAt === "number" && Number.isFinite(createdAt) && createdAt > 0
    ? Math.floor(createdAt)
    : null;
}

async function getLatestCommunityEventsUpdatedAt(
  ctx: any,
  communityId: any,
): Promise<number | null> {
  const latest = (await ctx.db
    .query("communityEvents" as any)
    .withIndex("by_community_status_updatedAt", (q: any) =>
      q.eq("communityId", communityId).eq("status", "live"),
    )
    .order("desc")
    .take(1)) as CommunityEventLike[];
  const updatedAt = latest[0]?.updatedAt;
  return typeof updatedAt === "number" && Number.isFinite(updatedAt) && updatedAt > 0
    ? Math.floor(updatedAt)
    : null;
}

const MENTION_SOURCE_SCAN_LIMIT = 5;

async function latestReadableMentionAt(ctx: any, userId: any, mentions: Array<Record<string, any>>): Promise<number> {
  for (const mention of mentions) {
    if (await resolveMentionRecipientSource({ ctx, mention, userId })) return mention.createdAt;
  }
  return 0;
}

async function getLatestCommunityMentionOfUserCreatedAt(
  ctx: any,
  communityId: any,
  userId: any,
): Promise<number | null> {
  let latestCreatedAt: number | null = null;
  for (const notifyState of ["pending", "sent", "read"] as const) {
    const latest = (await ctx.db
      .query("communityInteractionMentions" as any)
      .withIndex("by_mentionedUser_community_notifyState_createdAt", (q: any) =>
        q.eq("mentionedUserId", userId).eq("communityId", communityId).eq("notifyState", notifyState),
      )
      .order("desc")
      .take(MENTION_SOURCE_SCAN_LIMIT)) as Array<Record<string, any>>;
    const createdAt = await latestReadableMentionAt(ctx, userId, latest);
    if (typeof createdAt === "number" && Number.isFinite(createdAt) && createdAt > 0) {
      latestCreatedAt = Math.max(latestCreatedAt ?? 0, Math.floor(createdAt));
    }
  }
  return latestCreatedAt;
}

function communityAttentionChannelKey(channel: CommunityChannelLike): string {
  return normalizeIdValue(channel._id) || "general";
}

async function getLatestCommunityMentionsByChannel(args: {
  ctx: any;
  communityId: any;
  userId: any;
  channels: CommunityChannelLike[];
}): Promise<Map<string, number>> {
  const latestByChannel = new Map<string, number>();
  for (const channel of args.channels) {
    const channelIds = Array.from(
      new Set(
        channel.systemRole === "general"
          ? [channel._id, undefined]
          : [channel._id],
      ),
    );
    const batches = await Promise.all(
      channelIds.flatMap((channelId) =>
        (["pending", "sent", "read"] as const).map(
          async (notifyState) =>
            (await args.ctx.db
              .query("communityInteractionMentions" as any)
              .withIndex(
                "by_mentionedUser_community_channel_notifyState_createdAt",
                (q: any) =>
                  q
                    .eq("mentionedUserId", args.userId)
                    .eq("communityId", args.communityId)
                    .eq("channelId", channelId)
                    .eq("notifyState", notifyState),
              )
              .order("desc")
              .take(MENTION_SOURCE_SCAN_LIMIT)) as Array<Record<string, any>>,
        ),
      ),
    );
    const latestCreatedAt = Math.max(
      0,
      ...await Promise.all(batches.map(mentions => latestReadableMentionAt(args.ctx, args.userId, mentions))),
    );
    if (latestCreatedAt > 0) {
      latestByChannel.set(
        communityAttentionChannelKey(channel),
        latestCreatedAt,
      );
    }
  }
  return latestByChannel;
}

async function getCommunityAttentionRow(
  ctx: any,
  communityId: any,
  userId: any,
  selectedChannels?: CommunityChannelLike[],
): Promise<CommunityAttentionRow> {
  const settingsRow = await getCommunityMemberSettingsRow(ctx, communityId, userId);
  const actor = await resolveCommunityChannelActor({ ctx, communityId, userId });
  const channels = selectedChannels ?? await listAuthorizedCommunityChannels({ ctx, communityId, actor });
  const [
    channelAttentionInputs,
    latestMentionsByChannel,
    latestResourcesCreatedAt,
    latestEventsUpdatedAt,
  ] = await Promise.all([
    Promise.all(
      channels.map(async (channel) => ({
        channel,
        readState: await readCommunityChatReadState(
          ctx,
          communityId,
          userId,
          channel._id,
        ),
        latestActivityAt: await getLatestCommunityChannelChatActivityAt(
          ctx,
          communityId,
          channel,
          actor,
        ),
      })),
    ),
    getLatestCommunityMentionsByChannel({
      ctx,
      communityId,
      userId,
      channels,
    }),
    getLatestCommunityResourcesCreatedAt(ctx, communityId),
    getLatestCommunityEventsUpdatedAt(ctx, communityId),
  ]);
  const channelRows: CommunityChannelAttentionRow[] = channelAttentionInputs.map(
    ({ channel, readState, latestActivityAt }) => {
      const latestMentionAt = latestMentionsByChannel.get(
        communityAttentionChannelKey(channel),
      );
      return {
        channel_id: normalizeIdValue(channel._id) || null,
        channel_slug: channel.slug,
        chat:
          typeof latestActivityAt === "number" &&
          latestActivityAt > readState.chatSeenThroughAt,
        mentions:
          typeof latestMentionAt === "number" &&
          latestMentionAt > readState.mentionSeenThroughAt,
        chat_last_seen_at:
          readState.chatSeenThroughAt > 0
            ? readState.chatSeenThroughAt
            : null,
        latest_activity_at: latestActivityAt,
      };
    },
  );
  const generalRow = channelRows.find(
    (row) => row.channel_slug === "general",
  );
  return {
    community_id: String(communityId),
    chat: channelRows.some((row) => row.chat),
    // Rolling-client compatibility tombstone. AI Feed is retired and can no
    // longer produce attention.
    ai_feed: false,
    resources:
      typeof latestResourcesCreatedAt === "number" &&
      latestResourcesCreatedAt > Math.max(0, Math.floor(settingsRow?.resourcesLastSeenAt ?? 0)),
    events:
      typeof latestEventsUpdatedAt === "number" &&
      latestEventsUpdatedAt > Math.max(0, Math.floor(settingsRow?.eventsLastSeenAt ?? 0)),
    mentions: channelRows.some((row) => row.mentions),
    // Rolling clients still render one General divider. The channel array is
    // the canonical projection for the forthcoming channel navigation.
    chat_last_seen_at: generalRow?.chat_last_seen_at ?? null,
    channels: channelRows,
  };
}

async function upsertCommunitySurfaceSeen(args: {
  ctx: any;
  communityId: any;
  userId: any;
  surface: CommunityAttentionSurface;
  nowMs: number;
  seenAtMs?: number | null;
}): Promise<void> {
  const { ctx, communityId, userId, surface, nowMs } = args;

  if (surface === "chat") {
    const latestChatActivityAt = await getLatestCommunityChatActivityAt(ctx, communityId);
    if (latestChatActivityAt === null) return;
    await advanceCommunityChatReadCursor({
      ctx,
      communityId,
      userId,
      requestedThroughAt: args.seenAtMs ?? latestChatActivityAt,
      latestReadableAt: latestChatActivityAt,
      // Chat acknowledgement metadata is server-authored even when this
      // rolling-compatibility adapter receives a client-authored nowMs.
      nowMs: Date.now(),
    });
    return;
  }

  const existing = await getCommunityMemberSettingsRow(ctx, communityId, userId);

  if (surface === "ai_feed") {
    // Cached clients may still acknowledge the retired surface. Preserve a
    // harmless success response without reading or mutating Feed state.
    return;
  }

  if (surface === "mentions") {
    const latestMentionCreatedAt = await getLatestCommunityMentionOfUserCreatedAt(ctx, communityId, userId);
    if (latestMentionCreatedAt === null) return;
    if ((existing?.mentionsLastSeenAt ?? 0) >= latestMentionCreatedAt) return;
    if (existing) {
      await ctx.db.patch(existing._id as any, {
        mentionsLastSeenAt: latestMentionCreatedAt,
        updatedAt: nowMs,
      });
      return;
    }
    await ctx.db.insert("communityMemberSettings" as any, {
      communityId,
      userId,
      muted: false,
      mentionsLastSeenAt: latestMentionCreatedAt,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return;
  }

  if (surface === "resources") {
    const latestResourcesCreatedAt = await getLatestCommunityResourcesCreatedAt(ctx, communityId);
    if (latestResourcesCreatedAt === null) return;
    if ((existing?.resourcesLastSeenAt ?? 0) >= latestResourcesCreatedAt) return;
    if (existing) {
      await ctx.db.patch(existing._id as any, {
        resourcesLastSeenAt: latestResourcesCreatedAt,
        updatedAt: nowMs,
      });
      return;
    }
    await ctx.db.insert("communityMemberSettings" as any, {
      communityId,
      userId,
      muted: false,
      resourcesLastSeenAt: latestResourcesCreatedAt,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return;
  }

  const latestEventsUpdatedAt = await getLatestCommunityEventsUpdatedAt(ctx, communityId);
  if (latestEventsUpdatedAt === null) return;
  const requestedEventsSeenAt = normalizePositiveMarker(args.seenAtMs);
  if (requestedEventsSeenAt === null) return;
  const nextEventsLastSeenAt = Math.min(latestEventsUpdatedAt, requestedEventsSeenAt);
  if ((existing?.eventsLastSeenAt ?? 0) >= nextEventsLastSeenAt) return;
  if (existing) {
    await ctx.db.patch(existing._id as any, {
      eventsLastSeenAt: nextEventsLastSeenAt,
      updatedAt: nowMs,
    });
    return;
  }
  await ctx.db.insert("communityMemberSettings" as any, {
    communityId,
    userId,
    muted: false,
    eventsLastSeenAt: nextEventsLastSeenAt,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
}

async function acknowledgeCommunityChatReadForUser(args: {
  ctx: any;
  communityId: any;
  channelId?: any | null;
  userId: any;
  requestedThroughAt?: number | null;
}): Promise<{ ok: true; advanced: boolean; seenThroughAt: number }> {
  const actor = await resolveCommunityChannelActor(args);
  const channel = await resolveAuthorizedCommunityChannel({
    ctx: args.ctx,
    actor, capability: "canRead",
    communityId: args.communityId,
    channelId: args.channelId,
    ensureGeneralForWrite: true,
  });
  const latestReadableAt = await getLatestCommunityChannelChatActivityAt(
    args.ctx,
    args.communityId,
    channel,
    actor,
  );
  const result = await advanceCommunityChatReadCursor({
    ctx: args.ctx,
    communityId: args.communityId,
    channelId: channel._id,
    userId: args.userId,
    requestedThroughAt: args.requestedThroughAt ?? latestReadableAt,
    latestReadableAt,
  });
  return {
    ok: true,
    advanced: result.advanced,
    seenThroughAt: result.seenThroughAt,
  };
}

export const listMyCommunityAttentionPage = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"),
    section: v.union(v.literal("shared"), v.literal("private")), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId });
    // Attention has several indexed reads per room, so use smaller pages than
    // a plain directory listing. No read cursor is mutated by this query.
    const result = await listAuthorizedCommunityChannelPage({ ctx, communityId: args.communityId, actor,
      section: args.section, paginationOpts: { ...args.paginationOpts, numItems: Math.min(10, args.paginationOpts.numItems) } });
    const attention = await getCommunityAttentionRow(ctx, args.communityId, userId, result.page);
    return { ...result, page: attention.channels, attention };
  },
});

// Cached-client bounded adapter. New clients use the paged endpoint above.
export const listMyCommunityAttention = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityIds: v.array(v.id("communities")),
  },
  handler: async (ctx, args) => {
    const communityIds = Array.from(
      new Map(args.communityIds.map((communityId) => [String(communityId), communityId])).values(),
    );
    if (communityIds.length > MAX_COMMUNITY_ATTENTION_COMMUNITIES_PER_QUERY) {
      throw new Error("community_attention_scope_limit_exceeded");
    }
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const rows: CommunityAttentionRow[] = [];
    for (const communityId of communityIds) {
      try {
        await requireCommunityChatAccess({
          ctx,
          communityId,
          userId,
        });
      } catch (error) {
        if (isSkippableCommunityAccessError(error)) continue;
        throw error;
      }
      rows.push(await getCommunityAttentionRow(ctx, communityId, userId));
    }
    return rows;
  },
});

export const markCommunitySurfaceSeen = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    surface: v.union(v.literal("chat"), v.literal("ai_feed"), v.literal("resources"), v.literal("events"), v.literal("mentions")),
    seenAtMs: v.optional(v.number()),
    nowMs: v.optional(v.number()),
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
    await upsertCommunitySurfaceSeen({
      ctx,
      communityId: args.communityId,
      userId,
      surface: args.surface,
      seenAtMs: args.seenAtMs ?? null,
      nowMs: args.nowMs ?? Date.now(),
    });
    return { ok: true };
  },
});

// Canonical chat acknowledgement: the client supplies the newest server-issued
// position it actually rendered while caught up. Access is re-authorized and
// the position is clamped to the current readable head before it can advance.
export const acknowledgeCommunityChatRead = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.optional(v.id("communityChannels")),
    throughAtMs: v.number(),
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
    return await acknowledgeCommunityChatReadForUser({
      ctx,
      communityId: args.communityId,
      channelId: args.channelId,
      userId,
      requestedThroughAt: args.throughAtMs,
    });
  },
});

// Community sites: the trusted member's attention for the channels on one
// listing page (by slug), read only. Rows match a listing by channel id, or by
// slug for a General that has no stored row yet.
export const listCommunityChannelAttentionForUserInternal = internalQuery({
  args: { userId: v.id("users"), communityId: v.id("communities"), channelSlugs: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: args.userId });
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId: args.userId });
    const channels: CommunityChannelLike[] = [];
    for (const channelSlug of new Set(args.channelSlugs.slice(0, 100))) {
      try {
        channels.push(await resolveAuthorizedCommunityChannel({ ctx, communityId: args.communityId, channelSlug, actor, capability: "canRead" }));
      } catch {
        // A channel the member can no longer read simply has no attention.
      }
    }
    return (await getCommunityAttentionRow(ctx, args.communityId, args.userId, channels)).channels;
  },
});

// Community sites: mark one channel (by slug) read for the trusted member,
// through the same clamped acknowledgement Studio uses.
export const markCommunityChannelReadForUserInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities"), channelSlug: v.string(), throughAtMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: args.userId });
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId: args.userId });
    const channel = await resolveAuthorizedCommunityChannel({ ctx, communityId: args.communityId,
      channelSlug: args.channelSlug, actor, capability: "canRead" });
    return await acknowledgeCommunityChatReadForUser({ ctx, communityId: args.communityId,
      channelId: channel._id ?? null, userId: args.userId, requestedThroughAt: args.throughAtMs ?? null });
  },
});

// Rolling-deployment adapter for clients deployed before the canonical
// acknowledgeCommunityChatRead contract. It no longer owns a second data path.
