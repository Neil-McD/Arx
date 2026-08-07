// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { CommunityInteractionLinkPreview } from "../apps/web/src/components/CommunityInteractionLinkPreview";
import type { CommunityInteractionEmbed } from "../shared/cloudCommunityInteractionsGateway";

const requireFromWeb = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const { createElement } = requireFromWeb("react") as typeof import("react");
const { renderToStaticMarkup } = requireFromWeb(
  "react-dom/server",
) as typeof import("react-dom/server");

function embed(
  overrides: Partial<CommunityInteractionEmbed>,
): CommunityInteractionEmbed {
  return {
    id: "embed-1",
    embed_kind: "link",
    status: "ready",
    visibility_scope: "community",
    source_url: "https://example.com/article",
    normalized_source_url: "https://example.com/article",
    workspace_ref_kind: null,
    workspace_ref_id: null,
    preview_kind: "link",
    author_name: null,
    author_handle: null,
    author_avatar_url: null,
    provider: "example.com",
    provider_post_id: null,
    published_at: null,
    post_context: null,
    title: "Example article",
    description: "A compact link preview",
    image_url: null,
    image_alt: null,
    video_url: null,
    resolver_version: 4,
    fetched_at: "2026-08-04T23:00:00.000Z",
    error: null,
    ...overrides,
  };
}

describe("CommunityInteractionLinkPreview", () => {
  it.each(["pending", "failed"] as const)(
    "renders the compact generic shell while enrichment is %s",
    (status) => {
      const url = "https://us05web.zoom.us/j/89423453054";
      const markup = renderToStaticMarkup(
        createElement(CommunityInteractionLinkPreview, {
          embed: embed({
            status,
            source_url: url,
            normalized_source_url: url,
            provider: "us05web.zoom.us",
            preview_kind: null,
            title: null,
            description: null,
          }),
        }),
      );

      expect(markup).toContain('data-preview-kind="link"');
      expect(markup).toContain('data-preview-density="compact"');
      expect(markup).toContain("us05web.zoom.us");
      expect(markup).not.toContain("web-skeleton-pill");
    },
  );

  it("renders a generic website compactly from first paint even when stale image metadata exists", () => {
    const staleThumbnail = "https://storage.googleapis.com/expired-descript-thumbnail.jpg";
    const markup = renderToStaticMarkup(
      createElement(CommunityInteractionLinkPreview, {
        embed: embed({
          source_url: "https://share.descript.com/view/yzRCVpFoueC",
          normalized_source_url: "https://share.descript.com/view/yzRCVpFoueC",
          provider: "share.descript.com",
          title: "Quick Recording - Descript",
          image_url: staleThumbnail,
          image_alt: "Recording thumbnail",
        }),
      }),
    );

    expect(markup).toContain('data-preview-kind="link"');
    expect(markup).toContain('data-preview-density="compact"');
    expect(markup).not.toContain("has-media");
    expect(markup).not.toContain("community-interaction-embed-media");
    expect(markup).not.toContain(staleThumbnail);
  });

  it("retains a thumbnail shell for an approved explicit video preview", () => {
    const thumbnail = "https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg";
    const markup = renderToStaticMarkup(
      createElement(CommunityInteractionLinkPreview, {
        embed: embed({
          source_url: "https://www.youtube.com/watch?v=M7lc1UVf-VE",
          normalized_source_url: "https://www.youtube.com/watch?v=M7lc1UVf-VE",
          preview_kind: "video",
          provider: "youtube.com",
          title: "YouTube API Demo",
          image_url: thumbnail,
          video_url: "https://www.youtube.com/embed/M7lc1UVf-VE",
        }),
      }),
    );

    expect(markup).toContain('data-preview-kind="video"');
    expect(markup).toContain("community-interaction-embed-media");
    expect(markup).toContain(thumbnail);
  });
});
