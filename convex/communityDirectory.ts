import { query } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityLike,
  type CommunityMembershipLike,
  communityMembershipRowIsActive,
  countCanonicalCommunityMembersFromRows,
  listCanonicalCommunityMemberMembershipRows,
  normalizeCommunityRoleForOutput,
  pickMostRelevantCommunityMembership,
  readCommunityActiveMemberCount,
  requireCommunityChatAccess,
  requireCommunityManager,
  resolvePublicUserId,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import { normalizeProfileHandle } from "../shared/profileHandle";
import {
  resolveUserProfileDisplayProjection,
  resolveUserProfileDisplayProjectionForUser,
} from "./userProfileProjection";
import { readEverybodyMentionEmailAvailability } from "./communityMentionBroadcasts";

const COMMUNITY_DIRECTORY_DEFAULT_PAGE_SIZE = 25;
const COMMUNITY_DIRECTORY_MAX_PAGE_SIZE = 100;
const COMMUNITY_DIRECTORY_CURSOR_PREFIX = "community_directory_v2:";
const COMMUNITY_DIRECTORY_PAIR_SCAN_LIMIT = 16;
const COMMUNITY_MENTION_SEARCH_DEFAULT_LIMIT = 8;
const COMMUNITY_MENTION_SEARCH_MAX_LIMIT = 12;
const COMMUNITY_MENTION_SEARCH_MAX_RAW_QUERY_CHARS = 128;
const COMMUNITY_MENTION_SEARCH_MAX_QUERY_CHARS = 40;
const EVERYBODY_MENTION_ALIASES = ["everybody", "everyone"];

type CommunityMentionUserRow = {
  _id: any;
  displayName?: string;
  handle?: string;
  normalizedHandle?: string;
  avatarUrl?: string;
};

type CommunityPresenceRow = {
  _id: any;
  userId?: any;
  lastSeenAt?: number | null;
};

type CommunityDirectoryCursor =
  | {
      version: 2;
      phase: "activity";
      cursor: string | null;
    }
  | {
      version: 2;
      phase: "inactive";
      cursor: string | null;
      ownerPending: boolean;
    };

type CommunityDirectoryInactivePage = {
  rows: any[];
  continueCursor: string | null;
  isDone: boolean;
};

function normalizeDirectoryPageSize(rawPageSize: number | undefined): number {
  return Math.max(
    2,
    Math.min(
      COMMUNITY_DIRECTORY_MAX_PAGE_SIZE,
      Math.floor(rawPageSize ?? COMMUNITY_DIRECTORY_DEFAULT_PAGE_SIZE),
    ),
  );
}

function normalizeCommunityDirectoryLastSeenAt(raw: unknown): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function encodeCommunityDirectoryCursor(cursor: CommunityDirectoryCursor): string {
  return `${COMMUNITY_DIRECTORY_CURSOR_PREFIX}${encodeURIComponent(JSON.stringify(cursor))}`;
}

function decodeCommunityDirectoryCursor(
  rawCursor: string | null | undefined,
): CommunityDirectoryCursor {
  const raw = String(rawCursor ?? "").trim();
  if (!raw) {
    return { version: 2, phase: "activity", cursor: null };
  }
  if (!raw.startsWith(COMMUNITY_DIRECTORY_CURSOR_PREFIX) || raw.length > 20_000) {
    throw new Error("community_directory_cursor_invalid");
  }
  try {
    const decoded = JSON.parse(
      decodeURIComponent(raw.slice(COMMUNITY_DIRECTORY_CURSOR_PREFIX.length)),
    ) as Partial<CommunityDirectoryCursor>;
    if (decoded.version !== 2) throw new Error("version");
    if (decoded.cursor !== null && decoded.cursor !== undefined && typeof decoded.cursor !== "string") {
      throw new Error("cursor");
    }
    const cursor = typeof decoded.cursor === "string" && decoded.cursor
      ? decoded.cursor
      : null;
    if (decoded.phase === "activity") {
      return { version: 2, phase: "activity", cursor };
    }
    if (decoded.phase === "inactive" && typeof decoded.ownerPending === "boolean") {
      return {
        version: 2,
        phase: "inactive",
        cursor,
        ownerPending: decoded.ownerPending,
      };
    }
  } catch {
    throw new Error("community_directory_cursor_invalid");
  }
  throw new Error("community_directory_cursor_invalid");
}

