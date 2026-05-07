import Stripe from "stripe";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { getStripeClient } from "./stripeCore";
import { buildCommunityTabPath, buildSettingsPath } from "../shared/webAppRouteState";
import {
  buildStripeConnectAccountSnapshot,
  normalizeOptionalStripeConnectString,
  normalizeStripeConnectRequirementList,
} from "./stripeConnectAccountCore";
import { recordCriticalAuditEventBestEffort } from "./criticalAudit";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";

const BUILDER_CONNECT_CONTEXT_VALIDATOR = v.union(
  v.literal("account"),
  v.literal("community"),
);

function buildStripeConnectRedirectUrls(args: {
  context: "account" | "community";
  communitySlug?: string | null;
}): { refreshUrl: string; returnUrl: string } {
  const origin = readCanonicalPublicAppOrigin();
  const fallbackPath = buildSettingsPath("account");
  const communitySettingsPath =
    args.context === "community"
      ? buildCommunityTabPath(args.communitySlug ?? null, "settings")
      : null;
  const path = communitySettingsPath ?? fallbackPath;
  const buildUrl = (action: "refresh" | "return") => {
    const url = new URL(`${origin}${path}`);
    url.searchParams.set("connect", action);
    url.searchParams.set("connect_context", args.context);
    if (args.context === "community") {
      const slug = String(args.communitySlug ?? "").trim();
      if (slug) url.searchParams.set("community_slug", slug);
    }
    return url.toString();
  };
  return {
    refreshUrl: buildUrl("refresh"),
    returnUrl: buildUrl("return"),
  };
}

export const getUserStripeConnectAccountInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("userStripeConnectAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!row) return null;
    return {
      userId: row.userId,
      stripeAccountId: row.stripeAccountId,
      accountType: row.accountType,
      status: row.status,
      detailsSubmitted: row.detailsSubmitted,
      chargesEnabled: row.chargesEnabled,
      payoutsEnabled: row.payoutsEnabled,
      requirementsCurrentlyDue: row.requirementsCurrentlyDue ?? [],
      requirementsEventuallyDue: row.requirementsEventuallyDue ?? [],
      requirementsDisabledReason: row.requirementsDisabledReason ?? null,
      onboardingCompleteAt: row.onboardingCompleteAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },
});

export const getUserStripeConnectAccountByStripeAccountIdInternal = internalQuery({
  args: {
    stripeAccountId: v.string(),
  },
  handler: async (ctx, args) => {
    const stripeAccountId = String(args.stripeAccountId ?? "").trim();
    if (!stripeAccountId) return null;
    const row = await ctx.db
      .query("userStripeConnectAccounts")
      .withIndex("by_stripeAccountId", (q) => q.eq("stripeAccountId", stripeAccountId))
      .first();
    if (!row) return null;
    return {
      userId: row.userId,
      stripeAccountId: row.stripeAccountId,
      status: row.status,
      chargesEnabled: row.chargesEnabled,
      payoutsEnabled: row.payoutsEnabled,
      requirementsDisabledReason: row.requirementsDisabledReason ?? null,
    };
  },
});

