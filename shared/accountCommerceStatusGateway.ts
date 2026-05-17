import { type AuthSessionLike } from "./authSession";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";

export type AccountCommerceStatus = {
  user_id: string;
  account_tier: "free" | "architect";
  max_communities: number;
  platform_fee_bps: number;
  stripe_connect: {
    status: "not_connected" | "onboarding_required" | "pending_requirements" | "ready" | "restricted";
    account_id: string | null;
    country: string | null;
    service_agreement: string | null;
    transfers_enabled: boolean;
    details_submitted: boolean;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    requirements_currently_due: string[];
    requirements_eventually_due: string[];
    requirements_disabled_reason: string | null;
    onboarding_complete_at: number | null;
    can_receive_community_revenue: boolean;
    can_accept_charges: boolean;
  };
};

export type DevAccountTier = "free" | "architect";

function normalizeAccountTier(raw: unknown): AccountCommerceStatus["account_tier"] {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "architect") return "architect";
  return "free";
}

async function loadAccountCommerceStatusViaConvex(session: AuthSessionLike): Promise<AccountCommerceStatus | null> {
  requireConvexUrl();
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);

  const row = (await client.query("auth:getAccountCommerceStatus" as any, {
    authSubject,
  })) as AccountCommerceStatus | null;
  if (!row) return null;
  return {
    ...row,
    account_tier: normalizeAccountTier(row.account_tier),
    max_communities: Number(row.max_communities ?? 0),
    platform_fee_bps: Number(row.platform_fee_bps ?? 0),
    stripe_connect: {
      status:
        row.stripe_connect?.status === "onboarding_required" ||
        row.stripe_connect?.status === "pending_requirements" ||
        row.stripe_connect?.status === "ready" ||
        row.stripe_connect?.status === "restricted"
          ? row.stripe_connect.status
          : "not_connected",
      account_id:
        typeof row.stripe_connect?.account_id === "string" && row.stripe_connect.account_id.trim()
          ? row.stripe_connect.account_id.trim()
          : null,
      country:
        typeof row.stripe_connect?.country === "string" && row.stripe_connect.country.trim()
          ? row.stripe_connect.country.trim().toUpperCase()
          : null,
      service_agreement:
        typeof row.stripe_connect?.service_agreement === "string" &&
        row.stripe_connect.service_agreement.trim()
          ? row.stripe_connect.service_agreement.trim()
          : null,
      transfers_enabled: row.stripe_connect?.transfers_enabled === true,
      details_submitted: row.stripe_connect?.details_submitted === true,
      charges_enabled: row.stripe_connect?.charges_enabled === true,
      payouts_enabled: row.stripe_connect?.payouts_enabled === true,
      requirements_currently_due: Array.isArray(row.stripe_connect?.requirements_currently_due)
        ? row.stripe_connect.requirements_currently_due
            .map((value) => String(value ?? "").trim())
            .filter(Boolean)
        : [],
      requirements_eventually_due: Array.isArray(row.stripe_connect?.requirements_eventually_due)
        ? row.stripe_connect.requirements_eventually_due
            .map((value) => String(value ?? "").trim())
            .filter(Boolean)
        : [],
      requirements_disabled_reason:
        typeof row.stripe_connect?.requirements_disabled_reason === "string" &&
        row.stripe_connect.requirements_disabled_reason.trim()
          ? row.stripe_connect.requirements_disabled_reason.trim()
          : null,
      onboarding_complete_at:
        typeof row.stripe_connect?.onboarding_complete_at === "number" &&
        Number.isFinite(row.stripe_connect.onboarding_complete_at)
          ? row.stripe_connect.onboarding_complete_at
          : null,
      can_receive_community_revenue:
        row.stripe_connect?.can_receive_community_revenue === true ||
        row.stripe_connect?.can_accept_charges === true,
      can_accept_charges:
        row.stripe_connect?.can_accept_charges === true ||
        row.stripe_connect?.can_receive_community_revenue === true,
    },
  };
}

async function setDevAccountTierViaConvex(session: AuthSessionLike, tier: DevAccountTier): Promise<void> {
  requireConvexUrl();
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  await client.mutation("auth:setDevTierOverride" as any, {
    authSubject,
    tier,
  });
}

export async function loadAccountCommerceStatusCanonical(params: {
  session: AuthSessionLike;
}): Promise<AccountCommerceStatus | null> {
  return await loadAccountCommerceStatusViaConvex(params.session);
}

export async function setDevAccountTierCanonical(params: {
  session: AuthSessionLike;
  tier: DevAccountTier;
}): Promise<void> {
  await setDevAccountTierViaConvex(params.session, params.tier);
}
