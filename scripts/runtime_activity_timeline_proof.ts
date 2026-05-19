import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildAgentActivityTimeline,
  type AgentActivityKind,
} from "../shared/runtimeActivityTimeline.ts";

function readText(path: string | URL): string {
  return readFileSync(path, "utf8");
}

function assertContains(haystack: string, needle: string, label: string): void {
  assert.ok(haystack.includes(needle), `expected ${label}`);
}

function event(params: {
  seq: number;
  event_type: string;
  payload?: unknown;
  created_at?: string;
}) {
  return {
    id: `event:${params.seq}`,
    run_id: "run_1",
    seq: params.seq,
    event_type: params.event_type,
    payload: params.payload ?? null,
    created_at: params.created_at ?? new Date(Date.UTC(2026, 3, 25, 12, 0, params.seq)).toISOString(),
  };
}

function started(seq: number, toolName: string, args: Record<string, unknown>, createdAt?: string) {
  return event({
    seq,
    event_type: "tool_call_started",
    payload: {
      tool_call_id: `call:${seq}`,
      tool_name: toolName,
      args,
    },
    created_at: createdAt,
  });
}

function finished(
  seq: number,
  startedSeq: number,
  toolName: string,
  args: Record<string, unknown>,
  status: "ok" | "error" = "ok",
  extra: Record<string, unknown> = {},
  createdAt?: string,
) {
  return event({
    seq,
    event_type: "tool_call_finished",
    payload: {
      tool_call_id: `call:${startedSeq}`,
      tool_name: toolName,
      args,
      status,
      ...extra,
    },
    created_at: createdAt,
  });
}

function kinds(events: ReturnType<typeof event>[]): AgentActivityKind[] {
  return buildAgentActivityTimeline(events).map((step) => step.kind);
}

const projection = readText(new URL("../shared/runtimeActivityTimeline.ts", import.meta.url));
const runtimeTimelineUi = readText(new URL("../shared/runtimeTimelineUi.ts", import.meta.url));

for (const token of [
  "export type AgentActivityKind",
  '"planning"',
  '"connecting"',
  '"exploring"',
  '"reading"',
  '"editing"',
  '"verifying"',
  '"blocked"',
  '"completed"',
  "buildAgentActivityTimeline",
  "workspace_session_create_started",
  "workspace_session_create_completed",
  "isVerificationShellCommand",
  "totalDurationMs",
]) {
  assertContains(projection, token, `activity projection token ${token}`);
}

assertContains(
  runtimeTimelineUi,
  "buildRuntimeLiveTimeline",
  "runtime timeline UI projection remains intact",
);

const startingWorkspace = [
  event({ seq: 1, event_type: "run_started", created_at: "2026-04-25T12:00:00.000Z" }),
  event({
    seq: 2,
    event_type: "workspace_session_create_started",
    payload: { run_id: "run_1", project_id: "project_1", tool_name: "bash" },
    created_at: "2026-04-25T12:00:01.000Z",
  }),
];
const startingWorkspaceSteps = buildAgentActivityTimeline(startingWorkspace);
assert.deepEqual(
  startingWorkspaceSteps.map((step) => step.kind),
  ["planning", "connecting"],
);
assert.equal(startingWorkspaceSteps[1]?.title, "Starting workspace computer");
assert.equal(startingWorkspaceSteps[1]?.status, "running");
assert.equal(startingWorkspaceSteps[1]?.isActive, true);
assert.match(startingWorkspaceSteps[1]?.summary ?? "", /coming online/);

const readyWorkspace = [
  ...startingWorkspace,
  event({
    seq: 3,
    event_type: "workspace_session_adopted",
    payload: {
      run_id: "run_1",
      project_id: "project_1",
      sandbox_id: "sandbox_1",
      source: "project_background",
    },
    created_at: "2026-04-25T12:00:08.000Z",
  }),
  event({
    seq: 4,
    event_type: "workspace_session_create_completed",
    payload: {
      run_id: "run_1",
      project_id: "project_1",
      tool_name: "bash",
      latency_ms: 9000,
      status: "ok",
      sandbox_id: "sandbox_1",
    },
    created_at: "2026-04-25T12:00:10.000Z",
  }),
];
const readyWorkspaceStep = buildAgentActivityTimeline(readyWorkspace).find(
  (step) => step.kind === "connecting",
);
assert.equal(readyWorkspaceStep?.status, "ok");
assert.match(readyWorkspaceStep?.summary ?? "", /Workspace ready/);

const failedWorkspace = [
  ...startingWorkspace,
  event({
    seq: 3,
    event_type: "workspace_session_create_completed",
    payload: {
      run_id: "run_1",
      project_id: "project_1",
      tool_name: "bash",
      latency_ms: 5000,
      status: "error",
      code: "workspace_session_create_failed",
    },
    created_at: "2026-04-25T12:00:06.000Z",
  }),
];
const failedWorkspaceStep = buildAgentActivityTimeline(failedWorkspace).find(
  (step) => step.kind === "connecting",
);
assert.equal(failedWorkspaceStep?.status, "error");
assert.match(failedWorkspaceStep?.summary ?? "", /workspace_session_create_failed/);

