import { useCallback, useEffect, useRef, useState } from "react";

import type { AuthSession } from "../auth";
import type { AppPage, CommunityTab } from "../../../../shared/appShellNavigation";
import {
  createCloudCommunityMemberWorkflowStage,
  deleteCloudCommunityMemberWorkflowStage,
  fetchCloudCommunityMemberWorkflowBoardPage,
  updateCloudCommunityMemberWorkflowStage,
  type CloudCommunityMemberWorkflowBoard,
  type CloudCommunityMemberWorkflowMember,
} from "../../../../shared/cloudCommunityMemberWorkflowsGateway";
import type { CommunityMemberWorkflowInAppTriggerEvent } from "../../../../shared/communityMemberWorkflow";

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

  const loadBoard = useCallback(
    async (
      communityId = params.activeCommunityId,
      knownSession = params.session,
    ) => {
      if (!communityId || !params.canManageMembers) return null;
      const generation = ++requestGenerationRef.current;
      setIsLoading(true);
      setError(null);
      try {
        const usableSession =
          knownSession ??
          (await params.ensureSession(knownSession, "community_workflows_load"));
        if (!usableSession) throw new Error("auth_session_required");
        const page = await fetchCloudCommunityMemberWorkflowBoardPage({
          session: usableSession,
          communityId,
          cursor: null,
        });
        if (generation === requestGenerationRef.current) {
          setBoard(page.board);
          setMembers(page.members);
          setNextCursor(page.continueCursor);
          setHasMore(Boolean(page.continueCursor && !page.isDone));
          setTotalCount(page.totalCount);
          setHasLoaded(true);
        }
        return page;
      } catch (loadError) {
        if (generation === requestGenerationRef.current) {
          setError(workflowErrorMessage(loadError));
          setHasLoaded(true);
        }
        return null;
      } finally {
        if (generation === requestGenerationRef.current) setIsLoading(false);
      }
    },
    [
      params.activeCommunityId,
      params.canManageMembers,
      params.ensureSession,
      params.session,
    ],
  );

  useEffect(() => {
    requestGenerationRef.current += 1;
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
    ) return;
    void loadBoard(params.activeCommunityId, params.session);
  }, [
    loadBoard,
    params.activeCommunityId,
    params.activePage,
    params.canManageMembers,
    params.communityTab,
    params.session,
  ]);

  const loadMore = useCallback(async () => {
    if (!params.activeCommunityId || !nextCursor || !hasMore || isLoadingMore) return;
    const generation = requestGenerationRef.current;
    const cursor = nextCursor;
    setIsLoadingMore(true);
    setActionError(null);
    try {
      const usableSession = await params.ensureSession(
        params.session,
        "community_workflows_load_more",
      );
      if (!usableSession) throw new Error("auth_session_required");
      const page = await fetchCloudCommunityMemberWorkflowBoardPage({
        session: usableSession,
        communityId: params.activeCommunityId,
        cursor,
      });
      if (generation !== requestGenerationRef.current) return;
      setMembers((current) => {
        const seen = new Set(current.map((member) => member.membership_id));
        return [
          ...current,
          ...page.members.filter((member) => !seen.has(member.membership_id)),
        ];
      });
      setNextCursor(page.continueCursor);
      setHasMore(Boolean(page.continueCursor && !page.isDone));
      setTotalCount(page.totalCount);
    } catch (loadError) {
      if (generation === requestGenerationRef.current) {
        setActionError(workflowErrorMessage(loadError));
      }
    } finally {
      if (generation === requestGenerationRef.current) setIsLoadingMore(false);
    }
  }, [
    hasMore,
    isLoadingMore,
    nextCursor,
    params.activeCommunityId,
    params.ensureSession,
    params.session,
  ]);

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
        await loadBoard(params.activeCommunityId, usableSession);
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
      loadBoard,
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
    reload: () => loadBoard(),
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
      completionTriggerEvent: CommunityMemberWorkflowInAppTriggerEvent | null,
    ) =>
      mutateStage("community_workflows_update_stage", (session, communityId, revision) =>
        updateCloudCommunityMemberWorkflowStage({
          session,
          communityId,
          expectedRevision: revision,
          stageKey,
          name,
          completionTriggerEvent,
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
