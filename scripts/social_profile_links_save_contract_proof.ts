import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const socialFields = read("apps/web/src/components/WebSocialProfileLinksFields.tsx");
const adminController = read("shared/useCommunityAdminController.ts");
const profileSettings = read("apps/web/src/components/WebProfileSettingsSection.tsx");

assert.match(
  socialFields,
  /onSave\?: \(values: SocialProfileLinks\) => Promise<boolean \| void> \| boolean \| void/,
  "social link modal must be able to observe cloud save failure",
);
assert.match(
  socialFields,
  /const saved = await onSave\(nextLinks\);[\s\S]*if \(saved === false\) return;[\s\S]*onChange\(editingKind, nextLinks\[editingKind\]\);[\s\S]*closeEditor\(\);/,
  "settings social link modal must not close or mark local state saved when cloud save fails",
);
assert.match(
  socialFields,
  /type="text"[\s\S]*inputMode="url"/,
  "social link inputs must not use native URL validation because the app normalizer accepts schemeless profile URLs",
);
assert.doesNotMatch(
  socialFields,
  /type="url"/,
  "browser URL validation must not block schemeless social profile URLs before app normalization",
);

assert.match(
  adminController,
  /const saveProfileToCloud = useCallback\(async \(options: SaveProfileToCloudOptions = \{\}\): Promise<boolean>/,
  "profile saves must return a success boolean for modal callers",
);
assert.match(adminController, /return false;[\s\S]*onProfileSaveUnauthenticated/, "unauthenticated profile saves must report failure");
assert.match(adminController, /if \(!saved\) \{[\s\S]*return false;[\s\S]*\}/, "empty profile save responses must report failure");
assert.match(adminController, /catch \(error\) \{[\s\S]*return false;[\s\S]*\}/, "profile save exceptions must report failure");
assert.match(adminController, /setProfileSocialLinks\(saved\.social_links/, "successful saves must hydrate social links from server truth");

assert.match(
  profileSettings,
  /onSave=\{\(nextLinks\) => saveProfileToCloud\(\{ socialLinks: nextLinks \}\)\}/,
  "settings social icons must persist the edited links through the profile save path",
);

console.log("PASS: social profile link modal uses app validation and truthful cloud save state.");
