import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type {
  CommunityMountedApp,
  ConnectCommunityAppInput,
} from "./communityAppMountTypes";

type CloudCommunityAppMountGatewayParams<SessionT> = {
  session: SessionT;
};

function coerceObjectRows<TRow>(payload: unknown): TRow[] {
  if (Array.isArray(payload)) return payload as TRow[];
  if (!payload || typeof payload !== "object") return [];
  const payloadObj = payload as Record<string, unknown>;
  for (const key of ["rows", "items", "data"] as const) {
    const value = payloadObj[key];
    if (Array.isArray(value)) return value as TRow[];
  }
  return [payload as TRow];
}

export async function listCloudCommunityAppMounts<SessionT>(
  params: CloudCommunityAppMountGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<CommunityMountedApp[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityAppMounts" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return coerceObjectRows<CommunityMountedApp>(payload);
}

export const listCloudCommunityAppGrants = listCloudCommunityAppMounts;

export async function connectCloudCommunityApp<SessionT>(
  params: CloudCommunityAppMountGatewayParams<SessionT> & {
    communityId: string;
    input: ConnectCommunityAppInput;
  },
): Promise<CommunityMountedApp | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.action("community:connectCommunityApp" as any, {
    authSubject,
    communityId: params.communityId,
    catalogAppId: params.input.catalog_app_id,
    name: params.input.name,
    endpointUrl: params.input.endpoint_url,
    authType: params.input.auth_type,
    description: params.input.description,
    secret: params.input.secret,
  })) as CommunityMountedApp | null;
  return payload ?? null;
}

export const recommendCloudCommunityApp = connectCloudCommunityApp;

export async function updateCloudCommunityAppMount<SessionT>(
  params: CloudCommunityAppMountGatewayParams<SessionT> & {
    communityId: string;
    communityAppMountId: string;
    enabled?: boolean;
    enabledTools?: string[];
  },
): Promise<CommunityMountedApp | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.mutation("community:updateCommunityAppMount" as any, {
    authSubject,
    communityId: params.communityId,
    communityAppMountId: params.communityAppMountId,
    enabled: params.enabled,
    enabledTools: params.enabledTools,
  })) as CommunityMountedApp | null;
  return payload ?? null;
}

export const updateCloudCommunityAppGrant = updateCloudCommunityAppMount;

export async function refreshCloudCommunityApp<SessionT>(
  params: CloudCommunityAppMountGatewayParams<SessionT> & {
    communityId: string;
    communityAppMountId: string;
  },
): Promise<CommunityMountedApp | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.action("community:refreshCommunityApp" as any, {
    authSubject,
    communityId: params.communityId,
    communityAppMountId: params.communityAppMountId,
  })) as CommunityMountedApp | null;
  return payload ?? null;
}

export const refreshCloudCommunityAppGrant = refreshCloudCommunityApp;

export async function reconnectCloudCommunityApp<SessionT>(
  params: CloudCommunityAppMountGatewayParams<SessionT> & {
    communityId: string;
    communityAppMountId: string;
    secret: string;
  },
): Promise<CommunityMountedApp | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.action("community:reconnectCommunityApp" as any, {
    authSubject,
    communityId: params.communityId,
    communityAppMountId: params.communityAppMountId,
    secret: params.secret,
  })) as CommunityMountedApp | null;
  return payload ?? null;
}

export const reconnectCloudCommunityAppGrant = reconnectCloudCommunityApp;

export async function unmountCloudCommunityApp<SessionT>(
  params: CloudCommunityAppMountGatewayParams<SessionT> & {
    communityId: string;
    communityAppMountId: string;
  },
): Promise<boolean> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.mutation("community:unmountCommunityApp" as any, {
    authSubject,
    communityId: params.communityId,
    communityAppMountId: params.communityAppMountId,
  })) as { removed?: unknown } | null;
  return payload?.removed === true;
}

export const removeCloudCommunityAppGrant = unmountCloudCommunityApp;
