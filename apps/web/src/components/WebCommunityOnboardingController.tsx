import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  advanceCommunityOnboardingPreviewSession,
  buildCommunityOnboardingOrientationSeed,
  createCommunityOnboardingPreviewSession,
  shouldPresentCommunityOnboardingOrientation,
  type CommunityOnboardingSession,
} from "../../../../shared/communityOnboarding";
import {
  completeCloudCommunityOnboardingOrientation,
  dismissCloudCommunityOnboardingSession,
  fetchCloudCommunityOnboardingConfig,
  openCloudCommunityOnboardingSession,
  subscribeCloudCommunityOnboardingSession,
} from "../../../../shared/cloudCommunityOnboardingGateway";
import {
  createCloudCommunityChatLiveClient,
  type CloudCommunityChatLiveClient,
} from "../../../../shared/cloudCommunityChatGateway";
import {
  sendCloudCommunityAgentDockMessage,
  subscribeCloudCommunityAgentDockTranscript,
  subscribeCloudCommunityAgentDockTurn,
  type CommunityAgentDockTranscript,
  type CommunityAgentDockTurn,
} from "../../../../shared/cloudCommunityInteractionsGateway";
import { WebCommunityOnboardingOrientationModal } from "./WebCommunityOnboardingOrientationModal";
import { WebCommunityOnboardingPreviewBar } from "./WebCommunityOnboardingPreviewBar";

type PendingAction = "continue" | "dismiss" | null;

