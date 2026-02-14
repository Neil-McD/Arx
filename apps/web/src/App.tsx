import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import "highlight.js/styles/github-dark.css";
import {
  anthropicLogo,
  googleLogo,
  openAiLogo,
  openRouterLogo,
  xAiLogo,
} from "../../../shared/providerLogos";
import {
  clearPersistedSupabaseSession,
  fetchWithSupabaseAuthShared,
  fetchWithSupabasePublicShared,
  getOAuthRedirectUrl,
  getSupabaseAuthUid,
  getSupabaseAnonKey,
  getSupabaseUrl,
  loadPersistedSupabaseSession,
  persistSupabaseSession,
  readSupabaseError,
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
  filterVisibleThreads,
  groupThreadsByDate,
  searchThreads,
} from "../../../shared/threadSidebarSelectors";
import {
  getArxOwnerEmailSet,
  getArxOwnerUserIdSet,
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
  formatPlanPrice,
  formatSubscriptionPrice,
  type BuilderBillingReturn,
} from "../../../shared/builderBilling";
import { useCheckoutFinalizeController } from "../../../shared/useCheckoutFinalizeController";
import { AnalyticsLineChart } from "../../../shared/AnalyticsLineChart";
import {
  copyTextToClipboard,
  downloadTextFile,
  getAvatarColor,
  getInitials,
  shortId,
  shouldShowDateSeparator,
} from "../../../shared/chatUi";
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
import { resetWebSessionStateAfterSignOut } from "./auth/resetSessionState";
import { resolveUserAccessPolicy } from "../../../shared/capabilities";
import { CommunityChatMessageRow } from "../../../shared/CommunityChatMessageRow";
import { useLastClickWinsController } from "../../../shared/useLastClickWinsController";
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
import { useCommunityAgentTemplateMenuLifecycle } from "../../../shared/useCommunityAgentTemplateMenuLifecycle";
import { useCommunityAgentRenamingResetEffect } from "../../../shared/useCommunityAgentRenamingResetEffect";
import { useCommunityAgentPreviewTabFallbackEffect } from "../../../shared/useCommunityAgentPreviewTabFallbackEffect";
import { useCommunityAgentEditorUiController } from "../../../shared/useCommunityAgentEditorUiController";
import { useAuthGateLifecycleEffects } from "../../../shared/useAuthGateLifecycleEffects";
import { useCommunityAdminController } from "../../../shared/useCommunityAdminController";
import { useCommunityAgentDraftController } from "../../../shared/useCommunityAgentDraftController";
import { useCommunitySettingsGovernanceController } from "../../../shared/useCommunitySettingsGovernanceController";
import { useCommunitySettingsDataController } from "../../../shared/useCommunitySettingsDataController";
import { useCommunitySettingsFormController } from "../../../shared/useCommunitySettingsFormController";
import { useCommunityMembersReviewController } from "../../../shared/useCommunityMembersReviewController";
import { useCommunityAdminAnalyticsAutomationsLifecycle } from "../../../shared/useCommunityAdminAnalyticsAutomationsLifecycle";
import { useCommunityMembersReviewLifecycle } from "../../../shared/useCommunityMembersReviewLifecycle";
import { createThreadContextController } from "../../../shared/threadContextController";
import { syncThreadCommunityLensCloud } from "../../../shared/threadContextCloudSync";
import {
  extractCommunityEvidenceUsedV1,
  type CommunityEvidenceUsedV1,
} from "../../../shared/communityEvidence";
import { CommunityEvidenceCitations } from "../../../shared/CommunityEvidenceCitations";
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
  MessageContextAction,
  MessageCopyAction,
  MessageFooter,
  MessageRegenerateAction,
} from "../../../shared/MessageFooterActions";
import {
  formatCommunityVisibilityLabel,
  isPublishedCommunityVisibility,
  toCanonicalCommunityVisibility,
} from "../../../shared/communityVisibility";
import {
  formatCommunityEvidenceTypeLabel,
} from "../../../shared/communityEvidenceUi";
import {
  buildMessageContextModalPayload,
  contextActionLabel,
  hasContextPayload,
  openMessageContextModal,
  type MessageContextModalPayload,
} from "../../../shared/messageContextUi";
import { appendInferenceSourceLabel } from "../../../shared/inferenceSourceUi";
import { formatUsdCents, toEpochSeconds } from "../../../shared/displayFormatting";
import { isCommunityJoinMode, type CommunityJoinMode } from "./communityJoinPolicy";
import { useWebBuilderBillingActions } from "./controllers/useWebBuilderBillingActions";
import { useWebCommerceAffiliateActions } from "./controllers/useWebCommerceAffiliateActions";
import { useWebPublicFunnelActions } from "./controllers/useWebPublicFunnelActions";
import { useWebAuthSessionLifecycle } from "./controllers/useWebAuthSessionLifecycle";
import { useWebCommunityAgentMembersLifecycle } from "./controllers/useWebCommunityAgentMembersLifecycle";
import { useWebGuestThreadLifecycle } from "./controllers/useWebGuestThreadLifecycle";
import { useWebPostAuthBillingLifecycle } from "./controllers/useWebPostAuthBillingLifecycle";
import { useWebCommunitySettingsAccessLifecycle } from "./controllers/useWebCommunitySettingsAccessLifecycle";
import { useWebRouteHashLifecycle } from "./controllers/useWebRouteHashLifecycle";
import { useWebThreadDiscoverChatLifecycle } from "./controllers/useWebThreadDiscoverChatLifecycle";
import { useWebUiPersistenceLifecycle } from "./controllers/useWebUiPersistenceLifecycle";
import { useWebVoiceInputController } from "../../../shared/useWebVoiceInputController";
import { VoiceInputButton } from "../../../shared/VoiceInputButton";

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
  community_id: string | null;
  context_version: number;
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

type MemoryUsedItem = {
  id: string;
  content: string;
  scope: "global" | "workspace";
  scope_id: string | null;
  pinned: boolean;
  updated_at: string;
};

type MemorySuggestion = {
  content: string;
  pinned: boolean;
};

type HistoryUsedItem = {
  thread_id: string;
  message_id: string;
  created_at: string;
  snippet: string;
};

type CommunityEvidenceEntry = CommunityEvidenceUsedV1["items"][number];

type UserMemorySettings = {
  memory_mode: "off" | "suggest" | "auto";
  remember_intent_enabled: boolean;
};

type UserModelSettings = {
  system_prompt: string;
};

type MessageAttachment = CommunityMessageAttachment;

type CommunityChatMessage = {
  id: string;
  community_id: string;
  sender_id: string;
  body: string;
  attachments?: MessageAttachment[];
  reply_to_id?: string | null;
  created_at: string;
  seq: number;
};

type ChatLightboxImage = {
  url: string;
  name: string;
};

type CommunityAgentDraft = {
  id: string;
  community_id: string;
  slot: number;
  name: string | null;
  landing_json: unknown;
  system_prompt: string;
  is_active: boolean;
  updated_at: string;
};

const GUEST_THREAD_ID = "__guest__";
const GUEST_THREAD_STORAGE_KEY = "arx_guest_thread_v1";
const GUEST_MODEL_STORAGE_KEY = "arx_guest_model_id_v1";
const DEFAULT_GUEST_MODEL_ID = "gpt-oss-120b-free";
const GUEST_MODEL_ALLOWLIST = new Set<string>([DEFAULT_GUEST_MODEL_ID, "deepseek-r1-free"]);
const GUEST_MODEL_LABELS: Record<string, string> = {
  "gpt-oss-120b-free": "GPT OSS 120B (Free)",
  "deepseek-r1-free": "DeepSeek R1 (Free)",
};

type ModelSectionId = "all" | "free" | "openai" | "anthropic" | "google" | "x-ai" | "openrouter";

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
    return raw && GUEST_MODEL_ALLOWLIST.has(raw) ? raw : DEFAULT_GUEST_MODEL_ID;
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
    const model_id = model_id_raw && GUEST_MODEL_ALLOWLIST.has(model_id_raw) ? model_id_raw : loadGuestModelId();
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

type MessageReaction = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

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

type CommunityAccess = {
  community_id: string;
  user_id: string;
  is_owner: boolean;
  is_entitled: boolean;
  entitlement_role: string | null;
  entitlement_ends_at: string | null;
  effective_role: string | null;
  can_view: boolean;
  can_post_message: boolean;
  can_create_resource: boolean;
  can_manage_resources: boolean;
  can_invite: boolean;
  can_manage_members: boolean;
};

type CommunityAnalyticsSummary = {
  total_members: number | null;
  new_members_window: number | null;
  active_members_window: number | null;
  retention_window: number | null;
  total_resources: number | null;
  resources_added_window: number | null;
};

type AnalyticsPoint = {
  label: string;
  value: number;
};

type AnalyticsRange = "7d" | "30d" | "90d" | "1y" | "all";

type AnalyticsChartMode = "members" | "revenue";

type CommunityPricingMode = "free" | "monthly" | "yearly" | "both";

type UserProfile = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

type UserProfileDetail = UserProfile & {
  bio: string | null;
};

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

type SettingsPage = "account" | "models" | "execution" | "memory" | "appearance";
type SettingsGroup = "account" | "agent" | "appearance";

type AppTheme = "light" | "dark" | "dark-warm";

type ModelToggle = {
  id: string;
  label: string;
  enabled: boolean;
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

type PublicPlanSummary = {
  name: string;
  description: string | null;
  amount_base_units: string;
  currency: string;
  currency_decimals: number;
  billing_period: string;
};

type DiscoverCommunity = PublicCommunityRecord & {
  active_plan?: PublicPlanSummary | null;
};

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

type PublicRoute =
  | { kind: "app" }
  | { kind: "community_landing"; slug: string }
  | { kind: "checkout_success"; sessionId: string }
  | { kind: "claim"; token: string };

type AppPage = "workspace" | "community" | "discover";
type AppView = "home" | "settings";
type CommunityTab =
  | "chat"
  | "library"
  | "resources"
  | "members"
  | "settings"
  | "ai_agent"
  | "analytics";

type AppRouteState = {
  page: AppPage;
  view: AppView;
  settingsPage: SettingsPage;
  communityId: string | null;
  communityTab: CommunityTab;
  threadId: string | null;
  threadIsExplicit: boolean;
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
const DEFAULT_ACTIVE_MODEL_ID = "gpt-5.2";
const DEFAULT_MODEL_TOGGLES: ModelToggle[] = [
  { id: "gpt-5.2", label: "GPT 5.2", enabled: true },
  { id: "sonnet-4.5", label: "Sonnet 4.5", enabled: true },
  { id: "opus-4.5", label: "Opus 4.5", enabled: true },
  { id: "opus-4.6", label: "Opus 4.6", enabled: true },
  { id: "gemini-3-flash", label: "Gemini 3 Flash", enabled: true },
  { id: "gemini-3-pro", label: "Gemini 3 Pro", enabled: true },
  { id: "grok-4.1", label: "Grok 4.1", enabled: true }
];

const MODEL_TOGGLES_STORAGE_KEY = "arx_model_toggles";
const ACTIVE_MODEL_STORAGE_KEY = "arx_active_model_id";
const DEFAULT_POST_SIGN_IN_PATH = "/#page=workspace&view=home";

function readPublicRouteFromLocation(): PublicRoute {
  const path = window.location.pathname || "/";
  if (path.startsWith("/c/")) {
    const slug = decodeURIComponent(path.slice(3).split("/")[0] ?? "").trim();
    if (slug) return { kind: "community_landing", slug };
  }
  if (path === "/checkout/success") {
    const params = new URLSearchParams(window.location.search);
    const sessionId = (params.get("session_id") ?? "").trim();
    return { kind: "checkout_success", sessionId };
  }
  if (path === "/claim") {
    const params = new URLSearchParams(window.location.search);
    const token = (params.get("token") ?? "").trim();
    return { kind: "claim", token };
  }
  return { kind: "app" };
}

function readAppRouteFromLocation(): AppRouteState {
  const rawHash = window.location.hash ? window.location.hash.slice(1) : "";
  const normalized = rawHash.replace(/^\/+/, "").replace(/^\?/, "");
  const params = new URLSearchParams(normalized);

  const rawPage = (params.get("page") ?? "").trim();
  const page: AppPage = rawPage === "community" ? "community" : rawPage === "discover" ? "discover" : "workspace";

  const rawView = (params.get("view") ?? "").trim();
  const view: AppView = rawView === "settings" ? "settings" : "home";

  const rawSettings = (params.get("settings") ?? "").trim();
  const settingsPage: SettingsPage =
    rawSettings === "account"
      ? "account"
      : rawSettings === "execution"
        ? "execution"
        : rawSettings === "memory"
          ? "memory"
          : rawSettings === "appearance"
            ? "appearance"
            : "models";

  const rawCommunity = (params.get("community") ?? "").trim();
  const communityId = rawCommunity && isUuid(rawCommunity) ? rawCommunity : null;

  const rawCommunityTab = (params.get("ctab") ?? "").trim();
  const communityTab: CommunityTab =
    rawCommunityTab === "library"
      ? "library"
      : rawCommunityTab === "resources"
        ? "resources"
        : rawCommunityTab === "members"
          ? "members"
          : rawCommunityTab === "settings"
            ? "settings"
            : rawCommunityTab === "ai_agent"
              ? "ai_agent"
              : rawCommunityTab === "analytics"
                ? "analytics"
                : "chat";

  const rawThread = (params.get("thread") ?? "").trim();
  const threadIsExplicit = params.has("thread");
  const threadId = rawThread === "new" || !rawThread ? null : isUuid(rawThread) ? rawThread : null;

  return { page, view, settingsPage, communityId, communityTab, threadId, threadIsExplicit };
}

function buildAppRouteHash(state: {
  page: AppPage;
  view: AppView;
  settingsPage: SettingsPage;
  communityId: string | null;
  communityTab: CommunityTab;
  threadToken?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("page", state.page);
  params.set("view", state.view);
  if (state.view === "settings") {
    params.set("settings", state.settingsPage);
  }
  if (state.communityId) {
    params.set("community", state.communityId);
    params.set("ctab", state.communityTab);
  }
  if (typeof state.threadToken === "string" && state.threadToken.trim()) {
    params.set("thread", state.threadToken);
  }
  return `#${params.toString()}`;
}


const MAX_WEB_ATTACHMENTS_PER_MESSAGE = 8;
const MAX_WEB_IMAGE_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB (client-side; still compressed before sending)
const MAX_WEB_FILE_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_WEB_TEXT_ATTACHMENT_BYTES = 200 * 1024; // 200KB
const MAX_WEB_IMAGE_DATA_URL_CHARS = 600_000; // ~0.6MB base64 payload
function communityInitials(name: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "AR";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  const combined = initials.join("");
  return combined || trimmed.slice(0, 2).toUpperCase();
}

function parseMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content && typeof content === "object") {
    const record = content as Record<string, unknown>;
    const text = record.text;
    if (typeof text === "string") return text;
    const contentField = record.content;
    if (typeof contentField === "string") return contentField;
  }
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return "";
  }
}

function parseMemoryUsedArray(value: unknown): MemoryUsedItem[] {
  if (!Array.isArray(value)) return [];
  const out: MemoryUsedItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const content = typeof record.content === "string" ? record.content.trim() : "";
    if (!id || !content) continue;
    out.push({
      id,
      content,
      scope: record.scope === "workspace" ? "workspace" : "global",
      scope_id: typeof record.scope_id === "string" ? record.scope_id : null,
      pinned: Boolean(record.pinned),
      updated_at: typeof record.updated_at === "string" ? record.updated_at : "",
    });
  }
  return out;
}

function parseMessageMemoryUsed(content: unknown): MemoryUsedItem[] {
  if (!content || typeof content !== "object") return [];
  const record = content as Record<string, unknown>;
  const meta = record.meta;
  if (meta && typeof meta === "object") {
    const metaRecord = meta as Record<string, unknown>;
    const fromMeta = parseMemoryUsedArray(metaRecord.memory_used);
    if (fromMeta.length > 0) return fromMeta;
  }
  return parseMemoryUsedArray(record.memory_used);
}

function parseMemorySuggestionsArray(value: unknown): MemorySuggestion[] {
  if (!Array.isArray(value)) return [];
  const out: MemorySuggestion[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const content = typeof record.content === "string" ? record.content.trim() : "";
    if (!content) continue;
    out.push({ content, pinned: Boolean(record.pinned) });
  }
  return out.slice(0, 6);
}

function parseMessageMemorySuggestions(content: unknown): MemorySuggestion[] {
  if (!content || typeof content !== "object") return [];
  const record = content as Record<string, unknown>;
  const meta = record.meta;
  if (meta && typeof meta === "object") {
    const metaRecord = meta as Record<string, unknown>;
    const fromMeta = parseMemorySuggestionsArray(metaRecord.memory_suggestions);
    if (fromMeta.length > 0) return fromMeta;
  }
  return parseMemorySuggestionsArray(record.memory_suggestions);
}

function parseHistoryUsedArray(value: unknown): HistoryUsedItem[] {
  if (!Array.isArray(value)) return [];
  const out: HistoryUsedItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const thread_id = typeof record.thread_id === "string" ? record.thread_id.trim() : "";
    const message_id = typeof record.message_id === "string" ? record.message_id.trim() : "";
    const snippet = typeof record.snippet === "string" ? record.snippet.trim() : "";
    if (!thread_id || !message_id || !snippet) continue;
    out.push({
      thread_id,
      message_id,
      created_at: typeof record.created_at === "string" ? record.created_at : "",
      snippet,
    });
  }
  return out.slice(0, 12);
}

function parseMessageHistoryUsed(content: unknown): HistoryUsedItem[] {
  if (!content || typeof content !== "object") return [];
  const record = content as Record<string, unknown>;
  const meta = record.meta;
  if (meta && typeof meta === "object") {
    const metaRecord = meta as Record<string, unknown>;
    const fromMeta = parseHistoryUsedArray(metaRecord.history_used);
    if (fromMeta.length > 0) return fromMeta;
  }
  return parseHistoryUsedArray(record.history_used);
}

function parseMessageMemoryAdded(content: unknown): MemoryUsedItem[] {
  if (!content || typeof content !== "object") return [];
  const record = content as Record<string, unknown>;
  const meta = record.meta;
  if (meta && typeof meta === "object") {
    const metaRecord = meta as Record<string, unknown>;
    const fromMeta = parseMemoryUsedArray(metaRecord.memory_added);
    if (fromMeta.length > 0) return fromMeta;
  }
  return parseMemoryUsedArray(record.memory_added);
}

function extractRememberIntent(text: string): string | null {
  const input = (text ?? "").trim();
  if (!input) return null;
  // If the user is asking a question ("remember ...?"), treat it as recall, not an instruction to store memory.
  if (input.includes("?")) return null;
  const match = input.match(/^(?:please\s+)?remember(?:\s+that)?[:\s]+(.+)$/i);
  const content = match?.[1]?.trim() ?? "";
  if (!content) return null;
  // Avoid useless "remember this/that/it" memories. Require an actual fact/preference payload.
  if (/^(?:this|that|it|these|those)$/i.test(content)) return null;
  if (content.length < 4) return null;
  return content;
}

function formatModelLabel(modelId: string | null | undefined): string | null {
  const raw = (modelId ?? "").trim();
  if (!raw) return null;

  const normalized = raw.replace(/[_\s]+/g, "-");
  const gptMatch = normalized.match(/^gpt-?(\d+(?:\.\d+)?)(.*)$/i);
  if (gptMatch) {
    const version = gptMatch[1] ?? "";
    const rest = (gptMatch[2] ?? "").replace(/^-+/, "").replace(/-+/g, " ").trim();
    return `GPT ${version}${rest ? ` ${rest}` : ""}`.trim();
  }

  return raw.replace(/[_-]+/g, " ");
}

