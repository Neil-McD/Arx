import { createConvexClient } from "./convexAuthenticatedClient";

type DiscoverCommunitiesPayload<TRow> = {
  ok?: boolean;
  communities?: TRow[];
};

export async function listCloudDiscoverCommunities<TRow = unknown>(params?: {
  limit?: number;
}): Promise<TRow[]> {
  const limit = Math.max(1, Math.min(200, Math.floor(params?.limit ?? 60)));
  const client = createConvexClient();
  const payload = (await client.query("community:listPublicDiscoverCommunities" as any, {
    limit,
  })) as DiscoverCommunitiesPayload<TRow> | TRow[] | null;
  if (Array.isArray(payload)) return payload;
  const communities = payload?.communities;
  if (!Array.isArray(communities)) return [];
  return communities;
}
