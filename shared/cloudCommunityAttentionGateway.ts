import { api } from "../convex/_generated/api";
import { subscribeCommunityPages, type CommunityPage } from "./subscribeCommunityPages";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { CloudCommunityChatLiveClient } from "./cloudCommunityChatGateway";

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

type AttentionPage = CommunityPage & { attention: CloudCommunityAttentionRow };

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
  const rows = new Map<string, CloudCommunityAttentionRow>();
  const disposers = normalizedCommunityIds.map(communityId => subscribeCommunityPages<AttentionPage>({
    watch: (section, cursor) => params.liveClient.client.watchQuery(
      (api as any).communityAttention.listMyCommunityAttentionPage,
      { authSubject: params.liveClient.authSubject, communityId,
        section, paginationOpts: { cursor, numItems: 10 } } as any,
    ) as any,
    onUpdate: (pages, isComplete) => {
      rows.delete(communityId);
      if (isComplete && pages.length) {
        const channels = [...new Map(pages.flatMap(p => p.attention.channels ?? [])
          .map(channel => [channel.channel_id || channel.channel_slug, channel])).values()];
        const first = pages[0]!.attention;
        rows.set(communityId, { ...first, channels,
          chat: channels.some(channel => channel.chat), mentions: channels.some(channel => channel.mentions),
          chat_last_seen_at: channels.find(channel => channel.channel_slug === "general")?.chat_last_seen_at ?? null });
      }
      // Omitted communities are unknown/loading, not an authoritative false.
      // This also removes previously authorized private rows on invalidation.
      params.onUpdate([...rows.values()]);
    },
    onError: params.onError,
  }));
  return () => { for (const dispose of disposers) dispose(); };
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
