import { captureAppException } from "./instrument";
import "./posthogAnalytics";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource-variable/ibm-plex-sans/wght.css";
import "./index.css";
import { isLoginTrampolinePathname, LoginTrampolineRoute } from "./auth/loginTrampoline";
import { ACCESS_SIGN_IN_PATH, AccessSignInRoute } from "./auth/AccessSignInRoute";
import { bootConvexProbe } from "../../../shared/convexRuntime";
import { buildTelemetryRouteLabel } from "../../../shared/routePrivacy";
import { CommunityVisualIdentityRegistryProvider } from "../../../shared/CommunityVisualIdentityRegistry";
import { captureDistributionAttributionFromLocation } from '../../../shared/distributionAttribution';
import { captureCommunityReferralFromLocation } from '../../../shared/communityReferralCapture';
import { captureTestMemberRunFromLocation } from '../../../shared/testMemberRun';
import { WebTestRunBar } from './components/WebTestRunBar';
import { resolvePhoneShellRedirect } from '../../../shared/webAppRouteState';

captureDistributionAttributionFromLocation();
captureCommunityReferralFromLocation();
captureTestMemberRunFromLocation();
redirectPhoneToPhoneLayout();

function redirectPhoneToPhoneLayout() {
  try {
    const next = resolvePhoneShellRedirect({
      path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      narrowViewport: window.matchMedia("(max-width: 640px)").matches,
      embedded: window.self !== window.top,
    });
    if (next) window.history.replaceState(window.history.state, "", next);
  } catch {
    // Keep the desktop layout if the check fails.
  }
}

type ErrorBoundaryState = {
  error: Error | null;
  isRecoveringModuleLoad: boolean;
};

const APP_BUILD_ID = String(__POLYNET_BUILD_ID__ ?? "unknown").trim() || "unknown";
const MODULE_LOAD_RECOVERY_KEY = "polynet-module-load-recovery";
const MODULE_LOAD_RECOVERY_WINDOW_MS = 30_000;
const MODULE_LOAD_ERROR_PATTERNS = [
  "importing a module script failed",
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "failed to load module script",
  "module script load",
  "dynamically imported module",
  "dynamic import",
  "loading chunk",
  "chunk load failed",
  "loading css chunk",
  "css chunk load failed",
  "unable to preload css",
  "preloaderror",
  "vite:preloaderror",
  "network error",
  "networkerror",
  "load failed",
  "chunkloaderror",
];
const IS_PRODUCTION_BUILD = String(import.meta.env.MODE ?? "").trim().toLowerCase() === "production";

type ModuleLoadRecoveryMarker = {
  target?: unknown;
  at?: unknown;
  buildId?: unknown;
};

type ServedVersionPayload = {
  buildId?: unknown;
};

function readErrorMessage(error: unknown): string {
  return readErrorMessageAtDepth(error, 0);
}

