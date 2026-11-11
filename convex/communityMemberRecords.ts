// Members, the host's side (docs/design/members-invariants.md). Who is in and
// at which price, who needs the host (on hold, cancelling), who is out and why,
// and one member's record. Only people who manage members read these; plan,
// price and payment never reach a member-facing read.
import { v } from "convex/values";
import { query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { requireCommunityManager, resolvePublicUserId } from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import {
  FACT_LABELS,
  FACT_ORDER,
  FACT_SOURCES,
  OUT_REASON_TEXT,
  factVisibleToHost,
  moneyFor,
  outReasonFor,
  planFor,
  type MemberMoney,
  type MemberOutReason,
  type MemberPlan,
} from "../shared/communityMemberRecords";

// One read covers a community this size; beyond it the page says it is capped
// (paging the table is the next step).
const MEMBER_RECORDS_CAP = 500;
const PAST_CAP = 200;
const FACTS_CAP = 40;

const iso = (ms: number | null | undefined) => (typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null);

type PricePointRow = { _id: any; name: string; amountBaseUnits: number; currency: string; currencyDecimals: number; billingPeriod: string; isCurrent: boolean; archivedAt?: number };

async function latestSubscription(ctx: any, membershipId: any) {
  const rows = await ctx.db.query("communitySubscriptions").withIndex("by_membership", (q: any) => q.eq("membershipId", membershipId)).collect();
  rows.sort((a: any, b: any) => b.updatedAt - a.updatedAt);
  return rows.find((row: any) => row.status !== "ended") ?? rows[0] ?? null;
}

async function workingOnFor(ctx: any, userId: any, communityId: any): Promise<string | null> {
  for (const scope of [communityId, undefined]) {
    const facts = await ctx.db.query("memberFacts")
      .withIndex("by_user_community", (q: any) => q.eq("userId", userId).eq("communityId", scope))
      .take(FACTS_CAP);
    const goal = facts
      .filter((fact: any) => fact.kind === "goal" && factVisibleToHost(fact))
      .sort((a: any, b: any) => b.updatedAt - a.updatedAt)[0];
    if (goal) return String(goal.body).trim().slice(0, 140) || null;
  }
  return null;
}

async function context(ctx: any, args: { userId?: any; authSubject?: string; communityId: any }) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
  const { community } = await requireCommunityManager({ ctx, communityId: args.communityId, userId });
  return { userId, community };
}

export type MemberRecordRow = {
  membership_id: string | null;
  user_id: string;
  name: string;
  handle: string | null;
  avatar_url: string | null;
  role: "owner" | "admin" | "moderator" | "member";
  plan: MemberPlan;
  money: MemberMoney;
  joined_at: string | null;
  last_active_at: string | null;
  working_on: string | null;
};

export type PastMemberRow = {
  membership_id: string | null;
  user_id: string;
  name: string;
  avatar_url: string | null;
  reason: MemberOutReason;
  reason_text: string;
  was_on: string | null;
  at: string | null;
  rejoined: boolean;
};

