import assert from "node:assert/strict";

import {
  buildCommunityMemoryDigestVersionKey,
  buildCommunityMemoryWorkKey,
  canonicalCommunityMemoryWorkIdentity,
  isCommunityMemoryDigestVersionKey,
  isCommunityMemoryWorkKey,
} from "../convex/communityMemoryWorkKey.ts";

const base = {
  communityId: "community_alpha",
  category: "source_trace_signal",
  sourceTypes: ["workflow_run", "artifact"],
  sourceIds: ["source_b", "source_a"],
  sourceTraceIds: ["trace_b", "trace_a"],
};

const key = await buildCommunityMemoryWorkKey(base);
assert.match(key, /^community_memory_work:v1:[0-9a-f]{64}$/);
assert.equal(isCommunityMemoryWorkKey(key), true);

assert.equal(
  key,
  await buildCommunityMemoryWorkKey({
    ...base,
    sourceTypes: ["artifact", "workflow_run", "artifact"],
    sourceIds: ["source_a", "source_b", "source_a"],
    sourceTraceIds: ["trace_a", "trace_b", "trace_a"],
  }),
  "work identity should be order-independent and deduplicate repeated evidence ids",
);

assert.notEqual(
  key,
  await buildCommunityMemoryWorkKey({ ...base, communityId: "community_beta" }),
  "the same evidence must not share identity across communities",
);
assert.notEqual(
  key,
  await buildCommunityMemoryWorkKey({ ...base, category: "outcome_signal" }),
  "different compiler categories must not share identity",
);
assert.notEqual(
  key,
  await buildCommunityMemoryWorkKey({ ...base, sourceTraceIds: ["trace_c"] }),
  "different evidence must produce a different identity",
);

assert.throws(
  () => canonicalCommunityMemoryWorkIdentity({
    communityId: "community_alpha",
    category: "chat_activity",
    sourceTypes: ["chat"],
  }),
  /community_memory_work_evidence_identity_required/,
  "memory work without an evidence identity must fail closed",
);

const secondKey = await buildCommunityMemoryWorkKey({
  ...base,
  sourceIds: ["source_c"],
  sourceTraceIds: ["trace_c"],
});
const versionKey = await buildCommunityMemoryDigestVersionKey({
  communityId: base.communityId,
  workKeys: [secondKey, key],
});
assert.match(versionKey, /^community_memory_digest:v1:[0-9a-f]{64}$/);
assert.equal(isCommunityMemoryDigestVersionKey(versionKey), true);
assert.equal(
  versionKey,
  await buildCommunityMemoryDigestVersionKey({
    communityId: base.communityId,
    workKeys: [key, secondKey, key],
  }),
  "digest version identity should sort and deduplicate canonical work keys",
);
assert.notEqual(
  versionKey,
  await buildCommunityMemoryDigestVersionKey({
    communityId: "community_beta",
    workKeys: [key, secondKey],
  }),
  "digest versions must stay community scoped",
);
assert.notEqual(
  versionKey,
  await buildCommunityMemoryDigestVersionKey({
    communityId: base.communityId,
    workKeys: [key, secondKey],
    contentRevisions: ["trace:trace_a:2"],
  }),
  "material evidence revisions must create a new immutable digest version without changing retention identity",
);
await assert.rejects(
  buildCommunityMemoryDigestVersionKey({
    communityId: base.communityId,
    workKeys: ["not-a-work-key"],
  }),
  /community_memory_digest_work_key_invalid/,
);

console.log("community_memory_work_key_contract_proof: ok");
