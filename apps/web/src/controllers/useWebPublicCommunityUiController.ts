import { useState } from "react";
import type { PublicCommunityAccessResolution } from "../communityJoinPolicy";

export function useWebPublicCommunityUiController<
  PublicCommunityT,
  PublicPlanT,
  PublicCommunityAccessT,
>() {
  const [publicCommunity, setPublicCommunity] = useState<PublicCommunityT | null>(null);
  const [publicCommunityPlans, setPublicCommunityPlans] = useState<PublicPlanT[]>([]);
  const [publicCommunityAccess, setPublicCommunityAccess] = useState<PublicCommunityAccessT | null>(null);
  const [publicCommunityAccessResolution, setPublicCommunityAccessResolution] =
    useState<PublicCommunityAccessResolution>({
      status: "not_required",
      communitySlug: null,
      authSubject: null,
    });
  const [publicCommunityError, setPublicCommunityError] = useState<string | null>(null);
  const [isLoadingPublicCommunity, setIsLoadingPublicCommunity] = useState(false);
  const [isJoiningPublicCommunity, setIsJoiningPublicCommunity] = useState(false);
  const [isCancellingPublicCommunityJoinRequest, setIsCancellingPublicCommunityJoinRequest] = useState(false);
  const [publicJoinError, setPublicJoinError] = useState<string | null>(null);

  return {
    publicCommunity,
    setPublicCommunity,
    publicCommunityPlans,
    setPublicCommunityPlans,
    publicCommunityAccess,
    setPublicCommunityAccess,
    publicCommunityAccessResolution,
    setPublicCommunityAccessResolution,
    publicCommunityError,
    setPublicCommunityError,
    isLoadingPublicCommunity,
    setIsLoadingPublicCommunity,
    isJoiningPublicCommunity,
    setIsJoiningPublicCommunity,
    isCancellingPublicCommunityJoinRequest,
    setIsCancellingPublicCommunityJoinRequest,
    publicJoinError,
    setPublicJoinError,
  };
}
