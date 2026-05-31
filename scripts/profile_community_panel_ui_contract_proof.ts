import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const panel = read("apps/web/src/components/WebCommunityProfilePanel.tsx");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const projection = read("apps/web/src/controllers/buildWebCommunitySurfaceProjection.ts");
const app = read("apps/web/src/App.tsx");
const css = read("apps/web/src/base.css");

assert.match(panel, /import \{ CommunityAvatar \}/, "profile panel must render canonical community avatars");
assert.match(panel, /ProfileCommunityContext/, "profile panel must accept the profile community context contract");
assert.match(panel, /Owned communities/, "profile panel must keep the owned communities section");
assert.match(panel, /Mutual communities/, "profile panel must keep the mutual communities section");
assert.match(panel, /My communities/, "self profile must label non-owned participation as My communities");
assert.match(panel, /communityContext\.owned_communities/, "owned section must render backend owned community context");
assert.match(panel, /communityContext\.mutual_communities/, "mutual section must render backend mutual community context");
assert.match(panel, /hasOwnedCommunities \? \(/, "owned communities section must only render when owned community data exists");
assert.match(panel, /isSelfProfile/, "profile panel must know whether it is rendering the viewer's own profile");
assert.match(panel, /ownedCommunityIds = new Set\(ownedCommunities\.map\(\(community\) => community\.id\)\)/, "self profile must compute owned community ids for duplicate removal");
assert.match(panel, /secondaryCommunities = isSelfProfile[\s\S]*mutualCommunities\.filter\(\(community\) => !ownedCommunityIds\.has\(community\.id\)\)[\s\S]*: mutualCommunities/, "self profile must remove owned communities from My communities while other profiles keep mutuals");
assert.match(panel, /secondaryCommunityLabel = isSelfProfile \? "My communities" : "Mutual communities"/, "secondary community label must switch between self and other profile semantics");
assert.match(panel, /hasSecondaryCommunities \? \(/, "secondary community section must only render when data exists");
assert.match(panel, /hasCommunitySections \? <div className="community-profile-panel-divider"/, "profile community divider must only render when a community section exists");
assert.doesNotMatch(panel, /No visible owned communities|No mutual communities|Loading communities/, "profile panel must not show empty or loading community section labels");
assert.doesNotMatch(panel, /In this community/, "profile panel must not keep the old active-community text row");
assert.doesNotMatch(panel, /activeCommunityName|isActiveCommunityOwner/, "profile panel must not synthesize context from current community props");

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
  /isSelfProfile=\{Boolean\(profilePanelUserId && sessionUserId && profilePanelUserId === sessionUserId\)\}/,
  "chat panel must identify when the selected profile is the signed-in viewer",
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

console.log("PASS: profile community panel renders backend-owned and mutual community avatar strips.");
