/* Proof obligations from docs/member-ontology-contract-v1.md §Proof Obligations.
   Exercises the pure core directly plus static asserts on the Convex glue. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MEMBER_FACT_PROVENANCES,
  buildMemberSpine,
  canTransitionMemberFactConsent,
  deriveBornConsentState,
  memberFactVisibleToLens,
  type MemberFactLike,
} from "../shared/memberOntology.ts";
import { renderMemberContextMarkdown } from "../shared/memberContextMarkdown.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const surface = read("convex/memberOntology.ts");
const core = read("convex/memberOntologyCore.ts");
const schema = read("convex/schema.ts");
const profiles = read("convex/profiles.ts");
const cloudProfilesGateway = read("shared/cloudProfilesGateway.ts");
const toolRegistry = read("shared/toolRegistry.ts");
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");
const app = read("apps/web/src/App.tsx");
const bridgeBackfillScript = read("scripts/backfill_bridge_social_link_facts.sh");
const contractDoc = read("docs/member-ontology-contract-v1.md");

/* 1. Born consent state matches provenance for all six provenances. */
assert.equal(deriveBornConsentState("stated_bridge"), "approved");
assert.equal(deriveBornConsentState("stated_interview"), "approved");
assert.equal(deriveBornConsentState("form_answer"), "approved");
assert.equal(deriveBornConsentState("social_enrichment"), "pending");
assert.equal(deriveBornConsentState("inferred_agent"), "pending");
assert.equal(deriveBornConsentState("observed_behavior"), "agent_internal");
assert.equal(MEMBER_FACT_PROVENANCES.length, 6, "provenance vocabulary is closed at six values");

/* 2. Illegal transitions are rejected; members approve, agents propose only. */
assert.ok(
  canTransitionMemberFactConsent({ from: "pending", to: "approved", actorType: "member" }),
  "the member may approve a pending fact",
);
assert.ok(
  canTransitionMemberFactConsent({ from: "pending", to: "rejected", actorType: "member" }),
  "the member may reject a pending fact",
);
assert.ok(
  canTransitionMemberFactConsent({ from: "approved", to: "retracted", actorType: "member" }),
  "the member may retract an approved fact",
);
assert.ok(
  canTransitionMemberFactConsent({ from: "pending", to: "superseded", actorType: "agent" }),
  "agents may supersede with newer proposals",
);
for (const actorType of ["agent", "admin", "compiler", "system"] as const) {
  assert.ok(
    !canTransitionMemberFactConsent({ from: "pending", to: "approved", actorType }),
    `${actorType} must not approve on a member's behalf`,
  );
  assert.ok(
    !canTransitionMemberFactConsent({ from: "approved", to: "retracted", actorType }),
    `${actorType} must not retract on a member's behalf`,
  );
}
for (const to of ["approved", "pending", "rejected", "retracted", "superseded"] as const) {
  assert.ok(
    !canTransitionMemberFactConsent({ from: "agent_internal", to, actorType: "member" }),
    `agent_internal is terminal (attempted → ${to})`,
  );
}
assert.ok(
  !canTransitionMemberFactConsent({ from: "approved", to: "approved", actorType: "member" }),
  "approve is only legal from pending",
);

/* 3. Cross-community isolation: community A facts invisible to community B. */
const factInA: MemberFactLike = {
  communityId: "community_a",
  kind: "situation",
  body: "Runs a 3-person agency",
  provenance: "stated_interview",
  consentState: "approved",
};
assert.ok(
  memberFactVisibleToLens(factInA, { kind: "member_orientation", communityId: "community_a" }),
  "approved community fact is visible to that community's orientation lens",
);
assert.ok(
  !memberFactVisibleToLens(factInA, { kind: "member_orientation", communityId: "community_b" }),
  "community A facts must never surface through community B's orientation lens",
);
assert.ok(
  !memberFactVisibleToLens(factInA, { kind: "founder_admin", communityId: "community_b" }),
  "community A facts must never surface through community B's founder lens",
);
assert.ok(
  memberFactVisibleToLens(factInA, { kind: "founder_admin", communityId: "community_a" }),
  "approved community facts are visible through that community's founder/admin lens",
);
assert.ok(
  !memberFactVisibleToLens(factInA, { kind: "external_profile" }),
  "external profile must never expose community-scoped facts",
);

const approvedPlatformFact: MemberFactLike = {
  communityId: null,
  kind: "goal",
  body: "Ship the Polynet profile bridge",
  provenance: "stated_interview",
  consentState: "approved",
};
assert.ok(
  memberFactVisibleToLens(approvedPlatformFact, { kind: "external_profile" }),
  "external profile exposes approved platform-scoped facts",
);
assert.ok(
  !memberFactVisibleToLens(
    { ...approvedPlatformFact, consentState: "retracted" },
    { kind: "external_profile" },
  ),
  "external profile excludes audit-history states",
);

