import { describe, expect, it } from "vitest";

import {
  buildDefaultCommunityFunnelDocumentV1,
  validateCommunityFunnelDocumentV1,
} from "../shared/communityFunnel";

describe("Community Funnel V1 document", () => {
  it("builds a valid bounded default document", () => {
    const document = buildDefaultCommunityFunnelDocumentV1({
      communityName: "Builders",
      oneLiner: "Build compounding systems together.",
    });
    expect(validateCommunityFunnelDocumentV1(document)).toEqual(document);
    expect(document.sections).toHaveLength(5);
  });

  it("rejects documents that exceed the section budget", () => {
    const document = buildDefaultCommunityFunnelDocumentV1({
      communityName: "Builders",
    });
    expect(() =>
      validateCommunityFunnelDocumentV1({
        ...document,
        sections: [
          ...document.sections,
          ...Array.from({ length: 6 }, (_, index) => ({
            id: `proof-${index}`,
            type: "social_proof",
            headline: null,
            body: "Proof",
          })),
        ],
      }),
    ).toThrow("community_funnel_document_too_many_sections");
  });

  it("rejects duplicate IDs and requires exactly one hero and CTA", () => {
    const document = buildDefaultCommunityFunnelDocumentV1({
      communityName: "Builders",
    });
    expect(() =>
      validateCommunityFunnelDocumentV1({
        ...document,
        sections: document.sections.map((section, index) =>
          index === 1 ? { ...section, id: document.sections[0]!.id } : section,
        ),
      }),
    ).toThrow("community_funnel_section_id_duplicate");
    expect(() =>
      validateCommunityFunnelDocumentV1({
        ...document,
        sections: document.sections.filter(
          (section) => section.type !== "hero",
        ),
      }),
    ).toThrow("community_funnel_document_requires_one_hero");
    expect(() =>
      validateCommunityFunnelDocumentV1({
        ...document,
        sections: document.sections.filter((section) => section.type !== "cta"),
      }),
    ).toThrow("community_funnel_document_requires_one_cta");
  });

  it("rejects executable or untrusted media origins", () => {
    const document = buildDefaultCommunityFunnelDocumentV1({
      communityName: "Builders",
    });
    expect(() =>
      validateCommunityFunnelDocumentV1({
        ...document,
        sections: document.sections.map((section) =>
          section.type === "media"
            ? { ...section, media_url: "https://attacker.example/payload" }
            : section,
        ),
      }),
    ).toThrow("community_funnel_media_url_unsupported");
    for (const mediaUrl of [
      "https://evilyoutube.com/watch?v=123",
      "https://vimeo.com.attacker.example/123456",
      "https://fakewistia.com/medias/abc",
    ]) {
      expect(() =>
        validateCommunityFunnelDocumentV1({
          ...document,
          sections: document.sections.map((section) =>
            section.type === "media"
              ? { ...section, media_url: mediaUrl }
              : section,
          ),
        }),
      ).toThrow("community_funnel_media_url_unsupported");
    }
  });

  it("rejects oversized section contents instead of silently truncating them", () => {
    const document = buildDefaultCommunityFunnelDocumentV1({
      communityName: "Builders",
    });
    expect(() =>
      validateCommunityFunnelDocumentV1({
        ...document,
        sections: document.sections.map((section) =>
          section.type === "benefits"
            ? {
                ...section,
                items: Array.from({ length: 5 }, (_, index) => ({
                  title: `Benefit ${index + 1}`,
                  body: "Bounded benefit",
                })),
              }
            : section,
        ),
      }),
    ).toThrow("community_funnel_benefits_limit_exceeded");
  });
});
