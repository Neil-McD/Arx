import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeCommunityMemoryDecision } from "../shared/communityMemoryDecisionContract.ts";

const root = process.cwd();
const candidates = readFileSync(join(root, "convex/communityCompilerCandidates.ts"), "utf8");
const directory = readFileSync(join(root, "convex/communityIntelligenceDirectory.ts"), "utf8");
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");
const acceptanceCertificate = JSON.parse(
  readFileSync(
    join(root, "scripts/fixtures/community_memory_staging_acceptance_20260716.json"),
    "utf8",
  ),
);

const retained = normalizeCommunityMemoryDecision({
  workKey: "community_memory_work:v1:" + "a".repeat(64),
  disposition: "retain",
  nodeType: "insight",
  title: "Prefer a bounded retry",
  bodyMd: "Retry transient failures with a bounded backoff.",
  appliesWhen: "The provider reports a transient failure.",
  doesNotApplyWhen: null,
  confidence: 0.8,
  existingNodeId: null,
  reason: "The interaction records a reusable operational decision.",
});
assert.equal(retained.disposition, "retain");
assert.equal(retained.confidence, 0.8);
assert.throws(
  () => normalizeCommunityMemoryDecision({
    ...retained,
    title: null,
  }),
  /community_memory_decision_retain_payload_required/,
);
assert.throws(
  () => normalizeCommunityMemoryDecision({
    ...retained,
    disposition: "carried_forward",
    nodeType: null,
    title: null,
    bodyMd: null,
    appliesWhen: null,
    doesNotApplyWhen: null,
    confidence: null,
  }),
  /community_memory_decision_existing_node_required/,
);
const carried = normalizeCommunityMemoryDecision({
  ...retained,
  disposition: "carried_forward",
  existingNodeId: "node_1",
});
assert.equal(carried.existingNodeId, "node_1");
assert.equal(carried.nodeType, null);
assert.equal(carried.title, null);
assert.equal(carried.bodyMd, null);
assert.equal(carried.confidence, null);
const dismissed = normalizeCommunityMemoryDecision({
  ...retained,
  disposition: "dismiss_low_signal",
  existingNodeId: null,
});
assert.equal(dismissed.existingNodeId, null);
assert.equal(dismissed.nodeType, null);
assert.equal(dismissed.title, null);
assert.equal(dismissed.bodyMd, null);
assert.equal(dismissed.confidence, null);