/* 4. Unapproved and internal facts never reach founder/admin or orientation. */
const founderHiddenFacts: MemberFactLike[] = [
  { communityId: "community_a", kind: "goal", body: "Pending", provenance: "inferred_agent", consentState: "pending" },
  { communityId: "community_a", kind: "goal", body: "Rejected", provenance: "inferred_agent", consentState: "rejected" },
  { communityId: "community_a", kind: "goal", body: "Retracted", provenance: "stated_interview", consentState: "retracted" },
  { communityId: "community_a", kind: "goal", body: "Superseded", provenance: "stated_interview", consentState: "superseded" },
  { communityId: "community_a", kind: "preference", body: "Observed", provenance: "observed_behavior", consentState: "agent_internal" },
];
for (const fact of founderHiddenFacts) {
  assert.ok(
    !memberFactVisibleToLens(fact, { kind: "founder_admin", communityId: "community_a" }),
    `founder/admin must not see ${fact.consentState} facts`,
  );
  assert.ok(
    memberFactVisibleToLens(fact, { kind: "self" }),
    `the member's self lens must retain its own ${fact.consentState} facts`,
  );
}

/* observed_behavior never reaches member-to-member orientation, any state. */
for (const consentState of ["approved", "pending", "agent_internal"] as const) {
  assert.ok(
    !memberFactVisibleToLens(
      {
        communityId: "community_a",
        kind: "preference",
        body: "Posts at night, quiet on weekends",
        provenance: "observed_behavior",
        consentState,
      },
      { kind: "member_orientation", communityId: "community_a" },
    ),
    `observed_behavior must be invisible member-to-member (state ${consentState})`,
  );
}
assert.ok(
  !memberFactVisibleToLens(
    {
      communityId: "community_a",
      kind: "preference",
      body: "Posts at night",
      provenance: "observed_behavior",
      consentState: "agent_internal",
    },
    { kind: "founder_admin", communityId: "community_a" },
  ),
  "observed behavior must not escape through the human founder/admin lens",
);
assert.ok(
  !memberFactVisibleToLens(
    {
      communityId: "community_a",
      kind: "goal",
      body: "Automate client reports",
      provenance: "inferred_agent",
      consentState: "pending",
    },
    { kind: "member_orientation", communityId: "community_a" },
  ),
  "pending facts are invisible member-to-member until approved",
);

/* 5. The spine projects only approved, platform-scoped facts. */
const spine = buildMemberSpine([
  { communityId: null, kind: "situation", body: "Building Polynet", provenance: "stated_interview", consentState: "approved" },
  { communityId: null, kind: "goal", body: "Ship the bridge", provenance: "stated_interview", consentState: "approved" },
  { communityId: null, kind: "link", body: "https://x.com/neil", provenance: "stated_bridge", consentState: "approved" },
  { communityId: null, kind: "goal", body: "PENDING must not project", provenance: "inferred_agent", consentState: "pending" },
  { communityId: "community_a", kind: "goal", body: "COMMUNITY-SCOPED must not project", provenance: "stated_interview", consentState: "approved" },
  { communityId: null, kind: "interest", body: "RETRACTED must not project", provenance: "stated_interview", consentState: "retracted" },
]);
assert.equal(spine.situation, "Building Polynet");
assert.deepEqual(spine.goals, ["Ship the bridge"]);
assert.deepEqual(spine.links, ["https://x.com/neil"]);
assert.deepEqual(spine.interests, []);

/* 6. Static: the Convex glue routes through the shared core and never
   hand-rolls consent or visibility; retention-on-leave is structural. */
