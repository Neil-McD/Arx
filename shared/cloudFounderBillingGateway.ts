import { bootstrapGatewayAuthContext } from "./cloudGateway";
import type {
  BuilderFundingAction,
  BuilderFundingLane,
  BuilderFundingProjection,
  BuilderFundingState,
} from "./builderFunding";
import { builderFundingProjectionGrantsAccess } from "./builderFunding";
import type { CommunityLifecycleStatus } from "./communityLifecycle";
import {
  resolveCommunityRestoreEligibility,
  type CommunityRestoreAction,
  type CommunityRestoreEligibility,
  type CommunityRestoreEligibilityState,
} from "./communityRestoreEligibility";

export type CloudFounderBillingCommunityStatus =
  | "operator_comped"
  | "legacy_ready"
  | "legacy_active"
  | "legacy_suspended"
  | "managed_required"
  | "managed_checkout_pending"
  | "active"
  | "past_due"
  | "cancel_at_period_end"
  | "canceled"
  | "ended";

export type CloudFounderBillingCommunity = {
  community_id: string;
  community_name: string;
  community_slug: string;
  lifecycle_status: CommunityLifecycleStatus;
  lifecycle_generation: number;
  funding_policy: "legacy_byok_allowed" | "managed_required";
  funding_lane: BuilderFundingLane;
  funding_state: BuilderFundingState;
  allowed_actions: BuilderFundingAction[];
  operational_funding: boolean;
  restore_eligibility: CommunityRestoreEligibility;
  funding_mode: "managed" | "legacy_byok" | "operator_comp";
  status: CloudFounderBillingCommunityStatus;
  monthly_price_base_units: number;
  platform_fee_bps: number;
  checkout_pending: boolean;
  subscription_id: string | null;
  current_period_start_at: string | null;
  current_period_end_at: string | null;
  cancel_at_period_end: boolean;
};

export type CloudFounderBillingOverview = {
  monthly_price_base_units: number;
  communities: CloudFounderBillingCommunity[];
  managed_monthly_total_base_units: number;
};

export const EMPTY_FOUNDER_BILLING_OVERVIEW: CloudFounderBillingOverview = {
  monthly_price_base_units: 7_900,
  communities: [],
  managed_monthly_total_base_units: 0,
};

function nullableString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const BUILDER_FUNDING_LANES: BuilderFundingLane[] = [
  "legacy_choice",
  "builder_included",
  "builder",
];
const BUILDER_FUNDING_STATES: BuilderFundingState[] = [
  "legacy_api_available",
  "legacy_api_active",
  "legacy_api_suspended",
  "builder_required",
  "checkout_pending",
  "builder_active",
  "builder_canceling",
  "builder_inactive",
  "builder_past_due",
  "builder_ended",
  "builder_included",
];
const BUILDER_FUNDING_ACTIONS: BuilderFundingAction[] = [
  "activate_owner_api",
  "manage_owner_api",
  "buy_builder",
  "resume_checkout",
  "manage_builder",
];
const COMMUNITY_LIFECYCLE_STATUSES: CommunityLifecycleStatus[] = [
  "active",
  "archiving",
  "archived",
];
const COMMUNITY_RESTORE_ELIGIBILITY_STATES: CommunityRestoreEligibilityState[] = [
  "not_archived",
  "archive_in_progress",
  "ready",
  "checkout_required",
  "checkout_pending",
  "funding_attention",
];
const COMMUNITY_RESTORE_ACTIONS: Exclude<CommunityRestoreAction, null>[] = [
  "restore_now",
  ...BUILDER_FUNDING_ACTIONS,
];

function coerceRestoreEligibility(args: {
  value: unknown;
  lifecycleStatus: CommunityLifecycleStatus;
  funding: BuilderFundingProjection;
}): CommunityRestoreEligibility {
  const fallback = resolveCommunityRestoreEligibility({
    lifecycleStatus: args.lifecycleStatus,
    funding: args.funding,
  });
  if (!args.value || typeof args.value !== "object") return fallback;
  const row = args.value as Record<string, unknown>;
  const state = nullableString(row.state);
  const action = nullableString(row.action);
  const requiresVerifiedCheckout = row.requires_verified_checkout;
  if (
    !COMMUNITY_RESTORE_ELIGIBILITY_STATES.includes(
      state as CommunityRestoreEligibilityState,
    ) ||
    (action !== null &&
      !COMMUNITY_RESTORE_ACTIONS.includes(
        action as Exclude<CommunityRestoreAction, null>,
      )) ||
    typeof requiresVerifiedCheckout !== "boolean" ||
    state !== fallback.state ||
    action !== fallback.action ||
    requiresVerifiedCheckout !== fallback.requires_verified_checkout
  ) {
    return fallback;
  }
  return {
    state: state as CommunityRestoreEligibilityState,
    action: action as CommunityRestoreAction,
    requires_verified_checkout: requiresVerifiedCheckout,
  };
}

