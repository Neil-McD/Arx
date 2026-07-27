import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

import { ACCOUNT_LIFECYCLE_TABLE_POLICIES } from "../convex/accountLifecyclePolicy.ts";
import {
  OPERATIONAL_RECOVERY_CRON_POLICIES,
  OPERATIONAL_RECOVERY_OBJECTIVES,
  OPERATIONAL_RECOVERY_PHASES,
  OPERATIONAL_RECOVERY_POLICY_VERSION,
  OPERATIONAL_RECOVERY_PROVIDER_BOUNDARIES,
  OPERATIONAL_RECOVERY_SCHEDULER_MODULE_POLICIES,
  OPERATIONAL_RECOVERY_SCHEMA_BASELINE,
  OPERATIONAL_RECOVERY_STORAGE_FIELD_POLICIES,
  OPERATIONAL_RECOVERY_TABLE_POLICIES,
} from "../convex/operationalRecoveryPolicy.ts";

const schemaPath = "convex/schema.ts";
const cronsPath = "convex/crons.ts";
const policyPath = "convex/operationalRecoveryPolicy.ts";

const schemaSource = readFileSync(schemaPath, "utf8");
const cronsSource = readFileSync(cronsPath, "utf8");
const policySource = readFileSync(policyPath, "utf8");

