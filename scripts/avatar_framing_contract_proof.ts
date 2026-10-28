import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  computeCoverFrameLayout,
  focusFromCoverFramePosition,
} from "../shared/coverFrameUi.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function assertNearlyEqual(actual: number, expected: number, label: string) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} != ${expected}`);
}

const coverFrame = read("shared/coverFrameUi.ts");
const imageResource = read("shared/useImageResource.ts");
const imageVisibilityObserver = read("shared/imageVisibilityObserver.ts");
const stableMedia = read("shared/StableFramedMedia.tsx");
const stableAvatar = read("shared/StableAvatar.tsx");
const userAvatar = read("shared/UserAvatar.tsx");
const communityAvatar = read("shared/CommunityAvatar.tsx");
const userEditor = read("apps/web/src/components/WebUserAvatarEditorModal.tsx");
const communityEditor = read("apps/web/src/components/WebCommunityAvatarEditorModal.tsx");
const bannerEditor = read("apps/web/src/components/WebCommunityBannerEditorModal.tsx");
const communityNav = read("shared/CommunityNav.tsx");
const discoverCard = read("shared/DiscoverCommunityCard.tsx");
const communitySettings = read("apps/web/src/components/WebCommunitySettingsSection.tsx");
const profileSettings = read("apps/web/src/components/WebProfileSettingsSection.tsx");
const onboardingPage = read("apps/web/src/components/WebOnboardingPage.tsx");
const communityPresenceFacepile = read("apps/web/src/components/CommunityPresenceFacepile.tsx");
const memberAvatarStack = read("apps/web/src/components/MemberAvatarStack.tsx");
const communityFunnelMemberProof = read("apps/web/src/components/CommunityFunnelMemberProof.tsx");
const communityDirectoryGateway = read("shared/cloudCommunityDirectoryGateway.ts");
const communityTypes = read("shared/communityTypes.ts");
const baseCss = [
  read("apps/web/src/base.css"),
  read("apps/web/src/styles/shell-and-onboarding.css"),
  read("apps/web/src/styles/community-and-content.css"),
  read("apps/web/src/styles/settings-runtime-and-theme-overrides.css"),
].join("\n");

for (const retiredPath of [
  "shared/avatarUi.ts",
  "shared/communityAvatarUi.ts",
  "shared/communityBannerUi.ts",
  "shared/useImageUrlReady.ts",
]) {
  assert.equal(existsSync(retiredPath), false, `${retiredPath} must stay deleted`);
}

