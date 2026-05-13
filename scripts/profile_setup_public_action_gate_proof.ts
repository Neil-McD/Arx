import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const accountSetup = read("shared/accountSetup.ts");
const accountSetupCore = read("convex/accountSetupCore.ts");
const communityLifecycle = read("convex/communityLifecycle.ts");
const communityChat = read("convex/communityChat.ts");
const useCommunityCreateController = read("shared/useCommunityCreateController.ts");
const useCommunityChatMutationController = read("shared/useCommunityChatMutationController.ts");
const app = read("apps/web/src/App.tsx");
const communitySurfaceProjection = read("apps/web/src/controllers/buildWebCommunitySurfaceProjection.ts");
const communityUiController = read("apps/web/src/controllers/useWebCommunityUiController.ts");
const communityChatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const appMainSurfaceHost = read("apps/web/src/components/WebAppMainSurfaceHost.tsx");
const profiles = read("convex/profiles.ts");

assert.match(
  accountSetup,
  /export function getAccountSetupIdentityMissingFields/,
  "identity setup missing-field logic must be canonical",
);
assert.match(
  accountSetup,
  /export function isAccountSetupIdentityComplete/,
  "backend/public action checks must share identity-complete semantics",
);
assert.match(
  accountSetup,
  /export function isAccountSetupStatusIdentityComplete/,
  "frontend checks must read identity completion from AccountSetupStatus",
);
assert.match(
  accountSetup,
  /const identityMissing = getAccountSetupIdentityMissingFields\(input\);/,
  "overall account setup status must use the same identity missing-field logic",
);
assert.match(
  accountSetup,
  /if \(!validateProfileHandle\(input\.handle\)\.ok\) missing\.push\("handle"\);/,
  "identity setup must require a valid public handle",
);

assert.match(
  accountSetupCore,
  /export async function requireProfileSetupCompleteForUser/,
  "Convex must expose a single profile setup write guard",
);
assert.match(
  accountSetupCore,
  /\.query\("userProfileDetails"\)/,
  "profile setup guard must use first-party profile details, not auth fallbacks",
);
assert.match(
  accountSetupCore,
  /handle: user\?\.handle \?\? null/,
  "profile setup guard must require the first-party account handle",
);
assert.match(
  accountSetupCore,
  /throw new Error\("profile_setup_required"\)/,
  "profile setup guard must fail with a stable error code",
);