export const listCommunityMemberRecords = query({
  args: { userId: v.optional(v.id("users")), authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const { community } = await context(ctx, args);
    const memberships = await ctx.db.query("communityMemberships")
      .withIndex("by_community", (q) => q.eq("communityId", args.communityId)).take(MEMBER_RECORDS_CAP + 1);
    const capped = memberships.length > MEMBER_RECORDS_CAP;
    const blocks = await ctx.db.query("communityBlocks").withIndex("by_community", (q) => q.eq("communityId", args.communityId)).take(PAST_CAP);
    const blocked = new Set(blocks.filter((row) => !row.liftedAt).map((row) => String(row.userId)));
    const pricePoints = await ctx.db.query("communityPricePoints").withIndex("by_community", (q) => q.eq("communityId", args.communityId)).take(100) as PricePointRow[];
    const priceById = new Map(pricePoints.map((point) => [String(point._id), point]));
    const ids = new Map<string, string | null>();

    const person = async (userId: any) => {
      const user = await ctx.db.get(userId) as { displayName?: string; handle?: string } | null;
      const profile = await resolveUserProfileDisplayProjection(ctx, userId);
      return {
        user_id: (await resolvePublicUserId(ctx, userId, ids)) ?? String(userId),
        name: profile.display_name ?? user?.displayName ?? user?.handle ?? "Member",
        handle: user?.handle ?? null,
        avatar_url: profile.avatar_url ?? null,
      };
    };
    const lastActive = async (userId: any) => {
      const presence = await ctx.db.query("communityPresence")
        .withIndex("by_community_user", (q) => q.eq("communityId", args.communityId).eq("userId", userId)).first();
      return iso(presence?.lastSeenAt);
    };

    const rows: MemberRecordRow[] = [];
    const past: PastMemberRow[] = [];
    const ownerId = String(community.ownerId);
    rows.push({
      membership_id: null,
      ...(await person(community.ownerId)),
      role: "owner",
      plan: planFor({ isOwner: true, accessSource: null, pricePoint: null }),
      money: null,
      joined_at: iso(community.createdAt),
      last_active_at: await lastActive(community.ownerId),
      working_on: await workingOnFor(ctx, community.ownerId, args.communityId),
    });
    // A person can hold several rows over time (left, rejoined): the newest one
    // says where they are now; an older one only marks that they came back.
    const byUser = new Map<string, any[]>();
    for (const membership of memberships.slice(0, MEMBER_RECORDS_CAP)) {
      if (String(membership.userId) === ownerId) continue;
      const list = byUser.get(String(membership.userId)) ?? [];
      list.push(membership);
      byUser.set(String(membership.userId), list);
    }
    for (const list of byUser.values()) {
      list.sort((a, b) => b.createdAt - a.createdAt);
      const membership = list[0];
      const subscription = await latestSubscription(ctx, membership._id);
      const point = priceById.get(String(subscription?.pricePointId ?? membership.pricePointId ?? "")) ?? null;
      const plan = planFor({
        isOwner: false,
        accessSource: membership.accessSource,
        pricePoint: point ? { id: String(point._id), name: point.name, amountBaseUnits: point.amountBaseUnits, currency: point.currency, currencyDecimals: point.currencyDecimals, billingPeriod: point.billingPeriod } : null,
      });
      const isBlocked = blocked.has(String(membership.userId));
      const out = outReasonFor(membership.state, isBlocked);
      const who = await person(membership.userId);
      if (out) {
        past.push({
          membership_id: String(membership._id), user_id: who.user_id, name: who.name, avatar_url: who.avatar_url,
          reason: out, reason_text: OUT_REASON_TEXT[out], was_on: plan.label,
          at: iso(membership.revokedAt ?? membership.updatedAt), rejoined: list.length > 1,
        });
        continue;
      }
      rows.push({
        membership_id: String(membership._id),
        ...who,
        role: membership.role,
        plan,
        money: moneyFor({ membershipState: membership.state, subscription }),
        joined_at: iso(membership.activatedAt ?? membership.createdAt),
        last_active_at: await lastActive(membership.userId),
        working_on: await workingOnFor(ctx, membership.userId, args.communityId),
      });
    }
    const declined = await ctx.db.query("communityJoinRequests")
      .withIndex("by_community_status_createdAt", (q) => q.eq("communityId", args.communityId).eq("status", "denied"))
      .order("desc").take(50);
    for (const request of declined) {
      if (byUser.has(String(request.userId))) continue;
      const who = await person(request.userId);
      past.push({ membership_id: null, user_id: who.user_id, name: who.name, avatar_url: who.avatar_url, reason: "declined",
        reason_text: OUT_REASON_TEXT.declined, was_on: null, at: iso(request.deniedAt ?? request.updatedAt), rejoined: false });
    }
    past.sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")));

    // A saved view per price that has people on it, current or not.
    const prices = new Map<string, { price_point_id: string; label: string; count: number; current: boolean }>();
    for (const row of rows) {
      if (row.plan.kind !== "paid" || !row.plan.price_point_id) continue;
      const point = priceById.get(row.plan.price_point_id);
      const entry = prices.get(row.plan.price_point_id) ?? { price_point_id: row.plan.price_point_id, label: row.plan.label, count: 0, current: Boolean(point?.isCurrent && !point?.archivedAt) };
      entry.count += 1;
      prices.set(row.plan.price_point_id, entry);
    }
    return { rows, past, prices: [...prices.values()], capped };
  },
});

export type MemberRecordFact = { kind: string; label: string; body: string; source: string; at: string | null };
export type MemberRecordEvent = { kind: "joined" | "role" | "cancel_requested" | "on_hold" | "left"; text: string; at: string | null };

