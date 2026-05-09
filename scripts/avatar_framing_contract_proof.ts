import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const avatarUi = read("shared/avatarUi.ts");
const communityAvatarUi = read("shared/communityAvatarUi.ts");
const stableAvatar = read("shared/StableAvatar.tsx");
const userAvatar = read("shared/UserAvatar.tsx");
const communityAvatar = read("shared/CommunityAvatar.tsx");
const editor = read("apps/web/src/components/WebCommunityAvatarEditorModal.tsx");
const userEditor = read("apps/web/src/components/WebUserAvatarEditorModal.tsx");
const profileSettings = read("apps/web/src/components/WebProfileSettingsSection.tsx");
const onboardingPage = read("apps/web/src/components/WebOnboardingPage.tsx");
const baseCss = read("apps/web/src/base.css");
const indexCss = read("apps/web/src/index.css");

assert.match(avatarUi, /export function computeAvatarLayout/, "avatar layout math must be shared");
assert.match(
  avatarUi,
  /export function focusFromAvatarLayoutPosition/,
  "dragged avatar focus derivation must be shared",
);
assert.match(
  avatarUi,
  /export function getAvatarLayoutImageStyle/,
  "rendered avatar image style must be derived from shared layout math",
);
assert.match(
  communityAvatarUi,
  /export const computeCommunityAvatarLayout = computeAvatarLayout/,
  "community avatar editor must use the shared layout implementation",
);
assert.match(
  communityAvatarUi,
  /export const focusFromCommunityAvatarLayoutPosition = focusFromAvatarLayoutPosition/,
  "community avatar editor must use shared focus derivation",
);
assert.match(
  communityAvatarUi,
  /export const getCommunityAvatarImageStyle = getAvatarImageStyle/,
  "community avatar surfaces must use community-specific object-position rendering",
);

