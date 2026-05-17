import { useEffect, useMemo, useState } from "react";

type CommunityMemberLike = {
  user_id: string;
  role?: string | null;
  price_point_id?: string | null;
};

export function useWebCommunityPeopleController<
  TCommunityMember extends CommunityMemberLike,
  TCommunityJoinRequest,
>(params: {
  activeCommunityId: string | null;
  activeCommunityOwnerId: string | null;
}) {
  const [communityMembers, setCommunityMembers] = useState<TCommunityMember[]>([]);
  const [isLoadingCommunityMembers, setIsLoadingCommunityMembers] = useState(false);
  const [hasResolvedCommunityMembers, setHasResolvedCommunityMembers] = useState(false);
  const [communityMembersRoleFilter, setCommunityMembersRoleFilter] = useState<string>("all");
  const [communityMembersPlanFilter, setCommunityMembersPlanFilter] = useState<string>("all");
  const [communityMembersPageIndex, setCommunityMembersPageIndex] = useState(0);
  const [communityJoinRequests, setCommunityJoinRequests] = useState<TCommunityJoinRequest[]>([]);
  const [isLoadingCommunityJoinRequests, setIsLoadingCommunityJoinRequests] = useState(false);
  const [communityJoinRequestsError, setCommunityJoinRequestsError] = useState<string | null>(null);
  const [decidingCommunityJoinRequestId, setDecidingCommunityJoinRequestId] = useState<string | null>(null);
  const [isJoinRequestsModalOpen, setIsJoinRequestsModalOpen] = useState(false);
  const [isSavingFreeAccessMode, setIsSavingFreeAccessMode] = useState(false);

  useEffect(() => {
    setCommunityMembers([]);
    setIsLoadingCommunityMembers(false);
    setHasResolvedCommunityMembers(false);
    setCommunityMembersRoleFilter("all");
    setCommunityMembersPlanFilter("all");
    setCommunityMembersPageIndex(0);
    setCommunityJoinRequests([]);
    setCommunityJoinRequestsError(null);
    setIsLoadingCommunityJoinRequests(false);
    setDecidingCommunityJoinRequestId(null);
    setIsJoinRequestsModalOpen(false);
    setIsSavingFreeAccessMode(false);
  }, [params.activeCommunityId]);

  useEffect(() => {
    setCommunityMembersPageIndex(0);
  }, [communityMembersPlanFilter, communityMembersRoleFilter]);

  const filteredCommunityMembers = useMemo(() => {
    const roleFilter = (communityMembersRoleFilter ?? "all").trim().toLowerCase();
    const planFilter = (communityMembersPlanFilter ?? "all").trim().toLowerCase();
    const ownerId = params.activeCommunityOwnerId ?? null;
    return communityMembers.filter((member) => {
      const memberIsOwner = Boolean(ownerId && member.user_id === ownerId);
      const effectiveRole = memberIsOwner ? "owner" : String(member.role ?? "").trim().toLowerCase();
      if (roleFilter !== "all" && effectiveRole !== roleFilter) return false;
      if (planFilter === "all") return true;
      return String(member.price_point_id ?? "").trim() === planFilter;
    });
  }, [
    communityMembers,
    communityMembersPlanFilter,
    communityMembersRoleFilter,
    params.activeCommunityOwnerId,
  ]);

  return {
    communityMembers,
    setCommunityMembers,
    isLoadingCommunityMembers,
    setIsLoadingCommunityMembers,
    hasResolvedCommunityMembers,
    setHasResolvedCommunityMembers,
    communityMembersRoleFilter,
    setCommunityMembersRoleFilter,
    communityMembersPlanFilter,
    setCommunityMembersPlanFilter,
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
    filteredCommunityMembers,
  };
}
