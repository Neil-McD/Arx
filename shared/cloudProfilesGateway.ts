import { bootstrapConvexAuthenticatedClient, type ConvexClient } from "./convexAuthenticatedClient";
import { coerceGatewayRows, firstGatewayRow } from "./cloudGateway";

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
  authSubject: string;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(sessionRaw);
  return { client, authSubject };
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
  return coerceGatewayRows<TProfile>(payload);
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
  return firstGatewayRow<TProfile>(payload);
}

export async function upsertCloudProfileDetail<SessionT, TProfile extends CloudProfileDetailRow = CloudProfileDetailRow>(
  params: CloudProfilesGatewayParams<SessionT> & {
    userId: string;
    displayName: string | null;
    avatarUrl: string | null;
    bio: string | null;
  },
): Promise<TProfile | null> {
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  const payload = await client.mutation("profiles:upsertProfileDetail" as any, {
    authSubject,
    userId: params.userId,
    displayName: params.displayName,
    avatarUrl: params.avatarUrl,
    bio: params.bio,
  });
  return firstGatewayRow<TProfile>(payload);
}
