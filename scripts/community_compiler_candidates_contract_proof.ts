import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeCommunityMemoryDecision } from "../shared/communityMemoryDecisionContract.ts";

const root = process.cwd();
const candidates = readFileSync(join(root, "convex/communityCompilerCandidates.ts"), "utf8");
const directory = readFileSync(join(root, "convex/communityIntelligenceDirectory.ts"), "utf8");
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");
const acceptance = readFileSync(
  join(root, "convex/communityChatMemoryCompilerAcceptance.ts"),
  "utf8",
);
const modelAcceptance = acceptance.slice(
  acceptance.indexOf("export const runCommunityChatMemoryCompilerModelAcceptance"),
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
assert.throws(
  () => normalizeCommunityMemoryDecision({
    ...retained,
    disposition: "dismiss_low_signal",
    existingNodeId: null,
  }),
  /community_memory_decision_non_retain_payload_forbidden/,
);

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
  (directory.match(/canViewerReadNodeWithCurrentEvidence/g) ?? []).length >= 7,
  "current evidence readability should protect memory search, read, workflow, directory, graph, and edge surfaces",
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
assert.match(acceptance, /chat_evidence_not_automatically_traced/);
assert.match(acceptance, /digest_is_not_exact_versioned_work/);
assert.match(acceptance, /idempotent_replay_created_duplicate_state/);
assert.match(acceptance, /revoked_evidence_memory_remained_member_readable/);
assert.match(acceptance, /stale_revision_batch_did_not_roll_back_atomically/);
assert.doesNotMatch(
  acceptance,
  /claimCommunityChatMemoryCompilerDigestInternal/,
  "acceptance must not bypass the production handoff lease with a private claim mutation",
);
assert.match(
  acceptance,
  /communityAgentHeartbeat\.claimCommunityCompilerDigestHandoffInternal[\s\S]*communityAgentHeartbeat\.settleCommunityCompilerDigestHandoffInternal/,
  "acceptance should exercise the canonical claim and terminal settlement boundaries",
);
assert.match(
  acceptance,
  /prematureHandledError[\s\S]*community_compiler_handoff_unsettled[\s\S]*canonicalHandoffSettled/,
  "acceptance should prove incomplete work cannot become handled and complete work becomes settled",
);
assert.match(
  directory,
  /export async function searchCommunityMemoryCore[\s\S]*requireCommunityChatAccess[\s\S]*retrieveAcceptedCommunityMemoryNodes[\s\S]*communityIntelligenceRetrievalLogs[\s\S]*export const searchCommunityMemoryInternal/,
  "accepted-memory search should have one authorization, evidence-filtering, and audit core",
);
assert.match(
  acceptance,
  /searchCommunityChatMemoryCompilerMemberMemoryInternal[\s\S]*searchCommunityMemoryCore/,
  "acceptance should exercise the production accepted-memory search core without bypassing access checks",
);
assert.match(
  modelAcceptance,
  /MODEL_ACCEPTANCE_CONFIRMATION[\s\S]*readCommunityChatMemoryCompilerSponsorReadinessInternal[\s\S]*sponsor_connection_missing/,
  "the real-model fixture must require explicit staging confirmation and a connected sponsor",
);
assert.match(
  modelAcceptance,
  /modelEpisodeRows[\s\S]*length !== 14[\s\S]*runCommunityAgentHeartbeatInternal[\s\S]*itemCount !== 12[\s\S]*model_tool_trace_not_one_complete_write[\s\S]*model_prompt_injection_was_not_safely_dismissed[\s\S]*itemCount !== 2[\s\S]*second_heartbeat_did_not_settle_bounded_continuation/,
  "the model fixture must prove the real heartbeat, one complete write per digest, injection resistance, and 12 then 2 bounded continuation",
);
assert.doesNotMatch(
  modelAcceptance,
  /writeCommunityAgentFilesystemInternal|claimCommunityCompilerDigestHandoffInternal|settleCommunityCompilerDigestHandoffInternal|runCommunityCompilerDigestPassInternal/,
  "the model fixture must not bypass the production heartbeat with direct compiler or settlement calls",
);
assert.match(
  modelAcceptance,
  /preserveOwner: true[\s\S]*sponsorStatePreserved/,
  "fixture cleanup must preserve the connected sponsor and provider state",
);
assert.match(
  acceptance,
  /communityAgentRunEvents[\s\S]*communityAgentRuns[\s\S]*communityInteractionContentBlocks[\s\S]*communityInteractionReplies[\s\S]*communityInteractionRoots[\s\S]*if \(args\.preserveOwner !== true\)/,
  "fixture cleanup must remove model-run and interaction-link residue without deleting a preserved sponsor",
);

console.log("community_compiler_candidates_contract_proof: ok");
