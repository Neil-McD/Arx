// Home's "For you" for a member (convex/communityHomeMoments.ts).
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { MemberNextStep } from "./communityHomeMoments";

export async function fetchMemberHomeSteps(params: { session: unknown; communityId: string }): Promise<MemberNextStep[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return (await client.query("communityHomeMoments:getMemberHomeSteps" as any, { authSubject, communityId: params.communityId })) ?? [];
}
