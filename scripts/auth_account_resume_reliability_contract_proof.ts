import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AsyncDeadlineError,
  withAsyncDeadline,
} from "../shared/asyncDeadline.ts";

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
const authResumeState = read("shared/authResumeState.ts");
const pendingAuthIntentController = read(
  "apps/web/src/controllers/useWebPendingAuthIntentController.ts",
);
const authController = read(
  "apps/web/src/controllers/useWebAppAuthController.ts",
);
const authCore = read("shared/authCore.ts");
const asyncDeadline = read("shared/asyncDeadline.ts");
const convexAuthenticatedClient = read("shared/convexAuthenticatedClient.ts");
const convexAuthSessionProbe = read("shared/convexAuthSessionProbe.ts");
const onboardingController = read(
  "apps/web/src/controllers/useWebOnboardingProfileController.ts",
);
const builderCheckoutController = read(
  "apps/web/src/controllers/useWebPublicBuilderCheckoutController.ts",
);
const publicFunnelActions = read(
  "apps/web/src/controllers/useWebPublicFunnelActions.ts",
);
const chatController = read(
  "apps/web/src/controllers/useWebCommunityChatController.ts",
);
const voiceController = read(
  "apps/web/src/controllers/useWebCommunityVoiceController.ts",
);
const createController = read("shared/useCommunityCreateController.ts");
const app = read("apps/web/src/App.tsx");

assert.equal(
  await withAsyncDeadline(Promise.resolve("ready"), {
    timeoutMs: 50,
    code: "proof_timeout",
  }),
  "ready",
  "deadline helper must preserve work that settles in time",
);
await assert.rejects(
  withAsyncDeadline(new Promise<never>(() => {}), {
    timeoutMs: 5,
    code: "proof_timeout",
  }),
  (error: unknown) =>
    error instanceof AsyncDeadlineError &&
    error.code === "proof_timeout" &&
    error.timeoutMs === 5,
  "deadline helper must reject stalled work with a stable typed error",
);

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
const sameOriginAuthCall = sliceBetween(
  authCore,
  "async function callSameOriginAuthEndpoint",
  "function asObject",
);
assert.match(
  sameOriginAuthCall,
  /new AbortController\(\)[\s\S]*window\.setTimeout\(\(\) => controller\.abort\(\), params\.timeoutMs\)/,
  "same-origin auth calls must support a bounded request lifetime",
);
assert.match(
  sameOriginAuthCall,
  /signal: controller\.signal[\s\S]*window\.clearTimeout\(timeoutId\)/,
  "bounded auth calls must pass and clear their abort signal",
);
const bootstrapSession = sliceBetween(
  authCore,
  "export async function bootstrapSessionDetailed",
  "export async function bootstrapSession()",
);
assert.match(
  authCore,
  /AUTH_SESSION_BOOTSTRAP_TIMEOUT_MS = 10_000/,
  "session bootstrap must define a finite recovery boundary",
);
assert.match(
  bootstrapSession,
  /timeoutMs: AUTH_SESSION_BOOTSTRAP_TIMEOUT_MS/,
  "session bootstrap must use the bounded auth request",
);
assert.match(
  asyncDeadline,
  /AsyncDeadlineError[\s\S]*Promise\.race[\s\S]*clearTimeout/,
  "critical remote admission work must have a reusable finite deadline",
);
assert.match(
  convexAuthenticatedClient,
  /withAsyncDeadline\([\s\S]*auth:bootstrapActor[\s\S]*convex_bootstrap_actor_timeout/,
  "Convex actor bootstrap must terminate with an explicit timeout",
);
assert.match(
  convexAuthSessionProbe,
  /withAsyncDeadline\([\s\S]*auth:getActor[\s\S]*convex_get_actor_timeout/,
  "Convex actor verification must terminate with an explicit timeout",
);
assert.match(
  authCore,
  /refreshAuthSessionResult[\s\S]*timeoutMs: AUTH_SESSION_BOOTSTRAP_TIMEOUT_MS/,
  "session refresh must use the same finite auth gateway boundary",
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
  /setAuthBootstrapStatus\("failed"\)[\s\S]*setAuthError\([\s\S]*could not verify your session yet/,
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
assert.doesNotMatch(
  bootstrapEffect,
  /params\.resumeEpoch/,
  "resume events must not restart an in-flight initial bootstrap",
);
assert.match(
  authController,
  /const retryAuthBootstrap = useCallback[\s\S]*setAuthBootstrapStatus\("resolving"\)[\s\S]*setAuthBootstrapAttempt/,
  "failed bootstrap must expose an explicit in-app retry attempt",
);
assert.match(
  authController,
  /verification_failed[\s\S]*retryAuthBootstrap/,
  "temporary verification failure must be distinct from signed-out state",
);
assert.match(
  app,
  /if \(authError\) \{[\s\S]*retryAuthBootstrap\(\)/,
  "auth recovery must retry in-app instead of reloading the document",
);
assert.doesNotMatch(
  app,
  /if \(authError\) \{[\s\S]{0,120}window\.location\.reload/,
  "auth recovery must not depend on a full-page reload",
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
assert.doesNotMatch(
  onboardingController,
  /accountSetupResolutionState|isLoadingAccountSetupStatus/,
  "account setup must not retain write-only resolution or loading state",
);
assert.match(
  authResumeState,
  /consumeAuthResumeStateIfCurrent[\s\S]*current\.created_at_ms !== expected\.created_at_ms[\s\S]*current\.intent[\s\S]*removeItem/,
  "auth resume consumption must compare the current stored intent before clearing it",
);
assert.match(
  pendingAuthIntentController,
  /const handled = await routePendingAuthIntent\(resumeState\.intent[\s\S]*if \(handled\) consumeAuthResumeStateIfCurrent\(resumeState\)/,
  "pending auth intent must be consumed only after its continuation reports success",
);
assert.doesNotMatch(
  pendingAuthIntentController,
  /clearAuthResumeState\(\)[\s\S]*routePendingAuthIntent/,
  "pending auth intent must not be cleared before dispatch",
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
assert.match(
  builderCheckoutController,
  /!accountSetupResolution\.accountSetup\.completed[\s\S]*reason: "resume_builder_checkout"[\s\S]*navigateTo\("\/onboarding"\)/,
  "paid Builder recovery must survive account setup before continuing",
);
assert.match(
  publicFunnelActions,
  /resolveAccountSetupStatus\(session\)[\s\S]*!accountSetup\.accountSetup\.completed[\s\S]*reason: "join_public_community"[\s\S]*onAccountSetupRequired\(\)/,
  "free and approval joins must preserve their destination while account setup runs",
);
assert.match(
  onboardingController,
  /readAuthResumeState\(\)[\s\S]*resumePendingAuthIntent\(\)[\s\S]*if \(resumed\) return true/,
  "completed onboarding must resume the preserved commercial or community intent",
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
