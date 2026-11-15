import { expect, test } from "vitest";
import { LENS_CALLS, LENS_READS, lensCalls, lensReads, resolveLens } from "../shared/lens";

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
