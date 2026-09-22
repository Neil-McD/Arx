import { expect, test } from "vitest";
import type { DiscoverCommunitySnapshot } from "../shared/communityTypes";
import { resolveDiscoverCommunityDestination } from "../apps/web/src/controllers/useWebDiscoverActivationController";

const community = {
  slug: "builders",
  name: "Builders",
  one_liner: "Build together",
  avatar_url: null,
  banner_url: null,
  visibility: "published",
  created_at: "2026-09-22T00:00:00Z",
  updated_at: "2026-09-22T00:00:00Z",
  external_funnel_url: "https://example.com/builders",
} satisfies DiscoverCommunitySnapshot;

test("Discover sends visitors to a configured website but keeps members and invalid links inside Polynet", () => {
  expect(resolveDiscoverCommunityDestination(community, "joined-community"))
    .toEqual({ kind: "joined", communityId: "joined-community" });
  expect(resolveDiscoverCommunityDestination(community, null))
    .toEqual({ kind: "external", url: "https://example.com/builders" });
  expect(resolveDiscoverCommunityDestination({ ...community, external_funnel_url: "javascript:alert(1)" }, null))
    .toEqual({ kind: "native" });
  expect(resolveDiscoverCommunityDestination({ ...community, external_funnel_url: null }, null))
    .toEqual({ kind: "native" });
});
