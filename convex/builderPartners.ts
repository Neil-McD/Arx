import { internalAction, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
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
  BUILDER_PARTNER_COMMUNITY_REVENUE_SHARE_BPS,
  BUILDER_PARTNER_PAYOUT_BUFFER_MS,
  BUILDER_PARTNER_PROGRAM_VERSION,
  BUILDER_PARTNER_TERMS_VERSION,
  BUILDER_PARTNER_TOOL_USAGE_POLYNET_RETAINED_REVENUE_BPS,
  BUILDER_PARTNER_TOOL_USAGE_REVENUE_SHARE_BPS,
  calculateBuilderPartnerCommunityRevenueCommission,
  calculateBuilderPartnerToolUsageCommission,
  roundBuilderPartnerMoney,
} from "../shared/builderPartnerProgram";
import { BUILDER_PARTNER_TERMS_DOCUMENT } from "../shared/legalDocuments";
import { buildAttributionRouteLabel } from "../shared/routePrivacy";
import { isCommunityPublishReady } from "../shared/communityPublishReadiness";
import { loadAccountSetupStatusForUserId } from "./accountSetupCore";

type RequirementKey =
  | "account_setup_complete"
  | "own_community"
  | "community_publish_ready"
  | "accept_terms"
  | "account_good_standing";
type ProgramState = "signed_out" | "locked" | "ready_to_unlock" | "active" | "paused" | "disabled";
type PartnerPayoutItemStatus = "reserved" | "settled" | "released";
type PartnerPayoutCycleOperatorStatus =
  | "pending_approval"
  | "approved"
  | "processing"
  | "paid"
  | "held"
  | "failed"
  | "rejected";
type BuilderPartnerStatus = "active" | "paused" | "disabled";
type OperatorPartnerPerformanceRange = "7d" | "30d" | "90d" | "all";

type OperatorPartnerPerformanceAggregate = {
  partnerId: any;
  partnerUserId: any;
  code: string;
  status: BuilderPartnerStatus;
  createdAt: number;
  commissionGeneratedCents: number;
  pendingCents: number;
  readyCents: number;
  paidOutCents: number;
  boundReferrals: number;
  latestCommissionAt: number | null;
};

const BUILDER_PARTNER_MISSING_EVIDENCE_RECHECK_MS = 24 * 60 * 60 * 1000;
const BUILDER_PARTNER_PAYOUT_COMMISSION_SCAN_MULTIPLIER = 20;
const BUILDER_PARTNER_PAYOUT_COMMISSION_MAX_SCAN = 5000;
const BUILDER_PARTNER_OPERATOR_PAYOUT_CYCLE_LIMIT = 24;
const BUILDER_PARTNER_LARGE_PAYOUT_CYCLE_USD = 1000;
const BUILDER_PARTNER_OPERATOR_PERFORMANCE_PARTNER_SCAN_LIMIT = 500;
const BUILDER_PARTNER_OPERATOR_PERFORMANCE_COMMISSION_SCAN_LIMIT = 2000;
const BUILDER_PARTNER_OPERATOR_PERFORMANCE_TRANSFER_SCAN_LIMIT = 1000;
const BUILDER_PARTNER_OPERATOR_PERFORMANCE_TOP_LIMIT = 12;

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
  return "partner";
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

function hasPublishReadyCommunity(communities: any[]): boolean {
  return communities.some((community: any) =>
    isCommunityPublishReady({
      name: community.name,
      oneLiner: community.oneLiner,
      avatarUrl: community.avatarUrl,
      avatarStorageId: community.avatarStorageId,
      bannerUrl: community.bannerUrl,
      bannerStorageId: community.bannerStorageId,
    }),
  );
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

function normalizePartnerPayoutCycleOperatorLimit(value: unknown): number {
  const limit = Math.floor(Number(value ?? BUILDER_PARTNER_OPERATOR_PAYOUT_CYCLE_LIMIT));
  if (!Number.isFinite(limit) || limit <= 0) return BUILDER_PARTNER_OPERATOR_PAYOUT_CYCLE_LIMIT;
  return Math.min(BUILDER_PARTNER_OPERATOR_PAYOUT_CYCLE_LIMIT, limit);
}

function normalizePartnerPerformanceTopLimit(value: unknown): number {
  const limit = Math.floor(Number(value ?? BUILDER_PARTNER_OPERATOR_PERFORMANCE_TOP_LIMIT));
  if (!Number.isFinite(limit) || limit <= 0) return BUILDER_PARTNER_OPERATOR_PERFORMANCE_TOP_LIMIT;
  return Math.min(BUILDER_PARTNER_OPERATOR_PERFORMANCE_TOP_LIMIT * 2, limit);
}

function normalizePartnerPerformanceRange(value: unknown): OperatorPartnerPerformanceRange {
  if (value === "7d") return "7d";
  if (value === "90d") return "90d";
  if (value === "all") return "all";
  return "30d";
}

function normalizePartnerPerformanceRangeStart(
  range: OperatorPartnerPerformanceRange,
  nowMs: number,
): number | null {
  switch (range) {
    case "7d":
      return nowMs - 7 * 86400000;
    case "30d":
      return nowMs - 30 * 86400000;
    case "90d":
      return nowMs - 90 * 86400000;
    case "all":
    default:
      return null;
  }
}

function readBuilderPartnerStatus(value: unknown): BuilderPartnerStatus {
  if (value === "paused") return "paused";
  if (value === "disabled") return "disabled";
  return "active";
}

function createOperatorPartnerPerformanceAggregate(partner: any): OperatorPartnerPerformanceAggregate {
  return {
    partnerId: partner._id,
    partnerUserId: partner.userId,
    code: String(partner.code ?? ""),
    status: readBuilderPartnerStatus(partner.status),
    createdAt: Number(partner.createdAt ?? 0),
    commissionGeneratedCents: 0,
    pendingCents: 0,
    readyCents: 0,
    paidOutCents: 0,
    boundReferrals: 0,
    latestCommissionAt: null,
  };
}

function upsertOperatorPartnerPerformanceAggregate(
  aggregateByPartnerId: Map<string, OperatorPartnerPerformanceAggregate>,
  partner: any,
) {
  const partnerId = String(partner?._id ?? "");
  if (!partnerId) return null;
  const existing = aggregateByPartnerId.get(partnerId);
  if (existing) return existing;
  const aggregate = createOperatorPartnerPerformanceAggregate(partner);
  aggregateByPartnerId.set(partnerId, aggregate);
  return aggregate;
}

function upsertOperatorPartnerPerformanceAggregateFromLedger(
  aggregateByPartnerId: Map<string, OperatorPartnerPerformanceAggregate>,
  args: {
    partnerId: any;
    partnerUserId?: any;
    createdAt?: number | null;
  },
) {
  const key = String(args.partnerId ?? "");
  if (!key) return null;
  const existing = aggregateByPartnerId.get(key);
  if (existing) return existing;
  const aggregate: OperatorPartnerPerformanceAggregate = {
    partnerId: args.partnerId,
    partnerUserId: args.partnerUserId ?? null,
    code: "",
    status: "active",
    createdAt: Number(args.createdAt ?? 0),
    commissionGeneratedCents: 0,
    pendingCents: 0,
    readyCents: 0,
    paidOutCents: 0,
    boundReferrals: 0,
    latestCommissionAt: null,
  };
  aggregateByPartnerId.set(key, aggregate);
  return aggregate;
}

async function readOperatorPartnerBoundReferralCount(ctx: any, partnerId: any) {
  const rows = await ctx.db
    .query("partnerAttributions")
    .withIndex("by_partner_status", (q: any) =>
      q.eq("partnerId", partnerId).eq("status", "bound"),
    )
    .take(1000);
  return rows.length;
}

async function readOperatorPartnerDisplay(ctx: any, userId: any) {
  const user = userId ? await ctx.db.get(userId) : null;
  const displayName = String(user?.displayName ?? "").trim();
  const handle = String(user?.handle ?? user?.normalizedHandle ?? "").trim();
  return {
    displayName: displayName || null,
    handle: handle || null,
  };
}

async function readOperatorPartnerPerformanceIdentity(
  ctx: any,
  aggregate: OperatorPartnerPerformanceAggregate,
) {
  const partner = aggregate.partnerId ? await ctx.db.get(aggregate.partnerId) : null;
  const partnerUserId = partner?.userId ?? aggregate.partnerUserId;
  const display = await readOperatorPartnerDisplay(ctx, partnerUserId);
  return {
    partnerUserId,
    code: String(partner?.code ?? aggregate.code ?? ""),
    status: readBuilderPartnerStatus(partner?.status ?? aggregate.status),
    createdAt: Number(partner?.createdAt ?? aggregate.createdAt ?? 0),
    ...display,
  };
}

function normalizeOperatorDecisionReason(value: unknown, fallback: string): string {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 240);
  return normalized || fallback;
}

function isHeldPartnerPayoutCycle(batch: any): boolean {
  return (
    String(batch?.status ?? "") === "held" ||
    (
      String(batch?.status ?? "") === "failed" &&
      String(batch?.failureReason ?? "").startsWith("held:")
    )
  );
}

function readHeldPartnerPayoutCycleReason(batch: any): string | null {
  if (!isHeldPartnerPayoutCycle(batch)) return null;
  const reason = String(batch?.holdReason ?? "").trim() ||
    String(batch?.failureReason ?? "").replace(/^held:/, "").trim();
  return reason || null;
}

