import { action } from "./_generated/server";
import { v } from "convex/values";

// Cached clients may still call this name during the rolling web/backend
// transition. The former Premium product has no active checkout path.
export const startPremiumSubscriptionCheckout = action({
  args: {
    authSubject: v.optional(v.string()),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async () => {
    throw new Error("premium_subscription_retired");
  },
});
