import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "vitest";

import { monthlyCentsFromText, startExtrasNeedSaving } from "../apps/web/src/v1/startCommunityExtras";

// Starting a community ends on a launch step (the invite link, and the way
// in), shown for a community that was created and not opened yet. It replaced
// the knowledge step (Nov 16); the same rules hold: one blocking surface from
// the global overlay host, and one inference-free completion.
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const step = read("apps/web/src/components/WebCommunityLaunchStep.tsx");
const controller = read("apps/web/src/controllers/useWebCommunityLaunchController.ts");
const appSource = read("apps/web/src/App.tsx");
const overlayHostSource = read("apps/web/src/components/WebGlobalOverlayHost.tsx");

test("the launch step is a required, non-dismissible step in the shared blocking modal", () => {
  expect(step).toContain("<WebBlockingSetupModal");
  expect(step).not.toMatch(/dismissible=/);
  expect(step).not.toContain("<main");
  expect(step).toContain("<KitStartLaunch");
});

test("the knowledge step and its intake stay deleted", () => {
  for (const gone of ["apps/web/src/components/WebBuilderKnowledgeSetup.tsx", "apps/web/src/components/WebCommunityKnowledgeSourceIntake.tsx"]) {
    expect(existsSync(resolve(process.cwd(), gone))).toBe(false);
  }
  expect(read("apps/web/src/styles/community-and-content.css")).not.toMatch(/builder-knowledge-setup|knowledge-source-intake/);
});

test("opening the community is the one completion, with no resource build", () => {
  expect(controller).toContain("completeCloudBuilderKnowledgeSetup({");
  expect(controller).not.toContain("buildCloudBuilderKnowledgeResources");
  expect(controller).toMatch(/if \(!result\.ok\) throw new Error\(/);
  // The community opens where the step says: Home in design v1.
  expect(controller).toMatch(/params\.enterCommunity\(\{[\s\S]*?communityTab: params\.tab,/);
  expect(appSource).toContain('const launchTab = isDesignV1Active() ? "agent" as const : "chat" as const;');
});

test("a failure to save step 2's answers cannot trap the founder in setup", () => {
  // Open community stays available: only saving or opening disables it.
  expect(step).toMatch(/catch \{\s*if \(!cancelled\) setError\("What you wrote on the last step couldn't be saved\. You can add it in Settings\."\);/);
  expect(step).toMatch(/finally \{\s*if \(!cancelled\) setSaving\(false\);/);
  // A price with no payouts connected saves everything else, free for now.
  expect(step).toMatch(/isPayoutsError\([\s\S]*?payoutsMissing = true;\s*saved = await save\(null\);/);
});

test("the launch step is projected through the canonical global overlay host", () => {
  const projectionIndex = appSource.indexOf("communityLaunchProps:");
  const routeHoldIndex = appSource.indexOf("if (shouldHoldRouteForAccess)");
  const workspaceIndex = appSource.lastIndexOf("<WebAppCompositionRoot");
  expect(projectionIndex).toBeGreaterThan(0);
  expect(projectionIndex).toBeLessThan(routeHoldIndex);
  expect(workspaceIndex).toBeGreaterThan(routeHoldIndex);
  expect(overlayHostSource).toContain("props.communityLaunchProps");
  expect(overlayHostSource).toContain("<WebCommunityLaunchStep");
  expect(appSource).not.toContain("<WebCommunityLaunchStep");
});

test("a price is dollars a month; anything else is not a price", () => {
  expect(monthlyCentsFromText("29")).toBe(2900);
  expect(monthlyCentsFromText("$29.50")).toBe(2950);
  expect(monthlyCentsFromText(" 9.9 ")).toBe(990);
  for (const bad of ["", "0", "free", "29.999", "-5", "1e3"]) expect(monthlyCentsFromText(bad)).toBeNull();
});

test("step 2's answers are saved only when there is something to save", () => {
  expect(startExtrasNeedSaving(null)).toBe(false);
  expect(startExtrasNeedSaving({ about: "", listed: false, monthlyCents: null })).toBe(false);
  expect(startExtrasNeedSaving({ about: "Weekly calls.", listed: false, monthlyCents: null })).toBe(true);
  expect(startExtrasNeedSaving({ about: "", listed: true, monthlyCents: null })).toBe(true);
  expect(startExtrasNeedSaving({ about: "", listed: false, monthlyCents: 2900 })).toBe(true);
});
