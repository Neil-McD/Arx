import { expect, test } from "vitest";
import { parseWorkflowGoalAssessment, readAssessmentCitations } from "../shared/communityWorkflowAssessment";
test("historical citations fail closed and exclude uncited or truncated answers", () => {
  const snapshot = JSON.stringify({ timed_member_context: JSON.stringify({ evidence: { submissions: [{ request_id: "r", version_id: "v", form_name: "Intake", questions: [
    { key: "a", title: "Offer?", answer: "Coaching", truncated: false },
    { key: "b", title: "Private", answer: "Not cited", truncated: false },
    { key: "c", title: "Cut off", answer: "Partial", truncated: true },
  ] }] } }) });
  expect(readAssessmentCitations(snapshot, ["r:v:a", "r:v:c"])).toEqual([{ ref: "r:v:a", form: "Intake", question: "Offer?", answer: "Coaching" }]);
  expect(readAssessmentCitations(undefined, ["r:v:a"])).toEqual([]);
  expect(readAssessmentCitations("{}", ["r:v:a"])).toEqual([]);
});
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
