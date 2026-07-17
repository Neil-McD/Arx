import assert from "node:assert/strict";

import {
  extractInteractionOEmbedDiscoveryUrl,
  interactionPreviewOpenGraphFallback,
  normalizeInteractionOEmbedPreview,
} from "../api/source-url-preview.mjs";
import { interactionPresentationForEmbeds } from "../shared/communityInteractionLinkPresentation.ts";

const loomSourceUrl = "https://www.loom.com/share/29f6556e6f6849609b0225fbbc6224ff";
const loomDiscovery = extractInteractionOEmbedDiscoveryUrl(
  `<html><head>
    <link rel="alternate" type="application/json+oembed"
      href="https://www.loom.com/v1/oembed?url=https%3A%2F%2Fwww.loom.com%2Fshare%2F29f6556e6f6849609b0225fbbc6224ff&amp;format=json">
    <meta property="og:title" content="Polynet - 17 July 2026">
    <meta property="og:description" content="Use Loom to record quick videos of your screen and cam.">
    <meta property="og:image" content="https://cdn.loom.com/assets/img/og/loom-banner.png">
  </head></html>`,
  loomSourceUrl,
);
assert.ok(loomDiscovery, "Loom oEmbed discovery should resolve");
assert.equal(new URL(loomDiscovery).hostname, "www.loom.com");
assert.equal(new URL(loomDiscovery).searchParams.get("format"), "json");
assert.equal(new URL(loomDiscovery).searchParams.get("maxwidth"), "550");

const loomPreview = normalizeInteractionOEmbedPreview({
  sourceUrl: loomSourceUrl,
  openGraph: {
    og_title: "Polynet - 17 July 2026",
    og_description: "Use Loom to record quick videos of your screen and cam.",
    og_image: "https://cdn.loom.com/assets/img/og/loom-banner.png",
    og_image_alt: null,
  },
  oEmbed: {
    type: "video",
    title: "Polynet - 17 July 2026",
    author_name: "Neil",
    thumbnail_url: "https://cdn.loom.com/sessions/thumbnails/recording.gif",
    html: '<iframe src="https://www.loom.com/embed/29f6556e6f6849609b0225fbbc6224ff"></iframe>',
  },
});
assert.equal(loomPreview.preview_kind, "video");
assert.equal(loomPreview.preview_title, "Polynet - 17 July 2026");
assert.equal(loomPreview.preview_description, null, "video metadata should discard Loom marketing copy");
assert.equal(loomPreview.preview_image, "https://cdn.loom.com/sessions/thumbnails/recording.gif");
assert.equal(
  loomPreview.preview_video_url,
  "https://www.loom.com/embed/29f6556e6f6849609b0225fbbc6224ff",
);

const xSourceUrl = "https://x.com/mathelirium/status/2075857952792047708?s=46&t=tracking";
const xDiscovery = extractInteractionOEmbedDiscoveryUrl(
  `<link rel="alternate" type="application/json+oembed"
    href="https://publish.x.com/oembed?url=https%3A%2F%2Fx.com%2Fmathelirium%2Fstatus%2F2075857952792047708">`,
  xSourceUrl,
);
assert.ok(xDiscovery, "X oEmbed discovery should resolve");
assert.equal(new URL(xDiscovery).searchParams.get("omit_script"), "true");
assert.equal(new URL(xDiscovery).searchParams.get("dnt"), "true");
assert.equal(new URL(xDiscovery).searchParams.get("hide_thread"), "true");

const xPreview = normalizeInteractionOEmbedPreview({
  sourceUrl: xSourceUrl,
  openGraph: {
    og_title: "Mathelirium (@mathelirium) on X",
    og_description: null,
    og_image: "https://pbs.twimg.com/media/brain.jpg",
    og_image_alt: "A neural sheet learning a brain shape",
  },
  oEmbed: {
    type: "rich",
    author_name: "Mathelirium",
    html: '<blockquote class="twitter-tweet"><p lang="en">A Neural Sheet Learns the Shape of a Brain<br><br>This time, the self-organizing map learns the geometry of a brain. <a href="https://t.co/media">pic.x.com/media</a></p><script src="https://platform.x.com/widgets.js"></script></blockquote>',
  },
});
assert.equal(xPreview.preview_kind, "social_post");
assert.equal(xPreview.preview_author_name, "Mathelirium");
assert.match(xPreview.preview_description, /^A Neural Sheet Learns the Shape of a Brain/);
assert.equal(xPreview.preview_image, "https://pbs.twimg.com/media/brain.jpg");
assert.doesNotMatch(JSON.stringify(xPreview), /blockquote|iframe|widgets\.js/);

