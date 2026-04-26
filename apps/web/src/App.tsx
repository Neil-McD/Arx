import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
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
  readProfileDraftForUser, writeProfileDraftForUser, } from "../../../shared/profileDraftStorage";
import { resolveAuthSubject } from "../../../shared/authSession";
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
  formatBuilderTierLabel, hasBuilderTierPaidAccess, isBuilderTierFree, normalizeBuilderTierForUi, formatPlanPrice, formatSubscriptionPrice, type BuilderBillingReturn, type BuilderConnectReturn, } from "../../../shared/builderBilling";
import { canUseCreatorDevTierOverride } from "../../../shared/devTierOverride";
import { useCheckoutFinalizeController } from "../../../shared/useCheckoutFinalizeController";
import {
  useWebProjectUiController,
  type WebCloudProjectRecord as CloudProjectRecord,
} from "./controllers/useWebProjectUiController";
import { useWebWorkspaceCoreController } from "./controllers/useWebWorkspaceCoreController";
import { useWebCommunityUiController } from "./controllers/useWebCommunityUiController";
import { useWebCommunityAgentConfigUiController } from "./controllers/useWebCommunityAgentConfigUiController";
import { useWebCommunityAppMountsController } from "./controllers/useWebCommunityAppMountsController";
import { useWebCommunitySkillAttachmentsController } from "./controllers/useWebCommunitySkillAttachmentsController";
import { useWebCommunityAdminUiController } from "./controllers/useWebCommunityAdminUiController";
import { useWebCommunitySettingsUiController } from "./controllers/useWebCommunitySettingsUiController";
import { useWebCommunityResourceUiController } from "./controllers/useWebCommunityResourceUiController";
import { useWebCommunityPeopleController } from "./controllers/useWebCommunityPeopleController";
import { useWebPersonalMemoryUiController } from "./controllers/useWebPersonalMemoryUiController";
import { useWebPublicCommunityUiController } from "./controllers/useWebPublicCommunityUiController";
import { useWebProfileSettingsUiController } from "./controllers/useWebProfileSettingsUiController";
import { useWebProviderConnectionUiController } from "./controllers/useWebProviderConnectionUiController";
import { useWebUserPlatformAppMountsController } from "./controllers/useWebUserPlatformAppMountsController";
import { useWebUserPlatformSkillsController } from "./controllers/useWebUserPlatformSkillsController";
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
import { listEnabledCloudModelRegistryRows } from "../../../shared/cloudModelRegistryGateway";
import {
  loadCloudProviderConnections,
  type CloudChatgptConnectionStatus,
  type CloudOpenRouterConnectionStatus,
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
  AnalyticsPoint as SharedAnalyticsPoint,
  AnalyticsRange as SharedAnalyticsRange,
  ChatLightboxImage as SharedChatLightboxImage,
  CommunityAccess as SharedCommunityAccess,
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
  type BuilderUpgradeContext,
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
} from "../../../shared/modelAttributionUi";
import {
  loadBuilderBillingStatusCanonical,
  setDevBuilderTierCanonical,
  type BuilderBillingStatus,
} from "../../../shared/builderBillingStatusGateway";
import { startCloudWorkspaceCreditTopupCheckout } from "../../../shared/cloudBuilderBillingGateway";
import { loadWorkspaceCreditBalanceCanonical, type WorkspaceCreditBalance } from "../../../shared/workspaceCreditsGateway";
import { formatUsdCents, toEpochSeconds } from "../../../shared/displayFormatting";
import { WORKSPACE_CREDIT_TOPUP_CREDITS, WORKSPACE_CREDIT_TOPUP_PRICE_USD } from "../../../shared/workspaceCredits";
import { deriveCommunityJoinMode, type CommunityJoinMode } from "./communityJoinPolicy";
import { deriveCommunityMembersJoinReviewMode, type CommunityMembersJoinReviewMode } from "./communityJoinPolicy";
import { useWebBuilderBillingActions } from "./controllers/useWebBuilderBillingActions";
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
import { useCommunitySettingsAccessLifecycle } from "../../../shared/useCommunitySettingsAccessLifecycle";
import { confirmDiscardUnsavedCommunitySettingsWeb } from "../../../shared/communityUnsavedGuard";
import { markCloudThreadAgentAttentionSeen } from "../../../shared/cloudThreadsGateway";
import type { WebSettingsPanelsProps } from "./components/WebSettingsPanels";
import type { WorkspaceComposerApi, WorkspaceComposerDraft } from "./components/WebWorkspaceHost";
import {
  WebGlobalOverlayHost,
  type WebGlobalOverlayHostProps,
} from "./components/WebGlobalOverlayHost";
import { WebAppMainSurfaceHost } from "./components/WebAppMainSurfaceHost";
import { WebStandalonePublicRouteShell } from "./components/WebStandalonePublicRouteShell";
import { WebShellChromeHost } from "./components/WebShellChromeHost";
import { WebWorkspaceShellPanelsHost } from "./components/WebWorkspaceShellPanelsHost";
import { preloadWebCommunitySecondaryPanels } from "./components/WebCommunityHost";
import { preloadWebSettingsPanels } from "./components/WebWorkspaceSurfaceHost";
import { buildWebStandalonePublicRouteViewProps } from "./controllers/buildWebStandalonePublicRouteViewProps";
import { buildWebGlobalOverlayHostProps } from "./controllers/buildWebGlobalOverlayHostProps";
import { buildWebAppMainSurfaceHostProps } from "./controllers/buildWebAppMainSurfaceHostProps";
import { buildWebShellChromeHostProps } from "./controllers/buildWebShellChromeHostProps";

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
};

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
const GUEST_THREAD_STORAGE_KEY = "polynet_guest_thread_v1";
const LEGACY_GUEST_THREAD_STORAGE_KEY = "arx_guest_thread_v1";
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

