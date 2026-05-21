import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const schema = read("convex/schema.ts");
const profiles = read("convex/profiles.ts");
const accountSetupCore = read("convex/accountSetupCore.ts");
const authBootstrap = read("convex/auth.ts");
const settings = read("convex/settings.ts");
const profileGateway = read("shared/cloudProfilesGateway.ts");
const convexAuthenticatedClient = read("shared/convexAuthenticatedClient.ts");
const settingsGateway = read("shared/cloudUserSettingsGateway.ts");
const communityTypes = read("shared/communityTypes.ts");
const accountSetup = read("shared/accountSetup.ts");
const profileHandle = read("shared/profileHandle.ts");
const app = read("apps/web/src/App.tsx");
const onboardingPage = read("apps/web/src/components/WebOnboardingPage.tsx");
const setupCard = read("apps/web/src/components/WebAccountSetupCard.tsx");
const workspaceLandingProjection = read("apps/web/src/controllers/buildWebWorkspaceLandingProjection.tsx");

assert.match(schema, /handle: v\.optional\(v\.string\(\)\)/, "users table must store a public profile handle");
assert.match(schema, /normalizedHandle: v\.optional\(v\.string\(\)\)/, "users table must store normalized handle");
assert.match(schema, /\.index\("by_normalizedHandle", \["normalizedHandle"\]\)/, "normalized handle must be indexed");
assert.match(schema, /displayName: v\.optional\(v\.string\(\)\)/, "profile details must store first-party display name evidence");
assert.match(schema, /avatarUrl: v\.optional\(v\.string\(\)\)/, "profile details must store first-party avatar evidence");
assert.match(schema, /avatarStorageId: v\.optional\(v\.id\("_storage"\)\)/, "profile details must support storage-backed avatars");
assert.match(schema, /avatarFocusX: v\.optional\(v\.number\(\)\)/, "profile details must store avatar framing");
assert.match(schema, /avatarZoom: v\.optional\(v\.number\(\)\)/, "profile details must store avatar zoom");
assert.match(schema, /agentName: v\.optional\(v\.string\(\)\)/, "user memory settings must store agent name");

assert.match(profileHandle, /export function validateProfileHandle/, "profile handle validator must be shared");
assert.match(profileHandle, /RESERVED_PROFILE_HANDLES/, "profile handles must have a reserved namespace list");
assert.match(profileHandle, /\^\[a-z0-9\]/, "profile handles must use a constrained public namespace");

for (const marker of [
  '"identity"',
  '"inference"',
  '"agent"',
  '"display_name"',
  '"handle"',
  '"avatar"',
  '"platform_legal"',
  '"inference_provider"',
  '"agent_name"',
]) {
  assert.ok(accountSetup.includes(marker), `account setup model missing ${marker}`);
}
assert.match(accountSetup, /export function buildAccountSetupStatus/, "setup completion must be derived by one helper");
assert.doesNotMatch(accountSetup, /"direction"/, "account setup must not include a direction step");
assert.match(accountSetup, /validateProfileHandle\(input\.handle\)\.ok/, "profile setup handle completion must use the canonical validator");
assert.match(accountSetup, /missing\.push\("handle"\)/, "profile setup must require handle");
assert.match(accountSetup, /missing\.push\("platform_legal"\)/, "profile setup must require platform legal acceptance");
assert.doesNotMatch(accountSetup, /identityMissing\.push\("bio"\)/, "profile setup must not require bio");
assert.doesNotMatch(accountSetup, /agentMissing\.push\("agent_soul"\)/, "agent setup must not require soul text");
assert.doesNotMatch(accountSetup, /directionMissing/, "path selection must not gate account setup completion");

