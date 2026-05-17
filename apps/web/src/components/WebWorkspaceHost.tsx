import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  ChangeEventHandler,
  ClipboardEventHandler,
  Dispatch,
  DragEventHandler,
  MutableRefObject,
  ReactNode,
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  SetStateAction,
} from "react";
import {
  getProjectWorkspaceTerminalPreviewUrl,
  listProjectWorkspaceTerminalSnapshot,
  recordProjectWorkspaceTerminalPreviewObservation,
  stopAllProjectWorkspaceTerminals,
  stopProjectWorkspaceTerminal,
  type DaytonaWorkspaceTerminalPreview,
  type DaytonaWorkspaceTerminalRecord,
  type DaytonaWorkspaceTerminalPreviewStatus,
} from "../../../../shared/daytonaWorkspaceTerminals";
import { resolveAuthSubject, type AuthSessionLike } from "../../../../shared/authSession";
import type { ModelToggle } from "../../../../shared/modelCatalog";
import { useMessageAttachmentInputController } from "../../../../shared/useMessageAttachmentInputController";
import { useWorkspaceAutoScroll } from "../../../../shared/useWorkspaceAutoScroll";
import { VoiceInputButton } from "../../../../shared/VoiceInputButton";
import {
  emitWorkspaceEvent,
  formatWorkspaceInstrumentationError,
} from "../lib/workspaceInstrumentation";
import { useWebThreadMessagesLifecycle } from "../controllers/useWebThreadMessagesLifecycle";
import {
  WebWorkspaceAppPreview,
  isRetryablePreviewStatus,
  type WorkspacePreviewMetricsObservation,
  type WorkspacePreviewLifecycleState,
} from "./WebWorkspaceAppPreview";
import { WebBackgroundTerminalRail } from "./WebBackgroundTerminalRail";
import type { ThreadStreamingRuntimeEvent } from "../../../../shared/webTurnRunnerCore";
import { WebWorkspaceThreadError } from "./WebWorkspaceThreadError";
import { WebWorkspaceThreadMessageList } from "./WebWorkspaceThreadMessageList";
import { WebWorkspaceStreamingMessage } from "./WebWorkspaceStreamingMessage";
import {
  clampOperatorRightPanelWidth,
  OPERATOR_RIGHT_PANEL_DEFAULT_WIDTH,
  OPERATOR_RIGHT_PANEL_GUTTER,
  OPERATOR_RIGHT_PANEL_KEYBOARD_STEP,
  useOperatorDashboardData,
  WebOperatorDataPanel,
} from "./WebOperatorDataPanel";
import {
  buildWorkspaceRightPanelTabs,
  parseWorkspaceRightPanelTab,
  resolveWorkspaceRightPanelTab,
  type WorkspaceRightPanelTab,
} from "./workspaceRightPanelModel";
import {
  type WorkspaceUserDataPanelDataProps,
} from "./WebWorkspaceUserDataPanel";
import type {
  WorkspaceMarkdownRenderer,
  WorkspaceStreamingMessageView,
  WorkspaceThreadContextPayload,
  WorkspaceThreadErrorView,
  WorkspaceThreadMessageView,
} from "./webWorkspaceThreadViews";

type WorkspaceAttachmentView = {
  id: string;
  name: string;
  type: string;
  mime?: string | null;
  size?: number;
  storage_id?: string | null;
  url?: string | null;
  data_url?: string | null;
  text?: string | null;
  truncated?: boolean | null;
  file?: File | null;
};

type LandingActionButton = {
  id: string;
  label: string;
  prompt: string;
};

const LEGACY_WORKSPACE_RIGHT_PANEL_TAB_STORAGE_KEY = "polynet-workspace-right-panel-tab";
const WORKSPACE_RIGHT_PANEL_TAB_STORAGE_KEY_PREFIX = "polynet-workspace-right-panel-tab:v2";

function buildWorkspaceRightPanelTabStorageKey(userId: string): string {
  return `${WORKSPACE_RIGHT_PANEL_TAB_STORAGE_KEY_PREFIX}:${userId}`;
}

function loadWorkspaceRightPanelTab(userId: string | null): WorkspaceRightPanelTab {
  try {
    if (typeof window === "undefined") return "workspace";
    if (userId) {
      const scopedTab = parseWorkspaceRightPanelTab(
        window.localStorage.getItem(buildWorkspaceRightPanelTabStorageKey(userId)),
      );
      if (scopedTab) return scopedTab;
    }
    return parseWorkspaceRightPanelTab(
      window.localStorage.getItem(LEGACY_WORKSPACE_RIGHT_PANEL_TAB_STORAGE_KEY),
    ) ?? "workspace";
  } catch {
    return "workspace";
  }
}

function storeWorkspaceRightPanelTab(userId: string | null, tab: WorkspaceRightPanelTab): void {
  try {
    if (typeof window === "undefined" || !userId) return;
    window.localStorage.setItem(buildWorkspaceRightPanelTabStorageKey(userId), tab);
  } catch {
    // Right-panel tab selection is a local display preference only.
  }
}

export type WorkspaceComposerDraft = {
  text: string;
  attachments: WorkspaceAttachmentView[];
};

export type WorkspaceComposerApi = {
  focus: () => void;
  clear: () => void;
  reset: () => void;
  appendTranscript: (transcript: string) => void;
  pinToBottom: () => void;
};

export type WebWorkspaceHostProps = {
  session: AuthSessionLike | null;
  hasSession: boolean;
  hasAuthenticatedPresentation: boolean;
  isAuthRecoveringSignedIn: boolean;
  isAccountGraphHydratingCritical: boolean;
  activeThreadId: string | null;
  guestThreadId: string;
  isEmptyWorkspaceThread: boolean;
  showEmptyThreadLandingSkeleton: boolean;
  isHydratingActiveWorkspaceThread: boolean;
  isActiveWorkspaceThreadBusy: boolean;
  isStreamingWorkspaceTurn: boolean;
  inferenceToast: string | null;
  memoryToast: string | null;
  emptyThreadClassName: string;
  emptyThreadAvatar: ReactNode;
  emptyThreadTitle: ReactNode;
  emptyThreadSubtitle: ReactNode;
  guestSignupRail: ReactNode;
  emptyThreadSetupCard: ReactNode;
  initialComposerDraft: WorkspaceComposerDraft;
  onComposerDraftChange: (draft: WorkspaceComposerDraft) => void;
  onRegisterComposerApi: (api: WorkspaceComposerApi | null) => void;
  onOperatorPanelLayoutChange?: (layout: { open: boolean; width: number; gutter: number }) => void;
  landingActionButtons: LandingActionButton[];
  authedWorkspaceComposerPlaceholder: string;
  guestWorkspaceComposerPlaceholder: string;
  setWorkspaceError: Dispatch<SetStateAction<string | null>>;
  ingestWorkspaceAttachmentsFromFileList: (
    files: FileList | readonly File[],
    existing: WorkspaceAttachmentView[],
    onError: (message: string) => void,
  ) => Promise<WorkspaceAttachmentView[]>;
  setLoadingThreadMessagesThreadId: Dispatch<SetStateAction<string | null>>;
  setThreadMessages: Dispatch<SetStateAction<any[]>>;
  loadThreadMessages: (threadId: string, session: unknown) => Promise<void>;
  onSendMessage: (payload: {
    text: string;
    attachments: WorkspaceAttachmentView[];
    clearComposer: () => void;
  }) => void;
  onStopStreamingTurn: () => void;
  resolveWorkspaceSession: () => Promise<unknown | null>;
  activeProjectId: string | null;
  showAppToastMessage: (message: string) => void;
  activeModelLabel: string;
  modelToggles: ModelToggle[];
  workspaceVoiceUiState: "idle" | "recording" | "transcribing";
  workspaceVoiceTitle: string;
  onWorkspaceVoiceClick: () => void;
  activeThreadStreamingRunId?: string | null;
  activeThreadRuntimeEvents?: ThreadStreamingRuntimeEvent[] | null;
  runtimeEventsByRunId?: Record<string, ThreadStreamingRuntimeEvent[]>;
  threadErrorView: WorkspaceThreadErrorView | null;
  onRequireThreadErrorSignIn: () => void;
  onRetryLastThreadError: () => Promise<void> | void;
  threadMessageViews: WorkspaceThreadMessageView[];
  streamingMessageView: WorkspaceStreamingMessageView | null;
  copiedMessageId: string | null;
  handleCopyMessage: (messageId: string, text: string) => Promise<void> | void;
  openMessageContextModal: (payload: WorkspaceThreadContextPayload) => void;
  renderMarkdown: WorkspaceMarkdownRenderer;
  copyTextToClipboard: (text: string) => Promise<void> | void;
  showWorkspaceRightPanel?: boolean;
  operatorDataPanelSession?: AuthSessionLike | null;
  workspaceRightPanelOpen?: boolean;
  workspaceUserDataPanel?: WorkspaceUserDataPanelDataProps | null;
};

function parsePreviewRunAnchor(
  event: ThreadStreamingRuntimeEvent,
): { runId: string; terminalId: string; updatedAt: number } | null {
  if (event.event_type !== "tool_call_finished") return null;
  const payload =
    event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
      ? (event.payload as Record<string, unknown>)
      : null;
  if (!payload) return null;
  if (payload.tool_name !== "terminal_start" || payload.success !== true) return null;
  const details =
    payload.details && typeof payload.details === "object" && !Array.isArray(payload.details)
      ? (payload.details as Record<string, unknown>)
      : null;
  if (!details) return null;
  const terminalId = String(details.terminal_session_id ?? "").trim();
  const previewPort =
    typeof details.preview_port === "number" && Number.isFinite(details.preview_port)
      ? Math.floor(details.preview_port)
      : null;
  const runId = String(event.run_id ?? "").trim();
  if (!terminalId || !runId || previewPort == null || previewPort < 3000) return null;
  return {
    runId,
    terminalId,
    updatedAt: Date.parse(event.created_at) || 0,
  };
}

