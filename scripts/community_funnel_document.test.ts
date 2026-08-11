import { describe, expect, it } from "vitest";

import {
  normalizeCommunityFunnelManagerConfig,
  normalizeCommunityFunnelVslUrl,
  validateCommunityFunnelContentV2,
  validateCommunityFunnelDocumentV1,
  withoutCommunityFunnelMediaSections,
} from "../shared/communityFunnel";
import {
  buildCommunityFunnelContentTestFixture,
  buildCommunityFunnelDocumentTestFixture,
} from "./community_funnel_test_fixture";

describe("Community Funnel V2 content", () => {
  it("accepts the fixed content contract with exactly three pillars", () => {
    const content = buildCommunityFunnelContentTestFixture();
    expect(validateCommunityFunnelContentV2(content)).toEqual(content);
    expect(content.pillars).toHaveLength(3);
  });

  it("rejects incomplete or non-canonical pillar sets", () => {
    const content = buildCommunityFunnelContentTestFixture();
    for (const pillars of [
      content.pillars.slice(0, 2),
      [...content.pillars, content.pillars[0]],
    ]) {
      expect(() =>
        validateCommunityFunnelContentV2({ ...content, pillars }),
      ).toThrow("community_funnel_content_requires_three_pillars");
    }
    expect(() =>
      validateCommunityFunnelContentV2({
        ...content,
        pillars: [{ title: "", body: "Body" }, ...content.pillars.slice(1)],
      }),
    ).toThrow("community_funnel_pillar_title_required");
  });

  it("requires core copy and rejects every overlong V2 field", () => {
    const content = buildCommunityFunnelContentTestFixture();
    expect(() =>
      validateCommunityFunnelContentV2({ ...content, headline: "" }),
    ).toThrow("community_funnel_headline_required");

    expect(
      validateCommunityFunnelContentV2({
        ...content,
        headline: "h".repeat(180),
        subheadline: "s".repeat(480),
        pillars: content.pillars.map((pillar) => ({
          ...pillar,
          title: "t".repeat(90),
          body: "b".repeat(320),
        })),
        long_form_markdown: "l".repeat(12_000),
      }),
    ).toMatchObject({
      headline: "h".repeat(180),
      subheadline: "s".repeat(480),
      long_form_markdown: "l".repeat(12_000),
    });

    const overlongCases = [
      {
        value: { ...content, headline: "h".repeat(181) },
        code: "community_funnel_headline_too_long",
      },
      {
        value: { ...content, subheadline: "s".repeat(481) },
        code: "community_funnel_subheadline_too_long",
      },
      {
        value: {
          ...content,
          pillars: [
            { ...content.pillars[0], title: "t".repeat(91) },
            ...content.pillars.slice(1),
          ],
        },
        code: "community_funnel_pillar_title_too_long",
      },
      {
        value: {
          ...content,
          pillars: [
            { ...content.pillars[0], body: "b".repeat(321) },
            ...content.pillars.slice(1),
          ],
        },
        code: "community_funnel_pillar_body_too_long",
      },
      {
        value: { ...content, long_form_markdown: "l".repeat(12_001) },
        code: "community_funnel_long_form_too_long",
      },
    ];
    for (const testCase of overlongCases) {
      expect(() => validateCommunityFunnelContentV2(testCase.value)).toThrow(
        testCase.code,
      );
    }
  });
});

