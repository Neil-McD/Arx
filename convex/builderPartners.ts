import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { findAuthenticatedActorState, resolveAuthenticatedActor } from "./authActor";
import { hashBusinessVisitorKey } from "./businessAnalyticsCore";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";
import {
  BUILDER_PARTNER_ATTRIBUTION_WINDOW_MS,
  BUILDER_PARTNER_COMMISSION_HOLD_MS,
  BUILDER_PARTNER_COMMUNITY_PLATFORM_FEE_BPS,
  BUILDER_PARTNER_PROGRAM_VERSION,
  BUILDER_PARTNER_PLATFORM_FEE_SHARE_BPS,
  BUILDER_PARTNER_TERMS_VERSION,
  BUILDER_PARTNER_TOOL_GROSS_MARGIN_SHARE_BPS,
  calculateBuilderPartnerCommunityRevenueCommission,
  calculateBuilderPartnerToolGrossMarginCommission,
  roundBuilderPartnerMoney,
} from "../shared/builderPartnerProgram";
import { buildAttributionRouteLabel } from "../shared/routePrivacy";

type RequirementKey = "signed_in" | "own_community" | "accept_terms" | "account_good_standing";
type ProgramState = "signed_out" | "locked" | "ready_to_unlock" | "active" | "paused" | "disabled";

function authLookupIsOptionalFailure(error: unknown): boolean {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : String(error ?? "");
  return message.includes("verified_identity_required") || message.includes("auth_subject_required");
}

async function findOptionalAuthenticatedActorState(args: {
  ctx: any;
  authSubject?: string | null;
}) {
  try {
    return await findAuthenticatedActorState({
      ctx: args.ctx,
      authSubject: args.authSubject ?? null,
    });
  } catch (error) {
    if (authLookupIsOptionalFailure(error)) {
      return { authSubject: "", actor: null };
    }
    throw error;
  }
}

function normalizeReferralCode(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizePartnerCodeBase(user: any): string {
  const handle = normalizeReferralCode(user?.normalizedHandle ?? user?.handle);
  if (handle.length >= 3) return handle;
  const displayName = normalizeReferralCode(user?.displayName);
  if (displayName.length >= 3) return displayName;
  const emailPrefix = normalizeReferralCode(String(user?.email ?? "").split("@")[0]);
  if (emailPrefix.length >= 3) return emailPrefix;
  return "builder";
}

function buildPartnerLink(code: string): string {
  const path = `/?partner=${encodeURIComponent(code)}`;
  try {
    return `${readCanonicalPublicAppOrigin()}${path}`;
  } catch {
    return path;
  }
}

function normalizeAttributionRouteLabel(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  return buildAttributionRouteLabel({ href: text });
}

function normalizeUsdCurrency(value: unknown): "usd" | null {
  return String(value ?? "").trim().toLowerCase() === "usd" ? "usd" : null;
}

function baseUnitsToUsd(args: {
  amountBaseUnits?: number | null;
  currency?: string | null;
  currencyDecimals?: number | null;
}): number | null {
  if (!normalizeUsdCurrency(args.currency)) return null;
  const amountBaseUnits = Number(args.amountBaseUnits ?? 0);
  const currencyDecimals = Number(args.currencyDecimals ?? 2);
  if (!Number.isFinite(amountBaseUnits) || amountBaseUnits <= 0) return null;
  if (!Number.isFinite(currencyDecimals) || currencyDecimals < 0 || currencyDecimals > 8) return null;
  return roundBuilderPartnerMoney(amountBaseUnits / (10 ** Math.floor(currencyDecimals)));
}

async function listOwnedCommunities(ctx: any, userId: any) {
  return await ctx.db
    .query("communities")
    .withIndex("by_owner", (q: any) => q.eq("ownerId", userId))
    .collect();
}

async function getPartnerByUserId(ctx: any, userId: any) {
  return await ctx.db
    .query("builderPartners")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
}

async function getCommissionByKey(ctx: any, commissionKey: string) {
  return await ctx.db
    .query("partnerCommissionLedger")
    .withIndex("by_commissionKey", (q: any) => q.eq("commissionKey", commissionKey))
    .first();
}

async function codeIsAvailable(ctx: any, code: string, existingPartnerId?: any): Promise<boolean> {
  const row = await ctx.db
    .query("builderPartners")
    .withIndex("by_code", (q: any) => q.eq("code", code))
    .first();
  return !row || (existingPartnerId && String(row._id) === String(existingPartnerId));
}

async function issuePartnerCode(ctx: any, user: any, existingPartnerId?: any): Promise<string> {
  const base = normalizePartnerCodeBase(user).slice(0, 32).replace(/^-+|-+$/g, "") || "builder";
  if (await codeIsAvailable(ctx, base, existingPartnerId)) return base;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 8);
    const candidate = `${base.slice(0, Math.max(3, 40 - suffix.length))}-${suffix}`;
    if (await codeIsAvailable(ctx, candidate, existingPartnerId)) return candidate;
  }
  throw new Error("builder_partner_code_collision");
}

