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

function assertOrderWithin(source: string, anchor: string, snippets: string[], message: string) {
  const anchorIndex = source.indexOf(anchor);
  assert.notEqual(anchorIndex, -1, `${message}: missing anchor ${anchor}`);
  let searchFrom = anchorIndex;
  for (const snippet of snippets) {
    const index = source.indexOf(snippet, searchFrom);
    assert.notEqual(index, -1, `${message}: missing or out-of-order snippet ${snippet}`);
    searchFrom = index + snippet.length;
  }
}

const runtimeAction = read("convex/blaxelCodexRuntimeTurn.ts");
const bridgeSource = read("convex/codexBlaxelAppServerBridge.ts");
const codexConfig = read("infra/blaxel/codex-runtime/codex-config.toml");
const packageJson = read("package.json");
const workspaceCredits = read("shared/workspaceCredits.ts");

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
  "prepareBlaxelWorkspaceBridgeFiles",
  "Runtime action must write short-lived auth/runtime payloads through the bundled workspace bridge prep API.",
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
  "Runtime action must retain persistent-volume cleanup support when a volume is requested.",
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
assertContains(
  runtimeAction,
  'const modelId = normalizeString(args.modelId) || "gpt-5.5";',
  "Runtime action must default Codex turns to GPT 5.5.",
);
assertContains(
  bridgeSource,
  "const modelId = String(source.modelId || '').trim() || 'gpt-5.5';",
  "Codex app-server bridge must default missing runtime payload models to GPT 5.5.",
);
assertDoesNotContain(
  `${runtimeAction}\n${bridgeSource}`,
  /gpt-5\.3-codex-spark/,
  "Codex runtime bridge must not keep the old Codex Spark default.",
);
assertContains(
  runtimeAction,
  "const runtimeVolumeName = destroyAfterRun ? null : names.volumeName;",
  "Default ephemeral Codex runtime turns must not allocate Blaxel volumes.",
);
assertContains(
  runtimeAction,
  "volumeName: runtimeVolumeName",
  "Runtime sandbox creation must use the optional runtime volume name.",
);
assertContains(
  runtimeAction,
  "volumeSizeMb: runtimeVolumeName ? CODEX_APP_SERVER_RUNTIME_VOLUME_SIZE_MB : null",
  "Runtime sandbox creation must only request volume storage when a volume exists.",
);
assertContains(
  runtimeAction,
  "const sandboxDiskGiB = runtimeVolumeName ? mbToGiB(CODEX_APP_SERVER_RUNTIME_VOLUME_SIZE_MB) : 0;",
  "Codex runtime disk metadata must be zero for ephemeral no-volume turns and the configured size for persistent turns.",
);
assertContains(
  workspaceCredits,
  'CODEX_BLAXEL_RUNTIME_PRICING_POLICY = "codex_blaxel_runtime_v1"',
  "Workspace credit helpers must expose a dedicated Codex Blaxel runtime pricing policy.",
);
assertContains(
  workspaceCredits,
  "CODEX_BLAXEL_RUNTIME_COST_MULTIPLIER = 1.6",
  "Codex Blaxel runtime pricing must use a direct cost multiplier instead of the old gross-margin target.",
);
assertContains(
  workspaceCredits,
  "priceCodexBlaxelRuntimeCredits",
  "Workspace credit helpers must expose Codex Blaxel runtime credit pricing.",
);
assertContains(
  runtimeAction,
  "recordTrackedCodexBlaxelRuntimeProviderCostBestEffort",
  "Runtime action must record tracked-only Codex Blaxel provider cost evidence.",
);
assertContains(
  runtimeAction,
  "internal.workspaceCredits.recordProviderCostInternal",
  "Runtime action must use the canonical provider-cost accounting writer.",
);
assertContains(
  runtimeAction,
  'component: "blaxel_active_runtime"',
  "Runtime action must classify Codex sandbox cost as active Blaxel runtime.",
);
assertContains(
  runtimeAction,
  'billingDisposition: "tracked_only"',
  "Runtime action must not debit users in the first Codex accounting slice.",
);
assertContains(
  runtimeAction,
  'provider_cost_source: "codex_blaxel_runtime_turn"',
  "Runtime action must label provider-cost evidence as coming from Codex runtime turns.",
);
assertContains(
  runtimeAction,
  "pricing_policy: CODEX_BLAXEL_RUNTIME_PRICING_POLICY",
  "Runtime action must persist the dedicated Codex pricing policy in metadata.",
);
assertContains(
  runtimeAction,
  "cost_multiplier: CODEX_BLAXEL_RUNTIME_COST_MULTIPLIER",
  "Runtime action must persist the Codex runtime cost multiplier in metadata.",
);
assertContains(
  runtimeAction,
  "polynet_price_usd",
  "Runtime action must persist the user-facing price that would apply under the Codex policy.",
);
assertContains(
  runtimeAction,
  "destroyed_after_run",
  "Runtime action accounting must preserve whether the sandbox was destroyed after the run.",
);
assertContains(
  runtimeAction,
  "bridge_cleanup_attempted",
  "Runtime action accounting must record bridge cleanup attempt evidence.",
);
assertContains(
  runtimeAction,
  "bridge_cleanup_succeeded",
  "Runtime action accounting must record bridge cleanup success evidence.",
);
assertContains(
  runtimeAction,
  "sandbox_destroy_attempted",
  "Runtime action accounting must record sandbox destroy attempt evidence.",
);
assertContains(
  runtimeAction,
  "sandbox_destroy_succeeded",
  "Runtime action accounting must record sandbox destroy success evidence.",
);
assertContains(
  runtimeAction,
  "volume_destroy_attempted",
  "Runtime action accounting must record volume destroy attempt evidence.",
);
assertContains(
  runtimeAction,
  "volume_destroy_succeeded",
  "Runtime action accounting must record volume destroy success evidence.",
);
assertOrderWithin(
  runtimeAction,
  "} finally {",
  [
    "bridgeCleanupAttempted = true;",
    "sandboxDestroyAttempted = true;",
    "if (runtimeVolumeName) {",
    "volumeDestroyAttempted = true;",
    "await recordTrackedCodexBlaxelRuntimeProviderCostBestEffort({",
  ],
  "Codex runtime provider-cost accounting must run after cleanup and any applicable destroy attempts",
);
assertDoesNotContain(
  runtimeAction,
  /PAID_TOOL_TARGET_GROSS_MARGIN_BPS|priceWorkspaceUsageCredits/,
  "Codex runtime action must not reuse the old 60% gross-margin workspace billing path.",
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
