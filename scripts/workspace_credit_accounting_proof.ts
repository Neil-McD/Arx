import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();

async function readRepoFile(relativePath: string): Promise<string> {
  return await readFile(path.join(rootDir, relativePath), "utf8");
}

function sliceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `expected source to include ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `expected source to include ${endNeedle}`);
  return source.slice(start, end);
}

async function proveWorkspaceCreditAccountingContract() {
  const schemaSource = await readRepoFile("convex/schema.ts");
  const authSource = await readRepoFile("convex/auth.ts");
  const sharedCreditsSource = await readRepoFile("shared/workspaceCredits.ts");
  const creditsSource = await readRepoFile("convex/workspaceCredits.ts");
  const daytonaSessionSource = await readRepoFile("convex/daytonaWorkspaceSession.ts");
  const backgroundServiceSource = await readRepoFile("convex/workspaceTerminalBackgroundService.ts");
  const orphanReconcilerSource = await readRepoFile("convex/daytonaOrphanReconciler.ts");
  const httpDaytonaSource = await readRepoFile("convex/httpDaytona.ts");
  const httpVoiceSource = await readRepoFile("convex/httpVoice.ts");
  const stripeCoreSource = await readRepoFile("convex/stripeCore.ts");
  const runtimeSessionSource = await readRepoFile("convex/runtimeExecutionSession.ts");
  const runtimeKernelSource = await readRepoFile("shared/runtimeKernel.ts");
  const runtimeTurnHandlersSource = await readRepoFile("convex/runtimeTurnHandlers.ts");
  const cronsSource = await readRepoFile("convex/crons.ts");
  const accountSource = await readRepoFile("convex/account.ts");
  const authCoreSource = await readRepoFile("shared/authCore.ts");
  const voiceControllerSource = await readRepoFile("shared/useWebVoiceInputController.ts");
  const turnRunnerSource = await readRepoFile("shared/useWebTurnRunnerController.ts");
  const appSource = await readRepoFile("apps/web/src/App.tsx");
  const inferenceIssueModalSource = await readRepoFile("apps/web/src/components/WebInferenceIssueModal.tsx");
  const billingEntitlementsDoc = await readRepoFile("docs/product/reference/billing-entitlements.md");
  const authMoneyAccessDoc = await readRepoFile("docs/auth-money-access-matrix.md");

  assert.match(
    schemaSource,
    /creditReservationKey:\s*v\.optional\(v\.string\(\)\)/,
    "expected workspace compute charges to retain the source credit reservation key",
  );
  assert.match(
    schemaSource,
    /debitSource:\s*v\.union\([\s\S]*v\.literal\("included"\)[\s\S]*v\.literal\("purchased"\)[\s\S]*v\.literal\("mixed"\)[\s\S]*v\.literal\("unbilled"\)/,
    "expected compute charges to distinguish unbilled usage from included balance",
  );
  assert.match(
    schemaSource,
    /creditsSettled:\s*v\.optional\(v\.number\(\)\)/,
    "expected credit ledger entries to distinguish reserved from settled credits",
  );
  assert.match(
    schemaSource,
    /includedCycleStartedAt:\s*v\.optional\(v\.number\(\)\)[\s\S]*includedCycleEndsAt:\s*v\.optional\(v\.number\(\)\)/,
    "expected credit ledger entries to remember the included-credit cycle they debited",
  );
  assert.match(
    schemaSource,
    /\.index\("by_status_expiresAt",\s*\["status",\s*"expiresAt"\]\)/,
    "expected expired reservations to be queryable by status and expiry",
  );
  assert.match(
    schemaSource,
    /providerSandboxCreditReservationKey:\s*v\.optional\(v\.string\(\)\)/,
    "expected background sandboxes to persist their credit reservation key",
  );

  assert.match(
    sharedCreditsSource,
    /DAYTONA_WORKSPACE_SESSION_HOLD_SECONDS\s*=\s*60/,
    "expected Daytona computer reservations to use only a small one-minute hold",
  );
  assert.match(
    sharedCreditsSource,
    /DAYTONA_WORKSPACE_SESSION_MAX_SECONDS\s*=\s*30\s*\*\s*60/,
    "expected Daytona computer runtime to have a bounded 30-minute hard-stop window",
  );
  assert.match(
    sharedCreditsSource,
    /DAYTONA_WORKSPACE_SESSION_IDLE_AUTOSTOP_MINUTES\s*=\s*15/,
    "expected Daytona provider auto-stop to remain enabled as a backstop",
  );
  assert.match(
    sharedCreditsSource,
    /DEFAULT_INCLUDED_TOOL_CREDITS\s*=\s*0/,
    "expected free-account default to include no paid-tool credits",
  );
  assert.doesNotMatch(
    sharedCreditsSource,
    /BUILDER_INCLUDED_WORKSPACE_CREDITS/,
    "default included tool credits must not carry legacy Builder plan naming",
  );
  assert.match(
    sharedCreditsSource,
    /WORKSPACE_TOOL_BALANCE_TOPUP_PACKS[\s\S]*priceUsd:\s*5[\s\S]*priceUsd:\s*10[\s\S]*priceUsd:\s*20[\s\S]*recommended:\s*true[\s\S]*priceUsd:\s*50/,
    "expected tool balance to expose fixed dollar top-up packs with a recommended $20 pack",
  );
  assert.match(
    sharedCreditsSource,
    /export function resolveWorkspaceToolBalanceTopupPack/,
    "expected top-up pack resolution to live in shared server-controlled pricing code",
  );
  assert.match(
    sharedCreditsSource,
    /export function formatWorkspaceToolBalanceUsdFromCredits/,
    "expected user-facing tool balance to display dollars while retaining internal credit units",
  );
  assert.match(
    sharedCreditsSource,
    /DAYTONA_WORKSPACE_SESSION_RESERVATION_EXPIRY_MS\s*=[\s\S]*DAYTONA_WORKSPACE_SESSION_MAX_SECONDS\s*\+\s*5\s*\*\s*60/,
    "expected Daytona reservations to expire shortly after the hard runtime window",
  );
  assert.doesNotMatch(
    sharedCreditsSource,
    /DAYTONA_WORKSPACE_SESSION_BUDGET_SECONDS|DAYTONA_WORKSPACE_SESSION_STOP_GRACE_SECONDS|DAYTONA_WORKSPACE_SESSION_RESERVE_SECONDS/,
    "Daytona computer billing must not keep the old 60-minute-plus-grace reservation model",
  );
  assert.match(
    sharedCreditsSource,
    /export function estimateDaytonaWorkspaceReservationCredits/,
    "expected a shared Daytona reservation estimator",
  );
  assert.match(
    sharedCreditsSource,
    /export function isWorkspaceCreditsExhaustedError[\s\S]*credits_exhausted/,
    "expected wrapped Convex reservation errors to normalize exhausted balance instead of becoming unavailable balance",
  );
  for (const [label, source] of [
    ["daytona session", daytonaSessionSource],
    ["background sandbox", backgroundServiceSource],
    ["web research", httpDaytonaSource],
    ["voice input", httpVoiceSource],
  ] as const) {
    assert.match(
      source,
      /isWorkspaceCreditsExhaustedError\(error\)/,
      `expected ${label} balance failures to use wrapped-error credit exhaustion normalization`,
    );
    assert.doesNotMatch(
      source,
      /message\s*===\s*"credits_exhausted"/,
      `expected ${label} balance failures not to rely on exact Convex error messages`,
    );
  }
  assert.match(
    sharedCreditsSource,
    /PAID_TOOL_TARGET_GROSS_MARGIN_BPS\s*=\s*6000/,
    "expected paid tools to target 60% gross margin",
  );
  assert.match(
    authSource,
    /platformFeeBps:\s*1500/,
    "expected free-account paid community revenue to use a 15% platform fee",
  );
  assert.match(
    billingEntitlementsDoc,
    /default platform fee for free-account community revenue is 15%/,
    "expected billing docs to describe the current 15% platform fee",
  );
  assert.match(
    authMoneyAccessDoc,
    /default 15% Polynet platform fee/,
    "expected auth-money matrix to describe the current 15% platform fee",
  );
  assert.match(
    billingEntitlementsDoc,
    /targets 60% gross margin/,
    "expected billing docs to describe the current 60% paid-tool margin target",
  );
  assert.match(
    sharedCreditsSource,
    /priceUsdForTargetGrossMargin[\s\S]*rawVendorCostUsd\s*\/\s*\(1\s*-\s*marginRate\)/,
    "expected paid-tool pricing to calculate customer price from gross margin, not markup",
  );
  assert.match(
    sharedCreditsSource,
    /export function priceDaytonaWorkspaceUsageCredits/,
    "expected Daytona usage to have a shared margin-aware credit price helper",
  );
  assert.match(
    sharedCreditsSource,
    /export function priceFixedPaidToolCredits[\s\S]*Math\.max\(params\.minimumCredits,\s*marginAwareCredits\)/,
    "expected fixed-tariff paid tools to floor at a simple credit price while preserving margin-aware estimates",
  );
  assert.match(
    sharedCreditsSource,
    /export function priceWebResearchCredits/,
    "expected web research to have a shared credit pricing helper",
  );
  assert.match(
    sharedCreditsSource,
    /export function priceVoiceTranscriptionCredits/,
    "expected voice transcription to have a shared credit pricing helper",
  );

  assert.match(
    creditsSource,
    /expiresAt:\s*[\s\S]*CREDIT_RESERVATION_EXPIRY_MS/,
    "expected reserved credits to receive an expiry deadline",
  );
  assert.match(
    creditsSource,
    /export const settleCreditsInternal[\s\S]*creditsSettled/,
    "expected credit settlement to support partial settlement",
  );
  assert.match(
    creditsSource,
    /export const reconcileExpiredCreditReservationsInternal/,
    "expected stranded reservations to have a durable reconciliation path",
  );
  assert.match(
    creditsSource,
    /reservation\?\.status === "reserved"[\s\S]*ctx\.db\.patch\(reservation\._id,\s*\{[\s\S]*status:\s*"succeeded"/,
    "expected compute charges to atomically settle reserved credits before recording usage",
  );
  assert.match(
    creditsSource,
    /reservation\?\.status === "succeeded"/,
    "expected compute charges to remain idempotent for already-settled reservations",
  );
  assert.match(
    creditsSource,
    /debitedCredits <= 0[\s\S]*\? "unbilled"/,
    "expected zero-debit compute charges to be labeled as unbilled",
  );
  assert.match(
    creditsSource,
    /canRefundIncludedCreditsForEntry[\s\S]*includedCycleStartedAt[\s\S]*includedCycleEndsAt/,
    "expected included-credit refunds to be cycle-aware",
  );
  assert.match(
    creditsSource,
    /includedCycleStartedAt:[\s\S]*balance\.includedCycleStartedAt[\s\S]*includedCycleEndsAt:[\s\S]*balance\.includedCycleEndsAt/,
    "expected reservations to persist the active included-credit cycle",
  );
  assert.match(
    creditsSource,
    /startWorkspaceCreditTopupCheckout[\s\S]*packId:\s*v\.optional\(v\.string\(\)\)[\s\S]*resolveWorkspaceToolBalanceTopupPack\(args\.packId\)[\s\S]*workspace_tool_balance_pack_invalid/,
    "expected top-up checkout to accept only server-defined tool-balance pack ids",
  );
  assert.match(
    creditsSource,
    /line_items:[\s\S]*price_data:[\s\S]*unit_amount:\s*Math\.round\(pack\.priceUsd\s*\*\s*100\)/,
    "expected Stripe Checkout top-ups to price fixed dollar packs server-side",
  );
  assert.match(
    creditsSource,
    /custom_text:[\s\S]*Tool balance is non-refundable/,
    "expected Stripe Checkout to disclose non-refundable tool balance before payment",
  );
  assert.match(
    creditsSource,
    /metadata:[\s\S]*workspace_tool_balance_pack_id:\s*pack\.id[\s\S]*workspace_tool_balance_usd:\s*String\(pack\.priceUsd\)[\s\S]*workspace_credits_amount:\s*String\(workspaceCreditsAmount\)/,
    "expected top-up metadata to preserve pack id, dollar amount, and internal credit units",
  );
  const workspaceTopupCheckoutBlock = creditsSource.slice(
    creditsSource.indexOf("export const startWorkspaceCreditTopupCheckout = action"),
  );
  assert.doesNotMatch(
    workspaceTopupCheckoutBlock,
    /providerPriceId\s*=\s*pack\.id|providerPriceId,\s*\n/,
    "workspace tool-balance pack ids must not be written into providerPriceId",
  );
  assert.match(
    creditsSource,
    /function normalizeStripePriceId[\s\S]*startsWith\("price_"\)[\s\S]*providerPriceId:\s*normalizeStripePriceId/,
    "workspace credit top-ups must keep providerPriceId reserved for real Stripe price ids",
  );
  assert.doesNotMatch(
    creditsSource,
    /readStripeWorkspaceCreditTopupPriceId/,
    "workspace tool balance top-ups should not depend on one static Stripe price id",
  );
  assert.doesNotMatch(
    stripeCoreSource,
    /STRIPE_WORKSPACE_CREDIT_TOPUP_PRICE_ID|ARX_STRIPE_WORKSPACE_CREDIT_TOPUP_PRICE_ID|WORKSPACE_CREDIT_TOPUP_STRIPE_PRICE_ID|readStripeWorkspaceCreditTopupPriceId/,
    "workspace tool balance top-ups should not keep the deleted static Stripe price helper",
  );

  assert.match(
    daytonaSessionSource,
    /reserveCreditsInternal[\s\S]*ensureCloudProjectVolume[\s\S]*executeDaytonaProbeToolCall/,
    "expected temporary Daytona sessions to reserve credits before provider volume or sandbox creation",
  );
  assert.match(
    daytonaSessionSource,
    /executeDaytonaProbeToolCall\(params:[\s\S]*creditReservationKey\?: string \| null[\s\S]*createDaytonaSandbox\([\s\S]*creditReservationKey: params\.creditReservationKey/,
    "expected temporary Daytona sandbox creation to carry the credit reservation key",
  );
  assert.match(
    daytonaSessionSource,
    /executeDaytonaProbeToolCall\(\{[\s\S]*creditReservationKey,[\s\S]*creditBudgetCredits,[\s\S]*creditBudgetExpiresAt/,
    "expected runtime Daytona sessions to label sandbox instances with reservation budget provenance",
  );
  assert.match(
    daytonaSessionSource,
    /settleCreditsInternal[\s\S]*recordWorkspaceComputeChargeInternal[\s\S]*creditReservationKey/,
    "expected temporary Daytona teardown to settle the reservation before recording the charge",
  );
  assert.match(
    daytonaSessionSource,
    /priceDaytonaWorkspaceUsageCredits\(\{\s*computeCostUsd\s*\}\)/,
    "expected temporary Daytona sessions to settle usage at margin-aware credit pricing",
  );
  assert.match(
    daytonaSessionSource,
    /autoStopInterval:\s*DAYTONA_WORKSPACE_SESSION_IDLE_AUTOSTOP_MINUTES/,
    "expected temporary Daytona sessions to use provider auto-stop",
  );
  assert.match(
    daytonaSessionSource,
    /durationSeconds:\s*DAYTONA_WORKSPACE_SESSION_HOLD_SECONDS/,
    "expected temporary Daytona sessions to reserve only the small hold amount",
  );

  assert.match(
    backgroundServiceSource,
    /reserveCreditsInternal[\s\S]*ensureCloudProjectVolume[\s\S]*createDaytonaSandbox/,
    "expected background Daytona sandboxes to reserve credits before provider volume or sandbox creation",
  );
  assert.match(
    backgroundServiceSource,
    /providerSandboxCreditReservationKey:\s*creditReservationKey/,
    "expected background sandbox reservation keys to be persisted on the project",
  );
  assert.match(
    backgroundServiceSource,
    /BACKGROUND_SANDBOX_BUDGET_EXPIRED_CODE\s*=\s*"background_sandbox_budget_expired"/,
    "expected expired background sandbox budgets to use a distinct internal state code",
  );
  assert.match(
    backgroundServiceSource,
    /creditBudgetExpiresAt[\s\S]*releaseProjectBackgroundSandboxIfIdle[\s\S]*code:\s*BACKGROUND_SANDBOX_BUDGET_EXPIRED_CODE[\s\S]*expired_budget_at:\s*credit\.creditBudgetExpiresAt/,
    "expected expired background sandbox budgets to release stale sandboxes without pretending account balance is exhausted",
  );
  const resolveTerminalSandboxContextBlock = sliceBetween(
    backgroundServiceSource,
    "export async function resolveTerminalSandboxContext",
    "const loadedConfig = loadDaytonaConfig",
  );
  assert.match(
    resolveTerminalSandboxContextBlock,
    /code:\s*BACKGROUND_SANDBOX_BUDGET_EXPIRED_CODE[\s\S]*expired_budget_at:\s*credit\.creditBudgetExpiresAt/,
    "expected expired terminal sandbox budgets to use the distinct expired-budget state code",
  );
  assert.doesNotMatch(
    resolveTerminalSandboxContextBlock,
    /code:\s*"workspace_credits_exhausted"/,
    "expired terminal sandbox budgets should not be reported as exhausted current balance",
  );
  const ensureBackgroundSandboxBlock = sliceBetween(
    backgroundServiceSource,
    "export async function ensureProjectBackgroundSandbox",
    "const clearCreationLease = async () =>",
  );
  assert.doesNotMatch(
    ensureBackgroundSandboxBlock,
    /existing\.code\s*===\s*"workspace_credits_exhausted"[\s\S]*return existing/,
    "background sandbox ensure should not stop after releasing an expired budget when current balance can reserve a fresh sandbox",
  );
  assert.match(
    ensureBackgroundSandboxBlock,
    /if \(existing\.ok\) return existing;[\s\S]*getCloudProjectById/,
    "background sandbox ensure should reuse ready sandboxes, otherwise continue toward fresh creation",
  );
  assert.match(
    backgroundServiceSource,
    /priceDaytonaWorkspaceUsageCredits\(\{\s*computeCostUsd\s*\}\)/,
    "expected background Daytona sandboxes to settle usage at margin-aware credit pricing",
  );
  assert.match(
    backgroundServiceSource,
    /autoStopInterval:\s*DAYTONA_WORKSPACE_SESSION_IDLE_AUTOSTOP_MINUTES/,
    "expected background Daytona sandboxes to use provider auto-stop",
  );
  assert.match(
    backgroundServiceSource,
    /durationSeconds:\s*DAYTONA_WORKSPACE_SESSION_HOLD_SECONDS/,
    "expected background Daytona sandboxes to reserve only the small hold amount",
  );
  assert.match(
    orphanReconcilerSource,
    /readSandboxCreditReservation[\s\S]*arx_credit_reservation_key[\s\S]*arx_credit_budget_credits[\s\S]*arx_credit_budget_expires_at/,
    "expected orphan reconciliation to recover runtime sandbox credit reservation labels",
  );
  assert.match(
    orphanReconcilerSource,
    /priceCreditsWithinBudget[\s\S]*settleReservedCreditsBestEffort\(\{[\s\S]*creditKey: backgroundCredit\.creditReservationKey[\s\S]*recordWorkspaceComputeChargeInternal/,
    "expected orphan reconciliation to settle the original reservation before recording compute evidence",
  );
  assert.match(
    orphanReconcilerSource,
    /creditBudgetExpiresAt[\s\S]*terminalRows\.some\(\(row\) => isActiveTerminalStatus\(row\.status\)\) &&\s*!budgetExpired/,
    "expected the orphan reconciler to stop budget-expired background sandboxes even with active terminals",
  );
  assert.match(
    orphanReconcilerSource,
    /priceCreditsWithinBudget[\s\S]*priceDaytonaWorkspaceUsageCredits\(\{[\s\S]*computeCostUsd: params\.computeCostUsd/,
    "expected orphan Daytona cleanup to settle usage at margin-aware credit pricing",
  );

  assert.match(
    httpDaytonaSource,
    /buildWorkspaceCreditBudgetSignal/,
    "expected Daytona tool calls to receive a budget deadline abort signal",
  );
  assert.match(
    runtimeSessionSource,
    /buildWorkspaceCreditBudgetSignal/,
    "expected computer-use tool calls to receive a budget deadline abort signal",
  );
  assert.match(
    httpDaytonaSource,
    /web_research[\s\S]*reserveCreditsInternal[\s\S]*executeWebResearch[\s\S]*settleReservedCreditsStrict/,
    "expected successful web research to reserve and then strictly settle credits",
  );
  assert.match(
    httpDaytonaSource,
    /priceWebResearchCredits\(webResearchAction\)[\s\S]*rawVendorCostUsd:\s*webResearchVendorCostUsd[\s\S]*polynetPriceUsd:\s*creditsToUsd\(webResearchCredits\)/,
    "expected web research to use shared margin-aware fixed-tool pricing with ledger cost evidence",
  );
  const webResearchReservationBlock = sliceBetween(
    httpDaytonaSource,
    'if (params.toolName === "web_research")',
    "let result:",
  );
  assert.doesNotMatch(
    webResearchReservationBlock,
    /\bquery\s*:/,
    "web research credit ledger metadata must not store raw query text",
  );
  assert.doesNotMatch(
    webResearchReservationBlock,
    /\burl\s*:/,
    "web research credit ledger metadata must not store raw URLs",
  );
  assert.match(
    httpVoiceSource,
    /reservedCreditKey[\s\S]*reserveCreditsInternal[\s\S]*primary\.ok[\s\S]*settleReservedCreditsStrict[\s\S]*fallback\.ok[\s\S]*settleReservedCreditsStrict/,
    "expected successful voice transcription to reserve and then strictly settle credits",
  );
  assert.match(
    httpVoiceSource,
    /priceVoiceTranscriptionCredits\(\{[\s\S]*audioBytes:\s*bytes\.byteLength[\s\S]*rawVendorCostUsd:\s*voiceVendorCostUsd[\s\S]*polynetPriceUsd:\s*creditsToUsd\(voiceCredits\)/,
    "expected voice transcription to use shared margin-aware fixed-tool pricing with ledger cost evidence",
  );
  assert.match(
    httpVoiceSource,
    /tool_kind:\s*"voice_input"[\s\S]*required_credits:\s*voiceCredits/,
    "expected voice input balance failures to identify voice_input and required credits",
  );
  assert.match(
    authCoreSource,
    /VoiceTranscriptionRequestError[\s\S]*toolKind:[\s\S]*requiredCredits:[\s\S]*readVoiceTranscriptionRequestError[\s\S]*tool_kind[\s\S]*required_credits/,
    "expected voice transcription client errors to preserve paid-tool metadata",
  );
  assert.match(
    httpDaytonaSource,
    /tool_kind:\s*"web_research"[\s\S]*required_credits:\s*webResearchCredits/,
    "expected web research balance failures to identify web_research and required credits",
  );
  assert.match(
    daytonaSessionSource,
    /tool_kind:\s*"workspace_tools"[\s\S]*required_credits:\s*creditBudgetCredits/,
    "expected workspace tool balance failures to identify workspace_tools and required credits",
  );
  assert.match(
    voiceControllerSource,
    /onToolBalanceRequired\?:[\s\S]*details\?:\s*VoiceToolBalanceDetails[\s\S]*VoiceTranscriptionRequestError[\s\S]*args\.onToolBalanceRequired\?\.\(surface,\s*message,\s*details\)/,
    "expected voice input to surface exhausted tool balance metadata through the add-balance modal path",
  );
  assert.match(
    appSource,
    /onToolBalanceRequired:[\s\S]*setInferenceIssueModal\(\{[\s\S]*reason:\s*"workspace_credits"[\s\S]*toolKind:\s*details\?\.toolKind\s*\?\?\s*"voice_input"[\s\S]*requiredCredits:\s*details\?\.requiredCredits\s*\?\?\s*null/,
    "expected voice input tool-balance failures to open the workspace issue modal with metadata",
  );
  assert.match(
    runtimeKernelSource,
    /normalizeToolBalanceTerminalCode[\s\S]*credits_exhausted[\s\S]*workspace_credits_exhausted[\s\S]*tool_error_unrecoverable/,
    "expected agent-called paid-tool balance failures to stop as typed workspace-credit errors",
  );
  assert.match(
    runtimeTurnHandlersSource,
    /event:\s*"error"[\s\S]*code:\s*loopResult\.code[\s\S]*message:\s*loopResult\.message[\s\S]*status:\s*loopResult\.status/,
    "expected streaming runtime paid-tool failures to send typed error data to the UI",
  );
  assert.match(
    turnRunnerSource,
    /classifyCloudFunctionErrorCategory[\s\S]*category === "workspace_credits"[\s\S]*setInferenceIssueModal/,
    "expected streamed workspace-credit errors to open the add-balance modal",
  );
  assert.match(
    inferenceIssueModalSource,
    /workspace_tools[\s\S]*paid sandbox compute/,
    "expected the add-balance modal to explain why workspace tools need balance",
  );
  assert.match(
    inferenceIssueModalSource,
    /web_research[\s\S]*paid provider calls/,
    "expected the add-balance modal to explain why web research needs balance",
  );
  assert.match(
    inferenceIssueModalSource,
    /voice_input[\s\S]*paid transcription/,
    "expected the add-balance modal to explain why each paid tool kind needs balance",
  );
  assert.doesNotMatch(
    httpDaytonaSource,
    /status:\s*"succeeded"[\s\S]{0,240}settleReservedCreditsBestEffort/,
    "successful web research settlement must not be best-effort",
  );
  assert.doesNotMatch(
    httpVoiceSource,
    /status:\s*"succeeded"[\s\S]{0,240}settleReservedCreditsBestEffort/,
    "successful voice settlement must not be best-effort",
  );
  assert.match(
    cronsSource,
    /reconcileExpiredCreditReservationsInternal/,
    "expected expired credit reservation reconciliation to be scheduled",
  );
  assert.match(
    accountSource,
    /creditLedgerEntries[\s\S]*by_user_createdAt[\s\S]*userId/,
    "expected account deletion to remove user-scoped credit ledger rows",
  );

  console.log("PASS: workspace credit accounting contract is wired correctly");
}

await proveWorkspaceCreditAccountingContract();
