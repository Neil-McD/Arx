/**
 * Declarative account lifecycle ownership contract.
 *
 * This file is planning authority, not an executor. Nothing in this module may
 * delete, patch, revoke, schedule, or call a provider. The account deletion
 * mutation stays quarantined until versioned executors satisfy this contract.
 */

export const ACCOUNT_LIFECYCLE_POLICY_VERSION = "account-lifecycle-v5" as const;

export const ACCOUNT_LIFECYCLE_SCHEMA_BASELINE = Object.freeze({
  tableCount: 127,
  directUserEdgeCount: 120,
  opaqueFieldCount: 26,
  storageFieldCount: 7,
});

export type AccountLifecycleOwnershipClass =
  | "root_identity"
  | "account_private"
  | "shared_interpersonal"
  | "community_owned"
  | "financial_legal"
  | "operational_evidence"
  | "external_provider"
  | "derived_intelligence";

export type AccountLifecycleDisposition =
  | "hard_delete"
  | "participant_departure"
  | "detach_identity"
  | "transfer_or_block"
  | "retain_minimal"
  | "privacy_propagate"
  | "parent_managed"
  | "root_last";

export type AccountLifecyclePhase =
  | "access_freeze"
  | "preflight_blockers"
  | "external_revoke"
  | "private_delete"
  | "shared_anonymize"
  | "privacy_propagation"
  | "retained_evidence"
  | "invariant_audit"
  | "root_finalize";

export type AccountLifecycleRetentionAuthority =
  | "none"
  | "account_holder"
  | "community"
  | "finance_legal"
  | "security_operations"
  | "provider_contract"
  | "product_policy";

export type AccountLifecycleExternalEffect =
  | "none"
  | "revoke_credentials"
  | "disable_payout_account"
  | "release_workspace_resources"
  | "provider_retention_only";

export type AccountLifecycleOpaqueDataHandling =
  | "none"
  | "delete_with_parent"
  | "preserve_shared_until_content_purge"
  | "retain_minimal"
  | "privacy_propagate";

export type AccountLifecycleStorageHandling =
  | "none"
  | "delete_private_object"
  | "preserve_shared_until_content_purge";

export type AccountLifecycleSchemaRequirement =
  | "none"
  | "bounded_index"
  | "nullable_actor_or_tombstone"
  | "participant_departure_state"
  | "transfer_contract"
  | "retention_subject_key"
  | "privacy_lineage"
  | "root_tombstone";

export type AccountLifecycleExecutorOwner =
  | "identity_access"
  | "private_account_data"
  | "workspace_runtime"
  | "community_access"
  | "community_interactions"
  | "community_resources"
  | "direct_messages"
  | "apps_skills"
  | "finance_legal"
  | "security_operations"
  | "community_intelligence"
  | "account_finalizer";

export type AccountLifecycleTablePolicy = {
  ownership: AccountLifecycleOwnershipClass;
  disposition: AccountLifecycleDisposition;
  phase: AccountLifecyclePhase;
  retentionAuthority: AccountLifecycleRetentionAuthority;
  externalEffect: AccountLifecycleExternalEffect;
  opaqueData: AccountLifecycleOpaqueDataHandling;
  storage: AccountLifecycleStorageHandling;
  schemaRequirements: readonly AccountLifecycleSchemaRequirement[];
  executorOwner: AccountLifecycleExecutorOwner;
  proof: string;
};

type PolicyGroup = {
  policy: AccountLifecycleTablePolicy;
  tables: readonly string[];
};

