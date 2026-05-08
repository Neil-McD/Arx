import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  type CommunityChatMessageLike,
  type CommunityChatThreadLike,
  type CommunityMemberSettingsLike,
  requireCommunityChatAccess,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";

type CommunityAttentionSurface = "chat" | "ai_feed" | "resources" | "events";

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

async function getCanonicalCommunityChatThread(
  ctx: any,
  communityId: any,
): Promise<CommunityChatThreadLike | null> {
  const rows = (await ctx.db
    .query("communityChatThreads" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .collect()) as CommunityChatThreadLike[];
  if (rows.length === 0) return null;
  rows.sort((a, b) => a.createdAt - b.createdAt || a.updatedAt - b.updatedAt);
  return rows[0] ?? null;
}

async function getLatestCommunityChatSeq(
  ctx: any,
  communityId: any,
): Promise<number | null> {
  const thread = await getCanonicalCommunityChatThread(ctx, communityId);
  if (!thread?._id) return null;
  const latest = (await ctx.db
    .query("communityChatMessages" as any)
    .withIndex("by_thread_seq", (q: any) => q.eq("threadId", thread._id))
    .order("desc")
    .take(1)) as CommunityChatMessageLike[];
  const seq = latest[0]?.seq;
  return typeof seq === "number" && Number.isFinite(seq) && seq > 0 ? Math.floor(seq) : null;
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
  const latest = await ctx.db
    .query("communityResources" as any)
    .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId))
    .order("desc")
    .take(1);
  const createdAt = latest[0]?.createdAt;
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

async function getCommunityAttentionRow(
  ctx: any,
  communityId: any,
  userId: any,
): Promise<CommunityAttentionRow> {
  const settingsRow = await getCommunityMemberSettingsRow(ctx, communityId, userId);
  const [
    latestChatSeq,
    latestAiFeedCreatedAt,
    latestResourcesCreatedAt,
    latestEventsUpdatedAt,
  ] = await Promise.all([
    getLatestCommunityChatSeq(ctx, communityId),
    getLatestCommunityAiFeedCreatedAt(ctx, communityId),
    getLatestCommunityResourcesCreatedAt(ctx, communityId),
    getLatestCommunityEventsUpdatedAt(ctx, communityId),
  ]);
  return {
    community_id: String(communityId),
    chat:
      typeof latestChatSeq === "number" &&
      latestChatSeq > Math.max(0, Math.floor(settingsRow?.chatLastSeenSeq ?? 0)),
    ai_feed:
      typeof latestAiFeedCreatedAt === "number" &&
      latestAiFeedCreatedAt > Math.max(0, Math.floor(settingsRow?.aiFeedLastSeenAt ?? 0)),
    resources:
      typeof latestResourcesCreatedAt === "number" &&
      latestResourcesCreatedAt > Math.max(0, Math.floor(settingsRow?.resourcesLastSeenAt ?? 0)),
    events:
      typeof latestEventsUpdatedAt === "number" &&
      latestEventsUpdatedAt > Math.max(0, Math.floor(settingsRow?.eventsLastSeenAt ?? 0)),
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
  const existing = await getCommunityMemberSettingsRow(ctx, communityId, userId);

  if (surface === "chat") {
    const latestChatSeq = await getLatestCommunityChatSeq(ctx, communityId);
    if (latestChatSeq === null) return;
    if ((existing?.chatLastSeenSeq ?? 0) >= latestChatSeq) return;
    if (existing) {
      await ctx.db.patch(existing._id as any, {
        chatLastSeenSeq: latestChatSeq,
        updatedAt: nowMs,
      });
      return;
    }
    await ctx.db.insert("communityMemberSettings" as any, {
      communityId,
      userId,
      muted: false,
      chatLastSeenSeq: latestChatSeq,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return;
  }

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
    surface: v.union(v.literal("chat"), v.literal("ai_feed"), v.literal("resources"), v.literal("events")),
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
