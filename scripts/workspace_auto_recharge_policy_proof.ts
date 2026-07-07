import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildDefaultWorkspaceAutoRechargeSettings,
  computeWorkspaceAutoRechargeDecision,
  validateWorkspaceAutoRechargeSettingsInput,
  WORKSPACE_AUTO_RECHARGE_DEFAULT_MONTHLY_LIMIT_CREDITS,
  WORKSPACE_AUTO_RECHARGE_DEFAULT_RESTORE_TO_CREDITS,
  WORKSPACE_AUTO_RECHARGE_DEFAULT_THRESHOLD_CREDITS,
} from "../shared/workspaceAutoRecharge.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const packageJson = read("package.json");
const schemaSource = read("convex/schema.ts");
const convexSource = read("convex/workspaceAutoRecharge.ts");
const commerceGatewaySource = read("shared/cloudAccountCommerceGateway.ts");
const autoRechargePolicySource = read("shared/workspaceAutoRecharge.ts");
const appSource = read("apps/web/src/App.tsx");
const settingsPanelsSource = read("apps/web/src/components/WebSettingsPanels.tsx");
const billingSettingsSource = read("apps/web/src/components/WebBillingSettingsSection.tsx");

const defaults = buildDefaultWorkspaceAutoRechargeSettings();
assert.equal(defaults.enabled, false);
assert.equal(defaults.status, "disabled");
assert.equal(defaults.thresholdCredits, WORKSPACE_AUTO_RECHARGE_DEFAULT_THRESHOLD_CREDITS);
assert.equal(defaults.restoreToCredits, WORKSPACE_AUTO_RECHARGE_DEFAULT_RESTORE_TO_CREDITS);
assert.equal(defaults.monthlyLimitCredits, WORKSPACE_AUTO_RECHARGE_DEFAULT_MONTHLY_LIMIT_CREDITS);
assert.equal(defaults.currency, "usd");

const validSettings = validateWorkspaceAutoRechargeSettingsInput({
  enabled: true,
  thresholdCredits: 500,
  restoreToCredits: 2500,
  monthlyLimitCredits: 10000,
});
assert.equal(validSettings.ok, true);
assert.equal(validSettings.ok ? validSettings.value.status : null, "active");

assert.deepEqual(
  validateWorkspaceAutoRechargeSettingsInput({
    enabled: true,
    thresholdCredits: 2500,
    restoreToCredits: 500,
  }),
  {
    ok: false,
    error: "auto_recharge_restore_to_must_exceed_threshold",
  },
);

assert.deepEqual(
  validateWorkspaceAutoRechargeSettingsInput({
    enabled: true,
    thresholdCredits: 500,
    restoreToCredits: 2500,
    monthlyLimitCredits: 1000,
  }),
  {
    ok: false,
    error: "auto_recharge_monthly_limit_out_of_range",
  },
);

assert.deepEqual(
  computeWorkspaceAutoRechargeDecision({
    settings: { enabled: false, thresholdCredits: 500, restoreToCredits: 2500 },
    spendableCreditsBalance: 100,
    hasCardOnFile: true,
  }),
  {
    shouldTrigger: false,
    reason: "skip_disabled",
    rechargeCredits: 0,
    restoreToCredits: 2500,
    thresholdCredits: 500,
    monthlyLimitCredits: WORKSPACE_AUTO_RECHARGE_DEFAULT_MONTHLY_LIMIT_CREDITS,
  },
);

assert.equal(
  computeWorkspaceAutoRechargeDecision({
    settings: { enabled: true, thresholdCredits: 500, restoreToCredits: 2500 },
    spendableCreditsBalance: 100,
    hasCardOnFile: false,
  }).reason,
  "skip_no_card",
);

assert.equal(
  computeWorkspaceAutoRechargeDecision({
    settings: { enabled: true, thresholdCredits: 500, restoreToCredits: 2500 },
    spendableCreditsBalance: 100,
    uncollectedCreditsBalance: 1,
    hasCardOnFile: true,
  }).reason,
  "skip_uncollected_usage",
);

assert.equal(
  computeWorkspaceAutoRechargeDecision({
    settings: { enabled: true, thresholdCredits: 500, restoreToCredits: 2500 },
    spendableCreditsBalance: 100,
    pendingCardCollectionCreditsBalance: 1,
    hasCardOnFile: true,
  }).reason,
  "skip_pending_collection",
);

