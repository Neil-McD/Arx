import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAppRoutePath, readAppRouteFromLocation } from "../shared/webAppRouteState.ts";
import { buildWebShellProjection } from "../apps/web/src/controllers/buildWebShellProjection.ts";

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
const operatorHost = read("apps/web/src/components/WebOperatorDashboardHost.tsx");
const analyticsScopeSwitcher = read("apps/web/src/components/WebAnalyticsScopeSwitcher.tsx");
const communityAnalytics = read("apps/web/src/components/CommunityAnalyticsPanel.tsx");
const settingsNav = read("shared/SettingsNavList.tsx");
const shellProjection = read("apps/web/src/controllers/buildWebShellProjection.ts");
const webDesktopShellHeader = read("apps/web/src/components/WebDesktopShellHeader.tsx");
const baseCss = read("apps/web/src/base.css");
const packageJson = read("package.json");
const seedScript = read("scripts/seed_operator_owner.ts");

const originalWindow = globalThis.window;
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { location: { pathname: "/operator/email", search: "" } },
});
assert.equal(readAppRouteFromLocation().page, "operator");
assert.equal(readAppRouteFromLocation().operatorTab, "email");
assert.equal(
  buildAppRoutePath({
    page: "operator",
    view: "home",
    settingsPage: "agent",
    communitySlug: null,
    communityTab: "chat",
    operatorTab: "communities",
    threadId: null,
  }),
  "/operator/communities",
);
if (originalWindow === undefined) {
  Reflect.deleteProperty(globalThis, "window");
} else {
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
}

const operatorProjection = buildWebShellProjection({
  publicRouteKind: "app",
  shellVariant: "standard",
  activePage: "operator",
  activeView: "home",
  mobileSettingsView: "detail",
  userWantsSessions: false,
  hasSelectedCommunity: true,
  isPublicCommunityFunnel: false,
});
assert.equal(operatorProjection.showDesktopCommunityRail, false);
assert.equal(operatorProjection.showDesktopCommunityNav, false);
assert.equal(operatorProjection.hasLeftPanel, false);

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
  "getOperatorToolEconomics",
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
  /operatorAccess:getMyOperatorAccessOptional/,
  "operator gateway must use the non-throwing operator access probe for UI gating",
);
assert.doesNotMatch(
  operatorGateway,
  /operatorDashboard:getOperatorAccess|loadOperatorAccessCanonical/,
  "browser gateway must not call the noisy legacy operator dashboard access probe",
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

assert.match(
  webRouteState,
  /segments\[0\] === "operator"[\s\S]*page: "operator"[\s\S]*operatorTab: parseOperatorTab/,
  "operator routes must parse into one canonical operator page with a bounded tab",
);
assert.match(
  webRouteState,
  /state\.page === "operator"[\s\S]*`\/operator\/\$\{state\.operatorTab \?\? "platform"\}`/,
  "operator routes must serialize to a canonical tab path",
);
assert.match(
  app,
  /isOperatorAccessResolved =[\s\S]*operatorAccessState\?\.subject === canonicalSessionUserId[\s\S]*operatorAccess = isOperatorAccessResolved/,
  "operator rendering must distinguish unresolved access from a resolved denial for the current auth subject",
);
assert.match(
  app,
  /if \(!access\) \{[\s\S]*setOperatorAccessState\(\{ subject: operatorSubject, access: null \}\)/,
  "the optional access probe must record a resolved denial instead of leaving the route pending",
);
assert.match(
  app,
  /activePage !== "operator"[\s\S]*!isOperatorAccessResolved[\s\S]*if \(operatorAccess\) return;[\s\S]*resolveAndEnterMemberDestination/,
  "unauthorized operator routes must wait for access resolution and then fail closed to a member destination",
);
assert.match(
  appMainSurfaceHost,
  /activePage === "operator"[\s\S]*showOperatorDashboard && props\.operatorDashboardProps[\s\S]*landing-auth-hold/,
  "the operator surface must render only with authorized props and otherwise show a neutral hold",
);
assert.match(
  operatorHost,
  /useOperatorDashboardData\(\{[\s\S]*enabled: true[\s\S]*surface: "operator_console"/,
  "operator data must load only after the authorized operator host mounts and must record the canonical surface",
);
assert.match(
  analyticsScopeSwitcher,
  /if \(!props\.showPlatformScope\) return null/,
  "platform scope must stay hidden until operator access resolves",
);
assert.match(
  analyticsScopeSwitcher,
  /Analytics scope[\s\S]*Community[\s\S]*Platform/,
  "analytics must expose one shared Community and Platform scope control",
);
assert.match(
  operatorHost,
  /Platform analytics[\s\S]*operator-console-title">Analytics[\s\S]*activeScope="platform"[\s\S]*onOpenCommunityScope/,
  "the operator route must present the Platform scope of Analytics and preserve a community return path",
);
assert.match(
  communityAnalytics,
  /activeScope="community"[\s\S]*showPlatformScope=\{capabilities\.canViewPlatformAnalytics\}[\s\S]*actions\.openPlatformAnalytics/,
  "community analytics must expose Platform only through the resolved operator capability",
);
assert.match(
  operatorHost,
  /OPERATOR_TABS\.map[\s\S]*OperatorPlatformPanelView[\s\S]*OperatorBusinessPanelView[\s\S]*OperatorEmailPanelView[\s\S]*OperatorCommunitiesPanelView/,
  "the operator console must expose the four bounded diagnostic views",
);
assert.doesNotMatch(
  operatorHost,
  /WebWorkspaceRightPanel|workspace-right-panel/,
  "the operator console must not depend on retired Workspace panel presentation",
);
assert.match(
  settingsNav,
  /showOperatorConsole && onOpenOperatorConsole[\s\S]*Platform Analytics/,
  "global settings navigation must expose Platform Analytics only after operator access is granted",
);
assert.match(
  shellProjection,
  /isOperatorPage[\s\S]*!isOperatorPage && !showMobileAppShell/,
  "the desktop operator console must remain full width without the community rail",
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
  /\.workspace-right-panel-toggle\s*\{[^}]*position:\s*(fixed|absolute)/,
  "workspace operator toggle must be laid out by the shared header, not fixed-position CSS",
);

console.log("operator_dashboard_gate_proof: ok");
