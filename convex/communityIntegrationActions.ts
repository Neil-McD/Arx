import { action } from "./_generated/server";
import { v } from "convex/values";

// Integrations are retired (POL-21). The production web released before that
// change still has the HubSpot callback page that calls this; it answers "not
// verified" until the next release removes the page, then this module goes.
export const verifyConnection = action({
  args: { communityId: v.id("communities"), sessionUri: v.string(), generation: v.number() },
  handler: async () => false,
});
