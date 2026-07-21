import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COMMUNITY_COGNITION_CLEANUP_FIRST_PHASE,
  COMMUNITY_COGNITION_CLEANUP_MAX_BATCH_LIMIT,
  COMMUNITY_COGNITION_CLEANUP_PHASES,
  boundCommunityCognitionCleanupLimit,
  deleteDeletedCommunityCognitionBatchCore,
  drainDeletedCommunityCognitionStepCore,
  inspectDeletedCommunityCognitionCore,
  type CommunityCognitionCleanupPhase,
} from "../convex/communityCognitionCleanupCore.ts";
import { requireLiveCommunityForCognitionWrite } from "../convex/communityCognitionLifecycle.ts";

type Row = {
  _id: string;
  communityId: string;
  [key: string]: unknown;
};

class FakeDb {
  private communities = new Map<string, Record<string, unknown>>();
  private tables = new Map<string, Row[]>();

  addCommunity(id: string) {
    this.communities.set(id, { _id: id });
  }

  addRow(table: string, row: Row) {
    const rows = this.tables.get(table) ?? [];
    rows.push(row);
    this.tables.set(table, rows);
  }

  rows(table: string): Row[] {
    return [...(this.tables.get(table) ?? [])];
  }

  async get(id: string) {
    return this.communities.get(String(id)) ?? null;
  }

  query(table: string) {
    const filters: Record<string, unknown> = {};
    const chain = {
      withIndex: (_index: string, build: (query: any) => unknown) => {
        const query = {
          eq(field: string, value: unknown) {
            filters[field] = value;
            return query;
          },
        };
        build(query);
        return chain;
      },
      take: async (limit: number) => {
        return this.rows(table)
          .filter((row) =>
            Object.entries(filters).every(
              ([field, value]) => String(row[field] ?? "") === String(value ?? ""),
            )
          )
          .slice(0, limit);
      },
    };
    return chain;
  }

  async delete(id: string) {
    for (const [table, rows] of this.tables.entries()) {
      this.tables.set(
        table,
        rows.filter((row) => row._id !== String(id)),
      );
    }
  }
}

const targetCommunityId = "community_deleted";
const controlCommunityId = "community_control";
const liveCommunityId = "community_live";
const db = new FakeDb();
db.addCommunity(controlCommunityId);
db.addCommunity(liveCommunityId);

for (const definition of COMMUNITY_COGNITION_CLEANUP_PHASES) {
  const rowCount = definition.phase === "source_traces" ? 205 : 1;
  for (let index = 0; index < rowCount; index += 1) {
    db.addRow(definition.table, {
      _id: `${definition.phase}:target:${index}`,
      communityId: targetCommunityId,
    });
  }
  db.addRow(definition.table, {
    _id: `${definition.phase}:control`,
    communityId: controlCommunityId,
  });
}

const excludedProductTables = [
  "communityInteractionRoots",
  "communityInteractionReplies",
  "communityResources",
  "communityAiFeedPosts",
  "communityEvents",
  "communityMemberships",
  "communitySubscriptions",
  "communityAgentServeRequests",
];
for (const table of excludedProductTables) {
  db.addRow(table, {
    _id: `${table}:target`,
    communityId: targetCommunityId,
  });
}

assert.equal(
  new Set(COMMUNITY_COGNITION_CLEANUP_PHASES.map((definition) => definition.phase)).size,
  COMMUNITY_COGNITION_CLEANUP_PHASES.length,
  "cleanup phases must be unique",
);
assert.equal(boundCommunityCognitionCleanupLimit(undefined), 100);
assert.equal(boundCommunityCognitionCleanupLimit(0), 1);
assert.equal(boundCommunityCognitionCleanupLimit(10_000), COMMUNITY_COGNITION_CLEANUP_MAX_BATCH_LIMIT);

await requireLiveCommunityForCognitionWrite({ db: db as any }, liveCommunityId);
await assert.rejects(
  requireLiveCommunityForCognitionWrite({ db: db as any }, targetCommunityId),
  /community_cognition_write_community_not_found/,
  "cognition writes must refuse a deleted community",
);
await assert.rejects(
  inspectDeletedCommunityCognitionCore({
    db: db as any,
    communityId: liveCommunityId,
  }),
  /community_cognition_cleanup_live_community_forbidden/,
  "inspection must refuse a live community",
);
await assert.rejects(
  deleteDeletedCommunityCognitionBatchCore({
    db: db as any,
    communityId: liveCommunityId,
    phase: "source_traces",
  }),
  /community_cognition_cleanup_live_community_forbidden/,
  "deletion must refuse a live community",
);

