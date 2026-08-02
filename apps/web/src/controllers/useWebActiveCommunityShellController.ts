import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  deriveCommunityAccessCapabilities,
  deriveCommunityActionGuards,
  deriveCommunityNavVisibility,
  deriveCommunitySettingsLayer,
} from "../../../../shared/communityAccessViewModel";
import {
  createCommunityAccessResolutionState,
  reduceCommunityAccessResolution,
  scopeCommunityAccessResolution,
} from "../../../../shared/communityAccessResolution";
import type { CommunityAccess } from "../../../../shared/communityTypes";
import { COMMUNITY_PRESENCE_HEARTBEAT_INTERVAL_MS } from "../../../../shared/communityPresenceContract";
import { fetchCloudMyCommunityAccessById } from "../../../../shared/cloudCommunityAccessGateway";
import {
  refreshCloudCommunityPresence,
} from "../../../../shared/cloudPublicFunnelGateway";
import {
  resolveAuthPresentationIdentity,
  type AuthSessionLike,
} from "../../../../shared/authSession";
import { useResumeEpochEffect } from "../../../../shared/useResumeEpochEffect";

type PresenceFace = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

type PresenceSummary = {
  member_count?: number | null;
  admin_count?: number | null;
  online_count?: number | null;
  online_count_capped?: boolean | null;
  online_faces?: PresenceFace[] | null;
  online_user_ids?: string[] | null;
  online_last_active_at_by_user_id?: Record<string, string> | null;
};

type ScopedPresenceSummary = {
  communityId: string;
  sessionIdentity: string;
  status: "pending" | "resolved" | "refreshing" | "failed";
  summary: PresenceSummary | null;
};

