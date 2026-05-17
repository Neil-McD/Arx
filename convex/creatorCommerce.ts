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

const STRIPE_CONNECT_CONTEXT_VALIDATOR = v.union(
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

type StripeConnectOnboardingStage =
  | "resolve_actor"
  | "check_payout_access"
  | "load_existing_connect_account"
  | "retrieve_connect_account"
  | "create_connect_account"
  | "sync_connect_account"
  | "create_express_login_link"
  | "create_onboarding_account_link";

type NormalizedStripeConnectOnboardingError = {
  publicMessage: string;
  errorCode: string;
  errorMessage: string;
  stripeErrorType?: string;
  stripeErrorCode?: string;
  stripeRequestId?: string;
  stripeStatusCode?: number;
};

function normalizeDiagnosticString(value: unknown, fallback = ""): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function normalizeStripeConnectOnboardingError(error: unknown): NormalizedStripeConnectOnboardingError {
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    requestId?: unknown;
    request_id?: unknown;
    statusCode?: unknown;
    status?: unknown;
    type?: unknown;
  };
  const rawMessage =
    normalizeDiagnosticString(candidate?.message) ||
    (error instanceof Error ? normalizeDiagnosticString(error.message) : normalizeDiagnosticString(error));
  const stripeErrorCode = normalizeDiagnosticString(candidate?.code);
  const stripeErrorType = normalizeDiagnosticString(candidate?.type);
  const stripeRequestId = normalizeDiagnosticString(candidate?.requestId ?? candidate?.request_id);
  const statusCandidate = Number(candidate?.statusCode ?? candidate?.status);
  const stripeStatusCode = Number.isFinite(statusCandidate) && statusCandidate > 0
    ? Math.floor(statusCandidate)
    : undefined;
  const lower = rawMessage.toLowerCase();
  const errorCode =
    stripeErrorCode ||
    (lower.includes("responsibilities of managing losses") || lower.includes("ongoing compliance")
      ? "stripe_connect_platform_profile_incomplete"
      : lower.includes("no such account") || lower.includes("resource_missing")
        ? "stripe_connect_account_missing"
        : lower.includes("account link")
          ? "stripe_connect_account_link_failed"
          : "stripe_connect_onboarding_failed");
  return {
    publicMessage:
      "Stripe Connect setup could not be opened. We logged a diagnostic, and you can retry setup in a minute.",
    errorCode,
    errorMessage: rawMessage || errorCode,
    stripeErrorType: stripeErrorType || undefined,
    stripeErrorCode: stripeErrorCode || undefined,
    stripeRequestId: stripeRequestId || undefined,
    stripeStatusCode,
  };
}

