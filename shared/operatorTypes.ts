import type { AccountSetupMissing, AccountSetupStatus, AccountSetupStep } from "./accountSetup";

export type OperatorRange = "7d" | "30d" | "90d" | "all";

export type OperatorAccessSnapshot = {
  role: "owner" | "operator" | "readonly";
  userId: string;
  email: string | null;
};

export type OperatorMoneyMetric = {
  currency: string;
  amountBaseUnits: number;
  currencyDecimals: number;
};

export type OperatorCommunityRecord = {
  creator: {
    userId: string;
    displayName: string | null;
    email: string | null;
    avatarUrl: string | null;
    tier: "free" | "architect" | "unknown";
    payoutStatus: "not_connected" | "onboarding_required" | "pending_requirements" | "ready" | "restricted";
  };
  community: {
    communityId: string;
    slug: string;
    name: string;
    visibility: "published" | "unlisted";
    entryPolicy: "open" | "approval" | "paid_subscription";
    createdAt: number;
    updatedAt: number;
  };
  money: {
    currentPrice: OperatorMoneyMetric | null;
    activePaidMembers: number;
    estimatedMrr: OperatorMoneyMetric | null;
    checkoutStarts: number;
    checkoutCompletions: number;
    checkoutConversionRate: number | null;
  };
  members: {
    totalMembers: number;
    activeMemberships: number;
    removedMembers: number;
  };
  activity: {
    lastMemberActivityAt: number | null;
  };
  risk: {
    flags: string[];
    severity: "none" | "warning" | "error";
  };
  evidence: {
    sourceTables: string[];
    eventIds: string[];
    computedAt: number;
  };
};

export type OperatorOverviewSnapshot = {
  computedAt: number;
  totals: {
    communityCreators: number;
    communities: number;
    activeCommunities: number;
    totalCommunityMembers: number;
    averageMembersPerCommunity: number | null;
    paidCommunities: number;
    paidCommunityConversionRate: number | null;
    activePaidMembers: number;
    estimatedMrr: OperatorMoneyMetric | null;
    averageMrrPerCommunity: OperatorMoneyMetric | null;
    setupRiskCommunities: number;
    staleCommunities: number;
    riskItems: number;
    recentCriticalEvents: number;
  };
  evidence: {
    sourceTables: string[];
  };
};

export type OperatorAccountSetupOverviewSnapshot = {
  computedAt: number;
  totals: {
    users: number;
    completed: number;
    incomplete: number;
    averagePercent: number;
  };
  byStep: Record<AccountSetupStep, number>;
  byMissing: Record<AccountSetupMissing, number>;
  evidence: {
    sourceTables: string[];
  };
};

export type OperatorAccountSetupUserRecord = {
  user: {
    userId: string;
    dbUserId: string;
    email: string | null;
    displayName: string | null;
    handle: string | null;
    avatarUrl: string | null;
    createdAt: number;
    updatedAt: number;
  };
  setup: AccountSetupStatus;
  communities: {
    owned: number;
    joined: number;
  };
  evidence: {
    sourceTables: string[];
    computedAt: number;
  };
};

export type OperatorAccountSetupUserList = {
  rows: OperatorAccountSetupUserRecord[];
  totalMatching: number;
  isTruncated: boolean;
  limit: number;
};

export type OperatorAccountSetupSnapshot = {
  overview: OperatorAccountSetupOverviewSnapshot;
  users: OperatorAccountSetupUserList;
};

