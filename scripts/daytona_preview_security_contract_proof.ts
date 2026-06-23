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
  /const previewReadyEvent = \(await ctx\.runQuery\([\s\S]*getDaytonaWorkspacePreviewReadyEventInternal[\s\S]*if \(!previewReadyEvent\) \{[\s\S]*code: "daytona_preview_not_authorized"/,
  "public preview action must fail closed when run/port preview evidence is missing",
);

const publicActionSource = threads.slice(threads.indexOf("export const getCloudRuntimeRunDaytonaPreviewSession"));
assertMatch(
  publicActionSource,
  /resolveOwnerIdForAuthenticatedRequest[\s\S]*getDaytonaWorkspacePreviewReadyEventInternal[\s\S]*preview_proxy_token: String\(preview\.preview_proxy_token \?\? ""\)[\s\S]*preview_transport:/,
  "authenticated Daytona preview action may return a preview gateway token only after auth and run/port evidence checks",
);

assertMatch(
  cloudThreadsRead,
  /preview_proxy_token: string;/,
  "browser Daytona preview session type must explicitly model the preview gateway token",
);

assertMatch(
  cloudThreadsRead,
  /const previewProxyToken = String\(payload\.preview_proxy_token \?\? ""\)\.trim\(\);[\s\S]*if \(!previewProxyToken/,
  "browser Daytona preview parser must require a non-empty preview gateway token",
);

assertMatch(
  cloudThreadsRead,
  /preview_transport: "polynet_preview_gateway" \| string \| null;/,
  "browser Daytona preview session type must expose explicit preview transport",
);

assertMatch(
  daytonaActions,
  /getSignedPreviewUrl\(port, expiresInSeconds\)[\s\S]*mintPreviewProxySessionToken\([\s\S]*previewUrl[\s\S]*preview_proxy_token: minted\.token[\s\S]*preview_transport: "polynet_preview_gateway"/,
  "Daytona preview resolver must wrap signed preview URLs in the PolyNet preview gateway transport",
);

assertNotMatch(
  daytonaActions,
  /resolveDaytonaCodexRuntimePreviewInternal[\s\S]*getPreviewLink/,
  "Daytona app preview resolver must not use header-token preview links that require a proxy",
);

assertMatch(
  daytonaActions,
  /resolveDaytonaCodexRuntimePreviewInternal[\s\S]*mintPreviewProxySessionToken/,
  "Daytona app preview resolver must mint a preview gateway token so the gateway can skip Daytona's browser warning",
);

assertMatch(
  daytonaRuntimeAppPreview,
  /buildWorkspacePreviewProxyUrl\(\{[\s\S]*previewProxyToken: result\.session\.preview_proxy_token/,
  "Daytona preview UI must render through the preview gateway URL",
);

assertMatch(
  daytonaRuntimeAppPreview,
  /buildWorkspacePreviewProxyUrl/,
  "Daytona preview UI must route app previews through the gateway that can send Daytona skip-warning headers",
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
