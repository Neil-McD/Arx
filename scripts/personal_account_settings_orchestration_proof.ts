import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const app = read("apps/web/src/App.tsx");
const controller = read(
  "apps/web/src/controllers/useWebPersonalAccountSettingsController.ts",
);
const panels = read("apps/web/src/components/WebSettingsPanels.tsx");
const memoryData = read("shared/useWebMemorySettingsDataController.ts");
const memoryMutation = read("shared/useWebMemoryMutationController.ts");
const accountExport = read("shared/useWebAccountDataExportController.ts");

assert.match(
  app,
  /useWebPersonalAccountSettingsController<AuthSession>\(\{/,
  "App must instantiate one Personal Account orchestration boundary",
);
assert.match(
  app,
  /personalAccount:\s*\{[\s\S]*controller: personalAccountSettings/,
  "App must pass the Personal Account controller to settings presentation",
);
assert.doesNotMatch(
  app,
  /useWebPersonalMemoryUiController|useWebMemorySettingsDataController|useWebMemoryMutationController|useWeb(?:Agent|Account)DataExportController/,
  "App must not directly own Personal Account state or use-case hooks",
);
assert.doesNotMatch(
  app,
  /const \[(?:userMemorySettings|exportError|isExporting),|personalMemoryUi\./,
  "App must not retain Personal Account-local state",
);

for (const useCase of [
  "useWebMemorySettingsDataController",
  "useWebMemoryMutationController",
  "useWebAccountDataExportController",
]) {
  assert.match(
    controller,
    new RegExp(`${useCase}<SessionT>\\(\\{`),
    `Personal Account controller must compose ${useCase}`,
  );
}
assert.match(
  controller,
  /if \(!params\.session\) \{[\s\S]*setUserMemorySettings\(DEFAULT_USER_MEMORY_SETTINGS\);[\s\S]*setPersonalMemoryItems\(\[\]\);[\s\S]*setPersonalMemoryQuery\(""\);[\s\S]*setNewPersonalMemoryContent\(""\);/,
  "Personal Account controller must clear authenticated state on sign-out",
);
assert.match(
  controller,
  /function bindToActiveSession[\s\S]*if \(!activeSessionRef\.current\) return;/,
  "late Account data responses must not repopulate state after sign-out",
);
assert.match(
  controller,
  /if \(!params\.isAccountSettingsActive\) return;[\s\S]*window\.setTimeout\([\s\S]*searchPersonalMemoryItems\(query\);[\s\S]*150/,
  "Personal Account controller must own the bounded Account-route memory search lifecycle",
);
assert.match(
  controller,
  /await saveUserMemorySettings\(next\);[\s\S]*await params\.onUserMemorySettingsSaved\(\);/,
  "personal-agent saves must refresh canonical account setup state",
);

assert.match(
  panels,
  /personalAccount:\s*\{[\s\S]*controller: ReturnType<typeof useWebPersonalAccountSettingsController>/,
  "settings presentation must consume the typed Personal Account boundary",
);
assert.doesNotMatch(
  panels,
  /\bagent:\s*\{/,
  "settings presentation must not retain the stale Agent ownership bucket",
);

assert.match(
  memoryData,
  /loadCloudUserMemorySettings/,
  "memory settings reads must remain gateway-owned",
);
assert.match(
  memoryMutation,
  /scope: "global",[\s\S]*scopeId: null/,
  "new personal memory must remain global",
);
assert.match(
  accountExport,
  /polynet_threads\.csv[\s\S]*polynet_messages\.csv[\s\S]*polynet_personal_memory\.csv/,
  "Account exports must retain their canonical filenames",
);

assert.equal(
  existsSync("apps/web/src/controllers/useWebPersonalMemoryUiController.ts"),
  false,
  "the obsolete state-only personal-memory controller must be deleted",
);
assert.equal(
  existsSync("shared/useWebAgentDataExportController.ts"),
  false,
  "stale Agent export vocabulary must be deleted",
);

console.log(
  "PASS: Personal Account settings orchestration has one bounded web owner.",
);
