import { useEffect, useMemo, useRef } from "react";
import {
  type DaytonaWorkspaceTerminalPreview,
  type DaytonaWorkspaceTerminalRecord,
} from "../../../../shared/daytonaWorkspaceTerminals";
import { buildDaytonaPreviewProxyUrl } from "../lib/daytonaPreviewProxy";

function StopGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="1.8" />
    </svg>
  );
}

function RefreshGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20 11a8 8 0 1 1-2.34-5.66"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 4v6h-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 10 15 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExpandGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9 5H5v4M15 5h4v4M19 15v4h-4M5 15v4h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CollapseGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9 9 5 5M15 9l4-4M15 15l4 4M9 15l-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 5H5v3M16 5h3v3M19 16v3h-3M5 16v3h3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export type WorkspacePreviewLifecycleState = {
  phase: "idle" | "resolving" | "loading" | "ready" | "error";
  preview: DaytonaWorkspaceTerminalPreview | null;
  error: string | null;
};

export type WorkspacePreviewMetricsObservation = {
  width: number | null;
  height: number | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  overflowX: boolean | null;
  overflowY: boolean | null;
  visibleTextLength: number | null;
  elementCount: number | null;
  mediaElementCount: number | null;
};

function formatTerminalStatus(status: DaytonaWorkspaceTerminalRecord["status"]): string {
  if (status === "starting") return "Starting";
  if (status === "running") return "Running";
  if (status === "failed") return "Failed";
  if (status === "exited") return "Exited";
  return "Stopped";
}

export function isRetryablePreviewStatus(status: DaytonaWorkspaceTerminalRecord["status"]): boolean {
  return status === "starting" || status === "running";
}

function formatPreviewLabel(terminal: DaytonaWorkspaceTerminalRecord): string {
  const explicit = String(terminal.preview_label ?? "").trim();
  if (explicit) return explicit;
  const port = terminal.preview_port;
  if (typeof port === "number" && Number.isFinite(port)) return `App on port ${port}`;
  return "App preview";
}

function getPreviewLoadingCopy(
  terminal: DaytonaWorkspaceTerminalRecord,
  state: WorkspacePreviewLifecycleState,
): { title: string; body: string } {
  if (terminal.status === "failed") {
    const exitSuffix = typeof terminal.exit_code === "number" ? ` Exit code ${terminal.exit_code}.` : "";
    const output = String(terminal.output_tail ?? "").trim();
    return {
      title: "Preview failed to start",
      body: output
        ? `${exitSuffix.trim()} ${output}`.trim()
        : `The background terminal exited before the preview became available.${exitSuffix}`,
    };
  }
  if (terminal.status === "exited" || terminal.status === "stopped") {
    return {
      title: "Preview is no longer running",
      body: `The background terminal ${terminal.status === "exited" ? "exited" : "stopped"} before a live preview was attached.`,
    };
  }
  if (state.phase === "error") {
    return {
      title: "Preview unavailable",
      body: state.error ?? "This running terminal has not exposed a preview yet.",
    };
  }
  if (terminal.status === "starting") {
    return {
      title: "Starting app...",
      body: "Launching the background terminal and waiting for the preview port to come online.",
    };
  }
  if (state.phase === "resolving") {
    return {
      title: "Connecting preview...",
      body: "Minting a fresh signed preview URL and attaching the live app surface.",
    };
  }
  if (state.phase === "loading") {
    return {
      title: "Loading app...",
      body: "The live app surface is attached and rendering inside the preview.",
    };
  }
  return {
    title: "Waiting for preview...",
    body: "The app is running, but the preview surface is not ready yet.",
  };
}

function buildWorkspaceAppPreviewUrl(
  preview: DaytonaWorkspaceTerminalPreview,
  mode: "inline" | "expanded",
): string {
  return buildDaytonaPreviewProxyUrl({
    previewProxyToken: preview.preview_proxy_token,
    previewPath: preview.preview_path,
    searchParams: {
      polynet_preview: mode,
      polynet_preview_contract: "surface-v1",
    },
  });
}

function buildPreviewFrameUrl(
  baseUrl: string,
  mode: "inline" | "expanded",
): string {
  const url = new URL(baseUrl);
  url.searchParams.set("polynet_preview", mode);
  url.searchParams.set("polynet_preview_contract", "surface-v1");
  return url.toString();
}

