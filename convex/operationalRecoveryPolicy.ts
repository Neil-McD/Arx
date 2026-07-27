/**
 * Declarative operational-recovery contract.
 *
 * This file is planning and proof authority, not a backup, restore, mutation,
 * provider, or deployment executor. Recovery remains quarantined until the
 * staged drills and human release boundaries in the C9 contract are satisfied.
 */

export const OPERATIONAL_RECOVERY_POLICY_VERSION = "operational-recovery-v2" as const;

export const OPERATIONAL_RECOVERY_SCHEMA_BASELINE = Object.freeze({
  tableCount: 123,
  storageFieldCount: 7,
  cronRegistrationCount: 24,
  schedulerCallsiteCount: 46,
  schedulerModuleCount: 27,
  schedulerTargetKeyCount: 38,
});

export const OPERATIONAL_RECOVERY_OBJECTIVES = Object.freeze({
  scope: "staging_drill",
  status: "accepted_for_measurement",
  databaseAndFileStorageRpoMs: 24 * 60 * 60 * 1000,
  authenticatedCoreReadRtoMs: 4 * 60 * 60 * 1000,
  fullWriteAndExternalEffectRtoMs: 8 * 60 * 60 * 1000,
  productionSla: false,
});

export type OperationalRecoveryTableDisposition =
  | "restore_and_validate"
  | "restore_then_reconcile_external"
  | "restore_then_revoke_or_expire"
  | "rebuild_or_validate_projection"
  | "retain_quarantined_evidence";

export type OperationalRecoveryTablePolicy = {
  disposition: OperationalRecoveryTableDisposition;
  reason: string;
};

type OperationalRecoveryTableGroup = OperationalRecoveryTablePolicy & {
  tables: readonly string[];
};

const tableGroups: readonly OperationalRecoveryTableGroup[] = [
  {
    disposition: "restore_and_validate",
    reason:
      "Irreplaceable product or governance state is readable only after schema, reference, ownership, and domain invariants pass.",
    tables: [
      "users",
      "operatorRoles",
      "legalAcceptances",
      "userMemorySettings",
      "userProfileDetails",
      "emailPreferences",
      "personalMemoryItems",
      "memberFacts",
      "memberProfileSpines",
      "communities",
      "communityMemberships",
      "communityOnboardingConfigs",
      "communityJoinRequests",
      "communityBlocks",
      "communityFunnels",
      "communityPricePoints",
      "communityChatThreads",
      "communityChatMessages",
      "communityInteractionRoots",
      "communityInteractionReplies",
      "communityInteractionAttachments",
      "communityInteractionContentBlocks",
      "communityInteractionReactions",
      "communityInteractionModerationEvents",
      "communityInteractionLegacyChatLinks",
      "dmConversations",
      "dmParticipants",
      "dmMessages",
      "dmBlocks",
      "communityAgentConfigs",
      "developerApps",
      "skillPackages",
      "skillPackageRevisions",
      "userPlatformSkillInstalls",
      "communitySkillAttachments",
      "communityAiFeedPosts",
      "communityMemberSettings",
      "communityResources",
      "communityResourceContents",
      "communitySourceUnits",
      "communitySourceUnitContents",
      "communityResourceModules",
      "communityResourceBuilderChangesets",
      "communityEvents",
      "communitySourceTraces",
      "communityEvidenceCitations",
      "communityIntelligenceNodes",
      "communityIntelligenceEdges",
      "communityIntelligenceMutations",
      "communityIntelligenceChangeRequests",
      "communityOutcomeObservations",
      "communityCompilerDigests",
      "memberAgentChannels",
      "memberAgentEpisodes",
      "threads",
      "cloudMessages",
      "cloudThreadAttachments",
      "communityAnalyticsEvents",
      "platformBusinessVisits",
      "communityIntelligenceRetrievalLogs",
    ],
  },
  {
    disposition: "restore_then_reconcile_external",
    reason:
      "Rows that project, authorize, or receipt an external effect stay quarantined until current provider truth and idempotency state reconcile.",
    tables: [
      "userEntitlements",
      "userStripeConnectAccounts",
      "builderPartners",
      "partnerAttributions",
      "partnerCommissionLedger",
      "partnerCommissionAdjustments",
      "partnerPayoutBatches",
      "partnerPayoutTransfers",
      "partnerPayoutItems",
      "workspaceCreditBalances",
      "workspaceAutoRechargeSettings",
      "workspaceAutoRechargeAttempts",
      "workspaceComputeCharges",
      "providerCostEntries",
      "workspaceUsageCollections",
      "creditLedgerEntries",
      "checkoutSessions",
      "userStripeCustomers",
      "userProviderConnections",
      "userSourceIntegrationConnections",
      "emailOutbox",
      "emailDeliveries",
      "cloudProjects",
      "communitySubscriptions",
      "communitySubscriptionAccessBlocks",
      "communityCommerceEventEffects",
      "communityMentionBroadcasts",
      "communityAgentServeRequests",
      "communityAgentRuns",
      "communityAgentRunEvents",
      "appConnections",
      "communityAppMounts",
      "userPlatformAppMounts",
      "userPlatformAppMountSources",
      "communitySourceCrawlJobs",
      "daytonaCodexRuntimeTargets",
      "runtimeRuns",
      "runtimeRunEvents",
    ],
  },
  {
    disposition: "restore_then_revoke_or_expire",
    reason:
      "Credentials, leases, presence, upload claims, and in-progress authorization state must never become active merely because an older snapshot contains them.",
    tables: [
      "authSessions",
      "userProviderAuthStates",
      "userProviderDeviceAuthStates",
      "userSourceIntegrationAuthStates",
      "communityOnboardingSessions",
      "communityPresence",
      "communityTypingPresence",
      "dmTypingPresence",
      "appOAuthStates",
      "workspaceTerminalSessions",
      "cloudThreadAttachmentUploadTickets",
      "polynetCodexWorkerCapacityLeases",
    ],
  },
  {
    disposition: "rebuild_or_validate_projection",
    reason:
      "Derived directories, previews, activity feeds, embeds, mention projections, tool snapshots, and rate counters cannot outrank their canonical source.",
    tables: [
      "workspaceDirectorySnapshots",
      "workspaceFilePreviewSnapshots",
      "communityActivityEvents",
      "communityInteractionEmbeds",
      "communityInteractionMentions",
      "appToolSnapshots",
      "dmRateCounters",
    ],
  },
  {
    disposition: "retain_quarantined_evidence",
    reason:
      "Lifecycle and operational evidence may support audit or incident reconstruction but cannot grant access or trigger an external effect after restore.",
    tables: [
      "accountLifecycleRequests",
      "accountLifecycleReceipts",
      "criticalAuditEvents",
      "platformDiagnosticEvents",
      "communityEvidenceRetrievalLogs",
      "communityMemoryMetabolizerRuns",
    ],
  },
] as const;

