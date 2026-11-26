import { captureAppException } from "./instrument";
import "./posthogAnalytics";
import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "./base.css";
import { isLoginTrampolinePathname, LoginTrampolineRoute } from "./auth/loginTrampoline";
import { hasRecentAuthFlowPending } from "./authBrowserMarkers";
import { resolvePublicEntryRoute } from "../../../shared/publicEntryRoute";
import { stripShellVariantFromPathname } from "../../../shared/webAppRouteState";
import { CommunityVisualIdentityRegistryProvider } from "../../../shared/CommunityVisualIdentityRegistry";
import { captureDistributionAttributionFromLocation } from '../../../shared/distributionAttribution';
import {
  attemptModuleLoadRecovery,
  buildModuleLoadRecoveryExtras,
  canAttemptModuleReload,
  clearModuleReloadAttempt,
  configureAppUpdateRecovery,
  installAppUpdateWakeupListeners,
} from "./lib/appUpdateRecovery";
import { RecoveryCard } from "./components/SurfaceErrorBoundary";
import { WaitScreen } from "./components/WaitScreen";
import { SignedOutNote, takeSignedOutMarker } from "./components/SignedOutNote";
import { isLikelyModuleLoadFailure, resilientImport } from "./lib/resilientLazy";

// Design system v1's second voice (the agent) is loaded only when the build
// enabled v1, so the default app downloads nothing new.
if (document.documentElement.dataset.design === "v1") {
  void import("@fontsource-variable/newsreader/opsz.css");
}

captureDistributionAttributionFromLocation();
// Read before the address decides which page to show.
const justSignedOut = takeSignedOutMarker();

type ErrorBoundaryState = {
  error: Error | null;
  isRecoveringModuleLoad: boolean;
  isAutoReloading: boolean;
};

const APP_BUILD_ID = String(__POLYNET_BUILD_ID__ ?? "unknown").trim() || "unknown";
const AUTO_RELOAD_FALLBACK_TIMEOUT_MS = 3_500;

configureAppUpdateRecovery({
  buildId: APP_BUILD_ID,
  baseUrl: String(import.meta.env.BASE_URL ?? "/"),
  isProduction: import.meta.env.PROD,
});

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  state: ErrorBoundaryState = {
    error: null,
    isRecoveringModuleLoad: false,
    isAutoReloading: false,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const isRecoveringModuleLoad = isLikelyModuleLoadFailure(error);
    return {
      error,
      isRecoveringModuleLoad,
      isAutoReloading: isRecoveringModuleLoad && canAttemptModuleReload(),
    };
  }

  componentWillUnmount() {
    if (this.fallbackTimer !== null) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (attemptModuleLoadRecovery(error)) {
      if (this.fallbackTimer !== null) clearTimeout(this.fallbackTimer);
      this.fallbackTimer = setTimeout(() => {
        this.fallbackTimer = null;
        this.setState((prev) => (prev.isAutoReloading ? { isAutoReloading: false } : null));
      }, AUTO_RELOAD_FALLBACK_TIMEOUT_MS);
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
    if (this.state.isAutoReloading) {
      this.setState({ isAutoReloading: false });
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

    if (this.state.isAutoReloading) {
      return <WaitScreen delayed />;
    }

    const message = this.state.error?.message ?? "Unknown error";
    const stack = this.state.error?.stack ?? "";
    const line = this.state.isRecoveringModuleLoad
      ? "Polynet just updated. Refresh to get the latest."
      : "Something went wrong. Refresh to carry on where you were.";

    if (import.meta.env.PROD || this.state.isRecoveringModuleLoad) {
      return (
        <RecoveryCard
          fullScreen
          line={line}
          buttonLabel="Refresh"
          onAction={() => window.location.reload()}
        />
      );
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

const isLoginTrampoline = isLoginTrampolinePathname(window.location.pathname || "/");
const isConnectedAppAuthorize =
  (stripShellVariantFromPathname(window.location.pathname || "/").replace(/\/+$/, "") || "/") === "/oauth/authorize";

if (typeof window !== "undefined") {
  installAppUpdateWakeupListeners();

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
    if (attemptModuleLoadRecovery(event.reason, { strict: true })) {
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

// /design-lab: the design v1 kit with the mock's sample content, on builds
// with the design switch on (staging) only. It talks to no backend.
const isDesignLab =
  document.documentElement.dataset.design === "v1" && window.location.pathname === "/design-lab";
const DesignLab = React.lazy(() => resilientImport(() => import("./v1/DesignLab")).then((m) => ({ default: m.DesignLab })));
const WebConnectedAppAuthorizePage = React.lazy(() =>
  resilientImport(() => import("./components/WebConnectedAppAuthorizePage")).then((m) => ({ default: m.WebConnectedAppAuthorizePage })),
);
const App = React.lazy(() => resilientImport(() => import("./App")));
const WebPublicVisitorShell = React.lazy(() =>
  resilientImport(() => import("./components/WebPublicVisitorShell")).then((m) => ({ default: m.WebPublicVisitorShell })),
);

const publicEntryRoute =
  !isDesignLab && !isLoginTrampoline && !isConnectedAppAuthorize
    ? resolvePublicEntryRoute({
        pathname: window.location.pathname || "/",
        search: window.location.search || "",
        hasRecentAuthFlowPending: hasRecentAuthFlowPending(),
      })
    : null;

const rootView = isDesignLab
  ? <React.Suspense fallback={null}><DesignLab /></React.Suspense>
  : isLoginTrampoline
    ? <LoginTrampolineRoute />
    : isConnectedAppAuthorize
      ? <React.Suspense fallback={null}><WebConnectedAppAuthorizePage /></React.Suspense>
      : publicEntryRoute
        ? <React.Suspense fallback={null}><WebPublicVisitorShell initialRoute={publicEntryRoute} /></React.Suspense>
        : <React.Suspense fallback={<WaitScreen delayed />}><App /></React.Suspense>;

document.documentElement.setAttribute("data-polynet-build-id", APP_BUILD_ID);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <CommunityVisualIdentityRegistryProvider>
        {rootView}
        <SignedOutNote show={justSignedOut} />
      </CommunityVisualIdentityRegistryProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
