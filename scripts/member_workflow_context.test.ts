import { expect, test } from "vitest";
import { memberFactVisibleToLens, buildMemberSpine, type MemberFactLike, type MemberOntologyLens } from "../shared/memberOntology";

const fact: MemberFactLike = { contextKind: "workflow", communityId: "a", kind: "goal",
  body: "Confidential service context", consentState: "approved", provenance: "form_answer" };

test.each<MemberOntologyLens>([
  { kind: "self" }, { kind: "external_profile" }, { kind: "member_orientation", communityId: "a" },
  { kind: "founder_admin", communityId: "b" }, { kind: "workflow_execution", communityId: "b" },
])("workflow-only context is hidden from $kind in $communityId", lens => {
  expect(memberFactVisibleToLens(fact, lens)).toBe(false);
});

test.each(["founder_admin", "workflow_execution"] as const)("%s is community-scoped and does not revive withdrawn evidence", kind => {
  expect(memberFactVisibleToLens(fact, { kind, communityId: "a" })).toBe(true);
  for (const consentState of ["pending", "rejected", "retracted", "superseded", "agent_internal"] as const) {
    expect(memberFactVisibleToLens({ ...fact, consentState }, { kind, communityId: "a" })).toBe(false);
  }
  expect(memberFactVisibleToLens({ ...fact, provenance: "observed_behavior" }, { kind, communityId: "a" })).toBe(false);
  expect(memberFactVisibleToLens({ ...fact, communityId: null }, { kind, communityId: "a" })).toBe(false);
});

test("historical profile semantics remain and workflow records never enter the profile spine", () => {
  const { contextKind: _kind, ...historical } = fact;
  expect(memberFactVisibleToLens(historical, { kind: "self" })).toBe(true);
  expect(memberFactVisibleToLens(historical, { kind: "member_orientation", communityId: "a" })).toBe(true);
  expect(buildMemberSpine([{ ...fact, communityId: null }]).goals).toEqual([]);
});
