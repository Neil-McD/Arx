import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const account = read("convex/account.ts");
const app = read("apps/web/src/App.tsx");
const accountSettings = read(
  "apps/web/src/components/WebAccountSettingsSection.tsx",
);
const quarantineContract = read(
  "docs/destructive-lifecycle-quarantine-contract-v1.md",
);
const stagingAcceptance = JSON.parse(
  read(
    "scripts/fixtures/destructive_lifecycle_quarantine_staging_acceptance_20260728.json",
  ),
);
const quarantineCode = "account_delete_lifecycle_migration_blocked";
const communityQuarantineCode =
  "community_delete_lifecycle_migration_blocked";

assert.match(
  account,
  /export const deleteOwnAccount = mutation\(\{/,
  "the cached-client account deletion identity must remain present",
);
assert.match(
  account,
  /args:\s*\{\s*authSubject: v\.optional\(v\.string\(\)\),?\s*\}/,
  "the cached-client account deletion arguments must remain compatible",
);
assert.equal(
  existsSync("shared/cloudAccountGateway.ts"),
  false,
  "the first-party account deletion gateway must be deleted while the mutation is quarantined",
);
assert.doesNotMatch(
  app,
  /deleteCloudOwnAccount|deleteOwnAccountFromSettings|account:deleteOwnAccount/,
  "App must not retain a first-party account deletion call path",
);
assert.doesNotMatch(
  accountSettings,
  /Delete account|deleteAccount|deleteConfirmation|handleDeleteAccount/,
  "Account settings must not advertise or wire quarantined deletion",
);
assert.match(
  account,
  /await resolveAuthenticatedActor\(\{[\s\S]*?authSubject: args\.authSubject \?\? null,[\s\S]*?\}\);[\s\S]*?throw new ConvexError\(\{/,
  "account deletion must authenticate an existing actor before returning the quarantine error",
);
assert.doesNotMatch(
  account,
  /ensureAuthenticatedActor/,
  "a deletion attempt must never create or relink an account as an authentication side effect",
);
assert.equal(
  account.match(new RegExp(quarantineCode, "g"))?.length,
  1,
  "account deletion must use one stable quarantine code",
);
assert.match(
  account,
  /code: ACCOUNT_DELETION_QUARANTINE_CODE,\s*reason: ACCOUNT_DELETION_QUARANTINE_CODE,/,
  "the quarantine must expose structured client-visible code and reason fields",
);
assert.equal(
  account.match(/export const /g)?.length,
  1,
  "the account module must expose only the retained cached-client mutation",
);
assert.doesNotMatch(
  account,
  /ctx\.(?:db|storage|scheduler)|\.(?:insert|patch|replace|delete)\(|runMutation|runAction|recordCriticalAudit|fetch\(|Date\.now|Math\.random/,
  "quarantined account deletion must have no database, storage, scheduler, provider, audit, or nondeterministic effects",
);
assert.ok(
  quarantineContract.includes(quarantineCode) &&
    quarantineContract.includes(communityQuarantineCode) &&
    quarantineContract.includes("## Zero-effect invariant") &&
    quarantineContract.includes("## Current first-party client contract"),
  "the active documentation must record both stable quarantine codes and the zero-effect invariant",
);
assert.equal(
  stagingAcceptance.schema_version,
  "destructive_lifecycle_quarantine_staging_acceptance:v1",
  "the durable staging receipt must use the reviewed schema",
);
assert.equal(
  stagingAcceptance.candidate_sha,
  "e7a209b788b8459acd1c952e64b06a7e5c5bf622",
  "the staging receipt must identify the exact accepted release candidate",
);
assert.equal(
  stagingAcceptance.shared_staging_touched,
  false,
  "the destructive lifecycle proof must not touch shared staging",
);
assert.equal(
  stagingAcceptance.production_touched,
  false,
  "the destructive lifecycle proof must not touch production",
);
assert.equal(
  stagingAcceptance.zero_effect_proof.complete_before_after_snapshot_equal,
  true,
  "the complete staged dependency graph must be unchanged after the authority matrix",
);
assert.equal(
  stagingAcceptance.zero_effect_proof.critical_audit_events_created,
  0,
  "the staged quarantine matrix must create no audit effects",
);
assert.equal(
  stagingAcceptance.zero_effect_proof.storage_objects_created,
  0,
  "the staged quarantine matrix must create no storage effects",
);
assert.equal(
  stagingAcceptance.zero_effect_proof.scheduled_functions_created,
  0,
  "the staged quarantine matrix must create no scheduler effects",
);
assert.deepEqual(
  stagingAcceptance.authority_matrix,
  [
    {
      surface: "account",
      case: "unauthenticated",
      result: "verified_identity_required",
    },
    {
      surface: "account",
      case: "auth_subject_mismatch",
      result: "auth_subject_mismatch",
    },
    {
      surface: "account",
      case: "verified_unprovisioned_actor",
      result: "user_not_found",
    },
    {
      surface: "account",
      case: "authorized_attempt_1",
      result: quarantineCode,
    },
    {
      surface: "account",
      case: "authorized_attempt_2",
      result: quarantineCode,
    },
    {
      surface: "community",
      case: "unauthenticated",
      result: "verified_identity_required",
    },
    {
      surface: "community",
      case: "legacy_user_id_spoof",
      result: "user_id_mismatch",
    },
    {
      surface: "community",
      case: "authenticated_non_owner",
      result: "community_owner_required",
    },
    {
      surface: "community",
      case: "authorized_owner_attempt_1",
      result: communityQuarantineCode,
    },
    {
      surface: "community",
      case: "authorized_owner_attempt_2",
      result: communityQuarantineCode,
    },
  ],
  "the staged authority matrix must preserve all fail-closed and replay results",
);
assert.equal(
  stagingAcceptance.teardown.fixture_rows_remaining,
  0,
  "the staged fixture must be fully removed",
);
for (const residueField of [
  "critical_audit_events_remaining",
  "storage_objects_remaining",
  "scheduled_functions_remaining",
]) {
  assert.equal(
    stagingAcceptance.teardown[residueField],
    0,
    `staging teardown must leave zero ${residueField}`,
  );
}
assert.equal(
  stagingAcceptance.deployed_surface.clean_candidate_redeployed,
  true,
  "the clean candidate must replace the temporary acceptance build",
);
assert.equal(
  stagingAcceptance.deployed_surface.typecheck_enabled,
  true,
  "the clean staged candidate must be deployed with typechecking enabled",
);
assert.equal(
  stagingAcceptance.deployed_surface.account_delete_public_abi_present,
  true,
  "the clean deployed surface must retain the account deletion ABI",
);
assert.equal(
  stagingAcceptance.deployed_surface.community_delete_public_abi_present,
  true,
  "the clean deployed surface must retain the community deletion ABI",
);
assert.equal(
  stagingAcceptance.deployed_surface.acceptance_harness_function_count,
  0,
  "the temporary internal acceptance harness must not remain deployed",
);

console.log(
  "PASS: account and community deletion preserve their cached ABIs and fail closed with staged zero-effect evidence.",
);
