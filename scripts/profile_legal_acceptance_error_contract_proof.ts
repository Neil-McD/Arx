import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const profiles = read("convex/profiles.ts");
const legalAcceptances = read("convex/legalAcceptances.ts");
const profileMutationErrors = read("shared/profileMutationErrors.ts");
const app = read("apps/web/src/App.tsx");
const onboardingProfileController = read(
  "apps/web/src/controllers/useWebOnboardingProfileController.ts",
);
const communityAdminController = read("shared/useCommunityAdminController.ts");

const profileCodes = [
  "profile_handle_taken",
  "profile_handle_empty",
  "profile_handle_reserved",
  "profile_handle_too_short",
  "profile_handle_too_long",
  "profile_handle_invalid_format",
  "profile_avatar_invalid",
  "profile_link_invalid_youtube",
  "profile_link_invalid_x",
  "profile_link_invalid_instagram",
  "platform_legal_versions_required",
  "terms_of_service_version_stale",
  "privacy_policy_version_stale",
  "profile_forbidden",
  "user_not_found",
];

assert.match(profiles, /import \{ ConvexError, v \} from "convex\/values"/, "profile mutations must import ConvexError");
assert.match(profiles, /function throwProfileMutationError/, "profile mutations must use one structured error helper");
assert.match(profiles, /throw new ConvexError\(\{ code, reason: code \}\)/, "profile helper must expose structured client-visible code data");
assert.doesNotMatch(profiles, /throw new Error\(`profile_handle_/, "profile handle validation must not throw redacted plain Errors");
assert.doesNotMatch(profiles, /throw new Error\(`profile_link_/, "profile link validation must not throw redacted plain Errors");
assert.doesNotMatch(profiles, /throw new Error\("profile_avatar_invalid"\)/, "profile avatar validation must not throw redacted plain Errors");
assert.doesNotMatch(profiles, /throw new Error\("platform_legal_versions_required"\)/, "platform legal validation must not throw redacted plain Errors");

assert.match(legalAcceptances, /import \{ ConvexError \} from "convex\/values"/, "legal acceptance validation must import ConvexError");
assert.match(legalAcceptances, /function throwPlatformLegalAcceptanceError/, "legal acceptance validation must use one structured error helper");
assert.doesNotMatch(legalAcceptances, /throw new Error\("terms_of_service_version_stale"\)/, "stale Terms version must not be redacted");
assert.doesNotMatch(legalAcceptances, /throw new Error\("privacy_policy_version_stale"\)/, "stale Privacy version must not be redacted");

assert.match(profileMutationErrors, /readObjectField\(error, "data"\)/, "web formatter must read ConvexError data");
assert.match(profileMutationErrors, /readObjectField\(data, "code"\)/, "web formatter must read structured code");
assert.match(profileMutationErrors, /readObjectField\(data, "reason"\)/, "web formatter must read structured reason fallback");
assert.match(profileMutationErrors, /isRedactedServerErrorMessage/, "web formatter must hide opaque server request IDs behind the caller fallback");
assert.match(onboardingProfileController, /import \{ formatProfileMutationError \} from "\.\.\/\.\.\/\.\.\/\.\.\/shared\/profileMutationErrors"/, "onboarding profile saves must use shared formatter");
assert.doesNotMatch(app, /function formatProfileMutationError/, "App must not keep a duplicate local profile formatter");
assert.match(communityAdminController, /import \{ formatProfileMutationError \} from "\.\/profileMutationErrors"/, "settings profile saves must use shared formatter");
assert.doesNotMatch(communityAdminController, /function formatProfileSaveError/, "community admin controller must not keep duplicate profile formatter");

for (const code of profileCodes) {
  assert.ok(profileMutationErrors.includes(code), `shared formatter missing ${code}`);
}

console.log("PASS: profile/legal acceptance errors preserve client-visible validation reasons.");
