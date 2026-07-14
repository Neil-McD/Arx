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
import { fetchCloudCommunityFunnelConfig } from "../../../../shared/cloudCommunityFunnelGateway";
import type { CommunityFunnelConfig } from "../../../../shared/communityTypes";
import {
  createCloudCommunityChatLiveClient,
  type CloudCommunityChatLiveClient,
} from "../../../../shared/cloudCommunityChatGateway";
import { WebCommunityOnboardingOrientationModal } from "./WebCommunityOnboardingOrientationModal";
import { WebCommunityOnboardingPreviewBar } from "./WebCommunityOnboardingPreviewBar";

type PendingAction = "continue" | "dismiss" | null;

type WebCommunityOnboardingContextValue = {
  mode: "live" | "preview";
  activeSession: CommunityOnboardingSession | null;
  pendingAction: PendingAction;
  error: string | null;
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
  const openedSessionIdsRef = useRef(new Set<string>());

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
    if (!props.canPreview) {
      setPreviewError("Preview is available to community owners and admins.");
      return;
    }
    if (!props.session || !props.communityId) {
      setPreviewError("The saved onboarding workflow is unavailable.");
      return;
    }

    let cancelled = false;
    setIsPreviewLoading(true);
    void (async () => {
      try {
        const nextUsableSession = props.ensureSession
          ? await props.ensureSession(props.session)
          : props.session;
        if (!nextUsableSession || cancelled) return;
        const [config, funnel] = await Promise.all([
          fetchCloudCommunityOnboardingConfig({
            session: nextUsableSession,
            communityId: props.communityId!,
          }),
          fetchCloudCommunityFunnelConfig<unknown, CommunityFunnelConfig>({
            session: nextUsableSession,
            communityId: props.communityId!,
          }),
        ]);
        if (cancelled) return;
        const introVideoUrl =
          funnel?.hero_media_kind === "video" ? funnel.hero_media_url ?? null : null;
        setPreviewConfiguredEnabled(config.enabled);
        setPreviewSession(createCommunityOnboardingPreviewSession({
          communityId: props.communityId!,
          config,
          introVideoUrl,
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
    isPreviewMode,
    props.canPreview,
    props.communityId,
    props.ensureSession,
    props.session,
  ]);

  useEffect(() => {
    if (
      isPreviewMode ||
      !activeSession ||
      activeSession.community_id !== props.communityId ||
      activeSession.opened_at ||
      !usableSession ||
      !props.communityId ||
      openedSessionIdsRef.current.has(activeSession.id)
    ) {
      return;
    }
    openedSessionIdsRef.current.add(activeSession.id);
    let cancelled = false;
    void openCloudCommunityOnboardingSession({
      session: usableSession,
      communityId: props.communityId,
      sessionId: activeSession.id,
    }).then((next) => {
      if (!cancelled && next) {
        setActiveSession((current) => current?.id === next.id ? next : current);
      }
    }).catch((openError) => {
      console.warn("community_onboarding_open_marker_failed", openError);
    });
    return () => {
      cancelled = true;
    };
  }, [activeSession, isPreviewMode, props.communityId, usableSession]);

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
    dismiss: handleDismiss,
  }), [
    handleDismiss,
    isPreviewMode,
    presentedError,
    presentedPendingAction,
    presentedSession,
    props.communityId,
  ]);

  const showOrientation = Boolean(
    props.communityName &&
    contextValue.activeSession &&
    shouldPresentCommunityOnboardingOrientation(contextValue.activeSession),
  );

  return (
    <WebCommunityOnboardingContext.Provider value={contextValue}>
      {props.children}
      {showOrientation && props.communityName && contextValue.activeSession ? (
        <WebCommunityOnboardingOrientationModal
          communityName={props.communityName}
          session={contextValue.activeSession}
          isPending={presentedPendingAction !== null}
          error={presentedError}
          onContinue={handleContinue}
          onDismiss={handleDismiss}
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
