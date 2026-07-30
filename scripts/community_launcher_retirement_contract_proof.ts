import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function sourceFiles(path: string): string[] {
  const absolute = join(root, path);
  if (!existsSync(absolute)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) {
      out.push(...sourceFiles(child));
    } else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) {
      out.push(child);
    }
  }
  return out;
}

const packageJson = read("package.json");
const app = read("apps/web/src/App.tsx");
const pendingAuthIntent = read(
  "apps/web/src/controllers/useWebPendingAuthIntentController.ts",
);
const routeLifecycle = read("apps/web/src/controllers/useWebPathRouteLifecycle.ts");
const createModal = read("apps/web/src/components/WebCreateCommunityModal.tsx");
const webCreateController = read("apps/web/src/controllers/useWebCommunityUiController.ts");
const createController = read("shared/useCommunityCreateController.ts");
const settings = read("apps/web/src/components/WebCommunitySettingsSection.tsx");
const agent = read("apps/web/src/components/WebCommunityAiAgentSection.tsx");
const resources = read("apps/web/src/components/WebCommunityResourcesSection.tsx");
const funnel = read("apps/web/src/components/WebCommunityFunnelSection.tsx");
const protectedResources = read("convex/communityResources.ts");
const protectedGateway = read("shared/cloudCommunityAdminGateway.ts");
const productionCompatibilityFacade = read("convex/community.ts");
const retiredRuntimePaths = [
  "apps/web/src/components/WebCommunityLaunchSetupModal.tsx",
  "apps/web/src/components/webCommunityLaunchKnowledgeModel.ts",
  "apps/web/src/components/webCommunityLaunchSetupLifecycleModel.ts",
  "apps/web/src/controllers/useWebCommunityLaunchKnowledgeController.ts",
  "apps/web/src/controllers/useWebCommunityLaunchSetupLifecycleController.ts",
  "apps/web/src/communityLaunchSetupRoute.ts",
  "apps/web/src/communityLaunchKnowledgeSourceOAuth.ts",
  "shared/cloudCommunityLaunchSetupGateway.ts",
] as const;

assert.match(
  packageJson,
  /"check:community-launcher-retirement-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_launcher_retirement_contract_proof\.ts"/,
  "launcher retirement proof should remain wired into package scripts",
);
for (const path of retiredRuntimePaths) {
  assert.equal(existsSync(join(root, path)), false, `${path} must remain retired`);
}

assert.doesNotMatch(
  app + routeLifecycle,
  /WebCommunityLaunchSetupModal|useWebCommunityLaunch|communityLaunchSetupRoute|communityLaunchKnowledgeSourceOAuth|community_launch_setup|community_launch_step|source_integration_oauth/,
  "the web runtime must not retain launcher UI, orchestration, route, or callback state",
);
assert.doesNotMatch(
  sourceFiles("apps/web/src")
    .concat(sourceFiles("shared"))
    .filter((path) => path !== "shared/communityLaunchSetup.ts")
    .map(read)
    .join("\n"),
  /getCommunityLaunchSetupStatus|saveCommunityLaunchProfile|cloudCommunityLaunchSetupGateway/,
  "first-party web and shared client code must not call the rolling launcher compatibility RPCs",
);
assert.equal(
  existsSync(join(root, "convex/communityLaunchSetup.ts")),
  true,
  "the server-only launch status compatibility query must remain during the rolling transition",
);
assert.equal(
  existsSync(join(root, "shared/communityLaunchSetup.ts")),
  true,
  "the server-only launch status compatibility model must remain during the rolling transition",
);
assert.deepEqual(
  Array.from(
    productionCompatibilityFacade.matchAll(
      /export const ([A-Za-z0-9_]+)/g,
    ),
    (match) => match[1],
  ).sort(),
  ["getCommunityLaunchSetupStatus", "saveCommunityLaunchProfile"],
  "the retired community facade may return only as the two-address production compatibility bridge",
);
assert.doesNotMatch(
  productionCompatibilityFacade,
  /\b(?:query|mutation|action)\s*\(|\bctx\.|\bdb\./,
  "the production compatibility bridge must not restore facade-owned behavior",
);
assert.doesNotMatch(
  [read("apps/web/src/base.css"), read("apps/web/src/styles/shell-and-onboarding.css"), read("apps/web/src/styles/community-and-content.css"), read("apps/web/src/styles/settings-runtime-and-theme-overrides.css")].join("\n"),
  /\.community-launch-/,
  "launcher-only CSS must remain deleted",
);

assert.match(
  createModal,
  /Create community[\s\S]*identity and access basics[\s\S]*refine the funnel and AI agent after/,
  "community creation should remain a small identity and access form",
);
assert.match(
  webCreateController,
  /useCommunityCreateController[\s\S]*openCreateCommunityModal[\s\S]*modalHostProps/,
  "the web controller should keep one canonical creation controller and modal projection",
);
assert.match(
  createController,
  /resolveUsableSession[\s\S]*isAccountSetupComplete[\s\S]*max_communities[\s\S]*getCommunityPublishReadinessMissingFields[\s\S]*prepareCloudCommunityBrandingField[\s\S]*createCloudCommunity<[\s\S]*onCommunityCreated\(community\)/,
  "canonical creation must preserve session, account, quota, readiness, branding, mutation, and completion boundaries",
);
assert.match(
  app,
  /const communityUi = useWebCommunityUiController<[\s\S]*onCommunityCreated: \(community\) => \{[\s\S]*setCommunities[\s\S]*setCommunityRoleById[\s\S]*enterJoinedCommunity/,
  "App should project a created community into owner state and enter the canonical destination",
);
assert.match(
  pendingAuthIntent,
  /create_community: \(payload\) => \{[\s\S]*params\.openCreateCommunity\(payload\.draft\)/,
  "post-auth community creation should resume through the canonical create modal",
);
const createFlowBindings = app.match(/openCommunityCreateFlow: openCreateCommunityModal/g) ?? [];
assert.equal(
  createFlowBindings.length,
  2,
  "desktop and mobile creation CTAs should both bind to the canonical create modal",
);

assert.match(settings, /WebCommunitySettingsSection/, "community settings must remain available");
assert.match(agent, /Instructions/, "AI Agent instructions must remain available");
assert.match(resources, /WebCommunityResourcesSection/, "community resources must remain available");
assert.match(funnel, /WebCommunityFunnelEditor/, "community funnel configuration must remain available");

assert.match(
  protectedResources,
  /communityResourceSources|ingestCommunityResourceSources|createCommunityResourcePageDraftFromSource/,
  "protected resource and ingestion authority must remain intact",
);
assert.match(
  protectedGateway,
  /listCloudCommunityLaunchKnowledgeSources|ingestCloudCommunityLaunchKnowledgeSources|createCloudCommunityResourcePageDraftFromSource/,
  "protected cloud resource gateway functions must remain intact for canonical resource surfaces",
);

console.log("PASS: community launcher frontend is retired and creation converges on the canonical modal");
