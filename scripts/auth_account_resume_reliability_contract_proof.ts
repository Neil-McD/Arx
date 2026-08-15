import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  APP_ADMISSION_TIMEOUT_MS,
  AsyncDeadlineError,
  withAsyncDeadline,
} from "../shared/asyncDeadline.ts";
import { commitIfAsyncEpochCurrent } from "../shared/asyncEpoch.ts";
import {
  fetchWithAuthShared,
  refreshAuthSessionWithLockResult,
  type AuthSession,
  type AuthSessionRefreshResult,
} from "../shared/authCore.ts";

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
  APP_ADMISSION_TIMEOUT_MS,
  10_000,
  "all app-admission authorities must share one finite deadline",
);

const epochRef = { current: 0 };
let adoptedSession = "none";
const staleAdoption = Promise.resolve().then(() =>
  commitIfAsyncEpochCurrent(epochRef, 0, () => {
    adoptedSession = "stale";
  })
);
epochRef.current += 1;
assert.equal(
  await staleAdoption,
  false,
  "async work from an obsolete authentication epoch must not commit",
);
assert.equal(adoptedSession, "none");
assert.equal(
  commitIfAsyncEpochCurrent(epochRef, 1, () => {
    adoptedSession = "current";
  }),
  true,
  "the current authentication epoch must still be able to commit",
);
assert.equal(adoptedSession, "current");

const refreshInFlightRef: {
  current: {
    lockKey: number;
    promise: Promise<AuthSessionRefreshResult>;
  } | null;
} = { current: null };
let resolveOldRefresh!: (result: AuthSessionRefreshResult) => void;
let resolveCurrentRefresh!: (result: AuthSessionRefreshResult) => void;
let refreshCalls = 0;
let currentRefreshEpoch = 0;
let oldEpochAdoptions = 0;
let currentEpochAdoptions = 0;
const oldRefresh = refreshAuthSessionWithLockResult({
  inFlightRef: refreshInFlightRef,
  lockKey: 0,
  isLockKeyCurrent: (lockKey) => currentRefreshEpoch === lockKey,
  refreshSession: () => {
    refreshCalls += 1;
    return new Promise<AuthSessionRefreshResult>((resolve) => {
      resolveOldRefresh = resolve;
    });
  },
  onRefreshed: () => {
    oldEpochAdoptions += 1;
  },
});
const joinedOldRefresh = refreshAuthSessionWithLockResult({
  inFlightRef: refreshInFlightRef,
  lockKey: 0,
  isLockKeyCurrent: (lockKey) => currentRefreshEpoch === lockKey,
  refreshSession: async () => {
    throw new Error("same_epoch_refresh_must_join_existing_work");
  },
  onRefreshed: () => {
    oldEpochAdoptions += 1;
  },
});
assert.equal(refreshCalls, 1, "same-epoch refreshes must share one request");
currentRefreshEpoch = 1;
const currentRefresh = refreshAuthSessionWithLockResult({
  inFlightRef: refreshInFlightRef,
  lockKey: 1,
  isLockKeyCurrent: (lockKey) => currentRefreshEpoch === lockKey,
  refreshSession: () => {
    refreshCalls += 1;
    return new Promise<AuthSessionRefreshResult>((resolve) => {
      resolveCurrentRefresh = resolve;
    });
  },
  onRefreshed: () => {
    currentEpochAdoptions += 1;
  },
});
const oldEpochSession: AuthSession = {
  access_token: "old-epoch-token",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "old-epoch-user" },
};
resolveOldRefresh({ status: "refreshed", session: oldEpochSession });
assert.deepEqual(await oldRefresh, {
  status: "transient_failure",
  reason: "session_changed",
});
assert.deepEqual(await joinedOldRefresh, {
  status: "transient_failure",
  reason: "session_changed",
});
assert.equal(
  oldEpochAdoptions,
  0,
  "a stale refreshed session must not reach its adoption callback",
);
assert.equal(
  refreshInFlightRef.current?.lockKey,
  1,
  "settling stale refresh work must not clear the current epoch lock",
);
const currentEpochSession: AuthSession = {
  access_token: "current-epoch-token",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "current-epoch-user" },
};
resolveCurrentRefresh({ status: "refreshed", session: currentEpochSession });
assert.deepEqual(await currentRefresh, {
  status: "refreshed",
  session: currentEpochSession,
});
assert.equal(currentEpochAdoptions, 1, "the current epoch must still adopt refreshes");
assert.equal(
  refreshCalls,
  2,
  "a new authentication epoch must not join stale refresh work",
);

