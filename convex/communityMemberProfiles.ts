// Members, the member's side (docs/design/members-invariants.md §6): who is
// here and what each person chose to share. Never plan, price, payment, notes,
// join date or last-active time; never a fact the person hasn't approved, and
// never where a fact came from. People who are out are not listed.
import { v } from "convex/values";
import { query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { requireCommunityChatAccess, requireCommunityManager, resolvePublicUserId } from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { FACT_LABELS, FACT_ORDER, factVisibleToHost } from "../shared/communityMemberRecords";
import { communityPresenceLeaseIsActive } from "../shared/communityPresenceContract";
import { normalizeSocialProfileLinks } from "../shared/socialProfileLinks";
import { getUniqueUserProfileDetailByUserId } from "./profileCore";
import { resolveViewerProfileRelationship } from "./profileRelationshipCore";

const DIRECTORY_CAP = 500;
const FACTS_CAP = 40;
// Members still in (a card on hold is the host's business, not other members').
const LISTED_STATES = new Set(["active", "payment_hold"]);

// What a member shares with other members: only what they approved.
const factSharedWithMembers = factVisibleToHost;

async function approvedFacts(ctx: any, userId: any, communityId: any) {
  const out: Array<{ kind: string; body: string; updatedAt: number }> = [];
  for (const scope of [communityId, undefined]) {
    const rows = await ctx.db.query("memberFacts")
      .withIndex("by_user_community", (q: any) => q.eq("userId", userId).eq("communityId", scope)).take(FACTS_CAP);
    for (const fact of rows) if (factSharedWithMembers(fact)) out.push({ kind: fact.kind, body: String(fact.body).trim(), updatedAt: fact.updatedAt });
  }
  return out.sort((a, b) => FACT_ORDER.indexOf(a.kind) - FACT_ORDER.indexOf(b.kind) || b.updatedAt - a.updatedAt);
}

async function reader(ctx: any, args: { userId?: any; authSubject?: string; communityId: any }) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
  const { community } = await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
  return { userId, community };
}

async function listedMemberships(ctx: any, communityId: any) {
  const blocks = await ctx.db.query("communityBlocks").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).take(500);
  const blocked = new Set(blocks.filter((row: any) => !row.liftedAt).map((row: any) => String(row.userId)));
  const rows = await ctx.db.query("communityMemberships").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).take(DIRECTORY_CAP * 2);
  const newest = new Map<string, any>();
  for (const row of rows) {
    const key = String(row.userId);
    if (!newest.has(key) || newest.get(key).createdAt < row.createdAt) newest.set(key, row);
  }
  return [...newest.values()].filter((row) => LISTED_STATES.has(row.state) && !blocked.has(String(row.userId))).slice(0, DIRECTORY_CAP);
}

// One person's standing here, read directly (never through the directory's
// cap): their newest membership, if it is still in and they are not blocked.
async function listedMembershipOf(ctx: any, communityId: any, subjectUserId: any) {
  const [rows, block] = await Promise.all([
    ctx.db.query("communityMemberships")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", subjectUserId)).take(20),
    ctx.db.query("communityBlocks")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", subjectUserId)).first(),
  ]);
  if (block && !block.liftedAt) return null;
  const newest = rows.reduce((best: any, row: any) => (!best || best.createdAt < row.createdAt ? row : best), null);
  return newest && LISTED_STATES.has(newest.state) ? newest : null;
}

export type MemberDirectoryRow = {
  membership_id: string | null;
  user_id: string;
  name: string;
  avatar_url: string | null;
  avatar_focus_x: number;
  avatar_focus_y: number;
  avatar_zoom: number;
  role: "owner" | "admin" | "moderator" | "member";
  working_on: string | null;
  here_now: boolean;
  you: boolean;
};

export const listCommunityMemberDirectory = query({
  args: { userId: v.optional(v.id("users")), authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const { userId, community } = await reader(ctx, args);
    const now = Date.now();
    const ids = new Map<string, string | null>();
    const row = async (subjectId: any, membership: any | null): Promise<MemberDirectoryRow> => {
      const profile = await resolveUserProfileDisplayProjection(ctx, subjectId);
      const user = await ctx.db.get(subjectId) as { displayName?: string; handle?: string } | null;
      const presence = await ctx.db.query("communityPresence")
        .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", subjectId)).first();
      const goal = (await approvedFacts(ctx, subjectId, args.communityId)).find((fact) => fact.kind === "goal");
      return {
        membership_id: membership ? String(membership._id) : null,
        user_id: (await resolvePublicUserId(ctx, subjectId, ids)) ?? String(subjectId),
        name: profile.display_name ?? user?.displayName ?? user?.handle ?? "Member",
        avatar_url: profile.avatar_url ?? null,
        avatar_focus_x: profile.avatar_focus_x,
        avatar_focus_y: profile.avatar_focus_y,
        avatar_zoom: profile.avatar_zoom,
        role: membership ? membership.role : "owner",
        working_on: goal ? goal.body.slice(0, 140) : null,
        here_now: communityPresenceLeaseIsActive(presence ? { lastSeenAt: presence.lastSeenAt, activeUntil: presence.activeUntil } : null, now),
        you: String(subjectId) === String(userId),
      };
    };
    const rows: MemberDirectoryRow[] = [await row(community.ownerId, null)];
    for (const membership of await listedMemberships(ctx, args.communityId)) {
      if (String(membership.userId) === String(community.ownerId)) continue;
      rows.push(await row(membership.userId, membership));
    }
    return { rows };
  },
});

