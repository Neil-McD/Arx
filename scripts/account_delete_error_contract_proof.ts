import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const account = read("convex/account.ts");
const accountSettings = read("apps/web/src/components/WebAccountSettingsSection.tsx");

const blockerCodes = [
  "account_delete_owned_communities_blocked",
  "account_delete_active_community_subscription_blocked",
  "account_delete_active_payout_account_blocked",
  "account_delete_mounted_apps_blocked",
  "account_delete_attached_skills_blocked",
];

assert.match(account, /import \{ ConvexError, v \} from "convex\/values"/, "account delete blockers must use ConvexError");
assert.match(account, /function throwAccountDeleteBlocker/, "account delete blockers must go through one stable helper");
assert.match(account, /throw new ConvexError\(\{ code, reason: code \}\)/, "blocker helper must expose structured client-visible code data");
assert.doesNotMatch(account, /throw new Error\("account_delete_/, "expected delete blockers must not be plain Error strings");
assert.match(account, /readAccountDeleteBlockerReason/, "blocked audit events must preserve structured blocker reason");
assert.match(account, /eventKey: `account_delete_blocked:\$\{userId\}:\$\{blockerReason\}:\$\{nowMs\}`/, "blocked audit event key must include stable blocker code");
assert.match(account, /reason: blockerReason/, "blocked audit metadata must include stable blocker code");

assert.match(accountSettings, /function readDeleteAccountErrorCode\(value: unknown\)/, "settings UI must extract structured delete error codes");
assert.match(accountSettings, /\.data/, "settings UI must inspect ConvexError data");
assert.match(accountSettings, /\.code/, "settings UI must inspect structured code");
assert.match(accountSettings, /\.reason/, "settings UI must inspect structured reason fallback");
assert.match(accountSettings, /message\.includes\(code\)/, "settings UI must preserve legacy message fallback");
assert.match(accountSettings, /formatDeleteAccountError\(error\)/, "delete handler must pass the raw caught error to the formatter");

for (const code of blockerCodes) {
  assert.ok(account.includes(code), `backend missing blocker code ${code}`);
  assert.ok(accountSettings.includes(code), `settings UI missing blocker message for ${code}`);
}

console.log("PASS: account delete error contract preserves client-visible blocker reasons.");
