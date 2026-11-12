// Members, the host's side (docs/design/members-invariants.md). Who is in and
// at which price, who needs the host (on hold, cancelling), who is out and why,
// and one member's record. Only people who manage members read these; plan,
// price and payment never reach a member-facing read.
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { requireCommunityManager, resolvePublicUserId } from "./communityCore";
import { recordCriticalAuditEvent } from "./criticalAudit";
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
  memberInView,
  type MemberMoney,
  type MemberOutReason,
  type MemberPlan,
} from "../shared/communityMemberRecords";

// Paging: the table loads a page at a time; the summary (view counts) reads
// only cheap rows, so its counts stay true up to SUMMARY_CAP people.
const PAGE_MAX = 100;
const SUMMARY_CAP = 5_000;
const PAST_CAP = 200;
const FACTS_CAP = 40;

const iso = (ms: number | null | undefined) => (typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null);

type PricePointRow = { _id: any; name: string; amountBaseUnits: number; currency: string; currencyDecimals: number; billingPeriod: string; isCurrent: boolean; archivedAt?: number };

const viewValidator = v.string();

async function latestSubscription(ctx: any, membershipId: any) {
  const rows = await ctx.db.query("communitySubscriptions").withIndex("by_membership", (q: any) => q.eq("membershipId", membershipId)).collect();
  rows.sort((a: any, b: any) => b.updatedAt - a.updatedAt);
  return rows.find((row: any) => row.status !== "ended") ?? rows[0] ?? null;
}

// "Working on" in the table: what they told this community (approved).
async function communityGoals(ctx: any, communityId: any): Promise<Map<string, string>> {
  const facts = await ctx.db.query("memberFacts")
    .withIndex("by_community_kind", (q: any) => q.eq("communityId", communityId).eq("kind", "goal")).take(SUMMARY_CAP);
  const goals = new Map<string, { body: string; at: number }>();
  for (const fact of facts) {
    if (!factVisibleToHost(fact)) continue;
    const key = String(fact.userId);
    const current = goals.get(key);
    if (!current || current.at < fact.updatedAt) goals.set(key, { body: String(fact.body).trim().slice(0, 140), at: fact.updatedAt });
  }
  return new Map([...goals].map(([key, value]) => [key, value.body]));
}

async function context(ctx: any, args: { userId?: any; authSubject?: string; communityId: any }) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
  const { community } = await requireCommunityManager({ ctx, communityId: args.communityId, userId });
  return { userId, community };
}

// What the community's tables say about everyone, once per request.
async function lookups(ctx: any, communityId: any) {
  const blocks = await ctx.db.query("communityBlocks").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).take(SUMMARY_CAP);
  const pricePoints = await ctx.db.query("communityPricePoints").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).take(100) as PricePointRow[];
  return {
    blocked: new Set(blocks.filter((row: any) => !row.liftedAt).map((row: any) => String(row.userId))),
    priceById: new Map(pricePoints.map((point) => [String(point._id), point])),
  };
}

const pointFor = (point: PricePointRow | null) => point
  ? { id: String(point._id), name: point.name, amountBaseUnits: point.amountBaseUnits, currency: point.currency, currencyDecimals: point.currencyDecimals, billingPeriod: point.billingPeriod }
  : null;

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