function buildRequirements(args: {
  signedIn: boolean;
  ownsCommunity: boolean;
  acceptedTerms: boolean;
  accountGoodStanding: boolean;
}) {
  return [
    {
      key: "signed_in" as RequirementKey,
      label: "Sign in to PolyNet",
      met: args.signedIn,
      action: "sign_in",
    },
    {
      key: "own_community" as RequirementKey,
      label: "Own at least one community",
      met: args.ownsCommunity,
      action: "create_community",
    },
    {
      key: "accept_terms" as RequirementKey,
      label: "Accept Builder Partner terms",
      met: args.acceptedTerms,
      action: "accept_terms",
    },
    {
      key: "account_good_standing" as RequirementKey,
      label: "Account in good standing",
      met: args.accountGoodStanding,
      action: null,
    },
  ];
}

function hasAcceptedCurrentTerms(partner: any): boolean {
  return (
    typeof partner?.acceptedTermsAt === "number" &&
    String(partner?.acceptedTermsVersion ?? "") === BUILDER_PARTNER_TERMS_VERSION
  );
}

function isOpenAttribution(row: any, nowMs: number): boolean {
  const status = String(row?.status ?? "");
  return (
    (status === "active" || status === "bound") &&
    Number(row?.expiresAt ?? 0) > nowMs
  );
}

async function expireClosedAttributions(ctx: any, rows: any[], nowMs: number) {
  await Promise.all(
    rows
      .filter((row) => {
        const status = String(row?.status ?? "");
        return (
          (status === "active" || status === "bound") &&
          Number(row?.expiresAt ?? 0) <= nowMs
        );
      })
      .map((row) =>
        ctx.db.patch(row._id, {
          status: "expired",
          updatedAt: nowMs,
        }),
      ),
  );
}

async function resolveBuilderPartnerProgramState(ctx: any, args: {
  userId: any;
  partner?: any;
  ownedCommunities?: any[];
}) {
  const [partner, ownedCommunities] = await Promise.all([
    args.partner === undefined ? getPartnerByUserId(ctx, args.userId) : args.partner,
    args.ownedCommunities === undefined
      ? listOwnedCommunities(ctx, args.userId)
      : args.ownedCommunities,
  ]);
  const ownsCommunity = ownedCommunities.length > 0;
  const acceptedTerms = hasAcceptedCurrentTerms(partner);
  const accountGoodStanding = partner?.status !== "disabled";
  const requirements = buildRequirements({
    signedIn: true,
    ownsCommunity,
    acceptedTerms,
    accountGoodStanding,
  });
  const eligible = requirements.every((requirement) => requirement.met);
  const partnerStatus = String(partner?.status ?? "").trim();
  const state: ProgramState =
    partnerStatus === "disabled"
      ? "disabled"
      : partnerStatus === "paused"
        ? "paused"
        : partnerStatus === "active" && eligible
          ? "active"
          : ownsCommunity && !acceptedTerms && accountGoodStanding
            ? "ready_to_unlock"
            : "locked";
  return {
    partner,
    ownedCommunities,
    requirements,
    eligible,
    state,
  };
}