assert.match(
  communityLifecycle,
  /import \{ requireProfileSetupCompleteForUser \} from "\.\/accountSetupCore";/,
  "community lifecycle writes must import the profile setup guard",
);
assert.match(
  communityLifecycle,
  /const ownerId = await resolveUserIdForAuthenticatedRequest\([\s\S]*?await requireProfileSetupCompleteForUser\(ctx, ownerId\);[\s\S]*?const nowMs = Date\.now\(\);/,
  "community creation must require profile setup before creating a community",
);
assert.match(
  communityLifecycle,
  /generateCommunityBrandingUploadUrl[\s\S]*?const userId = await resolveUserIdForAuthenticatedRequest\([\s\S]*?await requireProfileSetupCompleteForUser\(ctx, userId\);[\s\S]*?ctx\.storage\.generateUploadUrl/,
  "community branding uploads must require profile setup",
);

assert.match(
  communityChat,
  /import \{ requireProfileSetupCompleteForUser \} from "\.\/accountSetupCore";/,
  "community chat writes must import the profile setup guard",
);
assert.match(
  communityChat,
  /generateCommunityChatAttachmentUploadUrl[\s\S]*?await requireCommunityChatAccess\([\s\S]*?await requireProfileSetupCompleteForUser\(ctx, userId\);[\s\S]*?ctx\.storage\.generateUploadUrl/,
  "community attachment uploads must require profile setup",
);
assert.match(
  communityChat,
  /createThreadUserMessage[\s\S]*?await requireCommunityChatAccess\([\s\S]*?await requireProfileSetupCompleteForUser\(ctx, userId\);[\s\S]*?ctx\.db\.insert\("communityChatMessages"/,
  "community message creation must require profile setup before inserting a post",
);

assert.match(
  useCommunityCreateController,
  /isProfileSetupComplete: boolean;/,
  "create-community controller must receive profile setup state",
);
assert.match(
  useCommunityCreateController,
  /onProfileSetupRequired\?: \(\) => void;/,
  "create-community controller must be able to open profile setup",
);
assert.match(
  useCommunityCreateController,
  /message\.includes\("profile_setup_required"\)[\s\S]*?Finish your profile before creating a community/,
  "create-community server errors must map to profile setup copy",
);
assert.match(
  useCommunityCreateController,
  /if \(current\.session && !current\.isProfileSetupComplete\)[\s\S]*?current\.onProfileSetupRequired\?\.\(\);/,
  "opening create-community must route incomplete signed-in users to profile setup",
);

assert.match(
  useCommunityChatMutationController,
  /message\.includes\("profile_setup_required"\)[\s\S]*?Finish your profile before posting in communities/,
  "community message server errors must map to profile setup copy",
);
assert.match(
  useCommunityChatMutationController,
  /onProfileSetupRequired\?: \(\) => void;/,
  "community message controller must be able to open profile setup",
);
assert.doesNotMatch(
  profiles,
  /hasEstablishedAccountEvidence/,
  "legacy account activity must not auto-complete profile setup or onboarding",
);
assert.match(
  app,
  /const isProfileSetupCompleteForPublicActions =[\s\S]*?!session \|\| Boolean\(effectiveAccountSetupStatus && isAccountSetupStatusIdentityComplete\(effectiveAccountSetupStatus\)\)/,
  "app must keep public actions blocked while signed-in setup status is unknown",
);
assert.match(
  app,
  /beforeSendValidate: async \(\) => \{[\s\S]*?!isProfileSetupCompleteForPublicActions[\s\S]*?openProfileSetup\(\);[\s\S]*?Finish your profile before posting in communities/,
  "community message sends must preflight profile setup before optimistic insert",
);
assert.match(
  app,
  /onProfileSetupRequired: openProfileSetup/,
  "community message backend profile rejections must open profile setup",
);
assert.match(
  app,
  /onProfileSetupRequired: openProfileSetup/,
  "create-community flow must open profile setup when blocked",
);
assert.match(
  app,
  /onFinishProfileSetup: openProfileSetup/,
  "community chat profile gate must open profile setup",
);
assert.match(
  app,
  /showOnboardingModal: shellPublicRoute\.kind === "app" && isOnboardingModalOpen/,
  "account setup modal must be available from community surfaces",
);

assert.match(
  communityUiController,
  /isProfileSetupComplete: boolean;/,
  "web community UI controller must carry profile setup state",
);
assert.match(
  communitySurfaceProjection,
  /isProfileSetupComplete: WebCommunityChatPanelProps\["isProfileSetupComplete"\]/,
  "community surface projection must pass profile setup state to chat panel",
);
assert.match(
  communitySurfaceProjection,
  /onFinishProfileSetup: WebCommunityChatPanelProps\["onFinishProfileSetup"\]/,
  "community surface projection must pass the profile setup CTA action",
);
assert.match(
  communityChatPanel,
  /const isProfileSetupGateActive = hasSession && Boolean\(activeCommunity\) && canPostMessages && !isProfileSetupComplete;/,
  "community chat panel must distinguish profile setup from membership/access gates",
);
assert.match(
  communityChatPanel,
  /const canUseComposer = canPostMessages && !isProfileSetupGateActive;/,
  "community composer must be disabled by profile setup without mutating access truth",
);
assert.match(
  communityChatPanel,
  /Finish your profile to chat/,
  "community composer placeholder must explain the profile setup gate",
);
assert.match(
  communityChatPanel,
  /community-chat-profile-gate[\s\S]*?Finish profile/,
  "community chat must render a profile setup CTA",
);
assert.match(
  appMainSurfaceHost,
  /props\.showOnboardingModal[\s\S]*?<WebOnboardingPage \{\.\.\.props\.onboardingPageProps\} variant="modal" \/>/,
  "main surface host must render onboarding modal outside the workspace-only branch",
);

console.log("PASS: profile setup gates public community actions.");
