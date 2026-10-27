import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  communityAccessIsOpen,
  deriveCommunityCapabilityAuthority,
  hasCommunityCapability,
  normalizeCommunityCapabilityRelation,
} from "../shared/communityCapabilityContract.ts";
import type { CommunityAccess } from "../shared/communityTypes.ts";
import {
  buildResolvedCommunityCapabilityContext,
  type CommunityCapabilityCommunityInput,
  type CommunityCapabilityMembershipInput,
} from "../shared/communityCapabilityContextContract.ts";
import { derivePolynetHumanAuthority } from "../shared/polynetAuthority.ts";

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
assert.equal(communityAccessIsOpen({ is_entitled: true, can_enter_community: true }), true);
assert.equal(communityAccessIsOpen({ is_entitled: true, can_read_chat: true }), true);
assert.equal(communityAccessIsOpen({ is_entitled: false, can_read_chat: true }), false);
assert.equal(communityAccessIsOpen({}), false);

const community: CommunityCapabilityCommunityInput = {
  id: "community_polynet",
  slug: "polynet",
  name: "Polynet",
  oneLiner: "Communities with a brain.",
  about: "A community for collective intelligence.",
  visibility: "published",
  entryPolicy: "approval",
};

function membership(
  role: "admin" | "moderator" | "member" = "member",
): CommunityCapabilityMembershipInput {
  return {
    communityId: community.id,
    role,
  };
}

function access(overrides: Partial<CommunityAccess> = {}): CommunityAccess {
  return {
    community_id: community.id,
    user_id: "user_member",
    relation: "member",
    entry_policy: "approval",
    visibility: "published",
    is_owner: false,
    is_entitled: true,
    is_blocked: false,
    entitlement_role: "member",
    entitlement_ends_at: null,
    effective_role: "member",
    can_view: true,
    can_enter_community: true,
    can_read_chat: true,
    can_post_chat: true,
    can_post_message: true,
    can_manage_resources: false,
    can_moderate_content: false,
    can_manage_members: false,
    can_review_join_requests: false,
    can_manage_pricing: false,
    can_manage_branding: false,
    can_manage_publishing: false,
    can_manage_payouts: false,
    ...overrides,
  };
}

function resolve(args: {
  communityRow?: CommunityCapabilityCommunityInput;
  membershipRow?: CommunityCapabilityMembershipInput;
  accessRow?: CommunityAccess;
  slug?: string;
} = {}) {
  return buildResolvedCommunityCapabilityContext({
    communitySlug: args.slug ?? "polynet",
    community: args.communityRow ?? community,
    membership: args.membershipRow === undefined ? membership() : args.membershipRow,
    access: args.accessRow ?? access(),
  });
}

for (const scenario of [
  {
    relation: "owner" as const,
    membershipRow: null,
    authorityLens: "owner_builder",
    accessRow: access({
      user_id: "user_owner",
      relation: "owner",
      is_owner: true,
      entitlement_role: "owner",
      effective_role: "owner",
      can_manage_resources: true,
      can_manage_members: true,
      can_review_join_requests: true,
      can_manage_pricing: true,
      can_manage_branding: true,
      can_manage_publishing: true,
      can_manage_payouts: true,
    }),
  },
  {
    relation: "admin" as const,
    membershipRow: membership("admin"),
    authorityLens: "admin_builder",
    accessRow: access({
      relation: "admin",
      entitlement_role: "admin",
      effective_role: "admin",
      can_manage_resources: true,
      can_manage_members: true,
      can_review_join_requests: true,
      can_manage_pricing: true,
    }),
  },
  {
    relation: "moderator" as const,
    membershipRow: membership("moderator"),
    authorityLens: "moderator",
    accessRow: access({
      relation: "moderator",
      entitlement_role: "moderator",
      effective_role: "moderator",
      can_moderate_content: true,
      can_review_join_requests: true,
    }),
  },
  {
    relation: "member" as const,
    membershipRow: membership("member"),
    authorityLens: "member",
    accessRow: access(),
  },
]) {
  const result = resolve({ membershipRow: scenario.membershipRow, accessRow: scenario.accessRow });
  assert.equal(result.ok, true, `${scenario.relation} should resolve`);
  if (!result.ok) continue;
  assert.equal(result.context.communityId, community.id);
  assert.equal(result.context.membership.community_id, community.id);
  assert.equal(result.context.membership.role, scenario.relation);
  assert.equal(result.context.authority.authorityLens, scenario.authorityLens);
}

