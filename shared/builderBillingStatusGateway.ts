import { type AuthSessionLike } from "./authSession";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";

export type BuilderBillingStatus = {
  user_id: string;
  builder_tier: "free" | "builder";
  max_communities: number;
};

export type DevBuilderTier = "free" | "builder";

function normalizeBuilderTier(raw: unknown): BuilderBillingStatus["builder_tier"] {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "builder") return "builder";
  if (value === "architect" || value === "pro") return "builder";
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
