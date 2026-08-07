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
  headline: "Build a community that gets smarter every day",
  description:
    "Builder gives one community the intelligence, memory, and member experience to compound what it learns.",
  purchaseHeadline: "Create a community",
  purchaseDescription:
    "Everything you need to operate one AI-powered community.",
  purchaseNote: "Payment first. Community setup comes next.",
  benefits: [
    {
      title: "Build your community",
      description: "Bring your people, conversations, and resources into one shared place.",
    },
    {
      title: "Train your AI on your knowledge",
      description: "Seed it with your content, calls, and best answers so it learns how you think.",
    },
    {
      title: "Serve every member at scale",
      description: "Give every member an agent grounded in your knowledge whenever they need it.",
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
      return "Builder not active";
    case "checkout_pending":
      return "Checkout incomplete";
    case "builder_active":
      return "Builder active";
    case "builder_canceling":
      return "Builder cancels at period end";
    case "builder_inactive":
      return "Builder needs attention";
    case "builder_past_due":
      return "Payment needs attention";
    case "builder_ended":
      return "Builder inactive";
    case "builder_included":
      return "Builder included";
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
      return `Get Builder${price}`;
    case "resume_checkout":
      return "Resume checkout";
    case "manage_builder":
      return params.state === "builder_past_due" || params.state === "builder_inactive"
        ? "Fix payment"
        : "Manage subscription";
  }
}
