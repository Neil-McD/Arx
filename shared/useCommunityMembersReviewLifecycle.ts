import { useEffect, useRef } from "react";
import { toCanonicalCommunityVisibility } from "./communityVisibility";
import { deriveCommunityMembersJoinReviewMode, type CommunityMembersJoinReviewMode } from "./communityJoinPolicy";
import { resolveAuthSubject, type AuthSessionLike } from "./authSession";
import { useLiveChange } from "./liveQuery";

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

  // The community whose join requests this person may review here, or null.
  const reviewCommunityId = joinRequestsCommunityToLoad(params);

  useEffect(() => {
    const session = params.session;
    if (!session || !reviewCommunityId) {
      params.resetCommunityJoinRequests();
      return;
    }
    const communityId = reviewCommunityId;

    void loadCommunityJoinRequestsRef.current(communityId, session);
  }, [
    params.session,
    reviewCommunityId,
    params.resetCommunityJoinRequests,
  ]);

  // Live (shared/liveQuery.ts): someone asking to join, or another host
  // answering, shows without a reload. The same read the load makes.
  const subject = params.session ? resolveAuthSubject(params.session as AuthSessionLike) : null;
  useLiveChange(
    params.session,
    "communityAdmin:listCommunityJoinRequests",
    subject && reviewCommunityId
      ? { authSubject: subject, communityId: reviewCommunityId, limit: 201, includeStatuses: ["pending"] }
      : null,
    () => {
      if (params.session && reviewCommunityId) void loadCommunityJoinRequestsRef.current(reviewCommunityId, params.session);
    },
  );
}

// Join requests are loaded only where they can be reviewed: on a surface
// that shows them, by someone who may, in a community that asks for approval.
export function joinRequestsCommunityToLoad<CommunityT extends CommunityLike>(params: {
  session: unknown | null;
  activeCommunityId: string | null;
  communities: CommunityT[];
  canReviewJoinRequests: boolean;
  activeCommunityMembersJoinReviewMode: CommunityMembersJoinReviewMode | null;
  shouldLoad?: boolean;
}): string | null {
  if (params.shouldLoad !== true) return null;
  const communityId = params.activeCommunityId;
  if (!params.session || !communityId || !params.canReviewJoinRequests) return null;
  const activeCommunityRecord = params.communities.find((community) => community.id === communityId) ?? null;
  const rawVisibility = String(activeCommunityRecord?.visibility ?? "").trim().toLowerCase();
  if (rawVisibility && !["published", "unlisted", "public", "private"].includes(rawVisibility)) return null;
  const visibility = toCanonicalCommunityVisibility(rawVisibility || "unlisted", "unlisted");
  if (visibility !== "published" && visibility !== "unlisted") return null;
  const joinReviewMode =
    params.activeCommunityMembersJoinReviewMode ??
    deriveCommunityMembersJoinReviewMode({ entry_policy: activeCommunityRecord?.entry_policy });
  return joinReviewMode === "free_approval" ? communityId : null;
}
