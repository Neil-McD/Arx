import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { resolveAuthenticatedSubject } from "./authIdentity";

type CanonicalTier = "free" | "builder" | "architect";
type EffectiveTier = "anon_free" | "auth_free" | "builder" | "architect";
type AuthState = "anonymous" | "authenticated";

type BuilderTierMeta = {
  maxCommunities: number;
  platformFeeBps: number;
  hasPayouts: boolean;
};

function builderTierMeta(tier: CanonicalTier): BuilderTierMeta {
  if (tier === "builder") {
    return {
      maxCommunities: 0,
      platformFeeBps: 0,
      hasPayouts: false,
    };
  }
  if (tier === "architect") {
    return {
      maxCommunities: 3,
      platformFeeBps: 300,
      hasPayouts: true,
    };
  }
  return {
    maxCommunities: 0,
    platformFeeBps: 0,
    hasPayouts: false,
  };
}

function normalizeCanonicalTier(rawTier: unknown): CanonicalTier {
  const normalized = String(rawTier ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "builder") return "builder";
  if (normalized === "architect" || normalized === "pro") return "architect";
  return "free";
}

function resolveEffectiveTier(input: { authState: AuthState; canonicalTier: CanonicalTier }): EffectiveTier {
  if (input.authState === "anonymous") return "anon_free";
  if (input.canonicalTier === "free") return "auth_free";
  return input.canonicalTier;
}

function isActiveWindow(nowMs: number, startsAt: number, endsAt?: number): boolean {
  if (startsAt > nowMs) return false;
  if (typeof endsAt === "number" && nowMs > endsAt) return false;
  return true;
}

async function getCanonicalTierByUserIdInternal(
  ctx: Parameters<(typeof query)["handler"]>[0],
  userId: any,
  nowMs: number,
): Promise<CanonicalTier> {
  const rows = await ctx.db
    .query("userEntitlements")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const activeRows = rows
    .filter((row) => isActiveWindow(nowMs, row.startsAt, row.endsAt))
    .sort((a, b) => b.startsAt - a.startsAt);
  return normalizeCanonicalTier(activeRows[0]?.tier ?? "free");
}

