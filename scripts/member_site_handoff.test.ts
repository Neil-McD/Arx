import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

import { communityMemberSiteUrl } from "../shared/webAppRouteState";

const SITE = "https://sunrise.polynet.page";

test("a member's Studio screen maps to the site's matching page; management tabs stay in Studio", () => {
  expect(communityMemberSiteUrl(SITE, "community_home", "chat")).toBe(`${SITE}/`);
  expect(communityMemberSiteUrl(SITE, "home", "chat")).toBe(`${SITE}/chat`);
  expect(communityMemberSiteUrl(SITE, "home", "events")).toBe(`${SITE}/events`);
  expect(communityMemberSiteUrl(SITE, "home", "resources")).toBe(`${SITE}/learn`);
  expect(communityMemberSiteUrl(SITE, "home", "agent")).toBe(`${SITE}/ask`);
  for (const tab of ["settings", "workflows", "analytics"] as const) expect(communityMemberSiteUrl(SITE, "home", tab)).toBeNull();
});

test("no site, or anything but an https site, keeps the member in Studio", () => {
  for (const site of [null, undefined, "", "not a url", "http://sunrise.polynet.page", "javascript:alert(1)"]) {
    expect(communityMemberSiteUrl(site, "home", "chat")).toBeNull();
  }
});

test("only someone who just belongs is handed over: anyone who runs the community, and loading or failed access, stay", () => {
  const hook = readFileSync(new URL("../apps/web/src/controllers/useWebMemberSiteHandoff.ts", import.meta.url), "utf8");
  expect(hook).toMatch(/!params\.isLoadingCommunityAccess[\s\S]*!params\.communityAccessLoadError[\s\S]*activeCommunityAccessId === params\.activeCommunityId[\s\S]*!params\.runsCommunity/);
  const app = readFileSync(new URL("../apps/web/src/App.tsx", import.meta.url), "utf8");
  expect(app).toMatch(/runsCommunity:\s*isActiveCommunityOwner \|\|\s*canViewActiveCommunitySettings \|\|\s*canManageMembersActiveCommunity \|\|\s*canViewActiveCommunityAnalytics \|\|\s*canReviewJoinRequestsActiveCommunity \|\|\s*canModerateContentActiveCommunity/);
});
