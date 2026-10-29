import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { bootstrapConvexAuthenticatedClient, createConvexClient } from "./convexAuthenticatedClient";

// Settings › Offers. The owner's agent saves through the same mutations (community.offer.*).

export type CommunityOfferPrice = {
  price_point_id: string;
  billing_period: "monthly" | "annual";
  amount_base_units: number;
  currency: string;
  currency_decimals: number;
};

export type CommunityBuilderOffer = {
  key: string;
  name: string;
  blurb: string | null;
  rank: number;
  is_base: boolean;
  show_on_sales_page: boolean;
  archived: boolean;
  saved: boolean;
  price: CommunityOfferPrice | null;
  members: number;
};

export type CommunityBuilderOffers = {
  offers: CommunityBuilderOffer[];
  channels: Array<{ id: string; name: string; access_mode: string; offer_audience: string[] }>;
  limits: { offers: number; nameLength: number; blurbLength: number };
};

export async function fetchCloudCommunityOffers<SessionT>(params: { session: SessionT; communityId: string }) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.query(api.communityOffers.listCommunityOffers, {
    authSubject,
    communityId: params.communityId as Id<"communities">,
  })) as CommunityBuilderOffers;
}

export async function saveCloudCommunityOffer<SessionT>(params: {
  session: SessionT;
  communityId: string;
  key?: string;
  name: string;
  blurb?: string | null;
  showOnSalesPage?: boolean;
  price?: { billingPeriod: "monthly" | "annual"; amountBaseUnits: number } | null;
}) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.mutation(api.communityOffers.saveCommunityOffer, {
    authSubject,
    communityId: params.communityId as Id<"communities">,
    ...(params.key ? { key: params.key } : {}),
    name: params.name,
    ...(params.blurb !== undefined ? { blurb: params.blurb } : {}),
    ...(params.showOnSalesPage !== undefined ? { showOnSalesPage: params.showOnSalesPage } : {}),
    ...(params.price !== undefined ? { price: params.price } : {}),
  })) as { key: string };
}

export async function setCloudCommunityOfferArchived<SessionT>(params: { session: SessionT; communityId: string; key: string; archived: boolean }) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation(api.communityOffers.setCommunityOfferArchived, {
    authSubject,
    communityId: params.communityId as Id<"communities">,
    key: params.key,
    archived: params.archived,
  });
}

export async function setCloudCommunityChannelOfferAudience<SessionT>(params: { session: SessionT; communityId: string; channelId: string; offerKeys: string[] }) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation(api.communityOffers.setCommunityChannelOfferAudience, {
    authSubject,
    communityId: params.communityId as Id<"communities">,
    channelId: params.channelId as Id<"communityChannels">,
    offerKeys: params.offerKeys,
  });
}

export function formatCommunityOfferPrice(price: Omit<CommunityOfferPrice, "price_point_id"> | null): string {
  if (!price) return "No price";
  const amount = price.amount_base_units / 10 ** price.currency_decimals;
  const text = new Intl.NumberFormat("en-US", { style: "currency", currency: price.currency.toUpperCase(),
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2 }).format(amount);
  return `${text} / ${price.billing_period === "annual" ? "year" : "month"}`;
}

// The sales page and a member's Upgrade: the offers on sale, and the one the viewer is on.
export type CommunityVisitorOffer = {
  key: string;
  name: string;
  blurb: string | null;
  rank: number;
  is_base: boolean;
  prices: Array<Omit<CommunityOfferPrice, "price_point_id">>;
};

export type CommunityVisitorOffers = {
  offers: CommunityVisitorOffer[];
  current_offer_key: string | null;
  can_upgrade_here: boolean;
};

export async function fetchCloudCommunityVisitorOffers<SessionT>(params: { session: SessionT | null; communityId: string }) {
  let client = createConvexClient();
  let authSubject: string | null = null;
  if (params.session) {
    const bootstrapped = await bootstrapConvexAuthenticatedClient(params.session);
    client = bootstrapped.client;
    authSubject = bootstrapped.authSubject;
  }
  return (await client.query(api.communityOfferCheckout.getCommunityOffersForVisitor, {
    communityId: params.communityId as Id<"communities">,
    ...(authSubject ? { authSubject } : {}),
  })) as CommunityVisitorOffers;
}

export async function startCloudCommunityOfferUpgrade<SessionT>(params: { session: SessionT; communityId: string; offerKey: string }) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.action(api.communityOfferCheckout.startCommunityOfferUpgrade, {
    authSubject,
    communityId: params.communityId as Id<"communities">,
    offerKey: params.offerKey,
  })) as
    | { status: "checkout_required" }
    | { status: "upgraded"; offer_key: string }
    | { status: "payment_needed"; offer_key: string; invoice_url: string | null };
}

const OFFER_UPGRADE_ERRORS: Record<string, string> = {
  offer_upgrade_ask_owner: "Your access was given by the owner, so they change your offer. Send them a message.",
  offer_upgrade_payment_issue: "Your last payment didn't go through. Update your card first, then upgrade.",
  offer_upgrade_not_higher: "You already have this offer.",
  offer_price_missing: "This offer has no price yet.",
  offer_not_for_sale: "This offer isn't for sale right now.",
  offer_not_found: "This offer isn't for sale right now.",
  community_checkout_unavailable: "Checkout is temporarily unavailable for this community.",
};

export function communityOfferUpgradeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const code = Object.keys(OFFER_UPGRADE_ERRORS).find((key) => raw.includes(key));
  return code ? OFFER_UPGRADE_ERRORS[code] : "Something went wrong. Try again in a moment.";
}

/** Membership (the base offer) is the community's own price: free, or paid for new members. */
export async function setCloudCommunityBaseOfferPrice<SessionT>(params: {
  session: SessionT;
  communityId: string;
  price: { billingPeriod: "monthly" | "annual"; amountBaseUnits: number } | null;
}) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation(api.communityOffers.setCommunityBaseOfferPrice, {
    authSubject,
    communityId: params.communityId as Id<"communities">,
    price: params.price,
  });
}
