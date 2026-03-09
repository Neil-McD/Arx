import { query } from "./_generated/server";
import { v } from "convex/values";
import { resolveAuthenticatedSubject } from "./authIdentity";

type CanonicalTier = "free" | "builder";
type EffectiveTier = "anon_free" | "auth_free" | "builder";
type AuthState = "anonymous" | "authenticated";

function normalizeCanonicalTier(rawTier: unknown): CanonicalTier {
  const normalized = String(rawTier ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "builder") return "builder";
  if (normalized === "architect" || normalized === "pro") return "builder";
  return "free";
}

function resolveEffectiveTier(input: { authState: AuthState; tier: CanonicalTier }): EffectiveTier {
  if (input.authState === "anonymous") return "anon_free";
  if (input.tier === "free") return "auth_free";
  return input.tier;
}

function isActiveWindow(nowMs: number, startsAt: number, endsAt?: number): boolean {
  if (startsAt > nowMs) return false;
  if (typeof endsAt === "number" && nowMs > endsAt) return false;
  return true;
}

function normalizeIdValue(raw: unknown): string {
  return String(raw ?? "").trim();
}

async function resolveUserIdForAuthenticatedRequest(args: {
  ctx: any;
  userId?: any;
  authSubject?: string | null;
}): Promise<any> {
  const userIdInput = normalizeIdValue(args.userId);
  const authSubject = await resolveAuthenticatedSubject({
    ctx: args.ctx,
    authSubject: args.authSubject ?? null,
  });
  const user = await args.ctx.db
    .query("users")
    .withIndex("by_authSubject", (q: any) => q.eq("authSubject", authSubject))
    .first();
  if (!user) throw new Error("user_not_found");
  const resolvedUserId = normalizeIdValue(user._id);
  if (userIdInput && userIdInput !== resolvedUserId) {
    throw new Error("user_id_mismatch");
  }
  return user._id;
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
    const nowMs = args.nowMs ?? Date.now();
    const rows = await ctx.db
      .query("userEntitlements")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const activeRows = rows
      .filter((row) => isActiveWindow(nowMs, row.startsAt, row.endsAt))
      .sort((a, b) => b.startsAt - a.startsAt);
    const canonicalTier = normalizeCanonicalTier(activeRows[0]?.tier ?? "free");
    return canonicalTier;
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
    const rows = await ctx.db
      .query("userEntitlements")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const activeRows = rows
      .filter((row) => isActiveWindow(nowMs, row.startsAt, row.endsAt))
      .sort((a, b) => b.startsAt - a.startsAt);
    const canonicalTier = normalizeCanonicalTier(activeRows[0]?.tier ?? "free");
    const effectiveTier = resolveEffectiveTier({ authState, tier: canonicalTier });
    return {
      authState,
      canonicalTier,
      effectiveTier,
      userId: user._id,
    };
  },
});