function buildLatestPreviewRunIdByTerminalId(params: {
  activeThreadStreamingRunId?: string | null;
  activeThreadRuntimeEvents?: readonly ThreadStreamingRuntimeEvent[] | null;
  runtimeEventsByRunId?: Record<string, ThreadStreamingRuntimeEvent[]>;
}): Record<string, string> {
  const runtimeEventBatches = Object.values(params.runtimeEventsByRunId ?? {});
  const next = new Map<string, { runId: string; updatedAt: number }>();
  const ingest = (events: readonly ThreadStreamingRuntimeEvent[] | null | undefined) => {
    if (!Array.isArray(events)) return;
    for (const event of events) {
      const anchor = parsePreviewRunAnchor(event);
      if (!anchor) continue;
      const current = next.get(anchor.terminalId);
      if (!current || anchor.updatedAt >= current.updatedAt) {
        next.set(anchor.terminalId, { runId: anchor.runId, updatedAt: anchor.updatedAt });
      }
    }
  };

  for (const events of runtimeEventBatches) ingest(events);
  if (params.activeThreadStreamingRunId) ingest(params.activeThreadRuntimeEvents);

  const byTerminalId: Record<string, string> = {};
  for (const [terminalId, value] of next.entries()) {
    byTerminalId[terminalId] = value.runId;
  }
  return byTerminalId;
}

function resolvePreviewOwningRunId(
  terminal: DaytonaWorkspaceTerminalRecord,
  latestPreviewRunIdByTerminalId: Record<string, string>,
): string | null {
  const anchoredRunId = String(latestPreviewRunIdByTerminalId[terminal.id] ?? "").trim();
  if (anchoredRunId) return anchoredRunId;
  const persistedRunId = String(terminal.started_by_run_id ?? "").trim();
  return persistedRunId || null;
}

function resolveTerminalAccessRunId(
  terminal: DaytonaWorkspaceTerminalRecord,
): string | null {
  const persistedRunId = String(terminal.started_by_run_id ?? "").trim();
  return persistedRunId || null;
}

function isRuntimeOwnedTerminalRecord(
  terminal: DaytonaWorkspaceTerminalRecord,
): boolean {
  return Boolean(resolveTerminalAccessRunId(terminal));
}

function isTerminalSnapshotStatusActive(status: DaytonaWorkspaceTerminalRecord["status"]): boolean {
  return status === "starting" || status === "running";
}

function areTerminalRecordsEqual(
  left: readonly DaytonaWorkspaceTerminalRecord[],
  right: readonly DaytonaWorkspaceTerminalRecord[],
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (!a || !b) return false;
    if (
      a.id !== b.id ||
      a.started_by_run_id !== b.started_by_run_id ||
      a.status !== b.status ||
      a.command !== b.command ||
      a.cwd !== b.cwd ||
      a.preview_label !== b.preview_label ||
      a.preview_path !== b.preview_path ||
      a.preview_port !== b.preview_port ||
      a.preview_status !== b.preview_status ||
      a.preview_transport_status !== b.preview_transport_status ||
      a.preview_inspection_status !== b.preview_inspection_status ||
      a.preview_render_status !== b.preview_render_status ||
      a.last_preview_probe_summary !== b.last_preview_probe_summary ||
      a.last_browser_observation_summary !== b.last_browser_observation_summary ||
      a.health_status !== b.health_status ||
      a.health_summary !== b.health_summary ||
      a.exit_code !== b.exit_code ||
      a.output_tail !== b.output_tail
    ) {
      return false;
    }
  }
  return true;
}

function applyTerminalSnapshotIfChanged(
  next: {
    active: DaytonaWorkspaceTerminalRecord[];
    recent?: DaytonaWorkspaceTerminalRecord[];
  },
  setActive: Dispatch<SetStateAction<DaytonaWorkspaceTerminalRecord[]>>,
): void {
  const combined = [...next.active, ...(next.recent ?? [])];
  setActive((prev) => (areTerminalRecordsEqual(prev, combined) ? prev : combined));
}

function isPreviewCapableTerminal(terminal: DaytonaWorkspaceTerminalRecord): boolean {
  return (
    typeof terminal.preview_port === "number" &&
    Number.isFinite(terminal.preview_port) &&
    terminal.preview_port >= 3000
  );
}

function arePreviewLifecycleStatesEqual(
  left: Record<string, WorkspacePreviewLifecycleState>,
  right: Record<string, WorkspacePreviewLifecycleState>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    const a = left[key];
    const b = right[key];
    if (!a || !b) return false;
    if (a.phase !== b.phase || a.error !== b.error) return false;
    const aPreview = a.preview;
    const bPreview = b.preview;
    if (!aPreview && !bPreview) continue;
    if (!aPreview || !bPreview) return false;
    if (
      aPreview.preview_url !== bPreview.preview_url ||
      aPreview.preview_proxy_token !== bPreview.preview_proxy_token ||
      aPreview.preview_path !== bPreview.preview_path
    ) {
      return false;
    }
  }
  return true;
}

const PREVIEW_RESOLUTION_TIMEOUT_MS = 12000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
    void promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function previewObservationForLifecyclePhase(
  phase: "loading" | "ready" | "error",
): {
  previewStatus: DaytonaWorkspaceTerminalPreviewStatus;
  previewTransportStatus: Exclude<DaytonaWorkspaceTerminalRecord["preview_transport_status"], null>;
  previewInspectionStatus: Exclude<DaytonaWorkspaceTerminalRecord["preview_inspection_status"], null>;
  previewRenderStatus: Exclude<DaytonaWorkspaceTerminalRecord["preview_render_status"], null>;
  previewProbeSummary: string;
  browserObservationSummary: string | null;
} {
  if (phase === "error") {
    return {
      previewStatus: "unreachable",
      previewTransportStatus: "failed",
      previewInspectionStatus: "not_attempted",
      previewRenderStatus: "transport_error",
      previewProbeSummary: "Preview iframe failed to load.",
      browserObservationSummary: "The inline preview iframe reported a load error.",
    };
  }
  if (phase === "ready") {
    return {
      previewStatus: "running",
      previewTransportStatus: "loaded",
      previewInspectionStatus: "not_attempted",
      previewRenderStatus: "unknown",
      previewProbeSummary: "Preview transport loaded; app render is not yet verified.",
      browserObservationSummary:
        "The inline preview iframe loaded, but visible app content has not been verified yet.",
    };
  }
  return {
    previewStatus: "starting",
    previewTransportStatus: "loading",
    previewInspectionStatus: "not_attempted",
    previewRenderStatus: "unknown",
    previewProbeSummary: "Preview iframe is loading.",
    browserObservationSummary: null,
  };
}

function previewObservationForMetrics(
  metrics: WorkspacePreviewMetricsObservation,
): {
  previewStatus: DaytonaWorkspaceTerminalPreviewStatus;
  previewTransportStatus: Exclude<DaytonaWorkspaceTerminalRecord["preview_transport_status"], null>;
  previewInspectionStatus: Exclude<DaytonaWorkspaceTerminalRecord["preview_inspection_status"], null>;
  previewRenderStatus: Exclude<DaytonaWorkspaceTerminalRecord["preview_render_status"], null>;
  previewProbeSummary: string;
  browserObservationSummary: string;
} {
  const width = metrics.width ?? 0;
  const height = metrics.height ?? 0;
  const viewportWidth = metrics.viewportWidth ?? 0;
  const viewportHeight = metrics.viewportHeight ?? 0;
  const visibleTextLength = metrics.visibleTextLength ?? 0;
  const elementCount = metrics.elementCount ?? 0;
  const mediaElementCount = metrics.mediaElementCount ?? 0;
  const rootChildCount = metrics.rootChildCount;
  const bodyChildCount = metrics.bodyChildCount;
  if (metrics.probeAccess === "cross_origin_uninspectable") {
    return {
      previewStatus: "running",
      previewTransportStatus: "loaded",
      previewInspectionStatus: "cross_origin_uninspectable",
      previewRenderStatus: "unknown",
      previewProbeSummary:
        "Preview transport loaded, but iframe DOM could not be inspected from this origin.",
      browserObservationSummary:
        "The inline preview attached successfully, but render health is unverified because the iframe document is cross-origin.",
    };
  }
  if (metrics.probeAccess === "unavailable") {
    return {
      previewStatus: "running",
      previewTransportStatus: "loaded",
      previewInspectionStatus: "dom_unavailable",
      previewRenderStatus: "unknown",
      previewProbeSummary:
        "Preview transport loaded, but iframe DOM was unavailable during the render probe.",
      browserObservationSummary:
        "The inline preview attached successfully, but render health is still unverified.",
    };
  }
  const looksBlank =
    width <= 2 ||
    height <= 2 ||
    (visibleTextLength === 0 &&
      mediaElementCount === 0 &&
      elementCount <= 5 &&
      (rootChildCount === null || rootChildCount === 0));
  const sizeSummary =
    width > 0 && height > 0
      ? `${width}x${height} in ${viewportWidth || "unknown"}x${viewportHeight || "unknown"} viewport`
      : "unknown preview dimensions";
  const domSummary = `text=${visibleTextLength}; elements=${elementCount}; media=${mediaElementCount}; root_children=${rootChildCount ?? "unknown"}; body_children=${bodyChildCount ?? "unknown"}`;
  if (looksBlank) {
    return {
      previewStatus: "blank",
      previewTransportStatus: "loaded",
      previewInspectionStatus: "same_origin_dom",
      previewRenderStatus: "blank_suspected",
      previewProbeSummary: `Preview loaded but rendered blank (${sizeSummary}; ${domSummary}).`,
      browserObservationSummary: `The preview iframe loaded, but the app render appears blank (${domSummary}).`,
    };
  }
  const overflowSummary =
    metrics.overflowX === true || metrics.overflowY === true
      ? `; overflow=${metrics.overflowX ? "x" : ""}${metrics.overflowY ? "y" : ""}`
      : "";
  return {
    previewStatus: "running",
    previewTransportStatus: "loaded",
    previewInspectionStatus: "same_origin_dom",
    previewRenderStatus: "visible_content",
    previewProbeSummary: `Preview rendered visible content (${sizeSummary}; ${domSummary}${overflowSummary}).`,
    browserObservationSummary: `The preview iframe loaded and visible app content was detected (${domSummary}).`,
  };
}

