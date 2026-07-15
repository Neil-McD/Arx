import assert from "node:assert/strict";
import {
  measureCommunityCompilerEvidenceForCommunity,
  type SourceTraceRow,
} from "../convex/communityCompilerEvidenceCore.ts";

function trace(args: {
  id: string;
  sourceType?: string;
  group?: string;
  summary?: string;
  createdAt?: number;
}): SourceTraceRow {
  return {
    _id: args.id,
    communityId: "community_1",
    sourceType: args.sourceType ?? "interaction",
    sourceId: args.id,
    summary: args.summary ?? args.id,
    visibilityScope: "community",
    sourceVisibility: "community",
    artifactIds: [],
    outcomeObservationIds: [],
    actorType: "member",
    actorUserId: "user_1",
    compilerGroupKey: args.group,
    compilerState: "pending",
    compilerPendingSince: args.createdAt ?? 1_000,
    createdAt: args.createdAt ?? 1_000,
    updatedAt: args.createdAt ?? 1_000,
  };
}

function context(rows: SourceTraceRow[]) {
  return {
    db: {
      query() {
        const equals: Record<string, unknown> = {};
        let indexName = "";
        const chain = {
          withIndex(name: string, build: (q: any) => unknown) {
            indexName = name;
            const q = {
              eq(field: string, value: unknown) {
                equals[field] = value;
                return q;
              },
            };
            build(q);
            return chain;
          },
          order() {
            return chain;
          },
          async take(limit: number) {
            return rows
              .filter((row) => Object.entries(equals).every(([field, value]) =>
                (row as any)[field] === value
              ))
              .filter((row) =>
                indexName !== "by_community_compilerState_visibility_pendingSince" ||
                row.compilerState === "pending"
              )
              .sort((left, right) =>
                Number(left.compilerPendingSince ?? left.createdAt) -
                Number(right.compilerPendingSince ?? right.createdAt)
              )
              .slice(0, limit);
          },
        };
        return chain;
      },
    },
  };
}

async function measure(rows: SourceTraceRow[]) {
  return await measureCommunityCompilerEvidenceForCommunity({
    ctx: context(rows),
    communityId: "community_1",
    nowMs: 2_000,
  });
}

const keywordOnly = await measure([
  trace({ id: "keyword", summary: "unsafe broken failed blocker" }),
]);
assert.equal(keywordOnly.measurement.reason, "no_trigger");
assert.equal(keywordOnly.measurement.pending_standard, 1);
assert.equal(keywordOnly.measurement.pending_critical, 0);

const fullEpisode = await measure(
  Array.from({ length: 14 }, (_, index) =>
    trace({ id: `episode-a-${index}`, group: "interaction_episode:a", createdAt: 1_000 + index })
  ),
);
assert.equal(fullEpisode.measurement.reason, "full_packet");
assert.equal(fullEpisode.measurement.selected_packet_count, 1);
assert.equal(fullEpisode.selectedRows.length, 12);
assert.equal(fullEpisode.continuationRows.length, 2);
assert.equal(fullEpisode.measurement.has_more_pending, true);

const selectedFullEpisodeIds = new Set(fullEpisode.selectedRows.map((row) => String(row._id)));
const continuedEpisode = await measure(
  Array.from({ length: 14 }, (_, index) =>
    trace({ id: `episode-a-${index}`, group: "interaction_episode:a", createdAt: 1_000 + index })
  )
    .filter((row) => !selectedFullEpisodeIds.has(String(row._id)))
    .map((row) => ({ ...row, compilerContinuationReady: true })),
);
assert.equal(continuedEpisode.measurement.reason, "bounded_continuation");
assert.equal(continuedEpisode.measurement.pending_continuation, 1);
assert.equal(continuedEpisode.selectedRows.length, 2);
assert.equal(continuedEpisode.continuationRows.length, 0);

const criticalBeforeContinuation = await measure([
  { ...trace({ id: "continued-standard", group: "continued" }), compilerContinuationReady: true },
  trace({ id: "critical-outcome", sourceType: "outcome", group: "critical" }),
  trace({ id: "new-strong", sourceType: "ai_feed", group: "strong" }),
]);
assert.equal(criticalBeforeContinuation.measurement.reason, "critical_evidence");
assert.deepEqual(
  criticalBeforeContinuation.selectedRows.map((row) => String(row._id)),
  ["critical-outcome", "continued-standard", "new-strong"],
);

const nineEpisodes = await measure(
  Array.from({ length: 9 }, (_, index) =>
    trace({ id: `episode-${index}`, group: `interaction_episode:${index}` })
  ),
);
assert.equal(nineEpisodes.measurement.reason, "batch_threshold");
assert.equal(nineEpisodes.measurement.pending_total, 9);
assert.equal(nineEpisodes.measurement.pending_trace_total, 9);
assert.equal(nineEpisodes.measurement.selected_packet_count, 8);
assert.equal(nineEpisodes.selectedRows.length, 8);
assert.equal(nineEpisodes.continuationRows.length, 1);
assert.equal(nineEpisodes.measurement.has_more_pending, true);

const critical = await measure([trace({ id: "outcome", sourceType: "outcome" })]);
assert.equal(critical.measurement.reason, "critical_evidence");

const strong = await measure(
  Array.from({ length: 5 }, (_, index) =>
    trace({ id: `feed-${index}`, sourceType: "ai_feed", group: `ai_feed:${index}` })
  ),
);
assert.equal(strong.measurement.reason, "strong_evidence_threshold");

const legacy = await measure([
  trace({ id: "legacy-a" }),
  trace({ id: "legacy-b" }),
]);
assert.equal(legacy.measurement.pending_total, 2);
assert.deepEqual(
  legacy.measurement.selected_packet_keys,
  ["source_trace:legacy-a", "source_trace:legacy-b"],
);

const distributedScanOverflow = await measure(
  Array.from({ length: 501 }, (_, index) => ({
    ...trace({ id: `overflow-${index}`, group: `overflow:${index}` }),
    visibilityScope: index < 250 ? "admin" : index < 500 ? "community" : "public",
    sourceVisibility: index < 250 ? "admin" : index < 500 ? "community" : "public",
  })),
);
assert.equal(distributedScanOverflow.measurement.pending_total, 500);
assert.equal(distributedScanOverflow.measurement.counts_are_lower_bound, true);
assert.equal(distributedScanOverflow.measurement.has_more_pending, true);
assert.equal(distributedScanOverflow.continuationRows.length, 96);

console.log("community_compiler_admission_contract_proof: ok");
