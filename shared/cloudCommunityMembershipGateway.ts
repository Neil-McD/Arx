import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import { coerceGatewayRows, parseGatewayNumberLike } from "./cloudGateway";
import type { PremiumMemberBadgeSummary } from "./communityTypes";

type CloudCommunityMembershipGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudCommunityMembershipCommunitySelect = "full" | "minimal";

export type CloudCommunityMembershipRow<TCommunity = unknown> = {
  community_id: string;
  role: string;
  communities: TCommunity;
};

export async function listCloudCommunityMembershipRows<SessionT, TCommunity = unknown>(
  params: CloudCommunityMembershipGatewayParams<SessionT> & {
    selectMode?: CloudCommunityMembershipCommunitySelect;
  },
): Promise<Array<CloudCommunityMembershipRow<TCommunity>>> {
  const selectMode = params.selectMode ?? "full";
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("communityAdmin:listCommunityMemberships" as any, {
    authSubject,
    selectMode,
  });
  return coerceGatewayRows<CloudCommunityMembershipRow<TCommunity>>(payload);
}

export type CloudCommunityMembershipAdminRow = {
  id: string;
  community_id: string;
  user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_storage_id?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  premium_badge?: PremiumMemberBadgeSummary | null;
  role: string;
  created_at: string;
};

export type CloudCommunityMembershipAdminPage = {
  rows: CloudCommunityMembershipAdminRow[];
  continueCursor: string | null;
  isDone: boolean;
};

export async function listCloudCommunityMembershipAdminPage<SessionT>(
  params: {
    session: SessionT;
    communityId: string;
    cursor?: string | null;
    pageSize?: number;
  },
): Promise<CloudCommunityMembershipAdminPage> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("communityAdmin:listCommunityMembershipsAdminPage" as any, {
    authSubject,
    communityId: params.communityId,
    paginationOpts: {
      cursor: params.cursor ?? null,
      numItems: params.pageSize ?? 25,
    },
  }) as {
    page?: unknown;
    continueCursor?: unknown;
    isDone?: unknown;
  } | null;
  return {
    rows: coerceGatewayRows<CloudCommunityMembershipAdminRow>(payload?.page ?? []),
    continueCursor:
      typeof payload?.continueCursor === "string"
        ? payload.continueCursor
        : null,
    isDone: payload?.isDone === true,
  };
}

export async function countCloudCommunityMembershipRows<SessionT>(
  params: {
    session: SessionT;
    communityId: string;
    sinceIso?: string | null;
  },
): Promise<number | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  if (!params.sinceIso) {
    const payload = await client.mutation("communityAdmin:syncCommunityMembershipCount" as any, {
      authSubject,
      communityId: params.communityId,
    });
    return parseGatewayNumberLike(payload);
  }
  const payload = await client.query("communityAdmin:countCommunityMemberships" as any, {
    authSubject,
    communityId: params.communityId,
    sinceIso: params.sinceIso ?? null,
  });
  return parseGatewayNumberLike(payload);
}

export async function listCloudCommunityMembershipCreatedAtRows<SessionT>(
  params: {
    session: SessionT;
    communityId: string;
    sinceIso?: string | null;
    limit?: number;
  },
): Promise<Array<{ created_at: string }>> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("communityAdmin:listCommunityMembershipCreatedAtRows" as any, {
    authSubject,
    communityId: params.communityId,
    sinceIso: params.sinceIso ?? null,
    limit: params.limit ?? 5000,
  });
  return coerceGatewayRows<{ created_at: string }>(payload);
}
