// Offers: the packages one community sells, as a ladder. Each member is on one
// offer and has every offer ranked at or below it, so "Membership + Consulting"
// includes everything "Membership" unlocks. A channel, track or Workflow step
// names the offers it is for; a member gets it when they have any of them.

export const COMMUNITY_BASE_OFFER_KEY = "membership";
export const COMMUNITY_BASE_OFFER_NAME = "Membership";
/** The member property Polynet keeps: the names of the offers a member has. */
export const COMMUNITY_OFFER_PROPERTY_KEY = "polynet_offer";
export const COMMUNITY_OFFER_PROPERTY_NAME = "Offer";

export const COMMUNITY_OFFER_LIMITS = {
  offers: 6,
  nameLength: 60,
  blurbLength: 280,
} as const;

export type CommunityOfferDefinition = {
  key: string;
  name: string;
  rank: number;
  isBase?: boolean;
  archived?: boolean;
};

/** Live offers lowest first; with none saved, the community sells one: Membership. */
export function resolveCommunityOfferLadder<T extends CommunityOfferDefinition>(offers: readonly T[]): Array<T | CommunityOfferDefinition> {
  const sorted = [...offers].sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key));
  if (sorted.some((offer) => offer.isBase)) return sorted;
  return [{ key: COMMUNITY_BASE_OFFER_KEY, name: COMMUNITY_BASE_OFFER_NAME, rank: 0, isBase: true }, ...sorted];
}

/** The offers a member on `offerKey` has: theirs and every one ranked below it. */
export function communityOffersHeld(
  offers: readonly CommunityOfferDefinition[],
  offerKey: string | null | undefined,
): CommunityOfferDefinition[] {
  if (!offerKey) return [];
  const ladder = resolveCommunityOfferLadder(offers);
  const own = ladder.find((offer) => offer.key === offerKey) ?? ladder.find((offer) => offer.isBase)!;
  return ladder.filter((offer) => offer.rank <= own.rank);
}

/** Whether a member holding these offers is in an audience of offer keys. */
export function communityOfferAudienceIncludes(audience: readonly string[] | null | undefined, held: readonly CommunityOfferDefinition[]): boolean {
  if (!audience || audience.length === 0) return true;
  return held.some((offer) => audience.includes(offer.key));
}

/** "Membership + Consulting" → "membership-consulting", unique among `taken`. */
export function communityOfferKeyFromName(name: string, taken: ReadonlySet<string>): string {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "offer";
  let key = base;
  for (let n = 2; taken.has(key); n += 1) key = `${base}-${n}`;
  return key;
}

/** What changed for one member: the offers they gained and lost, by key. */
export function diffCommunityOffersHeld(before: readonly string[], after: readonly string[]): { started: string[]; ended: string[] } {
  return {
    started: after.filter((key) => !before.includes(key)),
    ended: before.filter((key) => !after.includes(key)),
  };
}
