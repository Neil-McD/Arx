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
  summary: PresenceSummary | null;
};

export function useWebActiveCommunityShellController<SessionT>(params: {
  activeCommunityId: string | null;
  session: SessionT | null;
  ensureSession: (session?: SessionT | null) => Promise<SessionT | null>;
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
  activeCommunityIdRef.current = params.activeCommunityId;

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
    if (!params.session || !params.activeCommunityId) {
      const requestId = (accessRequestIdRef.current += 1);
      dispatchCommunityAccessResolution({
        type: "reset",
        requestId,
      });
      return;
    }
    void reloadActiveCommunityAccess(params.activeCommunityId, params.session);
  }, [params.session, params.activeCommunityId, reloadActiveCommunityAccess]);

  useEffect(() => {
    if (!params.session || !params.activeCommunityId) {
      setActiveCommunityPresenceSummaryState(null);
      return;
    }
    let cancelled = false;
    let inFlight = false;
    const communityId = String(params.activeCommunityId ?? "").trim();
    const tick = async () => {
      if (cancelled || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const usableSession = await params.ensureSession(params.session);
        if (!usableSession) return;
        const summary = await refreshCloudCommunityPresence<SessionT, PresenceSummary>({
          session: usableSession,
          communityId,
        });
        if (!cancelled && activeCommunityIdRef.current === communityId) {
          setActiveCommunityPresenceSummaryState({
            communityId,
            summary: summary ?? null,
          });
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("Failed to refresh community presence:", error);
        }
      } finally {
        inFlight = false;
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void tick();
    };
    void tick();
    const intervalId = window.setInterval(() => {
      void tick();
    }, COMMUNITY_PRESENCE_HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [params.activeCommunityId, params.session, params.ensureSession]);

  useEffect(() => {
    setActiveCommunityPresenceSummaryState(null);
  }, [params.activeCommunityId]);

  const scopedCommunityAccessResolution = useMemo(
    () => scopeCommunityAccessResolution(
      communityAccessResolution,
      params.activeCommunityId,
    ),
    [communityAccessResolution, params.activeCommunityId],
  );
  const currentActiveCommunityAccess =
    scopedCommunityAccessResolution.status === "resolved"
      ? scopedCommunityAccessResolution.access
      : null;
  const isLoadingCommunityAccess =
    Boolean(params.session) && scopedCommunityAccessResolution.status === "pending";
  const communityAccessLoadError =
    scopedCommunityAccessResolution.status === "failed"
      ? scopedCommunityAccessResolution.error
      : null;
  const retryActiveCommunityAccess = useCallback(() => {
    if (!params.session || !params.activeCommunityId) return;
    void reloadActiveCommunityAccess(params.activeCommunityId, params.session);
  }, [
    params.activeCommunityId,
    params.session,
    reloadActiveCommunityAccess,
  ]);

  const activeCommunityPresenceSummary = useMemo(() => {
    const communityId = String(params.activeCommunityId ?? "").trim();
    if (!communityId) return null;
    if (activeCommunityPresenceSummaryState?.communityId !== communityId) return null;
    return activeCommunityPresenceSummaryState.summary;
  }, [activeCommunityPresenceSummaryState, params.activeCommunityId]);

  const communityAccessCapabilities = useMemo(
    () => deriveCommunityAccessCapabilities(currentActiveCommunityAccess),
    [currentActiveCommunityAccess],
  );
  const communityNavVisibility = useMemo(
    () => deriveCommunityNavVisibility(communityAccessCapabilities),
    [communityAccessCapabilities],
  );
  const communityActionGuards = useMemo(
    () => deriveCommunityActionGuards(communityAccessCapabilities),
    [communityAccessCapabilities],
  );

  const isActiveCommunityOwner = communityAccessCapabilities.isOwner;
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
  const canManageMembersActiveCommunity = communityNavVisibility.canManageMembers;
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
    communityAccessLoadError,
    retryActiveCommunityAccess,
    activeCommunityPresenceSummary,
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
