import type {
  OperatorAuthAccessDiagnosticsSnapshot,
  OperatorRuntimeToolDiagnosticsSnapshot,
  OperatorSecurityAuditDiagnosticsSnapshot,
  OperatorWebDeployDiagnosticsSnapshot,
} from "./operatorTypes";

export type OperatorPlatformHealthStatus = "healthy" | "degraded" | "incident" | "unknown";

export type OperatorPlatformHealthCard = {
  id: "web" | "runtime" | "auth" | "access" | "security";
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
  const live = snapshot.liveSurface;
  const routeChecks = live
    ? live.criticalRoutes.total + live.importantRoutes.total + live.informationalRoutes.total
    : snapshot.totals.routeChecks;
  const routeFailures = live
    ? live.criticalRoutes.failed + live.importantRoutes.failed + live.informationalRoutes.failed
    : snapshot.totals.routeFailures;
  if (routeChecks <= 0) return "No route checks";
  const passed = Math.max(0, routeChecks - routeFailures);
  const assetSuffix = live?.assetChecks ? `, ${Math.max(0, live.assetChecks - live.assetFailures)}/${live.assetChecks} assets` : "";
  return `${passed}/${routeChecks} routes${assetSuffix}`;
}

function fallbackDrivers(drivers: string[], healthyDriver: string): string[] {
  return drivers.length > 0 ? drivers.slice(0, 3) : [healthyDriver];
}

