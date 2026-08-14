import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRuntimeLiveTimeline } from "../shared/runtimeTimelineUi.ts";

type ProofEvent = {
  id: string;
  run_id: string;
  seq: number;
  event_type: string;
  payload: unknown;
  created_at: string;
};

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function assertContains(haystack: string, needle: string, label: string): void {
  assert.ok(haystack.includes(needle), `expected ${label}`);
}

function event(params: {
  seq: number;
  event_type: string;
  payload?: unknown;
}): ProofEvent {
  return {
    id: `event:${params.seq}`,
    run_id: "run_polynet_1",
    seq: params.seq,
    event_type: params.event_type,
    payload: params.payload ?? null,
    created_at: new Date(Date.UTC(2026, 5, 25, 12, 0, params.seq)).toISOString(),
  };
}

function started(
  seq: number,
  toolName: string,
  args: Record<string, unknown>,
): ProofEvent {
  return event({
    seq,
    event_type: "tool_call_started",
    payload: {
      tool_call_id: `call:${seq}`,
      provider_call_id: `provider:${seq}`,
      tool_name: toolName,
      args,
      attempt: 1,
      harness: { kind: "chat_tools" },
    },
  });
}

function finished(params: {
  seq: number;
  startedSeq: number;
  toolName: string;
  args: Record<string, unknown>;
  status?: "ok" | "error";
  extra?: Record<string, unknown>;
}): ProofEvent {
  return event({
    seq: params.seq,
    event_type: "tool_call_finished",
    payload: {
      tool_call_id: `call:${params.startedSeq}`,
      provider_call_id: `provider:${params.startedSeq}`,
      tool_name: params.toolName,
      args: params.args,
      status: params.status ?? "ok",
      success: (params.status ?? "ok") === "ok",
      harness: { kind: "chat_tools" },
      ...(params.extra ?? {}),
    },
  });
}

function reasoningPart(seq: number): ProofEvent {
  return event({
    seq,
    event_type: "reasoning_summary_part_added",
    payload: {
      run_id: "run_polynet_1",
      summary_stream_id: "summary:1",
      summary_index: 0,
    },
  });
}

function reasoningDelta(seq: number, delta: string): ProofEvent {
  return event({
    seq,
    event_type: "reasoning_summary_text_delta",
    payload: {
      run_id: "run_polynet_1",
      summary_stream_id: "summary:1",
      summary_index: 0,
      delta,
    },
  });
}

const timelineComponent = readText("apps/web/src/components/RuntimeLiveTimeline.tsx");
const timelineStyles = readText(
  "apps/web/src/styles/settings-runtime-and-theme-overrides.css",
);

for (const [source, token, label] of [
  [timelineComponent, "buildRuntimeLiveTimeline", "shared runtime live timeline builder"],
  [timelineComponent, "RuntimeTraceToolGroup", "trace tool group renderer"],
  [timelineComponent, "runtime-trace-flow", "trace flow markup"],
  [timelineStyles, ".runtime-trace-tool", "trace tool CSS"],
  [timelineStyles, ".runtime-trace-reasoning", "trace reasoning CSS"],
] as const) {
  assertContains(source, token, label);
}

const polynetEvents: ProofEvent[] = [
  event({ seq: 1, event_type: "run_started", payload: { status: "running" } }),
  reasoningPart(2),
  reasoningDelta(3, "Need to inspect \\*\\*PolyNet\\*\\* runtime rows."),
  started(4, "list_dir", { path: "." }),
  finished({
    seq: 5,
    startedSeq: 4,
    toolName: "list_dir",
    args: { path: "." },
  }),
  started(6, "read", { path: "index.html" }),
  finished({
    seq: 7,
    startedSeq: 6,
    toolName: "read",
    args: { path: "index.html" },
  }),
  started(8, "community_resources_search", { query: "Daytona preview" }),
  finished({
    seq: 9,
    startedSeq: 8,
    toolName: "community_resources_search",
    args: { query: "Daytona preview" },
  }),
  started(10, "computer_screenshot", {}),
  finished({
    seq: 11,
    startedSeq: 10,
    toolName: "computer_screenshot",
    args: {},
    extra: {
      details: {
        computer_use: {
          frame_url: "https://example.com/frame.png",
          summary: "Captured Daytona desktop screenshot.",
        },
      },
    },
  }),
  event({ seq: 12, event_type: "run_finished", payload: { status: "ok" } }),
];

const entries = buildRuntimeLiveTimeline(polynetEvents);
const reasoning = entries.find((entry) => entry.kind === "reasoning");
assert.equal(reasoning?.text, "Need to inspect **PolyNet** runtime rows.");

const toolGroups = entries.flatMap((entry) =>
  entry.kind === "tool_group" ? [entry.group] : [],
);
assert.deepEqual(
  toolGroups.map((group) => group.category),
  ["exploration", "community", "computer"],
);
assert.match(toolGroups[0]?.title ?? "", /Explored/);
assert.match(toolGroups[0]?.title ?? "", /1 file/);
assert.match(toolGroups[0]?.title ?? "", /1 directory/);
assert.equal(toolGroups[1]?.calls[0]?.toolName, "community_resources_search");
assert.equal(toolGroups[2]?.calls[0]?.toolName, "computer_screenshot");

console.log("runtime_live_timeline_polynet_contract_proof: ok");
