import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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

  authSessions: defineTable({
    sessionId: v.string(),
    authSubject: v.string(),
    userId: v.id("users"),
    replacedBySessionId: v.optional(v.string()),
    encryptedSecretHex: v.string(),
    secretIvHex: v.string(),
    secretVersion: v.number(),
    accessTokenExpiresAt: v.optional(v.number()),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    lastRefreshAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_authSubject", ["authSubject"])
    .index("by_user", ["userId"]),

  userEntitlements: defineTable({
    userId: v.id("users"),
    tier: v.union(v.literal("free"), v.literal("architect")),
    source: v.union(
      v.literal("default"),
      v.literal("admin_override"),
      v.literal("manual_grant"),
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

  builderPartners: defineTable({
    userId: v.id("users"),
    code: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("disabled"),
    ),
    acceptedTermsAt: v.optional(v.number()),
    acceptedTermsVersion: v.optional(v.string()),
    disabledReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_code", ["code"])
    .index("by_status_createdAt", ["status", "createdAt"]),

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

  partnerAttributions: defineTable({
    attributionKey: v.string(),
    partnerId: v.id("builderPartners"),
    partnerUserId: v.id("users"),
    referralCode: v.string(),
    anonymousVisitorKeyHash: v.optional(v.string()),
    referredUserId: v.optional(v.id("users")),
    firstTouchUrl: v.optional(v.string()),
    lastTouchUrl: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("bound"),
      v.literal("expired"),
      v.literal("voided"),
    ),
    voidReason: v.optional(v.string()),
    referredUserHadOwnedCommunityAtBind: v.optional(v.boolean()),
    eligibleForCommunityRevenue: v.optional(v.boolean()),
    firstTouchAt: v.number(),
    lastTouchAt: v.number(),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_attributionKey", ["attributionKey"])
    .index("by_referralCode_status", ["referralCode", "status"])
    .index("by_partner_status", ["partnerId", "status"])
    .index("by_referredUser", ["referredUserId"])
    .index("by_visitor_hash", ["anonymousVisitorKeyHash"]),

  partnerCommissionLedger: defineTable({
    commissionKey: v.string(),
    partnerId: v.id("builderPartners"),
    partnerUserId: v.id("users"),
    attributionId: v.optional(v.id("partnerAttributions")),
    referredUserId: v.optional(v.id("users")),
    referredCommunityId: v.optional(v.id("communities")),
    basisType: v.union(
      v.literal("community_platform_fee"),
      v.literal("community_revenue"),
      v.literal("paid_tool_usage"),
    ),
    basisAmountUsd: v.number(),
    commissionRateBps: v.number(),
    commissionAmountUsd: v.number(),
    currency: v.string(),
    commissionSettlementCents: v.optional(v.number()),
    adjustmentSettlementCents: v.optional(v.number()),
    reservedSettlementCents: v.optional(v.number()),
    settledSettlementCents: v.optional(v.number()),
    netSettlementCents: v.optional(v.number()),
    openSettlementCents: v.optional(v.number()),
    payoutOpen: v.optional(v.boolean()),
    payoutDebt: v.optional(v.boolean()),
    settlementUpdatedAt: v.optional(v.number()),
    status: v.union(
      v.literal("locked"),
      v.literal("risk_hold"),
      v.literal("payable"),
      v.literal("voided"),
    ),
    sourceCheckoutSessionId: v.optional(v.string()),
    sourceProviderSubscriptionId: v.optional(v.string()),
    sourceProviderInvoiceId: v.optional(v.string()),
    sourceProviderPaymentIntentId: v.optional(v.string()),
    sourceProviderChargeId: v.optional(v.string()),
    holdUntil: v.optional(v.number()),
    payableAt: v.optional(v.number()),
    voidedAt: v.optional(v.number()),
    voidReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_commissionKey", ["commissionKey"])
    .index("by_partner_status", ["partnerId", "status"])
    .index("by_referredUser", ["referredUserId"])
    .index("by_status_holdUntil", ["status", "holdUntil"])
    .index("by_status_payoutOpen_payableAt", ["status", "payoutOpen", "payableAt"])
    .index("by_partner_status_payoutOpen_payableAt", ["partnerId", "status", "payoutOpen", "payableAt"])
    .index("by_partner_status_payoutDebt", ["partnerId", "status", "payoutDebt"])
    .index("by_status_createdAt", ["status", "createdAt"])
    .index("by_checkout_session", ["sourceCheckoutSessionId"])
    .index("by_provider_invoice", ["sourceProviderInvoiceId"])
    .index("by_payment_intent", ["sourceProviderPaymentIntentId"])
    .index("by_charge", ["sourceProviderChargeId"]),

  partnerCommissionAdjustments: defineTable({
    adjustmentKey: v.string(),
    commissionId: v.id("partnerCommissionLedger"),
    partnerId: v.id("builderPartners"),
    partnerUserId: v.id("users"),
    adjustmentType: v.union(
      v.literal("refund"),
      v.literal("dispute_opened"),
      v.literal("dispute_won"),
      v.literal("dispute_lost"),
      v.literal("dispute_funds_reinstated"),
    ),
    amountUsd: v.number(),
    currency: v.string(),
    status: v.union(v.literal("applied"), v.literal("voided")),
    sourceProviderRefundId: v.optional(v.string()),
    sourceProviderDisputeId: v.optional(v.string()),
    sourceProviderChargeId: v.optional(v.string()),
    sourceProviderPaymentIntentId: v.optional(v.string()),
    sourceProviderInvoiceId: v.optional(v.string()),
    reason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_adjustmentKey", ["adjustmentKey"])
    .index("by_commission", ["commissionId"])
    .index("by_partner_createdAt", ["partnerId", "createdAt"])
    .index("by_refund", ["sourceProviderRefundId"])
    .index("by_dispute", ["sourceProviderDisputeId"])
    .index("by_charge", ["sourceProviderChargeId"]),

  partnerPayoutBatches: defineTable({
    batchKey: v.string(),
    cyclePeriod: v.optional(v.string()),
    runNumber: v.optional(v.number()),
    replacesBatchId: v.optional(v.id("partnerPayoutBatches")),
    status: v.union(
      v.literal("pending_approval"),
      v.literal("approved"),
      v.literal("processing"),
      v.literal("paid"),
      v.literal("held"),
      v.literal("rejected"),
      v.literal("failed"),
    ),
    totalAmountUsd: v.number(),
    currency: v.string(),
    partnerCount: v.number(),
    itemCount: v.number(),
    payableCutoffAt: v.optional(v.number()),
    payoutBufferMs: v.optional(v.number()),
    approvedByUserId: v.optional(v.id("users")),
    processedByUserId: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    processedAt: v.optional(v.number()),
    holdReason: v.optional(v.string()),
    rejectReason: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_batchKey", ["batchKey"])
    .index("by_cyclePeriod_runNumber", ["cyclePeriod", "runNumber"])
    .index("by_status_createdAt", ["status", "createdAt"]),

  partnerPayoutTransfers: defineTable({
    batchId: v.id("partnerPayoutBatches"),
    partnerId: v.id("builderPartners"),
    partnerUserId: v.id("users"),
    stripeAccountId: v.string(),
    amountUsd: v.number(),
    currency: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("canceled"),
    ),
    stripeTransferId: v.optional(v.string()),
    idempotencyKey: v.string(),
    failureReason: v.optional(v.string()),
    processedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_batch", ["batchId"])
    .index("by_partner_createdAt", ["partnerId", "createdAt"])
    .index("by_status_createdAt", ["status", "createdAt"])
    .index("by_status_processedAt", ["status", "processedAt"])
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_stripeTransferId", ["stripeTransferId"]),

  partnerPayoutItems: defineTable({
    batchId: v.id("partnerPayoutBatches"),
    transferId: v.id("partnerPayoutTransfers"),
    partnerId: v.id("builderPartners"),
    partnerUserId: v.id("users"),
    commissionId: v.id("partnerCommissionLedger"),
    amountUsd: v.number(),
    currency: v.string(),
    status: v.union(
      v.literal("reserved"),
      v.literal("settled"),
      v.literal("released"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_batch", ["batchId"])
    .index("by_transfer", ["transferId"])
    .index("by_partner_createdAt", ["partnerId", "createdAt"])
    .index("by_commission", ["commissionId"]),

  workspaceCreditBalances: defineTable({
    userId: v.id("users"),
    includedCreditsBalance: v.number(),
    purchasedCreditsBalance: v.number(),
    uncollectedCreditsBalance: v.optional(v.number()),
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
    projectId: v.id("cloudProjects"),
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

  creditLedgerEntries: defineTable({
    creditKey: v.string(),
    userId: v.id("users"),
    communityId: v.optional(v.id("communities")),
    projectId: v.optional(v.id("cloudProjects")),
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
    projectId: v.optional(v.id("cloudProjects")),
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
      v.literal("workspace_credit_topup"),
    ),
    provider: v.optional(v.literal("stripe")),
    providerCheckoutSessionId: v.optional(v.string()),
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
    billingPeriod: v.optional(v.string()),
    pricePointId: v.optional(v.id("communityPricePoints")),
    amountBaseUnits: v.optional(v.number()),
    currency: v.optional(v.string()),
    currencyDecimals: v.optional(v.number()),
    workspaceCreditsAmount: v.optional(v.number()),
    workspaceCreditsGrantedAt: v.optional(v.number()),
    workspaceCreditsUncollectedPaid: v.optional(v.number()),
    ownerUserId: v.optional(v.id("users")),
    claimToken: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("complete"), v.literal("expired")),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_providerCustomerId", ["providerCustomerId"]),

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
    onboardingDirection: v.optional(
      v.union(
        v.literal("build_community"),
        v.literal("discover_community"),
        v.literal("learn_about_polynet"),
      ),
    ),
    onboardingCompletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  emailPreferences: defineTable({
    userId: v.id("users"),
    weeklyDigestEnabled: v.boolean(),
    founderDigestEnabled: v.boolean(),
    eventReminderEnabled: v.boolean(),
    founderAdminEmailsEnabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  emailOutbox: defineTable({
    kind: v.string(),
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

  cloudProjects: defineTable({
    ownerId: v.id("users"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
    providerSandboxId: v.optional(v.string()),
    providerSandboxState: v.optional(v.string()),
    providerSandboxLastSeenAt: v.optional(v.number()),
    providerSandboxLastActivityAt: v.optional(v.number()),
    providerSandboxStartedAt: v.optional(v.number()),
    providerSandboxIdleExpiresAt: v.optional(v.number()),
    providerSandboxCreditReservationKey: v.optional(v.string()),
    providerSandboxCreditBudgetCredits: v.optional(v.number()),
    providerSandboxCreditBudgetExpiresAt: v.optional(v.number()),
    providerVolumeId: v.optional(v.string()),
    providerVolumeName: v.optional(v.string()),
    providerVolumeState: v.optional(v.string()),
    providerVolumeLastSeenAt: v.optional(v.number()),
    importLeaseExpiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"]),

  workspaceTerminalSessions: defineTable({
    ownerId: v.id("users"),
    projectId: v.id("cloudProjects"),
    threadId: v.optional(v.id("threads")),
    // Compatibility tombstone for production rows written before terminal
    // ownership moved to lifecycleOwner + startedByRunId. Active code must not
    // write or read this field.
    runIdStartedBy: v.optional(v.string()),
    lifecycleOwner: v.optional(
      v.literal("project_background"),
    ),
    startedByThreadId: v.optional(v.string()),
    startedByRunId: v.optional(v.string()),
    providerSandboxId: v.string(),
    providerSessionId: v.string(),
    providerCommandId: v.string(),
    command: v.string(),
    cwd: v.optional(v.string()),
    previewPort: v.optional(v.number()),
    previewPath: v.optional(v.string()),
    previewLabel: v.optional(v.string()),
    status: v.union(
      v.literal("starting"),
      v.literal("running"),
      v.literal("exited"),
      v.literal("failed"),
      v.literal("stopped"),
    ),
    startedAt: v.number(),
    updatedAt: v.number(),
    finishedAt: v.optional(v.number()),
    exitCode: v.optional(v.number()),
    completionRecordedAt: v.optional(v.number()),
    completionReason: v.optional(
      v.union(
        v.literal("exited"),
        v.literal("failed"),
        v.literal("stopped"),
        v.literal("sandbox_missing"),
        v.literal("session_missing"),
        v.literal("command_missing"),
        v.literal("preflight_failed"),
      ),
    ),
    lastOutputTail: v.optional(v.string()),
    lastHeartbeatAt: v.optional(v.number()),
    healthStatus: v.optional(
      v.union(
        v.literal("unknown"),
        v.literal("starting"),
        v.literal("healthy"),
        v.literal("unhealthy"),
        v.literal("exited"),
        v.literal("stale"),
      ),
    ),
    healthSummary: v.optional(v.string()),
    previewStatus: v.optional(
      v.union(
        v.literal("none"),
        v.literal("starting"),
        v.literal("running"),
        v.literal("blank"),
        v.literal("render_error_suspected"),
        v.literal("unreachable"),
        v.literal("server_exited"),
      ),
    ),
    lastPreviewProbeAt: v.optional(v.number()),
    lastPreviewProbeSummary: v.optional(v.string()),
    lastBrowserObservationAt: v.optional(v.number()),
    lastBrowserObservationSummary: v.optional(v.string()),
    previewTransportStatus: v.optional(
      v.union(
        v.literal("not_started"),
        v.literal("loading"),
        v.literal("loaded"),
        v.literal("failed"),
      ),
    ),
    previewInspectionStatus: v.optional(
      v.union(
        v.literal("not_attempted"),
        v.literal("same_origin_dom"),
        v.literal("cross_origin_uninspectable"),
        v.literal("dom_unavailable"),
      ),
    ),
    previewRenderStatus: v.optional(
      v.union(
        v.literal("unknown"),
        v.literal("visible_content"),
        v.literal("blank_suspected"),
        v.literal("transport_error"),
      ),
    ),
  })
    .index("by_owner_project", ["ownerId", "projectId"])
    .index("by_providerSessionId", ["providerSessionId"])
    .index("by_providerSandboxId", ["providerSandboxId"]),

  communities: defineTable({
    ownerId: v.id("users"),
    slug: v.string(),
    name: v.string(),
    oneLiner: v.optional(v.string()),
    about: v.optional(v.string()),
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
    memberOnboarding: v.optional(
      v.object({
        enabled: v.boolean(),
        title: v.string(),
        description: v.string(),
        videoUrl: v.optional(v.union(v.string(), v.null())),
        thumbnailUrl: v.optional(v.union(v.string(), v.null())),
        primaryAction: v.union(
          v.literal("introduce"),
          v.literal("ask_agent"),
          v.literal("view_resources"),
          v.literal("start_workflow"),
        ),
        aiGuidePrompt: v.string(),
        updatedAt: v.optional(v.number()),
        updatedByUserId: v.optional(v.id("users")),
      }),
    ),
    visibility: v.union(v.literal("published"), v.literal("unlisted")),
    entryPolicy: v.union(
      v.literal("open"),
      v.literal("approval"),
      v.literal("paid_subscription"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_slug", ["slug"])
    .index("by_visibility_updatedAt", ["visibility", "updatedAt"]),

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
    active: v.optional(v.boolean()),
    revokedAt: v.optional(v.number()),
    revokedReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_community", ["communityId"])
    .index("by_community_user", ["communityId", "userId"])
    .index("by_community_createdAt", ["communityId", "createdAt"]),

  communityPresence: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    lastSeenAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community_lastSeenAt", ["communityId", "lastSeenAt"])
    .index("by_community_user", ["communityId", "userId"])
    .index("by_user", ["userId"]),

  communityJoinRequests: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    status: v.string(),
    message: v.optional(v.string()),
    deniedAt: v.optional(v.number()),
    reapplyAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_community", ["communityId"])
    .index("by_community_user", ["communityId", "userId"]),

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
    heroMediaUrl: v.optional(v.string()),
    heroMediaKind: v.optional(v.union(v.literal("image"), v.literal("video"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_community", ["communityId"]),

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
    .index("by_status", ["status"])
    .index("by_community_status", ["communityId", "status"]),

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

  communityTypingPresence: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    displayUntil: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_user", ["userId"])
    .index("by_community_user", ["communityId", "userId"])
    .index("by_community_displayUntil", ["communityId", "displayUntil"]),

  communityAgentConfigs: defineTable({
    communityId: v.id("communities"),
    landingJson: v.optional(v.any()),
    systemPrompt: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_community", ["communityId"]),

  communityAgentRuns: defineTable({
    communityId: v.id("communities"),
    agentKey: v.string(),
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
      pendingStandard: v.number(),
      pendingStrong: v.number(),
      pendingCritical: v.number(),
      oldestPendingAt: v.optional(v.string()),
      hasMorePending: v.boolean(),
      countsAreLowerBound: v.boolean(),
    })),
    stopReason: v.optional(v.string()),
    toolStepCount: v.number(),
    candidateProposalIds: v.array(v.string()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_community_status_createdAt", ["communityId", "status", "createdAt"])
    .index("by_sponsor_createdAt", ["sponsorUserId", "createdAt"]),

  communityWorkflowImportDrafts: defineTable({
    communityId: v.id("communities"),
    builderUserId: v.id("users"),
    sourceHarness: v.string(),
    sourceKind: v.optional(
      v.union(v.literal("pasted_output"), v.literal("workflow_export_zip")),
    ),
    status: v.union(
      v.literal("working"),
      v.literal("ready_for_review"),
      v.literal("applied"),
      v.literal("failed"),
    ),
    rawHarnessOutput: v.string(),
    currentLedgerJson: v.optional(v.any()),
    errorMessage: v.optional(v.string()),
    packageFilename: v.optional(v.string()),
    packageSha256: v.optional(v.string()),
    packageByteCount: v.optional(v.number()),
    packageSummary: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_builder", ["builderUserId"])
    .index("by_community_status", ["communityId", "status"])
    .index("by_builder_createdAt", ["builderUserId", "createdAt"]),

  communityWorkflowImportEvents: defineTable({
    draftId: v.id("communityWorkflowImportDrafts"),
    communityId: v.id("communities"),
    builderUserId: v.id("users"),
    seq: v.number(),
    eventType: v.string(),
    payload: v.any(),
    createdAt: v.number(),
  })
    .index("by_draft_seq", ["draftId", "seq"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_builder_createdAt", ["builderUserId", "createdAt"]),

  developerApps: defineTable({
    ownerUserId: v.id("users"),
    catalogAppId: v.optional(v.string()),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    endpointUrl: v.string(),
    authType: v.union(
      v.literal("api_key"),
      v.literal("bearer"),
      v.literal("none"),
      v.literal("oauth"),
    ),
    status: v.union(
      v.literal("draft"),
      v.literal("valid"),
      v.literal("invalid"),
    ),
    activeSnapshotId: v.optional(v.id("appToolSnapshots")),
    lastValidatedAt: v.optional(v.number()),
    lastValidationError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerUserId"])
    .index("by_owner_catalogAppId", ["ownerUserId", "catalogAppId"])
    .index("by_owner_slug", ["ownerUserId", "slug"])
    .index("by_owner_status", ["ownerUserId", "status"]),

  appConnections: defineTable({
    developerAppId: v.id("developerApps"),
    authKind: v.optional(v.union(v.literal("secret"), v.literal("oauth_tokens"))),
    connectionStatus: v.union(v.literal("connected"), v.literal("error")),
    encryptedSecretHex: v.optional(v.string()),
    secretIvHex: v.optional(v.string()),
    secretVersion: v.optional(v.number()),
    lastValidatedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_app", ["developerAppId"]),

  appOAuthStates: defineTable({
    userId: v.id("users"),
    catalogAppId: v.string(),
    state: v.string(),
    codeVerifier: v.string(),
    redirectUri: v.string(),
    returnToPath: v.string(),
    endpointUrl: v.string(),
    clientId: v.string(),
    clientSecretEncryptedHex: v.optional(v.string()),
    clientSecretIvHex: v.optional(v.string()),
    clientSecretVersion: v.optional(v.number()),
    authorizationEndpoint: v.string(),
    tokenEndpoint: v.string(),
    resource: v.string(),
    issuer: v.optional(v.string()),
    scope: v.optional(v.string()),
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
    .index("by_user_catalogAppId", ["userId", "catalogAppId"]),

  appToolSnapshots: defineTable({
    developerAppId: v.id("developerApps"),
    snapshotVersion: v.string(),
    endpointUrl: v.string(),
    validationStatus: v.union(v.literal("ok"), v.literal("error")),
    validationError: v.optional(v.string()),
    toolsJson: v.any(),
    fetchedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_app", ["developerAppId"])
    .index("by_app_fetchedAt", ["developerAppId", "fetchedAt"]),

  communityAppMounts: defineTable({
    communityId: v.id("communities"),
    developerAppId: v.id("developerApps"),
    toolSnapshotId: v.optional(v.id("appToolSnapshots")),
    mountedByUserId: v.id("users"),
    enabled: v.boolean(),
    enabledTools: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_app", ["communityId", "developerAppId"])
    .index("by_app", ["developerAppId"]),

  userPlatformAppMounts: defineTable({
    userId: v.id("users"),
    developerAppId: v.id("developerApps"),
    toolSnapshotId: v.optional(v.id("appToolSnapshots")),
    enabled: v.boolean(),
    enabledTools: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_app", ["userId", "developerAppId"])
    .index("by_app", ["developerAppId"]),

  userPlatformAppMountSources: defineTable({
    userId: v.id("users"),
    userPlatformAppMountId: v.id("userPlatformAppMounts"),
    sourceType: v.union(v.literal("personal"), v.literal("community")),
    sourceKey: v.string(),
    communityId: v.optional(v.id("communities")),
    communityAppMountId: v.optional(v.id("communityAppMounts")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_mount", ["userId", "userPlatformAppMountId"])
    .index("by_user_sourceKey", ["userId", "sourceKey"])
    .index("by_community_mount", ["communityAppMountId"]),

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
    aiFeedLastSeenAt: v.optional(v.number()),
    resourcesLastSeenAt: v.optional(v.number()),
    eventsLastSeenAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_community", ["communityId"])
    .index("by_community_user", ["communityId", "userId"]),

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
    url: v.optional(v.string()),
    fileKey: v.optional(v.string()),
    pinned: v.boolean(),
    sortOrder: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_module", ["communityId", "moduleId"])
    .index("by_community_role_status", ["communityId", "role", "status"])
    .index("by_community_status_createdAt", ["communityId", "status", "createdAt"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_createdBy", ["createdByUserId"]),

  communityResourceModules: defineTable({
    communityId: v.id("communities"),
    createdByUserId: v.id("users"),
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
    .index("by_community_status_recurrenceFrequency_startsAt", ["communityId", "status", "recurrenceFrequency", "startsAt"])
    .index("by_community_status_updatedAt", ["communityId", "status", "updatedAt"])
    .index("by_status_startsAt", ["status", "startsAt"])
    .index("by_status_recurrenceFrequency_startsAt", ["status", "recurrenceFrequency", "startsAt"])
    .index("by_createdBy", ["createdByUserId"]),

  communityArchiveDocuments: defineTable({
    communityId: v.id("communities"),
    sourceType: v.union(v.literal("chat"), v.literal("ai_feed"), v.literal("resource")),
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
    sourceType: v.union(
      v.literal("chat"),
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
    compilerState: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("compiled"),
        v.literal("dismissed_low_signal"),
        v.literal("carried_forward"),
        v.literal("excluded_by_visibility"),
      ),
    ),
    compilerPendingSince: v.optional(v.number()),
    compilerLastHandledAt: v.optional(v.number()),
    compilerLastDigestId: v.optional(v.id("communityCompilerDigests")),
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
    .index("by_community_source", ["communityId", "sourceType", "sourceId"])
    .index("by_community_workflow", ["communityId", "workflowId"]),

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
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_type", ["communityId", "type"])
    .index("by_community_status", ["communityId", "status"])
    .index("by_community_type_status", ["communityId", "type", "status"])
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
    .index("by_community_status", ["communityId", "status"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_community_type_status", ["communityId", "operation", "status"])
    .index("by_primaryTargetNode", ["primaryTargetNodeId"])
    .index("by_primaryTargetEdge", ["primaryTargetEdgeId"]),

  communityIntelligenceRetrievalLogs: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    workflowId: v.optional(v.string()),
    query: v.optional(v.string()),
    retrievedNodeIds: v.array(v.id("communityIntelligenceNodes")),
    injectedNodeIds: v.array(v.id("communityIntelligenceNodes")),
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

  communityCompilerDigests: defineTable({
    communityId: v.id("communities"),
    dedupeKey: v.string(),
    windowStartedAt: v.number(),
    windowEndedAt: v.number(),
    summary: v.string(),
    itemCount: v.number(),
    items: v.array(
      v.object({
        category: v.union(
          v.literal("chat_activity"),
          v.literal("ai_feed_signal"),
          v.literal("resource_activity"),
          v.literal("event_activity"),
          v.literal("member_state"),
          v.literal("outcome_signal"),
          v.literal("source_trace_signal"),
          v.literal("pending_directory_decision"),
        ),
        title: v.string(),
        summary: v.string(),
        priority: v.number(),
        confidence: v.number(),
        sourceTypes: v.array(v.string()),
        sourceIds: v.array(v.string()),
        sourceTraceIds: v.array(v.id("communitySourceTraces")),
      }),
    ),
    signalCounts: v.object({
      chat: v.number(),
      aiFeed: v.number(),
      resources: v.number(),
      events: v.number(),
      sourceTraces: v.number(),
      outcomes: v.number(),
      pendingChangeRequests: v.number(),
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
    .index("by_community_dedupeKey", ["communityId", "dedupeKey"]),

  threads: defineTable({
    ownerId: v.id("users"),
    threadKey: v.optional(v.string()),
    title: v.optional(v.string()),
    titleSource: v.union(v.literal("auto"), v.literal("manual")),
    projectId: v.optional(v.id("cloudProjects")),
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
    .index("by_owner_threadKey", ["ownerId", "threadKey"])
    .index("by_project", ["projectId"]),

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

  runtimeRuns: defineTable({
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    runId: v.string(),
    lane: v.string(),
    visibility: v.optional(v.union(v.literal("user_visible"), v.literal("internal_hidden"))),
    internalFollowupKind: v.optional(v.string()),
    projectId: v.optional(v.id("cloudProjects")),
    communityId: v.optional(v.id("communities")),
    communityContextVersion: v.optional(v.number()),
    modelId: v.optional(v.string()),
    engineId: v.optional(v.string()),
    executionMode: v.optional(v.string()),
    sandboxMode: v.optional(v.string()),
    contractName: v.optional(v.string()),
    contractVersion: v.optional(v.string()),
    harnessProfile: v.optional(v.string()),
    harnessProfileSource: v.optional(v.string()),
    capabilityFamilies: v.optional(v.array(v.string())),
    workspaceSessionState: v.optional(v.string()),
    runtimeHarnessTelemetrySummary: v.optional(v.any()),
    workspaceProviderSandboxId: v.optional(v.string()),
    workspaceToolboxProxyUrl: v.optional(v.string()),
    workspaceSessionRegion: v.optional(v.string()),
    workspaceSessionUpdatedAt: v.optional(v.number()),
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
    .index("by_status_startedAt", ["status", "startedAt"]),

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
