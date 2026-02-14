import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { getErrorMessage } from "./pay_first";

type UseDesktopDiscoverControllerArgs<DiscoverCommunityT> = {
  isDiscoverActive: boolean;
  getSupabaseUrl: () => string | null;
  fetchWithSupabasePublic: (url: string, init?: RequestInit) => Promise<Response>;
  readSupabaseError: (response: Response) => Promise<string>;
  discoverLimit?: number;
  loadFailureMessage?: string;
};

type DiscoverCommunitySearchLike = {
  name?: string | null;
  slug?: string | null;
  description?: string | null;
};

export function useDesktopDiscoverController<
  DiscoverCommunityT extends DiscoverCommunitySearchLike,
>(args: UseDesktopDiscoverControllerArgs<DiscoverCommunityT>): {
  discoverCommunities: DiscoverCommunityT[];
  discoverQuery: string;
  setDiscoverQuery: Dispatch<SetStateAction<string>>;
  discoverError: string | null;
  setDiscoverError: Dispatch<SetStateAction<string | null>>;
  isLoadingDiscover: boolean;
  loadDiscoverCommunities: () => Promise<void>;
  filteredDiscoverCommunities: DiscoverCommunityT[];
} {
  const {
    isDiscoverActive,
    getSupabaseUrl,
    fetchWithSupabasePublic,
    readSupabaseError,
    discoverLimit = 60,
    loadFailureMessage = "Failed to load communities.",
  } = args;

  const [discoverCommunities, setDiscoverCommunities] = useState<DiscoverCommunityT[]>([]);
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [isLoadingDiscover, setIsLoadingDiscover] = useState(false);

  const loadDiscoverCommunities = useCallback(async () => {
    const url = getSupabaseUrl();
    if (!url) return;
    setIsLoadingDiscover(true);
    setDiscoverError(null);
    try {
      const limit = Math.max(1, Math.min(200, Math.floor(discoverLimit)));
      const response = await fetchWithSupabasePublic(
        `${url}/functions/v1/public_discover?limit=${limit}`,
        { method: "GET" },
      );
      if (!response.ok) {
        const message = await readSupabaseError(response);
        throw new Error(message);
      }
      const payload = (await response.json()) as { ok?: boolean; communities?: DiscoverCommunityT[] };
      setDiscoverCommunities(Array.isArray(payload?.communities) ? payload.communities : []);
    } catch (error) {
      setDiscoverError(getErrorMessage(error, loadFailureMessage));
    } finally {
      setIsLoadingDiscover(false);
    }
  }, [discoverLimit, fetchWithSupabasePublic, getSupabaseUrl, loadFailureMessage, readSupabaseError]);

  useEffect(() => {
    if (!isDiscoverActive) return;
    void loadDiscoverCommunities();
  }, [isDiscoverActive, loadDiscoverCommunities]);

  const filteredDiscoverCommunities = useMemo(() => {
    const query = discoverQuery.trim().toLowerCase();
    if (!query) return discoverCommunities;
    return discoverCommunities.filter((community) => {
      const haystack = `${community.name ?? ""}\n${community.slug ?? ""}\n${community.description ?? ""}`
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [discoverCommunities, discoverQuery]);

  return {
    discoverCommunities,
    discoverQuery,
    setDiscoverQuery,
    discoverError,
    setDiscoverError,
    isLoadingDiscover,
    loadDiscoverCommunities,
    filteredDiscoverCommunities,
  };
}
