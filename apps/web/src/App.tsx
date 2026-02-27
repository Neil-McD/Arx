import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import "highlight.js/styles/github-dark.css";
import {
  clearPersistedSupabaseSession,
  clearSupabaseAuthFlowPending,
  clearSupabaseSignedOutIntentMarker,
  fetchWithSupabaseAuthShared,
  fetchWithSupabasePublicShared,
  getOAuthRedirectUrl,
  getSupabaseAuthUid,
  getSupabaseAnonKey,
  getSupabaseUrl,
  loadPersistedSupabaseSession,
  hasRecentSupabaseAuthFlowPending,
  markSupabaseAuthFlowPending,
  parseSupabaseOAuthCallbackFromLocation,
  persistSupabaseSession,
  readSupabaseError,
  SUPABASE_SIGNED_OUT_INTENT_KEY,
  SUPABASE_SIGNED_OUT_TAB_INTENT_KEY,
  refreshSupabaseSessionWithLock,
  refreshSupabaseSession,
  type SupabaseSession
} from "./supabase";
import {
  captureBrandosAidFromLocation,
  clearPendingPurchaseClaimToken,
  getBrandosAidForCommunitySlug,
  readPendingPurchaseClaimToken,
  storePendingPublicJoin,
  storePendingPurchaseClaimToken,
  type PendingPurchaseClaim
} from "../../../shared/pay_first";
import {
  readProfileDraftForUser,
  writeProfileDraftForUser,
} from "../../../shared/profileDraftStorage";
import {
  buildContextFallbackThreadTitle,
  deriveThreadTitleFromUserText,
  isMissingThreadTitleValue,
  traceThreadContext,
} from "../../../shared/threadTitleUi";
import {
  buildProjectByIdMap,
  buildProjectThreadGroups,
  filterVisibleThreads,
  resolveCloudThreadProjectId as resolveCloudThreadProjectIdShared,
  resolveGeneralCloudProjectId,
  resolvePreferredCloudProjectId,
  searchThreads,
} from "../../../shared/threadSidebarSelectors";
import {
  type DaytonaSandboxStatus,
} from "../../../shared/daytonaSandboxStatus";
import {
  fetchMappedDaytonaCloudProjects,
} from "../../../shared/daytonaCloudProjects";
import {
  isUuid,
} from "../../../shared/appIdentity";
import {
  isLikelyImageFile,
  isLikelyTextFile,
  isSupportedChatRasterImage,
  readChatImageAsDataUrl,
  readTextAttachmentPreview,
} from "../../../shared/attachmentHelpers";
import {
  clearCreateCommunityDraft,
  createCommunityDraftId,
  loadCreateCommunityDraft,
  saveCreateCommunityDraft,
} from "../../../shared/communityDraftStorage";
import {
  DEFAULT_EMPTY_THREAD_LANDING,
  buildDefaultCommunityEmptyThreadLanding,
  normalizeCommunityAgentDraftForSave,
  normalizeCommunityAgentLanding,
  type CommunityAgentLanding,
} from "../../../shared/communityAgentLanding";
import {
  buildCsv,
  dateKeyLocal,
  formatChatTime,
  formatCount,
  formatMoneyBaseUnits,
  formatPercent,
  formatRelativeTimeFromIso as formatRelativeTime,
  parseContentRangeTotal,
} from "../../../shared/contentFormatting";
import {
  formatBuilderTierLabel,
  hasBuilderTierPaidAccess,
  isBuilderTierFree,
  normalizeBuilderTierForUi,
  formatPlanPrice,
  formatSubscriptionPrice,
  type BuilderBillingReturn,
} from "../../../shared/builderBilling";
import { canUseCreatorDevTierOverride } from "../../../shared/devTierOverride";
import { useCheckoutFinalizeController } from "../../../shared/useCheckoutFinalizeController";
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
  AnalyticsChartMode as SharedAnalyticsChartMode,
  AnalyticsPoint as SharedAnalyticsPoint,
  AnalyticsRange as SharedAnalyticsRange,
  ChatLightboxImage as SharedChatLightboxImage,
  CommunityAccess as SharedCommunityAccess,
  CommunityAgentDraft as SharedCommunityAgentDraft,
  CommunityAnalyticsSummary as SharedCommunityAnalyticsSummary,
  CommunityChatMessage as SharedCommunityChatMessage,
  CommunityPricingMode as SharedCommunityPricingMode,
  DiscoverCommunity as SharedDiscoverCommunity,
  MessageReaction as SharedMessageReaction,
  PublicPlanSummary as SharedPublicPlanSummary,
  UserProfile as SharedUserProfile,
  UserProfileDetail as SharedUserProfileDetail,
} from "../../../shared/communityTypes";
import {
  deriveCommunityAccessCapabilities,
  deriveCommunityActionGuards,
  deriveCommunityNavVisibility,
} from "../../../shared/communityAccessViewModel";
import {
  deriveBackFromWorkspaceSettingsFallbackTransition,
  deriveBackToWorkspaceFallbackTransition,
  deriveOpenCommunityTabTransition,
  deriveOpenDiscoverTransition,
  deriveToggleWorkspaceSettingsTransition,
} from "../../../shared/appNavTransitions";
import {
  type AppRouteState,
  type PublicRoute,
  DEFAULT_POST_SIGN_IN_PATH,
  buildAppRouteHash,
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
} from "../../../shared/supabaseAuthIntent";
import { routePendingAuthIntent } from "../../../shared/supabaseAuthIntentRouter";
import {
  beginGoogleSupabaseSignIn,
  expireSupabaseSessionFailClosed,
  revokeSupabaseSessionRemote,
  SUPABASE_SESSION_EXPIRED_MESSAGE,
} from "../../../shared/supabaseAuthFlow";
import { consumeSupabaseOAuthCallback } from "../../../shared/supabaseOAuthCallback";
import { clearOAuthCallbackParamsFromLocation } from "../../../shared/supabasePkce";
import { resetWebSessionStateAfterSignOut } from "./auth/resetSessionState";
import { resolveUserAccessPolicy } from "../../../shared/capabilities";
import {
  DEFAULT_ACTIVE_MODEL_ID,
  DEFAULT_GUEST_MODEL_ID,
  FREE_MODEL_ALLOWLIST as SHARED_FREE_MODEL_ALLOWLIST,
  FREE_MODEL_LABELS as SHARED_FREE_MODEL_LABELS,
  getDefaultModelToggles,
  getFreeModelEntries,
  inferModelSection,
  isFreeModelId,
  isModelAvailableOnSurface,
  type ModelSectionId,
  type ModelToggle,
} from "../../../shared/modelCatalog";
import {
  APP_THEME_OPTIONS,
  parseAppTheme,
  type AppTheme,
} from "../../../shared/theme";
import { CommunityChatMessageRow } from "../../../shared/CommunityChatMessageRow";
import { useLastClickWinsController } from "../../../shared/useLastClickWinsController";
import { ThreadSidebarPanel } from "../../../src/components/ThreadSidebarPanel";
import { useCommunityChatRealtime } from "../../../shared/useCommunityChatRealtime";
import { useCommunityChatViewport } from "../../../shared/useCommunityChatViewport";
import { useCommunityChatLightbox } from "../../../shared/useCommunityChatLightbox";
import { useMessageAttachmentInputController } from "../../../shared/useMessageAttachmentInputController";
import { useCommunityChatDataController } from "../../../shared/useCommunityChatDataController";
import { useCommunityChatMutationController } from "../../../shared/useCommunityChatMutationController";
import { useCommunityInviteController } from "../../../shared/useCommunityInviteController";
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
import { useWebWorkspaceActionsController } from "../../../shared/useWebWorkspaceActionsController";
import { useWebWorkspaceUiActionsController } from "../../../shared/useWebWorkspaceUiActionsController";
import { useWebSettingsImageUploadController } from "../../../shared/useWebSettingsImageUploadController";
import { useWebThreadDataController } from "../../../shared/useWebThreadDataController";
import { useCommunityAgentPreviewTabFallbackEffect } from "../../../shared/useCommunityAgentPreviewTabFallbackEffect";
import { useCommunityAgentEditorUiController } from "../../../shared/useCommunityAgentEditorUiController";
import { useAuthGateLifecycleEffects } from "../../../shared/useAuthGateLifecycleEffects";
import { useCommunityAdminController } from "../../../shared/useCommunityAdminController";
import { useCommunityAgentDraftController } from "../../../shared/useCommunityAgentDraftController";
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
import { loadCloudCommunityContextPreflight } from "../../../shared/cloudCommunityContextPreflight";
import { AttachmentChipButton } from "../../../shared/AttachmentChipButton";
import { partitionCommunityAttachments } from "../../../shared/communityAttachmentUi";
import {
  buildReplyPrefix,
  extractTextFromContentJson,
  parseMessageAttachments,
  parseReplyPrefix,
  truncateReplyPreview,
  type CommunityMessageAttachment,
} from "../../../shared/communityMessageParsing";
import { buildCommunityInstantAccessLink } from "../../../shared/communityInviteLinks";
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
import { formatUsdCents, toEpochSeconds } from "../../../shared/displayFormatting";
import { isCommunityJoinMode, type CommunityJoinMode } from "./communityJoinPolicy";
import { useWebBuilderBillingActions } from "./controllers/useWebBuilderBillingActions";
import { useWebCommerceAffiliateActions } from "./controllers/useWebCommerceAffiliateActions";
import { useWebPublicFunnelActions } from "./controllers/useWebPublicFunnelActions";
import { useWebAuthSessionLifecycle } from "./controllers/useWebAuthSessionLifecycle";
import { useWebGuestThreadLifecycle } from "./controllers/useWebGuestThreadLifecycle";
import { useWebPostAuthBillingLifecycle } from "./controllers/useWebPostAuthBillingLifecycle";
import { useWebRouteHashLifecycle } from "./controllers/useWebRouteHashLifecycle";
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
import { WebCommunityAnalyticsSection } from "./components/WebCommunityAnalyticsSection";
import { WebCommunityAiAgentSection } from "./components/WebCommunityAiAgentSection";
import { WebCreateCommunityModal } from "./components/WebCreateCommunityModal";
import { WebCommunityChatLightboxModal } from "./components/WebCommunityChatLightboxModal";
import { WebDeleteCommunityModal } from "./components/WebDeleteCommunityModal";
import { WebCommunityLibrarySection } from "./components/WebCommunityLibrarySection";
import { WebCommunityMembersSection } from "./components/WebCommunityMembersSection";
import { WebCommunitySettingsSection } from "./components/WebCommunitySettingsSection";
import { WebMessageContextModal } from "./components/WebMessageContextModal";
import { WebPlatformQuotaModal } from "./components/WebPlatformQuotaModal";
import { WebAuthGateModal } from "./components/WebAuthGateModal";
import { WebCommunityResourceModal } from "./components/WebCommunityResourceModal";
import { WebCommunityResourcesSection } from "./components/WebCommunityResourcesSection";
import { WebModelPickerPopover } from "./components/WebModelPickerPopover";
import { WebPublicRouteView } from "./components/WebPublicRouteView";

type CommunityRecord = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  visibility: string;
  free_join_requires_approval: boolean;
  owner_id: string;
  created_at: string;
  updated_at: string;
};

type PublicCommunityRecord = {
  slug: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  visibility: string;
  free_join_requires_approval: boolean;
  join_mode?: CommunityJoinMode | null;
  created_at: string;
  updated_at: string;
};

