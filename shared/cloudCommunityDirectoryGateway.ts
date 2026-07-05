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
  last_active_at?: string | null;
};

export type CloudCommunityDirectoryPage = {
  rows: CloudCommunityDirectoryMemberRow[];
  totalCount: number | null;
  continueCursor: string | null;
  isDone: boolean;
};

export type CloudCommunityMentionCandidateRow = {
  kind: "user" | "community_agent" | "role";
  community_id: string;
  user_id: string;
  display_name?: string | null;
  handle?: string | null;
  avatar_url?: string | null;
  role?: string | null;
  agent_key?: string | null;
  role_key?: "everybody" | string | null;
  subtitle?: string | null;
  email_mode?: "in_app_only" | "in_app_and_email" | string | null;
  email_cooldown_until?: string | null;
  match_aliases?: string[] | null;
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

export async function searchCloudCommunityMentionCandidates<SessionT>(
  params: {
    session: SessionT;
    communityId: string;
    query: string;
    limit?: number;
    includeRoles?: boolean;
  },
): Promise<CloudCommunityMentionCandidateRow[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:searchCommunityMentionCandidates" as any, {
    authSubject,
    communityId: params.communityId,
    query: params.query,
    limit: params.limit ?? 8,
    includeRoles: params.includeRoles ?? true,
  });
  return coerceGatewayRows<CloudCommunityMentionCandidateRow>(payload);
}