function toPartnerPayoutCycleOperatorStatus(batch: any): PartnerPayoutCycleOperatorStatus {
  const status = String(batch?.status ?? "pending_approval");
  if (status === "pending_approval") return "pending_approval";
  if (status === "approved") return "approved";
  if (status === "processing") return "processing";
  if (status === "paid") return "paid";
  if (status === "rejected") return "rejected";
  if (isHeldPartnerPayoutCycle(batch)) return "held";
  return "failed";
}

function partnerPayoutCycleOperatorSortRank(batch: any): number {
  switch (toPartnerPayoutCycleOperatorStatus(batch)) {
    case "pending_approval":
    case "held":
      return 0;
    case "failed":
      return 1;
    case "approved":
    case "processing":
      return 2;
    case "paid":
    case "rejected":
    default:
      return 3;
  }
}

function hasCommunityRevenueProviderEvidence(row: any): boolean {
  return Boolean(
    normalizeProviderEvidenceId(row?.sourceProviderInvoiceId) ||
    normalizeProviderEvidenceId(row?.sourceProviderPaymentIntentId) ||
    normalizeProviderEvidenceId(row?.sourceProviderChargeId)
  );
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

async function readCommissionSettledPayoutTotalUsd(ctx: any, commissionId: any) {
  return await readCommissionPayoutItemTotalUsd(
    ctx,
    commissionId,
    new Set<PartnerPayoutItemStatus>(["settled"]),
  );
}

type PartnerCommissionSettlementState = {
  commissionSettlementCents: number;
  adjustmentSettlementCents: number;
  reservedSettlementCents: number;
  settledSettlementCents: number;
  netSettlementCents: number;
  openSettlementCents: number;
  payoutOpen: boolean;
  payoutDebt: boolean;
};

function finiteIntegerOrNull(value: unknown): number | null {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return null;
  return Math.trunc(normalized);
}

function readMaterializedPartnerCommissionSettlementState(row: any): PartnerCommissionSettlementState | null {
  const commissionSettlementCents = finiteIntegerOrNull(row?.commissionSettlementCents);
  const adjustmentSettlementCents = finiteIntegerOrNull(row?.adjustmentSettlementCents);
  const reservedSettlementCents = finiteIntegerOrNull(row?.reservedSettlementCents);
  const settledSettlementCents = finiteIntegerOrNull(row?.settledSettlementCents);
  const netSettlementCents = finiteIntegerOrNull(row?.netSettlementCents);
  const openSettlementCents = finiteIntegerOrNull(row?.openSettlementCents);
  if (
    commissionSettlementCents === null ||
    adjustmentSettlementCents === null ||
    reservedSettlementCents === null ||
    settledSettlementCents === null ||
    netSettlementCents === null ||
    openSettlementCents === null ||
    typeof row?.payoutOpen !== "boolean" ||
    typeof row?.payoutDebt !== "boolean"
  ) {
    return null;
  }
  return {
    commissionSettlementCents,
    adjustmentSettlementCents,
    reservedSettlementCents,
    settledSettlementCents,
    netSettlementCents,
    openSettlementCents,
    payoutOpen: row.payoutOpen,
    payoutDebt: row.payoutDebt,
  };
}

async function calculatePartnerCommissionSettlementState(
  ctx: any,
  commission: any,
  args: {
    excludeBatchId?: any;
  } = {},
): Promise<PartnerCommissionSettlementState> {
  const [adjustments, payoutItems] = await Promise.all([
    collectAppliedCommissionAdjustments(ctx, commission._id),
    collectPartnerPayoutItemsByCommission(ctx, commission._id),
  ]);
  const adjustmentSettlementCents = adjustments.reduce(
    (total: number, row: any) => total + signedUsdToSettlementCents(Number(row.amountUsd ?? 0)),
    0,
  );
  const includedPayoutItems = payoutItems.filter((row: any) =>
    args.excludeBatchId ? String(row.batchId) !== String(args.excludeBatchId) : true,
  );
  const reservedSettlementCents = includedPayoutItems
    .filter((row: any) => row.status === "reserved")
    .reduce((total: number, row: any) => total + usdToSettlementCents(Number(row.amountUsd ?? 0)), 0);
  const settledSettlementCents = includedPayoutItems
    .filter((row: any) => row.status === "settled")
    .reduce((total: number, row: any) => total + usdToSettlementCents(Number(row.amountUsd ?? 0)), 0);
  const commissionSettlementCents =
    commission.status === "voided"
      ? 0
      : usdToSettlementCents(Number(commission.commissionAmountUsd ?? 0));
  const netSettlementCents =
    commissionSettlementCents +
    adjustmentSettlementCents -
    reservedSettlementCents -
    settledSettlementCents;
  const openSettlementCents = Math.max(0, netSettlementCents);
  const payoutOpen = commission.status === "payable" && openSettlementCents > 0;
  const payoutDebt = commission.status === "payable" && netSettlementCents < 0;
  return {
    commissionSettlementCents,
    adjustmentSettlementCents,
    reservedSettlementCents,
    settledSettlementCents,
    netSettlementCents,
    openSettlementCents,
    payoutOpen,
    payoutDebt,
  };
}

async function readPartnerCommissionSettlementState(
  ctx: any,
  commission: any,
  args: {
    excludeBatchId?: any;
  } = {},
): Promise<PartnerCommissionSettlementState> {
  if (!args.excludeBatchId) {
    const materialized = readMaterializedPartnerCommissionSettlementState(commission);
    if (materialized) return materialized;
  }
  return await calculatePartnerCommissionSettlementState(ctx, commission, args);
}

async function recomputePartnerCommissionSettlementState(
  ctx: any,
  commissionId: any,
  nowMs = Date.now(),
) {
  const commission = await ctx.db.get(commissionId);
  if (!commission) return null;
  const state = await calculatePartnerCommissionSettlementState(ctx, commission);
  await ctx.db.patch(commission._id, {
    ...state,
    settlementUpdatedAt: nowMs,
    updatedAt: nowMs,
  });
  return {
    commission: await ctx.db.get(commission._id),
    state,
  };
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
    | "dispute_funds_reinstated";
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
  if (existing) {
    await recomputePartnerCommissionSettlementState(ctx, args.commission._id, args.nowMs);
    return existing;
  }
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
  await recomputePartnerCommissionSettlementState(ctx, args.commission._id, args.nowMs);
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
  const base = normalizePartnerCodeBase(user).slice(0, 32).replace(/^-+|-+$/g, "") || "partner";
  if (await codeIsAvailable(ctx, base, existingPartnerId)) return base;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 8);
    const candidate = `${base.slice(0, Math.max(3, 40 - suffix.length))}-${suffix}`;
    if (await codeIsAvailable(ctx, candidate, existingPartnerId)) return candidate;
  }
  throw new Error("builder_partner_code_collision");
}