export type OperatorMonetizationSnapshot = {
  computedAt: number;
  creditTopupCheckoutStarts: number;
  creditTopupCheckoutCompletions: number;
  communityCheckoutStarts: number;
  communityCheckoutCompletions: number;
  activeCommunitySubscriptions: number;
  estimatedCommunityMrr: OperatorMoneyMetric | null;
  businessKpis?: {
    visitors: {
      total: number | null;
      identified: number;
      visitorToUserConversionRate: number | null;
      availability: "available" | "not_configured" | "not_instrumented";
      source: "first_party" | "posthog" | "vercel_analytics" | "unavailable";
    };
    users: {
      total: number;
      newInRange: number;
      activePayingCustomers: number;
      usageBuyersInRange: number;
      checkoutPurchasersInRange: number;
      knownPayingCustomers: number;
      visitorToUserConversionRate: number | null;
      userToPayingCustomerConversionRate: number | null;
    };
    communities: {
      totalCreated: number;
      createdInRange: number;
      creationRateFromNewUsers: number | null;
      totalCommunityCreators: number;
      activatedCommunityCreators: number;
      communityCreatorActivationRate: number | null;
      communitiesWithFirstMember: number;
      communityActivationRate: number | null;
      paidCommunitiesWithMembers: number;
      paidCommunityMemberActivationRate: number | null;
      createdInRangeWithFirstMember: number;
      createdInRangeActivationRate: number | null;
    };
    revenue: {
      communitySubscriptionMrr: OperatorMoneyMetric | null;
      communityCheckoutRevenueInRange: OperatorMoneyMetric | null;
      communityPlatformRevShareInRange: OperatorMoneyMetric | null;
      communityPlatformRevShareAvailability: "estimated_from_current_fee_policy" | "not_instrumented";
      creditTopupRevenueInRange: OperatorMoneyMetric | null;
      grossRevenueInRange: OperatorMoneyMetric | null;
      averageRecordedLifetimeValue: OperatorMoneyMetric | null;
      platformNetRevenueInRange: OperatorMoneyMetric | null;
      platformNetRevenueAvailability: "available" | "not_instrumented";
    };
    checkouts: {
      totalStarts: number;
      totalCompletions: number;
      totalConversionRate: number | null;
      failedOrAbandoned: number;
      pending: number;
      expired: number;
      communityStarts: number;
      communityCompletions: number;
      creditTopupStarts: number;
      creditTopupCompletions: number;
    };
    email: {
      sent: number;
      delivered: number;
      opened: number;
      clicked: number;
      bouncedOrFailed: number;
      clickRate: number | null;
      conversionRate: number | null;
      conversionAvailability: "available" | "not_attributed";
    };
  };
  evidence: {
    sourceTables: string[];
  };
};

export type OperatorPartnerPayoutCycleStatus =
  | "pending_approval"
  | "approved"
  | "processing"
  | "paid"
  | "held"
  | "failed"
  | "rejected";

export type OperatorPartnerPayoutCycle = {
  id: string;
  cycleKey: string;
  status: OperatorPartnerPayoutCycleStatus;
  totalAmountUsd: number;
  currency: string;
  partnerCount: number;
  itemCount: number;
  transferCount: number;
  payableCutoffAt: number | null;
  payoutBufferMs: number | null;
  createdAt: number;
  updatedAt: number;
  approvedAt: number | null;
  processedAt: number | null;
  failureReason: string | null;
  holdReason: string | null;
  riskFlags: string[];
  actions: {
    canApprove: boolean;
    canRetry: boolean;
    canHold: boolean;
    canReject: boolean;
  };
};

export type OperatorPartnerPayoutCyclesSnapshot = {
  cycles: OperatorPartnerPayoutCycle[];
  evidence: {
    sourceTables: string[];
    computedAt: number;
  };
};

export type OperatorRiskItem = {
  id: string;
  severity: "warning" | "error";
  kind: string;
  title: string;
  communityCreatorUserId: string | null;
  communityId: string | null;
  eventId: string | null;
  createdAt: number;
  evidence: {
    sourceTables: string[];
  };
};

export type OperatorEventRecord = {
  id: string;
  eventKey: string;
  eventType: string;
  severity: "info" | "warning" | "error";
  status: "started" | "succeeded" | "failed" | "blocked" | "ignored";
  actorUserId: string | null;
  subjectUserId: string | null;
  communityId: string | null;
  checkoutSessionId: string | null;
  provider: "polynet" | "stripe" | "convex";
  providerObjectId: string | null;
  metadata: unknown;
  createdAt: number;
};