async function findBoundPartnerAttributionForCommission(ctx: any, args: {
  referredUserId: any;
  nowMs: number;
  requireCommunityRevenueEligibility?: boolean;
}) {
  const rows = await ctx.db
    .query("partnerAttributions")
    .withIndex("by_referredUser", (q: any) => q.eq("referredUserId", args.referredUserId))
    .collect();
  await expireClosedAttributions(ctx, rows, args.nowMs);
  const candidates = rows
    .filter((row: any) => row.status === "bound")
    .filter((row: any) => isOpenAttribution(row, args.nowMs))
    .filter((row: any) =>
      args.requireCommunityRevenueEligibility
        ? row.eligibleForCommunityRevenue === true
        : true,
    )
    .sort((a: any, b: any) => Number(b.lastTouchAt ?? 0) - Number(a.lastTouchAt ?? 0));
  for (const attribution of candidates) {
    const partner = await ctx.db.get(attribution.partnerId);
    if (!partner || partner.status === "disabled") continue;
    return { attribution, partner };
  }
  return null;
}

async function insertPartnerCommissionIfEligible(ctx: any, args: {
  commissionKey: string;
  partner: any;
  attribution: any;
  referredUserId: any;
  referredCommunityId?: any;
  basisType: "community_platform_fee" | "tool_gross_margin";
  basisAmountUsd: number;
  commissionRateBps: number;
  commissionAmountUsd: number;
  sourceCheckoutSessionId?: string;
  sourceProviderSubscriptionId?: string;
  sourceCreditLedgerEntryId?: any;
  nowMs: number;
}) {
  const existing = await getCommissionByKey(ctx, args.commissionKey);
  if (existing) return existing;
  const basisAmountUsd = roundBuilderPartnerMoney(args.basisAmountUsd);
  const commissionAmountUsd = roundBuilderPartnerMoney(args.commissionAmountUsd);
  if (!(basisAmountUsd > 0) || !(commissionAmountUsd > 0)) return null;
  const id = await ctx.db.insert("partnerCommissionLedger", {
    commissionKey: args.commissionKey,
    partnerId: args.partner._id,
    partnerUserId: args.partner.userId,
    attributionId: args.attribution._id,
    referredUserId: args.referredUserId,
    referredCommunityId: args.referredCommunityId,
    basisType: args.basisType,
    basisAmountUsd,
    commissionRateBps: args.commissionRateBps,
    commissionAmountUsd,
    currency: "usd",
    status: "locked",
    sourceCheckoutSessionId: args.sourceCheckoutSessionId,
    sourceProviderSubscriptionId: args.sourceProviderSubscriptionId,
    sourceCreditLedgerEntryId: args.sourceCreditLedgerEntryId,
    holdUntil: args.nowMs + BUILDER_PARTNER_COMMISSION_HOLD_MS,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  return await ctx.db.get(id);
}

export async function recordCommunityRevenuePartnerCommission(ctx: any, args: {
  communityId: any;
  sourceCheckoutSessionId: string;
  sourceProviderSubscriptionId?: string | null;
  amountBaseUnits?: number | null;
  currency?: string | null;
  currencyDecimals?: number | null;
  nowMs?: number;
}) {
  const nowMs = args.nowMs ?? Date.now();
  const sourceCheckoutSessionId = String(args.sourceCheckoutSessionId ?? "").trim();
  if (!sourceCheckoutSessionId) return null;
  const commissionKey = `community_platform_fee:${sourceCheckoutSessionId}`;
  const existing = await getCommissionByKey(ctx, commissionKey);
  if (existing) return existing;
  const community = await ctx.db.get(args.communityId);
  if (!community?.ownerId) return null;
  const referredUserId = community.ownerId;
  const match = await findBoundPartnerAttributionForCommission(ctx, {
    referredUserId,
    nowMs,
    requireCommunityRevenueEligibility: true,
  });
  if (!match) return null;
  const communityCreatedAt = Number(community.createdAt ?? 0);
  const attributionStartedAt = Number(match.attribution.firstTouchAt ?? match.attribution.lastTouchAt ?? 0);
  if (communityCreatedAt > 0 && attributionStartedAt > 0 && communityCreatedAt < attributionStartedAt) {
    return null;
  }
  const communityRevenueUsd = baseUnitsToUsd({
    amountBaseUnits: args.amountBaseUnits,
    currency: args.currency,
    currencyDecimals: args.currencyDecimals,
  });
  if (!(communityRevenueUsd && communityRevenueUsd > 0)) return null;
  const commission = calculateBuilderPartnerCommunityRevenueCommission({
    communityRevenueUsd,
    platformFeeBps: BUILDER_PARTNER_COMMUNITY_PLATFORM_FEE_BPS,
    partnerPlatformFeeShareBps: BUILDER_PARTNER_PLATFORM_FEE_SHARE_BPS,
  });
  return await insertPartnerCommissionIfEligible(ctx, {
    commissionKey,
    partner: match.partner,
    attribution: match.attribution,
    referredUserId,
    referredCommunityId: args.communityId,
    basisType: "community_platform_fee",
    basisAmountUsd: commission.platformFeeUsd,
    commissionRateBps: BUILDER_PARTNER_PLATFORM_FEE_SHARE_BPS,
    commissionAmountUsd: commission.commissionAmountUsd,
    sourceCheckoutSessionId,
    sourceProviderSubscriptionId: String(args.sourceProviderSubscriptionId ?? "").trim() || undefined,
    nowMs,
  });
}

export async function recordToolUsagePartnerCommission(ctx: any, args: {
  creditLedgerEntryId: any;
  referredUserId: any;
  polynetPriceUsd?: number | null;
  rawVendorCostUsd?: number | null;
  paidUsageRatio?: number | null;
  nowMs?: number;
}) {
  const nowMs = args.nowMs ?? Date.now();
  const commissionKey = `tool_gross_margin:${String(args.creditLedgerEntryId)}`;
  const existing = await getCommissionByKey(ctx, commissionKey);
  if (existing) return existing;
  const paidUsageRatio = Math.min(1, Math.max(0, Number(args.paidUsageRatio ?? 0)));
  if (!(paidUsageRatio > 0)) return null;
  const match = await findBoundPartnerAttributionForCommission(ctx, {
    referredUserId: args.referredUserId,
    nowMs,
  });
  if (!match) return null;
  const polynetPriceUsd = roundBuilderPartnerMoney(Number(args.polynetPriceUsd ?? 0) * paidUsageRatio);
  const rawVendorCostUsd = roundBuilderPartnerMoney(Number(args.rawVendorCostUsd ?? 0) * paidUsageRatio);
  const commission = calculateBuilderPartnerToolGrossMarginCommission({
    polynetPriceUsd,
    rawVendorCostUsd,
    partnerToolGrossMarginShareBps: BUILDER_PARTNER_TOOL_GROSS_MARGIN_SHARE_BPS,
  });
  return await insertPartnerCommissionIfEligible(ctx, {
    commissionKey,
    partner: match.partner,
    attribution: match.attribution,
    referredUserId: args.referredUserId,
    basisType: "tool_gross_margin",
    basisAmountUsd: commission.grossMarginUsd,
    commissionRateBps: BUILDER_PARTNER_TOOL_GROSS_MARGIN_SHARE_BPS,
    commissionAmountUsd: commission.commissionAmountUsd,
    sourceCreditLedgerEntryId: args.creditLedgerEntryId,
    nowMs,
  });
}

export const advancePartnerCommissionsToPayableInternal = internalMutation({
  args: {
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 50)));
    const rows = await ctx.db
      .query("partnerCommissionLedger")
      .withIndex("by_status_holdUntil", (q: any) =>
        q.eq("status", "locked").lte("holdUntil", nowMs),
      )
      .take(limit);

    let advanced = 0;
    for (const row of rows) {
      if (row.status !== "locked" || Number(row.holdUntil ?? Infinity) > nowMs) continue;
      await ctx.db.patch(row._id, {
        status: "payable",
        payableAt: nowMs,
        updatedAt: nowMs,
      });
      advanced += 1;
    }
    return {
      ok: true,
      advanced,
    };
  },
});

