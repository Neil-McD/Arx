import { query } from "./_generated/server";
import { v } from "convex/values";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { readCanonicalAccountTier } from "./accountEntitlementCore";
import { resolveEffectiveTierForGate } from "../shared/canonicalGateEngine";

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

export const getEffectiveTierByAuthSubject = query({
  args: {
    authSubject: v.string(),
    authState: v.union(v.literal("anonymous"), v.literal("authenticated")),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const authState = args.authState;
    if (authState === "anonymous") {
      return {
        authState,
        canonicalTier: "free" as const,
        effectiveTier: "anon_free" as const,
        userId: null,
      };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authSubject", (q) => q.eq("authSubject", args.authSubject))
      .first();

    if (!user) {
      return {
        authState,
        canonicalTier: "free" as const,
        effectiveTier: "auth_free" as const,
        userId: null,
      };
    }

    const nowMs = args.nowMs ?? Date.now();
    const canonicalTier = await readCanonicalAccountTier(ctx, user._id, nowMs);
    const effectiveTier = resolveEffectiveTierForGate({ authState, tier: canonicalTier });
    return {
      authState,
      canonicalTier,
      effectiveTier,
      userId: user._id,
    };
  },
});