function normalizeMentionSearchLimit(rawLimit: number | undefined): number {
  const limit = Number(rawLimit ?? COMMUNITY_MENTION_SEARCH_DEFAULT_LIMIT);
  if (!Number.isFinite(limit)) return COMMUNITY_MENTION_SEARCH_DEFAULT_LIMIT;
  return Math.max(
    1,
    Math.min(
      COMMUNITY_MENTION_SEARCH_MAX_LIMIT,
      Math.floor(limit),
    ),
  );
}

function normalizeMentionSearchQuery(rawQuery: unknown): string {
  return String(rawQuery ?? "")
    .slice(0, COMMUNITY_MENTION_SEARCH_MAX_RAW_QUERY_CHARS)
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .slice(0, COMMUNITY_MENTION_SEARCH_MAX_QUERY_CHARS);
}

function textMatchesMentionSearch(value: unknown, query: string): boolean {
  if (!query) return true;
  return String(value ?? "").trim().toLowerCase().includes(query);
}

function userMatchesMentionSearch(user: CommunityMentionUserRow, query: string): boolean {
  if (!query) return true;
  const normalizedHandle = normalizeProfileHandle(user.normalizedHandle ?? user.handle);
  if (normalizedHandle.includes(normalizeProfileHandle(query))) return true;
  return textMatchesMentionSearch(user.displayName, query);
}

async function resolveCommunityDirectoryContext(args: {
  ctx: any;
  userId?: any;
  authSubject?: string | null;
  communityId: any;
}): Promise<{ community: CommunityLike; userId: any }> {
  const userId = await resolveUserIdForAuthenticatedRequest({
    ctx: args.ctx,
    userId: args.userId,
    authSubject: args.authSubject ?? null,
  });
  const { community } = await requireCommunityChatAccess({
    ctx: args.ctx,
    communityId: args.communityId,
    userId,
  });
  return { community, userId };
}

async function mapCommunityDirectoryOwnerRow(args: {
  ctx: any;
  community: CommunityLike;
  userIdCache: Map<string, string | null>;
  lastActiveAt?: number | null;
}) {
  return {
    id: `owner:${String(args.community._id)}`,
    community_id: String(args.community._id),
    user_id:
      (await resolvePublicUserId(args.ctx, args.community.ownerId, args.userIdCache)) ??
      String(args.community.ownerId),
    ...(await resolveUserProfileDisplayProjection(args.ctx, args.community.ownerId)),
    role: "owner",
    created_at: toIsoString(args.community.createdAt),
    last_active_at: args.lastActiveAt ? toIsoString(args.lastActiveAt) : null,
  };
}

async function mapCommunityDirectoryMembershipRow(args: {
  ctx: any;
  row: CommunityMembershipLike;
  userIdCache: Map<string, string | null>;
  lastActiveAt?: number | null;
}) {
  return {
    id: String(args.row._id),
    community_id: String(args.row.communityId),
    user_id:
      (await resolvePublicUserId(args.ctx, args.row.userId, args.userIdCache)) ??
      String(args.row.userId),
    ...(await resolveUserProfileDisplayProjection(args.ctx, args.row.userId)),
    role: normalizeCommunityRoleForOutput(args.row.role) || "member",
    created_at: toIsoString(args.row.createdAt),
    last_active_at: args.lastActiveAt ? toIsoString(args.lastActiveAt) : null,
  };
}

