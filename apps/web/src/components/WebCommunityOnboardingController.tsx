import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  advanceCommunityOnboardingPreviewSession,
  createCommunityOnboardingPreviewSession,
  shouldPresentCommunityOnboardingAgentReview,
  shouldPresentCommunityOnboardingAgentStep,
  shouldPresentCommunityOnboardingMcpHandoff,
  shouldPresentCommunityOnboardingOrientation,
  type CommunityOnboardingSession,
} from "../../../../shared/communityOnboarding";
import {
  acknowledgeCloudCommunityOnboardingAgentTurn,
  completeCloudCommunityOnboardingMcpHandoff,
  completeCloudCommunityOnboardingOrientation,
  dismissCloudCommunityOnboardingSession,
  fetchCloudCommunityOnboardingConfig,
  subscribeCloudCommunityOnboardingSession,
} from "../../../../shared/cloudCommunityOnboardingGateway";
import {
  createCloudCommunityChatLiveClient,
  type CloudCommunityChatLiveClient,
} from "../../../../shared/cloudCommunityChatGateway";
import { WebCommunityOnboardingOrientationModal } from "./WebCommunityOnboardingOrientationModal";
import { WebCommunityOnboardingAgentGuide } from "./WebCommunityOnboardingAgentGuide";
import { WebCommunityOnboardingMcpGuide } from "./WebCommunityOnboardingMcpGuide";
import { WebCommunityOnboardingPreviewBar } from "./WebCommunityOnboardingPreviewBar";

type PendingAction = "continue" | "dismiss" | "agent_review" | "mcp_handoff" | null;

type WebCommunityOnboardingContextValue = {
  mode: "live" | "preview";
  activeSession: CommunityOnboardingSession | null;
  firstPostAcknowledgementPending: boolean;
  pendingAction: PendingAction;
  error: string | null;
  completeOrientation: () => void;
  completeFirstPostPreview: () => void;
  completeAgentTurnPreview: () => void;
  acknowledgeAgentTurn: () => Promise<boolean>;
  continueAfterFirstPost: () => void;
  completeMcpHandoff: () => Promise<boolean>;
  dismiss: () => void;
};

const WebCommunityOnboardingContext = createContext<WebCommunityOnboardingContextValue | null>(null);

export function useWebCommunityOnboarding(): WebCommunityOnboardingContextValue | null {
  return useContext(WebCommunityOnboardingContext);
}