function extractInferenceSourceFromContent(content: unknown): string | null {
  if (!content || typeof content !== "object") return null;
  const record = content as Record<string, unknown>;
  const meta = record.meta;
  if (!meta || typeof meta !== "object") return null;
  const value = (meta as Record<string, unknown>).inference_source;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function formatModelSignature(modelId: string | null | undefined, inferenceSource: string | null | undefined): string | null {
  const base = formatModelLabel(modelId);
  return appendInferenceSourceLabel(base, inferenceSource);
}

function shouldShowSender(
  messages: { sender_id: string; created_at: string; reply_to_id?: string | null }[],
  index: number
): boolean {
  if (index === 0) return true;
  const prev = messages[index - 1];
  const curr = messages[index];
  if (prev.sender_id !== curr.sender_id) return true;
  if (new Date(prev.created_at).toDateString() !== new Date(curr.created_at).toDateString()) return true;
  if ((prev.reply_to_id ?? null) !== (curr.reply_to_id ?? null)) return true;
  const prevTime = new Date(prev.created_at).getTime();
  const currTime = new Date(curr.created_at).getTime();
  return currTime - prevTime > 2 * 60 * 1000;
}

function settingsGroupForPage(page: SettingsPage): SettingsGroup {
  if (page === "appearance") return "appearance";
  if (page === "account") return "account";
  return "agent";
}

function settingsGroupLabel(group: SettingsGroup): string {
  switch (group) {
    case "account":
      return "Account";
    case "agent":
      return "Agent";
    case "appearance":
      return "Appearance";
  }
}

export default function App() {
  const arxOwnerEmailSet = useMemo(
    () =>
      getArxOwnerEmailSet({
        ownerEmailsCsv: (import.meta.env.VITE_ARX_OWNER_EMAILS as string | undefined) ?? "",
        ownerEmail: (import.meta.env.VITE_ARX_OWNER_EMAIL as string | undefined) ?? "",
      }),
    [],
  );
  const arxOwnerUserIdSet = useMemo(
    () =>
      getArxOwnerUserIdSet({
        ownerUserIdsCsv: (import.meta.env.VITE_ARX_OWNER_USER_IDS as string | undefined) ?? "",
        ownerUserId: (import.meta.env.VITE_ARX_OWNER_USER_ID as string | undefined) ?? "",
      }),
    [],
  );
  const isArxOwnerAccount = (user: { id?: string | null; email?: string | null } | null | undefined): boolean => {
    if (!user) return false;
    const userId = String(user.id ?? "").trim();
    if (userId && arxOwnerUserIdSet.has(userId)) return true;
    const email = String(user.email ?? "").trim().toLowerCase();
    return Boolean(email && arxOwnerEmailSet.has(email));
  };
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

  const [publicRoute, setPublicRoute] = useState<PublicRoute>(() => initialPublicRoute);

  const [activePage, setActivePage] = useState<AppPage>(() => initialAppRoute?.page ?? "workspace");
  const [activeView, setActiveView] = useState<AppView>(() => initialAppRoute?.view ?? "home");
  const [settingsPage, setSettingsPage] = useState<SettingsPage>(() => initialAppRoute?.settingsPage ?? "models");
  const settingsGroup = settingsGroupForPage(settingsPage);
  const [userWantsSessions, setUserWantsSessions] = useState(false);
  const [appTheme, setAppTheme] = useState<AppTheme>(() => {
    try {
      const stored = localStorage.getItem("arx-theme");
      if (stored && ["light", "dark", "dark-warm"].includes(stored)) {
        return stored as AppTheme;
      }
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
  const [isDevSettingBuilderTier, setIsDevSettingBuilderTier] = useState(false);
  const [devSetBuilderTierError, setDevSetBuilderTierError] = useState<string | null>(null);
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
  const [activeModelId, setActiveModelId] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(ACTIVE_MODEL_STORAGE_KEY);
      const allowedIds = new Set(DEFAULT_MODEL_TOGGLES.map((toggle) => toggle.id));
      return stored && allowedIds.has(stored) ? stored : null;
    } catch {
      return null;
    }
  });
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
  const confirmDiscardUnsavedCommunitySettings = (nextCommunityId: string | null): boolean => {
    if (!communitySettingsDirtyRef.current && !communityAgentDraftDirtyRef.current) {
      return true;
    }
    const currentId = activeCommunityId;
    if (!currentId) return true;
    if (!nextCommunityId || nextCommunityId === currentId) return true;
    return window.confirm("You have unsaved changes. Discard changes?");
  };

  const [communityAgentDrafts, setCommunityAgentDrafts] = useState<CommunityAgentDraft[]>([]);
  const [isLoadingCommunityAgentDrafts, setIsLoadingCommunityAgentDrafts] = useState(false);
  const [communityAgentDraftsError, setCommunityAgentDraftsError] = useState<string | null>(null);
  const communityAgentDraftsLoadedCommunityIdRef = useRef<string | null>(null);

  const [communityAgentSelectedSlot, setCommunityAgentSelectedSlot] = useState(1);
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
  const [isCommunityAgentTemplateMenuOpen, setIsCommunityAgentTemplateMenuOpen] = useState(false);
  const [communityAgentRenamingSlot, setCommunityAgentRenamingSlot] = useState<number | null>(null);
  const [communityAgentRenamingValue, setCommunityAgentRenamingValue] = useState("");
  const [communityAgentSavedSlot, setCommunityAgentSavedSlot] = useState<number | null>(null);
  const communityAgentSavedTimerRef = useRef<number | null>(null);
  const communityAgentTemplatePickerRef = useRef<HTMLDivElement | null>(null);
  const {
    markCommunityAgentDraftDirty,
    flashCommunityAgentTemplateSaved,
    beginCommunityAgentLandingEdit,
    clearCommunityAgentLandingEdit,
    hydrateCommunityAgentEditor,
  } = useCommunityAgentEditorUiController<CommunityAgentLanding, CommunityAgentLandingEdit, CommunityAgentDraft>({
    activeCommunityId,
    communities,
    defaultLanding: DEFAULT_EMPTY_THREAD_LANDING,
    buildDefaultCommunityLanding: buildDefaultCommunityEmptyThreadLanding,
    normalizeCommunityAgentLanding,
    setCommunityAgentSelectedSlot,
    setCommunityAgentDraftName,
    setCommunityAgentDraftLanding,
    setCommunityAgentDraftSystemPrompt,
    setCommunityAgentDraftSaveError,
    setCommunityAgentPreviewTabId,
    setCommunityAgentLandingEdit,
    setCommunityAgentLandingEditValue,
    setCommunityAgentSavedSlot,
    communityAgentDraftDirtyRef,
    communityAgentSavedTimerRef,
  });

  const [communityMemberMuted, setCommunityMemberMuted] = useState(false);
  const [isLoadingCommunityMemberSettings, setIsLoadingCommunityMemberSettings] = useState(false);
  const [communityMemberSettingsError, setCommunityMemberSettingsError] = useState<string | null>(null);
  const [isLeavingCommunity, setIsLeavingCommunity] = useState(false);

  const [threads, setThreads] = useState<ThreadRecord[]>([]);
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
  const navSnapshotsEqual = (a: NavSnapshot, b: NavSnapshot): boolean =>
    a.page === b.page &&
    a.view === b.view &&
    a.settingsPage === b.settingsPage &&
    a.communityId === b.communityId &&
    a.communityTab === b.communityTab &&
    a.threadId === b.threadId &&
    a.workspaceWantsNewChat === b.workspaceWantsNewChat;
  const pushNavSnapshot = () => {
    const snapshot = takeNavSnapshot();
    const stack = navStackRef.current;
    const last = stack[stack.length - 1] ?? null;
    if (last && navSnapshotsEqual(last, snapshot)) return;
    stack.push(snapshot);
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
    const stack = navStackRef.current;
    const snapshot = stack.pop() ?? null;
    if (!snapshot) return false;
    restoreNavSnapshot(snapshot);
    return true;
  };

  const formatBackTargetLabel = (snapshot: NavSnapshot): string => {
    if (snapshot.page === "discover") return "discover";
    if (snapshot.page === "community") {
      return "community";
    }
    if (snapshot.view === "settings") {
      return "settings";
    }
    return "workspace";
  };
  const backTargetSnapshot = navStackRef.current.length > 0 ? navStackRef.current[navStackRef.current.length - 1] : null;
  const backTargetLabel = backTargetSnapshot ? formatBackTargetLabel(backTargetSnapshot) : null;

  const threadsHydratedRef = useRef(false);
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
    reason: "quota" | "unavailable";
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
  const [, setUserModelSettings] = useState<UserModelSettings>({ system_prompt: "" });
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
    getMemberRefreshIncludeStatus: () => Boolean(activeCommunityAccess?.can_manage_members),
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
    persistCommunityAgentTemplateName,
    handleSetLiveCommunityAgentDraft,
  } = useCommunityAgentDraftController<SupabaseSession, CommunityAgentLanding, CommunityAgentDraft>({
    activeCommunityId,
    supabaseSession,
    getSupabaseUrl,
    fetchWithSupabaseAuth,
    readSupabaseError,
    communityAgentSelectedSlot,
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
    renameFailureMessage: "Failed to rename template.",
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
    canManageMembersActiveCommunity: Boolean(activeCommunityAccess?.can_manage_members),
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
      });
      if (outcome === "none") return;
    },
    onDidJustSignIn: () => {
      // If the user arrived via an auth gate (e.g. locked model selection), apply it immediately.
      resumePendingAuthIntent();
    },
    onSessionAvailable: (session) => {
      void loadCommunities(session);
      void loadThreads(session);
      void loadModelRegistry(session);
      void loadSelfProfile(session);
    },
    onSessionMissing: () => {
      setCommunities([]);
      setIsLoadingCommunities(false);
      setActiveCommunityId(null);
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
    },
  });

  useEffect(() => {
    activeCommunityIdRef.current = activeCommunityId;
  }, [activeCommunityId]);

  useEffect(() => {
    const session = supabaseSession;
    const communityId = activeCommunityId;
    const canView = activeCommunityAccess ? activeCommunityAccess.can_view : true;
    if (!session || !communityId || !canView) {
      setActiveCommunityAgentLanding(null);
      activeCommunityAgentLandingCommunityIdRef.current = null;
      return;
    }
    if (activeCommunityAgentLandingCommunityIdRef.current === communityId) return;

    if (!getSupabaseUrl()) return;

    communityAgentLandingFetchSeqRef.current += 1;
    const fetchSeq = communityAgentLandingFetchSeqRef.current;

    void (async () => {
      try {
        const response = await fetchWithSupabaseAuth(
          `${url}/rest/v1/rpc/get_active_community_agent_landing`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ p_community_id: communityId }),
          },
          session,
        );
        const data = response.ok ? ((await response.json()) as unknown) : null;
        if (communityAgentLandingFetchSeqRef.current !== fetchSeq) return;
        if (activeCommunityIdRef.current !== communityId) return;
        setActiveCommunityAgentLanding(data ?? null);
        activeCommunityAgentLandingCommunityIdRef.current = communityId;
      } catch {
        if (communityAgentLandingFetchSeqRef.current !== fetchSeq) return;
        if (activeCommunityIdRef.current !== communityId) return;
        setActiveCommunityAgentLanding(null);
        activeCommunityAgentLandingCommunityIdRef.current = communityId;
      }
    })();
  }, [supabaseSession, activeCommunityId, activeCommunityAccess?.can_view]);

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

  useCommunityAgentTemplateMenuLifecycle({
    isOpen: isCommunityAgentTemplateMenuOpen,
    menuRef: communityAgentTemplatePickerRef,
    closeMenu: () => setIsCommunityAgentTemplateMenuOpen(false),
    closeOnEscape: true,
    pointerTarget: "document",
  });

  useCommunityAgentRenamingResetEffect({
    isTemplateMenuOpen: isCommunityAgentTemplateMenuOpen,
    setCommunityAgentRenamingSlot,
    setCommunityAgentRenamingValue,
  });

  useCommunityAgentPreviewTabFallbackEffect({
    tabs: communityAgentDraftLanding.tabs,
    setPreviewTabId: setCommunityAgentPreviewTabId,
    resetWhenNoTabs: true,
  });

  useEffect(() => {
    return () => {
      if (communityAgentSavedTimerRef.current) {
        window.clearTimeout(communityAgentSavedTimerRef.current);
        communityAgentSavedTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setCloudProfile(null);
    setProfileSaveError(null);
    setProfileSaveSuccess(false);
    if (profileSaveTimeoutRef.current) {
      window.clearTimeout(profileSaveTimeoutRef.current);
      profileSaveTimeoutRef.current = null;
    }
  }, [profileStorageUserId]);

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

  useWebCommunitySettingsAccessLifecycle<SupabaseSession, CommunityRecord>({
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

  const canInviteActiveCommunity = Boolean(activeCommunityAccess?.can_invite);
  const isActiveCommunityOwner = Boolean(activeCommunityAccess?.is_owner);
  const canViewActiveCommunitySettings = Boolean(activeCommunityAccess?.can_view);
  const canPostMessagesActiveCommunity = Boolean(activeCommunityAccess?.can_post_message);
  const canCreateResourcesActiveCommunity = Boolean(activeCommunityAccess?.can_create_resource);
  const canManageResourcesActiveCommunity = Boolean(activeCommunityAccess?.can_manage_resources);
  const canManageMembersActiveCommunity = Boolean(activeCommunityAccess?.can_manage_members);
  const canReviewJoinRequestsActiveCommunity = Boolean(
    activeCommunityAccess?.is_owner || String(activeCommunityAccess?.effective_role ?? "").trim().toLowerCase() === "admin",
  );
  const canViewActiveCommunityAnalytics = canManageMembersActiveCommunity;
  const [activeCommunityOwnerIsPro, setActiveCommunityOwnerIsPro] = useState<boolean | null>(null);
  const activeCommunityOwnerIsProLoadedCommunityIdRef = useRef<string | null>(null);

  useWebCommunityAgentMembersLifecycle<SupabaseSession, CommunityAgentDraft>({
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

  useEffect(() => {
    if (!supabaseSession || !activeCommunityId || activePage !== "community") return;
    if (communityTab !== "resources" && communityTab !== "library") return;
    void loadCommunityResources(activeCommunityId, supabaseSession);
  }, [supabaseSession, activeCommunityId, activePage, communityTab]);

  useCommunityAdminAnalyticsAutomationsLifecycle({
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
    return await refreshSupabaseSessionWithLock({
      refreshToken,
      inFlightRef: refreshInFlightRef,
      refreshSession: refreshSupabaseSession,
      onRefreshed: (refreshed) => {
        setAuthError(null);
        setSupabaseSession(refreshed);
        sessionRef.current = refreshed;
        persistSupabaseSession(refreshed);
      },
    });
  }

  async function handleSignIn() {
    setAuthError(null);
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
    try {
      await revokeSupabaseSessionRemote(supabaseSession?.access_token);
    } finally {
      // Always clear local auth state, even if remote logout fails.
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
    }
  }

  async function fetchWithSupabasePublic(url: string, init: RequestInit = {}): Promise<Response> {
    return await fetchWithSupabasePublicShared(url, init);
  }

  async function fetchWithSupabaseAuth(url: string, init: RequestInit, session: SupabaseSession): Promise<Response> {
    return await fetchWithSupabaseAuthShared({
      url,
      init,
      session,
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
      setActiveView("home");
      setActivePage("community");
      setCommunityTab("chat");
      setActiveCommunityId(communityId);
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
    handleDevSetBuilderTier,
    redeemPendingPurchases,
  } = useWebCommerceAffiliateActions({
    getSession: () => sessionRef.current,
    getSupabaseUrl,
    fetchWithSupabaseAuth,
    readSupabaseError,
    openAuthGate,
    openCommunityWorkspace: (communityId) => {
      navigateTo("/", { replace: true });
      setActiveView("home");
      setActivePage("community");
      setCommunityTab("chat");
      setActiveCommunityId(communityId);
    },
    loadCommunities,
    isArxOwnerAccount,
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
    isDevSettingBuilderTier,
    setIsDevSettingBuilderTier,
    setDevSetBuilderTierError,
    resetOwnerProCaches: () => {
      setActiveCommunityOwnerIsPro(null);
      activeCommunityOwnerIsProLoadedCommunityIdRef.current = null;
      communityAgentDraftsLoadedCommunityIdRef.current = null;
    },
    redeemPendingPurchasesInFlightRef,
  });

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
      setActiveCommunityId(community.id);
      setActivePage("community");
      setCommunityTab("chat");
      setActiveView("home");
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

  const { sendUserMessage, retryLastTurn, regenerateLastTurn } = useWebSendFlowController<
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
    builderTier: (builderBillingStatus?.builder_tier ?? "free").toLowerCase(),
    hasPaidAccess:
      Boolean(supabaseSession) &&
      ["builder", "pro", "architect"].includes((builderBillingStatus?.builder_tier ?? "free").toLowerCase()),
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

  const normalizedBuilderTier = useMemo<"free" | "builder" | "architect">(() => {
    const raw = String(builderBillingStatus?.builder_tier ?? "free")
      .trim()
      .toLowerCase();
    if (raw === "builder") return "builder";
    if (raw === "pro" || raw === "architect") return "architect";
    return "free";
  }, [builderBillingStatus?.builder_tier]);
  const userAccessPolicy = useMemo(
    () =>
      resolveUserAccessPolicy({
        surface: "web",
        authState: supabaseSession ? "authenticated" : "anonymous",
        builderTier: builderBillingStatus?.builder_tier ?? null,
      }),
    [supabaseSession, builderBillingStatus?.builder_tier],
  );

		  const activeCommunityJoinMode = useMemo<CommunityJoinMode | null>(() => {
		    if (!activeCommunity) return null;
		    if (membersCommunityHasPaidPlans === null) return null;
		    if (membersCommunityHasPaidPlans) return "checkout";
        const rawVisibility = String(activeCommunity.visibility ?? "").trim().toLowerCase();
        if (rawVisibility && !["published", "unlisted", "public", "private"].includes(rawVisibility)) {
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
    const canViewCommunity = activeCommunityAccess ? activeCommunityAccess.can_view : true;
    if (activeCommunity && canViewCommunity) {
      return buildDefaultCommunityEmptyThreadLanding(activeCommunity.name);
    }
    return DEFAULT_EMPTY_THREAD_LANDING;
  }, [activeCommunity, activeCommunityAccess?.can_view, activeCommunityAgentLanding, activeCommunityId]);

  useEffect(() => {
    if (activeThreadId) return;
    const first = emptyThreadLanding.tabs[0]?.id ?? "community";
    setEmptyThreadSection(first);
  }, [activeThreadId, emptyThreadLanding]);

  const visibleThreads = useMemo(() => filterVisibleThreads(threads), [threads]);
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
      return `${title} ${communityName}`;
    });
  }, [communities, getThreadDisplayTitle, normalizedThreadSearch, visibleThreads]);

	  const enabledModels = useMemo(() => modelToggles.filter((toggle) => toggle.enabled), [modelToggles]);
	  const effectiveTier = ((builderBillingStatus?.builder_tier ?? "free") as string).toLowerCase();
	  const hasPaidAccess =
      Boolean(supabaseSession) &&
      (effectiveTier === "builder" || effectiveTier === "pro" || effectiveTier === "architect");

	  const guestModelLabel = useMemo(() => {
	    const label = (GUEST_MODEL_LABELS[guestModelId] ?? "").trim();
	    return label || guestModelId || "Model";
	  }, [guestModelId]);

	  const selectedModelId = useMemo(() => {
	    const threadModel = (activeThread?.model_id ?? "").trim();
	    if (
	      threadModel &&
	      modelToggles.some((toggle) => toggle.id === threadModel) &&
	      (!supabaseSession || hasPaidAccess || GUEST_MODEL_ALLOWLIST.has(threadModel))
	    ) {
	      return threadModel;
	    }

	    const stored = (activeModelId ?? "").trim();
	    if (
	      stored &&
	      modelToggles.some((toggle) => toggle.id === stored) &&
	      (!supabaseSession || hasPaidAccess || GUEST_MODEL_ALLOWLIST.has(stored))
	    ) {
	      return stored;
	    }

	    const fallbackModelId =
	      enabledModels.find((toggle) => toggle.id === DEFAULT_ACTIVE_MODEL_ID)?.id ??
	      enabledModels[0]?.id ??
	      modelToggles[0]?.id ??
	      "";
	    if (!supabaseSession || hasPaidAccess) return fallbackModelId;
	    return GUEST_MODEL_ALLOWLIST.has(fallbackModelId) ? fallbackModelId : DEFAULT_GUEST_MODEL_ID;
	  }, [activeThread?.model_id, activeModelId, enabledModels, hasPaidAccess, modelToggles, supabaseSession]);

	  const selectedModelLabel = useMemo(() => {
	    if (!selectedModelId) return "Model";
	    return enabledModels.find((toggle) => toggle.id === selectedModelId)?.label ?? selectedModelId;
	  }, [enabledModels, selectedModelId]);

	  const activeModelLabel = supabaseSession ? selectedModelLabel : guestModelLabel;

	  const inferProviderSection = (modelId: string): ModelSectionId => {
	    const id = (modelId ?? "").trim().toLowerCase();
	    if (id.startsWith("gpt-")) return "openai";
	    if (id.startsWith("sonnet-") || id.startsWith("opus-")) return "anthropic";
	    if (id.startsWith("gemini-")) return "google";
	    if (id.startsWith("grok-")) return "x-ai";
	    return "openrouter";
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
		    const out: CuratedPickerModel[] = [];
		    out.push(
		      { id: "gpt-oss-120b-free", label: GUEST_MODEL_LABELS["gpt-oss-120b-free"]!, section: "free", access: "guest", description: "OpenRouter free tier" },
		      { id: "deepseek-r1-free", label: GUEST_MODEL_LABELS["deepseek-r1-free"]!, section: "free", access: "guest", description: "OpenRouter free tier" },
		    );
		    for (const toggle of enabledModels) {
		      out.push({ id: toggle.id, label: toggle.label, section: inferProviderSection(toggle.id), access: "authed" });
		    }
		    out.push(
		      { id: "kimi-k2", label: "Kimi K2", section: "openrouter", access: "paid", description: "Moonshot via OpenRouter" },
		      { id: "glm-4.7", label: "GLM 4.7", section: "openrouter", access: "paid", description: "Zhipu via OpenRouter" },
		      { id: "gpt-oss-20b", label: "GPT OSS 20B", section: "openrouter", access: "paid", description: "OpenAI OSS via OpenRouter" },
		      { id: "deepseek-v3.2", label: "DeepSeek V3.2", section: "openrouter", access: "paid", description: "DeepSeek via OpenRouter" },
		    );
		    return out;
		  }, [enabledModels]);

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
		    if (!modelToggles.some((toggle) => toggle.id === model.id)) return false;
		    if (model.access === "paid") return hasPaidAccess;
		    return hasPaidAccess;
			  };

			  const handleSelectPickerModel = (model: CuratedPickerModel) => {
			    if (!canSelectPickerModel(model)) {
			      if (supabaseSession && model.access !== "guest" && !hasPaidAccess) {
			        closeModelPicker();
			        setBuilderUpgradeContext("builder");
			        setIsBuilderUpgradeOpen(true);
			        return;
			      }
			      if (supabaseSession && !modelToggles.some((toggle) => toggle.id === model.id)) {
			        showAppToastMessage("This model is coming soon.");
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
	  const lastThreadAssistantMessageId = getLastThreadMessageId(threadMessages, "assistant");
  const canRetryLastThreadTurn = Boolean(
    threadError &&
      supabaseSession &&
      activeThreadId &&
      !isSendingMessage &&
      lastThreadMessageRole === "user" &&
      lastThreadUserMessageId,
  );
	  const canRegenerateLastThreadTurn = Boolean(
	    supabaseSession &&
	      activeThreadId &&
	      !isSendingMessage &&
	      lastThreadMessageRole === "assistant" &&
	      lastThreadUserMessageId &&
	      lastThreadAssistantMessageId,
	  );
		  const workspaceThreadKey = supabaseSession ? activeThreadId : GUEST_THREAD_ID;
		  const isStreamingWorkspaceTurn = Boolean(
		    isSendingMessage && streamingThreadId === workspaceThreadKey && streamingContent !== null,
		  );

		  const authGateModal =
		    !supabaseSession && isAuthGateOpen ? (
		      <div className="modal-overlay" onClick={() => setIsAuthGateOpen(false)}>
		        <div className="modal modal-auth-gate" onClick={(event) => event.stopPropagation()}>
		          <div className="modal-header">
		            <div className="modal-title">Sign in</div>
		            <button
		              className="modal-close"
		              type="button"
		              onClick={() => setIsAuthGateOpen(false)}
		              title="Close"
		            >
		              ×
		            </button>
		          </div>
		          <div className="modal-body">
		            <ul className="auth-gate-bullets">
		              <li>Sync chats across devices</li>
		              <li>Unlock more models</li>
		              <li>Access gated communities</li>
		            </ul>
		            {authError && <div className="auth-error">{authError}</div>}
		          </div>
		          <div className="modal-footer">
		            <div className="auth-actions">
		              <button className="auth-gate-google-button" type="button" onClick={handleSignIn}>
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
		            </div>
		          </div>
		        </div>
		      </div>
		    ) : null;

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

		    return (
		      <div className="app-root public-root">
	        <header className="app-topbar">
          <div className="topbar-left">
            <button className="back-to-workspace" type="button" onClick={() => navigateTo("/")}>
              <svg viewBox="0 0 24 24" className="back-icon" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span className="back-path">Arx</span>
            </button>
          </div>
          <div className="topbar-right">
            {showSignIn ? (
              <button className="secondary" type="button" onClick={openAuthGate}>
                Sign in
              </button>
            ) : (
              <button className="secondary" type="button" onClick={() => void handleSignOut()}>
                Sign out
              </button>
            )}
          </div>
		        </header>

		        <main className="workspace community-mode">
			          {publicRoute.kind === "community_landing" && (
			            <div className="community-panel discover-panel">
	              <div className="discover-hero">
	                <div className="discover-hero-copy">
	                  <div className="discover-title">{publicCommunity?.name ?? publicRoute.slug}</div>
	                  <div className="discover-subtitle">
	                    {publicCommunity?.description ?? "Join this community on Arx."}
	                  </div>
	                  <div className="discover-subtitle">
	                    {selectedPublicCommunityPlan ? formatPlanPrice(selectedPublicCommunityPlan) : "Free"} · {publicVisibilityLabel}
	                  </div>
	                  {publicCommunity && <div className="discover-empty-text">{publicVisibilityHint}</div>}
	                </div>
	                <div className="discover-controls">
	                  {publicCommunityPlans.length > 1 && (
	                    <div className="analytics-range-toggle" role="tablist" aria-label="Billing period">
                      {[
                        ...publicCommunityPlans.slice().sort((a, b) => {
                          const ar = a.billing_period === "monthly" ? 0 : 1;
                          const br = b.billing_period === "monthly" ? 0 : 1;
                          return ar - br;
                        }),
                      ].map((plan) => (
                        <button
                          key={plan.billing_period}
                          type="button"
                          className={
                            plan.billing_period ===
                            (selectedPublicCommunityBillingPeriod ?? selectedPublicCommunityPlan?.billing_period)
                              ? "analytics-range-btn active"
                              : "analytics-range-btn"
                          }
                          aria-pressed={
                            plan.billing_period ===
                            (selectedPublicCommunityBillingPeriod ?? selectedPublicCommunityPlan?.billing_period)
                          }
                          onClick={() => setSelectedPublicCommunityBillingPeriod(plan.billing_period)}
                        >
                          {plan.billing_period === "monthly" ? "Monthly" : "Annual"}
                        </button>
                      ))}
                    </div>
                  )}
		                  <button
		                    className="discover-refresh"
		                    type="button"
		                    disabled={
		                      isLoadingPublicCommunity ||
		                      !publicCommunity ||
		                      checkoutStatus === "loading" ||
			                      isJoiningPublicCommunity ||
			                      isRequestingPublicCommunityAccess ||
			                      isLoadingMyPublicCommunityJoinRequest ||
			                      (canJoinWithCheckout && !selectedPublicCommunityPlan) ||
			                      (!canJoinWithCheckout && !canJoinForFree && !canRequestAccessForFree) ||
			                      (canRequestAccessForFree && (requestPending || requestCooldownActive))
			                    }
			                    onClick={() => {
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
				                    }}
			                  >
			                    {canJoinWithCheckout
			                      ? "Join now"
			                      : canRequestAccessForFree
			                        ? isRequestingPublicCommunityAccess
			                          ? "Requesting…"
		                          : requestPending
		                            ? "Request pending"
		                            : requestCooldownActive
		                              ? "Request denied"
		                              : "Request access"
		                        : isJoiningPublicCommunity
		                          ? "Joining…"
		                          : canJoinForFree
			                            ? "Join free"
			                            : "Invite only"}
		                  </button>
		                  {canRequestAccessForFree && !showSignIn && requestPending && (
		                    <div className="model-note" style={{ marginTop: 8 }}>
		                      Awaiting approval by the community admins.
		                    </div>
		                  )}
		                  {canRequestAccessForFree && !showSignIn && requestCooldownActive && (
		                    <div className="auth-error" style={{ marginTop: 8 }}>
		                      Request denied. Try again on {requestDeniedDateLabel}.
		                    </div>
		                  )}
		                </div>
		              </div>
              {isLoadingPublicCommunity && <div className="chat-empty">Loading…</div>}
		              {!isLoadingPublicCommunity && publicCommunityError && (
		                <div className="auth-error">{publicCommunityError}</div>
		              )}
		              {publicJoinError && <div className="auth-error">{publicJoinError}</div>}
		              {publicRequestAccessError && <div className="auth-error">{publicRequestAccessError}</div>}
		              {checkoutError && <div className="auth-error">{checkoutError}</div>}
		              {showSignIn && publicCommunity && (canJoinForFree || canRequestAccessForFree) && (
		                <div className="chat-empty">
		                  <div className="discover-empty-text">
		                    Or {canRequestAccessForFree ? "request access" : "join"} with a magic link:
		                  </div>
		                  <div className="discover-controls">
		                    <input
		                      className="discover-search"
		                      type="email"
                      inputMode="email"
                      placeholder="you@example.com"
                      value={magicLinkEmail}
                      onChange={(event) => setMagicLinkEmail(event.target.value)}
                    />
		                    <button
		                      className="discover-refresh"
		                      type="button"
		                      disabled={magicLinkStatus === "sending"}
		                      onClick={() => {
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
		                      }}
		                    >
		                      {magicLinkStatus === "sending" ? "Sending…" : "Email link"}
		                    </button>
                  </div>
                  {magicLinkStatus === "sent" && (
                    <div className="chat-empty">Check your email for a sign-in link.</div>
                  )}
	                  {magicLinkError && <div className="auth-error">{magicLinkError}</div>}
	                </div>
	              )}
		              <div className="chat-messages">
		                <div className="discover-empty">
		                  <div className="discover-empty-title">Powered by Arx</div>
			                  <div className="discover-empty-text">
			                    {publicCommunity
			                      ? publicJoinMode === "checkout"
			                        ? "Preview this community, then choose a plan to join."
			                        : publicJoinMode === "request_access"
			                          ? "This community is gated. Request access to enter."
			                          : "Join to participate in chat, resources, and voice."
			                      : "Join to access chat, resources, and the community copilot."}
			                  </div>
		                  <button className="secondary" type="button" onClick={() => navigateTo("/claim")}>
		                    Paid but can't access? Recover
		                  </button>
		                </div>
		              </div>
		            </div>
		          )}

          {publicRoute.kind === "checkout_success" && (
            <div className="community-panel discover-panel">
              <div className="discover-hero">
                <div className="discover-hero-copy">
                  <div className="discover-title">
                    {checkoutStatus === "loading"
                      ? "Setting up your access…"
                      : checkoutStatus === "pending"
                        ? "Payment pending"
                        : checkoutStatus === "succeeded"
                          ? "You're in!"
                          : "Checkout error"}
                  </div>
                  <div className="discover-subtitle">
                    {checkoutStatus === "pending"
                      ? "It can take a moment. We'll keep checking."
                      : checkoutStatus === "succeeded"
                        ? "Continue to access the community."
                        : checkoutError ?? ""}
                  </div>
                </div>
                <div className="discover-controls">
	                  <button
	                    className="discover-refresh"
	                    type="button"
	                    disabled={!pendingToken || isRedeemingClaim || checkoutStatus === "loading"}
	                    onClick={() => {
	                      if (!pendingToken) return;
	                      if (showSignIn) {
	                        openAuthGate({ reason: "redeem_purchase_claim", payload: { token: pendingToken } });
	                        return;
	                      }
	                      void redeemPurchaseClaim(pendingToken);
	                    }}
	                  >
	                    Continue
                  </button>
	                  {(checkoutStatus === "pending" || checkoutStatus === "error") && (
                    <button
                      className="secondary"
                      type="button"
                      onClick={retryCheckoutFinalize}
                    >
                      {checkoutStatus === "pending" ? "Check again" : "Retry"}
                    </button>
	                  )}
                </div>
              </div>
              {showSignIn && (
                <div className="chat-empty">
                  <div className="discover-empty-text">Or get a magic link:</div>
                  <div className="discover-controls">
                    <input
                      className="discover-search"
                      type="email"
                      inputMode="email"
                      placeholder="you@example.com"
                      value={magicLinkEmail}
                      onChange={(event) => setMagicLinkEmail(event.target.value)}
                    />
                    <button
                      className="discover-refresh"
                      type="button"
                      disabled={magicLinkStatus === "sending"}
                      onClick={() => void handleSendMagicLink(magicLinkEmail)}
                    >
                      {magicLinkStatus === "sending" ? "Sending…" : "Email link"}
                    </button>
                  </div>
                  {magicLinkStatus === "sent" && (
                    <div className="chat-empty">Check your email for a sign-in link.</div>
                  )}
                  {magicLinkError && <div className="auth-error">{magicLinkError}</div>}
                </div>
              )}
              {redeemClaimError && <div className="auth-error">{redeemClaimError}</div>}
              {isRedeemingClaim && <div className="chat-empty">Claiming access…</div>}
              {pendingToken && (
                <div className="chat-empty">
                  <a className="secondary" href={`arx://claim?token=${encodeURIComponent(pendingToken)}`}>
                    Open in desktop
                  </a>
                </div>
              )}
            </div>
          )}

          {publicRoute.kind === "claim" && (
            <div className="community-panel discover-panel">
              <div className="discover-hero">
                <div className="discover-hero-copy">
                  <div className="discover-title">Claim access</div>
                  <div className="discover-subtitle">Continue to unlock your community.</div>
                </div>
                <div className="discover-controls">
                  <button
                    className="discover-refresh"
                    type="button"
                    disabled={!(pendingToken || manualClaimToken.trim()) || isRedeemingClaim}
                    onClick={() => {
                      const token = (pendingToken || manualClaimToken).trim();
                      if (!token) return;
                      void redeemPurchaseClaim(token);
                    }}
                  >
                    Continue
                  </button>
                </div>
              </div>
              {!pendingToken && (
                <div className="chat-empty">
                  <div className="discover-empty-text">Paste your claim token:</div>
                  <div className="discover-controls">
                    <input
                      className="discover-search"
                      type="text"
                      placeholder="Paste token"
                      value={manualClaimToken}
                      onChange={(event) => setManualClaimToken(event.target.value)}
                    />
                  </div>
                </div>
              )}
              {showSignIn && (
                <div className="chat-empty">
                  <div className="discover-empty-text">Or get a magic link:</div>
                  <div className="discover-controls">
                    <input
                      className="discover-search"
                      type="email"
                      inputMode="email"
                      placeholder="you@example.com"
                      value={magicLinkEmail}
                      onChange={(event) => setMagicLinkEmail(event.target.value)}
                    />
                    <button
                      className="discover-refresh"
                      type="button"
                      disabled={magicLinkStatus === "sending"}
                      onClick={() => void handleSendMagicLink(magicLinkEmail)}
                    >
                      {magicLinkStatus === "sending" ? "Sending…" : "Email link"}
                    </button>
                  </div>
                  {magicLinkStatus === "sent" && (
                    <div className="chat-empty">Check your email for a sign-in link.</div>
                  )}
                  {magicLinkError && <div className="auth-error">{magicLinkError}</div>}
                </div>
              )}
              {redeemClaimError && <div className="auth-error">{redeemClaimError}</div>}
              {isRedeemingClaim && <div className="chat-empty">Claiming access…</div>}
              {(pendingToken || manualClaimToken.trim()) && (
                <div className="chat-empty">
                  <a
                    className="secondary"
                    href={`arx://claim?token=${encodeURIComponent((pendingToken || manualClaimToken).trim())}`}
                  >
                    Open in desktop
                  </a>
                </div>
              )}
            </div>
	          )}
	        </main>
	        {authGateModal}
	      </div>
	    );
	  }

	  const showHeaderIslands = activePage === "workspace" && activeView === "home";
	  const communityHomeButton = activeCommunity ? (
	    <button
	      className={`icon-button community-btn${activePage === "community" ? " active" : ""}`}
	      onClick={() => {
	        const nextCommunityId = activeCommunityId ?? activeCommunity.id;
	        const willChange =
	          activeView !== "home" ||
	          activePage !== "community" ||
	          communityTab !== "chat" ||
	          (activeCommunityId ?? null) !== nextCommunityId;
	        if (willChange) pushNavSnapshot();
	        setActiveView("home");
	        setActivePage("community");
	        setCommunityTab("chat");
	        setUnreadCount(0);
	        setActiveCommunityId(nextCommunityId);
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
                onClick={() => {
                  if (goBack()) return;
                  setActiveView("home");
                }}
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
              onClick={() => {
                if (goBack()) return;
                setActiveView("home");
                setActivePage("workspace");
              }}
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
          {activePage === "community"
            ? null
            : showHeaderIslands
              ? communityHomeButton
              : <div className="web-floating-island">{communityHomeButton}</div>}
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
	                <>
	                  <div className="session-search" role="search" aria-label="Search threads">
	                    <svg className="session-search-icon" viewBox="0 0 24 24" aria-hidden="true">
	                      <circle cx="11" cy="11" r="7" />
	                      <path d="M20 20l-3.5-3.5" />
	                    </svg>
	                    <input
	                      value={threadSearchQuery}
	                      onChange={(event) => setThreadSearchQuery(event.target.value)}
	                      onKeyDown={(event) => {
	                        if (event.key === "Escape") setThreadSearchQuery("");
	                      }}
	                      placeholder="Search threads…"
	                      aria-label="Search threads"
	                    />
	                    {threadSearchQuery.trim() && (
	                      <button
	                        type="button"
	                        className="session-search-clear"
	                        onClick={() => setThreadSearchQuery("")}
	                        aria-label="Clear search"
	                        title="Clear"
	                      >
	                        ×
	                      </button>
	                    )}
	                  </div>
	                  <div className="session-list">
	                    {normalizedThreadSearch ? (
	                      threadSearchResults.length === 0 ? (
	                        <div className="empty-state">No matching threads.</div>
	                      ) : (
		                        threadSearchResults.map((thread) => (
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
		                        ))
	                      )
	                    ) : (
	                      <>
	                        {groupThreadsByDate(visibleThreads).map((group) => (
	                          <div key={group.label} className="session-group">
	                            <div className="session-group-label">{group.label}</div>
		                            {group.threads.map((thread) => (
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
		                            ))}
	                          </div>
	                        ))}
	                        {visibleThreads.length === 0 && (
	                          <div className="empty-state">No chats yet. Send a message to start.</div>
	                        )}
	                      </>
	                    )}
	                  </div>
	                </>
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
                onClick={() => {
                  if (activePage !== "discover") pushNavSnapshot();
                  setActiveView("home");
                  setActivePage("discover");
                }}
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
	              {communities.map((community) => (
	                <button
	                  key={community.id}
	                  type="button"
		                  className={`community-rail-button community-rail-community${community.id === activeCommunityId ? " active" : ""}`}
	                  onClick={() => {
	                    if (!confirmDiscardUnsavedCommunitySettings(community.id)) return;
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
		                  title={community.name}
	                >
                  {community.avatar_url ? (
                    <img
                      className="community-rail-avatar"
                      src={community.avatar_url}
                      alt={community.name}
                      loading="lazy"
                    />
                  ) : (
                    <span className="community-rail-initials">{communityInitials(community.name)}</span>
                  )}
                </button>
              ))}
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
	                onClick={() => {
                    const nextView: AppView =
                      activePage === "workspace" && activeView === "settings" ? "home" : "settings";
                    if (nextView === "settings") pushNavSnapshot();
	                  setActivePage("workspace");
	                  setActiveView(nextView);
	                }}
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
                {([
                  { id: "account", label: settingsGroupLabel("account"), page: "account" as const,
                    icon: <span className="nav-icon"><svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg></span> },
                  { id: "agent", label: settingsGroupLabel("agent"), page: "models" as const,
                    icon: <span className="nav-icon"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 9h6M9 13h6M9 17h4" /></svg></span> },
                  { id: "appearance", label: settingsGroupLabel("appearance"), page: "appearance" as const,
                    icon: <span className="nav-icon"><svg viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" /></svg></span> },
                ] as { id: string; label: string; page: SettingsPage; icon: React.ReactNode }[]).map((group) => (
	                <button
	                  key={group.id}
	                  className={settingsGroup === group.id ? "nav-item active" : "nav-item"}
	                  onClick={() => setSettingsPage(group.page)}
	                  type="button"
	                >
	                  {group.icon}
	                  {group.label}
	                </button>
	              ))}
	            </div>
	          </aside>
	        )}

        {showCommunityNav && (
          <aside className="community-nav">
            <div className="community-nav-header">
              <div
                className={`community-nav-banner${activeCommunity?.banner_url ? " has-image" : ""}`}
                style={
                  activeCommunity?.banner_url
                    ? { backgroundImage: `url(${activeCommunity.banner_url})` }
                    : undefined
                }
              >
                <div className="community-nav-banner-overlay" />
                <div className="community-nav-name">
                  {activeCommunity?.name ?? "Community"}
                </div>
              </div>
            </div>
            <button
              className={communityTab === "chat" ? "nav-item active" : "nav-item"}
              type="button"
              onClick={() => setCommunityTab("chat")}
              title="Chat"
            >
              <span className="nav-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                </svg>
              </span>
              Chat
            </button>
            <button
              className={communityTab === "library" ? "nav-item active" : "nav-item"}
              type="button"
              onClick={() => setCommunityTab("library")}
              title="Library"
            >
              <span className="nav-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 0 4 23" />
                  <path d="M4 5.5V19.5" />
                </svg>
              </span>
              Library
            </button>
            <button
              className={communityTab === "resources" ? "nav-item active" : "nav-item"}
              type="button"
              onClick={() => setCommunityTab("resources")}
              title="Resources"
            >
              <span className="nav-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M10 13a5 5 0 0 0 7.07 0l3.54-3.54a5 5 0 0 0-7.07-7.07L10 5" />
                  <path d="M14 11a5 5 0 0 0-7.07 0L3.4 14.54a5 5 0 0 0 7.07 7.07L14 19" />
                </svg>
              </span>
              Resources
            </button>
            <button
              className={communityTab === "members" ? "nav-item active" : "nav-item"}
              type="button"
              onClick={() => setCommunityTab("members")}
              title="Members"
            >
              <span className="nav-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
              Members
            </button>
	            {canViewActiveCommunitySettings && (
	              <>
	                <div className="community-nav-divider" />
	                <button
	                  className={communityTab === "settings" ? "nav-item active" : "nav-item"}
                  type="button"
                  onClick={() => {
                    setActivePage("community");
                    setActiveView("home");
                    setCommunityTab("settings");
                  }}
                  title="Settings"
                >
                  <span className="nav-icon">
                    <svg
                      viewBox="0 0 24 24"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ strokeWidth: 1.5 }}
                    >
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
	                  </span>
	                  Settings
	                </button>
                  {canManageMembersActiveCommunity && (
                    <button
                      className={`${communityTab === "ai_agent" ? "nav-item active" : "nav-item"}${
                        activeCommunityOwnerIsPro === false ? " premium-locked" : ""
                      }`}
                      type="button"
                      onClick={() => {
                        setActivePage("community");
                        setActiveView("home");
                        setCommunityTab("ai_agent");
                      }}
	                      title={activeCommunityOwnerIsPro === false ? "AI Agent (Architect)" : "AI Agent"}
	                    >
	                      <span className="nav-icon">
	                        <svg viewBox="0 0 24 24">
	                          <circle cx="6" cy="7" r="2" />
	                          <circle cx="6" cy="17" r="2" />
	                          <circle cx="12" cy="12" r="2" />
	                          <circle cx="18" cy="7" r="2" />
	                          <circle cx="18" cy="17" r="2" />
	                          <path d="M7.5 8.3L10.5 10.7" />
	                          <path d="M7.5 15.7L10.5 13.3" />
	                          <path d="M13.5 10.7L16.5 8.3" />
	                          <path d="M13.5 13.3L16.5 15.7" />
	                        </svg>
	                      </span>
	                      AI Agent
	                      {activeCommunityOwnerIsPro === false && (
	                        <span className="nav-premium-badge" aria-hidden="true">
                          <svg viewBox="0 0 24 24">
                            <path d="M4 7l4 4 4-6 4 6 4-4-2 13H6L4 7z" />
                          </svg>
                        </span>
                      )}
                    </button>
                  )}
	                {canViewActiveCommunityAnalytics && (
	                  <>
	                    <button
	                      className={communityTab === "analytics" ? "nav-item active" : "nav-item"}
	                      type="button"
	                      onClick={() => {
	                        setActivePage("community");
	                        setActiveView("home");
	                        setCommunityTab("analytics");
	                      }}
	                      title="Analytics"
	                    >
	                      <span className="nav-icon">
	                        <svg viewBox="0 0 24 24">
	                          <path d="M4 19V5" />
	                          <path d="M4 19h16" />
	                          <path d="M8 15v-5" />
	                          <path d="M12 15v-8" />
	                          <path d="M16 15v-3" />
	                        </svg>
	                      </span>
	                      Analytics
	                    </button>
	                  </>
	                )}
	              </>
	            )}
          </aside>
        )}

        <main className={`workspace${activePage !== "workspace" ? " community-mode" : ""}`}>
	          {activeView === "settings" ? (
	            <div className="settings-panel">
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
                        {profileAvatarUrl ? (
                          <img src={profileAvatarUrl} alt="Profile avatar" />
                        ) : (
                          <span>
                            {getInitials(
                              (profileName || profileUsername || supabaseSession?.user.email || "AR").replace(/^@/, "")
                            )}
                          </span>
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
                        {profileAvatarUrl && (
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
                        const tier = (status?.builder_tier ?? "free").toLowerCase();
                        const ownedCount = communities.reduce(
                          (acc, community) => acc + (communityRoleById[community.id] === "owner" ? 1 : 0),
                          0,
                        );
                        const max = status?.max_communities ?? 0;
                        const communityWord = (max > 0 ? max : ownedCount) === 1 ? "community" : "communities";
                        const communitiesLabel =
                          max > 0 ? `${ownedCount}/${max} owned ${communityWord}` : `${ownedCount} owned ${communityWord}`;
                        const tierLabel =
                          tier === "pro" || tier === "architect" ? "Architect" : tier === "builder" ? "Builder" : "Free";
                        const isArxOwner = isArxOwnerAccount(supabaseSession.user);
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
	                                {tier === "free" ? (
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
                            {isArxOwner && (
                              <>
                                <div className="model-note" style={{ marginTop: 10 }}>
                                  Owner dev: temporarily override your builder tier to test gated features.
                                </div>
                                <div className="account-row">
                                  <div className="account-identity">
                                    <span>Dev tier override</span>
                                    <strong>{tierLabel}</strong>
                                  </div>
                                  <div className="auth-actions">
                                    <button
                                      type="button"
                                      className="secondary"
                                      disabled={isDevSettingBuilderTier || tier === "free"}
                                      onClick={() => void handleDevSetBuilderTier("free")}
                                    >
                                      Free
                                    </button>
                                    <button
                                      type="button"
                                      className="secondary"
                                      disabled={isDevSettingBuilderTier || tier === "builder"}
                                      onClick={() => void handleDevSetBuilderTier("builder")}
                                    >
                                      Builder
                                    </button>
                                    <button
                                      type="button"
                                      className="secondary"
                                      disabled={isDevSettingBuilderTier || tier === "pro" || tier === "architect"}
                                      onClick={() => void handleDevSetBuilderTier("architect")}
                                    >
                                      Architect
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </>
                        );
                      })()}
                      {builderBillingError && <div className="auth-error">{builderBillingError}</div>}
                      {devSetBuilderTierError && <div className="auth-error">{devSetBuilderTierError}</div>}
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
		                                      if (!confirmDiscardUnsavedCommunitySettings(community.id)) return;
		                                      setActiveView("home");
		                                      setActivePage("community");
		                                      setActiveCommunityId(community.id);
		                                      setCommunityTab("settings");
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
                      (builderBillingStatus?.builder_tier ?? "free").toLowerCase() !== "free" && (
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
                      const tier = (builderBillingStatus?.builder_tier ?? "free").toLowerCase();
                      const hasPersonalMemoryAccess = tier === "builder" || tier === "pro" || tier === "architect";
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
                              Control how Arx suggests and stores personal memory.
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
                              When enabled, Arx may save useful preferences/facts to your personal memory. You can delete anything later.
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
                        {([
                          { id: "light", label: "Light", description: "Default light theme", disabled: false },
                          { id: "dark", label: "Dark", description: "Default dark theme", disabled: false },
                          { id: "dark-warm", label: "Dark (Warm)", description: "Warm obsidian + champagne gold", disabled: false },
                          { id: "polynet", label: "Polynet Dark", description: "Monolithic surface + violet", disabled: false }
                        ] as const).map((theme) => (
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
		                                        : "Set VITE_ARX_DESKTOP_DOWNLOAD_URL to enable downloads in this build"
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
                        const inlineCommunityEvidence =
                          !isUser && communityEvidence ? communityEvidence.items.slice(0, 4) : [];
                        const hasContext = hasContextPayload(contextPayload);
                        const contextLabel = contextActionLabel(hasContext);
                        const inferenceSource = !isUser ? extractInferenceSourceFromContent(message.content_json) : null;
	                      const modelLabel = !isUser
	                        ? formatModelSignature(message.model_id ?? activeThread?.model_id ?? null, inferenceSource)
	                        : null;
	                      return (
	                        <div
	                          key={message.id}
                          className={isUser ? "message-item user" : "message-item assistant"}
                        >
                          <div className="message-text">
                            {isUser ? textContent : renderMarkdown(textContent, { onCopyCode: copyTextToClipboard })}
                          </div>
                          {!isUser && inlineCommunityEvidence.length > 0 && (
                            <CommunityEvidenceCitations
                              items={inlineCommunityEvidence}
                              onChipClick={() => {
                                openMessageContextModal(contextPayload, setContextModal);
                              }}
                              actionTitle="Open source details"
                            />
                          )}
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
                                <MessageContextAction
                                  disabled={!hasContext}
                                  onClick={() => {
                                    openMessageContextModal(contextPayload, setContextModal);
                                  }}
                                  title={contextLabel}
                                  ariaLabel={contextLabel}
                                />
                                {canRegenerateLastThreadTurn && message.id === lastThreadAssistantMessageId && (
                                  <MessageRegenerateAction
                                    onClick={() => {
                                      void regenerateLastTurn();
                                    }}
                                    title="Regenerate"
                                    ariaLabel="Regenerate"
                                  />
                                )}
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
                            {streamingMeta && (
                              (() => {
                                const streamingContextPayload = buildMessageContextModalPayload<
                                  MemoryUsedItem,
                                  HistoryUsedItem,
                                  MemorySuggestion
                                >({
                                  memoryUsed: streamingMeta.memory_used,
                                  historyUsed: streamingMeta.history_used,
                                  memorySuggestions: [],
                                  memoryAdded: [],
                                  communityEvidence: streamingMeta.community_evidence_used ?? null,
                                });
                                const hasStreamingContext = hasContextPayload(streamingContextPayload);
                                const streamingContextLabel = contextActionLabel(hasStreamingContext);
                                return (
                                  <MessageFooter
                                    metaLabel={formatModelSignature(
                                      streamingMeta.model_id ?? activeThread?.model_id ?? null,
                                      streamingMeta.inference_source ?? null,
                                    )}
                                  >
                                    <MessageContextAction
                                      disabled={!hasStreamingContext}
                                      onClick={() => {
                                        openMessageContextModal(streamingContextPayload, setContextModal);
                                      }}
                                      title={streamingContextLabel}
                                      ariaLabel={streamingContextLabel}
                                    />
                                  </MessageFooter>
                                );
                              })()
                            )}
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
	                    <div className="ask-model" ref={modelPickerRef}>
	                      <button
	                        className="ask-model-btn"
	                        type="button"
	                        aria-haspopup="dialog"
	                        aria-expanded={isModelPickerOpen}
	                        onClick={() => (isModelPickerOpen ? closeModelPicker() : openModelPicker())}
	                        disabled={curatedPickerModels.length === 0}
	                        title="Model"
	                      >
	                        <span className="ask-model-label">{activeModelLabel}</span>
	                        <svg className="ask-model-chevron" viewBox="0 0 24 24" aria-hidden="true">
	                          <path d="M6 9l6 6 6-6" />
	                        </svg>
	                      </button>
	                      {isModelPickerOpen && (
	                        <div
	                          className="model-picker-popover"
	                          role="dialog"
	                          aria-label="Choose a model"
	                        >
	                          <div className="model-picker-modal">
	                            <div className="model-picker-search-row">
	                              <input
	                                ref={modelPickerSearchRef}
	                                className="model-picker-search"
	                                type="text"
	                                placeholder="Search models…"
	                                value={modelPickerQuery}
	                                onChange={(event) => setModelPickerQuery(event.target.value)}
	                              />
	                              <button
	                                className="model-picker-close"
	                                type="button"
	                                onClick={closeModelPicker}
	                                aria-label="Close model picker"
	                                title="Close"
	                              >
	                                <svg viewBox="0 0 24 24" aria-hidden="true">
	                                  <path d="M18 6L6 18M6 6l12 12" />
	                                </svg>
	                              </button>
	                            </div>

		                            <div className="model-picker-body">
	                              <nav className="model-picker-nav" aria-label="Model sections">
	                                {(
	                                  [
	                                    {
	                                      id: "all",
	                                      label: "All",
	                                      icon: (
	                                        <svg viewBox="0 0 24 24" aria-hidden="true">
	                                          <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
	                                        </svg>
	                                      ),
	                                    },
	                                    {
	                                      id: "free",
	                                      label: "Free",
	                                      icon: (
	                                        <svg viewBox="0 0 24 24" aria-hidden="true">
	                                          <path d="M20 12v10H4V12" />
	                                          <path d="M2 7h20v5H2z" />
	                                          <path d="M12 22V7" />
	                                          <path d="M12 7c-2.2 0-4-1.8-4-4 2.2 0 4 1.8 4 4z" />
	                                          <path d="M12 7c2.2 0 4-1.8 4-4-2.2 0-4 1.8-4 4z" />
	                                        </svg>
	                                      ),
		                                    },
		                                    {
		                                      id: "openai",
		                                      label: "OpenAI",
		                                      icon: (
		                                        <span className="model-picker-nav-logo">
		                                          <img className="model-picker-nav-logo-img monochrome" src={openAiLogo} alt="" />
		                                        </span>
		                                      ),
		                                    },
		                                    {
		                                      id: "anthropic",
		                                      label: "Anthropic",
		                                      icon: (
		                                        <span className="model-picker-nav-logo">
		                                          <img className="model-picker-nav-logo-img monochrome" src={anthropicLogo} alt="" />
		                                        </span>
		                                      ),
		                                    },
			                                    {
			                                      id: "google",
			                                      label: "Google",
			                                      icon: (
			                                        <span className="model-picker-nav-logo">
			                                          <img className="model-picker-nav-logo-img monochrome" src={googleLogo} alt="" />
			                                        </span>
			                                      ),
			                                    },
		                                    {
		                                      id: "x-ai",
		                                      label: "xAI",
		                                      icon: (
		                                        <span className="model-picker-nav-logo">
		                                          <img className="model-picker-nav-logo-img monochrome" src={xAiLogo} alt="" />
		                                        </span>
		                                      ),
		                                    },
		                                    {
		                                      id: "openrouter",
		                                      label: "OpenRouter",
		                                      icon: (
		                                        <span className="model-picker-nav-logo">
		                                          <img className="model-picker-nav-logo-img monochrome" src={openRouterLogo} alt="" />
		                                        </span>
		                                      ),
		                                    },
		                                  ] as Array<{ id: ModelSectionId; label: string; icon: ReactNode; filled?: boolean }>
		                                ).map((section) => (
		                                  <button
		                                    key={section.id}
	                                    className={
	                                      modelPickerSection === section.id
	                                        ? `model-picker-nav-btn${section.filled ? " filled" : ""} active`
	                                        : `model-picker-nav-btn${section.filled ? " filled" : ""}`
	                                    }
	                                    type="button"
	                                    aria-pressed={modelPickerSection === section.id}
	                                    aria-label={section.label}
	                                    title={section.label}
	                                    onClick={() => setModelPickerSection(section.id)}
	                                  >
	                                    <span className="model-picker-nav-icon" aria-hidden="true">
	                                      {section.icon}
	                                    </span>
	                                  </button>
	                                ))}
	                              </nav>
	                              <div className="model-picker-list" role="list">
	                                {(() => {
	                                  const sectionLabels: Record<string, string> = {
	                                    free: "Free", openai: "OpenAI", anthropic: "Anthropic",
	                                    google: "Google", "x-ai": "xAI", openrouter: "OpenRouter",
	                                  };
	                                  let lastSection = "";
	                                  return visiblePickerModels.map((model) => {
	                                    const isSelected = model.id === selectedPickerModelId;
	                                    const selectable = canSelectPickerModel(model);
	                                    const isModelEnabled = modelToggles.some((toggle) => toggle.id === model.id);
	                                    const requiresPaidPlan = model.access !== "guest";
	                                    const showPremiumBadge = requiresPaidPlan && !hasPaidAccess;
	                                    const lockedLabel = model.access === "guest"
	                                      ? "Free"
	                                      : !showPremiumBadge && !supabaseSession
	                                          ? "Sign in"
	                                          : !showPremiumBadge && !isModelEnabled
	                                            ? "Soon"
	                                            : null;
	                                    const showGroupHeader = modelPickerSection === "all" && model.section !== lastSection && sectionLabels[model.section];
	                                    if (model.section !== lastSection) lastSection = model.section;
	                                    return (
	                                      <Fragment key={model.id}>
	                                        {showGroupHeader && (
	                                          <div className="model-picker-group-header">{sectionLabels[model.section]}</div>
	                                        )}
	                                        <div
	                                          className={
	                                            "model-picker-row" +
	                                            (isSelected ? " selected" : "") +
	                                            (!selectable ? " locked" : "")
	                                          }
	                                        >
	                                          <button
	                                            className="model-picker-row-main"
	                                            type="button"
	                                            onClick={() => handleSelectPickerModel(model)}
	                                            aria-current={isSelected ? "true" : undefined}
	                                          >
	                                            <div className="model-picker-row-info">
	                                              <div className="model-picker-row-title">
	                                                {model.label}
	                                                {showPremiumBadge && (
	                                                  <span className="model-picker-row-crown" title="Premium model" aria-label="Premium model">
	                                                    <svg viewBox="0 0 24 24" aria-hidden="true">
	                                                      <path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 13H5L3 7z" />
	                                                      <path d="M8 17h8" />
	                                                    </svg>
	                                                  </span>
	                                                )}
	                                                {lockedLabel && (
	                                                  <span className="model-picker-row-pill">{lockedLabel}</span>
	                                                )}
	                                              </div>
	                                              {model.description && (
	                                                <div className="model-picker-row-subtitle">{model.description}</div>
	                                              )}
	                                            </div>
	                                            <span className="model-picker-row-check" aria-hidden="true">
	                                              <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
	                                            </span>
	                                          </button>
	                                        </div>
	                                      </Fragment>
	                                    );
	                                  });
	                                })()}
	                              </div>
	                            </div>
	                          </div>
	                        </div>
	                      )}
	                    </div>
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
	                            const description =
	                              community.description && community.description.trim().length > 0
	                                ? community.description
	                                : "No description yet.";
                              const canActivate = alreadyMember || Boolean(community.slug);
	                            return (
	                              <div
	                                key={community.slug}
	                                className={`discover-card${canActivate ? " clickable" : ""}`}
	                                role={canActivate ? "button" : undefined}
	                                tabIndex={canActivate ? 0 : -1}
	                                aria-label={
	                                  canActivate
	                                    ? alreadyMember
	                                      ? `Open ${community.name}`
	                                      : `View ${community.name}`
	                                    : undefined
	                                }
		                                onClick={() => {
		                                  if (!canActivate) return;
		                                  if (alreadyMember) {
		                                    if (!memberCommunity) return;
		                                    if (!confirmDiscardUnsavedCommunitySettings(memberCommunity.id)) return;
                                    pushNavSnapshot();
		                                    setActiveView("home");
		                                    setActiveCommunityId(memberCommunity.id);
		                                    setActivePage("community");
		                                    setCommunityTab("chat");
		                                    return;
	                                  }
	                                  if (!community.slug) return;
	                                  navigateTo(`/c/${encodeURIComponent(community.slug)}`);
	                                }}
		                                onKeyDown={(event) => {
		                                  if (!canActivate) return;
		                                  if (event.key !== "Enter" && event.key !== " ") return;
		                                  event.preventDefault();
		                                  if (alreadyMember) {
		                                    if (!memberCommunity) return;
		                                    if (!confirmDiscardUnsavedCommunitySettings(memberCommunity.id)) return;
                                    pushNavSnapshot();
		                                    setActiveView("home");
		                                    setActiveCommunityId(memberCommunity.id);
		                                    setActivePage("community");
		                                    setCommunityTab("chat");
		                                    return;
	                                  }
	                                  if (!community.slug) return;
	                                  navigateTo(`/c/${encodeURIComponent(community.slug)}`);
	                                }}
	                              >
	                                <div className="discover-card-banner">
	                                  {community.banner_url ? (
	                                    <img
	                                      className="discover-card-banner-img"
	                                      src={community.banner_url}
	                                      alt=""
	                                      loading="lazy"
	                                      decoding="async"
	                                    />
	                                  ) : null}
	                                </div>
	                                <div className="discover-card-body">
	                                  <div className="discover-card-header">
	                                    {community.avatar_url ? (
	                                      <img
	                                        className="discover-card-avatar"
	                                        src={community.avatar_url}
	                                        alt={community.name}
	                                        loading="lazy"
	                                      />
	                                    ) : (
	                                      <div className="discover-card-avatar fallback">
	                                        {communityInitials(community.name)}
	                                      </div>
	                                    )}
	                                      <div className="discover-card-meta">
	                                      <div className="discover-card-name-row">
	                                        <div className="discover-card-name">{community.name}</div>
	                                        <span className="discover-tag price">{priceLabel}</span>
                                        <span className={`discover-visibility-icon ${community.visibility ?? "unlisted"}`} title={visibilityLabel}>
                                          {isPublishedCommunityVisibility(community.visibility) ? (
	                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
	                                              <circle cx="12" cy="12" r="10" />
	                                              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
	                                            </svg>
	                                          ) : (
	                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
	                                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
	                                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
	                                            </svg>
	                                          )}
	                                        </span>
	                                      </div>
	                                      {community.slug && <div className="discover-card-slug">/{community.slug}</div>}
	                                    </div>
	                                  </div>
	                                  <div className="discover-card-desc">{description}</div>
	                                </div>
	                              </div>
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
                                const showMeta = shouldShowSender(communityMessages, index);
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
			                    <div className="settings-panel community-settings-panel">
				                      {!activeCommunity ? (
				                        <div className="chat-empty">Select a community to view settings.</div>
				                      ) : !supabaseSession ? (
				                        <div className="chat-empty">
				                          <div>Sign in to view community settings.</div>
				                          <button
				                            className="secondary"
				                            type="button"
				                            onClick={openAuthGate}
				                            style={{ marginTop: 12 }}
				                          >
				                            Sign in
				                          </button>
				                        </div>
				                      ) : !canViewActiveCommunitySettings ? (
				                        <div className="chat-empty">Join this community to view settings.</div>
				                      ) : canManageMembersActiveCommunity ? (
			                        <>
			                          <div className="create-community-form community-settings-form">
			                            <div className="settings-section">
				                              <div className="settings-section-title">Branding</div>
				                              <div
				                                className={`create-community-banner${isSettingsBannerDragOver ? " drag-over" : ""}`}
				                                aria-busy={isProcessingCommunitySettingsBanner || undefined}
				                                onDragOver={(event) => {
				                                  event.preventDefault();
				                                  setIsSettingsBannerDragOver(true);
				                                }}
				                                onDragLeave={() => setIsSettingsBannerDragOver(false)}
				                                onDrop={handleSettingsBannerDrop}
				                              >
				                                {communitySettingsBannerUrl ? (
				                                  <img src={communitySettingsBannerUrl} alt="Community banner preview" />
				                                ) : (
				                                  <div className="create-community-banner-placeholder">Banner preview</div>
				                                )}
				                                <label
				                                  className={`create-banner-btn${isProcessingCommunitySettingsBanner ? " disabled" : ""}`}
				                                >
				                                  Upload banner
				                                  <input
				                                    type="file"
				                                    accept="image/*"
				                                    disabled={isProcessingCommunitySettingsBanner}
				                                    onChange={(event) => {
				                                      const file = event.target.files?.[0] ?? null;
				                                      event.target.value = "";
				                                      void handleCommunityBannerUpload(file);
				                                    }}
				                                  />
				                                </label>
				                                {communitySettingsBannerUrl && (
				                                  <button
				                                    className="create-banner-remove"
				                                    type="button"
				                                    disabled={isProcessingCommunitySettingsBanner}
				                                    onClick={() => {
				                                      setCommunitySettingsBannerUrl(null);
				                                      setCommunitySettingsBannerUploadError(null);
				                                      markCommunitySettingsDirty();
				                                    }}
				                                  >
				                                    Remove
				                                  </button>
				                                )}
				                                {isProcessingCommunitySettingsBanner && (
				                                  <div className="create-upload-status">Processing banner…</div>
				                                )}
				                                {communitySettingsBannerUploadError && (
				                                  <div className="auth-error">{communitySettingsBannerUploadError}</div>
				                                )}
				                              </div>
			                              <div className="create-community-avatar-row">
			                                <div
			                                  className={`create-community-avatar${isSettingsAvatarDragOver ? " drag-over" : ""}`}
			                                  onDragOver={(event) => {
			                                    event.preventDefault();
			                                    setIsSettingsAvatarDragOver(true);
			                                  }}
			                                  onDragLeave={() => setIsSettingsAvatarDragOver(false)}
			                                  onDrop={handleSettingsAvatarDrop}
			                                >
			                                  {communitySettingsAvatarUrl ? (
			                                    <img src={communitySettingsAvatarUrl} alt="Community avatar preview" />
			                                  ) : (
			                                    <span>
			                                      {communityInitials(
			                                        communitySettingsName || activeCommunity?.name || "Community"
			                                      )}
			                                    </span>
			                                  )}
			                                </div>
			                                <div className="create-community-avatar-actions">
			                                  <label className="create-avatar-btn">
			                                    Upload avatar
			                                    <input
			                                      type="file"
			                                      accept="image/*"
			                                      onChange={(event) => {
			                                        const file = event.target.files?.[0] ?? null;
			                                        event.target.value = "";
			                                        void handleCommunityAvatarUpload(file);
			                                      }}
			                                    />
			                                  </label>
			                                  {communitySettingsAvatarUrl && (
			                                    <button
			                                      className="create-avatar-remove"
			                                      type="button"
			                                      onClick={() => {
			                                        setCommunitySettingsAvatarUrl(null);
			                                        markCommunitySettingsDirty();
			                                      }}
			                                    >
			                                      Remove
			                                    </button>
			                                  )}
			                                </div>
			                              </div>
			                              <label className="create-community-field">
			                                <span>Name</span>
			                                <input
			                                  type="text"
			                                  placeholder="Community name"
			                                  value={communitySettingsName}
			                                  onChange={(event) => {
			                                    setCommunitySettingsName(event.target.value);
			                                    markCommunitySettingsDirty();
			                                  }}
			                                />
			                              </label>
			                              <label className="create-community-field">
			                                <span>Slug</span>
			                                <input
			                                  type="text"
			                                  placeholder="your-community"
			                                  value={communitySettingsSlug}
			                                  maxLength={32}
			                                  onChange={(event) => {
			                                    setCommunitySettingsSlug(slugifyCommunityName(event.target.value));
			                                    markCommunitySettingsDirty();
			                                  }}
			                                />
			                                <span className="create-community-hint">
			                                  {`arx.com/c/${communitySettingsSlug.trim() || "your-community"}`}
			                                </span>
			                              </label>
			                            </div>

			                            <div className="settings-section">
			                              <label className="create-community-field">
			                                <span>Description</span>
			                                <textarea
			                                  placeholder="Optional description for your community page"
			                                  rows={3}
			                                  value={communitySettingsDescription}
			                                  onChange={(event) => {
			                                    setCommunitySettingsDescription(event.target.value);
			                                    markCommunitySettingsDirty();
			                                  }}
			                                />
			                              </label>
			                            </div>

			                            <div className="settings-section">
			                              <div className="settings-section-title">Access</div>
			                              <label className="create-community-field">
			                                <span>Visibility</span>
			                                <select
			                                  className="select-styled"
			                                  value={communitySettingsVisibility}
			                                  onChange={(event) => {
			                                    setCommunitySettingsVisibility(event.target.value);
			                                    markCommunitySettingsDirty();
			                                  }}
			                                >
                                  <option value="published">Published</option>
                                  <option value="unlisted">Unlisted</option>
                                </select>
					                                <span className="create-community-hint">
					                                  {communitySettingsVisibility === "published"
					                                    ? "Discoverable. Anyone can preview chat and join to participate."
					                                    : "Not listed in discovery. Share the link when you're ready."}
					                                </span>
				                              </label>
			                              <div className="create-community-field">
			                                <span>Pricing</span>
			                                <div className="analytics-range-toggle" role="tablist" aria-label="Pricing options">
			                                  {(
			                                    [
			                                      { key: "free", label: "Free" },
			                                      { key: "monthly", label: "Monthly" },
			                                      { key: "yearly", label: "Annual" },
			                                      { key: "both", label: "Both" },
			                                    ] as Array<{ key: CommunityPricingMode; label: string }>
			                                  ).map((opt) => (
				                                    <button
				                                      key={opt.key}
				                                      type="button"
				                                      className={`analytics-range-btn${
				                                        communitySettingsPricingMode === opt.key ? " active" : ""
				                                      }`}
				                                      onClick={() => {
				                                        setCommunitySettingsPricingMode(opt.key);
				                                        communityPricingDirtyRef.current = true;
				                                        markCommunitySettingsDirty();
				                                      }}
				                                    >
				                                      {opt.label}
				                                    </button>
			                                  ))}
			                                </div>
			                                <span className="create-community-hint">
			                                  Choose what billing options members see at checkout.
			                                </span>
			                              </div>
			                              {(communitySettingsPricingMode === "monthly" ||
			                                communitySettingsPricingMode === "both") && (
			                                <label className="create-community-field">
			                                  <span>Monthly price (USD)</span>
			                                  <input
			                                    type="text"
                                    inputMode="decimal"
			                                    placeholder="29"
				                                    value={communitySettingsPriceUsdMonthly}
				                                    onChange={(event) => {
				                                      setCommunitySettingsPriceUsdMonthly(event.target.value);
				                                      communityPricingDirtyRef.current = true;
				                                      markCommunitySettingsDirty();
				                                    }}
				                                  />
			                                  <span className="create-community-hint">Billed monthly.</span>
			                                </label>
			                              )}
			                              {(communitySettingsPricingMode === "yearly" ||
			                                communitySettingsPricingMode === "both") && (
			                                <label className="create-community-field">
			                                  <span>Annual price (USD)</span>
			                                  <input
			                                    type="text"
                                    inputMode="decimal"
			                                    placeholder="290"
				                                    value={communitySettingsPriceUsdYearly}
				                                    onChange={(event) => {
				                                      setCommunitySettingsPriceUsdYearly(event.target.value);
				                                      communityPricingDirtyRef.current = true;
				                                      markCommunitySettingsDirty();
				                                    }}
				                                  />
			                                  <span className="create-community-hint">Billed yearly.</span>
			                                </label>
			                              )}
                                <div className="create-community-field">
                                  <span>Payouts</span>
                                  <div className="auth-actions" style={{ paddingLeft: 0 }}>
                                    {builderBillingStatus?.has_payouts ? (
                                      <button type="button" className="secondary" disabled>
                                        Payouts connected
                                      </button>
	                                    ) : (
	                                      <button
	                                        type="button"
	                                        onClick={() => void startConnectOnboarding()}
	                                        disabled={isStartingConnectOnboarding}
	                                        className="stripe-connect-btn"
	                                      >
		                                        <svg
		                                          className="stripe-connect-icon"
		                                          viewBox="0 0 24 24"
		                                          aria-hidden="true"
		                                          focusable="false"
		                                        >
		                                          <rect x="2" y="2" width="20" height="20" rx="6" fill="#635BFF" />
		                                          <path
		                                            fill="#FFFFFF"
		                                            d="M14.85 9.14c-.84-.44-1.82-.66-2.78-.66-1.44 0-2.24.54-2.24 1.25 0 .78.84 1.12 2.35 1.46 2.2.5 3.34 1.24 3.34 2.9 0 1.76-1.5 2.95-4.03 2.95-1.38 0-2.66-.34-3.64-.93l.66-1.56c.98.58 2.04.88 3.06.88 1.5 0 2.34-.54 2.34-1.37 0-.78-.74-1.16-2.36-1.52-2.18-.5-3.33-1.24-3.33-2.87 0-1.66 1.5-2.87 3.9-2.87 1.3 0 2.5.28 3.48.74l-.7 1.6z"
		                                          />
		                                        </svg>
	                                        <span>{isStartingConnectOnboarding ? "Opening…" : "Connect with Stripe"}</span>
	                                      </button>
	                                    )}
                                  </div>
                                  <span className="create-community-hint">
                                    Connect Stripe to receive payouts from paid memberships.
                                  </span>
                                </div>
				                            </div>

				                            {communitySettingsError && <div className="auth-error">{communitySettingsError}</div>}
					                            <div className="create-community-actions">
				                              <button
				                                onClick={() => void handleSaveCommunitySettings()}
				                                disabled={isSavingCommunitySettings || isProcessingCommunitySettingsBanner}
				                              >
				                                {isSavingCommunitySettings
				                                  ? "Saving..."
				                                  : isProcessingCommunitySettingsBanner
				                                    ? "Processing banner…"
				                                    : "Save changes"}
				                              </button>
				                            </div>
                                    {isActiveCommunityOwner && (
                                      <div className="settings-section" style={{ marginTop: 18 }}>
                                        <div className="settings-section-title">Danger zone</div>
                                        <div className="settings-section-desc">
                                          Permanently delete this community and all associated data.
                                        </div>
                                        <button
                                          type="button"
                                          className="danger delete-community-btn"
                                          onClick={openDeleteCommunityModal}
                                          disabled={isSavingCommunitySettings || isProcessingCommunitySettingsBanner}
                                        >
                                          Delete community
                                        </button>
                                      </div>
                                    )}
			                          </div>
			                        </>
			                      ) : (
			                        <>
			                          <div className="panel-title">Community</div>
		                          <div className="settings-section">
		                            <div className="settings-section-title">Access</div>
		                            <div className="settings-section-desc">
		                              Your role and entitlement status for this community.
		                            </div>
		                            <div className="model-list analytics-kpis">
		                              {[
		                                {
		                                  label: "Role",
		                                  value: activeCommunityAccess?.effective_role
		                                    ? activeCommunityAccess.effective_role
		                                    : "member",
		                                },
		                                {
		                                  label: "Entitlement ends",
		                                  value: activeCommunityAccess?.entitlement_ends_at
		                                    ? formatChatTime(activeCommunityAccess.entitlement_ends_at)
		                                    : "—",
		                                },
		                              ].map((row) => (
		                                <div key={row.label} className="model-toggle analytics-kpi">
		                                  <span>{row.label}</span>
		                                  <span className="analytics-kpi-value">{row.value}</span>
		                                </div>
		                              ))}
		                            </div>
		                            <div className="model-note">
		                              Only owners and admins can edit community details right now.
		                            </div>
		                          </div>
		                          <div className="settings-section">
		                            <div className="settings-section-title">About</div>
		                            <div className="model-list analytics-kpis">
		                              {[
		                                { label: "Name", value: activeCommunity.name },
		                                { label: "Slug", value: activeCommunity.slug },
                                { label: "Visibility", value: formatCommunityVisibilityLabel(activeCommunity.visibility) },
		                              ].map((row) => (
		                                <div key={row.label} className="model-toggle analytics-kpi">
		                                  <span>{row.label}</span>
		                                  <span className="analytics-kpi-value">{row.value}</span>
		                                </div>
		                              ))}
		                            </div>
		                            {activeCommunity.description && (
		                              <div className="model-note">{activeCommunity.description}</div>
		                            )}
		                          </div>
		                          <div className="settings-section">
		                            <div className="settings-section-title">You</div>
		                            <div className="model-list">
		                              <label className="model-toggle">
		                                <span>Mute community</span>
		                                <input
		                                  type="checkbox"
		                                  checked={communityMemberMuted}
		                                  disabled={isLoadingCommunityMemberSettings || isLeavingCommunity}
		                                  onChange={(event) => void handleToggleCommunityMute(event.target.checked)}
		                                />
		                              </label>
		                            </div>
		                            <div className="model-note">
		                              Muted communities won't send notifications (when notifications ship).
		                            </div>
		                            {!activeCommunityAccess?.is_owner && (
		                              <div className="create-community-actions" style={{ marginTop: 12 }}>
		                                <button
		                                  className="danger"
		                                  type="button"
		                                  disabled={isLeavingCommunity || isLoadingCommunityMemberSettings}
		                                  onClick={() => void handleLeaveCommunity()}
		                                >
		                                  {isLeavingCommunity ? "Leaving…" : "Leave community"}
		                                </button>
		                              </div>
		                            )}
		                            {communityMemberSettingsError && (
		                              <div className="auth-error" style={{ marginTop: 10 }}>
		                                {communityMemberSettingsError}
		                              </div>
		                            )}
		                          </div>
		                        </>
		                      )}
	                    </div>
	                  )}

                  {communityTab === "ai_agent" && (
                    <div className="settings-panel community-settings-panel">
                      {!activeCommunity ? (
                        <div className="chat-empty">Select a community to configure the AI agent.</div>
                      ) : !supabaseSession ? (
                        <div className="chat-empty">
                          <div>Sign in to configure the AI agent.</div>
                          <button
                            className="secondary"
                            type="button"
                            onClick={openAuthGate}
                            style={{ marginTop: 12 }}
                          >
                            Sign in
                          </button>
                        </div>
                      ) : !canManageMembersActiveCommunity ? (
                        <div className="chat-empty">Only owners and admins can configure the AI agent.</div>
                      ) : isLoadingCommunityAgentDrafts ? (
                        <div className="chat-empty">Loading…</div>
                      ) : communityAgentDraftsError &&
                        communityAgentDraftsError.toLowerCase().includes("pro_plan_required") ? (
                        <>
                          {(() => {
                            const previewLanding = DEFAULT_EMPTY_THREAD_LANDING;
                            const previewTab = previewLanding.tabs[0];
                            const previewPrompts = previewTab?.prompts ?? [];

                            return (
                              <div className="premium-gate-shell">
                                <div className="premium-gate-blur" aria-hidden="true">
                                  <div className="agent-editor-grid">
                                    <div className="settings-section">
                                      <div className="settings-section-title">Templates</div>
                                      <label className="create-community-field" style={{ marginTop: 10 }}>
                                        <span>Template</span>
                                        <select className="select-styled" disabled>
                                          <option>Template 1 (Live)</option>
                                          <option>Template 2</option>
                                          <option>Template 3</option>
                                        </select>
                                      </label>
                                      <div className="model-note" style={{ marginTop: 12 }}>
                                        Set your empty-thread landing prompts and a community system prompt.
                                      </div>
                                      <div className="model-list" style={{ marginTop: 12 }}>
                                        <label className="model-field">
                                          <span>System prompt</span>
                                          <textarea value={"You are the community assistant."} readOnly rows={3} />
                                        </label>
                                      </div>
                                    </div>

                                    <div className="agent-editor-preview">
                                      <div className="agent-preview-shell" aria-label="Preview">
                                        <div className="web-empty-thread-title">{previewLanding.title}</div>
                                        <div className="web-empty-thread-subtitle">{previewLanding.subtitle}</div>
                                        {previewLanding.tabs.length > 1 && (
                                          <div className="web-starter-tabs" role="tablist" aria-label="Preview tabs">
                                            {previewLanding.tabs.map((tab) => (
                                              <button
                                                key={tab.id}
                                                type="button"
                                                className={`web-starter-tab${tab.id === previewTab?.id ? " active" : ""}`}
                                                aria-pressed={tab.id === previewTab?.id}
                                              >
                                                {tab.label}
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                        <div className="web-starter-list" role="list">
                                          {previewPrompts.map((prompt) => (
                                            <div key={prompt} className="web-starter-row is-preview" role="listitem">
                                              <span className="web-starter-row-text">{prompt}</span>
                                              <span className="web-starter-row-arrow" aria-hidden="true">
                                                <svg viewBox="0 0 24 24">
                                                  <path d="M9 18l6-6-6-6" />
                                                </svg>
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="premium-gate-overlay">
                                  <div className="premium-gate-card">
                                    <div className="premium-gate-eyebrow">ARCHITECT</div>
                                    <div className="premium-gate-title">For Architect members only</div>
                                    <div className="model-note" style={{ marginTop: 8 }}>
                                      Upgrade to Architect ($100/mo) to customize the empty-thread landing page and a
                                      community system prompt.
                                    </div>
                                    {isActiveCommunityOwner ? (
                                      <div className="create-community-actions" style={{ marginTop: 12 }}>
                                        <button
                                          className="premium-gate-cta"
                                          type="button"
                                          onClick={() => {
                                            setBuilderUpgradeContext("builder");
                                            setIsBuilderUpgradeOpen(true);
                                          }}
                                        >
                                          Upgrade to Architect
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="model-note" style={{ marginTop: 12 }}>
                                        Ask the community owner to upgrade to Architect.
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      ) : communityAgentDraftsError ? (
                        <div className="auth-error">{communityAgentDraftsError}</div>
                      ) : (
                        <>
                          {(() => {
                            const savedRow =
                              communityAgentDrafts.find((d) => d.slot === communityAgentSelectedSlot) ?? null;
                            const canSetLive = Boolean(savedRow && !savedRow.is_active);
                            const previewLanding = communityAgentDraftLanding;
                            const previewTitle = previewLanding.title.trim()
                              ? previewLanding.title
                              : DEFAULT_EMPTY_THREAD_LANDING.title;
                            const previewSubtitle = previewLanding.subtitle.trim()
                              ? previewLanding.subtitle
                              : DEFAULT_EMPTY_THREAD_LANDING.subtitle;
                            const previewTabs = previewLanding.tabs.length ? previewLanding.tabs : DEFAULT_EMPTY_THREAD_LANDING.tabs;
                            const previewActiveTab =
                              previewTabs.find((t) => t.id === communityAgentPreviewTabId) ??
                              previewTabs[0];
                            const previewPrompts = previewActiveTab?.prompts ?? [];

                            return (
                              <>
                                <div className="agent-header-row">
                                  <div className="model-note">
                                    Customize what members see on a fresh chat (no messages) and set a community-wide
                                    system prompt.
                                  </div>

                                  {(() => {
                                    const usedSlots = new Set(communityAgentDrafts.map((d) => d.slot));
                                    const selectedSlotHasSavedRow = Boolean(savedRow);
                                    const reservedSlots = new Set(usedSlots);
                                    if (!selectedSlotHasSavedRow) reservedSlots.add(communityAgentSelectedSlot);
                                    const nextAvailableSlot =
                                      [1, 2, 3].find((slot) => !reservedSlots.has(slot)) ?? null;

                                  return (
                                      <div className="agent-template-picker" ref={communityAgentTemplatePickerRef}>
                                          {(() => {
                                            const selectedLabel =
                                              communityAgentDraftName.trim() ||
                                              communityAgentDrafts.find((d) => d.slot === communityAgentSelectedSlot)?.name?.trim() ||
                                              `Template ${communityAgentSelectedSlot}`;
                                            const selectedIsLive = Boolean(
                                              communityAgentDrafts.find((d) => d.slot === communityAgentSelectedSlot)?.is_active,
                                            );

                                            const menuSlots = Array.from(
                                              new Set([...communityAgentDrafts.map((d) => d.slot), communityAgentSelectedSlot]),
                                            ).sort((a, b) => a - b);

                                            const confirmDiscard = () => {
                                              if (!communityAgentDraftDirtyRef.current) return true;
                                              return window.confirm("Discard unsaved changes?");
                                            };

                                            const selectSlot = (slot: number) => {
                                              if (slot === communityAgentSelectedSlot) return;
                                              if (!confirmDiscard()) return;
                                              hydrateCommunityAgentEditor(slot, communityAgentDrafts);
                                            };

                                            return (
                                              <>
                                                <button
                                                  className="agent-template-btn"
                                                  type="button"
                                                  aria-haspopup="listbox"
                                                  aria-expanded={isCommunityAgentTemplateMenuOpen}
                                                  onClick={() =>
                                                    setIsCommunityAgentTemplateMenuOpen((prev) => !prev)
                                                  }
                                                >
                                                  <span className="agent-template-btn-text">
                                                    {selectedLabel}
                                                    {selectedIsLive ? " · Live" : ""}
                                                  </span>
                                                  <svg className="agent-template-chevron" viewBox="0 0 24 24" aria-hidden="true">
                                                    <path d="M6 9l6 6 6-6" />
                                                  </svg>
                                                </button>

                                                {isCommunityAgentTemplateMenuOpen && (
                                                  <div className="agent-template-menu" role="listbox" aria-label="Templates">
                                                    {menuSlots.map((slot) => {
                                                      const row =
                                                        communityAgentDrafts.find((d) => d.slot === slot) ?? null;
                                                      const isSelected = slot === communityAgentSelectedSlot;
                                                      const isLive = Boolean(row?.is_active);
                                                      const displayName =
                                                        (isSelected ? communityAgentDraftName : (row?.name ?? ""))?.trim() ||
                                                        `Template ${slot}`;
                                                      const isEditing = communityAgentRenamingSlot === slot;
                                                      const isSaved = communityAgentSavedSlot === slot;

                                                      return (
                                                        <div
                                                          key={slot}
                                                          role="option"
                                                          aria-selected={isSelected}
                                                          tabIndex={0}
                                                          className={`agent-template-option${isSelected ? " active" : ""}${
                                                            isEditing ? " editing" : ""
                                                          }`}
                                                          onClick={() => {
                                                            if (isEditing) return;
                                                            selectSlot(slot);
                                                            setIsCommunityAgentTemplateMenuOpen(false);
                                                          }}
                                                          onKeyDown={(event) => {
                                                            if (event.key === "Enter" || event.key === " ") {
                                                              event.preventDefault();
                                                              if (isEditing) return;
                                                              selectSlot(slot);
                                                              setIsCommunityAgentTemplateMenuOpen(false);
                                                            }
                                                          }}
                                                        >
                                                          <div className="agent-template-option-main">
                                                            <span className="agent-template-slot" aria-hidden="true">
                                                              {slot}
                                                            </span>
                                                            {isEditing ? (
                                                              <input
                                                                className="agent-template-name"
                                                                type="text"
                                                                value={communityAgentRenamingValue}
                                                                placeholder={displayName}
                                                                autoFocus
                                                                onClick={(event) => event.stopPropagation()}
                                                                onChange={(event) =>
                                                                  setCommunityAgentRenamingValue(event.target.value)
                                                                }
                                                                onKeyDown={(event) => {
                                                                  if (event.key === "Enter") {
                                                                    event.preventDefault();
                                                                    event.stopPropagation();
                                                                    void (async () => {
                                                                      const next = communityAgentRenamingValue.trim();
                                                                      const rowExists = Boolean(row);

                                                                      if (isSelected) {
                                                                        setCommunityAgentDraftName(next);
                                                                        if (!rowExists) {
                                                                          markCommunityAgentDraftDirty();
                                                                          setCommunityAgentRenamingSlot(null);
                                                                          setCommunityAgentRenamingValue("");
                                                                          return;
                                                                        }
                                                                        const ok = await persistCommunityAgentTemplateName(slot, next);
                                                                        if (!ok) return;
                                                                      } else {
                                                                        setCommunityAgentDrafts((prev) =>
                                                                          prev.map((d) =>
                                                                            d.slot === slot
                                                                              ? { ...d, name: next ? next : null }
                                                                              : d,
                                                                          ),
                                                                        );
                                                                        const ok = await persistCommunityAgentTemplateName(slot, next);
                                                                        if (!ok) return;
                                                                      }

                                                                      flashCommunityAgentTemplateSaved(slot);
                                                                      setCommunityAgentRenamingSlot(null);
                                                                      setCommunityAgentRenamingValue("");
                                                                    })();
                                                                  }
                                                                  if (event.key === "Escape") {
                                                                    event.preventDefault();
                                                                    event.stopPropagation();
                                                                    setCommunityAgentRenamingSlot(null);
                                                                    setCommunityAgentRenamingValue("");
                                                                  }
                                                                }}
                                                              />
                                                            ) : (
                                                              <span className="agent-template-name-text" title={displayName}>
                                                                {displayName}
                                                              </span>
                                                            )}
                                                          </div>
                                                          <div className="agent-template-option-right">
                                                            <div className="agent-template-badges" aria-hidden="true">
                                                              {isLive && (
                                                                <span className="agent-template-badge">LIVE</span>
                                                              )}
                                                            </div>
                                                            <div className="agent-template-actions">
                                                              {isEditing ? (
                                                                <button
                                                                  type="button"
                                                                  className="agent-template-save"
                                                                  onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    void (async () => {
                                                                      const next = communityAgentRenamingValue.trim();
                                                                      const rowExists = Boolean(row);

                                                                      if (isSelected) {
                                                                        setCommunityAgentDraftName(next);
                                                                        if (!rowExists) {
                                                                          markCommunityAgentDraftDirty();
                                                                          setCommunityAgentRenamingSlot(null);
                                                                          setCommunityAgentRenamingValue("");
                                                                          return;
                                                                        }
                                                                        const ok = await persistCommunityAgentTemplateName(slot, next);
                                                                        if (!ok) return;
                                                                      } else {
                                                                        setCommunityAgentDrafts((prev) =>
                                                                          prev.map((d) =>
                                                                            d.slot === slot
                                                                              ? { ...d, name: next ? next : null }
                                                                              : d,
                                                                          ),
                                                                        );
                                                                        const ok = await persistCommunityAgentTemplateName(slot, next);
                                                                        if (!ok) return;
                                                                      }

                                                                      flashCommunityAgentTemplateSaved(slot);
                                                                      setCommunityAgentRenamingSlot(null);
                                                                      setCommunityAgentRenamingValue("");
                                                                    })();
                                                                  }}
                                                                >
                                                                  Save
                                                                </button>
                                                              ) : isSaved ? (
                                                                <span className="agent-template-saved" aria-label="Saved">
                                                                  Saved
                                                                </span>
                                                              ) : (
                                                                <button
                                                                  type="button"
                                                                  className="agent-template-action"
                                                                  title="Rename"
                                                                  onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    setCommunityAgentRenamingSlot(slot);
                                                                    setCommunityAgentRenamingValue(
                                                                      (isSelected ? communityAgentDraftName : (row?.name ?? "")) ??
                                                                        "",
                                                                    );
                                                                  }}
                                                                >
                                                                  <svg viewBox="0 0 24 24">
                                                                    <path d="M12 20h9" />
                                                                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                                                                  </svg>
                                                                </button>
                                                              )}
                                                            </div>
                                                          </div>
                                                        </div>
                                                      );
                                                    })}
                                                    {nextAvailableSlot && (
                                                      <button
                                                        type="button"
                                                        className="agent-template-new"
                                                        onClick={() => {
                                                          if (!confirmDiscard()) return;
                                                          hydrateCommunityAgentEditor(nextAvailableSlot, communityAgentDrafts);
                                                          setIsCommunityAgentTemplateMenuOpen(false);
                                                        }}
                                                      >
                                                        + New template
                                                      </button>
                                                    )}
                                                  </div>
                                                )}
                                              </>
                                            );
                                          })()}
                                      </div>
                                    );
                                  })()}
                                </div>

                                {communityAgentDraftSaveError && (
                                  <div className="auth-error" style={{ marginTop: 10 }}>
                                    {communityAgentDraftSaveError}
                                  </div>
                                )}

                                <div className="settings-section">
                                  <div className="settings-section-title">Landing page (empty chat)</div>
                                  <div className="agent-preview-editor">
                                    <div className="agent-preview-actions">
                                      {(() => {
                                        const row =
                                          communityAgentDrafts.find((d) => d.slot === communityAgentSelectedSlot) ?? null;
                                        const isUnsaved = !row || communityAgentDraftDirtyRef.current;
                                        if (!isUnsaved) return null;
                                        return <span className="agent-unsaved-badge">UNSAVED</span>;
                                      })()}
                                      <button
                                        type="button"
                                        onClick={() => void handleSaveCommunityAgentDraft()}
                                        disabled={isSavingCommunityAgentDraft}
                                      >
                                        {isSavingCommunityAgentDraft ? "Saving…" : "Save draft"}
                                      </button>
                                      <button
                                        className="secondary"
                                        type="button"
                                        disabled={!savedRow || !canSetLive || isSavingCommunityAgentDraft}
                                        onClick={() => {
                                          const ok = window.confirm("Set this draft live for all members?");
                                          if (!ok) return;
                                          void handleSetLiveCommunityAgentDraft();
                                        }}
                                      >
                                        {savedRow?.is_active ? "Live" : "Set live"}
                                      </button>
                                    </div>

                                    <div
                                      className="agent-preview-shell agent-preview-shell-editable"
                                      aria-label="Preview"
                                    >
                                      {communityAgentLandingEdit?.kind === "title" ? (
                                        <input
                                          className="web-empty-thread-title-input"
                                          type="text"
                                          autoFocus
                                          value={communityAgentLandingEditValue}
                                          placeholder={DEFAULT_EMPTY_THREAD_LANDING.title}
                                          onChange={(event) => setCommunityAgentLandingEditValue(event.target.value)}
                                          onBlur={() => {
                                            const next = communityAgentLandingEditValue;
                                            if (next !== previewLanding.title) {
                                              setCommunityAgentDraftLanding((prev) => ({
                                                ...prev,
                                                title: next,
                                              }));
                                              markCommunityAgentDraftDirty();
                                            }
                                            clearCommunityAgentLandingEdit();
                                          }}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                              event.preventDefault();
                                              (event.currentTarget as HTMLInputElement).blur();
                                            }
                                            if (event.key === "Escape") {
                                              event.preventDefault();
                                              clearCommunityAgentLandingEdit();
                                            }
                                          }}
                                        />
                                      ) : (
                                        <button
                                          type="button"
                                          className={`web-empty-thread-title web-empty-thread-editable${
                                            previewLanding.title.trim() ? "" : " is-placeholder"
                                          }`}
                                          title="Click to edit"
                                          onClick={() =>
                                            beginCommunityAgentLandingEdit(
                                              { kind: "title" },
                                              previewLanding.title,
                                            )
                                          }
                                        >
                                          {previewTitle}
                                        </button>
                                      )}

                                      {communityAgentLandingEdit?.kind === "subtitle" ? (
                                        <input
                                          className="web-empty-thread-subtitle-input"
                                          type="text"
                                          autoFocus
                                          value={communityAgentLandingEditValue}
                                          placeholder={DEFAULT_EMPTY_THREAD_LANDING.subtitle}
                                          onChange={(event) => setCommunityAgentLandingEditValue(event.target.value)}
                                          onBlur={() => {
                                            const next = communityAgentLandingEditValue;
                                            if (next !== previewLanding.subtitle) {
                                              setCommunityAgentDraftLanding((prev) => ({
                                                ...prev,
                                                subtitle: next,
                                              }));
                                              markCommunityAgentDraftDirty();
                                            }
                                            clearCommunityAgentLandingEdit();
                                          }}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                              event.preventDefault();
                                              (event.currentTarget as HTMLInputElement).blur();
                                            }
                                            if (event.key === "Escape") {
                                              event.preventDefault();
                                              clearCommunityAgentLandingEdit();
                                            }
                                          }}
                                        />
                                      ) : (
                                        <button
                                          type="button"
                                          className={`web-empty-thread-subtitle web-empty-thread-editable${
                                            previewLanding.subtitle.trim() ? "" : " is-placeholder"
                                          }`}
                                          title="Click to edit"
                                          onClick={() =>
                                            beginCommunityAgentLandingEdit(
                                              { kind: "subtitle" },
                                              previewLanding.subtitle,
                                            )
                                          }
                                        >
                                          {previewSubtitle}
                                        </button>
                                      )}

                                      <div className="web-starter-tabs" role="tablist" aria-label="Preview tabs">
                                        {previewTabs.map((tab, index) => {
                                          const isActive = communityAgentPreviewTabId === tab.id;
                                          const isEditingLabel =
                                            communityAgentLandingEdit?.kind === "tab_label" &&
                                            communityAgentLandingEdit.tabId === tab.id;
                                          const labelText = tab.label.trim() ? tab.label : `Tab ${index + 1}`;

                                          return (
                                            <button
                                              key={tab.id}
                                              type="button"
                                              className={`web-starter-tab${isActive ? " active" : ""}`}
                                              aria-pressed={isActive}
                                              onClick={() => {
                                                if (isEditingLabel) return;
                                                if (!isActive) {
                                                  setCommunityAgentPreviewTabId(tab.id);
                                                  return;
                                                }
                                                beginCommunityAgentLandingEdit(
                                                  { kind: "tab_label", tabId: tab.id },
                                                  tab.label,
                                                );
                                              }}
                                            >
                                              {isEditingLabel ? (
                                                <input
                                                  className="web-starter-tab-input"
                                                  type="text"
                                                  autoFocus
                                                  value={communityAgentLandingEditValue}
                                                  placeholder={labelText}
                                                  onClick={(event) => event.stopPropagation()}
                                                  onChange={(event) =>
                                                    setCommunityAgentLandingEditValue(event.target.value)
                                                  }
                                                  onBlur={() => {
                                                    const next = communityAgentLandingEditValue.trim();
                                                    if (next && next !== tab.label.trim()) {
                                                      setCommunityAgentDraftLanding((prev) => ({
                                                        ...prev,
                                                        tabs: prev.tabs.map((t, idx) =>
                                                          t.id === tab.id
                                                            ? { ...t, label: next || `Tab ${idx + 1}` }
                                                            : t,
                                                        ),
                                                      }));
                                                      markCommunityAgentDraftDirty();
                                                    }
                                                    clearCommunityAgentLandingEdit();
                                                  }}
                                                  onKeyDown={(event) => {
                                                    if (event.key === "Enter") {
                                                      event.preventDefault();
                                                      (event.currentTarget as HTMLInputElement).blur();
                                                    }
                                                    if (event.key === "Escape") {
                                                      event.preventDefault();
                                                      clearCommunityAgentLandingEdit();
                                                    }
                                                  }}
                                                />
                                              ) : (
                                                <>
                                                  <span className="web-starter-tab-label">{labelText}</span>
                                                  {previewTabs.length > 1 && (
                                                    <span
                                                      role="button"
                                                      tabIndex={0}
                                                      className="web-starter-tab-remove"
                                                      aria-label="Remove tab"
                                                      onClick={(event) => {
                                                        event.stopPropagation();
                                                        setCommunityAgentDraftLanding((prev) => ({
                                                          ...prev,
                                                          tabs: prev.tabs.filter((t) => t.id !== tab.id),
                                                        }));
                                                        markCommunityAgentDraftDirty();
                                                        clearCommunityAgentLandingEdit();
                                                      }}
                                                      onKeyDown={(event) => {
                                                        if (event.key !== "Enter" && event.key !== " ") return;
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        setCommunityAgentDraftLanding((prev) => ({
                                                          ...prev,
                                                          tabs: prev.tabs.filter((t) => t.id !== tab.id),
                                                        }));
                                                        markCommunityAgentDraftDirty();
                                                        clearCommunityAgentLandingEdit();
                                                      }}
                                                    >
                                                      ×
                                                    </span>
                                                  )}
                                                </>
                                              )}
                                            </button>
                                          );
                                        })}
                                        {previewTabs.length < 4 && (
                                          <button
                                            type="button"
                                            className="web-starter-tab web-starter-tab-add"
                                            title="Add tab"
                                            onClick={() => {
                                              const nextId = crypto.randomUUID();
                                              const nextLabel = `Tab ${previewTabs.length + 1}`;
                                              setCommunityAgentDraftLanding((prev) => ({
                                                ...prev,
                                                tabs:
                                                  prev.tabs.length >= 4
                                                    ? prev.tabs
                                                    : [...prev.tabs, { id: nextId, label: nextLabel, prompts: [] }],
                                              }));
                                              markCommunityAgentDraftDirty();
                                              setCommunityAgentPreviewTabId(nextId);
                                              beginCommunityAgentLandingEdit(
                                                { kind: "tab_label", tabId: nextId },
                                                nextLabel,
                                              );
                                            }}
                                          >
                                            +
                                          </button>
                                        )}
                                      </div>

                                      <div className="web-starter-list web-starter-list-editable" role="list">
                                        {previewPrompts.map((prompt, idx) => {
                                          const isEditingPrompt =
                                            communityAgentLandingEdit?.kind === "prompt" &&
                                            communityAgentLandingEdit.tabId === previewActiveTab?.id &&
                                            communityAgentLandingEdit.index === idx;

                                          return (
                                            <div
                                              key={`${previewActiveTab?.id ?? "tab"}:${idx}`}
                                              className="web-starter-row is-preview web-starter-row-editable"
                                              role="listitem"
                                              onClick={() => {
                                                if (!previewActiveTab) return;
                                                beginCommunityAgentLandingEdit(
                                                  { kind: "prompt", tabId: previewActiveTab.id, index: idx },
                                                  prompt,
                                                );
                                              }}
                                            >
                                              {isEditingPrompt ? (
                                                <input
                                                  className="web-starter-row-input"
                                                  type="text"
                                                  autoFocus
                                                  value={communityAgentLandingEditValue}
                                                  placeholder={prompt}
                                                  onClick={(event) => event.stopPropagation()}
                                                  onChange={(event) =>
                                                    setCommunityAgentLandingEditValue(event.target.value)
                                                  }
                                                  onBlur={() => {
                                                    if (!previewActiveTab) return;
                                                    const next = communityAgentLandingEditValue.trim();
                                                    if (next && next !== prompt.trim()) {
                                                      setCommunityAgentDraftLanding((prev) => ({
                                                        ...prev,
                                                        tabs: prev.tabs.map((t) =>
                                                          t.id === previewActiveTab.id
                                                            ? {
                                                                ...t,
                                                                prompts: t.prompts.map((p, i) =>
                                                                  i === idx ? next : p,
                                                                ),
                                                              }
                                                            : t,
                                                        ),
                                                      }));
                                                      markCommunityAgentDraftDirty();
                                                    }
                                                    clearCommunityAgentLandingEdit();
                                                  }}
                                                  onKeyDown={(event) => {
                                                    if (event.key === "Enter") {
                                                      event.preventDefault();
                                                      (event.currentTarget as HTMLInputElement).blur();
                                                    }
                                                    if (event.key === "Escape") {
                                                      event.preventDefault();
                                                      clearCommunityAgentLandingEdit();
                                                    }
                                                  }}
                                                />
                                              ) : (
                                                <>
                                                  <span className="web-starter-row-text">{prompt}</span>
                                                  <span className="web-starter-row-actions" aria-hidden="true">
                                                    <button
                                                      type="button"
                                                      className="web-starter-row-delete"
                                                      aria-label="Remove prompt"
                                                      onClick={(event) => {
                                                        event.stopPropagation();
                                                        if (!previewActiveTab) return;
                                                        setCommunityAgentDraftLanding((prev) => ({
                                                          ...prev,
                                                          tabs: prev.tabs.map((t) =>
                                                            t.id === previewActiveTab.id
                                                              ? {
                                                                  ...t,
                                                                  prompts: t.prompts.filter((_, i) => i !== idx),
                                                                }
                                                              : t,
                                                          ),
                                                        }));
                                                        markCommunityAgentDraftDirty();
                                                        clearCommunityAgentLandingEdit();
                                                      }}
                                                    >
                                                      ×
                                                    </button>
                                                    <span className="web-starter-row-arrow" aria-hidden="true">
                                                      <svg viewBox="0 0 24 24">
                                                        <path d="M9 18l6-6-6-6" />
                                                      </svg>
                                                    </span>
                                                  </span>
                                                </>
                                              )}
                                            </div>
                                          );
                                        })}

                                        {(() => {
                                          const tabId = previewActiveTab?.id ?? "";
                                          const isAdding =
                                            communityAgentLandingEdit?.kind === "add_prompt" &&
                                            communityAgentLandingEdit.tabId === tabId;

                                          if (isAdding) {
                                            return (
                                              <div className="web-starter-row is-preview web-starter-row-editable" role="listitem">
                                                <input
                                                  className="web-starter-row-input"
                                                  type="text"
                                                  autoFocus
                                                  value={communityAgentLandingEditValue}
                                                  placeholder="New prompt…"
                                                  onChange={(event) =>
                                                    setCommunityAgentLandingEditValue(event.target.value)
                                                  }
                                                  onBlur={() => {
                                                    const next = communityAgentLandingEditValue.trim();
                                                    if (next && previewActiveTab) {
                                                      setCommunityAgentDraftLanding((prev) => ({
                                                        ...prev,
                                                        tabs: prev.tabs.map((t) =>
                                                          t.id === previewActiveTab.id
                                                            ? { ...t, prompts: [...t.prompts, next] }
                                                            : t,
                                                        ),
                                                      }));
                                                      markCommunityAgentDraftDirty();
                                                    }
                                                    clearCommunityAgentLandingEdit();
                                                  }}
                                                  onKeyDown={(event) => {
                                                    if (event.key === "Enter") {
                                                      event.preventDefault();
                                                      (event.currentTarget as HTMLInputElement).blur();
                                                    }
                                                    if (event.key === "Escape") {
                                                      event.preventDefault();
                                                      clearCommunityAgentLandingEdit();
                                                    }
                                                  }}
                                                />
                                              </div>
                                            );
                                          }

                                          return (
                                            <div
                                              className="web-starter-row is-preview web-starter-row-add"
                                              role="listitem"
                                              onClick={() => {
                                                if (!previewActiveTab) return;
                                                beginCommunityAgentLandingEdit(
                                                  { kind: "add_prompt", tabId: previewActiveTab.id },
                                                  "",
                                                );
                                              }}
                                            >
                                              <span className="web-starter-row-text">+ Add prompt</span>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    </div>

                                    <div className="model-note" style={{ marginTop: 10 }}>
                                      The “Download desktop app” card is always shown by Arx when desktop isn’t
                                      installed.
                                    </div>
                                  </div>
                                </div>

                                <div className="settings-section agent-system-prompt">
                                  <div className="settings-section-title">System prompt (community-wide)</div>
                                  <textarea
                                    className="system-prompt-input"
                                    placeholder="Optional. This applies to every chat in this community."
                                    value={communityAgentDraftSystemPrompt}
                                    onChange={(event) => {
                                      setCommunityAgentDraftSystemPrompt(event.target.value);
                                      markCommunityAgentDraftDirty();
                                    }}
                                    rows={6}
                                  />
                                </div>
                              </>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  )}

		                  {communityTab === "analytics" && (
		                    <div className="settings-panel community-settings-panel">
		                      {!activeCommunity ? (
		                        <div className="chat-empty">Select a community to view analytics.</div>
		                      ) : !supabaseSession ? (
		                        <div className="chat-empty">
		                          <div>Sign in to view community analytics.</div>
		                          <button
		                            className="secondary"
		                            type="button"
		                            onClick={openAuthGate}
		                            style={{ marginTop: 12 }}
		                          >
		                            Sign in
		                          </button>
		                        </div>
		                      ) : !canViewActiveCommunityAnalytics ? (
		                        <div className="chat-empty">Only owners and admins can view community analytics.</div>
			                      ) : (
		                        <>
		                          <div className="analytics-header-row">
		                            <div className="panel-title">Community Analytics</div>
		                            <div className="analytics-range-toggle" role="tablist" aria-label="Time range">
		                              {(["7d", "30d", "90d", "1y", "all"] as AnalyticsRange[]).map((value) => (
		                                <button
		                                  key={value}
		                                  className={
		                                    value === communityAnalyticsRange
		                                      ? "analytics-range-btn active"
		                                      : "analytics-range-btn"
		                                  }
		                                  type="button"
		                                  onClick={() => setCommunityAnalyticsRange(value)}
		                                  aria-pressed={value === communityAnalyticsRange}
		                                >
		                                  {value}
		                                </button>
		                              ))}
		                            </div>
		                          </div>
	                          <div className="settings-section">
	                            {isLoadingCommunityAnalytics && (
	                              <div className="chat-loading">
	                                <div className="loading-spinner" />
	                                <span>Loading analytics...</span>
	                              </div>
	                            )}
	                            {communityAnalyticsError && <div className="auth-error">{communityAnalyticsError}</div>}
	                            <div className="analytics-kpi-strip" aria-label="Key performance indicators">
	                              {[
	                                { label: "Members", value: formatCount(communityAnalyticsSummary.total_members) },
	                                { label: "MRR", value: "—" },
	                                { label: "Conversion", value: "—" },
	                                { label: "Retention", value: formatPercent(communityAnalyticsSummary.retention_window) },
	                              ].map((kpi) => (
	                                <div key={kpi.label} className="analytics-kpi-tile">
	                                  <div className="analytics-kpi-value-big">{kpi.value}</div>
	                                  <div className="analytics-kpi-label">{kpi.label}</div>
	                                </div>
	                              ))}
	                            </div>
	                          </div>

		                          <div className="settings-section">
		                            <div className="analytics-chart-card">
		                              <div className="analytics-chart-header">
		                                <div className="analytics-range-toggle analytics-mode-toggle" role="tablist" aria-label="Metric">
		                                  {(["members", "revenue"] as AnalyticsChartMode[]).map((value) => (
		                                    <button
		                                      key={value}
		                                      className={
		                                        value === communityAnalyticsChartMode
		                                          ? "analytics-range-btn active"
		                                          : "analytics-range-btn"
		                                      }
		                                      type="button"
		                                      onClick={() => setCommunityAnalyticsChartMode(value)}
		                                      aria-pressed={value === communityAnalyticsChartMode}
		                                    >
		                                      {value === "members" ? "Members" : "Revenue"}
		                                    </button>
		                                  ))}
		                                </div>
		                                <div className="analytics-chart-stat">
		                                  {communityAnalyticsChartMode === "members"
		                                    ? communityAnalyticsSeries.length === 0
		                                      ? "—"
		                                      : formatCount(
		                                          communityAnalyticsSeries.reduce((sum, point) => sum + point.value, 0)
		                                        )
		                                    : !communityRevenueMeta || communityRevenueSeries.length === 0
		                                      ? "—"
		                                      : formatMoneyBaseUnits(
		                                          communityRevenueSeries.reduce((sum, point) => sum + point.value, 0),
		                                          communityRevenueMeta.currency,
		                                          communityRevenueMeta.currency_decimals
		                                        )}
		                                </div>
		                              </div>
		                              {communityAnalyticsChartMode === "members" ? (
		                                <AnalyticsLineChart points={communityAnalyticsSeries} />
		                              ) : (
		                                <AnalyticsLineChart
		                                  points={communityRevenueSeries}
		                                  valueFormatter={
		                                    communityRevenueMeta
		                                      ? (value) =>
		                                          formatMoneyBaseUnits(
		                                            value,
		                                            communityRevenueMeta.currency,
		                                            communityRevenueMeta.currency_decimals
		                                          )
		                                      : undefined
		                                  }
		                                />
		                              )}
		                              {communityAnalyticsChartMode === "revenue" && communityRevenueError && (
		                                <div className="analytics-chart-note">
		                                  {communityRevenueError.includes("schema cache")
		                                    ? "Revenue is still syncing. Refresh in a moment."
		                                    : communityRevenueError}
		                                </div>
		                              )}
		                            </div>
		                          </div>
		                        </>
		                      )}
		                    </div>
		                  )}

	                  {communityTab === "resources" && (
	                    <div className="community-panel resources-panel">
	                      <div className="resources-header-row">
	                        <div className="resources-header">Resources</div>
		                        {supabaseSession && activeCommunity && canCreateResourcesActiveCommunity && (
		                          <button className="resources-add-btn" onClick={openNewResourceModal} title="Add resource">
		                            +
		                          </button>
		                        )}
	                      </div>
                      {resourceSuccess && <div className="success-toast">Resource saved successfully!</div>}
                      <div
                        className={
                          !isLoadingResources && communityResources.length === 0
                            ? "resource-list resource-list-empty"
                            : "resource-list"
                        }
                      >
                        {isLoadingResources && (
                          <div className="chat-loading">
                            <div className="loading-spinner" />
                            <span>Loading resources...</span>
                          </div>
                        )}
                        {!isLoadingResources && communityResources.length === 0 && (
                          <div className="chat-empty-state">
                            <div className="chat-empty-icon">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M10 13a5 5 0 0 0 7.07 0l3.54-3.54a5 5 0 0 0-7.07-7.07L10 5" />
                                <path d="M14 11a5 5 0 0 0-7.07 0L3.4 14.54a5 5 0 0 0 7.07 7.07L14 19" />
                              </svg>
                            </div>
                            <div className="chat-empty-title">
                              Welcome to {activeCommunity ? activeCommunity.name : "your"} resources
                            </div>
                            <div className="chat-empty-text">
                              Share links, posts, and videos with your members. Add your first resource to get started.
                            </div>
                          </div>
                        )}
                        {!isLoadingResources &&
                          communityResources.map((resource) => (
                            <div key={resource.id} className="resource-item">
                              {(() => {
                                const embedInfo = resource.url ? parseEmbedUrl(resource.url) : null;
                                const isEmbedOpen = openResourceEmbedId === resource.id;
                                const metaLabel = embedInfo
                                  ? `embed • ${embedInfo.provider}`
                                  : resource.url
                                    ? "link"
                                    : "post";
                                return (
                                  <>
                                    <div className="resource-title">
                                      {resource.pinned && <span className="resource-pin-tag">Pinned</span>}
                                      {resource.title}
                                    </div>
                                    <div className="resource-meta">
                                      <span>{metaLabel}</span>
                                      <span>{formatChatTime(resource.created_at)}</span>
                                    </div>
                                    {embedInfo && resource.url && (
                                      <div className="resource-embed">
                                        {isEmbedOpen ? (
                                          <div className="resource-embed-thumb open">
                                            <button
                                              type="button"
                                              className="resource-embed-close"
                                              onClick={() => setOpenResourceEmbedId(null)}
                                              title="Hide preview"
                                            >
                                              ×
                                            </button>
                                            <iframe
                                              src={embedInfo.src}
                                              title={`${resource.title} embed`}
                                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                                              allowFullScreen
                                              loading="lazy"
                                            />
                                          </div>
                                        ) : embedInfo.provider === "youtube" ? (
                                          <button
                                            type="button"
                                            className="resource-embed-thumb"
                                            onClick={() => setOpenResourceEmbedId(resource.id)}
                                            title="Preview"
                                          >
                                            {"thumbnailUrl" in embedInfo && (
                                              <img src={embedInfo.thumbnailUrl} alt="YouTube thumbnail" loading="lazy" />
                                            )}
                                            <div className="resource-embed-play">▶</div>
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            className="resource-embed-thumb placeholder"
                                            onClick={() => setOpenResourceEmbedId(resource.id)}
                                            title="Preview"
                                          >
                                            <div className="resource-embed-provider">
                                              {embedInfo.provider === "wistia" ? "Wistia" : "Embed"}
                                            </div>
                                            <div className="resource-embed-play">▶</div>
                                          </button>
                                        )}
                                      </div>
                                    )}
                                    {!embedInfo && resource.url && (
                                      <a className="resource-link" href={resource.url} target="_blank" rel="noreferrer">
                                        {resource.url}
                                      </a>
                                    )}
                                    {resource.body_md && <div className="resource-body">{resource.body_md}</div>}
	                                    {canManageResourcesActiveCommunity && (
	                                      <div className="resource-actions">
	                                        <button className="secondary" onClick={() => handleEditResource(resource)}>
	                                          Edit
	                                        </button>
	                                        <button className="danger" onClick={() => void handleDeleteResource(resource.id)}>
	                                          Delete
	                                        </button>
	                                      </div>
	                                    )}
	                                  </>
	                                );
	                              })()}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

	                  {communityTab === "members" && (
	                    <div className="community-panel members-panel">
	                      <div className={`members-layout${canInviteActiveCommunity ? " with-invites" : ""}`}>
	                        <section className="members-section">
	                          <div className="members-header-row">
	                            <div className="members-header">Members</div>
	                            <div className="members-count">
	                              {communityMembersRoleFilter !== "all" || communityMembersPlanFilter !== "all"
	                                ? `${filteredCommunityMembers.length} / ${communityMembers.length}`
	                                : communityMembers.length}
	                            </div>
	                          </div>
	                          {canManageMembersActiveCommunity && (
	                            <div className="invite-create-row" style={{ marginTop: 10 }}>
	                              <label className="invite-field">
	                                <span>Role</span>
	                                <select
	                                  className="select-styled"
	                                  value={communityMembersRoleFilter}
	                                  onChange={(event) => setCommunityMembersRoleFilter(event.target.value)}
	                                >
	                                  <option value="all">All roles</option>
	                                  <option value="owner">Owner</option>
	                                  <option value="admin">Admin</option>
	                                  <option value="mod">Moderator</option>
	                                  <option value="member">Member</option>
	                                </select>
	                              </label>
		                              <label className="invite-field">
		                                <span>Plan</span>
		                                <select
		                                  className="select-styled"
		                                  value={communityMembersPlanFilter}
		                                  onChange={(event) => setCommunityMembersPlanFilter(event.target.value)}
		                                >
		                                  <option value="all">All plans</option>
		                                  <option value="free">Free / none</option>
		                                  <option value="monthly">Monthly (any)</option>
		                                  <option value="yearly">Annual (any)</option>
		                                  {communityMemberPlanCohorts.length > 0 && (
		                                    <optgroup label="Price cohorts">
		                                      {communityMemberPlanCohorts.map((cohort) => (
		                                        <option key={cohort.key} value={cohort.value}>
		                                          {cohort.label} ({cohort.count})
		                                        </option>
		                                      ))}
		                                    </optgroup>
		                                  )}
		                                </select>
		                              </label>
		                            </div>
		                          )}
                          {activeCommunity &&
                            canReviewJoinRequestsActiveCommunity &&
                            membersCommunityHasPaidPlans === false && (
		                              <div className="members-header-row" style={{ marginTop: 10 }}>
		                                <label
		                                  className="resource-pin"
		                                  style={{ cursor: isSavingFreeJoinRequiresApproval ? "not-allowed" : "pointer" }}
		                                >
		                                  <input
		                                    type="checkbox"
		                                    checked={!activeCommunity.free_join_requires_approval}
		                                    disabled={isLoadingMembersCommunityPricing || isSavingFreeJoinRequiresApproval}
		                                    onChange={(event) => {
		                                      const nextAutoApprove = event.target.checked;
		                                      void handleSetCommunityFreeJoinRequiresApproval(!nextAutoApprove);
		                                    }}
		                                  />
		                                  Auto-approve new members
		                                </label>
		                              </div>
		                            )}
                          {activeCommunity &&
                            canReviewJoinRequestsActiveCommunity &&
                            membersCommunityHasPaidPlans === false &&
                            (activeCommunityJoinMode === "request_access" || communityJoinRequests.length > 0) && (
                              <div className="members-header-row" style={{ marginTop: 10 }}>
                                <button
                                  className="secondary"
                                  type="button"
		                                  disabled={
		                                    isLoadingMembersCommunityPricing ||
		                                    isLoadingCommunityJoinRequests ||
		                                    isSavingFreeJoinRequiresApproval
		                                  }
		                                  onClick={() => setIsJoinRequestsModalOpen(true)}
		                                >
		                                  Pending approvals (
		                                  {isLoadingCommunityJoinRequests ? "…" : String(communityJoinRequests.length)})
		                                </button>
		                              </div>
		                            )}
	                          {communityJoinRequestsError && (
	                            <div className="auth-error" style={{ marginTop: 8 }}>
	                              {communityJoinRequestsError}
	                            </div>
	                          )}
	                          <div className="members-list">
	                            {communityMembers.length === 0 ? (
	                              <div className="members-empty">No members yet.</div>
	                            ) : filteredCommunityMembers.length === 0 ? (
	                              <div className="members-empty">No matching members.</div>
	                            ) : (
			                              filteredCommunityMembers.map((member) => {
			                                const profile = profilesByUserId[member.user_id] ?? null;
			                                const avatarUrl = profile?.avatar_url ?? null;
			                                const initials = profile?.display_name
			                                  ? communityInitials(profile.display_name)
			                                  : getInitials(member.user_id);
		                                const memberIsOwner = Boolean(
			                                  (activeCommunity && activeCommunity.owner_id === member.user_id) ||
			                                    member.role === "owner"
			                                );
			                                const planPeriod = String(member.subscription_billing_period ?? "").trim().toLowerCase();
			                                const showPlanLabel = planPeriod === "monthly" || planPeriod === "yearly";
			                                const planLabel = showPlanLabel
			                                  ? formatSubscriptionPrice({
			                                      amountBaseUnits: member.subscription_amount_base_units,
			                                      currency: member.subscription_currency,
			                                      currencyDecimals: member.subscription_currency_decimals,
			                                      billingPeriod: planPeriod,
			                                    })
			                                  : "";
			                                const viewerIsOwner = isActiveCommunityOwner;
			                                const viewerIsAdmin = canManageMembersActiveCommunity && !viewerIsOwner;
			                                const memberIsAdmin = member.role === "admin";
			                                const canEditThisMember = viewerIsOwner || !memberIsAdmin;
		                                const canRemoveThisMember =
		                                  viewerIsOwner || (viewerIsAdmin && !memberIsAdmin && !memberIsOwner);
	                                const roleOptions = viewerIsOwner
	                                  ? ["member", "mod", "admin"]
	                                  : memberIsAdmin
	                                    ? ["admin"]
	                                    : ["member", "mod"];
	                                return (
	                                  <div key={member.id} className="member-item">
                                    <div className="member-avatar" style={{ backgroundColor: getAvatarColor(member.user_id) }}>
                                      {avatarUrl ? (
                                        <img src={avatarUrl} alt={displayName(member.user_id)} />
                                      ) : (
                                        initials
                                      )}
	                                    </div>
		                                    <div className="member-info">
		                                      <span className="member-name">
		                                          {displayName(member.user_id)}
		                                          {canManageMembersActiveCommunity && member.access_status === "declined" ? " (declined)" : ""}
		                                        </span>
		                                      {!canManageMembersActiveCommunity || memberIsOwner ? (
			                                      <span className="member-role">
			                                        {memberIsOwner ? "owner" : member.role}
			                                        {showPlanLabel ? ` • ${planLabel}` : ""}
			                                      </span>
			                                    ) : (
		                                        <div className="member-controls">
		                                          <select
		                                            className="select-styled"
		                                            value={member.role}
	                                            disabled={!canEditThisMember}
	                                            onChange={(event) => {
	                                              const next = event.target.value;
	                                              if (next === member.role) return;
	                                              void handleSetCommunityMemberRole(member.user_id, next);
	                                            }}
	                                          >
	                                            {roleOptions.map((role) => (
	                                              <option key={role} value={role}>
	                                                {role}
	                                              </option>
	                                            ))}
	                                          </select>
	                                          {canRemoveThisMember && (
	                                            <button
	                                              className="danger"
	                                              type="button"
	                                              onClick={() => void handleRemoveCommunityMember(member.user_id)}
	                                            >
	                                              Remove
	                                            </button>
	                                          )}
	                                        </div>
	                                      )}
	                                    </div>
	                                  </div>
	                                );
	                              })
                            )}
                          </div>
                        </section>

	                        {activeCommunity && supabaseSession && canInviteActiveCommunity && (
	                          <section className="invites-section">
                            <div className="members-header-row">
                              <div className="members-header">Invites</div>
                            </div>
                            <div className="invites-card">
                              <div className="invite-create-row invite-create-row-cta">
                                <label className="invite-field">
                                  <span>Max uses</span>
                                  <select
                                    className="select-styled"
                                    value={inviteMaxUsesPreset}
                                    onChange={(event) => setInviteMaxUsesPreset(event.target.value)}
                                  >
                                    <option value="unlimited">Unlimited</option>
                                    <option value="1">1 use</option>
                                    <option value="5">5 uses</option>
                                    <option value="10">10 uses</option>
                                    <option value="25">25 uses</option>
                                    <option value="100">100 uses</option>
                                    <option value="custom">Custom…</option>
                                  </select>
                                </label>
                                <label className="invite-field">
                                  <span>Expires</span>
                                  <select
                                    className="select-styled"
                                    value={inviteExpiryPreset}
                                    onChange={(event) => setInviteExpiryPreset(event.target.value)}
                                  >
                                    <option value="never">Never</option>
                                    <option value="24h">24 hours</option>
                                    <option value="7d">7 days</option>
                                    <option value="30d">30 days</option>
                                    <option value="90d">90 days</option>
                                    <option value="custom">Custom…</option>
                                  </select>
                                </label>
                                <button className="invite-create-btn" onClick={() => void handleCreateInvite()} disabled={isCreatingInvite}>
                                  {isCreatingInvite ? "Creating…" : "Create"}
                                </button>
                              </div>
                              {(inviteMaxUsesPreset === "custom" || inviteExpiryPreset === "custom") && (
                                <div className="invite-create-row invite-create-row-custom">
                                  {inviteMaxUsesPreset === "custom" && (
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      placeholder="Custom max uses"
                                      value={inviteMaxUsesCustom}
                                      onChange={(event) => setInviteMaxUsesCustom(event.target.value)}
                                    />
                                  )}
                                  {inviteExpiryPreset === "custom" && (
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      placeholder="Custom expiry (days)"
                                      value={inviteExpiryCustom}
                                      onChange={(event) => setInviteExpiryCustom(event.target.value)}
                                    />
                                  )}
                                </div>
                              )}
                              {inviteCreateError && <div className="auth-error">{inviteCreateError}</div>}
                              <div className="invite-list">
                                {isLoadingCommunityInvites ? (
                                  <div className="chat-empty">Loading invites…</div>
                                ) : communityInvites.length === 0 ? (
                                  <div className="chat-empty">No invites yet.</div>
                                ) : (
                                  communityInvites.map((invite) => {
                                    const revoked = Boolean(invite.revoked_at);
                                    const expired = Boolean(invite.expires_at && new Date(invite.expires_at).getTime() < Date.now());
                                    const status = revoked ? "revoked" : expired ? "expired" : "active";
                                    const inviteLink = buildCommunityInstantAccessLink(
                                      window.location.origin,
                                      activeCommunity.slug,
                                      invite.code,
                                    );
                                    return (
                                      <div key={invite.id} className="invite-row">
                                        <div className="invite-main">
                                          <div className="invite-code">{invite.code}</div>
                                          <div className={`invite-status ${status}`}>
                                            {status}
                                            {invite.max_uses ? ` • max ${invite.max_uses}` : ""}
                                            {invite.expires_at ? ` • exp ${new Date(invite.expires_at).toLocaleDateString()}` : ""}
                                          </div>
                                        </div>
                                        <div className="invite-actions">
                                          <button
                                            className="secondary"
                                            onClick={() => void copyTextToClipboard(inviteLink)}
                                            title="Copy instant access link"
                                          >
                                            Copy link
                                          </button>
                                          <button
                                            className="secondary"
                                            onClick={() => void copyTextToClipboard(invite.code)}
                                            title="Copy invite code"
                                          >
                                            Copy code
                                          </button>
                                          <button
                                            className="secondary"
                                            onClick={() => void handleRevokeInvite(invite.id)}
                                            disabled={revoked}
                                            title="Revoke invite"
                                          >
                                            Revoke
                                          </button>
                                          <button
                                            className="danger"
                                            onClick={() => void handleDeleteInvite(invite.id)}
                                            title="Delete invite"
                                          >
                                            Delete
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          </section>
                        )}
	                      </div>
	                    </div>
	                  )}

	                  {isJoinRequestsModalOpen && (
	                    <div className="modal-overlay" onClick={() => setIsJoinRequestsModalOpen(false)}>
	                      <div className="modal" onClick={(event) => event.stopPropagation()}>
	                        <div className="modal-header">
	                          <div className="modal-title">Pending approvals</div>
	                          <button
	                            className="modal-close"
	                            onClick={() => setIsJoinRequestsModalOpen(false)}
	                            title="Close"
	                            type="button"
	                          >
	                            ×
	                          </button>
	                        </div>
	                        <div className="modal-body">
	                          {isLoadingCommunityJoinRequests ? (
	                            <div className="chat-empty">Loading…</div>
	                          ) : communityJoinRequests.length === 0 ? (
	                            <div className="model-note">No pending approvals.</div>
	                          ) : (
	                            <div className="invite-list">
	                              {communityJoinRequests.map((request) => {
	                                const message = (request.message ?? "").trim();
	                                const details = [formatRelativeTime(request.created_at), message].filter(Boolean).join(" • ");
	                                const isDeciding = decidingCommunityJoinRequestId === request.id;
	                                return (
	                                  <div key={request.id} className="invite-row">
	                                    <div className="invite-main">
	                                      <div className="invite-code">{displayName(request.user_id)}</div>
	                                      <div className="invite-status active">{details || "Requested access"}</div>
	                                    </div>
	                                    <div className="invite-actions">
	                                      <button
	                                        className="secondary"
	                                        type="button"
	                                        disabled={isDeciding}
	                                        onClick={() => void handleApproveCommunityJoinRequest(request.id)}
	                                        title="Approve"
	                                      >
	                                        ✓
	                                      </button>
	                                      <button
	                                        className="danger"
	                                        type="button"
	                                        disabled={isDeciding}
	                                        onClick={() => void handleDenyCommunityJoinRequest(request.id)}
	                                        title="Deny"
	                                      >
	                                        ✕
	                                      </button>
	                                    </div>
	                                  </div>
	                                );
	                              })}
	                            </div>
	                          )}
	                          {communityJoinRequestsError && <div className="auth-error">{communityJoinRequestsError}</div>}
	                        </div>
	                      </div>
	                    </div>
	                  )}

	                  {communityTab === "library" && (
	                    <div className="community-panel library-panel">
	                      <div className="chat-empty-state">
	                        <div className="chat-empty-icon">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 0 4 23" />
                            <path d="M4 5.5V19.5" />
                          </svg>
                        </div>
                        <div className="chat-empty-title">Welcome to the library</div>
                        <div className="chat-empty-text">Library on web is coming next.</div>
                      </div>
                    </div>
                  )}

                  {showResourceModal && (
                    <div className="modal-overlay" onClick={closeResourceModal}>
                      <div className="modal resource-modal" onClick={(event) => event.stopPropagation()}>
                        <div className="modal-header">
                          <div className="modal-title">{editingResourceId ? "Edit resource" : "Add resource"}</div>
                          <button className="modal-close" onClick={closeResourceModal} title="Close">
                            ×
                          </button>
                        </div>
                        <div className="modal-body">
                          <div className="resource-form">
                            <input
                              type="text"
                              placeholder="Title"
                              value={resourceTitleInput}
                              onChange={(event) => setResourceTitleInput(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                  event.preventDefault();
                                  void handleSaveCommunityResource();
                                }
                              }}
                              disabled={!activeCommunity}
                            />
                            <input
                              type="text"
                              placeholder="Embed video (YouTube/Wistia URL)"
                              value={resourceUrlInput}
                              onChange={(event) => setResourceUrlInput(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                  event.preventDefault();
                                  void handleSaveCommunityResource();
                                }
                              }}
                              disabled={!activeCommunity}
                            />
                            <textarea
                              placeholder="Short description"
                              value={resourceBodyInput}
                              onChange={(event) => setResourceBodyInput(event.target.value)}
                              disabled={!activeCommunity}
                            />
                            <label className="resource-pin">
                              <input
                                type="checkbox"
                                checked={resourcePinnedInput}
                                onChange={(event) => setResourcePinnedInput(event.target.checked)}
                                disabled={!activeCommunity}
                              />
                              Pin to top
                            </label>
                            {resourceError && <div className="auth-error">{resourceError}</div>}
                          </div>
                        </div>
                        <div className="modal-footer">
                          <div className="resource-modal-actions">
                            <button
                              onClick={() => void handleSaveCommunityResource()}
                              disabled={
                                !activeCommunity ||
                                isSavingResource ||
                                resourceTitleInput.trim().length === 0 ||
                                resourceBodyInput.trim().length === 0
                              }
                            >
                              {isSavingResource ? "Saving..." : editingResourceId ? "Save changes" : "Save resource"}
                            </button>
                            <button className="secondary" onClick={() => { resetResourceForm(); closeResourceModal(); }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </main>
      </div>

      {contextModal && (
        <div className="modal-overlay" onClick={() => setContextModal(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Memory &amp; context</div>
              <button className="modal-close" onClick={() => setContextModal(null)} title="Close">
                ×
              </button>
            </div>
            <div className="modal-body">
              {contextModal.memory_used.length === 0 &&
              contextModal.history_used.length === 0 &&
              contextModal.memory_suggestions.length === 0 &&
              contextModal.memory_added.length === 0 &&
              !contextModal.community_evidence ? (
                <div className="memory-block-empty">No memory or context is attached to this message.</div>
              ) : (
                <div className="memory-blocks">
                  {contextModal.memory_added.length > 0 && (
                    <>
                      <div className="memory-block-group-title">Memory updated</div>
                      <div className="memory-block-group">
                        {contextModal.memory_added.map((item) => (
                          <div key={item.id} className="memory-block read-only">
                            <div className="memory-block-header">
                              <div className="memory-block-label">{item.pinned ? "Pinned memory" : "Memory"}</div>
                            </div>
                            <div className="memory-block-desc">{item.content}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {contextModal.memory_used.length > 0 && (
                    <>
                      <div className="memory-block-group-title">Memory used</div>
                      <div className="memory-block-group">
                        {contextModal.memory_used.map((item) => {
                          const updatedLabel = item.updated_at ? new Date(item.updated_at).toLocaleDateString() : "unknown";
                          return (
                            <div key={item.id} className="memory-block read-only">
                              <div className="memory-block-header">
                                <div className="memory-block-label">{item.pinned ? "Pinned memory" : "Memory"}</div>
                              </div>
                              <div className="memory-block-desc">{item.content}</div>
                              <div className="memory-block-meta">
                                {item.scope}
                                {item.scope_id ? `:${item.scope_id}` : ""}
                                {item.pinned ? " • pinned" : ""}
                                {item.updated_at ? ` • updated ${updatedLabel}` : ""}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {contextModal.history_used.length > 0 && (
                    <>
                      <div className="memory-block-group-title">Relevant history</div>
                      <div className="memory-block-group">
                        {contextModal.history_used.map((item) => (
                          <div key={item.message_id} className="memory-block read-only">
                            <div className="memory-block-header">
                              <div className="memory-block-label">Previous chat</div>
                            </div>
                            <div className="memory-block-desc">{item.snippet}</div>
                            {item.created_at && (
                              <div className="memory-block-meta">
                                {new Date(item.created_at).toLocaleString()}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {contextModal.community_evidence && (
                    <>
                      <div className="memory-block-group-title">Community evidence</div>
                      <div className="memory-block-group">
                        {contextModal.community_evidence.items.map((item: CommunityEvidenceEntry) => (
                          <div
                            key={`${item.source_type}:${item.source_id}:${item.rank}`}
                            className="memory-block read-only"
                          >
                            <div className="memory-block-header">
                              <div className="memory-block-label">
                                {formatCommunityEvidenceTypeLabel(item.source_type)}
                              </div>
                            </div>
                            <div className="memory-block-desc">
                              {item.title}
                              {item.snippet ? `: ${item.snippet}` : ""}
                            </div>
                            <div className="memory-block-meta">
                              {item.url ? ` • ${item.url}` : ""}
                              {typeof item.score === "number" ? ` • score ${item.score.toFixed(3)}` : ""}
                              {` • rank ${item.rank}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {contextModal.memory_suggestions.length > 0 && (
                    <>
                      <div className="memory-block-group-title">Suggested memory</div>
                      <div className="memory-block-group">
                        {contextModal.memory_suggestions.map((item, idx) => (
                          <div key={`${item.content}-${idx}`} className="memory-block">
                            <div className="memory-block-header">
                              <div className="memory-block-label">{item.pinned ? "Pinned memory" : "Memory"}</div>
                              <div className="memory-block-actions">
                                <button
                                  className="secondary"
                                  type="button"
                                  disabled={!supabaseSession}
                                  onClick={() => {
                                    if (!supabaseSession) {
                                      openAuthGate();
                                      return;
                                    }
                                    const tier = (builderBillingStatus?.builder_tier ?? "free").toLowerCase();
                                    if (tier === "free") {
                                      setBuilderUpgradeContext("builder");
                                      setBuilderBillingError("Upgrade to Builder to use personal memory.");
                                      setIsBuilderUpgradeOpen(true);
                                      return;
                                    }
                                    void createPersonalMemoryItemDirect({ content: item.content, pinned: item.pinned })
                                      .then(() => showMemoryToastMessage("Memory updated"))
                                      .catch((error) => console.warn("Failed to save suggested memory:", error));
                                  }}
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                            <div className="memory-block-desc">{item.content}</div>
                            <div className="memory-block-meta">
                              {item.pinned ? "Pinned" : "Not pinned"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
	      )}

        {isCommunityChatLightboxOpen && communityChatLightboxImages.length > 0 && (() => {
          const active =
            communityChatLightboxImages[
              Math.min(
                Math.max(communityChatLightboxIndex, 0),
                communityChatLightboxImages.length - 1
              )
            ] ?? null;
          if (!active) return null;
          const total = communityChatLightboxImages.length;
          return (
            <div className="modal-overlay" onClick={closeCommunityChatLightbox}>
              <div className="modal lightbox-modal" onClick={(event) => event.stopPropagation()}>
                <button
                  className="lightbox-close"
                  type="button"
                  onClick={closeCommunityChatLightbox}
                  title="Close"
                  aria-label="Close"
                >
                  ×
                </button>
                {total > 1 && (
                  <>
                    <button
                      className="lightbox-nav prev"
                      type="button"
                      onClick={() => setCommunityChatLightboxIndex((prev) => (prev - 1 + total) % total)}
                      title="Previous"
                      aria-label="Previous"
                    >
                      ‹
                    </button>
                    <button
                      className="lightbox-nav next"
                      type="button"
                      onClick={() => setCommunityChatLightboxIndex((prev) => (prev + 1) % total)}
                      title="Next"
                      aria-label="Next"
                    >
                      ›
                    </button>
                    <div className="lightbox-counter" aria-hidden="true">
                      {communityChatLightboxIndex + 1}/{total}
                    </div>
                  </>
                )}
                <div className="lightbox-body">
                  <img src={active.url} alt={active.name} />
                </div>
              </div>
            </div>
          );
		        })()}

				      {authGateModal}

		      {supabaseSession && platformQuotaModal && (
		        <div
		          className="modal-overlay"
		          onClick={() => {
		            if (isPlatformQuotaModalRunning) return;
	            setPlatformQuotaModal(null);
	          }}
	        >
	          <div className="modal" onClick={(event) => event.stopPropagation()}>
	            <div className="modal-header">
	              <div className="modal-title">
                  {platformQuotaModal.reason === "quota" ? "Arx AI quota reached" : "Arx AI unavailable"}
                </div>
	              <button
	                className="modal-close"
	                type="button"
	                onClick={() => setPlatformQuotaModal(null)}
	                title="Close"
	                disabled={isPlatformQuotaModalRunning}
	              >
	                ×
	              </button>
	            </div>
	            <div className="modal-body">
	              <div className="model-note" style={{ marginBottom: 12 }}>
	                {platformQuotaModal.reason === "quota"
	                  ? "You've used your included Arx AI quota for this month."
	                  : platformQuotaModal.message || "Arx AI is temporarily unavailable."}
	              </div>
		              <div className="model-note" style={{ marginBottom: 12 }}>
		                To continue, choose another available model or upgrade for more included quota.
		              </div>
		              <div className="auth-error" style={{ marginBottom: 12 }}>
		                This model isn&apos;t available on your current plan.
		              </div>
	            </div>
	            <div className="modal-footer">
	              <div className="auth-actions">
	                <button
	                  type="button"
	                  className="secondary"
	                  onClick={() => setPlatformQuotaModal(null)}
	                  disabled={isPlatformQuotaModalRunning}
	                >
	                  Cancel
	                </button>
	                  <button
	                    type="button"
	                    className="secondary"
	                    onClick={() => {
	                      const threadId = platformQuotaModal.threadId;
	                      setPlatformQuotaModal(null);
	                      setActiveThreadId(threadId);
	                      setIsModelPickerOpen(true);
	                      window.setTimeout(() => {
	                        const root = modelPickerRef.current;
	                        const btn = root?.querySelector<HTMLButtonElement>(".ask-model-btn");
	                        btn?.focus();
	                      }, 60);
	                    }}
	                    disabled={isPlatformQuotaModalRunning}
	                  >
	                    Change model
	                  </button>
	              </div>
	            </div>
	          </div>
	        </div>
	      )}

	      {supabaseSession && isBuilderUpgradeOpen && (
	        <div className="modal-overlay" onClick={() => setIsBuilderUpgradeOpen(false)}>
	          <div className="modal modal-upgrade" onClick={(event) => event.stopPropagation()}>
	            <div className="modal-header">
	              <div className="modal-title">Upgrade plan</div>
	              <button
	                className="modal-close"
	                type="button"
	                onClick={() => setIsBuilderUpgradeOpen(false)}
	                title="Close"
	              >
	                ×
	              </button>
	            </div>
	            <div
	              className="modal-body"
	              ref={builderUpgradeModalBodyRef}
	              onScroll={updateBuilderUpgradeScrollHint}
	            >
	              <div className="model-note" style={{ marginBottom: 12 }}>
	                {builderUpgradeContext === "create_community"
	                  ? "Choose a builder plan to create your community."
	                  : "Choose a builder plan to create communities and start earning."}
	              </div>
	              {builderUpgradeContext === "create_community" && (
	                <div className="model-note" style={{ marginBottom: 12 }}>
	                  After checkout, we'll create your community automatically.
	                </div>
	              )}
	              {builderBillingError && <div className="auth-error">{builderBillingError}</div>}
		              {(() => {
		                const tier = (builderBillingStatus?.builder_tier ?? "free").toLowerCase();
		                const freeIsCurrent = tier === "free";
			                const builderIsCurrent = tier === "builder";
			                const architectIsCurrent = tier === "pro" || tier === "architect";
		                const feature = (included: boolean, label: string) => (
		                  <li className={`plan-feature${included ? " on" : " off"}`}>
		                    <span className={`plan-feature-icon ${included ? "check" : "x"}`} aria-hidden="true">
		                      {included ? "✓" : "×"}
		                    </span>
		                    <span className="plan-feature-text">{label}</span>
		                  </li>
		                );
		                return (
		                  <div className="plan-grid">
		                    <div className={`plan-card${freeIsCurrent ? " current" : ""}`}>
		                      <div className="plan-card-header">
		                        <div className="plan-name">Free</div>
		                        {freeIsCurrent && <div className="plan-badge">Current</div>}
		                      </div>
		                      <div className="plan-price">
		                        <span className="plan-price-amount">$0</span>
		                        <span className="plan-price-period">/mo</span>
		                      </div>
		                      <div className="plan-subtitle">0 communities</div>
		                      <ul className="plan-features plan-features-checks">
		                        {feature(true, "AI chats (250MB cloud history)")}
		                        {feature(true, "Access all included models")}
		                        {feature(true, "Desktop app & local tools")}
		                        {feature(true, "Cloud sync")}
		                        {feature(false, "Agent memory")}
		                        {feature(false, "Create communities")}
		                        {feature(false, "Stripe payouts")}
		                        {feature(false, "Analytics")}
		                        {feature(false, "Automations")}
		                        {feature(false, "Early feature access")}
		                      </ul>
		                      <button type="button" className="plan-cta" disabled>
		                        {freeIsCurrent ? "Current plan" : "Free"}
		                      </button>
		                    </div>

			                    <div className={`plan-card${builderIsCurrent ? " current" : ""}`}>
			                      <div className="plan-card-header">
			                        <div className="plan-name">Builder</div>
			                        {builderIsCurrent && <div className="plan-badge">Current</div>}
			                      </div>
		                      <div className="plan-price">
		                        <span className="plan-price-amount">$20</span>
		                        <span className="plan-price-period">/mo</span>
		                      </div>
		                      <div className="plan-subtitle">10% take · 1 community</div>
		                      <ul className="plan-features plan-features-checks">
		                        {feature(true, "AI chats (5GB cloud history)")}
		                        {feature(true, "Access all included models")}
		                        {feature(true, "Desktop app & local tools")}
		                        {feature(true, "Cloud sync")}
		                        {feature(true, "Agent memory")}
		                        {feature(true, "Create 1 community")}
		                        {feature(true, "Stripe payouts")}
		                        {feature(false, "Analytics")}
		                        {feature(false, "Automations")}
		                        {feature(false, "Early feature access")}
		                      </ul>
		                      <button
		                        type="button"
		                        className="plan-cta"
		                        onClick={() => {
		                          void startBuilderPlanCheckout("builder", { context: builderUpgradeContext });
		                        }}
			                        disabled={isStartingBuilderCheckout || builderIsCurrent}
			                      >
			                        {builderIsCurrent ? "Current plan" : isStartingBuilderCheckout ? "Starting…" : "Get Builder"}
			                      </button>
			                    </div>

			                    <div className={`plan-card${architectIsCurrent ? " current" : ""}`}>
			                      <div className="plan-card-header">
			                        <div className="plan-name">Architect</div>
			                        {architectIsCurrent && <div className="plan-badge">Current</div>}
			                      </div>
		                      <div className="plan-price">
		                        <span className="plan-price-amount">$100</span>
		                        <span className="plan-price-period">/mo</span>
		                      </div>
		                      <div className="plan-subtitle">3% take · 3 communities</div>
		                      <ul className="plan-features plan-features-checks">
		                        {feature(true, "AI chats (25GB cloud history)")}
		                        {feature(true, "Access all included models")}
		                        {feature(true, "Desktop app & local tools")}
		                        {feature(true, "Cloud sync")}
		                        {feature(true, "Agent memory")}
		                        {feature(true, "Create 3 communities")}
		                        {feature(true, "Stripe payouts")}
		                        {feature(true, "Analytics")}
		                        {feature(true, "Automations")}
		                        {feature(true, "Early feature access")}
		                      </ul>
		                      <button
		                        type="button"
		                        className="plan-cta"
		                        onClick={() => {
		                          void startBuilderPlanCheckout("architect", { context: builderUpgradeContext });
		                        }}
			                        disabled={isStartingBuilderCheckout || architectIsCurrent}
			                      >
			                        {architectIsCurrent ? "Current plan" : isStartingBuilderCheckout ? "Starting…" : "Get Architect"}
			                      </button>
			                    </div>
		                  </div>
		                );
		              })()}
	              <div className={`modal-scroll-hint${showBuilderUpgradeScrollHint ? " show" : ""}`} aria-hidden="true">
	                <div className="modal-scroll-hint-icon">
	                  <svg viewBox="0 0 24 24">
	                    <path d="M6 9l6 6 6-6" />
	                  </svg>
	                </div>
	              </div>
		            </div>
	          </div>
	        </div>
	      )}


	      {showCreateCommunityModal && (
	        <div className="modal-overlay" onClick={closeCreateCommunityModal}>
	          <div className="modal create-community-modal" onClick={(event) => event.stopPropagation()}>
	            {(() => {
              const ownedCount = communities.reduce(
                (acc, community) => acc + (communityRoleById[community.id] === "owner" ? 1 : 0),
                0,
              );
	              const tier = builderBillingStatus?.builder_tier ?? "unknown";
	              const max = builderBillingStatus?.max_communities ?? 0;
		              const needsPlan = Boolean(supabaseSession && tier === "free");
		              const limitReached = Boolean(supabaseSession && tier !== "free" && max > 0 && ownedCount >= max);
		              return (
                <>
                  <div className="modal-header">
                    <div className="modal-title">Create community</div>
                    <button className="modal-close" onClick={closeCreateCommunityModal} title="Close">
                      ×
                    </button>
                  </div>
                  <div className="modal-body">
                    <div className="create-community-form">
                <div
                  className={`create-community-banner${isCreateBannerDragOver ? " drag-over" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsCreateBannerDragOver(true);
                  }}
                  onDragLeave={() => setIsCreateBannerDragOver(false)}
                  onDrop={handleCreateBannerDrop}
                >
                  {createCommunityBannerUrl ? (
                    <img src={createCommunityBannerUrl} alt="Community banner preview" />
                  ) : (
                    <div className="create-community-banner-placeholder">Banner preview</div>
                  )}
	                  <label className="create-banner-btn">
	                    Upload banner
	                    <input
	                      type="file"
	                      accept="image/*"
	                      onChange={(event) => {
	                        const file = event.target.files?.[0] ?? null;
	                        event.target.value = "";
	                        void handleCreateCommunityBannerUpload(file);
	                      }}
	                    />
	                  </label>
                  {createCommunityBannerUrl && (
                    <button
                      className="create-banner-remove"
                      type="button"
                      onClick={() => setCreateCommunityBannerUrl(null)}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="create-community-avatar-row">
                  <div
                    className={`create-community-avatar${isCreateAvatarDragOver ? " drag-over" : ""}`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setIsCreateAvatarDragOver(true);
                    }}
                    onDragLeave={() => setIsCreateAvatarDragOver(false)}
                    onDrop={handleCreateAvatarDrop}
                  >
                    {createCommunityAvatarUrl ? (
                      <img src={createCommunityAvatarUrl} alt="Community avatar preview" />
                    ) : (
                      <span>{communityInitials(createCommunityName || "Community")}</span>
                    )}
                  </div>
                  <div className="create-community-avatar-actions">
                    <label className="create-avatar-btn">
                      Upload avatar
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => void handleCreateCommunityAvatarUpload(event.target.files?.[0] ?? null)}
                      />
                    </label>
                    {createCommunityAvatarUrl && (
                      <button
                        className="create-avatar-remove"
                        type="button"
                        onClick={() => setCreateCommunityAvatarUrl(null)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <label className="create-community-field">
                  <span>Name</span>
                  <input
                    type="text"
                    placeholder="Community name"
                    value={createCommunityName}
                    onChange={(event) => setCreateCommunityName(event.target.value)}
                  />
                </label>
                <label className="create-community-field">
                  <span>Short description</span>
                  <textarea
                    placeholder="One-liner about who this is for"
                    rows={2}
                    value={createCommunityDescription}
                    onChange={(event) => setCreateCommunityDescription(event.target.value)}
                  />
                </label>
                <label className="create-community-field">
                  <span>Slug</span>
                  <input
                    type="text"
                    placeholder="your-community"
                    value={createCommunitySlug}
                    onChange={(event) => {
                      setCreateCommunitySlug(event.target.value);
                      setCreateCommunitySlugEdited(true);
                    }}
                  />
                  <span className="create-community-hint">Lowercase letters, numbers, and dashes.</span>
                </label>
                <label className="create-community-field">
                  <span>Visibility</span>
                  <select
                    className="select-styled"
                    value={createCommunityVisibility}
                    onChange={(event) =>
                      setCreateCommunityVisibility(event.target.value as "published" | "unlisted")
                    }
                  >
                    <option value="published">Published</option>
                    <option value="unlisted">Unlisted</option>
                  </select>
                </label>
                {createCommunityError && <div className="auth-error">{createCommunityError}</div>}
                {builderBillingError && <div className="auth-error">{builderBillingError}</div>}
                    </div>
                  </div>
                  <div className="modal-footer">
                    <div className="create-community-actions">
		                {!supabaseSession ? (
		                  <button className="create-community-primary" type="button" onClick={openAuthGate}>
		                    Sign in to create
		                  </button>
		                ) : (
	                  <button
	                    className="create-community-primary"
	                    type="button"
	                    onClick={() => void handleCreateCommunityPrimaryAction()}
	                    disabled={isCreatingCommunity || isStartingBuilderPortal || createCommunityName.trim().length === 0}
	                  >
	                    {isCreatingCommunity
	                      ? "Creating..."
	                      : needsPlan
	                        ? "Continue to checkout"
	                        : limitReached
	                          ? "Upgrade plan"
	                          : "Create community"}
	                  </button>
	                )}
	                <button className="create-community-secondary" onClick={closeCreateCommunityModal}>
	                  Cancel
	                </button>
	                    </div>
                  </div>
                </>
	              );
	            })()}
	          </div>
	        </div>
	      )}

        {showDeleteCommunityModal && activeCommunity && (
          <div className="modal-overlay" onClick={closeDeleteCommunityModal}>
            <div className="modal delete-community-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">Delete community</div>
                <button className="modal-close" onClick={closeDeleteCommunityModal} title="Close">
                  ×
                </button>
              </div>
              <div className="modal-body">
                <div className="model-note">
                  This permanently deletes <strong>{activeCommunity.name}</strong> and all associated data. This cannot be
                  undone.
                </div>
                <label className="create-community-field">
                  <span>Type the community name to confirm</span>
                  <input
                    type="text"
                    placeholder={activeCommunity.name}
                    value={deleteCommunityNameInput}
                    onChange={(event) => setDeleteCommunityNameInput(event.target.value)}
                    disabled={isDeletingCommunity}
                  />
                </label>
                <label className="create-community-field">
                  <span>Type delete to confirm</span>
                  <input
                    type="text"
                    placeholder="delete"
                    value={deleteCommunityConfirmInput}
                    onChange={(event) => setDeleteCommunityConfirmInput(event.target.value)}
                    disabled={isDeletingCommunity}
                  />
                </label>
                {deleteCommunityError && <div className="auth-error">{deleteCommunityError}</div>}
              </div>
              <div className="modal-footer">
                <div className="create-community-actions">
                  <button className="create-community-secondary" type="button" onClick={closeDeleteCommunityModal}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="create-community-secondary danger"
                    onClick={() => void handleConfirmDeleteCommunity()}
                    disabled={(() => {
                      if (isDeletingCommunity) return true;
                      const expected = activeCommunity.name.trim().toLowerCase();
                      const nameOk =
                        expected.length > 0 && deleteCommunityNameInput.trim().toLowerCase() === expected;
                      const keywordOk = deleteCommunityConfirmInput.trim().toLowerCase() === "delete";
                      return !(nameOk && keywordOk);
                    })()}
                  >
                    {isDeletingCommunity ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      {appToast && (
        <div className="app-toast" role="status" aria-live="polite">
          <div className="app-toast-inner">{appToast}</div>
        </div>
      )}
    </div>
  );
}
