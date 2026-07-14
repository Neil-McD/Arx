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
  shouldPresentCommunityOnboardingOrientation,
  type CommunityOnboardingSession,
} from "../../../../shared/communityOnboarding";
import {
  completeCloudCommunityOnboardingOrientation,
  dismissCloudCommunityOnboardingSession,
  openCloudCommunityOnboardingSession,
  subscribeCloudCommunityOnboardingSession,
} from "../../../../shared/cloudCommunityOnboardingGateway";
import {
  createCloudCommunityChatLiveClient,
  type CloudCommunityChatLiveClient,
} from "../../../../shared/cloudCommunityChatGateway";
import { WebCommunityOnboardingOrientationModal } from "./WebCommunityOnboardingOrientationModal";

type PendingAction = "continue" | "dismiss" | null;

type WebCommunityOnboardingContextValue = {
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
  onOrientationCompleted?: () => void;
}) {
  const [activeSession, setActiveSession] = useState<CommunityOnboardingSession | null>(null);
  const [usableSession, setUsableSession] = useState<unknown | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const openedSessionIdsRef = useRef(new Set<string>());

  useEffect(() => {
    setActiveSession(null);
    setUsableSession(null);
    setPendingAction(null);
    setError(null);
    if (!props.isEnabled || !props.session || !props.communityId) return;

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
  }, [props.communityId, props.ensureSession, props.isEnabled, props.session]);

  useEffect(() => {
    if (
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
  }, [activeSession, props.communityId, usableSession]);

  const handleContinue = useCallback(() => {
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
  }, [activeSession, pendingAction, props.communityId, props.onOrientationCompleted, usableSession]);

  const handleDismiss = useCallback(() => {
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
  }, [activeSession, pendingAction, props.communityId, usableSession]);

  const contextValue = useMemo<WebCommunityOnboardingContextValue>(() => ({
    activeSession:
      activeSession?.community_id === props.communityId ? activeSession : null,
    pendingAction,
    error,
    dismiss: handleDismiss,
  }), [activeSession, error, handleDismiss, pendingAction, props.communityId]);

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
          isPending={pendingAction !== null}
          error={error}
          onContinue={handleContinue}
          onDismiss={handleDismiss}
        />
      ) : null}
    </WebCommunityOnboardingContext.Provider>
  );
}