export type OperatorDiagnosticEventRecord = {
  id: string;
  eventKey: string;
  eventType: string;
  subsystem:
    | "auth"
    | "access"
    | "security"
    | "billing"
    | "runtime"
    | "mcp"
    | "tool"
    | "community"
    | "funnel"
    | "deploy"
    | "diagnostics";
  severity: "info" | "warning" | "error";
  status: "started" | "succeeded" | "failed" | "blocked" | "ignored";
  surface: string | null;
  userId: string | null;
  communityId: string | null;
  projectId: string | null;
  threadId: string | null;
  runId: string | null;
  requestId: string | null;
  release: string | null;
  latencyMs: number | null;
  errorCode: string | null;
  metadata: unknown;
  createdAt: number;
};

export type OperatorAuthAccessDiagnosticsSnapshot = {
  computedAt: number;
  range: OperatorRange;
  health: "healthy" | "degraded" | "incident" | "unknown";
  authAvailability?: {
    health: "healthy" | "degraded" | "incident" | "unknown";
    score: number | null;
    windowMs: number;
    attempts: number;
    successes: number;
    failures: number;
    successRate: number | null;
    affectedUsers: number;
    unattributedFailures: number;
    bootstrapFailures: number;
    refreshFailures: number;
    unknownFailures: number;
  };
  accessIntegrity?: {
    health: "healthy" | "degraded" | "incident" | "unknown";
    score: number | null;
    accessEvents: number;
    warnings: number;
    errors: number;
    operatorAccessDenied: number;
    communityAccessDenied: number;
    entitlementFindings: number;
    entitlementErrorFindings: number;
  };
  totals: {
    events: number;
    warnings: number;
    errors: number;
    authFailures: number;
    sessionEstablished: number;
    sessionRefreshFailures: number;
    operatorAccessGranted: number;
    operatorAccessDenied: number;
    communityAccessDenied: number;
    entitlementFindings: number;
    entitlementErrorFindings: number;
    unknownAuthErrors: number;
  };
  latestEvents: OperatorDiagnosticEventRecord[];
  evidence: {
    sourceTables: string[];
    scannedEventLimit: number;
    isTruncated: boolean;
  };
};

export type OperatorSecurityAuditAttentionItem = {
  id: string;
  severity: "warning" | "error";
  title: string;
  eventType: string;
  status: "started" | "succeeded" | "failed" | "blocked" | "ignored";
  eventId: string;
  actorUserId: string | null;
  subjectUserId: string | null;
  communityId: string | null;
  createdAt: number;
  evidence: {
    sourceTables: string[];
  };
};

export type OperatorSecurityAuditDiagnosticsSnapshot = {
  computedAt: number;
  range: OperatorRange;
  health: "healthy" | "degraded" | "incident" | "unknown";
  trustBoundary?: {
    health: "healthy" | "degraded" | "incident" | "unknown";
    score: number | null;
    findings: number;
    failedEvents: number;
    webhookFailures: number;
    blockedBoundaryActions: number;
    operatorAccessBlocks: number;
    unknownSecurityEvents: number;
    attentionItems: OperatorSecurityAuditAttentionItem[];
  };
  auditActivity?: {
    events: number;
    warnings: number;
    errors: number;
    blockedActions: number;
    destructiveActions: number;
    operatorRoleChanges: number;
    billingTrustEvents: number;
  };
  totals: {
    events: number;
    warnings: number;
    errors: number;
    webhookFailures: number;
    blockedActions: number;
    destructiveActions: number;
    operatorRoleChanges: number;
    operatorAccessBlocks: number;
    billingTrustEvents: number;
    unknownSecurityEvents: number;
  };
  attentionItems: OperatorSecurityAuditAttentionItem[];
  latestEvents: OperatorEventRecord[];
  evidence: {
    sourceTables: string[];
    scannedEventLimit: number;
    isTruncated: boolean;
  };
};

export type OperatorRuntimeToolFailureBucket = {
  key: string;
  label: string;
  count: number;
  latestAt: number | null;
  severity: "warning" | "error";
};

export type OperatorPaidToolLane = {
  toolName: string;
  label: string;
  reservations: number;
  succeeded: number;
  refunded: number;
  stillReserved: number;
  failures: number;
  reservedCredits: number;
  settledCredits: number;
  refundedCredits: number;
  latestAt: number | null;
};

