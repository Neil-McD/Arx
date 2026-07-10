import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { normalizeSlug, requireCommunityChatAccess } from "./communityCore";
import { ensurePlatformHomeCommunityMembership } from "./platformHomeCommunity";

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

type MemberEntryDestination =
  | {
      page: "community";
      reason: string;
      community_id: string;
      community_slug: string;
      community_name: string | null;
    }
  | {
      page: "discover";
      reason: string;
      community_id: null;
      community_slug: null;
      community_name: null;
    };

export const resolveMemberEntryDestinationInternal = internalMutation({
  args: {
    userId: v.id("users"),
    communityId: v.optional(v.id("communities")),
    communitySlug: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<MemberEntryDestination> => {
    const requestedSlugRaw = normalizeText(args.communitySlug);
    const requestedSlug = requestedSlugRaw ? normalizeSlug(requestedSlugRaw) : "";
    let targetCommunityId = args.communityId ?? null;

    if (!targetCommunityId && requestedSlug) {
      const requestedCommunity = await ctx.db
        .query("communities")
        .withIndex("by_slug", (q) => q.eq("slug", requestedSlug))
        .first();
      if (!requestedCommunity) throw new Error("community_not_found");
      targetCommunityId = requestedCommunity._id;
    }

    if (!targetCommunityId) {
      const home = await ensurePlatformHomeCommunityMembership({
        ctx,
        userId: args.userId,
        nowMs: args.nowMs ?? Date.now(),
      });
      if (
        !home.communityId ||
        home.status === "disabled" ||
        home.status === "missing" ||
        home.status === "not_open"
      ) {
        return {
          page: "discover" as const,
          reason: `platform_home_${home.status}`,
          community_id: null,
          community_slug: null,
          community_name: null,
        };
      }
      targetCommunityId = home.communityId as any;
    }

    const { community } = await requireCommunityChatAccess({
      ctx,
      communityId: targetCommunityId,
      userId: args.userId,
    });
    const resolvedSlug = normalizeSlug(community.slug);
    if (requestedSlug && resolvedSlug !== requestedSlug) {
      throw new Error("community_destination_mismatch");
    }

    return {
      page: "community" as const,
      reason: args.communityId || requestedSlug ? "requested_community" : "platform_home",
      community_id: normalizeText(community._id),
      community_slug: resolvedSlug,
      community_name: normalizeText(community.name) || null,
    };
  },
});

export const resolveMemberEntryDestination = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.optional(v.id("communities")),
    communitySlug: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MemberEntryDestination> => {
    const actor = (await ctx.runQuery(
      (internal as any).authActor.resolveAuthenticatedActorInternal as any,
      { authSubject: args.authSubject ?? undefined },
    )) as { dbUserId?: unknown } | null;
    if (!actor?.dbUserId) throw new Error("authenticated_user_required");

    return (await ctx.runMutation(
      (internal as any).memberEntryDestination.resolveMemberEntryDestinationInternal as any,
      {
        userId: actor.dbUserId,
        ...(args.communityId ? { communityId: args.communityId } : {}),
        ...(normalizeText(args.communitySlug)
          ? { communitySlug: normalizeText(args.communitySlug) }
          : {}),
        nowMs: Date.now(),
      },
    )) as MemberEntryDestination;
  },
});
