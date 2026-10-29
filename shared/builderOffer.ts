import type {
  BuilderFundingAction,
  BuilderFundingState,
} from "./builderFunding";
import {
  POLYNET_BUILDER_OFFER_NAME,
  POLYNET_COMMUNITY_PLATFORM_FEE_BPS,
  POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS,
} from "./founderPlan";

export const POLYNET_BUILDER_OFFER = {
  id: "builder_community_v1",
  name: POLYNET_BUILDER_OFFER_NAME,
  priceBaseUnits: POLYNET_FOUNDER_PLAN_MONTHLY_PRICE_BASE_UNITS,
  cadence: "month",
  scopeLabel: "per community",
  headline: "Give your community an agent",
  description:
    "Your community is free. The Agent plan gives it one AI agent that remembers what the community learns, answers members, and does the work.",
  purchaseHeadline: "Turn on the agent",
  purchaseDescription:
    "One AI agent for one community, with a monthly AI allowance included.",
  purchaseNote: "Your community stays free either way.",
  benefits: [
    {
      title: "An agent that remembers",
      description: "It learns from your conversations, calls, and resources, so it answers the way your community would.",
    },
    {
      title: "Answers for every member",
      description: "Members ask it on the Agent page, by @mention, or on your site, whenever they need it.",
    },
    {
      title: "Work done for you",
      description: "Daily briefs, memory upkeep, and follow-ups, without you doing them by hand.",
    },
  ],
  platformFeeBps: POLYNET_COMMUNITY_PLATFORM_FEE_BPS,
} as const;

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
