import { action, internalMutation, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { findAuthenticatedActorState, resolveAuthenticatedActor } from "./authActor";
import { hashBusinessVisitorKey } from "./businessAnalyticsCore";
import { recordCriticalAuditEventBestEffort } from "./criticalAudit";
import { requireOperatorRole } from "./operatorAccess";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";
import { getStripeClient } from "./stripeCore";
import {
  BUILDER_PARTNER_ATTRIBUTION_WINDOW_MS,
  BUILDER_PARTNER_COMMISSION_HOLD_MS,
  BUILDER_PARTNER_COMMUNITY_PLATFORM_FEE_BPS,
  BUILDER_PARTNER_PAYOUT_BUFFER_MS,
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
type PartnerPayoutItemStatus = "reserved" | "settled" | "voided";

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

function roundSignedPartnerMoney(value: number): number {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return 0;
  return Math.round(normalized * 10000) / 10000;
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

function normalizeProviderEvidenceId(value: unknown): string {
  return String(value ?? "").trim();
}

async function getCommissionByCheckoutSession(ctx: any, sourceCheckoutSessionId: string) {
  const normalized = normalizeProviderEvidenceId(sourceCheckoutSessionId);
  if (!normalized) return null;
  return await ctx.db
    .query("partnerCommissionLedger")
    .withIndex("by_checkout_session", (q: any) =>
      q.eq("sourceCheckoutSessionId", normalized),
    )
    .first();
}

async function patchCommissionSourceEvidence(ctx: any, row: any, evidence: {
  sourceCheckoutSessionId?: string | null;
  sourceProviderSubscriptionId?: string | null;
  sourceProviderInvoiceId?: string | null;
  sourceProviderPaymentIntentId?: string | null;
  sourceProviderChargeId?: string | null;
  nowMs: number;
}) {
  const patch: Record<string, unknown> = {};
  const sourceCheckoutSessionId = normalizeProviderEvidenceId(evidence.sourceCheckoutSessionId);
  const sourceProviderSubscriptionId = normalizeProviderEvidenceId(evidence.sourceProviderSubscriptionId);
  const sourceProviderInvoiceId = normalizeProviderEvidenceId(evidence.sourceProviderInvoiceId);
  const sourceProviderPaymentIntentId = normalizeProviderEvidenceId(evidence.sourceProviderPaymentIntentId);
  const sourceProviderChargeId = normalizeProviderEvidenceId(evidence.sourceProviderChargeId);
  if (sourceCheckoutSessionId && !row.sourceCheckoutSessionId) {
    patch.sourceCheckoutSessionId = sourceCheckoutSessionId;
  }
  if (sourceProviderSubscriptionId && !row.sourceProviderSubscriptionId) {
    patch.sourceProviderSubscriptionId = sourceProviderSubscriptionId;
  }
  if (sourceProviderInvoiceId && !row.sourceProviderInvoiceId) {
    patch.sourceProviderInvoiceId = sourceProviderInvoiceId;
  }
  if (sourceProviderPaymentIntentId && !row.sourceProviderPaymentIntentId) {
    patch.sourceProviderPaymentIntentId = sourceProviderPaymentIntentId;
  }
  if (sourceProviderChargeId && !row.sourceProviderChargeId) {
    patch.sourceProviderChargeId = sourceProviderChargeId;
  }
  if (Object.keys(patch).length <= 0) return row;
  await ctx.db.patch(row._id, {
    ...patch,
    updatedAt: evidence.nowMs,
  });
  return await ctx.db.get(row._id);
}

async function collectPartnerCommissionsByProviderEvidence(ctx: any, evidence: {
  sourceProviderChargeId?: string | null;
  sourceProviderPaymentIntentId?: string | null;
  sourceProviderInvoiceId?: string | null;
}) {
  const chargeId = normalizeProviderEvidenceId(evidence.sourceProviderChargeId);
  const paymentIntentId = normalizeProviderEvidenceId(evidence.sourceProviderPaymentIntentId);
  const invoiceId = normalizeProviderEvidenceId(evidence.sourceProviderInvoiceId);
  const groups: any[][] = [];
  if (chargeId) {
    groups.push(await ctx.db
      .query("partnerCommissionLedger")
      .withIndex("by_charge", (q: any) => q.eq("sourceProviderChargeId", chargeId))
      .collect());
  }
  if (paymentIntentId) {
    groups.push(await ctx.db
      .query("partnerCommissionLedger")
      .withIndex("by_payment_intent", (q: any) =>
        q.eq("sourceProviderPaymentIntentId", paymentIntentId),
      )
      .collect());
  }
  if (invoiceId) {
    groups.push(await ctx.db
      .query("partnerCommissionLedger")
      .withIndex("by_provider_invoice", (q: any) =>
        q.eq("sourceProviderInvoiceId", invoiceId),
      )
      .collect());
  }
  return groups
    .flat()
    .filter((row, index, rows) =>
      rows.findIndex((candidate) => String(candidate._id) === String(row._id)) === index,
    );
}

async function getCommissionAdjustmentByKey(ctx: any, adjustmentKey: string) {
  return await ctx.db
    .query("partnerCommissionAdjustments" as any)
    .withIndex("by_adjustmentKey", (q: any) => q.eq("adjustmentKey", adjustmentKey))
    .first();
}

async function collectAppliedCommissionAdjustments(ctx: any, commissionId: any) {
  const rows = await ctx.db
    .query("partnerCommissionAdjustments" as any)
    .withIndex("by_commission", (q: any) => q.eq("commissionId", commissionId))
    .collect();
  return rows.filter((row: any) => row.status === "applied");
}

async function readAppliedCommissionAdjustmentTotalUsd(ctx: any, commissionId: any) {
  const rows = await collectAppliedCommissionAdjustments(ctx, commissionId);
  return roundSignedPartnerMoney(
    rows.reduce((total: number, row: any) => total + Number(row.amountUsd ?? 0), 0),
  );
}

async function collectPartnerPayoutItemsByCommission(ctx: any, commissionId: any) {
  return await ctx.db
    .query("partnerPayoutItems" as any)
    .withIndex("by_commission", (q: any) => q.eq("commissionId", commissionId))
    .collect();
}

function partnerPayoutItemStatusIsOneOf(
  row: any,
  statuses: ReadonlySet<PartnerPayoutItemStatus>,
): boolean {
  return statuses.has(String(row?.status ?? "") as PartnerPayoutItemStatus);
}

async function readCommissionPayoutItemTotalUsd(
  ctx: any,
  commissionId: any,
  statuses: ReadonlySet<PartnerPayoutItemStatus>,
  excludeBatchId?: any,
) {
  const rows = await collectPartnerPayoutItemsByCommission(ctx, commissionId);
  return roundSignedPartnerMoney(
    rows
      .filter((row: any) => partnerPayoutItemStatusIsOneOf(row, statuses))
      .filter((row: any) =>
        excludeBatchId ? String(row.batchId) !== String(excludeBatchId) : true,
      )
      .reduce((total: number, row: any) => total + Number(row.amountUsd ?? 0), 0),
  );
}

async function capNegativeCommissionAdjustmentUsd(ctx: any, commission: any, amountUsd: number) {
  const requestedAmountUsd = roundSignedPartnerMoney(Number(amountUsd ?? 0));
  if (!(requestedAmountUsd < 0)) return requestedAmountUsd;
  const commissionAmountUsd = roundBuilderPartnerMoney(Number(commission.commissionAmountUsd ?? 0));
  if (!(commissionAmountUsd > 0)) return 0;
  const currentAdjustmentTotalUsd = await readAppliedCommissionAdjustmentTotalUsd(ctx, commission._id);
  const adjustmentFloorUsd = roundSignedPartnerMoney(-commissionAmountUsd);
  if (currentAdjustmentTotalUsd <= adjustmentFloorUsd + 0.0001) return 0;
  const lowestAllowedNewAmountUsd = roundSignedPartnerMoney(
    adjustmentFloorUsd - currentAdjustmentTotalUsd,
  );
  return roundSignedPartnerMoney(
    Math.min(0, Math.max(requestedAmountUsd, lowestAllowedNewAmountUsd)),
  );
}

async function getDisputeAdjustmentState(ctx: any, args: {
  sourceProviderDisputeId: string;
  commissionId: any;
}) {
  const disputeId = normalizeProviderEvidenceId(args.sourceProviderDisputeId);
  if (!disputeId) {
    return {
      currentImpactUsd: 0,
      hasTerminalAdjustment: false,
    };
  }
  const rows = await collectAppliedCommissionAdjustments(ctx, args.commissionId);
  const disputeRows = rows.filter((row: any) =>
    normalizeProviderEvidenceId(row.sourceProviderDisputeId) === disputeId,
  );
  const terminalTypes = new Set([
    "dispute_lost",
    "dispute_won",
    "dispute_funds_reinstated",
  ]);
  return {
    currentImpactUsd: roundSignedPartnerMoney(
      disputeRows.reduce((total: number, row: any) => total + Number(row.amountUsd ?? 0), 0),
    ),
    hasTerminalAdjustment: disputeRows.some((row: any) =>
      terminalTypes.has(String(row.adjustmentType ?? "")),
    ),
  };
}

function calculateProportionalCommissionAdjustmentUsd(args: {
  commissionAmountUsd: number;
  sourceAmountBaseUnits?: number | null;
  sourceTotalBaseUnits?: number | null;
}) {
  const commissionAmountUsd = roundBuilderPartnerMoney(args.commissionAmountUsd);
  const sourceAmountBaseUnits = Number(args.sourceAmountBaseUnits ?? 0);
  const sourceTotalBaseUnits = Number(args.sourceTotalBaseUnits ?? 0);
  if (
    Number.isFinite(sourceAmountBaseUnits) &&
    Number.isFinite(sourceTotalBaseUnits) &&
    sourceAmountBaseUnits > 0 &&
    sourceTotalBaseUnits > 0
  ) {
    return roundBuilderPartnerMoney(
      commissionAmountUsd * Math.min(1, sourceAmountBaseUnits / sourceTotalBaseUnits),
    );
  }
  return commissionAmountUsd;
}

function riskReleaseStatusForCommission(row: any, nowMs: number): "locked" | "payable" {
  return Number(row?.holdUntil ?? Infinity) <= nowMs ? "payable" : "locked";
}

async function insertPartnerCommissionAdjustmentIfMissing(ctx: any, args: {
  adjustmentKey: string;
  commission: any;
  adjustmentType:
    | "refund"
    | "dispute_opened"
    | "dispute_won"
    | "dispute_lost"
    | "dispute_funds_reinstated"
    | "manual_adjustment";
  amountUsd: number;
  sourceProviderRefundId?: string | null;
  sourceProviderDisputeId?: string | null;
  sourceProviderChargeId?: string | null;
  sourceProviderPaymentIntentId?: string | null;
  sourceProviderInvoiceId?: string | null;
  reason?: string;
  nowMs: number;
}) {
  const adjustmentKey = String(args.adjustmentKey ?? "").trim();
  if (!adjustmentKey) throw new Error("partner_commission_adjustment_key_required");
  const existing = await getCommissionAdjustmentByKey(ctx, adjustmentKey);
  if (existing) return existing;
  const id = await ctx.db.insert("partnerCommissionAdjustments" as any, {
    adjustmentKey,
    commissionId: args.commission._id,
    partnerId: args.commission.partnerId,
    partnerUserId: args.commission.partnerUserId,
    adjustmentType: args.adjustmentType,
    amountUsd: roundSignedPartnerMoney(Number(args.amountUsd ?? 0)),
    currency: "usd",
    status: "applied",
    sourceProviderRefundId: normalizeProviderEvidenceId(args.sourceProviderRefundId) || undefined,
    sourceProviderDisputeId: normalizeProviderEvidenceId(args.sourceProviderDisputeId) || undefined,
    sourceProviderChargeId:
      normalizeProviderEvidenceId(args.sourceProviderChargeId) ||
      normalizeProviderEvidenceId(args.commission.sourceProviderChargeId) ||
      undefined,
    sourceProviderPaymentIntentId:
      normalizeProviderEvidenceId(args.sourceProviderPaymentIntentId) ||
      normalizeProviderEvidenceId(args.commission.sourceProviderPaymentIntentId) ||
      undefined,
    sourceProviderInvoiceId:
      normalizeProviderEvidenceId(args.sourceProviderInvoiceId) ||
      normalizeProviderEvidenceId(args.commission.sourceProviderInvoiceId) ||
      undefined,
    reason: args.reason,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  return await ctx.db.get(id);
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
  sourceProviderInvoiceId?: string;
  sourceProviderPaymentIntentId?: string;
  sourceProviderChargeId?: string;
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
    sourceProviderInvoiceId: args.sourceProviderInvoiceId,
    sourceProviderPaymentIntentId: args.sourceProviderPaymentIntentId,
    sourceProviderChargeId: args.sourceProviderChargeId,
    sourceCreditLedgerEntryId: args.sourceCreditLedgerEntryId,
    holdUntil: args.nowMs + BUILDER_PARTNER_COMMISSION_HOLD_MS,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  return await ctx.db.get(id);
}

export async function recordCommunityRevenuePartnerCommission(ctx: any, args: {
  communityId: any;
  sourceCheckoutSessionId?: string | null;
  sourceProviderSubscriptionId?: string | null;
  sourceProviderInvoiceId?: string | null;
  sourceProviderPaymentIntentId?: string | null;
  sourceProviderChargeId?: string | null;
  amountBaseUnits?: number | null;
  currency?: string | null;
  currencyDecimals?: number | null;
  nowMs?: number;
}) {
  const nowMs = args.nowMs ?? Date.now();
  const sourceCheckoutSessionId = String(args.sourceCheckoutSessionId ?? "").trim();
  const sourceProviderInvoiceId = String(args.sourceProviderInvoiceId ?? "").trim();
  if (!sourceCheckoutSessionId && !sourceProviderInvoiceId) return null;
  const commissionKey = sourceProviderInvoiceId
    ? `community_platform_fee:invoice:${sourceProviderInvoiceId}`
    : `community_platform_fee:${sourceCheckoutSessionId}`;
  const existing = await getCommissionByKey(ctx, commissionKey);
  if (existing) {
    return await patchCommissionSourceEvidence(ctx, existing, {
      sourceCheckoutSessionId,
      sourceProviderSubscriptionId: args.sourceProviderSubscriptionId,
      sourceProviderInvoiceId,
      sourceProviderPaymentIntentId: args.sourceProviderPaymentIntentId,
      sourceProviderChargeId: args.sourceProviderChargeId,
      nowMs,
    });
  }
  const existingByCheckout = sourceCheckoutSessionId
    ? await getCommissionByCheckoutSession(ctx, sourceCheckoutSessionId)
    : null;
  if (existingByCheckout) {
    return await patchCommissionSourceEvidence(ctx, existingByCheckout, {
      sourceCheckoutSessionId,
      sourceProviderSubscriptionId: args.sourceProviderSubscriptionId,
      sourceProviderInvoiceId,
      sourceProviderPaymentIntentId: args.sourceProviderPaymentIntentId,
      sourceProviderChargeId: args.sourceProviderChargeId,
      nowMs,
    });
  }
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
    sourceCheckoutSessionId: sourceCheckoutSessionId || undefined,
    sourceProviderSubscriptionId: String(args.sourceProviderSubscriptionId ?? "").trim() || undefined,
    sourceProviderInvoiceId: sourceProviderInvoiceId || undefined,
    sourceProviderPaymentIntentId:
      String(args.sourceProviderPaymentIntentId ?? "").trim() || undefined,
    sourceProviderChargeId: String(args.sourceProviderChargeId ?? "").trim() || undefined,
    nowMs,
  });
}

export const recordCommunitySubscriptionInvoicePartnerCommissionInternal = internalMutation({
  args: {
    providerSubscriptionId: v.string(),
    sourceProviderInvoiceId: v.string(),
    sourceProviderPaymentIntentId: v.optional(v.string()),
    sourceProviderChargeId: v.optional(v.string()),
    amountBaseUnits: v.number(),
    currency: v.string(),
    currencyDecimals: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const providerSubscriptionId = String(args.providerSubscriptionId ?? "").trim();
    const sourceProviderInvoiceId = String(args.sourceProviderInvoiceId ?? "").trim();
    if (!providerSubscriptionId || !sourceProviderInvoiceId) {
      return { ok: false, reason: "invoice_source_missing" };
    }
    const subscription = await ctx.db
      .query("communitySubscriptions" as any)
      .withIndex("by_providerSubscriptionId", (q: any) =>
        q.eq("providerSubscriptionId", providerSubscriptionId),
      )
      .first();
    if (!subscription?.communityId) {
      return { ok: false, reason: "community_subscription_not_found" };
    }
    const pricePoint = (subscription.pricePointId
      ? await ctx.db.get(subscription.pricePointId)
      : null) as any | null;
    const currencyDecimals =
      typeof args.currencyDecimals === "number" && Number.isFinite(args.currencyDecimals)
        ? args.currencyDecimals
        : typeof pricePoint?.currencyDecimals === "number"
          ? pricePoint.currencyDecimals
          : 2;
    const row = await recordCommunityRevenuePartnerCommission(ctx, {
      communityId: subscription.communityId,
      sourceProviderSubscriptionId: providerSubscriptionId,
      sourceProviderInvoiceId,
      sourceProviderPaymentIntentId: args.sourceProviderPaymentIntentId,
      sourceProviderChargeId: args.sourceProviderChargeId,
      amountBaseUnits: args.amountBaseUnits,
      currency: args.currency,
      currencyDecimals,
      nowMs: args.nowMs,
    });
    return {
      ok: true,
      recorded: Boolean(row),
      commissionId: row?._id ? String(row._id) : null,
    };
  },
});

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

export const recordPartnerCommissionRefundAdjustmentInternal = internalMutation({
  args: {
    sourceProviderRefundId: v.string(),
    sourceProviderChargeId: v.optional(v.string()),
    sourceProviderPaymentIntentId: v.optional(v.string()),
    sourceProviderInvoiceId: v.optional(v.string()),
    refundAmountBaseUnits: v.optional(v.number()),
    chargeAmountBaseUnits: v.optional(v.number()),
    currency: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const refundId = normalizeProviderEvidenceId(args.sourceProviderRefundId);
    if (!refundId) return { ok: false, reason: "refund_id_missing" };
    const currency = String(args.currency ?? "").trim().toLowerCase();
    if (currency && currency !== "usd") {
      return { ok: true, ignored: true, reason: "refund_currency_unsupported" };
    }
    const rows = await collectPartnerCommissionsByProviderEvidence(ctx, {
      sourceProviderChargeId: args.sourceProviderChargeId,
      sourceProviderPaymentIntentId: args.sourceProviderPaymentIntentId,
      sourceProviderInvoiceId: args.sourceProviderInvoiceId,
    });
    let adjusted = 0;
    let voided = 0;
    for (const row of rows) {
      if (row.status === "voided") continue;
      await patchCommissionSourceEvidence(ctx, row, {
        sourceProviderInvoiceId: args.sourceProviderInvoiceId,
        sourceProviderPaymentIntentId: args.sourceProviderPaymentIntentId,
        sourceProviderChargeId: args.sourceProviderChargeId,
        nowMs,
      });
      const reversalUsd = calculateProportionalCommissionAdjustmentUsd({
        commissionAmountUsd: row.commissionAmountUsd,
        sourceAmountBaseUnits: args.refundAmountBaseUnits,
        sourceTotalBaseUnits: args.chargeAmountBaseUnits,
      });
      const isFullReversal =
        reversalUsd >= roundBuilderPartnerMoney(Number(row.commissionAmountUsd ?? 0) - 0.0001);
      const requestedAmountUsd = row.status === "paid" || !isFullReversal ? -reversalUsd : 0;
      const amountUsd = await capNegativeCommissionAdjustmentUsd(ctx, row, requestedAmountUsd);
      await insertPartnerCommissionAdjustmentIfMissing(ctx, {
        adjustmentKey: `partner_refund:${refundId}:${String(row._id)}`,
        commission: row,
        adjustmentType: "refund",
        amountUsd,
        sourceProviderRefundId: refundId,
        sourceProviderChargeId: args.sourceProviderChargeId,
        sourceProviderPaymentIntentId: args.sourceProviderPaymentIntentId,
        sourceProviderInvoiceId: args.sourceProviderInvoiceId,
        reason: "stripe_refund",
        nowMs,
      });
      adjusted += 1;
      if (row.status !== "paid" && isFullReversal) {
        await ctx.db.patch(row._id, {
          status: "voided",
          voidedAt: nowMs,
          voidReason: `stripe_refund:${refundId}`,
          updatedAt: nowMs,
        });
        voided += 1;
      }
    }
    return { ok: true, matched: rows.length, adjusted, voided };
  },
});

export const recordPartnerCommissionDisputeOpenedInternal = internalMutation({
  args: {
    sourceProviderDisputeId: v.string(),
    sourceProviderChargeId: v.optional(v.string()),
    sourceProviderPaymentIntentId: v.optional(v.string()),
    sourceProviderInvoiceId: v.optional(v.string()),
    disputeAmountBaseUnits: v.optional(v.number()),
    chargeAmountBaseUnits: v.optional(v.number()),
    currency: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const disputeId = normalizeProviderEvidenceId(args.sourceProviderDisputeId);
    if (!disputeId) return { ok: false, reason: "dispute_id_missing" };
    const currency = String(args.currency ?? "").trim().toLowerCase();
    if (currency && currency !== "usd") {
      return { ok: true, ignored: true, reason: "dispute_currency_unsupported" };
    }
    const rows = await collectPartnerCommissionsByProviderEvidence(ctx, {
      sourceProviderChargeId: args.sourceProviderChargeId,
      sourceProviderPaymentIntentId: args.sourceProviderPaymentIntentId,
      sourceProviderInvoiceId: args.sourceProviderInvoiceId,
    });
    let adjusted = 0;
    let held = 0;
    for (const row of rows) {
      if (row.status === "voided") continue;
      await patchCommissionSourceEvidence(ctx, row, {
        sourceProviderInvoiceId: args.sourceProviderInvoiceId,
        sourceProviderPaymentIntentId: args.sourceProviderPaymentIntentId,
        sourceProviderChargeId: args.sourceProviderChargeId,
        nowMs,
      });
      const reversalUsd = calculateProportionalCommissionAdjustmentUsd({
        commissionAmountUsd: row.commissionAmountUsd,
        sourceAmountBaseUnits: args.disputeAmountBaseUnits,
        sourceTotalBaseUnits: args.chargeAmountBaseUnits,
      });
      const disputeState = await getDisputeAdjustmentState(ctx, {
        sourceProviderDisputeId: disputeId,
        commissionId: row._id,
      });
      const requestedAmountUsd =
        row.status === "paid" && !disputeState.hasTerminalAdjustment
          ? roundSignedPartnerMoney(-reversalUsd - disputeState.currentImpactUsd)
          : 0;
      const amountUsd = await capNegativeCommissionAdjustmentUsd(ctx, row, requestedAmountUsd);
      await insertPartnerCommissionAdjustmentIfMissing(ctx, {
        adjustmentKey: `partner_dispute_opened:${disputeId}:${String(row._id)}`,
        commission: row,
        adjustmentType: "dispute_opened",
        amountUsd,
        sourceProviderDisputeId: disputeId,
        sourceProviderChargeId: args.sourceProviderChargeId,
        sourceProviderPaymentIntentId: args.sourceProviderPaymentIntentId,
        sourceProviderInvoiceId: args.sourceProviderInvoiceId,
        reason: "stripe_dispute_opened",
        nowMs,
      });
      adjusted += 1;
      if (row.status !== "paid" && row.status !== "risk_hold") {
        await ctx.db.patch(row._id, {
          status: "risk_hold",
          updatedAt: nowMs,
        });
        held += 1;
      }
    }
    return { ok: true, matched: rows.length, adjusted, held };
  },
});

export const recordPartnerCommissionDisputeClosedInternal = internalMutation({
  args: {
    sourceProviderDisputeId: v.string(),
    outcome: v.union(
      v.literal("won"),
      v.literal("lost"),
      v.literal("funds_reinstated"),
      v.literal("unknown"),
    ),
    sourceProviderChargeId: v.optional(v.string()),
    sourceProviderPaymentIntentId: v.optional(v.string()),
    sourceProviderInvoiceId: v.optional(v.string()),
    disputeAmountBaseUnits: v.optional(v.number()),
    chargeAmountBaseUnits: v.optional(v.number()),
    currency: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const disputeId = normalizeProviderEvidenceId(args.sourceProviderDisputeId);
    if (!disputeId) return { ok: false, reason: "dispute_id_missing" };
    if (args.outcome === "unknown") {
      return { ok: true, ignored: true, reason: "dispute_outcome_unknown" };
    }
    const currency = String(args.currency ?? "").trim().toLowerCase();
    if (currency && currency !== "usd") {
      return { ok: true, ignored: true, reason: "dispute_currency_unsupported" };
    }
    const rows = await collectPartnerCommissionsByProviderEvidence(ctx, {
      sourceProviderChargeId: args.sourceProviderChargeId,
      sourceProviderPaymentIntentId: args.sourceProviderPaymentIntentId,
      sourceProviderInvoiceId: args.sourceProviderInvoiceId,
    });
    let adjusted = 0;
    let released = 0;
    let voided = 0;
    const adjustmentType =
      args.outcome === "funds_reinstated"
        ? "dispute_funds_reinstated"
        : args.outcome === "won"
          ? "dispute_won"
          : "dispute_lost";
    for (const row of rows) {
      if (row.status === "voided") continue;
      await patchCommissionSourceEvidence(ctx, row, {
        sourceProviderInvoiceId: args.sourceProviderInvoiceId,
        sourceProviderPaymentIntentId: args.sourceProviderPaymentIntentId,
        sourceProviderChargeId: args.sourceProviderChargeId,
        nowMs,
      });
      const disputeState = await getDisputeAdjustmentState(ctx, {
        sourceProviderDisputeId: disputeId,
        commissionId: row._id,
      });
      const reversalUsd = calculateProportionalCommissionAdjustmentUsd({
        commissionAmountUsd: row.commissionAmountUsd,
        sourceAmountBaseUnits: args.disputeAmountBaseUnits,
        sourceTotalBaseUnits: args.chargeAmountBaseUnits,
      });
      const targetDisputeImpactUsd =
        row.status === "paid" && args.outcome === "lost" ? -reversalUsd : 0;
      const requestedAmountUsd = roundSignedPartnerMoney(
        targetDisputeImpactUsd - disputeState.currentImpactUsd,
      );
      const amountUsd = requestedAmountUsd < 0
        ? await capNegativeCommissionAdjustmentUsd(ctx, row, requestedAmountUsd)
        : requestedAmountUsd;
      await insertPartnerCommissionAdjustmentIfMissing(ctx, {
        adjustmentKey: `partner_${adjustmentType}:${disputeId}:${String(row._id)}`,
        commission: row,
        adjustmentType,
        amountUsd,
        sourceProviderDisputeId: disputeId,
        sourceProviderChargeId: args.sourceProviderChargeId,
        sourceProviderPaymentIntentId: args.sourceProviderPaymentIntentId,
        sourceProviderInvoiceId: args.sourceProviderInvoiceId,
        reason: `stripe_${adjustmentType}`,
        nowMs,
      });
      adjusted += 1;
      if (row.status !== "paid") {
        if (args.outcome === "lost") {
          await ctx.db.patch(row._id, {
            status: "voided",
            voidedAt: nowMs,
            voidReason: `stripe_dispute_lost:${disputeId}`,
            updatedAt: nowMs,
          });
          voided += 1;
        } else if (row.status === "risk_hold") {
          const nextStatus = riskReleaseStatusForCommission(row, nowMs);
          await ctx.db.patch(row._id, {
            status: nextStatus,
            payableAt: nextStatus === "payable" ? nowMs : row.payableAt,
            updatedAt: nowMs,
          });
          released += 1;
        }
      }
    }
    return { ok: true, matched: rows.length, adjusted, released, voided };
  },
});

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
      if (
        row.basisType === "community_platform_fee" &&
        !row.sourceProviderInvoiceId &&
        !row.sourceProviderPaymentIntentId &&
        !row.sourceProviderChargeId
      ) {
        continue;
      }
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
      bufferedUsd: 0,
      readyUsd: 0,
      paidUsd: 0,
      totalUsd: 0,
      pendingCount: 0,
      payableCount: 0,
      bufferedCount: 0,
      readyCount: 0,
      paidCount: 0,
    };
  }
  const nowMs = Date.now();
  const payoutReadyCutoffAt = nowMs - BUILDER_PARTNER_PAYOUT_BUFFER_MS;
  const statuses = ["pending", "locked", "risk_hold", "payable", "paid"] as const;
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
  const adjustments = await ctx.db
    .query("partnerCommissionAdjustments" as any)
    .withIndex("by_partner_createdAt", (q: any) => q.eq("partnerId", partner._id))
    .collect();
  const payoutItems = await ctx.db
    .query("partnerPayoutItems" as any)
    .withIndex("by_partner_createdAt", (q: any) => q.eq("partnerId", partner._id))
    .collect();
  const rowById = new Map(rows.map((row: any) => [String(row._id), row]));
  const adjustmentTotalByCommissionId = new Map<string, number>();
  for (const adjustment of adjustments) {
    if (adjustment.status !== "applied") continue;
    const commissionId = String(adjustment.commissionId ?? "");
    if (!rowById.has(commissionId)) continue;
    adjustmentTotalByCommissionId.set(
      commissionId,
      roundSignedPartnerMoney(
        Number(adjustmentTotalByCommissionId.get(commissionId) ?? 0) +
        Number(adjustment.amountUsd ?? 0),
      ),
    );
  }
  const reservedOrSettledPayoutTotalByCommissionId = new Map<string, number>();
  const settledPayoutTotalByCommissionId = new Map<string, number>();
  for (const item of payoutItems) {
    const commissionId = String(item.commissionId ?? "");
    if (item.status !== "reserved" && item.status !== "settled") continue;
    if (rowById.has(commissionId)) {
      reservedOrSettledPayoutTotalByCommissionId.set(
        commissionId,
        roundSignedPartnerMoney(
          Number(reservedOrSettledPayoutTotalByCommissionId.get(commissionId) ?? 0) +
          Number(item.amountUsd ?? 0),
        ),
      );
    }
    if (item.status === "settled") {
      settledPayoutTotalByCommissionId.set(
        commissionId,
        roundSignedPartnerMoney(
          Number(settledPayoutTotalByCommissionId.get(commissionId) ?? 0) +
          Number(item.amountUsd ?? 0),
        ),
      );
    }
  }
  const rowNetAmount = (row: any) =>
    Math.max(
      0,
      roundBuilderPartnerMoney(
        Number(row.commissionAmountUsd ?? 0) +
        Number(adjustmentTotalByCommissionId.get(String(row._id)) ?? 0) -
        Number(reservedOrSettledPayoutTotalByCommissionId.get(String(row._id)) ?? 0),
      ),
    );
  const sum = (statusSet: ReadonlySet<string>) =>
    rows
      .filter((row: any) => statusSet.has(String(row.status ?? "")))
      .reduce((total: number, row: any) => total + rowNetAmount(row), 0);
  const pendingSet = new Set(["pending", "locked", "risk_hold"]);
  const payableSet = new Set(["payable"]);
  const paidSet = new Set(["paid"]);
  const pendingUsd = sum(pendingSet);
  const payableUsd = sum(payableSet);
  const payableRows = rows.filter((row: any) =>
    payableSet.has(String(row.status ?? "")) && rowNetAmount(row) > 0,
  );
  const readyPayableRows = payableRows.filter((row: any) =>
    typeof row.payableAt === "number" &&
    Number.isFinite(row.payableAt) &&
    row.payableAt <= payoutReadyCutoffAt,
  );
  const bufferedPayableRows = payableRows.filter((row: any) =>
    !(
      typeof row.payableAt === "number" &&
      Number.isFinite(row.payableAt) &&
      row.payableAt <= payoutReadyCutoffAt
    ),
  );
  const readyUsd = roundBuilderPartnerMoney(
    readyPayableRows.reduce((total: number, row: any) => total + rowNetAmount(row), 0),
  );
  const bufferedUsd = roundBuilderPartnerMoney(
    bufferedPayableRows.reduce((total: number, row: any) => total + rowNetAmount(row), 0),
  );
  const settledPaidUsd = roundBuilderPartnerMoney(
    Array.from(settledPayoutTotalByCommissionId.values()).reduce(
      (total, amount) => total + amount,
      0,
    ),
  );
  const legacyPaidUsd = sum(paidSet);
  const paidUsd = roundBuilderPartnerMoney(settledPaidUsd + legacyPaidUsd);
  return {
    pendingUsd,
    payableUsd,
    bufferedUsd,
    readyUsd,
    paidUsd,
    totalUsd: pendingUsd + payableUsd + paidUsd,
    pendingCount: rows.filter((row: any) => pendingSet.has(String(row.status ?? "")) && rowNetAmount(row) > 0).length,
    payableCount: payableRows.length,
    bufferedCount: bufferedPayableRows.length,
    readyCount: readyPayableRows.length,
    paidCount:
      new Set(
        payoutItems
          .filter((row: any) => row.status === "settled")
          .map((row: any) => String(row.commissionId ?? "")),
      ).size +
      rows.filter((row: any) => paidSet.has(String(row.status ?? "")) && rowNetAmount(row) > 0).length,
  };
}

