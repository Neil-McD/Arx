import { bootstrapGatewayAuthContext } from "./cloudGateway";

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
  funding_policy: "legacy_byok_allowed" | "managed_required";
  funding_mode: "managed" | "legacy_byok" | "operator_comp";
  status: CloudFounderBillingCommunityStatus;
  model_id: string;
  monthly_price_base_units: number;
  included_cost_micros: number;
  platform_fee_bps: number;
  checkout_pending: boolean;
  subscription_id: string | null;
  current_period_start_at: string | null;
  current_period_end_at: string | null;
  cancel_at_period_end: boolean;
  usage: {
    reserved_cost_micros: number;
    settled_cost_micros: number;
    remaining_cost_micros: number;
  } | null;
};

export type CloudFounderBillingOverview = {
  model_id: string;
  monthly_price_base_units: number;
  included_cost_micros: number;
  communities: CloudFounderBillingCommunity[];
  managed_monthly_total_base_units: number;
};

export const EMPTY_FOUNDER_BILLING_OVERVIEW: CloudFounderBillingOverview = {
  model_id: "gpt-5.6-luna",
  monthly_price_base_units: 7_900,
  included_cost_micros: 20_000_000,
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
  const rawUsage = row.usage && typeof row.usage === "object"
    ? row.usage as Record<string, unknown>
    : null;
  return {
    community_id: communityId,
    community_name: nullableString(row.community_name) ?? "Untitled community",
    community_slug: nullableString(row.community_slug) ?? "",
    funding_policy: row.funding_policy === "legacy_byok_allowed"
      ? "legacy_byok_allowed"
      : "managed_required",
    funding_mode:
      row.funding_mode === "operator_comp"
        ? "operator_comp"
        : row.funding_mode === "legacy_byok"
          ? "legacy_byok"
          : "managed",
    status,
    model_id: nullableString(row.model_id) ?? "gpt-5.6-luna",
    monthly_price_base_units: finiteNumber(row.monthly_price_base_units, 7_900),
    included_cost_micros: finiteNumber(row.included_cost_micros, 20_000_000),
    platform_fee_bps: finiteNumber(row.platform_fee_bps),
    checkout_pending: row.checkout_pending === true,
    subscription_id: nullableString(row.subscription_id),
    current_period_start_at: nullableString(row.current_period_start_at),
    current_period_end_at: nullableString(row.current_period_end_at),
    cancel_at_period_end: row.cancel_at_period_end === true,
    usage: rawUsage
      ? {
          reserved_cost_micros: finiteNumber(rawUsage.reserved_cost_micros),
          settled_cost_micros: finiteNumber(rawUsage.settled_cost_micros),
          remaining_cost_micros: finiteNumber(rawUsage.remaining_cost_micros),
        }
      : null,
  };
}

function coerceOverview(payload: unknown): CloudFounderBillingOverview {
  if (!payload || typeof payload !== "object") return EMPTY_FOUNDER_BILLING_OVERVIEW;
  const row = payload as Record<string, unknown>;
  return {
    model_id: nullableString(row.model_id) ?? "gpt-5.6-luna",
    monthly_price_base_units: finiteNumber(row.monthly_price_base_units, 7_900),
    included_cost_micros: finiteNumber(row.included_cost_micros, 20_000_000),
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
