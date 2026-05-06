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

export type OperatorBuilderRecord = {
  builder: {
    userId: string;
    displayName: string | null;
    email: string | null;
    avatarUrl: string | null;
    tier: "free" | "builder" | "architect" | "unknown";
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
    builders: number;
    communities: number;
    paidCommunities: number;
    activePaidMembers: number;
    estimatedMrr: OperatorMoneyMetric | null;
    riskItems: number;
    recentCriticalEvents: number;
  };
  evidence: {
    sourceTables: string[];
  };
};

export type OperatorMonetizationSnapshot = {
  computedAt: number;
  creditTopupCheckoutStarts: number;
  creditTopupCheckoutCompletions: number;
  communityCheckoutStarts: number;
  communityCheckoutCompletions: number;
  activeCommunitySubscriptions: number;
  estimatedCommunityMrr: OperatorMoneyMetric | null;
  evidence: {
    sourceTables: string[];
  };
};

export type OperatorRiskItem = {
  id: string;
  severity: "warning" | "error";
  kind: string;
  title: string;
  builderUserId: string | null;
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

export type OperatorRuntimeToolDiagnosticsSnapshot = {
  computedAt: number;
  range: OperatorRange;
  health: "healthy" | "degraded" | "incident" | "unknown";
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
    workspaceCreditFailures: number;
    paidToolLedgerFailures: number;
    sandboxCreateFailures: number;
    unbilledComputeCharges: number;
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
    scannedCreditLimit: number;
    scannedComputeLimit: number;
    isTruncated: boolean;
  };
};
