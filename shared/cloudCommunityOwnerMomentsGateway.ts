// What was noticed, on a host's Home (convex/communityOwnerMoments.ts).
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { OwnerNoticed } from "./communityOwnerMoments";

type Params = { session: unknown; communityId: string };

export async function dismissOwnerMoment(params: Params & { key: string }): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  await client.mutation("communityOwnerMoments:dismissOwnerMoment" as any, { authSubject, communityId: params.communityId, key: params.key });
}

// Home's list: everything noticed that the owner hasn't waved off.
export async function fetchOwnerNoticed(params: Params): Promise<OwnerNoticed[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return (await client.query("communityOwnerMoments:listOwnerNoticed" as any, { authSubject, communityId: params.communityId })) ?? [];
}