const before = await inspectDeletedCommunityCognitionCore({
  db: db as any,
  communityId: targetCommunityId,
});
assert.equal(before.empty, false);
assert.equal(
  before.phases.find((phase) => phase.phase === "source_traces")?.count_lower_bound,
  100,
);
assert.equal(
  before.phases.find((phase) => phase.phase === "source_traces")?.count_is_lower_bound,
  true,
);

for (const definition of COMMUNITY_COGNITION_CLEANUP_PHASES) {
  let iterations = 0;
  while (true) {
    const result = await deleteDeletedCommunityCognitionBatchCore({
      db: db as any,
      communityId: targetCommunityId,
      phase: definition.phase,
      limit: 100,
    });
    iterations += 1;
    assert.ok(result.deleted_count <= 100, "each cleanup mutation must remain bounded");
    if (!result.has_more) break;
    assert.ok(iterations < 10, "bounded cleanup should converge");
  }
}

const after = await inspectDeletedCommunityCognitionCore({
  db: db as any,
  communityId: targetCommunityId,
});
assert.equal(after.empty, true, "all target cognition rows should be deleted");

for (const definition of COMMUNITY_COGNITION_CLEANUP_PHASES) {
  assert.equal(
    db.rows(definition.table).filter((row) => row.communityId === controlCommunityId).length,
    1,
    `${definition.table} control row must remain`,
  );
  const replay = await deleteDeletedCommunityCognitionBatchCore({
    db: db as any,
    communityId: targetCommunityId,
    phase: definition.phase,
  });
  assert.equal(replay.deleted_count, 0, `${definition.phase} cleanup must be idempotent`);
  assert.equal(replay.has_more, false);
}

for (const table of excludedProductTables) {
  assert.equal(
    COMMUNITY_COGNITION_CLEANUP_PHASES.some((definition) => definition.table === table),
    false,
    `${table} must remain outside the cognition cleanup allowlist`,
  );
  assert.equal(
    db.rows(table).filter((row) => row.communityId === targetCommunityId).length,
    1,
    `${table} must remain untouched by cognition cleanup`,
  );
}

const scheduledDb = new FakeDb();
scheduledDb.addCommunity(controlCommunityId);
for (const definition of COMMUNITY_COGNITION_CLEANUP_PHASES) {
  const rowCount = definition.phase === "source_traces" ? 205 : 1;
  for (let index = 0; index < rowCount; index += 1) {
    scheduledDb.addRow(definition.table, {
      _id: `scheduled:${definition.phase}:target:${index}`,
      communityId: targetCommunityId,
    });
  }
  scheduledDb.addRow(definition.table, {
    _id: `scheduled:${definition.phase}:control`,
    communityId: controlCommunityId,
  });
}
for (const table of excludedProductTables) {
  scheduledDb.addRow(table, {
    _id: `scheduled:${table}:target`,
    communityId: targetCommunityId,
  });
}

async function runScheduledDrain(fakeDb: FakeDb) {
  let phase: CommunityCognitionCleanupPhase | null =
    COMMUNITY_COGNITION_CLEANUP_FIRST_PHASE;
  let executionCount = 0;
  let deletedTotal = 0;
  const phaseExecutionCounts = new Map<CommunityCognitionCleanupPhase, number>();
  let finalInspection: Record<string, any> | null = null;
  while (phase) {
    const currentPhase = phase;
    const result = await drainDeletedCommunityCognitionStepCore({
      db: fakeDb as any,
      communityId: targetCommunityId,
      phase: currentPhase,
    });
    executionCount += 1;
    deletedTotal += result.deleted_count;
    phaseExecutionCounts.set(
      currentPhase,
      (phaseExecutionCounts.get(currentPhase) ?? 0) + 1,
    );
    assert.ok(
      result.deleted_count <= COMMUNITY_COGNITION_CLEANUP_MAX_BATCH_LIMIT,
      "every scheduled drain step must remain bounded",
    );
    finalInspection = result.final_inspection;
    phase = result.next_phase;
    assert.ok(executionCount <= 32, "scheduled cleanup must converge");
  }
  return { executionCount, deletedTotal, phaseExecutionCounts, finalInspection };
}

const scheduledDrain = await runScheduledDrain(scheduledDb);
assert.equal(scheduledDrain.executionCount, 16);
assert.equal(scheduledDrain.deletedTotal, 218);
assert.equal(scheduledDrain.phaseExecutionCounts.get("source_traces"), 3);
assert.equal(scheduledDrain.finalInspection?.empty, true);
for (const definition of COMMUNITY_COGNITION_CLEANUP_PHASES) {
  assert.equal(
    scheduledDb
      .rows(definition.table)
      .filter((row) => row.communityId === controlCommunityId).length,
    1,
    `${definition.table} scheduled control row must remain`,
  );
}
for (const table of excludedProductTables) {
  assert.equal(
    scheduledDb.rows(table).filter((row) => row.communityId === targetCommunityId).length,
    1,
    `${table} must remain untouched by the scheduled drain`,
  );
}
const scheduledReplay = await runScheduledDrain(scheduledDb);
assert.equal(scheduledReplay.executionCount, COMMUNITY_COGNITION_CLEANUP_PHASES.length);
assert.equal(scheduledReplay.deletedTotal, 0);
assert.equal(scheduledReplay.finalInspection?.empty, true);

