import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { toCanonicalCommunityVisibility } from "./communityVisibility";

type CommunityLike = {
  id: string;
  visibility?: string | null;
};

type LifecycleParams<
  SessionT,
  InviteT,
  JoinRequestT,
  CommunityT extends CommunityLike,
> = {
  activePage: string;
  communityTab: string;
  session: SessionT | null;
  activeCommunityId: string | null;
  communities: CommunityT[];
  canInviteActiveCommunity: boolean;
  canReviewJoinRequestsActiveCommunity: boolean;
  membersCommunityHasPaidPlans: boolean | null;
  isJoinRequestsModalOpen: boolean;
  loadCommunityInvites: (communityId: string, session: SessionT) => Promise<void> | void;
  loadCommunityHasPaidPlans: (communityId: string, session: SessionT) => Promise<boolean>;
  loadCommunityJoinRequests: (communityId: string, session: SessionT) => Promise<void> | void;
  setCommunityInvites: Dispatch<SetStateAction<InviteT[]>>;
  setMembersCommunityHasPaidPlans: Dispatch<SetStateAction<boolean | null>>;
  setIsLoadingMembersCommunityPricing: Dispatch<SetStateAction<boolean>>;
  setCommunityJoinRequests: Dispatch<SetStateAction<JoinRequestT[]>>;
  setIsLoadingCommunityJoinRequests: Dispatch<SetStateAction<boolean>>;
  setCommunityJoinRequestsError: Dispatch<SetStateAction<string | null>>;
  setDecidingCommunityJoinRequestId: Dispatch<SetStateAction<string | null>>;
  setIsJoinRequestsModalOpen: Dispatch<SetStateAction<boolean>>;
};

export function useCommunityMembersReviewLifecycle<
  SessionT,
  InviteT,
  JoinRequestT,
  CommunityT extends CommunityLike,
