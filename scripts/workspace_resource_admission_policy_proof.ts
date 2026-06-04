import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  formatWorkspaceBillingCheckoutError,
} from "../shared/appErrorMappings.ts";
import {
  classifyPaidUsageFailure,
  normalizePaidUsageFailureCode,
  paidUsageBillingModeForPaidToolFailure,
  paidUsageBillingModeForWorkspaceStorageAction,
} from "../shared/paidUsageBilling.ts";
import {
  countWorkspaceProjectsForAdmission,
  countWorkspaceVolumesForAdmission,
  evaluateWorkspaceProjectCreateAdmission,
  evaluateWorkspaceSandboxStartAdmission,
  evaluateWorkspaceVolumeMaterializationAdmission,
  getWorkspaceProjectVolumeLimitForTier,
  resolveWorkspaceResourceAccountTier,
  WORKSPACE_FREE_PROJECT_VOLUME_LIMIT,
  WORKSPACE_PAID_PROJECT_VOLUME_LIMIT,
} from "../shared/workspaceResourceAdmission.ts";
import {
  WORKSPACE_CARD_BACKED_UNCOLLECTED_LIMIT_CREDITS,
} from "../shared/workspaceCredits.ts";
import {
  WORKSPACE_COMPUTER_LIFECYCLE_POLICY,
} from "../shared/workspaceComputerProvider.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

assert.equal(WORKSPACE_FREE_PROJECT_VOLUME_LIMIT, 1);
assert.equal(WORKSPACE_PAID_PROJECT_VOLUME_LIMIT, 10);
assert.equal(WORKSPACE_CARD_BACKED_UNCOLLECTED_LIMIT_CREDITS, 500);
assert.equal(WORKSPACE_COMPUTER_LIFECYCLE_POLICY.file_inspection.idleDeleteAfter, "30s");
assert.equal(WORKSPACE_COMPUTER_LIFECYCLE_POLICY.agent_run.idleDeleteAfter, "10m");
assert.equal(WORKSPACE_COMPUTER_LIFECYCLE_POLICY.interactive.idleDeleteAfter, "30m");
assert.equal(getWorkspaceProjectVolumeLimitForTier("free"), 1);
assert.equal(getWorkspaceProjectVolumeLimitForTier("paid"), 10);
assert.equal(
  paidUsageBillingModeForWorkspaceStorageAction("card_required"),
  "card_required",
);
assert.equal(
  paidUsageBillingModeForWorkspaceStorageAction("funding_required"),
  "card_preferred",
);
assert.equal(
  paidUsageBillingModeForPaidToolFailure("web_research"),
  "card_preferred",
);
assert.equal(
  normalizePaidUsageFailureCode("workspace_card_required_for_additional_volume"),
  "workspace_card_required_for_additional_volume",
);
assert.equal(
  normalizePaidUsageFailureCode("credits_exhausted"),
  "workspace_credits_exhausted",
);
assert.equal(
  normalizePaidUsageFailureCode("credits_unavailable"),
  "workspace_credits_unavailable",
);
assert.equal(
  normalizePaidUsageFailureCode("workspace_uncollected_usage_blocked"),
  "workspace_uncollected_usage_blocked",
);
assert.deepEqual(
  classifyPaidUsageFailure({
    code: "workspace_card_required_for_additional_volume",
    paidUsageBillingMode: "prepaid_required",
  }),
  {
    isPaidUsageFailure: true,
    code: "workspace_card_required_for_additional_volume",
    paidUsageBillingMode: "card_required",
    toolKind: null,
  },
);
assert.deepEqual(
  classifyPaidUsageFailure({
    code: "workspace_volume_funding_required",
  }),
  {
    isPaidUsageFailure: true,
    code: "workspace_volume_funding_required",
    paidUsageBillingMode: "card_preferred",
    toolKind: null,
  },
);
assert.deepEqual(
  classifyPaidUsageFailure({
    code: "workspace_credits_exhausted",
    toolKind: "web_research",
  }),
  {
    isPaidUsageFailure: true,
    code: "workspace_credits_exhausted",
    paidUsageBillingMode: "card_preferred",
    toolKind: "web_research",
  },
);
assert.deepEqual(
  classifyPaidUsageFailure({
    code: "credits_exhausted",
    toolKind: "web_research",
  }),
  {
    isPaidUsageFailure: true,
    code: "workspace_credits_exhausted",
    paidUsageBillingMode: "card_preferred",
    toolKind: "web_research",
  },
);
assert.deepEqual(
  classifyPaidUsageFailure({
    code: "workspace_uncollected_usage_blocked",
    toolKind: "workspace_tools",
  }),
  {
    isPaidUsageFailure: true,
    code: "workspace_uncollected_usage_blocked",
    paidUsageBillingMode: "card_preferred",
    toolKind: "workspace_tools",
  },
);
assert.equal(
  formatWorkspaceBillingCheckoutError(
    new Error("[Request ID: 125828c22457b87f] Server Error: Uncaught Error: stripe_secret_key_missing at getStripeClient (../convex/stripeCore.ts:20:17)"),
    { kind: "card_setup" },
  ),
  "Card setup is temporarily unavailable. Please retry shortly.",
);
assert.equal(
  formatWorkspaceBillingCheckoutError(
    "Server Error: Uncaught Error: stripe_secret_key_missing at getStripeClient (../convex/stripeCore.ts:20:17)",
    { kind: "manual_balance" },
  ),
  "Manual balance checkout is temporarily unavailable. Please retry shortly.",
);
assert.equal(
  formatWorkspaceBillingCheckoutError("workspace_tool_balance_pack_invalid", {
    kind: "manual_balance",
  }),
  "That manual balance option is unavailable. Choose another amount.",
);

assert.equal(resolveWorkspaceResourceAccountTier({}), "free");
assert.equal(resolveWorkspaceResourceAccountTier({ hasCardOnFile: true }), "paid");
assert.equal(
  resolveWorkspaceResourceAccountTier({
    workspaceCreditBalance: {
      includedCreditsBalance: 100,
      purchasedCreditsBalance: 0,
    },
  }),
  "free",
);
assert.equal(
  resolveWorkspaceResourceAccountTier({
    workspaceCreditBalance: {
      includedCreditsBalance: 0,
      purchasedCreditsBalance: 1,
    },
  }),
  "free",
);
assert.equal(
  resolveWorkspaceResourceAccountTier({
    fallbackTier: "paid",
    workspaceCreditBalance: null,
  }),
  "paid",
);

assert.equal(
  countWorkspaceProjectsForAdmission([
    { status: "active" },
    { status: "archived" },
    { status: "staging_archived_duplicate" },
    { workspaceVolumeRetentionState: "deleted" },
    { workspaceVolumeDeletedAt: Date.now() },
    { volume_retention_state: "deleted" },
    { volume_deleted_at: Date.now() },
  ]),
  1,
);
assert.equal(
  countWorkspaceVolumesForAdmission([
    { status: "active", providerVolumeId: "vol-one" },
    { status: "active", provider_volume_id: "vol-two" },
    { status: "active" },
    { status: "active", providerVolumeId: "vol-deleted", workspaceVolumeRetentionState: "deleted" },
  ]),
  2,
);

assert.deepEqual(
  evaluateWorkspaceProjectCreateAdmission({
    accountTier: "free",
    existingProjectCount: 0,
  }).ok,
  true,
);
const blockedFreeProject = evaluateWorkspaceProjectCreateAdmission({
  accountTier: "free",
  existingProjectCount: 1,
});
assert.equal(blockedFreeProject.ok, false);
assert.equal(blockedFreeProject.code, "project_limit_reached");
assert.equal(blockedFreeProject.limit, 1);

