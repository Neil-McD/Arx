import { useEffect, useMemo, useState } from "react";
import type { AuthSession } from "../../../../shared/authCore";
import type { ConvexAuthenticatedSessionProbeResult } from "../../../../shared/convexAuthSessionProbe";
import { fetchCloudAuthActorDebug, type CloudAuthActorDebugRow } from "../../../../shared/cloudAuthDebugGateway";
import { useWorkOsRuntime } from "../auth/workosRuntime";

declare global {
  interface Window {
    __authDebugData?: Record<string, unknown>;
  }
}

function isAuthDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.location.hash.includes("debugAuth=1")) return true;
    if (new URLSearchParams(window.location.search).get("debugAuth") === "1") return true;
    if (window.localStorage.getItem("debug:auth") === "1") return true;
  } catch {
    // ignore
  }
  return false;
}

function formatError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return "unknown_error";
}

type WebAuthContinuityDebugPanelProps = {
  session: AuthSession | null;
  authError: string | null;
  authRuntimeAcceptance: ConvexAuthenticatedSessionProbeResult | null;
  authProbeEvents: { ts: number; stage: string; detail: Record<string, unknown> }[];
};

export function WebAuthContinuityDebugPanel(props: WebAuthContinuityDebugPanelProps) {
  const workos = useWorkOsRuntime();
  const [enabled, setEnabled] = useState<boolean>(() => isAuthDebugEnabled());
  const [actorDebug, setActorDebug] = useState<CloudAuthActorDebugRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const sync = () => setEnabled(isAuthDebugEnabled());
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !props.session) {
      setActorDebug(null);
      setLoadError(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    void fetchCloudAuthActorDebug({ session: props.session })
      .then((result) => {
        if (cancelled) return;
        setActorDebug(result.actorDebug);
        setLoadError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setActorDebug(null);
        setLoadError(formatError(error));
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, props.session]);

  const panelPayload = useMemo<Record<string, unknown>>(() => ({
    enabled,
    authError: props.authError,
    session: props.session
      ? {
          userId: props.session.user.id,
          email: props.session.user.email ?? null,
          displayName: props.session.user.displayName ?? null,
          expiresAt: props.session.expires_at,
        }
      : null,
    workos: {
      isEnabled: workos.isEnabled,
      isLoading: workos.isLoading,
      userId: workos.user?.id ?? null,
      email: workos.user?.email ?? null,
      authenticationMethod: workos.authenticationMethod ?? null,
    },
    sessionMismatch: Boolean(workos.user && !props.session),
    lastRuntimeAcceptance: props.authRuntimeAcceptance,
    authProbeEvents: props.authProbeEvents,
    actorDebug,
    loadError,
    isLoading,
  }), [
    actorDebug,
    props.authProbeEvents,
    enabled,
    isLoading,
    loadError,
    props.authError,
    props.authRuntimeAcceptance,
    props.session,
    workos.authenticationMethod,
    workos.isEnabled,
    workos.isLoading,
    workos.user?.email,
    workos.user?.id,
  ]);

  useEffect(() => {
    if (!enabled) return;
    window.__authDebugData = panelPayload;
  }, [enabled, panelPayload]);

  if (!enabled) return null;

  return (
    <aside
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 2000,
        width: "min(480px, calc(100vw - 32px))",
        maxHeight: "min(60vh, 720px)",
        overflow: "auto",
        padding: 12,
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(10,10,12,0.96)",
        boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
        color: "#f5f7fb",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 11,
        lineHeight: 1.5,
        whiteSpace: "pre-wrap",
      }}
    >
      <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700 }}>Auth Debug</div>
      <pre style={{ margin: 0 }}>{JSON.stringify(panelPayload, null, 2)}</pre>
    </aside>
  );
}
