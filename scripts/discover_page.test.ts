import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

import { buildAppRoutePath, buildCommunityTabPath, parseAppRouteFromPathname } from "../shared/webAppRouteState";
import { DISCOVER_SEARCH_FROM, discoverActivityWord, discoverPriceWord, discoverRowsFor } from "../apps/web/src/v1/KitDiscover";

// Discover (docs/specs/discover-v1.md).
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const NOW = Date.parse("2026-11-16T12:00:00Z");
const community = (slug: string, extra: Record<string, unknown> = {}) => ({
  slug, name: slug, one_liner: `About ${slug}`, avatar_url: null, banner_url: "https://x.test/b.webp", visibility: "published" as const,
  created_at: "", updated_at: "", ...extra,
}) as any;

test("Discover is a page of the community you are in, and survives a refresh", () => {
  expect(buildCommunityTabPath("sunrise", "discover")).toBe("/c/sunrise/discover");
  const route = parseAppRouteFromPathname("/c/sunrise/discover")!;
  expect(route).toMatchObject({ page: "community", communityTab: "discover", communitySlug: "sunrise" });
  expect(buildAppRoutePath(route)).toBe("/c/sunrise/discover");
  // The public address stays for visitors and people in no community.
  expect(parseAppRouteFromPathname("/discover")).toMatchObject({ page: "discover" });
});

test("a sign of life: today, else the week's posts, else nothing", () => {
  expect(discoverActivityWord({ last_active_at: "2026-11-16T03:00:00Z", posts_this_week: 4 }, NOW)).toBe("Active today");
  expect(discoverActivityWord({ last_active_at: "2026-11-13T03:00:00Z", posts_this_week: 9 }, NOW)).toBe("9 posts this week");
  expect(discoverActivityWord({ last_active_at: "2026-11-13T03:00:00Z", posts_this_week: 1 }, NOW)).toBe("1 post this week");
  expect(discoverActivityWord({ last_active_at: "2026-11-13T03:00:00Z", posts_this_week: 50 }, NOW)).toBe("50+ posts this week");
  expect(discoverActivityWord({ last_active_at: null, posts_this_week: 0 }, NOW)).toBeNull();
});

test("the price is neutral words, with how you get in when that is by asking", () => {
  expect(discoverPriceWord({ active_plan: null, entry_policy: "open" } as any)).toBe("Free");
  expect(discoverPriceWord({ active_plan: null, entry_policy: "approval" } as any)).toBe("Free · ask to join");
});

test("new communities first by latest activity; the ones you're in are left out; search reads name, line and host", () => {
  const all = [
    community("quiet", { last_active_at: null }),
    community("mine", { last_active_at: "2026-11-16T10:00:00Z" }),
    community("busy", { last_active_at: "2026-11-16T09:00:00Z", host: { name: "Maya Chen", avatar_url: null } }),
    community("older", { last_active_at: "2026-11-10T09:00:00Z" }),
  ];
  expect(discoverRowsFor(all, new Set(["mine"]), "").map((row) => row.slug)).toEqual(["busy", "older", "quiet"]);
  expect(discoverRowsFor(all, new Set(), "maya").map((row) => row.slug)).toEqual(["busy"]);
  expect(discoverRowsFor(all, new Set(), "about older").map((row) => row.slug)).toEqual(["older"]);
});

test("search appears only once there is enough to search", () => {
  expect(DISCOVER_SEARCH_FROM).toBe(8);
  expect(read("apps/web/src/v1/KitDiscover.tsx")).toContain("const searchable = fresh.length > DISCOVER_SEARCH_FROM;");
});

test("the switcher opens Discover inside the community; a signed-in visit to /discover is moved there", () => {
  expect(read("apps/web/src/App.tsx")).toMatch(/if \(isDesignV1Active\(\) && selectedActiveCommunitySlug\) handleSelectCommunityTab\("discover"\);/);
  expect(read("apps/web/src/controllers/useWebDiscoverAddress.ts")).toMatch(/navigateTo\(path, \{ replace: true \}\);/);
});

test("one set of cards: the public page draws the app's Discover cards", () => {
  expect(read("apps/web/src/components/polynetLanding/PublicFindPage.tsx")).toContain("<DiscoverCard community={community} now={now}");
});

test("a listed community that isn't showing yet is told what Discover still needs", async () => {
  const { discoverListingGap } = await import("../shared/communityDiscoverListing");
  expect(discoverListingGap({ listed: true, hasBanner: false, oneLiner: "" })).toBe("Add a banner and a one-liner to appear in Discover.");
  expect(discoverListingGap({ listed: true, hasBanner: false, oneLiner: "Early climbers." })).toBe("Add a banner to appear in Discover.");
  expect(discoverListingGap({ listed: true, hasBanner: true, oneLiner: "  " })).toBe("Add a one-liner to appear in Discover.");
  expect(discoverListingGap({ listed: true, hasBanner: true, oneLiner: "Early climbers." })).toBeNull();
  expect(discoverListingGap({ listed: false, hasBanner: false, oneLiner: "" })).toBeNull();
});
