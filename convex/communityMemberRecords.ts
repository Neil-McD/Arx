// Members, the host's side (docs/design/members-invariants.md). Who is in and
// at which price, who needs the host (on hold, cancelling), who is out and why,
// and one member's record. Only people who manage members read these; plan,
// price and payment never reach a member-facing read.
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
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
// only cheap rows for small communities and uses a pre-computed paginated
// projection (communityMemberViewCounts) for large communities (500+ members).
const PAGE_MAX = 100;
const SUMMARY_CAP = 5_000;
const PAST_CAP = 200;
const FACTS_CAP = 40;
const AUDIT_SUBJECT_CAP = 50;
const NOTES_CAP = 50;
const RECOMPUTE_BATCH_SIZE = 200;
const VIEW_COUNTS_AUTO_SEED_MIN_MEMBERS = 500;
const VIEW_COUNTS_SWEEP_MAX_PER_RUN = 5;
export const MEMBER_NOTE_MAX = 2_000;

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

// Active blocks + price points, read in parallel via indexed active-block lookup.
async function lookups(ctx: any, communityId: any) {
  const [blocks, pricePoints] = await Promise.all([
    ctx.db
      .query("communityBlocks")
      .withIndex("by_community_liftedAt", (q: any) => q.eq("communityId", communityId).eq("liftedAt", undefined))
      .take(SUMMARY_CAP),
    ctx.db
      .query("communityPricePoints")
      .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
      .take(100) as Promise<PricePointRow[]>,
  ]);
  return {
    blocked: new Set(blocks.map((row: any) => String(row.userId))),
    priceById: new Map(pricePoints.map((point) => [String(point._id), point])),
  };
}

const pointFor = (point: PricePointRow | null) => point
  ? { id: String(point._id), name: point.name, amountBaseUnits: point.amountBaseUnits, currency: point.currency, currencyDecimals: point.currencyDecimals, billingPeriod: point.billingPeriod }
  : null;