// The counts behind the saved views: cheap rows only (memberships, their
// subscriptions, price points, blocks, payment holds, goals), so they are true
// counts up to SUMMARY_CAP people.
export const getCommunityMemberSummary = query({
  args: { userId: v.optional(v.id("users")), authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const { community } = await context(ctx, args);
    const memberships = await ctx.db.query("communityMemberships")
      .withIndex("by_community", (q) => q.eq("communityId", args.communityId)).take(SUMMARY_CAP + 1);
    const capped = memberships.length > SUMMARY_CAP;
    const { blocked, priceById } = await lookups(ctx, args.communityId);
    const goals = await communityGoals(ctx, args.communityId);
    const subsByMembership = new Map<string, any>();
    for (const status of ["active", "past_due", "cancel_at_period_end"] as const) {
      const subs = await ctx.db.query("communitySubscriptions")
        .withIndex("by_community_status", (q) => q.eq("communityId", args.communityId).eq("status", status)).take(SUMMARY_CAP);
      for (const sub of subs) {
        const key = String(sub.membershipId);
        const current = subsByMembership.get(key);
        if (!current || current.updatedAt < sub.updatedAt) subsByMembership.set(key, sub);
      }
    }
    const newest = new Map<string, any>();
    for (const row of memberships.slice(0, SUMMARY_CAP)) {
      if (String(row.userId) === String(community.ownerId)) continue;
      const key = String(row.userId);
      if (!newest.has(key) || newest.get(key).createdAt < row.createdAt) newest.set(key, row);
    }
    const counts: Record<string, number> = { everyone: 1, on_hold: 0, cancelling: 0, comped: 0, know_little: goals.has(String(community.ownerId)) ? 0 : 1, past: 0 };
    const prices = new Map<string, { price_point_id: string; label: string; count: number; current: boolean }>();
    for (const membership of newest.values()) {
      const sub = subsByMembership.get(String(membership._id)) ?? null;
      const point = priceById.get(String(sub?.pricePointId ?? membership.pricePointId ?? "")) ?? null;
      const plan = planFor({ isOwner: false, accessSource: membership.accessSource, pricePoint: pointFor(point) });
      if (outReasonFor(membership.state, blocked.has(String(membership.userId)), membership.revokedReason)) { counts.past += 1; continue; }
      const row = { plan, money: moneyFor({ membershipState: membership.state, subscription: sub }), working_on: goals.get(String(membership.userId)) ?? null };
      counts.everyone += 1;
      for (const view of ["on_hold", "cancelling", "comped", "know_little"]) if (memberInView(view, row)) counts[view] += 1;
      if (plan.kind === "paid" && plan.price_point_id) {
        const entry = prices.get(plan.price_point_id) ?? { price_point_id: plan.price_point_id, label: plan.label, count: 0, current: Boolean(point?.isCurrent && !point?.archivedAt) };
        entry.count += 1;
        prices.set(plan.price_point_id, entry);
      }
    }
    const declined = await ctx.db.query("communityJoinRequests")
      .withIndex("by_community_status_createdAt", (q) => q.eq("communityId", args.communityId).eq("status", "denied")).take(PAST_CAP);
    counts.past += declined.filter((request) => !newest.has(String(request.userId))).length;
    // "With access": everyone in, less those whose card is on hold (the left
    // column's number).
    const withAccess = counts.everyone - counts.on_hold;
    return { counts, with_access: withAccess, prices: [...prices.values()], capped };
  },
});

