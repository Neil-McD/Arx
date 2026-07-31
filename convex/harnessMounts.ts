import { v } from "convex/values";
import { query } from "./_generated/server";

// Cached clients may ask for the old effective-mount projection. Third-party
// MCP mounts are retired, so the only correct and fail-closed result is empty.
export const listEffectiveMcpApps = query({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.optional(v.id("communities")),
    userId: v.optional(v.id("users")),
  },
  handler: async () => [],
});
