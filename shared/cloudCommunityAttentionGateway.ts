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
  // True for lightweight multi-community rail rows that short-circuit after the
  // first unread signal and omit per-channel / divider detail.
  is_rail_summary?: boolean;
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

export const MAX_CLOUD_COMMUNITY_RAIL_ATTENTION_BATCH = 25;

type RailAttentionRow = {
  community_id: string;
  chat: boolean;
  resources: boolean;
  events: boolean;
  mentions: boolean;
};

function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

export function subscribeCloudCommunityAttentionRows(params: {
  liveClient: CloudCommunityChatLiveClient;
  communityIds: string[];
  // When provided, only the active community subscribes to full per-channel
  // pages while all other sidebar communities share a single batched rail query.
  activeCommunityId?: string | null;
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

  const useRailBatching = params.activeCommunityId !== undefined;
  const activeCommunityId = String(params.activeCommunityId ?? "").trim();
  const pagedCommunityIds = useRailBatching
    ? activeCommunityId && normalizedCommunityIds.includes(activeCommunityId)
      ? [activeCommunityId]
      : []
    : normalizedCommunityIds;
  const railCommunityIds = useRailBatching
    ? normalizedCommunityIds.filter((communityId) => communityId !== activeCommunityId)
    : [];

  const pagedRows = new Map<string, CloudCommunityAttentionRow>();
  const railRowsByChunk = new Map<number, CloudCommunityAttentionRow[]>();
  const emitMerged = () => {
    const merged = new Map<string, CloudCommunityAttentionRow>();
    for (const chunkRows of railRowsByChunk.values()) {
      for (const row of chunkRows) merged.set(row.community_id, row);
    }
    for (const [communityId, row] of pagedRows.entries()) {
      merged.set(communityId, row);
    }
    // Omitted communities are unknown/loading, not an authoritative false.
    // This also removes previously authorized private rows on invalidation.
    params.onUpdate([...merged.values()]);
  };

  const disposers: Array<() => void> = [];
  for (const communityId of pagedCommunityIds) {
    disposers.push(
      subscribeCommunityPages<AttentionPage>({
        watch: (section, cursor) => params.liveClient.client.watchQuery(
          (api as any).communityAttention.listMyCommunityAttentionPage,
          { authSubject: params.liveClient.authSubject, communityId,
            section, paginationOpts: { cursor, numItems: 10 } } as any,
        ) as any,
        onUpdate: (pages, isComplete) => {
          pagedRows.delete(communityId);
          if (isComplete && pages.length) {
            const channels = [...new Map(pages.flatMap(p => p.attention.channels ?? [])
              .map(channel => [channel.channel_id || channel.channel_slug, channel])).values()];
            const first = pages[0]!.attention;
            pagedRows.set(communityId, { ...first, channels,
              chat: channels.some(channel => channel.chat), mentions: channels.some(channel => channel.mentions),
              chat_last_seen_at: channels.find(channel => channel.channel_slug === "general")?.chat_last_seen_at ?? null });
          }
          emitMerged();
        },
        onError: params.onError,
      }),
    );
  }

  for (const [chunkIndex, communityIdChunk] of chunkIds(railCommunityIds, MAX_CLOUD_COMMUNITY_RAIL_ATTENTION_BATCH).entries()) {
    let disposed = false;
    let lastFingerprint: string | undefined;
    let watch: {
      localQueryResult: () => RailAttentionRow[] | undefined;
      onUpdate: (callback: () => void) => () => void;
    };
    try {
      watch = params.liveClient.client.watchQuery(
        (api as any).communityAttention.listMyCommunityRailAttention,
        {
          authSubject: params.liveClient.authSubject,
          communityIds: communityIdChunk,
        } as any,
      ) as any;
    } catch (error) {
      railRowsByChunk.delete(chunkIndex);
      emitMerged();
      params.onError?.(error);
      continue;
    }
    const publishChunk = () => {
      if (disposed) return;
      try {
        const result = watch.localQueryResult();
        if (result === undefined) return;
        if (!Array.isArray(result)) throw new Error("community_rail_attention_invalid");
        const fingerprint = JSON.stringify(result);
        if (fingerprint === lastFingerprint) return;
        lastFingerprint = fingerprint;
        railRowsByChunk.set(
          chunkIndex,
          result.map((row) => ({
            community_id: String(row.community_id ?? "").trim(),
            chat: Boolean(row.chat),
            resources: Boolean(row.resources),
            events: Boolean(row.events),
            mentions: Boolean(row.mentions),
            chat_last_seen_at: null,
            is_rail_summary: true,
            channels: [],
          })).filter((row) => Boolean(row.community_id)),
        );
        emitMerged();
      } catch (error) {
        lastFingerprint = undefined;
        railRowsByChunk.delete(chunkIndex);
        emitMerged();
        params.onError?.(error);
      }
    };
    const stop = watch.onUpdate(publishChunk);
    disposers.push(() => {
      disposed = true;
      stop();
    });
    publishChunk();
  }

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
