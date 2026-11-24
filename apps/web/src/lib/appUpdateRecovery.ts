import { buildTelemetryRouteLabel } from "../../../../shared/routePrivacy";
import { isLikelyModuleLoadFailure, readErrorMessage, setResilientImportSkipRetry } from "./resilientLazy";

const MODULE_LOAD_RECOVERY_KEY = "polynet-module-load-recovery";
const MODULE_LOAD_RECOVERY_WINDOW_MS = 30_000;
const VERSION_CHECK_THROTTLE_MS = 120_000;
const VERSION_PROBE_TIMEOUT_MS = 1_500;

type ModuleLoadRecoveryMarker = {
  target?: unknown;
  at?: unknown;
  buildId?: unknown;
};

type ServedVersionPayload = {
  buildId?: unknown;
};

type RecoveryRuntime = {
  buildId: string;
  baseUrl: string;
  isProduction: boolean;
};

let runtime: RecoveryRuntime = {
  buildId: "unknown",
  baseUrl: "/",
  isProduction: false,
};
let updateAvailable = false;
let lastVersionCheckAt = 0;
let inflightVersionCheck: Promise<boolean> | null = null;
let reloadScheduled = false;

export function configureAppUpdateRecovery(next: Partial<RecoveryRuntime>): void {
  runtime = {
    buildId: String(next.buildId ?? runtime.buildId).trim() || "unknown",
    baseUrl: String(next.baseUrl ?? runtime.baseUrl).trim() || "/",
    isProduction: Boolean(next.isProduction ?? runtime.isProduction),
  };
  setResilientImportSkipRetry(isAppUpdateAvailable);
}

export function resetAppUpdateRecoveryForTests(): void {
  updateAvailable = false;
  lastVersionCheckAt = 0;
  inflightVersionCheck = null;
  reloadScheduled = false;
  runtime = { buildId: "unknown", baseUrl: "/", isProduction: false };
  setResilientImportSkipRetry(null);
}

export function isAppUpdateAvailable(): boolean {
  return updateAvailable;
}

export function currentRecoveryTarget(): string {
  if (typeof window === "undefined" || !window.location) return "/";
  return buildTelemetryRouteLabel({
    pathname: window.location.pathname,
    search: window.location.search,
  });
}

export function buildModuleLoadRecoveryExtras(error: unknown): Record<string, unknown> {
  return {
    recoveryTarget: currentRecoveryTarget(),
    appBuildId: runtime.buildId,
    updateAvailable,
    errorMessage: readErrorMessage(error) || null,
  };
}

function readRecoveryMarker(): ModuleLoadRecoveryMarker | null {
  try {
    const raw = window.sessionStorage?.getItem(MODULE_LOAD_RECOVERY_KEY);
    return raw ? (JSON.parse(raw) as ModuleLoadRecoveryMarker) : null;
  } catch {
    return null;
  }
}

export function canAttemptModuleReload(now = Date.now()): boolean {
  if (typeof window === "undefined" || !window.location) return false;
  if (reloadScheduled) return true;
  const parsed = readRecoveryMarker();
  if (!parsed) return true;
  const target = String(parsed.target ?? "").trim();
  const buildId = String(parsed.buildId ?? "").trim();
  const at = Number(parsed.at ?? 0);
  if (!target || !Number.isFinite(at) || buildId !== runtime.buildId || target !== currentRecoveryTarget()) return true;
  return Math.max(0, now - at) > MODULE_LOAD_RECOVERY_WINDOW_MS;
}

export function markModuleReloadAttempt(now = Date.now()): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.setItem(
      MODULE_LOAD_RECOVERY_KEY,
      JSON.stringify({ target: currentRecoveryTarget(), at: now, buildId: runtime.buildId }),
    );
  } catch { /* best-effort */ }
}

export function clearModuleReloadAttempt(): void {
  if (typeof window === "undefined") return;
  try { window.sessionStorage?.removeItem(MODULE_LOAD_RECOVERY_KEY); } catch { /* best-effort */ }
}