assert.match(stableAvatar, /imageFrame\?: AvatarFrame/, "stable avatar must accept canonical framing input");
assert.match(stableAvatar, /computeAvatarLayout\(/, "stable avatar must render with canonical layout math");
assert.match(
  stableAvatar,
  /getAvatarLayoutImageStyle\(layout\)/,
  "stable avatar image style must come from canonical layout math",
);
assert.doesNotMatch(
  stableAvatar,
  /position:\s*style\?\.position\s*\?\?\s*"relative"/,
  "stable avatar must not override caller-owned layout positioning",
);
assert.match(
  stableAvatar,
  /overflow:\s*style\?\.overflow\s*\?\?\s*"hidden"/,
  "stable avatar must clip canonical avatar images to the avatar frame",
);

assert.match(userAvatar, /imageFrame=\{\{/, "user avatars must pass canonical framing to StableAvatar");
assert.doesNotMatch(
  userAvatar,
  /getAvatarImageStyle/,
  "user avatars must not use object-position fallback framing",
);
assert.match(
  communityAvatar,
  /getCommunityAvatarImageStyle\(\{/,
  "community avatars must use the app-icon object-position render path",
);
assert.doesNotMatch(
  communityAvatar,
  /imageFrame=\{\{/,
  "community avatars must not use the user/photo absolute-frame render path",
);

assert.match(
  editor,
  /computeCommunityAvatarLayout\(/,
  "avatar editor preview must share final-render layout math",
);
assert.match(
  editor,
  /focusFromCommunityAvatarLayoutPosition\(/,
  "avatar editor drag output must share final-render focus math",
);
assert.match(
  editor,
  /getCommunityAvatarLayoutImageStyle\(layout\)/,
  "avatar editor preview must use deterministic draggable image layout",
);
assert.match(userEditor, /computeAvatarLayout\(/, "user avatar editor must use shared avatar layout math");
assert.match(
  userEditor,
  /focusFromAvatarLayoutPosition\(/,
  "user avatar editor drag output must use shared focus derivation",
);
assert.match(
  userEditor,
  /getAvatarLayoutImageStyle\(layout\)/,
  "user avatar editor preview must share final user render layout math",
);
assert.match(
  userEditor,
  /user-avatar-editor-viewport/,
  "user avatar editor must render inside a user-specific circular viewport",
);
assert.match(
  userEditor,
  /avatar-editor-field/,
  "user avatar editor controls must use neutral avatar editor field styling",
);
assert.match(
  userEditor,
  /avatar-editor-hint/,
  "user avatar editor hint must use neutral avatar editor hint styling",
);
assert.doesNotMatch(
  userEditor,
  /create-community/,
  "user avatar editor must not depend on community/create form classes",
);
assert.match(
  profileSettings,
  /WebUserAvatarEditorModal/,
  "profile settings must use the user avatar editor",
);
assert.doesNotMatch(
  profileSettings,
  /WebCommunityAvatarEditorModal/,
  "profile settings must not use the community avatar editor",
);
assert.match(
  onboardingPage,
  /WebUserAvatarEditorModal/,
  "onboarding must use the user avatar editor",
);
assert.doesNotMatch(
  onboardingPage,
  /WebCommunityAvatarEditorModal/,
  "onboarding must not use the community avatar editor",
);

assert.match(baseCss, /\.community-rail-avatar\s*\{[\s\S]*?position:\s*relative;/);
assert.match(
  baseCss,
  /\.community-rail-avatar\s*\{[\s\S]*?border-radius:\s*var\(--radius-sm\);/,
  "rail community avatars must stay rounded-square",
);
assert.match(
  baseCss,
  /\.community-rail-avatar img\s*\{[\s\S]*?border-radius:\s*var\(--radius-sm\);/,
  "rail community avatar images must stay rounded-square",
);
assert.match(baseCss, /\.discover-card-avatar\s*\{[\s\S]*?position:\s*relative;/);
assert.match(
  baseCss,
  /\.discover-card-avatar\s*\{[\s\S]*?border-radius:\s*12px;/,
  "discover community avatars must stay rounded-square",
);
assert.match(
  baseCss,
  /\.discover-card-avatar img,\s*\.discover-card-avatar-image\s*\{[\s\S]*?border-radius:\s*12px;/,
  "discover community avatar images must stay rounded-square",
);
assert.match(
  baseCss,
  /\.web-empty-thread-avatar\s*\{[\s\S]*?border-radius:\s*24px;/,
  "empty-thread community avatars must stay rounded-square",
);
assert.match(
  baseCss,
  /\.web-empty-thread-avatar-image\s*\{[\s\S]*?border-radius:\s*24px;/,
  "empty-thread community avatar images must stay rounded-square",
);
assert.match(
  baseCss,
  /\.create-community-avatar\s*\{[\s\S]*?border-radius:\s*22px;/,
  "community create/settings avatar control must stay rounded-square",
);
assert.match(
  baseCss,
  /\.avatar-editor-viewport\s*\{[\s\S]*?border-radius:\s*24px;/,
  "shared square avatar editor viewport must stay rounded-square for communities",
);
assert.match(
  baseCss,
  /\.avatar-editor-field\s*\{[\s\S]*?display:\s*flex;/,
  "neutral avatar editor field styling must exist",
);
assert.match(
  baseCss,
  /\.avatar-editor-hint\s*\{[\s\S]*?font-size:\s*11px;/,
  "neutral avatar editor hint styling must exist",
);
assert.match(
  baseCss,
  /\.polynet-onboarding-avatar\s*\{[\s\S]*?border-radius:\s*999px;/,
  "onboarding user avatar must be circular",
);
assert.match(
  baseCss,
  /\.polynet-onboarding-avatar img\s*\{[\s\S]*?border-radius:\s*999px;/,
  "onboarding user avatar image must be circular",
);
assert.match(
  baseCss,
  /\.profile-avatar-drop\s*\{[\s\S]*?border-radius:\s*50%;/,
  "profile settings user avatar must be circular",
);
assert.match(
  baseCss,
  /\.member-avatar\s*\{[\s\S]*?border-radius:\s*999px;/,
  "member user avatars must be circular",
);
assert.match(
  baseCss,
  /\.member-avatar img\s*\{[\s\S]*?border-radius:\s*999px;/,
  "member user avatar images must be circular",
);
assert.match(
  baseCss,
  /\.public-funnel-face\s*\{[\s\S]*?border-radius:\s*999px;/,
  "public profile faces must be circular",
);
assert.match(
  baseCss,
  /\.user-avatar-editor-viewport\s*\{[\s\S]*?border-radius:\s*999px;/,
  "user avatar editor viewport must be circular",
);
assert.match(
  baseCss,
  /\.chat-avatar\s*\{[\s\S]*?border-radius:\s*50%;/,
  "chat user avatars must be circular",
);
assert.match(
  baseCss,
  /\.chat-avatar img\s*\{[\s\S]*?border-radius:\s*50%;/,
  "chat user avatar images must be circular",
);
assert.match(
  indexCss,
  /\.mobile-community-trigger-avatar\s*\{[\s\S]*?position:\s*relative;/,
);
assert.match(
  indexCss,
  /\.mobile-community-trigger-avatar,\s*\.mobile-community-trigger-initials\s*\{[\s\S]*?border-radius:\s*var\(--radius-sm\);/,
  "mobile trigger community avatars must stay rounded-square",
);
assert.match(
  indexCss,
  /\.mobile-community-selector-avatar\s*\{[\s\S]*?position:\s*relative;/,
);
assert.match(
  indexCss,
  /\.mobile-community-selector-avatar,\s*\.mobile-community-selector-initials\s*\{[\s\S]*?border-radius:\s*var\(--radius-sm\);/,
  "mobile selector community avatars must stay rounded-square",
);
assert.match(
  baseCss,
  /\.chat-avatar\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?z-index:\s*2;/,
  "chat avatars must render above message content in absolute-positioned chat rows",
);

console.log("PASS: avatar framing contract is canonical.");
