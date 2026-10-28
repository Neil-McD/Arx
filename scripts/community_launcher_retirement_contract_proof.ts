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
const purchaseModal = read("apps/web/src/components/WebBuilderPurchaseModal.tsx");
const webCreateController = read("apps/web/src/controllers/useWebCommunityUiController.ts");
const createController = read("shared/useCommunityCreateController.ts");
const settings = read("apps/web/src/components/WebCommunitySettingsSection.tsx");
const agent = read("apps/web/src/components/WebCommunityAiAgentSection.tsx");
const resources = read("apps/web/src/components/CommunityResourcesPanel.tsx");
const protectedResources = read("convex/communityResources.ts");
const protectedGateway = read("shared/cloudCommunityAdminGateway.ts");
const retiredRuntimePaths = [
  "convex/communityLaunchSetup.ts",
  "shared/communityLaunchSetup.ts",
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
    .map(read)
    .join("\n"),
  /getCommunityLaunchSetupStatus|saveCommunityLaunchProfile|cloudCommunityLaunchSetupGateway/,
  "first-party web and shared client code must not call the retired launcher RPCs",
);
assert.equal(
  existsSync(join(root, "convex/community.ts")),
  false,
  "the retired community alias facade must stay deleted",
);
assert.doesNotMatch(
  [read("apps/web/src/base.css"), read("apps/web/src/styles/shell-and-onboarding.css"), read("apps/web/src/styles/community-and-content.css"), read("apps/web/src/styles/settings-runtime-and-theme-overrides.css")].join("\n"),
  /\.community-launch-/,
  "launcher-only CSS must remain deleted",
);

assert.match(
  createModal,
  /Your payment is confirmed[\s\S]*Community name[\s\S]*Community handle[\s\S]*Create community/,
  "community creation should remain one post-payment identity form",
);
assert.match(
  createModal,
  /props\.isDismissible \? \([\s\S]*Close community setup/,
  "required paid setup must not expose the optional creation close action",
);
assert.doesNotMatch(
  createModal,
  /WebBuilderOfferSummary|Buy Builder/,
  "post-payment setup must not repeat the purchase offer",
);
assert.match(
  purchaseModal,
  /WebBuilderOfferSummary compact purpose="purchase"/,
  "the pre-payment offer must remain a separate compact surface",
);
assert.match(purchaseModal, /Buy Builder/);
assert.match(
  webCreateController,
  /useCommunityCreateController[\s\S]*openCreateCommunityModal[\s\S]*modalHostProps/,
  "the web controller should keep one canonical creation controller and modal projection",
);
assert.match(
  createController,
  /resolveUsableSession[\s\S]*isAccountSetupComplete[\s\S]*prepareCloudCommunityBrandingField[\s\S]*createCloudCommunity<[\s\S]*visibility: "unlisted"[\s\S]*avatarStorageId: avatarField\.storageId[\s\S]*oneLiner: current\.createCommunityOneLiner[\s\S]*founderSubscriptionId[\s\S]*await current\.onCommunityCreated\(community, \{ founderSubscriptionId \}\)/,
  "canonical creation must preserve session, account, branding, attached subscription, mutation, and completion boundaries",
);
assert.match(
  createController,
  /createInFlightRef\.current[\s\S]*founder_subscription_already_attached[\s\S]*onCommunityCreateRecoveryRequired/,
  "community creation must suppress duplicate submission and recover an already-attached subscription",
);
assert.match(
  app,
  /const communityUi = useWebCommunityUiController<[\s\S]*onCommunityCreated: \(community, context\) => \{[\s\S]*suppressBuilderSetupSubscription\([\s\S]*context\.founderSubscriptionId[\s\S]*"attached"[\s\S]*setCommunities[\s\S]*founderBilling\.refresh[\s\S]*enterJoinedCommunity\(\{[\s\S]*communityTab: "resources"/,
  "App should project a created community into the directory and enter canonical Resources onboarding",
);
assert.match(
  pendingAuthIntent,
  /create_community: \(payload\) => \{[\s\S]*params\.openCreateCommunity\(payload\.draft\)/,
  "post-auth community creation should resume through the canonical purchase entry",
);
const createFlowBindings = app.match(/openCommunityCreateFlow: openNewCommunityPurchaseFlow/g) ?? [];
assert.equal(
  createFlowBindings.length,
  2,
  "desktop and mobile creation CTAs should both bind to the canonical purchase entry",
);

assert.match(settings, /WebCommunitySettingsSection/, "community settings must remain available");
assert.match(agent, /Community Agent/, "Community Agent instructions must remain available");
assert.match(resources, /CommunityResourcesPanel/, "community resources must remain available");

assert.match(
  protectedResources,
  /listCommunityLaunchKnowledgeSources[\s\S]*ingestCommunitySources/,
  "protected resource and ingestion authority must remain intact",
);
assert.match(
  protectedGateway,
  /listCloudCommunityLaunchKnowledgeSources[\s\S]*ingestCloudCommunitySources/,
  "protected cloud resource gateway functions must remain intact for canonical resource surfaces",
);
assert.doesNotMatch(
  protectedGateway,
  /createCloudCommunityResourcePageDraftFromSource/,
  "the retired one-source page copier must not remain callable from first-party cloud surfaces",
);
assert.doesNotMatch(
  protectedResources,
  /createCommunityResourcePageDraftFromSource|community_resource_page_draft_from_source_retired/,
  "the retired one-source copier address must stay deleted",
);

console.log("PASS: community launcher frontend is retired and creation converges on the canonical modal");
