import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  deriveCommunityInteractionLineageEnvelope,
} from "../shared/communityEvidenceContract.ts";
import { getPolynetMcpToolDefinition } from "../shared/polynetMcp.ts";

const root = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await readFile(path.join(root, relativePath), "utf8");
}

const [contract, schema, evidence, mcp] = await Promise.all([
  read("docs/community-lineage-ontology-contract-v0.md"),
  read("convex/schema.ts"),
  read("convex/communityInteractionEvidence.ts"),
  read("shared/polynetMcp.ts"),
]);

for (const required of [
  "## Irreducible Ontology",
  "## Canonical State Versus Projections",
  "## Governance",
  "### Scenario A: Direct Human Chat",
  "### Scenario B: Agent Acting For A Member Or External Harness",
  "### Scenario C: Community Call",
  "## Deletions And Non-Goals",
  "## Proof Obligations",
]) {
  assert.ok(contract.includes(required), `missing lineage contract section: ${required}`);
}

const directHuman = deriveCommunityInteractionLineageEnvelope({
  actorType: "human",
  actorUserId: "user_1",
  communityId: "community_1",
  objectType: "reply",
  objectId: "reply_2",
  rootId: "root_1",
  targetReplyId: "reply_1",
});
assert.deepEqual(directHuman.authority, { type: "user", user_id: "user_1" });
assert.deepEqual(directHuman.credit, { type: "user", user_id: "user_1" });
assert.equal(directHuman.attribution_mode, "direct");
assert.equal(directHuman.origin, "community_chat");
assert.equal(directHuman.evidence.ref, "interaction:reply:reply_2");
assert.equal(directHuman.episode.ref, "interaction:root:root_1");
assert.deepEqual(directHuman.relation, {
  type: "replies_to",
  ref: "interaction:reply:reply_1",
});
assert.equal(directHuman.profile_projection, "source_only");

const rootHuman = deriveCommunityInteractionLineageEnvelope({
  actorType: "human",
  actorUserId: "user_1",
  communityId: "community_1",
  objectType: "root",
  objectId: "root_1",
  rootId: "root_1",
});
assert.equal(rootHuman.relation, null);

const personalAgent = deriveCommunityInteractionLineageEnvelope({
  actorType: "personal_agent",
  actorUserId: "user_1",
  actorAgentKey: "personal_agent:user_1",
  communityId: "community_1",
  objectType: "reply",
  objectId: "reply_3",
  rootId: "root_1",
});
assert.deepEqual(personalAgent.authority, { type: "user", user_id: "user_1" });
assert.equal(personalAgent.credit, null);
assert.equal(personalAgent.attribution_mode, "on_behalf_of");

const communityAgent = deriveCommunityInteractionLineageEnvelope({
  actorType: "community_agent",
  actorAgentKey: "community_agent",
  communityId: "community_1",
  objectType: "reply",
  objectId: "reply_4",
  rootId: "root_1",
});
assert.deepEqual(communityAgent.authority, {
  type: "community",
  community_id: "community_1",
});
assert.deepEqual(communityAgent.credit, {
  type: "agent",
  agent_key: "community_agent",
});
assert.equal(communityAgent.attribution_mode, "autonomous");

const unattributedLegacy = deriveCommunityInteractionLineageEnvelope({
  actorType: "human",
  communityId: "community_1",
  objectType: "root",
  objectId: "root_legacy",
  rootId: "root_legacy",
});
assert.deepEqual(unattributedLegacy.authority, { type: "system" });
assert.equal(unattributedLegacy.credit, null);
assert.equal(unattributedLegacy.attribution_mode, "unattributed");

assert.match(evidence, /deriveCommunityInteractionLineageEnvelope/);
assert.match(evidence, /lineage,/);
assert.equal(
  getPolynetMcpToolDefinition("polynet_search")?.annotations.readOnlyHint,
  true,
);
assert.equal(
  getPolynetMcpToolDefinition("polynet_read")?.annotations.readOnlyHint,
  true,
);
assert.doesNotMatch(mcp, /polynet_community_chat_search|polynet_community_chat_read/);

for (const forbidden of [
  "communityLineageEdges: defineTable",
  "communityConcepts: defineTable",
  "communityClaims: defineTable",
  "communityProfileContributions: defineTable",
]) {
  assert.ok(!schema.includes(forbidden), `forbidden speculative table present: ${forbidden}`);
}

console.log("community_lineage_ontology_contract_proof: ok");
