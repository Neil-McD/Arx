import { useCallback, useEffect, useRef, useState } from "react";

import type { AuthSession } from "../auth";
import type {
  AppPage,
  CommunityTab,
} from "../../../../shared/appShellNavigation";
import {
  fetchCloudCommunityMemberWorkflowBoard,
  saveCloudCommunityMemberWorkflow,
  type CloudCommunityMemberWorkflowBoard,
} from "../../../../shared/cloudCommunityMemberWorkflowsGateway";
import type { CommunityMemberWorkflowDefinition } from "../../../../shared/communityMemberWorkflow";

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
  const [board, setBoard] = useState<CloudCommunityMemberWorkflowBoard | null>(
    null,
  );
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
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
          (await params.ensureSession(
            knownSession,
            "community_workflows_load",
          ));
        if (!usableSession) throw new Error("auth_session_required");
        const nextBoard = await fetchCloudCommunityMemberWorkflowBoard({
          session: usableSession,
          communityId,
        });
        if (generation === requestGenerationRef.current) {
          setBoard(nextBoard);
          setHasLoaded(true);
        }
        return nextBoard;
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
      return;
    }
    void loadBoard(params.activeCommunityId, params.session);
  }, [
    loadBoard,
    params.activeCommunityId,
    params.activePage,
    params.canManageMembers,
    params.communityTab,
    params.session,
  ]);

  const saveDefinition = useCallback(
    async (definition: CommunityMemberWorkflowDefinition) => {
      if (!params.activeCommunityId || isSaving) return false;
      setIsSaving(true);
      setActionError(null);
      try {
        const usableSession = await params.ensureSession(
          params.session,
          "community_workflows_save",
        );
        if (!usableSession) throw new Error("auth_session_required");
        await saveCloudCommunityMemberWorkflow({
          session: usableSession,
          communityId: params.activeCommunityId,
          expectedRevision: board?.revision ?? 0,
          definition,
        });
        await loadBoard(params.activeCommunityId, usableSession);
        return true;
      } catch (saveError) {
        setActionError(workflowErrorMessage(saveError));
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
    hasLoaded,
    isLoading,
    error,
    isSaving,
    actionError,
    reload: () => loadBoard(),
    saveDefinition,
    clearActionError: () => setActionError(null),
  };
}