const policyGroups: readonly PolicyGroup[] = [
  {
    policy: {
      ownership: "root_identity",
      disposition: "root_last",
      phase: "root_finalize",
      retentionAuthority: "product_policy",
      externalEffect: "none",
      opaqueData: "none",
      storage: "none",
      schemaRequirements: ["root_tombstone", "bounded_index"],
      executorOwner: "account_finalizer",
      proof: "the account-specific checkpoint remains attached to the root until final invariant proof",
    },
    tables: ["accountLifecycleRequests"],
  },
  {
    policy: {
      ownership: "root_identity",
      disposition: "root_last",
      phase: "root_finalize",
      retentionAuthority: "product_policy",
      externalEffect: "none",
      opaqueData: "none",
      storage: "none",
      schemaRequirements: ["root_tombstone"],
      executorOwner: "account_finalizer",
      proof: "root identity is finalized only after the orphan and invariant audit",
    },
    tables: ["users"],
  },
  {
    policy: {
      ownership: "account_private",
      disposition: "hard_delete",
      phase: "access_freeze",
      retentionAuthority: "none",
      externalEffect: "revoke_credentials",
      opaqueData: "delete_with_parent",
      storage: "none",
      schemaRequirements: ["bounded_index"],
      executorOwner: "identity_access",
      proof: "local and provider sessions are revoked before destructive phases",
    },
    tables: ["authSessions"],
  },
  {
    policy: {
      ownership: "account_private",
      disposition: "hard_delete",
      phase: "private_delete",
      retentionAuthority: "none",
      externalEffect: "none",
      opaqueData: "delete_with_parent",
      storage: "none",
      schemaRequirements: ["bounded_index"],
      executorOwner: "identity_access",
      proof: "access freeze makes grants unreachable without rewriting them; private deletion removes the rows later",
    },
    tables: ["userEntitlements", "operatorRoles"],
  },
  {
    policy: {
      ownership: "account_private",
      disposition: "hard_delete",
      phase: "private_delete",
      retentionAuthority: "account_holder",
      externalEffect: "none",
      opaqueData: "delete_with_parent",
      storage: "none",
      schemaRequirements: ["bounded_index"],
      executorOwner: "private_account_data",
      proof: "private account state is absent after retry-safe bounded deletion",
    },
    tables: [
      "workspaceAutoRechargeSettings",
      "workspaceDirectorySnapshots",
      "workspaceFilePreviewSnapshots",
      "userMemorySettings",
      "userProviderAuthStates",
      "userProviderDeviceAuthStates",
      "emailPreferences",
      "emailOutbox",
      "personalMemoryItems",
      "memberFacts",
      "memberProfileSpines",
      "communityOnboardingSessions",
      "communityPresence",
      "communityJoinRequests",
      "communityBlocks",
      "communityTypingPresence",
      "dmBlocks",
      "dmRateCounters",
      "dmTypingPresence",
      "userPlatformAppMounts",
      "userPlatformAppMountSources",
      "userPlatformSkillInstalls",
      "communityMemberSettings",
      "memberAgentChannels",
      "memberAgentEpisodes",
      "threads",
      "cloudMessages",
    ],
  },
  {
    policy: {
      ownership: "account_private",
      disposition: "hard_delete",
      phase: "private_delete",
      retentionAuthority: "account_holder",
      externalEffect: "none",
      opaqueData: "delete_with_parent",
      storage: "delete_private_object",
      schemaRequirements: ["bounded_index"],
      executorOwner: "private_account_data",
      proof: "private attachment rows and storage objects are removed idempotently",
    },
    tables: ["userProfileDetails", "cloudThreadAttachments", "cloudThreadAttachmentUploadTickets"],
  },
  {
    policy: {
      ownership: "external_provider",
      disposition: "hard_delete",
      phase: "external_revoke",
      retentionAuthority: "provider_contract",
      externalEffect: "revoke_credentials",
      opaqueData: "delete_with_parent",
      storage: "none",
      schemaRequirements: ["bounded_index"],
      executorOwner: "private_account_data",
      proof: "provider credentials are revoked once and local secrets are removed after receipt",
    },
    tables: [
      "userProviderConnections",
      "userSourceIntegrationConnections",
      "userSourceIntegrationAuthStates",
    ],
  },
  {
    policy: {
      ownership: "external_provider",
      disposition: "hard_delete",
      phase: "external_revoke",
      retentionAuthority: "provider_contract",
      externalEffect: "revoke_credentials",
      opaqueData: "delete_with_parent",
      storage: "none",
      schemaRequirements: ["bounded_index"],
      executorOwner: "apps_skills",
      proof: "user-scoped app OAuth state and embedded client secrets are revoked and deleted after receipt",
    },
    tables: ["appOAuthStates"],
  },
  {
    policy: {
      ownership: "external_provider",
      disposition: "hard_delete",
      phase: "external_revoke",
      retentionAuthority: "provider_contract",
      externalEffect: "release_workspace_resources",
      opaqueData: "delete_with_parent",
      storage: "none",
      schemaRequirements: ["bounded_index"],
      executorOwner: "workspace_runtime",
      proof: "workspace provider resources are released idempotently before local state disappears",
    },
    tables: [
      "cloudProjects",
      "workspaceTerminalSessions",
      "polynetCodexWorkerCapacityLeases",
      "daytonaCodexRuntimeTargets",
      "runtimeRuns",
      "runtimeRunEvents",
    ],
  },
  {
    policy: {
      ownership: "financial_legal",
      disposition: "retain_minimal",
      phase: "retained_evidence",
      retentionAuthority: "finance_legal",
      externalEffect: "provider_retention_only",
      opaqueData: "retain_minimal",
      storage: "none",
      schemaRequirements: ["retention_subject_key", "bounded_index"],
      executorOwner: "finance_legal",
      proof: "settlement and legal evidence survives with minimized account identity",
    },
    tables: [
      "builderPartners",
      "legalAcceptances",
      "partnerAttributions",
      "partnerCommissionLedger",
      "partnerCommissionAdjustments",
      "partnerPayoutBatches",
      "partnerPayoutTransfers",
      "partnerPayoutItems",
      "workspaceCreditBalances",
      "workspaceAutoRechargeAttempts",
      "workspaceComputeCharges",
      "providerCostEntries",
      "workspaceUsageCollections",
      "creditLedgerEntries",
      "checkoutSessions",
      "userStripeCustomers",
      "communityPricePoints",
      "communitySubscriptions",
      "communitySubscriptionAccessBlocks",
    ],
  },
  {
    policy: {
      ownership: "financial_legal",
      disposition: "retain_minimal",
      phase: "external_revoke",
      retentionAuthority: "finance_legal",
      externalEffect: "disable_payout_account",
      opaqueData: "retain_minimal",
      storage: "none",
      schemaRequirements: ["retention_subject_key", "bounded_index"],
      executorOwner: "finance_legal",
      proof: "payout capability is disabled while minimum settlement evidence remains",
    },
    tables: ["userStripeConnectAccounts"],
  },
  {
    policy: {
      ownership: "operational_evidence",
      disposition: "retain_minimal",
      phase: "retained_evidence",
      retentionAuthority: "security_operations",
      externalEffect: "none",
      opaqueData: "retain_minimal",
      storage: "none",
      schemaRequirements: ["retention_subject_key", "bounded_index"],
      executorOwner: "security_operations",
      proof: "operational evidence is pseudonymized and expires under an explicit retention owner",
    },
    tables: [
      "criticalAuditEvents",
      "accountLifecycleReceipts",
      "communityCommerceEventEffects",
      "platformDiagnosticEvents",
      "emailDeliveries",
      "communityAnalyticsEvents",
      "platformBusinessVisits",
      "communityAgentServeRequests",
      "communityAgentRuns",
      "communityAgentRunEvents",
    ],
  },
  {
    policy: {
      ownership: "community_owned",
      disposition: "transfer_or_block",
      phase: "preflight_blockers",
      retentionAuthority: "community",
      externalEffect: "none",
      opaqueData: "preserve_shared_until_content_purge",
      storage: "preserve_shared_until_content_purge",
      schemaRequirements: ["transfer_contract", "bounded_index"],
      executorOwner: "community_access",
      proof: "owned objects are transferred or explicitly removed before account finalization",
    },
    tables: ["communities"],
  },
  {
    policy: {
      ownership: "community_owned",
      disposition: "transfer_or_block",
      phase: "preflight_blockers",
      retentionAuthority: "product_policy",
      externalEffect: "none",
      opaqueData: "preserve_shared_until_content_purge",
      storage: "none",
      schemaRequirements: ["transfer_contract", "bounded_index"],
      executorOwner: "apps_skills",
      proof: "developer apps and skill packages cannot be orphaned by identity deletion",
    },
    tables: ["developerApps", "skillPackages"],
  },
  {
    policy: {
      ownership: "community_owned",
      disposition: "participant_departure",
      phase: "shared_anonymize",
      retentionAuthority: "community",
      externalEffect: "none",
      opaqueData: "none",
      storage: "none",
      schemaRequirements: ["participant_departure_state", "bounded_index"],
      executorOwner: "community_access",
      proof: "membership access ends without corrupting community counts or financial history",
    },
    tables: ["communityMemberships"],
  },
  {
    policy: {
      ownership: "shared_interpersonal",
      disposition: "participant_departure",
      phase: "shared_anonymize",
      retentionAuthority: "account_holder",
      externalEffect: "none",
      opaqueData: "preserve_shared_until_content_purge",
      storage: "none",
      schemaRequirements: ["participant_departure_state", "nullable_actor_or_tombstone", "bounded_index"],
      executorOwner: "direct_messages",
      proof: "the departing participant loses access while surviving participants retain ordered history",
    },
    tables: ["dmParticipants"],
  },
  {
    policy: {
      ownership: "shared_interpersonal",
      disposition: "detach_identity",
      phase: "shared_anonymize",
      retentionAuthority: "account_holder",
      externalEffect: "none",
      opaqueData: "preserve_shared_until_content_purge",
      storage: "none",
      schemaRequirements: ["nullable_actor_or_tombstone", "bounded_index"],
      executorOwner: "direct_messages",
      proof: "DM sequence and content survive while deleted identity is no longer resolvable",
    },
    tables: ["dmConversations", "dmMessages"],
  },
  {
    policy: {
      ownership: "community_owned",
      disposition: "detach_identity",
      phase: "shared_anonymize",
      retentionAuthority: "community",
      externalEffect: "none",
      opaqueData: "preserve_shared_until_content_purge",
      storage: "none",
      schemaRequirements: ["nullable_actor_or_tombstone", "bounded_index"],
      executorOwner: "community_interactions",
      proof: "community history remains usable without resolvable deleted-account attribution",
    },
    tables: [
      "communityOnboardingConfigs",
      "communityChatMessages",
      "communityActivityEvents",
      "communityFeaturedMessages",
      "communityInteractionRoots",
      "communityInteractionReplies",
      "communityInteractionContentBlocks",
      "communityInteractionMentions",
      "communityMentionBroadcasts",
      "communityInteractionModerationEvents",
      "communityAppMounts",
      "skillPackageRevisions",
      "communitySkillAttachments",
      "communityAiFeedPosts",
    ],
  },
  {
    policy: {
      ownership: "community_owned",
      disposition: "detach_identity",
      phase: "shared_anonymize",
      retentionAuthority: "community",
      externalEffect: "none",
      opaqueData: "preserve_shared_until_content_purge",
      storage: "preserve_shared_until_content_purge",
      schemaRequirements: ["nullable_actor_or_tombstone", "bounded_index"],
      executorOwner: "community_interactions",
      proof: "shared attachments survive account deletion and remain governed by explicit content purge",
    },
    tables: ["communityInteractionAttachments"],
  },
  {
    policy: {
      ownership: "community_owned",
      disposition: "hard_delete",
      phase: "shared_anonymize",
      retentionAuthority: "community",
      externalEffect: "none",
      opaqueData: "none",
      storage: "none",
      schemaRequirements: ["bounded_index"],
      executorOwner: "community_interactions",
      proof: "personal reactions are removed and community aggregates are deterministically recomputed",
    },
    tables: ["communityMessageReactions", "communityInteractionReactions", "communityAiFeedReactions"],
  },
  {
    policy: {
      ownership: "community_owned",
      disposition: "detach_identity",
      phase: "shared_anonymize",
      retentionAuthority: "community",
      externalEffect: "none",
      opaqueData: "preserve_shared_until_content_purge",
      storage: "preserve_shared_until_content_purge",
      schemaRequirements: ["nullable_actor_or_tombstone", "bounded_index"],
      executorOwner: "community_resources",
      proof: "community resources and events retain management continuity after contributor departure",
    },
    tables: [
      "communityResources",
      "communitySourceCrawlJobs",
      "communityResourceModules",
      "communityResourceBuilderChangesets",
      "communityEvents",
    ],
  },
  {
    policy: {
      ownership: "community_owned",
      disposition: "parent_managed",
      phase: "shared_anonymize",
      retentionAuthority: "community",
      externalEffect: "none",
      opaqueData: "preserve_shared_until_content_purge",
      storage: "none",
      schemaRequirements: ["none"],
      executorOwner: "community_interactions",
      proof: "indirect community rows follow their canonical parent rather than account identity",
    },
    tables: [
      "communityFunnels",
      "communityChatThreads",
      "communityInteractionEmbeds",
      "communityInteractionLegacyChatLinks",
      "communityAgentConfigs",
      "communityResourceContents",
    ],
  },
  {
    policy: {
      ownership: "community_owned",
      disposition: "parent_managed",
      phase: "preflight_blockers",
      retentionAuthority: "product_policy",
      externalEffect: "revoke_credentials",
      opaqueData: "preserve_shared_until_content_purge",
      storage: "none",
      schemaRequirements: ["transfer_contract"],
      executorOwner: "apps_skills",
      proof: "app connections and tool snapshots follow a transferred or removed developer app",
    },
    tables: ["appConnections", "appToolSnapshots"],
  },
  {
    policy: {
      ownership: "derived_intelligence",
      disposition: "privacy_propagate",
      phase: "privacy_propagation",
      retentionAuthority: "community",
      externalEffect: "none",
      opaqueData: "privacy_propagate",
      storage: "none",
      schemaRequirements: ["privacy_lineage", "bounded_index"],
      executorOwner: "community_intelligence",
      proof: "purged private evidence cannot reappear through archive, retrieval, or accepted intelligence",
    },
    tables: [
      "communitySourceUnits",
      "communitySourceUnitContents",
      "communityArchiveDocuments",
      "communitySourceTraces",
      "communityEvidenceCitations",
      "communityEvidenceRetrievalLogs",
      "communityIntelligenceNodes",
      "communityIntelligenceEdges",
      "communityIntelligenceMutations",
      "communityIntelligenceChangeRequests",
      "communityIntelligenceRetrievalLogs",
      "communityOutcomeObservations",
      "communityMemoryMetabolizerRuns",
      "communityCompilerDigests",
    ],
  },
];

