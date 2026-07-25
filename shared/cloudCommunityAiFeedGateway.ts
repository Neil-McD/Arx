import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

type CloudCommunityAiFeedGatewayParams<SessionT> = {
  session: SessionT;
};

export async function listCloudCommunityAiFeedPosts<SessionT, TPost = unknown>(
  params: CloudCommunityAiFeedGatewayParams<SessionT> & {
    communityId: string;
    limit?: number;
  },
): Promise<TPost[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityAiFeedPosts" as any, {
    authSubject,
    communityId: params.communityId,
    limit: params.limit ?? 100,
  });
  if (!Array.isArray(payload)) {
    throw new Error("community_ai_feed_response_invalid");
  }
  return payload as TPost[];
}

export async function hideCloudCommunityAiFeedPost<SessionT>(
  params: CloudCommunityAiFeedGatewayParams<SessionT> & {
    postId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:hideCommunityAiFeedPost" as any, {
    authSubject,
    postId: params.postId,
  });
}
