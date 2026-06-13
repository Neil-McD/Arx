import assert from "node:assert/strict";

import {
  buildRuntimeContextFragmentsFromParts,
  renderRuntimeContextFragmentsForPrompt,
  type RuntimeContextFragmentV1,
} from "../shared/runtimeContextFragments.ts";

function fragment(params: {
  id: string;
  ordinal: number;
  priority: RuntimeContextFragmentV1["priority"];
  body: string;
}): RuntimeContextFragmentV1 {
  return {
    version: 1,
    id: params.id,
    kind: "action_ledger",
    source: "runtime_run_events",
    ordinal: params.ordinal,
    priority: params.priority,
    title: params.id,
    body: params.body,
    budget: {
      maxChars: params.body.length,
      usedChars: params.body.length,
      truncated: false,
    },
    redaction: {
      applied: false,
      rules: [],
    },
    createdAt: null,
  };
}

const rendered = renderRuntimeContextFragmentsForPrompt(
  [
    fragment({
      id: "low",
      ordinal: 20,
      priority: "low",
      body: `LOW_FRAGMENT ${"low filler ".repeat(80)} LOW_TAIL_SHOULD_NOT_SURVIVE`,
    }),
    fragment({
      id: "critical",
      ordinal: 10,
      priority: "critical",
      body: `CRITICAL_KEEP ${"critical filler ".repeat(10)}`,
    }),
    fragment({
      id: "high",
      ordinal: 30,
      priority: "high",
      body: `HIGH_KEEP ${"high filler ".repeat(10)}`,
    }),
  ],
  { maxChars: 380 },
) ?? "";

assert.ok(rendered.length <= 380, "rendered context must respect the global budget");
assert.match(rendered, /CRITICAL_KEEP/, "critical fragment should survive tight budgets");
assert.match(rendered, /HIGH_KEEP/, "high-priority fragment should survive before low-priority detail");
assert.doesNotMatch(
  rendered,
  /LOW_TAIL_SHOULD_NOT_SURVIVE/,
  "low-priority detail should truncate or drop first under tight budgets",
);

const tinyBudgetRendered = renderRuntimeContextFragmentsForPrompt(
  [
    fragment({
      id: "tiny",
      ordinal: 10,
      priority: "critical",
      body: "TINY_BUDGET_FRAGMENT",
    }),
  ],
  { maxChars: 5 },
) ?? "";
assert.ok(tinyBudgetRendered.length <= 5, "tiny global budgets should never be exceeded");

const longWorkingState = buildRuntimeContextFragmentsFromParts({
  threadWorkingState: {
    version: 3,
    goal: "Prove fragment budgets.",
    status: "in_progress",
    currentStep: "Budget the working-state fragment.",
    plan: Array.from({ length: 20 }, (_, index) => `Plan item ${index}: ${"x".repeat(220)}`),
    completedSteps: Array.from({ length: 20 }, (_, index) => `Completed item ${index}: ${"y".repeat(220)}`),
    decisions: Array.from({ length: 20 }, (_, index) => `Decision ${index}: ${"z".repeat(220)}`),
    openQuestions: [],
    focusFiles: [],
    lastResult: "Large working state should be compacted.",
    verificationStatus: "needed",
    filesTouched: [],
    filesChanged: [],
    verifiedFindings: [],
    recentActions: Array.from({ length: 20 }, (_, index) => `Action ${index}: ${"a".repeat(220)}`),
    nextAction: "Keep the fragment within its budget.",
  },
});
const workingState = longWorkingState.find((item) => item.kind === "working_state");
assert.ok(workingState, "working-state fragment should be built");
assert.ok(
  workingState.budget.usedChars <= workingState.budget.maxChars,
  "fragment used chars should never exceed max chars",
);
assert.equal(
  workingState.budget.truncated,
  true,
  "oversized working-state fragment should record truncation",
);

console.log("runtime_context_fragments_budget_proof: ok");