type ThreadRecord = {
  id: string;
  title: string | null;
  engine_id: string;
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
  sandbox_status: DaytonaSandboxStatus | null;
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

type UserModelSettings = {
  system_prompt: string;
};

type MessageAttachment = CommunityMessageAttachment;

type CommunityChatMessage = SharedCommunityChatMessage<MessageAttachment>;
type ChatLightboxImage = SharedChatLightboxImage;
type CommunityAgentDraft = SharedCommunityAgentDraft;

const GUEST_THREAD_ID = "__guest__";
const GUEST_THREAD_STORAGE_KEY = "arx_guest_thread_v1";
const GUEST_MODEL_STORAGE_KEY = "arx_guest_model_id_v1";
const GUEST_MODEL_ALLOWLIST = SHARED_FREE_MODEL_ALLOWLIST;
const GUEST_MODEL_LABELS = SHARED_FREE_MODEL_LABELS;

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

function loadGuestModelId(): string {
  try {
    const raw = (localStorage.getItem(GUEST_MODEL_STORAGE_KEY) ?? "").trim();
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
    const raw = localStorage.getItem(GUEST_THREAD_STORAGE_KEY);
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
  community_id: string;
  type: "post" | "link" | "embed";
  title: string;
  body_md: string | null;
  url: string | null;
  file_key: string | null;
  pinned: boolean;
  created_at: string;
};

type CommunityMember = {
  id: string;
  community_id: string;
  user_id: string;
  role: string;
  created_at: string;
  is_entitled?: boolean;
  entitlement_ends_at?: string | null;
  access_status?: string;
  subscription_plan_id?: string | null;
  subscription_billing_period?: string | null;
  subscription_amount_base_units?: number | string | null;
  subscription_currency?: string | null;
  subscription_currency_decimals?: number | null;
};

type CommunityAccess = SharedCommunityAccess;
type CommunityAnalyticsSummary = SharedCommunityAnalyticsSummary;
type AnalyticsPoint = SharedAnalyticsPoint;
type AnalyticsRange = SharedAnalyticsRange;
type AnalyticsChartMode = SharedAnalyticsChartMode;
type CommunityPricingMode = SharedCommunityPricingMode;
type UserProfile = SharedUserProfile;
type UserProfileDetail = SharedUserProfileDetail;

type CommunityInviteRecord = {
  id: string;
  community_id: string;
  code: string;
  max_uses: number | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
};

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
  denied_until: string | null;
  updated_at: string;
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
type DiscoverCommunity = SharedDiscoverCommunity<PublicCommunityRecord>;

type BuilderBillingStatus = {
  user_id: string;
  builder_tier: "free" | "builder" | "architect" | "pro";
  max_communities: number;
  platform_fee_bps: number;
  has_payouts: boolean;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
};

type NavSnapshot = {
  page: AppPage;
  view: AppView;
  settingsPage: SettingsPage;
  communityId: string | null;
  communityTab: CommunityTab;
  threadId: string | null;
  workspaceWantsNewChat: boolean;
};

const REACTION_EMOJIS = ["👍", "❤️", "😂", "🔥", "🫡", "🎉"];
const COMMUNITY_CHAT_PAGE_SIZE = 50;
const COMMUNITY_CHAT_LOAD_MORE_THRESHOLD_PX = 140;
const DEFAULT_MODEL_TOGGLES: ModelToggle[] = getDefaultModelToggles("web");

const MODEL_TOGGLES_STORAGE_KEY = "arx_model_toggles";
const ACTIVE_MODEL_STORAGE_KEY = "arx_active_model_id";

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
  const initialPublicRoute = readPublicRouteFromLocation();
  const initialAppRoute = initialPublicRoute.kind === "app" ? readAppRouteFromLocation() : null;

  const [supabaseSession, setSupabaseSession] = useState<SupabaseSession | null>(() => loadPersistedSupabaseSession());
  const profileStorageUserId = (supabaseSession?.user?.id ?? "").trim() || null;
  const initialProfileDraft = useMemo(
    () => readProfileDraftForUser(profileStorageUserId),
    [profileStorageUserId],
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [magicLinkStatus, setMagicLinkStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null);

  const sessionRef = useRef<SupabaseSession | null>(null);
  const refreshInFlightRef = useRef<Promise<SupabaseSession | null> | null>(null);
  const refreshTimeoutRef = useRef<number | null>(null);
  const didJustSignInRef = useRef(false);
  const authSessionEpochRef = useRef(0);

  const [publicRoute, setPublicRoute] = useState<PublicRoute>(() => initialPublicRoute);

  const [activePage, setActivePage] = useState<AppPage>(() => initialAppRoute?.page ?? "workspace");
  const [activeView, setActiveView] = useState<AppView>(() => initialAppRoute?.view ?? "home");
  const [settingsPage, setSettingsPage] = useState<SettingsPage>(() => initialAppRoute?.settingsPage ?? "models");
  const settingsGroup = settingsGroupForPage(settingsPage);
  const [userWantsSessions, setUserWantsSessions] = useState(false);
  const [appTheme, setAppTheme] = useState<AppTheme>(() => {
    try {
      const stored = parseAppTheme(localStorage.getItem("arx-theme"));
      if (stored) return stored;
      return "dark";
    } catch {
      return "dark";
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
  const [selectedPublicCommunityBillingPeriod, setSelectedPublicCommunityBillingPeriod] = useState<string | null>(null);
  const [publicCommunityError, setPublicCommunityError] = useState<string | null>(null);
  const [isLoadingPublicCommunity, setIsLoadingPublicCommunity] = useState(false);
  const [isJoiningPublicCommunity, setIsJoiningPublicCommunity] = useState(false);
  const [publicJoinError, setPublicJoinError] = useState<string | null>(null);
  const [myPublicCommunityJoinRequest, setMyPublicCommunityJoinRequest] = useState<MyCommunityJoinRequest | null>(null);
  const [isLoadingMyPublicCommunityJoinRequest, setIsLoadingMyPublicCommunityJoinRequest] = useState(false);
  const [isRequestingPublicCommunityAccess, setIsRequestingPublicCommunityAccess] = useState(false);
  const [publicRequestAccessError, setPublicRequestAccessError] = useState<string | null>(null);

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
  const [isStartingBuilderPortal, setIsStartingBuilderPortal] = useState(false);
  const [isStartingConnectOnboarding, setIsStartingConnectOnboarding] = useState(false);
  const [isBuilderUpgradeOpen, setIsBuilderUpgradeOpen] = useState(false);
  const [builderUpgradeContext, setBuilderUpgradeContext] = useState<BuilderUpgradeContext>("builder");
  const [builderBillingReturn, setBuilderBillingReturn] = useState<BuilderBillingReturn | null>(null);
  const [, setIsFinalizingBuilderReturn] = useState(false);
  const [isFinalizingCreateCommunityFromBilling, setIsFinalizingCreateCommunityFromBilling] = useState(false);
  const [, setFinalizeCreateCommunityError] = useState<string | null>(null);
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
      const stored = (localStorage.getItem(ACTIVE_MODEL_STORAGE_KEY) ?? "").trim();
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
  const [isLoadingCommunities, setIsLoadingCommunities] = useState<boolean>(() => Boolean(supabaseSession));
  const [communities, setCommunities] = useState<CommunityRecord[]>([]);
  const [communityRoleById, setCommunityRoleById] = useState<Record<string, string>>({});
  const [activeCommunityId, setActiveCommunityId] = useState<string | null>(() => initialAppRoute?.communityId ?? null);
  const communityRailOrderStorageKey = useMemo(
    () => `arx-community-rail-order:web:${supabaseSession?.user?.id ?? "local"}`,
    [supabaseSession?.user?.id],
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
  const [createCommunityDescription, setCreateCommunityDescription] = useState("");
  const [createCommunityBannerUrl, setCreateCommunityBannerUrl] = useState<string | null>(null);
  const [createCommunityError, setCreateCommunityError] = useState<string | null>(null);
  const [isCreatingCommunity, setIsCreatingCommunity] = useState(false);
  const [isCreateAvatarDragOver, setIsCreateAvatarDragOver] = useState(false);
  const [isCreateBannerDragOver, setIsCreateBannerDragOver] = useState(false);
  const [activeCommunityAccess, setActiveCommunityAccess] = useState<CommunityAccess | null>(null);
  const communityAccessCapabilities = useMemo(
    () => deriveCommunityAccessCapabilities(activeCommunityAccess),
    [activeCommunityAccess],
  );
  const communityNavVisibility = useMemo(
    () => deriveCommunityNavVisibility(communityAccessCapabilities),
    [communityAccessCapabilities],
  );
  const communityActionGuards = useMemo(
    () => deriveCommunityActionGuards(communityAccessCapabilities),
    [communityAccessCapabilities],
  );
  const [, setIsLoadingCommunityAccess] = useState(false);
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, UserProfile>>({});
  const [communityTab, setCommunityTab] = useState<CommunityTab>(() => initialAppRoute?.communityTab ?? "chat");

  const [communityMessages, setCommunityMessages] = useState<CommunityChatMessage[]>([]);
  const [communityMessageInput, setCommunityMessageInput] = useState("");
  const [workspaceAttachments, setWorkspaceAttachments] = useState<MessageAttachment[]>([]);
  const workspaceAttachmentsRef = useRef<MessageAttachment[]>([]);
  const [threadError, setThreadError] = useState<string | null>(null);
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
    ingestAttachmentsFromFileList: ingestAttachmentsFromFileList,
  });
  const {
    handleAttachmentFileInputChange: handleCommunityFileInputChange,
    removeAttachment: removeCommunityAttachment,
  } = useMessageAttachmentInputController<MessageAttachment>({
    attachmentsRef: communityAttachmentsRef,
    setAttachments: setCommunityAttachments,
    setError: setCommunityChatError,
    ingestAttachmentsFromFileList: ingestAttachmentsFromFileList,
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
    toCommunityChatMessage,
    ensureCommunityChatThread,
    loadCommunityChat,
    loadOlderCommunityChat,
    resetCommunityChatDataState,
  } = useCommunityChatDataController<
    SupabaseSession,
    MessageAttachment,
    CommunityChatMessage,
    MessageReaction
  >({
    getSupabaseUrl,
    fetchWithSupabaseAuth,
    readSupabaseError,
    extractTextFromContentJson,
    parseMessageAttachments,
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
      supabaseSession
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
    if (!supabaseSession || !activeCommunityId) return;
    void loadOlderCommunityChat(activeCommunityId, supabaseSession);
  };

  const { communityTypingUserIds, maybeBroadcastCommunityTyping } = useCommunityChatRealtime({
    isEnabled: activePage === "community" && communityTab === "chat",
    supabaseSession,
    activeCommunityId,
    getSupabaseUrl,
    getSupabaseAnonKey,
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
    supabaseSession,
    getSupabaseUrl,
    requireAnonKey: false,
    missingConfigMessage: "Missing Supabase URL.",
    missingPayloadMessage: "Message sent, but no payload returned.",
    fetchWithSupabaseAuth,
    ensureCommunityChatThread,
    toCommunityChatMessage,
    loadCommunityChat,
    parseReplyPrefix,
    buildReplyPrefix,
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
  const [membersCommunityHasPaidPlans, setMembersCommunityHasPaidPlans] = useState<boolean | null>(null);
  const [isLoadingMembersCommunityPricing, setIsLoadingMembersCommunityPricing] = useState(false);
  const [communityJoinRequests, setCommunityJoinRequests] = useState<CommunityJoinRequest[]>([]);
  const [isLoadingCommunityJoinRequests, setIsLoadingCommunityJoinRequests] = useState(false);
  const [communityJoinRequestsError, setCommunityJoinRequestsError] = useState<string | null>(null);
  const [decidingCommunityJoinRequestId, setDecidingCommunityJoinRequestId] = useState<string | null>(null);
  const [isJoinRequestsModalOpen, setIsJoinRequestsModalOpen] = useState(false);
  const [isSavingFreeJoinRequiresApproval, setIsSavingFreeJoinRequiresApproval] = useState(false);
  const [communityInvites, setCommunityInvites] = useState<CommunityInviteRecord[]>([]);
  const [isLoadingCommunityInvites, setIsLoadingCommunityInvites] = useState(false);
  const [inviteMaxUsesPreset, setInviteMaxUsesPreset] = useState("unlimited");
  const [inviteMaxUsesCustom, setInviteMaxUsesCustom] = useState("");
  const [inviteExpiryPreset, setInviteExpiryPreset] = useState("7d");
  const [inviteExpiryCustom, setInviteExpiryCustom] = useState("");
  const [inviteCreateError, setInviteCreateError] = useState<string | null>(null);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const {
    loadCommunityInvites,
    handleCreateInvite,
    handleRevokeInvite,
    handleDeleteInvite,
  } = useCommunityInviteController<SupabaseSession, CommunityInviteRecord>({
    activeCommunityId,
    supabaseSession,
    getSupabaseUrl,
    fetchWithSupabaseAuth,
    inviteMaxUsesPreset,
    inviteMaxUsesCustom,
    inviteExpiryPreset,
    inviteExpiryCustom,
    setCommunityInvites,
    setIsLoadingCommunityInvites,
    setInviteCreateError,
    setIsCreatingInvite,
    setInviteMaxUsesPreset,
    setInviteMaxUsesCustom,
    setInviteExpiryPreset,
    setInviteExpiryCustom,
    onInviteCreated: async (invite) => {
      const communitySlug =
        communities.find((community) => community.id === activeCommunityId)?.slug ?? "";
      await copyTextToClipboard(
        buildCommunityInstantAccessLink(window.location.origin, communitySlug, invite.code),
      );
    },
  });

  const {
    loadCommunityResources,
    handleSaveCommunityResource,
    handleDeleteResource,
  } = useCommunityResourceController<SupabaseSession, CommunityResource>({
    activeCommunityId,
    supabaseSession,
    getSupabaseUrl,
    requireAnonKey: false,
    missingConfigMessage: "Missing Supabase URL.",
    parseEmbedUrl,
    fetchWithSupabaseAuth,
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
  const [communityAnalyticsChartMode, setCommunityAnalyticsChartMode] = useState<AnalyticsChartMode>("members");
  const [communityRevenueSeries, setCommunityRevenueSeries] = useState<AnalyticsPoint[]>([]);
  const [communityRevenueMeta, setCommunityRevenueMeta] = useState<{ currency: string; currency_decimals: number } | null>(null);
  const [communityRevenueError, setCommunityRevenueError] = useState<string | null>(null);
  const [communityAnalyticsRange, setCommunityAnalyticsRange] = useState<AnalyticsRange>(() => {
    try {
      const stored = localStorage.getItem("arx-community-analytics-range");
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
  const [communitySettingsDescription, setCommunitySettingsDescription] = useState("");
  const [communitySettingsVisibility, setCommunitySettingsVisibility] = useState("unlisted");
  const [communitySettingsAvatarUrl, setCommunitySettingsAvatarUrl] = useState<string | null>(null);
  const [communitySettingsBannerUrl, setCommunitySettingsBannerUrl] = useState<string | null>(null);
  const [, setCommunitySettingsMonthlyPlanId] = useState<string | null>(null);
  const [, setCommunitySettingsYearlyPlanId] = useState<string | null>(null);
  const [communitySettingsPricingMode, setCommunitySettingsPricingMode] = useState<CommunityPricingMode>("free");
  const [communitySettingsPriceUsdMonthly, setCommunitySettingsPriceUsdMonthly] = useState("");
  const [communitySettingsPriceUsdYearly, setCommunitySettingsPriceUsdYearly] = useState("");
  const [communitySettingsError, setCommunitySettingsError] = useState<string | null>(null);
  const [communitySettingsBannerUploadError, setCommunitySettingsBannerUploadError] = useState<string | null>(null);
  const [isProcessingCommunitySettingsBanner, setIsProcessingCommunitySettingsBanner] = useState(false);
  const [isSavingCommunitySettings, setIsSavingCommunitySettings] = useState(false);
  const [isSettingsBannerDragOver, setIsSettingsBannerDragOver] = useState(false);
  const [isSettingsAvatarDragOver, setIsSettingsAvatarDragOver] = useState(false);
  const communitySettingsLoadedCommunityIdRef = useRef<string | null>(null);
  const communitySettingsDirtyRef = useRef(false);
  const communityPricingDirtyRef = useRef(false);
  const markCommunitySettingsDirty = () => {
    communitySettingsDirtyRef.current = true;
  };
  const [communityAgentDrafts, setCommunityAgentDrafts] = useState<CommunityAgentDraft[]>([]);
  const [isLoadingCommunityAgentDrafts, setIsLoadingCommunityAgentDrafts] = useState(false);
  const [communityAgentDraftsError, setCommunityAgentDraftsError] = useState<string | null>(null);
  const communityAgentDraftsLoadedCommunityIdRef = useRef<string | null>(null);

  const [communityAgentDraftName, setCommunityAgentDraftName] = useState("");
  const [communityAgentDraftLanding, setCommunityAgentDraftLanding] = useState<CommunityAgentLanding>(
    DEFAULT_EMPTY_THREAD_LANDING,
  );
  const [communityAgentDraftSystemPrompt, setCommunityAgentDraftSystemPrompt] = useState("");
  const [communityAgentPreviewTabId, setCommunityAgentPreviewTabId] = useState<string>("");
  type CommunityAgentLandingEdit =
    | { kind: "title" }
    | { kind: "subtitle" }
    | { kind: "tab_label"; tabId: string }
    | { kind: "prompt"; tabId: string; index: number }
    | { kind: "add_prompt"; tabId: string };
  const [communityAgentLandingEdit, setCommunityAgentLandingEdit] = useState<CommunityAgentLandingEdit | null>(null);
  const [communityAgentLandingEditValue, setCommunityAgentLandingEditValue] = useState("");
  const [isSavingCommunityAgentDraft, setIsSavingCommunityAgentDraft] = useState(false);
  const [communityAgentDraftSaveError, setCommunityAgentDraftSaveError] = useState<string | null>(null);
  const communityAgentDraftDirtyRef = useRef(false);
  const {
    markCommunityAgentDraftDirty,
    beginCommunityAgentLandingEdit,
    clearCommunityAgentLandingEdit,
    hydrateCommunityAgentEditor,
  } = useCommunityAgentEditorUiController<CommunityAgentLanding, CommunityAgentLandingEdit, CommunityAgentDraft>({
    activeCommunityId,
    communities,
    defaultLanding: DEFAULT_EMPTY_THREAD_LANDING,
    buildDefaultCommunityLanding: buildDefaultCommunityEmptyThreadLanding,
    normalizeCommunityAgentLanding,
    setCommunityAgentDraftName,
    setCommunityAgentDraftLanding,
    setCommunityAgentDraftSystemPrompt,
    setCommunityAgentDraftSaveError,
    setCommunityAgentPreviewTabId,
    setCommunityAgentLandingEdit,
    setCommunityAgentLandingEditValue,
    communityAgentDraftDirtyRef,
  });

  const [communityMemberMuted, setCommunityMemberMuted] = useState(false);
  const [isLoadingCommunityMemberSettings, setIsLoadingCommunityMemberSettings] = useState(false);
  const [communityMemberSettingsError, setCommunityMemberSettingsError] = useState<string | null>(null);
  const [isLeavingCommunity, setIsLeavingCommunity] = useState(false);

  const [threads, setThreads] = useState<ThreadRecord[]>([]);
  const [cloudProjects, setCloudProjects] = useState<CloudProjectRecord[]>([]);
  const [activeCloudProjectId, setActiveCloudProjectId] = useState<string | null>(null);
  const [cloudProjectExpandedById, setCloudProjectExpandedById] = useState<Record<string, boolean>>({});
  const [cloudProjectMenuProjectId, setCloudProjectMenuProjectId] = useState<string | null>(null);
  const [showCreateCloudProjectModal, setShowCreateCloudProjectModal] = useState(false);
  const [createCloudProjectName, setCreateCloudProjectName] = useState("");
  const [createCloudProjectError, setCreateCloudProjectError] = useState<string | null>(null);
  const [isCreatingCloudProject, setIsCreatingCloudProject] = useState(false);
  const [showRenameCloudProjectModal, setShowRenameCloudProjectModal] = useState(false);
  const [renameCloudProjectId, setRenameCloudProjectId] = useState<string | null>(null);
  const [renameCloudProjectName, setRenameCloudProjectName] = useState("");
  const [renameCloudProjectError, setRenameCloudProjectError] = useState<string | null>(null);
  const [isRenamingCloudProject, setIsRenamingCloudProject] = useState(false);
  const cloudProjectMenuRef = useRef<HTMLDivElement | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => initialAppRoute?.threadId ?? null);
  const [threadSearchQuery, setThreadSearchQuery] = useState("");
  const initialWorkspaceWantsNewChat = Boolean(
    initialAppRoute && initialAppRoute.threadIsExplicit && initialAppRoute.threadId === null,
  );
  const [workspaceWantsNewChat, setWorkspaceWantsNewChat] = useState<boolean>(initialWorkspaceWantsNewChat);
  const workspaceWantsNewChatRef = useRef<boolean>(initialWorkspaceWantsNewChat);
  const setWorkspaceWantsNewChatMode = (next: boolean) => {
    workspaceWantsNewChatRef.current = next;
    setWorkspaceWantsNewChat(next);
  };
  const resolvedActiveCloudProjectId = useMemo(
    () => resolvePreferredCloudProjectId(cloudProjects, activeCloudProjectId),
    [activeCloudProjectId, cloudProjects],
  );

  const navStackRef = useRef<NavSnapshot[]>([]);
  const takeNavSnapshot = (): NavSnapshot => ({
    page: activePage,
    view: activeView,
    settingsPage,
    communityId: activeCommunityId,
    communityTab,
    threadId: activeThreadId,
    workspaceWantsNewChat,
  });
  const pushNavSnapshot = () => {
    const snapshot = takeNavSnapshot();
    pushUniqueNavSnapshot(navStackRef.current, snapshot, {
      includeWorkspaceWantsNewChat: true,
    });
  };
  const restoreNavSnapshot = (snapshot: NavSnapshot) => {
    setActivePage(snapshot.page);
    setActiveView(snapshot.page === "workspace" ? snapshot.view : "home");
    setSettingsPage(snapshot.settingsPage);
    setActiveCommunityId(snapshot.communityId);
    setCommunityTab(snapshot.communityTab);
    setActiveThreadId(snapshot.threadId);
    setWorkspaceWantsNewChatMode(snapshot.workspaceWantsNewChat);
  };
  const goBack = (): boolean => {
    const snapshot = popNavSnapshot(navStackRef.current) as NavSnapshot | null;
    if (!snapshot) return false;
    restoreNavSnapshot(snapshot);
    return true;
  };

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!cloudProjectMenuRef.current) return;
      if (cloudProjectMenuRef.current.contains(event.target as Node)) return;
      setCloudProjectMenuProjectId(null);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const backTargetSnapshot = navStackRef.current.length > 0 ? navStackRef.current[navStackRef.current.length - 1] : null;
  const backTargetLabel = backTargetSnapshot ? formatBackTargetLabelShared(backTargetSnapshot) : null;

  const threadsHydratedRef = useRef(false);
  const lastCloudStatusRefreshAtRef = useRef(0);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [guestModelId, setGuestModelId] = useState<string>(() => loadGuestModelId());
  const [messageInput, setMessageInput] = useState("");
  const DESKTOP_INSTALLED_KEY = "arx-desktop-installed";
  const DESKTOP_DOWNLOAD_DISMISSED_UNTIL_KEY = "arx-desktop-download-dismissed-until";
  const DESKTOP_DOWNLOAD_DISMISS_MS = 12 * 60 * 60 * 1000;
  const isTauriEnv = Boolean((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);
  const [desktopInstalled, setDesktopInstalled] = useState(() => {
    if (isTauriEnv) return true;
    try {
      return localStorage.getItem(DESKTOP_INSTALLED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [desktopDownloadDismissedUntil, setDesktopDownloadDismissedUntil] = useState(() => {
    try {
      const raw = localStorage.getItem(DESKTOP_DOWNLOAD_DISMISSED_UNTIL_KEY);
      const parsed = raw ? Number(raw) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
      return 0;
    } catch {
      return 0;
    }
  });
  const [activeCommunityAgentLanding, setActiveCommunityAgentLanding] = useState<unknown | null>(null);
  const activeCommunityAgentLandingCommunityIdRef = useRef<string | null>(null);
  const activeCommunityIdRef = useRef<string | null>(null);
  const communityAgentLandingFetchSeqRef = useRef(0);
  const [emptyThreadSection, setEmptyThreadSection] = useState<string>("community");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
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
    memory_mode: "off",
    remember_intent_enabled: true,
  });
  const [isLoadingUserMemorySettings, setIsLoadingUserMemorySettings] = useState(false);
  const [userModelSettings, setUserModelSettings] = useState<UserModelSettings>({ system_prompt: "" });
  const [systemPromptDraft, setSystemPromptDraft] = useState("");
  const [isLoadingUserModelSettings, setIsLoadingUserModelSettings] = useState(false);
  const [isSavingUserModelSettings, setIsSavingUserModelSettings] = useState(false);
  const [userModelSettingsError, setUserModelSettingsError] = useState<string | null>(null);
  const [contextModal, setContextModal] = useState<
    MessageContextModalPayload<MemoryUsedItem, HistoryUsedItem, MemorySuggestion> | null
  >(null);
  const workspaceMessageListRef = useRef<HTMLDivElement | null>(null);
  const [isWorkspaceAtBottom, setIsWorkspaceAtBottom] = useState(true);
  const autoScrollEnabledRef = useRef(true);
  const lastWorkspaceScrollTopRef = useRef(0);
  const isLoadingThreadRef = useRef(false);
  const workspaceAskInputRef = useRef<HTMLTextAreaElement | null>(null);
  const workspaceFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [modelPickerQuery, setModelPickerQuery] = useState("");
  const [modelPickerSection, setModelPickerSection] = useState<ModelSectionId>("all");
  const modelPickerRef = useRef<HTMLDivElement | null>(null);
  const modelPickerSearchRef = useRef<HTMLInputElement | null>(null);
  const [isAuthGateOpen, setIsAuthGateOpen] = useState(false);

  const openAuthGate = (intentInput?: unknown) => {
    setAuthError(null);
    const intent = parsePendingAuthIntentInput(intentInput);
    if (intent && !supabaseSession) {
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      storePendingAuthIntent(buildPendingAuthIntent(intent, returnTo));
    }
    setIsAuthGateOpen(true);
  };

  const { loadCommunities, loadCommunityAccess, loadUserProfiles } = useWebCommunityAccessController<
    SupabaseSession,
    CommunityRecord,
    CommunityAccess,
    UserProfile
  >({
    getSupabaseUrl,
    getSupabaseAuthUid,
    fetchWithSupabaseAuth,
    readSupabaseError,
    toCanonicalCommunityVisibility,
    activeCommunityId,
    setIsLoadingCommunities,
    setCommunityRoleById,
    setCommunities,
    setActiveCommunityId,
    setIsLoadingCommunityAccess,
    setActiveCommunityAccess,
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
    SupabaseSession,
    CommunityMember,
    UserProfile,
    UserProfileDetail
  >({
    activeCommunityId,
    supabaseSession,
    getSupabaseUrl,
    fetchWithSupabaseAuth,
    readSupabaseError,
    parseContentRangeTotal,
    dateKeyLocal,
    ensureCommunityChatThread,
    confirmAction: (message) => confirm(message),
    getMemberRefreshIncludeStatus: () => communityNavVisibility.canManageMembers,
    reloadCommunities: loadCommunities,
    reloadCommunityAccess: loadCommunityAccess,
    loadUserProfiles: (userIds, session) => void loadUserProfiles(userIds, session),
    getProfileSaveSession: () => sessionRef.current ?? supabaseSession,
    profileName,
    profileBio,
    profileAvatarUrl,
    profileSaveTimeoutRef,
    profileSaveFailureMessage: "Failed to save profile.",
    profileSaveUnauthenticatedErrorMessage: null,
    onProfileSaveUnauthenticated: () => {
      openAuthGate({ reason: "save_profile", payload: {} });
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
    setCommunityRevenueError,
    setCommunityAnalyticsSummary,
    setCommunityAnalyticsSeries,
    setCommunityRevenueSeries,
    setCommunityRevenueMeta,
  });

  const {
    loadCommunityAgentDrafts,
    handleSaveCommunityAgentDraft,
    handleSetLiveCommunityAgentDraft,
  } = useCommunityAgentDraftController<SupabaseSession, CommunityAgentLanding, CommunityAgentDraft>({
    activeCommunityId,
    supabaseSession,
    getSupabaseUrl,
    fetchWithSupabaseAuth,
    readSupabaseError,
    communityAgentDraftName,
    communityAgentDraftLanding,
    communityAgentDraftSystemPrompt,
    communityAgentDrafts,
    normalizeDraftForSave: normalizeCommunityAgentDraftForSave,
    hydrateDraftEditor: hydrateCommunityAgentEditor,
    setLoadedCommunityId: (communityId) => {
      communityAgentDraftsLoadedCommunityIdRef.current = communityId;
    },
    markDraftClean: () => {
      communityAgentDraftDirtyRef.current = false;
    },
    setIsLoadingCommunityAgentDrafts,
    setCommunityAgentDraftsError,
    setCommunityAgentDrafts,
    setIsSavingCommunityAgentDraft,
    setCommunityAgentDraftSaveError,
    saveValidationErrorMessage: "Add at least one tab with a label and one prompt.",
    loadFailureMessage: "Failed to load AI agent drafts.",
    saveFailureMessage: "Failed to save AI agent draft.",
    setLiveFailureMessage: "Failed to set live draft.",
  });

  const {
    syncCommunitySettingsSelection,
  } = useCommunitySettingsFormController<CommunityRecord, CommunityInviteRecord>({
    slugifyCommunityName,
    communitySettingsLoadedCommunityIdRef,
    communitySettingsDirtyRef,
    communityPricingDirtyRef,
    setCommunitySettingsError,
    setCommunityMemberSettingsError,
    setCommunitySettingsName,
    setCommunitySettingsSlug,
    setCommunitySettingsDescription,
    setCommunitySettingsVisibility,
    setCommunitySettingsAvatarUrl,
    setCommunitySettingsBannerUrl,
    setCommunitySettingsMonthlyPlanId,
    setCommunitySettingsYearlyPlanId,
    setCommunitySettingsPricingMode,
    setCommunitySettingsPriceUsdMonthly,
    setCommunitySettingsPriceUsdYearly,
    setCommunityMemberMuted,
    setCommunityInvites,
    setInviteCreateError,
    setCommunitySettingsBannerUploadError,
    setIsProcessingCommunitySettingsBanner,
  });

  const {
    loadCommunityMemberSettings,
    loadCommunityPricing,
  } = useCommunitySettingsDataController<SupabaseSession>({
    getSupabaseUrl,
    fetchWithSupabaseAuth,
    readSupabaseError,
    communitySettingsLoadedCommunityIdRef,
    communityPricingDirtyRef,
    setCommunityMemberMuted,
    setIsLoadingCommunityMemberSettings,
    setCommunityMemberSettingsError,
    setCommunitySettingsMonthlyPlanId,
    setCommunitySettingsYearlyPlanId,
    setCommunitySettingsPricingMode,
    setCommunitySettingsPriceUsdMonthly,
    setCommunitySettingsPriceUsdYearly,
  });

  const {
    handleToggleCommunityMute,
    handleLeaveCommunity,
    handleSaveCommunitySettings,
  } = useCommunitySettingsGovernanceController<SupabaseSession>({
    activeCommunityId,
    supabaseSession,
    getSupabaseUrl,
    fetchWithSupabaseAuth,
    readSupabaseError,
    confirmAction: (message) => confirm(message),
    loadCommunities,
    onLeaveCommunityLocalState: (leavingId) => {
      setActiveCommunityId(null);
      setActivePage("workspace");
      setActiveView("home");
      setCommunityTab("chat");
      setCommunities((prev) => prev.filter((community) => community.id !== leavingId));
    },
    setCommunityMemberSettingsError,
    setIsLoadingCommunityMemberSettings,
    setCommunityMemberMuted,
    setIsLeavingCommunity,
    communitySettingsName,
    communitySettingsSlug,
    communitySettingsDescription,
    communitySettingsVisibility,
    communitySettingsAvatarUrl,
    communitySettingsBannerUrl,
    communitySettingsPricingMode,
    communitySettingsPriceUsdMonthly,
    communitySettingsPriceUsdYearly,
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
                description: result.description,
                avatar_url: result.avatar_url,
                banner_url: result.banner_url,
                visibility: toCanonicalCommunityVisibility(result.visibility, "unlisted"),
                updated_at: result.updated_at,
              }
            : community,
        ),
      );
      setCommunitySettingsMonthlyPlanId(result.monthly_plan_id);
      setCommunitySettingsYearlyPlanId(result.yearly_plan_id);
      communitySettingsDirtyRef.current = false;
      communityPricingDirtyRef.current = false;
    },
  });
  const {
    openDeleteCommunityModal,
    closeDeleteCommunityModal,
    handleConfirmDeleteCommunity,
  } = useCommunityDeleteController<
    SupabaseSession,
    CommunityRecord,
    AppPage,
    AppView,
    CommunityTab
  >({
    supabaseSession,
    activeCommunityId,
    getSupabaseUrl,
    fetchWithSupabaseAuth,
    readSupabaseError,
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
    loadCommunityHasPaidPlans,
    loadCommunityJoinRequests,
    handleApproveCommunityJoinRequest,
    handleDenyCommunityJoinRequest,
    handleSetCommunityFreeJoinRequiresApproval,
  } = useCommunityMembersReviewController<
    SupabaseSession,
    CommunityJoinRequest,
    CommunityRecord
  >({
    activeCommunityId,
    supabaseSession,
    canManageMembersActiveCommunity: communityNavVisibility.canManageMembers,
    isSavingFreeJoinRequiresApproval,
    getSupabaseUrl,
    fetchWithSupabaseAuth,
    readSupabaseError,
    loadUserProfiles: (userIds, session) => void loadUserProfiles(userIds, session),
    loadCommunityMembers,
    setCommunities,
    setCommunityJoinRequests,
    setIsLoadingCommunityJoinRequests,
    setCommunityJoinRequestsError,
    setDecidingCommunityJoinRequestId,
    setIsSavingFreeJoinRequiresApproval,
  });

  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [discoverQuery, setDiscoverQuery] = useState("");
  const [discoverCommunities, setDiscoverCommunities] = useState<DiscoverCommunity[]>([]);
  const [isLoadingDiscover, setIsLoadingDiscover] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  const { loadThreads, loadThreadMessages, loadModelRegistry } = useWebThreadDataController<
    SupabaseSession,
    ThreadMessage
  >({
    getSupabaseUrl,
    fetchWithSupabaseAuth,
    readSupabaseError,
    toEpochSeconds,
    formatModelLabel,
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
    loadUserModelSettings,
    loadPersonalMemoryItems,
    searchPersonalMemoryItems,
  } = useWebMemorySettingsDataController<SupabaseSession>({
    getSession: () => sessionRef.current,
    getSupabaseUrl,
    getSupabaseAuthUid,
    fetchWithSupabaseAuth,
    readSupabaseError,
    setIsLoadingUserMemorySettings,
    setUserMemorySettings,
    setIsLoadingUserModelSettings,
    setUserModelSettings,
    setSystemPromptDraft,
    setUserModelSettingsError,
    setIsLoadingPersonalMemory,
    setPersonalMemoryError,
    setPersonalMemoryItems,
  });

  const {
    saveUserMemorySettings,
    saveUserModelSettings,
    createPersonalMemoryItemDirect,
    handleCreatePersonalMemoryItem,
    handleTogglePersonalMemoryPinned,
    handleDeletePersonalMemoryItem,
  } = useWebMemoryMutationController<SupabaseSession>({
    getSession: () => sessionRef.current,
    getSupabaseUrl,
    getSupabaseAuthUid,
    fetchWithSupabaseAuth,
    readSupabaseError,
    openAuthGate,
    loadPersonalMemoryItems,
    newPersonalMemoryContent,
    newPersonalMemoryScope,
    newPersonalMemoryPinned,
    setIsLoadingUserMemorySettings,
    setUserMemorySettings,
    setIsSavingUserModelSettings,
    setUserModelSettings,
    setUserModelSettingsError,
    setPersonalMemoryError,
    setNewPersonalMemoryContent,
    setNewPersonalMemoryPinned,
  });

  const { createThread, updateThreadModel, maybeSetThreadTitleFromText, setThreadCommunityLens } =
    useWebThreadMutationController<SupabaseSession>({
      getSupabaseUrl,
      getSupabaseAuthUid,
      fetchWithSupabaseAuth,
      readSupabaseError,
      syncThreadCommunityLensCloud,
      deriveThreadTitleFromUserText,
      isMissingThreadTitleValue,
      toEpochSeconds,
      activeCommunityId,
      activeProjectId: resolvedActiveCloudProjectId,
      activeModelId,
      modelToggles,
      threads,
      defaultActiveModelId: DEFAULT_ACTIVE_MODEL_ID,
      setThreads,
      setWorkspaceWantsNewChatMode,
      setActiveThreadId,
    });

  const { loadDiscoverCommunities } = useWebDiscoverController<DiscoverCommunity>({
    getSupabaseUrl,
    fetchWithSupabasePublic,
    readSupabaseError,
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

  const refreshCloudProjectStatuses = useCallback(() => {
    if (!supabaseSession) return;
    if (activePage !== "workspace") return;
    const now = Date.now();
    if (now - lastCloudStatusRefreshAtRef.current < 1000) return;
    lastCloudStatusRefreshAtRef.current = now;
    void loadCloudProjects(supabaseSession);
  }, [activePage, loadCloudProjects, supabaseSession]);

  const {
    stopStreamingTurn,
    runPublicTurn,
    runAgentTurn,
    createThreadMessage,
    createAssistantTextMessage,
    deleteThreadMessagesByIds,
  } = useWebTurnRunnerController<
    SupabaseSession,
    ThreadMessage,
    MemoryUsedItem,
    HistoryUsedItem,
    CommunityEvidenceUsedV1
  >({
    getSupabaseUrl,
    fetchWithSupabasePublic,
    fetchWithSupabaseAuth,
    readSupabaseError,
    extractTextFromContentJson,
    parseMemoryUsedArray,
    parseHistoryUsedArray,
    extractCommunityEvidenceUsedV1,
    loadThreadMessages,
    loadThreads,
    showMemoryToastMessage,
    setPlatformQuotaModal,
    setStreamingContent,
    setStreamingThreadId,
    setStreamingRunId,
    setStreamingMeta,
    streamingContentRef,
    streamingRafRef,
    streamingAbortRef,
    streamingUserCancelledRef,
    onCloudRunLifecycleEvent: () => {
      refreshCloudProjectStatuses();
    },
    runtimeTurnV2Enabled: String(((import.meta as any)?.env?.VITE_ENABLE_RUNTIME_TURN_V2 ?? "true"))
      .trim()
      .toLowerCase() === "true",
  });

  const desktopDownloadUrl = (((import.meta as any)?.env?.VITE_ARX_DESKTOP_DOWNLOAD_URL as string | undefined) ?? "").trim();
  const dismissDesktopDownload = () => {
    const until = Date.now() + DESKTOP_DOWNLOAD_DISMISS_MS;
    try {
      localStorage.setItem(DESKTOP_DOWNLOAD_DISMISSED_UNTIL_KEY, String(until));
    } catch {
      // ignore
    }
    setDesktopDownloadDismissedUntil(until);
  };

  useEffect(() => {
    // If we're running inside the desktop app, remember it so the web app can hide the CTA
    // when it shares storage/origin (e.g. hosted web app loaded by Tauri).
    if (!isTauriEnv) return;
    try {
      localStorage.setItem(DESKTOP_INSTALLED_KEY, "1");
      localStorage.removeItem(DESKTOP_DOWNLOAD_DISMISSED_UNTIL_KEY);
    } catch {
      // ignore
    }
    setDesktopInstalled(true);
    setDesktopDownloadDismissedUntil(0);
  }, [isTauriEnv]);

  useEffect(() => {
    if (!desktopDownloadDismissedUntil) return;
    const remaining = desktopDownloadDismissedUntil - Date.now();
    if (remaining <= 0) return;
    const id = window.setTimeout(() => {
      setDesktopDownloadDismissedUntil((current) => {
        if (current && Date.now() >= current) {
          try {
            localStorage.removeItem(DESKTOP_DOWNLOAD_DISMISSED_UNTIL_KEY);
          } catch {
            // ignore
          }
          return 0;
        }
        return current;
      });
    }, remaining + 50);
    return () => window.clearTimeout(id);
  }, [desktopDownloadDismissedUntil]);

  useWebAuthSessionLifecycle<SupabaseSession>({
    session: supabaseSession,
    sessionRef,
    refreshTimeoutRef,
    refreshLocked: refreshSupabaseSessionLocked,
    didJustSignInRef,
    onMountOAuthBootstrap: async () => {
      const parsedOAuthCallback = parseSupabaseOAuthCallbackFromLocation();
      try {
        if (
          sessionStorage.getItem(SUPABASE_SIGNED_OUT_TAB_INTENT_KEY) === "1" ||
          localStorage.getItem(SUPABASE_SIGNED_OUT_INTENT_KEY) === "1"
        ) {
          clearOAuthCallbackParamsFromLocation();
          clearSupabaseAuthFlowPending();
          return;
        }
      } catch {
        // ignore
      }
      if (parsedOAuthCallback && !hasRecentSupabaseAuthFlowPending()) {
        clearOAuthCallbackParamsFromLocation();
        clearSupabaseAuthFlowPending();
        return;
      }
      const outcome = await consumeSupabaseOAuthCallback({
        onBeforeStart: () => {
          setAuthError(null);
          setMagicLinkStatus("idle");
          setMagicLinkError(null);
        },
        onAuthError: (message) => {
          setAuthError(message);
        },
        persistSession: persistSupabaseSession,
        onSessionSet: (session) => {
          didJustSignInRef.current = true;
          setSupabaseSession(session);

          const pendingIntent = readPendingAuthIntent();
          const pendingReturnTo = (pendingIntent?.return_to ?? "").trim();
          const rawNextPath = (pendingReturnTo || DEFAULT_POST_SIGN_IN_PATH).trim() || DEFAULT_POST_SIGN_IN_PATH;
          clearAuthReturnTo();

          const nextPath = rawNextPath.startsWith("/") || rawNextPath.startsWith("#") ? rawNextPath : "/";
          window.history.replaceState({}, document.title, nextPath);

          const nextPublicRoute = readPublicRouteFromLocation();
          setPublicRoute(nextPublicRoute);
          if (nextPublicRoute.kind === "app") {
            const nextAppRoute = readAppRouteFromLocation();
            setActivePage(nextAppRoute.page);
            setActiveView(nextAppRoute.page === "workspace" ? nextAppRoute.view : "home");
            setSettingsPage(nextAppRoute.settingsPage);
            setActiveCommunityId(nextAppRoute.communityId);
            setCommunityTab(nextAppRoute.communityTab);
            setActiveThreadId(nextAppRoute.threadId);
            setWorkspaceWantsNewChatMode(Boolean(nextAppRoute.threadIsExplicit && nextAppRoute.threadId === null));
          }
        },
        profileLoadErrorMessage: "Failed to load user profile from Supabase.",
        parseResult: parsedOAuthCallback,
      });
      if (outcome !== "none") clearSupabaseAuthFlowPending();
      if (outcome === "none") return;
    },
    onDidJustSignIn: () => {
      // If the user arrived via an auth gate (e.g. locked model selection), apply it immediately.
      resumePendingAuthIntent();
    },
    onSessionAvailable: (session) => {
      void loadCommunities(session);
      void loadCloudProjects(session);
      void loadThreads(session);
      void loadModelRegistry(session);
      void loadSelfProfile(session);
    },
    onSessionMissing: () => {
      setCommunities([]);
      setIsLoadingCommunities(false);
      setActiveCommunityId(null);
      setCloudProjects([]);
      setActiveCloudProjectId(null);
      setThreads([]);
      setWorkspaceWantsNewChatMode(false);
      setActiveThreadId(null);
      threadsHydratedRef.current = false;
      setThreadMessages([]);
      setPersonalMemoryItems([]);
      setPendingPurchaseClaims([]);
      setPendingPurchasesError(null);
      setPendingPurchasesSuccess(null);
      setCloudProfile(null);
      setProfileSaveError(null);
      setProfileSaveSuccess(false);
    },
    onFocusWithSession: (current) => {
      void loadModelRegistry(current);
      void loadBuilderBillingStatus(current);
      void loadCommunities(current);
      void loadCloudProjects(current);
    },
  });

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      const key = String(event.key ?? "").trim();
      if (
        key &&
        !key.startsWith("arx_supabase_session") &&
        key !== SUPABASE_SIGNED_OUT_INTENT_KEY
      ) {
        return;
      }
      const latest = loadPersistedSupabaseSession();
      if (!latest) {
        if (sessionRef.current) {
          sessionRef.current = null;
          setSupabaseSession(null);
        }
        return;
      }
      if (sessionsEqual(latest, sessionRef.current)) return;
      sessionRef.current = latest;
      setSupabaseSession(latest);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!supabaseSession || activePage !== "workspace") return;
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
  }, [activePage, refreshCloudProjectStatuses, supabaseSession]);

  useEffect(() => {
    activeCommunityIdRef.current = activeCommunityId;
  }, [activeCommunityId]);

  useCommunityAgentLandingLifecycle<SupabaseSession>({
    supabaseSession,
    activeCommunityId,
    canViewCommunity: communityActionGuards.canViewCommunity,
    getSupabaseUrl,
    fetchWithSupabaseAuth,
    activeCommunityIdRef,
    activeCommunityAgentLandingCommunityIdRef,
    communityAgentLandingFetchSeqRef,
    setActiveCommunityAgentLanding,
  });

  useEffect(() => {
    const session = supabaseSession;
    if (!session) {
      navStackRef.current = [];
      setUserMemorySettings({ memory_mode: "off", remember_intent_enabled: true });
      setUserModelSettings({ system_prompt: "" });
      setSystemPromptDraft("");
      return;
    }
    void loadUserMemorySettings(session);
    void loadUserModelSettings(session);
  }, [supabaseSession]);

  useEffect(() => {
    captureBrandosAidFromLocation();
  }, []);

  useWebRouteHashLifecycle<PublicRoute>({
    publicRouteKind: publicRoute.kind,
    activePage,
    activeView,
    settingsPage,
    activeCommunityId,
    communityTab,
    activeThreadId,
    workspaceWantsNewChat,
    threadsHydratedRef,
    setPublicRoute,
    setBuilderBillingReturn,
    setFinalizeCreateCommunityError,
    readPublicRouteFromLocation,
    buildAppRouteHash,
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

  // Supabase session is bootstrapped from localStorage in useState(), so refresh keeps app state stable.

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
    isAuthenticated: Boolean(supabaseSession),
    closeAuthGate: () => setIsAuthGateOpen(false),
    keyTarget: "window",
  });

  useCommunityAgentPreviewTabFallbackEffect({
    tabs: communityAgentDraftLanding.tabs,
    setPreviewTabId: setCommunityAgentPreviewTabId,
    resetWhenNoTabs: true,
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
    if (supabaseSession) return;
    if (!profileName && !profileUsername && !profileBio && !profileAvatarUrl) return;
    setProfileName("");
    setProfileUsername("");
    setProfileBio("");
    setProfileAvatarUrl(null);
  }, [supabaseSession, profileName, profileUsername, profileBio, profileAvatarUrl]);

  const isProfileDirty = useMemo(() => {
    if (!supabaseSession) return false;
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
  }, [cloudProfile, profileAvatarUrl, profileBio, profileName, supabaseSession]);
  const profileNeedsSave = Boolean(supabaseSession && (isProfileDirty || cloudProfile === null));

  useWebThreadDiscoverChatLifecycle<SupabaseSession, ThreadMessage>({
    supabaseSession,
    activeThreadId,
    guestThreadId: GUEST_THREAD_ID,
    activePage,
    activeCommunityId,
    communityTab,
    isLoadingThreadRef,
    autoScrollEnabledRef,
    lastWorkspaceScrollTopRef,
    setIsWorkspaceAtBottom,
    setThreadMessages,
    loadThreadMessages,
    loadDiscoverCommunities,
    loadCommunityChat,
  });

  useWebGuestThreadLifecycle<SupabaseSession, GuestThreadStorageV1, ThreadMessage>({
    supabaseSession,
    publicRouteKind: publicRoute.kind,
    activeThreadId,
    guestThreadId: GUEST_THREAD_ID,
    loadGuestThreadStorage,
    guestStoredToThreadMessages,
    setGuestModelId,
    setActiveThreadId,
    setWorkspaceWantsNewChatMode,
    setThreadMessages,
  });

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
    autoScrollDependencies: [threadMessages, streamingContent],
    scrollBehavior: "auto",
  });

  useEffect(() => {
    if (activeView !== "settings" || settingsPage !== "memory") return;
    const q = personalMemoryQuery.trim();
    const handle = window.setTimeout(() => {
      void searchPersonalMemoryItems(q);
    }, 150);
    return () => window.clearTimeout(handle);
  }, [activeView, settingsPage, personalMemoryQuery, supabaseSession]);

  useEffect(() => {
    setCommunityChatError(null);
    setCommunityMessages([]);
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

  useCommunitySettingsAccessLifecycle<SupabaseSession, CommunityRecord>({
    activePage,
    communityTab,
    supabaseSession,
    activeCommunityId,
    activeCommunityAccess,
    communities,
    syncCommunitySettingsSelection,
    loadCommunityMemberSettings,
    loadCommunityPricing,
    loadCommunityAccess,
    setCommunityMemberMuted,
    setCommunitySettingsMonthlyPlanId,
    setCommunitySettingsYearlyPlanId,
    setCommunitySettingsPricingMode,
    setCommunitySettingsPriceUsdMonthly,
    setCommunitySettingsPriceUsdYearly,
    setActiveCommunityAccess,
    setIsLoadingCommunityAccess,
  });

  const canInviteActiveCommunity = communityActionGuards.canInvite;
  const isActiveCommunityOwner = communityAccessCapabilities.isOwner;
  const canViewActiveCommunitySettings = communityNavVisibility.canViewSettings;
  const canPostMessagesActiveCommunity = communityActionGuards.canPostMessages;
  const canCreateResourcesActiveCommunity = communityActionGuards.canCreateResources;
  const canManageResourcesActiveCommunity = communityActionGuards.canManageResources;
  const canManageMembersActiveCommunity = communityNavVisibility.canManageMembers;
  const canReviewJoinRequestsActiveCommunity = communityActionGuards.canReviewJoinRequests;
  const canViewActiveCommunityAnalytics = communityNavVisibility.canViewAnalytics;
  const [activeCommunityOwnerIsPro, setActiveCommunityOwnerIsPro] = useState<boolean | null>(null);
  const activeCommunityOwnerIsProLoadedCommunityIdRef = useRef<string | null>(null);

  useCommunityAgentMembersLifecycle<SupabaseSession, CommunityAgentDraft>({
    activePage,
    communityTab,
    supabaseSession,
    activeCommunityId,
    canManageMembersActiveCommunity,
    activeCommunityOwnerIsPro,
    getSupabaseUrl,
    fetchWithSupabaseAuth,
    setActiveCommunityOwnerIsPro,
    activeCommunityOwnerIsProLoadedCommunityIdRef,
    loadCommunityAgentDrafts,
    communityAgentDraftsLoadedCommunityIdRef,
    setCommunityAgentDrafts,
    setCommunityAgentDraftsError,
    loadCommunityMembers,
  });

  useCommunityMembersReviewLifecycle<
    SupabaseSession,
    CommunityInvite,
    CommunityJoinRequest,
    CommunityRecord
  >({
    activePage,
    communityTab,
    supabaseSession,
    activeCommunityId,
    communities,
    canInviteActiveCommunity,
    canReviewJoinRequestsActiveCommunity,
    membersCommunityHasPaidPlans,
    isJoinRequestsModalOpen,
    getSupabaseUrl,
    loadCommunityInvites,
    loadCommunityHasPaidPlans,
    loadCommunityJoinRequests,
    setCommunityInvites,
    setMembersCommunityHasPaidPlans,
    setIsLoadingMembersCommunityPricing,
    setCommunityJoinRequests,
    setIsLoadingCommunityJoinRequests,
    setCommunityJoinRequestsError,
    setDecidingCommunityJoinRequestId,
    setIsJoinRequestsModalOpen,
  });

  useCommunityResourcesTabLifecycle<SupabaseSession>({
    activePage,
    communityTab,
    supabaseSession,
    activeCommunityId,
    loadCommunityResources,
    requireCommunityPage: true,
  });

  useCommunityAdminAnalyticsLifecycle({
    activePage,
    communityTab,
    supabaseSession,
    activeCommunityId,
    canViewActiveCommunityAnalytics,
    communityAnalyticsRange,
    getCommunityCreatedAt: () => communities.find((community) => community.id === activeCommunityId)?.created_at ?? null,
    loadCommunityAnalytics,
    resetCommunityAnalytics,
  });

  async function refreshSupabaseSessionLocked(refreshToken: string): Promise<SupabaseSession | null> {
    if (!sessionRef.current) return null;
    const epochAtRefreshStart = authSessionEpochRef.current;
    return await refreshSupabaseSessionWithLock({
      refreshToken,
      inFlightRef: refreshInFlightRef,
      refreshSession: refreshSupabaseSession,
      onRefreshed: (refreshed) => {
        if (authSessionEpochRef.current !== epochAtRefreshStart) return;
        setAuthError(null);
        setSupabaseSession(refreshed);
        sessionRef.current = refreshed;
        persistSupabaseSession(refreshed);
      },
    });
  }

  async function handleSignIn() {
    setAuthError(null);
    clearSupabaseSignedOutIntentMarker();
    markSupabaseAuthFlowPending();
    storeAuthReturnTo(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    const result = await beginGoogleSupabaseSignIn();
    if (!result.ok) {
      setAuthError(result.error);
      return;
    }
    window.location.assign(result.authUrl);
  }

  function resumePendingAuthIntent(): void {
    if (!supabaseSession) return;
    const intent = readPendingAuthIntent();
    if (!intent) return;
    clearPendingAuthIntent();
    routePendingAuthIntent(intent, {
      select_model: (payload) => {
        const modelId = payload.model_id.trim();
        if (!modelId) return;
        setActiveModelId(modelId);
      },
      create_community: () => {
        openCreateCommunityModal();
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
      request_community_access: (payload) => {
        void requestCommunityAccess({
          communitySlug: payload.community_slug,
          message: payload.message,
        });
      },
      start_builder_checkout: (payload) => {
        void startBuilderPlanCheckout(payload.tier, { context: payload.context });
      },
      open_builder_billing_portal: (payload) => {
        void openBuilderBillingPortal(payload.context);
      },
      start_payouts_onboarding: () => {
        void startConnectOnboarding();
      },
      redeem_pending_purchases: (payload) => {
        void redeemPendingPurchases({ navigate: payload.navigate, silentNoop: payload.silent_noop });
      },
      save_profile: () => {
        void saveProfileToCloud();
      },
      create_memory: (payload) => {
        void createPersonalMemoryItemDirect({ content: payload.content, pinned: payload.pinned })
          .then(() => loadPersonalMemoryItems())
          .then(() => showMemoryToastMessage("Memory updated"))
          .catch((error) => console.warn("Failed to create memory:", error));
      },
      toggle_memory_pinned: (payload) => {
        void (async () => {
          try {
            const session = sessionRef.current ?? supabaseSession;
            const url = getSupabaseUrl();
            if (!session || !url) return;
            const response = await fetchWithSupabaseAuth(
              `${url}/rest/v1/personal_memory_items?id=eq.${encodeURIComponent(payload.id)}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
                body: JSON.stringify({ pinned: payload.pinned, updated_at: new Date().toISOString() }),
              },
              session,
            );
            if (!response.ok) throw new Error(await readSupabaseError(response));
            await loadPersonalMemoryItems();
            showMemoryToastMessage("Memory updated");
          } catch (error) {
            console.warn("Failed to toggle memory pin:", error);
          }
        })();
      },
      delete_memory: (payload) => {
        void (async () => {
          try {
            const session = sessionRef.current ?? supabaseSession;
            const url = getSupabaseUrl();
            if (!session || !url) return;
            const response = await fetchWithSupabaseAuth(
              `${url}/rest/v1/personal_memory_items?id=eq.${encodeURIComponent(payload.id)}`,
              { method: "DELETE", headers: { Prefer: "return=minimal" } },
              session,
            );
            if (!response.ok) throw new Error(await readSupabaseError(response));
            await loadPersonalMemoryItems();
            showMemoryToastMessage("Memory deleted");
          } catch (error) {
            console.warn("Failed to delete memory:", error);
          }
        })();
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

    const url = getSupabaseUrl();
    const apiKey = getSupabaseAnonKey();
    if (!url || !apiKey) {
      setMagicLinkError("Missing Supabase URL or anon key.");
      setMagicLinkStatus("idle");
      return;
    }

    clearSupabaseSignedOutIntentMarker();
    markSupabaseAuthFlowPending();
    storeAuthReturnTo(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    setMagicLinkStatus("sending");
    setMagicLinkError(null);
    try {
      const response = await fetch(`${url}/auth/v1/otp`, {
        method: "POST",
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: trimmed,
          create_user: true,
          redirect_to: getOAuthRedirectUrl(),
        }),
      });
      if (!response.ok) throw new Error(await readSupabaseError(response));
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

  function navigateTo(path: string, opts: { replace?: boolean } = {}) {
    if (opts.replace) {
      window.history.replaceState({}, document.title, path);
    } else {
      window.history.pushState({}, document.title, path);
    }
    setPublicRoute(readPublicRouteFromLocation());
  }

  async function handleSignOut() {
    // Fail closed immediately so a fast refresh cannot rehydrate auth.
    clearPersistedSupabaseSession();
    clearSupabaseAuthFlowPending();
    clearOAuthCallbackParamsFromLocation();

    const accessToken = (sessionRef.current?.access_token ?? supabaseSession?.access_token ?? "").trim();
    authSessionEpochRef.current += 1;
    setAuthError(null);
    sessionRef.current = null;
    setSupabaseSession(null);
    await resetWebSessionStateAfterSignOut({
      clearPersistedSupabaseSession,
      setSupabaseSession,
      setCommunities,
      setIsLoadingCommunities,
      setCommunityRoleById,
      setActiveCommunityId,
      setCommunityTab,
      setCommunityMessages,
      setCommunityMessageInput,
      setCommunityChatError,
      setIsLoadingChat,
      setIsLoadingMoreChat,
      setCommunityChatHasMore,
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
      setCommunityInvites,
      setIsLoadingCommunityInvites,
      setInviteMaxUsesPreset,
      setInviteMaxUsesCustom,
      setInviteExpiryPreset,
      setInviteExpiryCustom,
      setInviteCreateError,
      setIsCreatingInvite,
      setCommunitySettingsName,
      setCommunitySettingsSlug,
      setCommunitySettingsDescription,
      setCommunitySettingsVisibility,
      setCommunitySettingsAvatarUrl,
      setCommunitySettingsBannerUrl,
      setCommunitySettingsError,
      setIsSavingCommunitySettings,
      setIsSettingsBannerDragOver,
      setIsSettingsAvatarDragOver,
      setThreads,
      setWorkspaceWantsNewChatMode,
      setActiveThreadId,
      setThreadMessages,
      streamingAbortRef,
      streamingRafRef,
      streamingContentRef,
      setStreamingContent,
      setStreamingThreadId,
      setStreamingRunId,
      setStreamingMeta,
      setDiscoverCommunities,
    });
    if (accessToken) {
      void revokeSupabaseSessionRemote(accessToken);
    }
  }

  async function fetchWithSupabasePublic(url: string, init: RequestInit = {}): Promise<Response> {
    return await fetchWithSupabasePublicShared(url, init);
  }

  function sessionsEqual(
    a: SupabaseSession | null | undefined,
    b: SupabaseSession | null | undefined,
  ): boolean {
    if (!a || !b) return false;
    return a.access_token === b.access_token && a.refresh_token === b.refresh_token;
  }

  function adoptSupabaseSession(session: SupabaseSession): void {
    sessionRef.current = session;
    setSupabaseSession(session);
    persistSupabaseSession(session);
  }

  async function fetchWithSupabaseAuth(url: string, init: RequestInit, session: SupabaseSession): Promise<Response> {
    let requestSession = sessionRef.current ?? session;
    const persistedBeforeRequest = loadPersistedSupabaseSession();
    if (persistedBeforeRequest && !sessionsEqual(persistedBeforeRequest, requestSession)) {
      adoptSupabaseSession(persistedBeforeRequest);
      requestSession = persistedBeforeRequest;
    }

    return await fetchWithSupabaseAuthShared({
      url,
      init,
      session: requestSession,
      sessionRef,
      refreshLocked: refreshSupabaseSessionLocked,
      onSessionExpired: () => {
        return expireSupabaseSessionFailClosed({
          clearPersistedSupabaseSession,
          setSupabaseSession,
          sessionRef,
        });
      },
      sessionExpiredMessage: SUPABASE_SESSION_EXPIRED_MESSAGE,
    });
  }

  const {
    joinPublicCommunity,
    requestCommunityAccess,
    loadPublicCommunity,
    startCheckoutForPlan,
  } = useWebPublicFunnelActions<
    PublicCommunityRecord,
    PublicPlanSummary,
    MyCommunityJoinRequest
  >({
    getSession: () => sessionRef.current,
    supabaseSession,
    getSupabaseUrl,
    fetchWithSupabaseAuth,
    fetchWithSupabasePublic,
    readSupabaseError,
    openAuthGate,
    loadCommunities,
    openCommunityWorkspace: (communityId) => {
      navigateTo("/", { replace: true });
      openCommunityTab(communityId, "chat", { pushSnapshot: false });
    },
    isUuid,
    setIsJoiningPublicCommunity,
    setPublicJoinError,
    setPublicRequestAccessError,
    setPublicCommunity,
    setIsLoadingMyPublicCommunityJoinRequest,
    setMyPublicCommunityJoinRequest,
    setIsRequestingPublicCommunityAccess,
    setIsLoadingPublicCommunity,
    setPublicCommunityError,
    setPublicCommunityPlans,
    setSelectedPublicCommunityBillingPeriod,
    setCheckoutError,
    setCheckoutStatus,
    navigateToUrl: (url) => window.location.assign(url),
  });

  const { startBuilderPlanCheckout, openBuilderBillingPortal, startConnectOnboarding } =
    useWebBuilderBillingActions({
      getSession: () => sessionRef.current,
      getSupabaseUrl,
      fetchWithSupabaseAuth,
      readSupabaseError,
      openAuthGate: (intent) => openAuthGate(intent),
      setBuilderBillingError,
      setIsStartingBuilderCheckout,
      setIsStartingBuilderPortal,
      setIsStartingConnectOnboarding,
      navigateToUrl: (url) => window.location.assign(url),
    });

  const {
    redeemPurchaseClaim,
    loadPendingPurchaseClaims,
    loadBuilderBillingStatus,
    redeemPendingPurchases,
  } = useWebCommerceAffiliateActions({
    getSession: () => sessionRef.current,
    getSupabaseUrl,
    fetchWithSupabaseAuth,
    readSupabaseError,
    openAuthGate,
    openCommunityWorkspace: (communityId) => {
      navigateTo("/", { replace: true });
      openCommunityTab(communityId, "chat", { pushSnapshot: false });
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
    const session = sessionRef.current ?? supabaseSession;
    if (!session || !canUseDevTierOverride) return;
    const url = getSupabaseUrl();
    if (!url) {
      setDevBuilderTierError("Missing Supabase URL.");
      return;
    }
    setIsSettingDevBuilderTier(true);
    setDevBuilderTierError(null);
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/dev_set_my_builder_tier`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p_builder_tier: tier }),
        },
        session,
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
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
    createCommunityFromDraft,
    handleCreateCommunityPrimaryAction,
    handleCreateCommunityAvatarUpload,
    handleCreateCommunityBannerUpload,
    handleCreateBannerDrop,
    handleCreateAvatarDrop,
  } = useCommunityCreateController<SupabaseSession, CommunityRecord, BuilderBillingStatus>({
    supabaseSession,
    builderBillingStatus,
    communities,
    communityRoleById,
    getSupabaseUrl,
    getSupabaseAnonKey,
    fetchWithSupabaseAuth,
    readSupabaseError,
    loadBuilderBillingStatus,
    openBuilderBillingPortal,
    onStartUpgradeFlow: () => {
      setBuilderUpgradeContext("create_community");
      setIsBuilderUpgradeOpen(true);
    },
    onPrimaryUnauthenticated: (draft) => {
      openAuthGate({ reason: "create_community", payload: { draft_id: draft?.id ?? null } });
    },
    buildDraftOnPrimaryUnauthenticated: true,
    onCreateUnauthenticated: (draft) => {
      openAuthGate({ reason: "create_community", payload: { draft_id: draft?.id ?? null } });
    },
    buildDraftOnCreateUnauthenticated: true,
    onOwnedCommunityLimitReached: () => {
      showAppToastMessage("You've built the maximum number of communities");
    },
    onCommunityCreated: (community) => {
      setCommunities((prev) => [community, ...prev]);
      setCommunityRoleById((prev) => ({ ...prev, [community.id]: "owner" }));
      openCommunityTab(community.id, "chat", { pushSnapshot: false });
    },
    onDraftCreatedCommunitySuccess: () => {
      setBuilderBillingReturn(null);
    },
    createCommunityName,
    createCommunitySlug,
    createCommunitySlugEdited,
    createCommunityVisibility,
    createCommunityAvatarUrl,
    createCommunityDescription,
    createCommunityBannerUrl,
    setCreateCommunityName,
    setCreateCommunitySlug,
    setCreateCommunitySlugEdited,
    setCreateCommunityVisibility,
    setCreateCommunityAvatarUrl,
    setCreateCommunityDescription,
    setCreateCommunityBannerUrl,
    setCreateCommunityError,
    setShowCreateCommunityModal,
    setIsCreatingCommunity,
    setIsFinalizingCreateCommunityFromBilling,
    setFinalizeCreateCommunityError,
    setIsCreateAvatarDragOver,
    setIsCreateBannerDragOver,
    readAvatarFileAsSquareDataUrl,
    readBannerFileAsWideDataUrlWithinLimit,
    isLikelyImageFile,
    maxCreateImageDataUrlChars: MAX_WEB_IMAGE_DATA_URL_CHARS,
    createDraftId: createCommunityDraftId,
    loadCreateDraft: loadCreateCommunityDraft,
    saveCreateDraft: saveCreateCommunityDraft,
    clearCreateDraft: clearCreateCommunityDraft,
    createUnauthenticatedErrorMessage: "Sign in to create a community.",
    bannerLoadFailureMessage: "Failed to load banner.",
  });

  const publicLandingSlug = publicRoute.kind === "community_landing" ? publicRoute.slug : null;
  const checkoutSuccessSessionId = publicRoute.kind === "checkout_success" ? publicRoute.sessionId : null;
  const claimTokenParam = publicRoute.kind === "claim" ? publicRoute.token : null;
  const pendingPurchaseBannerKey = pendingPurchaseClaims
    .map((claim) => claim.community_id)
    .sort()
    .join("|");

  useEffect(() => {
    setIsPendingPurchasesBannerDismissed(false);
  }, [pendingPurchaseBannerKey]);

  useEffect(() => {
    if (!publicLandingSlug) return;
    void loadPublicCommunity(publicLandingSlug);
  }, [publicLandingSlug]);

  useWebPostAuthBillingLifecycle<SupabaseSession>({
    supabaseSession,
    sessionRef,
    claimTokenParam,
    isRedeemingClaim,
    isJoiningPublicCommunity,
    builderBillingReturn,
    builderBillingStatus,
    isFinalizingCreateCommunityFromBilling,
    communities,
    communityRoleById,
    lastAutoRedeemPendingPurchasesUserIdRef,
    autoRedeemPendingPurchasesAttemptRef,
    autoRedeemPendingPurchasesTimeoutRef,
    setBuilderBillingStatus,
    setBuilderBillingError,
    setIsLoadingBuilderBilling,
    setFinalizeCreateCommunityError,
    setIsFinalizingBuilderReturn,
    getSupabaseAuthUid,
    redeemPurchaseClaim,
    redeemPendingPurchases,
    loadPendingPurchaseClaims,
    loadBuilderBillingStatus,
    joinPublicCommunity,
    loadCreateCommunityDraft,
    createCommunityFromDraft,
  });

  const { retryCheckoutFinalize } = useCheckoutFinalizeController({
    checkoutSuccessSessionId,
    getSupabaseUrl,
    fetchWithSupabasePublic,
    readSupabaseError,
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
    session: SupabaseSession;
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
    session: SupabaseSession,
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
      const session = supabaseSession;
      if (!session) return Promise.resolve();
      return syncWorkspaceThreadCommunityLens(thread.id, desiredCommunityId, session);
    },
    onSelectThread: (thread: ThreadRecord) => {
      setWorkspaceWantsNewChatMode(false);
      setActiveCommunityId(thread.community_id ?? null);
      const projectId = (thread.project_id ?? "").trim();
      if (projectId) setActiveCloudProjectId(projectId);
      setActiveThreadId(thread.id);
    },
    trace: traceThreadContext,
    buildThreadSelectedTrace: (thread: ThreadRecord) => ({
      to_context_version:
        typeof thread.context_version === "number" ? thread.context_version : null,
    }),
  });

  const ensureWorkspaceThreadLensBeforeSend = async (
    threadId: string,
    session: SupabaseSession,
  ): Promise<void> => {
    void session;
    return webThreadContextController.ensureLensBeforeSend(threadId);
  };

  const loadEffectiveCommunitySystemPrompt = useCallback(
    async (params: {
      threadId: string;
      communityId: string;
      session: SupabaseSession;
    }): Promise<string | null> => {
      void params.threadId;
      const communityId = String(params.communityId ?? "").trim();
      if (!communityId) return null;
      const url = getSupabaseUrl();
      if (!url) return null;
      try {
        const response = await fetchWithSupabaseAuth(
          `${url}/rest/v1/rpc/get_active_community_agent_system_prompt`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              p_user_id: getSupabaseAuthUid(params.session),
              p_community_id: communityId,
            }),
          },
          params.session,
        );
        if (!response.ok) return null;
        const payload = (await response.json()) as unknown;
        let prompt: string | null = null;
        if (Array.isArray(payload)) {
          const row = payload[0] as Record<string, unknown> | undefined;
          prompt = typeof row?.system_prompt === "string" ? row.system_prompt.trim() : null;
        } else if (payload && typeof payload === "object") {
          prompt = typeof (payload as Record<string, unknown>).system_prompt === "string"
            ? String((payload as Record<string, unknown>).system_prompt).trim()
            : null;
        }
        return prompt;
      } catch {
        return null;
      }
    },
    [fetchWithSupabaseAuth],
  );
  const resolveCommunityNameById = useCallback((communityId: string): string | null => {
    const id = String(communityId ?? "").trim();
    if (!id) return null;
    const community = communities.find((candidate) => candidate.id === id) ?? null;
    if (!community) return null;
    const name = (community.name ?? "").trim();
    if (name) return name;
    const slug = (community.slug ?? "").trim();
    return slug || null;
  }, [communities]);

  const loadCommunityContextPreflight = useCallback(
    async (params: {
      threadId: string;
      communityId: string;
      query: string;
      session: SupabaseSession;
    }) => {
      void params.threadId;
      return await loadCloudCommunityContextPreflight({
        getSupabaseUrl,
        fetchWithSupabaseAuth,
        session: params.session,
        communityId: params.communityId,
        communityName: resolveCommunityNameById(params.communityId),
        query: params.query,
      });
    },
    [fetchWithSupabaseAuth, resolveCommunityNameById],
  );

  async function loadCloudProjects(session: SupabaseSession): Promise<void> {
    const url = getSupabaseUrl();
    if (!url) return;
    try {
      const next = (await fetchMappedDaytonaCloudProjects({
        supabaseUrl: url,
        session,
        fetchWithSupabaseAuth,
        readSupabaseError,
        toEpochSeconds,
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

  async function handleAddCloudProject(): Promise<void> {
    if (!supabaseSession) {
      openAuthGate();
      return;
    }
    const suggestedName = `Project ${Math.max(1, cloudProjects.length + 1)}`;
    setCloudProjectMenuProjectId(null);
    setCreateCloudProjectName(suggestedName);
    setCreateCloudProjectError(null);
    setShowCreateCloudProjectModal(true);
  }

  function closeCreateCloudProjectModal(): void {
    if (isCreatingCloudProject) return;
    setShowCreateCloudProjectModal(false);
    setCreateCloudProjectName("");
    setCreateCloudProjectError(null);
  }

  async function handleConfirmCreateCloudProject(): Promise<void> {
    if (!supabaseSession) {
      openAuthGate();
      setCreateCloudProjectError("Sign in to manage cloud projects.");
      return;
    }
    const suggestedName = `Project ${Math.max(1, cloudProjects.length + 1)}`;
    const cleaned = createCloudProjectName.trim() || suggestedName;
    if (!cleaned) {
      setCreateCloudProjectError("Project name cannot be empty.");
      return;
    }
    const url = getSupabaseUrl();
    if (!url) {
      setCreateCloudProjectError("Missing Supabase URL.");
      return;
    }
    setIsCreatingCloudProject(true);
    setCreateCloudProjectError(null);
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/create_cloud_project`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p_name: cleaned, p_slug: null }),
        },
        supabaseSession,
      );
      if (!response.ok) {
        throw new Error(await readSupabaseError(response));
      }
      await loadCloudProjects(supabaseSession);
      setThreadError(null);
      closeCreateCloudProjectModal();
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to create cloud project.";
      setCreateCloudProjectError(message);
    } finally {
      setIsCreatingCloudProject(false);
    }
  }

  async function handleRenameCloudProject(project: CloudProjectRecord): Promise<void> {
    if (!supabaseSession) {
      openAuthGate();
      return;
    }
    setCloudProjectMenuProjectId(null);
    const defaultName = (project.name ?? "").trim() || (project.root_path.split("/").pop() ?? project.root_path);
    setRenameCloudProjectId(project.id);
    setRenameCloudProjectName(defaultName);
    setRenameCloudProjectError(null);
    setShowRenameCloudProjectModal(true);
  }

  function closeRenameCloudProjectModal(): void {
    if (isRenamingCloudProject) return;
    setShowRenameCloudProjectModal(false);
    setRenameCloudProjectId(null);
    setRenameCloudProjectName("");
    setRenameCloudProjectError(null);
  }

  async function handleConfirmRenameCloudProject(): Promise<void> {
    if (!supabaseSession) {
      openAuthGate();
      setRenameCloudProjectError("Sign in to manage cloud projects.");
      return;
    }
    if (!renameCloudProjectId) {
      closeRenameCloudProjectModal();
      return;
    }
    const cleaned = renameCloudProjectName.trim();
    if (!cleaned) {
      setRenameCloudProjectError("Project name cannot be empty.");
      return;
    }
    const url = getSupabaseUrl();
    if (!url) {
      setRenameCloudProjectError("Missing Supabase URL.");
      return;
    }
    setIsRenamingCloudProject(true);
    setRenameCloudProjectError(null);
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/rename_cloud_project`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p_project_id: renameCloudProjectId, p_name: cleaned }),
        },
        supabaseSession,
      );
      if (!response.ok) {
        throw new Error(await readSupabaseError(response));
      }
      await loadCloudProjects(supabaseSession);
      setThreadError(null);
      closeRenameCloudProjectModal();
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to rename cloud project.";
      setRenameCloudProjectError(message);
    } finally {
      setIsRenamingCloudProject(false);
    }
  }

  async function handleRemoveCloudProject(project: CloudProjectRecord): Promise<void> {
    if (!supabaseSession) {
      openAuthGate();
      return;
    }
    setCloudProjectMenuProjectId(null);
    if (String(project.slug ?? "").trim().toLowerCase() === "general") {
      setThreadError("General project cannot be removed.");
      return;
    }
    const label = (project.name ?? "").trim() || project.root_path;
    const shouldRemove = window.confirm(`Delete cloud project "${label}"?\n\nIts threads will move to General.`);
    if (!shouldRemove) return;
    const url = getSupabaseUrl();
    if (!url) {
      setThreadError("Missing Supabase URL.");
      return;
    }
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/delete_cloud_project`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p_project_id: project.id, p_force: true }),
        },
        supabaseSession,
      );
      if (!response.ok) {
        throw new Error(await readSupabaseError(response));
      }
      await Promise.all([loadCloudProjects(supabaseSession), loadThreads(supabaseSession)]);
      setThreadError(null);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to delete cloud project.";
      setThreadError(message);
    }
  }

  function handleStartDraftInCloudProject(projectId: string): void {
    setActiveCloudProjectId(projectId);
    setCloudProjectMenuProjectId(null);
    setWorkspaceWantsNewChatMode(true);
    setActiveThreadId(null);
    workspaceAskInputRef.current?.focus();
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

  async function ingestAttachmentsFromFileList(
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

  const { sendUserMessage, retryLastTurn } = useWebSendFlowController<
    SupabaseSession,
    MessageAttachment,
    ThreadRecord,
    ThreadMessage
  >({
    getSession: () => sessionRef.current,
    openAuthGate,
    ensureWorkspaceThreadLensBeforeSend,
    createThread,
    updateThreadModel,
    maybeSetThreadTitleFromText,
    loadEffectiveCommunitySystemPrompt,
    loadCommunityContextPreflight,
    getPersonalSystemPrompt: () => userModelSettings.system_prompt,
    getCommunityNameById: resolveCommunityNameById,
    createPersonalMemoryItemDirect,
    showMemoryToastMessage,
    loadThreadMessages,
    runPublicTurn,
    runAgentTurn,
    createThreadMessage,
    createAssistantTextMessage,
    deleteThreadMessagesByIds,
    extractRememberIntent,
    extractTextFromContentJson,
    storeGuestThreadStorage,
    messageInput,
    workspaceAttachments,
    isSendingMessage,
    activeThreadId,
    threadMessages,
    threads,
    activeModelId,
    modelToggles,
    userMemoryRememberEnabled: userMemorySettings.remember_intent_enabled !== false,
    builderTier: String(builderBillingStatus?.builder_tier ?? "free").trim().toLowerCase(),
    hasPaidAccess:
      Boolean(supabaseSession) &&
      hasBuilderTierPaidAccess(builderBillingStatus?.builder_tier ?? "free"),
    guestThreadId: GUEST_THREAD_ID,
    guestModelId,
    guestModelAllowlist: GUEST_MODEL_ALLOWLIST,
    defaultActiveModelId: DEFAULT_ACTIVE_MODEL_ID,
    defaultGuestModelId: DEFAULT_GUEST_MODEL_ID,
    workspaceAttachmentsRef,
    autoScrollEnabledRef,
    setThreadError,
    setIsSendingMessage,
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
    useWebWorkspaceActionsController<SupabaseSession, MessageAttachment, ThreadMessage>({
      getSession: () => sessionRef.current,
      getSupabaseUrl,
      getSupabaseAuthUid,
      fetchWithSupabaseAuth,
      readSupabaseError,
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
    setCommunitySettingsError,
    setCommunitySettingsBannerUploadError,
    setIsProcessingCommunitySettingsBanner,
    markCommunitySettingsDirty,
    isLikelyImageFile,
    maxWebImageDataUrlChars: MAX_WEB_IMAGE_DATA_URL_CHARS,
    setProfileAvatarUrl,
    setAuthError,
  });

  const activeCommunity = useMemo(() => {
    if (!activeCommunityId) return null;
    return communities.find((c) => c.id === activeCommunityId) ?? null;
  }, [activeCommunityId, communities]);

  const normalizedBuilderTier = useMemo<"free" | "builder" | "architect">(
    () => normalizeBuilderTierForUi(builderBillingStatus?.builder_tier),
    [builderBillingStatus?.builder_tier],
  );
  const canUseDevTierOverride = useMemo(
    () =>
      canUseCreatorDevTierOverride({
        email: supabaseSession?.user?.email ?? null,
        isDev: import.meta.env.DEV,
        featureFlag: import.meta.env.VITE_ENABLE_DEV_TIER_OVERRIDE,
      }),
    [supabaseSession?.user?.email],
  );
  const userAccessPolicy = useMemo(
    () =>
      resolveUserAccessPolicy({
        surface: "web",
        authState: supabaseSession ? "authenticated" : "anonymous",
        builderTier: builderBillingStatus?.builder_tier ?? null,
        hasDesktopChatgptAuth: false,
        useCanonicalGates: String(import.meta.env.VITE_ARX_CANONICAL_GATES_V1 ?? "").trim() === "1",
        enableCanonicalGateParityLog:
          String(import.meta.env.VITE_ARX_CANONICAL_GATES_PARITY_LOG ?? "").trim() === "1",
      }),
    [supabaseSession, builderBillingStatus?.builder_tier],
  );

		  const activeCommunityJoinMode = useMemo<CommunityJoinMode | null>(() => {
		    if (!activeCommunity) return null;
		    if (membersCommunityHasPaidPlans === null) return null;
		    if (membersCommunityHasPaidPlans) return "checkout";
        const rawVisibility = String(activeCommunity.visibility ?? "").trim().toLowerCase();
        if (rawVisibility && !["published", "unlisted"].includes(rawVisibility)) {
          return "request_access";
        }
        const visibility = toCanonicalCommunityVisibility(rawVisibility || "unlisted", "unlisted");
        if (visibility === "published" || visibility === "unlisted") {
          return activeCommunity.free_join_requires_approval ? "request_access" : "join_free";
        }
		    return "request_access";
		  }, [activeCommunity, membersCommunityHasPaidPlans]);

  const {
    workspaceVoiceIntent,
    communityVoiceIntent,
    workspaceVoiceUiState,
    communityVoiceUiState,
    handleVoiceInputClick,
  } = useWebVoiceInputController<SupabaseSession>({
    supabaseSession,
    supabaseSessionRef: sessionRef,
    activeCommunity,
    activeCommunityJoinMode,
    canPostMessagesActiveCommunity,
    normalizedBuilderTier,
    getSupabaseUrl,
    fetchWithSupabaseAuth,
    fetchWithSupabasePublic,
    readSupabaseError,
    openAuthGate: () => openAuthGate(),
    showAppToastMessage,
    setWorkspaceInput: setMessageInput,
    workspaceInputRef: workspaceAskInputRef,
    setCommunityMessageInput,
    chatInputRef,
  });

  const communityMemberPlanCohorts = useMemo(() => {
    const map = new Map<
      string,
      {
        planId: string;
        billingPeriod: string;
        amountBaseUnits: number | null;
        currency: string;
        currencyDecimals: number;
        count: number;
      }
    >();
    for (const member of communityMembers) {
      const planId = String(member.subscription_plan_id ?? "").trim();
      const billingPeriod = String(member.subscription_billing_period ?? "").trim().toLowerCase();
      if (!planId) continue;
      if (billingPeriod !== "monthly" && billingPeriod !== "yearly") continue;

      const rawAmount = String(member.subscription_amount_base_units ?? "").trim();
      const parsedAmount = Number(rawAmount);
      const amountBaseUnits = Number.isFinite(parsedAmount) ? parsedAmount : null;
      const currency = String(member.subscription_currency ?? "USD").trim().toUpperCase() || "USD";
      const currencyDecimals = Number(member.subscription_currency_decimals ?? 2);

      const key = `${planId}:${billingPeriod}`;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        continue;
      }
      map.set(key, {
        planId,
        billingPeriod,
        amountBaseUnits,
        currency,
        currencyDecimals: Number.isFinite(currencyDecimals) ? currencyDecimals : 2,
        count: 1,
      });
    }
    return Array.from(map.entries())
      .map(([key, cohort]) => ({
        key,
        value: `cohort:${cohort.planId}:${cohort.billingPeriod}`,
        label: formatSubscriptionPrice({
          amountBaseUnits: cohort.amountBaseUnits,
          currency: cohort.currency,
          currencyDecimals: cohort.currencyDecimals,
          billingPeriod: cohort.billingPeriod,
        }),
        sortPeriod: cohort.billingPeriod,
        sortAmount: cohort.amountBaseUnits ?? Number.POSITIVE_INFINITY,
        count: cohort.count,
      }))
      .sort((a, b) => {
        const ap = a.sortPeriod === "monthly" ? 0 : 1;
        const bp = b.sortPeriod === "monthly" ? 0 : 1;
        if (ap !== bp) return ap - bp;
        if (a.sortAmount !== b.sortAmount) return a.sortAmount - b.sortAmount;
        return a.key.localeCompare(b.key);
      });
  }, [communityMembers]);

  const filteredCommunityMembers = useMemo(() => {
    const roleFilter = (communityMembersRoleFilter ?? "all").trim().toLowerCase();
    const planFilter = (communityMembersPlanFilter ?? "all").trim().toLowerCase();
    const ownerId = activeCommunity?.owner_id ?? null;
    return communityMembers.filter((member) => {
      const memberIsOwner = Boolean((ownerId && member.user_id === ownerId) || member.role === "owner");
      const effectiveRole = memberIsOwner ? "owner" : String(member.role ?? "").trim().toLowerCase();
      if (roleFilter !== "all" && effectiveRole !== roleFilter) return false;

      if (planFilter.startsWith("cohort:")) {
        const rest = planFilter.slice("cohort:".length);
        const [cohortPlanId, cohortPeriod] = rest.split(":");
        const memberPlanId = String(member.subscription_plan_id ?? "").trim();
        const billingPeriod = String(member.subscription_billing_period ?? "").trim().toLowerCase();
        if (!cohortPlanId) return false;
        if (!memberPlanId || memberPlanId !== cohortPlanId) return false;
        if (cohortPeriod) return billingPeriod === cohortPeriod;
        return true;
      }

      const billingPeriod = String(member.subscription_billing_period ?? "").trim().toLowerCase();
      if (planFilter === "monthly" || planFilter === "yearly") {
        return billingPeriod === planFilter;
      }
      if (planFilter === "free") {
        const memberPlanId = String(member.subscription_plan_id ?? "").trim();
        return !billingPeriod && !memberPlanId;
      }
      return true;
    });
  }, [
    activeCommunity?.owner_id,
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
	      if (supabaseSession?.user.id === userId) {
	        if (trimmedName) return trimmedName;
	        if (trimmedUsername) return trimmedUsername.startsWith("@") ? trimmedUsername : `@${trimmedUsername}`;
	      }
	      const remote = profilesByUserId[userId];
	      const remoteName = remote?.display_name?.trim();
	      if (remoteName) return remoteName;
	      return shortId(userId, supabaseSession?.user.id, supabaseSession?.user.email);
	    },
	    [profileName, profileUsername, profilesByUserId, supabaseSession?.user.email, supabaseSession?.user.id]
	  );

  const activeThread = useMemo(() => {
    if (!activeThreadId) return null;
    return threads.find((t) => t.id === activeThreadId) ?? null;
  }, [activeThreadId, threads]);

  const showEmptyThreadLandingSkeleton = Boolean(
    !activeThreadId &&
      supabaseSession &&
      activeCommunityId &&
      activeCommunityAgentLandingCommunityIdRef.current !== activeCommunityId,
  );

  const emptyThreadLanding = useMemo(() => {
    const landingMatchesCommunity = Boolean(
      activeCommunityId && activeCommunityAgentLandingCommunityIdRef.current === activeCommunityId,
    );
    const communityLanding = landingMatchesCommunity ? normalizeCommunityAgentLanding(activeCommunityAgentLanding) : null;
    if (communityLanding) return communityLanding;
    const canViewCommunity = communityActionGuards.canViewCommunity;
    if (activeCommunity && canViewCommunity) {
      return buildDefaultCommunityEmptyThreadLanding(activeCommunity.name);
    }
    return DEFAULT_EMPTY_THREAD_LANDING;
  }, [activeCommunity, communityActionGuards.canViewCommunity, activeCommunityAgentLanding, activeCommunityId]);

  useEffect(() => {
    if (activeThreadId) return;
    const first = emptyThreadLanding.tabs[0]?.id ?? "community";
    setEmptyThreadSection(first);
  }, [activeThreadId, emptyThreadLanding]);

  const visibleThreads = useMemo(() => filterVisibleThreads(threads), [threads]);
  const cloudProjectById = useMemo(() => buildProjectByIdMap(cloudProjects), [cloudProjects]);
  const generalCloudProjectId = useMemo(
    () => resolveGeneralCloudProjectId(cloudProjects),
    [cloudProjects],
  );
  const resolveCloudThreadProjectId = useCallback(
    (thread: ThreadRecord): string | null => {
      return resolveCloudThreadProjectIdShared(thread, cloudProjectById, generalCloudProjectId);
    },
    [cloudProjectById, generalCloudProjectId],
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
	  const hasPaidAccess = Boolean(supabaseSession) && hasBuilderTierPaidAccess(builderBillingStatus?.builder_tier ?? "free");

	  const guestModelLabel = useMemo(() => {
	    const label = (GUEST_MODEL_LABELS[guestModelId] ?? "").trim();
	    return label || guestModelId || "Model";
	  }, [guestModelId]);

	  const selectedModelId = useMemo(() => {
	    const isGuestModel = (modelId: string): boolean => isFreeModelId(modelId, GUEST_MODEL_ALLOWLIST);
	    const isEnabledAuthedModel = (modelId: string): boolean => modelToggles.some((toggle) => toggle.id === modelId);
	    const isKnownModel = (modelId: string): boolean =>
	      isGuestModel(modelId) || isEnabledAuthedModel(modelId);
	    const threadModel = (activeThread?.model_id ?? "").trim();
	    if (
	      threadModel &&
	      isKnownModel(threadModel) &&
	      (!supabaseSession || hasPaidAccess || isGuestModel(threadModel))
	    ) {
	      return threadModel;
	    }

	    const stored = (activeModelId ?? "").trim();
	    if (
	      stored &&
	      isKnownModel(stored) &&
	      (!supabaseSession || hasPaidAccess || isGuestModel(stored))
	    ) {
	      return stored;
	    }

	    const fallbackModelId =
	      enabledModels.find((toggle) => toggle.id === DEFAULT_ACTIVE_MODEL_ID)?.id ??
	      enabledModels[0]?.id ??
	      modelToggles[0]?.id ??
	      "";
	    if (!supabaseSession || hasPaidAccess) return fallbackModelId;
	    return isGuestModel(fallbackModelId) ? fallbackModelId : DEFAULT_GUEST_MODEL_ID;
	  }, [activeThread?.model_id, activeModelId, enabledModels, hasPaidAccess, modelToggles, supabaseSession]);

	  const selectedModelLabel = useMemo(() => {
	    if (!selectedModelId) return "Model";
    if (isFreeModelId(selectedModelId, GUEST_MODEL_ALLOWLIST)) {
      return GUEST_MODEL_LABELS[selectedModelId] ?? selectedModelId;
    }
    return enabledModels.find((toggle) => toggle.id === selectedModelId)?.label ?? selectedModelId;
  }, [enabledModels, selectedModelId]);

	  const activeModelLabel = supabaseSession ? selectedModelLabel : guestModelLabel;

  const inferProviderSection = (modelId: string): ModelSectionId => {
    const id = (modelId ?? "").trim().toLowerCase();
    const mappedProvider = String(modelProviderById[id] ?? "").trim().toLowerCase();
    return inferModelSection(modelId, mappedProvider || null);
	  };

		  type CuratedPickerModel = {
		    id: string;
		    label: string;
		    section: ModelSectionId;
		    access: "guest" | "authed" | "paid";
		    description?: string | null;
		  };

		  const selectedPickerModelId = supabaseSession ? selectedModelId : guestModelId;

		  const curatedPickerModels = useMemo(() => {
		    const byId = new Map<string, CuratedPickerModel>();
    for (const model of getFreeModelEntries()) {
      byId.set(model.id, {
        id: model.id,
        label: model.label,
        section: "free",
        access: "guest",
        description: model.description,
      });
    }
    for (const toggle of enabledModels) {
      byId.set(toggle.id, {
        id: toggle.id,
        label: toggle.label,
        section: inferProviderSection(toggle.id),
        access: "authed",
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
		    if (!supabaseSession) return model.access === "guest";
		    if (model.access === "guest") return true;
		    const isEnabled = modelToggles.some((toggle) => toggle.id === model.id);
		    return hasPaidAccess && isEnabled;
			  };

			  const handleSelectPickerModel = (model: CuratedPickerModel) => {
			    const isModelEnabled = modelToggles.some((toggle) => toggle.id === model.id);
			    if (!canSelectPickerModel(model)) {
			      if (supabaseSession && model.access !== "guest" && !isModelEnabled) {
			        showAppToastMessage("This model isn't enabled yet.");
			        return;
			      }
			      if (supabaseSession && model.access !== "guest" && !hasPaidAccess) {
			        closeModelPicker();
			        setBuilderUpgradeContext("builder");
			        setIsBuilderUpgradeOpen(true);
			        return;
			      }
				      if (!supabaseSession && model.access !== "guest") {
				        closeModelPicker();
				        openAuthGate({ reason: "select_model", payload: { model_id: model.id } });
				        return;
				      }
			      if (supabaseSession && model.access === "guest") {
			        setActiveModelId(model.id);
			        if (activeThreadId) {
			          void updateThreadModel(activeThreadId, model.id, supabaseSession);
			        }
			        closeModelPicker();
			        return;
			      }
			      showAppToastMessage("This model is not available yet.");
			      return;
			    }

			    if (!supabaseSession) {
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
			      void updateThreadModel(activeThreadId, model.id, supabaseSession);
			    }
			  };

	  const filteredDiscoverCommunities = useMemo(() => {
	    const q = discoverQuery.trim().toLowerCase();
	    if (!q) return discoverCommunities;
	    return discoverCommunities.filter((community) => {
      const name = (community.name ?? "").toLowerCase();
      const slug = (community.slug ?? "").toLowerCase();
      const desc = (community.description ?? "").toLowerCase();
      return name.includes(q) || slug.includes(q) || desc.includes(q);
    });
  }, [discoverCommunities, discoverQuery]);

	  const isAnonymousWorkspace = !supabaseSession && publicRoute.kind === "app";
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
	  const showCommunityNav = activePage === "community";
	  const isWorkspaceSettings = activePage === "workspace" && activeView === "settings";
	  const sessionsDrawerEnabled = publicRoute.kind === "app" && activePage === "workspace" && !isWorkspaceSettings;
	  const isSessionsDrawerOpen = sessionsDrawerEnabled && userWantsSessions;
	  const hasLeftPanel = isWorkspaceSettings || showCommunityNav;
  const canReorderCommunities = railCommunities.length > 1;
  const communityRailIds = useMemo(() => railCommunities.map((community) => community.id), [railCommunities]);
  const { setContainerElement: setCommunityRailListElement, getItemBindings: getCommunityRailItemBindings, draggingId: draggingCommunityId } =
    useRailPointerReorder({
      itemIds: communityRailIds,
      enabled: canReorderCommunities,
      onMoveToIndex: handleReorderCommunityRail,
    });

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
  const canRetryLastThreadTurn = Boolean(
    threadError &&
      supabaseSession &&
      activeThreadId &&
      !isSendingMessage &&
      lastThreadMessageRole === "user" &&
      lastThreadUserMessageId,
  );
		  const workspaceThreadKey = supabaseSession ? activeThreadId : GUEST_THREAD_ID;
		  const isStreamingWorkspaceTurn = Boolean(
		    isSendingMessage && streamingThreadId === workspaceThreadKey && streamingContent !== null,
		  );

		  if (publicRoute.kind !== "app") {
		    const showSignIn = !supabaseSession;
		    const selectedPublicCommunityPlan =
		      publicCommunityPlans.find((plan) => plan.billing_period === selectedPublicCommunityBillingPeriod) ??
		      publicCommunityPlans.find((plan) => plan.billing_period === "monthly") ??
	      publicCommunityPlans.find((plan) => plan.billing_period === "yearly") ??
	      publicCommunityPlans[0] ??
	      null;
	    const publicVisibility = toCanonicalCommunityVisibility(publicCommunity?.visibility, "unlisted");
	    const publicVisibilityLabel = formatCommunityVisibilityLabel(publicVisibility);
		    const publicJoinMode: CommunityJoinMode | null = publicCommunity
		      ? isCommunityJoinMode(publicCommunity.join_mode)
		        ? publicCommunity.join_mode
		        : "request_access"
		      : null;
	    const publicVisibilityHint =
	      publicVisibility === "published"
	        ? publicJoinMode === "request_access"
	          ? "Preview is available. Request access to participate."
	          : "Preview is available. Join to participate."
	        : publicJoinMode === "request_access"
	          ? "Not listed in discovery. Request access to participate."
	          : "Not listed in discovery. Share the link when you're ready.";
		    const canJoinForFree = publicJoinMode === "join_free";
		    const canRequestAccessForFree = publicJoinMode === "request_access";
		    const canJoinWithCheckout = publicJoinMode === "checkout";
	    const pendingToken =
	      (checkoutClaimToken ?? (publicRoute.kind === "claim" ? publicRoute.token : "")).trim() ||
	      readPendingPurchaseClaimToken();
	    const myJoinRequestStatus = String(myPublicCommunityJoinRequest?.status ?? "").trim().toLowerCase();
	    const deniedUntilIso = myPublicCommunityJoinRequest?.denied_until ?? null;
	    const deniedUntilMs = deniedUntilIso ? new Date(deniedUntilIso).getTime() : NaN;
	    const requestCooldownActive =
	      myJoinRequestStatus === "denied" && Number.isFinite(deniedUntilMs) && deniedUntilMs > Date.now();
	    const requestPending = myJoinRequestStatus === "pending";
	    const requestDeniedDateLabel =
	      requestCooldownActive && deniedUntilIso
	        ? new Date(deniedUntilIso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
	        : "";
      const handlePublicLandingPrimaryAction = () => {
        if (!publicCommunity) return;
        if (canJoinWithCheckout && selectedPublicCommunityPlan) {
          void startCheckoutForPlan(
            publicCommunity.slug,
            selectedPublicCommunityPlan.billing_period,
            `/c/${encodeURIComponent(publicCommunity.slug)}`,
          );
          return;
        }
        if (canRequestAccessForFree) {
          void requestCommunityAccess({ communitySlug: publicCommunity.slug });
          return;
        }
        if (!canJoinForFree) return;
        void joinPublicCommunity({ communitySlug: publicCommunity.slug });
      };

      const handlePublicLandingMagicLink = () => {
        if (!publicCommunity) return;
        const aid = getBrandosAidForCommunitySlug(publicCommunity.slug);
        if (canRequestAccessForFree) {
          const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
          storePendingAuthIntent(buildPendingAuthIntent(
            { reason: "request_community_access", payload: { community_slug: publicCommunity.slug, message: null } },
            returnTo
          ));
        } else {
          storePendingPublicJoin(publicCommunity.slug, aid);
        }
        void handleSendMagicLink(magicLinkEmail);
      };

      const handlePublicCheckoutContinue = () => {
        if (!pendingToken) return;
        if (showSignIn) {
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

      return (
        <WebPublicRouteView
          publicRouteKind={publicRoute.kind}
          publicRouteSlug={publicRoute.kind === "community_landing" ? publicRoute.slug : ""}
          showSignIn={showSignIn}
          onBackToApp={() => navigateTo("/")}
          onOpenAuthGate={() => openAuthGate()}
          onSignOut={() => {
            void handleSignOut();
          }}
          publicCommunity={publicCommunity}
          selectedPublicCommunityPlanLabel={selectedPublicCommunityPlan ? formatPlanPrice(selectedPublicCommunityPlan) : null}
          publicVisibilityLabel={publicVisibilityLabel}
          publicVisibilityHint={publicVisibilityHint}
          publicCommunityPlans={publicCommunityPlans}
          selectedPublicCommunityBillingPeriod={selectedPublicCommunityBillingPeriod}
          selectedPublicCommunityPlanBillingPeriod={selectedPublicCommunityPlan?.billing_period ?? null}
          onSelectPublicCommunityBillingPeriod={setSelectedPublicCommunityBillingPeriod}
          hasSelectedPublicCommunityPlan={Boolean(selectedPublicCommunityPlan)}
          isLoadingPublicCommunity={isLoadingPublicCommunity}
          canJoinForFree={canJoinForFree}
          canRequestAccessForFree={canRequestAccessForFree}
          canJoinWithCheckout={canJoinWithCheckout}
          checkoutStatus={checkoutStatus}
          isJoiningPublicCommunity={isJoiningPublicCommunity}
          isRequestingPublicCommunityAccess={isRequestingPublicCommunityAccess}
          isLoadingMyPublicCommunityJoinRequest={isLoadingMyPublicCommunityJoinRequest}
          requestPending={requestPending}
          requestCooldownActive={requestCooldownActive}
          requestDeniedDateLabel={requestDeniedDateLabel}
          onPrimaryJoinAction={handlePublicLandingPrimaryAction}
          onSendLandingMagicLink={handlePublicLandingMagicLink}
          onRetryCheckoutFinalize={retryCheckoutFinalize}
          onContinueCheckout={handlePublicCheckoutContinue}
          onContinueClaim={handlePublicClaimContinue}
          onNavigateToClaim={() => navigateTo("/claim")}
          onSendMagicLink={() => {
            void handleSendMagicLink(magicLinkEmail);
          }}
          checkoutError={checkoutError}
          publicCommunityError={publicCommunityError}
          publicJoinError={publicJoinError}
          publicRequestAccessError={publicRequestAccessError}
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
	  const handleTopbarBackToWorkspace = () => {
	    if (goBack()) return;
	    const transition = deriveBackToWorkspaceFallbackTransition(
	      { activeView },
	      { forceHomeView: true },
	    );
	    setActiveView(transition.nextView);
	    setActivePage(transition.nextPage);
	  };
	  function openCommunityTab(
	    nextCommunityId: string,
	    nextCommunityTab: CommunityTab,
	    opts?: { clearUnread?: boolean; pushSnapshot?: boolean },
	  ): void {
	    const transition = deriveOpenCommunityTabTransition(
	      {
	        activePage,
	        activeView,
	        communityTab,
	        activeCommunityId: activeCommunityId ?? null,
	      },
	      nextCommunityId,
	      nextCommunityTab,
	    );
	    if ((opts?.pushSnapshot ?? true) && transition.shouldPushSnapshot) pushNavSnapshot();
	    setActiveView(transition.nextView);
	    setActivePage(transition.nextPage);
	    setCommunityTab(transition.nextCommunityTab);
	    if (opts?.clearUnread) setUnreadCount(0);
	    setActiveCommunityId(transition.nextCommunityId);
	  }
	  function openCommunityChat(nextCommunityId: string, opts?: { clearUnread?: boolean; pushSnapshot?: boolean }): void {
	    openCommunityTab(nextCommunityId, "chat", opts);
	  }
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
	  const activateDiscoverCommunityCard = (opts: {
	    canActivate: boolean;
	    memberCommunity: CommunityRecord | null;
	    slug: string;
	  }) => {
	    if (!opts.canActivate) return;
	    if (opts.memberCommunity) {
	      if (
	        !confirmDiscardUnsavedCommunitySettingsWeb({
	          isCommunitySettingsDirty: communitySettingsDirtyRef.current,
	          isCommunityAgentDraftDirty: communityAgentDraftDirtyRef.current,
	          activeCommunityId,
	          nextCommunityId: opts.memberCommunity.id,
	          confirmDiscard: (message) => window.confirm(message),
	        })
	      ) {
	        return;
	      }
	      openCommunityChat(opts.memberCommunity.id);
	      return;
	    }
	    if (!opts.slug) return;
	    navigateTo(`/c/${encodeURIComponent(opts.slug)}`);
	  };
	  const showHeaderIslands = activePage === "workspace" && activeView === "home";
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
	          {activePage === "workspace" ? (
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
		                  onClick={() => {
				                    if (!userAccessPolicy.allowMultipleThreads) {
				                      setThreadError(null);
				                      openAuthGate();
				                      return;
				                    }
	                    // ChatGPT-style: "New chat" is a draft state until the first message is sent.
	                    if (!activeThreadId) {
	                      setWorkspaceWantsNewChatMode(true);
                      workspaceAskInputRef.current?.focus();
                      return;
                    }
                    setWorkspaceWantsNewChatMode(true);
                    setActiveThreadId(null);
                    workspaceAskInputRef.current?.focus();
                  }}
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
          {communityHomeButton}
        </div>
	      </header>

        {sessionsDrawerEnabled && (
          <>
            <aside
              className={`sessions web-sessions-drawer${isSessionsDrawerOpen ? " open" : ""}`}
              aria-hidden={!isSessionsDrawerOpen}
            >
              {threadError && <div className="auth-error">{threadError}</div>}
              {supabaseSession ? (
                <ThreadSidebarPanel<ThreadRecord, CloudProjectRecord>
                  showThreadLaneSwitch={false}
                  state={{
                    threadLaneFilter: "chat",
                    threadSearchQuery,
                    normalizedThreadSearch,
                    threadSearchResults,
                    projectThreadGroups: cloudProjectThreadGroups,
                    projectExpandedById: cloudProjectExpandedById,
                    projectMenuProjectId: cloudProjectMenuProjectId,
                    generalThreads: [],
                    agentThreadsCount: 0,
                    chatThreadsCount: visibleThreads.length,
                    showChatSignInPrompt: false,
                  }}
                  actions={{
                    onThreadLaneFilterChange: () => {},
                    onThreadSearchQueryChange: setThreadSearchQuery,
                    onAddProject: handleAddCloudProject,
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
                    onToggleProjectMenu: (projectId) => {
                      setCloudProjectMenuProjectId((prev) => (prev === projectId ? null : projectId));
                    },
                    projectMenuRef: cloudProjectMenuRef,
                    onRenameProject: handleRenameCloudProject,
                    onRemoveProject: handleRemoveCloudProject,
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
	                      if (guestThreadHasMessages) {
	                        setWorkspaceWantsNewChatMode(false);
	                        if (activeThreadId !== GUEST_THREAD_ID) setActiveThreadId(GUEST_THREAD_ID);
	                        return;
	                      }
	                      if (activeThreadId !== null) setActiveThreadId(null);
	                      setWorkspaceWantsNewChatMode(true);
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
		                        const confirmed = window.confirm("Clear this local guest chat history?");
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
	              <div className="community-rail-divider" />
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
	                            isCommunityAgentDraftDirty: communityAgentDraftDirtyRef.current,
	                            activeCommunityId,
	                            nextCommunityId: community.id,
	                            confirmDiscard: (message) => window.confirm(message),
	                          })
	                        ) {
	                          return;
	                        }
	                        setActiveCommunityId(community.id);
	                          // Keep the user on their current page; only the selected community context changes.
	                          if (activePage === "workspace") {
	                            const currentLens = activeThreadId
	                              ? (threads.find((t) => t.id === activeThreadId)?.community_id ?? null)
	                              : null;
	                            const isWorkspaceRunActive =
	                              isSendingMessage ||
	                              (streamingThreadId === activeThreadId && streamingContent !== null);
	                            if (isWorkspaceRunActive && currentLens !== community.id) {
	                              showAppToastMessage(
	                                `Switched to ${community.name}. Active run keeps prior context; new context applies next turn.`,
	                              );
	                            }
	                            const session = supabaseSession;
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
		                onClick={() => openCreateCommunityModal()}
		                title="Create community"
		                aria-label="Create community"
		              >
		                +
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
            canManageMembersActiveCommunity={canManageMembersActiveCommunity}
            canViewActiveCommunityAnalytics={canViewActiveCommunityAnalytics}
            activeCommunityOwnerIsPro={activeCommunityOwnerIsPro}
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
              setCommunityTab(tab);
            }}
          />
        )}

        <main className={`workspace${activePage !== "workspace" ? " community-mode" : ""}`}>
	          {activeView === "settings" ? (
	            <div className="settings-panel">
	              <div className="web-settings-centered-pane">
	              {settingsGroup === "account" && (
	                <>
	                  <div className="settings-section">
	                    <div className="settings-section-title">
	                      <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
	                      Profile
	                    </div>
	                    <div className="settings-section-desc">
	                      {supabaseSession
	                        ? "Profile details shown in communities. Save to sync across devices."
	                        : "Local profile details shown in communities on this device."}
	                    </div>
	                    <div className="profile-block">
                      <div
                        className={`profile-avatar-drop${isProfileAvatarDragOver ? " drag-over" : ""}`}
                        onDragOver={(event) => {
                          event.preventDefault();
                          setIsProfileAvatarDragOver(true);
                        }}
                        onDragLeave={() => setIsProfileAvatarDragOver(false)}
                        onDrop={handleProfileAvatarDrop}
                      >
                        {supabaseSession && profileAvatarUrl ? (
                          <img src={profileAvatarUrl} alt="Profile avatar" />
                        ) : (
                          supabaseSession ? (
                            <span>
                              {getInitials(
                                (profileName || profileUsername || supabaseSession.user.email || "AR").replace(/^@/, "")
                              )}
                            </span>
                          ) : (
                            <span className="profile-avatar-placeholder" aria-hidden="true">
                              <svg viewBox="0 0 24 24">
                                <circle cx="12" cy="8" r="4.2" />
                                <path d="M4.5 20c1.8-4 5-6 7.5-6s5.7 2 7.5 6" />
                              </svg>
                            </span>
                          )
                        )}
                      </div>
                      <div className="profile-avatar-actions">
                        <label className="create-avatar-btn">
                          Upload photo
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) => void handleProfileAvatarUpload(event.target.files?.[0] ?? null)}
                          />
                        </label>
                        {supabaseSession && profileAvatarUrl && (
                          <button className="create-avatar-remove" type="button" onClick={() => setProfileAvatarUrl(null)}>
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="profile-row">
                      <input
                        type="text"
                        placeholder="Name"
                        value={profileName}
                        onChange={(event) => setProfileName(event.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="Username"
                        value={profileUsername}
                        onChange={(event) => setProfileUsername(event.target.value)}
                      />
                    </div>
	                    <textarea
	                      className="profile-bio"
	                      placeholder="Bio"
	                      value={profileBio}
	                      onChange={(event) => setProfileBio(event.target.value)}
	                      rows={3}
	                    />
	                    <div className="account-row">
	                      <div className="account-identity">
	                        <span>Sync</span>
	                        <strong>
	                          {supabaseSession ? (cloudProfile ? "Synced" : "Not synced yet") : "Sign in to sync"}
	                        </strong>
	                      </div>
	                      <div className="auth-actions">
	                        <button
                            className={profileNeedsSave ? "profile-save-btn needs-save" : "profile-save-btn synced"}
	                          type="button"
	                          onClick={() => void saveProfileToCloud()}
	                          disabled={!supabaseSession || isSavingProfile || (!isProfileDirty && cloudProfile !== null)}
	                        >
	                          {isSavingProfile ? "Saving…" : "Save"}
	                        </button>
	                      </div>
	                    </div>
	                    {profileSaveError && <div className="auth-error">{profileSaveError}</div>}
	                    {profileSaveSuccess && <div className="auth-success">Saved.</div>}
	                  </div>

                  <div className="settings-section">
                    <div className="settings-section-title">
                      <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                      Account
                    </div>
                    <div className="settings-section-desc">
                      Sign in to join communities and sync your profile.
                    </div>
                    {supabaseSession ? (
                      <div className="account-row">
                        <div className="account-identity">
                          <span>Signed in as</span>
                          <strong>{supabaseSession.user.email ?? supabaseSession.user.id}</strong>
                        </div>
                        <button className="secondary" type="button" onClick={() => void handleSignOut()}>
                          Sign out
                        </button>
                      </div>
                    ) : (
                      <div className="account-row">
                        <button className="google-sign-in" type="button" onClick={openAuthGate}>
                          <svg className="google-logo" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                          </svg>
                          Sign in with Google
                        </button>
                      </div>
                    )}
                    {authError && <div className="key-error">{authError}</div>}
                  </div>

                  {supabaseSession && (
                    <div className="settings-section">
                      {(() => {
                        const status = builderBillingStatus;
                        const tier = status?.builder_tier ?? "free";
                        const ownedCount = communities.reduce(
                          (acc, community) => acc + (communityRoleById[community.id] === "owner" ? 1 : 0),
                          0,
                        );
                        const max = status?.max_communities ?? 0;
                        const communityWord = (max > 0 ? max : ownedCount) === 1 ? "community" : "communities";
                        const communitiesLabel =
                          max > 0 ? `${ownedCount}/${max} owned ${communityWord}` : `${ownedCount} owned ${communityWord}`;
                        const tierLabel = formatBuilderTierLabel(tier);
                        return (
                          <>
                            <div className="account-row">
                              <div className="account-identity">
                                <span>Plan</span>
                                <strong>
                                  {tierLabel} · {communitiesLabel}
                                </strong>
                              </div>
                              <div className="auth-actions">
	                                {isBuilderTierFree(tier) ? (
	                                  <button
	                                    type="button"
	                                    className="secondary"
	                                    onClick={() => {
	                                      setBuilderUpgradeContext("builder");
	                                      setIsBuilderUpgradeOpen(true);
	                                    }}
	                                  >
	                                    Upgrade plan
	                                  </button>
	                                ) : (
                                  <button
                                    type="button"
                                    className="secondary"
                                    onClick={() => void openBuilderBillingPortal()}
                                    disabled={isStartingBuilderPortal}
                                  >
                                    {isStartingBuilderPortal ? "Opening…" : "Manage billing"}
                                  </button>
                                )}
                              </div>
                            </div>
                            {canUseDevTierOverride && (
                              <div className="account-row">
                                <div className="account-identity">
                                  <span>Internal tier override (dev)</span>
                                  <strong>Creator-only testing control</strong>
                                </div>
                                <div className="auth-actions">
                                  <button
                                    type="button"
                                    className={isBuilderTierFree(tier) ? "" : "secondary"}
                                    onClick={() => void setDevBuilderTier("free")}
                                    disabled={isSettingDevBuilderTier || isBuilderTierFree(tier)}
                                  >
                                    Free
                                  </button>
                                  <button
                                    type="button"
                                    className={tier === "builder" ? "" : "secondary"}
                                    onClick={() => void setDevBuilderTier("builder")}
                                    disabled={isSettingDevBuilderTier || tier === "builder"}
                                  >
                                    Builder
                                  </button>
                                  <button
                                    type="button"
                                    className={tier === "pro" || tier === "architect" ? "" : "secondary"}
                                    onClick={() => void setDevBuilderTier("architect")}
                                    disabled={isSettingDevBuilderTier || tier === "pro" || tier === "architect"}
                                  >
                                    Architect
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                      {builderBillingError && <div className="auth-error">{builderBillingError}</div>}
                      {devBuilderTierError && <div className="auth-error">{devBuilderTierError}</div>}
                    </div>
                  )}

                  {supabaseSession && (
                    <div className="settings-section">
                      <div className="settings-section-title">
                        <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                        Your communities
                      </div>
                      <div className="settings-section-desc">Open a community to manage pricing and payouts.</div>
                      {(() => {
                        const owned = communities
                          .filter((community) => communityRoleById[community.id] === "owner")
                          .sort((a, b) => a.name.localeCompare(b.name));
                        if (owned.length === 0) {
                          return <div className="model-note">No owned communities yet.</div>;
                        }
	                        return (
	                          <div className="invite-list">
	                            {owned.map((community) => (
	                              <div key={community.id} className="invite-row">
	                                <div className="invite-main with-avatar">
	                                  <div className="invite-avatar" aria-hidden="true">
	                                    {community.avatar_url ? (
	                                      <img
	                                        className="invite-avatar-img"
	                                        src={community.avatar_url}
	                                        alt=""
	                                        loading="lazy"
	                                      />
	                                    ) : (
	                                      <span className="invite-avatar-fallback">{communityInitials(community.name)}</span>
	                                    )}
	                                  </div>
	                                  <div className="invite-text">
	                                    <div className="invite-code">{community.name}</div>
	                                    <div className="invite-status">{`arx.com/c/${community.slug}`}</div>
	                                  </div>
	                                </div>
	                                <div className="invite-actions">
	                                  <button
	                                    type="button"
                                    onClick={() => {
                                      if (
                                        !confirmDiscardUnsavedCommunitySettingsWeb({
                                          isCommunitySettingsDirty: communitySettingsDirtyRef.current,
                                          isCommunityAgentDraftDirty: communityAgentDraftDirtyRef.current,
                                          activeCommunityId,
                                          nextCommunityId: community.id,
                                          confirmDiscard: (message) => window.confirm(message),
                                        })
                                      ) {
                                        return;
                                      }
                                      openCommunityTab(community.id, "settings", { pushSnapshot: false });
                                    }}
                                  >
                                    Open settings
                                  </button>
                                </div>
                              </div>
	                            ))}
	                          </div>
	                        );
	                      })()}
	                    </div>
	                  )}

                  {supabaseSession &&
                    (isLoadingPendingPurchases ||
                      pendingPurchaseClaims.length > 0 ||
                      pendingPurchasesError ||
                      pendingPurchasesSuccess) && (
                      <div className="settings-section">
                        <div className="settings-section-title">
                          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                          Pending purchases
                        </div>
                        <div className="settings-section-desc">
                          Recover access if you paid but didn&apos;t finish the join flow.
                        </div>
                        {isLoadingPendingPurchases && (
                          <div className="chat-loading">
                            <div className="loading-spinner" />
                            <span>Checking…</span>
                          </div>
                        )}
                        {!isLoadingPendingPurchases && pendingPurchaseClaims.length > 0 && (
                          <div className="model-list">
                            {pendingPurchaseClaims.map((claim) => (
                              <div key={`${claim.community_id}:${claim.expires_at}`} className="model-toggle">
                                <span>{claim.community_name || claim.community_slug || claim.community_id}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {!isLoadingPendingPurchases && pendingPurchaseClaims.length === 0 && pendingPurchasesSuccess && (
                          <div className="auth-status">{pendingPurchasesSuccess}</div>
                        )}
                        <div className="auth-actions">
                          <button
                            type="button"
                            onClick={() => void redeemPendingPurchases()}
                            disabled={
                              isRedeemingPendingPurchases ||
                              isLoadingPendingPurchases ||
                              pendingPurchaseClaims.length === 0
                            }
                          >
                            {isRedeemingPendingPurchases ? "Claiming…" : "Claim access"}
                          </button>
                          <button
                            className="secondary"
                            type="button"
                            onClick={() => supabaseSession && void loadPendingPurchaseClaims(supabaseSession)}
                            disabled={isRedeemingPendingPurchases || isLoadingPendingPurchases}
                          >
                            Refresh
                          </button>
                        </div>
                        {pendingPurchasesError && <div className="auth-error">{pendingPurchasesError}</div>}
                      </div>
                    )}

                </>
              )}

		              {settingsGroup === "agent" && (
		                <>
		                  <div className="settings-section">
		                    <div className="settings-section-title">
		                      <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
		                      System prompt
		                    </div>
		                    <div className="settings-section-desc">
	                      Applied to every model run (global). Use this to set tone, format, and defaults.
	                    </div>
	                    <textarea
	                      className="exec-policy-input"
	                      value={systemPromptDraft}
	                      onChange={(event) => setSystemPromptDraft(event.target.value)}
	                      placeholder="e.g. Be concise. Use Markdown. Prefer bullet points. Ask clarifying questions when needed."
	                      disabled={!supabaseSession || isLoadingUserModelSettings}
	                    />
	                    <div className="exec-policy-actions">
	                      <button
	                        type="button"
	                        onClick={() => void saveUserModelSettings({ system_prompt: systemPromptDraft })}
	                        disabled={!supabaseSession || isLoadingUserModelSettings || isSavingUserModelSettings}
	                      >
	                        {isSavingUserModelSettings ? "Saving…" : "Save"}
	                      </button>
	                      <button
	                        type="button"
	                        className="secondary"
	                        onClick={() => {
	                          setSystemPromptDraft("");
	                          void saveUserModelSettings({ system_prompt: "" });
	                        }}
	                        disabled={!supabaseSession || isLoadingUserModelSettings || isSavingUserModelSettings}
	                      >
	                        Clear
	                      </button>
	                      {userModelSettingsError && <div className="exec-policy-error">{userModelSettingsError}</div>}
	                    </div>
	                  </div>

	                </>
	              )}

              {settingsGroup === "agent" && (
                <>
                  <div className="settings-section">
                    <div className="settings-section-title">
                      <svg viewBox="0 0 24 24"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>
                      Desktop execution
                    </div>
                    <div className="settings-section-desc">
                      Local tools (filesystem/shell) run only in the desktop app. Configure approvals and policies there.
                    </div>
                    <div className="auth-actions">
                      <a className="secondary" href="arx://settings/execution">
                        Open in desktop
                      </a>
                    </div>
                  </div>
                </>
              )}

              {settingsGroup === "agent" && (
                <>
                  <div className="panel-title">Memory</div>
                  <div className="memory-panel">
                    {personalMemoryError &&
                      !isBuilderTierFree(builderBillingStatus?.builder_tier ?? "free") && (
                        <div className="memory-error">{personalMemoryError}</div>
                      )}
                    {exportError && <div className="auth-error">{exportError}</div>}

		                    <div className="settings-section">
		                      <div className="settings-section-title">
		                        <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
		                        Export
		                      </div>
		                      <div className="settings-section-desc">
		                        Download your threads, messages, and personal memory as CSV.
		                      </div>
		                      <div className="export-actions">
		                        <button
		                          className="secondary"
		                          type="button"
		                          onClick={() => void exportThreadsCsv()}
		                          disabled={!supabaseSession || isExporting}
		                        >
		                          Threads CSV
		                        </button>
		                        <button
		                          className="secondary"
		                          type="button"
		                          onClick={() => void exportMessagesCsv()}
		                          disabled={!supabaseSession || isExporting}
		                        >
		                          Messages CSV
		                        </button>
		                        <button
		                          className="secondary"
		                          type="button"
		                          onClick={() => void exportMemoryCsv()}
		                          disabled={!supabaseSession || isExporting}
		                        >
		                          Memory CSV
		                        </button>
		                      </div>
		                    </div>

                    <div className="settings-section">
                      <div className="settings-section-title">
                        <svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>
                        Local Cache
                      </div>
                      <div className="settings-section-desc">
                        Clear local SQLite caches used by the desktop operator. Cloud data is unchanged.
                      </div>
                      <div className="export-actions">
                        <button className="secondary" type="button" disabled>
                          Reset local cache
                        </button>
                      </div>
                    </div>

                    {(() => {
                      const tier = builderBillingStatus?.builder_tier ?? "free";
                      const hasPersonalMemoryAccess = hasBuilderTierPaidAccess(tier);
                      if (!supabaseSession) return null;
                      if (!hasPersonalMemoryAccess) {
                        return (
                          <div className="settings-section">
                            <div className="settings-section-title">
                              <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10H12V2z" /><path d="M20 2a10 10 0 0 1 0 10" /></svg>
                              Personal memory
                            </div>
                            <div className="settings-section-desc">
                              Personal memory is included with Builder and Architect.
                            </div>
                            <div className="auth-actions" style={{ paddingLeft: 0 }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setBuilderUpgradeContext("builder");
                                  setIsBuilderUpgradeOpen(true);
                                }}
                              >
                                Upgrade plan
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <>
                          <div className="settings-section">
                            <div className="settings-section-title">
                              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06c.5.5 1.21.67 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51c.61.34 1.32.17 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.62.85 1.04 1.51 1.08H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                              Memory behavior
                            </div>
                            <div className="settings-section-desc">
                              Control how PolyNet suggests and stores personal memory.
                            </div>
                            <div className="export-actions">
                              <label className="model-toggle">
                                <input
                                  type="checkbox"
                                  checked={userMemorySettings.memory_mode === "auto"}
                                  onChange={(event) =>
                                    void saveUserMemorySettings({
                                      ...userMemorySettings,
                                      memory_mode: event.target.checked ? "auto" : "off",
                                    })
                                  }
                                  disabled={isLoadingUserMemorySettings}
                                />
                                <span>Auto memory</span>
                              </label>
                            </div>
                            <div className="memory-block-meta">
                              When enabled, PolyNet may save useful preferences/facts to your personal memory. You can delete anything later.
                            </div>
                          </div>

                          <div className="memory-editor">
                            <div className="memory-editor-header">
                              <div className="memory-editor-title">Personal memory</div>
                              <div className="memory-editor-meta">
                                {isLoadingPersonalMemory
                                  ? "loading…"
                                  : `${personalMemoryItems.length} item${personalMemoryItems.length === 1 ? "" : "s"}`}
                              </div>
                            </div>
                            <input
                              value={personalMemoryQuery}
                              onChange={(event) => setPersonalMemoryQuery(event.target.value)}
                              placeholder="Search memory…"
                            />
                            <div className="memory-block-meta">Workspace scope is managed from the desktop app.</div>
                            <div className="memory-editor-actions">
                              <button
                                className="secondary"
                                type="button"
                                onClick={() => {
                                  setPersonalMemoryQuery("");
                                  void loadPersonalMemoryItems();
                                }}
                                disabled={isLoadingPersonalMemory}
                              >
                                Refresh
                              </button>
                            </div>
                          </div>

                          <div className="memory-block-group">
                            {personalMemoryItems.length === 0 ? (
                              <div className="memory-block-empty">No personal memory items yet.</div>
                            ) : (
                              personalMemoryItems.map((item) => (
                                <div key={item.id} className="memory-block">
                                  <div className="memory-block-header">
                                    <div className="memory-block-label">{item.content}</div>
                                    <div className="memory-block-actions">
                                      <button
                                        className="secondary"
                                        type="button"
                                        onClick={() => void handleTogglePersonalMemoryPinned(item)}
                                        disabled={isLoadingPersonalMemory}
                                      >
                                        {item.pinned ? "Unpin" : "Pin"}
                                      </button>
                                      <button
                                        className="secondary"
                                        type="button"
                                        onClick={() => void handleDeletePersonalMemoryItem(item.id)}
                                        disabled={isLoadingPersonalMemory}
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                  <div className="memory-block-meta">
                                    {item.scope}
                                    {item.scope === "workspace" && item.scope_id ? ` · ${item.scope_id}` : ""}
                                    {" · "}
                                    updated {formatRelativeTime(item.updated_at)}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>

                          <div className="memory-editor">
                            <div className="memory-editor-header">
                              <div className="memory-editor-title">Add memory</div>
                            </div>
                            <textarea
                              value={newPersonalMemoryContent}
                              onChange={(event) => setNewPersonalMemoryContent(event.target.value)}
                              placeholder="Write a durable preference/fact…"
                            />
                            <div className="memory-editor-actions">
                              <button
                                type="button"
                                onClick={() => void handleCreatePersonalMemoryItem()}
                                disabled={!newPersonalMemoryContent.trim()}
                              >
                                Save memory
                              </button>
                              <button
                                className="secondary"
                                type="button"
                                onClick={() => {
                                  setNewPersonalMemoryContent("");
                                  setNewPersonalMemoryPinned(false);
                                }}
                              >
                                Clear
                              </button>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </>
              )}

	              {settingsGroup === "appearance" && (
	                <>
	                  <div className="panel-title">Appearance</div>
	                  <div className="appearance-panel">
                    <div className="appearance-selector">
                      <div className="appearance-title">Theme</div>
                      <div className="appearance-options">
                        {APP_THEME_OPTIONS.map((theme) => (
                          <button
                            key={theme.id}
                            className={`appearance-option${appTheme === theme.id ? " active" : ""}${theme.disabled ? " disabled" : ""}`}
                            type="button"
                            onClick={() => {
                              if (!theme.disabled) {
                                setAppTheme(theme.id);
                              }
                            }}
                            disabled={theme.disabled}
                          >
                            <div className="appearance-option-preview" data-preview-theme={theme.id}>
                              <div className="preview-header" />
                              <div className="preview-sidebar" />
                              <div className="preview-content">
                                <div className="preview-line" />
                                <div className="preview-line short" />
                              </div>
                            </div>
                            <div className="appearance-option-label">{theme.label}</div>
                            <div className="appearance-option-desc">{theme.description}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
	                </>
	              )}
	              </div>
	            </div>
	          ) : activePage === "workspace" ? (
	            <>
		              <div className="workspace-body">
                    {inferenceToast && <div className="memory-toast success-toast">{inferenceToast}</div>}
                    {memoryToast && <div className="memory-toast success-toast">{memoryToast}</div>}
			                <div className="message-list" ref={workspaceMessageListRef} onScroll={handleWorkspaceScroll}>
		                    <div className="message-list-inner">
		                    {!threadMessages.some((m) => m.role !== "system") && (
		                      <>
		                        {showEmptyThreadLandingSkeleton ? (
		                          <div className="web-empty-thread web-empty-thread-skeleton" role="status" aria-live="polite">
		                            <div className="web-skeleton-block web-skeleton-title" aria-hidden="true" />
		                            <div className="web-skeleton-block web-skeleton-subtitle" aria-hidden="true" />
	                            <div className="web-starter-tabs web-starter-tabs-skeleton" aria-hidden="true">
	                              <div className="web-skeleton-pill" />
	                              <div className="web-skeleton-pill" />
	                              <div className="web-skeleton-pill" />
	                            </div>
	                            <div className="web-starter-list web-starter-list-skeleton" aria-hidden="true">
	                              <div className="web-skeleton-row" />
	                              <div className="web-skeleton-row" />
	                              <div className="web-skeleton-row" />
	                              <div className="web-skeleton-row" />
	                            </div>
	                          </div>
		                        ) : (
		                          <div className="web-empty-thread" role="region" aria-label="Start a new thread">
		                            <div className="web-empty-thread-title">{emptyThreadLanding.title}</div>
		                            <div className="web-empty-thread-subtitle">{emptyThreadLanding.subtitle}</div>
		                            {(() => {
		                              const activeTab =
		                                emptyThreadLanding.tabs.find((tab) => tab.id === emptyThreadSection) ??
	                                emptyThreadLanding.tabs[0];
	                              const prompts = activeTab?.prompts ?? [];
	                              return (
	                                <>
	                                  {emptyThreadLanding.tabs.length > 1 && (
	                                    <div className="web-starter-tabs" role="tablist" aria-label="Prompt categories">
	                                      {emptyThreadLanding.tabs.map((tab) => (
	                                        <button
	                                          key={tab.id}
	                                          type="button"
	                                          className={`web-starter-tab${emptyThreadSection === tab.id ? " active" : ""}`}
	                                          aria-pressed={emptyThreadSection === tab.id}
	                                          onClick={() => setEmptyThreadSection(tab.id)}
	                                        >
	                                          {tab.label}
	                                        </button>
	                                      ))}
	                                    </div>
	                                  )}
	                                  <div className="web-starter-list" role="list">
	                                    {prompts.map((prompt) => (
	                                      <button
	                                        key={prompt}
	                                        className="web-starter-row"
	                                        type="button"
	                                        disabled={isSendingMessage}
	                                        onClick={() => {
	                                          void sendUserMessage({ text: prompt });
	                                          workspaceAskInputRef.current?.focus();
	                                        }}
	                                      >
	                                        <span className="web-starter-row-text">{prompt}</span>
	                                        <span className="web-starter-row-arrow" aria-hidden="true">
	                                          <svg viewBox="0 0 24 24">
	                                            <path d="M9 18l6-6-6-6" />
	                                          </svg>
	                                        </span>
	                                      </button>
	                                    ))}
	                                  </div>
	                                </>
		                              );
		                            })()}
			                            {!desktopInstalled && !isTauriEnv && desktopDownloadDismissedUntil <= Date.now() && (
			                              <div className="web-download-card" role="note" aria-label="Desktop app">
			                                <button
		                                  className="web-download-close"
		                                  type="button"
		                                  onClick={dismissDesktopDownload}
		                                  title="Dismiss"
		                                  aria-label="Dismiss"
		                                >
		                                  <svg viewBox="0 0 24 24" aria-hidden="true">
		                                    <path d="M18 6L6 18M6 6l12 12" />
		                                  </svg>
		                                </button>
		                                <div className="web-download-body">
		                                  <div className="web-download-icon" aria-hidden="true">
		                                    <svg viewBox="0 0 24 24">
		                                      <path d="M4 6h16v10H4z" />
		                                      <path d="M2 18h20" />
		                                    </svg>
		                                  </div>
		                                  <div className="web-download-copy">
		                                    <div className="web-download-title">Download desktop app</div>
		                                    <div className="web-download-subtitle">Get access to full agents on desktop.</div>
		                                  </div>
		                                </div>
		                                <div className="web-download-actions">
		                                  <button
		                                    className="web-download-button"
		                                    type="button"
		                                    disabled={!desktopDownloadUrl}
		                                    title={
		                                      desktopDownloadUrl
		                                        ? "Download desktop app"
		                                        : "Configure desktop download URL to enable downloads in this build"
		                                    }
		                                    onClick={() => {
		                                      if (!desktopDownloadUrl) return;
		                                      window.open(desktopDownloadUrl, "_blank", "noopener,noreferrer");
		                                    }}
		                                  >
		                                    <svg viewBox="0 0 24 24" aria-hidden="true">
		                                      <path d="M12 3v10" />
		                                      <path d="M7 10l5 5 5-5" />
		                                      <path d="M5 21h14" />
		                                    </svg>
		                                    Download
		                                  </button>
		                                </div>
		                              </div>
		                            )}
	                          </div>
	                        )}
	                      </>
	                    )}
                      {threadError && (
                        <div className="auth-error">
                          {threadError}
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
	                                <MessageSourcesAction
	                                  disabled={!hasContext}
	                                  onClick={() => {
	                                    openMessageContextModal(contextPayload, setContextModal);
	                                  }}
	                                  title="Sources used"
	                                  ariaLabel="Sources used"
	                                />
	                              </MessageFooter>
		                          )}
	                        </div>
	                      );
	                    })}
                      {streamingThreadId === workspaceThreadKey &&
                        streamingContent !== null &&
                        !(streamingRunId && threadMessages.some((m) => m.run_id === streamingRunId && m.role === "assistant")) && (
                          <div className="message-item assistant streaming">
                            <div className="message-text streaming-text">
                              {streamingContent.trim() ? (
                                <>
                                  {renderMarkdown(streamingContent, { onCopyCode: copyTextToClipboard })}
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
			              <div className="ask-bar ask-bar-v2">
		                <textarea
		                  ref={workspaceAskInputRef}
                  className="ask-input ask-input-v2"
	                  placeholder={
	                    supabaseSession
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
	                  disabled={isSendingMessage || isStreamingWorkspaceTurn}
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
	                      disabled={!supabaseSession || isSendingMessage || isStreamingWorkspaceTurn}
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
                      hasSession={Boolean(supabaseSession)}
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
	                      onClick={() => (isStreamingWorkspaceTurn ? stopStreamingTurn() : void sendUserMessage())}
	                      disabled={
	                        (isStreamingWorkspaceTurn
	                          ? false
	                          : isSendingMessage || (messageInput.trim().length === 0 && workspaceAttachments.length === 0))
	                      }
	                      aria-label={isStreamingWorkspaceTurn ? "Stop" : "Send"}
                      title={isStreamingWorkspaceTurn ? "Stop" : "Send"}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        {isStreamingWorkspaceTurn ? (
                          <rect x="7" y="7" width="10" height="10" rx="2" />
                        ) : (
                          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                        )}
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="community-body">
              {activePage === "discover" && (
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
		                            <div className="discover-empty-text">
	                              Create one on desktop to make discovery meaningful.
	                            </div>
	                          </div>
	                        )}
	                        {filteredDiscoverCommunities.map((community) => {
	                            const memberCommunity = communities.find((c) => c.slug === community.slug) ?? null;
	                            const alreadyMember = Boolean(memberCommunity);
	                            const priceLabel = community.active_plan ? formatPlanPrice(community.active_plan) : "Free";
                            const visibilityLabel = formatCommunityVisibilityLabel(community.visibility);
                            const visibilityClass = isPublishedCommunityVisibility(community.visibility)
                              ? "published"
                              : "unlisted";
		                            const description =
		                              community.description && community.description.trim().length > 0
		                                ? community.description
		                                : "No description yet.";
                              const canActivate = alreadyMember || Boolean(community.slug);
                              const activateDiscoverCard = () => {
                                activateDiscoverCommunityCard({
                                  canActivate,
                                  memberCommunity,
                                  slug: community.slug,
                                });
                              };
		                            return (
		                              <DiscoverCommunityCard
		                                key={community.slug}
		                                name={community.name}
		                                slug={community.slug}
		                                description={description}
		                                avatarUrl={community.avatar_url}
		                                bannerUrl={community.banner_url}
		                                priceLabel={priceLabel}
		                                visibilityClass={visibilityClass}
		                                visibilityLabel={visibilityLabel}
		                                isPublishedVisibility={isPublishedCommunityVisibility(community.visibility)}
		                                clickable={canActivate}
		                                ariaLabel={
		                                  canActivate
		                                    ? alreadyMember
		                                      ? `Open ${community.name}`
		                                      : `View ${community.name}`
		                                    : undefined
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

              {activePage === "community" && (
                <>
                  {communityTab === "chat" && (
                    <div className="community-chat">
	                      <div className="workspace-body chat-feed">
	                        <div className="chat-messages" ref={communityChatListRef} onScroll={handleChatScroll}>
	                          {!supabaseSession && (
	                            <div className="chat-empty">
	                              <div>Sign in to access community chat.</div>
	                              <button
	                                className="secondary"
	                                type="button"
	                                onClick={openAuthGate}
	                                style={{ marginTop: 12 }}
	                              >
	                                Sign in
	                              </button>
	                            </div>
	                          )}
                          {supabaseSession && !activeCommunity && (
                            <div className="chat-empty">Select a community to start chatting.</div>
                          )}
                          {activeCommunity && isLoadingChat && (
                            <div className="chat-loading">
                              <div className="loading-spinner" />
                              <span>Loading messages...</span>
                            </div>
                          )}
                          {activeCommunity && !isLoadingChat && communityMessages.length === 0 && (
                            <div className="chat-empty-state">
                              <div className="chat-empty-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                              </div>
                              <div className="chat-empty-title">
                                Welcome to {activeCommunity.name}
                              </div>
                              <div className="chat-empty-text">
                                This is the beginning of your community chat. Say hello!
                              </div>
                            </div>
                          )}
                          {activeCommunity && !isLoadingChat && isLoadingMoreChat && (
                            <div className="chat-loading">
                              <div className="loading-spinner" />
                              <span>Loading earlier messages...</span>
                            </div>
                          )}
                          {activeCommunity && !isLoadingChat && !communityChatHasMore && communityMessages.length > 0 && (
                            <div className="chat-date-separator">
                              <span>Start</span>
                            </div>
                          )}
	                      {activeCommunity &&
	                            !isLoadingChat &&
		                            communityMessages.map((message, index) => {
                                const isOwn = message.sender_id === supabaseSession?.user.id;
                                const isPending = message.id.startsWith("pending-");
                                const showMeta = shouldShowCommunitySenderMeta(communityMessages, index);
                                const dateSeparator = shouldShowDateSeparator(communityMessages, index);
                                const senderLabel = displayName(message.sender_id);
                                const avatarUrl = isOwn
                                  ? profileAvatarUrl
                                  : profilesByUserId[message.sender_id]?.avatar_url ?? null;
                                const avatarColor = getAvatarColor(message.sender_id);
                                const shortTime = new Date(message.created_at).toLocaleTimeString([], {
                                  hour: "numeric",
                                  minute: "2-digit",
                                });
                                const replyToId = message.reply_to_id ?? null;
                                const replyTarget = replyToId ? communityMessageById.get(replyToId) ?? null : null;
                                return (
                                  <CommunityChatMessageRow
                                    key={message.id}
                                    message={message}
                                    dateSeparator={dateSeparator}
                                    isPending={isPending}
                                    showMeta={showMeta}
                                    isOwn={isOwn}
                                    senderLabel={senderLabel}
                                    avatarUrl={avatarUrl}
                                    avatarColor={avatarColor}
                                    shortTime={shortTime}
                                    formattedTime={formatChatTime(message.created_at)}
                                    editingMessageId={editingMessageId}
                                    editingMessageText={editingMessageText}
                                    reactionPickerMessageId={reactionPickerMessageId}
                                    messageReactions={messageReactions}
                                    supabaseUserId={supabaseSession?.user.id}
                                    replyToId={replyToId}
                                    replyTarget={replyTarget}
                                    reactionEmojis={REACTION_EMOJIS}
                                    getInitials={getInitials}
                                    displayName={displayName}
                                    parseReplyPrefix={parseReplyPrefix}
                                    truncateReplyPreview={truncateReplyPreview}
                                    renderTextWithLinks={renderTextWithLinks}
                                    onScrollToReplyMessage={scrollToCommunityMessage}
                                    onOpenCommunityChatLightbox={openCommunityChatLightbox}
                                    onToggleReaction={handleToggleReaction}
                                    onSetReactionPickerMessageId={setReactionPickerMessageId}
                                    onStartReply={handleStartReply}
                                    onCopyMessage={copyTextToClipboard}
                                    onStartEdit={handleStartEdit}
                                    onDeleteMessage={handleDeleteMessage}
                                    onEditingMessageTextChange={setEditingMessageText}
                                    onSaveEdit={handleSaveEdit}
                                    onCancelEdit={handleCancelEdit}
                                  />
                                );
                              })}
                        </div>

                        {!isUserAtBottom && (
                          <button
                            className="scroll-to-bottom workspace"
                            type="button"
                            onClick={() => {
                              setIsUserAtBottom(true);
                              isUserAtBottomRef.current = true;
                              setUnreadCount(0);
                              communityChatListRef.current?.scrollTo({
                                top: communityChatListRef.current.scrollHeight,
                                behavior: "smooth"
                              });
                            }}
                            aria-label="Scroll to bottom"
                            title="Scroll to bottom"
                          >
                            {unreadCount > 0 && (
                              <span className="scroll-badge" aria-hidden="true">
                                {unreadCount > 99 ? "99+" : unreadCount}
                              </span>
                            )}
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M12 5v14" />
                              <path d="M19 12l-7 7-7-7" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {replyingToMessage && (
                        <div className="chat-replying-bar">
                          <div className="chat-replying-content">
                            <span className="chat-replying-label">Replying to</span>
                            <span className="chat-replying-sender">{displayName(replyingToMessage.sender_id)}</span>
                            <span className="chat-replying-preview">{truncateReplyPreview(replyingToMessage.body)}</span>
                          </div>
                          <button
                            className="chat-replying-cancel"
                            type="button"
                            onClick={() => setReplyingToMessage(null)}
                            title="Cancel reply"
                            aria-label="Cancel reply"
                          >
                            <svg viewBox="0 0 24 24">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      )}

                      {communityAttachments.length > 0 && (() => {
                        const { imageAttachments, fileAttachments } =
                          partitionCommunityAttachments(communityAttachments);
                        const gridCount = Math.min(Math.max(imageAttachments.length, 1), 4);
                        return (
                          <div className="community-attachments-preview">
                            {imageAttachments.length > 0 && (
                              <div className={`chat-media-grid count-${gridCount} chat-media-grid-composer`}>
                                {imageAttachments.map((item) => (
                                  <div key={item.attachment.id} className="chat-media-item chat-media-item-static">
                                    <img src={item.url} alt={item.name} />
                                    <button
                                      type="button"
                                      className="chat-media-remove"
                                      onClick={() => removeCommunityAttachment(item.attachment.id)}
                                      title="Remove"
                                      aria-label={`Remove ${item.name}`}
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            {fileAttachments.length > 0 && (
                              <div className="attachments-preview">
                                {fileAttachments.map((att) => (
                                  <div key={att.id} className="attachment-item" title={att.name}>
                                    <div className="attachment-icon" aria-hidden="true">
                                      <svg viewBox="0 0 24 24">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                        <path d="M14 2v6h6" />
                                        <path d="M16 13H8" />
                                        <path d="M16 17H8" />
                                        <path d="M10 9H8" />
                                      </svg>
                                    </div>
                                    <span className="attachment-name">{att.name}</span>
                                    <button
                                      className="attachment-remove"
                                      type="button"
                                      onClick={() => removeCommunityAttachment(att.id)}
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
                          </div>
                        );
                      })()}

                      {communityTypingUserIds.length > 0 && (
                        <div className="chat-typing-indicator" aria-live="polite">
                          {communityTypingUserIds.length === 1
                            ? `${displayName(communityTypingUserIds[0])} is typing…`
                            : communityTypingUserIds.length === 2
                              ? `${displayName(communityTypingUserIds[0])} and ${displayName(
                                  communityTypingUserIds[1]
                                )} are typing…`
                              : `${displayName(communityTypingUserIds[0])} and ${
                                  communityTypingUserIds.length - 1
                                } others are typing…`}
                        </div>
                      )}

                      <div className="chat-input-bar">
                        <button
                          className="ask-icon-btn ask-plus"
                          type="button"
                          onClick={() => communityFileInputRef.current?.click()}
                          disabled={
                            !supabaseSession ||
                            !activeCommunity ||
                            !canPostMessagesActiveCommunity ||
                            isSendingCommunityMessage
                          }
                          aria-label="Attach files"
                          title="Attach files"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                        </button>
                        <input
                          ref={communityFileInputRef}
                          type="file"
                          multiple
                          accept="image/*,.txt,.md,.csv,.json,.ts,.tsx,.js,.jsx,.py,.rs,.go,.html,.css,.yml,.yaml,.pdf"
                          style={{ display: "none" }}
                          onChange={handleCommunityFileInputChange}
                        />
                        <textarea
                          ref={chatInputRef}
                          className="chat-input"
	                          placeholder={
	                            !supabaseSession
	                              ? "Sign in to chat..."
	                              : !activeCommunity
	                                ? "Select a community to chat..."
	                                : !canPostMessagesActiveCommunity
	                                  ? "Join this community to chat..."
	                                  : "Message the community..."
	                          }
                          value={communityMessageInput}
                          onChange={(event) => {
                            setCommunityMessageInput(event.target.value);
                            maybeBroadcastCommunityTyping(event.target.value);
                            event.target.style.height = "auto";
                            event.target.style.height = Math.min(event.target.scrollHeight, 120) + "px";
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              void handleSendCommunityMessage();
                            }
                          }}
	                          disabled={!supabaseSession || !activeCommunity || !canPostMessagesActiveCommunity}
	                          rows={1}
	                        />
			                        <VoiceInputButton
			                          state={communityVoiceUiState}
			                          title={communityVoiceIntent.title}
			                          onClick={() => void handleVoiceInputClick("community")}
			                        />
                        <button
	                          className="chat-send ask-send-btn"
	                          onClick={() => void handleSendCommunityMessage()}
	                          disabled={
	                            !supabaseSession ||
	                            !activeCommunity ||
	                            !canPostMessagesActiveCommunity ||
	                            isSendingCommunityMessage ||
                              (communityMessageInput.trim().length === 0 && communityAttachments.length === 0)
	                          }
	                          type="button"
	                          aria-label="Send"
	                          title="Send"
	                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                          </svg>
                        </button>
                      </div>

                      {communityChatError && <div className="auth-error">{communityChatError}</div>}
                    </div>
                  )}

		                  {communityTab === "settings" && (
                        <WebCommunitySettingsSection
                          activeCommunity={activeCommunity}
                          hasSession={Boolean(supabaseSession)}
                          canViewActiveCommunitySettings={canViewActiveCommunitySettings}
                          canManageMembersActiveCommunity={canManageMembersActiveCommunity}
                          isActiveCommunityOwner={isActiveCommunityOwner}
                          openAuthGate={openAuthGate}
                          state={{
                            isSettingsBannerDragOver,
                            isProcessingCommunitySettingsBanner,
                            communitySettingsBannerUrl,
                            communitySettingsBannerUploadError,
                            isSettingsAvatarDragOver,
                            communitySettingsAvatarUrl,
                            communitySettingsName,
                            communitySettingsSlug,
                            communitySettingsDescription,
                            communitySettingsVisibility,
                            communitySettingsPricingMode,
                            communitySettingsPriceUsdMonthly,
                            communitySettingsPriceUsdYearly,
                            builderBillingStatus,
                            isStartingConnectOnboarding,
                            communitySettingsError,
                            isSavingCommunitySettings,
                            activeCommunityAccess,
                            communityMemberMuted,
                            isLoadingCommunityMemberSettings,
                            isLeavingCommunity,
                            communityMemberSettingsError,
                          }}
                          actions={{
                            setIsSettingsBannerDragOver,
                            handleSettingsBannerDrop,
                            handleCommunityBannerUpload,
                            setCommunitySettingsBannerUrl,
                            setCommunitySettingsBannerUploadError,
                            markCommunitySettingsDirty,
                            setIsSettingsAvatarDragOver,
                            handleSettingsAvatarDrop,
                            communityInitials,
                            handleCommunityAvatarUpload,
                            setCommunitySettingsAvatarUrl,
                            setCommunitySettingsName,
                            setCommunitySettingsSlug,
                            slugifyCommunityName,
                            setCommunitySettingsDescription,
                            setCommunitySettingsVisibility,
                            setCommunitySettingsPricingMode,
                            setCommunitySettingsPriceUsdMonthly,
                            setCommunitySettingsPriceUsdYearly,
                            setCommunityPricingDirty: () => {
                              communityPricingDirtyRef.current = true;
                            },
                            startConnectOnboarding,
                            handleSaveCommunitySettings,
                            openDeleteCommunityModal,
                            formatChatTime,
                            formatCommunityVisibilityLabel,
                            handleToggleCommunityMute,
                            handleLeaveCommunity,
                          }}
                        />
                      )}

                  {communityTab === "ai_agent" && (
                    <WebCommunityAiAgentSection
                      activeCommunity={activeCommunity}
                      hasSession={Boolean(supabaseSession)}
                      canManageMembersActiveCommunity={canManageMembersActiveCommunity}
                      isLoadingCommunityAgentDrafts={isLoadingCommunityAgentDrafts}
                      communityAgentDraftsError={communityAgentDraftsError}
                      isActiveCommunityOwner={isActiveCommunityOwner}
                      onOpenAuthGate={openAuthGate}
                      onUpgradeToArchitect={() => {
                        setBuilderUpgradeContext("builder");
                        setIsBuilderUpgradeOpen(true);
                      }}
                      landingEditorProps={{
                        communityAgentDrafts,
                        communityAgentDraftDirtyRef,
                        handleSaveCommunityAgentDraft,
                        isSavingCommunityAgentDraft,
                        handleSetLiveCommunityAgentDraft,
                        communityAgentDraftLanding,
                        communityAgentLandingEdit,
                        communityAgentLandingEditValue,
                        setCommunityAgentLandingEditValue,
                        setCommunityAgentDraftLanding,
                        markCommunityAgentDraftDirty,
                        clearCommunityAgentLandingEdit,
                        beginCommunityAgentLandingEdit,
                        communityAgentPreviewTabId,
                        setCommunityAgentPreviewTabId,
                        communityAgentDraftSystemPrompt,
                        setCommunityAgentDraftSystemPrompt,
                      }}
                    />
                  )}

	                  {communityTab === "analytics" && (
                      <WebCommunityAnalyticsSection
                        hasActiveCommunity={Boolean(activeCommunity)}
                        hasSession={Boolean(supabaseSession)}
                        canViewActiveCommunityAnalytics={canViewActiveCommunityAnalytics}
                        onOpenAuthGate={openAuthGate}
                        state={{
                          communityAnalyticsRange,
                          isLoadingCommunityAnalytics,
                          communityAnalyticsError,
                          communityAnalyticsSummary,
                          communityAnalyticsChartMode,
                          communityAnalyticsSeries,
                          communityRevenueMeta,
                          communityRevenueSeries,
                          communityRevenueError,
                        }}
                        actions={{
                          setCommunityAnalyticsRange,
                          setCommunityAnalyticsChartMode,
                        }}
                      />
                    )}

	                  {communityTab === "resources" && (
                      <WebCommunityResourcesSection
                        capabilities={{
                          hasActiveCommunity: Boolean(activeCommunity),
                          activeCommunityName: activeCommunity?.name ?? null,
                          canCreateResources: Boolean(supabaseSession && canCreateResourcesActiveCommunity),
                          canManageResources: canManageResourcesActiveCommunity,
                        }}
                        state={{
                          isLoadingResources,
                          resourceSuccess,
                          resources: communityResources,
                          openResourceEmbedId,
                        }}
                        actions={{
                          setOpenResourceEmbedId,
                          openNewResourceModal,
                          handleEditResource,
                          handleDeleteResource,
                        }}
                      />
                    )}

	                  {communityTab === "members" && (
                      <WebCommunityMembersSection
                        activeCommunity={activeCommunity}
                        hasSession={Boolean(supabaseSession)}
                        capabilities={{
                          canInviteActiveCommunity,
                          canManageMembersActiveCommunity,
                          canReviewJoinRequestsActiveCommunity,
                          isActiveCommunityOwner,
                        }}
                        state={{
                          communityMembers,
                          filteredCommunityMembers,
                          communityMembersRoleFilter,
                          communityMembersPlanFilter,
                          communityMemberPlanCohorts,
                          membersCommunityHasPaidPlans,
                          activeCommunityJoinMode,
                          communityJoinRequests,
                          communityJoinRequestsError,
                          decidingCommunityJoinRequestId,
                          isLoadingMembersCommunityPricing,
                          isLoadingCommunityJoinRequests,
                          isSavingFreeJoinRequiresApproval,
                          isJoinRequestsModalOpen,
                          inviteMaxUsesPreset,
                          inviteMaxUsesCustom,
                          inviteExpiryPreset,
                          inviteExpiryCustom,
                          inviteCreateError,
                          isCreatingInvite,
                          isLoadingCommunityInvites,
                          communityInvites,
                          profilesByUserId,
                        }}
                        actions={{
                          setCommunityMembersRoleFilter,
                          setCommunityMembersPlanFilter,
                          setIsJoinRequestsModalOpen,
                          setInviteMaxUsesPreset,
                          setInviteMaxUsesCustom,
                          setInviteExpiryPreset,
                          setInviteExpiryCustom,
                          displayName,
                          handleSetCommunityFreeJoinRequiresApproval,
                          handleSetCommunityMemberRole,
                          handleRemoveCommunityMember,
                          handleCreateInvite,
                          handleRevokeInvite,
                          handleDeleteInvite,
                          handleApproveCommunityJoinRequest,
                          handleDenyCommunityJoinRequest,
                          copyTextToClipboard,
                          buildCommunityInstantAccessLink,
                          getAvatarColor,
                          getInitials,
                          communityInitials,
                          formatSubscriptionPrice,
                          formatRelativeTime,
                        }}
                      />
                    )}

	                  {communityTab === "library" && <WebCommunityLibrarySection />}

                  <WebCommunityResourceModal
                    isOpen={showResourceModal}
                    hasActiveCommunity={Boolean(activeCommunity)}
                    editingResourceId={editingResourceId}
                    resourceTitleInput={resourceTitleInput}
                    resourceUrlInput={resourceUrlInput}
                    resourceBodyInput={resourceBodyInput}
                    resourcePinnedInput={resourcePinnedInput}
                    resourceError={resourceError}
                    isSavingResource={isSavingResource}
                    onClose={closeResourceModal}
                    onCancel={() => {
                      resetResourceForm();
                      closeResourceModal();
                    }}
                    onSave={handleSaveCommunityResource}
                    onChangeTitle={setResourceTitleInput}
                    onChangeUrl={setResourceUrlInput}
                    onChangeBody={setResourceBodyInput}
                    onChangePinned={setResourcePinnedInput}
                  />
                </>
              )}
            </div>
          )}
        </main>
      </div>

	      <WebMessageContextModal
          contextModal={contextModal}
          hasSession={Boolean(supabaseSession)}
          onClose={() => setContextModal(null)}
          onSaveSuggestion={(item) => {
            if (!supabaseSession) {
              openAuthGate();
              return;
            }
            const tier = builderBillingStatus?.builder_tier ?? "free";
            if (isBuilderTierFree(tier)) {
              setBuilderUpgradeContext("builder");
              setBuilderBillingError("Upgrade to Builder to use personal memory.");
              setIsBuilderUpgradeOpen(true);
              return;
            }
            void createPersonalMemoryItemDirect({ content: item.content, pinned: item.pinned })
              .then(() => showMemoryToastMessage("Memory updated"))
              .catch((error) => console.warn("Failed to save suggested memory:", error));
          }}
        />

        <WebCommunityChatLightboxModal
          isOpen={isCommunityChatLightboxOpen}
          images={communityChatLightboxImages}
          index={communityChatLightboxIndex}
          setIndex={setCommunityChatLightboxIndex}
          onClose={closeCommunityChatLightbox}
        />

	      <WebAuthGateModal
          hasSession={Boolean(supabaseSession)}
          isOpen={isAuthGateOpen}
          authError={authError}
          onClose={() => setIsAuthGateOpen(false)}
          onSignIn={handleSignIn}
        />

			      <WebPlatformQuotaModal
          hasSession={Boolean(supabaseSession)}
          platformQuotaModal={platformQuotaModal}
          isPlatformQuotaModalRunning={isPlatformQuotaModalRunning}
          onClose={() => setPlatformQuotaModal(null)}
          onChangeModel={(threadId) => {
            setPlatformQuotaModal(null);
            setActiveThreadId(threadId);
            setIsModelPickerOpen(true);
            window.setTimeout(() => {
              const root = modelPickerRef.current;
              const btn = root?.querySelector<HTMLButtonElement>(".ask-model-btn");
              btn?.focus();
            }, 60);
          }}
        />

	      {supabaseSession && (
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
              void startBuilderPlanCheckout(tier, { context: builderUpgradeContext });
            }}
          />
        )}

        {showCreateCloudProjectModal && (
          <div className="modal-overlay" onClick={closeCreateCloudProjectModal}>
            <div className="modal create-community-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">Create cloud project</div>
                <button className="modal-close" onClick={closeCreateCloudProjectModal} title="Close">
                  ×
                </button>
              </div>
              <div className="modal-body">
                <div className="create-community-form">
                  <label className="create-community-field">
                    <span>Name</span>
                    <input
                      type="text"
                      placeholder="Project name"
                      value={createCloudProjectName}
                      onChange={(event) => setCreateCloudProjectName(event.target.value)}
                      disabled={isCreatingCloudProject}
                    />
                  </label>
                  {createCloudProjectError && <div className="auth-error">{createCloudProjectError}</div>}
                </div>
              </div>
              <div className="modal-footer">
                <div className="create-community-actions">
                  <button
                    className="create-community-primary"
                    type="button"
                    onClick={() => void handleConfirmCreateCloudProject()}
                    disabled={isCreatingCloudProject || createCloudProjectName.trim().length === 0}
                  >
                    {isCreatingCloudProject ? "Creating..." : "Create project"}
                  </button>
                  <button
                    className="create-community-secondary"
                    type="button"
                    onClick={closeCreateCloudProjectModal}
                    disabled={isCreatingCloudProject}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showRenameCloudProjectModal && (
          <div className="modal-overlay" onClick={closeRenameCloudProjectModal}>
            <div className="modal create-community-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">Rename cloud project</div>
                <button className="modal-close" onClick={closeRenameCloudProjectModal} title="Close">
                  ×
                </button>
              </div>
              <div className="modal-body">
                <div className="create-community-form">
                  <label className="create-community-field">
                    <span>Name</span>
                    <input
                      type="text"
                      placeholder="Project name"
                      value={renameCloudProjectName}
                      onChange={(event) => setRenameCloudProjectName(event.target.value)}
                      disabled={isRenamingCloudProject}
                    />
                  </label>
                  {renameCloudProjectError && <div className="auth-error">{renameCloudProjectError}</div>}
                </div>
              </div>
              <div className="modal-footer">
                <div className="create-community-actions">
                  <button
                    className="create-community-primary"
                    type="button"
                    onClick={() => void handleConfirmRenameCloudProject()}
                    disabled={isRenamingCloudProject || renameCloudProjectName.trim().length === 0}
                  >
                    {isRenamingCloudProject ? "Saving..." : "Save"}
                  </button>
                  <button
                    className="create-community-secondary"
                    type="button"
                    onClick={closeRenameCloudProjectModal}
                    disabled={isRenamingCloudProject}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

	      <WebCreateCommunityModal
          isOpen={showCreateCommunityModal}
          hasSession={Boolean(supabaseSession)}
          communities={communities}
          communityRoleById={communityRoleById}
          builderBillingStatus={builderBillingStatus}
          isCreateBannerDragOver={isCreateBannerDragOver}
          isCreateAvatarDragOver={isCreateAvatarDragOver}
          createCommunityBannerUrl={createCommunityBannerUrl}
          createCommunityAvatarUrl={createCommunityAvatarUrl}
          createCommunityName={createCommunityName}
          createCommunityDescription={createCommunityDescription}
          createCommunitySlug={createCommunitySlug}
          createCommunityVisibility={createCommunityVisibility}
          createCommunityError={createCommunityError}
          builderBillingError={builderBillingError}
          isCreatingCommunity={isCreatingCommunity}
          isStartingBuilderPortal={isStartingBuilderPortal}
          communityInitials={communityInitials}
          onClose={closeCreateCommunityModal}
          onOpenAuthGate={openAuthGate}
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
          onChangeDescription={setCreateCommunityDescription}
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
