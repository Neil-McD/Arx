import { coerceGatewayRows } from "./cloudGateway";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

type CloudCommunityAttentionGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudCommunityAttentionSurface = "chat" | "resources" | "events" | "mentions";

export type CloudCommunityAttentionRow = {
  community_id: string;
  chat: boolean;
  resources: boolean;
  events: boolean;
  mentions: boolean;
  chat_last_seen_at?: number | null;
  channels?: Array<{
    channel_id: string | null;
    channel_slug: string;
    chat: boolean;
    mentions: boolean;
    chat_last_seen_at: number | null;
    latest_activity_at: number | null;
  }>;
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
  const payload = await client.query("communityAttention:listMyCommunityAttention" as any, {
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
  await client.mutation("communityAttention:markCommunitySurfaceSeen" as any, {
    authSubject,
    communityId: params.communityId,
    surface: params.surface,
    ...(typeof params.seenAtMs === "number" && Number.isFinite(params.seenAtMs)
      ? { seenAtMs: Math.floor(params.seenAtMs) }
      : null),
  });
}

export async function acknowledgeCloudCommunityChatRead<SessionT>(
  params: CloudCommunityAttentionGatewayParams<SessionT> & {
    communityId: string;
    channelId?: string | null;
    throughAtMs: number;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityAttention:acknowledgeCommunityChatRead" as any, {
    authSubject,
    communityId: params.communityId,
    ...(params.channelId ? { channelId: params.channelId } : null),
    throughAtMs: Math.floor(params.throughAtMs),
  });
}
