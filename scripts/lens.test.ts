import { expect, test } from "vitest";
import { LENS_CALLS, LENS_READS, LENS_TOOLS, guideRunLens, lensCalls, lensHasTool, lensReads, resolveLens } from "../shared/lens";

const member = { canUseBuilderProjection: false, canReviewJoinRequests: false, canModerateContent: false };
const builder = { canUseBuilderProjection: true, canReviewJoinRequests: true, canModerateContent: true };

test("a call's lens comes from who calls, where from and their authority", () => {
  expect(resolveLens({ principalKind: "community_agent", evidenceSurface: "community_concierge", authority: builder }))
    .toMatchObject({ name: "guide_public", family: "community", reviewsJoins: false, moderatesPosts: false });
  expect(resolveLens({ principalKind: "community_agent_for_member", evidenceSurface: "member_agent_dock", authority: builder }).name).toBe("builder_private");
  expect(resolveLens({ principalKind: "community_agent_for_member", evidenceSurface: "member_agent_dock", authority: member }).name).toBe("member_private");
  expect(resolveLens({ principalKind: "external_mcp", evidenceSurface: "external_mcp", authority: builder }))
    .toMatchObject({ name: "builder_own_ai", family: "builder", reviewsJoins: true, moderatesPosts: true });
  // A site never has builder powers, even for the owner.
  expect(resolveLens({ principalKind: "community_app", evidenceSurface: "external_mcp", authority: builder }))
    .toMatchObject({ name: "member_site", family: "member", reviewsJoins: false });
});

test("retired or impossible callers see and do nothing", () => {
  for (const lens of [
    resolveLens({ principalKind: "external_mcp", evidenceSurface: "community_funnel_builder", authority: builder }),
    resolveLens({ principalKind: "community_agent_for_member", evidenceSurface: "coding_harness", authority: builder }),
  ]) {
    expect(lens.name).toBe("retired");
    for (const view of Object.keys(LENS_READS)) expect(lensReads(lens, view as any)).toBe(false);
    for (const action of Object.keys(LENS_CALLS)) expect(lensCalls(lens, action as any)).toBe(false);
  }
});

test("the guide never acts for a person, and the worker reads nothing through the executor", () => {
  const guide = resolveLens({ principalKind: "community_agent", evidenceSurface: "community_concierge", authority: builder });
  for (const action of Object.keys(LENS_CALLS)) expect(lensCalls(guide, action as any)).toBe(false);
  for (const view of ["members_self", "presence", "builder_directory", "builder_records"] as const) expect(lensReads(guide, view)).toBe(false);
  for (const view of Object.keys(LENS_READS)) expect(LENS_READS[view as keyof typeof LENS_READS]).not.toContain("worker");
});

test("a lens's tools: private talks research the web, the guide in public and own AIs get the five, the review only writes", () => {
  const five = ["polynet_list", "polynet_read", "polynet_search", "polynet_write", "polynet_call"];
  expect(LENS_TOOLS.member_private).toEqual([...five, "web_research"]);
  // guideRunLens stands the member lens in for both private lenses.
  expect(LENS_TOOLS.builder_private).toEqual(LENS_TOOLS.member_private);
  expect(LENS_TOOLS.guide_public).toEqual(five);
  expect(LENS_TOOLS.member_own_ai).toEqual(five);
  expect(LENS_TOOLS.worker).toEqual(["polynet_call"]);
  expect(LENS_TOOLS.member_site).toEqual([]);
  expect(LENS_TOOLS.retired).toEqual([]);
  expect(lensHasTool("guide_public", "web_research")).toBe(false);
  expect(lensHasTool("member_private", "web_crawl")).toBe(false);
  expect(guideRunLens("community_concierge")).toBe("guide_public");
  expect(guideRunLens("member_agent_dock")).toBe("member_private");
});
