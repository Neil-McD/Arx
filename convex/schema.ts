import { founderProviderRequestUsageValidator } from "./founderPlanPricing";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { communityWeeklyDigestSnapshotValidator } from "./communityWeeklyDigestValidators";
import { channelAccessModeValidator, channelPostingPolicyValidator, channelReplyPolicyValidator } from "./communityChannelValidators";

export default defineSchema({
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
    // community_join: when Stripe's notice made the buyer a member (once).
    membershipGrantedAt: v.optional(v.number()),
    // community_join paid before signing in (cash first): the SHA-256 of the
    // secret only the paying browser holds, and the email given to Stripe.
    // Either one attaches the payment to the account that signs in.
    buyerSecretHash: v.optional(v.string()),
    buyerEmailNormalized: v.optional(v.string()),
    // Who started a checkout before signing in, as a keyed hash of their
    // address (from the edge): the per-visitor limit counts these.
    buyerVisitorHash: v.optional(v.string()),
    // community_join held before it was granted (a payment made before signing
    // in has no subscription row yet): never grants while held. A refund is
    // final; only a dispute's hold lifts (when the dispute is won).
    communityHold: v.optional(v.union(v.literal("refunded"), v.literal("disputed"), v.literal("buyer_blocked"))),
    ownerUserId: v.optional(v.id("users")),
    founderSubscriptionId: v.optional(v.id("founderSubscriptions")),
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
    .index("by_buyerEmailNormalized", ["buyerEmailNormalized"])
    .index("by_sessionId", ["sessionId"])
    .index("by_providerCheckoutSessionId", ["providerCheckoutSessionId"])
    .index("by_providerSubscriptionId", ["providerSubscriptionId"])
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


  /* Member ontology ledger — docs/member-ontology-contract-v1.md.
     communityId null = platform-wide; set = scoped to that community (this
     column IS the cross-community isolation mechanism). consentState is
     derived from provenance at birth; transitions are member-driven only. */
  memberFacts: defineTable({
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

  communities: defineTable({
    integrationReadPilotEnabled: v.optional(v.boolean()),
    ownerId: v.id("users"),
    slug: v.string(),
    name: v.string(),
    lifecycleStatus: v.optional(
      v.union(v.literal("active"), v.literal("archived")),
    ),
    lifecycleGeneration: v.optional(v.number()),
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
    // Where members spend time, the owner's switch: Polynet's app (absent) or
    // the community's own deployed site. Joining and the public page are the
    // site's either way (communityMemberExperience).
    memberExperience: v.optional(v.union(v.literal("app"), v.literal("site"))),
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
    // A line about the channel, next to its name (design v1's "Share what worked").
    description: v.optional(v.string()),
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
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_channel_principal", ["channelId", "principalKey"])
    .index("by_community_principal_status", ["communityId", "principalKey", "status"]),

  communityMemberships: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("moderator"), v.literal("member")),
    accessSource: v.optional(
      v.union(
        v.literal("free_grant"),
        v.literal("manual_grant"),
        v.literal("paid_subscription"),
      ),
    ),
    pricePointId: v.optional(v.id("communityPricePoints")),
    // See CommunityMembershipState in communityCore.
    state: v.union(
      v.literal("active"),
      v.literal("left"),
      v.literal("removed"),
      v.literal("lapsed"),
      v.literal("payment_hold"),
    ),
    activationSequence: v.optional(v.number()),
    activatedAt: v.optional(v.number()),
    // History only: when and why a membership last ended. Never decides access.
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
    // Who holds a role (the community card names its admins and moderators).
    .index("by_community_role_state", ["communityId", "role", "state"]),



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
    // Code writes pending and denied; approved and canceled are old rows that
    // readers skip (an approved request becomes a membership and is deleted).
    status: v.union(v.literal("pending"), v.literal("denied"), v.literal("approved"), v.literal("canceled")),
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

  communityAnalyticsEvents: defineTable({
    communityId: v.id("communities"),
    eventType: v.union(v.literal("funnel_visit"), v.literal("funnel_join_started")),
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

  communityPricePoints: defineTable({
    communityId: v.id("communities"),
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
    // See communitySubscriptionLifecycle: the only writer of status,
    // cancelAtPeriodEnd and endedAt. Stripe's "canceled" is stored as ended.
    status: v.union(
      v.literal("active"),
      v.literal("past_due"),
      v.literal("cancel_at_period_end"),
      v.literal("ended"),
    ),
    providerSubscriptionId: v.optional(v.string()),
    providerAccountId: v.optional(v.string()),
    providerCustomerId: v.optional(v.string()),
    currentPeriodStartAt: v.optional(v.number()),
    currentPeriodEndAt: v.optional(v.number()),
    cancelAtPeriodEnd: v.boolean(),
    // When the member left (asked to stop renewing). Until Stripe confirms the
    // cancellation, Polynet keeps asking; a renewal Stripe reports after this
    // time is re-cancelled instead of reopening billing.
    cancelRequestedAt: v.optional(v.number()),
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

  /* Host-curated messages projected public-safely to visitors on the community
     funnel (/c/:slug). Pointer table — never touches the message rows. */

  communityTypingPresence: defineTable({
    communityId: v.id("communities"),
    channelId: v.id("communityChannels"),
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
    .index("by_channel_user", ["channelId", "userId"])
    .index("by_channel_displayUntil", ["channelId", "displayUntil"]),

  communityInteractionRoots: defineTable({
    communityId: v.id("communities"),
    // Private member-agent dock roots legitimately remain unchanneled. Every
    // community/public interaction root is channel-addressable.
    channelId: v.optional(v.id("communityChannels")),
    actorType: v.union(
      v.literal("human"),
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


  // Lesson progress (communityLessonProgress.ts): the lessons a member has
  // marked done. Only that member reads it.
  communityLessonProgress: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    resourceId: v.id("communityResources"),
    completedAt: v.number(),
  })
    .index("by_user_resource", ["userId", "resourceId"])
    .index("by_resource", ["resourceId"]),

  // Community notes (communityNotes.ts): what the community agent learned
  // that is worth sharing with everyone, one short markdown note each.
  communityNotes: defineTable({
    communityId: v.id("communities"),
    slug: v.string(),
    title: v.string(),
    bodyMd: v.string(),
    source: v.union(v.literal("ask"), v.literal("tag"), v.literal("founder"), v.literal("migrated")),
    searchText: v.string(),
    // The old memory node a migrated note came from, so the copy runs once.
    migratedFromNodeId: v.optional(v.string()),
    // The last write's retry key, so a retried write is not applied twice.
    lastOperationKey: v.optional(v.string()),
    createdByUserId: v.optional(v.id("users")),
    updatedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community_slug", ["communityId", "slug"])
    .index("by_community_updatedAt", ["communityId", "updatedAt"])
    .index("by_migrated_node", ["migratedFromNodeId"])
    .searchIndex("search_text", { searchField: "searchText", filterFields: ["communityId"] }),

  // The founder-approved handbook (communityHandbook.ts): facts members ask
  // about. Only approvedMd reaches the agent; the draft waits for approval.
  communityHandbooks: defineTable({
    communityId: v.id("communities"),
    approvedMd: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    approvedByUserId: v.optional(v.id("users")),
    draftMd: v.optional(v.string()),
    draftUpdatedAt: v.optional(v.number()),
    draftStatus: v.union(v.literal("idle"), v.literal("drafting"), v.literal("failed")),
    draftError: v.optional(v.string()),
    draftRequestedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_community", ["communityId"]),

  // One search row per live, community-visible post or reply: a projection
  // kept current in the same write as its source (communitySearchDocs.ts).
  // Search finds candidates; every result is re-checked against the source.
  communitySearchDocs: defineTable({
    communityId: v.id("communities"),
    kind: v.union(v.literal("post"), v.literal("reply")),
    rootId: v.id("communityInteractionRoots"),
    replyId: v.optional(v.id("communityInteractionReplies")),
    channelId: v.optional(v.id("communityChannels")),
    // "shared" for channels every member reads, or "channel:<id>" for a
    // restricted one: a reader's search only asks for keys they hold.
    accessKey: v.string(),
    authorUserId: v.optional(v.id("users")),
    sourceCreatedAt: v.number(),
    searchText: v.string(),
    // On a post's row: the opening its replies are indexed under, so an edit
    // that changes it can refresh them.
    threadOpening: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_root_reply", ["rootId", "replyId"])
    .index("by_reply", ["replyId"])
    .index("by_channel", ["channelId"])
    .index("by_community", ["communityId"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["communityId", "accessKey", "authorUserId", "channelId", "kind"],
    }),

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
    embedId: v.optional(v.string()),
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
    )),
    sourceRootId: v.optional(v.id("communityInteractionRoots")),
    sourceReplyId: v.optional(v.id("communityInteractionReplies")),
    requesterUserId: v.optional(v.id("users")),
    sponsorUserId: v.optional(v.id("users")),
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
    sourceTraceId: v.optional(v.string()),
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

  // Writes a person makes through their own AI (the MCP) or their site, per
  // minute (convex/memberWriteRateLimit.ts).
  memberWriteRateCounters: defineTable({
    userId: v.id("users"),
    windowStartMs: v.number(),
    count: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

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
    // Owner off-switch for the memory agent. Absent means enabled; inference
    // admission is resolved through the canonical managed-funding policy.
    agentEnabled: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_updatedAt", ["communityId", "updatedAt"]),

  // Per-run event log for community agent runs (@mentions): prompts, tool
  // calls and results, and the final outcome, in sequence. The audit trail that
  // makes a run reconstructable after the fact.
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
  // A change the owner's own AI asked for, waiting for the owner to approve it
  // in Studio (Nov 6). One kind so far: where members spend time.
  // A community's public page (its doorstep): the sales sections its owner
  // fills in (shared/communityPublicPage.ts). One row per community.
  communityPublicPages: defineTable({
    communityId: v.id("communities"),
    forYou: v.array(v.string()),
    notFor: v.array(v.string()),
    firstSteps: v.array(v.object({ title: v.string(), text: v.string() })),
    results: v.array(v.object({ quote: v.string(), name: v.string(), role: v.string() })),
    founderBio: v.string(),
    video: v.optional(v.object({ provider: v.union(v.literal("youtube"), v.literal("vimeo"), v.literal("loom")), id: v.string() })),
    guarantee: v.string(),
    objections: v.array(v.object({ question: v.string(), answer: v.string() })),
    revision: v.number(),
    updatedByUserId: v.id("users"),
    // "Draft with AI": a suggestion for the empty sections, never saved as the
    // page itself; the owner reads it into the form, edits and saves.
    draftStatus: v.optional(v.union(v.literal("drafting"), v.literal("ready"), v.literal("failed"))),
    draftRequestedAt: v.optional(v.number()),
    draftError: v.optional(v.string()),
    draft: v.optional(v.object({
      forYou: v.array(v.string()),
      notFor: v.array(v.string()),
      firstSteps: v.array(v.object({ title: v.string(), text: v.string() })),
      objections: v.array(v.object({ question: v.string(), answer: v.string() })),
    })),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_community", ["communityId"]),

  communityOwnerApprovals: defineTable({
    communityId: v.id("communities"),
    kind: v.literal("member_experience"),
    requestedByUserId: v.id("users"),
    fromValue: v.string(),
    toValue: v.string(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("declined"), v.literal("expired"), v.literal("replaced"), v.literal("stale")),
    expiresAt: v.number(),
    decidedByUserId: v.optional(v.id("users")),
    decidedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_community_kind_status", ["communityId", "kind", "status"]),

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
    .index("by_domain_user_expiresAt", ["domainId", "userId", "expiresAt"])
    // Signing out of Polynet ends every one of the person's site sessions.
    .index("by_user", ["userId"]),

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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_community", ["communityId"])
    .index("by_community_user", ["communityId", "userId"]),

  // One durable, monotonic position per member and community chat stream.
  // The requested position is always re-authorized and clamped to the
  // server-visible chat head before this projection advances.
  communityReadCursors: defineTable({
    communityId: v.id("communities"),
    channelId: v.id("communityChannels"),
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
    pinned: v.boolean(),
    sortOrder: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_module", ["communityId", "moduleId"])
    .index("by_community_module_sortOrder", ["communityId", "moduleId", "sortOrder"])
    .index("by_community_role_status", ["communityId", "role", "status"])
    .index("by_community_status_createdAt", ["communityId", "status", "createdAt"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_createdBy", ["createdByUserId"]),

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
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_sortOrder", ["communityId", "sortOrder"])
    .index("by_createdBy", ["createdByUserId"]),

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
    // Retired Nov 5 (agent no longer writes community notes): nothing writes
    // or reads it; dropped with the next table-drop release.
    privateSourceSeenAtSeq: v.optional(v.number()),
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
