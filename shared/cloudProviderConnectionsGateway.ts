import {
  bootstrapGatewayAuthContext,
  normalizeGatewayNullableString,
} from "./cloudGateway";

type CloudProviderConnectionsGatewayParams<SessionT> = {
  session: SessionT;
};

// Gateway class: authenticated read/action bridge, caller-hardened session, fail-closed.

export type CloudOpenRouterConnectionStatus = {
  provider: "openrouter";
  auth_kind: "api_key";
  connected: boolean;
  key_last_four: string | null;
  validated_at: string | null;
  updated_at: string | null;
};

export type CloudChatgptConnectionStatus = {
  provider: "chatgpt";
  auth_kind: "oauth_tokens";
  connected: boolean;
  email: string | null;
  account_id: string | null;
  access_token_expires_at: string | null;
  validated_at: string | null;
  updated_at: string | null;
};

type CloudProviderConnectionsPayload = {
  openrouter?: {
    provider?: unknown;
    auth_kind?: unknown;
    connected?: unknown;
    key_last_four?: unknown;
    validated_at?: unknown;
    updated_at?: unknown;
  } | null;
  chatgpt?: {
    provider?: unknown;
    auth_kind?: unknown;
    connected?: unknown;
    email?: unknown;
    account_id?: unknown;
    access_token_expires_at?: unknown;
    validated_at?: unknown;
    updated_at?: unknown;
  } | null;
};

export type CloudChatgptConnectStart = {
  mode: "device_code";
  login_id: string;
  verification_url: string;
  user_code: string;
  poll_interval_seconds: number;
};

export type CloudChatgptManualConnectStart = {
  mode: "browser_callback";
  authorize_url: string;
};

export type CloudChatgptConnectPollResult =
  | { status: "pending" }
  | {
      status: "connected";
      openrouter: CloudOpenRouterConnectionStatus;
      chatgpt: CloudChatgptConnectionStatus;
    };

export type CloudChatgptProbeResult = {
  ok: boolean;
  status: number | null;
  code: string | null;
  message: string;
  model_id: string;
  resolved_model_id: string | null;
  elapsed_ms: number | null;
  content_preview: string | null;
  email: string | null;
  account_id: string | null;
  token_expires_at: string | null;
  content_type: string | null;
  body_preview: string | null;
  upstream_request_id: string | null;
  cf_ray: string | null;
};

function normalizeOpenRouterConnection(payload: unknown): CloudOpenRouterConnectionStatus {
  const row = (payload ?? null) as CloudProviderConnectionsPayload["openrouter"];
  return {
    provider: "openrouter",
    auth_kind: "api_key",
    connected: row?.connected === true,
    key_last_four: normalizeGatewayNullableString(row?.key_last_four),
    validated_at: normalizeGatewayNullableString(row?.validated_at),
    updated_at: normalizeGatewayNullableString(row?.updated_at),
  };
}

function normalizeChatgptConnection(payload: unknown): CloudChatgptConnectionStatus {
  const row = (payload ?? null) as CloudProviderConnectionsPayload["chatgpt"];
  return {
    provider: "chatgpt",
    auth_kind: "oauth_tokens",
    connected: row?.connected === true,
    email: normalizeGatewayNullableString(row?.email),
    account_id: normalizeGatewayNullableString(row?.account_id),
    access_token_expires_at: normalizeGatewayNullableString(row?.access_token_expires_at),
    validated_at: normalizeGatewayNullableString(row?.validated_at),
    updated_at: normalizeGatewayNullableString(row?.updated_at),
  };
}

export async function loadCloudProviderConnections<SessionT>(
  params: CloudProviderConnectionsGatewayParams<SessionT>,
): Promise<{ openrouter: CloudOpenRouterConnectionStatus; chatgpt: CloudChatgptConnectionStatus }> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  const payload = (await client.query("providerConnections:getCurrentUserProviderConnections" as any, {
    authSubject,
  })) as CloudProviderConnectionsPayload | null;
  return {
    openrouter: normalizeOpenRouterConnection(payload?.openrouter ?? null),
    chatgpt: normalizeChatgptConnection(payload?.chatgpt ?? null),
  };
}

