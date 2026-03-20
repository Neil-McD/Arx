import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type SetStateAction } from "react";
import "highlight.js/styles/github-dark.css";
import {
  bootstrapCloudSession, clearPersistedCloudSession, clearCloudAuthFlowPending, clearCloudSignedOutIntentMarker, completeCloudOAuthCallback, ensureCloudSessionForRequest, ensureCloudSessionForRequestResult, fetchWithCloudAuthShared, fetchWithCloudPublicShared, getOAuthRedirectUrl, getCloudAuthUid, getCloudAnonKey, getCloudUrl, hasRecentCloudAuthFlowPending, markCloudAuthFlowPending, parseCloudOAuthCallbackFromLocation, readCloudError, sendCloudMagicLinkOtp, CLOUD_SIGNED_OUT_INTENT_KEY, CLOUD_SIGNED_OUT_TAB_INTENT_KEY, refreshCloudSessionWithLockResult, refreshCloudSessionResult, type CloudSession as CloudAuthSession, type CloudAuthSessionRefreshResult
} from "./cloudAuth";
import {
  captureBrandosAidFromLocation, clearPendingPurchaseClaimToken, getBrandosAidForCommunitySlug, readPendingPurchaseClaimToken, storePendingPublicJoin, storePendingPurchaseClaimToken, type PendingPurchaseClaim
} from "../../../shared/pay_first";
import {
  readProfileDraftForUser, writeProfileDraftForUser, } from "../../../shared/profileDraftStorage";
import {
  buildContextFallbackThreadTitle, deriveThreadTitleFromUserText, isMissingThreadTitleValue, traceThreadContext, } from "../../../shared/threadTitleUi";
import {
  buildProjectByIdMap, buildProjectThreadGroups, filterVisibleThreads, resolveCloudThreadProjectId as resolveCloudThreadProjectIdShared, resolveDefaultWorkspaceProjectId, resolvePreferredCloudProjectId, searchThreads, } from "../../../shared/threadSidebarSelectors";
import {
  fetchMappedDaytonaCloudProjects, } from "../../../shared/daytonaCloudProjects";
import {
  isUuid, } from "../../../shared/appIdentity";
import {
  isLikelyImageFile, isLikelyTextFile, isSupportedChatRasterImage, readChatImageAsDataUrl, readTextAttachmentPreview, } from "../../../shared/attachmentHelpers";
import {
  type CreateCommunityIntentDraft,
} from "../../../shared/createCommunityIntent";
import {
  DEFAULT_EMPTY_THREAD_LANDING, normalizeCommunityAgentDraftForSave, normalizeCommunityAgentLanding, type CommunityAgentLanding, } from "../../../shared/communityAgentLanding";
import {
  DEFAULT_COMMUNITY_FUNNEL_CONFIG,
  normalizeCommunityFunnelConfig,
} from "../../../shared/communityFunnel";
import {
  buildCsv, dateKeyLocal, formatChatTime, formatCount, formatMoneyBaseUnits, formatPercent, formatRelativeTimeFromIso as formatRelativeTime, parseContentRangeTotal, } from "../../../shared/contentFormatting";
import {
  formatBuilderTierLabel, hasBuilderTierPaidAccess, isBuilderTierFree, normalizeBuilderTierForUi, formatPlanPrice, formatSubscriptionPrice, type BuilderBillingReturn, } from "../../../shared/builderBilling";
import { canUseCreatorDevTierOverride } from "../../../shared/devTierOverride";
import { useCheckoutFinalizeController } from "../../../shared/useCheckoutFinalizeController";

