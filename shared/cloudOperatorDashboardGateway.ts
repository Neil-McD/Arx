import type { AuthSessionLike } from "./authSession";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";
import type {
  OperatorAccessSnapshot,
  OperatorAccountSetupSnapshot,
  OperatorAuthAccessDiagnosticsSnapshot,
  OperatorCommunityRecord,
  OperatorEventRecord,
  OperatorEmailAuthDiagnosticSnapshot,
  OperatorFrontendErrorDiagnosticsSnapshot,
  OperatorMonetizationSnapshot,
  OperatorOverviewSnapshot,
  OperatorPartnerPerformanceSnapshot,
  OperatorPartnerPayoutCyclesSnapshot,
  OperatorRange,
  OperatorRiskItem,
  OperatorRuntimeToolDiagnosticsSnapshot,
  OperatorSecurityAuditDiagnosticsSnapshot,
  OperatorToolEconomicsSnapshot,
  OperatorWebDeployAssetCheck,
  OperatorWebDeployDiagnosticsSnapshot,
  OperatorWebDeployRouteCheck,
} from "./operatorTypes";

async function withOperatorAuth(session: AuthSessionLike) {
  requireConvexUrl();
  return await bootstrapConvexAuthenticatedClient(session);
}

const OPERATOR_WEB_DEPLOY_ROUTE_PROBES: Array<{
  label: string;
  path: string;
  criticality: OperatorWebDeployRouteCheck["criticality"];
}> = [
  { label: "Home", path: "/", criticality: "critical" },
  { label: "Workspace", path: "/workspace", criticality: "critical" },
  { label: "Discover communities", path: "/discover", criticality: "important" },
  { label: "Integrations", path: "/settings/integrations", criticality: "important" },
];
const OPERATOR_WEB_DEPLOY_PROBE_TIMEOUT_MS = 4000;
const OPERATOR_WEB_DEPLOY_ASSET_PROBE_LIMIT = 8;

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