function buildTablePolicies(groups: readonly PolicyGroup[]): Readonly<Record<string, AccountLifecycleTablePolicy>> {
  const policies: Record<string, AccountLifecycleTablePolicy> = {};
  for (const group of groups) {
    for (const table of group.tables) {
      if (policies[table]) throw new Error(`duplicate_account_lifecycle_table_policy:${table}`);
      policies[table] = group.policy;
    }
  }
  return Object.freeze(policies);
}

export const ACCOUNT_LIFECYCLE_TABLE_POLICIES = buildTablePolicies(policyGroups);

export const ACCOUNT_LIFECYCLE_FIELD_OVERRIDES: Readonly<
  Record<string, Pick<AccountLifecycleTablePolicy, "disposition" | "phase" | "retentionAuthority" | "executorOwner">>
> = Object.freeze({
  "operatorRoles.createdBy": {
    disposition: "retain_minimal",
    phase: "retained_evidence",
    retentionAuthority: "security_operations",
    executorOwner: "security_operations",
  },
});

export type AccountLifecycleUnindexedLookup = "index_required" | "parent_cascade";

export type AccountLifecycleUnindexedEdgePolicy =
  | { lookup: "index_required"; reason: string }
  | {
      lookup: "parent_cascade";
      reason: string;
      parentTable: string;
      parentIndex: string;
      childForeignKey: string;
      childIndex: string;
    };