export type OperatorPaidToolEconomicsLane = {
  toolName: string;
  label: string;
  settledRows: number;
  revenueUsd: number;
  vendorCostUsd: number;
  grossMarginUsd: number;
  grossMarginRate: number | null;
  partnerCommissionUsd: number;
  partnerShareOfGrossMargin: number | null;
  netAfterPartnerUsd: number;
  netAfterPartnerMarginRate: number | null;
  missingCostRows: number;
  latestAt: number | null;
};

export type OperatorRuntimeToolDiagnosticsSnapshot = {
  computedAt: number;
  range: OperatorRange;
  health: "healthy" | "degraded" | "incident" | "unknown";
  executionAvailability?: {
    health: "healthy" | "degraded" | "incident" | "unknown";
    score: number | null;
    turnsStarted: number;
    turnsSucceeded: number;
    turnsFailed: number;
    turnsCancelled: number;
    turnsRunning: number;
    turnSuccessRate: number | null;
    toolCalls: number;
    toolFailures: number;
    toolFailureRate: number | null;
    providerFailures: number;
    rateLimitFailures: number;
    sandboxCreateFailures: number;
    runtimeDiagnosticEvents: number;
    topFailureCodes: OperatorRuntimeToolFailureBucket[];
    topFailingTools: OperatorRuntimeToolFailureBucket[];
  };
  totals: {
    turnsStarted: number;
    turnsSucceeded: number;
    turnsFailed: number;
    turnsCancelled: number;
    turnsRunning: number;
    toolCalls: number;
    toolFailures: number;
    runtimeDiagnosticEvents: number;
    providerFailures: number;
    rateLimitFailures: number;
    sandboxCreateFailures: number;
  };
  rates: {
    turnSuccessRate: number | null;
    toolFailureRate: number | null;
  };
  topFailureCodes: OperatorRuntimeToolFailureBucket[];
  topFailingTools: OperatorRuntimeToolFailureBucket[];
  latestEvents: OperatorDiagnosticEventRecord[];
  evidence: {
    sourceTables: string[];
    scannedRunLimit: number;
    scannedEventLimit: number;
    isTruncated: boolean;
  };
};

export type OperatorToolBalanceAccountingIssue = {
  kind:
    | "negative_balance"
    | "duplicate_balance"
    | "stale_reservation"
    | "pending_settlement"
    | "unbilled_compute"
    | "missing_cost"
    | "price_drift"
    | "balance_mismatch"
    | "reconciliation_coverage_gap";
  severity: "warning" | "error";
  label: string;
  userId: string | null;
  creditKey: string | null;
  amountCredits: number | null;
  amountUsd: number | null;
  latestAt: number | null;
};

export type OperatorToolEconomicsSnapshot = {
  computedAt: number;
  range: OperatorRange;
  usageIntegrity: {
    health: "healthy" | "degraded" | "incident" | "unknown";
    score: number | null;
    workspaceCreditFailures: number;
    paidToolLedgerFailures: number;
    unbilledComputeCharges: number;
    topFailureCodes: OperatorRuntimeToolFailureBucket[];
  };
  paidTools: {
    totals: {
      reservations: number;
      succeeded: number;
      refunded: number;
      stillReserved: number;
      failures: number;
      reservedCredits: number;
      settledCredits: number;
      refundedCredits: number;
      unbilledComputeCharges: number;
    };
    lanes: OperatorPaidToolLane[];
  };
  paidToolEconomics: {
    targets: {
      grossMarginBps: number;
      partnerGrossMarginShareBps: number;
    };
    totals: OperatorPaidToolEconomicsLane & {
      costEvidenceCoverage: number | null;
      partnerCommissionRows: number;
      voidedPartnerCommissionUsd: number;
    };
    lanes: OperatorPaidToolEconomicsLane[];
  };
  accountingIntegrity: {
    health: "healthy" | "degraded" | "incident" | "unknown";
    score: number | null;
    totals: {
      sampledBalanceRows: number;
      duplicateBalanceUsers: number;
      negativeBalanceRows: number;
      uncollectedBalanceRows: number;
      staleReservations: number;
      pendingSettlementsDue: number;
      unbilledComputeCharges: number;
      settledRowsMissingVendorCost: number;
      priceDriftRows: number;
      balanceMismatchUsers: number;
      reconciliationCoverageGaps: number;
    };
    issues: OperatorToolBalanceAccountingIssue[];
  };
  evidence: {
    sourceTables: string[];
    scannedCreditLimit: number;
    scannedCommissionLimit: number;
    scannedComputeLimit: number;
    scannedBalanceLimit: number;
    scannedIntegritySampleLimit: number;
    isTruncated: boolean;
  };
};

