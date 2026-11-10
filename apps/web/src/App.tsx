import {
  useMemo,
  useRef,
} from "react";
import { isDesignV1Active } from "../../../shared/designSystem";
import "highlight.js/styles/github-dark.css";
import {
  beginBrowserSignedOutState,
  type AuthSession,
} from "./auth";
import { isLikelyImageFile } from "../../../shared/attachmentHelpers";
import {
  formatChatTime, formatRelativeTimeFromIso as formatRelativeTime, } from "../../../shared/contentFormatting";
import {
  formatPlanPrice,
} from "../../../shared/accountCommerce";
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
  getWebCommunityEventsMonthRange,
  useWebCommunityContentController,
} from "./controllers/useWebCommunityContentController";
import { useWebCommunityAttentionModel } from "./controllers/useWebCommunityAttentionController";
import {
  useWebCommunityAdministrationState,
  type WebCommunityJoinRequest,
} from "./controllers/useWebCommunityAdministrationState";
import { useWebAccountSetupSurfaceController } from "./controllers/useWebAccountSetupSurfaceController";
import { useWebFounderBillingController } from "./controllers/useWebFounderBillingController";
import { useWebEmailPreferencesController } from "./controllers/useWebEmailPreferencesController";
import { useWebCommunityVoiceController } from "./controllers/useWebCommunityVoiceController";
import { useWebCommunityProfileHydrationController } from "./controllers/useWebCommunityProfileHydrationController";
import { useWebCommunityDirectoryState } from "./controllers/useWebCommunityDirectoryState";
import { useWebTelemetryLifecycle } from "./controllers/useWebTelemetryLifecycle";
import { useWebAuthErrorToastLifecycle } from "./controllers/useWebAuthErrorToastLifecycle";
import { useWebCommunityAgentSurfaceController } from "./controllers/useWebCommunityAgentSurfaceController";
import { useWebDirectMessagesChromeController } from "./controllers/useWebDirectMessagesChromeController";
import { useWebCommunityTabAccessGuard } from "./controllers/useWebCommunityTabAccessGuard";
import { useWebMemberSiteHandoff } from "./controllers/useWebMemberSiteHandoff";
import { communityAccessRunsCommunity } from "../../../shared/communityAccessViewModel";
import { useWebMobileChromeReadingModeLifecycle } from "./controllers/useWebMobileChromeReadingModeLifecycle";
import { useWebShellActionController } from "./controllers/useWebShellActionController";
import { useWebPendingAuthIntentController } from "./controllers/useWebPendingAuthIntentController";
import { useWebCommunityNavigationActions } from "./controllers/useWebCommunityNavigationActions";
import { useWebJoinedCommunityEntryAction } from "./controllers/useWebJoinedCommunityEntryAction";
import { useWebDiscoverActivationController } from "./controllers/useWebDiscoverActivationController";
import { useWebAccountGraphLifecycle } from "./controllers/useWebAccountGraphLifecycle";
import { useWebAuthenticatedIdentityController } from "./controllers/useWebAuthenticatedIdentityController";
import { useWebCommunityMemberManagementController } from "./controllers/useWebCommunityMemberManagementController";
import { useWebCommunityAgentSettingsController } from "./controllers/useWebCommunityAgentSettingsController";
import { useWebCommunitySettingsController } from "./controllers/useWebCommunitySettingsController";
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
  UserProfileDetail as SharedUserProfileDetail,
} from "../../../shared/communityTypes";
import {
  type PublicRoute,
  buildAppRoutePath,
  buildCommunityTabPath,
  buildSettingsIndexPath,
  buildSettingsPath,
} from "../../../shared/webAppRouteState";
import { shouldHydrateWebRouteAccountSetup } from "../../../shared/webRouteAccess";
import { PRODUCT_DOCS_DEFAULT_SLUG } from "./docs/productDocsMeta";
import {
  communityInitials,
} from "../../../shared/messageMetadataUi";
import { renderTextWithLinks } from "../../../shared/linkEmbedUi";
import { renderMarkdown } from "../../../shared/markdownUi";
import { readBannerFileAsWideDataUrlWithinLimit } from "../../../shared/imageTransforms";
import { resetWebSessionStateAfterSignOut } from "./auth/resetSessionState";
import { usePointerSortableList } from "../../../shared/usePointerSortableList";
import { useWebCommunityAccessController } from "../../../shared/useWebCommunityAccessController";
import { useWebDiscoverController } from "../../../shared/useWebDiscoverController";
import { useWebToastController } from "../../../shared/useWebToastController";
import { useWebSettingsImageUploadController } from "../../../shared/useWebSettingsImageUploadController";
import { useCommunityAdminController } from "../../../shared/useCommunityAdminController";
import { useCommunityDirectoryLifecycle } from "../../../shared/useCommunityDirectoryLifecycle";
import { useCommunityMembersReviewController } from "../../../shared/useCommunityMembersReviewController";
import { useCommunityAdminAnalyticsLifecycle } from "../../../shared/useCommunityAdminAnalyticsLifecycle";
import { useCommunityMembersReviewLifecycle } from "../../../shared/useCommunityMembersReviewLifecycle";
import { truncateReplyPreview } from "../../../shared/communityMessageParsing";
import {
  toCanonicalCommunityVisibility,
} from "../../../shared/communityVisibility";
import {
  type AccountCommerceStatus,
} from "../../../shared/accountCommerceStatusGateway";
import {
  deriveCommunityFunnelAction,
  deriveCommunityMembersJoinReviewMode,
  type CommunityFunnelAction,
  type CommunityMembersJoinReviewMode,
} from "./communityJoinPolicy";
import { useWebAccountCommerceActions } from "./controllers/useWebAccountCommerceActions";
import { useWebAccountCommerceStatus } from "./controllers/useWebAccountCommerceStatus";
import { useWebDiscoverPreloadLifecycle } from "./controllers/useWebDiscoverPreloadLifecycle";
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
import { useCommunitySettingsAccessLifecycle } from "../../../shared/useCommunitySettingsAccessLifecycle";
import type { WebSettingsPanelsProps } from "./components/WebSettingsPanels";
import { WebAppCompositionRoot } from "./components/WebAppCompositionRoot";
import { WebRouteAccessHold } from "./components/WebRouteAccessHold";
import { useWebDirectMessagesController } from "./controllers/useWebDirectMessagesController";
import { buildWebGlobalOverlayHostProps } from "./controllers/buildWebGlobalOverlayHostProps";
import { buildWebAppMainSurfaceHostProps } from "./controllers/buildWebAppMainSurfaceHostProps";
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
  useWebBuilderKnowledgeCompletionController,
  useWebBuilderKnowledgeHydrationController,
} from "./controllers/useWebBuilderKnowledgeSetupController";
import {
  useWebBuilderPurchaseFlowController,
  useWebBuilderSetupSubscriptionController,
} from "./controllers/useWebBuilderSetupFlowController";


type CommunityRecord = WebCommunityRecord;
type MessageAttachment = WebCommunityMessageAttachment;
type CommunityAccess = SharedCommunityAccess;
type UserProfile = SharedUserProfile;
type UserProfileDetail = SharedUserProfileDetail;
type CommunityJoinRequest = WebCommunityJoinRequest;

