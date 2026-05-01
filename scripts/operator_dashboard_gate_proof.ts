import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const operatorDashboard = read("convex/operatorDashboard.ts");
const operatorAccess = read("convex/operatorAccess.ts");
const operatorGateway = read("shared/cloudOperatorDashboardGateway.ts");
const schema = read("convex/schema.ts");
const appShellNavigation = read("shared/appShellNavigation.ts");
const webRouteState = read("shared/webAppRouteState.ts");
const appMainSurfaceHost = read("apps/web/src/components/WebAppMainSurfaceHost.tsx");

assert.match(
  schema,
  /operatorRoles: defineTable[\s\S]*\.index\("by_user", \["userId"\]\)[\s\S]*\.index\("by_normalizedEmail", \["normalizedEmail"\]\)/,
  "operator roles table must exist with user and email lookup indexes",
);
assert.match(
  operatorAccess,
  /resolveAuthenticatedActor/,
  "operator access must resolve the authenticated actor server-side",
);
assert.match(
  operatorAccess,
  /query\("operatorRoles"\)[\s\S]*withIndex\("by_user"/,
  "operator access must check real operator role rows",
);
assert.match(
  operatorAccess,
  /isCreatorDevTierOverrideEmail\(actor\.email\)/,
  "operator access must retain creator bootstrap fallback",
);
assert.match(
  operatorAccess,
  /throw new Error\("operator_access_forbidden"\)/,
  "operator access must fail closed when access is missing",
);
assert.match(
  operatorAccess,
  /recordOperatorDashboardAccess = mutation[\s\S]*operator_dashboard_accessed/,
  "operator dashboard access must be auditable through a gated mutation",
);
assert.match(
  operatorAccess,
  /upsertOperatorRole = mutation[\s\S]*requireOperatorRole\(ctx, args\.authSubject, "owner"\)/,
  "operator role writes must require owner access",
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
assert.match(
  operatorGateway,
  /operatorAccess:recordOperatorDashboardAccess/,
  "operator gateway must record dashboard access before loading operator data",
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
