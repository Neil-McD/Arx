import type { AuthSessionLike } from "./authSession";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";
import type {
  OperatorAccessSnapshot,
  OperatorAccountSetupSnapshot,
  OperatorAuthAccessDiagnosticsSnapshot,
  OperatorBuilderRecord,
  OperatorEventRecord,
  OperatorFrontendErrorDiagnosticsSnapshot,
  OperatorMonetizationSnapshot,
  OperatorOverviewSnapshot,
  OperatorRange,
  OperatorRiskItem,
  OperatorRuntimeToolDiagnosticsSnapshot,
  OperatorSecurityAuditDiagnosticsSnapshot,
  OperatorWebDeployDiagnosticsSnapshot,
  OperatorWebDeployRouteCheck,
} from "./operatorTypes";

async function withOperatorAuth(session: AuthSessionLike) {
  requireConvexUrl();
  return await bootstrapConvexAuthenticatedClient(session);
}

const OPERATOR_WEB_DEPLOY_ROUTE_PROBES: Array<{ label: string; path: string }> = [
  { label: "Home", path: "/" },
  { label: "Discover apps", path: "/discover/apps" },
  { label: "Integrations", path: "/settings/integrations" },
];
const OPERATOR_WEB_DEPLOY_PROBE_TIMEOUT_MS = 4000;

function canRunBrowserWebDeployProbes(): boolean {
  return typeof window !== "undefined" && typeof fetch === "function";
}