// One page of the table, newest members first. A view narrows the page, so a
// page can hold fewer than asked for; isDone says when there is no more.
export const listCommunityMemberRecordsPage = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    view: viewValidator,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { community } = await context(ctx, args);
    const { blocked, priceById } = await lookups(ctx, args.communityId);
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
    const goalOf = async (userId: any) => {
      const facts = await ctx.db.query("memberFacts")
        .withIndex("by_user_community", (q) => q.eq("userId", userId).eq("communityId", args.communityId)).take(FACTS_CAP);
      const goal = facts.filter((fact) => fact.kind === "goal" && factVisibleToHost(fact)).sort((a, b) => b.updatedAt - a.updatedAt)[0];
      return goal ? String(goal.body).trim().slice(0, 140) : null;
    };
    const numItems = Math.max(1, Math.min(PAGE_MAX, Math.floor(args.paginationOpts.numItems)));
    const result = await ctx.db.query("communityMemberships")
      .withIndex("by_community", (q) => q.eq("communityId", args.communityId)).order("desc")
      .paginate({ ...args.paginationOpts, numItems });
    const past = args.view === "past";
    const rows: MemberRecordRow[] = [];
    const pastRows: PastMemberRow[] = [];
    if (!args.paginationOpts.cursor && !past) {
      const owner: MemberRecordRow = {
        membership_id: null, ...(await person(community.ownerId)), role: "owner",
        plan: planFor({ isOwner: true, accessSource: null, pricePoint: null }), money: null,
        joined_at: iso(community.createdAt), last_active_at: await lastActive(community.ownerId), working_on: await goalOf(community.ownerId),
      };
      if (memberInView(args.view, owner)) rows.push(owner);
    }
    for (const membership of result.page) {
      if (String(membership.userId) === String(community.ownerId)) continue;
      // A person can hold several rows over time (left, rejoined): only the
      // newest says where they are now; older ones mark that they came back.
      const all = await ctx.db.query("communityMemberships")
        .withIndex("by_community_user", (q) => q.eq("communityId", args.communityId).eq("userId", membership.userId)).collect();
      if (all.some((row) => row.createdAt > membership.createdAt)) continue;
      const subscription = await latestSubscription(ctx, membership._id);
      const point = priceById.get(String(subscription?.pricePointId ?? membership.pricePointId ?? "")) ?? null;
      const plan = planFor({ isOwner: false, accessSource: membership.accessSource, pricePoint: pointFor(point) });
      const out = outReasonFor(membership.state, blocked.has(String(membership.userId)), membership.revokedReason);
      if (past !== Boolean(out)) continue;
      const who = await person(membership.userId);
      if (out) {
        pastRows.push({ membership_id: String(membership._id), user_id: who.user_id, name: who.name, avatar_url: who.avatar_url,
          reason: out, reason_text: OUT_REASON_TEXT[out], was_on: plan.label, at: iso(membership.revokedAt ?? membership.updatedAt), rejoined: all.length > 1 });
        continue;
      }
      const row: MemberRecordRow = {
        membership_id: String(membership._id), ...who, role: membership.role, plan,
        money: moneyFor({ membershipState: membership.state, subscription }),
        joined_at: iso(membership.activatedAt ?? membership.createdAt),
        last_active_at: await lastActive(membership.userId),
        working_on: await goalOf(membership.userId),
      };
      if (memberInView(args.view, row)) rows.push(row);
    }
    // Declined requests close the Past list (they never became members).
    if (past && result.isDone) {
      const declined = await ctx.db.query("communityJoinRequests")
        .withIndex("by_community_status_createdAt", (q) => q.eq("communityId", args.communityId).eq("status", "denied")).order("desc").take(PAST_CAP);
      for (const request of declined) {
        const member = await ctx.db.query("communityMemberships")
          .withIndex("by_community_user", (q) => q.eq("communityId", args.communityId).eq("userId", request.userId)).first();
        if (member) continue;
        const who = await person(request.userId);
        pastRows.push({ membership_id: null, user_id: who.user_id, name: who.name, avatar_url: who.avatar_url, reason: "declined",
          reason_text: OUT_REASON_TEXT.declined, was_on: null, at: iso(request.deniedAt ?? request.updatedAt), rejoined: false });
      }
    }
    return { rows, past: pastRows, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

export type MemberRecordFact = { kind: string; label: string; body: string; source: string; at: string | null };
export type MemberRecordEvent = { kind: "joined" | "role" | "cancel_requested" | "on_hold" | "left" | "action"; text: string; at: string | null };
export type MemberRecordNote = { id: string; body: string; author: string; at: string; can_delete: boolean };

// What a host did to a member, in the record's words. Read from the audit log
// the admin writes (who, what, when).
const ACTION_TEXT: Record<string, (metadata: any) => string> = {
  community_join_request_approved: () => "Request to join approved",
  community_join_request_denied: () => "Request to join declined",
  community_member_role_set: (metadata) => `Made ${roleWithArticle(String(metadata?.role ?? "member"))}`,
  community_member_removed: () => "Removed from the community",
  community_member_blocked: () => "Blocked",
  community_member_comped: () => "Comped",
};
const roleWithArticle = (role: string) => `${/^[aeiou]/.test(role) ? "an" : "a"} ${role}`;
const AUDIT_SCAN = 400;
const NOTES_CAP = 50;
export const MEMBER_NOTE_MAX = 2_000;

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
    const { community, userId: viewerId } = await context(ctx, args);
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
    const out = membership ? outReasonFor(membership.state, Boolean(blockRow && !blockRow.liftedAt), membership.revokedReason) : null;

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
      events.push({ kind: "joined", // The plan they are on now, not necessarily the one they joined on (a
      // comp or a price change comes later, as its own line).
      text: plan.kind === "paid" ? `Joined on ${plan.label}` : "Joined", at: iso(membership.activatedAt ?? membership.createdAt) });
      if (membership.role !== "member") events.push({ kind: "role", text: `Is ${roleWithArticle(membership.role)}`, at: iso(membership.updatedAt) });
      if (subscription?.cancelRequestedAt) events.push({ kind: "cancel_requested", text: "Asked to stop renewing", at: iso(subscription.cancelRequestedAt) });
      if (out) events.push({ kind: "left", text: OUT_REASON_TEXT[out], at: iso(membership.revokedAt ?? membership.updatedAt) });
    } else {
      events.push({ kind: "joined", text: "Founded the community", at: iso(community.createdAt) });
    }
    const audit = await ctx.db.query("criticalAuditEvents")
      .withIndex("by_community_createdAt", (q) => q.eq("communityId", args.communityId)).order("desc").take(AUDIT_SCAN);
    const names = new Map<string, string>();
    const nameOf = async (id: any) => {
      const key = String(id);
      if (!names.has(key)) {
        const profile = await resolveUserProfileDisplayProjection(ctx, id);
        const row = await ctx.db.get(id) as { displayName?: string } | null;
        names.set(key, String(id) === String(viewerId) ? "you" : profile.display_name ?? row?.displayName ?? "a host");
      }
      return names.get(key)!;
    };
    for (const row of audit) {
      const text = ACTION_TEXT[row.eventType];
      if (!text || row.status !== "succeeded" || String(row.subjectUserId ?? "") !== String(subjectId)) continue;
      events.push({ kind: "action", text: `${text(row.metadata)}${row.actorUserId ? ` by ${await nameOf(row.actorUserId)}` : ""}`, at: iso(row.createdAt) });
    }
    events.sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")));
    const noteRows = await ctx.db.query("communityMemberNotes")
      .withIndex("by_community_subject_createdAt", (q) => q.eq("communityId", args.communityId).eq("subjectUserId", subjectId))
      .order("desc").take(NOTES_CAP);
    const notes: MemberRecordNote[] = [];
    for (const note of noteRows) {
      notes.push({ id: String(note._id), body: note.body, author: await nameOf(note.authorUserId), at: iso(note.createdAt)!,
        can_delete: String(note.authorUserId) === String(viewerId) || String(community.ownerId) === String(viewerId) });
    }
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
      notes,
    };
  },
});

