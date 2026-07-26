import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRuntimeComputerUseViewer } from "../shared/runtimeComputerUseViewerUi.ts";
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
    id: `codex-event:${params.seq}`,
    run_id: "run_codex_1",
    seq: params.seq,
    event_type: params.event_type,
    payload: params.payload ?? null,
    created_at: new Date(Date.UTC(2026, 5, 26, 12, 0, params.seq)).toISOString(),
  };
}

function codexStarted(
  seq: number,
  itemId: string,
  toolName: string,
  args: Record<string, unknown>,
): ProofEvent {
  return event({
    seq,
    event_type: "tool_call_started",
    payload: {
      codex_turn_id: "turn_codex_1",
      item_id: itemId,
      tool: toolName,
      arguments: args,
      tool_call_id: `codex_worker:run_codex_1:${itemId}`,
      provider_call_id: itemId,
      tool_name: toolName,
      args,
      attempt: 1,
      harness: { kind: "codex_worker" },
    },
  });
}

function codexFinished(params: {
  seq: number;
  itemId: string;
  toolName: string;
  args: Record<string, unknown>;
  status?: "ok" | "error";
  success?: boolean;
  details?: Record<string, unknown>;
}): ProofEvent {
  return event({
    seq: params.seq,
    event_type: "tool_call_finished",
    payload: {
      codex_turn_id: "turn_codex_1",
      item_id: params.itemId,
      tool: params.toolName,
      arguments: params.args,
      tool_call_id: `codex_worker:run_codex_1:${params.itemId}`,
      provider_call_id: params.itemId,
      tool_name: params.toolName,
      args: params.args,
      status: params.status ?? "ok",
      success: params.success ?? true,
      harness: { kind: "codex_worker" },
      ...(params.details ? { details: params.details } : {}),
    },
  });
}

function legacyCodexStarted(
  seq: number,
  itemId: string,
  toolName: string,
  args: Record<string, unknown>,
): ProofEvent {
  return event({
    seq,
    event_type: "tool_call_started",
    payload: {
      codex_turn_id: "turn_codex_1",
      item_id: itemId,
      tool: toolName,
      arguments: args,
    },
  });
}

function legacyCodexFinished(
  seq: number,
  itemId: string,
  toolName: string,
  args: Record<string, unknown>,
): ProofEvent {
  return event({
    seq,
    event_type: "tool_call_finished",
    payload: {
      codex_turn_id: "turn_codex_1",
      item_id: itemId,
      tool: toolName,
      arguments: args,
      status: "completed",
      success: true,
    },
  });
}

function reasoningPart(seq: number): ProofEvent {
  return event({
    seq,
    event_type: "reasoning_summary_part_added",
    payload: {
      run_id: "run_codex_1",
      summary_stream_id: "codex-summary:1",
      summary_index: 0,
    },
  });
}

function reasoningDelta(seq: number, delta: string): ProofEvent {
  return event({
    seq,
    event_type: "reasoning_summary_text_delta",
    payload: {
      run_id: "run_codex_1",
      summary_stream_id: "codex-summary:1",
      summary_index: 0,
      delta,
    },
  });
}

function assistantDelta(seq: number, itemId: string, delta: string): ProofEvent {
  return event({
    seq,
    event_type: "assistant_text_delta",
    payload: {
      codex_turn_id: "turn_codex_1",
      item_id: itemId,
      delta,
      role: "assistant",
      harness: { kind: "codex_worker" },
    },
  });
}

const workerServer = readText("services/polynet-codex-worker/src/server.ts");
const runtimeTimeline = readText("shared/runtimeTimelineUi.ts");
const runtimeComputerUseViewer = readText("shared/runtimeComputerUseViewerUi.ts");
const runtimeLiveTimeline = readText("apps/web/src/components/RuntimeLiveTimeline.tsx");
const runtimeComputerUseViewerComponent = readText("apps/web/src/components/RuntimeComputerUseViewer.tsx");
const memberAgentDock = readText("apps/web/src/components/WebMemberAgentDock.tsx");
const packageJson = readText("package.json");

