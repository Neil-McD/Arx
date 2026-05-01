import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const operatorDashboard = read("convex/operatorDashboard.ts");
const operatorAccess = read("convex/operatorAccess.ts");
const operatorGateway = read("shared/cloudOperatorDashboardGateway.ts");
const schema = read("convex/schema.ts");
const webRouteState = read("shared/webAppRouteState.ts");
const app = read("apps/web/src/App.tsx");
const workspaceHost = read("apps/web/src/components/WebWorkspaceHost.tsx");

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
assert.doesNotMatch(
  operatorAccess,
  /isCreatorDevTierOverrideEmail|bootstrap_email|creatorDevTier/i,
  "operator access must not grant production authority from creator email bootstrap",
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

assert.match(webRouteState, /segments\[0\] === "operator"/, "operator route must parse explicitly");
assert.match(
  webRouteState,
  /segments\[0\] === "operator"[\s\S]*page: "workspace"/,
  "operator route must fold into the canonical workspace shell",
);
assert.match(
  webRouteState,
  /state\.page === "operator"[\s\S]*return "\/workspace"/,
  "operator route serialization must not preserve a standalone operator page",
);
assert.match(
  app,
  /loadOperatorAccessCanonical\(\{ session \}\)[\s\S]*setOperatorAccess\(access\)/,
  "workspace must only enable operator UI after the gated operator access query succeeds",
);
assert.match(
  app,
  /showOperatorDataPanel: Boolean\(operatorAccess && session\)/,
  "workspace operator panel must stay hidden without an operator access snapshot",
);
assert.match(
  workspaceHost,
  /showOperatorDataPanel = Boolean\(props\.showOperatorDataPanel && props\.operatorDataPanelSession\)/,
  "workspace host must require both the operator flag and an authenticated session",
);
assert.match(
  workspaceHost,
  /useOperatorDashboardData\([\s\S]*enabled: isOperatorDataPanelVisible/,
  "operator data loading must be disabled unless the operator panel is visible",
);

console.log("operator_dashboard_gate_proof: ok");
