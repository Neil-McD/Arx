import assert from "node:assert/strict";
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

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `missing source boundary ${start}`);
  assert.ok(endIndex > startIndex, `missing source boundary ${end}`);
  return source.slice(startIndex, endIndex);
}

function proveLegacyFoundationMigration(
  schemaSource: string,
  backendSource: string,
  policySource: string,
  policyTestSource: string,
): void {
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
    assertIncludes(schemaSource, marker, "grandfather grant schema");
  }
  for (const marker of [
    "communityInferencePolicies: defineTable",
    'payerUserId: v.id("users")',
    'v.literal("owner_api_key")',
    'v.literal("platform_subscription")',
    'v.literal("pending_credential")',
    'v.literal("pending_subscription")',
    'contractVersion: v.string()',
    'sourceGrantKey: v.optional(v.string())',
    'sourcePartnerRecordId: v.optional(v.string())',
    '.index("by_community", ["communityId"])',
    '.index("by_payer_status", ["payerUserId", "status"])',
  ]) {
    assertIncludes(schemaSource, marker, "community inference funding policy schema");
  }
  const fundingPolicySchema = sourceBetween(
    schemaSource,
    "communityInferencePolicies: defineTable",
    "partnerAttributions: defineTable",
  );
  for (const forbidden of [
    /sponsorUserId/,
    /legacy_owner_key/,
    /platform_plan/,
    /pending_plan/,
    /modelId/,
    /policyVersion/,
    /capturedAt/,
    /by_fundingMode_status/,
    /by_policyVersion_capturedAt/,
  ]) {
    assertExcludes(fundingPolicySchema, forbidden, "irreducible community funding policy schema");
  }

  const captureSource = sourceBetween(
    backendSource,
    "export const captureLegacyBuilderPartnerFoundationInternal",
    "export const deleteLegacyBuilderPartnerSourceInternal",
  );
  for (const marker of [
    'throw new Error("legacy_builder_partner_migration_inspection_truncated")',
    'throw new Error("legacy_builder_partner_source_count_mismatch")',
    'throw new Error("legacy_builder_partner_source_evidence_mismatch")',
    'throw new Error("legacy_builder_partner_financial_rows_present")',
    'throw new Error("legacy_builder_partner_owned_community_boundary_mismatch")',
    'throw new Error("legacy_builder_partner_legal_acceptance_missing")',
    'throw new Error("legacy_builder_partner_grant_conflict")',
    'throw new Error("legacy_builder_partner_community_inference_policy_conflict")',
    'ctx.db.insert("legacyProgramGrants"',
    'ctx.db.insert("communityInferencePolicies"',
  ]) {
    assertIncludes(captureSource, marker, "bounded legacy foundation capture");
  }
  assert.equal(
    (captureSource.match(/ctx\.db\.insert\("legacyProgramGrants"/g) ?? []).length,
    1,
    "grandfather capture must have one canonical insert boundary",
  );
  assert.equal(
    (captureSource.match(/ctx\.db\.insert\("communityInferencePolicies"/g) ?? []).length,
    1,
    "community inference policy capture must have one canonical insert boundary",
  );

  const inspectionSource = sourceBetween(
    backendSource,
    "export const inspectLegacyBuilderPartnerRetirementInternal",
    "export const captureLegacyBuilderPartnerFoundationInternal",
  );
  assertIncludes(inspectionSource, "...state.evaluation", "read-only retirement inspection");

  for (const marker of [
    "LEGACY_PARTNER_EXPECTED_COUNT = 4",
    "LEGACY_PARTNER_EXPECTED_COMMUNITY_COUNT = 8",
    "LEGACY_PARTNER_EXPECTED_COMMUNITY_DISTRIBUTION = [1, 2, 2, 3]",
    'LEGACY_COMMUNITY_INFERENCE_FUNDING_MODE = "owner_api_key"',
    'LEGACY_COMMUNITY_INFERENCE_STATUS = "pending_credential"',
    'LEGACY_COMMUNITY_INFERENCE_CONTRACT_VERSION = "community_inference_funding_v1"',
    "missingGrantUserCount",
    "unexpectedGrantUserCount",
    "mismatchedGrantCount",
    "duplicateGrantUserCount",
    "duplicateSourceRecordIdCount",
    "missingLegalAcceptanceCount",
    "ownedCommunityDistributionMatches",
    "missingPolicyCommunityCount",
    "unexpectedPolicyCommunityCount",
    "mismatchedCommunityPolicyCount",
    "duplicateCommunityPolicyCount",
    "financialRows",
    "captureComplete",
    "migrationComplete",
    "readyForSourceDeletion",
    "sourceDeletionComplete",
    '"source_deleted"',
    '"invalid_terminal_state"',
    "isTruncated",
  ]) {
    assertIncludes(policySource, marker, "phase-aware retirement policy");
  }

  const deletionSource = sourceBetween(
    backendSource,
    "export const deleteLegacyBuilderPartnerSourceInternal",
    "// Cached-client compatibility only",
  );
  for (const marker of [
    "state.evaluation.sourceDeletionComplete",
    "alreadyDeleted: true",
    "state.evaluation.readyForSourceDeletion",
    'throw new Error("legacy_builder_partner_source_deletion_not_ready")',
    "await ctx.db.delete(partner._id)",
    "retainedGrandfatherGrants",
    "retainedCommunityInferencePolicies",
  ]) {
    assertIncludes(deletionSource, marker, "guarded source deletion");
  }
  assert.equal(
    (deletionSource.match(/ctx\.db\.delete\(/g) ?? []).length,
    1,
    "source deletion must have one canonical document deletion boundary",
  );
  assertIncludes(
    deletionSource,
    "await ctx.db.delete(partner._id)",
    "source deletion must target only verified source partners",
  );

  for (const marker of [
    'requires capture while only the four source identities exist',
    'permits source deletion only after exact four-person and eight-community capture',
    'blocks deletion until all eight community policies are captured',
    'rejects community ownership distribution drift',
    'rejects mismatched community funding policy',
    'rejects a payer that is not the community owner',
    'rejects duplicated community funding policy',
    'rejects policy rows outside the eight-community boundary',
    'blocks deletion if any financial row appears',
    'blocks deletion on mismatched or duplicated grant evidence',
    'proves the terminal state after source rows are deleted',
    'rejects an incomplete terminal state',
  ]) {
    assertIncludes(policyTestSource, marker, "retirement policy behavioral tests");
  }
}

function proveCommunityInferencePoliciesAreInert(): void {
  const allowedReferences = new Set([
    "convex/schema.ts",
    "convex/builderPartners.ts",
    "convex/builderPartnerRetirementPolicy.ts",
    "convex/builderPartnerRetirementPolicy.test.ts",
  ]);
  const unexpectedReferences = ["convex", "shared", "apps/web/src"]
    .flatMap(listSourceFiles)
    .filter((path) => !allowedReferences.has(path))
    .filter((path) => readText(path).includes("communityInferencePolicies"));
  assert.deepEqual(
    unexpectedReferences,
    [],
    "community inference policies must remain absent from runtime, onboarding, checkout, billing, entitlement, and provider paths",
  );
}

function proveLegacySchemaIsTemporary(schemaSource: string): void {
  for (const table of [
    "builderPartners",
    "partnerAttributions",
    "partnerCommissionLedger",
    "partnerCommissionAdjustments",
    "partnerPayoutBatches",
    "partnerPayoutTransfers",
    "partnerPayoutItems",
  ]) {
    assertIncludes(schemaSource, `${table}: defineTable`, "temporary legacy schema substrate");
  }
}

function proveBackendIsTombstonesOnly(backendSource: string): void {
  const acceptanceTombstone = sourceBetween(
    backendSource,
    "export const acceptBuilderPartnerTermsAndEnsure",
    "export const recordBuilderPartnerAttribution",
  );
  assertIncludes(acceptanceTombstone, 'throw new Error("builder_partner_program_retired")', "acceptance tombstone");
  assertExcludes(acceptanceTombstone, /ctx\.db|\.insert\(|\.patch\(/, "acceptance tombstone must not touch state");

  const attributionTombstone = sourceBetween(
    backendSource,
    "export const recordBuilderPartnerAttribution",
    "export const listPartnerPerformanceForOperator",
  );
  assertIncludes(attributionTombstone, 'reason: "builder_partner_program_retired"', "attribution tombstone");
  assertExcludes(attributionTombstone, /ctx\.db|\.insert\(|\.patch\(/, "attribution tombstone must not touch state");

  for (const forbidden of [
    /recordCommunityRevenuePartnerCommission/,
    /recordPaidToolUsagePartnerCommission/,
    /advancePartnerCommissionsToPayableInternal/,
    /createPartnerPayoutCycleInternal/,
    /executePartnerPayoutBatchInternal/,
    /ctx\.db\.insert\("partnerCommission/,
    /stripe\.transfers\.create/,
  ]) {
    assertExcludes(backendSource, forbidden, "retired backend must not retain financial execution");
  }
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
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), false, `${path} must be deleted`);
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
    assertExcludes(readText(path), /BuilderPartner|builderPartner|partnerPayout|partnerPerformance|Top partners/, `${path} legacy partner surface`);
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
  const billingDocs = readText("docs/product/reference/billing-entitlements.md");
  const releaseDocs = readText("docs/alpha-release-workflow.md");
  assertIncludes(legalTerms, "version: builder_partner_terms_v2", "immutable historical partner terms");
  assertIncludes(legalTerms, "Termination does not remove Polynet's right", "immutable historical partner terms");
  assertExcludes(readText("shared/legalDocuments.ts"), /builder_partner|Builder Partner/, "active legal registry");
  assertExcludes(readText("apps/web/src/docs/legalDocumentsContent.ts"), /builderPartner|Builder Partner/, "active legal content");
  for (const marker of [
    "Builder Partner v1 is retired",
    "future_partner_grandfather_v1",
    "communityInferencePolicies",
    "owner_api_key",
    "pending_credential",
    "community owner as payer",
    "model promise",
    "creates no new attribution, commission, adjustment, payout batch, payout item, payout transfer, or Stripe transfer",
  ]) {
    assertIncludes(billingDocs, marker, "billing documentation");
  }
  for (const marker of [
    "Builder Partner v1 retirement",
    "inspectLegacyBuilderPartnerRetirementInternal",
    "captureLegacyBuilderPartnerFoundationInternal",
    "deleteLegacyBuilderPartnerSourceInternal",
    "readyForSourceDeletion",
    "sourceDeletionComplete",
    "communityInferencePolicies.total",
    "ownedCommunities.distributionMatches",
    "production backup",
  ]) {
    assertIncludes(releaseDocs, marker, "two-release retirement runbook");
  }
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
  proveLegacyFoundationMigration(
    schemaSource,
    backendSource,
    readText("convex/builderPartnerRetirementPolicy.ts"),
    readText("convex/builderPartnerRetirementPolicy.test.ts"),
  );
  proveCommunityInferencePoliciesAreInert();
  proveLegacySchemaIsTemporary(schemaSource);
  proveBackendIsTombstonesOnly(backendSource);
  proveMoneyCallPathsAreSevered();
  proveProductSurfacesAreDeleted();
  proveCachedClientTombstones(
    backendSource,
    readText("shared/contracts/cached_production_client_compatibility_v1.json"),
  );
  proveLegalAndDocs();
  proveRuntimeSmokeIsReadOnly(readText("scripts/builder_partner_program_runtime_smoke.ts"));
  console.log("PASS: Builder Partner v1 four-founder/eight-community capture, source deletion, and tombstone contract proved");
}

main();
