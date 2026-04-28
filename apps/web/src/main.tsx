import { captureAppException } from "./instrument";
import "./posthogAnalytics";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { isLoginTrampolinePathname, LoginTrampolineRoute } from "./auth/loginTrampoline";
import { applyAppThemeAttributes, parseAppTheme } from "../../../shared/theme";
import { bootConvexProbe } from "../../../shared/convexRuntime";
import { bootstrapConvexAnonymousActor } from "../../../shared/convexAuthBootstrap";

type ErrorBoundaryState = {
  error: Error | null;
  isRecoveringModuleLoad: boolean;
};

const MODULE_LOAD_RECOVERY_KEY = "polynet-module-load-recovery";
const MODULE_LOAD_RECOVERY_WINDOW_MS = 30_000;
const MODULE_LOAD_ERROR_PATTERNS = [
  "importing a module script failed",
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "failed to load module script",
  "unable to preload css",
  "chunkloaderror",
];

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`.trim();
  }
  if (typeof error === "string") return error.trim();
  if (!error || typeof error !== "object") return "";
  const record = error as Record<string, unknown>;
  const message = String(record.message ?? "").trim();
  const name = String(record.name ?? "").trim();
  return [name, message].filter(Boolean).join(": ");
}

function isLikelyModuleLoadFailure(error: unknown): boolean {
  const message = readErrorMessage(error).toLowerCase();
  if (!message) return false;
  return MODULE_LOAD_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

function currentRecoveryTarget(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function buildModuleLoadRecoveryExtras(error: unknown): Record<string, unknown> {
  return {
    recoveryTarget: currentRecoveryTarget(),
    errorMessage: readErrorMessage(error) || null,
  };
}

function shouldAttemptModuleReload(): boolean {
  try {
    const raw = sessionStorage.getItem(MODULE_LOAD_RECOVERY_KEY);
    if (!raw) return true;
    const parsed = JSON.parse(raw) as { target?: unknown; at?: unknown } | null;
    const target = String(parsed?.target ?? "").trim();
    const at = Number(parsed?.at ?? 0);
    if (!target || !Number.isFinite(at)) return true;
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

function attemptModuleLoadRecovery(error: unknown): boolean {
  if (typeof window === "undefined") return false;
  if (!isLikelyModuleLoadFailure(error)) return false;
  if (!shouldAttemptModuleReload()) return false;
  markModuleReloadAttempt();
  window.setTimeout(() => {
    window.location.reload();
  }, 0);
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

    if (this.state.isRecoveringModuleLoad) {
      return (
        <div
          aria-hidden="true"
          style={{
            minHeight: "100vh",
            background: "#111113",
          }}
        />
      );
    }

    const message = this.state.error?.message ?? "Unknown error";
    const stack = this.state.error?.stack ?? "";
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

try {
  const savedTheme = parseAppTheme(localStorage.getItem("polynet-theme") ?? localStorage.getItem("arx-theme"));
  applyAppThemeAttributes(savedTheme ?? "polynet", document.documentElement);
} catch {
  applyAppThemeAttributes("polynet", document.documentElement);
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
    if (attemptModuleLoadRecovery(detail)) {
      captureAppException(detail, {
        tags: {
          preload_error: true,
          module_load_recovery: true,
        },
        extras: buildModuleLoadRecoveryExtras(detail),
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
  bootstrapConvexAnonymousActor();
}

const rootView = isLoginTrampoline
  ? <LoginTrampolineRoute />
  : <App />;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {rootView}
    </ErrorBoundary>
  </React.StrictMode>
);