const schemaTableNames = [
  ...schemaSource.matchAll(/^\s{2}([A-Za-z0-9_]+):\s*defineTable\(/gm),
]
  .map((match) => match[1])
  .sort();
const schemaStorageFields: string[] = [];
let currentSchemaTable: string | undefined;
for (const line of schemaSource.split("\n")) {
  const tableMatch = line.match(/^\s{2}([A-Za-z0-9_]+):\s*defineTable\(/);
  if (tableMatch) currentSchemaTable = tableMatch[1];
  const storageFieldMatch = line.match(/^\s{4}([A-Za-z0-9_]+):.*v\.id\("_storage"\)/);
  if (storageFieldMatch) {
    assert.ok(currentSchemaTable, `storage field has no owning schema table: ${line.trim()}`);
    schemaStorageFields.push(`${currentSchemaTable}.${storageFieldMatch[1]}`);
  }
}
schemaStorageFields.sort();
const recoveryStorageFields = Object.keys(OPERATIONAL_RECOVERY_STORAGE_FIELD_POLICIES).sort();
const recoveryTableNames = Object.keys(OPERATIONAL_RECOVERY_TABLE_POLICIES).sort();
const lifecycleTableNames = Object.keys(ACCOUNT_LIFECYCLE_TABLE_POLICIES).sort();

assert.equal(
  OPERATIONAL_RECOVERY_POLICY_VERSION,
  "operational-recovery-v1",
  "semantic recovery policy changes require a version change",
);
assert.equal(
  schemaTableNames.length,
  OPERATIONAL_RECOVERY_SCHEMA_BASELINE.tableCount,
  "schema table count changed; review recovery coverage",
);
assert.equal(
  schemaStorageFields.length,
  OPERATIONAL_RECOVERY_SCHEMA_BASELINE.storageFieldCount,
  "schema storage-reference count changed; review file recovery coverage",
);
assert.deepEqual(
  recoveryStorageFields,
  schemaStorageFields,
  "every schema file-storage field must have one operational-recovery policy",
);
assert.deepEqual(
  recoveryTableNames,
  schemaTableNames,
  "every schema table must have exactly one operational-recovery policy",
);
assert.deepEqual(
  recoveryTableNames,
  lifecycleTableNames,
  "recovery and lifecycle contracts must cover the same complete table set",
);

const tableDispositions = new Set(
  Object.values(OPERATIONAL_RECOVERY_TABLE_POLICIES).map((policy) => policy.disposition),
);
assert.deepEqual(
  [...tableDispositions].sort(),
  [
    "rebuild_or_validate_projection",
    "restore_and_validate",
    "restore_then_reconcile_external",
    "restore_then_revoke_or_expire",
    "retain_quarantined_evidence",
  ],
  "all recovery dispositions must remain represented",
);
for (const [table, policy] of Object.entries(OPERATIONAL_RECOVERY_TABLE_POLICIES)) {
  assert.ok(policy.reason.trim().length >= 40, `${table} recovery policy needs a concrete reason`);
}
for (const [field, policy] of Object.entries(OPERATIONAL_RECOVERY_STORAGE_FIELD_POLICIES)) {
  assert.ok(policy.reason.trim().length >= 40, `${field} recovery policy needs a concrete reason`);
}

const cronNames = [
  ...cronsSource.matchAll(
    /crons\.(?:interval|hourly|daily|weekly|monthly|cron)\(\s*"([^"]+)"/g,
  ),
]
  .map((match) => match[1])
  .sort();
const cronRegistrationCount = [
  ...cronsSource.matchAll(/crons\.(?:interval|hourly|daily|weekly|monthly|cron)\s*\(/g),
].length;
const recoveryCronNames = Object.keys(OPERATIONAL_RECOVERY_CRON_POLICIES).sort();
assert.equal(
  cronRegistrationCount,
  OPERATIONAL_RECOVERY_SCHEMA_BASELINE.cronRegistrationCount,
  "cron registration count changed; review recovery ownership",
);
assert.equal(
  cronNames.length,
  cronRegistrationCount,
  "every cron registration must use a static string identifier",
);
assert.deepEqual(
  recoveryCronNames,
  cronNames,
  "every registered cron must have one operational-recovery policy",
);

const schedulerCallsiteCounts: Record<string, number> = {};
for (const filename of readdirSync("convex").filter((name) => name.endsWith(".ts"))) {
  const source = readFileSync(`convex/${filename}`, "utf8");
  const count = [...source.matchAll(/scheduler\.run(?:After|At)?\(/g)].length;
  if (count > 0) schedulerCallsiteCounts[filename] = count;
}
const schedulerModuleNames = Object.keys(schedulerCallsiteCounts).sort();
const recoverySchedulerModuleNames = Object.keys(
  OPERATIONAL_RECOVERY_SCHEDULER_MODULE_POLICIES,
).sort();
assert.equal(
  Object.values(schedulerCallsiteCounts).reduce((sum, count) => sum + count, 0),
  OPERATIONAL_RECOVERY_SCHEMA_BASELINE.schedulerCallsiteCount,
  "scheduler callsite count changed; review recovery ownership",
);
assert.equal(
  schedulerModuleNames.length,
  OPERATIONAL_RECOVERY_SCHEMA_BASELINE.schedulerModuleCount,
  "scheduler module count changed; review recovery ownership",
);
assert.deepEqual(
  recoverySchedulerModuleNames,
  schedulerModuleNames,
  "every scheduler-calling module must have one recovery policy",
);
for (const [moduleName, policy] of Object.entries(
  OPERATIONAL_RECOVERY_SCHEDULER_MODULE_POLICIES,
)) {
  assert.equal(
    policy.callsiteCount,
    schedulerCallsiteCounts[moduleName],
    `${moduleName} scheduler callsite count changed`,
  );
  assert.ok(policy.reason.trim().length >= 40, `${moduleName} needs a concrete recovery reason`);
}

assert.deepEqual(
  OPERATIONAL_RECOVERY_PHASES,
  [
    "detect_and_scope",
    "freeze_writes_and_external_effects",
    "preserve_forensic_snapshot",
    "restore_known_code_and_configuration",
    "restore_data_into_isolated_target",
    "validate_structural_and_product_invariants",
    "reconcile_external_provider_truth",
    "enable_authenticated_reads",
    "enable_writes",
    "enable_external_effects",
  ],
  "recovery must remain freeze-first and reopen effects last",
);

assert.equal(OPERATIONAL_RECOVERY_OBJECTIVES.scope, "staging_drill");
assert.equal(OPERATIONAL_RECOVERY_OBJECTIVES.status, "accepted_for_measurement");
assert.equal(OPERATIONAL_RECOVERY_OBJECTIVES.databaseAndFileStorageRpoMs, 86_400_000);
assert.equal(OPERATIONAL_RECOVERY_OBJECTIVES.authenticatedCoreReadRtoMs, 14_400_000);
assert.equal(OPERATIONAL_RECOVERY_OBJECTIVES.fullWriteAndExternalEffectRtoMs, 28_800_000);
assert.equal(OPERATIONAL_RECOVERY_OBJECTIVES.productionSla, false);

assert.deepEqual(
  Object.keys(OPERATIONAL_RECOVERY_PROVIDER_BOUNDARIES).sort(),
  [
    "blaxel",
    "convex",
    "daytona",
    "email",
    "flyPreviewProxy",
    "githubVercel",
    "identity",
    "modelProviders",
    "sourceOAuth",
    "stripe",
  ],
  "provider recovery boundary changed without review",
);

assert.match(
  policySource,
  /planning and proof authority, not a backup, restore, mutation,\s*\*\s*provider, or deployment executor/,
);
assert.doesNotMatch(
  policySource,
  /\b(?:mutation|action|internalMutation|internalAction)\s*\(/,
  "the declarative recovery policy must not register an executable Convex operation",
);
assert.doesNotMatch(
  policySource,
  /\bctx\.(?:db|storage|scheduler)\b/,
  "the declarative recovery policy must not read, write, restore, or schedule anything",
);

console.log(
  `PASS: operational recovery contract covers ${schemaTableNames.length} tables, ${schemaStorageFields.length} storage fields, ${cronNames.length} crons, and ${OPERATIONAL_RECOVERY_SCHEMA_BASELINE.schedulerCallsiteCount} scheduler callsites without an executor`,
);
