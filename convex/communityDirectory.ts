import { query } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityLike,
  type CommunityMembershipLike,
  countCanonicalCommunityMembersFromRows,
  listCanonicalCommunityMemberMembershipRows,
  normalizeCommunityRoleForOutput,
  requireCommunityChatAccess,
  resolvePublicUserId,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";

const COMMUNITY_DIRECTORY_DEFAULT_PAGE_SIZE = 25;
const COMMUNITY_DIRECTORY_MAX_PAGE_SIZE = 100;

function normalizeDirectoryPageSize(rawPageSize: number | undefined): number {
  return Math.max(
    1,
    Math.min(
      COMMUNITY_DIRECTORY_MAX_PAGE_SIZE,
      Math.floor(rawPageSize ?? COMMUNITY_DIRECTORY_DEFAULT_PAGE_SIZE),
    ),
  );
}

function normalizeDirectoryCursor(rawCursor: string | null | undefined): number {
  const cursor = String(rawCursor ?? "").trim();
  if (!cursor) return 0;
  const parsed = Number(cursor);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

async function resolveCommunityDirectoryContext(args: {
  ctx: any;
  userId?: any;
  authSubject?: string | null;
  communityId: any;
}): Promise<{ community: CommunityLike }> {
  const userId = await resolveUserIdForAuthenticatedRequest({
    ctx: args.ctx,
    userId: args.userId,
    authSubject: args.authSubject ?? null,
  });
  return await requireCommunityChatAccess({
    ctx: args.ctx,
    communityId: args.communityId,
    userId,
  });
}

async function mapCommunityDirectoryOwnerRow(args: {
  ctx: any;
  community: CommunityLike;
  userIdCache: Map<string, string | null>;
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
  };
}

async function mapCommunityDirectoryMembershipRow(args: {
  ctx: any;
  row: CommunityMembershipLike;
  userIdCache: Map<string, string | null>;
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
  };
}

export const countCommunityDirectoryMembers = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const { community } = await resolveCommunityDirectoryContext({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
      communityId: args.communityId,
    });
    const canonicalRows = await listCanonicalCommunityMemberMembershipRows({
      ctx,
      communityId: args.communityId,
      community,
    });
    return countCanonicalCommunityMembersFromRows(canonicalRows.rows);
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
    const offset = normalizeDirectoryCursor(args.cursor);
    const canonicalRows = await listCanonicalCommunityMemberMembershipRows({
      ctx,
      communityId: args.communityId,
      community,
    });
    const activeRows = canonicalRows.rows;
    const totalCount = countCanonicalCommunityMembersFromRows(activeRows);
    const userIdCache = new Map<string, string | null>();
    const includeOwner = offset === 0;
    const memberStart = Math.max(0, offset - 1);
    const memberTake = includeOwner ? pageSize - 1 : pageSize;
    const selectedMemberRows =
      memberTake > 0
        ? activeRows.slice(memberStart, memberStart + memberTake)
        : [];
    const ownerRows = includeOwner
      ? [
          await mapCommunityDirectoryOwnerRow({
            ctx,
            community,
            userIdCache,
          }),
        ]
      : [];
    const memberRows = await Promise.all(
      selectedMemberRows.map((row) =>
        mapCommunityDirectoryMembershipRow({
          ctx,
          row,
          userIdCache,
        }),
      ),
    );
    const page = [...ownerRows, ...memberRows];
    const nextOffset = Math.min(totalCount, offset + page.length);
    const isDone = nextOffset >= totalCount;
    return {
      page,
      totalCount,
      continueCursor: isDone ? null : String(nextOffset),
      isDone,
    };
  },
});
