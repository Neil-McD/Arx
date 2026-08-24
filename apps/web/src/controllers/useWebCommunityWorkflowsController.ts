import { useCallback, useEffect, useRef, useState } from "react";

import type { AuthSession } from "../auth";
import type { AppPage, CommunityTab } from "../../../../shared/appShellNavigation";
import {
  createCloudCommunityMemberWorkflowLiveClient,
  createCloudCommunityMemberWorkflowStage,
  deleteCloudCommunityMemberWorkflowStage,
  fetchCloudCommunityMemberWorkflowBoardPage,
  subscribeCloudCommunityMemberWorkflowBoardProjection,
  updateCloudCommunityMemberWorkflowStage,
  type CloudCommunityMemberWorkflowBoard,
  type CloudCommunityMemberWorkflowBoardPage,
  type CloudCommunityMemberWorkflowMember,
} from "../../../../shared/cloudCommunityMemberWorkflowsGateway";

type EnsureAuthSession = (
  session?: AuthSession | null,
  source?: string,
  options?: { forceRefresh?: boolean },
) => Promise<AuthSession | null>;

function workflowErrorMessage(error: unknown): string {
  const message = String(
    error instanceof Error ? error.message : (error ?? ""),
  ).toLowerCase();
  if (message.includes("revision_conflict")) {
    return "This workflow changed in another session. Reload it and try again.";
  }
  if (message.includes("stage_has_members")) {
    return "Move members out of this stage before deleting it.";
  }
  if (message.includes("stage_count_invalid")) {
    return "A workflow needs at least one stage.";
  }
  if (message.includes("community_forbidden")) {
    return "You no longer have permission to manage this workflow.";
  }
  return "Something went wrong. Nothing was changed.";
}

async function fetchWorkflowBoardDepth(params: {
  communityId: string;
  depth: number;
  session: AuthSession;
}): Promise<CloudCommunityMemberWorkflowBoardPage> {
  const members: CloudCommunityMemberWorkflowMember[] = [];
  const seenMembershipIds = new Set<string>();
  let cursor: string | null = null;
  let latestPage: CloudCommunityMemberWorkflowBoardPage | null = null;

  for (let pageIndex = 0; pageIndex < params.depth; pageIndex += 1) {
    const page: CloudCommunityMemberWorkflowBoardPage =
      await fetchCloudCommunityMemberWorkflowBoardPage({
        session: params.session,
        communityId: params.communityId,
        cursor,
      });
    latestPage = page;
    for (const member of page.members) {
      if (seenMembershipIds.has(member.membership_id)) continue;
      seenMembershipIds.add(member.membership_id);
      members.push(member);
    }
    cursor = page.continueCursor;
    if (page.isDone || !cursor) break;
  }

  return {
    board: latestPage?.board ?? null,
    members,
    totalCount: latestPage?.totalCount ?? null,
    continueCursor: latestPage?.continueCursor ?? null,
    isDone: latestPage?.isDone ?? true,
  };
}

export function createWorkflowBoardReconciliationQueue(params: {
  isActive: () => boolean;
  reconcile: () => Promise<void>;
}) {
  let cancelled = false;
  let refreshPending = false;
  let activeRefresh: Promise<void> | null = null;

  const request = (): Promise<void> => {
    if (cancelled || !params.isActive()) return Promise.resolve();
    refreshPending = true;
    if (activeRefresh) return activeRefresh;
    activeRefresh = (async () => {
      while (refreshPending && !cancelled && params.isActive()) {
        refreshPending = false;
        await params.reconcile();
      }
    })().finally(() => {
      activeRefresh = null;
    });
    return activeRefresh;
  };

  return {
    request,
    cancel: () => {
      cancelled = true;
      refreshPending = false;
    },
  };
}

