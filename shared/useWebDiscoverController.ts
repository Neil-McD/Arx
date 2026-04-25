import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { listCloudDiscoverCommunities } from "./cloudDiscoverGateway";
import { listCloudDiscoverMarketplaceCatalog } from "./cloudDiscoverMarketplaceGateway";
import type { DiscoverCommunitySnapshot } from "./communityTypes";
import type { DiscoverAppCatalogEntry } from "./discoverCatalog";
import type { DiscoverSkillCatalogEntry } from "./discoverSkillCatalog";
import { preloadImageUrls } from "./preloadImageUrls";

type UseWebDiscoverControllerArgs = {
  toCanonicalCommunityVisibility: (
    value: unknown,
    fallback?: "published" | "unlisted",
  ) => "published" | "unlisted";
  setIsLoadingDiscover: Dispatch<SetStateAction<boolean>>;
  setDiscoverError: Dispatch<SetStateAction<string | null>>;
  setDiscoverCommunities: Dispatch<SetStateAction<DiscoverCommunitySnapshot[]>>;
  setDiscoverApps: Dispatch<SetStateAction<DiscoverAppCatalogEntry[]>>;
  setDiscoverSkills: Dispatch<SetStateAction<DiscoverSkillCatalogEntry[]>>;
  setLastDiscoverLoadAttemptedAt: Dispatch<SetStateAction<number>>;
};

export function useWebDiscoverController(args: UseWebDiscoverControllerArgs) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const loadDiscoverCommunities = useCallback(async () => {
    const current = argsRef.current;
    current.setIsLoadingDiscover(true);
    current.setLastDiscoverLoadAttemptedAt(Date.now());
    current.setDiscoverError(null);
    try {
      const [communities, marketplaceCatalog] = await Promise.all([
        listCloudDiscoverCommunities({ limit: 60 }),
        listCloudDiscoverMarketplaceCatalog(),
      ]);
      await preloadImageUrls(
        communities.flatMap((community) => [community.avatar_url ?? null, community.banner_url ?? null]),
        { maxUrls: 16, timeoutMs: 1500 },
      );
      current.setDiscoverApps(marketplaceCatalog.apps);
      current.setDiscoverSkills(marketplaceCatalog.skills);
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
