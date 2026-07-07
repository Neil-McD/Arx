import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

function assertMatch(source: string, pattern: RegExp, label: string): void {
  assert.match(source, pattern, label);
}

function assertNotMatch(source: string, pattern: RegExp, label: string): void {
  assert.doesNotMatch(source, pattern, label);
}

const threads = read("convex/threads.ts");
const daytonaActions = read("convex/daytonaCodexRuntimeTargetActions.ts");
const cloudThreadsRead = read("shared/cloudThreadsRead.ts");
const daytonaCodexConfig = read("services/polynet-codex-worker/src/daytonaCodexConfig.ts");
const workerServer = read("services/polynet-codex-worker/src/server.ts");
const workerToolSpecs = read("services/polynet-codex-worker/src/workerToolSpecs.ts");
const daytonaRuntimeAppPreview = read("apps/web/src/components/DaytonaRuntimeAppPreview.tsx");
const runtimeRunLifecycle = read("apps/web/src/controllers/useWebRuntimeRunLifecycle.ts");
const previewProxy = read("apps/preview-proxy/server.js");
const previewProxySessionToken = read("apps/preview-proxy/previewProxySessionToken.js");
const convexPreviewProxySessionToken = read("convex/previewProxySessionToken.ts");

assertMatch(
  threads,
  /import \{ normalizeWorkspacePreviewPort \} from "\.\.\/shared\/workspacePreviewPort";/,
  "threads action must use canonical workspace preview port policy",
);

assertMatch(
  daytonaActions,
  /import \{ normalizeWorkspacePreviewPort \} from "\.\.\/shared\/workspacePreviewPort";/,
  "Daytona internal action must use canonical workspace preview port policy",
);

assertNotMatch(
  threads,
  /port < 1 \|\| port > 65535/,
  "public preview action must not allow arbitrary sandbox ports",
);

assertNotMatch(
  daytonaActions,
  /port < 1 \|\| port > 65535/,
  "internal Daytona preview action must not allow arbitrary sandbox ports",
);

assertMatch(
  threads,
  /getDaytonaWorkspacePreviewReadyEventInternal = internalQuery[\s\S]*eventType !== "workspace_preview_ready"[\s\S]*payload\.provider[\s\S]*"daytona"[\s\S]*normalizeWorkspacePreviewPort\(payload\.port\)/,
  "public preview action must have an internal evidence query for Daytona workspace_preview_ready events",
);

