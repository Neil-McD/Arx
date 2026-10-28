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
const communityAgentDock = read("apps/web/src/components/WebCommunityAgentDock.tsx");
const rail = read("apps/web/src/components/WebCommunityRail.tsx");
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
  shellCss,
  /\.community-nav\s*\{[^}]*container-name:\s*community-navigation;[^}]*container-type:\s*inline-size;/,
  "community navigation should expose its actual inline size to responsive banner framing",
);
assert.match(
  shellCss,
  /@container community-navigation \(max-width:\s*280px\)\s*\{[\s\S]*?\.community-nav-banner\s*\{[^}]*height:\s*98\.6px;[^}]*aspect-ratio:\s*auto;/,
  "narrow community navigation should preserve the threshold banner height while contracting horizontally",
);
assert.doesNotMatch(
  shellCss,
  /@container community-navigation \(max-width:\s*280px\)\s*\{[\s\S]*?\.community-nav-banner\s*\{[^}]*height:\s*(?:clamp|min|max|calc)\([^;}]*cqi/,
  "narrow community navigation must not make banner height depend on the contracting inline size",
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
  /<Settings size=\{20\} strokeWidth=\{1\.8\}/,
  "the community settings wheel should be legible at the banner corner",
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
  /\.community-nav-identity\s*\{[^}]*padding:\s*0 4px 0 12px;/,
  "the community identity action should sit close to the banner's right edge",
);
assert.match(
  shellCss,
  /\.community-nav-identity\.has-banner:not\(\.is-condensed\)::before,[\s\S]*?\.community-nav-identity\.has-banner:not\(\.is-condensed\)::after\s*\{[^}]*inset:\s*0 0 -18px;[^}]*z-index:\s*0;[^}]*background:\s*linear-gradient\([\s\S]*?rgba\(0, 0, 0, 0\) 100%/,
  "banner identity scrims should extend below the row and dissolve into the artwork",
);
assert.match(
  shellCss,
  /\.community-nav-identity\.has-banner:not\(\.is-condensed\) > \*\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*1;/,
  "banner identity content should remain above the interactive veil",
);
assert.match(
  shellCss,
  /\.community-nav-identity\.has-banner:not\(\.is-condensed\) \.community-nav-settings svg\s*\{[^}]*filter:\s*drop-shadow\(0 1px 2px rgba\(0, 0, 0, 0\.82\)\);/,
  "the banner settings wheel should retain contrast over bright artwork",
);
assert.match(
  shellCss,
  /\.community-nav-identity\.has-banner:not\(\.is-condensed\):hover::after,[\s\S]*?\.community-nav-identity\.has-banner:not\(\.is-condensed\):focus-within::after\s*\{[^}]*opacity:\s*1;/,
  "hover and keyboard focus should reveal the stronger banner identity veil",
);
assert.match(
  shellCss,
  /\.community-nav-identity:not\(\.has-banner\) \+ \.community-channel-list\s*\{[^}]*margin-top:\s*20px;/,
  "communities without banners should keep the first channel clear of the identity row",
);
assert.match(
  webCss,
  /\.product-shell-surface--community > \.community-nav\s*\{[^}]*padding-top:\s*0;/,
  "the desktop community identity should seat against the shell's top edge",
);
assert.match(
  webCss,
  /\.product-shell-surface--community > \.community-nav \.community-nav-identity:not\(\.has-banner\)\s*\{[^}]*flex:\s*0 0 var\(--web-topbar-height,\s*48px\);[^}]*min-height:\s*var\(--web-topbar-height,\s*48px\);[^}]*height:\s*var\(--web-topbar-height,\s*48px\);/,
  "desktop communities without banners should align their identity divider to the channel header",
);
assert.match(
  webCss,
  /\.community-nav-identity\.has-banner \+ \.community-nav-header\s*\{[^}]*margin-top:\s*-44px;/,
  "the banner should scale behind the identity row without adding height",
);

console.log("community visual identity contract proof passed");