const WorkspaceTimelinePane = memo(function WorkspaceTimelinePane(props: {
  isEmptyWorkspaceThread: boolean;
  showEmptyThreadLandingSkeleton: boolean;
  isHydratingActiveWorkspaceThread: boolean;
  emptyThreadClassName: string;
  emptyThreadAvatar: ReactNode;
  emptyThreadTitle: ReactNode;
  emptyThreadSubtitle: ReactNode;
  emptyThreadSetupCard: ReactNode;
  landingActionButtons: LandingActionButton[];
  hasSession: boolean;
  hasAuthenticatedPresentation: boolean;
  isAuthRecoveringSignedIn: boolean;
  isAccountGraphHydratingCritical: boolean;
  isActiveWorkspaceThreadBusy: boolean;
  isStreamingWorkspaceTurn: boolean;
  workspaceAttachments: WorkspaceAttachmentView[];
  messageInput: string;
  setMessageInput: Dispatch<SetStateAction<string>>;
  workspaceAskInputRef: MutableRefObject<HTMLTextAreaElement | null>;
  workspaceFileInputRef: MutableRefObject<HTMLInputElement | null>;
  authedWorkspaceComposerPlaceholder: string;
  guestWorkspaceComposerPlaceholder: string;
  activeModelLabel: string;
  modelToggles: ModelToggle[];
  workspaceVoiceUiState: "idle" | "recording" | "transcribing";
  workspaceVoiceTitle: string;
  onWorkspaceFileInputChange: ChangeEventHandler<HTMLInputElement>;
  onWorkspaceAttachmentPaste: ClipboardEventHandler<HTMLTextAreaElement>;
  onRemoveWorkspaceAttachment: (attachmentId: string) => void;
  onSendMessage: () => void;
  onSendLandingAction: (prompt: string) => void;
  onStopStreamingTurn: () => void;
  onWorkspaceVoiceClick: () => void;
  guestSignupRail: ReactNode;
  session: AuthSessionLike | null;
  threadErrorView: WorkspaceThreadErrorView | null;
  onRequireThreadErrorSignIn: () => void;
  onRetryLastThreadError: () => Promise<void> | void;
  threadMessageViews: WorkspaceThreadMessageView[];
  streamingMessageView: WorkspaceStreamingMessageView | null;
  copiedMessageId: string | null;
  handleCopyMessage: (messageId: string, text: string) => Promise<void> | void;
  openMessageContextModal: (payload: WorkspaceThreadContextPayload) => void;
  renderMarkdown: WorkspaceMarkdownRenderer;
  copyTextToClipboard: (text: string) => Promise<void> | void;
  renderPreviewForRun: (runId: string | null) => ReactNode;
}) {
  return (
    <>
      {props.isEmptyWorkspaceThread ? (
        <>
          {props.showEmptyThreadLandingSkeleton || props.isHydratingActiveWorkspaceThread ? (
            <div className="web-empty-thread web-empty-thread-skeleton" role="status" aria-live="polite">
              <div className="web-empty-thread-avatar web-skeleton-block" aria-hidden="true" />
              <div className="web-skeleton-block web-skeleton-title" aria-hidden="true" />
              <div className="web-skeleton-block web-skeleton-subtitle" aria-hidden="true" />
              <div className="web-empty-thread-composer web-empty-thread-composer-skeleton" aria-hidden="true">
                <div className="web-skeleton-composer web-skeleton-block" />
              </div>
              <div className="web-empty-thread-actions web-empty-thread-actions-skeleton" aria-hidden="true">
                <div className="web-skeleton-card" />
                <div className="web-skeleton-card" />
                <div className="web-skeleton-card" />
              </div>
            </div>
          ) : (
            <div className={props.emptyThreadClassName} role="region" aria-label="Start a new thread">
              {props.emptyThreadAvatar}
              <div className="web-empty-thread-title">{props.emptyThreadTitle}</div>
              {props.emptyThreadSubtitle}
              <div className="web-empty-thread-composer">
                <WorkspaceComposer
                  landing
                  hasSession={props.hasSession}
                  hasAuthenticatedPresentation={props.hasAuthenticatedPresentation}
                  isAuthRecoveringSignedIn={props.isAuthRecoveringSignedIn}
                  isAccountGraphHydratingCritical={props.isAccountGraphHydratingCritical}
                  isActiveWorkspaceThreadBusy={props.isActiveWorkspaceThreadBusy}
                  isStreamingWorkspaceTurn={props.isStreamingWorkspaceTurn}
                  messageInput={props.messageInput}
                  setMessageInput={props.setMessageInput}
                  workspaceAttachments={props.workspaceAttachments}
                  workspaceAskInputRef={props.workspaceAskInputRef}
                  workspaceFileInputRef={props.workspaceFileInputRef}
                  workspaceComposerPlaceholder={
                    props.hasAuthenticatedPresentation
                      ? props.workspaceAttachments.length > 0
                        ? "Add a message or send files..."
                        : props.authedWorkspaceComposerPlaceholder
                      : props.guestWorkspaceComposerPlaceholder
                  }
                  terminals={[]}
                  busyTerminalIds={[]}
                  isStoppingAllTerminals={false}
                  guestSignupRail={props.guestSignupRail}
                  activeModelLabel={props.activeModelLabel}
                  modelToggles={props.modelToggles}
                  workspaceVoiceUiState={props.workspaceVoiceUiState}
                  workspaceVoiceTitle={props.workspaceVoiceTitle}
                  onWorkspaceFileInputChange={props.onWorkspaceFileInputChange}
                  onWorkspaceAttachmentPaste={props.onWorkspaceAttachmentPaste}
                  onRemoveWorkspaceAttachment={props.onRemoveWorkspaceAttachment}
                  onSendMessage={props.onSendMessage}
                  onStopStreamingTurn={props.onStopStreamingTurn}
                  onStopTerminal={() => {}}
                  onStopAllTerminals={() => {}}
                  onWorkspaceVoiceClick={props.onWorkspaceVoiceClick}
                />
              </div>
              <div className="web-empty-thread-actions" role="list">
                {props.landingActionButtons.map((button) => (
                  <button
                    key={button.id}
                    className="web-empty-thread-action"
                    type="button"
                    disabled={
                      props.isAuthRecoveringSignedIn ||
                      props.isActiveWorkspaceThreadBusy ||
                      props.isStreamingWorkspaceTurn
                    }
                    onClick={() => props.onSendLandingAction(button.prompt)}
                  >
                    <span className="web-empty-thread-action-text">{button.label}</span>
                    <span className="web-empty-thread-action-arrow" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </span>
                  </button>
                ))}
              </div>
              {props.emptyThreadSetupCard}
            </div>
          )}
        </>
      ) : null}
      <WebWorkspaceThreadError
        view={props.threadErrorView}
        onRequireSignIn={props.onRequireThreadErrorSignIn}
        onRetryLastTurn={props.onRetryLastThreadError}
      />
      <WebWorkspaceThreadMessageList
        messages={props.threadMessageViews}
        copiedMessageId={props.copiedMessageId}
        session={props.session}
        renderMarkdown={props.renderMarkdown}
        copyTextToClipboard={props.copyTextToClipboard}
        handleCopyMessage={props.handleCopyMessage}
        openMessageContextModal={props.openMessageContextModal}
        renderPreviewForRun={props.renderPreviewForRun}
      />
      <WebWorkspaceStreamingMessage
        view={props.streamingMessageView}
        session={props.session}
        renderMarkdown={props.renderMarkdown}
        copyTextToClipboard={props.copyTextToClipboard}
        renderPreviewForRun={props.renderPreviewForRun}
      />
    </>
  );
}, (prev, next) => {
  if (
    prev.isEmptyWorkspaceThread !== next.isEmptyWorkspaceThread ||
    prev.showEmptyThreadLandingSkeleton !== next.showEmptyThreadLandingSkeleton ||
    prev.isHydratingActiveWorkspaceThread !== next.isHydratingActiveWorkspaceThread ||
    prev.hasSession !== next.hasSession ||
    prev.hasAuthenticatedPresentation !== next.hasAuthenticatedPresentation ||
    prev.isAuthRecoveringSignedIn !== next.isAuthRecoveringSignedIn ||
    prev.isAccountGraphHydratingCritical !== next.isAccountGraphHydratingCritical ||
    prev.renderPreviewForRun !== next.renderPreviewForRun ||
    prev.onRequireThreadErrorSignIn !== next.onRequireThreadErrorSignIn ||
    prev.onRetryLastThreadError !== next.onRetryLastThreadError ||
    prev.handleCopyMessage !== next.handleCopyMessage ||
    prev.openMessageContextModal !== next.openMessageContextModal ||
    prev.renderMarkdown !== next.renderMarkdown ||
    prev.copyTextToClipboard !== next.copyTextToClipboard ||
    !areWorkspaceThreadErrorViewsEqual(prev.threadErrorView, next.threadErrorView) ||
    !areWorkspaceThreadMessageViewsEqual(prev.threadMessageViews, next.threadMessageViews) ||
    !areWorkspaceStreamingMessageViewsEqual(
      prev.streamingMessageView,
      next.streamingMessageView,
    )
  ) {
    return false;
  }
  if (!prev.isEmptyWorkspaceThread && !next.isEmptyWorkspaceThread) {
    return true;
  }
  return (
    prev.messageInput === next.messageInput &&
    prev.workspaceAttachments === next.workspaceAttachments &&
    prev.hasSession === next.hasSession &&
    prev.hasAuthenticatedPresentation === next.hasAuthenticatedPresentation &&
    prev.isAuthRecoveringSignedIn === next.isAuthRecoveringSignedIn &&
    prev.isAccountGraphHydratingCritical === next.isAccountGraphHydratingCritical &&
    prev.isActiveWorkspaceThreadBusy === next.isActiveWorkspaceThreadBusy &&
    prev.isStreamingWorkspaceTurn === next.isStreamingWorkspaceTurn
  );
});

