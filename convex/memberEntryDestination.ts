import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  communityMembershipRowIsActive,
  getCommunityAndMembership,
  normalizeSlug,
  readCommunityWelcomeGate,
  requireCommunityChatAccess,
} from "./communityCore";
import { requireAccountSetupCompleteForUser } from "./accountSetupCore";

// Bounded candidate reads for the default destination. Entry never creates
// membership: joining any community, including Polynet, is an explicit act.
const RECENT_PRESENCE_SCAN = 10;
const OWNED_COMMUNITY_SCAN = 10;
const MEMBERSHIP_SCAN = 25;

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

// Last visited first (server-authorized presence heartbeat), then owned
// communities, then the most recently activated membership. Presence rows
// written before activeUntil existed sort last and fall through to the rest.
async function resolveDefaultCommunityCandidates(ctx: any, userId: any): Promise<any[]> {
  const [recent, owned, memberships] = await Promise.all([
    ctx.db
      .query("communityPresence")
      .withIndex("by_user_activeUntil", (q: any) => q.eq("userId", userId))
      .order("desc")
      .take(RECENT_PRESENCE_SCAN),
    ctx.db
      .query("communities")
      .withIndex("by_owner_createdAt", (q: any) => q.eq("ownerId", userId))
      .order("desc")
      .take(OWNED_COMMUNITY_SCAN),
    ctx.db
      .query("communityMemberships")
      .withIndex("by_user_createdAt", (q: any) => q.eq("userId", userId))
      .order("desc")
      .take(MEMBERSHIP_SCAN),
  ]);
  const joined = (memberships as any[])
    .filter((row) => communityMembershipRowIsActive(row))
    .sort(
      (a, b) =>
        Number(b.activatedAt ?? b.createdAt ?? 0) - Number(a.activatedAt ?? a.createdAt ?? 0),
    )
    .map((row) => row.communityId);
  const seen = new Set<string>();
  const visited = (recent as any[])
    .filter((row) => typeof row.activeUntil === "number")
    .map((row) => row.communityId);
  return [...visited, ...(owned as any[]).map((row) => row._id), ...joined].filter((id) => {
    const key = String(id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const resolveMemberEntryDestinationInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.optional(v.id("communities")),
    communitySlug: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MemberEntryDestination> => {
    await requireAccountSetupCompleteForUser(ctx, args.userId);

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
      // An unfinished welcome flow outranks the usual order, so a member who
      // left halfway comes back to it on their next sign-in.
      let fallback: any = null;
      for (const candidateId of await resolveDefaultCommunityCandidates(ctx, args.userId)) {
        let community: any;
        try {
          ({ community } = await requireCommunityChatAccess({
            ctx,
            communityId: candidateId,
            userId: args.userId,
            // A member owing a welcome form still lands here; the community shows the form.
            allowWelcome: true,
          }));
        } catch {
          // Archived, unfunded, blocked, or revoked: try the next candidate.
          continue;
        }
        fallback ??= community;
        const { membership } = await getCommunityAndMembership({ ctx, communityId: candidateId, userId: args.userId });
        const welcome = await readCommunityWelcomeGate({ ctx, community, membership, userId: args.userId });
        if (welcome.required) { fallback = community; break; }
      }
      if (fallback) {
        return {
          page: "community" as const,
          reason: "default_community",
          community_id: normalizeText(fallback._id),
          community_slug: normalizeSlug(fallback.slug),
          community_name: normalizeText(fallback.name) || null,
        };
      }
      return {
        page: "discover" as const,
        reason: "no_default_community",
        community_id: null,
        community_slug: null,
        community_name: null,
      };
    }

    const { community } = await requireCommunityChatAccess({
      ctx,
      communityId: targetCommunityId,
      userId: args.userId,
      // A member owing a welcome form still lands here; the community shows the form.
      allowWelcome: true,
    });
    const resolvedSlug = normalizeSlug(community.slug);
    if (requestedSlug && resolvedSlug !== requestedSlug) {
      throw new Error("community_destination_mismatch");
    }

    return {
      page: "community" as const,
      reason: "requested_community",
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

    return (await ctx.runQuery(
      (internal as any).memberEntryDestination.resolveMemberEntryDestinationInternal as any,
      {
        userId: actor.dbUserId,
        ...(args.communityId ? { communityId: args.communityId } : {}),
        ...(normalizeText(args.communitySlug)
          ? { communitySlug: normalizeText(args.communitySlug) }
          : {}),
      },
    )) as MemberEntryDestination;
  },
});
