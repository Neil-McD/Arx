import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAccountSetupStatus } from "../shared/accountSetup.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const accountSetupCore = read("convex/accountSetupCore.ts");
const operatorDashboard = read("convex/operatorDashboard.ts");
const operatorIntelligence = read("convex/operatorIntelligence.ts");
const operatorGateway = read("shared/cloudOperatorDashboardGateway.ts");
const operatorTypes = read("shared/operatorTypes.ts");
const operatorPanel = read("apps/web/src/components/WebWorkspaceRightPanel.tsx");
const schema = read("convex/schema.ts");

assert.match(
  accountSetupCore,
  /export function buildAccountSetupStatusForRows/,
  "operator visibility must reuse the canonical setup derivation in bulk form",
);
assert.match(
  accountSetupCore,
  /export async function loadAccountSetupStatusForUser/,
  "per-user profile setup status must share the same Convex helper",
);
for (const table of [
  "users",
  "userProfileDetails",
  "userProviderConnections",
  "userMemorySettings",
  "communities",
  "communityMemberships",
]) {
  assert.match(operatorIntelligence, new RegExp(`"${table}"`), `operator setup visibility must source ${table}`);
}

assert.match(
  operatorDashboard,
  /export const getOperatorAccountSetupSnapshot = query/,
  "operator account setup should expose a single snapshot query",
);
assert.match(
  operatorIntelligence,
  /export const getOperatorAccountSetupSnapshotInternal = internalQuery/,
  "operator account setup should expose a single read-only internal snapshot query",
);
assert.doesNotMatch(
  operatorPanel,
  /loadOperatorAccountSetupOverviewCanonical|loadOperatorAccountSetupUsersCanonical/,
  "operator panel must not double-load account setup overview and users",
);

assert.match(operatorDashboard, /requireOperatorAccess/, "setup visibility must be operator-only");
assert.match(operatorTypes, /OperatorAccountSetupOverviewSnapshot/, "operator setup overview type is missing");
assert.match(operatorTypes, /OperatorAccountSetupUserRecord/, "operator setup user type is missing");
assert.match(operatorTypes, /OperatorAccountSetupSnapshot/, "operator setup snapshot type is missing");
assert.match(operatorTypes, /totalMatching: number/, "setup user list must expose total matching count");
assert.match(operatorTypes, /isTruncated: boolean/, "setup user list must expose truncation state");
assert.doesNotMatch(
  schema,
  /accountSetupEvents: defineTable/,
  "account setup should not create a separate behavioral analytics table",
);
assert.doesNotMatch(operatorIntelligence, /accountSetupEvents/, "operator setup visibility should use canonical setup state only");
assert.doesNotMatch(operatorTypes, /OperatorAccountSetupEventSummary/, "operator setup types should not expose event analytics");
assert.doesNotMatch(operatorPanel, /Setup activity|Setup funnel|Recent setup events/, "operator setup UI should stay focused on current setup state");
assert.match(operatorGateway, /loadOperatorAccountSetupSnapshotCanonical/, "web gateway must load setup snapshot");
assert.doesNotMatch(operatorPanel, /"accounts"/, "operator panel must merge account setup into Business, not expose a separate Accounts tab");
assert.match(operatorPanel, /accountSetup=\{props\.state\.accountSetup\}/, "business tab must receive account setup state");
assert.doesNotMatch(operatorPanel, /<h2>Account setup<\/h2>/, "operator panel should present this as user readiness, not account setup");
assert.doesNotMatch(operatorPanel, /Current user setup state from canonical account records/, "operator panel must not render the old empty account setup intro card");
assert.match(operatorPanel, /<h2>User readiness<\/h2>/, "business tab must include a user readiness section boundary");
assert.match(operatorPanel, /<OperatorAccountSetupInsights snapshot=\{props\.accountSetup\} \/>/, "business tab must render account setup insights");
assert.equal(
  operatorPanel.match(/<h2>User readiness<\/h2>/g)?.length ?? 0,
  1,
  "business tab must render exactly one user readiness section boundary",
);
assert.equal(
  operatorPanel.match(/<OperatorAccountSetupInsights snapshot=\{props\.accountSetup\} \/>/g)?.length ?? 0,
  1,
  "business tab must render account setup insights exactly once",
);
assert.match(operatorPanel, /Showing \$\{users\.length\} of \$\{userList\.totalMatching\}/, "operator setup UI must disclose list truncation context");
assert.match(operatorPanel, /"handle"/, "operator setup missing-field ordering must include handle");
assert.match(operatorPanel, /case "handle":[\s\S]*?return "Handle";/, "operator setup UI must label missing handles");

const existingWithoutProfileDetail = buildAccountSetupStatus({
  displayName: "Existing Member",
  handle: "existing",
  avatarUrl: "https://example.com/avatar.png",
  hasInferenceProvider: true,
  agentName: "Poly",
  agentSoul: "Helpful.",
});
assert.equal(existingWithoutProfileDetail.current_step, "complete");
assert.equal(existingWithoutProfileDetail.completed, true);

const missingProvider = buildAccountSetupStatus({
  displayName: "Ready Profile",
  handle: "ready",
  avatarUrl: "https://example.com/avatar.png",
  bio: "Creator.",
  hasInferenceProvider: false,
  agentName: "Poly",
  agentSoul: "Helpful.",
  onboardingDirection: "build_community",
});
assert.equal(missingProvider.current_step, "inference");
assert.deepEqual(missingProvider.missing, ["inference_provider"]);

const complete = buildAccountSetupStatus({
  displayName: "Complete",
  handle: "complete",
  avatarUrl: "https://example.com/avatar.png",
  hasInferenceProvider: true,
  agentName: "Poly",
});
assert.equal(complete.current_step, "complete");
assert.equal(complete.completed, true);
assert.equal(complete.percent, 100);

console.log("account_setup_operator_visibility_proof: ok");
