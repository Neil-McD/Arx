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
const contextPanel = read("apps/web/src/components/CommunityContextPanel.tsx");
const facepile = read("apps/web/src/components/CommunityPresenceFacepile.tsx");

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
  discoverCard,
  /className="discover-card-banner"[\s\S]{0,300}loading="lazy"[\s\S]{0,80}fetchPriority="low"/,
  "Discover banners must be visibility-gated and low priority",
);
assert.match(
  discoverCard,
  /<CommunityAvatar[\s\S]{0,500}loading="lazy"[\s\S]{0,80}fetchPriority="low"/,
  "Discover avatars must use the same deferred canonical path",
);
assert.match(
  communityNav,
  /className=\{`community-nav-banner[\s\S]{0,500}loading="eager"[\s\S]{0,80}fetchPriority="high"/,
  "the active community banner must remain eager and high priority",
);
assert.match(
  facepile,
  /loading="eager"[\s\S]{0,100}fetchPriority=\{index === 0 \? "high" : "auto"\}/,
  "visible presence faces must load eagerly with one highest-priority identity",
);
assert.match(
  contextPanel,
  /loading=\{isOnline \? "eager" : "lazy"\}[\s\S]{0,100}fetchPriority=\{isOnline \? "auto" : "low"\}/,
  "offline member avatars must not contend with visible online identities",
);

console.log("image loading latency contract proof passed");
