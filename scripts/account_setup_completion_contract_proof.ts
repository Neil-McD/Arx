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
const onboardingPage = read("apps/web/src/components/WebOnboardingPage.tsx");
const setupCard = read("apps/web/src/components/WebAccountSetupCard.tsx");
const workspaceLandingProjection = read("apps/web/src/controllers/buildWebWorkspaceLandingProjection.tsx");

assert.match(schema, /handle: v\.optional\(v\.string\(\)\)/, "users table must store a public profile handle");
assert.match(schema, /normalizedHandle: v\.optional\(v\.string\(\)\)/, "users table must store normalized handle");
assert.match(schema, /\.index\("by_normalizedHandle", \["normalizedHandle"\]\)/, "normalized handle must be indexed");
assert.match(schema, /onboardingDirection: v\.optional\(/, "profile details must store onboarding direction");
assert.match(schema, /displayName: v\.optional\(v\.string\(\)\)/, "profile details must store first-party display name evidence");
assert.match(schema, /avatarUrl: v\.optional\(v\.string\(\)\)/, "profile details must store first-party avatar evidence");
assert.match(schema, /agentName: v\.optional\(v\.string\(\)\)/, "user memory settings must store agent name");

assert.match(profileHandle, /export function validateProfileHandle/, "profile handle validator must be shared");
assert.match(profileHandle, /RESERVED_PROFILE_HANDLES/, "profile handles must have a reserved namespace list");
assert.match(profileHandle, /\^\[a-z0-9\]/, "profile handles must use a constrained public namespace");

for (const marker of [
  '"identity"',
  '"inference"',
  '"agent"',
  '"direction"',
  '"display_name"',
  '"avatar"',
  '"inference_provider"',
  '"agent_name"',
]) {
  assert.ok(accountSetup.includes(marker), `account setup model missing ${marker}`);
}
assert.match(accountSetup, /export function buildAccountSetupStatus/, "setup completion must be derived by one helper");
assert.doesNotMatch(accountSetup, /identityMissing\.push\("handle"\)/, "profile setup must not require handle");
assert.doesNotMatch(accountSetup, /identityMissing\.push\("bio"\)/, "profile setup must not require bio");
assert.doesNotMatch(accountSetup, /agentMissing\.push\("agent_soul"\)/, "agent setup must not require soul text");
assert.doesNotMatch(accountSetup, /directionMissing/, "path selection must not gate account setup completion");

assert.match(profiles, /validateProfileHandle/, "profile mutations must validate handles");
assert.match(profiles, /assertHandleAvailable/, "profile mutations must enforce handle availability");
assert.match(profiles, /export const checkHandleAvailability = query/, "profile handle availability must be queryable before save");
assert.match(profiles, /withIndex\("by_normalizedHandle"/, "handle uniqueness check must use normalized handle index");
assert.match(profiles, /export const getMyAccountSetupStatus = query/, "profiles must expose authenticated setup status");
assert.match(profiles, /loadAccountSetupStatusForUser/, "profiles must use the shared Convex setup derivation helper");
assert.match(accountSetupCore, /buildAccountSetupStatusForRows/, "Convex setup derivation must support bulk operator attribution");
assert.match(accountSetupCore, /displayName: params\.detail\?\.displayName \?\? null/, "profile completion must use first-party profile detail display name");
assert.match(accountSetupCore, /avatarUrl: params\.detail\?\.avatarUrl \?\? null/, "profile completion must use first-party profile detail avatar");
assert.doesNotMatch(accountSetupCore, /displayName: params\.user\.displayName/, "auth-seeded display name must not complete account setup");
assert.doesNotMatch(accountSetupCore, /avatarUrl: params\.user\.avatarUrl/, "auth-seeded avatar must not complete account setup");
assert.doesNotMatch(convexAuthenticatedClient, /resolveAuthSessionDisplayName|resolveAuthSessionAvatarUrl/, "Convex bootstrap must not send provider profile metadata");
assert.doesNotMatch(authBootstrap, /args\.identity\.displayName|args\.identity\.avatarUrl/, "auth bootstrap must not seed provider profile metadata");
assert.match(accountSetupCore, /query\("userProviderConnections"\)/, "inference completion must derive from provider connections");
assert.match(accountSetupCore, /query\("userMemorySettings"\)/, "agent completion must derive from user memory settings");
assert.match(profiles, /account_setup: await loadAccountSetupStatusForUser/, "onboarding profile responses must include setup status");

assert.match(settings, /agentName: v\.optional\(v\.string\(\)\)/, "settings mutation must accept agent name");
assert.match(settings, /agent_name: row\.agentName/, "settings query must return agent_name");
assert.match(settings, /agentName: nextAgentName/, "settings mutation must persist agent name");

assert.match(profileGateway, /type \{ AccountSetupStatus \}/, "profile gateway must expose setup status type");
assert.match(profileGateway, /handle\?: string \| null/, "profile gateway must expose handle");
assert.match(profileGateway, /account_setup\?: AccountSetupStatus \| null/, "profile gateway must expose account setup status");
assert.match(profileGateway, /profiles:getMyAccountSetupStatus/, "profile gateway must load setup status");
assert.match(profileGateway, /profiles:checkHandleAvailability/, "profile gateway must expose handle availability");
assert.match(profileGateway, /onboardingDirection\?: "build_community"/, "profile gateway must save onboarding direction");

assert.match(settingsGateway, /agent_name\?: unknown/, "settings gateway must load agent_name");
assert.match(settingsGateway, /agentName\?: string/, "settings gateway must save agentName");

assert.match(communityTypes, /AccountSetupStatus/, "shared profile types must expose account setup status");
assert.match(communityTypes, /account_setup\?: AccountSetupStatus \| null/, "profile details must carry setup status");

assert.match(onboardingPage, /accountSetupStatus: AccountSetupStatus \| null/, "onboarding UI must consume canonical setup status");
assert.match(onboardingPage, /handleAvailability: ProfileHandleAvailability \| null/, "onboarding profile step should show handle availability");
assert.match(onboardingPage, /<span>Bio<\/span>/, "onboarding profile step should expose bio");
assert.doesNotMatch(onboardingPage, /profileHandleHint|polynet-onboarding-handle-field|step === "identity" && !.*handle/, "onboarding profile step must not require handle");
assert.match(onboardingPage, /onConnectChatgpt/, "onboarding inference step must reuse ChatGPT provider flow");
assert.match(onboardingPage, /onConnectOpenAi/, "onboarding inference step must reuse OpenAI provider flow");
assert.match(onboardingPage, /Use your Plus or Pro plan limits/, "onboarding inference choice should clearly name ChatGPT plan limits");
assert.match(onboardingPage, /Recommended/, "onboarding inference choice should mark ChatGPT as recommended");
assert.match(onboardingPage, /Use a key from your OpenAI account/, "onboarding inference choice should clearly name the API key path");
assert.doesNotMatch(onboardingPage, /Learn about Polynet|onLearnAboutPolynet/, "onboarding direction should only offer build or discover");
assert.match(onboardingPage, /onSaveAgent/, "onboarding agent step must persist canonical agent settings");
assert.match(setupCard, /Finish account setup/, "workspace setup card must replace provider-only nudge");
assert.match(workspaceLandingProjection, /WebAccountSetupCard/, "workspace empty state must render the account setup card");

console.log("PASS: account setup completion contract is canonical.");
