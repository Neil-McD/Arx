import "./index.css";
import { useWebInboxRoute } from "./controllers/useWebInboxRoute";
import { bootConvexProbe } from "../../../shared/convexRuntime";
import { useCommunityAppLinksState } from "./controllers/communityAppLinks";
import { useGuideSearchShortcut } from "./controllers/useGuideSearchShortcut";
import { useCloseInboxOnSettings } from "./controllers/useCloseInboxOnSettings";
import { communityAgentOnFromAccess } from "./controllers/communityAgentOn";
import {
  useMemo,
  useRef,
} from "react";
import {
  beginBrowserSignedOutState,
  type AuthSession,
} from "./auth";
import { isLikelyImageFile } from "../../../shared/attachmentHelpers";
import { formatChatTime } from "../../../shared/contentFormatting";
import { useWebCommunityUiController } from "./controllers/useWebCommunityUiController";
import {
  useWebCommunityInteractionProjection,
} from "./controllers/useWebCommunityInteractionProjection";
import { useWebCommunityChannelsController } from "./controllers/useWebCommunityChannelsController";
import {
  useWebCommunityChatController,
  type WebCommunityMessageAttachment,
} from "./controllers/useWebCommunityChatController";
import {
  useWebCommunityContentController,
} from "./controllers/useWebCommunityContentController";
import { useWebCommunityAttentionModel } from "./controllers/useWebCommunityAttentionController";
import { useWebCommunityAdministrationState } from "./controllers/useWebCommunityAdministrationState";
import { useWebCommunityAdminStackController } from "./controllers/useWebCommunityAdminStackController";
import {
  buildChannelSelectPath,
  buildWebCommunityContextJoinRequests,
  buildWebCommunityInteractionProjectionProps,
  deriveActiveChannelScope,
} from "./controllers/buildWebCommunityInteractionProjectionProps";
import {
  buildWebAppDirectMessagesHostProps,
  buildWebAppGlobalOverlayProps,
  buildWebAppMainSurfaceProps,
  deriveWebCommunityAttentionChrome,
} from "./controllers/buildWebAppHostProps";
import { useWebAccountSetupSurfaceController } from "./controllers/useWebAccountSetupSurfaceController";
import { useWebFounderBillingController } from "./controllers/useWebFounderBillingController";
import { useWebEmailPreferencesController } from "./controllers/useWebEmailPreferencesController";
import { useWebCommunityVoiceController } from "./controllers/useWebCommunityVoiceController";
import { useWebCommunityProfileHydrationController } from "./controllers/useWebCommunityProfileHydrationController";
import { useWebCommunityDirectoryState } from "./controllers/useWebCommunityDirectoryState";
import { useWebTelemetryLifecycle } from "./controllers/useWebTelemetryLifecycle";
import { pageSession } from "../../../shared/pageSession";
import { useWebAuthErrorToastLifecycle } from "./controllers/useWebAuthErrorToastLifecycle";
import { useWebCommunityAgentSurfaceController } from "./controllers/useWebCommunityAgentSurfaceController";
import { useWebDirectMessagesChromeController } from "./controllers/useWebDirectMessagesChromeController";
import { useWebCommunityTabAccessGuard } from "./controllers/useWebCommunityTabAccessGuard";
import { useWebMobileChromeReadingModeLifecycle } from "./controllers/useWebMobileChromeReadingModeLifecycle";
import { useWebShellActionController } from "./controllers/useWebShellActionController";
import { useWebPendingAuthIntentController } from "./controllers/useWebPendingAuthIntentController";
import { useWebCommunityNavigationActions } from "./controllers/useWebCommunityNavigationActions";
import { useWebJoinedCommunityEntryAction } from "./controllers/useWebJoinedCommunityEntryAction";
import { useWebDiscoverActivationController } from "./controllers/useWebDiscoverActivationController";
import { useWebAccountGraphLifecycle } from "./controllers/useWebAccountGraphLifecycle";
import { useWebAuthenticatedIdentityController } from "./controllers/useWebAuthenticatedIdentityController";
import { useWebShellState } from "./controllers/useWebShellState";
import { useWebOnboardingProfileController } from "./controllers/useWebOnboardingProfileController";
import { useWebMemberEntryController } from "./controllers/useWebMemberEntryController";
import { useWebShellNavigationController } from "./controllers/useWebShellNavigationController";
import { useWebAppAuthController } from "./controllers/useWebAppAuthController";
import { useWebAppActivityController } from "./controllers/useWebAppActivityController";
import { captureProductAnalyticsEvent } from "./posthogAnalytics";
import {
  copyTextToClipboard,
  getAvatarColor,
  getInitials,
} from "../../../shared/chatUi";
import {
  type SettingsGroup,
} from "../../../shared/appShellNavigation";
import type {
  CommunityAccess as SharedCommunityAccess,
  UserProfile as SharedUserProfile,
} from "../../../shared/communityTypes";
import {
  type PublicRoute,
  buildCommunityTabPath,
  buildSettingsIndexPath,
  buildSettingsPath,
} from "../../../shared/webAppRouteState";
import { shouldHydrateWebRouteAccountSetup } from "../../../shared/webRouteAccess";
import {
  communityInitials,
} from "../../../shared/messageMetadataUi";
import { renderTextWithLinks } from "../../../shared/linkEmbedUi";
import { EntityNamesProvider } from "../../../shared/entityChipsUi";
import { readBannerFileAsWideDataUrlWithinLimit } from "../../../shared/imageTransforms";
import { resetWebSessionStateAfterSignOut } from "./auth/resetSessionState";
import { usePointerSortableList } from "../../../shared/usePointerSortableList";
import { useWebCommunityAccessController } from "../../../shared/useWebCommunityAccessController";
import { useWebDiscoverController } from "../../../shared/useWebDiscoverController";
import { useWebToastController } from "../../../shared/useWebToastController";
import { useWebSettingsImageUploadController } from "../../../shared/useWebSettingsImageUploadController";
import { truncateReplyPreview } from "../../../shared/communityMessageParsing";
import {
  toCanonicalCommunityVisibility,
} from "../../../shared/communityVisibility";
import {
  type AccountCommerceStatus,
} from "../../../shared/accountCommerceStatusGateway";
import {
  deriveCommunityFunnelAction,
  type CommunityFunnelAction,
} from "./communityJoinPolicy";
import { useWebAccountCommerceActions } from "./controllers/useWebAccountCommerceActions";
import { useWebAccountCommerceStatus } from "./controllers/useWebAccountCommerceStatus";
import { useWebDiscoverAddress } from "./controllers/useWebDiscoverAddress";
import type { WebCommunityDiscoverPageProps } from "./components/WebCommunityDiscoverPage";
import { useWebBillingUiController } from "./controllers/useWebBillingUiController";
import { useWebBuilderOfferController } from "./controllers/useWebBuilderOfferController";
import { useWebMobileShellController } from "./controllers/useWebMobileShellController";
import { useWebPostAuthBillingLifecycle } from "./controllers/useWebPostAuthBillingLifecycle";
import { useWebPostAuthStripeConnectLifecycle } from "./controllers/useWebPostAuthStripeConnectLifecycle";
import { useWebCommunityRouteController } from "./controllers/useWebCommunityRouteController";
import { useWebRouteAccessBoundaryController } from "./controllers/useWebRouteAccessBoundaryController";
import { useWebSelectedCommunityController } from "./controllers/useWebSelectedCommunityController";
import { useWebUiPersistenceLifecycle } from "./controllers/useWebUiPersistenceLifecycle";
import { buildWebShellProjection } from "./controllers/buildWebShellProjection";
import { buildWebDestinationFromShellState } from "./controllers/buildWebDestinationFromShellState";
import { buildWebAuthShellProjection } from "./controllers/buildWebAuthShellProjection";
import { buildWebCommunitySurfaceProjection } from "./controllers/buildWebCommunitySurfaceProjection";
import {
  buildWebCommunitySettingsImageUploadArgs,
  buildWebCommunitySettingsProjectionBindings,
  buildWebCommunitySettingsSignOutResetArgs,
} from "./controllers/buildWebCommunitySettingsBindings";
import { buildWebCommunityContentProjectionBindings } from "./controllers/buildWebCommunityContentBindings";
import { buildWebCommunityChatProjectionBindings } from "./controllers/buildWebCommunityChatBindings";
import { buildWebSettingsPanelsProps } from "./controllers/buildWebSettingsPanelsProps";
import { buildWebCommunityAttentionView } from "./controllers/buildWebCommunityAttentionView";
import {
  buildWebCommunityAgentHomeProps,
  buildWebShellAccountProps,
} from "./controllers/buildWebCommunityAgentHomeProps";
import { useCommunitySettingsAccessLifecycle } from "../../../shared/useCommunitySettingsAccessLifecycle";
import type { WebSettingsPanelsProps } from "./components/WebSettingsPanels";
import { WebAppCompositionRoot } from "./components/WebAppCompositionRoot";
import { WebRouteAccessHold } from "./components/WebRouteAccessHold";
import { useWebDirectMessagesController } from "./controllers/useWebDirectMessagesController";
import { buildWebShellChromeHostProps } from "./controllers/buildWebShellChromeHostProps";
import { useWebChannelPeoplePanel } from "./controllers/useWebChannelPeoplePanel";
import type { WebCommunityAgentDockHandle } from "./components/WebCommunityAgentDock";
import type {
  WebCommunityRecord,
} from "./webAppContracts";
import {
  WEB_IMAGE_DATA_URL_CHAR_LIMIT,
} from "./webAppRuntime";
import { useWebCommunityVisualIdentityRegistryLifecycle } from "./controllers/useWebCommunityVisualIdentityRegistryLifecycle";
import {
  useWebStartedCommunityCompletionController,
  useWebPendingCommunityController,
} from "./controllers/useWebStartedCommunityController";
import {
  useWebBuilderPurchaseFlowController,
  useWebBuilderSetupSubscriptionController,
} from "./controllers/useWebBuilderSetupFlowController";
import { memberPreviewChannels } from "../../../shared/communityMemberPreview";


