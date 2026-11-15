import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { BriefView } from "./communityBriefs";

// A place's brief for the panels (convex/communityBriefs.ts): the
// community's, or a pod's by its room. brief is null when there is nothing to
// show (no brief yet, the guide is off, or it's old).
export type PlaceBriefView = { brief: BriefView | null };

type BriefCall = { session: unknown; communityId: string; podChannelId?: string | null };

export async function fetchPlaceBrief(params: BriefCall): Promise<PlaceBriefView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return await client.query("communityBriefs:getPlaceBrief" as any, {
    authSubject, communityId: params.communityId, ...(params.podChannelId ? { podChannelId: params.podChannelId } : {}),
  });
}