function buildTablePolicies(
  groups: readonly OperationalRecoveryTableGroup[],
): Readonly<Record<string, OperationalRecoveryTablePolicy>> {
  const policies: Record<string, OperationalRecoveryTablePolicy> = {};
  for (const group of groups) {
    for (const table of group.tables) {
      if (policies[table]) throw new Error(`duplicate operational recovery table policy: ${table}`);
      policies[table] = Object.freeze({
        disposition: group.disposition,
        reason: group.reason,
      });
    }
  }
  return Object.freeze(policies);
}

export const OPERATIONAL_RECOVERY_TABLE_POLICIES = buildTablePolicies(tableGroups);

export type OperationalRecoveryStorageDisposition =
  | "restore_blob_and_validate_reference"
  | "quarantine_claim_and_validate_blob_ownership";

export const OPERATIONAL_RECOVERY_STORAGE_FIELD_POLICIES: Readonly<
  Record<
    string,
    {
      disposition: OperationalRecoveryStorageDisposition;
      reason: string;
    }
  >
> = Object.freeze({
  "userProfileDetails.avatarStorageId": {
    disposition: "restore_blob_and_validate_reference",
    reason: "Restore the profile image with its owner row and reject a missing or cross-owner blob reference.",
  },
  "communities.avatarStorageId": {
    disposition: "restore_blob_and_validate_reference",
    reason: "Restore the community avatar with its community row and reject a missing blob reference.",
  },
  "communities.bannerStorageId": {
    disposition: "restore_blob_and_validate_reference",
    reason: "Restore the community banner with its community row and reject a missing blob reference.",
  },
  "communityInteractionAttachments.storageId": {
    disposition: "restore_blob_and_validate_reference",
    reason: "Restore the attachment blob only with valid interaction, author, hash, and ownership lineage.",
  },
  "communityResourceModules.bannerStorageId": {
    disposition: "restore_blob_and_validate_reference",
    reason: "Restore the resource-module banner with valid community and module ownership.",
  },
  "cloudThreadAttachments.storageId": {
    disposition: "restore_blob_and_validate_reference",
    reason: "Restore the thread attachment only after thread ownership and attachment state validate.",
  },
  "cloudThreadAttachmentUploadTickets.claimedStorageId": {
    disposition: "quarantine_claim_and_validate_blob_ownership",
    reason: "Expire the restored upload claim and retain or remove its blob only after canonical attachment ownership is checked.",
  },
});

