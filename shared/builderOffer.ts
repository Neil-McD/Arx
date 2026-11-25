import type {
  BuilderFundingAction,
  BuilderFundingState,
} from "./builderFunding";
import {
  POLYNET_BUILDER_OFFER_NAME,
  POLYNET_COMMUNITY_PLATFORM_FEE_BPS,
  POLYNET_FOUNDER_CHIEF_OF_STAFF_MONTHLY_PRICE_BASE_UNITS,
  POLYNET_FOUNDER_GUIDE_MONTHLY_PRICE_BASE_UNITS,
  type FounderPlanTier,
} from "./founderPlan";

export const POLYNET_BUILDER_OFFER = {
  id: "builder_community_v1",
  name: POLYNET_BUILDER_OFFER_NAME,
  priceBaseUnits: POLYNET_FOUNDER_CHIEF_OF_STAFF_MONTHLY_PRICE_BASE_UNITS,
  guidePriceBaseUnits: POLYNET_FOUNDER_GUIDE_MONTHLY_PRICE_BASE_UNITS,
  chiefOfStaffPriceBaseUnits: POLYNET_FOUNDER_CHIEF_OF_STAFF_MONTHLY_PRICE_BASE_UNITS,
  cadence: "month",
  scopeLabel: "per community",
  headline: "Give your community an agent",
  description:
    "Your community is free forever. Add Guide ($20/month, $3 AI included) for reactive answers and living memory, or Chief of Staff ($100/month, $20 AI included) for proactive briefs, member check-ins, and auto-replies.",
  purchaseHeadline: "Turn on your community agent",
  purchaseDescription:
    "Pick Guide ($20/month) for reactive 1:1 chats and living memory, or Chief of Staff ($100/month) to run proactive briefs, check-ins, and auto-replies.",
  purchaseNote: "Your community stays free either way.",
  benefits: [
    {
      title: "Guide ($20/month · $3 AI included)",
      description:
        "The community that remembers — reactive 1:1 chats, public @mentions, active-thread follow-ups, and strictly private community & personal memory.",
    },
    {
      title: "Chief of Staff ($100/month · $20 AI included)",
      description:
        "The agent that helps run your community — everything in Guide plus Daily Founder Briefs, proactive member & builder check-ins, unanswered-question auto-replies, and optional $30 usage boosts.",
    },
    {
      title: "Free community core included",
      description:
        "Unlimited members, channels, courses, pods, events, DMs, zero-AI weekly digests, and official Polynet MCP.",
    },
  ],
  platformFeeBps: POLYNET_COMMUNITY_PLATFORM_FEE_BPS,
} as const;

export function founderPlanTierDisplayName(tier: FounderPlanTier | null | undefined): string {
  return tier === "guide" ? "Guide" : "Chief of Staff";
}

export function formatBuilderOfferPrice(
  priceBaseUnits: number = POLYNET_BUILDER_OFFER.priceBaseUnits,
): string {
  return `$${(Math.max(0, priceBaseUnits) / 100).toFixed(0)}/month`;
}

export function builderFundingStateLabel(state: BuilderFundingState): string {
  switch (state) {
    case "builder_required":
      return "Agent plan off";
    case "checkout_pending":
      return "Checkout incomplete";
    case "builder_active":
      return "Agent plan active";
    case "builder_canceling":
      return "Agent plan ends at period end";
    case "builder_inactive":
      return "Agent plan needs attention";
    case "builder_past_due":
      return "Payment needs attention";
    case "builder_ended":
      return "Agent plan off";
    case "builder_included":
      return "Agent plan included";
  }
}

export function resolveBuilderOfferPrimaryAction(params: {
  state: BuilderFundingState;
  allowedActions: BuilderFundingAction[];
}): BuilderFundingAction | null {
  const allowed = new Set(params.allowedActions);
  if (params.state === "checkout_pending" && allowed.has("resume_checkout")) {
    return "resume_checkout";
  }
  if (params.state === "builder_past_due" || params.state === "builder_inactive") {
    return allowed.has("manage_builder") ? "manage_builder" : null;
  }
  if (allowed.has("buy_builder")) return "buy_builder";
  if (allowed.has("manage_builder")) return "manage_builder";
  return null;
}

export function builderFundingActionLabel(params: {
  action: BuilderFundingAction;
  state: BuilderFundingState;
  includePrice?: boolean;
}): string {
  const price = params.includePrice ? ` — ${formatBuilderOfferPrice()}` : "";
  switch (params.action) {
    case "buy_builder":
      return `Turn on the agent${price}`;
    case "resume_checkout":
      return "Resume checkout";
    case "manage_builder":
      return params.state === "builder_past_due" || params.state === "builder_inactive"
        ? "Fix payment"
        : "Manage subscription";
  }
}
