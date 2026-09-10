import { useCallback, useEffect, useRef, useState } from "react";

import type { AuthSession } from "../auth";
import { useWebCommunityFormsGateway } from "./useWebCommunityFormsGateway";
import type { AppPage, CommunityTab } from "../../../../shared/appShellNavigation";
import {
  createCloudCommunityMemberWorkflowLiveClient,
  createCloudCommunityMemberWorkflowMilestone,
  deleteCloudCommunityMemberWorkflowMilestone,
  fetchCloudCommunityMemberWorkflowBoardPage,
  fetchCloudCommunityMemberSuccessDossier,
  subscribeCloudCommunityMemberWorkflowBoardProjection,
  subscribeCloudCommunityMemberSuccessDossier,
  updateCloudCommunityMemberWorkflowMilestone,
  setCloudCommunityMemberServiceChannel,
  forceCloudCommunityMemberMilestone,
  type CloudCommunityMemberWorkflowBoard,
  type CloudCommunityMemberWorkflowBoardPage,
  type CloudCommunityMemberWorkflowMember,
  type CloudCommunityMemberSuccessDossier,
} from "../../../../shared/cloudCommunityMemberWorkflowsGateway";
import type { CommunityMemberWorkflowAutomation } from "../../../../shared/communityMemberWorkflow";

type EnsureAuthSession = (
  session?: AuthSession | null,
  source?: string,
  options?: { forceRefresh?: boolean },
) => Promise<AuthSession | null>;

