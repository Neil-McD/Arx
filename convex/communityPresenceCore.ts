import {
  COMMUNITY_PRESENCE_FACE_LIMIT,
  COMMUNITY_PRESENCE_SUMMARY_SCAN_LIMIT,
  issueCommunityPresenceLease,
  normalizeCommunityPresenceTimestamp,
} from "../shared/communityPresenceContract";
import {
  type CommunityLike,
  type CommunityMembershipLike,
  communityUserIsBlocked,
  countCanonicalCommunityMembersFromRows,
  listCanonicalCommunityMemberMembershipRows,
  pickMostRelevantCommunityMembership,
  readCommunityActiveMemberCount,
  resolveCommunityMembershipEntitlementState,
  resolvePublicUserId,
  toIsoString,
} from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";

export {
  COMMUNITY_PRESENCE_FACE_LIMIT,
  COMMUNITY_PRESENCE_HEARTBEAT_INTERVAL_MS,
  COMMUNITY_PRESENCE_LEASE_DURATION_MS,
  COMMUNITY_PRESENCE_SUMMARY_SCAN_LIMIT,
  communityPresenceLeaseIsActive,
  issueCommunityPresenceLease,
  normalizeCommunityPresenceTimestamp,
} from "../shared/communityPresenceContract";

type CommunityPresenceFace = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_storage_id?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

export type AuthorizedCommunityPresenceEntry = {
  userId: any;
  lastSeenAt: number;
};

export async function renewCommunityPresenceLease(args: {
  ctx: any;
  communityId: any;
  userId: any;
  nowMs?: number;
}): Promise<{ activeUntil: number; lastSeenAt: number }> {
  const nowMs = args.nowMs ?? Date.now();
  const issuedLease = issueCommunityPresenceLease(nowMs);
  const existing = await args.ctx.db
    .query("communityPresence" as any)
    .withIndex("by_community_user", (q: any) =>
      q.eq("communityId", args.communityId).eq("userId", args.userId),
    )
    .first();
  if (existing) {
    const currentLastSeenAt =
      normalizeCommunityPresenceTimestamp(existing.lastSeenAt) ?? 0;
    const lease = issueCommunityPresenceLease(
      Math.max(currentLastSeenAt, issuedLease.lastSeenAt),
    );
    await args.ctx.db.patch(existing._id, {
      ...lease,
      updatedAt: lease.lastSeenAt,
    });
    return lease;
  }
  await args.ctx.db.insert("communityPresence" as any, {
    communityId: args.communityId,
    userId: args.userId,
    ...issuedLease,
    createdAt: issuedLease.lastSeenAt,
    updatedAt: issuedLease.lastSeenAt,
  });
  return issuedLease;
}

async function communityPresenceUserRemainsAuthorized(args: {
  ctx: any;
  community: CommunityLike;
  userId: any;
}): Promise<boolean> {
  if (String(args.community.ownerId) === String(args.userId)) return true;
  const membershipRows = (await args.ctx.db
    .query("communityMemberships")
    .withIndex("by_community_user", (q: any) =>
      q.eq("communityId", args.community._id).eq("userId", args.userId),
    )
    .collect()) as CommunityMembershipLike[];
  const membership = pickMostRelevantCommunityMembership(membershipRows);
  if (
    await communityUserIsBlocked({
      ctx: args.ctx,
      communityId: args.community._id,
      userId: args.userId,
    })
  ) {
    return false;
  }
  const entitlement = await resolveCommunityMembershipEntitlementState({
    ctx: args.ctx,
    community: args.community,
    membership,
    userId: args.userId,
  });
  return entitlement.isEntitled;
}

export async function resolveAuthorizedCommunityPresenceWindow(
  ctx: any,
  community: CommunityLike,
  nowMs = Date.now(),
): Promise<{
  entries: AuthorizedCommunityPresenceEntry[];
  countCapped: boolean;
}> {
  const rows = (await ctx.db
    .query("communityPresence" as any)
    .withIndex("by_community_activeUntil", (q: any) =>
      q.eq("communityId", community._id).gt("activeUntil", nowMs),
    )
    .order("desc")
    .take(COMMUNITY_PRESENCE_SUMMARY_SCAN_LIMIT + 1)) as Array<{
      userId: any;
      lastSeenAt: number;
    }>;
  const countCapped = rows.length > COMMUNITY_PRESENCE_SUMMARY_SCAN_LIMIT;
  const candidateRows = rows.slice(0, COMMUNITY_PRESENCE_SUMMARY_SCAN_LIMIT);
  const authorizationResults = await Promise.all(
    candidateRows.map(async (row) => ({
      row,
      authorized: await communityPresenceUserRemainsAuthorized({
        ctx,
        community,
        userId: row.userId,
      }),
    })),
  );
  const entries: AuthorizedCommunityPresenceEntry[] = [];
  const seenUserIds = new Set<string>();
  for (const { row, authorized } of authorizationResults) {
    const normalizedUserId = String(row.userId ?? "").trim();
    const lastSeenAt = normalizeCommunityPresenceTimestamp(row.lastSeenAt);
    if (
      !authorized
      || !normalizedUserId
      || lastSeenAt === null
      || seenUserIds.has(normalizedUserId)
    ) {
      continue;
    }
    seenUserIds.add(normalizedUserId);
    entries.push({ userId: row.userId, lastSeenAt });
  }
  return { entries, countCapped };
}

export async function resolveMemberCommunityPresenceSummary(
  ctx: any,
  community: CommunityLike,
): Promise<{
  memberCount: number;
  onlineCount: number;
  onlineCountCapped: boolean;
  onlineFaces: CommunityPresenceFace[];
  onlineUserIds: string[];
  onlineLastActiveAtByUserId: Record<string, string>;
}> {
  const presenceWindow = await resolveAuthorizedCommunityPresenceWindow(
    ctx,
    community,
  );
  const onlineUserEntries = presenceWindow.entries;

  const userIdCache = new Map<string, string | null>();
  const onlineFaces = (
    await Promise.all(
      onlineUserEntries
        .slice(0, COMMUNITY_PRESENCE_FACE_LIMIT)
        .map(async ({ userId }): Promise<CommunityPresenceFace | null> => {
          const user = await ctx.db.get(userId);
          if (!user) return null;
          return {
            user_id:
              (await resolvePublicUserId(ctx, user._id, userIdCache))
              ?? String(user._id),
            ...(await resolveUserProfileDisplayProjection(ctx, user._id)),
          };
        }),
    )
  ).filter(Boolean) as CommunityPresenceFace[];

  const onlineUserIds: string[] = [];
  const onlineLastActiveAtByUserId: Record<string, string> = {};
  for (const entry of onlineUserEntries) {
    const publicUserId =
      (await resolvePublicUserId(ctx, entry.userId, userIdCache))
      ?? String(entry.userId);
    onlineUserIds.push(publicUserId);
    onlineLastActiveAtByUserId[publicUserId] = toIsoString(entry.lastSeenAt);
  }

  const durableMemberCount = readCommunityActiveMemberCount(community);
  const memberCount =
    durableMemberCount
    ?? countCanonicalCommunityMembersFromRows(
      (
        await listCanonicalCommunityMemberMembershipRows({
          ctx,
          communityId: community._id,
          community,
        })
      ).rows,
    );
  return {
    memberCount,
    onlineCount: onlineUserEntries.length,
    onlineCountCapped: presenceWindow.countCapped,
    onlineFaces,
    onlineUserIds,
    onlineLastActiveAtByUserId,
  };
}
