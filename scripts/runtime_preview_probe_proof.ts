import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { classifyRuntimePreviewProbe } from "../shared/runtimePreviewProbe.ts";

const loaded = classifyRuntimePreviewProbe({
  ok: true,
  status: 200,
  contentType: "text/html; charset=utf-8",
  bodySnippet: '<html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
});

assert.equal(loaded.transportStatus, "loaded");
assert.equal(loaded.previewStatus, "running");
assert.equal(loaded.renderStatus, "unknown");
assert.match(loaded.summary, /Preview transport loaded/);
assert.match(loaded.summary, /HTML\/app shell detected/);

const unreachable = classifyRuntimePreviewProbe({
  ok: false,
  status: 502,
  contentType: "text/plain",
  bodySnippet: "bad gateway",
});

assert.equal(unreachable.transportStatus, "failed");
assert.equal(unreachable.previewStatus, "unreachable");
assert.equal(unreachable.renderStatus, "transport_error");
assert.match(unreachable.summary, /Preview transport failed/);

const timeout = classifyRuntimePreviewProbe({
  ok: false,
  status: null,
  error: "This operation was aborted",
  timedOut: true,
});

assert.equal(timeout.transportStatus, "failed");
assert.match(timeout.summary, /timed out/);

const workspaceTerminalsSource = await readFile(
  new URL("../convex/workspaceTerminals.ts", import.meta.url),
  "utf8",
);
const workspaceTerminalProcessCoreSource = await readFile(
  new URL("../convex/workspaceTerminalProcessCore.ts", import.meta.url),
  "utf8",
);
const runtimeExecutionSessionSource = await readFile(
  new URL("../convex/runtimeExecutionSession.ts", import.meta.url),
  "utf8",
);
const previewProxySource = await readFile(
  new URL("../apps/preview-proxy/server.js", import.meta.url),
  "utf8",
);
const backgroundTerminalRailSource = await readFile(
  new URL("../apps/web/src/components/WebBackgroundTerminalRail.tsx", import.meta.url),
  "utf8",
);
assert.match(
  workspaceTerminalsSource,
  /async function probeWorkspaceTerminalPreviewUrl/,
);
assert.match(
  workspaceTerminalsSource,
  /classifyRuntimePreviewProbe/,
);
assert.match(
  workspaceTerminalsSource,
  /preview_probe_summary: probe\.previewProbeSummary/,
);
assert.match(
  workspaceTerminalsSource,
  /preview_transport_status: probe\.previewTransportStatus/,
);
assert.match(
  previewProxySource,
  /lower === "content-encoding"[\s\S]*lower === "content-length"[\s\S]*lower === "transfer-encoding"/,
  "preview gateway must not forward content-encoding after buffering decoded fetch bodies",
);

const stoppedProviderStatusIndex = workspaceTerminalProcessCoreSource.indexOf(
  'normalized.includes("stop") || normalized.includes("kill")',
);
const exitCodeStatusIndex = workspaceTerminalProcessCoreSource.indexOf(
  "if (params.exitCode !== null)",
);
assert.ok(stoppedProviderStatusIndex >= 0, "terminal status mapper should handle stopped/killed provider states");
assert.ok(exitCodeStatusIndex >= 0, "terminal status mapper should handle exit codes");
assert.ok(
  stoppedProviderStatusIndex < exitCodeStatusIndex,
  "stopped/killed provider states should not be rendered as failed only because Blaxel reports exitCode -1",
);

assert.match(
  workspaceTerminalsSource,
  /function isRecentTerminalIssue[\s\S]*row\.status === "stopped"\) return false/,
  "backend terminal snapshot should not classify stopped terminals as recent issues",
);
assert.match(
  workspaceTerminalsSource,
  /function isInternalDiagnosticTerminal[\s\S]*\.polynet-smoke/,
  "backend terminal snapshot should hide internal smoke terminals from user-facing recent issues",
);
assert.doesNotMatch(
  workspaceTerminalsSource,
  /row\.status === "failed"\s*\|\|\s*row\.status === "exited"\s*\|\|\s*row\.status === "stopped"/,
  "backend recent terminal issue filter must not count every stopped terminal as an issue",
);
assert.match(
  backgroundTerminalRailSource,
  /function isTerminalIssue[\s\S]*terminal\.status === "stopped"\) return false/,
  "terminal rail should defensively ignore stopped terminals",
);
assert.match(
  backgroundTerminalRailSource,
  /visibleTerminals = props\.terminals\.filter[\s\S]*visibleTerminals\.length === 0\) return null/,
  "terminal rail should render only active terminals plus actionable issues",
);
assert.match(
  workspaceTerminalProcessCoreSource,
  /async function findReusableWorkspaceTerminalProcess[\s\S]*reused_existing: true/,
  "terminal process core should reuse identical active workspace terminals",
);
assert.match(
  workspaceTerminalProcessCoreSource,
  /rowPreviewPort !== params\.terminal\.previewPort[\s\S]*rowPreviewPath !== requestedPreviewPath/,
  "terminal reuse identity should include preview port and path",
);
assert.match(
  workspaceTerminalProcessCoreSource,
  /const reusable = await findReusableWorkspaceTerminalProcess[\s\S]*if \(reusable\) return reusable;/,
  "terminal start should check reuse before creating a provider process",
);
assert.doesNotMatch(
  runtimeExecutionSessionSource,
  /function normalizeRuntimeTerminalIdentityCommand/,
  "runtime loop should not duplicate terminal reuse identity logic",
);

console.log("runtime preview probe proof passed");
