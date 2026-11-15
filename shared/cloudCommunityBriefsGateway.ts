import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { BriefView } from "./communityBriefs";

// A place's brief for the panels (convex/communityBriefs.ts): the
// community's, or a pod's by its room. brief is null when there is nothing to
// show (no brief yet, the guide is off, it's old, or it was hidden).
export type PlaceBriefView = { brief: BriefView | null; can_hide: boolean };

type BriefCall = { session: unknown; communityId: string; podChannelId?: string | null };

export async function fetchPlaceBrief(params: BriefCall): Promise<PlaceBriefView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return await client.query("communityBriefs:getPlaceBrief" as any, {
    authSubject, communityId: params.communityId, ...(params.podChannelId ? { podChannelId: params.podChannelId } : {}),
  });
}

// Takes the brief down until the guide writes the next one.
export async function hidePlaceBrief(params: BriefCall): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  await client.mutation("communityBriefs:hidePlaceBrief" as any, {
    authSubject, communityId: params.communityId, ...(params.podChannelId ? { podChannelId: params.podChannelId } : {}),
  });
}
