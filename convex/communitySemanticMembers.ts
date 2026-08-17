import {
  communityMembershipRowIsActive,
  getUniqueCommunityMembershipByPair,
  normalizeCommunityRoleForOutput,
  readCommunityActiveMemberCount,
  requireCommunityChatAccess,
  type CommunityLike,
  type CommunityMembershipLike,
} from "./communityCore";
import { getUniqueUserByNormalizedHandle, getUniqueUserProfileDetailByUserId } from "./profileCore";
import type { ResolvedCommunityCapabilityContext } from "../shared/communityCapabilityContextContract";
import type {
  MemberProfileSemanticSource,
  MemberSemanticDirectorySource,
} from "../shared/communitySemanticRepository";
import { validateProfileHandle } from "../shared/profileHandle";

export const MEMBER_SEMANTIC_DIRECTORY_DEFAULT_LIMIT = 24;
export const MEMBER_SEMANTIC_DIRECTORY_MAX_LIMIT = 50;

type SemanticMemberUserRow = {
  _id: any;
  displayName?: string;
  handle?: string;
  normalizedHandle?: string;
};

type SemanticMemberProfileDetailRow = {
  displayName?: string;
};

function normalizeSemanticMemberRole(
  value: unknown,
): "owner" | "admin" | "moderator" | "member" {
  return value === "owner" ||
    value === "admin" ||
    value === "moderator"
    ? value
    : "member";
}

function normalizeSemanticDirectoryLimit(value: unknown): number {
  if (value === undefined || value === null) {
    return MEMBER_SEMANTIC_DIRECTORY_DEFAULT_LIMIT;
  }
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return MEMBER_SEMANTIC_DIRECTORY_DEFAULT_LIMIT;
  return Math.max(2, Math.min(MEMBER_SEMANTIC_DIRECTORY_MAX_LIMIT, parsed));
}

function normalizeSemanticDirectoryCursor(value: unknown): string | null {
  const cursor = String(value ?? "").trim();
  if (cursor.length > 2_048) {
    throw new Error("member_semantic_cursor_invalid");
  }
  return cursor || null;
}

function normalizeCommunityId(ctx: any, context: ResolvedCommunityCapabilityContext) {
  const communityId = ctx.db.normalizeId("communities", context.communityId);
  if (!communityId) throw new Error("semantic_community_id_invalid");
  return communityId;
}

