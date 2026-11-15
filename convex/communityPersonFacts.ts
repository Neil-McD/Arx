// People facts (docs/specs/agent-system-end-state.md, layer 2): one view of a
// person in a community, built from the records and cut by lens. Every agent
// view of a person reads it, so they can't drift apart.
//
// - member: what any member sees (and the guide when it speaks in public):
//   name, handle, role, bio, links, what the person chose to share, here now.
//   Never plan, payments, join date or notes (docs/design/members-invariants.md §6).
// - self: the person about themselves: the above, plus when they joined.
// - builder: owners and admins: the above, plus plan, state and their notes.
//
// A people fact is only what a person stated or approved. The guide's guesses
// about someone are never people facts: they live in that person's own
// private memory (shared/personalMemory.ts), if anywhere.
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import {
  communityMembershipRowIsActive,
  getUniqueCommunityMembershipByPair,
  normalizeCommunityRoleForOutput,
} from "./communityCore";
import { communityPresenceLeaseIsActive } from "./communityPresenceCore";
import { getUniqueUserByNormalizedHandle, getUniqueUserProfileDetailByUserId } from "./profileCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { validateProfileHandle } from "../shared/profileHandle";
import { FACT_LABELS, FACT_ORDER, planFor } from "../shared/communityMemberRecords";
import { memberFactVisibleToLens } from "../shared/memberOntology";

export type PersonLens = "member" | "self" | "builder";

export type PersonFacts = {
  ref: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  role: "owner" | "admin" | "moderator" | "member";
  here_now: boolean;
  bio: string | null;
  links: { youtube: string | null; x: string | null; instagram: string | null };
  // What they stated or approved, newest first within each kind.
  shared: Array<{ kind: string; label: string; body: string }>;
  joined_at?: string | null;
  plan?: string;
  state?: string;
  notes?: Array<{ body: string; at: string }>;
};

const FACTS_CAP = 40;
const FACTS_SCANNED = 300;
const NOTES_SHOWN = 5;
const iso = (ms: number | null | undefined) => (typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null);

// The one rule for a people fact, through the shared visibility predicate
// (shared/memberOntology.ts): stated or approved by the person, never only
// observed, never a guess they haven't approved; this community's (the
// member-orientation lens), or one they keep on their platform profile (the
// external-profile lens).
export function isPeopleFact(fact: { consentState: string; provenance: string; communityId?: unknown; kind?: string; body?: string }, communityId: unknown): boolean {
  const like = { communityId: fact.communityId ? String(fact.communityId) : null, kind: fact.kind as any, body: String(fact.body ?? ""),
    provenance: fact.provenance as any, consentState: fact.consentState as any };
  return like.communityId === null
    ? memberFactVisibleToLens(like, { kind: "external_profile" })
    : memberFactVisibleToLens(like, { kind: "member_orientation", communityId: String(communityId) });
}

async function latestSubscription(ctx: any, membershipId: any) {
  const rows = await ctx.db.query("communitySubscriptions").withIndex("by_membership", (q: any) => q.eq("membershipId", membershipId)).collect();
  rows.sort((a: any, b: any) => b.updatedAt - a.updatedAt);
  return rows.find((row: any) => row.status !== "ended") ?? rows[0] ?? null;
}

