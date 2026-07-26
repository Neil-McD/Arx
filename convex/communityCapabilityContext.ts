import { v } from "convex/values";
import { api } from "./_generated/api";
import { internalQuery } from "./_generated/server";
import {
  buildResolvedCommunityCapabilityContext,
  normalizeCommunityCapabilitySlug,
  type CommunityCapabilityContextErrorCode,
  type CommunityMembershipProjection,
  type ResolvedCommunityCapabilityContext,
} from "../shared/communityCapabilityContextContract";
import type { CommunityAccess } from "../shared/communityTypes";
import {
  type CommunityLike,
  getUniqueCommunityMembershipByPair,
  mapCommunityAccessRow,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";
import {
  listCommunitySemanticMembers,
  listCommunitySemanticRoot,
  parsePolynetSemanticPath,
  POLYNET_MEMBERS_DIRECTORY_PATH,
  POLYNET_SEMANTIC_ROOT_PATH,
  POLYNET_SELF_PROFILE_PATH,
  readCommunitySemanticDocument,
  type CommunitySemanticSource,
  type MemberProfileSemanticSource,
  type SelfProfileCommunitySummary,
  type SelfProfileSemanticSource,
} from "../shared/communitySemanticRepository";
import { normalizeSocialProfileLinks } from "../shared/socialProfileLinks";
import { getUniqueUserProfileDetailByUserId } from "./profileCore";
import { resolveViewerProfileRelationship } from "./profileRelationshipCore";
import {
  listMemberSemanticDirectory,
  resolveMemberSemanticProfile,
} from "./communitySemanticMembers";

export type {
  CommunityCapabilityContextErrorCode,
  CommunityMembershipProjection,
  ResolvedCommunityCapabilityContext,
} from "../shared/communityCapabilityContextContract";

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export async function listAccessibleCommunityMemberships(
  ctx: any,
  authSubject: string,
): Promise<CommunityMembershipProjection[]> {
  const rows = (await ctx.runQuery(api.community.listCommunityMemberships as any, {
    authSubject,
    selectMode: "full",
  })) as CommunityMembershipProjection[];
  return rows.filter((row) => boundedString(row.communities?.slug, 160));
}

export function findCommunityMembershipBySlug(
  rows: CommunityMembershipProjection[],
  communitySlug: string,
): CommunityMembershipProjection | null {
  const normalized = normalizeCommunityCapabilitySlug(communitySlug);
  if (!normalized) return null;
  return (
    rows.find(
      (row) => normalizeCommunityCapabilitySlug(row.communities?.slug) === normalized,
    ) ?? null
  );
}

async function buildCommunityCapabilityContextForActor(args: {
  ctx: any;
  authSubject: string;
  userId?: any;
  community: CommunityLike;
}) {
  const userId = await resolveUserIdForAuthenticatedRequest({
    ctx: args.ctx,
    userId: args.userId,
    authSubject: args.authSubject,
  });
  const membership = await getUniqueCommunityMembershipByPair({
    ctx: args.ctx,
    communityId: args.community._id,
    userId,
  });
  const access = (await mapCommunityAccessRow({
    ctx: args.ctx,
    community: args.community,
    membership,
    userId,
  })) as CommunityAccess;
  return buildResolvedCommunityCapabilityContext({
    communitySlug: args.community.slug,
    community: {
      id: String(args.community._id),
      slug: args.community.slug,
      name: args.community.name,
      oneLiner: args.community.oneLiner,
      about: args.community.about,
      visibility: args.community.visibility,
      entryPolicy: args.community.entryPolicy,
    },
    membership: membership
      ? { communityId: String(membership.communityId), role: membership.role }
      : null,
    access,
  });
}

export async function resolveCommunityCapabilityContextBySlug(args: {
  ctx: any;
  authSubject: string;
  communitySlug: string;
}) {
  const communitySlug = normalizeCommunityCapabilitySlug(args.communitySlug);
  if (!communitySlug) {
    return { ok: false as const, code: "invalid_community_slug" as const };
  }
  const rows = (await args.ctx.db
    .query("communities")
    .withIndex("by_slug", (q: any) => q.eq("slug", communitySlug))
    .take(2)) as CommunityLike[];
  if (rows.length > 1) {
    return { ok: false as const, code: "community_access_unavailable" as const };
  }
  const community = rows[0] ?? null;
  if (!community) {
    return { ok: false as const, code: "community_not_accessible" as const };
  }
  return await buildCommunityCapabilityContextForActor({
    ctx: args.ctx,
    authSubject: args.authSubject,
    community,
  });
}

export async function resolveCommunityCapabilityContextById(args: {
  ctx: any;
  authSubject: string;
  userId?: any;
  communityId: any;
}) {
  const community = (await args.ctx.db.get(
    args.communityId,
  )) as CommunityLike | null;
  if (!community) {
    return { ok: false as const, code: "community_not_accessible" as const };
  }
  return await buildCommunityCapabilityContextForActor({
    ctx: args.ctx,
    authSubject: args.authSubject,
    userId: args.userId,
    community,
  });
}

export const resolveCommunityCapabilityContextInternal = internalQuery({
  args: {
    authSubject: v.string(),
    communitySlug: v.string(),
  },
  handler: async (ctx, args) => {
    return await resolveCommunityCapabilityContextBySlug({
      ctx,
      authSubject: args.authSubject,
      communitySlug: args.communitySlug,
    });
  },
});

function buildCommunitySemanticSource(args: {
  context: ResolvedCommunityCapabilityContext;
}): CommunitySemanticSource {
  const community = args.context.membership.communities;
  return {
    slug: args.context.communitySlug,
    name: String(community.name ?? "").trim() || "Community",
    oneLiner: String(community.one_liner ?? "").trim() || null,
    about: String(community.about ?? "").trim() || null,
    visibility:
      String(community.visibility ?? "").trim().toLowerCase() === "published"
        ? "published"
        : "unlisted",
    entryPolicy:
      String(community.entry_policy ?? "").trim().toLowerCase() ===
      "paid_subscription"
        ? "paid_subscription"
        : String(community.entry_policy ?? "").trim().toLowerCase() === "open"
          ? "open"
          : "approval",
    canonicalUrl: `${readCanonicalPublicAppOrigin()}/c/${args.context.communitySlug}`,
  };
}

type SelfProfileUserRow = {
  _id: any;
  displayName?: string;
  handle?: string;
};

type SelfProfileDetailRow = {
  displayName?: string;
  bio?: string;
  socialLinks?: Record<string, unknown>;
};

function mapSelfProfileCommunitySummary(
  row: { slug?: string | null; name?: string | null },
): SelfProfileCommunitySummary | null {
  const slug = String(row.slug ?? "").trim().toLowerCase();
  const name = String(row.name ?? "").trim();
  return slug && name ? { slug, name } : null;
}

function normalizeSelfProfileRole(
  value: unknown,
): SelfProfileSemanticSource["currentCommunity"]["role"] {
  return value === "owner" ||
    value === "admin" ||
    value === "moderator"
    ? value
    : "member";
}

async function buildSelfProfileSemanticSource(args: {
  ctx: any;
  userId: any;
  context: ResolvedCommunityCapabilityContext;
}): Promise<SelfProfileSemanticSource> {
  const [user, detail, relationship] = await Promise.all([
    args.ctx.db.get(args.userId) as Promise<SelfProfileUserRow | null>,
    getUniqueUserProfileDetailByUserId<SelfProfileDetailRow>(
      args.ctx,
      args.userId,
    ),
    resolveViewerProfileRelationship({
      ctx: args.ctx,
      viewerUserId: args.userId,
      targetUserId: args.userId,
      preferredCommunityId: args.context.communityId,
    }),
  ]);
  if (!user) throw new Error("self_profile_user_not_found");
  const ownedCommunities = relationship.owned_communities
    .map(mapSelfProfileCommunitySummary)
    .filter((row): row is SelfProfileCommunitySummary => Boolean(row));
  const accessibleCommunities = relationship.mutual_communities
    .map(mapSelfProfileCommunitySummary)
    .filter((row): row is SelfProfileCommunitySummary => Boolean(row));
  return {
    displayName: detail?.displayName ?? user.displayName ?? null,
    handle: user.handle ?? null,
    bio: detail?.bio ?? null,
    socialLinks: normalizeSocialProfileLinks(detail?.socialLinks ?? {}),
    currentCommunity: {
      slug: args.context.communitySlug,
      name:
        String(args.context.membership.communities.name ?? "").trim() ||
        "Community",
      role: normalizeSelfProfileRole(args.context.membership.role),
    },
    ownedCommunities,
    accessibleCommunities,
  };
}

export const resolveCommunitySemanticRepositoryInternal = internalQuery({
  args: {
    authSubject: v.string(),
    userId: v.optional(v.id("users")),
    communityId: v.optional(v.id("communities")),
    communitySlug: v.optional(v.string()),
    operation: v.union(v.literal("list"), v.literal("read")),
    path: v.string(),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const usesCommunityId = Boolean(args.communityId);
    const usesCommunitySlug = Boolean(String(args.communitySlug ?? "").trim());
    if (usesCommunityId === usesCommunitySlug) {
      return {
        ok: false as const,
        code: "community_selector_invalid",
        message: "Exactly one verified community selector is required.",
      };
    }
    const resolved = usesCommunityId
      ? await resolveCommunityCapabilityContextById({
          ctx,
          authSubject: args.authSubject,
          userId: args.userId,
          communityId: args.communityId,
        })
      : await resolveCommunityCapabilityContextBySlug({
          ctx,
          authSubject: args.authSubject,
          communitySlug: args.communitySlug ?? "",
        });
    if (!resolved.ok) {
      return {
        ok: false as const,
        code: resolved.code,
        message: "Community not found or not accessible.",
      };
    }
    const parsedPath = parsePolynetSemanticPath(args.path);
    if (!parsedPath.ok) return parsedPath;
    if (args.operation === "list") {
      if (parsedPath.path === POLYNET_SEMANTIC_ROOT_PATH) {
        return listCommunitySemanticRoot({ path: parsedPath.path });
      }
      if (parsedPath.path !== POLYNET_MEMBERS_DIRECTORY_PATH) {
        return listCommunitySemanticRoot({ path: parsedPath.path });
      }
      try {
        const actorUserId = await resolveUserIdForAuthenticatedRequest({
          ctx,
          userId: args.userId,
          authSubject: args.authSubject,
        });
        const memberDirectory = await listMemberSemanticDirectory({
          ctx,
          actorUserId,
          context: resolved.context,
          cursor: args.cursor ?? null,
          limit: args.limit ?? null,
        });
        return listCommunitySemanticMembers({
          path: parsedPath.path,
          source: memberDirectory,
        });
      } catch {
        return {
          ok: false as const,
          code: "semantic_context_unavailable" as const,
          message: "Semantic member directory not available.",
        };
      }
    }
    let selfProfile: SelfProfileSemanticSource | null = null;
    let memberProfile: MemberProfileSemanticSource | null = null;
    const memberHandle =
      "memberHandle" in parsedPath ? parsedPath.memberHandle : null;
    if (
      parsedPath.path === POLYNET_SELF_PROFILE_PATH ||
      memberHandle
    ) {
      try {
        const actorUserId = await resolveUserIdForAuthenticatedRequest({
          ctx,
          userId: args.userId,
          authSubject: args.authSubject,
        });
        if (parsedPath.path === POLYNET_SELF_PROFILE_PATH) {
          selfProfile = await buildSelfProfileSemanticSource({
            ctx,
            userId: actorUserId,
            context: resolved.context,
          });
        } else if (memberHandle) {
          memberProfile = await resolveMemberSemanticProfile({
            ctx,
            actorUserId,
            context: resolved.context,
            handle: memberHandle,
          });
        }
      } catch {
        return {
          ok: false as const,
          code: "semantic_context_unavailable" as const,
          message: "Semantic profile not available.",
        };
      }
    }
    return readCommunitySemanticDocument({
      source: buildCommunitySemanticSource({ context: resolved.context }),
      selfProfile,
      memberProfile,
      path: parsedPath.path,
    });
  },
});
