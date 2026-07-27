import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import * as ts from "typescript";

import { ACCOUNT_LIFECYCLE_TABLE_POLICIES } from "../convex/accountLifecyclePolicy.ts";
import {
  OPERATIONAL_RECOVERY_CRON_POLICIES,
  OPERATIONAL_RECOVERY_OBJECTIVES,
  OPERATIONAL_RECOVERY_PHASES,
  OPERATIONAL_RECOVERY_POLICY_VERSION,
  OPERATIONAL_RECOVERY_PROVIDER_BOUNDARIES,
  OPERATIONAL_RECOVERY_SCHEDULED_TARGET_POLICIES,
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
const policySourceFile = ts.createSourceFile(
  policyPath,
  policySource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);

function unwrapExpression(node: ts.Expression | undefined): ts.Expression | undefined {
  let current = node;
  while (
    current &&
    (ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isNonNullExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

function propertyAccessChain(node: ts.Expression | undefined): string | null {
  const current = unwrapExpression(node);
  if (!current) return null;
  if (ts.isIdentifier(current)) return current.text;
  if (!ts.isPropertyAccessExpression(current)) return null;
  const owner = propertyAccessChain(current.expression);
  return owner ? `${owner}.${current.name.text}` : null;
}

function normalizeInternalTarget(node: ts.Expression | undefined): string | null {
  const target = propertyAccessChain(node);
  if (!target || !/^(?:internal|internalRefs)\./.test(target)) return null;
  return target.replace(/^(?:internal|internalRefs)\./, "");
}

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
const rawStorageReferenceCount = [...schemaSource.matchAll(/v\.id\("_storage"\)/g)].length;
const recoveryStorageFields = Object.keys(OPERATIONAL_RECOVERY_STORAGE_FIELD_POLICIES).sort();
const recoveryTableNames = Object.keys(OPERATIONAL_RECOVERY_TABLE_POLICIES).sort();
const lifecycleTableNames = Object.keys(ACCOUNT_LIFECYCLE_TABLE_POLICIES).sort();

assert.equal(
  OPERATIONAL_RECOVERY_POLICY_VERSION,
  "operational-recovery-v2",
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
assert.equal(
  schemaStorageFields.length,
  rawStorageReferenceCount,
  "every raw storage reference must use the supported named top-level field shape",
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
const tableDispositionCounts: Record<string, number> = {};
for (const policy of Object.values(OPERATIONAL_RECOVERY_TABLE_POLICIES)) {
  tableDispositionCounts[policy.disposition] = (tableDispositionCounts[policy.disposition] ?? 0) + 1;
}
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
assert.deepEqual(
  tableDispositionCounts,
  {
    restore_and_validate: 60,
    restore_then_reconcile_external: 38,
    restore_then_revoke_or_expire: 12,
    rebuild_or_validate_projection: 7,
    retain_quarantined_evidence: 6,
  },
  "recovery table classification counts changed",
);
for (const table of [
  "communityAnalyticsEvents",
  "platformBusinessVisits",
  "communityIntelligenceRetrievalLogs",
]) {
  assert.equal(
    OPERATIONAL_RECOVERY_TABLE_POLICIES[table]?.disposition,
    "restore_and_validate",
    `${table} is irreplaceable historical truth, not a rebuildable projection`,
  );
}
for (const table of [
  "communityEvidenceRetrievalLogs",
  "communityMemoryMetabolizerRuns",
]) {
  assert.equal(
    OPERATIONAL_RECOVERY_TABLE_POLICIES[table]?.disposition,
    "retain_quarantined_evidence",
    `${table} must remain retained evidence without recovery authority`,
  );
}
for (const [table, policy] of Object.entries(OPERATIONAL_RECOVERY_TABLE_POLICIES)) {
  assert.ok(policy.reason.trim().length >= 40, `${table} recovery policy needs a concrete reason`);
}
for (const [field, policy] of Object.entries(OPERATIONAL_RECOVERY_STORAGE_FIELD_POLICIES)) {
  assert.ok(policy.reason.trim().length >= 40, `${field} recovery policy needs a concrete reason`);
}

type CronRegistration = {
  method: string;
  schedule: string;
  target: string;
};

const cronRegistrations: Record<string, CronRegistration> = {};
const invalidCronRegistrations: string[] = [];
const supportedCronMethods = new Set(["interval", "hourly", "daily", "weekly", "monthly", "cron"]);
const cronsSourceFile = ts.createSourceFile(
  cronsPath,
  cronsSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
function inspectCronNode(node: ts.Node): void {
  if (ts.isCallExpression(node)) {
    const calledMethod = unwrapExpression(node.expression);
    const cronOwner =
      calledMethod && ts.isPropertyAccessExpression(calledMethod)
        ? unwrapExpression(calledMethod.expression)
        : undefined;
    if (
      calledMethod &&
      ts.isPropertyAccessExpression(calledMethod) &&
      cronOwner &&
      ts.isIdentifier(cronOwner) &&
      cronOwner.text === "crons" &&
      supportedCronMethods.has(calledMethod.name.text)
    ) {
      const identifier = node.arguments[0];
      const name = identifier && ts.isStringLiteral(identifier) ? identifier.text : null;
      const target = normalizeInternalTarget(node.arguments[2]);
      const schedule =
        node.arguments[1]
          ?.getText(cronsSourceFile)
          .replace(/\s+/g, "")
          .replace(/,\}/g, "}") ?? "";
      if (!name || !target || !schedule || cronRegistrations[name]) {
        invalidCronRegistrations.push(node.getText(cronsSourceFile));
      } else {
        cronRegistrations[name] = {
          method: calledMethod.name.text,
          schedule,
          target,
        };
      }
    }
  }
  ts.forEachChild(node, inspectCronNode);
}
inspectCronNode(cronsSourceFile);
assert.deepEqual(
  invalidCronRegistrations,
  [],
  "every cron must have one static unique name, literal schedule, and static internal target",
);
const cronNames = Object.keys(cronRegistrations).sort();
const cronRegistrationCount = cronNames.length;
const rawCronCallCount = [...cronsSource.matchAll(/\bcrons\.[A-Za-z]+\s*\(/g)].length;
const recoveryCronNames = Object.keys(OPERATIONAL_RECOVERY_CRON_POLICIES).sort();
assert.equal(
  cronRegistrationCount,
  OPERATIONAL_RECOVERY_SCHEMA_BASELINE.cronRegistrationCount,
  "cron registration count changed; review recovery ownership",
);
assert.equal(
  cronRegistrationCount,
  rawCronCallCount,
  "every raw cron call must use one supported statically owned registration shape",
);
assert.deepEqual(
  recoveryCronNames,
  cronNames,
  "every registered cron must have one operational-recovery policy",
);
for (const [name, policy] of Object.entries(OPERATIONAL_RECOVERY_CRON_POLICIES)) {
  assert.deepEqual(
    {
      method: policy.method,
      schedule: policy.schedule,
      target: policy.target,
    },
    cronRegistrations[name],
    `${name} cron method, schedule, or target changed`,
  );
  assert.ok(policy.reason.trim().length >= 40, `${name} needs a concrete recovery reason`);
}

const schedulerTargetCallsiteCounts: Record<string, number> = {};
const schedulerModules = new Set<string>();
const invalidSchedulerTargets: string[] = [];
let rawSchedulerCallsiteCount = 0;
for (const filename of readdirSync("convex").filter((name) => name.endsWith(".ts"))) {
  const source = readFileSync(`convex/${filename}`, "utf8");
  rawSchedulerCallsiteCount += [
    ...source.matchAll(/\bscheduler\s*\.\s*run(?:After|At)\s*\(/g),
  ].length;
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  function inspectSchedulerNode(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const calledMethod = unwrapExpression(node.expression);
      const schedulerOwner =
        calledMethod && ts.isPropertyAccessExpression(calledMethod)
          ? unwrapExpression(calledMethod.expression)
          : undefined;
      if (
        calledMethod &&
        ts.isPropertyAccessExpression(calledMethod) &&
        (calledMethod.name.text === "runAfter" || calledMethod.name.text === "runAt") &&
        schedulerOwner &&
        ts.isPropertyAccessExpression(schedulerOwner) &&
        schedulerOwner.name.text === "scheduler"
      ) {
        const target = normalizeInternalTarget(node.arguments[1]);
        if (!target) {
          invalidSchedulerTargets.push(`${filename}:${node.getText(sourceFile)}`);
        } else {
          const key = `${filename}::${target}`;
          schedulerTargetCallsiteCounts[key] = (schedulerTargetCallsiteCounts[key] ?? 0) + 1;
          schedulerModules.add(filename);
        }
      }
    }
    ts.forEachChild(node, inspectSchedulerNode);
  }
  inspectSchedulerNode(sourceFile);
}
assert.deepEqual(
  invalidSchedulerTargets,
  [],
  "every scheduler callsite must use a static internal target",
);
const schedulerTargetKeys = Object.keys(schedulerTargetCallsiteCounts).sort();
const recoverySchedulerTargetKeys = Object.keys(
  OPERATIONAL_RECOVERY_SCHEDULED_TARGET_POLICIES,
).sort();
assert.equal(
  Object.values(schedulerTargetCallsiteCounts).reduce((sum, count) => sum + count, 0),
  OPERATIONAL_RECOVERY_SCHEMA_BASELINE.schedulerCallsiteCount,
  "scheduler callsite count changed; review recovery ownership",
);
assert.equal(
  Object.values(schedulerTargetCallsiteCounts).reduce((sum, count) => sum + count, 0),
  rawSchedulerCallsiteCount,
  "every raw scheduler call must use one supported statically owned target shape",
);
assert.equal(
  schedulerModules.size,
  OPERATIONAL_RECOVERY_SCHEMA_BASELINE.schedulerModuleCount,
  "scheduler module count changed; review recovery ownership",
);
assert.equal(
  schedulerTargetKeys.length,
  OPERATIONAL_RECOVERY_SCHEMA_BASELINE.schedulerTargetKeyCount,
  "scheduler target key count changed; review exact recovery ownership",
);
assert.deepEqual(
  recoverySchedulerTargetKeys,
  schedulerTargetKeys,
  "every exact scheduler module-target pair must have one recovery policy",
);
for (const [targetKey, policy] of Object.entries(
  OPERATIONAL_RECOVERY_SCHEDULED_TARGET_POLICIES,
)) {
  assert.equal(
    policy.callsiteCount,
    schedulerTargetCallsiteCounts[targetKey],
    `${targetKey} scheduler callsite count changed`,
  );
  assert.ok(policy.reason.trim().length >= 40, `${targetKey} needs a concrete recovery reason`);
}
for (const targetKey of [
  "communityAgentHeartbeat.ts::communityAgentHeartbeat.runCommunityAgentHeartbeatInternal",
  "communityInteractionEmbedRefresh.ts::communityInteractions.enrichInteractionEmbed",
  "communityInteractions.ts::communityInteractions.enrichInteractionEmbed",
  "communityResources.ts::communityResources.processCommunitySourceCrawlJobInternal",
  "directMessages.ts::directMessageEmails.maybeNotifyRecipientInternal",
]) {
  assert.equal(
    OPERATIONAL_RECOVERY_SCHEDULED_TARGET_POLICIES[targetKey]?.disposition,
    "reconcile_before_external_effect",
    `${targetKey} must remain behind the external-effect gate`,
  );
}
assert.equal(
  OPERATIONAL_RECOVERY_SCHEDULED_TARGET_POLICIES[
    "billingCore.ts::userPlatformAppMounts.seedCommunityAppGrantsForUserInternal"
  ]?.disposition,
  "reconstruct_from_durable_rows",
  "billingCore app-grant seeding is reconstruction, not a billing-provider effect",
);
assert.equal(
  OPERATIONAL_RECOVERY_SCHEDULED_TARGET_POLICIES[
    "communityInteractionEvidence.ts::communityInteractionEvidence.redactCommunityInteractionEvidenceChildrenInternal"
  ]?.disposition,
  "maintenance_restarts_from_source",
  "privacy redaction must restart only from durable source authority",
);
for (const cronName of [
  "enqueue weekly community digests",
  "refresh due community interaction previews",
]) {
  assert.equal(
    OPERATIONAL_RECOVERY_CRON_POLICIES[cronName]?.disposition,
    "reconcile_before_external_effect",
    `${cronName} must remain behind the external-effect gate`,
  );
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
  /\b(?:query|internalQuery|mutation|internalMutation|action|internalAction|httpAction)\s*\(/,
  "the declarative recovery policy must not register an executable Convex operation",
);
assert.doesNotMatch(
  policySource,
  /\bctx\.(?:db|storage|scheduler)\b/,
  "the declarative recovery policy must not read, write, restore, or schedule anything",
);
assert.doesNotMatch(
  policySource,
  /^\s*import\b/m,
  "the declarative recovery policy must not import an execution capability",
);
assert.doesNotMatch(
  policySource,
  /\b(?:fetch|require)\s*\(|\bprocess\.env\b|\b(?:Deno|Bun)\b/,
  "the declarative recovery policy must not access network, environment, filesystem, or subprocess capabilities",
);
const unsupportedPolicyCapabilities: string[] = [];
function inspectPolicyCapability(node: ts.Node): void {
  if (ts.isImportDeclaration(node)) {
    unsupportedPolicyCapabilities.push(node.getText(policySourceFile));
  }
  if (ts.isCallExpression(node)) {
    const callee = node.expression.getText(policySourceFile);
    if (callee !== "Object.freeze" && callee !== "buildTablePolicies") {
      unsupportedPolicyCapabilities.push(callee);
    }
  }
  if (ts.isNewExpression(node) && node.expression.getText(policySourceFile) !== "Error") {
    unsupportedPolicyCapabilities.push(`new ${node.expression.getText(policySourceFile)}`);
  }
  ts.forEachChild(node, inspectPolicyCapability);
}
inspectPolicyCapability(policySourceFile);
assert.deepEqual(
  unsupportedPolicyCapabilities,
  [],
  "the declarative policy may only freeze/build data and construct duplicate-policy errors",
);

console.log(
  `PASS: operational recovery contract covers ${schemaTableNames.length} tables, ${schemaStorageFields.length} storage fields, ${cronNames.length} exact cron signatures, and ${OPERATIONAL_RECOVERY_SCHEMA_BASELINE.schedulerCallsiteCount} scheduler callsites across ${schedulerTargetKeys.length} exact targets without an executor`,
);
