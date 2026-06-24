import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readText(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function assertContains(haystack: string, needle: string, label: string): void {
  assert.ok(haystack.includes(needle), `expected ${label}`);
}

function assertNotContains(haystack: string, needle: string, label: string): void {
  assert.ok(!haystack.includes(needle), `did not expect ${label}`);
}

function assertOrdered(
  haystack: string,
  first: string,
  second: string,
  label: string,
): void {
  const firstIndex = haystack.indexOf(first);
  const secondIndex = haystack.indexOf(second);
  assert.notEqual(firstIndex, -1, `expected ${label} first marker`);
  assert.notEqual(secondIndex, -1, `expected ${label} second marker`);
  assert.ok(firstIndex < secondIndex, `expected ${label}`);
}

const packageJson = readText("package.json");
const bridge = readText("convex/polynetCodexWorkerBridge.ts");
const handler = readText("convex/runtimeTurnHandlers.ts");
const worker = readText("services/polynet-codex-worker/src/server.ts");
const token = readText("convex/polynetCodexWorkerRunToken.ts");

assertContains(
  packageJson,
  '"check:codex-worker-transport-contract-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts/codex_worker_transport_contract_proof.ts"',
  "package script for Codex worker transport proof",
);

assertContains(
  bridge,
  'fetch(`${config.baseUrl}/v1/codex/turn?stream=1`',
  "bridge calls the worker stream endpoint",
);
assertContains(
  bridge,
  'Authorization: `Bearer ${config.authToken}`',
  "bridge authenticates to the worker service",
);
assertContains(
  bridge,
  "chatgpt_auth",
  "bridge sends ChatGPT auth into the worker request",
);
assertContains(
  bridge,
  "run_token: params.ingest.run_token",
  "bridge forwards scoped ingest token",
);
assertContains(
  bridge,
  "tool_run_token: params.ingest.tool_run_token",
  "bridge forwards scoped tool token",
);
assertContains(
  bridge,
  "platform_tools",
  "bridge forwards projected platform tools",
);
assertContains(
  bridge,
  "parseSseBlock",
  "bridge parses SSE response blocks",
);
assertContains(
  bridge,
  'event.event === "delta"',
  "bridge accumulates assistant deltas",
);
assertContains(
  bridge,
  'event.event === "run_finalized"',
  "bridge handles terminal worker events",
);
assertContains(
  bridge,
  "polynet_codex_worker_stream_failed",
  "bridge maps stream failure to structured error",
);
assertNotContains(
  bridge,
  "startPolynetCodexWorkerRun",
  "legacy one-shot transport helper",
);
assertNotContains(
  bridge,
  "POLYNET_CODEX_WORKER_URL",
  "legacy static worker URL env",
);

assertContains(
  handler,
  "buildPolynetCodexWorkerIngestTarget",
  "runtime handler resolves worker ingest callback target",
);
assertContains(
  handler,
  "buildPolynetCodexWorkerToolTarget",
  "runtime handler resolves worker tool callback target",
);
assertContains(
  handler,
  "mintPolynetCodexWorkerRunTokenSet",
  "runtime handler mints callback tokens before streaming",
);
assertContains(
  handler,
  "streamPolynetCodexWorkerTurn({",
  "runtime handler starts worker stream through bridge",
);
assertOrdered(
  handler,
  "mintPolynetCodexWorkerRunTokenSet",
  "streamPolynetCodexWorkerTurn({",
  "handler mints run tokens before worker stream",
);

assertContains(
  worker,
  '"/v1/codex/turn"',
  "worker exposes the Codex turn endpoint",
);
assertContains(
  worker,
  "chatgptAuth",
  "worker receives ChatGPT auth",
);
assertContains(
  worker,
  "runToken: ingestRunToken",
  "worker carries scoped ingest token",
);
assertContains(
  worker,
  "toolRunToken: ingestToolRunToken",
  "worker carries scoped tool token",
);
assertContains(
  token,
  'PolynetCodexWorkerRunTokenAudience = "ingest" | "terminal" | "tool"',
  "run tokens are audience scoped",
);

console.log("codex_worker_transport_contract_proof: ok");
