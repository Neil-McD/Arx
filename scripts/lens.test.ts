import { expect, test } from "vitest";
import { LENS_CALLS, LENS_READS, LENS_TOOLS, guideRunLens, lensCalls, lensHasTool, lensReads, parseTalkLens, personViewFor, renderTalkLensForPrompt, resolveLens } from "../shared/lens";
import { isPeopleFact } from "../shared/memberOntology";

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

test("a lens's tools: everyone reads with three tools, private talks also research the web, the review only writes", () => {
  const read = ["polynet_list", "polynet_read", "polynet_search"];
  expect(LENS_TOOLS.member_private).toEqual([...read, "web_research"]);
  // guideRunLens stands the member lens in for both private lenses.
  expect(LENS_TOOLS.builder_private).toEqual(LENS_TOOLS.member_private);
  // Tagged in a channel the guide only reads; own AIs get their named tools over the MCP.
  expect(LENS_TOOLS.guide_public).toEqual(read);
  expect(LENS_TOOLS.member_own_ai).toEqual(read);
  expect(LENS_TOOLS.builder_own_ai).toEqual(read);
  expect(LENS_TOOLS.worker).toEqual(["polynet_call"]);
  expect(LENS_TOOLS.member_site).toEqual([]);
  expect(LENS_TOOLS.retired).toEqual([]);
  // The two general action tools are given to no AI but the night review.
  for (const lens of Object.keys(LENS_TOOLS) as (keyof typeof LENS_TOOLS)[]) {
    if (lens === "worker") continue;
    expect(lensHasTool(lens, "polynet_write"), lens).toBe(false);
    expect(lensHasTool(lens, "polynet_call"), lens).toBe(false);
  }
  // A private talk has the guide's named tools; the guide in public and own AIs (here) have none.
  expect(lensHasTool("member_private", "polynet_post")).toBe(true);
  expect(lensHasTool("builder_private", "polynet_remember")).toBe(true);
  // The person's own direct messages: their private talk replies, after their yes; the guide in public never.
  expect(lensHasTool("member_private", "polynet_reply_message")).toBe(true);
  expect(lensHasTool("guide_public", "polynet_reply_message")).toBe(false);
  expect(lensHasTool("guide_public", "polynet_post")).toBe(false);
  expect(lensHasTool("member_own_ai", "polynet_post")).toBe(false);
  expect(lensHasTool("guide_public", "web_research")).toBe(false);
  expect(lensHasTool("member_private", "web_crawl")).toBe(false);
  expect(guideRunLens("community_concierge")).toBe("guide_public");
  expect(guideRunLens("member_agent_dock")).toBe("member_private");
});

test("how a lens sees one person", () => {
  // The guide in public sees anyone, even its sponsor, as any member does.
  expect(personViewFor("community", true)).toBe("member");
  expect(personViewFor("member", true)).toBe("self");
  expect(personViewFor("member", false)).toBe("member");
  expect(personViewFor("builder", false)).toBe("builder");
  expect(personViewFor("builder", true)).toBe("self");
  expect(personViewFor(null, false)).toBe("member");
});

test("a people fact is one the person stated or approved, here or on their profile", () => {
  const fact = (over: Record<string, unknown>) => ({ communityId: "c1", kind: "goal", body: "x", provenance: "stated_interview", consentState: "approved", ...over }) as any;
  expect(isPeopleFact(fact({}), "c1")).toBe(true);
  expect(isPeopleFact(fact({ communityId: null }), "c1")).toBe(true);
  expect(isPeopleFact(fact({ communityId: "c2" }), "c1")).toBe(false);
  expect(isPeopleFact(fact({ consentState: "pending" }), "c1")).toBe(false);
  expect(isPeopleFact(fact({ provenance: "observed_behavior" }), "c1")).toBe(false);
});

test("a private talk's lens parses strictly, and gives the guide only the person's recent answers", () => {
  expect(parseTalkLens({ lens: "builder_private", relation: "owner" })).toEqual({ lens: "builder_private", relation: "owner" });
  expect(parseTalkLens({ lens: "guide_public", relation: "owner" })).toBeNull();
  expect(parseTalkLens({ lens: "member_private", relation: "visitor" })).toBeNull();
  // The person's answers ride along, trimmed and capped; empty ones are dropped.
  const parsed = parseTalkLens({ lens: "member_private", relation: "member", answers: [" said yes ", "", 3, ...Array(10).fill("x")] })!;
  expect(parsed.answers?.[0]).toBe("said yes");
  expect(parsed.answers).toHaveLength(5);
  // The community's time zone rides along when it is a zone name; anything else is dropped.
  expect(parseTalkLens({ lens: "member_private", relation: "member", timeZone: "America/New_York" })?.timeZone).toBe("America/New_York");
  expect(parseTalkLens({ lens: "member_private", relation: "member", timeZone: "<b>now</b>" })).not.toHaveProperty("timeZone");
  // What the guide may do is generated from its tools (scripts/guide_prompt.test.ts);
  // the lens adds only the person's recent answers, in plain words.
  const member = renderTalkLensForPrompt({ lens: "member_private", relation: "member", answers: ["\"Post this in #general as you?\" They said no. Nothing was done."] })!;
  expect(member).toContain("Since you last spoke, they answered your questions:");
  expect(member).toContain("- \"Post this in #general as you?\" They said no. Nothing was done.");
  expect(member).not.toMatch(/member_private|builder_change|review_joins|Lens:/);
  expect(renderTalkLensForPrompt({ lens: "builder_private", relation: "owner" })).toBeNull();
  expect(renderTalkLensForPrompt(null)).toBeNull();
});
