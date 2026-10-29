import { readCommunityAgentProfile } from "./communityAgentContext";
import { v } from "convex/values";
import { resolveSelfCommunityMembershipContext } from "./communityMembershipContextCore";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import {
  buildResolvedCommunityCapabilityContext,
  normalizeCommunityCapabilitySlug,
  type CommunityMembershipProjection,
  type ResolvedCommunityCapabilityContext,
} from "../shared/communityCapabilityContextContract";
import type { CommunityAccess } from "../shared/communityTypes";
import {
  type CommunityLike,
  type CommunityMembershipLike,
  getUniqueCommunityMembershipByPair,
  mapCommunityAccessRow,
  pickMostRelevantCommunityMembership,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import { resolveAuthenticatedActorByTrustedSubject } from "./authActor";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";
import {
  listCommunitySemanticMembers,
  listCommunitySemanticResources,
  listCommunitySemanticRoot,
  parsePolynetSemanticPath,
  POLYNET_MEMBERS_DIRECTORY_PATH,
  POLYNET_RESOURCES_DIRECTORY_PATH,
  POLYNET_SEMANTIC_ROOT_PATH,
  readCommunitySemanticDocument,
  readCommunitySemanticResourceDocument,
  type CommunitySemanticSource,
  type MemberProfileSemanticSource,
  type PlatformUserProfileSemanticSource,
  type SelfProfileCommunitySummary,
  validateCommunitySemanticOperationInput,
} from "../shared/communitySemanticRepository";
import { normalizeSocialProfileLinks } from "../shared/socialProfileLinks";
import {
  getUniqueUserByNormalizedHandle,
  getUniqueUserProfileDetailByUserId,
} from "./profileCore";
import { resolveViewerProfileRelationship } from "./profileRelationshipCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import {
  listMemberSemanticDirectory,
  resolveMemberSemanticProfile,
} from "./communitySemanticMembers";
import { communityEvidenceSurfaceValidator } from "./communityEvidenceAudit";
import { validateProfileHandle } from "../shared/profileHandle";
import {
  buildCommunityResourceEvidenceRef,
  parseCommunityResourceEvidenceRef,
} from "../shared/communityEvidenceContract";
import { parseCommunityResourceDirectoryUri } from "../shared/communityResourceDirectory";
import {
  projectCommunityMembershipReadSummary,
  type CommunityReadSummary,
} from "../shared/communityReadContract";
import { communityIsActive } from "../shared/communityLifecycle";

export type {
  CommunityCapabilityContextErrorCode,
  CommunityMembershipProjection,
  ResolvedCommunityCapabilityContext,
} from "../shared/communityCapabilityContextContract";

const COMMUNITY_SEMANTIC_DIRECTORY_DEFAULT_LIMIT = 24;
const COMMUNITY_SEMANTIC_DIRECTORY_MAX_LIMIT = 50;
const COMMUNITY_MEMBERSHIP_PAIR_SCAN_LIMIT = 51;

type CommunitySemanticDirectoryCursor = {
  version: 1;
  phase: "owned" | "memberships";
  cursor: string | null;
};

function parseCommunitySemanticDirectoryCursor(
  raw: unknown,
): CommunitySemanticDirectoryCursor | null {
  if (raw === undefined || raw === null || raw === "") {
    return {
      version: 1,
      phase: "owned",
      cursor: null,
    };
  }
  if (typeof raw !== "string" || raw.length > 2_048) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CommunitySemanticDirectoryCursor>;
    if (
      parsed.version !== 1 ||
      (parsed.phase !== "owned" && parsed.phase !== "memberships") ||
      (parsed.cursor !== null && typeof parsed.cursor !== "string")
    ) {
      return null;
    }
    return {
      version: 1,
      phase: parsed.phase,
      cursor: parsed.cursor,
    };
  } catch {
    return null;
  }
}

function encodeCommunitySemanticDirectoryCursor(
  phase: CommunitySemanticDirectoryCursor["phase"],
  cursor: string | null,
): string {
  return JSON.stringify({
    version: 1,
    phase,
    cursor,
  } satisfies CommunitySemanticDirectoryCursor);
}

