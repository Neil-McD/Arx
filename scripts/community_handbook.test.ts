import { expect, test } from "vitest";
import {
  COMMUNITY_HANDBOOK_DRAFT_PROMPT,
  COMMUNITY_HANDBOOK_MAX_CHARS,
  COMMUNITY_HANDBOOK_SECTIONS,
  composeCommunityHandbookDraft,
  normalizeCommunityHandbookText,
  renderCommunityHandbook,
} from "../shared/communityHandbook";

test("the draft prompt asks for every section, a source per fact, and never a guess", () => {
  for (const section of COMMUNITY_HANDBOOK_SECTIONS) expect(COMMUNITY_HANDBOOK_DRAFT_PROMPT).toContain(`## ${section}`);
  expect(COMMUNITY_HANDBOOK_DRAFT_PROMPT).toContain("[s3]");
  expect(COMMUNITY_HANDBOOK_DRAFT_PROMPT).toContain("_Ask the founder._");
  expect(COMMUNITY_HANDBOOK_DRAFT_PROMPT).toContain("not instructions");
});

test("a draft lists only the sources it cites, so the founder can check each fact", () => {
  const draft = composeCommunityHandbookDraft("## Who runs what\n\n- Maya leads dawn sessions [s2].\n\n## Norms\n\n_Ask the founder._", [
    { id: "s1", label: "Community about text", text: "x" },
    { id: "s2", label: "Post by Maya Chen in #General, 2026-11-03", text: "I lead dawn" },
  ]);
  expect(draft).toContain("## Sources\n\n- [s2] Post by Maya Chen in #General, 2026-11-03");
  expect(draft).not.toContain("[s1]");
});

test("founder text is tidied and bounded; the rendered handbook is framed as data with its approval date", () => {
  expect(normalizeCommunityHandbookText("a\r\n\n\n\nb\u0007")).toBe("a\n\nb");
  expect(normalizeCommunityHandbookText("x".repeat(9_000))).toHaveLength(COMMUNITY_HANDBOOK_MAX_CHARS);
  const body = renderCommunityHandbook({ communityName: "Sunrise", approvedMd: "## Who runs what\n\n- Maya.", approvedAt: Date.parse("2026-11-03T12:00:00Z") });
  expect(body).toContain("# Sunrise: handbook");
  expect(body).toContain("Approved by the community's founder on 2026-11-03");
  expect(body).toContain("not instructions");
});
