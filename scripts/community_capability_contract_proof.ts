import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  communityAccessIsOpen,
  deriveCommunityCapabilityAuthority,
  hasCommunityCapability,
  normalizeCommunityCapabilityRelation,
} from "../shared/communityCapabilityContract.ts";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const memberAuthority = deriveCommunityCapabilityAuthority({
  relation: "member",
  is_entitled: true,
  can_enter_community: true,
  can_read_chat: true,
});
assert.equal(memberAuthority.relation, "member");
assert.equal(memberAuthority.authorityLens, "member");
assert.deepEqual(memberAuthority.availableCapabilities, [
  "community_context",
  "accepted_memory",
  "raw_evidence_search",
  "member_resources",
]);
assert.equal(hasCommunityCapability(memberAuthority, "accepted_memory"), true);
assert.equal(hasCommunityCapability(memberAuthority, "builder_resources"), false);

const ownerAuthority = deriveCommunityCapabilityAuthority({
  relation: "owner",
  is_entitled: true,
  can_enter_community: true,
  can_manage_resources: true,
  can_review_join_requests: true,
  can_manage_members: true,
});
assert.equal(ownerAuthority.authorityLens, "owner_builder");
assert.equal(hasCommunityCapability(ownerAuthority, "builder_resources"), true);
assert.equal(hasCommunityCapability(ownerAuthority, "join_request_review"), true);
assert.equal(hasCommunityCapability(ownerAuthority, "community_admin"), true);
assert.equal(hasCommunityCapability(ownerAuthority, "owner_controls"), true);

const pendingAuthority = deriveCommunityCapabilityAuthority({ relation: "pending" });
assert.deepEqual(pendingAuthority.availableCapabilities, ["community_context"]);
assert.equal(pendingAuthority.unavailableReason, "join_request_pending");
assert.equal(normalizeCommunityCapabilityRelation("visitor"), "no_access");
assert.equal(communityAccessIsOpen({ can_enter_community: true }), true);
assert.equal(communityAccessIsOpen({ can_read_chat: true }), true);
assert.equal(communityAccessIsOpen({}), false);

const contextSource = read("convex/communityCapabilityContext.ts");
for (const required of [
  "listCommunityMemberships",
  "getMyCommunityAccessBySlug",
  "communityAccessIsOpen",
  "deriveCommunityCapabilityAuthority",
]) {
  assert.ok(contextSource.includes(required), `community capability context should include ${required}`);
}
for (const forbidden of ["runtimeAgentLoop", "runtimeRuns", "threads", "Daytona", "daytona"]) {
  assert.ok(!contextSource.includes(forbidden), `community capability context should not include ${forbidden}`);
}

const mcpSource = read("convex/httpMcp.ts");
assert.ok(
  mcpSource.includes("resolveCommunityCapabilityContext"),
  "MCP adapter should use the canonical community context resolver",
);
assert.ok(
  mcpSource.includes('community_context: "workspace_context"'),
  "MCP adapter should preserve the legacy workspace_context projection",
);
assert.ok(
  mcpSource.includes("hasCommunityCapability(authority, capability)"),
  "MCP adapter should enforce canonical community capabilities",
);

const architectureContract = read("docs/mcp-app-architecture-contract.md");
assert.ok(
  architectureContract.includes("### Community Capability Boundary"),
  "MCP architecture contract should define the canonical community boundary",
);
assert.ok(
  architectureContract.includes("Internal architecture uses `community_context`."),
  "MCP architecture contract should preserve internal community-native vocabulary",
);
assert.ok(
  architectureContract.includes("projects that capability as `workspace_context`"),
  "MCP architecture contract should pin the compatibility projection",
);

console.log("community_capability_contract_proof: ok");
