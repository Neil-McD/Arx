import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

const threads = read("convex/threads.ts");
const daytonaActions = read("convex/daytonaCodexRuntimeTargetActions.ts");
const runtimeSession = read("convex/runtimeExecutionSession.ts");
const workspaceTerminalCore = read("convex/workspaceTerminalProcessCore.ts");
const cloudThreadsRead = read("shared/cloudThreadsRead.ts");
const runtimePrompt = read("shared/runtimePrompt.ts");
const webResearchPolicy = read("shared/webResearchUrlPolicy.ts");
const daytonaCodexConfig = read("services/polynet-codex-worker/src/daytonaCodexConfig.ts");
const daytonaLocalTool = read("services/polynet-codex-worker/src/daytonaLocalWorkspaceTool.ts");
const workerServer = read("services/polynet-codex-worker/src/server.ts");
const workerToolSpecs = read("services/polynet-codex-worker/src/workerToolSpecs.ts");
const previewProxy = read("apps/preview-proxy/server.js");
const previewProxySessionToken = read("apps/preview-proxy/previewProxySessionToken.js");
const convexPreviewProxySessionToken = read("convex/previewProxySessionToken.ts");
const rootEnv = read(".env.example");
const webEnv = read("apps/web/.env.example");
const packageJson = read("package.json");

for (const retiredPath of [
  "apps/web/src/components/DaytonaRuntimeAppPreview.tsx",
  "apps/web/src/lib/workspacePreviewProxy.ts",
]) {
  assert.equal(
    existsSync(resolve(root, retiredPath)),
    false,
    `${retiredPath} must remain deleted with the human preview plane`,
  );
}

assert.doesNotMatch(
  cloudThreadsRead,
  /CloudRuntimeDaytonaPreview|getConvexCloudRuntimeRunDaytonaPreviewSession|stopConvexCloudRuntimeRunDaytonaPreview/,
  "the browser gateway must not retain Daytona preview-card types or actions",
);
assert.doesNotMatch(
  threads,
  /export const (?:get|stop)CloudRuntimeRunDaytonaPreview|preview_card_stop|polynet_preview_card_stop/,
  "Convex must not retain public actions owned only by the deleted preview card",
);
assert.doesNotMatch(
  daytonaActions,
  /resolveDaytonaCodexRuntimePreviewInternal|DaytonaAppPreviewTransport|POLYNET_DAYTONA_APP_PREVIEW_TRANSPORT|POLYNET_DAYTONA_PREVIEW_URL_PATTERN/,
  "Daytona runtime actions must not retain the deleted UI URL-minting transport",
);
assert.doesNotMatch(
  daytonaLocalTool + workerServer + daytonaCodexConfig,
  /previewUrlPattern|previewUrlHint|getDaytonaPreviewUrlPattern|POLYNET_DAYTONA_PREVIEW_URL_PATTERN|proxy\.daytona\.works/,
  "the worker must not construct or advertise provider preview URL hints",
);
assert.doesNotMatch(
  workerServer + workerToolSpecs + daytonaCodexConfig + runtimePrompt + webResearchPolicy,
  /attaching the Daytona preview panel|user can open it from the preview panel|expose an inline preview|workspace preview surface|user-viewable app run/,
  "runtime guidance must not claim a human preview surface exists",
);
assert.doesNotMatch(
  rootEnv + webEnv,
  /VITE_WORKSPACE_PREVIEW_ORIGIN|POLYNET_DAYTONA_APP_PREVIEW_TRANSPORT|POLYNET_DAYTONA_PREVIEW_URL_PATTERN/,
  "environment templates must not advertise deleted browser or direct-preview transports",
);

