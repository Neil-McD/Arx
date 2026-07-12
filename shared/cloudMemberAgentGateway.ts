import type { AuthSessionLike } from "./authSession";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

export type CloudMemberAgentChannel = {
  channel_id: string;
  episode_id: string;
  episode_ordinal: number;
  thread_id: string;
  thread_key: string;
  community_id: string;
  model_id: string;
  runtime_engine: "polynet";
  context_version: number;
};

export async function ensureCloudMemberAgentCommunityChannel(params: {
  session: AuthSessionLike;
  communityId: string;
}): Promise<CloudMemberAgentChannel> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const communityId = String(params.communityId ?? "").trim();
  if (!communityId) throw new Error("member_agent_community_required");
  const payload = (await client.mutation(
    "threads:ensureMemberAgentCommunityThread" as any,
    {
      authSubject,
      communityId,
    },
  )) as CloudMemberAgentChannel | null;
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
    community_id: String(payload.community_id ?? "").trim(),
    model_id: String(payload.model_id ?? "").trim(),
    runtime_engine: "polynet",
    context_version: Number.isFinite(payload.context_version)
      ? Math.max(0, Math.floor(payload.context_version))
      : 0,
  };
}

export async function startNewCloudMemberAgentCommunityEpisode(params: {
  session: AuthSessionLike;
  communityId: string;
  expectedActiveEpisodeId: string;
}): Promise<CloudMemberAgentChannel> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const communityId = String(params.communityId ?? "").trim();
  const expectedActiveEpisodeId = String(params.expectedActiveEpisodeId ?? "").trim();
  if (!communityId) throw new Error("member_agent_community_required");
  if (!expectedActiveEpisodeId) throw new Error("member_agent_active_episode_required");
  const payload = (await client.mutation(
    "threads:startNewMemberAgentCommunityEpisode" as any,
    {
      authSubject,
      communityId,
      expectedActiveEpisodeId,
    },
  )) as CloudMemberAgentChannel | null;
  if (!payload?.thread_key || !payload.episode_id) {
    throw new Error("member_agent_episode_unavailable");
  }
  return {
    channel_id: String(payload.channel_id ?? "").trim(),
    episode_id: String(payload.episode_id ?? "").trim(),
    episode_ordinal: Number.isFinite(payload.episode_ordinal)
      ? Math.max(1, Math.floor(payload.episode_ordinal))
      : 1,
    thread_id: String(payload.thread_id ?? "").trim(),
    thread_key: String(payload.thread_key ?? "").trim(),
    community_id: String(payload.community_id ?? "").trim(),
    model_id: String(payload.model_id ?? "").trim(),
    runtime_engine: "polynet",
    context_version: Number.isFinite(payload.context_version)
      ? Math.max(0, Math.floor(payload.context_version))
      : 0,
  };
}
