import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const schema = read("convex/schema.ts");
const sessions = read("convex/authSessions.ts");
const core = read("convex/authSessionMaintenanceCore.ts");
const script = read("scripts/auth_prune_sessions.sh");

assert.match(schema, /authSessions: defineTable[\s\S]*\.index\("by_revokedAt", \["revokedAt"\]\)/);
assert.doesNotMatch(
  sessions,
  /pruneRevokedAuthSessionsForMaintenance[\s\S]*query\("authSessions"\)\.collect\(\)/,
);
assert.match(core, /withIndex\("by_revokedAt"/);
assert.match(core, /q\.gt\("revokedAt", 0\)\.lte\("revokedAt", cutoff\)/);
assert.match(core, /\.take\(limit \+ 1\)/);
assert.match(core, /MAX_AUTH_SESSION_PRUNE_BATCH_SIZE = 100/);
assert.match(core, /const dryRun = args\.dryRun !== false/);
assert.match(core, /auth_session_maintenance_index_contract_invalid/);
assert.match(core, /auth_session_maintenance_unauthorized/);
assert.match(sessions, /requireAuthSessionMaintenanceSecret/);
assert.match(script, /--execute/);
assert.match(script, /Mode:.*audit-only/);
assert.match(script, /MAX_BATCHES/);
assert.match(script, /prune made no truthful forward progress/);
assert.match(
  script,
  /console\.log\(required\.map\(\(key\) => String\(result\[key\]\)\)\.join\("\\t"\)\)/,
);

console.log("auth_session_retention_contract_proof: ok");