async function readPayoutStatus(ctx: any, userId: any) {
  const row = await ctx.db
    .query("userStripeConnectAccounts")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
  const status = String(row?.status ?? "").trim() || "not_connected";
  const payoutsEnabled = row?.payoutsEnabled === true;
  return {
    ready: payoutsEnabled,
    status,
    label: payoutsEnabled ? "Stripe ready" : "Stripe required before payouts",
  };
}

async function readCommissionSummary(ctx: any, partner: any) {
  if (!partner?._id) {
    return {
      pendingUsd: 0,
      payableUsd: 0,
      paidUsd: 0,
      totalUsd: 0,
      pendingCount: 0,
      payableCount: 0,
      paidCount: 0,
    };
  }
  const statuses = ["pending", "locked", "payable", "paid"] as const;
  const rows = (
    await Promise.all(
      statuses.map((status) =>
        ctx.db
          .query("partnerCommissionLedger")
          .withIndex("by_partner_status", (q: any) =>
            q.eq("partnerId", partner._id).eq("status", status),
          )
          .collect(),
      ),
    )
  ).flat();
  const sum = (statusSet: ReadonlySet<string>) =>
    rows
      .filter((row: any) => statusSet.has(String(row.status ?? "")))
      .reduce((total: number, row: any) => total + Math.max(0, Number(row.commissionAmountUsd ?? 0)), 0);
  const pendingSet = new Set(["pending", "locked"]);
  const payableSet = new Set(["payable"]);
  const paidSet = new Set(["paid"]);
  const pendingUsd = sum(pendingSet);
  const payableUsd = sum(payableSet);
  const paidUsd = sum(paidSet);
  return {
    pendingUsd,
    payableUsd,
    paidUsd,
    totalUsd: pendingUsd + payableUsd + paidUsd,
    pendingCount: rows.filter((row: any) => pendingSet.has(String(row.status ?? ""))).length,
    payableCount: rows.filter((row: any) => payableSet.has(String(row.status ?? ""))).length,
    paidCount: rows.filter((row: any) => paidSet.has(String(row.status ?? ""))).length,
  };
}

