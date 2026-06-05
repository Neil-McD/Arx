import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildAgentActivityTimeline,
  type AgentActivityKind,
} from "../shared/runtimeActivityTimeline.ts";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function assertContains(haystack: string, needle: string, label: string): void {
  assert.ok(haystack.includes(needle), `expected ${label}`);
}

function assertDoesNotContain(haystack: string, needle: string, label: string): void {
  assert.ok(!haystack.includes(needle), `did not expect ${label}`);
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

const projection = readText("shared/runtimeActivityTimeline.ts");
const runtimeTimelineUi = readText("shared/runtimeTimelineUi.ts");
const runtimeLiveTimeline = readText("apps/web/src/components/RuntimeLiveTimeline.tsx");

for (const token of [
  "export type AgentActivityKind",
  '"exploring"',
  '"reading"',
  '"editing"',
  '"verifying"',
  '"blocked"',
  '"completed"',
  "buildAgentActivityTimeline",
  "isVerificationShellCommand",
  "totalDurationMs",
]) {
  assertContains(projection, token, `activity projection token ${token}`);
}

assertDoesNotContain(
  projection,
  '"planning"',
  "synthetic planning activity in runtime projection",
);
assertDoesNotContain(
  projection,
  "Prepared the workspace run.",
  "legacy synthetic planning summary",
);
assertDoesNotContain(
  runtimeLiveTimeline,
  "I’m setting up the run and deciding where to start.",
  "legacy synthetic planning narration",
);

assertContains(
  runtimeTimelineUi,
  "buildRuntimeLiveTimeline",
  "runtime timeline UI projection remains intact",
);

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
  ["exploring", "reading", "editing", "verifying", "completed"],
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
  ["editing", "verifying", "blocked"],
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
assert.deepEqual(kinds(readOnly), ["exploring", "reading", "completed"]);
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

const justStarted = [
  event({ seq: 1, event_type: "run_started" }),
];
assert.deepEqual(
  buildAgentActivityTimeline(justStarted),
  [],
  "run_started should remain timing metadata, not synthetic activity",
);

console.log("runtime_activity_timeline_proof: ok");
