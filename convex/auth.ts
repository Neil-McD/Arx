import { internal } from "./_generated/api";
import { action, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  ensureAuthenticatedActorDetailed,
  findAuthenticatedActorState,
  resolveAuthenticatedActor,
} from "./authActor";
import { resolveAuthenticatedIdentityProfile } from "./authIdentity";
import {
  normalizeEmailForVerification,
  redactWorkosUserVerificationLookup,
  resolveTrustedEmailVerification,
} from "./workosEmailVerification";
import { POLYNET_COMMUNITY_PLATFORM_FEE_BPS } from "../shared/founderPlan";
import { ensurePlatformHomeCommunityMembership } from "./platformHomeCommunity";
import { canReceiveCommunityRevenue } from "./stripeConnectAccountCore";
import {
  hasPlatformOwnerComplimentaryAccess,
} from "./operatorEntitlementsCore";
import { enqueueNewPolynetUserIdentify } from './distributionAttribution';

type CanonicalTier = "free" | "architect";
type EffectiveTier = "anon_free" | "auth_free" | "architect";
type AuthState = "anonymous" | "authenticated";

type AccountTierMeta = {
  platformFeeBps: number;
  hasPayouts: boolean;
};

// Rolling cached clients still require a numeric field. It is a compatibility
// projection only; community creation authority is funding-backed on the
// server and has no account-level ownership cap.
const CACHED_CLIENT_UNBOUNDED_COMMUNITY_LIMIT = Number.MAX_SAFE_INTEGER;

function accountTierMeta(): AccountTierMeta {
  return {
    platformFeeBps: POLYNET_COMMUNITY_PLATFORM_FEE_BPS,
    hasPayouts: true,
  };
}

function resolveEffectiveTier(input: { authState: AuthState; canonicalTier: CanonicalTier }): EffectiveTier {
  if (input.authState === "anonymous") return "anon_free";
  if (input.canonicalTier === "free") return "auth_free";
  return input.canonicalTier;
}