function coerceCommunity(value: unknown): CloudFounderBillingCommunity | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const communityId = nullableString(row.community_id);
  if (!communityId) return null;
  const rawStatus = nullableString(row.status);
  const allowedStatuses: CloudFounderBillingCommunityStatus[] = [
    "operator_comped",
    "legacy_ready",
    "legacy_active",
    "legacy_suspended",
    "managed_required",
    "managed_checkout_pending",
    "active",
    "past_due",
    "cancel_at_period_end",
    "canceled",
    "ended",
  ];
  const status = allowedStatuses.includes(rawStatus as CloudFounderBillingCommunityStatus)
    ? rawStatus as CloudFounderBillingCommunityStatus
    : "managed_required";
  const rawFundingLane = nullableString(row.funding_lane);
  const fundingLane = BUILDER_FUNDING_LANES.includes(rawFundingLane as BuilderFundingLane)
    ? rawFundingLane as BuilderFundingLane
    : "builder";
  const rawFundingState = nullableString(row.funding_state);
  const fundingState = BUILDER_FUNDING_STATES.includes(rawFundingState as BuilderFundingState)
    ? rawFundingState as BuilderFundingState
    : "builder_required";
  const allowedActions = Array.isArray(row.allowed_actions)
    ? row.allowed_actions.filter(
        (action): action is BuilderFundingAction =>
          BUILDER_FUNDING_ACTIONS.includes(action as BuilderFundingAction),
      )
    : [];
  const rawLifecycleStatus = nullableString(row.lifecycle_status);
  const lifecycleStatus = COMMUNITY_LIFECYCLE_STATUSES.includes(
    rawLifecycleStatus as CommunityLifecycleStatus,
  )
    ? rawLifecycleStatus as CommunityLifecycleStatus
    : "active";
  const rawLifecycleGeneration = finiteNumber(row.lifecycle_generation);
  const lifecycleGeneration =
    Number.isSafeInteger(rawLifecycleGeneration) && rawLifecycleGeneration >= 0
      ? rawLifecycleGeneration
      : 0;
  const fundingProjection: BuilderFundingProjection = {
    lane: fundingLane,
    state: fundingState,
    allowedActions,
  };
  return {
    community_id: communityId,
    community_name: nullableString(row.community_name) ?? "Untitled community",
    community_slug: nullableString(row.community_slug) ?? "",
    lifecycle_status: lifecycleStatus,
    lifecycle_generation: lifecycleGeneration,
    funding_policy: row.funding_policy === "legacy_byok_allowed"
      ? "legacy_byok_allowed"
      : "managed_required",
    funding_lane: fundingLane,
    funding_state: fundingState,
    allowed_actions: allowedActions,
    operational_funding:
      row.operational_funding === true ||
      (row.operational_funding === undefined &&
        lifecycleStatus === "active" &&
        builderFundingProjectionGrantsAccess(fundingProjection)),
    restore_eligibility: coerceRestoreEligibility({
      value: row.restore_eligibility,
      lifecycleStatus,
      funding: fundingProjection,
    }),
    funding_mode:
      row.funding_mode === "operator_comp"
        ? "operator_comp"
        : row.funding_mode === "legacy_byok"
          ? "legacy_byok"
          : "managed",
    status,
    monthly_price_base_units: finiteNumber(row.monthly_price_base_units, 7_900),
    platform_fee_bps: finiteNumber(row.platform_fee_bps),
    checkout_pending: row.checkout_pending === true,
    subscription_id: nullableString(row.subscription_id),
    current_period_start_at: nullableString(row.current_period_start_at),
    current_period_end_at: nullableString(row.current_period_end_at),
    cancel_at_period_end: row.cancel_at_period_end === true,
  };
}

function coerceOverview(payload: unknown): CloudFounderBillingOverview {
  if (!payload || typeof payload !== "object") return EMPTY_FOUNDER_BILLING_OVERVIEW;
  const row = payload as Record<string, unknown>;
  return {
    monthly_price_base_units: finiteNumber(row.monthly_price_base_units, 7_900),
    communities: Array.isArray(row.communities)
      ? row.communities.flatMap((community) => {
          const normalized = coerceCommunity(community);
          return normalized ? [normalized] : [];
        })
      : [],
    managed_monthly_total_base_units: finiteNumber(
      row.managed_monthly_total_base_units,
    ),
  };
}

export async function loadCloudFounderBillingOverview<SessionT>(params: {
  session: SessionT;
}): Promise<CloudFounderBillingOverview> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  const payload = await client.query("founderBilling:getFounderBillingOverview" as any, {
    authSubject,
  });
  return coerceOverview(payload);
}

export async function startCloudFounderSubscriptionCheckout<SessionT>(params: {
  session: SessionT;
  communityId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ checkout_url: string }> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  const payload = await client.action("founderBilling:startFounderSubscriptionCheckout" as any, {
    authSubject,
    communityId: params.communityId,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
  }) as { checkout_url?: unknown } | null;
  const checkoutUrl = nullableString(payload?.checkout_url);
  if (!checkoutUrl) throw new Error("stripe_checkout_url_missing");
  return { checkout_url: checkoutUrl };
}

export async function startCloudFounderBillingPortal<SessionT>(params: {
  session: SessionT;
  communityId: string;
  returnUrl: string;
}): Promise<{ portal_url: string }> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  const payload = await client.action("founderBilling:startFounderBillingPortal" as any, {
    authSubject,
    communityId: params.communityId,
    returnUrl: params.returnUrl,
  }) as { portal_url?: unknown } | null;
  const portalUrl = nullableString(payload?.portal_url);
  if (!portalUrl) throw new Error("stripe_billing_portal_url_missing");
  return { portal_url: portalUrl };
}
