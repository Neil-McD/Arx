import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COMMUNITY_COGNITION_CLEANUP_MAX_BATCH_LIMIT,
  COMMUNITY_COGNITION_CLEANUP_PHASES,
  boundCommunityCognitionCleanupLimit,
  deleteDeletedCommunityCognitionBatchCore,
  inspectDeletedCommunityCognitionCore,
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
assert.match(cleanupModule, /internalQuery/);
assert.match(cleanupModule, /internalMutation/);
assert.doesNotMatch(
  cleanupModule,
  /\bexport const \w+ = (?:query|mutation)\(/,
  "cleanup must not expose a public client-callable function",
);
assert.doesNotMatch(
  cleanupModule,
  /scheduler|cronJobs/,
  "the first cleanup slice must remain manual",
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
assert.doesNotMatch(
  lifecycle,
  /communityCognitionCleanup|deleteDeletedCommunityCognition/,
  "the first cleanup slice must not hook community deletion",
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

console.log("community_cognition_cleanup_behavior_proof: ok");
