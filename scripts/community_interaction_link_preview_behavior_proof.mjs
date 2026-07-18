import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  extractInteractionOEmbedDiscoveryUrl,
  interactionOEmbedResponseUrlIsAllowed,
  interactionPreviewOpenGraphFallback,
  normalizeInteractionOEmbedPreview,
} from "../api/source-url-preview.mjs";
import { interactionPresentationForEmbeds } from "../shared/communityInteractionLinkPresentation.ts";

const previewCss = readFileSync(new URL("../apps/web/src/base.css", import.meta.url), "utf8");
const previewComponent = readFileSync(
  new URL("../apps/web/src/components/CommunityInteractionLinkPreview.tsx", import.meta.url),
  "utf8",
);
const socialPreviewComponent = previewComponent.slice(
  previewComponent.indexOf("function SocialPostFallback"),
  previewComponent.indexOf("function GenericLinkPreview"),
);

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
assert.equal(
  interactionOEmbedResponseUrlIsAllowed(loomSourceUrl, "https://www.loom.com/v1/oembed?url=proof"),
  true,
);
assert.equal(
  interactionOEmbedResponseUrlIsAllowed(loomSourceUrl, "https://attacker.example/oembed?url=proof"),
  false,
  "oEmbed redirects must remain on an endpoint host approved for the source provider",
);

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
assert.equal(new URL(xDiscovery).searchParams.get("hide_media"), "true");

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
    url: "https://x.com/mathelirium/status/2075857952792047708",
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
const loomCompactFallback = normalizeInteractionOEmbedPreview({
  sourceUrl: loomSourceUrl,
  openGraph: {
    og_title: "Polynet - 17 July 2026",
    og_description: "Use Loom to record quick videos of your screen and cam.",
    og_image: "https://cdn.loom.com/assets/img/og/loom-banner.png",
    og_image_alt: "Loom marketing banner",
  },
  oEmbed: {
    type: "video",
    title: "Unsafe path",
    html: '<iframe src="https://www.loom.com/account/settings"></iframe>',
  },
});
assert.equal(loomCompactFallback.preview_kind, "link");
assert.equal(loomCompactFallback.preview_title, "Polynet - 17 July 2026");
assert.equal(loomCompactFallback.preview_description, null);
assert.equal(loomCompactFallback.preview_image, null);

