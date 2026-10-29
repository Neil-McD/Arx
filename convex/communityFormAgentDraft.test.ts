import { describe, expect, it } from "vitest";
import { normalizeCommunityFormAgentDraft } from "../shared/communityFormAgentDraft";

const properties = [
  { key: "plan", name: "Plan", type: "select", options: ["Starter", "Pro"] },
  { key: "goal", name: "90-day goal", type: "text", options: [] },
  { key: "revenue", name: "Revenue", type: "number", options: [] },
];
let n = 0; const key = () => `k${++n}`;

describe("normalizeCommunityFormAgentDraft", () => {
  it("keeps fitting field links and drops ones the field can't hold", () => {
    const reply = "Here you go:\n" + JSON.stringify({ name: "Welcome", questions: [
      { title: "Which plan?", type: "single_choice", options: ["Starter", "Pro", "pro"], fills: "plan" },
      { title: "Your goal", type: "long_text", fills: "goal", required: false },
      { title: "Revenue band", type: "single_choice", options: ["<10k", "10k+"], fills: "revenue" },
      { title: "Tier", type: "single_choice", options: ["Gold", "Silver"], fills: "plan" },
      { title: "Invented", type: "short_text", fills: "made_up" },
      { title: "", type: "short_text" },
      { title: "One option", type: "multiple_choice", options: ["Only"] },
    ] });
    const form = normalizeCommunityFormAgentDraft(reply, properties, key);
    expect(form.name).toBe("Welcome");
    expect(form.questions.map(q => [q.title, q.type, q.clientPropertyKey ?? null, q.required])).toEqual([
      ["Which plan?", "single_choice", "plan", true],
      ["Your goal", "long_text", "goal", false],
      ["Revenue band", "single_choice", null, true],
      ["Tier", "single_choice", null, true],
      ["Invented", "short_text", null, true],
      ["One option", "short_text", null, true],
    ]);
    expect(form.questions[0].options).toEqual(["Starter", "Pro"]);
    expect(new Set(form.questions.map(q => q.key)).size).toBe(6);
  });
  it("refuses replies with no usable questions", () => {
    expect(() => normalizeCommunityFormAgentDraft("sorry", properties, key)).toThrow("form_draft_unreadable");
    expect(() => normalizeCommunityFormAgentDraft('{"questions": []}', properties, key)).toThrow("form_draft_empty");
  });
});