function areWorkspaceThreadErrorViewsEqual(
  left: WorkspaceThreadErrorView | null,
  right: WorkspaceThreadErrorView | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.displayedError === right.displayedError &&
    left.showSignInAction === right.showSignInAction &&
    left.showRetryAction === right.showRetryAction
  );
}

function areWorkspaceThreadAttachmentViewsEqual(
  left: WorkspaceThreadMessageView["attachments"],
  right: WorkspaceThreadMessageView["attachments"],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (!a || !b) return false;
    if (
      a.id !== b.id ||
      a.name !== b.name ||
      a.imageUrl !== b.imageUrl ||
      a.openUrl !== b.openUrl
    ) {
      return false;
    }
  }
  return true;
}

function areWorkspaceThreadMessageViewsEqual(
  left: WorkspaceThreadMessageView[],
  right: WorkspaceThreadMessageView[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (!a || !b) return false;
    if (
      a.id !== b.id ||
      a.role !== b.role ||
      a.textContent !== b.textContent ||
      a.runId !== b.runId ||
      a.requireLiveDesktop !== b.requireLiveDesktop ||
      a.modelLabel !== b.modelLabel ||
      a.contextPayload !== b.contextPayload ||
      a.runtimeEvents !== b.runtimeEvents ||
      !areWorkspaceThreadAttachmentViewsEqual(a.attachments, b.attachments)
    ) {
      return false;
    }
  }
  return true;
}

function areWorkspaceStreamingMessageViewsEqual(
  left: WorkspaceStreamingMessageView | null,
  right: WorkspaceStreamingMessageView | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.content === right.content &&
    left.runId === right.runId &&
    left.runtimeEvents === right.runtimeEvents
  );
}

