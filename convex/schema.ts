import { founderProviderRequestUsageValidator } from "./founderPlanPricing";
import { defineSchema, defineTable } from "convex/server";
import { communityFormQuestionValidator } from "./communityFormValidators";
import { communityLessonFieldsValidator } from "./communityLessonValidators";
import { v } from "convex/values";
import { communityFunnelContentV2Validator } from "./communityFunnelValidators";
import { communityWeeklyDigestSnapshotValidator } from "./communityWeeklyDigestValidators";
import { channelAccessModeValidator, channelPostingPolicyValidator, channelReplyPolicyValidator } from "./communityChannelValidators";

const workflowRequirementEvidenceValidator = v.array(v.object({
  automationKey: v.string(), generation: v.string(), activationSequence: v.number(),
  sourceRef: v.string(), satisfiedAt: v.number(),
}));

// One "Only if" clause: a member property compared with a value.
const workflowConditionClauseValidator = v.object({
  propertyKey: v.string(),
  op: v.union(v.literal("is"), v.literal("is_not"), v.literal("is_set"), v.literal("is_empty")),
  value: v.optional(v.union(v.string(), v.number(), v.boolean())),
});

// One rule of a Workflow stage: a trigger and an action.
const workflowAutomationValidator = v.object({
  key: v.string(),
  timerGeneration: v.optional(v.string()),
  sequenceEnabledAt: v.optional(v.number()),
  sequenceEnabledRevision: v.optional(v.number()),
  condition: v.optional(v.object({
    propertyKey: v.string(),
    op: v.union(v.literal("is"), v.literal("is_not"), v.literal("is_set"), v.literal("is_empty")),
    value: v.optional(v.union(v.string(), v.number(), v.boolean())),
    // More clauses, joined by match (all = AND, any = OR); otherwise runs when they don't hold.
    match: v.optional(v.union(v.literal("all"), v.literal("any"))),
    also: v.optional(v.array(workflowConditionClauseValidator)),
    otherwise: v.optional(v.boolean()),
  })),
  trigger: v.union(
    v.object({ type: v.literal("member_joined") }),
      v.object({ type: v.literal("previous_action_completed"), predecessorActionKey: v.string(), delayMinutes: v.optional(v.number()) }),
    v.object({ type: v.literal("form_submitted"), formKey: v.string() }),
    v.object({ type: v.literal("lesson_completed"), resourceId: v.optional(v.string()) }),
    v.object({ type: v.literal("course_completed"), moduleId: v.optional(v.string()) }),
    v.object({ type: v.literal("track_completed"), trackKey: v.optional(v.string()) }),
    v.object({ type: v.literal("client_property_changed"), propertyKey: v.string(), value: v.optional(v.union(v.string(), v.number(), v.boolean())) }),
    v.object({ type: v.literal("property_date"), propertyKey: v.string(), offsetDays: v.number() }),
    v.object({ type: v.literal("offer_started"), offerKey: v.optional(v.string()) }),
    v.object({ type: v.literal("offer_ended"), offerKey: v.optional(v.string()) }),
    v.object({ type: v.literal("pod_member_added"), channelId: v.optional(v.string()) }),
    v.object({ type: v.literal("member_contributed"), channelId: v.optional(v.string()) }),
    v.object({ type: v.literal("milestone_elapsed"), delayMinutes: v.number(), nudge: v.optional(v.boolean()) }),
  ),
  action: v.union(
    v.object({ key: v.string(), type: v.literal("create_service_channel") }),
    v.object({ key: v.string(), type: v.literal("request_form"), formKey: v.string() }),
    v.object({
      key: v.string(),
      type: v.literal("prompt_agent"),
      prompt: v.string(),
      sees: v.optional(v.array(v.string())),
    }),
    v.object({
      key: v.string(),
      type: v.literal("set_client_property"),
      propertyKey: v.string(),
      value: v.union(v.string(), v.number(), v.boolean(), v.array(v.string()), v.null()),
    }),
    v.object({ key: v.string(), type: v.literal("send_email"), subject: v.string(), body: v.string() }),
    v.object({ key: v.string(), type: v.literal("set_pod_member"), channelId: v.string(), active: v.boolean() }),
  ),
});

