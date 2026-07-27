import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readText(path: string | URL): string {
  return readFileSync(path, "utf8");
}

function assertIncludes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), `expected ${label} to include ${needle}`);
}

function assertNotIncludes(haystack: string, needle: string, label: string) {
  assert.ok(!haystack.includes(needle), `expected ${label} not to include ${needle}`);
}

function main() {
  const personalMemory = readText(new URL("../convex/personalMemory.ts", import.meta.url));
  const settings = readText(new URL("../convex/settings.ts", import.meta.url));
  const personalMemorySettings = readText(
    new URL("../apps/web/src/components/WebPersonalMemorySettingsSection.tsx", import.meta.url),
  );
  const memorySettingsData = readText(
    new URL("../shared/useWebMemorySettingsDataController.ts", import.meta.url),
  );
  const memoryMutation = readText(
    new URL("../shared/useWebMemoryMutationController.ts", import.meta.url),
  );
  const dataExport = readText(
    new URL("../shared/useWebAccountDataExportController.ts", import.meta.url),
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
  assertNotIncludes(
    personalMemorySettings,
    "Personal memory is included with Builder.",
    "personal memory UI is not Builder-only",
  );
  assertIncludes(
    memorySettingsData,
    "memory_mode: normalizeMemoryMode(row?.memory_mode)",
    "memory settings loader preserves stored mode",
  );
  assertIncludes(
    memoryMutation,
    "rememberIntentEnabled: Boolean(normalizedNext.remember_intent_enabled)",
    "memory settings mutation preserves the authenticated user's remember-intent choice",
  );
  assertIncludes(
    dataExport,
    "listCloudPersonalMemoryRows({",
    "account data export retains authenticated personal-memory export",
  );

  console.log("PASS: personal memory is authenticated-user scoped and not Builder-gated.");
}

main();
