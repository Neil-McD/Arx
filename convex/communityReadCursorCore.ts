import {
  type CommunityChannelLike,
  resolveRequestedCommunityChannel,
} from "./communityChannelCore";

type CommunityReadCursorLike = {
  _id: any;
  channelId?: any;
  seenThroughAt: number;
};

type LegacyCommunityReadStateLike = {
  chatLastSeenAt?: number;
  mentionsLastSeenAt?: number;
};

export type CommunityChatReadState = {
  chatSeenThroughAt: number;
  mentionSeenThroughAt: number;
  source: "cursor" | "legacy" | "none";
};

export function normalizeCommunityReadPosition(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

export function clampCommunityReadPosition(
  requestedThroughAt: unknown,
  latestReadableAt: unknown,
): number {
  const latest = normalizeCommunityReadPosition(latestReadableAt);
  if (latest === 0) return 0;
  const requested = normalizeCommunityReadPosition(requestedThroughAt);
  return requested === 0 ? 0 : Math.min(requested, latest);
}

export function nextCommunityReadPosition(
  currentThroughAt: unknown,
  requestedThroughAt: unknown,
  latestReadableAt: unknown,
): number {
  return Math.max(
    normalizeCommunityReadPosition(currentThroughAt),
    clampCommunityReadPosition(requestedThroughAt, latestReadableAt),
  );
}

async function getCommunityReadCursor(
  ctx: any,
  communityId: any,
  userId: any,
  channel: CommunityChannelLike,
): Promise<CommunityReadCursorLike | null> {
  if (channel._id) {
    const channelCursor = (await ctx.db
      .query("communityReadCursors" as any)
      .withIndex("by_community_channel_user_stream", (q: any) =>
        q
          .eq("communityId", communityId)
          .eq("channelId", channel._id)
          .eq("userId", userId)
          .eq("streamKind", "chat"),
      )
      .first()) as CommunityReadCursorLike | null;
    if (channelCursor) return channelCursor;
  }
  if (channel.systemRole !== "general") return null;
  return (await ctx.db
    .query("communityReadCursors" as any)
    .withIndex("by_community_channel_user_stream", (q: any) =>
      q
        .eq("communityId", communityId)
        .eq("channelId", undefined)
        .eq("userId", userId)
        .eq("streamKind", "chat"),
    )
    .first()) as CommunityReadCursorLike | null;
}

async function getLegacyCommunityReadState(
  ctx: any,
  communityId: any,
  userId: any,
): Promise<LegacyCommunityReadStateLike | null> {
  return (await ctx.db
    .query("communityMemberSettings" as any)
    .withIndex("by_community_user", (q: any) =>
      q.eq("communityId", communityId).eq("userId", userId),
    )
    .first()) as LegacyCommunityReadStateLike | null;
}

export async function readCommunityChatReadState(
  ctx: any,
  communityId: any,
  userId: any,
  channelId?: any | null,
): Promise<CommunityChatReadState> {
  const channel = await resolveRequestedCommunityChannel({
    ctx,
    communityId,
    channelId,
  });
  const cursor = await getCommunityReadCursor(
    ctx,
    communityId,
    userId,
    channel,
  );
  if (cursor) {
    const seenThroughAt = normalizeCommunityReadPosition(cursor.seenThroughAt);
    return {
      chatSeenThroughAt: seenThroughAt,
      mentionSeenThroughAt: seenThroughAt,
      source: "cursor",
    };
  }

  const legacy = channel.systemRole === "general"
    ? await getLegacyCommunityReadState(ctx, communityId, userId)
    : null;
  const chatSeenThroughAt = normalizeCommunityReadPosition(legacy?.chatLastSeenAt);
  const mentionSeenThroughAt = Math.max(
    chatSeenThroughAt,
    normalizeCommunityReadPosition(legacy?.mentionsLastSeenAt),
  );
  return {
    chatSeenThroughAt,
    mentionSeenThroughAt,
    source: legacy ? "legacy" : "none",
  };
}

export async function advanceCommunityChatReadCursor(args: {
  ctx: any;
  communityId: any;
  channelId?: any | null;
  userId: any;
  requestedThroughAt?: number | null;
  latestReadableAt?: number | null;
  nowMs?: number;
}): Promise<{ advanced: boolean; seenThroughAt: number }> {
  const {
    ctx,
    communityId,
    userId,
  } = args;
  const latestReadableAt = normalizeCommunityReadPosition(args.latestReadableAt);
  const channel = await resolveRequestedCommunityChannel({
    ctx,
    communityId,
    channelId: args.channelId,
    ensureGeneralForWrite: true,
    nowMs: args.nowMs,
  });
  const existing = await getCommunityReadCursor(
    ctx,
    communityId,
    userId,
    channel,
  );

  if (existing) {
    if (!existing.channelId) {
      await ctx.db.patch(existing._id, { channelId: channel._id });
      existing.channelId = channel._id;
    }
    const current = normalizeCommunityReadPosition(existing.seenThroughAt);
    const next = nextCommunityReadPosition(
      current,
      args.requestedThroughAt,
      latestReadableAt,
    );
    if (next <= current) {
      return { advanced: false, seenThroughAt: current };
    }
    await ctx.db.patch(existing._id, {
      seenThroughAt: next,
      updatedAt: args.nowMs ?? Date.now(),
    });
    return { advanced: true, seenThroughAt: next };
  }

  if (latestReadableAt === 0) {
    return { advanced: false, seenThroughAt: 0 };
  }

  const legacy = channel.systemRole === "general"
    ? await getLegacyCommunityReadState(ctx, communityId, userId)
    : null;
  const migratedLegacyPosition = Math.min(
    normalizeCommunityReadPosition(legacy?.chatLastSeenAt),
    latestReadableAt,
  );
  const next = nextCommunityReadPosition(
    migratedLegacyPosition,
    args.requestedThroughAt,
    latestReadableAt,
  );
  if (next === 0) {
    return { advanced: false, seenThroughAt: 0 };
  }

  const nowMs = args.nowMs ?? Date.now();
  await ctx.db.insert("communityReadCursors" as any, {
    communityId,
    channelId: channel._id,
    userId,
    streamKind: "chat",
    seenThroughAt: next,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  return {
    advanced: next > migratedLegacyPosition,
    seenThroughAt: next,
  };
}

export async function deleteCommunityReadCursorsForUserCommunity(
  ctx: any,
  communityId: any,
  userId: any,
): Promise<number> {
  const rows = await ctx.db
    .query("communityReadCursors" as any)
    .withIndex("by_community_user", (q: any) =>
      q.eq("communityId", communityId).eq("userId", userId),
    )
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}