assert.match(core, /memberFactVisibleToLens/, "db reads must filter through the shared predicate");
assert.match(core, /deriveBornConsentState/, "born consent must come from the shared derivation");
assert.match(core, /canTransitionMemberFactConsent/, "transitions must consult the shared state machine");
assert.match(surface, /readMemberFactsForLens/, "the public surface must read through the lens helper");
assert.doesNotMatch(
  surface,
  /consentState\s*===|consent_state\s*===/,
  "no ad-hoc consent filtering at query sites — the predicate is the only judge",
);
assert.match(
  surface,
  /provenance !== "stated_interview" && draft\.provenance !== "form_answer"/,
  "the confirm-card mutation accepts only interview/form provenances",
);
assert.match(
  toolRegistry,
  /MEMBER_PROFILE_CONFIRM_FACTS_TOOL_SCHEMA[\s\S]*enum: \["stated_interview", "form_answer"\]/,
  "the member profile confirmation tool schema must accept only interview/form provenances",
);
assert.match(
  toolRegistry,
  /toolName === "member_profile_confirm_facts"[\s\S]*supports at most 12 facts/,
  "the member profile confirmation tool must accept only bounded confirmed interview/form facts",
);
assert.match(
  runtimeAgentLoop,
  /params\.toolName === "member_profile_confirm_facts"[\s\S]*community_required[\s\S]*authenticated_user_required[\s\S]*memberOntology\.confirmMemberInterviewFacts/,
  "the dormant profile confirmation primitive must require active community/auth and delegate to the existing confirmation mutation",
);
assert.match(surface, /communityMembershipRowIsActive/, "membership checks use the canonical helper");
assert.match(
  core,
  /insertMissingBridgeSocialLinkFacts[\s\S]*by_user_community[\s\S]*row\.kind === "link" && row\.consentState !== "superseded"[\s\S]*dryRun[\s\S]*deriveBornConsentState\("stated_bridge"\)[\s\S]*recomputeMemberSpine/,
  "bridge social-link inserts must check existing non-superseded platform link facts before writing",
);
assert.match(
  profiles,
  /shouldSeedFirstCompletionBridgeFacts[\s\S]*listBridgeSocialLinks\(nextSocialLinks\)/,
  "bridge link facts seed only on first account completion, not every profile save",
);
assert.match(
  profiles,
  /insertMissingBridgeSocialLinkFacts\(ctx,[\s\S]*userId: actor\.dbUserId,[\s\S]*confirmMarker: "bridge:account_setup_completed"/,
  "profile completion must seed platform-scoped member-owned link facts server-side",
);
assert.match(
  profiles,
  /backfillCompletedProfileBridgeSocialLinkFacts = mutation\([\s\S]*cursor: v\.optional\(v\.union\(v\.string\(\), v\.null\(\)\)\)[\s\S]*requireOperatorRole\(ctx, args\.authSubject, "operator"\)[\s\S]*const dryRun = args\.dryRun !== false[\s\S]*\.paginate\(\{[\s\S]*cursor: args\.cursor \?\? null[\s\S]*numItems: maxProfiles[\s\S]*maximumRowsRead: maxProfiles[\s\S]*typeof detail\.onboardingCompletedAt !== "number"[\s\S]*normalizeSocialProfileLinks[\s\S]*preview\.missing\.slice\(0, remainingInsertBudget\)/,
  "bridge social-link backfill must be operator-gated, dry-run by default, cursorable, completed-profile-only, normalized, and insert-limited",
);
assert.match(
  profiles,
  /next_cursor: page\.isDone \? null : page\.continueCursor/,
  "bridge social-link backfill must return the Convex continue cursor",
);
assert.match(
  bridgeBackfillScript,
  /EXPECTED_CONVEX_DEPLOYMENT="dev:quick-porcupine-949"[\s\S]*--write[\s\S]*--cursor[\s\S]*profiles:backfillCompletedProfileBridgeSocialLinkFacts/,
  "bridge social-link backfill script should be staging-guarded, write-explicit, and cursorable",
);
assert.doesNotMatch(
  cloudProfilesGateway,
  /recordStatedBridgeMemberFacts|memberOntology:recordStatedBridgeFacts/,
  "bridge ontology seeding must not depend on a client-side best-effort gateway call",
);
assert.doesNotMatch(
  app,
  /recordBridgeLedgerFactsBestEffort|recordStatedBridgeMemberFacts/,
  "bridge completion must not call a separate client-side ontology write path",
);
assert.match(schema, /memberFacts: defineTable/, "memberFacts ledger table must exist");
assert.match(schema, /memberProfileSpines: defineTable/, "spine projection table must exist");
assert.match(schema, /\.index\("by_user_community", \["userId", "communityId"\]\)/, "ledger must index user+community");
assert.doesNotMatch(
  core,
  /\.insert\("memberProfileSpines"[\s\S]{0,400}?\.insert\("memberProfileSpines"/,
  "only recomputeMemberSpine writes the spine",
);

/* 7. Golden render: the exact member.md/{community}.md the agent is injected
   with (and the member reads) — locks format drift. */
const goldenAccount = {
  displayName: "Neil",
  handle: "neil",
  timezone: "America/New_York",
  socialLinks: ["https://x.com/neil"],
  memberships: [{ communityName: "Polynet", role: "member", accessSource: "free_grant" }],
  ownedCommunities: [{ name: "Atlas Collective" }],
};
const goldenFacts: MemberFactLike[] = [
  { communityId: null, kind: "link", body: "https://x.com/neil", provenance: "stated_bridge", consentState: "approved" },
  { communityId: null, kind: "situation", body: "Building Polynet", provenance: "stated_interview", consentState: "approved" },
  { communityId: null, kind: "goal", body: "Ship the bridge", provenance: "stated_interview", consentState: "approved" },
  { communityId: "c1", kind: "goal", body: "Meet builders", provenance: "stated_interview", consentState: "approved" },
];
const golden = renderMemberContextMarkdown({
  account: goldenAccount,
  facts: goldenFacts,
  lens: { kind: "self" },
  communityId: "c1",
  communityName: "Atlas Collective",
});
assert.equal(
  golden.memberMd,
  [
    "# Member — Neil (@neil)",
    "",
    "## Account",
    "- Timezone: America/New_York",
    "- Member of: Polynet (member · free_grant)",
    "- Owns: Atlas Collective",
    "- Link: https://x.com/neil",
    "",
    "## Person",
    "",
    "### Situation",
    "- Building Polynet",
    "",
    "### Goals",
    "- Ship the bridge",
  ].join("\n"),
  "member.md golden output drifted",
);
assert.equal(
  golden.memberMd.match(/https:\/\/x\.com\/neil/g)?.length ?? 0,
  1,
  "account social links and bridge link facts must not duplicate in member.md",
);
assert.equal(
  golden.communityMd,
  ["# Atlas Collective — member context", "", "## Goals", "- Meet builders"].join("\n"),
  "{community}.md golden output drifted",
);

/* 8. Leak test: the renderer re-applies the predicate — an orientation-lens
   render over a dirty rowset must never emit pending, observed, cross-
   community, or platform-only fact bodies. */
const dirtyRows: MemberFactLike[] = [
  { communityId: "c1", kind: "goal", body: "VISIBLE_OK", provenance: "stated_interview", consentState: "approved" },
  { communityId: "c1", kind: "goal", body: "LEAK_PENDING", provenance: "inferred_agent", consentState: "pending" },
  { communityId: "c1", kind: "preference", body: "LEAK_OBSERVED", provenance: "observed_behavior", consentState: "agent_internal" },
  { communityId: "c2", kind: "goal", body: "LEAK_CROSS_COMMUNITY", provenance: "stated_interview", consentState: "approved" },
  { communityId: null, kind: "goal", body: "LEAK_PLATFORM_SCOPE", provenance: "stated_interview", consentState: "approved" },
];
const leakRender = renderMemberContextMarkdown({
  account: goldenAccount,
  facts: dirtyRows,
  lens: { kind: "member_orientation", communityId: "c1" },
  communityId: "c1",
  communityName: "Atlas Collective",
});
const leakOutput = `${leakRender.memberMd}\n${leakRender.communityMd ?? ""}`;
assert.match(leakOutput, /VISIBLE_OK/, "approved shared-community fact must render for orientation");
for (const leaked of ["LEAK_PENDING", "LEAK_OBSERVED", "LEAK_CROSS_COMMUNITY", "LEAK_PLATFORM_SCOPE"]) {
  assert.doesNotMatch(leakOutput, new RegExp(leaked), `orientation render leaked ${leaked}`);
}

/* 9. Static: the renderer stays pure and the Convex surface uses it. */
const rendererModule = read("shared/memberContextMarkdown.ts");
assert.doesNotMatch(rendererModule, /Date\.now|new Date\(/, "the renderer must be clock-free (deterministic golden output)");
assert.match(rendererModule, /memberFactVisibleToLens/, "the renderer must re-apply the one visibility predicate");
assert.match(
  contractDoc,
  /\| Founder\/admin \| one community \|[^\n]*`approved` facts scoped to that community; nothing pending, rejected, retracted, superseded, or observed/,
  "human founder/admin reads must remain community-scoped and exclude unapproved, withdrawn, and observed facts",
);
assert.match(
  contractDoc,
  /The distinct\s+`workflow_execution` lens is available only behind the internal execution-context\s+reader: canonical running serve request, current attempt and lease, exact linked\s+run\/member\/action, active community membership and agent\/source\/destination access/,
  "the separate workflow lens must require current execution, lease, membership, and target authority",
);
assert.match(
  contractDoc,
  /Clients cannot choose an arbitrary subject or inherit a sponsor's manager role\.\s+The reader is not registered as a member-agent or MCP tool/,
  "the internal workflow reader must not become a client-selected subject or a public tool",
);
assert.doesNotMatch(
  contractDoc,
  /Founder agent \(admin lens\)[^\n]*any consent state/,
  "the contract must not restore the old all-consent-state founder lens",
);

console.log("PASS: member ontology contract holds — consent from provenance, one predicate, one renderer, isolated scopes.");
