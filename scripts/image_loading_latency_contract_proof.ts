import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const discoverController = read("shared/useWebDiscoverController.ts");
const funnelActions = read("apps/web/src/controllers/useWebPublicFunnelActions.ts");
const stableMedia = read("shared/StableFramedMedia.tsx");
const imageResource = read("shared/useImageResource.ts");
const discoverCard = read("shared/DiscoverCommunityCard.tsx");
const communityNav = read("shared/CommunityNav.tsx");
const facepile = read("apps/web/src/components/CommunityPresenceFacepile.tsx");
const discoverBanner = discoverCard.match(
  /<StableFramedMedia\b(?=[^>]*className="discover-card-banner")[^>]*\/>/,
)?.[0] ?? "";
const discoverAvatar = discoverCard.match(
  /<CommunityAvatar\b(?=[^>]*className="discover-card-avatar")[^>]*\/>/,
)?.[0] ?? "";

assert.doesNotMatch(
  discoverController,
  /preloadImageUrls/,
  "Discover data must not wait on or eagerly start an arbitrary image batch",
);
assert.doesNotMatch(
  funnelActions,
  /await preloadImageUrls/,
  "the public funnel must never withhold resolved data behind image loading",
);
assert.match(
  funnelActions,
  /void preloadImageUrls\(revealImageUrls, \{[\s\S]{0,160}fetchPriority: "high"/,
  "the public funnel may warm its bounded above-fold image set without blocking presentation",
);

assert.match(stableMedia, /observeImageNearViewport\(root/);
assert.match(stableMedia, /enabled: shouldLoad/);
assert.match(stableMedia, /fetchPriority: props\.fetchPriority/);
assert.match(imageResource, /if \(!url \|\| !enabled \|\| imageResourceCache\.getReady\(url\)\) return;/);
assert.match(imageResource, /image\.fetchPriority = fetchPriority/);

assert.match(
  discoverBanner,
  /loading="lazy"/,
  "Discover banners must be visibility-gated and low priority",
);
assert.match(
  discoverBanner,
  /fetchPriority="low"/,
  "Discover banners must be visibility-gated and low priority",
);
assert.match(
  discoverAvatar,
  /loading="lazy"/,
  "Discover avatars must use the same deferred canonical path",
);
assert.match(
  discoverAvatar,
  /fetchPriority="low"/,
  "Discover avatars must use the same deferred canonical path",
);
assert.match(
  communityNav,
  /className="community-nav-banner has-image"[\s\S]{0,500}loading="eager"[\s\S]{0,80}fetchPriority="high"/,
  "the active community banner must remain eager and high priority",
);
assert.match(
  read("apps/web/src/components/MemberAvatarStack.tsx"),
  /loading=\{props\.imageLoading \?\? "eager"\}[\s\S]{0,120}fetchPriority=\{index === 0 && props\.imageLoading !== "lazy" \? "high" : "auto"\}/,
  "visible presence faces must load eagerly with one highest-priority identity",
);


console.log("image loading latency contract proof passed");
