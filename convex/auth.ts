import { internal } from "./_generated/api";
import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  ensureAuthenticatedActorDetailed,
  findAuthenticatedActorState,
  resolveAuthenticatedActor,
} from "./authActor";
import { resolveAuthenticatedIdentityProfile } from "./authIdentity";
import { canUseCreatorDevTierOverride } from "../shared/devTierOverride";
import { ensurePlatformHomeCommunityMembership } from "./platformHomeCommunity";

type CanonicalTier = "free" | "architect";
type EffectiveTier = "anon_free" | "auth_free" | "architect";
type AuthState = "anonymous" | "authenticated";

type AccountTierMeta = {
  maxCommunities: number;
  platformFeeBps: number;
  hasPayouts: boolean;
};

function accountTierMeta(tier: CanonicalTier): AccountTierMeta {
  if (tier === "architect") {
    return {
      maxCommunities: 3,
      platformFeeBps: 300,
      hasPayouts: true,
    };
  }
  return {
    maxCommunities: 1,
    platformFeeBps: 1500,
    hasPayouts: true,
  };
}

function normalizeCanonicalTier(rawTier: unknown): CanonicalTier {
  const normalized = String(rawTier ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "architect") return "architect";
  return "free";
}

function resolveEffectiveTier(input: { authState: AuthState; canonicalTier: CanonicalTier }): EffectiveTier {
  if (input.authState === "anonymous") return "anon_free";
  if (input.canonicalTier === "free") return "auth_free";
  return input.canonicalTier;
}

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // Convex environments may not expose process.env in every runtime.
  }
  return "";
}

function isExplicitLocalDevEnvironment(): boolean {
  const nodeEnv = readEnv("NODE_ENV").toLowerCase();
  return nodeEnv === "development" || nodeEnv === "test";
}

function isActiveWindow(nowMs: number, startsAt: number, endsAt?: number): boolean {
  if (startsAt > nowMs) return false;
  if (typeof endsAt === "number" && nowMs > endsAt) return false;
  return true;
}

async function getCanonicalTierByUserIdInternal(ctx: any, userId: any, nowMs: number): Promise<CanonicalTier> {
  const rows = (await ctx.db
    .query("userEntitlements")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect()) as Array<{
    tier: unknown;
    startsAt: number;
    endsAt?: number;
  }>;
  const activeRows = rows
    .filter((row) => isActiveWindow(nowMs, row.startsAt, row.endsAt))
    .sort((a, b) => b.startsAt - a.startsAt);
  return normalizeCanonicalTier(activeRows[0]?.tier ?? "free");
}

function normalizeOptionalString(raw: unknown): string | null {
  const normalized = String(raw ?? "").trim();
  return normalized || null;
}

function seedAuthenticatedProfile(args: {
  identity: Awaited<ReturnType<typeof resolveAuthenticatedIdentityProfile>>;
  email?: string;
}): {
  email: string | null;
  emailVerified: boolean;
  emailVerificationSource: "oauth_provider" | null;
  displayName: string | null;
  avatarUrl: string | null;
} {
  const hintedEmail = normalizeOptionalString(args.email);
  return {
    email: args.identity.email ?? hintedEmail,
    emailVerified: args.identity.emailVerified,
    emailVerificationSource: args.identity.emailVerified ? args.identity.emailVerificationSource : null,
    displayName: null,
    avatarUrl: null,
  };
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
      const seededProfile = seedAuthenticatedProfile({
        identity,
        email: args.email,
      });
      const { actor, continuity } = await ensureAuthenticatedActorDetailed({
        ctx,
        authSubject: identity.authSubject,
        email: seededProfile.email,
        emailVerified: seededProfile.emailVerified,
        emailVerificationSource: seededProfile.emailVerificationSource,
        displayName: seededProfile.displayName,
        avatarUrl: seededProfile.avatarUrl,
        nowMs,
      });
      try {
        const homeMembership = await ensurePlatformHomeCommunityMembership({
          ctx,
          userId: actor.dbUserId,
          nowMs,
        });
        if (homeMembership.status === "missing") {
          console.warn("platform_home_community_missing");
        } else if (homeMembership.status === "not_open") {
          console.warn("platform_home_community_not_open", {
            communityId: homeMembership.communityId,
          });
        }
      } catch (error) {
        console.error("platform_home_community_membership_ensure_failed", error);
      }
      const canonicalTier = await getCanonicalTierByUserIdInternal(ctx as never, actor.dbUserId, nowMs);
      const effectiveTier = resolveEffectiveTier({ authState: args.authState, canonicalTier });

      return {
        authState: args.authState,
        authSubject: actor.authSubject,
        dbUserId: String(actor.dbUserId),
        canonicalTier,
        effectiveTier,
        email: actor.email,
        displayName: actor.displayName,
        avatarUrl: actor.avatarUrl,
        createdAt: actor.createdAt,
        updatedAt: actor.updatedAt,
        continuity,
      };
    }

    const canonicalTier = "free" as const;

    return {
      authState: args.authState,
      canonicalTier,
      effectiveTier: resolveEffectiveTier({ authState: args.authState, canonicalTier }),
      authSubject: null,
      dbUserId: null,
      email: null,
      displayName: null,
      avatarUrl: null,
      createdAt: nowMs,
      updatedAt: nowMs,
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
        dbUserId: String(actor.dbUserId),
        canonicalTier,
        effectiveTier: resolveEffectiveTier({ authState: args.authState, canonicalTier }),
        email: actor.email,
        displayName: actor.displayName,
        avatarUrl: actor.avatarUrl,
      };
    }

    const canonicalTier = "free" as const;
    return {
      authState: args.authState,
      authSubject: null,
      dbUserId: null,
      canonicalTier,
      effectiveTier: resolveEffectiveTier({ authState: args.authState, canonicalTier }),
      email: null,
      displayName: null,
      avatarUrl: null,
    };
  },
});