const youtubePreview = normalizeInteractionOEmbedPreview({
  sourceUrl: "https://www.youtube.com/watch?v=M7lc1UVf-VE",
  openGraph: { og_title: "Demo", og_description: null, og_image: null, og_image_alt: null },
  oEmbed: {
    type: "video",
    title: "YouTube API Demo",
    author_name: "Google Developers",
    thumbnail_url: "https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg",
    html: '<iframe src="https://www.youtube.com/embed/M7lc1UVf-VE"></iframe>',
  },
});
assert.equal(youtubePreview.preview_kind, "video");
assert.equal(youtubePreview.preview_video_url, "https://www.youtube.com/embed/M7lc1UVf-VE");

assert.equal(
  extractInteractionOEmbedDiscoveryUrl(
    '<link rel="alternate" type="application/json+oembed" href="https://attacker.example/oembed?url=x">',
    loomSourceUrl,
  ),
  null,
  "cross-provider discovery endpoints must fail closed",
);
assert.equal(
  normalizeInteractionOEmbedPreview({
    sourceUrl: loomSourceUrl,
    openGraph: { og_title: "Fallback", og_description: "Description", og_image: null, og_image_alt: null },
    oEmbed: {
      type: "video",
      title: "Unsafe",
      html: '<iframe src="https://attacker.example/embed"></iframe>',
    },
  }).preview_kind,
  "link",
  "unapproved player origins must degrade to link previews",
);

assert.deepEqual(
  interactionPreviewOpenGraphFallback({
    og_title: "Article title",
    og_description: "Article description",
    og_image: "https://news.example.com/hero.jpg",
    og_image_alt: "Article hero",
  }),
  {
    preview_kind: "link",
    preview_author_name: null,
    preview_title: "Article title",
    preview_description: "Article description",
    preview_image: "https://news.example.com/hero.jpg",
    preview_image_alt: "Article hero",
    preview_video_url: null,
    preview_resolver_version: 2,
  },
  "ordinary pages should retain a stable Open Graph fallback",
);

const readyXEmbed = {
  embed_kind: "link",
  status: "ready",
  source_url: xSourceUrl,
  normalized_source_url: xSourceUrl,
};
assert.deepEqual(
  interactionPresentationForEmbeds(
    "Shared in context:\nhttps://twitter.com/mathelirium/status/2075857952792047708?t=tracking&s=46",
    [readyXEmbed],
  ),
  {
    bodySegments: [
      { type: "text", text: "Shared in context:" },
      { type: "embed", embed: readyXEmbed },
    ],
    trailingEmbeds: [],
  },
  "X host aliases and share-tracking parameters should not leave a duplicate standalone URL",
);

const timedVideoEmbed = {
  embed_kind: "link",
  status: "ready",
  source_url: "https://www.youtube.com/watch?v=M7lc1UVf-VE&t=42",
  normalized_source_url: "https://www.youtube.com/watch?v=M7lc1UVf-VE&t=42",
};
assert.deepEqual(
  interactionPresentationForEmbeds("https://www.youtube.com/watch?v=M7lc1UVf-VE&t=7", [timedVideoEmbed]),
  {
    bodySegments: [{ type: "text", text: "https://www.youtube.com/watch?v=M7lc1UVf-VE&t=7" }],
    trailingEmbeds: [timedVideoEmbed],
  },
  "content-bearing video start parameters must remain significant",
);

console.log("PASS: interaction link previews prefer safe content-specific objects over platform marketing cards");
