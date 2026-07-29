import { useEffect, useMemo, useState } from "react";

import type { UserProfile } from "../../../../shared/communityTypes";
import { useCommunityRailOrder } from "../../../../shared/useCommunityRailOrder";
import type { WebCommunityRecord } from "../webAppContracts";
import { COMMUNITY_RAIL_ORDER_STORAGE_KEY_PREFIX } from "../webAppRuntime";

export function useWebCommunityDirectoryState(params: {
  canonicalSessionUserId: string | null;
  initiallyLoading: boolean;
}) {
  const [isLoadingCommunities, setIsLoadingCommunities] = useState(
    params.initiallyLoading,
  );
  const [hasResolvedCommunities, setHasResolvedCommunities] =
    useState(false);
  const [communities, setCommunities] = useState<WebCommunityRecord[]>([]);
  const [communityRoleById, setCommunityRoleById] =
    useState<Record<string, string>>({});
  const [profilesByUserId, setProfilesByUserId] =
    useState<Record<string, UserProfile>>({});
  const railOrderStorageKey = useMemo(
    () =>
      `${COMMUNITY_RAIL_ORDER_STORAGE_KEY_PREFIX}:${
        params.canonicalSessionUserId ?? "local"
      }`,
    [params.canonicalSessionUserId],
  );
  const {
    orderedCommunities: railCommunities,
    moveCommunityToIndex: handleReorderCommunityRail,
  } = useCommunityRailOrder<WebCommunityRecord>({
    communities,
    storageKey: railOrderStorageKey,
  });

  useEffect(() => {
    setHasResolvedCommunities(false);
  }, [params.canonicalSessionUserId]);

  return {
    isLoadingCommunities,
    setIsLoadingCommunities,
    hasResolvedCommunities,
    setHasResolvedCommunities,
    communities,
    setCommunities,
    communityRoleById,
    setCommunityRoleById,
    profilesByUserId,
    setProfilesByUserId,
    railCommunities,
    handleReorderCommunityRail,
  };
}
