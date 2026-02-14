import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";

type UseWebDiscoverControllerArgs<DiscoverCommunityT> = {
  getSupabaseUrl: () => string | null;
  fetchWithSupabasePublic: (url: string, init?: RequestInit) => Promise<Response>;
  readSupabaseError: (response: Response) => Promise<string>;
  toCanonicalCommunityVisibility: (value: string | null | undefined, fallback: string) => string;
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
    const url = current.getSupabaseUrl();
    if (!url) return;
    current.setIsLoadingDiscover(true);
    current.setDiscoverError(null);
    try {
      const response = await current.fetchWithSupabasePublic(`${url}/functions/v1/public_discover?limit=60`, { method: "GET" });
      if (!response.ok) {
        const message = await current.readSupabaseError(response);
        throw new Error(message);
      }
      const payload = (await response.json()) as { ok?: boolean; communities?: DiscoverCommunityT[] };
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
