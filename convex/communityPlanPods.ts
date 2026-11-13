// Plans include pods (docs/specs/pods-v0.md): whoever holds a plan has a seat
// in each pod it includes, whichever side sold the plan (Polynet's checkout or
// the community's own app). The seat's reason is "plan"; a host's add or a pod
// payment are reasons of their own, so this never touches them
// (communityChannelParticipants.setChannelParticipantCore).
import { notifyConnectedApps } from "./connectedAppNotify";
import { seatReasons, setChannelParticipantCore } from "./communityChannelParticipants";
import { heldTiers, tierHolderIds } from "./communityHeldTiers";

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

/** A plan's grants or pods changed: everyone holding it. */
export async function tierHoldersChanged(ctx: any, communityId: any, key: string): Promise<void> {
  for (const userId of await tierHolderIds(ctx, communityId, key)) await memberAccessChanged(ctx, communityId, userId as any);
}
