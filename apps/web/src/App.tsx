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
  type ReactNode,
  type SetStateAction,
} from "react";
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
  clearPendingPurchaseClaimToken, readPendingPurchaseClaimToken, storePendingPublicJoin, storePendingPurchaseClaimToken, type PendingPurchaseClaim
} from "../../../shared/pay_first";
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
} from "../../../shared/appErrorMappings";
import {
  isLikelyImageFile, isLikelyTextFile, isSupportedChatRasterImage, readChatImageAsDataUrl, readTextAttachmentPreview, } from "../../../shared/attachmentHelpers";
import {
  type CreateCommunityIntentDraft,
} from "../../../shared/createCommunityIntent";
import {
  DEFAULT_EMPTY_THREAD_LANDING, normalizeCommunityAgentDraftForSave, normalizeCommunityAgentLanding, type CommunityAgentLanding, } from "../../../shared/communityAgentLanding";
import { normalizeCommunityFunnelConfig } from "../../../shared/communityFunnel";
import {
  buildCsv, dateKeyLocal, formatChatTime, formatCount, formatMoneyBaseUnits, formatPercent, formatRelativeTimeFromIso as formatRelativeTime, parseContentRangeTotal, } from "../../../shared/contentFormatting";
import {
  formatAccountTierLabel, isAccountTierFree, formatPlanPrice, formatSubscriptionPrice, type StripeConnectReturn, } from "../../../shared/accountCommerce";
import { canUseCreatorDevTierOverride } from "../../../shared/devTierOverride";
import { useCheckoutFinalizeController } from "../../../shared/useCheckoutFinalizeController";
import {
  useWebProjectUiController,
  type WebCloudProjectRecord as CloudProjectRecord,
} from "./controllers/useWebProjectUiController";
import { useWebWorkspaceCoreController } from "./controllers/useWebWorkspaceCoreController";
import { useWebCommunityUiController } from "./controllers/useWebCommunityUiController";
import { useWebCommunityAgentConfigUiController } from "./controllers/useWebCommunityAgentConfigUiController";
import { useWebCommunityAppsController } from "./controllers/useWebCommunityAppsController";
import { useWebCommunitySkillAttachmentsController } from "./controllers/useWebCommunitySkillAttachmentsController";
import { useWebCommunityAdminUiController } from "./controllers/useWebCommunityAdminUiController";
import { useWebCommunitySettingsUiController } from "./controllers/useWebCommunitySettingsUiController";
import { useWebCommunityResourceUiController } from "./controllers/useWebCommunityResourceUiController";
import { useWebCommunityPeopleController } from "./controllers/useWebCommunityPeopleController";
import { useWebPersonalMemoryUiController } from "./controllers/useWebPersonalMemoryUiController";
import { useWebPublicCommunityUiController } from "./controllers/useWebPublicCommunityUiController";
import { useWebProfileSettingsUiController } from "./controllers/useWebProfileSettingsUiController";
import { useWebProviderConnectionUiController } from "./controllers/useWebProviderConnectionUiController";
import { useWebEffectiveMcpAppsController } from "./controllers/useWebEffectiveMcpAppsController";
import { useWebUserPlatformAppMountsController } from "./controllers/useWebUserPlatformAppMountsController";
import { useWebUserPlatformSkillsController } from "./controllers/useWebUserPlatformSkillsController";
import { removePersonalMountFromEffectiveMcpApps } from "../../../shared/effectiveMcpApps";
import { useWebWorkspaceProjectStateController } from "./controllers/useWebWorkspaceProjectStateController";
import { useWebWorkspaceModelStateController } from "./controllers/useWebWorkspaceModelStateController";
import { useWebWorkspaceSurfaceController } from "./controllers/useWebWorkspaceSurfaceController";
import { useWebAppAuthController } from "./controllers/useWebAppAuthController";
import { updateSentryUiContext } from "./instrument";
import {
  emitWorkspaceEvent,
  formatWorkspaceInstrumentationError,
} from "./lib/workspaceInstrumentation";
import {
  captureProductAnalyticsEvent,
  clearPendingAnalyticsReturn,
  consumePendingAnalyticsReturn,
  markPendingAnalyticsReturn,
  readPendingAnalyticsReturn,
  updatePosthogUiContext,
} from "./posthogAnalytics";

