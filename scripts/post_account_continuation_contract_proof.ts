import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const app = read("apps/web/src/App.tsx");
const onboardingPage = read("apps/web/src/components/WebOnboardingPage.tsx");
const onboardingProfile = read(
  "apps/web/src/controllers/useWebOnboardingProfileController.ts",
);
const pendingIntent = read(
  "apps/web/src/controllers/useWebPendingAuthIntentController.ts",
);

const completionBody =
  onboardingProfile.match(
    /const completeAccountSetup = useCallback[\s\S]*?\n  const continueAfterAccountSetup/,
  )?.[0] ?? "";
const continuationBody =
  onboardingProfile.match(
    /const continueAfterAccountSetup = useCallback[\s\S]*?\n  const completeAccountSetupAndContinue/,
  )?.[0] ?? "";


assert.match(
  completionBody,
  /upsertCloudProfileDetail[\s\S]*completeOnboarding: true[\s\S]*termsOfServiceVersion[\s\S]*privacyPolicyVersion/,
  "account identity, legal acceptance, and completion marker must share one profile mutation",
);
assert.match(
  completionBody,
  /!saved\?\.account_setup\?\.completed[\s\S]*return false/,
  "account completion must fail closed on canonical returned setup truth",
);
assert.equal(
  (completionBody.match(/upsertCloudProfileDetail/g) ?? []).length,
  1,
  "account completion must perform exactly one profile write",
);

const pendingIndex = continuationBody.indexOf("readAuthResumeState()");
const resumeIndex = continuationBody.indexOf("resumePendingAuthIntent()");
const defaultIndex = continuationBody.indexOf("enterDefaultDestination");
assert.ok(
  pendingIndex >= 0 && resumeIndex > pendingIndex && defaultIndex > resumeIndex,
  "post-account continuation must resume preserved intent before default entry",
);
assert.match(
  continuationBody,
  /if \(resumed\) return true;[\s\S]*return false;/,
  "a failed preserved intent must remain visible and must not fall through",
);
assert.doesNotMatch(
  onboardingProfile,
  /finishOnboarding|shouldNavigate|options\?\.navigate/,
  "account completion must not retain a navigation-mode switch",
);
assert.match(
  onboardingProfile,
  /accountCompletionContinuationInFlightRef\.current[\s\S]*completeAccountSetup\(legalAcceptance\)[\s\S]*continueAfterAccountSetup\(\)[\s\S]*accountCompletionContinuationInFlightRef\.current = false/,
  "double submission must not start competing post-account continuations",
);

// The platform bridge is the one account-setup entry left (Studio's /c/<slug>
// hands over to the community's site): it completes and continues in one step.
assert.match(
  app,
  /platformBridgePageProps:[\s\S]*onEnter: completeAccountSetupAndContinue/,
  "the platform bridge must delegate completion and continuation to one authority",
);

assert.match(
  onboardingPage,
  /onCompleteAccountSetup:[\s\S]*onSubmit=\{props\.onCompleteAccountSetup\}/,
  "modal onboarding must expose one completion callback",
);
assert.doesNotMatch(
  onboardingPage,
  /onNextProfile|onFinishOnboarding/,
  "modal onboarding must not split save and continuation callbacks",
);
assert.match(
  app,
  /onCompleteAccountSetup: completeAccountSetupAndContinue/,
  "App must wire modal onboarding to canonical continuation",
);

assert.match(
  pendingIntent,
  /if \(handled\) consumeAuthResumeStateIfCurrent\(resumeState\)/,
  "resume state must be consumed only after successful handling",
);

console.log(
  "PASS: account completion has one write and one pending-intent-first continuation authority.",
);
