import { bootstrapGatewayAuthContext } from "./cloudGateway";
import { createConvexClient } from "./convexAuthenticatedClient";
import type {
  BuilderFundingAction,
  BuilderFundingLane,
  BuilderFundingState,
} from "./builderFunding";

export type CloudFounderBillingCommunityStatus =
  | "operator_comped"
  | "managed_required"
  | "managed_checkout_pending"
  | "archived"
  | "active"
  | "past_due"
  | "cancel_at_period_end"
  | "canceled"
  | "ended";

export type CloudFounderBillingCommunity = {
  community_id: string;
  community_name: string;
  community_slug: string;
  lifecycle_status: "active" | "archived";
  lifecycle_generation: number;
  builder_access_mode: "free" | "grandfathered" | "subscription_required" | "invalid";
  archive_billing_cleanup_status: "pending" | "complete" | "blocked" | null;
  funding_lane: BuilderFundingLane;
  funding_state: BuilderFundingState;
  allowed_actions: BuilderFundingAction[];
  funding_mode: "managed" | "operator_comp";
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
  unassigned_subscriptions: CloudFounderBillingUnassignedSubscription[];
  managed_monthly_total_base_units: number;
};

export type CloudFounderBillingUnassignedSubscription = {
  subscription_id: string;
  status: "active" | "past_due" | "cancel_at_period_end" | "canceled" | "ended";
  grants_setup: boolean;
  monthly_price_base_units: number;
  current_period_start_at: string;
  current_period_end_at: string;
  cancel_at_period_end: boolean;
};

export const EMPTY_FOUNDER_BILLING_OVERVIEW: CloudFounderBillingOverview = {
  monthly_price_base_units: 7_900,
  communities: [],
  unassigned_subscriptions: [],
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
  "builder_included",
  "builder",
];
const BUILDER_FUNDING_STATES: BuilderFundingState[] = [
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
  "buy_builder",
  "resume_checkout",
  "manage_builder",
];

function coerceCommunity(value: unknown): CloudFounderBillingCommunity | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const communityId = nullableString(row.community_id);
  if (!communityId) return null;
  const rawStatus = nullableString(row.status);
  const allowedStatuses: CloudFounderBillingCommunityStatus[] = [
    "operator_comped",
    "managed_required",
    "managed_checkout_pending",
    "archived",
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
  return {
    community_id: communityId,
    community_name: nullableString(row.community_name) ?? "Untitled community",
    community_slug: nullableString(row.community_slug) ?? "",
    lifecycle_status: row.lifecycle_status === "archived" ? "archived" : "active",
    lifecycle_generation: Math.max(0, Math.floor(finiteNumber(row.lifecycle_generation))),
    builder_access_mode:
      row.builder_access_mode === "free" ||
      row.builder_access_mode === "grandfathered" ||
      row.builder_access_mode === "subscription_required"
        ? row.builder_access_mode
        : "invalid",
    archive_billing_cleanup_status:
      row.archive_billing_cleanup_status === "pending" ||
      row.archive_billing_cleanup_status === "complete" ||
      row.archive_billing_cleanup_status === "blocked"
        ? row.archive_billing_cleanup_status
        : null,
    funding_lane: fundingLane,
    funding_state: fundingState,
    allowed_actions: allowedActions,
    funding_mode:
      row.funding_mode === "operator_comp"
        ? "operator_comp"
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

export function coerceOverview(payload: unknown): CloudFounderBillingOverview {
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
    unassigned_subscriptions: Array.isArray(row.unassigned_subscriptions)
      ? row.unassigned_subscriptions.flatMap((value) => {
          if (!value || typeof value !== "object") return [];
          const subscription = value as Record<string, unknown>;
          const subscriptionId = nullableString(subscription.subscription_id);
          const status = nullableString(subscription.status);
          if (
            !subscriptionId ||
            !status ||
            !["active", "past_due", "cancel_at_period_end", "canceled", "ended"].includes(status)
          ) return [];
          return [{
            subscription_id: subscriptionId,
            status: status as CloudFounderBillingUnassignedSubscription["status"],
            grants_setup: subscription.grants_setup === true,
            monthly_price_base_units: finiteNumber(subscription.monthly_price_base_units, 7_900),
            current_period_start_at: nullableString(subscription.current_period_start_at) ?? "",
            current_period_end_at: nullableString(subscription.current_period_end_at) ?? "",
            cancel_at_period_end: subscription.cancel_at_period_end === true,
          }];
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

export async function startCloudPublicBuilderCheckout(): Promise<{ checkout_url: string }> {
  const client = createConvexClient();
  const payload = await client.action(
    "founderBilling:startPublicBuilderCheckout" as any,
    {},
  ) as { checkout_url?: unknown } | null;
  const checkoutUrl = nullableString(payload?.checkout_url);
  if (!checkoutUrl) throw new Error("stripe_checkout_url_missing");
  return { checkout_url: checkoutUrl };
}

export async function startCloudFounderBillingPortal<SessionT>(params: {
  session: SessionT;
  communityId?: string | null;
  founderSubscriptionId?: string | null;
  returnUrl: string;
}): Promise<{ portal_url: string }> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  const payload = await client.action("founderBilling:startFounderBillingPortal" as any, {
    authSubject,
    communityId: params.communityId || undefined,
    founderSubscriptionId: params.founderSubscriptionId || undefined,
    returnUrl: params.returnUrl,
  }) as { portal_url?: unknown } | null;
  const portalUrl = nullableString(payload?.portal_url);
  if (!portalUrl) throw new Error("stripe_billing_portal_url_missing");
  return { portal_url: portalUrl };
}