function loadGuestThreadStorage(): GuestThreadStorageV1 {
  try {
    const raw = readFirstLocalStorageValue([GUEST_THREAD_STORAGE_KEY, LEGACY_GUEST_THREAD_STORAGE_KEY]);
    if (!raw) return { v: 1, model_id: loadGuestModelId(), messages: [] };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { v: 1, model_id: loadGuestModelId(), messages: [] };
    const asAny = parsed as any;
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
    return { v: 1, model_id, messages };
  } catch {
    return { v: 1, model_id: loadGuestModelId(), messages: [] };
  }
}

function storeGuestThreadStorage(storage: GuestThreadStorageV1): void {
  try {
    localStorage.setItem(GUEST_THREAD_STORAGE_KEY, JSON.stringify(storage));
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
  type: "post" | "link" | "embed" | "file";
  title: string;
  body_md: string | null;
  url: string | null;
  file_key?: string | null;
  pinned: boolean;
  created_at: string;
};

type CommunityMember = CloudCommunityMembershipAdminRow;

type CommunityAccess = SharedCommunityAccess;
type CommunityAnalyticsSummary = SharedCommunityAnalyticsSummary;
type AnalyticsPoint = SharedAnalyticsPoint;
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

function formatModelSignature(
  modelId: string | null | undefined,
  inferenceSource: string | null | undefined,
  modelToggles: ModelToggle[],
): string | null {
  return formatModelAttributionLabel({
    modelId,
    inferenceSource,
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
      await loadBuilderBillingStatus(session);
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
        setResourceSuccess,
        setOpenResourceEmbedId,
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
        setResourceSuccess,
        setOpenResourceEmbedId,
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
  });
  const canonicalSessionUserId = useMemo(
    () => resolveAuthSubject(session),
    [session?.access_token, session?.id_token, session?.user?.id],
  );
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
  const [cloudProfile, setCloudProfile] = useState<UserProfileDetail | null>(null);
  const profileUi = useWebProfileSettingsUiController({
    profileStorageUserId,
    initialProfileDraft,
    session: session,
    cloudProfile,
  });

  const publicCommunityUi = useWebPublicCommunityUiController<
    PublicCommunityRecord,
    PublicPlanSummary,
    CommunityAccess,
    MyCommunityJoinRequest
  >();
  const billingUi = useWebBillingUiController<
    BuilderBillingStatus,
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
    builderBillingStatus,
    setBuilderBillingStatus,
    setIsLoadingBuilderBilling,
    builderBillingError,
    setBuilderBillingError,
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
    isSettingDevBuilderTier,
    setIsSettingDevBuilderTier,
    devBuilderTierError,
    setDevBuilderTierError,
    isStartingBuilderCheckout,
    setIsStartingBuilderCheckout,
    isOpeningBuilderBillingPortal,
    setIsOpeningBuilderBillingPortal,
    isStartingBuilderConnectOnboarding,
    setIsStartingBuilderConnectOnboarding,
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
  const workspaceCreditLoadRequestIdRef = useRef(0);
  const lastTrackedAuthSessionUserIdRef = useRef<string | null>(null);
  const lastTrackedBuilderReturnKeyRef = useRef<string | null>(null);
  const [isBuilderUpgradeOpen, setIsBuilderUpgradeOpen] = useState(false);
  const [builderUpgradeContext, setBuilderUpgradeContext] = useState<BuilderUpgradeContext>("builder");
  const [builderConnectReturn, setBuilderConnectReturn] = useState<BuilderConnectReturn | null>(null);
  const [builderBillingReturn, setBuilderBillingReturn] = useState<BuilderBillingReturn | null>(null);
  const [, setIsFinalizingBuilderReturn] = useState(false);
  const lastAutoRedeemPendingPurchasesUserIdRef = useRef<string | null>(null);
  const autoRedeemPendingPurchasesAttemptRef = useRef(0);
  const autoRedeemPendingPurchasesTimeoutRef = useRef<number | null>(null);

  const [modelToggles, setModelToggles] = useState<ModelToggle[]>(DEFAULT_MODEL_TOGGLES);
  const [modelProviderById, setModelProviderById] = useState<Record<string, string>>({});
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
  const [isLoadingResources, setIsLoadingResources] = useState(false);
  const [openResourceEmbedId, setOpenResourceEmbedId] = useState<string | null>(null);
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
    resourceSuccess,
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
    setResourceSuccess,
    resourceModalProps,
  } = useWebCommunityResourceUiController<AuthSession, CommunityResource>({
    activeCommunityId,
    session: session,
    ensureSession: ensureUsableAuthSession,
    parseEmbedUrl,
    setCommunityResources,
    setIsLoadingResources,
  });

  const [communityAnalyticsSummary, setCommunityAnalyticsSummary] = useState<CommunityAnalyticsSummary>({
    total_members: null,
    new_members_window: null,
    active_members_window: null,
    retention_window: null,
    total_resources: null,
    resources_added_window: null,
  });
  const [communityAnalyticsSeries, setCommunityAnalyticsSeries] = useState<AnalyticsPoint[]>([]);
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
    communityAgentConfigSystemPrompt,
    setCommunityAgentConfigSystemPrompt,
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
    reconnectingCommunityAppMountId,
    removingCommunityAppMountId,
    communityAppMountsLoadedCommunityIdRef,
    clearCommunityAppMounts,
    loadCommunityAppMounts,
    connectCommunityApp,
    updateCommunityAppMount,
    refreshCommunityApp,
    reconnectCommunityApp,
    unmountCommunityApp,
  } = useWebCommunityAppMountsController<AuthSession>({
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
    updateUserPlatformAppMount,
    refreshUserPlatformApp,
    reconnectUserPlatformApp,
    unmountUserPlatformApp,
  } = useWebUserPlatformAppMountsController<AuthSession>({
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
  const initialWorkspaceWantsNewChat = Boolean(
    initialAppRoute &&
      initialAppRoute.page === "workspace" &&
      initialAppRoute.view === "home" &&
      initialAppRoute.threadId === null,
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      preloadWebSettingsPanels();
      preloadWebCommunitySecondaryPanels();
    }, 600);
    return () => window.clearTimeout(timer);
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
    setActiveThreadId(nextThreadId);
    setWorkspaceWantsNewChatMode(
      nextAppRoute.page === "workspace" && nextAppRoute.view === "home" && nextThreadId === null,
    );
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
    activeModelId,
    modelToggles,
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
  } | null>(null);
  const [isInferenceIssueModalRunning] = useState(false);
  const [userMemorySettings, setUserMemorySettings] = useState<UserMemorySettings>({
    memory_mode: "auto",
    remember_intent_enabled: true,
  });
  const [communityAiAgentPreferredTab, setCommunityAiAgentPreferredTab] = useState<
    "workspace" | "apps" | "skills"
  >("workspace");
  const [, setIsLoadingUserMemorySettings] = useState(false);
  const [openRouterConnection, setOpenRouterConnection] = useState<CloudOpenRouterConnectionStatus>({
    provider: "openrouter",
    auth_kind: "api_key",
    connected: false,
    key_last_four: null,
    validated_at: null,
    updated_at: null,
  });
  const [isLoadingOpenRouterConnection, setIsLoadingOpenRouterConnection] = useState(false);
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
  const [isLoadingChatgptConnection, setIsLoadingChatgptConnection] = useState(false);
  const [hasResolvedProviderConnections, setHasResolvedProviderConnections] = useState(false);
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
    profileBio: profileUi.profileBio,
    profileAvatarUrl: profileUi.profileAvatarUrl,
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
    setProfileBio: profileUi.setProfileBio,
    setProfileAvatarUrl: profileUi.setProfileAvatarUrl,
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
    communityAgentConfigSystemPrompt,
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

  const handleConnectCommunityApp = useCallback(
    async (input: ConnectCommunityAppInput) => {
      return await connectCommunityApp(input);
    },
    [connectCommunityApp],
  );

  const handleConnectUserPlatformApp = useCallback(
    async (input: {
      name: string;
      endpoint_url: string;
      auth_type: "none" | "api_key" | "bearer";
      description?: string;
      secret?: string;
    }) => {
      return await connectUserPlatformApp(input);
    },
    [connectUserPlatformApp],
  );

  const handleUpdateUserPlatformAppMount = useCallback(
    async (
      userPlatformAppMountId: string,
      patch: {
        enabled?: boolean;
        enabledTools?: string[];
      },
    ) => {
      return await updateUserPlatformAppMount(userPlatformAppMountId, patch);
    },
    [updateUserPlatformAppMount],
  );

  const handleRefreshUserPlatformApp = useCallback(
    async (userPlatformAppMountId: string) => {
      return await refreshUserPlatformApp(userPlatformAppMountId);
    },
    [refreshUserPlatformApp],
  );

  const handleReconnectUserPlatformApp = useCallback(
    async (userPlatformAppMountId: string, secret: string) => {
      return await reconnectUserPlatformApp(userPlatformAppMountId, secret);
    },
    [reconnectUserPlatformApp],
  );

  const handleUnmountUserPlatformApp = useCallback(
    async (userPlatformAppMountId: string) => {
      return await unmountUserPlatformApp(userPlatformAppMountId);
    },
    [unmountUserPlatformApp],
  );

  const handleUpdateCommunityAppMount = useCallback(
    async (
      communityAppMountId: string,
      patch: {
        enabled?: boolean;
        enabledTools?: string[];
      },
    ) => {
      return await updateCommunityAppMount(communityAppMountId, patch);
    },
    [updateCommunityAppMount],
  );

  const handleUnmountCommunityApp = useCallback(
    async (communityAppMountId: string) => {
      return await unmountCommunityApp(communityAppMountId);
    },
    [unmountCommunityApp],
  );

  const handleRefreshCommunityApp = useCallback(
    async (communityAppMountId: string) => {
      return await refreshCommunityApp(communityAppMountId);
    },
    [refreshCommunityApp],
  );

  const handleReconnectCommunityApp = useCallback(
    async (communityAppMountId: string, secret: string) => {
      return await reconnectCommunityApp(communityAppMountId, secret);
    },
    [reconnectCommunityApp],
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
              : "Failed to load workspace credits.";
        console.warn("Workspace credit balance refresh failed:", error);
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
    if (!hasBuilderTierPaidAccess(builderBillingStatus?.builder_tier ?? "free")) return;
    void loadWorkspaceCreditBalance(session);
  }, [activeView, builderBillingStatus?.builder_tier, session, loadWorkspaceCreditBalance, settingsGroup]);

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
    setBuilderConnectReturn,
    setBuilderBillingReturn,
    buildAppRoutePath: (state) => applyShellVariantToAppPath(buildAppRoutePath(state) ?? "", shellVariant) || null,
  });

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
    setProfileBio: profileUi.setProfileBio,
  });

  // Cloud session is hydrated from browser auth continuity during lifecycle bootstrap.

  useEffect(() => {
    setCloudProfile(null);
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
    return {
      ...profilesByUserId,
      [canonicalSessionUserId]: {
        user_id: canonicalSessionUserId,
        display_name: cloudProfile.display_name,
        avatar_url: cloudProfile.avatar_url,
      },
    } satisfies Record<string, UserProfile>;
  }, [canonicalSessionUserId, cloudProfile, profilesByUserId]);

  useEffect(() => {
    if (!session || activePage !== "community" || visibleCommunityProfileIds.length === 0) return;
    const refreshVisibleProfiles = () => {
      void loadUserProfiles(visibleCommunityProfileIds, session);
      void loadSelfProfile(session);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshVisibleProfiles();
      }
    };
    refreshVisibleProfiles();
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
    if (!activeThreadId) return;
    const threadModelId = threads.find((t) => t.id === activeThreadId)?.model_id ?? null;
    if (threadModelId) setActiveModelId(threadModelId);
  }, [activeThreadId, threads]);

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
      activePage === "discover";
    if (!shouldLoadCommunityApps) return;
    if (!session || !activeCommunityId || !canManageMembersActiveCommunity) {
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
        const modelId = payload.model_id.trim();
        if (!modelId) return;
        setActiveModelId(modelId);
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
        setActiveView("settings");
        setSettingsPage("account");
        showAppToastMessage("Add your OpenRouter key in Settings to finish connecting.");
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
      start_builder_checkout: (payload) => {
        void startBuilderPlanCheckout(payload.tier, { context: payload.context });
      },
      redeem_pending_purchases: (payload) => {
        void redeemPendingPurchases({ navigate: payload.navigate, silentNoop: payload.silent_noop });
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
      setOpenRouterConnection(connections.openrouter);
      setChatgptConnection(connections.chatgpt);
    },
    chatgptSecuritySettingsUrl: CHATGPT_SECURITY_SETTINGS_URL,
    getReturnToPath: () => `${window.location.pathname}${window.location.search}`,
  });
  const { applyProviderConnectionLoadError } = providerConnectionUi;

  const loadOpenRouterConnection = useCallback(async (session: AuthSession): Promise<void> => {
    const usableSession = await ensureUsableAuthSession(session);
    if (!usableSession) return;
    setIsLoadingOpenRouterConnection(true);
    setIsLoadingChatgptConnection(true);
    try {
      const result = await loadCloudProviderConnections({
        session: usableSession,
      });
      setOpenRouterConnection(result.openrouter);
      setChatgptConnection(result.chatgpt);
      applyProviderConnectionLoadError(null);
    } catch (error) {
      const message = formatProviderConnectionErrorMessage(error, "Failed to load provider connections.");
      applyProviderConnectionLoadError(message);
    } finally {
      setIsLoadingOpenRouterConnection(false);
      setIsLoadingChatgptConnection(false);
    }
  }, [applyProviderConnectionLoadError, ensureUsableAuthSession]);

  useEffect(() => {
    if (!session) {
      navStackRef.current = [];
      setUserMemorySettings({ memory_mode: "auto", remember_intent_enabled: true });
      setOpenRouterConnection({
        provider: "openrouter",
        auth_kind: "api_key",
        connected: false,
        key_last_four: null,
        validated_at: null,
        updated_at: null,
      });
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
      setIsLoadingOpenRouterConnection(false);
      setIsLoadingChatgptConnection(false);
      setHasResolvedProviderConnections(false);
      return;
    }
    setHasResolvedProviderConnections(false);
    void (async () => {
      const usableSession = await ensureUsableAuthSession(session);
      if (!usableSession) return;
      try {
        await Promise.all([
          loadUserMemorySettings(usableSession),
          loadOpenRouterConnection(usableSession),
        ]);
      } finally {
        setHasResolvedProviderConnections(true);
      }
    })();
  }, [session, loadOpenRouterConnection]);

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

  const { openBuilderPlanPortal, startBuilderPlanCheckout, startBuilderConnectOnboarding } =
    useWebBuilderBillingActions({
      getSession: () => sessionRef.current,
      ensureSession: ensureUsableAuthSession,
      requireSignIn: (intent) => requireSignIn(intent),
      onCheckoutStarted: ({ tier, context }) => {
        markPendingAnalyticsReturn("builder_checkout", {
          requested_tier: tier,
          billing_context: context,
        });
        captureProductAnalyticsEvent("builder checkout started", {
          requested_tier: tier,
          billing_context: context,
          surface: "billing",
        });
      },
      onPortalOpened: ({ context }) => {
        captureProductAnalyticsEvent("builder billing portal opened", {
          billing_context: context,
          surface: "account_settings",
        });
      },
      onConnectOnboardingStarted: ({ context, communitySlug }) => {
        captureProductAnalyticsEvent("builder stripe connect onboarding started", {
          billing_context: context,
          community_slug: communitySlug,
          surface: context === "community" ? "community_settings" : "account_settings",
        });
      },
      setBuilderBillingError,
      setIsStartingBuilderCheckout,
      setIsOpeningBuilderBillingPortal,
      setIsStartingBuilderConnectOnboarding,
      navigateToUrl: (url) => window.location.assign(url),
    });

  const {
    redeemPurchaseClaim,
    loadPendingPurchaseClaims,
    loadBuilderBillingStatus,
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
    setIsLoadingBuilderBilling,
    setBuilderBillingError,
    setBuilderBillingStatus,
    redeemPendingPurchasesInFlightRef,
  });

  async function setDevBuilderTier(tier: "free" | "builder" | "architect"): Promise<void> {
    const session = await ensureUsableAuthSession();
    if (!session || !canUseDevTierOverride) return;
    setIsSettingDevBuilderTier(true);
    setDevBuilderTierError(null);
    try {
      await setDevBuilderTierCanonical({
        session,
        tier,
      });
      await loadBuilderBillingStatus(session);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to set dev builder tier.";
      setDevBuilderTierError(message);
    } finally {
      setIsSettingDevBuilderTier(false);
    }
  }

  const startWorkspaceCreditTopupCheckout = useCallback(async (): Promise<void> => {
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
      });
      window.location.assign(checkoutUrl);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to start workspace credit top-up checkout.";
      setWorkspaceCreditTopupError(message);
    } finally {
      setIsStartingWorkspaceCreditTopupCheckout(false);
    }
  }, [ensureUsableAuthSession, requireSignIn]);

  const communityUi = useWebCommunityUiController<
    AuthSession,
    CommunityRecord,
    BuilderBillingStatus,
    AppPage,
    AppView,
    CommunityTab
  >({
    ...authenticatedSessionArg,
    communities,
    communityRoleById,
    builderBillingStatus,
    builderBillingError,
    activeCommunity,
    activeCommunityId,
    communityInitials,
    loadBuilderBillingStatus,
    persistCreateCommunityIntent,
    onStartUpgradeFlow: () => {
      setBuilderUpgradeContext("create_community");
      setIsBuilderUpgradeOpen(true);
    },
    onPrimaryUnauthenticated: (draft) => {
      requireSignIn({ reason: "create_community", payload: { draft } });
    },
    onCreateUnauthenticated: (draft) => {
      requireSignIn({ reason: "create_community", payload: { draft } });
    },
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
    resumeCreateCommunityIntent,
    openDeleteCommunityModal,
  } = communityUi;

  const resumePendingCreateCommunityIntent = useCallback((): void => {
    const intent = readAuthResumeState()?.intent;
    if (!intent || intent.reason !== "create_community") return;
    clearAuthResumeState();
    resumeCreateCommunityIntent(intent.payload.draft ?? null);
  }, [resumeCreateCommunityIntent]);

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
    publicJoinMode,
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
    builderBillingReturn,
    builderBillingStatus,
    communities,
    communityRoleById,
    lastAutoRedeemPendingPurchasesUserIdRef,
    autoRedeemPendingPurchasesAttemptRef,
    autoRedeemPendingPurchasesTimeoutRef,
    setBuilderBillingStatus,
    setBuilderBillingError,
    setIsLoadingBuilderBilling,
    setIsFinalizingBuilderReturn,
    clearBuilderBillingReturn: () => setBuilderBillingReturn(null),
    getAuthUid: getAuthUid,
    redeemPurchaseClaim,
    redeemPendingPurchases,
    loadPendingPurchaseClaims,
    loadBuilderBillingStatus,
    joinPublicCommunity,
    resumeCreateCommunityIntent: resumePendingCreateCommunityIntent,
  });

  useWebPostAuthStripeConnectLifecycle({
    session,
    builderConnectReturn,
    clearBuilderConnectReturn: () => setBuilderConnectReturn(null),
    setBuilderBillingError,
    loadBuilderBillingStatus,
    startBuilderConnectOnboarding,
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

  async function ingestWorkspaceAttachmentsFromFileList(
    files: FileList,
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
    for (const file of picked) {
      if (!file) continue;
      const name = (file.name ?? "").trim() || "attachment";
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
      // Fallback: allow unknown files to be attached as name-only (no preview yet).
      next.push(base);
    }

    return [...existing, ...next];
  }

  async function ingestCommunityAttachmentsFromFileList(
    files: FileList,
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
    for (const file of picked) {
      if (!file) continue;
      const name = (file.name ?? "").trim() || "attachment";
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

  const hasPaidAccess = Boolean(session) && hasBuilderTierPaidAccess(builderBillingStatus?.builder_tier ?? "free");
  const hasUserKeyConnection = Boolean(session) && openRouterConnection.connected;
  const hasUserChatgptConnection = Boolean(session) && chatgptConnection.connected;
  const hasPendingChatgptAuth = providerConnectionUi.hasPendingChatgptAuth;
  const shouldShowEmptyThreadChatgptCard =
    Boolean(session) &&
    hasResolvedProviderConnections &&
    !hasUserChatgptConnection &&
    !isLoadingChatgptConnection;

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
    extractRememberIntent,
    extractTextFromContentJson,
    storeGuestThreadStorage,
    workspaceWantsNewChat,
    isSendingMessage,
    isThreadRunActive,
    activeThreadId,
    threadMessages,
    threads,
    activeModelId,
    modelToggles,
    userMemoryRememberEnabled:
      userMemorySettings.memory_mode !== "off" && userMemorySettings.remember_intent_enabled !== false,
    builderTier: builderBillingStatus?.builder_tier ?? null,
    hasPaidAccess:
      Boolean(session) &&
      hasBuilderTierPaidAccess(builderBillingStatus?.builder_tier ?? "free"),
    loadBuilderBillingStatus,
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
    setBuilderUpgradeContext: (next) => setBuilderUpgradeContext(next as BuilderUpgradeContext),
    setBuilderBillingError,
    setIsBuilderUpgradeOpen,
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
    setAuthError,
  });

  const normalizedBuilderTier = useMemo<"free" | "builder" | "architect">(
    () => normalizeBuilderTierForUi(builderBillingStatus?.builder_tier),
    [builderBillingStatus?.builder_tier],
  );
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
        builderTier: builderBillingStatus?.builder_tier ?? null,
        userEmail: session?.user?.email ?? null,
      }),
    [session, builderBillingStatus?.builder_tier],
  );

		  const activeCommunityJoinMode = useMemo<CommunityJoinMode | null>(() => {
		    if (!activeCommunity) return null;
        return deriveCommunityJoinMode({
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
    activeCommunityJoinMode,
    canPostMessagesActiveCommunity,
    normalizedBuilderTier,
    requireSignIn: () => requireSignIn(),
    showAppToastMessage,
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
  const workspaceModelState = useWebWorkspaceModelStateController<AuthSession>({
    session: session,
    activeThreadId,
    activeThreadModelId: activeThread?.model_id,
    activeModelId,
    setActiveModelId,
    guestModelId,
    setGuestModelId,
    modelToggles,
    modelProviderById,
    hasPaidAccess,
    hasUserKeyConnection,
    hasUserChatgptConnection,
    updateThreadModel,
    showAppToastMessage,
    requireSignIn,
    openModelProviderSettings: (message) => {
      setActiveView("settings");
      setSettingsPage("account");
      showAppToastMessage(message);
    },
    connectChatgpt: () => {
      void providerConnectionUi.handleConnectChatgpt();
    },
    loadGuestThreadStorage,
    storeGuestThreadStorage: (storage) => {
      storeGuestThreadStorage(storage as GuestThreadStorageV1);
    },
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
    builderTier: builderBillingStatus?.builder_tier,
    cloudProjects: workspace.state.projects,
    ensureSession: ensureUsableAuthSession,
    requireSignIn,
    onRequireBuilderUpgrade: () => {
      setBuilderUpgradeContext("builder");
      setBuilderBillingError("Upgrade to Builder to create additional projects.");
      setIsBuilderUpgradeOpen(true);
    },
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
            ? `Builder projects are capped at ${projectUiController.maxProjects}.`
            : projectUiController.isCreatingProject
              ? "Creating project…"
              : "Create a new project"
        }
        aria-label="Create a new project"
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
  const funnelPreviewJoinMode = deriveCommunityJoinMode({
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
      joinMode: funnelPreviewJoinMode,
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
    funnelPreviewJoinMode,
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
  }, [session]);

  useEffect(() => {
    updateSentryUiContext({
      authState: session ? "authenticated" : "anonymous",
      userId: canonicalSessionUserId,
      builderTier: builderBillingStatus?.builder_tier ?? null,
      pathname:
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}${window.location.hash}`
          : null,
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
      builderTier: builderBillingStatus?.builder_tier ?? null,
      pathname:
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}${window.location.hash}`
          : null,
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
    builderBillingStatus?.builder_tier,
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
    if (!builderBillingReturn) return;
    const captureKey = [
      builderBillingReturn.status,
      builderBillingReturn.source,
      builderBillingReturn.context,
    ].join(":");
    if (lastTrackedBuilderReturnKeyRef.current === captureKey) return;
    lastTrackedBuilderReturnKeyRef.current = captureKey;

    if (builderBillingReturn.status === "cancel") {
      clearPendingAnalyticsReturn("builder_checkout");
      return;
    }
    if (builderBillingReturn.status !== "success") return;
    const pending = consumePendingAnalyticsReturn("builder_checkout");
    if (!pending) return;
    captureProductAnalyticsEvent("builder checkout succeeded", {
      requested_tier: pending.requested_tier,
      billing_context: builderBillingReturn.context,
      billing_source: builderBillingReturn.source,
      surface: "billing",
    });
  }, [builderBillingReturn]);

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
      hasBuilderAccess: hasBuilderTierPaidAccess(builderBillingStatus?.builder_tier ?? "free"),
      openCreateCommunityModal: () => openCreateCommunityModal(),
      setBuilderUpgradeContext,
      setIsBuilderUpgradeOpen,
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
      builderBillingStatus,
      builderBillingError,
      startBuilderConnectOnboarding,
      isStartingBuilderConnectOnboarding,
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
        handleSaveCommunityAgentConfig,
        handleResetCommunityAgentConfig,
        isSavingCommunityAgentConfig,
        communityAgentConfigSaveError,
        communityAgentConfigLanding,
        setCommunityAgentConfigLanding,
        markCommunityAgentConfigDirty,
        communityAgentConfigSystemPrompt,
        setCommunityAgentConfigSystemPrompt,
        previewCommunityName: activeCommunity?.name ?? "Community",
        previewProjectName: workspace.derived.resolvedActiveProjectName,
      },
      aiAgentAppsEditorProps: {
        intro: "Connect hosted MCP apps here so this community lens loads real capabilities into the platform harness.",
        emptyState: "Connect the first hosted MCP app to this community. Once mounted here, it becomes part of the community context whenever members switch into this lens.",
        addButtonLabel: "Connect MCP app",
        mounts: communityAppMounts,
        isLoading: isLoadingCommunityAppMounts,
        error: communityAppMountError,
        mutationError: communityAppMutationError,
        isConnecting: isConnectingCommunityApp,
        updatingMountId: updatingCommunityAppMountId,
        refreshingMountId: refreshingCommunityAppMountId,
        reconnectingMountId: reconnectingCommunityAppMountId,
        removingMountId: removingCommunityAppMountId,
        onConnectApp: handleConnectCommunityApp,
        onUpdateMount: handleUpdateCommunityAppMount,
        onRefreshApp: handleRefreshCommunityApp,
        onReconnectApp: handleReconnectCommunityApp,
        onUnmountApp: handleUnmountCommunityApp,
      },
      aiAgentSkillsEditorProps: {
        intro: "Attach reusable skill packages here so this community lens can load behavior units on demand without bloating the base prompt.",
        emptyState: "Attach the first skill package to this community. Attached skills become available when members explicitly mention them in this lens.",
        addButtonLabel: "Create and attach",
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
        previewJoinMode: funnelPreviewJoinMode,
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
        resourceSuccess,
        resources: communityResources,
        openResourceEmbedId,
      },
      resourcesActions: {
        setOpenResourceEmbedId,
        openNewResourceModal,
        handleEditResource,
        handleDeleteResource,
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
      resourceModalProps,
      canPostMessagesActiveCommunity,
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
        title: communityVoiceIntent.title,
        onClick: () => void handleVoiceInputClick("community"),
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
      isLoadingChatgptConnection,
      chatgptConnection,
      hasPendingChatgptAuth,
      isLoadingOpenRouterConnection,
      openRouterConnection,
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
      openBuilderUpgrade: (context) => {
        setBuilderUpgradeContext(context);
        setIsBuilderUpgradeOpen(true);
      },
      openBuilderBillingPortal: () => {
        void openBuilderPlanPortal({ context: "builder" });
      },
      startBuilderConnectOnboarding: (opts) => {
        void startBuilderConnectOnboarding({
          context: opts?.context ?? "account",
          communitySlug: opts?.communitySlug ?? null,
        });
      },
      canUseDevTierOverride,
      setDevBuilderTier,
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
      openBuilderUpgrade: (context) => {
        setBuilderUpgradeContext(context);
        setIsBuilderUpgradeOpen(true);
      },
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
      userPlatformAppMounts,
      isLoadingUserPlatformAppMounts,
      userPlatformAppMountError,
      userPlatformAppMutationError,
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
    ? (attentionByCommunityId[activeCommunityId] ?? { chat: false, ai_feed: false, resources: false })
    : { chat: false, ai_feed: false, resources: false };
  const activeCommunityAttentionCount =
    Number(Boolean(activeCommunityAttentionSummary.chat || (activePage === "community" && activeCommunityId && unreadCount > 0))) +
    Number(Boolean(activeCommunityAttentionSummary.ai_feed)) +
    Number(Boolean(activeCommunityAttentionSummary.resources));
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
    return <WebStandalonePublicRouteShell {...standalonePublicRouteViewProps} />;
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
    builderBillingStatus,
    setBuilderUpgradeContext,
    setBuilderBillingError,
    setIsBuilderUpgradeOpen,
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
    setInferenceIssueModal,
    setActiveView,
    setSettingsPage,
    threads,
    enterWorkspaceThread,
    requestModelPickerOpen: workspace.actions.requestModelPickerOpen,
    isBuilderUpgradeOpen,
    builderUpgradeContext,
    isStartingBuilderCheckout,
    builderBillingError,
    startBuilderPlanCheckout,
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
    shouldShowEmptyThreadChatgptCard,
    isConnectingChatgpt: providerConnectionUi.isConnectingChatgpt,
    hasPendingChatgptAuth,
    isPollingChatgptConnection: providerConnectionUi.isPollingChatgptConnection,
    onConnectChatgpt: () => {
      void providerConnectionUi.handleConnectChatgpt();
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
    curatedPickerModels: workspace.derived.curatedPickerModels,
    selectedPickerModelId: workspace.derived.selectedPickerModelId,
    modelToggles,
    hasUserKeyConnection: workspace.derived.hasUserKeyConnection,
    hasUserChatgptConnection: workspace.derived.hasUserChatgptConnection,
    canSelectPickerModel: workspace.derived.canSelectPickerModel,
    onSelectPickerModel: workspace.actions.selectPickerModel,
    workspaceVoiceUiState,
    workspaceVoiceTitle: workspaceVoiceIntent.title,
    onWorkspaceVoiceClick: () => void handleVoiceInputClick("workspace"),
    modelPickerOpenRequestKey: workspace.state.modelPickerOpenRequestKey,
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

  const mainSurfaceHostProps = buildWebAppMainSurfaceHostProps({
    activePage,
    isPublicCommunityFunnel,
    publicRoute: shellPublicRoute,
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
      workspaceHostProps,
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
  const mainSurface = <WebAppMainSurfaceHost {...mainSurfaceHostProps} />;
  const activeIndicators = activeCommunityId
    ? (attentionByCommunityId[activeCommunityId] ?? { chat: false, ai_feed: false, resources: false })
    : { chat: false, ai_feed: false, resources: false };
  const localActiveCommunityChatAttention = Boolean(activePage === "community" && activeCommunityId && unreadCount > 0);
  const communityTabIndicators = {
    chat: Boolean(activeIndicators.chat || localActiveCommunityChatAttention),
    ai_feed: Boolean(activeIndicators.ai_feed),
    resources: Boolean(activeIndicators.resources),
  };
  const communityRailAttentionById: Record<string, boolean> = {};
  for (const [communityId, indicators] of Object.entries(attentionByCommunityId)) {
    if (indicators.chat || indicators.ai_feed || indicators.resources) {
      communityRailAttentionById[communityId] = true;
    }
  }
  if (activeCommunityId && localActiveCommunityChatAttention) {
    communityRailAttentionById[activeCommunityId] = true;
  }
  const shellChromeHostProps = buildWebShellChromeHostProps({
    showHeaderIslands,
    isSessionsDrawerOpen,
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
    hasBuilderAccess: hasBuilderTierPaidAccess(builderBillingStatus?.builder_tier ?? "free"),
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
    setBuilderUpgradeContext,
    setIsBuilderUpgradeOpen,
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
