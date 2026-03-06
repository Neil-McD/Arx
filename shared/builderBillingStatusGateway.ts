import { type CloudAuthSession } from "./cloudAuthSession";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";

export type BuilderBillingStatus = {
  user_id: string;
  builder_tier: "free" | "builder" | "architect" | "pro";
  max_communities: number;
  platform_fee_bps: number;
  has_payouts: boolean;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
};

export type DevBuilderTier = "free" | "builder" | "architect";

function normalizeBuilderTier(raw: unknown): BuilderBillingStatus["builder_tier"] {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "builder") return "builder";
  if (value === "pro" || value === "architect") return "architect";
  return "free";
}

async function loadBuilderBillingStatusViaConvex(session: CloudAuthSession): Promise<BuilderBillingStatus | null> {
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
    has_payouts: Boolean(row.has_payouts),
    subscription_status: row.subscription_status ?? null,
    current_period_end: row.current_period_end ?? null,
    cancel_at_period_end:
      row.cancel_at_period_end === null || row.cancel_at_period_end === undefined
        ? null
        : Boolean(row.cancel_at_period_end),
  };
}

async function setDevBuilderTierViaConvex(session: CloudAuthSession, tier: DevBuilderTier): Promise<void> {
  requireConvexUrl();
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  await client.mutation("auth:setDevTierOverride" as any, {
    authSubject,
    tier,
  });
}

export async function loadBuilderBillingStatusCanonical(params: {
  session: CloudAuthSession;
}): Promise<BuilderBillingStatus | null> {
  return await loadBuilderBillingStatusViaConvex(params.session);
}

export async function setDevBuilderTierCanonical(params: {
  session: CloudAuthSession;
  tier: DevBuilderTier;
}): Promise<void> {
  await setDevBuilderTierViaConvex(params.session, params.tier);
}
