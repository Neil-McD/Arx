import { useCallback, useEffect, useRef, useState } from "react";

import type { AppPage, CommunityTab } from "../../../../shared/appShellNavigation";
import {
  createCloudCommunityPolynetLiveClient,
  fetchCloudCommunityPolynetOverview,
  subscribeCloudCommunityPolynetOverview,
  type CloudCommunityPolynetOverview,
} from "../../../../shared/cloudCommunityPolynetGateway";
import {
  resolveAuthPresentationIdentity,
  type AuthSessionLike,
} from "../../../../shared/authSession";

function formatCommunityPolynetError(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) return "Unable to load Polynet.";
  if (value.includes("Could not find public function")) return "Polynet backend changes are not live in Convex yet.";
  if (value.includes("community_not_found")) return "Community not found.";
  if (value.includes("community_access_required") || value.includes("community_chat_access_required")) {
    return "You do not have access to this community.";
  }
  return value;
}

type EnsureSessionFn<SessionT> = (session?: SessionT | null) => Promise<SessionT | null>;

type UseWebCommunityPolynetControllerArgs<SessionT> = {
  activePage: AppPage;
  communityTab: CommunityTab;
  isMemoryOpen: boolean;
  activeCommunityId: string | null;
  session: SessionT | null;
  ensureSession: EnsureSessionFn<SessionT>;
  requireSignIn: () => void;
  canViewPolynet: boolean;
};

const COMMUNITY_POLYNET_RAIL_NODE_LIMIT = 12;
type CommunityMemoryPresentation = "rail" | "drawer";

function shouldLoadCommunityPolynet(activePage: AppPage, communityTab: CommunityTab): boolean {
  return activePage === "community" && communityTab === "chat";
}

function resolveCommunityMemoryPresentation(isMemoryOpen: boolean): CommunityMemoryPresentation {
  return isMemoryOpen ? "drawer" : "rail";
}

function resolveCommunityPolynetNodeLimit(presentation: CommunityMemoryPresentation): number | undefined {
  return presentation === "rail" ? COMMUNITY_POLYNET_RAIL_NODE_LIMIT : undefined;
}