import {
  useCommunityAiFeedController,
} from "../../../shared/useCommunityAiFeedController";
import { useCommunityAttentionController } from "../../../shared/useCommunityAttentionController";
import { uploadCloudCommunityChatAttachmentFile } from "../../../shared/cloudCommunityChatGateway";
import {
  saveCloudCommunityPublicPresentation,
} from "../../../shared/cloudCommunityFunnelGateway";
import {
  checkCloudProfileHandleAvailability,
  loadCloudAccountSetupStatus,
  prepareCloudProfileAvatarField,
  resolveCloudOnboardingProfileDetail,
  type CloudProfileHandleAvailability,
  upsertCloudProfileDetail,
} from "../../../shared/cloudProfilesGateway";
import {
  isAccountSetupStatusIdentityComplete,
  type AccountSetupStatus,
} from "../../../shared/accountSetup";
import { deleteCloudOwnAccount } from "../../../shared/cloudAccountGateway";
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
  shouldShowCommunitySenderMeta,
  shouldShowDateSeparator,
} from "../../../shared/chatUi";
import {
  type AppPage,
  type AppView,
  type CommunityTab,
  type DiscoverTab,
  isCommunityRouteManagedTab,
  type SettingsGroup,
  type SettingsPage,
  settingsGroupLabel,
  settingsGroupForPage,
} from "../../../shared/appShellNavigation";
import type {
  CommunityAiFeedPost as SharedCommunityAiFeedPost,
  CommunityAiFeedReactionType as SharedCommunityAiFeedReactionType,
  AnalyticsRange as SharedAnalyticsRange,
  ChatLightboxImage as SharedChatLightboxImage,
  CommunityAccess as SharedCommunityAccess,
  CommunityAnalyticsSeries as SharedCommunityAnalyticsSeries,
  CommunityAgentConfig as SharedCommunityAgentConfig,
  CommunityAnalyticsSummary as SharedCommunityAnalyticsSummary,
  CommunityChatMessage as SharedCommunityChatMessage,
  CommunityFunnelConfig as SharedCommunityFunnelConfig,
  DiscoverCommunitySnapshot as SharedDiscoverCommunitySnapshot,
  MessageReaction as SharedMessageReaction,
  PublicPlanSummary as SharedPublicPlanSummary,
  UserProfile as SharedUserProfile,
  UserProfileDetail as SharedUserProfileDetail,
} from "../../../shared/communityTypes";
import type { ConnectCommunityAppInput } from "../../../shared/communityAppMountTypes";
import type { CreateSkillPackageInput } from "../../../shared/skillPackageTypes";
import {
  DISCOVER_APP_CATALOG,
  type DiscoverAppCatalogEntry,
} from "../../../shared/discoverCatalog";
import {
  DISCOVER_SKILL_CATALOG,
  type DiscoverSkillCatalogEntry,
} from "../../../shared/discoverSkillCatalog";
import {
  deriveBackFromWorkspaceSettingsFallbackTransition,
  deriveBackToWorkspaceFallbackTransition,
  deriveOpenDiscoverTransition,
  deriveToggleWorkspaceSettingsTransition,
} from "../../../shared/appNavTransitions";
import {
  type AppShellVariant,
  type AppRouteState,
  type PublicRoute,
  DEFAULT_POST_SIGN_IN_PATH,
  STANDALONE_APP_LAUNCH_SEARCH_PARAM,
  STANDALONE_APP_LAUNCH_SEARCH_VALUE,
  applyShellVariantToPublicPath,
  applyShellVariantToAppPath,
  applyShellVariantToKnownPath,
  buildAppRoutePath,
  buildCommunityFunnelPath,
  buildCommunityTabPath,
  buildCommunityFunnelPreviewPath,
  buildCommunityFunnelPreviewHistoryState,
  buildWorkspaceDraftPath,
  isRootAppRoutePath,
  readAppRouteFromLocation,
  readPublicRouteFromLocation,
  readShellVariantFromPathname,
} from "../../../shared/webAppRouteState";
import { PRODUCT_DOCS_DEFAULT_SLUG } from "./docs/productDocsMeta";
import {
  formatBackTargetLabel as formatBackTargetLabelShared,
  type NavSnapshotBase,
  popNavSnapshot,
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
import { useCommunityChatRealtime } from "../../../shared/useCommunityChatRealtime";
import { useCommunityTypingPresence } from "../../../shared/useCommunityTypingPresence";
import { useCommunityChatViewport } from "../../../shared/useCommunityChatViewport";
import { useCommunityChatLightbox } from "../../../shared/useCommunityChatLightbox";
import { useMessageAttachmentInputController } from "../../../shared/useMessageAttachmentInputController";
import { useCommunityChatDataController } from "../../../shared/useCommunityChatDataController";
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
import type { CloudCommunityMembershipAdminRow } from "../../../shared/cloudCommunityMembershipGateway";
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
  formatModelAttributionLabel,
  type ModelAttributionRuntimeSurface,
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
import { startCloudWorkspaceCreditTopupCheckout } from "../../../shared/cloudAccountCommerceGateway";
import { loadOperatorAccessCanonical } from "../../../shared/cloudOperatorDashboardGateway";
import type { OperatorAccessSnapshot } from "../../../shared/operatorTypes";
import { loadWorkspaceCreditBalanceCanonical, type WorkspaceCreditBalance } from "../../../shared/workspaceCreditsGateway";
import { formatUsdCents, toEpochSeconds } from "../../../shared/displayFormatting";
import type { PaidToolKind, WorkspaceToolBalanceTopupPackId } from "../../../shared/workspaceCredits";
import {
  deriveCommunityFunnelAction,
  deriveCommunityMembersJoinReviewMode,
  type CommunityFunnelAction,
  type CommunityMembersJoinReviewMode,
} from "./communityJoinPolicy";
import { useWebAccountCommerceActions } from "./controllers/useWebAccountCommerceActions";
import { useWebCommerceAffiliateActions } from "./controllers/useWebCommerceAffiliateActions";
import { useWebPublicFunnelActions } from "./controllers/useWebPublicFunnelActions";
import { useWebCommunityChatPreloadLifecycle } from "./controllers/useWebCommunityChatPreloadLifecycle";
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
import { buildWebWorkspaceSurfaceProjection } from "./controllers/buildWebWorkspaceSurfaceProjection";
import { buildWebWorkspaceLandingProjection } from "./controllers/buildWebWorkspaceLandingProjection";
import { useWebVoiceInputController } from "../../../shared/useWebVoiceInputController";
import { useCommunityAgentLandingLifecycle } from "../../../shared/useCommunityAgentLandingLifecycle";
import { useCommunityAgentConfigLifecycle } from "../../../shared/useCommunityAgentConfigLifecycle";
import { useCommunityMemberRosterLifecycle } from "../../../shared/useCommunityMemberRosterLifecycle";
import { useCommunityResourcesTabLifecycle } from "../../../shared/useCommunityResourcesTabLifecycle";
import { useCommunityEventsTabLifecycle } from "../../../shared/useCommunityEventsTabLifecycle";
import {
  useCommunityEventsController,
  type CommunityEventsRange,
} from "../../../shared/useCommunityEventsController";
import { useCommunitySettingsAccessLifecycle } from "../../../shared/useCommunitySettingsAccessLifecycle";
import { confirmDiscardUnsavedCommunitySettingsWeb } from "../../../shared/communityUnsavedGuard";
import {
  markCloudThreadAgentAttentionSeen,
  uploadCloudThreadAttachmentFile,
} from "../../../shared/cloudThreadsGateway";
import type { WebSettingsPanelsProps } from "./components/WebSettingsPanels";
import type { WorkspaceComposerApi, WorkspaceComposerDraft } from "./components/WebWorkspaceHost";
import {
  WebGlobalOverlayHost,
  type WebGlobalOverlayHostProps,
} from "./components/WebGlobalOverlayHost";
import { WebShellChromeHost } from "./components/WebShellChromeHost";
import { WebWorkspaceShellPanelsHost } from "./components/WebWorkspaceShellPanelsHost";
import { buildWebStandalonePublicRouteViewProps } from "./controllers/buildWebStandalonePublicRouteViewProps";
import { buildWebGlobalOverlayHostProps } from "./controllers/buildWebGlobalOverlayHostProps";
import { buildWebAppMainSurfaceHostProps } from "./controllers/buildWebAppMainSurfaceHostProps";
import { buildWebShellChromeHostProps } from "./controllers/buildWebShellChromeHostProps";

const WebAppMainSurfaceHost = lazy(() =>
  import("./components/WebAppMainSurfaceHost").then((module) => ({
    default: module.WebAppMainSurfaceHost,
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

function formatProfileMutationError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("profile_handle_taken")) return "That handle is already taken.";
  if (message.includes("profile_handle_reserved")) return "That handle is reserved.";
  if (message.includes("profile_handle_too_short")) return "Handle must be at least 3 characters.";
  if (message.includes("profile_handle_too_long")) return "Handle must be 32 characters or less.";
  if (message.includes("profile_handle_invalid_format")) {
    return "Handle can use lowercase letters, numbers, underscores, and hyphens.";
  }
  if (message.includes("profile_avatar_invalid")) return "Upload a valid profile photo and try again.";
  return message || fallback;
}

type MobileOverlay = "agent" | "community" | "community_selector";

type MessageAttachment = CommunityMessageAttachment & {
  file?: File | null;
};

type CommunityChatMessage = SharedCommunityChatMessage<MessageAttachment>;
type ChatLightboxImage = SharedChatLightboxImage;
type CommunityAgentConfig = SharedCommunityAgentConfig<CommunityAgentLanding>;
type CommunityFunnelConfig = SharedCommunityFunnelConfig;

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

type MessageReaction = SharedMessageReaction;

type CommunityResource = {
  id: string;
  community_id?: string | null;
  module_id: string | null;
  type: "post" | "link" | "embed" | "file";
  title: string;
  body_md: string | null;
  url: string | null;
  file_key?: string | null;
  pinned: boolean;
  created_at: string;
};

type CommunityResourceModule = {
  id: string;
  community_id?: string | null;
  name: string;
  description_md: string | null;
  banner_url: string | null;
  banner_focus_x: number | null;
  banner_focus_y: number | null;
  banner_zoom: number | null;
  sort_order: number;
};

type CommunityEvent = CloudCommunityEvent;

type CommunityMember = CloudCommunityMembershipAdminRow;

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
  message: string | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
  decided_by: string | null;
  denied_until: string | null;
};

type MyCommunityJoinRequest = {
  community_id: string;
  status: string;
  updated_at: string;
  denied_at?: string | null;
  reapply_at?: string | null;
  denied_until?: string | null;
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
type CommunityAiFeedReactionType = SharedCommunityAiFeedReactionType;

type NavSnapshot = NavSnapshotBase & {
  workspaceWantsNewChat: boolean;
  routePath: string;
};

type AccountGraphHydrationPhase = "idle" | "critical" | "secondary" | "ready";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "🔥", "🫡", "🎉"];
const COMMUNITY_CHAT_PAGE_SIZE = 50;
const COMMUNITY_CHAT_LOAD_MORE_THRESHOLD_PX = 140;
const DEFAULT_MODEL_TOGGLES: ModelToggle[] = getDefaultModelToggles("web");

const MAX_WEB_ATTACHMENTS_PER_MESSAGE = 8;
const MAX_WEB_IMAGE_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB (client-side; still compressed before sending)
const MAX_WEB_FILE_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_WEB_TEXT_ATTACHMENT_BYTES = 200 * 1024; // 200KB
const MAX_WEB_IMAGE_DATA_URL_CHARS = 600_000; // ~0.6MB base64 payload
const WEB_RAIL_WIDTH = 72;
const WEB_SESSIONS_DRAWER_WIDTH = 240;
const MIN_DOCKED_WORKSPACE_CENTER_WIDTH = 400;

type WorkspaceOperatorPanelLayout = {
  open: boolean;
  width: number;
  gutter: number;
};

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
  modelToggles: ModelToggle[],
  runtimeSurface?: ModelAttributionRuntimeSurface | string | null,
): string | null {
  return formatModelAttributionLabel({
    modelId,
    inferenceSource,
    runtimeSurface,
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
  const hasResolvedInitialStandaloneSignedOutLaunchRef = useRef(false);
  const lastIdentifiedBusinessVisitorSubjectRef = useRef<string | null>(null);
  const [accountGraphHydrationPhase, setAccountGraphHydrationPhase] =
    useState<AccountGraphHydrationPhase>("idle");
  const accountGraphHydrationRunIdRef = useRef(0);

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
      workspace.actions.resetWorkspaceSurfaceState();
      await resetWebSessionStateAfterSignOut({
        beginBrowserSignedOutState,
        setCommunities,
        setIsLoadingCommunities,
        setCommunityRoleById,
        setActiveCommunityId,
        setCommunityTab,
        setCommunityMessages,
        setCommunityMessageInput,
        setCommunityChatError,
        resetCommunityChatDataState,
        setUnreadCount,
        setIsUserAtBottom,
        isUserAtBottomRef,
        setIsSendingCommunityMessage,
        setReplyingToMessage,
        setMessageReactions,
        setReactionPickerMessageId,
        setEditingMessageId,
        setEditingMessageText,
        setEditingMessagePrefix,
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
        setCommunityMembers,
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
      workspace.actions.resetWorkspaceSurfaceState();
      await resetWebSessionStateAfterSignOut({
        beginBrowserSignedOutState,
        setCommunities,
        setIsLoadingCommunities,
        setCommunityRoleById,
        setActiveCommunityId,
        setCommunityTab,
        setCommunityMessages,
        setCommunityMessageInput,
        setCommunityChatError,
        resetCommunityChatDataState,
        setUnreadCount,
        setIsUserAtBottom,
        isUserAtBottomRef,
        setIsSendingCommunityMessage,
        setReplyingToMessage,
        setMessageReactions,
        setReactionPickerMessageId,
        setEditingMessageId,
        setEditingMessageText,
        setEditingMessagePrefix,
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
        setCommunityMembers,
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
      setPendingPurchaseClaims([]);
      setPendingPurchasesError(null);
      setPendingPurchasesSuccess(null);
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
      const criticalTasks: Array<Promise<void>> = [
        workspace.actions.hydrateWorkspaceSurfaceState(session),
      ];
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
      const focusCriticalStartedAt = Date.now();
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "account_graph_refresh",
        status: "start",
        detail: {
          phase: "session_focus_ready",
          userId,
        },
      });
      const workspaceResults = await Promise.allSettled([
        workspace.actions.resumeWorkspaceSurfaceState(session),
      ]);
      const workspaceFailureCount = workspaceResults.filter((result) => result.status === "rejected").length;
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "account_graph_refresh",
        status: workspaceFailureCount > 0 ? "failure" : "success",
        detail: {
          phase: "session_focus_ready",
          stage: "workspace_ready",
          userId,
          failureCount: workspaceFailureCount,
          durationMs: Date.now() - focusCriticalStartedAt,
        },
        error:
          workspaceFailureCount > 0
            ? formatWorkspaceInstrumentationError(
                workspaceResults
                  .filter((result): result is PromiseRejectedResult => result.status === "rejected")
                  .map((result) => result.reason)[0],
              )
            : undefined,
      });
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "account_graph_refresh_secondary",
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
          name: "account_graph_refresh_secondary",
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
    access: OperatorAccessSnapshot;
  } | null>(null);
  const operatorAccess =
    operatorAccessState?.subject === canonicalSessionUserId ? operatorAccessState.access : null;

  useEffect(() => {
    let isAlive = true;
    const operatorSubject = String(canonicalSessionUserId ?? "").trim();

    if (!session || !operatorSubject) {
      setOperatorAccessState(null);
      return;
    }

    loadOperatorAccessCanonical({ session }).then(
      (access) => {
        if (!isAlive) return;
        setOperatorAccessState({ subject: operatorSubject, access });
      },
      (error) => {
        if (!isAlive) return;
        const message = error instanceof Error ? error.message : String(error);
        if (
          message.includes("operator_access_forbidden") ||
          message.includes("operator_access_identity_mismatch")
        ) {
          setOperatorAccessState((prev) => (prev?.subject === operatorSubject ? null : prev));
        }
      },
    );

    return () => {
      isAlive = false;
    };
  }, [canonicalSessionUserId, session]);
  const hasOperatorDataPanelAccess = Boolean(session && operatorAccess);
  const profileStorageUserId = canonicalSessionUserId;
  const initialProfileDraft = useMemo(
    () => readProfileDraftForUser(profileStorageUserId),
    [profileStorageUserId],
  );

  const [publicRoute, setPublicRoute] = useState<PublicRoute>(() => initialPublicRoute);
  const [shellVariant, setShellVariant] = useState<AppShellVariant>(() => initialShellVariant);
  const [mobileOverlay, setMobileOverlay] = useState<MobileOverlay | null>(null);
  const [mobileSettingsView, setMobileSettingsView] = useState<"index" | "detail">("detail");

  const [activePage, setActivePage] = useState<AppPage>(() => initialAppRoute?.page ?? "workspace");
  const [activeView, setActiveView] = useState<AppView>(() => initialAppRoute?.view ?? "home");
  const [settingsPage, setSettingsPage] = useState<SettingsPage>(() => initialAppRoute?.settingsPage ?? "account");
  const [discoverActiveTab, setDiscoverActiveTab] = useState<DiscoverTab>(
    () => initialAppRoute?.discoverTab ?? "communities",
  );
  const [selectedDiscoverAppId, setSelectedDiscoverAppId] = useState<string | null>(
    () => initialAppRoute?.discoverAppId ?? null,
  );
  const [selectedDiscoverSkillId, setSelectedDiscoverSkillId] = useState<string | null>(
    () => initialAppRoute?.discoverSkillId ?? null,
  );
  const [selectedProductDocSlug, setSelectedProductDocSlug] = useState<string | null>(
    () => initialAppRoute?.docsSlug ?? null,
  );
  const [shouldOpenCreatePersonalSkill, setShouldOpenCreatePersonalSkill] =
    useState(false);
  const settingsGroup = settingsGroupForPage(settingsPage);
  const [userWantsSessions, setUserWantsSessions] = useState(false);
  const [workspaceViewportWidth, setWorkspaceViewportWidth] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerWidth,
  );
  const [workspaceOperatorPanelLayout, setWorkspaceOperatorPanelLayout] =
    useState<WorkspaceOperatorPanelLayout>({ open: false, width: 0, gutter: 0 });
  const [isWorkspaceOperatorDataPanelOpen, setIsWorkspaceOperatorDataPanelOpen] =
    useState(false);
  const handleWorkspaceOperatorPanelLayoutChange = useCallback((layout: WorkspaceOperatorPanelLayout) => {
    setWorkspaceOperatorPanelLayout((current) =>
      current.open === layout.open &&
      current.width === layout.width &&
      current.gutter === layout.gutter
        ? current
        : layout,
    );
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateWorkspaceViewportWidth = () => {
      setWorkspaceViewportWidth(window.innerWidth);
    };

    updateWorkspaceViewportWidth();
    window.addEventListener("resize", updateWorkspaceViewportWidth);
    return () => {
      window.removeEventListener("resize", updateWorkspaceViewportWidth);
    };
  }, []);
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
    CommunityAccess,
    MyCommunityJoinRequest
  >();
  const billingUi = useWebBillingUiController<
    AccountCommerceStatus,
    WorkspaceCreditBalance,
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
    setIsLoadingAccountCommerce,
    accountCommerceError,
    setAccountCommerceError,
    workspaceCreditBalance,
    setWorkspaceCreditBalance,
    isLoadingWorkspaceCreditBalance,
    setIsLoadingWorkspaceCreditBalance,
    workspaceCreditBalanceError,
    setWorkspaceCreditBalanceError,
    isStartingWorkspaceCreditTopupCheckout,
    setIsStartingWorkspaceCreditTopupCheckout,
    workspaceCreditTopupError,
    setWorkspaceCreditTopupError,
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

  const [, setIsPendingPurchasesBannerDismissed] = useState(false);
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
  const lastAutoRedeemPendingPurchasesUserIdRef = useRef<string | null>(null);
  const autoRedeemPendingPurchasesAttemptRef = useRef(0);
  const autoRedeemPendingPurchasesTimeoutRef = useRef<number | null>(null);

  const [modelToggles, setModelToggles] = useState<ModelToggle[]>(DEFAULT_MODEL_TOGGLES);
  const [modelProviderById, setModelProviderById] = useState<Record<string, string>>({});
  const platformModelToggles = useMemo<ModelToggle[]>(() => {
    const gpt55 = modelToggles.find((toggle) => toggle.id === DEFAULT_ACTIVE_MODEL_ID);
    return [
      {
        id: DEFAULT_ACTIVE_MODEL_ID,
        label: gpt55?.label ?? "GPT 5.5",
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

  const [communityMessages, setCommunityMessages] = useState<CommunityChatMessage[]>([]);
  const [communityMessageInput, setCommunityMessageInput] = useState("");
  const workspaceComposerApiRef = useRef<WorkspaceComposerApi | null>(null);
  const workspaceStarterPromptConsumedRef = useRef(false);
  const workspaceComposerDraftRef = useRef<WorkspaceComposerDraft>({
    text: "",
    attachments: [],
  });
  const [threadErrorById, setThreadErrorById] = useState<Record<string, string | null>>({});
  const [guestInferenceIssueById, setGuestInferenceIssueById] = useState<Record<string, GuestInferenceIssue | null>>({});
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => initialAppRoute?.threadId ?? null);
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
  const [copiedCommunityMessageId, setCopiedCommunityMessageId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isUserAtBottom, setIsUserAtBottom] = useState(true);
  const isUserAtBottomRef = useRef(true);
  const communitySeenAcknowledgeKeyBySurfaceRef = useRef<Record<string, string>>({});
  const communityMessageIdsRef = useRef<Set<string>>(new Set());
  const communityChatListRef = useRef<HTMLDivElement | null>(null);
  const loadOlderFromScrollRef = useRef<(() => void) | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const communityFileInputRef = useRef<HTMLInputElement | null>(null);
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
  const [replyingToMessage, setReplyingToMessage] = useState<Pick<CommunityChatMessage, "id" | "sender_id" | "body"> | null>(null);
  const [messageReactions, setMessageReactions] = useState<MessageReaction[]>([]);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [editingMessagePrefix, setEditingMessagePrefix] = useState<string | null>(null);
  const capturePrependAnchorRef = useRef<() => void>(() => {});
  const clearPendingPrependAnchorRef = useRef<() => void>(() => {});

  const {
    isLoadingChat,
    isLoadingMoreChat,
    communityChatHasMore,
    hasResolvedCommunityChat,
    toCommunityChatMessage,
    ensureCommunityChatThread,
    loadCommunityChat,
    loadOlderCommunityChat,
    resetCommunityChatDataState,
  } = useCommunityChatDataController<
    AuthSession,
    MessageAttachment,
    CommunityChatMessage,
    MessageReaction
  >({
    extractTextFromContentJson,
    parseMessageAttachments,
    ensureSession: ensureUsableAuthSession,
    pageSize: COMMUNITY_CHAT_PAGE_SIZE,
    setCommunityMessages,
    setMessageReactions,
    setUnreadCount,
    setIsUserAtBottom,
    isUserAtBottomRef,
    capturePrependAnchor: () => {
      capturePrependAnchorRef.current();
    },
    clearPendingPrependAnchor: () => {
      clearPendingPrependAnchorRef.current();
    },
    onLoadChatStart: () => {
      setCommunityChatError(null);
    },
    onLoadChatError: (message) => {
      setCommunityChatError(message);
    },
    onHydrateProfiles: (userIds, session) => {
      return loadUserProfiles(userIds, session);
    },
  });

  const {
    handleChatScroll,
    capturePrependAnchor,
    clearPendingPrependAnchor,
  } = useCommunityChatViewport({
    isEnabled: activePage === "community" && communityTab === "chat",
    communityMessages,
    communityChatListRef,
    isUserAtBottom,
    isUserAtBottomRef,
    setIsUserAtBottom,
    setUnreadCount,
    loadMoreThresholdPx: COMMUNITY_CHAT_LOAD_MORE_THRESHOLD_PX,
    canLoadOlder: Boolean(
      session
      && activeCommunityId
      && activePage === "community"
      && communityTab === "chat"
      && communityChatHasMore
      && !isLoadingChat
      && !isLoadingMoreChat,
    ),
    onLoadOlder: () => {
      loadOlderFromScrollRef.current?.();
    },
  });

  capturePrependAnchorRef.current = capturePrependAnchor;
  clearPendingPrependAnchorRef.current = clearPendingPrependAnchor;
  loadOlderFromScrollRef.current = () => {
    if (!session || !activeCommunityId) return;
    void loadOlderCommunityChat(activeCommunityId, session);
  };

  useCommunityChatRealtime({
    isEnabled: activePage === "community" && hasResolvedCommunityChat,
    session: session,
    ensureSession: ensureUsableAuthSession,
    activeCommunityId,
    ensureCommunityChatThread,
    toCommunityChatMessage,
    communityMessageIdsRef,
    isUserAtBottomRef,
    setUnreadCount,
    setCommunityMessages,
    setMessageReactions,
    onLoadProfiles: (userIds, session) => {
      return loadUserProfiles(userIds, session);
    },
  });

  useEffect(() => {
    if (activePage !== "community" || !activeCommunityId || !hasResolvedCommunityChat) return;
    if (communityTab === "chat") return;
    if (!isUserAtBottomRef.current) return;
    setIsUserAtBottom(false);
    isUserAtBottomRef.current = false;
  }, [activeCommunityId, activePage, communityTab, hasResolvedCommunityChat]);

  const {
    handleToggleReaction,
    handleStartReply,
    handleStartEdit,
    handleCancelEdit,
    handleSaveEdit,
    handleDeleteMessage,
    handleSendCommunityMessage,
  } = useCommunityChatMutationController({
    activeCommunityId,
    session: session,
    sessionUserId: canonicalSessionUserId,
    ensureSession: ensureUsableAuthSession,
    missingPayloadMessage: "Message sent, but no payload returned.",
    ensureCommunityChatThread,
    toCommunityChatMessage,
    loadCommunityChat,
    parseReplyPrefix,
    buildReplyPrefix,
    beforeSendValidate: async () => {
      if (!isProfileSetupCompleteForPublicActions) {
        openProfileSetup();
        return "Finish your profile before posting in communities.";
      }
      return null;
    },
    onProfileSetupRequired: openProfileSetup,
    prepareAttachmentsForSend: prepareCommunityAttachmentsForSend,
    serializeAttachmentsForWrite: serializeCommunityAttachmentsForWrite,
    onOptimisticSendScrollIntent: () => {
      setIsUserAtBottom(true);
      isUserAtBottomRef.current = true;
    },
    onCommunityMessageSent: ({ communityId, hasAttachments, hasReply }) => {
      captureProductAnalyticsEvent("community message sent", {
        community_id: communityId,
        has_attachments: hasAttachments,
        has_reply: hasReply,
        surface: "community_chat",
      });
    },
    chatInputRef,
    communityAttachmentsRef,
    communityMessageInput,
    communityMessages,
    messageReactions,
    replyingToMessage,
    editingMessageId,
    editingMessageText,
    editingMessagePrefix,
    setCommunityMessages,
    setMessageReactions,
    setCommunityMessageInput,
    setCommunityAttachments,
    setReplyingToMessage,
    setReactionPickerMessageId,
    setEditingMessageId,
    setEditingMessageText,
    setEditingMessagePrefix,
    setIsSendingCommunityMessage,
    setCommunityChatError,
  });

  const handleCopyCommunityMessage = useCallback(async (messageId: string, text: string): Promise<void> => {
    await copyTextToClipboard(text);
    setCopiedCommunityMessageId(messageId);
    window.setTimeout(() => {
      setCopiedCommunityMessageId((prev) => (prev === messageId ? null : prev));
    }, 2000);
  }, []);

  const [communityResources, setCommunityResources] = useState<CommunityResource[]>([]);
  const [communityResourceModules, setCommunityResourceModules] = useState<CommunityResourceModule[]>([]);
  const [isLoadingResources, setIsLoadingResources] = useState(false);
  const [isLoadingResourceModules, setIsLoadingResourceModules] = useState(false);
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
    communityMembers,
    setCommunityMembers,
    isLoadingCommunityMembers,
    setIsLoadingCommunityMembers,
    hasResolvedCommunityMembers,
    setHasResolvedCommunityMembers,
    communityMembersRoleFilter,
    setCommunityMembersRoleFilter,
    communityMembersPlanFilter,
    setCommunityMembersPlanFilter,
    communityJoinRequests,
    setCommunityJoinRequests,
    isLoadingCommunityJoinRequests,
    setIsLoadingCommunityJoinRequests,
    communityJoinRequestsError,
    setCommunityJoinRequestsError,
    decidingCommunityJoinRequestId,
    setDecidingCommunityJoinRequestId,
    isJoinRequestsModalOpen,
    setIsJoinRequestsModalOpen,
    isSavingFreeAccessMode,
    setIsSavingFreeAccessMode,
    filteredCommunityMembers,
  } = useWebCommunityPeopleController<CommunityMember, CommunityJoinRequest>({
    activeCommunityId,
    activeCommunityOwnerId: activeCommunity?.owner_id ?? null,
  });
  const {
    activeCommunityAccess,
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
    funnelPreviewAdminCount,
    funnelPreviewOnlineCount,
    funnelPreviewOnlineFaces,
    reloadActiveCommunityAccess,
  } = useWebActiveCommunityShellController<AuthSession, CommunityRecord, CommunityMember>({
    activePage,
    activeCommunityId,
    activeCommunity,
    communityTab,
    communityMembers,
    session: session,
    ensureSession: ensureUsableAuthSession,
  });
  const communityTypingUsers = useCommunityTypingPresence({
    isEnabled: activePage === "community" && communityTab === "chat" && hasResolvedCommunityChat,
    session,
    ensureSession: ensureUsableAuthSession,
    activeCommunityId,
    canPostMessages: canPostMessagesActiveCommunity,
    inputValue: communityMessageInput,
  });
  const communityAttentionCommunityIds = useMemo(
    () => communities.map((community) => community.id),
    [communities],
  );
  const { attentionByCommunityId, markCommunitySurfaceSeen } = useCommunityAttentionController<AuthSession>({
    session,
    ensureSession: ensureUsableAuthSession,
    communityIds: communityAttentionCommunityIds,
  });

  const {
    loadCommunityResources,
    openNewModuleModal,
    handleEditModule,
    handleDeleteModule,
    handleReorderModules,
    openNewResourceModal,
    handleEditResource,
    handleDeleteResource,
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
    setIsLoadingResourceModules,
  });
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
    isConnectingCommunityApp,
    communityAppMutationError,
    updatingCommunityAppMountId,
    refreshingCommunityAppMountId,
    removingCommunityAppMountId,
    communityAppMountsLoadedCommunityIdRef,
    clearCommunityAppMounts,
    loadCommunityAppMounts,
    connectCommunityApp,
    updateCommunityAppMount,
    refreshCommunityApp,
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
  const initialWorkspaceWantsNewChat = !(
    initialAppRoute &&
    initialAppRoute.page === "workspace" &&
    initialAppRoute.view === "home" &&
    initialAppRoute.threadId
  );
  const [workspaceWantsNewChat, setWorkspaceWantsNewChat] = useState<boolean>(initialWorkspaceWantsNewChat);
  const workspaceWantsNewChatRef = useRef<boolean>(initialWorkspaceWantsNewChat);
  const setWorkspaceWantsNewChatMode = (next: SetStateAction<boolean>) => {
    setWorkspaceWantsNewChat((prev) => {
      const resolved = typeof next === "function" ? (next as (prevState: boolean) => boolean)(prev) : next;
      workspaceWantsNewChatRef.current = resolved;
      return resolved;
    });
  };
  const workspaceProject = useWebWorkspaceProjectStateController<AuthSession, ThreadRecord>({
    ensureSession: ensureUsableAuthSession,
    activeThreadId,
    threads,
    setThreads,
    setActiveThreadId,
    setWorkspaceWantsNewChatMode,
  });

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

  async function routeTryPolynetFree(activeSession: AuthSession | null = sessionRef.current ?? session): Promise<void> {
    if (!activeSession) {
      requireSignIn({ reason: "try_polynet_free", payload: {} });
      return;
    }

    try {
      const row = await loadProfileForOnboarding(activeSession);
      setIsOnboardingModalOpen(!row?.account_setup?.completed);
      navigateTo("/workspace");
    } catch {
      setIsOnboardingModalOpen(true);
      navigateTo("/workspace");
    }
  }

  async function completeOnboarding(
    destination: "build_community" | "discover_community",
  ): Promise<void> {
    const activeSession = await ensureUsableAuthSession();
    if (!activeSession) {
      requireSignIn({ reason: "try_polynet_free", payload: {} });
      return;
    }

    const userId = resolveAuthSubject(activeSession);
    if (!userId) {
      setOnboardingError("We could not verify your account. Sign in again to continue.");
      return;
    }

    const displayName = profileUi.profileName.trim() || null;
    const handle = profileUi.profileHandle.trim() || null;
    const bio = profileUi.profileBio.trim() || null;
    const avatarUrl = profileUi.profileAvatarUrl?.trim() || null;
    if (!displayName || !handle || !avatarUrl) {
      setOnboardingError("Add your display name, handle, and profile photo to continue.");
      return;
    }

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
        onboardingDirection: destination,
        markOnboardingDismissed: true,
      });
      if (saved) {
        setCloudProfile(saved);
        if (saved.account_setup) setAccountSetupStatus(saved.account_setup);
        setHasLoadedOnboardingProfile(true);
        setIsOnboardingModalOpen(false);
        profileUi.setProfileName(saved.display_name ?? "");
        profileUi.setProfileHandle(saved.handle ?? "");
        profileUi.setProfileBio(saved.bio ?? "");
        profileUi.setProfileAvatarUrl(saved.avatar_url ?? null);
        profileUi.setProfileAvatarStorageId(saved.avatar_storage_id ?? null);
        profileUi.setProfileAvatarFocusX(saved.avatar_focus_x ?? 0.5);
        profileUi.setProfileAvatarFocusY(saved.avatar_focus_y ?? 0.5);
        profileUi.setProfileAvatarZoom(saved.avatar_zoom ?? 1);
      }

      if (destination === "discover_community") {
        navigateTo("/discover");
        return;
      }

      navigateTo("/workspace");
    } catch (error) {
      const message = formatProfileMutationError(error, "Failed to save onboarding.");
      setOnboardingError(message);
    } finally {
      setIsSavingOnboarding(false);
    }
  }

  async function saveOnboardingProfile(): Promise<boolean> {
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
    if (!displayName || !handle || !avatarUrl) {
      setOnboardingError("Add your display name, handle, and profile photo to continue.");
      return false;
    }

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
        markOnboardingDismissed: false,
      });
      if (saved) {
        setCloudProfile(saved);
        if (saved.account_setup) setAccountSetupStatus(saved.account_setup);
        setHasLoadedOnboardingProfile(true);
        profileUi.setProfileName(saved.display_name ?? "");
        profileUi.setProfileHandle(saved.handle ?? "");
        profileUi.setProfileBio(saved.bio ?? "");
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

  async function saveOnboardingAgent(next: { agentName: string; agentSoul: string }): Promise<boolean> {
    const activeSession = await ensureUsableAuthSession();
    if (!activeSession) {
      requireSignIn({ reason: "try_polynet_free", payload: {} });
      return false;
    }
    const agentName = next.agentName.trim();
    if (!agentName) {
      setOnboardingError("Give your agent a name to continue.");
      return false;
    }
    setOnboardingError(null);
    await saveUserMemorySettingsAndRefreshSetup({
      ...userMemorySettings,
      agent_name: agentName,
      agent_soul: next.agentSoul,
    });
    return true;
  }

  async function deleteOwnAccountFromSettings(): Promise<void> {
    const activeSession = await ensureUsableAuthSession();
    if (!activeSession) {
      requireSignIn();
      return;
    }
    await deleteCloudOwnAccount<AuthSession>({ session: activeSession });
    await handleSignOut();
    navigateTo("/");
  }

  const applyAppRouteState = useCallback((nextAppRoute: AppRouteState) => {
    const normalizedCommunitySlug = String(nextAppRoute.communitySlug ?? "").trim() || null;
    const nextThreadId =
      nextAppRoute.page === "workspace" && nextAppRoute.view === "home" ? nextAppRoute.threadId : null;
    setActivePage(nextAppRoute.page);
    setActiveView(nextAppRoute.page === "workspace" ? nextAppRoute.view : "home");
    setSettingsPage(nextAppRoute.settingsPage);
    if (nextAppRoute.page === "discover") {
      setDiscoverActiveTab(nextAppRoute.discoverTab ?? "communities");
      setSelectedDiscoverAppId(nextAppRoute.discoverAppId ?? null);
      setSelectedDiscoverSkillId(nextAppRoute.discoverSkillId ?? null);
    }
    if (nextAppRoute.page === "docs") {
      setSelectedProductDocSlug(nextAppRoute.docsSlug ?? null);
    }
    if (nextAppRoute.page === "community") {
      applyCommunityShellState({
        communitySlug: normalizedCommunitySlug,
        communityTab: nextAppRoute.communityTab,
      });
    }
    if (nextAppRoute.page === "workspace" && nextAppRoute.view === "home") {
      setActiveThreadId(nextThreadId);
      setWorkspaceWantsNewChatMode(nextThreadId === null);
    }
    if (nextAppRoute.page !== "workspace") {
      workspaceProject.actions.setActiveProjectId(null);
    }
  }, [applyCommunityShellState, workspaceProject.actions]);

  const applyLocationToState = useCallback(() => {
    setShellVariant(readShellVariantFromPathname(window.location.pathname || "/"));
    const nextPublicRoute = readPublicRouteFromLocation();
    setPublicRoute(nextPublicRoute);
    if (nextPublicRoute.kind !== "app") return nextPublicRoute;
    applyAppRouteState(readAppRouteFromLocation());
    return nextPublicRoute;
  }, [applyAppRouteState]);

  const applyStandaloneWorkspaceLaunch = useCallback((nextPath: string) => {
    window.history.replaceState(window.history.state ?? {}, document.title, nextPath);
    applyCommunityShellState({
      communityId: null,
      communitySlug: null,
      communityTab: "chat",
    });
    workspaceProject.actions.setActiveProjectId(null);
    applyLocationToState();
  }, [applyCommunityShellState, applyLocationToState, workspaceProject.actions]);

  useEffect(() => {
    if (!isAuthBootstrapComplete) return;
    if (!session) return;
    if (publicRoute.kind !== "app") return;
    if (activePage !== "landing") return;
    if (!isRootAppRoutePath(window.location.pathname || "/")) return;
    navigateTo(buildWorkspaceDraftPath(), { replace: true });
  }, [activePage, isAuthBootstrapComplete, publicRoute.kind, session]);

  useEffect(() => {
    if (!isStandaloneWebApp()) return;
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get(STANDALONE_APP_LAUNCH_SEARCH_PARAM) !== STANDALONE_APP_LAUNCH_SEARCH_VALUE) {
      return;
    }

    currentUrl.searchParams.delete(STANDALONE_APP_LAUNCH_SEARCH_PARAM);
    const shellVariantForLaunch = readShellVariantFromPathname(currentUrl.pathname || "/");
    const canonicalAppPath = applyShellVariantToAppPath(buildWorkspaceDraftPath(), shellVariantForLaunch);
    const canonicalUrl = new URL(canonicalAppPath, currentUrl.origin);
    const nextPath = `${canonicalUrl.pathname}${canonicalUrl.search}${canonicalUrl.hash}` || buildWorkspaceDraftPath();
    applyStandaloneWorkspaceLaunch(nextPath);
  }, [applyStandaloneWorkspaceLaunch]);

  useEffect(() => {
    if (!isAuthBootstrapComplete) return;
    if (hasResolvedInitialStandaloneSignedOutLaunchRef.current) return;
    hasResolvedInitialStandaloneSignedOutLaunchRef.current = true;
    if (session) return;
    if (!isStandaloneWebApp()) return;
    if (initialPublicRoute.kind !== "community_funnel" && initialPublicRoute.kind !== "community_funnel_preview") return;
    if (publicRoute.kind !== initialPublicRoute.kind || publicRoute.slug !== initialPublicRoute.slug) return;
    if (hasRecentAuthFlowPending()) return;
    if (readAuthResumeState()?.intent) return;

    const shellVariantForLaunch = readShellVariantFromPathname(window.location.pathname || "/");
    const canonicalAppPath = applyShellVariantToAppPath(buildWorkspaceDraftPath(), shellVariantForLaunch);
    const canonicalUrl = new URL(canonicalAppPath, window.location.origin);
    const nextPath = `${canonicalUrl.pathname}${canonicalUrl.search}${canonicalUrl.hash}` || buildWorkspaceDraftPath();
    applyStandaloneWorkspaceLaunch(nextPath);
  }, [
    applyStandaloneWorkspaceLaunch,
    session,
    initialPublicRoute,
    isAuthBootstrapComplete,
    publicRoute,
  ]);

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
      } else {
        setIsOnboardingModalOpen(true);
      }
      navigateTo("/workspace");
    })();
  }, [activePage, cloudProfile, session]);

  useEffect(() => {
    if (activePage !== "workspace") return;
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
    session,
  ]);

  const isInitialStandaloneFunnelRoute =
    initialPublicRoute.kind === "community_funnel" || initialPublicRoute.kind === "community_funnel_preview";
  const matchesInitialStandaloneFunnelRoute =
    isInitialStandaloneFunnelRoute &&
    publicRoute.kind === initialPublicRoute.kind &&
    publicRoute.slug === initialPublicRoute.slug;
  const shouldDeferStandaloneSignedOutFunnelBoot =
    !hasResolvedInitialStandaloneSignedOutLaunchRef.current &&
    !session &&
    isStandaloneWebApp() &&
    matchesInitialStandaloneFunnelRoute &&
    !hasRecentAuthFlowPending() &&
    !readAuthResumeState()?.intent;
  const shellPublicRoute: PublicRoute = shouldDeferStandaloneSignedOutFunnelBoot
    ? { kind: "app" }
    : publicRoute;
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
        discoverTab: discoverActiveTab,
        discoverAppId: selectedDiscoverAppId,
        discoverSkillId: selectedDiscoverSkillId,
        docsSlug: activePage === "docs" ? selectedProductDocSlug : null,
        threadId: activePage === "workspace" && activeView === "home" ? activeThreadId : null,
      }) ?? "",
      shellVariant,
    ) || null;
  const takeNavSnapshot = (): NavSnapshot => ({
    page: activePage,
    view: activeView,
    settingsPage,
    communitySlug: selectedActiveCommunitySlug,
    communityTab,
    threadId: activeThreadId,
    workspaceWantsNewChat,
    routePath: buildCurrentAppRoutePath() ?? readCurrentRoutePath(),
  });
  const pushNavSnapshot = () => {
    const snapshot = takeNavSnapshot();
    pushUniqueNavSnapshot(navStackRef.current, snapshot, {
      includeWorkspaceWantsNewChat: true,
    });
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
    setUnreadCount,
  });
  const workspaceCore = useWebWorkspaceCoreController<AuthSession, ThreadRecord>({
    project: workspaceProject,
    ensureSession: ensureUsableAuthSession,
    activePage,
    activeView,
    activeThreadId,
    navigateTo,
    setActivePage,
    setActiveView,
    setActiveThreadId,
    setWorkspaceWantsNewChatMode,
    syncCommunitySelection,
    threads,
    setThreads,
    deriveThreadTitleFromUserText,
    isMissingThreadTitleValue,
    toEpochSeconds,
    activeCommunityId,
    activeModelId: DEFAULT_ACTIVE_MODEL_ID,
    modelToggles: platformModelToggles,
    defaultActiveModelId: DEFAULT_ACTIVE_MODEL_ID,
  });
  const {
    syncWorkspaceSelection,
    applyWorkspaceRouteState,
    applyGuestWorkspaceState,
    openWorkspaceDraft,
    enterWorkspaceThread,
    handleNewWorkspaceThread,
  } = workspaceCore.route;
  useEffect(() => {
    if (activePage !== "workspace" || activeView !== "home" || workspaceWantsNewChat || !activeThreadId) return;
    const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null;
    if (!activeThread) return;
    const nextCommunityId = String(activeThread.community_id ?? "").trim() || null;
    const nextCommunitySlug = nextCommunityId ? resolveKnownCommunitySlugById(nextCommunityId) : null;
    if (nextCommunitySlug === selectedActiveCommunitySlug) {
      return;
    }
    syncCommunitySelection({
      communitySlug: nextCommunitySlug,
      communityId: nextCommunityId,
    });
  }, [
    activePage,
    activeThreadId,
    activeView,
    resolveKnownCommunitySlugById,
    selectedActiveCommunitySlug,
    syncCommunitySelection,
    threads,
    workspaceWantsNewChat,
  ]);
  const restoreNavSnapshot = (snapshot: NavSnapshot) => {
    const nextRoutePath = snapshot.routePath?.trim() || "/";
    navigateTo(nextRoutePath, { replace: true });
  };
  const goBack = (): boolean => {
    const snapshot = popNavSnapshot(navStackRef.current) as NavSnapshot | null;
    if (!snapshot) return false;
    restoreNavSnapshot(snapshot);
    return true;
  };

  const backTargetSnapshot = navStackRef.current.length > 0 ? navStackRef.current[navStackRef.current.length - 1] : null;
  const backTargetLabel = backTargetSnapshot ? formatBackTargetLabelShared(backTargetSnapshot) : null;

  const threadsHydratedRef = useRef(false);
  const lastCloudStatusRefreshAtRef = useRef(0);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [loadingThreadMessagesThreadId, setLoadingThreadMessagesThreadId] = useState<string | null>(() => {
    const initialThreadId = initialAppRoute?.threadId ?? null;
    return initialThreadId && initialThreadId !== GUEST_THREAD_ID ? initialThreadId : null;
  });
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
  const threadAgentAttentionSeenInFlightRef = useRef<Set<string>>(new Set());
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [memoryToast, setMemoryToast] = useState<string | null>(null);
  const memoryToastTimeoutRef = useRef<number | null>(null);
  const [inferenceToast] = useState<string | null>(null);
  const [appToast, setAppToast] = useState<string | null>(null);
  const appToastTimeoutRef = useRef<number | null>(null);
  const appOAuthFinalizeInFlightRef = useRef<string | null>(null);
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
  } | null>(null);
  const [isInferenceIssueModalRunning] = useState(false);
  const [userMemorySettings, setUserMemorySettings] = useState<UserMemorySettings>({
    memory_mode: "auto",
    remember_intent_enabled: true,
    agent_name: "",
    agent_soul: "",
  });
  const [communityAiAgentPreferredTab, setCommunityAiAgentPreferredTab] = useState<
    "workspace" | "apps" | "skills"
  >("workspace");
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
        threadId: null,
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
    loadCommunityMembers,
    loadSelfProfile,
    saveProfileToCloud,
    loadCommunityAnalytics,
    resetCommunityAnalytics,
    handleSetCommunityMemberRole,
    handleRemoveCommunityMember,
    handleBanCommunityMember,
  } = useCommunityAdminController<
    AuthSession,
    CommunityMember,
    UserProfile,
    UserProfileDetail
  >({
    activeCommunityId,
    ...authenticatedSessionArg,
    parseContentRangeTotal,
    dateKeyLocal,
    ensureCommunityChatThread,
    confirmAction: (message) => confirm(message),
    reloadCommunities: loadCommunities,
    reloadCommunityAccess: reloadActiveCommunityAccess,
    loadUserProfiles: (userIds, session) => loadUserProfiles(userIds, session),
    getProfileSaveSession: () => sessionRef.current ?? session,
    profileName: profileUi.profileName,
    profileHandle: profileUi.profileHandle,
    profileBio: profileUi.profileBio,
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
    setCommunityMembers,
    setIsLoadingCommunityMembers,
    setHasResolvedCommunityMembers,
    setProfilesByUserId,
    setCloudProfile,
    setProfileName: profileUi.setProfileName,
    setProfileHandle: profileUi.setProfileHandle,
    setProfileBio: profileUi.setProfileBio,
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
  const handleSaveCommunityAgentConfigAndRefreshLanding = useCallback(async (): Promise<boolean> => {
    const communityIdAtSave = activeCommunityId;
    const normalizedLanding = normalizeCommunityAgentDraftForSave(communityAgentConfigLanding);
    const saved = await handleSaveCommunityAgentConfig();
    if (!saved || !communityIdAtSave || !normalizedLanding) return saved;
    if (activeCommunityIdRef.current !== communityIdAtSave) return saved;
    communityAgentLandingFetchSeqRef.current += 1;
    activeCommunityAgentLandingCommunityIdRef.current = communityIdAtSave;
    setActiveCommunityAgentLanding(normalizedLanding);
    return saved;
  }, [activeCommunityId, communityAgentConfigLanding, handleSaveCommunityAgentConfig]);

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

  const handleConnectCommunityApp = useCallback(
    async (input: ConnectCommunityAppInput) => {
      const ok = await connectCommunityApp(input);
      if (ok) {
        if (session) {
          userPlatformAppMountsLoadedUserIdRef.current = null;
          void loadUserPlatformAppMounts(session);
        }
        void reloadEffectiveMcpApps();
      }
      return ok;
    },
    [
      connectCommunityApp,
      loadUserPlatformAppMounts,
      reloadEffectiveMcpApps,
      session,
      userPlatformAppMountsLoadedUserIdRef,
    ],
  );

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
    async (catalogAppId: string) => {
      const result = await beginUserPlatformAppOAuth({
        catalogAppId,
        returnToPath: `${window.location.pathname}${window.location.search}`,
      });
      if (result.ok && result.authorize_url) {
        window.location.assign(result.authorize_url);
      }
      return result;
    },
    [beginUserPlatformAppOAuth],
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

  const handleCreateCommunitySkill = useCallback(
    async (input: CreateSkillPackageInput) => {
      return await createPersonalSkillAndAttach(input);
    },
    [createPersonalSkillAndAttach],
  );

  const handleCreateUserPlatformSkill = useCallback(
    async (input: CreateSkillPackageInput) => {
      return await createUserPlatformSkill(input);
    },
    [createUserPlatformSkill],
  );

  const handleUpdateUserPlatformSkill = useCallback(
    async (
      userPlatformSkillInstallId: string,
      patch: {
        enabled?: boolean;
      },
    ) => {
      return await updateUserPlatformSkill(userPlatformSkillInstallId, patch);
    },
    [updateUserPlatformSkill],
  );

  const handleSaveUserPlatformSkill = useCallback(
    async (
      userPlatformSkillInstallId: string,
      input: CreateSkillPackageInput,
    ) => {
      return await saveUserPlatformSkill(userPlatformSkillInstallId, input);
    },
    [saveUserPlatformSkill],
  );

  const handleDeleteUserPlatformSkill = useCallback(
    async (userPlatformSkillInstallId: string) => {
      return await deleteUserPlatformSkill(userPlatformSkillInstallId);
    },
    [deleteUserPlatformSkill],
  );

  const handleAttachSkillPackageToCommunity = useCallback(
    async (skillPackageId: string) => {
      return await attachSkillPackageToCommunity(skillPackageId);
    },
    [attachSkillPackageToCommunity],
  );

  const handleUpdateCommunitySkillAttachment = useCallback(
    async (
      communitySkillAttachmentId: string,
      patch: {
        enabled?: boolean;
      },
    ) => {
      return await updateCommunitySkillAttachment(
        communitySkillAttachmentId,
        patch,
      );
    },
    [updateCommunitySkillAttachment],
  );

  const handleDetachCommunitySkill = useCallback(
    async (communitySkillAttachmentId: string) => {
      return await detachCommunitySkill(communitySkillAttachmentId);
    },
    [detachCommunitySkill],
  );

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
    ...authenticatedSessionArg,
    confirmAction: (message) => confirm(message),
    loadCommunities,
    onLeaveCommunityLocalState: (leavingId) => {
      applyCommunityShellState({
        communityId: null,
        communitySlug: null,
        communityTab: "chat",
      });
      setActivePage("workspace");
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
    handleSetCommunityFreeAccessMode,
  } = useCommunityMembersReviewController<
    AuthSession,
    CommunityJoinRequest,
    CommunityRecord
  >({
    activeCommunityId,
    ...authenticatedSessionArg,
    isSavingFreeAccessMode,
    loadUserProfiles: (userIds, session) => loadUserProfiles(userIds, session),
    loadCommunityMembers,
    onJoinRequestApproved: ({ communityId, requestId }) => {
      captureProductAnalyticsEvent("community join request approved", {
        community_id: communityId,
        request_id: requestId,
        surface: "community_members",
      });
    },
    setCommunities,
    setCommunityJoinRequests,
    setIsLoadingCommunityJoinRequests,
    setCommunityJoinRequestsError,
    setDecidingCommunityJoinRequestId,
    setIsSavingFreeAccessMode,
  });

  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [discoverCommunities, setDiscoverCommunities] = useState<DiscoverCommunity[]>([]);
  const [discoverApps, setDiscoverApps] = useState<DiscoverAppCatalogEntry[]>(DISCOVER_APP_CATALOG);
  const [discoverSkills, setDiscoverSkills] = useState<DiscoverSkillCatalogEntry[]>(DISCOVER_SKILL_CATALOG);
  const [isLoadingDiscover, setIsLoadingDiscover] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [lastDiscoverLoadAttemptedAt, setLastDiscoverLoadAttemptedAt] = useState(0);

  const { loadThreads, loadThreadMessages, loadModelRegistry } = useWebThreadDataController<
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
  const saveUserMemorySettingsAndRefreshSetup = useCallback(async (next: UserMemorySettings): Promise<void> => {
    await saveUserMemorySettings(next);
    await refreshAccountSetupStatus();
  }, [refreshAccountSetupStatus, saveUserMemorySettings]);

  const { createThread, updateThreadModel, maybeSetThreadTitleFromText, setThreadCommunityLens } =
    workspaceCore.threadMutation;

  const { loadDiscoverCommunities } = useWebDiscoverController({
    toCanonicalCommunityVisibility,
    setIsLoadingDiscover,
    setDiscoverError,
    setDiscoverCommunities,
    setDiscoverApps,
    setDiscoverSkills,
    setLastDiscoverLoadAttemptedAt,
  });

  const {
    handleCopyMessage,
    showMemoryToastMessage,
    showAppToastMessage,
    scrollToCommunityMessage,
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

  const refreshCloudProjectStatuses = useCallback(() => {
    if (!session) return;
    if (activePage !== "workspace") return;
    const now = Date.now();
    if (now - lastCloudStatusRefreshAtRef.current < 1000) return;
    lastCloudStatusRefreshAtRef.current = now;
    void workspaceCore.project.actions.loadProjects(session);
  }, [activePage, session, workspaceCore.project.actions]);

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
        const balance = await loadWorkspaceCreditBalanceCanonical({
          session: usableSession,
        });
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
    if (!session) return;
    if (activeView !== "settings" || settingsGroup !== "agent") return;
    void loadWorkspaceCreditBalance(session);
  }, [activeView, session, loadWorkspaceCreditBalance, settingsGroup]);

  useEffect(() => {
    if (!session || activePage !== "workspace") return;
    let cancelled = false;
    const refresh = async () => {
      if (cancelled) return;
      refreshCloudProjectStatuses();
    };
    void refresh();
    const intervalId = window.setInterval(() => {
      void refresh();
    }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activePage, refreshCloudProjectStatuses, session]);

  useEffect(() => {
    activeCommunityIdRef.current = activeCommunityId;
  }, [activeCommunityId]);

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

  const communityPolynetController = useWebCommunityPolynetController<AuthSession>({
    activePage,
    communityTab,
    activeCommunityId,
    session: session,
    ensureSession: ensureUsableAuthSession,
    requireSignIn: () => requireSignIn(),
    canManagePolynet: canViewActiveCommunityPolynet,
  });

  useWebPathRouteLifecycle({
    publicRouteKind: publicRoute.kind,
    activePage,
    activeView,
    settingsPage,
    activeCommunitySlug: selectedActiveCommunitySlug,
    communityTab,
    discoverTab: discoverActiveTab,
    discoverAppId: selectedDiscoverAppId,
    discoverSkillId: selectedDiscoverSkillId,
    docsSlug: activePage === "docs" ? selectedProductDocSlug : null,
    activeThreadId,
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
    if (activePage !== "community") return [] as string[];
    const ids = new Set<string>();
    for (const member of communityMembers) {
      const userId = String(member.user_id ?? "").trim();
      if (userId) ids.add(userId);
    }
    for (const message of communityMessages) {
      const senderId = String(message.sender_id ?? "").trim();
      if (senderId) ids.add(senderId);
    }
    if (canonicalSessionUserId) ids.add(canonicalSessionUserId);
    return Array.from(ids);
  }, [activePage, canonicalSessionUserId, communityMembers, communityMessages]);

  const savedProfilesByUserId = useMemo(() => {
    if (!canonicalSessionUserId || !cloudProfile) return profilesByUserId;
    const existingDisplayProfile = profilesByUserId[canonicalSessionUserId] ?? null;
    const cloudHasProfileAvatar = Boolean(cloudProfile.avatar_storage_id || cloudProfile.avatar_url);
    return {
      ...profilesByUserId,
      [canonicalSessionUserId]: {
        user_id: canonicalSessionUserId,
        display_name: cloudProfile.display_name ?? existingDisplayProfile?.display_name ?? null,
        handle: cloudProfile.handle ?? null,
        normalized_handle: cloudProfile.normalized_handle ?? null,
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
      },
    } satisfies Record<string, UserProfile>;
  }, [canonicalSessionUserId, cloudProfile, profilesByUserId]);

  useEffect(() => {
    if (!session || activePage !== "community" || visibleCommunityProfileIds.length === 0) return;
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
  }, [activePage, session, loadSelfProfile, loadUserProfiles, visibleCommunityProfileIds]);

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
    if (!session || activePage !== "workspace") return;
    const refreshThreads = () => {
      void loadThreads(session).catch(() => null);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshThreads();
      }
    };
    window.addEventListener("focus", refreshThreads);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", refreshThreads);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activePage, loadThreads, session]);

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
    setCommunityMessages([]);
    setMessageReactions([]);
    setCommunityResources([]);
    setCommunityResourceModules([]);
    setIsLoadingCommunityEvents(false);
    setCommunityEventsError(null);
    setReplyingToMessage(null);
    setEditingMessageId(null);
    setEditingMessageText("");
    setEditingMessagePrefix(null);
    setReactionPickerMessageId(null);
    setUnreadCount(0);
    setIsUserAtBottom(true);
    isUserAtBottomRef.current = true;
    resetCommunityChatDataState();
    clearPendingPrependAnchor();
    setOpenResourceEmbedId(null);
    if (chatInputRef.current) {
      chatInputRef.current.style.height = "auto";
    }
  }, [activeCommunityId, clearPendingPrependAnchor, resetCommunityChatDataState]);

  useWebDiscoverPreloadLifecycle({
    activePage,
    isLoadingDiscover,
    lastDiscoverLoadAttemptedAt,
    loadDiscoverCommunities,
  });
  useWebCommunityChatPreloadLifecycle<AuthSession>({
    session: session,
    activePage,
    activeCommunityId,
    hasResolvedCommunityChat,
    loadCommunityChat,
  });

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

  const latestActiveCommunityChatSeq = useMemo(() => {
    let latestSeq: number | null = null;
    for (const message of communityMessages) {
      const seq = Number(message.seq);
      if (!Number.isFinite(seq) || seq <= 0 || seq >= Number.MAX_SAFE_INTEGER) continue;
      if (String(message.id ?? "").startsWith("pending-")) continue;
      latestSeq = latestSeq === null ? Math.floor(seq) : Math.max(latestSeq, Math.floor(seq));
    }
    return latestSeq;
  }, [communityMessages]);

  const latestActiveCommunityAiFeedCreatedAt = useMemo(() => {
    const timestamps = activeCommunityFeedState.live
      .map((post) => Date.parse(post.created_at))
      .filter((value) => Number.isFinite(value));
    if (timestamps.length === 0) return null;
    return Math.max(...timestamps);
  }, [activeCommunityFeedState.live]);

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
      || !hasResolvedCommunityChat
      || !isUserAtBottom
      || latestActiveCommunityChatSeq === null
    ) {
      return;
    }
    const requestKey = `${activeCommunityId}:chat`;
    const markerKey = String(latestActiveCommunityChatSeq);
    if (communitySeenAcknowledgeKeyBySurfaceRef.current[requestKey] === markerKey) return;
    communitySeenAcknowledgeKeyBySurfaceRef.current[requestKey] = markerKey;
    void markCommunitySurfaceSeen(activeCommunityId, "chat").catch(() => {
      if (communitySeenAcknowledgeKeyBySurfaceRef.current[requestKey] === markerKey) {
        delete communitySeenAcknowledgeKeyBySurfaceRef.current[requestKey];
      }
    });
  }, [
    activeCommunityId,
    activePage,
    communityTab,
    hasResolvedCommunityChat,
    isUserAtBottom,
    latestActiveCommunityChatSeq,
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
    const canManageCommunityApps =
      activePage === "community" && communityTab === "settings"
        ? canViewActiveCommunitySettings
        : canManageMembersActiveCommunity;
    if (!session || !activeCommunityId || !canManageCommunityApps) {
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
    canManageCommunitySettings,
    canManageMembersActiveCommunity,
    clearCommunityAppMounts,
    loadCommunityAppMounts,
    communityAppMountsLoadedCommunityIdRef,
  ]);

  useEffect(() => {
    const shouldLoadUserPlatformApps =
      activePage === "discover" ||
      (activePage === "workspace" &&
        activeView === "settings" &&
        settingsPage === "integrations");
    if (!shouldLoadUserPlatformApps) return;
    if (!session) {
      clearUserPlatformAppMounts();
      return;
    }
    if (userPlatformAppMountsLoadedUserIdRef.current === session.user.id) return;
    void loadUserPlatformAppMounts(session);
  }, [
    activePage,
    activeView,
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
      (activePage === "workspace" &&
        activeView === "settings" &&
        settingsPage === "integrations");
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
    activeView,
    communityTab,
    session,
    settingsPage,
    clearEffectiveMcpApps,
    effectiveMcpAppsLoadedKeyRef,
    loadEffectiveMcpApps,
  ]);

  useEffect(() => {
    const shouldLoadUserPlatformSkills =
      activePage === "discover" ||
      (activePage === "workspace" &&
        activeView === "settings" &&
        settingsPage === "integrations");
    if (!shouldLoadUserPlatformSkills) return;
    if (!session) {
      clearUserPlatformSkills();
      return;
    }
    if (userPlatformSkillsLoadedUserIdRef.current === session.user.id) return;
    void loadUserPlatformSkills(session);
  }, [
    activePage,
    activeView,
    session,
    settingsPage,
    clearUserPlatformSkills,
    loadUserPlatformSkills,
    userPlatformSkillsLoadedUserIdRef,
  ]);

  useEffect(() => {
    const shouldLoadCommunitySkills =
      (activePage === "community" && communityTab === "ai_agent") ||
      activePage === "discover";
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

  useCommunityMemberRosterLifecycle<AuthSession>({
    activePage,
    communityTab,
    ...sessionArg,
    activeCommunityId,
    loadCommunityMembers,
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
    activePage,
    communityTab,
    ...sessionArg,
    activeCommunityId,
    communities,
    canReviewJoinRequests: canReviewJoinRequestsActiveCommunity,
    activeCommunityMembersJoinReviewMode,
    isJoinRequestsModalOpen,
    loadCommunityJoinRequests,
    setCommunityJoinRequests,
    setIsLoadingCommunityJoinRequests,
    setCommunityJoinRequestsError,
    setDecidingCommunityJoinRequestId,
    setIsJoinRequestsModalOpen,
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
    getCommunityCreatedAt: () => communities.find((community) => community.id === activeCommunityId)?.created_at ?? null,
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
        openWorkspaceDraft({
          replace: true,
          projectId: payload.project_id ?? null,
          focusComposer: focusWorkspaceComposer,
        });
      },
      connect_provider: (payload) => {
        if (payload.provider === "chatgpt") {
          void providerConnectionUi.handleConnectChatgpt();
          return;
        }
        if (payload.provider === "openai") {
          setActiveView("settings");
          setSettingsPage("account");
          showAppToastMessage("Paste your OpenAI API key in Account settings.");
          return;
        }
        showAppToastMessage("Provider connection is not available.");
      },
      create_community: (payload) => {
        openCreateCommunityModal(payload.draft ?? null);
      },
      redeem_purchase_claim: (payload) => {
        void redeemPurchaseClaim(payload.token);
      },
      join_public_community: (payload) => {
        void joinPublicCommunity({
          communityId: payload.community_id ?? undefined,
          communitySlug: payload.community_slug ?? undefined,
        });
      },
      redeem_pending_purchases: (payload) => {
        void redeemPendingPurchases({ navigate: payload.navigate, silentNoop: payload.silent_noop });
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
      void enterJoinedCommunity({ communityId, communitySlug });
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
      onConnectOnboardingStarted: ({ context, communitySlug }) => {
        captureProductAnalyticsEvent("stripe connect onboarding started", {
          billing_context: context,
          community_slug: communitySlug,
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
  } = useWebCommerceAffiliateActions({
    getSession: () => sessionRef.current,
    ensureSession: ensureUsableAuthSession,
    requireSignIn,
    openCommunityWorkspace: ({ communityId, communitySlug }) => {
      void enterJoinedCommunity({ communityId, communitySlug });
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

  const loadBuilderPartnerProgram = useCallback(
    async (nextSession?: AuthSession | null): Promise<BuilderPartnerProgramSnapshot | null> => {
      const requestId = ++builderPartnerProgramLoadRequestIdRef.current;
      const usableSession = nextSession ?? await ensureUsableAuthSession();
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
          setBuilderPartnerProgramError(message);
          setBuilderPartnerProgram(null);
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

  const acceptBuilderPartnerTerms = useCallback(async (): Promise<void> => {
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

  const startWorkspaceCreditTopupCheckout = useCallback(async (packId?: WorkspaceToolBalanceTopupPackId): Promise<void> => {
    const session = await ensureUsableAuthSession();
    if (!session) {
      requireSignIn();
      return;
    }
    setWorkspaceCreditTopupError(null);
    setIsStartingWorkspaceCreditTopupCheckout(true);
    try {
      const returnUrl = `${window.location.origin}/settings/agent`;
      const data = await startCloudWorkspaceCreditTopupCheckout({
        session,
        successUrl: returnUrl,
        cancelUrl: returnUrl,
        packId,
      });
      const checkoutUrl =
        data && typeof data === "object" && typeof (data as { checkout_url?: unknown }).checkout_url === "string"
          ? String((data as { checkout_url?: unknown }).checkout_url).trim()
          : "";
      if (!checkoutUrl) throw new Error("Missing checkout_url.");
      markPendingAnalyticsReturn("workspace_credit_topup", {
        baseline_included_credits: workspaceCreditBalance?.includedCreditsBalance ?? 0,
        baseline_purchased_credits: workspaceCreditBalance?.purchasedCreditsBalance ?? 0,
        baseline_total_credits:
          (workspaceCreditBalance?.includedCreditsBalance ?? 0) +
          (workspaceCreditBalance?.purchasedCreditsBalance ?? 0),
      });
      captureProductAnalyticsEvent("workspace credit topup started", {
        surface: "settings_agent",
        pack_id: packId ?? null,
      });
      window.location.assign(checkoutUrl);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to start tool-balance checkout.";
      setWorkspaceCreditTopupError(message);
    } finally {
      setIsStartingWorkspaceCreditTopupCheckout(false);
    }
  }, [ensureUsableAuthSession, requireSignIn, workspaceCreditBalance]);

  const effectiveAccountSetupStatus = accountSetupStatus ?? cloudProfile?.account_setup ?? null;
  const isProfileSetupCompleteForPublicActions =
    !session || Boolean(effectiveAccountSetupStatus && isAccountSetupStatusIdentityComplete(effectiveAccountSetupStatus));
  const isAccountSetupCompleteForBuilderActions =
    !session || Boolean(effectiveAccountSetupStatus?.completed);

  const communityUi = useWebCommunityUiController<
    AuthSession,
    CommunityRecord,
    AccountCommerceStatus,
    AppPage,
    AppView,
    CommunityTab
  >({
    ...authenticatedSessionArg,
    communities,
    communityRoleById,
    accountCommerceStatus,
    accountCommerceError,
    isAccountSetupComplete: isAccountSetupCompleteForBuilderActions,
    activeCommunity,
    activeCommunityId,
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
      showAppToastMessage("You've built the maximum number of communities");
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
    loadCommunities,
    setActiveCommunityId,
    setActivePage,
    setActiveView,
    setCommunityTab,
    setCommunities,
    setCommunityRoleById,
    getCommunityId: (community) => community.id,
  });
  const {
    openCreateCommunityModal,
    openDeleteCommunityModal,
  } = communityUi;

  const {
    publicFunnelSlug,
    isPublicFunnelPreviewRoute,
    publicFunnelPreviewDraft,
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
    memberCountOverride,
  } = useWebPublicCommunityRouteController<PublicCommunityRecord, MyCommunityJoinRequest>({
    publicRoute: shellPublicRoute,
    publicCommunity: publicCommunityUi.publicCommunity,
    publicCommunityPlans: publicCommunityUi.publicCommunityPlans,
    publicCommunityAccess: publicCommunityUi.publicCommunityAccess,
    myPublicCommunityJoinRequest: publicCommunityUi.myPublicCommunityJoinRequest,
    isSignedIn: Boolean(session),
    sessionDependency: session,
    loadPublicCommunity,
    navigateTo,
  });
  const pendingPurchaseBannerKey = pendingPurchaseClaims
    .map((claim) => claim.community_id)
    .sort()
    .join("|");

  useEffect(() => {
    setIsPendingPurchasesBannerDismissed(false);
  }, [pendingPurchaseBannerKey]);

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
    isRedeemingClaim,
    isJoiningPublicCommunity: publicCommunityUi.isJoiningPublicCommunity,
    lastAutoRedeemPendingPurchasesUserIdRef,
    autoRedeemPendingPurchasesAttemptRef,
    autoRedeemPendingPurchasesTimeoutRef,
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

  useEffect(() => {
    if (claimTokenParam) scrubCurrentRouteSearchParams(["token"]);
    if (checkoutSuccessSessionId) scrubCurrentRouteSearchParams(["session_id"]);
  }, [checkoutSuccessSessionId, claimTokenParam]);

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
      const projectId = (thread.project_id ?? "").trim();
      enterWorkspaceThread({
        threadId: thread.id,
        projectId: projectId || null,
        communityId: thread.community_id ?? null,
      });
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

  const handleStartDraftInCloudProject = useCallback((projectId: string): void => {
    openWorkspaceDraft({
      projectId,
      focusComposer: focusWorkspaceComposer,
    });
  }, [focusWorkspaceComposer, openWorkspaceDraft]);

  const selectWorkspaceThread = (thread: ThreadRecord): void => {
    webThreadContextController.selectThread(thread);
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
      const maxBytes = isImage ? MAX_WEB_IMAGE_UPLOAD_BYTES : MAX_WEB_FILE_UPLOAD_BYTES;
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
      const maxBytes = isImage ? MAX_WEB_IMAGE_UPLOAD_BYTES : MAX_WEB_FILE_UPLOAD_BYTES;
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
  const shouldShowAccountSetupCard =
    Boolean(session) &&
    Boolean(effectiveAccountSetupStatus) &&
    !effectiveAccountSetupStatus?.completed &&
    !isLoadingAccountSetupStatus;

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
        requested_funding_source: requestedFundingSource,
        inference_source: inferenceSource,
        started_in_draft: startedInDraft,
        has_attachments: hasAttachments,
        surface: "workspace",
      });
    },
    createThread,
    onThreadCreated: (thread) => {
      enterWorkspaceThread({
        threadId: thread.id,
        projectId: (thread.project_id ?? "").trim() || null,
        communityId: thread.community_id ?? null,
      });
    },
    updateThreadModel,
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
    modelToggles: platformModelToggles,
    userMemoryRememberEnabled:
      userMemorySettings.memory_mode !== "off" && userMemorySettings.remember_intent_enabled !== false,
    accountTier: accountCommerceStatus?.account_tier ?? null,
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
    handleVoiceInputClick,
  } = useWebVoiceInputController<AuthSession>({
    ...authenticatedSessionArg,
    sessionRef: sessionRef,
    activeCommunity,
    activeCommunityFunnelAction,
    canPostMessagesActiveCommunity,
    requireSignIn: () => requireSignIn(),
    showAppToastMessage,
    onToolBalanceRequired: (_surface, message, details) => {
      setInferenceIssueModal({
        reason: "workspace_credits",
        threadId: activeThreadId ?? GUEST_THREAD_ID,
        mode: "respond",
        message: message.trim() || null,
        toolKind: details?.toolKind ?? "voice_input",
        requiredCredits: details?.requiredCredits ?? null,
      });
    },
    appendWorkspaceTranscript: (transcript) => workspaceComposerApiRef.current?.appendTranscript(transcript),
    focusWorkspaceInput: focusWorkspaceComposer,
    setCommunityMessageInput,
    chatInputRef,
  });

  const communityMessageById = useMemo(() => {
    const map = new Map<string, CommunityChatMessage>();
    for (const message of communityMessages) map.set(message.id, message);
    return map;
  }, [communityMessages]);

  useEffect(() => {
    communityMessageIdsRef.current = new Set(communityMessages.map((m) => m.id));
  }, [communityMessages]);

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

  const activeThread = useMemo(() => {
    if (!activeThreadId) return null;
    return threads.find((t) => t.id === activeThreadId) ?? null;
  }, [activeThreadId, threads]);
  const workspaceModelState = useWebWorkspaceModelStateController({
    modelToggles: platformModelToggles,
  });
  const workspace = useWebWorkspaceSurfaceController<
    AuthSession,
    ThreadRecord,
    ThreadMessage,
    ThreadStreamingState<MemoryUsedItem, HistoryUsedItem, CommunityEvidenceUsedV1>,
    ThreadStreamingRuntimeEvent
  >({
    activeThreadId,
    workspaceWantsNewChat,
    project: workspaceCore.project,
    model: workspaceModelState,
    resetWorkspaceComposer: () => {
      workspaceComposerDraftRef.current = { text: "", attachments: [] };
      workspaceComposerApiRef.current?.clear();
    },
    threadsHydratedRef,
    setThreads,
    setThreadError,
    setThreadErrorById,
    setWorkspaceWantsNewChatMode,
    setActiveThreadId,
    setThreadMessages,
    setIsSendingMessage,
    setThreadSendingStateById,
    setThreadStreamingStateById,
    setRuntimeEventsByRunId,
    setLoadingThreadMessagesThreadId,
    loadThreads,
    loadModelRegistry,
  });
  const projectUiController = useWebProjectUiController<AuthSession>({
    session: session,
    cloudProjects: workspace.state.projects,
    ensureSession: ensureUsableAuthSession,
    requireSignIn,
    showAppToastMessage,
    onProjectCreated: workspace.actions.handleProjectCreated,
    onProjectUpdated: workspace.actions.handleProjectUpdated,
    onProjectDeleted: workspace.actions.handleProjectDeleted,
    onStartDraftInProject: handleStartDraftInCloudProject,
  });

  const renderCloudProjectCreateAction = (): ReactNode =>
    projectUiController.canCreateAdditionalCloudProjects ? (
      <button
        type="button"
        className="project-toolbar-add"
        onClick={projectUiController.openCreateProjectModal}
        disabled={projectUiController.isCreatingProject || projectUiController.projectQuotaReached}
        title={
          projectUiController.projectQuotaReached
            ? `Computers are capped at ${projectUiController.maxProjects}.`
            : projectUiController.isCreatingProject
              ? "Creating computer…"
              : "Create a new computer"
        }
        aria-label="Create a new computer"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </button>
    ) : null;

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
  const resolveWorkspaceSidebarThreadProjectId = useCallback(
    (thread: ThreadRecord): string | null =>
      workspace.derived.resolveThreadProjectId(thread),
    [workspace.derived],
  );
  const getWorkspaceSidebarThreadSearchText = useCallback(
    (thread: ThreadRecord): string => {
      const title = getThreadDisplayTitle(thread);
      const communityName = thread.community_id
        ? (communities.find((community) => community.id === thread.community_id)?.name ?? "")
        : "";
      const projectId = resolveWorkspaceSidebarThreadProjectId(thread);
      const projectName = projectId
        ? (workspace.derived.projectById.get(projectId)?.name ?? "")
        : "";
      return `${title} ${communityName} ${projectName}`.trim();
    },
    [
      communities,
      getThreadDisplayTitle,
      resolveWorkspaceSidebarThreadProjectId,
      workspace.derived.projectById,
    ],
  );
	  const isAnonymousWorkspace = isSignedOutAppPresentation;
	  const guestThreadMessages = useMemo(() => {
	    if (!isAnonymousWorkspace) return [] as ThreadMessage[];
	    return threadMessages.filter((message) => message.thread_id === GUEST_THREAD_ID);
	  }, [isAnonymousWorkspace, threadMessages]);
	  const guestThreadHasMessages = guestThreadMessages.length > 0;
	  const guestThreadPreview = useMemo(() => {
	    if (!guestThreadHasMessages) return "No messages yet.";
	    for (let i = guestThreadMessages.length - 1; i >= 0; i--) {
	      const message = guestThreadMessages[i];
	      if (!message) continue;
	      const text = extractTextFromContentJson(message.content_json).trim();
	      if (text) return text;
	    }
	    return "Open your preview chat.";
	  }, [guestThreadHasMessages, guestThreadMessages]);

  const hasSelectedCommunity = Boolean(String(selectedActiveCommunitySlug ?? activeCommunity?.slug ?? "").trim());
  const shellProjection = buildWebShellProjection({
    publicRouteKind: shellPublicRoute.kind,
    shellVariant,
    activePage,
    activeView,
    mobileSettingsView,
    userWantsSessions,
    hasSelectedCommunity,
    isPublicCommunityFunnel,
  });
  const {
    isWorkspaceSettings,
    showMobileAppShell,
    showMobileSettingsShell,
    showMobileShell,
    showMobileSettingsIndex,
    showMobilePublicFunnel,
    sessionsDrawerEnabled,
    isSessionsDrawerOpen,
    showDesktopCommunityRail,
    showDesktopCommunityNav,
    hasLeftPanel,
    mobileShellMode,
    mobileSecondaryMode,
    showHeaderIslands,
  } = shellProjection;
  const dockedWorkspaceCenterWidth =
    workspaceViewportWidth -
    WEB_RAIL_WIDTH -
    WEB_SESSIONS_DRAWER_WIDTH -
    (workspaceOperatorPanelLayout.open
      ? workspaceOperatorPanelLayout.width
      : 0);
  const shouldOverlaySessionsDrawer =
    isSessionsDrawerOpen &&
    dockedWorkspaceCenterWidth < MIN_DOCKED_WORKSPACE_CENTER_WIDTH;
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
  const handlePreviewCommunityFunnel = useCallback(() => {
    const slug = String(activeCommunity?.slug ?? "").trim();
    if (!slug) return;
    const currentFunnelPath = applyShellVariantToAppPath(buildCommunityTabPath(slug, "funnel") ?? "", shellVariant);
    const previewPath = applyShellVariantToPublicPath(buildCommunityFunnelPreviewPath(slug) ?? "", shellVariant);
    if (!previewPath || !currentFunnelPath) return;
    const currentRoutePath = readCurrentRoutePath();
    if (currentRoutePath !== currentFunnelPath) {
      window.history.replaceState(window.history.state ?? {}, document.title, currentFunnelPath);
    }
    const previewState = buildCommunityFunnelPreviewHistoryState({
      slug,
      community: {
        slug,
        name: activeCommunity?.name ?? "Community",
        one_liner: activeCommunity?.one_liner ?? null,
        about: communitySettingsAbout.trim() || activeCommunity?.about || null,
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
      visibilityLabel: funnelPreviewVisibilityLabel,
      memberCount: activeCommunity ? communityMembers.length : null,
      funnelAction: funnelPreviewAction,
      one_liner: activeCommunity?.one_liner ?? null,
      funnel: communityFunnelConfig,
      savedAt: Date.now(),
    });
    pushNavSnapshot();
    navigateTo(previewPath, { state: previewState });
  }, [
    activeCommunity,
    communityMembers.length,
    communityFunnelConfig,
    funnelPreviewAdminCount,
    funnelPreviewAction,
    funnelPreviewOnlineCount,
    funnelPreviewOnlineFaces,
    funnelPreviewVisibilityLabel,
    readCurrentRoutePath,
    shellVariant,
  ]);

  useEffect(() => {
    if (!isSessionsDrawerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setUserWantsSessions(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSessionsDrawerOpen]);

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
      projectId: workspace.derived.resolvedActiveProjectId,
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
      projectId: workspace.derived.resolvedActiveProjectId,
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
    workspace.derived.resolvedActiveProjectId,
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

  useEffect(() => {
    const pending = readPendingAnalyticsReturn("workspace_credit_topup");
    if (!pending || !workspaceCreditBalance) return;

    const currentIncluded = Math.max(0, workspaceCreditBalance.includedCreditsBalance);
    const currentPurchased = Math.max(0, workspaceCreditBalance.purchasedCreditsBalance);
    const currentTotal = currentIncluded + currentPurchased;
    const baselinePurchased = Math.max(0, Number(pending.baseline_purchased_credits ?? 0) || 0);
    const baselineTotal = Math.max(0, Number(pending.baseline_total_credits ?? 0) || 0);
    const purchasedDelta = currentPurchased - baselinePurchased;
    const totalDelta = currentTotal - baselineTotal;
    if (purchasedDelta <= 0 && totalDelta <= 0) return;

    clearPendingAnalyticsReturn("workspace_credit_topup");
    captureProductAnalyticsEvent("workspace credit topup succeeded", {
      purchased_credit_delta: Math.max(0, purchasedDelta),
      total_credit_delta: Math.max(0, totalDelta),
      surface: "settings_agent",
    });
  }, [workspaceCreditBalance]);

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

  useEffect(() => {
    if (!session || activePage !== "workspace" || !activeThreadId) return;
    if (!activeThread?.agent_attention) return;
    if (isHydratingActiveWorkspaceThread || isActiveWorkspaceThreadBusy) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    if (threadAgentAttentionSeenInFlightRef.current.has(activeThreadId)) return;

    threadAgentAttentionSeenInFlightRef.current.add(activeThreadId);
    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === activeThreadId ? { ...thread, agent_attention: false } : thread,
      ),
    );

    void markCloudThreadAgentAttentionSeen({
      session,
      threadId: activeThreadId,
    })
      .catch(() => {
        void loadThreads(session).catch(() => null);
      })
      .finally(() => {
        threadAgentAttentionSeenInFlightRef.current.delete(activeThreadId);
      });
  }, [
    activePage,
    activeThread?.agent_attention,
    activeThreadId,
    isActiveWorkspaceThreadBusy,
    isHydratingActiveWorkspaceThread,
    loadThreads,
    session,
  ]);

  const pendingToken =
    (checkoutClaimToken ?? (publicRoute.kind === "claim" ? publicRoute.token : "")).trim() ||
    readPendingPurchaseClaimToken();
  const handlePublicLandingPrimaryAction = () => {
    if (isPublicFunnelPreviewRoute) return;
    if (!publicCommunityUi.publicCommunity) return;
    if (canEnterPublicCommunity && publicCommunityUi.publicCommunityAccess?.community_id) {
      void enterJoinedCommunity({
        communityId: publicCommunityUi.publicCommunityAccess.community_id,
        communitySlug: publicCommunityUi.publicCommunity.slug,
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
    void joinPublicCommunity({ communitySlug: publicCommunityUi.publicCommunity.slug });
  };

  const handlePublicCheckoutContinue = () => {
    if (!pendingToken) return;
    if (showPublicSignIn) {
      requireSignIn({ reason: "redeem_purchase_claim", payload: { token: pendingToken } });
      return;
    }
    void redeemPurchaseClaim(pendingToken);
  };

  const handlePublicClaimContinue = () => {
    const token = (pendingToken || manualClaimToken).trim();
    if (!token) return;
    void redeemPurchaseClaim(token);
  };
  const handleCancelPendingPublicJoinRequest = () => {
    const slug = publicCommunityUi.publicCommunity?.slug ?? publicFunnelSlug ?? "";
    if (!slug || !approvalPending) return;
    void cancelMyPendingJoinRequest(slug);
  };
  const hasAuthenticatedAppShellPresentation =
    shellPublicRoute.kind === "app" && authPresentationState !== "signed_out";
  const isAuthRecoveringSignedInAppShell =
    shellPublicRoute.kind === "app" && authPresentationState === "recovering_signed_in";
  const shouldHoldRootLandingForAuth =
    shellPublicRoute.kind === "app" &&
    activePage === "landing" &&
    authPresentationState === "recovering_signed_in" &&
    typeof window !== "undefined" &&
    isRootAppRoutePath(window.location.pathname || "/");
  const isAccountGraphHydratingCriticalAppShell =
    shellPublicRoute.kind === "app" &&
    authPresentationState === "signed_in" &&
    accountGraphHydrationPhase === "critical";

	  const handleTopbarBackFromWorkspaceSettings = () => {
	    if (goBack()) return;
	    const transition = deriveBackFromWorkspaceSettingsFallbackTransition();
	    setActiveView(transition.nextView);
	  };
	  const handleTopbarBackFromPublicFunnel = () => {
	    void goBack();
	  };
    const handleExitPublicFunnelPreview = () => {
      if (goBack()) return;
      const fallbackPath = applyShellVariantToAppPath(
        buildCommunityTabPath(publicRoute.kind === "community_funnel_preview" ? publicRoute.slug : null, "funnel") ?? "",
        shellVariant,
      );
      if (!fallbackPath) return;
      navigateTo(fallbackPath, { replace: true });
    };
	  const handleTopbarBackToWorkspace = () => {
	    if (goBack()) return;
	    const transition = deriveBackToWorkspaceFallbackTransition(
	      { activeView },
	      { forceHomeView: true },
	    );
	    setActiveView(transition.nextView);
	    setActivePage(transition.nextPage);
	  };
	  const handleOpenLandingCommunity = () => {
	    const communitySlug = String(activeCommunity?.slug ?? "").trim();
	    if (!communitySlug) return;
	    openCommunityChat(communitySlug, { clearUnread: true });
	  };
	  const handleOpenLandingProject = () => {
	    if (!workspace.derived.resolvedActiveProjectId) return;
	    handleStartDraftInCloudProject(workspace.derived.resolvedActiveProjectId);
	  };
	  const handleOpenDiscover = () => {
	    const transition = deriveOpenDiscoverTransition({ activePage });
	    if (transition.shouldPushSnapshot) pushNavSnapshot();
      setDiscoverActiveTab("communities");
      setSelectedDiscoverAppId(null);
      setSelectedDiscoverSkillId(null);
	    setActiveView(transition.nextView);
	    setActivePage(transition.nextPage);
	  };
    const handleOpenDiscoverApps = () => {
      const transition = deriveOpenDiscoverTransition({ activePage });
      if (transition.shouldPushSnapshot) pushNavSnapshot();
      setDiscoverActiveTab("apps");
      setSelectedDiscoverAppId(null);
      setSelectedDiscoverSkillId(null);
      setActiveView(transition.nextView);
      setActivePage(transition.nextPage);
    };
    const handleOpenDiscoverSkills = () => {
      const transition = deriveOpenDiscoverTransition({ activePage });
      if (transition.shouldPushSnapshot) pushNavSnapshot();
      setDiscoverActiveTab("skills");
      setSelectedDiscoverAppId(null);
      setSelectedDiscoverSkillId(null);
      setActiveView(transition.nextView);
      setActivePage(transition.nextPage);
    };
    const handleOpenIntegrationsSettings = () => {
      pushNavSnapshot();
      setShouldOpenCreatePersonalSkill(false);
      setActivePage("workspace");
      setActiveView("settings");
      setSettingsPage("integrations");
    };
    const handleOpenCreatePersonalSkill = () => {
      pushNavSnapshot();
      setShouldOpenCreatePersonalSkill(true);
      setActivePage("workspace");
      setActiveView("settings");
      setSettingsPage("integrations");
    };
    const handleOpenActiveCommunityAiAgentTab = (tab: "apps" | "skills") => {
      const nextCommunitySlug = String(
        selectedActiveCommunitySlug ?? activeCommunity?.slug ?? "",
      ).trim();
      if (!nextCommunitySlug) return;
      pushNavSnapshot();
      setCommunityAiAgentPreferredTab(tab);
      openCommunityTab(nextCommunitySlug, "ai_agent", { pushSnapshot: false });
    };
    const {
      handleSelectMobileMode,
      openMobileAgentSettings,
      handleExitMobileSettings,
      openMobileCreateCommunity,
      openMobileDrawer,
      handleMobileShellTouchStart,
      handleMobileShellTouchEnd,
      handleMobileShellTouchCancel,
    } = useWebMobileShellController({
      activePage,
      activeView,
      activeCommunitySlug: String(activeCommunity?.slug ?? "").trim() || null,
      selectedActiveCommunitySlug,
      mobileShellMode,
      hasSelectedCommunity,
      mobileOverlay,
      showMobileShell,
      showMobileSettingsShell,
      setMobileOverlay,
      setActivePage,
      setActiveView,
      setMobileSettingsView,
      openCommunityChat,
      handleOpenDiscover,
      handleTopbarBackToWorkspace,
      hasCommunityCreateAccess: Number(accountCommerceStatus?.max_communities ?? 0) > 0,
      openCreateCommunityModal: () => openCreateCommunityModal(),
      setIsFreeAccountInfoOpen,
    });
    useEffect(() => {
      if (shellPublicRoute.kind !== "app") return;
      if (activePage !== "community") return;
      if (hasSelectedCommunity) return;
      setActiveView("home");
      setActivePage("discover");
    }, [activePage, hasSelectedCommunity, shellPublicRoute.kind]);
	  const handleToggleWorkspaceSettings = () => {
	    const transition = deriveToggleWorkspaceSettingsTransition({ activePage, activeView });
	    if (transition.shouldPushSnapshot) pushNavSnapshot();
	    setActivePage(transition.nextPage);
	    setActiveView(transition.nextView);
	  };
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
    if (activePage === "workspace") {
      const currentLens = activeThreadId
        ? (threads.find((t) => t.id === activeThreadId)?.community_id ?? null)
        : null;
      const isWorkspaceRunActive = isActiveWorkspaceThreadBusy;
      if (isWorkspaceRunActive && currentLens !== community.id) {
        showAppToastMessage(
          `Switched to ${community.name}. Active run keeps prior context; new context applies next turn.`,
        );
      }
      if (session && activeThreadId) {
        void syncWorkspaceThreadCommunityLens(activeThreadId, community.id, session);
      }
    }
    return true;
  }, [
    activePage,
    activeThreadId,
    session,
    isActiveWorkspaceThreadBusy,
    selectedActiveCommunityId,
    showAppToastMessage,
    syncCommunitySelection,
    syncWorkspaceThreadCommunityLens,
    threads,
  ]);
  const { communityChatPanelProps, communitySecondarySurfaceProps } =
    buildWebCommunitySurfaceProjection({
      activePage,
      communityTab,
      activeCommunity,
      selectedActiveCommunitySlug,
      hasAuthenticatedPresentation: hasAuthenticatedAppShellPresentation,
      isAuthRecoveringSignedIn: isAuthRecoveringSignedInAppShell,
      hasSession: Boolean(session),
      hasResolvedCommunities,
      isLoadingCommunities,
      sessionUserId: canonicalSessionUserId,
      canViewActiveCommunitySettings,
      communitySettingsLayer,
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
        error: communityAppMountError,
        mutationError: communityAppMutationError,
        updatingMountId: updatingCommunityAppMountId,
        refreshingMountId: refreshingCommunityAppMountId,
        removingMountId: removingCommunityAppMountId,
        onBrowseCatalog: handleOpenDiscoverApps,
        onUpdateMount: handleUpdateCommunityAppMount,
        onRefreshApp: handleRefreshCommunityApp,
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
        openDeleteCommunityModal,
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
      aiAgentHasSession: Boolean(session),
      canManageMembersActiveCommunity,
      aiAgentPreferredTab: communityAiAgentPreferredTab,
      isLoadingCommunityAgentConfig,
      communityAgentConfigError,
      isActiveCommunityOwner,
      aiAgentWorkspaceEditorProps: {
        communityAgentConfigDirtyRef,
        handleSaveCommunityAgentConfig: handleSaveCommunityAgentConfigAndRefreshLanding,
        handleResetCommunityAgentConfig,
        isSavingCommunityAgentConfig,
        communityAgentConfigSaveError,
        communityAgentConfigLanding,
        setCommunityAgentConfigLanding,
        markCommunityAgentConfigDirty,
        communityAgentConfigCommunitySystemPrompt,
        setCommunityAgentConfigCommunitySystemPrompt,
        previewCommunityName: activeCommunity?.name ?? "Community",
        previewProjectName: workspace.derived.resolvedActiveProjectName,
      },
      aiAgentAppsEditorProps: {
        intro: "Recommend hosted MCP apps here. Polynet seeds or reuses each member's personal harness app.",
        emptyState: "Recommend the first hosted MCP app for this community. Members use their own credentials when an app requires authentication.",
        addButtonLabel: "Browse apps",
        mounts: communityAppMounts,
        effectiveMcpApps,
        isLoading: isLoadingCommunityAppMounts,
        error: communityAppMountError,
        mutationError: communityAppMutationError,
        isConnecting: isConnectingCommunityApp,
        updatingMountId: updatingCommunityAppMountId,
        refreshingMountId: refreshingCommunityAppMountId,
        removingMountId: removingCommunityAppMountId,
        onUpdateMount: handleUpdateCommunityAppMount,
        onRefreshApp: handleRefreshCommunityApp,
        onUnmountApp: handleUnmountCommunityApp,
        onBrowseCatalog: handleOpenDiscoverApps,
      },
      aiAgentSkillsEditorProps: {
        intro: "Attach reusable skill packages here so this community lens can load behavior units on demand without bloating the base prompt.",
        emptyState: "Attach the first skill package to this community. Attached skills become available when members explicitly mention them in this lens.",
        addButtonLabel: "Browse skills",
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
        onBrowseCatalog: handleOpenDiscoverSkills,
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
        previewCommunity: {
          slug: activeCommunity?.slug ?? null,
          name: activeCommunity?.name ?? "Community",
          one_liner: activeCommunity?.one_liner ?? null,
          about: activeCommunity?.about ?? null,
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
        previewMemberCount: activeCommunity ? communityMembers.length : null,
        previewFunnelAction: funnelPreviewAction,
      },
      canViewActiveCommunityAnalytics,
      analyticsState: {
        communityAnalyticsRange,
        isLoadingCommunityAnalytics,
        communityAnalyticsError,
        communityAnalyticsSummary,
        communityAnalyticsSeries,
      },
      analyticsActions: {
        setCommunityAnalyticsRange,
      },
      resourcesState: {
        isLoadingResources,
        isLoadingResourceModules,
        modules: communityResourceModules,
        resources: communityResources,
        openResourceEmbedId,
      },
      resourcesActions: {
        setOpenResourceEmbedId,
        openNewModuleModal,
        handleEditModule,
        handleDeleteModule,
        handleReorderModules,
        openNewResourceModal,
        handleEditResource,
        handleDeleteResource,
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
      membersState: {
        communityMembers,
        isLoadingCommunityMembers,
        hasResolvedCommunityMembers,
        filteredCommunityMembers,
        communityMembersRoleFilter,
        communityMembersPlanFilter,
        activeCommunityMembersJoinReviewMode,
        communityJoinRequests,
        communityJoinRequestsError,
        decidingCommunityJoinRequestId,
        isLoadingCommunityJoinRequests,
        isSavingFreeAccessMode,
        isJoinRequestsModalOpen,
        profilesByUserId: savedProfilesByUserId,
      },
      membersActions: {
        setCommunityMembersRoleFilter,
        setCommunityMembersPlanFilter,
        setIsJoinRequestsModalOpen,
        displayName,
        handleSetCommunityFreeAccessMode,
        handleSetCommunityMemberRole,
        handleRemoveCommunityMember,
        handleBanCommunityMember,
        handleApproveCommunityJoinRequest,
        handleDenyCommunityJoinRequest,
        copyTextToClipboard,
        getAvatarColor,
        getInitials,
        formatRelativeTime,
      },
      canReviewJoinRequestsActiveCommunity,
      canViewMemberPlanDetailsActiveCommunity,
      resourceModuleModalProps,
      resourceModuleDeleteModalProps,
      resourceModalProps,
      canPostMessagesActiveCommunity,
      isProfileSetupComplete: isProfileSetupCompleteForPublicActions,
      isLoadingChat,
      hasResolvedCommunityChat,
      isLoadingMoreChat,
      communityChatHasMore,
      communityMessages,
      communityMessageById,
      messageReactions,
      typingPresence: communityTypingUsers,
      profilesByUserId: savedProfilesByUserId,
      editingMessageId,
      editingMessageText,
      reactionPickerMessageId,
      replyingToMessage,
      communityAttachments,
      communityMessageInput,
      isSendingCommunityMessage,
      communityChatError,
      copiedCommunityMessageId,
      isUserAtBottom,
      unreadCount,
      reactionEmojis: REACTION_EMOJIS,
      messageListRef: communityChatListRef,
      fileInputRef: communityFileInputRef,
      chatInputRef,
      onChatScroll: handleChatScroll,
      onFinishProfileSetup: openProfileSetup,
      onScrollToBottom: () => {
        setIsUserAtBottom(true);
        isUserAtBottomRef.current = true;
        setUnreadCount(0);
        communityChatListRef.current?.scrollTo({
          top: communityChatListRef.current.scrollHeight,
          behavior: "smooth",
        });
      },
      onSetReplyingToMessage: setReplyingToMessage,
      onRemoveCommunityAttachment: removeCommunityAttachment,
      onCommunityFileInputChange: handleCommunityFileInputChange,
      onCommunityAttachmentDrop: handleCommunityAttachmentDrop,
      onCommunityAttachmentDragEnter: handleCommunityAttachmentDragEnter,
      onCommunityAttachmentDragOver: handleCommunityAttachmentDragOver,
      onCommunityAttachmentDragLeave: handleCommunityAttachmentDragLeave,
      onCommunityAttachmentPaste: handleCommunityAttachmentPaste,
      isCommunityAttachmentDragOver,
      onCommunityMessageInputChange: (value: string, textarea: HTMLTextAreaElement) => {
        setCommunityMessageInput(value);
        textarea.style.height = "auto";
        textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
      },
      onSendCommunityMessage: handleSendCommunityMessage,
      displayName,
      shouldShowCommunitySenderMeta,
      shouldShowDateSeparator,
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
        state: communityVoiceUiState,
        title: isProfileSetupCompleteForPublicActions
          ? communityVoiceIntent.title
          : "Finish your profile to use voice input in community chat.",
        onClick: () => {
          if (!isProfileSetupCompleteForPublicActions) {
            openProfileSetup();
            return;
          }
          void handleVoiceInputClick("community");
        },
      },
      lightboxModalProps: {
        isOpen: isCommunityChatLightboxOpen,
        images: communityChatLightboxImages,
        index: communityChatLightboxIndex,
        setIndex: setCommunityChatLightboxIndex,
        onClose: closeCommunityChatLightbox,
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
    publicCommunityUi.setPublicCommunityError(null);
    publicCommunityUi.setPublicJoinError(null);
    publicCommunityUi.setMyPublicCommunityJoinRequest(null);
    publicCommunityUi.setIsLoadingMyPublicCommunityJoinRequest(false);
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
      deleteAccount: deleteOwnAccountFromSettings,
      isLoadingChatgptConnection,
      chatgptConnection,
      isLoadingOpenAiConnection: isLoadingChatgptConnection,
      openAiConnection,
      hasPendingChatgptAuth,
      formatRelativeTime,
      communities,
      communityRoleById,
      openOwnedCommunitySettings: (communityId) => {
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
      },
      communityInitials,
      builderPartnerProgram,
      isLoadingBuilderPartnerProgram,
      builderPartnerProgramError,
      isAcceptingBuilderPartnerTerms,
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
        });
      },
      canUseDevTierOverride,
      setDevAccountTier,
      redeemPendingPurchases: async () => {
        await redeemPendingPurchases();
      },
      ensureSession: ensureUsableAuthSession,
      loadPendingPurchaseClaims: async (session) => {
        await loadPendingPurchaseClaims(session as AuthSession);
      },
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
      saveUserMemorySettings: saveUserMemorySettingsAndRefreshSetup,
      loadPersonalMemoryItems,
      formatRelativeTime,
      handleTogglePersonalMemoryPinned,
      handleDeletePersonalMemoryItem,
      handleCreatePersonalMemoryItem,
      startWorkspaceCreditTopupCheckout,
      personalMemoryUi,
      billingUi,
    },
    integrations: {
      session: session,
      requireSignIn,
      openDiscoverApps: handleOpenDiscoverApps,
      openDiscoverSkills: handleOpenDiscoverSkills,
      shouldOpenCreateSkillComposer: shouldOpenCreatePersonalSkill,
      onConsumeCreateSkillComposerOpen: () =>
        setShouldOpenCreatePersonalSkill(false),
      effectiveMcpApps,
      isLoadingEffectiveMcpApps,
      effectiveMcpAppsError,
      isLoadingUserPlatformAppMounts,
      userPlatformAppMountError,
      userPlatformAppMutationError,
      isConnectingUserPlatformApp,
      updatingUserPlatformAppMountId,
      refreshingUserPlatformAppMountId,
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
    Number(Boolean(activeCommunityAttentionSummary.chat || (activePage === "community" && activeCommunityId && unreadCount > 0))) +
    Number(Boolean(activeCommunityAttentionSummary.ai_feed)) +
    Number(Boolean(activeCommunityAttentionSummary.resources)) +
    Number(Boolean(activeCommunityAttentionSummary.events));
  const communityHomeButton = activeCommunity ? (
    <button
      className={`icon-button community-btn${activePage === "community" ? " active" : ""}`}
      onClick={() => {
        const nextCommunitySlug = String(selectedActiveCommunitySlug ?? activeCommunity.slug ?? "").trim();
        if (!nextCommunitySlug) return;
        openCommunityChat(nextCommunitySlug, { clearUnread: true });
      }}
      aria-label="Open community"
      title={activeCommunity.name}
      type="button"
    >
      <CommunityAvatar
        className="community-btn-avatar"
        imageUrl={activeCommunity.avatar_url}
        focusX={activeCommunity.avatar_focus_x}
        focusY={activeCommunity.avatar_focus_y}
        zoom={activeCommunity.avatar_zoom}
        name={activeCommunity.name}
        fallback={communityInitials(activeCommunity.name)}
        fallbackClassName="community-btn-initials"
      />
      {activeCommunityAttentionCount > 0 ? (
        <span className="unread-badge">{activeCommunityAttentionCount}</span>
      ) : null}
    </button>
  ) : null;
  const handleSelectCommunityTab = useCallback((tab: CommunityTab) => {
    if (tab === "chat") {
      setUnreadCount(0);
      setIsUserAtBottom(true);
      isUserAtBottomRef.current = true;
    }
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
    isUserAtBottomRef,
    openCommunityTab,
    selectedActiveCommunitySlug,
    setIsUserAtBottom,
    setUnreadCount,
  ]);
  const handleSelectCommunityTabFromMobile = useCallback((tab: CommunityTab) => {
    setMobileOverlay(null);
    handleSelectCommunityTab(tab);
  }, [handleSelectCommunityTab]);

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

  const handleStartNewWorkspaceThreadFromShell = () => {
    handleNewWorkspaceThread({
      allowMultipleThreads: userAccessPolicy.allowMultipleThreads,
      onBlocked: () => {
        setThreadError(null);
        setAuthError(null);
        setPreviewAccessGateModal({ reason: "new_thread" });
        setIsPreviewAccessGateRunning(false);
      },
      focusComposer: focusWorkspaceComposer,
    });
  };
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
    projectModalHostProps: projectUiController.modalHostProps,
    providerConnectionModalHostProps: providerConnectionUi.modalHostProps,
    previewAccessGateModal,
    previewAccessGateAuthError: authError,
    isPreviewAccessGateRunning,
    closePreviewAccessGateModal,
    continuePreviewAccessGateAuth,
    inferenceIssueModal,
    isInferenceIssueModalRunning,
    isStartingWorkspaceCreditTopupCheckout,
    workspaceCreditTopupError,
    setInferenceIssueModal,
    startWorkspaceCreditTopupCheckout,
    setActiveView,
    setSettingsPage,
    isFreeAccountInfoOpen,
    accountCommerceError,
    communityModalHostProps: communityUi.modalHostProps,
    appToast,
  });

  const workspaceShellPanels = (
    <WebWorkspaceShellPanelsHost<ThreadRecord, CloudProjectRecord>
      threads={threads}
      projects={workspace.state.projects}
      resolveThreadProjectId={resolveWorkspaceSidebarThreadProjectId}
      getThreadSearchText={getWorkspaceSidebarThreadSearchText}
      onProjectToggled={workspace.actions.setActiveProjectId}
      sessionsDrawerEnabled={sessionsDrawerEnabled}
      isSessionsDrawerOpen={isSessionsDrawerOpen}
      showMobileAppShell={showMobileAppShell}
      showMobileShell={showMobileShell}
      mobileOverlay={mobileOverlay}
      setMobileOverlay={setMobileOverlay}
      threadError={inlineThreadError}
      displayedThreadError={displayedThreadError}
      showGuestSignInAction={showGuestSignInAction}
      session={session}
      hasAuthenticatedPresentation={hasAuthenticatedAppShellPresentation}
      isAuthRecoveringSignedIn={isAuthRecoveringSignedInAppShell}
      authError={previewSidebarAuthError}
      requireSignIn={() => requireSignIn()}
      openMobileAgentSettings={openMobileAgentSettings}
      activeThreadId={activeThreadId}
      guestThreadId={GUEST_THREAD_ID}
      guestThreadHasMessages={guestThreadHasMessages}
      guestThreadPreview={guestThreadPreview}
      renderProjectToolbarAction={renderCloudProjectCreateAction}
      getThreadDisplayTitle={getThreadDisplayTitle}
      selectThread={selectWorkspaceThread}
      startDraftInProject={handleStartDraftInCloudProject}
      editProject={projectUiController.openEditProjectModal}
      deleteProject={(project) => void projectUiController.openDeleteProjectModal(project)}
      applyGuestWorkspaceState={applyGuestWorkspaceState}
      resetGuestThread={resetGuestThread}
    />
  );

  const workspaceLandingProjection = buildWebWorkspaceLandingProjection({
    showGuestSignupRail: !hasAuthenticatedAppShellPresentation,
    activeCommunity: activeCommunity
      ? {
          name: activeCommunity.name,
          avatar_url: activeCommunity.avatar_url,
          avatar_focus_x: activeCommunity.avatar_focus_x,
          avatar_focus_y: activeCommunity.avatar_focus_y,
          avatar_zoom: activeCommunity.avatar_zoom,
        }
      : null,
    resolvedActiveProjectName: workspace.derived.resolvedActiveProjectName,
    emptyThreadLandingTitle: emptyThreadLanding.title,
    onRequireSignIn: () => requireSignIn(),
    onOpenLandingCommunity: handleOpenLandingCommunity,
    onOpenLandingProject: handleOpenLandingProject,
    shouldShowAccountSetupCard,
    accountSetupStatus: effectiveAccountSetupStatus,
    onContinueAccountSetup: () => {
      setIsOnboardingModalOpen(true);
    },
  });
  const { workspaceHostProps } = buildWebWorkspaceSurfaceProjection({
    session: session,
    hasAuthenticatedPresentation: hasAuthenticatedAppShellPresentation,
    isAuthRecoveringSignedIn: isAuthRecoveringSignedInAppShell,
    isAccountGraphHydratingCritical: isAccountGraphHydratingCriticalAppShell,
    activeThreadId,
    guestThreadId: GUEST_THREAD_ID,
    isEmptyWorkspaceThread,
    showEmptyThreadLandingSkeleton,
    isHydratingActiveWorkspaceThread,
    isActiveWorkspaceThreadBusy,
    isStreamingWorkspaceTurn,
    inferenceToast,
    memoryToast,
    ...workspaceLandingProjection,
    initialComposerDraft: workspaceComposerDraftRef.current,
    onComposerDraftChange: handleWorkspaceComposerDraftChange,
    onRegisterComposerApi: handleRegisterWorkspaceComposerApi,
    landingActionButtons,
    authedWorkspaceComposerPlaceholder: "Ask anything",
    guestWorkspaceComposerPlaceholder: "Ask anything (preview)",
    setWorkspaceError: setThreadError,
    ingestWorkspaceAttachmentsFromFileList: async (files, existing, onError) =>
      (await ingestWorkspaceAttachmentsFromFileList(
        files,
        existing as MessageAttachment[],
        onError,
      )) as typeof existing,
    setLoadingThreadMessagesThreadId,
    setThreadMessages,
    loadThreadMessages: (threadId, session) =>
      loadThreadMessages(threadId, session as AuthSession),
    onSendMessage: ({ text, attachments, clearComposer }) => {
      void sendUserMessage({
        text,
        attachments: attachments as MessageAttachment[],
        clearComposer,
      });
    },
    onStopStreamingTurn: () => {
      stopStreamingTurn(activeThreadId ?? undefined);
    },
    resolveWorkspaceSession: ensureUsableAuthSession,
    activeProjectId: workspace.derived.resolvedActiveProjectId,
    showAppToastMessage,
    activeModelLabel: workspace.derived.activeModelLabel,
    modelToggles: platformModelToggles,
    workspaceVoiceUiState,
    workspaceVoiceTitle: workspaceVoiceIntent.title,
    onWorkspaceVoiceClick: () => void handleVoiceInputClick("workspace"),
    activeThreadStreamingRunId,
    activeThreadStreamingState,
    runtimeEventsByRunId,
    threadError: inlineThreadError,
    displayedThreadError,
    showGuestSignInAction,
    requireSignIn,
    canRetryLastThreadTurn,
    retryLastTurn,
    threadMessages,
    copiedMessageId,
    handleCopyMessage,
    copyTextToClipboard,
    parseMessageText,
    parseMessageAttachments,
    parseMessageMemoryUsed,
    parseMessageHistoryUsed,
    parseMessageMemorySuggestions,
    parseMessageMemoryAdded,
    extractCommunityEvidenceUsedV1,
    buildMessageContextModalPayload: (payload) =>
      buildMessageContextModalPayload<MemoryUsedItem, HistoryUsedItem, MemorySuggestion>({
        memoryUsed: payload.memoryUsed,
        historyUsed: payload.historyUsed,
        memorySuggestions: payload.memorySuggestions,
        memoryAdded: payload.memoryAdded,
        communityEvidence: payload.communityEvidence,
      }),
    hasContextPayload,
    openMessageContextModal,
    setContextModal,
    extractInferenceSourceFromMessageContent,
    extractModelIdFromMessageContent,
    formatModelSignature,
    renderMarkdown,
  });
  const showWorkspaceOperatorControl = Boolean(
    hasOperatorDataPanelAccess &&
    session &&
    !showMobileAppShell &&
    activePage === "workspace" &&
    activeView === "home",
  );
  const showWorkspaceOperatorDataPanelControl = Boolean(
    showWorkspaceOperatorControl && hasOperatorDataPanelAccess
  );
  const handleToggleWorkspaceOperatorDataPanel = useCallback(() => {
    setIsWorkspaceOperatorDataPanelOpen((value) => !value);
  }, []);

  useEffect(() => {
    if (showWorkspaceOperatorControl) {
      if (!showWorkspaceOperatorDataPanelControl) {
        setIsWorkspaceOperatorDataPanelOpen(false);
      }
      return;
    }
    setIsWorkspaceOperatorDataPanelOpen(false);
    handleWorkspaceOperatorPanelLayoutChange({ open: false, width: 0, gutter: 0 });
  }, [
    handleWorkspaceOperatorPanelLayoutChange,
    showWorkspaceOperatorControl,
    showWorkspaceOperatorDataPanelControl,
  ]);

  const workspaceOperatorDataToggle = showWorkspaceOperatorControl ? (
    <>
      {showWorkspaceOperatorDataPanelControl ? (
        <button
          type="button"
          className={`icon-button workspace-operator-data-toggle${isWorkspaceOperatorDataPanelOpen ? " active" : ""}`}
          onClick={handleToggleWorkspaceOperatorDataPanel}
          aria-expanded={isWorkspaceOperatorDataPanelOpen}
          aria-controls="workspace-operator-data-panel"
          aria-label={
            isWorkspaceOperatorDataPanelOpen
              ? "Close operator data panel"
              : "Open operator data panel"
          }
          title={isWorkspaceOperatorDataPanelOpen ? "Close data panel" : "Open data panel"}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M15 4v16" />
          </svg>
        </button>
      ) : null}
    </>
  ) : null;

  const mainSurfaceHostProps = buildWebAppMainSurfaceHostProps({
    activePage,
    isPublicCommunityFunnel,
    publicRoute: shellPublicRoute,
    holdLandingForAuth: shouldHoldRootLandingForAuth,
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
      agentName: userMemorySettings.agent_name,
      agentSoul: userMemorySettings.agent_soul,
      isSavingAgent: isLoadingUserMemorySettings,
      onSaveAgent: saveOnboardingAgent,
      onBuildCommunity: () => {
        void completeOnboarding("build_community");
      },
      onDiscoverCommunity: () => {
        void completeOnboarding("discover_community");
      },
      onClose: () => setIsOnboardingModalOpen(false),
    },
    showOnboardingModal: shellPublicRoute.kind === "app" && isOnboardingModalOpen,
    workspaceSurfaceHostProps: {
      activeView,
      settingsGroup: settingsGroup as SettingsGroup,
      showMobileSettingsShell,
      showMobileSettingsIndex,
      onSelectMobileSettingsPage: (page) => {
        setSettingsPage(page);
        setMobileSettingsView("detail");
      },
      onShowMobileSettingsIndex: () => setMobileSettingsView("index"),
      settingsPanelsProps,
      workspaceHostProps: {
        ...workspaceHostProps,
        showOperatorDataPanel: showWorkspaceOperatorDataPanelControl,
        operatorDataPanelSession: showWorkspaceOperatorDataPanelControl ? session : null,
        operatorDataPanelOpen: isWorkspaceOperatorDataPanelOpen,
        onOperatorPanelLayoutChange: handleWorkspaceOperatorPanelLayoutChange,
      },
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
      publicVisibilityLabel,
      selectedPublicCommunityPlanLabel: isPublicFunnelPreviewRoute
        ? null
        : selectedPublicCommunityPlan
          ? formatPlanPrice(selectedPublicCommunityPlan)
          : null,
      hasSelectedPublicCommunityPlan: isPublicFunnelPreviewRoute
        ? false
        : Boolean(selectedPublicCommunityPlan),
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
      showSignIn: isPublicFunnelPreviewRoute ? true : showPublicSignIn,
      memberCountOverride,
    },
    communityHostProps: {
      communityTab,
      chatPanelProps: communityChatPanelProps,
      secondaryPanelsProps: communitySecondarySurfaceProps,
    },
    discoverPanelProps: {
      showMobileShell,
      activeTab: discoverActiveTab,
      selectedAppId: selectedDiscoverAppId,
      selectedSkillId: selectedDiscoverSkillId,
      onSelectTab: (tab) => {
        setDiscoverActiveTab(tab);
        if (tab !== "apps") {
          setSelectedDiscoverAppId(null);
        }
        if (tab !== "skills") {
          setSelectedDiscoverSkillId(null);
        }
      },
      onSelectApp: setSelectedDiscoverAppId,
      onSelectSkill: setSelectedDiscoverSkillId,
      hasSession: Boolean(session),
      isAuthRecoveringSignedIn: isAuthRecoveringSignedInAppShell,
      onRequireAuth: () => requireSignIn(),
      isLoadingDiscover,
      discoverCommunitiesCount: discoverCommunities.length,
      discoverError,
      discoverCommunities,
      discoverApps,
      discoverSkills,
      formatPlanPrice: (plan) => (plan ? formatPlanPrice(plan) : "Free"),
      userPlatformAppMounts,
      isLoadingUserPlatformAppMounts,
      userPlatformAppMountError,
      userPlatformAppMutationError,
      isConnectingUserPlatformApp,
      onConnectUserPlatformApp: handleConnectUserPlatformApp,
      onBeginUserPlatformAppOAuth: handleBeginUserPlatformAppOAuth,
      manageableCommunityTargetName: canManageMembersActiveCommunity
        ? (activeCommunity?.name ?? null)
        : null,
      communityAppMounts,
      isLoadingCommunityAppMounts,
      communityAppMountError,
      communityAppMutationError,
      isConnectingCommunityApp,
      onConnectCommunityApp: handleConnectCommunityApp,
      userPlatformSkills,
      isLoadingUserPlatformSkills,
      userPlatformSkillError,
      userPlatformSkillMutationError,
      isCreatingUserPlatformSkill,
      onCreateUserPlatformSkill: handleCreateUserPlatformSkill,
      communitySkillAttachments,
      ownedSkillPackages,
      isLoadingCommunitySkillAttachments,
      isLoadingOwnedSkillPackages,
      communitySkillAttachmentError,
      ownedSkillPackagesError,
      communitySkillMutationError,
      isCreatingCommunitySkill: isCreatingSkill,
      attachingCommunitySkillPackageId: attachingSkillPackageId,
      onCreateCommunitySkill: handleCreateCommunitySkill,
      onAttachSkillPackageToCommunity: handleAttachSkillPackageToCommunity,
      onOpenIntegrationsSettings: handleOpenIntegrationsSettings,
      onOpenCreateUserPlatformSkill: handleOpenCreatePersonalSkill,
      onOpenActiveCommunityAiAgentApps: () =>
        handleOpenActiveCommunityAiAgentTab("apps"),
      onOpenActiveCommunityAiAgentSkills: () =>
        handleOpenActiveCommunityAiAgentTab("skills"),
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
          discoverTab: discoverActiveTab,
          discoverAppId: null,
          discoverSkillId: null,
          docsSlug: nextSlug,
          threadId: null,
        }) ?? "/docs");
      },
      renderMarkdown,
    },
  });
  const globalOverlays = <WebGlobalOverlayHost {...globalOverlayHostProps} />;
  const mainSurfaceFallback = (
    <main
      className={`workspace${
        mainSurfaceHostProps.showPublicCommunityFunnel ||
        mainSurfaceHostProps.activePage !== "workspace"
          ? " community-mode"
          : ""
      }`}
    >
      <div className="landing-auth-hold" aria-hidden="true" />
    </main>
  );
  const mainSurface = (
    <Suspense fallback={mainSurfaceFallback}>
      <WebAppMainSurfaceHost {...mainSurfaceHostProps} />
    </Suspense>
  );
  const activeIndicators = activeCommunityId
    ? (attentionByCommunityId[activeCommunityId] ?? { chat: false, ai_feed: false, resources: false, events: false })
    : { chat: false, ai_feed: false, resources: false, events: false };
  const localActiveCommunityChatAttention = Boolean(activePage === "community" && activeCommunityId && unreadCount > 0);
  const communityTabIndicators = {
    chat: Boolean(activeIndicators.chat || localActiveCommunityChatAttention),
    ai_feed: Boolean(activeIndicators.ai_feed),
    resources: Boolean(activeIndicators.resources),
    events: Boolean(activeIndicators.events),
  };
  const communityRailAttentionById: Record<string, boolean> = {};
  for (const [communityId, indicators] of Object.entries(attentionByCommunityId)) {
    if (indicators.chat || indicators.ai_feed || indicators.resources || indicators.events) {
      communityRailAttentionById[communityId] = true;
    }
  }
  if (activeCommunityId && localActiveCommunityChatAttention) {
    communityRailAttentionById[activeCommunityId] = true;
  }
  const shellChromeHostProps = buildWebShellChromeHostProps({
    showHeaderIslands,
    isSessionsDrawerOpen,
    shouldOverlaySessionsDrawer,
    showMobileAppShell,
    showMobileSettingsShell,
    showMobilePublicFunnel,
    mobileOverlay,
    showMobileShell,
    handleMobileShellTouchStart,
    handleMobileShellTouchEnd,
    handleMobileShellTouchCancel,
    mobileShellMode,
    mobileSecondaryMode,
    showMobileSettingsIndex,
    activePage,
    hasSelectedCommunity,
    activeCommunity,
    activeCommunityAttentionCount,
    openMobileDrawer,
    handleExitMobileSettings,
    handleStartNewWorkspaceThreadFromShell,
    handleSelectMobileMode,
    setMobileOverlay,
    isPublicCommunityFunnel,
    isPublicFunnelPreviewRoute: publicRoute.kind === "community_funnel_preview",
    hasBackTargetSnapshot: Boolean(backTargetSnapshot),
    backTargetLabel: backTargetLabel ?? null,
    activeView,
    userWantsSessions,
    hasWorkspaceOperatorControl: showWorkspaceOperatorDataPanelControl,
    workspaceOperatorDataToggle,
    communityHomeButton,
    handleExitPublicFunnelPreview,
    handleTopbarBackFromPublicFunnel,
    handleTopbarBackFromWorkspaceSettings,
    setUserWantsSessions,
    handleTopbarBackToWorkspace,
    workspaceShellPanels,
    communityTab,
    communityTabIndicators,
    canViewMembersActiveCommunity,
    canViewActiveCommunitySettings,
    canViewActiveCommunityPolynet,
    canManageMembersActiveCommunity,
    canViewActiveCommunityAnalytics,
    handleSelectCommunityTab,
    handleSelectCommunityTabFromMobile,
    openMobileAgentSettings,
    handleOpenDiscover,
    openMobileCreateCommunity,
    hasCommunityCreateAccess: Number(accountCommerceStatus?.max_communities ?? 0) > 0,
    openCreateCommunityModal: () => openCreateCommunityModal(),
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
    communityInitials,
    showDesktopCommunityRail,
    showDesktopCommunityNav,
    hasCommunityRailMiddleContent,
    canReorderCommunities,
    draggingCommunityId,
    setCommunityRailListElement,
    getCommunityRailItemBindings,
    setIsFreeAccountInfoOpen,
    handleToggleWorkspaceSettings,
    settingsGroup: settingsGroup as SettingsGroup,
    setSettingsPage,
    hasLeftPanel,
    isWorkspaceSettings,
    mainSurface,
    globalOverlays,
  });

  return (
    <>
      <WebShellChromeHost {...shellChromeHostProps} />
    </>
  );
}
