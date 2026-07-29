import { createConvexClient } from "./convexAuthenticatedClient";
import type { DiscoverCommunitySnapshot } from "./communityTypes";

type DiscoverCommunitiesPayload = {
  ok?: boolean;
  communities?: DiscoverCommunitySnapshot[];
};

export async function listCloudDiscoverCommunities(params?: {
  limit?: number;
}): Promise<DiscoverCommunitySnapshot[]> {
  const limit = Math.max(1, Math.min(200, Math.floor(params?.limit ?? 60)));
  const client = createConvexClient();
  const payload = (await client.query("communityPublic:listPublicDiscoverCommunities" as any, {
    limit,
  })) as DiscoverCommunitiesPayload | DiscoverCommunitySnapshot[] | null;
  if (Array.isArray(payload)) return payload;
  const communities = payload?.communities;
  if (!Array.isArray(communities)) return [];
  return communities;
}