function buildSameOriginUrl(path: string): string {
  const origin = String(window.location.origin ?? "").replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalizedPath}`;
}

function buildVersionProbeUrl(): string {
  const url = new URL(buildSameOriginUrl("/version.json"));
  url.searchParams.set("t", String(Date.now()));
  return url.toString();
}

function readProbeErrorCode(error: unknown): string {
  return error instanceof Error && error.name === "AbortError"
    ? "timeout"
    : error instanceof Error
      ? error.name || "route_probe_failed"
      : "route_probe_failed";
}

async function fetchSameOriginWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), OPERATOR_WEB_DEPLOY_PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function readCurrentBuildFromVersionJson(): Promise<{
  buildId: string | null;
  sentryRelease: string | null;
  environment: string | null;
  checkedAt: number;
  reachable: boolean;
}> {
  const checkedAt = Date.now();
  try {
    const response = await fetchSameOriginWithTimeout(buildVersionProbeUrl(), {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) {
      return { buildId: null, sentryRelease: null, environment: null, checkedAt, reachable: false };
    }
    const payload = (await response.json()) as {
      buildId?: unknown;
      sentryRelease?: unknown;
      environment?: unknown;
    };
    const buildId = String(payload?.buildId ?? "").trim();
    const sentryRelease = String(payload?.sentryRelease ?? "").trim();
    const environment = String(payload?.environment ?? "").trim();
    return {
      buildId: buildId || null,
      sentryRelease: sentryRelease || null,
      environment: environment || null,
      checkedAt,
      reachable: true,
    };
  } catch {
    return { buildId: null, sentryRelease: null, environment: null, checkedAt, reachable: false };
  }
}

async function probeSameOriginRoute(
  route: { label: string; path: string },
): Promise<OperatorWebDeployRouteCheck> {
  const startedAt = Date.now();
  try {
    const response = await fetchSameOriginWithTimeout(buildSameOriginUrl(route.path), {
      cache: "no-store",
      credentials: "same-origin",
      redirect: "follow",
    });
    const latencyMs = Math.max(0, Date.now() - startedAt);
    return {
      label: route.label,
      path: route.path,
      status: response.ok ? "ok" : "failed",
      httpStatus: response.status,
      latencyMs,
      checkedAt: Date.now(),
      errorCode: response.ok ? null : `http_${response.status}`,
    };
  } catch (error) {
    return {
      label: route.label,
      path: route.path,
      status: "failed",
      httpStatus: null,
      latencyMs: Math.max(0, Date.now() - startedAt),
      checkedAt: Date.now(),
      errorCode: readProbeErrorCode(error),
    };
  }
}

function chooseWebDeployHealth(
  serverHealth: OperatorWebDeployDiagnosticsSnapshot["health"],
  routeFailures: number,
  versionJsonReachable: boolean,
): OperatorWebDeployDiagnosticsSnapshot["health"] {
  if (routeFailures > 0 || serverHealth === "incident") return "incident";
  if (!versionJsonReachable || serverHealth === "degraded") return "degraded";
  if (serverHealth === "unknown") return "unknown";
  return "healthy";
}

async function enrichWebDeployDiagnosticsWithBrowserProbes(
  snapshot: OperatorWebDeployDiagnosticsSnapshot,
): Promise<OperatorWebDeployDiagnosticsSnapshot> {
  if (!canRunBrowserWebDeployProbes()) return snapshot;
  const [build, routeChecks] = await Promise.all([
    readCurrentBuildFromVersionJson(),
    Promise.all(OPERATOR_WEB_DEPLOY_ROUTE_PROBES.map(probeSameOriginRoute)),
  ]);
  const routeFailures = routeChecks.filter((check) => check.status === "failed").length;
  return {
    ...snapshot,
    computedAt: Date.now(),
    health: chooseWebDeployHealth(snapshot.health, routeFailures, build.reachable),
    currentBuild: {
      buildId: build.buildId,
      source: build.buildId ? "version_json" : "unknown",
      checkedAt: build.checkedAt,
    },
    totals: {
      ...snapshot.totals,
      routeChecks: routeChecks.length,
      routeFailures,
    },
    routeChecks,
    evidence: {
      ...snapshot.evidence,
      sourceTables: [...new Set([...snapshot.evidence.sourceTables, "version.json", "same-origin route probes"])],
      routeProbePaths: OPERATOR_WEB_DEPLOY_ROUTE_PROBES.map((route) => route.path),
      routeProbeTimeoutMs: OPERATOR_WEB_DEPLOY_PROBE_TIMEOUT_MS,
      versionJsonReachable: build.reachable,
    },
  };
}

export async function loadOperatorAccessCanonical(params: {
  session: AuthSessionLike;
}): Promise<OperatorAccessSnapshot> {
  const { client, authSubject, bootstrap } = await withOperatorAuth(params.session);
  const access = (await client.query("operatorDashboard:getOperatorAccess" as any, {
    authSubject,
  })) as OperatorAccessSnapshot;
  const dbUserId = String(bootstrap?.dbUserId ?? "").trim();
  if (dbUserId && access.userId !== dbUserId) {
    throw new Error("operator_access_identity_mismatch");
  }
  return access;
}

export async function recordOperatorDashboardAccessCanonical(params: {
  session: AuthSessionLike;
  surface?: string;
}): Promise<void> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  await client.mutation("operatorAccess:recordOperatorDashboardAccess" as any, {
    authSubject,
    surface: params.surface ?? "operator_dashboard",
  });
}

export async function loadOperatorOverviewCanonical(params: {
  session: AuthSessionLike;
  range?: OperatorRange;
}): Promise<OperatorOverviewSnapshot> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  return (await client.query("operatorDashboard:getOperatorOverview" as any, {
    authSubject,
    range: params.range ?? "30d",
  })) as OperatorOverviewSnapshot;
}

export async function loadOperatorBuildersCanonical(params: {
  session: AuthSessionLike;
  query?: string;
  limit?: number;
}): Promise<OperatorBuilderRecord[]> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  return (await client.query("operatorDashboard:listOperatorBuilders" as any, {
    authSubject,
    query: params.query,
    limit: params.limit ?? 25,
  })) as OperatorBuilderRecord[];
}

export async function loadOperatorAccountSetupSnapshotCanonical(params: {
  session: AuthSessionLike;
  query?: string;
  currentStep?: OperatorAccountSetupSnapshot["users"]["rows"][number]["setup"]["current_step"];
  completed?: boolean;
  limit?: number;
}): Promise<OperatorAccountSetupSnapshot> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  return (await client.query("operatorDashboard:getOperatorAccountSetupSnapshot" as any, {
    authSubject,
    query: params.query,
    currentStep: params.currentStep,
    completed: params.completed,
    limit: params.limit ?? 25,
  })) as OperatorAccountSetupSnapshot;
}

export async function loadOperatorMonetizationCanonical(params: {
  session: AuthSessionLike;
  range?: OperatorRange;
}): Promise<OperatorMonetizationSnapshot> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  return (await client.query("operatorDashboard:getOperatorMonetization" as any, {
    authSubject,
    range: params.range ?? "30d",
  })) as OperatorMonetizationSnapshot;
}

export async function loadOperatorWebDeployDiagnosticsCanonical(params: {
  session: AuthSessionLike;
  range?: OperatorRange;
}): Promise<OperatorWebDeployDiagnosticsSnapshot> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  const snapshot = (await client.query("operatorDashboard:getOperatorWebDeployDiagnostics" as any, {
    authSubject,
    range: params.range ?? "30d",
  })) as OperatorWebDeployDiagnosticsSnapshot;
  return await enrichWebDeployDiagnosticsWithBrowserProbes(snapshot);
}

export async function loadOperatorAuthAccessDiagnosticsCanonical(params: {
  session: AuthSessionLike;
  range?: OperatorRange;
}): Promise<OperatorAuthAccessDiagnosticsSnapshot> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  return (await client.query("operatorDashboard:getOperatorAuthAccessDiagnostics" as any, {
    authSubject,
    range: params.range ?? "30d",
  })) as OperatorAuthAccessDiagnosticsSnapshot;
}

export async function loadOperatorSecurityAuditDiagnosticsCanonical(params: {
  session: AuthSessionLike;
  range?: OperatorRange;
}): Promise<OperatorSecurityAuditDiagnosticsSnapshot> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  return (await client.query("operatorDashboard:getOperatorSecurityAuditDiagnostics" as any, {
    authSubject,
    range: params.range ?? "30d",
  })) as OperatorSecurityAuditDiagnosticsSnapshot;
}

export async function loadOperatorRuntimeToolDiagnosticsCanonical(params: {
  session: AuthSessionLike;
  range?: OperatorRange;
}): Promise<OperatorRuntimeToolDiagnosticsSnapshot> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  return (await client.query("operatorDashboard:getOperatorRuntimeToolDiagnostics" as any, {
    authSubject,
    range: params.range ?? "30d",
  })) as OperatorRuntimeToolDiagnosticsSnapshot;
}

export async function loadOperatorFrontendErrorDiagnosticsCanonical(params: {
  session: AuthSessionLike;
  range?: OperatorRange;
}): Promise<OperatorFrontendErrorDiagnosticsSnapshot> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  const build = canRunBrowserWebDeployProbes()
    ? await readCurrentBuildFromVersionJson()
    : { buildId: null, sentryRelease: null, environment: null, checkedAt: Date.now(), reachable: false };
  return (await client.action("operatorSentryDiagnostics:getOperatorFrontendErrorDiagnostics" as any, {
    authSubject,
    range: params.range ?? "30d",
    currentBuildId: build.buildId ?? undefined,
    frontendSentryRelease: build.sentryRelease ?? undefined,
  })) as OperatorFrontendErrorDiagnosticsSnapshot;
}

export async function loadOperatorRisksCanonical(params: {
  session: AuthSessionLike;
  limit?: number;
}): Promise<OperatorRiskItem[]> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  return (await client.query("operatorDashboard:listOperatorRisks" as any, {
    authSubject,
    limit: params.limit ?? 25,
  })) as OperatorRiskItem[];
}

export async function loadOperatorEventsCanonical(params: {
  session: AuthSessionLike;
  eventType?: string;
  limit?: number;
}): Promise<OperatorEventRecord[]> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  return (await client.query("operatorDashboard:listOperatorEvents" as any, {
    authSubject,
    eventType: params.eventType,
    limit: params.limit ?? 25,
  })) as OperatorEventRecord[];
}
