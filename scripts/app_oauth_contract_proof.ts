import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  findDiscoverAppCatalogEntryById,
  resolveDiscoverAppCatalogConnectPolicy,
  resolveDiscoverAppIntegrationProfile,
} from "../shared/discoverCatalog.ts";

function readText(path: string | URL): string {
  return readFileSync(path, "utf8");
}

function main() {
  const notion = findDiscoverAppCatalogEntryById("notion");
  assert.ok(notion, "Notion must exist in the Discover catalog");
  const profile = resolveDiscoverAppIntegrationProfile(notion);
  assert.equal(profile.adapterKind, "remote_mcp_oauth");
  assert.equal(profile.readiness, "ready_oauth");
  assert.equal(profile.authMode, "oauth");
  assert.equal(notion.personalConnect.availability, "ready");
  assert.equal(notion.personalConnect.authMethod, "oauth");
  assert.equal(notion.personalConnect.endpointUrl, "https://mcp.notion.com/mcp");

  const policy = resolveDiscoverAppCatalogConnectPolicy({
    catalogAppId: "notion",
    name: "untrusted name",
    endpointUrl: "https://mcp.notion.com/mcp",
    authType: "oauth",
  });
  assert.equal(policy.ok, true, "Notion OAuth should be server-authorized");
  if (policy.ok) {
    assert.equal(policy.name, "Notion");
    assert.equal(policy.authType, "oauth");
    assert.equal(policy.identityScope, "catalog_singleton");
  }
  assert.equal(
    resolveDiscoverAppCatalogConnectPolicy({
      catalogAppId: "notion",
      endpointUrl: "https://evil.example/mcp",
      authType: "oauth",
    }).ok,
    false,
    "Notion OAuth must use the vetted MCP endpoint",
  );
  assert.equal(
    resolveDiscoverAppCatalogConnectPolicy({
      catalogAppId: "notion",
      endpointUrl: "https://mcp.notion.com/mcp",
      authType: "bearer",
    }).ok,
    false,
    "Notion OAuth must not fall back to bearer-token identity",
  );

  const oauthSource = readText(new URL("../convex/appOAuth.ts", import.meta.url));
  for (const required of [
    "codeVerifier",
    "code_challenge",
    "code_challenge_method",
    "S256",
    "state",
    "resource",
    "/.well-known/oauth-protected-resource${resourcePath}",
    "/.well-known/oauth-authorization-server${issuerPath}",
    "/.well-known/openid-configuration${issuerPath}",
    "!codeChallengeMethods.includes(\"S256\")",
    "fetchOAuthJson",
    "APP_OAUTH_HTTP_TIMEOUT_MS",
    "readBoundedResponseText",
    "redirect: \"manual\"",
    "insertAppOAuthStateInternal",
    "patchAppOAuthStateCallbackInternal",
    "completeAppOAuthCallbackInternal",
    "finalizeUserPlatformAppOAuth",
    "authorizationUrl.searchParams.set(\"resource\", metadata.resource)",
    "resource: params.resource",
    "resource: bundle.resource",
    "finalizeTokenHash",
    "app_oauth_finalize_token",
    "callbackCodeEncryptedHex",
    "refresh_token",
    "getFreshDeveloperAppConnectionBundleInternal",
    "storeOAuthTokenBundle",
    "authKind: \"oauth_tokens\"",
    "clientSecretEncryptedHex",
    "decryptStoredSecret",
  ]) {
    assert.ok(
      oauthSource.includes(required),
      `OAuth implementation must include ${required}`,
    );
  }

  const callbackStart = oauthSource.indexOf("export const completeAppOAuthCallbackInternal");
  const finalizeStart = oauthSource.indexOf("export const finalizeUserPlatformAppOAuth");
  const refreshStart = oauthSource.indexOf("export const getFreshDeveloperAppConnectionBundleInternal");
  assert.ok(callbackStart >= 0 && finalizeStart > callbackStart, "OAuth callback and finalizer must both exist");
  assert.ok(refreshStart > finalizeStart, "OAuth finalizer must appear before runtime refresh helper");
  const callbackSource = oauthSource.slice(callbackStart, finalizeStart);
  const finalizerSource = oauthSource.slice(finalizeStart, refreshStart);
  for (const required of [
    "patchAppOAuthStateCallbackInternal",
    "callbackCodeEncryptedHex",
    "finalizeTokenHash",
    "sha256HexText(finalizeToken)",
    "status: \"pending\"",
  ]) {
    assert.ok(
      callbackSource.includes(required),
      `OAuth callback must only record a pending finalize result with ${required}`,
    );
  }
  for (const forbidden of [
    "exchangeCodeForTokenBundle",
    "storeOAuthTokenBundle",
    "ensureUserHarnessAppInternal",
    "validateDeveloperAppInternal",
  ]) {
    assert.equal(
      callbackSource.includes(forbidden),
      false,
      `OAuth callback must not finalize provider tokens server-side via ${forbidden}`,
    );
  }
  for (const required of [
    "resolveAuthenticatedActionUser",
    "String(row.userId) !== String(userId)",
    "sha256HexText(finalizeToken)",
    "callbackCodeEncryptedHex",
    "exchangeCodeForTokenBundle",
    "resource: normalizeString(row.resource, 2_000)",
    "ensureUserHarnessAppInternal",
    "storeOAuthTokenBundle",
    "validateDeveloperAppInternal",
  ]) {
    assert.ok(
      finalizerSource.includes(required),
      `Authenticated OAuth finalizer must enforce ${required}`,
    );
  }
  assert.ok(
    oauthSource.includes("const existing = await ctx.db.get(args.stateId)") &&
      oauthSource.includes("if (!existing) return { deleted: false }"),
    "OAuth state deletion must be idempotent because callback/finalize requests can be duplicated",
  );

  const httpSource = readText(new URL("../convex/httpAppOAuth.ts", import.meta.url));
  assert.ok(
    httpSource.includes("/app-oauth/callback"),
    "OAuth callback must be exposed as a Convex HTTP route",
  );
  assert.ok(
    httpSource.includes("completeAppOAuthCallbackInternal"),
    "Callback route must record the provider result before authenticated finalization",
  );

  const schemaSource = readText(new URL("../convex/schema.ts", import.meta.url));
  assert.ok(
    schemaSource.includes("clientSecretEncryptedHex") &&
      schemaSource.includes("callbackCodeEncryptedHex") &&
      schemaSource.includes("finalizeTokenHash") &&
      schemaSource.includes("resource: v.string()") &&
      !schemaSource.includes("clientSecret: v.optional(v.string())"),
    "Transient OAuth state must keep dynamic secrets/callback codes encrypted and resource-bound",
  );

  const validationSource = readText(new URL("../convex/appValidation.ts", import.meta.url));
  const runtimeSource = readText(new URL("../convex/runtimeMcpManager.ts", import.meta.url));
  assert.ok(
    validationSource.includes("getFreshDeveloperAppConnectionBundleInternal"),
    "Validation must use fresh OAuth access tokens",
  );
  assert.ok(
    runtimeSource.includes("buildDeveloperAppAuthHeaders"),
    "Runtime must keep OAuth token transport in the existing MCP header path",
  );

  const personalSource = readText(new URL("../convex/userPlatformAppMounts.ts", import.meta.url));
  assert.ok(
    personalSource.includes("developer_app_oauth_flow_required") &&
      personalSource.includes("personal_app_connect.oauth_rejected"),
    "Generic personal secret connect must reject OAuth and force the OAuth begin/finalize flow",
  );

  const routeLifecycleSource = readText(
    new URL("../apps/web/src/controllers/useWebPathRouteLifecycle.ts", import.meta.url),
  );
  assert.ok(
    routeLifecycleSource.includes('url.searchParams.has("app_oauth")'),
    "Route normalization must preserve app_oauth return params until the app finalizer consumes them",
  );

  const communitySource = readText(new URL("../convex/communityAppMounts.ts", import.meta.url));
  assert.ok(
    communitySource.includes("authType: v.union") &&
      communitySource.includes('v.literal("oauth")'),
    "Community recommendations must carry OAuth app identity without shared credentials",
  );

  console.log(
    "PASS: Notion is the first ready OAuth MCP app, with PKCE, resource-bound OAuth, passive callback capture, authenticated finalization, refreshable token storage, and runtime token loading.",
  );
}

main();
