import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const operatorDashboard = read("convex/operatorDashboard.ts");
const operatorGateway = read("shared/cloudOperatorDashboardGateway.ts");
const appShellNavigation = read("shared/appShellNavigation.ts");
const webRouteState = read("shared/webAppRouteState.ts");
const appMainSurfaceHost = read("apps/web/src/components/WebAppMainSurfaceHost.tsx");

assert.match(
  operatorDashboard,
  /async function requireOperatorAccess/,
  "operator dashboard must centralize access checking",
);
assert.match(
  operatorDashboard,
  /resolveAuthenticatedActor/,
  "operator dashboard must resolve the authenticated actor server-side",
);
assert.match(
  operatorDashboard,
  /isCreatorDevTierOverrideEmail\(actor\.email\)/,
  "operator dashboard must be allowlisted before a real operator role table exists",
);
assert.match(
  operatorDashboard,
  /throw new Error\("operator_access_forbidden"\)/,
  "operator dashboard must fail closed when access is missing",
);

for (const queryName of [
  "getOperatorAccess",
  "getOperatorOverview",
  "listOperatorBuilders",
  "getOperatorMonetization",
  "listOperatorRisks",
  "listOperatorEvents",
]) {
  assert.match(operatorDashboard, new RegExp(`export const ${queryName} = query`), `${queryName} must be public query`);
}

assert.doesNotMatch(
  operatorDashboard,
  /mutation|action|ctx\.db\.insert|ctx\.db\.patch|ctx\.db\.delete/,
  "operator dashboard must remain read-only",
);

assert.match(
  operatorGateway,
  /bootstrapConvexAuthenticatedClient/,
  "operator gateway must use the authenticated Convex client",
);
assert.match(
  operatorGateway,
  /operatorDashboard:getOperatorOverview/,
  "operator gateway must call the gated operator dashboard surface",
);
assert.doesNotMatch(
  operatorGateway,
  /operatorIntelligence:/,
  "web gateway must not call internal operator intelligence directly",
);

assert.match(appShellNavigation, /AppPage = [^;]*"operator"/, "operator route must be declared");
assert.match(webRouteState, /segments\[0\] === "operator"/, "operator route must parse explicitly");
assert.match(webRouteState, /state\.page === "operator"[\s\S]*return "\/operator"/, "operator route must serialize explicitly");
assert.match(appMainSurfaceHost, /WebOperatorDashboard/, "main surface must render the operator dashboard");

console.log("operator_dashboard_gate_proof: ok");
