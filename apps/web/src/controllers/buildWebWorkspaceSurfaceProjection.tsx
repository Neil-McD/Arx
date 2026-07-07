import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { AuthSession } from "../auth";
import type { ModelToggle } from "../../../../shared/modelCatalog";
import type { RuntimeEngine } from "../../../../shared/runtimeEngine";
import type { MessageContextModalPayload } from "../../../../shared/messageContextUi";
import type {
  WebWorkspaceHostProps,
  WorkspaceComposerDraft,
} from "../components/WebWorkspaceHost";
import type {
  ThreadStreamingRuntimeEvent,
  ThreadStreamingState,
} from "../../../../shared/webTurnRunnerCore";
import type {
  HistoryUsedItem,
  MemorySuggestion,
  MemoryUsedItem,
  PremiumUpgradeCta,
} from "../../../../shared/messageMetadataUi";
import type { CommunityEvidenceUsedV1 } from "../../../../shared/communityEvidence";
import type {
  WorkspaceStreamingMessageView,
  WorkspaceThreadErrorView,
  WorkspaceThreadMessageView,
} from "../components/webWorkspaceThreadViews";

type WorkspaceAttachmentView =
  Parameters<WebWorkspaceHostProps["ingestWorkspaceAttachmentsFromFileList"]>[1][number];
type LandingActionButton = WebWorkspaceHostProps["landingActionButtons"][number];
type ContextModalPayload = MessageContextModalPayload<MemoryUsedItem, HistoryUsedItem, MemorySuggestion>;

type ThreadMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content_json: unknown;
  engine_id: string | null;
  model_id: string | null;
  run_id: string | null;
};

type BuildWebWorkspaceSurfaceProjectionParams = {
  session: AuthSession | null;
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
  onRegisterComposerApi: WebWorkspaceHostProps["onRegisterComposerApi"];
  landingActionButtons: LandingActionButton[];
  authedWorkspaceComposerPlaceholder: string;
  guestWorkspaceComposerPlaceholder: string;
  setWorkspaceError: Dispatch<SetStateAction<string | null>>;
  ingestWorkspaceAttachmentsFromFileList: WebWorkspaceHostProps["ingestWorkspaceAttachmentsFromFileList"];
  setLoadingThreadMessagesThreadId: Dispatch<SetStateAction<string | null>>;
  setThreadMessages: Dispatch<SetStateAction<any[]>>;
  loadThreadMessages: WebWorkspaceHostProps["loadThreadMessages"];
  onSendMessage: WebWorkspaceHostProps["onSendMessage"];
  onStopStreamingTurn: () => void;
  resolveWorkspaceSession: () => Promise<unknown | null>;
  activeProjectId: string | null;
  showAppToastMessage: (message: string) => void;
  activeModelLabel: string;
  modelToggles: ModelToggle[];
  accountTier: string | null;
  activeRuntimeEngine: RuntimeEngine;
  onRuntimeEngineChange: (engine: RuntimeEngine) => void;
  workspaceVoiceUiState: "idle" | "recording" | "transcribing";
  workspaceVoiceTitle: string;
  onWorkspaceVoiceClick: () => void;
  activeThreadStreamingRunId: string | null;
  activeThreadStreamingState: ThreadStreamingState<MemoryUsedItem, HistoryUsedItem, CommunityEvidenceUsedV1> | null;
  runtimeEventsByRunId: Record<string, ThreadStreamingRuntimeEvent[]>;
  threadError: string | null;
  displayedThreadError: ReactNode;
  showGuestSignInAction: boolean;
  requireSignIn: () => void;
  canRetryLastThreadTurn: boolean;
  retryLastTurn: () => Promise<void> | void;
  threadMessages: ThreadMessage[];
  copiedMessageId: string | null;
  handleCopyMessage: (messageId: string, text: string) => Promise<void> | void;
  copyTextToClipboard: (text: string) => Promise<void> | void;
  parseMessageText: (contentJson: unknown) => string;
  parseMessageAttachments: (contentJson: unknown) => WorkspaceAttachmentView[];
  parseMessageMemoryUsed: (contentJson: unknown) => MemoryUsedItem[];
  parseMessageHistoryUsed: (contentJson: unknown) => HistoryUsedItem[];
  parseMessageMemorySuggestions: (contentJson: unknown) => MemorySuggestion[];
  parseMessageMemoryAdded: (contentJson: unknown) => MemoryUsedItem[];
  parsePremiumUpgradeCta: (contentJson: unknown) => PremiumUpgradeCta | null;
  extractCommunityEvidenceUsedV1: (contentJson: unknown) => CommunityEvidenceUsedV1 | null;
  buildMessageContextModalPayload: (payload: {
    memoryUsed: MemoryUsedItem[];
    historyUsed: HistoryUsedItem[];
    memorySuggestions: MemorySuggestion[];
    memoryAdded: MemoryUsedItem[];
    communityEvidence: CommunityEvidenceUsedV1 | null;
  }) => ContextModalPayload;
  hasContextPayload: (payload: ContextModalPayload | null) => boolean;
  openMessageContextModal: (
    payload: ContextModalPayload,
    setContextModal: Dispatch<SetStateAction<ContextModalPayload | null>>,
  ) => void;
  setContextModal: Dispatch<SetStateAction<ContextModalPayload | null>>;
  extractInferenceSourceFromMessageContent: (contentJson: unknown) => string | null;
  extractModelIdFromMessageContent: (contentJson: unknown) => string | null;
  extractRuntimeEngineIdFromMessageContent: (contentJson: unknown) => string | null;
  formatModelSignature: (
    modelId: string | null,
    inferenceSource: string | null,
    engineId: string | null,
    toggles: ModelToggle[],
  ) => string | null;
  renderMarkdown: (
    text: string,
    options: { onCopyCode: (text: string) => Promise<void> | void },
  ) => ReactNode;
  onOpenPremiumBilling: () => void;
};

