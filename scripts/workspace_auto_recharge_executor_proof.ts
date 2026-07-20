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
const workspaceCreditsSource = read("convex/workspaceCredits.ts");
const cronsSource = read("convex/crons.ts");

const prepareSource = sourceFromExport(
  convexSource,
  "prepareWorkspaceAutoRechargeAttemptInternal",
  "export const markWorkspaceAutoRechargeAttemptProcessingInternal",
);
const saveSettingsSource = sourceFromExport(
  convexSource,
  "saveWorkspaceAutoRechargeSettings",
  "export const disableWorkspaceAutoRechargeSettings",
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
const sweepSource = sourceFromExport(
  convexSource,
  "sweepWorkspaceAutoRechargeExecutionsInternal",
  "export const authorizeWorkspaceAutoRechargeAttemptPaymentInternal",
);
const authorizeSource = sourceFromExport(
  convexSource,
  "authorizeWorkspaceAutoRechargeAttemptPaymentInternal",
  "export const executeWorkspaceAutoRechargeForUserInternal",
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
assert.match(
  schemaSource,
  /workspaceAutoRechargeAttempts: defineTable\(\{[\s\S]*providerCustomerId: v\.optional\(v\.string\(\)\)[\s\S]*providerPaymentMethodId: v\.optional\(v\.string\(\)\)[\s\S]*providerPaymentId: v\.optional\(v\.string\(\)\)/,
  "auto recharge attempt schema must persist frozen provider payment parameters",
);
assert.match(schemaSource, /\.index\("by_attemptKey", \["attemptKey"\]\)/);
assert.match(schemaSource, /\.index\("by_user_status", \["userId", "status"\]\)/);
assert.match(schemaSource, /workspaceCreditBalances: defineTable\(/);
assert.match(schemaSource, /userStripeCustomers: defineTable\(/);

assert.match(convexSource, /getStripeClient/);
assert.match(convexSource, /resolveWorkspaceAutoRechargeMonthKey/);
assert.match(convexSource, /readActiveWorkspaceAutoRechargePaymentMethod/);
assert.match(
  convexSource,
  /WORKSPACE_AUTO_RECHARGE_PROCESSING_WITHOUT_PAYMENT_ID_STALE_MS = 5 \* 60 \* 1000/,
  "processing attempts without provider ids must have a bounded stale retry window",
);
assert.match(
  convexSource,
  /WORKSPACE_AUTO_RECHARGE_PROCESSING_WITHOUT_PAYMENT_ID_MAX_RETRY_AGE_MS =[\s\S]*12 \* 60 \* 60 \* 1000/,
  "processing attempts without provider ids must stop before Stripe idempotency retention becomes unsafe",
);
assert.match(
  convexSource,
  /function isWorkspaceAutoRechargeProcessingWithoutPaymentIdStale[\s\S]*attempt\.status !== "processing"[\s\S]*normalizeStripePaymentIntentId\(attempt\.providerPaymentId\)[\s\S]*WORKSPACE_AUTO_RECHARGE_PROCESSING_WITHOUT_PAYMENT_ID_STALE_MS/,
  "stale processing/no-payment-id helper must only match processing attempts without a provider payment id",
);
assert.match(
  convexSource,
  /function isWorkspaceAutoRechargeProcessingWithoutPaymentIdExpired[\s\S]*attempt\.status !== "processing"[\s\S]*normalizeStripePaymentIntentId\(attempt\.providerPaymentId\)[\s\S]*WORKSPACE_AUTO_RECHARGE_PROCESSING_WITHOUT_PAYMENT_ID_MAX_RETRY_AGE_MS/,
  "expired processing/no-payment-id helper must only match old processing attempts without a provider payment id",
);
assert.match(
  convexSource,
  /function readStoredWorkspaceAutoRechargePaymentMethod[\s\S]*normalizeStripeCustomerId\(attempt\.providerCustomerId\)[\s\S]*normalizeStripePaymentMethodId\(attempt\.providerPaymentMethodId\)/,
  "processing retries must use frozen provider payment method parameters",
);
assert.match(convexSource, /normalizeStripeCustomerId\(stripeCustomer\?\.providerCustomerId\)/);
assert.match(convexSource, /normalizeStripePaymentMethodId\([\s\S]*stripeCustomer\?\.providerDefaultPaymentMethodId/);
assert.match(convexSource, /status === "active"/);
assert.match(convexSource, /!\(Number\(stripeCustomer\?\.cardRemovedAt \?\? 0\) > 0\)/);
assert.match(convexSource, /async function scheduleWorkspaceAutoRechargeExecutionBestEffort/);

assert.match(prepareSource, /internalMutation\(/);
assert.match(saveSettingsSource, /mutation\(/);
assert.match(markProcessingSource, /internalMutation\(/);
assert.match(finalizeSucceededSource, /internalMutation\(/);
assert.match(finalizeFailedSource, /internalMutation\(/);
assert.match(sweepSource, /internalMutation\(/);
assert.match(authorizeSource, /internalMutation\(/);
assert.match(executorSource, /internalAction\(/);
assert.doesNotMatch(convexSource, /export const finalizeWorkspaceAutoRecharge[\s\S]*=\s*mutation\(/);
assert.doesNotMatch(convexSource, /export const executeWorkspaceAutoRecharge[\s\S]*=\s*mutation\(/);
assert.doesNotMatch(convexSource, /checkout\.sessions\.create|charges\.create|sources\.create/i);

assert.match(saveSettingsSource, /if \(validation\.value\.enabled\)/);
assert.match(saveSettingsSource, /scheduleWorkspaceAutoRechargeExecutionBestEffort/);
assert.match(saveSettingsSource, /reason: "settings_enabled"/);

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
assert.match(markProcessingSource, /providerCustomerId:[\s\S]*normalizeStripeCustomerId\(args\.providerCustomerId\)/);
assert.match(markProcessingSource, /providerPaymentMethodId:[\s\S]*normalizeStripePaymentMethodId\(args\.providerPaymentMethodId\)/);

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

assert.match(sweepSource, /workspaceAutoRechargeAttempts/);
assert.match(sweepSource, /withIndex\("by_status_updatedAt"[\s\S]*status", "prepared"/);
assert.match(sweepSource, /withIndex\("by_status_updatedAt"[\s\S]*status", "processing"/);
assert.match(sweepSource, /normalizeStripePaymentIntentId\(attempt\.providerPaymentId\)/);
assert.match(sweepSource, /isWorkspaceAutoRechargeProcessingWithoutPaymentIdStale\(attempt, nowMs\)/);
assert.match(
  sweepSource,
  /!existingPaymentIntentId[\s\S]*&& !isWorkspaceAutoRechargeProcessingWithoutPaymentIdStale\(attempt, nowMs\)[\s\S]*continue/,
  "sweep must skip only fresh processing/no-payment-id attempts and retry stale ones",
);
assert.match(sweepSource, /workspaceCreditBalances/);
assert.match(sweepSource, /withIndex\("by_updatedAt"\)/);
assert.match(sweepSource, /readCanonicalWorkspaceAutoRechargeSettingsRow/);
assert.match(sweepSource, /settings\.enabled !== true \|\| settings\.status !== "active"/);
assert.match(sweepSource, /getSpendableWorkspaceToolBalanceCredits/);
assert.match(sweepSource, /getUncollectedWorkspaceToolBalanceCredits/);
assert.match(sweepSource, /getPendingCardCollectionWorkspaceToolBalanceCredits/);
assert.match(sweepSource, /scheduleWorkspaceAutoRechargeExecutionBestEffort/);
assert.match(sweepSource, /reason: "sweep"/);

assert.match(authorizeSource, /readWorkspaceAutoRechargeAttemptByKey/);
assert.match(authorizeSource, /disposition: "reconcile_existing"/);
assert.match(authorizeSource, /if \(!isWorkspaceAutoRechargeAttemptStatusActive\(attempt\.status\)\)/);
assert.match(authorizeSource, /attempt\.status === "processing"/);
assert.match(authorizeSource, /isWorkspaceAutoRechargeProcessingWithoutPaymentIdStale\(attempt, nowMs\)/);
assert.match(authorizeSource, /isWorkspaceAutoRechargeProcessingWithoutPaymentIdExpired\(attempt, nowMs\)/);
assert.match(authorizeSource, /auto_recharge_processing_payment_intent_missing_expired/);
assert.match(authorizeSource, /readStoredWorkspaceAutoRechargePaymentMethod\(attempt\)/);
assert.match(authorizeSource, /auto_recharge_processing_payment_method_missing/);
assert.match(authorizeSource, /readActiveWorkspaceAutoRechargePaymentMethod/);
assert.match(authorizeSource, /readCanonicalWorkspaceAutoRechargeSettingsRow/);
assert.match(authorizeSource, /computeWorkspaceAutoRechargeAttemptPlan/);
assert.match(authorizeSource, /plan\.reason === "skip_no_card"/);
assert.match(authorizeSource, /auto_recharge_card_required/);
assert.match(authorizeSource, /markWorkspaceAutoRechargeAttemptReleasedFromMutation/);
assert.match(authorizeSource, /auto_recharge_plan_changed_before_payment/);
assert.match(authorizeSource, /status: "processing"/);
assert.match(authorizeSource, /providerCustomerId: paymentMethod\.providerCustomerId/);
assert.match(authorizeSource, /providerPaymentMethodId: paymentMethod\.providerPaymentMethodId/);
assert.match(authorizeSource, /disposition: "authorized"/);
assertBefore(
  authorizeSource,
  "disposition: \"reconcile_existing\"",
  "attempt.status === \"processing\"",
  "authorization must preserve existing PaymentIntent reconciliation before retry policy",
);

assert.match(executorSource, /prepareWorkspaceAutoRechargeAttemptInternal/);
assert.match(executorSource, /disposition === "skipped"/);
assert.match(executorSource, /getStripeClient\(\)/);
assert.match(executorSource, /stripe\.paymentIntents\.retrieve\(existingPaymentIntentId\)/);
assert.match(
  executorSource,
  /stripe\.paymentIntents\.retrieve\(existingPaymentIntentId\)[\s\S]*catch \(error\)[\s\S]*providerPaymentId: existingPaymentIntentId[\s\S]*failureReason: readStripeErrorCode\(error\)/,
  "existing PaymentIntent retrieval failures must return a retryable result with the provider id",
);
assert.match(executorSource, /attempt\.status === "processing"/);
assert.match(executorSource, /isWorkspaceAutoRechargeProcessingWithoutPaymentIdStale\(attempt, nowMs\)/);
assert.match(executorSource, /disposition: "needs_reconciliation"/);
assert.match(executorSource, /auto_recharge_processing_payment_intent_missing/);
assert.match(executorSource, /authorizeWorkspaceAutoRechargeAttemptPaymentInternal/);
assert.match(executorSource, /authorization\?\.disposition === "reconcile_existing"/);
assert.match(executorSource, /authorization\?\.disposition !== "authorized"/);
assert.match(executorSource, /auto_recharge_authorized_payment_method_missing/);
assert.match(
  executorSource,
  /attempt\.status === "processing"[\s\S]*&& !isWorkspaceAutoRechargeProcessingWithoutPaymentIdStale\(attempt, nowMs\)[\s\S]*disposition: "needs_reconciliation"/,
  "fresh processing/no-payment-id attempts must still require reconciliation",
);
assertBefore(
  executorSource,
  'disposition: "needs_reconciliation"',
  "authorizeWorkspaceAutoRechargeAttemptPaymentInternal",
  "executor must reject fresh processing/no-payment-id attempts before authorization",
);
assertBefore(
  executorSource,
  "authorizeWorkspaceAutoRechargeAttemptPaymentInternal",
  "stripe.paymentIntents.create",
  "executor must authorize the attempt phase boundary before creating a PaymentIntent",
);
assertBefore(
  executorSource,
  'authorization?.disposition !== "authorized"',
  "stripe.paymentIntents.create",
  "executor must return non-authorized attempts before creating a PaymentIntent",
);
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
assert.match(executorSource, /idempotencyKey: authorizedIdempotencyKey/);
assert.match(executorSource, /let createdPaymentIntent: any \| null = null/);
assert.match(executorSource, /createdPaymentIntent = paymentIntent/);
assert.match(executorSource, /const createdPaymentIntentId = normalizeStripePaymentIntentId\(paymentIntent\?\.id\)/);
assert.match(executorSource, /providerCustomerId,\s*\n\s*providerPaymentMethodId,/);
assert.match(executorSource, /providerPaymentId: createdPaymentIntentId/);
const createSourceStart = executorSource.indexOf("stripe.paymentIntents.create");
assert.notEqual(createSourceStart, -1, "executor must create a Stripe PaymentIntent");
const createSource = executorSource.slice(createSourceStart);
assertBefore(
  createSource,
  "providerPaymentId: createdPaymentIntentId",
  "return await finalizeWorkspaceAutoRechargePaymentIntent",
  "executor must persist provider PaymentIntent id before finalizing credits",
);
assert.match(executorSource, /readStripeErrorPaymentIntent\(error\) \?\? createdPaymentIntent/);
assert.match(executorSource, /authentication_required/);
assert.match(executorSource, /card_declined/);
assert.match(executorSource, /retry_later/);

assert.match(workspaceCreditsSource, /scheduleWorkspaceAutoRechargeAfterSettlementBestEffort/);
assert.match(
  workspaceCreditsSource,
  /query\("workspaceAutoRechargeSettings"\)[\s\S]*withIndex\("by_user"[\s\S]*settings\.enabled !== true \|\| settings\.status !== "active"[\s\S]*getSpendableWorkspaceToolBalanceCredits[\s\S]*getUncollectedWorkspaceToolBalanceCredits[\s\S]*getPendingCardCollectionWorkspaceToolBalanceCredits[\s\S]*ctx\.scheduler\.runAfter/,
  "settlement scheduler must be conditional on active settings and current clean low balance",
);
assert.match(
  workspaceCreditsSource,
  /if \(args\.status === "succeeded"\)[\s\S]*scheduleWorkspaceAutoRechargeAfterSettlementBestEffort\(ctx, entry\.userId, nowMs\)/,
  "settlement must schedule auto recharge only after terminal succeeded settlement work",
);
assert.doesNotMatch(
  workspaceCreditsSource,
  /recordSettledPaidToolPartnerCommission|recordPaidToolUsagePartnerCommission/,
  "workspace credit settlement must not create Builder Partner commissions",
);
assert.match(
  cronsSource,
  /execute workspace auto recharge[\s\S]*minutes: 15[\s\S]*workspaceAutoRecharge\.sweepWorkspaceAutoRechargeExecutionsInternal[\s\S]*limit: 20/,
  "cron must run the bounded workspace auto recharge sweep",
);

console.log("workspace_auto_recharge_executor_proof: ok");
