import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { ASSESSMENT_SMOKE_FIXTURES, buildAssessmentSmokeFixture, requireAssessmentSmokeStage } from "../shared/workflowAssessmentSmoke";
import { parseWorkflowGoalAssessment } from "../shared/communityWorkflowAssessment";

test("smoke fails closed outside the exact staging deployment", () => {
  for (const value of [undefined, "", "https://production.convex.cloud", "https://quick-porcupine-949.convex.cloud.evil"]) expect(() => requireAssessmentSmokeStage(value)).toThrow();
  expect(() => requireAssessmentSmokeStage("https://quick-porcupine-949.convex.cloud")).not.toThrow();
});
test("fixed synthetic fixtures use canonical private policy and bounded prompts", () => {
  expect(ASSESSMENT_SMOKE_FIXTURES).toHaveLength(3);
  for (const fixture of ASSESSMENT_SMOKE_FIXTURES) {
    const bundle = buildAssessmentSmokeFixture(fixture);
    expect(bundle.messages[0].content).toContain("Privately assess");
    expect(bundle.messages[0].content).toContain(fixture.goal);
    expect(JSON.stringify(bundle.messages)).toContain(fixture.answer);
    expect(new TextEncoder().encode(JSON.stringify(bundle.messages)).length).toBeLessThan(16_000);
    expect(bundle.refs[0]).toContain("synthetic-");
    expect(parseWorkflowGoalAssessment(JSON.stringify({ verdict: fixture.expected, reason: "Fixture", evidenceRefs: bundle.refs }), bundle.refs, false).verdict).toBe(fixture.expected);
  }
});
test("smoke has no product writes, public endpoints, or configurable paid repetition", () => {
  const source = readFileSync(new URL("../convex/workflowAssessmentSmoke.ts", import.meta.url), "utf8");
  expect(source).not.toMatch(/ctx\.db\.(insert|patch|delete|replace)|ctx\.scheduler|export const .* = (action|mutation)\(/);
  expect(source).toContain('if (called) throw new Error("smoke_provider_retry_forbidden")');
  expect(source).toContain('perCallCeiling * ASSESSMENT_SMOKE_FIXTURES.length > 1_000_000');
  expect(source).toContain('admission.mode !== "platform_operator_grant"');
});
