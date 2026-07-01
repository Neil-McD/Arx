import { useCallback, useEffect, useRef, useState } from "react";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";
import type { SessionLike } from "./communityAdminCore";
import {
  type CloudCommunityDirectoryMemberRow,
  listCloudCommunityDirectoryPage,
} from "./cloudCommunityDirectoryGateway";

const COMMUNITY_DIRECTORY_PAGE_SIZE = 25;

export function useCommunityDirectoryController<SessionT extends SessionLike>(params: {
  activeCommunityId: string | null;
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
  const communityDirectoryLoadSeqRef = useRef(0);

  useEffect(() => {
    communityDirectoryLoadSeqRef.current += 1;
    setCommunityDirectoryMembers([]);
    setCommunityDirectoryMemberCount(null);
    setIsLoadingCommunityDirectoryMembers(false);
    setIsLoadingMoreCommunityDirectoryMembers(false);
    setCommunityDirectoryMembersNextCursor(null);
    setCommunityDirectoryMembersHasMore(false);
    setCommunityDirectoryMembersLoadError(null);
  }, [params.activeCommunityId]);

  const loadCommunityDirectoryMembers = useCallback(async (
    communityId: string,
    session: SessionT,
  ) => {
    const usableSession = await resolveUsableSession(session, params.ensureSession);
    if (!usableSession) return;
    const seq = (communityDirectoryLoadSeqRef.current += 1);
    setIsLoadingCommunityDirectoryMembers(true);
    setIsLoadingMoreCommunityDirectoryMembers(false);
    setCommunityDirectoryMembersLoadError(null);
    setCommunityDirectoryMembersNextCursor(null);
    setCommunityDirectoryMembersHasMore(false);
    try {
      const page = await listCloudCommunityDirectoryPage({
        session: usableSession,
        communityId,
        cursor: null,
        pageSize: COMMUNITY_DIRECTORY_PAGE_SIZE,
      });
      if (communityDirectoryLoadSeqRef.current !== seq) return;
      setCommunityDirectoryMembers(page.rows);
      setCommunityDirectoryMemberCount(
        typeof page.totalCount === "number" ? page.totalCount : page.rows.length,
      );
      setCommunityDirectoryMembersNextCursor(page.continueCursor);
      setCommunityDirectoryMembersHasMore(Boolean(page.continueCursor && !page.isDone));
    } catch (error) {
      if (communityDirectoryLoadSeqRef.current === seq) {
        setCommunityDirectoryMembers([]);
        setCommunityDirectoryMemberCount(null);
        setCommunityDirectoryMembersNextCursor(null);
        setCommunityDirectoryMembersHasMore(false);
        setCommunityDirectoryMembersLoadError(
          error instanceof Error ? error.message : "Failed to load members.",
        );
      }
    } finally {
      if (communityDirectoryLoadSeqRef.current === seq) {
        setIsLoadingCommunityDirectoryMembers(false);
      }
    }
  }, [params.ensureSession]);

  const loadMoreCommunityDirectoryMembers = useCallback(async (
    communityId: string,
    session: SessionT,
  ) => {
    const cursor = communityDirectoryMembersNextCursor;
    if (!cursor) return;
    const usableSession = await resolveUsableSession(session, params.ensureSession);
    if (!usableSession) return;
    const seq = communityDirectoryLoadSeqRef.current;
    setIsLoadingMoreCommunityDirectoryMembers(true);
    setCommunityDirectoryMembersLoadError(null);
    try {
      const page = await listCloudCommunityDirectoryPage({
        session: usableSession,
        communityId,
        cursor,
        pageSize: COMMUNITY_DIRECTORY_PAGE_SIZE,
      });
      if (communityDirectoryLoadSeqRef.current !== seq) return;
      setCommunityDirectoryMembers((previous) => {
        const seen = new Set(previous.map((row) => String(row.id ?? "")));
        const nextRows = page.rows.filter((row) => {
          const id = String(row.id ?? "");
          return id && !seen.has(id);
        });
        return nextRows.length > 0 ? [...previous, ...nextRows] : previous;
      });
      if (typeof page.totalCount === "number") {
        setCommunityDirectoryMemberCount(page.totalCount);
      }
      setCommunityDirectoryMembersNextCursor(page.continueCursor);
      setCommunityDirectoryMembersHasMore(Boolean(page.continueCursor && !page.isDone));
    } catch (error) {
      if (communityDirectoryLoadSeqRef.current === seq) {
        setCommunityDirectoryMembersLoadError(
          error instanceof Error ? error.message : "Failed to load more members.",
        );
      }
    } finally {
      if (communityDirectoryLoadSeqRef.current === seq) {
        setIsLoadingMoreCommunityDirectoryMembers(false);
      }
    }
  }, [
    communityDirectoryMembersNextCursor,
    params.ensureSession,
  ]);

  return {
    communityDirectoryMembers,
    communityDirectoryMemberCount,
    isLoadingCommunityDirectoryMembers,
    isLoadingMoreCommunityDirectoryMembers,
    communityDirectoryMembersHasMore,
    communityDirectoryMembersLoadError,
    loadCommunityDirectoryMembers,
    loadMoreCommunityDirectoryMembers,
  };
}
