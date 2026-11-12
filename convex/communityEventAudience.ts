// Pod calls (docs/specs/pods-v0.md, slice 3a): an event with a pod
// (communityEvents.podChannelId) is visible only to people who can enter
// that pod. This is the one rule. Every reader of communityEvents goes
// through this module (scripts/community_event_audience.test.ts fails a
// reader that doesn't): community-wide readers drop pod events; per-person
// readers keep the ones that person may see.
import { getCommunityChannelCapabilities, resolveCommunityChannelActor } from "./communityChannelAccess";
import { communityMembershipRowIsActive } from "./communityCore";

export function isPodEvent(row: any): boolean {
  return Boolean(row?.podChannelId);
}

// For readers with no single viewer (the handbook, the founder's brief, the
// "events changed" marker): pod calls never appear.
export function communityWideEvents<T>(rows: T[]): T[] {
  return rows.filter((row) => !isPodEvent(row));
}

async function openPodRoom(ctx: any, communityId: any, channelId: any) {
  const channel = await ctx.db.get(channelId) as any;
  return channel && String(channel.communityId) === String(communityId)
    && channel.accessMode === "restricted" && channel.status === "active" ? channel : null;
}

// A per-person check, reused across a list: may this member see this event?
export function eventViewer(ctx: any, communityId: any, userId: any): (row: any) => Promise<boolean> {
  let actor: any = null;
  const seen = new Map<string, boolean>();
  return async (row: any) => {
    if (!isPodEvent(row)) return true;
    const key = String(row.podChannelId);
    const known = seen.get(key);
    if (known !== undefined) return known;
    const channel = await openPodRoom(ctx, communityId, row.podChannelId);
    let visible = false;
    if (channel) {
      actor ??= await resolveCommunityChannelActor({ ctx, communityId, userId });
      visible = (await getCommunityChannelCapabilities({ ctx, channel, actor })).canRead;
    }
    seen.set(key, visible);
    return visible;
  };
}

export async function visibleEvents<T>(rows: T[], visible: (row: T) => Promise<boolean>): Promise<T[]> {
  const kept: T[] = [];
  for (const row of rows) if (await visible(row)) kept.push(row);
  return kept;
}

// Who may schedule, change or cancel a pod's calls: builders and admins, and
// the pod's own hosts.
export async function requirePodEventManager(ctx: any, communityId: any, channelId: any, userId: any) {
  const channel = await openPodRoom(ctx, communityId, channelId);
  if (!channel) throw new Error("community_pod_not_found");
  const actor = await resolveCommunityChannelActor({ ctx, communityId, userId });
  if (actor.isManager) return channel;
  const record = await ctx.db.query("communityPods")
    .withIndex("by_community_channel", (q: any) => q.eq("communityId", communityId).eq("channelId", channelId)).first();
  if (!record?.hostUserIds?.some((id: any) => String(id) === String(userId))) throw new Error("community_pod_manager_required");
  return channel;
}

// Who a pod call's reminder goes to: the people who can enter the pod now.
// A grant counts only while it is bound to the member's current membership
// (someone who left and rejoined isn't back in the pod until re-added), the
// same check the room's own access makes.
export async function podEventRecipientIds(ctx: any, row: any): Promise<Set<string>> {
  const channel = await openPodRoom(ctx, row.communityId, row.podChannelId);
  if (!channel) return new Set();
  const grants = await ctx.db.query("communityChannelParticipants")
    .withIndex("by_channel_principal", (q: any) => q.eq("channelId", row.podChannelId)).take(500);
  const recipients = new Set<string>();
  for (const grant of grants) {
    if (grant.status !== "active" || !String(grant.principalKey).startsWith("user:") || !grant.membershipId) continue;
    const membership = await ctx.db.get(grant.membershipId) as any;
    if (!membership || !communityMembershipRowIsActive(membership)) continue;
    if (Number(grant.membershipActivationSequence ?? 0) !== Math.max(0, Math.floor(Number(membership.activationSequence ?? 0)))) continue;
    if (`user:${membership.userId}` !== String(grant.principalKey)) continue;
    recipients.add(String(membership.userId));
  }
  return recipients;
}
