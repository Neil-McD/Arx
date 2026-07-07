import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const packageJson = read("package.json");
const badgeProjection = read("convex/premiumMemberBadge.ts");
const userProfileProjection = read("convex/userProfileProjection.ts");
const profiles = read("convex/profiles.ts");
const communityDirectory = read("convex/communityDirectory.ts");
const directMessages = read("convex/directMessages.ts");
const communityTypes = read("shared/communityTypes.ts");
const directoryGateway = read("shared/cloudCommunityDirectoryGateway.ts");
const membershipGateway = read("shared/cloudCommunityMembershipGateway.ts");
const badgeComponent = read("shared/PremiumMemberBadge.tsx");
const chatRow = read("shared/CommunityChatMessageRow.tsx");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const contextPanel = read("apps/web/src/components/CommunityContextPanel.tsx");
const profilePanel = read("apps/web/src/components/WebCommunityProfilePanel.tsx");
const memberSettings = read("apps/web/src/components/CommunityMemberSettingsDialog.tsx");
const mentionAutocomplete = read("apps/web/src/components/communityMentionAutocomplete.tsx");
const interactionFeed = read("apps/web/src/components/communityInteractionFeed.tsx");
const interactionProjection = read("apps/web/src/components/WebCommunityInteractionProjection.tsx");
const dmInboxPanel = read("apps/web/src/components/WebDirectMessageInboxPanel.tsx");
const dmPanel = read("apps/web/src/components/WebDirectMessagePanel.tsx");
const baseCss = read("apps/web/src/base.css");

