import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function sourceFromExport(source: string, exportName: string, nextMarker: string): string {
  const start = source.indexOf(`export const ${exportName}`);
  assert.notEqual(start, -1, `${exportName} export missing`);
  const end = source.indexOf(nextMarker, start + 1);
  assert.notEqual(end, -1, `${exportName} end marker missing`);
  return source.slice(start, end);
}

function assertBefore(source: string, first: string, second: string, message: string) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.notEqual(firstIndex, -1, `${first} missing`);
  assert.notEqual(secondIndex, -1, `${second} missing`);
  assert.ok(firstIndex < secondIndex, message);
}

const packageJson = read("package.json");
const schemaSource = read("convex/schema.ts");
const convexSource = read("convex/workspaceAutoRecharge.ts");

const prepareSource = sourceFromExport(
  convexSource,
  "prepareWorkspaceAutoRechargeAttemptInternal",
  "export const markWorkspaceAutoRechargeAttemptProcessingInternal",
);
const markProcessingSource = sourceFromExport(
  convexSource,
  "markWorkspaceAutoRechargeAttemptProcessingInternal",
  "export const finalizeWorkspaceAutoRechargeAttemptSucceededInternal",
);
const finalizeSucceededSource = sourceFromExport(
  convexSource,
  "finalizeWorkspaceAutoRechargeAttemptSucceededInternal",
  "export const finalizeWorkspaceAutoRechargeAttemptFailedInternal",
);
const finalizeFailedSource = sourceFromExport(
  convexSource,
  "finalizeWorkspaceAutoRechargeAttemptFailedInternal",
  "async function finalizeWorkspaceAutoRechargePaymentIntent",
);
const executorSource = sourceFromExport(
  convexSource,
  "executeWorkspaceAutoRechargeForUserInternal",
  "\n});",
);

assert.match(
  packageJson,
  /"check:workspace-auto-recharge-executor-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/workspace_auto_recharge_executor_proof\.ts"/,
  "package script must expose the workspace auto recharge executor proof",
);

