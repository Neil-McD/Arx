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
  listCommunitySemanticRoot,
  readCommunitySemanticDocument,
  type CommunitySemanticSource,
} from "../shared/communitySemanticRepository";

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

export const resolveCommunitySemanticRepositoryInternal = internalQuery({
  args: {
    authSubject: v.string(),
    userId: v.optional(v.id("users")),
    communityId: v.optional(v.id("communities")),
    communitySlug: v.optional(v.string()),
    operation: v.union(v.literal("list"), v.literal("read")),
    path: v.string(),
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
    return args.operation === "list"
      ? listCommunitySemanticRoot({ path: args.path })
      : readCommunitySemanticDocument({
          source: buildCommunitySemanticSource({ context: resolved.context }),
          path: args.path,
        });
  },
});
