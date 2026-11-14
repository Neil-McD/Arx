import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readAppRouteFromLocation } from "../shared/webAppRouteState.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function readExportBlock(source: string, exportName: string): string {
  const marker = `export const ${exportName} = `;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${exportName} export must exist`);
  const nextExport = source.indexOf("\nexport const ", start + marker.length);
  return nextExport === -1 ? source.slice(start) : source.slice(start, nextExport);
}

const operatorDashboard = read("convex/operatorDashboard.ts");
const operatorAccess = read("convex/operatorAccess.ts");
const schema = read("convex/schema.ts");
const app = read("apps/web/src/App.tsx");
const routeAccessBoundary = read(
  "apps/web/src/controllers/useWebRouteAccessBoundaryController.ts",
);
const communityAnalytics = read("apps/web/src/components/CommunityAnalyticsPanel.tsx");
const settingsNav = read("shared/SettingsNavList.tsx");
const webDesktopShellHeader = read("apps/web/src/components/WebDesktopShellHeader.tsx");
const baseCss = [read("apps/web/src/base.css"), read("apps/web/src/styles/shell-and-onboarding.css"), read("apps/web/src/styles/community-and-content.css"), read("apps/web/src/styles/settings-runtime-and-theme-overrides.css")].join("\n");
const packageJson = read("package.json");
const seedScript = read("scripts/seed_operator_owner.ts");

const originalWindow = globalThis.window;
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { location: { pathname: "/operator/email", search: "" } },
});
// The operator console was removed (Neil, Nov 13): /operator opens nothing.
assert.equal(readAppRouteFromLocation().page, "landing");
if (originalWindow === undefined) {
  Reflect.deleteProperty(globalThis, "window");
} else {
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
}

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
  /getMyOperatorAccessOptional = query[\s\S]*readOperatorAccess\(ctx, args\.authSubject, "readonly"\)[\s\S]*return null/,
  "operator UI gating should use a non-throwing current-user access probe",
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

assert.match(
  operatorDashboard,
  /export const getOperatorAccess = query\([\s\S]*try \{[\s\S]*await requireOperatorAccess\(ctx, args\.authSubject\)[\s\S]*catch \(error\)[\s\S]*isExpectedOperatorAccessProbeMiss\(error\)[\s\S]*return null/,
  "legacy operator access probe must return null for expected non-operator/auth misses",
);
assert.match(
  operatorDashboard,
  /isExpectedOperatorAccessProbeMiss[\s\S]*operator_access_forbidden[\s\S]*auth[\s\S]*identity/,
  "legacy operator access probe must only quiet expected access/auth misses",
);
for (const queryName of operatorQueryNames.filter((queryName) => queryName !== "getOperatorAccess")) {
  assert.match(
    operatorDashboard,
    new RegExp(`export const ${queryName} = query\\([\\s\\S]*?await requireOperatorAccess\\(ctx, args\\.authSubject\\)`),
    `${queryName} must route through requireOperatorAccess`,
  );
}

assert.doesNotMatch(operatorDashboard, /export const \w+ = action/, "operator dashboard must not expose public actions");
const operatorMaintenanceMutationNames: string[] = [];
assert.deepEqual(
  [...operatorDashboard.matchAll(/export const (\w+) = mutation/g)].map((match) => match[1]),
  operatorMaintenanceMutationNames,
  "operator dashboard mutations must stay limited to explicit operator maintenance jobs",
);
for (const mutationName of operatorMaintenanceMutationNames) {
  const mutationBlock = readExportBlock(operatorDashboard, mutationName);
  assert.match(
    mutationBlock,
    /const operator = await requireOperatorWriteAccess\(ctx, args\.authSubject\)/,
    `${mutationName} must require operator write access`,
  );
  assert.match(
    mutationBlock,
    /recordCriticalAuditEventBestEffort/,
    `${mutationName} must write critical audit evidence`,
  );
  assert.match(
    mutationBlock,
    /status: "failed"/,
    `${mutationName} must audit failed maintenance runs`,
  );
}

assert.match(
  routeAccessBoundary,
  /projection\.kind === "redirect_member_entry"[\s\S]*resolveAndEnterMemberDestination/,
  "unauthorized operator routes must wait for access resolution and then fail closed to a member destination",
);
// Neil, Nov 13: no operator view in a community's Analytics; it has its time ranges only.
assert.doesNotMatch(
  communityAnalytics,
  /WebAnalyticsScopeSwitcher|canViewPlatformAnalytics|openPlatformAnalytics/,
  "community analytics must not offer a Platform (operator) view",
);
assert.doesNotMatch(
  settingsNav,
  /showOperatorConsole|onOpenOperatorConsole|Platform Analytics/,
  "operator navigation must not be coupled to global settings",
);
assert.doesNotMatch(
  app,
  /resolveWorkspaceRightPanelShellState|operatorRightPanelSession:|workspaceRightPanelToggle =/,
  "App must not mount the retired Workspace operator presentation",
);
assert.doesNotMatch(
  webDesktopShellHeader,
  /workspaceRightPanelToggle|hasWorkspaceRightPanelControl/,
  "desktop shell must not expose Workspace operator chrome",
);
assert.doesNotMatch(
  webDesktopShellHeader,
  /communityHomeButton/,
  "desktop header must not retain the redundant community home control",
);
assert.doesNotMatch(
  app,
  /workspaceUserDataToggle|workspaceOperatorDataToggle/,
  "workspace header must not render separate user and operator data toggles",
);
assert.doesNotMatch(
  baseCss,
  /\.workspace-right-panel|\.workspace-user-data-panel|\.workspace-files-/,
  "base CSS must not retain the retired Workspace right-panel or files presentation",
);

console.log("operator_dashboard_gate_proof: ok");