assertMatch(
  threads,
  /getDaytonaWorkspacePreviewReadyEventInternal = internalQuery[\s\S]*\.withIndex\("by_owner_run_seq"[\s\S]*\.collect\(\)[\s\S]*for \(const row of \[\.\.\.rows\]\.reverse\(\)\)/,
  "Daytona preview evidence lookup must scan the exact run events newest-first instead of a latest-N window that can miss early preview events",
);

assertNotMatch(
  threads,
  /getDaytonaWorkspacePreviewReadyEventInternal[\s\S]*\.order\("desc"\)[\s\S]*\.take\(500\)/,
  "Daytona preview evidence lookup must not use a latest-500 event window",
);

assertMatch(
  threads,
  /const previewReadyEvent = \(await ctx\.runQuery\([\s\S]*getDaytonaWorkspacePreviewReadyEventInternal[\s\S]*if \(!previewReadyEvent\) \{[\s\S]*code: "daytona_preview_not_authorized"/,
  "public preview action must fail closed when run/port preview evidence is missing",
);

const publicActionSource = threads.slice(threads.indexOf("export const getCloudRuntimeRunDaytonaPreviewSession"));
assertMatch(
  publicActionSource,
  /resolveOwnerIdForAuthenticatedRequest[\s\S]*getDaytonaWorkspacePreviewReadyEventInternal[\s\S]*preview_proxy_token: String\(preview\.preview_proxy_token \?\? ""\)[\s\S]*preview_transport:/,
  "authenticated Daytona preview action may return a preview gateway token only after auth and run/port evidence checks",
);

const publicStopActionSource = threads.slice(threads.indexOf("export const stopCloudRuntimeRunDaytonaPreview"));
assertMatch(
  publicStopActionSource,
  /resolveOwnerIdForAuthenticatedRequest[\s\S]*getDaytonaWorkspacePreviewReadyEventInternal[\s\S]*stopDaytonaAppPreviewInternal[\s\S]*reason: "polynet_preview_card_stop"[\s\S]*appendCloudRuntimeRunEventInternal[\s\S]*eventType: "workspace_preview_stopped"[\s\S]*source: "preview_card_stop"/,
  "authenticated Daytona preview stop action must verify run/port evidence, delegate to Daytona stop, and append a stopped-preview event",
);

assertMatch(
  cloudThreadsRead,
  /preview_proxy_token: string \| null;[\s\S]*preview_url: string \| null;/,
  "browser Daytona preview session type must explicitly model gateway-token and direct signed-url transports",
);

assertMatch(
  cloudThreadsRead,
  /const previewTransport =[\s\S]*const previewProxyToken = String\(payload\.preview_proxy_token \?\? ""\)\.trim\(\);[\s\S]*const previewUrl = String\(payload\.preview_url \?\? ""\)\.trim\(\);[\s\S]*previewTransport === "daytona_signed_direct" \? Boolean\(previewUrl\) : Boolean\(previewProxyToken\)/,
  "browser Daytona preview parser must require a direct signed URL only for direct transport and a gateway token otherwise",
);

assertMatch(
  cloudThreadsRead,
  /preview_transport: "polynet_preview_gateway" \| "daytona_signed_direct" \| string \| null;/,
  "browser Daytona preview session type must expose explicit preview transport including the gated direct experiment",
);

assertMatch(
  cloudThreadsRead,
  /stopConvexCloudRuntimeRunDaytonaPreview[\s\S]*client\.action\("threads:stopCloudRuntimeRunDaytonaPreview" as any[\s\S]*daytona_preview_port_not_active/,
  "browser Daytona preview stop helper must call the authenticated stop action and treat inactive preview ports as stale",
);

assertMatch(
  daytonaActions,
  /sandboxState === "stopped"[\s\S]*providerTeardownState === "stopped"[\s\S]*daytona_sandbox_not_available[\s\S]*previewLeaseActive[\s\S]*activePreviewPorts\.includes\(port\)[\s\S]*providerSandboxState[\s\S]*preview_resolution_provider_state[\s\S]*getSignedPreviewUrl\(port, expiresInSeconds\)[\s\S]*const previewTransport = readDaytonaAppPreviewTransport\(\);[\s\S]*previewTransport === "daytona_signed_direct"[\s\S]*preview_url: previewUrl[\s\S]*mintPreviewProxySessionToken\([\s\S]*previewUrl[\s\S]*preview_proxy_token: minted\.token[\s\S]*preview_transport: "polynet_preview_gateway"/,
  "Daytona preview resolver must reject stopped or inactive previews before choosing direct or gateway transport",
);

assertMatch(
  daytonaActions,
  /function readDaytonaAppPreviewTransport\(\): DaytonaAppPreviewTransport[\s\S]*POLYNET_DAYTONA_APP_PREVIEW_TRANSPORT[\s\S]*if \(value === "daytona_signed_direct"\) return "daytona_signed_direct";[\s\S]*return "polynet_preview_gateway";/,
  "Daytona direct app preview transport must be opt-in and default to the Polynet preview gateway",
);

assertNotMatch(
  daytonaActions,
  /resolveDaytonaCodexRuntimePreviewInternal[\s\S]*getPreviewLink/,
  "Daytona app preview resolver must not use header-token preview links that require a proxy",
);

assertMatch(
  daytonaActions,
  /resolveDaytonaCodexRuntimePreviewInternal[\s\S]*mintPreviewProxySessionToken/,
  "Daytona app preview resolver must keep the preview gateway path so the gateway can skip Daytona's browser warning",
);

assertMatch(
  daytonaRuntimeAppPreview,
  /buildDaytonaPreviewFrameUrl[\s\S]*preview_transport === "daytona_signed_direct"[\s\S]*new URL\(String\(session\.preview_url \?\? ""\)\)[\s\S]*buildWorkspacePreviewProxyUrl/,
  "Daytona preview UI must use direct signed URLs only for direct transport and keep the gateway fallback",
);

assertMatch(
  daytonaRuntimeAppPreview,
  /stopConvexCloudRuntimeRunDaytonaPreview[\s\S]*phase: "stopping"[\s\S]*props\.onUnavailable\(props\.anchor\)[\s\S]*Stop app preview/,
  "Daytona preview UI must expose a Stop control that calls the real backend stop path and removes stopped cards",
);

assertMatch(
  daytonaRuntimeAppPreview,
  /buildWorkspacePreviewProxyUrl/,
  "Daytona preview UI must retain the gateway path that can send Daytona skip-warning headers",
);

assertMatch(
  runtimeRunLifecycle,
  /const RUNTIME_EVENT_PAGE_LIMIT = 500;[\s\S]*const COMPLETED_RUNTIME_EVENT_MAX_ROWS = 2000;[\s\S]*async function listCompletedRuntimeRunEvents[\s\S]*while \(rows\.length < COMPLETED_RUNTIME_EVENT_MAX_ROWS\)[\s\S]*afterSeq[\s\S]*runtimeEventsIncludeFinished\(page\)/,
  "completed workspace runs must page runtime events so preview anchors are not dropped by a short hydration window",
);

assertNotMatch(
  daytonaCodexConfig,
  /Daytona preview URL follows this pattern|proxy\.daytona\.works|returns a preview URL/,
  "Daytona Codex developer instructions must not expose raw provider preview URL patterns",
);

assertMatch(
  daytonaCodexConfig,
  /PolyNet attaches the app to the user's preview panel[\s\S]*Never print raw provider preview URLs/,
  "Daytona Codex developer instructions must route preview UX through PolyNet",
);

assertNotMatch(
  workerServer,
  /returns a preview URL and shows the app in the user's preview panel/,
  "worker tool guidance must not tell Codex to expect or print raw preview URLs",
);

assertMatch(
  workerToolSpecs,
  /PolyNet attaches the app to the user's preview panel[\s\S]*Never print raw provider preview URLs/,
  "worker tool guidance must route preview UX through PolyNet",
);

assertMatch(
  previewProxySessionToken,
  /POLYNET_PREVIEW_PROXY_SIGNING_SECRET[\s\S]*ARX_PREVIEW_PROXY_SIGNING_SECRET/,
  "preview gateway verifier must prefer the canonical PolyNet signing secret while keeping the legacy ARX fallback",
);

assertMatch(
  previewProxy,
  /POLYNET_PREVIEW_PROXY_SIGNING_SECRET[\s\S]*ARX_PREVIEW_PROXY_SIGNING_SECRET[\s\S]*POLYNET_PREVIEW_PROXY_SIGNING_SECRET is required/,
  "preview gateway startup must validate the canonical PolyNet signing secret with legacy ARX fallback",
);

assertMatch(
  convexPreviewProxySessionToken,
  /readEnv\("POLYNET_PREVIEW_PROXY_SIGNING_SECRET"\)[\s\S]*readEnv\("ARX_PREVIEW_PROXY_SIGNING_SECRET"\)/,
  "Convex preview token minting must prefer the canonical PolyNet signing secret with legacy ARX fallback",
);

assertMatch(
  previewProxy,
  /X-Polynet-Preview-Gateway-Layer[\s\S]*X-Polynet-Preview-Gateway-Request-Id[\s\S]*X-Polynet-Preview-Gateway-Reason/,
  "preview gateway must expose canonical PolyNet response headers",
);

assertMatch(
  previewProxy,
  /X-Arx-Proxy-Layer[\s\S]*X-Arx-Proxy-Request-Id[\s\S]*X-Arx-Proxy-Reason/,
  "preview gateway must keep legacy ARX response headers as compatibility fallback",
);

assertMatch(
  previewProxy,
  /x-polynet-preview-gateway-layer[\s\S]*x-polynet-preview-gateway-request-id[\s\S]*x-arx-proxy-layer[\s\S]*x-arx-proxy-request-id/,
  "proxied preview responses must include canonical PolyNet headers while preserving legacy ARX headers",
);

assertMatch(
  previewProxy,
  /X-Daytona-Preview-Token/,
  "preview gateway must forward Daytona preview tokens to authenticated preview origins",
);

assertNotMatch(
  previewProxy,
  /x-daytona-preview-token/,
  "preview gateway must not forward duplicate Daytona preview-token headers with alternate casing",
);

console.log("daytona_preview_security_contract_proof: ok");
