import React from "react";
import { captureAppException } from "../instrument";
import { isLikelyModuleLoadFailure } from "../lib/resilientLazy";

type SurfaceErrorBoundaryProps = {
  /** Changing resetKey (e.g. switching tabs or communities) clears any error automatically. */
  resetKey: string;
  children: React.ReactNode;
};

type SurfaceErrorBoundaryState = {
  error: Error | null;
  isModuleLoadError: boolean;
  retryCount: number;
};

/**
 * Isolates render or chunk-load errors to the active content surface so the
 * sidebar, community switcher, and navigation stay alive. Switching to any
 * other tab recovers automatically without reloading the entire app.
 */
export class SurfaceErrorBoundary extends React.Component<
  SurfaceErrorBoundaryProps,
  SurfaceErrorBoundaryState
> {
  state: SurfaceErrorBoundaryState = {
    error: null,
    isModuleLoadError: false,
    retryCount: 0,
  };

  static getDerivedStateFromError(error: Error): Partial<SurfaceErrorBoundaryState> {
    return {
      error,
      isModuleLoadError: isLikelyModuleLoadFailure(error),
    };
  }

  componentDidUpdate(prevProps: SurfaceErrorBoundaryProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null, isModuleLoadError: false });
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    captureAppException(error, {
      tags: {
        surface_error_boundary: true,
        module_load_error: isLikelyModuleLoadFailure(error),
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
    this.setState((prev) => ({
      error: null,
      isModuleLoadError: false,
      retryCount: prev.retryCount + 1,
    }));
  };

  render() {
    if (!this.state.error) {
      return <React.Fragment key={this.state.retryCount}>{this.props.children}</React.Fragment>;
    }

    const title = this.state.isModuleLoadError
      ? "A newer version of Polynet is ready"
      : "Couldn't load this page";
    const copy = this.state.isModuleLoadError
      ? "Polynet updated while this tab was open. Refresh to pick up the latest version."
      : "Something interrupted this view. You can try again here, or switch to another tab.";
    const buttonLabel = this.state.isModuleLoadError ? "Refresh" : "Try again";

    return (
      <div
        role="alert"
        style={{
          display: "grid",
          placeItems: "center",
          minHeight: "50vh",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 380,
            padding: 20,
            borderRadius: 12,
            border: "1px solid var(--border-subtle, rgba(255,255,255,0.12))",
            background: "var(--bg-surface, var(--surface-1, rgba(255,255,255,0.03)))",
            color: "var(--text-primary, inherit)",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 13.5,
              lineHeight: 1.5,
              color: "var(--text-secondary, rgba(255,255,255,0.68))",
            }}
          >
            {copy}
          </p>
          <button
            type="button"
            onClick={this.handleRecover}
            style={{
              marginTop: 14,
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid var(--border-subtle, rgba(255,255,255,0.16))",
              background: "var(--bg-elevated, rgba(255,255,255,0.08))",
              color: "var(--text-primary, inherit)",
              fontSize: 13.5,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    );
  }
}
