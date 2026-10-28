import {
  COMMUNITY_TYPING_PRESENCE_SCAN_LIMIT,
  COMMUNITY_TYPING_PRESENCE_VISIBLE_LIMIT,
  issueTypingPresenceLease,
  normalizeTypingPresenceTimestamp,
} from "../shared/typingPresenceContract";
import {
  type CommunityLike,
  type CommunityTypingPresenceLike,
  normalizeIdValue,
  resolvePublicUserId,
  toIsoString,
} from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import {
  type CommunityChannelLike,
  interactionBelongsToChannel,
  requireChannelForAddressableRoot,
  resolveAuthorizedCommunityChannel,
} from "./communityChannelCore";
import { getCommunityChannelCapabilities, resolveCommunityChannelActor, type ChannelActor } from "./communityChannelAccess";

export {
  COMMUNITY_TYPING_PRESENCE_SCAN_LIMIT,
  COMMUNITY_TYPING_PRESENCE_VISIBLE_LIMIT,
  TYPING_PRESENCE_LEASE_DURATION_MS,
  TYPING_PRESENCE_RENEW_INTERVAL_MS,
  issueTypingPresenceLease,
  normalizeTypingPresenceTimestamp,
  typingPresenceLeaseIsActive,
} from "../shared/typingPresenceContract";

function normalizeTypingRootId(value: unknown): string | null {
  const normalized = normalizeIdValue(value);
  return normalized || null;
}

async function requireCommunityTypingRoot(args: {
  ctx: any;
  communityId: any;
  channel: CommunityChannelLike;
  rootId?: any | null;
  actor: ChannelActor;
}): Promise<any | null> {
  const normalizedRootId = normalizeTypingRootId(args.rootId);
  if (!normalizedRootId) return null;
  const root = await args.ctx.db.get(args.rootId);
  if (
    !root
    || normalizeIdValue(root.communityId) !== normalizeIdValue(args.communityId)
    || root.status !== "live"
    || (root.visibilityScope !== "community" && root.visibilityScope !== "public")
  ) {
    throw new Error("community_typing_scope_invalid");
  }
  const rootChannel = await requireChannelForAddressableRoot({
    ctx: args.ctx,
    root,
    actor: args.actor,
  });
  if (
    normalizeIdValue(rootChannel._id) !== normalizeIdValue(args.channel._id)
  ) {
    throw new Error("community_typing_scope_invalid");
  }
  return root._id;
}

export async function renewCommunityTypingLease(args: {
  ctx: any;
  communityId: any;
  channelId?: any | null;
  userId: any;
  rootId?: any | null;
  nowMs?: number;
}): Promise<{ displayUntil: number; rootId: string | null; updatedAt: number }> {
  const actor = await resolveCommunityChannelActor({ ctx: args.ctx, communityId: args.communityId, userId: args.userId });
  const channel = await resolveAuthorizedCommunityChannel({
    ctx: args.ctx,
    actor, capability: args.rootId ? "canReply" : "canPost",
    communityId: args.communityId,
    channelId: args.channelId,
    ensureGeneralForWrite: true,
    nowMs: args.nowMs,
  });
  const validatedRootId = await requireCommunityTypingRoot({
    ...args,
    channel,
    actor,
  });
  const issuedLease = issueTypingPresenceLease(args.nowMs ?? Date.now());
  const channelPresence = (await args.ctx.db
    .query("communityTypingPresence" as any)
    .withIndex("by_channel_user", (q: any) =>
      q.eq("channelId", channel._id).eq("userId", args.userId),
    )
    .first()) as CommunityTypingPresenceLike | null;
  const legacyPresence = channel.systemRole === "general"
    ? ((await args.ctx.db
        .query("communityTypingPresence" as any)
        .withIndex("by_community_channel_user", (q: any) =>
          q
            .eq("communityId", args.communityId)
            .eq("channelId", undefined)
            .eq("userId", args.userId),
        )
        .first()) as CommunityTypingPresenceLike | null)
    : null;
  const existing = channelPresence ?? legacyPresence;

  if (existing) {
    const currentUpdatedAt =
      normalizeTypingPresenceTimestamp(existing.updatedAt) ?? 0;
    const lease = issueTypingPresenceLease(
      Math.max(currentUpdatedAt, issuedLease.updatedAt),
    );
    await args.ctx.db.patch(existing._id as any, {
      channelId: channel._id,
      displayUntil: lease.displayUntil,
      rootId: validatedRootId ?? undefined,
      updatedAt: lease.updatedAt,
    });
    return {
      ...lease,
      rootId: normalizeTypingRootId(validatedRootId),
    };
  }

  await args.ctx.db.insert("communityTypingPresence" as any, {
    communityId: args.communityId,
    channelId: channel._id,
    userId: args.userId,
    rootId: validatedRootId ?? undefined,
    displayUntil: issuedLease.displayUntil,
    createdAt: issuedLease.updatedAt,
    updatedAt: issuedLease.updatedAt,
  });
  return {
    ...issuedLease,
    rootId: normalizeTypingRootId(validatedRootId),
  };
}

