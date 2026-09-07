import { expect, test } from "vitest";
import { parseWorkflowGoalAssessment } from "../shared/communityWorkflowAssessment";
test.each(["not_yet", "insufficient_evidence"])("valid %s is a judgment, not an execution error", verdict => {
  expect(parseWorkflowGoalAssessment(JSON.stringify({ verdict, reason: "Need more evidence", evidenceRefs: [] }), [], false).verdict).toBe(verdict);
});
test("a pass requires real complete evidence", () => {
  const value = { verdict: "achieved", reason: "The offer is written", evidenceRefs: ["r:v:q"] };
  expect(parseWorkflowGoalAssessment(JSON.stringify(value), ["r:v:q"], false)).toEqual(value);
  expect(() => parseWorkflowGoalAssessment(JSON.stringify(value), [], false)).toThrow();
  expect(() => parseWorkflowGoalAssessment(JSON.stringify(value), ["r:v:q"], true)).toThrow();
  expect(() => parseWorkflowGoalAssessment(JSON.stringify({ ...value, evidenceRefs: [] }), [], false)).toThrow();
});