export async function getCanonicalTierByUserIdInternal(
  _ctx: any,
  _userId: any,
  _nowMs: number,
): Promise<CanonicalTier> {
  return "free";
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
  const email = args.identity.email ?? hintedEmail;
  const identityVerifiedForEmail = Boolean(
    args.identity.emailVerified &&
    args.identity.email &&
    normalizeEmailForVerification(args.identity.email) === normalizeEmailForVerification(email),
  );
  return {
    email,
    emailVerified: identityVerifiedForEmail,
    emailVerificationSource: identityVerifiedForEmail ? args.identity.emailVerificationSource : null,
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
    distributionAttribution: v.optional(
      v.object({
        anonymousId: v.optional(v.string()),
        clickId: v.optional(v.string()),
      }),
    ),
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
      const distributionAttribution = continuity.wouldCreateNewUser
        ? await enqueueNewPolynetUserIdentify({
            ctx,
            userId: actor.dbUserId,
            tracking: args.distributionAttribution,
            nowMs,
          })
        : { enqueued: false, reason: 'existing_user' };

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
        distributionAttribution,
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

export const syncAuthenticatedEmailVerification = action({
  args: {
    authSubject: v.optional(v.string()),
    email: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any> => {
    const identity = await resolveAuthenticatedIdentityProfile({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const email = identity.email ?? normalizeOptionalString(args.email);
    const normalizedEmail = normalizeEmailForVerification(email);
    if (!normalizedEmail) {
      return {
        ok: true,
        synced: false,
        reason: "email_missing",
      };
    }

    const existingActor = await ctx
      .runQuery((internal as any).authActor.resolveAuthenticatedActorInternal, {
        authSubject: identity.authSubject,
      })
      .catch(() => null);
    if (
      typeof existingActor?.emailVerifiedAt === "number" &&
      normalizeEmailForVerification(existingActor?.email) === normalizedEmail
    ) {
      return {
        ok: true,
        synced: false,
        reason: "already_verified",
        emailVerifiedAtPresent: true,
      };
    }

    const verification = await resolveTrustedEmailVerification({
      authSubject: identity.authSubject,
      email,
      identityEmail: identity.email,
      identityEmailVerified:
        identity.email && normalizeEmailForVerification(identity.email) === normalizedEmail
          ? identity.emailVerified
          : false,
      identityEmailVerificationSource:
        identity.email && normalizeEmailForVerification(identity.email) === normalizedEmail
          ? identity.emailVerificationSource
          : null,
    });
    if (!verification.emailVerified) {
      return {
        ok: true,
        synced: false,
        reason: verification.reason ?? "email_not_verified",
        emailVerifiedAtPresent: false,
        ...(verification.workosLookup
          ? { workosUser: redactWorkosUserVerificationLookup(verification.workosLookup) }
          : null),
      };
    }

    const actor = await ctx.runMutation((internal as any).authActor.ensureAuthenticatedActorByExplicitSubjectInternal, {
      authSubject: identity.authSubject,
      email,
      emailVerified: true,
      emailVerificationSource: verification.emailVerificationSource ?? "oauth_provider",
      ...(identity.displayName ? { displayName: identity.displayName } : null),
      ...(identity.avatarUrl ? { avatarUrl: identity.avatarUrl } : null),
      nowMs: args.nowMs ?? Date.now(),
    });

    return {
      ok: true,
      synced: typeof actor?.emailVerifiedAt === "number",
      reason: null,
      emailVerifiedAtPresent: typeof actor?.emailVerifiedAt === "number",
      ...(verification.workosLookup
        ? { workosUser: redactWorkosUserVerificationLookup(verification.workosLookup) }
        : null),
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
  handler: async () => {
    throw new Error("account_tier_retired");
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
    operator_complimentary_access: boolean;
    max_communities: number;
    platform_fee_bps: number;
    stripe_connect: {
      status: "not_connected" | "onboarding_required" | "pending_requirements" | "ready" | "restricted";
      account_id: string | null;
      country: string | null;
      service_agreement: string | null;
      transfers_enabled: boolean;
      details_submitted: boolean;
      charges_enabled: boolean;
      payouts_enabled: boolean;
      requirements_currently_due: string[];
      requirements_eventually_due: string[];
      requirements_disabled_reason: string | null;
      onboarding_complete_at: number | null;
      can_receive_community_revenue: boolean;
      can_accept_charges: boolean;
    };
  } | null> => {
    const nowMs = args.nowMs ?? Date.now();
    const { authSubject, actor } = await findAuthenticatedActorState({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    if (!actor) return null;
    const [canonicalTier, operatorComplimentaryAccess] = await Promise.all([
      getCanonicalTierByUserIdInternal(ctx as never, actor.dbUserId, nowMs),
      hasPlatformOwnerComplimentaryAccess(ctx, actor.dbUserId),
    ]);
    const meta = accountTierMeta();
    const hasPayoutAccess = meta.hasPayouts;
    const stripeConnect = hasPayoutAccess
      ? ((await ctx.runQuery(
          internal.creatorCommerce.getUserStripeConnectAccountInternal as any,
          { userId: actor.dbUserId },
        )) as {
          stripeAccountId?: unknown;
          country?: unknown;
          serviceAgreement?: unknown;
          transfersEnabled?: unknown;
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
    const canReceiveRevenue = canReceiveCommunityRevenue(stripeConnect);

    return {
      user_id: actor.authSubject,
      account_tier: canonicalTier,
      operator_complimentary_access: operatorComplimentaryAccess,
      max_communities: CACHED_CLIENT_UNBOUNDED_COMMUNITY_LIMIT,
      platform_fee_bps: meta.platformFeeBps,
      stripe_connect: {
        status: stripeConnectStatus,
        account_id:
          typeof stripeConnect?.stripeAccountId === "string" && stripeConnect.stripeAccountId.trim()
            ? stripeConnect.stripeAccountId.trim()
            : null,
        country:
          typeof stripeConnect?.country === "string" && stripeConnect.country.trim()
            ? stripeConnect.country.trim().toUpperCase()
            : null,
        service_agreement:
          typeof stripeConnect?.serviceAgreement === "string" && stripeConnect.serviceAgreement.trim()
            ? stripeConnect.serviceAgreement.trim()
            : null,
        transfers_enabled: stripeConnect?.transfersEnabled === true,
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
        can_receive_community_revenue: canReceiveRevenue,
        can_accept_charges: canReceiveRevenue,
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
    const [accountTier, operatorComplimentaryAccess] = await Promise.all([
      getCanonicalTierByUserIdInternal(ctx as never, args.userId, nowMs),
      hasPlatformOwnerComplimentaryAccess(ctx, args.userId),
    ]);
    const meta = accountTierMeta();
    return {
      user_id: String(args.userId),
      account_tier: accountTier,
      operator_complimentary_access: operatorComplimentaryAccess,
      max_communities: CACHED_CLIENT_UNBOUNDED_COMMUNITY_LIMIT,
      platform_fee_bps: meta.platformFeeBps,
      has_payouts: meta.hasPayouts,
    };
  },
});
