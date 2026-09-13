// Server-only transport. Production construction remains disabled pending live acceptance.
import { INTEGRATION_CALLBACK_PATH } from "../shared/integrationCallback";
import { hubSpotPilotScopesAllowed, HUBSPOT_SCOPE_REQUEST, parseHubSpotConnectionMetadata } from "./hubspotPilotContract";

export type ConnectionMetadata = { portalId: string; scopes: string[] };
export type AdmitConnectionMetadata = (execute: () => Promise<ConnectionMetadata>) => Promise<ConnectionMetadata>;

// Cap bytes retained by this adapter, not fetch's internal network buffers.
async function readProviderJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("provider_body_missing");
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  let complete = false;
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    if (!response.ok) throw new Error("provider_error");
    const bytes = new Uint8Array(65_536);
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) { complete = true; break; }
      if (chunk.value.byteLength > bytes.length - size) throw new Error("provider_result_large");
      bytes.set(chunk.value, size);
      size += chunk.value.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)));
  } finally {
    signal.removeEventListener("abort", cancel);
    if (!complete) cancel();
    reader.releaseLock();
  }
}
export type ConnectionAdapter = {
  authConfigId: string;
  initiate: (
    userId: string,
    attemptAlias: string,
  ) => Promise<{ connectedAccountId: string; authorizationUrl: string }>;
  verify: (
    accountId: string,
    userId: string,
    sessionUri: string,
    admitMetadata: AdmitConnectionMetadata,
  ) => Promise<{
    connectedAccountId: string;
    providerUserId: string;
    authConfigId: string;
    toolkit: string;
    active: boolean;
    scopes: string[];
  }>;
  revoke: (accountId: string) => Promise<void>;
};
export function createComposioConnectionAdapter(
  config: {
    apiKey: string;
    authConfigId: string;
    returnUrl: string;
    // Granted scopes must come from independently verified provider evidence,
    // NOT requested_scopes in the Composio account response.
    expectedPortalId: string;
    verifyMetadata?: (accountId: string) => Promise<ConnectionMetadata>;
  },
  transport: typeof fetch = fetch,
): ConnectionAdapter {
  const callback = new URL(config.returnUrl);
  if (
    callback.protocol !== "https:" ||
    callback.username ||
    callback.password ||
    callback.pathname !== INTEGRATION_CALLBACK_PATH ||
    callback.search ||
    callback.hash ||
    !config.apiKey ||
    !config.authConfigId ||
    !/^[1-9][0-9]{0,31}$/.test(config.expectedPortalId)
  )
    throw new Error("integration_config_invalid");
  const request = async (path: string, method = "GET", body?: unknown) => {
    try {
      const signal = AbortSignal.timeout(10_000);
      const response = await transport(
        `https://backend.composio.dev/api/${path}`,
        {
          method,
          redirect: "error",
          signal,
          headers: {
            "x-api-key": config.apiKey,
            "Content-Type": "application/json",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
      return await readProviderJson(response, signal) as any;
    } catch {
      throw new Error("integration_provider_unavailable");
    }
  };
  return {
    authConfigId: config.authConfigId,
    async initiate(userId, attemptAlias) {
      if (!/^pn_[a-f0-9]{64}$/.test(attemptAlias)) throw new Error("integration_invalid_attempt");
      const r = await request("v3/connected_accounts/link", "POST", {
        user_id: userId,
        auth_config_id: config.authConfigId,
        callback_url: callback.href,
        alias: attemptAlias,
      });
      const url = new URL(r.redirect_url);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.hostname !== "connect.composio.dev" ||
        typeof r.connected_account_id !== "string" ||
        !r.connected_account_id
      )
        throw new Error("integration_invalid_link");
      return {
        connectedAccountId: r.connected_account_id,
        authorizationUrl: url.href,
      };
    },
    async verify(accountId, userId, sessionUri, admitMetadata) {
      if (typeof admitMetadata !== "function") throw new Error("integration_receipt_required");
      if (!sessionUri || sessionUri.length > 4096)
        throw new Error("integration_invalid_callback");
      const completed = await request(
        "v3.1/connected_accounts/complete_auth",
        "POST",
        { session_uri: sessionUri, user_id: userId },
      );
      if (
        completed.connected_account_id !== accountId ||
        completed.toolkit_slug !== "hubspot"
      )
        throw new Error("integration_wrong_account");
      const r = await request(
        `v3/connected_accounts/${encodeURIComponent(accountId)}`,
      );
      if (
        r.id !== accountId ||
        r.user_id !== userId ||
        r.auth_config?.id !== config.authConfigId ||
        r.toolkit?.slug !== "hubspot" ||
        r.status !== "ACTIVE" ||
        r.is_disabled ||
        r.auth_config?.is_disabled ||
        r.experimental?.account_type === "SHARED"
      )
        throw new Error("integration_wrong_account");
      let metadata;
      try { metadata = await admitMetadata(async () => {
        if (config.verifyMetadata) return config.verifyMetadata(accountId);
        const raw = await request(`v3.1/tools/execute/${HUBSPOT_SCOPE_REQUEST.tool}`, "POST", {
          connected_account_id: accountId,
          version: HUBSPOT_SCOPE_REQUEST.version,
          arguments: HUBSPOT_SCOPE_REQUEST.arguments,
        });
        const parsed = parseHubSpotConnectionMetadata(raw);
        if (!parsed) throw new Error("integration_metadata_unverified");
        return parsed;
      }); }
      catch { throw new Error("integration_metadata_unverified"); }
      if (!metadata || metadata.portalId !== config.expectedPortalId ||
        !Array.isArray(metadata.scopes) || !hubSpotPilotScopesAllowed(metadata.scopes))
        throw new Error("integration_metadata_unverified");
      return {
        connectedAccountId: r.id,
        providerUserId: r.user_id,
        authConfigId: r.auth_config.id,
        toolkit: r.toolkit.slug,
        active: true,
        scopes: metadata.scopes,
      };
    },
    async revoke(accountId) {
      const r = await request(
        `v3.1/connected_accounts/${encodeURIComponent(accountId)}/revoke`,
        "POST",
      );
      if (
        r.connected_account?.id !== accountId ||
        r.connected_account?.status !== "REVOKED"
      )
        throw new Error("integration_revocation_unconfirmed");
    },
  };
}
