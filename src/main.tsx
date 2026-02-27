import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyAppThemeAttributes, parseAppTheme, type AppTheme } from "../shared/theme";
import { bootConvexProbe } from "../shared/convexRuntime";

type ErrorBoundaryState = { error: Error | null };

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("UI crashed", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const message = this.state.error?.message ?? "Unknown error";
    const stack = this.state.error?.stack ?? "";
    return (
      <div style={{ padding: 24, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>PolyNet UI crashed</h1>
        <p style={{ marginTop: 8, opacity: 0.8 }}>{message}</p>
        <button
          style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.15)"
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
              maxHeight: "50vh"
            }}
          >
            {stack}
          </pre>
        )}
      </div>
    );
  }
}

function resolveInitialDesktopTheme(): AppTheme {
  const stored = parseAppTheme(localStorage.getItem("arx-theme"));
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

try {
  applyAppThemeAttributes(resolveInitialDesktopTheme(), document.documentElement);
} catch {
  applyAppThemeAttributes("dark", document.documentElement);
}

bootConvexProbe();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