export const ACCOUNT_LIFECYCLE_UNINDEXED_EDGE_POLICIES: Readonly<
  Record<string, AccountLifecycleUnindexedEdgePolicy>
> = Object.freeze({
  "operatorRoles.createdBy": { lookup: "index_required", reason: "security attribution must be minimized without a global scan" },
  "partnerAttributions.partnerUserId": { lookup: "parent_cascade", reason: "resolve builderPartners by user, then attribution rows by partner", parentTable: "builderPartners", parentIndex: "by_user", childForeignKey: "partnerId", childIndex: "by_partner_status" },
  "partnerCommissionLedger.partnerUserId": { lookup: "parent_cascade", reason: "resolve builderPartners by user, then ledger rows by partner", parentTable: "builderPartners", parentIndex: "by_user", childForeignKey: "partnerId", childIndex: "by_partner_status" },
  "partnerCommissionAdjustments.partnerUserId": { lookup: "parent_cascade", reason: "resolve builderPartners by user, then adjustments by partner", parentTable: "builderPartners", parentIndex: "by_user", childForeignKey: "partnerId", childIndex: "by_partner_createdAt" },
  "partnerPayoutBatches.approvedByUserId": { lookup: "index_required", reason: "operator approval attribution requires bounded minimization" },
  "partnerPayoutBatches.processedByUserId": { lookup: "index_required", reason: "operator processing attribution requires bounded minimization" },
  "partnerPayoutTransfers.partnerUserId": { lookup: "parent_cascade", reason: "resolve builderPartners by user, then transfers by partner", parentTable: "builderPartners", parentIndex: "by_user", childForeignKey: "partnerId", childIndex: "by_partner_createdAt" },
  "partnerPayoutItems.partnerUserId": { lookup: "parent_cascade", reason: "resolve builderPartners by user, then payout items by partner", parentTable: "builderPartners", parentIndex: "by_user", childForeignKey: "partnerId", childIndex: "by_partner_createdAt" },
  "workspaceDirectorySnapshots.ownerId": { lookup: "parent_cascade", reason: "delete snapshots through the owned cloud project", parentTable: "cloudProjects", parentIndex: "by_owner", childForeignKey: "projectId", childIndex: "by_project_path" },
  "workspaceFilePreviewSnapshots.ownerId": { lookup: "parent_cascade", reason: "delete previews through the owned cloud project", parentTable: "cloudProjects", parentIndex: "by_owner", childForeignKey: "projectId", childIndex: "by_project_path" },
  "criticalAuditEvents.subjectUserId": { lookup: "index_required", reason: "subject identity minimization cannot scan audit history" },
  "memberFacts.createdByUserId": { lookup: "index_required", reason: "creator attribution may reference the account outside owned facts" },
  "communityOnboardingConfigs.updatedByUserId": { lookup: "index_required", reason: "onboarding attribution must be detached without community-wide scans" },
  "communityBlocks.createdByUserId": { lookup: "index_required", reason: "moderation authorship requires a bounded lookup" },
  "platformBusinessVisits.userId": { lookup: "index_required", reason: "visit aggregation and pseudonymization require bounded lookup" },
  "communityActivityEvents.actorUserId": { lookup: "index_required", reason: "community activity attribution must detach without scanning communities" },
  "communityFeaturedMessages.featuredByUserId": { lookup: "index_required", reason: "feature attribution must detach without scanning messages" },
  "communityInteractionAttachments.createdByUserId": { lookup: "index_required", reason: "shared attachment attribution requires bounded detachment" },
  "communityInteractionContentBlocks.mentionedUserId": { lookup: "index_required", reason: "deleted-user mentions require bounded tombstone projection" },
  "communityMentionBroadcasts.actorUserId": { lookup: "index_required", reason: "broadcast actor attribution requires bounded detachment" },
  "communityAgentServeRequests.sponsorUserId": { lookup: "index_required", reason: "sponsor evidence requires bounded minimization" },
  "communityInteractionReactions.actorUserId": { lookup: "index_required", reason: "reaction deletion and aggregate repair require bounded lookup" },
  "communityAppMounts.mountedByUserId": { lookup: "index_required", reason: "mount attribution must detach after app transfer" },
  "skillPackageRevisions.createdByUserId": { lookup: "index_required", reason: "revision attribution may outlive package ownership" },
  "communitySkillAttachments.attachedByUserId": { lookup: "index_required", reason: "attachment attribution must detach without scanning communities" },
  "communityAiFeedPosts.authorUserId": { lookup: "index_required", reason: "community feed authorship requires bounded detachment" },
  "communityResources.sourceExternalConnectionUserId": { lookup: "index_required", reason: "external source authority must be severed without scanning resources" },
  "communityResourceBuilderChangesets.approvedByUserId": { lookup: "index_required", reason: "review attribution requires bounded detachment" },
  "communityResourceBuilderChangesets.rejectedByUserId": { lookup: "index_required", reason: "review attribution requires bounded detachment" },
  "communityResourceBuilderChangesets.appliedByUserId": { lookup: "index_required", reason: "apply attribution requires bounded detachment" },
  "communitySourceTraces.actorUserId": { lookup: "index_required", reason: "privacy lineage cannot depend on a community-wide scan" },
  "communityIntelligenceNodes.createdByUserId": { lookup: "index_required", reason: "accepted intelligence attribution requires bounded privacy propagation" },
  "communityIntelligenceNodes.lastUpdatedByUserId": { lookup: "index_required", reason: "accepted intelligence attribution requires bounded privacy propagation" },
  "communityIntelligenceEdges.createdByUserId": { lookup: "index_required", reason: "intelligence edge attribution requires bounded privacy propagation" },
  "communityIntelligenceMutations.actorUserId": { lookup: "index_required", reason: "mutation evidence requires bounded privacy propagation" },
  "communityIntelligenceChangeRequests.createdByUserId": { lookup: "index_required", reason: "change-request attribution requires bounded privacy propagation" },
  "communityIntelligenceChangeRequests.decidedByUserId": { lookup: "index_required", reason: "decision attribution requires bounded privacy propagation" },
  "communityOutcomeObservations.observedByUserId": { lookup: "index_required", reason: "outcome attribution requires bounded privacy propagation" },
  "communityCompilerDigests.createdByUserId": { lookup: "index_required", reason: "digest attribution requires bounded privacy propagation" },
});

