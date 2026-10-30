import {
  COMMUNITY_PRESENCE_FACE_LIMIT,
  COMMUNITY_PRESENCE_SUMMARY_SCAN_LIMIT,
  issueCommunityPresenceLease,
  normalizeCommunityPresenceTimestamp,
} from "../shared/communityPresenceContract";
import {
  type CommunityLike,
  type CommunityMembershipLike,
  countPeopleFacingMembers,
  listActiveTestMemberUserIds,
  listCanonicalCommunityMemberMembershipRows,
  pickMostRelevantCommunityMembership,
  readCommunityActiveMemberCount,
  resolveCommunityLens,
  resolvePublicUserId,
} from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { validateProfileHandle } from "../shared/profileHandle";

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

export async function ensureCommunityPresenceBaseline(args: {
  ctx: any;
  communityId: any;
  userId: any;
  baselineAt: number;
}): Promise<{ created: boolean; lastSeenAt: number }> {
  const baselineAt = normalizeCommunityPresenceTimestamp(args.baselineAt) ?? Date.now();
  const rows = await args.ctx.db
    .query("communityPresence" as any)
    .withIndex("by_community_user", (q: any) =>
      q.eq("communityId", args.communityId).eq("userId", args.userId),
    )
    .collect();
  const existing = rows.reduce((newest: any | null, row: any) => {
    if (!newest) return row;
    return Number(row.lastSeenAt) > Number(newest.lastSeenAt) ? row : newest;
  }, null);
  if (existing) {
    return {
      created: false,
      lastSeenAt: normalizeCommunityPresenceTimestamp(existing.lastSeenAt) ?? baselineAt,
    };
  }
  await args.ctx.db.insert("communityPresence" as any, {
    communityId: args.communityId,
    userId: args.userId,
    lastSeenAt: baselineAt,
    createdAt: baselineAt,
    updatedAt: baselineAt,
  });
  return { created: true, lastSeenAt: baselineAt };
}

export async function deleteCommunityPresenceForUser(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<number> {
  const rows = await args.ctx.db
    .query("communityPresence" as any)
    .withIndex("by_community_user", (q: any) =>
      q.eq("communityId", args.communityId).eq("userId", args.userId),
    )
    .collect();
  await Promise.all(rows.map((row: any) => args.ctx.db.delete(row._id)));
  return rows.length;
}

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

export async function resolveCommunityPresenceAuthorization(args: {
  ctx: any;
  community: CommunityLike;
  userId: any;
}): Promise<{ authorized: boolean; membership: CommunityMembershipLike | null }> {
  if (String(args.community.ownerId) === String(args.userId)) {
    const lens = await resolveCommunityLens({ ctx: args.ctx, community: args.community, membership: null, userId: args.userId });
    return { authorized: lens.entitled, membership: null };
  }
  const membershipRows = (await args.ctx.db
    .query("communityMemberships")
    .withIndex("by_community_user", (q: any) =>
      q.eq("communityId", args.community._id).eq("userId", args.userId),
    )
    .collect()) as CommunityMembershipLike[];
  const membership = pickMostRelevantCommunityMembership(membershipRows);
  const lens = await resolveCommunityLens({ ctx: args.ctx, community: args.community, membership, userId: args.userId });
  return { authorized: lens.entitled, membership: lens.operational ? membership : null };
}

export async function communityPresenceUserRemainsAuthorized(args: {
  ctx: any;
  community: CommunityLike;
  userId: any;
}): Promise<boolean> {
  return (await resolveCommunityPresenceAuthorization(args)).authorized;
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
  for (const entry of onlineUserEntries) {
    const publicUserId =
      (await resolvePublicUserId(ctx, entry.userId, userIdCache))
      ?? String(entry.userId);
    onlineUserIds.push(publicUserId);
  }

  // Same people-facing count as the public stats: owner and test members excluded.
  // The durable count keeps this hot path off a full membership scan; it includes the owner.
  const testUserIds = await listActiveTestMemberUserIds(ctx, community._id);
  const durableMemberCount = readCommunityActiveMemberCount(community);
  const memberCount =
    durableMemberCount !== null
      ? Math.max(0, durableMemberCount - 1 - testUserIds.size)
      : countPeopleFacingMembers(
          (
            await listCanonicalCommunityMemberMembershipRows({
              ctx,
              communityId: community._id,
              community,
            })
          ).rows,
          testUserIds,
        );
  return {
    memberCount,
    onlineCount: onlineUserEntries.length,
    onlineCountCapped: presenceWindow.countCapped,
    onlineFaces,
    onlineUserIds,
  };
}

// Who's online, for a community's site: everyone in the authorized presence
// window, named the way the site's member directory names them.
export async function listCommunityOnlineMembers(
  ctx: any,
  community: CommunityLike,
): Promise<{
  online_count: number;
  online_count_capped: boolean;
  members: Array<{ ref: string; name: string; handle: string | null; avatar_url: string | null }>;
}> {
  const presenceWindow = await resolveAuthorizedCommunityPresenceWindow(ctx, community);
  const members = [];
  for (const { userId } of presenceWindow.entries) {
    const user = await ctx.db.get(userId);
    if (!user) continue;
    const display = await resolveUserProfileDisplayProjection(ctx, user._id);
    const handle = validateProfileHandle(user.normalizedHandle ?? user.handle);
    members.push({
      ref: `user:${String(user._id)}`,
      name: display.display_name ?? "Member",
      handle: handle.ok ? handle.normalizedHandle : null,
      avatar_url: display.avatar_url,
    });
  }
  return {
    online_count: presenceWindow.entries.length,
    online_count_capped: presenceWindow.countCapped,
    members,
  };
}