for (const scenario of ["expired", "revoked", "pending", "blocked", "missing_membership"]) {
  const relation =
    scenario === "pending"
      ? "pending"
      : scenario === "missing_membership"
        ? "visitor"
        : null;
  const result = resolve({
    membershipRow: scenario === "missing_membership" ? null : membership(),
    accessRow: access({
      relation,
      is_entitled: false,
      can_enter_community: false,
      can_read_chat: false,
      can_post_chat: false,
      can_post_message: false,
    }),
  });
  assert.deepEqual(result, { ok: false, code: "community_access_closed" }, `${scenario} fails closed`);
}

assert.deepEqual(resolve({ slug: "" }), { ok: false, code: "invalid_community_slug" });
assert.deepEqual(resolve({ slug: "old-polynet" }), { ok: false, code: "community_not_accessible" });
assert.deepEqual(
  resolve({ accessRow: access({ community_id: "community_other" }) }),
  { ok: false, code: "community_access_unavailable" },
);
assert.deepEqual(
  resolve({ membershipRow: { ...membership(), communityId: "community_other" } }),
  { ok: false, code: "community_access_unavailable" },
);
const renamedCommunity = { ...community, slug: "polynet-next" };
assert.equal(resolve({ communityRow: renamedCommunity, slug: "polynet-next" }).ok, true);
assert.deepEqual(resolve({ communityRow: renamedCommunity, slug: "polynet" }), {
  ok: false,
  code: "community_not_accessible",
});

const contextSource = read("convex/communityCapabilityContext.ts");
const contextContractSource = read("shared/communityCapabilityContextContract.ts");
for (const required of [
  "internalQuery",
  'query("communities")',
  'withIndex("by_slug"',
  ".take(2)",
  "getUniqueCommunityMembershipByPair",
  "mapCommunityAccessRow",
]) {
  assert.ok(contextSource.includes(required), `community capability context should include ${required}`);
}
for (const required of [
  "communityAccessIsOpen",
  "deriveCommunityCapabilityAuthority",
  "args.access.community_id !== args.community.id",
  "args.membership.communityId !== args.community.id",
]) {
  assert.ok(contextContractSource.includes(required), `community capability contract should include ${required}`);
}
for (const forbidden of ["runtimeAgentLoop", "runtimeRuns", "threads", "Daytona", "daytona"]) {
  assert.ok(!contextSource.includes(forbidden), `community capability context should not include ${forbidden}`);
}

const mcpSource = read("convex/httpMcp.ts");
const canonicalExecutorSource = read("convex/polynetCanonicalExecutor.ts");
assert.ok(
  canonicalExecutorSource.includes(
    "resolveCommunityCapabilityContextInternal",
  ),
  "the shared executor should revalidate canonical community access per call",
);
assert.match(mcpSource, /executePolynetCanonicalTool/);
assert.doesNotMatch(mcpSource, /workspace_context|polynet_workspace_/);
assert.deepEqual(
  derivePolynetHumanAuthority({
    access: access(),
    principalKind: "external_mcp",
  }),
  {
    principalKind: "external_mcp",
    lane: "member",
    relation: "member",
    canReadMemberProjection: true,
    canWriteParticipation: true,
    canUseBuilderProjection: false,
  },
);
assert.equal(
  derivePolynetHumanAuthority({
    access: access({
      relation: "admin",
      can_manage_resources: true,
    }),
    principalKind: "personal_agent",
  })?.lane,
  "builder",
);

const architectureContract = read("docs/polynet-workspace-mcp-contract-v0.md");
assert.ok(
  architectureContract.includes("server revalidates community access"),
  "MCP provider contract should define per-call canonical authority",
);
assert.ok(
  architectureContract.includes("owner or admin"),
  "MCP provider contract should define builder authority",
);
assert.ok(
  architectureContract.includes("community-owned agent always uses the member lane"),
  "MCP provider contract should constrain community-owned authority",
);

console.log("community_capability_contract_proof: ok");
