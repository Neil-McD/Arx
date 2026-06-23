import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

const workspaceHost = read("apps/web/src/components/WebWorkspaceHost.tsx");
const daytonaRuntimeAppPreview = read("apps/web/src/components/DaytonaRuntimeAppPreview.tsx");

assert.match(
  workspaceHost,
  /function buildDaytonaPreviewAnchorDedupeKey\(runId: string, port: number\): string \{[\s\S]*return `\$\{runId\}:\$\{port\}`;/,
  "Daytona preview card identity must collapse to runId + port.",
);

assert.match(
  workspaceHost,
  /id: buildDaytonaPreviewAnchorDedupeKey\(runId, port\)/,
  "Daytona preview anchors must use the stable runId + port dedupe key.",
);

assert.doesNotMatch(
  workspaceHost,
  /id: `\$\{runId\}:\$\{port\}:\$\{terminalSessionId/,
  "Daytona preview anchors must not include terminalSessionId in the visible card identity.",
);

assert.match(
  workspaceHost,
  /const current = next\.get\(anchor\.id\);[\s\S]*if \(!current \|\| anchor\.updatedAt >= current\.updatedAt\) \{[\s\S]*next\.set\(anchor\.id, anchor\);/,
  "Daytona preview projection must keep the newest event for each dedupe key.",
);

assert.match(
  workspaceHost,
  /parseDaytonaPreviewStoppedAnchorIds[\s\S]*event_type !== "workspace_preview_stopped"[\s\S]*target_run_id[\s\S]*stopped\.add\(stoppedAnchorId\)[\s\S]*next\.delete\(stoppedAnchorId\)[\s\S]*if \(stopped\.has\(anchor\.id\)\) continue;/,
  "Daytona preview projection must tombstone stopped anchors by target run id and port.",
);

assert.match(
  daytonaRuntimeAppPreview,
  /visibleAnchors\.map\(\(anchor\) =>[\s\S]*key=\{anchor\.id\}/,
  "Daytona preview rendering must key cards by the deduped anchor id.",
);

assert.match(
  daytonaRuntimeAppPreview,
  /function shouldHideUnavailableDaytonaPreview\(code: string \| null\): boolean \{[\s\S]*runtime_run_not_found[\s\S]*daytona_runtime_target_not_found[\s\S]*daytona_sandbox_not_available[\s\S]*daytona_preview_not_authorized/,
  "Daytona preview cards must hide when the backing sandbox/run is no longer live.",
);

assert.match(
  daytonaRuntimeAppPreview,
  /if \(!result\.ok\) \{[\s\S]*shouldHideUnavailableDaytonaPreview\(result\.code\)[\s\S]*props\.onUnavailable\(props\.anchor\);[\s\S]*return;/,
  "Daytona preview resolver failures for non-live sandboxes must tombstone the visible card.",
);

assert.match(
  daytonaRuntimeAppPreview,
  /const visibleAnchors = useMemo\([\s\S]*hiddenAnchorKeys\.has\(buildDaytonaPreviewVisibilityKey\(anchor\)\)[\s\S]*if \(visibleAnchors\.length === 0\) return null;[\s\S]*visibleAnchors\.map/,
  "Daytona preview stack must disappear when every anchor has been tombstoned as unavailable.",
);

type Event = {
  event_type: string;
  run_id: string;
  created_at: string;
  payload: {
    provider: string;
    port?: number;
    preview_ports?: number[];
    target_run_id?: string;
    terminal_session_id?: string;
  };
};

function project(events: Event[]): Array<{ id: string; runId: string; port: number; terminalSessionId: string | null; updatedAt: number }> {
  const next = new Map<string, { id: string; runId: string; port: number; terminalSessionId: string | null; updatedAt: number }>();
  const stopped = new Set<string>();
  for (const event of events) {
    if (event.event_type === "workspace_preview_stopped" && event.payload.provider === "daytona") {
      const targetRunId = event.payload.target_run_id || event.run_id;
      for (const port of event.payload.preview_ports ?? []) {
        const id = `${targetRunId}:${Math.floor(Number(port))}`;
        stopped.add(id);
        next.delete(id);
      }
      continue;
    }
    if (event.event_type !== "workspace_preview_ready") continue;
    if (event.payload.provider !== "daytona") continue;
    const runId = event.run_id;
    const port = Math.floor(Number(event.payload.port));
    const id = `${runId}:${port}`;
    if (stopped.has(id)) continue;
    const anchor = {
      id,
      runId,
      port,
      terminalSessionId: event.payload.terminal_session_id ?? null,
      updatedAt: Date.parse(event.created_at) || 0,
    };
    const current = next.get(anchor.id);
    if (!current || anchor.updatedAt >= current.updatedAt) {
      next.set(anchor.id, anchor);
    }
  }
  return Array.from(next.values()).sort((a, b) => a.port - b.port || a.updatedAt - b.updatedAt);
}

const projected = project([
  {
    event_type: "workspace_preview_ready",
    run_id: "run_a",
    created_at: "2026-06-21T10:00:00.000Z",
    payload: { provider: "daytona", port: 3000, terminal_session_id: "terminal_old" },
  },
  {
    event_type: "workspace_preview_ready",
    run_id: "run_a",
    created_at: "2026-06-21T10:01:00.000Z",
    payload: { provider: "daytona", port: 3000, terminal_session_id: "terminal_new" },
  },
  {
    event_type: "workspace_preview_ready",
    run_id: "run_a",
    created_at: "2026-06-21T10:02:00.000Z",
    payload: { provider: "daytona", port: 3001, terminal_session_id: "terminal_other_port" },
  },
]);

assert.equal(projected.length, 2, "same Daytona run + port should render one preview card.");
assert.deepEqual(
  projected.map((anchor) => anchor.id),
  ["run_a:3000", "run_a:3001"],
  "different ports should remain separate preview cards.",
);
assert.equal(
  projected[0]?.terminalSessionId,
  "terminal_new",
  "same run + port should keep the newest preview event payload.",
);

const projectedAfterStop = project([
  {
    event_type: "workspace_preview_ready",
    run_id: "run_a",
    created_at: "2026-06-21T10:00:00.000Z",
    payload: { provider: "daytona", port: 3000, terminal_session_id: "terminal_old" },
  },
  {
    event_type: "workspace_preview_stopped",
    run_id: "run_b",
    created_at: "2026-06-21T10:01:00.000Z",
    payload: { provider: "daytona", target_run_id: "run_a", preview_ports: [3000] },
  },
  {
    event_type: "workspace_preview_ready",
    run_id: "run_a",
    created_at: "2026-06-21T10:00:00.000Z",
    payload: { provider: "daytona", port: 3000, terminal_session_id: "terminal_old" },
  },
]);

assert.equal(
  projectedAfterStop.length,
  0,
  "workspace_preview_stopped should remove stale Daytona preview cards even if old ready events are replayed later.",
);

console.log("daytona_preview_dedupe_contract_proof: ok");
