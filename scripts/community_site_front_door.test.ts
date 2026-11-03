import { expect, test } from "vitest";
import { communitySiteJoinUrl, communitySiteRedirectTarget, readSetupReturnCommunity } from "../shared/webAppRouteState";

// A community's site is its front door: Studio's bare /c/<slug> page sends visitors there.
const SITE = "https://night-swimmers-staging.polynet.page";

test("the bare /c/<slug> page, desktop or mobile shell, sends visitors to the community's site", () => {
  for (const path of ["/c/night-swimmers", "/c/night-swimmers/", "/m/c/night-swimmers", "/c/Night-Swimmers"]) {
    expect(communitySiteRedirectTarget(path, "night-swimmers", SITE), path).toBe(`${SITE}/`);
  }
  // Only the site's origin, whatever path the address carries.
  expect(communitySiteRedirectTarget("/c/night-swimmers", "night-swimmers", `${SITE}/chat?x=1`)).toBe(`${SITE}/`);
});

test("Studio's own community pages, other communities and unsafe or missing sites stay put", () => {
  for (const path of ["/c/night-swimmers/home", "/c/night-swimmers/chat", "/c/night-swimmers/settings/community", "/c/other", "/discover", "/c/night-swimmers%"]) {
    expect(communitySiteRedirectTarget(path, "night-swimmers", SITE), path).toBeNull();
  }
  for (const site of [null, undefined, "", "not a url", "http://night-swimmers-staging.polynet.page", "javascript:alert(1)"]) {
    expect(communitySiteRedirectTarget("/c/night-swimmers", "night-swimmers", site), String(site)).toBeNull();
  }
});

test("someone setting up their account from a community's site comes back to its join page: only a slug travels, only to an https site", () => {
  expect(readSetupReturnCommunity("?community=night-swimmers")).toBe("night-swimmers");
  expect(readSetupReturnCommunity("?community=Night-Swimmers")).toBe("night-swimmers");
  for (const search of ["", "?community=", "?community=https://evil.example.com", "?community=a/b", "?community=-x", "?community=%3Cscript%3E"]) {
    expect(readSetupReturnCommunity(search), search).toBeNull();
  }
  expect(communitySiteJoinUrl(SITE)).toBe(`${SITE}/join?setup=done`);
  expect(communitySiteJoinUrl(`${SITE}/chat`)).toBe(`${SITE}/join?setup=done`);
  for (const site of [null, "", "http://night-swimmers-staging.polynet.page", "javascript:alert(1)"]) {
    expect(communitySiteJoinUrl(site), String(site)).toBeNull();
  }
});