function WorkspaceAttachmentPreview(props: {
  attachments: WorkspaceAttachmentView[];
  onRemove: (attachmentId: string) => void;
}) {
  if (props.attachments.length === 0) return null;
  return (
    <div className="attachments-preview workspace-attachments-preview">
      {props.attachments.map((att) => (
        <div key={att.id} className="attachment-item">
          {att.type === "image" && att.data_url ? (
            <img src={att.data_url} alt={att.name} className="attachment-thumb" />
          ) : (
            <div className="attachment-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M16 13H8" />
                <path d="M16 17H8" />
                <path d="M10 9H8" />
              </svg>
            </div>
          )}
          <span className="attachment-name" title={att.name}>
            {att.name}
          </span>
          <button
            className="attachment-remove"
            type="button"
            onClick={() => props.onRemove(att.id)}
            title="Remove"
            aria-label={`Remove ${att.name}`}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

function WorkspaceComposer(props: {
  landing?: boolean;
  hasSession: boolean;
  hasAuthenticatedPresentation: boolean;
  isAuthRecoveringSignedIn: boolean;
  isAccountGraphHydratingCritical: boolean;
  isActiveWorkspaceThreadBusy: boolean;
  isStreamingWorkspaceTurn: boolean;
  messageInput: string;
  setMessageInput: Dispatch<SetStateAction<string>>;
  workspaceAttachments: WorkspaceAttachmentView[];
  workspaceAskInputRef: MutableRefObject<HTMLTextAreaElement | null>;
  workspaceFileInputRef: MutableRefObject<HTMLInputElement | null>;
  workspaceComposerPlaceholder: string;
  terminals: DaytonaWorkspaceTerminalRecord[];
  busyTerminalIds: readonly string[];
  isStoppingAllTerminals: boolean;
  guestSignupRail: ReactNode;
  activeModelLabel: string;
  modelToggles: ModelToggle[];
  workspaceVoiceUiState: "idle" | "recording" | "transcribing";
  workspaceVoiceTitle: string;
  onWorkspaceFileInputChange: ChangeEventHandler<HTMLInputElement>;
  onWorkspaceAttachmentPaste: ClipboardEventHandler<HTMLTextAreaElement>;
  onRemoveWorkspaceAttachment: (attachmentId: string) => void;
  onSendMessage: () => void;
  onStopStreamingTurn: () => void;
  onStopTerminal: (terminalSessionId: string) => void;
  onStopAllTerminals: () => void;
  onWorkspaceVoiceClick: () => void;
  showTerminalRail?: boolean;
}) {
  const disableComposerActions =
    props.isAuthRecoveringSignedIn ||
    props.isAccountGraphHydratingCritical ||
    props.isActiveWorkspaceThreadBusy ||
    props.isStreamingWorkspaceTurn;
  const disableComposerInput =
    props.isActiveWorkspaceThreadBusy ||
    props.isStreamingWorkspaceTurn;
  const composerPlaceholder = props.landing
    ? "Describe what you need help with..."
    : props.workspaceComposerPlaceholder;

  const askBar = (
    <div className={`ask-bar ask-bar-v2${props.landing ? " ask-bar-landing" : ""}`}>
      <WorkspaceAttachmentPreview
        attachments={props.workspaceAttachments}
        onRemove={props.onRemoveWorkspaceAttachment}
      />
      <textarea
        ref={(node) => {
          props.workspaceAskInputRef.current = node;
        }}
        className={`ask-input ask-input-v2${props.landing ? " ask-input-landing" : ""}`}
        placeholder={composerPlaceholder}
        value={props.messageInput}
        onChange={(event) => props.setMessageInput(event.target.value)}
        onPaste={props.onWorkspaceAttachmentPaste}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (props.isAuthRecoveringSignedIn || props.isAccountGraphHydratingCritical) return;
            props.onSendMessage();
          }
        }}
        disabled={disableComposerInput}
        rows={1}
      />
      <div className={`ask-footer${props.landing ? " ask-footer-landing" : ""}`}>
        <div className="ask-footer-left">
          <button
            className="ask-icon-btn ask-plus"
            type="button"
            onClick={() => props.workspaceFileInputRef.current?.click()}
            disabled={!props.hasSession || disableComposerActions}
            aria-label="Attach files"
            title="Attach files"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <input
            ref={(node) => {
              props.workspaceFileInputRef.current = node;
            }}
            type="file"
            multiple
            accept="image/*,.txt,.md,.csv,.json,.ts,.tsx,.js,.jsx,.py,.rs,.go,.html,.css,.yml,.yaml,.pdf"
            style={{ display: "none" }}
            onChange={props.onWorkspaceFileInputChange}
          />
        </div>
        <div className={`ask-actions${props.landing ? " ask-actions-landing" : ""}`}>
          <VoiceInputButton
            state={props.workspaceVoiceUiState}
            title={props.workspaceVoiceTitle}
            onClick={props.onWorkspaceVoiceClick}
          />
          <button
            className="chat-send ask-send-btn ask-send-btn-v2"
            type="button"
            onClick={() => (props.isStreamingWorkspaceTurn ? props.onStopStreamingTurn() : props.onSendMessage())}
            disabled={
              props.isStreamingWorkspaceTurn
                ? false
                : props.isAuthRecoveringSignedIn ||
                  props.isAccountGraphHydratingCritical ||
                  props.isActiveWorkspaceThreadBusy ||
                  (props.messageInput.trim().length === 0 && props.workspaceAttachments.length === 0)
            }
            aria-label={props.isStreamingWorkspaceTurn ? "Stop" : "Send"}
            title={props.isStreamingWorkspaceTurn ? "Stop" : "Send"}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {props.isStreamingWorkspaceTurn ? (
                <rect x="7" y="7" width="10" height="10" rx="2" />
              ) : (
                <path d="M12 17V8M8.5 11.5 12 8l3.5 3.5" />
              )}
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  if (props.landing) {
    return (
      <>
        {!props.hasAuthenticatedPresentation ? props.guestSignupRail : null}
        {askBar}
      </>
    );
  }

  return (
    <div className="workspace-composer-lane">
      {props.showTerminalRail === false ? null : (
        <WebBackgroundTerminalRail
          terminals={props.terminals}
          busyTerminalIds={props.busyTerminalIds}
          isStoppingAll={props.isStoppingAllTerminals}
          onStopTerminal={props.onStopTerminal}
          onStopAll={props.onStopAllTerminals}
        />
      )}
      {!props.hasAuthenticatedPresentation ? props.guestSignupRail : null}
      {askBar}
    </div>
  );
}

export function WebWorkspaceHost(props: WebWorkspaceHostProps) {
  const initialRightPanelStorageUserId = resolveAuthSubject(props.session);
  const [messageInput, setMessageInput] = useState(props.initialComposerDraft.text);
  const [workspaceAttachments, setWorkspaceAttachments] = useState<WorkspaceAttachmentView[]>(
    props.initialComposerDraft.attachments,
  );
  const workspaceAttachmentsRef = useRef<WorkspaceAttachmentView[]>(props.initialComposerDraft.attachments);
  const workspaceAskInputRef = useRef<HTMLTextAreaElement | null>(null);
  const workspaceFileInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceMessageListRef = useRef<HTMLDivElement | null>(null);
  const workspaceMessageListContentRef = useRef<HTMLDivElement | null>(null);
  const [isWorkspaceAtBottom, setIsWorkspaceAtBottom] = useState(true);
  const workspacePinnedToBottomRef = useRef(true);
  const isLoadingThreadRef = useRef(false);
  const resolveWorkspaceSessionRef = useRef(props.resolveWorkspaceSession);
  const activeProjectIdRef = useRef<string | null>(props.activeProjectId);
  const activeProjectInstanceRef = useRef(0);
  const [activeWorkspaceTerminals, setActiveWorkspaceTerminals] = useState<DaytonaWorkspaceTerminalRecord[]>([]);
  const [busyWorkspaceTerminalIds, setBusyWorkspaceTerminalIds] = useState<string[]>([]);
  const [isStoppingAllWorkspaceTerminals, setIsStoppingAllWorkspaceTerminals] = useState(false);
  const [expandedPreviewTerminalId, setExpandedPreviewTerminalId] = useState<string | null>(null);
  const [previewStateByTerminalId, setPreviewStateByTerminalId] = useState<Record<string, WorkspacePreviewLifecycleState>>({});
  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean>(() =>
    typeof window === "undefined" ? true : window.matchMedia("(min-width: 901px)").matches,
  );
  const [requestedRightPanelTab, setRequestedRightPanelTab] =
    useState<WorkspaceRightPanelTab>(() => loadWorkspaceRightPanelTab(initialRightPanelStorageUserId));
  const [operatorRightPanelWidth, setOperatorRightPanelWidth] = useState(OPERATOR_RIGHT_PANEL_DEFAULT_WIDTH);
  const loadedRightPanelTabUserIdRef = useRef<string | null>(initialRightPanelStorageUserId);
  const savedThreadScrollTopRef = useRef<number | null>(null);
  const pendingRestoreThreadScrollTopRef = useRef<number | null>(null);
  const lastTerminalSnapshotSignatureRef = useRef<string | null>(null);
  const inflightPreviewIdsRef = useRef<Set<string>>(new Set());
  const lastPreviewObservationSignatureRef = useRef<Map<string, string>>(new Map());
  const latestPreviewRunIdByTerminalId = useMemo(
    () =>
      buildLatestPreviewRunIdByTerminalId({
        activeThreadStreamingRunId: props.activeThreadStreamingRunId,
        activeThreadRuntimeEvents: props.activeThreadRuntimeEvents,
        runtimeEventsByRunId: props.runtimeEventsByRunId,
      }),
    [props.activeThreadRuntimeEvents, props.activeThreadStreamingRunId, props.runtimeEventsByRunId],
  );
  const activePreviewCapableTerminals = useMemo(
    () =>
      activeWorkspaceTerminals.filter(
        (terminal) => isTerminalSnapshotStatusActive(terminal.status) && isPreviewCapableTerminal(terminal),
      ),
    [activeWorkspaceTerminals],
  );
  const visibleBackgroundWorkspaceTerminals = useMemo(
    () =>
      activeWorkspaceTerminals.filter(
        (terminal) => !isRuntimeOwnedTerminalRecord(terminal),
      ),
    [activeWorkspaceTerminals],
  );

  const {
    handleAttachmentFileInputChange: handleWorkspaceFileInputChange,
    handleAttachmentDrop: handleWorkspaceAttachmentDrop,
    handleAttachmentDragEnter: handleWorkspaceAttachmentDragEnter,
    handleAttachmentDragOver: handleWorkspaceAttachmentDragOver,
    handleAttachmentDragLeave: handleWorkspaceAttachmentDragLeave,
    handleAttachmentPaste: handleWorkspaceAttachmentPaste,
    isAttachmentDragOver: isWorkspaceAttachmentDragOver,
    removeAttachment: removeWorkspaceAttachment,
  } = useMessageAttachmentInputController<WorkspaceAttachmentView>({
    attachmentsRef: workspaceAttachmentsRef,
    setAttachments: setWorkspaceAttachments,
    setError: props.setWorkspaceError,
    ingestAttachmentsFromFileList: props.ingestWorkspaceAttachmentsFromFileList,
  });
  const showWorkspaceRightPanel = Boolean(props.showWorkspaceRightPanel && props.workspaceUserDataPanel);
  const isWorkspaceRightPanelVisible = Boolean(showWorkspaceRightPanel && props.workspaceRightPanelOpen);
  const showOperatorTabs = Boolean(props.operatorDataPanelSession);
  const rightPanelStorageUserId = useMemo(() => resolveAuthSubject(props.session), [props.session]);
  const workspaceRightPanelTabs = useMemo(
    () =>
      buildWorkspaceRightPanelTabs({
        showOperatorTabs,
        communityLabel: props.workspaceUserDataPanel?.activeCommunity?.name ?? "Build community",
      }),
    [props.workspaceUserDataPanel?.activeCommunity?.name, showOperatorTabs],
  );
  const activeRightPanelTab = resolveWorkspaceRightPanelTab(requestedRightPanelTab, workspaceRightPanelTabs);
  const handleWorkspaceRightPanelTabChange = useCallback(
    (tab: WorkspaceRightPanelTab) => {
      setRequestedRightPanelTab(tab);
      storeWorkspaceRightPanelTab(rightPanelStorageUserId, tab);
    },
    [rightPanelStorageUserId],
  );
  const operatorDataPanelStyle = {
    "--operator-right-panel-width": `${operatorRightPanelWidth}px`,
    "--operator-right-panel-gutter": `${OPERATOR_RIGHT_PANEL_GUTTER}px`,
  } as CSSProperties;
  const operatorData = useOperatorDashboardData({
    session: props.operatorDataPanelSession ?? null,
    enabled: isWorkspaceRightPanelVisible && showOperatorTabs,
    surface: "workspace_operator_data_panel",
  });

  useEffect(() => {
    props.onOperatorPanelLayoutChange?.({
      open: isWorkspaceRightPanelVisible,
      width: isWorkspaceRightPanelVisible ? operatorRightPanelWidth : 0,
      gutter: isWorkspaceRightPanelVisible ? OPERATOR_RIGHT_PANEL_GUTTER : 0,
    });
  }, [isWorkspaceRightPanelVisible, operatorRightPanelWidth, props.onOperatorPanelLayoutChange]);

  useEffect(() => {
    if (!rightPanelStorageUserId || loadedRightPanelTabUserIdRef.current === rightPanelStorageUserId) return;
    loadedRightPanelTabUserIdRef.current = rightPanelStorageUserId;
    setRequestedRightPanelTab(loadWorkspaceRightPanelTab(rightPanelStorageUserId));
  }, [rightPanelStorageUserId]);

  useEffect(() => {
    workspaceAttachmentsRef.current = workspaceAttachments;
  }, [workspaceAttachments]);

  useEffect(() => {
    props.onComposerDraftChange({ text: messageInput, attachments: workspaceAttachments });
  }, [messageInput, props.onComposerDraftChange, workspaceAttachments]);

  useLayoutEffect(() => {
    const el = workspaceAskInputRef.current;
    if (!el) return;
    el.style.height = "0px";
    const maxPx = 220;
    const next = Math.min(el.scrollHeight, maxPx);
    el.style.height = `${Math.max(next, 24)}px`;
  }, [messageInput]);

  const clearComposer = useCallback(() => {
    setMessageInput("");
    setWorkspaceAttachments([]);
    if (workspaceFileInputRef.current) {
      workspaceFileInputRef.current.value = "";
    }
  }, []);

  useEffect(() => {
    props.onRegisterComposerApi({
      focus: () => {
        workspaceAskInputRef.current?.focus();
      },
      clear: clearComposer,
      reset: () => {
        clearComposer();
        window.setTimeout(() => {
          workspaceAskInputRef.current?.focus();
        }, 0);
      },
      appendTranscript: (transcript: string) => {
        if (!transcript) return;
        setMessageInput((prev) => {
          const base = prev.trim();
          const next = transcript.trim();
          if (!base) return next;
          if (!next) return prev;
          return `${base} ${next}`.trim();
        });
      },
      pinToBottom: () => {
        workspacePinnedToBottomRef.current = true;
        setIsWorkspaceAtBottom(true);
      },
    });
    return () => {
      props.onRegisterComposerApi(null);
    };
  }, [clearComposer, props.onRegisterComposerApi]);

  useEffect(() => {
    activeProjectIdRef.current = props.activeProjectId;
    activeProjectInstanceRef.current += 1;
    setActiveWorkspaceTerminals([]);
    setPreviewStateByTerminalId({});
    setBusyWorkspaceTerminalIds([]);
    setIsStoppingAllWorkspaceTerminals(false);
  }, [props.activeProjectId]);

  useEffect(() => {
    resolveWorkspaceSessionRef.current = props.resolveWorkspaceSession;
  }, [props.resolveWorkspaceSession]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(min-width: 901px)");
    const applyViewport = (matches: boolean) => {
      setIsDesktopViewport(matches);
    };
    applyViewport(mediaQuery.matches);
    const listener = (event: MediaQueryListEvent) => applyViewport(event.matches);
    mediaQuery.addEventListener("change", listener);
    return () => {
      mediaQuery.removeEventListener("change", listener);
    };
  }, []);

  useEffect(() => {
    setPreviewStateByTerminalId((prev) => {
      const activeIds = new Set(
        activePreviewCapableTerminals.map((terminal) => terminal.id),
      );
      const next: Record<string, WorkspacePreviewLifecycleState> = {};
      for (const [terminalId, state] of Object.entries(prev)) {
        if (activeIds.has(terminalId)) next[terminalId] = state;
      }
      return arePreviewLifecycleStatesEqual(prev, next) ? prev : next;
    });
  }, [activePreviewCapableTerminals]);

  const isCurrentTerminalScope = useCallback(
    (projectId: string | null, projectInstance: number): boolean =>
      Boolean(projectId) &&
      activeProjectIdRef.current === projectId &&
      activeProjectInstanceRef.current === projectInstance,
    [],
  );

  const { handleWorkspaceScroll } = useWorkspaceAutoScroll({
    workspaceMessageListRef,
    workspaceMessageListContentRef,
    isLoadingThreadRef,
    workspacePinnedToBottomRef,
    setIsWorkspaceAtBottom,
    scrollBehavior: "auto",
  });

  useWebThreadMessagesLifecycle<unknown, any>({
    session: props.session,
    activeThreadId: props.activeThreadId,
    guestThreadId: props.guestThreadId,
    isLoadingThreadRef,
    workspacePinnedToBottomRef,
    setIsWorkspaceAtBottom,
    setLoadingThreadMessagesThreadId: props.setLoadingThreadMessagesThreadId,
    setThreadMessages: props.setThreadMessages,
    loadThreadMessages: props.loadThreadMessages,
  });

  useEffect(() => {
    if (!props.session || !props.activeProjectId) {
      return;
    }
    let cancelled = false;
    const projectId = props.activeProjectId;
    const projectInstance = activeProjectInstanceRef.current;
    const poll = async () => {
      if (cancelled) return;
      try {
        const session = await withTimeout(
          resolveWorkspaceSessionRef.current(),
          PREVIEW_RESOLUTION_TIMEOUT_MS,
          "Workspace session timed out.",
        );
        if (!session || !projectId || cancelled) return;
        const next = await withTimeout(
          listProjectWorkspaceTerminalSnapshot({
            session,
            projectId,
          }),
          PREVIEW_RESOLUTION_TIMEOUT_MS,
          "Workspace terminal sync timed out.",
        );
        if (!cancelled && isCurrentTerminalScope(projectId, projectInstance)) {
          applyTerminalSnapshotIfChanged(next, setActiveWorkspaceTerminals);
        }
      } catch (error) {
        console.warn("Failed to load active workspace terminals:", error);
        emitWorkspaceEvent({
          scope: "preview",
          name: "workspace_terminals_load",
          status: "failure",
          projectId,
          error: formatWorkspaceInstrumentationError(error),
        });
      }
    };
    void poll();
    const intervalId = window.setInterval(() => {
      void poll();
    }, props.isStreamingWorkspaceTurn || activeWorkspaceTerminals.some((terminal) => terminal.status === "starting") ? 1500 : 6000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    activeWorkspaceTerminals,
    isCurrentTerminalScope,
    props.activeProjectId,
    props.session,
    props.isStreamingWorkspaceTurn,
  ]);

  useEffect(() => {
    const signature = JSON.stringify({
      projectId: props.activeProjectId,
      terminals: activeWorkspaceTerminals.map((terminal) => ({
        id: terminal.id,
        status: terminal.status,
        previewPort: terminal.preview_port ?? null,
        runId: terminal.started_by_run_id ?? null,
      })),
    });
    if (signature === lastTerminalSnapshotSignatureRef.current) return;
    lastTerminalSnapshotSignatureRef.current = signature;
    emitWorkspaceEvent({
      scope: "preview",
      name: "workspace_terminals_snapshot",
      status: "success",
      projectId: props.activeProjectId,
      detail: {
        terminalCount: activeWorkspaceTerminals.length,
        previewCapableCount: activePreviewCapableTerminals.length,
      },
    });
  }, [activePreviewCapableTerminals.length, activeWorkspaceTerminals, props.activeProjectId]);

  const handleStopWorkspaceTerminal = async (terminalSessionId: string): Promise<void> => {
    const requestProjectId = props.activeProjectId;
    const requestProjectInstance = activeProjectInstanceRef.current;
    const targetTerminal =
      activeWorkspaceTerminals.find((candidate) => candidate.id === terminalSessionId) ?? null;
    const owningRunId = targetTerminal
      ? resolvePreviewOwningRunId(targetTerminal, latestPreviewRunIdByTerminalId)
      : null;
    const accessRunId = targetTerminal
      ? resolveTerminalAccessRunId(targetTerminal)
      : null;
    emitWorkspaceEvent({
      scope: "preview",
      name: "terminal_stop",
      status: "start",
      projectId: requestProjectId,
      runId: owningRunId,
      detail: {
        terminalSessionId,
      },
    });
    setBusyWorkspaceTerminalIds((prev) => (prev.includes(terminalSessionId) ? prev : [...prev, terminalSessionId]));
    try {
      const session = await withTimeout(
        resolveWorkspaceSessionRef.current(),
        PREVIEW_RESOLUTION_TIMEOUT_MS,
        "Workspace session timed out.",
      );
      if (!session || !requestProjectId) {
        props.showAppToastMessage("Authentication session not available.");
        return;
      }
      await withTimeout(
        stopProjectWorkspaceTerminal({
          session,
          terminalSessionId,
          runId: accessRunId,
        }),
        PREVIEW_RESOLUTION_TIMEOUT_MS,
        "Stopping terminal timed out.",
      );
      if (isCurrentTerminalScope(requestProjectId, requestProjectInstance)) {
        const next = await withTimeout(
          listProjectWorkspaceTerminalSnapshot({
            session,
            projectId: requestProjectId,
          }),
          PREVIEW_RESOLUTION_TIMEOUT_MS,
          "Workspace terminal sync timed out.",
        );
        if (isCurrentTerminalScope(requestProjectId, requestProjectInstance)) {
          applyTerminalSnapshotIfChanged(next, setActiveWorkspaceTerminals);
        }
      }
      emitWorkspaceEvent({
        scope: "preview",
        name: "terminal_stop",
        status: "success",
        projectId: requestProjectId,
        runId: owningRunId,
        detail: {
          terminalSessionId,
        },
      });
    } catch (error) {
      console.warn("Failed to stop workspace terminal:", error);
      props.showAppToastMessage("Failed to stop terminal.");
      emitWorkspaceEvent({
        scope: "preview",
        name: "terminal_stop",
        status: "failure",
        projectId: requestProjectId,
        runId: owningRunId,
        detail: {
          terminalSessionId,
        },
        error: formatWorkspaceInstrumentationError(error),
      });
    } finally {
      if (isCurrentTerminalScope(requestProjectId, requestProjectInstance)) {
        setBusyWorkspaceTerminalIds((prev) => prev.filter((value) => value !== terminalSessionId));
      }
    }
  };

  const handleStopAllWorkspaceTerminals = async (): Promise<void> => {
    const requestProjectId = props.activeProjectId;
    const requestProjectInstance = activeProjectInstanceRef.current;
    emitWorkspaceEvent({
      scope: "preview",
      name: "terminal_stop_all",
      status: "start",
      projectId: requestProjectId,
    });
    setIsStoppingAllWorkspaceTerminals(true);
    try {
      const session = await withTimeout(
        resolveWorkspaceSessionRef.current(),
        PREVIEW_RESOLUTION_TIMEOUT_MS,
        "Workspace session timed out.",
      );
      if (!session || !requestProjectId) {
        props.showAppToastMessage("Authentication session not available.");
        return;
      }
      await withTimeout(
        stopAllProjectWorkspaceTerminals({
          session,
          projectId: requestProjectId,
        }),
        PREVIEW_RESOLUTION_TIMEOUT_MS,
        "Stopping background terminals timed out.",
      );
      if (isCurrentTerminalScope(requestProjectId, requestProjectInstance)) {
        const next = await withTimeout(
          listProjectWorkspaceTerminalSnapshot({
            session,
            projectId: requestProjectId,
          }),
          PREVIEW_RESOLUTION_TIMEOUT_MS,
          "Workspace terminal sync timed out.",
        );
        if (isCurrentTerminalScope(requestProjectId, requestProjectInstance)) {
          applyTerminalSnapshotIfChanged(next, setActiveWorkspaceTerminals);
        }
      }
      emitWorkspaceEvent({
        scope: "preview",
        name: "terminal_stop_all",
        status: "success",
        projectId: requestProjectId,
      });
    } catch (error) {
      console.warn("Failed to stop all workspace terminals:", error);
      props.showAppToastMessage("Failed to stop background terminals.");
      emitWorkspaceEvent({
        scope: "preview",
        name: "terminal_stop_all",
        status: "failure",
        projectId: requestProjectId,
        error: formatWorkspaceInstrumentationError(error),
      });
    } finally {
      if (isCurrentTerminalScope(requestProjectId, requestProjectInstance)) {
        setIsStoppingAllWorkspaceTerminals(false);
        setBusyWorkspaceTerminalIds([]);
      }
    }
  };

  const handleEnsurePreview = useCallback(
    async (terminalSessionId: string, opts?: { force?: boolean }): Promise<DaytonaWorkspaceTerminalPreview | null> => {
      const terminal = activePreviewCapableTerminals.find((candidate) => candidate.id === terminalSessionId) ?? null;
      if (!terminal || !isPreviewCapableTerminal(terminal)) return null;
      const owningRunId = resolvePreviewOwningRunId(
        terminal,
        latestPreviewRunIdByTerminalId,
      );
      const accessRunId = resolveTerminalAccessRunId(terminal);
      const existing = previewStateByTerminalId[terminalSessionId] ?? null;
      if (!opts?.force && existing) {
        if (existing.phase === "resolving" || existing.phase === "loading" || existing.phase === "ready") {
          return existing.preview ?? null;
        }
      }
      if (inflightPreviewIdsRef.current.has(terminalSessionId)) return null;
      emitWorkspaceEvent({
        scope: "preview",
        name: "preview_attach",
        status: "start",
        projectId: props.activeProjectId,
        runId: owningRunId,
        detail: {
          terminalSessionId,
          force: opts?.force === true,
          status: terminal.status,
        },
      });
      inflightPreviewIdsRef.current.add(terminalSessionId);
      setPreviewStateByTerminalId((prev) => ({
        ...prev,
        [terminalSessionId]: {
          phase: "resolving",
          preview: opts?.force ? null : prev[terminalSessionId]?.preview ?? null,
          error: null,
        },
      }));
      try {
        const session = await withTimeout(
          resolveWorkspaceSessionRef.current(),
          PREVIEW_RESOLUTION_TIMEOUT_MS,
          "Preview connection timed out.",
        );
        if (!session) throw new Error("Authentication session not available.");
        const preview = await withTimeout(
          getProjectWorkspaceTerminalPreviewUrl({
            session,
            terminalSessionId,
            runId: accessRunId,
          }),
          PREVIEW_RESOLUTION_TIMEOUT_MS,
          "Preview connection timed out.",
        );
        if (!preview?.preview_url) {
          throw new Error("Preview is not ready yet.");
        }
        setPreviewStateByTerminalId((prev) => ({
          ...prev,
          [terminalSessionId]: {
            phase: "loading",
            preview,
            error: null,
          },
        }));
        emitWorkspaceEvent({
          scope: "preview",
          name: "preview_attach",
          status: "success",
          projectId: props.activeProjectId,
          runId: owningRunId,
          detail: {
            terminalSessionId,
            previewUrlPresent: Boolean(preview?.preview_url),
          },
        });
        return preview;
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim()
            ? error.message.trim()
            : "Failed to load preview.";
        const shouldRetry =
          message === "Preview is not ready yet." &&
          terminal &&
          isRetryablePreviewStatus(terminal.status);
        setPreviewStateByTerminalId((prev) => ({
          ...prev,
          [terminalSessionId]: {
            phase: shouldRetry ? "idle" : "error",
            preview: null,
            error: shouldRetry ? null : message,
          },
        }));
        emitWorkspaceEvent({
          scope: "preview",
          name: "preview_attach",
          status: shouldRetry ? "skip" : "failure",
          projectId: props.activeProjectId,
          runId: owningRunId,
          detail: {
            terminalSessionId,
            shouldRetry,
            status: terminal.status,
          },
          error: shouldRetry ? null : message,
        });
        return null;
      } finally {
        inflightPreviewIdsRef.current.delete(terminalSessionId);
      }
    },
    [
      activePreviewCapableTerminals,
      latestPreviewRunIdByTerminalId,
      previewStateByTerminalId,
      props.activeProjectId,
    ],
  );

  const recordPreviewObservation = useCallback(
    (params: {
      terminal: DaytonaWorkspaceTerminalRecord;
      previewStatus: DaytonaWorkspaceTerminalPreviewStatus;
      previewTransportStatus: Exclude<DaytonaWorkspaceTerminalRecord["preview_transport_status"], null>;
      previewInspectionStatus: Exclude<DaytonaWorkspaceTerminalRecord["preview_inspection_status"], null>;
      previewRenderStatus: Exclude<DaytonaWorkspaceTerminalRecord["preview_render_status"], null>;
      previewProbeSummary: string;
      browserObservationSummary?: string | null;
    }) => {
      const signature = [
        params.previewStatus,
        params.previewTransportStatus,
        params.previewInspectionStatus,
        params.previewRenderStatus,
        params.previewProbeSummary,
        params.browserObservationSummary ?? "",
      ].join("\n");
      const previous = lastPreviewObservationSignatureRef.current.get(params.terminal.id);
      if (previous === signature) return;
      lastPreviewObservationSignatureRef.current.set(params.terminal.id, signature);
      void (async () => {
        try {
          const session = await resolveWorkspaceSessionRef.current();
          if (!session) return;
          await recordProjectWorkspaceTerminalPreviewObservation({
            session,
            terminalSessionId: params.terminal.id,
            runId: resolveTerminalAccessRunId(params.terminal),
            previewStatus: params.previewStatus,
            previewTransportStatus: params.previewTransportStatus,
            previewInspectionStatus: params.previewInspectionStatus,
            previewRenderStatus: params.previewRenderStatus,
            previewProbeSummary: params.previewProbeSummary,
            browserObservationSummary: params.browserObservationSummary ?? null,
          });
        } catch (error) {
          lastPreviewObservationSignatureRef.current.delete(params.terminal.id);
          emitWorkspaceEvent({
            scope: "preview",
            name: "preview_observation",
            status: "failure",
            projectId: props.activeProjectId,
            runId: resolvePreviewOwningRunId(
              params.terminal,
              latestPreviewRunIdByTerminalId,
            ),
            detail: {
              terminalSessionId: params.terminal.id,
              previewStatus: params.previewStatus,
              previewTransportStatus: params.previewTransportStatus,
              previewInspectionStatus: params.previewInspectionStatus,
              previewRenderStatus: params.previewRenderStatus,
            },
            error: formatWorkspaceInstrumentationError(error),
          });
        }
      })();
    },
    [latestPreviewRunIdByTerminalId, props.activeProjectId],
  );

  const handlePreviewLifecyclePhaseChange = useCallback((params: {
    terminal: DaytonaWorkspaceTerminalRecord;
    phase: "loading" | "ready" | "error";
  }) => {
    setPreviewStateByTerminalId((prev) => {
      const current = prev[params.terminal.id] ?? {
        phase: "idle" as const,
        preview: null,
        error: null,
      };
      const next: WorkspacePreviewLifecycleState =
        params.phase === "error"
          ? {
              phase: "error",
              preview: current.preview,
              error: current.error ?? "Failed to load preview.",
            }
          : {
              phase: params.phase,
              preview: current.preview,
              error: null,
            };
      if (
        current.phase === next.phase &&
        current.error === next.error &&
        current.preview === next.preview
      ) {
        return prev;
      }
      return {
        ...prev,
        [params.terminal.id]: next,
      };
    });
    recordPreviewObservation({
      terminal: params.terminal,
      ...previewObservationForLifecyclePhase(params.phase),
    });
  }, [recordPreviewObservation]);

  const handlePreviewMetricsObservation = useCallback((params: {
    terminal: DaytonaWorkspaceTerminalRecord;
    metrics: WorkspacePreviewMetricsObservation;
  }) => {
    recordPreviewObservation({
      terminal: params.terminal,
      ...previewObservationForMetrics(params.metrics),
    });
  }, [recordPreviewObservation]);

  const expandedPreviewTerminal = useMemo(() => {
    if (!expandedPreviewTerminalId || !isDesktopViewport) return null;
    return (
      activePreviewCapableTerminals.find((terminal) => terminal.id === expandedPreviewTerminalId) ?? null
    );
  }, [activePreviewCapableTerminals, expandedPreviewTerminalId, isDesktopViewport]);

  const handleExpandPreview = useCallback(
    (terminalSessionId: string) => {
      if (!isDesktopViewport) return;
      savedThreadScrollTopRef.current = workspaceMessageListRef.current?.scrollTop ?? 0;
      setExpandedPreviewTerminalId(terminalSessionId);
    },
    [isDesktopViewport],
  );

  const handleCollapsePreview = useCallback(() => {
    pendingRestoreThreadScrollTopRef.current = savedThreadScrollTopRef.current;
    setExpandedPreviewTerminalId(null);
  }, []);

  useEffect(() => {
    if (!expandedPreviewTerminalId) return;
    if (!isDesktopViewport || !expandedPreviewTerminal) {
      pendingRestoreThreadScrollTopRef.current = savedThreadScrollTopRef.current;
      setExpandedPreviewTerminalId(null);
    }
  }, [expandedPreviewTerminal, expandedPreviewTerminalId, isDesktopViewport]);

  useLayoutEffect(() => {
    if (expandedPreviewTerminalId !== null) return;
    const nextScrollTop = pendingRestoreThreadScrollTopRef.current;
    if (nextScrollTop == null) return;
    const el = workspaceMessageListRef.current;
    if (!el) return;
    el.scrollTop = nextScrollTop;
    const atBottom = el.scrollHeight - el.clientHeight - el.scrollTop <= 24;
    workspacePinnedToBottomRef.current = atBottom;
    setIsWorkspaceAtBottom(atBottom);
    pendingRestoreThreadScrollTopRef.current = null;
  }, [expandedPreviewTerminalId]);

  const renderPreviewForRun = useCallback(
    (runId: string | null): ReactNode => {
      const normalizedRunId = String(runId ?? "").trim();
      if (!normalizedRunId) return null;
      const runTerminals = activeWorkspaceTerminals.filter(
        (terminal) =>
          isPreviewCapableTerminal(terminal) &&
          resolvePreviewOwningRunId(terminal, latestPreviewRunIdByTerminalId) === normalizedRunId,
      );
      if (runTerminals.length === 0) return null;
      return (
        <WebWorkspaceAppPreview
          terminals={runTerminals}
          previewStateByTerminalId={previewStateByTerminalId}
          busyTerminalIds={busyWorkspaceTerminalIds}
          mode="inline"
          allowExpand={isDesktopViewport}
          onEnsurePreview={handleEnsurePreview}
          onExpandPreview={handleExpandPreview}
          onPreviewLifecyclePhaseChange={handlePreviewLifecyclePhaseChange}
          onPreviewMetricsObservation={handlePreviewMetricsObservation}
          onStopTerminal={(terminalSessionId) => {
            void handleStopWorkspaceTerminal(terminalSessionId);
          }}
        />
      );
    },
    [
      handleExpandPreview,
      handleEnsurePreview,
      handlePreviewLifecyclePhaseChange,
      handlePreviewMetricsObservation,
      isDesktopViewport,
      activeWorkspaceTerminals,
      latestPreviewRunIdByTerminalId,
      previewStateByTerminalId,
    ],
  );

  const isDesktopExpandedPreview = isDesktopViewport && expandedPreviewTerminal !== null;

  const resizeOperatorRightPanelFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    setOperatorRightPanelWidth(clampOperatorRightPanelWidth(window.innerWidth - event.clientX));
  };

  const handleOperatorRightPanelResizePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeOperatorRightPanelFromPointer(event);
  };

  const handleOperatorRightPanelResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setOperatorRightPanelWidth((width) => clampOperatorRightPanelWidth(width + OPERATOR_RIGHT_PANEL_KEYBOARD_STEP));
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setOperatorRightPanelWidth((width) => clampOperatorRightPanelWidth(width - OPERATOR_RIGHT_PANEL_KEYBOARD_STEP));
    }
  };

  return (
    <>
      <div
        className={`workspace-body workspace-attachment-drop-surface${isDesktopExpandedPreview ? " preview-expanded" : ""}${isWorkspaceAttachmentDragOver ? " drag-over" : ""}${isWorkspaceRightPanelVisible ? " workspace-operator-data-open" : ""}`}
        style={operatorDataPanelStyle}
        onDrop={handleWorkspaceAttachmentDrop}
        onDragEnter={handleWorkspaceAttachmentDragEnter}
        onDragOver={handleWorkspaceAttachmentDragOver}
        onDragLeave={handleWorkspaceAttachmentDragLeave}
      >
        {isWorkspaceAttachmentDragOver ? (
          <div className="drop-overlay workspace-drop-overlay" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            <span>Drop files to attach</span>
          </div>
        ) : null}
        {props.inferenceToast ? <div className="memory-toast success-toast">{props.inferenceToast}</div> : null}
        {props.memoryToast ? <div className="memory-toast success-toast">{props.memoryToast}</div> : null}
        {isDesktopExpandedPreview ? (
          <div className="workspace-expanded-preview-shell">
            <WebWorkspaceAppPreview
              terminals={[expandedPreviewTerminal]}
              previewStateByTerminalId={previewStateByTerminalId}
              busyTerminalIds={busyWorkspaceTerminalIds}
              mode="expanded"
              expandedTerminalId={expandedPreviewTerminal.id}
              allowExpand={false}
              onEnsurePreview={handleEnsurePreview}
              onCollapsePreview={handleCollapsePreview}
              onPreviewLifecyclePhaseChange={handlePreviewLifecyclePhaseChange}
              onPreviewMetricsObservation={handlePreviewMetricsObservation}
              onStopTerminal={(terminalSessionId) => {
                void handleStopWorkspaceTerminal(terminalSessionId);
              }}
            />
          </div>
        ) : (
          <div
            className={`message-list${props.isEmptyWorkspaceThread ? " message-list-empty-thread" : ""}`}
            ref={workspaceMessageListRef}
            onScroll={handleWorkspaceScroll}
          >
            <div className="message-list-inner" ref={workspaceMessageListContentRef}>
              <WorkspaceTimelinePane
                isEmptyWorkspaceThread={props.isEmptyWorkspaceThread}
                showEmptyThreadLandingSkeleton={props.showEmptyThreadLandingSkeleton}
                isHydratingActiveWorkspaceThread={props.isHydratingActiveWorkspaceThread}
                emptyThreadClassName={props.emptyThreadClassName}
                emptyThreadAvatar={props.emptyThreadAvatar}
                emptyThreadTitle={props.emptyThreadTitle}
                emptyThreadSubtitle={props.emptyThreadSubtitle}
                emptyThreadSetupCard={props.emptyThreadSetupCard}
                landingActionButtons={props.landingActionButtons}
                hasSession={props.hasSession}
                hasAuthenticatedPresentation={props.hasAuthenticatedPresentation}
                isAuthRecoveringSignedIn={props.isAuthRecoveringSignedIn}
                isAccountGraphHydratingCritical={props.isAccountGraphHydratingCritical}
                isActiveWorkspaceThreadBusy={props.isActiveWorkspaceThreadBusy}
                isStreamingWorkspaceTurn={props.isStreamingWorkspaceTurn}
                workspaceAttachments={workspaceAttachments}
                messageInput={messageInput}
                setMessageInput={setMessageInput}
                workspaceAskInputRef={workspaceAskInputRef}
                workspaceFileInputRef={workspaceFileInputRef}
                authedWorkspaceComposerPlaceholder={props.authedWorkspaceComposerPlaceholder}
                guestWorkspaceComposerPlaceholder={props.guestWorkspaceComposerPlaceholder}
                activeModelLabel={props.activeModelLabel}
                modelToggles={props.modelToggles}
                workspaceVoiceUiState={props.workspaceVoiceUiState}
                workspaceVoiceTitle={props.workspaceVoiceTitle}
                onWorkspaceFileInputChange={handleWorkspaceFileInputChange}
                onWorkspaceAttachmentPaste={handleWorkspaceAttachmentPaste}
                onRemoveWorkspaceAttachment={removeWorkspaceAttachment}
                onSendMessage={() =>
                  props.onSendMessage({
                    text: messageInput,
                    attachments: workspaceAttachments,
                    clearComposer,
                  })
                }
                onSendLandingAction={(prompt) =>
                  props.onSendMessage({
                    text: prompt,
                    attachments: workspaceAttachments,
                    clearComposer,
                  })
                }
                onStopStreamingTurn={props.onStopStreamingTurn}
                onWorkspaceVoiceClick={props.onWorkspaceVoiceClick}
                guestSignupRail={props.guestSignupRail}
                session={props.session}
                threadErrorView={props.threadErrorView}
                onRequireThreadErrorSignIn={props.onRequireThreadErrorSignIn}
                onRetryLastThreadError={props.onRetryLastThreadError}
                threadMessageViews={props.threadMessageViews}
                streamingMessageView={props.streamingMessageView}
                copiedMessageId={props.copiedMessageId}
                handleCopyMessage={props.handleCopyMessage}
                openMessageContextModal={props.openMessageContextModal}
                renderMarkdown={props.renderMarkdown}
                copyTextToClipboard={props.copyTextToClipboard}
                renderPreviewForRun={renderPreviewForRun}
              />
            </div>
          </div>
        )}
        {!isDesktopExpandedPreview && !isWorkspaceAtBottom ? (
          <button
            className="scroll-to-bottom workspace"
            type="button"
            onClick={() => {
              const el = workspaceMessageListRef.current;
              if (!el) return;
              workspacePinnedToBottomRef.current = true;
              setIsWorkspaceAtBottom(true);
              el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            }}
            aria-label="Scroll to bottom"
            title="Scroll to bottom"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14" />
              <path d="M19 12l-7 7-7-7" />
            </svg>
          </button>
        ) : null}
      </div>
      {!props.isEmptyWorkspaceThread ? (
        <div
          className={`workspace-composer-shell workspace-attachment-drop-surface${isDesktopExpandedPreview ? " preview-expanded" : ""}${isWorkspaceAttachmentDragOver ? " drag-over" : ""}${isWorkspaceRightPanelVisible ? " workspace-operator-data-open" : ""}`}
          style={operatorDataPanelStyle}
          onDrop={handleWorkspaceAttachmentDrop}
          onDragEnter={handleWorkspaceAttachmentDragEnter}
          onDragOver={handleWorkspaceAttachmentDragOver}
          onDragLeave={handleWorkspaceAttachmentDragLeave}
        >
            <WorkspaceComposer
            hasSession={props.hasSession}
            hasAuthenticatedPresentation={props.hasAuthenticatedPresentation}
            isAuthRecoveringSignedIn={props.isAuthRecoveringSignedIn}
            isAccountGraphHydratingCritical={props.isAccountGraphHydratingCritical}
            isActiveWorkspaceThreadBusy={props.isActiveWorkspaceThreadBusy}
            isStreamingWorkspaceTurn={props.isStreamingWorkspaceTurn}
            messageInput={messageInput}
            setMessageInput={setMessageInput}
            workspaceAttachments={workspaceAttachments}
            workspaceAskInputRef={workspaceAskInputRef}
            workspaceFileInputRef={workspaceFileInputRef}
            workspaceComposerPlaceholder={
              props.hasAuthenticatedPresentation
                ? workspaceAttachments.length > 0
                  ? "Add a message or send files..."
                  : props.authedWorkspaceComposerPlaceholder
                : props.guestWorkspaceComposerPlaceholder
            }
            terminals={visibleBackgroundWorkspaceTerminals}
            busyTerminalIds={busyWorkspaceTerminalIds}
            isStoppingAllTerminals={isStoppingAllWorkspaceTerminals}
            guestSignupRail={props.guestSignupRail}
            activeModelLabel={props.activeModelLabel}
            modelToggles={props.modelToggles}
            workspaceVoiceUiState={props.workspaceVoiceUiState}
            workspaceVoiceTitle={props.workspaceVoiceTitle}
            onWorkspaceFileInputChange={handleWorkspaceFileInputChange}
            onWorkspaceAttachmentPaste={handleWorkspaceAttachmentPaste}
            onRemoveWorkspaceAttachment={removeWorkspaceAttachment}
            onSendMessage={() =>
              props.onSendMessage({
                text: messageInput,
                attachments: workspaceAttachments,
                clearComposer,
              })
            }
            onStopStreamingTurn={props.onStopStreamingTurn}
            onStopTerminal={(terminalSessionId) => {
              void handleStopWorkspaceTerminal(terminalSessionId);
            }}
            onStopAllTerminals={() => {
              void handleStopAllWorkspaceTerminals();
            }}
            onWorkspaceVoiceClick={props.onWorkspaceVoiceClick}
            showTerminalRail={!isDesktopExpandedPreview}
          />
        </div>
      ) : null}
      {showWorkspaceRightPanel && props.workspaceUserDataPanel ? (
        <aside
          id="workspace-operator-data-panel"
          className={`operator-data-panel workspace-operator-data-panel${isWorkspaceRightPanelVisible ? " open" : ""}`}
          style={operatorDataPanelStyle}
          aria-label={showOperatorTabs ? "Workspace and operator data" : "Workspace data"}
          aria-hidden={!isWorkspaceRightPanelVisible}
        >
          <WebOperatorDataPanel
            workspaceUserDataPanel={props.workspaceUserDataPanel}
            state={operatorData.state}
            topCommunities={operatorData.topCommunities}
            partnerPayoutCycleActions={operatorData.partnerPayoutCycleActions}
            isLoading={operatorData.isLoading}
            error={operatorData.error}
            insightTabs={workspaceRightPanelTabs}
            activeInsightTab={activeRightPanelTab}
            onActiveInsightTabChange={handleWorkspaceRightPanelTabChange}
            onResizePointerDown={handleOperatorRightPanelResizePointerDown}
            onResizePointerMove={(event) => {
              if (event.buttons === 1) resizeOperatorRightPanelFromPointer(event);
            }}
            onResizeDoubleClick={() => setOperatorRightPanelWidth(OPERATOR_RIGHT_PANEL_DEFAULT_WIDTH)}
            onResizeKeyDown={handleOperatorRightPanelResizeKeyDown}
          />
        </aside>
      ) : null}
    </>
  );
}