export const syncUserStripeConnectAccountInternal = internalMutation({
  args: {
    userId: v.id("users"),
    stripeAccountId: v.string(),
    accountType: v.optional(v.literal("express")),
    status: v.union(
      v.literal("onboarding_required"),
      v.literal("pending_requirements"),
      v.literal("ready"),
      v.literal("restricted"),
    ),
    detailsSubmitted: v.boolean(),
    chargesEnabled: v.boolean(),
    payoutsEnabled: v.boolean(),
    requirementsCurrentlyDue: v.array(v.string()),
    requirementsEventuallyDue: v.array(v.string()),
    requirementsDisabledReason: v.optional(v.union(v.string(), v.null())),
    onboardingCompleteAt: v.optional(v.union(v.number(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const existingByUser = await ctx.db
      .query("userStripeConnectAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const existingByAccount =
      existingByUser && String(existingByUser.stripeAccountId) === String(args.stripeAccountId)
        ? existingByUser
        : await ctx.db
            .query("userStripeConnectAccounts")
            .withIndex("by_stripeAccountId", (q) => q.eq("stripeAccountId", args.stripeAccountId))
            .first();
    const existing = existingByUser ?? existingByAccount ?? null;
    const patch = {
      userId: args.userId,
      stripeAccountId: String(args.stripeAccountId ?? "").trim(),
      accountType: args.accountType ?? "express",
      status: args.status,
      detailsSubmitted: args.detailsSubmitted === true,
      chargesEnabled: args.chargesEnabled === true,
      payoutsEnabled: args.payoutsEnabled === true,
      requirementsCurrentlyDue: normalizeStripeConnectRequirementList(args.requirementsCurrentlyDue),
      requirementsEventuallyDue: normalizeStripeConnectRequirementList(args.requirementsEventuallyDue),
      requirementsDisabledReason:
        normalizeOptionalStripeConnectString(args.requirementsDisabledReason) ?? undefined,
      onboardingCompleteAt:
        typeof args.onboardingCompleteAt === "number" && Number.isFinite(args.onboardingCompleteAt)
          ? args.onboardingCompleteAt
          : existing?.onboardingCompleteAt,
      updatedAt: nowMs,
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      await recordCriticalAuditEventBestEffort(ctx, {
        eventKey: `stripe_connect_account_synced:${patch.stripeAccountId}:${nowMs}`,
        eventType: "stripe_connect_account_synced",
        status: "succeeded",
        actorUserId: args.userId,
        subjectUserId: args.userId,
        provider: "stripe",
        providerObjectId: patch.stripeAccountId,
        metadata: {
          connectStatus: patch.status,
          chargesEnabled: patch.chargesEnabled,
          payoutsEnabled: patch.payoutsEnabled,
          detailsSubmitted: patch.detailsSubmitted,
        },
        createdAt: nowMs,
      });
      return {
        userId: String(args.userId),
        stripeAccountId: patch.stripeAccountId,
        status: patch.status,
      };
    }
    await ctx.db.insert("userStripeConnectAccounts", {
      ...patch,
      createdAt: nowMs,
    });
    await recordCriticalAuditEventBestEffort(ctx, {
      eventKey: `stripe_connect_account_synced:${patch.stripeAccountId}:${nowMs}`,
      eventType: "stripe_connect_account_synced",
      status: "succeeded",
      actorUserId: args.userId,
      subjectUserId: args.userId,
      provider: "stripe",
      providerObjectId: patch.stripeAccountId,
      metadata: {
        connectStatus: patch.status,
        chargesEnabled: patch.chargesEnabled,
        payoutsEnabled: patch.payoutsEnabled,
        detailsSubmitted: patch.detailsSubmitted,
      },
      createdAt: nowMs,
    });
    return {
      userId: String(args.userId),
      stripeAccountId: patch.stripeAccountId,
      status: patch.status,
    };
  },
});

export const startConnectOnboarding = action({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    context: BUILDER_CONNECT_CONTEXT_VALIDATOR,
    communitySlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = (await ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, {
      authSubject: args.authSubject ?? null,
    })) as { dbUserId?: unknown; email?: string | null };
    const userId = actor?.dbUserId;
    if (!userId) throw new Error("user_not_found");
    if (args.userId && String(args.userId) !== String(userId)) {
      throw new Error("user_id_mismatch");
    }
    const builderAccess = (await ctx.runQuery(
      internal.auth.getBuilderCommerceAccessForUserInternal as any,
      { userId, nowMs: Date.now() },
    )) as { builder_tier?: unknown; has_payouts?: unknown } | null;
    const hasBuilderPayoutAccess = builderAccess?.has_payouts === true;
    if (!hasBuilderPayoutAccess) {
      throw new Error("builder_connect_builder_required");
    }

    const existing = (await ctx.runQuery(
      internal.builderCommerce.getUserStripeConnectAccountInternal as any,
      { userId },
    )) as {
      stripeAccountId?: string | null;
    } | null;
    const stripe = getStripeClient();
    let account: Stripe.Account;
    const existingAccountId = normalizeOptionalStripeConnectString(existing?.stripeAccountId);
    if (existingAccountId) {
      account = await stripe.accounts.retrieve(existingAccountId);
    } else {
      account = await stripe.accounts.create({
        type: "express",
        email: normalizeOptionalStripeConnectString(actor?.email, 200) ?? undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          user_id: String(userId),
        },
      });
    }

    const nowMs = Date.now();
    const snapshot = buildStripeConnectAccountSnapshot(account, { readyAtMs: nowMs });
    await ctx.runMutation(internal.builderCommerce.syncUserStripeConnectAccountInternal as any, {
      userId,
      stripeAccountId: snapshot.stripeAccountId,
      accountType: snapshot.accountType,
      status: snapshot.status,
      detailsSubmitted: snapshot.detailsSubmitted,
      chargesEnabled: snapshot.chargesEnabled,
      payoutsEnabled: snapshot.payoutsEnabled,
      requirementsCurrentlyDue: snapshot.requirementsCurrentlyDue,
      requirementsEventuallyDue: snapshot.requirementsEventuallyDue,
      requirementsDisabledReason: snapshot.requirementsDisabledReason,
      onboardingCompleteAt: snapshot.status === "ready" ? nowMs : null,
      nowMs,
    });

    if (snapshot.status === "ready") {
      const loginLink = await stripe.accounts.createLoginLink(account.id);
      const url = String((loginLink as { url?: unknown })?.url ?? "").trim();
      if (!url) throw new Error("builder_payout_dashboard_url_missing");
      return { url };
    }

    const { returnUrl, refreshUrl } = buildStripeConnectRedirectUrls({
      context: args.context,
      communitySlug: args.communitySlug ?? null,
    });
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      type: "account_onboarding",
      return_url: returnUrl,
      refresh_url: refreshUrl,
    });
    const url = String(accountLink.url ?? "").trim();
    if (!url) throw new Error("builder_payout_onboarding_url_missing");
    return { url };
  },
});