export default defineSchema({
  communityFormRequests: defineTable({
    communityId: v.id("communities"), membershipId: v.id("communityMemberships"),
    workflowId: v.id("communityMemberWorkflows"), workflowRunId: v.id("communityMemberWorkflowRuns"),
    automationKey: v.string(), milestoneKey: v.string(), milestoneEnteredAt: v.number(),
    activationSequence: v.number(), formKey: v.string(), versionId: v.id("communityFormVersions"),
    status: v.union(v.literal("pending"), v.literal("submitted"), v.literal("cancelled")),
    answers: v.record(v.string(), v.union(v.string(), v.array(v.string()))),
    revision: v.number(), createdAt: v.number(), updatedAt: v.number(), submittedAt: v.optional(v.number()),
  }).index("by_member_status", ["membershipId", "status"])
    .index("by_member_visit_status", ["membershipId", "workflowId", "activationSequence", "milestoneKey", "milestoneEnteredAt", "status"])
    .index("by_assignment", ["workflowId", "membershipId", "activationSequence", "milestoneKey", "milestoneEnteredAt", "automationKey"]),
  communityForms: defineTable({
    communityId: v.id("communities"), key: v.string(), name: v.string(),
    questions: v.array(communityFormQuestionValidator), revision: v.number(),
    publishedRevision: v.optional(v.number()), createdAt: v.number(), updatedAt: v.number(),
    /** Order in the Forms list and every form picker; absent sorts by creation. */
    position: v.optional(v.number()),
    /** Deleted from the list but kept, so past answers still read; restorable. */
    deletedAt: v.optional(v.number()),
  }).index("by_community_key", ["communityId", "key"]),
  communityFormVersions: defineTable({
    communityId: v.id("communities"), formId: v.id("communityForms"), revision: v.number(),
    name: v.string(), questions: v.array(communityFormQuestionValidator),
    publishedBy: v.id("users"), publishedAt: v.number(),
  }).index("by_form_revision", ["formId", "revision"]),
  users: defineTable({
    authSubject: v.string(),
    email: v.optional(v.string()),
    normalizedEmail: v.optional(v.string()),
    emailVerifiedAt: v.optional(v.number()),
    emailVerificationSource: v.optional(
      v.union(
        v.literal("oauth_provider"),
        v.literal("magic_link"),
        v.literal("manual_change_code"),
      ),
    ),
    displayName: v.optional(v.string()),
    handle: v.optional(v.string()),
    normalizedHandle: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_authSubject", ["authSubject"])
    .index("by_email", ["email"])
    .index("by_normalizedEmail", ["normalizedEmail"])
    .index("by_normalizedHandle", ["normalizedHandle"]),

  distributionAttributionDeliveries: defineTable({
    userId: v.id('users'),
    deliveryKey: v.string(),
    sourceEventId: v.string(),
    anonymousId: v.optional(v.string()),
    clickId: v.optional(v.string()),
    status: v.union(
      v.literal('pending'),
      v.literal('delivering'),
      v.literal('delivered'),
      v.literal('needs_attention'),
    ),
    attemptCount: v.number(),
    resumeCount: v.optional(v.number()),
    attemptToken: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    nextAttemptAt: v.optional(v.number()),
    responseStatus: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
    downstreamViewerId: v.optional(v.string()),
    downstreamLeadEventId: v.optional(v.string()),
    downstreamLeadCreated: v.optional(v.boolean()),
    downstreamReplayed: v.optional(v.boolean()),
    deliveredAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_delivery_key', ['deliveryKey'])
    .index('by_user', ['userId'])
    .index('by_status_next_attempt_at', ['status', 'nextAttemptAt'])
    .index('by_status_lease_expires_at', ['status', 'leaseExpiresAt']),

  authSessions: defineTable({
    sessionId: v.string(),
    authSubject: v.string(),
    userId: v.id("users"),
    replacedBySessionId: v.optional(v.string()),
    encryptedSecretHex: v.optional(v.string()),
    secretIvHex: v.optional(v.string()),
    secretVersion: v.optional(v.number()),
    accessTokenExpiresAt: v.optional(v.number()),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    refreshGeneration: v.optional(v.number()),
    refreshLeaseId: v.optional(v.string()),
    refreshLeaseExpiresAt: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
    idleExpiresAt: v.optional(v.number()),
    absoluteExpiresAt: v.optional(v.number()),
    lastRefreshAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    revokedReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_authSubject", ["authSubject"])
    .index("by_user", ["userId"])
    .index("by_revokedAt", ["revokedAt"]),

  userEntitlements: defineTable({
    userId: v.id("users"),
    tier: v.union(v.literal("free"), v.literal("architect")),
    source: v.union(
      v.literal("default"),
      v.literal("admin_override"),
      v.literal("manual_grant"),
      v.literal("premium_subscription"),
    ),
    startsAt: v.number(),
    endsAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_startsAt", ["userId", "startsAt"]),

  operatorRoles: defineTable({
    userId: v.id("users"),
    email: v.optional(v.string()),
    normalizedEmail: v.optional(v.string()),
    role: v.union(v.literal("owner"), v.literal("operator"), v.literal("readonly")),
    active: v.boolean(),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_normalizedEmail", ["normalizedEmail"])
    .index("by_active_role", ["active", "role"]),

  userStripeConnectAccounts: defineTable({
    userId: v.id("users"),
    stripeAccountId: v.string(),
    accountType: v.literal("express"),
    country: v.optional(v.string()),
    serviceAgreement: v.optional(v.string()),
    transfersEnabled: v.optional(v.boolean()),
    status: v.union(
      v.literal("onboarding_required"),
      v.literal("pending_requirements"),
      v.literal("ready"),
      v.literal("restricted"),
    ),
    detailsSubmitted: v.boolean(),
    chargesEnabled: v.boolean(),
    payoutsEnabled: v.boolean(),
    requirementsCurrentlyDue: v.array(v.string()),
    requirementsEventuallyDue: v.array(v.string()),
    requirementsDisabledReason: v.optional(v.string()),
    onboardingCompleteAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_stripeAccountId", ["stripeAccountId"]),

  legalAcceptances: defineTable({
    userId: v.id("users"),
    documentKey: v.string(),
    documentVersion: v.string(),
    acceptedAt: v.number(),
    source: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_document_version", ["userId", "documentKey", "documentVersion"])
    .index("by_document_version_acceptedAt", ["documentKey", "documentVersion", "acceptedAt"]),

  legacyProgramGrants: defineTable({
    userId: v.id("users"),
    grantKey: v.string(),
    sourceProgram: v.string(),
    sourceRecordId: v.string(),
    sourceStatus: v.string(),
    acceptedTermsVersion: v.string(),
    acceptedTermsAt: v.number(),
    capturedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_grantKey", ["userId", "grantKey"])
    .index("by_grantKey_capturedAt", ["grantKey", "capturedAt"]),

  founderSubscriptions: defineTable({
    ownerUserId: v.id("users"),
    communityId: v.optional(v.id("communities")),
    attachedAt: v.optional(v.number()),
    provider: v.literal("stripe"),
    providerCustomerId: v.string(),
    providerSubscriptionId: v.string(),
    providerPriceId: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("past_due"),
      v.literal("cancel_at_period_end"),
      v.literal("canceled"),
      v.literal("ended"),
    ),
    currentPeriodStartAt: v.number(),
    currentPeriodEndAt: v.number(),
    cancelAtPeriodEnd: v.boolean(),
    endedAt: v.optional(v.number()),
    revokedReason: v.optional(v.string()),
    riskAccessState: v.optional(
      v.union(v.literal("clear"), v.literal("revoked")),
    ),
    riskStateChangedAt: v.optional(v.number()),
    lastProviderEventCreatedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerUserId"])
    .index("by_owner_status", ["ownerUserId", "status"])
    .index("by_community", ["communityId"])
    .index("by_provider_subscription", ["providerSubscriptionId"]),

  communityArchiveBillingJobs: defineTable({
    communityId: v.id("communities"),
    lifecycleGeneration: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("complete"),
      v.literal("blocked"),
    ),
    attemptCount: v.number(),
    nextAttemptAt: v.number(),
    lastErrorCode: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community_generation", ["communityId", "lifecycleGeneration"])
    .index("by_status_nextAttemptAt", ["status", "nextAttemptAt"]),

  founderUsageCycles: defineTable({
    founderSubscriptionId: v.id("founderSubscriptions"),
    communityId: v.id("communities"),
    cycleKey: v.string(),
    cycleStartAt: v.number(),
    cycleEndAt: v.number(),
    includedCostMicros: v.number(),
    reservedCostMicros: v.number(),
    settledCostMicros: v.number(),
    pricingVersion: v.string(),
    inputCostMicrosPerMillionTokens: v.number(),
    outputCostMicrosPerMillionTokens: v.number(),
    maxRunReservationCostMicros: v.number(),
    status: v.union(v.literal("open"), v.literal("closed")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_subscription", ["founderSubscriptionId"])
    .index("by_subscription_status", ["founderSubscriptionId", "status"])
    .index("by_cycle_key", ["cycleKey"])
    .index("by_community_status", ["communityId", "status"]),

  // Monthly (UTC) spend ledger for operator-funded communities. The operator
  // grant waives payment but keeps the same bounded allowance as Builder.
  operatorGrantUsageCycles: defineTable({
    communityId: v.id("communities"),
    cycleKey: v.string(),
    cycleStartAt: v.number(),
    cycleEndAt: v.number(),
    includedCostMicros: v.number(),
    reservedCostMicros: v.number(),
    settledCostMicros: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_cycle_key", ["cycleKey"]),

  communityInferenceReceipts: defineTable({
    receiptKey: v.string(),
    sourceRunId: v.string(),
    communityId: v.id("communities"),
    actorUserId: v.id("users"),
    payerUserId: v.id("users"),
    fundingMode: v.union(
      v.literal("platform_subscription"),
      v.literal("platform_operator_grant"),
    ),
    founderSubscriptionId: v.optional(v.id("founderSubscriptions")),
    usageCycleId: v.optional(v.id("founderUsageCycles")),
    operatorUsageCycleId: v.optional(v.id("operatorGrantUsageCycles")),
    surface: v.union(
      v.literal("member_agent_dock"),
      v.literal("community_funnel_builder"),
      v.literal("community_agent_mention"),
      v.literal("community_autonomous_cognition"),
      v.literal("community_workflow_action"),
      v.literal("community_setup_generation"),
      v.literal("community_founder_brief"),
    ),
    provider: v.literal("openai"),
    modelId: v.string(),
    status: v.union(
      v.literal("authorized"),
      v.literal("settled"),
      v.literal("failed"),
      v.literal("indeterminate"),
    ),
    claimToken: v.string(),
    leaseExpiresAt: v.number(),
    providerStartedAt: v.optional(v.number()),
    promptTokens: v.optional(v.number()),
    completionTokens: v.optional(v.number()),
    cachedInputTokens: v.optional(v.number()),
    cacheWriteTokens: v.optional(v.number()),
    pricingVersion: v.optional(v.string()),
    providerRequests: v.optional(v.array(founderProviderRequestUsageValidator)),
    pricingSnapshot: v.optional(v.object({
      modelId: v.string(),
      pricingVersion: v.string(),
      inputCostMicrosPerMillionTokens: v.number(),
      outputCostMicrosPerMillionTokens: v.number(),
      cachedInputCostMicrosPerMillionTokens: v.optional(v.number()),
      cacheWriteCostMicrosPerMillionTokens: v.optional(v.number()),
      longContextThresholdTokens: v.optional(v.number()),
    })),
    reservedCostMicros: v.optional(v.number()),
    settledCostMicros: v.optional(v.number()),
    outcomeCode: v.optional(v.string()),
    failureCode: v.optional(v.string()),
    authorizedAt: v.number(),
    settledAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_receipt_key", ["receiptKey"])
    .index("by_source_run", ["sourceRunId"])
    .index("by_actor_community_createdAt", ["actorUserId", "communityId", "createdAt"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_payer_createdAt", ["payerUserId", "createdAt"]),

  communityPaidToolReceipts: defineTable({
    receiptKey: v.string(),
    sourceRunId: v.string(),
    toolCallId: v.string(),
    communityId: v.id("communities"),
    actorUserId: v.id("users"),
    payerUserId: v.id("users"),
    fundingMode: v.union(
      v.literal("platform_subscription"),
      v.literal("platform_operator_grant"),
    ),
    founderSubscriptionId: v.optional(v.id("founderSubscriptions")),
    usageCycleId: v.optional(v.id("founderUsageCycles")),
    operatorUsageCycleId: v.optional(v.id("operatorGrantUsageCycles")),
    toolName: v.union(v.literal("web_research"), v.literal("web_crawl")),
    action: v.union(
      v.literal("search"),
      v.literal("open_page"),
      v.literal("find_in_page"),
      v.literal("crawl"),
    ),
    status: v.union(
      v.literal("authorized"),
      v.literal("settled"),
      v.literal("failed"),
      v.literal("indeterminate"),
    ),
    claimToken: v.string(),
    leaseExpiresAt: v.number(),
    providerStartedAt: v.optional(v.number()),
    pricingVersion: v.string(),
    reservedCostMicros: v.number(),
    settledCostMicros: v.optional(v.number()),
    provider: v.optional(v.string()),
    outcomeCode: v.optional(v.string()),
    failureCode: v.optional(v.string()),
    authorizedAt: v.number(),
    settledAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_receipt_key", ["receiptKey"])
    .index("by_source_run", ["sourceRunId"])
    .index("by_actor_community_createdAt", ["actorUserId", "communityId", "createdAt"])
    .index("by_cycle_createdAt", ["usageCycleId", "createdAt"])
    .index("by_community_createdAt", ["communityId", "createdAt"]),

  workspaceCreditBalances: defineTable({
    userId: v.id("users"),
    includedCreditsBalance: v.number(),
    purchasedCreditsBalance: v.number(),
    uncollectedCreditsBalance: v.optional(v.number()),
    pendingCardCollectionCreditsBalance: v.optional(v.number()),
    includedCycleCredits: v.number(),
    includedCycleStartedAt: v.number(),
    includedCycleEndsAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_updatedAt", ["updatedAt"]),

  workspaceComputeCharges: defineTable({
    chargeKey: v.string(),
    userId: v.id("users"),
    projectId: v.optional(v.string()),
    runId: v.string(),
    providerSandboxId: v.string(),
    startedAt: v.number(),
    endedAt: v.number(),
    durationSeconds: v.number(),
    sandboxCpu: v.number(),
    sandboxMemoryGiB: v.number(),
    sandboxDiskGiB: v.number(),
    computeCostUsd: v.number(),
    creditsDebited: v.number(),
    creditReservationKey: v.optional(v.string()),
    debitSource: v.union(
      v.literal("included"),
      v.literal("purchased"),
      v.literal("mixed"),
      v.literal("unbilled"),
    ),
    createdAt: v.number(),
  })
    .index("by_chargeKey", ["chargeKey"])
    .index("by_user", ["userId"])
    .index("by_run", ["runId"])
    .index("by_providerSandboxId", ["providerSandboxId"])
    .index("by_debitSource_createdAt", ["debitSource", "createdAt"]),

  providerCostEntries: defineTable({
    costKey: v.string(),
    userId: v.optional(v.id("users")),
    projectId: v.optional(v.string()),
    communityId: v.optional(v.id("communities")),
    runId: v.optional(v.string()),
    category: v.union(
      v.literal("workspace"),
      v.literal("web"),
      v.literal("voice"),
    ),
    component: v.union(
      v.literal("blaxel_active_runtime"),
      v.literal("blaxel_volume_storage"),
      v.literal("blaxel_standby_snapshot"),
      v.literal("web_research_call"),
      v.literal("web_crawl_provider_call"),
      v.literal("web_screenshot_provider_call"),
      v.literal("daytona_codex_runtime_active"),
      v.literal("voice_transcription"),
      v.literal("knowledge_model_inference"),
    ),
    provider: v.string(),
    resourceId: v.optional(v.string()),
    periodStart: v.number(),
    periodEnd: v.number(),
    quantityKind: v.string(),
    quantity: v.number(),
    rawVendorCostUsd: v.number(),
    evidence: v.union(
      v.literal("estimated"),
      v.literal("provider_reported"),
      v.literal("exact"),
    ),
    billingDisposition: v.union(
      v.literal("tracked_only"),
      v.literal("rolled_into_user_usage"),
      v.literal("platform_absorbed"),
    ),
    linkedCreditKey: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_costKey", ["costKey"])
    .index("by_user_period", ["userId", "periodStart"])
    .index("by_community_period", ["communityId", "periodStart"])
    .index("by_category_period", ["category", "periodStart"])
    .index("by_component_period", ["component", "periodStart"])
    .index("by_linkedCreditKey", ["linkedCreditKey"]),

  workspaceUsageCollections: defineTable({
    collectionKey: v.string(),
    userId: v.id("users"),
    status: v.union(
      v.literal("prepared"),
      v.literal("processing"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("released"),
    ),
    creditsAmount: v.number(),
    provider: v.optional(v.literal("stripe")),
    providerCustomerId: v.optional(v.string()),
    providerPaymentIntentId: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    metadata: v.optional(v.any()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_collectionKey", ["collectionKey"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_createdAt", ["userId", "createdAt"])
    .index("by_status_updatedAt", ["status", "updatedAt"])
    .index("by_providerPaymentIntent", ["provider", "providerPaymentIntentId"]),

  creditLedgerEntries: defineTable({
    creditKey: v.string(),
    userId: v.id("users"),
    communityId: v.optional(v.id("communities")),
    projectId: v.optional(v.string()),
    runId: v.optional(v.string()),
    toolName: v.string(),
    action: v.optional(v.string()),
    vendor: v.optional(v.string()),
    status: v.union(
      v.literal("reserved"),
      v.literal("succeeded"),
      v.literal("refunded"),
    ),
    creditsReserved: v.number(),
    creditsSettled: v.optional(v.number()),
    includedCreditsDebited: v.number(),
    purchasedCreditsDebited: v.number(),
    includedCycleStartedAt: v.optional(v.number()),
    includedCycleEndsAt: v.optional(v.number()),
    includedCreditsRefunded: v.optional(v.number()),
    purchasedCreditsRefunded: v.optional(v.number()),
    pendingSettlementStatus: v.optional(v.literal("succeeded")),
    pendingCreditsSettled: v.optional(v.number()),
    pendingRawVendorCostUsd: v.optional(v.number()),
    pendingSettlementMetadata: v.optional(v.any()),
    pendingSettlementAttempts: v.optional(v.number()),
    pendingSettlementNextAttemptAt: v.optional(v.number()),
    pendingSettlementError: v.optional(v.string()),
    pendingSettlementUpdatedAt: v.optional(v.number()),
    rawVendorCostUsd: v.optional(v.number()),
    polynetPriceUsd: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    metadata: v.optional(v.any()),
    expiresAt: v.optional(v.number()),
    settledAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_creditKey", ["creditKey"])
    .index("by_user_createdAt", ["userId", "createdAt"])
    .index("by_run", ["runId"])
    .index("by_tool_createdAt", ["toolName", "createdAt"])
    .index("by_status_settledAt", ["status", "settledAt"])
    .index("by_status_expiresAt", ["status", "expiresAt"])
    .index("by_pendingSettlementStatus_nextAttemptAt", ["pendingSettlementStatus", "pendingSettlementNextAttemptAt"]),

  criticalAuditEvents: defineTable({
    eventKey: v.string(),
    eventType: v.string(),
    severity: v.union(v.literal("info"), v.literal("warning"), v.literal("error")),
    status: v.union(
      v.literal("started"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("blocked"),
      v.literal("ignored"),
    ),
    actorUserId: v.optional(v.id("users")),
    subjectUserId: v.optional(v.id("users")),
    communityId: v.optional(v.id("communities")),
    checkoutSessionId: v.optional(v.string()),
    provider: v.union(v.literal("polynet"), v.literal("stripe"), v.literal("convex")),
    providerObjectId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_eventKey", ["eventKey"])
    .index("by_type_createdAt", ["eventType", "createdAt"])
    .index("by_severity_createdAt", ["severity", "createdAt"])
    .index("by_actor_createdAt", ["actorUserId", "createdAt"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_providerObject", ["provider", "providerObjectId"]),

  platformDiagnosticEvents: defineTable({
    eventKey: v.string(),
    eventType: v.string(),
    subsystem: v.union(
      v.literal("auth"),
      v.literal("access"),
      v.literal("security"),
      v.literal("billing"),
      v.literal("runtime"),
      v.literal("mcp"),
      v.literal("tool"),
      v.literal("community"),
      v.literal("funnel"),
      v.literal("deploy"),
      v.literal("diagnostics"),
    ),
    severity: v.union(v.literal("info"), v.literal("warning"), v.literal("error")),
    status: v.union(
      v.literal("started"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("blocked"),
      v.literal("ignored"),
    ),
    surface: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    communityId: v.optional(v.id("communities")),
    threadId: v.optional(v.id("threads")),
    runId: v.optional(v.string()),
    requestId: v.optional(v.string()),
    release: v.optional(v.string()),
    latencyMs: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_eventKey", ["eventKey"])
    .index("by_type_createdAt", ["eventType", "createdAt"])
    .index("by_subsystem_createdAt", ["subsystem", "createdAt"])
    .index("by_severity_createdAt", ["severity", "createdAt"])
    .index("by_status_createdAt", ["status", "createdAt"])
    .index("by_user_createdAt", ["userId", "createdAt"])
    .index("by_community_createdAt", ["communityId", "createdAt"]),

  checkoutSessions: defineTable({
    sessionId: v.string(),
    mode: v.union(
      v.literal("community_join"),
      v.literal("founder_subscription"),
      v.literal("premium_subscription"),
      v.literal("workspace_credit_topup"),
    ),
    provider: v.optional(v.literal("stripe")),
    providerCheckoutSessionId: v.optional(v.string()),
    providerAccountId: v.optional(v.string()),
    providerCustomerId: v.optional(v.string()),
    providerSubscriptionId: v.optional(v.string()),
    providerPriceId: v.optional(v.string()),
    currentPeriodStartAt: v.optional(v.number()),
    currentPeriodEndAt: v.optional(v.number()),
    communitySubscriptionStatus: v.optional(
      v.union(
        v.literal("active"),
        v.literal("past_due"),
        v.literal("cancel_at_period_end"),
        v.literal("canceled"),
        v.literal("ended"),
      ),
    ),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    communityId: v.optional(v.id("communities")),
    communityLifecycleGeneration: v.optional(v.number()),
    billingPeriod: v.optional(v.string()),
    pricePointId: v.optional(v.id("communityPricePoints")),
    amountBaseUnits: v.optional(v.number()),
    currency: v.optional(v.string()),
    currencyDecimals: v.optional(v.number()),
    workspaceCreditsAmount: v.optional(v.number()),
    workspaceCreditsGrantedAt: v.optional(v.number()),
    workspaceCreditsUncollectedPaid: v.optional(v.number()),
    ownerUserId: v.optional(v.id("users")),
    founderSubscriptionId: v.optional(v.id("founderSubscriptions")),
    claimToken: v.optional(v.string()),
    recoveryEmailHash: v.optional(v.string()),
    recoveryEmailHashVersion: v.optional(v.literal("hmac_sha256_v1")),
    founderRiskState: v.optional(
      v.union(v.literal("clear"), v.literal("revoked")),
    ),
    founderRiskStateChangedAt: v.optional(v.number()),
    founderRiskRevokedReason: v.optional(v.string()),
    lastProviderEventCreatedAt: v.optional(v.number()),
    status: v.union(v.literal("pending"), v.literal("complete"), v.literal("expired")),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_providerCheckoutSessionId", ["providerCheckoutSessionId"])
    .index("by_providerSubscriptionId", ["providerSubscriptionId"])
    .index("by_mode_recovery_email", ["mode", "recoveryEmailHash"])
    .index("by_owner", ["ownerUserId"])
    .index("by_owner_status", ["ownerUserId", "status"])
    .index("by_mode_status", ["mode", "status"])
    .index("by_community_status", ["communityId", "status"]),

  userStripeCustomers: defineTable({
    userId: v.id("users"),
    provider: v.literal("stripe"),
    providerCustomerId: v.string(),
    email: v.optional(v.string()),
    paymentMethodStatus: v.optional(
      v.union(v.literal("active"), v.literal("missing"), v.literal("detached")),
    ),
    providerDefaultPaymentMethodId: v.optional(v.string()),
    paymentMethodCheckedAt: v.optional(v.number()),
    cardBrand: v.optional(v.string()),
    cardLast4: v.optional(v.string()),
    cardExpMonth: v.optional(v.number()),
    cardExpYear: v.optional(v.number()),
    cardRemovedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_providerCustomerId", ["providerCustomerId"])
    .index("by_providerDefaultPaymentMethodId", ["providerDefaultPaymentMethodId"]),

  communityStripeCustomers: defineTable({
    userId: v.id("users"),
    provider: v.literal("stripe"),
    providerAccountId: v.string(),
    providerCustomerId: v.string(),
    email: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_account", ["userId", "providerAccountId"])
    .index("by_account_customer", ["providerAccountId", "providerCustomerId"]),

  purchaseClaims: defineTable({
    claimToken: v.string(),
    communityId: v.id("communities"),
    billingPeriod: v.optional(v.string()),
    pricePointId: v.optional(v.id("communityPricePoints")),
    amountBaseUnits: v.optional(v.number()),
    currency: v.optional(v.string()),
    currencyDecimals: v.optional(v.number()),
    ownerUserId: v.optional(v.id("users")),
    status: v.union(v.literal("pending"), v.literal("redeemed"), v.literal("expired")),
    sourceSessionId: v.optional(v.string()),
    redeemedByUserId: v.optional(v.id("users")),
    redeemedAt: v.optional(v.number()),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_claimToken", ["claimToken"])
    .index("by_owner", ["ownerUserId"])
    .index("by_owner_status", ["ownerUserId", "status"])
    .index("by_community_status", ["communityId", "status"]),

  userMemorySettings: defineTable({
    userId: v.id("users"),
    memoryMode: v.union(v.literal("off"), v.literal("suggest"), v.literal("auto")),
    rememberIntentEnabled: v.boolean(),
    agentName: v.optional(v.string()),
    agentSoul: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  userProviderConnections: defineTable({
    userId: v.id("users"),
    provider: v.union(v.literal("openrouter"), v.literal("openai"), v.literal("chatgpt")),
    authKind: v.union(v.literal("api_key"), v.literal("oauth_tokens")),
    encryptedSecretHex: v.string(),
    secretIvHex: v.string(),
    secretVersion: v.number(),
    keyLastFour: v.optional(v.string()),
    keyFingerprint: v.optional(v.string()),
    accountId: v.optional(v.string()),
    email: v.optional(v.string()),
    accessTokenExpiresAt: v.optional(v.number()),
    validatedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_provider", ["userId", "provider"]),

  userProviderAuthStates: defineTable({
    userId: v.id("users"),
    provider: v.literal("chatgpt"),
    state: v.string(),
    codeVerifier: v.string(),
    returnToPath: v.optional(v.string()),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_state", ["state"])
    .index("by_user_provider", ["userId", "provider"]),

  userProviderDeviceAuthStates: defineTable({
    userId: v.id("users"),
    provider: v.literal("chatgpt"),
    deviceAuthId: v.string(),
    userCode: v.string(),
    verificationUrl: v.string(),
    pollIntervalSeconds: v.number(),
    returnToPath: v.optional(v.string()),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_provider", ["userId", "provider"])
    .index("by_device_auth_id", ["deviceAuthId"]),

  userSourceIntegrationConnections: defineTable({
    userId: v.id("users"),
    provider: v.union(v.literal("google_drive"), v.literal("github")),
    authKind: v.literal("oauth_tokens"),
    encryptedSecretHex: v.string(),
    secretIvHex: v.string(),
    secretVersion: v.number(),
    accountId: v.optional(v.string()),
    accountLogin: v.optional(v.string()),
    email: v.optional(v.string()),
    scope: v.optional(v.string()),
    accessTokenExpiresAt: v.optional(v.number()),
    validatedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_provider", ["userId", "provider"]),

  userSourceIntegrationAuthStates: defineTable({
    userId: v.id("users"),
    provider: v.union(v.literal("google_drive"), v.literal("github")),
    communityId: v.optional(v.id("communities")),
    state: v.string(),
    codeVerifier: v.string(),
    redirectUri: v.string(),
    returnToPath: v.string(),
    returnContextKind: v.optional(v.literal("community_launch_knowledge")),
    callbackCodeEncryptedHex: v.optional(v.string()),
    callbackCodeIvHex: v.optional(v.string()),
    callbackCodeVersion: v.optional(v.number()),
    finalizeTokenHash: v.optional(v.string()),
    callbackReceivedAt: v.optional(v.number()),
    finalizeStatus: v.optional(
      v.union(
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed"),
      ),
    ),
    finalizeStartedAt: v.optional(v.number()),
    finalizeCompletedAt: v.optional(v.number()),
    finalizeResultJson: v.optional(v.string()),
    finalizeErrorMessage: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_state", ["state"])
    .index("by_user_provider", ["userId", "provider"]),

  userProfileDetails: defineTable({
    userId: v.id("users"),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
    avatarFocusX: v.optional(v.number()),
    avatarFocusY: v.optional(v.number()),
    avatarZoom: v.optional(v.number()),
    bio: v.optional(v.string()),
    socialLinks: v.optional(
      v.object({
        youtube: v.optional(v.string()),
        x: v.optional(v.string()),
        instagram: v.optional(v.string()),
      }),
    ),
    // Deprecated compatibility field: current onboarding no longer writes direction.
    onboardingDirection: v.optional(
      v.union(
        v.literal("build_community"),
        v.literal("discover_community"),
        v.literal("learn_about_polynet"),
      ),
    ),
    onboardingCompletedAt: v.optional(v.number()),
    /* Deterministic capture: IANA timezone from the member's browser
       (Intl.DateTimeFormat), refreshed when it drifts. Never asked. */
    timezone: v.optional(v.string()),
    timezoneCapturedAt: v.optional(v.number()),
    // What their profile shows others: communities they own or co-create,
    // and public ones they've joined. Both shown unless turned off.
    hideOwnedCommunities: v.optional(v.boolean()),
    hideJoinedCommunities: v.optional(v.boolean()),
    // Their Light/Dark pick, kept on the account so it follows them to every
    // device and their own agent can set it. Absent: the browser's pick stands.
    displayTheme: v.optional(v.union(v.literal("light"), v.literal("dark"))),
    // "Use my pick in every community" from Display.
    displayLookEverywhere: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  emailPreferences: defineTable({
    userId: v.id("users"),
    // Absent means enabled so restored digest delivery remains migration-free.
    weeklyDigestEnabled: v.optional(v.boolean()),
    // Compatibility-only field for deployments with pre-retirement rows.
    founderDigestEnabled: v.optional(v.boolean()),
    eventReminderEnabled: v.boolean(),
    // Mention ping emails; absent means enabled.
    mentionEmailsEnabled: v.optional(v.boolean()),
    // Direct message emails; absent means enabled.
    dmEmailsEnabled: v.optional(v.boolean()),
    founderAdminEmailsEnabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // One bounded scheduling authority per community. This stores only control
  // state; rendered email payloads and delivery receipts remain in emailOutbox.
  communityWeeklyDigestSchedules: defineTable({
    communityId: v.id("communities"),
    communityLifecycleGeneration: v.number(),
    status: v.union(
      v.literal("scheduled"),
      v.literal("processing"),
      v.literal("paused"),
      v.literal("needs_attention"),
    ),
    nextAttemptAt: v.optional(v.number()),
    periodStartDay: v.optional(v.string()),
    periodEndDay: v.optional(v.string()),
    recipientCursor: v.optional(v.string()),
    // One temporary member-safe payload reused across paginated recipient
    // batches. It is cleared when the weekly run completes.
    digestSnapshot: v.optional(communityWeeklyDigestSnapshotValidator),
    failureCount: v.number(),
    leaseToken: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_status_nextAttemptAt", ["status", "nextAttemptAt"])
    .index("by_status_leaseExpiresAt", ["status", "leaseExpiresAt"]),

  emailOutbox: defineTable({
    kind: v.string(),
    // Mention mail keeps source identity, never a copied preview as authority.
    sourceMentionId: v.optional(v.id("communityInteractionMentions")),
    communityId: v.optional(v.id("communities")),
    communityLifecycleGeneration: v.optional(v.number()),
    recipientUserId: v.optional(v.id("users")),
    recipientEmail: v.string(),
    templateKey: v.string(),
    payload: v.any(),
    dedupeKey: v.optional(v.string()),
    provider: v.optional(v.string()),
    providerMessageId: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("suppressed"),
    ),
    scheduledAt: v.number(),
    attemptCount: v.number(),
    lastAttemptAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status_scheduledAt", ["status", "scheduledAt"])
    .index("by_dedupeKey", ["dedupeKey"])
    .index("by_recipientUserId", ["recipientUserId"])
    .index("by_providerMessageId", ["providerMessageId"]),

  emailDeliveries: defineTable({
    outboxId: v.optional(v.id("emailOutbox")),
    provider: v.string(),
    providerMessageId: v.optional(v.string()),
    eventType: v.string(),
    payload: v.any(),
    createdAt: v.number(),
  })
    .index("by_outbox", ["outboxId"])
    .index("by_providerMessageId", ["providerMessageId"]),

  personalMemoryItems: defineTable({
    userId: v.id("users"),
    content: v.string(),
    scope: v.union(v.literal("global"), v.literal("workspace")),
    scopeId: v.optional(v.string()),
    pinned: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_scope", ["userId", "scope"])
    .index("by_user_scope_updatedAt", ["userId", "scope", "updatedAt"]),

  /* Member ontology ledger — docs/member-ontology-contract-v1.md.
     communityId null = platform-wide; set = scoped to that community (this
     column IS the cross-community isolation mechanism). consentState is
     derived from provenance at birth; transitions are member-driven only. */
  memberFacts: defineTable({
    contextKind: v.optional(v.union(v.literal("profile"), v.literal("workflow"))),
    userId: v.id("users"),
    communityId: v.optional(v.id("communities")),
    kind: v.union(
      v.literal("situation"),
      v.literal("goal"),
      v.literal("skill"),
      v.literal("interest"),
      v.literal("availability"),
      v.literal("preference"),
      v.literal("link"),
    ),
    body: v.string(),
    provenance: v.union(
      v.literal("stated_bridge"),
      v.literal("stated_interview"),
      v.literal("form_answer"),
      v.literal("social_enrichment"),
      v.literal("inferred_agent"),
      v.literal("observed_behavior"),
    ),
    confidence: v.number(),
    evidenceRefs: v.array(v.string()),
    stalenessScore: v.number(),
    consentState: v.union(
      v.literal("approved"),
      v.literal("pending"),
      v.literal("rejected"),
      v.literal("retracted"),
      v.literal("superseded"),
      v.literal("agent_internal"),
    ),
    createdByActorType: v.union(
      v.literal("member"),
      v.literal("admin"),
      v.literal("agent"),
      v.literal("compiler"),
      v.literal("system"),
    ),
    createdByUserId: v.optional(v.id("users")),
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_community", ["userId", "communityId"])
    .index("by_community_kind", ["communityId", "kind"])
    .index("by_user_consentState", ["userId", "consentState"])
    .index("by_community_consentState", ["communityId", "consentState"]),

  /* Fast profile-card projection of approved platform-scoped facts. The
     ledger is truth; only recomputeMemberSpine writes here. */
  memberProfileSpines: defineTable({
    userId: v.id("users"),
    situation: v.optional(v.string()),
    goals: v.array(v.string()),
    interests: v.array(v.string()),
    links: v.array(v.string()),
    factCount: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  communityIntegrationConnections: defineTable({
    communityId: v.id("communities"), ownerUserId: v.id("users"),
    provider: v.literal("composio"), toolkit: v.literal("hubspot"),
    providerUserId: v.string(), authConfigId: v.string(), connectedAccountId: v.string(),
    generation: v.number(),
    status: v.union(v.literal("pending"), v.literal("active"), v.literal("disconnected"), v.literal("error")),
    scopes: v.array(v.string()), expiresAt: v.optional(v.number()),
    initiationState: v.optional(v.union(v.literal("awaiting"), v.literal("ready"), v.literal("unknown"))),
    callbackClaimed: v.optional(v.boolean()),
    authorizationUrl: v.optional(v.string()), revokePending: v.optional(v.boolean()),
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_community_owner_toolkit", ["communityId", "ownerUserId", "toolkit"]),
  communities: defineTable({
    integrationReadPilotEnabled: v.optional(v.boolean()),
    ownerId: v.id("users"),
    slug: v.string(),
    name: v.string(),
    lifecycleStatus: v.optional(
      v.union(v.literal("active"), v.literal("archived")),
    ),
    lifecycleGeneration: v.optional(v.number()),
    builderAccessMode: v.optional(
      v.union(v.literal("free"), v.literal("grandfathered"), v.literal("subscription_required")),
    ),
    builderKnowledgeSetupPending: v.optional(v.boolean()),
    builderKnowledgeBuildStage: v.optional(
      v.union(v.literal("architecture"), v.literal("content")),
    ),
    builderKnowledgeBuildLeaseToken: v.optional(v.string()),
    builderKnowledgeBuildLeaseExpiresAt: v.optional(v.number()),
    oneLiner: v.optional(v.string()),
    about: v.optional(v.string()),
    externalFunnelUrl: v.optional(v.string()),
    externalFunnelActive: v.optional(v.boolean()),
    avatarUrl: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
    avatarFocusX: v.optional(v.number()),
    avatarFocusY: v.optional(v.number()),
    avatarZoom: v.optional(v.number()),
    bannerUrl: v.optional(v.string()),
    bannerStorageId: v.optional(v.id("_storage")),
    bannerFocusX: v.optional(v.number()),
    bannerFocusY: v.optional(v.number()),
    bannerZoom: v.optional(v.number()),
    brandingRevision: v.optional(v.number()),
    settingsRevision: v.optional(v.number()),
    visibility: v.union(v.literal("published"), v.literal("unlisted")),
    inferenceFundingPolicy: v.literal("managed_required"),
    entryPolicy: v.union(
      v.literal("open"),
      v.literal("approval"),
      v.literal("paid_subscription"),
    ),
    activeFunnelSlot: v.optional(
      v.union(
        v.literal("default"),
        v.literal("custom_1"),
        v.literal("custom_2"),
      ),
    ),
    activeMemberCount: v.optional(v.number()),
    // Durable activity marker for bounded memory metabolism. The revision is
    // incremented with each new canonical outcome; settlement clears pending
    // only when no newer outcome arrived during the sweep.
    memoryMetabolismPending: v.optional(v.boolean()),
    memoryMetabolismRevision: v.optional(v.number()),
    memoryMetabolismSettledRevision: v.optional(v.number()),
    memoryMetabolismRequestedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_createdAt", ["ownerId", "createdAt"])
    .index("by_slug", ["slug"])
    .index("by_memoryMetabolismPending_requestedAt", [
      "memoryMetabolismPending",
      "memoryMetabolismRequestedAt",
    ])
    .index("by_visibility_updatedAt", ["visibility", "updatedAt"]),

  // One channel model for shared and invite-only rooms; General stays shared.
  communityChannels: defineTable({
    communityId: v.id("communities"),
    systemRole: v.optional(v.literal("general")),
    slug: v.string(),
    name: v.string(),
    normalizedName: v.optional(v.string()),
    accessMode: channelAccessModeValidator,
    postingPolicy: channelPostingPolicyValidator,
    replyPolicy: v.optional(channelReplyPolicyValidator),
    status: v.union(v.literal("active"), v.literal("archived")),
    position: v.number(),
    pinnedRootId: v.optional(v.id("communityInteractionRoots")),
    /** Who gets this channel by offer (communityOffers keys). Members on one of these
     *  offers, or on a higher one that includes it, are added and removed automatically. */
    offerAudience: v.optional(v.array(v.string())),
    createdByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community_slug", ["communityId", "slug"])
    .index("by_community_status_normalizedName", ["communityId", "status", "normalizedName"])
    .index("by_community_systemRole", ["communityId", "systemRole"])
    .index("by_community_status_position", ["communityId", "status", "position"])
    .index("by_community_access_status_position", ["communityId", "accessMode", "status", "position"]),

  // Manager-owned grants, unique per channel/principal. Human grants bind to
  // the current community-membership activation; rejoining requires reinviting.
  communityChannelParticipants: defineTable({
    communityId: v.id("communities"),
    channelId: v.id("communityChannels"),
    principalKey: v.string(),
    membershipId: v.optional(v.id("communityMemberships")),
    membershipActivationSequence: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("revoked")),
    /** Added because of the member's offer (the channel's offerAudience); the offer sync only removes these. */
    viaOffer: v.optional(v.boolean()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_channel_principal", ["channelId", "principalKey"])
    .index("by_community_principal_status", ["communityId", "principalKey", "status"]),

  communityMemberships: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    serviceChannelId: v.optional(v.id("communityChannels")),
    serviceChannelRevision: v.optional(v.number()),
    role: v.union(v.literal("admin"), v.literal("moderator"), v.literal("member")),
    // An admin the owner made a co-creator: builds the community with them and
    // is shown publicly as one of its creators. No payouts.
    coCreator: v.optional(v.boolean()),
    accessSource: v.optional(
      v.union(
        v.literal("free_grant"),
        v.literal("manual_grant"),
        v.literal("paid_subscription"),
      ),
    ),
    pricePointId: v.optional(v.id("communityPricePoints")),
    /** The offers this member had at the last offer sync (communityOffers keys), so a change can start Workflow steps. */
    heldOfferKeys: v.optional(v.array(v.string())),
    active: v.optional(v.boolean()),
    activationSequence: v.optional(v.number()),
    activatedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    revokedReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_createdAt", ["userId", "createdAt"])
    .index("by_community", ["communityId"])
    .index("by_community_user", ["communityId", "userId"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_community_coCreator", ["communityId", "coCreator"]),

  communityOnboardingConfigs: defineTable({
    communityId: v.id("communities"),
    enabled: v.boolean(),
    introVideoUrl: v.optional(v.string()),
    updatedByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_community", ["communityId"]),

  communityOnboardingSessions: defineTable({
    communityId: v.id("communities"),
    membershipId: v.id("communityMemberships"),
    userId: v.id("users"),
    activationSequence: v.number(),
    introVideoUrlSnapshot: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("dismissed"),
      v.literal("superseded"),
    ),
    activatedAt: v.number(),
    orientationCompletedAt: v.optional(v.number()),
    firstCommunityPostAt: v.optional(v.number()),
    firstAgentDockTurnAt: v.optional(v.number()),
    agentTurnAcknowledgedAt: v.optional(v.number()),
    mcpHandoffCompletedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    dismissedAt: v.optional(v.number()),
    supersededAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_membership_activation", ["membershipId", "activationSequence"])
    .index("by_user_community_status_createdAt", ["userId", "communityId", "status", "createdAt"]),

  // The founder's daily brief (docs/specs/proactive-community-agent-v0.md, slice A).
  communityFounderBriefSettings: defineTable({
    communityId: v.id("communities"),
    enabled: v.boolean(),
    localHour: v.number(),
    timeZone: v.string(),
    nextDueAt: v.number(),
    updatedByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_community", ["communityId"])
    .index("by_enabled_nextDueAt", ["enabled", "nextDueAt"]),

  communityFounderBriefs: defineTable({
    communityId: v.id("communities"),
    ownerUserId: v.id("users"),
    briefDate: v.string(),
    status: v.union(v.literal("running"), v.literal("sent"), v.literal("failed")),
    windowStartMs: v.number(),
    windowEndMs: v.number(),
    leaseExpiresAt: v.number(),
    attempts: v.number(),
    writer: v.optional(v.union(v.literal("model"), v.literal("deterministic"))),
    stats: v.optional(v.record(v.string(), v.number())),
    threadMessageKey: v.optional(v.string()),
    // Saved before delivery starts: a retry re-sends exactly this, to the same thread.
    delivery: v.optional(v.object({
      threadId: v.string(),
      markdown: v.string(),
      emailPayload: v.any(),
      communityLifecycleGeneration: v.number(),
      writer: v.union(v.literal("model"), v.literal("deterministic")),
    })),
    errorCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    sentAt: v.optional(v.number()),
  }).index("by_community_date", ["communityId", "briefDate"])
    .index("by_community_status_windowEnd", ["communityId", "status", "windowEndMs"]),

  communityMemberWorkflows: defineTable({
    communityId: v.id("communities"),
    /** Builder setting: members who joined with a pending welcome form see only that form until they submit it. */
    welcomeGate: v.optional(v.boolean()),
    /** When the welcome flow was last turned on; members who join after it are held from the moment they join. */
    welcomeGateEnabledAt: v.optional(v.number()),
    /** How the welcome page shows: the whole community pane ("page", the default), or a pop-up over the open community. */
    welcomeDisplay: v.optional(v.union(v.literal("page"), v.literal("popup"))),
    /** Whether a stage change made over the MCP/CLI goes live at once ("apply", the default),
     *  waits for the owner when another admin's agent made it ("ask_others"), or always waits ("ask"). */
    agentChangeReview: v.optional(v.union(v.literal("apply"), v.literal("ask_others"), v.literal("ask"))),
    /** Lesson pages a member marks done in the welcome flow, after its join forms, in this order. */
    welcomeLessonIds: v.optional(v.array(v.id("communityResources"))),
    /** The builder's words on the welcome page; Polynet's defaults where absent. */
    welcomePage: v.optional(v.object({
      title: v.optional(v.string()),
      message: v.optional(v.string()),
      mediaUrl: v.optional(v.string()),
      /** The page as blocks with "Next" breaks (shared/communityWelcomeLayout.ts); message and media before it existed. */
      layout: v.optional(v.array(v.union(
        v.object({ type: v.literal("text"), markdown: v.string() }),
        v.object({ type: v.literal("choice"), prompt: v.string(), options: v.array(v.object({ label: v.string(), hint: v.string(), markdown: v.string(), icon: v.optional(v.string()) })), agent: v.optional(v.boolean()) }),
        v.object({ type: v.literal("form"), formKey: v.string() }),
        v.object({ type: v.literal("lesson"), resourceId: v.string() }),
        v.object({ type: v.literal("next") }),
      ))),
    })),
    milestones: v.array(
      v.object({
        key: v.string(),
        name: v.string(),
        instructions: v.optional(v.string()),
        goal: v.optional(v.string()),
        requireHumanApproval: v.optional(v.boolean()),
        color: v.optional(v.union(v.literal("grey"), v.literal("green"), v.literal("teal"), v.literal("blue"), v.literal("purple"),
          v.literal("pink"), v.literal("red"), v.literal("orange"), v.literal("yellow"))),
        automations: v.array(workflowAutomationValidator),
        /** Automations the owner switched off: kept as they were, never run. */
        pausedAutomations: v.optional(v.array(workflowAutomationValidator)),
      }),
    ),
    revision: v.number(),
    createdByUserId: v.id("users"),
    updatedByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_community", ["communityId"]),

  communityMemberWorkflowMemberMilestones: defineTable({
    requirementEvidence: v.optional(workflowRequirementEvidenceValidator),
    workflowId: v.id("communityMemberWorkflows"),
    membershipId: v.id("communityMemberships"),
    currentMilestoneKey: v.string(),
    milestoneEnteredAt: v.number(),
    transitionSeq: v.number(),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workflow", ["workflowId"])
    .index("by_workflow_membership", ["workflowId", "membershipId"])
    .index("by_workflow_milestone", ["workflowId", "currentMilestoneKey"])
    .index("by_membership", ["membershipId"]),

  communityMemberWorkflowTimers: defineTable({
    workflowId: v.id("communityMemberWorkflows"),
    communityLifecycleGeneration: v.number(),
    membershipId: v.id("communityMemberships"),
    milestoneKey: v.string(),
    milestoneEnteredAt: v.number(),
    transitionSeq: v.number(),
    activationSequence: v.number(),
    automationKey: v.string(),
    timerGeneration: v.string(),
    dueAt: v.number(),
    // Waits and event-started agent steps: the moment the wait began, and the
    // receipt it came from (one timer per receipt and rule).
    startedAt: v.optional(v.number()),
    sourceRef: v.optional(v.string()),
    // The owner skipped the wait (Run now, Test run, Autoplay): an agent step
    // it starts may run before the rule's own due time.
    runEarlyAt: v.optional(v.number()),
    status: v.union(v.literal("pending"), v.literal("consumed"), v.literal("obsolete")),
    createdAt: v.number(),
    finishedAt: v.optional(v.number()),
  })
    .index("by_status_dueAt", ["status", "dueAt"])
    .index("by_workflow_milestone_status", ["workflowId", "milestoneKey", "status"])
    .index("by_member_entry", ["workflowId", "membershipId", "activationSequence", "transitionSeq"]),

  communityMemberWorkflowRuns: defineTable({
    completionReviewSnapshot: v.optional(v.string()),
    completionReviewRetry: v.optional(v.object({ requestedAt: v.number(), requestedByUserId: v.id("users"), originalIntakeReason: v.string() })),
    // Old receipts remain history, not proof for a current activation/visit.
    activationSequence: v.optional(v.number()),
    transitionSeq: v.optional(v.number()),
    goalAssessment: v.optional(v.object({ verdict: v.union(v.literal("achieved"), v.literal("not_yet"), v.literal("insufficient_evidence")), reason: v.string(), evidenceRefs: v.array(v.string()), assessedAt: v.number() })),
    milestoneContextSnapshot: v.optional(v.object({ instructions: v.string(), goal: v.string() })),
    communityId: v.id("communities"),
    workflowId: v.id("communityMemberWorkflows"),
    membershipId: v.id("communityMemberships"),
    milestoneKey: v.string(),
    milestoneName: v.string(),
    milestoneEnteredAt: v.number(),
    workflowRevision: v.number(),
    automationKey: v.string(),
    triggerType: v.union(v.literal("member_joined"), v.literal("member_contributed"), v.literal("milestone_elapsed"), v.literal("form_submitted"), v.literal("all_actions_complete"), v.literal("previous_action_completed"), v.literal("lesson_completed"), v.literal("course_completed"), v.literal("track_completed"), v.literal("client_property_changed"), v.literal("offer_started"), v.literal("offer_ended"), v.literal("property_date"), v.literal("pod_member_added")),
    // Optional for historical runs. New runs capture the condition that matched.
    triggerSnapshot: v.optional(v.union(
      v.object({ type: v.literal("member_joined") }),
      v.object({ type: v.literal("previous_action_completed"), predecessorActionKey: v.string(), delayMinutes: v.optional(v.number()) }),
      v.object({ type: v.literal("form_submitted"), formKey: v.string() }),
      v.object({ type: v.literal("member_contributed"), channelId: v.optional(v.string()) }),
      v.object({ type: v.literal("lesson_completed"), resourceId: v.optional(v.string()) }),
      v.object({ type: v.literal("course_completed"), moduleId: v.optional(v.string()) }),
      v.object({ type: v.literal("track_completed"), trackKey: v.optional(v.string()) }),
      v.object({ type: v.literal("client_property_changed"), propertyKey: v.string(), value: v.optional(v.union(v.string(), v.number(), v.boolean())) }),
      v.object({ type: v.literal("property_date"), propertyKey: v.string(), offsetDays: v.number() }),
            v.object({ type: v.literal("offer_started"), offerKey: v.optional(v.string()) }),
            v.object({ type: v.literal("offer_ended"), offerKey: v.optional(v.string()) }),
            v.object({ type: v.literal("pod_member_added"), channelId: v.optional(v.string()) }),
      v.object({ type: v.literal("milestone_elapsed"), delayMinutes: v.number(), nudge: v.optional(v.boolean()) }),
    )),
    triggerReceiptRef: v.string(),
    predecessorRunId: v.optional(v.id("communityMemberWorkflowRuns")),
    // The rule's "Only if" when it ran; a skip only proves the step under the same condition.
    conditionSnapshot: v.optional(v.object({
      propertyKey: v.string(),
      op: v.union(v.literal("is"), v.literal("is_not"), v.literal("is_set"), v.literal("is_empty")),
      value: v.optional(v.union(v.string(), v.number(), v.boolean())),
      // More clauses, joined by match (all = AND, any = OR); otherwise runs when they don't hold.
      match: v.optional(v.union(v.literal("all"), v.literal("any"))),
      also: v.optional(v.array(workflowConditionClauseValidator)),
      otherwise: v.optional(v.boolean()),
    })),
    actionSnapshot: v.union(
      v.object({ key: v.string(), type: v.literal("evaluate_goal") }),
      v.object({ key: v.string(), type: v.literal("create_service_channel") }),
      v.object({ key: v.string(), type: v.literal("request_form"), formKey: v.string() }),
      v.object({ key: v.string(), type: v.literal("prompt_agent"), prompt: v.string(), sees: v.optional(v.array(v.string())) }),
      v.object({
        key: v.string(),
        type: v.literal("set_client_property"),
        propertyKey: v.string(),
        value: v.union(v.string(), v.number(), v.boolean(), v.array(v.string()), v.null()),
      }),
      v.object({
        key: v.string(),
        type: v.literal("move_member"),
        destination: v.literal("next_or_complete"),
      }),
      v.object({ key: v.string(), type: v.literal("send_email"), subject: v.string(), body: v.string() }),
      v.object({ key: v.string(), type: v.literal("set_pod_member"), channelId: v.string(), active: v.boolean() }),
    ),
    status: v.union(
      v.literal("running"),
      v.literal("finished"),
      v.literal("failed"),
    ),
    actionResult: v.optional(v.object({
      actionKey: v.string(),
      status: v.union(v.literal("complete"), v.literal("failed")),
      resultCode: v.optional(v.string()),
      serveRequestId: v.optional(v.id("communityAgentServeRequests")),
      formRequestId: v.optional(v.id("communityFormRequests")),
      serviceChannelId: v.optional(v.id("communityChannels")),
      transitionId: v.optional(v.id("communityMemberWorkflowTransitions")),
      errorCode: v.optional(v.string()),
    })),
    errorCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    finishedAt: v.optional(v.number()),
  })
    .index("by_workflow_membership_trigger_automation", [
      "workflowId",
      "membershipId",
      "triggerReceiptRef",
      "automationKey",
    ])
    .index("by_workflow_membership_createdAt", [
      "workflowId",
      "membershipId",
      "createdAt",
    ])
    .index("by_workflow_updatedAt", ["workflowId", "updatedAt"]),

  communityMemberWorkflowTransitions: defineTable({
    approval: v.optional(v.object({ actorUserId: v.id("users"), goal: v.string(), activationSequence: v.number() })),
    completionEvidence: v.optional(v.array(v.object({ actionKey: v.string(), automationKey: v.string(),
      run_id: v.string(), source_id: v.string(), completed_at: v.number() }))),
    forcedByUserId: v.optional(v.id("users")),
    bypassedRequirementKeys: v.optional(v.array(v.string())),
    bypassedRequirements: v.optional(v.array(v.object({ key: v.string(), label: v.string(), definition: v.string() }))),
    requirementEvidence: v.optional(workflowRequirementEvidenceValidator),
    communityId: v.id("communities"),
    workflowId: v.id("communityMemberWorkflows"),
    membershipId: v.id("communityMemberships"),
    seq: v.number(),
    fromMilestoneKey: v.string(),
    fromMilestoneName: v.string(),
    toMilestoneKey: v.optional(v.string()),
    toMilestoneName: v.optional(v.string()),
    completedWorkflow: v.boolean(),
    workflowRevision: v.number(),
    milestoneEnteredAt: v.number(),
    workflowRunId: v.optional(v.id("communityMemberWorkflowRuns")),
    actionKey: v.string(),
    occurredAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_workflow_membership_seq", ["workflowId", "membershipId", "seq"])
    .index("by_workflowRun_action", ["workflowRunId", "actionKey"])
    .index("by_community_occurredAt", ["communityId", "occurredAt"]),

  communityPresence: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    lastSeenAt: v.number(),
    // Additive rolling lease: active clients populate this on their next
    // server-authorized heartbeat; historical lastSeenAt rows remain valid data.
    activeUntil: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community_lastSeenAt", ["communityId", "lastSeenAt"])
    .index("by_community_activeUntil", ["communityId", "activeUntil"])
    .index("by_community_user", ["communityId", "userId"])
    .index("by_user", ["userId"])
    .index("by_user_activeUntil", ["userId", "activeUntil"]),

  communityJoinRequests: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    // Migration compatibility only. Tighten this to the canonical pending/denied
    // union and remove message after the production preflight + migration receipt.
    status: v.string(),
    message: v.optional(v.string()),
    deniedAt: v.optional(v.number()),
    reapplyAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_community", ["communityId"])
    .index("by_community_user", ["communityId", "userId"])
    .index("by_community_status_createdAt", ["communityId", "status", "createdAt"]),

  communityBlocks: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    createdByUserId: v.id("users"),
    reason: v.optional(v.string()),
    liftedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_community", ["communityId"])
    .index("by_community_user", ["communityId", "userId"]),

  communityFunnels: defineTable({
    communityId: v.id("communities"),
    // Slotless legacy rows are read as custom_1 during the bounded migration.
    slot: v.optional(v.union(v.literal("custom_1"), v.literal("custom_2"))),
    heroMediaUrl: v.optional(v.string()),
    heroMediaKind: v.optional(v.union(v.literal("image"), v.literal("video"))),
    // Read compatibility only. Active authority now lives on
    // communities.activeFunnelSlot.
    liveMode: v.optional(v.union(v.literal("default"), v.literal("custom"))),
    draftVslUrl: v.optional(v.union(v.string(), v.null())),
    publishedVslUrl: v.optional(v.union(v.string(), v.null())),
    draftContentV2: v.optional(communityFunnelContentV2Validator),
    publishedContentV2: v.optional(communityFunnelContentV2Validator),
    draftRevision: v.optional(v.number()),
    draftUpdatedAt: v.optional(v.number()),
    draftUpdatedByUserId: v.optional(v.id("users")),
    publishedDraftRevision: v.optional(v.number()),
    publishedAt: v.optional(v.number()),
    publishedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"]),

  // A community's look (shared/communityTheme.ts). Members see the published
  // theme; managers edit the draft. Both are stored normalized.
  communityThemes: defineTable({
    communityId: v.id("communities"),
    draftTheme: v.any(),
    draftRevision: v.number(),
    draftUpdatedAt: v.number(),
    draftUpdatedByUserId: v.id("users"),
    publishedTheme: v.optional(v.any()),
    publishedDraftRevision: v.optional(v.number()),
    publishedAt: v.optional(v.number()),
    publishedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"]),

  // Looks an owner saved under a name, to switch back to later. Applying one
  // copies it into communityThemes' draft; publishing stays a separate step.
  // Skill tracks (shared/communityLessonTracks.ts): roadmaps over the lesson
  // library. Key "main" holds the existing roadmap's title and rules; with no
  // stages of its own, its stages come from the lesson fields.
  communityLessonTracks: defineTable({
    communityId: v.id("communities"),
    key: v.string(),
    title: v.string(),
    summary: v.optional(v.string()),
    coverUrl: v.optional(v.string()),
    coverStyle: v.optional(v.union(v.literal("route"), v.literal("diagram"), v.literal("terminal"))),
    outcomes: v.optional(v.array(v.string())),
    audience: v.optional(v.string()),
    order: v.number(),
    show: v.union(v.literal("always"), v.literal("when_open")),
    opensWhen: v.array(v.union(
      v.object({ type: v.literal("after_track"), track: v.string() }),
      v.object({ type: v.literal("after_checkpoint"), resource_id: v.string() }),
      v.object({ type: v.literal("workflow_stage"), milestone_key: v.string() }),
      v.object({ type: v.literal("client_property"), property: v.string(), equals: v.union(v.string(), v.number(), v.boolean()) }),
      v.object({ type: v.literal("offer"), offer: v.string() }),
    )),
    stages: v.array(v.object({
      name: v.string(),
      steps: v.array(v.object({ resource_id: v.string(), checkpoint: v.optional(v.boolean()) })),
    })),
    revision: v.number(),
    archivedAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    updatedByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_key", ["communityId", "key"]),

  communitySavedThemes: defineTable({
    communityId: v.id("communities"),
    name: v.string(),
    theme: v.any(),
    createdByUserId: v.id("users"),
    updatedByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"]),

  // A community's layout (shared/communityLayout.ts): navigation position, tab
  // order and page arrangement. Kept apart from communityThemes so changing
  // the look never resets the layout, and the other way round.
  communityBrands: defineTable({
    communityId: v.id("communities"),
    brand: v.any(),
    revision: v.number(),
    updatedByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_community", ["communityId"]),

  communityLayouts: defineTable({
    communityId: v.id("communities"),
    draftLayout: v.any(),
    draftRevision: v.number(),
    draftUpdatedAt: v.number(),
    draftUpdatedByUserId: v.id("users"),
    publishedLayout: v.optional(v.any()),
    publishedDraftRevision: v.optional(v.number()),
    publishedAt: v.optional(v.number()),
    publishedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"]),

  // A member's own pick of the community's arrangement, where the owner's
  // layout allows one (navigation.member_choice). No row: the owner's layout.
  communityMemberLayoutPreferences: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    position: v.union(v.literal("top"), v.literal("side")),
    updatedAt: v.number(),
  })
    .index("by_community_user", ["communityId", "userId"]),

  communityAnalyticsEvents: defineTable({
    communityId: v.id("communities"),
    eventType: v.union(v.literal("funnel_visit")),
    visitorKey: v.optional(v.string()),
    visitorKeyHash: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_community_event_createdAt", ["communityId", "eventType", "createdAt"])
    .index("by_community_visitor_hash_event", ["communityId", "visitorKeyHash", "eventType"])
    .index("by_community_visitor_event", ["communityId", "visitorKey", "eventType"]),

  platformBusinessVisits: defineTable({
    pathKind: v.union(v.literal("home"), v.literal("community_funnel")),
    scopeKey: v.string(),
    communityId: v.optional(v.id("communities")),
    visitorKeyHash: v.string(),
    userId: v.optional(v.id("users")),
    source: v.union(
      v.literal("direct"),
      v.literal("search"),
      v.literal("social"),
      v.literal("referral"),
      v.literal("unknown"),
    ),
    visitBucketStartAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_path_createdAt", ["pathKind", "createdAt"])
    .index("by_scope_createdAt", ["scopeKey", "createdAt"])
    .index("by_visitor_hash_createdAt", ["visitorKeyHash", "createdAt"])
    .index("by_visitor_scope_bucket", ["visitorKeyHash", "pathKind", "scopeKey", "visitBucketStartAt"]),

  // The packages a community sells, as a ladder: an offer includes every offer
  // ranked below it. The base offer (rank 0) is priced by the community's
  // current price points; higher offers own their price points (offerId).
  communityOffers: defineTable({
    communityId: v.id("communities"),
    key: v.string(),
    name: v.string(),
    blurb: v.optional(v.string()),
    rank: v.number(),
    isBase: v.optional(v.boolean()),
    showOnSalesPage: v.boolean(),
    archivedAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    updatedByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_key", ["communityId", "key"]),

  communityPricePoints: defineTable({
    communityId: v.id("communities"),
    /** Set on a higher offer's own prices; these are never the community's isCurrent price. */
    offerId: v.optional(v.id("communityOffers")),
    billingPeriod: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    amountBaseUnits: v.number(),
    currency: v.string(),
    currencyDecimals: v.number(),
    isCurrent: v.boolean(),
    archivedAt: v.optional(v.number()),
    providerAccountId: v.optional(v.string()),
    providerPriceId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_billingPeriod", ["communityId", "billingPeriod"])
    .index("by_community_current", ["communityId", "isCurrent"]),

  communitySubscriptions: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    membershipId: v.id("communityMemberships"),
    pricePointId: v.id("communityPricePoints"),
    source: v.optional(v.union(v.literal("stripe"), v.literal("external_sync"))),
    status: v.union(
      v.literal("active"),
      v.literal("past_due"),
      v.literal("cancel_at_period_end"),
      v.literal("canceled"),
      v.literal("ended"),
    ),
    providerSubscriptionId: v.optional(v.string()),
    providerAccountId: v.optional(v.string()),
    providerCustomerId: v.optional(v.string()),
    currentPeriodStartAt: v.optional(v.number()),
    currentPeriodEndAt: v.optional(v.number()),
    cancelAtPeriodEnd: v.boolean(),
    endedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_membership", ["membershipId"])
    .index("by_pricePoint", ["pricePointId"])
    .index("by_community_user", ["communityId", "userId"])
    .index("by_providerSubscriptionId", ["providerSubscriptionId"])
    .index("by_providerAccount_subscription", ["providerAccountId", "providerSubscriptionId"])
    .index("by_status", ["status"])
    .index("by_community_status", ["communityId", "status"]),

  communityApplicationFeeRefunds: defineTable({
    providerAccountId: v.string(),
    providerChargeId: v.string(),
    providerApplicationFeeId: v.string(),
    providerRefundId: v.string(),
    providerApplicationFeeRefundId: v.optional(v.string()),
    amountBaseUnits: v.number(),
    requestedProviderRefundAmountBaseUnits: v.number(),
    providerRefundedAmountBaseUnits: v.optional(v.number()),
    currency: v.string(),
    status: v.union(
      v.literal("processing"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("indeterminate"),
    ),
    claimToken: v.string(),
    leaseExpiresAt: v.number(),
    failureCode: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_providerAccount_refund", ["providerAccountId", "providerRefundId"])
    .index("by_providerApplicationFee", ["providerApplicationFeeId"])
    .index("by_status", ["status"]),

  communityApplicationFeeRefundLocks: defineTable({
    providerAccountId: v.string(),
    providerApplicationFeeId: v.string(),
    claimToken: v.string(),
    leaseExpiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_providerApplicationFee", ["providerApplicationFeeId"]),

  communityChatThreads: defineTable({
    communityId: v.id("communities"),
    lastSeq: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_createdAt", ["communityId", "createdAt"]),

  communityChatMessages: defineTable({
    threadId: v.id("communityChatThreads"),
    seq: v.number(),
    role: v.literal("user"),
    contentJson: v.any(),
    senderUserId: v.optional(v.id("users")),
    replyToMessageId: v.optional(v.id("communityChatMessages")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_thread_seq", ["threadId", "seq"])
    .index("by_sender", ["senderUserId"]),

  communityActivityEvents: defineTable({
    communityId: v.id("communities"),
    type: v.union(
      v.literal("member_joined"),
      v.literal("resource_added"),
      v.literal("event_soon"),
      v.literal("event_starting"),
      v.literal("ai_feed_post_added"),
    ),
    actorUserId: v.optional(v.id("users")),
    targetType: v.optional(
      v.union(
        v.literal("membership"),
        v.literal("resource"),
        v.literal("event"),
        v.literal("ai_feed_post"),
      ),
    ),
    targetId: v.optional(v.string()),
    targetTitle: v.optional(v.string()),
    dedupeKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_community_type_createdAt", ["communityId", "type", "createdAt"])
    .index("by_community_dedupeKey", ["communityId", "dedupeKey"]),

  communityMessageReactions: defineTable({
    messageId: v.id("communityChatMessages"),
    userId: v.id("users"),
    emoji: v.string(),
    createdAt: v.number(),
  })
    .index("by_message", ["messageId"])
    .index("by_message_user_emoji", ["messageId", "userId", "emoji"])
    .index("by_user", ["userId"]),

  /* Host-curated messages projected public-safely to visitors on the community
     funnel (/c/:slug). Pointer table — never touches the message rows. */
  communityFeaturedMessages: defineTable({
    communityId: v.id("communities"),
    messageId: v.id("communityChatMessages"),
    featuredByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_message", ["messageId"]),

  communityTypingPresence: defineTable({
    communityId: v.id("communities"),
    // Optional only for rolling compatibility with pre-channel leases.
    channelId: v.optional(v.id("communityChannels")),
    userId: v.id("users"),
    // Thread scope: present when typing inside a thread, absent for channel-level typing.
    rootId: v.optional(v.id("communityInteractionRoots")),
    displayUntil: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_user", ["userId"])
    .index("by_community_user", ["communityId", "userId"])
    .index("by_community_displayUntil", ["communityId", "displayUntil"])
    .index("by_community_channel_user", ["communityId", "channelId", "userId"])
    .index("by_community_channel_displayUntil", ["communityId", "channelId", "displayUntil"])
    .index("by_channel_user", ["channelId", "userId"])
    .index("by_channel_displayUntil", ["channelId", "displayUntil"]),

  communityInteractionRoots: defineTable({
    communityId: v.id("communities"),
    // Private member-agent dock roots legitimately remain unchanneled. Every
    // community/public interaction root is channel-addressable.
    channelId: v.optional(v.id("communityChannels")),
    actorType: v.union(
      v.literal("human"),
      v.literal("personal_agent"), // retired actor type on old chat posts; rewritten in the table-drop release
      v.literal("community_agent"),
      v.literal("system"),
    ),
    actorUserId: v.optional(v.id("users")),
    actorAgentKey: v.optional(v.string()),
    kind: v.union(
      v.literal("discussion"),
      v.literal("announcement"),
      v.literal("question"),
      v.literal("resource_share"),
      v.literal("agent_signal"),
    ),
    status: v.union(v.literal("live"), v.literal("hidden"), v.literal("deleted")),
    visibilityScope: v.union(
      v.literal("private"),
      v.literal("admin"),
      v.literal("community"),
      v.literal("public"),
    ),
    title: v.optional(v.string()),
    contentSummary: v.string(),
    replyCount: v.number(),
    reactionSummary: v.array(v.object({
      emoji: v.string(),
      count: v.number(),
    })),
    idempotencyKey: v.string(),
    lastReplyAt: v.optional(v.number()),
    // Set when the post carries a poll or a shared Form (communityPostCards.ts).
    cardKind: v.optional(v.union(v.literal("poll"), v.literal("form"))),
    composerPayloadHash: v.optional(v.string()),
    lockedAt: v.optional(v.number()),
    hiddenAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    editedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_channel_updatedAt", ["channelId", "updatedAt"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_community_updatedAt", ["communityId", "updatedAt"])
    .index("by_community_status_createdAt", ["communityId", "status", "createdAt"])
    .index("by_community_kind_status_createdAt", ["communityId", "kind", "status", "createdAt"])
    .index("by_community_channel_visibility_status_createdAt", [
      "communityId",
      "channelId",
      "visibilityScope",
      "status",
      "createdAt",
    ])
    .index("by_community_channel_kind_visibility_status_createdAt", [
      "communityId",
      "channelId",
      "kind",
      "visibilityScope",
      "status",
      "createdAt",
    ])
    .index("by_community_idempotencyKey", ["communityId", "idempotencyKey"])
    .index("by_community_actorUser_createdAt", ["communityId", "actorUserId", "createdAt"])
    .index("by_actorUser", ["actorUserId"])
    .index("by_actorAgent", ["actorAgentKey"]),

  communityInteractionReplies: defineTable({
    communityId: v.id("communities"),
    // Derived from root.channelId for indexed activity. Replies never choose
    // placement independently from their root.
    channelId: v.optional(v.id("communityChannels")),
    rootId: v.id("communityInteractionRoots"),
    seq: v.number(),
    actorType: v.union(
      v.literal("human"),
      v.literal("personal_agent"), // retired actor type on old chat replies; rewritten in the table-drop release
      v.literal("community_agent"),
      v.literal("system"),
    ),
    actorUserId: v.optional(v.id("users")),
    actorAgentKey: v.optional(v.string()),
    targetReplyId: v.optional(v.id("communityInteractionReplies")),
    status: v.union(v.literal("live"), v.literal("hidden"), v.literal("deleted")),
    visibilityScope: v.union(
      v.literal("private"),
      v.literal("admin"),
      v.literal("community"),
      v.literal("public"),
    ),
    contentSummary: v.string(),
    reactionSummary: v.array(v.object({
      emoji: v.string(),
      count: v.number(),
    })),
    idempotencyKey: v.string(),
    composerPayloadHash: v.optional(v.string()),
    hiddenAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    editedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_root_seq", ["rootId", "seq"])
    .index("by_root_createdAt", ["rootId", "createdAt"])
    .index("by_root_status_createdAt", ["rootId", "status", "createdAt"])
    .index("by_channel_updatedAt", ["channelId", "updatedAt"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_community_status_createdAt", ["communityId", "status", "createdAt"])
    .index("by_community_channel_visibility_status_createdAt", [
      "communityId",
      "channelId",
      "visibilityScope",
      "status",
      "createdAt",
    ])
    .index("by_community_idempotencyKey", ["communityId", "idempotencyKey"])
    .index("by_community_actorUser_createdAt", ["communityId", "actorUserId", "createdAt"])
    .index("by_targetReply", ["targetReplyId"])
    .index("by_actorUser", ["actorUserId"])
    .index("by_actorAgent", ["actorAgentKey"]),

  communityInteractionAttachments: defineTable({
    legacyUpload: v.optional(v.boolean()),
    legacyUploadToken: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.optional(v.id("communityChannels")),
    uploadRootId: v.optional(v.id("communityInteractionRoots")),
    uploadMessageKey: v.optional(v.string()),
    uploadExpiresAt: v.optional(v.number()),
    rootId: v.optional(v.id("communityInteractionRoots")),
    replyId: v.optional(v.id("communityInteractionReplies")),
    attachmentKind: v.union(v.literal("image"), v.literal("video"), v.literal("file")),
    status: v.union(
      v.literal("pending"),
      v.literal("uploaded"),
      v.literal("processing"),
      v.literal("failed"),
      v.literal("deleted"),
    ),
    name: v.string(),
    mimeType: v.optional(v.string()),
    sizeBytes: v.number(),
    storageId: v.optional(v.id("_storage")),
    externalUrl: v.optional(v.string()),
    contentHash: v.optional(v.string()),
    createdByActorType: v.union(
      v.literal("human"),
      v.literal("community_agent"),
      v.literal("system"),
    ),
    createdByUserId: v.optional(v.id("users")),
    createdByAgentKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_root", ["rootId"])
    .index("by_reply", ["replyId"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_community_status_createdAt", ["communityId", "status", "createdAt"])
    .index("by_uploader_status", ["createdByUserId", "status"])
    .index("by_storage", ["storageId"])
    .index("by_contentHash", ["contentHash"]),

  communityInteractionEmbeds: defineTable({
    communityId: v.id("communities"),
    rootId: v.optional(v.id("communityInteractionRoots")),
    replyId: v.optional(v.id("communityInteractionReplies")),
    embedKind: v.union(v.literal("link"), v.literal("workspace_ref")),
    status: v.union(
      v.literal("pending"),
      v.literal("ready"),
      v.literal("failed"),
      v.literal("unavailable"),
      v.literal("redacted"),
    ),
    visibilityScope: v.union(
      v.literal("private"),
      v.literal("admin"),
      v.literal("community"),
      v.literal("public"),
    ),
    sourceUrl: v.optional(v.string()),
    normalizedSourceUrl: v.optional(v.string()),
    workspaceRefKind: v.optional(
      v.union(
        v.literal("thread"),
        v.literal("project"),
        v.literal("file"),
        v.literal("artifact"),
        v.literal("run"),
        v.literal("resource"),
      ),
    ),
    workspaceRefId: v.optional(v.string()),
    previewKind: v.optional(
      v.union(v.literal("video"), v.literal("social_post"), v.literal("link")),
    ),
    authorName: v.optional(v.string()),
    authorHandle: v.optional(v.string()),
    authorAvatarUrl: v.optional(v.string()),
    authorVerified: v.optional(v.boolean()),
    provider: v.optional(v.string()),
    providerPostId: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    postContext: v.optional(
      v.union(v.literal("post"), v.literal("reply"), v.literal("quote")),
    ),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    imageAlt: v.optional(v.string()),
    videoUrl: v.optional(v.string()),
    resolverVersion: v.optional(v.number()),
    fetchedAt: v.optional(v.number()),
    nextRefreshAt: v.optional(v.number()),
    refreshFailureCount: v.optional(v.number()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_root", ["rootId"])
    .index("by_reply", ["replyId"])
    .index("by_community_status_createdAt", ["communityId", "status", "createdAt"])
    .index("by_status_nextRefreshAt", ["status", "nextRefreshAt"])
    .index("by_provider_status_nextRefreshAt", ["provider", "status", "nextRefreshAt"])
    .index("by_community_normalizedSourceUrl", ["communityId", "normalizedSourceUrl"])
    .index("by_community_workspaceRef", ["communityId", "workspaceRefKind", "workspaceRefId"]),

  communityInteractionContentBlocks: defineTable({
    communityId: v.id("communities"),
    rootId: v.optional(v.id("communityInteractionRoots")),
    replyId: v.optional(v.id("communityInteractionReplies")),
    blockOrder: v.number(),
    blockType: v.union(
      v.literal("markdown_text"),
      v.literal("image"),
      v.literal("video"),
      v.literal("file"),
      v.literal("link"),
      v.literal("workspace_ref"),
      v.literal("mention"),
    ),
    text: v.optional(v.string()),
    url: v.optional(v.string()),
    attachmentId: v.optional(v.id("communityInteractionAttachments")),
    embedId: v.optional(v.id("communityInteractionEmbeds")),
    workspaceRefKind: v.optional(
      v.union(
        v.literal("thread"),
        v.literal("project"),
        v.literal("file"),
        v.literal("artifact"),
        v.literal("run"),
        v.literal("resource"),
      ),
    ),
    workspaceRefId: v.optional(v.string()),
    mentionKind: v.optional(
      v.union(
        v.literal("user"),
        v.literal("community_agent"),
        v.literal("role"),
      ),
    ),
    mentionedUserId: v.optional(v.id("users")),
    mentionedAgentKey: v.optional(v.string()),
    mentionedRoleKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_root_order", ["rootId", "blockOrder"])
    .index("by_reply_order", ["replyId", "blockOrder"])
    .index("by_attachment", ["attachmentId"])
    .index("by_embed", ["embedId"])
    .index("by_community_createdAt", ["communityId", "createdAt"]),

  communityInteractionMentions: defineTable({
    communityId: v.id("communities"),
    // Target-derived from the root. Optional only for private dock and
    // rolling-compatible pre-channel mention rows.
    channelId: v.optional(v.id("communityChannels")),
    rootId: v.optional(v.id("communityInteractionRoots")),
    replyId: v.optional(v.id("communityInteractionReplies")),
    sourceBroadcastId: v.optional(v.id("communityMentionBroadcasts")),
    mentionKind: v.union(
      v.literal("user"),
      v.literal("community_agent"),
      v.literal("role"),
    ),
    mentionedUserId: v.optional(v.id("users")),
    mentionedAgentKey: v.optional(v.string()),
    mentionedRoleKey: v.optional(v.string()),
    // Absent means email-eligible for historical/direct mention rows.
    emailEligible: v.optional(v.boolean()),
    notifyState: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("suppressed"),
      v.literal("read"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_root", ["rootId"])
    .index("by_reply", ["replyId"])
    .index("by_root_mentionedUser", ["rootId", "mentionedUserId"])
    .index("by_reply_mentionedUser", ["replyId", "mentionedUserId"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_mentionedUser_createdAt", ["mentionedUserId", "createdAt"])
    .index("by_mentionedUser_community_createdAt", ["mentionedUserId", "communityId", "createdAt"])
    .index("by_mentionedUser_community_notifyState_createdAt", ["mentionedUserId", "communityId", "notifyState", "createdAt"])
    .index("by_mentionedUser_community_channel_notifyState_createdAt", [
      "mentionedUserId",
      "communityId",
      "channelId",
      "notifyState",
      "createdAt",
    ])
    .index("by_notifyState_createdAt", ["notifyState", "createdAt"])
    .index("by_mentionKind_notifyState_createdAt", ["mentionKind", "notifyState", "createdAt"])
    .index("by_mentionedAgent_createdAt", ["mentionedAgentKey", "createdAt"])
    .index("by_mentionedRole_createdAt", ["mentionedRoleKey", "createdAt"])
    .index("by_sourceBroadcast", ["sourceBroadcastId"])
    .index("by_sourceBroadcast_user", ["sourceBroadcastId", "mentionedUserId"]),

  communityMentionBroadcasts: defineTable({
    communityId: v.id("communities"),
    // Derived from the source root; optional for pre-channel broadcasts.
    channelId: v.optional(v.id("communityChannels")),
    roleKey: v.string(),
    actorUserId: v.id("users"),
    sourceRootId: v.optional(v.id("communityInteractionRoots")),
    sourceReplyId: v.optional(v.id("communityInteractionReplies")),
    sourceMentionId: v.id("communityInteractionMentions"),
    sourceCreatedAt: v.number(),
    emailMode: v.union(
      v.literal("in_app_only"),
      v.literal("in_app_and_email"),
    ),
    status: v.union(
      v.literal("queued"),
      v.literal("draining"),
      v.literal("complete"),
      v.literal("canceled"),
      v.literal("error"),
    ),
    ownerProcessed: v.optional(v.boolean()),
    membershipCursor: v.optional(v.string()),
    cleanupState: v.optional(v.union(
      v.literal("queued"),
      v.literal("complete"),
    )),
    cleanupCursor: v.optional(v.string()),
    cleanupCount: v.optional(v.number()),
    cleanupCompletedAt: v.optional(v.number()),
    processedCount: v.number(),
    recipientCount: v.number(),
    skippedCount: v.number(),
    errorCode: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    canceledAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_status_updatedAt", ["status", "updatedAt"])
    .index("by_sourceMention", ["sourceMentionId"])
    .index("by_sourceRoot", ["sourceRootId"])
    .index("by_sourceReply", ["sourceReplyId"])
    .index("by_cleanupState_updatedAt", ["cleanupState", "updatedAt"])
    .index("by_community_role_emailMode_createdAt", ["communityId", "roleKey", "emailMode", "createdAt"]),

  communityAgentServeRequests: defineTable({
    communityId: v.id("communities"),
    agentKey: v.string(),
    // Rolling-compatible: historical requests were keyed only by mention.
    sourceMentionId: v.optional(v.id("communityInteractionMentions")),
    invocationKey: v.optional(v.string()),
    triggerKind: v.optional(v.union(
      v.literal("mention"),
      v.literal("direct_reply"),
      v.literal("workflow"),
    )),
    sourceRootId: v.optional(v.id("communityInteractionRoots")),
    sourceReplyId: v.optional(v.id("communityInteractionReplies")),
    requesterUserId: v.optional(v.id("users")),
    sponsorUserId: v.optional(v.id("users")),
    workflowRunId: v.optional(v.id("communityMemberWorkflowRuns")),
    workflowActionKey: v.optional(v.string()),
    workflowPromptSnapshot: v.optional(v.string()),
    workflowPreviousRunId: v.optional(v.id("communityMemberWorkflowRuns")),
    workflowTimerId: v.optional(v.id("communityMemberWorkflowTimers")),
    workflowFormRequestId: v.optional(v.id("communityFormRequests")),
    workflowAssessment: v.optional(v.boolean()),
    workflowCompletionReview: v.optional(v.boolean()),
    serviceChannelId: v.optional(v.id("communityChannels")),
    serviceChannelRevision: v.optional(v.number()),
    status: v.union(
      v.literal("queued"),
      v.literal("skipped"),
      v.literal("running"),
      v.literal("responded"),
      v.literal("error"),
    ),
    intakeReason: v.union(
      v.literal("accepted"),
      v.literal("duplicate"),
      v.literal("invalid_agent"),
      v.literal("source_missing"),
      v.literal("source_not_live"),
      v.literal("source_not_human"),
      v.literal("requester_missing"),
      v.literal("requester_access_missing"),
      v.literal("agent_disabled"),
      v.literal("founder_plan_required"),
      v.literal("founder_subscription_inactive"),
      v.literal("founder_subscription_ambiguous"),
      v.literal("founder_subscription_owner_mismatch"),
    ),
    sourceVisibilityScope: v.optional(
      v.union(
        v.literal("private"),
        v.literal("admin"),
        v.literal("community"),
        v.literal("public"),
      ),
    ),
    responseVisibilityScope: v.optional(
      v.union(
        v.literal("private"),
        v.literal("admin"),
        v.literal("community"),
        v.literal("public"),
      ),
    ),
    responseRootId: v.optional(v.id("communityInteractionRoots")),
    responseReplyId: v.optional(v.id("communityInteractionReplies")),
    attempt: v.optional(v.number()),
    runId: v.optional(v.id("communityAgentRuns")),
    sourceTraceId: v.optional(v.id("communitySourceTraces")),
    skipReason: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    respondedAt: v.optional(v.number()),
  })
    .index("by_sourceMention", ["sourceMentionId"])
    .index("by_community_invocationKey", ["communityId", "invocationKey"])
    .index("by_status_createdAt", ["status", "createdAt"])
    .index("by_status_leaseExpiresAt", ["status", "leaseExpiresAt"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_sourceRoot_createdAt", ["sourceRootId", "createdAt"])
    .index("by_sourceReply", ["sourceReplyId"])
    .index("by_requester_createdAt", ["requesterUserId", "createdAt"])
    .index("by_requester_community_createdAt", ["requesterUserId", "communityId", "createdAt"]),

  // A post's card (shared/communityPostCards.ts): a poll or a shared Form.
  communityInteractionPolls: defineTable({
    communityId: v.id("communities"),
    rootId: v.id("communityInteractionRoots"),
    question: v.string(),
    options: v.array(v.object({ key: v.string(), label: v.string() })),
    multiple: v.boolean(),
    createdByUserId: v.id("users"),
    closedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_root", ["rootId"]),

  communityInteractionPollVotes: defineTable({
    communityId: v.id("communities"),
    pollId: v.id("communityInteractionPolls"),
    userId: v.id("users"),
    optionKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_poll", ["pollId"])
    .index("by_poll_user", ["pollId", "userId"])
    .index("by_user", ["userId"]),

  communityInteractionFormShares: defineTable({
    communityId: v.id("communities"),
    rootId: v.id("communityInteractionRoots"),
    formId: v.id("communityForms"),
    versionId: v.id("communityFormVersions"),
    note: v.string(),
    answersVisibleTo: v.union(v.literal("everyone"), v.literal("builders")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  }).index("by_root", ["rootId"]),

  communityInteractionFormResponses: defineTable({
    communityId: v.id("communities"),
    shareId: v.id("communityInteractionFormShares"),
    userId: v.id("users"),
    status: v.union(v.literal("draft"), v.literal("submitted")),
    answers: v.record(v.string(), v.union(v.string(), v.array(v.string()))),
    revision: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    submittedAt: v.optional(v.number()),
  })
    .index("by_share", ["shareId"])
    .index("by_share_user", ["shareId", "userId"])
    .index("by_user", ["userId"]),

  communityInteractionReactions: defineTable({
    communityId: v.id("communities"),
    targetType: v.union(v.literal("root"), v.literal("reply")),
    rootId: v.optional(v.id("communityInteractionRoots")),
    replyId: v.optional(v.id("communityInteractionReplies")),
    actorType: v.union(
      v.literal("human"),
      v.literal("community_agent"),
      v.literal("system"),
    ),
    actorKey: v.string(),
    actorUserId: v.optional(v.id("users")),
    actorAgentKey: v.optional(v.string()),
    emoji: v.string(),
    createdAt: v.number(),
  })
    .index("by_root", ["rootId"])
    .index("by_reply", ["replyId"])
    .index("by_root_actor_emoji", ["rootId", "actorKey", "emoji"])
    .index("by_reply_actor_emoji", ["replyId", "actorKey", "emoji"])
    .index("by_actor", ["actorKey"])
    .index("by_community_createdAt", ["communityId", "createdAt"]),

  communityInteractionModerationEvents: defineTable({
    communityId: v.id("communities"),
    targetType: v.union(v.literal("root"), v.literal("reply")),
    rootId: v.optional(v.id("communityInteractionRoots")),
    replyId: v.optional(v.id("communityInteractionReplies")),
    eventType: v.union(
      v.literal("edit"),
      v.literal("hide"),
      v.literal("unhide"),
      v.literal("tombstone"),
      v.literal("lock"),
      v.literal("unlock"),
      v.literal("pin"),
      v.literal("unpin"),
      v.literal("privacy_purge_requested"),
      v.literal("privacy_purged"),
    ),
    actorType: v.union(
      v.literal("human"),
      v.literal("community_agent"),
      v.literal("system"),
    ),
    actorUserId: v.optional(v.id("users")),
    actorAgentKey: v.optional(v.string()),
    previousStatus: v.optional(v.union(v.literal("live"), v.literal("hidden"), v.literal("deleted"))),
    nextStatus: v.optional(v.union(v.literal("live"), v.literal("hidden"), v.literal("deleted"))),
    reason: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_root_createdAt", ["rootId", "createdAt"])
    .index("by_reply_createdAt", ["replyId", "createdAt"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_actorUser_createdAt", ["actorUserId", "createdAt"])
    .index("by_actorAgent_createdAt", ["actorAgentKey", "createdAt"])
    .index("by_community_idempotencyKey", ["communityId", "idempotencyKey"]),

  communityInteractionLegacyChatLinks: defineTable({
    communityId: v.id("communities"),
    threadId: v.id("communityChatThreads"),
    messageId: v.id("communityChatMessages"),
    targetMessageId: v.optional(v.id("communityChatMessages")),
    linkKind: v.union(v.literal("root"), v.literal("reply")),
    rootId: v.optional(v.id("communityInteractionRoots")),
    replyId: v.optional(v.id("communityInteractionReplies")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_message", ["messageId"])
    .index("by_thread_message", ["threadId", "messageId"])
    .index("by_root", ["rootId"])
    .index("by_reply", ["replyId"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_community_linkKind_createdAt", ["communityId", "linkKind", "createdAt"]),

  dmConversations: defineTable({
    kind: v.literal("direct"),
    canonicalKey: v.string(),
    createdByUserId: v.id("users"),
    createdFromCommunityId: v.id("communities"),
    lastSeq: v.number(),
    lastMessageAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_canonicalKey", ["canonicalKey"])
    .index("by_createdBy", ["createdByUserId"])
    .index("by_createdFromCommunity", ["createdFromCommunityId"])
    .index("by_updatedAt", ["updatedAt"]),

  dmParticipants: defineTable({
    conversationId: v.id("dmConversations"),
    participantType: v.union(v.literal("user"), v.literal("agent")),
    userId: v.optional(v.id("users")),
    agentKind: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("left")),
    lastReadSeq: v.number(),
    lastActivityAt: v.optional(v.number()),
    // Viewer-side mute: suppresses badges and notifications, never delivery.
    mutedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_conversation_user", ["conversationId", "userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_status_lastActivityAt", ["userId", "status", "lastActivityAt"]),

  dmMessages: defineTable({
    conversationId: v.id("dmConversations"),
    seq: v.number(),
    senderType: v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    senderUserId: v.optional(v.id("users")),
    senderAgentParticipantId: v.optional(v.id("dmParticipants")),
    // Client-generated idempotency key; retries of a committed send return the
    // original message instead of inserting a duplicate.
    clientMessageId: v.optional(v.string()),
    contentJson: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_conversation_seq", ["conversationId", "seq"])
    .index("by_conversation_clientMessageId", ["conversationId", "clientMessageId"])
    .index("by_senderUser", ["senderUserId"]),

  dmBlocks: defineTable({
    blockerUserId: v.id("users"),
    blockedUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_blocker_blocked", ["blockerUserId", "blockedUserId"])
    .index("by_blocked_blocker", ["blockedUserId", "blockerUserId"]),

  dmRateCounters: defineTable({
    userId: v.id("users"),
    kind: v.union(v.literal("message"), v.literal("conversation")),
    windowStartMs: v.number(),
    count: v.number(),
    updatedAt: v.number(),
  }).index("by_user_kind", ["userId", "kind"]),

  dmTypingPresence: defineTable({
    conversationId: v.id("dmConversations"),
    userId: v.id("users"),
    displayUntil: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_user", ["userId"])
    .index("by_conversation_user", ["conversationId", "userId"])
    .index("by_conversation_displayUntil", ["conversationId", "displayUntil"]),

  communityAgentConfigs: defineTable({
    communityId: v.id("communities"),
    landingJson: v.optional(v.any()),
    systemPrompt: v.string(),
    // Owner-set display name for the agent's taggable identity; absent means
    // the community's own name.
    agentDisplayName: v.optional(v.string()),
    // Owner-set photo for the agent (an upload, or an https image). Absent
    // means it wears the community's icon.
    agentAvatarStorageId: v.optional(v.id("_storage")),
    agentAvatarUrl: v.optional(v.string()),
    // Owner off-switch for the memory agent. Absent means enabled; inference
    // admission is resolved through the canonical managed-funding policy.
    agentEnabled: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_updatedAt", ["communityId", "updatedAt"]),

  communityAgentRuns: defineTable({
    communityId: v.id("communities"),
    agentKey: v.string(),
    // Current runs use `steward`; other values are historical compatibility.
    role: v.optional(v.string()),
    triggerType: v.union(
      v.literal("manual_internal"),
      v.literal("heartbeat"),
      v.literal("event"),
    ),
    heartbeatId: v.optional(v.string()),
    sponsorUserId: v.id("users"),
    modelId: v.optional(v.string()),
    status: v.union(
      v.literal("skipped"),
      v.literal("running"),
      v.literal("ok"),
      v.literal("error"),
    ),
    wakeReason: v.optional(v.string()),
    wakeEvidence: v.optional(v.object({
      reason: v.string(),
      pendingTotal: v.number(),
      pendingTraceTotal: v.optional(v.number()),
      pendingContinuation: v.optional(v.number()),
      pendingStandard: v.number(),
      pendingStrong: v.number(),
      pendingCritical: v.number(),
      oldestPendingAt: v.optional(v.string()),
      hasMorePending: v.boolean(),
      countsAreLowerBound: v.boolean(),
      compilerDigestId: v.optional(v.string()),
      compilerDigestVersionKey: v.optional(v.string()),
      compilerWorkItemCount: v.optional(v.number()),
    })),
    stopReason: v.optional(v.string()),
    toolStepCount: v.number(),
    // Legacy approval-loop fields remain optional until historical rows are
    // cleared. New runs write only appliedChangeRequestIds.
    candidateProposalIds: v.optional(v.array(v.string())),
    acceptedChangeRequestIds: v.optional(v.array(v.string())),
    rejectedChangeRequestIds: v.optional(v.array(v.string())),
    appliedChangeRequestIds: v.optional(v.array(v.string())),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_community_status_createdAt", ["communityId", "status", "createdAt"])
    .index("by_community_role_triggerType_createdAt", [
      "communityId",
      "role",
      "triggerType",
      "createdAt",
    ])
    .index("by_sponsor_createdAt", ["sponsorUserId", "createdAt"]),

  // Per-run event log for community agent runs: prompts, reasoning summaries,
  // tool calls/results, and the final outcome, in sequence. This is the audit
  // trail that makes a headless steward run reconstructable after the fact.
  communityAgentRunEvents: defineTable({
    communityId: v.id("communities"),
    runId: v.string(),
    seq: v.number(),
    kind: v.union(
      v.literal("context_snapshot"),
      v.literal("system_prompt"),
      v.literal("wake_context"),
      v.literal("reasoning"),
      v.literal("assistant"),
      v.literal("tool_call"),
      v.literal("tool_result"),
      v.literal("input_budget"),
      v.literal("context_projection"),
      v.literal("final"),
      v.literal("error"),
    ),
    toolName: v.optional(v.string()),
    status: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    content: v.string(),
    createdAt: v.number(),
  })
    .index("by_run_seq", ["runId", "seq"])
    .index("by_community_createdAt", ["communityId", "createdAt"]),

  // Community front ends: a community's own domain (exact origin). One domain
  // belongs to one community; deleting it ends sign-in there.
  communityDomains: defineTable({
    communityId: v.id("communities"),
    origin: v.string(),
    createdAt: v.number(),
    // "private": a site's private twin (<slug>--me<suffix>.<sites domain>),
    // where members' own pages live; its sessions may read personal data.
    // Absent: a site origin.
    kind: v.optional(v.union(v.literal("site"), v.literal("private"))),
  }).index("by_origin", ["origin"])
    .index("by_community", ["communityId"]),

  // Each published site deploy (polynet deploy): who put which files live where.
  communitySiteDeploys: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    hostname: v.string(),
    fileCount: v.number(),
    totalBytes: v.number(),
    createdAt: v.number(),
  }).index("by_community_createdAt", ["communityId", "createdAt"]),

  // A member's session on a community's domain, held by the community edge in
  // an HttpOnly cookie. Only the SHA-256 of the token is stored.
  communityAppSessions: defineTable({
    tokenHash: v.string(),
    domainId: v.id("communityDomains"),
    communityId: v.id("communities"),
    userId: v.id("users"),
    expiresAt: v.number(),
    // Hash of the watch-only token the edge derives from the session token.
    watchTokenHash: v.optional(v.string()),
    // Recorded when the session is minted: "private" only on a private twin's
    // origin. Personal endpoints refuse every other session. Absent: "site".
    kind: v.optional(v.union(v.literal("site"), v.literal("private"))),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_watchTokenHash", ["watchTokenHash"])
    .index("by_domain_user_expiresAt", ["domainId", "userId", "expiresAt"]),

  // One-time sign-in codes from Polynet's login to a community's edge, deleted
  // when presented. Only hashes of the code and state are stored.
  communityAppHandoffs: defineTable({
    codeHash: v.string(),
    stateHash: v.string(),
    domainId: v.id("communityDomains"),
    userId: v.id("users"),
    expiresAt: v.number(),
  })
    .index("by_codeHash", ["codeHash"])
    .index("by_user_expiresAt", ["userId", "expiresAt"]),

  skillPackages: defineTable({
    ownerUserId: v.id("users"),
    catalogSkillId: v.optional(v.string()),
    name: v.string(),
    mentionToken: v.optional(v.string()),
    description: v.optional(v.string()),
    instructionsMd: v.string(),
    activeRevisionId: v.optional(v.id("skillPackageRevisions")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerUserId"])
    .index("by_owner_mentionToken", ["ownerUserId", "mentionToken"])
    .index("by_owner_catalogSkillId", ["ownerUserId", "catalogSkillId"]),

  skillPackageRevisions: defineTable({
    skillPackageId: v.id("skillPackages"),
    revisionNumber: v.number(),
    instructionsMd: v.string(),
    createdAt: v.number(),
    createdByUserId: v.id("users"),
  })
    .index("by_skill", ["skillPackageId"])
    .index("by_skill_revisionNumber", ["skillPackageId", "revisionNumber"]),

  userPlatformSkillInstalls: defineTable({
    userId: v.id("users"),
    skillPackageId: v.id("skillPackages"),
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_skill", ["userId", "skillPackageId"])
    .index("by_skill", ["skillPackageId"]),

  communitySkillAttachments: defineTable({
    communityId: v.id("communities"),
    skillPackageId: v.id("skillPackages"),
    attachedByUserId: v.id("users"),
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_skill", ["communityId", "skillPackageId"])
    .index("by_skill", ["skillPackageId"]),

  communityAiFeedPosts: defineTable({
    communityId: v.id("communities"),
    authorType: v.literal("agent"),
    authorUserId: v.optional(v.id("users")),
    agentKey: v.optional(v.string()),
    agentKind: v.optional(
      v.union(v.literal("personal_agent"), v.literal("community_agent")),
    ),
    authorLabel: v.string(),
    type: v.union(v.literal("observation"), v.literal("recommendation"), v.literal("action")),
    title: v.optional(v.string()),
    body: v.string(),
    evidence: v.optional(v.array(v.string())),
    whyNow: v.optional(v.string()),
    status: v.union(v.literal("live"), v.literal("hidden")),
    score: v.number(),
    goodCount: v.number(),
    lowSignalCount: v.number(),
    noveltyKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    hiddenAt: v.optional(v.number()),
  })
    .index("by_community", ["communityId"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_community_status_createdAt", ["communityId", "status", "createdAt"])
    .index("by_community_status_score_createdAt", ["communityId", "status", "score", "createdAt"])
    .index("by_status_hiddenAt", ["status", "hiddenAt"])
    .index("by_community_noveltyKey", ["communityId", "noveltyKey"]),

  communityAiFeedReactions: defineTable({
    communityId: v.id("communities"),
    postId: v.id("communityAiFeedPosts"),
    actorType: v.optional(v.union(v.literal("human"), v.literal("agent"))),
    actorKey: v.string(),
    actorUserId: v.optional(v.id("users")),
    actorAgentKey: v.optional(v.string()),
    reactionType: v.union(v.literal("good"), v.literal("low_signal")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_post", ["postId"])
    .index("by_post_actorKey", ["postId", "actorKey"])
    .index("by_community", ["communityId"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_actorUser", ["actorUserId"])
    .index("by_actorKey", ["actorKey"]),

  communityMemberSettings: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    muted: v.boolean(),
    mutedUntil: v.optional(v.number()),
    chatLastSeenSeq: v.optional(v.number()),
    // Timestamp boundary for the canonical chat "new messages" divider (roots order by created_at).
    chatLastSeenAt: v.optional(v.number()),
    aiFeedLastSeenAt: v.optional(v.number()),
    // Latest mention-of-me the user has seen in this community (the mention
    // ping clears when they open the community chat).
    mentionsLastSeenAt: v.optional(v.number()),
    resourcesLastSeenAt: v.optional(v.number()),
    eventsLastSeenAt: v.optional(v.number()),
    // Automation emails (Workflows → Send an email): the member's unsubscribe
    // link carries this token, and opting out stops this community's ones.
    workflowEmailToken: v.optional(v.string()),
    workflowEmailsOptedOutAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_community", ["communityId"])
    .index("by_community_user", ["communityId", "userId"])
    .index("by_workflowEmailToken", ["workflowEmailToken"]),

  // One durable, monotonic position per member and community chat stream.
  // The requested position is always re-authorized and clamped to the
  // server-visible chat head before this projection advances.
  communityReadCursors: defineTable({
    communityId: v.id("communities"),
    // Optional only while legacy community-wide chat cursors are upgraded in
    // place. New cursor writes always bind a channel.
    channelId: v.optional(v.id("communityChannels")),
    userId: v.id("users"),
    streamKind: v.literal("chat"),
    seenThroughAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_community", ["communityId"])
    .index("by_community_user", ["communityId", "userId"])
    .index("by_community_user_stream", ["communityId", "userId", "streamKind"])
    .index("by_community_channel_user_stream", ["communityId", "channelId", "userId", "streamKind"]),

  communityResources: defineTable({
    communityId: v.id("communities"),
    moduleId: v.optional(v.id("communityResourceModules")),
    createdByUserId: v.id("users"),
    type: v.string(),
    role: v.optional(v.union(v.literal("page"), v.literal("source"))),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("review"),
        v.literal("published"),
        v.literal("processing"),
        v.literal("failed"),
      ),
    ),
    sourceResourceId: v.optional(v.id("communityResources")),
    title: v.string(),
    bodyMd: v.optional(v.string()),
    bodyChars: v.optional(v.number()),
    bodyHash: v.optional(v.string()),
    bodyMigratedAt: v.optional(v.number()),
    url: v.optional(v.string()),
    fileKey: v.optional(v.string()),
    sourceIngestionStatus: v.optional(
      v.union(
        v.literal("not_required"),
        v.literal("queued"),
        v.literal("processing"),
        v.literal("ready"),
        v.literal("failed"),
      ),
    ),
    sourceIngestionKind: v.optional(
      v.union(
        v.literal("manual"),
        v.literal("url"),
        v.literal("file"),
        v.literal("google_drive"),
        v.literal("github"),
      ),
    ),
    sourceIngestionError: v.optional(v.string()),
    sourceIngestionAttemptedAt: v.optional(v.number()),
    sourceIngestedAt: v.optional(v.number()),
    sourceIngestionLeaseId: v.optional(v.string()),
    sourceIngestionLeaseExpiresAt: v.optional(v.number()),
    sourceIngestionAttempt: v.optional(v.number()),
    sourceOriginalFilename: v.optional(v.string()),
    sourceOriginalMimeType: v.optional(v.string()),
    sourceOriginalBytes: v.optional(v.number()),
    sourceExternalProvider: v.optional(v.union(v.literal("google_drive"), v.literal("github"))),
    sourceExternalConnectionUserId: v.optional(v.id("users")),
    sourceExternalId: v.optional(v.string()),
    sourceExternalName: v.optional(v.string()),
    sourceExternalUrl: v.optional(v.string()),
    sourceExternalMimeType: v.optional(v.string()),
    sourceExternalModifiedAt: v.optional(v.number()),
    pinned: v.boolean(),
    sortOrder: v.optional(v.number()),
    // Board, library and wizard presentation (shared/communityLessonContract.ts).
    lesson: v.optional(communityLessonFieldsValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_module", ["communityId", "moduleId"])
    .index("by_community_module_sortOrder", ["communityId", "moduleId", "sortOrder"])
    .index("by_community_role_status", ["communityId", "role", "status"])
    .index("by_community_status_createdAt", ["communityId", "status", "createdAt"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_community_source_external", ["communityId", "sourceExternalProvider", "sourceExternalId"])
    .index("by_community_role_source_provider_status_updatedAt", [
      "communityId",
      "role",
      "sourceExternalProvider",
      "sourceIngestionStatus",
      "updatedAt",
    ])
    .index("by_createdBy", ["createdByUserId"]),

  // A member's own progress through lesson pages. Locks are computed on read
  // from lesson gates; only completion state is stored.
  // The owner's own fields about their clients (shared/communityClients.ts).
  // Member facts stay in memberFacts; these are the founder's records.
  communityClientProperties: defineTable({
    communityId: v.id("communities"),
    key: v.string(),
    name: v.string(),
    type: v.union(
      v.literal("text"),
      v.literal("number"),
      v.literal("select"),
      v.literal("multi_select"),
      v.literal("date"),
      v.literal("checkbox"),
      v.literal("url"),
    ),
    options: v.array(v.string()),
    position: v.number(),
    /** Kept by Polynet, not the owner: "offer" lists the offers a member has. */
    system: v.optional(v.literal("offer")),
    archivedAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_key", ["communityId", "key"]),

  // The community's client rules: for now, how many days without progress count as stuck.
  communityClientSettings: defineTable({
    communityId: v.id("communities"),
    stuckDays: v.number(),
    // Set once the default views were copied in, so deleting them all doesn't bring them back.
    viewsSeededAt: v.optional(v.number()),
    updatedByUserId: v.id("users"),
    updatedAt: v.number(),
  }).index("by_community", ["communityId"]),

  // What the owner or their agent did about a client: property changes, flags,
  // notes, drafts and contact. Everything else on a client's timeline is read
  // from the record that owns it.
  communityClientEvents: defineTable({
    communityId: v.id("communities"),
    membershipId: v.id("communityMemberships"),
    type: v.union(
      v.literal("property_set"),
      // A form answer that couldn't fill its property (the property changed after publishing).
      v.literal("property_skipped"),
      v.literal("flagged"),
      v.literal("note"),
      v.literal("drafted"),
      v.literal("contacted"),
    ),
    actorUserId: v.id("users"),
    via: v.union(v.literal("web"), v.literal("agent"), v.literal("workflow"), v.literal("form")),
    propertyKey: v.optional(v.string()),
    value: v.optional(v.union(v.string(), v.number(), v.boolean(), v.array(v.string()), v.null())),
    body: v.optional(v.string()),
    channel: v.optional(v.union(v.literal("email"), v.literal("message"), v.literal("call"), v.literal("other"))),
    createdAt: v.number(),
  }).index("by_membership_createdAt", ["membershipId", "createdAt"])
    .index("by_membership_type_createdAt", ["membershipId", "type", "createdAt"]),

  // Saved views of the Members page (shared/communityClientViews.ts): columns,
  // filters and sort as data, edited by the owner and their agent alike.
  communityClientViews: defineTable({
    communityId: v.id("communities"),
    key: v.string(),
    name: v.string(),
    columns: v.array(v.string()),
    filters: v.array(v.object({ field: v.string(), op: v.string(),
      value: v.optional(v.union(v.string(), v.number(), v.array(v.string()))) })),
    match: v.union(v.literal("all"), v.literal("any")),
    sort: v.optional(v.object({ field: v.string(), direction: v.union(v.literal("asc"), v.literal("desc")) })),
    group: v.optional(v.string()),
    position: v.number(),
    updatedByUserId: v.id("users"),
    updatedVia: v.union(v.literal("web"), v.literal("agent")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_community_key", ["communityId", "key"]),

  // One bulk action on selected clients (set a property, message, flag, note).
  // It runs in small scheduled batches; this row is its progress and result.
  communityClientBulkActions: defineTable({
    communityId: v.id("communities"),
    actorUserId: v.id("users"),
    type: v.union(v.literal("set_property"), v.literal("message"), v.literal("flag"), v.literal("note")),
    propertyKey: v.optional(v.string()),
    value: v.optional(v.union(v.string(), v.number(), v.boolean(), v.array(v.string()), v.null())),
    body: v.optional(v.string()),
    membershipIds: v.array(v.id("communityMemberships")),
    cursor: v.number(),
    status: v.union(v.literal("running"), v.literal("done")),
    results: v.array(v.object({ membershipId: v.id("communityMemberships"), ok: v.boolean(), code: v.optional(v.string()) })),
    createdAt: v.number(),
    finishedAt: v.optional(v.number()),
  }).index("by_community_createdAt", ["communityId", "createdAt"]),

  // Test members: stand-in accounts an owner creates to go through their own
  // community as a new member (welcome page, forms, lessons, Workflows). Only
  // the owner who made one can act as it, only in its community, and ending it
  // deletes its membership and member data.
  communityTestMembers: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    authSubject: v.string(),
    ownerUserId: v.id("users"),
    ownerAuthSubject: v.string(),
    label: v.string(),
    number: v.number(),
    /** The stage the run started in, when not the first: no welcome flow then. */
    startMilestoneKey: v.optional(v.string()),
    /** Autoplay is playing until then: agent messages a Workflow sends are previewed, not sent. */
    autoplayUntil: v.optional(v.number()),
    /** What autoplay already did, so a step whose rules are still running isn't done twice. */
    autoplayDone: v.optional(v.array(v.string())),
    /** Autoplay's latest step, so the test member's own tab can go there and show it. */
    autoplayLast: v.optional(v.object({ at: v.number(), text: v.string(), path: v.optional(v.string()), target: v.optional(v.string()) })),
    /** On screen: the step the test member's own tab is doing now, and whether it saw and finished it. */
    autoplayPending: v.optional(v.object({
      id: v.string(), plan: v.any(), pace: v.number(), issuedAt: v.number(),
      seenAt: v.optional(v.number()), reportedAt: v.optional(v.number()), reportOk: v.optional(v.boolean()), reportDetail: v.optional(v.string()),
    })),
    createdAt: v.number(),
    endedAt: v.optional(v.number()),
  }).index("by_authSubject", ["authSubject"])
    .index("by_user", ["userId"])
    .index("by_community_createdAt", ["communityId", "createdAt"]),

  // Who sent a member to a community: the `ref` on the join link they arrived
  // by, kept first-touch. Affiliates and payouts build on this later.
  communityReferrals: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    ref: v.string(),
    capturedAt: v.number(),
  }).index("by_community_user", ["communityId", "userId"]),

  // A member's own widget answers (community site embeds), kept on the server so
  // they follow the member across devices. Member data: only the member reads it.
  communityEmbedValues: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
  }).index("by_community_user_key", ["communityId", "userId", "key"]),

  communityClientValues: defineTable({
    communityId: v.id("communities"),
    membershipId: v.id("communityMemberships"),
    propertyKey: v.string(),
    value: v.union(v.string(), v.number(), v.boolean(), v.array(v.string())),
    updatedByUserId: v.id("users"),
    updatedVia: v.union(v.literal("web"), v.literal("agent"), v.literal("workflow"), v.literal("form")),
    updatedAt: v.number(),
  })
    .index("by_membership", ["membershipId"])
    .index("by_membership_property", ["membershipId", "propertyKey"])
    .index("by_community_property", ["communityId", "propertyKey"]),

  // Access the owner gave by hand: free or comp time, with why and until when.
  // The membership stays the gate (accessSource manual_grant); this row is the
  // who, why and end date, and the end job reads it. One active row per member.
  communityAccessGrants: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    membershipId: v.id("communityMemberships"),
    status: v.union(v.literal("active"), v.literal("ended")),
    endsAt: v.optional(v.number()),
    reason: v.string(),
    grantedByUserId: v.id("users"),
    grantedVia: v.union(v.literal("web"), v.literal("agent")),
    /** The offer this access is for (communityOffers key); the base offer when unset. */
    offerKey: v.optional(v.string()),
    endJobId: v.optional(v.id("_scheduled_functions")),
    endedAt: v.optional(v.number()),
    endedByUserId: v.optional(v.id("users")),
    endedReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community_user_status", ["communityId", "userId", "status"])
    .index("by_membership_createdAt", ["membershipId", "createdAt"])
    .index("by_status_endsAt", ["status", "endsAt"]),

  // A stable, community-scoped id an outside service knows a member by, so the
  // internal user id never leaves Polynet. Kept across leaving and rejoining.
  communityAccessMembers: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    memberId: v.string(),
    createdAt: v.number(),
  })
    .index("by_community_user", ["communityId", "userId"])
    .index("by_member_id", ["memberId"]),

  // One license key per member and community. Only a hash is stored; the key
  // is a pointer to the membership, valid exactly while the member is entitled.
  communityMemberLicenseKeys: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    keyHash: v.string(),
    last4: v.string(),
    status: v.union(v.literal("active"), v.literal("rotated"), v.literal("revoked")),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
    revokedByUserId: v.optional(v.id("users")),
    lastCheckedAt: v.optional(v.number()),
    lastCheckedByIntegrationId: v.optional(v.id("communityAccessIntegrations")),
  })
    .index("by_key_hash", ["keyHash"])
    .index("by_community_user_status", ["communityId", "userId", "status"]),

  // An outside service the owner registered to learn who is entitled: a signed
  // webhook on every change plus a read-only lookup key. The API key is stored
  // hashed; the signing secret is encrypted, because Polynet signs with it.
  communityAccessIntegrations: defineTable({
    communityId: v.id("communities"),
    name: v.string(),
    webhookUrl: v.string(),
    // Empty = every paid plan.
    pricePointIds: v.array(v.id("communityPricePoints")),
    includeOwnerGrants: v.boolean(),
    status: v.union(v.literal("active"), v.literal("revoked")),
    apiKeyHash: v.string(),
    apiKeyLast4: v.string(),
    encryptedSigningSecretHex: v.string(),
    signingSecretIvHex: v.string(),
    signingSecretLast4: v.string(),
    // The sweep walks every membership in pages so a missed write still reaches
    // the service; this is where the next page starts.
    sweepCursor: v.optional(v.string()),
    sweepStartedAt: v.optional(v.number()),
    lastDeliveredAt: v.optional(v.number()),
    lastFailedAt: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
    lastLookupAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_community", ["communityId"])
    .index("by_api_key_hash", ["apiKeyHash"])
    .index("by_status", ["status"]),

  // "Continue with Polynet": a one-time code a signed-in member hands an access
  // integration through their browser. Stored hashed, good for five minutes,
  // once, and only for the integration and return address it was made for.
  communityAccessSignInCodes: defineTable({
    communityId: v.id("communities"),
    integrationId: v.id("communityAccessIntegrations"),
    userId: v.id("users"),
    codeHash: v.string(),
    returnUrl: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
  })
    .index("by_code_hash", ["codeHash"])
    .index("by_user_createdAt", ["userId", "createdAt"]),

  // What an integration was last told about each member, so a change is sent
  // once, in order, and only when something it can see changed.
  communityAccessDeliveryStates: defineTable({
    integrationId: v.id("communityAccessIntegrations"),
    communityId: v.id("communities"),
    userId: v.id("users"),
    fingerprint: v.string(),
    sequence: v.number(),
    updatedAt: v.number(),
  }).index("by_integration_user", ["integrationId", "userId"]),

  // The outbox: one row per membership.access_changed (or test) event, written
  // in the same transaction as the change and delivered with retries for 72h.
  communityAccessEvents: defineTable({
    communityId: v.id("communities"),
    integrationId: v.id("communityAccessIntegrations"),
    userId: v.optional(v.id("users")),
    memberId: v.optional(v.string()),
    eventId: v.string(),
    type: v.union(v.literal("membership.access_changed"), v.literal("integration.test")),
    payload: v.any(),
    entitled: v.optional(v.boolean()),
    status: v.union(v.literal("pending"), v.literal("delivering"), v.literal("delivered"), v.literal("needs_attention")),
    attemptCount: v.number(),
    attemptToken: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    nextAttemptAt: v.optional(v.number()),
    responseStatus: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
    deliveredAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_integration_createdAt", ["integrationId", "createdAt"])
    .index("by_community_user_createdAt", ["communityId", "userId", "createdAt"])
    .index("by_status_next_attempt_at", ["status", "nextAttemptAt"])
    .index("by_status_lease_expires_at", ["status", "leaseExpiresAt"]),

  communityResourceProgress: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    resourceId: v.id("communityResources"),
    status: v.union(v.literal("in_progress"), v.literal("done")),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    // Answers to the lesson's follow-along elements, one per element id.
    responses: v.optional(v.array(v.object({
      element: v.string(),
      value: v.union(v.boolean(), v.array(v.string())),
      correct: v.optional(v.boolean()),
      complete: v.boolean(),
      at: v.number(),
    }))),
    updatedAt: v.number(),
  })
    .index("by_community_user", ["communityId", "userId"])
    .index("by_community_user_resource", ["communityId", "userId", "resourceId"])
    .index("by_resource", ["resourceId"])
    .index("by_user", ["userId"]),

  communityResourceContents: defineTable({
    communityId: v.id("communities"),
    resourceId: v.id("communityResources"),
    bodyMd: v.string(),
    bodyChars: v.number(),
    bodyHash: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_resource", ["resourceId"])
    .index("by_community_resource", ["communityId", "resourceId"])
    .index("by_community_updatedAt", ["communityId", "updatedAt"]),

  // Earlier versions of a lesson's body, so an owner (or their agent) can go
  // back. One row per editing session: autosave keeps changing the body every
  // second or so, and only the version before a pause of a few minutes is kept.
  communityResourceRevisions: defineTable({
    communityId: v.id("communities"),
    resourceId: v.id("communityResources"),
    title: v.string(),
    bodyMd: v.string(),
    bodyChars: v.number(),
    bodyHash: v.string(),
    // When this version was last saved, before it was replaced.
    savedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_resource_createdAt", ["resourceId", "createdAt"]),

  // A YouTube video's chapters, read from its public description once and
  // shared by every lesson that shows the video (convex/youtubeChapters.ts).
  youtubeVideoChapters: defineTable({
    videoId: v.string(),
    chapters: v.array(v.object({ seconds: v.number(), time: v.string(), label: v.string() })),
    found: v.boolean(),
    fetchedAt: v.number(),
  })
    .index("by_video", ["videoId"]),

  communitySourceUnits: defineTable({
    communityId: v.id("communities"),
    crawlJobId: v.id("communitySourceCrawlJobs"),
    sourceResourceId: v.optional(v.id("communityResources")),
    rootUrl: v.string(),
    unitKey: v.string(),
    unitKind: v.union(v.literal("page"), v.literal("virtual_section")),
    title: v.optional(v.string()),
    sourceUrl: v.string(),
    parentUrl: v.optional(v.string()),
    path: v.optional(v.string()),
    order: v.number(),
    depth: v.number(),
    status: v.union(
      v.literal("ready"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    bodyChars: v.number(),
    bodyOriginalChars: v.number(),
    bodyHash: v.string(),
    bodyTruncated: v.optional(v.boolean()),
    captureMethod: v.optional(v.string()),
    error: v.optional(v.string()),
    seenCount: v.number(),
    lastSeenAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community_crawl_job", ["communityId", "crawlJobId"])
    .index("by_crawl_job_order", ["crawlJobId", "order"])
    .index("by_community_unit_key", ["communityId", "unitKey"])
    .index("by_source_resource", ["sourceResourceId"])
    .index("by_community_status_lastSeenAt", ["communityId", "status", "lastSeenAt"]),

  communitySourceUnitContents: defineTable({
    communityId: v.id("communities"),
    sourceUnitId: v.id("communitySourceUnits"),
    bodyMd: v.string(),
    bodyChars: v.number(),
    bodyHash: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_source_unit", ["sourceUnitId"])
    .index("by_community_source_unit", ["communityId", "sourceUnitId"])
    .index("by_community_updatedAt", ["communityId", "updatedAt"]),

  communitySourceCrawlJobs: defineTable({
    communityId: v.id("communities"),
    createdByUserId: v.id("users"),
    provider: v.union(v.literal("simple"), v.literal("crawl4ai"), v.literal("firecrawl")),
    rootUrl: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("crawling"),
      v.literal("saving_sources"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    maxPages: v.number(),
    maxDepth: v.number(),
    pageCount: v.number(),
    readyPageCount: v.number(),
    failedPageCount: v.number(),
    savedSourceCount: v.number(),
    skippedSourceCount: v.number(),
    sourceResourceIds: v.optional(v.array(v.id("communityResources"))),
    error: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_community_status_createdAt", ["communityId", "status", "createdAt"])
    .index("by_createdBy", ["createdByUserId"]),

  communityResourceModules: defineTable({
    communityId: v.id("communities"),
    createdByUserId: v.id("users"),
    status: v.optional(v.union(v.literal("draft"), v.literal("live"))),
    name: v.string(),
    descriptionMd: v.optional(v.string()),
    bannerUrl: v.optional(v.string()),
    bannerStorageId: v.optional(v.id("_storage")),
    bannerFocusX: v.optional(v.number()),
    bannerFocusY: v.optional(v.number()),
    bannerZoom: v.optional(v.number()),
    // How lessons read: "article" (a clean Medium-like page, the default) or
    // "video" (a classic course, the lesson text on a card under the video).
    lessonStyle: v.optional(v.union(v.literal("article"), v.literal("video"))),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_sortOrder", ["communityId", "sortOrder"])
    .index("by_createdBy", ["createdByUserId"]),

  // Hard-to-undo Settings changes an agent proposed, waiting for a manager's Apply.
  communitySettingProposals: defineTable({
    communityId: v.id("communities"),
    createdByUserId: v.id("users"),
    idempotencyKey: v.string(),
    operation: v.string(),
    args: v.any(),
    summary: v.string(),
    details: v.array(v.object({ label: v.string(), value: v.string() })),
    note: v.optional(v.string()),
    // Which agent proposed it, in its own words ("Claude Code").
    proposedBy: v.optional(v.string()),
    // A workflow stage change: the stage as it was when proposed (so Apply can
    // tell it changed since) and the stage as it would be.
    baseStage: v.optional(v.string()),
    previewStage: v.optional(v.any()),
    status: v.union(v.literal("staged"), v.literal("applying"), v.literal("applied"),
      v.literal("rejected"), v.literal("failed"), v.literal("expired")),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.number(),
    decidedAt: v.optional(v.number()),
    decidedByUserId: v.optional(v.id("users")),
  })
    .index("by_community_status_createdAt", ["communityId", "status", "createdAt"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_community_creator_idempotencyKey", ["communityId", "createdByUserId", "idempotencyKey"]),

  // Every saved change to a workflow stage, from the app or an agent, with the
  // stage before and after, so Workflows can show what changed and undo it.
  communityWorkflowChanges: defineTable({
    communityId: v.id("communities"),
    milestoneKey: v.string(),
    changedByUserId: v.id("users"),
    via: v.union(v.literal("app"), v.literal("agent")),
    // The agent's own name for itself ("Claude Code"), when an agent made it.
    changedBy: v.optional(v.string()),
    // Set when the owner approved an agent's suggestion.
    approvedByUserId: v.optional(v.id("users")),
    undoOf: v.optional(v.id("communityWorkflowChanges")),
    before: v.any(),
    after: v.any(),
    revision: v.number(),
    createdAt: v.number(),
  })
    .index("by_community_createdAt", ["communityId", "createdAt"]),

  communityResourceBuilderChangesets: defineTable({
    communityId: v.id("communities"),
    createdByUserId: v.id("users"),
    idempotencyKey: v.optional(v.string()),
    status: v.union(
      v.literal("staged"),
      v.literal("approved"),
      v.literal("applied"),
      v.literal("rejected"),
      v.literal("failed"),
      v.literal("expired"),
    ),
    summary: v.string(),
    operations: v.array(v.any()),
    preflight: v.any(),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    approvedAt: v.optional(v.number()),
    approvedByUserId: v.optional(v.id("users")),
    rejectedAt: v.optional(v.number()),
    rejectedByUserId: v.optional(v.id("users")),
    appliedAt: v.optional(v.number()),
    appliedByUserId: v.optional(v.id("users")),
  })
    .index("by_community_status_createdAt", ["communityId", "status", "createdAt"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_community_creator_idempotencyKey", [
      "communityId",
      "createdByUserId",
      "idempotencyKey",
    ])
    .index("by_createdBy", ["createdByUserId"]),

  polynetCanonicalOperationReceipts: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    principalKind: v.union(
      v.literal("community_agent_for_member"),
      v.literal("personal_agent"), // retired name on old receipts; rewritten in the table-drop release
      v.literal("external_mcp"),
      v.literal("community_agent"),
      v.literal("community_app"),
    ),
    toolName: v.union(v.literal("polynet_write"), v.literal("polynet_call")),
    idempotencyKey: v.string(),
    requestFingerprint: v.string(),
    status: v.union(
      v.literal("executing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    attemptToken: v.optional(v.string()),
    attemptCount: v.optional(v.number()),
    leaseExpiresAt: v.optional(v.number()),
    result: v.optional(v.any()),
    lastErrorCode: v.optional(v.string()),
    lastErrorMessage: v.optional(v.string()),
    failedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_scope_key", [
    "communityId",
    "userId",
    "principalKind",
    "toolName",
    "idempotencyKey",
  ]),

  communityEvents: defineTable({
    communityId: v.id("communities"),
    createdByUserId: v.id("users"),
    title: v.string(),
    descriptionMd: v.optional(v.string()),
    startsAt: v.number(),
    endsAt: v.optional(v.number()),
    timezone: v.string(),
    locationType: v.union(v.literal("online"), v.literal("physical"), v.literal("tbd")),
    locationLabel: v.optional(v.string()),
    url: v.optional(v.string()),
    visibility: v.union(v.literal("members"), v.literal("public")),
    /** A pod's own call: only people who can open this invite-only channel see it. */
    channelId: v.optional(v.id("communityChannels")),
    status: v.union(v.literal("live"), v.literal("cancelled")),
    recurrenceFrequency: v.optional(v.union(v.literal("none"), v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
    recurrenceInterval: v.optional(v.number()),
    recurrenceUntil: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_startsAt", ["communityId", "startsAt"])
    .index("by_community_status_startsAt", ["communityId", "status", "startsAt"])
    .index("by_community_status_endsAt", ["communityId", "status", "endsAt"])
    .index("by_community_status_recurrenceFrequency_startsAt", ["communityId", "status", "recurrenceFrequency", "startsAt"])
    .index("by_community_status_updatedAt", ["communityId", "status", "updatedAt"])
    .index("by_status_startsAt", ["status", "startsAt"])
    .index("by_status_recurrenceFrequency_startsAt", ["status", "recurrenceFrequency", "startsAt"])
    .index("by_createdBy", ["createdByUserId"]),

  communityArchiveDocuments: defineTable({
    communityId: v.id("communities"),
    sourceType: v.union(
      v.literal("chat"),
      v.literal("interaction"),
      v.literal("ai_feed"),
      v.literal("resource"),
    ),
    sourceId: v.string(),
    title: v.optional(v.string()),
    sourceText: v.string(),
    pdfText: v.optional(v.string()),
    text: v.string(),
    snippet: v.string(),
    url: v.optional(v.string()),
    authorLabel: v.optional(v.string()),
    postType: v.optional(
      v.union(v.literal("observation"), v.literal("recommendation"), v.literal("action")),
    ),
    resourceType: v.optional(v.string()),
    resourceRole: v.optional(v.union(v.literal("page"), v.literal("source"))),
    resourceStatus: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("review"),
        v.literal("published"),
        v.literal("processing"),
        v.literal("failed"),
      ),
    ),
    isPdf: v.boolean(),
    embeddingStatus: v.union(v.literal("pending"), v.literal("embedded"), v.literal("failed")),
    embedding: v.optional(v.array(v.float64())),
    embeddingError: v.optional(v.string()),
    embeddingModel: v.optional(v.string()),
    embeddingDimensions: v.optional(v.number()),
    embeddingUpdatedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_community_source", ["communityId", "sourceType", "sourceId"])
    .index("by_community_embeddingStatus", ["communityId", "embeddingStatus"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 768,
      filterFields: ["communityId", "sourceType"],
    }),

  communitySourceTraces: defineTable({
    communityId: v.id("communities"),
    // Interaction traces retain source-channel provenance. Other source types
    // remain legitimately unchanneled.
    channelId: v.optional(v.id("communityChannels")),
    sourceType: v.union(
      v.literal("chat"),
      v.literal("interaction"),
      v.literal("ai_feed"),
      v.literal("resource"),
      v.literal("workflow_run"),
      v.literal("agent_run"),
      v.literal("artifact"),
      v.literal("tool_call"),
      v.literal("outcome"),
      v.literal("feedback"),
      v.literal("transcript"),
      v.literal("manual"),
      v.literal("external"),
    ),
    sourceId: v.optional(v.string()),
    title: v.optional(v.string()),
    summary: v.string(),
    // Canonical evidence fingerprints. Optional for legacy/non-canonical
    // traces; resource projections populate both from the shared resolver.
    contentHash: v.optional(v.string()),
    provenanceHash: v.optional(v.string()),
    visibilityScope: v.union(
      v.literal("private"),
      v.literal("admin"),
      v.literal("community"),
      v.literal("public"),
    ),
    sourceVisibility: v.union(
      v.literal("private"),
      v.literal("admin"),
      v.literal("community"),
      v.literal("public"),
      v.literal("redacted"),
    ),
    workflowId: v.optional(v.string()),
    artifactIds: v.array(v.string()),
    outcomeObservationIds: v.array(v.id("communityOutcomeObservations")),
    actorType: v.union(
      v.literal("member"),
      v.literal("admin"),
      v.literal("agent"),
      v.literal("compiler"),
      v.literal("system"),
    ),
    actorUserId: v.optional(v.id("users")),
    actorAgentKey: v.optional(v.string()),
    // Optional scheduling affinity. Exact trace identity and settlement stay
    // per row; related traces may share one bounded compiler admission packet.
    compilerGroupKey: v.optional(v.string()),
    // Durable scheduling state for already-observed overflow. This is not
    // evidence content and never participates in work identity or citations.
    compilerContinuationReady: v.optional(v.boolean()),
    compilerState: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("compiled"),
        v.literal("dismissed_low_signal"),
        v.literal("carried_forward"),
        v.literal("excluded_by_visibility"),
        v.literal("excluded_self_authored"),
        v.literal("agent_retries_exhausted"),
      ),
    ),
    compilerPendingSince: v.optional(v.number()),
    compilerLastHandledAt: v.optional(v.number()),
    compilerLastDigestId: v.optional(v.id("communityCompilerDigests")),
    compilerDecision: v.optional(
      v.object({
        version: v.literal(1),
        workKey: v.string(),
        disposition: v.union(
          v.literal("retain"),
          v.literal("carried_forward"),
          v.literal("dismiss_low_signal"),
        ),
        reason: v.string(),
        runId: v.optional(v.string()),
        targetNodeId: v.optional(v.id("communityIntelligenceNodes")),
        decidedAt: v.number(),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_community_visibility_createdAt", ["communityId", "visibilityScope", "createdAt"])
    .index("by_community_updatedAt", ["communityId", "updatedAt"])
    .index("by_community_compilerState_visibility_pendingSince", [
      "communityId",
      "compilerState",
      "visibilityScope",
      "compilerPendingSince",
    ])
    .index("by_compilerState_pendingSince", [
      "compilerState",
      "compilerPendingSince",
    ])
    .index("by_community_source", ["communityId", "sourceType", "sourceId"])
    .index("by_community_workflow", ["communityId", "workflowId"]),

  communityEvidenceCitations: defineTable({
    communityId: v.id("communities"),
    sourceKind: v.union(
      v.literal("interaction"),
      v.literal("resource"),
      v.literal("ai_feed"),
      v.literal("source_trace"),
    ),
    sourceRef: v.string(),
    sourceTraceId: v.optional(v.id("communitySourceTraces")),
    sourceVersion: v.string(),
    contentHash: v.string(),
    provenanceHash: v.string(),
    capturedVisibility: v.union(
      v.literal("private"),
      v.literal("admin"),
      v.literal("community"),
      v.literal("public"),
    ),
    capturedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_ref_version", ["communityId", "sourceRef", "sourceVersion"])
    .index("by_community_ref_fingerprints", [
      "communityId",
      "sourceRef",
      "contentHash",
      "provenanceHash",
    ])
    .index("by_community_ref_capturedAt", ["communityId", "sourceRef", "capturedAt"])
    .index("by_sourceTrace", ["sourceTraceId"]),

  communityEvidenceRetrievalLogs: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    surface: v.union(
      v.literal("member_agent_dock"),
      v.literal("coding_harness"),
      v.literal("external_mcp"),
      v.literal("community_concierge"),
    ),
    capability: v.union(
      v.literal("community_repository_search"),
      v.literal("community_chat_search"),
      v.literal("community_chat_read"),
      v.literal("community_resources_search"),
      v.literal("community_resources_read"),
      v.literal("community_resource_read"),
      v.literal("community_ai_feed_search"),
      v.literal("community_ai_feed_read"),
    ),
    // Compatibility only for rows written before the metadata-only audit
    // contract. New retrieval logs must not copy raw search text.
    query: v.optional(v.string()),
    resultRefs: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_user_createdAt", ["userId", "createdAt"])
    .index("by_community_surface_createdAt", ["communityId", "surface", "createdAt"]),

  communityIntelligenceNodes: defineTable({
    communityId: v.id("communities"),
    type: v.union(
      v.literal("playbook"),
      v.literal("insight"),
      v.literal("example"),
      v.literal("warning_failure"),
      v.literal("decision_judgment"),
      v.literal("open_question"),
    ),
    title: v.string(),
    bodyMd: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("candidate"),
      v.literal("promising"),
      v.literal("validated"),
      v.literal("canonical"),
      v.literal("contested"),
      v.literal("stale"),
      v.literal("deprecated"),
      v.literal("archived"),
    ),
    visibilityScope: v.union(
      v.literal("private"),
      v.literal("admin"),
      v.literal("community"),
      v.literal("public"),
    ),
    sourceVisibility: v.union(
      v.literal("private"),
      v.literal("admin"),
      v.literal("community"),
      v.literal("public"),
      v.literal("redacted"),
    ),
    confidence: v.number(),
    evidenceStrength: v.union(
      v.literal("none"),
      v.literal("anecdotal"),
      v.literal("observed"),
      v.literal("measured"),
      v.literal("validated"),
    ),
    appliesWhen: v.optional(v.string()),
    doesNotApplyWhen: v.optional(v.string()),
    workflowIds: v.array(v.string()),
    tags: v.array(v.string()),
    sourceTraceIds: v.array(v.id("communitySourceTraces")),
    evidenceCitationIds: v.optional(v.array(v.id("communityEvidenceCitations"))),
    evidencePolicyVersion: v.optional(v.literal("citation_v1")),
    outcomeObservationIds: v.array(v.id("communityOutcomeObservations")),
    stalenessScore: v.number(),
    retrievalUsefulnessScore: v.number(),
    outcomeImpactScore: v.number(),
    createdByActorType: v.union(
      v.literal("member"),
      v.literal("admin"),
      v.literal("agent"),
      v.literal("compiler"),
      v.literal("system"),
    ),
    createdByUserId: v.optional(v.id("users")),
    createdByAgentKey: v.optional(v.string()),
    lastUpdatedByActorType: v.union(
      v.literal("member"),
      v.literal("admin"),
      v.literal("agent"),
      v.literal("compiler"),
      v.literal("system"),
    ),
    lastUpdatedByUserId: v.optional(v.id("users")),
    lastUpdatedByAgentKey: v.optional(v.string()),
    lastValidatedAt: v.optional(v.number()),
    deprecatedByNodeId: v.optional(v.id("communityIntelligenceNodes")),
    originChangeRequestId: v.optional(v.id("communityIntelligenceChangeRequests")),
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_type", ["communityId", "type"])
    .index("by_community_status", ["communityId", "status"])
    .index("by_community_type_status", ["communityId", "type", "status"])
    .index("by_community_type_status_updatedAt", ["communityId", "type", "status", "updatedAt"])
    .index("by_community_status_updatedAt", ["communityId", "status", "updatedAt"]),

  communityIntelligenceEdges: defineTable({
    communityId: v.id("communities"),
    fromNodeId: v.id("communityIntelligenceNodes"),
    toNodeId: v.optional(v.id("communityIntelligenceNodes")),
    toReferenceType: v.optional(
      v.union(
        v.literal("trace"),
        v.literal("workflow"),
        v.literal("artifact"),
        v.literal("outcome"),
        v.literal("person"),
        v.literal("tool"),
        v.literal("agent_run"),
        v.literal("resource"),
      ),
    ),
    toReferenceId: v.optional(v.string()),
    type: v.union(
      v.literal("supports"),
      v.literal("contradicts"),
      v.literal("derived_from"),
      v.literal("applies_to_workflow"),
      v.literal("has_example"),
      v.literal("validated_by"),
      v.literal("deprecated_by"),
    ),
    confidence: v.number(),
    evidenceTraceIds: v.array(v.id("communitySourceTraces")),
    evidenceCitationIds: v.optional(v.array(v.id("communityEvidenceCitations"))),
    evidencePolicyVersion: v.optional(v.literal("citation_v1")),
    visibilityScope: v.union(
      v.literal("private"),
      v.literal("admin"),
      v.literal("community"),
      v.literal("public"),
    ),
    createdByActorType: v.union(
      v.literal("member"),
      v.literal("admin"),
      v.literal("agent"),
      v.literal("compiler"),
      v.literal("system"),
    ),
    createdByUserId: v.optional(v.id("users")),
    createdByAgentKey: v.optional(v.string()),
    compilerRunId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_fromNode", ["fromNodeId"])
    .index("by_toNode", ["toNodeId"])
    .index("by_community_type", ["communityId", "type"])
    .index("by_community_reference", ["communityId", "toReferenceType", "toReferenceId"]),

  communityIntelligenceMutations: defineTable({
    communityId: v.id("communities"),
    operation: v.union(
      v.literal("create_node"),
      v.literal("update_node"),
      v.literal("create_edge"),
      v.literal("attach_evidence"),
      v.literal("attach_outcome"),
      v.literal("promote_status"),
      v.literal("mark_contested"),
      v.literal("mark_stale"),
      v.literal("deprecate_node"),
      v.literal("update_confidence"),
      v.literal("update_visibility"),
    ),
    actorType: v.union(
      v.literal("member"),
      v.literal("admin"),
      v.literal("agent"),
      v.literal("compiler"),
      v.literal("system"),
    ),
    actorUserId: v.optional(v.id("users")),
    actorAgentKey: v.optional(v.string()),
    targetNodeIds: v.array(v.id("communityIntelligenceNodes")),
    targetEdgeIds: v.array(v.id("communityIntelligenceEdges")),
    primaryTargetNodeId: v.optional(v.id("communityIntelligenceNodes")),
    primaryTargetEdgeId: v.optional(v.id("communityIntelligenceEdges")),
    beforeSnapshot: v.optional(v.any()),
    afterSnapshot: v.optional(v.any()),
    sourceTraceIds: v.array(v.id("communitySourceTraces")),
    compilerRunId: v.optional(v.string()),
    policyDecisionId: v.optional(v.string()),
    reason: v.string(),
    createdAt: v.number(),
  })
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_primaryTargetNode", ["primaryTargetNodeId"])
    .index("by_primaryTargetEdge", ["primaryTargetEdgeId"])
    .index("by_community_operation", ["communityId", "operation"]),

  communityIntelligenceChangeRequests: defineTable({
    communityId: v.id("communities"),
    // Canonical autonomous-memory identity. Optional only for historical and
    // manual audit rows; every new compiler-memory write requires it.
    workKey: v.optional(v.string()),
    operation: v.union(
      v.literal("create_node"),
      v.literal("update_node"),
      v.literal("create_edge"),
      v.literal("attach_evidence"),
      v.literal("attach_outcome"),
      v.literal("promote_status"),
      v.literal("mark_contested"),
      v.literal("mark_stale"),
      v.literal("deprecate_node"),
      v.literal("update_confidence"),
      v.literal("update_visibility"),
    ),
    status: v.union(
      v.literal("pending_decision"),
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("applied"),
    ),
    sourceTraceIds: v.array(v.id("communitySourceTraces")),
    evidenceCitationIds: v.optional(v.array(v.id("communityEvidenceCitations"))),
    evidencePolicyVersion: v.optional(v.literal("citation_v1")),
    outcomeObservationIds: v.array(v.id("communityOutcomeObservations")),
    targetNodeIds: v.array(v.id("communityIntelligenceNodes")),
    targetEdgeIds: v.array(v.id("communityIntelligenceEdges")),
    primaryTargetNodeId: v.optional(v.id("communityIntelligenceNodes")),
    primaryTargetEdgeId: v.optional(v.id("communityIntelligenceEdges")),
    targetNodeSnapshots: v.array(
      v.object({
        nodeId: v.id("communityIntelligenceNodes"),
        version: v.number(),
        updatedAt: v.number(),
      }),
    ),
    targetEdgeSnapshots: v.array(
      v.object({
        edgeId: v.id("communityIntelligenceEdges"),
        updatedAt: v.number(),
      }),
    ),
    requestedPayload: v.any(),
    confidence: v.number(),
    privacyRisk: v.number(),
    createdByActorType: v.union(
      v.literal("member"),
      v.literal("admin"),
      v.literal("agent"),
      v.literal("compiler"),
      v.literal("system"),
    ),
    createdByUserId: v.optional(v.id("users")),
    createdByAgentKey: v.optional(v.string()),
    decidedByActorType: v.optional(
      v.union(
        v.literal("admin"),
        v.literal("agent"),
        v.literal("compiler"),
        v.literal("system"),
      ),
    ),
    decidedByUserId: v.optional(v.id("users")),
    decidedByAgentKey: v.optional(v.string()),
    decisionReason: v.optional(v.string()),
    appliedMutationId: v.optional(v.id("communityIntelligenceMutations")),
    createdAt: v.number(),
    updatedAt: v.number(),
    decidedAt: v.optional(v.number()),
    appliedAt: v.optional(v.number()),
  })
    .index("by_community_workKey", ["communityId", "workKey"])
    .index("by_community_status", ["communityId", "status"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_community_type_status", ["communityId", "operation", "status"])
    .index("by_community_operation_status_agent_createdAt", [
      "communityId",
      "operation",
      "status",
      "createdByAgentKey",
      "createdAt",
    ])
    .index("by_primaryTargetNode", ["primaryTargetNodeId"])
    .index("by_primaryTargetEdge", ["primaryTargetEdgeId"]),

  communityIntelligenceRetrievalLogs: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    // Optional only for rows created before the canonical privacy-safe receipt
    // contract. Every new accepted-memory tool receipt writes both fields.
    receiptVersion: v.optional(v.literal("community_memory_retrieval_receipt:v1")),
    surface: v.optional(
      v.union(
        v.literal("member_agent_dock"),
        v.literal("coding_harness"),
        v.literal("external_mcp"),
        v.literal("community_concierge"),
      ),
    ),
    workflowId: v.optional(v.string()),
    // Historical compatibility only. New receipts never persist raw search
    // text; the query is used transiently for deterministic retrieval.
    query: v.optional(v.string()),
    retrievedNodeIds: v.array(v.id("communityIntelligenceNodes")),
    injectedNodeIds: v.array(v.id("communityIntelligenceNodes")),
    // Historical compatibility only. The active V1 contract records
    // node-specific outcomes instead of receipt-wide feedback.
    feedback: v.optional(
      v.union(
        v.literal("useful"),
        v.literal("not_useful"),
        v.literal("wrong"),
        v.literal("stale"),
      ),
    ),
    feedbackNote: v.optional(v.string()),
    outcomeObservationIds: v.array(v.id("communityOutcomeObservations")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_community_workflow", ["communityId", "workflowId"])
    .index("by_user", ["userId"]),

  communityOutcomeObservations: defineTable({
    communityId: v.id("communities"),
    nodeId: v.optional(v.id("communityIntelligenceNodes")),
    retrievalLogId: v.optional(v.id("communityIntelligenceRetrievalLogs")),
    workflowId: v.optional(v.string()),
    metricName: v.optional(v.string()),
    metricValue: v.optional(v.number()),
    baselineValue: v.optional(v.number()),
    resultStatus: v.union(
      v.literal("worked"),
      v.literal("failed"),
      v.literal("mixed"),
      v.literal("unknown"),
    ),
    evidenceStrength: v.union(
      v.literal("none"),
      v.literal("anecdotal"),
      v.literal("observed"),
      v.literal("measured"),
      v.literal("validated"),
    ),
    notes: v.optional(v.string()),
    observedByActorType: v.union(
      v.literal("member"),
      v.literal("admin"),
      v.literal("agent"),
      v.literal("compiler"),
      v.literal("system"),
    ),
    observedByUserId: v.optional(v.id("users")),
    observedByAgentKey: v.optional(v.string()),
    observedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_node", ["nodeId"])
    .index("by_retrievalLog", ["retrievalLogId"])
    .index("by_community_workflow", ["communityId", "workflowId"])
    .index("by_community_observedAt", ["communityId", "observedAt"]),

  communityMemoryMetabolizerRuns: defineTable({
    communityId: v.id("communities"),
    status: v.union(
      v.literal("settled"),
      v.literal("noop"),
      v.literal("error"),
    ),
    trigger: v.union(
      v.literal("sweep"),
      v.literal("manual"),
      v.literal("internal"),
    ),
    inspectedRetrievalLogCount: v.number(),
    inspectedOutcomeCount: v.number(),
    signalNodeCount: v.number(),
    inspectedNodeCount: v.number(),
    settledNodeCount: v.number(),
    nodeUpdateLimit: v.number(),
    changedNodeIds: v.array(v.id("communityIntelligenceNodes")),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_community_finishedAt", ["communityId", "finishedAt"])
    .index("by_finishedAt", ["finishedAt"]),

  communityCompilerDigests: defineTable({
    communityId: v.id("communities"),
    dedupeKey: v.string(),
    // New compiler output is immutable per canonical work set. Historical
    // daily-upsert rows omit this field and are never claimed as agent work.
    versionKey: v.optional(v.string()),
    // Autonomous compiler-to-agent work lifecycle. This is execution state,
    // not a human approval gate.
    agentHandoffState: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("running"),
        v.literal("handled"),
      ),
    ),
    agentClaimId: v.optional(v.string()),
    agentClaimedAt: v.optional(v.number()),
    agentHandledAt: v.optional(v.number()),
    agentTerminalReason: v.optional(
      v.union(
        v.literal("settled"),
        v.literal("superseded"),
        v.literal("retries_exhausted"),
      ),
    ),
    agentAttemptCount: v.optional(v.number()),
    agentRetryCount: v.optional(v.number()),
    windowStartedAt: v.number(),
    windowEndedAt: v.number(),
    summary: v.string(),
    itemCount: v.number(),
    items: v.array(
      v.object({
        // Historical digest rows predate canonical work identity. Every new
        // compiler pass writes this field and autonomous writes require it.
        workKey: v.optional(v.string()),
        category: v.union(
          v.literal("chat_activity"),
          v.literal("ai_feed_signal"),
          v.literal("resource_activity"),
          v.literal("event_activity"),
          v.literal("member_state"),
          v.literal("outcome_signal"),
          v.literal("source_trace_signal"),
          // Read compatibility for pre-deletion digest rows. New compiler
          // passes never emit this category.
          v.literal("pending_directory_decision"),
        ),
        title: v.string(),
        summary: v.string(),
        priority: v.number(),
        confidence: v.number(),
        sourceTypes: v.array(v.string()),
        sourceIds: v.array(v.string()),
        sourceTraceIds: v.array(v.id("communitySourceTraces")),
        // Scheduling provenance only. Work identity, citations, and terminal
        // disposition remain exact to this item's single source trace.
        compilerGroupKey: v.optional(v.string()),
        // Exact material revisions represented by this immutable work item.
        // Historical digest rows omit the field.
        sourceRevisions: v.optional(v.array(v.string())),
      }),
    ),
    signalCounts: v.object({
      chat: v.number(),
      aiFeed: v.number(),
      resources: v.number(),
      events: v.number(),
      sourceTraces: v.number(),
      outcomes: v.number(),
      // Read compatibility for pre-deletion digest rows.
      pendingChangeRequests: v.optional(v.number()),
      newMembers: v.number(),
      activeMembers: v.number(),
      postingMembers: v.number(),
      aiFeedReactingMembers: v.number(),
    }),
    createdByActorType: v.union(
      v.literal("compiler"),
      v.literal("agent"),
      v.literal("system"),
      v.literal("admin"),
    ),
    createdByUserId: v.optional(v.id("users")),
    createdByAgentKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_community_windowEndedAt", ["communityId", "windowEndedAt"])
    .index("by_community_versionKey", ["communityId", "versionKey"])
    .index("by_community_agentHandoffState_createdAt", [
      "communityId",
      "agentHandoffState",
      "createdAt",
    ])
    .index("by_agentHandoffState_createdAt", [
      "agentHandoffState",
      "createdAt",
    ])
    .index("by_agentHandoffState_agentClaimedAt", [
      "agentHandoffState",
      "agentClaimedAt",
    ]),

  memberAgentChannels: defineTable({
    ownerId: v.id("users"),
    scopeKey: v.optional(v.union(v.literal("global"), v.literal("community"))),
    communityId: v.optional(v.id("communities")),
    activeEpisodeId: v.optional(v.id("memberAgentEpisodes")),
    communityNameSnapshot: v.optional(v.string()),
    communityDeletedAt: v.optional(v.number()),
    nextOrdinal: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_scope", ["ownerId", "scopeKey"])
    .index("by_owner_scope_community", ["ownerId", "scopeKey", "communityId"])
    .index("by_owner", ["ownerId"])
    .index("by_owner_community", ["ownerId", "communityId"])
    .index("by_community", ["communityId"]),

  memberAgentEpisodes: defineTable({
    channelId: v.id("memberAgentChannels"),
    threadId: v.id("threads"),
    ordinal: v.number(),
    status: v.union(v.literal("active"), v.literal("closed")),
    startedAt: v.number(),
    closedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_channel_ordinal", ["channelId", "ordinal"])
    .index("by_thread", ["threadId"]),

  threads: defineTable({
    ownerId: v.id("users"),
    threadKey: v.optional(v.string()),
    title: v.optional(v.string()),
    titleSource: v.union(v.literal("auto"), v.literal("manual")),
    communityId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    contextVersion: v.optional(v.number()),
    workingState: v.optional(
      v.object({
        version: v.optional(v.number()),
        goal: v.optional(v.string()),
        status: v.optional(
          v.union(
            v.literal("idle"),
            v.literal("in_progress"),
            v.literal("blocked"),
            v.literal("needs_verification"),
            v.literal("complete"),
          ),
        ),
        currentStep: v.optional(v.string()),
        plan: v.optional(v.array(v.string())),
        completedSteps: v.optional(v.array(v.string())),
        decisions: v.optional(v.array(v.string())),
        openQuestions: v.optional(v.array(v.string())),
        focusFiles: v.optional(v.array(v.string())),
        lastResult: v.optional(v.string()),
        verificationStatus: v.optional(
          v.union(
            v.literal("not_needed"),
            v.literal("needed"),
            v.literal("passed"),
            v.literal("failed"),
          ),
        ),
        filesTouched: v.optional(v.array(v.string())),
        filesChanged: v.array(v.string()),
        verifiedFindings: v.array(v.string()),
        recentActions: v.optional(v.array(v.string())),
        lastDiagnostic: v.optional(v.string()),
        openIssue: v.optional(v.string()),
        blocker: v.optional(v.string()),
        nextAction: v.optional(v.string()),
        updatedAt: v.number(),
      }),
    ),
    latestUserVisibleCompletedRunId: v.optional(v.string()),
    lastSeenUserVisibleCompletedRunId: v.optional(v.string()),
    lastSeq: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_updatedAt", ["ownerId", "updatedAt"])
    .index("by_owner_threadKey", ["ownerId", "threadKey"]),

  cloudMessages: defineTable({
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    messageKey: v.string(),
    seq: v.number(),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    contentJson: v.any(),
    engineId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    runId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_thread_seq", ["threadId", "seq"])
    .index("by_owner_messageKey", ["ownerId", "messageKey"]),

  cloudThreadAttachments: defineTable({
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    storageId: v.id("_storage"),
    messageKey: v.string(),
    status: v.union(v.literal("pending"), v.literal("attached")),
    attachedMessageId: v.optional(v.id("cloudMessages")),
    name: v.string(),
    mime: v.string(),
    size: v.number(),
    createdAt: v.number(),
  })
    .index("by_owner_thread_storage", ["ownerId", "threadId", "storageId"])
    .index("by_owner_messageKey", ["ownerId", "messageKey"])
    .index("by_owner_createdAt", ["ownerId", "createdAt"])
    .index("by_storage", ["storageId"])
    .index("by_thread", ["threadId"]),

  cloudThreadAttachmentUploadTickets: defineTable({
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    ticketKey: v.string(),
    messageKey: v.string(),
    claimedStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
    expiresAt: v.number(),
    claimedAt: v.optional(v.number()),
  })
    .index("by_owner_ticketKey", ["ownerId", "ticketKey"])
    .index("by_owner_createdAt", ["ownerId", "createdAt"])
    .index("by_thread", ["threadId"]),

  runtimeRuns: defineTable({
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    runId: v.string(),
    lane: v.string(),
    visibility: v.optional(v.union(v.literal("user_visible"), v.literal("internal_hidden"))),
    internalFollowupKind: v.optional(v.string()),
    communityId: v.optional(v.id("communities")),
    communityContextVersion: v.optional(v.number()),
    modelId: v.optional(v.string()),
    engineId: v.optional(v.string()),
    executionMode: v.optional(v.string()),
    contractName: v.optional(v.string()),
    contractVersion: v.optional(v.string()),
    harnessProfile: v.optional(v.string()),
    harnessProfileSource: v.optional(v.string()),
    capabilityFamilies: v.optional(v.array(v.string())),
    accountPlan: v.optional(v.union(v.literal("free"), v.literal("premium"))),
    runtimeHarnessTelemetrySummary: v.optional(v.any()),
    startedContextSnapshot: v.optional(v.any()),
    activeContextSnapshot: v.optional(v.any()),
    activeContextSnapshotUpdatedAt: v.optional(v.number()),
    finishedContextSnapshot: v.optional(v.any()),
    pendingUserSteering: v.optional(
      v.array(
        v.object({
          text: v.string(),
          receivedAt: v.number(),
          messageKey: v.optional(v.string()),
        }),
      ),
    ),
    stopRequestedAt: v.optional(v.number()),
    stopReason: v.optional(v.string()),
    status: v.union(v.literal("running"), v.literal("ok"), v.literal("error"), v.literal("cancelled")),
    reason: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    lastEventSeq: v.number(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_runId", ["ownerId", "runId"])
    .index("by_thread_status_startedAt", ["threadId", "status", "startedAt"])
    .index("by_thread_startedAt", ["threadId", "startedAt"])
    .index("by_owner_startedAt", ["ownerId", "startedAt"])
    .index("by_status_startedAt", ["status", "startedAt"])
    .index("by_status_updatedAt", ["status", "updatedAt"]),

  runtimeRunEvents: defineTable({
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    runId: v.string(),
    seq: v.number(),
    eventType: v.string(),
    eventKey: v.optional(v.string()),
    payload: v.any(),
    createdAt: v.number(),
  })
    .index("by_owner_run_seq", ["ownerId", "runId", "seq"])
    .index("by_thread_run_seq", ["threadId", "runId", "seq"])
    .index("by_owner_run_eventKey", ["ownerId", "runId", "eventKey"])
    .index("by_eventType_createdAt", ["eventType", "createdAt"]),

});
