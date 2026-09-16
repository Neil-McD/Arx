import { useCallback, useEffect, useRef, type UIEvent } from "react";

const LOAD_MORE_SCROLL_THRESHOLD_PX = 96;

// Shared production member-list scrolling. Progress includes empty cursor pages.
export function useMemberScrollPagination(props: {
  membersHasMore?: boolean;
  isLoadingMembers?: boolean;
  isLoadingMoreMembers?: boolean;
  membersLoadError?: unknown;
  onLoadMoreMembers?: () => void;
}, progress: number | string) {
  const loadMoreRequestedRef = useRef(false);
  const membersViewportRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!props.isLoadingMoreMembers) loadMoreRequestedRef.current = false;
  }, [
    progress,
    props.isLoadingMoreMembers,
    props.membersHasMore,
    props.membersLoadError,
  ]);


  const requestLoadMoreMembers = useCallback((options?: { force?: boolean }) => {
    if (!props.membersHasMore || !membersViewportRef.current?.getClientRects().length) return;
    if (props.isLoadingMembers || props.isLoadingMoreMembers) return;
    if (!props.onLoadMoreMembers) return;
    if (props.membersLoadError && !options?.force) return;
    if (loadMoreRequestedRef.current) return;
    loadMoreRequestedRef.current = true;
    props.onLoadMoreMembers();
  }, [
    props.isLoadingMembers,
    props.isLoadingMoreMembers,
    props.membersHasMore,
    props.membersLoadError,
    props.onLoadMoreMembers,
  ]);

  const isMembersViewportNearBottom = useCallback(() => {
    const viewport = membersViewportRef.current;
    if (!viewport || !viewport.getClientRects().length || viewport.clientHeight <= 0) return false;
    const remainingScroll = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    return remainingScroll <= LOAD_MORE_SCROLL_THRESHOLD_PX;
  }, []);

  const requestVisibleMemberPage = useCallback(() => {
    if (!isMembersViewportNearBottom()) return;
    requestLoadMoreMembers();
  }, [isMembersViewportNearBottom, requestLoadMoreMembers]);

  const handleMembersScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const remainingScroll = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remainingScroll <= LOAD_MORE_SCROLL_THRESHOLD_PX) {
      requestLoadMoreMembers();
    }
  }, [requestLoadMoreMembers]);

  useEffect(() => {
    if (!props.membersHasMore || props.isLoadingMembers || props.isLoadingMoreMembers || props.membersLoadError) {
      return;
    }
    const frame = requestAnimationFrame(requestVisibleMemberPage);
    return () => cancelAnimationFrame(frame);
  }, [
    progress,
    props.isLoadingMembers,
    props.isLoadingMoreMembers,
    props.membersHasMore,
    props.membersLoadError,
    requestVisibleMemberPage,
  ]);

  useEffect(() => {
    const viewport = membersViewportRef.current;
    const sentinel = loadMoreSentinelRef.current;
    if (
      !viewport ||
      !sentinel ||
      !props.membersHasMore ||
      props.isLoadingMembers ||
      props.isLoadingMoreMembers ||
      props.membersLoadError ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) requestLoadMoreMembers();
      },
      {
        root: viewport,
        rootMargin: `${LOAD_MORE_SCROLL_THRESHOLD_PX}px 0px`,
        threshold: 0,
      },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    progress,
    props.isLoadingMembers,
    props.isLoadingMoreMembers,
    props.membersHasMore,
    props.membersLoadError,
    requestLoadMoreMembers,
  ]);
  return { membersViewportRef, loadMoreSentinelRef, handleMembersScroll, requestLoadMoreMembers };
}
