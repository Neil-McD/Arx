import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function readText(path: string | URL): string {
  return readFileSync(path, "utf8");
}

function assertIncludes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), `expected ${label} to include ${needle}`);
}

function main() {
  const personalMemory = readText(new URL("../convex/personalMemory.ts", import.meta.url));
  const settings = readText(new URL("../convex/settings.ts", import.meta.url));
  const settingsPanels = readText(
    new URL("../apps/web/src/components/WebSettingsPanels.tsx", import.meta.url),
  );

  assertIncludes(
    personalMemory,
    "resolveUserIdForAuthenticatedRequest({",
    "personal memory APIs resolve authenticated user",
  );
  assertIncludes(
    personalMemory,
    "personal_memory_item_access_denied",
    "personal memory item mutations enforce ownership",
  );
  assertIncludes(
    settings,
    "resolveUserIdForAuthenticatedRequest({",
    "memory settings APIs resolve authenticated user",
  );
  assert.ok(
    !settingsPanels.includes("Personal memory") &&
      !settingsPanels.includes("WebPersonalAccountSettingsSection"),
    "global Account settings must not expose personal memory",
  );
  assert.equal(
    existsSync("apps/web/src/components/WebPersonalAccountSettingsSection.tsx"),
    false,
    "retired personal Account presentation must be deleted",
  );

  console.log("PASS: personal memory backend remains authenticated-user scoped while its global Account UI is retired.");
}

main();
