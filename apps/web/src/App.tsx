import {
  lazy,
  useMemo,
  useRef,
  Suspense,
  type ChangeEvent,
} from "react";
import "highlight.js/styles/github-dark.css";
import {
  beginBrowserSignedOutState,
  getAuthPublicKey,
  getAuthUrl,
  type AuthSession,
} from "./auth";
import {
  clearPendingPurchaseClaimToken, storePendingPublicJoin, storePendingPurchaseClaimToken, type PendingPurchaseClaim
} from "../../../shared/pay_first";
import { resolveAuthSubject } from "../../../shared/authSession";
import { getAuthUid } from "../../../shared/authCore";
import { CommunityAvatar } from "../../../shared/CommunityAvatar";
import {
  isLikelyImageFile,
} from "../../../shared/attachmentHelpers";
import {
  DEFAULT_EMPTY_THREAD_LANDING, normalizeCommunityAgentLanding, } from "../../../shared/communityAgentLanding";
import {
  formatChatTime, formatCount, formatMoneyBaseUnits, formatPercent, formatRelativeTimeFromIso as formatRelativeTime, } from "../../../shared/contentFormatting";
import {
  formatPlanPrice,
  formatSubscriptionPrice,
} from "../../../shared/accountCommerce";
import { useCheckoutFinalizeController } from "../../../shared/useCheckoutFinalizeController";
import { useWebCommunityUiController } from "./controllers/useWebCommunityUiController";
import {
  useWebCommunityInteractionProjection,
} from "./controllers/useWebCommunityInteractionProjection";
import { useWebCommunityChannelsController } from "./controllers/useWebCommunityChannelsController";
import {
  useWebCommunityChatController,
  WEB_COMMUNITY_REACTION_EMOJIS,
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
import { useWebPublicCommunityUiController } from "./controllers/useWebPublicCommunityUiController";
import { useWebAccountSetupSurfaceController } from "./controllers/useWebAccountSetupSurfaceController";
import { useWebProviderConnectionsController } from "./controllers/useWebProviderConnectionsController";
import { useWebFounderInferenceController } from "./controllers/useWebFounderInferenceController";
import { useWebFounderBillingController } from "./controllers/useWebFounderBillingController";
import { useWebCommunityVoiceController } from "./controllers/useWebCommunityVoiceController";
import { useWebCommunityProfileHydrationController } from "./controllers/useWebCommunityProfileHydrationController";
import { useWebCommunityDirectoryState } from "./controllers/useWebCommunityDirectoryState";
import { useWebTelemetryLifecycle } from "./controllers/useWebTelemetryLifecycle";
import { useWebAuthErrorToastLifecycle } from "./controllers/useWebAuthErrorToastLifecycle";
import { useWebMemberAgentSurfaceController } from "./controllers/useWebMemberAgentSurfaceController";
import { useWebDirectMessagesChromeController } from "./controllers/useWebDirectMessagesChromeController";
import { useWebCommunityTabAccessGuard } from "./controllers/useWebCommunityTabAccessGuard";
import { useWebMobileChromeReadingModeLifecycle } from "./controllers/useWebMobileChromeReadingModeLifecycle";
import { useWebPublicFunnelEntryController } from "./controllers/useWebPublicFunnelEntryController";
import { useWebShellActionController } from "./controllers/useWebShellActionController";
import { useWebCommunityFunnelAboutController } from "./controllers/useWebCommunityFunnelAboutController";
import {
  useWebPendingAuthIntentController,
} from "./controllers/useWebPendingAuthIntentController";
import { useWebCommunityNavigationActions } from "./controllers/useWebCommunityNavigationActions";
import { useWebJoinedCommunityEntryAction } from "./controllers/useWebJoinedCommunityEntryAction";
import { useWebDiscoverActivationController } from "./controllers/useWebDiscoverActivationController";
import { useWebSkillsModel } from "./controllers/useWebSkillsModel";
import { useWebAccountGraphLifecycle } from "./controllers/useWebAccountGraphLifecycle";
import { useWebAuthenticatedIdentityController } from "./controllers/useWebAuthenticatedIdentityController";
import { useWebCommunityMemberManagementController } from "./controllers/useWebCommunityMemberManagementController";
import { useWebCommunityAgentAndFunnelController } from "./controllers/useWebCommunityAgentAndFunnelController";
import { useWebCommunitySettingsController } from "./controllers/useWebCommunitySettingsController";
import { useWebShellState } from "./controllers/useWebShellState";
import { useWebOnboardingProfileController } from "./controllers/useWebOnboardingProfileController";
import { useWebMemberEntryController } from "./controllers/useWebMemberEntryController";
import { useWebCommunityEntryBridgeController } from "./controllers/useWebCommunityEntryBridgeController";
import { useWebShellNavigationController } from "./controllers/useWebShellNavigationController";
import { useWebAppAuthController } from "./controllers/useWebAppAuthController";
import { useWebAppActivityController } from "./controllers/useWebAppActivityController";
import {
  captureProductAnalyticsEvent,
} from "./posthogAnalytics";

import {
  useCommunityAiFeedController,
} from "../../../shared/useCommunityAiFeedController";
import { AnalyticsLineChart } from "../../../shared/AnalyticsLineChart";
import {
  copyTextToClipboard,
  getAvatarColor,
  getInitials,
  shouldShowCommunitySenderMeta,
} from "../../../shared/chatUi";
import {
  type AppPage,
  type AppView,
  type CommunitySettingsPane,
  type CommunityTab,
  type OperatorTab,
  type SettingsGroup,
  type SettingsPage,
} from "../../../shared/appShellNavigation";
import type {
  CommunityAiFeedPost as SharedCommunityAiFeedPost,
  CommunityAiFeedReactionType as SharedCommunityAiFeedReactionType,
  CommunityAccess as SharedCommunityAccess,
  PublicPlanSummary as SharedPublicPlanSummary,
  UserProfile as SharedUserProfile,
  UserProfileDetail as SharedUserProfileDetail,
} from "../../../shared/communityTypes";
import {
  type PublicRoute,
  applyShellVariantToAppPath,
  buildAppRoutePath,
  buildCommunityTabPath,
  buildSettingsPath,
} from "../../../shared/webAppRouteState";
import { PRODUCT_DOCS_DEFAULT_SLUG } from "./docs/productDocsMeta";
import {
  communityInitials,
  parseHistoryUsedArray,
  parseMessageHistoryUsed,
  parseMemoryUsedArray,
  parseMessageMemoryAdded,
  parseMessageMemorySuggestions,
  parseMessageMemoryUsed,
  type HistoryUsedItem,
  type MemorySuggestion,
  type MemoryUsedItem,
} from "../../../shared/messageMetadataUi";
import { renderTextWithLinks } from "../../../shared/linkEmbedUi";
import { renderMarkdown } from "../../../shared/markdownUi";
import {
  readBannerFileAsWideDataUrlWithinLimit,
} from "../../../shared/imageTransforms";
import { resetWebSessionStateAfterSignOut } from "./auth/resetSessionState";
import { useRailPointerReorder } from "../../../shared/useRailPointerReorder";
import { useWebCommunityAccessController } from "../../../shared/useWebCommunityAccessController";
import { useWebDiscoverController } from "../../../shared/useWebDiscoverController";
import { useWebToastController } from "../../../shared/useWebToastController";
import { useWebSettingsImageUploadController } from "../../../shared/useWebSettingsImageUploadController";
import { useCommunityAdminController } from "../../../shared/useCommunityAdminController";
import { useCommunityDirectoryLifecycle } from "../../../shared/useCommunityDirectoryLifecycle";
import { useCommunityMembersReviewController } from "../../../shared/useCommunityMembersReviewController";
import { useCommunityAdminAnalyticsLifecycle } from "../../../shared/useCommunityAdminAnalyticsLifecycle";
import { useCommunityMembersReviewLifecycle } from "../../../shared/useCommunityMembersReviewLifecycle";
import {
  parseReplyPrefix,
  truncateReplyPreview,
} from "../../../shared/communityMessageParsing";
import {
  formatCommunityVisibilityLabel,
  toCanonicalCommunityVisibility,
} from "../../../shared/communityVisibility";
import {
  loadAccountCommerceStatusCanonical,
  type AccountCommerceStatus,
} from "../../../shared/accountCommerceStatusGateway";
import { formatUsdCents, toEpochSeconds } from "../../../shared/displayFormatting";
import {
  deriveCommunityFunnelAction,
  deriveCommunityMembersJoinReviewMode,
  type CommunityFunnelAction,
  type CommunityMembersJoinReviewMode,
} from "./communityJoinPolicy";
import { useWebAccountCommerceActions } from "./controllers/useWebAccountCommerceActions";
import { useWebCommerceClaimActions } from "./controllers/useWebCommerceClaimActions";
import { useWebPublicFunnelActions } from "./controllers/useWebPublicFunnelActions";
import { useWebDiscoverPreloadLifecycle } from "./controllers/useWebDiscoverPreloadLifecycle";
import { useWebBillingUiController } from "./controllers/useWebBillingUiController";
import { useWebMobileShellController } from "./controllers/useWebMobileShellController";
import { useWebCommunityPolynetController } from "./controllers/useWebCommunityPolynetController";
import { useWebPostAuthBillingLifecycle } from "./controllers/useWebPostAuthBillingLifecycle";
import { useWebPostAuthStripeConnectLifecycle } from "./controllers/useWebPostAuthStripeConnectLifecycle";
import { useWebCommunityRouteController } from "./controllers/useWebCommunityRouteController";
import { useWebJoinedCommunityRouteResolution } from "./controllers/useWebJoinedCommunityRouteResolution";
import { useWebSelectedCommunityController } from "./controllers/useWebSelectedCommunityController";
import { useWebPublicCommunityRouteController } from "./controllers/useWebPublicCommunityRouteController";
import { useWebUiPersistenceLifecycle } from "./controllers/useWebUiPersistenceLifecycle";
import { buildWebShellProjection } from "./controllers/buildWebShellProjection";
import { buildWebAuthShellProjection } from "./controllers/buildWebAuthShellProjection";
import { buildWebCommunitySurfaceProjection } from "./controllers/buildWebCommunitySurfaceProjection";
import { useCommunitySettingsAccessLifecycle } from "../../../shared/useCommunitySettingsAccessLifecycle";
import type { WebSettingsPanelsProps } from "./components/WebSettingsPanels";
import { WebAppCompositionRoot } from "./components/WebAppCompositionRoot";
import { useWebDirectMessagesController } from "./controllers/useWebDirectMessagesController";
import { buildWebStandalonePublicRouteViewProps } from "./controllers/buildWebStandalonePublicRouteViewProps";
import { buildWebGlobalOverlayHostProps, shouldOpenFounderInferencePrompt } from "./controllers/buildWebGlobalOverlayHostProps";
import { buildWebAppMainSurfaceHostProps } from "./controllers/buildWebAppMainSurfaceHostProps";
import { buildWebShellChromeHostProps } from "./controllers/buildWebShellChromeHostProps";
import type { WebMemberAgentDockHandle } from "./components/WebMemberAgentDock";
import type {
  WebCommunityRecord,
  WebMyCommunityJoinRequest,
  WebPersonalMemoryItem,
  WebPublicCommunityRecord,
} from "./webAppContracts";
import {
  buildSourceIntegrationOAuthFinalizeSessionGuardKey,
  claimSourceIntegrationOAuthFinalizeSessionGuard,
  clearSourceIntegrationOAuthFinalizeSessionGuard,
  WEB_IMAGE_DATA_URL_CHAR_LIMIT,
} from "./webAppRuntime";

const WebStandalonePublicRouteShell = lazy(() =>
  import("./components/WebStandalonePublicRouteShell").then((module) => ({
    default: module.WebStandalonePublicRouteShell,
  })),
);

type CommunityRecord = WebCommunityRecord;
type PublicCommunityRecord = WebPublicCommunityRecord;
type MessageAttachment = WebCommunityMessageAttachment;
type CommunityAccess = SharedCommunityAccess;
type UserProfile = SharedUserProfile;
type UserProfileDetail = SharedUserProfileDetail;
type CommunityJoinRequest = WebCommunityJoinRequest;
type MyCommunityJoinRequest = WebMyCommunityJoinRequest;
type PersonalMemoryItem = WebPersonalMemoryItem;
type PublicPlanSummary = SharedPublicPlanSummary;
type CommunityAiFeedPost = SharedCommunityAiFeedPost;
type CommunityAiFeedReactionType = SharedCommunityAiFeedReactionType;
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
  const accountGraphHydrationPhase = accountGraphLifecycle.phase;
  const {
    session,
    setAuthError,
    sessionRef,
    isAuthBootstrapComplete,
    authPresentationState,
    authError,
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
    hasOperatorAccess,
  } = authenticatedIdentity;
  const profileStorageUserId = canonicalSessionUserId;
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
    communityOnboardingFirstPostFocusRequest,
    setCommunityOnboardingFirstPostFocusRequest,
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
    communityExperienceMode,
    setCommunityExperienceMode,
    communityResourceModuleId,
    setCommunityResourceModuleId,
    communitySettingsPane,
    setCommunitySettingsPane,
    appTheme,
    setAppTheme,
  } = shellState;
  const onboardingProfile = useWebOnboardingProfileController({
    session,
    getSession: () => sessionRef.current ?? session,
    ensureSession: ensureUsableAuthSession,
    requireSignIn,
    profileStorageUserId,
    activePage,
    publicRouteKind: publicRoute.kind,
    isAuthBootstrapComplete,
  });
  const {
    profile: profileUi,
    cloudProfile,
    setCloudProfile,
    accountSetupStatus,
    effectiveAccountSetupStatus,
    isProfileSetupCompleteForPublicActions,
    isAccountSetupCompleteForBuilderActions,
    isOnboardingModalOpen,
    isSavingOnboarding,
    onboardingError,
    setOnboardingError,
    openProfileSetup,
    closeProfileSetup,
    refreshAccountSetupStatus,
    validateProfileInputs: validateOnboardingProfileInputs,
    saveOnboardingProfile,
    finishOnboarding,
    routeTryPolynetFree,
    resetSignedOutState: resetOnboardingProfileState,
  } = onboardingProfile;
  const publicCommunityUi = useWebPublicCommunityUiController<
    PublicCommunityRecord,
    PublicPlanSummary,
    CommunityAccess,
    MyCommunityJoinRequest
  >();
  const billingUi = useWebBillingUiController<
    AccountCommerceStatus,
    PendingPurchaseClaim
  >();
  const {
    pendingPurchaseClaims,
    setPendingPurchaseClaims,
    isLoadingPendingPurchases,
    setIsLoadingPendingPurchases,
    pendingPurchasesError,
    setPendingPurchasesError,
    isRedeemingPendingPurchases,
    setIsRedeemingPendingPurchases,
    pendingPurchasesSuccess,
    setPendingPurchasesSuccess,
    accountCommerceStatus,
    setAccountCommerceStatus,
    isLoadingAccountCommerce,
    setIsLoadingAccountCommerce,
    accountCommerceError,
    setAccountCommerceError,
    isStartingStripeConnectOnboarding,
    setIsStartingStripeConnectOnboarding,
    checkoutStatus,
    setCheckoutStatus,
    checkoutError,
    setCheckoutError,
    checkoutClaimToken,
    setCheckoutClaimToken,
    isRedeemingClaim,
    setIsRedeemingClaim,
    redeemClaimError,
    setRedeemClaimError,
    manualClaimToken,
    setManualClaimToken,
    redeemPendingPurchasesInFlightRef,
  } = billingUi;
  const {
    isLoadingCommunities,
    setIsLoadingCommunities,
    hasResolvedCommunities,
    setHasResolvedCommunities,
    communities,
    setCommunities,
    communityRoleById,
    setCommunityRoleById,
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
    setCommunityRoleById,
    setCommunities,
    applyCommunityShellState,
    setProfilesByUserId,
  });
  const shellNavigation = useWebShellNavigationController({
    session,
    isAuthBootstrapComplete,
    canonicalSessionUserId,
    isOperatorAccessResolved,
    operatorAccess,
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
    selectedProductDocSlug,
    setSelectedProductDocSlug,
    activeOperatorTab,
    setActiveOperatorTab,
    selectedActiveCommunitySlug,
    communityTab,
    communityChannelSlug,
    setCommunityChannelSlug,
    communityExperienceMode,
    setCommunityExperienceMode,
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
    getSession: () => sessionRef.current ?? session,
    navigateTo,
    applyCommunityShellState,
    setAppPublicRoute: () => setPublicRoute({ kind: "app" }),
    reloadCommunities: loadCommunities,
  });
  const {
    resolveDestination: resolveMemberEntryDestination,
    applyDestination: applyMemberEntryDestination,
    resolveAndEnter: resolveAndEnterMemberDestination,
  } = memberEntry;
  shellNavigation.memberEntryActionsRef.current = {
    resolveAndEnter: resolveAndEnterMemberDestination,
  };
  onboardingProfile.actionsRef.current = {
    navigateTo,
    enterDefaultDestination: resolveAndEnterMemberDestination,
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
  });
  const {
    channels: activeCommunityChannels,
    isLoadingChannels: isLoadingActiveCommunityChannels,
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

  const communityInteractionProjection = useWebCommunityInteractionProjection<MessageAttachment>({
    activeCommunityId: activeChannelCommunityId,
    activeChannelId,
    canonicalSessionUserId,
    ensureSession: ensureUsableAuthSession,
    isCommunityChatActive: activePage === "community" && communityTab === "chat",
    session,
  });
  const {
    roots: communityInteractionRoots,
    repliesByRootId: communityInteractionRepliesByRootId,
    visibleRoots: visibleCommunityInteractionRoots,
    selectedReplies: selectedCommunityInteractionReplies,
    selectedRootId: selectedCommunityInteractionRootId,
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
    retryPending: handleRetryPendingCanonicalInteraction,
    discardPending: handleDiscardPendingCanonicalInteraction,
    dismissServeIssue: handleDismissCommunityAgentServeIssue,
  } = communityInteractionProjection;

  const memberAgentComposerApiRef = useRef<WebMemberAgentDockHandle | null>(null);
  const canMentionEverybodyRef = useRef(false);
  const communityChat = useWebCommunityChatController({
    activeCommunityId: activeChannelCommunityId,
    activeChannelId,
    canonicalSessionUserId,
    ensureSession: ensureUsableAuthSession,
    hasActiveCommunity: Boolean(activeCommunity) && isActiveCommunityChannelReady,
    interaction: communityInteractionProjection,
    isProfileSetupComplete: isProfileSetupCompleteForPublicActions,
    loadProfiles: (userIds, activeSession) => loadUserProfiles(userIds, activeSession),
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
    messages: communityMessages,
    activityEvents: communityActivityEvents,
    messageById: communityMessageById,
    messageInput: communityMessageInput,
    setMessageInput: setCommunityMessageInput,
    messageMentions: communityMessageMentions,
    setMessageMentions: setCommunityMessageMentions,
    attachments: communityAttachments,
    error: communityChatError,
    setError: setCommunityChatError,
    copiedMessageId: copiedCommunityMessageId,
    unreadCount,
    setUnreadCount,
    isUserAtBottom,
    setIsUserAtBottom,
    isUserAtBottomRef,
    isSendingMessage: isSendingCommunityMessage,
    replyingToMessage,
    setReplyingToMessage,
    reactions: messageReactions,
    reactionPickerMessageId,
    setReactionPickerMessageId,
    editingMessageId,
    editingMessageText,
    setEditingMessageText,
    editingMessagePrefix,
    isLoadingChat,
    isLoadingMoreChat,
    communityChatHasMore,
    hasResolvedCommunityChat,
    resetChatState: resetCommunityChatState,
    messageListRef: communityChatListRef,
    inputRef: chatInputRef,
    fileInputRef: communityFileInputRef,
    handleChatScroll,
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
    handleToggleReaction,
    handleStartReply,
    handleStartEdit,
    handleCancelEdit,
    handleSaveEdit,
    handleDeleteMessage,
    handleSendCommunityMessage,
    copyMessage: handleCopyCommunityMessage,
    scrollToMessage: scrollToCommunityMessage,
    scrollToBottom: scrollCommunityChatToBottom,
    markChatSelected: markCommunityChatSelected,
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
    openResourceEmbedId,
    setOpenResourceEmbedId,
    events: communityEvents,
    hasLoadedVisibleEventsRange: hasLoadedActiveCommunityEventsRange,
    isLoadingEvents: isLoadingCommunityEvents,
    eventsError: communityEventsError,
    eventsVisibleMonthIso: communityEventsVisibleMonthIso,
    setEventsVisibleMonthIso: setCommunityEventsVisibleMonthIso,
    eventsVisibleRange: communityEventsVisibleRange,
    eventsCacheKey: communityEventsCacheKey,
    resetContentState: resetCommunityContentState,
    loadCommunityResourceModules,
    loadCommunityResources,
    openNewModuleModal,
    handleEditModule,
    handleSetModuleStatus,
    handleDeleteModule,
    handleReorderModules,
    handleReorderResources,
    handleMoveResourceToModule,
    openNewResourceModal,
    openNewSourceModal,
    resourceEditor,
    handleDeleteResource,
    handleCreatePageDraftFromSource,
    handleCreateBlankPageDraft,
    resourceModalProps,
    resourceModuleModalProps,
    resourceModuleDeleteModalProps,
    loadCommunityEvents,
    reloadActiveResources,
    reloadActiveEvents,
    handleSaveCommunityEvent,
    handleCancelCommunityEvent,
  } = communityContent;
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
    isLoadingCommunityDirectoryMembers,
    isLoadingMoreCommunityDirectoryMembers,
    communityDirectoryMembersHasMore,
    communityDirectoryMembersLoadError,
    loadCommunityDirectoryMembers,
    loadMoreCommunityDirectoryMembers,
  } = communityAdministration.directory;
  const {
    activeCommunityAccess,
    isLoadingCommunityAccess,
    communityAccessLoadError,
    retryActiveCommunityAccess,
    communityAccessCapabilities,
    communityNavVisibility,
    communityActionGuards,
    isActiveCommunityOwner,
    isActiveCommunityAdmin,
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
    funnelPreviewAdminCount,
    funnelPreviewOnlineCount,
    funnelPreviewOnlineFaces,
    activeCommunityOnlineUserIds,
    activeCommunityPresenceSummary,
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
    canViewPolynet: canViewActiveCommunityPolynet,
    canManageMembers: canManageMembersActiveCommunity,
    canViewAnalytics: canViewActiveCommunityAnalytics,
    setCommunityResourceModuleId,
    applyCommunityShellState,
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
    communitySettingsLoadedCommunityIdRef,
    communitySettingsDirtyRef,
    communityPricingDirtyRef,
    markCommunitySettingsDirty,
  } = communitySettingsUi;
  const communityAgentConfigUi = communityAdministration.agentConfigUi;
  const {
    isLoadingCommunityAgentConfig,
    setIsLoadingCommunityAgentConfig,
    communityAgentConfigError,
    setCommunityAgentConfigError,
    communityAgentConfigLoadedCommunityIdRef,
    communityAgentConfigLanding,
    setCommunityAgentConfigLanding,
    communityAgentConfigCommunitySystemPrompt,
    setCommunityAgentConfigCommunitySystemPrompt,
    isSavingCommunityAgentConfig,
    setIsSavingCommunityAgentConfig,
    communityAgentConfigSaveError,
    setCommunityAgentConfigSaveError,
    communityAgentConfigDirtyRef,
    markCommunityAgentConfigDirty,
    hydrateCommunityAgentEditor,
    handleResetCommunityAgentConfig,
  } = communityAgentConfigUi;
  const skillsModel = useWebSkillsModel({
    activeCommunityId,
    activePage,
    canManageMembers: canManageMembersActiveCommunity,
    canManageResources: canManageResourcesActiveCommunity,
    communityTab,
    ensureSession: ensureUsableAuthSession,
    session,
  });
  const {
    communitySkillAttachments,
    ownedSkillPackages,
    isLoadingCommunitySkillAttachments,
    isLoadingOwnedSkillPackages,
    communitySkillAttachmentError,
    ownedSkillPackagesError,
    isCreatingSkill,
    communitySkillMutationError,
    updatingCommunitySkillAttachmentId,
    removingCommunitySkillAttachmentId,
    attachingSkillPackageId,
  } = skillsModel.community;

  const communityAdminUi = communityAdministration.adminUi;
  const {
    communityFunnelConfig,
    setCommunityFunnelConfig,
    isLoadingCommunityFunnel,
    setIsLoadingCommunityFunnel,
    communityFunnelError,
    setCommunityFunnelError,
    isSavingCommunityFunnel,
    setIsSavingCommunityFunnel,
    communityFunnelSaveError,
    setCommunityFunnelSaveError,
    communityFunnelLoadedCommunityIdRef,
    communityFunnelDirtyRef,
    markCommunityFunnelDirty,
    hydrateCommunityFunnelEditor,
    handleResetCommunityFunnel,
    resetCommunityFunnelState,
    communityMemberMuted,
    setCommunityMemberMuted,
    isLoadingCommunityMemberSettings,
    setIsLoadingCommunityMemberSettings,
    communityMemberSettingsError,
    setCommunityMemberSettingsError,
    isLeavingCommunity,
    setIsLeavingCommunity,
  } = communityAdminUi;

  const shellPublicRoute: PublicRoute = publicRoute;

  const {
    syncCommunitySelection,
    openPublicCommunityFunnel,
    openCommunityTab,
    openCommunityChat,
    openCommunityBySlug,
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
    setUnreadCount,
  });
  const {
    chatgptConnection,
    openAiConnection,
    isLoadingProviderConnections: isLoadingChatgptConnection,
    providerConnectionUi,
    hasPendingChatgptAuth,
    handleConnectCommunityAgentServeProvider,
  } = useWebProviderConnectionsController({
    session,
    getSession: () => sessionRef.current ?? session,
    ensureSession: ensureUsableAuthSession,
    requireSignIn,
    refreshAccountSetupStatus,
    resetSignedOutAccountSetup: resetOnboardingProfileState,
  });
  const founderInference = useWebFounderInferenceController({
    session,
    ensureSession: ensureUsableAuthSession,
    providerConnectionUpdatedAt: openAiConnection.updated_at,
  });
  const founderBilling = useWebFounderBillingController({
    session,
    ensureSession: ensureUsableAuthSession,
    operatorComplimentaryAccess:
      accountCommerceStatus?.operator_complimentary_access === true,
  });
  const enterJoinedCommunity = useWebJoinedCommunityEntryAction({
    session,
    sessionRef,
    resolveKnownCommunitySlugById,
    syncCommunitySelection,
    setPublicRoute,
    applyAppRouteState,
    loadCommunities,
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
    profileName: profileUi.profileName,
    profileHandle: profileUi.profileHandle,
    profileBio: profileUi.profileBio,
    profileSocialLinks: profileUi.profileSocialLinks,
    profileAvatarUrl: profileUi.profileAvatarUrl,
    profileAvatarStorageId: profileUi.profileAvatarStorageId,
    profileAvatarFocusX: profileUi.profileAvatarFocusX,
    profileAvatarFocusY: profileUi.profileAvatarFocusY,
    profileAvatarZoom: profileUi.profileAvatarZoom,
    profileSaveTimeoutRef: profileUi.profileSaveTimeoutRef,
    profileSaveFailureMessage: "Failed to save profile.",
    profileSaveUnauthenticatedErrorMessage: null,
    onProfileSaveUnauthenticated: () => {
      requireSignIn();
    },
    applyLoadedProfileToLocal: profileUi.applyLoadedProfileToLocal,
    setProfilesByUserId,
    setCloudProfile,
    setProfileName: profileUi.setProfileName,
    setProfileHandle: profileUi.setProfileHandle,
    setProfileBio: profileUi.setProfileBio,
    setProfileSocialLinks: profileUi.setProfileSocialLinks,
    setProfileAvatarUrl: profileUi.setProfileAvatarUrl,
    setProfileAvatarStorageId: profileUi.setProfileAvatarStorageId,
    setProfileAvatarFocusX: profileUi.setProfileAvatarFocusX,
    setProfileAvatarFocusY: profileUi.setProfileAvatarFocusY,
    setProfileAvatarZoom: profileUi.setProfileAvatarZoom,
    setIsSavingProfile: profileUi.setIsSavingProfile,
    setProfileSaveError: profileUi.setProfileSaveError,
    setProfileSaveSuccess: profileUi.setProfileSaveSuccess,
    setIsLoadingCommunityAnalytics,
    setCommunityAnalyticsError,
    setCommunityAnalyticsSummary,
    setCommunityAnalyticsSeries,
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
    clearJoinRequests: () => setCommunityJoinRequests([]),
  });
  const {
    loadMemberBillingHistory: loadCommunityMemberBillingHistory,
    reloadDirectory: reloadActiveCommunityDirectoryMembers,
    setMemberRole: handleSetCommunityContextMemberRole,
    removeMember: handleRemoveCommunityContextMember,
    banMember: handleBanCommunityContextMember,
    setFreeAccessMode: handleSetCommunityContextFreeAccessMode,
  } = communityMemberManagement;

  const communityAgentAndFunnel =
    useWebCommunityAgentAndFunnelController({
    activeCommunityId,
    activePage,
    adminUi: communityAdminUi,
    agentUi: communityAgentConfigUi,
    canManageMembers: canManageMembersActiveCommunity,
    communityTab,
    ensureSession: ensureUsableAuthSession,
    session,
    setCommunities,
  });
  const {
    handleSaveCommunityAgentConfig,
    handleSaveCommunityFunnel,
  } = communityAgentAndFunnel;
  const {
    createCommunitySkill: handleCreateCommunitySkill,
    attachSkillPackageToCommunity: handleAttachSkillPackageToCommunity,
    updateCommunitySkillAttachment: handleUpdateCommunitySkillAttachment,
    detachCommunitySkill: handleDetachCommunitySkill,
  } = skillsModel.actions;

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
    session,
    settingsUi: communitySettingsUi,
    setCommunities,
  });
  const {
    syncCommunitySettingsSelection,
    loadCommunityMemberSettings,
    loadCommunityPricing,
    handleToggleCommunityMute,
    handleLeaveCommunity,
    handleSaveCommunitySettings,
  } = communitySettingsController;
  const {
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
  });

  const { appToast, showAppToastMessage } = useWebToastController();
  const { visibleAuthError: previewSidebarAuthError } =
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
      setCommunityRoleById,
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
  const communityPolynetController = useWebCommunityPolynetController<AuthSession>({
    activePage,
    communityTab,
    activeCommunityId,
    session: session,
    ensureSession: ensureUsableAuthSession,
    requireSignIn: () => requireSignIn(),
    canViewPolynet: canViewActiveCommunityPolynet,
  });

  useWebUiPersistenceLifecycle({
    communityAnalyticsRange,
    profileStorageUserId,
    profileName: profileUi.profileName,
    profileHandle: profileUi.profileHandle,
    profileBio: profileUi.profileBio,
    setProfileName: profileUi.setProfileName,
    setProfileHandle: profileUi.setProfileHandle,
    setProfileBio: profileUi.setProfileBio,
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
      communityMessages,
      communityActivityEvents,
      communityInteractionRoots,
      communityInteractionRepliesByRootId,
      loadUserProfiles,
      loadSelfProfile,
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

  useCommunitySettingsAccessLifecycle<AuthSession, CommunityRecord>({
    activePage,
    communityTab,
    ...sessionArg,
    activeCommunityId,
    activeCommunityAccess,
    communities,
    syncCommunitySettingsSelection,
    loadCommunityMemberSettings,
    loadCommunityPricing,
    setCommunityMemberMuted,
    setCommunitySettingsPricingMode,
    setCommunitySettingsPriceUsdMonthly,
    setCommunitySettingsPriceUsdAnnual,
  });

  const {
    activeCommunityFeedState,
    reactingPostId: communityFeedReactingPostId,
    moderatingPostId: communityFeedModeratingPostId,
    reactToPost: handleReactToCommunityFeedPost,
    hidePost: handleHideCommunityFeedPost,
    retry: retryCommunityAiFeed,
  } = useCommunityAiFeedController<AuthSession>({
    activeCommunityId,
    isAiFeedTabActive: communityTab === "ai_feed",
    viewerCacheKey: session?.user?.id ?? "anonymous",
    session: session,
    ensureSession: ensureUsableAuthSession,
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
    resumeEpoch: appActivity.resumeEpoch,
    session,
    chat: {
      hasResolved: isActiveCommunityChannelReady && !isLoadingCommunityInteractions,
    },
    interactions: {
      roots: communityInteractionRoots,
      repliesByRootId: communityInteractionRepliesByRootId,
    },
    aiFeed: {
      isLoading: activeCommunityFeedState.isLoading,
      live: activeCommunityFeedState.live,
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
    CommunityJoinRequest,
    CommunityRecord
  >({
    ...sessionArg,
    activeCommunityId,
    communities,
    canReviewJoinRequests: canReviewJoinRequestsActiveCommunity,
    activeCommunityMembersJoinReviewMode,
    shouldLoad: shouldHydrateCommunityContextPanel,
    loadCommunityJoinRequests,
    setCommunityJoinRequests,
    setIsLoadingCommunityJoinRequests,
    setCommunityJoinRequestsError,
    setDecidingCommunityJoinRequestId,
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

  const {
    cancelMyPendingJoinRequest,
    joinPublicCommunity,
    loadPublicCommunity,
    startCheckoutForPlan,
  } = useWebPublicFunnelActions<
    PublicCommunityRecord,
    PublicPlanSummary,
    CommunityAccess,
    MyCommunityJoinRequest
  >({
    getSession: () => sessionRef.current,
    getCurrentPublicCommunitySlug: () => publicCommunityUi.publicCommunity?.slug ?? null,
    ensureSession: ensureUsableAuthSession,
    ...sessionArg,
    requireSignIn,
    loadCommunities,
    openCommunityWorkspace: ({ communityId, communitySlug }) => {
      enterCommunityThroughBridge({ communityId, communitySlug: communitySlug ?? null });
    },
    onJoinRequestSent: ({ communityId, communitySlug }) => {
      captureProductAnalyticsEvent("community join request sent", {
        community_id: communityId,
        community_slug: communitySlug,
        surface: "public_funnel",
      });
    },
    setIsJoiningPublicCommunity: publicCommunityUi.setIsJoiningPublicCommunity,
    setIsCancellingPublicCommunityJoinRequest: publicCommunityUi.setIsCancellingPublicCommunityJoinRequest,
    setPublicJoinError: publicCommunityUi.setPublicJoinError,
    setPublicCommunity: publicCommunityUi.setPublicCommunity,
    setPublicCommunityAccess: publicCommunityUi.setPublicCommunityAccess,
    setIsLoadingMyPublicCommunityJoinRequest: publicCommunityUi.setIsLoadingMyPublicCommunityJoinRequest,
    setMyPublicCommunityJoinRequest: publicCommunityUi.setMyPublicCommunityJoinRequest,
    setIsLoadingPublicCommunity: publicCommunityUi.setIsLoadingPublicCommunity,
    setPublicCommunityError: publicCommunityUi.setPublicCommunityError,
    setPublicCommunityPlans: publicCommunityUi.setPublicCommunityPlans,
    setCheckoutError,
    setCheckoutStatus,
    navigateToUrl: (url) => window.location.assign(url),
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

  const {
    redeemPurchaseClaim,
    loadPendingPurchaseClaims,
    loadAccountCommerceStatus,
    redeemPendingPurchases,
    redeemPendingPurchasesForSettings,
    refreshPendingPurchasesForSettings,
  } = useWebCommerceClaimActions({
    getSession: () => sessionRef.current,
    ensureSession: ensureUsableAuthSession,
    requireSignIn,
    openCommunityWorkspace: ({ communityId, communitySlug }) => {
      enterCommunityThroughBridge({ communityId, communitySlug: communitySlug ?? null });
    },
    loadCommunities,
    clearPendingPurchaseClaimToken,
    storePendingPurchaseClaimToken,
    setCheckoutClaimToken,
    setCheckoutStatus,
    setIsRedeemingClaim,
    setRedeemClaimError,
    setIsLoadingPendingPurchases,
    setPendingPurchasesError,
    setPendingPurchaseClaims,
    setIsRedeemingPendingPurchases,
    setPendingPurchasesSuccess,
    setIsLoadingAccountCommerce,
    setAccountCommerceError,
    setAccountCommerceStatus,
    redeemPendingPurchasesInFlightRef,
  });
  const communityUi = useWebCommunityUiController<
    AuthSession,
    CommunityRecord
  >({
    ...authenticatedSessionArg,
    isAccountSetupComplete: isAccountSetupCompleteForBuilderActions,
    communityInitials,
    onPrimaryUnauthenticated: (draft) => {
      requireSignIn({ reason: "create_community", payload: { draft } });
    },
    onCreateUnauthenticated: (draft) => {
      requireSignIn({ reason: "create_community", payload: { draft } });
    },
    onAccountSetupRequired: openProfileSetup,
    onCommunityCreated: (community) => {
      setCommunities((prev) => [community, ...prev]);
      setCommunityRoleById((prev) => ({ ...prev, [community.id]: "owner" }));
      void enterJoinedCommunity({
        communityId: community.id,
        communitySlug: community.slug,
      });
      void founderBilling.startCheckoutAfterCommunityCreated(community.id);
    },
    readBannerFileAsWideDataUrlWithinLimit,
    isLikelyImageFile,
    maxCreateImageDataUrlChars: WEB_IMAGE_DATA_URL_CHAR_LIMIT,
    createUnauthenticatedErrorMessage: "Sign in to create a community.",
    bannerLoadFailureMessage: "Failed to load banner.",
  });
  const { openCreateCommunityModal } = communityUi;
  const { resumePendingAuthIntent } =
    useWebPendingAuthIntentController({
      session,
      resolveAndEnterMemberDestination,
      navigateTo,
      connectChatgpt: providerConnectionUi.handleConnectChatgpt,
      openAccountSettings: () => openGlobalSettings("account"),
      showToast: showAppToastMessage,
      openCreateCommunity: openCreateCommunityModal,
      redeemPurchaseClaim,
      joinPublicCommunity,
      redeemPendingPurchases,
      routeTryPolynetFree,
    });
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
      setPendingPurchaseClaims([]);
      setPendingPurchasesError(null);
      setPendingPurchasesSuccess(null);
      profileUi.setProfileSaveError(null);
      profileUi.setProfileSaveSuccess(false);
    },
  };

  const {
    publicFunnelSlug,
    isPublicFunnelPreviewRoute,
    checkoutSuccessSessionId,
    claimTokenParam,
    isPublicCommunityFunnel,
    showPublicSignIn,
    selectedPublicCommunityPlan,
    publicVisibilityLabel,
    resolvedPublicCommunity,
    canEnterPublicCommunity,
    canJoinForFree,
    canJoinWithApproval,
    canJoinWithCheckout,
    approvalPending,
    approvalDenied,
    canRequestAgain,
    approvalReapplyLabel,
  } = useWebPublicCommunityRouteController<PublicCommunityRecord, MyCommunityJoinRequest>({
    publicRoute: shellPublicRoute,
    publicCommunity: publicCommunityUi.publicCommunity,
    publicCommunityPlans: publicCommunityUi.publicCommunityPlans,
    publicCommunityAccess: publicCommunityUi.publicCommunityAccess,
    myPublicCommunityJoinRequest: publicCommunityUi.myPublicCommunityJoinRequest,
    isSignedIn: Boolean(session),
    /* Re-fire the funnel load only when signed-in status flips — not on every
       session object identity change, which re-hammered the load (and the
       expensive stats query) and blinked the right panel. */
    sessionDependency: Boolean(session),
    loadPublicCommunity,
  });
  const communityEntryBridge = useWebCommunityEntryBridgeController({
    publicRouteKind: shellPublicRoute.kind,
    accountSetupStatus: effectiveAccountSetupStatus,
    activeCommunity,
    activeCommunityId,
    selectedActiveCommunitySlug,
    publicCommunity: publicCommunityUi.publicCommunity,
    publicCommunityAccessId:
      publicCommunityUi.publicCommunityAccess?.community_id ?? null,
    approvalPending,
    validateProfileInputs: validateOnboardingProfileInputs,
    saveOnboardingProfile,
    finishOnboarding,
    setOnboardingError,
    resolveDestination: resolveMemberEntryDestination,
    applyDestination: applyMemberEntryDestination,
    resolveAndEnter: resolveAndEnterMemberDestination,
  });
  const {
    isBridgeGateOpen,
    enterCommunity: enterCommunityThroughBridge,
    completePlatformBridge,
    completeCommunityBridge: completeBridgeAndEnter,
  } = communityEntryBridge;
  /* Visitor lens: locked shell-nav tabs reopen the join gate on the funnel
     surface (nonce bump crosses the shell/surface boundary). */
  useWebJoinedCommunityRouteResolution<AuthSession, CommunityRecord, CommunityAccess>({
    publicRouteKind: shellPublicRoute.kind,
    activePage,
    activeCommunitySlug: selectedActiveCommunitySlug,
    communities,
    session: session,
    isAuthBootstrapComplete,
    ensureSession: ensureUsableAuthSession,
    loadCommunities,
    syncCommunitySelection,
    navigateTo,
  });

  useWebPostAuthBillingLifecycle({
    session: session,
    sessionRef,
    claimTokenParam,
    checkoutSuccessSessionId,
    isRedeemingClaim,
    isJoiningPublicCommunity: publicCommunityUi.isJoiningPublicCommunity,
    setAccountCommerceStatus,
    setAccountCommerceError,
    setIsLoadingAccountCommerce,
    getAuthUid: getAuthUid,
    redeemPurchaseClaim,
    redeemPendingPurchases,
    loadPendingPurchaseClaims,
    loadAccountCommerceStatus,
    joinPublicCommunity,
  });

  useWebPostAuthStripeConnectLifecycle({
    session,
    stripeConnectReturn,
    clearStripeConnectReturn: () => setStripeConnectReturn(null),
    setAccountCommerceError,
    loadAccountCommerceStatus,
    startStripeConnectOnboarding,
  });

  const { retryCheckoutFinalize } = useCheckoutFinalizeController({
    checkoutSuccessSessionId,
    getSession: () => sessionRef.current,
    redeemPurchaseClaim,
    persistClaimToken: storePendingPurchaseClaimToken,
    setCheckoutStatus,
    setCheckoutError,
      setCheckoutClaimToken,
      setRedeemClaimError,
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
    chatgptConnection,
    openAiConnection,
    isLoadingProviderConnections: isLoadingChatgptConnection,
    provider: providerConnectionUi,
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
    communityVoiceUiState,
    memberAgentVoiceIntent,
    memberAgentVoiceUiState,
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
    isProfileSetupComplete: isProfileSetupCompleteForPublicActions,
    openProfileSetup,
    setCommunityMessageInput,
    chatInputRef,
    appendMemberAgentTranscript: (transcript) =>
      memberAgentComposerApiRef.current?.appendTranscript(transcript),
    focusMemberAgentInput: () => memberAgentComposerApiRef.current?.focusInput(),
  });

  const hasSelectedCommunity = Boolean(String(selectedActiveCommunitySlug ?? activeCommunity?.slug ?? "").trim());
  const shellProjection = buildWebShellProjection({
    publicRouteKind: shellPublicRoute.kind,
    shellVariant,
    activePage,
    mobileSettingsView,
    isPublicCommunityFunnel,
  });
  const {
    isGlobalSettings,
    showMobileAppShell,
    showMobileSettingsShell,
    showMobileShell,
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
    && selectedCommunityInteractionRootId,
  );
  const mobileChromeAutoHideEnabled = Boolean(
    showMobileAppShell
    && shellPublicRoute.kind === "app"
    && activePage === "community"
    && communityTab === "chat"
    && mobileRootPage === "community"
    && !mobileThreadPageOpen
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
    useRailPointerReorder({
      itemIds: communityRailIds,
      enabled: canReorderCommunities,
      onMoveToIndex: handleReorderCommunityRail,
    });
  const funnelPreviewVisibility = toCanonicalCommunityVisibility(activeCommunity?.visibility, "unlisted");
  const funnelPreviewVisibilityLabel = formatCommunityVisibilityLabel(funnelPreviewVisibility);
  const funnelPreviewAction = deriveCommunityFunnelAction({
    entry_policy: activeCommunity?.entry_policy,
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
    pendingToken,
    handlePrimaryAction: handlePublicLandingPrimaryAction,
    handleCheckoutContinue: handlePublicCheckoutContinue,
    handleClaimContinue: handlePublicClaimContinue,
    handleCancelPendingJoinRequest:
      handleCancelPendingPublicJoinRequest,
  } = useWebPublicFunnelEntryController({
    checkoutClaimToken,
    publicRouteClaimToken:
      publicRoute.kind === "claim" ? publicRoute.token : null,
    manualClaimToken,
    isPreviewRoute: isPublicFunnelPreviewRoute,
    publicCommunity: publicCommunityUi.publicCommunity,
    publicCommunityAccess: publicCommunityUi.publicCommunityAccess,
    canEnterCommunity: canEnterPublicCommunity,
    canJoinWithCheckout,
    canJoinForFree,
    canJoinWithApproval,
    selectedPlan: selectedPublicCommunityPlan,
    shellVariant,
    showPublicSignIn,
    approvalPending,
    fallbackCommunitySlug: publicFunnelSlug,
    enterCommunity: enterCommunityThroughBridge,
    redeemPurchaseClaim,
    startCheckoutForPlan,
    joinPublicCommunity,
    requireSignIn,
    cancelPendingJoinRequest: cancelMyPendingJoinRequest,
  });
  const {
    hasAuthenticatedAppShellPresentation,
    isAuthRecoveringSignedInAppShell,
    shouldHoldLandingForAuth,
    isAccountGraphHydratingCriticalAppShell,
  } = buildWebAuthShellProjection({
    publicRouteKind: shellPublicRoute.kind,
    activePage,
    authPresentationState,
    accountGraphHydrationPhase,
    pathname: shellNavigation.readCurrentPathname(),
  });

  const {
    handleTopbarBackFromSettings,
    handleTopbarBackFromPublicFunnel,
    handleTopbarBackToCommunity,
    handleOpenLandingCommunity,
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
      openMobileAgentSettings,
      handleExitMobileSettings,
      openMobileCreateCommunity,
      openMobileDrawer,
    } = useWebMobileShellController({
      activeCommunitySlug: String(activeCommunity?.slug ?? "").trim() || null,
      selectedActiveCommunitySlug,
      mobileRootPage,
      hasSelectedCommunity,
      canViewMembers:
        (hasSelectedCommunity && canViewMembersActiveCommunity) ||
        ((shellPublicRoute.kind === "community_funnel" ||
          shellPublicRoute.kind === "community_funnel_preview") &&
          Boolean(resolvedPublicCommunity)),
      forceCommunityRoot:
        showMobileShell &&
        (shellPublicRoute.kind === "community_funnel" ||
          shellPublicRoute.kind === "community_funnel_preview"),
      mobileOverlay,
      showMobileShell,
      showMobileSettingsShell,
      canOpenDirectMessages: Boolean(session),
      isDirectMessagesOpen,
      isThreadPageOpen: mobileThreadPageOpen,
      setMobileOverlay,
      setMobileRootPage,
      setMobileSettingsView,
      openGlobalSettings,
      openCommunityChat,
      handleOpenDiscover,
      openDirectMessages: handleOpenDirectMessages,
      closeDirectMessages: handleCloseDirectMessages,
      closeThreadPage: handleCloseCommunityInteractionDrawer,
      openCommunityCreateFlow: openCreateCommunityModal,
    });
  const isCommunityOnboardingPreviewMode =
    publicRoute.kind === "app" &&
    activePage === "community" &&
    communityExperienceMode === "onboarding_preview";
  const {
    handlePreviewCommunityFunnel,
    handleSelectActiveCommunity,
    handleSelectCommunitySettingsPane,
    handlePreviewCommunityOnboarding,
    handleExitCommunityOnboardingPreview,
    handleSelectCommunityTab,
    handleSelectCommunityTabFromMobile,
    handleCommunityOnboardingOrientationCompleted,
  } = useWebCommunityNavigationActions({
    activeCommunity,
    selectedActiveCommunityId,
    selectedActiveCommunitySlug,
    communities,
    shellVariant,
    isOnboardingPreviewMode: isCommunityOnboardingPreviewMode,
    communitySettingsDirtyRef,
    communityAgentConfigDirtyRef,
    syncCommunitySelection,
    resolveKnownCommunitySlugById,
    setCommunitySettingsPane,
    setCommunityResourceModuleId,
    setMobileOverlay,
    setCommunityOnboardingFirstPostFocusRequest,
    markCommunityChatSelected,
    applyCommunityShellState,
    openCommunityTab,
    navigateTo,
    pushNavSnapshot,
  });

  const {
    isDirty: isCommunityFunnelAboutDirty,
    reset: handleResetCommunityFunnelAbout,
    save: handleSaveCommunityFunnelAbout,
  } = useWebCommunityFunnelAboutController({
    activeCommunity,
    about: communitySettingsAbout,
    name: communitySettingsName,
    slug: communitySettingsSlug,
    oneLiner: communitySettingsOneLiner,
    visibility: communitySettingsVisibility,
    avatarUrl: communitySettingsAvatarUrl,
    avatarFocusX: communitySettingsAvatarFocusX,
    avatarFocusY: communitySettingsAvatarFocusY,
    avatarZoom: communitySettingsAvatarZoom,
    bannerUrl: communitySettingsBannerUrl,
    bannerFocusX: communitySettingsBannerFocusX,
    bannerFocusY: communitySettingsBannerFocusY,
    bannerZoom: communitySettingsBannerZoom,
    pricingDirtyRef: communityPricingDirtyRef,
    settingsDirtyRef: communitySettingsDirtyRef,
    ensureSession: ensureUsableAuthSession,
    setAbout: setCommunitySettingsAbout,
    setError: setCommunitySettingsError,
    setIsSaving: setIsSavingCommunitySettings,
    setCommunities,
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
      activePage,
      communityTab,
      activeCommunity,
      session: session,
      ensureSession: ensureUsableAuthSession,
      selectedActiveCommunitySlug,
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
      onPreviewCommunityOnboarding: handlePreviewCommunityOnboarding,
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
        isCommunitySettingsDirty: communitySettingsDirtyRef.current,
        communitySettingsError,
        isSavingCommunitySettings,
        communityMemberMuted,
        isLoadingCommunityMemberSettings,
        isLeavingCommunity,
        communityMemberSettingsError,
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
        communityPricingDirtyRef,
        handleSaveCommunitySettings,
        handleToggleCommunityMute,
        handleLeaveCommunity,
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
      feedState: {
        livePosts: activeCommunityFeedState.live,
        rankedPosts: activeCommunityFeedState.ranked,
        isLoading: activeCommunityFeedState.isLoading,
        error: activeCommunityFeedState.error,
        reactingPostId: communityFeedReactingPostId,
        moderatingPostId: communityFeedModeratingPostId,
      },
      feedActions: {
        react: handleReactToCommunityFeedPost,
        hidePost: handleHideCommunityFeedPost,
        retry: retryCommunityAiFeed,
      },
      polynetState: communityPolynetController.state,
      polynetActions: communityPolynetController.actions,
      canViewActiveCommunityPolynet,
      onBackToCommunityChat: () => {
        const nextCommunitySlug = String(selectedActiveCommunitySlug ?? activeCommunity?.slug ?? "").trim();
        if (nextCommunitySlug) {
          openCommunityChat(nextCommunitySlug, { clearUnread: true, pushSnapshot: false });
        }
      },
      aiAgentHasSession: Boolean(session),
      canManageMembersActiveCommunity,
      aiAgentPreferredTab: "instructions",
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
      aiAgentSkillsEditorProps: {
        intro: "Attach reusable skill packages here so this community lens can load behavior units on demand without bloating the base prompt.",
        emptyState: "Attach the first skill package to this community. Attached skills become available when members explicitly mention them in this lens.",
        addButtonLabel: "Create skill",
        platformSkills: skillsModel.communityPlatformSkills,
        skills: communitySkillAttachments,
        packages: ownedSkillPackages,
        isLoading: isLoadingCommunitySkillAttachments,
        isLoadingPackages: isLoadingOwnedSkillPackages,
        error: communitySkillAttachmentError,
        packagesError: ownedSkillPackagesError,
        mutationError: communitySkillMutationError,
        isCreatingSkill: isCreatingSkill,
        attachingPackageId: attachingSkillPackageId,
        updatingSkillId: updatingCommunitySkillAttachmentId,
        removingSkillId: removingCommunitySkillAttachmentId,
        onCreateSkill: handleCreateCommunitySkill,
        onAttachPackage: handleAttachSkillPackageToCommunity,
        onUpdateSkill: handleUpdateCommunitySkillAttachment,
        onDetachSkill: handleDetachCommunitySkill,
      },
      isLoadingCommunityFunnel,
      communityFunnelError,
      funnelEditorProps: {
        communityFunnelDirtyRef,
        handleSaveCommunityFunnel,
        handleResetCommunityFunnel,
        handlePreviewCommunityFunnel,
        isSavingCommunityFunnel,
        communityFunnelSaveError,
        communityFunnelConfig,
        setCommunityFunnelConfig,
        markCommunityFunnelDirty,
        funnelOneLiner: communitySettingsOneLiner,
        funnelAbout: communitySettingsAbout,
        setFunnelAbout: setCommunitySettingsAbout,
        isFunnelAboutDirty: isCommunityFunnelAboutDirty,
        markCommunitySettingsDirty,
        handleSaveCommunityFunnelAbout,
        handleResetCommunityFunnelAbout,
        isSavingCommunitySettings,
        communitySettingsError,
        previewCommunity: {
          slug: activeCommunity?.slug ?? null,
          name: activeCommunity?.name ?? "Community",
          one_liner: communitySettingsOneLiner || null,
          about: communitySettingsAbout || null,
          avatar_url: activeCommunity?.avatar_url ?? null,
          avatar_focus_x: activeCommunity?.avatar_focus_x ?? null,
          avatar_focus_y: activeCommunity?.avatar_focus_y ?? null,
          avatar_zoom: activeCommunity?.avatar_zoom ?? null,
          banner_url: activeCommunity?.banner_url ?? null,
          banner_focus_x: activeCommunity?.banner_focus_x ?? null,
          banner_focus_y: activeCommunity?.banner_focus_y ?? null,
          banner_zoom: activeCommunity?.banner_zoom ?? null,
          visibility: activeCommunity?.visibility ?? "unlisted",
          admin_count: funnelPreviewAdminCount,
          online_count: funnelPreviewOnlineCount,
          online_faces: funnelPreviewOnlineFaces,
        },
        previewVisibilityLabel: funnelPreviewVisibilityLabel,
        previewMemberCount: activeCommunitySocialMemberCount,
        previewFunnelAction: funnelPreviewAction,
      },
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
        isLoadingResources,
        isLoadingResourceModules,
        modules: communityResourceModules,
        resources: communityResources,
        selectedModuleId: communityResourceModuleId,
        openResourceEmbedId,
      },
      resourcesActions: {
        setOpenResourceEmbedId,
        handleSelectModule: setCommunityResourceModuleId,
        openNewModuleModal,
        handleEditModule,
        handleSetModuleStatus,
        handleDeleteModule,
        handleReorderModules,
        handleReorderResources,
        handleMoveResourceToModule,
        openNewResourceModal,
        openNewSourceModal,
        resourceEditor,
        handleDeleteResource,
        handleCreatePageDraftFromSource,
        handleCreateBlankPageDraft,
        reloadResources: reloadActiveResources,
      },
      eventsState: {
        events: communityEvents,
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
      resourceModalProps,
      canPostMessagesActiveCommunity: canPostMessagesActiveChannel,
      isProfileSetupComplete: isProfileSetupCompleteForPublicActions,
      isLoadingChat,
      hasResolvedCommunityChat,
      isLoadingMoreChat,
      communityChatHasMore,
      communityMessages,
      communityActivityEvents,
      communityMessageById,
      messageReactions,
      typingPresence: communityTypingUsers,
      onCommunityTypingSignal: signalCommunityTyping,
      onCommunityTypingClear: clearCommunityTyping,
      profilesByUserId: savedProfilesByUserId,
      mentionableCommunityMembers: communityDirectoryMembers,
      editingMessageId,
      editingMessageText,
      reactionPickerMessageId,
      replyingToMessage,
      communityAttachments,
      communityMessageInput,
      communityMessageMentions,
      setCommunityMessageMentions,
      communityAgentServeIssue,
      onDismissCommunityAgentServeIssue: handleDismissCommunityAgentServeIssue,
      onConnectCommunityAgentServeProvider: handleConnectCommunityAgentServeProvider,
      isSendingCommunityMessage,
      communityChatError,
      copiedCommunityMessageId,
      isUserAtBottom,
      unreadCount,
      reactionEmojis: WEB_COMMUNITY_REACTION_EMOJIS,
      messageListRef: communityChatListRef,
      fileInputRef: communityFileInputRef,
      chatInputRef,
      onChatScroll: handleChatScroll,
      onFinishProfileSetup: openProfileSetup,
      onScrollToBottom: scrollCommunityChatToBottom,
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
      shouldShowCommunitySenderMeta,
      getAvatarColor,
      getInitials,
      formatChatTime,
      parseReplyPrefix,
      truncateReplyPreview,
      renderTextWithLinks,
      onScrollToReplyMessage: scrollToCommunityMessage,
      onOpenCommunityChatLightbox: openCommunityChatLightbox,
      onToggleReaction: handleToggleReaction,
      onSetReactionPickerMessageId: setReactionPickerMessageId,
      onStartReply: handleStartReply,
      onCopyMessage: handleCopyCommunityMessage,
      onStartEdit: handleStartEdit,
      onDeleteMessage: handleDeleteMessage,
      onEditingMessageTextChange: setEditingMessageText,
      onSaveEdit: handleSaveEdit,
      onCancelEdit: handleCancelEdit,
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
        mobileThreadPage: mobileThreadPageOpen,
        onMobileReadingModeChange: mobileChromeScrollTrackingEnabled
          ? setMobileChromeReadingMode
          : undefined,
        roots: isActiveCommunityChannelReady
          ? visibleCommunityInteractionRoots
          : [],
        selectedRootId: isActiveCommunityChannelReady
          ? selectedCommunityInteractionRootId
          : null,
        replies: isActiveCommunityChannelReady
          ? selectedCommunityInteractionReplies
          : [],
        isLoadingRoots:
          isActiveCommunityChannelLoading ||
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
        onlineUserIds: activeCommunityOnlineUserIds,
        presenceSummary: activeCommunityPresenceSummary,
        communityMemberCount: communityDirectoryMemberCount,
        communityMembers: communityDirectoryMembers,
        communityMembersHasMore: communityDirectoryMembersHasMore,
        isLoadingCommunityMembers: isLoadingCommunityDirectoryMembers,
        isLoadingMoreCommunityMembers: isLoadingMoreCommunityDirectoryMembers,
        communityMembersLoadError: communityDirectoryMembersLoadError,
        onLoadMoreCommunityMembers: () => {
          if (!activeCommunityId || !session) return;
          void loadMoreCommunityDirectoryMembers(activeCommunityId, session);
        },
        communityId: activeCommunityId,
        communityOwnerId: activeCommunity?.owner_id ?? null,
        canManageCommunityMembers: canManageMembersActiveCommunity,
        communityEntryPolicy: activeCommunity?.entry_policy ?? null,
        canSetCommunityFreeAccessMode:
          canManageMembersActiveCommunity &&
          (activeCommunity?.entry_policy === "open" || activeCommunity?.entry_policy === "approval"),
        isSettingCommunityFreeAccessMode,
        communityFreeAccessModeError,
        onSetCommunityFreeAccessMode: handleSetCommunityContextFreeAccessMode,
        canReviewCommunityJoinRequests: canReviewJoinRequestsActiveCommunity,
        communityJoinReviewMode: activeCommunityMembersJoinReviewMode,
        communityJoinRequests: communityContextJoinRequests,
        isLoadingCommunityJoinRequests,
        communityJoinRequestsError,
        decidingCommunityJoinRequestId,
        onApproveCommunityJoinRequest: handleApproveCommunityJoinRequest,
        onDenyCommunityJoinRequest: handleDenyCommunityJoinRequest,
        communityMemoryOverview: communityPolynetController.state.overview,
        isLoadingCommunityMemory: communityPolynetController.state.isLoading,
        communityMemoryError: communityPolynetController.state.error,
        onRefreshCommunityMemory: communityPolynetController.actions.refresh,
        onOpenCommunityMemory: () => {
          const nextCommunitySlug = String(selectedActiveCommunitySlug ?? activeCommunity?.slug ?? "").trim();
          if (nextCommunitySlug) {
            openCommunityTab(nextCommunitySlug, "polynet", { pushSnapshot: false });
          }
        },
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
      publicCommunityUi,
      setDiscoverError,
      setCheckoutError,
      setCheckoutStatus,
      resolveKnownCommunityIdBySlug,
      enterJoinedCommunity,
      openPublicCommunityFunnel,
    });
  const settingsPanelsProps: WebSettingsPanelsProps = {
    settingsGroup: settingsGroup as SettingsGroup,
    profile: {
      session: session,
      cloudProfile,
      profileUi,
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
      isLoadingChatgptConnection,
      chatgptConnection,
      isConnectingChatgpt: providerConnectionUi.isConnectingChatgpt,
      isPollingChatgptConnection:
        providerConnectionUi.isPollingChatgptConnection,
      isLoadingOpenAiConnection: isLoadingChatgptConnection,
      openAiConnection,
      hasPendingChatgptAuth,
      handleConnectChatgpt: providerConnectionUi.handleConnectChatgpt,
      handleDisconnectChatgpt:
        providerConnectionUi.handleDisconnectChatgpt,
      chatgptDeviceUserCode: providerConnectionUi.chatgptDeviceUserCode,
      chatgptConnectionError:
        providerConnectionUi.chatgptConnectionError,
      chatgptConnectionSuccess:
        providerConnectionUi.chatgptConnectionSuccess,
      openAiApiKeyDraft: providerConnectionUi.openAiApiKeyDraft,
      setOpenAiApiKeyDraft: providerConnectionUi.setOpenAiApiKeyDraft,
      isSavingOpenAiConnection:
        providerConnectionUi.isSavingOpenAiConnection,
      openAiConnectionError: providerConnectionUi.openAiConnectionError,
      openAiConnectionSuccess: providerConnectionUi.openAiConnectionSuccess,
      handleConnectOpenAi: providerConnectionUi.handleConnectOpenAi,
      handleDisconnectOpenAi:
        providerConnectionUi.handleDisconnectOpenAi,
      founderInferenceStatus: founderInference.status,
      isLoadingFounderInference: founderInference.isLoading,
      isSavingFounderInference: founderInference.isSaving,
      founderInferenceError: founderInference.error,
      founderInferenceSuccess: founderInference.success,
      handleActivateFounderInference: founderInference.activate,
      handleSuspendFounderInference: founderInference.suspend,
      formatRelativeTime,
    },
    billing: {
      session,
      founderBillingOverview: founderBilling.overview,
      isLoadingFounderBilling: founderBilling.isLoading,
      founderBillingActionCommunityId: founderBilling.actionCommunityId,
      founderBillingError: founderBilling.error,
      startFounderSubscriptionCheckout: founderBilling.startCheckout,
      openFounderBillingPortal: founderBilling.openPortal,
      refreshFounderBilling: founderBilling.refresh,
      pendingPurchaseClaims,
      isLoadingPendingPurchases,
      isRedeemingPendingPurchases,
      redeemPendingPurchases: redeemPendingPurchasesForSettings,
      refreshPendingPurchases: refreshPendingPurchasesForSettings,
      pendingPurchasesError,
      pendingPurchasesSuccess,
    },
    appearance: {
      appTheme,
      setAppTheme,
    },
  };
  const activeCommunityAttentionSummary = activeCommunityId
    ? (attentionByCommunityId[activeCommunityId] ?? { chat: false, ai_feed: false, resources: false, events: false })
    : { chat: false, ai_feed: false, resources: false, events: false };
  const activeCommunityAttentionCount =
    Number(Boolean(activeCommunityAttentionSummary.chat || (activePage === "community" && activeCommunityId && unreadCount > 0))) +
    Number(Boolean(activeCommunityAttentionSummary.ai_feed)) +
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
    openConversation: handleOpenDirectConversationById,
  });
  const standalonePublicRouteViewProps = buildWebStandalonePublicRouteViewProps({
    publicRouteKind: publicRoute.kind,
    showSignIn: showPublicSignIn,
    requireSignIn,
    handleSignOut,
    checkoutStatus,
    retryCheckoutFinalize,
    handlePublicCheckoutContinue,
    handlePublicClaimContinue,
    checkoutError,
    pendingToken,
    manualClaimToken,
    setManualClaimToken,
    isRedeemingClaim,
    redeemClaimError,
    authError,
  });

  if (standalonePublicRouteViewProps) {
    return (
      <Suspense fallback={<div className="landing-auth-hold" aria-hidden="true" />}>
        <WebStandalonePublicRouteShell {...standalonePublicRouteViewProps} />
      </Suspense>
    );
  }

  const globalOverlayHostProps = buildWebGlobalOverlayHostProps({
    providerConnectionModalHostProps: providerConnectionUi.modalHostProps,
    communityModalHostProps: communityUi.modalHostProps,
    founderInferencePromptProps: {
      isOpen: shouldOpenFounderInferencePrompt({ session, founderInference, founderBilling }),
      communities: founderInference.status.communities,
      keyConnected: founderInference.status.key_connected,
      onContinue: () => { founderInference.dismissActivationPrompt(); openGlobalSettings("account"); },
      onClose: founderInference.dismissActivationPrompt,
    },
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
    holdLandingForAuth: shouldHoldLandingForAuth,
    landingPageProps: {
      onTryFree: () => {
        void routeTryPolynetFree();
      },
    },
    onboardingPageProps: {
      accountSetupStatus: effectiveAccountSetupStatus,
      setup: accountSetupSurface.model,
      isAvatarFocusModalOpen: profileUi.isProfileAvatarFocusModalOpen,
      isAvatarDragOver: profileUi.isProfileAvatarDragOver,
      setIsAvatarDragOver: profileUi.setIsProfileAvatarDragOver,
      setAvatarFocusX: profileUi.setProfileAvatarFocusX,
      setAvatarFocusY: profileUi.setProfileAvatarFocusY,
      setAvatarZoom: profileUi.setProfileAvatarZoom,
      setIsAvatarFocusModalOpen: profileUi.setIsProfileAvatarFocusModalOpen,
      onAvatarDrop: handleProfileAvatarDrop,
      onRemoveAvatar: () => {
        profileUi.setProfileAvatarUrl(null);
        profileUi.setProfileAvatarStorageId(null);
        profileUi.setProfileAvatarFocusX(0.5);
        profileUi.setProfileAvatarFocusY(0.5);
        profileUi.setProfileAvatarZoom(1);
      },
      onNextProfile: saveOnboardingProfile,
      onFinishOnboarding: finishOnboarding,
      onClose: closeProfileSetup,
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
              setup: accountSetupSurface.model,
              onEnter: completePlatformBridge,
            }
          : null,
    },
    showOnboardingModal: shellPublicRoute.kind === "app" && isOnboardingModalOpen,
    settingsSurfaceHostProps: {
      settingsGroup: settingsGroup as SettingsGroup,
      showMobileSettingsShell,
      showMobileSettingsIndex,
      onSelectMobileSettingsPage: (page) => {
        setSettingsPage(page);
        setMobileSettingsView("detail");
      },
      onShowMobileSettingsIndex: () => setMobileSettingsView("index"),
      settingsPanelsProps,
    },
    publicCommunityFunnelProps: {
      publicRouteSlug:
        publicRoute.kind === "community_funnel" ||
        publicRoute.kind === "community_funnel_preview"
          ? publicRoute.slug
          : undefined,
      publicCommunity: resolvedPublicCommunity
        ? {
            ...resolvedPublicCommunity,
            slug: resolvedPublicCommunity.slug ?? undefined,
          }
        : null,
      isMobile: showMobilePublicFunnel,
      shellVariant,
      isPreviewMode: isPublicFunnelPreviewRoute,
      gateOpenNonce: publicCommunityUi.visitorGateNonce,
      mobileMembersOverlayOpen:
        showMobileShell &&
        (publicRoute.kind === "community_funnel" ||
          publicRoute.kind === "community_funnel_preview") &&
        mobileOverlay === "members",
      onCloseMobileMembersOverlay: () => setMobileOverlay(null),
      publicVisibilityLabel,
      selectedPublicCommunityPlanLabel: selectedPublicCommunityPlan
        ? formatPlanPrice(selectedPublicCommunityPlan)
        : null,
      hasSelectedPublicCommunityPlan: Boolean(selectedPublicCommunityPlan),
      isLoadingPublicCommunity: publicCommunityUi.isLoadingPublicCommunity,
      canEnterCommunity: canEnterPublicCommunity,
      canJoinForFree,
      canJoinWithApproval,
      canJoinWithCheckout,
      checkoutStatus,
      isJoiningPublicCommunity: publicCommunityUi.isJoiningPublicCommunity,
      isCancellingPublicCommunityJoinRequest:
        publicCommunityUi.isCancellingPublicCommunityJoinRequest,
      isLoadingMyPublicCommunityJoinRequest:
        publicCommunityUi.isLoadingMyPublicCommunityJoinRequest,
      approvalPending,
      approvalDenied,
      canRequestAgain,
      approvalReapplyLabel,
      onPrimaryJoinAction: handlePublicLandingPrimaryAction,
      onCancelPendingJoinRequest: handleCancelPendingPublicJoinRequest,
      publicCommunityError: publicCommunityUi.publicCommunityError,
      publicJoinError: publicCommunityUi.publicJoinError,
      checkoutError,
      showSignIn: showPublicSignIn,
      bridge:
        /* The pitch converts first: the bridge opens on an entry ATTEMPT
           (join/enter/claim), never on arrival. */
        !isPublicFunnelPreviewRoute &&
        session &&
        resolvedPublicCommunity &&
        effectiveAccountSetupStatus &&
        !effectiveAccountSetupStatus.completed &&
        isBridgeGateOpen
          ? {
              variant: "community" as const,
              communityName: resolvedPublicCommunity.name,
              communityAvatarUrl: resolvedPublicCommunity.avatar_url ?? null,
              communityAvatarFocusX: resolvedPublicCommunity.avatar_focus_x ?? null,
              communityAvatarFocusY: resolvedPublicCommunity.avatar_focus_y ?? null,
              communityAvatarZoom: resolvedPublicCommunity.avatar_zoom ?? null,
              paidReceiptLabel:
                checkoutStatus === "succeeded" && !canEnterPublicCommunity
                  ? "Payment received — you're in as soon as this is done"
                  : null,
              enterLabel: approvalPending
                ? "Finish setup"
                : `Enter ${resolvedPublicCommunity.name}`,
              setup: accountSetupSurface.model,
              onEnter: completeBridgeAndEnter,
            }
          : null,
    },
    communityHostProps: {
      communityTab,
      onSelectCommunityTab: handleSelectCommunityTab,
      firstPostFocusRequest: communityOnboardingFirstPostFocusRequest,
      chatPanelProps: {
        ...communityChatPanelProps,
        mobileMembersOverlayOpen: showMobileShell && mobileOverlay === "members",
        onCloseMobileMembersOverlay: () => setMobileOverlay(null),
      },
      secondaryPanelsProps: communitySecondarySurfaceProps,
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
    community: memberAgentDockCommunity,
    surfaceContext: memberAgentSurfaceContext,
    isVisible: isMemberAgentDockVisible,
  } = useWebMemberAgentSurfaceController({
    activePage,
    communityTab,
    settingsPage,
    activeOperatorTab,
    activeCommunity,
    isAuthenticated: Boolean(session),
    publicRouteKind: publicRoute.kind,
    hasResolvedCommunities,
    isDirectMessagesOpen,
    isOnboardingModalOpen,
    memberAgentVoiceUiState,
    cancelVoiceInput,
  });
  const activeIndicators = activeCommunityId
    ? (attentionByCommunityId[activeCommunityId] ?? { chat: false, ai_feed: false, resources: false, events: false, mentions: false })
    : { chat: false, ai_feed: false, resources: false, events: false, mentions: false };
  const localActiveCommunityChatAttention = Boolean(activePage === "community" && activeCommunityId && unreadCount > 0);
  const communityTabIndicators = {
    chat: Boolean(activeIndicators.chat || localActiveCommunityChatAttention),
    ai_feed: Boolean(activeIndicators.ai_feed),
    resources: Boolean(activeIndicators.resources),
    events: Boolean(activeIndicators.events),
    // An unseen mention-of-you upgrades the chat dot to the accent variant.
    mentions: Boolean(activeIndicators.mentions),
  };
  const communityRailAttentionById: Record<string, boolean> = {};
  for (const [communityId, indicators] of Object.entries(attentionByCommunityId)) {
    if (indicators.chat || indicators.ai_feed || indicators.resources || indicators.events || indicators.mentions) {
      communityRailAttentionById[communityId] = true;
    }
  }
  if (activeCommunityId && localActiveCommunityChatAttention) {
    communityRailAttentionById[activeCommunityId] = true;
  }
  /* The visitor lens on the shell: /c/:slug feeds the SAME nav the member
     page uses — community identity from the public payload, every capability
     false, gated tabs locked. One more lens, not another page. */
  const isVisitorCommunitySurface =
    publicRoute.kind === "community_funnel" || publicRoute.kind === "community_funnel_preview";
  const visitorShellActiveCommunity =
    isVisitorCommunitySurface && resolvedPublicCommunity
      ? {
          id: `visitor:${resolvedPublicCommunity.slug ?? publicFunnelSlug ?? ""}`,
          slug: resolvedPublicCommunity.slug ?? null,
          name: resolvedPublicCommunity.name,
          avatar_url: resolvedPublicCommunity.avatar_url ?? null,
          avatar_focus_x: resolvedPublicCommunity.avatar_focus_x ?? null,
          avatar_focus_y: resolvedPublicCommunity.avatar_focus_y ?? null,
          avatar_zoom: resolvedPublicCommunity.avatar_zoom ?? null,
          banner_url: resolvedPublicCommunity.banner_url ?? null,
          banner_focus_x: resolvedPublicCommunity.banner_focus_x ?? null,
          banner_focus_y: resolvedPublicCommunity.banner_focus_y ?? null,
          banner_zoom: resolvedPublicCommunity.banner_zoom ?? null,
        }
      : null;
  const shellChromeHostProps = buildWebShellChromeHostProps({
    showMobileAppShell,
    showMobileSettingsShell,
    showMobilePublicFunnel,
    mobileOverlay,
    mobileChromeAutoHideEnabled,
    mobileChromeReadingMode: mobileChromeReadingModeActive,
    showMobileShell,
    mobileShellMode,
    mobileRootPage,
    mobileThreadPageOpen,
    forceMobileCommunityRoot: showMobileShell && isVisitorCommunitySurface,
    showMobileSettingsIndex,
    activePage,
    activeCommunity: isVisitorCommunitySurface ? visitorShellActiveCommunity : activeCommunity,
    activeCommunityAttentionCount,
    activeCommunityMemberFaces:
      isVisitorCommunitySurface
        ? resolvedPublicCommunity?.online_faces ?? []
        : canViewMembersActiveCommunity
        ? activeCommunityPresenceSummary?.online_faces ?? []
        : [],
    activeCommunityMemberCount:
      isVisitorCommunitySurface
        ? resolvedPublicCommunity?.member_count ?? null
        : canViewMembersActiveCommunity
        ? communityDirectoryMemberCount ??
          activeCommunityPresenceSummary?.member_count ??
          null
        : null,
    canOpenMobileMembers:
      isVisitorCommunitySurface
        ? Boolean(resolvedPublicCommunity)
        : canViewMembersActiveCommunity,
    openMobileDrawer,
    handleExitMobileSettings,
    handleCloseMobileThreadPage: handleCloseCommunityInteractionDrawer,
    handleSelectMobileRootPage,
    setMobileOverlay,
    isPublicCommunityFunnel,
    isPublicFunnelPreviewRoute: publicRoute.kind === "community_funnel_preview",
    hasBackTargetSnapshot: Boolean(backTargetSnapshot),
    backTargetLabel: effectiveBackTargetLabel ?? null,
    activeView,
    directMessagesButton,
    publicFunnelPreviewExitPath:
      publicRoute.kind === "community_funnel_preview"
        ? applyShellVariantToAppPath(
            buildCommunityTabPath(publicRoute.slug, "funnel") ?? "",
            shellVariant,
          ) || null
        : null,
    handleTopbarBackFromPublicFunnel,
    handleTopbarBackFromSettings,
    handleTopbarBackToCommunity,
    communityTab: isVisitorCommunitySurface ? "chat" : communityTab,
    communityTabIndicators: isVisitorCommunitySurface
      ? { chat: false, ai_feed: false, resources: false, events: false, mentions: false }
      : communityTabIndicators,
    communityChannels: isVisitorCommunitySurface
      ? [{ id: "", slug: "general", name: "General", is_general: true }]
      : activeCommunityChannels,
    isLoadingCommunityChannels:
      !isVisitorCommunitySurface && isLoadingActiveCommunityChannels,
    selectedCommunityChannelSlug: isVisitorCommunitySurface
      ? "general"
      : activeCommunityChannelSlug,
    communityChannelIndicators: isVisitorCommunitySurface
      ? {}
      : communityChannelIndicators,
    handleSelectCommunityChannel: isVisitorCommunitySurface
      ? () => undefined
      : (channel) => {
          const path = buildCommunityTabPath(
            selectedActiveCommunitySlug,
            "chat",
            null,
            null,
            channel.is_general ? null : channel.slug,
          );
          if (path) navigateTo(path);
        },
    handleCreateCommunityChannel: isVisitorCommunitySurface
      ? () => Promise.resolve(null)
      : handleCreateCommunityChannel,
    isCreatingCommunityChannel,
    communityChannelCreateError,
    clearCommunityChannelCreateError,
    isAtCommunityChannelLimit,
    maxActiveCommunityChannels,
    canViewMembersActiveCommunity: !isVisitorCommunitySurface && canViewMembersActiveCommunity,
    canViewActiveCommunitySettings: !isVisitorCommunitySurface && canViewActiveCommunitySettings,
    canViewActiveCommunityPolynet: !isVisitorCommunitySurface && canViewActiveCommunityPolynet,
    canManageMembersActiveCommunity: !isVisitorCommunitySurface && canManageMembersActiveCommunity,
    canViewActiveCommunityAnalytics: !isVisitorCommunitySurface && canViewActiveCommunityAnalytics,
    lockedCommunityNavTabs: isVisitorCommunitySurface
      ? { ai_feed: true, resources: true, events: true }
      : null,
    handleSelectCommunityTab: isVisitorCommunitySurface
      ? (tab) => {
          if (tab !== "chat") {
            publicCommunityUi.setVisitorGateNonce((nonce) => nonce + 1);
          }
        }
      : handleSelectCommunityTab,
    handleSelectCommunityTabFromMobile: isVisitorCommunitySurface
      ? (tab) => {
          if (tab !== "chat") {
            publicCommunityUi.setVisitorGateNonce((nonce) => nonce + 1);
          }
        }
      : handleSelectCommunityTabFromMobile,
    onCopyCommunityJoinLink: copyTextToClipboard,
    openMobileAgentSettings,
    canOpenDirectMessages: Boolean(session),
    directMessagesUnreadCount,
    /* Rail bridge: on the visitor route, app state changes don't render
       (publicRoute stays "community_funnel"), so shell verbs must really
       NAVIGATE — the rail is real, its clicks must be too. */
    handleOpenDiscover: isVisitorCommunitySurface
      ? () => navigateTo("/discover")
      : handleOpenDiscover,
    openMobileCreateCommunity,
    openCommunityCreateFlow: openCreateCommunityModal,
    communities,
    railCommunities,
    communityRailAttentionById,
    isLoadingCommunities,
    selectedActiveCommunitySlug,
    handleSelectActiveCommunity: isVisitorCommunitySurface
      ? (community) => {
          const path = buildCommunityTabPath(community.slug ?? null, "chat");
          if (path) navigateTo(path);
          return false;
        }
      : (community) => {
          const nextCommunity =
            railCommunities.find((candidate) => candidate.id === community.id) ??
            communities.find((candidate) => candidate.id === community.id);
          return nextCommunity ? handleSelectActiveCommunity(nextCommunity) : false;
        },
    openCommunityChat,
    communityInitials,
    showDesktopCommunityRail,
    showDesktopCommunityNav,
    hasCommunityRailMiddleContent,
    canReorderCommunities,
    draggingCommunityId,
    setCommunityRailListElement,
    getCommunityRailItemBindings,
    handleOpenGlobalSettings: isVisitorCommunitySurface
      ? () => navigateTo(buildSettingsPath("profile"))
      : () => openGlobalSettings("profile"),
    settingsGroup: settingsGroup as SettingsGroup,
    setSettingsPage,
    hasLeftPanel,
    isGlobalSettings,
  });

  return (
    <WebAppCompositionRoot
      globalOverlayHostProps={globalOverlayHostProps}
      memberAgentDockRef={memberAgentComposerApiRef}
      memberAgentDockProps={{
        isVisible: isMemberAgentDockVisible,
        mobileShellActive: showMobileShell,
        mobileRoot: showMobileShell && mobileRootPage === "agent",
        onRequestOpen: () => setMobileRootPage("agent"),
        communityId: memberAgentDockCommunity?.id ?? null,
        communityName: memberAgentDockCommunity?.name ?? null,
        surfaceContext: memberAgentSurfaceContext,
        session,
        ensureSession: ensureUsableAuthSession,
        fetchPublic: fetchWithPublic,
        fetchAuth: fetchWithAuth,
        voiceButtonProps: {
          state: memberAgentVoiceUiState,
          title: memberAgentVoiceIntent.title,
          onClick: () => {
            void handleVoiceInputClick("member_agent");
          },
        },
        finalizeVoiceInputForSubmit: () =>
          finishVoiceInputForSubmit("member_agent"),
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
      onboardingProps={{
        session: communityChatPanelProps.session,
        ensureSession: ensureUsableAuthSession,
        communityId: memberAgentDockCommunity?.id ?? null,
        communityName: memberAgentDockCommunity?.name ?? null,
        communityAvatarUrl:
          memberAgentDockCommunity?.avatar_url ?? null,
        communityAvatarFocusX:
          memberAgentDockCommunity?.avatar_focus_x ?? null,
        communityAvatarFocusY:
          memberAgentDockCommunity?.avatar_focus_y ?? null,
        communityAvatarZoom:
          memberAgentDockCommunity?.avatar_zoom ?? null,
        isEnabled: Boolean(
          memberAgentDockCommunity &&
          communityChatPanelProps.hasAuthenticatedPresentation &&
          communityChatPanelProps.hasSession
        ),
        previewMode: isCommunityOnboardingPreviewMode,
        canPreview: canManageCommunitySettings,
        onExitPreview: handleExitCommunityOnboardingPreview,
        onOrientationCompleted:
          handleCommunityOnboardingOrientationCompleted,
      }}
    />
  );
}
