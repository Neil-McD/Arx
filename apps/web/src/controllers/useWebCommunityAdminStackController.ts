import { useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { askInApp } from "../../../../shared/inAppConfirm";
import type { AppPage, AppView, CommunitySettingsPane, CommunityTab, SettingsGroup } from "../../../../shared/appShellNavigation";
import type {
  UserProfile as SharedUserProfile,
  UserProfileDetail as SharedUserProfileDetail,
} from "../../../../shared/communityTypes";
import { useCommunityAdminController } from "../../../../shared/useCommunityAdminController";
import { useCommunityDirectoryLifecycle } from "../../../../shared/useCommunityDirectoryLifecycle";
import { useCommunityMembersReviewController } from "../../../../shared/useCommunityMembersReviewController";
import { useCommunityAdminAnalyticsLifecycle } from "../../../../shared/useCommunityAdminAnalyticsLifecycle";
import { useCommunityMembersReviewLifecycle } from "../../../../shared/useCommunityMembersReviewLifecycle";
import { deriveCommunityMembersJoinReviewMode, type CommunityMembersJoinReviewMode } from "../communityJoinPolicy";
import { captureProductAnalyticsEvent } from "../posthogAnalytics";
import type { AuthSession } from "../auth";
import type { WebCommunityRecord } from "../webAppContracts";
import type {
  useWebCommunityAdministrationState,
  WebCommunityJoinRequest,
} from "./useWebCommunityAdministrationState";
import { useWebCommunityMemberManagementController } from "./useWebCommunityMemberManagementController";
import { useWebCommunityAgentSettingsController } from "./useWebCommunityAgentSettingsController";
import { useWebCommunitySettingsController } from "./useWebCommunitySettingsController";
import type { useWebOnboardingProfileController } from "./useWebOnboardingProfileController";
import type { useWebFounderBillingController } from "./useWebFounderBillingController";

export function useWebCommunityAdminStackController(params: {
  session: AuthSession | null;
  sessionRef: MutableRefObject<AuthSession | null>;
  ensureSession: (session?: AuthSession | null, source?: string, options?: { forceRefresh?: boolean }) => Promise<AuthSession | null>;
  requireSignIn: () => void;
  activePage: AppPage;
  settingsGroup: SettingsGroup;
  communityTab: CommunityTab;
  communitySettingsPane: CommunitySettingsPane;
  resumeEpoch: number;
  activeCommunity: WebCommunityRecord | null;
  activeCommunityId: string | null;
  communities: WebCommunityRecord[];
  setCommunities: Dispatch<SetStateAction<WebCommunityRecord[]>>;
  setProfilesByUserId: Dispatch<SetStateAction<Record<string, SharedUserProfile>>>;
  setCloudProfile: Dispatch<SetStateAction<SharedUserProfileDetail | null>>;
  profileUi: ReturnType<typeof useWebOnboardingProfileController>["profile"];
  administration: ReturnType<typeof useWebCommunityAdministrationState>;
  founderBilling: ReturnType<typeof useWebFounderBillingController>;
  loadCommunities: (session: AuthSession) => Promise<void>;
  loadUserProfiles: (userIds: string[], session: AuthSession) => Promise<void>;
  applyCommunityShellState: (patch: {
    communityId?: string | null;
    communitySlug?: string | null;
    communityTab?: CommunityTab;
  }) => void;
  setActivePage: Dispatch<SetStateAction<AppPage>>;
  setActiveView: Dispatch<SetStateAction<AppView>>;
  openGlobalSettings: (group: SettingsGroup) => void;
  upsertCommunityVisualIdentities: (identities: any[]) => void;
}) {
  const {
    session,
    sessionRef,
    ensureSession,
    activePage,
    communityTab,
    activeCommunity,
    activeCommunityId,
    administration,
  } = params;

  const authenticatedSessionArg = { session, ensureSession };
  const sessionArg = { session };
  const {
    setCommunityJoinRequests,
    setIsLoadingCommunityJoinRequests,
    setHasLoadedCommunityJoinRequests,
    setCommunityJoinRequestsError,
    setDecidingCommunityJoinRequestId,
  } = administration.joinRequests;
  const {
    setIsSetting: setIsSettingCommunityFreeAccessMode,
    setError: setCommunityFreeAccessModeError,
  } = administration.freeAccess;
  const { loadCommunityDirectoryMembers } = administration.directory;
  const {
    canManageMembersActiveCommunity,
    canReviewJoinRequestsActiveCommunity,
    canViewActiveCommunityAnalytics,
    reloadActiveCommunityAccess,
  } = administration.access;
  const {
    setSummary: setCommunityAnalyticsSummary,
    setSeries: setCommunityAnalyticsSeries,
    range: communityAnalyticsRange,
    setIsLoading: setIsLoadingCommunityAnalytics,
    setError: setCommunityAnalyticsError,
  } = administration.analytics;

  const {
    loadSelfProfile,
    saveProfileToCloud,
    loadCommunityAnalytics,
    resetCommunityAnalytics,
    handleSetCommunityMemberRole,
    handleRemoveCommunityMember,
    handleBanCommunityMember,
  } = useCommunityAdminController<AuthSession, SharedUserProfile, SharedUserProfileDetail>({
    activeCommunityId,
    ...authenticatedSessionArg,
    confirmAction: (message, yes) => askInApp({ message, yes, danger: true }),
    reloadCommunities: params.loadCommunities,
    reloadCommunityAccess: reloadActiveCommunityAccess,
    getProfileSaveSession: () => sessionRef.current ?? session,
    profileSaveFailureMessage: "Failed to save profile.",
    onProfileSaveUnauthenticated: () => {
      params.requireSignIn();
    },
    applyLoadedProfileToLocal: params.profileUi.applyLoadedProfileToLocal,
    profileIsActive: activePage === "settings" && params.settingsGroup === "profile",
    captureProfileDraft: params.profileUi.captureProfileDraft,
    applySavedProfileToLocal: params.profileUi.applySavedProfileToLocal,
    setProfileLoadStatus: params.profileUi.setProfileLoadStatus,
    setProfilesByUserId: params.setProfilesByUserId,
    setCloudProfile: params.setCloudProfile,
    setIsSavingProfile: params.profileUi.setIsSavingProfile,
    setProfileSaveError: params.profileUi.setProfileSaveError,
    setIsLoadingCommunityAnalytics,
    setCommunityAnalyticsError,
    setCommunityAnalyticsSummary,
    setCommunityAnalyticsSeries,
  });

  const {
    resetCommunityJoinRequests,
    applyLiveCommunityJoinRequestsLoading,
    applyLiveCommunityJoinRequests,
    applyLiveCommunityJoinRequestsError,
    handleApproveCommunityJoinRequest,
    handleDenyCommunityJoinRequest,
  } = useCommunityMembersReviewController<AuthSession, WebCommunityJoinRequest>({
    activeCommunityId,
    ...authenticatedSessionArg,
    loadUserProfiles: (userIds, activeSession) => params.loadUserProfiles(userIds, activeSession),
    reloadCommunityDirectoryMembers: loadCommunityDirectoryMembers,
    onJoinRequestApproved: ({ communityId, requestId }) => {
      captureProductAnalyticsEvent("community join request approved", {
        community_id: communityId,
        request_id: requestId,
        surface: "workspace_community_panel",
      });
    },
    setCommunityJoinRequests,
    setIsLoadingCommunityJoinRequests,
    setHasLoadedCommunityJoinRequests,
    setCommunityJoinRequestsError,
    setDecidingCommunityJoinRequestId,
    skipReloadAfterDecision: true,
  });

  const communityMemberManagement = useWebCommunityMemberManagementController({
    activeCommunityId,
    canManageMembers: canManageMembersActiveCommunity,
    ensureSession,
    loadDirectoryMembers: loadCommunityDirectoryMembers,
    removeMember: handleRemoveCommunityMember,
    banMember: handleBanCommunityMember,
    setMemberRole: handleSetCommunityMemberRole,
    setCommunities: params.setCommunities,
    setFreeAccessError: setCommunityFreeAccessModeError,
    setIsSettingFreeAccess: setIsSettingCommunityFreeAccessMode,
    clearJoinRequests: resetCommunityJoinRequests,
  });

  const communityAgentSettings = useWebCommunityAgentSettingsController({
    activeCommunityId,
    activePage,
    agentUi: administration.agentConfigUi,
    canManageMembers: canManageMembersActiveCommunity,
    communitySettingsPane: params.communitySettingsPane,
    communityTab,
    ensureSession,
    session,
    setCommunities: params.setCommunities,
  });

  const communitySettingsController = useWebCommunitySettingsController({
    activeCommunity,
    activeCommunityId,
    adminUi: administration.adminUi,
    ensureSession,
    loadCommunities: params.loadCommunities,
    onCommunityIdentityChanged: (communityId, communitySlug) => {
      params.applyCommunityShellState({ communityId, communitySlug });
    },
    onLeaveCommunity: (leavingId) => {
      params.applyCommunityShellState({
        communityId: null,
        communitySlug: null,
        communityTab: "chat",
      });
      params.setActivePage("discover");
      params.setActiveView("home");
      params.setCommunities((current) =>
        current.filter((community) => community.id !== leavingId));
    },
    onCommunityArchived: (archivedId) => {
      params.setCommunities((current) =>
        current.filter((community) => community.id !== archivedId));
      params.applyCommunityShellState({
        communityId: null,
        communitySlug: null,
        communityTab: "chat",
      });
      params.openGlobalSettings("account");
      void params.founderBilling.watchArchiveCleanup(archivedId);
    },
    session,
    settingsUi: administration.settingsUi,
    setCommunities: params.setCommunities,
    onVisualIdentitySaved: (identity) => {
      params.upsertCommunityVisualIdentities([identity]);
    },
  });

  // Join requests and the member tools load where they are shown: beside a
  // channel, and on the Members page.
  const shouldHydrateCommunityContextPanel =
    activePage === "community" &&
    (communityTab === "chat" || communityTab === "members");

  useCommunityDirectoryLifecycle<AuthSession>({
    activePage,
    communityTab,
    ...sessionArg,
    resumeEpoch: params.resumeEpoch,
    activeCommunityId,
    loadCommunityDirectoryMembers,
  });

  const activeCommunityMembersJoinReviewMode = useMemo<CommunityMembersJoinReviewMode | null>(() => {
    if (!activeCommunity) return null;
    return deriveCommunityMembersJoinReviewMode({
      entry_policy: activeCommunity.entry_policy,
    });
  }, [activeCommunity]);

  useCommunityMembersReviewLifecycle<AuthSession, WebCommunityRecord, WebCommunityJoinRequest>({
    ...sessionArg,
    activeCommunityId,
    communities: params.communities,
    canReviewJoinRequests: canReviewJoinRequestsActiveCommunity,
    activeCommunityMembersJoinReviewMode,
    // Home's "Needs you" list shows the people waiting too.
    shouldLoad: shouldHydrateCommunityContextPanel || (activePage === "community" && communityTab === "agent"),
    applyLiveCommunityJoinRequestsLoading,
    applyLiveCommunityJoinRequests,
    applyLiveCommunityJoinRequestsError,
    resetCommunityJoinRequests,
  });

  useCommunityAdminAnalyticsLifecycle({
    activePage,
    communityTab,
    ...sessionArg,
    activeCommunityId,
    canViewActiveCommunityAnalytics,
    communityAnalyticsRange,
    loadCommunityAnalytics,
    resetCommunityAnalytics,
  });

  return {
    loadSelfProfile,
    saveProfileToCloud,
    handleApproveCommunityJoinRequest,
    handleDenyCommunityJoinRequest,
    communityMemberManagement,
    handleSaveCommunityAgentConfig: communityAgentSettings.handleSaveCommunityAgentConfig,
    communitySettingsController,
    activeCommunityMembersJoinReviewMode,
  };
}
