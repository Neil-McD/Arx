import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "apps/web/src/components/WebBuilderKnowledgeSetup.tsx"),
  "utf8",
);
const appSource = readFileSync(
  resolve(process.cwd(), "apps/web/src/App.tsx"),
  "utf8",
);
const overlayHostSource = readFileSync(
  resolve(process.cwd(), "apps/web/src/components/WebGlobalOverlayHost.tsx"),
  "utf8",
);
const knowledgeControllerSource = readFileSync(
  resolve(
    process.cwd(),
    "apps/web/src/controllers/useWebBuilderKnowledgeSetupController.ts",
  ),
  "utf8",
);
const resourceBuildHandlerSource = readFileSync(
  resolve(
    process.cwd(),
    "apps/web/src/controllers/buildWebCommunityResourceBuildHandler.ts",
  ),
  "utf8",
);
const memberAgentDockSource = readFileSync(
  resolve(process.cwd(), "apps/web/src/components/WebMemberAgentDock.tsx"),
  "utf8",
);
test("Builder knowledge setup is a required, non-dismissible step", () => {
  expect(source).toContain("Community setup · 2 of 2");
  expect(source).toContain("Add your community knowledge.");
  expect(source).toContain("Skip for now");
  expect(source).toContain('className="builder-knowledge-setup-next"');
  expect(source).toContain("<WebBlockingSetupModal");
  expect(source).not.toContain('aria-label="Close');
  expect(source).not.toContain("<main");
  expect(source).not.toContain("Build my resources");
});

test("Skip completes setup while Next starts the canonical resource builder", () => {
  expect(source).toContain(
    "const canContinue = readySources.length > 0 && !hasPendingSources && !props.isHydrating;",
  );
  expect(source).toMatch(/className="builder-knowledge-setup-skip"[\s\S]*?onClick=\{\(\) => void complete\(\)\}/);
  expect(source).toMatch(/const buildResources = async \(\) =>[\s\S]*?props\.onBuildResources\([\s\S]*?readySources/);
  expect(source).toMatch(/className="builder-knowledge-setup-next"[\s\S]*?disabled=\{controlsDisabled \|\| !canContinue\}[\s\S]*?onClick=\{\(\) => void buildResources\(\)\}/);
  expect(source).toMatch(/RuntimeResourceChangesetApprovalCards[\s\S]*?onInitialResourcesApplied=\{\(\) => \{[\s\S]*?void complete\(\)/);
});

test("a source-loading failure cannot trap the buyer in onboarding", () => {
  expect(knowledgeControllerSource).toMatch(
    /loadCommunityResources\(pendingCommunity\.id, session\)[\s\S]*?\.catch\([\s\S]*?\.finally\(\(\) => \{[\s\S]*?setHydratedCommunityId\(pendingCommunity\.id\)/,
  );
});

test("the durable knowledge gate is projected through the canonical global overlay host", () => {
  const setupProjectionIndex = appSource.indexOf("builderKnowledgeSetupProps:");
  const routeHoldIndex = appSource.indexOf("if (shouldHoldRouteForAccess)");
  const workspaceIndex = appSource.lastIndexOf("<WebAppCompositionRoot");
  expect(setupProjectionIndex).toBeLessThan(routeHoldIndex);
  expect(workspaceIndex).toBeGreaterThan(routeHoldIndex);
  expect(overlayHostSource).toContain("props.builderKnowledgeSetupProps");
  expect(overlayHostSource).toContain("<WebBuilderKnowledgeSetup");
  expect(appSource).not.toContain("<WebBuilderKnowledgeSetup");
  expect(appSource).toContain("onBuildResources: handleBuildCommunityResources");
  expect(appSource).not.toMatch(/if \(pendingBuilderKnowledgeCommunity\) \{[\s\S]*?return \(\s*<WebBuilderKnowledgeSetup/);
});

test("onboarding recovers durable staged changesets without a second builder", () => {
  expect(knowledgeControllerSource).toContain(
    "listCloudPendingCommunityResourceBuilderChangesets",
  );
  expect(knowledgeControllerSource).toContain(
    "buildResourceChangesetCardFromPayload",
  );
  expect(knowledgeControllerSource).toMatch(/window\.setInterval\([\s\S]*?readPendingChangeset/);
});

test("the initial builder turn is safe to queue while its community thread prepares", () => {
  expect(resourceBuildHandlerSource).toContain(
    "put the ready source id directly in create_page.source_resource_id",
  );
  expect(resourceBuildHandlerSource).toContain(
    "Do not use edit, move, delete, or link_source_to_page operations",
  );
  expect(memberAgentDockSource).not.toContain("resourceBuildLaunchBusyRef");
  expect(memberAgentDockSource).toMatch(
    /pendingResourceBuildRef\.current = \{[\s\S]*?setResourceBuildLaunchVersion/,
  );
  expect(memberAgentDockSource).toMatch(
    /const request = pendingResourceBuildRef\.current;[\s\S]*?isPreparing[\s\S]*?composerFormRef\.current\?\.requestSubmit/,
  );
});