export type OperatorFrontendErrorIssue = {
  id: string;
  shortId: string | null;
  title: string;
  culprit: string | null;
  permalink: string | null;
  level: "fatal" | "error" | "warning" | "info" | "unknown";
  status: string;
  count: number;
  userCount: number | null;
  firstSeen: string | null;
  lastSeen: string | null;
  release: string | null;
};

export type OperatorFrontendErrorDiagnosticsSnapshot = {
  computedAt: number;
  range: OperatorRange;
  health: "healthy" | "degraded" | "incident" | "unknown";
  release: {
    currentBuildId: string | null;
    sentryRelease: string | null;
    matchesCurrentBuild: boolean | null;
  };
  totals: {
    issues: number;
    events: number;
    affectedUsers: number | null;
    unresolvedIssues: number;
  };
  topIssues: OperatorFrontendErrorIssue[];
  evidence: {
    source: "sentry";
    endpointMode: "organization_issues" | "project_issues";
    org: string | null;
    project: string | null;
    projectId: string | null;
    environment: string | null;
    query: string;
    statsPeriod: string;
    issueLimit: number;
    configured: boolean;
    unavailableReason: string | null;
    sampled: boolean;
    isTruncated: boolean;
  };
};

export type OperatorWebDeployRouteCheck = {
  label: string;
  path: string;
  criticality: "critical" | "important" | "informational";
  status: "ok" | "failed" | "unknown";
  httpStatus: number | null;
  latencyMs: number | null;
  checkedAt: number | null;
  errorCode: string | null;
};

export type OperatorWebDeployAssetCheck = {
  label: string;
  path: string;
  type: "script" | "style";
  status: "ok" | "failed" | "unknown";
  httpStatus: number | null;
  latencyMs: number | null;
  checkedAt: number | null;
  errorCode: string | null;
};

export type OperatorWebDeployDiagnosticsSnapshot = {
  computedAt: number;
  range: OperatorRange;
  health: "healthy" | "degraded" | "incident" | "unknown";
  liveSurface?: {
    health: "healthy" | "degraded" | "incident" | "unknown";
    score: number | null;
    checkedAt: number | null;
    versionJsonReachable: boolean | null;
    currentBuildId: string | null;
    criticalRoutes: {
      total: number;
      failed: number;
    };
    importantRoutes: {
      total: number;
      failed: number;
    };
    informationalRoutes: {
      total: number;
      failed: number;
    };
    assetChecks: number;
    assetFailures: number;
  };
  currentBuild: {
    buildId: string | null;
    source: "version_json" | "unknown";
    checkedAt: number | null;
  };
  totals: {
    deployEvents: number;
    warnings: number;
    errors: number;
    routeChecks: number;
    routeFailures: number;
    assetChecks: number;
    assetFailures: number;
    frontendCrashEvents: number;
    moduleLoadRecoveries: number;
    staleBuildWarnings: number;
  };
  routeChecks: OperatorWebDeployRouteCheck[];
  assetChecks: OperatorWebDeployAssetCheck[];
  latestEvents: OperatorDiagnosticEventRecord[];
  evidence: {
    sourceTables: string[];
    routeProbePaths: string[];
    assetProbePaths: string[];
    routeProbeTimeoutMs: number | null;
    versionJsonReachable: boolean | null;
    frontendCrashSource: "platformDiagnosticEvents";
    frontendCrashCoverage: "first_party_deploy_events_only";
    sentryBacked: boolean;
    scannedEventLimit: number;
    isTruncated: boolean;
  };
};
