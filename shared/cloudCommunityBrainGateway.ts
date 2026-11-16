import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { BrainMap } from "./communityBrain";

// The community brain's map (convex/communityBrain.ts), as this viewer may
// see it: the community's, or a pod's by its room.
export async function fetchBrainMap(params: { session: unknown; communityId: string; podChannelId?: string | null }): Promise<BrainMap> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return await client.query("communityBrain:getBrainMap" as any, {
    authSubject, communityId: params.communityId, ...(params.podChannelId ? { podChannelId: params.podChannelId } : {}),
  });
}
