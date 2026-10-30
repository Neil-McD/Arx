import { query } from "./_generated/server";
import { v } from "convex/values";
import { readCommunityAgentProfile } from "./communityAgentContext";
import {
  type CommunityLike,
  type CommunityMembershipLike,
  communityMembershipRowIsActive,
  countCanonicalCommunityMembersFromRows,
  listCanonicalCommunityMemberMembershipRows,
  normalizeCommunityRoleForOutput,
  readCommunityActiveMemberCount,
  communityMembershipIsCoCreator,
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
import { resolveCommunityPresenceAuthorization } from "./communityPresenceCore";

const COMMUNITY_DIRECTORY_DEFAULT_PAGE_SIZE = 25;
const COMMUNITY_DIRECTORY_MAX_PAGE_SIZE = 100;
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

function normalizeDirectoryPageSize(rawPageSize: number | undefined): number {
  return Math.max(
    2,
    Math.min(
      COMMUNITY_DIRECTORY_MAX_PAGE_SIZE,
      Math.floor(rawPageSize ?? COMMUNITY_DIRECTORY_DEFAULT_PAGE_SIZE),
    ),
  );
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
  lastSeenAt: number | null;
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
    last_active_at: args.lastSeenAt === null ? "" : toIsoString(args.lastSeenAt),
  };
}

async function mapCommunityDirectoryMembershipRow(args: {
  ctx: any;
  row: CommunityMembershipLike;
  userIdCache: Map<string, string | null>;
  lastSeenAt: number | null;
}) {
  return {
    id: String(args.row._id),
    community_id: String(args.row.communityId),
    user_id:
      (await resolvePublicUserId(args.ctx, args.row.userId, args.userIdCache)) ??
      String(args.row.userId),
    ...(await resolveUserProfileDisplayProjection(args.ctx, args.row.userId)),
    role: normalizeCommunityRoleForOutput(args.row.role) || "member",
    co_creator: communityMembershipIsCoCreator(args.row),
    created_at: toIsoString(args.row.createdAt),
    last_active_at: args.lastSeenAt === null ? "" : toIsoString(args.lastSeenAt),
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

    // The agent goes by its profile name (Settings > Agent), else the community's.
    const agentProfile = await readCommunityAgentProfile(ctx, community._id);
    const pushAgentCandidate = () => {
      if (out.length >= limit) return;
      const communityName = String(community.name ?? "").trim();
      const agentName = String(agentProfile?.name ?? "").trim() || communityName;
      if (!agentName) return;
      if (
        queryText &&
        !textMatchesMentionSearch(agentName, queryText) &&
        !textMatchesMentionSearch(communityName, queryText) &&
        !textMatchesMentionSearch("community agent", queryText)
      ) {
        return;
      }
      out.push({
        kind: "community_agent",
        community_id: String(community._id),
        user_id: "community_agent",
        display_name: agentName,
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
    // Version the changed pagination source. Cached presence cursors restart
    // safely; clients already deduplicate directory rows by identity.
    const prefix = `members-v1:${args.communityId}:`;
    const cursor = args.cursor?.startsWith(prefix) ? args.cursor.slice(prefix.length) : null;
    const rawPage = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_createdAt", (q) =>
        q.eq("communityId", args.communityId),
      )
      .order("asc")
      .paginate({
        cursor,
        numItems: cursor === null ? pageSize - 1 : pageSize,
        maximumRowsRead: Math.max(pageSize * 3, pageSize),
      });
    const userIdCache = new Map<string, string | null>();
    const seenUserIds = new Set<string>();
    const memberRows: any[] = [];
    const readActivity = async (userId: any) => {
      const presence = await ctx.db.query("communityPresence").withIndex("by_community_user", q => q.eq("communityId", args.communityId).eq("userId", userId)).first();
      return presence?.lastSeenAt ?? null;
    };
    if (cursor === null) {
      memberRows.push(await mapCommunityDirectoryOwnerRow({ ctx, community, userIdCache, lastSeenAt: await readActivity(community.ownerId) }));
    }
    for (const membership of rawPage.page) {
      if (!communityMembershipRowIsActive(membership) || String(membership.userId) === String(community.ownerId)) continue;
      const userIdKey = String(membership.userId ?? "").trim();
      if (!userIdKey || seenUserIds.has(userIdKey)) continue;
      const authorization = await resolveCommunityPresenceAuthorization({
        ctx,
        community,
        userId: membership.userId,
      });
      if (!authorization.authorized) continue;
      if (!authorization.membership || String(authorization.membership._id) !== String(membership._id)) {
        continue;
      }
      seenUserIds.add(userIdKey);
      memberRows.push(await mapCommunityDirectoryMembershipRow({
        ctx,
        row: authorization.membership,
        userIdCache,
        lastSeenAt: await readActivity(membership.userId),
      }));
    }
    return {
      page: memberRows,
      totalCount: readCommunityActiveMemberCount(community),
      continueCursor: rawPage.isDone ? null : prefix + rawPage.continueCursor,
      isDone: rawPage.isDone,
    };
  },
});
