import { describe, expect, it } from "vitest";

import { buildCommunityFunnelRenderModel } from "../shared/communityFunnelUi";

const published = {
  version: 2 as const,
  headline: " Build together ",
  subheadline: " A focused operator community. ",
  pillars: [
    { title: "Think", body: "Share context." },
    { title: "Remember", body: "Keep what matters." },
    { title: "Act", body: "Move together." },
  ],
  long_form_markdown: "## A durable practice\n\nUseful context compounds.",
};

describe("buildCommunityFunnelRenderModel", () => {
  it("keeps the deterministic community profile live until custom is explicit", () => {
    expect(
      buildCommunityFunnelRenderModel({
        communityName: "Operators",
        oneLiner: "The operating room for builders.",
        about: "Work through real problems together.",
        funnel: { live_mode: "default", published_content_v2: published },
      }),
    ).toEqual({
      mode: "default",
      headline: "The operating room for builders.",
      subheadline: null,
      pillars: [],
      longFormMarkdown: "Work through real problems together.",
      vslUrl: null,
    });
  });

  it("falls back to community identity when optional profile copy is empty", () => {
    expect(
      buildCommunityFunnelRenderModel({ communityName: " Operators ", oneLiner: " ", about: null }),
    ).toMatchObject({ mode: "default", headline: "Operators", subheadline: null });
  });

  it("projects only the explicitly published custom snapshot", () => {
    expect(
      buildCommunityFunnelRenderModel({
        communityName: "Operators",
        funnel: {
          live_mode: "custom",
          published_vsl_url: " https://youtube.com/watch?v=published ",
          hero_media_url: "https://youtube.com/watch?v=legacy",
          hero_media_kind: "video",
          published_content_v2: published,
        },
      }),
    ).toEqual({
      mode: "custom",
      headline: "Build together",
      subheadline: "A focused operator community.",
      pillars: published.pillars,
      longFormMarkdown: published.long_form_markdown,
      vslUrl: "https://youtube.com/watch?v=published",
    });
  });

  it("uses the legacy published video only when no V2 VSL is present", () => {
    expect(
      buildCommunityFunnelRenderModel({
        communityName: "Operators",
        funnel: {
          live_mode: "custom",
          hero_media_url: "https://vimeo.com/123",
          hero_media_kind: "video",
          published_content_v2: published,
        },
      }).vslUrl,
    ).toBe("https://vimeo.com/123");
  });
});
