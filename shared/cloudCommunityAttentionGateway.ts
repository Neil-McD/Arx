import { coerceGatewayRows } from "./cloudGateway";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

type CloudCommunityAttentionGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudCommunityAttentionRow = {
  community_id: string;
  chat: boolean;
  ai_feed: boolean;
  resources: boolean;
};

export async function listCloudCommunityAttentionRows<SessionT>(
  params: CloudCommunityAttentionGatewayParams<SessionT> & {
    communityIds: string[];
  },
): Promise<CloudCommunityAttentionRow[]> {
  const normalizedCommunityIds = Array.from(
    new Set(params.communityIds.map((communityId) => String(communityId ?? "").trim()).filter(Boolean)),
  );
  if (normalizedCommunityIds.length === 0) return [];
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listMyCommunityAttention" as any, {
    authSubject,
    communityIds: normalizedCommunityIds,
  });
  return coerceGatewayRows<CloudCommunityAttentionRow>(payload);
}

export async function markCloudCommunitySurfaceSeen<SessionT>(
  params: CloudCommunityAttentionGatewayParams<SessionT> & {
    communityId: string;
    surface: "chat" | "ai_feed" | "resources";
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:markCommunitySurfaceSeen" as any, {
    authSubject,
    communityId: params.communityId,
    surface: params.surface,
  });
}
