export const BUILDER_PARTNER_PROGRAM_VERSION = "builder_partner_v3";
export const BUILDER_PARTNER_TERMS_VERSION = "builder_partner_terms_v3";
export const BUILDER_PARTNER_ECONOMIC_POLICY_VERSION = "builder_partner_economics_v3";
export const BUILDER_PARTNER_ACCRUAL_MODE: "frozen" | "community_v3" = "community_v3";
export const BUILDER_PARTNER_COMMUNITY_REVENUE_SHARE_BPS = 400;
export const BUILDER_PARTNER_COMMUNITY_REVENUE_BASIS =
  "settled_community_revenue_after_discounts_excluding_tax";
export const BUILDER_PARTNER_ATTRIBUTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const BUILDER_PARTNER_EARNING_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;
export const BUILDER_PARTNER_COMMISSION_HOLD_MS = 30 * 24 * 60 * 60 * 1000;
export const BUILDER_PARTNER_PAYOUT_BUFFER_MS = 14 * 24 * 60 * 60 * 1000;

export type BuilderPartnerStatus = "active" | "paused" | "disabled";
export type BuilderPartnerAttributionStatus = "active" | "bound" | "expired" | "voided";
export type BuilderPartnerCommissionBasisType = "community_platform_fee" | "community_revenue" | "paid_tool_usage";
export type BuilderPartnerCommissionStatus =
  | "locked"
  | "risk_hold"
  | "payable"
  | "voided";

function normalizeBps(value: number): number {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return 0;
  return Math.min(10000, Math.max(0, Math.round(normalized)));
}

export function roundBuilderPartnerMoney(value: number): number {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return 0;
  return Math.round(Math.max(0, normalized) * 10000) / 10000;
}

export function calculateBuilderPartnerEligibleSettledRevenueBaseUnits(params: {
  amountPaidBaseUnits: number;
  totalExcludingTaxBaseUnits?: number | null;
  totalTaxBaseUnits?: number | null;
}): number {
  const amountPaidBaseUnits = Math.max(0, Math.floor(Number(params.amountPaidBaseUnits) || 0));
  if (
    typeof params.totalExcludingTaxBaseUnits === "number" &&
    Number.isFinite(params.totalExcludingTaxBaseUnits) &&
    params.totalExcludingTaxBaseUnits >= 0
  ) {
    return Math.min(amountPaidBaseUnits, Math.floor(params.totalExcludingTaxBaseUnits));
  }
  const totalTaxBaseUnits = Math.max(0, Math.floor(Number(params.totalTaxBaseUnits) || 0));
  return Math.max(0, amountPaidBaseUnits - totalTaxBaseUnits);
}

export function calculateBuilderPartnerCommunityRevenueCommission(params: {
  communityRevenueUsd: number;
  platformFeeBps: number;
  partnerCommunityRevenueShareBps?: number;
}): {
  platformFeeUsd: number;
  commissionAmountUsd: number;
  effectiveCommunityRevenueShareBps: number;
} {
  const platformFeeBps = normalizeBps(params.platformFeeBps);
  const partnerCommunityRevenueShareBps = normalizeBps(
    params.partnerCommunityRevenueShareBps ?? BUILDER_PARTNER_COMMUNITY_REVENUE_SHARE_BPS,
  );
  const effectiveCommunityRevenueShareBps = Math.min(
    platformFeeBps,
    partnerCommunityRevenueShareBps,
  );
  const communityRevenueUsd = roundBuilderPartnerMoney(params.communityRevenueUsd);
  const platformFeeUsd = roundBuilderPartnerMoney(
    communityRevenueUsd * (platformFeeBps / 10000),
  );
  const commissionAmountUsd = roundBuilderPartnerMoney(
    communityRevenueUsd * (effectiveCommunityRevenueShareBps / 10000),
  );
  return {
    platformFeeUsd,
    commissionAmountUsd,
    effectiveCommunityRevenueShareBps,
  };
}
