import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthSessionLike } from "../../../../shared/authSession";
import {
  getConvexCloudRuntimeRunDaytonaPreviewSession,
  stopConvexCloudRuntimeRunDaytonaPreview,
} from "../../../../shared/cloudThreadsRead";
import { buildWorkspacePreviewProxyUrl } from "../lib/workspacePreviewProxy";

export type DaytonaRuntimePreviewAnchor = {
  id: string;
  runId: string;
  port: number;
  terminalSessionId: string | null;
  updatedAt: number;
};

type DaytonaPreviewPhase = "loading" | "ready" | "stopping" | "stopped" | "error";

type DaytonaPreviewState = {
  phase: DaytonaPreviewPhase;
  frameUrl: string | null;
  rawUrl: string | null;
  label: string | null;
  error: string | null;
  attempt: number;
};

function describePreviewError(code: string | null): string {
  if (!code) return "The Daytona app preview could not be attached.";
  if (code === "auth_unavailable") return "Sign in again to attach this app preview.";
  if (code === "runtime_run_not_found") return "This runtime run is no longer available.";
  if (code === "daytona_sandbox_not_available") return "The Daytona sandbox for this run is no longer available.";
  if (code === "daytona_preview_not_authorized") return "This run did not start an app preview on that port.";
  if (code === "daytona_preview_port_not_active") return "This app preview is no longer running.";
  if (code === "daytona_preview_url_missing") return "Daytona did not return a preview URL for this app.";
  if (code === "daytona_preview_unavailable") return "The Daytona app preview is not available yet.";
  if (code === "daytona_preview_stop_failed") return "The Daytona app preview could not be stopped.";
  return "The Daytona app preview could not be attached.";
}

function shouldHideUnavailableDaytonaPreview(code: string | null): boolean {
  const normalized = String(code ?? "").trim();
  return (
    normalized === "runtime_run_not_found" ||
    normalized === "daytona_runtime_target_not_found" ||
    normalized === "daytona_sandbox_not_available" ||
    normalized === "daytona_preview_not_authorized" ||
    normalized === "daytona_preview_port_not_active" ||
    normalized === "invalid_preview_port"
  );
}

function buildDaytonaPreviewVisibilityKey(anchor: DaytonaRuntimePreviewAnchor): string {
  return `${anchor.id}:${Math.floor(Number(anchor.updatedAt) || 0)}`;
}

