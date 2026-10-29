// Fails when a registered Convex function (query, mutation, action, or an
// internal one) has no caller: no product code reaches it and the cached
// production web does not call it. Functions run by hand or kept on purpose are
// named below with a reason. Tests and proof scripts do not count as callers.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const root = join(import.meta.dirname, "..");

const ALLOWED = new Map<string, string>([
  ["account:deleteOwnAccount", "account deletion: quarantined until deletion v1"],
  ["communityLifecycle:deleteCommunity", "community deletion: quarantined until deletion v1"],
  ["anonymousUserCleanup:cleanupAnonymousUsersInternal", "operator tool: data deletion, run by hand"],
  ["authSessions:pruneRevokedAuthSessionsForMaintenance", "operator tool: scripts/auth_prune_sessions.sh"],
  ["authSessions:scrubRevokedAuthSessionSecretsForMaintenance", "operator tool: scripts/auth_scrub_revoked_session_secrets.sh"],
  ["communityAdmin:unbanCommunityUser", "operator tool: the only way to lift a ban; no Studio screen"],
  ["communityAiFeedRetirement:inspectAiFeedRetirementInternal", "data retirement job; removed with the AI feed tables"],
  ["communityAiFeedRetirement:deleteAiFeedRetirementBatchInternal", "data retirement job; removed with the AI feed tables"],
  ["communityApps:registerCommunityDomainInternal", "operator tool: registers a site domain by hand"],
  ["communityApps:removeCommunityDomainInternal", "operator tool: removes a site domain by hand"],
  ["communitySites:registerSitePrivateTwinsInternal", "operator tool: one-off backfill of site private twins, run by hand"],
  ["communityChannelAudit:listGeneralChannelAuditCommunitiesInternal", "hand-run: General channel migration audit (residue map R-009)"],
  ["communityChannelAudit:auditGeneralChannelMigrationBatchInternal", "hand-run: General channel migration audit (residue map R-009)"],
  ["communityChannelBackfill:backfillGeneralChannelBatch", "hand-run: General channel migration (residue map R-009)"],
  ["communityChannels:inspectChannelNamesInternal", "hand-run: channel name backfill"],
  ["communityChannels:backfillChannelNamesInternal", "hand-run: channel name backfill"],
  ["communityCompilerEvidence:measureCommunityCompilerEvidenceInternal", "operator diagnostic, run by hand"],
  ["communityLifecycle:migrateSubscriptionRequiredCommunitiesToFreeInternal", "hand-run: pricing v2 migration of subscription-required communities to free"],
  ["communityCompilerDigest:runCommunityCompilerDigestPass", "protected core (community compiler): deleting needs Neil's confirmation"],
  ["communityResources:listCommunityResourceBuilderDirectory", "protected core (resources): deleting needs Neil's confirmation"],
  ["communityResources:readCommunityResourceBuilderResource", "protected core (resources): deleting needs Neil's confirmation"],
  ["threads:cancelCloudRuntimeRunByThreadKey", "protected core (runtime): the HTTP route uses the internal twin; deleting needs Neil's confirmation"],
  ["communityFounderBrief:setFounderBriefSettingsInternal", "operator tool: brief settings for the staging lab"],
  ["communityFounderBrief:sendFounderBriefNowInternal", "operator tool: send a brief now"],
  ["communityMaintenance:purgeOrphanedCommunityUserArtifactsInternal", "operator tool: purges orphaned user artifacts"],
  ["communityMemberWorkflows:getWorkflowExecutionContextInternal", "workflows: kept for now (Neil, Oct 28)"],
  ["communityResources:backfillCommunityResourceModuleStatusesInternal", "hand-run: resource module status backfill"],
  ["communityResources:compactCommunityResourceBodyStorage", "hand-run: resource body storage compaction"],
  ["communityResourceProgress:listCommunityProgressReport", "owner progress report for a signed-in owner; the MCP reads its internal twin, the web view comes next"],
  ["communityWeeklyDigestSchedule:ensureCommunityWeeklyDigestScheduleInternal", "weekly digest: dormant until a cron is added or it is deleted"],
  ["communityWeeklyDigestSchedule:resumeCommunityWeeklyDigestScheduleInternal", "weekly digest: dormant until a cron is added or it is deleted"],
  ["communityWeeklyDigestWorker:processDueCommunityWeeklyDigestsInternal", "weekly digest: dormant until a cron is added or it is deleted"],
  ["criticalAudit:listCriticalAuditEventsInternal", "operator diagnostic, run by hand"],
  ["distributionAttribution:resumeDeliveryInternal", "operator tool: resumes a stopped delivery"],
  ["operatorAccess:listOperatorRoles", "operator tool: role management by hand"],
  ["operatorAccess:upsertOperatorRole", "operator tool: role management by hand"],
  ["operatorAccess:deactivateOperatorRole", "operator tool: role management by hand"],
  ["operatorDashboard:backfillCommunityMembershipActiveFlags", "hand-run: membership active flag backfill"],
  ["operatorDashboard:listCommunityAccessStateAuditFindings", "operator diagnostic, run by hand"],
  ["operatorIntelligence:getOperatorCommunitySnapshotInternal", "operator diagnostic, run by hand"],
  ["platformDiagnostics:listPlatformDiagnosticEventsInternal", "operator diagnostic, run by hand"],
  ["profiles:backfillCompletedProfileBridgeSocialLinkFacts", "hand-run: scripts/backfill_bridge_social_link_facts.sh"],
  ["stagingSeedBriefLab:seedBriefLabInternal", "operator tool: seeds the staging brief lab"],
  ["stagingSeedSunrise:seedSunriseInternal", "operator tool: seeds the staging Sunrise community"],
  ["stagingSeedSunrise:simulateSunriseLiveInternal", "operator tool: a simulated second member for live site checks"],
]);

