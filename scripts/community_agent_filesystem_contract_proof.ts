import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const filesystem = readFileSync(join(root, "convex/communityAgentFilesystem.ts"), "utf8");
const candidates = readFileSync(join(root, "convex/communityCompilerCandidates.ts"), "utf8");
const protocol = readFileSync(join(root, "shared/communityAgentToolProtocol.ts"), "utf8");
const decision = readFileSync(join(root, "shared/communityMemoryDecisionContract.ts"), "utf8");

assert.match(protocol, /export const CANONICAL_COMMUNITY_AGENT_KEY = "community_agent" as const/);
assert.match(
  filesystem,
  /resolveFilesystemContext[\s\S]*agentKey !== CANONICAL_COMMUNITY_AGENT_KEY[\s\S]*community_agent_filesystem_context_agent_not_canonical/,
  "all filesystem calls must bind the canonical community-owned identity",
);
assert.match(
  filesystem,
  /compilerDigestId[\s\S]*compilerDigestVersionKey[\s\S]*digest\.agentHandoffState !== "running"[\s\S]*digest\.agentClaimId[\s\S]*community_agent_filesystem_digest_claim_mismatch[\s\S]*community_agent_filesystem_digest_claim_required/,
  "writes must remain inside the exact leased digest",
);
assert.match(filesystem, /export const readCommunityAgentFilesystemInternal = internalQuery/);
assert.match(filesystem, /export const searchCommunityAgentFilesystemInternal = internalQuery/);
assert.match(filesystem, /export const writeCommunityAgentFilesystemInternal = internalMutation/);
assert.match(
  filesystem,
  /operation: v\.literal\("settle_compiler_digest_items"\)[\s\S]*decisions: v\.array\(v\.object[\s\S]*v\.literal\("retain"\)[\s\S]*v\.literal\("carried_forward"\)[\s\S]*v\.literal\("dismiss_low_signal"\)/,
  "one atomic write should express every terminal disposition",
);
assert.match(
  protocol,
  /enum: \["settle_compiler_digest_items"\][\s\S]*required: \["digestId", "decisions"\][\s\S]*maxItems: 96/,
  "the model tool should submit one bounded decision batch",
);
assert.match(
  decision,
  /retainsMemory = disposition === "retain"[\s\S]*community_memory_decision_retain_payload_required[\s\S]*community_memory_decision_existing_node_required/,
  "shared normalization should keep retain semantics and carry-forward targets strict while discarding irrelevant fields",
);
assert.match(
  filesystem,
  /settleCommunityIntelligenceFromDigestItemsCore\([\s\S]*communityId: context\.communityId[\s\S]*decisions[\s\S]*actorAgentKey: context\.agentKey[\s\S]*runId: context\.runId[\s\S]*heartbeatId: context\.heartbeatId/,
  "the filesystem must preserve community, run, and heartbeat provenance",
);
assert.match(
  filesystem,
  /inspectCommunityCompilerDigestSettlementInternal[\s\S]*compilerDecision\?\.workKey[\s\S]*unsettled_work_keys/,
  "handoff completion should be derived from durable per-trace decisions",
);
assert.match(
  candidates,
  /settleCommunityIntelligenceFromDigestItemsCore[\s\S]*community_compiler_digest_decisions_incomplete[\s\S]*patchTraceDecision/,
  "partial decision batches must fail atomically",
);
assert.doesNotMatch(
  `${filesystem}\n${protocol}`,
  /decide_change_request|apply_accepted_change_request|same_run_self_review|itemIndex|digestItemIndex/,
  "the autonomous surface should have no approval choreography or positional identity",
);
console.log("community_agent_filesystem_contract_proof: ok");
