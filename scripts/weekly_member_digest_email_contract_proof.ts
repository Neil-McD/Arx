import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const emailCore = read("convex/emailCore.ts");
const email = read("convex/email.ts");
const emailPreferences = read("convex/emailPreferences.ts");
const crons = read("convex/crons.ts");
const gateway = read("shared/cloudEmailPreferencesGateway.ts");
const controller = read("apps/web/src/controllers/useWebEmailPreferencesController.ts");
const section = read("apps/web/src/components/WebEmailPreferencesSection.tsx");
const settingsPanels = read("apps/web/src/components/WebSettingsPanels.tsx");
const snapshotValidators = read("convex/communityWeeklyDigestValidators.ts");
const schema = read("convex/schema.ts");
const schedule = read("convex/communityWeeklyDigestSchedule.ts");
const worker = read("convex/communityWeeklyDigestWorker.ts");
const baseTheme = read("apps/web/src/base.css");
const webTheme = read("apps/web/src/index.css");

assert.match(
  emailCore,
  /"weekly_member_digest"[\s\S]*function renderDigestItems[\s\S]*case "weekly_member_digest"/,
  "the weekly member renderer must remain in the canonical email renderer",
);
assert.doesNotMatch(
  emailCore,
  /weekly_founder_digest/,
  "the unused founder digest renderer must remain deleted",
);
assert.match(
  baseTheme,
  /--bg-card-solid: #2a2a2a;[\s\S]*--bg-button: #f1ede5;[\s\S]*--text-primary: #fcf8f0;[\s\S]*--border-default: #3a3a3a;/,
  "the canonical default-dark component palette must remain explicit",
);
assert.match(
  webTheme,
  /--bg-app: #111113;[\s\S]*--bg-workspace: #1a1a1a;[\s\S]*--bg-panel: #222222;/,
  "the canonical default-dark shell palette must remain explicit",
);
assert.match(
  emailCore,
  /background:#111113[\s\S]*background:#1a1a1a/,
  "the shared email shell must use the canonical default-dark app and workspace colors",
);
assert.match(
  emailCore,
  /background:#f1ede5;color:#0a0a0a/,
  "the shared email action must use the canonical default-dark action colors",
);
assert.match(
  emailCore,
  /border:1px solid #3a3a3a[\s\S]*background:#222222[\s\S]*color:#fcf8f0/,
  "digest cards must use the canonical default-dark panel, border, and primary text colors",
);
assert.match(
  emailPreferences,
  /weeklyDigestEnabled: true[\s\S]*weekly_digest_enabled[\s\S]*weeklyDigestEnabled: v\.optional\(v\.boolean\(\)\)/,
  "weekly digest preference must be absent-means-enabled and authenticated",
);
assert.match(
  email,
  /templateKey === "weekly_member_digest"[\s\S]*preferences\.weeklyDigestEnabled !== false/,
  "weekly digest delivery must be preference controlled",
);
assert.match(
  email,
  /for \(const row of rows\)[\s\S]*isPreferenceControlledTemplate[\s\S]*email_preference_disabled[\s\S]*status: "sending"/,
  "the preference must be rechecked before an outbox row is claimed for delivery",
);
assert.match(
  email,
  /weeklyDigestRecipientHasCommunityAccess[\s\S]*communityMembershipRowIsActive[\s\S]*community_membership_inactive[\s\S]*status: "sending"/,
  "weekly digest membership must fail closed both before enqueue and before delivery",
);
assert.match(
  gateway,
  /emailPreferences:getMyEmailPreferences[\s\S]*emailPreferences:updateMyEmailPreferences/,
  "the web setting must use the canonical authenticated preference API",
);
assert.match(
  controller,
  /hasLoaded[\s\S]*setHasLoaded\(false\)[\s\S]*loadCloudEmailPreferences[\s\S]*setHasLoaded\(true\)[\s\S]*!hasLoaded[\s\S]*updateCloudWeeklyDigestPreference/,
  "the settings controller must load and save through the canonical gateway without enabling unresolved state",
);
assert.match(
  section,
  /!props\.hasLoaded \|\| props\.isLoading \|\| props\.isSaving[\s\S]*Weekly community digest[\s\S]*role="switch"[\s\S]*aria-checked=\{props\.hasLoaded \? props\.weeklyDigestEnabled : false\}/,
  "Account settings must expose one accessible switch that stays disabled and false while unresolved",
);
assert.match(
  snapshotValidators,
  /communityWeeklyDigestSnapshotValidator = v\.object\([\s\S]*communityName: v\.string\(\)[\s\S]*items: v\.array\(communityWeeklyDigestSnapshotItemValidator\)/,
  "the temporary digest snapshot must have one explicit validator",
);
for (const [source, label] of [
  [schema, "schema"],
  [schedule, "schedule settlement"],
  [worker, "worker input"],
] as const) {
  assert.match(
    source,
    /communityWeeklyDigestSnapshotValidator/,
    `${label} must reuse the canonical digest snapshot validator`,
  );
}
assert.doesNotMatch(
  `${schema}\n${schedule}\n${worker}`,
  /digestSnapshot: v\.optional\(v\.any\(\)\)/,
  "digest snapshot boundaries must not accept arbitrary Convex values",
);
assert.match(
  settingsPanels,
  /case "account":[\s\S]*WebAccountSettingsSection[\s\S]*WebEmailPreferencesSection[\s\S]*WebPolynetMcpAccountSection/,
  "the preference belongs to the existing Account surface",
);
assert.doesNotMatch(
  crons,
  /weekly community digest|communityWeeklyDigestSchedule/,
  "restoring the renderer must not activate digest scheduling or delivery",
);

console.log("weekly member digest email contract proof passed");
