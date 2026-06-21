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
  daytonaRuntimeAppPreview,
  /anchors\.map\(\(anchor\) =>[\s\S]*key=\{anchor\.id\}/,
  "Daytona preview rendering must key cards by the deduped anchor id.",
);

type Event = {
  event_type: string;
  run_id: string;
  created_at: string;
  payload: {
    provider: string;
    port: number;
    terminal_session_id?: string;
  };
};

function project(events: Event[]): Array<{ id: string; runId: string; port: number; terminalSessionId: string | null; updatedAt: number }> {
  const next = new Map<string, { id: string; runId: string; port: number; terminalSessionId: string | null; updatedAt: number }>();
  for (const event of events) {
    if (event.event_type !== "workspace_preview_ready") continue;
    if (event.payload.provider !== "daytona") continue;
    const runId = event.run_id;
    const port = Math.floor(Number(event.payload.port));
    const id = `${runId}:${port}`;
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

console.log("daytona_preview_dedupe_contract_proof: ok");
