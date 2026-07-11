import type { AuthSessionLike } from "./authSession";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

export type CloudMemberAgentThread = {
  thread_id: string;
  thread_key: string;
  community_id: string;
  model_id: string;
  runtime_engine: "polynet";
  context_version: number;
};

export async function ensureCloudMemberAgentCommunityThread(params: {
  session: AuthSessionLike;
  communityId: string;
}): Promise<CloudMemberAgentThread> {
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
  )) as CloudMemberAgentThread | null;
  const threadKey = String(payload?.thread_key ?? "").trim();
  if (!payload || !threadKey) throw new Error("member_agent_thread_unavailable");
  return {
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
