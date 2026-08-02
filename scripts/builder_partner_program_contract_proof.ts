import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

function readText(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

function listSourceFiles(relativeDirectory: string): string[] {
  const files: string[] = [];
  const walk = (absoluteDirectory: string, relativePath: string) => {
    for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
      const entryRelativePath = `${relativePath}/${entry.name}`;
      const entryAbsolutePath = join(absoluteDirectory, entry.name);
      if (entry.isDirectory()) {
        walk(entryAbsolutePath, entryRelativePath);
      } else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
        files.push(entryRelativePath);
      }
    }
  };
  walk(join(REPO_ROOT, relativeDirectory), relativeDirectory);
  return files;
}

function assertIncludes(source: string, marker: string, label: string): void {
  assert.ok(source.includes(marker), `${label} must include ${marker}`);
}

function assertExcludes(source: string, pattern: RegExp, label: string): void {
  assert.doesNotMatch(source, pattern, label);
}

function provePermanentEvidenceSchema(schemaSource: string): void {
  for (const marker of [
    "legacyProgramGrants: defineTable",
    'grantKey: v.string()',
    'sourceProgram: v.string()',
    'sourceRecordId: v.string()',
    'acceptedTermsVersion: v.string()',
    'acceptedTermsAt: v.number()',
    '.index("by_user_grantKey", ["userId", "grantKey"])',
    '.index("by_grantKey_capturedAt", ["grantKey", "capturedAt"])',
  ]) {
    assertIncludes(schemaSource, marker, "grandfather evidence schema");
  }
}

function proveLegacySchemaAndMigrationCodeAreDeleted(schemaSource: string, backendSource: string): void {
  for (const table of [
    "builderPartners",
    "partnerAttributions",
    "partnerCommissionLedger",
    "partnerCommissionAdjustments",
    "partnerPayoutBatches",
    "partnerPayoutTransfers",
    "partnerPayoutItems",
  ]) {
    assertExcludes(schemaSource, new RegExp(`${table}:\\s*defineTable`), "retired legacy schema");
  }

  for (const path of [
    "convex/builderPartnerRetirementPolicy.ts",
    "convex/builderPartnerRetirementPolicy.test.ts",
  ]) {
    assert.equal(existsSync(join(REPO_ROOT, path)), false, `${path} must be deleted`);
  }

  for (const forbidden of [
    /inspectLegacyBuilderPartnerRetirementInternal/,
    /captureLegacyBuilderPartnerFoundationInternal/,
    /deleteLegacyBuilderPartnerSourceInternal/,
    /internalMutation/,
    /internalQuery/,
    /ctx\.db/,
    /legacyProgramGrants/,
    /communityInferencePolicies/,
    /partnerAttributions/,
    /partnerCommissionLedger/,
    /partnerCommissionAdjustments/,
    /partnerPayoutBatches/,
    /partnerPayoutTransfers/,
    /partnerPayoutItems/,
  ]) {
    assertExcludes(backendSource, forbidden, "tombstone-only Builder Partner backend");
  }

  const retiredMigrationNames =
    /inspectLegacyBuilderPartnerRetirementInternal|captureLegacyBuilderPartnerFoundationInternal|deleteLegacyBuilderPartnerSourceInternal|builderPartnerRetirementPolicy/;
  const unexpectedReferences = ["convex", "shared", "apps/web/src"]
    .flatMap(listSourceFiles)
    .filter((path) => readText(path).match(retiredMigrationNames));
  assert.deepEqual(unexpectedReferences, [], "retired migration code must have no active source reference");
}

