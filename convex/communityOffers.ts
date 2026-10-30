import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  communityMembershipRowIsActive,
  listActiveTestMemberUserIds,
  requireCommunityManager,
  requireCommunityOwner,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import { requireCommunityChannelLineage } from "./communityChannelCore";
import { saveCommunitySettingsCore } from "./communityLifecycle";
import {
  communityOfferDefinitionOf,
  readCommunityOfferRows,
  resyncCommunityOffersForEveryone,
} from "./communityOfferAccessCore";
import {
  COMMUNITY_BASE_OFFER_KEY,
  COMMUNITY_BASE_OFFER_NAME,
  COMMUNITY_OFFER_LIMITS,
  communityOfferKeyFromName,
  resolveCommunityOfferLadder,
} from "../shared/communityOffers";

// Settings › Offers: the packages a community sells. The base offer is the
// community's own price (General › Access & pricing); every other offer has
// its own price and includes everything ranked below it. The owner's agent
// saves through the same handlers (community.offer.*).

class CommunityOfferError extends Error {
  constructor(readonly code: string) { super(code); }
}

const authArgs = { userId: v.optional(v.id("users")), authSubject: v.optional(v.string()), communityId: v.id("communities") };

async function actor(ctx: any, args: any) {
  return await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
}

function cleanText(value: unknown, max: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function listPricePoints(ctx: any, communityId: any): Promise<any[]> {
  return await ctx.db.query("communityPricePoints").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).take(200);
}

function priceOf(row: any) {
  return { price_point_id: String(row._id), billing_period: row.billingPeriod as "monthly" | "annual",
    amount_base_units: row.amountBaseUnits as number, currency: row.currency as string, currency_decimals: row.currencyDecimals as number };
}

/** The owner's view: the ladder lowest first, each offer's live price, members on it, and the channels it opens. */
export async function readCommunityOffersForBuilder(ctx: any, communityId: any) {
  const rows = await readCommunityOfferRows(ctx, communityId);
  const prices = await listPricePoints(ctx, communityId);
  const basePrice = prices.filter((row) => row.isCurrent && !row.archivedAt && !row.offerId).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
  const ladder = resolveCommunityOfferLadder(rows.map(communityOfferDefinitionOf));
  const memberships = await ctx.db.query("communityMemberships").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).take(2000);
  const counts = new Map<string, number>();
  const community: any = await ctx.db.get(communityId);
  const testUserIds = await listActiveTestMemberUserIds(ctx, communityId);
  for (const membership of memberships) {
    if (!communityMembershipRowIsActive(membership)) continue;
    // The same people the sales page and Members count: no owner, no test members.
    if (String(membership.userId) === String(community?.ownerId) || testUserIds.has(String(membership.userId))) continue;
    const top = (membership.heldOfferKeys ?? []).at(-1) ?? (rows.length ? null : COMMUNITY_BASE_OFFER_KEY);
    if (top) counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  const channels = await ctx.db.query("communityChannels")
    .withIndex("by_community_status_position", (q: any) => q.eq("communityId", communityId).eq("status", "active")).take(200);
  return {
    contract: "polynet.builder_offers.v1",
    guidance: "Offers are a ladder, lowest first: an offer includes everything in the offers below it. "
      + "The base offer is priced in General › Access & pricing; save the others with community.offer.save. "
      + "Open an invite-only channel to some offers with community.offer.channel_audience; members are then added and removed by their offer.",
    offers: ladder.map((offer) => {
      const row = rows.find((item: any) => item.key === offer.key);
      const own = row ? prices.filter((price) => String(price.offerId) === String(row._id) && !price.archivedAt) : [];
      const price = offer.isBase ? basePrice : own.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
      return {
        key: offer.key,
        name: offer.name,
        blurb: row?.blurb ?? null,
        rank: offer.rank,
        is_base: Boolean(offer.isBase),
        show_on_sales_page: row ? row.showOnSalesPage : true,
        archived: Boolean(row?.archivedAt),
        saved: Boolean(row),
        price: price ? priceOf(price) : null,
        members: counts.get(offer.key) ?? 0,
      };
    }),
    channels: channels
      .filter((row: any) => row.systemRole !== "general")
      .map((row: any) => ({ id: String(row._id), name: row.name as string, access_mode: row.accessMode as string, offer_audience: row.offerAudience ?? [] })),
    limits: COMMUNITY_OFFER_LIMITS,
  };
}

