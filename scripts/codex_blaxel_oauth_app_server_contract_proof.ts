import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function exists(relativePath: string): boolean {
  return existsSync(new URL(`../${relativePath}`, import.meta.url));
}

function assertContains(source: string, snippet: string, message: string) {
  assert.ok(source.includes(snippet), message);
}

function assertDoesNotContain(source: string, pattern: RegExp, message: string) {
  assert.equal(pattern.test(source), false, message);
}

const runtimeAction = read("convex/blaxelCodexRuntimeTurn.ts");
const bridgeSource = read("convex/codexBlaxelAppServerBridge.ts");
const codexConfig = read("infra/blaxel/codex-runtime/codex-config.toml");
const packageJson = read("package.json");

for (const deletedPath of [
  "convex/blaxelWorkspaceCodexAppServerSmoke.ts",
  "scripts/codex_blaxel_oauth_app_server_staging_smoke.ts",
]) {
  assert.equal(exists(deletedPath), false, `${deletedPath} should remain deleted`);
}

assertContains(codexConfig, 'approval_policy = "never"', "Codex runtime config must preserve full-access approvals.");
assertContains(
  codexConfig,
  'sandbox_mode = "danger-full-access"',
  "Codex runtime config must preserve full-access sandbox mode.",
);

assertContains(
  runtimeAction,
  "getFreshChatgptAuthForUser",
  "Runtime action must use the existing ChatGPT OAuth token refresh primitive.",
);
assertContains(
  runtimeAction,
  "readAuthenticatedIdentityProfile",
  "Runtime action must prefer a verified Convex identity when available.",
);
assertContains(
  runtimeAction,
  'deploymentKind === "staging" ? explicitAuthSubject : ""',
  "Runtime action must only allow explicit auth subjects in staging.",
);
assertContains(
  runtimeAction,
  "internal.threads.getUserByAuthSubjectInternal",
  "Runtime action must resolve the owning user from the auth subject.",
);
assertContains(
  runtimeAction,
  "writeBlaxelWorkspaceFile",
  "Runtime action must write short-lived auth/runtime payloads through the workspace file API.",
);
assertContains(
  runtimeAction,
  "buildCodexBlaxelExternalAuthPayload",
  "Runtime action must serialize the Codex app-server auth payload through the bridge helper.",
);
assertContains(
  runtimeAction,
  "buildCodexWebSocketAppServerStartCommand",
  "Runtime action must start Codex app-server as a durable local WebSocket process.",
);
assertContains(
  runtimeAction,
  "buildCodexWebSocketRuntimeBridgeClientCommand",
  "Runtime action must use the product runtime bridge client.",
);
assertContains(
  runtimeAction,
  "mintCodexBridgeRunToken",
  "Runtime action must mint scoped callback tokens.",
);
assertContains(
  runtimeAction,
  "setCloudRuntimeRunContextSnapshotInternal",
  "Runtime action must persist context snapshots for continuity and audit.",
);
assertContains(
  runtimeAction,
  "stopBlaxelWorkspaceProcess",
  "Runtime action must stop the Codex app-server process after the run.",
);
assertContains(
  runtimeAction,
  "destroyBlaxelWorkspaceVolume",
  "Runtime action must clean up its temporary volume by default.",
);
assertContains(
  runtimeAction,
  "EXPECTED_CODEX_RUNTIME_IMAGE_PREFIX",
  "Runtime action must fail unless Blaxel uses the custom Codex runtime image.",
);
assertContains(
  runtimeAction,
  "CODEX_APP_SERVER_RUNTIME_VOLUME_SIZE_MB",
  "Runtime action must use runtime naming, not legacy smoke naming.",
);

for (const snippet of [
  "account/login/start",
  "chatgptAuthTokens",
  "account/read",
  "thread/start",
  "turn/start",
  "turn/started",
  "item/agentMessage/delta",
  "turn/completed",
  "account/updated",
  "account/chatgptAuthTokens/refresh",
  "accessToken",
  "chatgptAccountId",
  "globalThis.WebSocket",
  "unset OPENAI_API_KEY CODEX_API_KEY",
  "POLYNET_CODEX_RUNTIME_BRIDGE_OK",
  "POLYNET_CODEX_RUNTIME_PAYLOADS_REMOVED",
]) {
  assertContains(bridgeSource, snippet, `Runtime bridge helper must include ${snippet}.`);
}

assertContains(
  bridgeSource,
  "ws://127.0.0.1:${CODEX_APP_SERVER_WS_PORT}",
  "Codex app-server must bind to a loopback WebSocket listener inside the sandbox.",
);
assertDoesNotContain(
  bridgeSource,
  /CODEX_APP_SERVER_(SMOKE_VOLUME_SIZE_MB|WS_SMOKE_PORT|TURN_SMOKE_PROMPT)|buildCodexExternalAuthAndInitializeCommand|buildCodexWebSocketTurnSmokeClientCommand/,
  "Bridge helper must not retain deleted smoke helpers or smoke constants.",
);
assertDoesNotContain(
  `${runtimeAction}\n${bridgeSource}`,
  /npx\s+.*@openai\/codex/,
  "Runtime bridge must not fetch Codex dynamically with npx.",
);
assertDoesNotContain(
  `${runtimeAction}\n${bridgeSource}`,
  /codex login --with-access-token|auth\.json|access-token/,
  "Runtime bridge must not model ChatGPT OAuth as persistent CLI auth.",
);
assertDoesNotContain(
  runtimeAction,
  /forceRefresh:\s*true/,
  "Runtime action must not force-refresh ChatGPT OAuth and risk deleting a valid connection on transient refresh failure.",
);
assertDoesNotContain(
  packageJson,
  /smoke:codex-blaxel-oauth-app-server/,
  "Package scripts must not expose deleted standalone OAuth app-server smokes.",
);
assertContains(
  packageJson,
  "check:codex-blaxel-oauth-app-server-contract",
  "Package scripts must expose the local OAuth/app-server contract proof.",
);
assertContains(
  packageJson,
  "smoke:codex-blaxel-runtime-bridge-staging",
  "Package scripts must expose the canonical runtime bridge staging smoke.",
);

console.log(
  JSON.stringify(
    {
      ok: true,
      proof: "codex_blaxel_oauth_app_server_contract",
      canonicalRuntime: "blaxelCodexRuntimeTurn:runBlaxelCodexRuntimeTurn",
    },
    null,
    2,
  ),
);
