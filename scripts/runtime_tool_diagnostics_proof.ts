import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const schema = read("convex/schema.ts");
const operatorIntelligence = read("convex/operatorIntelligence.ts");
const voiceCostAccounting = read("convex/voiceProviderCostAccounting.ts");
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");
const runtimeTurnHandlers = read("convex/runtimeTurnHandlers.ts");
const httpVoice = read("convex/httpVoice.ts");
const packageJson = read("package.json");

assert.match(
  schema,
  /runtimeRuns:[\s\S]*\.index\("by_status_startedAt", \["status", "startedAt"\]\)/,
  "runtime availability must remain grounded in indexed run evidence",
);
assert.match(
  operatorIntelligence,
  /getOperatorRuntimeToolDiagnosticsInternal = internalQuery[\s\S]*executionAvailability/,
  "operator diagnostics must retain current runtime availability",
);
assert.match(voiceCostAccounting, /billingDisposition: "platform_absorbed"/);
assert.match(voiceCostAccounting, /recordVoiceProviderCostInternal/);
for (const runtimeSource of [runtimeAgentLoop, runtimeTurnHandlers, httpVoice]) {
  assert.doesNotMatch(
    runtimeSource,
    /reserveCreditsInternal|settleWorkspaceCreditReservationInternal|releaseWorkspaceCreditReservationInternal/,
    "live runtime paths must not reserve, settle, or release personal tool credits",
  );
}

assert.doesNotMatch(
  operatorIntelligence,
  /creditLedgerEntries|workspaceCreditBalances|workspaceComputeCharges|workspaceUsageCollections/,
  "the old Workspace credit tables were dropped Nov 7; nothing reads them",
);
assert.match(
  packageJson,
  /"check:runtime-tool-diagnostics-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/runtime_tool_diagnostics_proof\.ts"/,
  "runtime diagnostics proof must remain wired into package scripts",
);

console.log("runtime_tool_diagnostics_proof: ok");
