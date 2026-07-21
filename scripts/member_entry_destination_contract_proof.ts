import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const backend = read("convex/memberEntryDestination.ts");
const homeCommunity = read("convex/platformHomeCommunity.ts");
const gateway = read("shared/cloudMemberEntryDestinationGateway.ts");
const routes = read("shared/webAppRouteState.ts");
const authCookies = read("api/auth/_cookies.js");
const authCallback = read("api/auth/google/callback.js");
const app = read("apps/web/src/App.tsx");

const platformBridgeBody =
  app.match(/async function completePlatformBridge[\s\S]*?\n  \/\* Community bridge Enter/)?.[0] ?? "";
const communityBridgeBody =
  app.match(/async function completeBridgeAndEnter[\s\S]*?\n  \/\* Client-side bridge validation/)?.[0] ?? "";

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
  /ensurePlatformHomeCommunityMembership/,
  "generic member entry must reuse canonical Polynet auto-membership",
);
assert.match(
  homeCommunity,
  /getUniqueCommunityMembershipByPair[\s\S]*platformHomeMembershipDisablesAutojoin[\s\S]*status: "disabled"/,
  "canonical Polynet auto-membership must preserve inactive relationship intent",
);
assert.doesNotMatch(
  homeCommunity,
  /platform_home_autojoin_opt_out|communityJoinRequests/,
  "platform-home autojoin must not overload join requests with preference state",
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
  app,
  /routeTryPolynetFree[\s\S]*account_setup\?\.completed[\s\S]*resolveAndEnterMemberDestination/,
  "completed generic accounts must resolve the canonical community destination",
);
assert.match(
  app,
  /defaultMemberEntryResolutionRef[\s\S]*authSubject[\s\S]*current\?\.authSubject === authSubject/,
  "default-entry request deduplication must remain bound to the authenticated subject",
);
assert.match(
  app,
  /isRootAppRoutePath[\s\S]*routeTryPolynetFree\(session\)/,
  "authenticated root entry must preserve the incomplete-account bridge check",
);
assert.match(
  platformBridgeBody,
  /saveOnboardingProfile[\s\S]*finishOnboarding\(\{ navigate: false \}\)[\s\S]*resolveAndEnterMemberDestination/,
  "platform bridge completion must save setup before resolving Polynet entry",
);
assert.doesNotMatch(
  platformBridgeBody,
  /workspace|requestOnboardingGuide|runAgentTurn|agentLifecycle/,
  "platform bridge completion must not navigate to Workspace or start a hidden agent turn",
);
assert.match(
  communityBridgeBody,
  /resolveMemberEntryDestination\(\{[\s\S]*communityId: entry\.communityId[\s\S]*communitySlug: entry\.communitySlug/,
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
  routes,
  /function buildWorkspaceDraftPath[\s\S]*return appendWorkspaceDraftProjectSearch\("\/workspace"/,
  "legacy Workspace route builders must remain as internal compatibility substrate during isolation",
);
assert.match(
  routes,
  /readLegacyWorkspaceRouteContext[\s\S]*segments\[0\] !== "workspace"[\s\S]*communitySlug/,
  "legacy Workspace URLs must be classified before auth-aware destination resolution",
);
assert.match(
  app,
  /readLegacyWorkspaceRouteContext[\s\S]*resolveAndEnterMemberDestination[\s\S]*buildCommunityFunnelPath/,
  "legacy Workspace entry must resolve to an authorized community or a public funnel instead of rendering Workspace",
);

console.log("member_entry_destination_contract_proof: ok");
