import { useCallback, useRef, useState } from "react";
import { listCloudDiscoverCommunities } from "./cloudDiscoverGateway";
import type { DiscoverCommunitySnapshot } from "./communityTypes";
import { preloadImageUrls } from "./preloadImageUrls";

type UseWebDiscoverControllerArgs = {
  toCanonicalCommunityVisibility: (
    value: unknown,
    fallback?: "published" | "unlisted",
  ) => "published" | "unlisted";
};

export function useWebDiscoverController(args: UseWebDiscoverControllerArgs) {
  const [discoverCommunities, setDiscoverCommunities] =
    useState<DiscoverCommunitySnapshot[]>([]);
  const [isLoadingDiscover, setIsLoadingDiscover] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [lastDiscoverLoadAttemptedAt, setLastDiscoverLoadAttemptedAt] =
    useState(0);
  const argsRef = useRef(args);
  argsRef.current = args;

  const loadDiscoverCommunities = useCallback(async () => {
    const current = argsRef.current;
    setIsLoadingDiscover(true);
    setLastDiscoverLoadAttemptedAt(Date.now());
    setDiscoverError(null);
    try {
      const communities = await listCloudDiscoverCommunities({ limit: 60 });
      await preloadImageUrls(
        communities.flatMap((community) => [community.avatar_url ?? null, community.banner_url ?? null]),
        { maxUrls: 16, timeoutMs: 1500 },
      );
      setDiscoverCommunities(
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
      setDiscoverError(message);
    } finally {
      setIsLoadingDiscover(false);
    }
  }, []);

  return {
    discoverCommunities,
    setDiscoverCommunities,
    isLoadingDiscover,
    discoverError,
    setDiscoverError,
    lastDiscoverLoadAttemptedAt,
    loadDiscoverCommunities,
  };
}
