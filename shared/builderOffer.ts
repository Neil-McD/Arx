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
    "Your community is free forever. The Agent plan adds one always-on AI agent for your community, with $20/month in included AI usage (enough for thousands of conversations).",
  purchaseHeadline: "Turn on the agent",
  purchaseDescription:
    "One always-on AI agent for one community, with $20/month in included AI usage.",
  purchaseNote: "Your community stays free either way.",
  benefits: [
    {
      title: "Living Soul & Memory",
      description: "Remembers your community's voice, lessons, and each person's private goals — strictly private per member and builder.",
    },
    {
      title: "1:1 answers & follow-ups everywhere",
      description: "Answers members privately, replies to @mentions, follows up in active threads, and works on your site and MCP.",
    },
    {
      title: "Chief of Staff & Proactive Heartbeats",
      description: "Daily founder briefs, activity-tapered member & builder check-ins, and zero-AI weekly digests that bring quiet members back.",
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