export function buildWebWorkspaceSurfaceProjection(
  params: BuildWebWorkspaceSurfaceProjectionParams,
): { workspaceHostProps: WebWorkspaceHostProps } {
  const threadErrorView: WorkspaceThreadErrorView | null = params.threadError
      ? {
        displayedError: params.displayedThreadError,
        showSignInAction: params.showGuestSignInAction && !params.hasAuthenticatedPresentation,
        showRetryAction: params.canRetryLastThreadTurn,
      }
    : null;

  const threadMessageViews: WorkspaceThreadMessageView[] = params.threadMessages.flatMap(
    (message) => {
      if (message.role === "system") return [];

      const isUser = message.role === "user";
      const textContent = params.parseMessageText(message.content_json);
      const attachments = params.parseMessageAttachments(message.content_json).map(
        (attachment) => {
          const resolvedUrl =
            typeof attachment.url === "string" && attachment.url.trim()
              ? attachment.url.trim()
              : typeof attachment.data_url === "string" && attachment.data_url.startsWith("data:")
                ? attachment.data_url
                : null;
          const imageUrl =
            attachment.type === "image" &&
            typeof attachment.data_url === "string" &&
            attachment.data_url.startsWith("data:image/")
              ? attachment.data_url
              : attachment.type === "image" && resolvedUrl
                ? resolvedUrl
              : null;

          return {
            id: attachment.id,
            name: attachment.name,
            imageUrl,
            openUrl: resolvedUrl,
          };
        },
      );
      const memoryUsed = !isUser ? params.parseMessageMemoryUsed(message.content_json) : [];
      const historyUsed = !isUser
        ? params.parseMessageHistoryUsed(message.content_json)
        : [];
      const memorySuggestions = !isUser
        ? params.parseMessageMemorySuggestions(message.content_json)
        : [];
      const memoryAdded = !isUser ? params.parseMessageMemoryAdded(message.content_json) : [];
      const premiumUpgradeCta = !isUser
        ? params.parsePremiumUpgradeCta(message.content_json)
        : null;
      const communityEvidence = !isUser
        ? params.extractCommunityEvidenceUsedV1(message.content_json)
        : null;
      const contextPayload = !isUser
        ? params.buildMessageContextModalPayload({
            memoryUsed,
            historyUsed,
            memorySuggestions,
            memoryAdded,
            communityEvidence,
          })
        : null;
      const hasContext = params.hasContextPayload(contextPayload);
      const inferenceSource = !isUser
        ? params.extractInferenceSourceFromMessageContent(message.content_json)
        : null;
      const messageModelId = !isUser
        ? message.model_id ?? params.extractModelIdFromMessageContent(message.content_json)
        : null;
      const runtimeEvents =
        !isUser && typeof message.run_id === "string" && message.run_id.trim()
          ? message.run_id === params.activeThreadStreamingRunId &&
            Array.isArray(params.activeThreadStreamingState?.runtimeEvents) &&
            params.activeThreadStreamingState.runtimeEvents.length > 0
            ? params.activeThreadStreamingState.runtimeEvents
            : params.runtimeEventsByRunId[message.run_id] ?? []
          : [];
      const messageEngineId = !isUser
        ? (
            message.run_id === params.activeThreadStreamingRunId
              ? params.activeThreadStreamingState?.meta?.engine_id ?? null
              : null
          ) ||
          message.engine_id ||
          params.extractRuntimeEngineIdFromMessageContent(message.content_json)
        : null;
      const modelLabel = !isUser
        ? params.formatModelSignature(
            messageModelId,
            inferenceSource,
            messageEngineId,
            params.modelToggles,
          )
        : null;
      const requireLiveDesktop =
        !isUser &&
        typeof message.run_id === "string" &&
        message.run_id.trim().length > 0 &&
        message.run_id === params.activeThreadStreamingRunId;

      return [
        {
          id: message.id,
          role: message.role,
          textContent,
          attachments,
          runtimeEvents,
          runId: message.run_id ?? null,
          requireLiveDesktop,
          modelLabel,
          contextPayload: hasContext ? contextPayload : null,
          premiumUpgradeCta,
        },
      ];
    },
  );

  const runtimeEvents = params.activeThreadStreamingState?.runtimeEvents ?? [];
  const streamingContent = params.activeThreadStreamingState?.content ?? "";
  const hasStreamedContent = streamingContent.trim().length > 0;
  const hasTimeline = runtimeEvents.length > 0;
  const hasActiveRunId =
    typeof params.activeThreadStreamingRunId === "string" &&
    params.activeThreadStreamingRunId.trim().length > 0;
  const shouldRenderStreamingMessage =
    (params.isStreamingWorkspaceTurn ||
      hasStreamedContent ||
      hasTimeline ||
      hasActiveRunId) &&
    !(
      params.activeThreadStreamingRunId &&
      params.threadMessages.some(
        (message) =>
          message.run_id === params.activeThreadStreamingRunId &&
          message.role === "assistant",
      )
    );

  const streamingMessageView: WorkspaceStreamingMessageView | null =
    shouldRenderStreamingMessage
      ? {
          runtimeEvents,
          content: streamingContent,
          runId: params.activeThreadStreamingRunId ?? null,
        }
      : null;

  const workspaceHostProps: WebWorkspaceHostProps = {
    session: params.session,
    hasSession: Boolean(params.session),
    hasAuthenticatedPresentation: params.hasAuthenticatedPresentation,
    isAuthRecoveringSignedIn: params.isAuthRecoveringSignedIn,
    isAccountGraphHydratingCritical: params.isAccountGraphHydratingCritical,
    activeThreadId: params.activeThreadId,
    guestThreadId: params.guestThreadId,
    isEmptyWorkspaceThread: params.isEmptyWorkspaceThread,
    showEmptyThreadLandingSkeleton: params.showEmptyThreadLandingSkeleton,
    isHydratingActiveWorkspaceThread: params.isHydratingActiveWorkspaceThread,
    isActiveWorkspaceThreadBusy: params.isActiveWorkspaceThreadBusy,
    isStreamingWorkspaceTurn: params.isStreamingWorkspaceTurn,
    inferenceToast: params.inferenceToast,
    memoryToast: params.memoryToast,
    emptyThreadClassName: params.emptyThreadClassName,
    emptyThreadAvatar: params.emptyThreadAvatar,
    emptyThreadTitle: params.emptyThreadTitle,
    emptyThreadSubtitle: params.emptyThreadSubtitle,
    guestSignupRail: params.guestSignupRail,
    emptyThreadSetupCard: params.emptyThreadSetupCard,
    initialComposerDraft: params.initialComposerDraft,
    onComposerDraftChange: params.onComposerDraftChange,
    onRegisterComposerApi: params.onRegisterComposerApi,
    landingActionButtons: params.landingActionButtons,
    authedWorkspaceComposerPlaceholder: params.authedWorkspaceComposerPlaceholder,
    guestWorkspaceComposerPlaceholder: params.guestWorkspaceComposerPlaceholder,
    setWorkspaceError: params.setWorkspaceError,
    ingestWorkspaceAttachmentsFromFileList: params.ingestWorkspaceAttachmentsFromFileList,
    setLoadingThreadMessagesThreadId: params.setLoadingThreadMessagesThreadId,
    setThreadMessages: params.setThreadMessages,
    loadThreadMessages: params.loadThreadMessages,
    onSendMessage: params.onSendMessage,
    onStopStreamingTurn: params.onStopStreamingTurn,
    resolveWorkspaceSession: params.resolveWorkspaceSession,
    activeProjectId: params.activeProjectId,
    showAppToastMessage: params.showAppToastMessage,
    activeModelLabel: params.activeModelLabel,
    modelToggles: params.modelToggles,
    accountTier: params.accountTier,
    activeRuntimeEngine: params.activeRuntimeEngine,
    onRuntimeEngineChange: params.onRuntimeEngineChange,
    workspaceVoiceUiState: params.workspaceVoiceUiState,
    workspaceVoiceTitle: params.workspaceVoiceTitle,
    onWorkspaceVoiceClick: params.onWorkspaceVoiceClick,
    activeThreadStreamingRunId: params.activeThreadStreamingRunId,
    activeThreadRuntimeEvents: params.activeThreadStreamingState?.runtimeEvents ?? null,
    runtimeEventsByRunId: params.runtimeEventsByRunId,
    threadErrorView,
    onRequireThreadErrorSignIn: params.requireSignIn,
    onRetryLastThreadError: params.retryLastTurn,
    threadMessageViews,
    streamingMessageView,
    copiedMessageId: params.copiedMessageId,
    handleCopyMessage: params.handleCopyMessage,
    openMessageContextModal: (payload) =>
      params.openMessageContextModal(payload, params.setContextModal),
    renderMarkdown: params.renderMarkdown,
    copyTextToClipboard: params.copyTextToClipboard,
    onOpenPremiumBilling: params.onOpenPremiumBilling,
  };

  return { workspaceHostProps };
}
