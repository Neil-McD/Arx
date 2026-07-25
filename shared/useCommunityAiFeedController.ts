import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  hideCloudCommunityAiFeedPost,
  listCloudCommunityAiFeedPosts,
} from "./cloudCommunityAiFeedGateway";
import type { CommunityAiFeedPost } from "./communityTypes";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";

type CommunityAiFeedState = {
  posts: CommunityAiFeedPost[];
  isLoading: boolean;
  error: string | null;
};

type UseCommunityAiFeedControllerArgs<SessionT> = {
  activeCommunityId: string | null;
  isAiFeedTabActive: boolean;
  viewerCacheKey: string;
  session: SessionT | null;
  ensureSession?: EnsureSessionFn<SessionT>;
};

const EMPTY_FEED_STATE: CommunityAiFeedState = {
  posts: [],
  isLoading: false,
  error: null,
};

type FeedRequestSnapshot = {
  generation: number;
  viewerCacheKey: string;
  communityId: string;
};

export function useCommunityAiFeedController<SessionT>(
  args: UseCommunityAiFeedControllerArgs<SessionT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const [communityFeedByCommunityId, setCommunityFeedByCommunityId] = useState<
    Record<string, CommunityAiFeedState>
  >({});
  const [moderatingPostId, setModeratingPostId] = useState<string | null>(null);
  const viewerGenerationRef = useRef(0);

  const isRequestSnapshotStale = useCallback((snapshot: FeedRequestSnapshot): boolean => {
    return (
      viewerGenerationRef.current !== snapshot.generation
      || argsRef.current.viewerCacheKey !== snapshot.viewerCacheKey
      || argsRef.current.activeCommunityId !== snapshot.communityId
    );
  }, []);

  const loadCommunityAiFeed = useCallback(async (communityId: string) => {
    const current = argsRef.current;
    const requestSnapshot: FeedRequestSnapshot = {
      generation: viewerGenerationRef.current,
      viewerCacheKey: current.viewerCacheKey,
      communityId,
    };
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (isRequestSnapshotStale(requestSnapshot)) return;
    if (!session) {
      setCommunityFeedByCommunityId((prev) => ({
        ...prev,
        [communityId]: {
          posts: [],
          isLoading: false,
          error: "Sign in to view the AI feed.",
        },
      }));
      return;
    }

    setCommunityFeedByCommunityId((prev) => ({
      ...prev,
      [communityId]: {
        posts: prev[communityId]?.posts ?? [],
        isLoading: true,
        error: null,
      },
    }));

    try {
      const posts = await listCloudCommunityAiFeedPosts<SessionT, CommunityAiFeedPost>({
        session,
        communityId,
        limit: 100,
      });
      if (isRequestSnapshotStale(requestSnapshot)) return;
      setCommunityFeedByCommunityId((prev) => ({
        ...prev,
        [communityId]: {
          posts,
          isLoading: false,
          error: null,
        },
      }));
    } catch (error) {
      if (isRequestSnapshotStale(requestSnapshot)) return;
      setCommunityFeedByCommunityId((prev) => ({
        ...prev,
        [communityId]: {
          posts: prev[communityId]?.posts ?? [],
          isLoading: false,
          error: error instanceof Error ? error.message : "Failed to load AI feed.",
        },
      }));
    }
  }, [isRequestSnapshotStale]);

  const hidePost = useCallback(async (postId: string) => {
    const current = argsRef.current;
    const activeCommunityId = current.activeCommunityId;
    if (!activeCommunityId) return;
    const requestSnapshot: FeedRequestSnapshot = {
      generation: viewerGenerationRef.current,
      viewerCacheKey: current.viewerCacheKey,
      communityId: activeCommunityId,
    };

    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (isRequestSnapshotStale(requestSnapshot)) return;
    if (!session) return;

    setModeratingPostId(postId);
    try {
      await hideCloudCommunityAiFeedPost({
        session,
        postId,
      });
      if (isRequestSnapshotStale(requestSnapshot)) return;
      await loadCommunityAiFeed(activeCommunityId);
    } catch (error) {
      if (isRequestSnapshotStale(requestSnapshot)) return;
      setCommunityFeedByCommunityId((prev) => ({
        ...prev,
        [activeCommunityId]: {
          posts: prev[activeCommunityId]?.posts ?? [],
          isLoading: false,
          error: error instanceof Error ? error.message : "Failed to moderate AI feed.",
        },
      }));
    } finally {
      if (!isRequestSnapshotStale(requestSnapshot)) {
        setModeratingPostId(null);
      }
    }
  }, [isRequestSnapshotStale, loadCommunityAiFeed]);

  const activeCommunityFeedState = useMemo(() => {
    if (!args.activeCommunityId) {
      return EMPTY_FEED_STATE;
    }
    return (
      communityFeedByCommunityId[args.activeCommunityId] ?? {
        ...EMPTY_FEED_STATE,
        isLoading: args.isAiFeedTabActive,
      }
    );
  }, [args.activeCommunityId, args.isAiFeedTabActive, communityFeedByCommunityId]);

  const retry = useCallback(() => {
    const activeCommunityId = argsRef.current.activeCommunityId;
    if (!activeCommunityId) return;
    void loadCommunityAiFeed(activeCommunityId);
  }, [loadCommunityAiFeed]);

  useEffect(() => {
    viewerGenerationRef.current += 1;
    setCommunityFeedByCommunityId({});
    setModeratingPostId(null);
  }, [args.viewerCacheKey]);

  useEffect(() => {
    if (!args.activeCommunityId) return;
    if (!args.isAiFeedTabActive) return;
    void loadCommunityAiFeed(args.activeCommunityId);
  }, [
    args.activeCommunityId,
    args.isAiFeedTabActive,
    args.viewerCacheKey,
    loadCommunityAiFeed,
  ]);

  return {
    activeCommunityFeedState,
    moderatingPostId,
    hidePost,
    retry,
  };
}