assert.match(coverFrame, /export function computeCoverFrameLayout/);
assert.match(coverFrame, /export function focusFromCoverFramePosition/);
assert.match(coverFrame, /export function getCoverFrameImageStyle/);
assert.match(imageResource, /Map<string, ImageResource>/, "resource cache must retain natural dimensions");
assert.match(imageResource, /image\.naturalWidth/);
assert.match(imageResource, /image\.naturalHeight/);
assert.match(imageResource, /export class ImageResourceCache/);
assert.match(imageResource, /current\.url === url \? current : cache\.getState\(url\)/);
assert.match(imageResource, /image\.decode\(\)\.then\(\(\) => finish\(resource\)\)\.catch\(\(\) => finish\(null\)\)/);
assert.match(stableMedia, /useImageResource\(url, \{/);
assert.match(stableMedia, /enabled: shouldLoad/);
assert.match(stableMedia, /isImageLoadAllowed\(url, loading, loadPermission\)/);
assert.match(stableMedia, /observeImageNearViewport\(root/);
assert.match(imageVisibilityObserver, /let sharedRegistry: ImageVisibilityRegistry \| null = null/);
assert.match(imageVisibilityObserver, /rootMargin: "400px 0px"/);
assert.match(stableMedia, /computeCoverFrameLayout\(\{/);
assert.match(stableMedia, /\{showImage && layout \? \(/, "an image must not paint before geometry exists");
assert.match(stableMedia, /\.\.\.getCoverFrameImageStyle\(layout\)/);
assert.doesNotMatch(stableMedia, /onLoad=/, "rendered media must use the preloaded dimensions");
assert.doesNotMatch(
  stableMedia,
  /position:\s*props\.style\?\.position\s*\?\?\s*"relative"/,
  "canonical media must not override caller-owned root positioning",
);
assert.match(baseCss, /:where\(\.stable-framed-media\)\s*\{[\s\S]*position:\s*relative;/);
assert.match(stableAvatar, /<StableFramedMedia/);
assert.match(stableAvatar, /loading\?: "eager" \| "lazy"/);
assert.match(stableAvatar, /fetchPriority\?: ImageFetchPriority/);
assert.match(
  communityFunnelMemberProof,
  /<MemberAvatarStack/,
  "funnel member proof must use the canonical member avatar stack",
);
assert.match(
  communityPresenceFacepile,
  /<MemberAvatarStack/,
  "community presence must use the canonical member avatar stack",
);
assert.match(
  memberAvatarStack,
  /className="member-avatar-stack-face"/,
  "the canonical member avatar stack must own avatar presentation",
);
assert.doesNotMatch(
  communityFunnelMemberProof,
  /imageClassName="community-funnel-face-image"/,
  "funnel member proof must not replace canonical avatar image geometry",
);
assert.doesNotMatch(
  communityFunnelMemberProof,
  /\.community-funnel-face(?:pile|-image)?\b/,
  "funnel member proof must not recreate a custom facepile or avatar crop",
);
assert.match(
  communityAvatar,
  /className=\{`community-avatar-frame \$\{props\.className\}`\}/,
  "every community avatar must receive the canonical visual frame",
);
assert.match(
  baseCss,
  /\.community-avatar-frame\s*\{[\s\S]*?border-radius:\s*var\(--radius-sm\);/,
  "the canonical community avatar frame must own the shared shape",
);
assert.match(
  communityAvatar,
  /\["community-avatar-frame-fallback", props\.fallbackClassName\]/,
  "every community avatar fallback must receive the canonical presentation",
);
assert.match(
  baseCss,
  /\.community-avatar-frame-fallback\s*\{/,
  "community avatar fallbacks must have one canonical CSS owner",
);

for (const [label, source] of [
  ["user avatar", userAvatar],
  ["community avatar", communityAvatar],
] as const) {
  assert.match(source, /imageFrame=\{\{/, `${label} must use the canonical frame`);
  assert.doesNotMatch(source, /objectPosition|transform:/, `${label} must not own crop math`);
}

for (const [label, source] of [
  ["user editor", userEditor],
  ["community editor", communityEditor],
  ["banner editor", bannerEditor],
] as const) {
  assert.match(source, /computeCoverFrameLayout\(\{/, `${label} must use canonical layout math`);
  assert.match(source, /focusFromCoverFramePosition\(/, `${label} must use canonical focus math`);
  assert.match(source, /getCoverFrameImageStyle\(layout\)/, `${label} must use canonical image geometry`);
  assert.doesNotMatch(source, /onLoad=/, `${label} must not paint before natural dimensions are known`);
}

for (const [label, source] of [
  ["community nav banner", communityNav],
  ["discover banner", discoverCard],
  ["settings banner", communitySettings],
] as const) {
  assert.match(source, /<StableFramedMedia/, `${label} must use canonical framed media`);
  assert.doesNotMatch(source, /getCommunityBannerImageStyle/, `${label} must not own crop math`);
}

const frame = { focusX: 0.37, focusY: 0.43, zoom: 1.35 };
const small = computeCoverFrameLayout({
  viewportWidth: 24,
  viewportHeight: 24,
  naturalWidth: 1200,
  naturalHeight: 800,
  ...frame,
});
const large = computeCoverFrameLayout({
  viewportWidth: 60,
  viewportHeight: 60,
  naturalWidth: 1200,
  naturalHeight: 800,
  ...frame,
});
assert.ok(small && large);
assertNearlyEqual(small.renderWidth / 24, large.renderWidth / 60, "avatar width ratio");
assertNearlyEqual(small.renderHeight / 24, large.renderHeight / 60, "avatar height ratio");
assertNearlyEqual(small.left / 24, large.left / 60, "avatar horizontal crop ratio");
assertNearlyEqual(small.top / 24, large.top / 60, "avatar vertical crop ratio");
const roundTrip = focusFromCoverFramePosition(small, small.left, small.top);
assertNearlyEqual(roundTrip.focusX, frame.focusX, "focus x round trip");
assertNearlyEqual(roundTrip.focusY, frame.focusY, "focus y round trip");

const bannerSmall = computeCoverFrameLayout({
  viewportWidth: 300,
  viewportHeight: 100,
  naturalWidth: 1600,
  naturalHeight: 900,
  ...frame,
});
const bannerLarge = computeCoverFrameLayout({
  viewportWidth: 600,
  viewportHeight: 200,
  naturalWidth: 1600,
  naturalHeight: 900,
  ...frame,
});
assert.ok(bannerSmall && bannerLarge);
assertNearlyEqual(bannerSmall.left / 300, bannerLarge.left / 600, "banner horizontal crop ratio");
assertNearlyEqual(bannerSmall.top / 100, bannerLarge.top / 200, "banner vertical crop ratio");

assert.match(profileSettings, /WebUserAvatarEditorModal/);
assert.match(onboardingPage, /WebAccountSetupForm/);
assert.match(read("apps/web/src/components/WebAccountSetupForm.tsx"), /WebUserAvatarEditorModal/);
assert.doesNotMatch(profileSettings, /WebCommunityAvatarEditorModal/);
assert.doesNotMatch(onboardingPage, /WebCommunityAvatarEditorModal/);
assert.match(
  communityTypes,
  /export type CommunityDirectoryMember = \{[\s\S]*avatar_focus_x\?: number \| null;[\s\S]*avatar_focus_y\?: number \| null;[\s\S]*avatar_zoom\?: number \| null;/,
);
assert.match(communityDirectoryGateway, /CloudCommunityDirectoryMemberRow = CommunityDirectoryMember/);

assert.doesNotMatch(
  baseCss,
  /\.community-context-(?:face|member-avatar) img\s*\{/,
  "community context CSS must not override canonical media geometry",
);
assert.match(
  baseCss,
  /\.member-avatar-stack-face \+ \.member-avatar-stack-face\s*\{[\s\S]*margin-left:\s*calc\(var\(--member-avatar-stack-face-size\) \* -0\.22\)/,
  "the canonical facepile must overlap by a proportional amount",
);
assert.match(
  memberAvatarStack,
  /style=\{\{ zIndex: visibleFaces\.length - index \}\}/,
  "the leftmost face must remain visually highest",
);
for (const [label, selector] of [
  ["community rail", "community-rail-avatar"],
  ["discover", "discover-card-avatar"],
  ["profile community", "community-profile-panel-community-avatar"],
] as const) {
  const rule = baseCss.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  assert.ok(rule, `${label} avatar surface rule must exist`);
  assert.doesNotMatch(
    rule,
    /border-radius|box-shadow|background:|(?:^|[;\s])border:/,
    `${label} must not override canonical community avatar presentation`,
  );
}
assert.match(baseCss, /\.profile-avatar-drop\s*\{[\s\S]*?border-radius:\s*50%;/);
assert.match(baseCss, /\.member-avatar\s*\{[\s\S]*?border-radius:\s*999px;/);

console.log("avatar framing contract proof passed");