export const ACCOUNT_LIFECYCLE_OPAQUE_FIELD_KINDS = Object.freeze({
  anyValue: "v.any",
  jsonSuffix: "field name ending in Json",
  storageId: "v.id(\"_storage\")",
});

export const ACCOUNT_LIFECYCLE_EXECUTION_BLOCKERS = Object.freeze([
  {
    code: "historical_partner_retention_unresolved",
    reason: "Historical Builder Partner obligations must retain their recorded policy and economic basis; account deletion cannot rewrite or erase them.",
  },
  {
    code: "retention_authorities_unapproved",
    reason: "Finance, legal, security, diagnostic, backup, and provider retention durations need named owners and approved TTLs.",
  },
  {
    code: "bounded_indexes_missing",
    reason: "Every index_required edge must receive a bounded schema index before its executor can run.",
  },
  {
    code: "actor_tombstones_missing",
    reason: "Required actor references need nullable or explicit tombstone schema before shared anonymization.",
  },
  {
    code: "privacy_lineage_incomplete",
    reason: "Privacy purge lineage must reach archives, evidence, retrieval, and accepted intelligence.",
  },
  {
    code: "authored_content_boundary_incomplete",
    reason: "Account deletion must remain separate from authored-content deletion.",
  },
] as const);

export const ACCOUNT_LIFECYCLE_TRANSFER_BLOCKER_CODES = Object.freeze({
  ownedCommunity: "owned_community_resolution_required",
  ownedDeveloperApp: "owned_developer_app_resolution_required",
  ownedSkillPackage: "owned_skill_package_resolution_required",
} as const);

export type AccountLifecycleBlockerCode =
  | (typeof ACCOUNT_LIFECYCLE_EXECUTION_BLOCKERS)[number]["code"]
  | (typeof ACCOUNT_LIFECYCLE_TRANSFER_BLOCKER_CODES)[keyof typeof ACCOUNT_LIFECYCLE_TRANSFER_BLOCKER_CODES];