// The person, as the lens sees them; null when they aren't in the community
// (people who are out aren't listed to anyone through this view).
export async function readPersonFacts(ctx: any, args: { communityId: any; subjectUserId: any; lens: PersonLens }): Promise<PersonFacts | null> {
  const community = await ctx.db.get(args.communityId);
  const user = await ctx.db.get(args.subjectUserId);
  if (!community || !user) return null;
  const isOwner = String(community.ownerId) === String(user._id);
  const membership = isOwner ? null : await getUniqueCommunityMembershipByPair({ ctx, communityId: args.communityId, userId: user._id });
  if (!isOwner && !communityMembershipRowIsActive(membership)) return null;

  const [display, detail, presence] = await Promise.all([
    resolveUserProfileDisplayProjection(ctx, user._id),
    getUniqueUserProfileDetailByUserId<any>(ctx, user._id),
    ctx.db.query("communityPresence").withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", user._id)).first(),
  ]);
  const shared: PersonFacts["shared"] = [];
  for (const scope of [args.communityId, undefined]) {
    // Newest first, so superseded rows can't crowd out what's current; the
    // cap applies to what's shown, after the rule.
    const rows = await ctx.db.query("memberFacts")
      .withIndex("by_user_community", (q: any) => q.eq("userId", user._id).eq("communityId", scope)).order("desc").take(FACTS_SCANNED);
    for (const fact of rows) {
      if (shared.length >= FACTS_CAP * 2) break;
      if (!isPeopleFact(fact, args.communityId)) continue;
      shared.push({ kind: fact.kind, label: FACT_LABELS[fact.kind] ?? fact.kind, body: String(fact.body).trim(), at: fact.updatedAt } as any);
    }
  }
  shared.sort((a: any, b: any) => FACT_ORDER.indexOf(a.kind) - FACT_ORDER.indexOf(b.kind) || b.at - a.at);
  const handle = validateProfileHandle(user.normalizedHandle ?? user.handle);
  const links = detail?.socialLinks ?? {};
  const person: PersonFacts = {
    ref: `user:${String(user._id)}`,
    name: display.display_name ?? user.displayName ?? null,
    handle: handle.ok ? handle.normalizedHandle : null,
    avatar_url: display.avatar_url ?? null,
    role: isOwner ? "owner" : (normalizeCommunityRoleForOutput(membership?.role) || "member") as PersonFacts["role"],
    here_now: communityPresenceLeaseIsActive(presence, Date.now()),
    bio: String(detail?.bio ?? "").trim() || null,
    links: { youtube: links.youtube || null, x: links.x || null, instagram: links.instagram || null },
    shared: shared.slice(0, FACTS_CAP).map(({ kind, label, body }) => ({ kind, label, body })),
  };
  if (args.lens === "member") return person;
  person.joined_at = membership ? iso(membership.activatedAt ?? membership.createdAt) : null;
  if (args.lens === "self") return person;

  const subscription = membership ? await latestSubscription(ctx, membership._id) : null;
  const pointId = subscription?.pricePointId ?? membership?.pricePointId ?? null;
  const point = pointId ? await ctx.db.get(pointId) : null;
  person.plan = planFor({
    isOwner,
    accessSource: membership?.accessSource,
    pricePoint: point ? { id: String(point._id), name: point.name, amountBaseUnits: point.amountBaseUnits, currency: point.currency,
      currencyDecimals: point.currencyDecimals, billingPeriod: point.billingPeriod } : null,
  }).label;
  person.state = isOwner ? "owner" : String(membership?.state ?? "active");
  const notes = await ctx.db.query("communityMemberNotes")
    .withIndex("by_community_subject_createdAt", (q: any) => q.eq("communityId", args.communityId).eq("subjectUserId", user._id))
    .order("desc").take(NOTES_SHOWN);
  person.notes = notes.map((note: any) => ({ body: String(note.body), at: iso(note.createdAt) ?? "" }));
  return person;
}

// members/<handle>.json for the canonical executor. "public" is the member
// lens whoever asks (the guide speaking in a channel); "viewer" picks the
// viewer's own lens: self for their own record, builder for owners and
// admins, member for everyone else.
export const readPersonFactsInternal = internalQuery({
  args: { communityId: v.id("communities"), as: v.union(v.literal("public"), v.literal("viewer")),
    viewerUserId: v.id("users"), viewerIsBuilder: v.boolean(), handle: v.optional(v.string()), userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const handle = args.handle !== undefined ? validateProfileHandle(args.handle) : null;
    const subjectId = args.userId !== undefined ? ctx.db.normalizeId("users", args.userId) : null;
    const user = handle?.ok
      ? await getUniqueUserByNormalizedHandle<any>(ctx, handle.normalizedHandle)
      : subjectId ? await ctx.db.get(subjectId) : null;
    if (!user) return null;
    const lens: PersonLens = args.as === "public" ? "member"
      : String(user._id) === String(args.viewerUserId) ? "self" : args.viewerIsBuilder ? "builder" : "member";
    const person = await readPersonFacts(ctx, { communityId: args.communityId, subjectUserId: user._id, lens });
    return person ? { ...person, lens } : null;
  },
});
