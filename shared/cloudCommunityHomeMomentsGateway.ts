// Home's centre (convex/communityHomeMoments.ts).
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { HomeMoment, MemberNextStep } from "./communityHomeMoments";

export type CloudHomeMoments = { since: string; firstVisit: boolean; moments: HomeMoment[]; recent: HomeMoment[]; nextStep: MemberNextStep | null };

export async function recordCloudHomeVisit(params: { session: unknown; communityId: string }): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  await client.mutation("communityHomeMoments:recordHomeVisit" as any, { authSubject, communityId: params.communityId });
}

export async function fetchCloudHomeMoments(params: { session: unknown; communityId: string; asMember?: boolean }): Promise<CloudHomeMoments | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return (await client.query("communityHomeMoments:getHomeMoments" as any, {
    authSubject, communityId: params.communityId, ...(params.asMember ? { asMember: true } : {}),
  })) ?? null;
}
