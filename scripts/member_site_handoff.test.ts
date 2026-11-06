import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

import { communityAccessRunsCommunity, deriveCommunityAccessCapabilities } from "../shared/communityAccessViewModel";
import { communityMemberSiteUrl } from "../shared/webAppRouteState";

const SITE = "https://sunrise.polynet.page";

test("a member's Studio screen maps to the site's matching page; management tabs stay in Studio", () => {
  expect(communityMemberSiteUrl(SITE, "community_home", "chat")).toBe(`${SITE}/`);
  expect(communityMemberSiteUrl(SITE, "home", "chat")).toBe(`${SITE}/chat`);
  expect(communityMemberSiteUrl(SITE, "home", "chat", "Crew")).toBe(`${SITE}/chat?channel=crew`);
  expect(communityMemberSiteUrl(SITE, "home", "chat", "general")).toBe(`${SITE}/chat`);
  expect(communityMemberSiteUrl(SITE, "home", "events", "crew")).toBe(`${SITE}/events`);
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

// Access as the backend sends it for each kind of person.
const base = { community_id: "c1", user_id: "u1", can_view: true, can_enter_community: true, can_post_chat: true };
const access = (fields: Record<string, unknown>) => ({ ...base, ...fields }) as any;

test("a plain member doesn't run the community, though they may open their own settings", () => {
  const member = access({ relation: "member", effective_role: "member", can_moderate_content: false });
  expect(deriveCommunityAccessCapabilities(member).canViewSettings).toBe(true);
  expect(communityAccessRunsCommunity(member)).toBe(false);
  expect(communityAccessRunsCommunity(access({ relation: "member", effective_role: "member" }))).toBe(false);
  expect(communityAccessRunsCommunity(null)).toBe(false);
});

test("the owner, admins, moderators and anyone with a management right keep Studio", () => {
  for (const person of [
    access({ relation: "owner", is_owner: true, effective_role: "owner" }),
    access({ relation: "admin", effective_role: "admin" }),
    access({ relation: "moderator", effective_role: "moderator" }),
    access({ relation: "member", effective_role: "member", can_manage_members: true }),
    access({ relation: "member", effective_role: "member", can_review_join_requests: true }),
    access({ relation: "member", effective_role: "member", can_moderate_content: true }),
  ]) expect(communityAccessRunsCommunity(person), JSON.stringify(person)).toBe(true);
});

test("the hand-off waits for this community's access and never acts on a failed load", () => {
  const hook = readFileSync(new URL("../apps/web/src/controllers/useWebMemberSiteHandoff.ts", import.meta.url), "utf8");
  expect(hook).toMatch(/!params\.isLoadingCommunityAccess[\s\S]*!params\.communityAccessLoadError[\s\S]*activeCommunityAccessId === params\.activeCommunityId[\s\S]*!params\.runsCommunity/);
  const app = readFileSync(new URL("../apps/web/src/App.tsx", import.meta.url), "utf8");
  expect(app).toMatch(/runsCommunity: communityAccessRunsCommunity\(activeCommunityAccess\)/);
});

test("the owner's switch decides: Studio hands members to the site only when they use it", () => {
  const app = readFileSync(new URL("../apps/web/src/App.tsx", import.meta.url), "utf8");
  expect(app).toMatch(/activeCommunitySiteUrl: activeCommunity\?\.members_use === "site" \? activeCommunity\.site_url : null/);
  const handoff = readFileSync(new URL("../apps/web/src/components/WebCommunityHandoff.tsx", import.meta.url), "utf8");
  // /c/<slug>: wait until membership is known; a member on Polynet's app opens the community there.
  expect(handoff).toMatch(/if \(props\.membership === "loading"\) return;/);
  expect(handoff).toMatch(/props\.membership === "member" && community\.members_use !== "site"[\s\S]*\/c\/\$\{encodeURIComponent\(community\.slug\)\}\/home/);
  const settings = readFileSync(new URL("../apps/web/src/components/WebCommunitySettingsSection.tsx", import.meta.url), "utf8");
  expect(settings).toMatch(/<CommunityMemberExperienceSection[\s\S]*canChange=\{isOwnerSettingsLayer\}/);
});