async function readAttributionSummary(ctx: any, partner: any) {
  if (!partner?._id) {
    return {
      activeCount: 0,
      boundCount: 0,
    };
  }
  const [activeRows, boundRows] = await Promise.all([
    ctx.db
      .query("partnerAttributions")
      .withIndex("by_partner_status", (q: any) =>
        q.eq("partnerId", partner._id).eq("status", "active"),
      )
      .collect(),
    ctx.db
      .query("partnerAttributions")
      .withIndex("by_partner_status", (q: any) =>
        q.eq("partnerId", partner._id).eq("status", "bound"),
      )
      .collect(),
  ]);
  const nowMs = Date.now();
  return {
    activeCount: activeRows.filter((row: any) => isOpenAttribution(row, nowMs)).length,
    boundCount: boundRows.filter((row: any) => isOpenAttribution(row, nowMs)).length,
  };
}

async function buildProgramSnapshot(ctx: any, args: { authSubject?: string | null }) {
  const { actor } = await findOptionalAuthenticatedActorState({
    ctx,
    authSubject: args.authSubject ?? null,
  });
  if (!actor) {
    return {
      programVersion: BUILDER_PARTNER_PROGRAM_VERSION,
      state: "signed_out" as ProgramState,
      isUnlocked: false,
      eligible: false,
      requirements: buildRequirements({
        signedIn: false,
        ownsCommunity: false,
        acceptedTerms: false,
        accountGoodStanding: false,
      }),
      partner: null,
      payout: {
        ready: false,
        status: "not_connected",
        label: "Stripe required before payouts",
      },
      commissionSummary: await readCommissionSummary(ctx, null),
      attributionSummary: await readAttributionSummary(ctx, null),
    };
  }

  const [programState, payout] = await Promise.all([
    resolveBuilderPartnerProgramState(ctx, { userId: actor.dbUserId }),
    readPayoutStatus(ctx, actor.dbUserId),
  ]);
  const { partner, requirements, eligible, state } = programState;
  return {
    programVersion: BUILDER_PARTNER_PROGRAM_VERSION,
    state,
    isUnlocked: state === "active",
    eligible,
    requirements,
    partner: partner
      ? {
          code: partner.code,
          status: partner.status,
          partnerLink: buildPartnerLink(partner.code),
          acceptedTermsAt: partner.acceptedTermsAt ?? null,
          acceptedTermsVersion: partner.acceptedTermsVersion ?? null,
          disabledReason: partner.disabledReason ?? null,
          createdAt: partner.createdAt,
          updatedAt: partner.updatedAt,
        }
      : null,
    payout,
    commissionSummary: await readCommissionSummary(ctx, partner),
    attributionSummary: await readAttributionSummary(ctx, partner),
  };
}

