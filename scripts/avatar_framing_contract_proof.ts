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
const communityContextPanel = read("apps/web/src/components/CommunityContextPanel.tsx");
const communityPresenceFacepile = read("apps/web/src/components/CommunityPresenceFacepile.tsx");
const communityDirectoryGateway = read("shared/cloudCommunityDirectoryGateway.ts");
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
assert.match(imageResource, /failedResources\.add\(url\)/);
assert.match(stableMedia, /useImageResource\(url\)/);
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
assert.match(onboardingPage, /WebUserAvatarEditorModal/);
assert.doesNotMatch(profileSettings, /WebCommunityAvatarEditorModal/);
assert.doesNotMatch(onboardingPage, /WebCommunityAvatarEditorModal/);
assert.match(
  communityDirectoryGateway,
  /avatar_focus_x\?: number \| null;[\s\S]*avatar_focus_y\?: number \| null;[\s\S]*avatar_zoom\?: number \| null;/,
);
assert.match(
  communityContextPanel,
  /imageUrl=\{member\.avatar_url\}[\s\S]*focusX=\{member\.avatar_focus_x\}[\s\S]*focusY=\{member\.avatar_focus_y\}[\s\S]*zoom=\{member\.avatar_zoom\}/,
);
assert.doesNotMatch(
  baseCss,
  /\.community-context-(?:face|member-avatar) img\s*\{/,
  "community context CSS must not override canonical media geometry",
);
assert.match(
  baseCss,
  /\.community-context-face \+ \.community-context-face\s*\{[\s\S]*margin-left:\s*calc\(var\(--community-presence-face-size\) \* -0\.22\)/,
  "the canonical facepile must overlap by a proportional amount",
);
assert.match(
  communityPresenceFacepile,
  /style=\{\{ zIndex: visibleFaces\.length - index \}\}/,
  "the leftmost face must remain visually highest",
);
assert.match(baseCss, /\.community-rail-avatar\s*\{[\s\S]*?border-radius:\s*var\(--radius-sm\);/);
assert.match(baseCss, /\.discover-card-avatar\s*\{[\s\S]*?border-radius:\s*12px;/);
assert.match(baseCss, /\.profile-avatar-drop\s*\{[\s\S]*?border-radius:\s*50%;/);
assert.match(baseCss, /\.member-avatar\s*\{[\s\S]*?border-radius:\s*999px;/);

console.log("avatar framing contract proof passed");
