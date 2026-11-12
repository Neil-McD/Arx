// Tiers and grants (convex/communityTiers.ts; one door, docs/specs/builder-modalities-v0.md).
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

export type CloudCommunityTier = {
  key: string;
  name: string;
  rank: number;
  grants: string[];
  base: boolean;
  archived: boolean;
  monthly_amount_base_units: number | null;
  currency: string;
  members: number;
};

type TiersCall = { session: unknown; communityId: string };

export async function fetchCloudCommunityTiers(params: TiersCall): Promise<CloudCommunityTier[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  const result = await client.query("communityTiers:listCommunityTiers" as any, { authSubject, communityId: params.communityId });
  return Array.isArray(result?.tiers) ? result.tiers : [];
}

export async function saveCloudCommunityTier(params: TiersCall & { key?: string; name: string; grants: string[]; monthlyAmountBaseUnits?: number }): Promise<{ key: string }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return await client.mutation("communityTiers:saveCommunityTier" as any, {
    authSubject, communityId: params.communityId, name: params.name, grants: params.grants,
    ...(params.key ? { key: params.key } : {}),
    ...(typeof params.monthlyAmountBaseUnits === "number" ? { monthlyAmountBaseUnits: params.monthlyAmountBaseUnits } : {}),
  });
}

export async function archiveCloudCommunityTier(params: TiersCall & { key: string }): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  await client.mutation("communityTiers:archiveCommunityTier" as any, { authSubject, communityId: params.communityId, key: params.key });
}