const cleanupModule = readFileSync(
  new URL("../convex/communityCognitionCleanup.ts", import.meta.url),
  "utf8",
);
const schema = readFileSync(new URL("../convex/schema.ts", import.meta.url), "utf8");
const lifecycle = readFileSync(
  new URL("../convex/communityLifecycle.ts", import.meta.url),
  "utf8",
);
for (const definition of COMMUNITY_COGNITION_CLEANUP_PHASES) {
  const tableStart = schema.indexOf(`  ${definition.table}: defineTable({`);
  assert.ok(tableStart >= 0, `${definition.table} must exist in the canonical schema`);
  const nextTablePattern = /\n  [A-Za-z0-9_]+: defineTable\(/g;
  nextTablePattern.lastIndex = tableStart + 1;
  const nextTableStart = nextTablePattern.exec(schema)?.index ?? -1;
  const tableBlock = schema.slice(
    tableStart,
    nextTableStart >= 0 ? nextTableStart : schema.length,
  );
  assert.match(
    tableBlock,
    /communityId: v\.id\("communities"\)/,
    `${definition.table} must be directly community-owned`,
  );
  assert.ok(
    tableBlock.includes(`.index("${definition.index}"`),
    `${definition.table} must expose the declared community-prefixed index`,
  );
}
assert.match(cleanupModule, /internalMutation/);
assert.doesNotMatch(cleanupModule, /internalQuery/);
assert.doesNotMatch(
  cleanupModule,
  /\bexport const \w+ = (?:query|mutation)\(/,
  "cleanup must not expose a public client-callable function",
);
assert.doesNotMatch(
  cleanupModule,
  /cronJobs/,
  "cleanup must not add a recurring cron",
);
assert.equal(
  cleanupModule.match(/ctx\.scheduler\.runAfter\(/g)?.length,
  1,
  "the cleanup driver must expose one canonical continuation schedule",
);
assert.match(
  cleanupModule,
  /export const drainDeletedCommunityCognitionInternal = internalMutation/,
  "cleanup must expose one canonical internal drain",
);
assert.doesNotMatch(
  cleanupModule,
  /inspectDeletedCommunityCognitionInternal|deleteDeletedCommunityCognitionBatchInternal/,
  "manual internal cleanup wrappers must be deleted after automatic closure",
);
assert.doesNotMatch(
  cleanupModule,
  /table:\s*v\.string/,
  "cleanup must not accept an arbitrary table name",
);
assert.deepEqual(
  Array.from(cleanupModule.matchAll(/v\.literal\("([^"]+)"\)/g), (match) => match[1]),
  COMMUNITY_COGNITION_CLEANUP_PHASES.map((definition) => definition.phase),
  "the Convex validator and fixed cleanup allowlist must stay in lockstep",
);
const deleteCommunityStart = lifecycle.indexOf("export const deleteCommunity = mutation({");
assert.ok(deleteCommunityStart >= 0, "the cached-client community deletion identity must remain present");
const deleteCommunityBlock = lifecycle.slice(deleteCommunityStart);
assert.match(lifecycle, /community_delete_lifecycle_migration_blocked/);
assert.match(deleteCommunityBlock, /COMMUNITY_DELETION_QUARANTINE_CODE/);
assert.doesNotMatch(
  deleteCommunityBlock,
  /ctx\.db\.delete|ctx\.scheduler|drainDeletedCommunityCognitionInternal/,
  "quarantined community deletion must not delete rows or schedule new cognition cleanup",
);
assert.equal(
  lifecycle.match(/drainDeletedCommunityCognitionInternal/g)?.length ?? 0,
  0,
  "the public lifecycle must not be an active cleanup entry point while deletion is quarantined",
);

for (const [file, expectedCount] of [
  ["../convex/communityIntelligenceDirectory.ts", 3],
  ["../convex/communityCompilerDigest.ts", 1],
  ["../convex/communityAgentRuntime.ts", 1],
  ["../convex/communityArchiveDocuments.ts", 1],
  ["../convex/communityEvidenceAudit.ts", 1],
] as const) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const count = source.match(/requireLiveCommunityForCognitionWrite\(/g)?.length ?? 0;
  assert.ok(
    count >= expectedCount,
    `${file} must guard its cognition write seams`,
  );
}

let poisonedDeleteCount = 0;
const poisonedDb = {
  get: async () => null,
  query: () => {
    const chain = {
      withIndex: (_index: string, build: (query: any) => unknown) => {
        const query = {
          eq() {
            return query;
          },
        };
        build(query);
        return chain;
      },
      take: async () => [
        { _id: "valid", communityId: targetCommunityId },
        { _id: "foreign", communityId: controlCommunityId },
      ],
    };
    return chain;
  },
  delete: async () => {
    poisonedDeleteCount += 1;
  },
};
await assert.rejects(
  deleteDeletedCommunityCognitionBatchCore({
    db: poisonedDb as any,
    communityId: targetCommunityId,
    phase: "source_traces",
  }),
  /community_cognition_cleanup_row_scope_mismatch/,
  "a poisoned index result must fail closed",
);
assert.equal(
  poisonedDeleteCount,
  0,
  "cleanup must validate the entire selected batch before deleting any row",
);

const stagingAcceptance = JSON.parse(
  readFileSync(
    new URL(
      "./fixtures/community_cognition_cleanup_staging_acceptance_20260716.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
assert.equal(
  stagingAcceptance.schema_version,
  "community_cognition_cleanup_staging_acceptance:v2",
);
assert.equal(stagingAcceptance.deployment_kind, "staging");
assert.equal(stagingAcceptance.self_expiring_deployment, true);
assert.equal(stagingAcceptance.production_touched, false);
assert.equal(stagingAcceptance.fixture?.cleanup_phase_count, 14);
assert.equal(stagingAcceptance.fixture?.target_total_cognition_rows, 218);
assert.equal(stagingAcceptance.fixture?.target_source_trace_rows, 205);
assert.equal(stagingAcceptance.fixture?.control_total_cognition_rows, 14);
assert.equal(
  stagingAcceptance.automatic_lifecycle?.canonical_delete_function,
  "community:deleteCommunity",
);
assert.equal(stagingAcceptance.automatic_lifecycle?.direct_cleanup_call_count, 0);
assert.equal(stagingAcceptance.automatic_lifecycle?.scheduled_mutation_count, 16);
assert.equal(
  stagingAcceptance.automatic_lifecycle?.successful_scheduled_mutation_count,
  16,
);
assert.equal(stagingAcceptance.automatic_lifecycle?.failed_scheduled_mutation_count, 0);
assert.equal(
  stagingAcceptance.automatic_lifecycle?.source_trace_scheduled_mutation_count,
  3,
);
assert.equal(
  stagingAcceptance.cleanup?.policy_version,
  "community_cognition_cleanup:v1",
);
assert.equal(stagingAcceptance.cleanup?.deleted_total, 218);
assert.equal(stagingAcceptance.cleanup?.source_trace_batch_count, 3);
assert.equal(stagingAcceptance.cleanup?.final_total, 0);
assert.equal(stagingAcceptance.cleanup?.replay_deleted_total, 0);
assert.equal(
  stagingAcceptance.non_interference?.control_cognition_unchanged,
  true,
);
assert.equal(
  stagingAcceptance.non_interference?.target_product_sources_unchanged,
  true,
);
assert.equal(
  stagingAcceptance.non_interference?.control_product_sources_unchanged,
  true,
);
assert.equal(stagingAcceptance.runtime_surface?.schema_changed, false);
assert.equal(stagingAcceptance.runtime_surface?.cron_added, false);
assert.equal(stagingAcceptance.runtime_surface?.cleanup_job_table_added, false);
assert.equal(stagingAcceptance.runtime_surface?.public_cleanup_function_added, false);
assert.equal(stagingAcceptance.runtime_surface?.operator_driver_added, false);
assert.equal(stagingAcceptance.runtime_surface?.canonical_internal_drain_count, 1);
assert.equal(
  stagingAcceptance.runtime_surface?.manual_inspection_wrapper_present,
  false,
);
assert.equal(stagingAcceptance.runtime_surface?.manual_batch_wrapper_present, false);
assert.equal(stagingAcceptance.teardown?.fixture_communities_remaining, 0);
assert.equal(stagingAcceptance.teardown?.fixture_users_remaining, 0);
assert.equal(stagingAcceptance.teardown?.fixture_cognition_rows_remaining, 0);
assert.equal(
  stagingAcceptance.teardown?.fixture_product_source_rows_remaining,
  0,
);
assert.equal(stagingAcceptance.teardown?.acceptance_flag_removed, true);
assert.equal(
  stagingAcceptance.deployed_surface?.canonical_drain_internal_present,
  true,
);
assert.equal(
  stagingAcceptance.deployed_surface?.manual_inspection_internal_present,
  false,
);
assert.equal(
  stagingAcceptance.deployed_surface?.manual_batch_internal_present,
  false,
);
assert.equal(
  stagingAcceptance.deployed_surface?.acceptance_function_removed,
  true,
);

console.log("community_cognition_cleanup_behavior_proof: ok");
