import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  POLYNET_PROFILE_CONFIRM_MAX_FACTS,
  buildPolynetProfileFactBatchKey,
  normalizePolynetProfileConfirmInput,
} from "../shared/polynetProfileMcpContract.ts";
import { memberFactVisibleToLens, type MemberFactLike } from "../shared/memberOntology.ts";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function assertIncludes(source: string, expected: string, label: string): void {
  assert.ok(source.includes(expected), `${label} should include ${expected}`);
}

function assertNotIncludes(source: string, forbidden: string, label: string): void {
  assert.ok(!source.includes(forbidden), `${label} should not include ${forbidden}`);
}

function toolDefinitionBlock(source: string, toolName: string): string {
  const startToken = `${toolName}: {`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${toolName} definition should exist`);
  const next = source.indexOf("\n  polynet_", start + startToken.length);
  return source.slice(start, next === -1 ? source.length : next);
}

function toolDispatchBlock(source: string, toolName: string): string {
  const startToken = `toolName === "${toolName}"`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${toolName} dispatch should exist`);
  const next = source.indexOf("\n  if (toolName ===", start + startToken.length);
  return source.slice(start, next === -1 ? source.length : next);
}

const normalized = normalizePolynetProfileConfirmInput({
  confirm_marker: " profile-setup-2026-07-17 ",
  facts: [
    { kind: "goal", body: "  Build   a member-led research community. " },
    { kind: "skill", body: "Community design" },
  ],
});
assert.deepEqual(normalized, {
  ok: true,
  input: {
    confirmMarker: "profile-setup-2026-07-17",
    facts: [
      { kind: "goal", body: "Build a member-led research community." },
      { kind: "skill", body: "Community design" },
    ],
  },
});

for (const [label, input] of [
  [
    "root user selector",
    { confirm_marker: "x", user_id: "other", facts: [{ kind: "goal", body: "Ship" }] },
  ],
  [
    "root community selector",
    { confirm_marker: "x", community_id: "other", facts: [{ kind: "goal", body: "Ship" }] },
  ],
  [
    "client provenance",
    {
      confirm_marker: "x",
      facts: [{ kind: "goal", body: "Ship", provenance: "inferred_agent" }],
    },
  ],
  [
    "client confidence",
    { confirm_marker: "x", facts: [{ kind: "goal", body: "Ship", confidence: 0.4 }] },
  ],
  ["empty batch", { confirm_marker: "x", facts: [] }],
  ["unsafe marker", { confirm_marker: "profile setup/1", facts: [{ kind: "goal", body: "Ship" }] }],
  ["invalid kind", { confirm_marker: "x", facts: [{ kind: "secret", body: "Ship" }] }],
  [
    "duplicate fact",
    {
      confirm_marker: "x",
      facts: [
        { kind: "goal", body: "Ship" },
        { kind: "goal", body: "Ship" },
      ],
    },
  ],
  [
    "oversized batch",
    {
      confirm_marker: "x",
      facts: Array.from({ length: POLYNET_PROFILE_CONFIRM_MAX_FACTS + 1 }, (_, index) => ({
        kind: "goal",
        body: `Goal ${index}`,
      })),
    },
  ],
] as const) {
  const result = normalizePolynetProfileConfirmInput(input as Record<string, unknown>);
  assert.equal(result.ok, false, `${label} should fail closed`);
}

const approvedBatch = [
  { kind: "goal", body: "Ship the alpha" },
  { kind: "skill", body: "Community design" },
];
assert.equal(
  buildPolynetProfileFactBatchKey(approvedBatch),
  buildPolynetProfileFactBatchKey([...approvedBatch].reverse()),
  "exact approval batch identity should be order independent",
);
assert.notEqual(
  buildPolynetProfileFactBatchKey(approvedBatch),
  buildPolynetProfileFactBatchKey([{ kind: "goal", body: "Ship the beta" }]),
  "a different approved batch should have a different identity",
);

const approvedPlatformFact: MemberFactLike = {
  communityId: null,
  kind: "goal",
  body: "Ship the alpha",
  provenance: "stated_interview",
  consentState: "approved",
};
assert.equal(
  memberFactVisibleToLens(approvedPlatformFact, { kind: "external_profile" }),
  true,
  "external profile lens should expose current approved platform facts",
);
assert.equal(
  memberFactVisibleToLens(
    { ...approvedPlatformFact, communityId: "community-a" },
    { kind: "external_profile" },
  ),
  false,
  "external profile lens should isolate community facts",
);
assert.equal(
  memberFactVisibleToLens(
    { ...approvedPlatformFact, consentState: "pending" },
    { kind: "external_profile" },
  ),
  false,
  "external profile lens should exclude unapproved facts",
);
assert.equal(
  memberFactVisibleToLens(
    { ...approvedPlatformFact, provenance: "observed_behavior", consentState: "agent_internal" },
    { kind: "external_profile" },
  ),
  false,
  "external profile lens should exclude agent-internal observations",
);

