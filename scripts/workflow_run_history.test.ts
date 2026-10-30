import { expect, test } from "vitest";
import { groupWorkflowRunSteps, type WorkflowRunStepRow } from "../shared/workflowRunHistory";

const step = (id: string, extra: Partial<WorkflowRunStepRow> = {}): WorkflowRunStepRow => ({
  id, predecessor_id: null, membership_id: "m1", milestone_key: "s1", milestone_name: "Getting started", automation_key: `rule-${id}`,
  trigger_type: "form_submitted", action_type: "prompt_agent", status: "finished", skipped: false, error_code: null,
  created_at: 1000, finished_at: 1500, ...extra,
});

test("a run is the rule that started on its own plus every run that followed it", () => {
  const runs = groupWorkflowRunSteps([
    step("c", { predecessor_id: "b", created_at: 3000, finished_at: 3100 }),
    step("a"),
    step("b", { predecessor_id: "a", created_at: 2000, finished_at: 2100 }),
    step("x", { membership_id: "m2", created_at: 5000, finished_at: 5200 }),
  ]);
  expect(runs.map((run) => run.id)).toEqual(["x", "a"]);
  expect(runs[1].steps.map((s) => s.id)).toEqual(["a", "b", "c"]);
  expect(runs[1]).toMatchObject({ status: "done", started_at: 1000, finished_at: 3100 });
});

test("a failed step fails the run, a running one keeps it open, and a pending wait shows waiting", () => {
  expect(groupWorkflowRunSteps([step("a"), step("b", { predecessor_id: "a", status: "failed" })])[0].status).toBe("failed");
  expect(groupWorkflowRunSteps([step("a"), step("b", { predecessor_id: "a", status: "running", finished_at: null })])[0])
    .toMatchObject({ status: "running", finished_at: null });
  expect(groupWorkflowRunSteps([step("a")], (run) => run.id === "a")[0].status).toBe("waiting");
});

test("a step whose earlier run is outside the window starts its own run", () => {
  expect(groupWorkflowRunSteps([step("b", { predecessor_id: "gone" })]).map((run) => run.id)).toEqual(["b"]);
});