async function projectAccessibleCommunityDirectorySummary(args: {
  ctx: any;
  userId: any;
  community: CommunityLike;
  membership: CommunityMembershipLike | null;
}): Promise<CommunityReadSummary | null> {
  const access = (await mapCommunityAccessRow({
    ctx: args.ctx,
    community: args.community,
    membership: args.membership,
    userId: args.userId,
  })) as CommunityAccess;
  const resolved = buildResolvedCommunityCapabilityContext({
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
    membership: args.membership
      ? {
          communityId: String(args.membership.communityId),
          role: args.membership.role,
        }
      : null,
    access,
  });
  return resolved.ok
    ? projectCommunityMembershipReadSummary(resolved.context.membership)
    : null;
}

async function resolveCanonicalMembershipRow(args: {
  ctx: any;
  row: CommunityMembershipLike;
}): Promise<CommunityMembershipLike | null> {
  const rows = (await args.ctx.db
    .query("communityMemberships")
    .withIndex("by_community_user", (q: any) =>
      q
        .eq("communityId", args.row.communityId)
        .eq("userId", args.row.userId),
    )
    .take(COMMUNITY_MEMBERSHIP_PAIR_SCAN_LIMIT)) as CommunityMembershipLike[];
  if (rows.length >= COMMUNITY_MEMBERSHIP_PAIR_SCAN_LIMIT) return null;
  return pickMostRelevantCommunityMembership(rows);
}

export async function listAccessibleCommunityDirectoryPage(args: {
  ctx: any;
  authSubject: string;
  userId?: any;
  cursor?: string | null;
  limit?: number | null;
}): Promise<
  | {
      ok: true;
      communities: CommunityReadSummary[];
      nextCursor: string | null;
      skippedIncomplete: number;
    }
  | { ok: false; code: "invalid_cursor" | "invalid_limit" }
> {
  const parsedCursor = parseCommunitySemanticDirectoryCursor(args.cursor);
  if (!parsedCursor) return { ok: false, code: "invalid_cursor" };
  if (
    args.limit !== undefined &&
    args.limit !== null &&
    (!Number.isInteger(args.limit) ||
      args.limit < 2 ||
      args.limit > COMMUNITY_SEMANTIC_DIRECTORY_MAX_LIMIT)
  ) {
    return { ok: false, code: "invalid_limit" };
  }
  const limit = args.limit ?? COMMUNITY_SEMANTIC_DIRECTORY_DEFAULT_LIMIT;
  const userId = await resolveUserIdForAuthenticatedRequest({
    ctx: args.ctx,
    userId: args.userId,
    authSubject: args.authSubject,
  });
  const communities: CommunityReadSummary[] = [];
  let skippedIncomplete = 0;
  const phase = parsedCursor.phase;
  const cursor = parsedCursor.cursor;

  if (phase === "owned") {
    const ownedPage = await args.ctx.db
      .query("communities")
      .withIndex("by_owner_createdAt", (q: any) => q.eq("ownerId", userId))
      .order("asc")
      .paginate({
        cursor,
        numItems: limit,
      });
    for (const community of ownedPage.page as CommunityLike[]) {
      if (!communityIsActive(community)) {
        skippedIncomplete += 1;
        continue;
      }
      const projected = await projectAccessibleCommunityDirectorySummary({
        ctx: args.ctx,
        userId,
        community,
        membership: null,
      });
      if (projected) communities.push(projected);
      else skippedIncomplete += 1;
    }
    if (!ownedPage.isDone) {
      return {
        ok: true,
        communities,
        nextCursor: encodeCommunitySemanticDirectoryCursor(
          "owned",
          ownedPage.continueCursor,
        ),
        skippedIncomplete,
      };
    }
    const hasMembershipRows = Boolean(
      await args.ctx.db
        .query("communityMemberships")
        .withIndex("by_user_createdAt", (q: any) => q.eq("userId", userId))
        .order("asc")
        .first(),
    );
    return {
      ok: true,
      communities,
      nextCursor: hasMembershipRows
        ? encodeCommunitySemanticDirectoryCursor("memberships", null)
        : null,
      skippedIncomplete,
    };
  }

  const membershipPage = await args.ctx.db
    .query("communityMemberships")
    .withIndex("by_user_createdAt", (q: any) => q.eq("userId", userId))
    .order("asc")
    .paginate({
      cursor,
      numItems: limit,
    });
  for (const row of membershipPage.page as CommunityMembershipLike[]) {
    const canonical = await resolveCanonicalMembershipRow({
      ctx: args.ctx,
      row,
    });
    if (!canonical || String(canonical._id) !== String(row._id)) {
      skippedIncomplete += 1;
      continue;
    }
    const community = (await args.ctx.db.get(
      row.communityId,
    )) as CommunityLike | null;
    if (!community || String(community.ownerId) === String(userId)) {
      skippedIncomplete += 1;
      continue;
    }
    if (!communityIsActive(community)) {
      skippedIncomplete += 1;
      continue;
    }
    const projected = await projectAccessibleCommunityDirectorySummary({
      ctx: args.ctx,
      userId,
      community,
      membership: canonical,
    });
    if (projected) communities.push(projected);
    else skippedIncomplete += 1;
  }
  return {
    ok: true,
    communities,
    nextCursor: membershipPage.isDone
      ? null
      : encodeCommunitySemanticDirectoryCursor(
          "memberships",
          membershipPage.continueCursor,
        ),
    skippedIncomplete,
  };
}

