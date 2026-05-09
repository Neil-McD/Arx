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
  /imageFrame=\{\{/,
  "community avatars must pass canonical framing to StableAvatar",
);
assert.doesNotMatch(
  communityAvatar,
  /getCommunityAvatarImageStyle/,
  "community avatars must not use object-position fallback framing",
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
  "avatar editor preview style must share final-render image style",
);

assert.match(baseCss, /\.community-rail-avatar\s*\{[\s\S]*?position:\s*relative;/);
assert.match(baseCss, /\.discover-card-avatar\s*\{[\s\S]*?position:\s*relative;/);
assert.match(
  indexCss,
  /\.mobile-community-trigger-avatar\s*\{[\s\S]*?position:\s*relative;/,
);
assert.match(
  indexCss,
  /\.mobile-community-selector-avatar\s*\{[\s\S]*?position:\s*relative;/,
);
assert.match(
  baseCss,
  /\.chat-avatar\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?z-index:\s*2;/,
  "chat avatars must render above message content in absolute-positioned chat rows",
);

console.log("PASS: avatar framing contract is canonical.");
