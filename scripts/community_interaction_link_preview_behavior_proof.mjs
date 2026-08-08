import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  extractInteractionOEmbedDiscoveryUrl,
  interactionOEmbedResponseUrlIsAllowed,
  interactionPreviewOpenGraphFallback,
  interactionXStatusIdentity,
  interactionXSyndicationResponseUrlIsAllowed,
  interactionXSyndicationUrl,
  normalizeInteractionOEmbedPreview,
} from "../api/source-url-preview.mjs";
import { approvedXAvatarSourceUrl } from "../api/x-avatar.js";
import { communityInteractionFaviconCandidates } from "../shared/communityInteractionFavicon.ts";
import { interactionPresentationForEmbeds } from "../shared/communityInteractionLinkPresentation.ts";
import {
  INTERACTION_EMBED_REFRESH_SUCCESS_MS,
  interactionEmbedPreviewIsStale,
  interactionXStatusIdentity as sharedInteractionXStatusIdentity,
} from "../shared/interactionEmbedPreviewContract.ts";

const previewCss = [
  readFileSync(new URL("../apps/web/src/base.css", import.meta.url), "utf8"),
  readFileSync(
    new URL("../apps/web/src/styles/community-and-content.css", import.meta.url),
    "utf8",
  ),
].join("\n");
const previewComponent = readFileSync(
  new URL("../apps/web/src/components/CommunityInteractionLinkPreview.tsx", import.meta.url),
  "utf8",
);
const interactionFunctions = readFileSync(
  new URL("../convex/communityInteractions.ts", import.meta.url),
  "utf8",
);
const avatarProxy = readFileSync(new URL("../api/x-avatar.js", import.meta.url), "utf8");
const socialPreviewComponent = previewComponent.slice(
  previewComponent.indexOf("function SocialPostLinkPreview"),
  previewComponent.indexOf("function GenericLinkPreview"),
);
const genericPreviewComponent = previewComponent.slice(
  previewComponent.indexOf("function GenericLinkPreview"),
  previewComponent.indexOf("export function CommunityInteractionLinkPreview"),
);

const loomSourceUrl = "https://www.loom.com/share/29f6556e6f6849609b0225fbbc6224ff";
assert.deepEqual(
  communityInteractionFaviconCandidates("https://www.polynet.ai/c/polynet/chat"),
  ["https://www.polynet.ai/favicon.ico", "https://polynet.ai/favicon.ico"],
  "website icons should try the exact source origin before one bounded parent-domain fallback",
);
assert.deepEqual(
  communityInteractionFaviconCandidates("https://surface.powershift.io/proof"),
  ["https://surface.powershift.io/favicon.ico", "https://powershift.io/favicon.ico"],
  "app subdomains should be able to fall back to the parent brand favicon",
);
assert.deepEqual(
  communityInteractionFaviconCandidates("https://tenant.co.uk/proof"),
  ["https://tenant.co.uk/favicon.ico"],
  "common country-code second-level domains should not be mistaken for a parent brand host",
);
assert.deepEqual(communityInteractionFaviconCandidates("http://polynet.ai"), []);
assert.deepEqual(communityInteractionFaviconCandidates("https://localhost/proof"), []);
assert.deepEqual(communityInteractionFaviconCandidates("https://127.0.0.1/proof"), []);
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
const freshnessNow = Date.UTC(2026, 6, 18, 12);
assert.equal(interactionEmbedPreviewIsStale(freshnessNow - INTERACTION_EMBED_REFRESH_SUCCESS_MS + 1, freshnessNow), false);
assert.equal(interactionEmbedPreviewIsStale(freshnessNow - INTERACTION_EMBED_REFRESH_SUCCESS_MS, freshnessNow), true);
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
assert.deepEqual(interactionXStatusIdentity(xSourceUrl), {
  statusId: "2075857952792047708",
  handle: "mathelirium",
});
assert.equal(interactionXStatusIdentity("https://x.com.evil.example/mathelirium/status/2075857952792047708"), null);
assert.equal(interactionXStatusIdentity("https://x.com/mathelirium/status/2075857952792047708/photo/1"), null);
assert.deepEqual(sharedInteractionXStatusIdentity(xSourceUrl), interactionXStatusIdentity(xSourceUrl));
assert.equal(
  sharedInteractionXStatusIdentity("https://x.com/mathelirium/status/2075857952792047708/photo/1"),
  null,
  "broker and browser/cloud exact X URL validators should stay behaviorally aligned",
);
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
    created_at: "Thu Jul 16 15:00:00 +0000 2026",
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
assert.equal(xPreview.preview_provider, "x");
assert.equal(xPreview.preview_provider_post_id, "2075857952792047708");
assert.equal(xPreview.preview_published_at, Date.parse("Thu Jul 16 15:00:00 +0000 2026"));
assert.equal(xPreview.preview_post_context, "post");
assert.equal(xPreview.preview_author_name, "Mathelirium");
assert.equal(xPreview.preview_author_handle, "mathelirium");
assert.equal(xPreview.preview_author_avatar, "https://pbs.twimg.com/profile_images/1234/avatar_normal.jpg");
assert.match(xPreview.preview_description, /^A Neural Sheet Learns the Shape of a Brain/);
assert.doesNotMatch(xPreview.preview_description, /t\.co|pic\.x\.com/);
assert.equal(xPreview.preview_image, null, "attached X media should not enter the compact post card");
assert.doesNotMatch(JSON.stringify(xPreview), /blockquote|iframe|widgets\.js/);

