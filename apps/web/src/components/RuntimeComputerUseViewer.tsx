import { useEffect, useMemo, useReducer } from "react";
import type { AuthSessionLike } from "../../../../shared/authSession";
import { getConvexCloudRuntimeRunComputerUseLiveSession } from "../../../../shared/cloudThreadsRead";
import type { ThreadStreamingRuntimeEvent } from "../../../../shared/webTurnRunnerCore";
import { buildRuntimeComputerUseViewer } from "../../../../shared/runtimeComputerUseViewerUi";
import {
  emitWorkspaceEvent,
  formatWorkspaceInstrumentationError,
} from "../lib/workspaceInstrumentation";
import {
  buildWorkspaceEmbeddedLiveDesktopUrl,
  buildWorkspaceRawLiveDesktopUrl,
} from "../lib/workspacePreviewProxy";

const LIVE_DESKTOP_RETRY_MS = 2_500;

function formatLiveDesktopDebug(debug: Record<string, unknown> | null): string | null {
  if (!debug) return null;
  const stage = String(debug.stage ?? "").trim();
  const message = String(debug.message ?? "").trim();
  const runStatus = String(debug.run_status ?? "").trim();
  const computerUseStatus = String(debug.computer_use_status ?? "").trim();
  const sessionFound = debug.workspace_session_event_found === true ? "yes" : debug.workspace_session_event_found === false ? "no" : "";
  const sandboxPresent = debug.sandbox_id_present === true ? "yes" : debug.sandbox_id_present === false ? "no" : "";
  const toolboxPresent =
    debug.toolbox_proxy_url_present === true ? "yes" : debug.toolbox_proxy_url_present === false ? "no" : "";
  const previewUrlOk =
    debug.preview_url_ok === true
      ? "yes"
      : debug.preview_url_ok === false
        ? "no"
        : debug.signed_preview_ok === true
          ? "yes"
          : debug.signed_preview_ok === false
            ? "no"
            : "";
  const parts = [
    stage ? `stage=${stage}` : null,
    runStatus ? `run=${runStatus}` : null,
    computerUseStatus ? `computer=${computerUseStatus}` : null,
    sessionFound ? `session_event=${sessionFound}` : null,
    sandboxPresent ? `sandbox=${sandboxPresent}` : null,
    toolboxPresent ? `toolbox=${toolboxPresent}` : null,
    previewUrlOk ? `preview_url=${previewUrlOk}` : null,
    message ? `message=${message}` : null,
  ].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(" | ") : null;
}

function describeLiveDesktopFailure(code: string | null, blocked: boolean): string {
  if (!code) return "Connecting the live workspace desktop.";
  if (!blocked) return "Live desktop is still starting. Retrying now.";
  if (code === "computer_use_not_started") {
    return "Computer use has not started the desktop yet.";
  }
  if (code === "computer_use_starting") {
    return "Computer use is starting the desktop.";
  }
  if (code === "live_desktop_inactive") {
    return "Live desktop is no longer available because the runtime run has finished.";
  }
  if (code === "live_desktop_unavailable") {
    return "Live desktop is unavailable for this run. The workspace desktop session did not become usable.";
  }
  if (code === "runtime_run_not_found") {
    return "Live desktop is unavailable because the runtime run could not be found.";
  }
  if (code === "auth_unavailable") {
    return "Live desktop is unavailable because the session could not be authenticated.";
  }
  if (code === "live_lookup_failed") {
    return "Live desktop lookup failed before a session could be resolved.";
  }
  return "Live desktop is unavailable for this active run.";
}

function extractUrlOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

type LiveDesktopPhase = "idle" | "loading" | "live" | "retryable_error" | "blocked_error";

type LiveDesktopState = {
  runId: string | null;
  phase: LiveDesktopPhase;
  embeddedUrl: string | null;
  rawUrl: string | null;
  expiresAtMs: number | null;
  failureCode: string | null;
  debug: Record<string, unknown> | null;
  attempt: number;
};

type LiveDesktopAction =
  | { type: "reset"; runId: string | null }
  | { type: "fetch_start" }
  | {
      type: "fetch_success";
      runId: string | null;
      embeddedUrl: string;
      rawUrl: string;
      expiresAtMs: number | null;
      debug: Record<string, unknown> | null;
    }
  | {
      type: "fetch_retryable_failure";
      failureCode: string;
      debug: Record<string, unknown> | null;
    }
  | {
      type: "fetch_blocking_failure";
      failureCode: string;
      debug: Record<string, unknown> | null;
    }
  | { type: "retry" };

