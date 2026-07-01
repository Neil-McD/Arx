import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { toCanonicalCommunityVisibility } from "./communityVisibility";
import { deriveCommunityMembersJoinReviewMode, type CommunityMembersJoinReviewMode } from "../apps/web/src/communityJoinPolicy";

type CommunityLike = {
  id: string;
  entry_policy?: string | null;
  visibility?: string | null;
};

type LifecycleParams<
  SessionT,
  JoinRequestT,
  CommunityT extends CommunityLike,
> = {
  session: SessionT | null;
  activeCommunityId: string | null;
  communities: CommunityT[];
  canReviewJoinRequests: boolean;
  activeCommunityMembersJoinReviewMode: CommunityMembersJoinReviewMode | null;
  shouldLoad?: boolean;
  loadCommunityJoinRequests: (communityId: string, session: SessionT) => Promise<void> | void;
  setCommunityJoinRequests: Dispatch<SetStateAction<JoinRequestT[]>>;
  setIsLoadingCommunityJoinRequests: Dispatch<SetStateAction<boolean>>;
  setCommunityJoinRequestsError: Dispatch<SetStateAction<string | null>>;
  setDecidingCommunityJoinRequestId: Dispatch<SetStateAction<string | null>>;
};

export function useCommunityMembersReviewLifecycle<
  SessionT,
  JoinRequestT,
  CommunityT extends CommunityLike,
>(
  params: LifecycleParams<SessionT, JoinRequestT, CommunityT>,
) {
  const loadCommunityJoinRequestsRef = useRef(params.loadCommunityJoinRequests);

  useEffect(() => {
    loadCommunityJoinRequestsRef.current = params.loadCommunityJoinRequests;
  }, [params.loadCommunityJoinRequests]);

  useEffect(() => {
    params.setCommunityJoinRequests([]);
    params.setIsLoadingCommunityJoinRequests(false);
    params.setCommunityJoinRequestsError(null);
    params.setDecidingCommunityJoinRequestId(null);
  }, [params.activeCommunityId]);

  useEffect(() => {
    const shouldLoadForSurface = params.shouldLoad === true;
    if (!shouldLoadForSurface) return;
    const session = params.session;
    const communityId = params.activeCommunityId;
    if (!session || !communityId) {
      params.setCommunityJoinRequests([]);
      params.setIsLoadingCommunityJoinRequests(false);
      params.setCommunityJoinRequestsError(null);
      params.setDecidingCommunityJoinRequestId(null);
      return;
    }
    if (!params.canReviewJoinRequests) {
      params.setCommunityJoinRequests([]);
      params.setIsLoadingCommunityJoinRequests(false);
      params.setCommunityJoinRequestsError(null);
      params.setDecidingCommunityJoinRequestId(null);
      return;
    }

    const activeCommunityRecord = params.communities.find((community) => community.id === communityId) ?? null;
    const rawVisibility = String(activeCommunityRecord?.visibility ?? "")
      .trim()
      .toLowerCase();
    if (rawVisibility && !["published", "unlisted", "public", "private"].includes(rawVisibility)) {
      params.setCommunityJoinRequests([]);
      params.setIsLoadingCommunityJoinRequests(false);
      params.setCommunityJoinRequestsError(null);
      params.setDecidingCommunityJoinRequestId(null);
      return;
    }
    const visibility = toCanonicalCommunityVisibility(rawVisibility || "unlisted", "unlisted");

    if (visibility !== "published" && visibility !== "unlisted") {
      params.setCommunityJoinRequests([]);
      params.setIsLoadingCommunityJoinRequests(false);
      params.setCommunityJoinRequestsError(null);
      params.setDecidingCommunityJoinRequestId(null);
      return;
    }

    params.setCommunityJoinRequestsError(null);
    const joinReviewMode =
      params.activeCommunityMembersJoinReviewMode ??
      deriveCommunityMembersJoinReviewMode({ entry_policy: activeCommunityRecord?.entry_policy });

    if (joinReviewMode !== "free_approval") {
      params.setCommunityJoinRequests([]);
      params.setIsLoadingCommunityJoinRequests(false);
      params.setCommunityJoinRequestsError(null);
      params.setDecidingCommunityJoinRequestId(null);
      return;
    }

    void Promise.resolve(loadCommunityJoinRequestsRef.current(communityId, session))
      .catch((error) => {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to load join requests.";
        params.setCommunityJoinRequests([]);
        params.setIsLoadingCommunityJoinRequests(false);
        params.setCommunityJoinRequestsError(message);
        params.setDecidingCommunityJoinRequestId(null);
      });
  }, [
    params.session,
    params.activeCommunityId,
    params.canReviewJoinRequests,
    params.activeCommunityMembersJoinReviewMode,
    params.shouldLoad,
    params.communities,
  ]);
}