for (const [source, token, label] of [
  [workerServer, "dynamicToolCallsByItemId", "worker dynamic tool call ledger"],
  [workerServer, "dynamicToolDetailsByCallId", "worker dynamic tool detail ledger"],
  [workerServer, "buildCodexNativeToolProjection", "native Codex item projection"],
  [workerServer, 'itemType === "commandExecution"', "native Codex command execution projection"],
  [workerServer, 'itemType === "fileChange"', "native Codex file change projection"],
  [workerServer, 'itemType === "mcpToolCall"', "native Codex MCP tool projection"],
  [workerServer, 'itemType === "webSearch"', "native Codex web search projection"],
  [workerServer, 'itemType === "imageView"', "native Codex image viewer projection"],
  [workerServer, "tool_name: params.record.toolName", "canonical Codex tool_name"],
  [workerServer, "args: params.record.args", "canonical Codex args"],
  [workerServer, "frame_url: frameUrl || null", "Codex screenshot frame evidence"],
  [workerServer, 'this.emitRuntimeEvent("assistant_text_delta"', "Codex assistant deltas as sequenced runtime events"],
  [runtimeTimeline, "readRuntimeToolName", "shared tool-name normalizer"],
  [runtimeTimeline, "readRuntimeToolArgs", "shared tool-args normalizer"],
  [runtimeTimeline, 'kind: "assistant_text"', "assistant text timeline entry kind"],
  [runtimeTimeline, 'event.event_type === "assistant_text_delta"', "assistant text event handling"],
  [runtimeTimeline, "workspace_serve", "Codex workspace serve timeline label"],
  [runtimeComputerUseViewer, "buildRuntimeComputerUseViewer", "dedicated computer use viewer projection"],
  [runtimeComputerUseViewerComponent, "runtimeComputerUseViewerUi", "computer use viewer imports dedicated projection"],
  [runtimeLiveTimeline, "showThinkingFooter?: boolean", "timeline footer suppression prop"],
  [memberAgentDock, "hasSequencedAssistantText", "mounted member-agent streaming text duplicate guard"],
  [
    memberAgentDock,
    "showThinkingFooter={!shouldRenderStreamedText}",
    "mounted member-agent coordinates the thinking footer with streamed text",
  ],
  [packageJson, "check:runtime-live-timeline-codex-proof", "Codex proof npm script"],
] as const) {
  assertContains(source, token, label);
}
assert.doesNotMatch(
  runtimeLiveTimeline,
  /narrowing down where the answer should come from/,
  "Codex live timeline must not render synthetic local narration",
);
assert.doesNotMatch(
  runtimeLiveTimeline,
  /buildAgentActivityTimeline/,
  "Codex live timeline should not derive fake reasoning from local activity buckets",
);

const mountedTimelineIndex = memberAgentDock.indexOf("<RuntimeLiveTimeline");
const mountedStreamedTextIndex = memberAgentDock.indexOf("{shouldRenderStreamedText ? (");
const mountedStreamedCaretIndex = memberAgentDock.indexOf('className="member-agent-dock-caret"');
assert.ok(mountedTimelineIndex >= 0, "mounted member-agent must render the live timeline");
assert.ok(mountedStreamedTextIndex >= 0, "mounted member-agent must keep the streamed-text fallback");
assert.ok(mountedStreamedCaretIndex >= 0, "mounted member-agent must identify active fallback streaming");
assert.ok(
  mountedTimelineIndex < mountedStreamedTextIndex &&
    mountedStreamedTextIndex < mountedStreamedCaretIndex,
  "mounted member-agent must render the runtime timeline before the fallback streamed answer",
);

