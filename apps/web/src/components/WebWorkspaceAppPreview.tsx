import { useEffect, useMemo, useRef } from "react";
import {
  type WorkspaceTerminalPreview,
  type WorkspaceTerminalRecord,
} from "../../../../shared/workspaceTerminalsGateway";
import { buildWorkspacePreviewProxyUrl } from "../lib/workspacePreviewProxy";

function BackGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M15 18l-6-6 6-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
    </svg>
  );
}

function OpenInTabGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M14 5h5v5M19 5l-8 8M11 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"
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
  preview: WorkspaceTerminalPreview | null;
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
  rootChildCount: number | null;
  bodyChildCount: number | null;
  probeAccess: "same_origin" | "cross_origin_uninspectable" | "unavailable";
};

function formatTerminalStatus(status: WorkspaceTerminalRecord["status"]): string {
  if (status === "starting") return "Starting";
  if (status === "running") return "Running";
  if (status === "failed") return "Failed";
  if (status === "exited") return "Exited";
  return "Stopped";
}

export function isRetryablePreviewStatus(status: WorkspaceTerminalRecord["status"]): boolean {
  return status === "starting" || status === "running";
}

function isLivePreviewTerminal(terminal: WorkspaceTerminalRecord): boolean {
  return (
    isRetryablePreviewStatus(terminal.status) &&
    typeof terminal.preview_port === "number" &&
    Number.isFinite(terminal.preview_port) &&
    terminal.preview_port >= 3000
  );
}

function formatPreviewLabel(terminal: WorkspaceTerminalRecord): string {
  const explicit = String(terminal.preview_label ?? "").trim();
  if (explicit) return explicit;
  const port = terminal.preview_port;
  if (typeof port === "number" && Number.isFinite(port)) return `App on port ${port}`;
  return "App preview";
}

function getPreviewLoadingCopy(
  terminal: WorkspaceTerminalRecord,
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

function buildWorkspaceAppPreviewUrl(preview: WorkspaceTerminalPreview): string {
  return buildWorkspacePreviewProxyUrl({
    previewProxyToken: preview.preview_proxy_token,
    previewPath: preview.preview_path,
    searchParams: {
      polynet_preview: "inline",
      polynet_preview_contract: "surface-v1",
    },
  });
}

function buildWorkspaceAppOpenInTabUrl(preview: WorkspaceTerminalPreview): string {
  return buildWorkspacePreviewProxyUrl({
    previewProxyToken: preview.preview_proxy_token,
    previewPath: preview.preview_path,
  });
}

function readPreviewDocumentMetrics(
  iframe: HTMLIFrameElement | null,
): WorkspacePreviewMetricsObservation {
  if (!iframe) {
    return {
      width: null,
      height: null,
      viewportWidth: null,
      viewportHeight: null,
      overflowX: null,
      overflowY: null,
      visibleTextLength: null,
      elementCount: null,
      mediaElementCount: null,
      rootChildCount: null,
      bodyChildCount: null,
      probeAccess: "unavailable",
    };
  }
  try {
    const document = iframe.contentDocument ?? iframe.contentWindow?.document ?? null;
    if (!document) {
      return {
        width: null,
        height: null,
        viewportWidth: null,
        viewportHeight: null,
        overflowX: null,
        overflowY: null,
        visibleTextLength: null,
        elementCount: null,
        mediaElementCount: null,
        rootChildCount: null,
        bodyChildCount: null,
        probeAccess: "unavailable",
      };
    }
    const body = document.body;
    const root = document.getElementById("root");
    const documentElement = document.documentElement;
    const width = Math.max(
      body?.scrollWidth ?? 0,
      body?.offsetWidth ?? 0,
      documentElement?.clientWidth ?? 0,
    );
    const height = Math.max(
      body?.scrollHeight ?? 0,
      body?.offsetHeight ?? 0,
      documentElement?.clientHeight ?? 0,
    );
    const viewportWidth = iframe.contentWindow?.innerWidth ?? documentElement?.clientWidth ?? null;
    const viewportHeight = iframe.contentWindow?.innerHeight ?? documentElement?.clientHeight ?? null;
    const visibleTextLength = String(body?.innerText ?? "").trim().length;
    const elementCount = body?.querySelectorAll("*").length ?? 0;
    const mediaElementCount =
      body?.querySelectorAll("img,video,canvas,svg,picture,iframe").length ?? 0;
    return {
      width: Number.isFinite(width) ? Math.floor(width) : null,
      height: Number.isFinite(height) ? Math.floor(height) : null,
      viewportWidth:
        typeof viewportWidth === "number" && Number.isFinite(viewportWidth)
          ? Math.floor(viewportWidth)
          : null,
      viewportHeight:
        typeof viewportHeight === "number" && Number.isFinite(viewportHeight)
          ? Math.floor(viewportHeight)
          : null,
      overflowX:
        typeof viewportWidth === "number" && Number.isFinite(viewportWidth)
          ? width > viewportWidth + 2
          : null,
      overflowY:
        typeof viewportHeight === "number" && Number.isFinite(viewportHeight)
          ? height > viewportHeight + 2
          : null,
      visibleTextLength,
      elementCount,
      mediaElementCount,
      rootChildCount: root?.children.length ?? null,
      bodyChildCount: body?.children.length ?? null,
      probeAccess: "same_origin",
    };
  } catch {
    return {
      width: null,
      height: null,
      viewportWidth: null,
      viewportHeight: null,
      overflowX: null,
      overflowY: null,
      visibleTextLength: null,
      elementCount: null,
      mediaElementCount: null,
      rootChildCount: null,
      bodyChildCount: null,
      probeAccess: "cross_origin_uninspectable",
    };
  }
}

function PreviewFrame({
  previewUrl,
  title,
  onLifecyclePhaseChange,
  onMetricsObservation,
}: {
  previewUrl: string;
  title: string;
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
  }, [previewUrl]);

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
        rootChildCount: numeric(payload.rootChildCount),
        bodyChildCount: numeric(payload.bodyChildCount),
        probeAccess: "same_origin",
      });
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [previewUrl]);

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
            src={previewUrl}
            title={title}
            loading="eager"
            referrerPolicy="no-referrer"
            onLoad={() => {
              lifecycleCallbackRef.current?.("ready");
              window.setTimeout(() => {
                metricsCallbackRef.current?.(
                  readPreviewDocumentMetrics(iframeRef.current),
                );
              }, 250);
            }}
            onError={() => lifecycleCallbackRef.current?.("error")}
          />
        </div>
      </div>
    </div>
  );
}

