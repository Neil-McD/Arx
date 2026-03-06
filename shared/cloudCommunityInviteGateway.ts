import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

type CloudCommunityInviteGatewayParams<SessionT> = {
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

export async function listCloudCommunityInvites<SessionT, TInvite = unknown>(
  params: CloudCommunityInviteGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<TInvite[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityInvites" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return coerceObjectRows<TInvite>(payload);
}

export async function createCloudCommunityInvite<SessionT, TInvite = unknown>(
  params: CloudCommunityInviteGatewayParams<SessionT> & {
    communityId: string;
    code: string;
    maxUses: number | null;
    expiresAt: string | null;
    createdBy: string;
  },
): Promise<TInvite | null> {
  void params.createdBy;
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:createCommunityInvite" as any, {
    authSubject,
    communityId: params.communityId,
    code: params.code,
    maxUses: params.maxUses ?? null,
    expiresAt: params.expiresAt ?? null,
  });
  const rows = coerceObjectRows<TInvite>(payload);
  return rows[0] ?? null;
}

export async function revokeCloudCommunityInvite<SessionT, TInvite = unknown>(
  params: CloudCommunityInviteGatewayParams<SessionT> & {
    inviteId: string;
    revokedAtIso?: string;
  },
): Promise<TInvite | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:revokeCommunityInvite" as any, {
    authSubject,
    inviteId: params.inviteId,
    revokedAtIso: params.revokedAtIso ?? new Date().toISOString(),
  });
  const rows = coerceObjectRows<TInvite>(payload);
  return rows[0] ?? null;
}

export async function deleteCloudCommunityInvite<SessionT>(
  params: CloudCommunityInviteGatewayParams<SessionT> & {
    inviteId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:deleteCommunityInvite" as any, {
    authSubject,
    inviteId: params.inviteId,
  });
}