assert.match(schemaSource, /workspaceAutoRechargeAttempts: defineTable\(/);
assert.match(schemaSource, /\.index\("by_attemptKey", \["attemptKey"\]\)/);
assert.match(schemaSource, /\.index\("by_user_status", \["userId", "status"\]\)/);
assert.match(schemaSource, /workspaceCreditBalances: defineTable\(/);
assert.match(schemaSource, /userStripeCustomers: defineTable\(/);

assert.match(convexSource, /getStripeClient/);
assert.match(convexSource, /resolveWorkspaceAutoRechargeMonthKey/);
assert.match(convexSource, /readActiveWorkspaceAutoRechargePaymentMethod/);
assert.match(convexSource, /normalizeStripeCustomerId\(stripeCustomer\?\.providerCustomerId\)/);
assert.match(convexSource, /normalizeStripePaymentMethodId\([\s\S]*stripeCustomer\?\.providerDefaultPaymentMethodId/);
assert.match(convexSource, /status === "active"/);
assert.match(convexSource, /!\(Number\(stripeCustomer\?\.cardRemovedAt \?\? 0\) > 0\)/);

assert.match(prepareSource, /internalMutation\(/);
assert.match(markProcessingSource, /internalMutation\(/);
assert.match(finalizeSucceededSource, /internalMutation\(/);
assert.match(finalizeFailedSource, /internalMutation\(/);
assert.match(executorSource, /internalAction\(/);
assert.doesNotMatch(convexSource, /export const finalizeWorkspaceAutoRecharge[\s\S]*=\s*mutation\(/);
assert.doesNotMatch(convexSource, /export const executeWorkspaceAutoRecharge[\s\S]*=\s*mutation\(/);
assert.doesNotMatch(convexSource, /checkout\.sessions\.create|charges\.create|sources\.create/i);

assert.match(prepareSource, /readActiveWorkspaceAutoRechargeAttempts/);
assert.match(prepareSource, /duplicate_active_auto_recharge_attempts/);
assert.match(prepareSource, /disposition: "active_attempt"/);
assert.match(prepareSource, /readCanonicalWorkspaceAutoRechargeSettingsRow/);
assert.match(prepareSource, /DUPLICATE_WORKSPACE_AUTO_RECHARGE_SETTINGS_ERROR/);
assert.match(prepareSource, /readCanonicalWorkspaceCreditBalance/);
assert.match(prepareSource, /sumSucceededWorkspaceAutoRechargeCredits\(monthAttempts\)/);
assert.match(prepareSource, /computeWorkspaceAutoRechargeAttemptPlan/);
assert.match(prepareSource, /hasCardOnFile: Boolean\(paymentMethod\)/);
assert.match(prepareSource, /provider: "stripe"/);
assert.match(prepareSource, /providerIdempotencyKey: plan\.attemptKey/);
assert.match(prepareSource, /lastTriggeredAt: nowMs/);

assert.match(markProcessingSource, /if \(!isWorkspaceAutoRechargeAttemptStatusActive\(attempt\.status\)\)/);
assert.match(markProcessingSource, /status: "processing"/);
assert.match(markProcessingSource, /provider: "stripe"/);

assertBefore(
  finalizeSucceededSource,
  "if (!isWorkspaceAutoRechargeAttemptStatusActive(attempt.status))",
  "purchasedCreditsBalance",
  "success finalizer must reject completed attempts before adding credits",
);
assert.match(finalizeSucceededSource, /auto_recharge_attempt_amount_invalid/);
assert.match(finalizeSucceededSource, /ctx\.db\.insert\("workspaceCreditBalances"/);
assert.match(finalizeSucceededSource, /purchasedCreditsBalance: rechargeCredits/);
assert.match(
  finalizeSucceededSource,
  /purchasedCreditsBalance: roundCredits\(balance\.purchasedCreditsBalance \+ rechargeCredits\)/,
);
assert.match(finalizeSucceededSource, /status: "succeeded"/);
assert.match(finalizeSucceededSource, /lastSucceededAt: nowMs/);

assertBefore(
  finalizeFailedSource,
  "if (!isWorkspaceAutoRechargeAttemptStatusActive(attempt.status))",
  "status: \"failed\"",
  "failure finalizer must reject completed attempts before writing terminal state",
);
assert.doesNotMatch(finalizeFailedSource, /purchasedCreditsBalance/);
assert.match(finalizeFailedSource, /status: "failed"/);
assert.match(finalizeFailedSource, /status: "paused_payment_failed"/);
assert.match(finalizeFailedSource, /lastFailureAt: nowMs/);
assert.match(finalizeFailedSource, /failureReason/);

assert.match(convexSource, /async function finalizeWorkspaceAutoRechargePaymentIntent/);
assert.match(convexSource, /paymentIntentIsSucceeded/);
assert.match(convexSource, /paymentIntentIsProcessing/);
assert.match(convexSource, /paymentIntentIsTerminalFailure/);
assert.match(convexSource, /finalizeWorkspaceAutoRechargeAttemptSucceededInternal/);
assert.match(convexSource, /finalizeWorkspaceAutoRechargeAttemptFailedInternal/);
assert.match(convexSource, /markWorkspaceAutoRechargeAttemptProcessingInternal/);

assert.match(executorSource, /prepareWorkspaceAutoRechargeAttemptInternal/);
assert.match(executorSource, /disposition === "skipped"/);
assert.match(executorSource, /auto_recharge_card_required/);
assert.match(executorSource, /getStripeClient\(\)/);
assert.match(executorSource, /stripe\.paymentIntents\.retrieve\(existingPaymentIntentId\)/);
assert.match(executorSource, /auto_recharge_attempt_amount_invalid/);
assertBefore(
  executorSource,
  "auto_recharge_attempt_amount_invalid",
  "stripe.paymentIntents.create",
  "executor must validate amount before creating a PaymentIntent",
);
assert.match(executorSource, /stripe\.paymentIntents\.create/);
assert.match(executorSource, /amount: amountCents/);
assert.match(executorSource, /currency: WORKSPACE_AUTO_RECHARGE_CURRENCY/);
assert.match(executorSource, /customer: providerCustomerId/);
assert.match(executorSource, /payment_method: providerPaymentMethodId/);
assert.match(executorSource, /confirm: true/);
assert.match(executorSource, /off_session: true/);
assert.match(executorSource, /metadata: buildWorkspaceAutoRechargePaymentIntentMetadata/);
assert.match(executorSource, /idempotencyKey: providerIdempotencyKey/);
assert.match(executorSource, /readStripeErrorPaymentIntent\(error\)/);
assert.match(executorSource, /authentication_required/);
assert.match(executorSource, /card_declined/);
assert.match(executorSource, /retry_later/);

console.log("workspace_auto_recharge_executor_proof: ok");