export function WebWorkspaceAppPreview(props: {
  terminals: WorkspaceTerminalRecord[];
  previewStateByTerminalId: Record<string, WorkspacePreviewLifecycleState>;
  busyTerminalIds?: readonly string[];
  onEnsurePreview: (terminalSessionId: string, opts?: { force?: boolean }) => void;
  onPreviewLifecyclePhaseChange?: (params: {
    terminal: WorkspaceTerminalRecord;
    phase: "loading" | "ready" | "error";
  }) => void;
  onPreviewMetricsObservation?: (params: {
    terminal: WorkspaceTerminalRecord;
    metrics: WorkspacePreviewMetricsObservation;
  }) => void;
  onStopTerminal: (terminalSessionId: string) => void;
  onBack?: () => void;
}): JSX.Element | null {
  const previewTerminals = useMemo(
    () =>
      props.terminals.filter(
        (terminal) => isLivePreviewTerminal(terminal),
      ),
    [props.terminals],
  );
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

  return (
    <section className="workspace-app-preview-stack" aria-label="Running apps">
      {previewTerminals.map((terminal) => {
        const state = props.previewStateByTerminalId[terminal.id] ?? {
          phase: "idle",
          preview: null,
          error: null,
        };
        const isBusy = busySet.has(terminal.id);
        const canAttachPreview = isRetryablePreviewStatus(terminal.status);
        const previewUrl = state.preview ? buildWorkspaceAppPreviewUrl(state.preview) : null;
        const openInTabUrl = state.preview ? buildWorkspaceAppOpenInTabUrl(state.preview) : null;
        return (
          <article key={terminal.id} className="workspace-app-preview-card">
            <div className="workspace-app-preview-topbar">
              {props.onBack ? (
                <button
                  type="button"
                  className="workspace-app-preview-button icon-only workspace-app-preview-back"
                  onClick={props.onBack}
                  aria-label="Back to workspace"
                  title="Back to workspace"
                >
                  <BackGlyph />
                </button>
              ) : null}
              <span
                className={`workspace-app-preview-dot is-${terminal.status}`}
                role="status"
                aria-label={formatTerminalStatus(terminal.status)}
                title={formatTerminalStatus(terminal.status)}
              />
              <div className="workspace-app-preview-title">{formatPreviewLabel(terminal)}</div>
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
                {openInTabUrl ? (
                  <button
                    type="button"
                    className="workspace-app-preview-button icon-only"
                    onClick={() => {
                      window.open(openInTabUrl, "_blank", "noopener,noreferrer");
                    }}
                    aria-label="Open app in new tab"
                    title="Open in new tab"
                  >
                    <OpenInTabGlyph />
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
