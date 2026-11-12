// Owner moments on Home (convex/communityOwnerMoments.ts).
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { OwnerMoment } from "./communityOwnerMoments";

type Params = { session: unknown; communityId: string };

export async function fetchOwnerMoment(params: Params): Promise<{ moment: OwnerMoment; isNew: boolean } | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return (await client.query("communityOwnerMoments:getOwnerMoment" as any, { authSubject, communityId: params.communityId })) ?? null;
}

export async function markOwnerMomentShown(params: Params & { key: string }): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  await client.mutation("communityOwnerMoments:markOwnerMomentShown" as any, { authSubject, communityId: params.communityId, key: params.key });
}

export async function dismissOwnerMoment(params: Params & { key: string }): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  await client.mutation("communityOwnerMoments:dismissOwnerMoment" as any, { authSubject, communityId: params.communityId, key: params.key });
}
