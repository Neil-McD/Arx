import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deriveCommunityAccessCapabilities,
  deriveCommunityActionGuards,
  deriveCommunityNavVisibility,
  deriveCommunitySettingsLayer,
} from "../../../../shared/communityAccessViewModel";
import type { CommunityAccess } from "../../../../shared/communityTypes";
import { fetchCloudMyCommunityAccessById } from "../../../../shared/cloudCommunityAccessGateway";
import {
  fetchCloudCommunityPresenceSummary,
  heartbeatCloudCommunityPresence,
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
  online_faces?: PresenceFace[] | null;
};

export function useWebActiveCommunityShellController<SessionT>(params: {
  activeCommunityId: string | null;
  session: SessionT | null;
  ensureSession: (session?: SessionT | null) => Promise<SessionT | null>;
}) {
  const [activeCommunityAccess, setActiveCommunityAccess] = useState<CommunityAccess | null>(null);
  const [isLoadingCommunityAccess, setIsLoadingCommunityAccess] = useState(false);
  const [activeCommunityPresenceSummary, setActiveCommunityPresenceSummary] = useState<PresenceSummary | null>(null);
  const accessSeqRef = useRef(0);
  const activeCommunityIdRef = useRef(params.activeCommunityId);

  useEffect(() => {
    activeCommunityIdRef.current = params.activeCommunityId;
  }, [params.activeCommunityId]);

  const reloadActiveCommunityAccess = useCallback(async (communityId: string, session: SessionT): Promise<void> => {
    const usableSession = await params.ensureSession(session);
    if (!usableSession) return;
    const requestedCommunityId = String(communityId ?? "").trim();
    if (!requestedCommunityId) return;
    const seq = (accessSeqRef.current += 1);
    setIsLoadingCommunityAccess(true);
    try {
      const row = await fetchCloudMyCommunityAccessById<SessionT, CommunityAccess>({
        session: usableSession,
        communityId: requestedCommunityId,
      });
      if (
        accessSeqRef.current === seq &&
        activeCommunityIdRef.current === requestedCommunityId
      ) {
        setActiveCommunityAccess(row ?? null);
      }
    } catch {
      // ignore
    } finally {
      if (accessSeqRef.current === seq) {
        setIsLoadingCommunityAccess(false);
      }
    }
  }, [params.ensureSession]);

  useEffect(() => {
    if (!params.session || !params.activeCommunityId) {
      accessSeqRef.current += 1;
      setActiveCommunityAccess(null);
      setIsLoadingCommunityAccess(false);
      return;
    }
    void reloadActiveCommunityAccess(params.activeCommunityId, params.session);
  }, [params.session, params.activeCommunityId, reloadActiveCommunityAccess]);

  useEffect(() => {
    if (!params.session || !params.activeCommunityId) return;
    let cancelled = false;
    const communityId = params.activeCommunityId;
    const tick = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        const usableSession = await params.ensureSession(params.session);
        if (!usableSession) return;
        await heartbeatCloudCommunityPresence<SessionT>({
          session: usableSession,
          communityId,
        });
      } catch (error) {
        if (!cancelled) {
          console.warn("Failed to heartbeat community presence:", error);
        }
      }
    };
    void tick();
    const intervalId = window.setInterval(() => {
      void tick();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [params.activeCommunityId, params.session, params.ensureSession]);

  useEffect(() => {
    if (!params.session || !params.activeCommunityId) {
      setActiveCommunityPresenceSummary(null);
      return;
    }
    let cancelled = false;
    const communityId = params.activeCommunityId;
    const refresh = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        const usableSession = await params.ensureSession(params.session);
        if (!usableSession) return;
        const summary = await fetchCloudCommunityPresenceSummary<SessionT, PresenceSummary>({
          session: usableSession,
          communityId,
        });
        if (!cancelled) {
          setActiveCommunityPresenceSummary(summary ?? null);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("Failed to load community presence summary:", error);
        }
      }
    };
    void refresh();
    const intervalId = window.setInterval(() => {
      void refresh();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [params.activeCommunityId, params.session, params.ensureSession]);

  const currentActiveCommunityAccess = useMemo(() => {
    const communityId = String(params.activeCommunityId ?? "").trim();
    if (!communityId) return null;
    if (activeCommunityAccess?.community_id !== communityId) return null;
    return activeCommunityAccess;
  }, [activeCommunityAccess, params.activeCommunityId]);

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
  const canDeleteActiveCommunity = communitySettingsLayer === "owner";
  const canViewActiveCommunityPolynet = isActiveCommunityOwner || isActiveCommunityAdmin;
  const canViewMemberPlanDetailsActiveCommunity = isActiveCommunityOwner || isActiveCommunityAdmin;
  const canViewMembersActiveCommunity = communityNavVisibility.canViewMembers;
  const canViewActiveCommunitySettings = communityNavVisibility.canViewSettings;
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

  return {
    activeCommunityAccess: currentActiveCommunityAccess,
    isLoadingCommunityAccess,
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
    canDeleteActiveCommunity,
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
  };
}
