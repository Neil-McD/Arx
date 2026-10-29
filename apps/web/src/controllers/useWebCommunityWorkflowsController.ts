import { useCallback, useEffect, useRef, useState } from "react";

import type { AuthSession } from "../auth";
import { useWebCommunityFormsGateway } from "./useWebCommunityFormsGateway";
import { useWebCommunityAccessGateway } from "./useWebCommunityAccessGateway";
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
  setCloudCommunityWelcomeGate,
  setCloudCommunityWelcomeDisplay,
  saveCloudCommunityWelcomePage,
  type CloudCommunityWelcomePageDraft,
  forceCloudCommunityMemberMilestone,
  approveCloudCommunityMemberMilestone,
  retryCloudCommunityMemberGoalReview,
  retryCloudCommunityMemberWorkflowAction,
  type CloudCommunityMemberWorkflowBoard,
  type CloudCommunityMemberWorkflowBoardPage,
  type CloudCommunityMemberWorkflowMember,
  type CloudCommunityMemberSuccessDossier,
} from "../../../../shared/cloudCommunityMemberWorkflowsGateway";
import type { CommunityMemberWorkflowAutomation } from "../../../../shared/communityMemberWorkflow";
import { withJourneyPropertyKey, type AgentLedJourneyPlan } from "../../../../shared/agentLedJourneyTemplate";
import { ensureCloudCommunitySelectProperty } from "../../../../shared/cloudCommunityFormsGateway";
import { listCloudCommunityResourceModuleRows, listCloudCommunityResourceRows } from "../../../../shared/cloudCommunityAdminGateway";
import { fetchCloudCommunityLessonTracks } from "../../../../shared/cloudCommunityLessonTracksGateway";
import { fetchCloudCommunityOffers } from "../../../../shared/cloudCommunityOffersGateway";
import type { CommunityResource, CommunityResourceModule } from "../components/communityResourcesContracts";

