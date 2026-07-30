import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  type CommunityMemberSettingsLike,
  type CommunityResourceModuleLike,
  type CommunityResourceLike,
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
  requireCommunityChatAccess,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import {
  advanceCommunityChatReadCursor,
  readCommunityChatReadState,
} from "./communityReadCursorCore";

type CommunityAttentionSurface = "chat" | "ai_feed" | "resources" | "events" | "mentions";

type CommunityAiFeedPostLike = {
  _id: any;
  communityId: any;
  createdAt: number;
  status: "live" | "ranked";
};

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
};

type CommunityInteractionRootLike = {
  _id: any;
  communityId: any;
  status: "live" | "hidden" | "deleted";
  lastReplyAt?: number;
  createdAt: number;
};

type CommunityInteractionReplyLike = {
  _id: any;
  communityId: any;
  status: "live" | "hidden" | "deleted";
  createdAt: number;
};

type CommunityEventLike = {
  _id: any;
  communityId: any;
  status: "live" | "cancelled";
  updatedAt: number;
};

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

async function getLatestCommunityChatActivityAt(
  ctx: any,
  communityId: any,
): Promise<number | null> {
  const latestRoot = (await ctx.db
    .query("communityInteractionRoots" as any)
    .withIndex("by_community_status_createdAt", (q: any) =>
      q.eq("communityId", communityId).eq("status", "live"),
    )
    .order("desc")
    .first()) as CommunityInteractionRootLike | null;
  const latestReply = (await ctx.db
    .query("communityInteractionReplies" as any)
    .withIndex("by_community_status_createdAt", (q: any) =>
      q.eq("communityId", communityId).eq("status", "live"),
    )
    .order("desc")
    .first()) as CommunityInteractionReplyLike | null;
  const markers = [
    normalizePositiveMarker(latestRoot?.createdAt),
    normalizePositiveMarker(latestRoot?.lastReplyAt),
    normalizePositiveMarker(latestReply?.createdAt),
  ].filter((value): value is number => value !== null);
  return markers.length > 0 ? Math.max(...markers) : null;
}

async function getLatestCommunityAiFeedCreatedAt(
  ctx: any,
  communityId: any,
): Promise<number | null> {
  const latest = (await ctx.db
    .query("communityAiFeedPosts" as any)
    .withIndex("by_community_status_createdAt", (q: any) =>
      q.eq("communityId", communityId).eq("status", "live"),
    )
    .order("desc")
    .take(1)) as CommunityAiFeedPostLike[];
  const createdAt = latest[0]?.createdAt;
  return typeof createdAt === "number" && Number.isFinite(createdAt) && createdAt > 0
    ? Math.floor(createdAt)
    : null;
}

async function getLatestCommunityResourcesCreatedAt(
  ctx: any,
  communityId: any,
): Promise<number | null> {
  const modules = (await ctx.db
    .query("communityResourceModules" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .collect()) as CommunityResourceModuleLike[];
  const liveModuleIds = new Set(
    modules
      .filter(communityResourceModuleIsLive)
      .map((module) => String(module._id)),
  );
  const recentRows = (await ctx.db
    .query("communityResources" as any)
    .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId))
    .order("desc")
    .take(50)) as CommunityResourceLike[];
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
      .take(1)) as Array<{ createdAt?: number }>;
    const createdAt = latest[0]?.createdAt;
    if (typeof createdAt === "number" && Number.isFinite(createdAt) && createdAt > 0) {
      latestCreatedAt = Math.max(latestCreatedAt ?? 0, Math.floor(createdAt));
    }
  }
  return latestCreatedAt;
}

async function getCommunityAttentionRow(
  ctx: any,
  communityId: any,
  userId: any,
): Promise<CommunityAttentionRow> {
  const settingsRow = await getCommunityMemberSettingsRow(ctx, communityId, userId);
  const [
    chatReadState,
    latestChatActivityAt,
    latestAiFeedCreatedAt,
    latestResourcesCreatedAt,
    latestEventsUpdatedAt,
    latestMentionCreatedAt,
  ] = await Promise.all([
    readCommunityChatReadState(ctx, communityId, userId),
    getLatestCommunityChatActivityAt(ctx, communityId),
    getLatestCommunityAiFeedCreatedAt(ctx, communityId),
    getLatestCommunityResourcesCreatedAt(ctx, communityId),
    getLatestCommunityEventsUpdatedAt(ctx, communityId),
    getLatestCommunityMentionOfUserCreatedAt(ctx, communityId, userId),
  ]);
  return {
    community_id: String(communityId),
    chat:
      typeof latestChatActivityAt === "number" &&
      latestChatActivityAt > chatReadState.chatSeenThroughAt,
    ai_feed:
      typeof latestAiFeedCreatedAt === "number" &&
      latestAiFeedCreatedAt > Math.max(0, Math.floor(settingsRow?.aiFeedLastSeenAt ?? 0)),
    resources:
      typeof latestResourcesCreatedAt === "number" &&
      latestResourcesCreatedAt > Math.max(0, Math.floor(settingsRow?.resourcesLastSeenAt ?? 0)),
    events:
      typeof latestEventsUpdatedAt === "number" &&
      latestEventsUpdatedAt > Math.max(0, Math.floor(settingsRow?.eventsLastSeenAt ?? 0)),
    mentions:
      typeof latestMentionCreatedAt === "number" &&
      latestMentionCreatedAt > chatReadState.mentionSeenThroughAt,
    chat_last_seen_at:
      chatReadState.chatSeenThroughAt > 0 ? chatReadState.chatSeenThroughAt : null,
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
    const latestAiFeedCreatedAt = await getLatestCommunityAiFeedCreatedAt(ctx, communityId);
    if (latestAiFeedCreatedAt === null) return;
    if ((existing?.aiFeedLastSeenAt ?? 0) >= latestAiFeedCreatedAt) return;
    if (existing) {
      await ctx.db.patch(existing._id as any, {
        aiFeedLastSeenAt: latestAiFeedCreatedAt,
        updatedAt: nowMs,
      });
      return;
    }
    await ctx.db.insert("communityMemberSettings" as any, {
      communityId,
      userId,
      muted: false,
      aiFeedLastSeenAt: latestAiFeedCreatedAt,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
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
  userId: any;
  requestedThroughAt?: number | null;
}): Promise<{ ok: true; advanced: boolean; seenThroughAt: number }> {
  const latestReadableAt = await getLatestCommunityChatActivityAt(
    args.ctx,
    args.communityId,
  );
  const result = await advanceCommunityChatReadCursor({
    ctx: args.ctx,
    communityId: args.communityId,
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

export const listMyCommunityAttention = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityIds: v.array(v.id("communities")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const seenIds = new Set<string>();
    const rows: CommunityAttentionRow[] = [];
    for (const communityId of args.communityIds) {
      const normalizedId = String(communityId);
      if (!normalizedId || seenIds.has(normalizedId)) continue;
      seenIds.add(normalizedId);
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
      userId,
      requestedThroughAt: args.throughAtMs,
    });
  },
});

// Rolling-deployment adapter for clients deployed before the canonical
// acknowledgeCommunityChatRead contract. It no longer owns a second data path.
export const markCommunityChatReadAt = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    seenAtMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    return await acknowledgeCommunityChatReadForUser({
      ctx,
      communityId: args.communityId,
      userId,
      requestedThroughAt: args.seenAtMs,
    });
  },
});