export const listAccessibleCommunityDirectoryPageInternal = internalQuery({
  args: {
    authSubject: v.string(),
    userId: v.optional(v.id("users")),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    await listAccessibleCommunityDirectoryPage({
      ctx,
      authSubject: args.authSubject,
      userId: args.userId,
      cursor: args.cursor,
      limit: args.limit,
    }),
});

export function findCommunityMembershipBySlug(
  rows: CommunityMembershipProjection[],
  communitySlug: string,
): CommunityMembershipProjection | null {
  const normalized = normalizeCommunityCapabilitySlug(communitySlug);
  if (!normalized) return null;
  return (
    rows.find(
      (row) =>
        normalizeCommunityCapabilitySlug(row.communities?.slug) === normalized,
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
  return await buildCommunityCapabilityContextForUser({
    ctx: args.ctx,
    userId,
    community: args.community,
  });
}

async function buildCommunityCapabilityContextForUser(args: {
  ctx: any;
  userId: any;
  community: CommunityLike;
}) {
  const membership = await getUniqueCommunityMembershipByPair({
    ctx: args.ctx,
    communityId: args.community._id,
    userId: args.userId,
  });
  const access = (await mapCommunityAccessRow({
    ctx: args.ctx,
    community: args.community,
    membership,
    userId: args.userId,
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
    return {
      ok: false as const,
      code: "community_access_unavailable" as const,
    };
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

export const resolveCommunityCapabilityContextForTrustedActorInternal =
  internalQuery({
    args: {
      authSubject: v.string(),
      userId: v.id("users"),
      communitySlug: v.string(),
    },
    handler: async (ctx, args) => {
      let actorUserId: any;
      try {
        actorUserId = (
          await resolveAuthenticatedActorByTrustedSubject({
            ctx,
            authSubject: args.authSubject,
            userId: args.userId,
          })
        ).dbUserId;
      } catch {
        return {
          ok: false as const,
          code: "community_not_accessible" as const,
        };
      }
      const communitySlug = normalizeCommunityCapabilitySlug(
        args.communitySlug,
      );
      if (!communitySlug) {
        return { ok: false as const, code: "invalid_community_slug" as const };
      }
      const rows = (await ctx.db
        .query("communities")
        .withIndex("by_slug", (q: any) => q.eq("slug", communitySlug))
        .take(2)) as CommunityLike[];
      if (rows.length > 1) {
        return {
          ok: false as const,
          code: "community_access_unavailable" as const,
        };
      }
      const community = rows[0] ?? null;
      if (!community) {
        return {
          ok: false as const,
          code: "community_not_accessible" as const,
        };
      }
      return await buildCommunityCapabilityContextForUser({
        ctx,
        userId: actorUserId,
        community,
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
      String(community.visibility ?? "")
        .trim()
        .toLowerCase() === "published"
        ? "published"
        : "unlisted",
    entryPolicy:
      String(community.entry_policy ?? "")
        .trim()
        .toLowerCase() === "paid_subscription"
        ? "paid_subscription"
        : String(community.entry_policy ?? "")
              .trim()
              .toLowerCase() === "open"
          ? "open"
          : "approval",
    canonicalUrl: `${readCanonicalPublicAppOrigin()}/c/${args.context.communitySlug}`,
  };
}

type SelfProfileUserRow = {
  _id: any;
  displayName?: string;
  handle?: string;
  normalizedHandle?: string;
};

type SelfProfileDetailRow = {
  displayName?: string;
  bio?: string;
  socialLinks?: Record<string, unknown>;
};

function mapSelfProfileCommunitySummary(row: {
  slug?: string | null;
  name?: string | null;
}): SelfProfileCommunitySummary | null {
  const slug = String(row.slug ?? "")
    .trim()
    .toLowerCase();
  const name = String(row.name ?? "").trim();
  return slug && name ? { slug, name } : null;
}

export const resolveCommunityMemberSelfContextInternal = internalQuery({
  args: {
    authSubject: v.string(),
    userId: v.optional(v.id("users")),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    try {
      const actorUserId = await resolveUserIdForAuthenticatedRequest({
        ctx, authSubject: args.authSubject, userId: args.userId,
      });
      const context = await resolveSelfCommunityMembershipContext({
        ctx, actorUserId, communityId: args.communityId,
      });
      return { ok: true as const, context };
    } catch {
      return {
        ok: false as const,
        code: "semantic_not_found" as const,
        message: "Semantic path not found or not accessible.",
      };
    }
  },
});

export const resolvePlatformUserSemanticProfileInternal = internalQuery({
  args: {
    authSubject: v.string(),
    userId: v.optional(v.id("users")),
    userSelector: v.string(),
  },
  handler: async (ctx, args) => {
    let actorUserId: any;
    try {
      actorUserId = (
        await resolveAuthenticatedActorByTrustedSubject({
          ctx,
          authSubject: args.authSubject,
          userId: args.userId,
        })
      ).dbUserId;
    } catch {
      return {
        ok: false as const,
        code: "semantic_not_found" as const,
        message: "Semantic path not found or not accessible.",
      };
    }

    const selector = String(args.userSelector ?? "")
      .trim()
      .toLowerCase();
    let targetUser = (await ctx.db.get(
      actorUserId,
    )) as SelfProfileUserRow | null;
    const isSelf = selector === "me";
    if (!isSelf) {
      const validated = validateProfileHandle(selector);
      if (!validated.ok) {
        return {
          ok: false as const,
          code: "semantic_not_found" as const,
          message: "Semantic path not found or not accessible.",
        };
      }
      targetUser = await getUniqueUserByNormalizedHandle<SelfProfileUserRow>(
        ctx,
        validated.normalizedHandle,
      );
    }
    if (!targetUser) {
      return {
        ok: false as const,
        code: "semantic_not_found" as const,
        message: "Semantic path not found or not accessible.",
      };
    }

    const [detail, relationship] = await Promise.all([
      getUniqueUserProfileDetailByUserId<SelfProfileDetailRow>(
        ctx,
        targetUser._id,
      ),
      resolveViewerProfileRelationship({
        ctx,
        viewerUserId: actorUserId,
        targetUserId: targetUser._id,
      }),
    ]);
    if (
      String(targetUser._id) !== String(actorUserId) &&
      relationship.mutual_communities.length === 0
    ) {
      return {
        ok: false as const,
        code: "semantic_not_found" as const,
        message: "Semantic path not found or not accessible.",
      };
    }
    const validatedHandle = validateProfileHandle(
      targetUser.normalizedHandle ?? targetUser.handle,
    );
    if (!isSelf && !validatedHandle.ok) {
      return {
        ok: false as const,
        code: "semantic_not_found" as const,
        message: "Semantic path not found or not accessible.",
      };
    }
    const source: PlatformUserProfileSemanticSource = {
      userRef: `user:${String(targetUser._id)}`,
      profilePath: isSelf
        ? "/users/me/profile.md"
        : `/users/${validatedHandle.ok ? validatedHandle.normalizedHandle : selector}/profile.md`,
      displayName: detail?.displayName ?? targetUser.displayName ?? null,
      handle: validatedHandle.ok ? validatedHandle.normalizedHandle : null,
      bio: detail?.bio ?? null,
      socialLinks: normalizeSocialProfileLinks(detail?.socialLinks ?? {}),
      ownedCommunities: relationship.owned_communities
        .map(mapSelfProfileCommunitySummary)
        .filter((row): row is SelfProfileCommunitySummary => Boolean(row)),
      mutualCommunities: relationship.mutual_communities
        .map(mapSelfProfileCommunitySummary)
        .filter((row): row is SelfProfileCommunitySummary => Boolean(row)),
    };
    return {
      ok: true as const,
      source,
    };
  },
});

export const resolvePlatformSemanticResourceMountInternal = internalQuery({
  args: {
    authSubject: v.string(),
    userId: v.optional(v.id("users")),
    selector: v.string(),
  },
  handler: async (ctx, args) => {
    const inaccessible = () => ({
      ok: false as const,
      code: "semantic_not_found" as const,
      message: "Semantic path not found or not accessible.",
    });
    let actorUserId: any;
    try {
      actorUserId = (
        await resolveAuthenticatedActorByTrustedSubject({
          ctx,
          authSubject: args.authSubject,
          userId: args.userId,
        })
      ).dbUserId;
    } catch {
      return inaccessible();
    }

    const directory = parseCommunityResourceDirectoryUri(args.selector);
    const resourceId = parseCommunityResourceEvidenceRef(args.selector);
    let communityId: any = null;
    if (directory) {
      communityId = ctx.db.normalizeId("communities", directory.communityId);
    } else if (resourceId) {
      const normalizedResourceId = ctx.db.normalizeId(
        "communityResources",
        resourceId,
      );
      if (!normalizedResourceId) return inaccessible();
      const resource = (await ctx.db.get(normalizedResourceId)) as {
        communityId?: any;
      } | null;
      communityId = resource?.communityId ?? null;
    }
    if (!communityId) return inaccessible();

    const community = (await ctx.db.get(communityId)) as CommunityLike | null;
    if (!community) return inaccessible();
    const resolved = await buildCommunityCapabilityContextForUser({
      ctx,
      userId: actorUserId,
      community,
    });
    if (!resolved.ok) return inaccessible();

    return {
      ok: true as const,
      communityId: resolved.context.communityId,
      communitySlug: resolved.context.communitySlug,
    };
  },
});

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
    const validatedInput = validateCommunitySemanticOperationInput({
      operation: args.operation,
      path: args.path,
      cursor: args.cursor,
      limit: args.limit,
    });
    if (!validatedInput.ok) return validatedInput;
    const usesCommunityId = Boolean(args.communityId);
    const usesCommunitySlug = Boolean(String(args.communitySlug ?? "").trim());
    const communitySlug = normalizeCommunityCapabilitySlug(
      args.communitySlug ?? "",
    );
    if (usesCommunityId === usesCommunitySlug) {
      return {
        ok: false as const,
        code: "community_selector_invalid",
        message: "Exactly one verified community selector is required.",
      };
    }
    if (usesCommunitySlug && !communitySlug) {
      return {
        ok: false as const,
        code: "invalid_community_slug" as const,
        message: "Community not found or not accessible.",
      };
    }
    let actorUserId: any;
    try {
      actorUserId = (
        await resolveAuthenticatedActorByTrustedSubject({
          ctx,
          authSubject: args.authSubject,
          userId: args.userId,
        })
      ).dbUserId;
    } catch {
      return {
        ok: false as const,
        code: "community_not_accessible" as const,
        message: "Community not found or not accessible.",
      };
    }
    const communityRows = usesCommunityId
      ? [(await ctx.db.get(args.communityId!)) as CommunityLike | null].filter(
          (row): row is CommunityLike => Boolean(row),
        )
      : ((await ctx.db
          .query("communities")
          .withIndex("by_slug", (q: any) => q.eq("slug", communitySlug))
          .take(2)) as CommunityLike[]);
    const resolved =
      communityRows.length === 1
        ? await buildCommunityCapabilityContextForUser({
            ctx,
            userId: actorUserId,
            community: communityRows[0],
          })
        : {
            ok: false as const,
            code:
              communityRows.length > 1
                ? ("community_access_unavailable" as const)
                : ("community_not_accessible" as const),
          };
    if (!resolved.ok) {
      return {
        ok: false as const,
        code: resolved.code,
        message: "Community not found or not accessible.",
      };
    }
    const parsedPath = parsePolynetSemanticPath(validatedInput.path);
    if (!parsedPath.ok) return parsedPath;
    if (args.operation === "list") {
      if (parsedPath.path === POLYNET_SEMANTIC_ROOT_PATH) {
        return listCommunitySemanticRoot({ path: parsedPath.path });
      }
      const resourceDirectory =
        "resourceDirectory" in parsedPath ? parsedPath.resourceDirectory : null;
      const resourceAlias =
        "resourceAlias" in parsedPath ? parsedPath.resourceAlias : null;
      if (
        parsedPath.path === POLYNET_RESOURCES_DIRECTORY_PATH ||
        resourceDirectory ||
        resourceAlias?.kind === "module"
      ) {
        if (resourceDirectory?.resourceId) {
          return {
            ok: false as const,
            code: "semantic_not_found" as const,
            message: "Semantic path not found or not accessible.",
          };
        }
        if (
          resourceDirectory &&
          resourceDirectory.communityId !== resolved.context.communityId
        ) {
          return {
            ok: false as const,
            code: "semantic_not_found" as const,
            message: "Semantic path not found or not accessible.",
          };
        }
        try {
          const moduleSelector =
            resourceDirectory?.moduleId ??
            (resourceAlias?.kind === "module"
              ? resourceAlias.moduleId
              : null);
          const moduleId = moduleSelector
            ? ctx.db.normalizeId(
                "communityResourceModules",
                moduleSelector,
              )
            : null;
          if ((resourceDirectory || resourceAlias?.kind === "module") && !moduleId) {
            throw new Error("community_resource_semantic_module_not_found");
          }
          const directory = (await ctx.runQuery(
            internal.communityResources
              .listCommunityResourceSemanticDirectoryInternal as any,
            {
              userId: actorUserId,
              communityId: ctx.db.normalizeId(
                "communities",
                resolved.context.communityId,
              ),
              ...(moduleId ? { moduleId } : null),
              cursor:
                validatedInput.operation === "list"
                  ? (validatedInput.cursor ?? undefined)
                  : undefined,
              limit:
                validatedInput.operation === "list"
                  ? (validatedInput.limit ?? undefined)
                  : undefined,
            },
          )) as any;
          return listCommunitySemanticResources({
            selector: parsedPath.path,
            source:
              directory.scope === "modules"
                ? {
                    scope: "modules",
                    entries: directory.entries.map((entry: any) => ({
                      name: entry.name,
                      directoryPath: entry.directory_path,
                      directoryUri: entry.directory_uri,
                    })),
                    nextCursor: directory.next_cursor,
                  }
                : {
                    scope: "resources",
                    module: {
                      name: directory.module.name,
                      directoryPath: directory.module.directory_path,
                      directoryUri: directory.module.directory_uri,
                    },
                    entries: directory.entries.map((entry: any) => ({
                      title: entry.title,
                      ref: entry.ref,
                      directoryPath: entry.directory_path,
                      directoryUri: entry.directory_uri,
                      lesson: entry.lesson ?? null,
                    })),
                    nextCursor: directory.next_cursor,
                  },
          });
        } catch {
          return {
            ok: false as const,
            code: "semantic_context_unavailable" as const,
            message: "Semantic resource directory not available.",
          };
        }
      }
      if (parsedPath.path !== POLYNET_MEMBERS_DIRECTORY_PATH) {
        return listCommunitySemanticRoot({ path: parsedPath.path });
      }
      try {
        const memberDirectory = await listMemberSemanticDirectory({
          ctx,
          actorUserId,
          context: resolved.context,
          cursor:
            validatedInput.operation === "list" ? validatedInput.cursor : null,
          limit:
            validatedInput.operation === "list" ? validatedInput.limit : null,
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
    let memberProfile: MemberProfileSemanticSource | null = null;
    const resourceRef =
      "resourceRef" in parsedPath ? parsedPath.resourceRef : null;
    const resourceDirectory =
      "resourceDirectory" in parsedPath ? parsedPath.resourceDirectory : null;
    const resourceAlias =
      "resourceAlias" in parsedPath ? parsedPath.resourceAlias : null;
    if (
      resourceRef ||
      resourceDirectory?.resourceId ||
      resourceAlias?.kind === "resource"
    ) {
      if (
        resourceDirectory &&
        resourceDirectory.communityId !== resolved.context.communityId
      ) {
        return {
          ok: false as const,
          code: "semantic_not_found" as const,
          message: "Semantic path not found or not accessible.",
        };
      }
      try {
        if (resourceAlias?.kind === "resource") {
          const resourceId = ctx.db.normalizeId(
            "communityResources",
            resourceAlias.resourceId,
          );
          const resource = resourceId
            ? await ctx.db.get(resourceId)
            : null;
          if (
            !resource ||
            String(resource.communityId) !== resolved.context.communityId ||
            String(resource.moduleId ?? "") !== resourceAlias.moduleId
          ) {
            return {
              ok: false as const,
              code: "semantic_not_found" as const,
              message: "Semantic path not found or not accessible.",
            };
          }
        }
        return {
          ok: true as const,
          resource_read: {
            userId: actorUserId,
            communityId: ctx.db.normalizeId(
              "communities",
              resolved.context.communityId,
            ),
            ref:
              resourceAlias?.kind === "resource"
                ? buildCommunityResourceEvidenceRef(resourceAlias.resourceId)
                : parsedPath.path,
            ...(resourceAlias?.kind === "resource"
              ? { expectedModuleId: resourceAlias.moduleId }
              : null),
          },
        };
      } catch {
        return {
          ok: false as const,
          code: "semantic_context_unavailable" as const,
          message: "Semantic resource not available.",
        };
      }
    }
    const memberHandle =
      "memberHandle" in parsedPath ? parsedPath.memberHandle : null;
    const memberUserId =
      "memberUserId" in parsedPath ? parsedPath.memberUserId : null;
    if (memberHandle || memberUserId) {
      try {
        memberProfile = await resolveMemberSemanticProfile({
          ctx,
          context: resolved.context,
          handle: memberHandle,
          userId: memberUserId,
        });
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
      memberProfile,
      path: parsedPath.path,
    });
  },
});

export const readCommunitySemanticRepositoryInternal = internalAction({
  args: {
    authSubject: v.string(),
    userId: v.optional(v.id("users")),
    communityId: v.optional(v.id("communities")),
    communitySlug: v.optional(v.string()),
    path: v.string(),
    offset: v.optional(v.number()),
    limit: v.optional(v.number()),
    surface: communityEvidenceSurfaceValidator,
  },
  handler: async (ctx, args): Promise<any> => {
    const validatedInput = validateCommunitySemanticOperationInput({
      operation: "read",
      path: args.path,
      offset: args.offset,
      limit: args.limit,
    });
    if (!validatedInput.ok) return validatedInput;
    const planned = (await ctx.runQuery(
      internal.communityCapabilityContext
        .resolveCommunitySemanticRepositoryInternal as any,
      {
        authSubject: args.authSubject,
        ...(args.userId ? { userId: args.userId } : null),
        ...(args.communityId ? { communityId: args.communityId } : null),
        ...(args.communitySlug ? { communitySlug: args.communitySlug } : null),
        operation: "read",
        path: validatedInput.path,
      },
    )) as any;
    if (planned?.ok !== true || !planned.resource_read) {
      return planned;
    }
    try {
      const payload = (await ctx.runAction(
        internal.communityResourceEvidence
          .readCommunityResourceEvidenceForToolInternal as any,
        {
          userId: planned.resource_read.userId,
          communityId: planned.resource_read.communityId,
          ref: planned.resource_read.ref,
          offset: validatedInput.offset ?? undefined,
          limit: validatedInput.limit ?? undefined,
          surface: args.surface,
        },
      )) as any;
      if (payload?.ok !== true) {
        return {
          ok: false as const,
          code: "semantic_not_found" as const,
          message: "Semantic path not found or not accessible.",
        };
      }
      const expectedModuleId = String(
        planned.resource_read.expectedModuleId ?? "",
      ).trim();
      const actualResourceDirectory = parseCommunityResourceDirectoryUri(
        payload.resource?.directory_uri,
      );
      if (
        expectedModuleId &&
        actualResourceDirectory?.moduleId !== expectedModuleId
      ) {
        return {
          ok: false as const,
          code: "semantic_not_found" as const,
          message: "Semantic path not found or not accessible.",
        };
      }
      return readCommunitySemanticResourceDocument({
        source: {
          title: payload.resource?.title,
          ref: payload.resource?.ref,
          directoryPath: payload.resource?.directory_path,
          directoryUri: payload.resource?.directory_uri,
          bodyMd:
            typeof payload.content?.body_md === "string"
              ? payload.content.body_md
              : null,
          url:
            typeof payload.resource?.url === "string"
              ? payload.resource.url
              : null,
          offset: payload.content?.offset,
          totalChars: payload.content?.total_chars,
          truncated: payload.content?.truncated,
          sections: Array.isArray(payload.content?.sections) ? payload.content.sections : null,
          lesson: payload.resource?.lesson ?? null,
          lessonBody: payload.lesson_body ?? null,
        },
      });
    } catch {
      return {
        ok: false as const,
        code: "semantic_context_unavailable" as const,
        message: "Semantic resource not available.",
      };
    }
  },
});

// The community's display identity for the root of its repository. The caller
// already passed the community guard chain for this community.
// The Polynet MCP is for community builders: owners and admins of an active community.
export const isCommunityBuilderAnywhereInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const owned = await ctx.db.query("communities").withIndex("by_owner", (q) => q.eq("ownerId", args.userId)).take(100);
    if (owned.some((community) => communityIsActive(community as any))) return true;
    const memberships = await ctx.db.query("communityMemberships").withIndex("by_user", (q) => q.eq("userId", args.userId)).take(500);
    for (const membership of memberships) {
      if (membership.role !== "admin" || membership.active !== true) continue;
      const community = await ctx.db.get(membership.communityId);
      if (community && communityIsActive(community as any)) return true;
    }
    return false;
  },
});

export const getCommunityRepositoryIdentityInternal = internalQuery({
  args: { communityId: v.id("communities"), viewerUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community) return null;
    // agent_name is what members @mention the community agent as (Settings > Agent).
    const agentProfile = await readCommunityAgentProfile(ctx, args.communityId);
    const identity = { slug: String(community.slug ?? ""), name: String(community.name ?? ""),
      agent_name: agentProfile?.name ?? String(community.name ?? "") };
    if (!args.viewerUserId) return identity;
    // The signed-in member, as a front end greets them.
    const [user, display] = await Promise.all([
      ctx.db.get(args.viewerUserId),
      resolveUserProfileDisplayProjection(ctx, args.viewerUserId),
    ]);
    const handle = typeof (user as any)?.handle === "string" ? (user as any).handle : null;
    return { ...identity, viewer: { display_name: display.display_name, handle, avatar_url: display.avatar_url } };
  },
});