function proveCompletedCohortInitializerIsDeleted(schemaSource: string): void {
  assertExcludes(
    schemaSource,
    /communityInferencePolicies:\s*defineTable/,
    "completed cohort policy schema",
  );
  const activeReferences = ["convex", "shared", "apps/web/src"]
    .flatMap(listSourceFiles)
    .filter((path) => readText(path).includes("communityInferencePolicies"));
  assert.deepEqual(
    activeReferences,
    [],
    "completed community inference policy schema must have no active source reference",
  );
  const migration = readText("convex/founderInferenceMigration.ts");
  assertExcludes(
    migration,
    /initializeExistingFounderInferenceCohortInternal|EXPECTED_EXISTING_FOUNDER_COUNT|EXPECTED_LEGACY_POLICY_COUNT|communityInferencePolicies/,
    "completed founder cohort initializer",
  );
  assert.match(migration, /transitionExistingFounderToManagedInternal = internalMutation/);
  assert.doesNotMatch(migration, /export const .* = (query|mutation|action)\(/);
}

function proveBackendIsTombstonesOnly(backendSource: string): void {
  const publicTombstones = [
    "getMyBuilderPartnerProgram",
    "acceptBuilderPartnerTermsAndEnsure",
    "recordBuilderPartnerAttribution",
    "listPartnerPerformanceForOperator",
    "listPartnerPayoutCyclesForOperator",
    "approvePartnerPayoutCycle",
    "retryPartnerPayoutCycle",
    "holdPartnerPayoutCycle",
    "rejectPartnerPayoutCycle",
  ];
  for (const rpc of publicTombstones) {
    assertIncludes(backendSource, `export const ${rpc}`, "cached-client tombstone");
  }
  assert.equal(
    (backendSource.match(/export const /g) ?? []).length,
    publicTombstones.length,
    "Builder Partner backend must export exactly the cached-client tombstones",
  );

  for (const marker of [
    'programStatus: "retired"',
    'state: "retired"',
    "isUnlocked: false",
    "eligible: false",
    'throw new Error("builder_partner_program_retired")',
    'reason: "builder_partner_program_retired"',
    "sourceTables: []",
    "retired: true",
  ]) {
    assertIncludes(backendSource, marker, "deterministic Builder Partner tombstone");
  }
  assertExcludes(
    backendSource,
    /ctx\.|\.insert\(|\.patch\(|\.delete\(|stripe\.|recordCommunityRevenuePartnerCommission|recordPaidToolUsagePartnerCommission/,
    "retired backend must not read, write, or transfer state",
  );
}

function proveMoneyCallPathsAreSevered(): void {
  for (const path of [
    "convex/communityCommerce.ts",
    "convex/workspaceCredits.ts",
    "convex/httpBilling.ts",
    "convex/crons.ts",
  ]) {
    assertExcludes(
      readText(path),
      /builderPartners|PartnerCommission|partner commission|partner payout/i,
      `${path} must not create, adjust, mature, or pay legacy partner money`,
    );
  }
  assertExcludes(
    readText("convex/criticalAudit.ts"),
    /builder_partner_payout/,
    "critical audit writers must not advertise retired Partner payout events",
  );
}

function proveProductSurfacesAreDeleted(): void {
  for (const path of [
    "shared/builderPartnerProgram.ts",
    "shared/builderPartnerProgramGateway.ts",
    "apps/web/src/controllers/useWebBuilderPartnerProgramController.ts",
    "apps/web/src/components/WebBuilderPartnerProgramPanel.tsx",
    "apps/web/src/components/WebBuilderPartnerProgramPanel.css",
    "apps/web/src/components/WebBuilderPartnerSettingsSection.tsx",
  ]) {
    assert.equal(existsSync(join(REPO_ROOT, path)), false, `${path} must be deleted`);
  }

  for (const path of [
    "apps/web/src/App.tsx",
    "apps/web/src/components/WebSettingsPanels.tsx",
    "apps/web/src/components/WebOperatorDashboardHost.tsx",
    "apps/web/src/components/OperatorBusinessPanelView.tsx",
    "apps/web/src/components/useOperatorDashboardData.ts",
    "shared/SettingsNavList.tsx",
    "shared/appShellNavigation.ts",
    "shared/cloudOperatorDashboardGateway.ts",
    "shared/operatorTypes.ts",
  ]) {
    assertExcludes(
      readText(path),
      /BuilderPartner|builderPartner|partnerPayout|partnerPerformance|Top partners/,
      `${path} legacy partner surface`,
    );
  }

  assertExcludes(readText("shared/appShellNavigation.ts"), /\| "partners"/, "settings type");
  assert.match(
    readText("shared/webAppRouteState.ts"),
    /case "partner":[\s\S]*case "partners":[\s\S]*return "billing"/,
    "cached partner settings routes must converge on Billing",
  );
}

function proveCachedClientTombstones(backendSource: string, compatibilitySource: string): void {
  for (const rpc of [
    "acceptBuilderPartnerTermsAndEnsure",
    "approvePartnerPayoutCycle",
    "getMyBuilderPartnerProgram",
    "holdPartnerPayoutCycle",
    "listPartnerPayoutCyclesForOperator",
    "listPartnerPerformanceForOperator",
    "recordBuilderPartnerAttribution",
    "rejectPartnerPayoutCycle",
    "retryPartnerPayoutCycle",
  ]) {
    assertIncludes(backendSource, `export const ${rpc}`, "cached-client tombstone");
    assertIncludes(compatibilitySource, `builderPartners:${rpc}`, "cached production compatibility registry");
  }
}

function proveLegalAndDocs(): void {
  const legalTerms = readText("docs/legal/builder-partner-terms-v2.md");
  const retirementNotice = readText("docs/legal/builder-partner-terms-v2-retirement-notice.md");
  const billingDocs = readText("docs/product/reference/billing-entitlements.md");
  const releaseDocs = readText("docs/alpha-release-workflow.md");
  assert.equal(
    createHash("sha256").update(legalTerms).digest("hex"),
    "63f0cc88984aadbb40999e100d370381a8fe84f57d5b3e6651edf9460091b11a",
    "accepted Builder Partner terms must remain byte-for-byte immutable",
  );
  assertIncludes(legalTerms, "version: builder_partner_terms_v2", "immutable historical partner terms");
  assertIncludes(legalTerms, "Termination does not remove Polynet's right", "immutable historical partner terms");
  for (const marker of [
    "Builder Partner v1 is retired",
    "four `builder_partner_terms_v2` acceptances",
    "four corresponding",
    "`legacyProgramGrants` remain historical evidence",
    "63f0cc88984aadbb40999e100d370381a8fe84f57d5b3e6651edf9460091b11a",
    "new product contract and new legal",
    "version",
  ]) {
    assertIncludes(retirementNotice, marker, "Builder Partner retirement notice");
  }
  assertExcludes(readText("shared/legalDocuments.ts"), /builder_partner|Builder Partner/, "active legal registry");
  assertExcludes(
    readText("apps/web/src/docs/legalDocumentsContent.ts"),
    /builderPartner|Builder Partner/,
    "active legal content",
  );

  assertExcludes(
    billingDocs,
    /Builder Partner|partner commission|partner payout|paid-tool usage/i,
    "current billing documentation",
  );
  for (const marker of [
    "Builder Partner v1 terminal state",
    "four retained grandfather grants",
    "eight retained community inference policies",
    "sorted ownership distribution `1/2/2/3`",
    "seven legacy Partner table schemas",
    "temporary migration code",
    "production backup",
    "source_deleted",
  ]) {
    assertIncludes(releaseDocs, marker, "terminal retirement runbook");
  }

  const retiredMigrationNames =
    /inspectLegacyBuilderPartnerRetirementInternal|captureLegacyBuilderPartnerFoundationInternal|deleteLegacyBuilderPartnerSourceInternal|builderPartnerRetirementPolicy/;
  assertExcludes(releaseDocs, retiredMigrationNames, "release docs must not advertise deleted migration functions");
  assertExcludes(billingDocs, retiredMigrationNames, "billing docs must not advertise deleted migration functions");
}

function proveRuntimeSmokeIsReadOnly(runtimeSmokeSource: string): void {
  assertIncludes(runtimeSmokeSource, "builder_partner_program_retired", "retirement runtime smoke");
  assertIncludes(runtimeSmokeSource, 'programStatus, "retired"', "retirement runtime smoke");
  assertExcludes(
    runtimeSmokeSource,
    /captureLegacyBuilderPartnerFoundationInternal|inspectLegacyBuilderPartnerRetirementInternal|deleteLegacyBuilderPartnerSourceInternal|createSmoke|--push/,
    "runtime smoke must not migrate or create state",
  );
}

function main(): void {
  const schemaSource = readText("convex/schema.ts");
  const backendSource = readText("convex/builderPartners.ts");
  provePermanentEvidenceSchema(schemaSource);
  proveLegacySchemaAndMigrationCodeAreDeleted(schemaSource, backendSource);
  proveCompletedCohortInitializerIsDeleted(schemaSource);
  proveBackendIsTombstonesOnly(backendSource);
  proveMoneyCallPathsAreSevered();
  proveProductSurfacesAreDeleted();
  proveCachedClientTombstones(
    backendSource,
    readText("shared/contracts/cached_production_client_compatibility_v1.json"),
  );
  proveLegalAndDocs();
  proveRuntimeSmokeIsReadOnly(readText("scripts/builder_partner_program_runtime_smoke.ts"));
  console.log("PASS: Builder Partner v1 terminal cleanup and tombstone contract proved");
}

main();
