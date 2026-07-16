import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "convex/communityAgentCycleLedgerRetirement.ts",
  "utf8",
);

for (const required of [
  "MAX_LEGACY_ROWS = 100",
  "auditCommunityAgentCycleLedgerRetirementInternal",
  "retireCommunityAgentCycleLedgerInternal",
  "retire_legacy_community_agent_cycle_ledger_v1",
  'query("communityAgentRuns" as any)',
  'query("communityAgentRunEvents" as any)',
  'event.kind !== "tool_call" || event.toolName !== "note"',
  'crypto.subtle.digest("SHA-256"',
  "community_agent_cycle_ledger_retirement_canonical_match_failed",
  "community_agent_cycle_ledger_retirement_fingerprint_changed",
  "community_agent_cycle_ledger_retirement_row_set_changed",
  "community_agent_cycle_ledger_retirement_incomplete",
]) {
  assert.ok(migration.includes(required), `missing retirement guard: ${required}`);
}

assert.doesNotMatch(migration, /\.collect\(\)/);
assert.match(
  migration,
  /expectedRowIds\.length !== inspection\.row_ids\.length[\s\S]*expectedRowIds\.some/,
);
assert.match(
  migration,
  /for \(const rowId of args\.rowIds\)[\s\S]*ctx\.db\.get\(rowId\)[\s\S]*ctx\.db\.delete\(rowId\)/,
);
assert.doesNotMatch(
  migration,
  /ctx\.db\.delete\([^r][^o][^w][^I][^d]/,
  "retirement must delete only explicitly enumerated cycle-ledger row ids",
);

console.log("community_agent_cycle_ledger_retirement_contract_proof: ok");