function normalizeSameOriginAssetPath(value: string): string | null {
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    if (!/\.(?:js|css)(?:$|\?)/i.test(`${url.pathname}${url.search}`)) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function readHtmlAssetAttribute(tag: string, attribute: "src" | "href"): string | null {
  const match = tag.match(new RegExp(`\\b${attribute}=["']([^"']+)["']`, "i"));
  return match?.[1] ? String(match[1]) : null;
}

function extractSameOriginAssetsFromHtml(html: string): Array<{
  label: string;
  path: string;
  type: OperatorWebDeployAssetCheck["type"];
}> {
  const assets: Array<{
    label: string;
    path: string;
    type: OperatorWebDeployAssetCheck["type"];
  }> = [];
  const seenPaths = new Set<string>();
  const pushAsset = (label: string, value: string | null, type: OperatorWebDeployAssetCheck["type"]) => {
    if (!value) return;
    const path = normalizeSameOriginAssetPath(value);
    if (!path || seenPaths.has(path)) return;
    seenPaths.add(path);
    assets.push({ label, path, type });
  };

  for (const match of html.matchAll(/<script\b[^>]*\bsrc=["'][^"']+["'][^>]*>/gi)) {
    pushAsset("Script asset", readHtmlAssetAttribute(match[0], "src"), "script");
  }
  for (const match of html.matchAll(/<link\b[^>]*\bhref=["'][^"']+["'][^>]*>/gi)) {
    const tag = match[0];
    if (!/\brel=["'][^"']*(?:stylesheet|modulepreload)[^"']*["']/i.test(tag)) continue;
    const value = readHtmlAssetAttribute(tag, "href");
    const type = value && /\.css(?:$|\?)/i.test(value) ? "style" : "script";
    pushAsset(type === "style" ? "Stylesheet asset" : "Preloaded script asset", value, type);
  }

  return assets.slice(0, OPERATOR_WEB_DEPLOY_ASSET_PROBE_LIMIT);
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
  route: { label: string; path: string; criticality: OperatorWebDeployRouteCheck["criticality"] },
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
      criticality: route.criticality,
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
      criticality: route.criticality,
      status: "failed",
      httpStatus: null,
      latencyMs: Math.max(0, Date.now() - startedAt),
      checkedAt: Date.now(),
      errorCode: readProbeErrorCode(error),
    };
  }
}

async function readSameOriginAssetRefsFromHtml(): Promise<Array<{
  label: string;
  path: string;
  type: OperatorWebDeployAssetCheck["type"];
}>> {
  try {
    const response = await fetchSameOriginWithTimeout(buildSameOriginUrl("/"), {
      cache: "no-store",
      credentials: "same-origin",
      redirect: "follow",
    });
    if (!response.ok) return [];
    return extractSameOriginAssetsFromHtml(await response.text());
  } catch {
    return [];
  }
}

async function probeSameOriginAsset(asset: {
  label: string;
  path: string;
  type: OperatorWebDeployAssetCheck["type"];
}): Promise<OperatorWebDeployAssetCheck> {
  const startedAt = Date.now();
  try {
    const response = await fetchSameOriginWithTimeout(buildSameOriginUrl(asset.path), {
      cache: "no-store",
      credentials: "same-origin",
      redirect: "follow",
    });
    const latencyMs = Math.max(0, Date.now() - startedAt);
    return {
      label: asset.label,
      path: asset.path,
      type: asset.type,
      status: response.ok ? "ok" : "failed",
      httpStatus: response.status,
      latencyMs,
      checkedAt: Date.now(),
      errorCode: response.ok ? null : `http_${response.status}`,
    };
  } catch (error) {
    return {
      label: asset.label,
      path: asset.path,
      type: asset.type,
      status: "failed",
      httpStatus: null,
      latencyMs: Math.max(0, Date.now() - startedAt),
      checkedAt: Date.now(),
      errorCode: readProbeErrorCode(error),
    };
  }
}

function countRoutesByCriticality(
  routeChecks: OperatorWebDeployRouteCheck[],
  criticality: OperatorWebDeployRouteCheck["criticality"],
): { total: number; failed: number } {
  const rows = routeChecks.filter((check) => check.criticality === criticality);
  return {
    total: rows.length,
    failed: rows.filter((check) => check.status === "failed").length,
  };
}

function buildWebLiveSurface(params: {
  build: Awaited<ReturnType<typeof readCurrentBuildFromVersionJson>>;
  routeChecks: OperatorWebDeployRouteCheck[];
  assetChecks: OperatorWebDeployAssetCheck[];
}): NonNullable<OperatorWebDeployDiagnosticsSnapshot["liveSurface"]> {
  const criticalRoutes = countRoutesByCriticality(params.routeChecks, "critical");
  const importantRoutes = countRoutesByCriticality(params.routeChecks, "important");
  const informationalRoutes = countRoutesByCriticality(params.routeChecks, "informational");
  const assetFailures = params.assetChecks.filter((check) => check.status === "failed").length;
  const assetEvidenceMissing = params.assetChecks.length <= 0;
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
          criticalRoutes.failed * 40 -
          importantRoutes.failed * 18 -
          informationalRoutes.failed * 8 -
          assetFailures * 16 -
          (params.build.reachable ? 0 : 18) -
          (assetEvidenceMissing ? 8 : 0),
      ),
    ),
  );
  const health: OperatorWebDeployDiagnosticsSnapshot["health"] =
    criticalRoutes.failed > 0 || assetFailures > 0 || !params.build.reachable
      ? "incident"
      : importantRoutes.failed > 0 || informationalRoutes.failed > 0 || assetEvidenceMissing
        ? "degraded"
        : "healthy";
  return {
    health,
    score,
    checkedAt: Date.now(),
    versionJsonReachable: params.build.reachable,
    currentBuildId: params.build.buildId,
    criticalRoutes,
    importantRoutes,
    informationalRoutes,
    assetChecks: params.assetChecks.length,
    assetFailures,
  };
}

function chooseWebDeployHealth(
  serverHealth: OperatorWebDeployDiagnosticsSnapshot["health"],
  liveSurface: OperatorWebDeployDiagnosticsSnapshot["liveSurface"] | null,
): OperatorWebDeployDiagnosticsSnapshot["health"] {
  if (liveSurface) return liveSurface.health;
  if (serverHealth === "incident") return "incident";
  if (serverHealth === "degraded") return "degraded";
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
  const assetRefs = await readSameOriginAssetRefsFromHtml();
  const assetChecks = await Promise.all(assetRefs.map(probeSameOriginAsset));
  const routeFailures = routeChecks.filter((check) => check.status === "failed").length;
  const assetFailures = assetChecks.filter((check) => check.status === "failed").length;
  const liveSurface = buildWebLiveSurface({ build, routeChecks, assetChecks });
  return {
    ...snapshot,
    computedAt: Date.now(),
    health: chooseWebDeployHealth(snapshot.health, liveSurface),
    liveSurface,
    currentBuild: {
      buildId: build.buildId,
      source: build.buildId ? "version_json" : "unknown",
      checkedAt: build.checkedAt,
    },
    totals: {
      ...snapshot.totals,
      routeChecks: routeChecks.length,
      routeFailures,
      assetChecks: assetChecks.length,
      assetFailures,
    },
    routeChecks,
    assetChecks,
    evidence: {
      ...snapshot.evidence,
      sourceTables: [...new Set([...snapshot.evidence.sourceTables, "version.json", "same-origin route probes", "same-origin asset probes"])],
      routeProbePaths: OPERATOR_WEB_DEPLOY_ROUTE_PROBES.map((route) => route.path),
      assetProbePaths: assetChecks.map((asset) => asset.path),
      routeProbeTimeoutMs: OPERATOR_WEB_DEPLOY_PROBE_TIMEOUT_MS,
      versionJsonReachable: build.reachable,
    },
  };
}

