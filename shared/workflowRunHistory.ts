// Run history (Workflows → Run history): the engine stores one run per rule
// it executed, linked to the run it waited for (predecessorRunId). A run of an
// automation, the way Airtable lists it, is a rule that started on its own plus
// every run that followed from it.

export type WorkflowRunStepRow = {
  id: string;
  predecessor_id: string | null;
  membership_id: string;
  milestone_key: string;
  milestone_name: string;
  automation_key: string;
  trigger_type: string;
  action_type: string;
  status: "running" | "finished" | "failed";
  skipped: boolean;
  /** How a finished step ended, e.g. email_opted_out. */
  result_code?: string | null;
  error_code: string | null;
  created_at: number;
  finished_at: number | null;
};

export type WorkflowRunHistoryStatus = "done" | "failed" | "running" | "waiting";

export type WorkflowRunHistoryItem = {
  id: string;
  membership_id: string;
  milestone_key: string;
  milestone_name: string;
  automation_key: string;
  status: WorkflowRunHistoryStatus;
  started_at: number;
  finished_at: number | null;
  steps: WorkflowRunStepRow[];
};

/** Groups step runs into automation runs, newest first. `waiting` holds the runs a pending wait belongs to. */
export function groupWorkflowRunSteps(rows: WorkflowRunStepRow[], waiting: (run: WorkflowRunHistoryItem) => boolean = () => false): WorkflowRunHistoryItem[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const children = new Map<string, WorkflowRunStepRow[]>();
  const roots: WorkflowRunStepRow[] = [];
  for (const row of rows) {
    if (row.predecessor_id && byId.has(row.predecessor_id) && row.predecessor_id !== row.id) {
      children.set(row.predecessor_id, [...(children.get(row.predecessor_id) ?? []), row]);
    } else roots.push(row);
  }
  const items = roots.map((root) => {
    const steps: WorkflowRunStepRow[] = [];
    const seen = new Set<string>();
    const visit = (row: WorkflowRunStepRow) => {
      if (seen.has(row.id)) return;
      seen.add(row.id); steps.push(row);
      (children.get(row.id) ?? []).sort((a, b) => a.created_at - b.created_at).forEach(visit);
    };
    visit(root);
    const failed = steps.some((step) => step.status === "failed");
    const running = steps.some((step) => step.status === "running");
    const finishedAt = steps.reduce<number | null>((latest, step) => step.finished_at === null ? latest : Math.max(latest ?? 0, step.finished_at), null);
    const item: WorkflowRunHistoryItem = {
      id: root.id, membership_id: root.membership_id, milestone_key: root.milestone_key, milestone_name: root.milestone_name,
      automation_key: root.automation_key, status: failed ? "failed" : running ? "running" : "done",
      started_at: root.created_at, finished_at: running ? null : finishedAt, steps,
    };
    if (item.status === "done" && waiting(item)) item.status = "waiting";
    return item;
  });
  return items.sort((a, b) => b.started_at - a.started_at);
}