async function ensureDefaultFreeEntitlement(
  ctx: Parameters<(typeof mutation)["handler"]>[0],
  userId: any,
  nowMs: number,
): Promise<void> {
  const rows = await ctx.db
    .query("userEntitlements")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(1);
  if (rows.length > 0) return;
  await ctx.db.insert("userEntitlements", {
    userId,
    tier: "free",
    source: "default",
    startsAt: nowMs,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
}

function resolveAnonymousSubject(args: {
  authState: AuthState;
  anonymousId?: string;
}): string {
  if (args.authState !== "anonymous") {
    throw new Error("auth_state_invalid");
  }
  const anonymousId = String(args.anonymousId ?? "").trim();
  if (!anonymousId) throw new Error("anonymous_id_required");
  return `anon:${anonymousId}`;
}

export const bootstrapActor = mutation({
  args: {
    authState: v.union(v.literal("anonymous"), v.literal("authenticated")),
    authSubject: v.optional(v.string()),
    anonymousId: v.optional(v.string()),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const subject =
      args.authState === "authenticated"
        ? await resolveAuthenticatedSubject({ ctx, authSubject: args.authSubject ?? null })
        : resolveAnonymousSubject({
            authState: args.authState,
            anonymousId: args.anonymousId,
          });

    const email = String(args.email ?? "").trim() || undefined;
    const displayName = String(args.displayName ?? "").trim() || undefined;
    const avatarUrl = String(args.avatarUrl ?? "").trim() || undefined;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_authSubject", (q) => q.eq("authSubject", subject))
      .first();

    let userId = existing?._id ?? null;
    if (!existing) {
      userId = await ctx.db.insert("users", {
        authSubject: subject,
        email,
        displayName,
        avatarUrl,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    } else {
      const patch: {
        email?: string;
        displayName?: string;
        avatarUrl?: string;
        updatedAt?: number;
      } = {};
      if (email && email !== existing.email) patch.email = email;
      if (displayName && displayName !== existing.displayName) patch.displayName = displayName;
      if (avatarUrl && avatarUrl !== existing.avatarUrl) patch.avatarUrl = avatarUrl;
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = nowMs;
        await ctx.db.patch(existing._id, patch);
      }
      userId = existing._id;
    }

    await ensureDefaultFreeEntitlement(ctx, userId, nowMs);
    const canonicalTier = await getCanonicalTierByUserIdInternal(ctx as never, userId, nowMs);
    const effectiveTier = resolveEffectiveTier({ authState: args.authState, canonicalTier });
    const user = await ctx.db.get(userId);

    return {
      authState: args.authState,
      authSubject: subject,
      canonicalTier,
      effectiveTier,
      email: user?.email ?? null,
      displayName: user?.displayName ?? null,
      avatarUrl: user?.avatarUrl ?? null,
      createdAt: user?.createdAt ?? nowMs,
      updatedAt: user?.updatedAt ?? nowMs,
    };
  },
});

export const getActor = query({
  args: {
    authState: v.union(v.literal("anonymous"), v.literal("authenticated")),
    authSubject: v.optional(v.string()),
    anonymousId: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const subject =
      args.authState === "authenticated"
        ? await resolveAuthenticatedSubject({ ctx, authSubject: args.authSubject ?? null })
        : resolveAnonymousSubject({
            authState: args.authState,
            anonymousId: args.anonymousId,
          });
    const user = await ctx.db
      .query("users")
      .withIndex("by_authSubject", (q) => q.eq("authSubject", subject))
      .first();
    if (!user) {
      const canonicalTier = "free" as const;
      return {
        authState: args.authState,
        authSubject: subject,
        canonicalTier,
        effectiveTier: resolveEffectiveTier({ authState: args.authState, canonicalTier }),
      };
    }
    const canonicalTier = await getCanonicalTierByUserIdInternal(ctx, user._id, nowMs);
    return {
      authState: args.authState,
      authSubject: subject,
      canonicalTier,
      effectiveTier: resolveEffectiveTier({ authState: args.authState, canonicalTier }),
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      avatarUrl: user.avatarUrl ?? null,
    };
  },
});

export const setDevTierOverride = mutation({
  args: {
    authSubject: v.optional(v.string()),
    tier: v.union(v.literal("free"), v.literal("builder"), v.literal("architect")),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const subject = await resolveAuthenticatedSubject({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const user = await ctx.db
      .query("users")
      .withIndex("by_authSubject", (q) => q.eq("authSubject", subject))
      .first();
    if (!user) throw new Error("user_not_found");

    await ctx.db.insert("userEntitlements", {
      userId: user._id,
      tier: args.tier,
      source: "admin_override",
      startsAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const canonicalTier = await getCanonicalTierByUserIdInternal(ctx as never, user._id, nowMs);
    return {
      ok: true,
      canonicalTier,
      effectiveTier: resolveEffectiveTier({ authState: "authenticated", canonicalTier }),
    };
  },
});

export const getBuilderBillingStatus = query({
  args: {
    authSubject: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const subject = await resolveAuthenticatedSubject({
      ctx,
      authSubject: args.authSubject ?? null,
    });

    const user = await ctx.db
      .query("users")
      .withIndex("by_authSubject", (q) => q.eq("authSubject", subject))
      .first();
    if (!user) return null;

    const canonicalTier = await getCanonicalTierByUserIdInternal(ctx as never, user._id, nowMs);
    const meta = builderTierMeta(canonicalTier);

    return {
      user_id: String(user.authSubject ?? subject).trim() || String(user._id),
      builder_tier: canonicalTier,
      max_communities: meta.maxCommunities,
      platform_fee_bps: meta.platformFeeBps,
      has_payouts: meta.hasPayouts,
      subscription_status: canonicalTier === "free" ? null : "active",
      current_period_end: null,
      cancel_at_period_end: null,
    };
  },
});