export async function connectCloudOpenRouterApiKey<SessionT>(
  params: CloudProviderConnectionsGatewayParams<SessionT> & {
    apiKey: string;
  },
): Promise<{ openrouter: CloudOpenRouterConnectionStatus; chatgpt: CloudChatgptConnectionStatus }> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  const payload = (await client.action("providerConnections:connectOpenRouterApiKey" as any, {
    authSubject,
    apiKey: String(params.apiKey ?? ""),
  })) as CloudProviderConnectionsPayload | null;
  return {
    openrouter: normalizeOpenRouterConnection(payload?.openrouter ?? null),
    chatgpt: normalizeChatgptConnection(payload?.chatgpt ?? null),
  };
}

export async function disconnectCloudOpenRouterApiKey<SessionT>(
  params: CloudProviderConnectionsGatewayParams<SessionT>,
): Promise<{ openrouter: CloudOpenRouterConnectionStatus; chatgpt: CloudChatgptConnectionStatus }> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  const payload = (await client.action("providerConnections:disconnectOpenRouterApiKey" as any, {
    authSubject,
  })) as CloudProviderConnectionsPayload | null;
  return {
    openrouter: normalizeOpenRouterConnection(payload?.openrouter ?? null),
    chatgpt: normalizeChatgptConnection(payload?.chatgpt ?? null),
  };
}

export async function beginChatgptConnect<SessionT>(
  params: CloudProviderConnectionsGatewayParams<SessionT> & {
    returnToPath?: string | null;
  },
): Promise<CloudChatgptConnectStart> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  const payload = (await client.action("providerConnections:beginChatgptConnect" as any, {
    authSubject,
    returnToPath: String(params.returnToPath ?? "").trim() || "/",
  })) as {
    mode?: unknown;
    login_id?: unknown;
    verification_url?: unknown;
    user_code?: unknown;
    poll_interval_seconds?: unknown;
  } | null;
  const loginId = normalizeGatewayNullableString(payload?.login_id);
  const verificationUrl = normalizeGatewayNullableString(payload?.verification_url);
  const userCode = normalizeGatewayNullableString(payload?.user_code);
  const pollIntervalRaw = Number(payload?.poll_interval_seconds ?? 5);
  const pollIntervalSeconds = Number.isFinite(pollIntervalRaw) && pollIntervalRaw > 0 ? Math.floor(pollIntervalRaw) : 5;
  if (!loginId || !verificationUrl || !userCode) {
    throw new Error("ChatGPT device-code login did not return the expected data.");
  }
  return {
    mode: "device_code",
    login_id: loginId,
    verification_url: verificationUrl,
    user_code: userCode,
    poll_interval_seconds: pollIntervalSeconds,
  };
}

export async function beginChatgptManualConnect<SessionT>(
  params: CloudProviderConnectionsGatewayParams<SessionT> & {
    returnToPath?: string | null;
  },
): Promise<CloudChatgptManualConnectStart> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  const payload = (await client.action("providerConnections:beginChatgptManualConnect" as any, {
    authSubject,
    returnToPath: String(params.returnToPath ?? "").trim() || "/",
  })) as {
    mode?: unknown;
    authorize_url?: unknown;
  } | null;
  const authorizeUrl = normalizeGatewayNullableString(payload?.authorize_url);
  if (!authorizeUrl) {
    throw new Error("ChatGPT browser login did not return an authorization URL.");
  }
  return {
    mode: "browser_callback",
    authorize_url: authorizeUrl,
  };
}

