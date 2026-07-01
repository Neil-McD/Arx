import { useEffect, useState } from "react";

export function useWebCommunityJoinRequestsController<TCommunityJoinRequest>(params: {
  activeCommunityId: string | null;
}) {
  const [communityJoinRequests, setCommunityJoinRequests] = useState<TCommunityJoinRequest[]>([]);
  const [isLoadingCommunityJoinRequests, setIsLoadingCommunityJoinRequests] = useState(false);
  const [communityJoinRequestsError, setCommunityJoinRequestsError] = useState<string | null>(null);
  const [decidingCommunityJoinRequestId, setDecidingCommunityJoinRequestId] = useState<string | null>(null);

  useEffect(() => {
    setCommunityJoinRequests([]);
    setCommunityJoinRequestsError(null);
    setIsLoadingCommunityJoinRequests(false);
    setDecidingCommunityJoinRequestId(null);
  }, [params.activeCommunityId]);

  return {
    communityJoinRequests,
    setCommunityJoinRequests,
    isLoadingCommunityJoinRequests,
    setIsLoadingCommunityJoinRequests,
    communityJoinRequestsError,
    setCommunityJoinRequestsError,
    decidingCommunityJoinRequestId,
    setDecidingCommunityJoinRequestId,
  };
}
