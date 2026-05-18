import { useEffect, useState } from "react";

type CommunityMemberLike = {
  user_id: string;
};

export function useWebCommunityPeopleController<
  TCommunityMember extends CommunityMemberLike,
  TCommunityJoinRequest,
>(params: {
  activeCommunityId: string | null;
}) {
  const [communityMembers, setCommunityMembers] = useState<TCommunityMember[]>([]);
  const [communityMemberCount, setCommunityMemberCount] = useState<number | null>(null);
  const [isLoadingCommunityMembers, setIsLoadingCommunityMembers] = useState(false);
  const [isLoadingMoreCommunityMembers, setIsLoadingMoreCommunityMembers] = useState(false);
  const [hasResolvedCommunityMembers, setHasResolvedCommunityMembers] = useState(false);
  const [communityMembersNextCursor, setCommunityMembersNextCursor] = useState<string | null>(null);
  const [communityMembersHasMore, setCommunityMembersHasMore] = useState(false);
  const [communityMembersLoadError, setCommunityMembersLoadError] = useState<string | null>(null);
  const [communityMembersPageIndex, setCommunityMembersPageIndex] = useState(0);
  const [communityJoinRequests, setCommunityJoinRequests] = useState<TCommunityJoinRequest[]>([]);
  const [isLoadingCommunityJoinRequests, setIsLoadingCommunityJoinRequests] = useState(false);
  const [communityJoinRequestsError, setCommunityJoinRequestsError] = useState<string | null>(null);
  const [decidingCommunityJoinRequestId, setDecidingCommunityJoinRequestId] = useState<string | null>(null);
  const [isJoinRequestsModalOpen, setIsJoinRequestsModalOpen] = useState(false);
  const [isSavingFreeAccessMode, setIsSavingFreeAccessMode] = useState(false);

  useEffect(() => {
    setCommunityMembers([]);
    setCommunityMemberCount(null);
    setIsLoadingCommunityMembers(false);
    setIsLoadingMoreCommunityMembers(false);
    setHasResolvedCommunityMembers(false);
    setCommunityMembersNextCursor(null);
    setCommunityMembersHasMore(false);
    setCommunityMembersLoadError(null);
    setCommunityMembersPageIndex(0);
    setCommunityJoinRequests([]);
    setCommunityJoinRequestsError(null);
    setIsLoadingCommunityJoinRequests(false);
    setDecidingCommunityJoinRequestId(null);
    setIsJoinRequestsModalOpen(false);
    setIsSavingFreeAccessMode(false);
  }, [params.activeCommunityId]);

  return {
    communityMembers,
    setCommunityMembers,
    communityMemberCount,
    setCommunityMemberCount,
    isLoadingCommunityMembers,
    setIsLoadingCommunityMembers,
    isLoadingMoreCommunityMembers,
    setIsLoadingMoreCommunityMembers,
    hasResolvedCommunityMembers,
    setHasResolvedCommunityMembers,
    communityMembersNextCursor,
    setCommunityMembersNextCursor,
    communityMembersHasMore,
    setCommunityMembersHasMore,
    communityMembersLoadError,
    setCommunityMembersLoadError,
    communityMembersPageIndex,
    setCommunityMembersPageIndex,
    communityJoinRequests,
    setCommunityJoinRequests,
    isLoadingCommunityJoinRequests,
    setIsLoadingCommunityJoinRequests,
    communityJoinRequestsError,
    setCommunityJoinRequestsError,
    decidingCommunityJoinRequestId,
    setDecidingCommunityJoinRequestId,
    isJoinRequestsModalOpen,
    setIsJoinRequestsModalOpen,
    isSavingFreeAccessMode,
    setIsSavingFreeAccessMode,
  };
}