async function ensureBaseOffer(ctx: any, args: { communityId: any; userId: any; nowMs: number }) {
  const rows = await readCommunityOfferRows(ctx, args.communityId);
  const base = rows.find((row: any) => row.isBase);
  if (base) return { rows, base };
  const id = await ctx.db.insert("communityOffers", {
    communityId: args.communityId, key: COMMUNITY_BASE_OFFER_KEY, name: COMMUNITY_BASE_OFFER_NAME, rank: 0, isBase: true,
    showOnSalesPage: true, createdByUserId: args.userId, updatedByUserId: args.userId, createdAt: args.nowMs, updatedAt: args.nowMs,
  });
  const created = await ctx.db.get(id);
  return { rows: [...rows, created], base: created };
}

async function setOfferPrice(ctx: any, args: {
  communityId: any; offer: any; price: { billingPeriod: "monthly" | "annual"; amountBaseUnits: number; currency?: string } | null; nowMs: number;
}) {
  const live = (await listPricePoints(ctx, args.communityId)).filter((row) => String(row.offerId) === String(args.offer._id) && !row.archivedAt);
  const same = args.price ? live.find((row) => row.billingPeriod === args.price!.billingPeriod
    && row.amountBaseUnits === args.price!.amountBaseUnits && row.currency === (args.price!.currency ?? "usd")) : null;
  // Members already paying keep the price they bought; it is archived, not changed.
  for (const row of live) {
    if (row !== same) await ctx.db.patch(row._id, { archivedAt: args.nowMs, updatedAt: args.nowMs });
  }
  if (!args.price || same) {
    if (same) await ctx.db.patch(same._id, { name: args.offer.name, updatedAt: args.nowMs });
    return;
  }
  await ctx.db.insert("communityPricePoints", {
    communityId: args.communityId, offerId: args.offer._id, billingPeriod: args.price.billingPeriod, name: args.offer.name,
    ...(args.offer.blurb ? { description: args.offer.blurb } : {}),
    amountBaseUnits: args.price.amountBaseUnits, currency: args.price.currency ?? "usd", currencyDecimals: 2,
    isCurrent: false, createdAt: args.nowMs, updatedAt: args.nowMs,
  });
}

const saveArgs = {
  ...authArgs,
  key: v.optional(v.string()),
  name: v.string(),
  blurb: v.optional(v.union(v.string(), v.null())),
  showOnSalesPage: v.optional(v.boolean()),
  // A higher offer's price; the base offer's lives in General › Access & pricing.
  price: v.optional(v.union(v.null(), v.object({
    billingPeriod: v.union(v.literal("monthly"), v.literal("annual")),
    amountBaseUnits: v.number(),
    currency: v.optional(v.string()),
  }))),
};

