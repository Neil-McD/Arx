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
const rail = read("apps/web/src/components/WebDesktopCommunityRail.tsx");
const discoverCard = read("shared/DiscoverCommunityCard.tsx");
const profilePanel = read("apps/web/src/components/WebCommunityProfilePanel.tsx");
const mobileShell = read("apps/web/src/components/WebMobileCommunityShell.tsx");
const mobileTopBar = read("apps/web/src/components/WebMobileTopBar.tsx");
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

console.log("community visual identity contract proof passed");
