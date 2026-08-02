import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const framedMediaUi = read("shared/framedMediaUi.ts");
const avatarUi = read("shared/avatarUi.ts");
const communityAvatarUi = read("shared/communityAvatarUi.ts");
const communityBannerUi = read("shared/communityBannerUi.ts");
const stableFramedMedia = read("shared/StableFramedMedia.tsx");
const userAvatar = read("shared/UserAvatar.tsx");
const communityAvatar = read("shared/CommunityAvatar.tsx");
const communityBanner = read("shared/CommunityBanner.tsx");
const userEditor = read("apps/web/src/components/WebUserAvatarEditorModal.tsx");
const communityAvatarEditor = read("apps/web/src/components/WebCommunityAvatarEditorModal.tsx");
const communityBannerEditor = read("apps/web/src/components/WebCommunityBannerEditorModal.tsx");
const directoryGateway = read("shared/cloudCommunityDirectoryGateway.ts");
const contextPanel = read("apps/web/src/components/CommunityContextPanel.tsx");
const communityTypes = read("shared/communityTypes.ts");
const communityTypingCore = read("convex/communityTypingPresenceCore.ts");
const interactionFeed = read("apps/web/src/components/communityInteractionFeed.tsx");
const mentionAutocomplete = read("apps/web/src/components/communityMentionAutocomplete.tsx");
const communityDirectory = read("convex/communityDirectory.ts");
const communityNav = read("shared/CommunityNav.tsx");
const discoverCard = read("shared/DiscoverCommunityCard.tsx");
const communitySettings = read("apps/web/src/components/WebCommunitySettingsSection.tsx");
const createCommunity = read("apps/web/src/components/WebCreateCommunityModal.tsx");
const profileSettings = read("apps/web/src/components/WebProfileSettingsSection.tsx");
const onboardingPage = read("apps/web/src/components/WebOnboardingPage.tsx");
const baseCss = [
  read("apps/web/src/base.css"),
  read("apps/web/src/styles/shell-and-onboarding.css"),
  read("apps/web/src/styles/community-and-content.css"),
  read("apps/web/src/styles/settings-runtime-and-theme-overrides.css"),
].join("\n");

assert.match(framedMediaUi, /export function computeFramedMediaLayout/);
assert.match(framedMediaUi, /export function focusFromFramedMediaLayoutPosition/);
assert.match(framedMediaUi, /export function getFramedMediaLayoutImageStyle/);
assert.match(avatarUi, /computeAvatarLayout = computeFramedMediaLayout/);
assert.match(communityAvatarUi, /computeCommunityAvatarLayout = computeFramedMediaLayout/);
assert.match(communityBannerUi, /computeCommunityBannerLayout = computeFramedMediaLayout/);
assert.doesNotMatch(communityAvatarUi, /objectPosition|transform:/);
assert.doesNotMatch(communityBannerUi, /objectPosition|backgroundPosition|transform:/);

assert.match(stableFramedMedia, /viewportRef = useRef<HTMLSpanElement/);
assert.match(stableFramedMedia, /imageRef = useRef<HTMLImageElement/);
assert.match(stableFramedMedia, /observer\.observe\(viewport\)/);
assert.match(stableFramedMedia, /position: "absolute"/);
assert.match(stableFramedMedia, /inset: 0/);
assert.match(stableFramedMedia, /borderRadius: "inherit"/);
assert.match(stableFramedMedia, /overflow: "hidden"/);
assert.match(stableFramedMedia, /viewport\.clientWidth/);
assert.match(stableFramedMedia, /viewport\.clientHeight/);
assert.match(stableFramedMedia, /position: presentationStyle\?\.position \?\? "relative"/);
assert.match(stableFramedMedia, /overflow: presentationStyle\?\.overflow \?\? "hidden"/);
assert.match(stableFramedMedia, /visibility: "hidden"/);
assert.match(stableFramedMedia, /if \(!image\?\.complete\) return/);
assert.match(stableFramedMedia, /syncNaturalSizeFromImage\(image\)/);
assert.match(stableFramedMedia, /ref=\{imageRef\}/);
assert.match(stableFramedMedia, /syncNaturalSizeFromImage\(event\.currentTarget\)/);
assert.doesNotMatch(stableFramedMedia, /root\.getBoundingClientRect/);
assert.match(framedMediaUi, /border: 0/);
assert.match(framedMediaUi, /objectFit: "fill"/);

assert.match(userAvatar, /<StableFramedMedia/);
assert.match(userAvatar, /frame=\{\{/);
assert.match(communityAvatar, /<StableFramedMedia/);
assert.match(communityAvatar, /frame=\{\{/);
assert.match(communityBanner, /<StableFramedMedia/);
assert.match(communityBanner, /frame=\{\{/);

for (const editor of [userEditor, communityAvatarEditor, communityBannerEditor]) {
  assert.match(editor, /viewport\.clientWidth/);
  assert.match(editor, /viewport\.clientHeight/);
  assert.doesNotMatch(editor, /viewport\.getBoundingClientRect/);
}
assert.match(userEditor, /computeAvatarLayout\(/);
assert.match(communityAvatarEditor, /computeCommunityAvatarLayout\(/);
assert.match(communityBannerEditor, /computeCommunityBannerLayout\(/);
assert.doesNotMatch(communityBannerEditor, /function computeBannerLayout/);

assert.match(directoryGateway, /avatar_focus_x\?: number \| null/);
assert.match(directoryGateway, /avatar_focus_y\?: number \| null/);
assert.match(directoryGateway, /avatar_zoom\?: number \| null/);
assert.match(contextPanel, /focusX=\{member\.avatar_focus_x\}/);
assert.match(contextPanel, /focusY=\{member\.avatar_focus_y\}/);
assert.match(contextPanel, /zoom=\{member\.avatar_zoom\}/);
assert.match(communityTypes, /export type CommunityTypingPresenceUser = \{[\s\S]*avatar_focus_x/);
assert.match(communityTypingCore, /avatar_focus_x: number/);
assert.match(interactionFeed, /focusX=\{user\.avatar_focus_x\}/);

assert.match(communityDirectory, /avatar_focus_x: projection\.avatar_focus_x/);
assert.match(mentionAutocomplete, /<UserAvatar/);
assert.doesNotMatch(mentionAutocomplete, /backgroundImage: `url\(\$\{candidate\.avatarUrl\}\)`/);

for (const surface of [communityNav, discoverCard, communitySettings, createCommunity]) {
  assert.match(surface, /<CommunityBanner/);
}
assert.match(createCommunity, /<CommunityAvatar/);
assert.doesNotMatch(createCommunity, /<img[^>]+Community banner preview/);
assert.doesNotMatch(createCommunity, /<img[^>]+Community avatar preview/);

assert.match(profileSettings, /WebUserAvatarEditorModal/);
assert.match(onboardingPage, /WebUserAvatarEditorModal/);
assert.match(baseCss, /\.community-rail-avatar\s*\{[\s\S]*?border-radius:\s*var\(--radius-sm\);/);
assert.match(baseCss, /\.discover-card-avatar\s*\{[\s\S]*?border-radius:\s*12px;/);
assert.match(baseCss, /\.create-community-avatar\s*\{[\s\S]*?border-radius:\s*22px;/);
assert.match(baseCss, /\.create-community-banner-media\s*\{[\s\S]*?border:\s*1px solid var\(--border-default\);/);
assert.doesNotMatch(baseCss, /\.create-community-banner-media img,\s*\.create-community-banner-placeholder\s*\{[\s\S]*?border:/);

console.log("avatar framing contract proof passed");