export function useWebCommunityWorkflowsController(params: {
  activeCommunityId: string | null;
  activePage: AppPage;
  canManageMembers: boolean;
  communityTab: CommunityTab;
  ensureSession: EnsureAuthSession;
  session: AuthSession | null;
}) {
  const [board, setBoard] = useState<CloudCommunityMemberWorkflowBoard | null>(null);
  const [members, setMembers] = useState<CloudCommunityMemberWorkflowMember[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const requestGenerationRef = useRef(0);
  const loadedPageDepthRef = useRef(1);
  const requestBoardReconciliationRef = useRef<(() => Promise<void>) | null>(
    null,
  );

  useEffect(() => {
    requestGenerationRef.current += 1;
    loadedPageDepthRef.current = 1;
    requestBoardReconciliationRef.current = null;
    setBoard(null);
    setMembers([]);
    setNextCursor(null);
    setHasMore(false);
    setTotalCount(null);
    setHasLoaded(false);
    setError(null);
    setActionError(null);
  }, [params.activeCommunityId]);

  useEffect(() => {
    if (
      params.activePage !== "community" ||
      params.communityTab !== "workflows" ||
      !params.activeCommunityId ||
      !params.session ||
      !params.canManageMembers
    ) {
      requestBoardReconciliationRef.current = null;
      return;
    }

    const communityId = params.activeCommunityId;
    const startingSession = params.session;
    const generation = ++requestGenerationRef.current;
    let cancelled = false;
    let closeLiveClient: (() => void) | null = null;
    let unsubscribe: (() => void) | null = null;
    let reconciliationQueue: ReturnType<
      typeof createWorkflowBoardReconciliationQueue
    > | null = null;

    const stillCurrent = () =>
      !cancelled && generation === requestGenerationRef.current;

    const reportFailure = (loadError: unknown) => {
      if (!stillCurrent()) return;
      setError(workflowErrorMessage(loadError));
      setHasLoaded(true);
      setIsLoading(false);
    };

    const reconcile = async (session: AuthSession) => {
      const page = await fetchWorkflowBoardDepth({
        session,
        communityId,
        depth: loadedPageDepthRef.current,
      });
      if (!stillCurrent()) return;
      setBoard(page.board);
      setMembers(page.members);
      setNextCursor(page.continueCursor);
      setHasMore(Boolean(page.continueCursor && !page.isDone));
      setTotalCount(page.totalCount);
      setHasLoaded(true);
      setIsLoading(false);
      setError(null);
    };

    const start = async () => {
      setIsLoading(true);
      setError(null);
      const usableSession = await params.ensureSession(
        startingSession,
        "community_workflows_realtime",
      );
      if (!usableSession) throw new Error("auth_session_required");
      if (!stillCurrent()) return;
      let reconciliationSession = usableSession;

      reconciliationQueue = createWorkflowBoardReconciliationQueue({
        isActive: stillCurrent,
        reconcile: async () => {
          const refreshedSession = await params.ensureSession(
            reconciliationSession,
            "community_workflows_reconcile",
          );
          if (!refreshedSession) throw new Error("auth_session_required");
          reconciliationSession = refreshedSession;
          await reconcile(reconciliationSession);
        },
      });
      const requestReconciliation = reconciliationQueue.request;

      requestBoardReconciliationRef.current = requestReconciliation;
      const liveClient = createCloudCommunityMemberWorkflowLiveClient({
        session: usableSession,
        ensureSession: params.ensureSession,
      });
      closeLiveClient = liveClient.close;
      let lastTokenKey: string | null = null;
      unsubscribe = subscribeCloudCommunityMemberWorkflowBoardProjection({
        liveClient,
        communityId,
        onUpdate: (token) => {
          const tokenKey = JSON.stringify(token);
          if (tokenKey === lastTokenKey) return;
          lastTokenKey = tokenKey;
          void requestReconciliation().catch(reportFailure);
        },
        onError: reportFailure,
      });
      await requestReconciliation();
    };

    void start().catch(reportFailure);
    return () => {
      cancelled = true;
      reconciliationQueue?.cancel();
      unsubscribe?.();
      closeLiveClient?.();
      if (requestBoardReconciliationRef.current) {
        requestBoardReconciliationRef.current = null;
      }
    };
  }, [
    params.activeCommunityId,
    params.activePage,
    params.canManageMembers,
    params.communityTab,
    params.ensureSession,
    params.session,
  ]);

  const loadMore = useCallback(async () => {
    if (
      !params.activeCommunityId ||
      !nextCursor ||
      !hasMore ||
      isLoadingMore ||
      !requestBoardReconciliationRef.current
    )
      return;
    const generation = requestGenerationRef.current;
    setIsLoadingMore(true);
    setActionError(null);
    loadedPageDepthRef.current += 1;
    try {
      await requestBoardReconciliationRef.current();
    } catch (loadError) {
      if (generation === requestGenerationRef.current) {
        loadedPageDepthRef.current = Math.max(
          1,
          loadedPageDepthRef.current - 1,
        );
        setActionError(workflowErrorMessage(loadError));
      }
    } finally {
      if (generation === requestGenerationRef.current) setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, nextCursor, params.activeCommunityId]);

  const mutateStage = useCallback(
    async (
      source: string,
      run: (session: AuthSession, communityId: string, revision: number) => Promise<unknown>,
    ) => {
      if (!params.activeCommunityId || isSaving) return false;
      setIsSaving(true);
      setActionError(null);
      try {
        const usableSession = await params.ensureSession(params.session, source);
        if (!usableSession) throw new Error("auth_session_required");
        await run(usableSession, params.activeCommunityId, board?.revision ?? 0);
        await requestBoardReconciliationRef.current?.();
        return true;
      } catch (mutationError) {
        setActionError(workflowErrorMessage(mutationError));
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [
      board?.revision,
      isSaving,
      params.activeCommunityId,
      params.ensureSession,
      params.session,
    ],
  );

  return {
    board,
    members,
    hasMore,
    totalCount,
    hasLoaded,
    isLoading,
    isLoadingMore,
    error,
    isSaving,
    actionError,
    reload: () => requestBoardReconciliationRef.current?.(),
    loadMore,
    createStage: (name: string) =>
      mutateStage("community_workflows_create_stage", (session, communityId, revision) =>
        createCloudCommunityMemberWorkflowStage({
          session,
          communityId,
          expectedRevision: revision,
          name,
        }),
      ),
    updateStage: (
      stageKey: string,
      name: string,
      milestone: string | null,
    ) =>
      mutateStage("community_workflows_update_stage", (session, communityId, revision) =>
        updateCloudCommunityMemberWorkflowStage({
          session,
          communityId,
          expectedRevision: revision,
          stageKey,
          name,
          milestone,
        }),
      ),
    deleteStage: (stageKey: string) =>
      mutateStage("community_workflows_delete_stage", (session, communityId, revision) =>
        deleteCloudCommunityMemberWorkflowStage({
          session,
          communityId,
          expectedRevision: revision,
          stageKey,
        }),
      ),
    clearActionError: () => setActionError(null),
  };
}
