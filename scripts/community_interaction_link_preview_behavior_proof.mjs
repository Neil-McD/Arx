import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  extractInteractionOEmbedDiscoveryUrl,
  interactionOEmbedResponseUrlIsAllowed,
  interactionPreviewOpenGraphFallback,
  interactionXSyndicationResponseUrlIsAllowed,
  interactionXSyndicationUrl,
  normalizeInteractionOEmbedPreview,
} from "../api/source-url-preview.mjs";
import { interactionPresentationForEmbeds } from "../shared/communityInteractionLinkPresentation.ts";

const previewCss = readFileSync(new URL("../apps/web/src/base.css", import.meta.url), "utf8");
const previewComponent = readFileSync(
  new URL("../apps/web/src/components/CommunityInteractionLinkPreview.tsx", import.meta.url),
  "utf8",
);
const interactionFunctions = readFileSync(
  new URL("../convex/communityInteractions.ts", import.meta.url),
  "utf8",
);
const socialPreviewComponent = previewComponent.slice(
  previewComponent.indexOf("function SocialPostLinkPreview"),
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
const xSyndicationUrl = interactionXSyndicationUrl(xSourceUrl);
assert.ok(xSyndicationUrl, "X syndication metadata should resolve from a validated status URL");
assert.equal(new URL(xSyndicationUrl).hostname, "cdn.syndication.twimg.com");
assert.equal(new URL(xSyndicationUrl).searchParams.get("id"), "2075857952792047708");
assert.equal(
  interactionXSyndicationResponseUrlIsAllowed(xSourceUrl, xSyndicationUrl),
  true,
  "X syndication responses should stay on the fixed provider endpoint and status ID",
);
assert.equal(
  interactionXSyndicationResponseUrlIsAllowed(
    xSourceUrl,
    "https://attacker.example/tweet-result?id=2075857952792047708",
  ),
  false,
);

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
  syndication: {
    id_str: "2075857952792047708",
    text: "A Neural Sheet Learns the Shape of a Brain\n\nThis time, the self-organizing map learns the geometry of a brain. https://t.co/media",
    display_text_range: [0, 111],
    user: {
      name: "Mathelirium",
      screen_name: "mathelirium",
      is_blue_verified: true,
      profile_image_url_https: "https://pbs.twimg.com/profile_images/1234/avatar_normal.jpg",
    },
  },
});
assert.equal(xPreview.preview_kind, "social_post");
assert.equal(xPreview.preview_author_name, "Mathelirium");
assert.equal(xPreview.preview_author_handle, "mathelirium");
assert.equal(xPreview.preview_author_avatar, "https://pbs.twimg.com/profile_images/1234/avatar_normal.jpg");
assert.equal(xPreview.preview_author_verified, true);
assert.match(xPreview.preview_description, /^A Neural Sheet Learns the Shape of a Brain/);
assert.doesNotMatch(xPreview.preview_description, /t\.co|pic\.x\.com/);
assert.equal(xPreview.preview_image, null, "attached X media should not enter the compact post card");
assert.doesNotMatch(JSON.stringify(xPreview), /blockquote|iframe|widgets\.js/);

const invalidAvatarPreview = normalizeInteractionOEmbedPreview({
  sourceUrl: xSourceUrl,
  openGraph: { og_title: null, og_description: null, og_image: null, og_image_alt: null },
  oEmbed: null,
  syndication: {
    id_str: "2075857952792047708",
    text: "Safe post text",
    user: {
      name: "Mathelirium",
      screen_name: "mathelirium",
      profile_image_url_https: "https://attacker.example/tracking-pixel.png",
    },
  },
});
assert.equal(invalidAvatarPreview.preview_kind, "social_post");
assert.equal(
  invalidAvatarPreview.preview_author_avatar,
  null,
  "X author avatars must stay on the provider profile-image path",
);

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
    preview_author_handle: null,
    preview_author_avatar: null,
    preview_author_verified: null,
    preview_title: "Article title",
    preview_description: "Article description",
    preview_image: "https://news.example.com/hero.jpg",
    preview_image_alt: "Article hero",
    preview_video_url: null,
    preview_resolver_version: 3,
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
  /\.community-interaction-embeds\s*\{[\s\S]*--community-interaction-embed-max-width:\s*420px;[\s\S]*--community-interaction-embed-row-height:\s*104px;[\s\S]*--community-interaction-embed-media-width:\s*140px;[\s\S]*--community-interaction-social-max-width:\s*460px;[\s\S]*\.community-interaction-embed-summary,[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) var\(--community-interaction-embed-media-width\);/,
  "video and generic link previews should retain their compact metadata-left and media-right row",
);
assert.match(
  previewCss,
  /\.community-interaction-embed\.is-social-post\s*\{[\s\S]*max-width:\s*var\(--community-interaction-social-max-width\);[\s\S]*padding:\s*12px 14px 14px;[\s\S]*background:\s*#000;[\s\S]*\.community-interaction-embed-social-avatar\s*\{[\s\S]*width:\s*32px;[\s\S]*\.community-interaction-embed-social-body\s*\{[\s\S]*font-size:\s*14px;[\s\S]*-webkit-line-clamp:\s*5;/,
  "X previews should use a compact black identity-and-text card",
);
assert.match(
  socialPreviewComponent,
  /function SocialPostLinkPreview[\s\S]*author_avatar_url[\s\S]*<a[\s\S]*data-preview-kind="social_post"[\s\S]*target="_blank"[\s\S]*community-interaction-embed-social-avatar[\s\S]*community-interaction-embed-social-identity[\s\S]*community-interaction-embed-social-body[\s\S]*<\/a>/,
  "X previews should be one safe primary link containing only identity and post text",
);
assert.doesNotMatch(
  socialPreviewComponent,
  /community-interaction-embed-media|community-interaction-embed-social-mark|iframe|Reply|replies|Copy link|favorite_count|conversation_count/,
  "compact X cards should omit attached media, provider marks, and action chrome",
);
assert.doesNotMatch(
  previewComponent,
  /dangerouslySetInnerHTML|platform\.x\.com\/widgets\.js|createTweet/,
  "X cards must not inject provider markup or load the oversized third-party widget",
);
assert.match(
  interactionFunctions,
  /function sanitizeXAuthorAvatarUrl[\s\S]*hostname\.toLowerCase\(\) === "pbs\.twimg\.com"[\s\S]*\^\\\/profile_images\\\/[\s\S]*const authorAvatarUrl = sanitizeXAuthorAvatarUrl/,
  "the cloud boundary should independently constrain X avatars to provider profile images",
);
assert.match(
  previewComponent,
  /function VideoPreviewMetadata[\s\S]*community-interaction-embed-video-link[\s\S]*community-interaction-embed-provider-row[\s\S]*className="community-interaction-embed-summary"[\s\S]*<VideoPreviewMetadata[\s\S]*className="community-interaction-embed-play"/,
  "video previews should keep one muted source link beside the right-side play target",
);

console.log("PASS: interaction link previews prefer safe content-specific objects over platform marketing cards");
