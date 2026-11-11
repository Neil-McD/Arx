// Members, the member's side (docs/design/members-invariants.md §6): who is
// here and what each person chose to share. Never plan, price, payment, notes,
// join date or last-active time; never a fact the person hasn't approved, and
// never where a fact came from. People who are out are not listed.
import { v } from "convex/values";
import { query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { requireCommunityChatAccess, resolvePublicUserId } from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { FACT_LABELS, FACT_ORDER, factVisibleToHost } from "../shared/communityMemberRecords";
import { communityPresenceLeaseIsActive } from "../shared/communityPresenceContract";

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

export type MemberDirectoryRow = {
  membership_id: string | null;
  user_id: string;
  name: string;
  avatar_url: string | null;
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

// One person as other members see them (and as you can see yourself).
export const getCommunityMemberProfile = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    // Absent: the owner.
    membershipId: v.optional(v.id("communityMemberships")),
  },
  handler: async (ctx, args) => {
    const { userId, community } = await reader(ctx, args);
    let subjectId = community.ownerId;
    let role: string = "owner";
    if (args.membershipId) {
      const membership = await ctx.db.get(args.membershipId);
      if (!membership || String(membership.communityId) !== String(args.communityId)) return null;
      const listed = (await listedMemberships(ctx, args.communityId)).some((row) => String(row._id) === String(membership._id));
      if (!listed) return null;
      subjectId = membership.userId;
      role = membership.role;
    }
    const profile = await resolveUserProfileDisplayProjection(ctx, subjectId);
    const user = await ctx.db.get(subjectId) as { displayName?: string; handle?: string } | null;
    const presence = await ctx.db.query("communityPresence")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", subjectId)).first();
    const mine = String(subjectId) === String(userId);
    const theirs = await approvedFacts(ctx, subjectId, args.communityId);
    // What you have in common: the kinds of thing you both said, word for word
    // overlap only (no guessing).
    const myWords = mine ? new Set<string>() : new Set((await approvedFacts(ctx, userId, args.communityId))
      .flatMap((fact) => fact.body.toLowerCase().match(/[a-z]{5,}/g) ?? []));
    const inCommon = mine ? [] : theirs
      .filter((fact) => (fact.body.toLowerCase().match(/[a-z]{5,}/g) ?? []).some((word) => myWords.has(word)))
      .map((fact) => fact.body).slice(0, 3);
    return {
      membership_id: args.membershipId ? String(args.membershipId) : null,
      user_id: (await resolvePublicUserId(ctx, subjectId)) ?? String(subjectId),
      name: profile.display_name ?? user?.displayName ?? user?.handle ?? "Member",
      avatar_url: profile.avatar_url ?? null,
      role,
      here_now: communityPresenceLeaseIsActive(presence ? { lastSeenAt: presence.lastSeenAt, activeUntil: presence.activeUntil } : null, Date.now()),
      you: mine,
      facts: theirs.map((fact) => ({ kind: fact.kind, label: FACT_LABELS[fact.kind] ?? fact.kind, body: fact.body })),
      in_common: inCommon,
    };
  },
});