function finalizeCard(params: {
  id: OperatorPlatformHealthCard["id"];
  label: string;
  score: number | null;
  status?: OperatorPlatformHealthStatus;
  primaryMetric: string;
  drivers: string[];
  healthyDriver: string;
  evidenceNote: string;
}): OperatorPlatformHealthCard {
  const score = typeof params.score === "number" && Number.isFinite(params.score)
    ? clampScore(params.score)
    : null;
  return {
    id: params.id,
    label: params.label,
    status: params.status ?? statusFromScore(score),
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

function buildWebCard(web: OperatorWebDeployDiagnosticsSnapshot | null): OperatorPlatformHealthCard {
  if (!web) return buildUnknownCard("web", "Web", "Production build, route probes, deploy events, and frontend issue evidence.");
  const input: ScoreInput = { score: 100, drivers: [] };
  const live = web.liveSurface;
  if (live) {
    input.score = live.score ?? 100;
    if (live.versionJsonReachable === false) input.drivers.push("Build evidence unavailable");
    if (live.criticalRoutes.failed > 0) input.drivers.push(`${live.criticalRoutes.failed} critical route failures`);
    if (live.importantRoutes.failed > 0) input.drivers.push(`${live.importantRoutes.failed} important route failures`);
    if (live.assetFailures > 0) input.drivers.push(`${live.assetFailures} asset failures`);
    if (live.assetChecks <= 0) input.drivers.push("Asset evidence unavailable");
  } else {
    const routeFailures = web.totals.routeFailures;
    const routeChecks = web.totals.routeChecks;
    if (routeChecks > 0) {
      addPenalty(input, Math.min(45, Math.round((routeFailures / routeChecks) * 45)), routeFailures > 0 ? `${routeFailures} route failures` : null);
    } else {
      addPenalty(input, 18, "Route probe evidence unavailable");
    }
    addPenalty(input, web.evidence.versionJsonReachable === false ? 12 : 0, "Build evidence unavailable");
  }
  return finalizeCard({
    id: "web",
    label: "Web",
    primaryMetric: formatRoutePassRate(web),
    score: live?.score ?? input.score,
    status: live?.health,
    drivers: input.drivers,
    healthyDriver: "Live routes, build, and assets reachable",
    evidenceNote: web.evidence.isTruncated ? "Sampled web/deploy diagnostics" : "Live route, build, and asset evidence",
  });
}

function buildRuntimeCard(runtime: OperatorRuntimeToolDiagnosticsSnapshot | null): OperatorPlatformHealthCard {
  if (!runtime) return buildUnknownCard("runtime", "Runtime", "Agent turns, tool calls, provider failures, and sandbox evidence.");
  const execution = runtime.executionAvailability;
  if (execution) {
    const drivers: string[] = [];
    if (execution.score == null) {
      drivers.push("No recent execution evidence");
    } else {
      if (execution.turnsFailed > 0) drivers.push(`${execution.turnsFailed} failed turns`);
      if (execution.toolFailures > 0) drivers.push(`${execution.toolFailures} tool failures`);
      if (execution.providerFailures > 0) drivers.push(`${execution.providerFailures} provider failures`);
      if (execution.rateLimitFailures > 0) drivers.push(`${execution.rateLimitFailures} rate limits`);
      if (execution.sandboxCreateFailures > 0) drivers.push(`${execution.sandboxCreateFailures} sandbox failures`);
      if (execution.runtimeDiagnosticEvents > 0) drivers.push(`${execution.runtimeDiagnosticEvents} runtime diagnostics`);
    }
    return finalizeCard({
      id: "runtime",
      label: "Runtime",
      primaryMetric: execution.turnSuccessRate == null ? "No turn evidence" : `${formatPercent(execution.turnSuccessRate)} turn success`,
      score: execution.score,
      status: execution.health,
      drivers,
      healthyDriver: "Turns, tools, providers, and sandbox execution clean",
      evidenceNote: runtime.evidence.isTruncated ? "Sampled runtime execution diagnostics" : "Runtime execution evidence",
    });
  }
  const input: ScoreInput = { score: 100, drivers: [] };
  const toolFailureRate = runtime.rates.toolFailureRate ?? 0;
  addPenalty(input, runtime.rates.turnSuccessRate == null ? 4 : Math.max(0, Math.round((1 - runtime.rates.turnSuccessRate) * 45)), runtime.totals.turnsFailed > 0 ? `${runtime.totals.turnsFailed} failed turns` : null);
  addPenalty(input, Math.min(35, Math.round(toolFailureRate * 45)), runtime.totals.toolFailures > 0 ? `${runtime.totals.toolFailures} tool failures` : null);
  addPenalty(input, Math.min(30, runtime.totals.providerFailures * 12), runtime.totals.providerFailures > 0 ? `${runtime.totals.providerFailures} provider failures` : null);
  addPenalty(input, Math.min(18, runtime.totals.rateLimitFailures * 6), runtime.totals.rateLimitFailures > 0 ? `${runtime.totals.rateLimitFailures} rate limits` : null);
  addPenalty(input, Math.min(30, runtime.totals.sandboxCreateFailures * 10), runtime.totals.sandboxCreateFailures > 0 ? `${runtime.totals.sandboxCreateFailures} sandbox failures` : null);
  return finalizeCard({
    id: "runtime",
    label: "Runtime",
    primaryMetric: `${formatPercent(runtime.rates.turnSuccessRate)} turn success`,
    score: input.score,
    drivers: input.drivers,
    healthyDriver: "Turns, tools, providers, and sandbox execution clean",
    evidenceNote: runtime.evidence.isTruncated ? "Sampled runtime execution diagnostics" : "Runtime execution evidence",
  });
}

function buildAuthCard(auth: OperatorAuthAccessDiagnosticsSnapshot | null): OperatorPlatformHealthCard {
  if (!auth) return buildUnknownCard("auth", "Auth", "Recent bootstrap, refresh, and logout failures.");
  const incidents = auth.authIncidents;
  if (!incidents) {
    return buildUnknownCard("auth", "Auth", "Recent bootstrap, refresh, and logout failures.");
  }
  const drivers: string[] = [];
  if (incidents.failures > 0) drivers.push(`${incidents.failures} recent auth failures`);
  if (incidents.refreshFailures > 0) drivers.push(`${incidents.refreshFailures} refresh failures`);
  if (incidents.logoutFailures > 0) drivers.push(`${incidents.logoutFailures} logout failures`);
  if (incidents.unknownFailures > 0) drivers.push(`${incidents.unknownFailures} unknown failures`);
  if (incidents.unattributedFailures > 0) drivers.push(`${incidents.unattributedFailures} unattributed failures`);
  return finalizeCard({
    id: "auth",
    label: "Auth",
    primaryMetric: `${incidents.failures} auth incidents`,
    score: null,
    status: incidents.health,
    drivers,
    healthyDriver: "No auth incidents recorded",
    evidenceNote: auth.evidence.isTruncated ? "Truncated auth incident evidence" : "24h auth failure evidence",
  });
}

function buildAccessCard(auth: OperatorAuthAccessDiagnosticsSnapshot | null): OperatorPlatformHealthCard {
  if (!auth) return buildUnknownCard("access", "Access", "Operator, community, and entitlement integrity evidence.");
  const integrity = auth.accessIntegrity;
  if (!integrity) return buildUnknownCard("access", "Access", "Operator, community, and entitlement integrity evidence.");
  const input: ScoreInput = { score: integrity.score ?? 100, drivers: [] };
  if (integrity.entitlementErrorFindings > 0) input.drivers.push(`${integrity.entitlementErrorFindings} entitlement errors`);
  if (integrity.entitlementFindings > 0) input.drivers.push(`${integrity.entitlementFindings} entitlement findings`);
  if (integrity.operatorAccessDenied > 0) input.drivers.push(`${integrity.operatorAccessDenied} operator access denials`);
  if (integrity.communityAccessDenied > 0) input.drivers.push(`${integrity.communityAccessDenied} community access denials`);
  if (integrity.warnings > 0) input.drivers.push(`${integrity.warnings} access warnings`);
  return finalizeCard({
    id: "access",
    label: "Access",
    primaryMetric: `${integrity.entitlementErrorFindings} entitlement errors`,
    score: integrity.score,
    status: integrity.health,
    drivers: input.drivers,
    healthyDriver: "Entitlements and access checks clean",
    evidenceNote: auth.evidence.isTruncated ? "Sampled access-integrity diagnostics" : "Operator, community, and entitlement evidence",
  });
}

function buildSecurityCard(security: OperatorSecurityAuditDiagnosticsSnapshot | null): OperatorPlatformHealthCard {
  if (!security) return buildUnknownCard("security", "Security", "Webhook, blocked boundary, operator access, and unknown security evidence.");
  const trust = security.trustBoundary;
  if (trust) {
    const drivers: string[] = [];
    if (trust.failedEvents > 0) drivers.push(`${trust.failedEvents} failed audit events`);
    if (trust.webhookFailures > 0) drivers.push(`${trust.webhookFailures} webhook failures`);
    if (trust.operatorAccessBlocks > 0) drivers.push(`${trust.operatorAccessBlocks} operator access blocks`);
    if (trust.blockedBoundaryActions > 0) drivers.push(`${trust.blockedBoundaryActions} blocked boundary actions`);
    if (trust.unknownSecurityEvents > 0) drivers.push(`${trust.unknownSecurityEvents} unknown security events`);
    return finalizeCard({
      id: "security",
      label: "Security",
      primaryMetric: `${trust.findings} trust findings`,
      score: trust.score,
      status: trust.health,
      drivers,
      healthyDriver: "Trust-boundary failures clear",
      evidenceNote: security.evidence.isTruncated ? "Sampled trust-boundary diagnostics" : "Trust-boundary audit evidence",
    });
  }
  const input: ScoreInput = { score: 100, drivers: [] };
  addPenalty(input, Math.min(40, security.totals.errors * 12), security.totals.errors > 0 ? `${security.totals.errors} audit errors` : null);
  addPenalty(input, Math.min(36, security.totals.webhookFailures * 12), security.totals.webhookFailures > 0 ? `${security.totals.webhookFailures} webhook failures` : null);
  addPenalty(input, Math.min(24, security.totals.operatorAccessBlocks * 8), security.totals.operatorAccessBlocks > 0 ? `${security.totals.operatorAccessBlocks} operator access blocks` : null);
  addPenalty(input, Math.min(30, security.totals.unknownSecurityEvents * 10), security.totals.unknownSecurityEvents > 0 ? `${security.totals.unknownSecurityEvents} unknown security events` : null);
  return finalizeCard({
    id: "security",
    label: "Security",
    primaryMetric: `${security.attentionItems.length} attention items`,
    score: input.score,
    drivers: input.drivers,
    healthyDriver: "Trust-boundary failures clear",
    evidenceNote: security.evidence.isTruncated ? "Sampled trust-boundary diagnostics" : "Trust-boundary audit evidence",
  });
}

export function buildOperatorPlatformHealthCards(params: {
  webDeploy: OperatorWebDeployDiagnosticsSnapshot | null;
  authAccess: OperatorAuthAccessDiagnosticsSnapshot | null;
  securityAudit: OperatorSecurityAuditDiagnosticsSnapshot | null;
  runtimeTools: OperatorRuntimeToolDiagnosticsSnapshot | null;
}): OperatorPlatformHealthCard[] {
  return [
    buildWebCard(params.webDeploy),
    buildRuntimeCard(params.runtimeTools),
    buildAuthCard(params.authAccess),
    buildAccessCard(params.authAccess),
    buildSecurityCard(params.securityAudit),
  ];
}
