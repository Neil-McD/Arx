import { expect, test } from "vitest";
import { existsSync } from "node:fs";
import { ASSESSMENT_SMOKE_FIXTURES, buildAssessmentSmokeFixture } from "../shared/workflowAssessmentSmoke";
import { parseWorkflowGoalAssessment } from "../shared/communityWorkflowAssessment";

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
test("completed campaign has no remaining paid runner", () => {
  expect(existsSync(new URL("../convex/workflowAssessmentSmoke.ts", import.meta.url))).toBe(false);
  expect(existsSync(new URL("./workflow_assessment_smoke.mjs", import.meta.url))).toBe(false);
});
