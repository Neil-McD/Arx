import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readText(path: string | URL): string {
  return readFileSync(path, "utf8");
}

function assertIncludes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), `expected ${label} to include ${needle}`);
}

function main() {
  const userPlatformAppMounts = readText(
    new URL("../convex/userPlatformAppMounts.ts", import.meta.url),
  );
  const operatorDashboard = readText(
    new URL("../convex/operatorDashboard.ts", import.meta.url),
  );
  const contract = readText(
    new URL("../docs/mcp-app-architecture-contract.md", import.meta.url),
  );
  const packageJson = readText(new URL("../package.json", import.meta.url));

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
    userPlatformAppMounts,
    "maxPairs: normalizeProvenanceAuditLimit(args.maxPairs, 250, 1_000)",
    "source provenance backfill is capped",
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
    contract,
    "Operator audit/backfill may add missing community source rows for existing community/member pairs, but must not delete or rewrite personal source rows.",
    "architecture contract captures bounded provenance repair rule",
  );
  assertIncludes(
    packageJson,
    "\"check:harness-app-source-provenance-audit-proof\"",
    "package script runs source provenance proof",
  );

  console.log("harness_app_source_provenance_audit_proof: ok");
}

main();