async function saveOffer(ctx: any, args: any) {
  const userId = await actor(ctx, args);
  await requireCommunityOwner({ ctx, communityId: args.communityId, userId });
  const nowMs = Date.now();
  const name = cleanText(args.name, COMMUNITY_OFFER_LIMITS.nameLength);
  if (!name) throw new CommunityOfferError("offer_name_required");
  const blurb = args.blurb === undefined ? undefined : cleanText(args.blurb, COMMUNITY_OFFER_LIMITS.blurbLength);
  if (args.price) {
    const amount = Number(args.price.amountBaseUnits);
    if (!Number.isSafeInteger(amount) || amount < 100 || amount > 10_000_000) throw new CommunityOfferError("offer_price_invalid");
  }
  const { rows } = await ensureBaseOffer(ctx, { communityId: args.communityId, userId, nowMs });
  const live = rows.filter((row: any) => !row.archivedAt);
  if (live.some((row: any) => row.key !== args.key && row.name.toLowerCase() === name.toLowerCase())) throw new CommunityOfferError("offer_name_taken");
  let offer = args.key ? rows.find((row: any) => row.key === args.key) : null;
  if (args.key && !offer) throw new CommunityOfferError("offer_not_found");
  if (offer) {
    if (offer.isBase && args.price) throw new CommunityOfferError("offer_base_price_in_general");
    await ctx.db.patch(offer._id, {
      name, ...(blurb !== undefined ? { blurb: blurb || undefined } : {}),
      ...(args.showOnSalesPage !== undefined ? { showOnSalesPage: args.showOnSalesPage } : {}),
      updatedByUserId: userId, updatedAt: nowMs,
    });
  } else {
    if (live.length >= COMMUNITY_OFFER_LIMITS.offers) throw new CommunityOfferError("offer_limit_reached");
    const key = communityOfferKeyFromName(name, new Set(rows.map((row: any) => row.key)));
    const id = await ctx.db.insert("communityOffers", {
      communityId: args.communityId, key, name, ...(blurb ? { blurb } : {}),
      rank: Math.max(0, ...rows.map((row: any) => row.rank)) + 1,
      showOnSalesPage: args.showOnSalesPage ?? true,
      createdByUserId: userId, updatedByUserId: userId, createdAt: nowMs, updatedAt: nowMs,
    });
    offer = await ctx.db.get(id);
  }
  offer = await ctx.db.get(offer._id);
  if (!offer.isBase && args.price !== undefined) await setOfferPrice(ctx, { communityId: args.communityId, offer, price: args.price, nowMs });
  // A new or renamed offer changes what every member's Offer property says.
  const resync = await resyncCommunityOffersForEveryone(ctx, args.communityId, nowMs);
  return { key: offer.key, resynced_members: resync.members };
}

const reorderArgs = { ...authArgs, keys: v.array(v.string()) };

// The ladder order, lowest first; the base offer always stays at the bottom.
async function reorderOffers(ctx: any, args: any) {
  const userId = await actor(ctx, args);
  await requireCommunityOwner({ ctx, communityId: args.communityId, userId });
  const nowMs = Date.now();
  const rows = await readCommunityOfferRows(ctx, args.communityId);
  const movable = rows.filter((row: any) => !row.isBase);
  const keys: string[] = args.keys.filter((key: string) => movable.some((row: any) => row.key === key));
  if (new Set(keys).size !== keys.length) throw new CommunityOfferError("offer_order_invalid");
  const ordered = [...keys, ...movable.map((row: any) => row.key).filter((key: string) => !keys.includes(key))];
  for (const [index, key] of ordered.entries()) {
    const row = movable.find((item: any) => item.key === key);
    if (row.rank !== index + 1) await ctx.db.patch(row._id, { rank: index + 1, updatedByUserId: userId, updatedAt: nowMs });
  }
  await resyncCommunityOffersForEveryone(ctx, args.communityId, nowMs);
  return { keys: ordered };
}

const archiveArgs = { ...authArgs, key: v.string(), archived: v.boolean() };

// An archived offer is no longer sold; the members on it keep it.
async function setOfferArchived(ctx: any, args: any) {
  const userId = await actor(ctx, args);
  await requireCommunityOwner({ ctx, communityId: args.communityId, userId });
  const nowMs = Date.now();
  const row = (await readCommunityOfferRows(ctx, args.communityId)).find((item: any) => item.key === args.key);
  if (!row) throw new CommunityOfferError("offer_not_found");
  if (row.isBase) throw new CommunityOfferError("offer_base_required");
  await ctx.db.patch(row._id, { archivedAt: args.archived ? nowMs : undefined, updatedByUserId: userId, updatedAt: nowMs });
  await resyncCommunityOffersForEveryone(ctx, args.communityId, nowMs);
  return { key: row.key, archived: args.archived };
}

const audienceArgs = { ...authArgs, channelId: v.id("communityChannels"), offerKeys: v.array(v.string()) };

