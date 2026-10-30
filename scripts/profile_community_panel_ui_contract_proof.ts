import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const panel = read("apps/web/src/components/WebCommunityProfilePanel.tsx");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const interactionFeed = read("apps/web/src/components/communityInteractionFeed.tsx");
const projection = read("apps/web/src/controllers/buildWebCommunitySurfaceProjection.ts");
const app = read("apps/web/src/App.tsx");
const css = [read("apps/web/src/base.css"), read("apps/web/src/styles/shell-and-onboarding.css"), read("apps/web/src/styles/community-and-content.css"), read("apps/web/src/styles/settings-runtime-and-theme-overrides.css")].join("\n");

assert.match(panel, /import \{ CommunityAvatar \}/, "profile panel must render canonical community avatars");
assert.match(panel, /ProfileCommunityContext/, "profile panel must accept the profile community context contract");
// Communities read as Substack-style groups: what they create, what you
// share, and what else they're in. Each group renders only when it has rows.
assert.match(panel, /"Creates"/, "profile panel must keep the created communities group");
assert.match(panel, /"Communities you share"/, "profile panel must keep the shared communities group");
assert.match(panel, /isSelfProfile \? "Your communities" : "Communities you share"/, "shared group label must switch between self and other profile semantics");
assert.match(panel, /communityContext\.owned_communities/, "owned section must render backend owned community context");
assert.match(panel, /communityContext\.mutual_communities/, "mutual section must render backend mutual community context");
assert.match(panel, /communityContext\.can_message/, "profile panel message button must use backend relationship message eligibility");
assert.match(panel, /isSelfProfile/, "profile panel must know whether it is rendering the viewer's own profile");
assert.match(panel, /ownedCommunityIds = new Set\(ownedCommunities\.map\(\(community\) => community\.id\)\)/, "profile must compute owned community ids for duplicate removal");
assert.match(panel, /secondaryCommunities = mutualCommunities\.filter\(\(community\) => !ownedCommunityIds\.has\(community\.id\)\)/, "shared communities must not repeat ones they create");
assert.match(panel, /created\.length \? <WebCommunityProfileCommunityList[\s\S]*shared\.length \? <WebCommunityProfileCommunityList[\s\S]*joined\.length \? <WebCommunityProfileCommunityList/, "each community group must only render when it has data");
assert.doesNotMatch(panel, /No visible owned communities|No mutual communities|Loading communities/, "profile panel must not show empty or loading community section labels");
assert.doesNotMatch(panel, /No handle yet|No bio yet|community-profile-panel-bio\\$|community-profile-panel-bio\$\{/, "profile panel must not show placeholder handle or bio rows");
assert.match(panel, /handleLabel \? <span>\{handleLabel\}<\/span> : null/, "profile panel handle must render only when a handle exists");
assert.match(panel, /bio \? <p className="pn-profile-bio">\{bio\}<\/p> : isSelfProfile \?/, "profile panel bio must render only when a bio exists, with a prompt only on your own profile");
assert.doesNotMatch(panel, /In this community/, "profile panel must not keep the old active-community text row");
assert.doesNotMatch(panel, /activeCommunityName|isActiveCommunityOwner/, "profile panel must not synthesize context from current community props");
assert.match(panel, /className="pn-profile-button is-primary"[\s\S]*disabled=\{!canMessageProfile\}/, "full profile must use one profile action, disabled when messaging is not allowed");
assert.match(interactionFeed, /className="community-profile-message-action"/, "interaction profile preview must use the canonical neutral profile action");
assert.doesNotMatch(panel, /chat-profile-message-button/, "full profile must not retain the bespoke profile message button");

assert.doesNotMatch(interactionFeed, /No handle yet|No bio yet|chat-profile-hover-bio\\$|chat-profile-hover-bio\$\{/, "profile hover card must not show placeholder handle or bio rows");
assert.match(interactionFeed, /handleLabel \? <div className="chat-profile-hover-handle">\{handleLabel\}<\/div> : null/, "profile hover handle row must render only when a handle exists");
assert.match(interactionFeed, /bio \? <div className="chat-profile-hover-bio">\{bio\}<\/div> : null/, "profile hover bio row must render only when a bio exists");

assert.match(
  chatPanel,
  /fetchCloudProfileCommunityContext/,
  "chat panel must fetch profile community context when a profile panel opens",
);
assert.match(
  chatPanel,
  /profileCommunityContextByUserId/,
  "chat panel must cache profile community context per target user",
);
assert.match(
  chatPanel,
  /setProfileCommunityContextByUserId\(\{\}\);[\s\S]*sessionUserId/,
  "profile community context cache must reset when the authenticated viewer changes",
);
assert.match(
  chatPanel,
  /communityContext=\{profilePanelCommunityContext\}/,
  "chat panel must pass loaded community context into the profile panel",
);
assert.match(
  chatPanel,
  /isSelfProfile=\{profilePanelCommunityContext\.is_self \|\| Boolean\(profilePanelUserId && sessionUserId && profilePanelUserId === sessionUserId\)\}/,
  "chat panel must prefer backend self relationship while preserving a local fallback",
);
assert.match(
  chatPanel,
  /preferredCommunityId: activeCommunity\?\.id \?\? null/,
  "chat panel must let the backend prefer the current community as message context",
);
assert.match(
  chatPanel,
  /profilePanelCommunityContext\.message_context_community_id[\s\S]*openDirectMessage\(profilePanelUserId, profilePanelCommunityContext\.message_context_community_id\)/,
  "profile panel message action must use the backend-selected message context community",
);
assert.match(
  chatPanel,
  /!canOpenDirectMessageFromCommunity \|\| !profilePanelCommunityContext\.can_message/,
  "profile panel message action must stay disabled when the relationship is not message eligible",
);
assert.doesNotMatch(
  chatPanel,
  /isCommunityContextLoading|isProfilePanelCommunityContextLoading|loadingProfileCommunityContextUserId/,
  "profile panel must not receive or render community loading chrome",
);

assert.match(
  projection,
  /session: WebCommunityChatPanelProps\["session"\]/,
  "community surface projection must accept the authenticated session for profile context reads",
);
assert.match(projection, /session: params\.session/, "community surface projection must pass session to chat panel props");
assert.match(app, /buildWebCommunitySurfaceProjection\(\{[\s\S]*session: session,/, "App must pass session to the community surface projection");

assert.match(css, /\.community-profile-panel-community-strip/, "profile panel must style the horizontal community avatar strip");
assert.match(css, /\.community-profile-panel-community-avatar \{[\s\S]*width: 38px;[\s\S]*height: 38px;/, "community avatars must have fixed compact dimensions");
assert.match(css, /overflow-x: auto/, "community avatar strip must constrain overflow horizontally");
assert.match(css, /\.community-profile-message-action \{/, "profile surfaces must share one canonical action style");
assert.doesNotMatch(css, /\.chat-profile-message-button \{/, "retired pink profile action styling must be deleted");
assert.match(css, /\.chat-profile-hover-card \{[\s\S]*background: var\(--bg-card-solid, var\(--web-popover-surface\)\);/, "profile preview must be an opaque raised surface");
assert.doesNotMatch(css.match(/\.chat-profile-hover-card \{[\s\S]*?\n\}/)?.[0] ?? "", /backdrop-filter/, "profile preview must not retain glass blur");
assert.match(css, /\.community-profile-panel-link \{[\s\S]*border: 0;[\s\S]*background: transparent;/, "full profile links must be quiet links instead of CTA capsules");

console.log("PASS: profile community panel renders backend-owned, shared, and joined community groups.");