type CommunityRecord = WebCommunityRecord;
type MessageAttachment = WebCommunityMessageAttachment;
type CommunityAccess = SharedCommunityAccess;
type UserProfile = SharedUserProfile;

export default function App() {
  bootConvexProbe();
  const appActivity = useWebAppActivityController();
  const directMessages = useWebDirectMessagesController();
  const {
    openRequest: directMessageOpenRequest,
    openConversationRequest: directMessageOpenConversationRequest,
    unreadCount: directMessagesUnreadCount,
    setUnreadCount: setDirectMessagesUnreadCount,
    openConversationById: handleOpenDirectConversationById,
    toggle: handleToggleDirectMessages,
    open: handleOpenDirectMessages,
    close: handleCloseDirectMessages,
    closeByUser: handleCloseDirectMessagesByUser,
    openFromCommunity: handleOpenDirectMessageFromCommunity,
  } = directMessages;
  const resetWebSessionStateRef =
    useRef<() => Promise<void>>(() => {
      beginBrowserSignedOutState();
      return Promise.resolve();
    });
  const accountGraphLifecycle = useWebAccountGraphLifecycle();
  const {
    session,
    setAuthError,
    sessionRef,
    isAuthBootstrapComplete,
    authPresentationState,
    authError,
    retryAuthBootstrap,
    requireSignIn,
    handleSignOut,
    ensureUsableAuthSession,
    fetchWithAuth,
    fetchWithPublic,
    sessionArg,
    authenticatedSessionArg,
  } = useWebAppAuthController({
    resumeEpoch: appActivity.resumeEpoch,
    onSessionLost: accountGraphLifecycle.onSessionLost,
    onSessionMissingAfterBootstrap:
      accountGraphLifecycle.onSessionMissingAfterBootstrap,
    onSessionReady: accountGraphLifecycle.onSessionReady,
    onSessionResumeReady: accountGraphLifecycle.onSessionResumeReady,
    onDidJustSignIn: accountGraphLifecycle.onDidJustSignIn,
    onAfterSignOut: accountGraphLifecycle.onAfterSignOut,
  });
  const authenticatedIdentity = useWebAuthenticatedIdentityController(session);
  // What pages are given: one object per signed-in person, so a token renewal
  // does not make every panel load again (shared/pageSession.ts).
  const shownSession = pageSession(session);
  const { canonicalUserId: canonicalSessionUserId } = authenticatedIdentity;
  const profileStorageUserId = canonicalSessionUserId;
  const { upsertCommunityVisualIdentities } =
    useWebCommunityVisualIdentityRegistryLifecycle(canonicalSessionUserId);
  const shellState = useWebShellState();
  const {
    publicRoute,
    setPublicRoute,
    initialCommunitySlug,
    shellVariant,
    setShellVariant,
    mobileOverlay,
    setMobileOverlay,
    mobileRootPage,
    setMobileRootPage,
    mobileSettingsView,
    setMobileSettingsView,
    mobileChromeReadingMode,
    setMobileChromeReadingMode,
    stripeConnectReturn,
    setStripeConnectReturn,
    activePage,
    setActivePage,
    activeView,
    setActiveView,
    settingsPage,
    setSettingsPage,
    settingsGroup,
    selectedProductDocSlug,
    setSelectedProductDocSlug,
    communityTab,
    setCommunityTab,
    communityChannelSlug,
    setCommunityChannelSlug,
    communityResourceModuleId,
    setCommunityResourceModuleId,
    communityPodSlug,
    setCommunityPodSlug,
    communitySettingsPane,
    setCommunitySettingsPane,
    appTheme,
    setAppTheme,
  } = shellState;
  const shouldHydrateAccountSetup =
    shouldHydrateWebRouteAccountSetup({
      publicRoute,
      activePage,
      pathname: window.location.pathname || "/",
    }) || publicRoute.kind === "community_funnel";
  const onboardingProfile = useWebOnboardingProfileController({
    session,
    getSession: () => sessionRef.current ?? session,
    ensureSession: ensureUsableAuthSession,
    requireSignIn,
    profileStorageUserId,
    activePage,
    publicRouteKind: publicRoute.kind,
    shouldHydrateAccountSetup,
    isAuthBootstrapComplete,
    resumeEpoch: appActivity.resumeEpoch,
  });
  const {
    profile: profileUi,
    cloudProfile,
    setCloudProfile,
    effectiveAccountSetupStatus,
    isAccountSetupResolved,
    isProfileSetupCompleteForPublicActions,
    isAccountSetupCompleteForBuilderActions,
    isOnboardingModalOpen,
    isSavingOnboarding,
    onboardingError,
    setOnboardingError,
    openProfileSetup,
    refreshAccountSetupStatus,
    completeAccountSetupAndContinue,
    routeTryPolynetFree,
    resetSignedOutState: resetOnboardingProfileState,
  } = onboardingProfile;
  const billingUi = useWebBillingUiController<AccountCommerceStatus>();
  const {
    accountCommerceStatus,
    setAccountCommerceStatus,
    setIsLoadingAccountCommerce,
    accountCommerceError,
    setAccountCommerceError,
    isStartingStripeConnectOnboarding,
    setIsStartingStripeConnectOnboarding,
  } = billingUi;
  const {
    isLoadingCommunities,
    setIsLoadingCommunities,
    hasResolvedCommunities,
    setHasResolvedCommunities,
    communities,
    setCommunities,
    profilesByUserId,
    setProfilesByUserId,
    railCommunities,
    handleReorderCommunityRail,
  } = useWebCommunityDirectoryState({
    canonicalSessionUserId,
    initiallyLoading: Boolean(session),
  });
  const {
    activeCommunity,
    activeCommunityId,
    activeCommunitySlug,
    selectedActiveCommunityId,
    selectedActiveCommunitySlug,
    setActiveCommunityId,
    resolveKnownCommunityIdBySlug,
    resolveKnownCommunitySlugById,
    applyCommunityShellState,
  } = useWebSelectedCommunityController<CommunityRecord>({
    initialCommunitySlug,
    communities,
    setCommunityTab,
    setCommunityChannelSlug,
  });
  const { loadCommunities, loadUserProfiles } = useWebCommunityAccessController<
    AuthSession,
    CommunityRecord,
    UserProfile
  >({
    toCanonicalCommunityVisibility,
    activeCommunitySlug: selectedActiveCommunitySlug,
    loadingResetKey: canonicalSessionUserId,
    ensureSession: ensureUsableAuthSession,
    setIsLoadingCommunities,
    setHasResolvedCommunities,
    setCommunities,
    applyCommunityShellState,
    setProfilesByUserId,
    onVisualIdentitiesLoaded: upsertCommunityVisualIdentities,
  });
  const shellNavigation = useWebShellNavigationController({
    session,
    isAuthBootstrapComplete,
    publicRoute,
    setPublicRoute,
    shellVariant,
    setShellVariant,
    activePage,
    setActivePage,
    activeView,
    setActiveView,
    settingsPage,
    setSettingsPage,
    mobileSettingsView,
    setMobileSettingsView,
    selectedProductDocSlug,
    setSelectedProductDocSlug,
    selectedActiveCommunitySlug,
    communityTab,
    communityChannelSlug,
    setCommunityChannelSlug,
    communityResourceModuleId,
    setCommunityResourceModuleId,
    communityPodSlug,
    setCommunityPodSlug,
    communitySettingsPane,
    setCommunitySettingsPane,
    applyCommunityShellState,
    setStripeConnectReturn,
  });
  const {
    navigateTo,
    applyAppRouteState,
    pushNavSnapshot,
    openGlobalSettings,
    goBack,
    backTargetSnapshot,
    backTargetLabel: effectiveBackTargetLabel,
  } = shellNavigation;
  const inboxRoute = useWebInboxRoute({
    directMessages,
    activePage,
    communityTab,
    communitySlug: selectedActiveCommunitySlug,
    navigateTo,
    openConversationById: handleOpenDirectConversationById,
  });
  // Inbox is open exactly while the address is Inbox's (design v1).
  const isDirectMessagesOpen = inboxRoute.isOpen;
  const memberEntry = useWebMemberEntryController({
    session,
    shellVariant,
    getSession: () => sessionRef.current ?? session,
    navigateTo,
    applyCommunityShellState,
    setAppPublicRoute: () => setPublicRoute({ kind: "app" }),
    reloadCommunities: loadCommunities,
  });
  const {
    resolveAndEnter: resolveAndEnterMemberDestination,
  } = memberEntry;
  shellNavigation.memberEntryActionsRef.current = {
    resolveAndEnter: resolveAndEnterMemberDestination,
  };
  const communityChannels = useWebCommunityChannelsController({
    activeCommunityId,
    requestedChannelSlug: communityChannelSlug,
    session,
    ensureSession: ensureUsableAuthSession,
    setRequestedChannelSlug: setCommunityChannelSlug,
    onChannelCreated: (created) => {
      const path = buildCommunityTabPath(
        selectedActiveCommunitySlug,
        "chat",
        null,
        null,
        created.slug,
      );
      if (path) navigateTo(path);
    },
    onChannelDeleted: (deleted) => {
      if (String(communityChannelSlug ?? "general").trim().toLowerCase() !== deleted.slug) return;
      const path = buildCommunityTabPath(selectedActiveCommunitySlug, "chat");
      if (path) navigateTo(path);
    },
  });
  const {
    channels: activeCommunityChannels,
    isLoadingChannels: isLoadingActiveCommunityChannels,
    selectedChannel: activeCommunityChannel,
    activeChannelId,
    selectedChannelSlug: activeCommunityChannelSlug,
    isChannelContextReady: isActiveCommunityChannelReady,
    maxActiveChannels: maxActiveCommunityChannels,
    isAtChannelLimit: isAtCommunityChannelLimit,
    isCreatingChannel: isCreatingCommunityChannel,
    createChannelError: communityChannelCreateError,
    clearCreateChannelError: clearCommunityChannelCreateError,
    createChannel: handleCreateCommunityChannel,
    reorderChannels: handleReorderCommunityChannels,
    isReorderingChannels: isReorderingCommunityChannels,
    reorderChannelsError: communityChannelReorderError,
    clearReorderChannelsError: clearCommunityChannelReorderError,
  } = communityChannels;
  const activeChannelScope = deriveActiveChannelScope({
    activeCommunityId,
    isChannelContextReady: communityChannels.isChannelContextReady,
    channelResolutionStatus: communityChannels.channelResolutionStatus,
    channelsError: communityChannels.channelsError,
  });
  const { activeChannelCommunityId } = activeChannelScope;

  const communityInteractionProjection = useWebCommunityInteractionProjection<MessageAttachment>({
    activeCommunityId: activeChannelCommunityId,
    activeChannelId,
    activeChannelIsGeneral: Boolean(activeCommunityChannel?.is_general),
    canonicalSessionUserId,
    ensureSession: ensureUsableAuthSession,
    isCommunityChatActive:
      activePage === "community" &&
      activeView === "home" &&
      communityTab === "chat",
    session,
  });
  const {
    roots: communityInteractionRoots,
    activityEvents: communityActivityEvents,
    repliesByRootId: communityInteractionRepliesByRootId,
    selectedRootId: selectedCommunityInteractionRootId,
    isLoadingRoots: isLoadingCommunityInteractions,
    serveIssue: communityAgentServeIssue,
    closeDrawer: handleCloseCommunityInteractionDrawer,
    dismissServeIssue: handleDismissCommunityAgentServeIssue,
  } = communityInteractionProjection;

  const communityAgentComposerApiRef = useRef<WebCommunityAgentDockHandle | null>(null);
  const canMentionEverybodyRef = useRef(false);
  const communityChat = useWebCommunityChatController({
    activeCommunityId: activeChannelCommunityId,
    activeChannelId,
    canonicalSessionUserId,
    ensureSession: ensureUsableAuthSession,
    interaction: communityInteractionProjection,
    isProfileSetupResolved: isAccountSetupResolved,
    isProfileSetupComplete: isProfileSetupCompleteForPublicActions,
    onMessageSent: ({ communityId, hasAttachments, hasReply }) => {
      captureProductAnalyticsEvent("community message sent", {
        community_id: communityId,
        has_attachments: hasAttachments,
        has_reply: hasReply,
        surface: "community_chat",
      });
    },
    onOpenProfileSetup: openProfileSetup,
    session,
    canMentionEverybodyRef,
  });
  const communityContent = useWebCommunityContentController({
    activeCommunityId,
    activePage,
    communityTab,
    ensureSession: ensureUsableAuthSession,
    getSession: () => sessionRef.current ?? session,
    session,
  });
  // A community just created opens on Home, behind its last step.
  const launchTab = "agent" as const;
  const { pendingCommunity: pendingLaunchCommunity } = useWebPendingCommunityController({
    communities,
    activeCommunityId,
    tab: launchTab,
    applyCommunityShellState,
  });
  const communityAdministration = useWebCommunityAdministrationState({
    activeCommunityId,
    ensureSession: ensureUsableAuthSession,
    resumeEpoch: appActivity.resumeEpoch,
    session,
  });
  const {
    communityJoinRequests,
    isLoadingCommunityJoinRequests,
    hasLoadedCommunityJoinRequests,
    communityJoinRequestsError,
    decidingCommunityJoinRequestId,
  } = communityAdministration.joinRequests;
  const {
    isSetting: isSettingCommunityFreeAccessMode,
    error: communityFreeAccessModeError,
  } = communityAdministration.freeAccess;
  const {
    communityDirectoryMembers,
    communityDirectoryMemberCount,
  } = communityAdministration.directory;
  const {
    activeCommunityAccess,
    memberPreview,
    isLoadingCommunityAccess,
    communityAccessLoadError,
    retryActiveCommunityAccess,
    isActiveCommunityOwner,
    communitySettingsLayer,
    canManageCommunitySettings,
    canViewActiveCommunityPolynet,
    canViewMemberPlanDetailsActiveCommunity,
    canViewMembersActiveCommunity,
    canViewActiveCommunitySettings,
    canPostMessagesActiveCommunity,
    canManageResourcesActiveCommunity,
    canModerateContentActiveCommunity,
    canManageMembersActiveCommunity,
    canReviewJoinRequestsActiveCommunity,
    canViewActiveCommunityAnalytics,
    communitySocialSummary,
    activeCommunityPresenceSummary,
    isLoadingActiveCommunityPresence,
  } = communityAdministration.access;
  canMentionEverybodyRef.current = canManageMembersActiveCommunity;
  const canPostMessagesActiveChannel =
    isActiveCommunityChannelReady && canPostMessagesActiveCommunity;

  useWebCommunityTabAccessGuard({
    activePage,
    activeCommunityId,
    activeCommunityAccessId:
      activeCommunityAccess?.community_id ?? null,
    isLoadingCommunityAccess,
    communityTab,
    canViewSettings: canViewActiveCommunitySettings,
    canManageMembers: canManageMembersActiveCommunity,
    canViewAnalytics: canViewActiveCommunityAnalytics,
    canViewMembers: canViewMembersActiveCommunity,
    setCommunityResourceModuleId,
    applyCommunityShellState,
  });

  const communityAnalyticsRange = communityAdministration.analytics.range;
  const communitySettingsUi = communityAdministration.settingsUi;
  const communityAgentConfigUi = communityAdministration.agentConfigUi;
  const communityAdminUi = communityAdministration.adminUi;

  const shellPublicRoute: PublicRoute = publicRoute;

  const {
    syncCommunitySelection,
    openPublicCommunityFunnel,
    openCommunityTab,
    openCommunityHome,
    openCommunityChat,
  } = useWebCommunityRouteController<CommunityRecord>({
    activePage,
    activeView,
    activeCommunityId: selectedActiveCommunityId,
    activeCommunitySlug: selectedActiveCommunitySlug,
    communityTab,
    communityChannelSlug,
    communities,
    navigateTo,
    pushNavSnapshot,
    setActivePage,
    setActiveView,
    applyCommunityShellState,
  });
  const operatorComplimentaryAccess =
    accountCommerceStatus?.operator_complimentary_access === true;
  const founderBilling = useWebFounderBillingController({
    session,
    ensureSession: ensureUsableAuthSession,
    operatorComplimentaryAccess,
    onCommunityReady: (_communityId, readySession) => loadCommunities(readySession),
  });
  const {
    pendingBuilderSetupSubscription,
    suppressBuilderSetupSubscription,
  } = useWebBuilderSetupSubscriptionController(
    founderBilling.overview.unassigned_subscriptions,
  );
  const builderOffer = useWebBuilderOfferController({
    startCheckout: founderBilling.startCheckout,
    openPortal: founderBilling.openPortal,
  });
  const enterJoinedCommunity = useWebJoinedCommunityEntryAction({
    session,
    shellVariant,
    sessionRef,
    resolveKnownCommunitySlugById,
    syncCommunitySelection,
    setPublicRoute,
    applyAppRouteState,
    loadCommunities,
  });
  const completePendingCommunityLaunch =
    useWebStartedCommunityCompletionController({
      pendingCommunity: pendingLaunchCommunity,
      tab: launchTab,
      ensureSession: ensureUsableAuthSession,
      setCommunities,
      enterCommunity: enterJoinedCommunity,
    });

  const {
    loadSelfProfile,
    saveProfileToCloud,
    handleApproveCommunityJoinRequest,
    handleDenyCommunityJoinRequest,
    communityMemberManagement,
    handleSaveCommunityAgentConfig,
    communitySettingsController,
    activeCommunityMembersJoinReviewMode,
  } = useWebCommunityAdminStackController({
    session,
    sessionRef,
    ensureSession: ensureUsableAuthSession,
    requireSignIn: () => requireSignIn(),
    activePage,
    settingsGroup: settingsGroup as SettingsGroup,
    communityTab,
    communitySettingsPane,
    resumeEpoch: appActivity.resumeEpoch,
    activeCommunity,
    activeCommunityId,
    communities,
    setCommunities,
    setProfilesByUserId,
    setCloudProfile,
    profileUi,
    administration: communityAdministration,
    founderBilling,
    loadCommunities,
    loadUserProfiles,
    applyCommunityShellState,
    setActivePage,
    setActiveView,
    openGlobalSettings,
    upsertCommunityVisualIdentities,
  });
  const {
    loadMemberBillingHistory: loadCommunityMemberBillingHistory,
    setMemberRole: handleSetCommunityContextMemberRole,
    removeMember: handleRemoveCommunityContextMember,
    banMember: handleBanCommunityContextMember,
    setFreeAccessMode: handleSetCommunityContextFreeAccessMode,
  } = communityMemberManagement;
  const {
    resetCommunitySettingsSelection,
    loadCommunitySettings,
    loadCommunityMemberSettings,
  } = communitySettingsController;
  const {
    discoverCommunities,
    setDiscoverCommunities,
    isLoadingDiscover,
    discoverError,
    setDiscoverError,
    lastDiscoverLoadAttemptedAt,
    loadDiscoverCommunities,
  } = useWebDiscoverController({
    toCanonicalCommunityVisibility,
    onVisualIdentitiesLoaded: upsertCommunityVisualIdentities,
  });

  const { appToast, showAppToastMessage } = useWebToastController();
  useWebAuthErrorToastLifecycle({
    authError,
    showToast: showAppToastMessage,
  });
  resetWebSessionStateRef.current = () => {
    setCommunityChannelSlug(null);
    return resetWebSessionStateAfterSignOut({
      beginBrowserSignedOutState,
      setCommunities,
      setIsLoadingCommunities,
      setActiveCommunityId,
      setCommunityTab,
      resetCommunityChatState: communityChat.resetChatState,
      resetCommunityContentState: communityContent.resetContentState,
      ...buildWebCommunitySettingsSignOutResetArgs(communitySettingsUi),
      setDiscoverCommunities,
    });
  };
  useWebUiPersistenceLifecycle({
    communityAnalyticsRange,
  });

  // Cloud session is hydrated from browser auth continuity during lifecycle bootstrap.

  const {
    profilesByUserId: savedProfilesByUserId,
    displayName,
  } =
    useWebCommunityProfileHydrationController({
      activePage,
      canonicalSessionUserId,
      resumeEpoch: appActivity.resumeEpoch,
      session,
      cloudProfile,
      profilesByUserId,
      communityDirectoryMembers,
      communityActivityEvents,
      communityInteractionRoots,
      communityInteractionRepliesByRootId,
      loadUserProfiles,
    });

  useCommunitySettingsAccessLifecycle<AuthSession>({
    activePage,
    communityTab,
    ...sessionArg,
    activeCommunityId,
    activeCommunityAccess,
    resetCommunitySettingsSelection,
    loadCommunitySettings,
    loadCommunityMemberSettings,
    setCommunityMemberMuted: communityAdminUi.setCommunityMemberMuted,
  });

  const communityAttentionCommunityIds = useMemo(
    () => communities.map((community) => community.id),
    [communities],
  );
  const {
    events: communityEvents,
    hasLoadedVisibleEventsRange: hasLoadedActiveCommunityEventsRange,
  } = communityContent;
  const {
    typingPresence: communityTypingUsers,
    signalTyping: signalCommunityTyping,
    clearTyping: clearCommunityTyping,
    attentionByCommunityId,
    chatDividerBoundary,
    handleChatCaughtUp,
  } = useWebCommunityAttentionModel({
    activeCommunityId: activeChannelCommunityId,
    detailCommunityId: activePage === "community" ? activeCommunityId : null,
    activeChannelId,
    activeChannelSlug: activeCommunityChannelSlug,
    activePage,
    canPostMessages: canPostMessagesActiveChannel,
    communityIds: communityAttentionCommunityIds,
    communityTab,
    ensureSession: ensureUsableAuthSession,
    session,
    chat: {
      hasResolved: isActiveCommunityChannelReady && !isLoadingCommunityInteractions,
    },
    interactions: {
      roots: communityInteractionRoots,
      repliesByRootId: communityInteractionRepliesByRootId,
    },
    resources: {
      isLoading: communityContent.isLoadingResources,
    },
    events: {
      cacheKey: communityContent.eventsCacheKey,
      hasLoadedVisibleRange: hasLoadedActiveCommunityEventsRange,
      isLoading: communityContent.isLoadingEvents,
      rows: communityEvents,
    },
  });
  const { communityChannelIndicators } = useMemo(
    () =>
      buildWebCommunityAttentionView({
        activeCommunityId,
        attentionByCommunityId,
      }),
    [activeCommunityId, attentionByCommunityId],
  );

  const { startStripeConnectOnboarding } =
    useWebAccountCommerceActions({
      getSession: () => sessionRef.current,
      ensureSession: ensureUsableAuthSession,
      requireSignIn: () => requireSignIn(),
      onConnectOnboardingStarted: ({ context, communitySlug, country }) => {
        captureProductAnalyticsEvent("stripe connect onboarding started", {
          billing_context: context,
          community_slug: communitySlug,
          country,
          surface: context === "community" ? "community_settings" : "account_settings",
        });
      },
      setAccountCommerceError,
      setIsStartingStripeConnectOnboarding,
      navigateToUrl: (url) => window.location.assign(url),
    });

  const { loadAccountCommerceStatus } = useWebAccountCommerceStatus({
    ensureSession: ensureUsableAuthSession,
    setIsLoadingAccountCommerce,
    setAccountCommerceError,
    setAccountCommerceStatus,
  });
  const communityUi = useWebCommunityUiController<
    AuthSession,
    CommunityRecord
  >({
    ...authenticatedSessionArg,
    isAccountSetupResolved,
    isAccountSetupComplete: isAccountSetupCompleteForBuilderActions,
    onPrimaryUnauthenticated: (draft) => {
      requireSignIn({ reason: "create_community", payload: { draft } });
    },
    onCreateUnauthenticated: (draft) => {
      requireSignIn({ reason: "create_community", payload: { draft } });
    },
    onAccountSetupRequired: openProfileSetup,
    onAccountSetupUnavailable: () => {
      showAppToastMessage(
        "We are still verifying your account. Try again in a moment.",
      );
    },
    onCommunityCreated: (community, context) => {
      captureProductAnalyticsEvent("community_created", { community_id: community.id });
      suppressBuilderSetupSubscription(
        context.founderSubscriptionId,
        "attached",
      );
      setCommunities((prev) => [community, ...prev]);
      void founderBilling.refresh(sessionRef.current);
      void enterJoinedCommunity({
        communityId: community.id,
        communitySlug: community.slug,
        // Where the launch step leaves them: Home in design v1 (it used to
        // open Knowledge, for the knowledge step that was removed).
        communityTab: launchTab,
      });
    },
    onCommunityCreateRecoveryRequired: (founderSubscriptionId) => {
      suppressBuilderSetupSubscription(founderSubscriptionId, "attached");
      const activeSession = sessionRef.current;
      const refresh = activeSession
        ? Promise.all([
          loadCommunities(activeSession),
          founderBilling.refresh(activeSession),
        ])
        : Promise.resolve([]);
      return refresh.then(() => {
        showAppToastMessage("Your Agent plan is already attached. We refreshed your communities.");
      });
    },
    onRequiredCommunityCreateUnavailable: (founderSubscriptionId) => {
      suppressBuilderSetupSubscription(founderSubscriptionId, "unavailable");
      showAppToastMessage(
        "This Agent plan payment is no longer available for setup. Review Billing to continue.",
      );
      navigateTo("/settings/billing");
      void founderBilling.refresh(sessionRef.current);
    },
    readBannerFileAsWideDataUrlWithinLimit,
    isLikelyImageFile,
    maxCreateImageDataUrlChars: WEB_IMAGE_DATA_URL_CHAR_LIMIT,
    createUnauthenticatedErrorMessage: "Sign in to create a community.",
  });
  const {
    openCommunityPurchaseFlow: openNewCommunityPurchaseFlow,
  } = useWebBuilderPurchaseFlowController({
    pendingSubscriptionId: pendingBuilderSetupSubscription?.subscription_id ?? null,
    sessionUserId: session?.user.id ?? null,
    isAuthBootstrapComplete,
    isAccountSetupResolved,
    isAccountSetupComplete: isAccountSetupCompleteForBuilderActions,
    isCreateModalOpen: communityUi.modalHostProps.createModal.isOpen,
    requiredSubscriptionId: communityUi.requiredFounderSubscriptionId,
    openCreateCommunityModal: communityUi.openCreateCommunityModal,
    openRequiredCreateCommunityModal: communityUi.openRequiredCreateCommunityModal,
    closeRequiredCreateCommunityModal: communityUi.closeRequiredCreateCommunityModal,
  });
  const { resumePendingAuthIntent } =
    useWebPendingAuthIntentController({
      session,
      showToast: showAppToastMessage,
      openCreateCommunity: openNewCommunityPurchaseFlow,
      routeTryPolynetFree,
    });
  onboardingProfile.actionsRef.current = {
    navigateTo,
    enterDefaultDestination: resolveAndEnterMemberDestination,
    resumePendingAuthIntent,
  };
  accountGraphLifecycle.actionsRef.current = {
    loadBilling: loadAccountCommerceStatus,
    loadCommunities,
    loadSelfProfile,
    resetSessionState: () => resetWebSessionStateRef.current(),
    resumePendingAuthIntent,
    shouldTreatCommunitiesAsCritical: () =>
      activePage === "community" ||
      Boolean(String(selectedActiveCommunitySlug ?? "").trim()),
    onSignedOut: (reason) => {
      resetOnboardingProfileState();
      if (reason !== "session_missing_after_bootstrap") return;
      applyCommunityShellState({
        communityId: null,
        communitySlug: null,
        communityTab: "chat",
      });
      profileUi.setProfileSaveError(null);
    },
  };

  // /c/<slug> is the community's landing page (WebCommunityLandingPage).
  const isPublicCommunityFunnel = shellPublicRoute.kind === "community_funnel";
  const accountSetupRouteAccessState =
    !session
      ? "not_applicable" as const
      : !isAccountSetupResolved
        ? "resolving" as const
        : effectiveAccountSetupStatus?.completed
          ? "allowed" as const
          : "denied" as const;
  const {
    shouldHoldRouteForAccess,
    communityResolutionError,
    retryCommunityResolution,
  } =
    useWebRouteAccessBoundaryController<
      AuthSession,
      CommunityRecord,
      CommunityAccess
    >({
      publicRoute: shellPublicRoute,
      activePage,
      activeCommunitySlug: selectedActiveCommunitySlug,
      pathname: shellNavigation.readCurrentPathname(),
      authState: authPresentationState,
      communities,
      session,
      isAuthBootstrapComplete,
      accountSetupAccessState: accountSetupRouteAccessState,
      ensureSession: ensureUsableAuthSession,
      loadCommunities,
      syncCommunitySelection,
      resolveAndEnterMemberDestination,
      navigateTo,
    });

  useWebPostAuthBillingLifecycle({
    session: session,
    setAccountCommerceStatus,
    setAccountCommerceError,
    setIsLoadingAccountCommerce,
    loadAccountCommerceStatus,
  });

  useWebPostAuthStripeConnectLifecycle({
    session,
    stripeConnectReturn,
    clearStripeConnectReturn: () => setStripeConnectReturn(null),
    setAccountCommerceError,
    loadAccountCommerceStatus,
    startStripeConnectOnboarding,
  });


  const settingsImageUpload = useWebSettingsImageUploadController(
    buildWebCommunitySettingsImageUploadArgs({
      settingsUi: communitySettingsUi,
      profileUi,
      isLikelyImageFile,
      maxWebImageDataUrlChars: WEB_IMAGE_DATA_URL_CHAR_LIMIT,
      setAuthError,
    }),
  );
  const accountSetupSurface = useWebAccountSetupSurfaceController<AuthSession>({
    session,
    getSession: () => sessionRef.current ?? session,
    profile: profileUi,
    isSaving: isSavingOnboarding,
    error: onboardingError,
    onAvatarUpload: settingsImageUpload.handleProfileAvatarUpload,
  });

  const activeCommunityFunnelAction = useMemo<CommunityFunnelAction | null>(() => {
    if (!activeCommunity) return null;
    return deriveCommunityFunnelAction({
      entry_policy: activeCommunity.entry_policy,
    });
  }, [activeCommunity]);

  const communityVoice = useWebCommunityVoiceController({
    session,
    sessionRef,
    ensureSession: ensureUsableAuthSession,
    activeCommunity,
    activeCommunityFunnelAction,
    canPostMessagesActiveCommunity,
    requireSignIn: () => requireSignIn(),
    showAppToastMessage,
    isProfileSetupResolved: isAccountSetupResolved,
    isProfileSetupComplete: isProfileSetupCompleteForPublicActions,
    openProfileSetup,
    setCommunityMessageInput: communityChat.setMessageInput,
    chatInputRef: communityChat.inputRef,
    appendCommunityAgentTranscript: (transcript) =>
      communityAgentComposerApiRef.current?.appendTranscript(transcript),
    focusCommunityAgentInput: () => communityAgentComposerApiRef.current?.focusInput(),
  });

  const hasSelectedCommunity = Boolean(String(selectedActiveCommunitySlug ?? activeCommunity?.slug ?? "").trim());
  const webDestination = buildWebDestinationFromShellState({
    publicRoute: shellPublicRoute,
    shellState,
    selectedCommunitySlug: selectedActiveCommunitySlug,
  });
  const shellProjection = buildWebShellProjection({
    publicRouteKind: shellPublicRoute.kind,
    shellVariant,
    destination: webDestination,
    mobileRootPage,
    mobileSettingsView,
    isPublicCommunityFunnel,
    isPublicFind: !session && activePage === "discover",
  });
  const {
    isGlobalSettings,
    showMobileAppShell,
    showMobileSettingsShell,
    showMobileShell,
    showMobileGlobalShell,
    showMobileSettingsIndex,
    showMobilePublicFunnel,
    showDesktopCommunityRail,
    showDesktopCommunityNav,
    hasLeftPanel,
    mobileShellMode,
  } = shellProjection;
  const mobileThreadPageOpen = Boolean(
    showMobileShell
    && mobileRootPage === "community"
    && activeView === "home"
    && selectedCommunityInteractionRootId,
  );
  const mobileCommunityDetailOpen = mobileThreadPageOpen;
  const mobileChromeAutoHideEnabled = Boolean(
    showMobileAppShell
    && shellPublicRoute.kind === "app"
    && activePage === "community"
    && activeView === "home"
    && communityTab === "chat"
    && mobileRootPage === "community"
    && !mobileCommunityDetailOpen
  );
  const mobileChromeScrollTrackingEnabled = Boolean(
    mobileChromeAutoHideEnabled
    && !mobileOverlay
  );
  useWebMobileChromeReadingModeLifecycle({
    autoHideEnabled: mobileChromeAutoHideEnabled,
    overlayOpen: Boolean(mobileOverlay),
    setReadingMode: setMobileChromeReadingMode,
  });
  const mobileChromeReadingModeActive = Boolean(
    mobileChromeScrollTrackingEnabled
    && mobileChromeReadingMode
  );
  useWebDiscoverAddress({
    activePage,
    isSignedIn: Boolean(session),
    communitySlug: selectedActiveCommunitySlug ?? (String(railCommunities[0]?.slug ?? "").trim() || null),
    navigateTo,
  });
  const canReorderCommunities = railCommunities.length > 1;
  const hasCommunityRailMiddleContent = railCommunities.length > 0;
  const communityRailIds = useMemo(() => railCommunities.map((community) => community.id), [railCommunities]);
  const { setContainerElement: setCommunityRailListElement, getItemBindings: getCommunityRailItemBindings, draggingId: draggingCommunityId } =
    usePointerSortableList({
      itemIds: communityRailIds,
      enabled: canReorderCommunities,
      onMoveToIndex: handleReorderCommunityRail,
    });
  const activeCommunitySocialMemberCount = activeCommunity && typeof communitySocialSummary.memberCount === "number"
    ? communitySocialSummary.memberCount
    : null;
  useWebTelemetryLifecycle({
    isAuthenticated: Boolean(session),
    userId: canonicalSessionUserId,
    accountTier: accountCommerceStatus?.account_tier ?? null,
    publicRouteKind: publicRoute.kind,
    activePage,
    activeView,
    communityId: activeCommunityId,
    communitySlug: activeCommunitySlug,
  });

  const {
    hasAuthenticatedAppShellPresentation,
    isAuthRecoveringSignedInAppShell,
    shouldHoldLandingForAuth,
  } = buildWebAuthShellProjection({
    publicRouteKind: shellPublicRoute.kind,
    activePage,
    authPresentationState,
    pathname: shellNavigation.readCurrentPathname(),
  });

  const {
    handleTopbarBackFromSettings,
    handleTopbarBackFromPublicFunnel,
    handleTopbarBackToCommunity,
    handleOpenDiscover,
  } = useWebShellActionController({
    activePage,
    activeCommunitySlug: activeCommunity?.slug ?? null,
    selectedActiveCommunitySlug,
    isAuthenticated: Boolean(session),
    goBack,
    openCommunityChat,
    resolveAndEnterMemberDestination,
    navigateTo,
    pushNavSnapshot,
    setActivePage,
    setActiveView,
  });
    const {
      handleSelectMobileRootPage,
      handleExitMobileSettings,
      openMobileCreateCommunity,
      prepareMobileGlobalNavigation,
    } = useWebMobileShellController({
      isCommunityAgentPage: activePage === "community" && communityTab === "agent",
      activeCommunitySlug: String(activeCommunity?.slug ?? "").trim() || null,
      selectedActiveCommunitySlug,
      mobileRootPage,
      canViewMembers: hasSelectedCommunity && canViewMembersActiveCommunity,
      mobileOverlay,
      showMobileShell,
      showMobileSettingsShell,
      canOpenDirectMessages: Boolean(session),
      isDirectMessagesOpen,
      isThreadPageOpen: mobileThreadPageOpen,
      setMobileOverlay,
      setMobileRootPage,
      setMobileSettingsView,
      openCommunityHome,
      handleOpenDiscover,
      openHomePage: () => {
        const path = buildCommunityTabPath(selectedActiveCommunitySlug, "agent");
        if (path) navigateTo(path);
      },
      openDirectMessages: handleOpenDirectMessages,
      closeDirectMessages: handleCloseDirectMessages,
      closeThreadPage: handleCloseCommunityInteractionDrawer,
      openCommunityCreateFlow: openNewCommunityPurchaseFlow,
    });
  const {
    handleSelectActiveCommunity,
    handleSelectCommunitySettingsPane,
    handleSelectCommunityTab,
    handleSelectCommunityTabFromMobile,
  } = useWebCommunityNavigationActions({
    activeCommunity,
    selectedActiveCommunityId,
    selectedActiveCommunitySlug,
    communities,
    shellVariant,
    communitySettingsDirtyRef: communitySettingsUi.communitySettingsDirtyRef,
    communityAgentConfigDirtyRef: communityAgentConfigUi.communityAgentConfigDirtyRef,
    syncCommunitySelection,
    resolveKnownCommunitySlugById,
    setCommunitySettingsPane,
    setCommunityResourceModuleId,
    setMobileOverlay,
    applyCommunityShellState,
    openCommunityTab,
    navigateTo,
    pushNavSnapshot,
  });

  // Design system v1: "Search or ask" and ⌘K open your guide on Home.
  useGuideSearchShortcut(handleSelectCommunityTab, communityAgentComposerApiRef);
  const activeCommunityAgentOn = communityAgentOnFromAccess(
    activeCommunity && activeCommunityAccess?.community_id === activeCommunity.id ? activeCommunityAccess.agent_on : null,
  );
  const activeCommunityAppLinks = useCommunityAppLinksState({ session, ensureSession: ensureUsableAuthSession, communityId: activeCommunity?.id ?? null });

  const { peopleOpen, changeOpen: handlePeoplePanelOpenChange, openMembers: handleOpenCommunityMembers } =
    useWebChannelPeoplePanel({
      userId: session?.user.id,
      communityId: activeCommunityId,
      channelSlug: communityChannelSlug,
      inChat: activePage === "community" && communityTab === "chat",
      canViewMembers: canViewMembersActiveCommunity,
      closeDetail: () => {
        if (showMobileShell) prepareMobileGlobalNavigation();
        handleCloseCommunityInteractionDrawer();
      },
      openGeneral: () => {
        const path = buildCommunityTabPath(selectedActiveCommunitySlug, "chat");
        if (!path) return false;
        navigateTo(path);
        return true;
      },
    });

  const communityContextJoinRequests = useMemo(
    () =>
      buildWebCommunityContextJoinRequests({
        activeCommunityId,
        joinRequests: communityJoinRequests,
        profilesByUserId: savedProfilesByUserId,
        displayName,
      }),
    [activeCommunityId, communityJoinRequests, displayName, savedProfilesByUserId],
  );

  // Discover (docs/specs/discover-v1.md): the page inside a community, and
  // the same page for someone in no community yet.
  const discoverPageProps: WebCommunityDiscoverPageProps = {
    joined: railCommunities.flatMap((community) => {
      const slug = String(community.slug ?? "").trim();
      return slug ? [{ slug, name: community.name, avatarUrl: community.avatar_url ?? null }] : [];
    }),
    onOpenCommunity: (community) => activateDiscoverCommunityCard({ canActivate: Boolean(community.slug), community }),
    onOpenJoined: (slug) => openCommunityChat(slug),
    onStartCommunity: openNewCommunityPurchaseFlow,
  };

  const { communityChatPanelProps, communitySecondarySurfaceProps } =
    buildWebCommunitySurfaceProjection({
      canViewCommunityKnowledgeGraph: canViewActiveCommunityPolynet,
      activePage,
      communityTab,
      activeCommunity,
      session: shownSession,
      ensureSession: ensureUsableAuthSession,
      selectedActiveCommunitySlug,
      isAuthBootstrapComplete,
      hasAuthenticatedPresentation: hasAuthenticatedAppShellPresentation,
      isAuthRecoveringSignedIn: isAuthRecoveringSignedInAppShell,
      hasSession: Boolean(session),
      onOpenDirectMessageFromCommunity: handleOpenDirectMessageFromCommunity,
      hasResolvedCommunities,
      isLoadingCommunities,
      sessionUserId: canonicalSessionUserId,
      communityMemberCount: communityDirectoryMemberCount ?? activeCommunitySocialMemberCount,
      isResolvingCommunityAccess: isLoadingCommunityAccess,
      communityAccessLoadError,
      onRetryCommunityAccess: retryActiveCommunityAccess,
      canViewActiveCommunitySettings,
      communitySettingsLayer,
      communitySettingsPane,
      onSelectCommunitySettingsPane: handleSelectCommunitySettingsPane,
      canManageCommunitySettings,
      requireSignIn,
      accountCommerceStatus,
      communityPlatformFeeBps:
        founderBilling.overview.communities.find(
          (community) => community.community_id === activeCommunity?.id,
        )?.platform_fee_bps ?? null,
      accountCommerceError,
      startStripeConnectOnboarding,
      isStartingStripeConnectOnboarding,
      ...buildWebCommunitySettingsProjectionBindings({
        administration: communityAdministration,
        settingsController: communitySettingsController,
        imageUpload: settingsImageUpload,
        handleSaveCommunityAgentConfig,
      }),
      aiAgentHasSession: Boolean(session),
      canManageMembersActiveCommunity,
      aiAgentHandbookEditorProps: { communityId: activeCommunityId, session, ensureSession: ensureUsableAuthSession },
      // This community's Agent plan, shown on Guide (owners only: it's their billing).
      aiAgentPlanProps: {
        community: founderBilling.overview.communities.find((community) => community.community_id === activeCommunityId && community.lifecycle_status === "active") ?? null,
        isLoading: founderBilling.isLoading,
        isActing: founderBilling.actionCommunityId === activeCommunityId,
        error: founderBilling.error,
        openPortal: founderBilling.openPortal,
        onOpenBuilderOffer: (community) => builderOffer.open({ community }),
        refresh: founderBilling.refresh,
      },
      canViewActiveCommunityAnalytics,
      ...buildWebCommunityContentProjectionBindings({
        communityContent,
        communityResourceModuleId,
        setCommunityResourceModuleId,
        session: shownSession,
        ensureSession: ensureUsableAuthSession,
        activeCommunity,
        memberPreviewActive: memberPreview.active,
        communityTab,
        communityPodSlug,
        selectedActiveCommunitySlug,
        navigateTo,
        createRoom: handleCreateCommunityChannel,
        roomAttention: communityChannelIndicators,
      }),
      canManageResourcesActiveCommunity,
      canModerateContentActiveCommunity,
      discoverProps: discoverPageProps,
      memberPreview: memberPreview.active,
      canPostMessagesActiveCommunity: canPostMessagesActiveChannel,
      isProfileSetupComplete: isProfileSetupCompleteForPublicActions,
      onCommunityTypingSignal: signalCommunityTyping,
      onCommunityTypingClear: clearCommunityTyping,
      profilesByUserId: savedProfilesByUserId,
      mentionableCommunityMembers: communityDirectoryMembers,
      communityAgentServeIssue,
      onDismissCommunityAgentServeIssue: handleDismissCommunityAgentServeIssue,
      onStartBuilderFromServeIssue: () => openNewCommunityPurchaseFlow(),
      onFinishProfileSetup: openProfileSetup,
      displayName,
      getAvatarColor,
      getInitials,
      formatChatTime,
      truncateReplyPreview,
      renderTextWithLinks,
      ...buildWebCommunityChatProjectionBindings({
        communityChat,
        voice: communityVoice,
      }),
      interactionProjection: buildWebCommunityInteractionProjectionProps({
        peopleOpen,
        onPeopleOpenChange: handlePeoplePanelOpenChange,
        mobileThreadPage: mobileThreadPageOpen,
        channels: communityChannels,
        channelScope: activeChannelScope,
        interaction: communityInteractionProjection,
        session,
        canonicalSessionUserId,
        chatDividerBoundary,
        handleChatCaughtUp,
        setCommunityChannelSlug,
        mobileChromeScrollTrackingEnabled,
        setMobileChromeReadingMode,
        typingPresence: communityTypingUsers,
        presenceSummary: activeCommunityPresenceSummary,
        isLoadingCommunityPresence: isLoadingActiveCommunityPresence,
        activeCommunityId,
        communityOwnerId: activeCommunity?.owner_id ?? null,
        canManageCommunityMembers: canManageMembersActiveCommunity,
        canReviewCommunityJoinRequests: canReviewJoinRequestsActiveCommunity,
        canModerateContent: canModerateContentActiveCommunity,
        communityJoinReviewMode: activeCommunityMembersJoinReviewMode,
        communityJoinRequests: communityContextJoinRequests,
        isLoadingCommunityJoinRequests,
        communityJoinRequestsError,
        decidingCommunityJoinRequestId,
        onApproveCommunityJoinRequest: handleApproveCommunityJoinRequest,
        onDenyCommunityJoinRequest: handleDenyCommunityJoinRequest,
        canViewMemberPlanDetails: canViewMemberPlanDetailsActiveCommunity,
        isActiveCommunityOwner,
        communityInitials,
        onSetCommunityMemberRole: handleSetCommunityContextMemberRole,
        onRemoveCommunityMember: handleRemoveCommunityContextMember,
        onBanCommunityMember: handleBanCommunityContextMember,
        loadMemberBillingHistory: loadCommunityMemberBillingHistory,
      }),
    });
  const activateDiscoverCommunityCard =
    useWebDiscoverActivationController({
      setDiscoverError,
      resolveKnownCommunityIdBySlug,
      enterJoinedCommunity,
      openPublicCommunityFunnel,
    });
  const emailPreferences = useWebEmailPreferencesController({
    session,
    isEnabled: activePage === "settings" && settingsGroup === "account",
  });
  const settingsPanelsProps: WebSettingsPanelsProps = buildWebSettingsPanelsProps({
    settingsGroup: settingsGroup as SettingsGroup,
    session: session,
    sessionRef,
    cloudProfile,
    profileUi,
    loadSelfProfile,
    handleProfileAvatarDrop: settingsImageUpload.handleProfileAvatarDrop,
    handleProfileAvatarUpload: settingsImageUpload.handleProfileAvatarUpload,
    getInitials,
    saveProfileToCloud,
    authError,
    requireSignIn,
    handleSignOut,
    founderBilling,
    emailPreferences,
    appTheme,
    setAppTheme,
  });
  const {
    activeCommunityAttentionCount,
    communityTabIndicators,
    communityRailAttentionById,
  } = deriveWebCommunityAttentionChrome({
    activeCommunityId,
    attentionByCommunityId,
  });
  const {
    notifications: directMessageWebNotifications,
    button: directMessagesButton,
  } = useWebDirectMessagesChromeController({
    isAuthenticated: Boolean(session),
    isOpen: isDirectMessagesOpen,
    unreadCount: directMessagesUnreadCount,
    toggle: handleToggleDirectMessages,
    open: handleOpenDirectMessages,
    openConversation: handleOpenDirectConversationById,
  });

  const globalOverlayHostProps = buildWebAppGlobalOverlayProps({
    communityModalHostProps: communityUi.modalHostProps,
    canonicalSessionUserId,
    displayName,
    savedProfilesByUserId,
    builderOffer,
    founderBilling,
    pendingLaunchCommunity,
    session,
    ensureSession: ensureUsableAuthSession,
    completePendingCommunityLaunch,
    appToast,
  });

  const mainSurfaceHostProps = buildWebAppMainSurfaceProps({
    activePage,
    activeView,
    communityTab,
    isPublicCommunityFunnel,
    publicRoute: shellPublicRoute,
    session,
    shownSession,
    shouldHoldLandingForAuth,
    openNewCommunityPurchaseFlow,
    requireSignIn,
    effectiveAccountSetupStatus,
    accountSetupSurfaceModel: accountSetupSurface.model,
    completeAccountSetupAndContinue,
    isOnboardingModalOpen,
    settingsGroup: settingsGroup as SettingsGroup,
    settingsPage,
    showMobileSettingsShell,
    showMobileSettingsIndex,
    navigateTo,
    settingsPanelsProps,
    communityChatPanelProps,
    communitySecondarySurfaceProps,
    admission: {
      mode: activeCommunity?.entry_policy === "open" || activeCommunity?.entry_policy === "approval" ? activeCommunity.entry_policy : null,
      canManage: canManageMembersActiveCommunity,
      pending: isSettingCommunityFreeAccessMode,
      error: communityFreeAccessModeError,
      onChange: handleSetCommunityContextFreeAccessMode,
    },
    discoverPageProps,
    isLoadingDiscover,
    discoverCommunities,
    discoverError,
    activateDiscoverCommunityCard,
    selectedProductDocSlug,
    setSelectedProductDocSlug,
  });
  // The guide's page: desktop Home, and design v1's phone Home tab. On a v1
  // phone it stays one page across the tabs (hidden off Home), so a draft to
  // the guide survives a look at Inbox.
  const communityAgentPageMode = true;
  const leavePhoneHome = () => {
    if (showMobileShell && mobileRootPage === "agent") setMobileRootPage("community");
  };
  const {
    community: communityAgentDockCommunity,
    surfaceContext: communityAgentSurfaceContext,
    isVisible: isCommunityAgentDockVisible,
  } = useWebCommunityAgentSurfaceController({
    pageMode: communityAgentPageMode,
    activePage,
    communityTab,
    activeCommunity,
    isAuthenticated: Boolean(session),
    publicRouteKind: publicRoute.kind,
    hasResolvedCommunities,
    isDirectMessagesOpen,
    isOnboardingModalOpen,
    communityAgentVoiceUiState: communityVoice.communityAgentVoiceUiState,
    cancelVoiceInput: communityVoice.cancelVoiceInput,
  });
  // A member has no restricted channel, so a preview leaves one for General.
  useCloseInboxOnSettings({
    isOnSettingsPage: activePage === "settings" || (activePage === "community" && communityTab === "settings"),
    isInboxOpen: isDirectMessagesOpen,
    closeInbox: handleCloseDirectMessages,
  });

  const handleToggleMemberPreview = (on: boolean) => {
    memberPreview.set(on);
    // Private rooms are Pods — stay inside the Pod so hosts can inspect the
    // enrolled-member experience directly without getting kicked out.
  };
  const shellChromeHostProps = buildWebShellChromeHostProps({
    account: buildWebShellAccountProps({
      canonicalSessionUserId,
      displayName,
      savedProfilesByUserId,
      activeCommunity,
      activeCommunityAccess,
      memberPreview,
      onToggleMemberPreview: handleToggleMemberPreview,
      appTheme,
      onSetAppTheme: setAppTheme,
      onSignOut: handleSignOut,
    }),
    // Members is a page of the community (/c/:slug/members).
    onOpenCommunityMembers: () => handleSelectCommunityTab("members"),
    onToggleDirectMessages: handleToggleDirectMessages,
    isDirectMessagesOpen,
    showMobileAppShell,
    showMobileSettingsShell,
    showMobilePublicFunnel,
    mobileOverlay,
    mobileChromeAutoHideEnabled,
    mobileChromeReadingMode: mobileChromeReadingModeActive,
    showMobileShell,
    showMobileGlobalShell,
    mobileShellMode,
    mobileRootPage,
    mobileThreadPageOpen,
    showMobileSettingsIndex,
    activePage,
    destination: webDestination,
    activeCommunity,
    activeCommunityAttentionCount,
    activeCommunityMemberFaces:
      canViewMembersActiveCommunity
        ? activeCommunityPresenceSummary?.online_faces ?? []
        : [],
    activeCommunityMemberCount:
      canViewMembersActiveCommunity
        ? communityDirectoryMemberCount ??
          activeCommunityPresenceSummary?.member_count ??
          null
        : null,
    canOpenMobileMembers: canViewMembersActiveCommunity,
    handleExitMobileSettings,
    handleCloseMobileThreadPage: handleCloseCommunityInteractionDrawer,
    handleSelectMobileRootPage,
    prepareMobileGlobalNavigation,
    setMobileOverlay,
    isPublicCommunityFunnel,
    hasBackTargetSnapshot: Boolean(backTargetSnapshot),
    backTargetLabel: effectiveBackTargetLabel ?? null,
    directMessagesButton,
    handleTopbarBackFromPublicFunnel,
    handleTopbarBackFromSettings,
    handleTopbarBackToCommunity,
    communityTab,
    communityTabIndicators,
    communityChannels: memberPreview.active ? memberPreviewChannels(activeCommunityChannels) : activeCommunityChannels,
    isLoadingCommunityChannels: isLoadingActiveCommunityChannels,
    selectedCommunityChannelSlug: activeCommunityChannelSlug,
    isInPodRoom: activeCommunityChannel?.access_mode === "restricted",
    communityChannelIndicators,
    handleSelectCommunityChannel: (channel) => {
      const path = buildChannelSelectPath(selectedActiveCommunitySlug, channel);
      if (path) navigateTo(path);
    },
    handleCreateCommunityChannel,
    isCreatingCommunityChannel,
    communityChannelCreateError,
    clearCommunityChannelCreateError,
    isAtCommunityChannelLimit,
    maxActiveCommunityChannels,
    handleReorderCommunityChannels,
    isReorderingCommunityChannels,
    communityChannelReorderError,
    clearCommunityChannelReorderError,
    canViewMembersActiveCommunity,
    canViewActiveCommunitySettings,
    canManageMembersActiveCommunity,
    canViewActiveCommunityAnalytics,
    isLoadingCommunityAccess:
      isAuthRecoveringSignedInAppShell || isLoadingCommunityAccess,
    handleSelectCommunityTab,
    handleSelectCommunitySettingsPane,
    isActiveCommunityOwner: communitySettingsLayer === "owner",
    communitySettingsPane,
    handleSelectCommunityTabFromMobile,
    onCopyCommunityJoinLink: copyTextToClipboard,
    canOpenDirectMessages: Boolean(session),
    directMessagesUnreadCount,
    // Discover is a page of the community you are in.
    handleOpenDiscover: () => {
      if (selectedActiveCommunitySlug) handleSelectCommunityTab("discover");
      else handleOpenDiscover();
    },
    openMobileCreateCommunity,
    openCommunityCreateFlow: openNewCommunityPurchaseFlow,
    communities,
    railCommunities,
    communityRailAttentionById,
    isLoadingCommunities,
    selectedActiveCommunitySlug,
    handleSelectActiveCommunity: (community) => {
      const nextCommunity =
        railCommunities.find((candidate) => candidate.id === community.id) ??
        communities.find((candidate) => candidate.id === community.id);
      return nextCommunity ? handleSelectActiveCommunity(nextCommunity) : false;
    },
    openCommunityChat,
    openCommunityHome,
    communityInitials,
    showDesktopCommunityRail,
    showDesktopCommunityNav,
    hasCommunityRailMiddleContent,
    canReorderCommunities,
    draggingCommunityId,
    setCommunityRailListElement,
    getCommunityRailItemBindings,
    handleOpenGlobalSettings: shellVariant === "mobile"
      ? () => navigateTo(buildSettingsIndexPath())
      : () => openGlobalSettings("profile"),
    openGlobalSettings,
    openMobileSettingsPage: (page) => navigateTo(buildSettingsPath(page)),
    settingsGroup: settingsGroup as SettingsGroup,
    setSettingsPage,
    hasLeftPanel,
    isGlobalSettings,
  });

  if (shouldHoldRouteForAccess) {
    const routeAdmissionError =
      authError ??
      onboardingError ??
      communityResolutionError;
    const retryRouteAdmission = () => {
      if (authError) {
        retryAuthBootstrap();
        return;
      }
      if (communityResolutionError) {
        retryCommunityResolution();
        return;
      }
      setOnboardingError(null);
      void refreshAccountSetupStatus();
    };
    return (
      <WebRouteAccessHold
        shellChromeHostProps={shellChromeHostProps}
        mainSurfaceHostProps={mainSurfaceHostProps}
        error={routeAdmissionError}
        onRetry={retryRouteAdmission}
      />
    );
  }

  return (
    <EntityNamesProvider session={shownSession} communityId={activeCommunityId} communitySlug={selectedActiveCommunitySlug} navigate={navigateTo}>
    <WebAppCompositionRoot
      communityAgentOn={activeCommunityAgentOn}
      communityAppLinks={activeCommunityAppLinks}
      globalOverlayHostProps={globalOverlayHostProps}
      communityAgentDockRef={communityAgentComposerApiRef}
      communityAgentDockProps={{
        home: buildWebCommunityAgentHomeProps({
          designV1Active: true,
          activeCommunity,
          canonicalSessionUserId,
          activeCommunityAccess,
          displayName,
          canReviewJoinRequestsActiveCommunity,
          communityContextJoinRequests,
          hasLoadedCommunityJoinRequests,
          communityJoinRequestsError,
          decidingCommunityJoinRequestId,
          onApproveJoinRequest: (id) => void handleApproveCommunityJoinRequest(id),
          onDeclineJoinRequest: (id) => void handleDenyCommunityJoinRequest(id),
          selectedActiveCommunitySlug,
          activeCommunityChannels,
          leavePhoneHome,
          onOpenJoinRequests: () => {
            leavePhoneHome();
            const members = buildCommunityTabPath(selectedActiveCommunitySlug, "members");
            if (members) navigateTo(`${members}/requests`);
            else shellChromeHostProps.communityShell.onOpenMembers();
          },
          onOpenMembers: () => shellChromeHostProps.communityShell.onOpenMembers(),
          onSelectCommunityChannel: (channel) =>
            shellChromeHostProps.communityShell.onSelectCommunityChannel(channel),
          navigateTo,
          onSelectCommunityTab: handleSelectCommunityTab,
          onTurnOnAgent: () => openGlobalSettings("billing"),
          presence: activeCommunityPresenceSummary,
        }),
        pageMode: communityAgentPageMode,
        pageActive: showMobileShell
          ? mobileRootPage === "agent"
          : activePage === "community" && communityTab === "agent",
        isVisible: isCommunityAgentDockVisible,
        isSuppressed: false,
        canManageResources: canManageResourcesActiveCommunity,
        mobileShellActive: showMobileShell,
        mobileRoot: showMobileShell && mobileRootPage === "agent",
        onRequestOpen: () => showMobileShell ? handleSelectMobileRootPage("agent") : handleSelectCommunityTab("agent"),
        community: communityAgentDockCommunity,
        surfaceContext: communityAgentSurfaceContext,
        session: shownSession,
        ensureSession: ensureUsableAuthSession,
        fetchPublic: fetchWithPublic,
        fetchAuth: fetchWithAuth,
        voiceButtonProps: {
          state: communityVoice.communityAgentVoiceUiState,
          title: communityVoice.communityAgentVoiceIntent.title,
          onClick: () => {
            void communityVoice.handleVoiceInputClick("member_agent");
          },
        },
        finalizeVoiceInputForSubmit: () =>
          communityVoice.finishVoiceInputForSubmit("member_agent"),
        onStartBuilder: () => openNewCommunityPurchaseFlow(),
      }}
      directMessagesHostProps={buildWebAppDirectMessagesHostProps({
        activeCommunityId: activeCommunity?.id ?? null,
        isOpen: isDirectMessagesOpen,
        onActiveConversationChange: inboxRoute.onActiveConversationChange,
        addressConversationId: inboxRoute.addressConversationId,
        mobileRoot: showMobileShell && mobileRootPage === "messages",
        openRequest: directMessageOpenRequest,
        openConversationRequest: directMessageOpenConversationRequest,
        session: shownSession,
        ensureSession: ensureUsableAuthSession,
        sessionUserId: canonicalSessionUserId,
        requireSignIn: () => requireSignIn(),
        showAppToastMessage,
        setDirectMessagesUnreadCount,
        directMessageWebNotifications,
        onClose: handleCloseDirectMessagesByUser,
      })}
      mainSurfaceHostProps={mainSurfaceHostProps}
      shellChromeHostProps={shellChromeHostProps}
    />
    </EntityNamesProvider>
  );
}
