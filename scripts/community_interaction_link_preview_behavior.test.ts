// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { InteractionContent } from "../apps/web/src/components/communityInteractionFeed";
import { DeferredYouTubeEmbed } from "../apps/web/src/components/DeferredYouTubeEmbed";
import {

  parseEmbedUrl,
  parseYouTubeEmbedUrl,
  renderTextWithLinks,
  youTubeEmbedsInText,
} from "../shared/linkEmbedUi";

const requireFromWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { createElement } = requireFromWeb("react") as typeof import("react");
const { renderToStaticMarkup } = requireFromWeb("react-dom/server") as typeof import("react-dom/server");

function renderInteraction(text: string): string {
  return renderToStaticMarkup(
    createElement(InteractionContent, {
      text,
      renderTextWithLinks,
    }),
  );
}

describe("community interaction link presentation", () => {
  it.each([
    "https://meet.google.com/abc-defg-hij",
    "https://us05web.zoom.us/j/89423453054",
    "https://share.descript.com/view/example",
    "https://x.com/polynet/status/1234567890",
    "https://www.loom.com/share/29f6556e6f6849609b0225fbbc6224ff",
  ])("keeps an ordinary provider as one visible blue link: %s", (url) => {
    const markup = renderInteraction(`Open ${url}`);
    expect(markup).toContain('class="chat-link"');
    expect(markup).toContain(url);
    expect(markup).not.toContain("deferred-youtube");
    expect(markup).not.toContain("community-interaction-embed");
  });

  it("keeps the YouTube link visible and adds one deterministic player", () => {
    const url = "https://youtu.be/M7lc1UVf-VE?t=42";
    const markup = renderInteraction(`Watch this\n${url}`);
    expect(markup).toContain('class="chat-link"');
    expect(markup).toContain(url.replaceAll("&", "&amp;"));
    expect(markup).toContain('data-community-youtube-embed="M7lc1UVf-VE"');
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("message-video-caption");
    expect(markup).not.toContain("<iframe");
  });

  it("embeds each YouTube video while preserving every authored link", () => {
    const first = "https://www.youtube.com/watch?v=M7lc1UVf-VE";
    const second = "https://youtu.be/dQw4w9WgXcQ";
    const markup = renderInteraction(`${first}\n${second}`);
    expect(markup.match(/class="chat-link"/g)).toHaveLength(2);
    expect(markup.match(/data-community-youtube-embed=/g)).toHaveLength(2);
    expect(markup).toContain('data-community-youtube-embed="M7lc1UVf-VE"');
  });

  it("deduplicates video aliases and keeps the first timestamp", () => {
    const videos = youTubeEmbedsInText("https://youtu.be/M7lc1UVf-VE?t=42 https://www.youtube.com/watch?v=M7lc1UVf-VE https://youtu.be/dQw4w9WgXcQ");
    expect(videos).toHaveLength(2);
    expect(videos[0]?.embed.src).toContain("start=42");
  });

  it("ignores YouTube URLs inside inline and fenced code", () => {
    expect(youTubeEmbedsInText("`https://youtu.be/M7lc1UVf-VE`")).toEqual([]);
    expect(youTubeEmbedsInText("```\nhttps://youtu.be/M7lc1UVf-VE\n```")).toEqual([]);
  });

  it("rejects lookalike hosts and unsafe YouTube URLs", () => {
    expect(parseYouTubeEmbedUrl("https://evilyoutube.com/watch?v=M7lc1UVf-VE")).toBeNull();
    expect(parseYouTubeEmbedUrl("https://evil.youtube.com/watch?v=M7lc1UVf-VE")).toBeNull();
    expect(parseYouTubeEmbedUrl("http://youtube.com/watch?v=M7lc1UVf-VE")).toBeNull();
    expect(parseYouTubeEmbedUrl("https://user:pass@youtube.com/watch?v=M7lc1UVf-VE")).toBeNull();
    expect(parseEmbedUrl("https://fakevimeo.com/123456789")).toBeNull();
    expect(parseEmbedUrl("https://evilwistia.com/medias/abc123def")).toBeNull();
  });

  it("keeps start time and reserves native player space before viewport loading", () => {
    const resolved = parseYouTubeEmbedUrl("https://youtu.be/M7lc1UVf-VE?t=1m2s");
    expect(resolved?.src).toBe("https://www.youtube.com/embed/M7lc1UVf-VE?start=62");
    const markup = renderToStaticMarkup(
      createElement(DeferredYouTubeEmbed, { embed: resolved! }),
    );
    expect(markup).toContain("Watch on YouTube");
    expect(markup).toContain("t=62");
    expect(markup).not.toContain("<button");
  });
});

describe("Descript video links", () => {
  it("plays share and embed links in Descript's embed player", () => {
    expect(parseEmbedUrl("https://share.descript.com/view/42pEyvI1VyH")).toEqual({ provider: "descript", id: "42pEyvI1VyH", src: "https://share.descript.com/embed/42pEyvI1VyH" });
    expect(parseEmbedUrl("https://share.descript.com/embed/42pEyvI1VyH")?.provider).toBe("descript");
    expect(parseEmbedUrl("https://descript.com/view/42pEyvI1VyH")).toBeNull();
  });
});
