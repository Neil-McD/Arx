import { bootstrapConvexAuthenticatedClient, type ConvexClient } from "./convexAuthenticatedClient";

type CloudProfilesGatewayParams<SessionT> = {
  session: SessionT;
};

type CloudProfileBase = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type CloudProfileDetailRow = CloudProfileBase & {
  bio: string | null;
};

async function bootstrapConvexUser(sessionRaw: unknown): Promise<{
  client: ConvexClient;
}> {
  const { client } = await bootstrapConvexAuthenticatedClient(sessionRaw);
  return { client };
}

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

export async function listCloudProfileRowsByUserIds<SessionT, TProfile extends CloudProfileBase = CloudProfileBase>(
  params: CloudProfilesGatewayParams<SessionT> & {
    userIds: string[];
  },
): Promise<TProfile[]> {
  const uniqueIds = Array.from(new Set(params.userIds.map((id) => id.trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return [];
  const { client } = await bootstrapConvexUser(params.session);
  const payload = await client.query("profiles:listProfilesByUserIds" as any, {
    userIds: uniqueIds,
  });
  return coerceObjectRows<TProfile>(payload);
}

export async function fetchCloudProfileDetailByUserId<SessionT, TProfile extends CloudProfileDetailRow = CloudProfileDetailRow>(
  params: CloudProfilesGatewayParams<SessionT> & {
    userId: string;
  },
): Promise<TProfile | null> {
  const { client } = await bootstrapConvexUser(params.session);
  const payload = await client.query("profiles:getProfileDetailByUserId" as any, {
    userId: params.userId,
  });
  const rows = coerceObjectRows<TProfile>(payload);
  return rows[0] ?? null;
}

export async function upsertCloudProfileDetail<SessionT, TProfile extends CloudProfileDetailRow = CloudProfileDetailRow>(
  params: CloudProfilesGatewayParams<SessionT> & {
    userId: string;
    displayName: string | null;
    avatarUrl: string | null;
    bio: string | null;
  },
): Promise<TProfile | null> {
  const { client } = await bootstrapConvexUser(params.session);
  const payload = await client.mutation("profiles:upsertProfileDetail" as any, {
    userId: params.userId,
    displayName: params.displayName,
    avatarUrl: params.avatarUrl,
    bio: params.bio,
  });
  const rows = coerceObjectRows<TProfile>(payload);
  return rows[0] ?? null;
}
