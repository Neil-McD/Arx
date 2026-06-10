import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");

const useWebThreadDataController = fs.readFileSync(
  path.join(repoRoot, "shared/useWebThreadDataController.ts"),
  "utf8",
);
const useWebTurnRunnerController = fs.readFileSync(
  path.join(repoRoot, "shared/useWebTurnRunnerController.ts"),
  "utf8",
);
const cloudThreadsGateway = fs.readFileSync(
  path.join(repoRoot, "shared/cloudThreadsGateway.ts"),
  "utf8",
);
const convexThreads = fs.readFileSync(
  path.join(repoRoot, "convex/threads.ts"),
  "utf8",
);

assert.doesNotMatch(
  useWebTurnRunnerController,
  /seq:\s*0/,
  "workspace client message creation must not force persisted user messages to seq 0",
);
assert.match(
  cloudThreadsGateway,
  /Math\.floor\(params\.message\.seq\)\s*>\s*0[\s\S]*\?\s*Math\.floor\(params\.message\.seq\)/,
  "cloud thread gateway must forward only positive explicit message seq values",
);
assert.match(
  convexThreads,
  /Math\.floor\(args\.seq\)\s*>\s*0[\s\S]*\?\s*Math\.floor\(args\.seq\)/,
  "Convex addCloudThreadMessage must ignore nonpositive explicit message seq values",
);
assert.match(
  useWebThreadDataController,
  /function normalizeDisplaySeq[\s\S]*return seq > 0 \? seq : null/,
  "message display ordering must treat nonpositive seq values as invalid",
);
assert.match(
  useWebThreadDataController,
  /if \(aSeq !== null && bSeq !== null && aSeq !== bSeq\) return aSeq - bSeq;[\s\S]*Date\.parse\(a\.created_at\) - Date\.parse\(b\.created_at\)/,
  "message display ordering must prefer valid seq and fall back to created_at",
);

function normalizeDisplaySeq(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const seq = Math.floor(parsed);
  return seq > 0 ? seq : null;
}

function compareForProof(
  a: { id: string; seq: number; created_at: string },
  b: { id: string; seq: number; created_at: string },
): number {
  const aSeq = normalizeDisplaySeq(a.seq);
  const bSeq = normalizeDisplaySeq(b.seq);
  if (aSeq !== null && bSeq !== null && aSeq !== bSeq) return aSeq - bSeq;
  const createdAtDelta = Date.parse(a.created_at) - Date.parse(b.created_at);
  if (Number.isFinite(createdAtDelta) && createdAtDelta !== 0) return createdAtDelta;
  if (aSeq !== null && bSeq === null) return -1;
  if (aSeq === null && bSeq !== null) return 1;
  return a.id.localeCompare(b.id);
}

const ordered = [
  { id: "older-user", thread_id: "thread", seq: 1, created_at: "2026-06-08T22:24:19.397Z" },
  { id: "older-assistant", thread_id: "thread", seq: 2, created_at: "2026-06-08T22:24:43.591Z" },
  { id: "broken-newer-user", thread_id: "thread", seq: 0, created_at: "2026-06-08T22:50:55.351Z" },
  { id: "newer-assistant", thread_id: "thread", seq: 3, created_at: "2026-06-08T22:51:00.949Z" },
].sort(compareForProof);

assert.deepEqual(
  ordered.map((message) => message.id),
  ["older-user", "older-assistant", "broken-newer-user", "newer-assistant"],
  "message display ordering must fall back to created_at when a persisted row has nonpositive seq",
);

console.log("workspace_thread_message_ordering_proof: ok");
