export const BUILDER_PARTNER_PROGRAM_VERSION = "builder_partner_v1";
export const BUILDER_PARTNER_TERMS_VERSION = "builder_partner_terms_v2";
export const BUILDER_PARTNER_COMMUNITY_PLATFORM_FEE_BPS = 1500;
export const BUILDER_PARTNER_COMMUNITY_REVENUE_SHARE_BPS = 500;
export const BUILDER_PARTNER_TOOL_USAGE_REVENUE_SHARE_BPS = 2000;
export const BUILDER_PARTNER_TOOL_USAGE_POLYNET_RETAINED_REVENUE_BPS = 4000;
export const BUILDER_PARTNER_ATTRIBUTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
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
  const communityRevenueUsd = roundBuilderPartnerMoney(params.communityRevenueUsd);
  const platformFeeUsd = roundBuilderPartnerMoney(
    communityRevenueUsd * (platformFeeBps / 10000),
  );
  const commissionAmountUsd = roundBuilderPartnerMoney(
    communityRevenueUsd * (partnerCommunityRevenueShareBps / 10000),
  );
  return {
    platformFeeUsd,
    commissionAmountUsd,
    effectiveCommunityRevenueShareBps: partnerCommunityRevenueShareBps,
  };
}

export function calculateBuilderPartnerToolUsageCommission(params: {
  polynetPriceUsd: number;
  rawVendorCostUsd: number;
  partnerToolUsageRevenueShareBps?: number;
  polynetRetainedRevenueBps?: number;
}): {
  toolRevenueUsd: number;
  rawVendorCostUsd: number;
  grossMarginUsd: number;
  commissionAmountUsd: number;
  retainedPolynetRevenueUsd: number;
  effectiveToolUsageRevenueShareBps: number;
} {
  const toolRevenueUsd = roundBuilderPartnerMoney(params.polynetPriceUsd);
  const rawVendorCostUsd = roundBuilderPartnerMoney(params.rawVendorCostUsd);
  const partnerShareBps = normalizeBps(
    params.partnerToolUsageRevenueShareBps ?? BUILDER_PARTNER_TOOL_USAGE_REVENUE_SHARE_BPS,
  );
  const retainedRevenueBps = normalizeBps(
    params.polynetRetainedRevenueBps ?? BUILDER_PARTNER_TOOL_USAGE_POLYNET_RETAINED_REVENUE_BPS,
  );
  const targetCommissionUsd = roundBuilderPartnerMoney(toolRevenueUsd * (partnerShareBps / 10000));
  const minimumPolynetRetainedUsd = roundBuilderPartnerMoney(toolRevenueUsd * (retainedRevenueBps / 10000));
  const availableForPartnerUsd = roundBuilderPartnerMoney(
    toolRevenueUsd - rawVendorCostUsd - minimumPolynetRetainedUsd,
  );
  const commissionAmountUsd = roundBuilderPartnerMoney(
    Math.min(targetCommissionUsd, availableForPartnerUsd),
  );
  const grossMarginUsd = Math.round((toolRevenueUsd - rawVendorCostUsd) * 10000) / 10000;
  const retainedPolynetRevenueUsd = Math.round(
    (toolRevenueUsd - rawVendorCostUsd - commissionAmountUsd) * 10000,
  ) / 10000;
  return {
    toolRevenueUsd,
    rawVendorCostUsd,
    grossMarginUsd,
    commissionAmountUsd,
    retainedPolynetRevenueUsd,
    effectiveToolUsageRevenueShareBps:
      toolRevenueUsd > 0 ? Math.round((commissionAmountUsd / toolRevenueUsd) * 10000) : 0,
  };
}
