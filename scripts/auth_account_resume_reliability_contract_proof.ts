import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, "missing start marker: " + start);
  assert.ok(endIndex > startIndex, "missing end marker: " + end);
  return source.slice(startIndex, endIndex);
}

const accountSetup = read("shared/accountSetup.ts");
const authController = read(
  "apps/web/src/controllers/useWebAppAuthController.ts",
);
const onboardingController = read(
  "apps/web/src/controllers/useWebOnboardingProfileController.ts",
);
const builderCheckoutController = read(
  "apps/web/src/controllers/useWebPublicBuilderCheckoutController.ts",
);
const chatController = read(
  "apps/web/src/controllers/useWebCommunityChatController.ts",
);
const voiceController = read(
  "apps/web/src/controllers/useWebCommunityVoiceController.ts",
);
const createController = read("shared/useCommunityCreateController.ts");
const app = read("apps/web/src/App.tsx");

assert.match(
  accountSetup,
  /export type AccountSetupResolution =[\s\S]*"resolved"[\s\S]*"unauthenticated"[\s\S]*"unavailable"/,
  "account setup reads must distinguish authoritative state from unavailable state",
);

assert.match(
  authController,
  /type UsableAuthSessionResult =[\s\S]*"ready"[\s\S]*"missing"[\s\S]*"transient_failure"[\s\S]*"terminal_failure"/,
  "auth verification must preserve terminal versus transient outcomes",
);
assert.match(
  authController,
  /ensured\.status === "terminal_failure"[\s\S]*expireAuthSessionLocally\(\)[\s\S]*status: "terminal_failure"/,
  "only terminal auth verification may expire the local session",
);
assert.match(
  authController,
  /ensured\.status !== "ready"[\s\S]*status: "transient_failure"/,
  "non-terminal auth verification failures must remain transient",
);

const bootstrapEffect = sliceBetween(
  authController,
  "useEffect(() => {\n    if (authBootstrapCompleteRef.current) return;",
  "const isAuthResolvingSignedInState",
);
assert.match(
  bootstrapEffect,
  /usableSessionResult\.status === "transient_failure"[\s\S]*auth_bootstrap_temporarily_unavailable/,
  "transient bootstrap verification must enter recovery",
);
assert.match(
  bootstrapEffect,
  /setAuthError\([\s\S]*could not verify your session yet/,
  "bootstrap recovery must explain the temporary state",
);
const bootstrapCatchStart = bootstrapEffect.lastIndexOf("} catch (error) {");
const bootstrapCatchEnd = bootstrapEffect.indexOf(
  "    })();",
  bootstrapCatchStart,
);
const bootstrapCatch = bootstrapEffect.slice(
  bootstrapCatchStart,
  bootstrapCatchEnd,
);
assert.doesNotMatch(
  bootstrapCatch,
  /markAuthBootstrapComplete/,
  "a thrown bootstrap request must not become a signed-out presentation",
);
assert.match(
  bootstrapEffect,
  /params\.resumeEpoch/,
  "an incomplete bootstrap must retry when the installed app resumes",
);
const sessionAvailableCallback = sliceBetween(
  authController,
  "onSessionAvailable: (currentSession) => {",
  "onSessionMissing: () => {",
);
assert.doesNotMatch(
  sessionAvailableCallback,
  /markAuthBootstrapComplete/,
  "a cached session becoming available must not complete bootstrap before verification",
);

assert.match(
  onboardingController,
  /refreshAccountSetupStatus[\s\S]*Promise<AccountSetupResolution>/,
  "account setup refresh must return an explicit resolution",
);
assert.match(
  onboardingController,
  /isAccountSetupResolved =\s*!params\.session \|\| Boolean\(effectiveAccountSetupStatus\)/,
  "signed-out actions must continue to the existing authentication gate",
);
assert.match(
  onboardingController,
  /if \(!usableSession\) \{[\s\S]*status: "unavailable"/,
  "a temporarily unusable session must not become incomplete setup",
);
assert.doesNotMatch(
  onboardingController,
  /!latestSetup\?\.completed/,
  "finishing onboarding must not treat unavailable setup authority as incomplete",
);
const routeTry = sliceBetween(
  onboardingController,
  "const routeTryPolynetFree = useCallback",
  "const resetSignedOutState",
);
assert.match(
  routeTry,
  /if \(!setup\) return "unavailable"/,
  "missing setup evidence must remain unavailable",
);
assert.match(
  routeTry,
  /if \(setup\.completed\)[\s\S]*enterDefaultDestination/,
  "confirmed completed setup must enter the member destination",
);
assert.match(
  routeTry,
  /navigateTo\("\/onboarding"\)[\s\S]*return "onboarding"/,
  "only confirmed incomplete setup may open onboarding",
);
const routeCatch = routeTry.slice(routeTry.lastIndexOf("} catch {"));
assert.doesNotMatch(
  routeCatch,
  /navigateTo\("\/onboarding"\)/,
  "profile lookup failures must never fall through to onboarding",
);
assert.match(
  onboardingController,
  /params\.resumeEpoch[\s\S]*routeTryPolynetFree/,
  "failed onboarding resolution must be retryable on app resume",
);

assert.match(
  builderCheckoutController,
  /status === "unavailable"[\s\S]*showToast[\s\S]*return;[\s\S]*scrubCurrentRouteSearchParams/,
  "paid Builder return must retain its recovery marker while setup is unavailable",
);
assert.match(
  builderCheckoutController,
  /params\.resumeEpoch/,
  "paid Builder recovery must retry when the installed app resumes",
);
assert.doesNotMatch(
  builderCheckoutController,
  /!latestAccountSetupStatus\?\.completed/,
  "paid Builder return must not collapse an unavailable read into incomplete setup",
);

for (const [name, source] of [
  ["chat", chatController],
  ["voice", voiceController],
  ["community creation", createController],
] as const) {
  assert.match(
    source,
    /is(?:Profile|Account)SetupResolved/,
    name + " must receive explicit setup-resolution state",
  );
  assert.match(
    source,
    /still verifying your account/,
    name + " must hold rather than opening onboarding while setup is unresolved",
  );
}
assert.match(
  app,
  /isProfileSetupResolved: isAccountSetupResolved/,
  "the app must pass setup resolution into member actions",
);
assert.match(
  app,
  /isAccountSetupResolved,[\s\S]*isAccountSetupComplete:/,
  "the app must pass setup resolution into community creation",
);

console.log(
  "PASS: transient auth and account-setup failures preserve installed-app continuity.",
);