const paidProject = evaluateWorkspaceProjectCreateAdmission({
  accountTier: "paid",
  existingProjectCount: 9,
});
assert.equal(paidProject.ok, true);
assert.equal(
  evaluateWorkspaceProjectCreateAdmission({
    accountTier: "paid",
    existingProjectCount: 10,
  }).code,
  "project_limit_reached",
);
assert.equal(
  evaluateWorkspaceProjectCreateAdmission({
    accountTier: resolveWorkspaceResourceAccountTier({
      hasCardOnFile: true,
      workspaceCreditBalance: null,
    }),
    existingProjectCount: 9,
  }).ok,
  true,
);
assert.equal(
  evaluateWorkspaceProjectCreateAdmission({
    accountTier: resolveWorkspaceResourceAccountTier({
      hasCardOnFile: false,
      workspaceCreditBalance: {
        includedCreditsBalance: 0,
        purchasedCreditsBalance: 1,
      },
    }),
    existingProjectCount: 1,
  }).code,
  "project_limit_reached",
);

assert.equal(
  evaluateWorkspaceVolumeMaterializationAdmission({
    hasCardOnFile: false,
    workspaceCreditBalance: null,
    existingVolumeCount: 0,
  }).code,
  "workspace_volume_funding_required",
);
assert.equal(
  evaluateWorkspaceVolumeMaterializationAdmission({
    hasCardOnFile: false,
    workspaceCreditBalance: {
      includedCreditsBalance: 100,
      purchasedCreditsBalance: 0,
    },
    existingVolumeCount: 0,
  }).code,
  "workspace_volume_funding_required",
);
assert.equal(
  evaluateWorkspaceVolumeMaterializationAdmission({
    hasCardOnFile: false,
    workspaceCreditBalance: {
      includedCreditsBalance: 0,
      purchasedCreditsBalance: 1,
    },
    existingVolumeCount: 0,
  }).ok,
  true,
);
assert.equal(
  evaluateWorkspaceVolumeMaterializationAdmission({
    hasCardOnFile: false,
    workspaceCreditBalance: {
      includedCreditsBalance: 0,
      purchasedCreditsBalance: 1,
    },
    existingVolumeCount: 1,
  }).code,
  "workspace_card_required_for_additional_volume",
);
assert.equal(
  evaluateWorkspaceVolumeMaterializationAdmission({
    hasCardOnFile: true,
    workspaceCreditBalance: null,
    existingVolumeCount: 9,
  }).ok,
  true,
);
assert.equal(
  evaluateWorkspaceVolumeMaterializationAdmission({
    hasCardOnFile: true,
    workspaceCreditBalance: null,
    existingVolumeCount: 10,
  }).code,
  "workspace_volume_limit_reached",
);
assert.equal(
  evaluateWorkspaceVolumeMaterializationAdmission({
    hasCardOnFile: true,
    workspaceCreditBalance: null,
    existingVolumeCount: 1,
    providerVolumeCount: 9,
    providerVolumeLimit: 10,
    providerVolumeSafetyBuffer: 1,
  }).code,
  "workspace_provider_volume_quota_headroom_exhausted",
);

assert.equal(
  evaluateWorkspaceSandboxStartAdmission({
    accountTier: "paid",
    hasCardOnFile: false,
    workspaceCreditBalance: {
      includedCreditsBalance: 0,
      purchasedCreditsBalance: 0,
      uncollectedCreditsBalance: 1,
    },
    requiredCredits: 1,
  }).code,
  "workspace_uncollected_usage_blocked",
);
assert.equal(
  evaluateWorkspaceSandboxStartAdmission({
    accountTier: "free",
    hasCardOnFile: false,
    workspaceCreditBalance: null,
    requiredCredits: 1,
  }).code,
  "workspace_credits_exhausted",
);
assert.equal(
  evaluateWorkspaceSandboxStartAdmission({
    accountTier: "paid",
    hasCardOnFile: false,
    workspaceCreditBalance: {
      includedCreditsBalance: 100,
      purchasedCreditsBalance: 0,
    },
    requiredCredits: 1,
  }).code,
  "workspace_credits_exhausted",
);
assert.equal(
  evaluateWorkspaceSandboxStartAdmission({
    accountTier: "paid",
    hasCardOnFile: true,
    workspaceCreditBalance: null,
    requiredCredits: 1,
  }).ok,
  true,
);
assert.equal(
  evaluateWorkspaceSandboxStartAdmission({
    accountTier: "paid",
    hasCardOnFile: true,
    workspaceCreditBalance: {
      includedCreditsBalance: 0,
      purchasedCreditsBalance: 0,
      uncollectedCreditsBalance: WORKSPACE_CARD_BACKED_UNCOLLECTED_LIMIT_CREDITS - 1,
    },
    requiredCredits: 1,
  }).ok,
  true,
);
assert.equal(
  evaluateWorkspaceSandboxStartAdmission({
    accountTier: "paid",
    hasCardOnFile: true,
    workspaceCreditBalance: {
      includedCreditsBalance: 0,
      purchasedCreditsBalance: 0,
      uncollectedCreditsBalance: WORKSPACE_CARD_BACKED_UNCOLLECTED_LIMIT_CREDITS,
    },
    requiredCredits: 1,
  }).code,
  "workspace_uncollected_usage_blocked",
);
assert.equal(
  evaluateWorkspaceSandboxStartAdmission({
    accountTier: "paid",
    hasCardOnFile: true,
    workspaceCreditBalance: {
      includedCreditsBalance: 0,
      purchasedCreditsBalance: 0,
      pendingCardCollectionCreditsBalance: WORKSPACE_CARD_BACKED_UNCOLLECTED_LIMIT_CREDITS,
    },
    requiredCredits: 1,
  }).code,
  "workspace_uncollected_usage_blocked",
);
assert.equal(
  evaluateWorkspaceSandboxStartAdmission({
    accountTier: "paid",
    hasCardOnFile: false,
    workspaceCreditBalance: {
      includedCreditsBalance: 0,
      purchasedCreditsBalance: 2,
    },
    requiredCredits: 1,
  }).ok,
  true,
);

