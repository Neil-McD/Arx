import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type {
  BeginUserPlatformAppOAuthResult,
  ConnectUserPlatformAppResult,
  ConnectUserPlatformAppInput,
  FinalizeUserPlatformAppOAuthResult,
  UserPlatformMountedApp,
} from "./userPlatformAppMountTypes";
import { readConvexRuntimeUrl } from "./convexRuntime";

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
): Promise<ConnectUserPlatformAppResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = (await client.action(
    "userPlatformAppMounts:connectUserPlatformApp" as any,
    {
      authSubject,
      catalogAppId: params.input.catalog_app_id,
      name: params.input.name,
      endpointUrl: params.input.endpoint_url,
      authType: params.input.auth_type,
      description: params.input.description,
      secret: params.input.secret,
      connectAttemptId: params.input.connect_attempt_id,
    },
  )) as
    | ConnectUserPlatformAppResult
    | UserPlatformMountedApp
    | null;
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "ok" in payload
  ) {
    return payload as ConnectUserPlatformAppResult;
  }
  return {
    ok: Boolean(payload),
    mount: (payload as UserPlatformMountedApp | null) ?? null,
    validation_report: null,
    error_code: payload ? null : "server_unavailable",
    error_message: payload
      ? null
      : "The personal app service is unavailable right now. Try again.",
    connect_attempt_id: params.input.connect_attempt_id ?? null,
  };
}

export async function beginCloudUserPlatformAppOAuth<SessionT>(
  params: CloudUserPlatformAppMountGatewayParams<SessionT> & {
    catalogAppId: string;
    returnToPath?: string | null;
  },
): Promise<BeginUserPlatformAppOAuthResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = (await client.action(
    "appOAuth:beginUserPlatformAppOAuth" as any,
    {
      authSubject,
      catalogAppId: params.catalogAppId,
      returnToPath: String(params.returnToPath ?? "").trim() || "/discover",
      callbackBaseUrl: readConvexRuntimeUrl() ?? undefined,
    },
  )) as {
    ok?: unknown;
    catalog_app_id?: unknown;
    authorize_url?: unknown;
    redirect_uri?: unknown;
  } | null;
  const authorizeUrl =
    typeof payload?.authorize_url === "string" ? payload.authorize_url.trim() : "";
  return {
    ok: payload?.ok === true && Boolean(authorizeUrl),
    catalog_app_id:
      typeof payload?.catalog_app_id === "string"
        ? payload.catalog_app_id.trim() || null
        : null,
    authorize_url: authorizeUrl || null,
    redirect_uri:
      typeof payload?.redirect_uri === "string"
        ? payload.redirect_uri.trim() || null
        : null,
    error_message: authorizeUrl ? null : "OAuth authorization URL was not returned.",
  };
}

export async function finalizeCloudUserPlatformAppOAuth<SessionT>(
  params: CloudUserPlatformAppMountGatewayParams<SessionT> & {
    state: string;
    finalizeToken: string;
  },
): Promise<FinalizeUserPlatformAppOAuthResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = (await client.action(
    "appOAuth:finalizeUserPlatformAppOAuth" as any,
    {
      authSubject,
      state: params.state,
      finalizeToken: params.finalizeToken,
    },
  )) as {
    ok?: unknown;
    catalog_app_id?: unknown;
    mount_id?: unknown;
    validation_status?: unknown;
    error_message?: unknown;
  } | null;
  return {
    ok: payload?.ok === true,
    catalog_app_id:
      typeof payload?.catalog_app_id === "string"
        ? payload.catalog_app_id.trim() || null
        : null,
    mount_id:
      typeof payload?.mount_id === "string"
        ? payload.mount_id.trim() || null
        : null,
    validation_status:
      typeof payload?.validation_status === "string"
        ? payload.validation_status.trim() || null
        : null,
    error_message:
      typeof payload?.error_message === "string"
        ? payload.error_message.trim() || null
        : payload?.ok === true
          ? null
          : "OAuth connection could not be finalized.",
  };
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