assert.match(
  candidates,
  /settleCommunityIntelligenceFromDigestItemsCore[\s\S]*community_compiler_digest_decisions_incomplete/,
  "the settlement transaction should require one decision per work item",
);
assert.match(
  candidates,
  /buildCommunitySourceTraceRevision\(trace\)[\s\S]*community_compiler_digest_item_source_revision_mismatch/,
  "stale evidence versions must fail before mutation",
);
assert.match(
  candidates,
  /directDecisionPayload[\s\S]*title: args\.decision\.title[\s\S]*bodyMd: args\.decision\.bodyMd[\s\S]*appliesWhen: args\.decision\.appliesWhen/,
  "the semantic payload must come from the agent decision rather than backend boilerplate",
);
assert.match(
  candidates,
  /decision\.disposition === "dismiss_low_signal"[\s\S]*patchTraceDecision/,
  "low-signal evidence should terminate without creating a node",
);
assert.match(
  candidates,
  /decision\.disposition === "retain" \? "create_node" : "attach_evidence"[\s\S]*existingNodeId[\s\S]*targetNodeIds/,
  "duplicate knowledge should carry evidence into the explicit same-community node",
);
assert.match(
  candidates,
  /compilerState = args\.decision\.disposition === "retain"[\s\S]*"compiled"[\s\S]*"dismissed_low_signal"[\s\S]*compilerDecision:/,
  "compiled state should only be written after the semantic transaction succeeds",
);
assert.match(
  candidates,
  /patchTraceDecision[\s\S]*compilerPendingSince: undefined,[\s\S]*compilerContinuationReady: undefined,[\s\S]*compilerLastHandledAt/,
  "terminal settlement must clear continuation scheduling state",
);
assert.match(
  directory,
  /sourceTraceCompilerLifecyclePatch[\s\S]*excluded_by_visibility[\s\S]*compilerContinuationReady: undefined[\s\S]*materialChanged[\s\S]*compilerContinuationReady: undefined/,
  "visibility exclusion and material replacement must clear continuation scheduling state",
);
assert.match(
  candidates,
  /createOrReuseTrustedCommunityIntelligenceChangeRequest[\s\S]*retainCompilerCandidateAutonomously[\s\S]*patchTraceDecision/,
  "audit application and trace settlement should share one Convex mutation",
);
assert.match(
  directory,
  /autonomousCompilerMemory[\s\S]*changeRequest\.operation !== "create_node" && changeRequest\.operation !== "attach_evidence"/,
  "autonomous policy should allow only create-memory and attach-evidence mutations",
);
assert.match(
  directory,
  /captureCommunityEvidenceCitationsForSourceTracesCore[\s\S]*requireCommunityEvidenceCitationsActiveCore/,
  "autonomous writes must capture immutable citations and revalidate them",
);
assert.match(
  directory,
  /compilerMemoryEvidenceIsCurrentlyReadable[\s\S]*sourceTraceIds[\s\S]*canViewerReadTrace[\s\S]*checkCommunityEvidenceCitationCore[\s\S]*!== "active"/,
  "member retrieval should fail closed after source evidence is revoked or materially superseded",
);
assert.ok(
  (directory.match(/canViewerReadNodeWithCurrentEvidence/g) ?? []).length >= 6,
  "current evidence readability should protect memory search, overview, node, and edge surfaces",
);
assert.match(
  directory,
  /updatedAt: materialChanged \? args\.nowMs : existing\.updatedAt/,
  "idempotent source synchronization must not supersede active evidence citations",
);
assert.match(
  schema,
  /compilerDecision: v\.optional\([\s\S]*workKey: v\.string\(\)[\s\S]*reason: v\.string\(\)[\s\S]*targetNodeId: v\.optional/,
  "terminal no-ops and applied outcomes need durable audit state",
);
assert.doesNotMatch(
  candidates.slice(candidates.indexOf("export async function settleCommunityIntelligenceFromDigestItemsCore")),
  /decideTrustedCommunityIntelligenceChangeRequestCore|status: "accepted"/,
  "the canonical settlement path should not synthesize human approval",
);
assert.doesNotMatch(
  candidates,
  /buildLearningEnvelope|retainCommunityIntelligenceFromDigestItemCore/,
  "the generic backend-authored candidate path should be deleted",
);
assert.match(
  directory,
  /export async function searchCommunityMemoryCore[\s\S]*requireCommunityChatAccess[\s\S]*retrieveAcceptedCommunityMemoryNodes[\s\S]*createCommunityMemoryRetrievalReceipt[\s\S]*export const searchCommunityMemoryInternal/,
  "accepted-memory search should have one authorization, evidence-filtering, and audit core",
);
assert.equal(
  acceptanceCertificate.schema_version,
  "community_memory_staging_acceptance:v1",
);
assert.equal(acceptanceCertificate.deployment_kind, "staging");
assert.equal(
  acceptanceCertificate.deterministic.code,
  "community_chat_memory_compiler_acceptance_passed",
);
assert.deepEqual(acceptanceCertificate.deterministic.failures, []);
assert.equal(acceptanceCertificate.deterministic.exact_digest_item_count, 3);
assert.deepEqual(
  acceptanceCertificate.deterministic.terminal_states,
  ["carried_forward", "dismissed_low_signal", "compiled"],
);
assert.equal(acceptanceCertificate.deterministic.canonical_handoff_settled, true);
assert.equal(acceptanceCertificate.deterministic.revoked_from_member_directory, true);
assert.equal(acceptanceCertificate.deterministic.revoked_from_member_search, true);
assert.equal(acceptanceCertificate.deterministic.revoked_from_public_overview, true);
assert.equal(acceptanceCertificate.deterministic.stale_batch_rolled_back, true);
assert.equal(
  acceptanceCertificate.model.code,
  "community_chat_memory_model_acceptance_passed",
);
assert.deepEqual(acceptanceCertificate.model.failures, []);
assert.deepEqual(acceptanceCertificate.model.digest_item_counts, [12, 2]);
assert.deepEqual(
  acceptanceCertificate.model.tool_call_names,
  [["search", "search", "write"], ["write"]],
);
assert.equal(acceptanceCertificate.model.exactly_one_write_per_digest, true);
assert.equal(acceptanceCertificate.model.each_write_covered_every_work_key, true);
assert.equal(acceptanceCertificate.model.both_handoffs_settled, true);
assert.equal(acceptanceCertificate.model.pending_after_second, 0);
assert.equal(acceptanceCertificate.model.second_heartbeat_settled_continuation, true);
assert.equal(acceptanceCertificate.model.sponsor_state_preserved, true);
assert.deepEqual(acceptanceCertificate.cleanup, {
  acceptance_flag_removed: true,
  fixture_community_rows: 0,
  fixture_agent_run_rows: 0,
});

console.log("community_compiler_candidates_contract_proof: ok");