describe("Community Funnel V1 document", () => {
  it("accepts a minimal valid bounded document", () => {
    const document = buildCommunityFunnelDocumentTestFixture();
    expect(validateCommunityFunnelDocumentV1(document)).toEqual(document);
    expect(document.theme.appearance).toBe("inherit");
    expect(document.theme.accent).toBe("blue");
    expect(document.sections).toHaveLength(2);
    expect(document.sections.some((section) => section.type === "media")).toBe(
      false,
    );
  });

  it("canonicalizes legacy funnel appearances to the Polynet theme", () => {
    const document = buildCommunityFunnelDocumentTestFixture();
    for (const appearance of ["light", "dark", "inherit"] as const) {
      expect(
        validateCommunityFunnelDocumentV1({
          ...document,
          theme: { ...document.theme, appearance },
        }).theme.appearance,
      ).toBe("inherit");
    }
  });

  it("rejects documents that exceed the section budget", () => {
    const document = buildCommunityFunnelDocumentTestFixture();
    expect(() =>
      validateCommunityFunnelDocumentV1({
        ...document,
        sections: [
          ...document.sections,
          ...Array.from({ length: 9 }, (_, index) => ({
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
    const document = buildCommunityFunnelDocumentTestFixture();
    const neutralProof = {
      id: "proof",
      type: "social_proof" as const,
      headline: null,
      body: null,
    };
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
        sections: [
          neutralProof,
          ...document.sections.filter((section) => section.type !== "hero"),
        ],
      }),
    ).toThrow("community_funnel_document_requires_one_hero");
    expect(() =>
      validateCommunityFunnelDocumentV1({
        ...document,
        sections: [
          ...document.sections.filter((section) => section.type !== "cta"),
          neutralProof,
        ],
      }),
    ).toThrow("community_funnel_document_requires_one_cta");
  });

  it("rejects executable or untrusted media origins", () => {
    const document = buildCommunityFunnelDocumentTestFixture();
    const withMedia = (mediaUrl: string) => ({
      ...document,
      sections: [
        document.sections[0],
        {
          id: "legacy-media",
          type: "media",
          media_url: mediaUrl,
          caption: null,
        },
        ...document.sections.slice(1),
      ],
    });
    expect(() =>
      validateCommunityFunnelDocumentV1(
        withMedia("https://attacker.example/payload"),
      ),
    ).toThrow("community_funnel_media_url_unsupported");
    for (const mediaUrl of [
      "https://evilyoutube.com/watch?v=123",
      "https://vimeo.com.attacker.example/123456",
      "https://fakewistia.com/medias/abc",
    ]) {
      expect(() =>
        validateCommunityFunnelDocumentV1(
          withMedia(mediaUrl),
        ),
      ).toThrow("community_funnel_media_url_unsupported");
    }
  });

  it("normalizes supported creator VSL links and strips legacy media authority", () => {
    expect(
      normalizeCommunityFunnelVslUrl("youtube.com/watch?v=abcdefghijk"),
    ).toBe("https://youtube.com/watch?v=abcdefghijk");
    expect(() =>
      normalizeCommunityFunnelVslUrl("https://attacker.example/video"),
    ).toThrow("community_funnel_vsl_url_unsupported");

    const document = buildCommunityFunnelDocumentTestFixture();
    const legacyDocument = validateCommunityFunnelDocumentV1({
      ...document,
      sections: [
        document.sections[0],
        {
          id: "legacy-media",
          type: "media",
          media_url: "https://youtu.be/abcdefghijk",
          caption: null,
        },
        ...document.sections.slice(1),
      ],
    });
    expect(
      withoutCommunityFunnelMediaSections(legacyDocument).sections.some(
        (section) => section.type === "media",
      ),
    ).toBe(false);
  });

  it("rejects oversized section contents instead of silently truncating them", () => {
    const document = buildCommunityFunnelDocumentTestFixture();
    expect(() =>
      validateCommunityFunnelDocumentV1({
        ...document,
        sections: [
          document.sections[0],
          {
            id: "benefits",
            type: "benefits",
            heading: "Benefits",
            items: Array.from({ length: 5 }, (_, index) => ({
              title: `Benefit ${index + 1}`,
              body: "Bounded benefit",
            })),
          },
          document.sections[1],
        ],
      }),
    ).toThrow("community_funnel_benefits_limit_exceeded");
  });

  it("normalizes two custom slots without duplicating legacy singleton state", () => {
    const customOne = buildCommunityFunnelDocumentTestFixture({
      headline: "Custom one",
    });
    const customTwo = buildCommunityFunnelDocumentTestFixture({
      headline: "Custom two",
    });
    const normalized = normalizeCommunityFunnelManagerConfig({
      active_slot: "custom_2",
      draft_document_v1: customOne,
      draft_revision: 3,
      custom_funnels: {
        custom_1: {
          slot: "custom_1",
          draft_document_v1: customOne,
          draft_revision: 3,
        },
        custom_2: {
          slot: "custom_2",
          draft_document_v1: customTwo,
          draft_revision: 7,
          published_document_v1: customTwo,
          published_draft_revision: 7,
        },
      },
    });

    expect(normalized.active_slot).toBe("custom_2");
    expect(normalized.draft_document_v1).toEqual(customOne);
    expect(normalized.custom_funnels.custom_1?.draft_revision).toBe(3);
    expect(normalized.custom_funnels.custom_2?.draft_revision).toBe(7);
    expect(
      normalized.custom_funnels.custom_2?.published_document_v1,
    ).toEqual(customTwo);
  });
});
