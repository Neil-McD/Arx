import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const account = read("convex/account.ts");
const accountLifecycle = read("convex/accountLifecycle.ts");
const app = read("apps/web/src/App.tsx");
const accountSettings = read("apps/web/src/components/WebAccountSettingsSection.tsx");
const settingsPanels = read("apps/web/src/components/WebSettingsPanels.tsx");
const quarantineCode = "account_delete_lifecycle_migration_blocked";

assert.match(account, /resolveAuthenticatedActor/, "the quarantine must resolve an existing verified actor without provisioning");
assert.doesNotMatch(account, /ensureAuthenticatedActor/, "the quarantine must not create an account before rejecting deletion");
assert.match(account, /throw new ConvexError/, "the quarantine must expose a structured client-visible blocker");
assert.equal((account.match(new RegExp(quarantineCode, "g")) ?? []).length, 1, "the backend must expose only the lifecycle quarantine code");
assert.equal((account.match(/export const /g) ?? []).length, 1, "account.ts must expose only the quarantined delete mutation");

for (const forbidden of [
  /ctx\.db/,
  /ctx\.storage/,
  /ctx\.scheduler/,
  /\.delete\(/,
  /\.patch\(/,
  /\.insert\(/,
  /runMutation/,
  /runAction/,
  /recordCriticalAudit/,
  /deleteRowsByIndex/,
  /assertAccountDeletionAllowed/,
]) {
  assert.doesNotMatch(account, forbidden, `the quarantine must not contain destructive or effectful legacy code: ${forbidden}`);
}

assert.match(accountSettings, /Account deletion is temporarily paused/, "settings must state the current account deletion posture");
assert.match(accountSettings, /No account data will be changed from this screen/, "settings must make the no-effect guarantee explicit");
assert.doesNotMatch(accountSettings, /deleteAccount|deleteConfirmation|handleDeleteAccount|Temporarily unavailable/, "settings must not retain an unreachable delete form or handler");
assert.doesNotMatch(settingsPanels, /deleteAccount/, "settings panel props must not carry a dead delete callback");
assert.doesNotMatch(app, /cloudAccountGateway|deleteCloudOwnAccount|deleteOwnAccountFromSettings|deleteAccount:/, "the app shell must not retain a dead delete call path");
assert.equal(existsSync("shared/cloudAccountGateway.ts"), false, "the unused account deletion gateway must be removed");

assert.equal(
  (accountLifecycle.match(/= internalMutation\(/g) ?? []).length,
  2,
  "the lifecycle substrate must expose exactly two internal mutations",
);
assert.doesNotMatch(accountLifecycle, /= mutation\(/, "the lifecycle substrate must expose no public mutation");
for (const forbidden of [
  /ctx\.storage/,
  /ctx\.scheduler/,
  /\.delete\(/,
  /\.replace\(/,
  /\.collect\(/,
  /runAction/,
  /runMutation/,
  /fetch\(/,
]) {
  assert.doesNotMatch(accountLifecycle, forbidden, `the lifecycle substrate must remain metadata-only and bounded: ${forbidden}`);
}
for (const match of accountLifecycle.matchAll(/ctx\.db\.insert\("([^"]+)"/g)) {
  assert.ok(
    match[1] === "accountLifecycleRequests" || match[1] === "accountLifecycleReceipts",
    `the lifecycle substrate must not insert product data: ${match[1]}`,
  );
}

console.log("PASS: account deletion is an irreducible read-only quarantine with no dead client executor.");
