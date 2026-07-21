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
    .index("by_normalizedHandle", ["normalizedHandle"]),

  authSessions: defineTable({
    sessionTokenHash: v.string(),
    userId: v.id("users"),
    encryptedSecretHex: v.string(),
    secretIvHex: v.string(),
    secretVersion: v.number(),
    expiresAt: v.number(),
    refreshLeaseId: v.optional(v.string()),
    refreshLeaseExpiresAt: v.optional(v.number()),
    secretRevision: v.number(),
    revokedAt: v.optional(v.number()),
    purgeAfterAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_sessionTokenHash", ["sessionTokenHash"])
    .index("by_user", ["userId"])
    .index("by_purgeAfterAt", ["purgeAfterAt"]),

  userEntitlements: defineTable({
    userId: v.id("users"),
    tier: v.union(v.literal("free"), v.literal("architect")),
    source: v.union(
      v.literal("admin_override"),
      v.literal("premium_subscription"),
    ),
    startsAt: v.number(),
    endsAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_source", ["userId", "source"]),

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
    economicPolicyVersion: v.optional(v.string()),
    boundAt: v.optional(v.number()),
    commissionEligibleUntil: v.optional(v.number()),
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
    economicPolicyVersion: v.optional(v.string()),
    basisDefinition: v.optional(v.string()),
    policyRateBps: v.optional(v.number()),
    platformFeeBps: v.optional(v.number()),
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
    pendingCardCollectionCreditsBalance: v.optional(v.number()),
    includedCycleCredits: v.number(),
    includedCycleStartedAt: v.number(),
    includedCycleEndsAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_updatedAt", ["updatedAt"]),

  workspaceAutoRechargeSettings: defineTable({
    userId: v.id("users"),
    enabled: v.boolean(),
    status: v.union(
      v.literal("active"),
      v.literal("paused_payment_failed"),
      v.literal("disabled"),
    ),
    thresholdCredits: v.number(),
    restoreToCredits: v.number(),
    monthlyLimitCredits: v.optional(v.number()),
    currency: v.literal("usd"),
    lastTriggeredAt: v.optional(v.number()),
    lastSucceededAt: v.optional(v.number()),
    lastFailureAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_status_updatedAt", ["status", "updatedAt"]),

  workspaceAutoRechargeAttempts: defineTable({
    attemptKey: v.string(),
    userId: v.id("users"),
    status: v.union(
      v.literal("prepared"),
      v.literal("processing"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("released"),
    ),
    monthKey: v.string(),
    sequence: v.number(),
    rechargeCredits: v.number(),
    amountCents: v.number(),
    currency: v.literal("usd"),
    thresholdCredits: v.number(),
    restoreToCredits: v.number(),
    monthlyLimitCredits: v.optional(v.number()),
    spendableCreditsBalance: v.number(),
    uncollectedCreditsBalance: v.number(),
    pendingCardCollectionCreditsBalance: v.number(),
    provider: v.optional(v.string()),
    providerCustomerId: v.optional(v.string()),
    providerPaymentMethodId: v.optional(v.string()),
    providerPaymentId: v.optional(v.string()),
    providerIdempotencyKey: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_attemptKey", ["attemptKey"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_monthKey", ["userId", "monthKey"])
    .index("by_status_updatedAt", ["status", "updatedAt"]),

  workspaceComputeCharges: defineTable({
    chargeKey: v.string(),
    userId: v.id("users"),
    projectId: v.optional(v.id("cloudProjects")),
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
    projectId: v.optional(v.id("cloudProjects")),
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
    .index("by_project_period", ["projectId", "periodStart"])
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
    .index("by_status_settledAt", ["status", "settledAt"])
    .index("by_status_expiresAt", ["status", "expiresAt"])
    .index("by_pendingSettlementStatus_nextAttemptAt", ["pendingSettlementStatus", "pendingSettlementNextAttemptAt"]),

  workspaceDirectorySnapshots: defineTable({
    projectId: v.id("cloudProjects"),
    ownerId: v.id("users"),
    path: v.string(),
    providerId: v.optional(v.literal("blaxel")),
    providerSandboxId: v.optional(v.string()),
    entries: v.array(v.object({
      name: v.string(),
      path: v.string(),
      type: v.union(v.literal("directory"), v.literal("file")),
      extension: v.union(v.string(), v.null()),
      heavy: v.boolean(),
      previewable: v.boolean(),
    })),
    truncated: v.boolean(),
    checkedAt: v.number(),
    staleAt: v.optional(v.number()),
    staleReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project_path", ["projectId", "path"])
    .index("by_project_updatedAt", ["projectId", "updatedAt"]),

  workspaceFilePreviewSnapshots: defineTable({
    projectId: v.id("cloudProjects"),
    ownerId: v.id("users"),
    path: v.string(),
    providerId: v.optional(v.literal("blaxel")),
    providerSandboxId: v.optional(v.string()),
    name: v.string(),
    type: v.union(v.literal("file"), v.literal("directory"), v.literal("other")),
    previewKind: v.union(v.literal("text"), v.literal("directory"), v.literal("unsupported")),
    sizeBytes: v.optional(v.union(v.number(), v.null())),
    mimeType: v.optional(v.union(v.string(), v.null())),
    text: v.optional(v.string()),
    truncated: v.optional(v.boolean()),
    reason: v.optional(v.string()),
    checkedAt: v.number(),
    staleAt: v.optional(v.number()),
    staleReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project_path", ["projectId", "path"])
    .index("by_project_updatedAt", ["projectId", "updatedAt"]),

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
      v.literal("premium_subscription"),
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
    settledRevenueBaseUnits: v.optional(v.number()),
    currency: v.optional(v.string()),
    currencyDecimals: v.optional(v.number()),
    platformFeeBps: v.optional(v.number()),
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
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  /* Deprecated release-compatibility table. Current product code never writes
     this table; legacy rows are removed by legacyOnboardingMigration. */
  agentLifecycleActivations: defineTable({
    userId: v.id("users"),
    trigger: v.literal("onboarding_completed"),
    scopeType: v.union(
      v.literal("user"),
      v.literal("community"),
      v.literal("project"),
    ),
    scopeKey: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    activationRoute: v.literal("lifecycle_trigger"),
    activationReason: v.string(),
    source: v.string(),
    threadId: v.optional(v.id("threads")),
    runId: v.optional(v.string()),
    error: v.optional(v.string()),
    processingAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_trigger_scope", [
      "userId",
      "trigger",
      "scopeType",
      "scopeKey",
    ])
    .index("by_status_createdAt", ["status", "createdAt"])
    .index("by_user_status_updatedAt", ["userId", "status", "updatedAt"]),

  emailPreferences: defineTable({
    userId: v.id("users"),
    weeklyDigestEnabled: v.boolean(),
    founderDigestEnabled: v.boolean(),
    eventReminderEnabled: v.boolean(),
    // Mention ping emails; absent means enabled.
    mentionEmailsEnabled: v.optional(v.boolean()),
    // Direct message emails; absent means enabled.
    dmEmailsEnabled: v.optional(v.boolean()),
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

  cloudProjects: defineTable({
    ownerId: v.id("users"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    instructions: v.optional(v.string()),
    contextLinks: v.optional(v.array(v.object({
      title: v.optional(v.string()),
      url: v.string(),
    }))),
    status: v.optional(v.string()),
    providerSandboxId: v.optional(v.string()),
    providerSandboxProviderId: v.optional(
      v.literal("blaxel"),
    ),
    providerSandboxState: v.optional(v.string()),
    providerSandboxLastSeenAt: v.optional(v.number()),
    providerSandboxLastActivityAt: v.optional(v.number()),
    providerSandboxStartedAt: v.optional(v.number()),
    providerSandboxIdleExpiresAt: v.optional(v.number()),
    providerSandboxCreditReservationKey: v.optional(v.string()),
    providerSandboxCreditBudgetCredits: v.optional(v.number()),
    providerSandboxCreditBudgetExpiresAt: v.optional(v.number()),
    providerVolumeId: v.optional(v.string()),
    providerVolumeProviderId: v.optional(
      v.literal("blaxel"),
    ),
    providerVolumeName: v.optional(v.string()),
    providerVolumeState: v.optional(v.string()),
    providerVolumeLastSeenAt: v.optional(v.number()),
    workspaceVolumeRetentionState: v.optional(
      v.union(
        v.literal("active"),
        v.literal("suspended"),
        v.literal("pending_delete"),
        v.literal("deleted"),
      ),
    ),
    workspaceVolumeRetainUntil: v.optional(v.number()),
    workspaceVolumeDeleteAfter: v.optional(v.number()),
    workspaceVolumeDeletionWarningSentAt: v.optional(v.number()),
    workspaceVolumeDeletedAt: v.optional(v.number()),
    workspaceVolumeDeletionReason: v.optional(v.string()),
    workspaceDirectorySnapshotInvalidatedAt: v.optional(v.number()),
    workspaceDirectorySnapshotInvalidationReason: v.optional(v.string()),
    importLeaseExpiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_providerVolumeProviderId_updatedAt", [
      "providerVolumeProviderId",
      "updatedAt",
    ])
    .index("by_sandboxProvider_creditBudgetExpiresAt", [
      "providerSandboxProviderId",
      "providerSandboxCreditBudgetExpiresAt",
    ])
    .index("by_workspaceVolumeRetentionState_deleteAfter", [
      "workspaceVolumeRetentionState",
      "workspaceVolumeDeleteAfter",
    ]),

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
    providerSandboxProviderId: v.optional(
      v.literal("blaxel"),
    ),
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
    /* Deprecated release-compatibility field. Current product code never reads
       or writes it; legacyOnboardingMigration removes stored values. */
    memberOnboarding: v.optional(
      v.object({
        enabled: v.boolean(),
        title: v.string(),
        description: v.string(),
        videoUrl: v.optional(v.union(v.string(), v.null())),
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
    activeMemberCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_createdAt", ["ownerId", "createdAt"])
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
    active: v.boolean(),
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
    .index("by_community_createdAt", ["communityId", "createdAt"]),

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
    status: v.union(v.literal("pending"), v.literal("denied")),
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
    platformFeeBps: v.optional(v.number()),
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
    .index("by_community_displayUntil", ["communityId", "displayUntil"]),

  communityInteractionRoots: defineTable({
    communityId: v.id("communities"),
    actorType: v.union(
      v.literal("human"),
      v.literal("personal_agent"),
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
    pinnedAt: v.optional(v.number()),
    lockedAt: v.optional(v.number()),
    hiddenAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    editedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_community_updatedAt", ["communityId", "updatedAt"])
    .index("by_community_status_createdAt", ["communityId", "status", "createdAt"])
    .index("by_community_kind_status_createdAt", ["communityId", "kind", "status", "createdAt"])
    .index("by_community_idempotencyKey", ["communityId", "idempotencyKey"])
    .index("by_actorUser", ["actorUserId"])
    .index("by_actorAgent", ["actorAgentKey"]),

  communityInteractionReplies: defineTable({
    communityId: v.id("communities"),
    rootId: v.id("communityInteractionRoots"),
    seq: v.number(),
    actorType: v.union(
      v.literal("human"),
      v.literal("personal_agent"),
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
    hiddenAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    editedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_root_seq", ["rootId", "seq"])
    .index("by_root_createdAt", ["rootId", "createdAt"])
    .index("by_root_status_createdAt", ["rootId", "status", "createdAt"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_community_status_createdAt", ["communityId", "status", "createdAt"])
    .index("by_community_idempotencyKey", ["communityId", "idempotencyKey"])
    .index("by_targetReply", ["targetReplyId"])
    .index("by_actorUser", ["actorUserId"])
    .index("by_actorAgent", ["actorAgentKey"]),

  communityInteractionAttachments: defineTable({
    communityId: v.id("communities"),
    rootId: v.optional(v.id("communityInteractionRoots")),
    replyId: v.optional(v.id("communityInteractionReplies")),
    attachmentKind: v.union(v.literal("image"), v.literal("video"), v.literal("file")),
    status: v.union(
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
      v.literal("personal_agent"),
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
        v.literal("personal_agent"),
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
    rootId: v.optional(v.id("communityInteractionRoots")),
    replyId: v.optional(v.id("communityInteractionReplies")),
    sourceBroadcastId: v.optional(v.id("communityMentionBroadcasts")),
    mentionKind: v.union(
      v.literal("user"),
      v.literal("personal_agent"),
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
    .index("by_notifyState_createdAt", ["notifyState", "createdAt"])
    .index("by_mentionKind_notifyState_createdAt", ["mentionKind", "notifyState", "createdAt"])
    .index("by_mentionedAgent_createdAt", ["mentionedAgentKey", "createdAt"])
    .index("by_mentionedRole_createdAt", ["mentionedRoleKey", "createdAt"])
    .index("by_sourceBroadcast", ["sourceBroadcastId"])
    .index("by_sourceBroadcast_user", ["sourceBroadcastId", "mentionedUserId"]),

  communityMentionBroadcasts: defineTable({
    communityId: v.id("communities"),
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
    .index("by_status_updatedAt", ["status", "updatedAt"])
    .index("by_sourceMention", ["sourceMentionId"])
    .index("by_sourceRoot", ["sourceRootId"])
    .index("by_sourceReply", ["sourceReplyId"])
    .index("by_cleanupState_updatedAt", ["cleanupState", "updatedAt"])
    .index("by_community_role_emailMode_createdAt", ["communityId", "roleKey", "emailMode", "createdAt"]),

  communityAgentServeRequests: defineTable({
    communityId: v.id("communities"),
    agentKey: v.string(),
    sourceMentionId: v.id("communityInteractionMentions"),
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
      v.literal("requester_connection_missing"),
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
    createdAt: v.number(),
    updatedAt: v.number(),
    respondedAt: v.optional(v.number()),
  })
    .index("by_sourceMention", ["sourceMentionId"])
    .index("by_status_createdAt", ["status", "createdAt"])
    .index("by_community_createdAt", ["communityId", "createdAt"])
    .index("by_sourceRoot_createdAt", ["sourceRootId", "createdAt"])
    .index("by_requester_createdAt", ["requesterUserId", "createdAt"])
    .index("by_requester_community_createdAt", ["requesterUserId", "communityId", "createdAt"]),

  communityInteractionReactions: defineTable({
    communityId: v.id("communities"),
    targetType: v.union(v.literal("root"), v.literal("reply")),
    rootId: v.optional(v.id("communityInteractionRoots")),
    replyId: v.optional(v.id("communityInteractionReplies")),
    actorType: v.union(
      v.literal("human"),
      v.literal("personal_agent"),
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
      v.literal("personal_agent"),
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
    // Owner off-switch for the memory agent. Absent means enabled: the memory
    // system is on by default wherever the owner has a usable connection.
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
      v.literal("system_prompt"),
      v.literal("wake_context"),
      v.literal("reasoning"),
      v.literal("assistant"),
      v.literal("tool_call"),
      v.literal("tool_result"),
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
    setupStatus: v.optional(
      v.union(
        v.literal("needs_auth"),
        v.literal("needs_config"),
        v.literal("needs_runtime"),
      ),
    ),
    setupReason: v.optional(v.string()),
    mcpRegistryId: v.optional(v.string()),
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
    sourceType: v.optional(v.union(v.literal("personal"), v.literal("community"))),
    communityId: v.optional(v.id("communities")),
    communityAppMountId: v.optional(v.id("communityAppMounts")),
    mcpRegistryId: v.optional(v.string()),
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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_module", ["communityId", "moduleId"])
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
      v.literal("external_mcp"),
      v.literal("community_concierge"),
    ),
    capability: v.union(
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
      ),
    ),
    agentAttemptCount: v.optional(v.number()),
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
    ]),

  memberAgentChannels: defineTable({
    ownerId: v.id("users"),
    scopeKey: v.optional(v.literal("global")),
    communityId: v.optional(v.id("communities")),
    activeEpisodeId: v.optional(v.id("memberAgentEpisodes")),
    communityNameSnapshot: v.optional(v.string()),
    communityDeletedAt: v.optional(v.number()),
    nextOrdinal: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_scope", ["ownerId", "scopeKey"])
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
    projectId: v.optional(v.id("cloudProjects")),
    communityId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    runtimeEngine: v.optional(v.union(v.literal("polynet"), v.literal("codex"))),
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

  polynetCodexWorkerCapacityLeases: defineTable({
    runId: v.string(),
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    projectId: v.optional(v.id("cloudProjects")),
    status: v.union(
      v.literal("active"),
      v.literal("released"),
      v.literal("expired"),
    ),
    acquiredAt: v.number(),
    expiresAt: v.number(),
    releasedAt: v.optional(v.number()),
    releaseReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_runId", ["runId"])
    .index("by_owner_runId", ["ownerId", "runId"])
    .index("by_status_expiresAt", ["status", "expiresAt"])
    .index("by_owner_status_expiresAt", ["ownerId", "status", "expiresAt"])
    .index("by_project_status_expiresAt", ["projectId", "status", "expiresAt"]),

  daytonaCodexRuntimeTargets: defineTable({
    ownerId: v.id("users"),
    threadId: v.id("threads"),
    projectId: v.optional(v.id("cloudProjects")),
    runId: v.string(),
    scope: v.union(v.literal("run"), v.literal("thread"), v.literal("project")),
    provider: v.literal("daytona"),
    sandboxId: v.optional(v.string()),
    sandboxName: v.optional(v.string()),
    sandboxState: v.optional(v.string()),
    workerState: v.union(
      v.literal("creating"),
      v.literal("starting"),
      v.literal("ready"),
      v.literal("error"),
      v.literal("released"),
    ),
    workspaceRoot: v.optional(v.string()),
    workerPort: v.number(),
    workerUrl: v.optional(v.string()),
    workerAuthMode: v.optional(v.string()),
    signedPreviewExpiresAt: v.optional(v.number()),
    snapshotId: v.optional(v.string()),
    targetRegion: v.optional(v.string()),
    leaseRunId: v.optional(v.string()),
    lifecycleMode: v.optional(
      v.union(
        v.literal("prepared_staging_reuse"),
        v.literal("thread_ephemeral"),
        v.literal("per_turn_ephemeral"),
      ),
    ),
    providerEphemeral: v.optional(v.boolean()),
    autoStopMinutes: v.optional(v.number()),
    autoArchiveMinutes: v.optional(v.number()),
    autoDeleteMinutes: v.optional(v.number()),
    sandboxCpu: v.optional(v.number()),
    sandboxMemoryGiB: v.optional(v.number()),
    sandboxDiskGiB: v.optional(v.number()),
    billingCreditKey: v.optional(v.string()),
    billingReservedCredits: v.optional(v.number()),
    billingIntervalStartedAt: v.optional(v.number()),
    billingIntervalClosedAt: v.optional(v.number()),
    billingIntervalSequence: v.optional(v.number()),
    billingIntervalStartReason: v.optional(v.string()),
    billingIntervalCloseReason: v.optional(v.string()),
    billingIntervalResourceSource: v.optional(v.string()),
    billingSettlementState: v.optional(v.string()),
    billingSettlementReason: v.optional(v.string()),
    billingSettlementAttemptCount: v.optional(v.number()),
    billingSettlementCredits: v.optional(v.number()),
    billingSettlementRawVendorCostUsd: v.optional(v.number()),
    billingSettlementProviderCostKey: v.optional(v.string()),
    billingSettlementCreditReservationKey: v.optional(v.string()),
    billingSettlementCreditsDebited: v.optional(v.number()),
    billingSettlementDurationSeconds: v.optional(v.number()),
    billingSettlementMeasuredDurationSeconds: v.optional(v.number()),
    billingSettlementProviderStandbyGraceSeconds: v.optional(v.number()),
    billingSettlementErrorCode: v.optional(v.string()),
    billingSettlementErrorMessage: v.optional(v.string()),
    billingSettlementUpdatedAt: v.optional(v.number()),
    providerTeardownState: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("skipped"),
        v.literal("stopped"),
        v.literal("deleted"),
        v.literal("failed"),
      ),
    ),
    providerTeardownReason: v.optional(v.string()),
    providerTeardownAt: v.optional(v.number()),
    providerTeardownErrorCode: v.optional(v.string()),
    providerTeardownErrorMessage: v.optional(v.string()),
    workspaceChangeState: v.optional(
      v.union(
        v.literal("unknown"),
        v.literal("clean"),
        v.literal("dirty"),
        v.literal("scan_failed"),
      ),
    ),
    workspaceRetentionState: v.optional(
      v.union(
        v.literal("none"),
        v.literal("human_save_pending"),
        v.literal("discarded"),
        v.literal("saved"),
        v.literal("expired"),
      ),
    ),
    workspaceRetentionExpiresAt: v.optional(v.number()),
    workspaceMeaningfulFileCount: v.optional(v.number()),
    workspaceMeaningfulFilePreview: v.optional(v.array(v.string())),
    lastWorkspaceScanAt: v.optional(v.number()),
    activePreviewPorts: v.optional(v.array(v.number())),
    previewLeaseState: v.optional(
      v.union(
        v.literal("none"),
        v.literal("active"),
        v.literal("released"),
        v.literal("expired"),
      ),
    ),
    previewLeaseExpiresAt: v.optional(v.number()),
    cleanupDecision: v.optional(
      v.union(
        v.literal("delete_clean_workspace"),
        v.literal("delete_without_active_lease"),
        v.literal("stop_for_human_save"),
        v.literal("keep_running_active_preview"),
        v.literal("keep_thread_ephemeral_reuse"),
        v.literal("skip_prepared_staging_reuse"),
        v.literal("retain_scan_failed"),
        v.literal("delete_expired_retention"),
        v.literal("cleanup_failed"),
      ),
    ),
    cleanupEligibleAt: v.optional(v.number()),
    lastHealthAt: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
    releasedAt: v.optional(v.number()),
    releaseReason: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_runId", ["ownerId", "runId"])
    .index("by_runId", ["runId"])
    .index("by_owner_threadId", ["ownerId", "threadId"])
    .index("by_workerState_updatedAt", ["workerState", "updatedAt"])
    .index("by_sandboxId", ["sandboxId"])
    .index("by_workspaceRetentionState_expiresAt", [
      "workspaceRetentionState",
      "workspaceRetentionExpiresAt",
    ])
    .index("by_previewLeaseState_expiresAt", [
      "previewLeaseState",
      "previewLeaseExpiresAt",
    ])
    .index("by_owner_workerState_lastUsedAt", ["ownerId", "workerState", "lastUsedAt"])
    .index("by_project_workerState_lastUsedAt", ["projectId", "workerState", "lastUsedAt"]),

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
    runtimeEngine: v.optional(v.union(v.literal("polynet"), v.literal("codex"))),
    executionMode: v.optional(v.string()),
    sandboxMode: v.optional(v.string()),
    contractName: v.optional(v.string()),
    contractVersion: v.optional(v.string()),
    harnessProfile: v.optional(v.string()),
    harnessProfileSource: v.optional(v.string()),
    capabilityFamilies: v.optional(v.array(v.string())),
    accountPlan: v.optional(v.union(v.literal("free"), v.literal("premium"))),
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
