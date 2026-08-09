import { useState } from "react";

export function useWebPublicCommunityUiController<
  PublicCommunityT,
  PublicPlanT,
  PublicCommunityAccessT,
>() {
  const [publicCommunity, setPublicCommunity] = useState<PublicCommunityT | null>(null);
  const [publicCommunityPlans, setPublicCommunityPlans] = useState<PublicPlanT[]>([]);
  const [publicCommunityAccess, setPublicCommunityAccess] = useState<PublicCommunityAccessT | null>(null);
  const [publicCommunityAccessResolutionKey, setPublicCommunityAccessResolutionKey] =
    useState<string | null>(null);
  const [publicCommunityError, setPublicCommunityError] = useState<string | null>(null);
  const [isLoadingPublicCommunity, setIsLoadingPublicCommunity] = useState(false);
  const [isJoiningPublicCommunity, setIsJoiningPublicCommunity] = useState(false);
  const [isCancellingPublicCommunityJoinRequest, setIsCancellingPublicCommunityJoinRequest] = useState(false);
  const [publicJoinError, setPublicJoinError] = useState<string | null>(null);
  const [visitorGateNonce, setVisitorGateNonce] = useState(0);

  return {
    publicCommunity,
    setPublicCommunity,
    publicCommunityPlans,
    setPublicCommunityPlans,
    publicCommunityAccess,
    setPublicCommunityAccess,
    publicCommunityAccessResolutionKey,
    setPublicCommunityAccessResolutionKey,
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
    visitorGateNonce,
    setVisitorGateNonce,
  };
}