const INITIAL_LIVE_DESKTOP_STATE: LiveDesktopState = {
  runId: null,
  phase: "idle",
  embeddedUrl: null,
  rawUrl: null,
  expiresAtMs: null,
  failureCode: null,
  debug: null,
  attempt: 0,
};

function liveDesktopStateReducer(state: LiveDesktopState, action: LiveDesktopAction): LiveDesktopState {
  switch (action.type) {
    case "reset":
      return {
        ...INITIAL_LIVE_DESKTOP_STATE,
        runId: action.runId,
      };
    case "fetch_start":
      return {
        ...state,
        phase: "loading",
      };
    case "fetch_success":
      return {
        ...state,
        runId: action.runId,
        phase: "live",
        embeddedUrl: action.embeddedUrl,
        rawUrl: action.rawUrl,
        expiresAtMs: action.expiresAtMs,
        failureCode: null,
        debug: action.debug,
      };
    case "fetch_retryable_failure":
      return {
        ...state,
        phase: "retryable_error",
        embeddedUrl: null,
        rawUrl: null,
        expiresAtMs: null,
        failureCode: action.failureCode,
        debug: action.debug,
      };
    case "fetch_blocking_failure":
      return {
        ...state,
        phase: "blocked_error",
        embeddedUrl: null,
        rawUrl: null,
        expiresAtMs: null,
        failureCode: action.failureCode,
        debug: action.debug,
      };
    case "retry":
      return {
        ...state,
        attempt: state.attempt + 1,
      };
    default:
      return state;
  }
}

