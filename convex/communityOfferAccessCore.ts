import { internal } from "./_generated/api";
import { communityMembershipRowIsActive, getUniqueCommunityMembershipByPair } from "./communityCore";
import { setChannelParticipantCore } from "./communityChannelParticipants";
import {
  COMMUNITY_OFFER_PROPERTY_KEY,
  COMMUNITY_OFFER_PROPERTY_NAME,
  communityOfferAudienceIncludes,
  communityOffersHeld,
  diffCommunityOffersHeld,
  resolveCommunityOfferLadder,
  type CommunityOfferDefinition,
} from "../shared/communityOffers";

// Keeps what a member's offer unlocks in step with the records that decide it
// (their subscription's price, or the owner's grant). Runs inside every write
// that can change access, through syncCommunityAccessForUser, and again for
// everyone when the owner changes the offers or a channel's audience. A
// community that never saved an offer sells one and nothing here runs.

export async function readCommunityOfferRows(ctx: any, communityId: any): Promise<any[]> {
  return await ctx.db.query("communityOffers").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).take(50);
}

/**
 * The price a checkout for a higher offer charges. Null for the base offer (or
 * no offer), which the community's own current price covers.
 */
export async function resolveCommunityOfferCheckoutPricePoint(ctx: any, args: {
  communityId: any; offerKey?: string | null; billingPeriod: "monthly" | "annual";
}): Promise<{ pricePoint: any; offerKey: string; offerName: string; rank: number } | null> {
  const key = String(args.offerKey ?? "").trim();
  if (!key) return null;
  const offerRows = await readCommunityOfferRows(ctx, args.communityId);
  const row = offerRows.find((offer: any) => offer.key === key);
  if (!row) {
    if (key === resolveCommunityOfferLadder([]).find((offer) => offer.isBase)!.key) return null;
    throw new Error("offer_not_found");
  }
  if (row.isBase) return null;
  if (row.archivedAt) throw new Error("offer_not_for_sale");
  const prices = await ctx.db.query("communityPricePoints")
    .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId)).take(200);
  const pricePoint = prices
    .filter((price: any) => String(price.offerId) === String(row._id) && price.billingPeriod === args.billingPeriod && !price.archivedAt)
    .sort((a: any, b: any) => b.updatedAt - a.updatedAt)[0];
  if (!pricePoint) throw new Error("offer_price_missing");
  return { pricePoint, offerKey: row.key, offerName: row.name, rank: row.rank };
}

export function communityOfferDefinitionOf(row: any): CommunityOfferDefinition & { id: string } {
  return { id: String(row._id), key: row.key, name: row.name, rank: row.rank, isBase: Boolean(row.isBase), archived: Boolean(row.archivedAt) };
}

/** The one offer a member is on: their grant's, their subscription price's, else the base offer. Null when not a member. */
export async function resolveMemberOfferKey(ctx: any, args: { communityId: any; membership: any; offerRows: any[] }): Promise<string | null> {
  const { membership } = args;
  if (!membership || !communityMembershipRowIsActive(membership)) return null;
  const ladder = resolveCommunityOfferLadder(args.offerRows.map(communityOfferDefinitionOf));
  const base = ladder.find((offer) => offer.isBase)!;
  const grant = await ctx.db.query("communityAccessGrants")
    .withIndex("by_community_user_status", (q: any) => q.eq("communityId", args.communityId).eq("userId", membership.userId).eq("status", "active"))
    .first();
  if (grant?.offerKey && ladder.some((offer) => offer.key === grant.offerKey)) return grant.offerKey;
  if (grant) return base.key;
  const subscriptions = await ctx.db.query("communitySubscriptions")
    .withIndex("by_membership", (q: any) => q.eq("membershipId", membership._id)).take(20);
  const live = subscriptions.filter((row: any) => row.status === "active" || row.status === "past_due" || row.status === "cancel_at_period_end");
  const pricePointIds = live.length ? live.map((row: any) => row.pricePointId) : [membership.pricePointId];
  // More than one live plan (mid-switch): the highest offer among them.
  let best: any = null;
  for (const pricePointId of pricePointIds) {
    const pricePoint = pricePointId ? await ctx.db.get(pricePointId) : null;
    const row = pricePoint?.offerId ? args.offerRows.find((offer: any) => String(offer._id) === String(pricePoint.offerId)) : null;
    if (row && (!best || row.rank > best.rank)) best = row;
  }
  return best?.key ?? base.key;
}