import {
  useCommunityAiFeedController,
} from "../../../shared/useCommunityAiFeedController";
import { uploadCloudCommunityChatAttachmentFile } from "../../../shared/cloudCommunityChatGateway";
import {
  saveCloudCommunityPublicPresentation,
} from "../../../shared/cloudCommunityFunnelGateway";
import { listEnabledCloudModelRegistryRows } from "../../../shared/cloudModelRegistryGateway";
import {
  beginCloudChatgptConnect,
  beginCloudChatgptManualConnect,
  completeCloudChatgptConnect,
  connectCloudOpenRouterApiKey,
  disconnectCloudChatgpt,
  disconnectCloudOpenRouterApiKey,
  loadCloudProviderConnections,
  pollCloudChatgptConnect,
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
  isCommunityRouteManagedTab,
  type SettingsPage,
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
  CommunityPricingMode as SharedCommunityPricingMode,
  DiscoverCommunitySnapshot as SharedDiscoverCommunitySnapshot,
  MessageReaction as SharedMessageReaction,
  PublicPlanSummary as SharedPublicPlanSummary,
  UserProfile as SharedUserProfile,
  UserProfileDetail as SharedUserProfileDetail,
} from "../../../shared/communityTypes";
import {
  deriveBackFromWorkspaceSettingsFallbackTransition,
  deriveBackToWorkspaceFallbackTransition,
  deriveOpenDiscoverTransition,
  deriveToggleWorkspaceSettingsTransition,
} from "../../../shared/appNavTransitions";
import {
  type AppRouteState,
  type PublicRoute,
  DEFAULT_POST_SIGN_IN_PATH,
  buildAppRoutePath,
  buildCommunityTabPath,
  buildCommunityFunnelPreviewPath,
  buildCommunityFunnelPreviewHistoryState,
  readAppRouteFromLocation,
  readPublicRouteFromLocation,
} from "../../../shared/webAppRouteState";
import {
  formatBackTargetLabel as formatBackTargetLabelShared,
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
  readAvatarFileAsSquareDataUrl,
  readBannerFileAsWideDataUrlWithinLimit,
} from "../../../shared/imageTransforms";
import {
  buildPendingAuthIntent,
  clearAuthReturnTo,
  clearPendingAuthIntent,
  parsePendingAuthIntentInput,
  readPendingAuthIntent,
  storeAuthReturnTo,
  storePendingAuthIntent,
  type BuilderUpgradeContext,
} from "../../../shared/cloudAuthIntent";
import { routePendingAuthIntent } from "../../../shared/cloudAuthIntentRouter";
import {
  beginGoogleSignIn as beginGoogleCloudSignIn,
  revokeAuthSessionRemote as revokeCloudSessionRemote,
  AUTH_SESSION_EXPIRED_MESSAGE as CLOUD_SESSION_EXPIRED_MESSAGE,
} from "../../../shared/authSessionFlow";
import { clearOAuthCallbackParamsFromLocation } from "../../../shared/cloudPkce";
import { resetWebSessionStateAfterSignOut } from "./auth/resetSessionState";
import { resolveUserAccessPolicy } from "../../../shared/capabilities";
import {
  DEFAULT_ACTIVE_MODEL_ID,
  DEFAULT_GUEST_MODEL_ID,
  FREE_MODEL_ALLOWLIST as SHARED_FREE_MODEL_ALLOWLIST,
  FREE_MODEL_LABELS as SHARED_FREE_MODEL_LABELS,
  getDefaultModelToggles,
  getFreeModelEntries,
  getSupportedFundingSourcesForModel,
  inferModelSection,
  isFreeModelId,
  isModelAvailableOnSurface,
  type ModelFundingSource,
  type ModelSectionId,
  type ModelToggle,
} from "../../../shared/modelCatalog";
import {
  APP_THEME_OPTIONS,
  parseAppTheme,
  type AppTheme,
} from "../../../shared/theme";
import { useLastClickWinsController } from "../../../shared/useLastClickWinsController";
import { ThreadSidebarPanel } from "../../../src/components/ThreadSidebarPanel";
import { useCommunityChatRealtime } from "../../../shared/useCommunityChatRealtime";
import { useCommunityChatViewport } from "../../../shared/useCommunityChatViewport";
import { useCommunityChatLightbox } from "../../../shared/useCommunityChatLightbox";
import { useMessageAttachmentInputController } from "../../../shared/useMessageAttachmentInputController";
import { useCommunityChatDataController } from "../../../shared/useCommunityChatDataController";
import { useCommunityChatMutationController } from "../../../shared/useCommunityChatMutationController";
import { useCommunityResourceController } from "../../../shared/useCommunityResourceController";
import { useCommunityResourceEditorController } from "../../../shared/useCommunityResourceEditorController";
import { useCommunityCreateController } from "../../../shared/useCommunityCreateController";
import { useCommunityDeleteController } from "../../../shared/useCommunityDeleteController";
import { useCommunityRailOrder } from "../../../shared/useCommunityRailOrder";
import { useRailPointerReorder } from "../../../shared/useRailPointerReorder";
import { useBuilderUpgradeScrollHint } from "../../../shared/useBuilderUpgradeScrollHint";
import { useWorkspaceAutoScroll } from "../../../shared/useWorkspaceAutoScroll";
import { useModelPickerController } from "../../../shared/useModelPickerController";
import { useModelPickerLifecycleEffects } from "../../../shared/useModelPickerLifecycleEffects";
import { useWebCommunityAccessController } from "../../../shared/useWebCommunityAccessController";
import { useWebDiscoverController } from "../../../shared/useWebDiscoverController";
import { useWebMemorySettingsDataController } from "../../../shared/useWebMemorySettingsDataController";
import { useWebMemoryMutationController } from "../../../shared/useWebMemoryMutationController";
import { useWebSendFlowController } from "../../../shared/useWebSendFlowController";
import { useWebThreadMutationController } from "../../../shared/useWebThreadMutationController";
import { useWebTurnRunnerController } from "../../../shared/useWebTurnRunnerController";
import type { ThreadStreamingRuntimeEvent, ThreadStreamingState } from "../../../shared/webTurnRunnerCore";
import { RuntimeToolTrace } from "./components/RuntimeToolTrace";
import { RuntimeWebSources } from "./components/RuntimeWebSources";
import { useWebWorkspaceActionsController } from "../../../shared/useWebWorkspaceActionsController";
import { useWebWorkspaceUiActionsController } from "../../../shared/useWebWorkspaceUiActionsController";
import { useWebSettingsImageUploadController } from "../../../shared/useWebSettingsImageUploadController";
import { useWebThreadDataController } from "../../../shared/useWebThreadDataController";
import { useAuthGateLifecycleEffects } from "../../../shared/useAuthGateLifecycleEffects";
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
import { AttachmentChipButton } from "../../../shared/AttachmentChipButton";
import {
  buildReplyPrefix,
  extractTextFromContentJson,
  parseMessageAttachments,
  parseReplyPrefix,
  truncateReplyPreview,
  type CommunityMessageAttachment,
} from "../../../shared/communityMessageParsing";
import {
  loadCachedCommunityChatMessages,
  saveCachedCommunityChatMessages,
} from "../../../shared/communityChatCache";
import { isValidCommunitySlug, slugifyCommunityName } from "../../../shared/communitySlug";
import {
  MessageCopyAction,
  MessageFooter,
  MessageSourcesAction,
} from "../../../shared/MessageFooterActions";
import {
  formatCommunityVisibilityLabel,
  isPublishedCommunityVisibility,
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
import { setDevBuilderTierCanonical } from "../../../shared/builderBillingStatusGateway";
import { formatUsdCents, toEpochSeconds } from "../../../shared/displayFormatting";
import { deriveCommunityJoinMode, type CommunityJoinMode } from "./communityJoinPolicy";
import { deriveCommunityMembersJoinReviewMode, type CommunityMembersJoinReviewMode } from "./communityJoinPolicy";
import { useWebBuilderBillingActions } from "./controllers/useWebBuilderBillingActions";
import { useWebCommerceAffiliateActions } from "./controllers/useWebCommerceAffiliateActions";
import { useWebPublicFunnelActions } from "./controllers/useWebPublicFunnelActions";
import { useWebAuthSessionLifecycle } from "./controllers/useWebAuthSessionLifecycle";
import { buildWebCommunitySecondaryPanelsProps } from "./controllers/buildWebCommunitySecondaryPanelsProps";
import { useWebGuestThreadLifecycle } from "./controllers/useWebGuestThreadLifecycle";
import { useWebCommunityPolynetController } from "./controllers/useWebCommunityPolynetController";
import { useWebPostAuthBillingLifecycle } from "./controllers/useWebPostAuthBillingLifecycle";
import { useWebPathRouteLifecycle } from "./controllers/useWebPathRouteLifecycle";
import { useWebCommunityRouteController } from "./controllers/useWebCommunityRouteController";
import { useWebActiveCommunityShellController } from "./controllers/useWebActiveCommunityShellController";
import { useWebJoinedCommunityRouteResolution } from "./controllers/useWebJoinedCommunityRouteResolution";
import { useWebPublicCommunityRouteController } from "./controllers/useWebPublicCommunityRouteController";
import { useWebRuntimeRunLifecycle } from "./controllers/useWebRuntimeRunLifecycle";
import { useWebWorkspaceRouteController } from "./controllers/useWebWorkspaceRouteController";
import { useWebThreadDiscoverChatLifecycle } from "./controllers/useWebThreadDiscoverChatLifecycle";
import { useWebUiPersistenceLifecycle } from "./controllers/useWebUiPersistenceLifecycle";
import { useWebVoiceInputController } from "../../../shared/useWebVoiceInputController";
import { useCommunityAgentLandingLifecycle } from "../../../shared/useCommunityAgentLandingLifecycle";
import { useCommunityAgentMembersLifecycle } from "../../../shared/useCommunityAgentMembersLifecycle";
import { useCommunityResourcesTabLifecycle } from "../../../shared/useCommunityResourcesTabLifecycle";
import { useCommunitySettingsAccessLifecycle } from "../../../shared/useCommunitySettingsAccessLifecycle";
import { VoiceInputButton } from "../../../shared/VoiceInputButton";
import { CommunityNav } from "../../../shared/CommunityNav";
import { BuilderUpgradeModal } from "../../../shared/BuilderUpgradeModal";
import { DiscoverCommunityCard } from "../../../shared/DiscoverCommunityCard";
import { SettingsNavList } from "../../../shared/SettingsNavList";
import { confirmDiscardUnsavedCommunitySettingsWeb } from "../../../shared/communityUnsavedGuard";
import {
  EXTERNAL_MEMORY_IMPORT_PROMPT,
  normalizeImportedMemoryContentKey,
  parseExternalMemoryImport,
  type ExternalMemoryImportItem,
} from "../../../shared/externalMemoryImport";
import { WebCreateCommunityModal } from "./components/WebCreateCommunityModal";
import { WebProfileSettingsSection } from "./components/WebProfileSettingsSection";
import { WebAccountSettingsSection } from "./components/WebAccountSettingsSection";
import { WebAgentSettingsSection } from "./components/WebAgentSettingsSection";
import { WebAppearanceSettingsSection } from "./components/WebAppearanceSettingsSection";
import { WebCommunityChatPanel } from "./components/WebCommunityChatPanel";
import { WebDeleteCommunityModal } from "./components/WebDeleteCommunityModal";
import { WebMessageContextModal } from "./components/WebMessageContextModal";
import { WebMemoryImportModal } from "./components/WebMemoryImportModal";
import { WebPlatformQuotaModal } from "./components/WebPlatformQuotaModal";
import { WebAuthGateModal } from "./components/WebAuthGateModal";
import { WebChatgptConnectModal } from "./components/WebChatgptConnectModal";
import { WebChatgptEmptyStateCard } from "./components/WebChatgptEmptyStateCard";
import { WebCommunitySecondaryPanels } from "./components/WebCommunitySecondaryPanels";
import { WebModelPickerPopover } from "./components/WebModelPickerPopover";
import { WebPublicCommunityFunnel } from "./components/WebPublicCommunityFunnel";
import { WebPublicRouteView } from "./components/WebPublicRouteView";

const GUEST_FREE_MODEL_LIMIT_MESSAGE =
  "Guest chat is hitting the free model limit right now. Sign in for ChatGPT Plus/Pro rate limits or connect your own key.";
const GUEST_FREE_MODEL_LIMIT_SHORT_MESSAGE = "Guest chat is hitting the free model limit right now.";

type CommunityRecord = {
  id: string;
  slug: string;
  name: string;
  one_liner: string | null;
  about: string | null;
  avatar_url: string | null;
  avatar_storage_id?: string | null;
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
  last_seq: number;
  created_at: number; // epoch seconds
  updated_at: number; // epoch seconds
};

type CloudProjectRecord = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string;
  created_at: number;
  updated_at: number;
  root_path: string;
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
type CommunityPricingMode = SharedCommunityPricingMode;
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

type BuilderBillingStatus = {
  user_id: string;
  builder_tier: "free" | "builder" | "architect";
  max_communities: number;
};

type NavSnapshot = {
  page: AppPage;
  view: AppView;
  settingsPage: SettingsPage;
  communityId: string | null;
  communitySlug: string | null;
  communityTab: CommunityTab;
  threadId: string | null;
  workspaceWantsNewChat: boolean;
  routePath: string;
};

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
  const GOOGLE_AUTH_START_SEARCH_PARAM = "auth_start";
  const GOOGLE_AUTH_START_SEARCH_VALUE = "google";
  const initialPublicRoute = readPublicRouteFromLocation();
  const initialAppRoute = initialPublicRoute.kind === "app" ? readAppRouteFromLocation() : null;

  const [cloudSession, setCloudSession] = useState<CloudAuthSession | null>(null);
  const [isAuthBootstrapComplete, setIsAuthBootstrapComplete] = useState(false);
  const cloudSessionArg = { session: cloudSession } as const;
  const profileStorageUserId = (cloudSession?.user?.id ?? "").trim() || null;
  const initialProfileDraft = useMemo(
    () => readProfileDraftForUser(profileStorageUserId),
    [profileStorageUserId],
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [magicLinkStatus, setMagicLinkStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null);

  const sessionRef = useRef<CloudAuthSession | null>(null);
  const refreshResultInFlightRef = useRef<Promise<CloudAuthSessionRefreshResult> | null>(null);
  const refreshTimeoutRef = useRef<number | null>(null);
  const didJustSignInRef = useRef(false);
  const authSessionEpochRef = useRef(0);
  const authBootstrapCompleteRef = useRef(false);
  const hasAutoStartedGoogleAuthRef = useRef(false);

  const markAuthBootstrapComplete = useCallback(() => {
    authBootstrapCompleteRef.current = true;
    setIsAuthBootstrapComplete(true);
  }, []);

  const readCurrentAuthReturnTo = useCallback((options?: { stripGoogleAuthStart?: boolean }): string => {
    const currentUrl = new URL(window.location.href);
    if (options?.stripGoogleAuthStart) {
      currentUrl.searchParams.delete(GOOGLE_AUTH_START_SEARCH_PARAM);
    }
    const search = currentUrl.searchParams.toString();
    return `${currentUrl.pathname}${search ? `?${search}` : ""}${currentUrl.hash}`;
  }, [GOOGLE_AUTH_START_SEARCH_PARAM]);

  const resolveCanonicalGoogleAuthStartUrl = useCallback((): string | null => {
    let canonicalOrigin: string;
    try {
      canonicalOrigin = new URL(getOAuthRedirectUrl(), window.location.origin).origin;
    } catch {
      return null;
    }
    if (!canonicalOrigin || canonicalOrigin === window.location.origin) return null;
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete(GOOGLE_AUTH_START_SEARCH_PARAM);
    const targetUrl = new URL(
      `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
      canonicalOrigin,
    );
    targetUrl.searchParams.set(GOOGLE_AUTH_START_SEARCH_PARAM, GOOGLE_AUTH_START_SEARCH_VALUE);
    return targetUrl.toString();
  }, [GOOGLE_AUTH_START_SEARCH_PARAM, GOOGLE_AUTH_START_SEARCH_VALUE]);

  const beginGoogleSignInFlow = useCallback(async () => {
    setAuthError(null);
    clearCloudSignedOutIntentMarker();
    markCloudAuthFlowPending();
    storeAuthReturnTo(readCurrentAuthReturnTo({ stripGoogleAuthStart: true }));
    const result = await beginGoogleCloudSignIn();
    if (!result.ok) {
      setAuthError(result.error);
      return;
    }
    window.location.assign(result.authUrl);
  }, [readCurrentAuthReturnTo]);

  async function resetSessionStateAfterSessionLoss(): Promise<void> {
    sessionRef.current = null;
    await resetWebSessionStateAfterSignOut({
      clearPersistedCloudSession: clearPersistedCloudSession,
      setCloudSession,
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
      setThreads,
      setThreadError,
      setThreadErrorById,
      setWorkspaceWantsNewChatMode,
      setActiveThreadId,
      setThreadMessages,
      setThreadSendingStateById,
      setThreadStreamingStateById,
      streamingAbortRef,
      streamingRafRef,
      streamingContentRef,
      setStreamingContent,
      setStreamingThreadId,
      setStreamingRunId,
      setStreamingMeta,
      setDiscoverCommunities,
    });
  }

  const expireCloudSessionLocally = useCallback(async (): Promise<void> => {
    authSessionEpochRef.current += 1;
    await resetSessionStateAfterSessionLoss();
  }, []);

  const refreshCloudSessionLockedResult = useCallback(async (): Promise<CloudAuthSessionRefreshResult> => {
    const epochAtRefreshStart = authSessionEpochRef.current;
    return await refreshCloudSessionWithLockResult({
      inFlightRef: refreshResultInFlightRef,
      refreshSession: () => refreshCloudSessionResult(),
      onRefreshed: (refreshed) => {
        if (authSessionEpochRef.current !== epochAtRefreshStart) return;
        setAuthError(null);
        setCloudSession(refreshed);
        sessionRef.current = refreshed;
      },
    });
  }, []);

  const refreshCloudSessionLocked = useCallback(async (): Promise<CloudAuthSession | null> => {
    const refreshed = await refreshCloudSessionLockedResult();
    return refreshed.status === "refreshed" ? refreshed.session : null;
  }, [refreshCloudSessionLockedResult]);

  const ensureUsableCloudSession = useCallback(async (
    session: CloudAuthSession | null | undefined = sessionRef.current ?? cloudSession,
  ): Promise<CloudAuthSession | null> => {
    const requestSession = session ?? null;
    if (!requestSession) return null;

    const ensured = await ensureCloudSessionForRequestResult(requestSession, refreshCloudSessionLockedResult);
    if (ensured.status === "terminal_failure") {
      await expireCloudSessionLocally();
      return null;
    }
    if (ensured.status !== "ready") {
      return null;
    }
    if (!sessionsEqual(ensured.session, requestSession)) {
      adoptCloudSession(ensured.session);
    }
    return sessionRef.current ?? ensured.session;
  }, [cloudSession, expireCloudSessionLocally, refreshCloudSessionLockedResult]);

  const authenticatedCloudSessionArg = {
    session: cloudSession,
    ensureSession: ensureUsableCloudSession,
  } as const;

  const [publicRoute, setPublicRoute] = useState<PublicRoute>(() => initialPublicRoute);

  const [activePage, setActivePage] = useState<AppPage>(() => initialAppRoute?.page ?? "workspace");
  const [activeView, setActiveView] = useState<AppView>(() => initialAppRoute?.view ?? "home");
  const [settingsPage, setSettingsPage] = useState<SettingsPage>(() => initialAppRoute?.settingsPage ?? "account");
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
  const [profileName, setProfileName] = useState(() => initialProfileDraft.name);
  const [profileUsername, setProfileUsername] = useState(() => initialProfileDraft.username);
  const [profileBio, setProfileBio] = useState(() => initialProfileDraft.bio);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(() => initialProfileDraft.avatarUrl);
  const [cloudProfile, setCloudProfile] = useState<UserProfileDetail | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);
  const profileSaveTimeoutRef = useRef<number | null>(null);
  const [isProfileAvatarDragOver, setIsProfileAvatarDragOver] = useState(false);

  const [publicCommunity, setPublicCommunity] = useState<PublicCommunityRecord | null>(null);
  const [publicCommunityPlans, setPublicCommunityPlans] = useState<PublicPlanSummary[]>([]);
  const [publicCommunityAccess, setPublicCommunityAccess] = useState<CommunityAccess | null>(null);
  const [publicCommunityError, setPublicCommunityError] = useState<string | null>(null);
  const [isLoadingPublicCommunity, setIsLoadingPublicCommunity] = useState(false);
  const [isJoiningPublicCommunity, setIsJoiningPublicCommunity] = useState(false);
  const [publicJoinError, setPublicJoinError] = useState<string | null>(null);
  const [myPublicCommunityJoinRequest, setMyPublicCommunityJoinRequest] = useState<MyCommunityJoinRequest | null>(null);
  const [isLoadingMyPublicCommunityJoinRequest, setIsLoadingMyPublicCommunityJoinRequest] = useState(false);

  const [pendingPurchaseClaims, setPendingPurchaseClaims] = useState<PendingPurchaseClaim[]>([]);
  const [isLoadingPendingPurchases, setIsLoadingPendingPurchases] = useState(false);
  const [pendingPurchasesError, setPendingPurchasesError] = useState<string | null>(null);
  const [isRedeemingPendingPurchases, setIsRedeemingPendingPurchases] = useState(false);
  const [pendingPurchasesSuccess, setPendingPurchasesSuccess] = useState<string | null>(null);
  const [, setIsPendingPurchasesBannerDismissed] = useState(false);

  const [builderBillingStatus, setBuilderBillingStatus] = useState<BuilderBillingStatus | null>(null);
  const [, setIsLoadingBuilderBilling] = useState(false);
  const [builderBillingError, setBuilderBillingError] = useState<string | null>(null);
  const [isSettingDevBuilderTier, setIsSettingDevBuilderTier] = useState(false);
  const [devBuilderTierError, setDevBuilderTierError] = useState<string | null>(null);
  const [isStartingBuilderCheckout, setIsStartingBuilderCheckout] = useState(false);
  const [isBuilderUpgradeOpen, setIsBuilderUpgradeOpen] = useState(false);
  const [builderUpgradeContext, setBuilderUpgradeContext] = useState<BuilderUpgradeContext>("builder");
  const [builderBillingReturn, setBuilderBillingReturn] = useState<BuilderBillingReturn | null>(null);
  const [, setIsFinalizingBuilderReturn] = useState(false);
  const builderUpgradeScrollRefreshToken = `${builderBillingStatus?.builder_tier ?? ""}:${builderUpgradeContext}`;
  const {
    builderUpgradeModalBodyRef,
    showBuilderUpgradeScrollHint,
    updateBuilderUpgradeScrollHint,
  } = useBuilderUpgradeScrollHint({
    isOpen: isBuilderUpgradeOpen,
    refreshToken: builderUpgradeScrollRefreshToken,
  });

  const [checkoutStatus, setCheckoutStatus] = useState<"idle" | "loading" | "pending" | "succeeded" | "error">("idle");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutClaimToken, setCheckoutClaimToken] = useState<string | null>(null);
  const [isRedeemingClaim, setIsRedeemingClaim] = useState(false);
  const [redeemClaimError, setRedeemClaimError] = useState<string | null>(null);
  const [manualClaimToken, setManualClaimToken] = useState("");
  const redeemPendingPurchasesInFlightRef = useRef(false);
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
  const [personalMemoryItems, setPersonalMemoryItems] = useState<PersonalMemoryItem[]>([]);
  const [personalMemoryQuery, setPersonalMemoryQuery] = useState("");
  const [personalMemoryError, setPersonalMemoryError] = useState<string | null>(null);
  const [isLoadingPersonalMemory, setIsLoadingPersonalMemory] = useState(false);
  const [newPersonalMemoryContent, setNewPersonalMemoryContent] = useState("");
  const newPersonalMemoryScope: "global" = "global";
  const [newPersonalMemoryPinned, setNewPersonalMemoryPinned] = useState(false);
  const [isMemoryImportModalOpen, setIsMemoryImportModalOpen] = useState(false);
  const [memoryImportText, setMemoryImportText] = useState("");
  const [memoryImportError, setMemoryImportError] = useState<string | null>(null);
  const [isImportingMemory, setIsImportingMemory] = useState(false);
  const memoryImportPlan = useMemo(() => {
    const parsedItems = parseExternalMemoryImport(memoryImportText);
    const existingKeys = new Set(personalMemoryItems.map((item) => normalizeImportedMemoryContentKey(item.content)));
    const uniqueKeys = new Set<string>();
    const uniqueItems: ExternalMemoryImportItem[] = [];
    let duplicateCount = 0;
    for (const item of parsedItems) {
      const key = normalizeImportedMemoryContentKey(item.memoryContent);
      if (!key) continue;
      if (existingKeys.has(key) || uniqueKeys.has(key)) {
        duplicateCount += 1;
        continue;
      }
      uniqueKeys.add(key);
      uniqueItems.push(item);
    }
    return {
      parsedItems,
      duplicateCount,
      uniqueItems,
    };
  }, [memoryImportText, personalMemoryItems]);
  const [isLoadingCommunities, setIsLoadingCommunities] = useState<boolean>(() => Boolean(cloudSession));
  const [communities, setCommunities] = useState<CommunityRecord[]>([]);
  const [communityRoleById, setCommunityRoleById] = useState<Record<string, string>>({});
  const [activeCommunityId, setActiveCommunityId] = useState<string | null>(() => initialAppRoute?.communityId ?? null);
  const [activeCommunitySlug, setActiveCommunitySlug] = useState<string | null>(() => initialAppRoute?.communitySlug ?? null);
  const activeCommunity = useMemo(() => {
    if (!activeCommunityId) return null;
    return communities.find((community) => community.id === activeCommunityId) ?? null;
  }, [activeCommunityId, communities]);
  const communityRailOrderStorageKey = useMemo(
    () => `${COMMUNITY_RAIL_ORDER_STORAGE_KEY_PREFIX}:${cloudSession?.user?.id ?? "local"}`,
    [cloudSession?.user?.id],
  );
  const { orderedCommunities: railCommunities, moveCommunityToIndex: handleReorderCommunityRail } =
    useCommunityRailOrder<CommunityRecord>({
      communities,
      storageKey: communityRailOrderStorageKey,
    });
  const [showCreateCommunityModal, setShowCreateCommunityModal] = useState(false);
  const [showDeleteCommunityModal, setShowDeleteCommunityModal] = useState(false);
  const [deleteCommunityNameInput, setDeleteCommunityNameInput] = useState("");
  const [deleteCommunityConfirmInput, setDeleteCommunityConfirmInput] = useState("");
  const [deleteCommunityError, setDeleteCommunityError] = useState<string | null>(null);
  const [isDeletingCommunity, setIsDeletingCommunity] = useState(false);
  const [createCommunityName, setCreateCommunityName] = useState("");
  const [createCommunitySlug, setCreateCommunitySlug] = useState("");
  const [createCommunitySlugEdited, setCreateCommunitySlugEdited] = useState(false);
  const [createCommunityVisibility, setCreateCommunityVisibility] = useState<"published" | "unlisted">("unlisted");
  const [createCommunityAvatarUrl, setCreateCommunityAvatarUrl] = useState<string | null>(null);
  const [createCommunityOneLiner, setCreateCommunityOneLiner] = useState("");
  const [createCommunityBannerUrl, setCreateCommunityBannerUrl] = useState<string | null>(null);
  const [createCommunityError, setCreateCommunityError] = useState<string | null>(null);
  const [isCreatingCommunity, setIsCreatingCommunity] = useState(false);
  const [isCreateAvatarDragOver, setIsCreateAvatarDragOver] = useState(false);
  const [isCreateBannerDragOver, setIsCreateBannerDragOver] = useState(false);
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, UserProfile>>({});
  const [communityTab, setCommunityTab] = useState<CommunityTab>(() => initialAppRoute?.communityTab ?? "chat");

  const [communityMessages, setCommunityMessages] = useState<CommunityChatMessage[]>([]);
  const [communityMessageInput, setCommunityMessageInput] = useState("");
  const [workspaceAttachments, setWorkspaceAttachments] = useState<MessageAttachment[]>([]);
  const workspaceAttachmentsRef = useRef<MessageAttachment[]>([]);
  const [threadErrorById, setThreadErrorById] = useState<Record<string, string | null>>({});
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => initialAppRoute?.threadId ?? null);
  const resolveThreadErrorKey = useCallback(
    (threadId: string | null): string => {
      const trimmedThreadId = String(threadId ?? "").trim();
      if (trimmedThreadId) return trimmedThreadId;
      return cloudSession ? WORKSPACE_DRAFT_THREAD_ERROR_KEY : GUEST_THREAD_ID;
    },
    [cloudSession],
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
  const [communityAttachments, setCommunityAttachments] = useState<MessageAttachment[]>([]);
  const communityAttachmentsRef = useRef<MessageAttachment[]>([]);
  const [communityChatError, setCommunityChatError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isUserAtBottom, setIsUserAtBottom] = useState(true);
  const isUserAtBottomRef = useRef(true);
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
    handleAttachmentFileInputChange: handleWorkspaceFileInputChange,
    removeAttachment: removeWorkspaceAttachment,
  } = useMessageAttachmentInputController<MessageAttachment>({
    attachmentsRef: workspaceAttachmentsRef,
    setAttachments: setWorkspaceAttachments,
    setError: setThreadError,
    ingestAttachmentsFromFileList: ingestWorkspaceAttachmentsFromFileList,
  });
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
    CloudAuthSession,
    MessageAttachment,
    CommunityChatMessage,
    MessageReaction
  >({
    extractTextFromContentJson,
    parseMessageAttachments,
    ensureSession: ensureUsableCloudSession,
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
      void loadUserProfiles(userIds, session);
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
      cloudSession
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
    if (!cloudSession || !activeCommunityId) return;
    void loadOlderCommunityChat(activeCommunityId, cloudSession);
  };

  useCommunityChatRealtime({
    isEnabled: activePage === "community" && communityTab === "chat",
    session: cloudSession,
    ensureSession: ensureUsableCloudSession,
    activeCommunityId,
    ensureCommunityChatThread,
    toCommunityChatMessage,
    communityMessageIdsRef,
    isUserAtBottomRef,
    setUnreadCount,
    setCommunityMessages,
    setMessageReactions,
    onLoadProfiles: (userIds, session) => {
      void loadUserProfiles(userIds, session);
    },
  });

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
    session: cloudSession,
    ensureSession: ensureUsableCloudSession,
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

  const [communityResources, setCommunityResources] = useState<CommunityResource[]>([]);
  const [isLoadingResources, setIsLoadingResources] = useState(false);
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [resourceTitleInput, setResourceTitleInput] = useState("");
  const [resourceUrlInput, setResourceUrlInput] = useState("");
  const [resourceBodyInput, setResourceBodyInput] = useState("");
  const [resourcePinnedInput, setResourcePinnedInput] = useState(false);
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [isSavingResource, setIsSavingResource] = useState(false);
  const [resourceSuccess, setResourceSuccess] = useState(false);
  const [openResourceEmbedId, setOpenResourceEmbedId] = useState<string | null>(null);

  const [communityMembers, setCommunityMembers] = useState<CommunityMember[]>([]);
  const [communityMembersRoleFilter, setCommunityMembersRoleFilter] = useState<string>("all");
  const [communityMembersPlanFilter, setCommunityMembersPlanFilter] = useState<string>("all");
  const [communityJoinRequests, setCommunityJoinRequests] = useState<CommunityJoinRequest[]>([]);
  const [isLoadingCommunityJoinRequests, setIsLoadingCommunityJoinRequests] = useState(false);
  const [communityJoinRequestsError, setCommunityJoinRequestsError] = useState<string | null>(null);
  const [decidingCommunityJoinRequestId, setDecidingCommunityJoinRequestId] = useState<string | null>(null);
  const [isJoinRequestsModalOpen, setIsJoinRequestsModalOpen] = useState(false);
  const [isSavingFreeAccessMode, setIsSavingFreeAccessMode] = useState(false);
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
    canViewActiveCommunitySettings,
    canPostMessagesActiveCommunity,
    canManageResourcesActiveCommunity,
    canManageMembersActiveCommunity,
    canReviewJoinRequestsActiveCommunity,
    canViewActiveCommunityAnalytics,
    funnelPreviewAdminCount,
    funnelPreviewOnlineCount,
    funnelPreviewOnlineFaces,
    reloadActiveCommunityAccess,
  } = useWebActiveCommunityShellController<CloudAuthSession, CommunityRecord, CommunityMember>({
    activePage,
    activeCommunityId,
    activeCommunity,
    communityTab,
    communityMembers,
    session: cloudSession,
    ensureSession: ensureUsableCloudSession,
  });

  const {
    loadCommunityResources,
    handleSaveCommunityResource,
    handleDeleteResource,
  } = useCommunityResourceController<CloudAuthSession, CommunityResource>({
    activeCommunityId,
    ...authenticatedCloudSessionArg,
    parseEmbedUrl,
    includeCommunityIdOnPatch: false,
    includeFileKeyOnSave: false,
    clearErrorWhenEditingDeleted: true,
    saveFailureMessage: "Failed to save resource.",
    deleteFailureMessage: "Failed to delete resource.",
    resourceTitleInput,
    resourceUrlInput,
    resourceBodyInput,
    resourcePinnedInput,
    editingResourceId,
    setCommunityResources,
    setIsLoadingResources,
    setIsSavingResource,
    setResourceError,
    setResourceSuccess,
    setShowResourceModal,
    setEditingResourceId,
    setResourceTitleInput,
    setResourceUrlInput,
    setResourceBodyInput,
    setResourcePinnedInput,
  });

  const {
    resetResourceForm,
    openNewResourceModal,
    closeResourceModal,
    handleEditResource,
  } = useCommunityResourceEditorController<CommunityResource>({
    setEditingResourceId,
    setResourceTitleInput,
    setResourceUrlInput,
    setResourceBodyInput,
    setResourcePinnedInput,
    setResourceError,
    setShowResourceModal,
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

  const [communitySettingsName, setCommunitySettingsName] = useState("");
  const [communitySettingsSlug, setCommunitySettingsSlug] = useState("");
  const [communitySettingsOneLiner, setCommunitySettingsOneLiner] = useState("");
  const [communitySettingsAbout, setCommunitySettingsAbout] = useState("");
  const [communitySettingsVisibility, setCommunitySettingsVisibility] = useState("unlisted");
  const [communitySettingsAvatarUrl, setCommunitySettingsAvatarUrl] = useState<string | null>(null);
  const [communitySettingsBannerUrl, setCommunitySettingsBannerUrl] = useState<string | null>(null);
  const [communitySettingsBannerFocusX, setCommunitySettingsBannerFocusX] = useState(0.5);
  const [communitySettingsBannerFocusY, setCommunitySettingsBannerFocusY] = useState(0.5);
  const [communitySettingsBannerZoom, setCommunitySettingsBannerZoom] = useState(1);
  const [communitySettingsPricingMode, setCommunitySettingsPricingMode] = useState<CommunityPricingMode>("free");
  const [communitySettingsPriceUsdMonthly, setCommunitySettingsPriceUsdMonthly] = useState("");
  const [communitySettingsPriceUsdAnnual, setCommunitySettingsPriceUsdAnnual] = useState("");
  const [communitySettingsError, setCommunitySettingsError] = useState<string | null>(null);
  const [communitySettingsBannerUploadError, setCommunitySettingsBannerUploadError] = useState<string | null>(null);
  const [isProcessingCommunitySettingsBanner, setIsProcessingCommunitySettingsBanner] = useState(false);
  const [isCommunityBannerFocusModalOpen, setIsCommunityBannerFocusModalOpen] = useState(false);
  const [isSavingCommunitySettings, setIsSavingCommunitySettings] = useState(false);
  const [isSettingsBannerDragOver, setIsSettingsBannerDragOver] = useState(false);
  const [isSettingsAvatarDragOver, setIsSettingsAvatarDragOver] = useState(false);
  const communitySettingsLoadedCommunityIdRef = useRef<string | null>(null);
  const communitySettingsDirtyRef = useRef(false);
  const communityPricingDirtyRef = useRef(false);
  const markCommunitySettingsDirty = () => {
    communitySettingsDirtyRef.current = true;
  };
  const [isLoadingCommunityAgentConfig, setIsLoadingCommunityAgentConfig] = useState(false);
  const [communityAgentConfigError, setCommunityAgentConfigError] = useState<string | null>(null);
  const communityAgentConfigLoadedCommunityIdRef = useRef<string | null>(null);

  const [communityAgentConfigLanding, setCommunityAgentConfigLanding] = useState<CommunityAgentLanding>(
    DEFAULT_EMPTY_THREAD_LANDING,
  );
  const [communityAgentConfigSystemPrompt, setCommunityAgentConfigSystemPrompt] = useState("");
  const [isSavingCommunityAgentConfig, setIsSavingCommunityAgentConfig] = useState(false);
  const [communityAgentConfigSaveError, setCommunityAgentConfigSaveError] = useState<string | null>(null);
  const communityAgentConfigDirtyRef = useRef(false);
  const markCommunityAgentConfigDirty = useCallback(() => {
    communityAgentConfigDirtyRef.current = true;
  }, []);
  const hydrateCommunityAgentEditor = useCallback((row: CommunityAgentConfig | null) => {
    const landing = normalizeCommunityAgentLanding(row?.landing_json) ?? DEFAULT_EMPTY_THREAD_LANDING;
    setCommunityAgentConfigLanding(landing);
    setCommunityAgentConfigSystemPrompt(row?.system_prompt ?? "");
    setCommunityAgentConfigSaveError(null);
    communityAgentConfigDirtyRef.current = false;
  }, []);
  const handleResetCommunityAgentConfig = useCallback(() => {
    hydrateCommunityAgentEditor(null);
  }, [hydrateCommunityAgentEditor]);

  const [communityFunnelConfig, setCommunityFunnelConfig] = useState<CommunityFunnelConfig>(
    DEFAULT_COMMUNITY_FUNNEL_CONFIG,
  );
  const [isLoadingCommunityFunnel, setIsLoadingCommunityFunnel] = useState(false);
  const [communityFunnelError, setCommunityFunnelError] = useState<string | null>(null);
  const [isSavingCommunityFunnel, setIsSavingCommunityFunnel] = useState(false);
  const [communityFunnelSaveError, setCommunityFunnelSaveError] = useState<string | null>(null);
  const communityFunnelLoadedCommunityIdRef = useRef<string | null>(null);
  const communityFunnelSavedConfigRef = useRef<CommunityFunnelConfig>(DEFAULT_COMMUNITY_FUNNEL_CONFIG);
  const communityFunnelDirtyRef = useRef(false);
  const markCommunityFunnelDirty = useCallback(() => {
    communityFunnelDirtyRef.current = true;
  }, []);
  const hydrateCommunityFunnelEditor = useCallback((config: CommunityFunnelConfig | null) => {
    const normalized = normalizeCommunityFunnelConfig(config);
    setCommunityFunnelConfig(normalized);
    communityFunnelSavedConfigRef.current = normalized;
    setCommunityFunnelSaveError(null);
    communityFunnelDirtyRef.current = false;
  }, []);
  const handleResetCommunityFunnel = useCallback(() => {
    setCommunityFunnelConfig(communityFunnelSavedConfigRef.current);
    setCommunityFunnelSaveError(null);
    communityFunnelDirtyRef.current = false;
  }, []);
  const [communityMemberMuted, setCommunityMemberMuted] = useState(false);
  const [isLoadingCommunityMemberSettings, setIsLoadingCommunityMemberSettings] = useState(false);
  const [communityMemberSettingsError, setCommunityMemberSettingsError] = useState<string | null>(null);
  const [isLeavingCommunity, setIsLeavingCommunity] = useState(false);

  const [threads, setThreads] = useState<ThreadRecord[]>([]);
  const [cloudProjects, setCloudProjects] = useState<CloudProjectRecord[]>([]);
  const [activeCloudProjectId, setActiveCloudProjectId] = useState<string | null>(null);
  const [cloudProjectExpandedById, setCloudProjectExpandedById] = useState<Record<string, boolean>>({});
  const [threadSearchQuery, setThreadSearchQuery] = useState("");
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

  const resolveKnownCommunityIdBySlug = useCallback((communitySlug: string | null | undefined): string | null => {
    const normalizedSlug = String(communitySlug ?? "").trim();
    if (!normalizedSlug) return null;
    const matchedCommunity =
      communities.find((community) => String(community.slug ?? "").trim() === normalizedSlug) ?? null;
    return matchedCommunity?.id ?? null;
  }, [communities]);

  const resolveKnownCommunitySlugById = useCallback((communityId: string | null | undefined): string | null => {
    const normalizedId = String(communityId ?? "").trim();
    if (!normalizedId) return null;
    const matchedCommunity = communities.find((community) => String(community.id ?? "").trim() === normalizedId) ?? null;
    const slug = String(matchedCommunity?.slug ?? "").trim();
    return slug || null;
  }, [communities]);

  const applyCommunityShellState = useCallback((opts: {
    communityId?: string | null;
    communitySlug?: string | null;
    communityTab?: CommunityTab;
  }) => {
    const resolvedCommunityId =
      opts.communityId !== undefined ? opts.communityId : activeCommunityId;
    const resolvedCommunitySlug =
      opts.communitySlug !== undefined
        ? String(opts.communitySlug ?? "").trim() || null
        : resolveKnownCommunitySlugById(resolvedCommunityId) ?? activeCommunitySlug;
    setActiveCommunityId(resolvedCommunityId);
    setActiveCommunitySlug(resolvedCommunitySlug);
    if (opts.communityTab !== undefined) {
      setCommunityTab(opts.communityTab);
    }
  }, [activeCommunityId, activeCommunitySlug, resolveKnownCommunitySlugById]);

  function navigateTo(path: string, opts: { replace?: boolean; state?: unknown } = {}) {
    const historyState = opts.state ?? {};
    if (opts.replace) {
      window.history.replaceState(historyState, document.title, path);
    } else {
      window.history.pushState(historyState, document.title, path);
    }
    const nextPublicRoute = readPublicRouteFromLocation();
    setPublicRoute(nextPublicRoute);
    if (nextPublicRoute.kind !== "app") {
      setActivePage("workspace");
      setActiveView("home");
      setSettingsPage("agent");
      applyCommunityShellState({
        communityId: null,
        communitySlug: null,
        communityTab: "chat",
      });
      setActiveThreadId(null);
      setWorkspaceWantsNewChatMode(true);
      setActiveCloudProjectId(null);
      return;
    }
    applyAppRouteStateFromLocation();
  }

  const applyAppRouteState = useCallback((nextAppRoute: AppRouteState) => {
    const resolvedCommunityId =
      nextAppRoute.page === "community"
        ? resolveKnownCommunityIdBySlug(nextAppRoute.communitySlug) ?? nextAppRoute.communityId
        : nextAppRoute.communityId;
    const nextThreadId =
      nextAppRoute.page === "workspace" && nextAppRoute.view === "home" ? nextAppRoute.threadId : null;
    setActivePage(nextAppRoute.page);
    setActiveView(nextAppRoute.page === "workspace" ? nextAppRoute.view : "home");
    setSettingsPage(nextAppRoute.settingsPage);
    applyCommunityShellState({
      communityId: resolvedCommunityId,
      communitySlug: nextAppRoute.communitySlug,
      communityTab: nextAppRoute.communityTab,
    });
    setActiveThreadId(nextThreadId);
    setWorkspaceWantsNewChatMode(
      nextAppRoute.page === "workspace" && nextAppRoute.view === "home" && nextThreadId === null,
    );
    if (nextAppRoute.page !== "workspace") {
      setActiveCloudProjectId(null);
    }
  }, [applyCommunityShellState, resolveKnownCommunityIdBySlug]);

  function applyAppRouteStateFromLocation() {
    applyAppRouteState(readAppRouteFromLocation());
  }

  const resolvedActiveCloudProjectId = useMemo(
    () => resolvePreferredCloudProjectId(cloudProjects, activeCloudProjectId),
    [activeCloudProjectId, cloudProjects],
  );

  const navStackRef = useRef<NavSnapshot[]>([]);
  const readCurrentRoutePath = () =>
    `${window.location.pathname}${window.location.search}` || "/";
  const buildCurrentAppRoutePath = (): string | null =>
    buildAppRoutePath({
      page: activePage,
      view: activeView,
      settingsPage,
      communitySlug: activeCommunitySlug,
      communityTab,
      threadId: activePage === "workspace" && activeView === "home" ? activeThreadId : null,
    });
  const takeNavSnapshot = (): NavSnapshot => ({
    page: activePage,
    view: activeView,
    settingsPage,
    communityId: activeCommunityId,
    communitySlug: activeCommunitySlug,
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
    activeCommunityId,
    activeCommunitySlug,
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
    syncWorkspaceSelection,
    applyWorkspaceRouteState,
    applyGuestWorkspaceState,
    openWorkspaceDraft,
    enterWorkspaceThread,
    handleNewWorkspaceThread,
  } = useWebWorkspaceRouteController({
    activePage,
    activeView,
    activeThreadId,
    navigateTo,
    setActivePage,
    setActiveView,
    setActiveThreadId,
    setWorkspaceWantsNewChatMode,
    setActiveCloudProjectId,
    syncCommunitySelection,
  });
  const applyPublicRouteState = useCallback((route: PublicRoute) => {
    setPublicRoute(route);
    setActivePage("workspace");
    setActiveView("home");
    setSettingsPage("agent");
    applyCommunityShellState({
      communityId: null,
      communitySlug: null,
      communityTab: "chat",
    });
    applyWorkspaceRouteState({
      page: "workspace",
      view: "home",
      threadId: null,
    });
  }, [applyCommunityShellState, applyWorkspaceRouteState]);
  const enterJoinedCommunity = useCallback((opts: { communityId: string; communitySlug?: string | null }) => {
    const communityId = String(opts.communityId ?? "").trim();
    if (!communityId) return;
    const resolvedSlug =
      String(opts.communitySlug ?? "").trim() || resolveKnownCommunitySlugById(communityId);
    const nextPath = buildCommunityTabPath(resolvedSlug, "chat");
    if (nextPath) {
      navigateTo(nextPath, { replace: true });
      return;
    }
    openCommunityChat(communityId, { pushSnapshot: false });
  }, [navigateTo, openCommunityChat, resolveKnownCommunitySlugById]);
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
  const [messageInput, setMessageInput] = useState("");
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
  const [streamingThreadId, setStreamingThreadId] = useState<string | null>(null);
  const [streamingRunId, setStreamingRunId] = useState<string | null>(null);
  const [streamingMeta, setStreamingMeta] = useState<{
    engine_id: string;
    model_id: string | null;
    inference_source?: string | null;
    memory_used?: MemoryUsedItem[];
    history_used?: HistoryUsedItem[];
    community_evidence_used?: CommunityEvidenceUsedV1 | null;
  } | null>(null);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const streamingContentRef = useRef<string | null>(null);
  const streamingRafRef = useRef<number | null>(null);
  const streamingAbortRef = useRef<AbortController | null>(null);
  const streamingUserCancelledRef = useRef(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [memoryToast, setMemoryToast] = useState<string | null>(null);
  const memoryToastTimeoutRef = useRef<number | null>(null);
  const [inferenceToast] = useState<string | null>(null);
  const [appToast, setAppToast] = useState<string | null>(null);
  const appToastTimeoutRef = useRef<number | null>(null);
  const [platformQuotaModal, setPlatformQuotaModal] = useState<{
    reason: "quota" | "plan" | "misconfigured" | "disabled" | "unavailable";
    threadId: string;
    mode: "respond" | "regenerate";
    message: string | null;
  } | null>(null);
  const [isPlatformQuotaModalRunning] = useState(false);
  const [userMemorySettings, setUserMemorySettings] = useState<UserMemorySettings>({
    memory_mode: "auto",
    remember_intent_enabled: true,
  });
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
  const [isChatgptConnectModalOpen, setIsChatgptConnectModalOpen] = useState(false);
  const [chatgptDeviceLoginId, setChatgptDeviceLoginId] = useState<string | null>(null);
  const [chatgptDeviceVerificationUrl, setChatgptDeviceVerificationUrl] = useState<string | null>(null);
  const [chatgptDeviceUserCode, setChatgptDeviceUserCode] = useState<string | null>(null);
  const [chatgptDevicePollIntervalSeconds, setChatgptDevicePollIntervalSeconds] = useState(5);
  const [chatgptManualAuthorizeUrl, setChatgptManualAuthorizeUrl] = useState<string | null>(null);
  const [chatgptManualCallbackInput, setChatgptManualCallbackInput] = useState("");
  const [openRouterApiKeyDraft, setOpenRouterApiKeyDraft] = useState("");
  const [isSavingOpenRouterConnection, setIsSavingOpenRouterConnection] = useState(false);
  const [openRouterConnectionError, setOpenRouterConnectionError] = useState<string | null>(null);
  const [openRouterConnectionSuccess, setOpenRouterConnectionSuccess] = useState<string | null>(null);
  const [isConnectingChatgpt, setIsConnectingChatgpt] = useState(false);
  const [isPollingChatgptConnection, setIsPollingChatgptConnection] = useState(false);
  const [isCompletingChatgptConnection, setIsCompletingChatgptConnection] = useState(false);
  const [chatgptConnectionError, setChatgptConnectionError] = useState<string | null>(null);
  const [chatgptConnectionSuccess, setChatgptConnectionSuccess] = useState<string | null>(null);
  const [contextModal, setContextModal] = useState<
    MessageContextModalPayload<MemoryUsedItem, HistoryUsedItem, MemorySuggestion> | null
  >(null);
  const workspaceMessageListRef = useRef<HTMLDivElement | null>(null);
  const chatgptConnectPollTimeoutRef = useRef<number | null>(null);
  const [isWorkspaceAtBottom, setIsWorkspaceAtBottom] = useState(true);
  const autoScrollEnabledRef = useRef(true);
  const lastWorkspaceScrollTopRef = useRef(0);
  const isLoadingThreadRef = useRef(false);
  const workspaceAskInputRef = useRef<HTMLTextAreaElement | null>(null);
  const workspaceFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [modelPickerQuery, setModelPickerQuery] = useState("");
  const [modelPickerSection, setModelPickerSection] = useState<ModelSectionId>("all");
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const modelPickerSearchRef = useRef<HTMLInputElement>(null);
  const [isAuthGateOpen, setIsAuthGateOpen] = useState(false);

  const openAuthGate = (intentInput?: unknown) => {
    setAuthError(null);
    const intent = parsePendingAuthIntentInput(intentInput);
    if (intent && !cloudSession) {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      storePendingAuthIntent(buildPendingAuthIntent(intent, returnTo));
    }
    setIsAuthGateOpen(true);
  };

  const persistCreateCommunityIntent = useCallback((draft: CreateCommunityIntentDraft): void => {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    storePendingAuthIntent(buildPendingAuthIntent({ reason: "create_community", payload: { draft } }, returnTo));
  }, []);

  const { loadCommunities, loadUserProfiles } = useWebCommunityAccessController<
    CloudAuthSession,
    CommunityRecord,
    UserProfile
  >({
    toCanonicalCommunityVisibility,
    activeCommunityId,
    ensureSession: ensureUsableCloudSession,
    setIsLoadingCommunities,
    setCommunityRoleById,
    setCommunities,
    setActiveCommunityId,
    setProfilesByUserId,
  });

  const {
    loadCommunityMembers,
    loadSelfProfile,
    saveProfileToCloud,
    loadCommunityAnalytics,
    resetCommunityAnalytics,
    handleSetCommunityMemberRole,
    handleRemoveCommunityMember,
  } = useCommunityAdminController<
    CloudAuthSession,
    CommunityMember,
    UserProfile,
    UserProfileDetail
  >({
    activeCommunityId,
    ...authenticatedCloudSessionArg,
    parseContentRangeTotal,
    dateKeyLocal,
    ensureCommunityChatThread,
    confirmAction: (message) => confirm(message),
    reloadCommunities: loadCommunities,
    reloadCommunityAccess: reloadActiveCommunityAccess,
    loadUserProfiles: (userIds, session) => void loadUserProfiles(userIds, session),
    getProfileSaveSession: () => sessionRef.current ?? cloudSession,
    profileName,
    profileBio,
    profileAvatarUrl,
    profileSaveTimeoutRef,
    profileSaveFailureMessage: "Failed to save profile.",
    profileSaveUnauthenticatedErrorMessage: null,
    onProfileSaveUnauthenticated: () => {
      openAuthGate();
    },
    applyLoadedProfileToLocal: (profile) => {
      setProfileName((prev) => (prev.trim() ? prev : profile.display_name ?? ""));
      setProfileBio((prev) => (prev.trim() ? prev : profile.bio ?? ""));
      setProfileAvatarUrl((prev) => prev ?? profile.avatar_url ?? null);
    },
    setCommunityMembers,
    setProfilesByUserId,
    setCloudProfile,
    setProfileName,
    setProfileBio,
    setProfileAvatarUrl,
    setIsSavingProfile,
    setProfileSaveError,
    setProfileSaveSuccess,
    setIsLoadingCommunityAnalytics,
    setCommunityAnalyticsError,
    setCommunityAnalyticsSummary,
    setCommunityAnalyticsSeries,
  });

  const {
    loadCommunityAgentConfig,
    handleSaveCommunityAgentConfig,
  } = useCommunityAgentConfigController<CloudAuthSession, CommunityAgentLanding, CommunityAgentConfig>({
    activeCommunityId,
    ...authenticatedCloudSessionArg,
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

  const {
    loadCommunityFunnelConfig,
    handleSaveCommunityFunnel,
  } = useCommunityFunnelController<CloudAuthSession, CommunityFunnelConfig>({
    activeCommunityId,
    ...authenticatedCloudSessionArg,
    communityFunnelConfig,
    normalizeConfigForSave: normalizeCommunityFunnelConfig,
    saveConfig: async ({ session, communityId, normalizedConfig }) => {
      const saved = await saveCloudCommunityPublicPresentation<CloudAuthSession, CommunityFunnelConfig>({
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
  } = useCommunitySettingsDataController<CloudAuthSession>({
    ensureSession: ensureUsableCloudSession,
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
  } = useCommunitySettingsGovernanceController<CloudAuthSession>({
    activeCommunityAvatarStorageId: activeCommunitySettingsSource?.avatar_storage_id ?? null,
    activeCommunityBannerStorageId: activeCommunitySettingsSource?.banner_storage_id ?? null,
    activeCommunityAvatarUrl: activeCommunitySettingsSource?.avatar_url ?? null,
    activeCommunityBannerUrl: activeCommunitySettingsSource?.banner_url ?? null,
    activeCommunityId,
    ...authenticatedCloudSessionArg,
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
      communitySettingsDirtyRef.current = false;
      communityPricingDirtyRef.current = false;
    },
  });
  const {
    openDeleteCommunityModal,
    closeDeleteCommunityModal,
    handleConfirmDeleteCommunity,
  } = useCommunityDeleteController<
    CloudAuthSession,
    CommunityRecord,
    AppPage,
    AppView,
    CommunityTab
  >({
    ...authenticatedCloudSessionArg,
    activeCommunityId,
    loadCommunities,
    setDeleteCommunityError,
    setDeleteCommunityNameInput,
    setDeleteCommunityConfirmInput,
    setShowDeleteCommunityModal,
    setIsDeletingCommunity,
    setActiveCommunityId,
    setActivePage,
    setActiveView,
    setCommunityTab,
    setCommunities,
    setCommunityRoleById,
    getCommunityId: (community) => community.id,
  });

  const {
    loadCommunityJoinRequests,
    handleApproveCommunityJoinRequest,
    handleDenyCommunityJoinRequest,
    handleSetCommunityFreeAccessMode,
  } = useCommunityMembersReviewController<
    CloudAuthSession,
    CommunityJoinRequest,
    CommunityRecord
  >({
    activeCommunityId,
    ...authenticatedCloudSessionArg,
    isSavingFreeAccessMode,
    loadUserProfiles: (userIds, session) => void loadUserProfiles(userIds, session),
    loadCommunityMembers,
    setCommunities,
    setCommunityJoinRequests,
    setIsLoadingCommunityJoinRequests,
    setCommunityJoinRequestsError,
    setDecidingCommunityJoinRequestId,
    setIsSavingFreeAccessMode,
  });

  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [discoverQuery, setDiscoverQuery] = useState("");
  const [discoverCommunities, setDiscoverCommunities] = useState<DiscoverCommunity[]>([]);
  const [isLoadingDiscover, setIsLoadingDiscover] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  const { loadThreads, loadThreadMessages, loadModelRegistry } = useWebThreadDataController<
    CloudAuthSession,
    ThreadMessage
  >({
    fetchModelRegistryRows: async (session) => {
      const url = getCloudUrl();
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
    ensureSession: ensureUsableCloudSession,
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
  } = useWebMemorySettingsDataController<CloudAuthSession>({
    getSession: () => sessionRef.current,
    ensureSession: ensureUsableCloudSession,
    setIsLoadingUserMemorySettings,
    setUserMemorySettings,
    setIsLoadingPersonalMemory,
    setPersonalMemoryError,
    setPersonalMemoryItems,
  });

  const {
    createPersonalMemoryItemDirect,
    handleCreatePersonalMemoryItem,
    handleTogglePersonalMemoryPinned,
    handleDeletePersonalMemoryItem,
  } = useWebMemoryMutationController<CloudAuthSession>({
    getSession: () => sessionRef.current,
    ensureSession: ensureUsableCloudSession,
    openAuthGate,
    loadPersonalMemoryItems,
    newPersonalMemoryContent,
    newPersonalMemoryScope,
    newPersonalMemoryPinned,
    setIsLoadingUserMemorySettings,
    setUserMemorySettings,
    setPersonalMemoryError,
    setNewPersonalMemoryContent,
    setNewPersonalMemoryPinned,
  });

  const { createThread, updateThreadModel, maybeSetThreadTitleFromText, setThreadCommunityLens } =
    useWebThreadMutationController<CloudAuthSession>({
      deriveThreadTitleFromUserText,
      isMissingThreadTitleValue,
      toEpochSeconds,
      activeCommunityId,
      activeProjectId: resolvedActiveCloudProjectId,
      activeModelId,
      modelToggles,
      threads,
      defaultActiveModelId: DEFAULT_ACTIVE_MODEL_ID,
      ensureSession: ensureUsableCloudSession,
      setThreads,
      setWorkspaceWantsNewChatMode,
      setActiveThreadId,
    });

  const { loadDiscoverCommunities } = useWebDiscoverController({
    toCanonicalCommunityVisibility,
    setIsLoadingDiscover,
    setDiscoverError,
    setDiscoverCommunities,
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

  const resetMemoryImportModal = useCallback(() => {
    setIsMemoryImportModalOpen(false);
    setMemoryImportText("");
    setMemoryImportError(null);
  }, []);

  const closeMemoryImportModal = useCallback(() => {
    if (isImportingMemory) return;
    resetMemoryImportModal();
  }, [isImportingMemory, resetMemoryImportModal]);

  const handleImportExternalMemory = useCallback(async (): Promise<void> => {
    if (!cloudSession) {
      openAuthGate();
      return;
    }

    const importItems = memoryImportPlan.uniqueItems;
    if (importItems.length === 0) {
      setMemoryImportError(
        memoryImportPlan.parsedItems.length === 0
          ? "No memory entries found. Paste the provider export, ideally including the code block."
          : "Everything in this import is already in your personal memory.",
      );
      return;
    }

    setMemoryImportError(null);
    setIsImportingMemory(true);
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
      resetMemoryImportModal();
      const duplicateCount = memoryImportPlan.duplicateCount;
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
      setMemoryImportError(message);
    } finally {
      setIsImportingMemory(false);
    }
  }, [
    cloudSession,
    createPersonalMemoryItemDirect,
    loadPersonalMemoryItems,
    memoryImportPlan,
    openAuthGate,
    resetMemoryImportModal,
    showMemoryToastMessage,
  ]);

  const refreshCloudProjectStatuses = useCallback(() => {
    if (!cloudSession) return;
    if (activePage !== "workspace") return;
    const now = Date.now();
    if (now - lastCloudStatusRefreshAtRef.current < 1000) return;
    lastCloudStatusRefreshAtRef.current = now;
    void loadCloudProjects(cloudSession);
  }, [activePage, loadCloudProjects, cloudSession]);

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
    CloudAuthSession,
    ThreadMessage,
    MemoryUsedItem,
    HistoryUsedItem,
    CommunityEvidenceUsedV1
  >({
    activeThreadId,
    getCloudRuntimeBaseUrl: getCloudUrl,
    getThreadById: (threadId) => threads.find((thread) => thread.id === threadId) ?? null,
    fetchCloudPublic: fetchWithCloudPublic,
    fetchCloudAuth: fetchWithCloudAuth,
    extractTextFromContentJson,
    parseMemoryUsedArray,
    parseHistoryUsedArray,
    extractCommunityEvidenceUsedV1,
    loadThreadMessages,
    loadThreads,
    showMemoryToastMessage,
    setThreadErrorForThread,
    setPlatformQuotaModal,
    setStreamingContent,
    setStreamingThreadId,
    setStreamingRunId,
    setStreamingMeta,
    setThreadSendingStateById,
    setThreadStreamingStateById,
    streamingContentRef,
    streamingRafRef,
    streamingAbortRef,
    streamingUserCancelledRef,
    runtimeTurnV2Enabled: String(((import.meta as any)?.env?.VITE_ENABLE_RUNTIME_TURN_V2 ?? "true"))
      .trim()
      .toLowerCase() === "true",
  });
  useWebRuntimeRunLifecycle<
    CloudAuthSession,
    ThreadMessage,
    MemoryUsedItem,
    HistoryUsedItem,
    CommunityEvidenceUsedV1
  >({
    cloudSession,
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
  useWebAuthSessionLifecycle<CloudAuthSession>({
    session: cloudSession,
    sessionRef,
    refreshTimeoutRef,
    refreshLocked: refreshCloudSessionLocked,
    didJustSignInRef,
    onMountOAuthBootstrap: async () => {
      const parsedOAuthCallback = parseCloudOAuthCallbackFromLocation();
      let hasSignedOutIntent = false;
      const finalizeSignedInSession = (session: CloudAuthSession, markJustSignedIn: boolean): void => {
        markAuthBootstrapComplete();
        clearCloudSignedOutIntentMarker();
        if (markJustSignedIn) {
          didJustSignInRef.current = true;
        }
        adoptCloudSession(session);

        if (!markJustSignedIn) {
          return;
        }

        const pendingIntent = readPendingAuthIntent();
        const pendingReturnTo = (pendingIntent?.return_to ?? "").trim();
        clearAuthReturnTo();
        if (pendingReturnTo) {
          const nextPath = pendingReturnTo.startsWith("/") || pendingReturnTo.startsWith("#")
            ? pendingReturnTo
            : DEFAULT_POST_SIGN_IN_PATH;
          window.history.replaceState({}, document.title, nextPath);
        }

        const nextPublicRoute = readPublicRouteFromLocation();
        if (nextPublicRoute.kind === "app") {
          setPublicRoute(nextPublicRoute);
          applyAppRouteState(readAppRouteFromLocation());
        } else {
          applyPublicRouteState(nextPublicRoute);
        }
      };
      try {
        hasSignedOutIntent =
          sessionStorage.getItem(CLOUD_SIGNED_OUT_TAB_INTENT_KEY) === "1" ||
          localStorage.getItem(CLOUD_SIGNED_OUT_INTENT_KEY) === "1";
      } catch {
        // ignore
      }

      if (parsedOAuthCallback?.kind === "error") {
        markAuthBootstrapComplete();
        setAuthError(`Google sign-in failed: ${parsedOAuthCallback.error}`);
        clearOAuthCallbackParamsFromLocation();
        clearCloudAuthFlowPending();
        return;
      }

      const hadPendingAuthFlow = hasRecentCloudAuthFlowPending();
      let markJustSignedIn = false;
      if (parsedOAuthCallback?.kind === "code") {
        setAuthError(null);
        setMagicLinkStatus("idle");
        setMagicLinkError(null);
        const completion = await completeCloudOAuthCallback({
          authCode: parsedOAuthCallback.authCode,
          state: parsedOAuthCallback.state,
        });
        if (!completion.ok) {
          setAuthError(completion.error);
          clearOAuthCallbackParamsFromLocation();
          clearCloudAuthFlowPending();
          return;
        }
        markJustSignedIn = true;
      }

      let bootstrappedSession: CloudAuthSession | null = null;
      try {
        bootstrappedSession = await bootstrapCloudSession();
      } catch (error) {
        if (markJustSignedIn || hadPendingAuthFlow) {
          const message =
            typeof error === "string"
              ? error
              : error instanceof Error
                ? error.message
                : "Failed to bootstrap auth session.";
          setAuthError(message);
        }
      }
      if (bootstrappedSession) {
        finalizeSignedInSession(bootstrappedSession, markJustSignedIn);
        clearOAuthCallbackParamsFromLocation();
        if (markJustSignedIn || hadPendingAuthFlow) {
          clearCloudAuthFlowPending();
        }
        return;
      }

      if (hasSignedOutIntent) {
        markAuthBootstrapComplete();
        clearOAuthCallbackParamsFromLocation();
        clearCloudAuthFlowPending();
        return;
      }

      if (parsedOAuthCallback?.kind === "code") {
        markAuthBootstrapComplete();
        setAuthError("Failed to bootstrap auth session.");
        clearOAuthCallbackParamsFromLocation();
        clearCloudAuthFlowPending();
        return;
      }
      markAuthBootstrapComplete();
    },
    onDidJustSignIn: () => {
      // If the user arrived via an auth gate (e.g. locked model selection), apply it immediately.
      resumePendingAuthIntent();
    },
    onSessionAvailable: (session) => {
      markAuthBootstrapComplete();
      void (async () => {
        const usableSession = await ensureUsableCloudSession(session);
        if (!usableSession) return;
        await Promise.all([
          loadCommunities(usableSession),
          loadCloudProjects(usableSession),
          loadThreads(usableSession),
          loadModelRegistry(usableSession),
          loadBuilderBillingStatus(usableSession),
          loadSelfProfile(usableSession),
        ]);
      })();
    },
    onSessionMissing: () => {
      if (!authBootstrapCompleteRef.current) return;
      markAuthBootstrapComplete();
      void (async () => {
        await resetSessionStateAfterSessionLoss();
        applyCommunityShellState({
          communityId: null,
          communitySlug: null,
          communityTab: "chat",
        });
        setCloudProjects([]);
        setActiveCloudProjectId(null);
        threadsHydratedRef.current = false;
        setLoadingThreadMessagesThreadId(null);
        setPersonalMemoryItems([]);
        setPendingPurchaseClaims([]);
        setPendingPurchasesError(null);
        setPendingPurchasesSuccess(null);
        setCloudProfile(null);
        setProfileSaveError(null);
        setProfileSaveSuccess(false);
      })();
    },
    onFocusWithSession: (current) => {
      void (async () => {
        const usableSession = await ensureUsableCloudSession(current);
        if (!usableSession) return;
        await Promise.all([
          loadModelRegistry(usableSession),
          loadBuilderBillingStatus(usableSession),
          loadCommunities(usableSession),
          loadCloudProjects(usableSession),
        ]);
      })();
    },
  });

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      const key = String(event.key ?? "").trim();
      if (key !== CLOUD_SIGNED_OUT_INTENT_KEY || event.newValue !== "1") return;
      authSessionEpochRef.current += 1;
      void resetSessionStateAfterSessionLoss();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!cloudSession || activePage !== "workspace") return;
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
  }, [activePage, refreshCloudProjectStatuses, cloudSession]);

  useEffect(() => {
    activeCommunityIdRef.current = activeCommunityId;
  }, [activeCommunityId]);

  useCommunityAgentLandingLifecycle<CloudAuthSession>({
    ...authenticatedCloudSessionArg,
    activeCommunityId,
    canViewCommunity: communityActionGuards.canViewCommunity,
    activeCommunityIdRef,
    activeCommunityAgentLandingCommunityIdRef,
    communityAgentLandingFetchSeqRef,
    setActiveCommunityAgentLanding,
  });

  useEffect(() => {
    if (activePage !== "community" || communityTab !== "funnel") return;
    if (!cloudSession || !activeCommunityId || !canManageMembersActiveCommunity) {
      setCommunityFunnelError(null);
      setIsLoadingCommunityFunnel(false);
      communityFunnelLoadedCommunityIdRef.current = null;
      communityFunnelSavedConfigRef.current = DEFAULT_COMMUNITY_FUNNEL_CONFIG;
      setCommunityFunnelConfig(DEFAULT_COMMUNITY_FUNNEL_CONFIG);
      communityFunnelDirtyRef.current = false;
      return;
    }
    if (communityFunnelLoadedCommunityIdRef.current === activeCommunityId) return;
    void loadCommunityFunnelConfig(activeCommunityId, cloudSession);
  }, [
    activePage,
    communityTab,
    cloudSession,
    activeCommunityId,
    canManageMembersActiveCommunity,
    loadCommunityFunnelConfig,
  ]);

  const communityPolynetController = useWebCommunityPolynetController<CloudAuthSession>({
    activePage,
    communityTab,
    activeCommunityId,
    session: cloudSession,
    ensureUsableCloudSession,
    openAuthGate: () => openAuthGate(),
    canManagePolynet: canViewActiveCommunityPolynet,
  });

  useEffect(() => {
    captureBrandosAidFromLocation();
  }, []);

  useEffect(() => {
    if (cloudSession) return;
    const currentUrl = new URL(window.location.href);
    const shouldAutoStartGoogleAuth =
      currentUrl.searchParams.get(GOOGLE_AUTH_START_SEARCH_PARAM) === GOOGLE_AUTH_START_SEARCH_VALUE;
    if (!shouldAutoStartGoogleAuth || hasAutoStartedGoogleAuthRef.current) return;
    hasAutoStartedGoogleAuthRef.current = true;
    currentUrl.searchParams.delete(GOOGLE_AUTH_START_SEARCH_PARAM);
    const cleanPath = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
    window.history.replaceState(window.history.state ?? {}, document.title, cleanPath || "/");
    void beginGoogleSignInFlow();
  }, [
    GOOGLE_AUTH_START_SEARCH_PARAM,
    GOOGLE_AUTH_START_SEARCH_VALUE,
    beginGoogleSignInFlow,
    cloudSession,
  ]);

  useWebPathRouteLifecycle({
    publicRouteKind: publicRoute.kind,
    activePage,
    activeView,
    settingsPage,
    activeCommunitySlug,
    communityTab,
    activeThreadId,
    setPublicRoute,
    applyPublicRouteState,
    applyAppRouteState,
    setBuilderBillingReturn,
    readPublicRouteFromLocation,
    readAppRouteFromLocation,
    buildAppRoutePath,
  });

  useEffect(() => {
    workspaceAttachmentsRef.current = workspaceAttachments;
  }, [workspaceAttachments]);

  useEffect(() => {
    communityAttachmentsRef.current = communityAttachments;
  }, [communityAttachments]);

  useWebUiPersistenceLifecycle({
    communityAnalyticsRange,
    appTheme,
    profileStorageUserId,
    profileName,
    profileUsername,
    profileBio,
    profileAvatarUrl,
    modelToggles,
    activeModelId,
    guestModelId,
    modelTogglesStorageKey: MODEL_TOGGLES_STORAGE_KEY,
    activeModelStorageKey: ACTIVE_MODEL_STORAGE_KEY,
    readProfileDraftForUser,
    writeProfileDraftForUser,
    storeGuestModelId,
    setProfileName,
    setProfileUsername,
    setProfileBio,
    setProfileAvatarUrl,
  });

  // Cloud session is hydrated from browser auth continuity during lifecycle bootstrap.

  useLayoutEffect(() => {
    const el = workspaceAskInputRef.current;
    if (!el) return;
		    el.style.height = "0px";
		    const maxPx = 220;
		    const next = Math.min(el.scrollHeight, maxPx);
		    el.style.height = `${Math.max(next, 24)}px`;
		  }, [messageInput]);

  useAuthGateLifecycleEffects({
    isAuthGateOpen,
    isAuthenticated: Boolean(cloudSession),
    closeAuthGate: () => setIsAuthGateOpen(false),
    keyTarget: "window",
  });

  useEffect(() => {
    setCloudProfile(null);
    setProfileSaveError(null);
    setProfileSaveSuccess(false);
    if (profileSaveTimeoutRef.current) {
      window.clearTimeout(profileSaveTimeoutRef.current);
      profileSaveTimeoutRef.current = null;
    }
  }, [profileStorageUserId]);

  useEffect(() => {
    if (cloudSession) return;
    if (!profileName && !profileUsername && !profileBio && !profileAvatarUrl) return;
    setProfileName("");
    setProfileUsername("");
    setProfileBio("");
    setProfileAvatarUrl(null);
  }, [cloudSession, profileName, profileUsername, profileBio, profileAvatarUrl]);

  useEffect(() => {
    if (!cloudSession) return;
    const sessionDisplayName = String(cloudSession.user?.displayName ?? "").trim();
    const sessionAvatarUrl = String(cloudSession.user?.avatarUrl ?? "").trim() || null;
    if (sessionDisplayName) {
      setProfileName((prev) => (prev.trim() ? prev : sessionDisplayName));
    }
    if (sessionAvatarUrl) {
      setProfileAvatarUrl((prev) => prev ?? sessionAvatarUrl);
    }
  }, [cloudSession?.user?.displayName, cloudSession?.user?.avatarUrl]);

  const isProfileDirty = useMemo(() => {
    if (!cloudSession) return false;
    const nextName = profileName.trim();
    const nextBio = profileBio.trim();
    const nextAvatar = profileAvatarUrl ?? null;
    const prevName = (cloudProfile?.display_name ?? "").trim();
    const prevBio = (cloudProfile?.bio ?? "").trim();
    const prevAvatar = cloudProfile?.avatar_url ?? null;
    if (!cloudProfile) {
      return Boolean(nextName || nextBio || nextAvatar);
    }
    return nextName !== prevName || nextBio !== prevBio || nextAvatar !== prevAvatar;
  }, [cloudProfile, profileAvatarUrl, profileBio, profileName, cloudSession]);
  const profileNeedsSave = Boolean(cloudSession && (isProfileDirty || cloudProfile === null));

  useWebGuestThreadLifecycle<CloudAuthSession, GuestThreadStorageV1, ThreadMessage>({
    ...cloudSessionArg,
    publicRouteKind: publicRoute.kind,
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

  const activeThreadStreamingContentForAutoScroll =
    cloudSession && activeThreadId ? threadStreamingStateById[activeThreadId]?.content ?? null : streamingContent;

  useEffect(() => {
    if (!activeThreadId) return;
    const threadModelId = threads.find((t) => t.id === activeThreadId)?.model_id ?? null;
    if (threadModelId) setActiveModelId(threadModelId);
  }, [activeThreadId, threads]);

  const { handleWorkspaceScroll } = useWorkspaceAutoScroll({
    workspaceMessageListRef,
    isLoadingThreadRef,
    autoScrollEnabledRef,
    lastWorkspaceScrollTopRef,
    setIsWorkspaceAtBottom,
    autoScrollDependencies: [threadMessages, activeThreadStreamingContentForAutoScroll],
    scrollBehavior: "auto",
  });

  useEffect(() => {
    if (activeView !== "settings" || settingsGroup !== "agent") return;
    const q = personalMemoryQuery.trim();
    const handle = window.setTimeout(() => {
      void searchPersonalMemoryItems(q);
    }, 150);
    return () => window.clearTimeout(handle);
  }, [activeView, settingsGroup, personalMemoryQuery, cloudSession]);

  useEffect(() => {
    setCommunityChatError(null);
    const cachedCommunityMessages = activeCommunityId
      ? loadCachedCommunityChatMessages(activeCommunityId)
      : [];
    setCommunityMessages(cachedCommunityMessages);
    setMessageReactions([]);
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

  useEffect(() => {
    setCommunityMembersRoleFilter("all");
    setCommunityMembersPlanFilter("all");
  }, [activeCommunityId]);

  useEffect(() => {
    if (!activeCommunityId) return;
    saveCachedCommunityChatMessages(activeCommunityId, communityMessages);
  }, [activeCommunityId, communityMessages]);

  useWebThreadDiscoverChatLifecycle<CloudAuthSession, ThreadMessage>({
    ...cloudSessionArg,
    activeThreadId,
    guestThreadId: GUEST_THREAD_ID,
    activePage,
    activeCommunityId,
    communityTab,
    isLoadingThreadRef,
    autoScrollEnabledRef,
    lastWorkspaceScrollTopRef,
    setIsWorkspaceAtBottom,
    setLoadingThreadMessagesThreadId,
    setThreadMessages,
    discoverCommunitiesCount: discoverCommunities.length,
    loadThreadMessages,
    loadDiscoverCommunities,
    loadCommunityChat,
  });

  useCommunitySettingsAccessLifecycle<CloudAuthSession, CommunityRecord>({
    activePage,
    communityTab,
    ...cloudSessionArg,
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
    reactToPost: handleReactToCommunityFeedPost,
    retry: retryCommunityAiFeed,
  } = useCommunityAiFeedController<CloudAuthSession>({
    activeCommunityId,
    isAiFeedTabActive: communityTab === "ai_feed",
    viewerCacheKey: cloudSession?.user?.id ?? "anonymous",
    session: cloudSession,
    ensureSession: ensureUsableCloudSession,
  });

  useCommunityAgentMembersLifecycle<CloudAuthSession, CommunityAgentConfig>({
    activePage,
    communityTab,
    ...cloudSessionArg,
    activeCommunityId,
    canManageMembersActiveCommunity,
    loadCommunityAgentConfig,
    communityAgentConfigLoadedCommunityIdRef,
    setCommunityAgentConfigError,
    loadCommunityMembers,
  });

  const activeCommunityMembersJoinReviewMode = useMemo<CommunityMembersJoinReviewMode | null>(() => {
    if (!activeCommunity) return null;
    return deriveCommunityMembersJoinReviewMode({
      entry_policy: activeCommunity.entry_policy,
    });
  }, [activeCommunity]);

  useCommunityMembersReviewLifecycle<
    CloudAuthSession,
    CommunityJoinRequest,
    CommunityRecord
  >({
    activePage,
    communityTab,
    ...cloudSessionArg,
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

  useCommunityResourcesTabLifecycle<CloudAuthSession>({
    activePage,
    communityTab,
    ...cloudSessionArg,
    activeCommunityId,
    loadCommunityResources,
    requireCommunityPage: true,
  });

  useCommunityAdminAnalyticsLifecycle({
    activePage,
    communityTab,
    ...cloudSessionArg,
    activeCommunityId,
    canViewActiveCommunityAnalytics,
    communityAnalyticsRange,
    getCommunityCreatedAt: () => communities.find((community) => community.id === activeCommunityId)?.created_at ?? null,
    loadCommunityAnalytics,
    resetCommunityAnalytics,
  });

  const handleSignIn = useCallback(async () => {
    const canonicalAuthStartUrl = resolveCanonicalGoogleAuthStartUrl();
    if (canonicalAuthStartUrl) {
      window.location.assign(canonicalAuthStartUrl);
      return;
    }
    await beginGoogleSignInFlow();
  }, [beginGoogleSignInFlow, resolveCanonicalGoogleAuthStartUrl]);

  function resumePendingAuthIntent(): void {
    if (!cloudSession) return;
    const intent = readPendingAuthIntent();
    if (!intent) return;
    clearPendingAuthIntent();
    routePendingAuthIntent(intent, {
      select_model: (payload) => {
        const modelId = payload.model_id.trim();
        if (!modelId) return;
        setActiveModelId(modelId);
      },
      connect_provider: (payload) => {
        if (payload.provider === "chatgpt") {
          void handleConnectChatgpt();
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

  async function handleSendMagicLink(email: string): Promise<void> {
    const trimmed = email.trim();
    if (!trimmed) {
      setMagicLinkError("Email is required.");
      setMagicLinkStatus("idle");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setMagicLinkError("Enter a valid email.");
      setMagicLinkStatus("idle");
      return;
    }

    clearCloudSignedOutIntentMarker();
    markCloudAuthFlowPending();
    storeAuthReturnTo(`${window.location.pathname}${window.location.search}`);
    setMagicLinkStatus("sending");
    setMagicLinkError(null);
    try {
      await sendCloudMagicLinkOtp({
        email: trimmed,
        createUser: true,
        redirectTo: getOAuthRedirectUrl(),
      });
      setMagicLinkStatus("sent");
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to send magic link.";
      setMagicLinkError(message);
      setMagicLinkStatus("idle");
    }
  }

  const loadOpenRouterConnection = useCallback(async (session: CloudAuthSession): Promise<void> => {
    const usableSession = await ensureUsableCloudSession(session);
    if (!usableSession) return;
    setIsLoadingOpenRouterConnection(true);
    setIsLoadingChatgptConnection(true);
    try {
      const result = await loadCloudProviderConnections({
        session: usableSession,
      });
      setOpenRouterConnection(result.openrouter);
      setChatgptConnection(result.chatgpt);
      setOpenRouterConnectionError(null);
      setChatgptConnectionError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load provider connections.";
      setOpenRouterConnectionError(message);
      setChatgptConnectionError(message);
    } finally {
      setIsLoadingOpenRouterConnection(false);
      setIsLoadingChatgptConnection(false);
    }
  }, [ensureUsableCloudSession]);

  const handleConnectOpenRouter = useCallback(async (): Promise<void> => {
    const session = await ensureUsableCloudSession();
    if (!session) {
      openAuthGate({ reason: "connect_provider", payload: { provider: "openrouter" } });
      return;
    }
    const apiKey = openRouterApiKeyDraft.trim();
    if (!apiKey) {
      setOpenRouterConnectionError("OpenRouter API key is required.");
      setOpenRouterConnectionSuccess(null);
      return;
    }
    setIsSavingOpenRouterConnection(true);
    setOpenRouterConnectionError(null);
    setOpenRouterConnectionSuccess(null);
    try {
      const result = await connectCloudOpenRouterApiKey({
        session,
        apiKey,
      });
      setOpenRouterConnection(result.openrouter);
      setChatgptConnection(result.chatgpt);
      setOpenRouterApiKeyDraft("");
      setOpenRouterConnectionSuccess(result.openrouter.connected ? "OpenRouter connected." : "OpenRouter disconnected.");
    } catch (error) {
      setOpenRouterConnectionError(error instanceof Error ? error.message : "Failed to connect OpenRouter.");
    } finally {
      setIsSavingOpenRouterConnection(false);
    }
  }, [ensureUsableCloudSession, openAuthGate, openRouterApiKeyDraft]);

  const handleDisconnectOpenRouter = useCallback(async (): Promise<void> => {
    const session = await ensureUsableCloudSession();
    if (!session) return;
    setIsSavingOpenRouterConnection(true);
    setOpenRouterConnectionError(null);
    setOpenRouterConnectionSuccess(null);
    try {
      const result = await disconnectCloudOpenRouterApiKey({
        session,
      });
      setOpenRouterConnection(result.openrouter);
      setChatgptConnection(result.chatgpt);
      setOpenRouterApiKeyDraft("");
      setOpenRouterConnectionSuccess("OpenRouter disconnected.");
    } catch (error) {
      setOpenRouterConnectionError(error instanceof Error ? error.message : "Failed to disconnect OpenRouter.");
    } finally {
      setIsSavingOpenRouterConnection(false);
    }
  }, [ensureUsableCloudSession]);

  const resetChatgptConnectFlowState = useCallback((): void => {
    if (chatgptConnectPollTimeoutRef.current) {
      window.clearTimeout(chatgptConnectPollTimeoutRef.current);
      chatgptConnectPollTimeoutRef.current = null;
    }
    setChatgptDeviceLoginId(null);
    setChatgptDeviceVerificationUrl(null);
    setChatgptDeviceUserCode(null);
    setChatgptDevicePollIntervalSeconds(5);
    setChatgptManualAuthorizeUrl(null);
    setChatgptManualCallbackInput("");
  }, []);

  const handleConnectChatgpt = useCallback((): void => {
    const session = sessionRef.current ?? cloudSession;
    if (!session) {
      openAuthGate({ reason: "connect_provider", payload: { provider: "chatgpt" } });
      return;
    }
    setChatgptConnectionError(null);
    setChatgptConnectionSuccess(null);
    if (!chatgptDeviceLoginId && !chatgptManualAuthorizeUrl) {
      resetChatgptConnectFlowState();
    }
    setIsChatgptConnectModalOpen(true);
  }, [chatgptDeviceLoginId, chatgptManualAuthorizeUrl, cloudSession, openAuthGate, resetChatgptConnectFlowState]);

  const handleStartChatgptDeviceConnect = useCallback(async (): Promise<void> => {
    const session = await ensureUsableCloudSession();
    if (!session) {
      openAuthGate({ reason: "connect_provider", payload: { provider: "chatgpt" } });
      return;
    }
    resetChatgptConnectFlowState();
    setIsConnectingChatgpt(true);
    setChatgptConnectionError(null);
    setChatgptConnectionSuccess(null);
    try {
      const result = await beginCloudChatgptConnect({
        session,
        returnToPath: `${window.location.pathname}${window.location.search}`,
      });
      setChatgptDeviceLoginId(result.login_id);
      setChatgptDeviceVerificationUrl(result.verification_url);
      setChatgptDeviceUserCode(result.user_code);
      setChatgptDevicePollIntervalSeconds(Math.max(1, result.poll_interval_seconds || 5));
      setIsChatgptConnectModalOpen(true);
    } catch (error) {
      setChatgptConnectionError(error instanceof Error ? error.message : "Failed to start ChatGPT sign-in.");
    } finally {
      setIsConnectingChatgpt(false);
    }
  }, [ensureUsableCloudSession, openAuthGate, resetChatgptConnectFlowState]);

  const handleOpenChatgptAuthorizePage = useCallback(() => {
    if (!chatgptDeviceVerificationUrl) return;
    window.open(chatgptDeviceVerificationUrl, "_blank", "noopener,noreferrer");
  }, [chatgptDeviceVerificationUrl]);

  const handleStartChatgptManualConnect = useCallback(async (): Promise<void> => {
    const session = await ensureUsableCloudSession();
    if (!session) {
      openAuthGate({ reason: "connect_provider", payload: { provider: "chatgpt" } });
      return;
    }
    setIsConnectingChatgpt(true);
    setChatgptConnectionError(null);
    setChatgptConnectionSuccess(null);
    try {
      const result = await beginCloudChatgptManualConnect({
        session,
        returnToPath: `${window.location.pathname}${window.location.search}`,
      });
      setChatgptManualAuthorizeUrl(result.authorize_url);
      setChatgptManualCallbackInput("");
      window.open(result.authorize_url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setChatgptConnectionError(error instanceof Error ? error.message : "Failed to start ChatGPT browser login.");
    } finally {
      setIsConnectingChatgpt(false);
    }
  }, [ensureUsableCloudSession, openAuthGate]);

  const handleOpenChatgptManualAuthPage = useCallback(() => {
    if (!chatgptManualAuthorizeUrl) return;
    window.open(chatgptManualAuthorizeUrl, "_blank", "noopener,noreferrer");
  }, [chatgptManualAuthorizeUrl]);

  const handlePollChatgptConnect = useCallback(async (): Promise<boolean> => {
    const session = await ensureUsableCloudSession();
    if (!session) {
      openAuthGate({ reason: "connect_provider", payload: { provider: "chatgpt" } });
      return false;
    }
    const loginId = String(chatgptDeviceLoginId ?? "").trim();
    if (!loginId) {
      setChatgptConnectionError("ChatGPT sign-in is not active. Start the connection flow again.");
      return false;
    }
    setIsPollingChatgptConnection(true);
    setChatgptConnectionError(null);
    setChatgptConnectionSuccess(null);
    try {
      const result = await pollCloudChatgptConnect({
        session,
        loginId,
      });
      if (result.status !== "connected") return false;
      setOpenRouterConnection(result.openrouter);
      setChatgptConnection(result.chatgpt);
      setIsChatgptConnectModalOpen(false);
      resetChatgptConnectFlowState();
      setChatgptConnectionSuccess("ChatGPT connected.");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to complete ChatGPT sign-in.";
      setChatgptConnectionError(message);
      const normalized = message.toLowerCase();
      if (normalized.includes("expired") || normalized.includes("invalid")) {
        resetChatgptConnectFlowState();
      }
      return false;
    } finally {
      setIsPollingChatgptConnection(false);
    }
  }, [chatgptDeviceLoginId, ensureUsableCloudSession, openAuthGate, resetChatgptConnectFlowState]);

  const handleCompleteChatgptManualConnect = useCallback(async (): Promise<void> => {
    const session = await ensureUsableCloudSession();
    if (!session) {
      openAuthGate({ reason: "connect_provider", payload: { provider: "chatgpt" } });
      return;
    }
    const callbackInput = chatgptManualCallbackInput.trim();
    if (!callbackInput) {
      setChatgptConnectionError("Paste the full localhost callback URL from the browser address bar.");
      return;
    }
    setIsCompletingChatgptConnection(true);
    setChatgptConnectionError(null);
    setChatgptConnectionSuccess(null);
    try {
      const result = await completeCloudChatgptConnect({
        session,
        callbackInput,
      });
      setOpenRouterConnection(result.openrouter);
      setChatgptConnection(result.chatgpt);
      setIsChatgptConnectModalOpen(false);
      resetChatgptConnectFlowState();
      setChatgptConnectionSuccess("ChatGPT connected.");
    } catch (error) {
      setChatgptConnectionError(error instanceof Error ? error.message : "Failed to complete ChatGPT browser login.");
    } finally {
      setIsCompletingChatgptConnection(false);
    }
  }, [chatgptManualCallbackInput, ensureUsableCloudSession, openAuthGate, resetChatgptConnectFlowState]);

  const handleDisconnectChatgpt = useCallback(async (): Promise<void> => {
    const session = await ensureUsableCloudSession();
    if (!session) return;
    setIsConnectingChatgpt(true);
    setChatgptConnectionError(null);
    setChatgptConnectionSuccess(null);
    try {
      const result = await disconnectCloudChatgpt({
        session,
      });
      setOpenRouterConnection(result.openrouter);
      setChatgptConnection(result.chatgpt);
      setChatgptConnectionSuccess("ChatGPT disconnected.");
    } catch (error) {
      setChatgptConnectionError(error instanceof Error ? error.message : "Failed to disconnect ChatGPT.");
    } finally {
      setIsConnectingChatgpt(false);
    }
  }, [ensureUsableCloudSession]);

  const handleCloseChatgptConnectModal = useCallback((): void => {
    if (isConnectingChatgpt || isCompletingChatgptConnection) return;
    setIsChatgptConnectModalOpen(false);
    setChatgptConnectionError(null);
    if (!chatgptDeviceLoginId && !chatgptManualAuthorizeUrl) {
      resetChatgptConnectFlowState();
    }
  }, [
    chatgptDeviceLoginId,
    chatgptManualAuthorizeUrl,
    isCompletingChatgptConnection,
    isConnectingChatgpt,
    resetChatgptConnectFlowState,
  ]);

  useEffect(() => {
    const session = cloudSession;
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
      setIsConnectingChatgpt(false);
      setIsPollingChatgptConnection(false);
      setIsCompletingChatgptConnection(false);
      setIsChatgptConnectModalOpen(false);
      setChatgptDeviceLoginId(null);
      setChatgptDeviceVerificationUrl(null);
      setChatgptDeviceUserCode(null);
      setChatgptDevicePollIntervalSeconds(5);
      setChatgptManualAuthorizeUrl(null);
      setChatgptManualCallbackInput("");
      setOpenRouterApiKeyDraft("");
      setOpenRouterConnectionError(null);
      setOpenRouterConnectionSuccess(null);
      setChatgptConnectionError(null);
      setChatgptConnectionSuccess(null);
      return;
    }
    void (async () => {
      const usableSession = await ensureUsableCloudSession(session);
      if (!usableSession) return;
      await Promise.all([
        loadUserMemorySettings(usableSession),
        loadOpenRouterConnection(usableSession),
      ]);
    })();
  }, [cloudSession, loadOpenRouterConnection]);

  useEffect(() => {
    if (!chatgptDeviceLoginId || !cloudSession || chatgptConnection.connected) return;
    if (isPollingChatgptConnection) return;
    if (chatgptConnectPollTimeoutRef.current) {
      window.clearTimeout(chatgptConnectPollTimeoutRef.current);
      chatgptConnectPollTimeoutRef.current = null;
    }
    const timeoutId = window.setTimeout(() => {
      void handlePollChatgptConnect();
    }, Math.max(1, chatgptDevicePollIntervalSeconds) * 1000);
    chatgptConnectPollTimeoutRef.current = timeoutId;
    return () => {
      if (chatgptConnectPollTimeoutRef.current === timeoutId) {
        window.clearTimeout(timeoutId);
        chatgptConnectPollTimeoutRef.current = null;
      }
    };
  }, [
    chatgptConnection.connected,
    chatgptDeviceLoginId,
    chatgptDevicePollIntervalSeconds,
    cloudSession,
    handlePollChatgptConnect,
    isPollingChatgptConnection,
  ]);

  async function handleSignOut() {
    // Fail closed immediately so a fast refresh cannot rehydrate auth.
    clearPersistedCloudSession();
    clearCloudAuthFlowPending();
    clearOAuthCallbackParamsFromLocation();

    const accessToken = (sessionRef.current?.access_token ?? cloudSession?.access_token ?? "").trim();
    authSessionEpochRef.current += 1;
    setAuthError(null);
    stopAllStreamingTurns();
    await resetSessionStateAfterSessionLoss();
    if (accessToken) {
      void revokeCloudSessionRemote(accessToken);
    }
  }

  async function fetchWithCloudPublic(url: string, init: RequestInit = {}): Promise<Response> {
    return await fetchWithCloudPublicShared(url, init);
  }

  function sessionsEqual(
    a: CloudAuthSession | null | undefined,
    b: CloudAuthSession | null | undefined,
  ): boolean {
    if (!a || !b) return false;
    return a.access_token === b.access_token;
  }

  function adoptCloudSession(session: CloudAuthSession): void {
    sessionRef.current = session;
    setCloudSession(session);
  }

  async function fetchWithCloudAuth(url: string, init: RequestInit, session: CloudAuthSession): Promise<Response> {
    return await fetchWithCloudAuthShared({
      url,
      init,
      session: sessionRef.current ?? session,
      sessionRef,
      refreshLocked: refreshCloudSessionLocked,
      refreshLockedResult: refreshCloudSessionLockedResult,
      onSessionExpired: () => {
        authSessionEpochRef.current += 1;
        return resetSessionStateAfterSessionLoss();
      },
      sessionExpiredMessage: CLOUD_SESSION_EXPIRED_MESSAGE,
    });
  }

  const {
    joinPublicCommunity,
    loadPublicCommunity,
    startCheckoutForPlan,
  } = useWebPublicFunnelActions<
    PublicCommunityRecord,
    PublicPlanSummary,
    MyCommunityJoinRequest
  >({
    getSession: () => sessionRef.current,
    getCurrentPublicCommunitySlug: () => publicCommunity?.slug ?? null,
    ensureSession: ensureUsableCloudSession,
    ...cloudSessionArg,
    openAuthGate,
    loadCommunities,
    openCommunityWorkspace: ({ communityId, communitySlug }) =>
      enterJoinedCommunity({ communityId, communitySlug }),
    isUuid,
    setIsJoiningPublicCommunity,
    setPublicJoinError,
    setPublicCommunity,
    setPublicCommunityAccess,
    setIsLoadingMyPublicCommunityJoinRequest,
    setMyPublicCommunityJoinRequest,
    setIsLoadingPublicCommunity,
    setPublicCommunityError,
    setPublicCommunityPlans,
    setCheckoutError,
    setCheckoutStatus,
    navigateToUrl: (url) => window.location.assign(url),
  });

  const { startBuilderPlanCheckout } =
    useWebBuilderBillingActions({
      getSession: () => sessionRef.current,
      ensureSession: ensureUsableCloudSession,
      openAuthGate: (intent) => openAuthGate(intent),
      setBuilderBillingError,
      setIsStartingBuilderCheckout,
      navigateToUrl: (url) => window.location.assign(url),
    });

  const {
    redeemPurchaseClaim,
    loadPendingPurchaseClaims,
    loadBuilderBillingStatus,
    redeemPendingPurchases,
  } = useWebCommerceAffiliateActions({
    getSession: () => sessionRef.current,
    ensureSession: ensureUsableCloudSession,
    openAuthGate,
    openCommunityWorkspace: ({ communityId, communitySlug }) =>
      enterJoinedCommunity({ communityId, communitySlug }),
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
    const session = await ensureUsableCloudSession();
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

  const {
    openCreateCommunityModal,
    closeCreateCommunityModal,
    resumeCreateCommunityIntent,
    handleCreateCommunityPrimaryAction,
    handleCreateCommunityAvatarUpload,
    handleCreateCommunityBannerUpload,
    handleCreateBannerDrop,
    handleCreateAvatarDrop,
  } = useCommunityCreateController<CloudAuthSession, CommunityRecord, BuilderBillingStatus>({
    ...authenticatedCloudSessionArg,
    builderBillingStatus,
    communities,
    communityRoleById,
    loadBuilderBillingStatus,
    persistCreateCommunityIntent,
    onStartUpgradeFlow: () => {
      setBuilderUpgradeContext("create_community");
      setIsBuilderUpgradeOpen(true);
    },
    onPrimaryUnauthenticated: (draft) => {
      openAuthGate({ reason: "create_community", payload: { draft } });
    },
    onCreateUnauthenticated: (draft) => {
      openAuthGate({ reason: "create_community", payload: { draft } });
    },
    onOwnedCommunityLimitReached: () => {
      showAppToastMessage("You've built the maximum number of communities");
    },
    onCommunityCreated: (community) => {
      setCommunities((prev) => [community, ...prev]);
      setCommunityRoleById((prev) => ({ ...prev, [community.id]: "owner" }));
      openCommunityTab(community.id, "chat", { pushSnapshot: false });
    },
    createCommunityName,
    createCommunitySlug,
    createCommunitySlugEdited,
    createCommunityVisibility,
    createCommunityAvatarUrl,
    createCommunityOneLiner,
    createCommunityBannerUrl,
    setCreateCommunityName,
    setCreateCommunitySlug,
    setCreateCommunitySlugEdited,
    setCreateCommunityVisibility,
    setCreateCommunityAvatarUrl,
    setCreateCommunityOneLiner,
    setCreateCommunityBannerUrl,
    setCreateCommunityError,
    setShowCreateCommunityModal,
    setIsCreatingCommunity,
    setIsCreateAvatarDragOver,
    setIsCreateBannerDragOver,
    readAvatarFileAsSquareDataUrl,
    readBannerFileAsWideDataUrlWithinLimit,
    isLikelyImageFile,
    maxCreateImageDataUrlChars: MAX_WEB_IMAGE_DATA_URL_CHARS,
    createUnauthenticatedErrorMessage: "Sign in to create a community.",
    bannerLoadFailureMessage: "Failed to load banner.",
  });

  const resumePendingCreateCommunityIntent = useCallback((): void => {
    const intent = readPendingAuthIntent();
    if (!intent || intent.reason !== "create_community") return;
    clearPendingAuthIntent();
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
    publicPrimaryCtaState,
    isPublicDebugEnabled,
    publicDebugState,
    memberCountOverride,
  } = useWebPublicCommunityRouteController<PublicCommunityRecord, MyCommunityJoinRequest>({
    publicRoute,
    publicCommunity,
    publicCommunityPlans,
    publicCommunityAccess,
    myPublicCommunityJoinRequest,
    isSignedIn: Boolean(cloudSession),
    isAuthBootstrapComplete,
    sessionDependency: cloudSession,
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

  useWebJoinedCommunityRouteResolution<CloudAuthSession, CommunityRecord, CommunityAccess>({
    publicRouteKind: publicRoute.kind,
    activePage,
    activeCommunityId,
    activeCommunitySlug,
    communities,
    cloudSession,
    isAuthBootstrapComplete,
    ensureSession: ensureUsableCloudSession,
    loadCommunities,
    syncCommunitySelection,
    navigateTo,
  });

  useWebPostAuthBillingLifecycle({
    session: cloudSession,
    sessionRef,
    claimTokenParam,
    isRedeemingClaim,
    isJoiningPublicCommunity,
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
    getCloudAuthUid,
    redeemPurchaseClaim,
    redeemPendingPurchases,
    loadPendingPurchaseClaims,
    loadBuilderBillingStatus,
    joinPublicCommunity,
    resumeCreateCommunityIntent: resumePendingCreateCommunityIntent,
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
    session: CloudAuthSession;
  };

  const [, setWorkspaceLensStatus] = useState<{ inFlight: boolean; targetName: string | null }>({
    inFlight: false,
    targetName: null,
  });

  const workspaceLensController = useLastClickWinsController<WorkspaceLensTarget>({
    applyTarget: async (desired) => {
      await setThreadCommunityLens(desired.threadId, desired.communityId, desired.session);
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
    const currentLens = threads.find((t) => t.id === target.threadId)?.community_id ?? null;
    if (currentLens === target.communityId && !workspaceLensController.isInFlight()) {
      return Promise.resolve();
    }
    return workspaceLensController.requestTarget(target);
  };

  const syncWorkspaceThreadCommunityLens = (
    threadId: string,
    desiredCommunityId: string | null,
    session: CloudAuthSession,
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
      const session = cloudSession;
      if (!session) return Promise.resolve();
      return syncWorkspaceThreadCommunityLens(thread.id, desiredCommunityId, session);
    },
    onSelectThread: (thread: ThreadRecord) => {
      const projectId = (thread.project_id ?? "").trim();
      enterWorkspaceThread({
        threadId: thread.id,
        projectId: projectId || null,
        communityId: thread.community_id ?? undefined,
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
    session: CloudAuthSession,
  ): Promise<void> => {
    void session;
    return webThreadContextController.ensureLensBeforeSend(threadId);
  };

  async function loadCloudProjects(session: CloudAuthSession): Promise<void> {
    const usableSession = await ensureUsableCloudSession(session);
    if (!usableSession) return;
    try {
      const next = (await fetchMappedDaytonaCloudProjects({
        session: usableSession,
      })).map(({ description: _description, ...project }) => project satisfies CloudProjectRecord);
      setCloudProjects(next);
      setCloudProjectExpandedById((prev) => {
        const nextExpanded: Record<string, boolean> = { ...prev };
        for (const project of next) {
          nextExpanded[project.id] = prev[project.id] ?? true;
        }
        return nextExpanded;
      });
      setActiveCloudProjectId((prev) => resolvePreferredCloudProjectId(next, prev));
    } catch (error) {
      console.warn("Failed to load cloud projects:", error);
      setCloudProjects([]);
      setActiveCloudProjectId(null);
    }
  }

  function handleStartDraftInCloudProject(projectId: string): void {
    openWorkspaceDraft({
      projectId,
      focusComposer: () => workspaceAskInputRef.current?.focus(),
    });
  }

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
    session: CloudAuthSession,
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

  const hasPaidAccess = Boolean(cloudSession) && hasBuilderTierPaidAccess(builderBillingStatus?.builder_tier ?? "free");
  const hasUserKeyConnection = Boolean(cloudSession) && openRouterConnection.connected;
  const hasUserChatgptConnection = Boolean(cloudSession) && chatgptConnection.connected;
  const hasPendingChatgptAuth = Boolean(chatgptDeviceLoginId || chatgptManualAuthorizeUrl);
  const shouldShowEmptyThreadChatgptCard =
    Boolean(cloudSession) &&
    !hasUserChatgptConnection &&
    !isLoadingChatgptConnection;

  const { sendUserMessage, retryLastTurn } = useWebSendFlowController<
    CloudAuthSession,
    MessageAttachment,
    ThreadRecord,
    ThreadMessage
  >({
    getSession: () => sessionRef.current,
    ensureSession: ensureUsableCloudSession,
    openAuthGate,
    ensureWorkspaceThreadLensBeforeSend,
    createThread,
    onThreadCreated: (thread) => {
      enterWorkspaceThread({
        threadId: thread.id,
        projectId: (thread.project_id ?? "").trim() || null,
        communityId: thread.community_id ?? undefined,
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
    messageInput,
    workspaceAttachments,
    workspaceWantsNewChat,
    isSendingMessage,
    isThreadRunActive,
    activeThreadId,
    threadMessages,
    threads,
    activeModelId,
    modelToggles,
    userMemoryRememberEnabled: userMemorySettings.remember_intent_enabled !== false,
    builderTier: builderBillingStatus?.builder_tier ?? null,
    hasPaidAccess:
      Boolean(cloudSession) &&
      hasBuilderTierPaidAccess(builderBillingStatus?.builder_tier ?? "free"),
    loadBuilderBillingStatus,
    hasUserKeyConnection,
    hasUserChatgptConnection,
    guestThreadId: GUEST_THREAD_ID,
    guestModelId,
    guestModelAllowlist: GUEST_MODEL_ALLOWLIST,
    defaultActiveModelId: DEFAULT_ACTIVE_MODEL_ID,
    defaultGuestModelId: DEFAULT_GUEST_MODEL_ID,
    workspaceAttachmentsRef,
    autoScrollEnabledRef,
    setThreadError,
    setThreadErrorForThread,
    setIsSendingMessage,
    setThreadRunSending,
    setIsWorkspaceAtBottom,
    setWorkspaceWantsNewChatMode,
    setActiveThreadId,
    setThreadMessages,
    setMessageInput,
    setWorkspaceAttachments,
    setThreads,
    setActiveModelId,
    setBuilderUpgradeContext: (next) => setBuilderUpgradeContext(next as BuilderUpgradeContext),
    setBuilderBillingError,
    setIsBuilderUpgradeOpen,
  });

  const { resetGuestThread, exportThreadsCsv, exportMessagesCsv, exportMemoryCsv } =
    useWebWorkspaceActionsController<CloudAuthSession, MessageAttachment, ThreadMessage>({
      getSession: () => sessionRef.current,
      buildCsv,
      downloadTextFile,
      parseMessageText,
      storeGuestThreadStorage,
      focusWorkspaceInput: () => {
        workspaceAskInputRef.current?.focus();
      },
      activeThreadId,
      guestModelId,
      setThreadError,
      setMessageInput,
      setWorkspaceAttachments,
      setActiveThreadId,
      setWorkspaceWantsNewChatMode,
      setThreadMessages,
      setExportError,
      setIsExporting,
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
    setIsProfileAvatarDragOver,
    setCommunitySettingsAvatarUrl,
    setCommunitySettingsBannerUrl,
    setCommunitySettingsBannerFocusX,
    setCommunitySettingsBannerFocusY,
    setCommunitySettingsBannerZoom,
    setCommunitySettingsError,
    setCommunitySettingsBannerUploadError,
    setIsProcessingCommunitySettingsBanner,
    markCommunitySettingsDirty,
    onCommunityBannerUploadSuccess: () => setIsCommunityBannerFocusModalOpen(true),
    isLikelyImageFile,
    maxWebImageDataUrlChars: MAX_WEB_IMAGE_DATA_URL_CHARS,
    setProfileAvatarUrl,
    setAuthError,
  });

  const normalizedBuilderTier = useMemo<"free" | "builder" | "architect">(
    () => normalizeBuilderTierForUi(builderBillingStatus?.builder_tier),
    [builderBillingStatus?.builder_tier],
  );
  const canUseDevTierOverride = useMemo(
    () =>
      canUseCreatorDevTierOverride({
        email: cloudSession?.user?.email ?? null,
        isDev: import.meta.env.DEV,
        featureFlag: import.meta.env.VITE_ENABLE_DEV_TIER_OVERRIDE,
      }),
    [cloudSession?.user?.email],
  );
  const userAccessPolicy = useMemo(
    () =>
      resolveUserAccessPolicy({
        surface: "web",
        authState: cloudSession ? "authenticated" : "anonymous",
        builderTier: builderBillingStatus?.builder_tier ?? null,
      }),
    [cloudSession, builderBillingStatus?.builder_tier],
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
  } = useWebVoiceInputController<CloudAuthSession>({
    ...authenticatedCloudSessionArg,
    sessionRef: sessionRef,
    activeCommunity,
    activeCommunityJoinMode,
    canPostMessagesActiveCommunity,
    normalizedBuilderTier,
    openAuthGate: () => openAuthGate(),
    showAppToastMessage,
    setWorkspaceInput: setMessageInput,
    workspaceInputRef: workspaceAskInputRef,
    setCommunityMessageInput,
    chatInputRef,
  });

  const filteredCommunityMembers = useMemo(() => {
    const roleFilter = (communityMembersRoleFilter ?? "all").trim().toLowerCase();
    const planFilter = canViewMemberPlanDetailsActiveCommunity
      ? (communityMembersPlanFilter ?? "all").trim().toLowerCase()
      : "all";
    const ownerId = activeCommunity?.owner_id ?? null;
    return communityMembers.filter((member) => {
      const memberIsOwner = Boolean(ownerId && member.user_id === ownerId);
      const effectiveRole = memberIsOwner ? "owner" : String(member.role ?? "").trim().toLowerCase();
      if (roleFilter !== "all" && effectiveRole !== roleFilter) return false;
      if (planFilter === "all") return true;
      return String(member.price_point_id ?? "").trim() === planFilter;
    });
  }, [
    activeCommunity?.owner_id,
    canViewMemberPlanDetailsActiveCommunity,
    communityMembers,
    communityMembersPlanFilter,
    communityMembersRoleFilter,
  ]);

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
	      const trimmedName = profileName.trim();
	      const trimmedUsername = profileUsername.trim();
	      if (cloudSession?.user.id === userId) {
	        if (trimmedName) return trimmedName;
	        if (trimmedUsername) return trimmedUsername.startsWith("@") ? trimmedUsername : `@${trimmedUsername}`;
          const sessionDisplayName = String(cloudSession.user?.displayName ?? "").trim();
          if (sessionDisplayName) return sessionDisplayName;
	      }
	      const remote = profilesByUserId[userId];
	      const remoteName = remote?.display_name?.trim();
	      if (remoteName) return remoteName;
	      return shortId(userId, cloudSession?.user.id, cloudSession?.user.email);
	    },
	    [profileName, profileUsername, profilesByUserId, cloudSession?.user.displayName, cloudSession?.user.email, cloudSession?.user.id]
	  );

  const activeThread = useMemo(() => {
    if (!activeThreadId) return null;
    return threads.find((t) => t.id === activeThreadId) ?? null;
  }, [activeThreadId, threads]);

  const showEmptyThreadLandingSkeleton = Boolean(
    !activeThreadId &&
      cloudSession &&
      activeCommunityId &&
      activeCommunityAgentLandingCommunityIdRef.current !== activeCommunityId,
  );
  const isHydratingActiveWorkspaceThread = Boolean(
    cloudSession &&
      activeThreadId &&
      activeThreadId !== GUEST_THREAD_ID &&
      loadingThreadMessagesThreadId === activeThreadId,
  );
  const isEmptyWorkspaceThread = !threadMessages.some((message) => message.role !== "system");

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

  const visibleThreads = useMemo(() => filterVisibleThreads(threads), [threads]);
  const cloudProjectById = useMemo(() => buildProjectByIdMap(cloudProjects), [cloudProjects]);
  const defaultWorkspaceProjectId = useMemo(
    () => resolveDefaultWorkspaceProjectId(cloudProjects),
    [cloudProjects],
  );
  const resolvedActiveCloudProjectName = useMemo(() => {
    const activeName = resolvedActiveCloudProjectId
      ? String(cloudProjectById.get(resolvedActiveCloudProjectId)?.name ?? "").trim()
      : "";
    if (activeName) return activeName;
    if (!defaultWorkspaceProjectId) return "";
    return String(cloudProjectById.get(defaultWorkspaceProjectId)?.name ?? "").trim();
  }, [cloudProjectById, defaultWorkspaceProjectId, resolvedActiveCloudProjectId]);
  const resolveCloudThreadProjectId = useCallback(
    (thread: ThreadRecord): string | null => {
      return resolveCloudThreadProjectIdShared(thread, cloudProjectById, defaultWorkspaceProjectId);
    },
    [cloudProjectById, defaultWorkspaceProjectId],
  );
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
  const normalizedThreadSearch = threadSearchQuery.trim().toLowerCase();
  const threadSearchResults = useMemo(() => {
    return searchThreads(visibleThreads, normalizedThreadSearch, (thread) => {
      const title = getThreadDisplayTitle(thread);
      const communityName = thread.community_id
        ? (communities.find((c) => c.id === thread.community_id)?.name ?? "")
        : "";
      const projectId = resolveCloudThreadProjectId(thread);
      const projectName = projectId ? (cloudProjectById.get(projectId)?.name ?? "") : "";
      return `${title} ${communityName} ${projectName}`;
    });
  }, [
    cloudProjectById,
    communities,
    getThreadDisplayTitle,
    normalizedThreadSearch,
    resolveCloudThreadProjectId,
    visibleThreads,
  ]);
  const cloudProjectThreadGroups = useMemo(
    () => buildProjectThreadGroups(cloudProjects, visibleThreads, resolveCloudThreadProjectId),
    [cloudProjects, resolveCloudThreadProjectId, visibleThreads],
  );
	  const enabledModels = useMemo(() => modelToggles.filter((toggle) => toggle.enabled), [modelToggles]);

	  const guestModelLabel = useMemo(() => {
	    const label = (GUEST_MODEL_LABELS[guestModelId] ?? "").trim();
	    return label || guestModelId || "Model";
	  }, [guestModelId]);

	  const selectedModelId = useMemo(() => {
	    const isGuestModel = (modelId: string): boolean => isFreeModelId(modelId, GUEST_MODEL_ALLOWLIST);
	    const isEnabledAuthedModel = (modelId: string): boolean => modelToggles.some((toggle) => toggle.id === modelId);
	    const isKnownModel = (modelId: string): boolean =>
	      isGuestModel(modelId) || isEnabledAuthedModel(modelId);
      const canUseAuthedModel = (modelId: string): boolean => {
        if (isGuestModel(modelId)) return true;
        if (hasPaidAccess) return true;
        const supportedFundingSources = getSupportedFundingSourcesForModel(modelId);
        return (
          (hasUserKeyConnection && supportedFundingSources.includes("user_key")) ||
          (hasUserChatgptConnection && supportedFundingSources.includes("user_chatgpt"))
        );
      };
	    const threadModel = (activeThread?.model_id ?? "").trim();
	    if (
	      threadModel &&
	      isKnownModel(threadModel) &&
	      (!cloudSession || canUseAuthedModel(threadModel))
	    ) {
	      return threadModel;
	    }

	    const stored = (activeModelId ?? "").trim();
	    if (
	      stored &&
	      isKnownModel(stored) &&
	      (!cloudSession || canUseAuthedModel(stored))
	    ) {
	      return stored;
	    }

	    const fallbackModelId =
	      enabledModels.find((toggle) => toggle.id === DEFAULT_ACTIVE_MODEL_ID)?.id ??
	      enabledModels[0]?.id ??
	      modelToggles[0]?.id ??
	      "";
	    if (!cloudSession || hasPaidAccess || hasUserKeyConnection || hasUserChatgptConnection) return fallbackModelId;
	    return isGuestModel(fallbackModelId) ? fallbackModelId : DEFAULT_GUEST_MODEL_ID;
	  }, [
      activeThread?.model_id,
      activeModelId,
      enabledModels,
      hasPaidAccess,
      hasUserKeyConnection,
      hasUserChatgptConnection,
      modelToggles,
      cloudSession,
    ]);

	  const selectedModelLabel = useMemo(() => {
	    if (!selectedModelId) return "Model";
    if (isFreeModelId(selectedModelId, GUEST_MODEL_ALLOWLIST)) {
      return GUEST_MODEL_LABELS[selectedModelId] ?? selectedModelId;
    }
    return enabledModels.find((toggle) => toggle.id === selectedModelId)?.label ?? selectedModelId;
  }, [enabledModels, selectedModelId]);
	  const activeModelLabel = cloudSession ? selectedModelLabel : guestModelLabel;

  const inferProviderSection = (modelId: string): ModelSectionId => {
    const id = (modelId ?? "").trim().toLowerCase();
    const mappedProvider = String(modelProviderById[id] ?? "").trim().toLowerCase();
    return inferModelSection(modelId, mappedProvider || null);
	  };

		  type CuratedPickerModel = {
		    id: string;
		    label: string;
		    section: ModelSectionId;
        supportedFundingSources: readonly ModelFundingSource[];
		    description?: string | null;
		  };

		  const selectedPickerModelId = cloudSession ? selectedModelId : guestModelId;

		  const curatedPickerModels = useMemo(() => {
		    const byId = new Map<string, CuratedPickerModel>();
    for (const model of getFreeModelEntries()) {
      byId.set(model.id, {
        id: model.id,
        label: model.label,
        section: "free",
        supportedFundingSources: model.supportedFundingSources,
        description: model.description,
      });
    }
    for (const toggle of enabledModels) {
      byId.set(toggle.id, {
        id: toggle.id,
        label: toggle.label,
        section: inferProviderSection(toggle.id),
        supportedFundingSources: getSupportedFundingSourcesForModel(toggle.id),
      });
    }
    return Array.from(byId.values());
  }, [enabledModels, modelProviderById]);

		  const { visiblePickerModels, openModelPicker, closeModelPicker } = useModelPickerController<
		    CuratedPickerModel,
		    ModelSectionId
		  >({
		    curatedPickerModels,
		    modelPickerQuery,
		    modelPickerSection,
		    setModelPickerQuery,
		    setModelPickerSection,
		    setIsModelPickerOpen,
		    allSectionId: "all",
		  });

  useModelPickerLifecycleEffects({
    isModelPickerOpen,
    modelPickerRef,
    modelPickerSearchRef,
    closeModelPicker,
  });

		  const canSelectPickerModel = (model: CuratedPickerModel): boolean => {
        const supportsDemo = model.supportedFundingSources.includes("demo_public");
        const supportsUserKey = model.supportedFundingSources.includes("user_key");
        const supportsUserChatgpt = model.supportedFundingSources.includes("user_chatgpt");
        if (!cloudSession) return supportsDemo;
        if (supportsDemo) return true;
        const isEnabled = modelToggles.some((toggle) => toggle.id === model.id);
        if (!isEnabled) return false;
        if (hasPaidAccess) return true;
        return (hasUserKeyConnection && supportsUserKey) || (hasUserChatgptConnection && supportsUserChatgpt);
			  };

			  const handleSelectPickerModel = (model: CuratedPickerModel) => {
			    const isModelEnabled = modelToggles.some((toggle) => toggle.id === model.id);
        const supportsDemo = model.supportedFundingSources.includes("demo_public");
        const supportsUserKey = model.supportedFundingSources.includes("user_key");
        const supportsUserChatgpt = model.supportedFundingSources.includes("user_chatgpt");
			    if (!canSelectPickerModel(model)) {
			      if (cloudSession && !supportsDemo && !isModelEnabled) {
			        showAppToastMessage("This model isn't enabled yet.");
			        return;
			      }
			      if (
              cloudSession &&
              !supportsDemo &&
              !hasPaidAccess &&
              !hasUserKeyConnection &&
              !hasUserChatgptConnection &&
              (supportsUserKey || supportsUserChatgpt)
            ) {
			        if (supportsUserChatgpt && !supportsUserKey) {
                closeModelPicker();
                void handleConnectChatgpt();
                return;
              }
			        closeModelPicker();
              setActiveView("settings");
              setSettingsPage("account");
              showAppToastMessage(
                supportsUserChatgpt && !supportsUserKey
                  ? "Connect ChatGPT in Settings to use this model."
                  : supportsUserKey && !supportsUserChatgpt
                    ? "Connect OpenRouter in Settings to use this model."
                    : "Connect a provider in Settings to use this model.",
              );
			        return;
			      }
				      if (!cloudSession && !supportsDemo) {
				        closeModelPicker();
				        openAuthGate({ reason: "select_model", payload: { model_id: model.id } });
				        return;
				      }
			      if (cloudSession && supportsDemo) {
			        setActiveModelId(model.id);
			        if (activeThreadId) {
			          void updateThreadModel(activeThreadId, model.id, cloudSession);
			        }
			        closeModelPicker();
			        return;
			      }
			      showAppToastMessage("This model is not available yet.");
			      return;
			    }

			    if (!cloudSession) {
			      setGuestModelId(model.id);
			      try {
			        const storage = loadGuestThreadStorage();
			        storeGuestThreadStorage({ ...storage, model_id: model.id });
			      } catch {
			        // ignore
			      }
			      return;
			    }

			    setActiveModelId(model.id);
			    if (activeThreadId) {
			      void updateThreadModel(activeThreadId, model.id, cloudSession);
			    }
			  };

	  const filteredDiscoverCommunities = useMemo(() => {
	    const q = discoverQuery.trim().toLowerCase();
	    if (!q) return discoverCommunities;
	    return discoverCommunities.filter((community) => {
      const name = (community.name ?? "").toLowerCase();
      const slug = (community.slug ?? "").toLowerCase();
      const desc = (community.one_liner ?? "").toLowerCase();
      return name.includes(q) || slug.includes(q) || desc.includes(q);
    });
  }, [discoverCommunities, discoverQuery]);

	  const isAnonymousWorkspace = !cloudSession && publicRoute.kind === "app";
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
	    return "Open your guest chat.";
	  }, [guestThreadHasMessages, guestThreadMessages]);

	  const showCommunityRail = true;
	  const showCommunityNav = publicRoute.kind === "app" && activePage === "community";
	  const isWorkspaceSettings = activePage === "workspace" && activeView === "settings";
	  const sessionsDrawerEnabled = publicRoute.kind === "app" && activePage === "workspace" && !isWorkspaceSettings;
	  const isSessionsDrawerOpen = sessionsDrawerEnabled && userWantsSessions;
	  const hasLeftPanel = isWorkspaceSettings || showCommunityNav;
  const canReorderCommunities = railCommunities.length > 1;
  const hasCommunityRailMiddleContent =
    railCommunities.length > 0 || (communities.length === 0 && isLoadingCommunities);
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
    const currentFunnelPath = buildCommunityTabPath(slug, "funnel");
    const previewPath = buildCommunityFunnelPreviewPath(slug);
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
  const activeThreadStreamingState =
    cloudSession && activeThreadId ? threadStreamingStateById[activeThreadId] ?? null : null;
  const activeThreadStreamingContent = cloudSession ? activeThreadStreamingState?.content ?? null : streamingContent;
  const activeThreadStreamingRunId = cloudSession ? activeThreadStreamingState?.runId ?? null : streamingRunId;
  const threadError = threadErrorById[resolveThreadErrorKey(activeThreadId)] ?? null;
  const isActiveWorkspaceThreadBusy = cloudSession
    ? activeThreadId
      ? isThreadRunActive(activeThreadId)
      : isSendingMessage
    : isSendingMessage;
  const canRetryLastThreadTurn = Boolean(
    threadError &&
      cloudSession &&
      activeThreadId &&
      !isActiveWorkspaceThreadBusy &&
      lastThreadMessageRole === "user" &&
      lastThreadUserMessageId,
  );
  const showGuestRateLimitSignInAction = !cloudSession && threadError === GUEST_FREE_MODEL_LIMIT_MESSAGE;
  const displayedThreadError = showGuestRateLimitSignInAction
    ? GUEST_FREE_MODEL_LIMIT_SHORT_MESSAGE
    : threadError;
		  const workspaceThreadKey = cloudSession ? activeThreadId : GUEST_THREAD_ID;
  const isStreamingWorkspaceTurn = Boolean(
    cloudSession
      ? activeThreadStreamingContent !== null
      : isSendingMessage && streamingThreadId === workspaceThreadKey && streamingContent !== null,
  );
  const pendingToken =
    (checkoutClaimToken ?? (publicRoute.kind === "claim" ? publicRoute.token : "")).trim() ||
    readPendingPurchaseClaimToken();
  const handlePublicLandingPrimaryAction = () => {
    if (isPublicFunnelPreviewRoute) return;
    if (!publicCommunity) return;
    if (canEnterPublicCommunity && publicCommunityAccess?.community_id) {
      enterJoinedCommunity({
        communityId: publicCommunityAccess.community_id,
        communitySlug: publicCommunity.slug,
      });
      return;
    }
    if (canJoinWithCheckout && selectedPublicCommunityPlan) {
      void startCheckoutForPlan(
        publicCommunity.slug,
        selectedPublicCommunityPlan.billing_period,
        `/c/${encodeURIComponent(publicCommunity.slug)}`,
      );
      return;
    }
    if (!canJoinForFree && !canJoinWithApproval) return;
    void joinPublicCommunity({ communitySlug: publicCommunity.slug });
  };

  const handlePublicCheckoutContinue = () => {
    if (!pendingToken) return;
    if (showPublicSignIn) {
      openAuthGate({ reason: "redeem_purchase_claim", payload: { token: pendingToken } });
      return;
    }
    void redeemPurchaseClaim(pendingToken);
  };

  const handlePublicClaimContinue = () => {
    const token = (pendingToken || manualClaimToken).trim();
    if (!token) return;
    void redeemPurchaseClaim(token);
  };

  if (publicRoute.kind === "checkout_success" || publicRoute.kind === "claim") {
      return (
        <WebPublicRouteView
          publicRouteKind={publicRoute.kind}
          showSignIn={showPublicSignIn}
          onOpenAuthGate={() => openAuthGate()}
          onSignOut={() => {
            void handleSignOut();
          }}
          checkoutStatus={checkoutStatus}
          onRetryCheckoutFinalize={retryCheckoutFinalize}
          onContinueCheckout={handlePublicCheckoutContinue}
          onContinueClaim={handlePublicClaimContinue}
          onSendMagicLink={() => {
            void handleSendMagicLink(magicLinkEmail);
          }}
          checkoutError={checkoutError}
          magicLinkEmail={magicLinkEmail}
          onChangeMagicLinkEmail={setMagicLinkEmail}
          magicLinkStatus={magicLinkStatus}
          magicLinkError={magicLinkError}
          pendingToken={pendingToken}
          manualClaimToken={manualClaimToken}
          onChangeManualClaimToken={setManualClaimToken}
          isRedeemingClaim={isRedeemingClaim}
          redeemClaimError={redeemClaimError}
          isAuthGateOpen={isAuthGateOpen}
          authError={authError}
          onCloseAuthGate={() => setIsAuthGateOpen(false)}
          onSignIn={handleSignIn}
        />
      );
	    }

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
      const fallbackPath = buildCommunityTabPath(publicRoute.kind === "community_funnel_preview" ? publicRoute.slug : null, "funnel");
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
	    if (!activeCommunityId) return;
	    openCommunityChat(activeCommunityId, { clearUnread: true });
	  };
	  const handleOpenLandingProject = () => {
	    if (!resolvedActiveCloudProjectId) return;
	    handleStartDraftInCloudProject(resolvedActiveCloudProjectId);
	  };
		  const handleOpenDiscover = () => {
		    const transition = deriveOpenDiscoverTransition({ activePage });
		    if (transition.shouldPushSnapshot) pushNavSnapshot();
		    setActiveView(transition.nextView);
	    setActivePage(transition.nextPage);
	  };
	  const handleToggleWorkspaceSettings = () => {
	    const transition = deriveToggleWorkspaceSettingsTransition({ activePage, activeView });
	    if (transition.shouldPushSnapshot) pushNavSnapshot();
	    setActivePage(transition.nextPage);
	    setActiveView(transition.nextView);
	  };
  const communitySecondaryPanelsProps = buildWebCommunitySecondaryPanelsProps({
    communityTab,
    settings: {
      activeCommunity,
      hasSession: Boolean(cloudSession),
      canViewActiveCommunitySettings,
      communitySettingsLayer,
      canManageCommunitySettings,
      canDeleteCommunity: canDeleteActiveCommunity,
      openAuthGate,
      state: {
        isSettingsBannerDragOver,
        isProcessingCommunitySettingsBanner,
        isCommunityBannerFocusModalOpen,
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
        communitySettingsError,
        isSavingCommunitySettings,
        communityMemberMuted,
        isLoadingCommunityMemberSettings,
        isLeavingCommunity,
        communityMemberSettingsError,
      },
      actions: {
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
      setIsCommunityBannerFocusModalOpen,
    },
    bannerEditor: {
      isSettingsTabActive: communityTab === "settings",
      isCommunityBannerFocusModalOpen,
      bannerUrl: communitySettingsBannerUrl,
      focusX: communitySettingsBannerFocusX,
      focusY: communitySettingsBannerFocusY,
      zoom: communitySettingsBannerZoom,
      onChangeFocusX: setCommunitySettingsBannerFocusX,
      onChangeFocusY: setCommunitySettingsBannerFocusY,
      onChangeZoom: setCommunitySettingsBannerZoom,
      markCommunitySettingsDirty,
      setIsCommunityBannerFocusModalOpen,
    },
    feed: {
      capabilities: {
        hasActiveCommunity: Boolean(activeCommunity),
        hasSession: Boolean(cloudSession),
        activeCommunityName: activeCommunity?.name ?? null,
      },
      state: {
        livePosts: activeCommunityFeedState.live,
        rankedPosts: activeCommunityFeedState.ranked,
        isLoading: activeCommunityFeedState.isLoading,
        error: activeCommunityFeedState.error,
        reactingPostId: communityFeedReactingPostId,
      },
      actions: {
        react: handleReactToCommunityFeedPost,
        retry: retryCommunityAiFeed,
      },
    },
    polynet: {
      hasActiveCommunity: Boolean(activeCommunity),
      activeCommunityName: activeCommunity?.name ?? null,
      hasSession: Boolean(cloudSession),
      canManagePolynet: canViewActiveCommunityPolynet,
      onOpenAuthGate: () => openAuthGate(),
      state: communityPolynetController.state,
      actions: communityPolynetController.actions,
    },
    aiAgent: {
      activeCommunity,
      hasSession: Boolean(cloudSession),
      canManageMembersActiveCommunity,
      isLoadingCommunityAgentConfig,
      communityAgentConfigError,
      isActiveCommunityOwner,
      onOpenAuthGate: openAuthGate,
      setBuilderUpgradeContext,
      setIsBuilderUpgradeOpen,
      landingEditorProps: {
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
        previewProjectName: resolvedActiveCloudProjectName,
      },
    },
    funnel: {
      activeCommunity,
      hasSession: Boolean(cloudSession),
      canManageMembersActiveCommunity,
      isLoadingCommunityFunnel,
      communityFunnelError,
      onOpenAuthGate: openAuthGate,
      editorProps: {
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
    },
    analytics: {
      hasActiveCommunity: Boolean(activeCommunity),
      hasSession: Boolean(cloudSession),
      canViewActiveCommunityAnalytics,
      onOpenAuthGate: openAuthGate,
      state: {
        communityAnalyticsRange,
        isLoadingCommunityAnalytics,
        communityAnalyticsError,
        communityAnalyticsSummary,
        communityAnalyticsSeries,
      },
      actions: {
        setCommunityAnalyticsRange,
      },
    },
    resources: {
      capabilities: {
        hasActiveCommunity: Boolean(activeCommunity),
        activeCommunityName: activeCommunity?.name ?? null,
        canOperateResources: Boolean(cloudSession && canManageResourcesActiveCommunity),
      },
      state: {
        isLoadingResources,
        resourceSuccess,
        resources: communityResources,
        openResourceEmbedId,
      },
      actions: {
        setOpenResourceEmbedId,
        openNewResourceModal,
        handleEditResource,
        handleDeleteResource,
      },
    },
    members: {
      activeCommunity,
      capabilities: {
        canManageMembers: canManageMembersActiveCommunity,
        canManageJoinPolicy: canManageMembersActiveCommunity,
        canReviewJoinRequests: canReviewJoinRequestsActiveCommunity,
        canViewMemberPlanDetails: canViewMemberPlanDetailsActiveCommunity,
        isActiveCommunityOwner,
      },
      state: {
        communityMembers,
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
        profilesByUserId,
      },
      actions: {
        setCommunityMembersRoleFilter,
        setCommunityMembersPlanFilter,
        setIsJoinRequestsModalOpen,
        displayName,
        handleSetCommunityFreeAccessMode,
        handleSetCommunityMemberRole,
        handleRemoveCommunityMember,
        handleApproveCommunityJoinRequest,
        handleDenyCommunityJoinRequest,
        copyTextToClipboard,
        getAvatarColor,
        getInitials,
        formatSubscriptionPrice,
        formatRelativeTime,
      },
    },
    resourceModal: {
      isOpen: showResourceModal,
      hasActiveCommunity: Boolean(activeCommunity),
      editingResourceId,
      resourceTitleInput,
      resourceUrlInput,
      resourceBodyInput,
      resourcePinnedInput,
      resourceError,
      isSavingResource,
      onClose: closeResourceModal,
      onCancel: () => {
        resetResourceForm();
        closeResourceModal();
      },
      onSave: handleSaveCommunityResource,
      onChangeTitle: setResourceTitleInput,
      onChangeUrl: setResourceUrlInput,
      onChangeBody: setResourceBodyInput,
      onChangePinned: setResourcePinnedInput,
    },
  });
  const communityChatPanelProps = {
    activeCommunity: activeCommunity
      ? { name: activeCommunity.name }
      : null,
    hasSession: Boolean(cloudSession),
    sessionUserId: cloudSession?.user.id ?? null,
    canPostMessages: canPostMessagesActiveCommunity,
    canModerateMessages: canManageResourcesActiveCommunity,
    isLoadingChat,
    hasResolvedCommunityChat,
    isLoadingMoreChat,
    communityChatHasMore,
    communityMessages,
    communityMessageById,
    messageReactions,
    profilesByUserId,
    profileAvatarUrl,
    sessionAvatarUrl: cloudSession?.user?.avatarUrl ?? null,
    editingMessageId,
    editingMessageText,
    reactionPickerMessageId,
    replyingToMessage,
    communityAttachments,
    communityMessageInput,
    isSendingCommunityMessage,
    communityChatError,
    isUserAtBottom,
    unreadCount,
    reactionEmojis: REACTION_EMOJIS,
    messageListRef: communityChatListRef,
    fileInputRef: communityFileInputRef,
    chatInputRef,
    onChatScroll: handleChatScroll,
    onOpenAuthGate: openAuthGate,
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
    onCopyMessage: copyTextToClipboard,
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
  };
	  const activateDiscoverCommunityCard = (opts: {
	    canActivate: boolean;
	    slug: string;
	  }) => {
	    if (!opts.canActivate) return;
	    if (!opts.slug) return;
	    openPublicCommunityFunnel(opts.slug, { pushSnapshot: true });
	  };
	  const showHeaderIslands = publicRoute.kind === "app" && activePage === "workspace" && activeView === "home";
	  const communityHomeButton = activeCommunity ? (
	    <button
	      className={`icon-button community-btn${activePage === "community" ? " active" : ""}`}
	      onClick={() => {
	        const nextCommunityId = activeCommunityId ?? activeCommunity.id;
	        openCommunityChat(nextCommunityId, { clearUnread: true });
	      }}
	      aria-label="Open community"
	      title={activeCommunity.name}
	      type="button"
	    >
	      {activeCommunity.avatar_url ? (
	        <img
	          className="community-btn-avatar"
	          src={activeCommunity.avatar_url}
	          alt={activeCommunity.name}
	          loading="lazy"
	          draggable={false}
	        />
	      ) : (
	        <span className="community-btn-initials">{communityInitials(activeCommunity.name)}</span>
	      )}
	      {unreadCount > 0 && activePage !== "community" && (
	        <span className="unread-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
	      )}
	    </button>
	  ) : null;

  return (
    <div
      className={`app-root${showHeaderIslands ? " web-header-islands" : ""}${isSessionsDrawerOpen ? " sessions-drawer-open" : ""}`}
    >
      <header className="app-topbar">
        <div className="topbar-left">
	          {isPublicCommunityFunnel ? (
              publicRoute.kind === "community_funnel_preview" ? (
              <button
                className="back-to-workspace"
                onClick={handleExitPublicFunnelPreview}
                title="Exit preview"
                type="button"
              >
                <svg viewBox="0 0 24 24" className="back-icon">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                <span className="back-path">exit preview</span>
              </button>
              ) : backTargetSnapshot ? (
              <button
                className="back-to-workspace"
                onClick={handleTopbarBackFromPublicFunnel}
                title="Back"
                type="button"
              >
                <svg viewBox="0 0 24 24" className="back-icon">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                <span className="back-path">{backTargetLabel ?? "back"}</span>
              </button>
              ) : null
            ) : activePage === "workspace" ? (
	            activeView === "settings" ? (
	              <button
	                className="back-to-workspace"
	                onClick={handleTopbarBackFromWorkspaceSettings}
	                title="Back"
	                type="button"
	              >
                <svg viewBox="0 0 24 24" className="back-icon">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                <span className="back-path">{backTargetLabel ?? "workspace"}</span>
              </button>
            ) : (
              <>
                <button
                  className={`icon-button${userWantsSessions ? " active" : ""}`}
                  onClick={() => setUserWantsSessions((prev) => !prev)}
                  aria-label="Toggle threads panel"
                  title="Toggle threads panel"
                  type="button"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M9 4v16" />
                  </svg>
                </button>
                <button
		                  className="new-session-header-btn"
		                  onClick={() =>
                        handleNewWorkspaceThread({
                          allowMultipleThreads: userAccessPolicy.allowMultipleThreads,
                          onBlocked: () => {
                            setThreadError(null);
                            openAuthGate();
                          },
                          focusComposer: () => workspaceAskInputRef.current?.focus(),
                        })
                      }
                  title="New thread"
                  aria-label="New thread"
                  type="button"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              </>
            )
	          ) : (
	            <button
	              className="back-to-workspace"
	              onClick={handleTopbarBackToWorkspace}
	              title="Back"
	              type="button"
	            >
              <svg viewBox="0 0 24 24" className="back-icon">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span className="back-path">{backTargetLabel ?? "workspace"}</span>
            </button>
          )}
        </div>

        <div className="topbar-right">
	          {isPublicCommunityFunnel ? null : communityHomeButton}
	        </div>
	      </header>

        {sessionsDrawerEnabled && (
          <>
            <aside
              className={`sessions web-sessions-drawer${isSessionsDrawerOpen ? " open" : ""}`}
              aria-hidden={!isSessionsDrawerOpen}
            >
              {threadError && (
                <div className="auth-error">
                  {displayedThreadError}
                  {showGuestRateLimitSignInAction ? (
                    <button
                      type="button"
                      className="auth-error-link"
                      onClick={() => openAuthGate()}
                    >
                      Sign in
                    </button>
                  ) : null}
                </div>
              )}
              {cloudSession ? (
                <ThreadSidebarPanel<ThreadRecord, CloudProjectRecord>
                  showThreadLaneSwitch={false}
                  state={{
                    threadLaneFilter: "chat",
                    threadSearchQuery,
                    normalizedThreadSearch,
                    threadSearchResults,
                    projectThreadGroups: cloudProjectThreadGroups,
                    projectExpandedById: cloudProjectExpandedById,
                    generalThreads: [],
                    agentThreadsCount: 0,
                    chatThreadsCount: visibleThreads.length,
                    showChatSignInPrompt: false,
                  }}
                  actions={{
                    onThreadLaneFilterChange: () => {},
                    onThreadSearchQueryChange: setThreadSearchQuery,
                    onToggleProjectExpanded: (projectId) => {
                      setCloudProjectExpandedById((prev) => ({
                        ...prev,
                        [projectId]: !(prev[projectId] ?? true),
                      }));
                      setActiveCloudProjectId(projectId);
                    },
                    onStartDraftInProject: (project) => {
                      handleStartDraftInCloudProject(project.id);
                    },
                    renderSessionItem: (thread) => (
                      <div
                        key={thread.id}
                        className={`session-item${thread.id === activeThreadId ? " active" : ""}`}
                        onClick={() => {
                          selectWorkspaceThread(thread);
                        }}
                      >
                        <div className="session-content">
                          <div className="session-title">{getThreadDisplayTitle(thread)}</div>
                        </div>
                      </div>
                    ),
                  }}
                />
              ) : (
	                <div className="session-list">
	                  <div
	                    className={`session-item${(activeThreadId === GUEST_THREAD_ID || (!activeThreadId && !guestThreadHasMessages)) ? " active" : ""}`}
	                    onClick={() => {
	                      applyGuestWorkspaceState({
                          guestThreadId: GUEST_THREAD_ID,
                          hasMessages: guestThreadHasMessages,
                        });
	                    }}
	                  >
	                    <div className="session-content">
	                      <div className="session-title">Guest thread</div>
	                      <div className="session-preview">{guestThreadPreview}</div>
	                    </div>
	                  </div>
		                  <div className="guest-thread-signin">
		                    <p className="guest-thread-signin-title">Sign in</p>
		                    <p className="guest-thread-signin-copy">Sync chats and unlock multiple threads.</p>
                        {authError && <div className="auth-error">{authError}</div>}
		                    <button type="button" className="auth-gate-google-button guest-thread-google-button" onClick={() => openAuthGate()}>
		                      <svg
		                        className="auth-gate-google-icon"
		                        width="18"
		                        height="18"
		                        viewBox="0 0 46 46"
		                        aria-hidden="true"
		                      >
		                        <path
		                          fill="#EA4335"
		                          d="M24 9.5c3.54 0 6.72 1.22 9.22 3.22l6.84-6.84C35.82 2.12 30.22 0 24 0 14.62 0 6.4 5.38 2.44 13.22l7.94 6.16C12.22 13.22 17.62 9.5 24 9.5z"
		                        />
		                        <path
		                          fill="#4285F4"
		                          d="M46 24.5c0-1.64-.14-2.86-.42-4.08H24v7.72h12.52c-.26 2.08-1.64 5.22-4.68 7.32l7.2 5.6C43.74 36.5 46 30.96 46 24.5z"
		                        />
		                        <path
		                          fill="#FBBC05"
		                          d="M10.38 27.38c-.5-1.5-.8-3.1-.8-4.76s.3-3.26.78-4.76l-7.94-6.16C.88 14.9 0 19.34 0 23.62c0 4.28.88 8.72 2.44 12.92l7.94-6.16z"
		                        />
		                        <path
		                          fill="#34A853"
		                          d="M24 46c6.22 0 11.46-2.04 15.28-5.58l-7.2-5.6c-1.92 1.34-4.5 2.28-8.08 2.28-6.38 0-11.78-3.72-13.62-8.88l-7.94 6.16C6.4 40.62 14.62 46 24 46z"
		                        />
		                        <path fill="none" d="M0 0h46v46H0z" />
		                      </svg>
		                      Continue with Google
		                    </button>
		                    <button
		                      type="button"
		                      className="guest-thread-reset-button"
		                      disabled={!guestThreadHasMessages}
		                      onClick={() => {
		                        if (!guestThreadHasMessages) return;
                        const confirmed = window.confirm("Clear this guest chat from this browser?");
		                        if (!confirmed) return;
		                        resetGuestThread();
		                      }}
		                    >
		                      Start fresh
		                    </button>
		                  </div>
                </div>
              )}
            </aside>
          </>
        )}

	      <div
	        className={`app-shell${showCommunityRail ? " with-community-rail" : ""}${showCommunityNav ? " community-layout" : ""}${showCommunityNav || isWorkspaceSettings ? " sessions-compact" : ""}${!hasLeftPanel ? " no-left" : ""} no-right`}
	      >
        {showCommunityRail && (
          <aside className="rail community-rail" aria-label="Communities">
            <div className="rail-main">
	              <button
	                type="button"
	                className={`community-rail-button${activePage === "discover" ? " active" : ""}`}
	                onClick={handleOpenDiscover}
	                title="Discover communities"
	                aria-label="Discover communities"
	              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="community-rail-icon">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M16.5 7.5l-3.2 8.1-8.1 3.2 3.2-8.1 8.1-3.2z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
                </svg>
              </button>
              {hasCommunityRailMiddleContent ? <div className="community-rail-divider" /> : null}
	              <div className="community-rail-list" ref={setCommunityRailListElement}>
	                {railCommunities.map((community) => {
	                  const bindings = getCommunityRailItemBindings(community.id);
	                  return (
	                    <button
	                      key={community.id}
	                      type="button"
			                  ref={bindings.ref}
	                      className={`community-rail-button community-rail-community${community.id === activeCommunityId ? " active" : ""}${community.id === draggingCommunityId ? " is-dragging" : ""}${canReorderCommunities ? " reorder-enabled" : ""}`}
	                      onClick={() => {
	                        if (
	                          !confirmDiscardUnsavedCommunitySettingsWeb({
	                            isCommunitySettingsDirty: communitySettingsDirtyRef.current,
	                            isCommunityAgentConfigDirty: communityAgentConfigDirtyRef.current,
	                            activeCommunityId,
	                            nextCommunityId: community.id,
	                            confirmDiscard: (message) => window.confirm(message),
	                          })
	                        ) {
	                          return;
	                        }
	                        syncCommunitySelection({
                            communityId: community.id,
                            communitySlug: (community.slug ?? "").trim() || null,
                          });
	                          // Keep the user on their current page; only the selected community context changes.
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
	                            const session = cloudSession;
	                            if (session && activeThreadId) {
	                              void syncWorkspaceThreadCommunityLens(activeThreadId, community.id, session);
	                            }
	                          }
			                  }}
	                      onClickCapture={bindings.onClickCapture}
	                      onPointerDown={bindings.onPointerDown}
	                      style={bindings.style}
		                      title={community.name}
	                    >
	                      {community.avatar_url ? (
	                        <img
	                          className="community-rail-avatar"
	                          src={community.avatar_url}
	                          alt={community.name}
	                          loading="lazy"
	                          draggable={false}
	                        />
	                      ) : (
	                        <span className="community-rail-initials">{communityInitials(community.name)}</span>
	                      )}
	                    </button>
	                  );
	                })}
	              </div>
	              {communities.length === 0 && isLoadingCommunities && (
	                <div className="community-rail-skeleton" aria-hidden="true">
	                  <div className="community-rail-skeleton-item" />
                  <div className="community-rail-skeleton-item" />
                  <div className="community-rail-skeleton-item" />
                </div>
              )}
              <div className="community-rail-divider" />
		              <button
		                type="button"
		                className="community-rail-button community-rail-add"
		                onClick={() => {
                      setBuilderUpgradeContext("builder");
                      setIsBuilderUpgradeOpen(true);
                    }}
		                title="Become a Builder"
		                aria-label="Become a Builder"
		              >
		                B
		              </button>
            </div>
            <div className="rail-footer">
	              <button
	                type="button"
	                className={`community-rail-button${activeView === "settings" ? " active" : ""}`}
	                onClick={handleToggleWorkspaceSettings}
	                title="Settings"
	                aria-label="Settings"
	              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="community-rail-icon"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
		              </button>
            </div>
          </aside>
        )}

	        {isWorkspaceSettings && (
	          <aside className="sessions">
	            <div className="session-list">
                <SettingsNavList settingsGroup={settingsGroup} onSelectPage={setSettingsPage} />
	            </div>
	          </aside>
	        )}

        {showCommunityNav && (
        <CommunityNav
            activeCommunity={activeCommunity}
            communityTab={communityTab}
            canViewActiveCommunitySettings={canViewActiveCommunitySettings}
            canViewActiveCommunityPolynet={canViewActiveCommunityPolynet}
            canManageMembersActiveCommunity={canManageMembersActiveCommunity}
            canViewActiveCommunityAnalytics={canViewActiveCommunityAnalytics}
            buttonType="button"
            includeButtonTitles={true}
            onSelectTab={(tab) => {
              if (isCommunityRouteManagedTab(tab)) {
                const nextCommunityId = activeCommunityId ?? activeCommunity?.id ?? null;
                if (nextCommunityId) {
                  openCommunityTab(nextCommunityId, tab, { pushSnapshot: false });
                  return;
                }
              }
              applyCommunityShellState({ communityTab: tab });
            }}
          />
        )}

        <main className={`workspace${activePage !== "workspace" ? " community-mode" : ""}`}>
	          {activeView === "settings" ? (
	            <div className="settings-panel">
	              <div className="web-settings-centered-pane">
                {settingsGroup === "profile" && (
                  <WebProfileSettingsSection
                    cloudSession={cloudSession}
                    cloudProfile={cloudProfile}
                    profileAvatarUrl={profileAvatarUrl}
                    profileName={profileName}
                    profileUsername={profileUsername}
                    profileBio={profileBio}
                    isProfileAvatarDragOver={isProfileAvatarDragOver}
                    profileNeedsSave={profileNeedsSave}
                    isSavingProfile={isSavingProfile}
                    isProfileDirty={isProfileDirty}
                    profileSaveError={profileSaveError}
                    profileSaveSuccess={profileSaveSuccess}
                    setIsProfileAvatarDragOver={setIsProfileAvatarDragOver}
                    handleProfileAvatarDrop={handleProfileAvatarDrop}
                    handleProfileAvatarUpload={handleProfileAvatarUpload}
                    setProfileAvatarUrl={setProfileAvatarUrl}
                    getInitials={getInitials}
                    setProfileName={setProfileName}
                    setProfileUsername={setProfileUsername}
                    setProfileBio={setProfileBio}
                    saveProfileToCloud={saveProfileToCloud}
                  />
                )}

	              {settingsGroup === "account" && (
	                <WebAccountSettingsSection
                    cloudSession={cloudSession}
                    authError={authError}
                    openAuthGate={openAuthGate}
                    handleSignOut={handleSignOut}
                    isLoadingChatgptConnection={isLoadingChatgptConnection}
                    chatgptConnection={chatgptConnection}
                    isConnectingChatgpt={isConnectingChatgpt}
                    isPollingChatgptConnection={isPollingChatgptConnection}
                    hasPendingChatgptAuth={hasPendingChatgptAuth}
                    handleConnectChatgpt={handleConnectChatgpt}
                    handleDisconnectChatgpt={handleDisconnectChatgpt}
                    chatgptDeviceUserCode={chatgptDeviceUserCode}
                    chatgptConnectionError={chatgptConnectionError}
                    chatgptConnectionSuccess={chatgptConnectionSuccess}
                    isLoadingOpenRouterConnection={isLoadingOpenRouterConnection}
                    openRouterConnection={openRouterConnection}
                    openRouterApiKeyDraft={openRouterApiKeyDraft}
                    setOpenRouterApiKeyDraft={setOpenRouterApiKeyDraft}
                    isSavingOpenRouterConnection={isSavingOpenRouterConnection}
                    handleConnectOpenRouter={handleConnectOpenRouter}
                    handleDisconnectOpenRouter={handleDisconnectOpenRouter}
                    openRouterConnectionError={openRouterConnectionError}
                    openRouterConnectionSuccess={openRouterConnectionSuccess}
                    formatRelativeTime={formatRelativeTime}
                    builderBillingStatus={builderBillingStatus}
                    communities={communities}
                    communityRoleById={communityRoleById}
                    openOwnedCommunitySettings={(communityId) => {
                      if (
                        !confirmDiscardUnsavedCommunitySettingsWeb({
                          isCommunitySettingsDirty: communitySettingsDirtyRef.current,
                          isCommunityAgentConfigDirty: communityAgentConfigDirtyRef.current,
                          activeCommunityId,
                          nextCommunityId: communityId,
                          confirmDiscard: (message) => window.confirm(message),
                        })
                      ) {
                        return;
                      }
                      openCommunityTab(communityId, "settings", { pushSnapshot: false });
                    }}
                    communityInitials={communityInitials}
                    openBuilderUpgrade={(context) => {
                      setBuilderUpgradeContext(context);
                      setIsBuilderUpgradeOpen(true);
                    }}
                    builderBillingError={builderBillingError}
                    canUseDevTierOverride={canUseDevTierOverride}
                    isSettingDevBuilderTier={isSettingDevBuilderTier}
                    setDevBuilderTier={setDevBuilderTier}
                    devBuilderTierError={devBuilderTierError}
                    pendingPurchaseClaims={pendingPurchaseClaims}
                    isLoadingPendingPurchases={isLoadingPendingPurchases}
                    isRedeemingPendingPurchases={isRedeemingPendingPurchases}
                    redeemPendingPurchases={redeemPendingPurchases}
                    refreshPendingPurchases={async () => {
                      const session = await ensureUsableCloudSession();
                      if (!session) return;
                      await loadPendingPurchaseClaims(session);
                    }}
                    pendingPurchasesError={pendingPurchasesError}
                    pendingPurchasesSuccess={pendingPurchasesSuccess}
                  />
              )}

		              {settingsGroup === "agent" && (
                <WebAgentSettingsSection
                  cloudSession={cloudSession}
                  exportError={exportError}
                  exportThreadsCsv={exportThreadsCsv}
                  exportMessagesCsv={exportMessagesCsv}
                  exportMemoryCsv={exportMemoryCsv}
                  isExporting={isExporting}
                  personalMemoryError={personalMemoryError}
                  builderBillingStatus={builderBillingStatus}
                  openBuilderUpgrade={(context) => {
                    setBuilderUpgradeContext(context);
                    setIsBuilderUpgradeOpen(true);
                  }}
                  isLoadingPersonalMemory={isLoadingPersonalMemory}
                  personalMemoryItems={personalMemoryItems}
                  personalMemoryQuery={personalMemoryQuery}
                  setPersonalMemoryQuery={setPersonalMemoryQuery}
                  loadPersonalMemoryItems={loadPersonalMemoryItems}
                  formatRelativeTime={formatRelativeTime}
                  handleTogglePersonalMemoryPinned={handleTogglePersonalMemoryPinned}
                  handleDeletePersonalMemoryItem={handleDeletePersonalMemoryItem}
                  setMemoryImportError={setMemoryImportError}
                  setIsMemoryImportModalOpen={setIsMemoryImportModalOpen}
                  newPersonalMemoryContent={newPersonalMemoryContent}
                  setNewPersonalMemoryContent={setNewPersonalMemoryContent}
                  setNewPersonalMemoryPinned={setNewPersonalMemoryPinned}
                  handleCreatePersonalMemoryItem={handleCreatePersonalMemoryItem}
                />
              )}

	              {settingsGroup === "appearance" && (
	                <WebAppearanceSettingsSection
                    appTheme={appTheme}
                    setAppTheme={setAppTheme}
                  />
	              )}
	              </div>
	            </div>
	          ) : isPublicCommunityFunnel ? (
            <div className="community-body">
              <div className="community-panel public-route-panel public-community-funnel-panel">
                <div className="workspace-body public-route-body public-community-funnel-body">
                  <WebPublicCommunityFunnel
                    publicRouteSlug={publicRoute.slug}
                    publicCommunity={resolvedPublicCommunity}
                    isPreviewMode={isPublicFunnelPreviewRoute}
                    publicVisibilityLabel={publicVisibilityLabel}
                    selectedPublicCommunityPlanLabel={
                      isPublicFunnelPreviewRoute
                        ? null
                        : selectedPublicCommunityPlan
                          ? formatPlanPrice(selectedPublicCommunityPlan)
                          : null
                    }
                    hasSelectedPublicCommunityPlan={
                      isPublicFunnelPreviewRoute ? false : Boolean(selectedPublicCommunityPlan)
                    }
                    isLoadingPublicCommunity={isLoadingPublicCommunity}
                    canEnterCommunity={canEnterPublicCommunity}
                    canJoinForFree={canJoinForFree}
                    canJoinWithApproval={canJoinWithApproval}
                    canJoinWithCheckout={canJoinWithCheckout}
                    checkoutStatus={checkoutStatus}
                    isJoiningPublicCommunity={isJoiningPublicCommunity}
                    isLoadingMyPublicCommunityJoinRequest={isLoadingMyPublicCommunityJoinRequest}
                    approvalPending={approvalPending}
                    approvalDenied={approvalDenied}
                    canRequestAgain={canRequestAgain}
                    approvalReapplyLabel={approvalReapplyLabel}
                    onPrimaryJoinAction={handlePublicLandingPrimaryAction}
                    publicCommunityError={publicCommunityError}
                    publicJoinError={publicJoinError}
                    checkoutError={checkoutError}
                    showSignIn={isPublicFunnelPreviewRoute ? true : showPublicSignIn}
                    memberCountOverride={memberCountOverride}
                    debugEnabled={isPublicDebugEnabled}
                    debugState={{
                      ...publicDebugState,
                      is_loading_public_community: isLoadingPublicCommunity,
                      is_loading_join_request: isLoadingMyPublicCommunityJoinRequest,
                      is_joining_public_community: isJoiningPublicCommunity,
                      checkout_status: checkoutStatus,
                      public_join_error: publicJoinError,
                      public_community_error: publicCommunityError,
                      checkout_error: checkoutError,
                      primary_action_label: publicPrimaryCtaState,
                    }}
                  />
                </div>
              </div>
            </div>
	          ) : activePage === "workspace" ? (
	            <>
		              <div className="workspace-body">
                    {inferenceToast && <div className="memory-toast success-toast">{inferenceToast}</div>}
                    {memoryToast && <div className="memory-toast success-toast">{memoryToast}</div>}
		                <div className="message-list" ref={workspaceMessageListRef} onScroll={handleWorkspaceScroll}>
		                    <div className="message-list-inner">
		                    {isEmptyWorkspaceThread && (
		                      <>
		                        {showEmptyThreadLandingSkeleton || isHydratingActiveWorkspaceThread ? (
		                          <div className="web-empty-thread web-empty-thread-skeleton" role="status" aria-live="polite">
		                            <div className="web-empty-thread-avatar web-skeleton-block" aria-hidden="true" />
		                            <div className="web-skeleton-block web-skeleton-title" aria-hidden="true" />
		                            <div className="web-skeleton-block web-skeleton-subtitle" aria-hidden="true" />
		                            <div className="web-empty-thread-composer web-empty-thread-composer-skeleton" aria-hidden="true">
		                              <div className="web-skeleton-composer web-skeleton-block" />
		                            </div>
		                            <div className="web-empty-thread-actions web-empty-thread-actions-skeleton" aria-hidden="true">
		                              <div className="web-skeleton-card" />
		                              <div className="web-skeleton-card" />
		                              <div className="web-skeleton-card" />
		                            </div>
	                          </div>
		                        ) : (
		                          <div
                                className={`web-empty-thread${activeCommunity ? "" : " web-empty-thread-no-community"}`}
                                role="region"
                                aria-label="Start a new thread"
                              >
		                            {activeCommunity && (
		                              <div className="web-empty-thread-avatar" aria-hidden="true">
		                                {activeCommunity.avatar_url ? (
		                                  <img
		                                    className="web-empty-thread-avatar-image"
		                                    src={activeCommunity.avatar_url}
		                                    alt={activeCommunity.name}
		                                  />
		                                ) : (
		                                  <div className="web-empty-thread-avatar-fallback">
		                                    {communityInitials(activeCommunity.name)}
		                                  </div>
		                                )}
		                              </div>
		                            )}
			                            <div className="web-empty-thread-title">
			                              {activeCommunity ? (
			                                <>
			                                  Welcome to{" "}
		                                  <button
		                                    type="button"
		                                    className="web-empty-thread-link web-empty-thread-title-accent"
		                                    onClick={handleOpenLandingCommunity}
		                                  >
		                                    {activeCommunity.name}
			                                  </button>
			                                </>
			                              ) : (
			                                emptyThreadLanding.title
			                              )}
			                            </div>
			                            {activeCommunity && resolvedActiveCloudProjectName ? (
			                              <div className="web-empty-thread-subtitle">
			                                You are in{" "}
			                                <button
			                                  type="button"
			                                  className="web-empty-thread-link web-empty-thread-subtitle-accent"
			                                  onClick={handleOpenLandingProject}
			                                >
			                                  {resolvedActiveCloudProjectName}
			                                </button>{" "}
			                                workspace
			                              </div>
			                            ) : null}
			                            <div className="web-empty-thread-composer">
			                              <div className="ask-bar ask-bar-v2 ask-bar-landing">
		                                <textarea
		                                  ref={workspaceAskInputRef}
		                                  className="ask-input ask-input-v2 ask-input-landing"
		                                  placeholder="Describe what you need help with..."
		                                  value={messageInput}
		                                  onChange={(event) => setMessageInput(event.target.value)}
		                                  onKeyDown={(event) => {
		                                    if (event.key === "Enter" && !event.shiftKey) {
		                                      event.preventDefault();
		                                      void sendUserMessage();
		                                    }
		                                  }}
		                                  disabled={isActiveWorkspaceThreadBusy || isStreamingWorkspaceTurn}
		                                  rows={1}
		                                />
		                                {workspaceAttachments.length > 0 && (
		                                  <div className="attachments-preview workspace-attachments-preview">
		                                    {workspaceAttachments.map((att) => (
		                                      <div key={att.id} className="attachment-item">
		                                        {att.type === "image" && att.data_url ? (
		                                          <img src={att.data_url} alt={att.name} className="attachment-thumb" />
		                                        ) : (
		                                          <div className="attachment-icon" aria-hidden="true">
		                                            <svg viewBox="0 0 24 24">
		                                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
		                                              <path d="M14 2v6h6" />
		                                              <path d="M16 13H8" />
		                                              <path d="M16 17H8" />
		                                              <path d="M10 9H8" />
		                                            </svg>
		                                          </div>
		                                        )}
		                                        <span className="attachment-name" title={att.name}>
		                                          {att.name}
		                                        </span>
		                                        <button
		                                          className="attachment-remove"
		                                          type="button"
		                                          onClick={() => removeWorkspaceAttachment(att.id)}
		                                          title="Remove"
		                                          aria-label={`Remove ${att.name}`}
		                                        >
		                                          <svg viewBox="0 0 24 24" aria-hidden="true">
		                                            <path d="M18 6L6 18M6 6l12 12" />
		                                          </svg>
		                                        </button>
		                                      </div>
		                                    ))}
		                                  </div>
		                                )}
		                                <div className="ask-footer ask-footer-landing">
		                                  <div className="ask-footer-left">
		                                    <button
		                                      className="ask-icon-btn ask-plus"
		                                      type="button"
		                                      onClick={() => workspaceFileInputRef.current?.click()}
		                                      disabled={!cloudSession || isActiveWorkspaceThreadBusy || isStreamingWorkspaceTurn}
		                                      aria-label="Attach files"
		                                      title="Attach files"
		                                    >
		                                      <svg viewBox="0 0 24 24" aria-hidden="true">
		                                        <path d="M12 5v14M5 12h14" />
		                                      </svg>
		                                    </button>
		                                    <input
		                                      ref={workspaceFileInputRef}
		                                      type="file"
		                                      multiple
		                                      accept="image/*,.txt,.md,.csv,.json,.ts,.tsx,.js,.jsx,.py,.rs,.go,.html,.css,.yml,.yaml,.pdf"
		                                      style={{ display: "none" }}
		                                      onChange={handleWorkspaceFileInputChange}
		                                    />
		                                    <WebModelPickerPopover
		                                      modelPickerRef={modelPickerRef}
		                                      modelPickerSearchRef={modelPickerSearchRef}
		                                      isOpen={isModelPickerOpen}
		                                      activeModelLabel={activeModelLabel}
		                                      curatedPickerModels={curatedPickerModels}
		                                      modelPickerQuery={modelPickerQuery}
		                                      setModelPickerQuery={setModelPickerQuery}
		                                      modelPickerSection={modelPickerSection}
		                                      setModelPickerSection={setModelPickerSection}
		                                      visiblePickerModels={visiblePickerModels}
		                                      selectedPickerModelId={selectedPickerModelId}
		                                      modelToggles={modelToggles}
		                                      hasPaidAccess={hasPaidAccess}
		                                      hasUserKeyConnection={hasUserKeyConnection}
		                                      hasUserChatgptConnection={hasUserChatgptConnection}
		                                      hasSession={Boolean(cloudSession)}
		                                      canSelectPickerModel={canSelectPickerModel}
		                                      onSelectModel={handleSelectPickerModel}
		                                      onOpen={openModelPicker}
		                                      onClose={closeModelPicker}
		                                    />
		                                  </div>
		                                  <div className="ask-actions ask-actions-landing">
		                                    <VoiceInputButton
		                                      state={workspaceVoiceUiState}
		                                      title={workspaceVoiceIntent.title}
		                                      onClick={() => void handleVoiceInputClick("workspace")}
		                                    />
		                                    <button
		                                      className="chat-send ask-send-btn ask-send-btn-v2"
		                                      type="button"
		                                      onClick={() => (isStreamingWorkspaceTurn ? stopStreamingTurn(activeThreadId ?? undefined) : void sendUserMessage())}
		                                      disabled={
		                                        isStreamingWorkspaceTurn
		                                          ? false
		                                          : isActiveWorkspaceThreadBusy ||
		                                            (messageInput.trim().length === 0 && workspaceAttachments.length === 0)
		                                      }
		                                      aria-label={isStreamingWorkspaceTurn ? "Stop" : "Send"}
		                                      title={isStreamingWorkspaceTurn ? "Stop" : "Send"}
		                                    >
		                                      <svg viewBox="0 0 24 24" aria-hidden="true">
		                                        {isStreamingWorkspaceTurn ? (
		                                          <rect x="7" y="7" width="10" height="10" rx="2" />
		                                        ) : (
		                                          <path d="M12 17V8M8.5 11.5 12 8l3.5 3.5" />
		                                        )}
		                                      </svg>
		                                    </button>
		                                  </div>
		                                </div>
		                              </div>
		                            </div>
		                            <div className="web-empty-thread-actions" role="list">
		                              {landingActionButtons.map((button) => (
		                                <button
		                                  key={button.id}
		                                  className="web-empty-thread-action"
		                                  type="button"
		                                  disabled={isActiveWorkspaceThreadBusy || isStreamingWorkspaceTurn}
		                                  onClick={() => {
		                                    void sendUserMessage({ text: button.prompt });
		                                    workspaceAskInputRef.current?.focus();
		                                  }}
		                                >
		                                  <span className="web-empty-thread-action-text">{button.label}</span>
		                                  <span className="web-empty-thread-action-arrow" aria-hidden="true">
		                                    <svg viewBox="0 0 24 24">
		                                      <path d="M9 18l6-6-6-6" />
		                                    </svg>
		                                  </span>
		                                </button>
		                              ))}
		                            </div>
                                {shouldShowEmptyThreadChatgptCard ? (
                                  <WebChatgptEmptyStateCard
                                    buttonLabel={
                                      isConnectingChatgpt
                                        ? "Starting..."
                                        : hasPendingChatgptAuth || isPollingChatgptConnection
                                          ? "Continue auth"
                                          : "Authenticate"
                                    }
                                    disabled={isConnectingChatgpt}
                                    onConnect={() => void handleConnectChatgpt()}
                                  />
                                ) : null}
	                          </div>
	                        )}
	                      </>
	                    )}
                      {threadError && (
                        <div className="auth-error">
                          {displayedThreadError}
                          {showGuestRateLimitSignInAction ? (
                            <button
                              type="button"
                              className="auth-error-link"
                              onClick={() => openAuthGate()}
                            >
                              Sign in
                            </button>
                          ) : null}
                          {canRetryLastThreadTurn && (
                            <button
                              className="auth-error-action"
                              type="button"
                              onClick={() => void retryLastTurn()}
                              title="Retry"
                            >
                              Retry
                            </button>
                          )}
                        </div>
                      )}
	                    {threadMessages.map((message) => {
	                        if (message.role === "system") return null;
	                        const isUser = message.role === "user";
	                        const textContent = parseMessageText(message.content_json);
	                        const attachments = parseMessageAttachments(message.content_json);
	                        const memoryUsed = !isUser ? parseMessageMemoryUsed(message.content_json) : [];
	                        const historyUsed = !isUser ? parseMessageHistoryUsed(message.content_json) : [];
	                        const memorySuggestions = !isUser ? parseMessageMemorySuggestions(message.content_json) : [];
	                        const memoryAdded = !isUser ? parseMessageMemoryAdded(message.content_json) : [];
                        const communityEvidence = !isUser ? extractCommunityEvidenceUsedV1(message.content_json) : null;
                        const contextPayload = !isUser
                          ? buildMessageContextModalPayload<MemoryUsedItem, HistoryUsedItem, MemorySuggestion>({
                              memoryUsed,
                              historyUsed,
                              memorySuggestions,
                              memoryAdded,
                              communityEvidence,
                            })
                          : null;
	                        const hasContext = hasContextPayload(contextPayload);
	                        const inferenceSource = !isUser ? extractInferenceSourceFromMessageContent(message.content_json) : null;
                        const messageModelId = !isUser
                          ? message.model_id ?? extractModelIdFromMessageContent(message.content_json)
                          : null;
                        const messageRuntimeEvents =
                          !isUser && typeof message.run_id === "string" && message.run_id.trim()
                            ? message.run_id === activeThreadStreamingRunId &&
                              Array.isArray(activeThreadStreamingState?.runtimeEvents) &&
                              activeThreadStreamingState.runtimeEvents.length > 0
                              ? activeThreadStreamingState.runtimeEvents
                              : runtimeEventsByRunId[message.run_id] ?? []
                            : [];
	                      const modelLabel = !isUser
	                        ? formatModelSignature(
                              messageModelId,
                              inferenceSource,
                              modelToggles,
                            )
	                        : null;
	                      return (
	                        <div
	                          key={message.id}
                          className={isUser ? "message-item user" : "message-item assistant"}
                        >
                          <div className="message-text">
                            {!isUser && messageRuntimeEvents.length > 0 ? (
                              <RuntimeToolTrace events={messageRuntimeEvents} />
                            ) : null}
                            {isUser ? textContent : renderMarkdown(textContent, { onCopyCode: copyTextToClipboard })}
                          </div>
                            {attachments.length > 0 && (
                              <div className="attachments-preview message-attachments-preview">
                                {attachments.map((att) => {
                                  const openUrl =
                                    att.type === "image" && typeof att.data_url === "string" && att.data_url.startsWith("data:image/")
                                      ? att.data_url
                                      : null;
                                  return (
                                    <AttachmentChipButton
                                      key={att.id}
                                      name={att.name}
                                      imageUrl={openUrl}
                                      onClick={
                                        openUrl
                                          ? () => {
                                              window.open(openUrl, "_blank", "noopener,noreferrer");
                                            }
                                          : null
                                      }
                                      disabled={!openUrl}
                                    />
                                  );
                                })}
                              </div>
                            )}
		                          {!isUser && (
	                              <MessageFooter metaLabel={modelLabel}>
	                                <MessageCopyAction
	                                  copied={copiedMessageId === message.id}
                                  onClick={() => {
                                    void handleCopyMessage(message.id, textContent);
                                  }}
	                                  title="Copy"
	                                  ariaLabel="Copy"
	                                />
                                  {hasContext ? (
	                                  <MessageSourcesAction
	                                    onClick={() => {
	                                      openMessageContextModal(contextPayload, setContextModal);
	                                    }}
	                                    title="Sources used"
	                                    ariaLabel="Sources used"
	                                  />
                                  ) : null}
	                              </MessageFooter>
		                          )}
                              {!isUser && messageRuntimeEvents.length > 0 ? (
                                <RuntimeWebSources events={messageRuntimeEvents} />
                              ) : null}
	                        </div>
	                      );
	                    })}
                      {activeThreadStreamingContent !== null &&
                        !(activeThreadStreamingRunId && threadMessages.some((m) => m.run_id === activeThreadStreamingRunId && m.role === "assistant")) && (
                          <div className="message-item assistant streaming">
                            <div className="message-text streaming-text">
                              {Array.isArray(activeThreadStreamingState?.runtimeEvents) &&
                              activeThreadStreamingState.runtimeEvents.length > 0 ? (
                                <RuntimeToolTrace events={activeThreadStreamingState.runtimeEvents} />
                              ) : null}
                              {activeThreadStreamingContent.trim() ? (
                                <>
                                  {renderMarkdown(activeThreadStreamingContent, { onCopyCode: copyTextToClipboard })}
                                  <span className="streaming-caret" aria-hidden="true" />
                                </>
                              ) : (
                                <span className="streaming-placeholder shimmer-text">
                                  Thinking
                                </span>
                              )}
	                  </div>
	                </div>
				              )}
              </div>
		                </div>
                {!isWorkspaceAtBottom && (
                  <button
                    className="scroll-to-bottom workspace"
                    type="button"
                    onClick={() => {
                      const el = workspaceMessageListRef.current;
                      if (!el) return;
		                      autoScrollEnabledRef.current = true;
		                      setIsWorkspaceAtBottom(true);
		                      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
		                    }}
		                    aria-label="Scroll to bottom"
		                    title="Scroll to bottom"
		                  >
		                    <svg viewBox="0 0 24 24" aria-hidden="true">
		                      <path d="M12 5v14" />
		                      <path d="M19 12l-7 7-7-7" />
		                    </svg>
		                  </button>
		                )}
		              </div>
			              {!isEmptyWorkspaceThread && (
			                <div className="ask-bar ask-bar-v2">
		                <textarea
		                  ref={workspaceAskInputRef}
                  className="ask-input ask-input-v2"
	                  placeholder={
	                    cloudSession
	                      ? workspaceAttachments.length > 0
	                        ? "Add a message or send files..."
	                        : "Ask anything"
	                      : "Ask anything (guest chat)"
	                  }
                  value={messageInput}
                  onChange={(event) => setMessageInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendUserMessage();
                    }
                  }}
	                  disabled={isActiveWorkspaceThreadBusy || isStreamingWorkspaceTurn}
	                  rows={1}
	                />
                {workspaceAttachments.length > 0 && (
                  <div className="attachments-preview workspace-attachments-preview">
                    {workspaceAttachments.map((att) => (
                      <div key={att.id} className="attachment-item">
                        {att.type === "image" && att.data_url ? (
                          <img src={att.data_url} alt={att.name} className="attachment-thumb" />
                        ) : (
                          <div className="attachment-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <path d="M14 2v6h6" />
                              <path d="M16 13H8" />
                              <path d="M16 17H8" />
                              <path d="M10 9H8" />
                            </svg>
                          </div>
                        )}
                        <span className="attachment-name" title={att.name}>
                          {att.name}
                        </span>
                        <button
                          className="attachment-remove"
                          type="button"
                          onClick={() => removeWorkspaceAttachment(att.id)}
                          title="Remove"
                          aria-label={`Remove ${att.name}`}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="ask-footer">
                  <div className="ask-footer-left">
	                    <button
	                      className="ask-icon-btn ask-plus"
	                      type="button"
	                      onClick={() => workspaceFileInputRef.current?.click()}
	                      disabled={!cloudSession || isActiveWorkspaceThreadBusy || isStreamingWorkspaceTurn}
	                      aria-label="Attach files"
	                      title="Attach files"
	                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                    <input
                      ref={workspaceFileInputRef}
                      type="file"
                      multiple
                      accept="image/*,.txt,.md,.csv,.json,.ts,.tsx,.js,.jsx,.py,.rs,.go,.html,.css,.yml,.yaml,.pdf"
                      style={{ display: "none" }}
                      onChange={handleWorkspaceFileInputChange}
                    />
                    <WebModelPickerPopover
                      modelPickerRef={modelPickerRef}
                      modelPickerSearchRef={modelPickerSearchRef}
                      isOpen={isModelPickerOpen}
                      activeModelLabel={activeModelLabel}
                      curatedPickerModels={curatedPickerModels}
                      modelPickerQuery={modelPickerQuery}
                      setModelPickerQuery={setModelPickerQuery}
                      modelPickerSection={modelPickerSection}
                      setModelPickerSection={setModelPickerSection}
                      visiblePickerModels={visiblePickerModels}
                      selectedPickerModelId={selectedPickerModelId}
                      modelToggles={modelToggles}
                      hasPaidAccess={hasPaidAccess}
                      hasUserKeyConnection={hasUserKeyConnection}
                      hasUserChatgptConnection={hasUserChatgptConnection}
                      hasSession={Boolean(cloudSession)}
                      canSelectPickerModel={canSelectPickerModel}
                      onSelectModel={handleSelectPickerModel}
                      onOpen={openModelPicker}
                      onClose={closeModelPicker}
                    />
                  </div>
			                  <div className="ask-actions">
		                    <VoiceInputButton
		                      state={workspaceVoiceUiState}
		                      title={workspaceVoiceIntent.title}
		                      onClick={() => void handleVoiceInputClick("workspace")}
		                    />
	                    <button
	                      className="chat-send ask-send-btn ask-send-btn-v2"
	                      type="button"
	                      onClick={() => (isStreamingWorkspaceTurn ? stopStreamingTurn(activeThreadId ?? undefined) : void sendUserMessage())}
	                      disabled={
	                        (isStreamingWorkspaceTurn
	                          ? false
	                          : isActiveWorkspaceThreadBusy || (messageInput.trim().length === 0 && workspaceAttachments.length === 0))
	                      }
	                      aria-label={isStreamingWorkspaceTurn ? "Stop" : "Send"}
                      title={isStreamingWorkspaceTurn ? "Stop" : "Send"}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        {isStreamingWorkspaceTurn ? (
                          <rect x="7" y="7" width="10" height="10" rx="2" />
                        ) : (
                          <path d="M12 17V8M8.5 11.5 12 8l3.5 3.5" />
                        )}
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
			              )}
            </>
          ) : (
            <div className="community-body">
              {publicRoute.kind === "app" && activePage === "discover" && (
                <div className="community-panel discover-panel">
                  <div className="discover-hero">
                    <div className="discover-hero-copy">
                      <div className="discover-title">Discover communities</div>
                      <div className="discover-subtitle">
                        Find focused crews to build, learn, and ship faster.
                      </div>
                    </div>
                    <div className="discover-controls">
                      <input
                        className="discover-search"
                        type="text"
                        placeholder="Search communities…"
                        value={discoverQuery}
                        onChange={(event) => setDiscoverQuery(event.target.value)}
                      />
                      <button
                        className="discover-refresh"
                        type="button"
                        disabled={isLoadingDiscover}
                        onClick={() => void loadDiscoverCommunities()}
                      >
                        {isLoadingDiscover ? "Refreshing…" : "Refresh"}
                      </button>
                    </div>
	                  </div>
	                  <div className="workspace-body chat-feed">
	                    <div className="chat-messages discover-scroll">
		                      <div className="discover-grid">
		                        {isLoadingDiscover && discoverCommunities.length === 0 && (
		                          <>
		                            {Array.from({ length: 6 }).map((_, idx) => (
		                              <div
		                                key={`discover-skeleton-${idx}`}
		                                className="discover-card discover-card-skeleton"
		                                aria-hidden="true"
		                              >
		                                <div className="discover-card-banner web-skeleton-block" />
		                                <div className="discover-card-body">
		                                  <div className="discover-card-header">
		                                    <div className="discover-card-avatar web-skeleton-block" />
		                                    <div className="discover-card-meta">
		                                      <div className="discover-card-name-row">
		                                        <div className="web-skeleton-row discover-skeleton-name" />
		                                        <div className="web-skeleton-pill discover-skeleton-price" />
		                                        <div className="discover-visibility-icon discover-skeleton-visibility web-skeleton-block" />
		                                      </div>
		                                      <div className="web-skeleton-row discover-skeleton-slug" />
		                                    </div>
		                                  </div>
		                                  <div className="web-skeleton-row discover-skeleton-desc" />
		                                  <div className="web-skeleton-row discover-skeleton-desc discover-skeleton-desc-short" />
		                                </div>
		                              </div>
		                            ))}
		                          </>
		                        )}
		                        {!isLoadingDiscover && discoverError && <div className="auth-error">{discoverError}</div>}
		                        {!isLoadingDiscover && !discoverError && filteredDiscoverCommunities.length === 0 && (
		                          <div className="discover-empty">
		                            <div className="discover-empty-title">No communities yet.</div>
		                            <div className="discover-empty-text">Create one to make discovery meaningful.</div>
	                          </div>
	                        )}
	                        {filteredDiscoverCommunities.map((community) => {
	                            const priceLabel = community.active_plan ? formatPlanPrice(community.active_plan) : "Free";
                            const visibilityLabel = formatCommunityVisibilityLabel(community.visibility);
                            const visibilityClass = isPublishedCommunityVisibility(community.visibility)
                              ? "published"
                              : "unlisted";
	                            const oneLiner =
	                              community.one_liner && community.one_liner.trim().length > 0
	                                ? community.one_liner
	                                : "No one-liner yet.";
                              const canActivate = Boolean(community.slug);
                              const activateDiscoverCard = () => {
                                activateDiscoverCommunityCard({
                                  canActivate,
                                  slug: community.slug,
                                });
                              };
		                            return (
		                              <DiscoverCommunityCard
		                                key={community.slug}
		                                name={community.name}
		                                slug={community.slug}
		                                oneLiner={oneLiner}
		                                avatarUrl={community.avatar_url}
		                                bannerUrl={community.banner_url}
                                        bannerFocusX={community.banner_focus_x}
                                        bannerFocusY={community.banner_focus_y}
                                        bannerZoom={community.banner_zoom}
		                                priceLabel={priceLabel}
		                                visibilityClass={visibilityClass}
		                                visibilityLabel={visibilityLabel}
		                                isPublishedVisibility={isPublishedCommunityVisibility(community.visibility)}
		                                clickable={canActivate}
		                                ariaLabel={
		                                  canActivate ? `View ${community.name}` : undefined
		                                }
		                                onActivate={activateDiscoverCard}
		                              />
		                            );
		                          })}
	                      </div>
	                    </div>
	                  </div>
	                </div>
	              )}

              {publicRoute.kind === "app" && activePage === "community" && (
                <>
                  {communityTab === "chat" && <WebCommunityChatPanel {...communityChatPanelProps} />}

                      <WebCommunitySecondaryPanels {...communitySecondaryPanelsProps} />
                </>
              )}
            </div>
          )}
        </main>
      </div>

	      <WebMessageContextModal
          contextModal={contextModal}
          hasSession={Boolean(cloudSession)}
          onClose={() => setContextModal(null)}
          onSaveSuggestion={(item) => {
            if (!cloudSession) {
              openAuthGate();
              return;
            }
            const tier = builderBillingStatus?.builder_tier ?? "free";
            if (isBuilderTierFree(tier)) {
              setBuilderUpgradeContext("builder");
              setBuilderBillingError("Upgrade to Builder or Architect to use personal memory.");
              setIsBuilderUpgradeOpen(true);
              return;
            }
            void createPersonalMemoryItemDirect({ content: item.content, pinned: item.pinned })
              .then(() => showMemoryToastMessage("Memory updated"))
              .catch((error) => console.warn("Failed to save suggested memory:", error));
          }}
        />

        <WebMemoryImportModal
          isOpen={isMemoryImportModalOpen}
          importPrompt={EXTERNAL_MEMORY_IMPORT_PROMPT}
          importText={memoryImportText}
          parsedCount={memoryImportPlan.parsedItems.length}
          duplicateCount={memoryImportPlan.duplicateCount}
          error={memoryImportError}
          isImporting={isImportingMemory}
          onChangeImportText={(value) => {
            setMemoryImportText(value);
            if (memoryImportError) setMemoryImportError(null);
          }}
          onClose={closeMemoryImportModal}
          onImport={() => void handleImportExternalMemory()}
        />

	      <WebAuthGateModal
          hasSession={Boolean(cloudSession)}
          isOpen={isAuthGateOpen}
          authError={authError}
          onClose={() => setIsAuthGateOpen(false)}
          onSignIn={handleSignIn}
        />

        <WebChatgptConnectModal
          isOpen={isChatgptConnectModalOpen}
          isStarting={isConnectingChatgpt}
          verificationUrl={chatgptDeviceVerificationUrl}
          userCode={chatgptDeviceUserCode}
          isPolling={isPollingChatgptConnection}
          securitySettingsUrl={CHATGPT_SECURITY_SETTINGS_URL}
          manualAuthorizeUrl={chatgptManualAuthorizeUrl}
          manualCallbackInput={chatgptManualCallbackInput}
          isCompletingManual={isCompletingChatgptConnection}
          error={chatgptConnectionError}
          onStartDeviceFlow={() => void handleStartChatgptDeviceConnect()}
          onOpenVerificationPage={handleOpenChatgptAuthorizePage}
          onStartManualFlow={() => void handleStartChatgptManualConnect()}
          onOpenManualAuthPage={handleOpenChatgptManualAuthPage}
          onChangeManualCallbackInput={setChatgptManualCallbackInput}
          onCompleteManual={() => void handleCompleteChatgptManualConnect()}
          onClose={handleCloseChatgptConnectModal}
        />

	      <WebPlatformQuotaModal
	          hasSession={Boolean(cloudSession)}
	          platformQuotaModal={platformQuotaModal}
	          isPlatformQuotaModalRunning={isPlatformQuotaModalRunning}
	          onClose={() => setPlatformQuotaModal(null)}
	          onChangeModel={(threadId) => {
	            setPlatformQuotaModal(null);
              const thread = threads.find((candidate) => candidate.id === threadId) ?? null;
              const projectId = (thread?.project_id ?? "").trim();
              enterWorkspaceThread({
                threadId,
                projectId: projectId || null,
                communityId: thread?.community_id ?? undefined,
              });
              setIsModelPickerOpen(true);
	            window.setTimeout(() => {
	              const root = modelPickerRef.current;
	              const btn = root?.querySelector<HTMLButtonElement>(".ask-model-btn");
              btn?.focus();
            }, 60);
          }}
        />

        <BuilderUpgradeModal
          isOpen={isBuilderUpgradeOpen}
          builderUpgradeContext={builderUpgradeContext}
          builderTier={builderBillingStatus?.builder_tier}
          isStartingBuilderCheckout={isStartingBuilderCheckout}
          builderBillingError={builderBillingError}
          showBuilderUpgradeScrollHint={showBuilderUpgradeScrollHint}
          builderUpgradeModalBodyRef={builderUpgradeModalBodyRef}
          onClose={() => setIsBuilderUpgradeOpen(false)}
          onModalBodyScroll={updateBuilderUpgradeScrollHint}
          onStartBuilderPlanCheckout={(tier) => {
            if (!cloudSession) {
              setIsBuilderUpgradeOpen(false);
              openAuthGate({
                reason: "start_builder_checkout",
                payload: { tier, context: builderUpgradeContext },
              });
              return;
            }
            void startBuilderPlanCheckout(tier, { context: builderUpgradeContext });
          }}
        />

	      <WebCreateCommunityModal
          isOpen={showCreateCommunityModal}
          hasSession={Boolean(cloudSession)}
          communities={communities}
          communityRoleById={communityRoleById}
          builderBillingStatus={builderBillingStatus}
          isCreateBannerDragOver={isCreateBannerDragOver}
          isCreateAvatarDragOver={isCreateAvatarDragOver}
          createCommunityBannerUrl={createCommunityBannerUrl}
          createCommunityAvatarUrl={createCommunityAvatarUrl}
          createCommunityName={createCommunityName}
          createCommunityOneLiner={createCommunityOneLiner}
          createCommunitySlug={createCommunitySlug}
          createCommunityVisibility={createCommunityVisibility}
          createCommunityError={createCommunityError}
          builderBillingError={builderBillingError}
          isCreatingCommunity={isCreatingCommunity}
          communityInitials={communityInitials}
          onClose={closeCreateCommunityModal}
          onPrimaryAction={handleCreateCommunityPrimaryAction}
          onSetBannerDragOver={setIsCreateBannerDragOver}
          onSetAvatarDragOver={setIsCreateAvatarDragOver}
          onBannerDrop={handleCreateBannerDrop}
          onAvatarDrop={handleCreateAvatarDrop}
          onUploadBanner={handleCreateCommunityBannerUpload}
          onUploadAvatar={handleCreateCommunityAvatarUpload}
          onRemoveBanner={() => setCreateCommunityBannerUrl(null)}
          onRemoveAvatar={() => setCreateCommunityAvatarUrl(null)}
          onChangeName={setCreateCommunityName}
          onChangeOneLiner={setCreateCommunityOneLiner}
          onChangeSlug={setCreateCommunitySlug}
          onChangeSlugEdited={setCreateCommunitySlugEdited}
          onChangeVisibility={setCreateCommunityVisibility}
        />

        <WebDeleteCommunityModal
          isOpen={showDeleteCommunityModal}
          activeCommunity={activeCommunity}
          deleteCommunityNameInput={deleteCommunityNameInput}
          deleteCommunityConfirmInput={deleteCommunityConfirmInput}
          deleteCommunityError={deleteCommunityError}
          isDeletingCommunity={isDeletingCommunity}
          onClose={closeDeleteCommunityModal}
          onChangeDeleteCommunityNameInput={setDeleteCommunityNameInput}
          onChangeDeleteCommunityConfirmInput={setDeleteCommunityConfirmInput}
          onConfirmDelete={handleConfirmDeleteCommunity}
        />

      {appToast && (
        <div className="app-toast" role="status" aria-live="polite">
          <div className="app-toast-inner">{appToast}</div>
        </div>
      )}
    </div>
  );
}
