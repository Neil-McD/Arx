import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const schema = read("convex/schema.ts");
const operatorIntelligence = read("convex/operatorIntelligence.ts");
const operatorTypes = read("shared/operatorTypes.ts");

for (const [table, indexes] of [
  ["checkoutSessions", ["by_mode_status", "by_community_status"]],
  ["communitySubscriptions", ["by_status", "by_community_status"]],
] as const) {
  assert.match(schema, new RegExp(`${table}: defineTable[\\s\\S]*${indexes[0]}`), `${table} missing ${indexes[0]}`);
  assert.match(schema, new RegExp(`${table}: defineTable[\\s\\S]*${indexes[1]}`), `${table} missing ${indexes[1]}`);
}

assert.match(operatorTypes, /export type OperatorBuilderRecord = /, "operator builder record contract is missing");
assert.match(operatorTypes, /export type OperatorOverviewSnapshot = /, "operator overview contract is missing");
assert.match(operatorTypes, /export type OperatorMonetizationSnapshot = /, "operator monetization contract is missing");
assert.match(operatorTypes, /creditTopupCheckoutStarts: number/, "operator monetization should track credit top-up starts");
assert.doesNotMatch(operatorTypes, /builderPlanCheckoutStarts: number/, "operator monetization must not foreground deprecated Builder checkout starts");
assert.match(operatorTypes, /export type OperatorRiskItem = /, "operator risk contract is missing");
assert.match(operatorTypes, /export type OperatorEventRecord = /, "operator event contract is missing");
assert.doesNotMatch(operatorTypes, /OperatorToolDefinition|OperatorDashboardSection/, "unused operator tool scaffold must stay deleted");

for (const queryName of [
  "getOperatorOverviewInternal",
  "listOperatorBuildersInternal",
  "getOperatorBuilderSnapshotInternal",
  "getOperatorMonetizationInternal",
  "listOperatorRisksInternal",
  "listOperatorEventsInternal",
]) {
  assert.match(
    operatorIntelligence,
    new RegExp(`export const ${queryName} = internalQuery`),
    `missing read-only internal query ${queryName}`,
  );
}

assert.doesNotMatch(
  operatorIntelligence,
  /internalMutation|mutation|action|ctx\.db\.insert|ctx\.db\.patch|ctx\.db\.delete/,
  "operator intelligence must stay read-only",
);

assert.match(
  operatorIntelligence,
  /criticalAuditEvents/,
  "operator intelligence must source the critical audit ledger",
);

assert.match(
  operatorIntelligence,
  /monthlyMoneyFromPricePoint/,
  "operator MRR must normalize subscription price points by billing period",
);

assert.doesNotMatch(
  operatorIntelligence,
  /multiplyMoney|multiplyMoney\(currentPrice|amountBaseUnits:\s*metric\.amountBaseUnits\s*\*\s*multiplier/,
  "operator MRR must not multiply current price by paid member count",
);

assert.match(
  operatorIntelligence,
  /ACTIVE_SUBSCRIPTION_STATUSES = new Set\(\["active", "past_due", "cancel_at_period_end"\]\)/,
  "operator MRR should include revenue-bearing subscription statuses",
);

assert.match(
  operatorIntelligence,
  /CHECKOUT_STATUSES = \["pending", "complete", "expired"\]/,
  "operator checkout starts must include expired checkout sessions",
);
assert.match(
  operatorIntelligence,
  /row\.mode === "workspace_credit_topup"/,
  "operator monetization should treat credits as the paid-tool checkout signal",
);
assert.doesNotMatch(
  operatorIntelligence,
  /builderPlanCheckoutStarts|builderPlanCheckoutCompletions/,
  "operator monetization must not expose deprecated Builder checkout metrics",
);

assert.match(
  operatorTypes,
  /activeMemberships: number/,
  "operator member contract must name membership counts honestly",
);

assert.doesNotMatch(
  operatorTypes,
  /activeMembers: number/,
  "operator member contract must not expose activeMembers until it is usage-window based",
);

assert.match(
  operatorIntelligence,
  /ctx\.db\.query\("communities"\)\.collect\(\)/,
  "operator builder search must filter before applying the limit",
);

assert.doesNotMatch(
  operatorIntelligence,
  /query\("criticalAuditEvents"\)\.order\("desc"\)\.take\(100\)/,
  "operator overview critical event counts must not be capped at 100",
);

assert.doesNotMatch(
  operatorIntelligence,
  /query\("communities"\)\.order\("desc"\)\.take\(limit\)/,
  "operator risk scans must not hide older communities before filtering",
);

console.log("operator_intelligence_proof: ok");
