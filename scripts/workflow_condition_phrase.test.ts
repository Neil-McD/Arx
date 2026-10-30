import { describe, expect, test } from "vitest";
import { workflowConditionPhrase } from "../apps/web/src/components/workflowStepSentences";
import { workflowConditionGroupHolds } from "../shared/communityMemberWorkflow";

const names = { forms: [], channels: [], catalog: { properties: [{ key: "plan", name: "Plan" }, { key: "goal", name: "Goal" }] } } as any;
const group = { propertyKey: "plan", op: "is" as const, value: "Pro", match: "all" as const, also: [{ propertyKey: "goal", op: "is_set" as const }] };

describe("Only if groups", () => {
  test("read as one sentence, and an Otherwise reads as the opposite", () => {
    expect(workflowConditionPhrase(group, names)).toBe("if Plan is Pro and Goal is filled in");
    expect(workflowConditionPhrase({ ...group, match: "any" }, names)).toBe("if Plan is Pro or Goal is filled in");
    expect(workflowConditionPhrase({ ...group, otherwise: true }, names)).toBe("if Plan isn't Pro or Goal is empty");
  });
  test("an Otherwise holds exactly when its Only if doesn't", () => {
    const members = [{ plan: "Pro", goal: "x" }, { plan: "Pro" }, { plan: "Basic", goal: "x" }, {}] as Array<Record<string, string>>;
    for (const values of members) {
      for (const match of ["all", "any"] as const) {
        const only = workflowConditionGroupHolds({ ...group, match }, (key) => values[key]);
        expect(workflowConditionGroupHolds({ ...group, match, otherwise: true }, (key) => values[key])).toBe(!only);
      }
    }
    expect(workflowConditionGroupHolds(group, (key) => ({ plan: "pro", goal: "x" } as Record<string, string>)[key])).toBe(true);
    expect(workflowConditionGroupHolds(group, (key) => ({ plan: "pro" } as Record<string, string>)[key])).toBe(false);
  });
});
