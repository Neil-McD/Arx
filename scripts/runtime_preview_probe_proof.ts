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

console.log("runtime preview probe proof passed");
