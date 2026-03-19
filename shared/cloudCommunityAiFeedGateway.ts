import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

type CloudCommunityAiFeedGatewayParams<SessionT> = {
  session: SessionT;
};

type CommunityAiFeedBundle<TPost> = {
  live: TPost[];
  ranked: TPost[];
};

function coerceObjectRows<TRow>(payload: unknown): TRow[] {
  if (Array.isArray(payload)) return payload as TRow[];
  if (!payload || typeof payload !== "object") return [];
  const payloadObj = payload as Record<string, unknown>;
  const keys = ["rows", "items", "data"] as const;
  for (const key of keys) {
    const value = payloadObj[key];
    if (Array.isArray(value)) return value as TRow[];
  }
  return [payload as TRow];
}

function coerceFeedBundle<TPost>(payload: unknown): CommunityAiFeedBundle<TPost> {
  if (!payload || typeof payload !== "object") {
    return { live: [], ranked: [] };
  }
  const payloadObj = payload as Record<string, unknown>;
  return {
    live: coerceObjectRows<TPost>(payloadObj.live),
    ranked: coerceObjectRows<TPost>(payloadObj.ranked),
  };
}

export async function listCloudCommunityAiFeedBundle<SessionT, TPost = unknown>(
  params: CloudCommunityAiFeedGatewayParams<SessionT> & {
    communityId: string;
    limit?: number;
  },
): Promise<CommunityAiFeedBundle<TPost>> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityAiFeedBundle" as any, {
    authSubject,
    communityId: params.communityId,
    limit: params.limit ?? 100,
  });
  return coerceFeedBundle<TPost>(payload);
}

export async function reactToCloudCommunityAiFeedPost<SessionT>(
  params: CloudCommunityAiFeedGatewayParams<SessionT> & {
    postId: string;
    reactionType: "good" | "low_signal";
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:reactToCommunityAiFeedPost" as any, {
    authSubject,
    postId: params.postId,
    reactionType: params.reactionType,
  });
}