assert.match(profiles, /validateProfileHandle/, "profile mutations must validate handles");
assert.match(profiles, /assertHandleAvailable/, "profile mutations must enforce handle availability");
assert.match(profiles, /export const checkHandleAvailability = query/, "profile handle availability must be queryable before save");
assert.match(profiles, /withIndex\("by_normalizedHandle"/, "handle uniqueness check must use normalized handle index");
assert.match(profiles, /export const getMyAccountSetupStatus = query/, "profiles must expose authenticated setup status");
assert.match(profiles, /loadAccountSetupStatusForUser/, "profiles must use the shared Convex setup derivation helper");
assert.match(profiles, /assertProfileAvatarStorageResolvable/, "profile avatar storage must be validated before save");
assert.match(profiles, /profile_avatar_invalid/, "invalid profile avatar storage must fail with a stable error code");
assert.doesNotMatch(profiles, /hasEstablishedAccountEvidence/, "legacy account evidence must not mark onboarding complete");
assert.match(accountSetupCore, /buildAccountSetupStatusForRows/, "Convex setup derivation must support bulk operator attribution");
assert.match(accountSetupCore, /export async function loadAccountSetupStatusForUserId/, "Convex setup derivation must be loadable by user id");
assert.match(accountSetupCore, /export async function requireAccountSetupCompleteForUser/, "Convex writes must have a full account setup guard");
assert.match(accountSetupCore, /throw new Error\("account_setup_required"\)/, "full account setup guard must fail with a stable error code");
assert.match(accountSetupCore, /displayName: params\.detail\?\.displayName \?\? null/, "profile completion must use first-party profile detail display name");
assert.match(accountSetupCore, /handle: params\.user\.handle \?\? null/, "bulk setup completion must require the first-party account handle");
assert.match(accountSetupCore, /handle: user\?\.handle \?\? null/, "write guard setup completion must require the first-party account handle");
assert.match(accountSetupCore, /avatarUrl: params\.detail\?\.avatarUrl \?\? null/, "profile completion must use first-party profile detail avatar");
assert.match(accountSetupCore, /avatarStorageId: params\.detail\?\.avatarStorageId/, "profile completion must support storage-backed avatars");
assert.match(accountSetupCore, /hasAcceptedCurrentPlatformLegalFromRows/, "profile completion must require current platform legal acceptance");
assert.doesNotMatch(accountSetupCore, /displayName: params\.user\.displayName/, "auth-seeded display name must not complete account setup");
assert.doesNotMatch(accountSetupCore, /avatarUrl: params\.user\.avatarUrl/, "auth-seeded avatar must not complete account setup");
assert.doesNotMatch(convexAuthenticatedClient, /resolveAuthSessionDisplayName|resolveAuthSessionAvatarUrl/, "Convex bootstrap must not send provider profile metadata");
assert.doesNotMatch(authBootstrap, /args\.identity\.displayName|args\.identity\.avatarUrl/, "auth bootstrap must not seed provider profile metadata");
assert.match(accountSetupCore, /query\("userProviderConnections"\)/, "inference completion must derive from provider connections");
assert.match(accountSetupCore, /query\("userMemorySettings"\)/, "agent completion must derive from user memory settings");
assert.match(profiles, /account_setup: await loadAccountSetupStatusForUser/, "onboarding profile responses must include setup status");
assert.match(profiles, /recordCurrentPlatformLegalAcceptance/, "profile onboarding must record platform legal acceptance server-side");
assert.match(profiles, /platform_legal_versions_required/, "profile onboarding must require both legal document versions together");
assert.match(profiles, /acceptedAt: Date\.now\(\)/, "legal acceptance time must be server-authoritative");

assert.match(settings, /agentName: v\.optional\(v\.string\(\)\)/, "settings mutation must accept agent name");
assert.match(settings, /agent_name: row\.agentName/, "settings query must return agent_name");
assert.match(settings, /agentName: nextAgentName/, "settings mutation must persist agent name");

assert.match(profileGateway, /type \{ AccountSetupStatus \}/, "profile gateway must expose setup status type");
assert.match(profileGateway, /handle\?: string \| null/, "profile gateway must expose handle");
assert.match(profileGateway, /account_setup\?: AccountSetupStatus \| null/, "profile gateway must expose account setup status");
assert.match(profileGateway, /profiles:getMyAccountSetupStatus/, "profile gateway must load setup status");
assert.match(profileGateway, /profiles:checkHandleAvailability/, "profile gateway must expose handle availability");
assert.doesNotMatch(profileGateway, /onboardingDirection\?:|onboardingDirection:/, "profile gateway must not save onboarding direction");
assert.match(profileGateway, /markOnboardingDismissed\?: boolean/, "profile gateway may dismiss onboarding without redefining setup completion");
assert.match(profileGateway, /completeOnboarding\?: boolean/, "profile gateway must support explicit onboarding completion");
assert.match(profileGateway, /termsOfServiceVersion\?: string \| null/, "profile gateway must submit the exact Terms version when accepting platform legal");
assert.match(profileGateway, /privacyPolicyVersion\?: string \| null/, "profile gateway must submit the exact Privacy version when accepting platform legal");
assert.match(profileGateway, /prepareCloudProfileAvatarField/, "profile gateway must upload first-party avatar files");

assert.match(settingsGateway, /agent_name\?: unknown/, "settings gateway must load agent_name");
assert.match(settingsGateway, /agentName\?: string/, "settings gateway must save agentName");

assert.match(communityTypes, /AccountSetupStatus/, "shared profile types must expose account setup status");
assert.match(communityTypes, /account_setup\?: AccountSetupStatus \| null/, "profile details must carry setup status");

assert.match(onboardingPage, /accountSetupStatus: AccountSetupStatus \| null/, "onboarding UI must consume canonical setup status");
assert.match(onboardingPage, /handleAvailability: ProfileHandleAvailability \| null/, "onboarding profile step should show handle availability");
assert.match(onboardingPage, /<span>Bio<\/span>/, "onboarding profile step should expose bio");
assert.match(onboardingPage, /handleReady[\s\S]*?profileReady[\s\S]*?handleReady/, "onboarding profile step must require an available handle");
assert.match(onboardingPage, /Terms of Service[\s\S]*Privacy &amp; AI Data Policy/, "onboarding profile step must link the platform legal documents inline");
assert.match(onboardingPage, /platformLegalReady[\s\S]*?profileReady[\s\S]*?platformLegalReady/, "onboarding profile step must require platform legal acceptance before Next");
assert.match(onboardingPage, /polynet-onboarding-legal-reader message-text/, "onboarding legal documents must render in a scrollable modal reader");
assert.match(onboardingPage, /onConnectChatgpt/, "onboarding inference step must reuse ChatGPT provider flow");
assert.match(onboardingPage, /onConnectOpenAi/, "onboarding inference step must reuse OpenAI provider flow");
assert.match(onboardingPage, /Use your Plus or Pro plan limits/, "onboarding inference choice should clearly name ChatGPT plan limits");
assert.match(onboardingPage, /Recommended/, "onboarding inference choice should mark ChatGPT as recommended");
assert.match(onboardingPage, /Use a key from your OpenAI account/, "onboarding inference choice should clearly name the API key path");
assert.match(onboardingPage, /onSaveAgent/, "onboarding agent step must persist canonical agent settings");
assert.match(onboardingPage, /onFinishOnboarding/, "onboarding agent step must finish setup directly");
assert.doesNotMatch(onboardingPage, /Direction|onBuildCommunity|onDiscoverCommunity|polynet-onboarding-direction/, "onboarding must not expose a direction step");
assert.match(app, /async function finishOnboarding/, "app shell must finish account onboarding without a direction choice");
assert.match(app, /completeOnboarding: true/, "finish flow must mark onboarding complete explicitly");
assert.doesNotMatch(app, /onboardingDirection: destination|completeOnboarding\("build_community"|completeOnboarding\("discover_community"/, "finish flow must not store a direction choice");
assert.match(setupCard, /Finish account setup/, "workspace setup card must replace provider-only nudge");
assert.match(workspaceLandingProjection, /WebAccountSetupCard/, "workspace empty state must render the account setup card");

console.log("PASS: account setup completion contract is canonical.");
