import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const shell = read("apps/web/src/components/WebBlockingSetupModal.tsx");
const create = read("apps/web/src/components/WebCreateCommunityModal.tsx");
const account = read("apps/web/src/components/WebPlatformBridgePage.tsx");
const profile = read("apps/web/src/components/WebOnboardingPage.tsx");
const knowledge = read("apps/web/src/components/WebBuilderKnowledgeSetup.tsx");
const mainSurface = read("apps/web/src/components/WebAppMainSurfaceHost.tsx");
const shellProjection = read(
  "apps/web/src/controllers/buildWebShellProjection.ts",
);

test("required setup surfaces share one accessible blocking shell", () => {
  for (const surface of [create, account, profile, knowledge]) {
    expect(surface).toContain("<WebBlockingSetupModal");
  }
  expect(shell).toContain('role="dialog"');
  expect(shell).toContain('aria-modal="true"');
  expect(shell).toContain('document.body.style.overflow = "hidden"');
  expect(shell).toContain("appRoot.inert = true");
  expect(shell).toContain('event.key !== "Tab"');
  expect(shell).toContain('event.key === "Escape"');
});

test("account setup and knowledge setup keep the live product behind the blocker", () => {
  expect(mainSurface).toMatch(
    /activePage === "onboarding"[\s\S]*<WebDiscoverPanel[\s\S]*<WebPlatformBridgePage/,
  );
  expect(shellProjection).toContain('params.activePage === "onboarding"');
  expect(shellProjection).toContain("const isPublicAppPage = isLandingPage;");
  expect(account).not.toContain("polynet-platform-bridge-page");
  expect(account).not.toContain("landing-auth-hold");
  expect(knowledge).not.toContain("<main");
});

test("only an explicitly dismissible setup can close from backdrop or Escape", () => {
  expect(shell).toMatch(/!props\.dismissible[\s\S]*\|\|[\s\S]*props\.busy/);
  expect(shell).toMatch(/!dismissibleRef\.current \|\| busyRef\.current/);
  expect(create).toContain("dismissible={props.isDismissible}");
  expect(knowledge).not.toMatch(/dismissible=/);
  expect(account).not.toMatch(/dismissible=/);
});
