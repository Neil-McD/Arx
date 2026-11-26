import React from "react";
import { captureAppException } from "../instrument";
import { attemptModuleLoadRecovery, canAttemptModuleReload } from "../lib/appUpdateRecovery";
import { isLikelyModuleLoadFailure } from "../lib/resilientLazy";
import { WaitScreen } from "./WaitScreen";

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

// A page or the whole app couldn't carry on: the shared in-between screen,
// one plain line and one button (WaitScreen.tsx).
export function RecoveryCard(props: {
  line: string;
  buttonLabel: string;
  onAction: () => void;
  fullScreen?: boolean;
}) {
  return <WaitScreen inline={!props.fullScreen} line={props.line} action={{ label: props.buttonLabel, onClick: props.onAction }} />;
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

    const line = this.state.isModuleLoadError
      ? "A newer version of Polynet is ready. Refresh to get it."
      : "This page didn't load.";
    return (
      <RecoveryCard
        line={line}
        buttonLabel={this.state.isModuleLoadError ? "Refresh" : "Try again"}
        onAction={this.handleRecover}
      />
    );
  }
}