function PreviewFrame({
  previewUrl,
  title,
  mode,
  onLifecyclePhaseChange,
  onMetricsObservation,
}: {
  previewUrl: string;
  title: string;
  mode: "inline" | "expanded";
  onLifecyclePhaseChange?: (phase: "loading" | "ready" | "error") => void;
  onMetricsObservation?: (metrics: WorkspacePreviewMetricsObservation) => void;
}): JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const lifecycleCallbackRef = useRef(onLifecyclePhaseChange);
  const metricsCallbackRef = useRef(onMetricsObservation);

  useEffect(() => {
    lifecycleCallbackRef.current = onLifecyclePhaseChange;
  }, [onLifecyclePhaseChange]);

  useEffect(() => {
    metricsCallbackRef.current = onMetricsObservation;
  }, [onMetricsObservation]);

  useEffect(() => {
    lifecycleCallbackRef.current?.("loading");
  }, [previewUrl, mode]);

  useEffect(() => {
    let previewOrigin = "";
    try {
      previewOrigin = new URL(previewUrl).origin;
    } catch {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== previewOrigin) return;
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const payload = event.data;
      if (!payload || payload.type !== "polynet_preview_metrics") return;
      const numeric = (value: unknown): number | null => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.floor(parsed) : null;
      };
      metricsCallbackRef.current?.({
        width: numeric(payload.width),
        height: numeric(payload.height),
        viewportWidth: numeric(payload.viewportWidth),
        viewportHeight: numeric(payload.viewportHeight),
        overflowX: typeof payload.overflowX === "boolean" ? payload.overflowX : null,
        overflowY: typeof payload.overflowY === "boolean" ? payload.overflowY : null,
        visibleTextLength: numeric(payload.visibleTextLength),
        elementCount: numeric(payload.elementCount),
        mediaElementCount: numeric(payload.mediaElementCount),
      });
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [previewUrl]);

  const frameUrl = useMemo(
    () => buildPreviewFrameUrl(previewUrl, mode),
    [mode, previewUrl],
  );

  return (
    <div
      className="workspace-app-preview-frame-shell"
      data-preview-fit="stable"
    >
      <div className="workspace-app-preview-frame-viewport">
        <div className="workspace-app-preview-frame-stage">
          <iframe
            ref={iframeRef}
            className="workspace-app-preview-frame"
            src={frameUrl}
            title={title}
            loading="eager"
            referrerPolicy="no-referrer"
            onLoad={() => lifecycleCallbackRef.current?.("ready")}
            onError={() => lifecycleCallbackRef.current?.("error")}
          />
        </div>
      </div>
    </div>
  );
}