const replyPreview = normalizeInteractionOEmbedPreview({
  sourceUrl: xSourceUrl,
  openGraph: { og_title: null, og_description: null, og_image: null, og_image_alt: null },
  oEmbed: null,
  syndication: {
    id_str: "2075857952792047708",
    text: "safe\u202espoof\u2066 text",
    in_reply_to_status_id_str: "2070000000000000000",
    user: { name: "Safe\u202e Name", screen_name: "mathelirium" },
  },
});
assert.equal(replyPreview.preview_post_context, "reply");
assert.equal(replyPreview.preview_description, "safespoof text");
assert.equal(replyPreview.preview_author_name, "Safe Name");

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
assert.ok(
  approvedXAvatarSourceUrl("https://pbs.twimg.com/profile_images/1234/avatar_normal.jpg"),
  "the same-origin avatar proxy should accept only the exact X profile-image shape",
);
assert.equal(approvedXAvatarSourceUrl("https://pbs.twimg.com/media/tracking.jpg"), null);
assert.equal(approvedXAvatarSourceUrl("https://attacker.example/profile_images/1234/avatar.jpg"), null);
assert.equal(approvedXAvatarSourceUrl("https://pbs.twimg.com/profile_images/1234/avatar.svg"), null);
assert.match(
  avatarProxy,
  /MAX_AVATAR_BYTES = 1_000_000[\s\S]*dns\.promises\.lookup[\s\S]*hostname: pinnedAddress[\s\S]*servername: X_AVATAR_HOST[\s\S]*response\.headers\.location[\s\S]*ALLOWED_CONTENT_TYPES\.has\(contentType\)[\s\S]*X-Content-Type-Options[\s\S]*nosniff/,
  "the avatar proxy should pin public DNS, reject redirects and unexpected MIME types, bound bytes, and disable sniffing",
);
assert.doesNotMatch(avatarProxy, /\bfetch\s*\(/, "the avatar proxy must not re-resolve provider DNS through fetch");

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
    preview_provider: null,
    preview_provider_post_id: null,
    preview_published_at: null,
    preview_post_context: null,
    preview_author_name: null,
    preview_author_handle: null,
    preview_author_avatar: null,
    preview_title: "Article title",
    preview_description: "Article description",
    preview_image: null,
    preview_image_alt: null,
    preview_video_url: null,
    preview_resolver_version: 4,
  },
  "ordinary pages should keep compact metadata without persisting ephemeral Open Graph images",
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
  /\.community-interaction-embeds\s*\{[\s\S]*--community-interaction-embed-max-width:\s*420px;[\s\S]*--community-interaction-embed-row-height:\s*104px;[\s\S]*--community-interaction-embed-compact-height:\s*64px;[\s\S]*--community-interaction-embed-media-width:\s*140px;[\s\S]*\.community-interaction-embed-summary\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) var\(--community-interaction-embed-media-width\);[\s\S]*\.community-interaction-embed\.is-compact-link\s*\{[\s\S]*min-height:\s*var\(--community-interaction-embed-compact-height\);[\s\S]*grid-template-columns:\s*24px minmax\(0,\s*1fr\);/,
  "video previews should retain their rich row while every generic website card uses a compact favicon row",
);
assert.doesNotMatch(
  previewCss,
  /\.community-interaction-embed\.is-link\.has-media/,
  "generic website media styling should remain deleted",
);
assert.match(
  previewComponent,
  /function GenericLinkFavicon[\s\S]*communityInteractionFaviconCandidates\(props\.href\)[\s\S]*community-interaction-embed-favicon[\s\S]*referrerPolicy="no-referrer"[\s\S]*onError=[\s\S]*<Globe2[\s\S]*function GenericLinkPreview[\s\S]*is-link is-compact-link[\s\S]*data-preview-density="compact"[\s\S]*community-interaction-embed-compact-meta/,
  "compact website cards should use bounded favicon candidates, a non-broken fallback, and two-line metadata",
);
assert.match(
  previewComponent,
  /function useVideoThumbnailFallback[\s\S]*failedThumbnailUrl[\s\S]*usableThumbnailUrl[\s\S]*onThumbnailError[\s\S]*function VideoLinkPreview[\s\S]*onError=\{onThumbnailError\}/,
  "thumbnail failure state should be scoped exclusively to explicit video previews",
);
assert.doesNotMatch(
  genericPreviewComponent,
  /has-media|community-interaction-embed-media|mediaUrl|usableMediaUrl|onMediaError|onError=/,
  "generic website cards should have no asynchronous media-density branch",
);
assert.match(
  interactionFunctions,
  /image_url:\s*row\.previewKind === "video" \? row\.imageUrl \?\? null : null,[\s\S]*image_alt:\s*row\.previewKind === "video" \? row\.imageAlt \?\? null : null,[\s\S]*video_url:\s*row\.previewKind === "video" \? row\.videoUrl \?\? null : null,/,
  "cloud projection should suppress stale generic media metadata from existing rows",
);
assert.match(
  interactionFunctions,
  /const resolvedPreviewKind = args\.previewKind \?\? "link";[\s\S]*imageUrl:\s*resolvedPreviewKind === "video"[\s\S]*imageAlt:\s*resolvedPreviewKind === "video"[\s\S]*imageUrl:[\s\S]*previewKind === "video"[\s\S]*sanitizeEmbedImageUrl/,
  "cloud enrichment should retain image metadata only for explicit video previews",
);
assert.match(
  previewCss,
  /\.community-interaction-embed\.is-social-post\s*\{[\s\S]*max-width:\s*var\(--community-interaction-social-max-width\);[\s\S]*padding:\s*12px 14px 14px;[\s\S]*border-color:\s*var\(--community-social-embed-stroke\);[\s\S]*background:\s*var\(--community-social-embed-surface\);[\s\S]*\.community-interaction-embed-social-avatar\s*\{[\s\S]*width:\s*32px;[\s\S]*background:\s*var\(--community-social-embed-avatar-surface\);[\s\S]*\.community-interaction-embed-social-body\s*\{[\s\S]*color:\s*var\(--community-social-embed-text\);[\s\S]*font-size:\s*14px;[\s\S]*-webkit-line-clamp:\s*5;/,
  "X previews should use a compact identity-and-text card whose first-party shell is theme-aware",
);
assert.match(
  previewCss,
  /:root\s*\{[\s\S]*--community-social-embed-surface:\s*#000;[\s\S]*--community-social-embed-surface-hover:\s*#080808;[\s\S]*--community-social-embed-stroke:\s*#2f3336;[\s\S]*--community-social-embed-text:\s*#e7e9ea;[\s\S]*:root\[data-theme="light"\]\s*\{[\s\S]*--community-social-embed-surface:\s*var\(--surface-card\);[\s\S]*--community-social-embed-surface-hover:\s*var\(--surface-card-hover\);[\s\S]*--community-social-embed-stroke:\s*var\(--stroke-default\);[\s\S]*--community-social-embed-text:\s*var\(--text-ink-primary\);/,
  "Dark should preserve the existing X shell while Light remaps it onto canonical light-theme tokens",
);
assert.match(
  socialPreviewComponent,
  /function SocialPostLinkPreview[\s\S]*author_avatar_url[\s\S]*<a[\s\S]*data-preview-kind="social_post"[\s\S]*target="_blank"[\s\S]*community-interaction-embed-social-avatar[\s\S]*community-interaction-embed-social-identity[\s\S]*published_at[\s\S]*X snapshot[\s\S]*community-interaction-embed-social-body[\s\S]*<\/a>/,
  "X previews should be one safe primary link containing proxied identity, provenance, and post text",
);
assert.match(
  previewComponent,
  /function approvedXAvatarUrl[\s\S]*pbs\.twimg\.com[\s\S]*\/api\/x-avatar\?url=/,
  "X avatars should reach the browser only through the bounded same-origin proxy",
);
assert.doesNotMatch(
  socialPreviewComponent,
  /community-interaction-embed-media|community-interaction-embed-social-mark|iframe|replies|Copy link|favorite_count|conversation_count|BadgeCheck/,
  "compact X cards should omit attached media, provider marks, and action chrome",
);
assert.match(
  previewComponent,
  /interactionXStatusIdentity\(href\)[\s\S]*provider === "x"[\s\S]*provider_post_id === xIdentity\.statusId/,
  "the browser should independently require matching exact X post provenance before using X styling",
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
