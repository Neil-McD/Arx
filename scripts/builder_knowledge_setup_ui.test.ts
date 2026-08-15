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
const overlayHostSource = readFileSync(
  resolve(process.cwd(), "apps/web/src/components/WebGlobalOverlayHost.tsx"),
  "utf8",
);
const stylesSource = readFileSync(
  resolve(process.cwd(), "apps/web/src/styles/community-and-content.css"),
  "utf8",
);
const knowledgeCardRule = stylesSource.match(
  /\.builder-knowledge-setup-card\s*\{(?<body>[^}]*)\}/,
)?.groups?.body ?? "";

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

test("Builder knowledge setup renders one modal surface without a legacy page shell", () => {
  expect(source).toContain('className="builder-knowledge-setup-modal"');
  expect(stylesSource).not.toMatch(/\.builder-knowledge-setup\s*\{[\s\S]*?min-height:\s*100(?:s)?vh/);
  expect(knowledgeCardRule).toContain("width: 100%");
  expect(knowledgeCardRule).toContain("display: grid");
  expect(knowledgeCardRule).not.toMatch(/(?:background|border|border-radius):/);
});

test("Skip and ready-source continuation share the canonical completion command", () => {
  expect(source).toContain(
    "const canContinue = readySources.length > 0 && !hasPendingSources && !props.isHydrating;",
  );
  expect(source).toMatch(/className="builder-knowledge-setup-skip"[\s\S]*?onClick=\{\(\) => void complete\("skip"\)\}/);
  expect(source).toMatch(/className="builder-knowledge-setup-next"[\s\S]*?disabled=\{controlsDisabled \|\| !canContinue\}[\s\S]*?onClick=\{\(\) => void complete\("build"\)\}/);
  expect(knowledgeControllerSource).toMatch(
    /mode === "build"[\s\S]*buildCloudBuilderKnowledgeResources[\s\S]*completeCloudBuilderKnowledgeSetup/,
  );
  expect(knowledgeControllerSource).toMatch(
    /if \(!result\.ok\)[\s\S]*throw new Error\([\s\S]*result\.message/,
  );
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
  expect(appSource).not.toContain("onBuildResources: handleBuildCommunityResources");
  expect(appSource).not.toMatch(/if \(pendingBuilderKnowledgeCommunity\) \{[\s\S]*?return \(\s*<WebBuilderKnowledgeSetup/);
});