export function WebWorkspaceAppPreview(props: {
  terminals: DaytonaWorkspaceTerminalRecord[];
  previewStateByTerminalId: Record<string, WorkspacePreviewLifecycleState>;
  busyTerminalIds?: readonly string[];
  onEnsurePreview: (terminalSessionId: string, opts?: { force?: boolean }) => void;
  onPreviewLifecyclePhaseChange?: (params: {
    terminal: DaytonaWorkspaceTerminalRecord;
    phase: "loading" | "ready" | "error";
  }) => void;
  onPreviewMetricsObservation?: (params: {
    terminal: DaytonaWorkspaceTerminalRecord;
    metrics: WorkspacePreviewMetricsObservation;
  }) => void;
  onStopTerminal: (terminalSessionId: string) => void;
  mode?: "inline" | "expanded";
  expandedTerminalId?: string | null;
  allowExpand?: boolean;
  onExpandPreview?: (terminalSessionId: string) => void;
  onCollapsePreview?: () => void;
}): JSX.Element | null {
  const previewTerminals = useMemo(
    () =>
      props.terminals.filter(
        (terminal) =>
          typeof terminal.preview_port === "number" &&
          Number.isFinite(terminal.preview_port) &&
          terminal.preview_port >= 3000,
      ),
    [props.terminals],
  );
  const mode = props.mode ?? "inline";
  const allowExpand = props.allowExpand ?? true;
  const busySet = useMemo(() => new Set(props.busyTerminalIds ?? []), [props.busyTerminalIds]);

  const { previewStateByTerminalId, onEnsurePreview } = props;

  useEffect(() => {
    for (const terminal of previewTerminals) {
      if (!isRetryablePreviewStatus(terminal.status)) continue;
      const state = previewStateByTerminalId[terminal.id];
      if (!state || state.phase === "idle") {
        onEnsurePreview(terminal.id);
      }
    }
  }, [onEnsurePreview, previewStateByTerminalId, previewTerminals]);

  if (previewTerminals.length === 0) return null;

  const visibleTerminals =
    mode === "expanded"
      ? previewTerminals.filter((terminal) => terminal.id === props.expandedTerminalId)
      : previewTerminals;

  if (visibleTerminals.length === 0) return null;

  return (
    <section
      className={`workspace-app-preview-stack${mode === "expanded" ? " expanded-mode" : ""}`}
      aria-label="Running apps"
    >
      {visibleTerminals.map((terminal) => {
        const state = props.previewStateByTerminalId[terminal.id] ?? {
          phase: "idle",
          preview: null,
          error: null,
        };
        const isBusy = busySet.has(terminal.id);
        const canAttachPreview = isRetryablePreviewStatus(terminal.status);
        const previewUrl = state.preview ? buildWorkspaceAppPreviewUrl(state.preview, mode) : null;
        return (
          <article key={terminal.id} className={`workspace-app-preview-card${mode === "expanded" ? " expanded" : ""}`}>
            <div className="workspace-app-preview-header">
              <div className="workspace-app-preview-title-row">
                <div className="workspace-app-preview-title">{formatPreviewLabel(terminal)}</div>
                <span className={`workspace-app-preview-status ${terminal.status}`}>
                  {formatTerminalStatus(terminal.status)}
                </span>
              </div>
              <div className="workspace-app-preview-actions">
                <button
                  type="button"
                  className="workspace-app-preview-button icon-only"
                  onClick={() => props.onEnsurePreview(terminal.id, { force: true })}
                  disabled={!canAttachPreview || state.phase === "resolving"}
                  aria-label={state.phase === "resolving" ? "Refreshing preview" : "Refresh preview"}
                  title={
                    !canAttachPreview
                      ? "Preview terminal is not running"
                      : state.phase === "resolving"
                        ? "Refreshing..."
                        : "Refresh"
                  }
                >
                  <RefreshGlyph />
                </button>
                {mode === "expanded" ? (
                  <button
                    type="button"
                    className="workspace-app-preview-button icon-only"
                    onClick={props.onCollapsePreview}
                    aria-label="Collapse preview"
                    title="Back to thread"
                  >
                    <CollapseGlyph />
                  </button>
                ) : allowExpand ? (
                  <button
                    type="button"
                    className="workspace-app-preview-button icon-only"
                    onClick={() => props.onExpandPreview?.(terminal.id)}
                    aria-label="Expand preview"
                    title="Expand"
                  >
                    <ExpandGlyph />
                  </button>
                ) : null}
                {canAttachPreview ? (
                  <button
                    type="button"
                    className="workspace-app-preview-button stop icon-only"
                    onClick={() => props.onStopTerminal(terminal.id)}
                    disabled={isBusy}
                    aria-label={isBusy ? "Stopping app preview" : "Stop app preview"}
                    title={isBusy ? "Stopping..." : "Stop"}
                  >
                    <StopGlyph />
                  </button>
                ) : null}
              </div>
            </div>
            {previewUrl ? (
              <PreviewFrame
                previewUrl={previewUrl}
                title={formatPreviewLabel(terminal)}
                mode={mode}
                onLifecyclePhaseChange={(phase) => {
                  props.onPreviewLifecyclePhaseChange?.({ terminal, phase });
                }}
                onMetricsObservation={(metrics) => {
                  props.onPreviewMetricsObservation?.({ terminal, metrics });
                }}
              />
            ) : (
              <div className="workspace-app-preview-frame-shell">
                {(() => {
                  const copy = getPreviewLoadingCopy(terminal, state);
                  return (
                    <div className="workspace-app-preview-state">
                      <div className="workspace-app-preview-state-title">{copy.title}</div>
                      <div className="workspace-app-preview-state-copy">{copy.body}</div>
                    </div>
                  );
                })()}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