/** The system "Offer" member property, created the first time it is needed, with the offers' names as options. */
export async function ensureCommunityOfferProperty(ctx: any, args: { communityId: any; offerRows: any[]; actorUserId: any; nowMs: number }) {
  const names = resolveCommunityOfferLadder(args.offerRows.filter((row: any) => !row.archivedAt).map(communityOfferDefinitionOf)).map((offer) => offer.name);
  const existing = await ctx.db.query("communityClientProperties")
    .withIndex("by_community_key", (q: any) => q.eq("communityId", args.communityId).eq("key", COMMUNITY_OFFER_PROPERTY_KEY)).unique();
  if (existing) {
    if (existing.archivedAt || JSON.stringify(existing.options) !== JSON.stringify(names)) {
      await ctx.db.patch(existing._id, { options: names, archivedAt: undefined, updatedAt: args.nowMs });
    }
    return { ...existing, options: names, archivedAt: undefined };
  }
  const all = await ctx.db.query("communityClientProperties").withIndex("by_community", (q: any) => q.eq("communityId", args.communityId)).take(200);
  const nameTaken = all.some((row: any) => !row.archivedAt && row.name.toLowerCase() === COMMUNITY_OFFER_PROPERTY_NAME.toLowerCase());
  const row = {
    communityId: args.communityId,
    key: COMMUNITY_OFFER_PROPERTY_KEY,
    name: nameTaken ? "Offer (Polynet)" : COMMUNITY_OFFER_PROPERTY_NAME,
    type: "multi_select" as const,
    options: names,
    position: -1,
    system: "offer" as const,
    createdByUserId: args.actorUserId,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  };
  const id = await ctx.db.insert("communityClientProperties", row);
  return { _id: id, ...row };
}

export type CommunityMemberOfferSync = {
  offerKey: string | null;
  held: string[];
  started: string[];
  ended: string[];
  channelsAdded: number;
  channelsRemoved: number;
};

/**
 * Brings one member's offer up to date: the Offer property, the channels their
 * offers open, and (unless `quiet`) the Workflow steps that run when an offer
 * starts or ends. Owner-side resyncs (new offer, reordered ladder, a channel's
 * audience changed) are quiet, so they never start steps for everyone at once.
 */
