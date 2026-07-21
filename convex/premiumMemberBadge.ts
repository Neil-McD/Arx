import { readCanonicalAccountTier } from "./accountEntitlementCore";

export type PublicPremiumMemberBadge = {
  kind: "polynet_premium";
  label: "Premium";
};

export async function resolvePublicPremiumMemberBadgeForUserId(
  ctx: any,
  userId: any,
  nowMs: number = Date.now(),
): Promise<PublicPremiumMemberBadge | null> {
  if (!userId) return null;
  return (await readCanonicalAccountTier(ctx, userId, nowMs)) === "architect"
    ? { kind: "polynet_premium", label: "Premium" }
    : null;
}
