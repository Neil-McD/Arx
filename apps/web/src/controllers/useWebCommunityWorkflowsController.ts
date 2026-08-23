import { useCallback, useEffect, useRef, useState } from "react";

import type { AuthSession } from "../auth";
import type {
  AppPage,
  CommunityTab,
} from "../../../../shared/appShellNavigation";
import {
  activateCloudCommunityMemberWorkflowDraft,
  addCloudCommunityMemberWorkflowEvidence,
  fetchCloudCommunityMemberWorkflowBoard,
  fetchCloudCommunityMemberWorkflowEnrollment,
  moveCloudCommunityMemberWorkflowEnrollment,
  saveCloudCommunityMemberWorkflowDraft,
  type CloudCommunityMemberWorkflowBoard,
  type CloudCommunityMemberWorkflowEnrollmentDetail,
} from "../../../../shared/cloudCommunityMemberWorkflowsGateway";
import type { CommunityMemberWorkflowDraft } from "../../../../shared/communityMemberWorkflow";

type EnsureAuthSession = (
  session?: AuthSession | null,
  source?: string,
  options?: { forceRefresh?: boolean },
) => Promise<AuthSession | null>;

function workflowActionKey(prefix: string): string {
  const random =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${random}`;
}

function workflowErrorMessage(error: unknown): string {
  const message = String(
    error instanceof Error ? error.message : (error ?? ""),
  ).toLowerCase();
  if (message.includes("revision_conflict")) {
    return "This workflow changed in another session. Reload it and try again.";
  }
  if (message.includes("active_enrollments_require_migration")) {
    return "This version still has active members. Finish their path before activating a replacement.";
  }
  if (message.includes("community_forbidden")) {
    return "You no longer have permission to manage this workflow.";
  }
  if (message.includes("membership_inactive")) {
    return "This person is no longer an active member of the community.";
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
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<
    string | null
  >(null);
  const [selectedEnrollment, setSelectedEnrollment] =
    useState<CloudCommunityMemberWorkflowEnrollmentDetail | null>(null);
  const [isLoadingEnrollment, setIsLoadingEnrollment] = useState(false);
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
        if (generation !== requestGenerationRef.current) return nextBoard;
        setBoard(nextBoard);
        setHasLoaded(true);
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

  const loadEnrollment = useCallback(
    async (enrollmentId: string, knownSession = params.session) => {
      if (!params.activeCommunityId || !params.canManageMembers) return null;
      setIsLoadingEnrollment(true);
      setActionError(null);
      try {
        const usableSession =
          knownSession ??
          (await params.ensureSession(
            knownSession,
            "community_workflow_member_load",
          ));
        if (!usableSession) throw new Error("auth_session_required");
        const detail = await fetchCloudCommunityMemberWorkflowEnrollment({
          session: usableSession,
          communityId: params.activeCommunityId,
          enrollmentId,
        });
        setSelectedEnrollment(detail);
        return detail;
      } catch (loadError) {
        setActionError(workflowErrorMessage(loadError));
        return null;
      } finally {
        setIsLoadingEnrollment(false);
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
    setSelectedEnrollmentId(null);
    setSelectedEnrollment(null);
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

  const withMutation = useCallback(
    async (
      operation: (session: AuthSession, communityId: string) => Promise<void>,
    ) => {
      if (!params.activeCommunityId || isSaving) return false;
      setIsSaving(true);
      setActionError(null);
      try {
        const usableSession = await params.ensureSession(
          params.session,
          "community_workflows_mutation",
        );
        if (!usableSession) throw new Error("auth_session_required");
        await operation(usableSession, params.activeCommunityId);
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
      isSaving,
      loadBoard,
      params.activeCommunityId,
      params.ensureSession,
      params.session,
    ],
  );

  const saveDraft = useCallback(
    async (draft: CommunityMemberWorkflowDraft) =>
      await withMutation(async (usableSession, communityId) => {
        await saveCloudCommunityMemberWorkflowDraft({
          session: usableSession,
          communityId,
          expectedRevision: board?.revision ?? 0,
          draft,
        });
      }),
    [board?.revision, withMutation],
  );

  const activateDraft = useCallback(
    async () =>
      await withMutation(async (usableSession, communityId) => {
        if (!board) throw new Error("community_member_workflow_draft_missing");
        await activateCloudCommunityMemberWorkflowDraft({
          session: usableSession,
          communityId,
          expectedRevision: board.revision,
        });
      }),
    [board, withMutation],
  );

  const selectEnrollment = useCallback(
    (enrollmentId: string | null) => {
      setSelectedEnrollmentId(enrollmentId);
      setSelectedEnrollment(null);
      setActionError(null);
      if (enrollmentId) void loadEnrollment(enrollmentId);
    },
    [loadEnrollment],
  );

  const addEvidence = useCallback(
    async (summary: string) => {
      const enrollment = selectedEnrollment?.enrollment;
      if (!enrollment) return false;
      const succeeded = await withMutation(
        async (usableSession, communityId) => {
          await addCloudCommunityMemberWorkflowEvidence({
            session: usableSession,
            communityId,
            enrollmentId: enrollment.id,
            stageKey: enrollment.current_stage_key,
            summary,
            idempotencyKey: workflowActionKey("builder-evidence"),
          });
        },
      );
      if (succeeded) await loadEnrollment(enrollment.id);
      return succeeded;
    },
    [loadEnrollment, selectedEnrollment?.enrollment, withMutation],
  );

  const moveEnrollment = useCallback(
    async (targetStageKey: string, reason: string) => {
      const enrollment = selectedEnrollment?.enrollment;
      if (!enrollment) return false;
      const succeeded = await withMutation(
        async (usableSession, communityId) => {
          await moveCloudCommunityMemberWorkflowEnrollment({
            session: usableSession,
            communityId,
            enrollmentId: enrollment.id,
            expectedRevision: enrollment.revision,
            targetStageKey,
            reason,
            idempotencyKey: workflowActionKey("builder-move"),
          });
        },
      );
      if (succeeded) await loadEnrollment(enrollment.id);
      return succeeded;
    },
    [loadEnrollment, selectedEnrollment?.enrollment, withMutation],
  );

  return {
    board,
    hasLoaded,
    isLoading,
    error,
    isSaving,
    actionError,
    selectedEnrollmentId,
    selectedEnrollment,
    isLoadingEnrollment,
    reload: () => loadBoard(),
    saveDraft,
    activateDraft,
    selectEnrollment,
    addEvidence,
    moveEnrollment,
    clearActionError: () => setActionError(null),
  };
}
