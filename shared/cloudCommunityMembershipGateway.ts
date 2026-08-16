import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import { coerceGatewayRows, parseGatewayNumberLike } from "./cloudGateway";

type CloudCommunityMembershipGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudCommunityMembershipCommunitySelect = "full" | "minimal";

export type CloudCommunityMembershipRow<TCommunity = unknown> = {
  community_id: string;
  role: string;
  communities: TCommunity;
};

export async function listCloudCommunityMembershipRows<SessionT, TCommunity = unknown>(
  params: CloudCommunityMembershipGatewayParams<SessionT> & {
    selectMode?: CloudCommunityMembershipCommunitySelect;
  },
): Promise<Array<CloudCommunityMembershipRow<TCommunity>>> {
  const selectMode = params.selectMode ?? "full";
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("communityAdmin:listCommunityMemberships" as any, {
    authSubject,
    selectMode,
  });
  return coerceGatewayRows<CloudCommunityMembershipRow<TCommunity>>(payload);
}

export async function countCloudCommunityMembershipRows<SessionT>(
  params: {
    session: SessionT;
    communityId: string;
    sinceIso?: string | null;
  },
): Promise<number | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  if (!params.sinceIso) {
    const payload = await client.mutation("communityAdmin:syncCommunityMembershipCount" as any, {
      authSubject,
      communityId: params.communityId,
    });
    return parseGatewayNumberLike(payload);
  }
  const payload = await client.query("communityAdmin:countCommunityMemberships" as any, {
    authSubject,
    communityId: params.communityId,
    sinceIso: params.sinceIso ?? null,
  });
  return parseGatewayNumberLike(payload);
}
