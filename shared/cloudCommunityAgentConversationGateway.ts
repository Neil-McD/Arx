import type { AuthSessionLike } from "./authSession";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

export type CloudCommunityAgentChannel = {
  channel_id: string;
  episode_id: string;
  episode_ordinal: number;
  thread_id: string;
  thread_key: string;
  community_id: string | null;
  model_id: string;
  context_version: number;
};

function normalizeCommunityAgentChannel(payload: CloudCommunityAgentChannel | null): CloudCommunityAgentChannel {
  const threadKey = String(payload?.thread_key ?? "").trim();
  const channelId = String(payload?.channel_id ?? "").trim();
  const episodeId = String(payload?.episode_id ?? "").trim();
  if (!payload || !threadKey || !channelId || !episodeId) {
    throw new Error("member_agent_channel_unavailable");
  }
  return {
    channel_id: channelId,
    episode_id: episodeId,
    episode_ordinal: Number.isFinite(payload.episode_ordinal)
      ? Math.max(1, Math.floor(payload.episode_ordinal))
      : 1,
    thread_id: String(payload.thread_id ?? "").trim(),
    thread_key: threadKey,
    community_id: String(payload.community_id ?? "").trim() || null,
    model_id: String(payload.model_id ?? "").trim(),
    context_version: Number.isFinite(payload.context_version)
      ? Math.max(0, Math.floor(payload.context_version))
      : 0,
  };
}

export async function ensureCloudCommunityAgentConversation(params: { session: AuthSessionLike; initialCommunityId: string | null }): Promise<CloudCommunityAgentChannel> {
  if (!params.initialCommunityId) throw new Error("community_required");
  const { client } = await bootstrapConvexAuthenticatedClient(params.session);
  return normalizeCommunityAgentChannel(await client.mutation("threads:ensureCommunityAgentConversation" as any, { communityId: params.initialCommunityId }) as CloudCommunityAgentChannel);
}

export async function startNewCloudCommunityAgentConversation(params: { session: AuthSessionLike; initialCommunityId: string | null; expectedActiveEpisodeId: string }): Promise<CloudCommunityAgentChannel> {
  if (!params.initialCommunityId) throw new Error("community_required");
  const { client } = await bootstrapConvexAuthenticatedClient(params.session);
  return normalizeCommunityAgentChannel(await client.mutation("threads:startNewCommunityAgentConversation" as any, { communityId: params.initialCommunityId, expectedActiveEpisodeId: params.expectedActiveEpisodeId }) as CloudCommunityAgentChannel);
}