export function RuntimeComputerUseViewer(props: {
  events: ThreadStreamingRuntimeEvent[];
  session?: AuthSessionLike | null;
  requireLiveDesktop?: boolean;
}): JSX.Element | null {
  const viewer = useMemo(() => {
    return buildRuntimeComputerUseViewer(props.events as any);
  }, [props.events, props.requireLiveDesktop]);
  const activeRunId = useMemo(() => {
    for (let index = props.events.length - 1; index >= 0; index -= 1) {
      const runId = String(props.events[index]?.run_id ?? "").trim();
      if (runId) return runId;
    }
    return null;
  }, [props.events]);
  const [liveDesktopState, dispatchLiveDesktopState] = useReducer(
    liveDesktopStateReducer,
    INITIAL_LIVE_DESKTOP_STATE,
  );
  const shouldRequireLiveDesktop = Boolean(props.requireLiveDesktop);
  const liveDesktopUrl = liveDesktopState.embeddedUrl;
  const rawLiveDesktopUrl = liveDesktopState.rawUrl;
  const isLoadingLiveDesktop = liveDesktopState.phase === "loading";
  const liveDesktopBlocked = liveDesktopState.phase === "blocked_error";
  const liveDesktopFailureCode = liveDesktopState.failureCode;
  const liveDesktopDebug = liveDesktopState.debug;
  const liveDesktopStatusMessage = describeLiveDesktopFailure(liveDesktopFailureCode, liveDesktopBlocked);
  const liveDesktopDebugMessage = formatLiveDesktopDebug(liveDesktopDebug);
  const liveDesktopOrigin = extractUrlOrigin(liveDesktopUrl);
  const rawLiveDesktopOrigin = extractUrlOrigin(rawLiveDesktopUrl);
  const shouldHideUntilLiveDesktopReady = shouldRequireLiveDesktop && !liveDesktopUrl;
  const visibleViewerStatus = liveDesktopUrl
    ? "live"
    : shouldRequireLiveDesktop
      ? isLoadingLiveDesktop || (liveDesktopFailureCode && !liveDesktopBlocked)
        ? "starting"
        : "unavailable"
      : viewer?.status === "stopped"
        ? "stopped"
        : viewer?.status === "error"
          ? "error"
          : "history";

  useEffect(() => {
    dispatchLiveDesktopState({
      type: "reset",
      runId: shouldRequireLiveDesktop ? activeRunId : null,
    });
  }, [activeRunId, shouldRequireLiveDesktop]);

  useEffect(() => {
    if (!shouldRequireLiveDesktop) {
      return;
    }
    if (!props.session || !activeRunId || liveDesktopBlocked) {
      if (shouldRequireLiveDesktop) {
        emitWorkspaceEvent({
          scope: "computer_use",
          name: "computer_use_view_attach",
          status: "skip",
          runId: activeRunId,
          detail: {
            hasSession: Boolean(props.session),
            liveDesktopBlocked,
          },
        });
      }
      return;
    }
    const now = Date.now();
    if (
      (liveDesktopState.runId === activeRunId &&
        liveDesktopUrl &&
        typeof liveDesktopState.expiresAtMs === "number" &&
        liveDesktopState.expiresAtMs - now > 30_000)
    ) {
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    dispatchLiveDesktopState({ type: "fetch_start" });
    emitWorkspaceEvent({
      scope: "computer_use",
      name: "computer_use_view_attach",
      status: "start",
      runId: activeRunId,
      detail: {
        hasSession: Boolean(props.session),
        retryNonce: liveDesktopState.attempt,
      },
    });
    void getConvexCloudRuntimeRunComputerUseLiveSession({
      session: props.session,
      runId: activeRunId,
    })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          emitWorkspaceEvent({
            scope: "computer_use",
            name: "computer_use_view_attach",
            status: result.retryable ? "skip" : "failure",
            runId: activeRunId,
            detail: {
              code: result.code,
              retryable: result.retryable,
            },
            error: result.code,
          });
          const debug =
            result.debug && typeof result.debug === "object" && !Array.isArray(result.debug)
              ? (result.debug as Record<string, unknown>)
              : null;
          if (result.retryable) {
            dispatchLiveDesktopState({
              type: "fetch_retryable_failure",
              failureCode: result.code,
              debug,
            });
            retryTimer = setTimeout(() => {
              dispatchLiveDesktopState({ type: "retry" });
            }, LIVE_DESKTOP_RETRY_MS);
          } else {
            dispatchLiveDesktopState({
              type: "fetch_blocking_failure",
              failureCode: result.code,
              debug,
            });
          }
          return;
        }
        const debug =
          result.debug && typeof result.debug === "object" && !Array.isArray(result.debug)
            ? (result.debug as Record<string, unknown>)
            : null;
        dispatchLiveDesktopState({
          type: "fetch_success",
          runId: activeRunId,
          embeddedUrl: buildWorkspaceEmbeddedLiveDesktopUrl({
            previewProxyToken: result.session.preview_proxy_token,
          }),
          rawUrl: buildWorkspaceRawLiveDesktopUrl({
            previewProxyToken: result.session.preview_proxy_token,
            viewOnly: false,
          }),
          expiresAtMs: Date.parse(result.session.expires_at),
          debug,
        });
        emitWorkspaceEvent({
          scope: "computer_use",
          name: "computer_use_view_attach",
          status: "success",
          runId: activeRunId,
          detail: {
            previewUrlOk:
              result.debug?.preview_url_ok === true || result.debug?.signed_preview_ok === true,
            hasRawLiveDesktopUrl: true,
          },
        });
      })
      .catch((error) => {
        if (cancelled) return;
        dispatchLiveDesktopState({
          type: "fetch_blocking_failure",
          failureCode: "live_lookup_failed",
          debug: {
            stage: "client_lookup",
            message: error instanceof Error ? error.message : String(error ?? "unknown_error"),
          },
        });
        emitWorkspaceEvent({
          scope: "computer_use",
          name: "computer_use_view_attach",
          status: "failure",
          runId: activeRunId,
          error: formatWorkspaceInstrumentationError(error),
        });
      });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [
    activeRunId,
    liveDesktopBlocked,
    liveDesktopUrl,
    liveDesktopState.attempt,
    liveDesktopState.expiresAtMs,
    liveDesktopState.runId,
    props.session,
    shouldRequireLiveDesktop,
  ]);

  if (!viewer) return null;
  if (shouldHideUntilLiveDesktopReady) return null;

  return (
    <section className={`runtime-computer-viewer status-${visibleViewerStatus}`}>
      <div className="runtime-computer-viewer-header">
        <div className="runtime-computer-viewer-title-row">
          <span className="runtime-computer-viewer-title">Computer Use</span>
          <span className={`runtime-computer-viewer-status is-${visibleViewerStatus}`}>
            {visibleViewerStatus === "live"
              ? "Live"
              : visibleViewerStatus === "starting"
                ? "Starting"
                : visibleViewerStatus === "unavailable"
                  ? "Unavailable"
                  : visibleViewerStatus === "stopped"
                    ? "Stopped"
                    : visibleViewerStatus === "history"
                      ? "History"
                      : "Error"}
          </span>
        </div>
        <div className="runtime-computer-viewer-subtitle">
          {viewer.pendingActionTitle
            ? `${viewer.pendingActionTitle}...`
            : liveDesktopUrl
              ? "Watching live desktop"
              : viewer.latestActionTitle || "Latest desktop frame"}
        </div>
      </div>

      {liveDesktopUrl ? (
        <div className="runtime-computer-viewer-frame runtime-computer-viewer-frame-live">
          <iframe
            title="Live computer-use desktop"
            src={liveDesktopUrl}
            loading="eager"
            referrerPolicy="no-referrer"
            tabIndex={-1}
          />
        </div>
      ) : shouldRequireLiveDesktop ? (
        <div className="runtime-computer-viewer-frame runtime-computer-viewer-frame-empty">
          {isLoadingLiveDesktop ? "Connecting live desktop..." : "Live desktop unavailable."}
        </div>
      ) : viewer.latestFrameUrl ? (
        <div className="runtime-computer-viewer-frame">
          <img
            src={viewer.latestFrameUrl}
            alt={viewer.latestSummary || viewer.latestActionTitle || "Latest computer-use frame"}
            loading="lazy"
          />
        </div>
      ) : (
        <div className="runtime-computer-viewer-frame runtime-computer-viewer-frame-empty">
          {isLoadingLiveDesktop ? "Connecting live desktop..." : "No frame available yet."}
        </div>
      )}

      {viewer.latestSummary ? (
        <div className="runtime-computer-viewer-summary">{viewer.latestSummary}</div>
      ) : null}

      {shouldRequireLiveDesktop && !liveDesktopUrl && (isLoadingLiveDesktop || liveDesktopFailureCode) ? (
        <div className="runtime-computer-viewer-summary">
          {isLoadingLiveDesktop
            ? "Connecting the live workspace desktop."
            : liveDesktopFailureCode
              ? `${liveDesktopStatusMessage} (${liveDesktopFailureCode})`
              : liveDesktopStatusMessage}
        </div>
      ) : null}

      {shouldRequireLiveDesktop && !liveDesktopUrl && liveDesktopDebugMessage ? (
        <div className="runtime-computer-viewer-summary">{liveDesktopDebugMessage}</div>
      ) : null}

      {shouldRequireLiveDesktop && (rawLiveDesktopUrl || viewer.latestFrameUrl) ? (
        <details className="runtime-computer-viewer-diagnostics">
          <summary>Desktop diagnostics</summary>
          <div className="runtime-computer-viewer-diagnostics-body">
            {liveDesktopOrigin ? (
              <p className="runtime-computer-viewer-diagnostics-note">
                Embedded live desktop origin: <code>{liveDesktopOrigin}</code>
              </p>
            ) : null}
            {rawLiveDesktopOrigin ? (
              <p className="runtime-computer-viewer-diagnostics-note">
                Interactive live desktop origin: <code>{rawLiveDesktopOrigin}</code>
              </p>
            ) : null}
            {rawLiveDesktopUrl ? (
              <a
                className="runtime-computer-viewer-diagnostics-link"
                href={rawLiveDesktopUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open live desktop proxy (interactive)
              </a>
            ) : null}
            {viewer.latestFrameUrl ? (
              <a
                className="runtime-computer-viewer-diagnostics-link"
                href={viewer.latestFrameUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open latest agent screenshot
              </a>
            ) : null}
            <p className="runtime-computer-viewer-diagnostics-note">
              Use the interactive live desktop proxy link to test the same remote desktop in its own tab. If that proxy
              desktop works but this embedded viewer does not, the iframe transport is still wrong. If both the proxy
              desktop and the latest agent screenshot stay static, the agent is not changing the visible desktop.
            </p>
          </div>
        </details>
      ) : null}

      {viewer.recentSteps.length > 0 ? (
        <div className="runtime-computer-viewer-steps">
          {viewer.recentSteps.map((step) => (
            <div key={step.id} className={`runtime-computer-viewer-step is-${step.status}`}>
              <span className="runtime-computer-viewer-step-title">{step.title}</span>
              {step.summary ? (
                <span className="runtime-computer-viewer-step-summary">{step.summary}</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
