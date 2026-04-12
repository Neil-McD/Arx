import { useEffect, useMemo, useRef, useState } from "react";
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
  frameSize: { width: number; height: number },
): string {
  const url = new URL(baseUrl);
  url.searchParams.set("polynet_preview", mode);
  url.searchParams.set("polynet_preview_contract", "surface-v1");
  if (frameSize.width > 0) {
    url.searchParams.set("polynet_preview_width", String(Math.round(frameSize.width)));
  }
  if (frameSize.height > 0) {
    url.searchParams.set("polynet_preview_height", String(Math.round(frameSize.height)));
  }
  return url.toString();
}

function PreviewFrame({
  previewUrl,
  title,
  mode,
  onLifecyclePhaseChange,
  onFitReport,
}: {
  previewUrl: string;
  title: string;
  mode: "inline" | "expanded";
  onLifecyclePhaseChange?: (phase: "loading" | "ready" | "error") => void;
  onFitReport?: (report: {
    viewportWidth: number;
    viewportHeight: number;
    overflowX: boolean;
    overflowY: boolean;
  }) => void;
}): JSX.Element {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [contentSize, setContentSize] = useState<{ width: number; height: number } | null>(null);
  const [fitReport, setFitReport] = useState<{
    viewportWidth: number;
    viewportHeight: number;
    overflowX: boolean;
    overflowY: boolean;
  } | null>(null);

  useEffect(() => {
    setContentSize(null);
    setFitReport(null);
    onLifecyclePhaseChange?.("loading");
  }, [previewUrl, mode, onLifecyclePhaseChange]);

  useEffect(() => {
    if (!fitReport) return;
    onFitReport?.(fitReport);
  }, [fitReport, onFitReport]);

  useEffect(() => {
    const node = shellRef.current;
    if (!node) return;

    const updateFrameSize = () => {
      const nextWidth = node.clientWidth;
      const nextHeight = node.clientHeight;
      setFrameSize((prev) =>
        prev.width === nextWidth && prev.height === nextHeight
          ? prev
          : { width: nextWidth, height: nextHeight },
      );
    };

    updateFrameSize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateFrameSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

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
      const width = Number(payload.width);
      const height = Number(payload.height);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
      const viewportWidth = Number(payload.viewportWidth);
      const viewportHeight = Number(payload.viewportHeight);
      const overflowX = payload.overflowX === true;
      const overflowY = payload.overflowY === true;
      setContentSize((prev) =>
        prev && prev.width === width && prev.height === height ? prev : { width, height },
      );
      if (
        Number.isFinite(viewportWidth) &&
        viewportWidth > 0 &&
        Number.isFinite(viewportHeight) &&
        viewportHeight > 0
      ) {
        setFitReport((prev) =>
          prev &&
          prev.viewportWidth === viewportWidth &&
          prev.viewportHeight === viewportHeight &&
          prev.overflowX === overflowX &&
          prev.overflowY === overflowY
            ? prev
            : {
                viewportWidth,
                viewportHeight,
                overflowX,
                overflowY,
              },
        );
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [previewUrl]);

  const fitNeedsAttention = Boolean(fitReport?.overflowX || fitReport?.overflowY);
  const fitScale = useMemo(() => {
    if (!contentSize || frameSize.width <= 0 || frameSize.height <= 0) return 1;
    if (!fitNeedsAttention) return 1;
    const widthScale = frameSize.width / contentSize.width;
    const heightScale = frameSize.height / contentSize.height;
    const scale = Math.min(1, widthScale, heightScale);
    if (!Number.isFinite(scale) || scale <= 0) return 1;
    if (scale >= 0.995) return 1;
    return scale;
  }, [contentSize, fitNeedsAttention, frameSize.height, frameSize.width]);

  const fitActive = fitNeedsAttention && Boolean(contentSize) && fitScale < 0.995;
  const frameUrl = useMemo(
    () => buildPreviewFrameUrl(previewUrl, mode, frameSize),
    [frameSize, mode, previewUrl],
  );

  return (
    <div
      ref={shellRef}
      className={`workspace-app-preview-frame-shell${fitActive ? " fit-active" : ""}${fitNeedsAttention ? " fit-needs-attention" : ""}`}
      data-preview-fit={fitNeedsAttention ? "overflow" : "ok"}
    >
      <div className="workspace-app-preview-frame-viewport">
        <div
          className={`workspace-app-preview-frame-stage${fitActive ? " fit-active" : ""}`}
          style={
            fitActive && contentSize
              ? {
                  width: `${contentSize.width}px`,
                  height: `${contentSize.height}px`,
                  transform: `scale(${fitScale})`,
                }
              : undefined
          }
        >
          <iframe
            ref={iframeRef}
            key={frameUrl}
            className="workspace-app-preview-frame"
            src={frameUrl}
            title={title}
            loading="eager"
            referrerPolicy="no-referrer"
            onLoad={() => onLifecyclePhaseChange?.("ready")}
            onError={() => onLifecyclePhaseChange?.("error")}
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
  onStopTerminal: (terminalSessionId: string) => void;
  mode?: "inline" | "expanded";
  expandedTerminalId?: string | null;
  allowExpand?: boolean;
  onExpandPreview?: (terminalSessionId: string) => void;
  onCollapsePreview?: () => void;
  onPreviewFitReport?: (params: {
    terminal: DaytonaWorkspaceTerminalRecord;
    mode: "inline" | "expanded";
    viewportWidth: number;
    viewportHeight: number;
    overflowX: boolean;
    overflowY: boolean;
  }) => void;
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

  useEffect(() => {
    for (const terminal of previewTerminals) {
      const state = props.previewStateByTerminalId[terminal.id];
      if (!state || state.phase === "idle") {
        props.onEnsurePreview(terminal.id);
      }
    }
  }, [previewTerminals, props]);

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
                  disabled={state.phase === "resolving"}
                  aria-label={state.phase === "resolving" ? "Refreshing preview" : "Refresh preview"}
                  title={state.phase === "resolving" ? "Refreshing..." : "Refresh"}
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
                onFitReport={(report) => {
                  props.onPreviewFitReport?.({
                    terminal,
                    mode,
                    viewportWidth: report.viewportWidth,
                    viewportHeight: report.viewportHeight,
                    overflowX: report.overflowX,
                    overflowY: report.overflowY,
                  });
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