async function readCommunityDirectoryMembership(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<CommunityMembershipLike | null> {
  const rows = (await args.ctx.db
    .query("communityMemberships")
    .withIndex("by_community_user", (q: any) =>
      q.eq("communityId", args.communityId).eq("userId", args.userId),
    )
    .order("desc")
    .take(COMMUNITY_DIRECTORY_PAIR_SCAN_LIMIT + 1)) as CommunityMembershipLike[];
  if (rows.length > COMMUNITY_DIRECTORY_PAIR_SCAN_LIMIT) {
    throw new Error("community_directory_membership_history_limit_exceeded");
  }
  return pickMostRelevantCommunityMembership(rows);
}

async function readCommunityDirectoryLastSeenAt(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<number | null> {
  const rows = (await args.ctx.db
    .query("communityPresence" as any)
    .withIndex("by_community_user", (q: any) =>
      q.eq("communityId", args.communityId).eq("userId", args.userId),
    )
    .order("desc")
    .take(COMMUNITY_DIRECTORY_PAIR_SCAN_LIMIT + 1)) as CommunityPresenceRow[];
  if (rows.length > COMMUNITY_DIRECTORY_PAIR_SCAN_LIMIT) {
    throw new Error("community_directory_presence_history_limit_exceeded");
  }
  let latest: number | null = null;
  for (const row of rows) {
    const value = normalizeCommunityDirectoryLastSeenAt(row.lastSeenAt);
    if (value !== null && (latest === null || value > latest)) latest = value;
  }
  return latest;
}

async function mapCommunityDirectoryActivityRow(args: {
  ctx: any;
  community: CommunityLike;
  presence: CommunityPresenceRow;
  userIdCache: Map<string, string | null>;
}) {
  const userId = args.presence.userId;
  const lastActiveAt = normalizeCommunityDirectoryLastSeenAt(args.presence.lastSeenAt);
  if (!userId || lastActiveAt === null) return null;
  if (String(userId) === String(args.community.ownerId)) {
    return await mapCommunityDirectoryOwnerRow({
      ctx: args.ctx,
      community: args.community,
      userIdCache: args.userIdCache,
      lastActiveAt,
    });
  }
  const membership = await readCommunityDirectoryMembership({
    ctx: args.ctx,
    communityId: args.community._id,
    userId,
  });
  if (!communityMembershipRowIsActive(membership)) return null;
  return await mapCommunityDirectoryMembershipRow({
    ctx: args.ctx,
    row: membership!,
    userIdCache: args.userIdCache,
    lastActiveAt,
  });
}

async function listCommunityDirectoryInactivePage(args: {
  ctx: any;
  community: CommunityLike;
  cursor: string | null;
  ownerPending: boolean;
  pageSize: number;
  userIdCache: Map<string, string | null>;
}): Promise<CommunityDirectoryInactivePage> {
  const rows: any[] = [];
  if (args.ownerPending) {
    const ownerLastSeenAt = await readCommunityDirectoryLastSeenAt({
      ctx: args.ctx,
      communityId: args.community._id,
      userId: args.community.ownerId,
    });
    if (ownerLastSeenAt === null) {
      rows.push(await mapCommunityDirectoryOwnerRow({
        ctx: args.ctx,
        community: args.community,
        userIdCache: args.userIdCache,
      }));
    }
  }
  const remaining = Math.max(0, args.pageSize - rows.length);
  if (remaining === 0) {
    return {
      rows,
      continueCursor: encodeCommunityDirectoryCursor({
        version: 2,
        phase: "inactive",
        cursor: args.cursor,
        ownerPending: false,
      }),
      isDone: false,
    };
  }
  const rawPage = await args.ctx.db
    .query("communityMemberships")
    .withIndex("by_community_createdAt", (q: any) =>
      q.eq("communityId", args.community._id),
    )
    .order("asc")
    .paginate({
      cursor: args.cursor,
      numItems: remaining,
      maximumRowsRead: Math.max(remaining * 3, remaining),
    });
  const candidateRows = (rawPage.page as CommunityMembershipLike[]).filter(
    (row) =>
      communityMembershipRowIsActive(row) &&
      String(row.userId) !== String(args.community.ownerId),
  );
  const mapped = await Promise.all(
    candidateRows.map(async (row) => {
      const lastSeenAt = await readCommunityDirectoryLastSeenAt({
        ctx: args.ctx,
        communityId: args.community._id,
        userId: row.userId,
      });
      if (lastSeenAt !== null) return null;
      return await mapCommunityDirectoryMembershipRow({
        ctx: args.ctx,
        row,
        userIdCache: args.userIdCache,
      });
    }),
  );
  rows.push(...mapped.filter(Boolean));
  const isDone = rawPage.isDone;
  return {
    rows,
    continueCursor: isDone
      ? null
      : encodeCommunityDirectoryCursor({
          version: 2,
          phase: "inactive",
          cursor: rawPage.continueCursor,
          ownerPending: false,
        }),
    isDone,
  };
}

async function mapCommunityMentionUserCandidate(args: {
  ctx: any;
  community: CommunityLike;
  user: CommunityMentionUserRow;
  role: string;
  userIdCache: Map<string, string | null>;
}) {
  const handle = normalizeProfileHandle(args.user.handle ?? args.user.normalizedHandle);
  if (!handle) return null;
  const projection = await resolveUserProfileDisplayProjectionForUser(args.ctx, args.user);
  return {
    kind: "user",
    community_id: String(args.community._id),
    user_id:
      (await resolvePublicUserId(args.ctx, args.user._id, args.userIdCache)) ??
      String(args.user._id),
    display_name: projection.display_name ?? handle,
    handle,
    avatar_url: projection.avatar_url,
    avatar_focus_x: projection.avatar_focus_x,
    avatar_focus_y: projection.avatar_focus_y,
    avatar_zoom: projection.avatar_zoom,
    role: args.role,
  };
}

export const searchCommunityMentionCandidates = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    query: v.optional(v.string()),
    limit: v.optional(v.number()),
    includeRoles: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { community, userId } = await resolveCommunityDirectoryContext({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
      communityId: args.communityId,
    });
    const queryText = normalizeMentionSearchQuery(args.query);
    const limit = normalizeMentionSearchLimit(args.limit);
    const includeRoles = args.includeRoles !== false;
    const out: any[] = [];
    const userIdCache = new Map<string, string | null>();

    const pushAgentCandidate = () => {
      if (out.length >= limit) return;
      const communityName = String(community.name ?? "").trim();
      if (!communityName) return;
      if (
        queryText &&
        !textMatchesMentionSearch(communityName, queryText) &&
        !textMatchesMentionSearch("community agent", queryText)
      ) {
        return;
      }
      out.push({
        kind: "community_agent",
        community_id: String(community._id),
        user_id: "community_agent",
        display_name: communityName,
        handle: null,
        avatar_url: null,
        agent_key: "community_agent",
      });
    };

    const canMentionEverybody = includeRoles && await (async () => {
      try {
        await requireCommunityManager({
          ctx,
          communityId: args.communityId,
          userId,
        });
        return true;
      } catch {
        return false;
      }
    })();

    const pushEverybodyCandidate = async (memberCount: number) => {
      if (!canMentionEverybody || out.length >= limit) return;
      if (
        queryText &&
        !EVERYBODY_MENTION_ALIASES.some((alias) => alias.includes(queryText))
      ) {
        return;
      }
      const emailAvailability = await readEverybodyMentionEmailAvailability({
        ctx,
        communityId: args.communityId,
      });
      const memberLabel = memberCount > 0
        ? memberCount.toLocaleString()
        : "the whole community";
      const subtitle =
        emailAvailability.emailMode === "in_app_and_email"
          ? memberCount > 0
            ? `Notifies ${memberLabel} in-app; emails unread members after 15 min`
            : "Notifies in-app; emails unread members after 15 min"
          : memberCount > 0
            ? `Notifies ${memberLabel} in-app; email blast on cooldown`
            : "Notifies in-app; email blast on cooldown";
      out.push({
        kind: "role",
        community_id: String(community._id),
        user_id: "role:everybody",
        display_name: "Everybody",
        handle: "everybody",
        avatar_url: null,
        role_key: "everybody",
        subtitle,
        email_mode: emailAvailability.emailMode,
        email_cooldown_until: emailAvailability.cooldownUntil
          ? toIsoString(emailAvailability.cooldownUntil)
          : null,
        match_aliases: EVERYBODY_MENTION_ALIASES.filter((alias) => alias !== "everybody"),
      });
    };

    pushAgentCandidate();

    const canonicalRows = await listCanonicalCommunityMemberMembershipRows({
      ctx,
      communityId: args.communityId,
      community,
    });
    await pushEverybodyCandidate(countCanonicalCommunityMembersFromRows(canonicalRows.rows));

    const addUserCandidate = async (targetUserId: any, role: string) => {
      if (out.length >= limit) return;
      if (String(targetUserId) === String(userId)) return;
      const user = (await ctx.db.get(targetUserId)) as CommunityMentionUserRow | null;
      if (!user || !userMatchesMentionSearch(user, queryText)) return;
      const candidate = await mapCommunityMentionUserCandidate({
        ctx,
        community,
        user,
        role,
        userIdCache,
      });
      if (candidate) out.push(candidate);
    };

    await addUserCandidate(community.ownerId, "owner");
    for (const row of canonicalRows.rows) {
      if (out.length >= limit) break;
      await addUserCandidate(row.userId, normalizeCommunityRoleForOutput(row.role) || "member");
    }

    return out;
  },
});

