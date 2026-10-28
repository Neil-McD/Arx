import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const schema = read("convex/schema.ts");
const operatorIntelligence = read("convex/operatorIntelligence.ts");
const operatorPlatformHealth = read("shared/operatorPlatformHealth.ts");
const operatorPanel = [
  read("apps/web/src/components/WebOperatorDashboardHost.tsx"),
  read("apps/web/src/components/useOperatorDashboardData.ts"),
  read("apps/web/src/components/OperatorPlatformPanelView.tsx"),
  read("apps/web/src/components/OperatorBusinessPanelView.tsx"),
].join("\n");
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
assert.match(
  operatorPlatformHealth,
  /runtime\.executionAvailability[\s\S]*Turns, tools, providers, and sandbox execution clean/,
  "platform health must score execution rather than retired billing",
);
assert.match(operatorPanel, /<h2>Runtime execution<\/h2>/);
assert.match(operatorPanel, /Runtime diagnostics are sampled for this window/);
assert.doesNotMatch(
  operatorPanel,
  /<h2>Tool balance revenue<\/h2>|<span>Credit top-up conversion<\/span>/,
  "retired tool credits must not be presented as a current product or revenue rail",
);

for (const label of [
  "Historical tool-credit liabilities",
  "Historical tool-credit reconciliation",
  "Historical tool-credit cost evidence",
  "Audit evidence only; this product is retired.",
]) {
  assert.match(operatorPanel, new RegExp(label), `missing historical audit boundary: ${label}`);
}
assert.match(
  operatorPanel,
  /Current platform net revenue is not instrumented; retired tool-credit sales are excluded\./,
  "platform revenue must exclude archived tool-credit sales",
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

assert.match(
  operatorIntelligence,
  /buildToolBalanceAccountingIntegrity/,
  "historical balances and reservations must remain available for liability reconciliation",
);
assert.match(
  packageJson,
  /"check:runtime-tool-diagnostics-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/runtime_tool_diagnostics_proof\.ts"/,
  "runtime diagnostics proof must remain wired into package scripts",
);

console.log("runtime_tool_diagnostics_proof: ok");
