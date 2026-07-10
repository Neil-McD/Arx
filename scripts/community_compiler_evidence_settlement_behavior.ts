import assert from "node:assert/strict";
import { settleCommunityCompilerEvidenceForCycle } from "../convex/communityCompilerEvidenceCore.ts";

const communityId = "community_a";
const digestId = "digest_a";
const rows = new Map<string, Record<string, any>>([
  [digestId, { _id: digestId, communityId }],
  ["pending", {
    _id: "pending",
    communityId,
    sourceType: "chat",
    summary: "Pending evidence",
    visibilityScope: "community",
    sourceVisibility: "community",
    actorType: "member",
    compilerState: "pending",
    compilerPendingSince: 10,
    createdAt: 10,
    updatedAt: 20,
  }],
  ["terminal", {
    _id: "terminal",
    communityId,
    sourceType: "chat",
    summary: "Already handled",
    visibilityScope: "community",
    sourceVisibility: "community",
    actorType: "member",
    compilerState: "compiled",
    compilerPendingSince: 11,
    createdAt: 11,
    updatedAt: 21,
  }],
  ["changed", {
    _id: "changed",
    communityId,
    sourceType: "resource",
    summary: "Changed after selection",
    visibilityScope: "community",
    sourceVisibility: "community",
    actorType: "member",
    compilerState: "pending",
    compilerPendingSince: 12,
    createdAt: 12,
    updatedAt: 99,
  }],
  ["self_authored", {
    _id: "self_authored",
    communityId,
    sourceType: "ai_feed",
    summary: "Community agent output",
    visibilityScope: "community",
    sourceVisibility: "community",
    actorType: "agent",
    actorAgentKey: "community_agent",
    compilerState: "pending",
    compilerPendingSince: 13,
    createdAt: 13,
    updatedAt: 23,
  }],
  ["cross_community", {
    _id: "cross_community",
    communityId: "community_b",
    sourceType: "chat",
    summary: "Wrong community",
    visibilityScope: "community",
    sourceVisibility: "community",
    actorType: "member",
    compilerState: "pending",
    compilerPendingSince: 14,
    createdAt: 14,
    updatedAt: 24,
  }],
  ["rollback_candidate", {
    _id: "rollback_candidate",
    communityId,
    sourceType: "chat",
    summary: "Must stay pending when the batch is invalid",
    visibilityScope: "community",
    sourceVisibility: "community",
    actorType: "member",
    compilerState: "pending",
    compilerPendingSince: 15,
    createdAt: 15,
    updatedAt: 25,
  }],
]);

const ctx = {
  db: {
    get: async (id: unknown) => rows.get(String(id)) ?? null,
    patch: async (id: unknown, patch: Record<string, unknown>) => {
      const key = String(id);
      const row = rows.get(key);
      if (!row) throw new Error("row_not_found");
      rows.set(key, { ...row, ...patch });
    },
  },
};

const first = await settleCommunityCompilerEvidenceForCycle({
  ctx,
  communityId,
  compilerDigestId: digestId,
  nowMs: 100,
  evidence: [
    { traceId: "pending", expectedUpdatedAt: 20 },
    { traceId: "pending", expectedUpdatedAt: 20 },
    { traceId: "terminal", expectedUpdatedAt: 21 },
    { traceId: "changed", expectedUpdatedAt: 22 },
    { traceId: "self_authored", expectedUpdatedAt: 23 },
  ],
});

assert.equal(first.requested_count, 4, "duplicate trace ids should be deduplicated");
assert.equal(first.settled_count, 1);
assert.equal(first.already_terminal_count, 1);
assert.equal(first.changed_since_selection_count, 1);
assert.equal(first.excluded_self_authored_count, 1);
assert.equal(rows.get("pending")?.compilerState, "compiled");
assert.equal(rows.get("pending")?.compilerLastHandledAt, 100);
assert.equal(rows.get("pending")?.compilerLastDigestId, digestId);
assert.equal(rows.get("changed")?.compilerState, "pending");
assert.equal(rows.get("self_authored")?.compilerState, "excluded_self_authored");

const second = await settleCommunityCompilerEvidenceForCycle({
  ctx,
  communityId,
  compilerDigestId: digestId,
  nowMs: 200,
  evidence: [{ traceId: "pending", expectedUpdatedAt: 20 }],
});
assert.equal(second.settled_count, 0);
assert.equal(second.already_terminal_count, 1, "settlement should be idempotent");
assert.equal(rows.get("pending")?.compilerLastHandledAt, 100, "idempotent settlement must preserve the first handling time");

await assert.rejects(
  settleCommunityCompilerEvidenceForCycle({
    ctx,
    communityId,
    compilerDigestId: digestId,
    nowMs: 300,
    evidence: [
      { traceId: "rollback_candidate", expectedUpdatedAt: 25 },
      { traceId: "cross_community", expectedUpdatedAt: 24 },
    ],
  }),
  /community_compiler_evidence_trace_not_found/,
);
assert.equal(rows.get("rollback_candidate")?.compilerState, "pending", "invalid batches must not partially settle");

console.log("community_compiler_evidence_settlement_behavior: ok");
