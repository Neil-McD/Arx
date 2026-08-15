import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import { withAsyncDeadline } from "./asyncDeadline";

const COMMUNITY_ADMISSION_RPC_TIMEOUT_MS = 10_000;

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
  const payload = await client.query("communityAccessQueries:getMyCommunityAccess" as any, {
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
  const payload = await withAsyncDeadline(
    client.query("communityAccessQueries:getMyCommunityAccessBySlug" as any, {
      authSubject,
      communitySlug: params.communitySlug,
    }),
    {
      timeoutMs: COMMUNITY_ADMISSION_RPC_TIMEOUT_MS,
      code: "community_access_resolution_timeout",
    },
  );
  return firstRpcRow<TAccess>(payload);
}
