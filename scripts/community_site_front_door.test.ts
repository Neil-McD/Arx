import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { readSetupReturnCommunity } from "../shared/webAppRouteState";

// /c/<slug> is the community's landing page in the app (Nov 13: custom sites
// are being removed). Someone who has to set up their Polynet account first
// comes to /onboarding?community=<slug> and, once set up, goes back there to join.

test("someone setting up their account from a community's landing page comes back to it: only a slug travels", () => {
  expect(readSetupReturnCommunity("?community=night-swimmers")).toBe("night-swimmers");
  expect(readSetupReturnCommunity("?community=Night-Swimmers")).toBe("night-swimmers");
  for (const search of ["", "?community=", "?community=https://evil.example.com", "?community=a/b", "?community=-x", "?community=%3Cscript%3E"]) {
    expect(readSetupReturnCommunity(search), search).toBeNull();
  }
});

test("after setup they land on the landing page, which joins for them; no site address is involved", () => {
  const onboarding = readFileSync(new URL("../apps/web/src/controllers/useWebOnboardingProfileController.ts", import.meta.url), "utf8");
  expect(onboarding).toMatch(/buildCommunityFunnelPath\(returnCommunity\)[\s\S]*window\.location\.assign\(`\$\{funnelPath\}\?intent=join`\)/);
  expect(onboarding).not.toMatch(/site_url|communitySiteJoinUrl/);
  const host = readFileSync(new URL("../apps/web/src/components/WebAppMainSurfaceHost.tsx", import.meta.url), "utf8");
  expect(host).toMatch(/<WebCommunityLandingPage communitySlug=\{props\.publicCommunitySlug\} session=\{props\.publicCommunitySession\} \/>/);
});