type WebCommunityOnboardingContextValue = {
  mode: "live" | "preview";
  activeSession: CommunityOnboardingSession | null;
  pendingAction: PendingAction;
  error: string | null;
  completeOrientation: () => void;
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
  const [conciergeTranscript, setConciergeTranscript] = useState<CommunityAgentDockTranscript>({
    root_id: null,
    messages: [],
  });
  const [conciergeTurn, setConciergeTurn] = useState<CommunityAgentDockTurn>({
    request: null,
    events: [],
  });
  const [conciergeInput, setConciergeInput] = useState("");
  const [isSendingConciergeMessage, setIsSendingConciergeMessage] = useState(false);
  const [conciergeError, setConciergeError] = useState<string | null>(null);
  const openedSessionIdsRef = useRef(new Set<string>());
  const openAttemptsRef = useRef(new Map<string, number>());
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
  const orientationSession = isPreviewMode ? previewSession : activeSession;

  useEffect(() => {
    setActiveSession(null);
    setUsableSession(null);
    setPendingAction(null);
    setError(null);
    openAttemptsRef.current.clear();
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

  useEffect(() => {
    if (
      isPreviewMode ||
      !activeSession ||
      activeSession.community_id !== props.communityId ||
      (activeSession.opened_at && activeSession.orientation_seed_reply_id) ||
      !usableSession ||
      !props.communityId ||
      openedSessionIdsRef.current.has(activeSession.id)
    ) {
      return;
    }
    openedSessionIdsRef.current.add(activeSession.id);
    const attempt = (openAttemptsRef.current.get(activeSession.id) ?? 0) + 1;
    openAttemptsRef.current.set(activeSession.id, attempt);
    let cancelled = false;
    let retryTimer: number | null = null;
    void openCloudCommunityOnboardingSession({
      session: usableSession,
      communityId: props.communityId,
      sessionId: activeSession.id,
    }).then((next) => {
      if (!cancelled && next) {
        openAttemptsRef.current.delete(activeSession.id);
        setError(null);
        setActiveSession((current) => current?.id === next.id ? next : current);
      }
    }).catch((openError) => {
      console.warn("community_onboarding_open_marker_failed", openError);
      openedSessionIdsRef.current.delete(activeSession.id);
      setError("We couldn’t open your orientation. Please try again.");
      if (!cancelled && attempt < 3) {
        retryTimer = window.setTimeout(() => {
          setActiveSession((current) => current?.id === activeSession.id ? { ...current } : current);
        }, 1_500);
      }
    });
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [activeSession, isPreviewMode, props.communityId, usableSession]);

  useEffect(() => {
    setConciergeTranscript({ root_id: null, messages: [] });
    setConciergeTurn({ request: null, events: [] });
    setConciergeInput("");
    setConciergeError(null);
    if (
      !orientationSession ||
      !shouldPresentCommunityOnboardingOrientation(orientationSession) ||
      !usableSession ||
      !props.communityId
    ) {
      return;
    }
    const liveClient = createCloudCommunityChatLiveClient({
      session: usableSession,
      ensureSession: props.ensureSession,
    });
    const unsubscribeTranscript = subscribeCloudCommunityAgentDockTranscript({
      liveClient,
      communityId: props.communityId,
      onUpdate: setConciergeTranscript,
      onError: (subscriptionError) => {
        console.warn("community_onboarding_concierge_transcript_failed", subscriptionError);
      },
    });
    const unsubscribeTurn = subscribeCloudCommunityAgentDockTurn({
      liveClient,
      communityId: props.communityId,
      onUpdate: setConciergeTurn,
      onError: (subscriptionError) => {
        console.warn("community_onboarding_concierge_turn_failed", subscriptionError);
      },
    });
    return () => {
      unsubscribeTranscript();
      unsubscribeTurn();
      liveClient.close();
    };
  }, [orientationSession?.id, props.communityId, props.ensureSession, usableSession]);

  const conciergeMessages = useMemo(() => {
    if (!orientationSession || !props.communityName) return [];
    const activatedAtMs = Date.parse(orientationSession.activated_at);
    const transcriptMessages = conciergeTranscript.messages
      .filter((message) => {
        const createdAtMs = Date.parse(message.created_at);
        return !Number.isFinite(activatedAtMs) || createdAtMs >= activatedAtMs;
      })
      .map((message) => ({
        id: message.id,
        role: message.actor_type === "human" ? "user" as const : "assistant" as const,
        text: message.text,
      }));
    const seed = {
      id: orientationSession.orientation_seed_reply_id ?? `${orientationSession.id}:concierge-welcome`,
      role: "assistant" as const,
      text: buildCommunityOnboardingOrientationSeed({
        communityName: props.communityName,
        welcomeMessage: orientationSession.welcome_message,
        conciergeDisplayName: orientationSession.concierge_display_name,
        hasIntroVideo: Boolean(orientationSession.intro_video_url),
      }),
    };
    if (isPreviewMode) return [seed, ...transcriptMessages];
    return transcriptMessages.length > 0 ? transcriptMessages : [seed];
  }, [conciergeTranscript.messages, isPreviewMode, orientationSession, props.communityName]);

  const activeConciergeTurn = useMemo(() => {
    if (!orientationSession || !conciergeTurn.request) {
      return { request: null, events: [] } satisfies CommunityAgentDockTurn;
    }
    const activatedAtMs = Date.parse(orientationSession.activated_at);
    const requestCreatedAtMs = Date.parse(conciergeTurn.request.created_at);
    if (
      Number.isFinite(activatedAtMs) &&
      Number.isFinite(requestCreatedAtMs) &&
      requestCreatedAtMs < activatedAtMs
    ) {
      return { request: null, events: [] } satisfies CommunityAgentDockTurn;
    }
    return conciergeTurn;
  }, [conciergeTurn, orientationSession]);
  const conciergeIsWorking =
    isSendingConciergeMessage ||
    activeConciergeTurn.request?.status === "queued" ||
    activeConciergeTurn.request?.status === "running";
  const conciergeStreamedText = conciergeIsWorking
    ? activeConciergeTurn.events
        .filter((event) => event.kind === "assistant")
        .map((event) => event.content)
        .join("")
        .trim()
    : "";
  const conciergePublicError = activeConciergeTurn.request?.public_issue?.message ?? null;

  const handleConciergeSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = conciergeInput.trim();
    if (!text || !usableSession || !props.communityId || conciergeIsWorking) return;
    setIsSendingConciergeMessage(true);
    setConciergeError(null);
    setConciergeInput("");
    void sendCloudCommunityAgentDockMessage({
      session: usableSession,
      communityId: props.communityId,
      idempotencyKey: crypto.randomUUID(),
      text,
      onboardingPreview: isPreviewMode,
    }).catch((sendError) => {
      console.warn("community_onboarding_concierge_send_failed", sendError);
      setConciergeInput(text);
      setConciergeError("The community Concierge could not receive your message. Try again.");
    }).finally(() => {
      setIsSendingConciergeMessage(false);
    });
  }, [conciergeInput, conciergeIsWorking, isPreviewMode, props.communityId, usableSession]);

  const handlePreviewAdvance = useCallback(() => {
    if (!isPreviewMode || !previewSession) return;
    if (previewSession.phase === "first_agent_dock_turn" || previewSession.phase === "complete") {
      props.onExitPreview?.();
      return;
    }
    const previousPhase = previewSession.phase;
    setPreviewSession(advanceCommunityOnboardingPreviewSession(
      previewSession,
      new Date().toISOString(),
    ));
    if (previousPhase === "orientation") props.onOrientationCompleted?.();
  }, [isPreviewMode, previewSession, props.onExitPreview, props.onOrientationCompleted]);

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

  const contextValue = useMemo<WebCommunityOnboardingContextValue>(() => ({
    mode: isPreviewMode ? "preview" : "live",
    activeSession:
      presentedSession?.community_id === props.communityId ? presentedSession : null,
    pendingAction: presentedPendingAction,
    error: presentedError,
    completeOrientation: handleContinue,
    dismiss: handleDismiss,
  }), [
    handleContinue,
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
          session={contextValue.activeSession}
          messages={conciergeMessages}
          input={conciergeInput}
          isPreview={isPreviewMode}
          isPreparing={
            isPreviewLoading ||
            (!isPreviewMode && contextValue.activeSession.orientation_seed_reply_id === null)
          }
          isWorking={conciergeIsWorking}
          streamedText={conciergeStreamedText}
          isPending={contextValue.pendingAction !== null}
          error={contextValue.error ?? conciergeError ?? conciergePublicError}
          onInputChange={setConciergeInput}
          onSubmit={handleConciergeSubmit}
          onContinue={contextValue.completeOrientation}
          onDismiss={contextValue.dismiss}
        />
      ) : null}
      {isPreviewMode ? (
        <WebCommunityOnboardingPreviewBar
          session={contextValue.activeSession}
          configuredEnabled={previewConfiguredEnabled}
          isLoading={isPreviewLoading}
          error={previewError}
          onAdvance={handlePreviewAdvance}
          onExit={() => props.onExitPreview?.()}
        />
      ) : null}
    </WebCommunityOnboardingContext.Provider>
  );
}