export const listCommunityDirectoryPage = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    cursor: v.optional(v.union(v.string(), v.null())),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { community } = await resolveCommunityDirectoryContext({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
      communityId: args.communityId,
    });
    const pageSize = normalizeDirectoryPageSize(args.pageSize);
    const cursor = decodeCommunityDirectoryCursor(args.cursor);
    const userIdCache = new Map<string, string | null>();
    if (cursor.phase === "inactive") {
      const inactivePage = await listCommunityDirectoryInactivePage({
        ctx,
        community,
        cursor: cursor.cursor,
        ownerPending: cursor.ownerPending,
        pageSize,
        userIdCache,
      });
      return {
        page: inactivePage.rows,
        totalCount: readCommunityActiveMemberCount(community),
        continueCursor: inactivePage.continueCursor,
        isDone: inactivePage.isDone,
      };
    }

    if (cursor.cursor === null) {
      const firstPresenceRow = await ctx.db
        .query("communityPresence" as any)
        .withIndex("by_community_lastSeenAt", (q: any) =>
          q.eq("communityId", args.communityId),
        )
        .order("desc")
        .first();
      if (!firstPresenceRow) {
        const inactivePage = await listCommunityDirectoryInactivePage({
          ctx,
          community,
          cursor: null,
          ownerPending: true,
          pageSize,
          userIdCache,
        });
        return {
          page: inactivePage.rows,
          totalCount: readCommunityActiveMemberCount(community),
          continueCursor: inactivePage.continueCursor,
          isDone: inactivePage.isDone,
        };
      }
    }

    const rawActivityPage = await ctx.db
      .query("communityPresence" as any)
      .withIndex("by_community_lastSeenAt", (q: any) =>
        q.eq("communityId", args.communityId),
      )
      .order("desc")
      .paginate({
        cursor: cursor.cursor,
        numItems: pageSize,
        maximumRowsRead: Math.max(pageSize * 3, pageSize),
      });
    const seenUserIds = new Set<string>();
    const activityRows = (
      await Promise.all(
        (rawActivityPage.page as CommunityPresenceRow[]).map(async (presence) => {
          const userId = String(presence.userId ?? "").trim();
          if (!userId || seenUserIds.has(userId)) return null;
          seenUserIds.add(userId);
          return await mapCommunityDirectoryActivityRow({
            ctx,
            community,
            presence,
            userIdCache,
          });
        }),
      )
    ).filter(Boolean);

    if (!rawActivityPage.isDone) {
      return {
        page: activityRows,
        totalCount: readCommunityActiveMemberCount(community),
        continueCursor: encodeCommunityDirectoryCursor({
          version: 2,
          phase: "activity",
          cursor: rawActivityPage.continueCursor,
        }),
        isDone: false,
      };
    }

    return {
      page: activityRows,
      totalCount: readCommunityActiveMemberCount(community),
      continueCursor: encodeCommunityDirectoryCursor({
        version: 2,
        phase: "inactive",
        cursor: null,
        ownerPending: true,
      }),
      isDone: false,
    };
  },
});
