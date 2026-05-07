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
  const userPlatformAppMounts = readText(
    new URL("../convex/userPlatformAppMounts.ts", import.meta.url),
  );
  const operatorDashboard = readText(
    new URL("../convex/operatorDashboard.ts", import.meta.url),
  );
  const criticalAudit = readText(
    new URL("../convex/criticalAudit.ts", import.meta.url),
  );
  const contract = readText(
    new URL("../docs/mcp-app-architecture-contract.md", import.meta.url),
  );
  const packageJson = readText(new URL("../package.json", import.meta.url));
  const provenanceAuditStart = userPlatformAppMounts.indexOf(
    "async function collectCommunityAppSourceProvenanceAudit",
  );
  const provenanceAuditEnd = userPlatformAppMounts.indexOf(
    "function buildConnectErrorMessage",
  );
  assert.ok(provenanceAuditStart >= 0 && provenanceAuditEnd > provenanceAuditStart);
  const provenanceAudit = userPlatformAppMounts.slice(
    provenanceAuditStart,
    provenanceAuditEnd,
  );

  assertIncludes(
    userPlatformAppMounts,
    "export const listCommunityAppSourceProvenanceAuditInternal = internalQuery({",
    "source provenance audit stays read-only internally",
  );
  assertIncludes(
    userPlatformAppMounts,
    "export const backfillCommunityAppSourceProvenanceInternal = internalMutation({",
    "source provenance backfill has an explicit bounded mutation",
  );
  assertIncludes(
    userPlatformAppMounts,
    "dryRun: v.optional(v.boolean())",
    "source provenance backfill supports dry runs",
  );
  assertIncludes(
    provenanceAudit,
    "findExistingUserPlatformMountByDeveloperAppIdentity(",
    "source provenance audit resolves user-owned app copies by stable identity",
  );
  assertNotIncludes(
    provenanceAudit,
    '.withIndex("by_user_app"',
    "source provenance audit does not match by exact developerAppId",
  );
  assertIncludes(
    provenanceAudit,
    ".take(args.maxCommunityAppMounts + 1)",
    "source provenance audit bounds community app mount scans",
  );
  assertIncludes(
    userPlatformAppMounts,
    "Boolean(leftEndpoint && rightEndpoint)",
    "stable app identity does not match empty normalized endpoints",
  );
  assertIncludes(
    userPlatformAppMounts,
    ".take(maxRecipients + 1)",
    "source provenance recipient scan is bounded",
  );
  assertIncludes(
    userPlatformAppMounts,
    "maxPairs: normalizeProvenanceAuditLimit(args.maxPairs, 250, 1_000)",
    "source provenance backfill is capped",
  );
  assertIncludes(
    userPlatformAppMounts,
    "const shouldRepair = args.dryRun === false;",
    "source provenance backfill defaults to dry-run unless repair is explicit",
  );
  assertIncludes(
    userPlatformAppMounts,
    "repair: shouldRepair",
    "source provenance backfill uses explicit repair flag",
  );
  assertIncludes(
    userPlatformAppMounts,
    "maxCommunityAppMounts: args.maxCommunityAppMounts",
    "source provenance audit returns normalized scan caps",
  );
  assertIncludes(
    userPlatformAppMounts,
    "maxRecipientsPerCommunity: args.maxRecipientsPerCommunity",
    "source provenance audit returns normalized recipient caps",
  );
  assertIncludes(
    userPlatformAppMounts,
    'await args.ctx.db.insert("userPlatformAppMountSources"',
    "source provenance repair only adds source rows",
  );
  assertIncludes(
    userPlatformAppMounts,
    'sourceType: "community" as const',
    "source provenance repair writes community source rows",
  );
  assertIncludes(
    operatorDashboard,
    "export const listHarnessAppSourceProvenanceAudit = query({",
    "operator dashboard exposes read-only provenance audit",
  );
  assertIncludes(
    operatorDashboard,
    "export const backfillHarnessAppSourceProvenance = mutation({",
    "operator dashboard exposes explicit provenance backfill",
  );
  assertIncludes(
    operatorDashboard,
    "await requireOperatorWriteAccess(ctx, args.authSubject);",
    "provenance backfill requires operator write access",
  );
  assertIncludes(
    operatorDashboard,
    "recordCriticalAuditEventBestEffort",
    "provenance backfill records a durable operator audit event",
  );
  assertIncludes(
    operatorDashboard,
    'eventType: "harness_app_source_provenance_backfill"',
    "provenance backfill audit event has a stable event type",
  );
  assertIncludes(
    operatorDashboard,
    "maxPairs: result?.limits?.maxPairs",
    "provenance backfill audit records normalized caps",
  );
  assertIncludes(
    operatorDashboard,
    "maxRecipientsPerCommunity: result?.limits?.maxRecipientsPerCommunity",
    "provenance backfill audit records normalized recipient caps",
  );
  assertIncludes(
    criticalAudit,
    "harness_app_source_provenance_backfill",
    "critical audit allowlist includes provenance backfill event",
  );
  assertIncludes(
    contract,
    "Operator audit/backfill may add missing community source rows for existing community/member pairs, but must not delete or rewrite personal source rows.",
    "architecture contract captures bounded provenance repair rule",
  );
  assertIncludes(
    contract,
    "Operator source-provenance repair must find existing user harness apps by stable app identity, not by exact `developerAppId`.",
    "architecture contract captures stable identity repair rule",
  );
  assertIncludes(
    contract,
    "Operator source-provenance repair must not match app identities through empty or invalid normalized endpoints.",
    "architecture contract captures non-empty endpoint identity rule",
  );
  assertIncludes(
    contract,
    "Operator source-provenance repair defaults to dry-run, requires explicit repair intent for writes, scans bounded app and recipient batches, and records a critical audit event for every attempted run.",
    "architecture contract captures operator repair safety rule",
  );
  assertIncludes(
    packageJson,
    "\"check:harness-app-source-provenance-audit-proof\"",
    "package script runs source provenance proof",
  );

  console.log("harness_app_source_provenance_audit_proof: ok");
}

main();