export function buildVersionProbeUrl(now = Date.now()): string {
  const base = runtime.baseUrl.replace(/\/?$/, "/");
  const rawOrigin = typeof window !== "undefined" ? (window.location?.origin ?? "") : "";
  const origin = rawOrigin && rawOrigin !== "null" ? rawOrigin : "https://www.polynet.ai";
  const url = new URL(`${base}version.json`, origin);
  url.searchParams.set("t", String(now));
  return url.toString();
}

export async function readServedBuildId(options?: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<string | null> {
  const fetchImpl = options?.fetchImpl ?? (typeof fetch === "function" ? fetch : null);
  if (!fetchImpl) return null;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId =
    controller && typeof setTimeout === "function"
      ? setTimeout(() => controller.abort(), options?.timeoutMs ?? VERSION_PROBE_TIMEOUT_MS)
      : null;
  try {
    const response = await fetchImpl(buildVersionProbeUrl(), {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller?.signal,
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as ServedVersionPayload;
    const buildId = String(payload?.buildId ?? "").trim();
    return buildId || null;
  } catch {
    return null;
  } finally {
    if (timeoutId !== null && typeof clearTimeout === "function") {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Quietly probes `/version.json` to see if a newer production build is live.
 * Throttled so frequent tab switches never spam the network.
 */
export async function checkForAppUpdate(options?: {
  force?: boolean;
  now?: number;
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  if (updateAvailable) return true;
  if (!runtime.isProduction || !runtime.buildId || runtime.buildId === "unknown") return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  const now = options?.now ?? Date.now();
  if (!options?.force && lastVersionCheckAt > 0 && now - lastVersionCheckAt < VERSION_CHECK_THROTTLE_MS) {
    return false;
  }
  if (inflightVersionCheck) return inflightVersionCheck;
  lastVersionCheckAt = now;
  inflightVersionCheck = readServedBuildId({ fetchImpl: options?.fetchImpl })
    .then((servedBuildId) => {
      if (servedBuildId && servedBuildId !== runtime.buildId) {
        updateAvailable = true;
        return true;
      }
      return false;
    })
    .finally(() => {
      inflightVersionCheck = null;
    });
  return inflightVersionCheck;
}

async function reloadAfterVersionProbe(reloadImpl: () => void): Promise<void> {
  if (updateAvailable) {
    reloadImpl();
    return;
  }
  const servedBuildId = await readServedBuildId();
  if (servedBuildId && servedBuildId !== runtime.buildId) {
    updateAvailable = true;
    reloadImpl();
    return;
  }
  window.setTimeout(reloadImpl, 100);
}

/**
 * Triggers a single guarded reload on stale-bundle / chunk-load errors.
 * Returns `true` when an automatic reload is actively in progress so callers
 * can keep the surface calm instead of flashing a manual crash screen.
 */
export function attemptModuleLoadRecovery(
  error: unknown,
  options?: { force?: boolean; strict?: boolean; reloadImpl?: () => void },
): boolean {
  if (typeof window === "undefined" || !window.location) return false;
  if (!isLikelyModuleLoadFailure(error, options)) return false;
  if (reloadScheduled) return true;
  if (!canAttemptModuleReload()) return false;
  reloadScheduled = true;
  markModuleReloadAttempt();
  const reload = options?.reloadImpl ?? (() => window.location.reload());
  void reloadAfterVersionProbe(reload);
  return true;
}

/**
 * Installs quiet wake-up listeners so tabs left open across a deploy detect
 * the newer build as soon as the user returns.
 */
export function installAppUpdateWakeupListeners(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      void checkForAppUpdate();
    }
  };
  const onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    void checkForAppUpdate({ force: true }).then((hasUpdate) => {
      if (hasUpdate && canAttemptModuleReload()) {
        attemptModuleLoadRecovery(new Error("bfcache stale deploy"), { force: true });
      }
    });
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pageshow", onPageShow);
  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pageshow", onPageShow);
  };
}