function buildRequirements(args: {
  accountSetupComplete: boolean;
  ownsCommunity: boolean;
  hasPublishReadyCommunity: boolean;
  acceptedTerms: boolean;
  accountGoodStanding: boolean;
}) {
  return [
    {
      key: "account_setup_complete" as RequirementKey,
      label: "Complete account setup",
      met: args.accountSetupComplete,
      action: "complete_account_setup",
    },
    {
      key: "own_community" as RequirementKey,
      label: "Own a community",
      met: args.ownsCommunity,
      action: "create_community",
    },
    {
      key: "community_publish_ready" as RequirementKey,
      label: "Finish a publish-ready community",
      met: args.hasPublishReadyCommunity,
      action: args.ownsCommunity ? "finish_community_setup" : "create_community",
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

async function recordBuilderPartnerTermsAcceptance(ctx: any, args: {
  userId: any;
  acceptedAt: number;
}) {
  const existing = await (ctx.db as any)
    .query("legalAcceptances")
    .withIndex("by_user_document_version", (q: any) =>
      q
        .eq("userId", args.userId)
        .eq("documentKey", BUILDER_PARTNER_TERMS_DOCUMENT.key)
        .eq("documentVersion", BUILDER_PARTNER_TERMS_DOCUMENT.version),
    )
    .first();
  if (existing) return existing._id;
  return await (ctx.db as any).insert("legalAcceptances", {
    userId: args.userId,
    documentKey: BUILDER_PARTNER_TERMS_DOCUMENT.key,
    documentVersion: BUILDER_PARTNER_TERMS_DOCUMENT.version,
    acceptedAt: args.acceptedAt,
    source: "builder_partner_unlock",
    createdAt: args.acceptedAt,
  });
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
  const [partner, ownedCommunities, accountSetup] = await Promise.all([
    args.partner === undefined ? getPartnerByUserId(ctx, args.userId) : args.partner,
    args.ownedCommunities === undefined
      ? listOwnedCommunities(ctx, args.userId)
      : args.ownedCommunities,
    loadAccountSetupStatusForUserId(ctx, args.userId),
  ]);
  const accountSetupComplete = accountSetup.completed;
  const ownsCommunity = ownedCommunities.length > 0;
  const hasPublishReadyOwnedCommunity = hasPublishReadyCommunity(ownedCommunities);
  const acceptedTerms = hasAcceptedCurrentTerms(partner);
  const accountGoodStanding = partner?.status !== "disabled";
  const requirements = buildRequirements({
    accountSetupComplete,
    ownsCommunity,
    hasPublishReadyCommunity: hasPublishReadyOwnedCommunity,
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
          : accountSetupComplete && ownsCommunity && hasPublishReadyOwnedCommunity && !acceptedTerms && accountGoodStanding
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
    if (!partner || partner.status !== "active" || !hasAcceptedCurrentTerms(partner)) continue;
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
  basisType: "community_platform_fee" | "community_revenue" | "paid_tool_usage";
  basisAmountUsd: number;
  commissionRateBps: number;
  commissionAmountUsd: number;
  sourceCheckoutSessionId?: string;
  sourceProviderSubscriptionId?: string;
  sourceProviderInvoiceId?: string;
  sourceProviderPaymentIntentId?: string;
  sourceProviderChargeId?: string;
  nowMs: number;
}) {
  const existing = await getCommissionByKey(ctx, args.commissionKey);
  if (existing) return existing;
  const basisAmountUsd = roundBuilderPartnerMoney(args.basisAmountUsd);
  const commissionAmountUsd = roundBuilderPartnerMoney(args.commissionAmountUsd);
  if (!(basisAmountUsd > 0) || !(commissionAmountUsd > 0)) return null;
  const commissionSettlementCents = usdToSettlementCents(commissionAmountUsd);
  if (commissionSettlementCents <= 0) return null;
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
    commissionSettlementCents,
    adjustmentSettlementCents: 0,
    reservedSettlementCents: 0,
    settledSettlementCents: 0,
    netSettlementCents: commissionSettlementCents,
    openSettlementCents: commissionSettlementCents,
    payoutOpen: false,
    payoutDebt: false,
    settlementUpdatedAt: args.nowMs,
    status: "locked",
    sourceCheckoutSessionId: args.sourceCheckoutSessionId,
    sourceProviderSubscriptionId: args.sourceProviderSubscriptionId,
    sourceProviderInvoiceId: args.sourceProviderInvoiceId,
    sourceProviderPaymentIntentId: args.sourceProviderPaymentIntentId,
    sourceProviderChargeId: args.sourceProviderChargeId,
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
    ? `community_revenue:invoice:${sourceProviderInvoiceId}`
    : `community_revenue:${sourceCheckoutSessionId}`;
  const legacyCommissionKey = sourceProviderInvoiceId
    ? `community_platform_fee:invoice:${sourceProviderInvoiceId}`
    : `community_platform_fee:${sourceCheckoutSessionId}`;
  const existing = await getCommissionByKey(ctx, commissionKey) ?? await getCommissionByKey(ctx, legacyCommissionKey);
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
    partnerCommunityRevenueShareBps: BUILDER_PARTNER_COMMUNITY_REVENUE_SHARE_BPS,
  });
  return await insertPartnerCommissionIfEligible(ctx, {
    commissionKey,
    partner: match.partner,
    attribution: match.attribution,
    referredUserId,
    referredCommunityId: args.communityId,
    basisType: "community_revenue",
    basisAmountUsd: communityRevenueUsd,
    commissionRateBps: BUILDER_PARTNER_COMMUNITY_REVENUE_SHARE_BPS,
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

export async function recordPaidToolUsagePartnerCommission(ctx: any, args: {
  referredUserId: any;
  creditKey: string;
  polynetPriceUsd?: number | null;
  rawVendorCostUsd?: number | null;
  nowMs?: number;
}) {
  const nowMs = args.nowMs ?? Date.now();
  const creditKey = String(args.creditKey ?? "").trim();
  if (!creditKey) return null;
  const commissionKey = `paid_tool_usage:${creditKey}`;
  const existing = await getCommissionByKey(ctx, commissionKey);
  if (existing) return existing;

  const match = await findBoundPartnerAttributionForCommission(ctx, {
    referredUserId: args.referredUserId,
    nowMs,
    requireCommunityRevenueEligibility: true,
  });
  if (!match) return null;

  if (
    typeof args.polynetPriceUsd !== "number" ||
    !Number.isFinite(args.polynetPriceUsd) ||
    typeof args.rawVendorCostUsd !== "number" ||
    !Number.isFinite(args.rawVendorCostUsd)
  ) {
    return null;
  }
  const commission = calculateBuilderPartnerToolUsageCommission({
    polynetPriceUsd: args.polynetPriceUsd,
    rawVendorCostUsd: args.rawVendorCostUsd,
    partnerToolUsageRevenueShareBps: BUILDER_PARTNER_TOOL_USAGE_REVENUE_SHARE_BPS,
    polynetRetainedRevenueBps: BUILDER_PARTNER_TOOL_USAGE_POLYNET_RETAINED_REVENUE_BPS,
  });
  if (!(commission.toolRevenueUsd > 0) || !(commission.commissionAmountUsd > 0)) {
    return null;
  }

  return await insertPartnerCommissionIfEligible(ctx, {
    commissionKey,
    partner: match.partner,
    attribution: match.attribution,
    referredUserId: args.referredUserId,
    basisType: "paid_tool_usage",
    basisAmountUsd: commission.toolRevenueUsd,
    commissionRateBps: commission.effectiveToolUsageRevenueShareBps,
    commissionAmountUsd: commission.commissionAmountUsd,
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
      const settledPayoutUsd = await readCommissionSettledPayoutTotalUsd(ctx, row._id);
      const hasSettledPayout = settledPayoutUsd > 0;
      const requestedAmountUsd = hasSettledPayout || !isFullReversal ? -reversalUsd : 0;
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
      if (!hasSettledPayout && isFullReversal) {
        await ctx.db.patch(row._id, {
          status: "voided",
          voidedAt: nowMs,
          voidReason: `stripe_refund:${refundId}`,
          updatedAt: nowMs,
        });
        await recomputePartnerCommissionSettlementState(ctx, row._id, nowMs);
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
      const settledPayoutUsd = await readCommissionSettledPayoutTotalUsd(ctx, row._id);
      const hasSettledPayout = settledPayoutUsd > 0;
      const requestedAmountUsd =
        hasSettledPayout && !disputeState.hasTerminalAdjustment
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
      if (!hasSettledPayout && row.status !== "risk_hold") {
        await ctx.db.patch(row._id, {
          status: "risk_hold",
          updatedAt: nowMs,
        });
        await recomputePartnerCommissionSettlementState(ctx, row._id, nowMs);
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
      const settledPayoutUsd = await readCommissionSettledPayoutTotalUsd(ctx, row._id);
      const hasSettledPayout = settledPayoutUsd > 0;
      const targetDisputeImpactUsd =
        hasSettledPayout && args.outcome === "lost" ? -reversalUsd : 0;
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
      if (!hasSettledPayout) {
        if (args.outcome === "lost") {
          await ctx.db.patch(row._id, {
            status: "voided",
            voidedAt: nowMs,
            voidReason: `stripe_dispute_lost:${disputeId}`,
            updatedAt: nowMs,
          });
          await recomputePartnerCommissionSettlementState(ctx, row._id, nowMs);
          voided += 1;
        } else if (row.status === "risk_hold") {
          const nextStatus = riskReleaseStatusForCommission(row, nowMs);
          await ctx.db.patch(row._id, {
            status: nextStatus,
            payableAt: nextStatus === "payable" ? nowMs : row.payableAt,
            updatedAt: nowMs,
          });
          await recomputePartnerCommissionSettlementState(ctx, row._id, nowMs);
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
    const limit = Math.max(1, Math.min(250, Math.floor(args.limit ?? 50)));
    const rows = await ctx.db
      .query("partnerCommissionLedger")
      .withIndex("by_status_holdUntil", (q: any) =>
        q.eq("status", "locked").lte("holdUntil", nowMs),
      )
      .take(limit);

    let advanced = 0;
    let deferredForEvidence = 0;
    for (const row of rows) {
      if (row.status !== "locked" || Number(row.holdUntil ?? Infinity) > nowMs) continue;
      if (
        (row.basisType === "community_platform_fee" || row.basisType === "community_revenue") &&
        !hasCommunityRevenueProviderEvidence(row)
      ) {
        await ctx.db.patch(row._id, {
          holdUntil: nowMs + BUILDER_PARTNER_MISSING_EVIDENCE_RECHECK_MS,
          updatedAt: nowMs,
        });
        deferredForEvidence += 1;
        continue;
      }
      await ctx.db.patch(row._id, {
        status: "payable",
        payableAt: nowMs,
        updatedAt: nowMs,
      });
      await recomputePartnerCommissionSettlementState(ctx, row._id, nowMs);
      advanced += 1;
    }
    return {
      ok: true,
      advanced,
      deferredForEvidence,
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
      bufferedUsd: 0,
      readyUsd: 0,
      paidUsd: 0,
      totalUsd: 0,
      clawbackDebtUsd: 0,
      pendingCount: 0,
      bufferedCount: 0,
      readyCount: 0,
      paidCount: 0,
      clawbackDebtCount: 0,
    };
  }
  const nowMs = Date.now();
  const payoutReadyCutoffAt = nowMs - BUILDER_PARTNER_PAYOUT_BUFFER_MS;
  const statuses = ["locked", "risk_hold", "payable"] as const;
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
  const settlementStateByCommissionId = new Map<string, PartnerCommissionSettlementState>();
  for (const row of rows) {
    settlementStateByCommissionId.set(
      String(row._id),
      await readPartnerCommissionSettlementState(ctx, row),
    );
  }
  const rowSettlementState = (row: any) =>
    settlementStateByCommissionId.get(String(row._id)) ?? {
      commissionSettlementCents: 0,
      adjustmentSettlementCents: 0,
      reservedSettlementCents: 0,
      settledSettlementCents: 0,
      netSettlementCents: 0,
      openSettlementCents: 0,
      payoutOpen: false,
      payoutDebt: false,
    };
  const rowNetSettlementCents = (row: any) => rowSettlementState(row).netSettlementCents;
  const rowPositiveSettlementCents = (row: any) => rowSettlementState(row).openSettlementCents;
  const sumPositiveCents = (statusSet: ReadonlySet<string>) =>
    rows
      .filter((row: any) => statusSet.has(String(row.status ?? "")))
      .reduce((total: number, row: any) => total + rowPositiveSettlementCents(row), 0);
  const sortPayableCandidates = (candidates: Array<{ row: any; settlementCents: number }>) =>
    candidates.sort(
      (a, b) =>
        Number(a.row.payableAt ?? 0) - Number(b.row.payableAt ?? 0) ||
        Number(a.row.createdAt ?? 0) - Number(b.row.createdAt ?? 0) ||
        String(a.row._id).localeCompare(String(b.row._id)),
    );
  const netPayoutCandidates = (
    candidates: Array<{ row: any; settlementCents: number }>,
    debtCents: number,
  ) => {
    let remainingDebtCents = debtCents;
    let totalCents = 0;
    let count = 0;
    for (const candidate of candidates) {
      const offsetCents = Math.min(remainingDebtCents, candidate.settlementCents);
      remainingDebtCents -= offsetCents;
      const netCents = candidate.settlementCents - offsetCents;
      if (netCents <= 0) continue;
      totalCents += netCents;
      count += 1;
    }
    return { totalCents, count, remainingDebtCents };
  };
  const pendingSet = new Set(["locked", "risk_hold"]);
  const payableSet = new Set(["payable"]);
  const pendingUsd = settlementCentsToUsd(sumPositiveCents(pendingSet));
  const payableRows = rows.filter((row: any) => payableSet.has(String(row.status ?? "")));
  const clawbackDebtCents = payableRows.reduce((total: number, row: any) => {
    const netCents = rowNetSettlementCents(row);
    return netCents < 0 ? total + Math.abs(netCents) : total;
  }, 0);
  const payablePositiveCandidates = payableRows
    .map((row: any) => ({ row, settlementCents: rowPositiveSettlementCents(row) }))
    .filter((candidate) => candidate.settlementCents > 0);
  const readyPayableCandidates = sortPayableCandidates(
    payablePositiveCandidates.filter(
      (candidate) =>
        typeof candidate.row.payableAt === "number" &&
        Number.isFinite(candidate.row.payableAt) &&
        candidate.row.payableAt <= payoutReadyCutoffAt,
    ),
  );
  const bufferedPayableCandidates = sortPayableCandidates(
    payablePositiveCandidates.filter(
      (candidate) =>
        !(
          typeof candidate.row.payableAt === "number" &&
          Number.isFinite(candidate.row.payableAt) &&
          candidate.row.payableAt <= payoutReadyCutoffAt
        ),
    ),
  );
  const readyNet = netPayoutCandidates(readyPayableCandidates, clawbackDebtCents);
  const bufferedNet = netPayoutCandidates(bufferedPayableCandidates, readyNet.remainingDebtCents);
  const readyUsd = settlementCentsToUsd(readyNet.totalCents);
  const bufferedUsd = settlementCentsToUsd(bufferedNet.totalCents);
  const clawbackDebtUsd = settlementCentsToUsd(clawbackDebtCents);
  const settledPaidCents = rows.reduce(
    (total: number, row: any) => total + rowSettlementState(row).settledSettlementCents,
    0,
  );
  const paidUsd = settlementCentsToUsd(settledPaidCents);
  return {
    pendingUsd,
    bufferedUsd,
    readyUsd,
    paidUsd,
    totalUsd: roundBuilderPartnerMoney(pendingUsd + bufferedUsd + readyUsd + paidUsd),
    clawbackDebtUsd,
    pendingCount: rows.filter((row: any) => pendingSet.has(String(row.status ?? "")) && rowPositiveSettlementCents(row) > 0).length,
    bufferedCount: bufferedNet.count,
    readyCount: readyNet.count,
    paidCount: rows.filter((row: any) => rowSettlementState(row).settledSettlementCents > 0).length,
    clawbackDebtCount: payableRows.filter((row: any) => rowNetSettlementCents(row) < 0).length,
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
      status: String(row.status ?? "pending"),
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
      requirements: [],
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

function normalizePayoutCommissionScanLimit(value: unknown): number {
  const payoutLimit = normalizePayoutLimit(value);
  return Math.min(
    BUILDER_PARTNER_PAYOUT_COMMISSION_MAX_SCAN,
    Math.max(payoutLimit, payoutLimit * BUILDER_PARTNER_PAYOUT_COMMISSION_SCAN_MULTIPLIER),
  );
}

function normalizePayableCutoffAt(value: unknown, nowMs = Date.now()): number {
  const latestAllowedCutoffAt = nowMs - BUILDER_PARTNER_PAYOUT_BUFFER_MS;
  const cutoffAt = Math.floor(Number(value ?? latestAllowedCutoffAt));
  if (!Number.isFinite(cutoffAt) || cutoffAt <= 0) {
    return latestAllowedCutoffAt;
  }
  return Math.min(cutoffAt, latestAllowedCutoffAt);
}

function buildPartnerPayoutCyclePeriod(nowMs: number): string {
  const date = new Date(Number.isFinite(nowMs) ? nowMs : Date.now());
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function normalizePartnerPayoutCyclePeriod(value: unknown, nowMs: number): string {
  const normalized = String(value ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(normalized)) return normalized;
  return buildPartnerPayoutCyclePeriod(nowMs);
}

function buildPartnerPayoutCycleKey(cyclePeriod: string, runNumber: number): string {
  return `partner_payout_cycle:${cyclePeriod}:run:${Math.max(1, Math.floor(runNumber))}`;
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

function signedUsdToSettlementCents(amountUsd: number): number {
  const normalized = roundSignedPartnerMoney(Number(amountUsd ?? 0));
  if (!Number.isFinite(normalized)) return 0;
  if (normalized > 0) return Math.floor(normalized * 100 + 0.000001);
  if (normalized < 0) return Math.ceil(normalized * 100 - 0.000001);
  return 0;
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
    | "builder_partner_payout_cycle_retried"
    | "builder_partner_payout_cycle_held"
    | "builder_partner_payout_cycle_rejected"
    | "builder_partner_payout_execution_started"
    | "builder_partner_payout_transfer_succeeded"
    | "builder_partner_payout_transfer_failed"
    | "builder_partner_payout_batch_finalized";
  status: "started" | "succeeded" | "failed" | "blocked";
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
  excludeBatchId?: any;
}) {
  if (!partner?._id || partner.status !== "active") return [];
  const [openRows, debtRows] = await Promise.all([
    ctx.db
      .query("partnerCommissionLedger")
      .withIndex("by_partner_status_payoutOpen_payableAt", (q: any) =>
        q.eq("partnerId", partner._id)
          .eq("status", "payable")
          .eq("payoutOpen", true)
          .lte("payableAt", args.payableCutoffAt),
      )
      .collect(),
    ctx.db
      .query("partnerCommissionLedger")
      .withIndex("by_partner_status_payoutDebt", (q: any) =>
        q.eq("partnerId", partner._id).eq("status", "payable").eq("payoutDebt", true),
      )
      .collect(),
  ]);
  const rowById = new Map<string, any>();
  for (const row of [...openRows, ...debtRows]) {
    rowById.set(String(row._id), row);
  }
  const rows = Array.from(rowById.values());
  const candidates = [];
  let carryforwardDebtCents = 0;
  for (const row of rows) {
    if (normalizeUsdCurrency(row.currency) !== "usd") continue;
    const settlementState = await readPartnerCommissionSettlementState(ctx, row, {
      excludeBatchId: args.excludeBatchId,
    });
    const netSettlementCents = settlementState.netSettlementCents;
    if (netSettlementCents < 0) {
      carryforwardDebtCents += Math.abs(netSettlementCents);
      continue;
    }
    if (netSettlementCents <= 0) continue;
    if (
      typeof row.payableAt !== "number" ||
      !Number.isFinite(row.payableAt) ||
      row.payableAt > args.payableCutoffAt
    ) {
      continue;
    }
    candidates.push({
      commissionId: row._id,
      settlementCents: settlementState.openSettlementCents,
      payableAt: Number(row.payableAt ?? 0),
      createdAt: Number(row.createdAt ?? 0),
    });
  }
  candidates.sort(
    (a, b) =>
      a.payableAt - b.payableAt ||
      a.createdAt - b.createdAt ||
      String(a.commissionId).localeCompare(String(b.commissionId)),
  );
  const entries = [];
  for (const candidate of candidates) {
    const offsetCents = Math.min(carryforwardDebtCents, candidate.settlementCents);
    carryforwardDebtCents -= offsetCents;
    const settlementCents = candidate.settlementCents - offsetCents;
    if (settlementCents <= 0) continue;
    entries.push({
      commissionId: candidate.commissionId,
      amountUsd: settlementCentsToUsd(settlementCents),
      settlementCents,
      currency: "usd",
    });
  }
  return entries;
}

async function readPartnerPayoutPlans(ctx: any, args: {
  limit?: number | null;
  payableCutoffAt?: number | null;
}) {
  const limit = normalizePayoutLimit(args.limit);
  const scanLimit = normalizePayoutCommissionScanLimit(args.limit);
  const payableCutoffAt = normalizePayableCutoffAt(args.payableCutoffAt);
  const openRows = await ctx.db
    .query("partnerCommissionLedger")
    .withIndex("by_status_payoutOpen_payableAt", (q: any) =>
      q.eq("status", "payable").eq("payoutOpen", true).lte("payableAt", payableCutoffAt),
    )
    .take(scanLimit);
  const payableRows = [...openRows].sort(
    (a: any, b: any) =>
      Number(a.payableAt ?? 0) - Number(b.payableAt ?? 0) ||
      Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0) ||
      String(a._id).localeCompare(String(b._id)),
  );
  const partnerIds = [];
  const seenPartnerIds = new Set<string>();
  for (const row of payableRows) {
    if (
      typeof row.payableAt !== "number" ||
      !Number.isFinite(row.payableAt) ||
      normalizeUsdCurrency(row.currency) !== "usd"
    ) {
      continue;
    }
    const partnerId = String(row.partnerId ?? "");
    if (!partnerId || seenPartnerIds.has(partnerId)) continue;
    seenPartnerIds.add(partnerId);
    partnerIds.push(row.partnerId);
  }
  const plans = [];
  for (const partnerId of partnerIds) {
    if (plans.length >= limit) break;
    const partner = await ctx.db.get(partnerId);
    if (!partner || partner.status !== "active") continue;
    const stripeAccount = await readReadyStripeConnectPayoutAccount(ctx, partner.userId);
    if (!stripeAccount) continue;
    const entries = await readPartnerPayablePayoutEntries(ctx, partner, {
      payableCutoffAt,
    });
    const amountUsd = roundBuilderPartnerMoney(
      entries.reduce((total: number, entry: any) => total + Number(entry.amountUsd ?? 0), 0),
    );
    if (entries.length <= 0 || amountUsd <= 0) continue;
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

function readPartnerPayoutCycleSummary(batch: any) {
  return {
    id: String(batch._id),
    cycleKey: String(batch.batchKey ?? ""),
    status: toPartnerPayoutCycleOperatorStatus(batch),
    totalAmountUsd: roundBuilderPartnerMoney(Number(batch.totalAmountUsd ?? 0)),
    currency: String(batch.currency ?? "usd").toLowerCase(),
    partnerCount: Number(batch.partnerCount ?? 0),
    itemCount: Number(batch.itemCount ?? 0),
    payableCutoffAt: typeof batch.payableCutoffAt === "number" ? batch.payableCutoffAt : null,
    payoutBufferMs: typeof batch.payoutBufferMs === "number" ? batch.payoutBufferMs : null,
    createdAt: Number(batch.createdAt ?? 0),
    updatedAt: Number(batch.updatedAt ?? 0),
  };
}

async function readPartnerPayoutCycleRowsForPeriod(ctx: any, cyclePeriod: string) {
  return await ctx.db
    .query("partnerPayoutBatches" as any)
    .withIndex("by_cyclePeriod_runNumber", (q: any) => q.eq("cyclePeriod", cyclePeriod))
    .order("desc")
    .take(100);
}

function readPartnerPayoutCycleRunNumber(row: any): number {
  const explicit = Number(row?.runNumber ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);
  const key = String(row?.batchKey ?? "");
  const match = key.match(/:run:(\d+)$/);
  if (match?.[1]) return Math.max(1, Math.floor(Number(match[1])));
  return 0;
}

async function partnerPayoutCycleHasReservedItems(ctx: any, batchId: any): Promise<boolean> {
  const rows = await ctx.db
    .query("partnerPayoutItems" as any)
    .withIndex("by_batch", (q: any) => q.eq("batchId", batchId))
    .collect();
  return rows.some((row: any) => row.status === "reserved");
}

async function isActivePartnerPayoutCycleForGeneration(ctx: any, row: any): Promise<boolean> {
  const status = toPartnerPayoutCycleOperatorStatus(row);
  if (
    status === "pending_approval" ||
    status === "held" ||
    status === "approved" ||
    status === "processing"
  ) {
    return true;
  }
  if (status === "failed") {
    return await partnerPayoutCycleHasReservedItems(ctx, row._id);
  }
  return false;
}

async function findActivePartnerPayoutCycleForGeneration(ctx: any, rows: any[]) {
  const sortedRows = [...rows].sort(
    (a: any, b: any) =>
      Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0) ||
      String(b._id).localeCompare(String(a._id)),
  );
  for (const row of sortedRows) {
    if (await isActivePartnerPayoutCycleForGeneration(ctx, row)) return row;
  }
  return null;
}

async function findLatestReplaceablePartnerPayoutCycle(ctx: any, rows: any[]) {
  const sortedRows = [...rows].sort(
    (a: any, b: any) =>
      Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0) ||
      String(b._id).localeCompare(String(a._id)),
  );
  for (const row of sortedRows) {
    if (!(await isActivePartnerPayoutCycleForGeneration(ctx, row))) return row;
  }
  return null;
}

function readNextPartnerPayoutCycleRunNumber(rows: any[]): number {
  const maxRunNumber = rows.reduce(
    (max: number, row: any) => Math.max(max, readPartnerPayoutCycleRunNumber(row)),
    0,
  );
  return Math.max(1, maxRunNumber + 1);
}

async function readPartnerPayoutCycleRiskFlags(ctx: any, args: {
  batch: any;
  transfers: any[];
  items: any[];
}) {
  const flags = new Set<string>();
  if (Number(args.batch?.totalAmountUsd ?? 0) >= BUILDER_PARTNER_LARGE_PAYOUT_CYCLE_USD) {
    flags.add("large_cycle");
  }
  if (toPartnerPayoutCycleOperatorStatus(args.batch) === "failed") {
    flags.add("failed_cycle");
  }
  for (const transfer of args.transfers) {
    const partner = await ctx.db.get(transfer.partnerId);
    if (!partner || String(partner.status ?? "") !== "active") {
      flags.add("partner_not_active");
    }
    const currentStripeAccount = await readReadyStripeConnectPayoutAccount(ctx, transfer.partnerUserId);
    if (
      !currentStripeAccount ||
      String(currentStripeAccount.stripeAccountId) !== String(transfer.stripeAccountId)
    ) {
      flags.add("payout_account_not_ready");
    }
  }
  for (const item of args.items.slice(0, 50)) {
    const adjustmentTotalUsd = await readAppliedCommissionAdjustmentTotalUsd(ctx, item.commissionId);
    if (adjustmentTotalUsd < 0) {
      flags.add("refund_or_dispute_adjustment");
      break;
    }
  }
  return Array.from(flags);
}

async function readPartnerPayoutCycleOperatorRow(ctx: any, batch: any) {
  const [transfers, items] = await Promise.all([
    ctx.db
      .query("partnerPayoutTransfers" as any)
      .withIndex("by_batch", (q: any) => q.eq("batchId", batch._id))
      .collect(),
    ctx.db
      .query("partnerPayoutItems" as any)
      .withIndex("by_batch", (q: any) => q.eq("batchId", batch._id))
      .collect(),
  ]);
  const operatorStatus = toPartnerPayoutCycleOperatorStatus(batch);
  const riskFlags = await readPartnerPayoutCycleRiskFlags(ctx, {
    batch,
    transfers,
    items,
  });
  return {
    id: String(batch._id),
    cycleKey: String(batch.batchKey ?? ""),
    status: operatorStatus,
    totalAmountUsd: roundBuilderPartnerMoney(Number(batch.totalAmountUsd ?? 0)),
    currency: String(batch.currency ?? "usd").toLowerCase(),
    partnerCount: Number(batch.partnerCount ?? 0),
    itemCount: Number(batch.itemCount ?? 0),
    transferCount: transfers.length,
    payableCutoffAt: typeof batch.payableCutoffAt === "number" ? batch.payableCutoffAt : null,
    payoutBufferMs: typeof batch.payoutBufferMs === "number" ? batch.payoutBufferMs : null,
    createdAt: Number(batch.createdAt ?? 0),
    updatedAt: Number(batch.updatedAt ?? 0),
    approvedAt: typeof batch.approvedAt === "number" ? batch.approvedAt : null,
    processedAt: typeof batch.processedAt === "number" ? batch.processedAt : null,
    failureReason: operatorStatus === "failed" && typeof batch.failureReason === "string"
      ? batch.failureReason
      : null,
    holdReason: readHeldPartnerPayoutCycleReason(batch),
    riskFlags,
    actions: {
      canApprove: operatorStatus === "pending_approval" || operatorStatus === "held",
      canRetry: operatorStatus === "failed" && items.some((item: any) => item.status === "reserved"),
      canHold: operatorStatus === "pending_approval",
      canReject: operatorStatus === "pending_approval" || operatorStatus === "held" || operatorStatus === "failed",
    },
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
  if (items.some((item: any) => item.status === "released")) {
    return { ok: false, reason: "partner_payout_batch_has_released_item" };
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

  const transferCentsByPartnerId = new Map<string, { partnerId: any; settlementCents: number }>();
  for (const transfer of transfers) {
    if (transfer.status === "succeeded") continue;
    const transferCents = usdToSettlementCents(Number(transfer.amountUsd ?? 0));
    const itemCents = Number(itemCentsByTransferId.get(String(transfer._id)) ?? 0);
    if (transferCents <= 0 || itemCents <= 0 || transferCents !== itemCents) {
      return { ok: false, reason: "partner_payout_transfer_amount_mismatch" };
    }
    const partnerKey = String(transfer.partnerId);
    const partnerTotal = transferCentsByPartnerId.get(partnerKey) ?? {
      partnerId: transfer.partnerId,
      settlementCents: 0,
    };
    partnerTotal.settlementCents += transferCents;
    transferCentsByPartnerId.set(partnerKey, partnerTotal);
    const currentStripeAccount = await readReadyStripeConnectPayoutAccount(ctx, transfer.partnerUserId);
    if (
      !currentStripeAccount ||
      String(currentStripeAccount.stripeAccountId) !== String(transfer.stripeAccountId)
    ) {
      return { ok: false, reason: "partner_payout_account_not_ready" };
    }
  }

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
    const settlementState = await readPartnerCommissionSettlementState(ctx, commission, {
      excludeBatchId: batchId,
    });
    const requestedCents = usdToSettlementCents(itemTotal.amountUsd);
    const availableCents = settlementState.openSettlementCents;
    if (requestedCents <= 0 || requestedCents > availableCents) {
      return { ok: false, reason: "partner_payout_stale_payable_balance" };
    }
  }

  for (const partnerTotal of transferCentsByPartnerId.values()) {
    const partner = await ctx.db.get(partnerTotal.partnerId);
    if (!partner || partner.status !== "active") {
      return { ok: false, reason: "partner_payout_partner_not_active" };
    }
    const availableEntries = await readPartnerPayablePayoutEntries(ctx, partner, {
      payableCutoffAt: batchPayableCutoffAt,
      excludeBatchId: batchId,
    });
    const availablePartnerPayoutCents = availableEntries.reduce(
      (total: number, entry: any) => total + Number(entry.settlementCents ?? 0),
      0,
    );
    if (
      partnerTotal.settlementCents <= 0 ||
      partnerTotal.settlementCents > availablePartnerPayoutCents
    ) {
      return { ok: false, reason: "partner_payout_stale_partner_balance" };
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
  const releasedCommissionIds = new Map<string, any>();
  for (const item of items) {
    if (item.status !== "reserved") continue;
    await ctx.db.patch(item._id, {
      status: "released",
      updatedAt: args.nowMs,
    });
    releasedCommissionIds.set(String(item.commissionId), item.commissionId);
  }
  for (const commissionId of releasedCommissionIds.values()) {
    await recomputePartnerCommissionSettlementState(ctx, commissionId, args.nowMs);
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
    termsVersion: v.string(),
  },
  handler: async (ctx, args) => {
    const requestedTermsVersion = String(args.termsVersion ?? "").trim();
    if (!requestedTermsVersion) {
      throw new Error("builder_partner_terms_version_required");
    }
    if (requestedTermsVersion !== BUILDER_PARTNER_TERMS_VERSION) {
      throw new Error("builder_partner_terms_version_stale");
    }
    const actor = await resolveAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = Date.now();
    const ownedCommunities = await listOwnedCommunities(ctx, actor.dbUserId);
    const accountSetup = await loadAccountSetupStatusForUserId(ctx, actor.dbUserId);
    if (!accountSetup.completed) {
      throw new Error("builder_partner_account_setup_required");
    }
    if (ownedCommunities.length <= 0) {
      throw new Error("builder_partner_owned_community_required");
    }
    if (!hasPublishReadyCommunity(ownedCommunities)) {
      throw new Error("builder_partner_publish_ready_community_required");
    }

    const existing = await getPartnerByUserId(ctx, actor.dbUserId);
    if (existing?.status === "disabled") {
      throw new Error("builder_partner_disabled");
    }
    const user = await ctx.db.get(actor.dbUserId);
    const code = existing?.code || await issuePartnerCode(ctx, user, existing?._id);
    await recordBuilderPartnerTermsAcceptance(ctx, {
      userId: actor.dbUserId,
      acceptedAt: nowMs,
    });
    if (existing) {
      const acceptedTermsAt =
        existing.acceptedTermsVersion === BUILDER_PARTNER_TERMS_VERSION &&
        typeof existing.acceptedTermsAt === "number"
          ? existing.acceptedTermsAt
          : nowMs;
      await ctx.db.patch(existing._id, {
        code,
        status: existing.status === "paused" ? "paused" : "active",
        acceptedTermsAt,
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

export const createPartnerPayoutCycleInternal = internalMutation({
  args: {
    batchKey: v.optional(v.string()),
    cyclePeriod: v.optional(v.string()),
    limit: v.optional(v.number()),
    payableCutoffAt: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const payableCutoffAt = normalizePayableCutoffAt(args.payableCutoffAt, nowMs);
    const cyclePeriod = normalizePartnerPayoutCyclePeriod(args.cyclePeriod, nowMs);
    const rawBatchKey = String(args.batchKey ?? "").trim();
    const existingByExplicitKey = rawBatchKey
      ? await ctx.db
          .query("partnerPayoutBatches" as any)
          .withIndex("by_batchKey", (q: any) => q.eq("batchKey", rawBatchKey))
          .first()
      : null;
    if (existingByExplicitKey) {
      return {
        ok: true,
        created: false,
        reason: "partner_payout_cycle_exists",
        cycle: readPartnerPayoutCycleSummary(existingByExplicitKey),
      };
    }

    const existingCyclesForPeriod = await readPartnerPayoutCycleRowsForPeriod(ctx, cyclePeriod);
    const activeCycle = await findActivePartnerPayoutCycleForGeneration(ctx, existingCyclesForPeriod);
    if (activeCycle) {
      return {
        ok: true,
        created: false,
        reason: "partner_payout_cycle_active",
        cycle: readPartnerPayoutCycleSummary(activeCycle),
      };
    }

    const plans = await readPartnerPayoutPlans(ctx, {
      limit: args.limit ?? null,
      payableCutoffAt,
    });
    if (plans.length <= 0) {
      return {
        ok: true,
        created: false,
        reason: "partner_payout_cycle_empty",
        batch: null,
      };
    }
    const totalAmountUsd = roundBuilderPartnerMoney(
      plans.reduce((total: number, plan: any) => total + Number(plan.amountUsd ?? 0), 0),
    );
    const itemCount = plans.reduce((total: number, plan: any) => total + plan.entries.length, 0);
    const runNumber = readNextPartnerPayoutCycleRunNumber(existingCyclesForPeriod);
    const batchKey = rawBatchKey || buildPartnerPayoutCycleKey(cyclePeriod, runNumber);
    const replacesBatch = await findLatestReplaceablePartnerPayoutCycle(ctx, existingCyclesForPeriod);
    const batchId = await ctx.db.insert("partnerPayoutBatches" as any, {
      batchKey,
      cyclePeriod,
      runNumber,
      replacesBatchId: replacesBatch?._id,
      status: "pending_approval",
      totalAmountUsd,
      currency: "usd",
      partnerCount: plans.length,
      itemCount,
      payableCutoffAt,
      payoutBufferMs: BUILDER_PARTNER_PAYOUT_BUFFER_MS,
      createdAt: nowMs,
      updatedAt: nowMs,
    });

    const reservedCommissionIds = new Map<string, any>();
    for (const plan of plans) {
      const transferId = await ctx.db.insert("partnerPayoutTransfers" as any, {
        batchId,
        partnerId: plan.partner._id,
        partnerUserId: plan.partner.userId,
        stripeAccountId: String(plan.stripeAccount.stripeAccountId).trim(),
        amountUsd: plan.amountUsd,
        currency: "usd",
        status: "pending",
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
        reservedCommissionIds.set(String(entry.commissionId), entry.commissionId);
      }
    }
    for (const commissionId of reservedCommissionIds.values()) {
      await recomputePartnerCommissionSettlementState(ctx, commissionId, nowMs);
    }

    await recordPartnerPayoutAudit(ctx, {
      eventType: "builder_partner_payout_batch_created",
      status: "succeeded",
      metadata: {
        batchId: String(batchId),
        cyclePeriod,
        runNumber,
        replacesBatchId: replacesBatch?._id ? String(replacesBatch._id) : null,
        totalAmountUsd,
        partnerCount: plans.length,
        itemCount,
      },
      nowMs,
    });

    return {
      ok: true,
      created: true,
      reason: null,
      cycle: readPartnerPayoutCycleSummary(await ctx.db.get(batchId)),
    };
  },
});

export const listPartnerPerformanceForOperator = query({
  args: {
    authSubject: v.optional(v.string()),
    range: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("all"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOperatorRole(ctx, args.authSubject, "operator");
    const topLimit = normalizePartnerPerformanceTopLimit(args.limit);
    const range = normalizePartnerPerformanceRange(args.range);
    const partnerStatuses = ["active", "paused", "disabled"] as const;
    const commissionStatuses = ["locked", "risk_hold", "payable"] as const;
    const nowMs = Date.now();
    const rangeStart = normalizePartnerPerformanceRangeStart(range, nowMs);
    const payoutReadyCutoffAt = nowMs - BUILDER_PARTNER_PAYOUT_BUFFER_MS;
    let isTruncated = false;
    const aggregateByPartnerId = new Map<string, OperatorPartnerPerformanceAggregate>();

    const partnerRowsByStatus = await Promise.all(
      partnerStatuses.map(async (status) => {
        const rows = await ctx.db
          .query("builderPartners")
          .withIndex("by_status_createdAt", (q: any) => q.eq("status", status))
          .order("desc")
          .take(BUILDER_PARTNER_OPERATOR_PERFORMANCE_PARTNER_SCAN_LIMIT + 1);
        if (rows.length > BUILDER_PARTNER_OPERATOR_PERFORMANCE_PARTNER_SCAN_LIMIT) {
          isTruncated = true;
        }
        return rows.slice(0, BUILDER_PARTNER_OPERATOR_PERFORMANCE_PARTNER_SCAN_LIMIT);
      }),
    );
    const partnerRows = partnerRowsByStatus
      .flat()
      .filter((partner: any, index, allRows: any[]) =>
        allRows.findIndex((candidate: any) => String(candidate._id) === String(partner._id)) === index,
      );
    for (const partner of partnerRows) {
      upsertOperatorPartnerPerformanceAggregate(aggregateByPartnerId, partner);
    }

    const commissionRowsByStatus = await Promise.all(
      commissionStatuses.map(async (status) => {
        const rows = await ctx.db
          .query("partnerCommissionLedger")
          .withIndex("by_status_createdAt", (q: any) => {
            const scoped = q.eq("status", status);
            return rangeStart == null ? scoped : scoped.gte("createdAt", rangeStart);
          })
          .order("desc")
          .take(BUILDER_PARTNER_OPERATOR_PERFORMANCE_COMMISSION_SCAN_LIMIT + 1);
        if (rows.length > BUILDER_PARTNER_OPERATOR_PERFORMANCE_COMMISSION_SCAN_LIMIT) {
          isTruncated = true;
        }
        return rows.slice(0, BUILDER_PARTNER_OPERATOR_PERFORMANCE_COMMISSION_SCAN_LIMIT);
      }),
    );
    let commissionGeneratedCents = 0;
    for (const row of commissionRowsByStatus.flat()) {
      const settlementState = readMaterializedPartnerCommissionSettlementState(row) ?? {
        commissionSettlementCents: usdToSettlementCents(Number(row.commissionAmountUsd ?? 0)),
        openSettlementCents: 0,
        payoutOpen: false,
      };
      commissionGeneratedCents += settlementState.commissionSettlementCents;
      const aggregate = upsertOperatorPartnerPerformanceAggregateFromLedger(aggregateByPartnerId, {
        partnerId: row.partnerId,
        partnerUserId: row.partnerUserId,
        createdAt: Number(row.createdAt ?? 0),
      });
      if (!aggregate) continue;
      aggregate.commissionGeneratedCents += settlementState.commissionSettlementCents;
      const latestCommissionAt = Number(row.createdAt ?? row.updatedAt ?? 0);
      if (
        Number.isFinite(latestCommissionAt) &&
        latestCommissionAt > Number(aggregate.latestCommissionAt ?? 0)
      ) {
        aggregate.latestCommissionAt = latestCommissionAt;
      }
      if (row.status === "payable") {
        const isReady =
          settlementState.payoutOpen &&
          typeof row.payableAt === "number" &&
          Number.isFinite(row.payableAt) &&
          row.payableAt <= payoutReadyCutoffAt;
        if (isReady) {
          aggregate.readyCents += settlementState.openSettlementCents;
        } else {
          aggregate.pendingCents += settlementState.openSettlementCents;
        }
      } else {
        aggregate.pendingCents += settlementState.openSettlementCents;
      }
    }

    const transferRows = await ctx.db
      .query("partnerPayoutTransfers" as any)
      .withIndex("by_status_processedAt", (q: any) => {
        const scoped = q.eq("status", "succeeded");
        return rangeStart == null ? scoped : scoped.gte("processedAt", rangeStart);
      })
      .order("desc")
      .take(BUILDER_PARTNER_OPERATOR_PERFORMANCE_TRANSFER_SCAN_LIMIT + 1);
    if (transferRows.length > BUILDER_PARTNER_OPERATOR_PERFORMANCE_TRANSFER_SCAN_LIMIT) {
      isTruncated = true;
    }
    let partnerPaidOutCents = 0;
    for (const row of transferRows.slice(0, BUILDER_PARTNER_OPERATOR_PERFORMANCE_TRANSFER_SCAN_LIMIT)) {
      const transferCents = usdToSettlementCents(Number(row.amountUsd ?? 0));
      partnerPaidOutCents += transferCents;
      const aggregate = upsertOperatorPartnerPerformanceAggregateFromLedger(aggregateByPartnerId, {
        partnerId: row.partnerId,
        partnerUserId: row.partnerUserId,
        createdAt: Number(row.createdAt ?? 0),
      });
      if (aggregate) aggregate.paidOutCents += transferCents;
    }

    const partnerCounts = partnerRows.reduce(
      (totals, partner: any) => {
        const status = readBuilderPartnerStatus(partner.status);
        totals.totalPartners += 1;
        if (status === "active") totals.activePartners += 1;
        if (status === "paused") totals.pausedPartners += 1;
        if (status === "disabled") totals.disabledPartners += 1;
        return totals;
      },
      { totalPartners: 0, activePartners: 0, pausedPartners: 0, disabledPartners: 0 },
    );

    const topAggregates = Array.from(aggregateByPartnerId.values())
      .filter((aggregate) =>
        aggregate.commissionGeneratedCents > 0 ||
        aggregate.paidOutCents > 0 ||
        aggregate.readyCents > 0 ||
        aggregate.pendingCents > 0,
      )
      .sort(
        (a, b) =>
          b.commissionGeneratedCents - a.commissionGeneratedCents ||
          b.paidOutCents - a.paidOutCents ||
          Number(b.latestCommissionAt ?? 0) - Number(a.latestCommissionAt ?? 0) ||
          Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0) ||
          String(a.partnerId).localeCompare(String(b.partnerId)),
      )
      .slice(0, topLimit);
    for (const aggregate of topAggregates) {
      aggregate.boundReferrals = await readOperatorPartnerBoundReferralCount(ctx, aggregate.partnerId);
    }

    const topPartners = await Promise.all(
      topAggregates
        .sort(
          (a, b) =>
            b.commissionGeneratedCents - a.commissionGeneratedCents ||
            b.paidOutCents - a.paidOutCents ||
            b.boundReferrals - a.boundReferrals ||
            Number(b.latestCommissionAt ?? 0) - Number(a.latestCommissionAt ?? 0) ||
            Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0) ||
            String(a.partnerId).localeCompare(String(b.partnerId)),
        )
        .slice(0, topLimit)
        .map(async (aggregate) => {
          const identity = await readOperatorPartnerPerformanceIdentity(ctx, aggregate);
          return {
            partnerId: String(aggregate.partnerId),
            partnerUserId: identity.partnerUserId ? String(identity.partnerUserId) : "",
            code: identity.code,
            status: identity.status,
            displayName: identity.displayName,
            handle: identity.handle,
            boundReferrals: aggregate.boundReferrals,
            commissionGeneratedUsd: settlementCentsToUsd(aggregate.commissionGeneratedCents),
            pendingUsd: settlementCentsToUsd(aggregate.pendingCents),
            readyUsd: settlementCentsToUsd(aggregate.readyCents),
            paidOutUsd: settlementCentsToUsd(aggregate.paidOutCents),
            latestCommissionAt: aggregate.latestCommissionAt,
            createdAt: identity.createdAt,
          };
        }),
    );

    return {
      range,
      summary: {
        ...partnerCounts,
        commissionGeneratedUsd: settlementCentsToUsd(commissionGeneratedCents),
        partnerPaidOutUsd: settlementCentsToUsd(partnerPaidOutCents),
      },
      topPartners,
      evidence: {
        sourceTables: [
          "builderPartners",
          "partnerAttributions",
          "partnerCommissionLedger",
          "partnerPayoutTransfers",
        ],
        computedAt: nowMs,
        rangeStart,
        rangeEnd: nowMs,
        scannedPartnerLimit: BUILDER_PARTNER_OPERATOR_PERFORMANCE_PARTNER_SCAN_LIMIT,
        scannedCommissionLimit: BUILDER_PARTNER_OPERATOR_PERFORMANCE_COMMISSION_SCAN_LIMIT,
        scannedTransferLimit: BUILDER_PARTNER_OPERATOR_PERFORMANCE_TRANSFER_SCAN_LIMIT,
        isTruncated,
      },
    };
  },
});

export const listPartnerPayoutCyclesForOperator = query({
  args: {
    authSubject: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOperatorRole(ctx, args.authSubject, "operator");
    const limit = normalizePartnerPayoutCycleOperatorLimit(args.limit);
    const statuses = [
      "pending_approval",
      "held",
      "failed",
      "approved",
      "processing",
      "paid",
      "rejected",
    ] as const;
    const rows = (
      await Promise.all(
        statuses.map((status) =>
          ctx.db
            .query("partnerPayoutBatches" as any)
            .withIndex("by_status_createdAt", (q: any) => q.eq("status", status))
            .order("desc")
            .take(limit),
        ),
      )
    ).flat();
    const uniqueRows = rows
      .filter((row: any, index, allRows: any[]) =>
        allRows.findIndex((candidate: any) => String(candidate._id) === String(row._id)) === index,
      )
      .sort(
        (a: any, b: any) =>
          partnerPayoutCycleOperatorSortRank(a) - partnerPayoutCycleOperatorSortRank(b) ||
          Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0) ||
          String(b._id).localeCompare(String(a._id)),
      )
      .slice(0, limit);
    const cycles = await Promise.all(
      uniqueRows.map((row: any) => readPartnerPayoutCycleOperatorRow(ctx, row)),
    );
    return {
      cycles,
      evidence: {
        sourceTables: ["partnerPayoutBatches", "partnerPayoutTransfers", "partnerPayoutItems"],
        computedAt: Date.now(),
      },
    };
  },
});

export const approvePartnerPayoutCycle = mutation({
  args: {
    authSubject: v.optional(v.string()),
    batchId: v.id("partnerPayoutBatches"),
  },
  handler: async (ctx, args) => {
    const operator = await requireOperatorRole(ctx, args.authSubject, "operator");
    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error("partner_payout_batch_not_found");
    const operatorStatus = toPartnerPayoutCycleOperatorStatus(batch);
    if (operatorStatus !== "pending_approval" && operatorStatus !== "held") {
      throw new Error("partner_payout_cycle_not_approvable");
    }
    const validation = await validatePartnerPayoutBatchStillPayable(ctx, args.batchId);
    if (!validation.ok) {
      throw new Error(validation.reason ?? "partner_payout_batch_stale");
    }
    const nowMs = Date.now();
    await ctx.db.patch(args.batchId, {
      status: "approved",
      approvedByUserId: operator.dbUserId,
      approvedAt: nowMs,
      holdReason: undefined,
      rejectReason: undefined,
      failureReason: undefined,
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
    await ctx.scheduler.runAfter(0, (internal as any).builderPartners.executePartnerPayoutBatchInternal, {
      batchId: args.batchId,
      actorUserId: operator.dbUserId,
    });
    return {
      ok: true,
      cycleId: String(args.batchId),
      status: "approved",
    };
  },
});

export const retryPartnerPayoutCycle = mutation({
  args: {
    authSubject: v.optional(v.string()),
    batchId: v.id("partnerPayoutBatches"),
  },
  handler: async (ctx, args) => {
    const operator = await requireOperatorRole(ctx, args.authSubject, "operator");
    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error("partner_payout_batch_not_found");
    if (toPartnerPayoutCycleOperatorStatus(batch) !== "failed") {
      throw new Error("partner_payout_cycle_not_retryable");
    }
    const items = await ctx.db
      .query("partnerPayoutItems" as any)
      .withIndex("by_batch", (q: any) => q.eq("batchId", args.batchId))
      .collect();
    if (!items.some((item: any) => item.status === "reserved")) {
      throw new Error("partner_payout_cycle_not_retryable");
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
      throw new Error(validation.reason ?? "partner_payout_batch_stale");
    }
    await ctx.db.patch(args.batchId, {
      status: "approved",
      approvedByUserId: batch.approvedByUserId ?? operator.dbUserId,
      approvedAt: batch.approvedAt ?? nowMs,
      processedByUserId: operator.dbUserId,
      failureReason: undefined,
      updatedAt: nowMs,
    });
    await recordPartnerPayoutAudit(ctx, {
      eventType: "builder_partner_payout_cycle_retried",
      status: "started",
      actorUserId: operator.dbUserId,
      metadata: {
        batchId: String(args.batchId),
        totalAmountUsd: Number(batch.totalAmountUsd ?? 0),
        partnerCount: Number(batch.partnerCount ?? 0),
        itemCount: Number(batch.itemCount ?? 0),
      },
      nowMs,
    });
    await ctx.scheduler.runAfter(0, (internal as any).builderPartners.executePartnerPayoutBatchInternal, {
      batchId: args.batchId,
      actorUserId: operator.dbUserId,
    });
    return {
      ok: true,
      cycleId: String(args.batchId),
      status: "approved",
    };
  },
});

export const holdPartnerPayoutCycle = mutation({
  args: {
    authSubject: v.optional(v.string()),
    batchId: v.id("partnerPayoutBatches"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const operator = await requireOperatorRole(ctx, args.authSubject, "operator");
    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error("partner_payout_batch_not_found");
    if (toPartnerPayoutCycleOperatorStatus(batch) !== "pending_approval") {
      throw new Error("partner_payout_cycle_not_holdable");
    }
    const nowMs = Date.now();
    const reason = normalizeOperatorDecisionReason(args.reason, "operator_hold");
    await ctx.db.patch(args.batchId, {
      status: "held",
      holdReason: reason,
      failureReason: undefined,
      updatedAt: nowMs,
    });
    await recordPartnerPayoutAudit(ctx, {
      eventType: "builder_partner_payout_cycle_held",
      status: "blocked",
      actorUserId: operator.dbUserId,
      metadata: {
        batchId: String(args.batchId),
        reason,
      },
      nowMs,
    });
    return {
      ok: true,
      cycleId: String(args.batchId),
      status: "held",
    };
  },
});

export const rejectPartnerPayoutCycle = mutation({
  args: {
    authSubject: v.optional(v.string()),
    batchId: v.id("partnerPayoutBatches"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const operator = await requireOperatorRole(ctx, args.authSubject, "operator");
    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error("partner_payout_batch_not_found");
    const operatorStatus = toPartnerPayoutCycleOperatorStatus(batch);
    if (operatorStatus !== "pending_approval" && operatorStatus !== "held" && operatorStatus !== "failed") {
      throw new Error("partner_payout_cycle_cannot_reject");
    }
    const nowMs = Date.now();
    const reason = normalizeOperatorDecisionReason(args.reason, "operator_rejected");
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
      status: "rejected",
      rejectReason: reason,
      failureReason: undefined,
      updatedAt: nowMs,
    });
    for (const transfer of transfers) {
      if (transfer.status === "succeeded") continue;
      await ctx.db.patch(transfer._id, {
        status: "canceled",
        failureReason: "cycle_rejected",
        updatedAt: nowMs,
      });
    }
    const releasedCommissionIds = new Map<string, any>();
    for (const item of items) {
      if (item.status === "settled") continue;
      await ctx.db.patch(item._id, {
        status: "released",
        updatedAt: nowMs,
      });
      releasedCommissionIds.set(String(item.commissionId), item.commissionId);
    }
    for (const commissionId of releasedCommissionIds.values()) {
      await recomputePartnerCommissionSettlementState(ctx, commissionId, nowMs);
    }
    await recordPartnerPayoutAudit(ctx, {
      eventType: "builder_partner_payout_cycle_rejected",
      status: "succeeded",
      actorUserId: operator.dbUserId,
      metadata: {
        batchId: String(args.batchId),
        reason,
      },
      nowMs,
    });
    return {
      ok: true,
      cycleId: String(args.batchId),
      status: "rejected",
    };
  },
});

export const beginPartnerPayoutBatchExecutionInternal = internalMutation({
  args: {
    batchId: v.id("partnerPayoutBatches"),
    actorUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error("partner_payout_batch_not_found");
    const rawBatchStatus = String(batch?.status ?? "").trim();
    const operatorStatus = toPartnerPayoutCycleOperatorStatus(batch);
    if (operatorStatus === "pending_approval") throw new Error("partner_payout_batch_not_approved");
    if (operatorStatus === "held") throw new Error("partner_payout_batch_held");
    if (operatorStatus === "rejected") throw new Error("partner_payout_batch_rejected");
    if (operatorStatus === "paid") {
      return { transfers: [] };
    }
    if (rawBatchStatus === "failed") throw new Error("partner_payout_batch_retry_required");
    if (operatorStatus !== "approved" && operatorStatus !== "processing") {
      throw new Error("partner_payout_batch_not_executable");
    }
    const nowMs = Date.now();
    const actorUserId = args.actorUserId ?? batch.approvedByUserId;
    const validation = await validatePartnerPayoutBatchStillPayable(ctx, args.batchId);
    if (!validation.ok) {
      await markPartnerPayoutBatchStale(ctx, {
        batch,
        batchId: args.batchId,
        reason: validation.reason ?? "partner_payout_batch_stale",
        actorUserId,
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
      processedByUserId: actorUserId,
      processedAt: batch.processedAt ?? nowMs,
      failureReason: undefined,
      updatedAt: nowMs,
    });
    const transfers = await ctx.db
      .query("partnerPayoutTransfers" as any)
      .withIndex("by_batch", (q: any) => q.eq("batchId", args.batchId))
      .collect();
    const runnableTransfers = transfers.filter((row: any) =>
      row.status === "pending" || row.status === "failed" || row.status === "processing",
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
      actorUserId,
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
    const settledCommissionIds = new Map<string, any>();
    for (const item of items) {
      await ctx.db.patch(item._id, {
        status: "settled",
        updatedAt: args.nowMs,
      });
      settledCommissionIds.set(String(item.commissionId), item.commissionId);
    }
    for (const commissionId of settledCommissionIds.values()) {
      await recomputePartnerCommissionSettlementState(ctx, commissionId, args.nowMs);
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
    const paid = transfers.length > 0 &&
      transfers.every((row: any) => row.status === "succeeded");
    await ctx.db.patch(args.batchId, {
      status: paid ? "paid" : processingTransfers.length > 0 ? "processing" : "failed",
      failureReason: failedTransfers.length > 0 ? `${failedTransfers.length} partner payout transfer(s) failed` : undefined,
      processedAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    await recordPartnerPayoutAudit(ctx, {
      eventType: "builder_partner_payout_batch_finalized",
      status: paid ? "succeeded" : "failed",
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

export const executePartnerPayoutBatchInternal = internalAction({
  args: {
    batchId: v.id("partnerPayoutBatches"),
    actorUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args): Promise<any> => {
    const begin = await ctx.runMutation((internal as any).builderPartners.beginPartnerPayoutBatchExecutionInternal, {
      batchId: args.batchId,
      actorUserId: args.actorUserId,
    });
    if (begin?.blocked) {
      return { ok: false, blocked: true, reason: begin.reason ?? "partner_payout_batch_stale" };
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
    return { ok: true, blocked: false, batchId: String(args.batchId) };
  },
});
