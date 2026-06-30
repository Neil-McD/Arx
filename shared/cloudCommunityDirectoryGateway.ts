import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import { coerceGatewayRows, parseGatewayNumberLike } from "./cloudGateway";

export type CloudCommunityDirectoryMemberRow = {
  id: string;
  community_id: string;
  user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  role: string;
  created_at: string;
};

export type CloudCommunityDirectoryPage = {
  rows: CloudCommunityDirectoryMemberRow[];
  totalCount: number | null;
  continueCursor: string | null;
  isDone: boolean;
};

export async function listCloudCommunityDirectoryPage<SessionT>(
  params: {
    session: SessionT;
    communityId: string;
    cursor?: string | null;
    pageSize?: number;
  },
): Promise<CloudCommunityDirectoryPage> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityDirectoryPage" as any, {
    authSubject,
    communityId: params.communityId,
    cursor: params.cursor ?? null,
    pageSize: params.pageSize ?? 25,
  }) as {
    page?: unknown;
    totalCount?: unknown;
    continueCursor?: unknown;
    isDone?: unknown;
  } | null;
  return {
    rows: coerceGatewayRows<CloudCommunityDirectoryMemberRow>(payload?.page ?? []),
    totalCount: parseGatewayNumberLike(payload?.totalCount),
    continueCursor:
      typeof payload?.continueCursor === "string"
        ? payload.continueCursor
        : null,
    isDone: payload?.isDone === true,
  };
}

export async function countCloudCommunityDirectoryMembers<SessionT>(
  params: {
    session: SessionT;
    communityId: string;
  },
): Promise<number | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:countCommunityDirectoryMembers" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return parseGatewayNumberLike(payload);
}