export default function App() {
  const appActivity = useWebAppActivityController();
  const directMessages = useWebDirectMessagesController();
  const {
    isOpen: isDirectMessagesOpen,
    openRequest: directMessageOpenRequest,
    openConversationRequest: directMessageOpenConversationRequest,
    unreadCount: directMessagesUnreadCount,
    setUnreadCount: setDirectMessagesUnreadCount,
    openConversationById: handleOpenDirectConversationById,
    toggle: handleToggleDirectMessages,
    open: handleOpenDirectMessages,
    close: handleCloseDirectMessages,
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
  const {
    canonicalUserId: canonicalSessionUserId,
    isOperatorAccessResolved,
    operatorAccess,
    operatorAccessError,
    retryOperatorAccess,
    hasOperatorAccess,
  } = authenticatedIdentity;
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
    activeOperatorTab,
    setActiveOperatorTab,
    communityTab,
    setCommunityTab,
    communityChannelSlug,
    setCommunityChannelSlug,
    communityResourceModuleId,
    setCommunityResourceModuleId,
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
    hasOperatorAccess,
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
    activeOperatorTab,
    setActiveOperatorTab,
    selectedActiveCommunitySlug,
    communityTab,
    communityChannelSlug,
    setCommunityChannelSlug,
    communityResourceModuleId,
    setCommunityResourceModuleId,
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
    openOperatorConsole,
    goBack,
    backTargetSnapshot,
    backTargetLabel: effectiveBackTargetLabel,
  } = shellNavigation;
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
    channelResolutionStatus: activeCommunityChannelResolutionStatus,
    isChannelContextReady: isActiveCommunityChannelReady,
    channelsError: activeCommunityChannelsError,
    retryChannels: retryActiveCommunityChannels,
    maxActiveChannels: maxActiveCommunityChannels,
    isAtChannelLimit: isAtCommunityChannelLimit,
    isCreatingChannel: isCreatingCommunityChannel,
    createChannelError: communityChannelCreateError,
    clearCreateChannelError: clearCommunityChannelCreateError,
    createChannel: handleCreateCommunityChannel,
    managingChannelId: managingCommunityChannelId,
    manageChannelError: communityChannelManageError,
    clearManageChannelError: clearCommunityChannelManageError,
    renameChannel: handleRenameCommunityChannel,
    deleteChannel: handleDeleteCommunityChannel,
    reorderChannels: handleReorderCommunityChannels,
    isReorderingChannels: isReorderingCommunityChannels,
    reorderChannelsError: communityChannelReorderError,
    clearReorderChannelsError: clearCommunityChannelReorderError,
  } = communityChannels;
  const activeChannelCommunityId = isActiveCommunityChannelReady
    ? activeCommunityId
    : null;
  const isActiveCommunityChannelLoading =
    activeCommunityChannelResolutionStatus === "loading";
  const activeCommunityChannelResolutionError =
    activeCommunityChannelResolutionStatus === "not_found"
      ? "This channel does not exist or is no longer available."
      : activeCommunityChannelResolutionStatus === "failed"
        ? activeCommunityChannelsError
        : null;
  const isAwaitingActiveCommunityInteractionScope = Boolean(
    !activeCommunityChannelResolutionError &&
    (!isActiveCommunityChannelReady || !activeChannelCommunityId),
  );

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
    visibleRoots: visibleCommunityInteractionRoots,
    selectedReplies: selectedCommunityInteractionReplies,
    selectedRootId: selectedCommunityInteractionRootId,
    selectedRoot: selectedCommunityInteractionRoot,
    pinnedRoot: pinnedCommunityInteractionRoot,
    isUpdatingPinnedRoot: isUpdatingPinnedCommunityInteractionRoot,
    pinnedRootError: pinnedCommunityInteractionRootError,
    isLoadingRoots: isLoadingCommunityInteractions,
    isLoadingSelectedReplies: isLoadingCommunityInteractionReplies,
    error: communityInteractionError,
    selectedRepliesError: communityInteractionRepliesError,
    rootChangeReason: communityInteractionRootChangeReason,
    canLoadOlderRoots: canLoadOlderCommunityInteractionRoots,
    isLoadingOlderRoots: isLoadingOlderCommunityInteractionRoots,
    serveIssue: communityAgentServeIssue,
    loadRoots: loadCommunityInteractionRoots,
    loadReplies: loadCommunityInteractionReplies,
    loadOlderRoots: loadOlderCommunityInteractionRoots,
    selectRoot: handleSelectCommunityInteractionRoot,
    closeDrawer: handleCloseCommunityInteractionDrawer,
    toggleReaction: handleToggleCommunityInteractionReaction,
    editMessage: handleEditCommunityInteractionMessage,
    deleteMessage: handleDeleteCommunityInteractionMessage,
    setPinnedRootId: handleSetPinnedCommunityInteractionRoot,
    retryPending: handleRetryPendingCanonicalInteraction,
    discardPending: handleDiscardPendingCanonicalInteraction,
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
  const {
    messageInput: communityMessageInput,
    setMessageInput: setCommunityMessageInput,
    messageMentions: communityMessageMentions,
    setMessageMentions: setCommunityMessageMentions,
    attachments: communityAttachments,
    error: communityChatError,
    setError: setCommunityChatError,
    isSendingMessage: isSendingCommunityMessage,
    replyingToMessage,
    setReplyingToMessage,
    resetChatState: resetCommunityChatState,
    inputRef: chatInputRef,
    fileInputRef: communityFileInputRef,
    handleAttachmentFileInputChange: handleCommunityFileInputChange,
    ingestAttachmentsFromFileList: ingestCommunityAttachmentsFromFileList,
    handleAttachmentDrop: handleCommunityAttachmentDrop,
    handleAttachmentDragEnter: handleCommunityAttachmentDragEnter,
    handleAttachmentDragOver: handleCommunityAttachmentDragOver,
    handleAttachmentDragLeave: handleCommunityAttachmentDragLeave,
    handleAttachmentPaste: handleCommunityAttachmentPaste,
    isAttachmentDragOver: isCommunityAttachmentDragOver,
    removeAttachment: removeCommunityAttachment,
    openCommunityChatLightbox,
    lightbox: {
      isOpen: isCommunityChatLightboxOpen,
      images: communityChatLightboxImages,
      index: communityChatLightboxIndex,
      setIndex: setCommunityChatLightboxIndex,
      onClose: closeCommunityChatLightbox,
    },
    handleSendCommunityMessage,
    setMessageInputFromTextarea: setCommunityMessageInputFromTextarea,
  } = communityChat;
  const communityContent = useWebCommunityContentController({
    activeCommunityId,
    activePage,
    communityTab,
    ensureSession: ensureUsableAuthSession,
    getSession: () => sessionRef.current ?? session,
    session,
  });
  const {
    resources: communityResources,
    modules: communityResourceModules,
    isLoadingResources,
    isLoadingModules: isLoadingResourceModules,
    events: communityEvents,
    hasLoadedVisibleEventsRange: hasLoadedActiveCommunityEventsRange,
    isLoadingEvents: isLoadingCommunityEvents,
    eventsError: communityEventsError,
    eventsVisibleMonthIso: communityEventsVisibleMonthIso,
    setEventsVisibleMonthIso: setCommunityEventsVisibleMonthIso,
    eventsCacheKey: communityEventsCacheKey,
    resetContentState: resetCommunityContentState,
    loadCommunityResources,
    openNewModuleModal,
    handleEditModule,
    handleSetModuleStatus,
    handleDeleteModule,
    handleReorderModules,
    handleReorderResources,
    handleMoveResourceToModule,
    handleAddCommunitySources,
    resourceEditor,
    handleDeleteResource,
    handleCreateBlankPageDraft,
    resourceModuleModalProps,
    resourceModuleDeleteModalProps,
    reloadActiveEvents,
    handleSaveCommunityEvent,
    handleCancelCommunityEvent,
  } = communityContent;
  const {
    pendingBuilderKnowledgeCommunity,
    hydratedBuilderKnowledgeCommunityId,
  } = useWebBuilderKnowledgeHydrationController({
    communities,
    activeCommunityId,
    resumeEpoch: appActivity.resumeEpoch,
    getSession: () => sessionRef.current ?? session,
    applyCommunityShellState,
    loadCommunityResources,
  });
  const communityAdministration = useWebCommunityAdministrationState({
    activeCommunityId,
    ensureSession: ensureUsableAuthSession,
    resumeEpoch: appActivity.resumeEpoch,
    session,
  });
  const {
    communityJoinRequests,
    setCommunityJoinRequests,
    isLoadingCommunityJoinRequests,
    setIsLoadingCommunityJoinRequests,
    communityJoinRequestsError,
    setCommunityJoinRequestsError,
    decidingCommunityJoinRequestId,
    setDecidingCommunityJoinRequestId,
  } = communityAdministration.joinRequests;
  const {
    isSetting: isSettingCommunityFreeAccessMode,
    setIsSetting: setIsSettingCommunityFreeAccessMode,
    error: communityFreeAccessModeError,
    setError: setCommunityFreeAccessModeError,
  } = communityAdministration.freeAccess;
  const {
    communityDirectoryMembers,
    communityDirectoryMemberCount,
    loadCommunityDirectoryMembers,
  } = communityAdministration.directory;
  const {
    activeCommunityAccess,
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
    reloadActiveCommunityAccess,
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
    setCommunityResourceModuleId,
    applyCommunityShellState,
  });

  useWebMemberSiteHandoff({
    activePage,
    activeView,
    communityTab,
    communityChannelSlug,
    activeCommunityId,
    activeCommunityAccessId: activeCommunityAccess?.community_id ?? null,
    // Only while its members use the site (the owner's switch); else they stay in the app.
    activeCommunitySiteUrl: activeCommunity?.members_use === "site" ? activeCommunity.site_url : null,
    isLoadingCommunityAccess,
    communityAccessLoadError,
    runsCommunity: communityAccessRunsCommunity(activeCommunityAccess),
  });

  const {
    summary: communityAnalyticsSummary,
    setSummary: setCommunityAnalyticsSummary,
    series: communityAnalyticsSeries,
    setSeries: setCommunityAnalyticsSeries,
    range: communityAnalyticsRange,
    setRange: setCommunityAnalyticsRange,
    isLoading: isLoadingCommunityAnalytics,
    setIsLoading: setIsLoadingCommunityAnalytics,
    error: communityAnalyticsError,
    setError: setCommunityAnalyticsError,
  } = communityAdministration.analytics;

  const communitySettingsUi = communityAdministration.settingsUi;
  const {
    communitySettingsName,
    setCommunitySettingsName,
    communitySettingsSlug,
    setCommunitySettingsSlug,
    communitySettingsOneLiner,
    setCommunitySettingsOneLiner,
    communitySettingsAbout,
    setCommunitySettingsAbout,
    communitySettingsVisibility,
    setCommunitySettingsVisibility,
    communitySettingsAvatarUrl,
    setCommunitySettingsAvatarUrl,
    communitySettingsAvatarFocusX,
    setCommunitySettingsAvatarFocusX,
    communitySettingsAvatarFocusY,
    setCommunitySettingsAvatarFocusY,
    communitySettingsAvatarZoom,
    setCommunitySettingsAvatarZoom,
    communitySettingsBannerUrl,
    setCommunitySettingsBannerUrl,
    communitySettingsBannerFocusX,
    setCommunitySettingsBannerFocusX,
    communitySettingsBannerFocusY,
    setCommunitySettingsBannerFocusY,
    communitySettingsBannerZoom,
    setCommunitySettingsBannerZoom,
    communitySettingsPricingMode,
    setCommunitySettingsPricingMode,
    communitySettingsPriceUsdMonthly,
    setCommunitySettingsPriceUsdMonthly,
    communitySettingsPriceUsdAnnual,
    setCommunitySettingsPriceUsdAnnual,
    communitySettingsError,
    setCommunitySettingsError,
    communitySettingsBannerUploadError,
    setCommunitySettingsBannerUploadError,
    isProcessingCommunitySettingsBanner,
    setIsProcessingCommunitySettingsBanner,
    isCommunityAvatarFocusModalOpen,
    setIsCommunityAvatarFocusModalOpen,
    isCommunityBannerFocusModalOpen,
    setIsCommunityBannerFocusModalOpen,
    isSavingCommunitySettings,
    setIsSavingCommunitySettings,
    isSettingsBannerDragOver,
    setIsSettingsBannerDragOver,
    isSettingsAvatarDragOver,
    setIsSettingsAvatarDragOver,
    communitySettingsDirtyRef,
    isCommunitySettingsDirty,
    markCommunitySettingsDirty,
    isLoadingCommunitySettings,
    isCommunitySettingsReady,
    communitySettingsConflict,
  } = communitySettingsUi;
  const communityAgentConfigUi = communityAdministration.agentConfigUi;
  const {
    isLoadingCommunityAgentConfig,
    communityAgentConfigError,
    communityAgentConfigCommunitySystemPrompt,
    setCommunityAgentConfigCommunitySystemPrompt,
    isSavingCommunityAgentConfig,
    communityAgentConfigSaveError,
    communityAgentConfigDirtyRef,
    markCommunityAgentConfigDirty,
    handleResetCommunityAgentConfig,
  } = communityAgentConfigUi;
  const communityAdminUi = communityAdministration.adminUi;
  const {
    communityMemberMuted,
    setCommunityMemberMuted,
    isLoadingCommunityMemberSettings,
    communityMemberSettingsError,
    isLeavingCommunity,
  } = communityAdminUi;

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
  const completePendingBuilderKnowledgeSetup =
    useWebBuilderKnowledgeCompletionController({
      pendingCommunity: pendingBuilderKnowledgeCommunity,
      ensureSession: ensureUsableAuthSession,
      setCommunities,
      enterCommunity: enterJoinedCommunity,
    });

  const {
    loadSelfProfile,
    saveProfileToCloud,
    loadCommunityAnalytics,
    resetCommunityAnalytics,
    handleSetCommunityMemberRole,
    handleRemoveCommunityMember,
    handleBanCommunityMember,
  } = useCommunityAdminController<
    AuthSession,
    UserProfile,
    UserProfileDetail
  >({
    activeCommunityId,
    ...authenticatedSessionArg,
    confirmAction: (message) => confirm(message),
    reloadCommunities: loadCommunities,
    reloadCommunityAccess: reloadActiveCommunityAccess,
    getProfileSaveSession: () => sessionRef.current ?? session,
    profileSaveFailureMessage: "Failed to save profile.",
    onProfileSaveUnauthenticated: () => {
      requireSignIn();
    },
    applyLoadedProfileToLocal: profileUi.applyLoadedProfileToLocal,
    profileIsActive: activePage === "settings" && settingsGroup === "profile",
    captureProfileDraft: profileUi.captureProfileDraft,
    applySavedProfileToLocal: profileUi.applySavedProfileToLocal,
    setProfileLoadStatus: profileUi.setProfileLoadStatus,
    setProfilesByUserId,
    setCloudProfile,
    setIsSavingProfile: profileUi.setIsSavingProfile,
    setProfileSaveError: profileUi.setProfileSaveError,
    setIsLoadingCommunityAnalytics,
    setCommunityAnalyticsError,
    setCommunityAnalyticsSummary,
    setCommunityAnalyticsSeries,
  });
  const {
    resetCommunityJoinRequests,
    loadCommunityJoinRequests,
    handleApproveCommunityJoinRequest,
    handleDenyCommunityJoinRequest,
  } = useCommunityMembersReviewController<
    AuthSession,
    CommunityJoinRequest
  >({
    activeCommunityId,
    ...authenticatedSessionArg,
    loadUserProfiles: (userIds, session) => loadUserProfiles(userIds, session),
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
    setCommunityJoinRequestsError,
    setDecidingCommunityJoinRequestId,
  });
  const communityMemberManagement =
    useWebCommunityMemberManagementController({
    activeCommunityId,
    canManageMembers: canManageMembersActiveCommunity,
    ensureSession: ensureUsableAuthSession,
    loadDirectoryMembers: loadCommunityDirectoryMembers,
    removeMember: handleRemoveCommunityMember,
    banMember: handleBanCommunityMember,
    setMemberRole: handleSetCommunityMemberRole,
    setCommunities,
    setFreeAccessError: setCommunityFreeAccessModeError,
    setIsSettingFreeAccess: setIsSettingCommunityFreeAccessMode,
    clearJoinRequests: resetCommunityJoinRequests,
  });
  const {
    loadMemberBillingHistory: loadCommunityMemberBillingHistory,
    setMemberRole: handleSetCommunityContextMemberRole,
    removeMember: handleRemoveCommunityContextMember,
    banMember: handleBanCommunityContextMember,
    setFreeAccessMode: handleSetCommunityContextFreeAccessMode,
  } = communityMemberManagement;

  const communityAgentSettings =
    useWebCommunityAgentSettingsController({
    activeCommunityId,
    activePage,
    agentUi: communityAgentConfigUi,
    canManageMembers: canManageMembersActiveCommunity,
    communitySettingsPane,
    communityTab,
    ensureSession: ensureUsableAuthSession,
    session,
    setCommunities,
  });
  const {
    handleSaveCommunityAgentConfig,
  } = communityAgentSettings;
  const communitySettingsController = useWebCommunitySettingsController({
    activeCommunity,
    activeCommunityId,
    adminUi: communityAdminUi,
    ensureSession: ensureUsableAuthSession,
    loadCommunities,
    onCommunityIdentityChanged: (communityId, communitySlug) => {
      applyCommunityShellState({ communityId, communitySlug });
    },
    onLeaveCommunity: (leavingId) => {
      applyCommunityShellState({
        communityId: null,
        communitySlug: null,
        communityTab: "chat",
      });
      setActivePage("discover");
      setActiveView("home");
      setCommunities((current) =>
        current.filter((community) => community.id !== leavingId));
    },
    onCommunityArchived: (archivedId) => {
      setCommunities((current) =>
        current.filter((community) => community.id !== archivedId));
      applyCommunityShellState({
        communityId: null,
        communitySlug: null,
        communityTab: "chat",
      });
      openGlobalSettings("account");
      void founderBilling.watchArchiveCleanup(archivedId);
    },
    session,
    settingsUi: communitySettingsUi,
    setCommunities,
    onVisualIdentitySaved: (identity) => {
      upsertCommunityVisualIdentities([identity]);
    },
  });
  const {
    resetCommunitySettingsSelection,
    loadCommunitySettings,
    loadCommunityMemberSettings,
    handleToggleCommunityMute,
    handleLeaveCommunity,
    handleSaveCommunitySettings,
    handleCancelCommunitySettings,
    handleReloadLatestCommunitySettings,
    handleArchiveCommunity,
    isArchivingCommunity,
    communityArchiveError,
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
      resetCommunityChatState,
      resetCommunityContentState,
      setCommunitySettingsName,
      setCommunitySettingsSlug,
      setCommunitySettingsOneLiner,
      setCommunitySettingsVisibility,
      setCommunitySettingsAvatarUrl,
      setCommunitySettingsBannerUrl,
      setCommunitySettingsError,
      setIsSavingCommunitySettings,
      setIsSettingsBannerDragOver,
      setIsSettingsAvatarDragOver,
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

  useWebDiscoverPreloadLifecycle({
    activePage,
    isLoadingDiscover,
    lastDiscoverLoadAttemptedAt,
    loadDiscoverCommunities,
  });
  const shouldHydrateCommunityContextPanel =
    activePage === "community" &&
    communityTab === "chat";

  useCommunitySettingsAccessLifecycle<AuthSession>({
    activePage,
    communityTab,
    ...sessionArg,
    activeCommunityId,
    activeCommunityAccess,
    resetCommunitySettingsSelection,
    loadCommunitySettings,
    loadCommunityMemberSettings,
    setCommunityMemberMuted,
  });

  const communityAttentionCommunityIds = useMemo(
    () => communities.map((community) => community.id),
    [communities],
  );
  const {
    typingPresence: communityTypingUsers,
    signalTyping: signalCommunityTyping,
    clearTyping: clearCommunityTyping,
    attentionByCommunityId,
    chatDividerBoundary,
    handleChatCaughtUp,
  } = useWebCommunityAttentionModel({
    activeCommunityId: activeChannelCommunityId,
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
      isLoading: isLoadingResources,
      rows: communityResources,
    },
    events: {
      cacheKey: communityEventsCacheKey,
      hasLoadedVisibleRange: hasLoadedActiveCommunityEventsRange,
      isLoading: isLoadingCommunityEvents,
      rows: communityEvents,
    },
  });
  const communityChannelIndicators = useMemo(() => {
    const indicators = activeCommunityId
      ? attentionByCommunityId[activeCommunityId]
      : null;
    if (!indicators) return {};
    const bySlug: Record<string, { chat: boolean; mentions: boolean }> = {};
    for (const channel of indicators.channels) {
      bySlug[channel.channel_slug] = {
        chat: channel.chat,
        mentions: channel.mentions,
      };
    }
    if (!bySlug.general && indicators.channels.length === 0) {
      bySlug.general = {
        chat: indicators.chat,
        mentions: indicators.mentions,
      };
    }
    return bySlug;
  }, [activeCommunityId, attentionByCommunityId]);
  useCommunityDirectoryLifecycle<AuthSession>({
    activePage,
    communityTab,
    ...sessionArg,
    resumeEpoch: appActivity.resumeEpoch,
    activeCommunityId,
    loadCommunityDirectoryMembers,
  });

  const activeCommunityMembersJoinReviewMode = useMemo<CommunityMembersJoinReviewMode | null>(() => {
    if (!activeCommunity) return null;
    return deriveCommunityMembersJoinReviewMode({
      entry_policy: activeCommunity.entry_policy,
    });
  }, [activeCommunity]);

  useCommunityMembersReviewLifecycle<
    AuthSession,
    CommunityRecord
  >({
    ...sessionArg,
    activeCommunityId,
    communities,
    canReviewJoinRequests: canReviewJoinRequestsActiveCommunity,
    activeCommunityMembersJoinReviewMode,
    shouldLoad: shouldHydrateCommunityContextPanel,
    loadCommunityJoinRequests,
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
        communityTab: "resources",
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

  // /c/<slug> only hands over to the community's site (WebCommunityHandoff).
  const isPublicCommunityFunnel = shellPublicRoute.kind === "community_funnel";
  const operatorRouteAccessState =
    activePage !== "operator"
      ? "not_applicable" as const
      : operatorAccessError
        ? "failed" as const
      : !isOperatorAccessResolved
        ? "resolving" as const
        : operatorAccess
          ? "allowed" as const
          : "denied" as const;
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
      operatorAccessState: operatorRouteAccessState,
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


  const {
    handleSettingsBannerDrop,
    handleSettingsAvatarDrop,
    handleCommunityAvatarUpload,
    handleCommunityBannerUpload,
    handleProfileAvatarUpload,
    handleProfileAvatarDrop,
  } = useWebSettingsImageUploadController({
    setIsSettingsBannerDragOver,
    setIsSettingsAvatarDragOver,
    setIsProfileAvatarDragOver: profileUi.setIsProfileAvatarDragOver,
    setCommunitySettingsAvatarUrl,
    setCommunitySettingsAvatarFocusX,
    setCommunitySettingsAvatarFocusY,
    setCommunitySettingsAvatarZoom,
    setCommunitySettingsBannerUrl,
    setCommunitySettingsBannerFocusX,
    setCommunitySettingsBannerFocusY,
    setCommunitySettingsBannerZoom,
    setCommunitySettingsError,
    setCommunitySettingsBannerUploadError,
    setIsProcessingCommunitySettingsBanner,
    markCommunitySettingsDirty,
    onCommunityAvatarUploadSuccess: () => setIsCommunityAvatarFocusModalOpen(true),
    onCommunityBannerUploadSuccess: () => setIsCommunityBannerFocusModalOpen(true),
    isLikelyImageFile,
    maxWebImageDataUrlChars: WEB_IMAGE_DATA_URL_CHAR_LIMIT,
    setProfileAvatarUrl: profileUi.setProfileAvatarUrl,
    setProfileAvatarStorageId: profileUi.setProfileAvatarStorageId,
    setProfileAvatarFocusX: profileUi.setProfileAvatarFocusX,
    setProfileAvatarFocusY: profileUi.setProfileAvatarFocusY,
    setProfileAvatarZoom: profileUi.setProfileAvatarZoom,
    setAuthError,
    onProfileAvatarUploadSuccess: () => profileUi.setIsProfileAvatarFocusModalOpen(true),
  });
  const accountSetupSurface = useWebAccountSetupSurfaceController<AuthSession>({
    session,
    getSession: () => sessionRef.current ?? session,
    profile: profileUi,
    isSaving: isSavingOnboarding,
    error: onboardingError,
    onAvatarUpload: handleProfileAvatarUpload,
  });

  const activeCommunityFunnelAction = useMemo<CommunityFunnelAction | null>(() => {
    if (!activeCommunity) return null;
    return deriveCommunityFunnelAction({
      entry_policy: activeCommunity.entry_policy,
    });
  }, [activeCommunity]);

  const {
    communityAgentVoiceIntent,
    communityAgentVoiceUiState,
    handleVoiceInputClick,
    finishVoiceInputForSubmit,
    cancelVoiceInput,
    handleCommunityVoiceInputClick,
    activeCommunityVoiceButtonOwner,
    communityVoiceButtonTitle,
    mainCommunityVoiceButtonState,
    drawerCommunityVoiceButtonState,
  } = useWebCommunityVoiceController({
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
    setCommunityMessageInput,
    chatInputRef,
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
    communitySettingsDirtyRef,
    communityAgentConfigDirtyRef,
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
      communityJoinRequests
        .filter((request) =>
          request.community_id === activeCommunityId &&
          String(request.status ?? "").trim().toLowerCase() === "pending")
        .map((request) => {
          const profile = savedProfilesByUserId[request.user_id] ?? null;
          return {
            id: request.id,
            userId: request.user_id,
            displayName: profile?.display_name ?? displayName(request.user_id),
            avatarUrl: profile?.avatar_url ?? null,
            avatarFocusX: profile?.avatar_focus_x ?? null,
            avatarFocusY: profile?.avatar_focus_y ?? null,
            avatarZoom: profile?.avatar_zoom ?? null,
            message: (request.message ?? "").trim() || null,
            createdAtLabel: formatRelativeTime(request.created_at),
          };
        }),
    [activeCommunityId, communityJoinRequests, displayName, savedProfilesByUserId],
  );

  const { communityChatPanelProps, communitySecondarySurfaceProps } =
    buildWebCommunitySurfaceProjection({
      canViewCommunityKnowledgeGraph: canViewActiveCommunityPolynet,
      activePage,
      communityTab,
      activeCommunity,
      session: session,
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
      // The owner's switch saved: keep Studio's copy of the community in step.
      onMemberExperienceSaved: (communityId: string, experience: "app" | "site") =>
        setCommunities((previous) => previous.map((community) =>
          community.id === communityId ? { ...community, members_use: experience } : community)),
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
      settingsState: {
        isSettingsBannerDragOver,
        isProcessingCommunitySettingsBanner,
        isCommunityAvatarFocusModalOpen,
        isCommunityBannerFocusModalOpen,
        communitySettingsAvatarFocusX,
        communitySettingsAvatarFocusY,
        communitySettingsAvatarZoom,
        communitySettingsBannerUrl,
        communitySettingsBannerFocusX,
        communitySettingsBannerFocusY,
        communitySettingsBannerZoom,
        communitySettingsBannerUploadError,
        isSettingsAvatarDragOver,
        communitySettingsAvatarUrl,
        communitySettingsName,
        communitySettingsSlug,
        communitySettingsOneLiner,
        communitySettingsAbout,
        communitySettingsVisibility,
        communitySettingsPricingMode,
        communitySettingsPriceUsdMonthly,
        communitySettingsPriceUsdAnnual,
        isCommunitySettingsDirty,
        isLoadingCommunitySettings,
        isCommunitySettingsReady,
        communitySettingsConflict,
        communitySettingsError,
        isSavingCommunitySettings,
        communityMemberMuted,
        isLoadingCommunityMemberSettings,
        isLeavingCommunity,
        communityMemberSettingsError,
        isArchivingCommunity,
        communityArchiveError,
      },
      settingsActions: {
        setIsSettingsBannerDragOver,
        handleSettingsBannerDrop,
        handleCommunityBannerUpload,
        setCommunitySettingsBannerUrl,
        setCommunitySettingsBannerFocusX,
        setCommunitySettingsBannerFocusY,
        setCommunitySettingsBannerZoom,
        setCommunitySettingsBannerUploadError,
        markCommunitySettingsDirty,
        setIsSettingsAvatarDragOver,
        handleSettingsAvatarDrop,
        handleCommunityAvatarUpload,
        setCommunitySettingsAvatarUrl,
        setCommunitySettingsAvatarFocusX,
        setCommunitySettingsAvatarFocusY,
        setCommunitySettingsAvatarZoom,
        setCommunitySettingsName,
        setCommunitySettingsSlug,
        setCommunitySettingsOneLiner,
        setCommunitySettingsAbout,
        setCommunitySettingsVisibility,
        setCommunitySettingsPricingMode,
        setCommunitySettingsPriceUsdMonthly,
        setCommunitySettingsPriceUsdAnnual,
        handleCancelCommunitySettings,
        handleReloadLatestCommunitySettings,
        handleSaveCommunitySettings,
        handleToggleCommunityMute,
        handleLeaveCommunity,
        handleArchiveCommunity,
      },
      setIsCommunityAvatarFocusModalOpen,
      setIsCommunityBannerFocusModalOpen,
      communitySettingsAvatarUrl,
      communitySettingsAvatarFocusX,
      communitySettingsAvatarFocusY,
      communitySettingsAvatarZoom,
      communitySettingsBannerUrl,
      communitySettingsBannerFocusX,
      communitySettingsBannerFocusY,
      communitySettingsBannerZoom,
      markCommunitySettingsDirty,
      aiAgentHasSession: Boolean(session),
      canManageMembersActiveCommunity,
      isLoadingCommunityAgentConfig,
      communityAgentConfigError,
      aiAgentInstructionsEditorProps: {
        communityAgentConfigDirtyRef,
        handleSaveCommunityAgentConfig,
        handleResetCommunityAgentConfig,
        isSavingCommunityAgentConfig,
        communityAgentConfigSaveError,
        communityAgentConfigCommunitySystemPrompt,
        setCommunityAgentConfigCommunitySystemPrompt,
        markCommunityAgentConfigDirty,
      },
      aiAgentHandbookEditorProps: { communityId: activeCommunityId, session, ensureSession: ensureUsableAuthSession },
      canViewActiveCommunityAnalytics,
      canViewPlatformAnalytics: hasOperatorAccess,
      analyticsState: {
        communityAnalyticsRange,
        isLoadingCommunityAnalytics,
        communityAnalyticsError,
        communityAnalyticsSummary,
        communityAnalyticsSeries,
      },
      analyticsActions: {
        setCommunityAnalyticsRange,
        openPlatformAnalytics: () => openOperatorConsole("platform"),
      },
      resourcesState: {
        resourceRead: communityContent.resourceRead,
        moduleRead: communityContent.moduleRead,
        isLoadingResources,
        isLoadingResourceModules,
        modules: communityResourceModules,
        resources: communityResources,
        selectedModuleId: communityResourceModuleId,
      },
      resourcesActions: {
        retryRead: communityContent.retryResourceRead,
        handleSelectModule: setCommunityResourceModuleId,
        openNewModuleModal,
        handleEditModule,
        handleSetModuleStatus,
        handleDeleteModule,
        handleReorderModules,
        handleReorderResources,
        handleMoveResourceToModule,
        handleAddCommunitySources,
        resourceEditor,
        handleDeleteResource,
        handleCreateBlankPageDraft,
      },
      eventsState: {
        events: communityEvents,
        hasLoadedVisibleRange: hasLoadedActiveCommunityEventsRange,
        isLoadingEvents: isLoadingCommunityEvents,
        eventsError: communityEventsError,
        visibleMonthIso: communityEventsVisibleMonthIso,
      },
      eventsActions: {
        setVisibleMonthIso: setCommunityEventsVisibleMonthIso,
        getVisibleRange: getWebCommunityEventsMonthRange,
        reloadEvents: reloadActiveEvents,
        saveEvent: handleSaveCommunityEvent,
        cancelEvent: handleCancelCommunityEvent,
      },
      canManageResourcesActiveCommunity,
      canModerateContentActiveCommunity,
      resourceModuleModalProps,
      resourceModuleDeleteModalProps,
      canPostMessagesActiveCommunity: canPostMessagesActiveChannel,
      isProfileSetupComplete: isProfileSetupCompleteForPublicActions,
      onCommunityTypingSignal: signalCommunityTyping,
      onCommunityTypingClear: clearCommunityTyping,
      profilesByUserId: savedProfilesByUserId,
      mentionableCommunityMembers: communityDirectoryMembers,
      replyingToMessage,
      communityAttachments,
      communityMessageInput,
      communityMessageMentions,
      setCommunityMessageMentions,
      communityAgentServeIssue,
      onDismissCommunityAgentServeIssue: handleDismissCommunityAgentServeIssue,
      onStartBuilderFromServeIssue: () => openNewCommunityPurchaseFlow(),
      isSendingCommunityMessage,
      communityChatError,
      fileInputRef: communityFileInputRef,
      chatInputRef,
      onFinishProfileSetup: openProfileSetup,
      onSetReplyingToMessage: setReplyingToMessage,
      onRemoveCommunityAttachment: removeCommunityAttachment,
      onCommunityAttachmentError: setCommunityChatError,
      onIngestCommunityAttachmentsFromFileList: ingestCommunityAttachmentsFromFileList,
      onCommunityFileInputChange: handleCommunityFileInputChange,
      onCommunityAttachmentDrop: handleCommunityAttachmentDrop,
      onCommunityAttachmentDragEnter: handleCommunityAttachmentDragEnter,
      onCommunityAttachmentDragOver: handleCommunityAttachmentDragOver,
      onCommunityAttachmentDragLeave: handleCommunityAttachmentDragLeave,
      onCommunityAttachmentPaste: handleCommunityAttachmentPaste,
      isCommunityAttachmentDragOver,
      onCommunityMessageInputChange: setCommunityMessageInputFromTextarea,
      onSendCommunityMessage: handleSendCommunityMessage,
      displayName,
      getAvatarColor,
      getInitials,
      formatChatTime,
      truncateReplyPreview,
      renderTextWithLinks,
      onOpenCommunityChatLightbox: openCommunityChatLightbox,
      voiceButtonProps: {
        state: mainCommunityVoiceButtonState,
        title: activeCommunityVoiceButtonOwner === "drawer"
          ? "Finish the current voice capture in the thread first."
          : communityVoiceButtonTitle,
        onClick: () => handleCommunityVoiceInputClick(null, "main"),
        disabled: activeCommunityVoiceButtonOwner === "drawer",
      },
      drawerVoiceButtonProps: {
        state: drawerCommunityVoiceButtonState,
        title: activeCommunityVoiceButtonOwner === "main"
          ? "Finish the current voice capture in the main chat first."
          : communityVoiceButtonTitle,
        disabled: activeCommunityVoiceButtonOwner === "main",
      },
      onCommunityVoiceInputClick: handleCommunityVoiceInputClick,
      lightboxModalProps: {
        isOpen: isCommunityChatLightboxOpen,
        images: communityChatLightboxImages,
        index: communityChatLightboxIndex,
        setIndex: setCommunityChatLightboxIndex,
        onClose: closeCommunityChatLightbox,
      },
      interactionProjection: {
        peopleOpen,
        onPeopleOpenChange: handlePeoplePanelOpenChange,
        mobileThreadPage: mobileThreadPageOpen,
        activeChannel: isActiveCommunityChannelReady
          ? activeCommunityChannel
          : null,
        canManageActiveChannel:
          canManageMembersActiveCommunity &&
          Boolean(activeCommunityChannel),
        managingChannelId: managingCommunityChannelId,
        manageChannelError: communityChannelManageError,
        onClearManageChannelError: clearCommunityChannelManageError,
        onRenameChannel: handleRenameCommunityChannel,
        onDeleteChannel: handleDeleteCommunityChannel,
        pinnedRoot: isActiveCommunityChannelReady
          ? pinnedCommunityInteractionRoot
          : null,
        isUpdatingPinnedRoot: isUpdatingPinnedCommunityInteractionRoot,
        pinnedRootError: isActiveCommunityChannelReady
          ? pinnedCommunityInteractionRootError
          : null,
        canManagePinnedRoot:
          canManageMembersActiveCommunity && Boolean(activeCommunityChannel),
        onSetPinnedRoot: handleSetPinnedCommunityInteractionRoot,
        onMobileReadingModeChange: mobileChromeScrollTrackingEnabled
          ? setMobileChromeReadingMode
          : undefined,
        roots: isActiveCommunityChannelReady
          ? visibleCommunityInteractionRoots
          : [],
        activityEvents:
          isActiveCommunityChannelReady && activeCommunityChannel?.is_general
            ? communityActivityEvents
            : [],
        selectedRootId: isActiveCommunityChannelReady
          ? selectedCommunityInteractionRootId
          : null,
        selectedRoot: isActiveCommunityChannelReady
          ? selectedCommunityInteractionRoot
          : null,
        replies: isActiveCommunityChannelReady
          ? selectedCommunityInteractionReplies
          : [],
        isLoadingRoots:
          isActiveCommunityChannelLoading ||
          isAwaitingActiveCommunityInteractionScope ||
          (isActiveCommunityChannelReady && isLoadingCommunityInteractions),
        isLoadingReplies:
          isActiveCommunityChannelReady && isLoadingCommunityInteractionReplies,
        error:
          activeCommunityChannelResolutionError ??
          (isActiveCommunityChannelReady ? communityInteractionError : null),
        errorActionLabel:
          activeCommunityChannelResolutionStatus === "not_found"
            ? "Return to General"
            : undefined,
        repliesError: isActiveCommunityChannelReady
          ? communityInteractionRepliesError
          : null,
        onSelectRoot: handleSelectCommunityInteractionRoot,
        onCloseDrawer: handleCloseCommunityInteractionDrawer,
        onToggleReaction: handleToggleCommunityInteractionReaction,
        onEditMessage: handleEditCommunityInteractionMessage,
        onDeleteMessage: handleDeleteCommunityInteractionMessage,
        currentUserId: canonicalSessionUserId,
        chatLastSeenAt: chatDividerBoundary,
        rootChangeReason: communityInteractionRootChangeReason,
        canLoadOlderRoots: canLoadOlderCommunityInteractionRoots,
        isLoadingOlderRoots: isLoadingOlderCommunityInteractionRoots,
        onLoadOlderRoots: () => {
          if (!activeChannelCommunityId) return;
          void loadOlderCommunityInteractionRoots(activeChannelCommunityId, session);
        },
        onCaughtUp: handleChatCaughtUp,
        onRetryRoots: () => {
          if (activeCommunityChannelResolutionStatus === "not_found") {
            setCommunityChannelSlug(null);
            return;
          }
          if (activeCommunityChannelResolutionStatus === "failed") {
            retryActiveCommunityChannels();
            return;
          }
          if (!activeChannelCommunityId) return;
          void loadCommunityInteractionRoots(activeChannelCommunityId, session);
        },
        onRetryReplies: (rootId: string) => {
          void loadCommunityInteractionReplies(rootId, session);
        },
        onRetrySend: handleRetryPendingCanonicalInteraction,
        onDiscardPending: handleDiscardPendingCanonicalInteraction,
        typingPresence: isActiveCommunityChannelReady
          ? communityTypingUsers
          : undefined,
        presenceSummary: activeCommunityPresenceSummary,
        isLoadingCommunityPresence: isLoadingActiveCommunityPresence,
        communityId: activeCommunityId,
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
      },
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
  const settingsPanelsProps: WebSettingsPanelsProps = {
    settingsGroup: settingsGroup as SettingsGroup,
    profile: {
      session: session,
      cloudProfile,
      profileUi,
      reloadProfile: () => { const currentSession = sessionRef.current; if (currentSession) void loadSelfProfile(currentSession); },
      handleProfileAvatarDrop,
      handleProfileAvatarUpload,
      getInitials,
      saveProfileToCloud,
    },
    account: {
      session,
      authError,
      requireSignIn,
      handleSignOut,
      founderBillingOverview: founderBilling.overview,
      isLoadingFounderBilling: founderBilling.isLoading,
      founderBillingActionCommunityId: founderBilling.actionCommunityId,
      founderBillingError: founderBilling.error,
      onOpenBuilderOffer: (community) => builderOffer.open({ community }),
      onOpenCommunityBilling: () => openGlobalSettings("billing"),
      onOpenCreateCommunity: () => openNewCommunityPurchaseFlow(),
      retryCommunityArchive: founderBilling.retryArchiveCleanup,
      restoreCommunityWithoutPayment: founderBilling.restoreCommunityWithoutPayment,
    },
    emailPreferences: {
      isVisible: Boolean(session),
      weeklyDigestEnabled: emailPreferences.weeklyDigestEnabled,
      hasLoaded: emailPreferences.hasLoaded,
      isLoading: emailPreferences.isLoading,
      isSaving: emailPreferences.isSaving,
      error: emailPreferences.error,
      onChangeWeeklyDigestEnabled: emailPreferences.updateWeeklyDigestEnabled,
    },
    billing: {
      session,
      founderBillingOverview: founderBilling.overview,
      isLoadingFounderBilling: founderBilling.isLoading,
      founderBillingActionCommunityId: founderBilling.actionCommunityId,
      founderBillingError: founderBilling.error,
      openFounderBillingPortal: founderBilling.openPortal,
      refreshFounderBilling: founderBilling.refresh,
      onOpenBuilderOffer: (community) => builderOffer.open({ community }),
      onOpenCreateCommunity: () => openNewCommunityPurchaseFlow(),
    },
    appearance: {
      appTheme,
      setAppTheme,
    },
  };
  const activeCommunityAttentionSummary = activeCommunityId
    ? (attentionByCommunityId[activeCommunityId] ?? { chat: false, resources: false, events: false, mentions: false, channels: [] })
    : { chat: false, resources: false, events: false, mentions: false, channels: [] };
  const activeCommunityAttentionCount =
    Number(Boolean(activeCommunityAttentionSummary.chat)) +
    Number(Boolean(activeCommunityAttentionSummary.resources)) +
    Number(Boolean(activeCommunityAttentionSummary.events));
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

  const globalOverlayHostProps = buildWebGlobalOverlayHostProps({
    communityModalHostProps: communityUi.modalHostProps,
    builderOfferProps: {
      community: builderOffer.community,
      isSubmitting:
        Boolean(builderOffer.community) &&
        founderBilling.actionCommunityId === builderOffer.community?.community_id,
      error: founderBilling.error,
      onClose: builderOffer.close,
      onConfirm: builderOffer.confirm,
    },
    builderKnowledgeSetupProps: pendingBuilderKnowledgeCommunity && session
      ? {
          community: pendingBuilderKnowledgeCommunity,
          isHydrating:
            activeCommunityId !== pendingBuilderKnowledgeCommunity.id
            || hydratedBuilderKnowledgeCommunityId !== pendingBuilderKnowledgeCommunity.id
            || isLoadingResources,
          resources:
            activeCommunityId === pendingBuilderKnowledgeCommunity.id
            && hydratedBuilderKnowledgeCommunityId === pendingBuilderKnowledgeCommunity.id
              ? communityResources
              : [],
          onAddSources: handleAddCommunitySources,
          onComplete: completePendingBuilderKnowledgeSetup,
        }
      : null,
    appToast,
  });

  const selectedCommunityAnalyticsPath = buildCommunityTabPath(
    selectedActiveCommunitySlug ?? activeCommunity?.slug,
    "analytics",
  );
  const mainSurfaceHostProps = buildWebAppMainSurfaceHostProps({
    activePage,
    isPublicCommunityFunnel,
    publicRoute: shellPublicRoute,
    viewerCommunities: {
      isLoading: !isAuthBootstrapComplete || Boolean(session && !hasResolvedCommunities),
      slugs: session ? communities.map((community) => community.slug) : [],
    },
    holdLandingForAuth: shouldHoldLandingForAuth,
    isSignedOut: !session,
    landingPageProps: {
      // "Start your community free": sign in (and finish account setup), then
      // community setup. The Agent plan is bought later, from the community.
      onStartBuilderPurchase: () => {
        if (session) openNewCommunityPurchaseFlow();
        else {
          captureProductAnalyticsEvent("signin_started", { reason: "create_community" });
          requireSignIn({ reason: "create_community", payload: { draft: null } });
        }
      },
    },
    onboardingPageProps: {
      accountSetupStatus: effectiveAccountSetupStatus,
      setup: accountSetupSurface.model,
      onCompleteAccountSetup: completeAccountSetupAndContinue,
    },
    platformBridgePageProps: {
      bridge:
        session && effectiveAccountSetupStatus && !effectiveAccountSetupStatus.completed
          ? {
              variant: "platform" as const,
              communityName: "Polynet",
              communityAvatarUrl: null,
              communityAvatarFocusX: null,
              communityAvatarFocusY: null,
              communityAvatarZoom: null,
              paidReceiptLabel: null,
              enterLabel: "Enter Polynet",
              accountSetupStatus: effectiveAccountSetupStatus,
              setup: accountSetupSurface.model,
              onEnter: completeAccountSetupAndContinue,
            }
          : null,
    },
    showOnboardingModal: shellPublicRoute.kind === "app" && isOnboardingModalOpen,
    settingsSurfaceHostProps: {
      settingsGroup: settingsGroup as SettingsGroup,
      showMobileSettingsShell,
      showMobileSettingsIndex,
      onSelectMobileSettingsPage: (page) => {
        navigateTo(buildSettingsPath(page));
      },
      onShowMobileSettingsIndex: () => navigateTo(buildSettingsIndexPath()),
      settingsPanelsProps,
    },
    communityHostProps: {
      activeView,
      communityTab,
      chatPanelProps: {
        ...communityChatPanelProps,
      },
      secondaryPanelsProps: communitySecondarySurfaceProps,
      admission: {
        mode: activeCommunity?.entry_policy === "open" || activeCommunity?.entry_policy === "approval" ? activeCommunity.entry_policy : null,
        canManage: canManageMembersActiveCommunity,
        pending: isSettingCommunityFreeAccessMode,
        error: communityFreeAccessModeError,
        onChange: handleSetCommunityContextFreeAccessMode,
      },
    },
    discoverPanelProps: {
      isLoadingDiscover,
      discoverCommunitiesCount: discoverCommunities.length,
      discoverError,
      discoverCommunities,
      formatPlanPrice: (plan) => (plan ? formatPlanPrice(plan) : "Free"),
      onActivateCommunity: (community) => {
        activateDiscoverCommunityCard({
          canActivate: Boolean(community.slug),
          community,
        });
      },
    },
    productDocsPanelProps: {
      activeSlug: selectedProductDocSlug,
      onSelectSlug: (slug) => {
        const nextSlug = String(slug || PRODUCT_DOCS_DEFAULT_SLUG).trim() || PRODUCT_DOCS_DEFAULT_SLUG;
        setSelectedProductDocSlug(nextSlug);
        navigateTo(buildAppRoutePath({
          page: "docs",
          view: "home",
    settingsPage,
          communitySlug: null,
          communityTab: "chat",
          docsSlug: nextSlug,
        }) ?? "/docs");
      },
      renderMarkdown,
    },
    operatorDashboardProps:
      session && operatorAccess
        ? {
            session,
            activeTab: activeOperatorTab,
            onSelectTab: openOperatorConsole,
            onOpenCommunityAnalytics: selectedCommunityAnalyticsPath
              ? () => navigateTo(selectedCommunityAnalyticsPath)
              : null,
          }
        : null,
  });
  const {
    community: communityAgentDockCommunity,
    surfaceContext: communityAgentSurfaceContext,
    isVisible: isCommunityAgentDockVisible,
  } = useWebCommunityAgentSurfaceController({
    pageMode: !showMobileShell,
    activePage,
    communityTab,
    activeCommunity,
    isAuthenticated: Boolean(session),
    publicRouteKind: publicRoute.kind,
    hasResolvedCommunities,
    isDirectMessagesOpen,
    isOnboardingModalOpen,
    communityAgentVoiceUiState,
    cancelVoiceInput,
  });
  const activeIndicators = activeCommunityId
    ? (attentionByCommunityId[activeCommunityId] ?? { chat: false, resources: false, events: false, mentions: false, channels: [] })
    : { chat: false, resources: false, events: false, mentions: false, channels: [] };
  const communityTabIndicators = {
    chat: Boolean(activeIndicators.chat),
    resources: Boolean(activeIndicators.resources),
    events: Boolean(activeIndicators.events),
    // An unseen mention-of-you upgrades the chat dot to the accent variant.
    mentions: Boolean(activeIndicators.mentions),
  };
  const communityRailAttentionById: Record<string, boolean> = {};
  for (const [communityId, indicators] of Object.entries(attentionByCommunityId)) {
    if (indicators.chat || indicators.resources || indicators.events || indicators.mentions) {
      communityRailAttentionById[communityId] = true;
    }
  }
  const shellChromeHostProps = buildWebShellChromeHostProps({
    account: canonicalSessionUserId
      ? {
          name: displayName(canonicalSessionUserId),
          avatarUrl: savedProfilesByUserId[canonicalSessionUserId]?.avatar_url ?? null,
          // "Host" is the owner. Being able to see settings is not enough: a
          // Polynet operator can, in communities where they are only a member.
          roleLabel:
            activeCommunity &&
            activeCommunityAccess?.community_id === activeCommunity.id &&
            activeCommunityAccess.is_owner === true
              ? "Host"
              : "Member",
          appTheme,
          onSetAppTheme: setAppTheme,
          onSignOut: handleSignOut,
        }
      : undefined,
    onOpenCommunityMembers: handleOpenCommunityMembers,
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
    communityChannels: activeCommunityChannels,
    isLoadingCommunityChannels: isLoadingActiveCommunityChannels,
    selectedCommunityChannelSlug: activeCommunityChannelSlug,
    communityChannelIndicators,
    handleSelectCommunityChannel: (channel) => {
      const path = buildCommunityTabPath(
        selectedActiveCommunitySlug,
        "chat",
        null,
        null,
        channel.is_general ? null : channel.slug,
      );
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
    handleSelectCommunityTabFromMobile,
    onCopyCommunityJoinLink: copyTextToClipboard,
    canOpenDirectMessages: Boolean(session),
    directMessagesUnreadCount,
    handleOpenDiscover,
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
    settingsGroup: settingsGroup as SettingsGroup,
    setSettingsPage,
    hasLeftPanel,
    isGlobalSettings,
  });

  if (shouldHoldRouteForAccess) {
    const operatorAdmissionError = activePage === "operator"
      ? operatorAccessError
      : null;
    const routeAdmissionError =
      authError ??
      onboardingError ??
      communityResolutionError ??
      operatorAdmissionError;
    const retryRouteAdmission = () => {
      if (authError) {
        retryAuthBootstrap();
        return;
      }
      if (communityResolutionError) {
        retryCommunityResolution();
        return;
      }
      if (operatorAdmissionError) {
        retryOperatorAccess();
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
    <WebAppCompositionRoot
      globalOverlayHostProps={globalOverlayHostProps}
      communityAgentDockRef={communityAgentComposerApiRef}
      communityAgentDockProps={{
        home:
          !showMobileShell &&
          isDesignV1Active() &&
          activeCommunity &&
          canonicalSessionUserId &&
          // owner_id is the database user id and canonicalSessionUserId is the
          // sign-in subject, so ownership comes from the server's access answer.
          // Members get Home too, with member-safe facts; visitors do not.
          activeCommunityAccess?.community_id === activeCommunity.id &&
          (activeCommunityAccess.is_owner === true || activeCommunityAccess.can_read_chat === true)
            ? {
                audience: activeCommunityAccess.is_owner === true ? ("host" as const) : ("member" as const),
                communityId: activeCommunity.id,
                communityName: activeCommunity.name,
                firstName: displayName(canonicalSessionUserId).trim().split(/\s+/)[0] || "there",
                onOpenJoinRequests: shellChromeHostProps.communityShell.onOpenMembers,
                onOpenChannelByName: (channelName: string) => {
                  const channel = activeCommunityChannels.find((candidate) => candidate.name === channelName);
                  if (channel) shellChromeHostProps.communityShell.onSelectCommunityChannel(channel);
                },
                onOpenEvents: () => handleSelectCommunityTab("events"),
              }
            : null,
        pageMode: !showMobileShell,
        pageActive: activePage === "community" && communityTab === "agent",
        isVisible: isCommunityAgentDockVisible,
        isSuppressed: false,
        canManageResources: canManageResourcesActiveCommunity,
        mobileShellActive: showMobileShell,
        mobileRoot: showMobileShell && mobileRootPage === "agent",
        onRequestOpen: () => showMobileShell ? setMobileRootPage("agent") : handleSelectCommunityTab("agent"),
        community: communityAgentDockCommunity,
        surfaceContext: communityAgentSurfaceContext,
        session,
        ensureSession: ensureUsableAuthSession,
        fetchPublic: fetchWithPublic,
        fetchAuth: fetchWithAuth,
        voiceButtonProps: {
          state: communityAgentVoiceUiState,
          title: communityAgentVoiceIntent.title,
          onClick: () => {
            void handleVoiceInputClick("member_agent");
          },
        },
        finalizeVoiceInputForSubmit: () =>
          finishVoiceInputForSubmit("member_agent"),
        onStartBuilder: () => openNewCommunityPurchaseFlow(),
      }}
      directMessagesHostProps={{
        isOpen: isDirectMessagesOpen,
        mobileRoot:
          showMobileShell && mobileRootPage === "messages",
        openRequest: directMessageOpenRequest,
        openConversationRequest: directMessageOpenConversationRequest,
        session,
        ensureSession: ensureUsableAuthSession,
        sessionUserId: canonicalSessionUserId,
        getInitials,
        getAvatarColor,
        renderTextWithLinks,
        requireSignIn: () => requireSignIn(),
        showAppToastMessage,
        onUnreadCountChange: setDirectMessagesUnreadCount,
        onIncomingDirectMessage:
          directMessageWebNotifications.notifyIncoming,
        onDirectMessageSent:
          directMessageWebNotifications.requestPermissionIfNeeded,
        notificationsState:
          directMessageWebNotifications.notificationsState,
        onToggleNotifications:
          directMessageWebNotifications.toggleNotifications,
        onClose: handleCloseDirectMessages,
      }}
      mainSurfaceHostProps={mainSurfaceHostProps}
      shellChromeHostProps={shellChromeHostProps}
    />
  );
}
