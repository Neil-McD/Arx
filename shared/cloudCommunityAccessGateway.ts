import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

type CloudCommunityAccessGatewayParams<SessionT> = {
  session: SessionT;
};

function firstRpcRow<T>(payload: unknown): T | null {
  if (Array.isArray(payload)) {
    return (payload[0] as T | undefined) ?? null;
  }
  if (payload && typeof payload === "object") {
    return payload as T;
  }
  return null;
}

export async function fetchCloudMyCommunityAccessById<SessionT, TAccess = unknown>(
  params: CloudCommunityAccessGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<TAccess | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:getMyCommunityAccess" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return firstRpcRow<TAccess>(payload);
}

export async function fetchCloudMyCommunityAccessBySlug<SessionT, TAccess = unknown>(
  params: CloudCommunityAccessGatewayParams<SessionT> & {
    communitySlug: string;
  },
): Promise<TAccess | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:getMyCommunityAccessBySlug" as any, {
    authSubject,
    communitySlug: params.communitySlug,
  });
  return firstRpcRow<TAccess>(payload);
}