const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter((path) => path && existsSync(join(root, path)));
const isTest = (path: string) => /\.test\.[cm]?[jt]sx?$/.test(path);
const modules = tracked.filter((path) => /^convex\/[^/]+\.ts$/.test(path) && !isTest(path));
const productFiles = tracked.filter((path) =>
  /^(convex|shared|apps|api|infra|packages)\//.test(path) &&
  /\.(ts|tsx|js|mjs)$/.test(path) &&
  !isTest(path) &&
  !path.includes("_generated"),
);
// Member access may span lines (`internal.x\n  .y`), so normalize dots.
const normalize = (text: string) => text.replace(/\s*\.\s*/g, ".");
const corpus = new Map(productFiles.map((path) => [path, normalize(readFileSync(join(root, path), "utf8"))]));
const productionCalls = new Set<string>(
  JSON.parse(readFileSync(join(root, "shared/contracts/cached_production_client_compatibility_v1.json"), "utf8"))
    .required_public_operations,
);

const registered = /^export const ([A-Za-z0-9_]+)\s*=\s*(?:query|mutation|action|internalQuery|internalMutation|internalAction)\(/gm;
const uncalled: string[] = [];
let total = 0;
for (const path of modules) {
  const module = basename(path, ".ts");
  for (const match of readFileSync(join(root, path), "utf8").matchAll(registered)) {
    total += 1;
    const name = match[1];
    const operation = `${module}:${name}`;
    if (productionCalls.has(operation)) continue;
    // Whole-word matches only: `x.list` must not count as a call to `x.listPage`.
    const word = (reference: string) => new RegExp(`(?<![A-Za-z0-9_$])${reference}(?![A-Za-z0-9_$])`);
    const dotted = word(`${module}\\.${name}`);
    const references = [dotted, word(operation)];
    const called = [...corpus].some(([file, text]) =>
      // In its own file only a self call through internal/api counts.
      file !== path ? references.some((reference) => reference.test(text)) : dotted.test(text),
    );
    if (!called) uncalled.push(operation);
  }
}

for (const operation of ALLOWED.keys()) {
  const [module, name] = operation.split(":");
  const source = readFileSync(join(root, `convex/${module}.ts`), "utf8");
  assert.match(source, new RegExp(`^export const ${name}\\s*=`, "m"), `remove ${operation} from ALLOWED: it no longer exists`);
  assert.ok(uncalled.includes(operation), `remove ${operation} from ALLOWED: it now has a caller`);
}
const unexpected = uncalled.filter((operation) => !ALLOWED.has(operation));
assert.deepEqual(
  unexpected,
  [],
  `Convex functions with no caller (delete them with their tests, wire them up, or name them in ALLOWED with a reason): ${unexpected.join(", ")}`,
);
console.log(`no_uncalled_functions_proof: ok (${total} functions, ${ALLOWED.size} named exceptions)`);
