export const BUILDER_PARTNER_PROGRAM_VERSION = "builder_partner_v1";
export const BUILDER_PARTNER_TERMS_VERSION = "builder_partner_terms_v1";
export const BUILDER_PARTNER_COMMUNITY_PLATFORM_FEE_BPS = 1500;
export const BUILDER_PARTNER_PLATFORM_FEE_SHARE_BPS = 4000;
export const BUILDER_PARTNER_ATTRIBUTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const BUILDER_PARTNER_COMMISSION_HOLD_MS = 30 * 24 * 60 * 60 * 1000;
export const BUILDER_PARTNER_PAYOUT_BUFFER_MS = 14 * 24 * 60 * 60 * 1000;

export type BuilderPartnerStatus = "active" | "paused" | "disabled";
export type BuilderPartnerAttributionStatus = "active" | "bound" | "expired" | "voided";
export type BuilderPartnerCommissionBasisType = "community_platform_fee";
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
  partnerPlatformFeeShareBps?: number;
}): {
  platformFeeUsd: number;
  commissionAmountUsd: number;
  effectiveCommunityRevenueShareBps: number;
} {
  const platformFeeBps = normalizeBps(params.platformFeeBps);
  const partnerPlatformFeeShareBps = normalizeBps(
    params.partnerPlatformFeeShareBps ?? BUILDER_PARTNER_PLATFORM_FEE_SHARE_BPS,
  );
  const communityRevenueUsd = roundBuilderPartnerMoney(params.communityRevenueUsd);
  const platformFeeUsd = roundBuilderPartnerMoney(
    communityRevenueUsd * (platformFeeBps / 10000),
  );
  const commissionAmountUsd = roundBuilderPartnerMoney(
    platformFeeUsd * (partnerPlatformFeeShareBps / 10000),
  );
  return {
    platformFeeUsd,
    commissionAmountUsd,
    effectiveCommunityRevenueShareBps: Math.round(
      platformFeeBps * (partnerPlatformFeeShareBps / 10000),
    ),
  };
}
