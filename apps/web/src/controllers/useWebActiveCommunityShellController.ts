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
import type {
  CommunityAccess,
  CommunityPresenceSummary,
} from "../../../../shared/communityTypes";
import { COMMUNITY_PRESENCE_HEARTBEAT_INTERVAL_MS } from "../../../../shared/communityPresenceContract";
import { fetchCloudMyCommunityAccessById } from "../../../../shared/cloudCommunityAccessGateway";
import { heartbeatCloudCommunityPresence } from "../../../../shared/cloudPublicFunnelGateway";
import { firstGatewayRow } from "../../../../shared/cloudGateway";
import { useLiveQuery } from "../../../../shared/liveQuery";
import {
  resolveAuthPresentationIdentity,
  resolveAuthSubject,
  type AuthSessionLike,
} from "../../../../shared/authSession";
import { reuseEquivalentValue } from "../../../../shared/reuseEquivalentValue";
import {
  canPreviewAsMember,
  memberPreviewAccess,
  readMemberPreviewCommunityId,
  writeMemberPreview,
} from "../../../../shared/communityMemberPreview";
import { useResumeEpochEffect } from "../../../../shared/useResumeEpochEffect";

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
    if (accessSessionIdentityRef.current !== sessionIdentity) {
      const requestId = (accessRequestIdRef.current += 1);
      dispatchCommunityAccessResolution({
        type: "reset",
        requestId,
      });
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

  // Being here: a heartbeat every 30 seconds while the page is visible. Who
  // else is here is read live below, so it changes as soon as anyone's
  // heartbeat does.
  useEffect(() => {
    if (!sessionIdentity || !params.activeCommunityId) {
      refreshPresenceRef.current = () => {};
      return;
    }
    let cancelled = false;
    let inFlight = false;
    const communityId = String(params.activeCommunityId ?? "").trim();
    const tick = async () => {
      if (cancelled || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const usableSession = await params.ensureSession(sessionRef.current);
        if (!usableSession || cancelled) return;
        await heartbeatCloudCommunityPresence<SessionT>({ session: usableSession, communityId });
      } catch (error) {
        if (!cancelled) console.warn("Failed to record community presence:", error);
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
  const realCommunityAccess =
    isAccessSessionIdentityScoped &&
    (scopedCommunityAccessResolution.status === "resolved" ||
    scopedCommunityAccessResolution.status === "refreshing" ||
    scopedCommunityAccessResolution.status === "failed")
      ? scopedCommunityAccessResolution.access
      : null;
  // "View as a member": the rest of the app reads only the lensed access, so
  // every host-or-member choice follows it. It can only take powers away.
  const [memberPreviewCommunityId, setMemberPreviewCommunityId] = useState<string | null>(readMemberPreviewCommunityId);
  const canPreviewMember = canPreviewAsMember(realCommunityAccess);
  const isMemberPreview = canPreviewMember && memberPreviewCommunityId !== null &&
    memberPreviewCommunityId === params.activeCommunityId;
  const activeCommunityAccess = useMemo(
    () => (isMemberPreview && realCommunityAccess ? memberPreviewAccess(realCommunityAccess) : realCommunityAccess),
    [isMemberPreview, realCommunityAccess],
  );
  const setMemberPreview = useCallback((on: boolean) => {
    const communityId = on ? params.activeCommunityId : null;
    writeMemberPreview(communityId, on);
    setMemberPreviewCommunityId(communityId);
  }, [params.activeCommunityId]);
  const memberPreview = useMemo(
    () => ({ available: canPreviewMember, active: isMemberPreview, set: setMemberPreview }),
    [canPreviewMember, isMemberPreview, setMemberPreview],
  );
  const isLoadingCommunityAccess =
    Boolean(sessionIdentity) &&
    (!isAccessSessionIdentityScoped ||
      scopedCommunityAccessResolution.status === "pending");
  const communityAccessLoadError =
    isAccessSessionIdentityScoped && scopedCommunityAccessResolution.status === "failed"
      ? scopedCommunityAccessResolution.error
      : null;
  const retryActiveCommunityAccess = useCallback(() => {
    const currentSession = sessionRef.current;
    if (!currentSession || !params.activeCommunityId) return;
    void reloadActiveCommunityAccess(params.activeCommunityId, currentSession);
  }, [
    params.activeCommunityId,
    reloadActiveCommunityAccess,
  ]);

  const presenceSubject = params.session ? resolveAuthSubject(params.session as AuthSessionLike) : null;
  const presenceCommunityId = String(params.activeCommunityId ?? "").trim() || null;
  const livePresence = useLiveQuery<unknown>(params.session, "communityPublic:getCommunityPresenceSummary",
    presenceSubject && presenceCommunityId ? { authSubject: presenceSubject, communityId: presenceCommunityId } : null);
  const activeCommunityPresenceSummary = useMemo(
    () => (livePresence.data === undefined ? null : firstGatewayRow<CommunityPresenceSummary>(livePresence.data)),
    [livePresence.data],
  );
  const isLoadingActiveCommunityPresence = Boolean(
    presenceSubject && presenceCommunityId && livePresence.data === undefined && !livePresence.error,
  );

  const communityAccessCapabilities = useMemo(
    () => deriveCommunityAccessCapabilities(activeCommunityAccess),
    [activeCommunityAccess],
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
    String(activeCommunityAccess?.effective_role ?? "").trim().toLowerCase() === "admin";
  const communitySettingsLayer = deriveCommunitySettingsLayer(activeCommunityAccess);
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

  return {
    activeCommunityAccess,
    memberPreview,
    isLoadingCommunityAccess,
    communityAccessLoadError,
    retryActiveCommunityAccess,
    activeCommunityPresenceSummary,
    isLoadingActiveCommunityPresence,
    communitySocialSummary,
    reloadActiveCommunityAccess,
    isActiveCommunityOwner,
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
    canViewActiveCommunityAnalytics,
  };
}
