import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  CODEX_HARNESS_PROBE_MODE_ENV,
  CODEX_WORKSPACE_HANDOFF_ENV,
  classifyCodexHarnessReadiness,
  isCodexHarnessReadinessReady,
  isCodexWorkspaceHandoffEnabled,
  resolveCodexHarnessProbeMode,
  resolveCodexWorkspaceHandoffEligibility,
} from "../shared/codexWorkspaceHandoffPolicy.ts";
import {
  CODEX_HARNESS_PROBE_EVENT_MARKER,
  CODEX_HARNESS_PROBE_RESULT_MARKER,
  buildCodexHarnessProbeScript,
} from "../shared/codexHarnessProbeScript.ts";
import {
  createCodexHarnessProbeStreamEventIncrementalParser,
  findCodexHarnessLogOverlapSuffixLength,
  readCodexHarnessNextLogChunk,
  readCodexHarnessProbeStreamEvents,
} from "../shared/codexHarnessStreamEvents.ts";

const rootDir = process.cwd();

function readText(filePath: string): string {
  return readFileSync(path.join(rootDir, filePath), "utf8");
}

assert.equal(
  resolveCodexHarnessProbeMode({ [CODEX_HARNESS_PROBE_MODE_ENV]: "canary" }),
  "canary",
);
assert.equal(
  resolveCodexHarnessProbeMode({ [CODEX_HARNESS_PROBE_MODE_ENV]: "execution_canary" }),
  "execution_canary",
);
assert.equal(
  resolveCodexHarnessProbeMode({ [CODEX_HARNESS_PROBE_MODE_ENV]: "shadow_turn" }),
  "shadow_turn",
);
assert.equal(
  resolveCodexHarnessProbeMode({ [CODEX_HARNESS_PROBE_MODE_ENV]: "tool_call_canary" }),
  "tool_call_canary",
);
assert.equal(
  resolveCodexHarnessProbeMode({ [CODEX_HARNESS_PROBE_MODE_ENV]: "true" }),
  "off",
);

assert.equal(
  isCodexWorkspaceHandoffEnabled({ [CODEX_WORKSPACE_HANDOFF_ENV]: "true" }),
  true,
);
assert.equal(
  resolveCodexWorkspaceHandoffEligibility({
    handoffEnabled: true,
    inferenceSource: "chatgpt",
    projectId: "project-1",
  }).ok,
  true,
);
assert.equal(
  resolveCodexWorkspaceHandoffEligibility({
    handoffEnabled: true,
    inferenceSource: "platform",
    projectId: "project-1",
  }).ok,
  false,
);

assert.equal(
  classifyCodexHarnessReadiness({
    probeOk: true,
    codexPathPresent: true,
    appServerStarted: true,
    authApplied: true,
    accountResolved: true,
    rateLimitsPresent: true,
  }),
  "ready",
);
assert.equal(
  isCodexHarnessReadinessReady("ready"),
  true,
);
assert.equal(
  classifyCodexHarnessReadiness({ code: "provider_connection_required" }),
  "auth_failed",
);
assert.equal(
  classifyCodexHarnessReadiness({ code: "codex_binary_missing" }),
  "codex_missing",
);
assert.equal(
  classifyCodexHarnessReadiness({ code: "codex_app_server_spawn_failed" }),
  "app_server_failed",
);

const bridge = readText("convex/codexHarnessBridge.ts");
const httpDaytona = readText("convex/httpDaytona.ts");
const handoffPolicy = readText("shared/codexWorkspaceHandoffPolicy.ts");
const probeScript = buildCodexHarnessProbeScript();

assert.match(
  bridge,
  /from "\.\.\/shared\/codexWorkspaceHandoffPolicy\.ts"/,
  "Codex bridge should depend on handoff policy, not route selection",
);
assert.doesNotMatch(
  bridge,
  /resolveCodexHarnessRoute|resolveCodexHarnessExecutorDecision|isCodexHarnessExecutorEnabled|isCodexHarnessExperimentEnabled/,
  "Codex bridge should not use the deleted route/executor decision layer",
);
assert.match(
  bridge,
  /POLYNET_CODEX_RESUME_THREAD_ID/,
  "Codex bridge should still pass the bound Codex thread id into the Daytona sidecar",
);
assert.match(
  bridge,
  /upsertCodexHarnessThreadBindingAfterRunInternal/,
  "Codex bridge should still persist Codex thread bindings after successful handoff runs",
);
assert.match(
  httpDaytona,
  /toolName === "codex_workspace"[\s\S]*buildCodexAppServerRuntimeAgentHarness/,
  "runtime loop should invoke Codex only through codex_workspace",
);
assert.doesNotMatch(
  httpDaytona,
  /runtimeHarnessSelection|runtime_agent_harness_selected|executeCodexHarnessProbeIfSelected/,
  "runtime loop should not preselect Codex for the whole turn",
);
assert.doesNotMatch(
  handoffPolicy,
  /CodexHarnessRoute|CodexHarnessExecutorDecision|selectedHarness/,
  "handoff policy should not contain router data structures",
);

assert.match(probeScript, new RegExp(CODEX_HARNESS_PROBE_RESULT_MARKER));
assert.match(probeScript, new RegExp(CODEX_HARNESS_PROBE_EVENT_MARKER));

const lineA = `${CODEX_HARNESS_PROBE_EVENT_MARKER}${JSON.stringify({ sequence: 1, type: "assistant_delta" })}`;
const lineB = `${CODEX_HARNESS_PROBE_RESULT_MARKER}${JSON.stringify({ ok: true })}`;
assert.equal(readCodexHarnessProbeStreamEvents(`${lineA}\n${lineB}`).length, 1);

const parser = createCodexHarnessProbeStreamEventIncrementalParser();
assert.equal(parser.push(`${lineA.slice(0, 20)}`).length, 0);
assert.equal(parser.push(`${lineA.slice(20)}\n`).length, 1);
const overlap = "x".repeat(64);
assert.equal(findCodexHarnessLogOverlapSuffixLength(`before${overlap}`, `${overlap}after`), 64);
const nextChunk = readCodexHarnessNextLogChunk({
  previousLogText: "abc",
  nextLogText: "abcde",
});
assert.equal(nextChunk.chunk, "de");
assert.equal(nextChunk.strategy, "cumulative");

console.log("PASS: Codex bridge uses workspace handoff policy and keeps thread/session evidence");
