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
// Name and bio limits live in one validator, run first by every profile write
// (Studio's and the private twin's) before auth synchronization or database writes.
const textValidator = profiles.match(
  /function validateProfileDetailText\([\s\S]*?\n\}/,
)?.[0] ?? "";
assert.ok(textValidator, "profile text validator must remain discoverable");
assert.match(textValidator, /validateProfileDisplayName[\s\S]*profile_display_name_too_long/);
assert.match(textValidator, /validateProfileBio[\s\S]*profile_bio_too_long/);
const twinHandler = profiles.match(
  /export const updateProfileDetailForTrustedUserInternal = internalMutation\([\s\S]*?\n\}\);/,
)?.[0] ?? "";
for (const [name, handler, write] of [
  ["upsertProfileDetail", mutationHandler, "ensureAuthenticatedActor"],
  ["updateProfileDetailForTrustedUserInternal", twinHandler, "writeProfileDetailForUser"],
] as const) {
  assert.ok(handler, `${name} must remain discoverable`);
  const validated = handler.indexOf("validateProfileDetailText(");
  assert.ok(validated >= 0 && validated < handler.indexOf(write), `${name} must validate name and bio before ${write}`);
}

for (const surface of [onboarding, settings]) {
  assert.match(surface, /maxLength=\{PROFILE_DISPLAY_NAME_MAX_CHARS\}/);
}
assert.match(settings, /maxLength=\{PROFILE_BIO_MAX_CHARS\}/);
assert.match(errors, /profile_display_name_too_long: "Display name must be 120 characters or less\."/);
assert.match(errors, /profile_bio_too_long: "Bio must be 500 characters or less\."/);

console.log("PASS: canonical profile text limits are enforced before writes and mirrored in the UI.");