export const getMyBuilderPartnerProgram = query({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await buildProgramSnapshot(ctx, {
      authSubject: args.authSubject ?? null,
    });
  },
});

export const acceptBuilderPartnerTermsAndEnsure = mutation({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = Date.now();
    const ownedCommunities = await listOwnedCommunities(ctx, actor.dbUserId);
    if (ownedCommunities.length <= 0) {
      throw new Error("builder_partner_owned_community_required");
    }

    const existing = await getPartnerByUserId(ctx, actor.dbUserId);
    if (existing?.status === "disabled") {
      throw new Error("builder_partner_disabled");
    }
    const user = await ctx.db.get(actor.dbUserId);
    const code = existing?.code || await issuePartnerCode(ctx, user, existing?._id);
    if (existing) {
      await ctx.db.patch(existing._id, {
        code,
        status: existing.status === "paused" ? "paused" : "active",
        acceptedTermsAt: existing.acceptedTermsAt ?? nowMs,
        acceptedTermsVersion: BUILDER_PARTNER_TERMS_VERSION,
        updatedAt: nowMs,
      });
    } else {
      await ctx.db.insert("builderPartners", {
        userId: actor.dbUserId,
        code,
        status: "active",
        acceptedTermsAt: nowMs,
        acceptedTermsVersion: BUILDER_PARTNER_TERMS_VERSION,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    }

    return await buildProgramSnapshot(ctx, {
      authSubject: args.authSubject ?? null,
    });
  },
});

export const recordBuilderPartnerAttribution = mutation({
  args: {
    referralCode: v.string(),
    visitorKey: v.optional(v.string()),
    authSubject: v.optional(v.string()),
    currentUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const referralCode = normalizeReferralCode(args.referralCode);
    if (!referralCode) return { ok: false, reason: "missing_referral_code" };

    const partner = await ctx.db
      .query("builderPartners")
      .withIndex("by_code", (q: any) => q.eq("code", referralCode))
      .first();
    if (!partner) {
      return { ok: false, reason: "partner_not_active" };
    }
    const partnerProgramState = await resolveBuilderPartnerProgramState(ctx, {
      userId: partner.userId,
      partner,
    });
    if (partnerProgramState.state !== "active") {
      return { ok: false, reason: "partner_not_active" };
    }

    const { actor } = String(args.authSubject ?? "").trim()
      ? await findOptionalAuthenticatedActorState({
          ctx,
          authSubject: args.authSubject ?? null,
        })
      : { actor: null };
    const referredUserId = actor?.dbUserId ?? null;
    if (referredUserId && String(referredUserId) === String(partner.userId)) {
      return { ok: false, reason: "self_referral_ignored" };
    }
    const referredUserOwnedCommunities = referredUserId
      ? await listOwnedCommunities(ctx, referredUserId)
      : [];
    const referredUserHadOwnedCommunityAtBind = referredUserId
      ? referredUserOwnedCommunities.length > 0
      : undefined;
    const eligibleForCommunityRevenue = referredUserId
      ? referredUserHadOwnedCommunityAtBind === false
      : undefined;

    const rawVisitorKey = String(args.visitorKey ?? "").trim();
    const visitorKeyHash = rawVisitorKey ? await hashBusinessVisitorKey(rawVisitorKey) : null;
    if (!visitorKeyHash && !referredUserId) {
      return { ok: false, reason: "missing_attribution_subject" };
    }

    const nowMs = Date.now();
    const expiresAt = nowMs + BUILDER_PARTNER_ATTRIBUTION_WINDOW_MS;
    const currentUrl = normalizeAttributionRouteLabel(args.currentUrl);
    const rowsByVisitor = visitorKeyHash
      ? await ctx.db
          .query("partnerAttributions")
          .withIndex("by_visitor_hash", (q: any) => q.eq("anonymousVisitorKeyHash", visitorKeyHash))
          .collect()
      : [];
    const rowsByUser = referredUserId
      ? await ctx.db
          .query("partnerAttributions")
          .withIndex("by_referredUser", (q: any) => q.eq("referredUserId", referredUserId))
          .collect()
      : [];
    const candidateRows = [...rowsByVisitor, ...rowsByUser]
      .filter((row: any, index, rows) =>
        rows.findIndex((candidate: any) => String(candidate._id) === String(row._id)) === index,
      );
    await expireClosedAttributions(ctx, candidateRows, nowMs);
    const relevantRows = candidateRows.filter((row: any) => isOpenAttribution(row, nowMs));

    const boundToOtherPartner = relevantRows.find(
      (row: any) => row.status === "bound" && String(row.partnerId) !== String(partner._id),
    );
    if (boundToOtherPartner) {
      return { ok: false, reason: "referred_user_already_bound" };
    }

    for (const row of relevantRows) {
      if (String(row.partnerId) !== String(partner._id)) {
        await ctx.db.patch(row._id, {
          status: "voided",
          voidReason: "superseded_by_new_referral",
          updatedAt: nowMs,
        });
      }
    }

    const existingForPartner = relevantRows.find(
      (row: any) => String(row.partnerId) === String(partner._id),
    ) ?? candidateRows.find(
      (row: any) =>
        String(row.partnerId) === String(partner._id) &&
        String(row.status ?? "") !== "voided",
    );
    if (existingForPartner) {
      const nextReferredUserId = referredUserId ?? existingForPartner.referredUserId;
      const nextReferredUserHadOwnedCommunityAtBind =
        nextReferredUserId
          ? existingForPartner.referredUserHadOwnedCommunityAtBind ?? referredUserHadOwnedCommunityAtBind
          : undefined;
      const nextEligibleForCommunityRevenue =
        nextReferredUserId
          ? existingForPartner.eligibleForCommunityRevenue ?? eligibleForCommunityRevenue
          : undefined;
      await ctx.db.patch(existingForPartner._id, {
        referralCode,
        anonymousVisitorKeyHash: visitorKeyHash ?? existingForPartner.anonymousVisitorKeyHash,
        referredUserId: nextReferredUserId,
        lastTouchUrl: currentUrl ?? existingForPartner.lastTouchUrl,
        status: nextReferredUserId ? "bound" : "active",
        referredUserHadOwnedCommunityAtBind: nextReferredUserHadOwnedCommunityAtBind,
        eligibleForCommunityRevenue: nextEligibleForCommunityRevenue,
        lastTouchAt: nowMs,
        expiresAt,
        updatedAt: nowMs,
      });
      return { ok: true, attribution_id: String(existingForPartner._id), status: nextReferredUserId ? "bound" : "active" };
    }

    const attributionKey = referredUserId
      ? `partner:${String(partner._id)}:user:${String(referredUserId)}`
      : `partner:${String(partner._id)}:visitor:${visitorKeyHash}`;
    const attributionId = await ctx.db.insert("partnerAttributions", {
      attributionKey,
      partnerId: partner._id,
      partnerUserId: partner.userId,
      referralCode,
      anonymousVisitorKeyHash: visitorKeyHash ?? undefined,
      referredUserId: referredUserId ?? undefined,
      firstTouchUrl: currentUrl,
      lastTouchUrl: currentUrl,
      status: referredUserId ? "bound" : "active",
      referredUserHadOwnedCommunityAtBind,
      eligibleForCommunityRevenue,
      firstTouchAt: nowMs,
      lastTouchAt: nowMs,
      expiresAt,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { ok: true, attribution_id: String(attributionId), status: referredUserId ? "bound" : "active" };
  },
});
