import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  ensureAuthenticatedActor,
  findAuthenticatedActorState,
  resolveAuthenticatedActor,
} from "./authActor";
import { resolveAuthenticatedIdentityProfile } from "./authIdentity";
import { normalizeAuthRelinkEmail } from "../shared/authRelinkPolicy";
import { isCreatorDevTierOverrideEmail } from "../shared/devTierOverride";

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
  ctx: any,
  userId: any,
  nowMs: number,
): Promise<CanonicalTier> {
  const rows = await ctx.db
    .query("userEntitlements")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  const activeRows = rows
    .filter((row: any) => isActiveWindow(nowMs, row.startsAt, row.endsAt))
    .sort((a: any, b: any) => b.startsAt - a.startsAt);
  return normalizeCanonicalTier(activeRows[0]?.tier ?? "free");
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
    if (args.authState === "authenticated") {
      const identity = await resolveAuthenticatedIdentityProfile({
        ctx,
        authSubject: args.authSubject ?? null,
      });
      const actor = await ensureAuthenticatedActor({
        ctx,
        authSubject: identity.authSubject,
        email: identity.email,
        emailVerified: identity.emailVerified,
        emailVerificationSource: identity.emailVerificationSource,
        displayName: identity.displayName,
        avatarUrl: identity.avatarUrl,
        nowMs,
      });
      const canonicalTier = await getCanonicalTierByUserIdInternal(ctx as never, actor.dbUserId, nowMs);
      const effectiveTier = resolveEffectiveTier({ authState: args.authState, canonicalTier });

      return {
        authState: args.authState,
        authSubject: actor.authSubject,
        canonicalTier,
        effectiveTier,
        email: actor.email,
        displayName: actor.displayName,
        avatarUrl: actor.avatarUrl,
        createdAt: actor.createdAt,
        updatedAt: actor.updatedAt,
      };
    }

    const subject = resolveAnonymousSubject({
      authState: args.authState,
      anonymousId: args.anonymousId,
    });
    const email = String(args.email ?? "").trim() || undefined;
    const normalizedEmail = normalizeAuthRelinkEmail(email) ?? undefined;
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
        normalizedEmail,
        displayName,
        avatarUrl,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    } else {
      const patch: {
        email?: string;
        normalizedEmail?: string;
        displayName?: string;
        avatarUrl?: string;
        updatedAt?: number;
      } = {};
      if (email && email !== existing.email) patch.email = email;
      if (
        normalizedEmail !==
        (normalizeAuthRelinkEmail((existing as { normalizedEmail?: string }).normalizedEmail ?? existing.email) ??
          undefined)
      ) {
        patch.normalizedEmail = normalizedEmail;
      }
      if (displayName && displayName !== existing.displayName) patch.displayName = displayName;
      if (avatarUrl && avatarUrl !== existing.avatarUrl) patch.avatarUrl = avatarUrl;
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = nowMs;
        await ctx.db.patch(existing._id, patch);
      }
      userId = existing._id;
    }
    if (!userId) throw new Error("user_not_found");
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
    if (args.authState === "authenticated") {
      const { authSubject, actor } = await findAuthenticatedActorState({
        ctx,
        authSubject: args.authSubject ?? null,
      });
      if (!actor) {
        const canonicalTier = "free" as const;
        return {
          authState: args.authState,
          authSubject,
          canonicalTier,
          effectiveTier: resolveEffectiveTier({ authState: args.authState, canonicalTier }),
        };
      }
      const canonicalTier = await getCanonicalTierByUserIdInternal(ctx, actor.dbUserId, nowMs);
      return {
        authState: args.authState,
        authSubject,
        canonicalTier,
        effectiveTier: resolveEffectiveTier({ authState: args.authState, canonicalTier }),
        email: actor.email,
        displayName: actor.displayName,
        avatarUrl: actor.avatarUrl,
      };
    }

    const subject = resolveAnonymousSubject({
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
    const actor = await resolveAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    if (!isCreatorDevTierOverrideEmail(actor.email)) {
      throw new Error("dev_tier_override_forbidden");
    }

    await ctx.db.insert("userEntitlements", {
      userId: actor.dbUserId,
      tier: args.tier,
      source: "admin_override",
      startsAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const canonicalTier = await getCanonicalTierByUserIdInternal(ctx as never, actor.dbUserId, nowMs);
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
    const { authSubject, actor } = await findAuthenticatedActorState({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    if (!actor) return null;
    const canonicalTier = await getCanonicalTierByUserIdInternal(ctx as never, actor.dbUserId, nowMs);
    const meta = builderTierMeta(canonicalTier);

    return {
      user_id: actor.authSubject,
      builder_tier: canonicalTier,
      max_communities: meta.maxCommunities,
    };
  },
});
