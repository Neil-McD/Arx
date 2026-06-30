import { coerceGatewayRows } from "./cloudGateway";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

type CloudCommunityAttentionGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudCommunityAttentionSurface = "chat" | "ai_feed" | "resources" | "events";

export type CloudCommunityAttentionRow = {
  community_id: string;
  chat: boolean;
  ai_feed: boolean;
  resources: boolean;
  events: boolean;
  chat_last_seen_at?: number | null;
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
    surface: CloudCommunityAttentionSurface;
    seenAtMs?: number;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:markCommunitySurfaceSeen" as any, {
    authSubject,
    communityId: params.communityId,
    surface: params.surface,
    ...(typeof params.seenAtMs === "number" && Number.isFinite(params.seenAtMs)
      ? { seenAtMs: Math.floor(params.seenAtMs) }
      : null),
  });
}

export async function markCloudCommunityChatReadAt<SessionT>(
  params: CloudCommunityAttentionGatewayParams<SessionT> & {
    communityId: string;
    seenAtMs?: number;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:markCommunityChatReadAt" as any, {
    authSubject,
    communityId: params.communityId,
    ...(typeof params.seenAtMs === "number" && Number.isFinite(params.seenAtMs)
      ? { seenAtMs: Math.floor(params.seenAtMs) }
      : null),
  });
}