async function recordStripeConnectOnboardingFailureDiagnostic(args: {
  ctx: any;
  userId?: unknown;
  context: "account" | "community";
  communitySlug?: string | null;
  stage: StripeConnectOnboardingStage;
  stripeAccountId?: string | null;
  startedAtMs: number;
  error: unknown;
}) {
  const nowMs = Date.now();
  const normalized = normalizeStripeConnectOnboardingError(args.error);
  const stripeAccountId = normalizeDiagnosticString(args.stripeAccountId);
  const metadata = {
    context: args.context,
    communitySlug: normalizeDiagnosticString(args.communitySlug),
    stage: args.stage,
    stripeAccountId,
    stripeErrorType: normalized.stripeErrorType ?? "",
    stripeErrorCode: normalized.stripeErrorCode ?? "",
    stripeRequestId: normalized.stripeRequestId ?? "",
    stripeStatusCode: normalized.stripeStatusCode ?? 0,
    errorMessage: normalized.errorMessage,
  };
  const platformDiagnosticEventKey =
    `billing.stripe_connect_onboarding_failed:${String(args.userId ?? "unknown")}:${args.stage}:${nowMs}`;
  const criticalAuditEventKey =
    `stripe_connect_onboarding_failed:${String(args.userId ?? "unknown")}:${args.stage}:${nowMs}`;
  try {
    await args.ctx.runMutation((internal as any).platformDiagnostics.recordPlatformDiagnosticEventInternal, {
      eventKey: platformDiagnosticEventKey,
      eventType: "billing.stripe_connect_onboarding_failed",
      subsystem: "billing",
      severity: "error",
      status: "failed",
      surface: args.context === "community" ? "community_settings" : "account_settings",
      userId: args.userId,
      latencyMs: Math.max(0, nowMs - args.startedAtMs),
      errorCode: normalized.errorCode,
      metadata,
      createdAt: nowMs,
    });
  } catch (diagnosticError) {
    console.error("stripe_connect_onboarding_diagnostic_record_failed", {
      eventType: "billing.stripe_connect_onboarding_failed",
      eventKey: platformDiagnosticEventKey,
      error: diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError),
    });
  }
  try {
    await args.ctx.runMutation((internal as any).criticalAudit.recordCriticalAuditEventInternal, {
      eventKey: criticalAuditEventKey,
      eventType: "stripe_connect_onboarding_failed",
      severity: "error",
      status: "failed",
      actorUserId: args.userId,
      subjectUserId: args.userId,
      provider: "stripe",
      providerObjectId: stripeAccountId || normalized.stripeRequestId,
      metadata,
      createdAt: nowMs,
    });
  } catch (auditError) {
    console.error("stripe_connect_onboarding_audit_record_failed", {
      eventType: "stripe_connect_onboarding_failed",
      eventKey: criticalAuditEventKey,
      error: auditError instanceof Error ? auditError.message : String(auditError),
    });
  }
  throw new Error(normalized.publicMessage);
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
    context: STRIPE_CONNECT_CONTEXT_VALIDATOR,
    communitySlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const startedAtMs = Date.now();
    let stage: StripeConnectOnboardingStage = "resolve_actor";
    let diagnosticUserId: unknown;
    let diagnosticStripeAccountId: string | null = null;
    try {
      const actor = (await ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, {
        authSubject: args.authSubject ?? null,
      })) as { dbUserId?: unknown; email?: string | null };
      const userId = actor?.dbUserId;
      diagnosticUserId = userId;
      if (!userId) throw new Error("user_not_found");
      if (args.userId && String(args.userId) !== String(userId)) {
        throw new Error("user_id_mismatch");
      }
      stage = "check_payout_access";
      const accountAccess = (await ctx.runQuery(
        internal.auth.getAccountCommerceAccessForUserInternal as any,
        { userId, nowMs: Date.now() },
      )) as { account_tier?: unknown; has_payouts?: unknown } | null;
      const hasPayoutAccess = accountAccess?.has_payouts === true;
      if (!hasPayoutAccess) {
        throw new Error("creator_payout_access_required");
      }

      stage = "load_existing_connect_account";
      const existing = (await ctx.runQuery(
        internal.creatorCommerce.getUserStripeConnectAccountInternal as any,
        { userId },
      )) as {
        stripeAccountId?: string | null;
      } | null;
      const stripe = getStripeClient();
      let account: Stripe.Account;
      const existingAccountId = normalizeOptionalStripeConnectString(existing?.stripeAccountId);
      if (existingAccountId) {
        stage = "retrieve_connect_account";
        diagnosticStripeAccountId = existingAccountId;
        account = await stripe.accounts.retrieve(existingAccountId);
      } else {
        stage = "create_connect_account";
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
        diagnosticStripeAccountId = account.id;
      }

      const nowMs = Date.now();
      const snapshot = buildStripeConnectAccountSnapshot(account, { readyAtMs: nowMs });
      diagnosticStripeAccountId = snapshot.stripeAccountId;
      stage = "sync_connect_account";
      await ctx.runMutation(internal.creatorCommerce.syncUserStripeConnectAccountInternal as any, {
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
        stage = "create_express_login_link";
        const loginLink = await stripe.accounts.createLoginLink(account.id);
        const url = String((loginLink as { url?: unknown })?.url ?? "").trim();
        if (!url) throw new Error("stripe_connect_dashboard_url_missing");
        return { url };
      }

      const { returnUrl, refreshUrl } = buildStripeConnectRedirectUrls({
        context: args.context,
        communitySlug: args.communitySlug ?? null,
      });
      stage = "create_onboarding_account_link";
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        type: "account_onboarding",
        return_url: returnUrl,
        refresh_url: refreshUrl,
      });
      const url = String(accountLink.url ?? "").trim();
      if (!url) throw new Error("stripe_connect_onboarding_url_missing");
      return { url };
    } catch (error) {
      await recordStripeConnectOnboardingFailureDiagnostic({
        ctx,
        userId: diagnosticUserId,
        context: args.context,
        communitySlug: args.communitySlug ?? null,
        stage,
        stripeAccountId: diagnosticStripeAccountId,
        startedAtMs,
        error,
      });
    }
  },
});
