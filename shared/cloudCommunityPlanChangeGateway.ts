// A member's own plan, and changing it (convex/communityPlanChange.ts).
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

export type CloudMyPlanOption = {
  key: string | null; name: string; includes: string[];
  amount_base_units: number; currency: string; currency_decimals: number; current: boolean;
};
export type CloudMyPlan = {
  member: boolean; can_change: boolean; reason: string | null;
  current: { key: string | null; name: string; includes: string[] } | null;
  plans: CloudMyPlanOption[];
};

export async function fetchCloudMyCommunityPlan(params: { session: unknown; communityId: string }): Promise<CloudMyPlan> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return await client.query("communityPlanChange:getMyCommunityPlan" as any, { authSubject, communityId: params.communityId });
}

export async function changeCloudMyCommunityPlan(params: { session: unknown; communityId: string; plan: string | null }): Promise<{ status: "changing" | "payment_problem" }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return await client.action("communityPlanChange:changeMyCommunityPlan" as any, { authSubject, communityId: params.communityId, plan: params.plan });
}