// One member's record: who they are, their plan, what they have told us (each
// with where it came from), and their trail here.
export const getCommunityMemberRecord = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    // Absent: the owner's own record.
    membershipId: v.optional(v.id("communityMemberships")),
  },
  handler: async (ctx, args) => {
    const { community } = await context(ctx, args);
    const membership = args.membershipId ? await ctx.db.get(args.membershipId) : null;
    if (args.membershipId && (!membership || String(membership.communityId) !== String(args.communityId))) return null;
    const subjectId = membership ? membership.userId : community.ownerId;
    const user = await ctx.db.get(subjectId) as { displayName?: string; handle?: string } | null;
    const profile = await resolveUserProfileDisplayProjection(ctx, subjectId);
    const subscription = membership ? await latestSubscription(ctx, membership._id) : null;
    const pointId = subscription?.pricePointId ?? membership?.pricePointId ?? null;
    const point = pointId ? await ctx.db.get(pointId) as PricePointRow | null : null;
    const plan = planFor({
      isOwner: !membership,
      accessSource: membership?.accessSource,
      pricePoint: point ? { id: String(point._id), name: point.name, amountBaseUnits: point.amountBaseUnits, currency: point.currency, currencyDecimals: point.currencyDecimals, billingPeriod: point.billingPeriod } : null,
    });
    const blockRow = await ctx.db.query("communityBlocks")
      .withIndex("by_community_user", (q) => q.eq("communityId", args.communityId).eq("userId", subjectId)).first();
    const out = membership ? outReasonFor(membership.state, Boolean(blockRow && !blockRow.liftedAt)) : null;

    const facts: MemberRecordFact[] = [];
    for (const scope of [args.communityId, undefined]) {
      const rows = await ctx.db.query("memberFacts")
        .withIndex("by_user_community", (q) => q.eq("userId", subjectId).eq("communityId", scope)).take(FACTS_CAP);
      for (const fact of rows) {
        if (!factVisibleToHost(fact)) continue;
        facts.push({ kind: fact.kind, label: FACT_LABELS[fact.kind] ?? fact.kind, body: String(fact.body).trim(),
          source: FACT_SOURCES[fact.provenance] ?? "", at: iso(fact.updatedAt) });
      }
    }
    facts.sort((a, b) => FACT_ORDER.indexOf(a.kind) - FACT_ORDER.indexOf(b.kind) || String(b.at).localeCompare(String(a.at)));

    const events: MemberRecordEvent[] = [];
    if (membership) {
      events.push({ kind: "joined", text: plan.kind === "paid" ? `Joined on ${plan.label}` : plan.kind === "comped" ? "Joined, comped by a host" : "Joined", at: iso(membership.activatedAt ?? membership.createdAt) });
      if (membership.role !== "member") events.push({ kind: "role", text: `Is a ${membership.role}`, at: iso(membership.updatedAt) });
      if (subscription?.cancelRequestedAt) events.push({ kind: "cancel_requested", text: "Asked to stop renewing", at: iso(subscription.cancelRequestedAt) });
      if (out) events.push({ kind: "left", text: OUT_REASON_TEXT[out], at: iso(membership.revokedAt ?? membership.updatedAt) });
    } else {
      events.push({ kind: "joined", text: "Founded the community", at: iso(community.createdAt) });
    }
    events.sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")));
    const presence = await ctx.db.query("communityPresence")
      .withIndex("by_community_user", (q) => q.eq("communityId", args.communityId).eq("userId", subjectId)).first();

    return {
      membership_id: membership ? String(membership._id) : null,
      user_id: (await resolvePublicUserId(ctx, subjectId)) ?? String(subjectId),
      name: profile.display_name ?? user?.displayName ?? user?.handle ?? "Member",
      handle: user?.handle ?? null,
      avatar_url: profile.avatar_url ?? null,
      role: membership ? membership.role : "owner",
      joined_at: iso(membership ? (membership.activatedAt ?? membership.createdAt) : community.createdAt),
      last_active_at: iso(presence?.lastSeenAt),
      out: out ? { reason: out, text: OUT_REASON_TEXT[out] } : null,
      plan,
      money: membership ? moneyFor({ membershipState: membership.state, subscription }) : null,
      facts,
      events,
    };
  },
});
