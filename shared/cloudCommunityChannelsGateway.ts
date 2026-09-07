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
  access_mode?: "all_members" | "restricted";
  capabilities?: { canRead: boolean; canPost: boolean; canReply: boolean; canManage: boolean };
};

export type CloudCommunityChannelsResult = {
  channels: CloudCommunityChannel[];
  max_active_channels: number;
  isComplete?: boolean;
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
    accessMode?: "all_members" | "restricted";
  },
): Promise<CloudCommunityChannel> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation("communityChannels:createCommunityChannel" as any, {
    authSubject,
    communityId: params.communityId,
    name: params.name,
    ...(params.accessMode ? { accessMode: params.accessMode } : {}),
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

export async function reorderCloudCommunityChannels<SessionT>(
  params: CloudCommunityChannelsGatewayParams<SessionT> & {
    communityId: string;
    orderedChannelIds: string[];
  },
): Promise<CloudCommunityChannel[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const result = await client.mutation("communityChannels:reorderCommunityChannels" as any, {
    authSubject,
    communityId: params.communityId,
    orderedChannelIds: params.orderedChannelIds,
  }) as { channels?: CloudCommunityChannel[] };
  return Array.isArray(result?.channels) ? result.channels : [];
}

export async function setCloudCommunityChannelPinnedRoot<SessionT>(
  params: CloudCommunityChannelsGatewayParams<SessionT> & {
    communityId: string;
    channelId?: string | null;
    rootId: string | null;
  },
): Promise<{ pinned_root_id: string | null }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const result = await client.mutation("communityChannels:setCommunityChannelPinnedRoot" as any, {
    authSubject,
    communityId: params.communityId,
    ...(params.channelId ? { channelId: params.channelId } : null),
    rootId: params.rootId,
  }) as { pinned_root_id?: string | null };
  return { pinned_root_id: String(result?.pinned_root_id ?? "").trim() || null };
}

export function subscribeCloudCommunityChannels(params: {
  liveClient: CloudCommunityChatLiveClient;
  communityId: string;
  onUpdate: (result: CloudCommunityChannelsResult) => void;
  onError?: (error: unknown) => void;
}): () => void {
  return subscribeChannelDirectoryPages({
    watch: (section, cursor) => params.liveClient.client.watchQuery(
      (api as any).communityChannels.listCommunityChannelPage,
      { authSubject: params.liveClient.authSubject, communityId: params.communityId as any,
        section, paginationOpts: { cursor, numItems: 50 } } as any,
    ),
    onUpdate: params.onUpdate, onError: params.onError,
  });
}

// Each page stays reactive. An earlier page change invalidates its descendants
// before publishing, so stale grants cannot linger in an assembled directory.
export function subscribeChannelDirectoryPages(params: {
  watch: (section: "shared" | "private", cursor: string | null) => {
    localQueryResult: () => any; onUpdate: (callback: () => void) => () => void;
  };
  onUpdate: (result: CloudCommunityChannelsResult) => void;
  onError?: (error: unknown) => void;
}): () => void {
  type Slot = { active: boolean; stop?: () => void; fingerprint?: string; channels: CloudCommunityChannel[] };
  const pages: Slot[] = [];
  let closed = false;
  const trim = (index: number) => {
    for (const slot of pages.splice(index)) { slot.active = false; slot.stop?.(); }
  };
  const load = (section: "shared" | "private", cursor: string | null) => {
    if (closed) return;
    const index = pages.length;
    const slot: Slot = { active: true, channels: [] }; pages.push(slot);
    const watch = params.watch(section, cursor);
    const publish = () => {
      if (closed || !slot.active) return;
      try {
        const result = watch.localQueryResult();
        if (result === undefined) return;
        const fingerprint = JSON.stringify(result);
        if (slot.fingerprint === fingerprint) return;
        slot.fingerprint = fingerprint;
        trim(index + 1);
        slot.channels = Array.isArray(result.page) ? result.page : [];
        const isComplete = result.isDone === true && section === "private";
        const unique = new Map(pages.flatMap(page => page.channels).map(channel => [channel.id || channel.slug, channel]));
        params.onUpdate({ ...coerceCommunityChannelsResult({ channels: [...unique.values()].sort((a, b) =>
          a.position - b.position || a.id.localeCompare(b.id)), max_active_channels: result.max_active_channels }), isComplete });
        if (!result.isDone) {
          if (!result.continueCursor || result.continueCursor === cursor) throw new Error("community_channel_cursor_invalid");
          load(section, result.continueCursor);
        } else if (section === "shared") load("private", null);
      } catch (error) {
        trim(index + 1); slot.channels = []; slot.fingerprint = undefined;
        params.onUpdate({ channels: [], max_active_channels: 10, isComplete: false });
        params.onError?.(error);
      }
    };
    slot.stop = watch.onUpdate(publish);
    publish();
  };
  load("shared", null);
  return () => { closed = true; trim(0); };
}
