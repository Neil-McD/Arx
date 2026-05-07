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
  /polynetBuildVersionPlugin[\s\S]*fileName: "version\.json"[\s\S]*JSON\.stringify\(\{ buildId \}/,
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
  "frontendCrashEvents",
  "moduleLoadRecoveries",
  "staleBuildWarnings",
]) {
  assert.match(operatorTypes, new RegExp(`${field}: number`), `web/deploy totals missing ${field}`);
}
assert.match(
  operatorTypes,
  /export type OperatorWebDeployRouteCheck = /,
  "web/deploy diagnostics must expose route check records",
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
  /OPERATOR_WEB_DEPLOY_ROUTE_PROBES[\s\S]*"\/"[\s\S]*"\/discover\/apps"[\s\S]*"\/settings\/integrations"/,
  "web/deploy diagnostics must probe the key same-origin routes",
);
assert.match(
  operatorGateway,
  /buildVersionProbeUrl[\s\S]*"\/version\.json"/,
  "web/deploy diagnostics must read same-origin version.json",
);
assert.match(
  operatorGateway,
  /OPERATOR_WEB_DEPLOY_PROBE_TIMEOUT_MS\s*=\s*\d+[\s\S]*AbortController[\s\S]*controller\.abort\(\)/,
  "web/deploy diagnostics must bound browser probes with AbortController timeouts",
);
assert.match(
  operatorGateway,
  /fetchSameOriginWithTimeout[\s\S]*readCurrentBuildFromVersionJson[\s\S]*fetchSameOriginWithTimeout[\s\S]*probeSameOriginRoute[\s\S]*fetchSameOriginWithTimeout/,
  "version and route probes must both use timeout-bound fetches",
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
  /Web &amp; deploy/,
  "operator panel must render the web/deploy diagnostics section",
);
assert.match(
  operatorPanel,
  /Build version evidence is unavailable/,
  "operator panel must surface missing version evidence",
);
assert.match(
  operatorPanel,
  /Crash counts here are first-party deploy diagnostics only[\s\S]*Sentry-backed issue totals are shown in Frontend errors/,
  "operator panel must label frontend crash coverage limits and point to Sentry-backed issue totals",
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
