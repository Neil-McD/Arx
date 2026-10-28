import { api } from "../convex/_generated/api";
import type { CloudCommunityChatLiveClient } from "./cloudCommunityChatGateway";

export type CloudCommunityAgentServeIssue = {
  id: string;
  community_id: string;
  reason: "community_owner_action_required" | "member_agent_limit_reached";
  cta: "start_builder" | null;
  message: string;
  created_at: string;
};

function coerceNullableString(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  return value || null;
}

function coerceCommunityAgentServeIssue(payload: unknown): CloudCommunityAgentServeIssue | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const id = coerceNullableString(row.id);
  const communityId = coerceNullableString(row.community_id);
  const reason = coerceNullableString(row.reason);
  const cta = coerceNullableString(row.cta);
  const createdAt = coerceNullableString(row.created_at);
  // Only known reason/action pairs are rendered; anything else is ignored.
  const known =
    (reason === "community_owner_action_required" && cta === null) ||
    (reason === "member_agent_limit_reached" && cta === "start_builder");
  if (!id || !communityId || !known || !createdAt) {
    return null;
  }
  return {
    id,
    community_id: communityId,
    reason: reason as CloudCommunityAgentServeIssue["reason"],
    cta: cta as CloudCommunityAgentServeIssue["cta"],
    message: coerceNullableString(row.message) ?? "Community AI is temporarily unavailable.",
    created_at: createdAt,
  };
}

export function subscribeCloudCommunityAgentServeIssue(params: {
  liveClient: CloudCommunityChatLiveClient;
  communityId: string;
  onUpdate: (issue: CloudCommunityAgentServeIssue | null) => void;
  onError?: (error: unknown) => void;
}): () => void {
  const watch = params.liveClient.client.watchQuery(
    (api as any).communityAgentConcierge.getMyLatestCommunityAgentServeIssue,
    {
      authSubject: params.liveClient.authSubject,
      communityId: params.communityId as any,
    } as any,
  );
  const publish = () => {
    try {
      const result = watch.localQueryResult();
      if (typeof result === "undefined") return;
      params.onUpdate(coerceCommunityAgentServeIssue(result));
    } catch (error) {
      params.onError?.(error);
    }
  };
  publish();
  return watch.onUpdate(publish);
}
