import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function occurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

const app = read("apps/web/src/App.tsx");
const model = read("apps/web/src/components/webAccountSetupSurfaceModel.ts");
const controller = read(
  "apps/web/src/controllers/useWebAccountSetupSurfaceController.ts",
);
const onboardingProfileController = read(
  "apps/web/src/controllers/useWebOnboardingProfileController.ts",
);
const communityEntryBridgeController = read(
  "apps/web/src/controllers/useWebCommunityEntryBridgeController.ts",
);
const onboarding = read("apps/web/src/components/WebOnboardingPage.tsx");
const bridge = read("apps/web/src/components/WebCommunityBridgeCard.tsx");
const form = read("apps/web/src/components/WebAccountSetupForm.tsx");

for (const group of ["identity", "submission"]) {
  assert.match(
    model,
    new RegExp(`\\b${group}: \\{`),
    `account-setup surface model must expose the ${group} projection`,
  );
}
for (const field of [
  "handleAvailability",
  "isCheckingHandleAvailability",
  "onAvatarUpload",
  "isSaving",
  "error",
]) {
  assert.ok(model.includes(field), `account-setup surface model missing ${field}`);
}

assert.match(
  controller,
  /checkCloudProfileHandleAvailability/,
  "surface controller must own handle-availability reads",
);
assert.match(
  controller,
  /window\.setTimeout\([\s\S]*260\)/,
  "surface controller must debounce handle-availability reads",
);
assert.match(
  controller,
  /availabilityRequestIdRef[\s\S]*cancelled[\s\S]*availabilityRequestIdRef\.current !== requestId/,
  "surface controller must reject stale or cancelled handle-availability reads",
);
assert.match(
  controller,
  /setHandleAvailability\(null\);[\s\S]*setIsCheckingHandleAvailability\(false\);[\s\S]*if \(!session \|\| !handle\) return;/,
  "surface controller must clear availability state for signed-out or empty-handle projections",
);
assert.match(
  controller,
  /displayName: profile\.profileName[\s\S]*submission: \{/,
  "surface controller must project profile and submission state into one model",
);
assert.doesNotMatch(
  `${model}\n${controller}`,
  /chatgpt|openai|apiKey|provider/i,
  "account setup must never ask a person to bring inference",
);
assert.doesNotMatch(
  controller,
  /upsertCloudProfileDetail|loadCloudAccountSetupStatus|resolveCloudMemberEntryDestination/,
  "surface controller must not absorb canonical completion or destination authority",
);

assert.equal(
  occurrences(app, "useWebAccountSetupSurfaceController<AuthSession>({"),
  1,
  "App must instantiate exactly one account-setup surface controller",
);
assert.equal(
  occurrences(app, "setup: accountSetupSurface.model"),
  3,
  "onboarding, platform bridge, and community bridge must share one surface model",
);
assert.doesNotMatch(
  app,
  /onboardingHandleAvailability|isCheckingOnboardingHandle|checkCloudProfileHandleAvailability|CloudProfileHandleAvailability/,
  "App must not retain the extracted handle-availability lifecycle",
);

for (const surface of [onboarding, bridge]) {
  assert.match(
    surface,
    /setup: WebAccountSetupSurfaceModel/,
    "each account-setup presentation must consume the typed shared model",
  );
  assert.match(
    surface,
    /<WebAccountSetupForm/,
    "each account-setup entry surface must delegate fields to the canonical form",
  );
  assert.doesNotMatch(
    surface,
    /props\.(?:displayName|handle|socialLinks|avatarUrl|handleAvailability|chatgptConnected|openAiConnected|isSaving|error)\b/,
    "account-setup presentations must not regress to wide duplicated props",
  );
}
assert.match(
  form,
  /const \{ identity, submission \} = props\.setup;/,
  "the canonical form must read the irreducible identity and submission groups",
);
for (const field of [
  "Display name",
  "Handle",
  "Terms of Service",
  "Privacy &amp; AI Data Policy",
  "WebUserAvatarEditorModal",
]) {
  assert.ok(form.includes(field), `canonical account-setup form missing ${field}`);
}
assert.doesNotMatch(
  `${onboarding}\n${bridge}`,
  /identity\.(?:onDisplayNameChange|onHandleChange|onAvatarUpload)|Terms of Service|Privacy &amp; AI Data Policy/,
  "entry wrappers must not duplicate account fields or legal controls",
);
assert.doesNotMatch(
  form,
  /<span>Bio<\/span>|web-social-profile-links|onSocialLinkChange/,
  "optional profile enrichment must remain outside blocking account setup",
);

for (const authority of [
  "const completeAccountSetup = useCallback",
  "const continueAfterAccountSetup = useCallback",
  "const completeAccountSetupAndContinue = useCallback",
]) {
  assert.ok(
    onboardingProfileController.includes(authority),
    `the onboarding profile controller must own ${authority}`,
  );
}
for (const authority of [
  "const completePlatformBridge = useCallback",
  "const completeCommunityBridge = useCallback",
]) {
  assert.ok(
    communityEntryBridgeController.includes(authority),
    `the community entry bridge must own ${authority}`,
  );
}
assert.match(
  app,
  /useWebOnboardingProfileController\(\{/,
  "App must compose the onboarding profile controller",
);
assert.match(
  communityEntryBridgeController,
  /completePlatformBridge[\s\S]*completeAccountSetupAndContinue/,
  "platform bridge must delegate to canonical account completion continuation",
);
assert.doesNotMatch(
  communityEntryBridgeController.match(
    /const completePlatformBridge = useCallback[\s\S]*?\n  const completeCommunityBridge/,
  )?.[0] ?? "",
  /resolveAndEnter|finishOnboarding|saveOnboardingProfile/,
  "platform bridge must not retain a competing destination or completion path",
);
assert.match(
  communityEntryBridgeController,
  /completeCommunityBridge[\s\S]*resolveDestination\(\{[\s\S]*communityId: entry\.communityId,[\s\S]*communitySlug: entry\.communitySlug,[\s\S]*destination\.page !== "community"/,
  "community bridge must revalidate the exact requested community before route entry",
);

console.log(
  "PASS: account setup has one typed surface projection and an explicit profile completion owner.",
);