export async function loadOptionalOperatorAccessCanonical(params: {
  session: AuthSessionLike;
}): Promise<OperatorAccessSnapshot | null> {
  const { client, authSubject, bootstrap } = await withOperatorAuth(params.session);
  const access = (await client.query("operatorAccess:getMyOperatorAccessOptional" as any, {
    authSubject,
  })) as OperatorAccessSnapshot | null;
  if (!access) return null;
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

export async function loadOperatorCommunitiesCanonical(params: {
  session: AuthSessionLike;
  query?: string;
  limit?: number;
}): Promise<OperatorCommunityRecord[]> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  return (await client.query("operatorDashboard:listOperatorCommunities" as any, {
    authSubject,
    query: params.query,
    limit: params.limit ?? 25,
  })) as OperatorCommunityRecord[];
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

export async function loadOperatorPartnerPayoutCyclesCanonical(params: {
  session: AuthSessionLike;
  limit?: number;
}): Promise<OperatorPartnerPayoutCyclesSnapshot> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  return (await client.query("builderPartners:listPartnerPayoutCyclesForOperator" as any, {
    authSubject,
    limit: params.limit ?? 12,
  })) as OperatorPartnerPayoutCyclesSnapshot;
}

export async function loadOperatorPartnerPerformanceCanonical(params: {
  session: AuthSessionLike;
  range?: OperatorRange;
  limit?: number;
}): Promise<OperatorPartnerPerformanceSnapshot> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  return (await client.query("builderPartners:listPartnerPerformanceForOperator" as any, {
    authSubject,
    range: params.range ?? "30d",
    limit: params.limit ?? 12,
  })) as OperatorPartnerPerformanceSnapshot;
}

export async function approveOperatorPartnerPayoutCycleCanonical(params: {
  session: AuthSessionLike;
  cycleId: string;
}): Promise<void> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  await client.mutation("builderPartners:approvePartnerPayoutCycle" as any, {
    authSubject,
    batchId: params.cycleId,
  });
}

export async function retryOperatorPartnerPayoutCycleCanonical(params: {
  session: AuthSessionLike;
  cycleId: string;
}): Promise<void> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  await client.mutation("builderPartners:retryPartnerPayoutCycle" as any, {
    authSubject,
    batchId: params.cycleId,
  });
}

export async function holdOperatorPartnerPayoutCycleCanonical(params: {
  session: AuthSessionLike;
  cycleId: string;
  reason?: string;
}): Promise<void> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  await client.mutation("builderPartners:holdPartnerPayoutCycle" as any, {
    authSubject,
    batchId: params.cycleId,
    reason: params.reason ?? "operator_hold",
  });
}

export async function rejectOperatorPartnerPayoutCycleCanonical(params: {
  session: AuthSessionLike;
  cycleId: string;
  reason?: string;
}): Promise<void> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  await client.mutation("builderPartners:rejectPartnerPayoutCycle" as any, {
    authSubject,
    batchId: params.cycleId,
    reason: params.reason ?? "operator_rejected",
  });
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

export async function loadOperatorToolEconomicsCanonical(params: {
  session: AuthSessionLike;
  range?: OperatorRange;
}): Promise<OperatorToolEconomicsSnapshot> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  return (await client.query("operatorDashboard:getOperatorToolEconomics" as any, {
    authSubject,
    range: params.range ?? "30d",
  })) as OperatorToolEconomicsSnapshot;
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

export async function loadOperatorEmailAuthDiagnosticCanonical(params: {
  session: AuthSessionLike;
  includeWorkosUserLookup?: boolean;
}): Promise<OperatorEmailAuthDiagnosticSnapshot> {
  const { client, authSubject } = await withOperatorAuth(params.session);
  return (await client.action("emailDiagnostics:getOperatorEmailAuthDiagnostic" as any, {
    authSubject,
    includeWorkosUserLookup: params.includeWorkosUserLookup ?? true,
    userSampleLimit: 200,
    outboxPerStatusLimit: 100,
    deliverySampleLimit: 100,
  })) as OperatorEmailAuthDiagnosticSnapshot;
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
