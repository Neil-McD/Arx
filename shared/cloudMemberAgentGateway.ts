import type { AuthSessionLike } from "./authSession";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

export type CloudMemberAgentChannel = {
  channel_id: string;
  episode_id: string;
  episode_ordinal: number;
  thread_id: string;
  thread_key: string;
  community_id: string | null;
  model_id: string;
  context_version: number;
};

function normalizeMemberAgentChannel(payload: CloudMemberAgentChannel | null): CloudMemberAgentChannel {
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

export async function ensureCloudMemberAgentGlobalChannel(params: {
  session: AuthSessionLike;
  initialCommunityId: string | null;
}): Promise<CloudMemberAgentChannel> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const initialCommunityId = String(params.initialCommunityId ?? "").trim() || null;
  const payload = (await client.mutation("threads:ensureMemberAgentGlobalChannel" as any, {
    authSubject,
    ...(initialCommunityId ? { initialCommunityId } : null),
  })) as CloudMemberAgentChannel | null;
  return normalizeMemberAgentChannel(payload);
}

export async function startNewCloudMemberAgentGlobalEpisode(params: {
  session: AuthSessionLike;
  initialCommunityId: string | null;
  expectedActiveEpisodeId: string;
}): Promise<CloudMemberAgentChannel> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const initialCommunityId = String(params.initialCommunityId ?? "").trim() || null;
  const expectedActiveEpisodeId = String(params.expectedActiveEpisodeId ?? "").trim();
  if (!expectedActiveEpisodeId) throw new Error("member_agent_active_episode_required");
  const payload = (await client.mutation("threads:startNewMemberAgentGlobalEpisode" as any, {
    authSubject,
    ...(initialCommunityId ? { initialCommunityId } : null),
    expectedActiveEpisodeId,
  })) as CloudMemberAgentChannel | null;
  return normalizeMemberAgentChannel(payload);
}