assert.equal(
  computeWorkspaceAutoRechargeDecision({
    settings: { enabled: true, thresholdCredits: 500, restoreToCredits: 2500 },
    spendableCreditsBalance: 501,
    hasCardOnFile: true,
  }).reason,
  "skip_above_threshold",
);

assert.equal(
  computeWorkspaceAutoRechargeDecision({
    settings: {
      enabled: true,
      status: "paused_payment_failed",
      thresholdCredits: 500,
      restoreToCredits: 2500,
    },
    spendableCreditsBalance: 100,
    hasCardOnFile: true,
  }).reason,
  "skip_disabled",
);

assert.equal(
  computeWorkspaceAutoRechargeDecision({
    settings: {
      enabled: true,
      thresholdCredits: 500,
      restoreToCredits: 2500,
      monthlyLimitCredits: 2000,
    },
    spendableCreditsBalance: 100,
    monthlyRechargedCredits: 1,
    hasCardOnFile: true,
  }).reason,
  "skip_monthly_cap",
);

assert.deepEqual(
  computeWorkspaceAutoRechargeDecision({
    settings: {
      enabled: true,
      thresholdCredits: 500,
      restoreToCredits: 2500,
      monthlyLimitCredits: 10000,
    },
    spendableCreditsBalance: 100,
    hasCardOnFile: true,
  }),
  {
    shouldTrigger: true,
    reason: "trigger",
    rechargeCredits: 2400,
    restoreToCredits: 2500,
    thresholdCredits: 500,
    monthlyLimitCredits: 10000,
  },
);

assert.match(
  packageJson,
  /"check:workspace-auto-recharge-policy-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/workspace_auto_recharge_policy_proof\.ts"/,
  "package script must expose the workspace auto recharge policy proof",
);
assert.match(
  schemaSource,
  /workspaceAutoRechargeSettings: defineTable\(/,
  "schema must persist one user-scoped auto recharge settings record",
);
assert.match(schemaSource, /\.index\("by_user", \["userId"\]\)/);
assert.match(convexSource, /export const getWorkspaceAutoRechargeSettings = query/);
assert.match(convexSource, /export const saveWorkspaceAutoRechargeSettings = mutation/);
assert.match(convexSource, /export const disableWorkspaceAutoRechargeSettings = mutation/);
assert.match(convexSource, /resolveAuthenticatedActor/);
assert.match(convexSource, /userStripeCustomers/);
assert.match(convexSource, /providerDefaultPaymentMethodId/);
assert.match(convexSource, /auto_recharge_card_required/);
assert.match(convexSource, /duplicate_auto_recharge_settings/);
assert.match(convexSource, /readWorkspaceAutoRechargeSettingsRows[\s\S]*\.take\(limit\)/);
assert.match(
  convexSource,
  /if \(duplicate\) throw new Error\(DUPLICATE_WORKSPACE_AUTO_RECHARGE_SETTINGS_ERROR\)/,
  "save must fail closed when duplicate settings rows exist",
);
assert.match(
  convexSource,
  /validation\.value\.enabled[\s\S]*hasActiveWorkspaceAutoRechargePaymentMethod/,
  "backend must require an active saved card before enabling auto recharge",
);
const publicAutoRechargeSurfacePattern =
  /loadCloudWorkspaceAutoRechargeSettings|saveCloudWorkspaceAutoRechargeSettings|disableCloudWorkspaceAutoRechargeSettings|workspaceAutoRechargeSettings|saveWorkspaceAutoRechargeSettings|disableWorkspaceAutoRechargeSettings|Edit auto recharge|Set up auto recharge|Auto recharge needs review|auto recharge settings|auto-recharge/i;
for (const [label, source] of [
  ["Cloud account commerce gateway", commerceGatewaySource],
  ["App shell", appSource],
  ["Settings props", settingsPanelsSource],
  ["Billing settings", billingSettingsSource],
] as const) {
  assert.doesNotMatch(
    source,
    publicAutoRechargeSurfacePattern,
    `${label} must not expose the deleted auto-recharge browser surface`,
  );
}
assert.doesNotMatch(
  autoRechargePolicySource,
  /stripe|PaymentIntent|checkout\.sessions\.create/i,
  "policy slice must not create a Stripe charge path",
);

console.log("workspace_auto_recharge_policy_proof: ok");
