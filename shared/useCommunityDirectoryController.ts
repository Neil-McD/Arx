import { useCallback, useEffect, useRef, useState } from "react";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";
import type { SessionLike } from "./communityAdminCore";
import {
  type CloudCommunityDirectoryMemberRow,
  listCloudCommunityDirectoryWindow,
} from "./cloudCommunityDirectoryGateway";
import { COMMUNITY_DIRECTORY_DEFAULT_PAGE_SIZE } from "./communityDirectoryWindow";
import { reuseEquivalentValue } from "./reuseEquivalentValue";

export function useCommunityDirectoryController<SessionT extends SessionLike>(params: {
  activeCommunityId: string | null;
  presentationIdentity?: string | null;
  ensureSession?: EnsureSessionFn<SessionT>;
}) {
  const [communityDirectoryMembers, setCommunityDirectoryMembers] = useState<
    CloudCommunityDirectoryMemberRow[]
  >([]);
  const [communityDirectoryMemberCount, setCommunityDirectoryMemberCount] = useState<number | null>(null);
  const [presentationScope, setPresentationScope] = useState<string | null>(null);
  const communityDirectoryLoadSeqRef = useRef(0);
  const presentationScopeRef = useRef<string | null>(null);
  const communityDirectoryMembersRef = useRef<CloudCommunityDirectoryMemberRow[]>([]);
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
  }, [requestedPresentationScope]);

  const loadCommunityDirectoryMembers = useCallback(async (
    communityId: string,
    session: SessionT,
  ) => {
    const usableSession = await resolveUsableSession(session, params.ensureSession);
    if (!usableSession) return;
    const seq = (communityDirectoryLoadSeqRef.current += 1);
    const loadScope = `${presentationIdentity ?? "authenticated"}:${communityId}`;
    const isSameScopeRefresh = presentationScopeRef.current === loadScope;
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
      const stableRows = reuseEquivalentValue(communityDirectoryMembersRef.current, page.rows);
      communityDirectoryMembersRef.current = stableRows;
      setCommunityDirectoryMembers(stableRows);
      setCommunityDirectoryMemberCount(page.totalCount);
    } catch {
      // Best-effort mention/profile hydration. Keep the last scoped snapshot;
      // the live roster owns its own loading, retry, and pagination UI.
    }
  }, [params.ensureSession, presentationIdentity]);

  const isPresentationScoped = Boolean(
    requestedPresentationScope && presentationScope === requestedPresentationScope,
  );
  return {
    communityDirectoryMembers: isPresentationScoped ? communityDirectoryMembers : [],
    communityDirectoryMemberCount: isPresentationScoped ? communityDirectoryMemberCount : null,
    loadCommunityDirectoryMembers,
  };
}
