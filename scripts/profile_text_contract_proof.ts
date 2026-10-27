import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PROFILE_BIO_MAX_CHARS,
  PROFILE_DISPLAY_NAME_MAX_CHARS,
  validateProfileBio,
  validateProfileDisplayName,
} from "../shared/profileText.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

assert.deepEqual(validateProfileDisplayName("  Neil McDevitt  "), {
  ok: true,
  value: "Neil McDevitt",
});
assert.deepEqual(validateProfileDisplayName(" "), { ok: true, value: null });
assert.equal(validateProfileDisplayName("n".repeat(PROFILE_DISPLAY_NAME_MAX_CHARS)).ok, true);
assert.deepEqual(
  validateProfileDisplayName("n".repeat(PROFILE_DISPLAY_NAME_MAX_CHARS + 1)),
  { ok: false, reason: "too_long" },
);

assert.deepEqual(validateProfileBio(null), { ok: true, value: null });
assert.equal(validateProfileBio("b".repeat(PROFILE_BIO_MAX_CHARS)).ok, true);
assert.deepEqual(validateProfileBio("b".repeat(PROFILE_BIO_MAX_CHARS + 1)), {
  ok: false,
  reason: "too_long",
});

const profiles = read("convex/profiles.ts");
const onboarding = read("apps/web/src/components/WebAccountSetupForm.tsx");
const settings = read("apps/web/src/components/WebProfileSettingsSection.tsx");
const errors = read("shared/profileMutationErrors.ts");

const mutationHandler = profiles.match(
  /export const upsertProfileDetail = mutation\([\s\S]*?\n\}\);/,
)?.[0] ?? "";
assert.ok(mutationHandler, "profile mutation must remain discoverable");
assert.ok(
  mutationHandler.indexOf("validateProfileDisplayName") <
    mutationHandler.indexOf("ensureAuthenticatedActor"),
  "display name must be validated before auth synchronization or database writes",
);
assert.ok(
  mutationHandler.indexOf("validateProfileBio") <
    mutationHandler.indexOf("ensureAuthenticatedActor"),
  "bio must be validated before auth synchronization or database writes",
);
assert.match(mutationHandler, /profile_display_name_too_long/);
assert.match(mutationHandler, /profile_bio_too_long/);

for (const surface of [onboarding, settings]) {
  assert.match(surface, /maxLength=\{PROFILE_DISPLAY_NAME_MAX_CHARS\}/);
}
assert.match(settings, /maxLength=\{PROFILE_BIO_MAX_CHARS\}/);
assert.match(errors, /profile_display_name_too_long: "Display name must be 120 characters or less\."/);
assert.match(errors, /profile_bio_too_long: "Bio must be 500 characters or less\."/);

console.log("PASS: canonical profile text limits are enforced before writes and mirrored in the UI.");
