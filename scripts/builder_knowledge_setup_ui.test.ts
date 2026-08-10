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
const knowledgeControllerSource = readFileSync(
  resolve(
    process.cwd(),
    "apps/web/src/controllers/useWebBuilderKnowledgeSetupController.ts",
  ),
  "utf8",
);
const styleSource = readFileSync(
  resolve(process.cwd(), "apps/web/src/styles/community-and-content.css"),
  "utf8",
);

test("Builder knowledge setup is a required, non-dismissible step", () => {
  expect(source).toContain("Community setup · 2 of 2");
  expect(source).toContain("Add your community knowledge.");
  expect(source).toContain("Skip for now");
  expect(source).toContain('className="builder-knowledge-setup-next"');
  expect(source).not.toContain('aria-label="Close');
  expect(source).not.toContain("Build my resources");
  expect(source).toContain('aria-modal="true"');
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

test("the durable knowledge gate overlays the mounted canonical application", () => {
  const appRootIndex = appSource.indexOf("<WebAppCompositionRoot");
  const gateIndex = appSource.lastIndexOf("<WebBuilderKnowledgeSetup");
  const finalHookIndex = appSource.indexOf("useWebMemberAgentSurfaceController({");
  expect(appRootIndex).toBeGreaterThan(finalHookIndex);
  expect(gateIndex).toBeGreaterThan(finalHookIndex);
  expect(gateIndex).toBeGreaterThan(appRootIndex);
  expect(appSource).not.toContain("if (pendingBuilderKnowledgeCommunity) {");
  expect(appSource).toContain("onBuildResources={handleBuildCommunityResources}");
  expect(styleSource).toMatch(/\.builder-knowledge-setup \{[\s\S]*?position: fixed;[\s\S]*?backdrop-filter: blur/);
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
