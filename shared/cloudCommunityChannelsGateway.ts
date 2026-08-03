import { api } from "../convex/_generated/api";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { CloudCommunityChatLiveClient } from "./cloudCommunityChatGateway";

type CloudCommunityChannelsGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudCommunityChannel = {
  id: string;
  community_id: string;
  system_role: "general" | null;
  is_general: boolean;
  slug: string;
  name: string;
  position: number;
};

export type CloudCommunityChannelsResult = {
  channels: CloudCommunityChannel[];
  max_active_channels: number;
};

function coerceCommunityChannelsResult(payload: unknown): CloudCommunityChannelsResult {
  if (!payload || typeof payload !== "object") {
    return { channels: [], max_active_channels: 10 };
  }
  const result = payload as Partial<CloudCommunityChannelsResult>;
  return {
    channels: Array.isArray(result.channels) ? result.channels : [],
    max_active_channels:
      typeof result.max_active_channels === "number" && Number.isFinite(result.max_active_channels)
        ? Math.max(1, Math.floor(result.max_active_channels))
        : 10,
  };
}

export async function createCloudCommunityChannel<SessionT>(
  params: CloudCommunityChannelsGatewayParams<SessionT> & {
    communityId: string;
    name: string;
  },
): Promise<CloudCommunityChannel> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation("communityChannels:createCommunityChannel" as any, {
    authSubject,
    communityId: params.communityId,
    name: params.name,
  }) as CloudCommunityChannel;
}

export async function renameCloudCommunityChannel<SessionT>(
  params: CloudCommunityChannelsGatewayParams<SessionT> & {
    communityId: string;
    channelId: string;
    name: string;
  },
): Promise<CloudCommunityChannel> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation("communityChannels:renameCommunityChannel" as any, {
    authSubject,
    communityId: params.communityId,
    channelId: params.channelId,
    name: params.name,
  }) as CloudCommunityChannel;
}

export async function deleteCloudCommunityChannel<SessionT>(
  params: CloudCommunityChannelsGatewayParams<SessionT> & {
    communityId: string;
    channelId: string;
  },
): Promise<{ deleted_channel_id: string; deleted_channel_slug: string }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation("communityChannels:deleteCommunityChannel" as any, {
    authSubject,
    communityId: params.communityId,
    channelId: params.channelId,
  }) as { deleted_channel_id: string; deleted_channel_slug: string };
}

export function subscribeCloudCommunityChannels(params: {
  liveClient: CloudCommunityChatLiveClient;
  communityId: string;
  onUpdate: (result: CloudCommunityChannelsResult) => void;
  onError?: (error: unknown) => void;
}): () => void {
  const watch = params.liveClient.client.watchQuery(
    (api as any).communityChannels.listCommunityChannels,
    {
      authSubject: params.liveClient.authSubject,
      communityId: params.communityId as any,
    } as any,
  );
  const publish = () => {
    try {
      const result = watch.localQueryResult();
      if (typeof result === "undefined") return;
      params.onUpdate(coerceCommunityChannelsResult(result));
    } catch (error) {
      params.onError?.(error);
    }
  };
  publish();
  return watch.onUpdate(publish);
}