async function readPayoutHistory(ctx: any, partner: any) {
  if (!partner?._id) {
    return {
      transfers: [],
    };
  }
  const rows = await ctx.db
    .query("partnerPayoutTransfers" as any)
    .withIndex("by_partner_createdAt", (q: any) => q.eq("partnerId", partner._id))
    .collect();
  const visibleRows = rows.filter((row: any) =>
    row.status === "processing" || row.status === "succeeded" || row.status === "failed",
  );
  visibleRows.sort((a: any, b: any) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0));
  return {
    transfers: visibleRows.slice(0, 10).map((row: any) => ({
      id: String(row._id),
      amountUsd: roundBuilderPartnerMoney(Number(row.amountUsd ?? 0)),
      currency: String(row.currency ?? "usd"),
      status: String(row.status ?? "draft"),
      createdAt: Number(row.createdAt ?? 0),
      processedAt: typeof row.processedAt === "number" ? row.processedAt : null,
      failureReason: typeof row.failureReason === "string" && row.failureReason.trim()
        ? row.failureReason.trim().slice(0, 240)
        : null,
    })),
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
      payoutHistory: await readPayoutHistory(ctx, null),
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
    payoutHistory: await readPayoutHistory(ctx, partner),
  };
}

function normalizePayoutLimit(value: unknown): number {
  const limit = Math.floor(Number(value ?? 100));
  if (!Number.isFinite(limit) || limit <= 0) return 100;
  return Math.min(250, limit);
}

