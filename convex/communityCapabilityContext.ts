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

export const resolveCommunityCapabilityContextInternal = internalQuery({
  args: {
    authSubject: v.string(),
    communitySlug: v.string(),
  },
  handler: async (ctx, args) => {
    const communitySlug = normalizeCommunityCapabilitySlug(args.communitySlug);
    if (!communitySlug) return { ok: false as const, code: "invalid_community_slug" as const };

    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: undefined,
      authSubject: args.authSubject,
    });
    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", communitySlug))
      .first()) as CommunityLike | null;
    if (!community) return { ok: false as const, code: "community_not_accessible" as const };

    const membership = await getUniqueCommunityMembershipByPair({
      ctx,
      communityId: community._id,
      userId,
    });
    const access = (await mapCommunityAccessRow({
      ctx,
      community,
      membership,
      userId,
    })) as CommunityAccess;

    return buildResolvedCommunityCapabilityContext({
      communitySlug,
      community: {
        id: String(community._id),
        slug: community.slug,
        name: community.name,
        oneLiner: community.oneLiner,
        about: community.about,
        visibility: community.visibility,
        entryPolicy: community.entryPolicy,
      },
      membership: membership
        ? { communityId: String(membership.communityId), role: membership.role }
        : null,
      access,
    });
  },
});
