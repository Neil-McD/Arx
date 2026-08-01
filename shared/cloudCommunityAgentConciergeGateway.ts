import { api } from "../convex/_generated/api";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { CloudCommunityChatLiveClient } from "./cloudCommunityChatGateway";

type CloudCommunityAgentConciergeGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudCommunityAgentServeIssue = {
  id: string;
  community_id: string;
  reason: "provider_connection_required" | "community_owner_action_required";
  cta: "connect_chatgpt" | null;
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
  if (
    !id ||
    !communityId ||
    (reason !== "provider_connection_required" && reason !== "community_owner_action_required") ||
    (reason === "provider_connection_required" && cta !== "connect_chatgpt") ||
    (reason === "community_owner_action_required" && cta !== null) ||
    !createdAt
  ) {
    return null;
  }
  return {
    id,
    community_id: communityId,
    reason,
    cta: reason === "provider_connection_required" ? "connect_chatgpt" : null,
    message: coerceNullableString(row.message) ?? (
      reason === "provider_connection_required"
        ? "Connect ChatGPT to use the community agent."
        : "Community AI is temporarily unavailable."
    ),
    created_at: createdAt,
  };
}

export async function getCloudCommunityAgentServeIssue<SessionT>(
  params: CloudCommunityAgentConciergeGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<CloudCommunityAgentServeIssue | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("communityAgentConcierge:getMyLatestCommunityAgentServeIssue" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return coerceCommunityAgentServeIssue(payload);
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