function readErrorMessageAtDepth(error: unknown, depth: number): string {
  if (depth > 2) return "";
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`.trim();
  }
  if (typeof error === "string") return error.trim();
  if (!error || typeof error !== "object") return "";
  const record = error as Record<string, unknown>;
  const messageParts = [
    record.name,
    record.message,
    record.reason,
    record.type,
    record.href,
    record.src,
    record.url,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const nestedPayloadMessage = readErrorMessageAtDepth(record.payload, depth + 1);
  const nestedDetailMessage = readErrorMessageAtDepth(record.detail, depth + 1);
  const nestedErrorMessage = readErrorMessageAtDepth(record.error, depth + 1);
  return [...messageParts, nestedPayloadMessage, nestedDetailMessage, nestedErrorMessage]
    .filter(Boolean)
    .join(": ");
}

function isLikelyModuleLoadFailure(error: unknown, options?: { force?: boolean }): boolean {
  if (options?.force) return true;
  const message = readErrorMessage(error).toLowerCase();
  if (!message) return false;
  return MODULE_LOAD_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

function currentRecoveryTarget(): string {
  return buildTelemetryRouteLabel({
    pathname: window.location.pathname,
    search: window.location.search,
  });
}

function buildModuleLoadRecoveryExtras(error: unknown): Record<string, unknown> {
  return {
    recoveryTarget: currentRecoveryTarget(),
    appBuildId: APP_BUILD_ID,
    errorMessage: readErrorMessage(error) || null,
  };
}

function shouldAttemptModuleReload(): boolean {
  try {
    const raw = sessionStorage.getItem(MODULE_LOAD_RECOVERY_KEY);
    if (!raw) return true;
    const parsed = JSON.parse(raw) as ModuleLoadRecoveryMarker | null;
    const target = String(parsed?.target ?? "").trim();
    const buildId = String(parsed?.buildId ?? "").trim();
    const at = Number(parsed?.at ?? 0);
    if (!target || !Number.isFinite(at)) return true;
    if (buildId !== APP_BUILD_ID) return true;
    if (target !== currentRecoveryTarget()) return true;
    return Math.max(0, Date.now() - at) > MODULE_LOAD_RECOVERY_WINDOW_MS;
  } catch {
    return true;
  }
}

function markModuleReloadAttempt(): void {
  try {
    sessionStorage.setItem(
      MODULE_LOAD_RECOVERY_KEY,
      JSON.stringify({
        target: currentRecoveryTarget(),
        at: Date.now(),
        buildId: APP_BUILD_ID,
      }),
    );
  } catch {
    // Best-effort recovery marker only.
  }
}

function clearModuleReloadAttempt(): void {
  try {
    sessionStorage.removeItem(MODULE_LOAD_RECOVERY_KEY);
  } catch {
    // Best-effort recovery marker only.
  }
}

function buildVersionProbeUrl(): string {
  const base = String(import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");
  const url = new URL(`${base}version.json`, window.location.origin);
  url.searchParams.set("t", String(Date.now()));
  return url.toString();
}

async function readServedBuildId(): Promise<string | null> {
  try {
    const response = await fetch(buildVersionProbeUrl(), {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as ServedVersionPayload;
    const buildId = String(payload?.buildId ?? "").trim();
    return buildId || null;
  } catch {
    return null;
  }
}

async function reloadAfterVersionProbe(): Promise<void> {
  const servedBuildId = await readServedBuildId();
  const delayMs = servedBuildId && servedBuildId !== APP_BUILD_ID ? 0 : 100;
  window.setTimeout(() => {
    window.location.reload();
  }, delayMs);
}

function attemptModuleLoadRecovery(error: unknown, options?: { force?: boolean }): boolean {
  if (typeof window === "undefined") return false;
  if (!isLikelyModuleLoadFailure(error, options)) return false;
  if (!shouldAttemptModuleReload()) return false;
  markModuleReloadAttempt();
  void reloadAfterVersionProbe();
  return true;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null, isRecoveringModuleLoad: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      error,
      isRecoveringModuleLoad: isLikelyModuleLoadFailure(error),
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (attemptModuleLoadRecovery(error)) {
      captureAppException(error, {
        tags: {
          error_boundary: true,
          module_load_recovery: true,
        },
        extras: buildModuleLoadRecoveryExtras(error),
        contexts: {
          react: {
            componentStack: info.componentStack,
          },
        },
      });
      return;
    }
    captureAppException(error, {
      tags: {
        error_boundary: true,
      },
      contexts: {
        react: {
          componentStack: info.componentStack,
        },
      },
    });
    console.error("Web UI crashed", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const message = this.state.error?.message ?? "Unknown error";
    const stack = this.state.error?.stack ?? "";
    const title = this.state.isRecoveringModuleLoad ? "Updating Polynet" : "Refresh Polynet";
    const copy = this.state.isRecoveringModuleLoad
      ? "The app loaded stale files from a previous deploy. Refreshing should restore the latest version."
      : "Something interrupted the web app. Refreshing usually restores the current session.";

    if (IS_PRODUCTION_BUILD || this.state.isRecoveringModuleLoad) {
      return <CrashRecoveryScreen title={title} copy={copy} buttonLabel="Refresh" />;
    }

    return (
      <div style={{ padding: 24, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>Polynet Web UI crashed</h1>
        <p style={{ marginTop: 8, opacity: 0.8 }}>{message}</p>
        <button
          style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.15)",
          }}
          onClick={() => window.location.reload()}
          type="button"
        >
          Reload
        </button>
        {stack && (
          <pre
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 8,
              background: "rgba(0,0,0,0.06)",
              overflow: "auto",
              maxHeight: "50vh",
            }}
          >
            {stack}
          </pre>
        )}
      </div>
    );
  }
}

function CrashRecoveryScreen(props: { title: string; copy: string; buttonLabel: string }) {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "100vh",
        background: "#111113",
        color: "rgba(245,245,247,0.92)",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 360 }}>
        <div style={{ fontSize: 15, fontWeight: 650 }}>{props.title}</div>
        <p style={{ margin: "8px 0 0", color: "rgba(245,245,247,0.62)", lineHeight: 1.45 }}>
          {props.copy}
        </p>
        <button
          style={{
            marginTop: 16,
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.08)",
            color: "rgba(245,245,247,0.92)",
            cursor: "pointer",
          }}
          onClick={() => window.location.reload()}
          type="button"
        >
          {props.buttonLabel}
        </button>
      </div>
    </div>
  );
}

const isLoginTrampoline = isLoginTrampolinePathname(window.location.pathname || "/");

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    const preloadEvent = event as Event & {
      payload?: unknown;
      detail?: unknown;
      preventDefault?: () => void;
    };
    const detail =
      preloadEvent.payload ??
      ((preloadEvent.detail as Record<string, unknown> | null)?.payload ?? preloadEvent.detail);
    const recoveryError = detail ?? new Error("vite:preloadError");
    if (attemptModuleLoadRecovery(recoveryError, { force: true })) {
      captureAppException(recoveryError, {
        tags: {
          preload_error: true,
          module_load_recovery: true,
        },
        extras: buildModuleLoadRecoveryExtras(recoveryError),
      });
      preloadEvent.preventDefault?.();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (attemptModuleLoadRecovery(event.reason)) {
      captureAppException(event.reason, {
        tags: {
          unhandled_rejection: true,
          module_load_recovery: true,
        },
        extras: buildModuleLoadRecoveryExtras(event.reason),
      });
      event.preventDefault();
    }
  });

  window.setTimeout(() => {
    clearModuleReloadAttempt();
  }, 5000);
}

if (!isLoginTrampoline) {
  bootConvexProbe();
}

const rootView = isLoginTrampoline
  ? <LoginTrampolineRoute />
  : window.location.pathname === ACCESS_SIGN_IN_PATH ? <AccessSignInRoute />
  : <App />;

document.documentElement.setAttribute("data-polynet-build-id", APP_BUILD_ID);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <CommunityVisualIdentityRegistryProvider>
        {rootView}
        <WebTestRunBar />
      </CommunityVisualIdentityRegistryProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
