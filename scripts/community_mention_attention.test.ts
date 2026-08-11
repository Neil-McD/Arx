import { describe, expect, it } from "vitest";
import { interactionMentionsViewer } from "../apps/web/src/controllers/communityMentionAttention";

describe("community viewer mention attention", () => {
  it("highlights a direct mention for the addressed viewer", () => {
    expect(interactionMentionsViewer(
      [{ mentioned_user_id: "viewer-1" }],
      "viewer-1",
      "author-1",
    )).toBe(true);
  });

  it("highlights an everybody mention for every non-author viewer", () => {
    expect(interactionMentionsViewer(
      [{ mentioned_role_key: "everybody" }],
      "viewer-1",
      "author-1",
    )).toBe(true);
  });

  it("does not highlight an author's own post", () => {
    expect(interactionMentionsViewer(
      [{ mentioned_role_key: "everybody" }, { mentioned_user_id: "author-1" }],
      "author-1",
      "author-1",
    )).toBe(false);
  });

  it("does not highlight when there is no viewer", () => {
    expect(interactionMentionsViewer(
      [{ mentioned_role_key: "everybody" }],
      null,
      "author-1",
    )).toBe(false);
  });

  it("does not highlight an unrelated mention", () => {
    expect(interactionMentionsViewer(
      [{ mentioned_user_id: "viewer-2" }],
      "viewer-1",
      "author-1",
    )).toBe(false);
  });
});
