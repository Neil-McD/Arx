import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const feed = read("apps/web/src/components/communityInteractionFeed.tsx");
const youtube = read("apps/web/src/components/DeferredYouTubeEmbed.tsx");
const css = [
  read("apps/web/src/base.css"),
  read("apps/web/src/styles/community-and-content.css"),
  read("apps/web/src/styles/settings-runtime-and-theme-overrides.css"),
  read("apps/web/src/styles/message-media.css"),
].join("\n");
const controller = read("apps/web/src/controllers/useWebCommunityInteractionProjection.ts");
const interactions = read("convex/communityInteractions.ts");
const crons = read("convex/crons.ts");
const fetcher = read("api/source-url-fetch.js");
const contract = read("docs/community-interaction-substrate-contract-v1.md");

assert.match(feed, /<InteractionBody[\s\S]*<MessageLinkMedia text=\{props\.text\}/);
const media = read("apps/web/src/components/MessageLinkMedia.tsx");
assert.match(media, /youTubeEmbedsInText\(text\)/);
assert.match(media, /pdfLinksInText\(text\)/);
assert.match(media, /<DeferredYouTubeEmbed/);
assert.doesNotMatch(youtube, /showMetadata|loadYouTubeMetadata|<button|<img|autoplay", "1/);
assert.doesNotMatch(feed, /CommunityInteractionLinkPreview|GenericLinkPreview|SocialPostLinkPreview|EmbedCards/);
assert.match(youtube, /data-community-youtube-embed[\s\S]*loading="lazy"[\s\S]*sandbox=/);
assert.match(css, /--chat-link:\s*var\(--accent-cyan\)/);
assert.match(css, /\.chat-link\s*\{[\s\S]*color:\s*var\(--chat-link\)/);
assert.match(css, /\.deferred-youtube \{[^}]*min-height: 200px;[^}]*aspect-ratio: 16 \/ 9/);
assert.doesNotMatch(css, /community-interaction-youtube-wrap|message-video-caption|deferred-youtube-play/);
assert.doesNotMatch(css, /\.community-interaction-embed(?:\s|[.:,{])/);
assert.doesNotMatch(controller, /optimisticLinkEmbeds|pending-link:/);
assert.doesNotMatch(interactions, /enrichInteractionEmbed|scheduleEmbedEnrichment|preview_mode: "interaction_embed_v2"/);
assert.doesNotMatch(crons, /refresh due community interaction previews|communityInteractionEmbedRefresh/);
assert.doesNotMatch(fetcher, /interaction_embed_v2|resolveInteractionEmbedPreview|source-url-preview/);
assert.match(contract, /ordinary links render as authored blue links/);
assert.match(contract, /YouTube videos and explicit HTTPS PDF links/);

for (const removed of [
  "apps/web/src/components/CommunityInteractionLinkPreview.tsx",
  "shared/communityInteractionLinkPresentation.ts",
  "shared/communityInteractionFavicon.ts",
  "shared/interactionEmbedPreviewContract.ts",
  "convex/communityInteractionEmbedRefresh.ts",
  "api/source-url-preview.mjs",
  "api/x-avatar.js",
  "shared/youtubeMetadata.ts",
]) {
  assert.equal(existsSync(new URL(`../${removed}`, import.meta.url)), false, `${removed} should be deleted`);
}

console.log("PASS: community chat shares native YouTube and PDF reading while ordinary links remain simple");