const expiredSession: AuthSession = {
  access_token: "expired-token",
  expires_at: 0,
  user: { id: "stale-send-user" },
};
const staleSendInFlightRef = { current: null } as {
  current: {
    lockKey: number;
    promise: Promise<AuthSessionRefreshResult>;
  } | null;
};
let staleSendEpoch = 0;
let resolveStaleSendRefresh!: (result: AuthSessionRefreshResult) => void;
let markStaleSendRefreshStarted!: () => void;
const staleSendRefreshStarted = new Promise<void>((resolve) => {
  markStaleSendRefreshStarted = resolve;
});
let authenticatedFetchCalls = 0;
let expiredCallbacks = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  authenticatedFetchCalls += 1;
  return new Response(null, { status: 200 });
};
try {
  const staleSendRequest = fetchWithAuthShared({
    url: "https://example.invalid/private",
    init: {},
    session: expiredSession,
    sessionRef: { current: expiredSession },
    refreshLocked: async () => null,
    refreshLockedResult: () => refreshAuthSessionWithLockResult({
      inFlightRef: staleSendInFlightRef,
      lockKey: 0,
      isLockKeyCurrent: (lockKey) => staleSendEpoch === lockKey,
      refreshSession: () => {
        markStaleSendRefreshStarted();
        return new Promise<AuthSessionRefreshResult>((resolve) => {
          resolveStaleSendRefresh = resolve;
        });
      },
      onRefreshed: () => {
        throw new Error("stale_refresh_must_not_be_adopted");
      },
    }),
    onSessionExpired: () => {
      expiredCallbacks += 1;
    },
  });
  await staleSendRefreshStarted;
  staleSendEpoch = 1;
  resolveStaleSendRefresh({
    status: "refreshed",
    session: {
      ...expiredSession,
      access_token: "obsolete-refreshed-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    },
  });
  await assert.rejects(
    staleSendRequest,
    /Auth refresh is temporarily unavailable/,
    "a request waiting on a stale refresh must fail transiently",
  );
  assert.equal(
    authenticatedFetchCalls,
    0,
    "a stale refreshed token must never trigger an authenticated send",
  );
  assert.equal(
    expiredCallbacks,
    0,
    "a stale refresh is transient and must not expire the current session",
  );
} finally {
  globalThis.fetch = originalFetch;
}

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
  asyncDeadline,
  /APP_ADMISSION_TIMEOUT_MS = 10_000/,
  "app admission must define one finite recovery boundary",
);
assert.match(
  bootstrapSession,
  /timeoutMs: APP_ADMISSION_TIMEOUT_MS/,
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
  /refreshAuthSessionResult[\s\S]*timeoutMs: APP_ADMISSION_TIMEOUT_MS/,
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
  /commitIfAsyncEpochCurrent\([\s\S]*authSessionEpochRef[\s\S]*expectedEpoch/,
  "session adoption must commit only inside its captured authentication epoch",
);
assert.match(
  authCore,
  /lockKey: number[\s\S]*inFlightRef\.current\?\.lockKey === lockKey[\s\S]*inFlightRef\.current\?\.promise === promise/,
  "session refresh locking must not share or clear work across authentication epochs",
);
assert.match(
  authController,
  /epochAtBootstrapStart[\s\S]*adoptAuthSession\([\s\S]*epochAtBootstrapStart/,
  "initial bootstrap must adopt only inside its captured authentication epoch",
);
assert.match(
  authController,
  /AUTH_SIGNED_OUT_INTENT_KEY[\s\S]*authBootstrapAttemptIdRef\.current \+= 1;[\s\S]*markAuthBootstrapComplete\(\)/,
  "cross-tab sign-out must invalidate old bootstrap work and finish signed-out presentation",
);
assert.match(
  authController,
  /epochAtSessionAvailable[\s\S]*onSessionReadyRef\.current[\s\S]*onSessionLostRef\.current/,
  "late session-ready work must be cleaned up when its authentication epoch becomes stale",
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
