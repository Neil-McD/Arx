import type { FounderPlanTier } from "./founderPlan";

// The plan a visitor picked on the public pricing section, carried through
// sign-in (an OAuth round trip in the same tab) to the community they create.
// Kept for this tab only, and only briefly: a choice from yesterday is not a
// choice. Nothing here charges anyone; it only decides which plan is offered
// first once the community exists.

const CHOICE_KEY = "polynet.landingPlanChoice";
const OFFER_KEY_PREFIX = "polynet.planOffer.";
const CHOICE_TTL_MS = 2 * 60 * 60 * 1000;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function store(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function isFounderPlanTier(value: unknown): value is FounderPlanTier {
  return value === "guide" || value === "chief_of_staff";
}

// `null`: the visitor chose to start free (or used a button that names no plan).
export function rememberLandingPlanChoice(tier: FounderPlanTier | null, nowMs = Date.now(), target: Store | null = store()): void {
  if (!target) return;
  try {
    if (tier) target.setItem(CHOICE_KEY, JSON.stringify({ tier, at: nowMs }));
    else target.removeItem(CHOICE_KEY);
  } catch {
    // Storage blocked: the community is still created; the plan is chosen in Settings.
  }
}

// Reads and forgets the choice. Old or malformed choices count as none.
export function takeLandingPlanChoice(nowMs = Date.now(), target: Store | null = store()): FounderPlanTier | null {
  if (!target) return null;
  try {
    const raw = target.getItem(CHOICE_KEY);
    target.removeItem(CHOICE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { tier?: unknown; at?: unknown };
    const at = Number(parsed?.at);
    if (!isFounderPlanTier(parsed?.tier) || !Number.isFinite(at) || nowMs - at > CHOICE_TTL_MS || at > nowMs + 60_000) return null;
    return parsed.tier;
  } catch {
    return null;
  }
}

// Once the community exists, the choice becomes an offer on that community's
// Guide settings until the host starts it or says not now.
export function rememberPlanOffer(communityId: string, tier: FounderPlanTier, target: Store | null = store()): void {
  if (!target || !communityId) return;
  try {
    target.setItem(`${OFFER_KEY_PREFIX}${communityId}`, tier);
  } catch {
    // Nothing to do: the plan ladder is still there.
  }
}

export function readPlanOffer(communityId: string, target: Store | null = store()): FounderPlanTier | null {
  if (!target || !communityId) return null;
  try {
    const value = target.getItem(`${OFFER_KEY_PREFIX}${communityId}`);
    return isFounderPlanTier(value) ? value : null;
  } catch {
    return null;
  }
}

export function clearPlanOffer(communityId: string, target: Store | null = store()): void {
  if (!target || !communityId) return;
  try {
    target.removeItem(`${OFFER_KEY_PREFIX}${communityId}`);
  } catch {
    // Nothing to do.
  }
}
