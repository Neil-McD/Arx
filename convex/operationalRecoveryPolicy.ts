/**
 * Declarative operational-recovery contract.
 *
 * This file is planning and proof authority, not a backup, restore, mutation,
 * provider, or deployment executor. Recovery remains quarantined until the
 * staged drills and human release boundaries in the C9 contract are satisfied.
 */

export const OPERATIONAL_RECOVERY_POLICY_VERSION = "operational-recovery-v1" as const;

export const OPERATIONAL_RECOVERY_SCHEMA_BASELINE = Object.freeze({
  tableCount: 123,
  storageFieldCount: 7,
  cronRegistrationCount: 24,
  schedulerCallsiteCount: 46,
  schedulerModuleCount: 27,
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
      "Derived directories, previews, analytics, embeds, mention projections, tool snapshots, retrieval logs, and metabolizer state cannot outrank their canonical source.",
    tables: [
      "workspaceDirectorySnapshots",
      "workspaceFilePreviewSnapshots",
      "communityAnalyticsEvents",
      "platformBusinessVisits",
      "communityActivityEvents",
      "communityInteractionEmbeds",
      "communityInteractionMentions",
      "appToolSnapshots",
      "dmRateCounters",
      "communityEvidenceRetrievalLogs",
      "communityIntelligenceRetrievalLogs",
      "communityMemoryMetabolizerRuns",
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

export const OPERATIONAL_RECOVERY_CRON_POLICIES: Readonly<
  Record<string, OperationalRecoveryScheduledPolicy>
> = Object.freeze({
  "prune terminal auth sessions": {
    disposition: "maintenance_restarts_from_source",
    reason: "Source-declared maintenance resumes after restored session state is quarantined.",
  },
  "prune community commerce event receipts": {
    disposition: "maintenance_restarts_from_source",
    reason: "Retention maintenance resumes only after commerce reconciliation.",
  },
  "process pending email outbox": {
    disposition: "reconcile_before_external_effect",
    reason: "Delivery/provider receipts must reconcile before any send is retried.",
  },
  "prune terminal email receipts": {
    disposition: "maintenance_restarts_from_source",
    reason: "Retention pruning is source-declared and has no pending-schedule dependency.",
  },
  "enqueue weekly community digests": {
    disposition: "reconstruct_from_durable_rows",
    reason: "Recipient work is regenerated from current durable preference/community state.",
  },
  "enqueue 24h event reminder emails": {
    disposition: "reconcile_before_external_effect",
    reason: "Current event time, recipient preference, and delivery dedupe must be re-evaluated.",
  },
  "reconcile stale runtime workspace runs": {
    disposition: "expire_or_finalize_stale_work",
    reason: "Restored active runs cannot imply live provider execution.",
  },
  "finalize expired blaxel project workspace leases": {
    disposition: "expire_or_finalize_stale_work",
    reason: "Current Blaxel inventory must be observed before project pointers finalize.",
  },
  "reconcile expired credit reservations": {
    disposition: "reconcile_before_external_effect",
    reason: "Balances, charges, and provider effects must converge before reservations settle.",
  },
  "retry pending credit settlements": {
    disposition: "reconcile_before_external_effect",
    reason: "Pending financial effects require current idempotency and provider truth.",
  },
  "collect workspace usage by card": {
    disposition: "reconcile_before_external_effect",
    reason: "Provider usage and existing collection receipts must converge first.",
  },
  "execute workspace auto recharge": {
    disposition: "reconcile_before_external_effect",
    reason: "Restored attempts cannot authorize a new charge without current Stripe truth.",
  },
  "record blaxel storage provider costs": {
    disposition: "reconcile_before_external_effect",
    reason: "Current provider inventory and cost receipt identity must be re-read.",
  },
  "sweep expired daytona codex runtime targets": {
    disposition: "expire_or_finalize_stale_work",
    reason: "Restored runtime pointers must not imply a live target.",
  },
  "expire stale tool balance checkouts": {
    disposition: "reconcile_before_external_effect",
    reason: "Current Stripe checkout state outranks the restored projection.",
  },
  "advance builder partner commissions to payable": {
    disposition: "reconcile_before_external_effect",
    reason: "Historical policy version and settlement truth must reconcile before advancement.",
  },
  "create builder partner payout cycle": {
    disposition: "reconcile_before_external_effect",
    reason: "A restored month boundary cannot duplicate payout-cycle effects.",
  },
  "delete expired hidden community ai feed posts": {
    disposition: "maintenance_restarts_from_source",
    reason: "Current row expiry controls source-declared maintenance.",
  },
  "process pending community agent mentions": {
    disposition: "reconstruct_from_durable_rows",
    reason: "The repair drain derives work from durable mention state.",
  },
  "process queued community agent serve requests": {
    disposition: "reconcile_before_external_effect",
    reason: "Current sponsorship, quota, and provider run receipts must be revalidated.",
  },
  "process queued community mention broadcasts": {
    disposition: "reconstruct_from_durable_rows",
    reason: "Recipient projections rebuild from the durable broadcast source.",
  },
  "process canceled community mention broadcast cleanups": {
    disposition: "reconstruct_from_durable_rows",
    reason: "Cleanup work rebuilds from durable canceled-broadcast state.",
  },
  "process pending mention emails": {
    disposition: "reconcile_before_external_effect",
    reason: "Current preferences and delivery dedupe must precede any send.",
  },
  "refresh due community interaction previews": {
    disposition: "reconstruct_from_durable_rows",
    reason: "Provider preview snapshots are derived from canonical interaction URLs.",
  },
});

export const OPERATIONAL_RECOVERY_SCHEDULER_MODULE_POLICIES: Readonly<
  Record<string, OperationalRecoveryScheduledPolicy & { callsiteCount: number }>
> = Object.freeze({
  "authSessions.ts": {
    callsiteCount: 1,
    disposition: "expire_or_finalize_stale_work",
    reason: "Session cleanup is safe only after restored credentials are quarantined.",
  },
  "billingCore.ts": {
    callsiteCount: 1,
    disposition: "reconcile_before_external_effect",
    reason: "Billing follow-up requires current provider truth.",
  },
  "builderPartners.ts": {
    callsiteCount: 2,
    disposition: "reconcile_before_external_effect",
    reason: "Payout execution is effectful and policy-versioned.",
  },
  "communityAdmin.ts": {
    callsiteCount: 2,
    disposition: "reconstruct_from_durable_rows",
    reason: "Community administrative derivations restart from canonical community state.",
  },
  "communityAgentConciergeCore.ts": {
    callsiteCount: 1,
    disposition: "reconcile_before_external_effect",
    reason: "Agent service requires current sponsorship and provider receipts.",
  },
  "communityAgentHeartbeat.ts": {
    callsiteCount: 5,
    disposition: "reconstruct_from_durable_rows",
    reason: "Heartbeat repair follows durable run and digest checkpoints.",
  },
  "communityAppMounts.ts": {
    callsiteCount: 1,
    disposition: "reconstruct_from_durable_rows",
    reason: "Mount projections rebuild from canonical app/community state.",
  },
  "communityCognitionCleanup.ts": {
    callsiteCount: 1,
    disposition: "maintenance_restarts_from_source",
    reason: "Cleanup resumes from source-declared retention logic.",
  },
  "communityCompilerDigest.ts": {
    callsiteCount: 2,
    disposition: "reconstruct_from_durable_rows",
    reason: "Each immutable digest owns its durable recovery checkpoint.",
  },
  "communityIntelligenceDirectory.ts": {
    callsiteCount: 2,
    disposition: "reconstruct_from_durable_rows",
    reason: "Intelligence derivation must restart from canonical evidence.",
  },
  "communityInteractionEmbedRefresh.ts": {
    callsiteCount: 1,
    disposition: "reconstruct_from_durable_rows",
    reason: "Embed work is a derived provider snapshot.",
  },
  "communityInteractionEvidence.ts": {
    callsiteCount: 3,
    disposition: "reconstruct_from_durable_rows",
    reason: "Evidence synchronization restarts from canonical interactions.",
  },
  "communityInteractions.ts": {
    callsiteCount: 1,
    disposition: "reconstruct_from_durable_rows",
    reason: "Interaction enrichment is derived from the committed interaction.",
  },
  "communityLifecycle.ts": {
    callsiteCount: 2,
    disposition: "reconstruct_from_durable_rows",
    reason: "Lifecycle follow-up must re-read the canonical community transition.",
  },
  "communityMentionBroadcasts.ts": {
    callsiteCount: 4,
    disposition: "reconstruct_from_durable_rows",
    reason: "Broadcast fanout and cleanup restart from durable broadcast state.",
  },
  "communityPublic.ts": {
    callsiteCount: 1,
    disposition: "reconstruct_from_durable_rows",
    reason: "Public projection follow-up derives from committed community state.",
  },
  "communityResources.ts": {
    callsiteCount: 1,
    disposition: "reconstruct_from_durable_rows",
    reason: "Resource derivation must re-read canonical source/content state.",
  },
  "daytonaCodexRuntimeTargetActions.ts": {
    callsiteCount: 1,
    disposition: "expire_or_finalize_stale_work",
    reason: "A restored target pointer does not prove a live provider target.",
  },
  "directMessages.ts": {
    callsiteCount: 1,
    disposition: "reconstruct_from_durable_rows",
    reason: "DM follow-up derives from the committed canonical message.",
  },
  "emailDigests.ts": {
    callsiteCount: 4,
    disposition: "reconcile_before_external_effect",
    reason: "Email enqueue/send work requires current preferences and delivery dedupe.",
  },
  "platformHomeCommunity.ts": {
    callsiteCount: 1,
    disposition: "reconstruct_from_durable_rows",
    reason: "Platform-home admission derives from canonical membership state.",
  },
  "runtimeExecutionSession.ts": {
    callsiteCount: 1,
    disposition: "expire_or_finalize_stale_work",
    reason: "Restored execution sessions must reconcile provider liveness.",
  },
  "runtimeTurnHandlers.ts": {
    callsiteCount: 1,
    disposition: "expire_or_finalize_stale_work",
    reason: "A scheduled turn cannot resume from snapshot age alone.",
  },
  "threads.ts": {
    callsiteCount: 2,
    disposition: "reconstruct_from_durable_rows",
    reason: "Attachment cleanup/claims re-read canonical thread ownership and storage.",
  },
  "userPlatformAppMounts.ts": {
    callsiteCount: 1,
    disposition: "reconstruct_from_durable_rows",
    reason: "User mount projection work restarts from canonical mount state.",
  },
  "workspaceAutoRecharge.ts": {
    callsiteCount: 1,
    disposition: "reconcile_before_external_effect",
    reason: "A restored auto-recharge attempt cannot authorize a duplicate charge.",
  },
  "workspaceCredits.ts": {
    callsiteCount: 2,
    disposition: "reconcile_before_external_effect",
    reason: "Credit reservation and settlement work requires provider/accounting convergence.",
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
