import React from "react";
import { captureAppException } from "../instrument";
import { attemptModuleLoadRecovery, canAttemptModuleReload } from "../lib/appUpdateRecovery";
import { isLikelyModuleLoadFailure } from "../lib/resilientLazy";

const AUTO_RELOAD_FALLBACK_TIMEOUT_MS = 3_500;

type SurfaceErrorBoundaryProps = {
  /** Changing resetKey (e.g. switching tabs or communities) clears any error automatically. */
  resetKey: string;
  children: React.ReactNode;
};

type SurfaceErrorBoundaryState = {
  error: Error | null;
  isModuleLoadError: boolean;
  isAutoReloading: boolean;
  retryCount: number;
};

export function RecoveryCard(props: {
  title: string;
  copy: string;
  buttonLabel: string;
  onAction: () => void;
  fullScreen?: boolean;
}) {
  return (
    <div
      role="alert"
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: props.fullScreen ? "100vh" : "50vh",
        padding: 24,
        ...(props.fullScreen
          ? {
              background: "var(--bg-app, #08090a)",
              color: "var(--text-primary, rgba(245,245,247,0.92))",
              fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
            }
          : null),
      }}
    >
      <div
        style={{
          maxWidth: 380,
          padding: 20,
          borderRadius: 12,
          border: "1px solid var(--border-subtle, rgba(255,255,255,0.12))",
          background: "var(--bg-surface, var(--bg-card, rgba(255,255,255,0.03)))",
          color: "var(--text-primary, inherit)",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600 }}>{props.title}</div>
        <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.5, color: "var(--text-secondary, rgba(255,255,255,0.68))" }}>
          {props.copy}
        </p>
        <button
          type="button"
          onClick={props.onAction}
          style={{
            marginTop: 14,
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid var(--border-subtle, rgba(255,255,255,0.16))",
            background: "var(--bg-elevated, var(--bg-card, rgba(255,255,255,0.08)))",
            color: "var(--text-primary, inherit)",
            fontSize: 13.5,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          {props.buttonLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * Isolates render or chunk-load errors to the active content surface so the
 * sidebar, community switcher, and navigation stay alive. Switching to any
 * other tab recovers automatically without reloading the entire app.
 */
export class SurfaceErrorBoundary extends React.Component<
  SurfaceErrorBoundaryProps,
  SurfaceErrorBoundaryState
> {
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  state: SurfaceErrorBoundaryState = {
    error: null,
    isModuleLoadError: false,
    isAutoReloading: false,
    retryCount: 0,
  };

  static getDerivedStateFromError(error: Error): Partial<SurfaceErrorBoundaryState> {
    const isModuleLoadError = isLikelyModuleLoadFailure(error);
    return {
      error,
      isModuleLoadError,
      isAutoReloading: isModuleLoadError && canAttemptModuleReload(),
    };
  }

  componentDidUpdate(prevProps: SurfaceErrorBoundaryProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.clearFallbackTimer();
      this.setState({ error: null, isModuleLoadError: false, isAutoReloading: false });
    }
  }

  componentWillUnmount() {
    this.clearFallbackTimer();
  }

  private clearFallbackTimer() {
    if (this.fallbackTimer !== null) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const isModuleLoadError = isLikelyModuleLoadFailure(error);
    const reloading = isModuleLoadError ? attemptModuleLoadRecovery(error) : false;
    if (reloading) {
      this.clearFallbackTimer();
      this.fallbackTimer = setTimeout(() => {
        this.fallbackTimer = null;
        this.setState((prev) => (prev.isAutoReloading ? { isAutoReloading: false } : null));
      }, AUTO_RELOAD_FALLBACK_TIMEOUT_MS);
    } else if (this.state.isAutoReloading) {
      this.setState({ isAutoReloading: false });
    }
    captureAppException(error, {
      tags: {
        surface_error_boundary: true,
        module_load_error: isModuleLoadError,
        module_load_recovery: reloading,
      },
      extras: {
        resetKey: this.props.resetKey,
      },
      contexts: {
        react: {
          componentStack: info.componentStack,
        },
      },
    });
  }

  private handleRecover = () => {
    if (this.state.isModuleLoadError) {
      window.location.reload();
      return;
    }
    this.clearFallbackTimer();
    this.setState((prev) => ({
      error: null,
      isModuleLoadError: false,
      isAutoReloading: false,
      retryCount: prev.retryCount + 1,
    }));
  };

  render() {
    if (!this.state.error) {
      return <React.Fragment key={this.state.retryCount}>{this.props.children}</React.Fragment>;
    }

    if (this.state.isAutoReloading) {
      return <div aria-busy="true" style={{ minHeight: "50vh" }} />;
    }

    const title = this.state.isModuleLoadError
      ? "A newer version of Polynet is ready"
      : "Couldn't load this page";
    const copy = this.state.isModuleLoadError
      ? "Polynet updated while this tab was open. Refresh to pick up the latest version."
      : "Something interrupted this view. You can try again here, or switch to another tab.";
    return (
      <RecoveryCard
        title={title}
        copy={copy}
        buttonLabel={this.state.isModuleLoadError ? "Refresh" : "Try again"}
        onAction={this.handleRecover}
      />
    );
  }
}
