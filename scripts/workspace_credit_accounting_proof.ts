import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();

async function readRepoFile(relativePath: string): Promise<string> {
  return await readFile(path.join(rootDir, relativePath), "utf8");
}

async function proveWorkspaceCreditAccountingContract() {
  const schemaSource = await readRepoFile("convex/schema.ts");
  const sharedCreditsSource = await readRepoFile("shared/workspaceCredits.ts");
  const creditsSource = await readRepoFile("convex/workspaceCredits.ts");
  const daytonaSessionSource = await readRepoFile("convex/daytonaWorkspaceSession.ts");
  const backgroundServiceSource = await readRepoFile("convex/workspaceTerminalBackgroundService.ts");
  const orphanReconcilerSource = await readRepoFile("convex/daytonaOrphanReconciler.ts");
  const httpDaytonaSource = await readRepoFile("convex/httpDaytona.ts");
  const httpVoiceSource = await readRepoFile("convex/httpVoice.ts");
  const runtimeSessionSource = await readRepoFile("convex/runtimeExecutionSession.ts");
  const cronsSource = await readRepoFile("convex/crons.ts");
  const accountSource = await readRepoFile("convex/account.ts");
  const voiceControllerSource = await readRepoFile("shared/useWebVoiceInputController.ts");
  const appSource = await readRepoFile("apps/web/src/App.tsx");

  assert.match(
    schemaSource,
    /creditReservationKey:\s*v\.optional\(v\.string\(\)\)/,
    "expected workspace compute charges to retain the source credit reservation key",
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
    /DAYTONA_WORKSPACE_SESSION_BUDGET_SECONDS\s*=\s*60\s*\*\s*60/,
    "expected Daytona runtime budget to be explicitly duration based",
  );
  assert.match(
    sharedCreditsSource,
    /BUILDER_INCLUDED_WORKSPACE_CREDITS\s*=\s*0/,
    "expected free-builder default to include no paid-tool credits",
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
    /DAYTONA_WORKSPACE_SESSION_RESERVE_SECONDS\s*=[\s\S]*DAYTONA_WORKSPACE_SESSION_BUDGET_SECONDS\s*\+[\s\S]*DAYTONA_WORKSPACE_SESSION_STOP_GRACE_SECONDS/,
    "expected Daytona reservations to cover the runtime budget plus cleanup grace",
  );
  assert.match(
    sharedCreditsSource,
    /export function estimateDaytonaWorkspaceReservationCredits/,
    "expected a shared Daytona reservation estimator",
  );
  assert.match(
    sharedCreditsSource,
    /PAID_TOOL_TARGET_GROSS_MARGIN_BPS\s*=\s*5000/,
    "expected paid tools to target 50% gross margin",
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
  assert.doesNotMatch(
    creditsSource,
    /readStripeWorkspaceCreditTopupPriceId/,
    "workspace tool balance top-ups should not depend on one static Stripe price id",
  );

  assert.match(
    daytonaSessionSource,
    /reserveCreditsInternal[\s\S]*ensureCloudProjectVolume[\s\S]*executeDaytonaProbeToolCall/,
    "expected temporary Daytona sessions to reserve credits before provider volume or sandbox creation",
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
    /priceDaytonaWorkspaceUsageCredits\(\{\s*computeCostUsd\s*\}\)/,
    "expected background Daytona sandboxes to settle usage at margin-aware credit pricing",
  );
  assert.match(
    orphanReconcilerSource,
    /creditBudgetExpiresAt[\s\S]*terminalRows\.some\(\(row\) => isActiveTerminalStatus\(row\.status\)\) &&\s*!budgetExpired/,
    "expected the orphan reconciler to stop budget-expired background sandboxes even with active terminals",
  );
  assert.match(
    orphanReconcilerSource,
    /priceDaytonaWorkspaceUsageCredits\(\{\s*computeCostUsd\s*\}\)/,
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
    voiceControllerSource,
    /onToolBalanceRequired\?:[\s\S]*isToolBalanceError[\s\S]*args\.onToolBalanceRequired\?\.\(surface,\s*message\)/,
    "expected voice input to surface exhausted tool balance through the add-balance modal path",
  );
  assert.match(
    appSource,
    /onToolBalanceRequired:[\s\S]*setInferenceIssueModal\(\{[\s\S]*reason:\s*"workspace_credits"/,
    "expected voice input tool-balance failures to open the workspace issue modal",
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
