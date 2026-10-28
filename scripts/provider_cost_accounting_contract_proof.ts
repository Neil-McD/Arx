import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PROVIDER_COST_BILLING_DISPOSITIONS,
  PROVIDER_COST_CATEGORIES,
  PROVIDER_COST_COMPONENTS,
  PROVIDER_COST_EVIDENCE_TYPES,
  roundProviderCostQuantity,
  roundProviderCostUsd,
} from "../shared/providerCostAccounting.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const packageJson = read("package.json");
const schema = read("convex/schema.ts");
const providerCostCore = read("convex/providerCostCore.ts");
const billingSurface = read("apps/web/src/components/WebBillingSettingsSection.tsx");
const voiceProviderCostAccounting = read("convex/voiceProviderCostAccounting.ts");

assert.deepEqual(PROVIDER_COST_CATEGORIES, ["workspace", "web", "voice"]);
assert.ok(PROVIDER_COST_COMPONENTS.includes("blaxel_active_runtime"));
assert.ok(PROVIDER_COST_COMPONENTS.includes("blaxel_volume_storage"));
assert.ok(PROVIDER_COST_COMPONENTS.includes("blaxel_standby_snapshot"));
assert.ok(PROVIDER_COST_COMPONENTS.includes("daytona_codex_runtime_active"));
assert.ok(PROVIDER_COST_COMPONENTS.includes("web_crawl_provider_call"));
assert.ok(PROVIDER_COST_COMPONENTS.includes("web_screenshot_provider_call"));
assert.ok(!PROVIDER_COST_COMPONENTS.includes("fly_crawler" as never));
assert.ok(PROVIDER_COST_COMPONENTS.includes("voice_transcription"));
assert.deepEqual(PROVIDER_COST_EVIDENCE_TYPES, ["estimated", "provider_reported", "exact"]);
assert.deepEqual(PROVIDER_COST_BILLING_DISPOSITIONS, [
  "tracked_only",
  "rolled_into_user_usage",
  "platform_absorbed",
]);
assert.ok(!PROVIDER_COST_BILLING_DISPOSITIONS.includes("charged" as never));
assert.equal(roundProviderCostUsd(0.000333288), 0.00033329);
assert.equal(roundProviderCostQuantity(7200.1234567), 7200.123457);

assert.match(
  packageJson,
  /"check:provider-cost-accounting-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/provider_cost_accounting_contract_proof\.ts"/,
  "package script must expose the provider cost accounting proof",
);

assert.match(
  schema,
  /providerCostEntries: defineTable\(\{[\s\S]*costKey: v\.string\(\)[\s\S]*category: v\.union\([\s\S]*v\.literal\("workspace"\)[\s\S]*v\.literal\("web"\)[\s\S]*v\.literal\("voice"\)/,
  "schema must define providerCostEntries with a small internal category set",
);
assert.match(
  schema,
  /component: v\.union\([\s\S]*v\.literal\("blaxel_active_runtime"\)[\s\S]*v\.literal\("blaxel_volume_storage"\)[\s\S]*v\.literal\("blaxel_standby_snapshot"\)[\s\S]*v\.literal\("web_crawl_provider_call"\)[\s\S]*v\.literal\("web_screenshot_provider_call"\)[\s\S]*v\.literal\("daytona_codex_runtime_active"\)[\s\S]*v\.literal\("voice_transcription"\)/,
  "schema must include provider cost components for workspace, Daytona, crawl, screenshot, and voice costs without the deleted Fly crawler bucket",
);
assert.doesNotMatch(
  schema,
  /v\.literal\("fly_crawler"\)/,
  "provider cost schema must not retain the deleted Fly crawler component",
);
assert.match(
  schema,
  /billingDisposition: v\.union\([\s\S]*v\.literal\("tracked_only"\)[\s\S]*v\.literal\("rolled_into_user_usage"\)[\s\S]*v\.literal\("platform_absorbed"\)/,
  "schema must distinguish tracked overhead from user-usage mirror rows",
);
assert.doesNotMatch(
  schema,
  /billingDisposition: v\.union\([\s\S]*v\.literal\("charged"\)/,
  "provider cost accounting must not keep an ambiguous charged disposition",
);
assert.match(
  schema,
  /\.index\("by_costKey", \["costKey"\]\)[\s\S]*\.index\("by_component_period", \["component", "periodStart"\]\)/,
  "provider cost entries must be idempotent and queryable by component over time",
);
assert.match(
  schema,
  /\.index\("by_status_settledAt", \["status", "settledAt"\]\)/,
  "credit ledger entries must be queryable by settled period for margin diagnostics",
);
assert.match(
  providerCostCore,
  /quantity: roundProviderCostQuantity[\s\S]*rawVendorCostUsd: roundProviderCostUsd[\s\S]*ctx\.db\.insert\("providerCostEntries"/,
  "provider cost recording must preserve sub-cent provider cost precision",
);
assert.match(
  providerCostCore,
  /PROVIDER_COST_EVIDENCE_RANK: Record<ProviderCostEvidenceType, number> = \{[\s\S]*estimated: 1[\s\S]*provider_reported: 2[\s\S]*exact: 3/,
  "provider cost evidence must have explicit upgrade precedence",
);
assert.match(
  providerCostCore,
  /function buildProviderCostEvidenceUpgradePatch[\s\S]*resolveProviderCostEvidenceRank\(incoming\.evidence\) <=[\s\S]*resolveProviderCostEvidenceRank\(existing\?\.evidence\)[\s\S]*return null[\s\S]*previous_evidence[\s\S]*previous_raw_vendor_cost_usd[\s\S]*provider_cost_upgraded_at/,
  "provider cost recording must upgrade only stronger evidence and preserve previous audit context",
);
assert.match(
  providerCostCore,
  /resolveProviderCostIdentityMismatch\(existing, row\)[\s\S]*provider_cost_identity_mismatch[\s\S]*return existing[\s\S]*ctx\.db\.patch\(existing\._id, upgradePatch\)/,
  "provider cost recording must refuse identity drift before patching stronger evidence",
);
assert.doesNotMatch(
  providerCostCore,
  /const quantity = roundCurrency[\s\S]*const rawVendorCostUsd = roundCurrency/,
  "provider cost recording must not use user-facing 4-decimal currency rounding",
);
assert.match(
  voiceProviderCostAccounting,
  /recordVoiceProviderCostInternal[\s\S]*recordProviderCostEntry[\s\S]*component: "voice_transcription"[\s\S]*billingDisposition: "platform_absorbed"[\s\S]*provider_cost_source: "voice_provider_cost_accounting"/,
  "voice provider cost must remain platform absorbed",
);
assert.match(
  voiceProviderCostAccounting,
  /category: "voice"[\s\S]*component: "voice_transcription"[\s\S]*quantityKind: "audio_seconds"/,
  "voice calls must classify as absorbed transcription provider cost",
);

for (const forbidden of [
  "Blaxel standby",
  "Blaxel volume",
  "Fly crawler",
  "Provider cost",
]) {
  assert.ok(
    !billingSurface.includes(forbidden),
    `billing UI must not expose internal provider-cost component: ${forbidden}`,
  );
}

console.log("provider_cost_accounting_contract_proof: ok");