export async function pollCloudChatgptConnect<SessionT>(
  params: CloudProviderConnectionsGatewayParams<SessionT> & {
    loginId: string;
  },
): Promise<CloudChatgptConnectPollResult> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  const payload = (await client.action("providerConnections:pollChatgptConnect" as any, {
    authSubject,
    loginId: params.loginId,
  })) as ({ status?: unknown } & CloudProviderConnectionsPayload) | null;
  const status = normalizeGatewayNullableString(payload?.status);
  if (status !== "connected") return { status: "pending" };
  return {
    status: "connected",
    openrouter: normalizeOpenRouterConnection(payload?.openrouter ?? null),
    chatgpt: normalizeChatgptConnection(payload?.chatgpt ?? null),
  };
}

export async function completeCloudChatgptConnect<SessionT>(
  params: CloudProviderConnectionsGatewayParams<SessionT> & {
    callbackInput: string;
  },
): Promise<{ openrouter: CloudOpenRouterConnectionStatus; chatgpt: CloudChatgptConnectionStatus }> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  const payload = (await client.action("providerConnections:completeChatgptConnect" as any, {
    authSubject,
    callbackInput: String(params.callbackInput ?? ""),
  })) as CloudProviderConnectionsPayload | null;
  return {
    openrouter: normalizeOpenRouterConnection(payload?.openrouter ?? null),
    chatgpt: normalizeChatgptConnection(payload?.chatgpt ?? null),
  };
}

export async function disconnectCloudChatgpt<SessionT>(
  params: CloudProviderConnectionsGatewayParams<SessionT>,
): Promise<{ openrouter: CloudOpenRouterConnectionStatus; chatgpt: CloudChatgptConnectionStatus }> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  const payload = (await client.action("providerConnections:disconnectChatgpt" as any, {
    authSubject,
  })) as CloudProviderConnectionsPayload | null;
  return {
    openrouter: normalizeOpenRouterConnection(payload?.openrouter ?? null),
    chatgpt: normalizeChatgptConnection(payload?.chatgpt ?? null),
  };
}

export async function probeCloudChatgptConnection<SessionT>(
  params: CloudProviderConnectionsGatewayParams<SessionT> & {
    modelId?: string | null;
    prompt?: string | null;
  },
): Promise<CloudChatgptProbeResult> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  const payload = (await client.action("providerConnectionProbes:probeChatgptConnection" as any, {
    authSubject,
    modelId: normalizeGatewayNullableString(params.modelId),
    prompt: normalizeGatewayNullableString(params.prompt),
  })) as {
    ok?: unknown;
    status?: unknown;
    code?: unknown;
    message?: unknown;
    model_id?: unknown;
    resolved_model_id?: unknown;
    elapsed_ms?: unknown;
    content_preview?: unknown;
    email?: unknown;
    account_id?: unknown;
    token_expires_at?: unknown;
  } | null;

  const statusRaw = Number(payload?.status);
  const elapsedRaw = Number(payload?.elapsed_ms);
  return {
    ok: payload?.ok === true,
    status: Number.isFinite(statusRaw) ? Math.floor(statusRaw) : null,
    code: normalizeGatewayNullableString(payload?.code),
    message: normalizeGatewayNullableString(payload?.message) || "ChatGPT probe failed.",
    model_id: normalizeGatewayNullableString(payload?.model_id) || "gpt-5.5",
    resolved_model_id: normalizeGatewayNullableString(payload?.resolved_model_id),
    elapsed_ms: Number.isFinite(elapsedRaw) ? Math.floor(elapsedRaw) : null,
    content_preview: normalizeGatewayNullableString(payload?.content_preview),
    email: normalizeGatewayNullableString(payload?.email),
    account_id: normalizeGatewayNullableString(payload?.account_id),
    token_expires_at: normalizeGatewayNullableString(payload?.token_expires_at),
    content_type: normalizeGatewayNullableString((payload as any)?.content_type),
    body_preview: normalizeGatewayNullableString((payload as any)?.body_preview),
    upstream_request_id: normalizeGatewayNullableString((payload as any)?.upstream_request_id),
    cf_ray: normalizeGatewayNullableString((payload as any)?.cf_ray),
  };
}