// Zero-write fast path when no pre-computed view-counts doc exists or it is already marked stale.
export async function markCommunityMemberViewCountsStale(
  ctx: any,
  communityId: any,
  nowMs: number,
): Promise<void> {
  const existing = await ctx.db
    .query("communityMemberViewCounts")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .first();
  if (!existing || typeof existing.staleAt === "number") return;
  await ctx.db.patch(existing._id, { staleAt: nowMs });
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

// The counts behind the saved views: O(1) when a fresh pre-computed snapshot
// exists (large communities), otherwise parallelized live computation.
export const getCommunityMemberSummary = query({
  args: { userId: v.optional(v.id("users")), authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const { community } = await context(ctx, args);
    const cached = await ctx.db
      .query("communityMemberViewCounts")
      .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
      .first();
    if (cached && cached.staleAt === undefined) {
      return {
        counts: { ...cached.counts } as Record<string, number>,
        with_access: cached.withAccess,
        prices: cached.prices,
        capped: false,
      };
    }

    const [memberships, lookupState, goals, activeSubs, pastDueSubs, cancellingSubs, declined] = await Promise.all([
      ctx.db
        .query("communityMemberships")
        .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
        .take(SUMMARY_CAP + 1),
      lookups(ctx, args.communityId),
      communityGoals(ctx, args.communityId),
      ctx.db
        .query("communitySubscriptions")
        .withIndex("by_community_status", (q) => q.eq("communityId", args.communityId).eq("status", "active"))
        .take(SUMMARY_CAP),
      ctx.db
        .query("communitySubscriptions")
        .withIndex("by_community_status", (q) => q.eq("communityId", args.communityId).eq("status", "past_due"))
        .take(SUMMARY_CAP),
      ctx.db
        .query("communitySubscriptions")
        .withIndex("by_community_status", (q) => q.eq("communityId", args.communityId).eq("status", "cancel_at_period_end"))
        .take(SUMMARY_CAP),
      ctx.db
        .query("communityJoinRequests")
        .withIndex("by_community_status_createdAt", (q) => q.eq("communityId", args.communityId).eq("status", "denied"))
        .take(PAST_CAP),
    ]);

    const capped = memberships.length > SUMMARY_CAP;
    const { blocked, priceById } = lookupState;
    const subsByMembership = new Map<string, any>();
    for (const subs of [activeSubs, pastDueSubs, cancellingSubs]) {
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
    const counts: Record<string, number> = { everyone: 1, on_hold: 0, cancelling: 0, know_little: goals.has(String(community.ownerId)) ? 0 : 1, past: 0 };
    const prices = new Map<string, { price_point_id: string; label: string; count: number; current: boolean }>();
    for (const membership of newest.values()) {
      const sub = subsByMembership.get(String(membership._id)) ?? null;
      const point = priceById.get(String(sub?.pricePointId ?? membership.pricePointId ?? "")) ?? null;
      const plan = planFor({ isOwner: false, accessSource: membership.accessSource, pricePoint: pointFor(point) });
      if (outReasonFor(membership.state, blocked.has(String(membership.userId)), membership.revokedReason)) { counts.past += 1; continue; }
      const row = { plan, money: moneyFor({ membershipState: membership.state, subscription: sub }), working_on: goals.get(String(membership.userId)) ?? null };
      counts.everyone += 1;
      for (const view of ["on_hold", "cancelling", "know_little"]) if (memberInView(view, row)) counts[view] += 1;
      if (plan.kind === "paid" && plan.price_point_id) {
        const entry = prices.get(plan.price_point_id) ?? { price_point_id: plan.price_point_id, label: plan.label, count: 0, current: Boolean(point?.isCurrent && !point?.archivedAt) };
        entry.count += 1;
        prices.set(plan.price_point_id, entry);
      }
    }
    counts.past += declined.filter((request) => !newest.has(String(request.userId))).length;
    // "With access": everyone in, less those whose card is on hold (the left
    // column's number).
    const withAccess = counts.everyone - counts.on_hold;
    return { counts, with_access: withAccess, prices: [...prices.values()], capped };
  },
});

const accumulatorCountsValidator = v.object({
  everyone: v.number(),
  on_hold: v.number(),
  cancelling: v.number(),
  know_little: v.number(),
  past: v.number(),
});

const accumulatorPriceValidator = v.object({
  price_point_id: v.string(),
  label: v.string(),
  count: v.number(),
  current: v.boolean(),
});

// Paginated background recomputation of communityMemberViewCounts so communities
// past 5,000 members keep accurate, uncapped, O(1) view counts.
export const recomputeCommunityMemberViewCountsBatchInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    cursor: v.union(v.string(), v.null()),
    startedAt: v.number(),
    counts: v.optional(accumulatorCountsValidator),
    prices: v.optional(v.array(accumulatorPriceValidator)),
  },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community) return { done: true };
    const { blocked, priceById } = await lookups(ctx, args.communityId);

    const counts = args.counts
      ? { ...args.counts }
      : {
          everyone: 1,
          on_hold: 0,
          cancelling: 0,
          know_little: (await (async () => {
            const ownerFacts = await ctx.db
              .query("memberFacts")
              .withIndex("by_user_community", (q) => q.eq("userId", community.ownerId).eq("communityId", args.communityId))
              .take(FACTS_CAP);
            return ownerFacts.some((fact) => fact.kind === "goal" && factVisibleToHost(fact)) ? 0 : 1;
          })()),
          past: 0,
        };
    const prices = new Map<string, { price_point_id: string; label: string; count: number; current: boolean }>(
      (args.prices ?? []).map((entry) => [entry.price_point_id, { ...entry }]),
    );

    const page = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_createdAt", (q) => q.eq("communityId", args.communityId))
      .order("asc")
      .paginate({ cursor: args.cursor, numItems: RECOMPUTE_BATCH_SIZE });

    const candidates = page.page.filter((row) => String(row.userId) !== String(community.ownerId));
    for (let i = 0; i < candidates.length; i += 20) {
      const chunk = candidates.slice(i, i + 20);
      const evaluated = await Promise.all(
        chunk.map(async (membership) => {
          const all = await ctx.db
            .query("communityMemberships")
            .withIndex("by_community_user", (q) => q.eq("communityId", args.communityId).eq("userId", membership.userId))
            .take(20);
          if (all.some((row) => row.createdAt > membership.createdAt)) return null;
          const [sub, facts] = await Promise.all([
            latestSubscription(ctx, membership._id),
            ctx.db
              .query("memberFacts")
              .withIndex("by_user_community", (q) => q.eq("userId", membership.userId).eq("communityId", args.communityId))
              .take(FACTS_CAP),
          ]);
          const hasGoal = facts.some((fact) => fact.kind === "goal" && factVisibleToHost(fact));
          return { membership, sub, hasGoal };
        }),
      );
      for (const item of evaluated) {
        if (!item) continue;
        const { membership, sub, hasGoal } = item;
        const point = priceById.get(String(sub?.pricePointId ?? membership.pricePointId ?? "")) ?? null;
        const plan = planFor({ isOwner: false, accessSource: membership.accessSource, pricePoint: pointFor(point) });
        if (outReasonFor(membership.state, blocked.has(String(membership.userId)), membership.revokedReason)) {
          counts.past += 1;
          continue;
        }
        const row = {
          plan,
          money: moneyFor({ membershipState: membership.state, subscription: sub }),
          working_on: hasGoal ? "goal" : null,
        };
        counts.everyone += 1;
        if (memberInView("on_hold", row)) counts.on_hold += 1;
        if (memberInView("cancelling", row)) counts.cancelling += 1;
        if (memberInView("know_little", row)) counts.know_little += 1;
        if (plan.kind === "paid" && plan.price_point_id) {
          const entry = prices.get(plan.price_point_id) ?? {
            price_point_id: plan.price_point_id,
            label: plan.label,
            count: 0,
            current: Boolean(point?.isCurrent && !point?.archivedAt),
          };
          entry.count += 1;
          prices.set(plan.price_point_id, entry);
        }
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, (internal as any).communityMemberRecords.recomputeCommunityMemberViewCountsBatchInternal, {
        communityId: args.communityId,
        cursor: page.continueCursor,
        startedAt: args.startedAt,
        counts,
        prices: [...prices.values()],
      });
      return { done: false };
    }

    // Final page: include declined requests that never became members.
    const declined = await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_status_createdAt", (q) => q.eq("communityId", args.communityId).eq("status", "denied"))
      .take(PAST_CAP);
    for (let i = 0; i < declined.length; i += 20) {
      const chunk = declined.slice(i, i + 20);
      const existingMembers = await Promise.all(
        chunk.map((request) =>
          ctx.db
            .query("communityMemberships")
            .withIndex("by_community_user", (q) => q.eq("communityId", args.communityId).eq("userId", request.userId))
            .first(),
        ),
      );
      for (const existingMember of existingMembers) {
        if (!existingMember) counts.past += 1;
      }
    }

    const withAccess = counts.everyone - counts.on_hold;
    const nowMs = Date.now();
    const existing = await ctx.db
      .query("communityMemberViewCounts")
      .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
      .first();
    // Preserve staleAt if another write arrived while this recomputation was running.
    const nextStaleAt =
      existing && typeof existing.staleAt === "number" && existing.staleAt > args.startedAt
        ? existing.staleAt
        : undefined;
    const payload = {
      counts,
      withAccess,
      prices: [...prices.values()],
      computedAt: nowMs,
      staleAt: nextStaleAt,
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("communityMemberViewCounts", {
        communityId: args.communityId,
        ...payload,
      });
    }
    return { done: true, everyone: counts.everyone };
  },
});