/** A lesson page in a live course, for welcome steps and lesson triggers. */
export type WelcomeLessonOption = { id: string; title: string; course: string; courseId: string };

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
  if (message.includes("welcome_gate_requires_join_form")) return "Add a Member joins rule that requests a form to the first milestone, or a welcome lesson, then turn on the welcome flow.";
  if (message.includes("client_property_not_found")) return "That member property no longer exists. Choose another one.";
  if (message.includes("client_property_value_invalid")) return "That value doesn't fit the member property. Pick one of its options or enter the right kind of value.";
  if (message.includes("client_property_required")) return "Choose the member property to set.";
  if (message.includes("lesson_trigger_action_invalid")) return "When a lesson or course is done, a rule can request a form or set a member property.";
  if (message.includes("welcome_lesson_unavailable")) return "A chosen lesson is no longer published. Pick another lesson.";
  if (message.includes("welcome_lessons_too_many")) return "Choose up to 5 welcome lessons.";
  if (message.includes("welcome_media_url_invalid")) return "Enter a full video or image link, starting with https://.";
  if (message.includes("welcome_title_too_long")) return "Keep the welcome headline to 120 characters.";
  if (message.includes("welcome_message_too_long")) return "Keep the welcome message to 4,000 characters.";
  if (message.includes("welcome_layout_too_long")) return "The welcome page holds up to 40 blocks. Join some text together or remove a block.";
  if (message.includes("welcome_text_too_long")) return "Keep each text block to 4,000 characters, and the whole page to 12,000.";
  if (message.includes("welcome_forms_too_many")) return "The welcome page holds up to 5 forms.";
  if (message.includes("welcome_step_duplicate")) return "Each form or lesson can be on the welcome page once.";
  if (message.includes("welcome_step_invalid")) return "A form or lesson on the welcome page is missing. Remove it and add it again.";
  if (message.includes("welcome_choices_too_many")) return "The welcome page holds up to 3 choices.";
  if (message.includes("welcome_choice_invalid")) return "Each choice needs a name of up to 40 characters on every card, at most 4 cards, and a short question. A card icon must be an https image link.";
  if (message.includes("welcome_choice_too_long")) return "Keep each card's steps to 8,000 characters, and all cards together to 30,000.";
  if (message.includes("form_not_published")) return "Publish that form in Forms first.";
  if (message.includes("workflow_previous_action_invalid")) return "A \"then\" rule in Workflows runs after a form that is no longer asked. Change that rule in Workflows first.";
  if (message.includes("milestone_cleanup_incomplete")) {
    return "This milestone is still clearing out members who left. Delete it again to finish.";
  }
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
  const access = useWebCommunityAccessGateway(params);
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

  // Stable, so lists that load it on mount don't reload on every render.
  const loadWelcomeLessonOptions = useCallback(async (): Promise<WelcomeLessonOption[]> => {
    const usableSession = params.activeCommunityId ? await params.ensureSession(params.session, "community_workflows_welcome_lessons") : null;
    if (!usableSession || !params.activeCommunityId) return [];
    const [resources, modules] = await Promise.all([
      listCloudCommunityResourceRows<AuthSession, CommunityResource>({ session: usableSession, communityId: params.activeCommunityId, limit: 1000 }),
      listCloudCommunityResourceModuleRows<AuthSession, CommunityResourceModule>({ session: usableSession, communityId: params.activeCommunityId, limit: 200 }),
    ]);
    const liveModules = modules.filter((module) => module.module_status === "live");
    const live = new Map(liveModules.map((module) => [module.id, module.name]));
    // Courses in the order Knowledge shows them; lessons keep the server's order within each.
    const courseOrder = new Map([...liveModules].sort((a, b) => ((a.sort_order ?? 0) - (b.sort_order ?? 0)) || a.name.localeCompare(b.name))
      .map((module, index) => [module.id, index]));
    return resources
      .filter((resource) => resource.resource_role === "page" && resource.module_id && live.has(resource.module_id))
      .sort((a, b) => courseOrder.get(a.module_id!)! - courseOrder.get(b.module_id!)!)
      .map((resource) => ({ id: resource.id, title: resource.title, course: live.get(resource.module_id!) ?? "", courseId: resource.module_id! }));
  }, [params.activeCommunityId, params.ensureSession, params.session]);

  // Roadmap tracks a "When they finish a track" rule can name.
  const loadTrackOptions = useCallback(async (): Promise<Array<{ key: string; title: string }>> => {
    const usableSession = params.activeCommunityId ? await params.ensureSession(params.session, "community_workflows_tracks") : null;
    if (!usableSession || !params.activeCommunityId) return [];
    const result = await fetchCloudCommunityLessonTracks({ session: usableSession, communityId: params.activeCommunityId });
    return result.tracks.map((track) => ({ key: track.key, title: track.title }));
  }, [params.activeCommunityId, params.ensureSession, params.session]);

  // Offers a "When they start / leave an offer" rule can name (Settings › Offers).
  const loadOfferOptions = useCallback(async (): Promise<Array<{ key: string; name: string }>> => {
    const usableSession = params.activeCommunityId ? await params.ensureSession(params.session, "community_workflows_offers") : null;
    if (!usableSession || !params.activeCommunityId) return [];
    const result = await fetchCloudCommunityOffers({ session: usableSession, communityId: params.activeCommunityId });
    return result.offers.filter((offer) => !offer.archived).map((offer) => ({ key: offer.key, name: offer.name }));
  }, [params.activeCommunityId, params.ensureSession, params.session]);

  return {
    forms,
    access,
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
    approveMilestone: async (snapshot: CloudCommunityMemberSuccessDossier) => {
      const scope = serviceChannelScopeRef.current;
      if (!params.canManageMembers || snapshot.community_id !== params.activeCommunityId || snapshot.membership_id !== selectedMembershipId) throw new Error("Member changed. Reopen the member panel.");
      const session = await params.ensureSession(params.session, "community_workflow_approve");
      if (!session || scope !== serviceChannelScopeRef.current) throw new Error("Session changed. Reopen the member panel.");
      await approveCloudCommunityMemberMilestone({ session, dossier: snapshot });
    },
    retryGoalReview: async (snapshot: CloudCommunityMemberSuccessDossier) => {
      const scope = serviceChannelScopeRef.current;
      if (!params.canManageMembers || snapshot.community_id !== params.activeCommunityId || snapshot.membership_id !== selectedMembershipId) throw new Error("Member changed. Reopen the member panel.");
      const session = await params.ensureSession(params.session, "community_workflow_retry_goal_review");
      if (!session || scope !== serviceChannelScopeRef.current) throw new Error("Session changed. Reopen the member panel.");
      await retryCloudCommunityMemberGoalReview({ session, dossier: snapshot });
    },
    retryAction: async (snapshot: CloudCommunityMemberSuccessDossier, automationKey: string) => {
      const scope = serviceChannelScopeRef.current;
      if (!params.canManageMembers || snapshot.community_id !== params.activeCommunityId || snapshot.membership_id !== selectedMembershipId) throw new Error("Member changed. Reopen the member panel.");
      const session = await params.ensureSession(params.session, "community_workflow_retry_action");
      if (!session || scope !== serviceChannelScopeRef.current) throw new Error("Session changed. Reopen the member panel.");
      return await retryCloudCommunityMemberWorkflowAction({ session, dossier: snapshot, automationKey });
    },
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
    createMilestone: (name: string, instructions?: string, goal?: string, requireHumanApproval?: boolean, color?: string) =>
      mutateMilestone("community_workflows_create_milestone", (session, communityId, revision) =>
        createCloudCommunityMemberWorkflowMilestone({
          instructions, goal, requireHumanApproval, color,
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
      requireHumanApproval?: boolean,
      color?: string,
    ) =>
      mutateMilestone("community_workflows_update_milestone", (session, communityId, revision) =>
        updateCloudCommunityMemberWorkflowMilestone({
          instructions, goal, requireHumanApproval, color,
          session,
          communityId,
          expectedRevision: revision,
          milestoneKey,
          name,
          automations,
        }),
      ),
    // The agent-led journey template: one stage at a time with the same calls
    // the stage editor uses, each on the revision the last one returned.
    applyAgentLedJourney: (plan: AgentLedJourneyPlan) =>
      mutateMilestone("community_workflows_apply_agent_led_journey", async (session, communityId, startRevision) => {
        let revision = startRevision;
        const propertyKey = await ensureCloudCommunitySelectProperty(session, communityId, plan.property);
        const withNewKeys = (automations: Array<Omit<CommunityMemberWorkflowAutomation, "key">>) =>
          withJourneyPropertyKey(automations, propertyKey).map((automation) => ({ ...automation, key: "" }) as CommunityMemberWorkflowAutomation);
        const first = board?.milestones[0];
        if (plan.firstStageAdditions.length && first) {
          revision = (await updateCloudCommunityMemberWorkflowMilestone({
            session, communityId, expectedRevision: revision, milestoneKey: first.key, name: first.name,
            automations: [...first.automations, ...withNewKeys(plan.firstStageAdditions),
              ...(first.pausedAutomations ?? []).map((rule) => ({ ...rule, paused: true }))],
            instructions: first.instructions, goal: first.goal, requireHumanApproval: first.requireHumanApproval,
          })).revision;
        }
        for (const stage of plan.stages) {
          const created = await createCloudCommunityMemberWorkflowMilestone({
            session, communityId, expectedRevision: revision, name: stage.name,
            instructions: stage.instructions, goal: stage.goal, requireHumanApproval: stage.requireHumanApproval,
          });
          revision = created.revision;
          if (!stage.automations.length || !created.milestone) continue;
          revision = (await updateCloudCommunityMemberWorkflowMilestone({
            session, communityId, expectedRevision: revision, milestoneKey: created.milestone.key, name: stage.name,
            automations: withNewKeys(stage.automations),
            instructions: stage.instructions, goal: stage.goal, requireHumanApproval: stage.requireHumanApproval,
          })).revision;
        }
      }),
    deleteMilestone: (milestoneKey: string) =>
      mutateMilestone("community_workflows_delete_milestone", (session, communityId, revision) =>
        deleteCloudCommunityMemberWorkflowMilestone({
          session,
          communityId,
          expectedRevision: revision,
          milestoneKey,
        }),
      ),
    setWelcomeGate: (enabled: boolean) =>
      mutateMilestone("community_workflows_welcome_gate", (session, communityId, revision) =>
        setCloudCommunityWelcomeGate({ session, communityId, expectedRevision: revision, enabled })),
    setWelcomeDisplay: (display: "page" | "popup") =>
      mutateMilestone("community_workflows_welcome_display", (session, communityId, revision) =>
        setCloudCommunityWelcomeDisplay({ session, communityId, expectedRevision: revision, display })),
    loadWelcomeLessonOptions,
    loadTrackOptions,
    loadOfferOptions,
    saveWelcomePage: (page: CloudCommunityWelcomePageDraft) =>
      mutateMilestone("community_workflows_welcome_page", (session, communityId, revision) =>
        saveCloudCommunityWelcomePage({ session, communityId, expectedRevision: revision, page })),
    clearActionError: () => setActionError(null),
  };
}
