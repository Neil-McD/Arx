import type {
  OperatorAuthAccessDiagnosticsSnapshot,
  OperatorFrontendErrorDiagnosticsSnapshot,
  OperatorRuntimeToolDiagnosticsSnapshot,
  OperatorSecurityAuditDiagnosticsSnapshot,
  OperatorWebDeployDiagnosticsSnapshot,
} from "./operatorTypes";

export type OperatorPlatformHealthStatus = "healthy" | "degraded" | "incident" | "unknown";

export type OperatorPlatformHealthCard = {
  id: "web" | "runtime" | "auth" | "security";
  label: string;
  status: OperatorPlatformHealthStatus;
  score: number | null;
  primaryMetric: string;
  drivers: string[];
  evidenceNote: string;
};

type ScoreInput = {
  score: number;
  drivers: string[];
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function addPenalty(input: ScoreInput, penalty: number, driver: string | null): void {
  if (penalty <= 0) return;
  input.score -= penalty;
  if (driver) input.drivers.push(driver);
}

function statusFromScore(score: number | null): OperatorPlatformHealthStatus {
  if (score == null) return "unknown";
  if (score < 60) return "incident";
  if (score < 85) return "degraded";
  return "healthy";
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${Math.round(value * 100)}%`;
}

function formatRoutePassRate(snapshot: OperatorWebDeployDiagnosticsSnapshot): string {
  if (snapshot.totals.routeChecks <= 0) return "No route checks";
  const passed = Math.max(0, snapshot.totals.routeChecks - snapshot.totals.routeFailures);
  return `${passed}/${snapshot.totals.routeChecks} routes`;
}

function fallbackDrivers(drivers: string[], healthyDriver: string): string[] {
  return drivers.length > 0 ? drivers.slice(0, 3) : [healthyDriver];
}

function finalizeCard(params: {
  id: OperatorPlatformHealthCard["id"];
  label: string;
  score: number;
  primaryMetric: string;
  drivers: string[];
  healthyDriver: string;
  evidenceNote: string;
}): OperatorPlatformHealthCard {
  const score = clampScore(params.score);
  return {
    id: params.id,
    label: params.label,
    status: statusFromScore(score),
    score,
    primaryMetric: params.primaryMetric,
    drivers: fallbackDrivers(params.drivers, params.healthyDriver),
    evidenceNote: params.evidenceNote,
  };
}

function buildUnknownCard(id: OperatorPlatformHealthCard["id"], label: string, evidenceNote: string): OperatorPlatformHealthCard {
  return {
    id,
    label,
    status: "unknown",
    score: null,
    primaryMetric: "No data",
    drivers: ["No diagnostics returned"],
    evidenceNote,
  };
}

function buildWebCard(
  web: OperatorWebDeployDiagnosticsSnapshot | null,
  frontendErrors: OperatorFrontendErrorDiagnosticsSnapshot | null,
): OperatorPlatformHealthCard {
  if (!web) return buildUnknownCard("web", "Web", "Production build, route probes, deploy events, and frontend issue evidence.");
  const input: ScoreInput = { score: 100, drivers: [] };
  const routeFailures = web.totals.routeFailures;
  const routeChecks = web.totals.routeChecks;
  if (routeChecks > 0) {
    addPenalty(input, Math.min(45, Math.round((routeFailures / routeChecks) * 45)), routeFailures > 0 ? `${routeFailures} route failures` : null);
  } else {
    addPenalty(input, 18, "Route probe evidence unavailable");
  }
  addPenalty(input, web.evidence.versionJsonReachable === false ? 12 : 0, "Build evidence unavailable");
  addPenalty(input, Math.min(30, web.totals.errors * 12), web.totals.errors > 0 ? `${web.totals.errors} deploy errors` : null);
  addPenalty(input, Math.min(15, web.totals.warnings * 5), web.totals.warnings > 0 ? `${web.totals.warnings} deploy warnings` : null);
  addPenalty(
    input,
    Math.min(45, web.totals.frontendCrashEvents * 15),
    web.totals.frontendCrashEvents > 0 ? `${web.totals.frontendCrashEvents} first-party crash events` : null,
  );
  addPenalty(
    input,
    Math.min(20, web.totals.moduleLoadRecoveries * 5),
    web.totals.moduleLoadRecoveries > 0 ? `${web.totals.moduleLoadRecoveries} recovery events` : null,
  );
  addPenalty(input, Math.min(20, web.totals.staleBuildWarnings * 10), web.totals.staleBuildWarnings > 0 ? `${web.totals.staleBuildWarnings} stale build warnings` : null);
  if (frontendErrors?.health === "incident") addPenalty(input, 18, "Sentry frontend incident");
  if (frontendErrors?.health === "degraded") addPenalty(input, 8, "Sentry frontend degraded");
  if (frontendErrors && !frontendErrors.evidence.configured) addPenalty(input, 8, "Sentry frontend source unavailable");
  return finalizeCard({
    id: "web",
    label: "Web",
    primaryMetric: formatRoutePassRate(web),
    score: input.score,
    drivers: input.drivers,
    healthyDriver: "Routes and deploy evidence clean",
    evidenceNote: web.evidence.isTruncated ? "Sampled web/deploy diagnostics" : "Route, build, deploy, and frontend evidence",
  });
}

function buildRuntimeCard(runtime: OperatorRuntimeToolDiagnosticsSnapshot | null): OperatorPlatformHealthCard {
  if (!runtime) return buildUnknownCard("runtime", "Runtime", "Agent turns, tool calls, provider failures, paid tools, and sandbox evidence.");
  const input: ScoreInput = { score: 100, drivers: [] };
  const toolFailureRate = runtime.rates.toolFailureRate ?? 0;
  addPenalty(input, runtime.rates.turnSuccessRate == null ? 4 : Math.max(0, Math.round((1 - runtime.rates.turnSuccessRate) * 45)), runtime.totals.turnsFailed > 0 ? `${runtime.totals.turnsFailed} failed turns` : null);
  addPenalty(input, Math.min(35, Math.round(toolFailureRate * 45)), runtime.totals.toolFailures > 0 ? `${runtime.totals.toolFailures} tool failures` : null);
  addPenalty(input, Math.min(30, runtime.totals.providerFailures * 12), runtime.totals.providerFailures > 0 ? `${runtime.totals.providerFailures} provider failures` : null);
  addPenalty(input, Math.min(18, runtime.totals.rateLimitFailures * 6), runtime.totals.rateLimitFailures > 0 ? `${runtime.totals.rateLimitFailures} rate limits` : null);
  addPenalty(input, Math.min(30, runtime.totals.workspaceCreditFailures * 10), runtime.totals.workspaceCreditFailures > 0 ? `${runtime.totals.workspaceCreditFailures} credit failures` : null);
  addPenalty(input, Math.min(30, runtime.totals.sandboxCreateFailures * 10), runtime.totals.sandboxCreateFailures > 0 ? `${runtime.totals.sandboxCreateFailures} sandbox failures` : null);
  addPenalty(input, Math.min(24, runtime.totals.paidToolLedgerFailures * 8), runtime.totals.paidToolLedgerFailures > 0 ? `${runtime.totals.paidToolLedgerFailures} paid-tool ledger failures` : null);
  addPenalty(input, Math.min(30, runtime.totals.unbilledComputeCharges * 10), runtime.totals.unbilledComputeCharges > 0 ? `${runtime.totals.unbilledComputeCharges} unbilled compute charges` : null);
  return finalizeCard({
    id: "runtime",
    label: "Runtime",
    primaryMetric: `${formatPercent(runtime.rates.turnSuccessRate)} turn success`,
    score: input.score,
    drivers: input.drivers,
    healthyDriver: "Turns, tools, and paid-tool accounting clean",
    evidenceNote: runtime.evidence.isTruncated ? "Sampled runtime diagnostics" : "Runtime, tool, provider, and credit evidence",
  });
}

function buildAuthCard(auth: OperatorAuthAccessDiagnosticsSnapshot | null): OperatorPlatformHealthCard {
  if (!auth) return buildUnknownCard("auth", "Auth", "Session, access, operator, community access, and entitlement evidence.");
  const input: ScoreInput = { score: 100, drivers: [] };
  addPenalty(input, Math.min(36, auth.totals.errors * 12), auth.totals.errors > 0 ? `${auth.totals.errors} auth/access errors` : null);
  addPenalty(input, Math.min(24, auth.totals.warnings * 6), auth.totals.warnings > 0 ? `${auth.totals.warnings} auth/access warnings` : null);
  addPenalty(input, Math.min(30, auth.totals.authFailures * 10), auth.totals.authFailures > 0 ? `${auth.totals.authFailures} auth failures` : null);
  addPenalty(input, Math.min(24, auth.totals.sessionRefreshFailures * 8), auth.totals.sessionRefreshFailures > 0 ? `${auth.totals.sessionRefreshFailures} refresh failures` : null);
  addPenalty(input, Math.min(24, auth.totals.entitlementErrorFindings * 8), auth.totals.entitlementErrorFindings > 0 ? `${auth.totals.entitlementErrorFindings} entitlement errors` : null);
  addPenalty(input, Math.min(15, auth.totals.unknownAuthErrors * 5), auth.totals.unknownAuthErrors > 0 ? `${auth.totals.unknownAuthErrors} unknown auth errors` : null);
  return finalizeCard({
    id: "auth",
    label: "Auth",
    primaryMetric: `${auth.totals.sessionEstablished} sessions`,
    score: input.score,
    drivers: input.drivers,
    healthyDriver: "Sessions, access checks, and entitlements clean",
    evidenceNote: auth.evidence.isTruncated ? "Sampled auth/access diagnostics" : "Auth, access, and entitlement evidence",
  });
}

function buildSecurityCard(security: OperatorSecurityAuditDiagnosticsSnapshot | null): OperatorPlatformHealthCard {
  if (!security) return buildUnknownCard("security", "Security", "Audit, webhook, blocked action, operator role, and trust-boundary evidence.");
  const input: ScoreInput = { score: 100, drivers: [] };
  addPenalty(input, Math.min(40, security.totals.errors * 12), security.totals.errors > 0 ? `${security.totals.errors} audit errors` : null);
  addPenalty(input, Math.min(24, security.totals.warnings * 6), security.totals.warnings > 0 ? `${security.totals.warnings} audit warnings` : null);
  addPenalty(input, Math.min(36, security.totals.webhookFailures * 12), security.totals.webhookFailures > 0 ? `${security.totals.webhookFailures} webhook failures` : null);
  addPenalty(input, Math.min(18, security.totals.blockedActions * 3), security.totals.blockedActions > 0 ? `${security.totals.blockedActions} blocked actions` : null);
  addPenalty(input, Math.min(24, security.totals.operatorAccessBlocks * 8), security.totals.operatorAccessBlocks > 0 ? `${security.totals.operatorAccessBlocks} operator access blocks` : null);
  addPenalty(input, Math.min(30, security.totals.unknownSecurityEvents * 10), security.totals.unknownSecurityEvents > 0 ? `${security.totals.unknownSecurityEvents} unknown security events` : null);
  return finalizeCard({
    id: "security",
    label: "Security",
    primaryMetric: `${security.attentionItems.length} attention items`,
    score: input.score,
    drivers: input.drivers,
    healthyDriver: "Audit and trust-boundary evidence clean",
    evidenceNote: security.evidence.isTruncated ? "Sampled security audit diagnostics" : "Audit, webhook, role, and blocked-action evidence",
  });
}

export function buildOperatorPlatformHealthCards(params: {
  webDeploy: OperatorWebDeployDiagnosticsSnapshot | null;
  authAccess: OperatorAuthAccessDiagnosticsSnapshot | null;
  securityAudit: OperatorSecurityAuditDiagnosticsSnapshot | null;
  runtimeTools: OperatorRuntimeToolDiagnosticsSnapshot | null;
  frontendErrors: OperatorFrontendErrorDiagnosticsSnapshot | null;
}): OperatorPlatformHealthCard[] {
  return [
    buildWebCard(params.webDeploy, params.frontendErrors),
    buildRuntimeCard(params.runtimeTools),
    buildAuthCard(params.authAccess),
    buildSecurityCard(params.securityAudit),
  ];
}