function normalizeMinimumPayoutUsd(value: unknown): number {
  const minimumUsd = roundBuilderPartnerMoney(Number(value ?? 0));
  if (!Number.isFinite(minimumUsd) || minimumUsd < 0) return 0;
  return minimumUsd;
}

function normalizePayableCutoffAt(value: unknown, nowMs = Date.now()): number {
  const latestAllowedCutoffAt = nowMs - BUILDER_PARTNER_PAYOUT_BUFFER_MS;
  const cutoffAt = Math.floor(Number(value ?? latestAllowedCutoffAt));
  if (!Number.isFinite(cutoffAt) || cutoffAt <= 0) {
    return latestAllowedCutoffAt;
  }
  return Math.min(cutoffAt, latestAllowedCutoffAt);
}

function usdToSettlementCents(amountUsd: number): number {
  const cents = Math.floor(roundBuilderPartnerMoney(amountUsd) * 100 + 0.000001);
  if (!Number.isFinite(cents) || cents <= 0) return 0;
  return cents;
}

function settlementCentsToUsd(cents: number): number {
  const normalized = Math.floor(Number(cents ?? 0));
  if (!Number.isFinite(normalized) || normalized <= 0) return 0;
  return roundBuilderPartnerMoney(normalized / 100);
}

function usdToStripeCents(amountUsd: number): number {
  const cents = usdToSettlementCents(amountUsd);
  if (cents <= 0) {
    throw new Error("partner_payout_amount_invalid");
  }
  return cents;
}

function normalizePayoutFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.trim().slice(0, 500) || "partner_payout_transfer_failed";
}

async function recordPartnerPayoutAudit(ctx: any, input: {
  eventType:
    | "builder_partner_payout_batch_created"
    | "builder_partner_payout_batch_approved"
    | "builder_partner_payout_batch_voided"
    | "builder_partner_payout_execution_started"
    | "builder_partner_payout_transfer_succeeded"
    | "builder_partner_payout_transfer_failed"
    | "builder_partner_payout_batch_finalized";
  status: "started" | "succeeded" | "failed";
  actorUserId?: unknown;
  subjectUserId?: unknown;
  provider?: "polynet" | "stripe";
  providerObjectId?: string | null;
  metadata?: Record<string, unknown>;
  nowMs?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  const batchId = String(input.metadata?.batchId ?? "unknown");
  const transferId = String(input.metadata?.transferId ?? "");
  await recordCriticalAuditEventBestEffort(ctx, {
    eventKey: [
      input.eventType,
      input.status,
      batchId,
      transferId || "batch",
      nowMs,
    ].join(":"),
    eventType: input.eventType,
    severity: input.status === "failed" ? "warning" : "info",
    status: input.status,
    actorUserId: input.actorUserId,
    subjectUserId: input.subjectUserId,
    provider: input.provider ?? "polynet",
    providerObjectId: input.providerObjectId ?? null,
    metadata: input.metadata,
    createdAt: nowMs,
  });
}

async function readReadyStripeConnectPayoutAccount(ctx: any, userId: any) {
  const rows = await ctx.db
    .query("userStripeConnectAccounts")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  return rows.find((row: any) =>
    row.status === "ready" &&
    row.payoutsEnabled === true &&
    typeof row.stripeAccountId === "string" &&
    row.stripeAccountId.trim(),
  ) ?? null;
}

async function readPartnerPayablePayoutEntries(ctx: any, partner: any, args: {
  payableCutoffAt: number;
}) {
  if (!partner?._id || partner.status !== "active") return [];
  const rows = await ctx.db
    .query("partnerCommissionLedger")
    .withIndex("by_partner_status", (q: any) =>
      q.eq("partnerId", partner._id).eq("status", "payable"),
    )
    .collect();
  const reservedOrSettledStatuses = new Set<PartnerPayoutItemStatus>(["reserved", "settled"]);
  const entries = [];
  for (const row of rows) {
    if (
      typeof row.payableAt !== "number" ||
      !Number.isFinite(row.payableAt) ||
      row.payableAt > args.payableCutoffAt
    ) {
      continue;
    }
    if (normalizeUsdCurrency(row.currency) !== "usd") continue;
    const adjustmentTotalUsd = await readAppliedCommissionAdjustmentTotalUsd(ctx, row._id);
    const reservedOrSettledPayoutUsd = await readCommissionPayoutItemTotalUsd(
      ctx,
      row._id,
      reservedOrSettledStatuses,
    );
    const amountUsd = Math.max(
      0,
      roundBuilderPartnerMoney(
        Number(row.commissionAmountUsd ?? 0) +
        adjustmentTotalUsd -
        reservedOrSettledPayoutUsd,
      ),
    );
    const settlementCents = usdToSettlementCents(amountUsd);
    if (settlementCents <= 0) continue;
    entries.push({
      commissionId: row._id,
      amountUsd: settlementCentsToUsd(settlementCents),
      settlementCents,
      currency: "usd",
    });
  }
  return entries;
}

async function readPartnerPayoutPlans(ctx: any, args: {
  minimumUsd?: number | null;
  limit?: number | null;
  payableCutoffAt?: number | null;
}) {
  const minimumUsd = normalizeMinimumPayoutUsd(args.minimumUsd);
  const limit = normalizePayoutLimit(args.limit);
  const payableCutoffAt = normalizePayableCutoffAt(args.payableCutoffAt);
  const partners = await ctx.db
    .query("builderPartners")
    .withIndex("by_status_createdAt", (q: any) => q.eq("status", "active"))
    .take(limit);
  const plans = [];
  for (const partner of partners) {
    const stripeAccount = await readReadyStripeConnectPayoutAccount(ctx, partner.userId);
    if (!stripeAccount) continue;
    const entries = await readPartnerPayablePayoutEntries(ctx, partner, { payableCutoffAt });
    const amountUsd = roundBuilderPartnerMoney(
      entries.reduce((total: number, entry: any) => total + Number(entry.amountUsd ?? 0), 0),
    );
    if (entries.length <= 0 || amountUsd <= 0) continue;
    if (amountUsd < minimumUsd) continue;
    plans.push({
      partner,
      stripeAccount,
      entries,
      amountUsd,
      currency: "usd",
    });
  }
  return plans;
}

async function readPartnerPayoutBatchSnapshot(ctx: any, batchId: any) {
  const batch = await ctx.db.get(batchId);
  if (!batch) throw new Error("partner_payout_batch_not_found");
  const [transfers, items] = await Promise.all([
    ctx.db
      .query("partnerPayoutTransfers" as any)
      .withIndex("by_batch", (q: any) => q.eq("batchId", batchId))
      .collect(),
    ctx.db
      .query("partnerPayoutItems" as any)
      .withIndex("by_batch", (q: any) => q.eq("batchId", batchId))
      .collect(),
  ]);
  return {
    batch: {
      id: String(batch._id),
      batchKey: String(batch.batchKey ?? ""),
      status: String(batch.status ?? "draft"),
      totalAmountUsd: roundBuilderPartnerMoney(Number(batch.totalAmountUsd ?? 0)),
      currency: String(batch.currency ?? "usd"),
      partnerCount: Number(batch.partnerCount ?? 0),
      itemCount: Number(batch.itemCount ?? 0),
      payableCutoffAt: typeof batch.payableCutoffAt === "number" ? batch.payableCutoffAt : null,
      payoutBufferMs: typeof batch.payoutBufferMs === "number" ? batch.payoutBufferMs : null,
      minimumPayoutUsd: typeof batch.minimumPayoutUsd === "number" ? batch.minimumPayoutUsd : null,
      createdAt: Number(batch.createdAt ?? 0),
      updatedAt: Number(batch.updatedAt ?? 0),
      approvedAt: typeof batch.approvedAt === "number" ? batch.approvedAt : null,
      processedAt: typeof batch.processedAt === "number" ? batch.processedAt : null,
      failureReason: typeof batch.failureReason === "string" ? batch.failureReason : null,
    },
    transfers: transfers.map((row: any) => ({
      id: String(row._id),
      partnerId: String(row.partnerId),
      partnerUserId: String(row.partnerUserId),
      amountUsd: roundBuilderPartnerMoney(Number(row.amountUsd ?? 0)),
      currency: String(row.currency ?? "usd"),
      status: String(row.status ?? "draft"),
      stripeTransferId: typeof row.stripeTransferId === "string" ? row.stripeTransferId : null,
      failureReason: typeof row.failureReason === "string" ? row.failureReason : null,
      processedAt: typeof row.processedAt === "number" ? row.processedAt : null,
      createdAt: Number(row.createdAt ?? 0),
    })),
    items: items.map((row: any) => ({
      id: String(row._id),
      transferId: String(row.transferId),
      partnerId: String(row.partnerId),
      commissionId: String(row.commissionId),
      amountUsd: roundBuilderPartnerMoney(Number(row.amountUsd ?? 0)),
      currency: String(row.currency ?? "usd"),
      status: String(row.status ?? "reserved"),
      createdAt: Number(row.createdAt ?? 0),
    })),
  };
}

async function validatePartnerPayoutBatchStillPayable(ctx: any, batchId: any) {
  const [batch, transfers, items] = await Promise.all([
    ctx.db.get(batchId),
    ctx.db
      .query("partnerPayoutTransfers" as any)
      .withIndex("by_batch", (q: any) => q.eq("batchId", batchId))
      .collect(),
    ctx.db
      .query("partnerPayoutItems" as any)
      .withIndex("by_batch", (q: any) => q.eq("batchId", batchId))
      .collect(),
  ]);
  if (!batch) return { ok: false, reason: "partner_payout_batch_not_found" };
  if (items.some((item: any) => item.status === "voided")) {
    return { ok: false, reason: "partner_payout_batch_has_voided_item" };
  }
  const batchPayableCutoffAt = normalizePayableCutoffAt(
    batch.payableCutoffAt,
    Number(batch.createdAt ?? Date.now()),
  );

  const reservedItems = items.filter((item: any) => item.status === "reserved");
  if (reservedItems.length <= 0) {
    return { ok: false, reason: "partner_payout_batch_no_reserved_items" };
  }

  const itemCentsByTransferId = new Map<string, number>();
  const itemTotalByCommissionId = new Map<string, { commissionId: any; amountUsd: number }>();
  for (const item of reservedItems) {
    const itemCents = usdToSettlementCents(Number(item.amountUsd ?? 0));
    if (itemCents <= 0) {
      return { ok: false, reason: "partner_payout_item_amount_invalid" };
    }
    const transferId = String(item.transferId);
    itemCentsByTransferId.set(
      transferId,
      Number(itemCentsByTransferId.get(transferId) ?? 0) + itemCents,
    );

    const commissionId = String(item.commissionId);
    const existing = itemTotalByCommissionId.get(commissionId) ?? {
      commissionId: item.commissionId,
      amountUsd: 0,
    };
    existing.amountUsd = roundBuilderPartnerMoney(existing.amountUsd + Number(item.amountUsd ?? 0));
    itemTotalByCommissionId.set(commissionId, existing);
  }

  for (const transfer of transfers) {
    if (transfer.status === "succeeded") continue;
    const transferCents = usdToSettlementCents(Number(transfer.amountUsd ?? 0));
    const itemCents = Number(itemCentsByTransferId.get(String(transfer._id)) ?? 0);
    if (transferCents <= 0 || itemCents <= 0 || transferCents !== itemCents) {
      return { ok: false, reason: "partner_payout_transfer_amount_mismatch" };
    }
    const currentStripeAccount = await readReadyStripeConnectPayoutAccount(ctx, transfer.partnerUserId);
    if (
      !currentStripeAccount ||
      String(currentStripeAccount.stripeAccountId) !== String(transfer.stripeAccountId)
    ) {
      return { ok: false, reason: "partner_payout_account_not_ready" };
    }
  }

  const reservedOrSettledStatuses = new Set<PartnerPayoutItemStatus>(["reserved", "settled"]);
  for (const itemTotal of itemTotalByCommissionId.values()) {
    const commission = await ctx.db.get(itemTotal.commissionId);
    if (!commission) {
      return { ok: false, reason: "partner_payout_commission_missing" };
    }
    if (commission.status !== "payable") {
      return { ok: false, reason: "partner_payout_commission_not_payable" };
    }
    if (
      typeof commission.payableAt !== "number" ||
      !Number.isFinite(commission.payableAt) ||
      commission.payableAt > batchPayableCutoffAt
    ) {
      return { ok: false, reason: "partner_payout_commission_inside_payout_buffer" };
    }
    if (normalizeUsdCurrency(commission.currency) !== "usd") {
      return { ok: false, reason: "partner_payout_commission_currency_invalid" };
    }
    const partner = await ctx.db.get(commission.partnerId);
    if (!partner || partner.status !== "active") {
      return { ok: false, reason: "partner_payout_partner_not_active" };
    }
    const adjustmentTotalUsd = await readAppliedCommissionAdjustmentTotalUsd(ctx, commission._id);
    const otherReservedOrSettledPayoutUsd = await readCommissionPayoutItemTotalUsd(
      ctx,
      commission._id,
      reservedOrSettledStatuses,
      batchId,
    );
    const availableUsd = Math.max(
      0,
      roundBuilderPartnerMoney(
        Number(commission.commissionAmountUsd ?? 0) +
        adjustmentTotalUsd -
        otherReservedOrSettledPayoutUsd,
      ),
    );
    const requestedCents = usdToSettlementCents(itemTotal.amountUsd);
    const availableCents = usdToSettlementCents(availableUsd);
    if (requestedCents <= 0 || requestedCents > availableCents) {
      return { ok: false, reason: "partner_payout_stale_payable_balance" };
    }
  }

  return { ok: true, reason: null };
}

async function markPartnerPayoutBatchStale(ctx: any, args: {
  batch: any;
  batchId: any;
  reason: string;
  actorUserId?: any;
  nowMs: number;
}) {
  const failureReason = `stale_payable_balance:${String(args.reason ?? "unknown").slice(0, 220)}`;
  const [transfers, items] = await Promise.all([
    ctx.db
      .query("partnerPayoutTransfers" as any)
      .withIndex("by_batch", (q: any) => q.eq("batchId", args.batchId))
      .collect(),
    ctx.db
      .query("partnerPayoutItems" as any)
      .withIndex("by_batch", (q: any) => q.eq("batchId", args.batchId))
      .collect(),
  ]);
  await ctx.db.patch(args.batchId, {
    status: "failed",
    processedByUserId: args.actorUserId,
    processedAt: args.nowMs,
    failureReason,
    updatedAt: args.nowMs,
  });
  for (const transfer of transfers) {
    if (transfer.status === "succeeded") continue;
    await ctx.db.patch(transfer._id, {
      status: "failed",
      failureReason,
      processedAt: args.nowMs,
      updatedAt: args.nowMs,
    });
  }
  for (const item of items) {
    if (item.status !== "reserved") continue;
    await ctx.db.patch(item._id, {
      status: "voided",
      updatedAt: args.nowMs,
    });
  }
  await recordPartnerPayoutAudit(ctx, {
    eventType: "builder_partner_payout_batch_finalized",
    status: "failed",
    actorUserId: args.actorUserId,
    metadata: {
      batchId: String(args.batchId),
      transferCount: transfers.length,
      failedTransferCount: transfers.filter((transfer: any) => transfer.status !== "succeeded").length,
      totalAmountUsd: Number(args.batch.totalAmountUsd ?? 0),
    },
    nowMs: args.nowMs,
  });
  return { ok: false, reason: failureReason };
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

export const previewPartnerPayoutBatch = query({
  args: {
    authSubject: v.optional(v.string()),
    minimumUsd: v.optional(v.number()),
    limit: v.optional(v.number()),
    payableCutoffAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOperatorRole(ctx, args.authSubject, "operator");
    const payableCutoffAt = normalizePayableCutoffAt(args.payableCutoffAt);
    const plans = await readPartnerPayoutPlans(ctx, {
      minimumUsd: args.minimumUsd ?? null,
      limit: args.limit ?? null,
      payableCutoffAt,
    });
    const totalAmountUsd = roundBuilderPartnerMoney(
      plans.reduce((total: number, plan: any) => total + Number(plan.amountUsd ?? 0), 0),
    );
    return {
      minimumUsd: normalizeMinimumPayoutUsd(args.minimumUsd),
      payableCutoffAt,
      payoutBufferMs: BUILDER_PARTNER_PAYOUT_BUFFER_MS,
      totalAmountUsd,
      partnerCount: plans.length,
      itemCount: plans.reduce((total: number, plan: any) => total + plan.entries.length, 0),
      partners: plans.map((plan: any) => ({
        partnerId: String(plan.partner._id),
        partnerUserId: String(plan.partner.userId),
        code: String(plan.partner.code ?? ""),
        amountUsd: plan.amountUsd,
        currency: plan.currency,
        itemCount: plan.entries.length,
        payoutReady: true,
      })),
    };
  },
});

export const createPartnerPayoutBatch = mutation({
  args: {
    authSubject: v.optional(v.string()),
    batchKey: v.optional(v.string()),
    minimumUsd: v.optional(v.number()),
    limit: v.optional(v.number()),
    payableCutoffAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const operator = await requireOperatorRole(ctx, args.authSubject, "operator");
    const nowMs = Date.now();
    const payableCutoffAt = normalizePayableCutoffAt(args.payableCutoffAt, nowMs);
    const minimumPayoutUsd = normalizeMinimumPayoutUsd(args.minimumUsd);
    const rawBatchKey = String(args.batchKey ?? "").trim();
    const batchKey = rawBatchKey || `partner_payout:${nowMs}:${String(operator.dbUserId)}`;
    const existing = await ctx.db
      .query("partnerPayoutBatches" as any)
      .withIndex("by_batchKey", (q: any) => q.eq("batchKey", batchKey))
      .first();
    if (existing) {
      return await readPartnerPayoutBatchSnapshot(ctx, existing._id);
    }

    const plans = await readPartnerPayoutPlans(ctx, {
      minimumUsd: minimumPayoutUsd,
      limit: args.limit ?? null,
      payableCutoffAt,
    });
    if (plans.length <= 0) {
      throw new Error("partner_payout_batch_empty");
    }
    const totalAmountUsd = roundBuilderPartnerMoney(
      plans.reduce((total: number, plan: any) => total + Number(plan.amountUsd ?? 0), 0),
    );
    const itemCount = plans.reduce((total: number, plan: any) => total + plan.entries.length, 0);
    const batchId = await ctx.db.insert("partnerPayoutBatches" as any, {
      batchKey,
      status: "draft",
      totalAmountUsd,
      currency: "usd",
      partnerCount: plans.length,
      itemCount,
      payableCutoffAt,
      payoutBufferMs: BUILDER_PARTNER_PAYOUT_BUFFER_MS,
      minimumPayoutUsd,
      createdByUserId: operator.dbUserId,
      createdAt: nowMs,
      updatedAt: nowMs,
    });

    for (const plan of plans) {
      const transferId = await ctx.db.insert("partnerPayoutTransfers" as any, {
        batchId,
        partnerId: plan.partner._id,
        partnerUserId: plan.partner.userId,
        stripeAccountId: String(plan.stripeAccount.stripeAccountId).trim(),
        amountUsd: plan.amountUsd,
        currency: "usd",
        status: "draft",
        idempotencyKey: `partner_payout:${String(batchId)}:${String(plan.partner._id)}`,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      for (const entry of plan.entries) {
        await ctx.db.insert("partnerPayoutItems" as any, {
          batchId,
          transferId,
          partnerId: plan.partner._id,
          partnerUserId: plan.partner.userId,
          commissionId: entry.commissionId,
          amountUsd: entry.amountUsd,
          currency: "usd",
          status: "reserved",
          createdAt: nowMs,
          updatedAt: nowMs,
        });
      }
    }

    await recordPartnerPayoutAudit(ctx, {
      eventType: "builder_partner_payout_batch_created",
      status: "succeeded",
      actorUserId: operator.dbUserId,
      metadata: {
        batchId: String(batchId),
        totalAmountUsd,
        partnerCount: plans.length,
        itemCount,
      },
      nowMs,
    });

    return await readPartnerPayoutBatchSnapshot(ctx, batchId);
  },
});

export const getPartnerPayoutBatchForOperator = query({
  args: {
    authSubject: v.optional(v.string()),
    batchId: v.id("partnerPayoutBatches"),
  },
  handler: async (ctx, args) => {
    await requireOperatorRole(ctx, args.authSubject, "operator");
    return await readPartnerPayoutBatchSnapshot(ctx, args.batchId);
  },
});

export const approvePartnerPayoutBatch = mutation({
  args: {
    authSubject: v.optional(v.string()),
    batchId: v.id("partnerPayoutBatches"),
  },
  handler: async (ctx, args) => {
    const operator = await requireOperatorRole(ctx, args.authSubject, "operator");
    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error("partner_payout_batch_not_found");
    if (batch.status !== "draft") throw new Error("partner_payout_batch_not_draft");
    const validation = await validatePartnerPayoutBatchStillPayable(ctx, args.batchId);
    if (!validation.ok) {
      throw new Error(validation.reason ?? "partner_payout_batch_stale");
    }
    const nowMs = Date.now();
    await ctx.db.patch(args.batchId, {
      status: "approved",
      approvedByUserId: operator.dbUserId,
      approvedAt: nowMs,
      updatedAt: nowMs,
    });
    await recordPartnerPayoutAudit(ctx, {
      eventType: "builder_partner_payout_batch_approved",
      status: "succeeded",
      actorUserId: operator.dbUserId,
      metadata: {
        batchId: String(args.batchId),
        totalAmountUsd: Number(batch.totalAmountUsd ?? 0),
        partnerCount: Number(batch.partnerCount ?? 0),
        itemCount: Number(batch.itemCount ?? 0),
      },
      nowMs,
    });
    return await readPartnerPayoutBatchSnapshot(ctx, args.batchId);
  },
});

export const voidPartnerPayoutBatch = mutation({
  args: {
    authSubject: v.optional(v.string()),
    batchId: v.id("partnerPayoutBatches"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const operator = await requireOperatorRole(ctx, args.authSubject, "operator");
    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error("partner_payout_batch_not_found");
    if (batch.status === "processing" || batch.status === "completed") {
      throw new Error("partner_payout_batch_cannot_void");
    }
    const nowMs = Date.now();
    const [transfers, items] = await Promise.all([
      ctx.db
        .query("partnerPayoutTransfers" as any)
        .withIndex("by_batch", (q: any) => q.eq("batchId", args.batchId))
        .collect(),
      ctx.db
        .query("partnerPayoutItems" as any)
        .withIndex("by_batch", (q: any) => q.eq("batchId", args.batchId))
        .collect(),
    ]);
    if (transfers.some((transfer: any) => transfer.status === "succeeded")) {
      throw new Error("partner_payout_batch_has_settled_transfer");
    }
    await ctx.db.patch(args.batchId, {
      status: "voided",
      failureReason: String(args.reason ?? "operator_voided").trim().slice(0, 240),
      updatedAt: nowMs,
    });
    for (const transfer of transfers) {
      if (transfer.status === "succeeded") continue;
      await ctx.db.patch(transfer._id, {
        status: "failed",
        failureReason: "batch_voided",
        updatedAt: nowMs,
      });
    }
    for (const item of items) {
      if (item.status === "settled") continue;
      await ctx.db.patch(item._id, {
        status: "voided",
        updatedAt: nowMs,
      });
    }
    await recordPartnerPayoutAudit(ctx, {
      eventType: "builder_partner_payout_batch_voided",
      status: "succeeded",
      actorUserId: operator.dbUserId,
      metadata: {
        batchId: String(args.batchId),
        reason: String(args.reason ?? "operator_voided").trim().slice(0, 240),
      },
      nowMs,
    });
    return await readPartnerPayoutBatchSnapshot(ctx, args.batchId);
  },
});

export const beginPartnerPayoutBatchExecution = mutation({
  args: {
    authSubject: v.optional(v.string()),
    batchId: v.id("partnerPayoutBatches"),
  },
  handler: async (ctx, args) => {
    const operator = await requireOperatorRole(ctx, args.authSubject, "operator");
    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error("partner_payout_batch_not_found");
    if (batch.status === "draft") throw new Error("partner_payout_batch_not_approved");
    if (batch.status === "voided") throw new Error("partner_payout_batch_voided");
    if (batch.status === "completed") {
      return { transfers: [] };
    }
    const nowMs = Date.now();
    const validation = await validatePartnerPayoutBatchStillPayable(ctx, args.batchId);
    if (!validation.ok) {
      await markPartnerPayoutBatchStale(ctx, {
        batch,
        batchId: args.batchId,
        reason: validation.reason ?? "partner_payout_batch_stale",
        actorUserId: operator.dbUserId,
        nowMs,
      });
      return {
        blocked: true,
        reason: validation.reason ?? "partner_payout_batch_stale",
        transfers: [],
      };
    }
    await ctx.db.patch(args.batchId, {
      status: "processing",
      processedByUserId: operator.dbUserId,
      processedAt: batch.processedAt ?? nowMs,
      failureReason: undefined,
      updatedAt: nowMs,
    });
    const transfers = await ctx.db
      .query("partnerPayoutTransfers" as any)
      .withIndex("by_batch", (q: any) => q.eq("batchId", args.batchId))
      .collect();
    const runnableTransfers = transfers.filter((row: any) =>
      row.status === "draft" || row.status === "failed" || row.status === "processing",
    );
    for (const transfer of runnableTransfers) {
      await ctx.db.patch(transfer._id, {
        status: "processing",
        failureReason: undefined,
        updatedAt: nowMs,
      });
    }
    await recordPartnerPayoutAudit(ctx, {
      eventType: "builder_partner_payout_execution_started",
      status: "started",
      actorUserId: operator.dbUserId,
      metadata: {
        batchId: String(args.batchId),
        transferCount: runnableTransfers.length,
        totalAmountUsd: Number(batch.totalAmountUsd ?? 0),
      },
      nowMs,
    });
    return {
      transfers: runnableTransfers.map((row: any) => ({
        transferId: row._id,
        batchId: row.batchId,
        partnerId: row.partnerId,
        amountUsd: roundBuilderPartnerMoney(Number(row.amountUsd ?? 0)),
        currency: String(row.currency ?? "usd").toLowerCase(),
        stripeAccountId: String(row.stripeAccountId ?? "").trim(),
        idempotencyKey: String(row.idempotencyKey ?? "").trim(),
      })),
    };
  },
});

export const recordPartnerPayoutTransferSucceededInternal = internalMutation({
  args: {
    transferId: v.id("partnerPayoutTransfers"),
    stripeTransferId: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) throw new Error("partner_payout_transfer_not_found");
    if (transfer.status === "succeeded") return { ok: true };
    await ctx.db.patch(args.transferId, {
      status: "succeeded",
      stripeTransferId: args.stripeTransferId,
      failureReason: undefined,
      processedAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    const items = await ctx.db
      .query("partnerPayoutItems" as any)
      .withIndex("by_transfer", (q: any) => q.eq("transferId", args.transferId))
      .collect();
    for (const item of items) {
      await ctx.db.patch(item._id, {
        status: "settled",
        updatedAt: args.nowMs,
      });
    }
    await recordPartnerPayoutAudit(ctx, {
      eventType: "builder_partner_payout_transfer_succeeded",
      status: "succeeded",
      subjectUserId: transfer.partnerUserId,
      provider: "stripe",
      providerObjectId: args.stripeTransferId,
      metadata: {
        batchId: String(transfer.batchId),
        transferId: String(args.transferId),
        amountUsd: Number(transfer.amountUsd ?? 0),
      },
      nowMs: args.nowMs,
    });
    return { ok: true };
  },
});

export const recordPartnerPayoutTransferFailedInternal = internalMutation({
  args: {
    transferId: v.id("partnerPayoutTransfers"),
    failureReason: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) throw new Error("partner_payout_transfer_not_found");
    if (transfer.status === "succeeded") return { ok: true };
    await ctx.db.patch(args.transferId, {
      status: "failed",
      failureReason: args.failureReason.slice(0, 500),
      processedAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    await recordPartnerPayoutAudit(ctx, {
      eventType: "builder_partner_payout_transfer_failed",
      status: "failed",
      subjectUserId: transfer.partnerUserId,
      provider: "stripe",
      metadata: {
        batchId: String(transfer.batchId),
        transferId: String(args.transferId),
        amountUsd: Number(transfer.amountUsd ?? 0),
        errorMessage: args.failureReason.slice(0, 240),
      },
      nowMs: args.nowMs,
    });
    return { ok: true };
  },
});

export const finalizePartnerPayoutBatchExecutionInternal = internalMutation({
  args: {
    batchId: v.id("partnerPayoutBatches"),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error("partner_payout_batch_not_found");
    const transfers = await ctx.db
      .query("partnerPayoutTransfers" as any)
      .withIndex("by_batch", (q: any) => q.eq("batchId", args.batchId))
      .collect();
    const failedTransfers = transfers.filter((row: any) => row.status === "failed");
    const processingTransfers = transfers.filter((row: any) => row.status === "processing");
    const completed = transfers.length > 0 &&
      transfers.every((row: any) => row.status === "succeeded");
    await ctx.db.patch(args.batchId, {
      status: completed ? "completed" : processingTransfers.length > 0 ? "processing" : "failed",
      failureReason: failedTransfers.length > 0 ? `${failedTransfers.length} partner payout transfer(s) failed` : undefined,
      processedAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    await recordPartnerPayoutAudit(ctx, {
      eventType: "builder_partner_payout_batch_finalized",
      status: completed ? "succeeded" : "failed",
      metadata: {
        batchId: String(args.batchId),
        transferCount: transfers.length,
        failedTransferCount: failedTransfers.length,
        totalAmountUsd: Number(batch.totalAmountUsd ?? 0),
      },
      nowMs: args.nowMs,
    });
    return { ok: true };
  },
});

export const executePartnerPayoutBatch = action({
  args: {
    authSubject: v.optional(v.string()),
    batchId: v.id("partnerPayoutBatches"),
  },
  handler: async (ctx, args): Promise<any> => {
    const begin = await ctx.runMutation((api as any).builderPartners.beginPartnerPayoutBatchExecution, {
      authSubject: args.authSubject,
      batchId: args.batchId,
    });
    if (begin?.blocked) {
      return await ctx.runQuery((api as any).builderPartners.getPartnerPayoutBatchForOperator, {
        authSubject: args.authSubject,
        batchId: args.batchId,
      });
    }
    const transfers = Array.isArray(begin?.transfers) ? begin.transfers : [];
    if (transfers.length > 0) {
      const stripe = getStripeClient();
      for (const transfer of transfers) {
        const nowMs = Date.now();
        try {
          if (String(transfer.currency ?? "").toLowerCase() !== "usd") {
            throw new Error("partner_payout_currency_unsupported");
          }
          const stripeTransfer = await stripe.transfers.create(
            {
              amount: usdToStripeCents(Number(transfer.amountUsd ?? 0)),
              currency: "usd",
              destination: String(transfer.stripeAccountId ?? "").trim(),
              description: "Polynet Builder Partner payout",
              metadata: {
                polynet_payout_batch_id: String(args.batchId),
                polynet_partner_id: String(transfer.partnerId),
              },
            },
            {
              idempotencyKey: String(transfer.idempotencyKey ?? "").trim(),
            },
          );
          await ctx.runMutation(
            (internal as any).builderPartners.recordPartnerPayoutTransferSucceededInternal,
            {
              transferId: transfer.transferId,
              stripeTransferId: stripeTransfer.id,
              nowMs,
            },
          );
        } catch (error) {
          await ctx.runMutation(
            (internal as any).builderPartners.recordPartnerPayoutTransferFailedInternal,
            {
              transferId: transfer.transferId,
              failureReason: normalizePayoutFailureReason(error),
              nowMs,
            },
          );
        }
      }
    }
    await ctx.runMutation((internal as any).builderPartners.finalizePartnerPayoutBatchExecutionInternal, {
      batchId: args.batchId,
      nowMs: Date.now(),
    });
    return await ctx.runQuery((api as any).builderPartners.getPartnerPayoutBatchForOperator, {
      authSubject: args.authSubject,
      batchId: args.batchId,
    });
  },
});