// Who a note is about: the subject of a membership in this community, or the
// owner (no membership).
async function noteSubject(ctx: any, community: any, membershipId: any) {
  if (!membershipId) return community.ownerId;
  const membership = await ctx.db.get(membershipId);
  if (!membership || String(membership.communityId) !== String(community._id)) throw new Error("community_membership_not_found");
  return membership.userId;
}

export const addCommunityMemberNote = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    membershipId: v.optional(v.id("communityMemberships")),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const { community, userId } = await context(ctx, args);
    const body = args.body.replace(/\r\n/g, "\n").trim();
    if (!body) throw new Error("community_member_note_empty");
    if (body.length > MEMBER_NOTE_MAX) throw new Error("community_member_note_too_long");
    const subjectUserId = await noteSubject(ctx, community, args.membershipId);
    const nowMs = Date.now();
    const id = await ctx.db.insert("communityMemberNotes", { communityId: args.communityId, subjectUserId, authorUserId: userId, body, createdAt: nowMs, updatedAt: nowMs });
    return { id: String(id) };
  },
});

// The note's author, or the owner, may delete it.
export const deleteCommunityMemberNote = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    noteId: v.id("communityMemberNotes"),
  },
  handler: async (ctx, args) => {
    const { community, userId } = await context(ctx, args);
    const note = await ctx.db.get(args.noteId);
    if (!note || String(note.communityId) !== String(args.communityId)) return { ok: true };
    if (String(note.authorUserId) !== String(userId) && String(community.ownerId) !== String(userId)) throw new Error("community_forbidden");
    await ctx.db.delete(args.noteId);
    return { ok: true };
  },
});

// Comp a member who is in for free (e.g. approved into a paid community): they
// keep free access whatever the community's settings become. Never offered to
// someone paying (Neil, Nov 11): that would mean cancelling their subscription.
export const compCommunityMember = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    membershipId: v.id("communityMemberships"),
  },
  handler: async (ctx, args) => {
    const { community, userId } = await context(ctx, args);
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || String(membership.communityId) !== String(args.communityId)) throw new Error("community_membership_not_found");
    if (String(membership.userId) === String(community.ownerId)) throw new Error("community_owner_role_fixed");
    if (membership.state !== "active") throw new Error("community_member_not_active");
    if (membership.accessSource === "manual_grant") return { ok: true };
    const subscription = await latestSubscription(ctx, membership._id);
    if (membership.accessSource === "paid_subscription" || (subscription && subscription.status !== "ended")) {
      throw new Error("community_member_is_paying");
    }
    const nowMs = Date.now();
    await ctx.db.patch(membership._id, { accessSource: "manual_grant", updatedAt: nowMs });
    await recordCriticalAuditEvent(ctx, {
      eventKey: `community_member_comped:${membership._id}:${nowMs}`, eventType: "community_member_comped", severity: "info", status: "succeeded",
      actorUserId: userId, subjectUserId: membership.userId, communityId: args.communityId, provider: "polynet", providerObjectId: String(membership._id), createdAt: nowMs,
    });
    return { ok: true };
  },
});
