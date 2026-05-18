import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
const operatorGateway = read("shared/cloudOperatorDashboardGateway.ts");
const schema = read("convex/schema.ts");
const webRouteState = read("shared/webAppRouteState.ts");
const app = read("apps/web/src/App.tsx");
const appMainSurfaceHost = read("apps/web/src/components/WebAppMainSurfaceHost.tsx");
const webDesktopShellHeader = read("apps/web/src/components/WebDesktopShellHeader.tsx");
const workspaceHost = read("apps/web/src/components/WebWorkspaceHost.tsx");
const workspaceRightPanelController = read("apps/web/src/components/useWorkspaceRightPanelController.ts");
const baseCss = read("apps/web/src/base.css");
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
  "getOperatorToolEconomics",
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
const operatorMaintenanceMutationNames = [
  "backfillHarnessAppSourceProvenance",
  "backfillCommunityMembershipActiveFlags",
];
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
  /hasOperatorRightPanelAccess = Boolean\(session && operatorAccess\)/,
  "workspace operator panel must stay hidden without an operator access snapshot",
);
assert.doesNotMatch(
  app,
  /operatorAccess\?\.userId === canonicalSessionUserId|operatorAccess\?\.userId === sessionUserId/,
  "workspace must not compare Convex operator ids to WorkOS auth subjects",
);
assert.match(
  workspaceHost,
  /showOperatorTabs = Boolean\(props\.operatorRightPanelSession\)/,
  "workspace host must derive operator tabs only from an authenticated operator data-panel session",
);
assert.match(
  workspaceHost,
  /isOperatorRightPanelTabActive = isOperatorInsightTab\(activeRightPanelTab\)/,
  "workspace host must know whether the active right-panel tab is an operator insight tab",
);
assert.match(
  workspaceHost,
  /useOperatorDashboardData\([\s\S]*enabled: isWorkspaceRightPanelVisible && showOperatorTabs && isOperatorRightPanelTabActive/,
  "operator data loading must be disabled unless the right panel is visible, operator tabs are authorized, and an operator tab is active",
);
assert.match(
  workspaceRightPanelController,
  /showControl = Boolean\([\s\S]*params\.hasSession[\s\S]*params\.isWorkspaceHome[\s\S]*!params\.isMobileAppShell/,
  "workspace right-panel control resolver must remain signed-in desktop workspace-home scoped",
);
assert.match(
  workspaceRightPanelController,
  /showOperatorTabs: Boolean\(showControl && params\.hasOperatorRightPanelAccess\)/,
  "operator-only tabs must remain gated by the operator access snapshot",
);
assert.match(
  app,
  /resolveWorkspaceRightPanelShellState\(\{[\s\S]*hasSession: Boolean\(session\)[\s\S]*isWorkspaceHome: activePage === "workspace" && activeView === "home"[\s\S]*isMobileAppShell: showMobileAppShell[\s\S]*hasOperatorRightPanelAccess[\s\S]*isOpen: isWorkspaceRightPanelOpen/,
  "App must resolve workspace right-panel shell state from session, route, mobile shell, operator access, and open preference",
);
assert.match(
  app,
  /operatorRightPanelSession: showWorkspaceRightPanelOperatorTabs \? session : null/,
  "workspace host must receive an operator data session only after operator access is confirmed",
);
assert.match(
  app,
  /workspaceRightPanelToggle = showWorkspaceRightPanelControl \? \([\s\S]*workspace-right-panel-toggle/,
  "workspace right-panel toggle should be built only from the signed-in workspace control flag",
);
assert.match(
  app,
  /workspaceRightPanelToggle,[\s\S]*communityHomeButton,/,
  "desktop shell props must receive the unified workspace right-panel toggle next to the community button",
);
assert.match(
  webDesktopShellHeader,
  /props\.workspaceRightPanelToggle[\s\S]*props\.communityHomeButton/,
  "desktop header must render one unified workspace right-panel toggle before the community button",
);
assert.doesNotMatch(
  app,
  /workspaceUserDataToggle|workspaceOperatorDataToggle/,
  "workspace header must not render separate user and operator data toggles",
);
assert.doesNotMatch(
  workspaceHost,
  /workspace-right-panel-toggle/,
  "workspace host must not position its own top-right operator toggle outside the shared header",
);
assert.doesNotMatch(
  baseCss,
  /\.workspace-right-panel-toggle\s*\{[^}]*position:\s*(fixed|absolute)/,
  "workspace operator toggle must be laid out by the shared header, not fixed-position CSS",
);

console.log("operator_dashboard_gate_proof: ok");