export async function clearCommunityTypingLease(args: {
  ctx: any;
  communityId: any;
  channelId?: any | null;
  userId: any;
  rootId?: any | null;
}): Promise<{ cleared: boolean }> {
  const requestedRootId = normalizeTypingRootId(args.rootId);
  const actor = await resolveCommunityChannelActor({ ctx: args.ctx, communityId: args.communityId, userId: args.userId });
  const channel = await resolveAuthorizedCommunityChannel({
    ctx: args.ctx,
    actor, capability: "canRead",
    communityId: args.communityId,
    channelId: args.channelId,
    ensureGeneralForWrite: true,
  });
  const channelPresence = (await args.ctx.db
    .query("communityTypingPresence" as any)
    .withIndex("by_channel_user", (q: any) =>
      q.eq("channelId", channel._id).eq("userId", args.userId),
    )
    .first()) as CommunityTypingPresenceLike | null;
  const legacyPresence = channel.systemRole === "general"
    ? ((await args.ctx.db
        .query("communityTypingPresence" as any)
        .withIndex("by_community_channel_user", (q: any) =>
          q
            .eq("communityId", args.communityId)
            .eq("channelId", undefined)
            .eq("userId", args.userId),
        )
        .first()) as CommunityTypingPresenceLike | null)
    : null;
  const existing = channelPresence ?? legacyPresence;
  if (!existing) return { cleared: false };
  if (
    normalizeTypingRootId(existing.rootId)
    !== requestedRootId
  ) {
    return { cleared: false };
  }
  await args.ctx.db.delete(existing._id as any);
  return { cleared: true };
}

async function communityTypingCandidateRemainsAuthorized(args: {
  ctx: any;
  communityId: any;
  userId: any;
  channel: CommunityChannelLike;
}): Promise<boolean> {
  try {
    const actor = await resolveCommunityChannelActor(args);
    return (await getCommunityChannelCapabilities({ ...args, actor })).canRead;
  } catch {
    return false;
  }
}

async function communityTypingRootRemainsValid(args: {
  ctx: any;
  communityId: any;
  channel: CommunityChannelLike;
  rootId?: any | null;
  cache: Map<string, boolean>;
}): Promise<boolean> {
  const rootId = normalizeTypingRootId(args.rootId);
  if (!rootId) return true;
  const cached = args.cache.get(rootId);
  if (cached !== undefined) return cached;
  const root = await args.ctx.db.get(args.rootId);
  const isValid = Boolean(
    root
    && normalizeIdValue(root.communityId) === normalizeIdValue(args.communityId)
    && root.status === "live"
    && (root.visibilityScope === "community" || root.visibilityScope === "public")
    && interactionBelongsToChannel(root, args.channel)
  );
  args.cache.set(rootId, isValid);
  return isValid;
}

