import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { CommunityBillingPeriod } from "./communityTypes";

type CloudCommunityMembershipGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudCommunityMembershipCommunitySelect = "full" | "minimal";

export type CloudCommunityMembershipRow<TCommunity = unknown> = {
  community_id: string;
  role: string;
  communities: TCommunity;
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

function parseNumberLike(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export async function listCloudCommunityMembershipRows<SessionT, TCommunity = unknown>(
  params: CloudCommunityMembershipGatewayParams<SessionT> & {
    selectMode?: CloudCommunityMembershipCommunitySelect;
    init?: RequestInit;
  },
): Promise<Array<CloudCommunityMembershipRow<TCommunity>>> {
  const selectMode = params.selectMode ?? "full";
  void params.init;
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityMemberships" as any, {
    authSubject,
    selectMode,
  });
  return coerceObjectRows<CloudCommunityMembershipRow<TCommunity>>(payload);
}

export type CloudCommunityMembershipAdminRow = {
  id: string;
  community_id: string;
  user_id: string;
  role: string;
  price_point_id?: string | null;
  billing_period?: CommunityBillingPeriod | null;
  amount_base_units?: number | null;
  currency?: string | null;
  currency_decimals?: number | null;
  created_at: string;
};

export async function listCloudCommunityMembershipAdminRows<SessionT>(
  params: {
    session: SessionT;
    communityId: string;
    limit?: number;
  },
): Promise<CloudCommunityMembershipAdminRow[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityMembershipsAdmin" as any, {
    authSubject,
    communityId: params.communityId,
    limit: params.limit ?? 200,
  });
  return coerceObjectRows<CloudCommunityMembershipAdminRow>(payload);
}

export async function countCloudCommunityMembershipRows<SessionT>(
  params: {
    session: SessionT;
    communityId: string;
    sinceIso?: string | null;
  },
): Promise<number | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:countCommunityMemberships" as any, {
    authSubject,
    communityId: params.communityId,
    sinceIso: params.sinceIso ?? null,
  });
  return parseNumberLike(payload);
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
  const payload = await client.query("community:listCommunityMembershipCreatedAtRows" as any, {
    authSubject,
    communityId: params.communityId,
    sinceIso: params.sinceIso ?? null,
    limit: params.limit ?? 5000,
  });
  return coerceObjectRows<{ created_at: string }>(payload);
}
