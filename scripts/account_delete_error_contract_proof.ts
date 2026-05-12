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
assert.match(account, /function hasBlockingPayoutAccountState/, "payout setup blocker must distinguish active setup from abandoned onboarding rows");
assert.doesNotMatch(account, /function hasPayoutAccountState[\s\S]*return Boolean\(row\)/, "payout setup blocker must not reject every Stripe Connect row");
assert.match(account, /row\.status === "ready"/, "ready Stripe Connect accounts must still block deletion");
assert.match(account, /row\.detailsSubmitted === true/, "submitted Stripe Connect setup must still block deletion");
assert.match(account, /row\.chargesEnabled === true/, "charge-enabled Stripe Connect accounts must still block deletion");
assert.match(account, /row\.payoutsEnabled === true/, "payout-enabled Stripe Connect accounts must still block deletion");
assert.match(account, /Number\.isFinite\(row\.onboardingCompleteAt\)/, "completed Stripe onboarding timestamp must still block deletion");
assert.match(account, /listLiveCommunityAppMountRowsForApp/, "app deletion blocker must ignore stale community app mounts");
assert.match(account, /deleteOrphanCommunityAppMountRowsForApp/, "account deletion must clean stale community app mounts");
assert.match(account, /listLiveCommunitySkillAttachmentRowsForSkill/, "skill deletion blocker must ignore stale community skill attachments");
assert.match(account, /deleteOrphanCommunitySkillAttachmentRowsForSkill/, "account deletion must clean stale community skill attachments");
assert.match(account, /await record\("userPlatformAppMountSources", await deleteRowsByIndex\(ctx, "userPlatformAppMountSources", "by_user_mount", "userId", userId\)\)/, "account deletion must remove user app mount source rows before user mounts");
assert.match(account, /"by_community_mount"[\s\S]*"communityAppMountId"/, "stale community app mount cleanup must remove dependent source rows");
assert.match(account, /await record\("userPlatformAppMountSources", staleCommunityMountDeletes\.userPlatformAppMountSources\)/, "account deletion must count stale app mount source cleanup");
assert.match(account, /await record\("communityAppMounts", staleCommunityMountDeletes\.communityAppMounts\)/, "account deletion must count stale app mount cleanup");
assert.match(account, /await record\("communitySkillAttachments", await deleteOrphanCommunitySkillAttachmentRowsForSkill\(ctx, skill\._id\)\)/, "account deletion must count stale skill attachment cleanup");

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
