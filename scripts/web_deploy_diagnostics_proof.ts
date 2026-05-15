import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function sliceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `expected source to include ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `expected source to include ${endNeedle}`);
  return source.slice(start, end);
}

const viteConfig = read("apps/web/vite.config.ts");
const operatorIntelligence = read("convex/operatorIntelligence.ts");
const operatorDashboard = read("convex/operatorDashboard.ts");
const operatorGateway = read("shared/cloudOperatorDashboardGateway.ts");
const operatorPlatformHealth = read("shared/operatorPlatformHealth.ts");
const operatorTypes = read("shared/operatorTypes.ts");
const operatorPanel = read("apps/web/src/components/WebOperatorDataPanel.tsx");
const packageJson = read("package.json");

const webDeployBlock = sliceBetween(
  operatorIntelligence,
  "getOperatorWebDeployDiagnosticsInternal = internalQuery",
  "export const getOperatorMonetizationInternal",
);

assert.match(
  viteConfig,
  /polynetBuildVersionPlugin[\s\S]*fileName: "version\.json"[\s\S]*JSON\.stringify\(params/,
  "web build must emit version.json for operator deploy evidence",
);

assert.match(
  operatorTypes,
  /export type OperatorWebDeployDiagnosticsSnapshot = /,
  "operator web/deploy diagnostics snapshot contract is missing",
);
for (const field of [
  "deployEvents",
  "routeChecks",
  "routeFailures",
  "assetChecks",
  "assetFailures",
  "frontendCrashEvents",
  "moduleLoadRecoveries",
  "staleBuildWarnings",
]) {
  assert.match(operatorTypes, new RegExp(`${field}: number`), `web/deploy totals missing ${field}`);
}
assert.match(
  operatorTypes,
  /export type OperatorWebDeployRouteCheck = [\s\S]*criticality: "critical" \| "important" \| "informational"/,
  "web/deploy diagnostics must expose tiered route check records",
);
assert.match(
  operatorTypes,
  /export type OperatorWebDeployAssetCheck = [\s\S]*type: "script" \| "style"/,
  "web/deploy diagnostics must expose asset check records",
);
assert.doesNotMatch(
  operatorTypes,
  /type: "script" \| "style" \| "asset"/,
  "web/deploy asset checks must not keep unused generic asset type residue",
);
assert.match(
  operatorTypes,
  /liveSurface\?: \{[\s\S]*criticalRoutes:[\s\S]*importantRoutes:[\s\S]*assetChecks: number;[\s\S]*assetFailures: number;/,
  "web/deploy diagnostics must expose a live web surface summary",
);

assert.match(
  webDeployBlock,
  /readDiagnosticEventsBySubsystem\(ctx, "deploy"/,
  "web/deploy diagnostics must read deploy subsystem diagnostic events",
);
assert.match(
  webDeployBlock,
  /frontendCrashEvents[\s\S]*moduleLoadRecoveries[\s\S]*staleBuildWarnings/,
  "web/deploy diagnostics must classify frontend crash, module-load, and stale-build signals",
);
assert.match(
  webDeployBlock,
  /sourceTables:\s*\["platformDiagnosticEvents"\]/,
  "web/deploy diagnostics evidence must name platformDiagnosticEvents",
);
assert.match(
  webDeployBlock,
  /frontendCrashSource:\s*"platformDiagnosticEvents"[\s\S]*frontendCrashCoverage:\s*"first_party_deploy_events_only"[\s\S]*sentryBacked:\s*false/,
  "web/deploy diagnostics must label frontend crash coverage as first-party only until Sentry ingestion exists",
);
assert.doesNotMatch(
  webDeployBlock,
  /internalMutation|mutation|action|ctx\.db\.insert|ctx\.db\.patch|ctx\.db\.delete/,
  "operator web/deploy diagnostics must stay read-only",
);

assert.match(
  operatorDashboard,
  /getOperatorWebDeployDiagnostics = query[\s\S]*requireOperatorAccess[\s\S]*getOperatorWebDeployDiagnosticsInternal/,
  "public web/deploy diagnostics query must be operator-gated",
);
assert.match(
  operatorGateway,
  /operatorDashboard:getOperatorWebDeployDiagnostics/,
  "web gateway must call the gated web/deploy diagnostics query",
);
assert.doesNotMatch(
  operatorGateway,
  /operatorIntelligence:getOperatorWebDeployDiagnosticsInternal/,
  "web gateway must not call internal web/deploy diagnostics directly",
);
assert.match(
  operatorGateway,
  /OPERATOR_WEB_DEPLOY_ROUTE_PROBES[\s\S]*"\/"[\s\S]*criticality: "critical"[\s\S]*"\/workspace"[\s\S]*criticality: "critical"[\s\S]*"\/discover\/apps"[\s\S]*criticality: "important"[\s\S]*"\/settings\/integrations"/,
  "web/deploy diagnostics must probe tiered same-origin routes",
);
assert.match(
  operatorGateway,
  /buildVersionProbeUrl[\s\S]*"\/version\.json"/,
  "web/deploy diagnostics must read same-origin version.json",
);
assert.match(
  operatorGateway,
  /extractSameOriginAssetsFromHtml[\s\S]*probeSameOriginAsset[\s\S]*same-origin asset probes/,
  "web/deploy diagnostics must probe live same-origin assets from production HTML",
);
assert.match(
  operatorGateway,
  /OPERATOR_WEB_DEPLOY_PROBE_TIMEOUT_MS\s*=\s*\d+[\s\S]*AbortController[\s\S]*controller\.abort\(\)/,
  "web/deploy diagnostics must bound browser probes with AbortController timeouts",
);
assert.match(
  operatorGateway,
  /fetchSameOriginWithTimeout[\s\S]*readCurrentBuildFromVersionJson[\s\S]*fetchSameOriginWithTimeout[\s\S]*probeSameOriginRoute[\s\S]*fetchSameOriginWithTimeout[\s\S]*probeSameOriginAsset[\s\S]*fetchSameOriginWithTimeout/,
  "version, route, and asset probes must use timeout-bound fetches",
);
assert.match(
  operatorGateway,
  /credentials:\s*"same-origin"/,
  "web/deploy probes must stay same-origin",
);
assert.doesNotMatch(
  operatorGateway,
  /VERCEL_|SENTRY_AUTH_TOKEN|Authorization|Bearer/,
  "web/deploy browser diagnostics must not expose deployment or observability secrets",
);

assert.match(
  operatorPanel,
  /loadOperatorWebDeployDiagnosticsCanonical/,
  "operator panel must load web/deploy diagnostics",
);
assert.match(
  operatorPanel,
  /Web &amp; deploy[\s\S]*Live web surface[\s\S]*Critical routes[\s\S]*Important routes[\s\S]*Assets/,
  "operator panel must render live web surface details",
);
assert.match(
  operatorPanel,
  /Build version evidence is unavailable/,
  "operator panel must surface missing version evidence",
);
assert.doesNotMatch(
  operatorPanel,
  /Crash counts here are first-party deploy diagnostics only[\s\S]*Sentry-backed issue totals are shown in Frontend errors/,
  "operator panel must not keep redundant Web/Sentry explanatory note",
);
assert.match(
  operatorPanel,
  /No web asset probes returned/,
  "operator panel must label missing asset probe evidence",
);
assert.match(
  operatorPlatformHealth,
  /const live = web\.liveSurface[\s\S]*score: live\?\.score[\s\S]*status: live\?\.health/,
  "web platform card must score from the live surface when available",
);
assert.doesNotMatch(
  operatorPlatformHealth,
  /Sentry frontend incident|Sentry frontend degraded/,
  "web platform card must not treat Sentry issue state as live web availability",
);
assert.doesNotMatch(
  operatorPlatformHealth,
  /frontendErrors|OperatorFrontendErrorDiagnosticsSnapshot/,
  "web platform card must not keep frontend-error coupling",
);
assert.match(
  operatorPanel,
  /Web and deploy diagnostics are sampled for this window/,
  "operator panel must label sampled web/deploy diagnostics",
);
assert.match(
  operatorPanel,
  /Promise\.allSettled[\s\S]*webDeploy[\s\S]*fulfilledValue\(webDeploy\)/,
  "web/deploy diagnostics failure must not blank the whole operator panel",
);
assert.match(
  packageJson,
  /"check:web-deploy-diagnostics-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/web_deploy_diagnostics_proof\.ts"/,
  "web/deploy diagnostics proof must be wired into package scripts",
);

console.log("web_deploy_diagnostics_proof: ok");
