import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

type CloudCommunityAiFeedGatewayParams<SessionT> = {
  session: SessionT;
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

export async function listCloudCommunityAiFeedLive<SessionT, TPost = unknown>(
  params: CloudCommunityAiFeedGatewayParams<SessionT> & {
    communityId: string;
    limit?: number;
  },
): Promise<TPost[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityAiFeedLive" as any, {
    authSubject,
    communityId: params.communityId,
    limit: params.limit ?? 100,
  });
  return coerceObjectRows<TPost>(payload);
}

export async function listCloudCommunityAiFeedRanked<SessionT, TPost = unknown>(
  params: CloudCommunityAiFeedGatewayParams<SessionT> & {
    communityId: string;
    limit?: number;
  },
): Promise<TPost[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityAiFeedRanked" as any, {
    authSubject,
    communityId: params.communityId,
    limit: params.limit ?? 100,
  });
  return coerceObjectRows<TPost>(payload);
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