assert.match(
  badgeProjection,
  /query\("userEntitlements"\)[\s\S]*withIndex\("by_user"[\s\S]*tier[\s\S]*"architect"[\s\S]*kind:\s*"polynet_premium"[\s\S]*label:\s*"Premium"/,
  "premium member badge must be derived from active userEntitlements and projected as a public badge",
);

assert.doesNotMatch(
  badgeProjection,
  /account_tier/,
  "premium member badge projection must not expose raw account_tier naming",
);

assert.match(
  userProfileProjection,
  /resolvePublicPremiumMemberBadgeForUserId[\s\S]*premium_badge:\s*await resolvePublicPremiumMemberBadgeForUserId\(ctx,\s*user\._id\)/,
  "user profile projection must include the public premium_badge field",
);

assert.match(
  profiles,
  /premium_badge:\s*PublicPremiumMemberBadge \| null[\s\S]*resolveUserProfileDisplayProjectionForUser\(ctx,\s*user,\s*detail\)/,
  "profiles:listProfilesByUserIds must type and return premium_badge",
);

assert.match(
  communityDirectory,
  /mapCommunityMentionUserCandidate[\s\S]*premium_badge:\s*projection\.premium_badge/,
  "remote community mention candidates must return premium_badge from the profile projection",
);

for (const [label, pattern] of [
  [
    "direct message participant payload",
    /mapDirectParticipant[\s\S]*premium_badge:\s*profile\.premium_badge \?\? null/,
  ],
  [
    "direct message typing payload",
    /mapDirectTypingPresence[\s\S]*premium_badge:\s*profile\.premium_badge \?\? null/,
  ],
  [
    "direct message eligible recipient payload",
    /mapEligibleDirectMessageRecipient[\s\S]*premium_badge:\s*profile\.premium_badge \?\? null/,
  ],
] as const) {
  assert.match(directMessages, pattern, `${label} must pass through public premium_badge`);
}

for (const [label, source] of [
  ["shared community types", communityTypes],
  ["community directory gateway", directoryGateway],
  ["community membership gateway", membershipGateway],
] as const) {
  assert.match(source, /premium_badge\??:\s*PremiumMemberBadgeSummary \| null/, `${label} must expose premium_badge`);
  assert.doesNotMatch(source, /account_tier/, `${label} must not expose raw account_tier for member badges`);
}

assert.match(
  badgeComponent,
  /export function PremiumMemberBadge[\s\S]*premium-member-badge[\s\S]*Polynet Premium member[\s\S]*premium-member-badge-label/,
  "PremiumMemberBadge component must render the compact member badge",
);

for (const [label, source, pattern] of [
  [
    "chat message row",
    chatRow,
    /senderPremiumBadge\?:\s*PremiumMemberBadgeSummary \| null[\s\S]*<PremiumMemberBadge badge=\{senderPremiumBadge\}/,
  ],
  [
    "chat panel profile mapping",
    chatPanel,
    /premiumBadge:\s*row\.premium_badge \?\? null[\s\S]*premiumBadge:\s*profile\.premium_badge \?\? null[\s\S]*senderPremiumBadge=\{senderProfile\?\.premium_badge \?\? null\}/,
  ],
  [
    "community roster",
    contextPanel,
    /premium_badge\?:\s*PremiumMemberBadgeSummary \| null[\s\S]*<PremiumMemberBadge badge=\{member\.premium_badge \?\? null\}/,
  ],
  [
    "profile panel",
    profilePanel,
    /community-profile-panel-name-row[\s\S]*<PremiumMemberBadge badge=\{profile\?\.premium_badge \?\? null\}/,
  ],
  [
    "member settings",
    memberSettings,
    /premium_badge\?:\s*PremiumMemberBadgeSummary \| null[\s\S]*<PremiumMemberBadge badge=\{props\.profile\?\.premium_badge \?\? member\.premium_badge \?\? null\}/,
  ],
  [
    "mention autocomplete",
    mentionAutocomplete,
    /premiumBadge\?:\s*PremiumMemberBadgeSummary \| null[\s\S]*<PremiumMemberBadge badge=\{candidate\.premiumBadge \?\? null\}/,
  ],
  [
    "interaction profile hover",
    interactionFeed,
    /PremiumMemberBadge[\s\S]*<PremiumMemberBadge badge=\{props\.profile\?\.premium_badge \?\? null\}/,
  ],
  [
    "interaction feed inline author",
    interactionFeed,
    /community-interaction-author[\s\S]*<\/ProfileHoverCard>\s*<PremiumMemberBadge badge=\{profile\?\.premium_badge \?\? null\}/,
  ],
  [
    "interaction thread anchor and reply authors",
    interactionProjection,
    /<PremiumMemberBadge[\s\S]*premium_badge \?\? null[\s\S]*<PremiumMemberBadge badge=\{profile\?\.premium_badge \?\? null\}/,
  ],
  [
    "direct message inbox conversation and people rows",
    dmInboxPanel,
    /PremiumMemberBadge[\s\S]*<PremiumMemberBadge badge=\{peer\?\.premium_badge \?\? null\}[\s\S]*<PremiumMemberBadge badge=\{person\.premium_badge \?\? null\}/,
  ],
  [
    "direct message conversation header",
    dmPanel,
    /PremiumMemberBadge[\s\S]*<PremiumMemberBadge badge=\{peer\?\.premium_badge \?\? null\}/,
  ],
] as const) {
  assert.match(source, pattern, `${label} must render or thread PremiumMemberBadge`);
}

for (const [label, pattern] of [
  [
    "direct message participant type",
    /export type DirectMessageParticipant[\s\S]*premium_badge\??:\s*PremiumMemberBadgeSummary \| null/,
  ],
  [
    "direct message recipient type",
    /export type DirectMessageRecipient[\s\S]*premium_badge\??:\s*PremiumMemberBadgeSummary \| null/,
  ],
  [
    "direct message typing user type",
    /export type DirectMessageTypingPresenceUser[\s\S]*premium_badge\??:\s*PremiumMemberBadgeSummary \| null/,
  ],
] as const) {
  assert.match(communityTypes, pattern, `${label} must expose public premium_badge`);
}

assert.match(baseCss, /\.premium-member-badge[\s\S]*\.premium-member-badge-label/);
assert.doesNotMatch(baseCss, /nav-premium-badge/, "orphan nav-premium-badge scaffold should be removed");

assert.match(
  packageJson,
  /"check:premium-member-badge-contract": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/premium_member_badge_contract_proof\.ts"/,
  "premium member badge contract proof should be wired into package scripts",
);

console.log("premium_member_badge_contract_proof: ok");
