import { useEffect, useMemo } from "react";
import { toCanonicalCommunityVisibility } from "./communityVisibility";
import { deriveCommunityMembersJoinReviewMode, type CommunityMembersJoinReviewMode } from "./communityJoinPolicy";
import { resolveAuthSubject, type AuthSessionLike } from "./authSession";
import { coerceGatewayRows } from "./cloudGateway";
import { useLiveQuery } from "./liveQuery";

type CommunityLike = {
  id: string;
  entry_policy?: string | null;
  visibility?: string | null;
};

type LifecycleParams<
  SessionT,
  CommunityT extends CommunityLike,
  JoinRequestT = unknown,
> = {
  session: SessionT | null;
  activeCommunityId: string | null;
  communities: CommunityT[];
  canReviewJoinRequests: boolean;
  activeCommunityMembersJoinReviewMode: CommunityMembersJoinReviewMode | null;
  shouldLoad?: boolean;
  applyLiveCommunityJoinRequestsLoading: (communityId: string) => void;
  applyLiveCommunityJoinRequests: (communityId: string, rows: JoinRequestT[], session: SessionT) => void;
  applyLiveCommunityJoinRequestsError: (communityId: string, error: unknown) => void;
  resetCommunityJoinRequests: () => void;
};

export function useCommunityMembersReviewLifecycle<
  SessionT,
  CommunityT extends CommunityLike,
  JoinRequestT = unknown,
>(
  params: LifecycleParams<SessionT, CommunityT, JoinRequestT>,
) {
  useEffect(() => {
    params.resetCommunityJoinRequests();
  }, [params.activeCommunityId, params.resetCommunityJoinRequests]);

  // The community whose join requests this person may review here, or null.
  const reviewCommunityId = joinRequestsCommunityToLoad(params);

  // Single live stream (shared/liveQuery.ts): pending join requests draw
  // directly from the live subscription with 30s linger across switches — no
  // duplicate HTTP fetch on mount or on live changes.
  const subject = params.session ? resolveAuthSubject(params.session as AuthSessionLike) : null;
  const liveArgs = useMemo(
    () =>
      subject && reviewCommunityId
        ? { authSubject: subject, communityId: reviewCommunityId, limit: 201, includeStatuses: ["pending"] }
        : null,
    [reviewCommunityId, subject],
  );
  const liveJoinRequests = useLiveQuery<unknown>(
    params.session,
    "communityAdmin:listCommunityJoinRequests",
    liveArgs,
  );

  useEffect(() => {
    const session = params.session;
    if (!session || !reviewCommunityId || !liveArgs) {
      params.resetCommunityJoinRequests();
      return;
    }
    if (liveJoinRequests.error) {
      params.applyLiveCommunityJoinRequestsError(reviewCommunityId, liveJoinRequests.error);
      return;
    }
    if (liveJoinRequests.data !== undefined) {
      params.applyLiveCommunityJoinRequests(
        reviewCommunityId,
        coerceGatewayRows<JoinRequestT>(liveJoinRequests.data),
        session,
      );
      return;
    }
    params.applyLiveCommunityJoinRequestsLoading(reviewCommunityId);
  }, [
    liveArgs,
    liveJoinRequests.data,
    liveJoinRequests.error,
    params.applyLiveCommunityJoinRequests,
    params.applyLiveCommunityJoinRequestsError,
    params.applyLiveCommunityJoinRequestsLoading,
    params.resetCommunityJoinRequests,
    params.session,
    reviewCommunityId,
  ]);
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