async function buildMemberDirectoryEntry(args: {
  ctx: any;
  actorUserId: any;
  communityId: any;
  userId: any;
  role: unknown;
}): Promise<{
  entry: MemberSemanticDirectorySource["entries"][number] | null;
  skippedIncomplete: boolean;
}> {
  try {
    await requireCommunityChatAccess({
      ctx: args.ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
  } catch {
    return { entry: null, skippedIncomplete: false };
  }
  const user = (await args.ctx.db.get(args.userId)) as SemanticMemberUserRow | null;
  if (!user) throw new Error("member_semantic_user_missing");
  const isSelf = String(args.actorUserId) === String(args.userId);
  const validatedHandle = validateProfileHandle(
    user.normalizedHandle ?? user.handle,
  );
  if (validatedHandle.ok) {
    const uniqueUser =
      await getUniqueUserByNormalizedHandle<SemanticMemberUserRow>(
        args.ctx,
        validatedHandle.normalizedHandle,
      );
    if (!uniqueUser || String(uniqueUser._id) !== String(user._id)) {
      throw new Error("member_semantic_handle_mismatch");
    }
  }
  const detail =
    await getUniqueUserProfileDetailByUserId<SemanticMemberProfileDetailRow>(
      args.ctx,
      user._id,
    );
  return {
    entry: {
      userRef: `user:${String(user._id)}`,
      profilePath: validatedHandle.ok
        ? `/users/${validatedHandle.normalizedHandle}/profile.md`
        : null,
      displayName: detail?.displayName ?? user.displayName ?? null,
      handle: validatedHandle.ok ? validatedHandle.normalizedHandle : null,
      role: normalizeSemanticMemberRole(args.role),
      isSelf,
    },
    skippedIncomplete: false,
  };
}

export async function listMemberSemanticDirectory(args: {
  ctx: any;
  actorUserId: any;
  context: ResolvedCommunityCapabilityContext;
  cursor?: string | null;
  limit?: number | null;
}): Promise<MemberSemanticDirectorySource> {
  const communityId = normalizeCommunityId(args.ctx, args.context);
  const community = (await args.ctx.db.get(communityId)) as CommunityLike | null;
  if (!community) throw new Error("semantic_community_not_found");
  const cursor = normalizeSemanticDirectoryCursor(args.cursor);
  const pageSize = normalizeSemanticDirectoryLimit(args.limit);
  const isFirstPage = cursor === null;
  const membershipPageSize = isFirstPage ? pageSize - 1 : pageSize;
  const rawPage = await args.ctx.db
    .query("communityMemberships")
    .withIndex("by_community_createdAt", (q: any) =>
      q.eq("communityId", communityId),
    )
    .order("asc")
    .paginate({
      cursor,
      numItems: membershipPageSize,
      maximumRowsRead: membershipPageSize * 3,
    });
  const candidates: Array<{
    userId: any;
    role: unknown;
  }> = isFirstPage
    ? [{ userId: community.ownerId, role: "owner" }]
    : [];
  for (const row of rawPage.page as CommunityMembershipLike[]) {
    if (
      !communityMembershipRowIsActive(row) ||
      String(row.userId) === String(community.ownerId)
    ) {
      continue;
    }
    candidates.push({
      userId: row.userId,
      role: normalizeCommunityRoleForOutput(row.role) || "member",
    });
  }
  const entries: MemberSemanticDirectorySource["entries"] = [];
  let skippedIncomplete = 0;
  for (const candidate of candidates) {
    const mapped = await buildMemberDirectoryEntry({
      ctx: args.ctx,
      actorUserId: args.actorUserId,
      communityId,
      userId: candidate.userId,
      role: candidate.role,
    });
    if (mapped.entry) entries.push(mapped.entry);
    if (mapped.skippedIncomplete) skippedIncomplete += 1;
  }
  return {
    entries,
    nextCursor: rawPage.isDone ? null : rawPage.continueCursor,
    skippedIncomplete,
    totalCount: readCommunityActiveMemberCount(community),
  };
}

export async function resolveMemberSemanticProfile(args: {
  ctx: any;
  context: ResolvedCommunityCapabilityContext;
  handle?: string | null;
  userId?: string | null;
}): Promise<MemberProfileSemanticSource | null> {
  const validatedHandle = args.handle
    ? validateProfileHandle(args.handle)
    : null;
  if (args.handle && !validatedHandle?.ok) return null;
  const normalizedUserId = args.userId
    ? args.ctx.db.normalizeId("users", args.userId)
    : null;
  if (args.userId && !normalizedUserId) return null;
  const user = validatedHandle?.ok
    ? await getUniqueUserByNormalizedHandle<SemanticMemberUserRow>(
        args.ctx,
        validatedHandle.normalizedHandle,
      )
    : normalizedUserId
      ? ((await args.ctx.db.get(
          normalizedUserId,
        )) as SemanticMemberUserRow | null)
      : null;
  if (!user) return null;
  const communityId = normalizeCommunityId(args.ctx, args.context);
  const { community } = await requireCommunityChatAccess({
    ctx: args.ctx,
    communityId,
    userId: user._id,
  });
  const membership =
    String(community.ownerId) === String(user._id)
      ? null
      : await getUniqueCommunityMembershipByPair({
          ctx: args.ctx,
          communityId,
          userId: user._id,
        });
  if (
    String(community.ownerId) !== String(user._id) &&
    !communityMembershipRowIsActive(membership)
  ) {
    return null;
  }
  const detail =
    await getUniqueUserProfileDetailByUserId<SemanticMemberProfileDetailRow>(
      args.ctx,
      user._id,
    );
  return {
    userRef: `user:${String(user._id)}`,
    profilePath: validatedHandle?.ok
      ? `/users/${validatedHandle.normalizedHandle}/profile.md`
      : null,
    displayName: detail?.displayName ?? user.displayName ?? null,
    handle: validatedHandle?.ok ? validatedHandle.normalizedHandle : null,
    currentCommunity: {
      slug: args.context.communitySlug,
      name:
        String(args.context.membership.communities.name ?? "").trim() ||
        "Community",
      role:
        String(community.ownerId) === String(user._id)
          ? "owner"
          : normalizeSemanticMemberRole(membership?.role),
    },
  };
}
