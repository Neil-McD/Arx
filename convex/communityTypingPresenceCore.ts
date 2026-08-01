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
  requireCommunityChatAccess,
  resolvePublicUserId,
  toIsoString,
} from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import {
  ensureGeneralChannel,
  getGeneralChannel,
  interactionBelongsToGeneralChannel,
  requireChannelForAddressableRoot,
} from "./communityChannelCore";

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
  channelId: any;
  rootId?: any | null;
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
  });
  if (normalizeIdValue(rootChannel._id) !== normalizeIdValue(args.channelId)) {
    throw new Error("community_typing_scope_invalid");
  }
  return root._id;
}

export async function renewCommunityTypingLease(args: {
  ctx: any;
  communityId: any;
  userId: any;
  rootId?: any | null;
  nowMs?: number;
}): Promise<{ displayUntil: number; rootId: string | null; updatedAt: number }> {
  const channel = await ensureGeneralChannel({
    ctx: args.ctx,
    communityId: args.communityId,
    nowMs: args.nowMs,
  });
  const validatedRootId = await requireCommunityTypingRoot({
    ...args,
    channelId: channel._id,
  });
  const issuedLease = issueTypingPresenceLease(args.nowMs ?? Date.now());
  const channelPresence = (await args.ctx.db
    .query("communityTypingPresence" as any)
    .withIndex("by_channel_user", (q: any) =>
      q.eq("channelId", channel._id).eq("userId", args.userId),
    )
    .first()) as CommunityTypingPresenceLike | null;
  const existing = channelPresence ?? ((await args.ctx.db
    .query("communityTypingPresence" as any)
    .withIndex("by_community_channel_user", (q: any) =>
      q
        .eq("communityId", args.communityId)
        .eq("channelId", undefined)
        .eq("userId", args.userId),
    )
    .first()) as CommunityTypingPresenceLike | null);

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
  userId: any;
  rootId?: any | null;
}): Promise<{ cleared: boolean }> {
  const requestedRootId = normalizeTypingRootId(args.rootId);
  const channel = await ensureGeneralChannel({
    ctx: args.ctx,
    communityId: args.communityId,
  });
  const channelPresence = (await args.ctx.db
    .query("communityTypingPresence" as any)
    .withIndex("by_channel_user", (q: any) =>
      q.eq("channelId", channel._id).eq("userId", args.userId),
    )
    .first()) as CommunityTypingPresenceLike | null;
  const existing = channelPresence ?? ((await args.ctx.db
    .query("communityTypingPresence" as any)
    .withIndex("by_community_channel_user", (q: any) =>
      q
        .eq("communityId", args.communityId)
        .eq("channelId", undefined)
        .eq("userId", args.userId),
    )
    .first()) as CommunityTypingPresenceLike | null);
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
}): Promise<boolean> {
  try {
    await requireCommunityChatAccess(args);
    return true;
  } catch {
    return false;
  }
}

async function communityTypingRootRemainsValid(args: {
  ctx: any;
  communityId: any;
  channelId?: any;
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
    && (
      !args.channelId
      || !root.channelId
      || normalizeIdValue(root.channelId) === normalizeIdValue(args.channelId)
    )
  );
  args.cache.set(rootId, isValid);
  return isValid;
}

export async function resolveCommunityTypingPresence(args: {
  ctx: any;
  community: CommunityLike;
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
  const generalChannel = await getGeneralChannel(args.ctx, args.community._id);
  const channelRows = generalChannel
    ? ((await args.ctx.db
        .query("communityTypingPresence" as any)
        .withIndex("by_channel_displayUntil", (q: any) =>
          q.eq("channelId", generalChannel._id).gt("displayUntil", nowMs),
        )
        .order("desc")
        .take(COMMUNITY_TYPING_PRESENCE_SCAN_LIMIT + 1)) as CommunityTypingPresenceLike[])
    : [];
  const legacyRows = (await args.ctx.db
    .query("communityTypingPresence" as any)
    .withIndex("by_community_channel_displayUntil", (q: any) =>
      q
        .eq("communityId", args.community._id)
        .eq("channelId", undefined)
        .gt("displayUntil", nowMs),
    )
    .order("desc")
    .take(COMMUNITY_TYPING_PRESENCE_SCAN_LIMIT + 1)) as CommunityTypingPresenceLike[];
  const rows = Array.from(
    new Map(
      [...channelRows, ...legacyRows]
        .filter((row) => interactionBelongsToGeneralChannel(row, generalChannel))
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
          })
          && await communityTypingRootRemainsValid({
            ctx: args.ctx,
            communityId: args.community._id,
            channelId: generalChannel?._id,
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