export type OperationalRecoveryScheduledDisposition =
  | "maintenance_restarts_from_source"
  | "reconcile_before_external_effect"
  | "reconstruct_from_durable_rows"
  | "expire_or_finalize_stale_work";

export type OperationalRecoveryScheduledPolicy = {
  disposition: OperationalRecoveryScheduledDisposition;
  reason: string;
};

export type OperationalRecoveryCronPolicy = OperationalRecoveryScheduledPolicy & {
  method: "interval" | "hourly" | "daily" | "weekly" | "monthly" | "cron";
  schedule: string;
  target: string;
};

export const OPERATIONAL_RECOVERY_CRON_POLICIES: Readonly<
  Record<string, OperationalRecoveryCronPolicy>
> = Object.freeze({
  "prune terminal auth sessions": {
    method: "interval",
    schedule: "{hours:1}",
    target: "authSessions.pruneTerminalAuthSessionsInternal",
    disposition: "maintenance_restarts_from_source",
    reason: "Source-declared maintenance resumes after restored session state is quarantined.",
  },
  "prune community commerce event receipts": {
    method: "interval",
    schedule: "{hours:1}",
    target: "communityCommerce.pruneCommunityCommerceEventEffectsInternal",
    disposition: "maintenance_restarts_from_source",
    reason: "Retention maintenance resumes only after commerce reconciliation.",
  },
  "process pending email outbox": {
    method: "interval",
    schedule: "{minutes:5}",
    target: "email.processPendingEmailOutboxInternal",
    disposition: "reconcile_before_external_effect",
    reason: "Delivery/provider receipts must reconcile before any send is retried.",
  },
  "prune terminal email receipts": {
    method: "daily",
    schedule: "{hourUTC:4,minuteUTC:30}",
    target: "email.pruneTerminalEmailReceiptsInternal",
    disposition: "maintenance_restarts_from_source",
    reason: "Retention pruning is source-declared and has no pending-schedule dependency.",
  },
  "enqueue weekly community digests": {
    method: "weekly",
    schedule: '{dayOfWeek:"monday",hourUTC:13,minuteUTC:0}',
    target: "emailDigests.enqueueWeeklyCommunityDigestsInternal",
    disposition: "reconcile_before_external_effect",
    reason: "Recipient state and email dedupe must reconcile before digest outbox work is regenerated.",
  },
  "enqueue 24h event reminder emails": {
    method: "interval",
    schedule: "{minutes:15}",
    target: "eventReminders.enqueueEventReminderEmailsInternal",
    disposition: "reconcile_before_external_effect",
    reason: "Current event time, recipient preference, and delivery dedupe must be re-evaluated.",
  },
  "reconcile stale runtime workspace runs": {
    method: "interval",
    schedule: "{minutes:5}",
    target: "workspaceCredits.reconcileStaleRuntimeWorkspaceRunsInternal",
    disposition: "expire_or_finalize_stale_work",
    reason: "Restored active runs cannot imply live provider execution.",
  },
  "finalize expired blaxel project workspace leases": {
    method: "interval",
    schedule: "{minutes:15}",
    target: "blaxelWorkspaceWake.finalizeExpiredBlaxelProjectWorkspaceLeasesInternal",
    disposition: "expire_or_finalize_stale_work",
    reason: "Current Blaxel inventory must be observed before project pointers finalize.",
  },
  "reconcile expired credit reservations": {
    method: "interval",
    schedule: "{minutes:15}",
    target: "workspaceCredits.reconcileExpiredCreditReservationsInternal",
    disposition: "reconcile_before_external_effect",
    reason: "Balances, charges, and provider effects must converge before reservations settle.",
  },
  "retry pending credit settlements": {
    method: "interval",
    schedule: "{minutes:15}",
    target: "workspaceCredits.retryPendingCreditSettlementsInternal",
    disposition: "reconcile_before_external_effect",
    reason: "Pending financial effects require current idempotency and provider truth.",
  },
  "collect workspace usage by card": {
    method: "interval",
    schedule: "{minutes:15}",
    target: "workspaceCredits.collectWorkspaceUsageByCardInternal",
    disposition: "reconcile_before_external_effect",
    reason: "Provider usage and existing collection receipts must converge first.",
  },
  "execute workspace auto recharge": {
    method: "interval",
    schedule: "{minutes:15}",
    target: "workspaceAutoRecharge.sweepWorkspaceAutoRechargeExecutionsInternal",
    disposition: "reconcile_before_external_effect",
    reason: "Restored attempts cannot authorize a new charge without current Stripe truth.",
  },
  "record blaxel storage provider costs": {
    method: "interval",
    schedule: "{minutes:60}",
    target: "workspaceCredits.recordBlaxelStorageProviderCostsInternal",
    disposition: "reconcile_before_external_effect",
    reason: "Current provider inventory and cost receipt identity must be re-read.",
  },
  "sweep expired daytona codex runtime targets": {
    method: "interval",
    schedule: "{minutes:5}",
    target: "daytonaCodexRuntimeTargetActions.sweepExpiredDaytonaCodexRuntimeTargetsInternal",
    disposition: "expire_or_finalize_stale_work",
    reason: "Restored runtime pointers must not imply a live target.",
  },
  "expire stale tool balance checkouts": {
    method: "interval",
    schedule: "{minutes:15}",
    target: "workspaceCredits.expireStaleWorkspaceCreditTopupCheckoutSessionsInternal",
    disposition: "reconcile_before_external_effect",
    reason: "Current Stripe checkout state outranks the restored projection.",
  },
  "advance builder partner commissions to payable": {
    method: "daily",
    schedule: "{hourUTC:6,minuteUTC:0}",
    target: "builderPartners.advancePartnerCommissionsToPayableInternal",
    disposition: "reconcile_before_external_effect",
    reason: "Historical policy version and settlement truth must reconcile before advancement.",
  },
  "create builder partner payout cycle": {
    method: "monthly",
    schedule: "{day:1,hourUTC:7,minuteUTC:0}",
    target: "builderPartners.createPartnerPayoutCycleInternal",
    disposition: "reconcile_before_external_effect",
    reason: "A restored month boundary cannot duplicate payout-cycle effects.",
  },
  "delete expired hidden community ai feed posts": {
    method: "daily",
    schedule: "{hourUTC:5,minuteUTC:0}",
    target: "communityAiFeed.deleteExpiredHiddenCommunityAiFeedPostsInternal",
    disposition: "maintenance_restarts_from_source",
    reason: "Current row expiry controls source-declared maintenance.",
  },
  "process pending community agent mentions": {
    method: "interval",
    schedule: "{minutes:5}",
    target: "communityAgentConcierge.consumePendingCommunityAgentMentionsInternal",
    disposition: "reconstruct_from_durable_rows",
    reason: "The repair drain derives work from durable mention state.",
  },
  "process queued community agent serve requests": {
    method: "interval",
    schedule: "{minutes:1}",
    target: "communityAgentServeWorker.processQueuedCommunityAgentServeRequestsInternal",
    disposition: "reconcile_before_external_effect",
    reason: "Current sponsorship, quota, and provider run receipts must be revalidated.",
  },
  "process queued community mention broadcasts": {
    method: "interval",
    schedule: "{minutes:1}",
    target: "communityMentionBroadcasts.processQueuedCommunityMentionBroadcastsInternal",
    disposition: "reconstruct_from_durable_rows",
    reason: "Recipient projections rebuild from the durable broadcast source.",
  },
  "process canceled community mention broadcast cleanups": {
    method: "interval",
    schedule: "{minutes:1}",
    target: "communityMentionBroadcasts.processCanceledCommunityMentionBroadcastCleanupsInternal",
    disposition: "reconstruct_from_durable_rows",
    reason: "Cleanup work rebuilds from durable canceled-broadcast state.",
  },
  "process pending mention emails": {
    method: "interval",
    schedule: "{minutes:15}",
    target: "communityMentionEmails.processPendingMentionEmailsInternal",
    disposition: "reconcile_before_external_effect",
    reason: "Current preferences and delivery dedupe must precede any send.",
  },
  "refresh due community interaction previews": {
    method: "interval",
    schedule: "{hours:1}",
    target: "communityInteractionEmbedRefresh.scheduleDueInteractionEmbedPreviewRefresh",
    disposition: "reconcile_before_external_effect",
    reason: "Preview leases and outbound resolver work resume only after external effects reopen.",
  },
});

