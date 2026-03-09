import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { listCloudDiscoverCommunities } from "./cloudDiscoverGateway";
import type { DiscoverCommunitySnapshot } from "./communityTypes";

type UseWebDiscoverControllerArgs = {
  toCanonicalCommunityVisibility: (
    value: unknown,
    fallback?: "published" | "unlisted",
  ) => "published" | "unlisted";
  setIsLoadingDiscover: Dispatch<SetStateAction<boolean>>;
  setDiscoverError: Dispatch<SetStateAction<string | null>>;
  setDiscoverCommunities: Dispatch<SetStateAction<DiscoverCommunitySnapshot[]>>;
};

export function useWebDiscoverController(args: UseWebDiscoverControllerArgs) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const loadDiscoverCommunities = useCallback(async () => {
    const current = argsRef.current;
    current.setIsLoadingDiscover(true);
    current.setDiscoverError(null);
    try {
      const communities = await listCloudDiscoverCommunities({ limit: 60 });
      current.setDiscoverCommunities(
        communities.map((community) => ({
          ...community,
          visibility: current.toCanonicalCommunityVisibility(community.visibility, "unlisted"),
        })),
      );
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to load communities.";
      current.setDiscoverError(message);
    } finally {
      current.setIsLoadingDiscover(false);
    }
  }, []);

  return {
    loadDiscoverCommunities,
  };
}
