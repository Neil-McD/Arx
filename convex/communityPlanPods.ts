// Plans include pods (docs/specs/pods-v0.md): whoever holds a plan has a seat
// in each pod it includes, whichever side sold the plan (Polynet's checkout or
// the community's own app). The seat's reason is "plan"; a host's add or a pod
// payment are reasons of their own, so this never touches them
// (communityChannelParticipants.setChannelParticipantCore).
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { notifyConnectedApps } from "./connectedAppNotify";
import { seatReasons, setChannelParticipantCore } from "./communityChannelParticipants";
import { BASE_TIER_KEY, heldTiers, membershipHoldsTierKey } from "./communityHeldTiers";

const TIER_HOLDER_SYNC_BATCH_SIZE = 25;

/** Brings a member's plan seats into line with the plans they hold now. */
export async function syncPlanPods(ctx: any, communityId: any, userId: any): Promise<{ opened: number; closed: number }> {
  const held = await heldTiers(ctx, communityId, userId);
  const included = new Set<string>();
  for (const tier of held?.tiers ?? []) {
    for (const channelId of tier.podChannelIds) {
      const room = await ctx.db.get(channelId) as any;
      const pod = room ? await ctx.db.query("communityPods")
        .withIndex("by_community_channel", (q: any) => q.eq("communityId", communityId).eq("channelId", channelId)).first() : null;
      // A live pod of this community only.
      if (pod && String(room.communityId) === String(communityId) && room.status === "active" && room.accessMode === "restricted") included.add(String(channelId));
    }
  }
  const principalKey = `user:${userId}`;
  const seats = await ctx.db.query("communityChannelParticipants")
    .withIndex("by_community_principal_status", (q: any) => q.eq("communityId", communityId).eq("principalKey", principalKey).eq("status", "active")).take(200);
  const sequence = Math.max(0, Math.floor(Number(held?.membership?.activationSequence ?? 0)));
  const current = new Set(seats
    .filter((seat: any) => seatReasons(seat).includes("plan") && held && String(seat.membershipId) === String(held.membership._id)
      && Number(seat.membershipActivationSequence ?? 0) === sequence)
    .map((seat: any) => String(seat.channelId)));
  let opened = 0;
  let closed = 0;
  for (const channelId of included) {
    if (current.has(channelId)) continue;
    const result = await setChannelParticipantCore(ctx, { communityId, channelId, createdByUserId: userId, active: true, target: { kind: "member", userId }, reason: "plan" });
    if (result.changed) opened += 1;
  }
  for (const seat of seats) {
    if (!seatReasons(seat).includes("plan") || included.has(String(seat.channelId))) continue;
    const result = await setChannelParticipantCore(ctx, { communityId, channelId: seat.channelId, createdByUserId: userId, active: false, target: { kind: "member", userId }, reason: "plan" });
    if (result.changed) closed += 1;
  }
  return { opened, closed };
}

/** Someone's access may have changed (joined, paid, lapsed, left, removed, bought or ended in the app, plan changed):
 * their plan's pods follow, then connected apps hear of it. */
export async function memberAccessChanged(ctx: any, communityId: any, userId: any): Promise<void> {
  await syncPlanPods(ctx, communityId, userId);
  await notifyConnectedApps(ctx, communityId, userId);
}

/** A plan's grants or pods changed: sync small communities inline, paginate large ones asynchronously. */
export async function tierHoldersChanged(ctx: any, communityId: any, key: string): Promise<void> {
  const [memberships, appSales] = await Promise.all([
    ctx.db
      .query("communityMemberships")
      .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
      .take(TIER_HOLDER_SYNC_BATCH_SIZE + 1),
    ctx.db
      .query("communityAppGrants")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId))
      .take(TIER_HOLDER_SYNC_BATCH_SIZE + 1),
  ]);

  if (
    memberships.length <= TIER_HOLDER_SYNC_BATCH_SIZE &&
    appSales.length <= TIER_HOLDER_SYNC_BATCH_SIZE
  ) {
    const holders = new Set<string>();
    const priceTier = new Map<string, string>();
    for (const membership of memberships) {
      if (await membershipHoldsTierKey(ctx, membership, key, priceTier)) {
        holders.add(String(membership.userId));
      }
    }
    for (const sale of appSales) {
      if (sale.active && sale.userId && (sale.tierKey ?? BASE_TIER_KEY) === key) {
        holders.add(String(sale.userId));
      }
    }
    for (const userId of holders) {
      await memberAccessChanged(ctx, communityId, userId as any);
    }
    return;
  }

  await ctx.scheduler.runAfter(0, (internal as any).communityPlanPods.syncTierHoldersBatchInternal, {
    communityId,
    key,
    phase: "memberships",
    cursor: null,
  });
}

export const syncTierHoldersBatchInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    key: v.string(),
    phase: v.union(v.literal("memberships"), v.literal("app_grants")),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community) return { done: true, synced: 0 };

    if (args.phase === "memberships") {
      const page = await ctx.db
        .query("communityMemberships")
        .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
        .paginate({ cursor: args.cursor, numItems: TIER_HOLDER_SYNC_BATCH_SIZE });
      const priceTier = new Map<string, string>();
      const synced = new Set<string>();
      for (const membership of page.page) {
        if (await membershipHoldsTierKey(ctx, membership, args.key, priceTier)) {
          const uid = String(membership.userId);
          if (synced.has(uid)) continue;
          synced.add(uid);
          await memberAccessChanged(ctx, args.communityId, membership.userId);
        }
      }
      if (!page.isDone) {
        await ctx.scheduler.runAfter(0, (internal as any).communityPlanPods.syncTierHoldersBatchInternal, {
          communityId: args.communityId,
          key: args.key,
          phase: "memberships",
          cursor: page.continueCursor,
        });
        return { done: false, synced: synced.size };
      }
      await ctx.scheduler.runAfter(0, (internal as any).communityPlanPods.syncTierHoldersBatchInternal, {
        communityId: args.communityId,
        key: args.key,
        phase: "app_grants",
        cursor: null,
      });
      return { done: false, synced: synced.size };
    }

    const page = await ctx.db
      .query("communityAppGrants")
      .withIndex("by_community_user", (q) => q.eq("communityId", args.communityId))
      .paginate({ cursor: args.cursor, numItems: TIER_HOLDER_SYNC_BATCH_SIZE });
    const synced = new Set<string>();
    for (const sale of page.page) {
      if (sale.active && sale.userId && (sale.tierKey ?? BASE_TIER_KEY) === args.key) {
        const uid = String(sale.userId);
        if (synced.has(uid)) continue;
        synced.add(uid);
        await memberAccessChanged(ctx, args.communityId, sale.userId);
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, (internal as any).communityPlanPods.syncTierHoldersBatchInternal, {
        communityId: args.communityId,
        key: args.key,
        phase: "app_grants",
        cursor: page.continueCursor,
      });
      return { done: false, synced: synced.size };
    }
    return { done: true, synced: synced.size };
  },
});