export const setDevTierOverride = mutation({
  args: {
    authSubject: v.optional(v.string()),
    tier: v.union(v.literal("free"), v.literal("architect")),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const actor = await resolveAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    if (
      !canUseCreatorDevTierOverride({
        email: actor.email,
        isDev: isExplicitLocalDevEnvironment(),
        featureFlag: readEnv("ARX_ENABLE_DEV_TIER_OVERRIDE") || "false",
      })
    ) {
      throw new Error("dev_tier_override_forbidden");
    }

    const tier = normalizeCanonicalTier(args.tier);
    await ctx.db.insert("userEntitlements", {
      userId: actor.dbUserId,
      tier,
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

export const getAccountCommerceStatus = query({
  args: {
    authSubject: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    user_id: string;
    account_tier: CanonicalTier;
    max_communities: number;
    platform_fee_bps: number;
    stripe_connect: {
      status: "not_connected" | "onboarding_required" | "pending_requirements" | "ready" | "restricted";
      account_id: string | null;
      details_submitted: boolean;
      charges_enabled: boolean;
      payouts_enabled: boolean;
      requirements_currently_due: string[];
      requirements_eventually_due: string[];
      requirements_disabled_reason: string | null;
      onboarding_complete_at: number | null;
      can_accept_charges: boolean;
    };
  } | null> => {
    const nowMs = args.nowMs ?? Date.now();
    const { authSubject, actor } = await findAuthenticatedActorState({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    if (!actor) return null;
    const canonicalTier = await getCanonicalTierByUserIdInternal(ctx as never, actor.dbUserId, nowMs);
    const meta = accountTierMeta(canonicalTier);
    const hasPayoutAccess = meta.hasPayouts;
    const stripeConnect = hasPayoutAccess
      ? ((await ctx.runQuery(
          internal.creatorCommerce.getUserStripeConnectAccountInternal as any,
          { userId: actor.dbUserId },
        )) as {
          stripeAccountId?: unknown;
          status?: unknown;
          detailsSubmitted?: unknown;
          chargesEnabled?: unknown;
          payoutsEnabled?: unknown;
          requirementsCurrentlyDue?: unknown;
          requirementsEventuallyDue?: unknown;
          requirementsDisabledReason?: unknown;
          onboardingCompleteAt?: unknown;
        } | null)
      : null;
    const stripeConnectStatusRaw = String(stripeConnect?.status ?? "").trim();
    const stripeConnectStatus =
      stripeConnectStatusRaw === "onboarding_required" ||
      stripeConnectStatusRaw === "pending_requirements" ||
      stripeConnectStatusRaw === "ready" ||
      stripeConnectStatusRaw === "restricted"
        ? stripeConnectStatusRaw
        : "not_connected";

    return {
      user_id: actor.authSubject,
      account_tier: canonicalTier,
      max_communities: meta.maxCommunities,
      platform_fee_bps: meta.platformFeeBps,
      stripe_connect: {
        status: stripeConnectStatus,
        account_id:
          typeof stripeConnect?.stripeAccountId === "string" && stripeConnect.stripeAccountId.trim()
            ? stripeConnect.stripeAccountId.trim()
            : null,
        details_submitted: stripeConnect?.detailsSubmitted === true,
        charges_enabled: stripeConnect?.chargesEnabled === true,
        payouts_enabled: stripeConnect?.payoutsEnabled === true,
        requirements_currently_due: Array.isArray(stripeConnect?.requirementsCurrentlyDue)
          ? stripeConnect.requirementsCurrentlyDue
              .map((value) => String(value ?? "").trim())
              .filter(Boolean)
          : [],
        requirements_eventually_due: Array.isArray(stripeConnect?.requirementsEventuallyDue)
          ? stripeConnect.requirementsEventuallyDue
              .map((value) => String(value ?? "").trim())
              .filter(Boolean)
          : [],
        requirements_disabled_reason:
          typeof stripeConnect?.requirementsDisabledReason === "string" &&
          stripeConnect.requirementsDisabledReason.trim()
            ? stripeConnect.requirementsDisabledReason.trim()
            : null,
        onboarding_complete_at:
          typeof stripeConnect?.onboardingCompleteAt === "number" &&
          Number.isFinite(stripeConnect.onboardingCompleteAt)
            ? stripeConnect.onboardingCompleteAt
            : null,
        can_accept_charges:
          stripeConnectStatus === "ready" &&
          stripeConnect?.chargesEnabled === true &&
          stripeConnect?.payoutsEnabled === true,
      },
    };
  },
});

export const getAccountCommerceAccessForUserInternal = internalQuery({
  args: {
    userId: v.id("users"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const accountTier = await getCanonicalTierByUserIdInternal(ctx as never, args.userId, nowMs);
    const meta = accountTierMeta(accountTier);
    return {
      user_id: String(args.userId),
      account_tier: accountTier,
      max_communities: meta.maxCommunities,
      platform_fee_bps: meta.platformFeeBps,
      has_payouts: meta.hasPayouts,
    };
  },
});
