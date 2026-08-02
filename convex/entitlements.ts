import { query } from "./_generated/server";
import { v } from "convex/values";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";

type CanonicalTier = "free" | "architect";
type EffectiveTier = "anon_free" | "auth_free" | "architect";
type AuthState = "anonymous" | "authenticated";

function normalizeCanonicalTier(rawTier: unknown): CanonicalTier {
  void rawTier;
  return "free";
}

function resolveEffectiveTier(input: { authState: AuthState; tier: CanonicalTier }): EffectiveTier {
  if (input.authState === "anonymous") return "anon_free";
  void input.tier;
  return "auth_free";
}

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
    void userId;
    void args.nowMs;
    return normalizeCanonicalTier("free");
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

    void args.nowMs;
    const canonicalTier = normalizeCanonicalTier("free");
    const effectiveTier = resolveEffectiveTier({ authState, tier: canonicalTier });
    return {
      authState,
      canonicalTier,
      effectiveTier,
      userId: user._id,
    };
  },
});
