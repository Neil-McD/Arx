import { useEffect, useRef } from "react";
import { toCanonicalCommunityVisibility } from "./communityVisibility";
import { deriveCommunityMembersJoinReviewMode, type CommunityMembersJoinReviewMode } from "./communityJoinPolicy";

type CommunityLike = {
  id: string;
  entry_policy?: string | null;
  visibility?: string | null;
};

type LifecycleParams<
  SessionT,
  CommunityT extends CommunityLike,
> = {
  session: SessionT | null;
  activeCommunityId: string | null;
  communities: CommunityT[];
  canReviewJoinRequests: boolean;
  activeCommunityMembersJoinReviewMode: CommunityMembersJoinReviewMode | null;
  shouldLoad?: boolean;
  loadCommunityJoinRequests: (communityId: string, session: SessionT) => Promise<void> | void;
  resetCommunityJoinRequests: () => void;
};

export function useCommunityMembersReviewLifecycle<
  SessionT,
  CommunityT extends CommunityLike,
>(
  params: LifecycleParams<SessionT, CommunityT>,
) {
  const loadCommunityJoinRequestsRef = useRef(params.loadCommunityJoinRequests);

  useEffect(() => {
    loadCommunityJoinRequestsRef.current = params.loadCommunityJoinRequests;
  }, [params.loadCommunityJoinRequests]);

  useEffect(() => {
    params.resetCommunityJoinRequests();
  }, [params.activeCommunityId, params.resetCommunityJoinRequests]);

  useEffect(() => {
    const shouldLoadForSurface = params.shouldLoad === true;
    if (!shouldLoadForSurface) {
      params.resetCommunityJoinRequests();
      return;
    }
    const session = params.session;
    const communityId = params.activeCommunityId;
    if (!session || !communityId) {
      params.resetCommunityJoinRequests();
      return;
    }
    if (!params.canReviewJoinRequests) {
      params.resetCommunityJoinRequests();
      return;
    }

    const activeCommunityRecord = params.communities.find((community) => community.id === communityId) ?? null;
    const rawVisibility = String(activeCommunityRecord?.visibility ?? "")
      .trim()
      .toLowerCase();
    if (rawVisibility && !["published", "unlisted", "public", "private"].includes(rawVisibility)) {
      params.resetCommunityJoinRequests();
      return;
    }
    const visibility = toCanonicalCommunityVisibility(rawVisibility || "unlisted", "unlisted");

    if (visibility !== "published" && visibility !== "unlisted") {
      params.resetCommunityJoinRequests();
      return;
    }

    const joinReviewMode =
      params.activeCommunityMembersJoinReviewMode ??
      deriveCommunityMembersJoinReviewMode({ entry_policy: activeCommunityRecord?.entry_policy });

    if (joinReviewMode !== "free_approval") {
      params.resetCommunityJoinRequests();
      return;
    }

    void loadCommunityJoinRequestsRef.current(communityId, session);
  }, [
    params.session,
    params.activeCommunityId,
    params.canReviewJoinRequests,
    params.activeCommunityMembersJoinReviewMode,
    params.shouldLoad,
    params.communities,
    params.resetCommunityJoinRequests,
  ]);
}
