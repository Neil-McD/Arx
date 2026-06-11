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
const workspaceAppPreviewSource = await readFile(
  new URL("../apps/web/src/components/WebWorkspaceAppPreview.tsx", import.meta.url),
  "utf8",
);
const workspaceHostSource = await readFile(
  new URL("../apps/web/src/components/WebWorkspaceHost.tsx", import.meta.url),
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
  "preview proxy must not forward content-encoding after buffering decoded fetch bodies",
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
  workspaceAppPreviewSource,
  /function isLivePreviewTerminal[\s\S]*isRetryablePreviewStatus\(terminal\.status\)/,
  "inline app previews should only render live starting or running terminals",
);
assert.match(
  workspaceHostSource,
  /isTerminalSnapshotStatusActive\(terminal\.status\) && isPreviewCapableTerminal\(terminal\)/,
  "preview candidates must be active preview-capable terminals only",
);
assert.match(
  workspaceHostSource,
  /if \(terminalRunning !== latestRunning\) \{[\s\S]*if \(terminalRunning\) latest = terminal;/,
  "the single preview surface must prefer a running terminal over a newer still-starting one",
);
assert.match(
  workspaceHostSource,
  /return latest \? \[latest\] : \[\];/,
  "the preview surface shows exactly one card: the latest active serve",
);
assert.match(
  workspaceTerminalProcessCoreSource,
  /async function findActiveWorkspaceTerminalOnPort[\s\S]*rowPreviewPort === params\.previewPort/,
  "terminal identity is the port: serve requests resolve against the active row on that port",
);
assert.match(
  workspaceTerminalProcessCoreSource,
  /peerAlive && sameCommand[\s\S]*reused_existing: true[\s\S]*if \(peerAlive\) \{[\s\S]*stopWorkspaceTerminalProcess/,
  "same-port serves reuse a matching live server and supersede a different one",
);
assert.match(
  workspaceTerminalProcessCoreSource,
  /async function probeWorkspaceTerminalPort[\s\S]*\/dev\/tcp\/127\.0\.0\.1\//,
  "serve readiness is decided by our own in-sandbox tcp probe, not the provider SDK",
);
assert.match(
  workspaceTerminalProcessCoreSource,
  /status: requestedPort !== null \? "starting" : "running"/,
  "every launch creates a terminal row before the readiness probe runs",
);
assert.doesNotMatch(
  workspaceTerminalProcessCoreSource,
  /waitForPorts/,
  "the serve path must not delegate readiness to the provider waitForPorts",
);
assert.doesNotMatch(
  runtimeExecutionSessionSource,
  /function normalizeRuntimeTerminalIdentityCommand/,
  "runtime loop should not duplicate terminal reuse identity logic",
);

console.log("runtime preview probe proof passed");
