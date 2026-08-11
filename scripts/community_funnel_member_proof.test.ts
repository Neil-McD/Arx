import { describe, expect, it } from "vitest";

import { buildDefaultCommunityFunnelDocumentV1 } from "../shared/communityFunnel";
import {
  buildCommunityFunnelMemberProofView,
  resolveCommunityFunnelMemberProofInsertIndex,
} from "../shared/communityFunnelUi";

describe("community funnel member proof", () => {
  it("places implicit proof directly after benefits", () => {
    const document = buildDefaultCommunityFunnelDocumentV1({
      communityName: "Builders",
    });
    const sections = document.sections.filter(
      (section) => section.type !== "social_proof",
    );
    const benefitsIndex = sections.findIndex(
      (section) => section.type === "benefits",
    );
    expect(resolveCommunityFunnelMemberProofInsertIndex(sections)).toBe(
      benefitsIndex + 1,
    );
  });

  it("preserves the explicit position of legacy proof sections", () => {
    const document = buildDefaultCommunityFunnelDocumentV1({
      communityName: "Builders",
    });
    expect(
      resolveCommunityFunnelMemberProofInsertIndex(document.sections),
    ).toBeNull();
  });

  it("falls back to immediately before the CTA when benefits are absent", () => {
    const document = buildDefaultCommunityFunnelDocumentV1({
      communityName: "Builders",
    });
    const sections = document.sections.filter(
      (section) =>
        section.type !== "benefits" && section.type !== "social_proof",
    );
    expect(resolveCommunityFunnelMemberProofInsertIndex(sections)).toBe(
      sections.findIndex((section) => section.type === "cta"),
    );
  });

  it("hides missing and zero-count proof without reserving space", () => {
    expect(
      buildCommunityFunnelMemberProofView({ memberCount: null, faces: [] }),
    ).toBeNull();
    expect(
      buildCommunityFunnelMemberProofView({ memberCount: 0, faces: [] }),
    ).toBeNull();
  });

  it("deduplicates, bounds, and preserves public avatar framing", () => {
    const proof = buildCommunityFunnelMemberProofView({
      memberCount: 20,
      maxFaces: 2,
      faces: [
        {
          user_id: "one",
          display_name: "One",
          avatar_url: "https://images.example/one.png",
          avatar_focus_x: 0.25,
        },
        {
          user_id: "one",
          display_name: "Duplicate",
          avatar_url: "https://images.example/duplicate.png",
        },
        {
          user_id: "missing-avatar",
          display_name: "Missing",
          avatar_url: null,
        },
        {
          user_id: "two",
          display_name: "Two",
          avatar_url: "https://images.example/two.png",
        },
        {
          user_id: "three",
          display_name: "Three",
          avatar_url: "https://images.example/three.png",
        },
      ],
    });
    expect(proof?.faces.map((face) => face.user_id)).toEqual(["one", "two"]);
    expect(proof?.faces[0]?.avatar_focus_x).toBe(0.25);
    expect(proof?.hiddenFaceCount).toBe(18);
    expect(proof?.label).toBe("20 members and growing");
    expect(proof?.ariaLabel).toBe("20 community members");
  });

  it("never renders more faces than the canonical member count", () => {
    const proof = buildCommunityFunnelMemberProofView({
      memberCount: 1,
      faces: [
        {
          user_id: "one",
          display_name: "One",
          avatar_url: "https://images.example/one.png",
        },
        {
          user_id: "two",
          display_name: "Two",
          avatar_url: "https://images.example/two.png",
        },
      ],
    });
    expect(proof?.faces).toHaveLength(1);
    expect(proof?.hiddenFaceCount).toBe(0);
    expect(proof?.label).toBe("1 member");
    expect(proof?.ariaLabel).toBe("1 community member");
  });
});
