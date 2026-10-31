import { expect, test } from "vitest";
import { communitySiteRedirectTarget } from "../shared/webAppRouteState";

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
