import { useCallback, useEffect, useRef, useState } from "react";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";
import type { SessionLike } from "./communityAdminCore";
import {
  type CloudCommunityDirectoryMemberRow,
  listCloudCommunityDirectoryPage,
  listCloudCommunityDirectoryWindow,
} from "./cloudCommunityDirectoryGateway";
import { COMMUNITY_DIRECTORY_DEFAULT_PAGE_SIZE } from "./communityDirectoryWindow";

function dedupeCommunityDirectoryRows(
  rows: CloudCommunityDirectoryMemberRow[],
): CloudCommunityDirectoryMemberRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const id = String(row.id ?? "").trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function useCommunityDirectoryController<SessionT extends SessionLike>(params: {
  activeCommunityId: string | null;
  presentationIdentity?: string | null;
  ensureSession?: EnsureSessionFn<SessionT>;
}) {
  const [communityDirectoryMembers, setCommunityDirectoryMembers] = useState<
    CloudCommunityDirectoryMemberRow[]
  >([]);
  const [communityDirectoryMemberCount, setCommunityDirectoryMemberCount] = useState<number | null>(null);
  const [isLoadingCommunityDirectoryMembers, setIsLoadingCommunityDirectoryMembers] = useState(false);
  const [isLoadingMoreCommunityDirectoryMembers, setIsLoadingMoreCommunityDirectoryMembers] = useState(false);
  const [communityDirectoryMembersNextCursor, setCommunityDirectoryMembersNextCursor] =
    useState<string | null>(null);
  const [communityDirectoryMembersHasMore, setCommunityDirectoryMembersHasMore] = useState(false);
  const [communityDirectoryMembersLoadError, setCommunityDirectoryMembersLoadError] =
    useState<string | null>(null);
  const [presentationScope, setPresentationScope] = useState<string | null>(null);
  const [attemptedPresentationScope, setAttemptedPresentationScope] = useState<string | null>(null);
  const communityDirectoryLoadSeqRef = useRef(0);
  const presentationScopeRef = useRef<string | null>(null);
  const communityDirectoryMembersRef = useRef<CloudCommunityDirectoryMemberRow[]>([]);
  const communityDirectoryRefreshSeqRef = useRef<number | null>(null);
  const communityDirectoryLoadMoreCursorRef = useRef<string | null>(null);
  const communityDirectoryNextCursorRef = useRef<string | null>(null);
  communityDirectoryMembersRef.current = communityDirectoryMembers;

  const requestedCommunityId = String(params.activeCommunityId ?? "").trim() || null;
  const presentationIdentity = params.presentationIdentity === undefined
    ? "authenticated"
    : String(params.presentationIdentity ?? "").trim() || null;
  const requestedPresentationScope = requestedCommunityId && presentationIdentity
    ? `${presentationIdentity}:${requestedCommunityId}`
    : null;

  useEffect(() => {
    communityDirectoryLoadSeqRef.current += 1;
    communityDirectoryRefreshSeqRef.current = null;
    communityDirectoryLoadMoreCursorRef.current = null;
    communityDirectoryNextCursorRef.current = null;
    setIsLoadingCommunityDirectoryMembers(false);
    setIsLoadingMoreCommunityDirectoryMembers(false);
    setCommunityDirectoryMembersNextCursor(null);
    setCommunityDirectoryMembersHasMore(false);
    setCommunityDirectoryMembersLoadError(null);
  }, [requestedPresentationScope]);

  const loadCommunityDirectoryMembers = useCallback(async (
    communityId: string,
    session: SessionT,
  ) => {
    const usableSession = await resolveUsableSession(session, params.ensureSession);
    if (!usableSession) return;
    const seq = (communityDirectoryLoadSeqRef.current += 1);
    communityDirectoryRefreshSeqRef.current = seq;
    const loadScope = `${presentationIdentity ?? "authenticated"}:${communityId}`;
    const isSameScopeRefresh = presentationScopeRef.current === loadScope;
    setAttemptedPresentationScope(loadScope);
    setIsLoadingCommunityDirectoryMembers(true);
    setIsLoadingMoreCommunityDirectoryMembers(false);
    setCommunityDirectoryMembersLoadError(null);
    if (!isSameScopeRefresh) {
      communityDirectoryNextCursorRef.current = null;
      setCommunityDirectoryMembersNextCursor(null);
      setCommunityDirectoryMembersHasMore(false);
    }
    try {
      const targetRowCount = isSameScopeRefresh
        ? Math.max(
            COMMUNITY_DIRECTORY_DEFAULT_PAGE_SIZE,
            communityDirectoryMembersRef.current.length,
          )
        : COMMUNITY_DIRECTORY_DEFAULT_PAGE_SIZE;
      const page = await listCloudCommunityDirectoryWindow({
        session: usableSession,
        communityId,
        targetRowCount,
        isCurrent: () => communityDirectoryLoadSeqRef.current === seq,
      });
      if (!page || communityDirectoryLoadSeqRef.current !== seq) return;
      presentationScopeRef.current = loadScope;
      setPresentationScope(loadScope);
      const nextMembers = dedupeCommunityDirectoryRows(page.rows);
      communityDirectoryMembersRef.current = nextMembers;
      setCommunityDirectoryMembers(nextMembers);
      setCommunityDirectoryMemberCount(page.totalCount);
      communityDirectoryNextCursorRef.current = page.continueCursor;
      setCommunityDirectoryMembersNextCursor(page.continueCursor);
      setCommunityDirectoryMembersHasMore(Boolean(page.continueCursor && !page.isDone));
    } catch (error) {
      if (communityDirectoryLoadSeqRef.current === seq) {
        setCommunityDirectoryMembersLoadError(
          error instanceof Error ? error.message : "Failed to load members.",
        );
      }
    } finally {
      if (communityDirectoryLoadSeqRef.current === seq) {
        setIsLoadingCommunityDirectoryMembers(false);
      }
      if (communityDirectoryRefreshSeqRef.current === seq) {
        communityDirectoryRefreshSeqRef.current = null;
      }
    }
  }, [params.ensureSession, presentationIdentity]);

  const loadMoreCommunityDirectoryMembers = useCallback(async (
    communityId: string,
    session: SessionT,
  ) => {
    const loadScope = `${presentationIdentity ?? "authenticated"}:${communityId}`;
    if (presentationScopeRef.current !== loadScope) return;
    if (communityDirectoryRefreshSeqRef.current !== null) return;
    const cursor = communityDirectoryMembersNextCursor;
    if (!cursor || communityDirectoryLoadMoreCursorRef.current === cursor) return;
    const seq = communityDirectoryLoadSeqRef.current;
    const usableSession = await resolveUsableSession(session, params.ensureSession);
    if (!usableSession) return;
    if (
      communityDirectoryLoadSeqRef.current !== seq ||
      communityDirectoryRefreshSeqRef.current !== null ||
      communityDirectoryLoadMoreCursorRef.current === cursor ||
      communityDirectoryNextCursorRef.current !== cursor
    ) {
      return;
    }
    communityDirectoryLoadMoreCursorRef.current = cursor;
    setIsLoadingMoreCommunityDirectoryMembers(true);
    setCommunityDirectoryMembersLoadError(null);
    try {
      const page = await listCloudCommunityDirectoryPage({
        session: usableSession,
        communityId,
        cursor,
        pageSize: COMMUNITY_DIRECTORY_DEFAULT_PAGE_SIZE,
      });
      if (communityDirectoryLoadSeqRef.current !== seq) return;
      setCommunityDirectoryMembers((previous) => {
        const seen = new Set(previous.map((row) => String(row.id ?? "")));
        const nextRows = page.rows.filter((row) => {
          const id = String(row.id ?? "");
          return id && !seen.has(id);
        });
        const next = nextRows.length > 0
          ? dedupeCommunityDirectoryRows([...previous, ...nextRows])
          : previous;
        communityDirectoryMembersRef.current = next;
        return next;
      });
      if (typeof page.totalCount === "number") {
        setCommunityDirectoryMemberCount(page.totalCount);
      }
      communityDirectoryNextCursorRef.current = page.continueCursor;
      setCommunityDirectoryMembersNextCursor(page.continueCursor);
      setCommunityDirectoryMembersHasMore(Boolean(page.continueCursor && !page.isDone));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load more members.";
      if (message.includes("community_directory_cursor_invalid")) {
        try {
          const page = await listCloudCommunityDirectoryWindow({
            session: usableSession,
            communityId,
            targetRowCount: Math.max(
              COMMUNITY_DIRECTORY_DEFAULT_PAGE_SIZE,
              communityDirectoryMembersRef.current.length,
            ),
            isCurrent: () => communityDirectoryLoadSeqRef.current === seq,
          });
          if (!page || communityDirectoryLoadSeqRef.current !== seq) return;
          const nextMembers = dedupeCommunityDirectoryRows(page.rows);
          communityDirectoryMembersRef.current = nextMembers;
          setCommunityDirectoryMembers(nextMembers);
          setCommunityDirectoryMemberCount(page.totalCount);
          communityDirectoryNextCursorRef.current = page.continueCursor;
          setCommunityDirectoryMembersNextCursor(page.continueCursor);
          setCommunityDirectoryMembersHasMore(Boolean(page.continueCursor && !page.isDone));
          return;
        } catch (refreshError) {
          if (communityDirectoryLoadSeqRef.current !== seq) return;
          setCommunityDirectoryMembersLoadError(
            refreshError instanceof Error
              ? refreshError.message
              : "Failed to refresh members.",
          );
          return;
        }
      }
      if (communityDirectoryLoadSeqRef.current === seq) {
        setCommunityDirectoryMembersLoadError(message);
      }
    } finally {
      if (communityDirectoryLoadSeqRef.current === seq) {
        setIsLoadingMoreCommunityDirectoryMembers(false);
      }
      if (communityDirectoryLoadMoreCursorRef.current === cursor) {
        communityDirectoryLoadMoreCursorRef.current = null;
      }
    }
  }, [
    communityDirectoryMembersNextCursor,
    params.ensureSession,
    presentationIdentity,
  ]);

  const isPresentationScoped = Boolean(
    requestedPresentationScope && presentationScope === requestedPresentationScope,
  );
  const presentationLoadError = attemptedPresentationScope === requestedPresentationScope
    ? communityDirectoryMembersLoadError
    : null;

  return {
    communityDirectoryMembers: isPresentationScoped ? communityDirectoryMembers : [],
    communityDirectoryMemberCount: isPresentationScoped ? communityDirectoryMemberCount : null,
    hasResolvedCommunityDirectoryMembers: isPresentationScoped,
    isLoadingCommunityDirectoryMembers:
      Boolean(requestedPresentationScope) &&
      (isLoadingCommunityDirectoryMembers || (!isPresentationScoped && !presentationLoadError)),
    isLoadingMoreCommunityDirectoryMembers:
      isPresentationScoped && isLoadingMoreCommunityDirectoryMembers,
    communityDirectoryMembersHasMore:
      isPresentationScoped && communityDirectoryMembersHasMore,
    communityDirectoryMembersLoadError:
      presentationLoadError,
    loadCommunityDirectoryMembers,
    loadMoreCommunityDirectoryMembers,
  };
}