export type OperationalRecoveryScheduledTargetPolicy = OperationalRecoveryScheduledPolicy & {
  callsiteCount: number;
};

export const OPERATIONAL_RECOVERY_SCHEDULED_TARGET_POLICIES: Readonly<
  Record<string, OperationalRecoveryScheduledTargetPolicy>
> = Object.freeze({
  "authSessions.ts::authSessions.pruneTerminalAuthSessionsInternal": {
    callsiteCount: 1,
    disposition: "maintenance_restarts_from_source",
    reason: "Terminal-session maintenance resumes only after every restored session is quarantined.",
  },
  "billingCore.ts::userPlatformAppMounts.seedCommunityAppGrantsForUserInternal": {
    callsiteCount: 1,
    disposition: "reconstruct_from_durable_rows",
    reason: "App grants rebuild from current membership and community mount authority, not billing-provider state.",
  },
  "builderPartners.ts::builderPartners.executePartnerPayoutBatchInternal": {
    callsiteCount: 2,
    disposition: "reconcile_before_external_effect",
    reason: "Payout execution requires current policy-version, ledger, idempotency, and Stripe transfer truth.",
  },
  "communityAdmin.ts::communityAdmin.approvePendingJoinRequestsForOpenAccessInternal": {
    callsiteCount: 1,
    disposition: "reconstruct_from_durable_rows",
    reason: "Open-access admission re-evaluates the current community policy and each durable pending request.",
  },
  "communityAdmin.ts::userPlatformAppMounts.seedCommunityAppGrantsForUserInternal": {
    callsiteCount: 1,
    disposition: "reconstruct_from_durable_rows",
    reason: "Administrative app grants rebuild from current membership and mount authority.",
  },
  "communityAgentConciergeCore.ts::communityAgentServeWorker.processQueuedCommunityAgentServeRequestsInternal": {
    callsiteCount: 1,
    disposition: "reconcile_before_external_effect",
    reason: "Agent service requires current requester sponsorship, quota, claim, and model-provider receipts.",
  },
  "communityAgentHeartbeat.ts::communityAgentHeartbeat.recoverCommunityCompilerDigestHandoffInternal": {
    callsiteCount: 2,
    disposition: "reconstruct_from_durable_rows",
    reason: "Digest handoff recovery derives from the immutable digest version and current claim lease.",
  },
  "communityAgentHeartbeat.ts::communityAgentHeartbeat.runCommunityAgentHeartbeatInternal": {
    callsiteCount: 2,
    disposition: "reconcile_before_external_effect",
    reason: "A heartbeat can invoke sponsored model-provider work and must wait for effect reconciliation.",
  },
  "communityAgentHeartbeat.ts::communityCompilerDigest.runCommunityCompilerDigestPassInternal": {
    callsiteCount: 1,
    disposition: "reconstruct_from_durable_rows",
    reason: "Compiler digest work restarts from canonical evidence and its immutable work-set checkpoint.",
  },
  "communityAppMounts.ts::userPlatformAppMounts.seedCommunityAppGrantForExistingMembersInternal": {
    callsiteCount: 1,
    disposition: "reconstruct_from_durable_rows",
    reason: "Existing-member grants rebuild from current memberships and the canonical community app mount.",
  },
  "communityCognitionCleanup.ts::communityCognitionCleanup.drainDeletedCommunityCognitionInternal": {
    callsiteCount: 1,
    disposition: "maintenance_restarts_from_source",
    reason: "Destructive cognition cleanup resumes only from durable deletion authority and bounded cursors.",
  },
  "communityCompilerDigest.ts::communityAgentHeartbeat.recoverCommunityCompilerDigestHandoffInternal": {
    callsiteCount: 1,
    disposition: "reconstruct_from_durable_rows",
    reason: "Handoff repair restarts from the committed digest version and its durable state.",
  },
  "communityCompilerDigest.ts::communityCompilerDigest.runCommunityCompilerDigestPassInternal": {
    callsiteCount: 1,
    disposition: "reconstruct_from_durable_rows",
    reason: "Additional compiler pages derive from canonical evidence and the current digest checkpoint.",
  },
  "communityIntelligenceDirectory.ts::communityCompilerDigest.runCommunityCompilerDigestPassInternal": {
    callsiteCount: 1,
    disposition: "reconstruct_from_durable_rows",
    reason: "Intelligence changes trigger compiler work only from the committed canonical mutation.",
  },
  "communityIntelligenceDirectory.ts::communityMemoryMetabolizer.settleCommunityMemorySignalsInternal": {
    callsiteCount: 1,
    disposition: "reconstruct_from_durable_rows",
    reason: "Memory signals settle from durable retrieval outcomes and current node state.",
  },
  "communityInteractionEmbedRefresh.ts::communityInteractions.enrichInteractionEmbed": {
    callsiteCount: 1,
    disposition: "reconcile_before_external_effect",
    reason: "Embed enrichment performs outbound resolution and waits until external effects reopen.",
  },
  "communityInteractionEvidence.ts::communityInteractionEvidence.redactCommunityInteractionEvidenceChildrenInternal": {
    callsiteCount: 2,
    disposition: "maintenance_restarts_from_source",
    reason: "Privacy redaction resumes only from unreadable canonical roots and its bounded continuation cursor.",
  },
  "communityInteractionEvidence.ts::communityInteractionEvidence.syncCommunityInteractionEvidenceInternal": {
    callsiteCount: 1,
    disposition: "reconstruct_from_durable_rows",
    reason: "Evidence synchronization derives from the committed interaction and current visibility.",
  },
  "communityInteractions.ts::communityInteractions.enrichInteractionEmbed": {
    callsiteCount: 1,
    disposition: "reconcile_before_external_effect",
    reason: "Initial embed enrichment performs outbound resolution and waits for the effect gate.",
  },
  "communityLifecycle.ts::communityLifecycle.deletePendingJoinRequestsForPaidPolicyInternal": {
    callsiteCount: 2,
    disposition: "maintenance_restarts_from_source",
    reason: "Pending-request cleanup resumes only when the current canonical entry policy remains paid.",
  },
  "communityMentionBroadcasts.ts::communityMentionBroadcasts.processCanceledCommunityMentionBroadcastCleanupsInternal": {
    callsiteCount: 2,
    disposition: "maintenance_restarts_from_source",
    reason: "Recipient cleanup resumes from the durable canceled broadcast and bounded cursor.",
  },
  "communityMentionBroadcasts.ts::communityMentionBroadcasts.processQueuedCommunityMentionBroadcastsInternal": {
    callsiteCount: 2,
    disposition: "reconstruct_from_durable_rows",
    reason: "Recipient fanout rebuilds from the durable role-mention broadcast and current membership.",
  },
  "communityPublic.ts::userPlatformAppMounts.seedCommunityAppGrantsForUserInternal": {
    callsiteCount: 1,
    disposition: "reconstruct_from_durable_rows",
    reason: "Public admission app grants rebuild from the committed membership and canonical mounts.",
  },
  "communityResources.ts::communityResources.processCommunitySourceCrawlJobInternal": {
    callsiteCount: 1,
    disposition: "reconcile_before_external_effect",
    reason: "Source crawling performs outbound provider work and must revalidate the job before retry.",
  },
  "daytonaCodexRuntimeTargetActions.ts::daytonaCodexRuntimeTargetActions.teardownAndRecordDaytonaCodexRuntimeTargetInternal": {
    callsiteCount: 1,
    disposition: "expire_or_finalize_stale_work",
    reason: "A restored Daytona pointer cannot prove target liveness and must reconcile before teardown.",
  },
  "directMessages.ts::directMessageEmails.maybeNotifyRecipientInternal": {
    callsiteCount: 1,
    disposition: "reconcile_before_external_effect",
    reason: "DM email work rechecks preferences, read state, and delivery dedupe before enqueue.",
  },
  "emailDigests.ts::email.enqueueEmailJobInternal": {
    callsiteCount: 1,
    disposition: "reconcile_before_external_effect",
    reason: "Email outbox insertion requires current recipient preference and durable dedupe authority.",
  },
  "emailDigests.ts::emailDigests.enqueueWeeklyCommunityDigestForCommunityInternal": {
    callsiteCount: 1,
    disposition: "reconcile_before_external_effect",
    reason: "Community digest generation rechecks current recipients and delivery dedupe before enqueue.",
  },
  "emailDigests.ts::emailDigests.enqueueWeeklyCommunityDigestsInternal": {
    callsiteCount: 2,
    disposition: "reconcile_before_external_effect",
    reason: "Digest pagination resumes only after recipient preference and outbox dedupe reconcile.",
  },
  "platformHomeCommunity.ts::userPlatformAppMounts.seedCommunityAppGrantsForUserInternal": {
    callsiteCount: 1,
    disposition: "reconstruct_from_durable_rows",
    reason: "Platform-home grants rebuild from the committed membership and current community mounts.",
  },
  "runtimeExecutionSession.ts::daytonaCodexRuntimeTargetActions.teardownAndRecordDaytonaCodexRuntimeTargetInternal": {
    callsiteCount: 1,
    disposition: "expire_or_finalize_stale_work",
    reason: "Runtime cleanup must reconcile current provider liveness before tearing down a target.",
  },
  "runtimeTurnHandlers.ts::daytonaCodexRuntimeTargetActions.teardownAndRecordDaytonaCodexRuntimeTargetInternal": {
    callsiteCount: 1,
    disposition: "expire_or_finalize_stale_work",
    reason: "Turn-finalization cleanup must not trust a restored target pointer as live.",
  },
  "threads.ts::threads.cleanupCloudMemberAgentAttachmentUploadTicket": {
    callsiteCount: 1,
    disposition: "expire_or_finalize_stale_work",
    reason: "Restored upload claims expire only after canonical attachment ownership is checked.",
  },
  "threads.ts::threads.cleanupPendingCloudThreadAttachment": {
    callsiteCount: 1,
    disposition: "expire_or_finalize_stale_work",
    reason: "Pending attachment cleanup validates thread ownership and final attachment state first.",
  },
  "userPlatformAppMounts.ts::userPlatformAppMounts.seedCommunityAppGrantIntoUserHarnessInternal": {
    callsiteCount: 1,
    disposition: "reconstruct_from_durable_rows",
    reason: "A user harness mount rebuilds from current community mount and membership authority.",
  },
  "workspaceAutoRecharge.ts::workspaceAutoRecharge.executeWorkspaceAutoRechargeForUserInternal": {
    callsiteCount: 1,
    disposition: "reconcile_before_external_effect",
    reason: "A restored recharge attempt cannot authorize a duplicate Stripe charge.",
  },
  "workspaceCredits.ts::workspaceAutoRecharge.executeWorkspaceAutoRechargeForUserInternal": {
    callsiteCount: 1,
    disposition: "reconcile_before_external_effect",
    reason: "Low-balance recharge requires current balance, attempt, payment-method, and Stripe truth.",
  },
  "workspaceCredits.ts::workspaceCredits.recordBlaxelStorageProviderCostsInternal": {
    callsiteCount: 1,
    disposition: "reconcile_before_external_effect",
    reason: "Provider-cost recording requires current Blaxel inventory and idempotent cost receipts.",
  },
});