const mismatchedXPreview = normalizeInteractionOEmbedPreview({
  sourceUrl: xSourceUrl,
  openGraph: {
    og_title: "Mathelirium on X",
    og_description: "Actual post copy",
    og_image: "https://abs.twimg.com/marketing.png",
    og_image_alt: "X marketing image",
  },
  oEmbed: {
    type: "rich",
    url: "https://x.com/attacker/status/9999999999999999999",
    author_name: "Attacker",
    html: "<p>Spoofed post</p>",
  },
});
assert.equal(mismatchedXPreview.preview_kind, "link");
assert.equal(mismatchedXPreview.preview_description, "Actual post copy");
assert.equal(mismatchedXPreview.preview_image, null);
assert.doesNotThrow(() =>
  normalizeInteractionOEmbedPreview({
    sourceUrl: xSourceUrl,
    openGraph: { og_title: null, og_description: null, og_image: null, og_image_alt: null },
    oEmbed: {
      type: "rich",
      url: "https://x.com/mathelirium/status/2075857952792047708",
      author_name: "Mathelirium",
      html: "<p>Malformed numeric entity: &#999999999;</p>",
    },
  }),
  "malformed provider entities should degrade to bounded text instead of throwing",
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
assert.deepEqual(
  interactionPresentationForEmbeds(
    "Wild: https://twitter.com/mathelirium/status/2075857952792047708?s=46",
    [readyXEmbed],
  ),
  {
    bodySegments: [
      { type: "text", text: "Wild:" },
      { type: "embed", embed: readyXEmbed },
    ],
    trailingEmbeds: [],
  },
  "a ready card should replace its matching bare URL at the end of a caption line",
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

assert.match(
  previewCss,
  /\.community-interaction-embeds\s*\{[\s\S]*--community-interaction-embed-max-width:\s*420px;[\s\S]*--community-interaction-embed-row-height:\s*104px;[\s\S]*--community-interaction-embed-media-width:\s*140px;[\s\S]*--community-interaction-social-max-width:\s*500px;[\s\S]*--community-interaction-social-min-height:\s*112px;[\s\S]*\.community-interaction-embed-summary,[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) var\(--community-interaction-embed-media-width\);/,
  "video and generic link previews should retain their compact metadata-left and media-right row",
);
assert.match(
  previewCss,
  /\.community-interaction-embed\.is-social-post\s*\{[\s\S]*max-width:\s*var\(--community-interaction-social-max-width\);[\s\S]*grid-template-rows:\s*auto 1fr;[\s\S]*\.community-interaction-embed-social-header\s*\{[\s\S]*border-bottom:\s*1px solid var\(--stroke-default\);[\s\S]*\.community-interaction-embed-social-body\s*\{[\s\S]*font-size:\s*14px;[\s\S]*-webkit-line-clamp:\s*5;/,
  "social fallback previews should retain the readable stacked identity-header and text-body card",
);
assert.match(
  socialPreviewComponent,
  /function SocialPostFallback[\s\S]*<a[\s\S]*target="_blank"[\s\S]*community-interaction-embed-social-header[\s\S]*community-interaction-embed-social-body[\s\S]*<\/a>[\s\S]*function SocialPostLinkPreview[\s\S]*data-preview-kind="social_post"[\s\S]*data-native-state=[\s\S]*community-interaction-embed-social-native[\s\S]*<SocialPostFallback/,
  "X previews should retain one immediate readable fallback while the official post renderer loads",
);
assert.doesNotMatch(
  socialPreviewComponent,
  /<img|mediaUrl|community-interaction-embed-media/,
  "the Polynet fallback should not render attached provider media",
);
assert.match(
  previewComponent,
  /const X_WIDGETS_SCRIPT_URL = "https:\/\/platform\.x\.com\/widgets\.js";[\s\S]*function xPostIdFromUrl[\s\S]*host !== "x\.com" && host !== "twitter\.com"[\s\S]*\[0-9\]\{1,24\}[\s\S]*function loadXWidgets[\s\S]*X_WIDGETS_LOAD_TIMEOUT_MS[\s\S]*existing instanceof HTMLScriptElement/,
  "official X posts should load lazily from a fixed provider script with a validated numeric post ID and compact privacy-aware options",
);
assert.match(
  socialPreviewComponent,
  /IntersectionObserver[\s\S]*createTweet\?\.\(postId, target, \{[\s\S]*cards: "hidden"[\s\S]*conversation: "none"[\s\S]*dnt: true[\s\S]*theme: "dark"/,
  "native X rendering should defer until near the viewport and use compact privacy-aware options",
);
assert.match(
  socialPreviewComponent,
  /const failNative = \(\) => \{[\s\S]*target\.replaceChildren\(\);[\s\S]*setNativeFailed\(true\);[\s\S]*window\.setTimeout\(failNative, X_WIDGETS_RENDER_TIMEOUT_MS\)[\s\S]*nativeFailed \? "failed"/,
  "deleted or provider-blocked X posts should resolve to the readable fallback instead of loading forever",
);
assert.doesNotMatch(
  previewComponent,
  /dangerouslySetInnerHTML/,
  "provider oEmbed HTML must never be injected into the Polynet document",
);
assert.match(
  previewCss,
  /\.community-interaction-embed-social-shell\s*\{[\s\S]*max-width:\s*var\(--community-interaction-social-max-width\);[\s\S]*\.community-interaction-embed-social-native\s*\{[\s\S]*visibility:\s*hidden;[\s\S]*\.community-interaction-embed-social-native\.is-ready\s*\{[\s\S]*visibility:\s*visible;[\s\S]*\.community-interaction-embed-social-native iframe\s*\{[\s\S]*max-width:\s*100% !important;/,
  "the native X renderer should stay bounded and hidden until the provider confirms a rendered post",
);
assert.match(
  previewComponent,
  /function VideoPreviewMetadata[\s\S]*community-interaction-embed-video-link[\s\S]*community-interaction-embed-provider-row[\s\S]*className="community-interaction-embed-summary"[\s\S]*<VideoPreviewMetadata[\s\S]*className="community-interaction-embed-play"/,
  "video previews should keep one muted source link beside the right-side play target",
);

console.log("PASS: interaction link previews prefer safe content-specific objects over platform marketing cards");