// Cron sweep: refreshes stale member view-counts docs and seeds pre-computed
// summaries for large communities (500+ active members).
export const sweepStaleMemberViewCountsInternal = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    scheduledSoFar: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    let scheduled = Math.max(0, Math.floor(args.scheduledSoFar ?? 0));

    if (!args.cursor && scheduled === 0) {
      const staleRows = await ctx.db
        .query("communityMemberViewCounts")
        .withIndex("by_staleAt", (q) => q.gt("staleAt", 0))
        .take(VIEW_COUNTS_SWEEP_MAX_PER_RUN);
      for (const row of staleRows) {
        if (scheduled >= VIEW_COUNTS_SWEEP_MAX_PER_RUN) break;
        await ctx.scheduler.runAfter(0, (internal as any).communityMemberRecords.recomputeCommunityMemberViewCountsBatchInternal, {
          communityId: row.communityId,
          cursor: null,
          startedAt: nowMs,
        });
        scheduled += 1;
      }
      if (scheduled >= VIEW_COUNTS_SWEEP_MAX_PER_RUN) {
        return { done: false, scheduled };
      }
    }

    const page = await ctx.db
      .query("communities")
      .paginate({ cursor: args.cursor ?? null, numItems: 50 });
    for (const community of page.page) {
      if (scheduled >= VIEW_COUNTS_SWEEP_MAX_PER_RUN) break;
      if (community.lifecycleStatus === "archived") continue;
      if (Number(community.activeMemberCount ?? 0) < VIEW_COUNTS_AUTO_SEED_MIN_MEMBERS) continue;
      const existing = await ctx.db
        .query("communityMemberViewCounts")
        .withIndex("by_community", (q) => q.eq("communityId", community._id))
        .first();
      if (existing) continue;
      await ctx.scheduler.runAfter(0, (internal as any).communityMemberRecords.recomputeCommunityMemberViewCountsBatchInternal, {
        communityId: community._id,
        cursor: null,
        startedAt: nowMs,
      });
      scheduled += 1;
    }

    if (!page.isDone && scheduled < VIEW_COUNTS_SWEEP_MAX_PER_RUN) {
      await ctx.scheduler.runAfter(0, (internal as any).communityMemberRecords.sweepStaleMemberViewCountsInternal, {
        cursor: page.continueCursor,
        scheduledSoFar: scheduled,
      });
      return { done: false, scheduled };
    }

    return { done: page.isDone, scheduled };
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
    const numItems = Math.max(1, Math.min(PAGE_MAX, Math.floor(args.paginationOpts.numItems)));
    const [{ blocked, priceById }, result] = await Promise.all([
      lookups(ctx, args.communityId),
      ctx.db
        .query("communityMemberships")
        .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
        .order("desc")
        .paginate({ ...args.paginationOpts, numItems }),
    ]);

    const ids = new Map<string, string | null>();
    const person = async (userId: any) => {
      const [user, profile, publicId] = await Promise.all([
        ctx.db.get(userId) as Promise<{ displayName?: string; handle?: string } | null>,
        resolveUserProfileDisplayProjection(ctx, userId),
        resolvePublicUserId(ctx, userId, ids),
      ]);
      return {
        user_id: publicId ?? String(userId),
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

    const past = args.view === "past";
    const rows: MemberRecordRow[] = [];
    const pastRows: PastMemberRow[] = [];
    if (!args.paginationOpts.cursor && !past) {
      const [ownerWho, ownerLastActive, ownerGoal] = await Promise.all([
        person(community.ownerId),
        lastActive(community.ownerId),
        goalOf(community.ownerId),
      ]);
      const owner: MemberRecordRow = {
        membership_id: null, ...ownerWho, role: "owner",
        plan: planFor({ isOwner: true, accessSource: null, pricePoint: null }), money: null,
        joined_at: iso(community.createdAt), last_active_at: ownerLastActive, working_on: ownerGoal,
      };
      if (memberInView(args.view, owner)) rows.push(owner);
    }

    const pageMemberships = result.page.filter((membership) => String(membership.userId) !== String(community.ownerId));
    for (let i = 0; i < pageMemberships.length; i += 20) {
      const chunk = pageMemberships.slice(i, i + 20);
      const enriched = await Promise.all(
        chunk.map(async (membership) => {
          const [all, subscription] = await Promise.all([
            ctx.db
              .query("communityMemberships")
              .withIndex("by_community_user", (q) => q.eq("communityId", args.communityId).eq("userId", membership.userId))
              .take(20),
            latestSubscription(ctx, membership._id),
          ]);
          if (all.some((row) => row.createdAt > membership.createdAt)) return null;
          const point = priceById.get(String(subscription?.pricePointId ?? membership.pricePointId ?? "")) ?? null;
          const plan = planFor({ isOwner: false, accessSource: membership.accessSource, pricePoint: pointFor(point) });
          const out = outReasonFor(membership.state, blocked.has(String(membership.userId)), membership.revokedReason);
          if (past !== Boolean(out)) return null;
          if (out) {
            const who = await person(membership.userId);
            return {
              kind: "past" as const,
              row: {
                membership_id: String(membership._id),
                user_id: who.user_id,
                name: who.name,
                avatar_url: who.avatar_url,
                reason: out,
                reason_text: OUT_REASON_TEXT[out],
                was_on: plan.label,
                at: iso(membership.revokedAt ?? membership.updatedAt),
                rejoined: all.length > 1,
              },
            };
          }
          const [who, activeAt, workingOn] = await Promise.all([
            person(membership.userId),
            lastActive(membership.userId),
            goalOf(membership.userId),
          ]);
          const row: MemberRecordRow = {
            membership_id: String(membership._id),
            ...who,
            role: membership.role,
            plan,
            money: moneyFor({ membershipState: membership.state, subscription }),
            joined_at: iso(membership.activatedAt ?? membership.createdAt),
            last_active_at: activeAt,
            working_on: workingOn,
          };
          if (!memberInView(args.view, row)) return null;
          return { kind: "active" as const, row };
        }),
      );
      for (const item of enriched) {
        if (!item) continue;
        if (item.kind === "past") pastRows.push(item.row);
        else rows.push(item.row);
      }
    }

    // Declined requests close the Past list (they never became members).
    if (past && result.isDone) {
      const declined = await ctx.db.query("communityJoinRequests")
        .withIndex("by_community_status_createdAt", (q) => q.eq("communityId", args.communityId).eq("status", "denied")).order("desc").take(PAST_CAP);
      for (let i = 0; i < declined.length; i += 20) {
        const chunk = declined.slice(i, i + 20);
        const resolved = await Promise.all(
          chunk.map(async (request) => {
            const member = await ctx.db.query("communityMemberships")
              .withIndex("by_community_user", (q) => q.eq("communityId", args.communityId).eq("userId", request.userId)).first();
            if (member) return null;
            const who = await person(request.userId);
            return {
              membership_id: null,
              user_id: who.user_id,
              name: who.name,
              avatar_url: who.avatar_url,
              reason: "declined" as const,
              reason_text: OUT_REASON_TEXT.declined,
              was_on: null,
              at: iso(request.deniedAt ?? request.updatedAt),
              rejoined: false,
            };
          }),
        );
        for (const row of resolved) if (row) pastRows.push(row);
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
  community_member_comped: () => "Given free access",
};
const roleWithArticle = (role: string) => `${/^[aeiou]/.test(role) ? "an" : "a"} ${role}`;

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

    const [
      user,
      profile,
      subscription,
      blockRow,
      communityFacts,
      globalFacts,
      audit,
      noteRows,
      presence,
      publicUserId,
    ] = await Promise.all([
      ctx.db.get(subjectId) as Promise<{ displayName?: string; handle?: string } | null>,
      resolveUserProfileDisplayProjection(ctx, subjectId),
      membership ? latestSubscription(ctx, membership._id) : Promise.resolve(null),
      ctx.db
        .query("communityBlocks")
        .withIndex("by_community_user", (q) => q.eq("communityId", args.communityId).eq("userId", subjectId))
        .first(),
      ctx.db
        .query("memberFacts")
        .withIndex("by_user_community", (q) => q.eq("userId", subjectId).eq("communityId", args.communityId))
        .take(FACTS_CAP),
      ctx.db
        .query("memberFacts")
        .withIndex("by_user_community", (q) => q.eq("userId", subjectId).eq("communityId", undefined))
        .take(FACTS_CAP),
      ctx.db
        .query("criticalAuditEvents")
        .withIndex("by_community_subject_createdAt", (q) =>
          q.eq("communityId", args.communityId).eq("subjectUserId", subjectId),
        )
        .order("desc")
        .take(AUDIT_SUBJECT_CAP),
      ctx.db
        .query("communityMemberNotes")
        .withIndex("by_community_subject_createdAt", (q) => q.eq("communityId", args.communityId).eq("subjectUserId", subjectId))
        .order("desc")
        .take(NOTES_CAP),
      ctx.db
        .query("communityPresence")
        .withIndex("by_community_user", (q) => q.eq("communityId", args.communityId).eq("userId", subjectId))
        .first(),
      resolvePublicUserId(ctx, subjectId),
    ]);

    const pointId = subscription?.pricePointId ?? membership?.pricePointId ?? null;
    const point = pointId ? await ctx.db.get(pointId) as PricePointRow | null : null;
    const plan = planFor({
      isOwner: !membership,
      accessSource: membership?.accessSource,
      pricePoint: point ? { id: String(point._id), name: point.name, amountBaseUnits: point.amountBaseUnits, currency: point.currency, currencyDecimals: point.currencyDecimals, billingPeriod: point.billingPeriod } : null,
    });
    const out = membership ? outReasonFor(membership.state, Boolean(blockRow && !blockRow.liftedAt), membership.revokedReason) : null;

    const facts: MemberRecordFact[] = [];
    for (const fact of [...communityFacts, ...globalFacts]) {
      if (!factVisibleToHost(fact)) continue;
      facts.push({ kind: fact.kind, label: FACT_LABELS[fact.kind] ?? fact.kind, body: String(fact.body).trim(),
        source: FACT_SOURCES[fact.provenance] ?? "", at: iso(fact.updatedAt) });
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

    const names = new Map<string, string>();
    const nameOf = async (id: any) => {
      const key = String(id);
      if (!names.has(key)) {
        const [actorProfile, row] = await Promise.all([
          resolveUserProfileDisplayProjection(ctx, id),
          ctx.db.get(id) as Promise<{ displayName?: string } | null>,
        ]);
        names.set(key, String(id) === String(viewerId) ? "you" : actorProfile.display_name ?? row?.displayName ?? "a host");
      }
      return names.get(key)!;
    };
    for (const row of audit) {
      const text = ACTION_TEXT[row.eventType];
      if (!text || row.status !== "succeeded") continue;
      events.push({ kind: "action", text: `${text(row.metadata)}${row.actorUserId ? ` by ${await nameOf(row.actorUserId)}` : ""}`, at: iso(row.createdAt) });
    }
    events.sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")));
    const notes: MemberRecordNote[] = [];
    for (const note of noteRows) {
      notes.push({ id: String(note._id), body: note.body, author: await nameOf(note.authorUserId), at: iso(note.createdAt)!,
        can_delete: String(note.authorUserId) === String(viewerId) || String(community.ownerId) === String(viewerId) });
    }

    return {
      membership_id: membership ? String(membership._id) : null,
      user_id: publicUserId ?? String(subjectId),
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

// There is no "comp" any more (removed Nov 17): someone in for free already
// keeps their place whatever the price becomes, so marking them changed
// nothing. Access a host once gave by hand ("manual_grant") reads as free, and
// its line in a member's trail ("Given free access") stays for the record.
