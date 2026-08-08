import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const communityCore = read("convex/communityCore.ts");
const communityAdmin = read("convex/communityAdmin.ts");
const communityPublic = read("convex/communityPublic.ts");
const profileRelationships = read("convex/profileRelationshipCore.ts");
const registry = read("shared/CommunityVisualIdentityRegistry.tsx");
const accessController = read("shared/useWebCommunityAccessController.ts");
const discoverController = read("shared/useWebDiscoverController.ts");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const memberAgentDock = read("apps/web/src/components/WebMemberAgentDock.tsx");
const rail = read("apps/web/src/components/WebDesktopCommunityRail.tsx");
const discoverCard = read("shared/DiscoverCommunityCard.tsx");
const profilePanel = read("apps/web/src/components/WebCommunityProfilePanel.tsx");
const mobileShell = read("apps/web/src/components/WebMobileCommunityShell.tsx");
const mobileTopBar = read("apps/web/src/components/WebMobileTopBar.tsx");
const communityNav = read("shared/CommunityNav.tsx");
const shellCss = read("apps/web/src/styles/shell-and-onboarding.css");
const webCss = read("apps/web/src/index.css");
const css = read("apps/web/src/styles/community-and-content.css");

assert.match(communityCore, /export function buildCommunityVisualIdentity/);
assert.match(communityCore, /export function nextCommunityBrandingRevision/);
for (const [label, source] of [
  ["membership", communityAdmin],
  ["discover", communityPublic],
  ["profile relationship", profileRelationships],
] as const) {
  assert.match(
    source,
    /visual_identity:\s*buildCommunityVisualIdentity\(community, branding\)/,
    `${label} must publish the canonical visual identity`,
  );
}

assert.match(registry, /mergeCommunityVisualIdentity\(existing, incoming\)/);
assert.match(accessController, /onVisualIdentitiesLoaded/);
assert.match(discoverController, /onVisualIdentitiesLoaded/);
assert.match(chatPanel, /upsertCommunityVisualIdentities/);

for (const [label, source] of [
  ["rail", rail],
  ["member agent dock", memberAgentDock],
  ["discover", discoverCard],
  ["profile", profilePanel],
  ["mobile selector", mobileShell],
  ["mobile top bar", mobileTopBar],
] as const) {
  assert.match(source, /communityId=/, `${label} must select by immutable community id`);
  assert.match(source, /visualIdentity=/, `${label} must provide canonical identity fallback`);
}

assert.match(
  css,
  /\.community-avatar-frame > img/,
  "community avatar image presentation must have one canonical CSS owner",
);
assert.doesNotMatch(
  css,
  /\.discover-card-avatar(?:\s+img|-image)\s*\{/,
  "Discover must not retain a surface-owned community avatar image rule",
);

assert.match(
  communityNav,
  /const activeCommunityBannerUrl = activeCommunity\?\.banner_url\?\.trim\(\) \|\| null;/,
  "community navigation should normalize an absent banner to no rendered media",
);
assert.match(
  communityNav,
  /\{activeCommunityBannerUrl \? \([\s\S]*?className="community-nav-header"[\s\S]*?imageUrl=\{activeCommunityBannerUrl\}[\s\S]*?\) : null\}/,
  "community navigation should reserve banner space only when a banner URL exists",
);
assert.match(
  shellCss,
  /\.community-nav-banner\s*\{[^}]*width:\s*100%;[^}]*height:\s*auto;[^}]*aspect-ratio:\s*2\.84 \/ 1;/,
  "community banners should preserve the established wide Polynet ratio while scaling",
);
assert.match(
  webCss,
  /\.product-shell-surface--community > \.community-nav \.community-nav-header\s*\{[^}]*margin:\s*-12px -12px 0;/,
  "desktop community banners should extend through the navigation padding to the shell edges",
);
assert.match(
  webCss,
  /\.product-shell-surface--community > \.community-nav \.community-nav-banner\s*\{[^}]*border-radius:\s*0;/,
  "the shell should own the outer banner corner clipping",
);
assert.match(
  communityNav,
  /className=\{`community-nav-identity\$\{activeCommunityBannerUrl \? " has-banner" : ""\}\$\{!activeCommunityBannerUrl \|\| isCommunityIdentityCondensed \? " is-condensed" : ""\}`\}/,
  "community navigation should use one identity row across banner and condensed states",
);
assert.match(
  communityNav,
  /aria-label=\{`Open \$\{activeCommunityName\} settings`\}/,
  "the community identity row should expose the authorized settings action",
);
assert.match(
  communityNav,
  /bannerBottom <= navTop \+ COMMUNITY_IDENTITY_HEIGHT_PX/,
  "the identity surface should condense only after the banner leaves its sticky row",
);
assert.doesNotMatch(
  communityNav,
  /title="Settings"/,
  "community settings should not remain duplicated in the lower management list",
);
assert.match(
  shellCss,
  /\.community-nav-identity\s*\{[^}]*position:\s*sticky;[^}]*min-height:\s*44px;[^}]*background:\s*var\(--surface-nav, var\(--surface-panel\)\);/,
  "the identity row should remain sticky and resolve to the canonical navigation surface",
);
assert.match(
  shellCss,
  /\.community-nav-identity\.has-banner:not\(\.is-condensed\)\s*\{[^}]*color:\s*#fff;[^}]*background:\s*rgba\(0, 0, 0, 0\.28\);/,
  "banner identity text should have a persistent readable scrim before hover",
);
assert.match(
  webCss,
  /\.community-nav-identity\.has-banner \+ \.community-nav-header\s*\{[^}]*margin-top:\s*-44px;/,
  "the banner should scale behind the identity row without adding height",
);

console.log("community visual identity contract proof passed");