const codexEvents: ProofEvent[] = [
  event({ seq: 1, event_type: "run_started", payload: { status: "running" } }),
  assistantDelta(2, "item_intro", "I’ll inspect the files."),
  codexStarted(3, "item_serve", "workspace_serve", {
    command: "python3 -m http.server 8000 --bind 0.0.0.0",
    port: 8000,
  }),
  codexFinished({
    seq: 4,
    itemId: "item_serve",
    toolName: "workspace_serve",
    args: {
      command: "python3 -m http.server 8000 --bind 0.0.0.0",
      port: 8000,
    },
  }),
  assistantDelta(5, "item_after_serve", "\n\nPreview is running."),
  event({
    seq: 6,
    event_type: "workspace_preview_ready",
    payload: { provider: "daytona", port: 8000 },
  }),
  legacyCodexStarted(7, "item_open", "computer_open_url", {
    url: "http://localhost:8000/",
  }),
  legacyCodexFinished(8, "item_open", "computer_open_url", {
    url: "http://localhost:8000/",
  }),
  codexStarted(9, "item_screenshot", "computer_screenshot", {}),
  codexFinished({
    seq: 10,
    itemId: "item_screenshot",
    toolName: "computer_screenshot",
    args: {},
    details: {
      provider_id: "daytona",
      computer_use: {
        provider: "daytona",
        frame_url: "https://example.com/codex-frame.jpeg",
        summary: "Captured Daytona computer screenshot.",
        screenshot_method: "takeCompressed",
        screenshot_width: 960,
        screenshot_height: 540,
      },
    },
  }),
  assistantDelta(11, "item_verified", "\n\nVerified."),
  event({ seq: 12, event_type: "run_finished", payload: { status: "ok" } }),
];

const entries = buildRuntimeLiveTimeline(codexEvents);
assert.deepEqual(
  entries.map((entry) => entry.kind),
  ["assistant_text", "tool_group", "assistant_text", "tool_group", "assistant_text"],
);
assert.equal(
  entries[0]?.kind === "assistant_text" ? entries[0].text : "",
  "I’ll inspect the files.",
);
assert.equal(
  entries[2]?.kind === "assistant_text" ? entries[2].text : "",
  "Preview is running.",
);
assert.equal(
  entries[4]?.kind === "assistant_text" ? entries[4].text : "",
  "Verified.",
);

const toolGroups = entries.flatMap((entry) =>
  entry.kind === "tool_group" ? [entry.group] : [],
);
assert.deepEqual(
  toolGroups.map((group) => group.category),
  ["preview", "computer"],
);
assert.match(toolGroups[0]?.title ?? "", /Started 1 app preview/);
assert.equal(toolGroups[0]?.calls[0]?.title, "Start app preview:8000");
assert.equal(toolGroups[0]?.calls[0]?.toolName, "workspace_serve");
assert.deepEqual(
  toolGroups[1]?.calls.map((call) => call.toolName),
  ["computer_open_url", "computer_screenshot"],
);

const computerViewer = buildRuntimeComputerUseViewer(codexEvents);
assert.equal(computerViewer?.latestFrameUrl, "https://example.com/codex-frame.jpeg");
assert.equal(computerViewer?.latestActionTitle, "Capture screenshot");
assert.equal(computerViewer?.recentSteps[0]?.summary, "Captured Daytona computer screenshot.");
assert.equal(computerViewer?.status, "active");

const reasoningEntries = buildRuntimeLiveTimeline([
  event({ seq: 1, event_type: "run_started", payload: { status: "running" } }),
  reasoningPart(2),
  reasoningDelta(3, "Need to serve the app and inspect the Daytona desktop."),
  event({ seq: 4, event_type: "run_finished", payload: { status: "ok" } }),
]);
const reasoning = reasoningEntries.find((entry) => entry.kind === "reasoning");
assert.equal(reasoning?.text, "Need to serve the app and inspect the Daytona desktop.");

