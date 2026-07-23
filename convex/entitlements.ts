import { query } from "./_generated/server";
import { v } from "convex/values";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { readCanonicalAccountTier } from "./accountEntitlementCore";

export const getCanonicalTierByUserId = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    return await readCanonicalAccountTier(ctx, userId, nowMs);
  },
});
