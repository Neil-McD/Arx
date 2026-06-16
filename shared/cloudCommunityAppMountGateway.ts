import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type {
  AddPrivateCommunityMcpAppResult,
  CommunityMountedApp,
  ConnectCommunityAppInput,
  PrivateCommunityMcpOption,
  SetupImportedCommunityMcpAppInput,
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

export async function listCloudPrivateCommunityMcpOptions<SessionT>(
  params: CloudCommunityAppMountGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<PrivateCommunityMcpOption[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listPrivateCommunityMcpOptions" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return coerceObjectRows<PrivateCommunityMcpOption>(payload);
}

export async function addCloudPrivateCommunityMcpApp<SessionT>(
  params: CloudCommunityAppMountGatewayParams<SessionT> & {
    communityId: string;
    mcpRegistryId: string;
  },
): Promise<AddPrivateCommunityMcpAppResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return (await client.action("community:addPrivateCommunityMcpApp" as any, {
    authSubject,
    communityId: params.communityId,
    mcpRegistryId: params.mcpRegistryId,
  })) as AddPrivateCommunityMcpAppResult;
}

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
  })) as CommunityMountedApp | null;
  return payload ?? null;
}

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

export async function setupCloudImportedCommunityMcpApp<SessionT>(
  params: CloudCommunityAppMountGatewayParams<SessionT> & {
    communityId: string;
    input: SetupImportedCommunityMcpAppInput;
  },
): Promise<CommunityMountedApp | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.action(
    "community:setupImportedCommunityMcpApp" as any,
    {
      authSubject,
      communityId: params.communityId,
      communityAppMountId: params.input.community_app_mount_id,
      endpointUrl: params.input.endpoint_url,
      authType: params.input.auth_type,
    },
  )) as CommunityMountedApp | null;
  return payload ?? null;
}

export async function unmountCloudCommunityApp<SessionT>(
  params: CloudCommunityAppMountGatewayParams<SessionT> & {
    communityId: string;
    communityAppMountId: string;
  },
): Promise<boolean> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.action("community:unmountCommunityApp" as any, {
    authSubject,
    communityId: params.communityId,
    communityAppMountId: params.communityAppMountId,
  })) as { removed?: unknown } | null;
  return payload?.removed === true;
}
