import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { listCloudDiscoverCommunities } from "./cloudDiscoverGateway";

type UseWebDiscoverControllerArgs<DiscoverCommunityT> = {
  toCanonicalCommunityVisibility: (
    value: unknown,
    fallback?: "published" | "unlisted",
  ) => "published" | "unlisted";
  setIsLoadingDiscover: Dispatch<SetStateAction<boolean>>;
  setDiscoverError: Dispatch<SetStateAction<string | null>>;
  setDiscoverCommunities: Dispatch<SetStateAction<DiscoverCommunityT[]>>;
};

export function useWebDiscoverController<DiscoverCommunityT extends { visibility: string }>(
  args: UseWebDiscoverControllerArgs<DiscoverCommunityT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const loadDiscoverCommunities = useCallback(async () => {
    const current = argsRef.current;
    current.setIsLoadingDiscover(true);
    current.setDiscoverError(null);
    try {
      const payload = {
        ok: true,
        communities: await listCloudDiscoverCommunities<DiscoverCommunityT>({ limit: 60 }),
      } as { ok?: boolean; communities?: DiscoverCommunityT[] };
      current.setDiscoverCommunities(
        Array.isArray(payload?.communities)
          ? payload.communities.map((community) => ({
              ...community,
              visibility: current.toCanonicalCommunityVisibility(community.visibility, "unlisted"),
            }))
          : [],
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