assert.match(
  runtimeSession,
  /toolName === "terminal_start"[\s\S]*startDaytonaAppPreviewInternal[\s\S]*emitRunEvent\("workspace_preview_ready"/,
  "terminal_start must retain app-server lifecycle execution and its operational ready event",
);
assert.match(
  runtimeSession,
  /toolName === "terminal_stop"[\s\S]*stopDaytonaAppPreviewInternal[\s\S]*emitRunEvent\("workspace_preview_stopped"/,
  "terminal_stop must retain app-server cleanup and its operational stopped event",
);
assert.match(
  daytonaActions,
  /export const stopDaytonaAppPreviewInternal = internalAction[\s\S]*markDaytonaCodexRuntimeTargetPreviewPortsStoppedInternal/,
  "the internal app-server stop path and target accounting must remain",
);
assert.match(
  daytonaActions,
  /appendDaytonaPreviewStoppedEventBestEffort[\s\S]*eventType: "workspace_preview_stopped"[\s\S]*sweepExpiredDaytonaCodexRuntimeTargetsInternal/,
  "provider cleanup and expiry sweeping must retain operational stop evidence",
);
assert.match(
  threads,
  /getDaytonaWorkspacePreviewReadyEventInternal = internalQuery[\s\S]*eventType !== "workspace_preview_ready"[\s\S]*normalizeWorkspacePreviewPort\(payload\.port\)/,
  "internal run/port evidence lookup must remain for lifecycle reconciliation",
);
assert.match(
  workerToolSpecs + daytonaCodexConfig,
  /workspace_serve[\s\S]*computer_open_url[\s\S]*computer_screenshot/,
  "worker guidance must retain runtime-side app-server inspection",
);
assert.match(
  workerServer,
  /workspace_preview_ready[\s\S]*port[\s\S]*runtime-side visual verification/,
  "worker execution must retain the operational ready event without exposing a browser URL",
);
assert.match(
  workspaceTerminalCore,
  /import \{ mintPreviewProxySessionToken \} from "\.\/previewProxySessionToken";[\s\S]*mintPreviewProxySessionToken\(/,
  "generic terminal preview-proxy token minting must remain for non-Daytona presentation consumers",
);

assert.match(
  previewProxySessionToken,
  /POLYNET_PREVIEW_PROXY_SIGNING_SECRET[\s\S]*ARX_PREVIEW_PROXY_SIGNING_SECRET/,
  "preview proxy verifier must prefer the canonical secret while retaining the legacy fallback",
);
assert.match(
  convexPreviewProxySessionToken,
  /readEnv\("POLYNET_PREVIEW_PROXY_SIGNING_SECRET"\)[\s\S]*readEnv\("ARX_PREVIEW_PROXY_SIGNING_SECRET"\)/,
  "Convex token minting must use the same signing-secret precedence",
);
assert.match(
  previewProxy,
  /POLYNET_PREVIEW_PROXY_SIGNING_SECRET[\s\S]*ARX_PREVIEW_PROXY_SIGNING_SECRET[\s\S]*POLYNET_PREVIEW_PROXY_SIGNING_SECRET is required/,
  "preview proxy startup must fail closed without a signing secret",
);
assert.match(
  previewProxy,
  /X-Polynet-Preview-Gateway-Layer[\s\S]*X-Polynet-Preview-Gateway-Request-Id[\s\S]*X-Polynet-Preview-Gateway-Reason/,
  "canonical preview-proxy diagnostic headers must remain",
);
assert.match(
  previewProxy,
  /X-Arx-Proxy-Layer[\s\S]*X-Arx-Proxy-Request-Id[\s\S]*X-Arx-Proxy-Reason/,
  "legacy diagnostic headers must remain as compatibility fallback",
);
assert.match(
  previewProxy,
  /X-Daytona-Skip-Preview-Warning[\s\S]*X-Daytona-Preview-Token/,
  "generic proxy support for authenticated Daytona origins must remain",
);
assert.match(
  packageJson,
  /"check:preview-proxy-security-contract-proof":\s*"[^"]*scripts\/preview_proxy_security_contract_proof\.ts"/,
  "package scripts must invoke this presentation-agnostic security proof",
);
assert.doesNotMatch(
  packageJson,
  /check:daytona-preview-security-contract-proof|daytona_preview_security_contract_proof/,
  "package scripts must not retain the superseded UI-specific proof name",
);

console.log("preview_proxy_security_contract_proof: ok");
