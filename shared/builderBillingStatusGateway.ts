import { type AuthSessionLike } from "./authSession";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";

export type BuilderBillingStatus = {
  user_id: string;
  builder_tier: "free" | "builder" | "architect";
  max_communities: number;
  platform_fee_bps: number;
  stripe_connect: {
    status: "not_connected" | "onboarding_required" | "pending_requirements" | "ready" | "restricted";
    account_id: string | null;
    details_submitted: boolean;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    requirements_currently_due: string[];
    requirements_eventually_due: string[];
    requirements_disabled_reason: string | null;
    onboarding_complete_at: number | null;
    can_accept_charges: boolean;
  };
};

export type DevBuilderTier = "free" | "builder" | "architect";

function normalizeBuilderTier(raw: unknown): BuilderBillingStatus["builder_tier"] {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "builder") return "builder";
  if (value === "architect") return "architect";
  if (value === "pro") return "builder";
  return "free";
}

async function loadBuilderBillingStatusViaConvex(session: AuthSessionLike): Promise<BuilderBillingStatus | null> {
  requireConvexUrl();
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);

  const row = (await client.query("auth:getBuilderBillingStatus" as any, {
    authSubject,
  })) as BuilderBillingStatus | null;
  if (!row) return null;
  return {
    ...row,
    builder_tier: normalizeBuilderTier(row.builder_tier),
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
      can_accept_charges: row.stripe_connect?.can_accept_charges === true,
    },
  };
}

async function setDevBuilderTierViaConvex(session: AuthSessionLike, tier: DevBuilderTier): Promise<void> {
  requireConvexUrl();
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  await client.mutation("auth:setDevTierOverride" as any, {
    authSubject,
    tier,
  });
}

export async function loadBuilderBillingStatusCanonical(params: {
  session: AuthSessionLike;
}): Promise<BuilderBillingStatus | null> {
  return await loadBuilderBillingStatusViaConvex(params.session);
}

export async function setDevBuilderTierCanonical(params: {
  session: AuthSessionLike;
  tier: DevBuilderTier;
}): Promise<void> {
  await setDevBuilderTierViaConvex(params.session, params.tier);
}