export function useWebActiveCommunityShellController<SessionT>(params: {
  activeCommunityId: string | null;
  session: SessionT | null;
  ensureSession: (session?: SessionT | null) => Promise<SessionT | null>;
  resumeEpoch: number;
}) {
  const [communityAccessResolution, dispatchCommunityAccessResolution] = useReducer(
    reduceCommunityAccessResolution<CommunityAccess>,
    undefined,
    createCommunityAccessResolutionState<CommunityAccess>,
  );
  const [activeCommunityPresenceSummaryState, setActiveCommunityPresenceSummaryState] =
    useState<ScopedPresenceSummary | null>(null);
  const accessRequestIdRef = useRef(0);
  const activeCommunityIdRef = useRef(params.activeCommunityId);
  const sessionRef = useRef(params.session);
  const accessSessionIdentityRef = useRef<string | null>(null);
  const refreshPresenceRef = useRef<() => void>(() => {});
  const sessionIdentity = resolveAuthPresentationIdentity(params.session as AuthSessionLike);
  activeCommunityIdRef.current = params.activeCommunityId;
  sessionRef.current = params.session;

  const reloadActiveCommunityAccess = useCallback(async (communityId: string, session: SessionT): Promise<void> => {
    const requestedCommunityId = String(communityId ?? "").trim();
    if (!requestedCommunityId) return;
    if (String(activeCommunityIdRef.current ?? "").trim() !== requestedCommunityId) return;
    const requestId = (accessRequestIdRef.current += 1);
    dispatchCommunityAccessResolution({
      type: "begin",
      communityId: requestedCommunityId,
      requestId,
    });
    try {
      const usableSession = await params.ensureSession(session);
      if (!usableSession) {
        throw new Error("session_unavailable");
      }
      const row = await fetchCloudMyCommunityAccessById<SessionT, CommunityAccess>({
        session: usableSession,
        communityId: requestedCommunityId,
      });
      if (activeCommunityIdRef.current !== requestedCommunityId) return;
      dispatchCommunityAccessResolution({
        type: "resolve",
        communityId: requestedCommunityId,
        requestId,
        access: row ?? null,
      });
    } catch {
      if (activeCommunityIdRef.current !== requestedCommunityId) return;
      dispatchCommunityAccessResolution({
        type: "fail",
        communityId: requestedCommunityId,
        requestId,
        error: "We couldn't verify your access to this community. Check your connection and retry.",
      });
    }
  }, [params.ensureSession]);

  useEffect(() => {
    if (!sessionIdentity || !params.activeCommunityId) {
      accessSessionIdentityRef.current = null;
      const requestId = (accessRequestIdRef.current += 1);
      dispatchCommunityAccessResolution({
        type: "reset",
        requestId,
      });
      return;
    }
    accessSessionIdentityRef.current = sessionIdentity;
    const communityId = params.activeCommunityId;
    const currentSession = sessionRef.current;
    if (!currentSession) return;
    void reloadActiveCommunityAccess(communityId, currentSession);
  }, [sessionIdentity, params.activeCommunityId, reloadActiveCommunityAccess]);

  useResumeEpochEffect(params.resumeEpoch, () => {
    const communityId = String(activeCommunityIdRef.current ?? "").trim();
    const currentSession = sessionRef.current;
    if (!sessionIdentity || !communityId || !currentSession) return;
    void reloadActiveCommunityAccess(communityId, currentSession);
  });

  useEffect(() => {
    if (!sessionIdentity || !params.activeCommunityId) {
      refreshPresenceRef.current = () => {};
      setActiveCommunityPresenceSummaryState(null);
      return;
    }
    let cancelled = false;
    let inFlight = false;
    const communityId = String(params.activeCommunityId ?? "").trim();
    setActiveCommunityPresenceSummaryState((previous) =>
      previous?.communityId === communityId && previous.sessionIdentity === sessionIdentity
        ? previous
        : {
            communityId,
            sessionIdentity,
            status: "pending",
            summary: null,
          },
    );
    const tick = async () => {
      if (cancelled || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      setActiveCommunityPresenceSummaryState((previous) => {
        if (previous?.communityId !== communityId || previous.sessionIdentity !== sessionIdentity) {
          return {
            communityId,
            sessionIdentity,
            status: "pending",
            summary: null,
          };
        }
        return {
          ...previous,
          status: previous.status === "pending" ? "pending" : "refreshing",
        };
      });
      try {
        const usableSession = await params.ensureSession(sessionRef.current);
        if (!usableSession) throw new Error("session_unavailable");
        const summary = await refreshCloudCommunityPresence<SessionT, PresenceSummary>({
          session: usableSession,
          communityId,
        });
        if (!cancelled && activeCommunityIdRef.current === communityId) {
          setActiveCommunityPresenceSummaryState({
            communityId,
            sessionIdentity,
            status: "resolved",
            summary: summary ?? null,
          });
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("Failed to refresh community presence:", error);
          setActiveCommunityPresenceSummaryState((previous) => {
            if (previous?.communityId !== communityId || previous.sessionIdentity !== sessionIdentity) {
              return previous;
            }
            return {
              ...previous,
              status: "failed",
            };
          });
        }
      } finally {
        inFlight = false;
      }
    };
    refreshPresenceRef.current = () => {
      void tick();
    };
    void tick();
    const intervalId = window.setInterval(() => {
      void tick();
    }, COMMUNITY_PRESENCE_HEARTBEAT_INTERVAL_MS);
    return () => {
      cancelled = true;
      refreshPresenceRef.current = () => {};
      window.clearInterval(intervalId);
    };
  }, [params.activeCommunityId, params.ensureSession, sessionIdentity]);

  useResumeEpochEffect(params.resumeEpoch, () => {
    refreshPresenceRef.current();
  });

  const scopedCommunityAccessResolution = useMemo(
    () => scopeCommunityAccessResolution(
      communityAccessResolution,
      params.activeCommunityId,
    ),
    [communityAccessResolution, params.activeCommunityId],
  );
  const isAccessSessionIdentityScoped = Boolean(
    sessionIdentity && accessSessionIdentityRef.current === sessionIdentity,
  );
  const presentationActiveCommunityAccess =
    isAccessSessionIdentityScoped &&
    (scopedCommunityAccessResolution.status === "resolved" ||
    scopedCommunityAccessResolution.status === "refreshing" ||
    scopedCommunityAccessResolution.status === "failed")
      ? scopedCommunityAccessResolution.access
      : null;
  const currentActiveCommunityAccess =
    isAccessSessionIdentityScoped && scopedCommunityAccessResolution.status === "resolved"
      ? scopedCommunityAccessResolution.access
      : null;
  const isLoadingCommunityAccess =
    Boolean(sessionIdentity) &&
    (!isAccessSessionIdentityScoped ||
      scopedCommunityAccessResolution.status === "pending" ||
      scopedCommunityAccessResolution.status === "refreshing");
  const communityAccessLoadError =
    isAccessSessionIdentityScoped && scopedCommunityAccessResolution.status === "failed"
      ? scopedCommunityAccessResolution.error
      : null;
  const isResolvingInitialCommunityAccess =
    isLoadingCommunityAccess && !presentationActiveCommunityAccess;
  const retryActiveCommunityAccess = useCallback(() => {
    const currentSession = sessionRef.current;
    if (!currentSession || !params.activeCommunityId) return;
    void reloadActiveCommunityAccess(params.activeCommunityId, currentSession);
  }, [
    params.activeCommunityId,
    reloadActiveCommunityAccess,
  ]);

  const activeCommunityPresenceSummary = useMemo(() => {
    const communityId = String(params.activeCommunityId ?? "").trim();
    if (!communityId) return null;
    if (activeCommunityPresenceSummaryState?.communityId !== communityId) return null;
    if (activeCommunityPresenceSummaryState.sessionIdentity !== sessionIdentity) return null;
    return activeCommunityPresenceSummaryState.summary;
  }, [activeCommunityPresenceSummaryState, params.activeCommunityId, sessionIdentity]);
  const activeCommunityPresenceStatus = useMemo(() => {
    const communityId = String(params.activeCommunityId ?? "").trim();
    if (!communityId || !sessionIdentity) return "idle" as const;
    if (activeCommunityPresenceSummaryState?.communityId !== communityId) return "pending" as const;
    if (activeCommunityPresenceSummaryState.sessionIdentity !== sessionIdentity) return "pending" as const;
    return activeCommunityPresenceSummaryState.status;
  }, [activeCommunityPresenceSummaryState, params.activeCommunityId, sessionIdentity]);

  const communityAccessCapabilities = useMemo(
    () => deriveCommunityAccessCapabilities(presentationActiveCommunityAccess),
    [presentationActiveCommunityAccess],
  );
  const authoritativeCommunityAccessCapabilities = useMemo(
    () => deriveCommunityAccessCapabilities(currentActiveCommunityAccess),
    [currentActiveCommunityAccess],
  );
  const communityNavVisibility = useMemo(
    () => deriveCommunityNavVisibility(communityAccessCapabilities),
    [communityAccessCapabilities],
  );
  const communityActionGuards = useMemo(
    () => deriveCommunityActionGuards(authoritativeCommunityAccessCapabilities),
    [authoritativeCommunityAccessCapabilities],
  );
  const authoritativeCommunityNavVisibility = useMemo(
    () => deriveCommunityNavVisibility(authoritativeCommunityAccessCapabilities),
    [authoritativeCommunityAccessCapabilities],
  );

  const isActiveCommunityOwner = authoritativeCommunityAccessCapabilities.isOwner;
  const isActiveCommunityAdmin =
    String(currentActiveCommunityAccess?.effective_role ?? "").trim().toLowerCase() === "admin";
  const communitySettingsLayer = deriveCommunitySettingsLayer(currentActiveCommunityAccess);
  const canManageCommunitySettings =
    communitySettingsLayer === "admin" || communitySettingsLayer === "owner";
  const canViewMemberPlanDetailsActiveCommunity = isActiveCommunityOwner || isActiveCommunityAdmin;
  const canViewMembersActiveCommunity = communityNavVisibility.canViewMembers;
  const canViewActiveCommunitySettings = communityNavVisibility.canViewSettings;
  const canViewActiveCommunityPolynet = communityAccessCapabilities.canViewCommunity;
  const canPostMessagesActiveCommunity = communityActionGuards.canPostMessages;
  const canManageResourcesActiveCommunity = communityActionGuards.canManageResources;
  const canModerateContentActiveCommunity = communityActionGuards.canModerateContent;
  const canManageMembersActiveCommunity = authoritativeCommunityNavVisibility.canManageMembers;
  const canPresentManageMembersActiveCommunity = communityNavVisibility.canManageMembers;
  const canReviewJoinRequestsActiveCommunity = communityActionGuards.canReviewJoinRequests;
  const canManagePricingActiveCommunity = communityActionGuards.canManagePricing;
  const canManageBrandingActiveCommunity = communityActionGuards.canManageBranding;
  const canManagePublishingActiveCommunity = communityActionGuards.canManagePublishing;
  const canManagePayoutsActiveCommunity = communityActionGuards.canManagePayouts;
  const canViewActiveCommunityAnalytics = communityNavVisibility.canViewAnalytics;

  const communitySocialSummary = useMemo(() => {
    const onlineFaces = activeCommunityPresenceSummary?.online_faces?.length
      ? activeCommunityPresenceSummary.online_faces
        .filter((face) => Boolean(face?.avatar_url))
        .slice(0, 4)
      : [];
    return {
      memberCount: typeof activeCommunityPresenceSummary?.member_count === "number"
        ? activeCommunityPresenceSummary.member_count
        : null,
      adminCount: typeof activeCommunityPresenceSummary?.admin_count === "number"
        ? activeCommunityPresenceSummary.admin_count
        : null,
      onlineCount: typeof activeCommunityPresenceSummary?.online_count === "number"
        ? activeCommunityPresenceSummary.online_count
        : null,
      onlineFaces,
    };
  }, [
    activeCommunityPresenceSummary?.admin_count,
    activeCommunityPresenceSummary?.member_count,
    activeCommunityPresenceSummary?.online_count,
    activeCommunityPresenceSummary?.online_faces,
  ]);

  const funnelPreviewAdminCount = communitySocialSummary.adminCount;
  const funnelPreviewOnlineCount = communitySocialSummary.onlineCount;
  const funnelPreviewOnlineFaces = communitySocialSummary.onlineFaces;

  const activeCommunityOnlineUserIds = useMemo(() => {
    const ids = activeCommunityPresenceSummary?.online_user_ids;
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => Boolean(id)) : []);
  }, [activeCommunityPresenceSummary?.online_user_ids]);

  return {
    activeCommunityAccess: currentActiveCommunityAccess,
    isLoadingCommunityAccess,
    isResolvingInitialCommunityAccess,
    communityAccessLoadError,
    retryActiveCommunityAccess,
    activeCommunityPresenceSummary,
    activeCommunityPresenceStatus,
    communitySocialSummary,
    reloadActiveCommunityAccess,
    communityAccessCapabilities,
    communityNavVisibility,
    communityActionGuards,
    isActiveCommunityOwner,
    isActiveCommunityAdmin,
    communitySettingsLayer,
    canManageCommunitySettings,
    canViewActiveCommunityPolynet,
    canViewMemberPlanDetailsActiveCommunity,
    canViewMembersActiveCommunity,
    canViewActiveCommunitySettings,
    canPostMessagesActiveCommunity,
    canManageResourcesActiveCommunity,
    canModerateContentActiveCommunity,
    canManageMembersActiveCommunity,
    canPresentManageMembersActiveCommunity,
    canReviewJoinRequestsActiveCommunity,
    canManagePricingActiveCommunity,
    canManageBrandingActiveCommunity,
    canManagePublishingActiveCommunity,
    canManagePayoutsActiveCommunity,
    canViewActiveCommunityAnalytics,
    funnelPreviewAdminCount,
    funnelPreviewOnlineCount,
    funnelPreviewOnlineFaces,
    activeCommunityOnlineUserIds,
  };
}
