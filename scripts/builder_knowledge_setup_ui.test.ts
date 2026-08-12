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

test("Builder knowledge setup is a required, non-dismissible step", () => {
  expect(source).toContain("Community setup · 2 of 2");
  expect(source).toContain("Add your community knowledge.");
  expect(source).toContain("Skip for now");
  expect(source).toContain('className="builder-knowledge-setup-next"');
  expect(source).not.toContain('aria-label="Close');
  expect(source).not.toContain("Build my resources");
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
});

test("a source-loading failure cannot trap the buyer in onboarding", () => {
  expect(knowledgeControllerSource).toMatch(
    /loadCommunityResources\(pendingCommunity\.id, session\)[\s\S]*?\.catch\([\s\S]*?\.finally\(\(\) => \{[\s\S]*?setHydratedCommunityId\(pendingCommunity\.id\)/,
  );
});

test("the durable knowledge gate runs only after every app hook", () => {
  const gateIndex = appSource.indexOf("if (pendingBuilderKnowledgeCommunity)");
  const finalHookIndex = appSource.indexOf("useWebMemberAgentSurfaceController({");
  const routeHoldIndex = appSource.indexOf("if (shouldHoldRouteForAccess)");
  expect(gateIndex).toBeGreaterThan(finalHookIndex);
  expect(gateIndex).toBeLessThan(routeHoldIndex);
});