export function WebCommunityOnboardingController(props: {
  children: ReactNode;
  session: unknown | null;
  ensureSession?: (session: any) => Promise<any | null>;
  communityId: string | null;
  communityName: string | null;
  communityOneLiner?: string | null;
  communityAvatarUrl?: string | null;
  communityAvatarFocusX?: number | null;
  communityAvatarFocusY?: number | null;
  communityAvatarZoom?: number | null;
  isEnabled: boolean;
  previewMode?: boolean;
  canPreview?: boolean;
  onExitPreview?: () => void;
  onOrientationCompleted?: () => void;
}) {
  const isPreviewMode = Boolean(props.previewMode);
  const [activeSession, setActiveSession] = useState<CommunityOnboardingSession | null>(null);
  const [previewSession, setPreviewSession] = useState<CommunityOnboardingSession | null>(null);
  const [previewConfiguredEnabled, setPreviewConfiguredEnabled] = useState<boolean | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [usableSession, setUsableSession] = useState<unknown | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [firstPostAcknowledgementSessionId, setFirstPostAcknowledgementSessionId] = useState<string | null>(null);
  const previousPresentedSessionRef = useRef<Pick<CommunityOnboardingSession, "id" | "phase"> | null>(null);
  // Auth refresh replaces session objects. Keep the latest credentials without
  // treating that object churn as a new preview entry.
  const previewAuthSessionRef = useRef(props.session);
  const previewEnsureSessionRef = useRef(props.ensureSession);
  previewAuthSessionRef.current = props.session;
  previewEnsureSessionRef.current = props.ensureSession;

  const previewCommunityId = props.communityId;
  const canPreview = Boolean(props.canPreview);
  const hasPreviewAuthSession = Boolean(props.session);
  const previewSessionPrincipalId = String(
    (props.session as { user?: { id?: unknown } } | null)?.user?.id ?? "",
  ).trim();
  useEffect(() => {
    setActiveSession(null);
    setUsableSession(null);
    setPendingAction(null);
    setError(null);
    if (isPreviewMode || !props.isEnabled || !props.session || !props.communityId) return;

    let cancelled = false;
    let liveClient: CloudCommunityChatLiveClient | null = null;
    let unsubscribe: (() => void) | null = null;
    void (async () => {
      try {
        const nextUsableSession = props.ensureSession
          ? await props.ensureSession(props.session)
          : props.session;
        if (!nextUsableSession || cancelled) return;
        liveClient = createCloudCommunityChatLiveClient({
          session: nextUsableSession,
          ensureSession: props.ensureSession,
        });
        setUsableSession(nextUsableSession);
        unsubscribe = subscribeCloudCommunityOnboardingSession({
          liveClient,
          communityId: props.communityId!,
          onUpdate: (next) => {
            if (!cancelled) setActiveSession(next);
          },
          onError: (subscriptionError) => {
            if (!cancelled) {
              console.warn("community_onboarding_subscription_failed", subscriptionError);
            }
          },
        });
      } catch (subscriptionError) {
        if (!cancelled) {
          console.warn("community_onboarding_subscription_failed", subscriptionError);
          setActiveSession(null);
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
      liveClient?.close();
    };
  }, [isPreviewMode, props.communityId, props.ensureSession, props.isEnabled, props.session]);

  useEffect(() => {
    setPreviewSession(null);
    setPreviewConfiguredEnabled(null);
    setPreviewError(null);
    setIsPreviewLoading(false);
    if (!isPreviewMode) return;
    if (!canPreview) {
      setPreviewError("Preview is available to community owners and admins.");
      return;
    }
    if (!hasPreviewAuthSession || !previewCommunityId) {
      setPreviewError("The saved onboarding workflow is unavailable.");
      return;
    }

    let cancelled = false;
    setIsPreviewLoading(true);
    void (async () => {
      try {
        const authSession = previewAuthSessionRef.current;
        const ensureSession = previewEnsureSessionRef.current;
        if (!authSession) return;
        const nextUsableSession = ensureSession
          ? await ensureSession(authSession)
          : authSession;
        if (!nextUsableSession || cancelled) return;
        setUsableSession(nextUsableSession);
        const config = await fetchCloudCommunityOnboardingConfig({
          session: nextUsableSession,
          communityId: previewCommunityId,
        });
        if (cancelled) return;
        setPreviewConfiguredEnabled(config.enabled);
        setPreviewSession(createCommunityOnboardingPreviewSession({
          communityId: previewCommunityId,
          config,
          nowIso: new Date().toISOString(),
          previewId: crypto.randomUUID(),
        }));
      } catch (loadError) {
        if (cancelled) return;
        console.warn("community_onboarding_preview_load_failed", loadError);
        setPreviewError("The saved onboarding workflow could not be loaded.");
      } finally {
        if (!cancelled) setIsPreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    canPreview,
    hasPreviewAuthSession,
    isPreviewMode,
    previewCommunityId,
    previewSessionPrincipalId,
  ]);

  const handlePreviewAdvance = useCallback(() => {
    if (!isPreviewMode || !previewSession) return;
    if (previewSession.phase === "complete") return;
    const previousPhase = previewSession.phase;
    setPreviewSession(advanceCommunityOnboardingPreviewSession(
      previewSession,
      new Date().toISOString(),
    ));
    if (previousPhase === "orientation") props.onOrientationCompleted?.();
  }, [isPreviewMode, previewSession, props.onOrientationCompleted]);

  const handleContinue = useCallback(() => {
    if (isPreviewMode) {
      handlePreviewAdvance();
      return;
    }
    if (!activeSession || !usableSession || !props.communityId || pendingAction) return;
    const sessionId = activeSession.id;
    setPendingAction("continue");
    setError(null);
    void completeCloudCommunityOnboardingOrientation({
      session: usableSession,
      communityId: props.communityId,
      sessionId,
    }).then((next) => {
      setActiveSession((current) => current?.id === sessionId ? next : current);
      if (next?.phase === "first_community_post") props.onOrientationCompleted?.();
    }).catch(() => {
      setError("We couldn’t save your progress. Please try again.");
    }).finally(() => {
      setPendingAction(null);
    });
  }, [
    activeSession,
    handlePreviewAdvance,
    isPreviewMode,
    pendingAction,
    props.communityId,
    props.onOrientationCompleted,
    usableSession,
  ]);

  const handleDismiss = useCallback(() => {
    if (isPreviewMode) {
      props.onExitPreview?.();
      return;
    }
    if (!activeSession || !usableSession || !props.communityId || pendingAction) return;
    const sessionId = activeSession.id;
    setPendingAction("dismiss");
    setError(null);
    void dismissCloudCommunityOnboardingSession({
      session: usableSession,
      communityId: props.communityId,
      sessionId,
    }).then(() => {
      setActiveSession((current) => current?.id === sessionId ? null : current);
    }).catch(() => {
      setError("We couldn’t dismiss onboarding. Please try again.");
    }).finally(() => {
      setPendingAction(null);
    });
  }, [
    activeSession,
    isPreviewMode,
    pendingAction,
    props.communityId,
    props.onExitPreview,
    usableSession,
  ]);

  const presentedSession = isPreviewMode ? previewSession : activeSession;
  const presentedError = isPreviewMode ? previewError : error;
  const presentedPendingAction = isPreviewMode ? null : pendingAction;
  const previousPresentedSession = previousPresentedSessionRef.current;
  const detectedLiveFirstPostCompletion = Boolean(
    !isPreviewMode &&
    presentedSession &&
    previousPresentedSession?.id === presentedSession.id &&
    previousPresentedSession.phase === "first_community_post" &&
    presentedSession.phase === "first_agent_dock_turn",
  );
  const firstPostAcknowledgementPending = Boolean(
    presentedSession &&
    (
      firstPostAcknowledgementSessionId === presentedSession.id ||
      detectedLiveFirstPostCompletion
    ),
  );

  useEffect(() => {
    if (detectedLiveFirstPostCompletion && presentedSession) {
      setFirstPostAcknowledgementSessionId(presentedSession.id);
    }
    previousPresentedSessionRef.current = presentedSession
      ? { id: presentedSession.id, phase: presentedSession.phase }
      : null;
  }, [detectedLiveFirstPostCompletion, presentedSession?.id, presentedSession?.phase]);

  useEffect(() => {
    setFirstPostAcknowledgementSessionId(null);
    previousPresentedSessionRef.current = null;
  }, [isPreviewMode, props.communityId]);

  const handleCompleteFirstPostPreview = useCallback(() => {
    if (
      !isPreviewMode ||
      !previewSession ||
      previewSession.phase !== "first_community_post"
    ) {
      return;
    }
    setFirstPostAcknowledgementSessionId(previewSession.id);
  }, [isPreviewMode, previewSession]);

  const handleCompleteAgentTurnPreview = useCallback(() => {
    if (
      !isPreviewMode ||
      !previewSession ||
      previewSession.phase !== "first_agent_dock_turn"
    ) {
      return;
    }
    handlePreviewAdvance();
  }, [handlePreviewAdvance, isPreviewMode, previewSession]);

  const handleContinueAfterFirstPost = useCallback(() => {
    if (!presentedSession || !firstPostAcknowledgementPending) return;
    setFirstPostAcknowledgementSessionId(null);
    if (isPreviewMode) handlePreviewAdvance();
  }, [firstPostAcknowledgementPending, handlePreviewAdvance, isPreviewMode, presentedSession]);

  const handleAcknowledgeAgentTurn = useCallback(async (): Promise<boolean> => {
    if (isPreviewMode) {
      if (!previewSession || previewSession.phase !== "agent_turn_review") return false;
      handlePreviewAdvance();
      return true;
    }
    if (
      !activeSession ||
      activeSession.phase !== "agent_turn_review" ||
      !usableSession ||
      !props.communityId ||
      pendingAction
    ) {
      return false;
    }
    const sessionId = activeSession.id;
    setPendingAction("agent_review");
    setError(null);
    try {
      const next = await acknowledgeCloudCommunityOnboardingAgentTurn({
        session: usableSession,
        communityId: props.communityId,
        sessionId,
      });
      setActiveSession((current) => current?.id === sessionId ? next : current);
      return next?.phase === "mcp_handoff";
    } catch {
      setError("We couldn’t save your progress. Please try again.");
      return false;
    } finally {
      setPendingAction(null);
    }
  }, [
    activeSession,
    handlePreviewAdvance,
    isPreviewMode,
    pendingAction,
    previewSession,
    props.communityId,
    usableSession,
  ]);

  const handleCompleteMcpHandoff = useCallback(async (): Promise<boolean> => {
    if (isPreviewMode) {
      if (!previewSession || previewSession.phase !== "mcp_handoff") return false;
      handlePreviewAdvance();
      return true;
    }
    if (
      !activeSession ||
      activeSession.phase !== "mcp_handoff" ||
      !usableSession ||
      !props.communityId ||
      pendingAction
    ) {
      return false;
    }
    const sessionId = activeSession.id;
    setPendingAction("mcp_handoff");
    setError(null);
    try {
      const next = await completeCloudCommunityOnboardingMcpHandoff({
        session: usableSession,
        communityId: props.communityId,
        sessionId,
      });
      setActiveSession((current) => current?.id === sessionId ? next : current);
      return next?.status === "completed";
    } catch {
      setError("We couldn’t save your progress. Please try again.");
      return false;
    } finally {
      setPendingAction(null);
    }
  }, [
    activeSession,
    handlePreviewAdvance,
    isPreviewMode,
    pendingAction,
    previewSession,
    props.communityId,
    usableSession,
  ]);

  const contextValue = useMemo<WebCommunityOnboardingContextValue>(() => ({
    mode: isPreviewMode ? "preview" : "live",
    activeSession:
      presentedSession?.community_id === props.communityId ? presentedSession : null,
    firstPostAcknowledgementPending,
    pendingAction: presentedPendingAction,
    error: presentedError,
    completeOrientation: handleContinue,
    completeFirstPostPreview: handleCompleteFirstPostPreview,
    completeAgentTurnPreview: handleCompleteAgentTurnPreview,
    acknowledgeAgentTurn: handleAcknowledgeAgentTurn,
    continueAfterFirstPost: handleContinueAfterFirstPost,
    completeMcpHandoff: handleCompleteMcpHandoff,
    dismiss: handleDismiss,
  }), [
    firstPostAcknowledgementPending,
    handleCompleteFirstPostPreview,
    handleCompleteAgentTurnPreview,
    handleAcknowledgeAgentTurn,
    handleCompleteMcpHandoff,
    handleContinue,
    handleContinueAfterFirstPost,
    handleDismiss,
    isPreviewMode,
    presentedError,
    presentedPendingAction,
    presentedSession,
    props.communityId,
  ]);

  return (
    <WebCommunityOnboardingContext.Provider value={contextValue}>
      {props.children}
      {contextValue.activeSession &&
      props.communityName &&
      shouldPresentCommunityOnboardingOrientation(contextValue.activeSession) ? (
        <WebCommunityOnboardingOrientationModal
          communityName={props.communityName}
          communityOneLiner={props.communityOneLiner}
          communityAvatarUrl={props.communityAvatarUrl}
          communityAvatarFocusX={props.communityAvatarFocusX}
          communityAvatarFocusY={props.communityAvatarFocusY}
          communityAvatarZoom={props.communityAvatarZoom}
          session={contextValue.activeSession}
          isPreparing={isPreviewLoading}
          isPending={contextValue.pendingAction !== null}
          error={contextValue.error}
          onContinue={contextValue.completeOrientation}
          onDismiss={contextValue.dismiss}
        />
      ) : null}
      {contextValue.activeSession &&
      props.communityName &&
      !contextValue.firstPostAcknowledgementPending &&
      (
        shouldPresentCommunityOnboardingAgentStep(contextValue.activeSession) ||
        shouldPresentCommunityOnboardingAgentReview(contextValue.activeSession)
      ) ? (
        <WebCommunityOnboardingAgentGuide
          communityName={props.communityName}
          communityAvatarUrl={props.communityAvatarUrl}
          communityAvatarFocusX={props.communityAvatarFocusX}
          communityAvatarFocusY={props.communityAvatarFocusY}
          communityAvatarZoom={props.communityAvatarZoom}
          descriptionId="community-onboarding-agent-description"
          isComplete={shouldPresentCommunityOnboardingAgentReview(contextValue.activeSession)}
          isPending={contextValue.pendingAction !== null}
          error={contextValue.error}
          onContinue={() => void contextValue.acknowledgeAgentTurn()}
          onDismiss={contextValue.dismiss}
        />
      ) : null}
      {contextValue.activeSession &&
      props.communityName &&
      shouldPresentCommunityOnboardingMcpHandoff(contextValue.activeSession) ? (
        <WebCommunityOnboardingMcpGuide
          communityName={props.communityName}
          communityAvatarUrl={props.communityAvatarUrl}
          communityAvatarFocusX={props.communityAvatarFocusX}
          communityAvatarFocusY={props.communityAvatarFocusY}
          communityAvatarZoom={props.communityAvatarZoom}
          isPending={contextValue.pendingAction !== null}
          error={contextValue.error}
          onComplete={contextValue.completeMcpHandoff}
          onDismiss={contextValue.dismiss}
        />
      ) : null}
      {isPreviewMode ? (
        <WebCommunityOnboardingPreviewBar
          session={contextValue.activeSession}
          configuredEnabled={previewConfiguredEnabled}
          isLoading={isPreviewLoading}
          error={previewError}
          onExit={() => props.onExitPreview?.()}
        />
      ) : null}
    </WebCommunityOnboardingContext.Provider>
  );
}