function workflowErrorMessage(error: unknown): string {
  const message = String(
    error instanceof Error ? error.message : (error ?? ""),
  ).toLowerCase();
  if (message.includes("service_channel_revision_conflict")) return "This member’s service channel changed. Refresh the member panel before trying again.";
  if (message.includes("service_channel_unavailable")) return "Choose an active private channel that this member can access and the community agent can post in. Assignment does not invite them.";
  if (message.includes("revision_conflict")) {
    return "This workflow changed in another session. Reload it and try again.";
  }
  if (message.includes("workflow_channel_unavailable")) {
    return "A selected channel is unavailable. Choose another channel or remove that automation.";
  }
  if (message.includes("workflow_delay_invalid")) return "Choose a duration from 1 minute to 365 days.";
  if (message.includes("milestone_has_members")) {
    return "Move members out of this milestone before deleting it.";
  }
  if (message.includes("milestone_count_invalid")) {
    return "A workflow needs at least one milestone.";
  }
  if (message.includes("requirement_duplicate")) {
    return "Each completion requirement must be different.";
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
  const forms = useWebCommunityFormsGateway(params);
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
  const [selectedMembershipId, setSelectedMembershipId] = useState<string | null>(null);
  const [memberDossier, setMemberDossier] =
    useState<CloudCommunityMemberSuccessDossier | null>(null);
  const [isMemberDossierLoading, setIsMemberDossierLoading] = useState(false);
  const [memberDossierError, setMemberDossierError] = useState<string | null>(null);
  const [dossierRefreshNonce, setDossierRefreshNonce] = useState(0);
  const [isServiceChannelSaving, setIsServiceChannelSaving] = useState(false);
  const [serviceChannelError, setServiceChannelError] = useState<string | null>(null);
  const serviceChannelRequestRef = useRef(0);
  const serviceChannelPendingRef = useRef(false);
  const serviceChannelScopeRef = useRef("");
  serviceChannelScopeRef.current = `${params.activeCommunityId}:${selectedMembershipId}:${params.communityTab}:${params.activePage}:${params.canManageMembers}`;
  const requestGenerationRef = useRef(0);
  const dossierRequestGenerationRef = useRef(0);
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
    dossierRequestGenerationRef.current += 1;
    setSelectedMembershipId(null);
    setMemberDossier(null);
    setIsMemberDossierLoading(false);
    setMemberDossierError(null);
    serviceChannelRequestRef.current += 1;
    serviceChannelPendingRef.current = false;
    setIsServiceChannelSaving(false);
    setServiceChannelError(null);
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

  useEffect(() => {
    if (
      !selectedMembershipId ||
      !params.activeCommunityId ||
      !params.session ||
      !params.canManageMembers ||
      params.activePage !== "community" ||
      params.communityTab !== "workflows"
    ) {
      setMemberDossier(null);
      setIsMemberDossierLoading(false);
      return;
    }
    const generation = ++dossierRequestGenerationRef.current;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    let closeLiveClient: (() => void) | undefined;
    const stillCurrent = () => !cancelled && generation === dossierRequestGenerationRef.current;
    const reportFailure = (error: unknown) => {
      if (!stillCurrent()) return;
      setMemberDossier(null);
      setMemberDossierError(workflowErrorMessage(error));
      setIsMemberDossierLoading(false);
    };
    setIsMemberDossierLoading(true);
    setMemberDossierError(null);

    void (async () => {
      try {
        const usableSession = await params.ensureSession(
          params.session,
          "community_workflow_member_success_dossier",
        );
        if (!usableSession) throw new Error("auth_session_required");
        if (!stillCurrent()) return;
        const liveClient = createCloudCommunityMemberWorkflowLiveClient({
          session: usableSession,
          ensureSession: params.ensureSession,
        });
        closeLiveClient = liveClient.close;
        unsubscribe = subscribeCloudCommunityMemberSuccessDossier({
          liveClient,
          communityId: params.activeCommunityId!,
          membershipId: selectedMembershipId,
          onUpdate: (dossier) => {
            if (!stillCurrent()) return;
            setMemberDossier(dossier);
            setMemberDossierError(null);
            setIsMemberDossierLoading(false);
          },
          onError: reportFailure,
        });
      } catch (dossierError) {
        reportFailure(dossierError);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
      closeLiveClient?.();
    };
  }, [
    params.activeCommunityId,
    params.activePage,
    params.canManageMembers,
    params.communityTab,
    params.ensureSession,
    params.session,
    dossierRefreshNonce,
    selectedMembershipId,
  ]);

  const mutateMilestone = useCallback(
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
    forms,
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
    selectedMembershipId,
    memberDossier,
    isMemberDossierLoading,
    memberDossierError,
    forceMove: async (snapshot: CloudCommunityMemberSuccessDossier) => {
      const scope = serviceChannelScopeRef.current;
      if (!params.canManageMembers || snapshot.community_id !== params.activeCommunityId || snapshot.membership_id !== selectedMembershipId) throw new Error("Member changed. Reopen the member panel.");
      const session = await params.ensureSession(params.session, "community_workflow_force_move");
      if (!session || scope !== serviceChannelScopeRef.current) throw new Error("Session changed. Reopen the member panel.");
      try {
        await forceCloudCommunityMemberMilestone({ session, dossier: snapshot });
      } catch {
        throw new Error("Could not force this move. Refresh the member panel and review their current position before trying again.");
      }
    },
    isServiceChannelSaving,
    serviceChannelError,
    setServiceChannel: async (channelId: string | null, expectedRevision: number) => {
      if (!selectedMembershipId || !params.activeCommunityId || !params.canManageMembers || serviceChannelPendingRef.current) return false;
      const token = ++serviceChannelRequestRef.current;
      const scope = serviceChannelScopeRef.current;
      serviceChannelPendingRef.current = true;
      setIsServiceChannelSaving(true);
      setServiceChannelError(null);
      try {
        const session = await params.ensureSession(params.session, "community_member_service_channel");
        if (!session) throw new Error("auth_session_required");
        if (token !== serviceChannelRequestRef.current || scope !== serviceChannelScopeRef.current) return false;
        await setCloudCommunityMemberServiceChannel({ session, communityId: params.activeCommunityId,
          membershipId: selectedMembershipId, channelId, expectedRevision });
        if (token !== serviceChannelRequestRef.current || scope !== serviceChannelScopeRef.current) return false;
        return true;
      } catch (error) {
        if (token === serviceChannelRequestRef.current && scope === serviceChannelScopeRef.current) setServiceChannelError(workflowErrorMessage(error));
        return false;
      } finally {
        if (token === serviceChannelRequestRef.current) {
          serviceChannelPendingRef.current = false;
          setIsServiceChannelSaving(false);
        }
      }
    },
    openServiceChannel: async (expectedChannelId: string, onOpen: (channelId: string) => void): Promise<void> => {
      if (!selectedMembershipId || !params.activeCommunityId || serviceChannelPendingRef.current) return;
      const scope = serviceChannelScopeRef.current;
      const token = serviceChannelRequestRef.current;
      const generation = dossierRequestGenerationRef.current;
      setIsMemberDossierLoading(true);
      try {
        const session = await params.ensureSession(params.session, "community_member_service_channel_open");
        if (!session || scope !== serviceChannelScopeRef.current || token !== serviceChannelRequestRef.current) return;
        const dossier = await fetchCloudCommunityMemberSuccessDossier({ session, communityId: params.activeCommunityId, membershipId: selectedMembershipId });
        if (scope !== serviceChannelScopeRef.current || token !== serviceChannelRequestRef.current || generation !== dossierRequestGenerationRef.current) return;
        if (dossier.service_channel.status === "available" && dossier.service_channel.channel_id === expectedChannelId) {
          onOpen(expectedChannelId);
          return;
        }
        setServiceChannelError("The service channel changed or is unavailable. Review the refreshed assignment; no fallback was opened.");
      } catch (error) {
        if (scope === serviceChannelScopeRef.current && token === serviceChannelRequestRef.current) setServiceChannelError(workflowErrorMessage(error));
      } finally {
        if (scope === serviceChannelScopeRef.current && generation === dossierRequestGenerationRef.current) setIsMemberDossierLoading(false);
      }
    },
    reload: () => requestBoardReconciliationRef.current?.(),
    loadMore,
    openMemberDossier: (membershipId: string) => {
      serviceChannelRequestRef.current += 1;
      serviceChannelPendingRef.current = false;
      setIsServiceChannelSaving(false);
      setServiceChannelError(null);
      setMemberDossier(null);
      setMemberDossierError(null);
      setSelectedMembershipId(membershipId);
    },
    closeMemberDossier: () => {
      serviceChannelRequestRef.current += 1;
      serviceChannelPendingRef.current = false;
      setIsServiceChannelSaving(false);
      setServiceChannelError(null);
      dossierRequestGenerationRef.current += 1;
      setSelectedMembershipId(null);
      setMemberDossier(null);
      setMemberDossierError(null);
      setIsMemberDossierLoading(false);
    },
    retryMemberDossier: () => {
      if (!selectedMembershipId || isMemberDossierLoading) return;
      setIsMemberDossierLoading(true);
      setMemberDossierError(null);
      setServiceChannelError(null);
      setDossierRefreshNonce((value) => value + 1);
    },
    createMilestone: (name: string, instructions?: string, goal?: string) =>
      mutateMilestone("community_workflows_create_milestone", (session, communityId, revision) =>
        createCloudCommunityMemberWorkflowMilestone({
          instructions, goal,
          session,
          communityId,
          expectedRevision: revision,
          name,
        }),
      ),
    updateMilestone: (
      milestoneKey: string,
      name: string,
      automations: CommunityMemberWorkflowAutomation[],
      instructions?: string,
      goal?: string,
    ) =>
      mutateMilestone("community_workflows_update_milestone", (session, communityId, revision) =>
        updateCloudCommunityMemberWorkflowMilestone({
          instructions, goal,
          session,
          communityId,
          expectedRevision: revision,
          milestoneKey,
          name,
          automations,
        }),
      ),
    deleteMilestone: (milestoneKey: string) =>
      mutateMilestone("community_workflows_delete_milestone", (session, communityId, revision) =>
        deleteCloudCommunityMemberWorkflowMilestone({
          session,
          communityId,
          expectedRevision: revision,
          milestoneKey,
        }),
      ),
    clearActionError: () => setActionError(null),
  };
}