export const OPERATIONAL_RECOVERY_PHASES = Object.freeze([
  "detect_and_scope",
  "freeze_writes_and_external_effects",
  "preserve_forensic_snapshot",
  "restore_known_code_and_configuration",
  "restore_data_into_isolated_target",
  "validate_structural_and_product_invariants",
  "reconcile_external_provider_truth",
  "enable_authenticated_reads",
  "enable_writes",
  "enable_external_effects",
] as const);

export const OPERATIONAL_RECOVERY_PROVIDER_BOUNDARIES = Object.freeze({
  convex: "restore database and file storage; recreate code, environment, and scheduled declarations separately",
  githubVercel: "recreate web delivery from exact Git authority; never treat web rollback as product-data recovery",
  stripe: "re-read current settlement, subscription, checkout, dispute, refund, and payout truth before money or access effects resume",
  identity: "invalidate or revalidate restored sessions and OAuth state before authenticated access resumes",
  email: "reconcile delivery receipts and dedupe before any restored outbox item sends",
  sourceOAuth: "revalidate or require reconnect for restored source-provider credentials",
  blaxel: "validate provider volume and sandbox inventory; cold sandbox recreation does not prove recovery from volume loss",
  daytona: "expire or reconcile restored runtime targets; no target pointer proves provider liveness",
  modelProviders: "retry only from durable sponsored/idempotent work after quota and receipt revalidation",
  flyPreviewProxy: "recreate the stateless proxy from source and configuration; it is not a product-data store",
});