export function useWebCommunityPolynetController<SessionT>(
  args: UseWebCommunityPolynetControllerArgs<SessionT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const [overview, setOverview] = useState<CloudCommunityPolynetOverview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptedCommunityId, setAttemptedCommunityId] = useState<string | null>(null);
  const requestSeqRef = useRef(0);
  const sessionIdentity = resolveAuthPresentationIdentity(args.session as AuthSessionLike);

  const isStaleRequest = useCallback((
    requestSeq: number,
    communityId: string,
    presentation: CommunityMemoryPresentation,
  ) => {
    const current = argsRef.current;
    return (
      requestSeq !== requestSeqRef.current
      || !shouldLoadCommunityPolynet(current.activePage, current.communityTab)
      || resolveCommunityMemoryPresentation(current.isMemoryOpen) !== presentation
      || current.activeCommunityId !== communityId
      || !current.canViewPolynet
    );
  }, []);

  const resetPolynetState = useCallback(() => {
    requestSeqRef.current += 1;
    setOverview(null);
    setAttemptedCommunityId(null);
    setError(null);
    setIsLoading(false);
  }, []);

  const loadOverview = useCallback(async (
    communityId: string,
    sessionInput?: SessionT | null,
  ) => {
    const requestSeq = ++requestSeqRef.current;
    const presentation = resolveCommunityMemoryPresentation(argsRef.current.isMemoryOpen);
    const nodeLimit = resolveCommunityPolynetNodeLimit(presentation);
    setAttemptedCommunityId(communityId);
    setIsLoading(true);
    setError(null);
    try {
      const usableSession = await argsRef.current.ensureSession(sessionInput ?? argsRef.current.session);
      if (isStaleRequest(requestSeq, communityId, presentation)) return null;
      if (!usableSession) {
        return null;
      }
      const nextOverview = await fetchCloudCommunityPolynetOverview<SessionT>({
        session: usableSession,
        communityId,
        ...(typeof nodeLimit === "number" ? { nodeLimit } : {}),
      });
      if (isStaleRequest(requestSeq, communityId, presentation)) return null;
      setOverview(nextOverview ?? null);
      return nextOverview ?? null;
    } catch (err) {
      if (isStaleRequest(requestSeq, communityId, presentation)) return null;
      setError(formatCommunityPolynetError(err instanceof Error ? err.message : err));
      return null;
    } finally {
      if (!isStaleRequest(requestSeq, communityId, presentation)) {
        setIsLoading(false);
      }
    }
  }, [isStaleRequest]);

  const refresh = useCallback(async () => {
    const current = argsRef.current;
    const activeCommunityId = current.activeCommunityId;
    if (!activeCommunityId) return;
    const usableSession = await current.ensureSession();
    if (!usableSession) {
      current.requireSignIn();
      return;
    }
    await loadOverview(activeCommunityId, usableSession);
  }, [loadOverview]);

  useEffect(() => {
    if (!shouldLoadCommunityPolynet(args.activePage, args.communityTab) || !args.activeCommunityId) {
      resetPolynetState();
      return;
    }
    if (!sessionIdentity || !args.canViewPolynet) {
      resetPolynetState();
      return;
    }
    void loadOverview(args.activeCommunityId, argsRef.current.session);
  }, [
    args.activeCommunityId,
    args.activePage,
    args.canViewPolynet,
    args.communityTab,
    args.isMemoryOpen,
    sessionIdentity,
    loadOverview,
    resetPolynetState,
  ]);

  useEffect(() => {
    if (
      !shouldLoadCommunityPolynet(args.activePage, args.communityTab)
      || !args.activeCommunityId
      || !sessionIdentity
      || !args.canViewPolynet
    ) {
      return;
    }

    const communityId = args.activeCommunityId;
    const presentation = resolveCommunityMemoryPresentation(args.isMemoryOpen);
    const nodeLimit = resolveCommunityPolynetNodeLimit(presentation);
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let closeLiveClient: (() => void) | null = null;

    void (async () => {
      try {
        const latest = argsRef.current;
        const usableSession = await latest.ensureSession(latest.session);
        if (cancelled || !usableSession) return;
        const current = argsRef.current;
        if (
          !shouldLoadCommunityPolynet(current.activePage, current.communityTab)
          || resolveCommunityMemoryPresentation(current.isMemoryOpen) !== presentation
          || current.activeCommunityId !== communityId
          || !current.canViewPolynet
        ) {
          return;
        }

        const liveClient = createCloudCommunityPolynetLiveClient({
          session: usableSession,
          ensureSession: current.ensureSession,
        });
        closeLiveClient = liveClient.close;
        unsubscribe = subscribeCloudCommunityPolynetOverview({
          liveClient,
          communityId,
          ...(typeof nodeLimit === "number" ? { nodeLimit } : {}),
          onUpdate: (nextOverview) => {
            const latestArgs = argsRef.current;
            if (
              cancelled
              || !shouldLoadCommunityPolynet(latestArgs.activePage, latestArgs.communityTab)
              || resolveCommunityMemoryPresentation(latestArgs.isMemoryOpen) !== presentation
              || latestArgs.activeCommunityId !== communityId
              || !latestArgs.canViewPolynet
            ) {
              return;
            }
            // Realtime truth wins over an older in-flight HTTP refresh.
            requestSeqRef.current += 1;
            setAttemptedCommunityId(communityId);
            setOverview(nextOverview);
            setError(null);
            setIsLoading(false);
          },
          onError: (err) => {
            if (cancelled) return;
            setError(formatCommunityPolynetError(err instanceof Error ? err.message : err));
          },
        });
      } catch (err) {
        if (cancelled) return;
        closeLiveClient?.();
        closeLiveClient = null;
        setError(formatCommunityPolynetError(err instanceof Error ? err.message : err));
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
      closeLiveClient?.();
    };
  }, [
    args.activeCommunityId,
    args.activePage,
    args.canViewPolynet,
    args.communityTab,
    args.isMemoryOpen,
    sessionIdentity,
  ]);

  const activeCommunityId = String(args.activeCommunityId ?? "").trim() || null;
  const shouldPresent = Boolean(
    sessionIdentity &&
    activeCommunityId &&
    args.canViewPolynet &&
    shouldLoadCommunityPolynet(args.activePage, args.communityTab),
  );
  const presentedOverview = shouldPresent && overview?.community.id === activeCommunityId
    ? overview
    : null;
  const isPresentationScoped = shouldPresent && attemptedCommunityId === activeCommunityId;
  const presentedError = isPresentationScoped ? error : null;

  return {
    state: {
      overview: presentedOverview,
      isLoading: shouldPresent && (isLoading || (!isPresentationScoped && !presentedError)),
      error: presentedError,
    },
    actions: {
      refresh: () => {
        void refresh();
      },
    },
  };
}
