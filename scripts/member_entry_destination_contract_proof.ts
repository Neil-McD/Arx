import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const backend = read("convex/memberEntryDestination.ts");
const auth = read("convex/auth.ts");
const communityPublic = read("convex/communityPublic.ts");
const homeCommunity = read("convex/platformHomeCommunity.ts");
const gateway = read("shared/cloudMemberEntryDestinationGateway.ts");
const routes = read("shared/webAppRouteState.ts");
const authCookies = read("api/auth/_cookies.js");
const authCallback = read("api/auth/google/callback.js");
const app = read("apps/web/src/App.tsx");
const memberEntryController = read(
  "apps/web/src/controllers/useWebMemberEntryController.ts",
);
const onboardingProfileController = read(
  "apps/web/src/controllers/useWebOnboardingProfileController.ts",
);
const communityEntryBridgeController = read(
  "apps/web/src/controllers/useWebCommunityEntryBridgeController.ts",
);
const shellNavigation = read(
  "apps/web/src/controllers/useWebShellNavigationController.ts",
);

const platformBridgeBody =
  communityEntryBridgeController.match(
    /const completePlatformBridge = useCallback[\s\S]*?\n  const completeCommunityBridge/,
  )?.[0] ?? "";
const communityBridgeBody =
  communityEntryBridgeController.match(
    /const completeCommunityBridge = useCallback[\s\S]*?\n  return \{/,
  )?.[0] ?? "";

assert.match(
  backend,
  /export const resolveMemberEntryDestination = action/,
  "member entry must use one authenticated backend action",
);
assert.match(
  backend,
  /resolveAuthenticatedActorInternal[\s\S]*authenticated_user_required/,
  "member entry must resolve the authenticated database actor server-side",
);
assert.match(
  backend,
  /requireAccountSetupCompleteForUser\(ctx, args\.userId\)[\s\S]*ensurePlatformHomeCommunityMembership/,
  "member entry must require completed account setup before creating platform-home membership",
);
assert.doesNotMatch(
  auth,
  /ensurePlatformHomeCommunityMembership/,
  "authentication must establish identity without creating community membership",
);
assert.match(
  communityPublic,
  /joinPublicCommunityInternal[\s\S]*requireAccountSetupCompleteForUser\(args\.ctx, args\.userId\)[\s\S]*activateCommunityMembershipCore/,
  "public community admission must require completed account setup before membership activation",
);
assert.match(
  backend,
  /ensurePlatformHomeCommunityMembership/,
  "generic member entry must reuse canonical Polynet auto-membership",
);
assert.match(
  homeCommunity,
  /PLATFORM_HOME_AUTOJOIN_OPT_OUT_MESSAGE[\s\S]*readPlatformHomeAutojoinOptOut/,
  "canonical Polynet auto-membership must preserve explicit member opt-out",
);
assert.match(
  backend,
  /home\.status === "disabled"[\s\S]*home\.status === "missing"[\s\S]*home\.status === "not_open"[\s\S]*page: "discover"/,
  "unavailable or opted-out Polynet entry must fall back to Discover",
);
assert.match(
  backend,
  /requireCommunityChatAccess/,
  "every community destination must pass authoritative chat access",
);
assert.match(
  backend,
  /requestedSlug && resolvedSlug !== requestedSlug[\s\S]*community_destination_mismatch/,
  "community id and slug disagreement must fail closed",
);
assert.match(
  backend,
  /normalizeSlug\(requestedSlugRaw\)[\s\S]*normalizeSlug\(community\.slug\)/,
  "requested and stored community slugs must share the bounded canonical validator",
);
assert.match(
  gateway,
  /bootstrapGatewayAuthContextIfAvailable[\s\S]*memberEntryDestination:resolveMemberEntryDestination/,
  "the web client must reach member entry through the authenticated gateway",
);
assert.match(
  routes,
  /DEFAULT_POST_SIGN_IN_PATH = "\/"/,
  "default sign-in must return to the root resolver instead of Workspace",
);
assert.match(
  authCookies,
  /DEFAULT_POST_SIGN_IN_PATH = "\/"/,
  "same-origin auth cookies must share the root member-entry fallback",
);
assert.match(
  authCallback,
  /fallbackReturnTo = pending\?\.returnTo \?\? "\/"/,
  "Google callback fallback must return through canonical root member entry",
);
assert.match(
  onboardingProfileController,
  /routeTryPolynetFree[\s\S]*const setup = row\?\.account_setup \?\? null[\s\S]*setup\.completed[\s\S]*enterDefaultDestination/,
  "completed generic accounts must resolve the canonical community destination",
);
assert.match(
  memberEntryController,
  /defaultResolutionRef[\s\S]*authSubject[\s\S]*current\?\.authSubject === authSubject/,
  "default-entry request deduplication must remain bound to the authenticated subject",
);
assert.match(
  onboardingProfileController,
  /isRootAppRoutePath[\s\S]*routeTryPolynetFree\(params\.session\)/,
  "authenticated root entry must preserve the incomplete-account bridge check",
);
assert.match(
  platformBridgeBody,
  /completeAccountSetupAndContinue/,
  "platform bridge completion must use pending-intent-first canonical continuation",
);
assert.doesNotMatch(
  platformBridgeBody,
  /resolveAndEnter|finishOnboarding|saveOnboardingProfile/,
  "platform bridge must not bypass canonical post-account continuation",
);
assert.doesNotMatch(
  platformBridgeBody,
  /workspace|requestOnboardingGuide|runAgentTurn|agentLifecycle/,
  "platform bridge completion must not navigate to Workspace or start a hidden agent turn",
);
assert.match(
  communityBridgeBody,
  /resolveDestination\(\{[\s\S]*communityId: entry\.communityId[\s\S]*communitySlug: entry\.communitySlug/,
  "specific community bridge completion must revalidate its exact destination",
);
assert.match(
  communityBridgeBody,
  /if \(!destination \|\| destination\.page !== "community"\)[\s\S]*return false/,
  "specific community entry must remain fail-closed on resolution failure",
);
assert.doesNotMatch(
  communityBridgeBody,
  /requestOnboardingGuide|runAgentTurn|agentLifecycle/,
  "specific community bridge completion must not start a hidden personal agent turn",
);
assert.match(
  communityEntryBridgeController,
  /if \(!args\.isAccountSetupResolved\) return "wait";[\s\S]*args\.accountSetupStatus\?\.completed \? "enter" : "setup"/,
  "unresolved account setup must fail closed before community entry",
);
assert.doesNotMatch(
  routes,
  /function buildWorkspaceDraftPath|function buildWorkspaceCommunityDraftPath|function buildWorkspaceThreadPath/,
  "legacy Workspace compatibility must classify inbound URLs without retaining outbound route builders",
);
assert.match(
  routes,
  /readLegacyWorkspaceRouteContext[\s\S]*segments\[0\] !== "workspace"[\s\S]*communitySlug/,
  "legacy Workspace URLs must be classified before auth-aware destination resolution",
);
assert.match(
  shellNavigation,
  /readLegacyWorkspaceRouteContext[\s\S]*resolveAndEnter[\s\S]*buildCommunityFunnelPath/,
  "legacy Workspace entry must resolve to an authorized community or a public funnel instead of rendering Workspace",
);

console.log("member_entry_destination_contract_proof: ok");
