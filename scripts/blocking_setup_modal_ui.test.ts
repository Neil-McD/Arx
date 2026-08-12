import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const shell = read("apps/web/src/components/WebBlockingSetupModal.tsx");
const shellStyles = read("apps/web/src/styles/shell-and-onboarding.css");
const create = read("apps/web/src/components/WebCreateCommunityModal.tsx");
const account = read("apps/web/src/components/WebPlatformBridgePage.tsx");
const profile = read("apps/web/src/components/WebOnboardingPage.tsx");
const accountForm = read("apps/web/src/components/WebAccountSetupForm.tsx");
const communityBridge = read("apps/web/src/components/WebCommunityBridgeCard.tsx");
const communityFunnel = read("apps/web/src/components/WebCommunityFunnelRenderer.tsx");
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

test("all account entry contexts share one field renderer", () => {
  expect(profile).toContain("<WebAccountSetupForm");
  expect(communityBridge).toContain("<WebAccountSetupForm");
  expect(accountForm).toContain("Display name");
  expect(accountForm).toContain("Terms of Service");
  expect(accountForm).not.toContain("<span>Bio</span>");
  expect(profile).not.toContain("Terms of Service");
  expect(communityBridge).not.toContain("Terms of Service");
  expect(communityFunnel).toContain("<WebBlockingSetupModal");
  expect(communityFunnel).not.toContain("community-funnel-bridge");
});

test("account setup and knowledge setup keep the live product behind the blocker", () => {
  expect(mainSurface).toMatch(
    /activePage === "onboarding"[\s\S]*<WebDiscoverPanel[\s\S]*<WebPlatformBridgePage/,
  );
  expect(shellProjection).toContain('params.destination.kind === "onboarding"');
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

test("the shared setup veil strongly obscures both light and dark shells", () => {
  expect(shellStyles).toMatch(
    /\.blocking-setup-overlay\s*\{[\s\S]*?background: rgba\(5, 5, 8, 0\.84\);[\s\S]*?backdrop-filter: blur\(24px\) saturate\(0\.35\) brightness\(0\.62\);/,
  );
  expect(shellStyles).not.toMatch(
    /\[data-theme=["'](?:light|dark)["']\][^{]*\.blocking-setup-overlay/,
  );
});
