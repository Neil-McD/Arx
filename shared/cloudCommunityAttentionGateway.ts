import { api } from "../convex/_generated/api";
import { coerceGatewayRows } from "./cloudGateway";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { CloudCommunityChatLiveClient } from "./cloudCommunityChatGateway";
import { MAX_COMMUNITY_ATTENTION_COMMUNITIES_PER_QUERY } from "./communityAttentionContract";

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

export function subscribeCloudCommunityAttentionRows(params: {
  liveClient: CloudCommunityChatLiveClient;
  communityIds: string[];
  onUpdate: (rows: CloudCommunityAttentionRow[]) => void;
  onError?: (error: unknown) => void;
}): () => void {
  const normalizedCommunityIds = Array.from(
    new Set(params.communityIds.map((communityId) => String(communityId ?? "").trim()).filter(Boolean)),
  ).sort();
  if (normalizedCommunityIds.length === 0) {
    params.onUpdate([]);
    return () => {};
  }
  const communityIdBatches = Array.from(
    { length: Math.ceil(normalizedCommunityIds.length / MAX_COMMUNITY_ATTENTION_COMMUNITIES_PER_QUERY) },
    (_, batchIndex) => normalizedCommunityIds.slice(
      batchIndex * MAX_COMMUNITY_ATTENTION_COMMUNITIES_PER_QUERY,
      (batchIndex + 1) * MAX_COMMUNITY_ATTENTION_COMMUNITIES_PER_QUERY,
    ),
  );
  const rowsByBatch = new Map<number, CloudCommunityAttentionRow[]>();
  const disposers = communityIdBatches.map((communityIds, batchIndex) => {
    const watch = params.liveClient.client.watchQuery(
      (api as any).communityAttention.listMyCommunityAttention,
      {
        authSubject: params.liveClient.authSubject,
        communityIds,
      } as any,
    );
    const publish = () => {
      try {
        const result = watch.localQueryResult();
        if (typeof result === "undefined") return;
        rowsByBatch.set(batchIndex, coerceGatewayRows<CloudCommunityAttentionRow>(result));
        if (rowsByBatch.size !== communityIdBatches.length) return;
        params.onUpdate(
          communityIdBatches.flatMap((_, index) => rowsByBatch.get(index) ?? []),
        );
      } catch (error) {
        params.onError?.(error);
      }
    };
    publish();
    return watch.onUpdate(publish);
  });
  return () => {
    for (const dispose of disposers) dispose();
  };
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