// One person as other members see them (and as you can see yourself): the one
// profile every surface opens. Who they are (name, handle, their own bio and
// links), who they are here (role, here now, what they chose to share, what
// you have in common), and where else you meet (communities they host that
// you may see, communities you share). Named by their membership (Members) or
// by their public user id (a name in a channel, a conversation).
export const getCommunityMemberProfile = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    // Neither given: the owner.
    membershipId: v.optional(v.id("communityMemberships")),
    targetUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, community } = await reader(ctx, args);
    let subjectId = community.ownerId;
    let role: string = "owner";
    let membershipId: string | null = null;
    if (args.membershipId) {
      const membership = await ctx.db.get(args.membershipId);
      if (!membership || String(membership.communityId) !== String(args.communityId)) return null;
      const listed = await listedMembershipOf(ctx, args.communityId, membership.userId);
      if (!listed || String(listed._id) !== String(membership._id)) return null;
      subjectId = membership.userId;
      role = membership.role;
      membershipId = String(membership._id);
    } else if (args.targetUserId) {
      const subject = String(args.targetUserId).trim();
      const target = subject
        ? await ctx.db.query("users").withIndex("by_authSubject", (q: any) => q.eq("authSubject", subject)).first()
        : null;
      if (!target) return null;
      if (String(target._id) !== String(community.ownerId)) {
        // Someone who has left still has posts here; they have no profile here.
        const membership = await listedMembershipOf(ctx, args.communityId, target._id);
        if (!membership) return null;
        subjectId = membership.userId;
        role = membership.role;
        membershipId = String(membership._id);
      }
    }
    const mine = String(subjectId) === String(userId);
    const [profile, user, detail, presence, theirs, relationship] = await Promise.all([
      resolveUserProfileDisplayProjection(ctx, subjectId),
      ctx.db.get(subjectId) as Promise<{ displayName?: string; handle?: string } | null>,
      getUniqueUserProfileDetailByUserId<{ bio?: string; socialLinks?: Record<string, string> }>(ctx, subjectId),
      ctx.db.query("communityPresence")
        .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", subjectId)).first(),
      approvedFacts(ctx, subjectId, args.communityId),
      resolveViewerProfileRelationship({ ctx, viewerUserId: userId, targetUserId: subjectId, preferredCommunityId: args.communityId }),
    ]);
    // What you have in common: the kinds of thing you both said, word for word
    // overlap only (no guessing).
    const myWords = mine ? new Set<string>() : new Set((await approvedFacts(ctx, userId, args.communityId))
      .flatMap((fact) => fact.body.toLowerCase().match(/[a-z]{5,}/g) ?? []));
    const inCommon = mine ? [] : theirs
      .filter((fact) => (fact.body.toLowerCase().match(/[a-z]{5,}/g) ?? []).some((word) => myWords.has(word)))
      .map((fact) => fact.body).slice(0, 3);
    const elsewhere = (rows: Array<{ id: string; slug: string; name: string; avatar_url: string | null }>) =>
      rows.filter((row) => String(row.id) !== String(args.communityId))
        .map((row) => ({ id: String(row.id), slug: row.slug, name: row.name, avatar_url: row.avatar_url ?? null }));
    const bio = String(detail?.bio ?? "").trim();
    // Those who manage members may also open this person's record (its own query,
    // which checks again); a member's reader never gets a word of it here.
    const viewerCanManage = await requireCommunityManager({ ctx, communityId: args.communityId, userId }).then(() => true, () => false);
    return {
      membership_id: membershipId,
      user_id: (await resolvePublicUserId(ctx, subjectId)) ?? String(subjectId),
      name: profile.display_name ?? user?.displayName ?? user?.handle ?? "Member",
      handle: user?.handle ?? null,
      avatar_url: profile.avatar_url ?? null,
      bio: bio || null,
      links: normalizeSocialProfileLinks(detail?.socialLinks ?? {}),
      avatar_focus_x: profile.avatar_focus_x,
      avatar_focus_y: profile.avatar_focus_y,
      avatar_zoom: profile.avatar_zoom,
      role,
      here_now: communityPresenceLeaseIsActive(presence ? { lastSeenAt: presence.lastSeenAt, activeUntil: presence.activeUntil } : null, Date.now()),
      you: mine,
      facts: theirs.map((fact) => ({ kind: fact.kind, label: FACT_LABELS[fact.kind] ?? fact.kind, body: fact.body })),
      in_common: inCommon,
      hosts: elsewhere(relationship.owned_communities),
      shared: elsewhere(relationship.mutual_communities),
      can_message: !mine && relationship.can_message,
      message_community_id: relationship.message_context_community_id,
      viewer_can_manage: viewerCanManage,
    };
  },
});