export async function syncCommunityMemberOffers(ctx: any, args: {
  communityId: any;
  userId: any;
  nowMs: number;
  quiet?: boolean;
  offerRows?: any[];
  offerChannels?: any[];
}): Promise<CommunityMemberOfferSync | null> {
  const offerRows = args.offerRows ?? await readCommunityOfferRows(ctx, args.communityId);
  if (!offerRows.length) return null;
  const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId: args.communityId, userId: args.userId });
  if (!membership) return null;
  const community = await ctx.db.get(args.communityId);
  if (!community) return null;
  const definitions = offerRows.map(communityOfferDefinitionOf);
  const offerKey = await resolveMemberOfferKey(ctx, { communityId: args.communityId, membership, offerRows });
  const held = communityOffersHeld(definitions, offerKey);
  const heldKeys = held.map((offer) => offer.key);

  const property = await ensureCommunityOfferProperty(ctx, { communityId: args.communityId, offerRows, actorUserId: community.ownerId, nowMs: args.nowMs });
  const value = await ctx.db.query("communityClientValues")
    .withIndex("by_membership_property", (q: any) => q.eq("membershipId", membership._id).eq("propertyKey", property.key)).unique();
  const names = held.map((offer) => offer.name);
  if (!names.length) {
    if (value) await ctx.db.delete(value._id);
  } else if (JSON.stringify(value?.value ?? null) !== JSON.stringify(names)) {
    const row = { value: names, updatedByUserId: community.ownerId, updatedVia: "workflow" as const, updatedAt: args.nowMs };
    if (value) await ctx.db.patch(value._id, row);
    else await ctx.db.insert("communityClientValues", { communityId: args.communityId, membershipId: membership._id, propertyKey: property.key, ...row });
  }

  const channels = args.offerChannels ?? await readCommunityOfferChannels(ctx, args.communityId);
  let channelsAdded = 0;
  let channelsRemoved = 0;
  const principalKey = `user:${membership.userId}`;
  for (const channel of channels) {
    const should = heldKeys.length > 0 && communityOfferAudienceIncludes(channel.offerAudience, held);
    const grant = await ctx.db.query("communityChannelParticipants")
      .withIndex("by_channel_principal", (q: any) => q.eq("channelId", channel._id).eq("principalKey", principalKey)).first();
    const current = grant?.status === "active" && String(grant.membershipId) === String(membership._id)
      && grant.membershipActivationSequence === Math.max(0, Math.floor(Number(membership.activationSequence ?? 0)));
    if (should && !current) {
      await setChannelParticipantCore(ctx, { communityId: args.communityId, channelId: channel._id, createdByUserId: community.ownerId,
        active: true, target: { kind: "member", userId: membership.userId } });
      const row = await ctx.db.query("communityChannelParticipants")
        .withIndex("by_channel_principal", (q: any) => q.eq("channelId", channel._id).eq("principalKey", principalKey)).first();
      // Someone the owner added by hand stays theirs to remove.
      if (row && !(grant?.status === "active" && !grant.viaOffer)) await ctx.db.patch(row._id, { viaOffer: true });
      channelsAdded += 1;
    } else if (!should && grant?.status === "active" && grant.viaOffer) {
      await setChannelParticipantCore(ctx, { communityId: args.communityId, channelId: channel._id, createdByUserId: community.ownerId,
        active: false, target: { kind: "member", userId: membership.userId } });
      channelsRemoved += 1;
    }
  }

  const before: string[] = (membership as { heldOfferKeys?: string[] }).heldOfferKeys ?? [];
  const { started, ended } = diffCommunityOffersHeld(before, heldKeys);
  if (started.length || ended.length) {
    await ctx.db.patch(membership._id, { heldOfferKeys: heldKeys, updatedAt: args.nowMs });
    if (!args.quiet) {
      await ctx.scheduler.runAfter(0, (internal as any).communityMemberWorkflows.handleOfferChangedInternal, {
        communityId: args.communityId, userId: membership.userId, membershipId: membership._id,
        activationSequence: Number(membership.activationSequence ?? 0), started, ended, at: args.nowMs,
      });
    }
  }
  return { offerKey, held: heldKeys, started, ended, channelsAdded, channelsRemoved };
}

/** Channels the offer sync manages: live, invite-only, with an offer audience. */
export async function readCommunityOfferChannels(ctx: any, communityId: any): Promise<any[]> {
  const rows = await ctx.db.query("communityChannels")
    .withIndex("by_community_access_status_position", (q: any) => q.eq("communityId", communityId).eq("accessMode", "restricted").eq("status", "active"))
    .take(200);
  return rows.filter((row: any) => Array.isArray(row.offerAudience) && row.offerAudience.length > 0);
}

/** Every member, after the owner changed the ladder or a channel's audience. Quiet: no Workflow steps start. */
export async function resyncCommunityOffersForEveryone(ctx: any, communityId: any, nowMs: number): Promise<{ members: number; truncated: boolean }> {
  const offerRows = await readCommunityOfferRows(ctx, communityId);
  if (!offerRows.length) return { members: 0, truncated: false };
  const offerChannels = await readCommunityOfferChannels(ctx, communityId);
  const memberships = await ctx.db.query("communityMemberships").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).take(1001);
  const truncated = memberships.length > 1000;
  let members = 0;
  for (const membership of memberships.slice(0, 1000)) {
    if (!communityMembershipRowIsActive(membership) && !membership.heldOfferKeys?.length) continue;
    await syncCommunityMemberOffers(ctx, { communityId, userId: membership.userId, nowMs, quiet: true, offerRows, offerChannels });
    members += 1;
  }
  return { members, truncated };
}