const nativeCodexEvents: ProofEvent[] = [
  assistantDelta(1, "item_native_intro", "I’ll inspect and patch it."),
  codexStarted(2, "item_cmd", "bash", {
    codex_item_type: "commandExecution",
    command: "rg -n \"runtime\" shared",
    cwd: "/workspace",
  }),
  codexFinished({
    seq: 3,
    itemId: "item_cmd",
    toolName: "bash",
    args: {
      codex_item_type: "commandExecution",
      command: "rg -n \"runtime\" shared",
      cwd: "/workspace",
    },
  }),
  assistantDelta(4, "item_native_after_cmd", "\n\nI found the path."),
  codexStarted(5, "item_file", "codex_file_change", {
    codex_item_type: "fileChange",
    path: "shared/runtimeTimelineUi.ts",
    kind: "modify",
    changes_count: 1,
  }),
  codexFinished({
    seq: 6,
    itemId: "item_file",
    toolName: "codex_file_change",
    args: {
      codex_item_type: "fileChange",
      path: "shared/runtimeTimelineUi.ts",
      kind: "modify",
      changes_count: 1,
    },
  }),
  codexStarted(7, "item_mcp", "codex_mcp_tool_call", {
    codex_item_type: "mcpToolCall",
    server: "openaiDeveloperDocs",
    tool: "fetch_openai_doc",
  }),
  codexFinished({
    seq: 8,
    itemId: "item_mcp",
    toolName: "codex_mcp_tool_call",
    args: {
      codex_item_type: "mcpToolCall",
      server: "openaiDeveloperDocs",
      tool: "fetch_openai_doc",
    },
  }),
  codexStarted(9, "item_web", "web_research", {
    codex_item_type: "webSearch",
    action: "search",
    query: "OpenAI Codex app server items",
  }),
  codexFinished({
    seq: 10,
    itemId: "item_web",
    toolName: "web_research",
    args: {
      codex_item_type: "webSearch",
      action: "search",
      query: "OpenAI Codex app server items",
    },
  }),
  codexStarted(11, "item_image", "codex_image_view", {
    codex_item_type: "imageView",
    path: "/workspace/screenshot.png",
    name: "screenshot.png",
  }),
  codexFinished({
    seq: 12,
    itemId: "item_image",
    toolName: "codex_image_view",
    args: {
      codex_item_type: "imageView",
      path: "/workspace/screenshot.png",
      name: "screenshot.png",
    },
  }),
  assistantDelta(13, "item_native_done", "\n\nVerified."),
];

const nativeEntries = buildRuntimeLiveTimeline(nativeCodexEvents);
assert.deepEqual(
  nativeEntries.map((entry) => entry.kind),
  [
    "assistant_text",
    "tool_group",
    "assistant_text",
    "tool_group",
    "tool_group",
    "tool_group",
    "tool_group",
    "assistant_text",
  ],
);
const nativeToolGroups = nativeEntries.flatMap((entry) =>
  entry.kind === "tool_group" ? [entry.group] : [],
);
assert.deepEqual(
  nativeToolGroups.map((group) => group.category),
  ["shell", "writes", "other", "web", "exploration"],
);
assert.match(nativeToolGroups[0]?.title ?? "", /Ran 1 command/);
assert.equal(nativeToolGroups[0]?.calls[0]?.title, "Run rg -n \"runtime\" shared");
assert.match(nativeToolGroups[1]?.title ?? "", /Changed 1 change/);
assert.equal(nativeToolGroups[1]?.calls[0]?.title, "Change runtimeTimelineUi.ts");
const failedWriteEntries = buildRuntimeLiveTimeline([
  codexStarted(1, "item_failed_write", "write", {
    path: "index.html",
    content: "<main>Weather</main>",
  }),
  codexFinished({
    seq: 2,
    itemId: "item_failed_write",
    toolName: "write",
    args: {
      path: "index.html",
      content: "<main>Weather</main>",
    },
    status: "error",
    success: false,
    details: { code: "workspace_computer_disabled" },
  }),
]);
const failedWriteGroup = failedWriteEntries.find(
  (entry) => entry.kind === "tool_group",
);
assert.ok(failedWriteGroup && failedWriteGroup.kind === "tool_group");
assert.match(failedWriteGroup.group.title, /Failed to change 1 change/);
assert.equal(failedWriteGroup.group.status, "error");
assert.equal(nativeToolGroups[2]?.calls[0]?.title, "MCP tool: openaiDeveloperDocs/fetch_openai_doc");
assert.match(nativeToolGroups[3]?.title ?? "", /Researched 1 web step/);
assert.equal(nativeToolGroups[3]?.calls[0]?.title, "Web search: OpenAI Codex app server items");
assert.equal(nativeToolGroups[4]?.calls[0]?.title, "View image: screenshot.png");

console.log("runtime_live_timeline_codex_contract_proof: ok");
