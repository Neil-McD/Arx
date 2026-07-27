import {
  useCallback,
  useEffect,
  lazy,
  useMemo,
  useRef,
  useState,
  Suspense,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import { MessageCircle } from "lucide-react";
import "highlight.js/styles/github-dark.css";
import {
  beginBrowserSignedOutState,
  getAuthUid,
  getAuthPublicKey,
  getAuthUrl,
  hasRecentAuthFlowPending,
  type AuthSession,
} from "./auth";
import {
  buildPathWithSearchParamsRemoved,
  buildTelemetryRouteLabel,
} from "../../../shared/routePrivacy";
import {
  readProfileDraftForUser, writeProfileDraftForUser, } from "../../../shared/profileDraftStorage";
import {
  resolveAuthSubject,
} from "../../../shared/authSession";
import {
  identifyCloudBusinessVisitor,
} from "../../../shared/cloudBusinessAnalyticsGateway";
import {
  buildContextFallbackThreadTitle, deriveThreadTitleFromUserText, isMissingThreadTitleValue, traceThreadContext, } from "../../../shared/threadTitleUi";
import { CommunityAvatar } from "../../../shared/CommunityAvatar";
import {
  formatProviderConnectionErrorMessage,
  formatWorkspaceBillingCheckoutError,
} from "../../../shared/appErrorMappings";
import {
  isLikelyImageFile, isLikelyMediaFile, isLikelyTextFile, isSupportedChatRasterImage, readChatImageAsDataUrl, readTextAttachmentPreview, } from "../../../shared/attachmentHelpers";
import {
  type CreateCommunityIntentDraft,
} from "../../../shared/createCommunityIntent";
import {
  DEFAULT_EMPTY_THREAD_LANDING, normalizeCommunityAgentDraftForSave, normalizeCommunityAgentLanding, type CommunityAgentLanding, } from "../../../shared/communityAgentLanding";
import { normalizeCommunityFunnelConfig } from "../../../shared/communityFunnel";
import {
  buildCsv, formatChatTime, formatCount, formatMoneyBaseUnits, formatPercent, formatRelativeTimeFromIso as formatRelativeTime, } from "../../../shared/contentFormatting";
import {
  formatAccountTierLabel, isAccountTierFree, formatPlanPrice, formatSubscriptionPrice, type StripeConnectReturn, } from "../../../shared/accountCommerce";
import { canUseCreatorDevTierOverride } from "../../../shared/devTierOverride";
import { useCheckoutFinalizeController } from "../../../shared/useCheckoutFinalizeController";
import {
  useWebWorkspaceCoreController,
} from "./controllers/useWebWorkspaceCoreController";
import { useWebCommunityUiController } from "./controllers/useWebCommunityUiController";
import { useWebCommunityAgentConfigUiController } from "./controllers/useWebCommunityAgentConfigUiController";
import { useWebCommunityAppsController } from "./controllers/useWebCommunityAppsController";
import { useWebCommunitySkillAttachmentsController } from "./controllers/useWebCommunitySkillAttachmentsController";
import { useWebCommunityAdminUiController } from "./controllers/useWebCommunityAdminUiController";
import { useWebCommunitySettingsUiController } from "./controllers/useWebCommunitySettingsUiController";
import { useWebCommunityResourceUiController } from "./controllers/useWebCommunityResourceUiController";
import { useWebCommunityJoinRequestsController } from "./controllers/useWebCommunityJoinRequestsController";
import type { CommittedMention } from "./components/communityMentionAutocomplete";
import { useWebPersonalMemoryUiController } from "./controllers/useWebPersonalMemoryUiController";
import { useWebPublicCommunityUiController } from "./controllers/useWebPublicCommunityUiController";
import { useWebProfileSettingsUiController } from "./controllers/useWebProfileSettingsUiController";
import { useWebProviderConnectionUiController } from "./controllers/useWebProviderConnectionUiController";
import { useWebEffectiveMcpAppsController } from "./controllers/useWebEffectiveMcpAppsController";
import { useWebEffectiveSkillsController } from "./controllers/useWebEffectiveSkillsController";
import { useWebUserPlatformAppMountsController } from "./controllers/useWebUserPlatformAppMountsController";
import { useWebUserPlatformSkillsController } from "./controllers/useWebUserPlatformSkillsController";
import {
  removePersonalMountFromEffectiveMcpApps,
} from "../../../shared/effectiveMcpApps";
import { buildEffectiveSkills } from "../../../shared/effectiveSkills";
import { COMMUNITY_MANAGER_PLATFORM_SKILLS } from "../../../shared/platformSkills";
import { useWebAppAuthController } from "./controllers/useWebAppAuthController";
import { updateSentryUiContext } from "./instrument";
import {
  emitWorkspaceEvent,
  formatWorkspaceInstrumentationError,
} from "./lib/workspaceInstrumentation";
import {
  captureProductAnalyticsEvent,
  updatePosthogUiContext,
} from "./posthogAnalytics";

import {
  useCommunityAiFeedController,
} from "../../../shared/useCommunityAiFeedController";
import { useCommunityAttentionController } from "../../../shared/useCommunityAttentionController";
import { markCloudCommunityChatReadAt } from "../../../shared/cloudCommunityAttentionGateway";
import {
  createCloudCommunityChatLiveClient,
  setCloudCommunityTyping,
  uploadCloudCommunityChatAttachmentFile,
  type CloudCommunityChatLiveClient,
} from "../../../shared/cloudCommunityChatGateway";
import {
  subscribeCloudCommunityAgentServeIssue,
  type CloudCommunityAgentServeIssue,
} from "../../../shared/cloudCommunityAgentConciergeGateway";
import {
  createCloudCommunityInteractionComposerMessageRows,
  deleteCloudCommunityInteractionMessage,
  editCloudCommunityInteractionMessage,
  listCloudCommunityInteractionRootsPage,
  listCloudCommunityInteractionReplies,
  subscribeCloudCommunityInteractionReplies,
  subscribeCloudCommunityInteractionRoots,
  toggleCloudCommunityInteractionReaction,
  type CommunityInteractionAttachment,
  type CommunityInteractionPendingStatus,
  type CommunityInteractionReplyBundle,
  type CommunityInteractionRootBundle,
} from "../../../shared/cloudCommunityInteractionsGateway";
import {
  saveCloudCommunityPublicPresentation,
} from "../../../shared/cloudCommunityFunnelGateway";
import {
  resolveCloudMemberEntryDestination,
  type CloudMemberEntryDestination,
} from "../../../shared/cloudMemberEntryDestinationGateway";
import {
  checkCloudProfileHandleAvailability,
  loadCloudAccountSetupStatus,
  prepareCloudProfileAvatarField,
  recordMemberTimezoneRpc,
  resolveCloudOnboardingProfileDetail,
  type CloudProfileHandleAvailability,
  upsertCloudProfileDetail,
} from "../../../shared/cloudProfilesGateway";
import { formatProfileMutationError } from "../../../shared/profileMutationErrors";
import {
  formatAccountSetupMissingGuidance,
  isAccountSetupStatusIdentityComplete,
  type AccountSetupStatus,
} from "../../../shared/accountSetup";
import {
  saveCloudCommunityAgentConfig as saveCloudCommunityAgentConfigDirect,
} from "../../../shared/cloudCommunityAgentGateway";
import {
  applyCloudCommunityWikiArchitectProposal,
  beginCloudCommunityGoogleDriveSourceOAuth,
  beginCloudCommunityGitHubSourceOAuth,
  crawlCloudCommunitySourceRoot,
  createCloudCommunity,
  deleteCloudCommunityResource,
  disconnectCloudCommunityGitHubSourceConnection,
  disconnectCloudCommunityGoogleDriveSourceConnection,
  draftCloudCommunityResourceContentFromSources,
  fetchCloudCommunityMemberBillingHistory,
  finalizeCloudCommunityGoogleDriveSourceOAuth,
  finalizeCloudCommunityGitHubSourceOAuth,
  getCloudCommunitySourceCrawlJob,
  importCloudCommunityGitHubSourceFiles,
  importCloudCommunityGoogleDriveSourceFiles,
  ingestCloudCommunitySources,
  listCloudCommunityLaunchKnowledgeSources,
  listCloudCommunityGitHubSourceFiles,
  listCloudCommunityGitHubSourceRepositories,
  listCloudCommunityGoogleDriveSourceFiles,
  loadCloudCommunityGitHubSourceConnection,
  loadCloudCommunityGoogleDriveSourceConnection,
  prepareCloudCommunityBrandingField,
  runCloudCommunityWikiArchitectProposal,
  saveCloudCommunityResource,
  setCloudCommunityFreeAccessMode,
  uploadCloudCommunityResourceSourceFile,
  type CloudCommunitySourceCrawlJob,
} from "../../../shared/cloudCommunityAdminGateway";
import {
  loadCloudCommunityLaunchSetupStatus,
  saveCloudCommunityLaunchProfile,
  type CloudCommunityLaunchProfileSaveInput,
  type CloudCommunityLaunchProfileSaveResult,
} from "../../../shared/cloudCommunityLaunchSetupGateway";
import type {
  CommunityLaunchSetupStatus,
  CommunityLaunchSetupStep,
} from "../../../shared/communityLaunchSetup";
import {
  SOURCE_INTEGRATION_OAUTH_RETURN_PARAM_NAMES,
  buildCommunityLaunchKnowledgeSourceOAuthReturnToPath,
  clearCommunityLaunchKnowledgeSourceOAuthIntent,
  mergeCommunityLaunchKnowledgeOAuthContext,
  normalizeLaunchOAuthContextParam,
  normalizeSourceIntegrationOAuthProvider,
  readCommunityLaunchKnowledgeOAuthContext,
  readCommunityLaunchKnowledgeSourceOAuthIntent,
  readSourceIntegrationOAuthStateFromAuthorizeUrl,
  writeCommunityLaunchKnowledgeSourceOAuthIntent,
  type CommunityLaunchKnowledgeOAuthContext,
} from "./communityLaunchKnowledgeSourceOAuth";
import {
  COMMUNITY_LAUNCH_SETUP_ROUTE_PARAM_NAMES,
  buildCommunityLaunchSetupRoutePath,
  isCommunityLaunchSetupRoutePath,
  parseCommunityLaunchSetupRouteStep,
  readCommunityLaunchSetupRouteContext,
  readCurrentCommunityLaunchSetupRouteContext,
  type CommunityLaunchSetupRouteContext,
} from "./communityLaunchSetupRoute";
import { listEnabledCloudModelRegistryRows } from "../../../shared/cloudModelRegistryGateway";
import {
  loadCloudProviderConnections,
  type CloudChatgptConnectionStatus,
  type CloudOpenAiConnectionStatus,
} from "../../../shared/cloudProviderConnectionsGateway";
import { AnalyticsLineChart } from "../../../shared/AnalyticsLineChart";
import {
  copyTextToClipboard,
  downloadTextFile,
  getAvatarColor,
  getInitials,
  shortId,
} from "../../../shared/chatUi";
import {
  type AppPage,
  type AppView,
  type CommunitySettingsPane,
  type CommunityTab,
  isCommunityRouteManagedTab,
  normalizeCommunityTabForAccess,
  type OperatorTab,
  type SettingsGroup,
  type SettingsPage,
  settingsGroupLabel,
  settingsGroupForPage,
} from "../../../shared/appShellNavigation";
import type {
  CommunityAiFeedPost as SharedCommunityAiFeedPost,
  AnalyticsRange as SharedAnalyticsRange,
  ChatLightboxImage as SharedChatLightboxImage,
  CommunityAccess as SharedCommunityAccess,
  CommunityAnalyticsSeries as SharedCommunityAnalyticsSeries,
  CommunityAgentConfig as SharedCommunityAgentConfig,
  CommunityAnalyticsSummary as SharedCommunityAnalyticsSummary,
  CommunityFunnelConfig as SharedCommunityFunnelConfig,
  DiscoverCommunitySnapshot as SharedDiscoverCommunitySnapshot,
  PublicPlanSummary as SharedPublicPlanSummary,
  UserProfile as SharedUserProfile,
  UserProfileDetail as SharedUserProfileDetail,
} from "../../../shared/communityTypes";
import type { CreateSkillPackageInput } from "../../../shared/skillPackageTypes";
import { deriveOpenDiscoverTransition } from "../../../shared/appNavTransitions";
import {
  type AppShellVariant,
  type AppRouteState,
  type CommunityExperienceMode,
  type PublicRoute,
  STANDALONE_APP_LAUNCH_SEARCH_PARAM,
  STANDALONE_APP_LAUNCH_SEARCH_VALUE,
  applyShellVariantToPublicPath,
  applyShellVariantToAppPath,
  applyShellVariantToKnownPath,
  buildAppRoutePath,
  buildCommunityFunnelPath,
  buildCommunityOnboardingPreviewPath,
  buildCommunityTabPath,
  buildSettingsPath,
  buildCommunityFunnelPreviewPath,
  isLegacyWorkspaceRoutePath,
  isRootAppRoutePath,
  readLegacyWorkspaceRouteContext,
  readAppRouteFromLocation,
  readPublicRouteFromLocation,
  readShellVariantFromPathname,
} from "../../../shared/webAppRouteState";
import { PRODUCT_DOCS_DEFAULT_SLUG } from "./docs/productDocsMeta";
import {
  formatBackTargetLabel as formatBackTargetLabelShared,
  type NavSnapshotBase,
  popDistinctNavSnapshot,
  pushUniqueNavSnapshot,
} from "../../../shared/navSnapshot";
import {
  communityInitials,
  extractRememberIntent,
  parseHistoryUsedArray,
  parseMessageHistoryUsed,
  parseMemoryUsedArray,
  parseMessageMemoryAdded,
  parseMessageMemorySuggestions,
  parseMessageMemoryUsed,
  parseMessageText,
  type HistoryUsedItem,
  type MemorySuggestion,
  type MemoryUsedItem,
} from "../../../shared/messageMetadataUi";
import {
  parseEmbedUrl,
  renderTextWithLinks,
} from "../../../shared/linkEmbedUi";
import { renderMarkdown } from "../../../shared/markdownUi";
import {
  readBannerFileAsWideDataUrlWithinLimit,
} from "../../../shared/imageTransforms";
import {
  clearAuthResumeState,
  readAuthResumeState,
  storeAuthResumeState,
} from "../../../shared/authResumeState";
import {
  hasOAuthCallbackParamsInLocation,
  readOAuthCallbackShellVariantFromLocation,
} from "../../../shared/cloudPkce";
import { routePendingAuthIntent } from "../../../shared/authResumeRouter";
import { resetWebSessionStateAfterSignOut } from "./auth/resetSessionState";
import { resolveUserAccessPolicy } from "../../../shared/capabilities";
import { isStandaloneWebApp } from "../../../shared/browserRuntimeMode";
import {
  DEFAULT_ACTIVE_MODEL_ID,
  DEFAULT_ACTIVE_MODEL_LABEL,
  DEFAULT_GUEST_MODEL_ID,
  FREE_MODEL_ALLOWLIST as SHARED_FREE_MODEL_ALLOWLIST,
  FREE_MODEL_LABELS as SHARED_FREE_MODEL_LABELS,
  getDefaultModelToggles,
  isFreeModelId,
  isModelAvailableOnSurface,
  type ModelToggle,
} from "../../../shared/modelCatalog";
import {
  applyAppThemeAttributes,
  parseAppTheme,
  type AppTheme,
} from "../../../shared/theme";
import { useLastClickWinsController } from "../../../shared/useLastClickWinsController";
import { useCommunityTypingPresence } from "../../../shared/useCommunityTypingPresence";
import { useCommunityChatLightbox } from "../../../shared/useCommunityChatLightbox";
import { useMessageAttachmentInputController } from "../../../shared/useMessageAttachmentInputController";
import { useCommunityChatMutationController } from "../../../shared/useCommunityChatMutationController";
import { useCommunityRailOrder } from "../../../shared/useCommunityRailOrder";
import { useRailPointerReorder } from "../../../shared/useRailPointerReorder";
import { useWebCommunityAccessController } from "../../../shared/useWebCommunityAccessController";
import { useWebDiscoverController } from "../../../shared/useWebDiscoverController";
import { useWebMemorySettingsDataController } from "../../../shared/useWebMemorySettingsDataController";
import { useWebMemoryMutationController } from "../../../shared/useWebMemoryMutationController";
import { useWebSendFlowController } from "../../../shared/useWebSendFlowController";
import { useWebTurnRunnerController } from "../../../shared/useWebTurnRunnerController";
import type {
  GuestInferenceIssue,
  ThreadStreamingRuntimeEvent,
  ThreadStreamingState,
} from "../../../shared/webTurnRunnerCore";
import { useWebWorkspaceActionsController } from "../../../shared/useWebWorkspaceActionsController";
import { useWebWorkspaceUiActionsController } from "../../../shared/useWebWorkspaceUiActionsController";
import { useWebSettingsImageUploadController } from "../../../shared/useWebSettingsImageUploadController";
import { useWebThreadDataController } from "../../../shared/useWebThreadDataController";
import { useCommunityAdminController } from "../../../shared/useCommunityAdminController";
import { useCommunityDirectoryController } from "../../../shared/useCommunityDirectoryController";
import { useCommunityDirectoryLifecycle } from "../../../shared/useCommunityDirectoryLifecycle";
import type { CloudCommunityEvent } from "../../../shared/cloudCommunityEventsGateway";
import { useCommunityAgentConfigController } from "../../../shared/useCommunityAgentDraftController";
import { useCommunityFunnelController } from "../../../shared/useCommunityFunnelController";
import { useCommunitySettingsGovernanceController } from "../../../shared/useCommunitySettingsGovernanceController";
import { useCommunitySettingsDataController } from "../../../shared/useCommunitySettingsDataController";
import { useCommunitySettingsFormController } from "../../../shared/useCommunitySettingsFormController";
import { useCommunityMembersReviewController } from "../../../shared/useCommunityMembersReviewController";
import { useCommunityAdminAnalyticsLifecycle } from "../../../shared/useCommunityAdminAnalyticsLifecycle";
import { useCommunityMembersReviewLifecycle } from "../../../shared/useCommunityMembersReviewLifecycle";
import { createThreadContextController } from "../../../shared/threadContextController";
import { syncThreadCommunityLensCloud } from "../../../shared/threadContextCloudSync";
import {
  extractCommunityEvidenceUsedV1,
  type CommunityEvidenceUsedV1,
} from "../../../shared/communityEvidence";
import {
  buildReplyPrefix,
  extractTextFromContentJson,
  parseMessageAttachments,
  parseReplyPrefix,
  truncateReplyPreview,
  type CommunityMessageAttachment,
} from "../../../shared/communityMessageParsing";
import { isValidCommunitySlug, slugifyCommunityName } from "../../../shared/communitySlug";
import {
  formatCommunityVisibilityLabel,
  toCanonicalCommunityVisibility,
} from "../../../shared/communityVisibility";
import {
  buildMessageContextModalPayload,
  hasContextPayload,
  openMessageContextModal,
  type MessageContextModalPayload,
} from "../../../shared/messageContextUi";
import {
  extractInferenceSourceFromMessageContent,
  extractModelIdFromMessageContent,
  extractRuntimeEngineIdFromMessageContent,
  formatModelAttributionLabel,
} from "../../../shared/modelAttributionUi";
import {
  loadAccountCommerceStatusCanonical,
  setDevAccountTierCanonical,
  type AccountCommerceStatus,
} from "../../../shared/accountCommerceStatusGateway";
import {
  acceptBuilderPartnerTermsCanonical,
  captureBuilderPartnerAttributionFromCurrentUrl,
  loadBuilderPartnerProgramCanonical,
  type BuilderPartnerProgramSnapshot,
} from "../../../shared/builderPartnerProgramGateway";
import {
  startCloudPremiumSubscriptionCheckout,
} from "../../../shared/cloudAccountCommerceGateway";
import { loadOptionalOperatorAccessCanonical } from "../../../shared/cloudOperatorDashboardGateway";
import type { OperatorAccessSnapshot } from "../../../shared/operatorTypes";
import {
  loadWorkspaceCreditBalanceCanonical,
  type WorkspaceCreditBalance,
} from "../../../shared/workspaceCreditsGateway";
import { formatUsdCents, toEpochSeconds } from "../../../shared/displayFormatting";
import type { PaidToolKind } from "../../../shared/workspaceCredits";
import {
  type PaidUsageBillingMode,
} from "../../../shared/paidUsageBilling";
import {
  deriveCommunityFunnelAction,
  deriveCommunityMembersJoinReviewMode,
  type CommunityFunnelAction,
  type CommunityMembersJoinReviewMode,
} from "./communityJoinPolicy";
import { useWebAccountCommerceActions } from "./controllers/useWebAccountCommerceActions";
import { useWebAccountCommerceStatusActions } from "./controllers/useWebAccountCommerceStatusActions";
import { useWebPublicFunnelActions } from "./controllers/useWebPublicFunnelActions";
import { useWebPublicCheckoutStart } from "./controllers/useWebPublicCheckoutStart";
import { useWebDiscoverPreloadLifecycle } from "./controllers/useWebDiscoverPreloadLifecycle";
import { useWebBillingUiController } from "./controllers/useWebBillingUiController";
import { useWebGuestThreadLifecycle } from "./controllers/useWebGuestThreadLifecycle";
import { useWebMobileShellController } from "./controllers/useWebMobileShellController";
import { useWebCommunityPolynetController } from "./controllers/useWebCommunityPolynetController";
import { useWebPostAuthBillingLifecycle } from "./controllers/useWebPostAuthBillingLifecycle";
import { useWebPostAuthStripeConnectLifecycle } from "./controllers/useWebPostAuthStripeConnectLifecycle";
import { useWebPathRouteLifecycle } from "./controllers/useWebPathRouteLifecycle";
import { useWebCommunityRouteController } from "./controllers/useWebCommunityRouteController";
import { useWebActiveCommunityShellController } from "./controllers/useWebActiveCommunityShellController";
import { useWebJoinedCommunityRouteResolution } from "./controllers/useWebJoinedCommunityRouteResolution";
import { useWebSelectedCommunityController } from "./controllers/useWebSelectedCommunityController";
import { useWebPublicCommunityRouteController } from "./controllers/useWebPublicCommunityRouteController";
import { useWebRuntimeRunLifecycle } from "./controllers/useWebRuntimeRunLifecycle";
import { useWebUiPersistenceLifecycle } from "./controllers/useWebUiPersistenceLifecycle";
import { buildWebShellProjection } from "./controllers/buildWebShellProjection";
import { buildWebCommunitySurfaceProjection } from "./controllers/buildWebCommunitySurfaceProjection";
import { useWebVoiceInputController } from "../../../shared/useWebVoiceInputController";
import { useCommunityAgentLandingLifecycle } from "../../../shared/useCommunityAgentLandingLifecycle";
import { useCommunityAgentConfigLifecycle } from "../../../shared/useCommunityAgentConfigLifecycle";
import { useCommunityResourcesTabLifecycle } from "../../../shared/useCommunityResourcesTabLifecycle";
import {
  COMMUNITY_RESOURCES_MUTATED_EVENT,
  readCommunityResourcesMutatedEventDetail,
} from "../../../shared/communityResourceMutationEvents";
import { useCommunityEventsTabLifecycle } from "../../../shared/useCommunityEventsTabLifecycle";
import {
  useCommunityEventsController,
  type CommunityEventsRange,
} from "../../../shared/useCommunityEventsController";
import { useCommunitySettingsAccessLifecycle } from "../../../shared/useCommunitySettingsAccessLifecycle";
import { confirmDiscardUnsavedCommunitySettingsWeb } from "../../../shared/communityUnsavedGuard";
import { uploadCloudThreadAttachmentFile } from "../../../shared/cloudThreadsGateway";
import {
  DEFAULT_ACTIVE_RUNTIME_ENGINE,
  RUNTIME_ENGINE_CODEX,
  RUNTIME_ENGINE_POLYNET,
  canUseRuntimeEngineForTier,
  normalizeActiveWorkspaceRuntimeEngine,
  type RuntimeEngine,
} from "../../../shared/runtimeEngine";
import type { WebSettingsPanelsProps } from "./components/WebSettingsPanels";
import {
  WebGlobalOverlayHost,
  type WebGlobalOverlayHostProps,
} from "./components/WebGlobalOverlayHost";
import {
  WebCommunityLaunchSetupModal,
  type CommunityLaunchKnowledgeImportedSource,
  type CommunityLaunchProfileSaveDraft,
} from "./components/WebCommunityLaunchSetupModal";
import { WebShellChromeHost } from "./components/WebShellChromeHost";
import {
  WebDirectMessagesHost,
  type DirectMessageOpenConversationRequest,
  type DirectMessageOpenRequest,
} from "./components/WebDirectMessagesHost";
import { useDirectMessageWebNotifications } from "./controllers/useDirectMessageWebNotifications";
import { mergeUserProfileEntry } from "../../../shared/userProfileMerge";
import type { MobileOverlay, MobileRootPage } from "./components/webShellChromeShared";
import { buildWebStandalonePublicRouteViewProps } from "./controllers/buildWebStandalonePublicRouteViewProps";
import { buildWebGlobalOverlayHostProps } from "./controllers/buildWebGlobalOverlayHostProps";
import { buildWebAppMainSurfaceHostProps } from "./controllers/buildWebAppMainSurfaceHostProps";
import { buildWebShellChromeHostProps } from "./controllers/buildWebShellChromeHostProps";
import type { MemberAgentSurfaceContextV1 } from "../../../shared/memberAgentSurfaceContext";
import { WebCommunityOnboardingController } from "./components/WebCommunityOnboardingController";
import type { WebMemberAgentDockHandle } from "./components/WebMemberAgentDock";

const WebAppMainSurfaceHost = lazy(() =>
  import("./components/WebAppMainSurfaceHost").then((module) => ({
    default: module.WebAppMainSurfaceHost,
  })),
);

const WebMemberAgentDock = lazy(() =>
  import("./components/WebMemberAgentDock").then((module) => ({
    default: module.WebMemberAgentDock,
  })),
);

const WebStandalonePublicRouteShell = lazy(() =>
  import("./components/WebStandalonePublicRouteShell").then((module) => ({
    default: module.WebStandalonePublicRouteShell,
  })),
);

type CommunityRecord = {
  id: string;
  slug: string;
  name: string;
  one_liner: string | null;
  about: string | null;
  avatar_url: string | null;
  avatar_storage_id?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  banner_url: string | null;
  banner_storage_id?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
  visibility: string;
  entry_policy?: "open" | "approval" | "paid_subscription" | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
};

function mapLaunchCommunityCreateError(error: unknown): string {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "Failed to create community.";
  if (message === "community_builder_required") {
    return "Your account cannot create a community yet.";
  }
  if (message.includes("account_setup_required") || message.includes("profile_setup_required")) {
    return "Finish account setup before creating a community.";
  }
  if (message.includes("community_publish_ready_required")) {
    return "Published communities need a name, one-liner, avatar, and banner.";
  }
  if (message === "community_owner_limit_reached") {
    return "You've reached your community limit.";
  }
  if (message === "community_slug_taken") {
    return "That community slug is already taken.";
  }
  return message;
}

function isTransportRefreshError(error: unknown): boolean {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : String(error ?? "");
  const normalized = message.trim().toLowerCase();
  return (
    normalized === "failed to fetch" ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("network error") ||
    normalized.includes("load failed") ||
    normalized.includes("fetch failed")
  );
}

const COMMUNITY_LAUNCH_SOURCE_CRAWL_MAX_PAGES = 75;
const COMMUNITY_LAUNCH_SOURCE_CRAWL_MAX_DEPTH = 3;
const COMMUNITY_LAUNCH_SOURCE_CRAWL_MAX_ROOTS = 5;
const COMMUNITY_LAUNCH_SOURCE_CRAWL_POLL_INTERVAL_MS = 1000;
const COMMUNITY_LAUNCH_SOURCE_CRAWL_MAX_POLLS = 45;

function waitForCommunityLaunchDelay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getCommunityLaunchSourceCrawlUrl(source: CommunityLaunchKnowledgeImportedSource): string | null {
  if (source.source_ingestion_kind !== "url") return null;
  if (source.source_external_provider) return null;
  if (source.source_ingestion_status === "ready") return null;
  const url = String(source.source_external_url ?? "").trim();
  if (!url) return null;
  return url;
}

async function waitForCommunityLaunchSourceCrawlJob(args: {
  session: AuthSession;
  communityId: string;
  crawlJobId: string;
}): Promise<CloudCommunitySourceCrawlJob> {
  let latestJob: CloudCommunitySourceCrawlJob | null = null;
  for (let attempt = 0; attempt < COMMUNITY_LAUNCH_SOURCE_CRAWL_MAX_POLLS; attempt += 1) {
    const result = await getCloudCommunitySourceCrawlJob({
      session: args.session,
      communityId: args.communityId,
      crawlJobId: args.crawlJobId,
    });
    latestJob = result?.job ?? latestJob;
    if (latestJob?.status === "ready" || latestJob?.status === "failed") return latestJob;
    await waitForCommunityLaunchDelay(COMMUNITY_LAUNCH_SOURCE_CRAWL_POLL_INTERVAL_MS);
  }
  if (latestJob) return latestJob;
  throw new Error("community_source_crawl_status_unavailable");
}

type PublicCommunityRecord = {
  slug: string;
  name: string;
  one_liner: string | null;
  about: string | null;
  avatar_url: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  banner_url: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
  visibility: string;
  entry_policy?: "open" | "approval" | "paid_subscription" | null;
  created_at: string;
  updated_at: string;
  funnel?: SharedCommunityFunnelConfig | null;
  member_count?: number | null;
  admin_count?: number | null;
  online_count?: number | null;
  online_faces?: Array<{
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    avatar_focus_x?: number | null;
    avatar_focus_y?: number | null;
    avatar_zoom?: number | null;
  }> | null;
};

type ThreadRecord = {
  id: string;
  title: string | null;
  model_id: string | null;
  runtime_engine: RuntimeEngine | null;
  project_id: string | null;
  community_id: string | null;
  context_version: number;
  agent_attention: boolean;
  last_seq: number;
  created_at: number; // epoch seconds
  updated_at: number; // epoch seconds
};

type ThreadMessage = {
  id: string;
  thread_id: string;
  seq: number;
  role: "user" | "assistant" | "system";
  content_json: unknown;
  created_at: string;
  engine_id: string | null;
  model_id: string | null;
  run_id: string | null;
};

type UserMemorySettings = {
  memory_mode: "off" | "suggest" | "auto";
  remember_intent_enabled: boolean;
  agent_name: string;
  agent_soul: string;
};

type MessageAttachment = CommunityMessageAttachment & {
  file?: File | null;
};

type CommunityInteractionRoot = CommunityInteractionRootBundle;
type CommunityInteractionReply = CommunityInteractionReplyBundle;
type CommunityInteractionRootChangeReason = "initial" | "newer" | "older" | "reset";

type CommunityVoiceTranscriptTarget = {
  appendTranscript: (transcript: string) => void;
  focusInput?: () => void;
};

type CommunityVoiceButtonOwner = "main" | "drawer";

type PendingCanonicalInteraction = {
  idempotencyKey: string;
  communityId: string;
  kind: "root" | "reply";
  rootId: string | null;
  targetReplyId: string | null;
  text: string;
  attachments: MessageAttachment[];
  serializedAttachments: unknown[];
  createdAt: string;
  senderId: string;
  status: CommunityInteractionPendingStatus;
};

// Mirrors the server's composerIdempotencyKey (convex/communityInteractions.ts): the client key
// is wrapped + truncated before storage, so optimistic reconciliation must match the wrapped form.
const MAX_INTERACTION_IDEMPOTENCY_KEY_CHARS = 160;
function composerStoredIdempotencyKey(rawKey: string, kind: "root" | "reply"): string {
  return `community_composer:${kind}:${rawKey}`.slice(0, MAX_INTERACTION_IDEMPOTENCY_KEY_CHARS);
}

function optimisticInteractionAttachment(attachment: MessageAttachment): CommunityInteractionAttachment {
  const storageId = String(attachment.storage_id ?? "").trim();
  const dataUrl =
    typeof attachment.data_url === "string" && attachment.data_url.trim()
      ? attachment.data_url.trim()
      : null;
  const url =
    typeof attachment.url === "string" && attachment.url.trim()
      ? attachment.url.trim()
      : null;
  return {
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    mime: attachment.mime ?? null,
    size: Math.max(0, Math.floor(Number(attachment.size) || 0)),
    ...(storageId ? { storage_id: storageId } : null),
    ...(url ? { url } : null),
    ...(dataUrl ? { data_url: dataUrl } : null),
  };
}

function buildOptimisticRootBundle(p: PendingCanonicalInteraction): CommunityInteractionRootBundle {
  return {
    deduped: false,
    pending: p.status,
    content_blocks: [],
    embeds: [],
    mentions: [],
    attachments: p.attachments.map(optimisticInteractionAttachment),
    root: {
      id: `pending:${p.idempotencyKey}`,
      community_id: p.communityId,
      actor_type: "human",
      actor_user_id: p.senderId,
      actor_agent_key: null,
      kind: "discussion",
      status: "active",
      visibility_scope: "community",
      title: null,
      content_summary: p.text,
      reply_count: 0,
      reaction_summary: [],
      viewer_emojis: [],
      idempotency_key: composerStoredIdempotencyKey(p.idempotencyKey, p.kind),
      last_reply_at: null,
      last_reply_actor_user_id: null,
      pinned_at: null,
      locked_at: null,
      created_at: p.createdAt,
      updated_at: p.createdAt,
      edited_at: null,
    },
  };
}

function buildOptimisticReplyBundle(p: PendingCanonicalInteraction): CommunityInteractionReplyBundle {
  return {
    deduped: false,
    pending: p.status,
    content_blocks: [],
    embeds: [],
    mentions: [],
    attachments: p.attachments.map(optimisticInteractionAttachment),
    reply: {
      id: `pending:${p.idempotencyKey}`,
      community_id: p.communityId,
      root_id: p.rootId ?? "",
      seq: Number.MAX_SAFE_INTEGER,
      actor_type: "human",
      actor_user_id: p.senderId,
      actor_agent_key: null,
      target_reply_id: p.targetReplyId,
      status: "active",
      visibility_scope: "community",
      content_summary: p.text,
      reaction_summary: [],
      viewer_emojis: [],
      idempotency_key: composerStoredIdempotencyKey(p.idempotencyKey, p.kind),
      created_at: p.createdAt,
      updated_at: p.createdAt,
      edited_at: null,
    },
  };
}

function appendPendingRoots(
  roots: CommunityInteractionRootBundle[],
  pending: PendingCanonicalInteraction[],
  communityId: string | null,
): CommunityInteractionRootBundle[] {
  if (!communityId) return roots;
  const scopedRoots = roots.filter((bundle) => bundle.root.community_id === communityId);
  const visibleStoredKeys = new Set(scopedRoots.map((bundle) => bundle.root.idempotency_key));
  const extra = pending
    .filter(
      (p) =>
        p.kind === "root" &&
        p.communityId === communityId &&
        !visibleStoredKeys.has(composerStoredIdempotencyKey(p.idempotencyKey, "root")),
    )
    .map(buildOptimisticRootBundle);
  return extra.length ? [...scopedRoots, ...extra] : scopedRoots;
}

function appendPendingReplies(
  replies: CommunityInteractionReplyBundle[],
  pending: PendingCanonicalInteraction[],
  rootId: string | null,
): CommunityInteractionReplyBundle[] {
  if (!rootId) return replies;
  const visibleStoredKeys = new Set(replies.map((bundle) => bundle.reply.idempotency_key));
  const extra = pending
    .filter(
      (p) =>
        p.kind === "reply" &&
        p.rootId === rootId &&
        !visibleStoredKeys.has(composerStoredIdempotencyKey(p.idempotencyKey, "reply")),
    )
    .map(buildOptimisticReplyBundle);
  return extra.length ? [...replies, ...extra] : replies;
}

function communityInteractionRootCreatedAtMs(bundle: CommunityInteractionRootBundle): number {
  const ms = Date.parse(bundle.root.created_at);
  return Number.isFinite(ms) ? ms : 0;
}

function mergeCommunityInteractionRootWindows(
  current: CommunityInteractionRootBundle[],
  incoming: CommunityInteractionRootBundle[],
): CommunityInteractionRootBundle[] {
  if (current.length === 0) {
    return [...incoming].sort(
      (left, right) => communityInteractionRootCreatedAtMs(right) - communityInteractionRootCreatedAtMs(left),
    );
  }
  if (incoming.length === 0) return current;
  const byId = new Map<string, CommunityInteractionRootBundle>();
  for (const bundle of current) byId.set(bundle.root.id, bundle);
  for (const bundle of incoming) byId.set(bundle.root.id, bundle);
  return Array.from(byId.values()).sort(
    (left, right) => communityInteractionRootCreatedAtMs(right) - communityInteractionRootCreatedAtMs(left),
  );
}
type ChatLightboxImage = SharedChatLightboxImage;
type CommunityAgentConfig = SharedCommunityAgentConfig<CommunityAgentLanding>;
type CommunityFunnelConfig = SharedCommunityFunnelConfig;
type WorkspaceComposerDraft = {
  text: string;
  attachments: unknown[];
};
type WorkspaceComposerApi = {
  focus: () => void;
  clear: () => void;
  reset: () => void;
  appendTranscript: (transcript: string) => void;
  pinToBottom: () => void;
};

const GUEST_THREAD_ID = "__guest__";
const WORKSPACE_DRAFT_THREAD_ERROR_KEY = "__workspace_draft__";
const WORKSPACE_PLATFORM_STARTER_PROMPT =
  "Tell me what Polynet is, what I can build here, and how I should get started.";
const GUEST_THREAD_STORAGE_KEY = "polynet_guest_thread_v1";
const LEGACY_GUEST_THREAD_STORAGE_KEY = "arx_guest_thread_v1";
const GUEST_THREAD_STORAGE_TTL_MS = 24 * 60 * 60 * 1000;
const GUEST_MODEL_STORAGE_KEY = "polynet_guest_model_id_v1";
const LEGACY_GUEST_MODEL_STORAGE_KEY = "arx_guest_model_id_v1";
const GUEST_MODEL_ALLOWLIST = SHARED_FREE_MODEL_ALLOWLIST;
const GUEST_MODEL_LABELS = SHARED_FREE_MODEL_LABELS;
const MODEL_TOGGLES_STORAGE_KEY = "polynet_model_toggles";
const ACTIVE_MODEL_STORAGE_KEY = "polynet_active_model_id";
const LEGACY_ACTIVE_MODEL_STORAGE_KEY = "arx_active_model_id";
const ACTIVE_RUNTIME_ENGINE_STORAGE_KEY = "polynet_active_runtime_engine";
const ACTIVE_RUNTIME_ENGINE_CODEX_DEFAULT_MIGRATION_KEY =
  "polynet_active_runtime_engine_codex_default_v1";
const ACTIVE_RUNTIME_ENGINE_POLYNET_DEFAULT_RESTORE_KEY =
  "polynet_active_runtime_engine_polynet_default_restore_v1";
const APP_THEME_STORAGE_KEY = "polynet-theme";
const LEGACY_APP_THEME_STORAGE_KEY = "arx-theme";
const COMMUNITY_ANALYTICS_RANGE_STORAGE_KEY = "polynet-community-analytics-range";
const LEGACY_COMMUNITY_ANALYTICS_RANGE_STORAGE_KEY = "arx-community-analytics-range";
const COMMUNITY_RAIL_ORDER_STORAGE_KEY_PREFIX = "polynet-community-rail-order:web";
const CHATGPT_SECURITY_SETTINGS_URL = "https://chatgpt.com/#settings/Security";

type GuestStoredMessageV1 = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  run_id?: string | null;
};

type GuestThreadStorageV1 = {
  v: 1;
  model_id: string;
  messages: GuestStoredMessageV1[];
  stored_at?: number;
  expires_at?: number;
};

function readFirstLocalStorageValue(keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = localStorage.getItem(key);
    if (value !== null) return value;
  }
  return null;
}

function loadGuestModelId(): string {
  try {
    const raw = (
      readFirstLocalStorageValue([GUEST_MODEL_STORAGE_KEY, LEGACY_GUEST_MODEL_STORAGE_KEY]) ?? ""
    ).trim();
    return raw && isFreeModelId(raw, GUEST_MODEL_ALLOWLIST) ? raw : DEFAULT_GUEST_MODEL_ID;
  } catch {
    return DEFAULT_GUEST_MODEL_ID;
  }
}

function storeGuestModelId(modelId: string): void {
  try {
    localStorage.setItem(GUEST_MODEL_STORAGE_KEY, modelId);
  } catch {
    // ignore
  }
}

function buildPremiumSubscriptionReturnUrl(): string {
  return `${window.location.origin}/settings/billing`;
}

function buildEmptyWorkspaceCreditBalance(session: AuthSession): WorkspaceCreditBalance {
  const nowMs = Date.now();
  return {
    userId: String(getAuthUid(session) ?? session.user?.id ?? "").trim(),
    includedCreditsBalance: 0,
    purchasedCreditsBalance: 0,
    uncollectedCreditsBalance: 0,
    pendingCardCollectionCreditsBalance: 0,
    outstandingUsageCreditsBalance: 0,
    includedCycleCredits: 0,
    includedCycleStartedAt: nowMs,
    includedCycleEndsAt: nowMs,
    createdAt: nowMs,
    updatedAt: nowMs,
    spendableCreditsBalance: 0,
    displayBalanceUsd: "$0",
    blocked: false,
    blockedReason: null,
    lowBalance: true,
  };
}

function clearGuestThreadStorage(): void {
  try {
    localStorage.removeItem(GUEST_THREAD_STORAGE_KEY);
    localStorage.removeItem(LEGACY_GUEST_THREAD_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function emptyGuestThreadStorage(modelId = loadGuestModelId()): GuestThreadStorageV1 {
  const nowMs = Date.now();
  return {
    v: 1,
    model_id: modelId,
    messages: [],
    stored_at: nowMs,
    expires_at: nowMs + GUEST_THREAD_STORAGE_TTL_MS,
  };
}

function isExpiredGuestThreadStorage(record: Record<string, unknown>, nowMs: number): boolean {
  const expiresAt = Number(record.expires_at ?? 0);
  return Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt <= nowMs;
}

function loadGuestThreadStorage(): GuestThreadStorageV1 {
  try {
    const raw = readFirstLocalStorageValue([GUEST_THREAD_STORAGE_KEY, LEGACY_GUEST_THREAD_STORAGE_KEY]);
    if (!raw) return emptyGuestThreadStorage();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return emptyGuestThreadStorage();
    const asAny = parsed as any;
    const nowMs = Date.now();
    if (isExpiredGuestThreadStorage(asAny, nowMs)) {
      clearGuestThreadStorage();
      return emptyGuestThreadStorage();
    }
    const model_id_raw = typeof asAny.model_id === "string" ? asAny.model_id.trim() : "";
    const model_id = model_id_raw && isFreeModelId(model_id_raw, GUEST_MODEL_ALLOWLIST) ? model_id_raw : loadGuestModelId();
    const messages_raw = Array.isArray(asAny.messages) ? (asAny.messages as unknown[]) : [];
    const messages: GuestStoredMessageV1[] = [];
    for (const item of messages_raw) {
      if (!item || typeof item !== "object") continue;
      const id = typeof (item as any).id === "string" ? (item as any).id.trim() : "";
      const role = typeof (item as any).role === "string" ? (item as any).role.trim() : "";
      const content = typeof (item as any).content === "string" ? (item as any).content : "";
      const created_at = typeof (item as any).created_at === "string" ? (item as any).created_at : "";
      const run_id = typeof (item as any).run_id === "string" ? (item as any).run_id : null;
      if (!id || !created_at) continue;
      if (role !== "user" && role !== "assistant") continue;
      const trimmed = content.trim();
      if (!trimmed) continue;
      messages.push({ id, role: role as any, content: trimmed, created_at, run_id });
    }
    const storedAt = Number(asAny.stored_at ?? nowMs);
    const expiresAt = Number(asAny.expires_at ?? 0);
    const storage: GuestThreadStorageV1 = {
      v: 1,
      model_id,
      messages,
      stored_at: Number.isFinite(storedAt) && storedAt > 0 ? storedAt : nowMs,
      expires_at:
        Number.isFinite(expiresAt) && expiresAt > nowMs
          ? expiresAt
          : nowMs + GUEST_THREAD_STORAGE_TTL_MS,
    };
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
      storeGuestThreadStorage(storage);
    }
    return storage;
  } catch {
    return emptyGuestThreadStorage();
  }
}

function storeGuestThreadStorage(storage: GuestThreadStorageV1): void {
  try {
    const nowMs = Date.now();
    localStorage.setItem(
      GUEST_THREAD_STORAGE_KEY,
      JSON.stringify({
        ...storage,
        stored_at: Number.isFinite(storage.stored_at) && Number(storage.stored_at) > 0 ? storage.stored_at : nowMs,
        expires_at: nowMs + GUEST_THREAD_STORAGE_TTL_MS,
      }),
    );
  } catch {
    // ignore
  }
}

function guestStoredToThreadMessages(storage: GuestThreadStorageV1): ThreadMessage[] {
  const out: ThreadMessage[] = [];
  for (let i = 0; i < storage.messages.length; i++) {
    const msg = storage.messages[i]!;
    out.push({
      id: msg.id,
      thread_id: GUEST_THREAD_ID,
      seq: i + 1,
      role: msg.role,
      content_json: { text: msg.content },
      created_at: msg.created_at,
      engine_id: msg.role === "assistant" ? "public_openrouter" : null,
      model_id: msg.role === "assistant" ? storage.model_id : null,
      run_id: msg.run_id ?? null,
    });
  }
  return out;
}

type CommunityResource = {
  id: string;
  community_id?: string | null;
  module_id: string | null;
  directory_uri: string;
  directory_path: string;
  type: "post" | "link" | "embed" | "file";
  resource_role: "page" | "source";
  resource_status: "draft" | "review" | "published" | "processing" | "failed";
  source_resource_id?: string | null;
  title: string;
  body_md: string | null;
  body_chars?: number | null;
  url: string | null;
  file_key?: string | null;
  source_ingestion_status?: "not_required" | "queued" | "processing" | "ready" | "failed";
  source_ingestion_kind?: "manual" | "url" | "file" | "google_drive" | "github";
  source_ingestion_error?: string | null;
  source_ingestion_attempted_at?: string | null;
  source_ingested_at?: string | null;
  source_original_filename?: string | null;
  source_original_mime_type?: string | null;
  source_original_bytes?: number | null;
  source_external_provider?: "google_drive" | "github" | null;
  source_external_id?: string | null;
  source_external_name?: string | null;
  source_external_url?: string | null;
  source_external_mime_type?: string | null;
  source_external_modified_at?: string | null;
  pinned: boolean;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
};

type CommunityResourceModule = {
  id: string;
  community_id?: string | null;
  directory_uri: string;
  directory_path: string;
  module_status: "draft" | "live";
  name: string;
  description_md: string | null;
  banner_url: string | null;
  banner_focus_x: number | null;
  banner_focus_y: number | null;
  banner_zoom: number | null;
  sort_order: number;
};

type CommunityEvent = CloudCommunityEvent;

type CommunityAccess = SharedCommunityAccess;
type CommunityAnalyticsSummary = SharedCommunityAnalyticsSummary;
type CommunityAnalyticsSeries = SharedCommunityAnalyticsSeries;
type AnalyticsRange = SharedAnalyticsRange;
type UserProfile = SharedUserProfile;
type UserProfileDetail = SharedUserProfileDetail;
type CommunityJoinRequest = {
  id: string;
  community_id: string;
  user_id: string;
  status: string;
  created_at: string;
  updated_at: string;
};

function normalizeCommunityEventsMonthIso(raw: string | null | undefined): string {
  const date = raw ? new Date(raw) : new Date();
  const normalized = Number.isFinite(date.getTime()) ? date : new Date();
  return new Date(normalized.getFullYear(), normalized.getMonth(), 1).toISOString();
}

function getCommunityEventsMonthRange(monthIso: string): CommunityEventsRange {
  const monthStart = new Date(normalizeCommunityEventsMonthIso(monthIso));
  const start = new Date(monthStart);
  start.setDate(monthStart.getDate() - monthStart.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 42);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function buildCommunityEventsCacheKey(communityId: string, range: CommunityEventsRange): string {
  return `${communityId}:${range.startIso}:${range.endIso}`;
}

type PersonalMemoryItem = {
  id: string;
  content: string;
  scope: "global" | "workspace";
  scope_id: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

type PublicPlanSummary = SharedPublicPlanSummary;
type DiscoverCommunity = SharedDiscoverCommunitySnapshot;
type CommunityAiFeedPost = SharedCommunityAiFeedPost;

type NavSnapshot = NavSnapshotBase & {
  routePath: string;
};

type AccountGraphHydrationPhase = "idle" | "critical" | "secondary" | "ready";

const COMMUNITY_INTERACTION_ROOT_LIMIT = 50;
const COMMUNITY_INTERACTION_REPLY_LIMIT = 80;
const INTERACTION_SELECTED_ROOT_STORAGE_PREFIX = "polynet:interaction:selectedRoot:";

function readStoredInteractionSelectedRoot(communityId: string | null): string | null {
  if (!communityId) return null;
  try {
    const value = window.localStorage.getItem(`${INTERACTION_SELECTED_ROOT_STORAGE_PREFIX}${communityId}`);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

function writeStoredInteractionSelectedRoot(communityId: string | null, rootId: string | null): void {
  if (!communityId) return;
  try {
    const key = `${INTERACTION_SELECTED_ROOT_STORAGE_PREFIX}${communityId}`;
    if (rootId) window.localStorage.setItem(key, rootId);
    else window.localStorage.removeItem(key);
  } catch {
    // localStorage unavailable; non-fatal.
  }
}
const DEFAULT_MODEL_TOGGLES: ModelToggle[] = getDefaultModelToggles("web");

const MAX_WEB_ATTACHMENTS_PER_MESSAGE = 8;
const MAX_WEB_IMAGE_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB (client-side; still compressed before sending)
const MAX_WEB_MEDIA_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB (video/audio; streamed from storage, not inlined)
const MAX_WEB_FILE_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_WEB_TEXT_ATTACHMENT_BYTES = 200 * 1024; // 200KB
const MAX_WEB_IMAGE_DATA_URL_CHARS = 600_000; // ~0.6MB base64 payload

function formatCommunityInteractionProjectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.trim().toLowerCase();
  if (normalized.includes("community_entitlement_required")) {
    return "Join this community to view threads.";
  }
  if (normalized.includes("verified_identity_required") || normalized.includes("convex_auth")) {
    return "Sign in to view community threads.";
  }
  if (normalized.includes("profile_setup_required")) {
    return "Finish your profile to view community threads.";
  }
  return message.trim() || "Failed to load community threads.";
}

function buildCurrentTelemetryPathname(): string | null {
  if (typeof window === "undefined") return null;
  return buildTelemetryRouteLabel({
    pathname: window.location.pathname,
    search: window.location.search,
  });
}

function scrubCurrentRouteSearchParams(paramNames: readonly string[]): void {
  if (typeof window === "undefined") return;
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const nextPath = buildPathWithSearchParamsRemoved({
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
    paramNames,
    dropHash: true,
  });
  if (nextPath === currentPath) return;
  window.history.replaceState(window.history.state ?? {}, document.title, nextPath);
}

const APP_OAUTH_RETURN_PARAM_NAMES = [
  "app_oauth",
  "app_oauth_state",
  "app_oauth_finalize_token",
  "app_oauth_message",
  "catalog_app_id",
] as const;
const APP_OAUTH_FINALIZE_SESSION_GUARD_PREFIX = "app_oauth_finalize:";
const APP_OAUTH_FINALIZE_SESSION_GUARD_TTL_MS = 2 * 60_000;

function buildAppOAuthFinalizeSessionGuardKey(
  state: string,
  finalizeToken: string,
): string {
  return `${APP_OAUTH_FINALIZE_SESSION_GUARD_PREFIX}${state}:${finalizeToken}`;
}

function claimAppOAuthFinalizeSessionGuard(key: string): boolean {
  try {
    const existing = Number(window.sessionStorage.getItem(key) ?? "");
    const now = Date.now();
    if (
      Number.isFinite(existing) &&
      existing > now - APP_OAUTH_FINALIZE_SESSION_GUARD_TTL_MS
    ) {
      return false;
    }
    window.sessionStorage.setItem(key, String(now));
    return true;
  } catch {
    return true;
  }
}


function clearAppOAuthFinalizeSessionGuard(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage failures; the backend finalizer is still idempotent.
  }
}

function formatModelSignature(
  modelId: string | null | undefined,
  inferenceSource: string | null | undefined,
  engineId: string | null | undefined,
  modelToggles: ModelToggle[],
): string | null {
  return formatModelAttributionLabel({
    modelId,
    inferenceSource,
    engineId,
    modelToggles,
    freeModelAllowlist: GUEST_MODEL_ALLOWLIST,
    freeModelLabels: GUEST_MODEL_LABELS,
  });
}

export default function App() {
  const initialShellVariant: AppShellVariant =
    typeof window === "undefined"
      ? "standard"
      : readOAuthCallbackShellVariantFromLocation() ??
        readShellVariantFromPathname(window.location.pathname || "/");
  const initialPublicRoute = readPublicRouteFromLocation();
  const initialAppRoute = initialPublicRoute.kind === "app" ? readAppRouteFromLocation() : null;
  const lastIdentifiedBusinessVisitorSubjectRef = useRef<string | null>(null);
  const [accountGraphHydrationPhase, setAccountGraphHydrationPhase] =
    useState<AccountGraphHydrationPhase>("idle");
  const [isDirectMessagesOpen, setIsDirectMessagesOpen] = useState(false);
  const [directMessageOpenRequest, setDirectMessageOpenRequest] =
    useState<DirectMessageOpenRequest>(null);
  const [directMessageOpenConversationRequest, setDirectMessageOpenConversationRequest] =
    useState<DirectMessageOpenConversationRequest>(null);
  const [directMessagesUnreadCount, setDirectMessagesUnreadCount] = useState(0);
  const accountGraphHydrationRunIdRef = useRef(0);
  const directMessageOpenRequestIdRef = useRef(0);
  const handleOpenDirectConversationById = useCallback((conversationId: string) => {
    const normalizedConversationId = String(conversationId ?? "").trim();
    if (!normalizedConversationId) return;
    directMessageOpenRequestIdRef.current += 1;
    setDirectMessageOpenRequest(null);
    setDirectMessageOpenConversationRequest({
      requestId: directMessageOpenRequestIdRef.current,
      conversationId: normalizedConversationId,
    });
    setIsDirectMessagesOpen(true);
  }, []);
  const handleToggleDirectMessages = useCallback(() => {
    setDirectMessageOpenRequest(null);
    setIsDirectMessagesOpen((current) => !current);
  }, []);
  const handleOpenDirectMessages = useCallback(() => {
    setDirectMessageOpenRequest(null);
    setIsDirectMessagesOpen(true);
  }, []);
  const handleCloseDirectMessages = useCallback(() => {
    setDirectMessageOpenRequest(null);
    setIsDirectMessagesOpen(false);
  }, []);
  const handleOpenDirectMessageFromCommunity = useCallback((targetUserId: string, communityId: string) => {
    const normalizedTargetUserId = String(targetUserId ?? "").trim();
    const normalizedCommunityId = String(communityId ?? "").trim();
    if (!normalizedTargetUserId || !normalizedCommunityId) return;
    directMessageOpenRequestIdRef.current += 1;
    setDirectMessageOpenRequest({
      requestId: directMessageOpenRequestIdRef.current,
      targetUserId: normalizedTargetUserId,
      communityId: normalizedCommunityId,
    });
    setIsDirectMessagesOpen(true);
  }, []);

  async function runCommunitiesHydration(session: AuthSession, phase: string): Promise<void> {
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "communities_load",
      status: "start",
      detail: { phase },
    });
    try {
      await loadCommunities(session);
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "communities_load",
        status: "success",
        detail: { phase },
      });
    } catch (error) {
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "communities_load",
        status: "failure",
        detail: { phase },
        error: formatWorkspaceInstrumentationError(error),
      });
      throw error;
    }
  }

  async function runBillingHydration(session: AuthSession, phase: string): Promise<void> {
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "billing_status_load",
      status: "start",
      detail: { phase },
    });
    try {
      await loadAccountCommerceStatus(session);
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "billing_status_load",
        status: "success",
        detail: { phase },
      });
    } catch (error) {
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "billing_status_load",
        status: "failure",
        detail: { phase },
        error: formatWorkspaceInstrumentationError(error),
      });
      throw error;
    }
  }

  async function runSelfProfileHydration(session: AuthSession, phase: string): Promise<void> {
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "self_profile_load",
      status: "start",
      detail: { phase },
    });
    try {
      await loadSelfProfile(session);
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "self_profile_load",
        status: "success",
        detail: { phase },
      });
    } catch (error) {
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "self_profile_load",
        status: "failure",
        detail: { phase },
        error: formatWorkspaceInstrumentationError(error),
      });
      throw error;
    }
  }

  function resetAgentThreadStateAfterSignOut(): void {
    workspaceComposerDraftRef.current = { text: "", attachments: [] };
    workspaceComposerApiRef.current?.clear();
    threadsHydratedRef.current = false;
    setThreads([]);
    setThreadError(null);
    setThreadErrorById({});
    setWorkspaceWantsNewChatMode(false);
    setActiveThreadId(null);
    setThreadMessages([]);
    setIsSendingMessage(false);
    setThreadSendingStateById({});
    setThreadStreamingStateById({});
    setRuntimeEventsByRunId({});
    setLoadingThreadMessagesThreadId(null);
  }

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
    onSessionLost: async () => {
      accountGraphHydrationRunIdRef.current += 1;
      setAccountGraphHydrationPhase("idle");
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "auth_full_signed_out_reset",
        status: "start",
        detail: {
          reason: "session_lost",
        },
      });
      await resetWebSessionStateAfterSignOut({
        resetAgentThreadState: resetAgentThreadStateAfterSignOut,
        beginBrowserSignedOutState,
        setCommunities,
        setIsLoadingCommunities,
        setCommunityRoleById,
        setActiveCommunityId,
        setCommunityTab,
        setCommunityMessageInput,
        setCommunityChatError,
        setIsSendingCommunityMessage,
        setCommunityResources,
        setIsLoadingResources,
        setShowResourceModal,
        setEditingResourceId,
        setResourceTitleInput,
        setResourceUrlInput,
        setResourceBodyInput,
        setResourcePinnedInput,
        setResourceError,
        setIsSavingResource,
        setOpenResourceEmbedId,
        setCommunityEvents: resetCommunityEventsCache,
        setIsLoadingCommunityEvents,
        setCommunityEventsError,
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
      setCloudProfile(null);
      setAccountSetupStatus(null);
      setIsLoadingAccountSetupStatus(false);
      setHasLoadedOnboardingProfile(false);
      setIsOnboardingModalOpen(false);
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "auth_full_signed_out_reset",
        status: "success",
        detail: {
          reason: "session_lost",
        },
      });
    },
    onSessionMissingAfterBootstrap: async () => {
      accountGraphHydrationRunIdRef.current += 1;
      setAccountGraphHydrationPhase("idle");
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "auth_full_signed_out_reset",
        status: "start",
        detail: {
          reason: "session_missing_after_bootstrap",
        },
      });
      await resetWebSessionStateAfterSignOut({
        resetAgentThreadState: resetAgentThreadStateAfterSignOut,
        beginBrowserSignedOutState,
        setCommunities,
        setIsLoadingCommunities,
        setCommunityRoleById,
        setActiveCommunityId,
        setCommunityTab,
        setCommunityMessageInput,
        setCommunityChatError,
        setIsSendingCommunityMessage,
        setCommunityResources,
        setIsLoadingResources,
        setShowResourceModal,
        setEditingResourceId,
        setResourceTitleInput,
        setResourceUrlInput,
        setResourceBodyInput,
        setResourcePinnedInput,
        setResourceError,
        setIsSavingResource,
        setOpenResourceEmbedId,
        setCommunityEvents: resetCommunityEventsCache,
        setIsLoadingCommunityEvents,
        setCommunityEventsError,
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
      applyCommunityShellState({
        communityId: null,
        communitySlug: null,
        communityTab: "chat",
      });
      personalMemoryUi.setPersonalMemoryItems([]);
      setCloudProfile(null);
      setAccountSetupStatus(null);
      setIsLoadingAccountSetupStatus(false);
      setHasLoadedOnboardingProfile(false);
      setIsOnboardingModalOpen(false);
      setWorkspaceCreditBalance(null);
      setWorkspaceCreditBalanceError(null);
      profileUi.setProfileSaveError(null);
      profileUi.setProfileSaveSuccess(false);
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "auth_full_signed_out_reset",
        status: "success",
        detail: {
          reason: "session_missing_after_bootstrap",
        },
      });
    },
    onSessionReady: async (session) => {
      const hydrationRunId = ++accountGraphHydrationRunIdRef.current;
      const userId = String(session.user?.id ?? "").trim() || null;
      const shouldTreatCommunitiesAsCritical =
        activePage === "community" || Boolean(String(selectedActiveCommunitySlug ?? "").trim());
      const criticalStartedAt = Date.now();
      setAccountGraphHydrationPhase("critical");
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "account_graph_hydrate",
        status: "start",
        detail: {
          phase: "session_ready",
          userId,
        },
      });
      const criticalTasks: Array<Promise<void>> = [];
      if (shouldTreatCommunitiesAsCritical) {
        criticalTasks.push(runCommunitiesHydration(session, "session_ready_critical"));
      }
      const criticalResults = await Promise.allSettled(criticalTasks);
      const criticalFailureCount = criticalResults.filter((result) => result.status === "rejected").length;
      if (accountGraphHydrationRunIdRef.current === hydrationRunId) {
        setAccountGraphHydrationPhase("secondary");
      }
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "account_graph_hydrate",
        status: criticalFailureCount > 0 ? "failure" : "success",
        detail: {
          phase: "session_ready",
          stage: "critical_ready",
          userId,
          failureCount: criticalFailureCount,
          durationMs: Date.now() - criticalStartedAt,
        },
        error:
          criticalFailureCount > 0
            ? formatWorkspaceInstrumentationError(
                criticalResults
                  .filter((result): result is PromiseRejectedResult => result.status === "rejected")
                  .map((result) => result.reason)[0],
              )
            : undefined,
      });
      const secondaryTasks: Array<Promise<void>> = [
        runBillingHydration(session, "session_ready_secondary"),
        runSelfProfileHydration(session, "session_ready_secondary"),
      ];
      if (!shouldTreatCommunitiesAsCritical) {
        secondaryTasks.unshift(runCommunitiesHydration(session, "session_ready_secondary"));
      }
      const secondaryStartedAt = Date.now();
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "account_graph_secondary_hydrate",
        status: "start",
        detail: {
          phase: "session_ready",
          userId,
        },
      });
      void Promise.allSettled(secondaryTasks).then((results) => {
        const failureCount = results.filter((result) => result.status === "rejected").length;
        if (accountGraphHydrationRunIdRef.current === hydrationRunId) {
          setAccountGraphHydrationPhase("ready");
        }
        emitWorkspaceEvent({
          scope: "lifecycle",
          name: "account_graph_secondary_hydrate",
          status: failureCount > 0 ? "failure" : "success",
            detail: {
              phase: "session_ready",
              userId,
              failureCount,
              durationMs: Date.now() - secondaryStartedAt,
            },
          error:
            failureCount > 0
              ? formatWorkspaceInstrumentationError(
                  results
                    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
                    .map((result) => result.reason)[0],
                )
              : undefined,
        });
      });
    },
    onSessionFocusReady: async (session) => {
      const userId = String(session.user?.id ?? "").trim() || null;
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "account_graph_refresh",
        status: "start",
        detail: {
          phase: "session_focus_ready",
          userId,
        },
      });
      const focusSecondaryStartedAt = Date.now();
      void Promise.allSettled([
        runBillingHydration(session, "session_focus_ready_secondary"),
        runCommunitiesHydration(session, "session_focus_ready_secondary"),
      ]).then((results) => {
        const failureCount = results.filter((result) => result.status === "rejected").length;
        emitWorkspaceEvent({
          scope: "lifecycle",
          name: "account_graph_refresh",
          status: failureCount > 0 ? "failure" : "success",
            detail: {
              phase: "session_focus_ready",
              userId,
              failureCount,
              durationMs: Date.now() - focusSecondaryStartedAt,
            },
          error:
            failureCount > 0
              ? formatWorkspaceInstrumentationError(
                  results
                    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
                    .map((result) => result.reason)[0],
                )
              : undefined,
        });
      });
    },
    onDidJustSignIn: () => {
      resumePendingAuthIntent();
    },
    onBeforeSignOut: async () => {
      stopAllStreamingTurns();
    },
    onAfterSignOut: () => {
      if (window.location.pathname === "/") return;
      window.location.assign("/");
    },
  });
  const canonicalSessionUserId = useMemo(
    () => resolveAuthSubject(session),
    [session?.access_token, session?.id_token, session?.user?.id],
  );

  useEffect(() => {
    const subject = String(canonicalSessionUserId ?? "").trim();
    if (!session || !subject) {
      lastIdentifiedBusinessVisitorSubjectRef.current = null;
      return;
    }
    if (lastIdentifiedBusinessVisitorSubjectRef.current === subject) return;
    lastIdentifiedBusinessVisitorSubjectRef.current = subject;
    void identifyCloudBusinessVisitor({ session }).catch((error) => {
      if (lastIdentifiedBusinessVisitorSubjectRef.current === subject) {
        lastIdentifiedBusinessVisitorSubjectRef.current = null;
      }
      console.warn("Failed to identify business visitor:", error);
    });
  }, [canonicalSessionUserId, session]);

  const [operatorAccessState, setOperatorAccessState] = useState<{
    subject: string;
    access: OperatorAccessSnapshot | null;
  } | null>(null);
  const isOperatorAccessResolved =
    Boolean(canonicalSessionUserId) && operatorAccessState?.subject === canonicalSessionUserId;
  const operatorAccess = isOperatorAccessResolved ? operatorAccessState?.access ?? null : null;

  useEffect(() => {
    let isAlive = true;
    const operatorSubject = String(canonicalSessionUserId ?? "").trim();

    if (!session || !operatorSubject) {
      setOperatorAccessState(null);
      return;
    }

    loadOptionalOperatorAccessCanonical({ session }).then(
      (access) => {
        if (!isAlive) return;
        if (!access) {
          setOperatorAccessState({ subject: operatorSubject, access: null });
          return;
        }
        setOperatorAccessState({ subject: operatorSubject, access });
      },
      (error) => {
        if (!isAlive) return;
        const message = error instanceof Error ? error.message : String(error);
        if (
          message.includes("operator_access_forbidden") ||
          message.includes("operator_access_identity_mismatch")
        ) {
          setOperatorAccessState({ subject: operatorSubject, access: null });
          return;
        }
        console.warn("Failed to resolve operator access:", error);
        setOperatorAccessState({ subject: operatorSubject, access: null });
      },
    );

    return () => {
      isAlive = false;
    };
  }, [canonicalSessionUserId, session]);
  const hasOperatorAccess = Boolean(session && operatorAccess);
  const profileStorageUserId = canonicalSessionUserId;
  const initialProfileDraft = useMemo(
    () => readProfileDraftForUser(profileStorageUserId),
    [profileStorageUserId],
  );

  const [publicRoute, setPublicRoute] = useState<PublicRoute>(() => initialPublicRoute);
  const [shellVariant, setShellVariant] = useState<AppShellVariant>(() => initialShellVariant);
  const [mobileOverlay, setMobileOverlay] = useState<MobileOverlay>(null);
  const [mobileRootPage, setMobileRootPage] = useState<MobileRootPage>("community");
  const [communityOnboardingFirstPostFocusRequest, setCommunityOnboardingFirstPostFocusRequest] =
    useState(0);
  const [mobileSettingsView, setMobileSettingsView] = useState<"index" | "detail">("detail");
  const [mobileChromeReadingMode, setMobileChromeReadingMode] = useState(false);

  const [activePage, setActivePage] = useState<AppPage>(() => initialAppRoute?.page ?? "landing");
  const [activeView, setActiveView] = useState<AppView>(() => initialAppRoute?.view ?? "home");
  const [settingsPage, setSettingsPage] = useState<SettingsPage>(() => initialAppRoute?.settingsPage ?? "account");
  const [selectedProductDocSlug, setSelectedProductDocSlug] = useState<string | null>(
    () => initialAppRoute?.docsSlug ?? null,
  );
  const [activeOperatorTab, setActiveOperatorTab] = useState<OperatorTab>(
    () => initialAppRoute?.operatorTab ?? "platform",
  );
  const settingsGroup = settingsGroupForPage(settingsPage);
  const [appTheme, setAppTheme] = useState<AppTheme>(() => {
    try {
      const stored = parseAppTheme(
        readFirstLocalStorageValue([APP_THEME_STORAGE_KEY, LEGACY_APP_THEME_STORAGE_KEY]),
      );
      if (stored) return stored;
      return "polynet";
    } catch {
      return "polynet";
    }
  });
  useEffect(() => {
    applyAppThemeAttributes(appTheme, document.documentElement);
    try {
      localStorage.setItem(APP_THEME_STORAGE_KEY, appTheme);
      localStorage.removeItem(LEGACY_APP_THEME_STORAGE_KEY);
    } catch {
      // Theme persistence is a preference only; the active document theme is already applied.
    }
  }, [appTheme]);
  const [cloudProfile, setCloudProfile] = useState<UserProfileDetail | null>(null);
  const [accountSetupStatus, setAccountSetupStatus] = useState<AccountSetupStatus | null>(null);
  const [isLoadingAccountSetupStatus, setIsLoadingAccountSetupStatus] = useState(false);
  const [communityLaunchSetupStatus, setCommunityLaunchSetupStatus] =
    useState<CommunityLaunchSetupStatus | null>(null);
  const communityLaunchSetupStatusLoadedCommunityIdRef = useRef<string | null>(null);
  const [isLoadingCommunityLaunchSetupStatus, setIsLoadingCommunityLaunchSetupStatus] =
    useState(false);
  const [communityLaunchSetupError, setCommunityLaunchSetupError] =
    useState<string | null>(null);
  const [isCommunityLaunchSetupModalOpen, setIsCommunityLaunchSetupModalOpen] =
    useState(false);
  const [isCommunityLaunchCreateMode, setIsCommunityLaunchCreateMode] =
    useState(false);
  const [communityLaunchSetupInitialStep, setCommunityLaunchSetupInitialStep] =
    useState<CommunityLaunchSetupStep | null>(null);
  const [
    communityLaunchKnowledgeIntegrationReloadKey,
    setCommunityLaunchKnowledgeIntegrationReloadKey,
  ] = useState(0);
  const [
    communityLaunchKnowledgeAutoOpenProvider,
    setCommunityLaunchKnowledgeAutoOpenProvider,
  ] = useState<"google_drive" | "github" | null>(null);
  const [
    pendingCommunityLaunchKnowledgeOAuthContext,
    setPendingCommunityLaunchKnowledgeOAuthContext,
  ] = useState<CommunityLaunchKnowledgeOAuthContext | null>(null);
  const [
    pendingCommunityLaunchSetupRouteContext,
    setPendingCommunityLaunchSetupRouteContext,
  ] = useState<CommunityLaunchSetupRouteContext | null>(() => {
    const context = readCurrentCommunityLaunchSetupRouteContext();
    return context.shouldRestore ? context : null;
  });
  const [hasLoadedOnboardingProfile, setHasLoadedOnboardingProfile] = useState(false);
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);
  const profileUi = useWebProfileSettingsUiController({
    profileStorageUserId,
    initialProfileDraft,
    session: session,
    cloudProfile,
  });
  const [isSavingOnboarding, setIsSavingOnboarding] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [onboardingHandleAvailability, setOnboardingHandleAvailability] =
    useState<CloudProfileHandleAvailability | null>(null);
  const [isCheckingOnboardingHandle, setIsCheckingOnboardingHandle] = useState(false);
  const openProfileSetup = useCallback(() => {
    setOnboardingError(null);
    setIsOnboardingModalOpen(true);
  }, []);
  const closeProfileSetup = useCallback(() => {
    setIsOnboardingModalOpen(false);
  }, []);
  /* The bridge (gate card's second state) opens on an entry ATTEMPT — the
     pitch always converts first. Platform-generic joiners never come here:
     they onboard on the standalone /onboarding page. */
  const [isBridgeGateOpen, setIsBridgeGateOpen] = useState(false);
  const [bridgePendingEntry, setBridgePendingEntry] = useState<{
    communityId: string;
    communitySlug: string | null;
    communityName?: string | null;
  } | null>(null);
  const refreshAccountSetupStatus = useCallback(async (activeSession: AuthSession | null = sessionRef.current ?? session) => {
    if (!activeSession) {
      setAccountSetupStatus(null);
      return null;
    }
    const usableSession = await ensureUsableAuthSession(activeSession);
    if (!usableSession) return null;
    setIsLoadingAccountSetupStatus(true);
    try {
      const status = await loadCloudAccountSetupStatus<AuthSession>({ session: usableSession });
      setAccountSetupStatus(status);
      return status;
    } catch {
      return null;
    } finally {
      setIsLoadingAccountSetupStatus(false);
    }
  }, [ensureUsableAuthSession, session, sessionRef]);

  useEffect(() => {
    const handle = profileUi.profileHandle.trim();
    if (!session || !handle) {
      setOnboardingHandleAvailability(null);
      setIsCheckingOnboardingHandle(false);
      return;
    }
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        const activeSession = sessionRef.current ?? session;
        if (!activeSession) return;
        setIsCheckingOnboardingHandle(true);
        try {
          const availability = await checkCloudProfileHandleAvailability<AuthSession>({
            session: activeSession,
            handle,
          });
          if (!cancelled) setOnboardingHandleAvailability(availability);
        } catch {
          if (!cancelled) setOnboardingHandleAvailability(null);
        } finally {
          if (!cancelled) setIsCheckingOnboardingHandle(false);
        }
      })();
    }, 260);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [profileUi.profileHandle, session, sessionRef]);

  const publicCommunityUi = useWebPublicCommunityUiController<
    PublicCommunityRecord,
    PublicPlanSummary,
    CommunityAccess
  >();
  const billingUi = useWebBillingUiController<
    AccountCommerceStatus,
    WorkspaceCreditBalance
  >();
  const {
    accountCommerceStatus,
    setAccountCommerceStatus,
    isLoadingAccountCommerce,
    setIsLoadingAccountCommerce,
    accountCommerceError,
    setAccountCommerceError,
    workspaceCreditBalance,
    setWorkspaceCreditBalance,
    isLoadingWorkspaceCreditBalance,
    setIsLoadingWorkspaceCreditBalance,
    workspaceCreditBalanceError,
    setWorkspaceCreditBalanceError,
    isSettingDevAccountTier,
    setIsSettingDevAccountTier,
    devAccountTierError,
    setDevAccountTierError,
    isStartingStripeConnectOnboarding,
    setIsStartingStripeConnectOnboarding,
    checkoutStatus,
    setCheckoutStatus,
    checkoutError,
    setCheckoutError,
  } = billingUi;
  const [builderPartnerProgram, setBuilderPartnerProgram] =
    useState<BuilderPartnerProgramSnapshot | null>(null);
  const [isLoadingBuilderPartnerProgram, setIsLoadingBuilderPartnerProgram] =
    useState(false);
  const [builderPartnerProgramError, setBuilderPartnerProgramError] =
    useState<string | null>(null);
  const [isAcceptingBuilderPartnerTerms, setIsAcceptingBuilderPartnerTerms] =
    useState(false);
  const builderPartnerProgramLoadRequestIdRef = useRef(0);
  const workspaceCreditLoadRequestIdRef = useRef(0);
  const lastTrackedAuthSessionUserIdRef = useRef<string | null>(null);
  const [isFreeAccountInfoOpen, setIsFreeAccountInfoOpen] = useState(false);
  const [stripeConnectReturn, setStripeConnectReturn] = useState<StripeConnectReturn | null>(null);

  const [modelToggles, setModelToggles] = useState<ModelToggle[]>(DEFAULT_MODEL_TOGGLES);
  const [modelProviderById, setModelProviderById] = useState<Record<string, string>>({});
  const platformModelToggles = useMemo<ModelToggle[]>(() => {
    const defaultOpenAiModel = modelToggles.find((toggle) => toggle.id === DEFAULT_ACTIVE_MODEL_ID);
    return [
      {
        id: DEFAULT_ACTIVE_MODEL_ID,
        label: defaultOpenAiModel?.label ?? DEFAULT_ACTIVE_MODEL_LABEL,
        enabled: true,
      },
    ];
  }, [modelToggles]);
  const [activeModelId, setActiveModelId] = useState<string | null>(() => {
    try {
      const stored = (
        readFirstLocalStorageValue([ACTIVE_MODEL_STORAGE_KEY, LEGACY_ACTIVE_MODEL_STORAGE_KEY]) ?? ""
      ).trim();
      return stored || null;
    } catch {
      return null;
    }
  });
  const [activeRuntimeEngine, setActiveRuntimeEngineState] = useState<RuntimeEngine>(() => {
    try {
      const stored = localStorage.getItem(ACTIVE_RUNTIME_ENGINE_STORAGE_KEY);
      const shouldRestorePolynetDefault =
        localStorage.getItem(ACTIVE_RUNTIME_ENGINE_CODEX_DEFAULT_MIGRATION_KEY) === "1" &&
        localStorage.getItem(ACTIVE_RUNTIME_ENGINE_POLYNET_DEFAULT_RESTORE_KEY) !== "1" &&
        normalizeActiveWorkspaceRuntimeEngine(stored) === RUNTIME_ENGINE_CODEX;
      const normalized = shouldRestorePolynetDefault
        ? RUNTIME_ENGINE_POLYNET
        : normalizeActiveWorkspaceRuntimeEngine(stored);
      if (shouldRestorePolynetDefault) {
        localStorage.setItem(ACTIVE_RUNTIME_ENGINE_POLYNET_DEFAULT_RESTORE_KEY, "1");
      }
      if (stored !== normalized) {
        localStorage.setItem(ACTIVE_RUNTIME_ENGINE_STORAGE_KEY, normalized);
      }
      return normalized;
    } catch {
      return RUNTIME_ENGINE_POLYNET;
    }
  });
  const setActiveRuntimeEngine = useCallback((next: RuntimeEngine): void => {
    const normalized = normalizeActiveWorkspaceRuntimeEngine(next);
    setActiveRuntimeEngineState(normalized);
    try {
      localStorage.setItem(ACTIVE_RUNTIME_ENGINE_STORAGE_KEY, normalized);
    } catch {
      // Local storage is best-effort; the cloud thread value remains canonical for saved threads.
    }
  }, []);
  const resetDraftRuntimeEngine = useCallback((): void => {
    setActiveRuntimeEngine(DEFAULT_ACTIVE_RUNTIME_ENGINE);
  }, [setActiveRuntimeEngine]);
  const formatModelLabel = useCallback(
    (modelId: string | null | undefined): string | null => {
      const normalized = (modelId ?? "").trim();
      if (!normalized) return null;
      if (isFreeModelId(normalized, GUEST_MODEL_ALLOWLIST)) {
        return GUEST_MODEL_LABELS[normalized] ?? normalized;
      }
      return modelToggles.find((toggle) => toggle.id === normalized)?.label ?? normalized;
    },
    [modelToggles],
  );
  const newPersonalMemoryScope: "global" = "global";
  const personalMemoryUi = useWebPersonalMemoryUiController();
  const [isLoadingCommunities, setIsLoadingCommunities] = useState<boolean>(() => Boolean(session));
  const [hasResolvedCommunities, setHasResolvedCommunities] = useState(false);
  const [communities, setCommunities] = useState<CommunityRecord[]>([]);
  const [communityRoleById, setCommunityRoleById] = useState<Record<string, string>>({});
  const defaultMemberEntryResolutionRef =
    useRef<{
      authSubject: string;
      promise: Promise<CloudMemberEntryDestination | null>;
    } | null>(null);
  const communityRailOrderStorageKey = useMemo(
    () => `${COMMUNITY_RAIL_ORDER_STORAGE_KEY_PREFIX}:${session?.user?.id ?? "local"}`,
    [session?.user?.id],
  );
  const { orderedCommunities: railCommunities, moveCommunityToIndex: handleReorderCommunityRail } =
    useCommunityRailOrder<CommunityRecord>({
      communities,
      storageKey: communityRailOrderStorageKey,
    });
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, UserProfile>>({});
  const [communityTab, setCommunityTab] = useState<CommunityTab>(() => initialAppRoute?.communityTab ?? "chat");
  const [communityExperienceMode, setCommunityExperienceMode] = useState<CommunityExperienceMode>(() =>
    initialAppRoute?.page === "community"
      ? initialAppRoute.communityExperienceMode ?? "standard"
      : "standard",
  );
  const [communityResourceModuleId, setCommunityResourceModuleId] = useState<string | null>(() =>
    initialAppRoute?.page === "community" && initialAppRoute.communityTab === "resources"
      ? initialAppRoute.communityResourceModuleId ?? null
      : null,
  );
  const [communitySettingsPane, setCommunitySettingsPane] = useState<CommunitySettingsPane>(() =>
    initialAppRoute?.page === "community" && initialAppRoute.communityTab === "settings"
      ? initialAppRoute.communitySettingsPane ?? "community"
      : "community",
  );
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
    initialCommunitySlug: initialAppRoute?.communitySlug ?? null,
    communities,
    setCommunityTab,
  });

  const [communityInteractionRoots, setCommunityInteractionRoots] = useState<CommunityInteractionRoot[]>([]);
  const [communityInteractionNextBeforeCreatedAt, setCommunityInteractionNextBeforeCreatedAt] =
    useState<number | null>(null);
  const [isLoadingOlderCommunityInteractionRoots, setIsLoadingOlderCommunityInteractionRoots] = useState(false);
  const [communityInteractionRootChangeReason, setCommunityInteractionRootChangeReason] =
    useState<CommunityInteractionRootChangeReason>("reset");
  const [communityAgentServeIssue, setCommunityAgentServeIssue] =
    useState<CloudCommunityAgentServeIssue | null>(null);
  const communityInteractionRootsRef = useRef<CommunityInteractionRoot[]>([]);
  const dismissedCommunityAgentServeIssueIdsRef = useRef<Set<string>>(new Set());
  const communityInteractionNextBeforeCreatedAtRef = useRef<number | null>(null);
  const isLoadingOlderCommunityInteractionRootsRef = useRef(false);
  communityInteractionRootsRef.current = communityInteractionRoots;
  communityInteractionNextBeforeCreatedAtRef.current = communityInteractionNextBeforeCreatedAt;
  isLoadingOlderCommunityInteractionRootsRef.current = isLoadingOlderCommunityInteractionRoots;
  const [pendingCanonicalInteractions, setPendingCanonicalInteractions] = useState<PendingCanonicalInteraction[]>([]);
  const pendingCanonicalInteractionsRef = useRef<PendingCanonicalInteraction[]>([]);
  pendingCanonicalInteractionsRef.current = pendingCanonicalInteractions;
  const [isLoadingCommunityInteractions, setIsLoadingCommunityInteractions] = useState(false);
  const [communityInteractionError, setCommunityInteractionError] = useState<string | null>(null);
  const [selectedCommunityInteractionRootId, setSelectedCommunityInteractionRootId] = useState<string | null>(null);
  const [communityInteractionRepliesByRootId, setCommunityInteractionRepliesByRootId] = useState<
    Record<string, CommunityInteractionReply[]>
  >({});
  const [communityInteractionRepliesErrorByRootId, setCommunityInteractionRepliesErrorByRootId] = useState<
    Record<string, string | null>
  >({});
  const [loadingCommunityInteractionRepliesRootId, setLoadingCommunityInteractionRepliesRootId] =
    useState<string | null>(null);
  // Drop optimistic placeholders once the real (confirmed) message lands; failed ones stay for retry.
  useEffect(() => {
    setPendingCanonicalInteractions((prev) => {
      if (prev.length === 0) return prev;
      const rootKeys = new Set(
        communityInteractionRoots.map((bundle) => bundle.root.idempotency_key).filter(Boolean),
      );
      const replyKeys = new Set<string>();
      for (const list of Object.values(communityInteractionRepliesByRootId)) {
        for (const bundle of list) {
          if (bundle.reply.idempotency_key) replyKeys.add(bundle.reply.idempotency_key);
        }
      }
      const next = prev.filter((item) => {
        const stored = composerStoredIdempotencyKey(item.idempotencyKey, item.kind);
        return item.kind === "root" ? !rootKeys.has(stored) : !replyKeys.has(stored);
      });
      return next.length === prev.length ? prev : next;
    });
  }, [communityInteractionRoots, communityInteractionRepliesByRootId]);
  const activeCommunityInteractionCommunityIdRef = useRef<string | null>(null);
  const communityInteractionProjectionBoundaryRef = useRef<string | null>(null);
  const communityInteractionRootsRequestIdRef = useRef(0);
  const communityInteractionRepliesRequestIdRef = useRef<Record<string, number>>({});
  activeCommunityInteractionCommunityIdRef.current = activeCommunityId;
  const [communityMessageInput, setCommunityMessageInput] = useState("");
  const [communityMessageMentions, setCommunityMessageMentions] = useState<CommittedMention[]>([]);
  useEffect(() => {
    if (!communityMessageInput) setCommunityMessageMentions([]);
  }, [communityMessageInput]);
  const workspaceComposerApiRef = useRef<WorkspaceComposerApi | null>(null);
  const memberAgentComposerApiRef = useRef<WebMemberAgentDockHandle | null>(null);
  const workspaceStarterPromptConsumedRef = useRef(false);
  const workspaceComposerDraftRef = useRef<WorkspaceComposerDraft>({
    text: "",
    attachments: [],
  });
  const [threadErrorById, setThreadErrorById] = useState<Record<string, string | null>>({});
  const [guestInferenceIssueById, setGuestInferenceIssueById] = useState<Record<string, GuestInferenceIssue | null>>({});
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const resolveThreadErrorKey = useCallback(
    (threadId: string | null): string => {
      const trimmedThreadId = String(threadId ?? "").trim();
      if (trimmedThreadId) return trimmedThreadId;
      return session ? WORKSPACE_DRAFT_THREAD_ERROR_KEY : GUEST_THREAD_ID;
    },
    [session],
  );
  const setThreadErrorForThread = useCallback(
    (threadId: string | null, value: string | null | ((prev: string | null) => string | null)): void => {
      const key = resolveThreadErrorKey(threadId);
      setThreadErrorById((prev) => {
        const previousValue = prev[key] ?? null;
        const nextValue = typeof value === "function" ? value(previousValue) : value;
        if (nextValue === null) {
          if (!(key in prev)) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        }
        if (previousValue === nextValue) return prev;
        return {
          ...prev,
          [key]: nextValue,
        };
      });
    },
    [resolveThreadErrorKey],
  );
  const setThreadError = useCallback(
    (value: string | null | ((prev: string | null) => string | null)): void => {
      setThreadErrorForThread(activeThreadId, value);
    },
    [activeThreadId, setThreadErrorForThread],
  );
  const setGuestInferenceIssueForThread = useCallback(
    (
      threadId: string | null,
      value:
        | GuestInferenceIssue
        | null
        | ((prev: GuestInferenceIssue | null) => GuestInferenceIssue | null),
    ): void => {
      const key = resolveThreadErrorKey(threadId);
      setGuestInferenceIssueById((prev) => {
        const previousValue = prev[key] ?? null;
        const nextValue = typeof value === "function" ? value(previousValue) : value;
        if (nextValue === null) {
          if (!(key in prev)) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        }
        if (previousValue === nextValue) return prev;
        return {
          ...prev,
          [key]: nextValue,
        };
      });
    },
    [resolveThreadErrorKey],
  );
  const [communityAttachments, setCommunityAttachments] = useState<MessageAttachment[]>([]);
  const communityAttachmentsRef = useRef<MessageAttachment[]>([]);
  const [communityChatError, setCommunityChatError] = useState<string | null>(null);
  /* Setup-required errors are a doorway, not a dead end: whenever a community
     surface strands on the profile/setup gate, open the setup surface too —
     once per distinct message, so retries of the same failure don't reopen a
     modal the member already dismissed. */
  const lastSetupGateErrorRef = useRef<string | null>(null);
  useEffect(() => {
    const setupGateMessage =
      [communityChatError, communityInteractionError].find((message) =>
        Boolean(
          message &&
            (message.includes("profile_setup_required") ||
              message.includes("account_setup_required") ||
              message.includes("Finish your profile")),
        ),
      ) ?? null;
    if (!setupGateMessage) return;
    if (lastSetupGateErrorRef.current === setupGateMessage) return;
    lastSetupGateErrorRef.current = setupGateMessage;
    openProfileSetup();
  }, [communityChatError, communityInteractionError, openProfileSetup]);
  const communitySeenAcknowledgeKeyBySurfaceRef = useRef<Record<string, string>>({});
  const communityChatListRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const communityFileInputRef = useRef<HTMLInputElement | null>(null);
  const communityVoiceTranscriptTargetRef = useRef<CommunityVoiceTranscriptTarget | null>(null);
  const [communityVoiceButtonOwner, setCommunityVoiceButtonOwner] =
    useState<CommunityVoiceButtonOwner | null>(null);
  const [isSendingCommunityMessage, setIsSendingCommunityMessage] = useState(false);
  const {
    isCommunityChatLightboxOpen,
    communityChatLightboxImages,
    communityChatLightboxIndex,
    setCommunityChatLightboxIndex,
    openCommunityChatLightbox,
    closeCommunityChatLightbox,
  } = useCommunityChatLightbox<ChatLightboxImage>();
  const {
    handleAttachmentFileInputChange: handleCommunityFileInputChange,
    handleAttachmentDrop: handleCommunityAttachmentDrop,
    handleAttachmentDragEnter: handleCommunityAttachmentDragEnter,
    handleAttachmentDragOver: handleCommunityAttachmentDragOver,
    handleAttachmentDragLeave: handleCommunityAttachmentDragLeave,
    handleAttachmentPaste: handleCommunityAttachmentPaste,
    isAttachmentDragOver: isCommunityAttachmentDragOver,
    removeAttachment: removeCommunityAttachment,
  } = useMessageAttachmentInputController<MessageAttachment>({
    attachmentsRef: communityAttachmentsRef,
    setAttachments: setCommunityAttachments,
    setError: setCommunityChatError,
    ingestAttachmentsFromFileList: ingestCommunityAttachmentsFromFileList,
  });
  const resetCommunityInteractionProjection = useCallback(() => {
    communityInteractionRootsRequestIdRef.current += 1;
    communityInteractionRepliesRequestIdRef.current = {};
    setCommunityInteractionRoots([]);
    setCommunityInteractionNextBeforeCreatedAt(null);
    setIsLoadingOlderCommunityInteractionRoots(false);
    setCommunityInteractionRootChangeReason("reset");
    setCommunityInteractionError(null);
    setIsLoadingCommunityInteractions(false);
    setSelectedCommunityInteractionRootId(null);
    setCommunityInteractionRepliesByRootId({});
    setCommunityInteractionRepliesErrorByRootId({});
    setLoadingCommunityInteractionRepliesRootId(null);
  }, []);

  const loadCommunityInteractionReplies = useCallback(async (
    rootIdRaw: string,
    activeSessionRaw: AuthSession | null = session,
  ) => {
    const rootId = String(rootIdRaw ?? "").trim();
    if (!rootId) return;
    const usableSession = await ensureUsableAuthSession(activeSessionRaw ?? undefined);
    if (!usableSession) return;
    const requestId = (communityInteractionRepliesRequestIdRef.current[rootId] ?? 0) + 1;
    communityInteractionRepliesRequestIdRef.current = {
      ...communityInteractionRepliesRequestIdRef.current,
      [rootId]: requestId,
    };
    setLoadingCommunityInteractionRepliesRootId(rootId);
    setCommunityInteractionRepliesErrorByRootId((previous) => ({ ...previous, [rootId]: null }));
    try {
      const replies = await listCloudCommunityInteractionReplies<AuthSession>({
        session: usableSession,
        rootId,
        limit: COMMUNITY_INTERACTION_REPLY_LIMIT,
      });
      if (communityInteractionRepliesRequestIdRef.current[rootId] !== requestId) return;
      setCommunityInteractionRepliesByRootId((previous) => ({ ...previous, [rootId]: replies }));
    } catch (error) {
      if (communityInteractionRepliesRequestIdRef.current[rootId] !== requestId) return;
      setCommunityInteractionRepliesErrorByRootId((previous) => ({
        ...previous,
        [rootId]: formatCommunityInteractionProjectionError(error),
      }));
    } finally {
      if (communityInteractionRepliesRequestIdRef.current[rootId] === requestId) {
        setLoadingCommunityInteractionRepliesRootId((current) => (current === rootId ? null : current));
      }
    }
  }, [ensureUsableAuthSession, session]);

  const loadCommunityInteractionRoots = useCallback(async (
    communityIdRaw: string | null = activeCommunityId,
    activeSessionRaw: AuthSession | null = session,
  ) => {
    const communityId = String(communityIdRaw ?? "").trim();
    if (!communityId) {
      resetCommunityInteractionProjection();
      return;
    }
    const usableSession = await ensureUsableAuthSession(activeSessionRaw ?? undefined);
    if (!usableSession) return;
    const requestId = communityInteractionRootsRequestIdRef.current + 1;
    communityInteractionRootsRequestIdRef.current = requestId;
    setIsLoadingCommunityInteractions(true);
    setCommunityInteractionError(null);
    try {
      const page = await listCloudCommunityInteractionRootsPage<AuthSession>({
        session: usableSession,
        communityId,
        limit: COMMUNITY_INTERACTION_ROOT_LIMIT,
      });
      if (
        communityInteractionRootsRequestIdRef.current !== requestId
        || activeCommunityInteractionCommunityIdRef.current !== communityId
      ) {
        return;
      }
      setCommunityInteractionRootChangeReason("initial");
      setCommunityInteractionRoots(page.roots);
      setCommunityInteractionNextBeforeCreatedAt(page.nextBeforeCreatedAt);
      setSelectedCommunityInteractionRootId((current) =>
        current && page.roots.some((bundle) => bundle.root.id === current) ? current : null,
      );
    } catch (error) {
      if (
        communityInteractionRootsRequestIdRef.current !== requestId
        || activeCommunityInteractionCommunityIdRef.current !== communityId
      ) {
        return;
      }
      setCommunityInteractionError(formatCommunityInteractionProjectionError(error));
    } finally {
      if (
        communityInteractionRootsRequestIdRef.current === requestId
        && activeCommunityInteractionCommunityIdRef.current === communityId
      ) {
        setIsLoadingCommunityInteractions(false);
      }
    }
  }, [activeCommunityId, ensureUsableAuthSession, resetCommunityInteractionProjection, session]);

  const loadOlderCommunityInteractionRoots = useCallback(async (
    communityIdRaw: string | null = activeCommunityId,
    activeSessionRaw: AuthSession | null = session,
  ) => {
    const communityId = String(communityIdRaw ?? "").trim();
    const beforeCreatedAt = communityInteractionNextBeforeCreatedAtRef.current;
    if (
      !communityId
      || beforeCreatedAt === null
      || isLoadingOlderCommunityInteractionRootsRef.current
    ) {
      return;
    }
    const usableSession = await ensureUsableAuthSession(activeSessionRaw ?? undefined);
    if (!usableSession) return;
    setIsLoadingOlderCommunityInteractionRoots(true);
    try {
      const page = await listCloudCommunityInteractionRootsPage<AuthSession>({
        session: usableSession,
        communityId,
        beforeCreatedAt,
        limit: COMMUNITY_INTERACTION_ROOT_LIMIT,
      });
      if (activeCommunityInteractionCommunityIdRef.current !== communityId) return;
      setCommunityInteractionRootChangeReason("older");
      setCommunityInteractionRoots((current) =>
        mergeCommunityInteractionRootWindows(
          current.filter((bundle) => bundle.root.community_id === communityId),
          page.roots,
        ),
      );
      setCommunityInteractionNextBeforeCreatedAt(page.nextBeforeCreatedAt);
    } catch {
      // Keep the already loaded window usable; the next upward scroll can retry.
    } finally {
      if (activeCommunityInteractionCommunityIdRef.current === communityId) {
        setIsLoadingOlderCommunityInteractionRoots(false);
      }
    }
  }, [activeCommunityId, ensureUsableAuthSession, session]);

  useEffect(() => {
    if (!activeCommunityId || !session) return;
    let cancelled = false;
    let liveClient: CloudCommunityChatLiveClient | null = null;
    let unsubscribe: (() => void) | null = null;
    void (async () => {
      const usableSession = await ensureUsableAuthSession(session ?? undefined);
      if (!usableSession || cancelled) return;
      try {
        liveClient = createCloudCommunityChatLiveClient({
          session: usableSession,
          ensureSession: ensureUsableAuthSession,
        });
        unsubscribe = subscribeCloudCommunityInteractionRoots({
          liveClient,
          communityId: activeCommunityId,
          limit: COMMUNITY_INTERACTION_ROOT_LIMIT,
          onUpdate: (roots) => {
            if (cancelled) return;
            const hadLoadedRoots = communityInteractionRootsRef.current.some(
              (bundle) => bundle.root.community_id === activeCommunityId,
            );
            setCommunityInteractionRootChangeReason(hadLoadedRoots ? "newer" : "initial");
            setCommunityInteractionRoots((current) =>
              mergeCommunityInteractionRootWindows(
                current.filter((bundle) => bundle.root.community_id === activeCommunityId),
                roots,
              ),
            );
            setIsLoadingCommunityInteractions(false);
            setCommunityInteractionError(null);
          },
          onError: (error) => {
            if (cancelled) return;
            setCommunityInteractionError(formatCommunityInteractionProjectionError(error));
            setIsLoadingCommunityInteractions(false);
          },
        });
      } catch (error) {
        if (!cancelled) {
          setCommunityInteractionError(formatCommunityInteractionProjectionError(error));
          setIsLoadingCommunityInteractions(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
      liveClient?.close();
    };
  }, [activeCommunityId, ensureUsableAuthSession, session]);

  useEffect(() => {
    if (
      activePage !== "community" ||
      communityTab !== "chat" ||
      !activeCommunityId ||
      !session
    ) {
      setCommunityAgentServeIssue(null);
      return;
    }
    let cancelled = false;
    let liveClient: CloudCommunityChatLiveClient | null = null;
    let unsubscribe: (() => void) | null = null;
    void (async () => {
      const usableSession = await ensureUsableAuthSession(session ?? undefined);
      if (!usableSession || cancelled) return;
      try {
        liveClient = createCloudCommunityChatLiveClient({
          session: usableSession,
          ensureSession: ensureUsableAuthSession,
        });
        unsubscribe = subscribeCloudCommunityAgentServeIssue({
          liveClient,
          communityId: activeCommunityId,
          onUpdate: (issue) => {
            if (cancelled) return;
            if (issue && !dismissedCommunityAgentServeIssueIdsRef.current.has(issue.id)) {
              setCommunityAgentServeIssue(issue);
              return;
            }
            setCommunityAgentServeIssue(null);
          },
          onError: (error) => {
            if (!cancelled) {
              console.warn("community_agent_serve_issue_subscription_failed", error);
              setCommunityAgentServeIssue(null);
            }
          },
        });
      } catch (error) {
        if (!cancelled) {
          console.warn("community_agent_serve_issue_subscription_failed", error);
          setCommunityAgentServeIssue(null);
        }
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
      liveClient?.close();
    };
  }, [activeCommunityId, activePage, communityTab, ensureUsableAuthSession, session]);

  useEffect(() => {
    if (!selectedCommunityInteractionRootId || !session) return;
    const rootId = selectedCommunityInteractionRootId;
    let cancelled = false;
    let liveClient: CloudCommunityChatLiveClient | null = null;
    let unsubscribe: (() => void) | null = null;
    void (async () => {
      const usableSession = await ensureUsableAuthSession(session ?? undefined);
      if (!usableSession || cancelled) return;
      try {
        liveClient = createCloudCommunityChatLiveClient({
          session: usableSession,
          ensureSession: ensureUsableAuthSession,
        });
        unsubscribe = subscribeCloudCommunityInteractionReplies({
          liveClient,
          rootId,
          limit: COMMUNITY_INTERACTION_REPLY_LIMIT,
          onUpdate: (replies) => {
            if (cancelled) return;
            setCommunityInteractionRepliesByRootId((previous) => ({ ...previous, [rootId]: replies }));
            setLoadingCommunityInteractionRepliesRootId((current) => (current === rootId ? null : current));
            setCommunityInteractionRepliesErrorByRootId((previous) => ({ ...previous, [rootId]: null }));
          },
          onError: (error) => {
            if (cancelled) return;
            setCommunityInteractionRepliesErrorByRootId((previous) => ({
              ...previous,
              [rootId]: formatCommunityInteractionProjectionError(error),
            }));
            setLoadingCommunityInteractionRepliesRootId((current) => (current === rootId ? null : current));
          },
        });
      } catch (error) {
        if (!cancelled) {
          setCommunityInteractionRepliesErrorByRootId((previous) => ({
            ...previous,
            [rootId]: formatCommunityInteractionProjectionError(error),
          }));
          setLoadingCommunityInteractionRepliesRootId((current) => (current === rootId ? null : current));
        }
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
      liveClient?.close();
    };
  }, [ensureUsableAuthSession, selectedCommunityInteractionRootId, session]);

  const handleRetryPendingCanonicalInteraction = useCallback((idempotencyKey: string) => {
    const pending = pendingCanonicalInteractionsRef.current.find(
      (item) => item.idempotencyKey === idempotencyKey,
    );
    if (!pending) return;
    setPendingCanonicalInteractions((prev) =>
      prev.map((item) => (item.idempotencyKey === idempotencyKey ? { ...item, status: "sending" } : item)),
    );
    const markFailed = () =>
      setPendingCanonicalInteractions((prev) =>
        prev.map((item) =>
          item.idempotencyKey === idempotencyKey ? { ...item, status: "failed" } : item,
        ),
      );
    void (async () => {
      const activeSession = session;
      if (!activeSession) {
        markFailed();
        return;
      }
      try {
        await createCloudCommunityInteractionComposerMessageRows<AuthSession>({
          session: activeSession,
          communityId: pending.communityId,
          idempotencyKey: pending.idempotencyKey,
          text: pending.text,
          rootId: pending.rootId,
          targetReplyId: pending.targetReplyId,
          attachments: pending.serializedAttachments,
        });
        void loadCommunityInteractionRoots(pending.communityId, activeSession);
        if (pending.kind === "reply" && pending.rootId) {
          void loadCommunityInteractionReplies(pending.rootId, activeSession);
        }
      } catch {
        markFailed();
      }
    })();
  }, [session, loadCommunityInteractionRoots, loadCommunityInteractionReplies]);

  const handleDiscardPendingCanonicalInteraction = useCallback((idempotencyKey: string) => {
    setPendingCanonicalInteractions((prev) => prev.filter((item) => item.idempotencyKey !== idempotencyKey));
  }, []);

  const handleSelectCommunityInteractionRoot = useCallback((rootIdRaw: string) => {
    const rootId = String(rootIdRaw ?? "").trim();
    if (!rootId) return;
    setSelectedCommunityInteractionRootId((current) => {
      const next = current === rootId ? null : rootId;
      writeStoredInteractionSelectedRoot(activeCommunityId, next);
      if (next && !communityInteractionRepliesByRootId[next]) {
        void loadCommunityInteractionReplies(next);
      }
      return next;
    });
  }, [activeCommunityId, communityInteractionRepliesByRootId, loadCommunityInteractionReplies]);

  const handleCloseCommunityInteractionDrawer = useCallback(() => {
    setSelectedCommunityInteractionRootId(null);
    writeStoredInteractionSelectedRoot(activeCommunityId, null);
  }, [activeCommunityId]);

  const restoredInteractionSelectionForCommunityRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeCommunityId) return;
    if (shellVariant === "mobile") return;
    if (restoredInteractionSelectionForCommunityRef.current === activeCommunityId) return;
    // Restore only once the feed's roots are actually loaded FOR THIS community,
    // i.e. after the boot-time resets have settled — otherwise the master reset
    // effect clobbers the restored selection.
    const rootsLoadedForCommunity =
      communityInteractionRoots.length > 0
      && communityInteractionRoots[0]?.root.community_id === activeCommunityId;
    if (!rootsLoadedForCommunity) return;
    restoredInteractionSelectionForCommunityRef.current = activeCommunityId;
    const stored = readStoredInteractionSelectedRoot(activeCommunityId);
    if (stored && communityInteractionRoots.some((bundle) => bundle.root.id === stored)) {
      setSelectedCommunityInteractionRootId((current) => current ?? stored);
    }
  }, [activeCommunityId, communityInteractionRoots, shellVariant]);

  const handleToggleCommunityInteractionReaction = useCallback(async (
    targetType: "root" | "reply",
    targetId: string,
    emoji: string,
  ) => {
    const usableSession = await ensureUsableAuthSession(session ?? undefined);
    if (!usableSession) return;
    try {
      await toggleCloudCommunityInteractionReaction<AuthSession>({
        session: usableSession,
        targetType,
        targetId,
        emoji,
      });
    } catch {
      // Live subscription reflects authoritative server state.
    }
  }, [
    activeCommunityId,
    ensureUsableAuthSession,
    loadCommunityInteractionReplies,
    loadCommunityInteractionRoots,
    selectedCommunityInteractionRootId,
    session,
  ]);

  const handleEditCommunityInteractionMessage = useCallback(async (
    targetType: "root" | "reply",
    targetId: string,
    text: string,
  ) => {
    const usableSession = await ensureUsableAuthSession(session ?? undefined);
    if (!usableSession) return;
    try {
      await editCloudCommunityInteractionMessage<AuthSession>({ session: usableSession, targetType, targetId, text });
    } catch {
      // Live subscription reflects authoritative server state.
    }
  }, [
    activeCommunityId,
    ensureUsableAuthSession,
    loadCommunityInteractionReplies,
    loadCommunityInteractionRoots,
    selectedCommunityInteractionRootId,
    session,
  ]);

  const handleDeleteCommunityInteractionMessage = useCallback(async (
    targetType: "root" | "reply",
    targetId: string,
  ) => {
    const usableSession = await ensureUsableAuthSession(session ?? undefined);
    if (!usableSession) return;
    if (targetType === "root" && selectedCommunityInteractionRootId === targetId) {
      setSelectedCommunityInteractionRootId(null);
      writeStoredInteractionSelectedRoot(activeCommunityId, null);
    }
    try {
      await deleteCloudCommunityInteractionMessage<AuthSession>({ session: usableSession, targetType, targetId });
    } catch {
      // Live subscription reflects authoritative server state.
    }
  }, [
    activeCommunityId,
    ensureUsableAuthSession,
    loadCommunityInteractionReplies,
    loadCommunityInteractionRoots,
    selectedCommunityInteractionRootId,
    session,
  ]);

  // Keep the interaction projection loaded whenever a community is active, not only on the chat
  // tab, so its roots persist across community navigation. Reset only when the community/session ends.
  useEffect(() => {
    const sessionUserId = String(canonicalSessionUserId ?? "").trim();
    if (!activeCommunityId || !session || !sessionUserId) {
      communityInteractionProjectionBoundaryRef.current = null;
      resetCommunityInteractionProjection();
      return;
    }
    const nextBoundary = `${sessionUserId}:${activeCommunityId}`;
    if (communityInteractionProjectionBoundaryRef.current !== nextBoundary) {
      communityInteractionProjectionBoundaryRef.current = nextBoundary;
      resetCommunityInteractionProjection();
    }
    void loadCommunityInteractionRoots(activeCommunityId, session);
  }, [
    activeCommunityId,
    canonicalSessionUserId,
    loadCommunityInteractionRoots,
    resetCommunityInteractionProjection,
    session,
  ]);

  const canMentionEverybodyRef = useRef(false);
  const { handleSendCommunityMessage } = useCommunityChatMutationController({
    activeCommunityId,
    canMentionEverybodyRef,
    session: session,
    sessionUserId: canonicalSessionUserId,
    ensureSession: ensureUsableAuthSession,
    onCanonicalOptimisticInsert: (pending) => {
      setPendingCanonicalInteractions((prev) => [
        ...prev.filter((item) => item.idempotencyKey !== pending.idempotencyKey),
        { ...pending, status: "sending" },
      ]);
    },
    onCanonicalOptimisticSettle: ({ idempotencyKey, status }) => {
      setPendingCanonicalInteractions((prev) =>
        prev.map((item) => (item.idempotencyKey === idempotencyKey ? { ...item, status } : item)),
      );
    },
    createCommunityInteractionMessageRows: (params) =>
      createCloudCommunityInteractionComposerMessageRows<AuthSession>({
        session: params.session,
        communityId: params.communityId,
        idempotencyKey: params.idempotencyKey,
        text: params.text,
        rootId: params.rootId ?? null,
        targetReplyId: params.targetReplyId ?? null,
        mentions: params.mentions,
        attachments: params.attachments,
      }),
    beforeSendValidate: async () => {
      if (!isProfileSetupCompleteForPublicActions) {
        openProfileSetup();
        return "Finish your profile before posting in communities.";
      }
      return null;
    },
    confirmEverybodyMentionSend: async ({ emailMode }) => {
      if (typeof window === "undefined") return true;
      const message =
        emailMode === "in_app_only"
          ? "This @everybody mention will notify members in app only. The email blast is on cooldown."
          : emailMode === "in_app_and_email"
            ? "This @everybody mention will notify members in app. Unread members may also get an email after 15 minutes. Email blasts are limited to once every 72 hours."
            : "This @everybody mention will notify members in app. If the email blast is available, unread members may also get an email after 15 minutes.";
      return window.confirm(message);
    },
    onProfileSetupRequired: openProfileSetup,
    prepareAttachmentsForSend: prepareCommunityAttachmentsForSend,
    serializeAttachmentsForWrite: serializeCommunityAttachmentsForWrite,
    onCommunityMessageSent: ({ communityId, hasAttachments, hasReply }) => {
      captureProductAnalyticsEvent("community message sent", {
        community_id: communityId,
        has_attachments: hasAttachments,
        has_reply: hasReply,
        surface: "community_chat",
      });
      void loadCommunityInteractionRoots(communityId, session);
      if (hasReply && selectedCommunityInteractionRootId) {
        void loadCommunityInteractionReplies(selectedCommunityInteractionRootId, session);
      }
    },
    chatInputRef,
    communityAttachmentsRef,
    communityMessageInput,
    communityMessageMentions,
    setCommunityMessageInput,
    setCommunityAttachments,
    setIsSendingCommunityMessage,
    setCommunityChatError,
  });

  const [communityResources, setCommunityResources] = useState<CommunityResource[]>([]);
  const [communityLaunchLinkSources, setCommunityLaunchLinkSources] = useState<
    CommunityLaunchKnowledgeImportedSource[]
  >([]);
  const [communityLaunchFileSources, setCommunityLaunchFileSources] = useState<
    CommunityLaunchKnowledgeImportedSource[]
  >([]);
  const [communityLaunchGoogleDriveSources, setCommunityLaunchGoogleDriveSources] = useState<
    CommunityLaunchKnowledgeImportedSource[]
  >([]);
  const [communityLaunchGitHubSources, setCommunityLaunchGitHubSources] = useState<
    CommunityLaunchKnowledgeImportedSource[]
  >([]);
  const [communityResourceModules, setCommunityResourceModules] = useState<CommunityResourceModule[]>([]);
  const [isLoadingResources, setIsLoadingResources] = useState(false);
  const [openResourceEmbedId, setOpenResourceEmbedId] = useState<string | null>(null);
  const [communityEventsByCacheKey, setCommunityEventsByCacheKey] = useState<Record<string, CommunityEvent[]>>({});
  const [isLoadingCommunityEvents, setIsLoadingCommunityEvents] = useState(false);
  const [communityEventsError, setCommunityEventsError] = useState<string | null>(null);
  const [communityEventsVisibleMonthIso, setCommunityEventsVisibleMonthIso] = useState(() =>
    normalizeCommunityEventsMonthIso(null),
  );
  const communityEventsVisibleRange = useMemo(
    () => getCommunityEventsMonthRange(communityEventsVisibleMonthIso),
    [communityEventsVisibleMonthIso],
  );
  const communityEventsCacheKey = useMemo(
    () =>
      activeCommunityId
        ? buildCommunityEventsCacheKey(activeCommunityId, communityEventsVisibleRange)
        : null,
    [activeCommunityId, communityEventsVisibleRange],
  );
  const communityEvents = useMemo(
    () => (communityEventsCacheKey ? communityEventsByCacheKey[communityEventsCacheKey] ?? [] : []),
    [communityEventsByCacheKey, communityEventsCacheKey],
  );
  const setCommunityEvents = useCallback<Dispatch<SetStateAction<CommunityEvent[]>>>(
    (nextEvents) => {
      setCommunityEventsByCacheKey((prev) => {
        const previousForKey = communityEventsCacheKey ? prev[communityEventsCacheKey] ?? [] : [];
        const resolvedEvents =
          typeof nextEvents === "function"
            ? nextEvents(previousForKey)
            : nextEvents;
        if (!communityEventsCacheKey) {
          return resolvedEvents.length === 0 ? {} : prev;
        }
        return {
          ...prev,
          [communityEventsCacheKey]: resolvedEvents,
        };
      });
    },
    [communityEventsCacheKey],
  );
  const resetCommunityEventsCache = useCallback(() => {
    setCommunityEventsByCacheKey({});
  }, []);
  const invalidateCommunityEventsCacheForCommunity = useCallback((communityId: string) => {
    const cacheKeyPrefix = `${communityId}:`;
    setCommunityEventsByCacheKey((prev) => {
      let didRemove = false;
      const next: Record<string, CommunityEvent[]> = {};
      for (const [key, events] of Object.entries(prev)) {
        if (key.startsWith(cacheKeyPrefix)) {
          didRemove = true;
          continue;
        }
        next[key] = events;
      }
      return didRemove ? next : prev;
    });
  }, []);
  const {
    communityJoinRequests,
    setCommunityJoinRequests,
    isLoadingCommunityJoinRequests,
    setIsLoadingCommunityJoinRequests,
    communityJoinRequestsError,
    setCommunityJoinRequestsError,
    decidingCommunityJoinRequestId,
    setDecidingCommunityJoinRequestId,
  } = useWebCommunityJoinRequestsController<CommunityJoinRequest>({
    activeCommunityId,
  });
  const [isSettingCommunityFreeAccessMode, setIsSettingCommunityFreeAccessMode] = useState(false);
  const [communityFreeAccessModeError, setCommunityFreeAccessModeError] = useState<string | null>(null);
  useEffect(() => {
    setIsSettingCommunityFreeAccessMode(false);
    setCommunityFreeAccessModeError(null);
  }, [activeCommunityId]);
  const {
    communityDirectoryMembers,
    communityDirectoryMemberCount,
    isLoadingCommunityDirectoryMembers,
    isLoadingMoreCommunityDirectoryMembers,
    communityDirectoryMembersHasMore,
    communityDirectoryMembersLoadError,
    loadCommunityDirectoryMembers,
    loadMoreCommunityDirectoryMembers,
  } = useCommunityDirectoryController<AuthSession>({
    activeCommunityId,
    ...authenticatedSessionArg,
  });
  const {
    activeCommunityAccess,
    isLoadingCommunityAccess,
    communityAccessCapabilities,
    communityNavVisibility,
    communityActionGuards,
    isActiveCommunityOwner,
    isActiveCommunityAdmin,
    communitySettingsLayer,
    canManageCommunitySettings,
    canDeleteActiveCommunity,
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
  } = useWebActiveCommunityShellController<AuthSession>({
    activeCommunityId,
    session: session,
    ensureSession: ensureUsableAuthSession,
  });
  canMentionEverybodyRef.current = canManageMembersActiveCommunity;

  useEffect(() => {
    if (activePage !== "community") return;
    if (!activeCommunityId) return;
    if (isLoadingCommunityAccess) return;
    if (activeCommunityAccess?.community_id !== activeCommunityId) return;
    const normalizedTab = normalizeCommunityTabForAccess(communityTab, {
      canViewSettings: canViewActiveCommunitySettings,
      canViewPolynet: canViewActiveCommunityPolynet,
      canManageMembers: canManageMembersActiveCommunity,
      canViewAnalytics: canViewActiveCommunityAnalytics,
    });
    if (normalizedTab === communityTab) return;
    setCommunityResourceModuleId(null);
    applyCommunityShellState({ communityTab: normalizedTab });
    if (isCommunityLaunchSetupRoutePath(window.location.pathname)) {
      const normalizedPath = buildCommunityTabPath(
        selectedActiveCommunitySlug,
        normalizedTab,
      );
      if (normalizedPath) navigateTo(normalizedPath, { replace: true });
    }
  }, [
    activeCommunityAccess,
    activeCommunityId,
    activePage,
    applyCommunityShellState,
    canManageMembersActiveCommunity,
    canViewActiveCommunityAnalytics,
    canViewActiveCommunityPolynet,
    canViewActiveCommunitySettings,
    communityTab,
    isLoadingCommunityAccess,
    selectedActiveCommunitySlug,
  ]);

  const communityTypingUsers = useCommunityTypingPresence({
    isEnabled: activePage === "community" && communityTab === "chat" && Boolean(activeCommunityId),
    session,
    ensureSession: ensureUsableAuthSession,
    activeCommunityId,
    canPostMessages: canPostMessagesActiveCommunity,
    inputValue: communityMessageInput,
  });
  // Thread-scoped typing signal (the thread reply composer lives in the panel, so it
  // pings this throttled callback with the open thread's rootId).
  const threadTypingLastSentRef = useRef(0);
  const signalThreadTyping = useCallback((rootId: string) => {
    const communityId = activeCommunityId;
    if (!session || !communityId || !rootId || !canPostMessagesActiveCommunity) return;
    const now = Date.now();
    if (now - threadTypingLastSentRef.current < 600) return;
    threadTypingLastSentRef.current = now;
    void (async () => {
      try {
        const usable = await ensureUsableAuthSession(session);
        if (!usable) return;
        await setCloudCommunityTyping({ session: usable, communityId, rootId });
      } catch {
        // Soft failure: the reply still sends through the mutation path.
      }
    })();
  }, [session, activeCommunityId, canPostMessagesActiveCommunity, ensureUsableAuthSession]);
  const communityAttentionCommunityIds = useMemo(
    () => communities.map((community) => community.id),
    [communities],
  );
  const { attentionByCommunityId, markCommunitySurfaceSeen } = useCommunityAttentionController<AuthSession>({
    session,
    ensureSession: ensureUsableAuthSession,
    communityIds: communityAttentionCommunityIds,
  });
  // Canonical-chat "new messages" divider boundary: frozen on open, advanced on leave.
  const [chatDividerBoundary, setChatDividerBoundary] = useState<number | null>(null);
  const chatDividerCapturedForRef = useRef<string | null>(null);
  const activeChatCommunityRef = useRef<string | null>(null);
  useEffect(() => {
    if (!(activePage === "community" && communityTab === "chat" && activeCommunityId)) return;
    if (chatDividerCapturedForRef.current === activeCommunityId) return;
    const indicators = attentionByCommunityId[activeCommunityId];
    if (!indicators) return;
    chatDividerCapturedForRef.current = activeCommunityId;
    setChatDividerBoundary(
      typeof indicators.chat_last_seen_at === "number" ? indicators.chat_last_seen_at : null,
    );
  }, [activePage, communityTab, activeCommunityId, attentionByCommunityId]);
  useEffect(() => {
    const onChatCommunity =
      activePage === "community" && communityTab === "chat" && activeCommunityId ? activeCommunityId : null;
    const previous = activeChatCommunityRef.current;
    if (previous && previous !== onChatCommunity) {
      if (session) {
        void markCloudCommunityChatReadAt({
          session,
          communityId: previous,
          seenAtMs: Date.now(),
        }).catch(() => {});
      }
      chatDividerCapturedForRef.current = null;
      setChatDividerBoundary(null);
    }
    activeChatCommunityRef.current = onChatCommunity;
  }, [activePage, communityTab, activeCommunityId, session]);
  // Advance the read boundary while actively viewing + caught up (so a refresh can't
  // re-show already-read messages). The on-screen divider stays frozen for the session.
  const chatReadAdvanceTimerRef = useRef<number | null>(null);
  const handleChatCaughtUp = useCallback(() => {
    if (!activeCommunityId || !session) return;
    if (chatReadAdvanceTimerRef.current !== null) return;
    const communityId = activeCommunityId;
    const currentSession = session;
    chatReadAdvanceTimerRef.current = window.setTimeout(() => {
      chatReadAdvanceTimerRef.current = null;
      void markCloudCommunityChatReadAt({
        session: currentSession,
        communityId,
        seenAtMs: Date.now(),
      }).catch(() => {});
    }, 2000);
  }, [activeCommunityId, session]);
  useEffect(() => {
    const advanceOnHide = () => {
      if (document.visibilityState !== "hidden") return;
      const communityId = activeChatCommunityRef.current;
      if (communityId && session) {
        void markCloudCommunityChatReadAt({
          session,
          communityId,
          seenAtMs: Date.now(),
        }).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", advanceOnHide);
    window.addEventListener("pagehide", advanceOnHide);
    return () => {
      document.removeEventListener("visibilitychange", advanceOnHide);
      window.removeEventListener("pagehide", advanceOnHide);
    };
  }, [session]);

  const {
    loadCommunityResources,
    loadCommunityResourceContent,
    resourceDirectoryLimit,
    resourceDirectoryTruncated,
    resourceDirectoryError,
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
    setShowResourceModal,
    setEditingResourceId,
    setResourceTitleInput,
    setResourceUrlInput,
    setResourceBodyInput,
    setResourcePinnedInput,
    setResourceError,
    setIsSavingResource,
    resourceModalProps,
    resourceModuleModalProps,
    resourceModuleDeleteModalProps,
  } = useWebCommunityResourceUiController<AuthSession, CommunityResource, CommunityResourceModule>({
    activeCommunityId,
    session: session,
    ensureSession: ensureUsableAuthSession,
    parseEmbedUrl,
    communityResources,
    communityResourceModules,
    setCommunityResources,
    setCommunityResourceModules,
    setIsLoadingResources,
  });
  const loadCommunityLaunchKnowledgeSources = useCallback(async (
    communityId: string,
    currentSession: AuthSession,
  ): Promise<void> => {
    const result = await listCloudCommunityLaunchKnowledgeSources({
      session: currentSession,
      communityId,
      limit: 100,
    });
    const sources = result.sources ?? [];
    setCommunityLaunchLinkSources(
      sources.filter((source) => source.source_ingestion_kind === "url"),
    );
    setCommunityLaunchFileSources(
      sources.filter((source) => source.source_ingestion_kind === "file"),
    );
    setCommunityLaunchGoogleDriveSources(
      sources.filter((source) => source.source_external_provider === "google_drive"),
    );
    setCommunityLaunchGitHubSources(
      sources.filter((source) => source.source_external_provider === "github"),
    );
  }, []);
  const {
    loadCommunityEvents,
    handleSaveCommunityEvent,
    handleCancelCommunityEvent,
  } = useCommunityEventsController<AuthSession>({
    activeCommunityId,
    session,
    ensureSession: ensureUsableAuthSession,
    setCommunityEvents,
    setIsLoadingCommunityEvents,
    setCommunityEventsError,
    invalidateCommunityEventsCache: invalidateCommunityEventsCacheForCommunity,
  });

  const [communityAnalyticsSummary, setCommunityAnalyticsSummary] = useState<CommunityAnalyticsSummary>({
    total_members: null,
    page_visits_window: null,
    new_members_window: null,
    conversion_rate_window: null,
    mrr_base_units: null,
    currency: null,
    currency_decimals: null,
    active_members_window: null,
    retention_window: null,
    total_resources: null,
    resources_added_window: null,
  });
  const [communityAnalyticsSeries, setCommunityAnalyticsSeries] = useState<CommunityAnalyticsSeries>({
    visits: [],
    members: [],
    revenue: [],
  });
  const [communityAnalyticsRange, setCommunityAnalyticsRange] = useState<AnalyticsRange>(() => {
    try {
      const stored = readFirstLocalStorageValue([
        COMMUNITY_ANALYTICS_RANGE_STORAGE_KEY,
        LEGACY_COMMUNITY_ANALYTICS_RANGE_STORAGE_KEY,
      ]);
      if (stored && ["7d", "30d", "90d", "1y", "all"].includes(stored)) {
        return stored as AnalyticsRange;
      }
    } catch {
      // ignore
    }
    return "30d";
  });
  const [isLoadingCommunityAnalytics, setIsLoadingCommunityAnalytics] = useState(false);
  const [communityAnalyticsError, setCommunityAnalyticsError] = useState<string | null>(null);

  const communitySettingsUi = useWebCommunitySettingsUiController();
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
  const communityAgentConfigUi = useWebCommunityAgentConfigUiController();
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
  const {
    communityAppMounts,
    isLoadingCommunityAppMounts,
    communityAppMountError,
    communityAppMutationError,
    updatingCommunityAppMountId,
    refreshingCommunityAppMountId,
    removingCommunityAppMountId,
    communityAppMountsLoadedCommunityIdRef,
    clearCommunityAppMounts,
    loadCommunityAppMounts,
    updateCommunityAppMount,
    refreshCommunityApp,
    setupImportedCommunityMcpApp,
    unmountCommunityApp,
  } = useWebCommunityAppsController<AuthSession>({
    activeCommunityId,
    session,
    ensureSession: ensureUsableAuthSession,
  });
  const {
    userPlatformAppMounts,
    isLoadingUserPlatformAppMounts,
    userPlatformAppMountError,
    isConnectingUserPlatformApp,
    userPlatformAppMutationError,
    updatingUserPlatformAppMountId,
    refreshingUserPlatformAppMountId,
    reconnectingUserPlatformAppMountId,
    removingUserPlatformAppMountId,
    userPlatformAppMountsLoadedUserIdRef,
    clearUserPlatformAppMounts,
    loadUserPlatformAppMounts,
    connectUserPlatformApp,
    beginUserPlatformAppOAuth,
    finalizeUserPlatformAppOAuth,
    updateUserPlatformAppMount,
    refreshUserPlatformApp,
    setupImportedCommunityMcpUserHarness,
    reconnectUserPlatformApp,
    unmountUserPlatformApp,
  } = useWebUserPlatformAppMountsController<AuthSession>({
    session,
    ensureSession: ensureUsableAuthSession,
  });
  const {
    effectiveMcpApps,
    setEffectiveMcpApps,
    isLoadingEffectiveMcpApps,
    effectiveMcpAppsError,
    effectiveMcpAppsLoadedKeyRef,
    clearEffectiveMcpApps,
    loadEffectiveMcpApps,
  } = useWebEffectiveMcpAppsController<AuthSession>({
    activeCommunityId,
    session,
    ensureSession: ensureUsableAuthSession,
  });
  const {
    effectiveSkills,
    isLoadingEffectiveSkills,
    effectiveSkillsError,
    effectiveSkillsLoadedKeyRef,
    clearEffectiveSkills,
    loadEffectiveSkills,
  } = useWebEffectiveSkillsController<AuthSession>({
    activeCommunityId,
    session,
    ensureSession: ensureUsableAuthSession,
  });
  const {
    userPlatformSkills,
    isLoadingUserPlatformSkills,
    userPlatformSkillError,
    isCreatingUserPlatformSkill,
    userPlatformSkillMutationError,
    updatingUserPlatformSkillInstallId,
    removingUserPlatformSkillInstallId,
    userPlatformSkillsLoadedUserIdRef,
    clearUserPlatformSkills,
    loadUserPlatformSkills,
    createUserPlatformSkill,
    saveUserPlatformSkill,
    updateUserPlatformSkill,
    deleteUserPlatformSkill,
  } = useWebUserPlatformSkillsController<AuthSession>({
    session,
    ensureSession: ensureUsableAuthSession,
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
    communitySkillAttachmentsLoadedCommunityIdRef,
    ownedSkillPackagesLoadedRef,
    clearCommunitySkillAttachments,
    loadCommunitySkillAttachments,
    loadOwnedSkillPackages,
    createPersonalSkillAndAttach,
    attachSkillPackageToCommunity,
    updateCommunitySkillAttachment,
    detachCommunitySkill,
  } = useWebCommunitySkillAttachmentsController<AuthSession>({
    activeCommunityId,
    session,
    ensureSession: ensureUsableAuthSession,
  });

  const communityAdminUi = useWebCommunityAdminUiController();
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

  const [threads, setThreads] = useState<ThreadRecord[]>([]);
  const initialWorkspaceWantsNewChat = true;
  const [workspaceWantsNewChat, setWorkspaceWantsNewChat] = useState<boolean>(initialWorkspaceWantsNewChat);
  const workspaceWantsNewChatRef = useRef<boolean>(initialWorkspaceWantsNewChat);
  const setWorkspaceWantsNewChatMode = (next: SetStateAction<boolean>) => {
    setWorkspaceWantsNewChat((prev) => {
      const resolved = typeof next === "function" ? (next as (prevState: boolean) => boolean)(prev) : next;
      workspaceWantsNewChatRef.current = resolved;
      return resolved;
    });
  };
  const activeThreadProjectId = useMemo(() => {
    if (!activeThreadId || workspaceWantsNewChat) return null;
    const projectId = threads.find((thread) => thread.id === activeThreadId)?.project_id;
    return String(projectId ?? "").trim() || null;
  }, [activeThreadId, threads, workspaceWantsNewChat]);

  const isLikelyMobileDevice = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const userAgent = navigator.userAgent || "";
    const platform = navigator.platform || "";
    return (
      /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(userAgent) ||
      (/iPad|Macintosh/i.test(platform) && navigator.maxTouchPoints > 1)
    );
  }, []);

  function navigateTo(path: string, opts: { replace?: boolean; state?: unknown } = {}) {
    const nextPath = applyShellVariantToKnownPath(path, shellVariant);
    const historyState = opts.state ?? {};
    if (opts.replace) {
      window.history.replaceState(historyState, document.title, nextPath);
    } else {
      window.history.pushState(historyState, document.title, nextPath);
    }
    applyLocationToState();
  }

  async function resolveMemberEntryDestination(options?: {
    session?: AuthSession | null;
    communityId?: string | null;
    communitySlug?: string | null;
  }): Promise<CloudMemberEntryDestination | null> {
    const activeSession = options?.session ?? sessionRef.current ?? session;
    if (!activeSession) return null;
    const authSubject = resolveAuthSubject(activeSession);
    if (!authSubject) return null;
    const isDefaultDestination = !options?.communityId && !options?.communitySlug;
    if (
      isDefaultDestination &&
      defaultMemberEntryResolutionRef.current?.authSubject === authSubject
    ) {
      return await defaultMemberEntryResolutionRef.current.promise;
    }
    const request = resolveCloudMemberEntryDestination<AuthSession>({
      session: activeSession,
      communityId: options?.communityId ?? null,
      communitySlug: options?.communitySlug ?? null,
    });
    if (isDefaultDestination) {
      defaultMemberEntryResolutionRef.current = { authSubject, promise: request };
    }
    try {
      return await request;
    } catch (error) {
      console.warn("[member-entry] destination resolution failed:", error);
      return null;
    } finally {
      if (
        isDefaultDestination &&
        defaultMemberEntryResolutionRef.current?.promise === request
      ) {
        defaultMemberEntryResolutionRef.current = null;
      }
    }
  }

  function applyMemberEntryDestination(
    destination: CloudMemberEntryDestination,
    options?: { replace?: boolean },
  ): void {
    if (destination.page === "discover") {
      applyCommunityShellState({
        communityId: null,
        communitySlug: null,
        communityTab: "chat",
      });
      navigateTo("/discover", { replace: options?.replace !== false });
      return;
    }

    const path = buildCommunityTabPath(destination.community_slug, "chat");
    if (!path) throw new Error("community_destination_path_required");
    syncCommunitySelection({
      communityId: destination.community_id,
      communitySlug: destination.community_slug,
    });
    setPublicRoute({ kind: "app" });
    navigateTo(path, { replace: options?.replace !== false });

    const activeSession = sessionRef.current ?? session;
    if (activeSession) {
      void loadCommunities(activeSession).catch(() => {
        // Destination access is already authoritative; this refresh is best effort.
      });
    }
  }

  async function resolveAndEnterMemberDestination(options?: {
    session?: AuthSession | null;
    communityId?: string | null;
    communitySlug?: string | null;
    replace?: boolean;
  }): Promise<boolean> {
    const destination = await resolveMemberEntryDestination(options);
    if (!destination) return false;
    applyMemberEntryDestination(destination, { replace: options?.replace });
    return true;
  }

  async function loadProfileForOnboarding(activeSession: AuthSession): Promise<UserProfileDetail | null> {
    const userId = resolveAuthSubject(activeSession);
    if (!userId) return null;
    const row = await resolveCloudOnboardingProfileDetail<AuthSession, UserProfileDetail>({
      session: activeSession,
      userId,
    });
    setHasLoadedOnboardingProfile(true);
    if (row) {
      setCloudProfile(row);
      if (row.account_setup) setAccountSetupStatus(row.account_setup);
      profileUi.applyLoadedProfileToLocal(row);
    }
    return row;
  }

  /* Incomplete accounts with no community context onboard on the standalone
     platform bridge page — the single seam for platform-generic onboarding.
     (Membership in the Polynet home community still happens via auto-join;
     this is presentation only.) */
  function redirectIncompleteAccountToPlatformBridge(): void {
    navigateTo("/onboarding");
  }

  async function routeTryPolynetFree(activeSession: AuthSession | null = sessionRef.current ?? session): Promise<void> {
    if (!activeSession) {
      requireSignIn({ reason: "try_polynet_free", payload: {} });
      return;
    }

    try {
      const row = await loadProfileForOnboarding(activeSession);
      if (row?.account_setup?.completed) {
        setIsOnboardingModalOpen(false);
        const entered = await resolveAndEnterMemberDestination({
          session: activeSession,
          replace: true,
        });
        if (!entered) {
          setOnboardingError("We could not open your community. Try again.");
          navigateTo("/discover", { replace: true });
        }
        return;
      }
    } catch {
      /* Unknown setup state — the bridge collects everything from scratch. */
    }
    redirectIncompleteAccountToPlatformBridge();
  }

  async function finishOnboarding(options?: { navigate?: boolean }): Promise<boolean> {
    const shouldNavigate = options?.navigate !== false;
    const activeSession = await ensureUsableAuthSession();
    if (!activeSession) {
      requireSignIn({ reason: "try_polynet_free", payload: {} });
      return false;
    }

    const userId = resolveAuthSubject(activeSession);
    if (!userId) {
      setOnboardingError("We could not verify your account. Sign in again to continue.");
      return false;
    }

    const displayName = profileUi.profileName.trim() || null;
    const handle = profileUi.profileHandle.trim() || null;
    const bio = profileUi.profileBio.trim() || null;
    const avatarUrl = profileUi.profileAvatarUrl?.trim() || null;
    if (!displayName || !handle || !avatarUrl) {
      setOnboardingError("Add your display name, handle, and profile photo to continue.");
      return false;
    }
    /* Legal acceptance is judged by the server-loaded status below — never by
       render-closure state, which is stale when a save just landed. */

    setIsSavingOnboarding(true);
    setOnboardingError(null);
    try {
      const latestSetup = await loadCloudAccountSetupStatus<AuthSession>({
        session: activeSession,
      });
      if (latestSetup) setAccountSetupStatus(latestSetup);
      if (!latestSetup?.completed) {
        setOnboardingError(formatAccountSetupMissingGuidance(latestSetup));
        if (shouldNavigate) setIsOnboardingModalOpen(true);
        return false;
      }
      const avatarField = await prepareCloudProfileAvatarField<AuthSession>({
        session: activeSession,
        nextValue: profileUi.profileAvatarUrl,
        currentStorageId: profileUi.profileAvatarStorageId,
        currentResolvedUrl: profileUi.profileAvatarUrl,
      });
      const saved = await upsertCloudProfileDetail<AuthSession, UserProfileDetail>({
        session: activeSession,
        userId,
        displayName,
        handle,
        avatarStorageId: avatarField.storageId ?? null,
        avatarUrl: avatarField.url ?? null,
        avatarFocusX: profileUi.profileAvatarFocusX,
        avatarFocusY: profileUi.profileAvatarFocusY,
        avatarZoom: profileUi.profileAvatarZoom,
        bio,
        socialLinks: profileUi.profileSocialLinks,
        completeOnboarding: true,
      });
      if (saved) {
        setCloudProfile(saved);
        if (saved.account_setup) setAccountSetupStatus(saved.account_setup);
        setHasLoadedOnboardingProfile(true);
        setIsOnboardingModalOpen(false);
        profileUi.setProfileName(saved.display_name ?? "");
        profileUi.setProfileHandle(saved.handle ?? "");
        profileUi.setProfileBio(saved.bio ?? "");
        profileUi.setProfileSocialLinks(saved.social_links ?? {
          youtube: "",
          x: "",
          instagram: "",
        });
        profileUi.setProfileAvatarUrl(saved.avatar_url ?? null);
        profileUi.setProfileAvatarStorageId(saved.avatar_storage_id ?? null);
        profileUi.setProfileAvatarFocusX(saved.avatar_focus_x ?? 0.5);
        profileUi.setProfileAvatarFocusY(saved.avatar_focus_y ?? 0.5);
        profileUi.setProfileAvatarZoom(saved.avatar_zoom ?? 1);
      }

      if (shouldNavigate) {
        const entered = await resolveAndEnterMemberDestination({
          session: activeSession,
          replace: true,
        });
        if (!entered) {
          setOnboardingError("We could not open your community. Try again.");
          return false;
        }
      }
      return true;
    } catch (error) {
      const message = formatProfileMutationError(error, "Failed to save onboarding.");
      setOnboardingError(message);
      return false;
    } finally {
      setIsSavingOnboarding(false);
    }
  }

  /* One gatekeeper for every entry path (free join, paid checkout, enter
     click): incomplete setup on the funnel route opens the bridge instead of
     entering; everything else passes straight through. */
  function enterCommunityThroughBridge(entry: {
    communityId: string;
    communitySlug: string | null;
    communityName?: string | null;
  }): void {
    const setupStatus = accountSetupStatus ?? cloudProfile?.account_setup ?? null;
    if (publicRoute.kind === "community_funnel" && setupStatus && !setupStatus.completed) {
      const communityName =
        String(entry.communityName ?? "").trim() ||
        (activeCommunity?.id === entry.communityId ? activeCommunity.name : "") ||
        (publicCommunityUi.publicCommunityAccess?.community_id === entry.communityId
          ? publicCommunityUi.publicCommunity?.name ?? ""
          : "");
      setBridgePendingEntry({
        ...entry,
        communityName: communityName || null,
      });
      setIsBridgeGateOpen(true);
      return;
    }
    void resolveAndEnterMemberDestination({
      communityId: entry.communityId,
      communitySlug: entry.communitySlug,
      replace: true,
    });
  }

  /* Platform bridge Enter: save the deterministic account profile, then let
     the server resolve the canonical Polynet community destination. */
  async function completePlatformBridge(legalAcceptance: {
    termsOfServiceVersion: string;
    privacyPolicyVersion: string;
  } | null): Promise<boolean> {
    if (!validateOnboardingProfileInputs(legalAcceptance)) return false;
    const savedProfile = await saveOnboardingProfile(legalAcceptance);
    if (!savedProfile) return false;
    const finished = await finishOnboarding({ navigate: false });
    if (!finished) return false;
    const entered = await resolveAndEnterMemberDestination({ replace: true });
    if (!entered) {
      setOnboardingError("We could not open Polynet. Try again.");
      return false;
    }
    return true;
  }

  /* Community bridge Enter: save identity + legal, then revalidate the exact
     requested community before changing the route. */
  async function completeBridgeAndEnter(legalAcceptance: {
    termsOfServiceVersion: string;
    privacyPolicyVersion: string;
  } | null): Promise<boolean> {
    /* Approval applicants have nothing to run — the request is already in;
       the gate's "Request pending" state takes over once the bridge clears. */
    if (approvalPending) {
      const savedProfile = await saveOnboardingProfile(legalAcceptance);
      if (!savedProfile) return false;
      const finished = await finishOnboarding({ navigate: false });
      if (!finished) return false;
      setIsBridgeGateOpen(false);
      setBridgePendingEntry(null);
      return true;
    }
    if (!validateOnboardingProfileInputs(legalAcceptance)) return false;
    const entry = bridgePendingEntry ?? (
      activeCommunityId
        ? {
            communityId: activeCommunityId,
            communitySlug: selectedActiveCommunitySlug,
          }
        : null
    );
    if (!entry?.communityId) {
      setOnboardingError("We could not verify this community. Try again.");
      return false;
    }
    const savedProfile = await saveOnboardingProfile(legalAcceptance);
    if (!savedProfile) return false;
    const finished = await finishOnboarding({ navigate: false });
    if (!finished) return false;
    const destination = await resolveMemberEntryDestination({
      communityId: entry.communityId,
      communitySlug: entry.communitySlug,
    });
    if (!destination || destination.page !== "community") {
      setOnboardingError("We could not open this community. Try again.");
      return false;
    }
    setIsBridgeGateOpen(false);
    setBridgePendingEntry(null);
    applyMemberEntryDestination(destination, { replace: true });
    return true;
  }

  /* Client-side bridge validation, shared with saveOnboardingProfile: failures
     here keep the user on the bridge with inline errors. */
  function validateOnboardingProfileInputs(legalAcceptance: {
    termsOfServiceVersion: string;
    privacyPolicyVersion: string;
  } | null): boolean {
    const displayName = profileUi.profileName.trim();
    const handle = profileUi.profileHandle.trim() || null;
    const avatarUrl = profileUi.profileAvatarUrl?.trim() || null;
    if (!displayName || !handle || !avatarUrl) {
      setOnboardingError("Add your display name, handle, and profile photo to continue.");
      return false;
    }
    const currentSetup = accountSetupStatus ?? cloudProfile?.account_setup ?? null;
    if (currentSetup?.missing.includes("platform_legal") !== false && !legalAcceptance) {
      setOnboardingError("Agree to the Terms of Service and acknowledge the Privacy & AI Data Policy to continue.");
      return false;
    }
    return true;
  }

  async function saveOnboardingProfile(legalAcceptance: {
    termsOfServiceVersion: string;
    privacyPolicyVersion: string;
  } | null): Promise<boolean> {
    const activeSession = await ensureUsableAuthSession();
    if (!activeSession) {
      requireSignIn({ reason: "try_polynet_free", payload: {} });
      return false;
    }

    const userId = resolveAuthSubject(activeSession);
    if (!userId) {
      setOnboardingError("We could not verify your account. Sign in again to continue.");
      return false;
    }

    const displayName = profileUi.profileName.trim();
    const handle = profileUi.profileHandle.trim() || null;
    const bio = profileUi.profileBio.trim() || null;
    const avatarUrl = profileUi.profileAvatarUrl?.trim() || null;
    if (!validateOnboardingProfileInputs(legalAcceptance)) return false;

    setIsSavingOnboarding(true);
    setOnboardingError(null);
    try {
      const avatarField = await prepareCloudProfileAvatarField<AuthSession>({
        session: activeSession,
        nextValue: profileUi.profileAvatarUrl,
        currentStorageId: profileUi.profileAvatarStorageId,
        currentResolvedUrl: profileUi.profileAvatarUrl,
      });
      const saved = await upsertCloudProfileDetail<AuthSession, UserProfileDetail>({
        session: activeSession,
        userId,
        displayName,
        handle,
        avatarStorageId: avatarField.storageId ?? null,
        avatarUrl: avatarField.url ?? null,
        avatarFocusX: profileUi.profileAvatarFocusX,
        avatarFocusY: profileUi.profileAvatarFocusY,
        avatarZoom: profileUi.profileAvatarZoom,
        bio,
        socialLinks: profileUi.profileSocialLinks,
        markOnboardingDismissed: false,
        termsOfServiceVersion: legalAcceptance?.termsOfServiceVersion ?? null,
        privacyPolicyVersion: legalAcceptance?.privacyPolicyVersion ?? null,
      });
      if (saved) {
        setCloudProfile(saved);
        if (saved.account_setup) setAccountSetupStatus(saved.account_setup);
        setHasLoadedOnboardingProfile(true);
        profileUi.setProfileName(saved.display_name ?? "");
        profileUi.setProfileHandle(saved.handle ?? "");
        profileUi.setProfileBio(saved.bio ?? "");
        profileUi.setProfileSocialLinks(saved.social_links ?? {
          youtube: "",
          x: "",
          instagram: "",
        });
        profileUi.setProfileAvatarUrl(saved.avatar_url ?? null);
        profileUi.setProfileAvatarStorageId(saved.avatar_storage_id ?? null);
        profileUi.setProfileAvatarFocusX(saved.avatar_focus_x ?? 0.5);
        profileUi.setProfileAvatarFocusY(saved.avatar_focus_y ?? 0.5);
        profileUi.setProfileAvatarZoom(saved.avatar_zoom ?? 1);
      }
      return true;
    } catch (error) {
      const message = formatProfileMutationError(error, "Failed to save your profile.");
      setOnboardingError(message);
      return false;
    } finally {
      setIsSavingOnboarding(false);
    }
  }

  const applyAppRouteState = useCallback((nextAppRoute: AppRouteState) => {
    const normalizedCommunitySlug = String(nextAppRoute.communitySlug ?? "").trim() || null;
    setActivePage(nextAppRoute.page);
    setActiveView("home");
    setSettingsPage(nextAppRoute.settingsPage);
    if (nextAppRoute.page === "docs") {
      setSelectedProductDocSlug(nextAppRoute.docsSlug ?? null);
    }
    if (nextAppRoute.page === "operator") {
      setActiveOperatorTab(nextAppRoute.operatorTab ?? "platform");
    }
    if (nextAppRoute.page === "community") {
      setCommunityExperienceMode(nextAppRoute.communityExperienceMode ?? "standard");
      applyCommunityShellState({
        communitySlug: normalizedCommunitySlug,
        communityTab: nextAppRoute.communityTab,
      });
      setCommunityResourceModuleId(
        nextAppRoute.communityTab === "resources" ? nextAppRoute.communityResourceModuleId ?? null : null,
      );
      setCommunitySettingsPane(
        nextAppRoute.communityTab === "settings" ? nextAppRoute.communitySettingsPane ?? "community" : "community",
      );
    } else {
      setCommunityExperienceMode("standard");
      setCommunityResourceModuleId(null);
      setCommunitySettingsPane("community");
    }
  }, [applyCommunityShellState]);

  const applyLocationToState = useCallback(() => {
    setShellVariant(readShellVariantFromPathname(window.location.pathname || "/"));
    const nextPublicRoute = readPublicRouteFromLocation();
    setPublicRoute(nextPublicRoute);
    if (nextPublicRoute.kind !== "app") return nextPublicRoute;
    applyAppRouteState(readAppRouteFromLocation());
    return nextPublicRoute;
  }, [applyAppRouteState]);

  const queueCommunityLaunchKnowledgeOAuthRestore = useCallback((context?: {
    shouldRestore?: boolean;
    communityId?: string | null;
    communitySlug?: string | null;
    provider?: "google_drive" | "github" | null;
    state?: string | null;
    createdAt?: number | null;
  }) => {
    const restoredCommunityId =
      normalizeLaunchOAuthContextParam(context?.communityId) ??
      normalizeLaunchOAuthContextParam(activeCommunityId);
    const restoredCommunitySlug =
      normalizeLaunchOAuthContextParam(context?.communitySlug) ??
      normalizeLaunchOAuthContextParam(selectedActiveCommunitySlug ?? activeCommunity?.slug);
    const restoreContext: CommunityLaunchKnowledgeOAuthContext = {
      shouldRestore: context?.shouldRestore !== false,
      provider: context?.provider ?? null,
      state: normalizeLaunchOAuthContextParam(context?.state, 500),
      communityId: restoredCommunityId,
      communitySlug: restoredCommunitySlug,
      createdAt: context?.createdAt ?? Date.now(),
    };
    if (!restoreContext.shouldRestore) return;
    if (restoredCommunitySlug) {
      const routePath = buildCommunityLaunchSetupRoutePath({
        step: "knowledge",
        communityId: restoredCommunityId,
        communitySlug: restoredCommunitySlug,
      });
      const nextPath = applyShellVariantToKnownPath(routePath, shellVariant);
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextPath !== currentPath && !window.location.search.includes("source_integration_oauth=")) {
        window.history.replaceState(window.history.state ?? {}, document.title, nextPath);
        applyLocationToState();
      }
      applyCommunityShellState({
        communityId: restoredCommunityId,
        communitySlug: restoredCommunitySlug,
        communityTab: "settings",
      });
    } else if (restoredCommunityId) {
      applyCommunityShellState({
        communityId: restoredCommunityId,
        communityTab: "chat",
      });
    }
    setIsCommunityLaunchCreateMode(false);
    setPendingCommunityLaunchKnowledgeOAuthContext(restoreContext);
  }, [
    activeCommunity?.slug,
    activeCommunityId,
    applyCommunityShellState,
    applyLocationToState,
    selectedActiveCommunitySlug,
    shellVariant,
  ]);

  const resolveCommunityLaunchSetupRouteStep = useCallback((
    step?: CommunityLaunchSetupStep | string | null,
  ): CommunityLaunchSetupStep => {
    return parseCommunityLaunchSetupRouteStep(step) ??
      parseCommunityLaunchSetupRouteStep(communityLaunchSetupStatus?.current_step) ??
      "profile";
  }, [communityLaunchSetupStatus?.current_step]);

  const replaceCommunityLaunchSetupRouteState = useCallback((
    step?: CommunityLaunchSetupStep | string | null,
    target?: { communityId?: string | null; communitySlug?: string | null },
  ) => {
    const nextStep = resolveCommunityLaunchSetupRouteStep(step);
    const communityId = normalizeLaunchOAuthContextParam(target?.communityId) ??
      normalizeLaunchOAuthContextParam(activeCommunityId);
    const communitySlug = normalizeLaunchOAuthContextParam(
      target?.communitySlug ?? selectedActiveCommunitySlug ?? activeCommunity?.slug,
    );
    if (!communityId && !communitySlug) return;
    const routePath = buildCommunityLaunchSetupRoutePath({
      step: nextStep,
      communityId,
      communitySlug,
    });
    const nextPath = applyShellVariantToKnownPath(routePath, shellVariant);
    const currentPath = `${window.location.pathname}${window.location.search}`;
    if (nextPath !== currentPath) {
      window.history.replaceState(window.history.state ?? {}, document.title, nextPath);
      applyLocationToState();
    }
  }, [
    activeCommunity?.slug,
    activeCommunityId,
    applyLocationToState,
    resolveCommunityLaunchSetupRouteStep,
    selectedActiveCommunitySlug,
    shellVariant,
  ]);

  const clearCommunityLaunchSetupRouteState = useCallback(() => {
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const currentUrl = new URL(window.location.href);
    const setupContext = readCommunityLaunchSetupRouteContext(
      currentUrl.searchParams,
      currentUrl.pathname,
    );
    const pathWithoutLaunchParams = buildPathWithSearchParamsRemoved({
      pathname: currentUrl.pathname,
      search: currentUrl.search,
      hash: currentUrl.hash,
      paramNames: COMMUNITY_LAUNCH_SETUP_ROUTE_PARAM_NAMES,
      dropHash: true,
    });
    if (setupContext.shouldRestore) {
      const communitySlug = normalizeLaunchOAuthContextParam(
        selectedActiveCommunitySlug ?? activeCommunity?.slug ?? setupContext.communitySlug,
      );
      const routePath =
        buildCommunityTabPath(communitySlug, "settings", null, "community") ??
        "/discover";
      const nextPath = applyShellVariantToKnownPath(routePath, shellVariant);
      if (nextPath !== currentPath) {
        window.history.replaceState(window.history.state ?? {}, document.title, nextPath);
      }
    } else if (pathWithoutLaunchParams !== currentPath) {
      window.history.replaceState(window.history.state ?? {}, document.title, pathWithoutLaunchParams);
    }
    applyLocationToState();
  }, [
    activeCommunity?.slug,
    applyLocationToState,
    selectedActiveCommunitySlug,
    shellVariant,
  ]);

  useEffect(() => {
    if (!isAuthBootstrapComplete) return;
    if (!session) return;
    if (publicRoute.kind !== "app") return;
    if (activePage !== "landing") return;
    if (!isRootAppRoutePath(window.location.pathname || "/")) return;
    void routeTryPolynetFree(session);
  }, [activePage, isAuthBootstrapComplete, publicRoute.kind, session]);

  const legacyWorkspaceRedirectRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isAuthBootstrapComplete) return;
    if (publicRoute.kind !== "app") return;
    const pathname = window.location.pathname || "/";
    if (session && isCommunityLaunchSetupRoutePath(pathname)) return;
    const legacyContext = readLegacyWorkspaceRouteContext(pathname);
    if (!legacyContext) return;

    const redirectKey = `${resolveAuthSubject(session) ?? "signed-out"}:${pathname}`;
    if (legacyWorkspaceRedirectRef.current === redirectKey) return;
    legacyWorkspaceRedirectRef.current = redirectKey;

    if (!session) {
      navigateTo(
        legacyContext.communitySlug
          ? buildCommunityFunnelPath(legacyContext.communitySlug) ?? "/"
          : "/",
        { replace: true },
      );
      return;
    }

    void resolveAndEnterMemberDestination({
      session,
      communitySlug: legacyContext.communitySlug,
      replace: true,
    }).then((entered) => {
      if (entered) return;
      navigateTo(
        legacyContext.communitySlug
          ? buildCommunityFunnelPath(legacyContext.communitySlug) ?? "/discover"
          : "/discover",
        { replace: true },
      );
    });
  }, [isAuthBootstrapComplete, publicRoute.kind, session]);

  useEffect(() => {
    if (!isStandaloneWebApp()) return;
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get(STANDALONE_APP_LAUNCH_SEARCH_PARAM) !== STANDALONE_APP_LAUNCH_SEARCH_VALUE) {
      return;
    }

    currentUrl.searchParams.delete(STANDALONE_APP_LAUNCH_SEARCH_PARAM);
    const nextPath = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}` || "/";
    window.history.replaceState(window.history.state ?? {}, document.title, nextPath);
  }, []);

  /* (Deleted 2026-07-02: the standalone signed-out funnel deferral used to
     bounce /c/:slug to a workspace launch. The visitor lens made that
     backwards — a signed-out /c/ visit IS the community page now.) */

  useEffect(() => {
    if (activePage !== "onboarding") return;
    if (!isAuthBootstrapComplete) return;
    if (session) return;
    if (hasRecentAuthFlowPending()) return;
    requireSignIn({ reason: "try_polynet_free", payload: {} });
  }, [activePage, isAuthBootstrapComplete, requireSignIn, session]);

  useEffect(() => {
    if (activePage !== "onboarding") return;
    if (!session) return;
    void (async () => {
      const row = cloudProfile ?? (await loadProfileForOnboarding(session));
      if (row?.account_setup?.completed) {
        setIsOnboardingModalOpen(false);
        const entered = await resolveAndEnterMemberDestination({
          session,
          replace: true,
        });
        if (!entered) {
          setOnboardingError("We could not open your community. Try again.");
        }
      }
      /* Incomplete accounts stay: this route renders the standalone
         platform bridge page. */
    })();
  }, [activePage, cloudProfile, session]);

  const operatorRouteRedirectRef = useRef<string | null>(null);
  useEffect(() => {
    if (activePage !== "operator") {
      operatorRouteRedirectRef.current = null;
      return;
    }
    if (!isAuthBootstrapComplete) return;
    if (!session) {
      navigateTo("/", { replace: true });
      return;
    }
    if (!isOperatorAccessResolved) return;
    if (operatorAccess) return;

    const redirectKey = String(canonicalSessionUserId ?? "operator-denied");
    if (operatorRouteRedirectRef.current === redirectKey) return;
    operatorRouteRedirectRef.current = redirectKey;
    void resolveAndEnterMemberDestination({ session, replace: true }).then((entered) => {
      if (!entered) navigateTo("/discover", { replace: true });
    });
  }, [
    activePage,
    canonicalSessionUserId,
    isAuthBootstrapComplete,
    isOperatorAccessResolved,
    operatorAccess,
    session,
  ]);

  /* Deterministic timezone capture: record the browser's IANA zone silently,
     refreshed when it drifts from what the profile holds. Never a question. */
  const timezoneSyncRef = useRef(false);
  useEffect(() => {
    if (!session || !cloudProfile) return;
    if (timezoneSyncRef.current) return;
    let browserTimezone = "";
    try {
      browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    } catch {
      return;
    }
    if (!browserTimezone) return;
    timezoneSyncRef.current = true;
    const stored = (cloudProfile as { timezone?: string | null }).timezone ?? null;
    if (stored === browserTimezone) return;
    void recordMemberTimezoneRpc({ session, timezone: browserTimezone }).catch(() => null);
  }, [cloudProfile, session]);

  /* Load the viewer's profile + setup status wherever setup state matters. */
  useEffect(() => {
    const needsOnboardingProfile =
      activePage === "settings" ||
      activePage === "community" ||
      activePage === "onboarding" ||
      publicRoute.kind === "community_funnel";
    if (!needsOnboardingProfile) return;
    if (!isAuthBootstrapComplete) return;
    if (!session) return;
    if (cloudProfile) {
      setHasLoadedOnboardingProfile(true);
      return;
    }
    if (hasLoadedOnboardingProfile) {
      return;
    }
    void loadProfileForOnboarding(session);
  }, [
    activePage,
    cloudProfile,
    hasLoadedOnboardingProfile,
    isAuthBootstrapComplete,
    publicRoute.kind,
    session,
  ]);

  const shellPublicRoute: PublicRoute = publicRoute;
  const isSignedOutAppPresentation =
    shellPublicRoute.kind === "app" && authPresentationState === "signed_out";

  const navStackRef = useRef<NavSnapshot[]>([]);
  const readCurrentRoutePath = () =>
    `${window.location.pathname}${window.location.search}` || "/";
  const buildCurrentAppRoutePath = (): string | null =>
    applyShellVariantToAppPath(
      buildAppRoutePath({
        page: activePage,
        view: activeView,
        settingsPage,
        communitySlug: selectedActiveCommunitySlug,
        communityTab,
        communityResourceModuleId:
          activePage === "community" && communityTab === "resources" ? communityResourceModuleId : null,
        communitySettingsPane:
          activePage === "community" && communityTab === "settings" ? communitySettingsPane : null,
        docsSlug: activePage === "docs" ? selectedProductDocSlug : null,
        operatorTab: activePage === "operator" ? activeOperatorTab : null,
      }) ?? "",
      shellVariant,
    ) || null;
  const takeNavSnapshot = (): NavSnapshot => ({
    page: activePage,
    view: activeView,
    settingsPage,
    communitySlug: selectedActiveCommunitySlug,
    communityTab,
    routePath: buildCurrentAppRoutePath() ?? readCurrentRoutePath(),
  });
  const pushNavSnapshot = () => {
    const snapshot = takeNavSnapshot();
    pushUniqueNavSnapshot(navStackRef.current, snapshot);
  };
  const openGlobalSettings = (page: SettingsPage): void => {
    if (activePage === "settings" && settingsPage === page) return;
    if (activePage !== "settings") pushNavSnapshot();
    navigateTo(buildSettingsPath(page));
  };
  const openOperatorConsole = (tab: OperatorTab = "platform"): void => {
    if (!hasOperatorAccess) return;
    if (activePage !== "operator") pushNavSnapshot();
    navigateTo(`/operator/${tab}`);
  };
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
  });
  const syncWorkspaceSelection = useCallback(
    (opts: { threadId: string | null; wantsNewChat: boolean }): void => {
      setWorkspaceWantsNewChatMode(opts.wantsNewChat);
      setActiveThreadId(opts.threadId);
    },
    [],
  );
  const applyGuestWorkspaceState = useCallback(
    (opts: { guestThreadId: string; hasMessages: boolean }): void => {
      syncWorkspaceSelection({
        threadId: opts.hasMessages ? opts.guestThreadId : null,
        wantsNewChat: !opts.hasMessages,
      });
    },
    [syncWorkspaceSelection],
  );
  const adoptWorkspaceThreadSelection = useCallback(
    (thread: ThreadRecord): void => {
      const communityId = String(thread.community_id ?? "").trim() || null;
      if (communityId) {
        syncCommunitySelection({
          communityId,
          communitySlug: resolveKnownCommunitySlugById(communityId),
        });
      }
      syncWorkspaceSelection({
        threadId: thread.id,
        wantsNewChat: false,
      });
    },
    [
      resolveKnownCommunitySlugById,
      syncCommunitySelection,
      syncWorkspaceSelection,
    ],
  );
  const workspaceCore = useWebWorkspaceCoreController<AuthSession, ThreadRecord>({
    projectId: activeThreadProjectId,
    ensureSession: ensureUsableAuthSession,
    setActiveThreadId,
    setWorkspaceWantsNewChatMode,
    threads,
    setThreads,
    deriveThreadTitleFromUserText,
    isMissingThreadTitleValue,
    toEpochSeconds,
    activeCommunityId,
    activeModelId: DEFAULT_ACTIVE_MODEL_ID,
    activeRuntimeEngine,
    modelToggles: platformModelToggles,
    defaultActiveModelId: DEFAULT_ACTIVE_MODEL_ID,
  });
  const restoreNavSnapshot = (snapshot: NavSnapshot) => {
    const nextRoutePath = snapshot.routePath?.trim() || "/";
    navigateTo(nextRoutePath, { replace: true });
  };
  const goBack = (): boolean => {
    const snapshot = popDistinctNavSnapshot(navStackRef.current, readCurrentRoutePath());
    if (!snapshot) return false;
    restoreNavSnapshot(snapshot);
    return true;
  };

  const backTargetSnapshot = [...navStackRef.current].reverse()[0] ?? null;
  const backTargetLabel = backTargetSnapshot ? formatBackTargetLabelShared(backTargetSnapshot) : null;
  const effectiveBackTargetLabel = backTargetLabel;

  const threadsHydratedRef = useRef(false);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [loadingThreadMessagesThreadId, setLoadingThreadMessagesThreadId] = useState<string | null>(null);
  const [guestModelId, setGuestModelId] = useState<string>(() => loadGuestModelId());
  const [activeCommunityAgentLanding, setActiveCommunityAgentLanding] = useState<unknown | null>(null);
  const activeCommunityAgentLandingCommunityIdRef = useRef<string | null>(null);
  const activeCommunityIdRef = useRef<string | null>(null);
  const communityAgentLandingFetchSeqRef = useRef(0);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [threadSendingStateById, setThreadSendingStateById] = useState<Record<string, boolean>>({});
  const [threadStreamingStateById, setThreadStreamingStateById] = useState<
    Record<string, ThreadStreamingState<MemoryUsedItem, HistoryUsedItem, CommunityEvidenceUsedV1>>
  >({});
  const [runtimeEventsByRunId, setRuntimeEventsByRunId] = useState<Record<string, ThreadStreamingRuntimeEvent[]>>({});
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [memoryToast, setMemoryToast] = useState<string | null>(null);
  const memoryToastTimeoutRef = useRef<number | null>(null);
  const [inferenceToast] = useState<string | null>(null);
  const [appToast, setAppToast] = useState<string | null>(null);
  const appToastTimeoutRef = useRef<number | null>(null);
  const appOAuthFinalizeInFlightRef = useRef<string | null>(null);
  const sourceIntegrationOAuthFinalizeInFlightRef = useRef<string | null>(null);
  const lastShownAuthErrorRef = useRef<string | null>(null);
  const [previewAccessGateModal, setPreviewAccessGateModal] = useState<
    NonNullable<WebGlobalOverlayHostProps["previewAccessGateModalProps"]>["previewAccessGateModal"]
  >(null);
  const [isPreviewAccessGateRunning, setIsPreviewAccessGateRunning] = useState(false);
  const lastShownGuestPreviewIssueModalRef = useRef<string | null>(null);
  const [inferenceIssueModal, setInferenceIssueModal] = useState<{
    reason:
      | "quota"
      | "workspace_credits"
      | "plan"
      | "provider_connection_required"
      | "misconfigured"
      | "disabled"
      | "unavailable";
    threadId: string;
    mode: "respond" | "regenerate";
    message: string | null;
    toolKind?: PaidToolKind | null;
    requiredCredits?: number | null;
    paidUsageBillingMode?: PaidUsageBillingMode | null;
  } | null>(null);
  const [isInferenceIssueModalRunning] = useState(false);
  const [userMemorySettings, setUserMemorySettings] = useState<UserMemorySettings>({
    memory_mode: "auto",
    remember_intent_enabled: true,
    agent_name: "",
    agent_soul: "",
  });
  const [communityAiAgentPreferredTab, setCommunityAiAgentPreferredTab] = useState<
    "instructions" | "apps" | "skills"
  >("instructions");
  const [isLoadingUserMemorySettings, setIsLoadingUserMemorySettings] = useState(false);
  const [chatgptConnection, setChatgptConnection] = useState<CloudChatgptConnectionStatus>({
    provider: "chatgpt",
    auth_kind: "oauth_tokens",
    connected: false,
    email: null,
    account_id: null,
    access_token_expires_at: null,
    validated_at: null,
    updated_at: null,
  });
  const [openAiConnection, setOpenAiConnection] = useState<CloudOpenAiConnectionStatus>({
    provider: "openai",
    auth_kind: "api_key",
    connected: false,
    key_last_four: null,
    validated_at: null,
    updated_at: null,
  });
  const [isLoadingChatgptConnection, setIsLoadingChatgptConnection] = useState(false);
  const [contextModal, setContextModal] = useState<
    MessageContextModalPayload<MemoryUsedItem, HistoryUsedItem, MemorySuggestion> | null
  >(null);
  const focusWorkspaceComposer = useCallback(() => {
    workspaceComposerApiRef.current?.focus();
  }, []);
  const handleWorkspaceComposerDraftChange = useCallback((draft: WorkspaceComposerDraft) => {
    workspaceComposerDraftRef.current = draft;
  }, []);
  const handleRegisterWorkspaceComposerApi = useCallback((api: WorkspaceComposerApi | null) => {
    workspaceComposerApiRef.current = api;
    if (!api || workspaceStarterPromptConsumedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("starter") !== "platform") return;
    workspaceStarterPromptConsumedRef.current = true;
    api.appendTranscript(WORKSPACE_PLATFORM_STARTER_PROMPT);
    api.focus();
    params.delete("starter");
    const nextSearch = params.toString();
    const nextPath = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state ?? {}, document.title, nextPath);
  }, []);

  const persistCreateCommunityIntent = useCallback((draft: CreateCommunityIntentDraft): void => {
    storeAuthResumeState({
      intent: { reason: "create_community", payload: { draft } },
    });
  }, []);
  const closePreviewAccessGateModal = useCallback(() => {
    setPreviewAccessGateModal(null);
    setIsPreviewAccessGateRunning(false);
    if (readAuthResumeState()?.intent?.reason === "open_workspace_draft") {
      clearAuthResumeState();
    }
    setAuthError(null);
  }, [setAuthError]);
  const continuePreviewAccessGateAuth = useCallback(() => {
    setAuthError(null);
    setIsPreviewAccessGateRunning(true);
    requireSignIn({
      reason: "open_workspace_draft",
      payload: { project_id: null },
    });
  }, [requireSignIn, setAuthError]);

  useEffect(() => {
    if (!session) return;
    if (!previewAccessGateModal && !isPreviewAccessGateRunning) return;
    setPreviewAccessGateModal(null);
    setIsPreviewAccessGateRunning(false);
  }, [isPreviewAccessGateRunning, previewAccessGateModal, session]);

  useEffect(() => {
    if (session || !authError) return;
    if (readAuthResumeState()?.intent?.reason !== "open_workspace_draft") return;
    setPreviewAccessGateModal({ reason: "new_thread" });
    setIsPreviewAccessGateRunning(false);
  }, [authError, session]);

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

  useEffect(() => {
    setHasResolvedCommunities(false);
  }, [canonicalSessionUserId]);

  const enterJoinedCommunity = useCallback(
    (opts: { communityId: string; communitySlug?: string | null }) => {
      const communityId = String(opts.communityId ?? "").trim();
      if (!communityId) return;

      const resolvedSlug =
        String(opts.communitySlug ?? "").trim() || resolveKnownCommunitySlugById(communityId);

      syncCommunitySelection({
        communityId,
        communitySlug: resolvedSlug || null,
      });
      setPublicRoute({ kind: "app" });
      applyAppRouteState({
        page: "community",
        view: "home",
        settingsPage: "agent",
        communitySlug: resolvedSlug || null,
        communityTab: "chat",
      });

      const currentSession = sessionRef.current ?? session;
      if (currentSession) {
        void loadCommunities(currentSession).catch(() => {
          // Keep the route transition responsive; membership refresh can fail independently.
        });
      }
    },
    [
      applyAppRouteState,
      session,
      loadCommunities,
      resolveKnownCommunitySlugById,
      syncCommunitySelection,
    ],
  );

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
  const loadCommunityMemberBillingHistory = useCallback(async (membershipId: string) => {
    const usableSession = await ensureUsableAuthSession();
    const communityId = activeCommunityIdRef.current ?? activeCommunityId;
    if (!usableSession || !communityId) return null;
    return await fetchCloudCommunityMemberBillingHistory({
      session: usableSession,
      communityId,
      membershipId,
      limit: 20,
    });
  }, [activeCommunityId, ensureUsableAuthSession]);
  const reloadActiveCommunityDirectoryMembers = useCallback(async () => {
    const usableSession = await ensureUsableAuthSession();
    const communityId = activeCommunityIdRef.current ?? activeCommunityId;
    if (!usableSession || !communityId) return;
    await loadCommunityDirectoryMembers(communityId, usableSession);
  }, [activeCommunityId, ensureUsableAuthSession, loadCommunityDirectoryMembers]);
  const handleSetCommunityContextMemberRole = useCallback(async (
    membershipId: string,
    role: "admin" | "moderator" | "member",
  ) => {
    await handleSetCommunityMemberRole(membershipId, role);
    await reloadActiveCommunityDirectoryMembers();
  }, [handleSetCommunityMemberRole, reloadActiveCommunityDirectoryMembers]);
  const handleRemoveCommunityContextMember = useCallback(async (membershipId: string) => {
    await handleRemoveCommunityMember(membershipId);
    await reloadActiveCommunityDirectoryMembers();
  }, [handleRemoveCommunityMember, reloadActiveCommunityDirectoryMembers]);
  const handleBanCommunityContextMember = useCallback(async (membershipId: string) => {
    await handleBanCommunityMember(membershipId);
    await reloadActiveCommunityDirectoryMembers();
  }, [handleBanCommunityMember, reloadActiveCommunityDirectoryMembers]);
  const handleSetCommunityContextFreeAccessMode = useCallback(async (mode: "open" | "approval") => {
    const usableSession = await ensureUsableAuthSession();
    const communityId = activeCommunityIdRef.current ?? activeCommunityId;
    if (!usableSession || !communityId || !canManageMembersActiveCommunity) return;
    const isStillActiveCommunity = () =>
      (activeCommunityIdRef.current ?? activeCommunityId) === communityId;
    setCommunityFreeAccessModeError(null);
    setIsSettingCommunityFreeAccessMode(true);
    try {
      const result = await setCloudCommunityFreeAccessMode({
        session: usableSession,
        communityId,
        mode,
      });
      setCommunities((prev) =>
        prev.map((community) =>
          community.id === communityId
            ? {
                ...community,
                entry_policy: result?.entry_policy ?? mode,
                updated_at: result?.updated_at ?? community.updated_at,
              }
            : community,
        ),
      );
      const approvedPendingRequestCount = Math.max(
        0,
        Number(result?.approved_pending_request_count ?? 0) || 0,
      );
      if ((result?.entry_policy ?? mode) !== "approval" && isStillActiveCommunity()) {
        setCommunityJoinRequests([]);
      }
      if (approvedPendingRequestCount > 0 && isStillActiveCommunity()) {
        await loadCommunityDirectoryMembers(communityId, usableSession);
      }
    } catch (error) {
      if (!isStillActiveCommunity()) return;
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to update auto-join.";
      setCommunityFreeAccessModeError(message || "Failed to update auto-join.");
    } finally {
      if (isStillActiveCommunity()) {
        setIsSettingCommunityFreeAccessMode(false);
      }
    }
  }, [
    activeCommunityId,
    canManageMembersActiveCommunity,
    ensureUsableAuthSession,
    loadCommunityDirectoryMembers,
    setCommunityJoinRequests,
  ]);

  const {
    loadCommunityAgentConfig,
    handleSaveCommunityAgentConfig,
  } = useCommunityAgentConfigController<AuthSession, CommunityAgentLanding, CommunityAgentConfig>({
    activeCommunityId,
    ...authenticatedSessionArg,
    communityAgentConfigLanding,
    communityAgentConfigCommunitySystemPrompt,
    normalizeConfigForSave: normalizeCommunityAgentDraftForSave,
    hydrateConfigEditor: hydrateCommunityAgentEditor,
    setLoadedCommunityId: (communityId) => {
      communityAgentConfigLoadedCommunityIdRef.current = communityId;
    },
    markConfigClean: () => {
      communityAgentConfigDirtyRef.current = false;
    },
    setIsLoadingCommunityAgentConfig,
    setCommunityAgentConfigError,
    setIsSavingCommunityAgentConfig,
    setCommunityAgentConfigSaveError,
    saveValidationErrorMessage: "Add at least one onboarding prompt.",
    loadFailureMessage: "Failed to load AI agent config.",
    saveFailureMessage: "Failed to save AI agent changes.",
  });
  const reloadEffectiveMcpApps = useCallback(async () => {
    if (!session) {
      clearEffectiveMcpApps();
      return;
    }
    effectiveMcpAppsLoadedKeyRef.current = null;
    await loadEffectiveMcpApps(session);
  }, [
    clearEffectiveMcpApps,
    effectiveMcpAppsLoadedKeyRef,
    loadEffectiveMcpApps,
    session,
  ]);

  const reloadEffectiveSkills = useCallback(async () => {
    if (!session) {
      clearEffectiveSkills();
      return;
    }
    effectiveSkillsLoadedKeyRef.current = null;
    await loadEffectiveSkills(session);
  }, [
    clearEffectiveSkills,
    effectiveSkillsLoadedKeyRef,
    loadEffectiveSkills,
    session,
  ]);

  const handleConnectUserPlatformApp = useCallback(
    async (input: {
      catalog_app_id?: string;
      name: string;
      endpoint_url: string;
      auth_type: "none" | "api_key" | "bearer" | "oauth";
      description?: string;
      secret?: string;
    }) => {
      const result = await connectUserPlatformApp(input);
      if (result.ok || result.mount) void reloadEffectiveMcpApps();
      return result;
    },
    [connectUserPlatformApp, reloadEffectiveMcpApps],
  );

  const handleBeginUserPlatformAppOAuth = useCallback(
    async (
      catalogAppId: string,
      options?: {
        community_id?: string | null;
        community_app_mount_id?: string | null;
        endpoint_url?: string | null;
      },
    ) => {
      const result = await beginUserPlatformAppOAuth({
        catalogAppId,
        returnToPath: `${window.location.pathname}${window.location.search}`,
        community_id:
          options?.community_id ??
          (options?.community_app_mount_id ? activeCommunityId : undefined),
        community_app_mount_id: options?.community_app_mount_id,
        endpoint_url: options?.endpoint_url,
      });
      if (result.ok && result.authorize_url) {
        window.location.assign(result.authorize_url);
      }
      return result;
    },
    [activeCommunityId, beginUserPlatformAppOAuth],
  );

  const handleUpdateUserPlatformAppMount = useCallback(
    async (
      userPlatformAppMountId: string,
      patch: {
        enabled?: boolean;
        enabledTools?: string[];
      },
    ) => {
      const ok = await updateUserPlatformAppMount(userPlatformAppMountId, patch);
      if (ok) void reloadEffectiveMcpApps();
      return ok;
    },
    [reloadEffectiveMcpApps, updateUserPlatformAppMount],
  );

  const handleRefreshUserPlatformApp = useCallback(
    async (userPlatformAppMountId: string) => {
      const ok = await refreshUserPlatformApp(userPlatformAppMountId);
      if (ok) void reloadEffectiveMcpApps();
      return ok;
    },
    [refreshUserPlatformApp, reloadEffectiveMcpApps],
  );

  const handleReconnectUserPlatformApp = useCallback(
    async (userPlatformAppMountId: string, secret: string) => {
      const ok = await reconnectUserPlatformApp(userPlatformAppMountId, secret);
      if (ok) void reloadEffectiveMcpApps();
      return ok;
    },
    [reconnectUserPlatformApp, reloadEffectiveMcpApps],
  );

  const handleUnmountUserPlatformApp = useCallback(
    async (userPlatformAppMountId: string) => {
      const ok = await unmountUserPlatformApp(userPlatformAppMountId);
      if (ok) {
        setEffectiveMcpApps((prev) =>
          removePersonalMountFromEffectiveMcpApps(prev, userPlatformAppMountId),
        );
        void reloadEffectiveMcpApps();
      }
      return ok;
    },
    [reloadEffectiveMcpApps, setEffectiveMcpApps, unmountUserPlatformApp],
  );

  const handleUpdateCommunityAppMount = useCallback(
    async (
      communityAppMountId: string,
      patch: {
        enabled?: boolean;
        enabledTools?: string[];
      },
    ) => {
      const ok = await updateCommunityAppMount(communityAppMountId, patch);
      if (ok) void reloadEffectiveMcpApps();
      return ok;
    },
    [reloadEffectiveMcpApps, updateCommunityAppMount],
  );

  const handleUnmountCommunityApp = useCallback(
    async (communityAppMountId: string) => {
      const ok = await unmountCommunityApp(communityAppMountId);
      if (ok) void reloadEffectiveMcpApps();
      return ok;
    },
    [reloadEffectiveMcpApps, unmountCommunityApp],
  );

  const handleRefreshCommunityApp = useCallback(
    async (communityAppMountId: string) => {
      const ok = await refreshCommunityApp(communityAppMountId);
      if (ok) void reloadEffectiveMcpApps();
      return ok;
    },
    [refreshCommunityApp, reloadEffectiveMcpApps],
  );

  const handleSetupImportedCommunityMcpApp = useCallback(
    async (input: {
      community_app_mount_id: string;
      endpoint_url: string;
      auth_type: "none" | "api_key" | "bearer" | "oauth";
      secret?: string;
    }) => {
      if (input.auth_type !== "none") {
        if (!activeCommunityId) return false;
        const result = await setupImportedCommunityMcpUserHarness({
          community_id: activeCommunityId,
          community_app_mount_id: input.community_app_mount_id,
          endpoint_url: input.endpoint_url,
          auth_type: input.auth_type,
          secret: input.secret,
        });
        if (!result.ok) return false;
      }
      const ok = await setupImportedCommunityMcpApp({
        community_app_mount_id: input.community_app_mount_id,
        endpoint_url: input.endpoint_url,
        auth_type: input.auth_type,
      });
      if (!ok) return false;
      if (session) {
        userPlatformAppMountsLoadedUserIdRef.current = null;
        void loadUserPlatformAppMounts(session);
      }
      void reloadEffectiveMcpApps();
      return ok;
    },
    [
      activeCommunityId,
      loadUserPlatformAppMounts,
      reloadEffectiveMcpApps,
      session,
      setupImportedCommunityMcpUserHarness,
      setupImportedCommunityMcpApp,
      userPlatformAppMountsLoadedUserIdRef,
    ],
  );

  const handleCreateCommunitySkill = useCallback(
    async (input: CreateSkillPackageInput) => {
      const ok = await createPersonalSkillAndAttach(input);
      if (ok) void reloadEffectiveSkills();
      return ok;
    },
    [createPersonalSkillAndAttach, reloadEffectiveSkills],
  );

  const handleCreateUserPlatformSkill = useCallback(
    async (input: CreateSkillPackageInput) => {
      const ok = await createUserPlatformSkill(input);
      if (ok) void reloadEffectiveSkills();
      return ok;
    },
    [createUserPlatformSkill, reloadEffectiveSkills],
  );

  const handleUpdateUserPlatformSkill = useCallback(
    async (
      userPlatformSkillInstallId: string,
      patch: {
        enabled?: boolean;
      },
    ) => {
      const ok = await updateUserPlatformSkill(userPlatformSkillInstallId, patch);
      if (ok) void reloadEffectiveSkills();
      return ok;
    },
    [reloadEffectiveSkills, updateUserPlatformSkill],
  );

  const handleSaveUserPlatformSkill = useCallback(
    async (
      userPlatformSkillInstallId: string,
      input: CreateSkillPackageInput,
    ) => {
      const ok = await saveUserPlatformSkill(userPlatformSkillInstallId, input);
      if (ok) void reloadEffectiveSkills();
      return ok;
    },
    [reloadEffectiveSkills, saveUserPlatformSkill],
  );

  const handleDeleteUserPlatformSkill = useCallback(
    async (userPlatformSkillInstallId: string) => {
      const ok = await deleteUserPlatformSkill(userPlatformSkillInstallId);
      if (ok) void reloadEffectiveSkills();
      return ok;
    },
    [deleteUserPlatformSkill, reloadEffectiveSkills],
  );

  const handleAttachSkillPackageToCommunity = useCallback(
    async (skillPackageId: string) => {
      const ok = await attachSkillPackageToCommunity(skillPackageId);
      if (ok) void reloadEffectiveSkills();
      return ok;
    },
    [attachSkillPackageToCommunity, reloadEffectiveSkills],
  );

  const handleUpdateCommunitySkillAttachment = useCallback(
    async (
      communitySkillAttachmentId: string,
      patch: {
        enabled?: boolean;
      },
    ) => {
      const ok = await updateCommunitySkillAttachment(
        communitySkillAttachmentId,
        patch,
      );
      if (ok) void reloadEffectiveSkills();
      return ok;
    },
    [reloadEffectiveSkills, updateCommunitySkillAttachment],
  );

  const handleDetachCommunitySkill = useCallback(
    async (communitySkillAttachmentId: string) => {
      const ok = await detachCommunitySkill(communitySkillAttachmentId);
      if (ok) void reloadEffectiveSkills();
      return ok;
    },
    [detachCommunitySkill, reloadEffectiveSkills],
  );

  const effectiveSkillsForSettings = useMemo(() => {
    if (!effectiveSkillsError) return effectiveSkills;
    return buildEffectiveSkills({
      platformSkills:
        activeCommunityId && canManageResourcesActiveCommunity
          ? COMMUNITY_MANAGER_PLATFORM_SKILLS
          : [],
      personalSkills: userPlatformSkills,
      communitySkills: communitySkillAttachments,
    });
  }, [
    activeCommunityId,
    canManageResourcesActiveCommunity,
    communitySkillAttachments,
    effectiveSkills,
    effectiveSkillsError,
    userPlatformSkills,
  ]);

  const effectiveSkillsErrorForSettings =
    effectiveSkillsError && effectiveSkillsForSettings.length === 0
      ? effectiveSkillsError
      : null;

  const {
    loadCommunityFunnelConfig,
    handleSaveCommunityFunnel,
  } = useCommunityFunnelController<AuthSession, CommunityFunnelConfig>({
    activeCommunityId,
    ...authenticatedSessionArg,
    communityFunnelConfig,
    normalizeConfigForSave: normalizeCommunityFunnelConfig,
    saveConfig: async ({ session, communityId, normalizedConfig }) => {
      const saved = await saveCloudCommunityPublicPresentation<AuthSession, CommunityFunnelConfig>({
        session,
        communityId,
        config: normalizedConfig,
      });
      setCommunities((prev) =>
        prev.map((community) =>
          community.id === communityId
            ? {
                ...community,
                updated_at: saved?.updated_at || community.updated_at,
              }
            : community,
        ),
      );
      return saved?.funnel ?? normalizedConfig;
    },
    hydrateEditor: hydrateCommunityFunnelEditor,
    setLoadedCommunityId: (communityId) => {
      communityFunnelLoadedCommunityIdRef.current = communityId;
    },
    markDraftClean: () => {
      communityFunnelDirtyRef.current = false;
    },
    setIsLoadingCommunityFunnel,
    setCommunityFunnelError,
    setCommunityFunnelSaveError,
    setIsSavingCommunityFunnel,
    loadFailureMessage: "Failed to load funnel settings.",
    saveFailureMessage: "Failed to save funnel settings.",
  });

  const {
    syncCommunitySettingsSelection,
  } = useCommunitySettingsFormController<CommunityRecord>({
    slugifyCommunityName,
    communitySettingsLoadedCommunityIdRef,
    communitySettingsDirtyRef,
    communityPricingDirtyRef,
    setCommunitySettingsError,
    setCommunityMemberSettingsError,
    setCommunitySettingsName,
    setCommunitySettingsSlug,
    setCommunitySettingsOneLiner,
    setCommunitySettingsAbout,
    setCommunitySettingsVisibility,
    setCommunitySettingsAvatarUrl,
    setCommunitySettingsAvatarFocusX,
    setCommunitySettingsAvatarFocusY,
    setCommunitySettingsAvatarZoom,
    setCommunitySettingsBannerUrl,
    setCommunitySettingsBannerFocusX,
    setCommunitySettingsBannerFocusY,
    setCommunitySettingsBannerZoom,
    setCommunitySettingsPricingMode,
    setCommunitySettingsPriceUsdMonthly,
    setCommunitySettingsPriceUsdAnnual,
    setCommunityMemberMuted,
    setCommunitySettingsBannerUploadError,
    setIsProcessingCommunitySettingsBanner,
  });

  const {
    loadCommunityMemberSettings,
    loadCommunityPricing,
  } = useCommunitySettingsDataController<AuthSession>({
    ensureSession: ensureUsableAuthSession,
    communitySettingsLoadedCommunityIdRef,
    communityPricingDirtyRef,
    setCommunityMemberMuted,
    setIsLoadingCommunityMemberSettings,
    setCommunityMemberSettingsError,
    setCommunitySettingsPricingMode,
    setCommunitySettingsPriceUsdMonthly,
    setCommunitySettingsPriceUsdAnnual,
  });

  const activeCommunitySettingsSource = activeCommunity;

  const {
    handleToggleCommunityMute,
    handleLeaveCommunity,
    handleSaveCommunitySettings,
  } = useCommunitySettingsGovernanceController<AuthSession>({
    activeCommunityAvatarStorageId: activeCommunitySettingsSource?.avatar_storage_id ?? null,
    activeCommunityBannerStorageId: activeCommunitySettingsSource?.banner_storage_id ?? null,
    activeCommunityAvatarUrl: activeCommunitySettingsSource?.avatar_url ?? null,
    activeCommunityBannerUrl: activeCommunitySettingsSource?.banner_url ?? null,
    activeCommunityId,
    activeCommunityAccess,
    ...authenticatedSessionArg,
    confirmAction: (message) => confirm(message),
    loadCommunities,
    reloadActiveCommunityAccess,
    onLeaveCommunityLocalState: (leavingId) => {
      applyCommunityShellState({
        communityId: null,
        communitySlug: null,
        communityTab: "chat",
      });
      setActivePage("discover");
      setActiveView("home");
      setCommunities((prev) => prev.filter((community) => community.id !== leavingId));
    },
    setCommunityMemberSettingsError,
    setIsLoadingCommunityMemberSettings,
    setCommunityMemberMuted,
    setIsLeavingCommunity,
    communitySettingsName,
    communitySettingsSlug,
    communitySettingsOneLiner,
    communitySettingsAbout,
    communitySettingsVisibility,
    communitySettingsAvatarUrl,
    communitySettingsAvatarFocusX,
    communitySettingsAvatarFocusY,
    communitySettingsAvatarZoom,
    communitySettingsBannerUrl,
    communitySettingsBannerFocusX,
    communitySettingsBannerFocusY,
    communitySettingsBannerZoom,
    communitySettingsPricingMode,
    communitySettingsPriceUsdMonthly,
    communitySettingsPriceUsdAnnual,
    isValidCommunitySlug,
    setCommunitySettingsError,
    setIsSavingCommunitySettings,
    onSaveCommunitySettingsSuccess: (result) => {
      setCommunities((prev) =>
        prev.map((community) =>
          community.id === result.community_id
            ? {
                ...community,
                name: result.name,
                slug: result.slug,
                one_liner: result.one_liner,
                about: result.about ?? null,
                avatar_url: result.avatar_url,
                avatar_storage_id: result.avatar_storage_id ?? null,
                avatar_focus_x: result.avatar_focus_x ?? 0.5,
                avatar_focus_y: result.avatar_focus_y ?? 0.5,
                avatar_zoom: result.avatar_zoom ?? 1,
                banner_url: result.banner_url,
                banner_storage_id: result.banner_storage_id ?? null,
                banner_focus_x: result.banner_focus_x ?? 0.5,
                banner_focus_y: result.banner_focus_y ?? 0.5,
                banner_zoom: result.banner_zoom ?? 1,
                visibility: toCanonicalCommunityVisibility(result.visibility, "unlisted"),
                updated_at: result.updated_at,
              }
            : community,
        ),
      );
      if (activeCommunityId === result.community_id) {
        applyCommunityShellState({
          communityId: result.community_id,
          communitySlug: result.slug,
        });
      }
      communitySettingsDirtyRef.current = false;
      communityPricingDirtyRef.current = false;
    },
  });
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

  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [discoverCommunities, setDiscoverCommunities] = useState<DiscoverCommunity[]>([]);
  const [isLoadingDiscover, setIsLoadingDiscover] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [lastDiscoverLoadAttemptedAt, setLastDiscoverLoadAttemptedAt] = useState(0);

  const { loadThreads, loadThreadMessages } = useWebThreadDataController<
    AuthSession,
    ThreadMessage
  >({
    fetchModelRegistryRows: async (session) => {
      const url = getAuthUrl();
      if (!url) return null;
      try {
        return await listEnabledCloudModelRegistryRows({
          session,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("[model-registry] failed to load:", message);
        return null;
      }
    },
    toEpochSeconds,
    formatModelLabel,
    ensureSession: ensureUsableAuthSession,
    activeThreadId,
    threadsHydratedRef,
    workspaceWantsNewChatRef,
    setActiveThreadId,
    setWorkspaceWantsNewChatMode,
    setThreadError,
    setThreads,
    setThreadMessages,
    setModelToggles,
    setModelProviderById,
    isModelAllowed: (modelId) => isModelAvailableOnSurface(modelId, "web"),
  });

  const {
    loadUserMemorySettings,
    loadPersonalMemoryItems,
    searchPersonalMemoryItems,
  } = useWebMemorySettingsDataController<AuthSession>({
    getSession: () => sessionRef.current,
    ensureSession: ensureUsableAuthSession,
    setIsLoadingUserMemorySettings,
    setUserMemorySettings,
    setIsLoadingPersonalMemory: personalMemoryUi.setIsLoadingPersonalMemory,
    setPersonalMemoryError: personalMemoryUi.setPersonalMemoryError,
    setPersonalMemoryItems: personalMemoryUi.setPersonalMemoryItems,
  });

  const {
    saveUserMemorySettings,
    createPersonalMemoryItemDirect,
    handleCreatePersonalMemoryItem,
    handleTogglePersonalMemoryPinned,
    handleDeletePersonalMemoryItem,
  } = useWebMemoryMutationController<AuthSession>({
    getSession: () => sessionRef.current,
    ensureSession: ensureUsableAuthSession,
    requireSignIn,
    loadPersonalMemoryItems,
    newPersonalMemoryContent: personalMemoryUi.newPersonalMemoryContent,
    newPersonalMemoryScope,
    newPersonalMemoryPinned: personalMemoryUi.newPersonalMemoryPinned,
    setIsLoadingUserMemorySettings,
    setUserMemorySettings,
    setPersonalMemoryError: personalMemoryUi.setPersonalMemoryError,
    setNewPersonalMemoryContent: personalMemoryUi.setNewPersonalMemoryContent,
    setNewPersonalMemoryPinned: personalMemoryUi.setNewPersonalMemoryPinned,
  });
  const saveUserMemorySettingsAndRefreshSetup = useCallback(async (next: UserMemorySettings): Promise<AccountSetupStatus | null> => {
    await saveUserMemorySettings(next);
    return await refreshAccountSetupStatus();
  }, [refreshAccountSetupStatus, saveUserMemorySettings]);

  const {
    createThread,
    updateThreadModel,
    updateThreadRuntimeEngine,
    maybeSetThreadTitleFromText,
    setThreadCommunityLens,
  } = workspaceCore.threadMutation;
  const openPremiumBilling = () => openGlobalSettings("billing");
  const handleWorkspaceRuntimeEngineChange = useCallback(
    (next: RuntimeEngine): void => {
      const runtimeEngine = normalizeActiveWorkspaceRuntimeEngine(next);
      const hasResolvedRuntimeAccessTier =
        !sessionRef.current || accountCommerceStatus !== null || !isLoadingAccountCommerce;
      if (
        hasResolvedRuntimeAccessTier &&
        !canUseRuntimeEngineForTier({
          engine: runtimeEngine,
          accountTier: accountCommerceStatus?.account_tier ?? null,
        })
      ) {
        openPremiumBilling();
        return;
      }
      setActiveRuntimeEngine(runtimeEngine);
      if (workspaceWantsNewChat || !activeThreadId) return;
      const session = sessionRef.current;
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === activeThreadId
            ? { ...thread, runtime_engine: runtimeEngine }
            : thread,
        ),
      );
      if (!session) return;
      void updateThreadRuntimeEngine(activeThreadId, runtimeEngine, session as AuthSession);
    },
    [
      activeThreadId,
      accountCommerceStatus?.account_tier,
      accountCommerceStatus,
      isLoadingAccountCommerce,
      openPremiumBilling,
      setActiveRuntimeEngine,
      setThreads,
      updateThreadRuntimeEngine,
      workspaceWantsNewChat,
    ],
  );

  const { loadDiscoverCommunities } = useWebDiscoverController({
    toCanonicalCommunityVisibility,
    setIsLoadingDiscover,
    setDiscoverError,
    setDiscoverCommunities,
    setLastDiscoverLoadAttemptedAt,
  });

  const {
    handleCopyMessage,
    showMemoryToastMessage,
    showAppToastMessage,
  } = useWebWorkspaceUiActionsController({
    copyTextToClipboard,
    setCopiedMessageId,
    memoryToastTimeoutRef,
    setMemoryToast,
    appToastTimeoutRef,
    setAppToast,
  });

  useEffect(() => {
    if (!authError) {
      lastShownAuthErrorRef.current = null;
      return;
    }
    if (
      previewAccessGateModal ||
      readAuthResumeState()?.intent?.reason === "open_workspace_draft"
    ) {
      return;
    }
    if (lastShownAuthErrorRef.current === authError) return;
    lastShownAuthErrorRef.current = authError;
    showAppToastMessage(authError);
  }, [authError, previewAccessGateModal, showAppToastMessage]);

  const handleImportExternalMemory = useCallback(async (): Promise<void> => {
    if (!session) {
      requireSignIn();
      return;
    }

    const importItems = personalMemoryUi.memoryImportPlan.uniqueItems;
    if (importItems.length === 0) {
      personalMemoryUi.setMemoryImportError(
        personalMemoryUi.memoryImportPlan.parsedItems.length === 0
          ? "No memory entries found. Paste the provider export, ideally including the code block."
          : "Everything in this import is already in your personal memory.",
      );
      return;
    }

    personalMemoryUi.setMemoryImportError(null);
    personalMemoryUi.setIsImportingMemory(true);
    try {
      let importedCount = 0;
      for (const item of importItems) {
        const created = await createPersonalMemoryItemDirect({
          content: item.memoryContent,
          pinned: false,
        });
        if (created) importedCount += 1;
      }
      await loadPersonalMemoryItems();
      personalMemoryUi.resetMemoryImportModal();
      const duplicateCount = personalMemoryUi.memoryImportPlan.duplicateCount;
      const importedLabel = `${importedCount} memory item${importedCount === 1 ? "" : "s"}`;
      const duplicateLabel =
        duplicateCount > 0 ? ` · skipped ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"}` : "";
      showMemoryToastMessage(`Imported ${importedLabel}${duplicateLabel}`);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
          ? error.message
          : "Failed to import memory.";
      personalMemoryUi.setMemoryImportError(message);
    } finally {
      personalMemoryUi.setIsImportingMemory(false);
    }
  }, [
    session,
    createPersonalMemoryItemDirect,
    loadPersonalMemoryItems,
    requireSignIn,
    personalMemoryUi,
    showMemoryToastMessage,
  ]);

  const isThreadRunActive = useCallback(
    (threadId: string | null): boolean => {
      const trimmedThreadId = String(threadId ?? "").trim();
      if (!trimmedThreadId) return false;
      return Boolean(
        threadSendingStateById[trimmedThreadId] ||
          threadStreamingStateById[trimmedThreadId],
      );
    },
    [threadSendingStateById, threadStreamingStateById],
  );

  const setThreadRunSending = useCallback((threadId: string, sending: boolean): void => {
    const trimmedThreadId = threadId.trim();
    if (!trimmedThreadId) return;
    setThreadSendingStateById((prev) => {
      if (sending) {
        if (prev[trimmedThreadId]) return prev;
        return {
          ...prev,
          [trimmedThreadId]: true,
        };
      }
      if (!(trimmedThreadId in prev)) return prev;
      const next = { ...prev };
      delete next[trimmedThreadId];
      return next;
    });
  }, []);

  const {
    stopStreamingTurn,
    stopAllStreamingTurns,
    runPublicTurn,
    runAgentTurn,
    createThreadMessage,
    deleteThreadMessagesByIds,
  } = useWebTurnRunnerController<
    AuthSession,
    ThreadMessage,
    MemoryUsedItem,
    HistoryUsedItem,
    CommunityEvidenceUsedV1
  >({
    activeThreadId,
    session,
    threadStreamingStateById,
    getCloudRuntimeBaseUrl: getAuthUrl,
    getThreadById: (threadId) => threads.find((thread) => thread.id === threadId) ?? null,
    fetchCloudPublic: fetchWithPublic,
    fetchAuth: fetchWithAuth,
    extractTextFromContentJson,
    parseMemoryUsedArray,
    parseHistoryUsedArray,
    extractCommunityEvidenceUsedV1,
    loadThreadMessages,
    loadThreads,
    showMemoryToastMessage,
    setThreadErrorForThread,
    setInferenceIssueModal,
    setThreadSendingStateById,
    setThreadStreamingStateById,
    setRuntimeEventsByRunId,
  });
  useWebRuntimeRunLifecycle<
    AuthSession,
    ThreadMessage,
    MemoryUsedItem,
    HistoryUsedItem,
    CommunityEvidenceUsedV1
  >({
    session: session,
    activeThreadId,
    threadSendingStateById,
    threadStreamingStateById,
    setThreadStreamingStateById,
    runtimeEventsByRunId,
    setRuntimeEventsByRunId,
    threadMessages,
    setThreadErrorForThread: (threadId, value) => setThreadErrorForThread(threadId, value),
    loadThreads,
    loadThreadMessages,
  });

  const loadWorkspaceCreditBalance = useCallback(
    async (session: AuthSession): Promise<WorkspaceCreditBalance | null> => {
      const requestId = ++workspaceCreditLoadRequestIdRef.current;
      setIsLoadingWorkspaceCreditBalance(true);
      setWorkspaceCreditBalanceError(null);
      try {
        const usableSession = await ensureUsableAuthSession(session);
        if (!usableSession) {
          if (requestId === workspaceCreditLoadRequestIdRef.current) {
            setWorkspaceCreditBalance(null);
          }
          return null;
        }
        const balance =
          (await loadWorkspaceCreditBalanceCanonical({
            session: usableSession,
          })) ?? buildEmptyWorkspaceCreditBalance(usableSession);
        if (requestId === workspaceCreditLoadRequestIdRef.current) {
          setWorkspaceCreditBalance(balance);
          setWorkspaceCreditBalanceError(null);
        }
        return balance;
      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to load tool balance.";
        console.warn("Tool balance refresh failed:", error);
        if (requestId === workspaceCreditLoadRequestIdRef.current) {
          setWorkspaceCreditBalanceError(message);
        }
        return null;
      } finally {
        if (requestId === workspaceCreditLoadRequestIdRef.current) {
          setIsLoadingWorkspaceCreditBalance(false);
        }
      }
    },
    [ensureUsableAuthSession],
  );

  useEffect(() => {
    activeCommunityIdRef.current = activeCommunityId;
  }, [activeCommunityId]);

  useEffect(() => {
    const handleCommunityResourcesMutated = (event: Event) => {
      const detail = readCommunityResourcesMutatedEventDetail(event);
      if (!detail) return;
      const currentCommunityId = activeCommunityIdRef.current ?? activeCommunityId;
      if (!currentCommunityId || detail.communityId !== currentCommunityId) return;
      const activeSession = sessionRef.current ?? session;
      if (!activeSession) return;
      void (async () => {
        try {
          await loadCommunityResources(detail.communityId, activeSession);
        } catch (error) {
          console.warn("[community-resources] failed to refresh after resource mutation:", error);
        }
      })();
    };
    window.addEventListener(COMMUNITY_RESOURCES_MUTATED_EVENT, handleCommunityResourcesMutated);
    return () => {
      window.removeEventListener(COMMUNITY_RESOURCES_MUTATED_EVENT, handleCommunityResourcesMutated);
    };
  }, [
    activeCommunityId,
    loadCommunityResources,
    session,
    sessionRef,
  ]);

  useCommunityAgentLandingLifecycle<AuthSession>({
    ...authenticatedSessionArg,
    activeCommunityId,
    canViewCommunity: communityActionGuards.canViewCommunity,
    activeCommunityIdRef,
    activeCommunityAgentLandingCommunityIdRef,
    communityAgentLandingFetchSeqRef,
    setActiveCommunityAgentLanding,
  });

  useEffect(() => {
    if (activePage !== "community" || communityTab !== "funnel") return;
    if (!session || !activeCommunityId || !canManageMembersActiveCommunity) {
      resetCommunityFunnelState();
      return;
    }
    if (communityFunnelLoadedCommunityIdRef.current === activeCommunityId) return;
    void loadCommunityFunnelConfig(activeCommunityId, session);
  }, [
    activePage,
    communityTab,
    session,
    activeCommunityId,
    canManageMembersActiveCommunity,
    loadCommunityFunnelConfig,
    resetCommunityFunnelState,
  ]);

  useEffect(() => {
    if (!isCommunityLaunchSetupModalOpen) return;
    if (!session || !activeCommunityId || !canManageMembersActiveCommunity) return;
    if (communityAgentConfigLoadedCommunityIdRef.current === activeCommunityId) return;
    void loadCommunityAgentConfig(activeCommunityId, session);
  }, [
    isCommunityLaunchSetupModalOpen,
    session,
    activeCommunityId,
    canManageMembersActiveCommunity,
    communityAgentConfigLoadedCommunityIdRef,
    loadCommunityAgentConfig,
  ]);

  const communityPolynetController = useWebCommunityPolynetController<AuthSession>({
    activePage,
    communityTab,
    activeCommunityId,
    session: session,
    ensureSession: ensureUsableAuthSession,
    requireSignIn: () => requireSignIn(),
    canViewPolynet: canViewActiveCommunityPolynet,
  });

  useWebPathRouteLifecycle({
    publicRouteKind: publicRoute.kind,
    activePage,
    activeView,
    settingsPage,
    activeCommunitySlug: selectedActiveCommunitySlug,
    communityTab,
    communityExperienceMode,
    communityResourceModuleId,
    communitySettingsPane,
    docsSlug: activePage === "docs" ? selectedProductDocSlug : null,
    operatorTab: activePage === "operator" ? activeOperatorTab : null,
    applyLocationToState,
    setStripeConnectReturn,
    buildAppRoutePath: (state) => applyShellVariantToAppPath(buildAppRoutePath(state) ?? "", shellVariant) || null,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("app_oauth");
    if (!status) return;

    if (status === "error") {
      showAppToastMessage(
        params.get("app_oauth_message")?.trim() ||
          "App connection was not completed.",
      );
      scrubCurrentRouteSearchParams(APP_OAUTH_RETURN_PARAM_NAMES);
      applyLocationToState();
      return;
    }

    if (status === "connected") {
      showAppToastMessage("App connected.");
      if (session) {
        userPlatformAppMountsLoadedUserIdRef.current = null;
        void loadUserPlatformAppMounts(session);
      }
      void reloadEffectiveMcpApps();
      scrubCurrentRouteSearchParams(APP_OAUTH_RETURN_PARAM_NAMES);
      applyLocationToState();
      return;
    }

    if (status !== "pending") return;
    const state = params.get("app_oauth_state")?.trim() ?? "";
    const finalizeToken = params.get("app_oauth_finalize_token")?.trim() ?? "";
    if (!state || !finalizeToken) {
      showAppToastMessage("App connection could not be finalized.");
      scrubCurrentRouteSearchParams(APP_OAUTH_RETURN_PARAM_NAMES);
      applyLocationToState();
      return;
    }
    if (!session) return;
    const inFlightKey = `${state}:${finalizeToken}`;
    if (appOAuthFinalizeInFlightRef.current === inFlightKey) return;
    const sessionGuardKey = buildAppOAuthFinalizeSessionGuardKey(
      state,
      finalizeToken,
    );
    if (!claimAppOAuthFinalizeSessionGuard(sessionGuardKey)) return;
    appOAuthFinalizeInFlightRef.current = inFlightKey;

    void (async () => {
      try {
        const result = await finalizeUserPlatformAppOAuth({
          state,
          finalizeToken,
        });
        if (result.ok) {
          showAppToastMessage("App connected.");
          userPlatformAppMountsLoadedUserIdRef.current = null;
          void loadUserPlatformAppMounts(session);
          void reloadEffectiveMcpApps();
        } else {
          showAppToastMessage(
            result.error_message || "App connection could not be finalized.",
          );
        }
        scrubCurrentRouteSearchParams(APP_OAUTH_RETURN_PARAM_NAMES);
        applyLocationToState();
      } finally {
        clearAppOAuthFinalizeSessionGuard(sessionGuardKey);
        if (appOAuthFinalizeInFlightRef.current === inFlightKey) {
          appOAuthFinalizeInFlightRef.current = null;
        }
      }
    })();

    return () => {
      // Keep the in-flight/session guards while the one-shot finalizer runs.
    };
  }, [
    applyLocationToState,
    finalizeUserPlatformAppOAuth,
    loadUserPlatformAppMounts,
    reloadEffectiveMcpApps,
    session,
    showAppToastMessage,
    userPlatformAppMountsLoadedUserIdRef,
  ]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("source_integration_oauth");
    if (!status) return;
    const urlLaunchKnowledgeContext = readCommunityLaunchKnowledgeOAuthContext(
      params,
      window.location.pathname,
    );
    const provider = normalizeSourceIntegrationOAuthProvider(params.get("source_integration_provider"));
    const state = normalizeLaunchOAuthContextParam(params.get("source_integration_state"), 500);
    const storedLaunchKnowledgeContext = readCommunityLaunchKnowledgeSourceOAuthIntent({
      provider,
      state,
    });
    const restoreLaunchKnowledgeContext = (server?: {
      community_id?: unknown;
      community_slug?: unknown;
      return_context_kind?: unknown;
    } | null): boolean => {
      const context = mergeCommunityLaunchKnowledgeOAuthContext(
        {
          ...urlLaunchKnowledgeContext,
          provider,
          state,
        },
        storedLaunchKnowledgeContext,
        server,
      );
      if (context.shouldRestore) {
        queueCommunityLaunchKnowledgeOAuthRestore(context);
        return true;
      }
      return false;
    };
    if (!provider) {
      scrubCurrentRouteSearchParams(SOURCE_INTEGRATION_OAUTH_RETURN_PARAM_NAMES);
      applyLocationToState();
      restoreLaunchKnowledgeContext();
      return;
    }
    const providerLabel = provider === "github" ? "GitHub" : "Google Drive";

    if (status === "error") {
      showAppToastMessage(
        params.get("source_integration_message")?.trim() ||
          `${providerLabel} connection was not completed.`,
      );
      scrubCurrentRouteSearchParams(SOURCE_INTEGRATION_OAUTH_RETURN_PARAM_NAMES);
      applyLocationToState();
      restoreLaunchKnowledgeContext();
      return;
    }

    if (status !== "pending") {
      scrubCurrentRouteSearchParams(SOURCE_INTEGRATION_OAUTH_RETURN_PARAM_NAMES);
      applyLocationToState();
      restoreLaunchKnowledgeContext();
      return;
    }
    const finalizeToken = params.get("source_integration_finalize_token")?.trim() ?? "";
    if (!state || !finalizeToken) {
      showAppToastMessage(`${providerLabel} connection could not be finalized.`);
      scrubCurrentRouteSearchParams(SOURCE_INTEGRATION_OAUTH_RETURN_PARAM_NAMES);
      applyLocationToState();
      restoreLaunchKnowledgeContext();
      return;
    }
    restoreLaunchKnowledgeContext();
    if (!session) return;
    const inFlightKey = `${state}:${finalizeToken}`;
    if (sourceIntegrationOAuthFinalizeInFlightRef.current === inFlightKey) return;
    const sessionGuardKey = buildAppOAuthFinalizeSessionGuardKey(
      `source:${state}`,
      finalizeToken,
    );
    if (!claimAppOAuthFinalizeSessionGuard(sessionGuardKey)) return;
    sourceIntegrationOAuthFinalizeInFlightRef.current = inFlightKey;

    void (async () => {
      try {
        let result:
          | Awaited<ReturnType<typeof finalizeCloudCommunityGitHubSourceOAuth>>
          | Awaited<ReturnType<typeof finalizeCloudCommunityGoogleDriveSourceOAuth>>;
        try {
          result = provider === "github"
            ? await finalizeCloudCommunityGitHubSourceOAuth({
                session,
                state,
                finalizeToken,
              })
            : await finalizeCloudCommunityGoogleDriveSourceOAuth({
                session,
                state,
                finalizeToken,
              });
        } catch {
          result = {
            ok: false,
            provider,
            community_id: null,
            return_context_kind: null,
            email: null,
            error_message: `${providerLabel} connection could not be finalized. Try again.`,
          } as Awaited<ReturnType<typeof finalizeCloudCommunityGoogleDriveSourceOAuth>>;
        }
        showAppToastMessage(
          result.ok
            ? `${providerLabel} connected.`
            : result.error_message || `${providerLabel} connection could not be finalized.`,
        );
        scrubCurrentRouteSearchParams(SOURCE_INTEGRATION_OAUTH_RETURN_PARAM_NAMES);
        applyLocationToState();
        const didRestoreLaunchKnowledge = restoreLaunchKnowledgeContext(result);
        clearCommunityLaunchKnowledgeSourceOAuthIntent({ provider, state });
        if (result.ok && didRestoreLaunchKnowledge) {
          setCommunityLaunchKnowledgeIntegrationReloadKey((key) => key + 1);
          if (provider === "google_drive" || provider === "github") {
            setCommunityLaunchKnowledgeAutoOpenProvider(provider);
          }
        }
      } finally {
        clearAppOAuthFinalizeSessionGuard(sessionGuardKey);
        if (sourceIntegrationOAuthFinalizeInFlightRef.current === inFlightKey) {
          sourceIntegrationOAuthFinalizeInFlightRef.current = null;
        }
      }
    })();
  }, [
    applyLocationToState,
    queueCommunityLaunchKnowledgeOAuthRestore,
    session,
    showAppToastMessage,
  ]);

  useEffect(() => {
    if (shellVariant !== "standard" || !isLikelyMobileDevice) return;
    if (hasOAuthCallbackParamsInLocation()) return;
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const nextPath = applyShellVariantToKnownPath(currentPath, "mobile");
    if (!nextPath || nextPath === currentPath) return;
    window.history.replaceState(window.history.state ?? {}, document.title, nextPath);
    applyLocationToState();
  }, [applyLocationToState, isLikelyMobileDevice, shellVariant]);

  useEffect(() => {
    communityAttachmentsRef.current = communityAttachments;
  }, [communityAttachments]);

  useWebUiPersistenceLifecycle({
    communityAnalyticsRange,
    appTheme,
    profileStorageUserId,
    profileName: profileUi.profileName,
    profileHandle: profileUi.profileHandle,
    profileBio: profileUi.profileBio,
    modelToggles,
    activeModelId,
    guestModelId,
    modelTogglesStorageKey: MODEL_TOGGLES_STORAGE_KEY,
    activeModelStorageKey: ACTIVE_MODEL_STORAGE_KEY,
    readProfileDraftForUser,
    writeProfileDraftForUser,
    storeGuestModelId,
    setProfileName: profileUi.setProfileName,
    setProfileHandle: profileUi.setProfileHandle,
    setProfileBio: profileUi.setProfileBio,
  });

  // Cloud session is hydrated from browser auth continuity during lifecycle bootstrap.

  useEffect(() => {
    setCloudProfile(null);
    setAccountSetupStatus(null);
    setIsLoadingAccountSetupStatus(false);
    setHasLoadedOnboardingProfile(false);
    setIsOnboardingModalOpen(false);
  }, [profileStorageUserId]);

  const visibleCommunityProfileIds = useMemo(() => {
    const shouldLoadCommunityProfiles = activePage === "community";
    if (!shouldLoadCommunityProfiles) return [] as string[];
    const ids = new Set<string>();
    for (const member of communityDirectoryMembers) {
      const userId = String(member.user_id ?? "").trim();
      if (userId) ids.add(userId);
    }
    for (const bundle of communityInteractionRoots) {
      const actorId = String(bundle.root.actor_user_id ?? "").trim();
      if (actorId) ids.add(actorId);
      const lastReplyActorId = String(bundle.root.last_reply_actor_user_id ?? "").trim();
      if (lastReplyActorId) ids.add(lastReplyActorId);
    }
    for (const replies of Object.values(communityInteractionRepliesByRootId)) {
      for (const bundle of replies) {
        const actorId = String(bundle.reply.actor_user_id ?? "").trim();
        if (actorId) ids.add(actorId);
      }
    }
    if (canonicalSessionUserId) ids.add(canonicalSessionUserId);
    return Array.from(ids);
  }, [
    activePage,
    canonicalSessionUserId,
    communityDirectoryMembers,
    communityInteractionRepliesByRootId,
    communityInteractionRoots,
  ]);

  const savedProfilesByUserId = useMemo(() => {
    if (!canonicalSessionUserId || !cloudProfile) return profilesByUserId;
    const existingDisplayProfile = profilesByUserId[canonicalSessionUserId] ?? undefined;
    const cloudHasProfileAvatar = Boolean(cloudProfile.avatar_storage_id || cloudProfile.avatar_url);
    // Merge instead of rebuilding: fields the self-profile payload doesn't
    // carry (e.g. premium_badge) keep their bulk-hydrated values.
    return {
      ...profilesByUserId,
      [canonicalSessionUserId]: mergeUserProfileEntry<UserProfile>(existingDisplayProfile, {
        user_id: canonicalSessionUserId,
        display_name: cloudProfile.display_name ?? existingDisplayProfile?.display_name ?? null,
        handle: cloudProfile.handle ?? null,
        normalized_handle: cloudProfile.normalized_handle ?? null,
        bio: cloudProfile.bio ?? existingDisplayProfile?.bio ?? null,
        social_links: cloudProfile.social_links ?? existingDisplayProfile?.social_links ?? null,
        avatar_url: cloudProfile.avatar_url ?? existingDisplayProfile?.avatar_url ?? null,
        avatar_storage_id: cloudProfile.avatar_storage_id ?? existingDisplayProfile?.avatar_storage_id ?? null,
        avatar_focus_x: cloudHasProfileAvatar
          ? cloudProfile.avatar_focus_x ?? 0.5
          : existingDisplayProfile?.avatar_focus_x ?? 0.5,
        avatar_focus_y: cloudHasProfileAvatar
          ? cloudProfile.avatar_focus_y ?? 0.5
          : existingDisplayProfile?.avatar_focus_y ?? 0.5,
        avatar_zoom: cloudHasProfileAvatar
          ? cloudProfile.avatar_zoom ?? 1
          : existingDisplayProfile?.avatar_zoom ?? 1,
        premium_badge:
          (cloudProfile as { premium_badge?: UserProfile["premium_badge"] }).premium_badge ??
          existingDisplayProfile?.premium_badge ??
          undefined,
      }),
    } satisfies Record<string, UserProfile>;
  }, [canonicalSessionUserId, cloudProfile, profilesByUserId]);

  useEffect(() => {
    if (!session || visibleCommunityProfileIds.length === 0) return;
    const hydrateVisibleProfiles = () => {
      void loadUserProfiles(visibleCommunityProfileIds, session);
      void loadSelfProfile(session);
    };
    const refreshVisibleProfiles = () => {
      void loadUserProfiles(visibleCommunityProfileIds, session, { force: true });
      void loadSelfProfile(session);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshVisibleProfiles();
      }
    };
    hydrateVisibleProfiles();
    window.addEventListener("focus", refreshVisibleProfiles);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", refreshVisibleProfiles);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [session, loadSelfProfile, loadUserProfiles, visibleCommunityProfileIds]);

  useWebGuestThreadLifecycle<AuthSession, GuestThreadStorageV1, ThreadMessage>({
    enableGuestThreadLifecycle: isSignedOutAppPresentation,
    ...sessionArg,
    publicRouteKind: shellPublicRoute.kind,
    activeThreadId,
    workspaceWantsNewChat,
    guestThreadId: GUEST_THREAD_ID,
    loadGuestThreadStorage,
    guestStoredToThreadMessages,
    applyGuestWorkspaceState,
    syncWorkspaceSelection,
    setGuestModelId,
    setThreadMessages,
  });

  const workspaceThreadKey = isSignedOutAppPresentation ? GUEST_THREAD_ID : activeThreadId;

  useEffect(() => {
    if (activeView !== "settings" || settingsGroup !== "agent") return;
    const q = personalMemoryUi.personalMemoryQuery.trim();
    const handle = window.setTimeout(() => {
      void searchPersonalMemoryItems(q);
    }, 150);
    return () => window.clearTimeout(handle);
  }, [activeView, settingsGroup, personalMemoryUi.personalMemoryQuery, session, searchPersonalMemoryItems]);

  useEffect(() => {
    setCommunityChatError(null);
    setCommunityResources([]);
    setCommunityLaunchLinkSources([]);
    setCommunityLaunchFileSources([]);
    setCommunityLaunchGoogleDriveSources([]);
    setCommunityLaunchGitHubSources([]);
    setCommunityResourceModules([]);
    setIsLoadingCommunityEvents(false);
    setCommunityEventsError(null);
    setCommunityMessageMentions([]);
    setOpenResourceEmbedId(null);
    if (chatInputRef.current) {
      chatInputRef.current.style.height = "auto";
    }
  }, [activeCommunityId]);

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
    moderatingPostId: communityFeedModeratingPostId,
    hidePost: handleHideCommunityFeedPost,
    retry: retryCommunityAiFeed,
  } = useCommunityAiFeedController<AuthSession>({
    activeCommunityId,
    isAiFeedTabActive: communityTab === "ai_feed",
    viewerCacheKey: session?.user?.id ?? "anonymous",
    session: session,
    ensureSession: ensureUsableAuthSession,
  });

  const latestActiveCommunityChatActivityAt = useMemo(() => {
    const timestamps: number[] = [];
    const pushIsoTimestamp = (raw: string | null | undefined) => {
      const ms = Date.parse(String(raw ?? ""));
      if (Number.isFinite(ms) && ms > 0) timestamps.push(ms);
    };
    for (const bundle of communityInteractionRoots) {
      if (String(bundle.root.id ?? "").startsWith("pending:")) continue;
      pushIsoTimestamp(bundle.root.created_at);
      pushIsoTimestamp(bundle.root.last_reply_at);
    }
    for (const replies of Object.values(communityInteractionRepliesByRootId)) {
      for (const bundle of replies) {
        if (String(bundle.reply.id ?? "").startsWith("pending:")) continue;
        pushIsoTimestamp(bundle.reply.created_at);
      }
    }
    return timestamps.length > 0 ? Math.max(...timestamps) : null;
  }, [communityInteractionRepliesByRootId, communityInteractionRoots]);

  const latestActiveCommunityAiFeedCreatedAt = useMemo(() => {
    const timestamps = activeCommunityFeedState.posts
      .map((post) => Date.parse(post.created_at))
      .filter((value) => Number.isFinite(value));
    if (timestamps.length === 0) return null;
    return Math.max(...timestamps);
  }, [activeCommunityFeedState.posts]);

  const latestActiveCommunityResourcesCreatedAt = useMemo(() => {
    const timestamps = communityResources
      .map((resource) => Date.parse(resource.created_at))
      .filter((value) => Number.isFinite(value));
    if (timestamps.length === 0) return null;
    return Math.max(...timestamps);
  }, [communityResources]);
  const latestActiveCommunityEventsUpdatedAt = useMemo(() => {
    const timestamps = communityEvents
      .map((event) => Date.parse(event.updated_at))
      .filter((value) => Number.isFinite(value));
    if (timestamps.length === 0) return null;
    return Math.max(...timestamps);
  }, [communityEvents]);
  const hasLoadedActiveCommunityEventsRange = Boolean(
    communityEventsCacheKey && Object.prototype.hasOwnProperty.call(communityEventsByCacheKey, communityEventsCacheKey),
  );

  useEffect(() => {
    communitySeenAcknowledgeKeyBySurfaceRef.current = {};
  }, [session?.user?.id]);

  useEffect(() => {
    if (
      activePage !== "community"
      || communityTab !== "chat"
      || !activeCommunityId
      || latestActiveCommunityChatActivityAt === null
    ) {
      return;
    }
    const requestKey = `${activeCommunityId}:chat`;
    const markerKey = String(latestActiveCommunityChatActivityAt);
    if (communitySeenAcknowledgeKeyBySurfaceRef.current[requestKey] === markerKey) return;
    communitySeenAcknowledgeKeyBySurfaceRef.current[requestKey] = markerKey;
    void markCommunitySurfaceSeen(activeCommunityId, "chat", {
      seenAtMs: latestActiveCommunityChatActivityAt,
    }).catch(() => {
      if (communitySeenAcknowledgeKeyBySurfaceRef.current[requestKey] === markerKey) {
        delete communitySeenAcknowledgeKeyBySurfaceRef.current[requestKey];
      }
    });
  }, [
    activeCommunityId,
    activePage,
    communityTab,
    latestActiveCommunityChatActivityAt,
    markCommunitySurfaceSeen,
  ]);

  useEffect(() => {
    if (
      activePage !== "community"
      || communityTab !== "ai_feed"
      || !activeCommunityId
      || activeCommunityFeedState.isLoading
      || latestActiveCommunityAiFeedCreatedAt === null
    ) {
      return;
    }
    const requestKey = `${activeCommunityId}:ai_feed`;
    const markerKey = String(latestActiveCommunityAiFeedCreatedAt);
    if (communitySeenAcknowledgeKeyBySurfaceRef.current[requestKey] === markerKey) return;
    communitySeenAcknowledgeKeyBySurfaceRef.current[requestKey] = markerKey;
    void markCommunitySurfaceSeen(activeCommunityId, "ai_feed").catch(() => {
      if (communitySeenAcknowledgeKeyBySurfaceRef.current[requestKey] === markerKey) {
        delete communitySeenAcknowledgeKeyBySurfaceRef.current[requestKey];
      }
    });
  }, [
    activeCommunityId,
    activePage,
    communityTab,
    activeCommunityFeedState.isLoading,
    latestActiveCommunityAiFeedCreatedAt,
    markCommunitySurfaceSeen,
  ]);

  useEffect(() => {
    if (
      activePage !== "community"
      || communityTab !== "resources"
      || !activeCommunityId
      || isLoadingResources
      || latestActiveCommunityResourcesCreatedAt === null
    ) {
      return;
    }
    const requestKey = `${activeCommunityId}:resources`;
    const markerKey = String(latestActiveCommunityResourcesCreatedAt);
    if (communitySeenAcknowledgeKeyBySurfaceRef.current[requestKey] === markerKey) return;
    communitySeenAcknowledgeKeyBySurfaceRef.current[requestKey] = markerKey;
    void markCommunitySurfaceSeen(activeCommunityId, "resources").catch(() => {
      if (communitySeenAcknowledgeKeyBySurfaceRef.current[requestKey] === markerKey) {
        delete communitySeenAcknowledgeKeyBySurfaceRef.current[requestKey];
      }
    });
  }, [
    activeCommunityId,
    activePage,
    communityTab,
    isLoadingResources,
    latestActiveCommunityResourcesCreatedAt,
    markCommunitySurfaceSeen,
  ]);

  useEffect(() => {
    if (
      activePage !== "community"
      || communityTab !== "events"
      || !activeCommunityId
      || isLoadingCommunityEvents
      || !hasLoadedActiveCommunityEventsRange
      || !communityEventsCacheKey
      || latestActiveCommunityEventsUpdatedAt === null
    ) {
      return;
    }
    const requestKey = `${activeCommunityId}:events`;
    const markerKey = `${communityEventsCacheKey}:${latestActiveCommunityEventsUpdatedAt}`;
    if (communitySeenAcknowledgeKeyBySurfaceRef.current[requestKey] === markerKey) return;
    communitySeenAcknowledgeKeyBySurfaceRef.current[requestKey] = markerKey;
    void markCommunitySurfaceSeen(activeCommunityId, "events", {
      seenAtMs: latestActiveCommunityEventsUpdatedAt,
      optimistic: false,
      refreshAfter: true,
    }).catch(() => {
      if (communitySeenAcknowledgeKeyBySurfaceRef.current[requestKey] === markerKey) {
        delete communitySeenAcknowledgeKeyBySurfaceRef.current[requestKey];
      }
    });
  }, [
    activeCommunityId,
    activePage,
    communityTab,
    communityEventsCacheKey,
    hasLoadedActiveCommunityEventsRange,
    isLoadingCommunityEvents,
    latestActiveCommunityEventsUpdatedAt,
    markCommunitySurfaceSeen,
  ]);

  useCommunityAgentConfigLifecycle<AuthSession>({
    activePage,
    communityTab,
    ...sessionArg,
    activeCommunityId,
    canManageMembersActiveCommunity,
    loadCommunityAgentConfig,
    communityAgentConfigLoadedCommunityIdRef,
    setCommunityAgentConfigError,
  });

  useEffect(() => {
    const shouldLoadCommunityApps =
      (activePage === "community" && communityTab === "ai_agent") ||
      (activePage === "community" && communityTab === "settings") ||
      activePage === "discover";
    if (!shouldLoadCommunityApps) return;
    const canViewCommunityApps = Boolean(
      activeCommunityAccess?.can_enter_community ??
        activeCommunityAccess?.can_view ??
        canViewActiveCommunitySettings ??
        canManageMembersActiveCommunity,
    );
    if (!session || !activeCommunityId || !canViewCommunityApps) {
      clearCommunityAppMounts();
      return;
    }
    if (communityAppMountsLoadedCommunityIdRef.current === activeCommunityId) return;
    void loadCommunityAppMounts(activeCommunityId, session);
  }, [
    activePage,
    communityTab,
    session,
    activeCommunityId,
    activeCommunityAccess?.can_enter_community,
    activeCommunityAccess?.can_view,
    canViewActiveCommunitySettings,
    canManageMembersActiveCommunity,
    clearCommunityAppMounts,
    loadCommunityAppMounts,
    communityAppMountsLoadedCommunityIdRef,
  ]);

  useEffect(() => {
    const shouldLoadUserPlatformApps =
      activePage === "discover" ||
      (activePage === "settings" && settingsPage === "integrations");
    if (!shouldLoadUserPlatformApps) return;
    if (!session) {
      clearUserPlatformAppMounts();
      return;
    }
    if (userPlatformAppMountsLoadedUserIdRef.current === session.user.id) return;
    void loadUserPlatformAppMounts(session);
  }, [
    activePage,
    session,
    settingsPage,
    clearUserPlatformAppMounts,
    loadUserPlatformAppMounts,
    userPlatformAppMountsLoadedUserIdRef,
  ]);

  useEffect(() => {
    const shouldLoadEffectiveMcpApps =
      activePage === "discover" ||
      (activePage === "community" && communityTab === "settings") ||
      (activePage === "community" && communityTab === "ai_agent") ||
      (activePage === "settings" && settingsPage === "integrations");
    if (!shouldLoadEffectiveMcpApps) return;
    if (!session) {
      clearEffectiveMcpApps();
      return;
    }
    const loadedKey = `${session.user.id}:${activeCommunityId ?? "personal"}`;
    if (effectiveMcpAppsLoadedKeyRef.current === loadedKey) return;
    void loadEffectiveMcpApps(session);
  }, [
    activeCommunityId,
    activePage,
    communityTab,
    session,
    settingsPage,
    clearEffectiveMcpApps,
    effectiveMcpAppsLoadedKeyRef,
    loadEffectiveMcpApps,
  ]);

  useEffect(() => {
    const shouldLoadEffectiveSkills =
      activePage === "settings" &&
      settingsPage === "integrations";
    if (!shouldLoadEffectiveSkills) return;
    if (!session) {
      clearEffectiveSkills();
      return;
    }
    const loadedKey = `${session.user.id}:${activeCommunityId ?? "personal"}`;
    if (effectiveSkillsLoadedKeyRef.current === loadedKey) return;
    void loadEffectiveSkills(session);
  }, [
    activeCommunityId,
    activePage,
    session,
    settingsPage,
    clearEffectiveSkills,
    effectiveSkillsLoadedKeyRef,
    loadEffectiveSkills,
  ]);

  useEffect(() => {
    const shouldLoadUserPlatformSkills =
      activePage === "discover" ||
      (activePage === "settings" && settingsPage === "integrations");
    if (!shouldLoadUserPlatformSkills) return;
    if (!session) {
      clearUserPlatformSkills();
      return;
    }
    if (userPlatformSkillsLoadedUserIdRef.current === session.user.id) return;
    void loadUserPlatformSkills(session);
  }, [
    activePage,
    session,
    settingsPage,
    clearUserPlatformSkills,
    loadUserPlatformSkills,
    userPlatformSkillsLoadedUserIdRef,
  ]);

  useEffect(() => {
    const shouldLoadCommunitySkills =
      (activePage === "community" && communityTab === "ai_agent") ||
      activePage === "discover" ||
      (activePage === "settings" && settingsPage === "integrations");
    if (!shouldLoadCommunitySkills) return;
    if (!session || !activeCommunityId || !canManageMembersActiveCommunity) {
      clearCommunitySkillAttachments();
      return;
    }
    if (communitySkillAttachmentsLoadedCommunityIdRef.current === activeCommunityId) return;
    void loadCommunitySkillAttachments(activeCommunityId, session);
  }, [
    activePage,
    communityTab,
    session,
    activeCommunityId,
    canManageMembersActiveCommunity,
    clearCommunitySkillAttachments,
    loadCommunitySkillAttachments,
    communitySkillAttachmentsLoadedCommunityIdRef,
  ]);

  useEffect(() => {
    const shouldLoadOwnedSkillPackages =
      (activePage === "community" && communityTab === "ai_agent") ||
      activePage === "discover";
    if (!shouldLoadOwnedSkillPackages) return;
    if (!session || !canManageMembersActiveCommunity) {
      clearCommunitySkillAttachments();
      return;
    }
    if (ownedSkillPackagesLoadedRef.current) return;
    void loadOwnedSkillPackages(session);
  }, [
    activePage,
    communityTab,
    session,
    canManageMembersActiveCommunity,
    clearCommunitySkillAttachments,
    loadOwnedSkillPackages,
    ownedSkillPackagesLoadedRef,
  ]);

  useCommunityDirectoryLifecycle<AuthSession>({
    activePage,
    communityTab,
    ...sessionArg,
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

  useCommunityResourcesTabLifecycle<AuthSession>({
    activePage,
    communityTab,
    ...sessionArg,
    activeCommunityId,
    loadCommunityResources,
    requireCommunityPage: true,
  });
  useCommunityEventsTabLifecycle<AuthSession>({
    activePage,
    communityTab,
    ...sessionArg,
    activeCommunityId,
    range: communityEventsVisibleRange,
    loadCommunityEvents,
    requireCommunityPage: true,
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

  function resumePendingAuthIntent(): void {
    if (!session) return;
    const intent = readAuthResumeState()?.intent;
    if (!intent) return;
    clearAuthResumeState();
    routePendingAuthIntent(intent, {
      select_model: (payload) => {
        void payload;
      },
      open_workspace_draft: (payload) => {
        void payload;
        void resolveAndEnterMemberDestination({ replace: true }).then((entered) => {
          if (!entered) navigateTo("/discover", { replace: true });
        });
      },
      connect_provider: (payload) => {
        if (payload.provider === "chatgpt") {
          void providerConnectionUi.handleConnectChatgpt();
          return;
        }
        if (payload.provider === "openai") {
          openGlobalSettings("account");
          showAppToastMessage("Paste your OpenAI API key in Account settings.");
          return;
        }
        showAppToastMessage("Provider connection is not available.");
	      },
	      create_community: (payload) => {
	        if (payload.draft) {
	          openCreateCommunityModal(payload.draft);
	          return;
	        }
	        openCommunityLaunchCreateFlow();
	      },
      join_public_community: (payload) => {
        void joinPublicCommunity({
          communitySlug: payload.community_slug,
          origin: "auth_resume",
        });
      },
      try_polynet_free: () => {
        void routeTryPolynetFree(session);
      },
    });
  }

  const providerConnectionUi = useWebProviderConnectionUiController<AuthSession>({
    session: session,
    getSession: () => sessionRef.current ?? session,
    ensureSession: ensureUsableAuthSession,
    requireSignIn: (intent) => requireSignIn(intent),
    chatgptConnection,
    onConnectionsUpdated: (connections) => {
      setOpenAiConnection(connections.openai);
      setChatgptConnection(connections.chatgpt);
      void refreshAccountSetupStatus();
    },
    chatgptSecuritySettingsUrl: CHATGPT_SECURITY_SETTINGS_URL,
    getReturnToPath: () => `${window.location.pathname}${window.location.search}`,
  });
  const { applyProviderConnectionLoadError } = providerConnectionUi;

  const handleDismissCommunityAgentServeIssue = useCallback((issueId: string): void => {
    const normalizedIssueId = String(issueId ?? "").trim();
    if (normalizedIssueId) {
      dismissedCommunityAgentServeIssueIdsRef.current.add(normalizedIssueId);
    }
    setCommunityAgentServeIssue((current) =>
      current && current.id === normalizedIssueId ? null : current,
    );
  }, []);

  const handleConnectCommunityAgentServeProvider = useCallback((): void => {
    void providerConnectionUi.handleConnectChatgpt();
  }, [providerConnectionUi]);

  const loadProviderConnections = useCallback(async (session: AuthSession): Promise<void> => {
    const usableSession = await ensureUsableAuthSession(session);
    if (!usableSession) return;
    setIsLoadingChatgptConnection(true);
    try {
      const result = await loadCloudProviderConnections({
        session: usableSession,
      });
      setOpenAiConnection(result.openai);
      setChatgptConnection(result.chatgpt);
      applyProviderConnectionLoadError(null);
    } catch (error) {
      const message = formatProviderConnectionErrorMessage(error, "Failed to load provider connections.");
      applyProviderConnectionLoadError(message);
    } finally {
      setIsLoadingChatgptConnection(false);
    }
  }, [applyProviderConnectionLoadError, ensureUsableAuthSession]);

  useEffect(() => {
    if (!session) {
      navStackRef.current = [];
      setUserMemorySettings({ memory_mode: "auto", remember_intent_enabled: true, agent_name: "", agent_soul: "" });
      setChatgptConnection({
        provider: "chatgpt",
        auth_kind: "oauth_tokens",
        connected: false,
        email: null,
        account_id: null,
        access_token_expires_at: null,
        validated_at: null,
        updated_at: null,
      });
      setOpenAiConnection({
        provider: "openai",
        auth_kind: "api_key",
        connected: false,
        key_last_four: null,
        validated_at: null,
        updated_at: null,
      });
      setAccountSetupStatus(null);
      setIsLoadingAccountSetupStatus(false);
      setIsLoadingChatgptConnection(false);
      return;
    }
    void (async () => {
      const usableSession = await ensureUsableAuthSession(session);
      if (!usableSession) return;
      await Promise.all([
        loadUserMemorySettings(usableSession),
        loadProviderConnections(usableSession),
        refreshAccountSetupStatus(usableSession),
      ]);
    })();
  }, [session, loadProviderConnections, refreshAccountSetupStatus]);

  const {
    cancelMyPendingJoinRequest,
    joinPublicCommunity,
    loadPublicCommunity,
  } = useWebPublicFunnelActions<
    PublicCommunityRecord,
    PublicPlanSummary,
    CommunityAccess
  >({
    getSession: () => sessionRef.current,
    getCurrentPublicCommunitySlug: () => publicCommunityUi.publicCommunity?.slug ?? null,
    getCurrentPublicFunnelSlug: () =>
      shellPublicRoute.kind === "community_funnel" ||
      shellPublicRoute.kind === "community_funnel_preview"
        ? shellPublicRoute.slug
        : null,
    getCurrentAuthSubject: () => canonicalSessionUserId,
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
    setPublicCommunityAccessResolution: publicCommunityUi.setPublicCommunityAccessResolution,
    setIsLoadingPublicCommunity: publicCommunityUi.setIsLoadingPublicCommunity,
    setPublicCommunityError: publicCommunityUi.setPublicCommunityError,
    setPublicCommunityPlans: publicCommunityUi.setPublicCommunityPlans,
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

  const { loadAccountCommerceStatus } = useWebAccountCommerceStatusActions({
    ensureSession: ensureUsableAuthSession,
    setIsLoadingAccountCommerce,
    setAccountCommerceError,
    setAccountCommerceStatus,
  });

  const loadBuilderPartnerProgram = useCallback(
    async (nextSession?: AuthSession | null): Promise<BuilderPartnerProgramSnapshot | null> => {
      const requestId = ++builderPartnerProgramLoadRequestIdRef.current;
      const usableSession = await ensureUsableAuthSession(nextSession ?? undefined, "builder_partner_program_load");
      if (!usableSession) {
        if (requestId === builderPartnerProgramLoadRequestIdRef.current) {
          setBuilderPartnerProgram(null);
        }
        return null;
      }
      setIsLoadingBuilderPartnerProgram(true);
      setBuilderPartnerProgramError(null);
      try {
        const snapshot = await loadBuilderPartnerProgramCanonical({
          session: usableSession,
        });
        if (requestId === builderPartnerProgramLoadRequestIdRef.current) {
          setBuilderPartnerProgram(snapshot);
        }
        return snapshot;
      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to load Builder Partner status.";
        if (requestId === builderPartnerProgramLoadRequestIdRef.current) {
          if (isTransportRefreshError(error)) {
            console.warn("Builder Partner Program refresh failed:", error);
            setBuilderPartnerProgramError(null);
          } else {
            setBuilderPartnerProgramError(message);
            setBuilderPartnerProgram(null);
          }
        }
        return null;
      } finally {
        if (requestId === builderPartnerProgramLoadRequestIdRef.current) {
          setIsLoadingBuilderPartnerProgram(false);
        }
      }
    },
    [ensureUsableAuthSession],
  );

  const acceptBuilderPartnerTerms = useCallback(async (termsVersion: string): Promise<void> => {
    const usableSession = await ensureUsableAuthSession();
    if (!usableSession) {
      requireSignIn();
      return;
    }
    setIsAcceptingBuilderPartnerTerms(true);
    setBuilderPartnerProgramError(null);
    try {
      const snapshot = await acceptBuilderPartnerTermsCanonical({
        session: usableSession,
        termsVersion,
      });
      setBuilderPartnerProgram(snapshot);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to unlock Builder Partner Program.";
      setBuilderPartnerProgramError(message);
    } finally {
      setIsAcceptingBuilderPartnerTerms(false);
    }
  }, [ensureUsableAuthSession, requireSignIn]);

  useEffect(() => {
    void captureBuilderPartnerAttributionFromCurrentUrl({
      session,
    }).catch((error) => {
      console.warn("Failed to capture Builder Partner attribution:", error);
    });
  }, [canonicalSessionUserId, session]);

  useEffect(() => {
    if (!session) {
      setBuilderPartnerProgram(null);
      setBuilderPartnerProgramError(null);
      setIsLoadingBuilderPartnerProgram(false);
      return;
    }
    if (activeView !== "settings" || settingsGroup !== "partners") return;
    void loadBuilderPartnerProgram(session as AuthSession);
  }, [
    activeView,
    canonicalSessionUserId,
    communities.length,
    loadBuilderPartnerProgram,
    session,
    settingsGroup,
  ]);

  async function setDevAccountTier(tier: "free" | "architect"): Promise<void> {
    const session = await ensureUsableAuthSession();
    if (!session || !canUseDevTierOverride) return;
    setIsSettingDevAccountTier(true);
    setDevAccountTierError(null);
    try {
      await setDevAccountTierCanonical({
        session,
        tier,
      });
      await loadAccountCommerceStatus(session);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to set dev account tier.";
      setDevAccountTierError(message);
    } finally {
      setIsSettingDevAccountTier(false);
    }
  }

  const startPremiumSubscriptionCheckout = useCallback(async (): Promise<void> => {
    const session = await ensureUsableAuthSession();
    if (!session) {
      requireSignIn();
      return;
    }
    try {
      const returnUrl = buildPremiumSubscriptionReturnUrl();
      const data = await startCloudPremiumSubscriptionCheckout({
        session,
        successUrl: returnUrl,
        cancelUrl: returnUrl,
      });
      const checkoutUrl =
        data && typeof data === "object" && typeof (data as { checkout_url?: unknown }).checkout_url === "string"
          ? String((data as { checkout_url?: unknown }).checkout_url).trim()
          : "";
      if (!checkoutUrl) throw new Error("Missing checkout_url.");
      captureProductAnalyticsEvent("premium subscription checkout started", {
        surface: "settings_billing",
      });
      window.location.assign(checkoutUrl);
    } catch (error) {
      throw new Error(formatWorkspaceBillingCheckoutError(error, { kind: "premium_subscription" }));
    }
  }, [ensureUsableAuthSession, requireSignIn]);

  const effectiveAccountSetupStatus = accountSetupStatus ?? cloudProfile?.account_setup ?? null;
  const isProfileSetupCompleteForPublicActions =
    !session || Boolean(effectiveAccountSetupStatus && isAccountSetupStatusIdentityComplete(effectiveAccountSetupStatus));
  const isAccountSetupCompleteForBuilderActions =
    !session || Boolean(effectiveAccountSetupStatus?.completed);

  useEffect(() => {
    if (isCommunityLaunchCreateMode) {
      communityLaunchSetupStatusLoadedCommunityIdRef.current = null;
      setCommunityLaunchSetupStatus(null);
      setCommunityLaunchSetupError(null);
      setIsLoadingCommunityLaunchSetupStatus(false);
      return;
    }
    const shouldLoadLaunchStatus =
      Boolean(session) &&
      Boolean(activeCommunityId) &&
      Boolean(canManageCommunitySettings) &&
      Boolean(effectiveAccountSetupStatus?.completed) &&
      activePage === "community" &&
      Boolean(
        isCommunityLaunchSetupModalOpen ||
          pendingCommunityLaunchKnowledgeOAuthContext ||
          pendingCommunityLaunchSetupRouteContext,
      );
    if (!shouldLoadLaunchStatus || !session || !activeCommunityId) {
      communityLaunchSetupStatusLoadedCommunityIdRef.current = null;
      setCommunityLaunchSetupStatus(null);
      setCommunityLaunchSetupError(null);
      setIsLoadingCommunityLaunchSetupStatus(false);
      if (!pendingCommunityLaunchKnowledgeOAuthContext && !pendingCommunityLaunchSetupRouteContext) {
        setIsCommunityLaunchSetupModalOpen(false);
        setCommunityLaunchSetupInitialStep(null);
      }
      return;
    }
    let cancelled = false;
    communityLaunchSetupStatusLoadedCommunityIdRef.current = null;
    setIsLoadingCommunityLaunchSetupStatus(true);
    setCommunityLaunchSetupError(null);
    void loadCloudCommunityLaunchSetupStatus({
      session,
      communityId: activeCommunityId,
    })
      .then((status) => {
        if (cancelled) return;
        communityLaunchSetupStatusLoadedCommunityIdRef.current = activeCommunityId;
        setCommunityLaunchSetupStatus(status);
      })
      .catch((error) => {
        if (cancelled) return;
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to load community launch setup.";
        setCommunityLaunchSetupStatus(null);
        communityLaunchSetupStatusLoadedCommunityIdRef.current = null;
        setCommunityLaunchSetupError(message);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCommunityLaunchSetupStatus(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    session,
    isCommunityLaunchCreateMode,
    activeCommunityId,
    activePage,
    activeView,
    canManageCommunitySettings,
    effectiveAccountSetupStatus?.completed,
    activeCommunity?.updated_at,
    isCommunityLaunchSetupModalOpen,
    pendingCommunityLaunchKnowledgeOAuthContext,
    pendingCommunityLaunchSetupRouteContext,
  ]);

  const refreshActiveCommunityLaunchSetupStatus = useCallback(async () => {
    if (!session || !activeCommunityId) return;
    setIsLoadingCommunityLaunchSetupStatus(true);
    setCommunityLaunchSetupError(null);
    try {
      const status = await loadCloudCommunityLaunchSetupStatus({
        session,
        communityId: activeCommunityId,
      });
      communityLaunchSetupStatusLoadedCommunityIdRef.current = activeCommunityId;
      setCommunityLaunchSetupStatus(status);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to load community launch setup.";
      setCommunityLaunchSetupStatus(null);
      communityLaunchSetupStatusLoadedCommunityIdRef.current = null;
      setCommunityLaunchSetupError(message);
    } finally {
      setIsLoadingCommunityLaunchSetupStatus(false);
    }
  }, [activeCommunityId, session]);

  useEffect(() => {
    const context = pendingCommunityLaunchKnowledgeOAuthContext;
    if (!context?.shouldRestore) return;
    const targetCommunityId = normalizeLaunchOAuthContextParam(context.communityId);
    const targetCommunitySlug = normalizeLaunchOAuthContextParam(context.communitySlug);
    const activeId = normalizeLaunchOAuthContextParam(activeCommunityId);
    const activeSlug = normalizeLaunchOAuthContextParam(selectedActiveCommunitySlug ?? activeCommunity?.slug);
    const hasTarget = Boolean(targetCommunityId || targetCommunitySlug);
    const activeMatchesTarget =
      !hasTarget ||
      (targetCommunityId ? activeId === targetCommunityId : false) ||
      (targetCommunitySlug ? activeSlug === targetCommunitySlug : false);

    if (hasTarget && !activeMatchesTarget) {
      applyCommunityShellState({
        communityId: targetCommunityId,
        communitySlug: targetCommunitySlug,
        communityTab: "settings",
      });
      return;
    }

    if (
      !session ||
      !activeCommunity ||
      !communityLaunchSetupStatus ||
      communityLaunchSetupStatusLoadedCommunityIdRef.current !== activeId ||
      isLoadingCommunityLaunchSetupStatus ||
      communityLaunchSetupError
    ) {
      return;
    }

    setIsCommunityLaunchCreateMode(false);
    setCommunityLaunchSetupInitialStep("knowledge");
    setIsCommunityLaunchSetupModalOpen(true);
    setPendingCommunityLaunchKnowledgeOAuthContext(null);
  }, [
    activeCommunity,
    activeCommunityId,
    applyCommunityShellState,
    communityLaunchSetupError,
    communityLaunchSetupStatus,
    isLoadingCommunityLaunchSetupStatus,
    pendingCommunityLaunchKnowledgeOAuthContext,
    selectedActiveCommunitySlug,
    session,
  ]);

  useEffect(() => {
    const context = pendingCommunityLaunchSetupRouteContext;
    if (!context?.shouldRestore || !context.step) return;
    const targetCommunityId = normalizeLaunchOAuthContextParam(context.communityId);
    const targetCommunitySlug = normalizeLaunchOAuthContextParam(context.communitySlug);
    const activeId = normalizeLaunchOAuthContextParam(activeCommunityId);
    const activeSlug = normalizeLaunchOAuthContextParam(selectedActiveCommunitySlug ?? activeCommunity?.slug);
    const hasTarget = Boolean(targetCommunityId || targetCommunitySlug);
    const activeMatchesTarget =
      !hasTarget ||
      (targetCommunityId ? activeId === targetCommunityId : false) ||
      (targetCommunitySlug ? activeSlug === targetCommunitySlug : false);

    if (hasTarget && !activeMatchesTarget) {
      applyCommunityShellState({
        communityId: targetCommunityId,
        communitySlug: targetCommunitySlug,
        communityTab: "settings",
      });
      return;
    }

    if (
      !session ||
      !activeCommunity ||
      !communityLaunchSetupStatus ||
      communityLaunchSetupStatusLoadedCommunityIdRef.current !== activeId ||
      isLoadingCommunityLaunchSetupStatus ||
      communityLaunchSetupError
    ) {
      return;
    }

    setIsCommunityLaunchCreateMode(false);
    setCommunityLaunchSetupInitialStep(context.step);
    setIsCommunityLaunchSetupModalOpen(true);
    setPendingCommunityLaunchSetupRouteContext(null);
  }, [
    activeCommunity,
    activeCommunityId,
    applyCommunityShellState,
    communityLaunchSetupError,
    communityLaunchSetupStatus,
    isLoadingCommunityLaunchSetupStatus,
    pendingCommunityLaunchSetupRouteContext,
    selectedActiveCommunitySlug,
    session,
  ]);

  const communityUi = useWebCommunityUiController<
    AuthSession,
    CommunityRecord,
    AccountCommerceStatus
  >({
    ...authenticatedSessionArg,
    communities,
    communityRoleById,
    accountCommerceStatus,
    accountCommerceError,
    isAccountSetupComplete: isAccountSetupCompleteForBuilderActions,
    communityInitials,
    loadAccountCommerceStatus,
    persistCreateCommunityIntent,
    onPrimaryUnauthenticated: (draft) => {
      requireSignIn({ reason: "create_community", payload: { draft } });
    },
    onCreateUnauthenticated: (draft) => {
      requireSignIn({ reason: "create_community", payload: { draft } });
    },
    onAccountSetupRequired: openProfileSetup,
    onOwnedCommunityLimitReached: () => {
      setIsFreeAccountInfoOpen(true);
    },
    onCommunityCreated: (community) => {
      setCommunities((prev) => [community, ...prev]);
      setCommunityRoleById((prev) => ({ ...prev, [community.id]: "owner" }));
      void enterJoinedCommunity({
        communityId: community.id,
        communitySlug: community.slug,
      });
    },
    readBannerFileAsWideDataUrlWithinLimit,
    isLikelyImageFile,
    maxCreateImageDataUrlChars: MAX_WEB_IMAGE_DATA_URL_CHARS,
    createUnauthenticatedErrorMessage: "Sign in to create a community.",
    bannerLoadFailureMessage: "Failed to load banner.",
  });
  const { openCreateCommunityModal } = communityUi;

  const {
    publicFunnelSlug,
    isPublicFunnelPreviewRoute,
    checkoutSuccessSessionId,
    isPublicCommunityFunnel,
    showPublicSignIn,
    selectedPublicCommunityPlan,
    publicVisibilityLabel,
    resolvedPublicCommunity,
    publicCommunityAdmissionStatus,
    canEnterPublicCommunity,
    canJoinForFree,
    canJoinWithApproval,
    canJoinWithCheckout,
    approvalPending,
    approvalDenied,
    canRequestAgain,
    approvalReapplyLabel,
  } = useWebPublicCommunityRouteController<PublicCommunityRecord>({
    publicRoute: shellPublicRoute,
    publicCommunity: publicCommunityUi.publicCommunity,
    publicCommunityPlans: publicCommunityUi.publicCommunityPlans,
    publicCommunityAccess: publicCommunityUi.publicCommunityAccess,
    publicCommunityAccessResolution: publicCommunityUi.publicCommunityAccessResolution,
    authSubject: canonicalSessionUserId,
    isSignedIn: Boolean(session),
    /* Re-fire only when the authenticated principal changes. Token refreshes
       preserve the subject and must not re-hammer the public funnel queries. */
    sessionDependency: canonicalSessionUserId,
    loadPublicCommunity,
  });
  const { startCheckoutForPlan } = useWebPublicCheckoutStart({
    getSession: () => sessionRef.current,
    ensureSession: ensureUsableAuthSession,
    getCurrentPublicFunnelSlug: () => publicFunnelSlug,
    getCurrentBillingPeriod: () =>
      selectedPublicCommunityPlan?.billing_period ?? null,
    getCurrentAuthSubject: () => canonicalSessionUserId,
    getCurrentRouteAuthority: () =>
      `${shellVariant}:${shellPublicRoute.kind}:${publicFunnelSlug ?? ""}`,
    requireSignIn,
    setCheckoutError,
    setCheckoutStatus,
    navigateToUrl: (url) => window.location.assign(url),
  });
  useEffect(() => {
    if (publicCommunityAdmissionStatus === "ready") return;
    setIsBridgeGateOpen(false);
    setBridgePendingEntry(null);
  }, [publicCommunityAdmissionStatus]);
  /* Visitor lens: locked shell-nav tabs reopen the join gate on the funnel
     surface (nonce bump crosses the shell/surface boundary). */
  const [visitorGateNonce, setVisitorGateNonce] = useState(0);
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

  const { retryCheckoutFinalize } = useCheckoutFinalizeController({
    checkoutSuccessSessionId,
    getSession: () => sessionRef.current,
    onAccessReady: async (community) => {
      const activeSession = sessionRef.current;
      if (!activeSession) throw new Error("Authentication required.");
      await loadCommunities(activeSession);
      enterCommunityThroughBridge({
        communityId: community.id,
        communitySlug: community.slug,
      });
    },
    setCheckoutStatus,
    setCheckoutError,
  });

  useEffect(() => {
    if (checkoutSuccessSessionId) scrubCurrentRouteSearchParams(["session_id"]);
  }, [checkoutSuccessSessionId]);

  type WorkspaceLensTarget = {
    threadId: string;
    communityId: string | null;
    communityName: string;
    session: AuthSession;
  };

  const [, setWorkspaceLensStatus] = useState<{ inFlight: boolean; targetName: string | null }>({
    inFlight: false,
    targetName: null,
  });
  const workspaceLensPendingByThreadIdRef = useRef<Record<string, Promise<void> | undefined>>({});

  const workspaceLensController = useLastClickWinsController<WorkspaceLensTarget>({
    applyTarget: async (desired) => {
      const result = await setThreadCommunityLens(desired.threadId, desired.communityId, desired.session);
      if (!result || (result.community_id ?? null) !== desired.communityId) {
        throw new Error("Community context was not confirmed.");
      }
    },
    onWorkerStateChange: ({ inFlight, target }) => {
      if (!inFlight) {
        setWorkspaceLensStatus({ inFlight: false, targetName: null });
        return;
      }
      setWorkspaceLensStatus((prev) => ({
        inFlight: true,
        targetName: target ? target.communityName : prev.targetName,
      }));
    },
    onTargetSettled: ({ target, isLatest, error }) => {
      if (!isLatest) return;
      traceThreadContext("lens_set_settled", {
        surface: "web",
        thread_id: target.threadId,
        to_community_id: target.communityId,
        is_latest: isLatest,
        status: error ? "error" : "ok",
        error:
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : null,
      });
      if (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to switch community context.";
        showAppToastMessage(message);
        return;
      }
      showAppToastMessage(
        target.communityId ? `Now using ${target.communityName}.` : "Cleared community context.",
      );
    },
  });

  const requestWorkspaceThreadLens = (target: WorkspaceLensTarget): Promise<void> => {
    const currentThread = threads.find((t) => t.id === target.threadId) ?? null;
    const currentLens = currentThread?.community_id ?? null;
    const existingPending = workspaceLensPendingByThreadIdRef.current[target.threadId] ?? null;
    if (currentLens === target.communityId && existingPending) {
      return existingPending;
    }
    if (currentLens === target.communityId && !workspaceLensController.isInFlight()) {
      return Promise.resolve();
    }
    const previousContext = currentThread
      ? {
          communityId: currentThread.community_id ?? null,
          contextVersion: currentThread.context_version,
          updatedAt: currentThread.updated_at,
        }
      : null;
    if (currentThread && currentLens !== target.communityId) {
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === target.threadId
            ? {
                ...thread,
                community_id: target.communityId,
                updated_at: Math.floor(Date.now() / 1000),
              }
            : thread,
        ),
      );
    }
    const requestPromise = workspaceLensController.requestTarget(target).then(
      () => undefined,
      (error) => {
        if (previousContext) {
          setThreads((prev) =>
            prev.map((thread) =>
              thread.id === target.threadId && (thread.community_id ?? null) === target.communityId
                ? {
                    ...thread,
                    community_id: previousContext.communityId,
                    context_version: previousContext.contextVersion,
                    updated_at: previousContext.updatedAt,
                  }
                : thread,
            ),
          );
        }
        throw error;
      },
    );
    workspaceLensPendingByThreadIdRef.current[target.threadId] = requestPromise;
    void requestPromise.finally(() => {
      if (workspaceLensPendingByThreadIdRef.current[target.threadId] === requestPromise) {
        delete workspaceLensPendingByThreadIdRef.current[target.threadId];
      }
    });
    return requestPromise;
  };

  const syncWorkspaceThreadCommunityLens = (
    threadId: string,
    desiredCommunityId: string | null,
    session: AuthSession,
  ): Promise<void> => {
    const desiredName = desiredCommunityId
      ? (communities.find((community) => community.id === desiredCommunityId)?.name ?? desiredCommunityId)
      : "none";
    const currentThread = threads.find((thread) => thread.id === threadId) ?? null;
    traceThreadContext("lens_set_requested", {
      surface: "web",
      thread_id: threadId,
      from_community_id: currentThread?.community_id ?? null,
      to_community_id: desiredCommunityId,
      context_version:
        typeof currentThread?.context_version === "number" ? currentThread.context_version : null,
    });
    return requestWorkspaceThreadLens({
      threadId,
      communityId: desiredCommunityId,
      communityName: desiredName,
      session,
    });
  };

  const webThreadContextController = createThreadContextController<ThreadRecord>({
    surface: "web",
    getActivePage: () => activePage,
    getDesiredCommunityId: () => activeCommunityId ?? null,
    getActiveThreadId: () => activeThreadId,
    getActiveCommunityId: () => activeCommunityId ?? null,
    findThreadById: (threadId: string) => threads.find((thread) => thread.id === threadId) ?? null,
    getLatestThreadRecord: async (threadId: string) =>
      threads.find((thread) => thread.id === threadId) ?? null,
    syncThreadCommunityLens: (thread: ThreadRecord, desiredCommunityId: string | null) => {
      if (!session) return Promise.resolve();
      return syncWorkspaceThreadCommunityLens(thread.id, desiredCommunityId, session);
    },
    onSelectThread: (thread: ThreadRecord) => {
      adoptWorkspaceThreadSelection(thread);
    },
    trace: traceThreadContext,
    buildThreadSelectedTrace: (thread: ThreadRecord) => ({
      to_context_version:
        typeof thread.context_version === "number" ? thread.context_version : null,
    }),
  });

  const ensureWorkspaceThreadLensBeforeSend = async (
    threadId: string,
    session: AuthSession,
  ): Promise<void> => {
    void session;
    const pendingLensSync = workspaceLensPendingByThreadIdRef.current[threadId] ?? null;
    if (pendingLensSync) {
      await pendingLensSync;
    }
    return webThreadContextController.ensureLensBeforeSend(threadId);
  };

  function getLastThreadMessageId(messages: ThreadMessage[], role: "user" | "assistant" | "system"): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg?.role === role) return msg.id;
    }
    return null;
  }

  function displayNameForAttachmentFile(file: File, fallbackIndex: number): string {
    const existingName = (file.name ?? "").trim();
    if (existingName) return existingName;
    const mime = (file.type ?? "").toLowerCase();
    const extension =
      mime === "image/png"
        ? "png"
        : mime === "image/jpeg"
          ? "jpg"
          : mime === "image/webp"
            ? "webp"
            : mime === "image/gif"
              ? "gif"
              : mime === "application/pdf"
                ? "pdf"
                : "bin";
    return `${mime.startsWith("image/") ? "Pasted image" : "Attachment"} ${fallbackIndex + 1}.${extension}`;
  }

  async function ingestWorkspaceAttachmentsFromFileList(
    files: FileList | readonly File[],
    existing: MessageAttachment[],
    onError: (message: string) => void,
  ): Promise<MessageAttachment[]> {
    if (files.length === 0) return existing;
    const remaining = Math.max(0, MAX_WEB_ATTACHMENTS_PER_MESSAGE - existing.length);
    if (remaining === 0) {
      onError(`You can attach up to ${MAX_WEB_ATTACHMENTS_PER_MESSAGE} files per message.`);
      return existing;
    }

    const picked = Array.from(files).slice(0, remaining);
    const next: MessageAttachment[] = [];
    for (const [index, file] of picked.entries()) {
      if (!file) continue;
      const name = displayNameForAttachmentFile(file, index);
      const isImage = isLikelyImageFile(file);
      const isMedia = !isImage && isLikelyMediaFile(file);
      const maxBytes = isImage
        ? MAX_WEB_IMAGE_UPLOAD_BYTES
        : isMedia
          ? MAX_WEB_MEDIA_UPLOAD_BYTES
          : MAX_WEB_FILE_UPLOAD_BYTES;
      if (file.size > maxBytes) {
        onError(`${name} is too large (max ${(maxBytes / (1024 * 1024)).toFixed(0)}MB).`);
        continue;
      }
      const base: MessageAttachment = {
        id: crypto.randomUUID(),
        name,
        type: "file",
        mime: (file.type ?? "").trim() || null,
        size: file.size,
        file,
      };
      try {
        if (isImage) {
          if (!isSupportedChatRasterImage(file)) {
            onError(`${name}: unsupported image format. Please use PNG, JPG, GIF, WEBP, or AVIF.`);
            continue;
          }
          base.type = "image";
          base.data_url = await readChatImageAsDataUrl(file, MAX_WEB_IMAGE_DATA_URL_CHARS);
          next.push(base);
          continue;
        } else if (isLikelyTextFile(file)) {
          const { text, truncated } = await readTextAttachmentPreview(file, MAX_WEB_TEXT_ATTACHMENT_BYTES);
          base.text = text;
          base.truncated = truncated;
          next.push(base);
          continue;
        }
      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to read file.";
        onError(`${name}: ${message}`);
        continue;
      }
      next.push(base);
    }

    return [...existing, ...next];
  }

  async function ingestCommunityAttachmentsFromFileList(
    files: FileList | readonly File[],
    existing: MessageAttachment[],
    onError: (message: string) => void,
  ): Promise<MessageAttachment[]> {
    if (files.length === 0) return existing;
    const remaining = Math.max(0, MAX_WEB_ATTACHMENTS_PER_MESSAGE - existing.length);
    if (remaining === 0) {
      onError(`You can attach up to ${MAX_WEB_ATTACHMENTS_PER_MESSAGE} files per message.`);
      return existing;
    }

    const picked = Array.from(files).slice(0, remaining);
    const next: MessageAttachment[] = [];
    for (const [index, file] of picked.entries()) {
      if (!file) continue;
      const name = displayNameForAttachmentFile(file, index);
      const isImage = isLikelyImageFile(file);
      const isMedia = !isImage && isLikelyMediaFile(file);
      const maxBytes = isImage
        ? MAX_WEB_IMAGE_UPLOAD_BYTES
        : isMedia
          ? MAX_WEB_MEDIA_UPLOAD_BYTES
          : MAX_WEB_FILE_UPLOAD_BYTES;
      if (file.size > maxBytes) {
        onError(`${name} is too large (max ${(maxBytes / (1024 * 1024)).toFixed(0)}MB).`);
        continue;
      }
      const base: MessageAttachment = {
        id: crypto.randomUUID(),
        name,
        type: "file",
        mime: (file.type ?? "").trim() || null,
        size: file.size,
        file,
      };
      try {
        if (isImage) {
          if (!isSupportedChatRasterImage(file)) {
            onError(`${name}: unsupported image format. Please use PNG, JPG, GIF, WEBP, or AVIF.`);
            continue;
          }
          base.type = "image";
          base.data_url = await readChatImageAsDataUrl(file, MAX_WEB_IMAGE_DATA_URL_CHARS);
          next.push(base);
          continue;
        }
        if (isLikelyTextFile(file)) {
          const { text, truncated } = await readTextAttachmentPreview(file, MAX_WEB_TEXT_ATTACHMENT_BYTES);
          base.text = text;
          base.truncated = truncated;
          next.push(base);
          continue;
        }
      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to read file.";
        onError(`${name}: ${message}`);
        continue;
      }
      next.push(base);
    }

    return [...existing, ...next];
  }

  async function prepareCommunityAttachmentsForSend(
    attachments: MessageAttachment[],
    session: AuthSession,
    communityId: string,
  ): Promise<MessageAttachment[]> {
    const prepared: MessageAttachment[] = [];
    for (const attachment of attachments) {
      const currentStorageId = String(attachment.storage_id ?? "").trim();
      let nextStorageId = currentStorageId || null;
      if (!nextStorageId && attachment.file instanceof File) {
        nextStorageId = await uploadCloudCommunityChatAttachmentFile({
          session,
          communityId,
          file: attachment.file,
        });
      }
      prepared.push({
        ...attachment,
        storage_id: nextStorageId,
        file: null,
      });
    }
    return prepared;
  }

  async function prepareWorkspaceAttachmentsForSend(
    attachments: MessageAttachment[],
    session: AuthSession,
    threadId: string,
  ): Promise<MessageAttachment[]> {
    const prepared: MessageAttachment[] = [];
    for (const attachment of attachments) {
      const currentStorageId = String(attachment.storage_id ?? "").trim();
      let nextStorageId = currentStorageId || null;
      if (!nextStorageId && attachment.file instanceof File) {
        nextStorageId = await uploadCloudThreadAttachmentFile({
          session,
          threadId,
          file: attachment.file,
        });
      }
      prepared.push({
        ...attachment,
        storage_id: nextStorageId,
        file: null,
      });
    }
    return prepared;
  }

  function serializeCommunityAttachmentsForWrite(attachments: MessageAttachment[]): unknown[] {
    const out: unknown[] = [];
    for (const attachment of attachments) {
      const storageId = String(attachment.storage_id ?? "").trim();
      const dataUrl =
        typeof attachment.data_url === "string" && attachment.data_url.trim().startsWith("data:")
          ? attachment.data_url.trim()
          : "";
      if (!storageId && !dataUrl) continue;
      out.push({
        id: attachment.id,
        name: attachment.name,
        type: attachment.type,
        mime: attachment.mime ?? null,
        size: attachment.size,
        ...(storageId ? { storageId } : null),
        ...(dataUrl ? { data_url: dataUrl } : null),
        ...(attachment.text ? { text: attachment.text } : null),
        ...(typeof attachment.truncated === "boolean" ? { truncated: attachment.truncated } : null),
      });
    }
    return out;
  }

  const hasUserKeyConnection = Boolean(session) && openAiConnection.connected;
  const hasUserChatgptConnection = Boolean(session) && chatgptConnection.connected;
  const hasPendingChatgptAuth = providerConnectionUi.hasPendingChatgptAuth;
  const requestedActiveRuntimeEngineForWorkspace =
    !workspaceWantsNewChat && activeThreadId
      ? normalizeActiveWorkspaceRuntimeEngine(
          threads.find((thread) => thread.id === activeThreadId)?.runtime_engine ??
            activeRuntimeEngine,
        )
      : activeRuntimeEngine;
  const hasResolvedRuntimeAccessTier =
    !session || accountCommerceStatus !== null || !isLoadingAccountCommerce;
  const runtimePickerAccountTier = hasResolvedRuntimeAccessTier
    ? accountCommerceStatus?.account_tier ?? null
    : "architect";
  const activeRuntimeEngineForWorkspace = !hasResolvedRuntimeAccessTier || canUseRuntimeEngineForTier({
    engine: requestedActiveRuntimeEngineForWorkspace,
    accountTier: runtimePickerAccountTier,
  })
    ? requestedActiveRuntimeEngineForWorkspace
    : RUNTIME_ENGINE_POLYNET;
  useEffect(() => {
    if (workspaceWantsNewChat || !activeThreadId) return;
    if (!hasResolvedRuntimeAccessTier) return;
    const normalizedThreadRuntimeEngine = normalizeActiveWorkspaceRuntimeEngine(
      threads.find((thread) => thread.id === activeThreadId)?.runtime_engine ??
        activeRuntimeEngine,
    );
    const threadRuntimeEngine = canUseRuntimeEngineForTier({
      engine: normalizedThreadRuntimeEngine,
      accountTier: accountCommerceStatus?.account_tier ?? null,
    })
      ? normalizedThreadRuntimeEngine
      : RUNTIME_ENGINE_POLYNET;
    if (threadRuntimeEngine !== normalizedThreadRuntimeEngine) {
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === activeThreadId
            ? { ...thread, runtime_engine: threadRuntimeEngine }
            : thread,
        ),
      );
      const session = sessionRef.current;
      if (session) {
        void updateThreadRuntimeEngine(activeThreadId, threadRuntimeEngine, session as AuthSession);
      }
    }
    if (!threadRuntimeEngine || threadRuntimeEngine === activeRuntimeEngine) return;
    setActiveRuntimeEngine(threadRuntimeEngine);
  }, [
    activeRuntimeEngine,
    activeThreadId,
    accountCommerceStatus?.account_tier,
    hasResolvedRuntimeAccessTier,
    setActiveRuntimeEngine,
    setThreads,
    threads,
    updateThreadRuntimeEngine,
    workspaceWantsNewChat,
  ]);
  const shouldShowAccountSetupCard =
    Boolean(session) &&
    Boolean(effectiveAccountSetupStatus) &&
    !effectiveAccountSetupStatus?.completed &&
    !isLoadingAccountSetupStatus;
  const shouldShowCommunityLaunchSetupCard =
    Boolean(session) &&
    Boolean(activeCommunity) &&
    Boolean(canManageCommunitySettings) &&
    Boolean(effectiveAccountSetupStatus?.completed) &&
    Boolean(communityLaunchSetupStatus) &&
    !communityLaunchSetupStatus?.completed &&
    !isLoadingCommunityLaunchSetupStatus &&
    !communityLaunchSetupError;

  const { sendUserMessage, retryLastTurn } = useWebSendFlowController<
    AuthSession,
    MessageAttachment,
    ThreadRecord,
    ThreadMessage
  >({
    getSession: () => sessionRef.current,
    ensureSession: ensureUsableAuthSession,
    requireSignIn,
    ensureWorkspaceThreadLensBeforeSend,
    onWorkspaceRunStarted: ({
      threadId,
      projectId,
      communityId,
      modelId,
      runtimeEngine,
      requestedFundingSource,
      inferenceSource,
      startedInDraft,
      hasAttachments,
    }) => {
      captureProductAnalyticsEvent("workspace run started", {
        thread_id: threadId,
        project_id: projectId,
        community_id: communityId,
        model_id: modelId,
        runtime_engine: runtimeEngine,
        requested_funding_source: requestedFundingSource,
        inference_source: inferenceSource,
        started_in_draft: startedInDraft,
        has_attachments: hasAttachments,
        surface: "workspace",
      });
    },
    onWorkspaceRunSucceeded: ({
      threadId,
      projectId,
      communityId,
      modelId,
      runtimeEngine,
      requestedFundingSource,
      inferenceSource,
      startedInDraft,
      hasAttachments,
    }) => {
      captureProductAnalyticsEvent("workspace run succeeded", {
        thread_id: threadId,
        project_id: projectId,
        community_id: communityId,
        model_id: modelId,
        runtime_engine: runtimeEngine,
        requested_funding_source: requestedFundingSource,
        inference_source: inferenceSource,
        started_in_draft: startedInDraft,
        has_attachments: hasAttachments,
        surface: "workspace",
      });
    },
    createThread,
    onThreadCreated: (thread) => {
      adoptWorkspaceThreadSelection(thread);
    },
    updateThreadModel,
    updateThreadRuntimeEngine,
    maybeSetThreadTitleFromText,
    createPersonalMemoryItemDirect,
    showMemoryToastMessage,
    loadThreadMessages,
    runPublicTurn,
    runAgentTurn,
    createThreadMessage,
    deleteThreadMessagesByIds,
    prepareAttachmentsForSend: prepareWorkspaceAttachmentsForSend,
    serializeAttachmentsForWrite: serializeCommunityAttachmentsForWrite,
    extractRememberIntent,
    extractTextFromContentJson,
    storeGuestThreadStorage,
    workspaceWantsNewChat,
    isSendingMessage,
    isThreadRunActive,
    activeThreadId,
    threadMessages,
    threads,
    activeModelId: DEFAULT_ACTIVE_MODEL_ID,
    activeRuntimeEngine: activeRuntimeEngineForWorkspace,
    modelToggles: platformModelToggles,
    userMemoryRememberEnabled:
      userMemorySettings.memory_mode !== "off" && userMemorySettings.remember_intent_enabled !== false,
    accountTier: runtimePickerAccountTier,
    loadAccountCommerceStatus,
    hasUserKeyConnection,
    hasUserChatgptConnection,
    guestThreadId: GUEST_THREAD_ID,
    guestModelId,
    guestModelAllowlist: GUEST_MODEL_ALLOWLIST,
    defaultActiveModelId: DEFAULT_ACTIVE_MODEL_ID,
    defaultGuestModelId: DEFAULT_GUEST_MODEL_ID,
    clearWorkspaceComposer: () => workspaceComposerApiRef.current?.clear(),
    pinWorkspaceToBottom: () => workspaceComposerApiRef.current?.pinToBottom(),
    setThreadError,
    setThreadErrorForThread,
    setGuestInferenceIssueForThread,
    setIsSendingMessage,
    setThreadRunSending,
    setWorkspaceWantsNewChatMode,
    setActiveThreadId,
    setThreadMessages,
    setThreads,
    setActiveModelId,
    setAccountCommerceError,
    setIsFreeAccountInfoOpen,
  });

  const { resetGuestThread: resetGuestThreadBase, exportThreadsCsv, exportMessagesCsv, exportMemoryCsv } =
    useWebWorkspaceActionsController<AuthSession, MessageAttachment, ThreadMessage>({
      getSession: () => sessionRef.current,
      buildCsv,
      downloadTextFile,
      parseMessageText,
      storeGuestThreadStorage,
      resetWorkspaceComposer: () => {
        workspaceComposerDraftRef.current = { text: "", attachments: [] };
        workspaceComposerApiRef.current?.reset();
      },
      focusWorkspaceInput: focusWorkspaceComposer,
      activeThreadId,
      guestModelId,
      setThreadError,
      setActiveThreadId,
      setWorkspaceWantsNewChatMode,
      setThreadMessages,
      setExportError,
      setIsExporting,
    });
  const resetGuestThread = useCallback(() => {
    setGuestInferenceIssueForThread(GUEST_THREAD_ID, null);
    resetGuestThreadBase();
  }, [resetGuestThreadBase, setGuestInferenceIssueForThread]);

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
    maxWebImageDataUrlChars: MAX_WEB_IMAGE_DATA_URL_CHARS,
    setProfileAvatarUrl: profileUi.setProfileAvatarUrl,
    setProfileAvatarStorageId: profileUi.setProfileAvatarStorageId,
    setProfileAvatarFocusX: profileUi.setProfileAvatarFocusX,
    setProfileAvatarFocusY: profileUi.setProfileAvatarFocusY,
    setProfileAvatarZoom: profileUi.setProfileAvatarZoom,
    setAuthError,
    onProfileAvatarUploadSuccess: () => profileUi.setIsProfileAvatarFocusModalOpen(true),
  });

  const canUseDevTierOverride = useMemo(
    () =>
      canUseCreatorDevTierOverride({
        email: session?.user?.email ?? null,
        isDev: import.meta.env.DEV,
        featureFlag: import.meta.env.VITE_ENABLE_DEV_TIER_OVERRIDE,
      }),
    [session?.user?.email],
  );
  const userAccessPolicy = useMemo(
    () =>
      resolveUserAccessPolicy({
        surface: "web",
        authState: session ? "authenticated" : "anonymous",
        accountTier: accountCommerceStatus?.account_tier ?? null,
        userEmail: session?.user?.email ?? null,
      }),
    [session, accountCommerceStatus?.account_tier],
  );

  const activeCommunityFunnelAction = useMemo<CommunityFunnelAction | null>(() => {
    if (!activeCommunity) return null;
    return deriveCommunityFunnelAction({
      entry_policy: activeCommunity.entry_policy,
    });
  }, [activeCommunity]);

  const {
    workspaceVoiceIntent,
    communityVoiceIntent,
    workspaceVoiceUiState,
    communityVoiceUiState,
    memberAgentVoiceIntent,
    memberAgentVoiceUiState,
    handleVoiceInputClick,
    finishVoiceInputForSubmit,
    cancelVoiceInput,
  } = useWebVoiceInputController<AuthSession>({
    ...authenticatedSessionArg,
    sessionRef: sessionRef,
    activeCommunity,
    activeCommunityFunnelAction,
    canPostMessagesActiveCommunity,
    requireSignIn: () => requireSignIn(),
    showAppToastMessage,
    appendWorkspaceTranscript: (transcript) => workspaceComposerApiRef.current?.appendTranscript(transcript),
    focusWorkspaceInput: focusWorkspaceComposer,
    resolveCommunityTranscriptTarget: () => communityVoiceTranscriptTargetRef.current,
    setCommunityMessageInput,
    chatInputRef,
    appendMemberAgentTranscript: (transcript) =>
      memberAgentComposerApiRef.current?.appendTranscript(transcript),
    focusMemberAgentInput: () => memberAgentComposerApiRef.current?.focusInput(),
  });

  const handleCommunityVoiceInputClick = useCallback((
    target: CommunityVoiceTranscriptTarget | null,
    owner: CommunityVoiceButtonOwner,
  ) => {
    if (!isProfileSetupCompleteForPublicActions) {
      openProfileSetup();
      return;
    }
    const activeOwner =
      communityVoiceUiState === "idle" ? null : communityVoiceButtonOwner ?? "main";
    if (activeOwner !== null && activeOwner !== owner) {
      showAppToastMessage("Finish the current voice capture first.");
      return;
    }
    if (communityVoiceUiState === "idle") {
      communityVoiceTranscriptTargetRef.current = target;
      setCommunityVoiceButtonOwner(owner);
    }
    void handleVoiceInputClick("community");
  }, [
    communityVoiceButtonOwner,
    communityVoiceUiState,
    handleVoiceInputClick,
    isProfileSetupCompleteForPublicActions,
    openProfileSetup,
    showAppToastMessage,
  ]);

  useEffect(() => {
    if (communityVoiceUiState !== "idle") return;
    communityVoiceTranscriptTargetRef.current = null;
    setCommunityVoiceButtonOwner(null);
  }, [communityVoiceUiState]);

  const activeCommunityVoiceButtonOwner: CommunityVoiceButtonOwner | null =
    communityVoiceUiState === "idle" ? null : communityVoiceButtonOwner ?? "main";
  const communityVoiceButtonTitle = isProfileSetupCompleteForPublicActions
    ? communityVoiceIntent.title
    : "Finish your profile to use voice input in community chat.";
  const mainCommunityVoiceButtonState =
    activeCommunityVoiceButtonOwner === null || activeCommunityVoiceButtonOwner === "main"
      ? communityVoiceUiState
      : "idle";
  const drawerCommunityVoiceButtonState =
    activeCommunityVoiceButtonOwner === "drawer" ? communityVoiceUiState : "idle";

	  const displayName = useCallback(
	    (userId: string): string => {
	      const remote = savedProfilesByUserId[userId];
	      const remoteName = remote?.display_name?.trim();
	      if (remoteName) return remoteName;
	      if (canonicalSessionUserId && userId === canonicalSessionUserId) {
          const sessionDisplayName = String(session?.user?.displayName ?? "").trim();
          if (sessionDisplayName) return sessionDisplayName;
	      }
	      return shortId(
          userId,
          canonicalSessionUserId ?? undefined,
          session?.user?.email ?? undefined,
        );
	    },
	    [canonicalSessionUserId, session?.user?.displayName, session?.user?.email, savedProfilesByUserId]
	  );

  const showEmptyThreadLandingSkeleton = Boolean(
    !activeThreadId &&
      session &&
      activeCommunityId &&
      activeCommunityAgentLandingCommunityIdRef.current !== activeCommunityId,
  );
  const isHydratingActiveWorkspaceThread = Boolean(
    session &&
      activeThreadId &&
      activeThreadId !== GUEST_THREAD_ID &&
      loadingThreadMessagesThreadId === activeThreadId,
  );
  const emptyThreadLanding = useMemo(() => {
    const landingMatchesCommunity = Boolean(
      activeCommunityId && activeCommunityAgentLandingCommunityIdRef.current === activeCommunityId,
    );
    const communityLanding = landingMatchesCommunity ? normalizeCommunityAgentLanding(activeCommunityAgentLanding) : null;
    return communityLanding ?? DEFAULT_EMPTY_THREAD_LANDING;
  }, [activeCommunityAgentLanding, activeCommunityId]);

  const landingActionButtons = useMemo(() => {
    const toButtons = (landing: CommunityAgentLanding) =>
      landing.tabs
        .map((tab) => ({
          id: tab.id,
          label: tab.label.trim(),
          prompt: (tab.prompts[0] ?? "").trim(),
        }))
        .filter((button) => button.label && button.prompt)
        .slice(0, 3);
    const buttons = toButtons(emptyThreadLanding);
    return buttons.length > 0 ? buttons : toButtons(DEFAULT_EMPTY_THREAD_LANDING);
  }, [emptyThreadLanding]);

  const getThreadDisplayTitle = useCallback(
    (thread: ThreadRecord): string => {
      const explicit = (thread.title ?? "").trim();
      if (!isMissingThreadTitleValue(explicit)) return explicit;
      if (thread.id === activeThreadId) {
        const firstUser = threadMessages.find((message) => message.thread_id === thread.id && message.role === "user");
        if (firstUser) {
          const preview = extractTextFromContentJson(firstUser.content_json).trim();
          if (preview) return deriveThreadTitleFromUserText(preview) || preview;
        }
      }
      const hints: Array<string> = [];
      if (thread.community_id) {
        const communityName = (communities.find((community) => community.id === thread.community_id)?.name ?? "").trim();
        if (communityName) hints.push(communityName);
      }
      return buildContextFallbackThreadTitle({
        threadId: thread.id,
        hints,
      });
    },
    [activeThreadId, communities, threadMessages],
  );
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
  useEffect(() => {
    if (mobileChromeAutoHideEnabled && !mobileOverlay) return;
    setMobileChromeReadingMode(false);
  }, [mobileChromeAutoHideEnabled, mobileOverlay]);
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
  /* Save-then-preview: the Preview button is only shown in the saved state,
     so it simply opens the LIVE visitor route for the owner. previewMode
     forces the visitor lens + disables Join; no draft snapshot is carried. */
  const handlePreviewCommunityFunnel = useCallback(() => {
    const slug = String(activeCommunity?.slug ?? "").trim();
    if (!slug) return;
    const previewPath = applyShellVariantToPublicPath(buildCommunityFunnelPreviewPath(slug) ?? "", shellVariant);
    if (!previewPath) return;
    pushNavSnapshot();
    navigateTo(previewPath);
  }, [activeCommunity?.slug, shellVariant, pushNavSnapshot, navigateTo]);

	  let lastThreadMessage: ThreadMessage | null = null;
	  for (let i = threadMessages.length - 1; i >= 0; i--) {
	    const candidate = threadMessages[i] ?? null;
	    if (!candidate) continue;
	    if (candidate.role === "system") continue;
	    lastThreadMessage = candidate;
	    break;
	  }
	  const lastThreadMessageRole = lastThreadMessage?.role ?? null;
	  const lastThreadUserMessageId = getLastThreadMessageId(threadMessages, "user");
  const activeThreadStreamingState = workspaceThreadKey ? threadStreamingStateById[workspaceThreadKey] ?? null : null;
  const activeThreadStreamingContent = activeThreadStreamingState?.content ?? null;
  const activeThreadStreamingRunId = activeThreadStreamingState?.runId ?? null;
  const isStreamingWorkspaceTurn = Boolean(
    workspaceThreadKey && activeThreadStreamingContent !== null,
  );
  const hasPersistedWorkspaceMessages = threadMessages.some((message) => message.role !== "system");
  const hasStreamingWorkspaceActivity = Boolean(
    isStreamingWorkspaceTurn ||
      (typeof activeThreadStreamingContent === "string" && activeThreadStreamingContent.trim().length > 0) ||
      (typeof activeThreadStreamingRunId === "string" && activeThreadStreamingRunId.trim().length > 0) ||
      ((activeThreadStreamingState?.runtimeEvents?.length ?? 0) > 0),
  );
  const isEmptyWorkspaceThread = !hasPersistedWorkspaceMessages && !hasStreamingWorkspaceActivity;
  const threadError = threadErrorById[resolveThreadErrorKey(activeThreadId)] ?? null;
  const guestInferenceIssue = isSignedOutAppPresentation
    ? guestInferenceIssueById[resolveThreadErrorKey(activeThreadId)] ?? null
    : null;

  useEffect(() => {
    if (session || !guestInferenceIssue) {
      lastShownGuestPreviewIssueModalRef.current = null;
      return;
    }

    const issueKey = [
      resolveThreadErrorKey(activeThreadId),
      guestInferenceIssue.reason,
      guestInferenceIssue.shortMessage,
    ].join(":");
    if (lastShownGuestPreviewIssueModalRef.current === issueKey) return;

    lastShownGuestPreviewIssueModalRef.current = issueKey;
    setPreviewAccessGateModal({
      reason: "preview_issue",
      issueReason: guestInferenceIssue.reason,
      message: guestInferenceIssue.fullMessage,
    });
    setIsPreviewAccessGateRunning(false);
  }, [activeThreadId, guestInferenceIssue, resolveThreadErrorKey, session]);

  useEffect(() => {
    if (!session) return;
    setGuestInferenceIssueById({});
    clearGuestThreadStorage();
  }, [session]);

  useEffect(() => {
    const telemetryPathname = buildCurrentTelemetryPathname();
    updateSentryUiContext({
      authState: session ? "authenticated" : "anonymous",
      userId: canonicalSessionUserId,
      accountTier: accountCommerceStatus?.account_tier ?? null,
      pathname: telemetryPathname,
      publicRouteKind: publicRoute.kind,
      activePage,
      activeView,
      communityId: activeCommunityId,
      communitySlug: activeCommunitySlug,
      projectId: activeThreadProjectId,
      threadId: activeThreadId,
      runId: activeThreadStreamingRunId,
    });
    updatePosthogUiContext({
      authState: session ? "authenticated" : "anonymous",
      userId: canonicalSessionUserId,
      accountTier: accountCommerceStatus?.account_tier ?? null,
      pathname: telemetryPathname,
      publicRouteKind: publicRoute.kind,
      activePage,
      activeView,
      communityId: activeCommunityId,
      communitySlug: activeCommunitySlug,
      projectId: activeThreadProjectId,
      threadId: activeThreadId,
      runId: activeThreadStreamingRunId,
    });
  }, [
    activeCommunityId,
    activeCommunitySlug,
    activePage,
    activeThreadId,
    activeThreadStreamingRunId,
    activeView,
    accountCommerceStatus?.account_tier,
    canonicalSessionUserId,
    publicRoute.kind,
    session,
    activeThreadProjectId,
  ]);

  useEffect(() => {
    if (!canonicalSessionUserId) {
      lastTrackedAuthSessionUserIdRef.current = null;
      return;
    }
    if (lastTrackedAuthSessionUserIdRef.current === canonicalSessionUserId) return;
    lastTrackedAuthSessionUserIdRef.current = canonicalSessionUserId;
    captureProductAnalyticsEvent("auth session established", {
      surface: publicRoute.kind === "app" ? activePage : publicRoute.kind,
    });
  }, [activePage, canonicalSessionUserId, publicRoute.kind]);

  const isActiveWorkspaceThreadBusy = session
    ? activeThreadId
      ? isThreadRunActive(activeThreadId)
      : isSendingMessage
    : isSendingMessage;
  const canRetryLastThreadTurn = Boolean(
    threadError &&
      session &&
      activeThreadId &&
      !isActiveWorkspaceThreadBusy &&
      lastThreadMessageRole === "user" &&
      lastThreadUserMessageId,
  );
  const showGuestSignInAction = !session && guestInferenceIssue?.cta === "sign_in";
  const inlineThreadError = guestInferenceIssue ? null : threadError;
  const displayedThreadError = guestInferenceIssue?.shortMessage ?? threadError;

  const handlePublicLandingPrimaryAction = () => {
    if (isPublicFunnelPreviewRoute) return;
    if (publicCommunityAdmissionStatus !== "ready") return;
    if (!publicCommunityUi.publicCommunity) return;
    if (canEnterPublicCommunity && publicCommunityUi.publicCommunityAccess?.community_id) {
      enterCommunityThroughBridge({
        communityId: publicCommunityUi.publicCommunityAccess.community_id,
        communitySlug: publicCommunityUi.publicCommunity.slug ?? null,
      });
      return;
    }
    if (canJoinWithCheckout && selectedPublicCommunityPlan) {
      const communityFunnelPath = applyShellVariantToPublicPath(
        buildCommunityFunnelPath(publicCommunityUi.publicCommunity.slug) ?? `/c/${encodeURIComponent(publicCommunityUi.publicCommunity.slug)}`,
        shellVariant,
      );
      void startCheckoutForPlan(
        publicCommunityUi.publicCommunity.slug,
        selectedPublicCommunityPlan.billing_period,
        communityFunnelPath,
      );
      return;
    }
    if (!canJoinForFree && !canJoinWithApproval) return;
    void joinPublicCommunity({
      communitySlug: publicCommunityUi.publicCommunity.slug,
      origin: "funnel",
    });
  };

  const handleCancelPendingPublicJoinRequest = () => {
    if (publicCommunityAdmissionStatus !== "ready") return;
    const slug = publicCommunityUi.publicCommunity?.slug ?? publicFunnelSlug ?? "";
    if (!slug || !approvalPending) return;
    void cancelMyPendingJoinRequest(slug);
  };
  const hasAuthenticatedAppShellPresentation =
    shellPublicRoute.kind === "app" && authPresentationState !== "signed_out";
  const isAuthRecoveringSignedInAppShell =
    shellPublicRoute.kind === "app" && authPresentationState === "recovering_signed_in";
  const shouldHoldLandingForAuth =
    shellPublicRoute.kind === "app" &&
    activePage === "landing" &&
    typeof window !== "undefined" &&
    (isLegacyWorkspaceRoutePath(window.location.pathname || "/") ||
      (authPresentationState !== "signed_out" &&
        isRootAppRoutePath(window.location.pathname || "/")));
  const isAccountGraphHydratingCriticalAppShell =
    shellPublicRoute.kind === "app" &&
    authPresentationState === "signed_in" &&
    accountGraphHydrationPhase === "critical";

	  const handleTopbarBackFromSettings = () => {
	    handleTopbarBackToCommunity();
	  };
	  const handleTopbarBackFromPublicFunnel = () => {
	    void goBack();
	  };
	  function handleTopbarBackToCommunity() {
	    if (goBack()) return;
	    const communitySlug = String(
	      selectedActiveCommunitySlug ?? activeCommunity?.slug ?? "",
	    ).trim();
	    if (communitySlug) {
	      openCommunityChat(communitySlug, { clearUnread: true });
	      return;
	    }
	    if (session) {
	      void resolveAndEnterMemberDestination({ session, replace: true }).then((entered) => {
	        if (!entered) navigateTo("/discover", { replace: true });
	      });
	      return;
	    }
	    navigateTo("/discover", { replace: true });
	  }
		  const handleOpenLandingCommunity = () => {
		    const communitySlug = String(activeCommunity?.slug ?? "").trim();
		    if (!communitySlug) return;
		    openCommunityChat(communitySlug, { clearUnread: true });
		  };
		  const handleOpenDiscover = () => {
		    const transition = deriveOpenDiscoverTransition({ activePage });
		    if (transition.shouldPushSnapshot) pushNavSnapshot();
		    setActiveView(transition.nextView);
		    setActivePage(transition.nextPage);
		  };
    const handleOpenCommunityLaunchSetupStep = (step: CommunityLaunchSetupStep) => {
      const nextCommunitySlug = String(
        selectedActiveCommunitySlug ?? activeCommunity?.slug ?? "",
      ).trim();
      if (!nextCommunitySlug) return;
      setIsCommunityLaunchSetupModalOpen(false);
      setCommunityLaunchSetupInitialStep(null);
      clearCommunityLaunchSetupRouteState();
      pushNavSnapshot();
      if (step === "knowledge") {
        openCommunityTab(nextCommunitySlug, "resources", { pushSnapshot: false });
        return;
      }
      if (step === "agent") {
        setCommunityAiAgentPreferredTab("instructions");
        openCommunityTab(nextCommunitySlug, "ai_agent", { pushSnapshot: false });
        return;
      }
      openCommunityTab(nextCommunitySlug, "settings", { pushSnapshot: false });
    };
    const applyCommunityLaunchProfileResult = (result: CloudCommunityLaunchProfileSaveResult) => {
      setCommunities((prev) =>
        prev.map((community) =>
          community.id === result.id
            ? {
                ...community,
                slug: result.slug,
                name: result.name,
                one_liner: result.one_liner,
                about: result.about,
                avatar_url: result.avatar_url,
                avatar_storage_id: result.avatar_storage_id ?? null,
                avatar_focus_x: result.avatar_focus_x ?? 0.5,
                avatar_focus_y: result.avatar_focus_y ?? 0.5,
                avatar_zoom: result.avatar_zoom ?? 1,
                banner_url: result.banner_url,
                banner_storage_id: result.banner_storage_id ?? null,
                banner_focus_x: result.banner_focus_x ?? 0.5,
                banner_focus_y: result.banner_focus_y ?? 0.5,
                banner_zoom: result.banner_zoom ?? 1,
                visibility: toCanonicalCommunityVisibility(result.visibility, "unlisted"),
                entry_policy: result.entry_policy ?? community.entry_policy ?? null,
                updated_at: result.updated_at,
              }
            : community,
        ),
      );
      if (activeCommunityId === result.id) {
        applyCommunityShellState({
          communityId: result.id,
          communitySlug: result.slug,
        });
      }
    };
    const requireCommunityLaunchSaveContext = () => {
      if (!session) throw new Error("Sign in before updating community launch setup.");
      if (!activeCommunity) throw new Error("Select a community before updating launch setup.");
      return {
        session,
        community: activeCommunity,
      };
    };
    const refreshCommunityLaunchKnowledgeProjectionBestEffort = async ({
      communityId,
      session: activeSession,
      includeResources = false,
    }: {
      communityId: string;
      session: AuthSession;
      includeResources?: boolean;
    }) => {
      try {
        if (includeResources) await loadCommunityResources(communityId, activeSession);
        await loadCommunityLaunchKnowledgeSources(communityId, activeSession);
        await refreshActiveCommunityLaunchSetupStatus();
      } catch (error) {
        console.warn("[community-launch] failed to refresh knowledge projection after source write:", error);
      }
    };
    const handleSaveCommunityLaunchProfile = async (draft: {
      name: string;
      slug: string;
      oneLiner: string;
      avatarUrl: string;
      bannerUrl: string;
    }) => {
      const { session, community } = requireCommunityLaunchSaveContext();
      const nextAvatarUrl = String(draft.avatarUrl ?? "").trim();
      const nextBannerUrl = String(draft.bannerUrl ?? "").trim();
      const currentAvatarUrl = String(community.avatar_url ?? "").trim();
      const currentBannerUrl = String(community.banner_url ?? "").trim();
      const input: CloudCommunityLaunchProfileSaveInput = {
        name: draft.name,
        slug: slugifyCommunityName(draft.slug) || draft.slug,
        oneLiner: draft.oneLiner.trim() || null,
      };
      if (nextAvatarUrl !== currentAvatarUrl) {
        const avatarField = await prepareCloudCommunityBrandingField({
          session,
          kind: "avatar",
          nextValue: nextAvatarUrl || null,
          currentStorageId: community.avatar_storage_id ?? null,
          currentResolvedUrl: currentAvatarUrl || null,
        });
        const isNewAvatarUpload = nextAvatarUrl.toLowerCase().startsWith("data:image/");
        input.avatarUrl = avatarField.url ?? null;
        input.avatarStorageId = avatarField.storageId ?? null;
        input.avatarFocusX = isNewAvatarUpload ? 0.5 : community.avatar_focus_x ?? 0.5;
        input.avatarFocusY = isNewAvatarUpload ? 0.5 : community.avatar_focus_y ?? 0.5;
        input.avatarZoom = isNewAvatarUpload ? 1 : community.avatar_zoom ?? 1;
      }
      if (nextBannerUrl !== currentBannerUrl) {
        const bannerField = await prepareCloudCommunityBrandingField({
          session,
          kind: "banner",
          nextValue: nextBannerUrl || null,
          currentStorageId: community.banner_storage_id ?? null,
          currentResolvedUrl: currentBannerUrl || null,
        });
        const isNewBannerUpload = nextBannerUrl.toLowerCase().startsWith("data:image/");
        input.bannerUrl = bannerField.url ?? null;
        input.bannerStorageId = bannerField.storageId ?? null;
        input.bannerFocusX = isNewBannerUpload ? 0.5 : community.banner_focus_x ?? 0.5;
        input.bannerFocusY = isNewBannerUpload ? 0.5 : community.banner_focus_y ?? 0.5;
        input.bannerZoom = isNewBannerUpload ? 1 : community.banner_zoom ?? 1;
      }
      const result = await saveCloudCommunityLaunchProfile({
        session,
        communityId: community.id,
        input,
      });
      if (!result) throw new Error("Failed to save community profile.");
      applyCommunityLaunchProfileResult(result);
      await refreshActiveCommunityLaunchSetupStatus();
    };
    const handleSaveCommunityLaunchAbout = async (draft: { about: string }) => {
      const { session, community } = requireCommunityLaunchSaveContext();
      const result = await saveCloudCommunityLaunchProfile({
        session,
        communityId: community.id,
        input: {
          about: draft.about.trim() || null,
        },
      });
      if (!result) throw new Error("Failed to save community about.");
      applyCommunityLaunchProfileResult(result);
      await refreshActiveCommunityLaunchSetupStatus();
    };
    const handleAddCommunityLaunchKnowledgeLink = async (draft: { urls: string[] }) => {
      const { session, community } = requireCommunityLaunchSaveContext();
      const rawUrls = draft.urls.map((url) => url.trim()).filter(Boolean);
      if (rawUrls.length === 0) throw new Error("Add a source link.");
      if (rawUrls.length > 5) throw new Error("Add up to five source links at a time.");
      const normalizedUrls = rawUrls.map((rawUrl) => {
        const normalizedUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(normalizedUrl);
        } catch {
          throw new Error("Add valid source links.");
        }
        if (parsedUrl.protocol !== "https:") {
          throw new Error("Add https source links.");
        }
        return parsedUrl;
      });
      for (const parsedUrl of normalizedUrls) {
        const titlePath = parsedUrl.pathname && parsedUrl.pathname !== "/" ? parsedUrl.pathname : "";
        const title = `${parsedUrl.hostname.replace(/^www\./, "")}${titlePath}`.slice(0, 120);
        await saveCloudCommunityResource({
          session,
          resourceId: null,
          isPatch: false,
          payload: {
            community_id: community.id,
            title: title || "Source link",
            body_md: null,
            url: parsedUrl.toString(),
            type: "link",
            resource_role: "source",
            resource_status: "review",
            source_ingestion_status: "queued",
            source_ingestion_kind: "url",
            pinned: false,
          },
        });
      }
      await refreshCommunityLaunchKnowledgeProjectionBestEffort({
        communityId: community.id,
        session,
        includeResources: true,
      });
    };
    const handleAddCommunityLaunchKnowledgeFile = async (draft: { files: File[] }) => {
      const { session, community } = requireCommunityLaunchSaveContext();
      const files = draft.files.filter((file) => file.size > 0).slice(0, 5);
      if (files.length === 0) throw new Error("Add a source file.");
      for (const file of files) {
        const storageId = await uploadCloudCommunityResourceSourceFile({
          session,
          communityId: community.id,
          file,
        });
        await saveCloudCommunityResource({
          session,
          resourceId: null,
          isPatch: false,
          payload: {
            community_id: community.id,
            title: file.name || "Source file",
            body_md: null,
            url: null,
            file_key: storageId,
            type: "file",
            resource_role: "source",
            resource_status: "review",
            source_ingestion_status: "queued",
            source_ingestion_kind: "file",
            source_original_filename: file.name || null,
            source_original_mime_type: file.type || null,
            source_original_bytes: file.size,
            pinned: false,
          },
        });
      }
      await refreshCommunityLaunchKnowledgeProjectionBestEffort({
        communityId: community.id,
        session,
        includeResources: true,
      });
    };
    const handleIngestCommunityLaunchKnowledgeSources = async () => {
      const { session, community } = requireCommunityLaunchSaveContext();
      const latestSources = await listCloudCommunityLaunchKnowledgeSources({
        session,
        communityId: community.id,
        limit: 100,
      });
      const crawlTargets = new Map<string, CommunityLaunchKnowledgeImportedSource>();
      for (const source of latestSources.sources ?? []) {
        const crawlUrl = getCommunityLaunchSourceCrawlUrl(source);
        if (crawlUrl && !crawlTargets.has(crawlUrl)) crawlTargets.set(crawlUrl, source);
      }
      const crawlFailures: Array<{ title: string; url: string | null; message: string }> = [];
      if (crawlTargets.size > 0) {
        await Promise.all(
          Array.from(crawlTargets.entries())
            .slice(0, COMMUNITY_LAUNCH_SOURCE_CRAWL_MAX_ROOTS)
            .map(async ([rootUrl, source]) => {
              try {
                const started = await crawlCloudCommunitySourceRoot({
                  session,
                  communityId: community.id,
                  rootUrl,
                  maxPages: 1,
                  maxDepth: 0,
                });
                const crawlJobId = started?.job?.id ?? "";
                if (!crawlJobId) {
                  throw new Error("community_source_crawl_job_create_failed");
                }
                const job = await waitForCommunityLaunchSourceCrawlJob({
                  session,
                  communityId: community.id,
                  crawlJobId,
                });
                if (job.status === "failed") {
                  throw new Error(job.error || "community_source_crawl_failed");
                }
                return { source, rootUrl, job };
              } catch (error) {
                crawlFailures.push({
                  title: source.title || "Source link",
                  url: rootUrl,
                  message: error instanceof Error ? error.message : "community_source_crawl_failed",
                });
                return null;
              }
            }),
        );
      }
      const result = await ingestCloudCommunitySources({
        session,
        communityId: community.id,
      });
      await refreshCommunityLaunchKnowledgeProjectionBestEffort({
        communityId: community.id,
        session,
        includeResources: true,
      });
      if (crawlFailures.length === 0) return result as any;
      return {
        ...(result ?? {}),
        ok: false,
        failed: Number(result?.failed ?? 0) + crawlFailures.length,
        failures: [
          ...(Array.isArray(result?.failures) ? result.failures : []),
          ...crawlFailures.map((failure) => ({
            resource_id: "",
            title: failure.title,
            url: failure.url,
            message: failure.message,
          })),
        ],
        ready_sources: Number(result?.ready_sources ?? 0),
        total_sources: Number(result?.total_sources ?? latestSources.sources?.length ?? 0),
        pending_sources: Number(result?.pending_sources ?? 0),
        pending_url_sources: Number(result?.pending_url_sources ?? 0),
        pending_file_sources: Number(result?.pending_file_sources ?? 0),
        pending_google_drive_sources: Number(result?.pending_google_drive_sources ?? 0),
        pending_github_sources: Number(result?.pending_github_sources ?? 0),
        code: result?.code ?? "source_crawl_partial_failure",
        message: "Some source links could not be fully crawled.",
      } as any;
    };
    const handleLoadCommunityLaunchKnowledgeSources = async () => {
      const { session, community } = requireCommunityLaunchSaveContext();
      await loadCommunityLaunchKnowledgeSources(community.id, session);
    };
    const handleLoadCommunityLaunchGoogleDriveConnection = async () => {
      const { session, community } = requireCommunityLaunchSaveContext();
      return await loadCloudCommunityGoogleDriveSourceConnection({
        session,
        communityId: community.id,
      });
    };
    const handleConnectCommunityLaunchGoogleDrive = async () => {
      const { session, community } = requireCommunityLaunchSaveContext();
      const result = await beginCloudCommunityGoogleDriveSourceOAuth({
        session,
        communityId: community.id,
        returnToPath: buildCommunityLaunchKnowledgeSourceOAuthReturnToPath({
          communityId: community.id,
          communitySlug: community.slug,
        }),
      });
      if (result.ok && result.authorize_url) {
        writeCommunityLaunchKnowledgeSourceOAuthIntent({
          provider: "google_drive",
          state: readSourceIntegrationOAuthStateFromAuthorizeUrl(result.authorize_url),
          communityId: community.id,
          communitySlug: community.slug,
        });
        window.location.assign(result.authorize_url);
      }
      return result;
    };
    const handleListCommunityLaunchGoogleDriveFiles = async (request?: {
      folderId?: string | null;
      pageToken?: string | null;
      query?: string | null;
    } | null) => {
      const { session, community } = requireCommunityLaunchSaveContext();
      return await listCloudCommunityGoogleDriveSourceFiles({
        session,
        communityId: community.id,
        folderId: request?.folderId,
        pageToken: request?.pageToken,
        query: request?.query,
      });
    };
    const handleImportCommunityLaunchGoogleDriveFiles = async (fileIds: string[]) => {
      const { session, community } = requireCommunityLaunchSaveContext();
      const result = await importCloudCommunityGoogleDriveSourceFiles({
        session,
        communityId: community.id,
        fileIds,
      });
      await refreshCommunityLaunchKnowledgeProjectionBestEffort({
        communityId: community.id,
        session,
      });
      return result;
    };
    const handleRemoveCommunityLaunchKnowledgeSource = async (resourceId: string) => {
      const { session, community } = requireCommunityLaunchSaveContext();
      await deleteCloudCommunityResource({
        session,
        resourceId,
      });
      await loadCommunityLaunchKnowledgeSources(community.id, session);
      await refreshActiveCommunityLaunchSetupStatus();
      return true;
    };
    const handleDisconnectCommunityLaunchGoogleDrive = async () => {
      const { session, community } = requireCommunityLaunchSaveContext();
      const connection = await disconnectCloudCommunityGoogleDriveSourceConnection({
        session,
        communityId: community.id,
      });
      await loadCommunityLaunchKnowledgeSources(community.id, session);
      await refreshActiveCommunityLaunchSetupStatus();
      setCommunityLaunchKnowledgeIntegrationReloadKey((key) => key + 1);
      return connection;
    };
    const handleLoadCommunityLaunchGitHubConnection = async () => {
      const { session, community } = requireCommunityLaunchSaveContext();
      return await loadCloudCommunityGitHubSourceConnection({
        session,
        communityId: community.id,
      });
    };
    const handleConnectCommunityLaunchGitHub = async () => {
      const { session, community } = requireCommunityLaunchSaveContext();
      const result = await beginCloudCommunityGitHubSourceOAuth({
        session,
        communityId: community.id,
        returnToPath: buildCommunityLaunchKnowledgeSourceOAuthReturnToPath({
          communityId: community.id,
          communitySlug: community.slug,
        }),
      });
      if (result.ok && result.authorize_url) {
        writeCommunityLaunchKnowledgeSourceOAuthIntent({
          provider: "github",
          state: readSourceIntegrationOAuthStateFromAuthorizeUrl(result.authorize_url),
          communityId: community.id,
          communitySlug: community.slug,
        });
        window.location.assign(result.authorize_url);
      }
      return result;
    };
    const handleListCommunityLaunchGitHubRepositories = async (query?: string | null) => {
      const { session, community } = requireCommunityLaunchSaveContext();
      return await listCloudCommunityGitHubSourceRepositories({
        session,
        communityId: community.id,
        query,
      });
    };
    const handleListCommunityLaunchGitHubFiles = async (
      repoFullName: string,
      ref?: string | null,
      query?: string | null,
    ) => {
      const { session, community } = requireCommunityLaunchSaveContext();
      return await listCloudCommunityGitHubSourceFiles({
        session,
        communityId: community.id,
        repoFullName,
        ref,
        query,
      });
    };
    const handleImportCommunityLaunchGitHubFiles = async (fileIds: string[]) => {
      const { session, community } = requireCommunityLaunchSaveContext();
      const result = await importCloudCommunityGitHubSourceFiles({
        session,
        communityId: community.id,
        fileIds,
      });
      await refreshCommunityLaunchKnowledgeProjectionBestEffort({
        communityId: community.id,
        session,
      });
      return result;
    };
    const handleDisconnectCommunityLaunchGitHub = async () => {
      const { session, community } = requireCommunityLaunchSaveContext();
      const connection = await disconnectCloudCommunityGitHubSourceConnection({
        session,
        communityId: community.id,
      });
      await loadCommunityLaunchKnowledgeSources(community.id, session);
      await refreshActiveCommunityLaunchSetupStatus();
      setCommunityLaunchKnowledgeIntegrationReloadKey((key) => key + 1);
      return connection;
    };
    const handleGenerateCommunityLaunchKnowledgePlan = async (draft: { builderIntent: string }) => {
      const { session, community } = requireCommunityLaunchSaveContext();
      const result = await runCloudCommunityWikiArchitectProposal({
        session,
        communityId: community.id,
        builderIntent: draft.builderIntent,
      });
      return result as any;
    };
    const handleApplyCommunityLaunchKnowledgePlan = async (draft: { proposal: unknown }) => {
      const { session, community } = requireCommunityLaunchSaveContext();
      const result = await applyCloudCommunityWikiArchitectProposal({
        session,
        communityId: community.id,
        proposal: draft.proposal,
      });
      await loadCommunityResources(community.id, session);
      await refreshActiveCommunityLaunchSetupStatus();
      return result as any;
    };
    const handleDraftCommunityLaunchKnowledgeResources = async () => {
      const { session, community } = requireCommunityLaunchSaveContext();
      const result = await draftCloudCommunityResourceContentFromSources({
        session,
        communityId: community.id,
        limit: 8,
      });
      await loadCommunityResources(community.id, session);
      await refreshActiveCommunityLaunchSetupStatus();
      return result as any;
    };
    const handleSaveCommunityLaunchAgent = async (draft: {
      systemPrompt: string;
    }) => {
      const { session, community } = requireCommunityLaunchSaveContext();
      const loadedForCommunity =
        communityAgentConfigLoadedCommunityIdRef.current === community.id;
      const landing = loadedForCommunity
        ? normalizeCommunityAgentLanding(communityAgentConfigLanding) ??
          DEFAULT_EMPTY_THREAD_LANDING
        : DEFAULT_EMPTY_THREAD_LANDING;
      const normalizedLanding = normalizeCommunityAgentDraftForSave(landing);
      if (!normalizedLanding) throw new Error("Community agent configuration unavailable.");
      const row = await saveCloudCommunityAgentConfigDirect({
        session,
        communityId: community.id,
        landingJson: normalizedLanding,
        communitySystemPrompt: draft.systemPrompt,
      });
      if (!row) throw new Error("Failed to save community agent.");
      hydrateCommunityAgentEditor({
        landing_json: normalizedLanding,
        community_system_prompt: draft.systemPrompt,
        system_prompt: draft.systemPrompt,
      });
      communityAgentConfigLoadedCommunityIdRef.current = community.id;
      communityAgentConfigDirtyRef.current = false;
      activeCommunityAgentLandingCommunityIdRef.current = community.id;
      setActiveCommunityAgentLanding(normalizedLanding);
      await refreshActiveCommunityLaunchSetupStatus();
    };
    const handleSaveCommunityLaunchAccess = async (draft: {
      entryPolicy: "open" | "approval";
    }) => {
      const { session, community } = requireCommunityLaunchSaveContext();
      const result = await setCloudCommunityFreeAccessMode({
        session,
        communityId: community.id,
        mode: draft.entryPolicy,
      });
      setCommunities((prev) =>
        prev.map((candidate) =>
          candidate.id === community.id
            ? {
                ...candidate,
                entry_policy: result?.entry_policy ?? draft.entryPolicy,
                updated_at: result?.updated_at ?? candidate.updated_at,
              }
            : candidate,
        ),
      );
      await refreshActiveCommunityLaunchSetupStatus();
    };
    const handleSaveCommunityLaunchPublish = async (draft: {
      visibility: "published" | "unlisted";
    }) => {
      const { session, community } = requireCommunityLaunchSaveContext();
      const result = await saveCloudCommunityLaunchProfile({
        session,
        communityId: community.id,
        input: {
          visibility: draft.visibility,
        },
      });
      if (!result) throw new Error("Failed to update publishing.");
      applyCommunityLaunchProfileResult(result);
      await refreshActiveCommunityLaunchSetupStatus();
    };
    const getOwnedCommunityCount = () =>
      communities.reduce(
        (count, community) =>
          count + (communityRoleById[community.id] === "owner" ? 1 : 0),
        0,
      );
    const openCommunityLaunchCreateFlow = () => {
      void (async () => {
        const activeSession = await ensureUsableAuthSession();
        if (!activeSession) {
          requireSignIn({ reason: "create_community", payload: { draft: null } });
          return;
        }
        if (!isAccountSetupCompleteForBuilderActions) {
          openProfileSetup();
          return;
        }
        let status = accountCommerceStatus;
        if (!status) {
          try {
            status = await loadAccountCommerceStatus(activeSession);
          } catch (error) {
            const message =
              typeof error === "string"
                ? error
                : error instanceof Error
                  ? error.message
                  : "Couldn't check your account status. Try again.";
            setAccountCommerceError(message);
            showAppToastMessage(message);
            return;
          }
        }
        const maxCommunities = Math.max(
          0,
          Math.floor(Number(status?.max_communities ?? 0)),
        );
        if (maxCommunities <= 0) {
          setIsFreeAccountInfoOpen(true);
          return;
        }
        if (getOwnedCommunityCount() >= maxCommunities) {
          setIsFreeAccountInfoOpen(true);
          return;
	        }
	        setCommunityLaunchSetupStatus(null);
	        setCommunityLaunchSetupError(null);
	        setIsLoadingCommunityLaunchSetupStatus(false);
	        setCommunityLaunchSetupInitialStep(null);
	        setIsCommunityLaunchCreateMode(true);
	        setIsCommunityLaunchSetupModalOpen(true);
      })();
    };
    const handleCreateCommunityFromLaunch = async (
      draft: CommunityLaunchProfileSaveDraft,
    ) => {
      const activeSession = await ensureUsableAuthSession();
      if (!activeSession) {
        requireSignIn({ reason: "create_community", payload: { draft: null } });
        throw new Error("Sign in to create a community.");
      }
      if (!isAccountSetupCompleteForBuilderActions) {
        openProfileSetup();
        throw new Error("Finish account setup before creating a community.");
      }
      const name = draft.name.trim();
      const slug = (draft.slug.trim() || slugifyCommunityName(name)).toLowerCase();
      if (!name || !slug) {
        throw new Error("Name and slug are required.");
      }
      if (!isValidCommunitySlug(slug)) {
        throw new Error("Slug must be 3-32 chars, lowercase, and may include dashes.");
      }
      const status = accountCommerceStatus ?? await loadAccountCommerceStatus(activeSession);
      const maxCommunities = Math.max(
        0,
        Math.floor(Number(status?.max_communities ?? 0)),
      );
      if (maxCommunities <= 0) {
        setIsFreeAccountInfoOpen(true);
        throw new Error("Your account cannot create a community yet.");
      }
      if (getOwnedCommunityCount() >= maxCommunities) {
        setIsFreeAccountInfoOpen(true);
        throw new Error("You've reached your community limit.");
      }

      try {
        const [avatarField, bannerField] = await Promise.all([
          prepareCloudCommunityBrandingField({
            session: activeSession,
            kind: "avatar",
            nextValue: draft.avatarUrl || null,
          }),
          prepareCloudCommunityBrandingField({
            session: activeSession,
            kind: "banner",
            nextValue: draft.bannerUrl || null,
          }),
        ]);
        const community = await createCloudCommunity<AuthSession, CommunityRecord>({
          session: activeSession,
          name,
          slug,
          visibility: "unlisted",
          avatarStorageId: avatarField.storageId ?? null,
          avatarUrl: avatarField.url ?? null,
          oneLiner: draft.oneLiner.trim() || null,
          bannerStorageId: bannerField.storageId ?? null,
          bannerUrl: bannerField.url ?? null,
        });
        if (!community?.id) {
          throw new Error("Failed to create community.");
        }
        setCommunities((prev) => [
          community,
          ...prev.filter((candidate) => candidate.id !== community.id),
        ]);
        setCommunityRoleById((prev) => ({ ...prev, [community.id]: "owner" }));
        applyCommunityShellState({
          communityId: community.id,
          communitySlug: community.slug,
          communityTab: "settings",
        });
        setPublicRoute({ kind: "app" });
        setActivePage("community");
        setActiveView("home");
        setIsCommunityLaunchCreateMode(false);
        setIsLoadingCommunityLaunchSetupStatus(true);
        const launchStatus = await loadCloudCommunityLaunchSetupStatus({
          session: activeSession,
          communityId: community.id,
        });
        setCommunityLaunchSetupStatus(launchStatus);
        setCommunityLaunchSetupError(null);
        const launchStep = resolveCommunityLaunchSetupRouteStep(launchStatus?.current_step);
        setCommunityLaunchSetupInitialStep(launchStep);
        setIsCommunityLaunchSetupModalOpen(true);
        replaceCommunityLaunchSetupRouteState(launchStep, {
          communityId: community.id,
          communitySlug: community.slug,
        });
      } catch (error) {
        throw new Error(mapLaunchCommunityCreateError(error));
      } finally {
        setIsLoadingCommunityLaunchSetupStatus(false);
      }
    };
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
      hasCommunityCreateAccess: Number(accountCommerceStatus?.max_communities ?? 0) > 0,
      openCommunityCreateFlow: openCommunityLaunchCreateFlow,
      setIsFreeAccountInfoOpen,
    });
    useEffect(() => {
      if (shellPublicRoute.kind !== "app") return;
      if (activePage !== "community") return;
      if (hasSelectedCommunity) return;
      navigateTo("/discover", { replace: true });
    }, [activePage, hasSelectedCommunity, shellPublicRoute.kind]);
  const handleSelectActiveCommunity = useCallback((community: CommunityRecord): boolean => {
    if (
      !confirmDiscardUnsavedCommunitySettingsWeb({
        isCommunitySettingsDirty: communitySettingsDirtyRef.current,
        isCommunityAgentConfigDirty: communityAgentConfigDirtyRef.current,
        activeCommunityId: selectedActiveCommunityId,
        nextCommunityId: community.id,
        confirmDiscard: (message) => window.confirm(message),
      })
    ) {
      return false;
    }
    syncCommunitySelection({
      communitySlug: (community.slug ?? "").trim() || null,
      communityId: community.id,
    });
    return true;
  }, [
    selectedActiveCommunityId,
    syncCommunitySelection,
  ]);

  const handleSelectCommunitySettingsPane = useCallback((pane: CommunitySettingsPane, opts?: { replace?: boolean }) => {
    setCommunitySettingsPane(pane);
    const nextCommunitySlug = String(selectedActiveCommunitySlug ?? activeCommunity?.slug ?? "").trim();
    if (!nextCommunitySlug) return;
    const settingsPath = buildCommunityTabPath(nextCommunitySlug, "settings", null, pane);
    if (!settingsPath) return;
    navigateTo(settingsPath, opts?.replace ? { replace: true } : {});
  }, [activeCommunity?.slug, navigateTo, selectedActiveCommunitySlug]);

  const isCommunityOnboardingPreviewMode =
    publicRoute.kind === "app" &&
    activePage === "community" &&
    communityExperienceMode === "onboarding_preview";
  const handlePreviewCommunityOnboarding = useCallback(() => {
    const slug = String(selectedActiveCommunitySlug ?? activeCommunity?.slug ?? "").trim();
    const path = buildCommunityOnboardingPreviewPath(slug);
    if (path) navigateTo(path);
  }, [activeCommunity?.slug, navigateTo, selectedActiveCommunitySlug]);
  const handleExitCommunityOnboardingPreview = useCallback(() => {
    const slug = String(selectedActiveCommunitySlug ?? activeCommunity?.slug ?? "").trim();
    const path = buildCommunityTabPath(slug, "settings", null, "workflows");
    if (path) navigateTo(path, { replace: true });
  }, [activeCommunity?.slug, navigateTo, selectedActiveCommunitySlug]);

  const isCommunityFunnelAboutDirty =
    Boolean(activeCommunity) && communitySettingsAbout !== (activeCommunity?.about ?? "");

  const hasCommunitySettingsDirtyOutsideFunnelAbout = useCallback(() => {
    if (!activeCommunity) return false;
    const numberChanged = (left: number, right: number) => Math.abs(left - right) >= 0.0001;
    return (
      communityPricingDirtyRef.current ||
      communitySettingsName !== (activeCommunity.name ?? "") ||
      communitySettingsSlug !== slugifyCommunityName(activeCommunity.slug ?? "") ||
      communitySettingsOneLiner !== (activeCommunity.one_liner ?? "") ||
      communitySettingsVisibility !== toCanonicalCommunityVisibility(activeCommunity.visibility, "unlisted") ||
      communitySettingsAvatarUrl !== (activeCommunity.avatar_url ?? null) ||
      numberChanged(communitySettingsAvatarFocusX, activeCommunity.avatar_focus_x ?? 0.5) ||
      numberChanged(communitySettingsAvatarFocusY, activeCommunity.avatar_focus_y ?? 0.5) ||
      numberChanged(communitySettingsAvatarZoom, activeCommunity.avatar_zoom ?? 1) ||
      communitySettingsBannerUrl !== (activeCommunity.banner_url ?? null) ||
      numberChanged(communitySettingsBannerFocusX, activeCommunity.banner_focus_x ?? 0.5) ||
      numberChanged(communitySettingsBannerFocusY, activeCommunity.banner_focus_y ?? 0.5) ||
      numberChanged(communitySettingsBannerZoom, activeCommunity.banner_zoom ?? 1)
    );
  }, [
    activeCommunity,
    communitySettingsAvatarFocusX,
    communitySettingsAvatarFocusY,
    communitySettingsAvatarUrl,
    communitySettingsAvatarZoom,
    communitySettingsBannerFocusX,
    communitySettingsBannerFocusY,
    communitySettingsBannerUrl,
    communitySettingsBannerZoom,
    communitySettingsName,
    communitySettingsOneLiner,
    communitySettingsSlug,
    communitySettingsVisibility,
    slugifyCommunityName,
  ]);

  const handleResetCommunityFunnelAbout = useCallback(() => {
    setCommunitySettingsAbout(activeCommunity?.about ?? "");
    setCommunitySettingsError(null);
    communitySettingsDirtyRef.current = hasCommunitySettingsDirtyOutsideFunnelAbout();
  }, [
    activeCommunity?.about,
    hasCommunitySettingsDirtyOutsideFunnelAbout,
    setCommunitySettingsAbout,
    setCommunitySettingsError,
  ]);

  const handleSaveCommunityFunnelAbout = useCallback(async (): Promise<boolean> => {
    const activeSession = await ensureUsableAuthSession();
    if (!activeSession || !activeCommunity) {
      setCommunitySettingsError("Sign in and select a community before saving funnel text.");
      return false;
    }
    setCommunitySettingsError(null);
    setIsSavingCommunitySettings(true);
    try {
      const result = await saveCloudCommunityLaunchProfile({
        session: activeSession,
        communityId: activeCommunity.id,
        input: {
          about: communitySettingsAbout.trim() || null,
        },
      });
      if (!result) throw new Error("Failed to save funnel text.");
      applyCommunityLaunchProfileResult(result);
      communitySettingsDirtyRef.current = hasCommunitySettingsDirtyOutsideFunnelAbout();
      return true;
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to save funnel text.";
      setCommunitySettingsError(message);
      return false;
    } finally {
      setIsSavingCommunitySettings(false);
    }
  }, [
    activeCommunity,
    applyCommunityLaunchProfileResult,
    communitySettingsAbout,
    ensureUsableAuthSession,
    hasCommunitySettingsDirtyOutsideFunnelAbout,
    setCommunitySettingsError,
    setIsSavingCommunitySettings,
  ]);

  const communityContextJoinRequests = useMemo(
    () =>
      communityJoinRequests
        .filter((request) => String(request.status ?? "").trim().toLowerCase() === "pending")
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
            createdAtLabel: formatRelativeTime(request.created_at),
          };
        }),
    [communityJoinRequests, displayName, savedProfilesByUserId],
  );

  const { communityChatPanelProps, communitySecondarySurfaceProps } =
    buildWebCommunitySurfaceProjection({
      activePage,
      communityTab,
      activeCommunity,
      activeCommunityAccess,
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
      canViewActiveCommunitySettings,
      communitySettingsLayer,
      communitySettingsPane,
      onSelectCommunitySettingsPane: handleSelectCommunitySettingsPane,
      onPreviewCommunityOnboarding: handlePreviewCommunityOnboarding,
      canManageCommunitySettings,
      canDeleteActiveCommunity,
      requireSignIn,
      accountCommerceStatus,
      accountCommerceError,
      startStripeConnectOnboarding,
      isStartingStripeConnectOnboarding,
      communityIntegrations: {
        mounts: communityAppMounts,
        effectiveMcpApps,
        isLoading: isLoadingCommunityAppMounts,
        isLoadingEffectiveMcpApps,
        error: communityAppMountError,
        mutationError: communityAppMutationError,
        updatingMountId: updatingCommunityAppMountId,
        refreshingMountId: refreshingCommunityAppMountId,
        removingMountId: removingCommunityAppMountId,
        onUpdateMount: handleUpdateCommunityAppMount,
        onRefreshApp: handleRefreshCommunityApp,
        onSetupImportedMcpApp: handleSetupImportedCommunityMcpApp,
        onUnmountApp: handleUnmountCommunityApp,
        isOptingIntoApp: isConnectingUserPlatformApp,
        refreshingPersonalMountId: refreshingUserPlatformAppMountId,
        reconnectingPersonalMountId: reconnectingUserPlatformAppMountId,
        onOptInApp: handleConnectUserPlatformApp,
        onBeginPersonalAppOAuth: handleBeginUserPlatformAppOAuth,
        onRefreshPersonalApp: handleRefreshUserPlatformApp,
        onReconnectPersonalApp: handleReconnectUserPlatformApp,
      },
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
        posts: activeCommunityFeedState.posts,
        isLoading: activeCommunityFeedState.isLoading,
        error: activeCommunityFeedState.error,
        moderatingPostId: communityFeedModeratingPostId,
      },
      feedActions: {
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
      aiAgentPreferredTab: communityAiAgentPreferredTab,
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
      aiAgentAppsEditorProps: {
        intro: "Manage apps attached to this community.",
        emptyState: "No apps are attached to this community yet.",
        mounts: communityAppMounts,
        effectiveMcpApps,
        isLoading: isLoadingCommunityAppMounts,
        isLoadingEffectiveMcpApps,
        error: communityAppMountError,
        mutationError: communityAppMutationError,
        updatingMountId: updatingCommunityAppMountId,
        refreshingMountId: refreshingCommunityAppMountId,
        removingMountId: removingCommunityAppMountId,
        onUpdateMount: handleUpdateCommunityAppMount,
        onRefreshApp: handleRefreshCommunityApp,
        onUnmountApp: handleUnmountCommunityApp,
      },
      aiAgentSkillsEditorProps: {
        intro: "Attach reusable skill packages here so this community lens can load behavior units on demand without bloating the base prompt.",
        emptyState: "Attach the first skill package to this community. Attached skills become available when members explicitly mention them in this lens.",
        addButtonLabel: "Create skill",
        platformSkills: canManageResourcesActiveCommunity
          ? COMMUNITY_MANAGER_PLATFORM_SKILLS
          : [],
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
        directoryLimit: resourceDirectoryLimit,
        directoryTruncated: resourceDirectoryTruncated,
        directoryError: resourceDirectoryError,
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
        loadResourceContent: loadCommunityResourceContent,
        reloadDirectory: async () => {
          const usableSession = await ensureUsableAuthSession();
          if (!usableSession || !activeCommunityId) return;
          await loadCommunityResources(activeCommunityId, usableSession);
        },
      },
      eventsState: {
        events: communityEvents,
        isLoadingEvents: isLoadingCommunityEvents,
        eventsError: communityEventsError,
        visibleMonthIso: communityEventsVisibleMonthIso,
      },
      eventsActions: {
        setVisibleMonthIso: setCommunityEventsVisibleMonthIso,
        getVisibleRange: getCommunityEventsMonthRange,
        reloadEvents: async (range) => {
          const usableSession = await ensureUsableAuthSession();
          if (!usableSession || !activeCommunityId) return;
          await loadCommunityEvents(activeCommunityId, usableSession, range);
        },
        saveEvent: handleSaveCommunityEvent,
        cancelEvent: handleCancelCommunityEvent,
      },
      canManageResourcesActiveCommunity,
      canModerateContentActiveCommunity,
      resourceModuleModalProps,
      resourceModuleDeleteModalProps,
      resourceModalProps,
      canPostMessagesActiveCommunity,
      isProfileSetupComplete: isProfileSetupCompleteForPublicActions,
      onThreadTypingSignal: signalThreadTyping,
      profilesByUserId: savedProfilesByUserId,
      mentionableCommunityMembers: communityDirectoryMembers,
      communityAttachments,
      communityMessageInput,
      communityMessageMentions,
      setCommunityMessageMentions,
      communityAgentServeIssue,
      onDismissCommunityAgentServeIssue: handleDismissCommunityAgentServeIssue,
      onConnectCommunityAgentServeProvider: handleConnectCommunityAgentServeProvider,
      isSendingCommunityMessage,
      communityChatError,
      messageListRef: communityChatListRef,
      fileInputRef: communityFileInputRef,
      chatInputRef,
      onFinishProfileSetup: openProfileSetup,
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
      onCommunityMessageInputChange: (value: string, textarea?: HTMLTextAreaElement) => {
        setCommunityMessageInput(value);
        if (!textarea) return;
        textarea.style.height = "auto";
        textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
      },
      onSendCommunityMessage: handleSendCommunityMessage,
      displayName,
      getAvatarColor,
      getInitials,
      formatChatTime,
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
        mobileThreadPage: mobileThreadPageOpen,
        onMobileReadingModeChange: mobileChromeScrollTrackingEnabled
          ? setMobileChromeReadingMode
          : undefined,
        roots: appendPendingRoots(communityInteractionRoots, pendingCanonicalInteractions, activeCommunityId),
        selectedRootId: selectedCommunityInteractionRootId,
        replies: appendPendingReplies(
          selectedCommunityInteractionRootId
            ? communityInteractionRepliesByRootId[selectedCommunityInteractionRootId] ?? []
            : [],
          pendingCanonicalInteractions,
          selectedCommunityInteractionRootId,
        ),
        isLoadingRoots:
          isLoadingCommunityInteractions ||
          communityInteractionRootChangeReason === "reset" ||
          communityInteractionProjectionBoundaryRef.current !==
            `${canonicalSessionUserId}:${activeCommunityId}`,
        isLoadingReplies:
          selectedCommunityInteractionRootId !== null
          && loadingCommunityInteractionRepliesRootId === selectedCommunityInteractionRootId,
        error: communityInteractionError,
        repliesError: selectedCommunityInteractionRootId
          ? communityInteractionRepliesErrorByRootId[selectedCommunityInteractionRootId] ?? null
          : null,
        onSelectRoot: handleSelectCommunityInteractionRoot,
        onCloseDrawer: handleCloseCommunityInteractionDrawer,
        onToggleReaction: handleToggleCommunityInteractionReaction,
        onEditMessage: handleEditCommunityInteractionMessage,
        onDeleteMessage: handleDeleteCommunityInteractionMessage,
        currentUserId: canonicalSessionUserId,
        chatLastSeenAt: chatDividerBoundary,
        rootChangeReason: communityInteractionRootChangeReason,
        canLoadOlderRoots: Boolean(communityInteractionNextBeforeCreatedAt),
        isLoadingOlderRoots: isLoadingOlderCommunityInteractionRoots,
        onLoadOlderRoots: () => {
          if (!activeCommunityId) return;
          void loadOlderCommunityInteractionRoots(activeCommunityId, session);
        },
        onCaughtUp: handleChatCaughtUp,
        onRetryRoots: () => {
          if (!activeCommunityId) return;
          void loadCommunityInteractionRoots(activeCommunityId, session);
        },
        onRetryReplies: (rootId: string) => {
          void loadCommunityInteractionReplies(rootId, session);
        },
        onRetrySend: handleRetryPendingCanonicalInteraction,
        onDiscardPending: handleDiscardPendingCanonicalInteraction,
        typingPresence: communityTypingUsers,
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
  const activateDiscoverCommunityCard = useCallback((opts: {
    canActivate: boolean;
    community: DiscoverCommunity;
  }) => {
    if (!opts.canActivate) return;
    const slug = opts.community.slug.trim();
    if (!slug) return;
    setDiscoverError(null);

    const knownCommunityId = resolveKnownCommunityIdBySlug(slug);
    if (knownCommunityId) {
      enterJoinedCommunity({
        communityId: knownCommunityId,
        communitySlug: slug,
      });
      return;
    }

    publicCommunityUi.setPublicCommunity({
      slug,
      name: opts.community.name,
      one_liner: opts.community.one_liner ?? null,
      about: opts.community.about ?? null,
      avatar_url: opts.community.avatar_url ?? null,
      avatar_focus_x: opts.community.avatar_focus_x ?? null,
      avatar_focus_y: opts.community.avatar_focus_y ?? null,
      avatar_zoom: opts.community.avatar_zoom ?? null,
      banner_url: opts.community.banner_url ?? null,
      banner_focus_x: opts.community.banner_focus_x ?? null,
      banner_focus_y: opts.community.banner_focus_y ?? null,
      banner_zoom: opts.community.banner_zoom ?? null,
      visibility: opts.community.visibility,
      entry_policy: opts.community.entry_policy ?? null,
      created_at: opts.community.created_at,
      updated_at: opts.community.updated_at,
      funnel: opts.community.funnel ?? null,
      member_count: typeof opts.community.member_count === "number" ? opts.community.member_count : null,
      admin_count: null,
      online_count: null,
      online_faces: null,
    });
    publicCommunityUi.setPublicCommunityPlans(opts.community.active_plan ? [opts.community.active_plan] : []);
    publicCommunityUi.setPublicCommunityAccess(null);
    publicCommunityUi.setPublicCommunityAccessResolution({
      status: "not_required",
      communitySlug: null,
      authSubject: null,
    });
    publicCommunityUi.setPublicCommunityError(null);
    publicCommunityUi.setPublicJoinError(null);
    publicCommunityUi.setIsLoadingPublicCommunity(true);
    setCheckoutError(null);
    setCheckoutStatus("idle");
    openPublicCommunityFunnel(slug, { pushSnapshot: true });
  }, [
    enterJoinedCommunity,
    openPublicCommunityFunnel,
    publicCommunityUi,
    resolveKnownCommunityIdBySlug,
    setCheckoutError,
    setCheckoutStatus,
  ]);
  const openOwnedPartnerCommunitySettings = useCallback((communityId: string) => {
    if (
      !confirmDiscardUnsavedCommunitySettingsWeb({
        isCommunitySettingsDirty: communitySettingsDirtyRef.current,
        isCommunityAgentConfigDirty: communityAgentConfigDirtyRef.current,
        activeCommunityId: selectedActiveCommunityId,
        nextCommunityId: communityId,
        confirmDiscard: (message) => window.confirm(message),
      })
    ) {
      return;
    }
    const nextCommunitySlug =
      resolveKnownCommunitySlugById(communityId) ??
      (String(
        communities.find((community) => community.id === communityId)?.slug ?? "",
      ).trim() || null);
    if (!nextCommunitySlug) return;
    openCommunityTab(nextCommunitySlug, "settings", { pushSnapshot: false });
  }, [
    communities,
    openCommunityTab,
    resolveKnownCommunitySlugById,
    selectedActiveCommunityId,
  ]);
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
      session: session,
      authError,
      requireSignIn,
      handleSignOut,
      isLoadingChatgptConnection,
      chatgptConnection,
      isLoadingOpenAiConnection: isLoadingChatgptConnection,
      openAiConnection,
      hasPendingChatgptAuth,
      formatRelativeTime,
      communities,
      communityRoleById,
      openOwnedCommunitySettings: openOwnedPartnerCommunitySettings,
      communityInitials,
      builderPartnerProgram,
      isLoadingBuilderPartnerProgram,
      builderPartnerProgramError,
      isAcceptingBuilderPartnerTerms,
      renderMarkdown,
      loadBuilderPartnerProgram: async (nextSession) => {
        await loadBuilderPartnerProgram(nextSession as AuthSession);
      },
      acceptBuilderPartnerTerms,
      openAccountSetup: openProfileSetup,
      openCreateCommunityModal: () => openCreateCommunityModal(),
      startStripeConnectOnboarding: (opts) => {
        void startStripeConnectOnboarding({
          context: opts?.context ?? "account",
          communitySlug: opts?.communitySlug ?? null,
          country: opts?.country ?? null,
        });
      },
      canUseDevTierOverride,
      setDevAccountTier,
      providerConnectionUi,
      billingUi,
    },
    agent: {
      session: session,
      exportError,
      exportThreadsCsv,
      exportMessagesCsv,
      exportMemoryCsv,
      isExporting,
      userMemorySettings,
      isLoadingUserMemorySettings,
      saveUserMemorySettings: async (next) => {
        await saveUserMemorySettingsAndRefreshSetup(next);
      },
      loadPersonalMemoryItems,
      formatRelativeTime,
      handleTogglePersonalMemoryPinned,
      handleDeletePersonalMemoryItem,
      handleCreatePersonalMemoryItem,
      personalMemoryUi,
    },
    billing: {
      session: session,
      startPremiumSubscriptionCheckout,
      billingUi,
    },
    integrations: {
      session: session,
      requireSignIn,
      effectiveMcpApps,
      isLoadingEffectiveMcpApps,
      effectiveMcpAppsError,
      effectiveSkills: effectiveSkillsForSettings,
      isLoadingEffectiveSkills,
      effectiveSkillsError: effectiveSkillsErrorForSettings,
      isLoadingUserPlatformAppMounts,
      userPlatformAppMountError,
      userPlatformAppMutationError,
      isConnectingUserPlatformApp,
      updatingUserPlatformAppMountId,
      refreshingUserPlatformAppMountId,
      refreshingCommunityAppMountId,
      reconnectingUserPlatformAppMountId,
      removingUserPlatformAppMountId,
      userPlatformSkills,
      isLoadingUserPlatformSkills,
      userPlatformSkillError,
      userPlatformSkillMutationError,
      isCreatingUserPlatformSkill,
      updatingUserPlatformSkillInstallId,
      removingUserPlatformSkillInstallId,
      onConnectUserPlatformApp: handleConnectUserPlatformApp,
      onBeginUserPlatformAppOAuth: handleBeginUserPlatformAppOAuth,
      onUpdateUserPlatformAppMount: handleUpdateUserPlatformAppMount,
      onRefreshUserPlatformApp: handleRefreshUserPlatformApp,
      onReconnectUserPlatformApp: handleReconnectUserPlatformApp,
      onSetupImportedCommunityMcpApp: handleSetupImportedCommunityMcpApp,
      onUnmountUserPlatformApp: handleUnmountUserPlatformApp,
      onCreateUserPlatformSkill: handleCreateUserPlatformSkill,
      onSaveUserPlatformSkill: handleSaveUserPlatformSkill,
      onUpdateUserPlatformSkill: handleUpdateUserPlatformSkill,
      onDeleteUserPlatformSkill: handleDeleteUserPlatformSkill,
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
    Number(Boolean(activeCommunityAttentionSummary.chat)) +
    Number(Boolean(activeCommunityAttentionSummary.ai_feed)) +
    Number(Boolean(activeCommunityAttentionSummary.resources)) +
    Number(Boolean(activeCommunityAttentionSummary.events));
  const directMessageWebNotifications = useDirectMessageWebNotifications({
    isEnabled: Boolean(session),
    unreadCount: directMessagesUnreadCount,
    onOpenConversation: handleOpenDirectConversationById,
  });
  useEffect(() => {
    if (!session || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const dmConversationId = String(url.searchParams.get("dm") ?? "").trim();
    if (!dmConversationId) return;
    url.searchParams.delete("dm");
    window.history.replaceState(
      window.history.state ?? {},
      document.title,
      `${url.pathname}${url.search}${url.hash}`,
    );
    handleOpenDirectConversationById(dmConversationId);
  }, [session, handleOpenDirectConversationById]);
  const directMessagesUnreadLabel =
    directMessagesUnreadCount > 0 ? `${directMessagesUnreadCount} unread` : null;
  const directMessagesButton = session ? (
    <button
      className={`icon-button direct-messages-topbar-button${isDirectMessagesOpen ? " active" : ""}`}
      onClick={handleToggleDirectMessages}
      aria-expanded={isDirectMessagesOpen}
      aria-label={
        isDirectMessagesOpen
          ? "Close direct messages"
          : directMessagesUnreadLabel
            ? `Open direct messages, ${directMessagesUnreadLabel}`
            : "Open direct messages"
      }
      title={
        isDirectMessagesOpen
          ? "Close direct messages"
          : directMessagesUnreadLabel
            ? `Direct messages (${directMessagesUnreadLabel})`
            : "Direct messages"
      }
      type="button"
    >
      <MessageCircle aria-hidden="true" />
      {directMessagesUnreadCount > 0 ? (
        <span className="unread-badge">
          {directMessagesUnreadCount > 99 ? "99+" : directMessagesUnreadCount}
        </span>
      ) : null}
    </button>
  ) : null;
  const handleSelectCommunityTab = useCallback((tab: CommunityTab) => {
    setCommunityResourceModuleId(null);
    if (isCommunityRouteManagedTab(tab)) {
      const nextCommunitySlug = String(selectedActiveCommunitySlug ?? activeCommunity?.slug ?? "").trim();
      if (nextCommunitySlug) {
        openCommunityTab(nextCommunitySlug, tab, { pushSnapshot: false });
        return;
      }
    }
    applyCommunityShellState({ communityTab: tab });
  }, [
    activeCommunity,
    applyCommunityShellState,
    openCommunityTab,
    selectedActiveCommunitySlug,
  ]);
  const handleSelectCommunityTabFromMobile = useCallback((tab: CommunityTab) => {
    setMobileOverlay(null);
    handleSelectCommunityTab(tab);
  }, [handleSelectCommunityTab]);
  const handleCommunityOnboardingOrientationCompleted = useCallback(() => {
    setCommunityOnboardingFirstPostFocusRequest((current) => current + 1);
    if (!isCommunityOnboardingPreviewMode) handleSelectCommunityTab("chat");
  }, [handleSelectCommunityTab, isCommunityOnboardingPreviewMode]);

  const standalonePublicRouteViewProps = buildWebStandalonePublicRouteViewProps({
    publicRouteKind: publicRoute.kind,
    showSignIn: showPublicSignIn,
    requireSignIn,
    checkoutStatus,
    retryCheckoutFinalize,
    checkoutError,
    authError,
  });

  if (standalonePublicRouteViewProps) {
    return (
      <Suspense fallback={<div className="landing-auth-hold" aria-hidden="true" />}>
        <WebStandalonePublicRouteShell {...standalonePublicRouteViewProps} />
      </Suspense>
    );
  }

  const shouldSuppressPreviewSidebarAuthError =
    Boolean(previewAccessGateModal) ||
    readAuthResumeState()?.intent?.reason === "open_workspace_draft";
  const previewSidebarAuthError = shouldSuppressPreviewSidebarAuthError ? null : authError;

  const globalOverlayHostProps = buildWebGlobalOverlayHostProps({
    contextModal,
    setContextModal,
    session: session,
    createPersonalMemoryItemDirect,
    showMemoryToastMessage,
    requireSignIn,
    accountCommerceStatus,
    setAccountCommerceError,
    setIsFreeAccountInfoOpen,
    personalMemoryUi,
    handleImportExternalMemory,
    providerConnectionModalHostProps: providerConnectionUi.modalHostProps,
    previewAccessGateModal,
    previewAccessGateAuthError: authError,
    isPreviewAccessGateRunning,
    closePreviewAccessGateModal,
    continuePreviewAccessGateAuth,
    inferenceIssueModal,
    isInferenceIssueModalRunning,
    setInferenceIssueModal,
    onOpenSettings: openGlobalSettings,
    onOpenPremiumBilling: openPremiumBilling,
    isFreeAccountInfoOpen,
    accountCommerceError,
    communityModalHostProps: communityUi.modalHostProps,
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
      displayName: profileUi.profileName,
      handle: profileUi.profileHandle,
      bio: profileUi.profileBio,
      socialLinks: profileUi.profileSocialLinks,
      avatarUrl: profileUi.profileAvatarUrl,
      avatarFocusX: profileUi.profileAvatarFocusX,
      avatarFocusY: profileUi.profileAvatarFocusY,
      avatarZoom: profileUi.profileAvatarZoom,
      isAvatarFocusModalOpen: profileUi.isProfileAvatarFocusModalOpen,
      handleAvailability: onboardingHandleAvailability,
      isCheckingHandleAvailability: isCheckingOnboardingHandle,
      isAvatarDragOver: profileUi.isProfileAvatarDragOver,
      isSaving: isSavingOnboarding,
      error: onboardingError,
      setIsAvatarDragOver: profileUi.setIsProfileAvatarDragOver,
      setAvatarFocusX: profileUi.setProfileAvatarFocusX,
      setAvatarFocusY: profileUi.setProfileAvatarFocusY,
      setAvatarZoom: profileUi.setProfileAvatarZoom,
      setIsAvatarFocusModalOpen: profileUi.setIsProfileAvatarFocusModalOpen,
      onAvatarDrop: handleProfileAvatarDrop,
      onAvatarUpload: handleProfileAvatarUpload,
      onRemoveAvatar: () => {
        profileUi.setProfileAvatarUrl(null);
        profileUi.setProfileAvatarStorageId(null);
        profileUi.setProfileAvatarFocusX(0.5);
        profileUi.setProfileAvatarFocusY(0.5);
        profileUi.setProfileAvatarZoom(1);
      },
      onDisplayNameChange: profileUi.setProfileName,
      onHandleChange: profileUi.setProfileHandle,
      onBioChange: profileUi.setProfileBio,
      onSocialLinkChange: profileUi.setProfileSocialLink,
      onNextProfile: saveOnboardingProfile,
      chatgptConnected: chatgptConnection.connected,
      chatgptStatus: isLoadingChatgptConnection
        ? "Checking..."
        : chatgptConnection.connected
          ? chatgptConnection.email
            ? `Connected as ${chatgptConnection.email}`
            : "Connected"
          : "Not connected",
      isConnectingChatgpt: providerConnectionUi.isConnectingChatgpt,
      isPollingChatgptConnection: providerConnectionUi.isPollingChatgptConnection,
      onConnectChatgpt: () => {
        void providerConnectionUi.handleConnectChatgpt();
      },
      openAiConnected: openAiConnection.connected,
      openAiStatus: isLoadingChatgptConnection
        ? "Checking..."
        : openAiConnection.connected
          ? `Connected${openAiConnection.key_last_four ? ` · key ending ${openAiConnection.key_last_four}` : ""}`
          : "Not connected",
      openAiApiKeyDraft: providerConnectionUi.openAiApiKeyDraft,
      setOpenAiApiKeyDraft: providerConnectionUi.setOpenAiApiKeyDraft,
      isSavingOpenAiConnection: providerConnectionUi.isSavingOpenAiConnection,
      openAiConnectionError: providerConnectionUi.openAiConnectionError,
      openAiConnectionSuccess: providerConnectionUi.openAiConnectionSuccess,
      onConnectOpenAi: providerConnectionUi.handleConnectOpenAi,
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
              displayName: profileUi.profileName,
              handle: profileUi.profileHandle,
              avatarUrl: profileUi.profileAvatarUrl,
              avatarFocusX: profileUi.profileAvatarFocusX,
              avatarFocusY: profileUi.profileAvatarFocusY,
              avatarZoom: profileUi.profileAvatarZoom,
              socialLinks: profileUi.profileSocialLinks,
              handleAvailability: onboardingHandleAvailability,
              isCheckingHandleAvailability: isCheckingOnboardingHandle,
              onDisplayNameChange: profileUi.setProfileName,
              onHandleChange: profileUi.setProfileHandle,
              onSocialLinkChange: profileUi.setProfileSocialLink,
              onAvatarUpload: handleProfileAvatarUpload,
              chatgptConnected: chatgptConnection.connected,
              openAiConnected: openAiConnection.connected,
              isConnectingChatgpt: providerConnectionUi.isConnectingChatgpt,
              isPollingChatgptConnection: providerConnectionUi.isPollingChatgptConnection,
              onConnectChatgpt: () => {
                void providerConnectionUi.handleConnectChatgpt();
              },
              openAiApiKeyDraft: providerConnectionUi.openAiApiKeyDraft,
              setOpenAiApiKeyDraft: providerConnectionUi.setOpenAiApiKeyDraft,
              isSavingOpenAiConnection: providerConnectionUi.isSavingOpenAiConnection,
              openAiConnectionError: providerConnectionUi.openAiConnectionError,
              openAiConnectionSuccess: providerConnectionUi.openAiConnectionSuccess,
              onConnectOpenAi: providerConnectionUi.handleConnectOpenAi,
              isSaving: isSavingOnboarding,
              error: onboardingError,
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
      showOperatorConsole: hasOperatorAccess,
      onOpenOperatorConsole: () => openOperatorConsole("platform"),
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
      gateOpenNonce: visitorGateNonce,
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
      admissionStatus: publicCommunityAdmissionStatus,
      canEnterCommunity: canEnterPublicCommunity,
      canJoinForFree,
      canJoinWithApproval,
      canJoinWithCheckout,
      checkoutStatus,
      isJoiningPublicCommunity: publicCommunityUi.isJoiningPublicCommunity,
      isCancellingPublicCommunityJoinRequest:
        publicCommunityUi.isCancellingPublicCommunityJoinRequest,
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
           (join/enter/checkout), never on arrival. */
        !isPublicFunnelPreviewRoute &&
        session &&
        publicCommunityAdmissionStatus === "ready" &&
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
              displayName: profileUi.profileName,
              handle: profileUi.profileHandle,
              avatarUrl: profileUi.profileAvatarUrl,
              avatarFocusX: profileUi.profileAvatarFocusX,
              avatarFocusY: profileUi.profileAvatarFocusY,
              avatarZoom: profileUi.profileAvatarZoom,
              socialLinks: profileUi.profileSocialLinks,
              handleAvailability: onboardingHandleAvailability,
              isCheckingHandleAvailability: isCheckingOnboardingHandle,
              onDisplayNameChange: profileUi.setProfileName,
              onHandleChange: profileUi.setProfileHandle,
              onSocialLinkChange: profileUi.setProfileSocialLink,
              onAvatarUpload: handleProfileAvatarUpload,
              chatgptConnected: chatgptConnection.connected,
              openAiConnected: openAiConnection.connected,
              isConnectingChatgpt: providerConnectionUi.isConnectingChatgpt,
              isPollingChatgptConnection: providerConnectionUi.isPollingChatgptConnection,
              onConnectChatgpt: () => {
                void providerConnectionUi.handleConnectChatgpt();
              },
              openAiApiKeyDraft: providerConnectionUi.openAiApiKeyDraft,
              setOpenAiApiKeyDraft: providerConnectionUi.setOpenAiApiKeyDraft,
              isSavingOpenAiConnection: providerConnectionUi.isSavingOpenAiConnection,
              openAiConnectionError: providerConnectionUi.openAiConnectionError,
              openAiConnectionSuccess: providerConnectionUi.openAiConnectionSuccess,
              onConnectOpenAi: providerConnectionUi.handleConnectOpenAi,
              isSaving: isSavingOnboarding,
              error: onboardingError,
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
  const memberAgentDockCommunity = activePage === "community" ? activeCommunity : null;
  const memberAgentSurfaceContext: MemberAgentSurfaceContextV1 | null =
    activePage === "community" && memberAgentDockCommunity?.slug
      ? {
          version: 1,
          kind: "community",
          community_slug: memberAgentDockCommunity.slug,
          section: communityTab,
        }
      : activePage === "discover"
        ? { version: 1, kind: "discover", section: "communities" }
        : activePage === "settings" ||
            activePage === "docs" ||
            activePage === "operator"
          ? {
              version: 1,
              kind: "platform",
              page: activePage,
              section:
                activePage === "settings"
                  ? settingsPage
                  : activePage === "operator"
                    ? activeOperatorTab
                    : null,
            }
          : null;
  const isMemberAgentDockVisible =
    Boolean(session) &&
    publicRoute.kind === "app" &&
    activePage !== "landing" &&
    activePage !== "onboarding" &&
    hasResolvedCommunities &&
    Boolean(memberAgentSurfaceContext) &&
    !isCommunityLaunchSetupModalOpen &&
    !isDirectMessagesOpen &&
    !isOnboardingModalOpen;
  const memberAgentVoiceScopeKey = `${activePage}:${communityTab}:${memberAgentDockCommunity?.id ?? "platform"}`;
  const previousMemberAgentVoiceScopeKeyRef = useRef(memberAgentVoiceScopeKey);
  useEffect(() => {
    const scopeChanged =
      previousMemberAgentVoiceScopeKeyRef.current !== memberAgentVoiceScopeKey;
    previousMemberAgentVoiceScopeKeyRef.current = memberAgentVoiceScopeKey;
    if (
      memberAgentVoiceUiState !== "idle" &&
      (!isMemberAgentDockVisible || scopeChanged)
    ) {
      cancelVoiceInput();
    }
  }, [
    cancelVoiceInput,
    isMemberAgentDockVisible,
    memberAgentVoiceScopeKey,
    memberAgentVoiceUiState,
  ]);
  const globalOverlays = (
    <>
      <WebGlobalOverlayHost {...globalOverlayHostProps} />
      <Suspense fallback={null}>
        <WebMemberAgentDock
          ref={memberAgentComposerApiRef}
          isVisible={isMemberAgentDockVisible}
          mobileShellActive={showMobileShell}
          mobileRoot={showMobileShell && mobileRootPage === "agent"}
          onRequestOpen={() => setMobileRootPage("agent")}
          communityId={memberAgentDockCommunity?.id ?? null}
          communityName={memberAgentDockCommunity?.name ?? null}
          surfaceContext={memberAgentSurfaceContext}
          session={session}
          ensureSession={ensureUsableAuthSession}
          fetchPublic={fetchWithPublic}
          fetchAuth={fetchWithAuth}
          voiceButtonProps={{
            state: memberAgentVoiceUiState,
            title: memberAgentVoiceIntent.title,
            onClick: () => {
              void handleVoiceInputClick("member_agent");
            },
          }}
          finalizeVoiceInputForSubmit={() =>
            finishVoiceInputForSubmit("member_agent")
          }
        />
      </Suspense>
      <WebDirectMessagesHost
        isOpen={isDirectMessagesOpen}
        mobileRoot={showMobileShell && mobileRootPage === "messages"}
        openRequest={directMessageOpenRequest}
        openConversationRequest={directMessageOpenConversationRequest}
        session={session}
        ensureSession={ensureUsableAuthSession}
        sessionUserId={canonicalSessionUserId}
        getInitials={getInitials}
        getAvatarColor={getAvatarColor}
        renderTextWithLinks={renderTextWithLinks}
        requireSignIn={() => requireSignIn()}
        showAppToastMessage={showAppToastMessage}
        onUnreadCountChange={setDirectMessagesUnreadCount}
        onIncomingDirectMessage={directMessageWebNotifications.notifyIncoming}
        onDirectMessageSent={directMessageWebNotifications.requestPermissionIfNeeded}
        notificationsState={directMessageWebNotifications.notificationsState}
        onToggleNotifications={directMessageWebNotifications.toggleNotifications}
        onClose={handleCloseDirectMessages}
      />
      <WebCommunityLaunchSetupModal
        isOpen={isCommunityLaunchSetupModalOpen}
        mode={isCommunityLaunchCreateMode ? "create" : "setup"}
        community={
          !isCommunityLaunchCreateMode && activeCommunity
            ? {
                id: activeCommunity.id,
                slug: activeCommunity.slug,
                name: activeCommunity.name,
                one_liner: activeCommunity.one_liner,
                about: activeCommunity.about,
                avatar_url: activeCommunity.avatar_url,
                avatar_storage_id: activeCommunity.avatar_storage_id ?? null,
                avatar_focus_x: activeCommunity.avatar_focus_x,
                avatar_focus_y: activeCommunity.avatar_focus_y,
                avatar_zoom: activeCommunity.avatar_zoom,
                banner_url: activeCommunity.banner_url,
                banner_storage_id: activeCommunity.banner_storage_id ?? null,
                banner_focus_x: activeCommunity.banner_focus_x,
                banner_focus_y: activeCommunity.banner_focus_y,
                banner_zoom: activeCommunity.banner_zoom,
                visibility: activeCommunity.visibility,
                entry_policy: activeCommunity.entry_policy ?? null,
                agent_system_prompt: communityAgentConfigCommunitySystemPrompt,
              }
            : null
        }
        status={communityLaunchSetupStatus}
        initialStep={communityLaunchSetupInitialStep}
        knowledgeIntegrationReloadKey={communityLaunchKnowledgeIntegrationReloadKey}
        knowledgeAutoOpenProvider={communityLaunchKnowledgeAutoOpenProvider}
        knowledgeLinkSources={communityLaunchLinkSources}
        knowledgeFileSources={communityLaunchFileSources}
        knowledgeGoogleDriveSources={communityLaunchGoogleDriveSources}
        knowledgeGitHubSources={communityLaunchGitHubSources}
        onClose={() => {
          setIsCommunityLaunchSetupModalOpen(false);
          setIsCommunityLaunchCreateMode(false);
          setCommunityLaunchSetupInitialStep(null);
          setCommunityLaunchKnowledgeAutoOpenProvider(null);
          setPendingCommunityLaunchKnowledgeOAuthContext(null);
          setPendingCommunityLaunchSetupRouteContext(null);
          clearCommunityLaunchSetupRouteState();
        }}
        onKnowledgeAutoOpenHandled={(provider) => {
          setCommunityLaunchKnowledgeAutoOpenProvider((current) =>
            current === provider ? null : current,
          );
        }}
        onStepChange={(step) => {
          replaceCommunityLaunchSetupRouteState(step);
        }}
        onOpenStep={handleOpenCommunityLaunchSetupStep}
        onCreateCommunity={handleCreateCommunityFromLaunch}
        onSaveProfile={handleSaveCommunityLaunchProfile}
        onSaveAbout={handleSaveCommunityLaunchAbout}
        onAddKnowledgeLink={handleAddCommunityLaunchKnowledgeLink}
        accountTier={accountCommerceStatus?.account_tier ?? null}
        onOpenPremiumBilling={openPremiumBilling}
        onAddKnowledgeFile={handleAddCommunityLaunchKnowledgeFile}
        onLoadKnowledgeSources={handleLoadCommunityLaunchKnowledgeSources}
        onRemoveKnowledgeLinkSource={handleRemoveCommunityLaunchKnowledgeSource}
        onRemoveKnowledgeFileSource={handleRemoveCommunityLaunchKnowledgeSource}
        onIngestKnowledgeSources={handleIngestCommunityLaunchKnowledgeSources}
        onLoadKnowledgeGoogleDriveConnection={handleLoadCommunityLaunchGoogleDriveConnection}
        onConnectKnowledgeGoogleDrive={handleConnectCommunityLaunchGoogleDrive}
        onListKnowledgeGoogleDriveFiles={handleListCommunityLaunchGoogleDriveFiles}
        onImportKnowledgeGoogleDriveFiles={handleImportCommunityLaunchGoogleDriveFiles}
        onRemoveKnowledgeGoogleDriveSource={handleRemoveCommunityLaunchKnowledgeSource}
        onDisconnectKnowledgeGoogleDrive={handleDisconnectCommunityLaunchGoogleDrive}
        onLoadKnowledgeGitHubConnection={handleLoadCommunityLaunchGitHubConnection}
        onConnectKnowledgeGitHub={handleConnectCommunityLaunchGitHub}
        onListKnowledgeGitHubRepositories={handleListCommunityLaunchGitHubRepositories}
        onListKnowledgeGitHubFiles={handleListCommunityLaunchGitHubFiles}
        onImportKnowledgeGitHubFiles={handleImportCommunityLaunchGitHubFiles}
        onRemoveKnowledgeGitHubSource={handleRemoveCommunityLaunchKnowledgeSource}
        onDisconnectKnowledgeGitHub={handleDisconnectCommunityLaunchGitHub}
        onGenerateKnowledgePlan={handleGenerateCommunityLaunchKnowledgePlan}
        onApplyKnowledgePlan={handleApplyCommunityLaunchKnowledgePlan}
        onDraftKnowledgeResources={handleDraftCommunityLaunchKnowledgeResources}
        onSaveAgent={handleSaveCommunityLaunchAgent}
        onSaveAccess={handleSaveCommunityLaunchAccess}
        onSavePublish={handleSaveCommunityLaunchPublish}
      />
    </>
  );
  const mainSurfaceFallback = (
    <main className="workspace community-mode">
      <div className="landing-auth-hold" aria-hidden="true" />
    </main>
  );
  const mainSurface = (
    <Suspense fallback={mainSurfaceFallback}>
      <WebAppMainSurfaceHost {...mainSurfaceHostProps} />
    </Suspense>
  );
  const activeIndicators = activeCommunityId
    ? (attentionByCommunityId[activeCommunityId] ?? { chat: false, ai_feed: false, resources: false, events: false, mentions: false })
    : { chat: false, ai_feed: false, resources: false, events: false, mentions: false };
  const communityTabIndicators = {
    chat: Boolean(activeIndicators.chat),
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
          if (tab !== "chat") setVisitorGateNonce((nonce) => nonce + 1);
        }
      : handleSelectCommunityTab,
    handleSelectCommunityTabFromMobile: isVisitorCommunitySurface
      ? (tab) => {
          if (tab !== "chat") setVisitorGateNonce((nonce) => nonce + 1);
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
    hasCommunityCreateAccess: Number(accountCommerceStatus?.max_communities ?? 0) > 0,
    openCommunityCreateFlow: openCommunityLaunchCreateFlow,
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
    setIsFreeAccountInfoOpen,
    handleOpenGlobalSettings: isVisitorCommunitySurface
      ? () => navigateTo(buildSettingsPath("agent"))
      : () => openGlobalSettings("agent"),
    settingsGroup: settingsGroup as SettingsGroup,
    setSettingsPage,
    showOperatorConsole: hasOperatorAccess,
    openOperatorConsole: () => openOperatorConsole("platform"),
    hasLeftPanel,
    isGlobalSettings,
    mainSurface,
    globalOverlays,
  });

  return (
    <WebCommunityOnboardingController
      session={communityChatPanelProps.session}
      ensureSession={ensureUsableAuthSession}
      communityId={memberAgentDockCommunity?.id ?? null}
      communityName={memberAgentDockCommunity?.name ?? null}
      communityAvatarUrl={memberAgentDockCommunity?.avatar_url ?? null}
      communityAvatarFocusX={memberAgentDockCommunity?.avatar_focus_x ?? null}
      communityAvatarFocusY={memberAgentDockCommunity?.avatar_focus_y ?? null}
      communityAvatarZoom={memberAgentDockCommunity?.avatar_zoom ?? null}
      isEnabled={Boolean(
        memberAgentDockCommunity &&
        communityChatPanelProps.hasAuthenticatedPresentation &&
        communityChatPanelProps.hasSession
      )}
      previewMode={isCommunityOnboardingPreviewMode}
      canPreview={canManageCommunitySettings}
      onExitPreview={handleExitCommunityOnboardingPreview}
      onOrientationCompleted={handleCommunityOnboardingOrientationCompleted}
    >
      <WebShellChromeHost {...shellChromeHostProps} />
    </WebCommunityOnboardingController>
  );
}