// "Who gets this?" on an invite-only channel: the offers it is for. Empty means
// only the people the owner adds by hand, as before.
async function setChannelAudience(ctx: any, args: any) {
  const userId = await actor(ctx, args);
  await requireCommunityManager({ ctx, communityId: args.communityId, userId });
  const channel = await requireCommunityChannelLineage({ ctx, communityId: args.communityId, channelId: args.channelId });
  if (channel.status !== "active" || channel.systemRole === "general") throw new CommunityOfferError("offer_channel_unavailable");
  if (channel.accessMode !== "restricted") throw new CommunityOfferError("offer_channel_not_private");
  const nowMs = Date.now();
  if (args.offerKeys.length) await ensureBaseOffer(ctx, { communityId: args.communityId, userId, nowMs });
  const ladder = resolveCommunityOfferLadder((await readCommunityOfferRows(ctx, args.communityId)).map(communityOfferDefinitionOf));
  const keys = [...new Set<string>(args.offerKeys)];
  if (keys.some((key) => !ladder.some((offer) => offer.key === key))) throw new CommunityOfferError("offer_not_found");
  await ctx.db.patch(channel._id, { offerAudience: keys.length ? keys : undefined, updatedAt: nowMs });
  // Taking the audience away removes only the people it added.
  if (!keys.length) {
    const grants = await ctx.db.query("communityChannelParticipants")
      .withIndex("by_community_principal_status", (q: any) => q.eq("communityId", args.communityId)).take(2000);
    for (const grant of grants) {
      if (String(grant.channelId) === String(channel._id) && grant.viaOffer && grant.status === "active") {
        await ctx.db.patch(grant._id, { status: "revoked", updatedAt: nowMs });
      }
    }
  }
  const resync = await resyncCommunityOffersForEveryone(ctx, args.communityId, nowMs);
  return { channel_id: String(channel._id), offer_keys: keys, resynced_members: resync.members };
}

export const listCommunityOffers = query({
  args: authArgs,
  handler: async (ctx, args) => {
    const userId = await actor(ctx, args);
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    return await readCommunityOffersForBuilder(ctx, args.communityId);
  },
});
export const saveCommunityOffer = mutation({ args: saveArgs, handler: saveOffer });
export const reorderCommunityOffers = mutation({ args: reorderArgs, handler: reorderOffers });
export const setCommunityOfferArchived = mutation({ args: archiveArgs, handler: setOfferArchived });
export const setCommunityChannelOfferAudience = mutation({ args: audienceArgs, handler: setChannelAudience });

// The membership can be paid too. The base
// offer's price is the community's own price, so this is the same save as
// General › Access & pricing, with everything else kept as it is. People who
// are already members stay members; only new joiners pay.
const basePriceArgs = { ...authArgs, price: v.union(v.null(), v.object({
  billingPeriod: v.union(v.literal("monthly"), v.literal("annual")),
  amountBaseUnits: v.number(),
})) };

async function setBaseOfferPrice(ctx: any, args: any) {
  const userId = await actor(ctx, args);
  const { community } = await requireCommunityOwner({ ctx, communityId: args.communityId, userId });
  const amount = args.price ? Math.round(args.price.amountBaseUnits) : null;
  // NaN passes both comparisons, and the settings save reads it as "no price".
  if (amount !== null && (!Number.isSafeInteger(amount) || amount < 100 || amount > 10_000_000)) throw new CommunityOfferError("offer_price_invalid");
  await saveCommunitySettingsCore(ctx, {
    userId,
    communityId: args.communityId,
    expectedSettingsRevision: Number.isFinite(Number(community.settingsRevision)) ? Math.max(0, Math.floor(Number(community.settingsRevision))) : 0,
    name: community.name,
    slug: community.slug,
    oneLiner: community.oneLiner ?? null,
    about: community.about ?? null,
    visibility: community.visibility,
    monthlyAmountBaseUnits: args.price?.billingPeriod === "monthly" ? amount : null,
    annualAmountBaseUnits: args.price?.billingPeriod === "annual" ? amount : null,
    currency: "usd",
  });
  return { price: args.price ? { billing_period: args.price.billingPeriod, amount_base_units: amount } : null };
}

export const setCommunityBaseOfferPrice = mutation({ args: basePriceArgs, handler: setBaseOfferPrice });