>(
  params: LifecycleParams<SessionT, InviteT, JoinRequestT, CommunityT>,
) {
  const loadCommunityInvitesRef = useRef(params.loadCommunityInvites);
  const loadCommunityHasPaidPlansRef = useRef(params.loadCommunityHasPaidPlans);
  const loadCommunityJoinRequestsRef = useRef(params.loadCommunityJoinRequests);

  useEffect(() => {
    loadCommunityInvitesRef.current = params.loadCommunityInvites;
  }, [params.loadCommunityInvites]);

  useEffect(() => {
    loadCommunityHasPaidPlansRef.current = params.loadCommunityHasPaidPlans;
  }, [params.loadCommunityHasPaidPlans]);

  useEffect(() => {
    loadCommunityJoinRequestsRef.current = params.loadCommunityJoinRequests;
  }, [params.loadCommunityJoinRequests]);

  useEffect(() => {
    params.setMembersCommunityHasPaidPlans(null);
    params.setIsLoadingMembersCommunityPricing(false);
    params.setCommunityJoinRequests([]);
    params.setIsLoadingCommunityJoinRequests(false);
    params.setCommunityJoinRequestsError(null);
    params.setDecidingCommunityJoinRequestId(null);
    params.setIsJoinRequestsModalOpen(false);
  }, [params.activeCommunityId]);

  useEffect(() => {
    if (params.activePage !== "community") return;
    if (params.communityTab === "members") return;
    params.setIsJoinRequestsModalOpen(false);
  }, [params.activePage, params.communityTab]);

  useEffect(() => {
    if (params.activePage !== "community" || params.communityTab !== "members") return;
    if (!params.session || !params.activeCommunityId || !params.canInviteActiveCommunity) {
      params.setCommunityInvites([]);
      return;
    }
    void loadCommunityInvitesRef.current(params.activeCommunityId, params.session);
  }, [
    params.activePage,
    params.communityTab,
    params.session,
    params.activeCommunityId,
    params.canInviteActiveCommunity,
  ]);

  useEffect(() => {
    if (params.activePage !== "community" || params.communityTab !== "members") return;
    const session = params.session;
    const communityId = params.activeCommunityId;
    if (!session || !communityId) {
      params.setMembersCommunityHasPaidPlans(null);
      params.setIsLoadingMembersCommunityPricing(false);
      params.setCommunityJoinRequests([]);
      params.setIsLoadingCommunityJoinRequests(false);
      params.setCommunityJoinRequestsError(null);
      params.setDecidingCommunityJoinRequestId(null);
      params.setIsJoinRequestsModalOpen(false);
      return;
    }
    if (!params.canReviewJoinRequestsActiveCommunity) {
      params.setMembersCommunityHasPaidPlans(null);
      params.setCommunityJoinRequests([]);
      params.setIsLoadingCommunityJoinRequests(false);
      params.setCommunityJoinRequestsError(null);
      params.setDecidingCommunityJoinRequestId(null);
      params.setIsJoinRequestsModalOpen(false);
      return;
    }

    const activeCommunityRecord = params.communities.find((community) => community.id === communityId) ?? null;
    const rawVisibility = String(activeCommunityRecord?.visibility ?? "")
      .trim()
      .toLowerCase();
    if (rawVisibility && !["published", "unlisted", "public", "private"].includes(rawVisibility)) {
      params.setMembersCommunityHasPaidPlans(null);
      params.setCommunityJoinRequests([]);
      params.setIsLoadingCommunityJoinRequests(false);
      params.setCommunityJoinRequestsError(null);
      params.setDecidingCommunityJoinRequestId(null);
      params.setIsJoinRequestsModalOpen(false);
      return;
    }
    const visibility = toCanonicalCommunityVisibility(rawVisibility || "unlisted", "unlisted");

    if (visibility !== "published" && visibility !== "unlisted") {
      params.setMembersCommunityHasPaidPlans(null);
      params.setCommunityJoinRequests([]);
      params.setIsLoadingCommunityJoinRequests(false);
      params.setCommunityJoinRequestsError(null);
      params.setDecidingCommunityJoinRequestId(null);
      params.setIsJoinRequestsModalOpen(false);
      return;
    }

    let cancelled = false;
    params.setIsLoadingMembersCommunityPricing(true);
    params.setCommunityJoinRequestsError(null);

    void (async () => {
      try {
        const hasPaidPlans = await loadCommunityHasPaidPlansRef.current(
          communityId,
          session,
        );
        if (cancelled) return;

        params.setMembersCommunityHasPaidPlans(hasPaidPlans);
        if (hasPaidPlans) {
          params.setCommunityJoinRequests([]);
          params.setIsLoadingCommunityJoinRequests(false);
          params.setCommunityJoinRequestsError(null);
          params.setDecidingCommunityJoinRequestId(null);
          params.setIsJoinRequestsModalOpen(false);
          return;
        }

        await loadCommunityJoinRequestsRef.current(
          communityId,
          session,
        );
      } catch (error) {
        if (cancelled) return;
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to load pricing.";
        params.setMembersCommunityHasPaidPlans(null);
        params.setCommunityJoinRequests([]);
        params.setIsLoadingCommunityJoinRequests(false);
        params.setCommunityJoinRequestsError(message);
        params.setDecidingCommunityJoinRequestId(null);
        params.setIsJoinRequestsModalOpen(false);
      } finally {
        if (cancelled) return;
        params.setIsLoadingMembersCommunityPricing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    params.activePage,
    params.communityTab,
    params.session,
    params.activeCommunityId,
    params.canReviewJoinRequestsActiveCommunity,
    params.communities,
  ]);

  useEffect(() => {
    if (!params.isJoinRequestsModalOpen) return;
    if (
      params.activePage !== "community" ||
      params.communityTab !== "members" ||
      !params.activeCommunityId ||
      !params.canReviewJoinRequestsActiveCommunity ||
      params.membersCommunityHasPaidPlans === true
    ) {
      params.setIsJoinRequestsModalOpen(false);
    }
  }, [
    params.isJoinRequestsModalOpen,
    params.activePage,
    params.communityTab,
    params.activeCommunityId,
    params.canReviewJoinRequestsActiveCommunity,
    params.membersCommunityHasPaidPlans,
  ]);
}
