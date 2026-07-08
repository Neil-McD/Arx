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

/* 4. observed_behavior never reaches the member-to-member lens, any state. */
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
  memberFactVisibleToLens(
    {
      communityId: "community_a",
      kind: "preference",
      body: "Posts at night",
      provenance: "observed_behavior",
      consentState: "agent_internal",
    },
    { kind: "founder_admin", communityId: "community_a" },
  ),
  "the founder lens may reason over its community's observed facts",
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
  { communityId: null, kind: "situation", body: "Building Polynet", provenance: "stated_bridge", consentState: "approved" },
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
  /loadActiveMembership\(ctx, args\.communityId, args\.subjectUserId\)/,
  "orientation requires the SUBJECT's active membership — leaving hides member-to-member (retention-on-leave)",
);
assert.match(
  surface,
  /loadActiveMembership\(ctx, args\.communityId, viewerUserId\)/,
  "orientation requires the VIEWER's active membership",
);
assert.match(
  surface,
  /provenance !== "stated_interview" && draft\.provenance !== "form_answer"/,
  "the confirm-card mutation accepts only interview/form provenances",
);
assert.match(surface, /communityMembershipRowIsActive/, "membership checks use the canonical helper");
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
  tier: "premium" as const,
  timezone: "America/New_York",
  inferenceProvider: "chatgpt" as const,
  socialLinks: ["https://x.com/neil"],
  memberships: [{ communityName: "Polynet", role: "member", accessSource: "free_grant" }],
  ownedCommunities: [{ name: "Atlas Collective" }],
};
const goldenFacts: MemberFactLike[] = [
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
    "- Tier: premium",
    "- Timezone: America/New_York",
    "- Inference: ChatGPT",
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
assert.match(surface, /loadMemberAccountContext/, "the context query must assemble the deterministic account block");
assert.match(surface, /renderMemberContextMarkdown/, "the context query must render through the one renderer");

console.log("PASS: member ontology contract holds — consent from provenance, one predicate, one renderer, isolated scopes.");