export async function resolveCommunityTypingPresence(args: {
  ctx: any;
  community: CommunityLike;
  channelId?: any | null;
  viewerUserId: any;
}): Promise<{
  totalCount: number;
  totalCountCapped: boolean;
  users: Array<{
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    root_id: string | null;
    display_until_ms: number;
    updated_at: string;
  }>;
}> {
  const nowMs = Date.now();
  const actor = await resolveCommunityChannelActor({ ctx: args.ctx, communityId: args.community._id, userId: args.viewerUserId });
  const channel = await resolveAuthorizedCommunityChannel({
    ctx: args.ctx,
    actor, capability: "canRead",
    communityId: args.community._id,
    channelId: args.channelId,
  });
  const channelRows = channel._id
    ? ((await args.ctx.db
        .query("communityTypingPresence" as any)
        .withIndex("by_channel_displayUntil", (q: any) =>
          q.eq("channelId", channel._id).gt("displayUntil", nowMs),
        )
        .order("desc")
        .take(COMMUNITY_TYPING_PRESENCE_SCAN_LIMIT + 1)) as CommunityTypingPresenceLike[])
    : [];
  const legacyRows = channel.systemRole === "general"
    ? ((await args.ctx.db
        .query("communityTypingPresence" as any)
        .withIndex("by_community_channel_displayUntil", (q: any) =>
          q
            .eq("communityId", args.community._id)
            .eq("channelId", undefined)
            .gt("displayUntil", nowMs),
        )
        .order("desc")
        .take(COMMUNITY_TYPING_PRESENCE_SCAN_LIMIT + 1)) as CommunityTypingPresenceLike[])
    : [];
  const rows = Array.from(
    new Map(
      [...channelRows, ...legacyRows]
        .filter((row) => interactionBelongsToChannel(row, channel))
        .map((row) => [normalizeIdValue(row._id), row]),
    ).values(),
  )
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, COMMUNITY_TYPING_PRESENCE_SCAN_LIMIT + 1);
  const scanWasTruncated = rows.length > COMMUNITY_TYPING_PRESENCE_SCAN_LIMIT;
  const rootValidityCache = new Map<string, boolean>();
  const authorizationResults = await Promise.all(
    rows
      .slice(0, COMMUNITY_TYPING_PRESENCE_SCAN_LIMIT)
      .filter(
        (row) =>
          normalizeIdValue(row.userId) !== normalizeIdValue(args.viewerUserId),
      )
      .map(async (row) => ({
        row,
        authorized:
          await communityTypingCandidateRemainsAuthorized({
            ctx: args.ctx,
            communityId: args.community._id,
            userId: row.userId,
            channel,
          })
          && await communityTypingRootRemainsValid({
            ctx: args.ctx,
            communityId: args.community._id,
            channel,
            rootId: row.rootId,
            cache: rootValidityCache,
          }),
      })),
  );
  const authorizedRows = authorizationResults
    .filter(({ authorized }) => authorized)
    .map(({ row }) => row);
  const publicUserIdCache = new Map<string, string | null>();
  const users = await Promise.all(
    authorizedRows
      .slice(0, COMMUNITY_TYPING_PRESENCE_VISIBLE_LIMIT)
      .map(async (row) => ({
        user_id:
          (await resolvePublicUserId(args.ctx, row.userId, publicUserIdCache))
          ?? normalizeIdValue(row.userId),
        ...(await resolveUserProfileDisplayProjection(args.ctx, row.userId)),
        root_id: normalizeTypingRootId(row.rootId),
        display_until_ms: row.displayUntil,
        updated_at: toIsoString(row.updatedAt),
      })),
  );
  return {
    users,
    totalCount: authorizedRows.length,
    totalCountCapped: scanWasTruncated,
  };
}
