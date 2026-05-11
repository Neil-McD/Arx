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
const appMainSurfaceHost = read("apps/web/src/components/WebAppMainSurfaceHost.tsx");
const workspaceHost = read("apps/web/src/components/WebWorkspaceHost.tsx");
const packageJson = read("package.json");
const seedScript = read("scripts/seed_operator_owner.ts");

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
assert.match(
  packageJson,
  /"operator:seed-owner": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/seed_operator_owner\.ts"/,
  "operator owner recovery must have one explicit local seed command",
);
assert.match(seedScript, /refusing to run without explicit --prod/, "operator seed must require explicit production intent");
assert.match(seedScript, /multiple matching users found/, "operator seed must fail closed on ambiguous identity");
assert.match(seedScript, /runConvexImport\("criticalAuditEvents"/, "operator seed must write an audit event");
assert.doesNotMatch(seedScript, /first owner|bootstrap/i, "operator seed must not implement runtime bootstrap authority");

const operatorQueryNames = [...operatorDashboard.matchAll(/export const (\w+) = query/g)].map((match) => match[1]);
for (const queryName of [
  "getOperatorAccess",
  "getOperatorOverview",
  "listOperatorCommunities",
  "getOperatorAccountSetupSnapshot",
  "getOperatorMonetization",
  "getOperatorWebDeployDiagnostics",
  "getOperatorAuthAccessDiagnostics",
  "getOperatorSecurityAuditDiagnostics",
  "getOperatorRuntimeToolDiagnostics",
  "listOperatorRisks",
  "listOperatorEvents",
]) {
  assert.ok(operatorQueryNames.includes(queryName), `${queryName} must be public query`);
}

for (const queryName of operatorQueryNames) {
  assert.match(
    operatorDashboard,
    new RegExp(`export const ${queryName} = query\\([\\s\\S]*?await requireOperatorAccess\\(ctx, args\\.authSubject\\)`),
    `${queryName} must route through requireOperatorAccess`,
  );
}

assert.doesNotMatch(operatorDashboard, /export const \w+ = action/, "operator dashboard must not expose public actions");
assert.deepEqual(
  [...operatorDashboard.matchAll(/export const (\w+) = mutation/g)].map((match) => match[1]),
  ["backfillHarnessAppSourceProvenance"],
  "operator dashboard mutations must stay limited to explicit operator maintenance jobs",
);
assert.match(
  operatorDashboard,
  /export const backfillHarnessAppSourceProvenance = mutation\([\s\S]*const operator = await requireOperatorWriteAccess\(ctx, args\.authSubject\)/,
  "operator dashboard maintenance mutations must require operator write access",
);
assert.match(
  operatorDashboard,
  /export const backfillHarnessAppSourceProvenance = mutation\([\s\S]*recordCriticalAuditEventBestEffort/,
  "operator dashboard maintenance mutations must write critical audit evidence",
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
assert.match(
  operatorGateway,
  /bootstrap\?\.dbUserId[\s\S]*operator_access_identity_mismatch/,
  "operator access must validate the returned operator role against the authenticated Convex user id",
);
assert.doesNotMatch(
  operatorGateway,
  /operatorIntelligence:/,
  "web gateway must not call internal operator intelligence directly",
);

assert.doesNotMatch(webRouteState, /segments\[0\] === "operator"/, "standalone operator route must stay deleted");
assert.doesNotMatch(webRouteState, /state\.page === "operator"/, "operator page serialization must stay deleted");
assert.doesNotMatch(
  appMainSurfaceHost,
  /WebOperatorDashboard|showOperatorDashboard|operatorDashboardProps/,
  "standalone operator dashboard surface must stay deleted",
);
assert.match(
  app,
  /operatorAccessState\?\.subject === canonicalSessionUserId \? operatorAccessState\.access : null[\s\S]*loadOperatorAccessCanonical\(\{ session \}\)[\s\S]*setOperatorAccessState\(\{ subject: operatorSubject, access \}\)/,
  "workspace must only enable operator UI after the gated operator access query succeeds for the current subject",
);
assert.match(
  app,
  /hasOperatorDataPanelAccess = Boolean\(session && operatorAccess\)/,
  "workspace operator panel must stay hidden without an operator access snapshot",
);
assert.doesNotMatch(
  app,
  /operatorAccess\?\.userId === canonicalSessionUserId|operatorAccess\?\.userId === sessionUserId/,
  "workspace must not compare Convex operator ids to WorkOS auth subjects",
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