function DaytonaRuntimeAppPreviewCard(props: {
  anchor: DaytonaRuntimePreviewAnchor;
  session: AuthSessionLike | null;
  onUnavailable: (anchor: DaytonaRuntimePreviewAnchor) => void;
}): JSX.Element {
  const [state, setState] = useState<DaytonaPreviewState>({
    phase: "loading",
    frameUrl: null,
    rawUrl: null,
    label: null,
    error: null,
    attempt: 0,
  });

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({
      ...prev,
      phase: "loading",
      error: null,
    }));
    if (!props.session) {
      setState((prev) => ({
        ...prev,
        phase: "error",
        error: describePreviewError("auth_unavailable"),
      }));
      return;
    }
    void getConvexCloudRuntimeRunDaytonaPreviewSession({
      session: props.session,
      runId: props.anchor.runId,
      port: props.anchor.port,
    })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          if (shouldHideUnavailableDaytonaPreview(result.code)) {
            props.onUnavailable(props.anchor);
            return;
          }
          setState((prev) =>
            prev.phase === "stopping" || prev.phase === "stopped"
              ? prev
              : {
                  ...prev,
                  phase: "error",
                  frameUrl: null,
                  rawUrl: null,
                  error: describePreviewError(result.code),
                },
          );
          return;
        }
        const frameUrl = buildWorkspacePreviewProxyUrl({
          previewProxyToken: result.session.preview_proxy_token,
          previewPath: result.session.preview_path,
          searchParams: {
            polynet_preview: "inline",
            polynet_preview_contract: "surface-v1",
          },
        });
        setState((prev) =>
          prev.phase === "stopping" || prev.phase === "stopped"
            ? prev
            : {
                ...prev,
                phase: "loading",
                frameUrl,
                rawUrl: frameUrl,
                label: result.session.preview_label,
                error: null,
              },
        );
      })
      .catch((error) => {
        if (cancelled) return;
        setState((prev) =>
          prev.phase === "stopping" || prev.phase === "stopped"
            ? prev
            : {
                ...prev,
                phase: "error",
                frameUrl: null,
                rawUrl: null,
                error: error instanceof Error ? error.message : "The Daytona app preview could not be attached.",
              },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [
    props.anchor,
    props.anchor.port,
    props.anchor.runId,
    props.onUnavailable,
    props.session,
    state.attempt,
  ]);

  const handleStop = useCallback(() => {
    if (!props.session) {
      setState((prev) => ({
        ...prev,
        phase: "error",
        error: describePreviewError("auth_unavailable"),
      }));
      return;
    }
    setState((prev) => ({
      ...prev,
      phase: "stopping",
      error: null,
    }));
    void stopConvexCloudRuntimeRunDaytonaPreview({
      session: props.session,
      runId: props.anchor.runId,
      port: props.anchor.port,
    })
      .then((result) => {
        if (!result.ok) {
          if (shouldHideUnavailableDaytonaPreview(result.code)) {
            props.onUnavailable(props.anchor);
            return;
          }
          setState((prev) => ({
            ...prev,
            phase: "error",
            error: result.message || describePreviewError(result.code),
          }));
          return;
        }
        setState((prev) => ({
          ...prev,
          phase: "stopped",
          frameUrl: null,
          rawUrl: null,
          error: null,
        }));
        props.onUnavailable(props.anchor);
      })
      .catch((error) => {
        setState((prev) => ({
          ...prev,
          phase: "error",
          error: error instanceof Error ? error.message : describePreviewError("daytona_preview_stop_failed"),
        }));
      });
  }, [props.anchor, props.onUnavailable, props.session]);

  const title = state.label || `Daytona app :${props.anchor.port}`;
  const isStopping = state.phase === "stopping";
  const statusClass =
    state.phase === "error"
      ? "failed"
      : state.phase === "stopping"
        ? "starting"
        : state.phase === "stopped"
          ? "failed"
          : "running";
  return (
    <article className="workspace-app-preview-card">
      <div className="workspace-app-preview-header">
        <div className="workspace-app-preview-title-row">
          <div className="workspace-app-preview-title">{title}</div>
          <span className={`workspace-app-preview-status ${statusClass}`}>
            {state.phase === "error"
              ? "Unavailable"
              : state.phase === "stopping"
                ? "Stopping"
                : state.phase === "stopped"
                  ? "Stopped"
                  : state.phase === "ready"
                    ? "Running"
                    : "Loading"}
          </span>
        </div>
        <div className="workspace-app-preview-actions">
          <button
            type="button"
            className="workspace-app-preview-button"
            disabled={isStopping}
            onClick={() => {
              setState((prev) => ({
                ...prev,
                attempt: prev.attempt + 1,
              }));
            }}
          >
            Refresh
          </button>
          {state.rawUrl ? (
            <a
              className="workspace-app-preview-button"
              href={state.rawUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open
            </a>
          ) : null}
          {state.phase !== "error" && state.phase !== "stopped" ? (
            <button
              type="button"
              className="workspace-app-preview-button stop"
              onClick={handleStop}
              disabled={isStopping}
              aria-label={isStopping ? "Stopping app preview" : "Stop app preview"}
              title={isStopping ? "Stopping..." : "Stop"}
            >
              {isStopping ? "Stopping" : "Stop"}
            </button>
          ) : null}
        </div>
      </div>
      {state.frameUrl ? (
        <div
          className="workspace-app-preview-frame-shell"
          data-preview-fit="stable"
        >
          <div className="workspace-app-preview-frame-viewport">
            <div className="workspace-app-preview-frame-stage">
              <iframe
                className="workspace-app-preview-frame"
                src={state.frameUrl}
                title={title}
                loading="eager"
                referrerPolicy="no-referrer"
                onLoad={() => {
                  setState((prev) => ({
                    ...prev,
                    phase:
                      prev.phase === "stopping" || prev.phase === "stopped"
                        ? prev.phase
                        : "ready",
                  }));
                }}
                onError={() => {
                  setState((prev) =>
                    prev.phase === "stopping" || prev.phase === "stopped"
                      ? prev
                      : {
                          ...prev,
                          phase: "error",
                          error: "The Daytona app preview failed to load.",
                        },
                  );
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="workspace-app-preview-frame-shell">
          <div className="workspace-app-preview-state">
            <div className="workspace-app-preview-state-title">
              {state.phase === "error" ? "Preview unavailable" : "Attaching preview"}
            </div>
            <div className="workspace-app-preview-state-copy">
              {state.error ?? "Connecting to the Daytona app preview."}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

export function DaytonaRuntimeAppPreview(props: {
  anchors: DaytonaRuntimePreviewAnchor[];
  session: AuthSessionLike | null;
}): JSX.Element | null {
  const [hiddenAnchorKeys, setHiddenAnchorKeys] = useState<Set<string>>(() => new Set());
  const anchors = useMemo(
    () =>
      props.anchors
        .filter((anchor) => anchor.runId && Number.isFinite(anchor.port))
        .sort((a, b) => a.port - b.port),
    [props.anchors],
  );
  useEffect(() => {
    const liveKeys = new Set(anchors.map(buildDaytonaPreviewVisibilityKey));
    setHiddenAnchorKeys((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const key of prev) {
        if (liveKeys.has(key)) {
          next.add(key);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [anchors]);
  const handleUnavailableAnchor = useCallback((anchor: DaytonaRuntimePreviewAnchor) => {
    const key = buildDaytonaPreviewVisibilityKey(anchor);
    setHiddenAnchorKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);
  const visibleAnchors = useMemo(
    () => anchors.filter((anchor) => !hiddenAnchorKeys.has(buildDaytonaPreviewVisibilityKey(anchor))),
    [anchors, hiddenAnchorKeys],
  );
  if (visibleAnchors.length === 0) return null;
  return (
    <section
      className="workspace-app-preview-stack"
      aria-label="Running Daytona apps"
    >
      {visibleAnchors.map((anchor) => (
        <DaytonaRuntimeAppPreviewCard
          key={anchor.id}
          anchor={anchor}
          session={props.session}
          onUnavailable={handleUnavailableAnchor}
        />
      ))}
    </section>
  );
}
