import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type {
  ConnectUserPlatformAppInput,
  UserPlatformMountedApp,
} from "./userPlatformAppMountTypes";

type CloudUserPlatformAppMountGatewayParams<SessionT> = {
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

export async function listCloudUserPlatformAppMounts<SessionT>(
  params: CloudUserPlatformAppMountGatewayParams<SessionT>,
): Promise<UserPlatformMountedApp[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = await client.query(
    "userPlatformAppMounts:listUserPlatformAppMounts" as any,
    {
      authSubject,
    },
  );
  return coerceObjectRows<UserPlatformMountedApp>(payload);
}

export async function connectCloudUserPlatformApp<SessionT>(
  params: CloudUserPlatformAppMountGatewayParams<SessionT> & {
    input: ConnectUserPlatformAppInput;
  },
): Promise<UserPlatformMountedApp | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = (await client.action(
    "userPlatformAppMounts:connectUserPlatformApp" as any,
    {
      authSubject,
      name: params.input.name,
      endpointUrl: params.input.endpoint_url,
      authType: params.input.auth_type,
      description: params.input.description,
      secret: params.input.secret,
    },
  )) as UserPlatformMountedApp | null;
  return payload ?? null;
}

export async function updateCloudUserPlatformAppMount<SessionT>(
  params: CloudUserPlatformAppMountGatewayParams<SessionT> & {
    userPlatformAppMountId: string;
    enabled?: boolean;
    enabledTools?: string[];
  },
): Promise<UserPlatformMountedApp | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = (await client.mutation(
    "userPlatformAppMounts:updateUserPlatformAppMount" as any,
    {
      authSubject,
      userPlatformAppMountId: params.userPlatformAppMountId,
      enabled: params.enabled,
      enabledTools: params.enabledTools,
    },
  )) as UserPlatformMountedApp | null;
  return payload ?? null;
}

export async function refreshCloudUserPlatformApp<SessionT>(
  params: CloudUserPlatformAppMountGatewayParams<SessionT> & {
    userPlatformAppMountId: string;
  },
): Promise<UserPlatformMountedApp | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = (await client.action(
    "userPlatformAppMounts:refreshUserPlatformApp" as any,
    {
      authSubject,
      userPlatformAppMountId: params.userPlatformAppMountId,
    },
  )) as UserPlatformMountedApp | null;
  return payload ?? null;
}

export async function reconnectCloudUserPlatformApp<SessionT>(
  params: CloudUserPlatformAppMountGatewayParams<SessionT> & {
    userPlatformAppMountId: string;
    secret: string;
  },
): Promise<UserPlatformMountedApp | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = (await client.action(
    "userPlatformAppMounts:reconnectUserPlatformApp" as any,
    {
      authSubject,
      userPlatformAppMountId: params.userPlatformAppMountId,
      secret: params.secret,
    },
  )) as UserPlatformMountedApp | null;
  return payload ?? null;
}

export async function unmountCloudUserPlatformApp<SessionT>(
  params: CloudUserPlatformAppMountGatewayParams<SessionT> & {
    userPlatformAppMountId: string;
  },
): Promise<boolean> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = (await client.mutation(
    "userPlatformAppMounts:unmountUserPlatformApp" as any,
    {
      authSubject,
      userPlatformAppMountId: params.userPlatformAppMountId,
    },
  )) as { removed?: unknown } | null;
  return payload?.removed === true;
}