const projects = read("convex/projects.ts");
assert.match(
  projects,
  /evaluateWorkspaceProjectCreateAdmission/,
  "project creation must use centralized workspace resource admission policy",
);
assert.match(
  projects,
  /resolveWorkspaceResourceAccountTierForOwner[\s\S]*resolveWorkspaceHasCardOnFileForOwner[\s\S]*resolveWorkspaceResourceAccountTier\(\{[\s\S]*hasCardOnFile/,
  "project creation tier resolution must use the same persisted card-on-file truth as volume materialization",
);
assert.match(
  projects,
  /countWorkspaceProjectsForAdmission\(existingRows\)/,
  "project creation must count active resource rows through the shared policy",
);
assert.match(
  projects,
  /prepareCloudProjectVolumeMaterializationInternal[\s\S]*evaluateWorkspaceVolumeMaterializationAdmission/,
  "volume materialization must use centralized workspace resource admission policy",
);
assert.match(
  projects,
  /prepareCloudProjectVolumeMaterializationInternal[\s\S]*providerVolumeCount: v\.optional\(v\.number\(\)\)[\s\S]*providerVolumeLimit: v\.optional\(v\.number\(\)\)[\s\S]*providerVolumeSafetyBuffer: v\.optional\(v\.number\(\)\)/,
  "volume materialization must accept provider quota evidence captured outside the mutation",
);
assert.match(
  projects,
  /evaluateWorkspaceVolumeMaterializationAdmission\(\{[\s\S]*providerVolumeCount: args\.providerVolumeCount \?\? null[\s\S]*providerVolumeLimit: args\.providerVolumeLimit \?\? null[\s\S]*providerVolumeSafetyBuffer: args\.providerVolumeSafetyBuffer \?\? null/,
  "volume materialization must pass provider quota evidence into centralized admission",
);
assert.match(
  projects,
  /resolveWorkspaceHasCardOnFileForOwner[\s\S]*userStripeCustomers[\s\S]*paymentMethodStatus[\s\S]*"active"[\s\S]*providerDefaultPaymentMethodId[\s\S]*pm_/,
  "volume admission must read persisted Stripe payment-method truth, not infer from customer id",
);
assert.doesNotMatch(
  projects,
  /resolveWorkspaceHasCardOnFileForOwner[\s\S]*return false;/,
  "card-on-file admission must not remain hardcoded off",
);
assert.match(
  projects,
  /providerVolumeState: "materializing"/,
  "volume materialization must claim the provider volume slot before provider creation",
);
assert.match(
  projects,
  /existingVolumeDeleted[\s\S]*workspaceVolumeRetentionState[\s\S]*"deleted"[\s\S]*existingVolumeId && !existingVolumeDeleted/,
  "deleted volume retention rows must not bypass materialization admission as active volumes",
);
assert.match(
  projects,
  /ensureCloudProjectVolumeInternal[\s\S]*readBlaxelWorkspaceVolumeQuotaAdmissionArgs\(\{[\s\S]*prepareCloudProjectVolumeMaterializationInternal[\s\S]*providerVolumeCount: quotaAdmissionArgs\.providerVolumeCount[\s\S]*providerVolumeLimit: quotaAdmissionArgs\.providerVolumeLimit[\s\S]*providerVolumeSafetyBuffer: quotaAdmissionArgs\.providerVolumeSafetyBuffer/,
  "direct volume ensure must capture provider quota truth before central materialization admission",
);
assert.match(
  projects,
  /importCloudProjectZipForOwner[\s\S]*ensureBillableBlaxelWorkspaceComputer/,
  "project import must use the centralized billable Blaxel wake helper",
);

const workspaceInspector = read("convex/workspaceInspector.ts");
assert.match(
  workspaceInspector,
  /ensureBlaxelInspectorWorkspace[\s\S]*ensureBillableBlaxelWorkspaceComputer[\s\S]*reuseExistingLease: true/,
  "workspace file inspection must use the centralized reusable billable Blaxel lease helper",
);

const workspaceTerminals = read("convex/workspaceTerminals.ts");
assert.match(
  workspaceTerminals,
  /startProjectWorkspaceComputer[\s\S]*ensureBillableBlaxelWorkspaceComputer[\s\S]*reuseExistingLease: true/,
  "manual workspace start must use the centralized reusable billable Blaxel lease helper",
);
assert.match(
  workspaceTerminals,
  /setProjectBackgroundSandboxInternal[\s\S]*previousSandboxCreditReservationKey[\s\S]*return \{[\s\S]*previousSandboxCreditReservationKey/,
  "project sandbox registration must return displaced lease accounting so the central helper can settle replaced holds",
);

const workspaceRuntimeSession = read("convex/workspaceRuntimeSession.ts");
const runtimeExecutionSession = read("convex/runtimeExecutionSession.ts");
assert.match(
  workspaceRuntimeSession,
  /createBlaxelRuntimeWorkspaceSession[\s\S]*ensureBillableBlaxelWorkspaceComputer/,
  "runtime workspace session must use the centralized billable Blaxel wake helper",
);
assert.doesNotMatch(
  workspaceRuntimeSession,
  /reuseExistingLease: true/,
  "runtime workspace sessions must not reuse an interactive/file lease because each run needs a settleable reservation",
);
assert.match(
  workspaceRuntimeSession,
  /releaseRuntimeWorkspaceSessionAccountingIfCurrent[\s\S]*releaseProjectBackgroundSandboxAccountingIfCurrentInternal[\s\S]*providerSandboxCreditReservationKey[\s\S]*providerSandboxStartedAt/,
  "runtime workspace session release must clear project accounting through an expected-value guarded mutation",
);
assert.match(
  workspaceTerminals,
  /releaseProjectBackgroundSandboxAccountingIfCurrentInternal[\s\S]*providerSandboxId[\s\S]*providerSandboxCreditReservationKey[\s\S]*providerSandboxStartedAt[\s\S]*providerSandboxState: "standby"[\s\S]*providerSandboxCreditReservationKey: undefined/,
  "guarded runtime release must only mark standby and clear accounting when sandbox, reservation, and started-at values still match",
);
assert.match(
  workspaceTerminals,
  /readProjectSandboxActiveTerminalStatusInternal[\s\S]*by_providerSandboxId[\s\S]*ownerId[\s\S]*projectId[\s\S]*isTerminalActiveStatus/,
  "terminal-backed runtime release decisions must read current active terminal truth for the project sandbox",
);
assert.match(
  workspaceTerminals,
  /refreshProjectSandboxActiveTerminalStatusInternal[\s\S]*listWorkspaceTerminalSessionsBySandboxInternal[\s\S]*isTerminalActiveStatus[\s\S]*readWorkspaceTerminalProcess[\s\S]*readProjectSandboxActiveTerminalStatusInternal/,
  "terminal-backed runtime release decisions must refresh active terminal rows against Blaxel before reading terminal truth",
);
assert.match(
  runtimeExecutionSession,
  /resolveWorkspaceSessionAccountingReleaseDecision[\s\S]*refreshProjectSandboxActiveTerminalStatusInternal[\s\S]*active_terminal_still_running[\s\S]*no_active_terminal_remaining[\s\S]*active_terminal_refresh_failed/,
  "runtime dispose must always refresh terminal truth before deciding whether to release workspace accounting",
);
assert.doesNotMatch(
  runtimeExecutionSession,
  /no_terminal_started/,
  "runtime release decisions must not assume no active terminal just because this turn did not start one",
);
assert.match(
  runtimeExecutionSession,
  /resolveWorkspaceSessionAccountingReleaseDecision[\s\S]*if \(!releaseDecision\.shouldRelease\)[\s\S]*workspace_session_accounting_kept_alive[\s\S]*return;[\s\S]*settleRuntimeWorkspaceSession[\s\S]*releaseRuntimeWorkspaceSessionAccountingIfCurrent[\s\S]*workspace_session_accounting_release_checked/,
  "runtime dispose must keep active-terminal reservations alive before settlement, and only settle/release after terminal truth says release is safe",
);
assert.match(
  runtimeExecutionSession,
  /workspace_session_accounting_kept_alive[\s\S]*active_terminal_count[\s\S]*checked_terminal_count[\s\S]*refreshed_terminal_count[\s\S]*error_message/,
  "runtime dispose must keep workspace accounting alive only with refreshed active-terminal evidence or failed terminal-truth refresh",
);
assert.doesNotMatch(
  runtimeExecutionSession,
  /workspaceSessionStartedPersistentTerminal|persistent_terminal_started/,
  "terminal_start alone must not be the reason to skip one-shot project accounting release",
);

const workspaceRuntimeTools = read("convex/workspaceRuntimeTools.ts");
assert.match(
  workspaceRuntimeTools,
  /reensureBlaxelRuntimeWorkspace[\s\S]*reensureBlaxelWorkspaceComputerForPaidSession/,
  "runtime workspace reensure must stay behind the paid-session wake helper",
);

const blaxelWorkspaceWake = read("convex/blaxelWorkspaceWake.ts");
const paidToolCreditReservation = read("convex/paidToolCreditReservation.ts");
const workspaceCredits = read("convex/workspaceCredits.ts");
const crons = read("convex/crons.ts");
const threads = read("convex/threads.ts");
const blaxelWorkspaceClient = read("convex/blaxelWorkspaceClient.ts");
const blaxelWorkspaceVolumeQuota = read("convex/blaxelWorkspaceVolumeQuota.ts");
const blaxelEnvExample = read(".env.blaxel.local.example");
const workspaceProviderContract = read("docs/workspace-computer-provider-contract.md");
assert.match(
  blaxelWorkspaceClient,
  /providerVolumeLimit: readOptionalPositiveIntegerEnv\("BLAXEL_WORKSPACE_VOLUME_LIMIT"\)[\s\S]*providerVolumeSafetyBuffer: readNonNegativeIntegerEnv\([\s\S]*"BLAXEL_WORKSPACE_VOLUME_SAFETY_BUFFER"/,
  "Blaxel workspace config must expose provider volume quota settings",
);
assert.match(
  blaxelWorkspaceClient,
  /agentRunIdleDeleteAfter:[\s\S]*readEnv\("BLAXEL_WORKSPACE_AGENT_RUN_IDLE_DELETE_AFTER"\)[\s\S]*WORKSPACE_COMPUTER_LIFECYCLE_POLICY\.agent_run\.idleDeleteAfter/,
  "Blaxel workspace config must expose an explicit agent-run idle lifecycle override",
);
assert.match(
  blaxelWorkspaceClient,
  /intent === "file_inspection"[\s\S]*fileInspectionIdleDeleteAfter[\s\S]*intent === "agent_run"[\s\S]*agentRunIdleDeleteAfter[\s\S]*interactiveIdleDeleteAfter/,
  "Blaxel lifecycle resolver must keep file inspection, agent-run, and interactive idle policies separate",
);
assert.match(
  blaxelWorkspaceClient,
  /readBlaxelWorkspaceVolumeQuotaSnapshot[\s\S]*listBlaxelWorkspaceVolumes\(\)[\s\S]*providerVolumeCount: volumes\.rawCount[\s\S]*providerVolumeLimit[\s\S]*providerVolumeSafetyBuffer/,
  "Blaxel provider quota snapshots must use live provider inventory counts",
);
assert.match(
  blaxelWorkspaceVolumeQuota,
  /hasExistingUndeletedProjectVolume[\s\S]*workspaceVolumeRetentionState[\s\S]*workspaceVolumeDeletedAt[\s\S]*readBlaxelWorkspaceVolumeQuotaAdmissionArgs[\s\S]*if \(!project\)[\s\S]*source: "project_absent"[\s\S]*hasExistingUndeletedProjectVolume\(project\)[\s\S]*source: "existing_volume"[\s\S]*readBlaxelWorkspaceVolumeQuotaSnapshot/,
  "Blaxel quota admission must avoid live provider inventory when no new provider volume can be claimed",
);
assert.match(
  blaxelEnvExample,
  /BLAXEL_WORKSPACE_VOLUME_LIMIT=""[\s\S]*BLAXEL_WORKSPACE_VOLUME_SAFETY_BUFFER="1"[\s\S]*BLAXEL_WORKSPACE_FILE_INSPECTION_IDLE_DELETE_AFTER="30s"[\s\S]*BLAXEL_WORKSPACE_AGENT_RUN_IDLE_DELETE_AFTER="10m"[\s\S]*BLAXEL_WORKSPACE_INTERACTIVE_IDLE_DELETE_AFTER="30m"[\s\S]*BLAXEL_WORKSPACE_NON_AGENT_MAX_AGE_DELETE_AFTER="1h"/,
  "local Blaxel staging env example must document provider quota and intent-specific lifecycle guards",
);
assert.match(
  workspaceProviderContract,
  /Provider quota is also admission evidence[\s\S]*BLAXEL_WORKSPACE_VOLUME_LIMIT[\s\S]*BLAXEL_WORKSPACE_VOLUME_SAFETY_BUFFER[\s\S]*Existing undeleted project volumes skip the provider inventory check[\s\S]*agent_run[\s\S]*ttl-idle: 10m[\s\S]*BLAXEL_WORKSPACE_AGENT_RUN_IDLE_DELETE_AFTER/,
  "workspace provider contract must document provider quota admission evidence and agent-run lifecycle policy",
);
assert.match(
  blaxelWorkspaceWake,
  /evaluateWorkspaceSandboxStartAdmission[\s\S]*reserveCreditsInternal/,
  "central Blaxel wake helper must reserve credits only after sandbox admission",
);
assert.match(
  blaxelWorkspaceWake,
  /hasPersistedWorkspaceCardOnFile[\s\S]*paymentMethodStatus === "active"[\s\S]*providerDefaultPaymentMethodId[\s\S]*pm_/,
  "central Blaxel wake helper must read persisted card-on-file truth before workspace admission",
);
assert.match(
  blaxelWorkspaceWake,
  /evaluateWorkspaceSandboxStartAdmission\(\{[\s\S]*hasCardOnFile,[\s\S]*workspaceCreditBalance,[\s\S]*requiredCredits: creditBudgetCredits/,
  "central Blaxel wake admission must pass card-on-file truth into sandbox start admission",
);
assert.match(
  blaxelWorkspaceWake,
  /metadata: reservationMetadata,[\s\S]*allowUncollectedReservation: hasCardOnFile,[\s\S]*uncollectedReservationLimitCredits: hasCardOnFile[\s\S]*WORKSPACE_CARD_BACKED_UNCOLLECTED_LIMIT_CREDITS/,
  "central Blaxel wake reservations must allow card-backed settlement only when a card is on file",
);
assert.match(
  paidToolCreditReservation,
  /getUserStripeCustomerInternal[\s\S]*hasPersistedWorkspaceCardOnFile[\s\S]*evaluatePaidToolStartAdmission[\s\S]*allowUncollectedReservation: hasCardOnFile[\s\S]*uncollectedReservationLimitCredits: hasCardOnFile[\s\S]*WORKSPACE_CARD_BACKED_UNCOLLECTED_LIMIT_CREDITS/,
  "central paid-tool reservations must use the same card-backed admission and exposure ceiling as workspace tools",
);
assert.match(
  paidToolCreditReservation,
  /billing_mode: billingMode[\s\S]*funding_source: fundingSource[\s\S]*card_backed_uncollected_limit_credits/,
  "central paid-tool reservation metadata must distinguish card-backed and prepaid funding",
);
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");
const httpVoice = read("convex/httpVoice.ts");
assert.match(
  runtimeAgentLoop,
  /web_crawl[\s\S]*reservePaidToolCredits\([\s\S]*toolKind: "web_research"[\s\S]*toolName: "web_research"[\s\S]*action: "crawl"/,
  "web crawl must use card-aware web research billing",
);
assert.match(
  runtimeAgentLoop,
  /web_research[\s\S]*reservePaidToolCredits\([\s\S]*toolKind: "web_research"[\s\S]*toolName: "web_research"[\s\S]*action,/,
  "web research must use card-aware premium-tool billing",
);
assert.match(
  httpVoice,
  /reservePaidToolCredits\([\s\S]*toolKind: "voice_input"[\s\S]*toolName: "voice_transcribe"/,
  "voice input must use card-aware premium-tool billing",
);
assert.match(
  blaxelWorkspaceWake,
  /billing_mode: workspaceBillingMode[\s\S]*funding_source: hasCardOnFile \? "card_on_file" : "prepaid_balance"/,
  "central Blaxel wake reservation metadata must distinguish card-backed and prepaid funding",
);
assert.match(
  blaxelWorkspaceWake,
  /readBlaxelWorkspaceVolumeQuotaAdmissionArgs\(\{[\s\S]*prepareCloudProjectVolumeMaterializationInternal[\s\S]*providerVolumeCount: quotaAdmissionArgs\.providerVolumeCount[\s\S]*providerVolumeLimit: quotaAdmissionArgs\.providerVolumeLimit[\s\S]*providerVolumeSafetyBuffer: quotaAdmissionArgs\.providerVolumeSafetyBuffer/,
  "central Blaxel wake helper must capture provider quota truth before materializing a volume",
);
assert.match(
  blaxelWorkspaceWake,
  /prepareCloudProjectVolumeMaterializationInternal[\s\S]*reserveWorkspaceWakeCredits[\s\S]*ensureBlaxelWorkspaceComputer[\s\S]*setProjectBackgroundSandboxInternal/,
  "central Blaxel wake helper must own volume admission, credit reservation, provider ensure, and project pointer registration",
);
assert.match(
  blaxelWorkspaceWake,
  /resolveReusableProjectWorkspaceLease[\s\S]*getCreditLedgerEntryByKeyInternal[\s\S]*ledgerEntry\.status !== "reserved"[\s\S]*inspectBlaxelWorkspaceComputer/,
  "central Blaxel wake helper must only reuse live provider sandboxes with still-reserved credit leases",
);
assert.match(
  blaxelWorkspaceWake,
  /resolveWorkspaceLeaseLifecycleIntentFromAction[\s\S]*workspace_file_inspection[\s\S]*file_inspection[\s\S]*interactive_workspace_computer[\s\S]*project_zip_import[\s\S]*interactive[\s\S]*runtime_workspace_session[\s\S]*agent_run/,
  "workspace lease actions must map to the same lifecycle ranks used by the provider layer",
);
assert.match(
  blaxelWorkspaceClient,
  /isBlaxelWorkspaceSandboxTerminalState[\s\S]*"stopped"[\s\S]*"terminated"[\s\S]*terminalBlaxelSandboxFailure/,
  "Blaxel provider client must classify terminal sandbox states as non-reusable",
);
assert.match(
  blaxelWorkspaceClient,
  /ensureBlaxelWorkspaceSandbox[\s\S]*sandboxStateFrom\(existingSandbox\)[\s\S]*isBlaxelWorkspaceSandboxTerminalState\(existingState\)[\s\S]*SandboxInstance\.delete\(sandboxName\)[\s\S]*SandboxInstance\.createIfNotExists/,
  "Blaxel ensure must delete terminal sandboxes before provider recreation instead of reporting a dead sandbox as active",
);
assert.match(
  blaxelWorkspaceClient,
  /function isBlaxelWorkspaceSandboxProvisioningState[\s\S]*"deploying"[\s\S]*provisioningBlaxelSandboxFailure/,
  "Blaxel provider client must classify provisioning sandbox states as not ready",
);
assert.match(
  blaxelWorkspaceClient,
  /ensureBlaxelWorkspaceSandbox[\s\S]*isBlaxelWorkspaceSandboxProvisioningState\(existingState\)[\s\S]*SandboxInstance\.delete\(sandboxName\)[\s\S]*const createdState = sandboxStateFrom\(sandbox\)[\s\S]*isBlaxelWorkspaceSandboxProvisioningState\(createdState\)[\s\S]*return provisioningBlaxelSandboxFailure\(createdState\)/,
  "Blaxel ensure must replace stuck provisioning sandboxes and must not report newly provisioning sandboxes as active",
);
assert.match(
  blaxelWorkspaceClient,
  /resolveBlaxelWorkspaceSandboxIfReady[\s\S]*isBlaxelWorkspaceSandboxProvisioningState\(state\)[\s\S]*return provisioningBlaxelSandboxFailure\(state\)/,
  "Blaxel command resolution must reject provisioning sandboxes before process execution",
);
assert.match(
  blaxelWorkspaceWake,
  /resolveReusableProjectWorkspaceLease[\s\S]*inspectBlaxelWorkspaceComputer[\s\S]*isBlaxelWorkspaceSandboxTerminalState\(inspected\.state\)[\s\S]*return null/,
  "reusable Blaxel workspace leases must not reuse provider sandboxes in terminal states",
);
assert.match(
  blaxelWorkspaceWake,
  /resolveReusableProjectWorkspaceLease[\s\S]*String\(ledgerEntry\.userId \?\? ""\) !== String\(params\.ownerId \?\? ""\)[\s\S]*normalizeOptionalString\(ledgerEntry\.projectId\) !== String\(params\.projectId\)/,
  "reusable Blaxel workspace leases must be bound to the same owner and project as the current request",
);
assert.match(
  blaxelWorkspaceWake,
  /projectCreditBudgetExpiresAt <= Date\.now\(\)[\s\S]*ledgerExpiresAt <= Date\.now\(\)[\s\S]*Math\.min\(projectCreditBudgetExpiresAt, ledgerExpiresAt\)/,
  "reusable Blaxel workspace leases must honor both project and ledger expiry clocks",
);
assert.match(
  blaxelWorkspaceWake,
  /params\.reuseExistingLease === true[\s\S]*resolveReusableProjectWorkspaceLease[\s\S]*if \(reusable\) return reusable;[\s\S]*reserveWorkspaceWakeCredits/,
  "central Blaxel wake helper must try explicit lease reuse before creating a new reservation",
);
assert.match(
  blaxelWorkspaceWake,
  /canReuseWorkspaceLeaseForIntent[\s\S]*compareWorkspaceComputerLifecycleIntents[\s\S]*requestedLifecycleIntent[\s\S]*resolveReusableProjectWorkspaceLease[\s\S]*canReuseWorkspaceLeaseForIntent/,
  "reusable Blaxel workspace leases must reject weaker lifecycle reservations instead of downgrading the requested lease",
);
assert.doesNotMatch(
  blaxelWorkspaceWake,
  /isRuntimeWorkspaceSessionLeaseLedgerEntry\(ledgerEntry\)[\s\S]*isRunningRuntimeWorkspaceSessionLease/,
  "project-attached runtime workspace leases must be reusable by project pointer truth after the original run ends",
);
assert.match(
  blaxelWorkspaceWake,
  /resolveReusableProjectWorkspaceLease[\s\S]*providerSandboxCreditReservationKey[\s\S]*ledgerEntry\.status !== "reserved"[\s\S]*canReuseWorkspaceLeaseForIntent[\s\S]*inspectBlaxelWorkspaceComputer/,
  "reusable Blaxel workspace leases must trust the matched active project pointer instead of the original runtime-run status",
);
assert.match(
  blaxelWorkspaceWake,
  /finalizeExistingProjectWorkspaceLeaseBeforeReplacement[\s\S]*settlementReason: "workspace_project_lease_replaced"[\s\S]*releaseReason: "workspace_project_lease_replaced_before_start"[\s\S]*setProjectBackgroundSandboxInternal/,
  "central Blaxel wake helper must settle a displaced project lease reservation before installing the replacement pointer",
);
assert.match(
  blaxelWorkspaceWake,
  /settleBillableBlaxelWorkspaceLeaseBestEffort[\s\S]*providerSandboxCreditReservationKey[\s\S]*settleReservedCreditsBestEffort[\s\S]*status: "succeeded"/,
  "central Blaxel wake helper must expose an explicit settlement path for reusable project workspace leases",
);
assert.match(
  blaxelWorkspaceWake,
  /settleBillableBlaxelWorkspaceLeaseBestEffort[\s\S]*getCreditLedgerEntryByKeyInternal[\s\S]*ledgerEntry\.status !== "reserved"[\s\S]*String\(ledgerEntry\.userId \?\? ""\) !== String\(params\.ownerId \?\? ""\)[\s\S]*normalizeOptionalString\(ledgerEntry\.projectId\) !== String\(params\.projectId\)/,
  "project workspace lease settlement must validate the ledger row before settling by credit key",
);
assert.match(
  workspaceTerminals,
  /stopProjectWorkspaceComputer[\s\S]*settleBillableBlaxelWorkspaceLeaseBestEffort[\s\S]*clearSandboxAccounting: true/,
  "manual workspace stop must settle and clear the reusable project lease accounting pointer",
);
assert.match(
  projects,
  /deleteCloudProjectForOwner[\s\S]*finalizeBillableBlaxelProjectWorkspaceLease[\s\S]*requireLedgerWrite: true[\s\S]*destroyBlaxelWorkspaceSandbox[\s\S]*destroyBlaxelWorkspaceVolume[\s\S]*deleteCloudProjectInternal/,
  "project deletion must finalize the active Blaxel project lease before destroying provider resources and deleting project truth",
);
assert.match(
  blaxelWorkspaceWake,
  /finalizeExpiredBlaxelProjectWorkspaceLeasesInternal[\s\S]*listExpiredBlaxelProjectWorkspaceLeasesInternal[\s\S]*listBlaxelProjectWorkspaceLeasesMissingProjectExpiryInternal[\s\S]*finalizeBillableBlaxelProjectWorkspaceLease[\s\S]*requireLedgerWrite: true[\s\S]*requireExpiredReservation: true[\s\S]*clearProjectAccounting: true/,
  "expired reusable Blaxel project leases must settle through a provider-aware finalizer instead of generic release expiry",
);
assert.match(
  blaxelWorkspaceWake,
  /ledgerOwnerMatches[\s\S]*ledgerProjectMatches[\s\S]*!isBlaxelWorkspaceLeaseLedgerEntry\(ledgerEntry\)[\s\S]*skipped_unsupported_action/,
  "project finalization must accept any Blaxel workspace lease action owned by the project pointer, including runtime workspace sessions",
);
assert.doesNotMatch(
  blaxelWorkspaceWake,
  /isProjectFinalizableBlaxelWorkspaceLeaseLedgerEntry/,
  "project finalization must not keep an action-type exclusion wrapper",
);
assert.match(
  workspaceCredits,
  /isBlaxelRuntimeWorkspaceReservation[\s\S]*runtime_workspace_session[\s\S]*hasActiveBlaxelProjectWorkspaceLeasePointer[\s\S]*isBlaxelWorkspaceComputeReservation\(entry\)[\s\S]*providerSandboxCreditReservationKey/,
  "workspace reservation cleanup must let the active project pointer protect any current Blaxel workspace lease action",
);
assert.doesNotMatch(
  workspaceCredits,
  /hasActiveBlaxelProjectWorkspaceLeasePointer[\s\S]*isBlaxelProjectWorkspaceLeaseReservation/,
  "project-pointer lease protection must not exclude runtime workspace sessions by action type",
);
assert.match(
  workspaceCredits,
  /hasRunningRuntimeRunForWorkspaceReservation[\s\S]*by_owner_runId[\s\S]*status[\s\S]*running[\s\S]*projectId/,
  "runtime workspace reservation cleanup must validate an active matching runtime run by run id and project id",
);
assert.match(
  workspaceCredits,
  /hasActiveBlaxelProjectWorkspaceLeasePointer[\s\S]*providerSandboxCreditReservationKey[\s\S]*shouldSkipExpiredBlaxelWorkspaceReservation[\s\S]*await hasActiveBlaxelProjectWorkspaceLeasePointer\(ctx, entry\)[\s\S]*isBlaxelRuntimeWorkspaceReservation\(entry\)[\s\S]*hasRunningRuntimeRunForWorkspaceReservation[\s\S]*reconcileExpiredCreditReservationsInternal[\s\S]*await shouldSkipExpiredBlaxelWorkspaceReservation\(ctx, entry\)/,
  "generic expired reservation cleanup must protect the active project pointer first, then fall back to active runtime-run truth",
);
assert.match(
  threads,
  /RUNTIME_RUN_STALE_AFTER_MS = 8 \* 60 \* 1000[\s\S]*listStaleRunningRuntimeRunsInternal[\s\S]*by_status_updatedAt[\s\S]*finalizeStaleCloudRuntimeRunInternal[\s\S]*stale_runtime_workspace_run_reconciled/,
  "stale runtime workspace cleanup must use an 8 minute liveness wall and indexed updatedAt scan",
);
assert.match(
  workspaceCredits,
  /reconcileStaleRuntimeWorkspaceRunsInternal[\s\S]*listStaleRunningRuntimeRunsInternal[\s\S]*listReservedBlaxelRuntimeWorkspaceReservationsByRunInternal[\s\S]*hasRuntimeWorkspaceEvidence[\s\S]*recordWorkspaceComputeChargeInternal[\s\S]*queueCreditSettlementRetryInternal[\s\S]*finalizeStaleCloudRuntimeRunInternal/,
  "stale runtime workspace cleanup must settle or retry reservations before finalizing the stale run",
);
assert.match(
  crons,
  /reconcile stale runtime workspace runs[\s\S]*minutes: 5[\s\S]*reconcileStaleRuntimeWorkspaceRunsInternal[\s\S]*finalize expired blaxel project workspace leases[\s\S]*blaxelWorkspaceWake\.finalizeExpiredBlaxelProjectWorkspaceLeasesInternal[\s\S]*reconcile expired credit reservations/,
  "stale runtime workspace cleanup must run before provider lease finalization and generic expired-reservation cleanup",
);
for (const [path, source] of [
  ["convex/projects.ts", projects],
  ["convex/workspaceInspector.ts", workspaceInspector],
  ["convex/workspaceTerminals.ts", workspaceTerminals],
  ["convex/workspaceRuntimeSession.ts", workspaceRuntimeSession],
  ["convex/workspaceRuntimeTools.ts", workspaceRuntimeTools],
] as const) {
  assert.doesNotMatch(
    source,
    /ensureBlaxelWorkspaceComputer\(/,
    `${path} must not call the low-level Blaxel provider wake directly`,
  );
}
assert.match(
  workspaceRuntimeSession,
  /creditBudgetExpiresAt: ensured\.creditBudgetExpiresAt/,
  "runtime workspace session must preserve the central wake reservation expiry",
);

const appErrorMappings = read("shared/appErrorMappings.ts");
assert.match(
  appErrorMappings,
  /workspace_volume_limit_reached/,
  "workspace volume limit errors must have a user-facing mapping",
);
assert.match(
  appErrorMappings,
  /workspace_volume_funding_required/,
  "workspace volume funding errors must have a user-facing mapping",
);
assert.match(
  appErrorMappings,
  /workspace_card_required_for_additional_volume/,
  "workspace card-required errors must have a user-facing mapping",
);
assert.match(
  appErrorMappings,
  /workspace_uncollected_usage_blocked/,
  "workspace uncollected-usage errors must have a user-facing mapping",
);

const schema = read("convex/schema.ts");
assert.match(
  schema,
  /userStripeCustomers[\s\S]*paymentMethodStatus[\s\S]*providerDefaultPaymentMethodId[\s\S]*paymentMethodCheckedAt/,
  "Stripe customer rows must persist explicit card-on-file truth",
);
assert.match(
  schema,
  /by_providerDefaultPaymentMethodId/,
  "Stripe customer rows must be queryable by default payment method for detach reconciliation",
);

const stripeCustomers = read("convex/stripeCustomers.ts");
const stripeCustomerIdempotency = read("shared/stripeCustomerIdempotency.ts");
assert.match(
  stripeCustomers,
  /startWorkspaceCardSetupCheckout[\s\S]*mode: "setup"[\s\S]*payment_method_types: \["card"\]/,
  "card-on-file setup must use Stripe hosted setup checkout",
);
assert.match(
  stripeCustomers,
  /findUsableCustomerPaymentMethod[\s\S]*paymentMethods\.list/,
  "card-on-file refresh must inspect Stripe payment methods",
);
assert.match(
  stripeCustomers,
  /refreshWorkspaceCardOnFileStatus[\s\S]*syncUserStripeCustomerPaymentMethodInternal/,
  "card-on-file refresh must inspect Stripe payment methods and persist the result",
);
assert.match(
  stripeCustomers,
  /syncUserStripeCustomerPaymentMethodInternal[\s\S]*paymentMethodStatus[\s\S]*providerDefaultPaymentMethodId/,
  "card-on-file sync must update explicit payment method fields",
);
assert.match(
  stripeCustomers,
  /buildSyncStripeCustomerPaymentMethodPatch/,
  "card-on-file sync must delegate idempotent field normalization to the shared helper",
);
assert.match(
  stripeCustomers,
  /getUserStripeCustomerByProviderPaymentMethodIdInternal[\s\S]*by_providerDefaultPaymentMethodId/,
  "card detach reconciliation must resolve local customers by payment method id",
);
assert.match(
  stripeCustomerIdempotency,
  /const active = args\.status === "active" && Boolean\(desiredPaymentMethodId\)[\s\S]*paymentMethodStatus[\s\S]*args\.status === "active"[\s\S]*"missing"/,
  "card-on-file sync must fail closed when active status lacks a valid Stripe payment method id",
);
assert.match(
  stripeCustomerIdempotency,
  /cardRemovedAt: active \? undefined : args\.nowMs[\s\S]*else if \(hadCardMaterial && !hasRemovedAt\)[\s\S]*patch\.cardRemovedAt = args\.nowMs/,
  "missing or detached card sync must clear active card truth",
);

const billing = read("convex/billing.ts");
assert.match(
  billing,
  /startWorkspaceCardSetupCheckout[\s\S]*refreshWorkspaceCardOnFileStatus/,
  "billing surface must export card setup and refresh actions",
);

const httpBilling = read("convex/httpBilling.ts");
assert.match(
  httpBilling,
  /checkout_mode"\) === "workspace_card_setup"[\s\S]*setupIntents\.retrieve[\s\S]*syncWorkspaceCardTruthForStripeCustomer/,
  "Stripe webhook must sync hosted card setup completion into persisted card truth",
);
assert.match(
  httpBilling,
  /event\.type === "payment_method\.detached"[\s\S]*syncWorkspaceCardTruthForStripeCustomer[\s\S]*missingStatus: "detached"/,
  "Stripe webhook must reconcile detached payment methods",
);
assert.match(
  httpBilling,
  /event\.type === "customer\.updated"[\s\S]*syncWorkspaceCardTruthForStripeCustomer/,
  "Stripe webhook must reconcile customer default payment method changes",
);
assert.match(
  httpBilling,
  /event\.type === "setup_intent\.succeeded"[\s\S]*workspace_card_setup[\s\S]*syncWorkspaceCardTruthForStripeCustomer/,
  "Stripe webhook must handle setup-intent completion as a card setup backup",
);

const accountCommerceGateway = read("shared/cloudAccountCommerceGateway.ts");
assert.match(
  accountCommerceGateway,
  /startCloudWorkspaceCardSetupCheckout[\s\S]*billing:startWorkspaceCardSetupCheckout/,
  "web gateway must expose card setup checkout",
);
assert.match(
  accountCommerceGateway,
  /refreshCloudWorkspaceCardOnFileStatus[\s\S]*billing:refreshWorkspaceCardOnFileStatus/,
  "web gateway must expose card-on-file refresh",
);

const workspaceTerminalsGateway = read("shared/workspaceTerminalsGateway.ts");
assert.match(
  workspaceTerminalsGateway,
  /normalizePaidUsageBillingMode[\s\S]*details\.paid_usage_billing_mode[\s\S]*details\.paidUsageBillingMode/,
  "workspace computer start gateway must preserve backend-paid usage billing mode",
);

const workspaceInspectorGateway = read("shared/workspaceInspectorGateway.ts");
assert.match(
  workspaceInspectorGateway,
  /normalizeFailure[\s\S]*details\.paid_usage_billing_mode[\s\S]*details\.paidUsageBillingMode/,
  "workspace inspector gateway must preserve backend-paid usage billing mode",
);

assert.match(
  workspaceInspector,
  /function mapFailure\([\s\S]*details\?: Record<string, unknown>[\s\S]*details: result\.details/,
  "workspace inspector action must not drop Blaxel wake failure details before the gateway sees them",
);

const app = read("apps/web/src/App.tsx");
assert.match(
  app,
  /workspace_volume_funding_required[\s\S]*openWorkspaceStorageBillingModal[\s\S]*funding_required/,
  "workspace volume funding failures must open the storage billing modal",
);
assert.match(
  app,
  /workspace_card_required_for_additional_volume[\s\S]*openWorkspaceStorageBillingModal[\s\S]*card_required/,
  "second-volume card-required failures must open the card setup modal path",
);
assert.match(
  app,
  /workspace_credits_exhausted[\s\S]*openWorkspaceCreditTopupModal\(\{[\s\S]*paidUsageBillingMode: result\.paidUsageBillingMode/,
  "workspace computer credit failures must pass backend-selected billing mode into the modal",
);
assert.match(
  app,
  /startWorkspaceCardSetupCheckout[\s\S]*startCloudWorkspaceCardSetupCheckout[\s\S]*markPendingWorkspaceCardSetupReturn/,
  "card setup checkout must mark a return refresh",
);
assert.match(
  app,
  /setWorkspaceCardSetupError\(\s*formatWorkspaceBillingCheckoutError\(error, \{ kind: "card_setup" \}\),\s*\)/,
  "card setup checkout failures must be sanitized before reaching the billing modal",
);
assert.match(
  app,
  /loadWorkspaceCardOnFileStatus[\s\S]*catch \(error\)[\s\S]*formatWorkspaceBillingCheckoutError\(error, \{ kind: "card_setup" \}\)[\s\S]*setWorkspaceCardOnFileError\(message\)/,
  "card status load failures must be sanitized before reaching settings",
);
assert.match(
  app,
  /refreshPendingWorkspaceCardSetup[\s\S]*catch\(\(error\) => \{[\s\S]*formatWorkspaceBillingCheckoutError\(error, \{ kind: "card_setup" \}\)[\s\S]*setWorkspaceCardSetupError\(message\)[\s\S]*setWorkspaceCardOnFileError\(message\)/,
  "card setup return-refresh failures must be sanitized before reaching billing UI",
);
assert.match(
  app,
  /setWorkspaceCreditTopupError\(\s*formatWorkspaceBillingCheckoutError\(error, \{ kind: "manual_balance" \}\),\s*\)/,
  "manual balance checkout failures must be sanitized before reaching the billing modal",
);
assert.match(
  appErrorMappings,
  /getWorkspaceBillingCheckoutFallback[\s\S]*Card setup is temporarily unavailable[\s\S]*formatWorkspaceBillingCheckoutError[\s\S]*stripe_secret_key_missing/,
  "workspace billing checkout formatter must hide raw Stripe configuration errors",
);

const inferenceIssueModal = read("apps/web/src/components/WebInferenceIssueModal.tsx");
assert.match(
  inferenceIssueModal,
  /paidUsageBillingMode[\s\S]*card_required[\s\S]*Add card/,
  "workspace billing modal must render an Add card path",
);
assert.match(
  inferenceIssueModal,
  /manualBalanceAllowed[\s\S]*paidUsageBillingMode !== "card_required"[\s\S]*shouldShowToolBalancePacks[\s\S]*paidUsageBillingMode === "prepaid_required"[\s\S]*manualBalanceAllowed && showManualBalance/,
  "card-required volume admission must not show prepaid packs as a workaround",
);
assert.match(
  inferenceIssueModal,
  /requiresWorkspaceCardSetup[\s\S]*paidUsageBillingMode === "card_required"[\s\S]*paidUsageBillingMode === "card_preferred"/,
  "card setup must only render for explicit card billing modes",
);
assert.match(
  inferenceIssueModal,
  /Prefer prepaid balance\? Add balance manually\./,
  "manual prepaid balance must be hidden behind an explicit secondary link",
);
assert.match(
  inferenceIssueModal,
  /paidToolUiLabel[\s\S]*workspace_tools[\s\S]*web_research[\s\S]*voice_input[\s\S]*Add a card to use \$\{paidToolLabel\}[\s\S]*No charge today[\s\S]*Usage is billed only when premium tools run\./,
  "card-first paid-tool billing modal copy must stay short and tool-aware",
);
assert.match(
  inferenceIssueModal,
  /workspace-billing-trust-panel/,
  "card-first workspace billing modal must render the billing truth in a dedicated readable panel",
);
assert.match(
  inferenceIssueModal,
  /!\s*requiresWorkspaceCardSetup\s*&&\s*\([\s\S]*<div className="modal-footer"/,
  "card-first workspace billing modal should rely on the close icon instead of a duplicate Cancel footer",
);
assert.doesNotMatch(
  inferenceIssueModal,
  /Manual prepaid balance is still available below|Save a card so workspace tools can run/,
  "card-first workspace billing modal must not reintroduce deleted explanatory copy",
);
assert.match(
  app,
  /workspace_volume_funding_required[\s\S]*openWorkspaceStorageBillingModal[\s\S]*funding_required/,
  "volume funding failures must map to an explicit paid usage billing mode",
);
assert.match(
  app,
  /paidUsageBillingMode:\s*paidUsageBillingModeForWorkspaceStorageAction\(params\.action\)/,
  "workspace storage billing actions must be translated through the shared billing-mode contract",
);
assert.match(
  app,
  /paidUsageBillingModeForPaidToolFailure/,
  "generic paid-tool failures must not silently inherit card-first workspace storage UI",
);
assert.match(
  app,
  /onOpenWorkspaceCreditTopup:[\s\S]*setActiveView\("settings"\)[\s\S]*setSettingsPage\("billing"\)/,
  "right-panel workspace billing action must open the canonical billing settings page",
);

const paidUsageBilling = read("shared/paidUsageBilling.ts");
assert.match(
  paidUsageBilling,
  /workspace_card_required_for_additional_volume[\s\S]*paidUsageBillingMode: "card_required"/,
  "shared paid-usage classifier must force second-volume failures to card-required",
);
assert.match(
  paidUsageBilling,
  /workspace_volume_funding_required[\s\S]*paidUsageBillingMode: "card_preferred"/,
  "shared paid-usage classifier must map first-volume funding failures to card-preferred",
);

const cloudFunctionErrorCore = read("shared/cloudFunctionErrorCore.ts");
assert.match(
  cloudFunctionErrorCore,
  /classifyPaidUsageFailure\(\{[\s\S]*code[\s\S]*paidUsageBillingMode/,
  "cloud function errors must classify storage/card admission codes as paid-usage modal issues",
);

const runtimeKernel = read("shared/runtimeKernel.ts");
assert.match(
  runtimeKernel,
  /classifyPaidUsageFailure\(\{[\s\S]*code: toolResult\.errorCode[\s\S]*paidUsageBillingMode/,
  "runtime kernel must treat agent workspace admission failures as terminal billing signals",
);
assert.doesNotMatch(
  runtimeKernel,
  /function normalizeToolBalanceTerminalCode/,
  "runtime kernel must not preserve the legacy two-code-only billing recognizer",
);

const useWebTurnRunnerController = read("shared/useWebTurnRunnerController.ts");
assert.match(
  useWebTurnRunnerController,
  /classifyPaidUsageFailure\(\{[\s\S]*code: failure\.code[\s\S]*paidUsageBillingMode: failure\.paidUsageBillingMode/,
  "HTTP runtime failures must use the shared paid-usage classifier before opening billing UI",
);
assert.match(
  useWebTurnRunnerController,
  /classifyPaidUsageFailure\(\{[\s\S]*code,[\s\S]*paidUsageBillingMode: explicitBillingMode[\s\S]*toolKind/,
  "SSE runtime failures must use the shared paid-usage classifier before opening billing UI",
);

assert.match(
  runtimeAgentLoop,
  /if \(!created\.ok\)[\s\S]*errorCode: created\.code[\s\S]*details: \(created as \{ details\?: Record<string, unknown> \| null \}\)\.details/,
  "agent workspace-session admission failures must preserve provider/admission code and details into the runtime kernel",
);

const workspaceCreditBudgetSignal = read("convex/workspaceCreditBudgetSignal.ts");
assert.match(
  workspaceCreditBudgetSignal,
  /WORKSPACE_CREDIT_BUDGET_EXPIRED_CODE[\s\S]*WorkspaceCreditBudgetExpiredError/,
  "workspace credit budget aborts must carry a typed reason instead of an anonymous abort",
);
assert.match(
  workspaceCreditBudgetSignal,
  /const onAbort = \(\) => abort\(parentSignal\.reason\)/,
  "workspace credit budget signal must preserve parent cancellation reasons",
);

assert.match(
  workspaceRuntimeTools,
  /raceWorkspaceToolWithAbort[\s\S]*stopBlaxelWorkspaceProcess/,
  "workspace runtime tools must stop named Blaxel processes when command execution is aborted",
);
assert.match(
  workspaceRuntimeTools,
  /WORKSPACE_CREDIT_BUDGET_EXPIRED_CODE[\s\S]*workspaceBudgetExpiredFailure/,
  "workspace runtime tools must return credit-budget exhaustion as a billing failure instead of a generic crash",
);

const providerContract = read("docs/workspace-computer-provider-contract.md");
assert.doesNotMatch(
  providerContract,
  /paid\/tool-balance tier/,
  "workspace provider contract must not treat tool balance as paid-tier truth",
);
assert.match(
  providerContract,
  /card on file: ten project volumes/,
  "workspace provider contract must document card-on-file as the multi-volume tier signal",
);

console.log("workspace_resource_admission_policy_proof: ok");