const mcp = read("shared/polynetMcp.ts");
const http = read("convex/httpMcp.ts");
const ontology = read("convex/memberOntology.ts");
const ontologyCore = read("convex/memberOntologyCore.ts");
const setup = read(
  "apps/web/src/components/WebIntegrationsSettingsSection.tsx",
);
const contract = read("docs/polynet-workspace-mcp-contract-v0.md");
const smoke = read("scripts/polynet_workspace_mcp_external_smoke.ts");

for (const toolName of [
  "polynet_get_my_profile",
  "polynet_confirm_my_profile_facts",
]) {
  assertIncludes(mcp, `| "${toolName}"`, `${toolName} type union`);
  assertIncludes(mcp, `name: "${toolName}"`, `${toolName} definition`);
  assertIncludes(http, `toolName === "${toolName}"`, `${toolName} dispatch`);
  assertIncludes(smoke, `"${toolName}"`, `${toolName} authenticated discovery smoke`);
}

const readDefinition = toolDefinitionBlock(mcp, "polynet_get_my_profile");
assertIncludes(readDefinition, "inputSchema: EMPTY_OBJECT_SCHEMA", "self-profile selector-free input");
assertIncludes(readDefinition, "readOnlyHint: true", "self-profile read annotation");
assertNotIncludes(readDefinition, "user_id", "self-profile user selector exclusion");
assertNotIncludes(readDefinition, "community_id", "self-profile community selector exclusion");

const confirmDefinition = toolDefinitionBlock(mcp, "polynet_confirm_my_profile_facts");
assertIncludes(
  confirmDefinition,
  "inputSchema: POLYNET_PROFILE_CONFIRM_INPUT_SCHEMA",
  "shared confirmation input contract",
);
assertIncludes(confirmDefinition, "idempotentHint: true", "confirmation idempotency annotation");
assertIncludes(confirmDefinition, "destructiveHint: false", "confirmation non-destructive annotation");

for (const toolName of ["polynet_get_my_profile", "polynet_confirm_my_profile_facts"]) {
  const dispatch = toolDispatchBlock(http, toolName);
  assertIncludes(dispatch, "userId: actor.dbUserId", `${toolName} verified OAuth actor binding`);
  assertNotIncludes(dispatch, "communityId:", `${toolName} community selector exclusion`);
  assertNotIncludes(dispatch, "toolArgs.user", `${toolName} user selector exclusion`);
}

assertIncludes(ontology, "readMemberFactsForLens", "canonical profile visibility reader");
assertIncludes(ontology, 'lens: { kind: "external_profile" }', "authenticated external profile lens");
assertIncludes(ontology, "scope: { communityId: null }", "indexed platform fact scope");
assertNotIncludes(ontology, "fact.consentState ===", "no ad-hoc profile consent filtering");
assertIncludes(ontologyCore, "memberFactVisibleToLens", "canonical external profile visibility predicate");
assertIncludes(ontology, "MCP_PROFILE_FACT_LIMIT = 100", "bounded external profile ledger");
assertIncludes(ontology, "communityId: null", "platform-scoped confirmed facts");
assertIncludes(ontology, 'provenance: "stated_interview"', "server-owned provenance");
assertIncludes(ontology, "confidence: 1", "server-owned confidence");
assertIncludes(ontology, 'createdByActorType: "member"', "member-approved authorship");
assertIncludes(ontology, "createdByUserId: args.userId", "verified member author identity");
assertIncludes(ontology, "MCP_PROFILE_MARKER_PREFIX", "server-owned evidence namespace");
assertIncludes(ontology, "member_profile_confirm_marker_conflict", "marker conflict guard");
assertIncludes(ontology, "buildPolynetProfileFactBatchKey(priorBatch)", "exact retry comparison");
assertIncludes(ontology, "insertMemberFacts", "canonical ontology write path");
assertIncludes(ontologyCore, "await recomputeMemberSpine", "canonical spine recomputation");
assertIncludes(ontologyCore, "deriveBornConsentState(normalized.provenance)", "canonical consent derivation");

assertIncludes(setup, "call `polynet_get_my_profile` before asking profile questions", "read before offer");
assertIncludes(setup, "Show the complete proposed batch", "complete draft review");
assertIncludes(setup, "Only after an explicit yes", "explicit approval gate");
assertIncludes(setup, "Do not ask again in this setup flow", "decline terminates profile setup");
assertIncludes(contract, "## Member Profile Boundary", "documented profile authority boundary");
assertIncludes(contract, "must not create a second external profile store", "single canonical profile store");

console.log("polynet_profile_mcp_contract_proof: ok");
