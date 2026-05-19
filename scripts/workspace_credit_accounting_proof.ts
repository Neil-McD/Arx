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

function assertSourceOrder(source: string, firstNeedle: string, secondNeedle: string, message: string) {
  const first = source.indexOf(firstNeedle);
  const second = source.indexOf(secondNeedle);
  assert.notEqual(first, -1, `expected source to include ${firstNeedle}`);
  assert.notEqual(second, -1, `expected source to include ${secondNeedle}`);
  assert.ok(first < second, message);
}

async function proveWorkspaceCreditAccountingContract() {
  const schemaSource = await readRepoFile("convex/schema.ts");
  const authSource = await readRepoFile("convex/auth.ts");
  const sharedCreditsSource = await readRepoFile("shared/workspaceCredits.ts");
  const workspaceCreditsGatewaySource = await readRepoFile("shared/workspaceCreditsGateway.ts");
  const creditsSource = await readRepoFile("convex/workspaceCredits.ts");
  const daytonaSessionSource = await readRepoFile("convex/daytonaWorkspaceSession.ts");
  const backgroundServiceSource = await readRepoFile("convex/workspaceTerminalBackgroundService.ts");
  const workspaceCreditSettlementSource = await readRepoFile("convex/workspaceCreditSettlement.ts");
  const orphanReconcilerSource = await readRepoFile("convex/daytonaOrphanReconciler.ts");
  const httpDaytonaSource = await readRepoFile("convex/httpDaytona.ts");
  const httpBillingSource = await readRepoFile("convex/httpBilling.ts");
  const httpVoiceSource = await readRepoFile("convex/httpVoice.ts");
  const webResearchToolsSource = await readRepoFile("convex/webResearchTools.ts");
  const xAiSearchTransportSource = await readRepoFile("convex/xAiSearchTransport.ts");
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
  const webAgentSettingsSource = await readRepoFile("apps/web/src/components/WebAgentSettingsSection.tsx");
  const workspaceUserPanelSource = await readRepoFile("apps/web/src/components/WebWorkspaceUserDataPanel.tsx");
  const inferenceIssueModalSource = await readRepoFile("apps/web/src/components/WebInferenceIssueModal.tsx");
  const billingEntitlementsDoc = await readRepoFile("docs/product/reference/billing-entitlements.md");
  const authMoneyAccessDoc = await readRepoFile("docs/auth-money-access-matrix.md");
  const reserveCreditsBlock = sliceBetween(
    creditsSource,
    "export const reserveCreditsInternal",
    "export const settleCreditsInternal",
  );
  const settleCreditsBlock = sliceBetween(
    creditsSource,
    "export const settleCreditsInternal",
    "export const reconcileExpiredCreditReservationsInternal",
  );
  const topupCompletionBlock = sliceBetween(
    creditsSource,
    "export const completeWorkspaceCreditTopupCheckoutSessionInternal",
    "export const recordWorkspaceComputeChargeInternal",
  );
  const pendingTopupCreationBlock = sliceBetween(
    creditsSource,
    "export const createPendingWorkspaceCreditTopupCheckoutSessionInternal",
    "export const attachWorkspaceCreditTopupStripeCheckoutSessionInternal",
  );
  const operatorDiagnosticsBlock = sliceBetween(
    creditsSource,
    "export const getWorkspaceToolCreditDiagnosticsForOperator",
    "export const repairDuplicateWorkspaceCreditBalancesInternal",
  );
  const settlementCallSiteSources = [
    daytonaSessionSource,
    backgroundServiceSource,
    httpDaytonaSource,
    httpVoiceSource,
  ].join("\n");

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
    /workspaceCreditBalances:[\s\S]*uncollectedCreditsBalance:\s*v\.optional\(v\.number\(\)\)/,
    "expected workspace credit balances to track uncollected paid-tool overage",
  );
  assert.match(
    schemaSource,
    /workspaceCreditBalances:[\s\S]*\.index\("by_updatedAt",\s*\["updatedAt"\]\)/,
    "expected operator accounting diagnostics to scan recent materialized balance rows efficiently",
  );
  assert.match(
    schemaSource,
    /checkoutSessions:[\s\S]*workspaceCreditsUncollectedPaid:\s*v\.optional\(v\.number\(\)\)/,
    "expected tool-balance top-ups to preserve how much payment cleared uncollected usage",
  );
  assert.match(
    schemaSource,
    /pendingSettlementStatus:\s*v\.optional\(v\.literal\("succeeded"\)\)[\s\S]*pendingCreditsSettled:\s*v\.optional\(v\.number\(\)\)[\s\S]*pendingSettlementNextAttemptAt:\s*v\.optional\(v\.number\(\)\)/,
    "expected credit ledger entries to retain durable pending settlement recovery state",
  );
  assert.doesNotMatch(
    schemaSource,
    /pendingSettlementStatus:[\s\S]{0,180}v\.literal\("refunded"\)/,
    "pending settlement recovery is only for provider-success usage, not refund retries",
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
    /\.index\("by_pendingSettlementStatus_nextAttemptAt",\s*\["pendingSettlementStatus",\s*"pendingSettlementNextAttemptAt"\]\)/,
    "expected pending settlement retries to be queryable by next attempt",
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
    "expected Daytona computer runtime to have a bounded hard-stop window",
  );
  assert.match(
    sharedCreditsSource,
    /DAYTONA_WORKSPACE_SESSION_IDLE_AUTOSTOP_MINUTES\s*=\s*15/,
    "expected Daytona computers to restore provider auto-stop instead of running indefinitely",
  );
  assert.doesNotMatch(
    sharedCreditsSource,
    /DAYTONA_WORKSPACE_SESSION_BUDGET_SECONDS|DAYTONA_WORKSPACE_SESSION_STOP_GRACE_SECONDS|DAYTONA_WORKSPACE_SESSION_RESERVE_SECONDS/,
    "Daytona computer billing must not keep the old 60-minute-plus-grace reservation model",
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
    /export function getSpendableWorkspaceToolBalanceCredits[\s\S]*includedCreditsBalance[\s\S]*purchasedCreditsBalance/,
    "expected spendable tool balance display math to be centralized",
  );
  assert.match(
    sharedCreditsSource,
    /export function getUncollectedWorkspaceToolBalanceCredits[\s\S]*uncollectedCreditsBalance/,
    "expected uncollected paid-tool balance display math to be centralized",
  );
  assert.match(
    workspaceCreditsGatewaySource,
    /uncollectedCreditsBalance:\s*number[\s\S]*uncollectedCreditsBalance:\s*normalizeNumber\(value\.uncollectedCreditsBalance\)/,
    "expected the canonical frontend balance DTO to carry uncollected paid-tool usage",
  );
  assert.match(
    workspaceCreditsGatewaySource,
    /spendableCreditsBalance:\s*number[\s\S]*client\.query\("workspaceCredits:getWorkspaceToolBalance"/,
    "expected frontend balance loading to use the server-owned tool-balance projection",
  );
  assert.match(
    sharedCreditsSource,
    /estimateDaytonaWorkspaceReservationCredits[\s\S]*DAYTONA_WORKSPACE_SESSION_HOLD_SECONDS/,
    "expected Daytona reservations to be priced from the small hold window",
  );
  assert.doesNotMatch(
    sharedCreditsSource,
    /return Math\.max\(1,\s*ceilCredits\(credits\)\)/,
    "Daytona reservations must not force an arbitrary one-credit minimum",
  );
  assert.match(
    sharedCreditsSource,
    /export function estimateDaytonaWorkspaceReservationCredits/,
    "expected a shared Daytona reservation estimator",
  );
  assert.match(
    sharedCreditsSource,
    /PAID_TOOL_TARGET_GROSS_MARGIN_BPS\s*=\s*6000/,
    "expected paid tools to target 60% gross margin",
  );
  assert.match(
    sharedCreditsSource,
    /WORKSPACE_TOOL_BALANCE_TOPUP_CHECKOUT_TTL_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/,
    "expected tool-balance checkouts to use Stripe's 24-hour checkout window",
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
    sharedCreditsSource,
    /OPENAI_VOICE_TRANSCRIPTION_USD_PER_MINUTE_BY_MODEL[\s\S]*gpt-4o-mini-transcribe[\s\S]*GROQ_VOICE_TRANSCRIPTION_USD_PER_HOUR_BY_MODEL[\s\S]*whisper-large-v3-turbo/,
    "expected voice transcription pricing to be provider/model duration based",
  );
  assert.doesNotMatch(
    sharedCreditsSource,
    /VOICE_TRANSCRIPTION_CREDITS_PER_REQUEST|VOICE_TRANSCRIPTION_VENDOR_COST_ESTIMATE_USD_PER_MEGABYTE/,
    "voice transcription billing must not keep request or byte-size floors",
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
    reserveCreditsBlock,
    /readUncollectedCreditsBalance\(balance\)\s*>\s*0[\s\S]*throw new Error\("credits_exhausted"\)/,
    "expected outstanding uncollected paid-tool usage to block new paid-tool reservations",
  );
  assert.match(
    topupCompletionBlock,
    /uncollectedCreditsPaid[\s\S]*purchasedCreditsGranted[\s\S]*uncollectedCreditsBalance/,
    "expected workspace credit top-ups to clear uncollected paid-tool usage before adding spendable balance",
  );
  assert.match(
    topupCompletionBlock,
    /let uncollectedCreditsPaid = 0[\s\S]*workspaceCreditsUncollectedPaid:\s*roundCredits\(uncollectedCreditsPaid\)/,
    "expected workspace credit top-ups to store uncollected-usage allocation evidence for balance replay",
  );
  assert.match(
    settleCreditsBlock,
    /requestedCreditsSettled[\s\S]*uncollectedCredits[\s\S]*addUncollectedWorkspaceCredits[\s\S]*requested_credits_settled[\s\S]*collected_credits_settled[\s\S]*uncollected_credits/,
    "expected credit settlement to record requested, collected, and uncollected usage truth",
  );
  assert.doesNotMatch(
    settleCreditsBlock,
    /polynetPriceUsd:\s*v\.optional\(v\.number\(\)\)/,
    "credit settlement must derive collected Polynet price from collected credits",
  );
  assert.match(
    creditsSource,
    /debitAvailableWorkspaceCredits[\s\S]*final_duration_seconds[\s\S]*extra_credits_debited/,
    "expected computer compute charges to debit raw elapsed overages beyond the initial hold and preserve receipt evidence",
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
  const workspaceTopupCheckoutBlock = creditsSource.slice(
    creditsSource.indexOf("export const startWorkspaceCreditTopupCheckout = action"),
  );
  assert.match(
    creditsSource,
    /startWorkspaceCreditTopupCheckout[\s\S]*packId:\s*v\.optional\(v\.string\(\)\)[\s\S]*resolveWorkspaceToolBalanceTopupPack\(args\.packId\)[\s\S]*workspace_tool_balance_pack_invalid/,
    "expected top-up checkout to accept only server-defined tool-balance pack ids",
  );
  assert.match(
    creditsSource,
    /assertWorkspaceCreditBalanceReadyForTopupInternal[\s\S]*readCanonicalWorkspaceCreditBalance\(ctx, args\.userId\)/,
    "expected top-up checkout to have an internal duplicate-balance preflight",
  );
  assert.match(
    workspaceTopupCheckoutBlock,
    /ctx\.runQuery\([\s\S]*internal\.workspaceCredits\.assertWorkspaceCreditBalanceReadyForTopupInternal[\s\S]*userId/,
    "expected public top-up checkout action to preflight accounting state before Stripe",
  );
  assertSourceOrder(
    workspaceTopupCheckoutBlock,
    "assertWorkspaceCreditBalanceReadyForTopupInternal",
    "ensureStripeCustomerForUser",
    "expected duplicate-balance preflight before Stripe customer creation",
  );
  assertSourceOrder(
    workspaceTopupCheckoutBlock,
    "assertWorkspaceCreditBalanceReadyForTopupInternal",
    "createPendingWorkspaceCreditTopupCheckoutSessionInternal",
    "expected duplicate-balance preflight before local checkout row creation",
  );
  assertSourceOrder(
    workspaceTopupCheckoutBlock,
    "assertWorkspaceCreditBalanceReadyForTopupInternal",
    "stripe.checkout.sessions.create",
    "expected duplicate-balance preflight before Stripe Checkout creation",
  );
  assert.match(
    pendingTopupCreationBlock,
    /readCanonicalWorkspaceCreditBalance\(ctx, args\.ownerUserId\)[\s\S]*ctx\.db\.insert\("checkoutSessions"/,
    "expected internal checkout-row creation to also fail closed on duplicate balances",
  );
  assert.match(
    creditsSource,
    /line_items:[\s\S]*price_data:[\s\S]*unit_amount:\s*Math\.round\(pack\.priceUsd\s*\*\s*100\)/,
    "expected Stripe Checkout top-ups to price fixed dollar packs server-side",
  );
  assert.match(
    workspaceTopupCheckoutBlock,
    /const nowMs = Date\.now\(\);[\s\S]*const expiresAt = nowMs \+ WORKSPACE_TOOL_BALANCE_TOPUP_CHECKOUT_TTL_MS[\s\S]*expiresAt,[\s\S]*expires_at:\s*Math\.floor\(expiresAt \/ 1000\)/,
    "expected tool-balance checkout expiry to be server-owned and mirrored to Stripe",
  );
  assert.match(
    creditsSource,
    /function effectiveWorkspaceCreditTopupCheckoutExpiresAt[\s\S]*Math\.min\(storedExpiresAt, ttlExpiresAt\)[\s\S]*staleTopups[\s\S]*effectiveWorkspaceCreditTopupCheckoutExpiresAt\(row\) <= nowMs[\s\S]*expireStaleWorkspaceCreditTopupCheckoutSessionsInternal[\s\S]*effectiveWorkspaceCreditTopupCheckoutExpiresAt\(row\) > nowMs/,
    "expected stale top-up cleanup and diagnostics to cap old rows at the 24-hour checkout TTL",
  );
  assert.doesNotMatch(
    workspaceTopupCheckoutBlock,
    /nowMs:\s*v\.optional\(v\.number\(\)\)|args\.nowMs/,
    "tool-balance checkout expiry must not trust client-provided time",
  );
  assert.match(
    httpBillingSource,
    /paymentStatus !== "paid"[\s\S]*workspace_credit_topup_payment_pending/,
    "expected tool-balance webhooks to grant credits only after Stripe reports paid payment status",
  );
  assert.match(
    topupCompletionBlock,
    /const grantedCredits = roundCredits\(row\.workspaceCreditsAmount \?\? WORKSPACE_CREDIT_TOPUP_CREDITS\)/,
    "expected tool-balance completion to grant the server-created checkout row amount, not webhook metadata",
  );
  assert.doesNotMatch(
    topupCompletionBlock,
    /args\.workspaceCreditsAmount/,
    "tool-balance completion must not let webhook metadata override the server-created checkout amount",
  );
  assert.match(
    creditsSource,
    /custom_text:[\s\S]*Tool balance is non-refundable/,
    "expected Stripe Checkout to disclose non-refundable tool balance before payment",
  );
  assert.match(
    creditsSource,
    /metadata:[\s\S]*workspace_tool_balance_pack_id:\s*pack\.id[\s\S]*workspace_tool_balance_usd:\s*String\(pack\.priceUsd\)/,
    "expected top-up metadata to preserve non-authoritative pack identity and dollar amount",
  );
  assert.doesNotMatch(
    creditsSource,
    /workspace_credits_amount:\s*String\(workspaceCreditsAmount\)/,
    "Stripe metadata must not preserve a credit amount that could drift from the server-created checkout row",
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
    workspaceCreditSettlementSource,
    /settleReservedCreditsBestEffort[\s\S]*settleCreditsInternal[\s\S]*settleReservedCreditsStrict/,
    "expected paid-tool reservation settlement to be centralized",
  );
  assert.match(
    workspaceCreditSettlementSource,
    /settleReservedCreditsStrict[\s\S]*queueCreditSettlementRetryInternal[\s\S]*status:\s*"succeeded"/,
    "expected successful provider usage to queue durable settlement recovery if strict settlement fails",
  );
  assert.match(
    creditsSource,
    /queueCreditSettlementRetryInternal[\s\S]*pendingSettlementNextAttemptAt[\s\S]*expiresAt:\s*nowMs\s*\+\s*Math\.max\(CREDIT_RESERVATION_EXPIRY_MS/,
    "expected queued provider-success settlements to extend reservation expiry while retrying",
  );
  assert.match(
    creditsSource,
    /readCanonicalWorkspaceCreditBalance[\s\S]*readWorkspaceCreditBalanceRowsByUser\(ctx, userId, 2\)[\s\S]*DUPLICATE_WORKSPACE_CREDIT_BALANCE_ERROR/,
    "expected paid-tool balance reads to fail closed when duplicate materialized balance rows exist",
  );
  assert.match(
    reserveCreditsBlock,
    /readCanonicalWorkspaceCreditBalance\(ctx, args\.userId\)/,
    "expected paid-tool reservations to use the duplicate-safe canonical balance reader",
  );
  assert.match(
    settleCreditsBlock,
    /readCanonicalWorkspaceCreditBalance\(ctx, entry\.userId\)/,
    "expected paid-tool settlement/refund paths to use the duplicate-safe canonical balance reader",
  );
  assert.doesNotMatch(
    creditsSource,
    /query\("workspaceCreditBalances"\)[\s\S]{0,160}\.collect\(\)/,
    "workspace credit balance diagnostics and repair must stay bounded instead of full-collecting the balance table",
  );
  assert.match(
    creditsSource,
    /repairWorkspaceCreditBalanceRowsForUser[\s\S]*mergeWorkspaceCreditBalanceRows[\s\S]*ctx\.db\.delete/,
    "expected duplicate tool-balance rows to have an auditable merge-and-delete repair path",
  );
  assert.match(
    creditsSource,
    /repairDuplicateWorkspaceCreditBalancesInternal[\s\S]*repairWorkspaceCreditBalanceRowsForUser/,
    "expected sampled duplicate-balance repair to reuse the capped user repair helper",
  );
  assert.match(
    creditsSource,
    /repairWorkspaceCreditBalanceForOperator = mutation[\s\S]*requireOperatorRole\(ctx, args\.authSubject, "operator"\)[\s\S]*repairWorkspaceCreditBalanceRowsForUser/,
    "expected known duplicate-balance users to have a targeted operator repair mutation",
  );
  assert.match(
    creditsSource,
    /workspace_credit_balance_repair_row_limit_exceeded/,
    "expected targeted duplicate-balance repair to refuse destructive repair when the user row scan is capped",
  );
  assert.match(
    creditsSource,
    /import \{ requireOperatorRole \} from "\.\/operatorAccess"/,
    "expected tool-credit diagnostics to reuse the canonical operator role gate",
  );
  assert.match(
    operatorDiagnosticsBlock,
    /requireOperatorRole\(ctx,\s*args\.authSubject,\s*"operator"\)/,
    "expected tool-credit diagnostics to be gated to operators, not general account users",
  );
  assert.match(
    operatorDiagnosticsBlock,
    /duplicateBalanceRowsDryRun/,
    "expected operator diagnostics to report duplicate balances, stale top-ups, pending settlements, and uncollected usage",
  );
  assert.doesNotMatch(
    operatorDiagnosticsBlock,
    /repairMutation/,
    "operator diagnostics should not expose a fake repair action string without a real operator mutation",
  );
  assert.match(operatorDiagnosticsBlock, /staleTopupCheckouts/, "expected operator diagnostics to report stale top-up checkouts");
  assert.match(operatorDiagnosticsBlock, /pendingSettlements/, "expected operator diagnostics to report pending settlement retries");
  assert.match(operatorDiagnosticsBlock, /uncollectedCreditsBalance/, "expected operator diagnostics to report uncollected paid-tool usage");
  assert.doesNotMatch(
    operatorDiagnosticsBlock,
    /ctx\.db\.(patch|delete|insert|replace)/,
    "operator diagnostics must stay read-only; repairs belong to the existing explicit repair mutation",
  );
  assert.doesNotMatch(
    creditsSource,
    /inspectWorkspaceCreditBalanceIntegrityInternal/,
    "duplicate balance inspection should not duplicate the repair mutation dry-run path",
  );
  assert.match(
    creditsSource,
    /reconcileExpiredCreditReservationsInternal[\s\S]*pendingSettlementStatus\s*===\s*"succeeded"[\s\S]*continue/,
    "expired reservation reconciliation must not refund provider-success entries waiting for durable settlement retry",
  );
  assert.match(
    creditsSource,
    /export const getWorkspaceToolBalance[\s\S]*buildWorkspaceToolBalanceProjection/,
    "expected backend to expose a canonical tool-balance projection query",
  );
  assert.doesNotMatch(
    creditsSource,
    /export const getWorkspaceCreditBalance = query/,
    "frontend must not use the raw workspace credit balance query after canonical projection exists",
  );
  assert.doesNotMatch(
    settlementCallSiteSources,
    /async function settleReservedCredits(?:BestEffort|Strict)/,
    "paid-tool call sites must not reintroduce local settlement helper copies",
  );
  assert.match(
    daytonaSessionSource,
    /settleReservedCreditsBestEffort[\s\S]*recordWorkspaceComputeChargeInternal[\s\S]*creditReservationKey/,
    "expected temporary Daytona teardown to keep centralized reservation settlement and compute evidence wired together",
  );
  assert.match(
    [daytonaSessionSource, backgroundServiceSource, orphanReconcilerSource].join("\n"),
    /recordWorkspaceComputeChargeInternal[\s\S]*queueCreditSettlementRetryInternal/,
    "expected Daytona compute charge recording failures to queue settlement recovery instead of only expiring the reservation",
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
  assert.doesNotMatch(
    daytonaSessionSource,
    /Math\.min\(\s*Number\(params\.session\.creditBudgetCredits/,
    "temporary Daytona settlement must not cap raw elapsed usage at the initial hold",
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
    /priceDaytonaWorkspaceUsageCredits\(\{\s*computeCostUsd\s*\}\)[\s\S]*recordWorkspaceComputeChargeInternal/,
    "expected orphan reconciliation to record raw elapsed usage instead of capping at the original hold",
  );
  assert.match(
    orphanReconcilerSource,
    /creditBudgetExpiresAt[\s\S]*terminalRows\.some\(\(row\) => isActiveTerminalStatus\(row\.status\)\) &&\s*!budgetExpired/,
    "expected the orphan reconciler to stop budget-expired background sandboxes even with active terminals",
  );
  assert.doesNotMatch(
    orphanReconcilerSource,
    /priceCreditsWithinBudget|settleReservedCreditsBestEffort/,
    "orphan Daytona cleanup must not preserve the old budget-capped settlement path",
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
    "expected web research to reserve from the shared estimated provider-cost hold",
  );
  assert.match(
    httpDaytonaSource,
    /finalVendorCostUsd[\s\S]*result\.billingEvidence\?\.rawVendorCostUsd[\s\S]*priceVendorCostUsdToWorkspaceCredits\(\{[\s\S]*rawVendorCostUsd:\s*finalVendorCostUsd/,
    "expected web research to settle from actual provider billing evidence when available",
  );
  assert.match(
    httpDaytonaSource,
    /settleReservedCreditsStrict\(\{[\s\S]*creditsSettled:\s*finalWebResearchCredits[\s\S]*rawVendorCostUsd:\s*finalVendorCostUsd[\s\S]*buildWebResearchSettlementMetadata/,
    "expected successful web research settlement to persist final credits and provider cost evidence",
  );
  assert.match(
    xAiSearchTransportSource,
    /XAI_USD_TICKS_PER_DOLLAR\s*=\s*10_000_000_000[\s\S]*cost_in_usd_ticks[\s\S]*costInUsdTicks\s*\/\s*XAI_USD_TICKS_PER_DOLLAR/,
    "expected xAI search to convert exact provider cost ticks into USD",
  );
  assert.match(
    xAiSearchTransportSource,
    /server_side_tool_usage[\s\S]*num_server_side_tools_used[\s\S]*billingEvidence:\s*buildXAiBillingEvidence/,
    "expected xAI search to retain safe tool-usage billing evidence",
  );
  assert.match(
    xAiSearchTransportSource,
    /enable_image_understanding:\s*false[\s\S]*enable_video_understanding:\s*false[\s\S]*max_turns:\s*3/,
    "expected xAI search to keep expensive media understanding off and cap server-side tool turns",
  );
  assert.match(
    webResearchToolsSource,
    /billingEvidence\?:\s*WebResearchBillingEvidence[\s\S]*billingEvidenceParts:\s*WebResearchBillingEvidence\[\][\s\S]*billingEvidence:\s*combineBillingEvidence\(billingEvidenceParts\)/,
    "expected web research to propagate backend billing evidence to settlement",
  );
  assert.match(
    webResearchToolsSource,
    /withEstimatedFallback[\s\S]*xAiResult\.billingEvidence[\s\S]*buildEstimatedBillingEvidence\(\{\s*backend:\s*"jina",\s*action:\s*"open_page"/,
    "expected web research to use exact xAI cost when present and estimates for non-reporting providers",
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
    /resolveVoiceDurationEvidence\(\{[\s\S]*durationMs:\s*input\.duration_ms[\s\S]*audioBytes:\s*bytes\.byteLength[\s\S]*quoteVoiceTranscription\(\{[\s\S]*durationSeconds:\s*durationEvidence\.durationSeconds[\s\S]*pricing_mode:\s*"duration_seconds"[\s\S]*creditsSettled:\s*settledQuote\.credits/,
    "expected voice transcription to reserve and settle duration-priced provider usage",
  );
  assert.match(
    httpVoiceSource,
    /estimateVoiceDurationByteFloorSeconds[\s\S]*server_byte_floor[\s\S]*duration_source:\s*durationEvidence\.source/,
    "expected voice transcription to defend duration billing against spoofed client duration",
  );
  assert.match(
    httpVoiceSource,
    /tool_kind:\s*"voice_input"[\s\S]*required_credits:\s*voiceCredits/,
    "expected voice input balance failures to identify voice_input and required credits",
  );
  assert.match(
    creditsSource,
    /settleCreditsInternal[\s\S]*rawVendorCostUsd:\s*v\.optional\(v\.number\(\)\)[\s\S]*mergeLedgerMetadata/,
    "expected credit settlement to update final provider cost and receipt metadata",
  );
  assert.match(
    httpVoiceSource,
    /requested_polynet_price_usd[\s\S]*creditsSettled:\s*settledQuote\.credits[\s\S]*rawVendorCostUsd:\s*settledQuote\.rawVendorCostUsd/,
    "expected voice receipt metadata to keep requested price separate from collected settlement",
  );
  assert.match(
    httpVoiceSource,
    /type VoiceTranscriptionResponseFormat = "verbose_json" \| "json"/,
    "expected voice transcription response formats to be modeled explicitly",
  );
  assert.match(
    httpVoiceSource,
    /function isResponseFormatUnsupported\(status: number, message: string\)[\s\S]*status !== 400 && status !== 422[\s\S]*response_format[\s\S]*verbose_json[\s\S]*unsupported/,
    "expected voice transcription to retry only provider response-format compatibility errors",
  );
  assert.match(
    httpVoiceSource,
    /const verboseResult = await attempt\("verbose_json"\)[\s\S]*verboseResult\.retryWithJson[\s\S]*return await attempt\("json"\)/,
    "expected voice transcription providers to try verbose_json first and fall back to json once",
  );
  assert.match(
    httpVoiceSource,
    /response_format:\s*params\.responseFormat\s*\?\?\s*null[\s\S]*responseFormat:\s*primary\.responseFormat\s*\?\?\s*null[\s\S]*responseFormat:\s*fallback\.responseFormat\s*\?\?\s*null/,
    "expected voice settlements to record the provider response format that actually succeeded",
  );
  assert.match(
    authCoreSource,
    /VoiceTranscriptionRequestError[\s\S]*toolKind:[\s\S]*requiredCredits:[\s\S]*readVoiceTranscriptionRequestError[\s\S]*tool_kind[\s\S]*required_credits/,
    "expected voice transcription client errors to preserve paid-tool metadata",
  );
  assert.match(
    authCoreSource,
    /duration_ms:\s*[\s\S]*params\.durationMs/,
    "expected voice transcription client requests to include captured duration",
  );
  assert.match(
    voiceControllerSource,
    /voiceCaptureStartedAtRef[\s\S]*Date\.now\(\)[\s\S]*transcribeVoiceBlob\(surface,\s*audioBlob,\s*durationMs\)/,
    "expected voice capture to measure and pass raw recording duration",
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
    /openWorkspaceCreditTopupModal[\s\S]*setInferenceIssueModal\(\{[\s\S]*reason:\s*"workspace_credits"[\s\S]*toolKind:\s*params\?\.toolKind\s*\?\?\s*"workspace_tools"[\s\S]*requiredCredits:\s*params\?\.requiredCredits\s*\?\?\s*null[\s\S]*onToolBalanceRequired:[\s\S]*openWorkspaceCreditTopupModal\(\{[\s\S]*toolKind:\s*details\?\.toolKind\s*\?\?\s*"voice_input"[\s\S]*requiredCredits:\s*details\?\.requiredCredits\s*\?\?\s*null/,
    "expected voice input tool-balance failures to open the workspace issue modal with metadata",
  );
  assert.match(
    appSource,
    /WORKSPACE_CREDIT_TOPUP_RETURN_POLL_MAX_ATTEMPTS[\s\S]*currentUncollected < baselineUncollected[\s\S]*baseline_uncollected_credits:/,
    "expected Stripe return refresh to poll canonical balance and account for top-ups that clear prior uncollected usage",
  );
  assert.match(
    webAgentSettingsSource,
    /getSpendableWorkspaceToolBalanceCredits\(workspaceCreditBalance\)[\s\S]*getUncollectedWorkspaceToolBalanceCredits\(workspaceCreditBalance\)[\s\S]*prior tool usage must be cleared/,
    "expected settings to display spendable balance separately from prior uncollected usage",
  );
  assert.match(
    workspaceUserPanelSource,
    /getSpendableWorkspaceToolBalanceCredits\(props\.workspaceCreditBalance\)[\s\S]*getUncollectedWorkspaceToolBalanceCredits\(props\.workspaceCreditBalance\)[\s\S]*prior usage clears from the next top-up/,
    "expected the right-panel workspace balance to use the canonical spendable and uncollected balance helpers",
  );
  assert.match(
    appSource,
    /turnOnWorkspaceComputer[\s\S]*workspace_credits_exhausted[\s\S]*openWorkspaceCreditTopupModal\(\{[\s\S]*toolKind:\s*"workspace_tools"[\s\S]*requiredCredits:\s*result\.required_credits/,
    "expected workspace computer balance failures to open the shared tool-balance modal with metadata",
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
    sharedCreditsSource,
    /workspace_tools[\s\S]*paid computer time/,
    "expected canonical paid-tool copy to explain why workspace tools need balance",
  );
  assert.match(
    sharedCreditsSource,
    /web_research[\s\S]*paid provider calls/,
    "expected canonical paid-tool copy to explain why web research needs balance",
  );
  assert.match(
    sharedCreditsSource,
    /voice_input[\s\S]*paid transcription/,
    "expected canonical paid-tool copy to explain why each paid tool kind needs balance",
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
    cronsSource,
    /retryPendingCreditSettlementsInternal/,
    "expected durable credit settlement retries to be scheduled",
  );
  assert.match(
    cronsSource,
    /expireStaleWorkspaceCreditTopupCheckoutSessionsInternal/,
    "expected stale pending tool-balance checkouts to expire on a cron",
  );
  assert.match(
    accountSource,
    /creditLedgerEntries[\s\S]*by_user_createdAt[\s\S]*userId/,
    "expected account deletion to remove user-scoped credit ledger rows",
  );

  console.log("PASS: workspace credit accounting contract is wired correctly");
}

await proveWorkspaceCreditAccountingContract();