const happyPath = [
  event({ seq: 1, event_type: "run_started", created_at: "2026-04-25T12:00:00.000Z" }),
  started(2, "list_dir", { path: "convex" }),
  finished(3, 2, "list_dir", { path: "convex" }),
  started(4, "grep", { pattern: "runtimeRunEvents", path: "convex" }),
  finished(5, 4, "grep", { pattern: "runtimeRunEvents", path: "convex" }),
  started(6, "read", { path: "convex/runtimeTurnHandlers.ts" }),
  finished(7, 6, "read", { path: "convex/runtimeTurnHandlers.ts" }),
  started(8, "edit", { path: "convex/runtimeTurnHandlers.ts" }),
  finished(9, 8, "edit", { path: "convex/runtimeTurnHandlers.ts" }, "ok", {
    diff_stats: { lines_added: 12, lines_removed: 3 },
  }),
  started(10, "bash", { command: "npm run build" }),
  finished(11, 10, "bash", { command: "npm run build" }),
  event({ seq: 12, event_type: "run_finished", payload: { status: "ok" }, created_at: "2026-04-25T12:02:14.000Z" }),
];

const happySteps = buildAgentActivityTimeline(happyPath);
assert.deepEqual(
  happySteps.map((step) => step.kind),
  ["planning", "exploring", "reading", "editing", "verifying", "completed"],
);
assert.equal(happySteps.find((step) => step.kind === "exploring")?.stats.directoriesScanned, 1);
assert.equal(happySteps.find((step) => step.kind === "exploring")?.stats.searches, 1);
assert.equal(happySteps.find((step) => step.kind === "reading")?.stats.filesRead, 1);
assert.equal(happySteps.find((step) => step.kind === "editing")?.stats.filesChanged, 1);
assert.equal(happySteps.find((step) => step.kind === "editing")?.stats.linesAdded, 12);
assert.equal(happySteps.find((step) => step.kind === "editing")?.stats.linesRemoved, 3);
assert.equal(happySteps.find((step) => step.kind === "verifying")?.stats.checksPassed, 1);
assert.equal(happySteps.find((step) => step.kind === "completed")?.stats.totalDurationMs, 134000);
assert.match(happySteps.find((step) => step.kind === "completed")?.summary ?? "", /2m 14s/);

const failedBuild = [
  event({ seq: 1, event_type: "run_started" }),
  started(2, "edit", { path: "src/App.tsx" }),
  finished(3, 2, "edit", { path: "src/App.tsx" }),
  started(4, "bash", { command: "npm run build" }),
  finished(5, 4, "bash", { command: "npm run build" }, "error", {
    error_message: "Build failed",
  }),
  event({
    seq: 6,
    event_type: "run_finished",
    payload: { status: "error", error_message: "Build failed" },
  }),
];
const failedSteps = buildAgentActivityTimeline(failedBuild);
assert.deepEqual(
  failedSteps.map((step) => step.kind),
  ["planning", "editing", "verifying", "blocked"],
);
assert.equal(failedSteps.find((step) => step.kind === "verifying")?.status, "error");
assert.equal(failedSteps.find((step) => step.kind === "verifying")?.stats.checksFailed, 1);
assert.equal(failedSteps.find((step) => step.kind === "blocked")?.status, "error");

const readOnly = [
  event({ seq: 1, event_type: "run_started" }),
  started(2, "bash", { command: "rg runtimeRunEvents convex shared" }),
  finished(3, 2, "bash", { command: "rg runtimeRunEvents convex shared" }),
  started(4, "bash", { command: "sed -n '1,120p' shared/runtimeTimelineUi.ts" }),
  finished(5, 4, "bash", { command: "sed -n '1,120p' shared/runtimeTimelineUi.ts" }),
  event({ seq: 6, event_type: "run_finished", payload: { status: "ok" } }),
];
assert.deepEqual(kinds(readOnly), ["planning", "exploring", "reading", "completed"]);
assert.equal(
  buildAgentActivityTimeline(readOnly).some((step) => step.kind === "verifying"),
  false,
  "generic/read-only bash must not become verifying",
);

const live = [
  event({ seq: 1, event_type: "run_started" }),
  started(2, "read", { path: "shared/runtimeTimelineUi.ts" }),
];
const liveSteps = buildAgentActivityTimeline(live);
assert.equal(liveSteps[liveSteps.length - 1]?.kind, "reading");
assert.equal(liveSteps[liveSteps.length - 1]?.status, "running");
assert.equal(liveSteps[liveSteps.length - 1]?.isActive, true);

console.log("runtime_activity_timeline_proof: ok");
