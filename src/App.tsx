import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import "highlight.js/styles/github-dark.css";
import { TauriRuntimeClient } from "./runtime/arp/tauriClient";
import type { RuntimeClient } from "./runtime/arp/client";
import {
  ARP_PROTOCOL_VERSION,
  type MessageRecord as ArpMessageRecord,
  type ProjectRecord as ArpProjectRecord,
  type SessionResume as ArpSessionResume,
  type ThreadRecord as ArpThreadRecord,
  type ToolCallRecord as ArpToolCallRecord,
  type TurnRecord as ArpTurnRecord,
} from "./runtime/arp/types";
import { TauriDesktopShellClient } from "./runtime/shell/tauriClient";
import type { DesktopShellClient } from "./runtime/shell/client";
import {
  runPhaseReducer,
  type AgentMode,
} from "./features/harness/runPhase";
import { useStreamingState } from "./features/harness/useStreamingState";
import { useLastClickWinsController } from "../shared/useLastClickWinsController";
import { useCommunityChatRealtime } from "../shared/useCommunityChatRealtime";
import { useCommunityChatViewport } from "../shared/useCommunityChatViewport";
import { useCommunityChatLightbox } from "../shared/useCommunityChatLightbox";
import { useMessageAttachmentInputController } from "../shared/useMessageAttachmentInputController";
import { useCommunityChatDataController } from "../shared/useCommunityChatDataController";
import { useCommunityChatMutationController } from "../shared/useCommunityChatMutationController";
import { useCommunityInviteController } from "../shared/useCommunityInviteController";
import { useCommunityResourceController } from "../shared/useCommunityResourceController";
import { useCommunityResourceEditorController } from "../shared/useCommunityResourceEditorController";
import { useCommunityCreateController } from "../shared/useCommunityCreateController";
import { useCommunityDeleteController } from "../shared/useCommunityDeleteController";
import { useCommunityRailOrder } from "../shared/useCommunityRailOrder";
import { useBuilderUpgradeScrollHint } from "../shared/useBuilderUpgradeScrollHint";
import { useWorkspaceAutoScroll } from "../shared/useWorkspaceAutoScroll";
import { useModelPickerController } from "../shared/useModelPickerController";
import { useCommunityAdminController } from "../shared/useCommunityAdminController";
import { useCommunityAgentDraftController } from "../shared/useCommunityAgentDraftController";
import { useCommunitySettingsGovernanceController } from "../shared/useCommunitySettingsGovernanceController";
import { useCommunitySettingsDataController } from "../shared/useCommunitySettingsDataController";
import { useCommunitySettingsFormController } from "../shared/useCommunitySettingsFormController";
import { useCommunityAdminAnalyticsLifecycle } from "../shared/useCommunityAdminAnalyticsLifecycle";
import { useCommunityAgentLandingLifecycle } from "../shared/useCommunityAgentLandingLifecycle";
import { useCommunityAgentMembersLifecycle } from "../shared/useCommunityAgentMembersLifecycle";
import { useCommunityMembersTabLifecycle } from "../shared/useCommunityMembersTabLifecycle";
import { useCommunityResourcesTabLifecycle } from "../shared/useCommunityResourcesTabLifecycle";
import { useCommunitySettingsAccessLifecycle } from "../shared/useCommunitySettingsAccessLifecycle";
import { createThreadContextController } from "../shared/threadContextController";
import {
  type CommunityEvidenceItem,
} from "../shared/communityEvidence";
import {
  buildReplyPrefix,
  extractTextFromContentJson,
  parseMessageAttachments,
  parseReplyPrefix,
  truncateReplyPreview,
  type CommunityMessageAttachment,
} from "../shared/communityMessageParsing";
import {
  buildDesktopBestInviteLink,
  formatInviteLabel,
  normalizeInviteCode,
} from "../shared/communityInviteLinks";
import { isValidCommunitySlug, slugifyCommunityName } from "../shared/communitySlug";
import {
  MessageCopyAction,
  MessageFooter,
  MessageSourcesAction,
} from "../shared/MessageFooterActions";
import {
  extractInferenceLaneFallbacksFromMessageContent,
  extractInferenceSourceFromMessageContent,
  extractModelIdFromMessageContent,
  formatModelAttributionLabel,
} from "../shared/modelAttributionUi";
import {
  captureBrandosAidFromLocation,
  clearPendingPurchaseClaimToken,
  getBrandosAidForCommunitySlug,
  listPendingPurchaseClaimsRpc,
  readPendingPurchaseClaimToken,
  redeemPendingPurchaseClaimsRpc,
  redeemPurchaseClaimRpc,
  storePendingPurchaseClaimToken,
  type PendingPurchaseClaim
} from "../shared/pay_first";
import { usePendingInviteJoinController } from "../shared/usePendingInviteJoinController";
import { usePendingPublicCommunityJoinController } from "../shared/usePendingPublicCommunityJoinController";
import { useDesktopDiscoverController } from "../shared/useDesktopDiscoverController";
import {
  readProfileDraftForUser,
  writeProfileDraftForUser,
} from "../shared/profileDraftStorage";
import {
  traceThreadContext,
} from "../shared/threadTitleUi";
import {
  buildProjectThreadGroups,
  buildProjectByIdMap,
  filterThreadsWithoutProject,
  normalizeThreadLane,
  normalizeThreadStorageMode,
  resolveCloudThreadProjectId as resolveCloudThreadProjectIdShared,
  resolveGeneralCloudProjectId,
  resolvePreferredCloudProjectId,
  resolveThreadProjectId as resolveThreadProjectIdShared,
  storageModeForThreadLane,
  sortProjectsByRootPathLengthDesc,
} from "../shared/threadSidebarSelectors";
import {
  resolveThreadServiceDomain,
  type ThreadService,
} from "../shared/threadService";
import {
  createDesktopAppThreadServiceRouter,
  createDesktopCloudChatThreadApi,
  createDesktopCloudLensSync,
} from "./services/thread";
import {
  isUuid,
} from "../shared/appIdentity";
import {
  isLikelyImageFile,
  isLikelyTextFile,
  isSupportedChatRasterImage,
  readChatImageAsDataUrl,
  readTextAttachmentPreview,
  type ImageFileDetectionOptions,
} from "../shared/attachmentHelpers";
import { useDesktopThreadSidebarState } from "./controllers/desktop/useDesktopThreadSidebarState";
import { useDesktopThreadPanelActions } from "./controllers/desktop/useDesktopThreadPanelActions";
import { useDesktopThreadTitleViewModel } from "./controllers/desktop/useDesktopThreadTitleViewModel";
import { useDesktopThreadLifecycle } from "./controllers/desktop/useDesktopThreadLifecycle";
import { useDesktopThreadSendReadiness } from "./controllers/desktop/useDesktopThreadSendReadiness";
import { useDesktopWorkspaceAttachmentController } from "./controllers/desktop/useDesktopWorkspaceAttachmentController";
import { useDesktopSettingsImageUploadController } from "./controllers/desktop/useDesktopSettingsImageUploadController";
import { useDesktopSendMessageFlow } from "./controllers/desktop/useDesktopSendMessageFlow";
import { useDesktopRunOrchestration } from "./controllers/desktop/useDesktopRunOrchestration";
import { useDesktopThreadFeedController } from "./controllers/desktop/useDesktopThreadFeedController";
import { useDesktopThreadMetaLoaders } from "./controllers/desktop/useDesktopThreadMetaLoaders";
import { useDesktopModelBootstrapController } from "./controllers/desktop/useDesktopModelBootstrapController";
import { useDesktopModelPickerActions, type DesktopCuratedPickerModel } from "./controllers/desktop/useDesktopModelPickerActions";
import { useDesktopSlashCommands } from "./controllers/desktop/useDesktopSlashCommands";
import { useDesktopToolApprovalActions } from "./controllers/desktop/useDesktopToolApprovalActions";
import { useDesktopBuilderBillingActions } from "./controllers/desktop/useDesktopBuilderBillingActions";
import { useDesktopProfileDraftState } from "./controllers/desktop/useDesktopProfileDraftState";
import { useDesktopVoiceInputController } from "./controllers/desktop/useDesktopVoiceInputController";
import { VoiceInputButton } from "../shared/VoiceInputButton";
import { useDesktopUiLifecycleEffects } from "./controllers/desktop/useDesktopUiLifecycleEffects";
import { useDesktopAuthSessionLifecycle } from "./controllers/desktop/useDesktopAuthSessionLifecycle";
import {
  useDesktopSourcesUsed,
  type SourcesUsedState,
} from "./controllers/desktop/useDesktopSourcesUsed";
import {
  clearCreateCommunityDraft,
  createCommunityDraftId,
  loadCreateCommunityDraft,
  saveCreateCommunityDraft,
} from "../shared/communityDraftStorage";
import {
  DEFAULT_EMPTY_THREAD_LANDING,
  buildDefaultCommunityEmptyThreadLanding,
  normalizeCommunityAgentDraftForSave,
  normalizeCommunityAgentLanding,
  type CommunityAgentLanding,
} from "../shared/communityAgentLanding";
import {
  buildCsv,
  dateKeyLocal,
  formatChatTime,
  formatCount,
  formatMoneyBaseUnits,
  formatPercent,
  formatRelativeTimeFromEpochSeconds as formatRelativeTime,
  parseContentRangeTotal,
} from "../shared/contentFormatting";
import {
  formatBuilderTierLabel,
  hasBuilderTierPaidAccess,
  isBuilderTierFree,
  normalizeBuilderTierForUi,
  formatPlanPrice,
  parseBuilderBillingReturn,
  type BuilderBillingReturn,
} from "../shared/builderBilling";
import { canUseCreatorDevTierOverride } from "../shared/devTierOverride";
import {
  copyTextToClipboard,
  downloadTextFile,
  formatCommandForDisplay,
  formatCommandPreview,
  formatToolLabel,
  getAvatarColor,
  getInitials,
  shouldShowCommunitySenderMeta,
  shouldShowDateSeparator,
  shortId,
} from "../shared/chatUi";
import {
  type AppPage,
  type AppView,
  type CommunityTab,
  isCommunityRouteManagedTab,
  type SettingsPage,
  settingsGroupForPage,
} from "../shared/appShellNavigation";
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
  UserProfile as SharedUserProfile,
  UserProfileDetail as SharedUserProfileDetail,
} from "../shared/communityTypes";
import {
  deriveCommunityAccessCapabilities,
  deriveCommunityActionGuards,
  deriveCommunityNavVisibility,
} from "../shared/communityAccessViewModel";
import {
  deriveBackFromWorkspaceSettingsFallbackTransition,
  deriveBackToWorkspaceFallbackTransition,
  deriveOpenCommunityTabTransition,
  deriveOpenDiscoverTransition,
  deriveToggleWorkspaceSettingsTransition,
} from "../shared/appNavTransitions";
import {
  formatBackTargetLabel as formatBackTargetLabelShared,
  popNavSnapshot,
  pushUniqueNavSnapshot,
} from "../shared/navSnapshot";
import {
  parseEmbedUrl,
  renderTextWithLinks as renderTextWithLinksShared,
} from "../shared/linkEmbedUi";
import { communityInitials } from "../shared/messageMetadataUi";
import { renderMarkdown } from "../shared/markdownUi";
import {
  readAvatarFileAsSquareDataUrl,
  readBannerFileAsWideDataUrlWithinLimit,
} from "../shared/imageTransforms";
import { confirmDiscardUnsavedCommunitySettingsDesktop } from "../shared/communityUnsavedGuard";
import {
  decodeJwtPayload,
  ensureSupabaseSessionForAuthenticatedSend,
  ensureSupabaseSessionForRequest,
  fetchWithSupabaseAuthShared,
  fetchWithSupabasePublicShared,
  getSupabaseAnonKey,
  getSupabaseAuthUid,
  getSupabaseUrl,
  readSupabaseError,
  refreshSupabaseSessionWithLock,
  refreshSupabaseSession,
  type SupabaseSession,
} from "../shared/supabaseAuthCore";
import {
  beginGoogleSupabaseSignIn,
  expireSupabaseSessionFailClosed,
  revokeSupabaseSessionRemote,
  SUPABASE_SESSION_EXPIRED_MESSAGE,
} from "../shared/supabaseAuthFlow";
import { consumeSupabaseOAuthCallback } from "../shared/supabaseOAuthCallback";
import { clearOAuthCallbackParamsFromLocation } from "../shared/supabasePkce";
import {
  buildTeachMemoryText,
  deriveTeachCandidateTitle,
  hashTeachCandidateContent,
  listCommunityMemoryCandidatesRpc,
  promoteCommunityMemoryCandidateRpc,
  proposeCommunityMemoryCandidateRpc,
  rejectCommunityMemoryCandidateRpc,
  type CommunityMemoryCandidateRow,
} from "../shared/communityMemoryCandidates";
import { resetDesktopSessionStateAfterSignOut } from "./auth/resetSessionState";
import { DesktopCommunityRail } from "./components/DesktopCommunityRail";
import { DesktopTopbar } from "./components/DesktopTopbar";
import { CommunityMemberList } from "./components/CommunityMemberList";
import { DesktopCommunitySecondaryTabs } from "./components/DesktopCommunitySecondaryTabs";
import type { CommunityResource as CommunityResourceContract } from "./components/communityResourcesContracts";
import { ThreadSidebarPanel } from "./components/ThreadSidebarPanel";
import { ThreadSidebarSessionItem } from "./components/ThreadSidebarSessionItem";
import { DesktopCommunityChatTab } from "./components/DesktopCommunityChatTab";
import { DesktopModelPickerPopover } from "./components/DesktopModelPickerPopover";
import { DesktopTeachCandidateModal } from "./components/DesktopTeachCandidateModal";
import { DesktopSourcesUsedModal } from "./components/DesktopSourcesUsedModal";
import { DesktopCommunitySettingsTab } from "./components/DesktopCommunitySettingsTab";
import { DesktopCommunityAiAgentTab } from "./components/DesktopCommunityAiAgentTab";
import { resolveUserAccessPolicy } from "../shared/capabilities";
import { CommunityNav } from "../shared/CommunityNav";
import { BuilderUpgradeModal } from "../shared/BuilderUpgradeModal";
import { DiscoverCommunityCard } from "../shared/DiscoverCommunityCard";
import { formatCommunityVisibilityLabel, isPublishedCommunityVisibility } from "../shared/communityVisibility";
import { openAiLogo } from "../shared/providerLogos";
import { SettingsNavList } from "../shared/SettingsNavList";
import {
  DEFAULT_ACTIVE_MODEL_ID,
  DEFAULT_GUEST_MODEL_ID,
  FREE_MODEL_ALLOWLIST as SHARED_FREE_MODEL_ALLOWLIST,
  FREE_MODEL_LABELS as SHARED_FREE_MODEL_LABELS,
  getDefaultModelToggles,
  getPremiumModelCatalog,
  inferModelProviderId,
  isFreeModelId,
  type ModelSectionId,
  type ModelToggle,
} from "../shared/modelCatalog";
import { parseModelRegistryRows } from "../shared/modelRegistry";
import {
  APP_THEME_OPTIONS,
  applyAppThemeAttributes,
  parseAppTheme,
  type AppTheme,
} from "../shared/theme";

type ThreadRecord = ArpThreadRecord;
type ThreadLane = ArpThreadRecord["thread_lane"];
type ProjectRecord = ArpProjectRecord;
type CloudProjectRecord = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string;
  created_at: number;
  updated_at: number;
  root_path: string;
};
type ToolCallRecord = ArpToolCallRecord & {
  duration_ms?: number | null;
  raw_output_file_id?: string | null;
  egress_policy?: string;
  command?: string;
};

type ToolApprovalRequestedPayload = {
  session_id: string;
  tool_call_id: string;
  tool_name: string;
  args_json: string;
};

type AgentStatusPayload = {
  session_id: string;
  status: "thinking" | "working" | "idle";
  tool_name: string | null;
  tool_args_preview: string | null;
};

type RunningTool = {
  id: string;
  name: string;
  preview: string | null;
  status: "running" | "ok" | "error";
};

type MessageRecord = ArpMessageRecord;
type TurnRecord = ArpTurnRecord;
type SessionResume = ArpSessionResume;

type PersonalMemoryItemRecord = {
  id: string;
  content: string;
  scope: string;
  scope_id: string | null;
  pinned: number;
  provenance_event_id: string | null;
  created_at: number;
  updated_at: number;
};

type ToolDebug = {
  id: string;
  text: string;
};

type ProviderKey = {
  id: string;
  label: string;
  hasKey: boolean;
  inputValue: string;
  error?: string | null;
};

type ChatgptAuthSummary = {
  email?: string | null;
  account_id?: string | null;
  access_token_expires_at?: number | null;
};

type PendingInviteRecord = {
  invite_key: string;
  status: "pending" | "dismissed" | "joined" | "expired" | string;
  first_seen_at: number;
  updated_at: number;
  dismissed_at: number | null;
  join_intent_at: number | null;
  joined_at: number | null;
  expired_at: number | null;
  community_id: string | null;
  community_name: string | null;
  source: string | null;
};

type BuilderBillingStatus = {
  user_id: string;
  builder_tier: string;
  max_communities: number;
  platform_fee_bps: number;
  has_payouts: boolean;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
};

type ProductState = {
  user_id: string;
  auth_state: string;
  builder_tier: string;
  builder_plan_code: string;
  builder_plan_price_usd: number;
  is_builder_paid: boolean;
  max_communities: number;
  platform_fee_bps: number;
  has_payouts: boolean;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  ai_history_bytes_used: number | string;
  ai_history_bytes_cap: number | string;
  platform_inference_standard_used: number | string;
  platform_inference_standard_cap: number;
};

type BuilderUpgradeContext = "builder" | "create_community";

type SecretScanRedaction = {
  kind: string;
  count: number;
};

type SecretScanResult = {
  redacted: string;
  blocked: boolean;
  redactions: SecretScanRedaction[];
};

type CommunityRecord = {
  id: string;
  slug: string;
  name: string;
  owner_id?: string;
  description?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  visibility?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type PublicCommunityRecord = {
  slug: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  visibility: string;
  created_at: string;
  updated_at: string;
};

type DiscoverCommunity = SharedDiscoverCommunity<PublicCommunityRecord>;
type ChatLightboxImage = SharedChatLightboxImage;
type MessageReaction = SharedMessageReaction;

type Attachment = {
  id: string;
  path: string;
  name: string;
  type: "image" | "file";
  size: number;
  previewDataUrl?: string; // base64 data URL for image thumbnails
};

type MessageAttachment = CommunityMessageAttachment;
type CommunityChatMessage = SharedCommunityChatMessage<MessageAttachment>;

const REACTION_EMOJIS = ["👍", "❤️", "😂", "🔥", "🫡", "🎉"];
const COMMUNITY_CHAT_PAGE_SIZE = 50;
const COMMUNITY_CHAT_LOAD_MORE_THRESHOLD_PX = 140;
const MAX_COMMUNITY_ATTACHMENTS_PER_MESSAGE = 8;
const MAX_COMMUNITY_IMAGE_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB (client-side; still compressed before sending)
const MAX_COMMUNITY_FILE_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_COMMUNITY_TEXT_ATTACHMENT_BYTES = 200 * 1024; // 200KB
const MAX_COMMUNITY_IMAGE_DATA_URL_CHARS = 600_000; // ~0.6MB base64 payload
const DESKTOP_IMAGE_FILE_DETECTION_OPTIONS: ImageFileDetectionOptions = {
  allowSvg: true,
  allowAvif: false,
};
const DESKTOP_FREE_MODEL_ALLOWLIST = SHARED_FREE_MODEL_ALLOWLIST;
const DESKTOP_FREE_MODEL_LABELS = SHARED_FREE_MODEL_LABELS;
const DESKTOP_PREMIUM_MODEL_CATALOG = getPremiumModelCatalog("desktop");
const DEFAULT_MODEL_TOGGLES: ModelToggle[] = getDefaultModelToggles("desktop");

const THREAD_LANE_PREF_KEY = "arx-thread-lane-filter-v1";
const PROJECT_EXPANDED_PREF_KEY = "arx-project-expanded-v1";
const SUPABASE_SIGNED_OUT_INTENT_KEY = "arx_supabase_signed_out_v1";
const SUPABASE_SIGNED_OUT_TAB_INTENT_KEY = "arx_supabase_signed_out_tab_v1";

function hasSupabaseSignedOutIntent(): boolean {
  try {
    if (sessionStorage.getItem(SUPABASE_SIGNED_OUT_TAB_INTENT_KEY) === "1") return true;
  } catch {
    // ignore
  }
  try {
    return localStorage.getItem(SUPABASE_SIGNED_OUT_INTENT_KEY) === "1";
  } catch {
    return false;
  }
}

function clearSupabaseSignedOutIntent(): void {
  try {
    sessionStorage.removeItem(SUPABASE_SIGNED_OUT_TAB_INTENT_KEY);
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(SUPABASE_SIGNED_OUT_INTENT_KEY);
  } catch {
    // ignore
  }
}

const SLASH_COMMAND_KEYS = new Set(["ArrowUp", "ArrowDown", "Enter", "Escape"]);
const SLASH_COMMANDS = [
  { name: "/status", description: "Show session, model, and tool-call status." },
  { name: "/mode", description: "Set agent mode (/mode build|plan|explore)." },
  { name: "/approvals", description: "Show global + session approval rules." },
  { name: "/diff", description: "Propose `git diff` for approval." },
  { name: "/test", description: "Detect and propose a test command." },
  { name: "/remember", description: "Save a memory note (/remember Title :: Body) or open the memory editor." }
];

const APPROVAL_PRESETS: Record<
  "read-only" | "agent" | "agent-full",
  { label: string; description: string; rules: string }
> = {
  "read-only": {
    label: "Read Only",
    description: "Requires approval to edit files and run commands.",
    rules: [
      "allow pwd",
      "allow ls",
      "allow rg",
      "allow cat",
      "allow head",
      "allow tail",
      "allow git status",
      "allow git diff"
    ].join("\n")
  },
  agent: {
    label: "Agent",
    description: "Read and edit files, and run commands with approval.",
    rules: ""
  },
  "agent-full": {
    label: "Agent (full access)",
    description: "Broader command allowlist; use caution.",
    rules: [
      "allow pwd",
      "allow ls",
      "allow rg",
      "allow cat",
      "allow head",
      "allow tail",
      "allow git",
      "allow npm",
      "allow pnpm",
      "allow yarn",
      "allow bun",
      "allow cargo",
      "allow go",
      "allow python",
      "allow node",
      "allow deno",
      "allow make",
      "allow cmake"
    ].join("\n")
  }
};

type CommunityResource = CommunityResourceContract & {
  community_id: string;
  file_key: string | null;
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
};

type CommunityAccess = SharedCommunityAccess;

type TeachCandidateDraft = {
  communityId: string;
  threadId: string;
  messageId: string;
  turnId: string | null;
  evidenceItems: CommunityEvidenceItem[];
};

type CommunityAgentDraft = SharedCommunityAgentDraft;

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
  communities?: CommunityRecord;
};

type NavSnapshot = {
  page: AppPage;
  view: AppView;
  settingsPage: SettingsPage;
  communityId: string | null;
  communityTab: CommunityTab;
  threadId: string | null;
};

const desktopShellClientSingleton: DesktopShellClient = new TauriDesktopShellClient();

function App() {
  const runtimeClient = useMemo<RuntimeClient>(() => new TauriRuntimeClient(), []);
  const shellClient = useMemo<DesktopShellClient>(() => desktopShellClientSingleton, []);
  const [runtimeSupportsCursorResume, setRuntimeSupportsCursorResume] = useState(false);

  const [threads, setThreads] = useState<ThreadRecord[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadSearchQuery, setThreadSearchQuery] = useState("");
  const [threadLaneFilter, setThreadLaneFilter] = useState<ThreadLane>(() => {
    const saved =
      typeof window !== "undefined" ? (window.localStorage.getItem(THREAD_LANE_PREF_KEY) ?? "").trim() : "";
    return saved === "chat" ? "chat" : "agent";
  });
  const [emptyThreadSection, setEmptyThreadSection] = useState<string>("community");
  const threadsHydratedRef = useRef(false);
  const [commandInput, setCommandInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const {
    isDraggingOver,
    handleAddAttachment,
    handleRemoveAttachment,
    handleDragOver,
    handleDrop,
  } = useDesktopWorkspaceAttachmentController<Attachment>({
    shellClient,
    setAttachments,
    toAttachment: (result) => ({
      id: result.id,
      path: result.path,
      name: result.name,
      type: result.file_type,
      size: result.size,
      previewDataUrl: result.preview_data_url ?? undefined,
    }),
  });
  const [toolCalls, setToolCalls] = useState<ToolCallRecord[]>([]);
  const [agentMode, setAgentMode] = useState<AgentMode>("build");
  const [pendingToolApproval, setPendingToolApproval] = useState<ToolApprovalRequestedPayload | null>(null);
  const [isToolApprovalSubmitting, setIsToolApprovalSubmitting] = useState(false);
  const [, setAgentStatus] = useState<AgentStatusPayload | null>(null);
  const [runningTools, setRunningTools] = useState<RunningTool[]>([]);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [turnsByAssistantEventId, setTurnsByAssistantEventId] = useState<Record<string, TurnRecord>>({});
  const [runPhase, dispatchRunPhase] = useReducer(runPhaseReducer, "idle");
  const isSending = useMemo(
    () =>
      runPhase === "preparing" ||
      runPhase === "thinking" ||
      runPhase === "awaiting_approval" ||
      runPhase === "running_tool" ||
      runPhase === "streaming" ||
      runPhase === "cancelling",
    [runPhase],
  );
  const sendInFlightRef = useRef(false);
  const sendStartedAtRef = useRef<number | null>(null);
  const [, setSendElapsedSec] = useState(0);
  const [activeView, setActiveView] = useState<AppView>("home");
  const [settingsPage, setSettingsPage] = useState<SettingsPage>("models");
  const settingsGroup = settingsGroupForPage(settingsPage);
  const [appTheme, setAppTheme] = useState<AppTheme>(() => {
    const stored = parseAppTheme(localStorage.getItem("arx-theme"));
    if (stored) return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [activePage, setActivePage] = useState<AppPage>("workspace");
  const [communityTab, setCommunityTab] = useState<CommunityTab>("chat");
  const [modelToggles, setModelToggles] = useState<ModelToggle[]>(DEFAULT_MODEL_TOGGLES);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [modelProviderById, setModelProviderById] = useState<Record<string, ProviderKey["id"]>>({});
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [modelPickerQuery, setModelPickerQuery] = useState("");
  const [modelPickerSection, setModelPickerSection] = useState<ModelSectionId>("all");
  const modelPickerRef = useRef<HTMLDivElement | null>(null);
  const modelPickerSearchRef = useRef<HTMLInputElement | null>(null);
  const [toolDebug] = useState<ToolDebug | null>(null);
  const [providerKeys] = useState<ProviderKey[]>([
    { id: "openai", label: "OpenAI", hasKey: false, inputValue: "", error: null },
    { id: "anthropic", label: "Anthropic", hasKey: false, inputValue: "", error: null },
    { id: "google", label: "Google (Gemini)", hasKey: false, inputValue: "", error: null },
    { id: "x-ai", label: "xAI", hasKey: false, inputValue: "", error: null },
  ]);
  const [chatgptAuthSummary, setChatgptAuthSummary] = useState<ChatgptAuthSummary | null>(null);
  const [isChatgptLoggingIn, setIsChatgptLoggingIn] = useState(false);
  const [chatgptAuthError, setChatgptAuthError] = useState<string | null>(null);
  const [systemPromptDraft, setSystemPromptDraft] = useState("");
  const [isLoadingSystemPrompt, setIsLoadingSystemPrompt] = useState(false);
  const [isSavingSystemPrompt, setIsSavingSystemPrompt] = useState(false);
  const [systemPromptError, setSystemPromptError] = useState<string | null>(null);
  // Model availability is derived from local capability checks (no remote "models list" fetch).
			  const [supabaseSession, setSupabaseSession] = useState<SupabaseSession | null>(null);
  const profileStorageUserId = (supabaseSession?.user?.id ?? "").trim() || null;
  const initialProfileDraft = useMemo(
    () => readProfileDraftForUser(profileStorageUserId),
    [profileStorageUserId],
  );
		  const supabaseSessionRef = useRef<SupabaseSession | null>(null);
		  const supabaseAutoRefreshTimeoutRef = useRef<number | null>(null);
		  const autoJoinInvitesAttemptedRef = useRef<Set<string>>(new Set());
		  const autoJoinPublicCommunitiesAttemptedRef = useRef<Set<string>>(new Set());
		  const supabaseRefreshInFlightRef = useRef<Promise<SupabaseSession | null> | null>(null);
		  const authSessionEpochRef = useRef(0);
		  const [authError, setAuthError] = useState<string | null>(null);
      const [pendingPurchaseClaims, setPendingPurchaseClaims] = useState<PendingPurchaseClaim[]>([]);
      const [isLoadingPendingPurchases, setIsLoadingPendingPurchases] = useState(false);
      const [pendingPurchasesError, setPendingPurchasesError] = useState<string | null>(null);
      const [isRedeemingPendingPurchases, setIsRedeemingPendingPurchases] = useState(false);
      const [pendingPurchasesSuccess, setPendingPurchasesSuccess] = useState<string | null>(null);
      const [, setIsPendingPurchasesBannerDismissed] = useState(false);
      const redeemPendingPurchasesInFlightRef = useRef(false);
      const lastAutoRedeemPendingPurchasesUserIdRef = useRef<string | null>(null);
      const autoRedeemPendingPurchasesAttemptRef = useRef(0);
      const autoRedeemPendingPurchasesTimeoutRef = useRef<number | null>(null);
      const [isRedeemingClaim, setIsRedeemingClaim] = useState(false);
      const [, setRedeemClaimError] = useState<string | null>(null);
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

  // Keep ref + state aligned so authenticated sends and refresh logic observe
  // the same session truth across hooks/controllers.
  useEffect(() => {
    supabaseSessionRef.current = supabaseSession;
  }, [supabaseSession]);

  const pendingPurchaseBannerKey = pendingPurchaseClaims
    .map((claim) => claim.community_id)
    .sort()
    .join("|");
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
  const [isCreateBannerDragOver, setIsCreateBannerDragOver] = useState(false);
  const [isCreateAvatarDragOver, setIsCreateAvatarDragOver] = useState(false);
  const [isSettingsBannerDragOver, setIsSettingsBannerDragOver] = useState(false);
  const [isSettingsAvatarDragOver, setIsSettingsAvatarDragOver] = useState(false);
		  const [pendingInvites, setPendingInvites] = useState<PendingInviteRecord[]>([]);
	  const [inviteJoinError, setInviteJoinError] = useState<string | null>(null);
	  const [isJoiningInvite, setIsJoiningInvite] = useState(false);
	  const [activeInviteGateKey, setActiveInviteGateKey] = useState<string | null>(null);
	  const [communities, setCommunities] = useState<CommunityRecord[]>([]);
	  const [communitiesLoadError, setCommunitiesLoadError] = useState<string | null>(null);
	  const [activeCommunityId, setActiveCommunityId] = useState<string | null>(null);
  const communityRailOrderStorageKey = useMemo(
    () => `arx-community-rail-order:desktop:${profileStorageUserId ?? "local"}`,
    [profileStorageUserId],
  );
  const { orderedCommunities: railCommunities, moveCommunityToIndex: handleReorderCommunityRail } =
    useCommunityRailOrder<CommunityRecord>({
      communities,
      storageKey: communityRailOrderStorageKey,
    });
	  const activeCommunityIdRef = useRef<string | null>(null);
      const navStackRef = useRef<NavSnapshot[]>([]);
      const takeNavSnapshot = (): NavSnapshot => ({
        page: activePage,
        view: activeView,
        settingsPage,
        communityId: activeCommunityId,
        communityTab,
        threadId: activeThreadId,
      });
      const pushNavSnapshot = () => {
        const snapshot = takeNavSnapshot();
        pushUniqueNavSnapshot(navStackRef.current, snapshot);
      };
      const restoreNavSnapshot = (snapshot: NavSnapshot) => {
        setActivePage(snapshot.page);
        setActiveView(snapshot.page === "workspace" ? snapshot.view : "home");
        setSettingsPage(snapshot.settingsPage);
        setActiveCommunityId(snapshot.communityId);
        setCommunityTab(snapshot.communityTab);
        setActiveThreadId(snapshot.threadId);
      };
      const goBack = (): boolean => {
        const snapshot = popNavSnapshot(navStackRef.current) as NavSnapshot | null;
        if (!snapshot) return false;
        restoreNavSnapshot(snapshot);
        return true;
      };
      const openCommunityTab = (
        nextCommunityId: string,
        nextCommunityTab: CommunityTab,
        opts?: { pushSnapshot?: boolean; clearUnread?: boolean },
      ) => {
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
        if ((opts?.pushSnapshot ?? false) && transition.shouldPushSnapshot) pushNavSnapshot();
        setActiveView(transition.nextView);
        setActivePage(transition.nextPage);
        setCommunityTab(transition.nextCommunityTab);
        if (opts?.clearUnread) setUnreadCount(0);
        setActiveCommunityId(transition.nextCommunityId);
      };
		  const [communityRoleById, setCommunityRoleById] = useState<Record<string, string>>({});
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
		  const [activeCommunityAgentLanding, setActiveCommunityAgentLanding] = useState<unknown | null>(null);
		  const activeCommunityAgentLandingCommunityIdRef = useRef<string | null>(null);
		  const communityAgentLandingFetchSeqRef = useRef(0);
		  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, UserProfile>>({});
		  const [communityInvites, setCommunityInvites] = useState<CommunityInviteRecord[]>([]);
		  const [isLoadingCommunityInvites, setIsLoadingCommunityInvites] = useState(false);
		  const [inviteMaxUsesPreset, setInviteMaxUsesPreset] = useState("unlimited");
		  const [inviteMaxUsesCustom, setInviteMaxUsesCustom] = useState("");
		  const [inviteExpiryPreset, setInviteExpiryPreset] = useState("7d");
			  const [inviteExpiryCustom, setInviteExpiryCustom] = useState("");
			  const [inviteCreateError, setInviteCreateError] = useState<string | null>(null);
			  const [isCreatingInvite, setIsCreatingInvite] = useState(false);

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
  const communitySettingsLoadedCommunityIdRef = useRef<string | null>(null);
  const communitySettingsDirtyRef = useRef(false);
  const communityPricingDirtyRef = useRef(false);
  const markCommunitySettingsDirty = () => {
    communitySettingsDirtyRef.current = true;
  };

  const [activeCommunityOwnerIsPro, setActiveCommunityOwnerIsPro] = useState<boolean | null>(null);
  const activeCommunityOwnerIsProLoadedCommunityIdRef = useRef<string | null>(null);

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
  const markCommunityAgentDraftDirty = () => {
    communityAgentDraftDirtyRef.current = true;
  };

  const beginCommunityAgentLandingEdit = (edit: CommunityAgentLandingEdit, value: string) => {
    setCommunityAgentLandingEdit(edit);
    setCommunityAgentLandingEditValue(value);
  };

  const clearCommunityAgentLandingEdit = () => {
    setCommunityAgentLandingEdit(null);
    setCommunityAgentLandingEditValue("");
  };

      const [communityMemberMuted, setCommunityMemberMuted] = useState(false);
      const [isLoadingCommunityMemberSettings, setIsLoadingCommunityMemberSettings] = useState(false);
      const [communityMemberSettingsError, setCommunityMemberSettingsError] = useState<string | null>(null);
      const [isLeavingCommunity, setIsLeavingCommunity] = useState(false);

		  const [communityMessages, setCommunityMessages] = useState<CommunityChatMessage[]>([]);
  const [communityMessageInput, setCommunityMessageInput] = useState("");
  const [communityAttachments, setCommunityAttachments] = useState<MessageAttachment[]>([]);
  const communityAttachmentsRef = useRef<MessageAttachment[]>([]);
  const communityFileInputRef = useRef<HTMLInputElement | null>(null);
  const [communityChatError, setCommunityChatError] = useState<string | null>(null);
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
  const [communityResources, setCommunityResources] = useState<CommunityResource[]>([]);
  const [resourceTitleInput, setResourceTitleInput] = useState("");
  const [resourceUrlInput, setResourceUrlInput] = useState("");
  const [resourceBodyInput, setResourceBodyInput] = useState("");
  const [resourcePinnedInput, setResourcePinnedInput] = useState(false);
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [isSavingResource, setIsSavingResource] = useState(false);
  const [openResourceEmbedId, setOpenResourceEmbedId] = useState<string | null>(null);
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [communityMembers, setCommunityMembers] = useState<CommunityMember[]>([]);
  const [selectedLibraryResourceId, setSelectedLibraryResourceId] = useState<string | null>(null);
		  const [isLoadingResources, setIsLoadingResources] = useState(false);
      const [, setJoiningDiscoverCommunityId] = useState<string | null>(null);
  const [messageReactions, setMessageReactions] = useState<MessageReaction[]>([]);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [editingMessagePrefix, setEditingMessagePrefix] = useState<string | null>(null);
  const [resourceSuccess, setResourceSuccess] = useState(false);
  const [memoryToast, setMemoryToast] = useState<string | null>(null);
  const [appToast, setAppToast] = useState<string | null>(null);
  const [teachCandidateDraft, setTeachCandidateDraft] = useState<TeachCandidateDraft | null>(null);
  const [teachCandidateTitleInput, setTeachCandidateTitleInput] = useState("");
  const [teachCandidateMemoryInput, setTeachCandidateMemoryInput] = useState("");
  const [teachCandidateSubmitError, setTeachCandidateSubmitError] = useState<string | null>(null);
  const [isSubmittingTeachCandidate, setIsSubmittingTeachCandidate] = useState(false);
  const [communityMemoryCandidates, setCommunityMemoryCandidates] = useState<CommunityMemoryCandidateRow[]>([]);
  const [isLoadingCommunityMemoryCandidates, setIsLoadingCommunityMemoryCandidates] = useState(false);
  const [communityMemoryCandidatesError, setCommunityMemoryCandidatesError] = useState<string | null>(null);
  const [reviewingCommunityMemoryCandidateId, setReviewingCommunityMemoryCandidateId] = useState<string | null>(null);
  const [communityMemoryRejectReasonById, setCommunityMemoryRejectReasonById] = useState<Record<string, string>>({});
	  const [unreadCount, setUnreadCount] = useState(0);
	  const [isUserAtBottom, setIsUserAtBottom] = useState(true);
	  const isUserAtBottomRef = useRef(true);
		  const communityMessageIdsRef = useRef<Set<string>>(new Set());
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [slashHover, setSlashHover] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  // User preference for panels (what they toggled)
  const [userWantsSessions, setUserWantsSessions] = useState(false);
  const [userWantsCommunity, setUserWantsCommunity] = useState(true);

  // Actual visibility (computed based on window size)
  const [showSidePanel, setShowSidePanel] = useState(true);
  const [showCommunityPanel, setShowCommunityPanel] = useState(false); // Right panel hidden - members moved to left nav
    const [sessionsCompact, setSessionsCompact] = useState(false);
  const {
    profileName,
    setProfileName,
    profileUsername,
    setProfileUsername,
    profileBio,
    setProfileBio,
    profileAvatarUrl,
    setProfileAvatarUrl,
    cloudProfile,
    setCloudProfile,
    profileSaveError,
    setProfileSaveError,
    profileSaveSuccess,
    setProfileSaveSuccess,
    isSavingProfile,
    setIsSavingProfile,
    isResettingLocalCache,
    setIsResettingLocalCache,
    profileSaveTimeoutRef,
    isProfileAvatarDragOver,
    setIsProfileAvatarDragOver,
  } = useDesktopProfileDraftState<UserProfileDetail>({
    profileStorageUserId,
    initialProfileDraft,
  });
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const resizeRaf = useRef<number | null>(null);
  const [expandedCommandIds, setExpandedCommandIds] = useState<Set<string>>(new Set());
  const [actionErrors] = useState<Record<string, string>>({});
  const memoryToastTimeoutRef = useRef<number | null>(null);
  const appToastTimeoutRef = useRef<number | null>(null);
  const [execPolicyRules, setExecPolicyRules] = useState("");
  const [isSavingExecPolicy, setIsSavingExecPolicy] = useState(false);
  const [execPolicyError, setExecPolicyError] = useState<string | null>(null);
  const [sessionResume, setSessionResume] = useState<SessionResume | null>(null);
  const [personalMemoryItems, setPersonalMemoryItems] = useState<PersonalMemoryItemRecord[]>([]);
  const [personalMemoryQuery, setPersonalMemoryQuery] = useState("");
  const [personalMemoryError, setPersonalMemoryError] = useState<string | null>(null);
  const [isLoadingPersonalMemory, setIsLoadingPersonalMemory] = useState(false);
  const [newPersonalMemoryContent, setNewPersonalMemoryContent] = useState("");
  const [newPersonalMemoryScope] = useState<"global" | "workspace">("global");
  const [newPersonalMemoryPinned, setNewPersonalMemoryPinned] = useState(false);
  const [slashPanel, setSlashPanel] = useState<{
    kind: "status" | "approvals" | "info";
    title: string;
    body?: string;
  } | null>(null);
  const [approvalMode, setApprovalMode] = useState<"read-only" | "agent" | "agent-full">("agent");
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<ProjectRecord | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [cloudProjects, setCloudProjects] = useState<CloudProjectRecord[]>([]);
  const [activeCloudProjectId, setActiveCloudProjectId] = useState<string | null>(null);
  const pendingCloudDraftProjectIdRef = useRef<string | null>(null);
  const [projectMenuProjectId, setProjectMenuProjectId] = useState<string | null>(null);
  const [projectExpandedById, setProjectExpandedById] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(PROJECT_EXPANDED_PREF_KEY) ?? "";
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const next: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(parsed)) {
        next[key] = value !== false;
      }
      return next;
    } catch {
      return {};
    }
  });
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const askInputRef = useRef<HTMLInputElement | null>(null);
  const [runningToolCallId, setRunningToolCallId] = useState<string | null>(null);
  const toolCallsRef = useRef<ToolCallRecord[]>([]);
  const activeModelIdRef = useRef<string | null>(null);
  const communityChatListRef = useRef<HTMLDivElement | null>(null);
  const loadOlderFromScrollRef = useRef<(() => void) | null>(null);
  const workspaceMessageListRef = useRef<HTMLDivElement | null>(null);
  const [isWorkspaceAtBottom, setIsWorkspaceAtBottom] = useState(true);
  const {
    streamingContent,
    setStreamingContent,
    streamingRunId,
    setStreamingRunId,
    streamingRenderedContent,
    streamingTokens,
    setStreamingTokens,
    streamingMeta,
    setStreamingMeta,
    streamingContentRef,
    streamingTokensRef,
    streamingMetaRef,
    scheduleStreamingUpdate,
    clearStreamingRefs,
    clearStreamingState,
  } = useStreamingState();
  const autoScrollEnabledRef = useRef(true);
  const lastWorkspaceScrollTopRef = useRef(0);
  const isLoadingThreadRef = useRef(false); // Suppresses scroll handler during thread transitions
  const capturePrependAnchorRef = useRef<() => void>(() => {});
  const clearPendingPrependAnchorRef = useRef<() => void>(() => {});
  const activeThread = useMemo(() => {
    if (!activeThreadId) return null;
    return threads.find((thread) => thread.id === activeThreadId) ?? null;
  }, [activeThreadId, threads]);

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
    getSupabaseAnonKey,
    requireAnonKey: true,
    missingConfigMessage: "Missing Supabase config.",
    missingPayloadMessage: "Message sent, but no response payload returned.",
    fetchWithSupabaseAuth,
    ensureCommunityChatThread,
    toCommunityChatMessage,
    loadCommunityChat,
    parseReplyPrefix,
    buildReplyPrefix,
    beforeSendValidate: async (text) => {
      const scan = await scanPublishContent(text);
      if (scan?.blocked) return formatSecretScanError(scan);
      return null;
    },
    onOptimisticSendScrollIntent: () => {
      setIsUserAtBottom(true);
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
      const best = buildDesktopBestInviteLink({
        shareBaseUrl: getPublicShareBaseUrl(),
        communityId: activeCommunityId,
        inviteCode: invite.code,
      });
      await copyTextToClipboard(best.link);
    },
  });

  const {
    loadPendingInvites,
    consumeInviteQueryParam,
    handleInviteGateJoin,
    handleInviteGateDismiss,
    maybeAutoJoinPendingInvites,
  } = usePendingInviteJoinController<SupabaseSession, PendingInviteRecord>({
    shellClient,
    supabaseSession,
    pendingInvites,
    activeInviteGateKey,
    autoJoinInvitesAttemptedRef,
    getSupabaseUrl,
    normalizeInviteCode,
    fetchWithSupabaseAuth,
    readSupabaseError,
    loadCommunities,
    handleSignIn,
    onJoinSuccess: (joined) => {
      openCommunityTab(joined.id, "chat");
    },
    setPendingInvites,
    setInviteJoinError,
    setIsJoiningInvite,
    setActiveInviteGateKey,
  });

  const {
    discoverCommunities,
    discoverQuery,
    setDiscoverQuery,
    discoverError,
    setDiscoverError,
    isLoadingDiscover,
    loadDiscoverCommunities,
    filteredDiscoverCommunities,
  } = useDesktopDiscoverController<DiscoverCommunity>({
    isDiscoverActive: activePage === "discover",
    getSupabaseUrl,
    fetchWithSupabasePublic,
    readSupabaseError,
  });

  const {
    openCommunityLandingExternal,
    maybeAutoJoinPendingPublicCommunity,
  } = usePendingPublicCommunityJoinController<SupabaseSession>({
    shellClient,
    supabaseSession,
    getSupabaseUrl,
    fetchWithSupabaseAuth,
    readSupabaseError,
    loadCommunities,
    autoJoinPublicCommunitiesAttemptedRef,
    getBrandosAidForCommunitySlug,
    isUuid,
    onJoinSuccess: (joinedId) => {
      openCommunityTab(joinedId, "chat");
    },
    setJoiningDiscoverCommunityId,
    setDiscoverError,
  });

  const {
    loadCommunityResources,
    handleSaveCommunityResource,
    handleDeleteResource,
  } = useCommunityResourceController<SupabaseSession, CommunityResource>({
    activeCommunityId,
    supabaseSession,
    getSupabaseUrl,
    getSupabaseAnonKey,
    requireAnonKey: true,
    missingConfigMessage: "Missing Supabase config.",
    parseEmbedUrl,
    fetchWithSupabaseAuth,
    includeCommunityIdOnPatch: true,
    includeFileKeyOnSave: true,
    clearErrorWhenEditingDeleted: false,
    saveFailureMessage: "Failed to save resource.",
    deleteFailureMessage: "Failed to delete resource.",
    resourceTitleInput,
    resourceUrlInput,
    resourceBodyInput,
    resourcePinnedInput,
    editingResourceId,
    beforeSaveValidate: async ({ title, description, rawUrl }) => {
      const scan = await scanPublishContent([title, description, rawUrl].filter(Boolean).join("\n\n"));
      if (scan?.blocked) return formatSecretScanError(scan);
      return null;
    },
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
    confirmAction: (message) => window.confirm(message),
    getMemberRefreshIncludeStatus: () => communityNavVisibility.canManageMembers,
    reloadCommunities: loadCommunities,
    reloadCommunityAccess: loadCommunityAccess,
    getProfileSaveSession: () => supabaseSessionRef.current ?? supabaseSession,
    profileName,
    profileBio,
    profileAvatarUrl,
    profileSaveTimeoutRef,
    profileSaveFailureMessage: "Failed to save profile.",
    profileSaveUnauthenticatedErrorMessage: "Sign in to save your profile.",
    applyLoadedProfileToLocal: (profile) => {
      const localName = profileName.trim();
      const localBio = profileBio.trim();
      const localAvatar = profileAvatarUrl ?? null;
      const cloudName = (cloudProfile?.display_name ?? "").trim();
      const cloudBio = (cloudProfile?.bio ?? "").trim();
      const cloudAvatar = cloudProfile?.avatar_url ?? null;
      const hasLocalEdits = localName !== cloudName || localBio !== cloudBio || localAvatar !== cloudAvatar;
      const shouldOverwriteLocal = !cloudProfile || !hasLocalEdits;
      if (!shouldOverwriteLocal) return;
      setProfileName(profile.display_name ?? "");
      setProfileBio(profile.bio ?? "");
      setProfileAvatarUrl(profile.avatar_url ?? null);
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
    clearBannerOnMissingCommunity: true,
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
    confirmAction: (message) => window.confirm(message),
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
                visibility: result.visibility,
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
    "home" | "settings",
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
    handleSettingsBannerDrop,
    handleSettingsAvatarDrop,
    handleCommunityAvatarUpload,
    handleCommunityBannerUpload,
    handleProfileAvatarUpload,
    handleProfileAvatarDrop,
  } = useDesktopSettingsImageUploadController({
    setIsSettingsBannerDragOver,
    setIsSettingsAvatarDragOver,
    setIsProfileAvatarDragOver,
    setCommunitySettingsAvatarUrl,
    setCommunitySettingsBannerUrl,
    setCommunitySettingsError,
    setCommunitySettingsBannerUploadError,
    setIsProcessingCommunitySettingsBanner,
    markCommunitySettingsDirty,
    isLikelyDesktopImageFile: (file) => isLikelyImageFile(file, DESKTOP_IMAGE_FILE_DETECTION_OPTIONS),
    maxCommunityImageDataUrlChars: MAX_COMMUNITY_IMAGE_DATA_URL_CHARS,
    setProfileAvatarUrl,
    setAuthError,
  });

  const slashState = useMemo(() => {
    const trimmed = commandInput.trim();
    const query = trimmed.startsWith("/")
      ? trimmed.slice(1).toLowerCase()
      : null;
    if (query === null) {
      return {
        query: null as string | null,
        filtered: [] as typeof SLASH_COMMANDS,
        active: null as (typeof SLASH_COMMANDS)[number] | null
      };
    }
    const filtered = SLASH_COMMANDS.filter((cmd) =>
      cmd.name.slice(1).toLowerCase().startsWith(query)
    );
    const active =
      filtered.length > 0
        ? filtered[Math.min(slashIndex, filtered.length - 1)]
        : null;
    return { query, filtered, active };
  }, [commandInput, slashIndex]);

  const { loadModelToggles, loadActiveModel, loadChatgptAuthSummary } =
    useDesktopModelBootstrapController({
      shellClient,
      runtimeClient,
      preferredModelId: DEFAULT_ACTIVE_MODEL_ID,
      freeModelAllowlist: DESKTOP_FREE_MODEL_ALLOWLIST,
      defaultModelToggles: DEFAULT_MODEL_TOGGLES,
      modelToggles,
      activeModelId,
      providerKeys,
      isModelReady,
      setModelToggles,
      setActiveModelId,
      setChatgptAuthSummary,
    });

  useDesktopAuthSessionLifecycle<SupabaseSession>({
    session: supabaseSession,
    sessionRef: supabaseSessionRef,
    threadsHydratedRef,
    refreshTimeoutRef: supabaseAutoRefreshTimeoutRef,
    refreshLocked: refreshSupabaseSessionLocked,
    onMountBootstrap: async () => {
      captureBrandosAidFromLocation();
      void loadThreads();
      void loadProjects();
      void loadWorkspaceRoot();
      void loadActiveProject();
      void loadModelToggles();
      void loadActiveModel();
      void loadChatgptAuthSummary();
      void loadExecPolicyRules();
      void loadPendingInvites();
      void consumeInviteQueryParam();
      try {
        const oauthBootstrap = await consumeOAuthHash();
        if (oauthBootstrap !== "session_set") {
          await loadSupabaseSession();
        }
      } catch {
        await loadSupabaseSession();
      }
    },
    onSessionAvailable: (session) => {
      void loadCommunities(session);
      void loadCloudProjects(session);
      void maybeAutoJoinPendingInvites(session);
      void maybeAutoJoinPendingPublicCommunity(session);
      void loadPendingPurchaseClaims(session);
      void loadBuilderBillingStatus(session);
      void loadSelfProfile(session);
      void loadModelRegistry(session);
    },
    onFocusWithSession: (current) => {
      void loadCommunities(current);
      void loadCloudProjects(current);
      void loadBuilderBillingStatus(current);
      void loadSelfProfile(current);
      void loadModelRegistry(current);
    },
  });

  useEffect(() => {
    if (supabaseSession) return;
    setCloudProjects([]);
    setActiveCloudProjectId(null);
  }, [supabaseSession]);

  useEffect(() => {
    let cancelled = false;
    void runtimeClient
      .initialize()
      .then((init) => {
        if (cancelled) return;
        if (init.protocol_version !== ARP_PROTOCOL_VERSION) {
          console.warn(
            `[ARP] Protocol mismatch (ui=${ARP_PROTOCOL_VERSION}, runtime=${init.protocol_version}); disabling cursor resume.`
          );
          setRuntimeSupportsCursorResume(false);
          return;
        }
        const supportsCursorResume = Boolean(
          init.capabilities.cursor_resume && init.capabilities.local_db_events
        );
        setRuntimeSupportsCursorResume(supportsCursorResume);
      })
      .catch(() => {
        if (cancelled) return;
        setRuntimeSupportsCursorResume(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runtimeClient]);

		  useEffect(() => {
		    if (activeInviteGateKey) return;
	    if (activePage !== "workspace" || activeView === "settings") return;
	    if (showCreateCommunityModal || showResourceModal) return;

	    const candidates = pendingInvites
	      .filter((invite) => invite.status === "pending" && invite.source === "url")
	      .sort((a, b) => b.updated_at - a.updated_at);
	    const next = candidates[0] ?? null;
	    if (!next) return;
	    setActiveInviteGateKey(next.invite_key);
	  }, [
	    activeInviteGateKey,
	    activePage,
	    activeView,
	    pendingInvites,
	    showCreateCommunityModal,
	    showResourceModal
	  ]);

	  useEffect(() => {
	    if (!activeInviteGateKey) return;
	    const record = pendingInvites.find((invite) => invite.invite_key === activeInviteGateKey) ?? null;
	    if (!record || record.status !== "pending") {
	      setActiveInviteGateKey(null);
	    }
	  }, [activeInviteGateKey, pendingInvites]);

  useEffect(() => {
    applyAppThemeAttributes(appTheme, document.documentElement);
    localStorage.setItem("arx-theme", appTheme);
  }, [appTheme]);

  useEffect(() => {
    localStorage.setItem(THREAD_LANE_PREF_KEY, threadLaneFilter);
  }, [threadLaneFilter]);

  useEffect(() => {
    localStorage.setItem(PROJECT_EXPANDED_PREF_KEY, JSON.stringify(projectExpandedById));
  }, [projectExpandedById]);

  useEffect(() => {
    if (activePage === "workspace") return;
    if (activeView !== "settings") return;
    setActiveView("home");
  }, [activePage, activeView]);

  useEffect(() => {
    // Reset scroll state for new thread (ChatGPT-like behavior)
    // Set loading flag to suppress scroll handler until auto-scroll completes
    isLoadingThreadRef.current = true;
    autoScrollEnabledRef.current = true;
    setIsWorkspaceAtBottom(true);
    lastWorkspaceScrollTopRef.current = 0;
    dispatchRunPhase({ type: "reset" });

    if (!activeThreadId) {
      // Draft state: clear thread-scoped UI while preserving the composer.
      setMessages([]);
      setToolCalls([]);
      setTurnsByAssistantEventId({});
      setSessionResume(null);
      setAgentStatus(null);
      setRunningTools([]);
      setSlashPanel(null);
      setPendingToolApproval(null);
      setIsToolApprovalSubmitting(false);
      clearStreamingState();

      isLoadingThreadRef.current = false;
      return;
    }
    void loadMessages(activeThreadId);
    void loadTurns(activeThreadId);
    void loadSessionResume(activeThreadId);
  }, [activeThreadId, activeProject?.id]);

  const activeThreadRefreshKeyRef = useRef<string>("");

  const isSameThreadRecord = (a: ThreadRecord, b: ThreadRecord): boolean =>
    a.id === b.id &&
    a.title === b.title &&
    a.engine_id === b.engine_id &&
    a.model_id === b.model_id &&
    a.thread_lane === b.thread_lane &&
    a.storage_mode === b.storage_mode &&
    a.project_id === b.project_id &&
    a.workspace_path === b.workspace_path &&
    a.workspace_fingerprint === b.workspace_fingerprint &&
    a.community_id === b.community_id &&
    a.context_version === b.context_version &&
    a.created_at === b.created_at &&
    a.updated_at === b.updated_at &&
    a.last_event_at === b.last_event_at &&
    a.last_seq === b.last_seq;

  useEffect(() => {
    if (!activeThreadId) {
      activeThreadRefreshKeyRef.current = "";
      return;
    }
    const fromState = threads.find((thread) => thread.id === activeThreadId) ?? null;
    if (fromState?.model_id) {
      setActiveModelId(fromState.model_id);
    }
    const refreshKey = fromState
      ? [
          fromState.id,
          fromState.updated_at,
          fromState.context_version,
          fromState.model_id ?? "",
          fromState.community_id ?? "",
          fromState.storage_mode,
        ].join("|")
      : `${activeThreadId}|missing`;
    if (activeThreadRefreshKeyRef.current === refreshKey) {
      return;
    }
    activeThreadRefreshKeyRef.current = refreshKey;
    void getThreadRecord(activeThreadId)
      .then((thread) => {
        if (!thread) return;
        setThreads((prev) => {
          const idx = prev.findIndex((t) => t.id === thread.id);
          if (idx === -1) return prev;
          const existing = prev[idx];
          if (isSameThreadRecord(existing, thread)) return prev;
          const next = [...prev];
          next[idx] = thread;
          return next;
        });
        if (thread.model_id) {
          setActiveModelId(thread.model_id);
        }
      })
      .catch(() => {
        // Non-fatal; keep current selection.
      });
  }, [activeThreadId, runtimeClient, threads]);

  useEffect(() => {
    if (activeView !== "settings" || settingsPage !== "memory") return;
    const q = personalMemoryQuery.trim();
    const handle = window.setTimeout(() => {
      void searchPersonalMemoryItems(q);
    }, 150);
    return () => window.clearTimeout(handle);
  }, [activeView, settingsPage, personalMemoryQuery, activeProject?.id, workspaceRoot]);

  useEffect(() => {
    void loadApprovalMode();
  }, []);

  function getEffectiveWorkspacePath(): string {
    return (activeThread?.workspace_path ?? activeProject?.root_path ?? workspaceRoot ?? "").trim();
  }

  async function getThreadRecord(threadId: string): Promise<ThreadRecord | null> {
    const thread = threads.find((candidate) => candidate.id === threadId) ?? null;
    if (!thread) return null;
    const service = desktopThreadServiceRouter.resolveByThread(thread);
    return (await service.getThread(threadId)) as ThreadRecord | null;
  }

  async function listLocalThreads(): Promise<ThreadRecord[]> {
    return runtimeClient.listThreads();
  }

  const getCommunityNameById = useCallback((communityId: string): string | null => {
    const id = String(communityId ?? "").trim();
    if (!id) return null;
    const community = communities.find((candidate) => candidate.id === id) ?? null;
    if (!community) return null;
    const name = (community.name ?? "").trim();
    if (name) return name;
    const slug = (community.slug ?? "").trim();
    return slug || null;
  }, [communities]);

  const desktopCloudChatThreadApi = createDesktopCloudChatThreadApi({
    getSupabaseUrl,
    fetchWithSupabaseAuth,
    fetchWithSupabasePublic,
    readSupabaseError,
    getSupabaseAuthUid,
    toUnixSecondsFromIso,
    getThreads: () => threads,
    setThreads,
    getActiveModelId: () => activeModelId,
    getPersonalSystemPrompt: () => systemPromptDraft,
    getCommunityNameById,
    freeModelAllowlist: DESKTOP_FREE_MODEL_ALLOWLIST,
    hasChatgptAuth: () => Boolean(chatgptAuthSummary),
    refreshHasChatgptAuth: async () => {
      const summary = await shellClient.getChatgptAuthSummary();
      return Boolean(summary);
    },
    runtimeTurnV2Enabled: String((import.meta.env.VITE_ENABLE_RUNTIME_TURN_V2 as string | undefined) ?? "false")
      .trim()
      .toLowerCase() === "true",
    chatgptCloudTurn: (args) => shellClient.chatgptCloudTurn(args),
  });
  const setThreadCommunityLensInCloud = createDesktopCloudLensSync({
    getSupabaseUrl,
    fetchWithSupabaseAuth,
    readSupabaseError,
    toUnixSecondsFromIso,
    setThreads,
    getCloudThreadRecord: desktopCloudChatThreadApi.getCloudThreadRecord,
  });

  async function createCloudChatThread(thread: ThreadRecord): Promise<ThreadRecord | null> {
    const session = supabaseSessionRef.current;
    if (!session) {
      setAuthError("Sign in to create cloud chat threads.");
      await handleSignIn();
      return null;
    }
    const created = await desktopCloudChatThreadApi.createCloudChatThread(thread, session);
    void loadCloudProjects(session);
    return created;
  }

  async function deleteCloudChatThread(threadId: string): Promise<void> {
    const session = supabaseSessionRef.current;
    if (!session) {
      setAuthError("Sign in to manage cloud chat threads.");
      await handleSignIn();
      return;
    }
    await desktopCloudChatThreadApi.deleteCloudChatThread(threadId, session);
  }

  const desktopThreadServiceRouter = createDesktopAppThreadServiceRouter({
    threads,
    runtimeClient,
    getCommunityNameById,
    getSession: () => supabaseSessionRef.current,
    listCloudChatThreads: desktopCloudChatThreadApi.listCloudChatThreads,
    getCloudThreadRecord: desktopCloudChatThreadApi.getCloudThreadRecord,
    createCloudChatThread,
    deleteCloudChatThread,
    setThreadCommunityLensInCloud,
    addCloudMessage: desktopCloudChatThreadApi.addCloudMessage,
    sendCloudTurn: desktopCloudChatThreadApi.sendCloudTurn,
    setCloudThreadTitle: desktopCloudChatThreadApi.setCloudThreadTitle,
    setCloudThreadEngine: desktopCloudChatThreadApi.setCloudThreadEngine,
    listLocalThreads,
    setThreadCommunityLensLocal,
  });

  function resolveThreadServiceForThreadId(threadId: string): ThreadService {
    try {
      return desktopThreadServiceRouter.resolveByThreadId(threadId);
    } catch (error) {
      // New draft threads can be created and sent before React state re-renders with the thread row.
      // Fall back to the draft lane domain to keep send flow deterministic.
      const active = activeThreadId
        ? threads.find((thread) => thread.id === activeThreadId) ?? null
        : null;
      const fallbackLane: ThreadLane = (() => {
        if (active) {
          const activeLane = normalizeThreadLane(active.thread_lane, active.engine_id);
          if (activeLane === "chat" && !supabaseSessionRef.current) return "agent";
          return activeLane;
        }
        if (threadLaneFilter === "chat") return supabaseSessionRef.current ? "chat" : "agent";
        if (threadLaneFilter === "agent") return "agent";
        if (activeProject) return "agent";
        return supabaseSessionRef.current ? "chat" : "agent";
      })();
      const fallbackStorageMode = storageModeForThreadLane(fallbackLane);
      console.warn(
        `Thread service routing fallback for thread_id=${threadId} via ${fallbackLane}/${fallbackStorageMode}.`,
        error,
      );
      return desktopThreadServiceRouter.resolveByLane(fallbackLane, fallbackStorageMode);
    }
  }

  const resolveThreadStorageMode = useCallback((sessionId: string) => {
    const service = resolveThreadServiceForThreadId(sessionId);
    return service.storageMode;
  }, [resolveThreadServiceForThreadId]);

  const {
    loadMessages,
    loadToolCalls,
    handleLoadOlderMessages,
    hasOlderMessagesForActiveThread,
    messageLoadErrorForActiveThread,
    isLoadingOlderMessages,
  } = useDesktopThreadFeedController({
    activeThreadId,
    runtimeClient,
    runtimeSupportsCursorResume,
    messages,
    setMessages,
    setToolCalls,
    threads,
    resolveThreadStorageMode,
    supabaseSessionRef,
    getSupabaseUrl,
    fetchWithSupabaseAuth,
    readSupabaseError,
  });

  useEffect(() => {
    if (!threadsHydratedRef.current) return;
    if (!activeThreadId) return;
    if (threads.some((thread) => thread.id === activeThreadId)) return;
    const selectable = threads.filter((thread) => (thread.last_seq ?? 0) > 0);
    setActiveThreadId(selectable.length > 0 ? selectable[0].id : null);
  }, [activeThreadId, threads]);

  const { loadTurns, loadSessionResume } = useDesktopThreadMetaLoaders({
    runtimeClient,
    resolveThreadServiceForThreadId,
    setTurnsByAssistantEventId,
    setSessionResume,
  });

  async function cancelRunForThread(threadId: string): Promise<boolean> {
    return runtimeClient.cancelRun(threadId);
  }

  function sortPersonalMemory(items: PersonalMemoryItemRecord[]): PersonalMemoryItemRecord[] {
    return [...items].sort((a, b) => {
      const pinnedDiff = (b.pinned ?? 0) - (a.pinned ?? 0);
      if (pinnedDiff !== 0) return pinnedDiff;
      return (b.updated_at ?? 0) - (a.updated_at ?? 0);
    });
  }

  type CloudPersonalMemoryRow = {
    id: string;
    content: string;
    scope: string;
    scope_id: string | null;
    pinned: boolean;
    created_at: string;
    updated_at: string;
  };

  async function fetchCloudPersonalMemoryItems(session: SupabaseSession): Promise<PersonalMemoryItemRecord[]> {
    const url = getSupabaseUrl();
    if (!url) return [];

    const userId = getSupabaseAuthUid(session);
    const workspacePath = getEffectiveWorkspacePath();
    const baseSelect = "id,content,scope,scope_id,pinned,created_at,updated_at";

    const fetchRows = async (query: string): Promise<CloudPersonalMemoryRow[]> => {
      const response = await fetchWithSupabaseAuth(`${url}/rest/v1/personal_memory_items?${query}`, { method: "GET" }, session);
      if (!response.ok) throw new Error(await readSupabaseError(response));
      return (await response.json()) as CloudPersonalMemoryRow[];
    };

    const [globalRows, workspaceRows] = await Promise.all([
      fetchRows(
        `select=${baseSelect}` +
          `&user_id=eq.${encodeURIComponent(userId)}` +
          `&scope=eq.global` +
          `&order=pinned.desc,updated_at.desc` +
          `&limit=200`,
      ),
      fetchRows(
        `select=${baseSelect}` +
          `&user_id=eq.${encodeURIComponent(userId)}` +
          `&scope=eq.workspace` +
          `&scope_id=eq.${encodeURIComponent(workspacePath)}` +
          `&order=pinned.desc,updated_at.desc` +
          `&limit=200`,
      ),
    ]);

    const toRecord = (row: CloudPersonalMemoryRow): PersonalMemoryItemRecord => ({
      id: row.id,
      content: row.content,
      scope: row.scope,
      scope_id: row.scope_id ?? null,
      pinned: row.pinned ? 1 : 0,
      provenance_event_id: null,
      created_at: toUnixSecondsFromIso(row.created_at) ?? Math.floor(Date.now() / 1000),
      updated_at: toUnixSecondsFromIso(row.updated_at) ?? Math.floor(Date.now() / 1000),
    });

    return [...globalRows, ...workspaceRows].map(toRecord);
  }

  async function loadPersonalMemoryItems() {
    setIsLoadingPersonalMemory(true);
    setPersonalMemoryError(null);
    try {
      const session = supabaseSessionRef.current;
      if (!session) {
        setPersonalMemoryItems([]);
        return;
      }
      const items = await fetchCloudPersonalMemoryItems(session);
      setPersonalMemoryItems(sortPersonalMemory(items));
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Unknown error";
      setPersonalMemoryError(message);
    } finally {
      setIsLoadingPersonalMemory(false);
    }
  }

  async function searchPersonalMemoryItems(query: string) {
    const q = query.trim();
    if (!q) {
      await loadPersonalMemoryItems();
      return;
    }
    setIsLoadingPersonalMemory(true);
    setPersonalMemoryError(null);
    try {
      const session = supabaseSessionRef.current;
      if (!session) {
        setPersonalMemoryItems([]);
        return;
      }
      const items = await fetchCloudPersonalMemoryItems(session);
      const needle = q.toLowerCase();
      const filtered = items.filter((item) => item.content.toLowerCase().includes(needle));
      setPersonalMemoryItems(sortPersonalMemory(filtered));
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Unknown error";
      setPersonalMemoryError(message);
    } finally {
      setIsLoadingPersonalMemory(false);
    }
  }

  async function handleCreatePersonalMemoryItem() {
    const content = newPersonalMemoryContent.trim();
    if (!content) return;
    setPersonalMemoryError(null);
    try {
      const session = supabaseSessionRef.current;
      const url = session ? getSupabaseUrl() : null;
      if (!session || !url) {
        setAuthError("Sign in to save memory.");
        await handleSignIn();
        return;
      }
      const scope = newPersonalMemoryScope;
      const scopeId = scope === "workspace" ? getEffectiveWorkspacePath() : null;
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/personal_memory_items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({
            user_id: getSupabaseAuthUid(session),
            content,
            scope,
            scope_id: scopeId,
            pinned: Boolean(newPersonalMemoryPinned),
          }),
        },
        session,
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      setNewPersonalMemoryContent("");
      setNewPersonalMemoryPinned(false);
      await loadPersonalMemoryItems();
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Unknown error";
      setPersonalMemoryError(message);
    }
  }

  async function handleTogglePersonalMemoryPinned(item: PersonalMemoryItemRecord) {
    setPersonalMemoryError(null);
    try {
      const session = supabaseSessionRef.current;
      const url = session ? getSupabaseUrl() : null;
      if (!session || !url) {
        setAuthError("Sign in to update memory.");
        await handleSignIn();
        return;
      }
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/personal_memory_items?id=eq.${encodeURIComponent(item.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({
            pinned: item.pinned === 0,
            updated_at: new Date().toISOString(),
          }),
        },
        session,
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      await loadPersonalMemoryItems();
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Unknown error";
      setPersonalMemoryError(message);
    }
  }

  async function handleDeletePersonalMemoryItem(id: string) {
    setPersonalMemoryError(null);
    try {
      const session = supabaseSessionRef.current;
      const url = session ? getSupabaseUrl() : null;
      if (!session || !url) {
        setAuthError("Sign in to delete memory.");
        await handleSignIn();
        return;
      }
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/personal_memory_items?id=eq.${encodeURIComponent(id)}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } },
        session,
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      await loadPersonalMemoryItems();
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Unknown error";
      setPersonalMemoryError(message);
    }
  }

  async function exportThreadsCsv() {
    try {
      const localThreads = await listLocalThreads();
      const rows = localThreads
        .filter((thread) => thread.id !== "system" && thread.engine_id !== "system" && thread.engine_id !== "community_chat")
        .sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0))
        .map((thread) => ({
          id: thread.id,
          title: thread.title ?? "",
          engine_id: thread.engine_id ?? "",
          model_id: thread.model_id ?? "",
          community_id: thread.community_id ?? "",
          created_at: new Date((thread.created_at ?? 0) * 1000).toISOString(),
          updated_at: new Date((thread.updated_at ?? 0) * 1000).toISOString(),
        }));
      const csv = buildCsv(
        ["id", "title", "engine_id", "model_id", "community_id", "created_at", "updated_at"],
        rows,
      );
      downloadTextFile("arx_threads.csv", csv);
      setMemoryToast("Exported threads CSV.");
    } catch (error) {
      setMemoryToast(error instanceof Error ? error.message : "Failed to export threads.");
    }
  }

  async function exportMessagesCsv() {
    try {
      const localThreads = await listLocalThreads();
      const personalThreadIds = localThreads
        .filter((thread) => thread.id !== "system" && thread.engine_id !== "system" && thread.engine_id !== "community_chat")
        .map((thread) => thread.id)
        .sort((a, b) => a.localeCompare(b));
      const rows: Array<Record<string, unknown>> = [];
      for (const threadId of personalThreadIds) {
        const localMessages = await runtimeClient.listMessages(threadId);
        for (let index = 0; index < localMessages.length; index += 1) {
          const message = localMessages[index];
          rows.push({
            id: message.id,
            thread_id: threadId,
            seq: index + 1,
            role: message.role,
            content: parseMessageText(message.content_json),
            engine_id: message.engine_id ?? "",
            model_id: message.model_id ?? "",
            run_id: message.run_id ?? "",
            created_at: new Date((message.created_at ?? 0) * 1000).toISOString(),
          });
        }
      }
      const csv = buildCsv(
        ["id", "thread_id", "seq", "role", "content", "engine_id", "model_id", "run_id", "created_at"],
        rows,
      );
      downloadTextFile("arx_messages.csv", csv);
      setMemoryToast("Exported messages CSV.");
    } catch (error) {
      setMemoryToast(error instanceof Error ? error.message : "Failed to export messages.");
    }
  }

  async function exportPersonalMemoryCsv() {
    const session = supabaseSessionRef.current;
    if (!session) {
      setAuthError("Sign in to export.");
      await handleSignIn();
      return;
    }
    try {
      const items = await fetchCloudPersonalMemoryItems(session);
      const rows = items.map((item) => ({
        id: item.id,
        scope: item.scope,
        scope_id: item.scope_id ?? "",
        pinned: item.pinned ? "true" : "false",
        content: item.content,
        created_at: new Date(item.created_at * 1000).toISOString(),
        updated_at: new Date(item.updated_at * 1000).toISOString(),
      }));
      const csv = buildCsv(["id", "scope", "scope_id", "pinned", "content", "created_at", "updated_at"], rows);
      downloadTextFile("arx_personal_memory.csv", csv);
      setMemoryToast("Exported memory CSV.");
    } catch (error) {
      setMemoryToast(error instanceof Error ? error.message : "Failed to export memory.");
    }
  }

  async function resetLocalCache() {
    if (isSending || isResettingLocalCache) return;
    const prompt = "Reset local cache? This deletes local desktop threads/messages, tool evidence, and UI state on this device.";
    const ok = window.confirm(prompt);
    if (!ok) return;
    setIsResettingLocalCache(true);
    try {
      await shellClient.resetLocalDb();
      setMemoryToast("Local cache reset. Reloading…");
      window.setTimeout(() => {
        window.location.reload();
      }, 200);
    } catch (error) {
      setMemoryToast(error instanceof Error ? error.message : "Failed to reset local cache.");
      setIsResettingLocalCache(false);
    }
  }

  useEffect(() => {
    activeCommunityIdRef.current = activeCommunityId;
  }, [activeCommunityId]);

  useEffect(() => {
    setIsLoadingSystemPrompt(true);
    setSystemPromptError(null);
    void shellClient
      .getSystemPrompt()
      .then((value) => setSystemPromptDraft(value ?? ""))
      .catch(() => setSystemPromptDraft(""))
      .finally(() => setIsLoadingSystemPrompt(false));
  }, [shellClient]);

  async function fetchCloudSystemPrompt(session: SupabaseSession): Promise<string | null> {
    const url = getSupabaseUrl();
    if (!url) return null;
    const userId = getSupabaseAuthUid(session);
    const response = await fetchWithSupabaseAuth(
      `${url}/rest/v1/user_model_settings?select=system_prompt&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
      { method: "GET" },
      session,
    );
    if (!response.ok) return null;
    const rows = (await response.json()) as Array<{ system_prompt?: unknown }>;
    const raw = rows[0]?.system_prompt;
    return typeof raw === "string" ? raw : "";
  }

  async function setCloudSystemPrompt(session: SupabaseSession, prompt: string): Promise<boolean> {
    const url = getSupabaseUrl();
    if (!url) return false;
    const userId = getSupabaseAuthUid(session);
    const response = await fetchWithSupabaseAuth(
      `${url}/rest/v1/user_model_settings`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ user_id: userId, system_prompt: prompt }),
      },
      session,
    );
    return response.ok;
  }

  useEffect(() => {
    if (!supabaseSession) return;
    setIsLoadingSystemPrompt(true);
    setSystemPromptError(null);
    void fetchCloudSystemPrompt(supabaseSession)
      .then(async (prompt) => {
        if (prompt === null) return;
        setSystemPromptDraft(prompt);
        try {
          await shellClient.setSystemPrompt(prompt);
        } catch {
          // ignore
        }
      })
      .catch((error) => {
        setSystemPromptError(error instanceof Error ? error.message : "Failed to load system prompt");
      })
      .finally(() => setIsLoadingSystemPrompt(false));
  }, [supabaseSession?.user?.id]);

  async function saveSystemPrompt(prompt: string): Promise<void> {
    setIsSavingSystemPrompt(true);
    setSystemPromptError(null);
    try {
      await shellClient.setSystemPrompt(prompt);
      const session = supabaseSessionRef.current;
      if (session) {
        await setCloudSystemPrompt(session, prompt);
      }
    } catch (error) {
      setSystemPromptError(error instanceof Error ? error.message : "Failed to save system prompt");
    } finally {
      setIsSavingSystemPrompt(false);
    }
  }

  useEffect(() => {
    try {
      localStorage.setItem("arx-community-analytics-range", communityAnalyticsRange);
    } catch {
      // ignore
    }
  }, [communityAnalyticsRange]);

  useEffect(() => {
    void loadThreads();
  }, [supabaseSession]);

    useEffect(() => {
      if (!supabaseSession) {
        lastAutoRedeemPendingPurchasesUserIdRef.current = null;
        autoRedeemPendingPurchasesAttemptRef.current = 0;
        if (autoRedeemPendingPurchasesTimeoutRef.current) {
          window.clearTimeout(autoRedeemPendingPurchasesTimeoutRef.current);
          autoRedeemPendingPurchasesTimeoutRef.current = null;
        }
        return;
      }

      const userId = getSupabaseAuthUid(supabaseSession);
      if (!userId) return;
      if (lastAutoRedeemPendingPurchasesUserIdRef.current === userId) return;
      lastAutoRedeemPendingPurchasesUserIdRef.current = userId;

      autoRedeemPendingPurchasesAttemptRef.current = 0;
      if (autoRedeemPendingPurchasesTimeoutRef.current) {
        window.clearTimeout(autoRedeemPendingPurchasesTimeoutRef.current);
        autoRedeemPendingPurchasesTimeoutRef.current = null;
      }

      let cancelled = false;
      const run = async () => {
        if (cancelled) return;
        autoRedeemPendingPurchasesAttemptRef.current += 1;
        const attempt = autoRedeemPendingPurchasesAttemptRef.current;
        const count = await redeemPendingPurchases({ navigate: false, silentNoop: true });
        if (cancelled) return;
        if (count > 0) return;
        if (attempt >= 6) return;
        const delayMs = Math.min(12000, 1200 + attempt * 1800);
        autoRedeemPendingPurchasesTimeoutRef.current = window.setTimeout(() => {
          void run();
        }, delayMs);
      };
      void run();
      return () => {
        cancelled = true;
      };
    }, [supabaseSession]);

    useEffect(() => {
      setIsPendingPurchasesBannerDismissed(false);
    }, [pendingPurchaseBannerKey]);

	    useEffect(() => {
	      if (supabaseSession) return;
	      setPendingPurchaseClaims([]);
	      setPendingPurchasesError(null);
	      setPendingPurchasesSuccess(null);
	      setBuilderBillingStatus(null);
	      setBuilderBillingError(null);
	      setIsLoadingBuilderBilling(false);
        setCloudProfile(null);
        setProfileSaveError(null);
        setProfileSaveSuccess(false);
        if (profileSaveTimeoutRef.current) {
          window.clearTimeout(profileSaveTimeoutRef.current);
          profileSaveTimeoutRef.current = null;
        }
	    }, [supabaseSession]);

	    useEffect(() => {
	      if (!builderBillingReturn) return;
	      if (!supabaseSession) return;
	      if (builderBillingReturn.status === "cancel") return;

		      let cancelled = false;
			      const run = async () => {
			        setIsFinalizingBuilderReturn(true);
			        try {
			          const wantsCreate = builderBillingReturn.context === "create_community";
			          const maxAttempts =
			            builderBillingReturn.status === "success" ? 30 : wantsCreate ? 10 : 1;
			          const ownedCount = Object.values(communityRoleById).filter((role) => role === "owner").length;
			          let lastStatus: BuilderBillingStatus | null = null;
			          for (let attempt = 0; attempt < maxAttempts; attempt++) {
			            if (cancelled) return;
			            const status = await loadBuilderBillingStatus(supabaseSession);
			            lastStatus = status;
				            const tier = status?.builder_tier ?? "free";
				            const max = status?.max_communities ?? 0;
				            const hasCapacity = !isBuilderTierFree(tier) && max > 0 && ownedCount < max;
				            if (!isBuilderTierFree(tier) && (!wantsCreate || hasCapacity)) break;
			            if (builderBillingReturn.status !== "success" && !wantsCreate) break;
			            await new Promise((resolve) => window.setTimeout(resolve, 1000));
			          }

		          if (cancelled) return;
		          if (!wantsCreate) return;
		          if (isFinalizingCreateCommunityFromBilling) return;

		          const draft = loadCreateCommunityDraft();
		          if (!draft) {
		            setFinalizeCreateCommunityError("Draft not found. Re-open Create community to continue.");
		            return;
		          }
			          if (draft.user_id && supabaseSession.user.id && draft.user_id !== supabaseSession.user.id) {
			            setFinalizeCreateCommunityError("Draft belongs to a different account. Re-open Create community to continue.");
			            return;
			          }
				          const tier = lastStatus?.builder_tier ?? builderBillingStatus?.builder_tier ?? "free";
				          const max = lastStatus?.max_communities ?? builderBillingStatus?.max_communities ?? 0;
				          if (isBuilderTierFree(tier)) {
				            setFinalizeCreateCommunityError("Still finalizing your plan. Wait a moment and try again.");
				            return;
				          }
			          if (max > 0 && ownedCount >= max) {
			            setFinalizeCreateCommunityError("You've reached your plan limit. Upgrade your plan to create more communities.");
			            return;
			          }
			          await createCommunityFromDraft(draft, supabaseSession);
			        } finally {
			          if (!cancelled) setIsFinalizingBuilderReturn(false);
			        }
			      };

	      void run();
	      return () => {
	        cancelled = true;
	      };
	    }, [builderBillingReturn, supabaseSession]);

	    useEffect(() => {
	      if (!supabaseSession) return;
	      if (isRedeemingClaim) return;
	      const token = readPendingPurchaseClaimToken();
      if (!token) return;
      void redeemPurchaseClaim(token);
    }, [supabaseSession, isRedeemingClaim]);

  useEffect(() => {
    if (!supabaseSession || !activeCommunityId || communityTab !== "chat") return;
    void loadCommunityChat(activeCommunityId, supabaseSession);
  }, [supabaseSession, activeCommunityId, communityTab]);

		  useEffect(() => {
		    // Reset community chat UI when switching communities.
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
        setSelectedLibraryResourceId(null);
		    if (chatInputRef.current) {
		      chatInputRef.current.style.height = "auto";
		    }
		  }, [activeCommunityId, clearPendingPrependAnchor, resetCommunityChatDataState]);

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

  useCommunityAgentMembersLifecycle<SupabaseSession, CommunityAgentDraft>({
    activePage,
    communityTab,
    supabaseSession,
    activeCommunityId,
    canManageMembersActiveCommunity: communityNavVisibility.canManageMembers,
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
    enforceProDraftGate: false,
  });

  useCommunityMembersTabLifecycle<SupabaseSession, CommunityInviteRecord, CommunityMemoryCandidateRow>({
    activePage,
    communityTab,
    supabaseSession,
    activeCommunityId,
    canInviteActiveCommunity: communityActionGuards.canInvite,
    canManageMembersActiveCommunity: communityNavVisibility.canManageMembers,
    loadCommunityInvites,
    setCommunityInvites,
    loadCommunityMemoryCandidates,
    setCommunityMemoryCandidates,
    setCommunityMemoryCandidatesError,
  });

  useCommunityResourcesTabLifecycle<SupabaseSession>({
    activePage,
    communityTab,
    supabaseSession,
    activeCommunityId,
    loadCommunityResources,
    requireCommunityPage: false,
  });

  useEffect(() => {
    if (communityTab !== "library") return;
    const pinned = communityResources.filter((resource) => Boolean(resource.pinned));
    if (pinned.length === 0) {
      if (selectedLibraryResourceId !== null) setSelectedLibraryResourceId(null);
      return;
    }
    if (!selectedLibraryResourceId || !pinned.some((resource) => resource.id === selectedLibraryResourceId)) {
      setSelectedLibraryResourceId(pinned[0].id);
    }
  }, [communityResources, communityTab, selectedLibraryResourceId]);

  const { handleWorkspaceScroll } = useWorkspaceAutoScroll({
    workspaceMessageListRef,
    isLoadingThreadRef,
    autoScrollEnabledRef,
    lastWorkspaceScrollTopRef,
    setIsWorkspaceAtBottom,
    autoScrollDependencies: [messages, toolCalls, streamingContent],
    scrollBehavior: "instant",
  });

  useEffect(() => {
    toolCallsRef.current = toolCalls;
  }, [toolCalls]);

  useEffect(() => {
    activeModelIdRef.current = activeModelId;
  }, [activeModelId]);

  useEffect(() => {
    if (!activeThreadId) return;
    void runtimeClient.getAgentMode(activeThreadId)
      .then((mode) => {
        const normalized = (mode || "build").toLowerCase();
        if (normalized === "plan" || normalized === "explore" || normalized === "build") {
          setAgentMode(normalized as AgentMode);
        } else {
          setAgentMode("build");
        }
      })
      .catch(() => {
        setAgentMode("build");
      });
  }, [activeThreadId, runtimeClient]);

  useEffect(() => {
    if (slashState.query === null) {
      setSlashIndex(0);
      setSlashHover(null);
      return;
    }
    setSlashIndex(0);
    if (slashState.filtered[0]) {
      setSlashHover(slashState.filtered[0].name);
    } else {
      setSlashHover(null);
    }
  }, [slashState.query, slashState.filtered.length]);


  useEffect(() => {
    setUserWantsCommunity(activePage !== "workspace");
  }, [activePage]);

  // Responsive panel visibility based on window width and user preferences
  useEffect(() => {
    const handleResize = () => {
      if (resizeRaf.current) {
        cancelAnimationFrame(resizeRaf.current);
      }
      resizeRaf.current = requestAnimationFrame(() => {
        setWindowWidth(window.innerWidth);
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const width = windowWidth;
    const wantsLeft =
      activeView === "settings"
        ? true
        : activePage === "community"
          ? true
          : userWantsSessions;
    const wantsRight = activePage === "community" ? true : userWantsCommunity;

    if (activePage === "community") {
      // Community page: left panel compact, no right panel (using inline members)
      setSessionsCompact(true);
      setShowSidePanel(true);
      setShowCommunityPanel(false); // Always hidden - using inline members
      return;
    }

    if (wantsLeft && wantsRight) {
      // Both panels wanted: community closes first, then sessions goes compact
      if (width > 750) {
        setShowSidePanel(true);
        setShowCommunityPanel(false); // Hidden - using inline members
        setSessionsCompact(false);
      } else if (width > 600) {
        setShowSidePanel(true);
        setShowCommunityPanel(false);
        setSessionsCompact(false);
      } else {
        setShowSidePanel(true);
        setShowCommunityPanel(false);
        setSessionsCompact(true);
      }
    } else if (wantsLeft && !wantsRight) {
      // Only sessions wanted - goes compact at smaller width
      if (width > 620) {
        setShowSidePanel(true);
        setSessionsCompact(false);
      } else {
        setShowSidePanel(true);
        setSessionsCompact(true);
      }
      setShowCommunityPanel(false);
    } else if (!wantsLeft && wantsRight) {
      // Only community wanted - gets full room
      setShowCommunityPanel(false); // Hidden - using inline members
      setShowSidePanel(false);
      setSessionsCompact(false);
    } else {
      // Neither wanted
      setShowSidePanel(false);
      setShowCommunityPanel(false);
      setSessionsCompact(false);
    }
  }, [windowWidth, userWantsSessions, userWantsCommunity, activePage, activeView]);

  const handleOpenedUrls = useCallback(
    async (urls: string[]) => {
      if (urls.length === 0) return;

      let newestInvite: string | null = null;
      let newestClaimToken: string | null = null;
      let newestSettingsPage: string | null = null;
      let newestBillingReturn: BuilderBillingReturn | null = null;
      for (const raw of urls) {
        let parsed: URL;
        try {
          parsed = new URL(raw);
        } catch {
          continue;
        }

        if (parsed.protocol === "arx:") {
          const host = (parsed.hostname ?? "").toLowerCase();
          const pathname = (parsed.pathname ?? "").toLowerCase();
          const token = (parsed.searchParams.get("token") ?? parsed.searchParams.get("claim") ?? "").trim();
          if ((host === "claim" || pathname === "/claim") && token) {
            newestClaimToken = token;
            storePendingPurchaseClaimToken(token);
          }
          if (host === "settings" || pathname === "/settings") {
            const page = (parsed.searchParams.get("page") ?? parsed.searchParams.get("tab") ?? "").trim().toLowerCase();
            const fromPath = (pathname.startsWith("/") ? pathname.slice(1) : pathname).split("/")[0] ?? "";
            const next = (page || fromPath).trim();
            if (next) newestSettingsPage = next;
          }
          if (host === "billing" || pathname === "/billing") {
            const billingReturn = parseBuilderBillingReturn(parsed.searchParams, { fallbackSource: "desktop" });
            if (billingReturn) {
              newestBillingReturn = billingReturn;
            }
          }
        }
        const inviteKey = parsed.searchParams.get("invite") ?? parsed.searchParams.get("join");
        if (!inviteKey) continue;

        const normalized = normalizeInviteCode(inviteKey);
        if (!normalized) continue;

        newestInvite = normalized;
        try {
          await shellClient.upsertPendingInvite({ invite_key: normalized, source: "url" });
        } catch {
          // ignore
        }
      }

      if (newestClaimToken) {
        const session = supabaseSessionRef.current;
        if (session) {
          void redeemPurchaseClaim(newestClaimToken);
        } else {
          setAuthError("Sign in to claim access.");
          void handleSignIn();
        }
      }

      if (newestBillingReturn) {
        setFinalizeCreateCommunityError(null);
        setBuilderBillingReturn(newestBillingReturn);
      }

      if (newestSettingsPage) {
        setActiveView("settings");
        if (
          newestSettingsPage === "account" ||
          newestSettingsPage === "models" ||
          newestSettingsPage === "execution" ||
          newestSettingsPage === "memory" ||
          newestSettingsPage === "appearance"
        ) {
          setSettingsPage(newestSettingsPage);
        }
      }

      if (newestInvite) {
        await loadPendingInvites();
        setActivePage("workspace");
        setActiveView("home");
        setActiveInviteGateKey(newestInvite);
      }
    },
    [handleSignIn, loadPendingInvites, redeemPurchaseClaim, shellClient],
  );

  function toUnixSecondsFromIso(value: string | null | undefined): number | null {
    if (!value) return null;
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) return null;
    return Math.floor(ms / 1000);
  }

  async function loadThreads() {
    try {
      const router = desktopThreadServiceRouter;
      const localThreads = (await router.resolveByLane("agent", "local").listThreads()) as ThreadRecord[];
      const localAgentThreads = localThreads
        .filter(
          (t) => t.id !== "system" && t.engine_id !== "system" && t.engine_id !== "community_chat",
        )
        .map((thread) => ({
          ...thread,
          thread_lane: normalizeThreadLane(thread.thread_lane, thread.engine_id),
          storage_mode: normalizeThreadStorageMode(
            thread.storage_mode,
            thread.thread_lane,
            thread.engine_id,
          ),
          project_id: thread.project_id ?? null,
        }))
        .filter((thread) => thread.storage_mode === "local" && thread.thread_lane === "agent");

      const cloudChatThreads = (await router.resolveByLane("chat", "cloud").listThreads()) as ThreadRecord[];

      const combinedById = new Map<string, ThreadRecord>();
      for (const thread of cloudChatThreads) combinedById.set(thread.id, thread);
      for (const thread of localAgentThreads) {
        if (!combinedById.has(thread.id)) combinedById.set(thread.id, thread);
      }
      const visible = Array.from(combinedById.values()).sort((a, b) => {
        const diff = (b.updated_at ?? 0) - (a.updated_at ?? 0);
        if (diff !== 0) return diff;
        return a.id.localeCompare(b.id);
      });

      setThreads(visible);
      const selectable = visible.filter((thread) => (thread.last_seq ?? 0) > 0);
      const active = activeThreadId;
      const activeThread = active ? visible.find((thread) => thread.id === active) ?? null : null;
      const activeIsEmptyStub = activeThread ? (activeThread.last_seq ?? 0) <= 0 : false;

      if (activeIsEmptyStub) {
        setActiveThreadId(selectable.length > 0 ? selectable[0].id : null);
      } else if (active && !visible.some((thread) => thread.id === active)) {
        setActiveThreadId(selectable.length > 0 ? selectable[0].id : null);
      } else if (!active && !threadsHydratedRef.current && selectable.length > 0) {
        setActiveThreadId(selectable[0].id);
      }
      threadsHydratedRef.current = true;
    } catch (error) {
      console.error("Failed to load threads:", error);
      setThreads([]);
    }
  }

  async function loadCloudProjects(session: SupabaseSession): Promise<void> {
    const url = getSupabaseUrl();
    if (!url) return;
    const fetchProjects = async (): Promise<CloudProjectRecord[]> => {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/list_cloud_projects`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
        session,
      );
      if (!response.ok) {
        throw new Error(await readSupabaseError(response));
      }
      const rows = (await response.json()) as Array<{
        id: string;
        name: string | null;
        slug: string | null;
        status: string;
        created_at: string;
        updated_at: string;
      }>;
      return rows
        .filter((row) => String(row?.status ?? "").trim().toLowerCase() === "active")
        .map((row) => {
          const slug = (row.slug ?? "").trim() || null;
          const id = String(row.id ?? "").trim();
          return {
            id,
            name: row.name ?? null,
            slug,
            status: (row.status ?? "").trim().toLowerCase(),
            created_at: toUnixSecondsFromIso(row.created_at) ?? Math.floor(Date.now() / 1000),
            updated_at: toUnixSecondsFromIso(row.updated_at) ?? Math.floor(Date.now() / 1000),
            root_path: slug ? `cloud/${slug}` : `cloud/${id}`,
          } satisfies CloudProjectRecord;
        })
        .filter((project) => Boolean(project.id));
    };
    try {
      let next = await fetchProjects();
      if (next.length === 0) {
        const ensureResponse = await fetchWithSupabaseAuth(
          `${url}/rest/v1/rpc/ensure_default_cloud_project`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          },
          session,
        );
        if (!ensureResponse.ok) {
          throw new Error(await readSupabaseError(ensureResponse));
        }
        next = await fetchProjects();
      }
      setCloudProjects(next);
      setProjectExpandedById((prev) => {
        const nextExpanded: Record<string, boolean> = { ...prev };
        for (const project of next) {
          nextExpanded[project.id] = prev[project.id] ?? true;
        }
        return nextExpanded;
      });
      setActiveCloudProjectId((prev) => resolvePreferredCloudProjectId(next, prev));
    } catch (error) {
      console.warn("Failed to load cloud projects:", error);
      // Keep existing in-memory cloud project state on transient failures so desktop
      // doesn't regress to an empty "Unassigned" view when cloud sync hiccups.
    }
  }

  async function handleChatgptLogin() {
    if (isChatgptLoggingIn) return;
    setIsChatgptLoggingIn(true);
    setChatgptAuthError(null);
    try {
      const summary = await shellClient.chatgptLogin();
      setChatgptAuthSummary(summary);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "ChatGPT sign-in failed";
      setChatgptAuthError(message);
    } finally {
      setIsChatgptLoggingIn(false);
    }
  }

  async function handleChatgptLogout() {
    setChatgptAuthError(null);
    try {
      await shellClient.clearChatgptAuth();
      setChatgptAuthSummary(null);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to sign out";
      setChatgptAuthError(message);
    }
  }

  async function loadModelRegistry(session: SupabaseSession): Promise<void> {
    const url = getSupabaseUrl();
    if (!url) return;
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/model_registry?select=id,provider,display_name,sort_order,enabled&enabled=eq.true&order=sort_order.asc,id.asc`,
        { method: "GET" },
        session,
      );
      if (!response.ok) return;
      const rows = await response.json();
      const parsed = parseModelRegistryRows(rows, {
        isModelAllowed: (modelId) => isModelAvailableOnSurface(modelId, "desktop"),
      });
      const catalog = parsed.catalog;
      if (!catalog.length) return;
      if (
        parsed.diagnostics.dropped_empty_id > 0 ||
        parsed.diagnostics.dropped_duplicate_id > 0 ||
        parsed.diagnostics.dropped_invalid_row > 0 ||
        parsed.diagnostics.unknown_provider > 0
      ) {
        console.warn("[model-registry] ignored malformed rows (desktop)", parsed.diagnostics);
      }

      const prevById = new Map(modelToggles.map((t) => [t.id, t]));
      const mergedById = new Map<string, ModelToggle>();
      for (const toggle of catalog) {
        const existing = prevById.get(toggle.id);
        mergedById.set(toggle.id, existing ? { ...toggle, enabled: existing.enabled } : toggle);
      }
      for (const fallback of DEFAULT_MODEL_TOGGLES) {
        if (mergedById.has(fallback.id)) continue;
        const existing = prevById.get(fallback.id);
        mergedById.set(fallback.id, existing ? { ...fallback, enabled: existing.enabled } : fallback);
      }
      for (const existing of modelToggles) {
        if (!mergedById.has(existing.id)) mergedById.set(existing.id, existing);
      }
      const merged = Array.from(mergedById.values());

      setModelProviderById(parsed.providerById);
      setModelToggles(merged);
      await shellClient.setModelToggles(merged).catch(() => null);
    } catch {
      // ignore
    }
  }

  function providerIdForModelId(modelId: string): ProviderKey["id"] | null {
    const id = (modelId ?? "").trim().toLowerCase();
    if (!id) return null;
    const mappedProvider = modelProviderById[id];
    if (mappedProvider) return mappedProvider;
    return inferModelProviderId(id, null);
  }

  function hasKeyForProvider(providerId: ProviderKey["id"]): boolean {
    return providerId === "openai" && Boolean(chatgptAuthSummary);
  }

  function isModelReady(modelId: string): boolean {
    if (isFreeModelId(modelId, DESKTOP_FREE_MODEL_ALLOWLIST)) {
      return true;
    }
    const providerId = providerIdForModelId(modelId);
    if (!providerId) return false;
    if (hasKeyForProvider(providerId)) return true;
    if (!userAccessPolicy.allowPlatformInference || !supabaseSession) return false;
    return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
  }

  async function loadExecPolicyRules() {
    try {
      const value = await shellClient.getExecPolicyRules();
      setExecPolicyRules(value ?? "prompt");
    } catch (error) {
      console.error(error);
    }
  }

  async function loadApprovalMode() {
    try {
      const value = await shellClient.getApprovalMode();
      if (value === "read-only" || value === "agent" || value === "agent-full") {
        setApprovalMode(value);
      } else {
        setApprovalMode("agent");
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function handleSaveExecPolicyRules() {
    setIsSavingExecPolicy(true);
    setExecPolicyError(null);
    try {
      await runtimeClient.setExecPolicyRules(execPolicyRules);
    } catch (error) {
      setExecPolicyError(
        typeof error === "string" ? error : error instanceof Error ? error.message : "Failed to save rules"
      );
    } finally {
      setIsSavingExecPolicy(false);
    }
  }

  async function loadSupabaseSession() {
    if (hasSupabaseSignedOutIntent()) return;
    // Desktop auth session persistence invariant:
    // secure-store only (via shellClient), never localStorage fallback.
    let stored: string | null = null;
    try {
      stored = await shellClient.getSupabaseSession();
    } catch {
      stored = null;
    }

    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as SupabaseSession;
      const supabaseUrl = (getSupabaseUrl() ?? "").trim();
      if (supabaseUrl) {
        try {
          const parsedUrl = new URL(supabaseUrl);
          const configuredHost = (parsedUrl.hostname ?? "").trim().toLowerCase();
          const configuredProjectRef = (configuredHost.split(".")[0] ?? "").trim().toLowerCase();
          if (configuredProjectRef) {
            const payload = decodeJwtPayload(parsed.access_token);
            const payloadRef =
              payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).ref === "string"
                ? String((payload as Record<string, unknown>).ref).trim().toLowerCase()
                : "";
            if (payloadRef && payloadRef !== configuredProjectRef) {
              await shellClient.clearSupabaseSession();
              return;
            }
            const payloadIss =
              payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).iss === "string"
                ? String((payload as Record<string, unknown>).iss).trim().toLowerCase()
                : "";
            if (payloadIss && !payloadIss.includes(`${configuredProjectRef}.supabase.co`)) {
              await shellClient.clearSupabaseSession();
              return;
            }
          }
        } catch {
          // Ignore URL parse errors and continue with refresh check below.
        }
      }
      const refreshed = await ensureFreshSession(parsed);
      if (!refreshed) {
        await shellClient.clearSupabaseSession();
        return;
      }
      setSupabaseSession(refreshed);
      try {
        await shellClient.setSupabaseSession(JSON.stringify(refreshed));
      } catch {
        // If secure-store write fails, keep session in memory only.
      }
    } catch {
      try {
        await shellClient.clearSupabaseSession();
      } catch {
        // ignore
      }
    }
  }

  function getPublicShareBaseUrl(): string | null {
    const raw =
      (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) ??
      (import.meta.env.VITE_APP_URL as string | undefined) ??
      "";
    const trimmed = raw.trim().replace(/\/+$/, "");
    if (trimmed && /^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }

    // Dev-friendly fallback: if a Supabase project URL is configured, use the project's
    // Edge Functions domain as the share base URL.
    const supabaseUrl = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "").trim();
    if (!supabaseUrl) return null;
    try {
      const parsed = new URL(supabaseUrl);
      const host = parsed.hostname.toLowerCase();
      if (!host.endsWith(".supabase.co")) return null;
      const projectRef = host.split(".")[0];
      if (!projectRef) return null;
      return `${parsed.protocol}//${projectRef}.functions.supabase.co`;
    } catch {
      return null;
    }
  }

  async function ensureFreshSession(session: SupabaseSession): Promise<SupabaseSession | null> {
    return await ensureSupabaseSessionForRequest(session, refreshSupabaseSessionLocked);
  }

  async function ensureAuthenticatedSendSession(session: SupabaseSession): Promise<SupabaseSession | null> {
    return await ensureSupabaseSessionForAuthenticatedSend({
      session,
      sessionRef: supabaseSessionRef,
      refreshLocked: refreshSupabaseSessionLocked,
    });
  }

  async function persistSupabaseSession(session: SupabaseSession) {
    try {
      await shellClient.setSupabaseSession(JSON.stringify(session));
    } catch {
      // Fail closed to in-memory session only. Do not persist auth session in localStorage.
    }
  }

  async function clearPersistedSupabaseSession() {
    try {
      sessionStorage.setItem(SUPABASE_SIGNED_OUT_TAB_INTENT_KEY, "1");
    } catch {
      // ignore
    }
    try {
      localStorage.setItem(SUPABASE_SIGNED_OUT_INTENT_KEY, "1");
    } catch {
      // ignore
    }
    try {
      await shellClient.clearSupabaseSession();
    } catch {
      // ignore
    }
  }

  async function refreshSupabaseSessionLocked(refreshToken: string): Promise<SupabaseSession | null> {
    if (!supabaseSessionRef.current) return null;
    const epochAtRefreshStart = authSessionEpochRef.current;
    return await refreshSupabaseSessionWithLock({
      refreshToken,
      inFlightRef: supabaseRefreshInFlightRef,
      refreshSession: refreshSupabaseSession,
      onRefreshed: async (refreshed) => {
        if (authSessionEpochRef.current !== epochAtRefreshStart) return;
        setAuthError(null);
        setSupabaseSession(refreshed);
        supabaseSessionRef.current = refreshed;
        await persistSupabaseSession(refreshed);
      },
    });
  }

  async function fetchWithSupabaseAuth(
    url: string,
    init: RequestInit,
    session: SupabaseSession,
  ): Promise<Response> {
    return await fetchWithSupabaseAuthShared({
      url,
      init,
      session,
      sessionRef: supabaseSessionRef,
      refreshLocked: refreshSupabaseSessionLocked,
      onSessionExpired: async () => {
        await expireSupabaseSessionFailClosed({
          clearPersistedSupabaseSession,
          setSupabaseSession,
          sessionRef: supabaseSessionRef,
          onExpired: () => {
            setAuthError(SUPABASE_SESSION_EXPIRED_MESSAGE);
          },
        });
      },
      sessionExpiredMessage: SUPABASE_SESSION_EXPIRED_MESSAGE,
    });
  }

  async function fetchWithSupabasePublic(url: string, init: RequestInit = {}): Promise<Response> {
    return await fetchWithSupabasePublicShared(url, init);
  }

  async function loadCommunityMemoryCandidates(communityId: string, session: SupabaseSession): Promise<void> {
    const url = getSupabaseUrl();
    if (!url) return;
    setIsLoadingCommunityMemoryCandidates(true);
    setCommunityMemoryCandidatesError(null);
    try {
      const fresh = await ensureFreshSession(session);
      if (!fresh) throw new Error(SUPABASE_SESSION_EXPIRED_MESSAGE);
      const rows = await listCommunityMemoryCandidatesRpc({
        url,
        session: fresh,
        communityId,
        limit: 100,
        fetchWithSupabaseAuth,
        readSupabaseError,
      });
      setCommunityMemoryCandidates(rows);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to load memory candidates.";
      setCommunityMemoryCandidates([]);
      setCommunityMemoryCandidatesError(message);
    } finally {
      setIsLoadingCommunityMemoryCandidates(false);
    }
  }

  function closeTeachCandidateModal(): void {
    if (isSubmittingTeachCandidate) return;
    setTeachCandidateDraft(null);
    setTeachCandidateTitleInput("");
    setTeachCandidateMemoryInput("");
    setTeachCandidateSubmitError(null);
  }

  async function handleSubmitTeachCommunityCandidate(): Promise<void> {
    if (!teachCandidateDraft || isSubmittingTeachCandidate) return;

    const memoryText = buildTeachMemoryText(teachCandidateMemoryInput);
    if (!memoryText) {
      setTeachCandidateSubmitError("Memory text is required.");
      return;
    }
    const resolvedTitleInput = teachCandidateTitleInput.trim();
    const resolvedTitle =
      resolvedTitleInput.length > 0
        ? resolvedTitleInput.slice(0, 160)
        : deriveTeachCandidateTitle(memoryText);
    const draft = teachCandidateDraft;
    setIsSubmittingTeachCandidate(true);
    setTeachCandidateSubmitError(null);
    try {
      const session = supabaseSessionRef.current ?? supabaseSession;
      if (!session) {
        throw new Error("Sign in to teach community memory.");
      }
      const fresh = await ensureFreshSession(session);
      if (!fresh) throw new Error(SUPABASE_SESSION_EXPIRED_MESSAGE);
      const url = getSupabaseUrl();
      if (!url) throw new Error("Missing Supabase URL.");

      const requestHash = await hashTeachCandidateContent(`${resolvedTitle ?? ""}\n${memoryText}`);
      const requestKey = `teach:${draft.threadId}:${draft.messageId}:${requestHash}`;
      const evidencePayload = {
        v: 1,
        contract_id: "community_evidence_used_v1",
        source_thread_id: draft.threadId,
        source_message_id: draft.messageId,
        source_turn_id: draft.turnId,
        items: draft.evidenceItems.map((item) => ({
          source_type: item.source_type,
          source_id: (item.internal_source_id ?? item.source_id ?? "").trim(),
          title: item.title,
          snippet: item.snippet,
          url: item.url,
          score: item.score,
          rank: item.rank,
        })),
      };

      const row = await proposeCommunityMemoryCandidateRpc({
        url,
        session: fresh,
        communityId: draft.communityId,
        title: resolvedTitle,
        memoryText,
        evidence: evidencePayload,
        requestKey,
        fetchWithSupabaseAuth,
        readSupabaseError,
      });
      const routerState = (row.router_state ?? "queued").trim().toLowerCase();
      const routerReason = (row.router_reason ?? "").trim();
      const promotedMemoryId = (row.promoted_memory_id ?? null) ? String(row.promoted_memory_id) : null;

      if (routerState === "rejected") {
        const reason = routerReason ? `Candidate rejected (${routerReason}).` : "Candidate rejected.";
        setTeachCandidateSubmitError(reason);
        setMemoryToast(reason);
        return;
      }

      setTeachCandidateDraft(null);
      setTeachCandidateTitleInput("");
      setTeachCandidateMemoryInput("");
      setTeachCandidateSubmitError(null);

      if (promotedMemoryId) {
        setMemoryToast("Community learned from this answer (auto-promoted).");
      } else if (routerState === "needs_review" || routerState === "queued") {
        setMemoryToast("Memory candidate submitted for community review.");
      } else {
        setMemoryToast("Memory candidate submitted.");
      }

      if (
        activePage === "community" &&
        communityTab === "members" &&
        canManageMembersActiveCommunity &&
        activeCommunityId === draft.communityId
      ) {
        void loadCommunityMemoryCandidates(draft.communityId, fresh);
      }
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to teach community memory.";
      setTeachCandidateSubmitError(message);
      setMemoryToast(message);
    } finally {
      setIsSubmittingTeachCandidate(false);
    }
  }

  async function handlePromoteCommunityMemoryCandidate(candidateId: string): Promise<void> {
    const session = supabaseSessionRef.current ?? supabaseSession;
    if (!session || !activeCommunityId) return;
    const url = getSupabaseUrl();
    if (!url) return;
    setReviewingCommunityMemoryCandidateId(candidateId);
    setCommunityMemoryCandidatesError(null);
    try {
      const fresh = await ensureFreshSession(session);
      if (!fresh) throw new Error(SUPABASE_SESSION_EXPIRED_MESSAGE);
      await promoteCommunityMemoryCandidateRpc({
        url,
        session: fresh,
        candidateId,
        title: null,
        fetchWithSupabaseAuth,
        readSupabaseError,
      });
      setMemoryToast("Candidate promoted to community memory.");
      await loadCommunityMemoryCandidates(activeCommunityId, fresh);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to promote memory candidate.";
      setCommunityMemoryCandidatesError(message);
    } finally {
      setReviewingCommunityMemoryCandidateId(null);
    }
  }

  async function handleRejectCommunityMemoryCandidate(candidateId: string, reason: string | null): Promise<void> {
    const session = supabaseSessionRef.current ?? supabaseSession;
    if (!session || !activeCommunityId) return;
    const url = getSupabaseUrl();
    if (!url) return;
    setReviewingCommunityMemoryCandidateId(candidateId);
    setCommunityMemoryCandidatesError(null);
    try {
      const fresh = await ensureFreshSession(session);
      if (!fresh) throw new Error(SUPABASE_SESSION_EXPIRED_MESSAGE);
      await rejectCommunityMemoryCandidateRpc({
        url,
        session: fresh,
        candidateId,
        reason,
        fetchWithSupabaseAuth,
        readSupabaseError,
      });
      setMemoryToast("Candidate rejected.");
      setCommunityMemoryRejectReasonById((prev) => {
        if (!(candidateId in prev)) return prev;
        const next = { ...prev };
        delete next[candidateId];
        return next;
      });
      await loadCommunityMemoryCandidates(activeCommunityId, fresh);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to reject memory candidate.";
      setCommunityMemoryCandidatesError(message);
    } finally {
      setReviewingCommunityMemoryCandidateId(null);
    }
  }

  async function redeemPurchaseClaim(token: string): Promise<void> {
    const trimmed = token.trim();
    if (!trimmed) return;

    const session = supabaseSessionRef.current;
    const url = session ? getSupabaseUrl() : null;
    if (!session || !url) {
      storePendingPurchaseClaimToken(trimmed);
      setAuthError("Sign in to claim access.");
      await handleSignIn();
      return;
    }

    setIsRedeemingClaim(true);
    setRedeemClaimError(null);
    try {
      const communityId = await redeemPurchaseClaimRpc({
        url,
        session,
        token: trimmed,
        fetchWithSupabaseAuth,
        readSupabaseError
      });
      clearPendingPurchaseClaimToken();

      await loadCommunities(session);
      openCommunityTab(communityId, "chat");
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to claim access.";
      setRedeemClaimError(message);
    } finally {
      setIsRedeemingClaim(false);
    }
  }

  async function loadPendingPurchaseClaims(session: SupabaseSession): Promise<void> {
    const url = getSupabaseUrl();
    if (!url) return;
    setIsLoadingPendingPurchases(true);
    setPendingPurchasesError(null);
    try {
      const rows = await listPendingPurchaseClaimsRpc({
        url,
        session,
        fetchWithSupabaseAuth,
        readSupabaseError
      });
      setPendingPurchaseClaims(rows);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to load pending purchases.";
      setPendingPurchasesError(message);
      setPendingPurchaseClaims([]);
    } finally {
      setIsLoadingPendingPurchases(false);
    }
  }

	  async function loadBuilderBillingStatus(session: SupabaseSession): Promise<BuilderBillingStatus | null> {
	    const url = getSupabaseUrl();
	    if (!url) return null;
	    setIsLoadingBuilderBilling(true);
	    setBuilderBillingError(null);
	    try {
	      const response = await fetchWithSupabaseAuth(
	        `${url}/rest/v1/rpc/get_my_product_state`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
        session,
	      );
	      if (!response.ok) throw new Error(await readSupabaseError(response));
	      const rows = (await response.json()) as ProductState[];
	      const product = rows[0] ?? null;
	      const row: BuilderBillingStatus | null = product
	        ? {
	            user_id: product.user_id,
	            builder_tier: product.builder_tier,
	            max_communities: Number(product.max_communities ?? 0),
	            platform_fee_bps: Number(product.platform_fee_bps ?? 0),
	            has_payouts: Boolean(product.has_payouts),
	            subscription_status: product.subscription_status ?? null,
	            current_period_end: product.current_period_end ?? null,
	            cancel_at_period_end:
	              product.cancel_at_period_end === null || product.cancel_at_period_end === undefined
	                ? null
	                : Boolean(product.cancel_at_period_end),
	          }
	        : null;
	      setBuilderBillingStatus(row);
	      return row;
	    } catch (error) {
	      const message =
	        typeof error === "string"
	          ? error
	          : error instanceof Error
	            ? error.message
	            : "Failed to load billing status.";
	      setBuilderBillingError(message);
	      setBuilderBillingStatus(null);
	      return null;
	    } finally {
	      setIsLoadingBuilderBilling(false);
	    }
	  }

  async function setDevBuilderTier(tier: "free" | "builder" | "architect"): Promise<void> {
    const session = supabaseSessionRef.current ?? supabaseSession;
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

  const openExternalUrl = useCallback(async (url: string): Promise<boolean> => {
    const trimmed = url.trim();
    if (!trimmed) return false;
    try {
      await shellClient.openExternalUrl(trimmed);
      return true;
    } catch {
      try {
        window.open(trimmed, "_blank", "noopener,noreferrer");
        return true;
      } catch {
        return false;
      }
    }
  }, [shellClient]);

  const { startBuilderPlanCheckout, openBuilderBillingPortal, startConnectOnboarding } =
    useDesktopBuilderBillingActions({
      getSession: () => supabaseSessionRef.current,
      getSupabaseUrl,
      fetchWithSupabaseAuth,
      readSupabaseError,
      getPublicAppBaseUrl: getPublicShareBaseUrl,
      openExternalUrl,
      requireSignIn: async (message) => {
        setAuthError(message);
        await handleSignIn();
      },
      setBuilderBillingError,
      setIsStartingBuilderCheckout,
      setIsStartingBuilderPortal,
      setIsStartingConnectOnboarding,
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
    onPrimaryUnauthenticated: async () => {
      await handleSignIn();
    },
    buildDraftOnPrimaryUnauthenticated: false,
    buildDraftOnCreateUnauthenticated: false,
    onOwnedCommunityLimitReached: () => {
      showAppToastMessage("You've built the maximum number of communities");
    },
    onCommunityCreated: (community) => {
      setCommunities((prev) => [community, ...prev]);
      openCommunityTab(community.id, "chat");
    },
    onDraftCreatedCommunitySuccess: () => {
      setBuilderBillingReturn(null);
    },
    getOwnedCountForOpenModal: (communityList, roleMap) => {
      return communityList.reduce((acc, community) => acc + (roleMap[community.id] === "owner" ? 1 : 0), 0);
    },
    getOwnedCountForPrimary: (_communityList, roleMap) => {
      return Object.values(roleMap).filter((role) => role === "owner").length;
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
    maxCreateImageDataUrlChars: MAX_COMMUNITY_IMAGE_DATA_URL_CHARS,
    createDraftId: createCommunityDraftId,
    loadCreateDraft: loadCreateCommunityDraft,
    saveCreateDraft: saveCreateCommunityDraft,
    clearCreateDraft: clearCreateCommunityDraft,
    createUnauthenticatedErrorMessage: "Sign in to create a community.",
    bannerLoadFailureMessage: "Failed to load image.",
  });

  async function redeemPendingPurchases(opts?: { navigate?: boolean; silentNoop?: boolean }): Promise<number> {
    const session = supabaseSessionRef.current;
    const url = session ? getSupabaseUrl() : null;
    if (!session || !url) {
      setAuthError("Sign in to claim access.");
      await handleSignIn();
      return 0;
    }

    if (redeemPendingPurchasesInFlightRef.current) return 0;
    redeemPendingPurchasesInFlightRef.current = true;
    setIsRedeemingPendingPurchases(true);
    setPendingPurchasesError(null);
    setPendingPurchasesSuccess(null);
    try {
      const rows = await redeemPendingPurchaseClaimsRpc({
        url,
        session,
        fetchWithSupabaseAuth,
        readSupabaseError
      });
      const claimedCommunityId = rows[0]?.community_id ?? null;
      if (rows.length === 0) {
        if (!opts?.silentNoop) {
          setPendingPurchasesSuccess("No pending purchases found.");
        }
        setPendingPurchaseClaims([]);
        return 0;
      }

      setPendingPurchasesSuccess(rows.length === 1 ? "Claimed access." : `Claimed ${rows.length} communities.`);
      await loadCommunities(session);
      setPendingPurchaseClaims([]);

      if (claimedCommunityId && opts?.navigate !== false) {
        openCommunityTab(claimedCommunityId, "chat");
      }
      return rows.length;
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to claim access.";
      setPendingPurchasesError(message);
      return 0;
    } finally {
      setIsRedeemingPendingPurchases(false);
      redeemPendingPurchasesInFlightRef.current = false;
    }
  }

  async function consumeOAuthHash(): Promise<"none" | "session_set" | "callback_error"> {
    if (hasSupabaseSignedOutIntent()) {
      clearOAuthCallbackParamsFromLocation();
      return "none";
    }
    return await consumeSupabaseOAuthCallback({
      onAuthError: (message) => {
        setAuthError(message);
      },
      persistSession: persistSupabaseSession,
      onSessionSet: (session) => {
        setSupabaseSession(session);
        setAuthError(null);
        setActivePage("workspace");
        setActiveView("home");
        setSettingsPage("models");
        setActiveCommunityId(null);
      },
      profileLoadErrorMessage: "Failed to load user profile.",
      clearCallbackParamsOnSessionSet: true,
    });
  }

  async function handleSignIn() {
    setAuthError(null);
    clearSupabaseSignedOutIntent();
    const result = await beginGoogleSupabaseSignIn();
    if (!result.ok) {
      setAuthError(result.error);
      return;
    }
    window.location.assign(result.authUrl);
  }

  async function handleSignOut() {
    const accessToken = (supabaseSessionRef.current?.access_token ?? supabaseSession?.access_token ?? "").trim();
    authSessionEpochRef.current += 1;
    setAuthError(null);
    supabaseSessionRef.current = null;
    setSupabaseSession(null);
    await resetDesktopSessionStateAfterSignOut({
      clearPersistedSupabaseSession,
      setSupabaseSession,
      setCommunities,
      setActiveCommunityId,
      navStackRef,
    });
    if (accessToken) {
      void revokeSupabaseSessionRemote(accessToken);
    }
  }

	  async function loadCommunities(session: SupabaseSession) {
	    const url = getSupabaseUrl();
	    if (!url) return;
	    setCommunitiesLoadError(null);
	    let response: Response;
	    const userId = getSupabaseAuthUid(session);
	    try {
	      response = await fetchWithSupabaseAuth(
	        `${url}/rest/v1/community_memberships?select=community_id,role,communities(id,slug,name,owner_id,description,avatar_url,banner_url,visibility,created_at,updated_at)&user_id=eq.${userId}`,
	        {},
	        session
	      );
	    } catch {
	      setCommunitiesLoadError("Failed to reach Supabase.");
	      return;
	    }
	    if (!response.ok) {
	      const message = await readSupabaseError(response);
	      // Common during migrations: PostgREST schema cache lags and rejects new columns.
	      // Retry with a minimal select so communities still appear.
	      try {
	        const fallback = await fetchWithSupabaseAuth(
	          `${url}/rest/v1/community_memberships?select=community_id,role,communities(id,slug,name,owner_id,created_at)&user_id=eq.${userId}`,
	          {},
	          session
	        );
	        if (!fallback.ok) {
	          setCommunitiesLoadError(message);
	          return;
	        }
	        const rows = (await fallback.json()) as {
	          community_id: string;
	          role: string;
	          communities: CommunityRecord;
	        }[];
	        const roles: Record<string, string> = {};
	        const list = rows
	          .map((row) => {
	            roles[row.community_id] = row.role;
	            return row.communities;
	          })
	          .filter((item): item is CommunityRecord => Boolean(item));
	        setCommunities(list);
	        setCommunityRoleById(roles);
	        setCommunitiesLoadError(`Community fields are still updating. ${message}`);
	        if (!activeCommunityId) {
	          if (list.length > 0) setActiveCommunityId(list[0].id);
	          return;
	        }
	        if (!list.some((item) => item.id === activeCommunityId) && list.length > 0) {
	          setActiveCommunityId(list[0].id);
	        }
	        return;
	      } catch {
	        setCommunitiesLoadError(message);
	        return;
	      }
	    }

	    const rows = (await response.json()) as {
	      community_id: string;
	      role: string;
	      communities: CommunityRecord;
	    }[];
	    const roles: Record<string, string> = {};
	    const list = rows
	      .map((row) => {
	        roles[row.community_id] = row.role;
	        return row.communities;
	      })
	      .filter((item): item is CommunityRecord => Boolean(item));
	    setCommunities(list);
	    setCommunityRoleById(roles);
	    if (!activeCommunityId) {
	      if (list.length > 0) setActiveCommunityId(list[0].id);
	      return;
	    }
	    if (!list.some((item) => item.id === activeCommunityId) && list.length > 0) {
	      setActiveCommunityId(list[0].id);
	    }
	  }

  async function loadCommunityAccess(communityId: string, session: SupabaseSession) {
	    const url = getSupabaseUrl();
	    if (!url) return;
	    setIsLoadingCommunityAccess(true);
	    try {
	      const response = await fetchWithSupabaseAuth(
	        `${url}/rest/v1/rpc/get_my_community_access`,
	        {
	          method: "POST",
	          headers: { "Content-Type": "application/json" },
	          body: JSON.stringify({ p_community_id: communityId })
	        },
	        session
	      );
	      if (!response.ok) return;
	      const rows = (await response.json()) as CommunityAccess[];
	      setActiveCommunityAccess(rows[0] ?? null);
	    } catch {
	      // ignore
	    } finally {
	      setIsLoadingCommunityAccess(false);
	    }
	  }

        function hydrateCommunityAgentEditor(_slot: number, drafts: CommunityAgentDraft[]) {
          const row = drafts.find((d) => d.slot === 1) ?? null;
          const communityName =
            activeCommunityId ? (communities.find((c) => c.id === activeCommunityId)?.name ?? "").trim() : "";
          const fallbackLanding = communityName
            ? buildDefaultCommunityEmptyThreadLanding(communityName)
            : DEFAULT_EMPTY_THREAD_LANDING;
          const landing = normalizeCommunityAgentLanding(row?.landing_json) ?? fallbackLanding;
          setCommunityAgentDraftName(row?.name ?? "");
          setCommunityAgentDraftLanding(landing);
          setCommunityAgentDraftSystemPrompt(row?.system_prompt ?? "");
          setCommunityAgentDraftSaveError(null);
          communityAgentDraftDirtyRef.current = false;
          setCommunityAgentPreviewTabId(landing.tabs[0]?.id ?? "");
          clearCommunityAgentLandingEdit();
        }

  function showAppToastMessage(message: string) {
	    if (appToastTimeoutRef.current) {
	      window.clearTimeout(appToastTimeoutRef.current);
	      appToastTimeoutRef.current = null;
	    }
	    setAppToast(message);
	    appToastTimeoutRef.current = window.setTimeout(() => {
	      setAppToast(null);
	      appToastTimeoutRef.current = null;
	    }, 2400);
	  }

  async function ingestCommunityAttachmentsFromFileList(
    files: FileList,
    existing: MessageAttachment[],
    onError: (message: string) => void,
  ): Promise<MessageAttachment[]> {
    if (files.length === 0) return existing;
    const remaining = Math.max(0, MAX_COMMUNITY_ATTACHMENTS_PER_MESSAGE - existing.length);
    if (remaining === 0) {
      onError(`You can attach up to ${MAX_COMMUNITY_ATTACHMENTS_PER_MESSAGE} files per message.`);
      return existing;
    }

    const picked = Array.from(files).slice(0, remaining);
    const next: MessageAttachment[] = [];
    for (const file of picked) {
      if (!file) continue;
      const name = (file.name ?? "").trim() || "attachment";
      const isImage = isLikelyImageFile(file, DESKTOP_IMAGE_FILE_DETECTION_OPTIONS);
      const maxBytes = isImage ? MAX_COMMUNITY_IMAGE_UPLOAD_BYTES : MAX_COMMUNITY_FILE_UPLOAD_BYTES;
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
          if (!isSupportedChatRasterImage(file, DESKTOP_IMAGE_FILE_DETECTION_OPTIONS)) {
            onError(`${name}: unsupported image format. Please use PNG, JPG, GIF, WEBP, or AVIF.`);
            continue;
          }
          base.type = "image";
          base.data_url = await readChatImageAsDataUrl(file, MAX_COMMUNITY_IMAGE_DATA_URL_CHARS);
          next.push(base);
          continue;
        } else if (isLikelyTextFile(file)) {
          const { text, truncated } = await readTextAttachmentPreview(file, MAX_COMMUNITY_TEXT_ATTACHMENT_BYTES);
          base.text = text;
          base.truncated = truncated;
          next.push(base);
          continue;
        }
        onError(`${name}: only images or text/code files are supported right now.`);
        continue;
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
    }

    return [...existing, ...next];
  }

  function scrollToCommunityMessage(messageId: string) {
    const target = document.getElementById(`msg-${messageId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  useEffect(() => {
    if (!isSending) {
      sendStartedAtRef.current = null;
      setSendElapsedSec(0);
      return;
    }
    const startedAt = Date.now();
    sendStartedAtRef.current = startedAt;
    setSendElapsedSec(0);
    const interval = window.setInterval(() => {
      setSendElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    return () => window.clearInterval(interval);
  }, [isSending]);

		  const activeCommunity = communities.find((item) => item.id === activeCommunityId) ?? null;
		  const canInviteActiveCommunity = communityActionGuards.canInvite;
		  const isActiveCommunityOwner = communityAccessCapabilities.isOwner;
			  const canViewActiveCommunitySettings = communityNavVisibility.canViewSettings;
			  const canPostMessagesActiveCommunity = communityActionGuards.canPostMessages;
			  const canCreateResourcesActiveCommunity = communityActionGuards.canCreateResources;
			  const canManageResourcesActiveCommunity = communityActionGuards.canManageResources;
			  const canManageMembersActiveCommunity = communityNavVisibility.canManageMembers;
			  const canViewActiveCommunityAnalytics = communityNavVisibility.canViewAnalytics;
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
		        surface: "desktop",
		        authState: supabaseSession ? "authenticated" : "anonymous",
		        builderTier: builderBillingStatus?.builder_tier ?? null,
		      }),
		    [supabaseSession, builderBillingStatus?.builder_tier],
		  );
		  const hasPaidAccess = userAccessPolicy.allowPlatformInference && Boolean(supabaseSession);
      const forceShowDesktopChatgptRateLimitCardPreview = (() => {
        if (typeof window === "undefined") return false;
        try {
          return window.localStorage.getItem("arx-force-chatgpt-rate-card") === "1";
        } catch {
          return false;
        }
      })();
      const showDesktopChatgptRateLimitCard = Boolean(
        forceShowDesktopChatgptRateLimitCardPreview ||
          !chatgptAuthSummary,
      );
		  const applySelectedPickerModel = useCallback(
		    async (modelId: string) => {
		      setActiveModelId(modelId);
		      await runtimeClient.setActiveModel(modelId);
		      if (!activeThreadId) return;
		      try {
		        const service = resolveThreadServiceForThreadId(activeThreadId);
		        const updated = service.setThreadEngine
		          ? await service.setThreadEngine({
		              threadId: activeThreadId,
		              engineId: "messages_agent",
		              modelId,
		            })
		          : null;
		        if (!updated) return;
		        setThreads((prev) => {
		          const existingIndex = prev.findIndex((thread) => thread.id === updated.id);
		          if (existingIndex === -1) return [updated as ThreadRecord, ...prev];
		          const next = [...prev];
		          next[existingIndex] = updated as ThreadRecord;
		          return next;
		        });
		      } catch {
		        // Non-fatal; keep local selection.
		      }
		    },
		    [activeThreadId, resolveThreadServiceForThreadId, runtimeClient],
		  );

		  const {
		    selectedModelLabel,
		    curatedPickerModels,
		    canSelectPickerModel,
		    handleSelectPickerModel: handleSelectPickerModelBase,
		  } = useDesktopModelPickerActions({
		    modelToggles,
		    activeModelId,
		    isModelReady,
		    providerIdForModelId,
		    freeModelAllowlist: DESKTOP_FREE_MODEL_ALLOWLIST,
		    freeModelLabels: DESKTOP_FREE_MODEL_LABELS,
		    premiumModelCatalog: DESKTOP_PREMIUM_MODEL_CATALOG,
		    hasPaidAccess,
		    hasSupabaseSession: Boolean(supabaseSession),
		    hasChatgptAuth: Boolean(chatgptAuthSummary),
		    handleSignIn,
		    openBuilderUpgrade: () => {
		      setBuilderUpgradeContext("builder");
		      setIsBuilderUpgradeOpen(true);
		    },
		    openModelSettings: () => {
		      setActiveView("settings");
		      setSettingsPage("models");
		    },
		    setMemoryToast,
		    onApplyModelSelection: applySelectedPickerModel,
		  });

		  const { visiblePickerModels, openModelPicker, closeModelPicker } = useModelPickerController<
		    DesktopCuratedPickerModel,
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

		  const handleSelectPickerModel = useCallback(
		    async (model: Parameters<typeof handleSelectPickerModelBase>[0]) => {
		      await handleSelectPickerModelBase(model, closeModelPicker);
		    },
		    [closeModelPicker, handleSelectPickerModelBase],
		  );

				  const {
          workspaceVoiceIntent,
          communityVoiceIntent,
          workspaceVoiceUiState,
          communityVoiceUiState,
          handleVoiceInputClick,
        } = useDesktopVoiceInputController({
          shellClient,
          supabaseSession,
          supabaseSessionRef,
          fetchWithSupabaseAuth,
          fetchWithSupabasePublic,
          handleSignIn,
          showAppToastMessage,
          normalizedBuilderTier,
          activeCommunity,
          canPostMessagesActiveCommunity,
          setCommandInput,
          askInputRef,
          setCommunityMessageInput,
          chatInputRef,
        });

        const showEmptyThreadLandingSkeleton = Boolean(
          !activeThreadId &&
            supabaseSession &&
            activeCommunityId &&
            communityActionGuards.canViewCommunity &&
            activeCommunityAgentLandingCommunityIdRef.current !== activeCommunityId,
        );

        const draftThreadLane = useMemo<ThreadLane>(() => {
          if (activeThread) {
            const activeLane = normalizeThreadLane(activeThread.thread_lane, activeThread.engine_id);
            if (activeLane === "chat" && !supabaseSession) return "agent";
            return activeLane;
          }
          if (threadLaneFilter === "chat") return supabaseSession ? "chat" : "agent";
          if (threadLaneFilter === "agent") return "agent";
          if (activeProject) return "agent";
          return supabaseSession ? "chat" : "agent";
        }, [activeProject, activeThread, supabaseSession, threadLaneFilter]);

        const activeProjectLabelForDraft = useMemo(() => {
          if (draftThreadLane !== "agent") return "";
          if (!activeProject) return "";
          const name = (activeProject.name ?? "").trim();
          if (name) return name;
          const rootPath = (activeProject.root_path ?? "").trim();
          if (!rootPath) return "";
          const parts = rootPath.split("/").filter(Boolean);
          return parts[parts.length - 1] ?? rootPath;
        }, [activeProject, draftThreadLane]);

        const emptyThreadLanding = useMemo(() => {
          const landingMatchesCommunity = Boolean(
            activeCommunityId && activeCommunityAgentLandingCommunityIdRef.current === activeCommunityId,
          );
          const communityLanding = landingMatchesCommunity
            ? normalizeCommunityAgentLanding(activeCommunityAgentLanding)
            : null;
          const baseLanding = (() => {
            if (communityLanding) return communityLanding;
            const canViewCommunity = communityActionGuards.canViewCommunity;
            if (activeCommunity && canViewCommunity) {
              return buildDefaultCommunityEmptyThreadLanding(activeCommunity.name);
            }
            return DEFAULT_EMPTY_THREAD_LANDING;
          })();
          if (draftThreadLane === "agent" && activeProjectLabelForDraft) {
            return {
              ...baseLanding,
              title: `How can I help in ${activeProjectLabelForDraft}?`,
            };
          }
          return baseLanding;
        }, [
          activeCommunity,
          communityActionGuards.canViewCommunity,
          activeCommunityAgentLanding,
          activeCommunityId,
          draftThreadLane,
          activeProjectLabelForDraft,
        ]);

        useDesktopUiLifecycleEffects({
          isModelPickerOpen,
          modelPickerRef,
          modelPickerSearchRef,
          closeModelPicker,
          activeThreadId,
          emptyThreadLanding,
          setEmptyThreadSection,
          communityAgentDraftLanding,
          setCommunityAgentPreviewTabId,
        });

  useCommunityAdminAnalyticsLifecycle({
    activePage,
    communityTab,
    supabaseSession,
    activeCommunityId,
    canViewActiveCommunityAnalytics,
    communityAnalyticsRange,
    getCommunityCreatedAt: () => activeCommunity?.created_at ?? null,
    loadCommunityAnalytics,
    resetCommunityAnalytics,
  });

	      const libraryResources = useMemo(
	        () => communityResources.filter((resource) => Boolean(resource.pinned)),
	        [communityResources],
	      );
      const selectedLibraryResource = useMemo(() => {
        if (!selectedLibraryResourceId) return libraryResources[0] ?? null;
        return (
          libraryResources.find((resource) => resource.id === selectedLibraryResourceId) ??
          libraryResources[0] ??
          null
        );
      }, [libraryResources, selectedLibraryResourceId]);
  const communityMessageById = useMemo(() => {
	    const map = new Map<string, CommunityChatMessage>();
	    for (const message of communityMessages) {
	      map.set(message.id, message);
	    }
	    return map;
	  }, [communityMessages]);

	  useEffect(() => {
	    communityMessageIdsRef.current = new Set(communityMessages.map((m) => m.id));
	  }, [communityMessages]);

	  useEffect(() => {
	    communityAttachmentsRef.current = communityAttachments;
	  }, [communityAttachments]);
	  const pendingCommunityMemoryCandidates = useMemo(
	    () =>
	      communityMemoryCandidates.filter((candidate) => {
	        const routerState = candidate.router_state.trim().toLowerCase();
	        return routerState === "queued" || routerState === "needs_review";
	      }),
	    [communityMemoryCandidates],
	  );
		  const reviewedCommunityMemoryCandidates = useMemo(() => {
		    const parseTimestampMs = (value: string | null | undefined): number | null => {
		      const trimmed = (value ?? "").trim();
		      if (!trimmed) return null;
		      const parsed = Date.parse(trimmed);
		      return Number.isFinite(parsed) ? parsed : null;
		    };
		    const reviewed = communityMemoryCandidates.filter((candidate) => {
		      const routerState = candidate.router_state.trim().toLowerCase();
		      return routerState !== "queued" && routerState !== "needs_review";
		    });
		    reviewed.sort((a, b) => {
		      const aTs =
		        parseTimestampMs(a.reviewed_at) ??
		        parseTimestampMs(a.updated_at) ??
		        parseTimestampMs(a.created_at) ??
		        0;
		      const bTs =
		        parseTimestampMs(b.reviewed_at) ??
		        parseTimestampMs(b.updated_at) ??
		        parseTimestampMs(b.created_at) ??
		        0;
		      return bTs - aTs;
		    });
		    return reviewed;
		  }, [communityMemoryCandidates]);
	  const rejectedReviewedCommunityMemoryCandidates = useMemo(
	    () =>
	      reviewedCommunityMemoryCandidates.filter(
	        (candidate) => candidate.router_state.trim().toLowerCase() === "rejected",
	      ),
	    [reviewedCommunityMemoryCandidates],
	  );
	  const actionablePendingInvites = useMemo(
	    () => pendingInvites.filter((invite) => invite.status === "pending"),
	    [pendingInvites]
	  );
	  const communityRailEmptyMessage = useMemo(() => {
	    if (communities.length !== 0) return null;
	    if (!(actionablePendingInvites.length > 0 || supabaseSession)) return null;
	    if (actionablePendingInvites.length > 0) {
	      return `Invite waiting: ${formatInviteLabel(
	        actionablePendingInvites[0].invite_key,
	        actionablePendingInvites[0].community_name,
	      )}`;
	    }
	    if (communitiesLoadError) return "Couldn't load communities. Open Settings → Community.";
	    return "No communities yet.";
	  }, [actionablePendingInvites, communities.length, communitiesLoadError, supabaseSession]);

	  const inviteGateRecord = useMemo(() => {
	    if (!activeInviteGateKey) return null;
	    return pendingInvites.find((invite) => invite.invite_key === activeInviteGateKey) ?? null;
	  }, [activeInviteGateKey, pendingInvites]);
	  const showCommunityRail = true;
	  const effectiveCwd = (activeThread?.workspace_path ?? activeProject?.root_path ?? workspaceRoot ?? "").trim();
	  const projectById = useMemo(() => {
	    return buildProjectByIdMap(projects);
	  }, [projects]);
	  const sortedProjectsByRootDesc = useMemo(
	    () => sortProjectsByRootPathLengthDesc(projects),
	    [projects],
	  );
	  const resolveThreadProjectId = useCallback(
	    (thread: ThreadRecord): string | null => {
	      return resolveThreadProjectIdShared(thread, projectById, sortedProjectsByRootDesc);
	    },
	    [projectById, sortedProjectsByRootDesc],
	  );
	  const {
	    getThreadDisplayTitle,
	    getSidebarThreadTitle,
	  } = useDesktopThreadTitleViewModel({
	    activeThreadId,
	    messages,
	    communities,
	    projectById,
	    resolveThreadProjectId,
	    parseMessageText,
	  });
	  const {
	    normalizedThreadSearch,
	    chatThreads,
	    agentThreads,
	    chatThreadGroups: chatThreadDateGroups,
	    threadSearchResults,
	    projectThreadGroups,
	    generalThreads,
	  } = useDesktopThreadSidebarState({
	    threads,
	    projects,
	    threadSearchQuery,
	    projectById,
	    resolveThreadProjectId,
	    getThreadDisplayTitle,
	  });
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
	  const resolvedActiveCloudProjectId = useMemo(
	    () => resolvePreferredCloudProjectId(cloudProjects, activeCloudProjectId),
	    [activeCloudProjectId, cloudProjects],
	  );
	  const chatProjectThreadGroups = useMemo(
	    () => buildProjectThreadGroups(cloudProjects, chatThreads, resolveCloudThreadProjectId),
	    [chatThreads, cloudProjects, resolveCloudThreadProjectId],
	  );
	  const chatUnassignedThreads = useMemo(
	    () => filterThreadsWithoutProject(chatThreads, resolveCloudThreadProjectId),
	    [chatThreads, resolveCloudThreadProjectId],
	  );
	  const chatThreadGroups = useMemo(() => {
	    if (!supabaseSession) return chatThreadDateGroups;
	    const named = chatProjectThreadGroups
	      .filter((group) => group.threads.length > 0)
	      .map((group) => ({
	        label: (group.project.name ?? "").trim() || "General",
	        threads: group.threads,
	      }));
	    if (chatUnassignedThreads.length > 0) {
	      named.push({ label: "Unassigned", threads: chatUnassignedThreads });
	    }
	    return named;
	  }, [chatProjectThreadGroups, chatThreadDateGroups, chatUnassignedThreads, supabaseSession]);
	  const laneProjectThreadGroups = useMemo(
	    () =>
	      threadLaneFilter === "agent"
	        ? (projectThreadGroups as Array<{ project: ProjectRecord | CloudProjectRecord; threads: ThreadRecord[] }>)
	        : (chatProjectThreadGroups as Array<{ project: ProjectRecord | CloudProjectRecord; threads: ThreadRecord[] }>),
	    [chatProjectThreadGroups, projectThreadGroups, threadLaneFilter],
	  );
	  const laneGeneralThreads = useMemo(
	    () => (threadLaneFilter === "agent" ? generalThreads : chatUnassignedThreads),
	    [chatUnassignedThreads, generalThreads, threadLaneFilter],
	  );
	  const laneFilteredThreadSearchResults = useMemo(
	    () =>
	      threadSearchResults.filter(
	        (thread) => normalizeThreadLane(thread.thread_lane, thread.engine_id) === threadLaneFilter,
	      ),
	    [threadSearchResults, threadLaneFilter],
	  );
	  const resetThreadViewStateForDraft = useCallback(() => {
	    setMessages([]);
	    setToolCalls([]);
	    setTurnsByAssistantEventId({});
	    setSessionResume(null);
	    setAgentStatus(null);
	    setRunningTools([]);
	    setSlashPanel(null);
	    setPendingToolApproval(null);
	    setIsToolApprovalSubmitting(false);
	    clearStreamingState();
	  }, [clearStreamingState]);
	  const onMissingModelForThreadLifecycle = useCallback(() => {
	    setMemoryToast("No model selected. Enable a model in Settings → Models.");
	  }, []);
	  const createDraftThreadRecord = useCallback(
	    (threadId: string, nowSec: number): ThreadRecord => {
	      const cloudProjectId = pendingCloudDraftProjectIdRef.current ?? resolvedActiveCloudProjectId;
	      if (draftThreadLane === "chat") {
	        // One-shot override used when user starts a draft from a specific cloud project row.
	        pendingCloudDraftProjectIdRef.current = null;
	      }
	      return {
	        id: threadId,
	        title: null,
	        engine_id: "messages_agent",
	        model_id: activeModelId,
	        thread_lane: draftThreadLane,
	        storage_mode: storageModeForThreadLane(draftThreadLane),
	        project_id: draftThreadLane === "agent" ? activeProject?.id ?? null : cloudProjectId,
	        community_id: activeCommunityId ?? null,
	        context_version: 0,
	        workspace_path: null,
	        created_at: nowSec,
	        updated_at: nowSec,
	        last_event_at: null,
	        last_seq: 0,
	      };
	    },
	    [activeCommunityId, activeModelId, activeProject?.id, draftThreadLane, resolvedActiveCloudProjectId],
	  );
  const {
    ensureThreadId,
    enterDraftThread,
    handleDeleteThread,
  } = useDesktopThreadLifecycle({
	    activeThreadId,
	    activeModelId,
    effectiveCwd,
    threads,
    runtimeClient,
    persistThread: async (thread) => {
      const router = desktopThreadServiceRouter;
      const domain = resolveThreadServiceDomain({
        storageMode: thread.storage_mode,
        threadLane: thread.thread_lane,
        engineId: thread.engine_id,
      });
      const service = router.resolveByLane(thread.thread_lane, domain.storageMode);
      try {
        const created = await service.createThread({
          threadId: thread.id,
          title: thread.title,
          engineId: thread.engine_id,
          modelId: thread.model_id,
          threadLane: thread.thread_lane,
          storageMode: thread.storage_mode,
          projectId: thread.project_id,
          communityId: thread.community_id,
          createdAt: thread.created_at,
          updatedAt: thread.updated_at,
        });
        return (created as ThreadRecord | null) ?? thread;
      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to persist thread.";
        setMemoryToast(message);
        return null;
      }
    },
    deleteThreadRecord: async (threadId) => {
      const service = resolveThreadServiceForThreadId(threadId);
      try {
        await service.deleteThread(threadId);
      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to delete thread.";
        setMemoryToast(message);
        throw error;
      }
    },
    createDraftThreadRecord,
    onMissingModel: onMissingModelForThreadLifecycle,
    setThreads,
	    setActiveThreadId,
	    setMessages,
	    resetThreadViewStateForDraft,
	    focusChatInput,
	  });
	  const onInvalidModelForThreadSend = useCallback(() => {
	    setMemoryToast("Invalid model selection. Enable a model in Settings → Models.");
	  }, []);
	  const { ensureThreadReadyForSend } = useDesktopThreadSendReadiness({
	    threads,
	    getThreadRecord,
	    activeModelId,
	    defaultModelId: DEFAULT_ACTIVE_MODEL_ID,
	    defaultGuestModelId: DEFAULT_GUEST_MODEL_ID,
	    enabledModelIds: modelToggles.filter((toggle) => toggle.enabled).map((toggle) => toggle.id),
	    freeModelAllowlist: DESKTOP_FREE_MODEL_ALLOWLIST,
	    hasPaidAccess,
	    hasChatgptAuth: Boolean(chatgptAuthSummary),
	    providerIdForModelId,
	    onMissingModel: onMissingModelForThreadLifecycle,
	    onInvalidModel: onInvalidModelForThreadSend,
	    getThreadServiceById: resolveThreadServiceForThreadId,
	    setThreads,
	  });

  type WorkspaceLensTarget = {
    threadId: string;
    fromCommunityId: string | null;
    communityId: string | null;
    communityName: string;
    session: SupabaseSession | null;
    storageMode: "cloud" | "local";
    expectedContextVersion: number | null;
  };

  function isThreadContextVersionConflict(error: unknown): boolean {
    const message =
      typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "";
    const normalized = message.toLowerCase();
    return normalized.includes("thread context version conflict")
      || normalized.includes("thread_context_version_conflict");
  }

  function resolveLensRouteErrorCode(error: unknown): string | null {
    const message =
      typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "";
    const normalized = message.toLowerCase();
    if (!normalized) return null;
    if (normalized.includes("missing session") || normalized.includes("sign in")) return "auth_required";
    if (normalized.includes("thread not found") || normalized.includes("thread_not_found")) return "thread_not_found";
    if (isThreadContextVersionConflict(message)) return "context_version_conflict";
    if (normalized.includes("forbidden")) return "forbidden";
    return "unknown";
  }

  async function setThreadCommunityLensLocal(params: {
    threadId: string;
    communityId: string | null;
  }): Promise<ThreadRecord> {
    return runtimeClient.setThreadContext({
      thread_id: params.threadId,
      community_id: params.communityId,
      update_community_id: true,
    });
  }

  const workspaceLensController = useLastClickWinsController<WorkspaceLensTarget>({
    applyTarget: async (desired) => {
      const service = resolveThreadServiceForThreadId(desired.threadId);
      const updated = await service.setThreadLens({
        threadId: desired.threadId,
        communityId: desired.communityId,
        expectedContextVersion: desired.expectedContextVersion,
      });
      if (!updated) return;
      setThreads((prev) => {
        const idx = prev.findIndex((t) => t.id === updated.id);
        if (idx === -1) return prev;
        const copy = [...prev];
        copy[idx] = updated as ThreadRecord;
        return copy;
      });
    },
    onTargetSettled: ({ target, isLatest, error }) => {
      if (!isLatest) return;
      const result = error ? "error" : "ok";
      const errorCode = resolveLensRouteErrorCode(error);
      traceThreadContext("lens_route_apply", {
        surface: "desktop",
        thread_id: target.threadId,
        storage_mode: target.storageMode,
        from_community_id: target.fromCommunityId,
        to_community_id: target.communityId,
        result,
        error_code: errorCode,
      });
      traceThreadContext("lens_set_settled", {
        surface: "desktop",
        thread_id: target.threadId,
        to_community_id: target.communityId,
        is_latest: isLatest,
        status: result,
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
    if (currentLens === target.communityId && !workspaceLensController.isInFlight()) {
      return Promise.resolve();
    }
    return workspaceLensController.requestTarget({
      ...target,
      expectedContextVersion:
        typeof currentThread?.context_version === "number"
          ? currentThread.context_version
          : target.expectedContextVersion,
    });
  };

  const syncWorkspaceThreadCommunityLens = (
    thread: ThreadRecord,
    desiredCommunityId: string | null,
  ): Promise<void> => {
    const storageMode = resolveThreadServiceDomain({
      storageMode: thread.storage_mode,
      threadLane: thread.thread_lane,
      engineId: thread.engine_id,
    }).storageMode;
    const desiredCommunityName = desiredCommunityId
      ? (communities.find((community) => community.id === desiredCommunityId)?.name ?? desiredCommunityId)
      : "none";
    const session = supabaseSessionRef.current;
    if (storageMode === "cloud" && !session) {
      const message = "Sign in to switch community context for cloud chat threads.";
      setAuthError(message);
      showAppToastMessage(message);
      traceThreadContext("lens_route_apply", {
        surface: "desktop",
        thread_id: thread.id,
        storage_mode: storageMode,
        from_community_id: thread.community_id ?? null,
        to_community_id: desiredCommunityId,
        result: "blocked",
        error_code: "auth_required",
      });
      void handleSignIn();
      return Promise.resolve();
    }
    traceThreadContext("lens_set_requested", {
      surface: "desktop",
      thread_id: thread.id,
      thread_lane: thread.thread_lane,
      storage_mode: storageMode,
      project_id: resolveThreadProjectId(thread),
      from_community_id: thread.community_id ?? null,
      to_community_id: desiredCommunityId,
      context_version: typeof thread.context_version === "number" ? thread.context_version : null,
    });
    return requestWorkspaceThreadLens({
      threadId: thread.id,
      fromCommunityId: thread.community_id ?? null,
      communityId: desiredCommunityId,
      communityName: desiredCommunityName,
      session: storageMode === "cloud" ? (session ?? null) : null,
      storageMode,
      expectedContextVersion:
        typeof thread.context_version === "number" ? thread.context_version : null,
    });
  };

  const desktopThreadContextController = createThreadContextController<ThreadRecord>({
    surface: "desktop",
    getActivePage: () => activePage,
    getDesiredCommunityId: () => activeCommunityId ?? null,
    getActiveThreadId: () => activeThreadId,
    getActiveCommunityId: () => activeCommunityId ?? null,
    findThreadById: (threadId: string) => threads.find((thread) => thread.id === threadId) ?? null,
    getLatestThreadRecord: (threadId: string) => getThreadRecord(threadId),
    syncThreadCommunityLens: (thread: ThreadRecord, desiredCommunityId: string | null) =>
      syncWorkspaceThreadCommunityLens(thread, desiredCommunityId),
    onSelectThread: (thread: ThreadRecord) => {
      const lane = normalizeThreadLane(thread.thread_lane, thread.engine_id);
      setThreadLaneFilter(lane);
      setActiveCommunityId(thread.community_id ?? null);
      setActiveThreadId(thread.id);
      if (lane === "chat") {
        const cloudProjectId = (thread.project_id ?? "").trim();
        if (cloudProjectId) setActiveCloudProjectId(cloudProjectId);
        return;
      }
      const localProjectId = resolveThreadProjectId(thread);
      const localProject = localProjectId ? projectById.get(localProjectId) ?? null : null;
      const currentProjectId = activeProject?.id ?? null;
      const nextProjectId = localProject?.id ?? null;
      if (currentProjectId !== nextProjectId) {
        void handleSetActiveProject(localProject);
      }
    },
    trace: traceThreadContext,
    buildThreadSelectedTrace: (thread: ThreadRecord) => ({
      to_thread_lane: thread.thread_lane,
      to_project_id: resolveThreadProjectId(thread),
      to_context_version:
        typeof thread.context_version === "number" ? thread.context_version : null,
    }),
  });

  const ensureWorkspaceThreadLensBeforeSend = (threadId: string): Promise<void> =>
    desktopThreadContextController.ensureLensBeforeSend(threadId);

  function handleSelectActiveCommunity(next: string) {
    if (
      !confirmDiscardUnsavedCommunitySettingsDesktop({
        isCommunitySettingsDirty: communitySettingsDirtyRef.current,
        activeCommunityId,
        nextCommunityId: next,
        confirmDiscard: (message) => window.confirm(message),
      })
    ) {
      return;
    }
    setActiveCommunityId(next);
    // Desktop community rail is a context selector. We only retarget the *active
    // personal thread* lens while the user is on the AI workspace page, to match Web.
    if (activePage !== "workspace") return;
    if (!activeThreadId) return;
    const currentLensCommunityId = activeThread?.community_id ?? null;
    if (next === currentLensCommunityId) return;
    if (isSending || sendInFlightRef.current) {
      const nextCommunityName = communities.find((c) => c.id === next)?.name ?? next;
      showAppToastMessage(
        `Switched to ${nextCommunityName}. Active run keeps prior context; new context applies next turn.`,
      );
    }

    if (!activeThread) return;
    void syncWorkspaceThreadCommunityLens(activeThread, next);
  }

  // Helper to display user names with session context
	  const displayName = useCallback((userId: string): string => {
	    const trimmedName = profileName.trim();
	    const trimmedUsername = profileUsername.trim();
	    if (supabaseSession?.user.id === userId) {
	      if (trimmedName) return trimmedName;
	      if (trimmedUsername) return trimmedUsername.startsWith("@") ? trimmedUsername : `@${trimmedUsername}`;
	    }
	    const remote = profilesByUserId[userId];
	    const remoteName = remote?.display_name?.trim();
	    if (remoteName) return remoteName;
	    return shortId(userId, supabaseSession?.user.id, supabaseSession?.user.email ?? undefined);
	  }, [profileName, profileUsername, profilesByUserId, supabaseSession?.user.id, supabaseSession?.user.email]);

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

  useLayoutEffect(() => {
    const nextDraft = readProfileDraftForUser(profileStorageUserId);
    setProfileName(nextDraft.name);
    setProfileUsername(nextDraft.username);
    setProfileBio(nextDraft.bio);
    setProfileAvatarUrl(nextDraft.avatarUrl);
  }, [profileStorageUserId]);

  useEffect(() => {
    if (supabaseSession) return;
    if (!profileName && !profileUsername && !profileBio && !profileAvatarUrl) return;
    setProfileName("");
    setProfileUsername("");
    setProfileBio("");
    setProfileAvatarUrl(null);
  }, [supabaseSession, profileName, profileUsername, profileBio, profileAvatarUrl]);

  useEffect(() => {
    writeProfileDraftForUser(profileStorageUserId, {
      name: profileName,
      username: profileUsername,
      bio: profileBio,
      avatarUrl: profileAvatarUrl,
    });
  }, [profileStorageUserId, profileName, profileUsername, profileBio, profileAvatarUrl]);

  async function loadWorkspaceRoot() {
    try {
      const root = await runtimeClient.getWorkspaceRoot();
      setWorkspaceRoot((root ?? "").trim() || null);
    } catch {
      setWorkspaceRoot(null);
    }
  }

  async function loadProjects() {
    try {
      const rows = await runtimeClient.listProjects();
      setProjects(rows);
      setProjectExpandedById((prev) => {
        const next: Record<string, boolean> = {};
        for (const project of rows) {
          next[project.id] = prev[project.id] ?? true;
        }
        return next;
      });
    } catch {
      setProjects([]);
    }
  }

  async function loadActiveProject() {
    try {
      const active = await runtimeClient.getActiveProject();
      setActiveProject(active);
    } catch {
      setActiveProject(null);
    }
  }

  async function handleAddProjectFromFolderPicker() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Add Project Folder",
    });
    if (!selected || Array.isArray(selected)) return;
    try {
      const created = await runtimeClient.createProject(selected);
      const existedBefore = projects.some((project) => project.id === created.id);
      setProjects((prev) => {
        const without = prev.filter((project) => project.id !== created.id);
        return [created, ...without];
      });
      setProjectExpandedById((prev) => ({ ...prev, [created.id]: true }));
      setActiveProject(created);
      await runtimeClient.setActiveProject(created.id);
      setMemoryToast(
        existedBefore
          ? `Project already added: ${(created.name ?? "").trim() || created.root_path}`
          : `Added project: ${(created.name ?? "").trim() || created.root_path}`,
      );
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to add project.";
      setMemoryToast(message);
    }
  }

  async function handleRemoveProject(project: ProjectRecord) {
    setProjectMenuProjectId(null);
    const label = (project.name ?? "").trim() || project.root_path;
    const shouldRemove = window.confirm(
      `Remove project \"${label}\" from this desktop?\n\nThreads stay in local history; this only removes project grouping.`,
    );
    if (!shouldRemove) return;
    try {
      await runtimeClient.deleteProject(project.id);
      setProjects((prev) => prev.filter((row) => row.id !== project.id));
      try {
        const refreshedThreads = await listLocalThreads();
        setThreads(refreshedThreads);
      } catch {
        setThreads((prev) =>
          prev.map((thread) =>
            thread.project_id === project.id
              ? {
                  ...thread,
                  project_id: null,
                }
              : thread,
          ),
        );
      }
      setProjectExpandedById((prev) => {
        const next = { ...prev };
        delete next[project.id];
        return next;
      });
      if (activeProject?.id === project.id) {
        setActiveProject(null);
        await runtimeClient.setActiveProject(null);
      }
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to remove project.";
      setMemoryToast(message);
    }
  }

  async function handleRenameProject(project: ProjectRecord) {
    setProjectMenuProjectId(null);
    const defaultName = (project.name ?? "").trim() || (project.root_path.split("/").pop() ?? project.root_path);
    const nextName = window.prompt("Project name", defaultName);
    if (nextName === null) return;
    const cleaned = nextName.trim();
    if (!cleaned) {
      setMemoryToast("Project name cannot be empty.");
      return;
    }
    try {
      const updated = await runtimeClient.updateProjectName(project.id, cleaned);
      setProjects((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      if (activeProject?.id === updated.id) {
        setActiveProject(updated);
      }
      setProjectMenuProjectId(null);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to rename project.";
      setMemoryToast(message);
    }
  }

  async function handleAddCloudProject(): Promise<void> {
    const session = supabaseSessionRef.current ?? supabaseSession;
    if (!session) {
      setAuthError("Sign in to manage cloud projects.");
      void handleSignIn();
      return;
    }
    const suggestedName = `Project ${Math.max(1, cloudProjects.length + 1)}`;
    const nextName = window.prompt("Cloud project name", suggestedName);
    const cleaned =
      nextName === null
        ? cloudProjects.length === 0
          ? suggestedName
          : ""
        : nextName.trim();
    if (!cleaned) {
      if (nextName === null) return;
      setMemoryToast("Project name cannot be empty.");
      return;
    }
    const url = getSupabaseUrl();
    if (!url) {
      setMemoryToast("Missing Supabase URL.");
      return;
    }
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/create_cloud_project`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p_name: cleaned, p_slug: null }),
        },
        session,
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      const payload = (await response.json()) as unknown;
      const rows = Array.isArray(payload) ? payload : [payload];
      let createdProject: CloudProjectRecord | null = null;
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const id = String((row as Record<string, unknown>).id ?? "").trim();
        if (!id) continue;
        const slugRaw = (row as Record<string, unknown>).slug;
        const slug = typeof slugRaw === "string" ? slugRaw.trim() || null : null;
        const statusRaw = (row as Record<string, unknown>).status;
        const createdAtRaw = (row as Record<string, unknown>).created_at;
        const updatedAtRaw = (row as Record<string, unknown>).updated_at;
        createdProject = {
          id,
          name:
            typeof (row as Record<string, unknown>).name === "string"
              ? String((row as Record<string, unknown>).name)
              : cleaned,
          slug,
          status:
            typeof statusRaw === "string" && statusRaw.trim()
              ? statusRaw.trim().toLowerCase()
              : "active",
          created_at:
            typeof createdAtRaw === "string"
              ? (toUnixSecondsFromIso(createdAtRaw) ?? Math.floor(Date.now() / 1000))
              : Math.floor(Date.now() / 1000),
          updated_at:
            typeof updatedAtRaw === "string"
              ? (toUnixSecondsFromIso(updatedAtRaw) ?? Math.floor(Date.now() / 1000))
              : Math.floor(Date.now() / 1000),
          root_path: slug ? `cloud/${slug}` : `cloud/${id}`,
        };
        break;
      }
      if (createdProject) {
        setCloudProjects((prev) => {
          const merged = [createdProject!, ...prev.filter((project) => project.id !== createdProject!.id)];
          return merged.sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0));
        });
        setProjectExpandedById((prev) => ({ ...prev, [createdProject.id]: true }));
        setActiveCloudProjectId(createdProject.id);
      }
      await loadCloudProjects(session);
      setThreadLaneFilter("chat");
      setMemoryToast(`Created cloud project: ${cleaned}`);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to create cloud project.";
      setMemoryToast(message);
    }
  }

  async function handleRenameCloudProject(project: CloudProjectRecord): Promise<void> {
    const session = supabaseSessionRef.current ?? supabaseSession;
    if (!session) {
      setAuthError("Sign in to manage cloud projects.");
      void handleSignIn();
      return;
    }
    setProjectMenuProjectId(null);
    const defaultName = (project.name ?? "").trim() || (project.root_path.split("/").pop() ?? project.root_path);
    const nextName = window.prompt("Cloud project name", defaultName);
    if (nextName === null) return;
    const cleaned = nextName.trim();
    if (!cleaned) {
      setMemoryToast("Project name cannot be empty.");
      return;
    }
    const url = getSupabaseUrl();
    if (!url) {
      setMemoryToast("Missing Supabase URL.");
      return;
    }
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/rename_cloud_project`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p_project_id: project.id, p_name: cleaned }),
        },
        session,
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      await loadCloudProjects(session);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to rename cloud project.";
      setMemoryToast(message);
    }
  }

  async function handleRemoveCloudProject(project: CloudProjectRecord): Promise<void> {
    const session = supabaseSessionRef.current ?? supabaseSession;
    if (!session) {
      setAuthError("Sign in to manage cloud projects.");
      void handleSignIn();
      return;
    }
    setProjectMenuProjectId(null);
    if (String(project.slug ?? "").trim().toLowerCase() === "general") {
      setMemoryToast("General project cannot be removed.");
      return;
    }
    const label = (project.name ?? "").trim() || project.root_path;
    const shouldRemove = window.confirm(
      `Delete cloud project "${label}"?\n\nIts threads will move to General.`,
    );
    if (!shouldRemove) return;
    const url = getSupabaseUrl();
    if (!url) {
      setMemoryToast("Missing Supabase URL.");
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
        session,
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      await Promise.all([loadCloudProjects(session), loadThreads()]);
      setMemoryToast(`Deleted cloud project: ${label}`);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to remove cloud project.";
      setMemoryToast(message);
    }
  }

  function handleStartDraftInCloudProject(project: CloudProjectRecord): void {
    setProjectMenuProjectId(null);
    pendingCloudDraftProjectIdRef.current = project.id;
    setThreadLaneFilter("chat");
    setActiveCloudProjectId(project.id);
    enterDraftThread();
  }

  async function handleSetActiveProject(project: ProjectRecord | null) {
    try {
      await runtimeClient.setActiveProject(project?.id ?? null);
      setActiveProject(project);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to switch project.";
      setMemoryToast(message);
    }
  }

  function focusChatInput() {
    requestAnimationFrame(() => chatInputRef.current?.focus());
  }

  const { handleSlashCommand, handleSlashSelect } = useDesktopSlashCommands({
    sessionResume,
    formatRelativeTime,
    agentMode,
    activeModelId,
    workspaceRoot,
    activeProject,
    execPolicyRules,
    effectiveCwd,
    runtimeClient,
    setSlashPanel,
    setAgentMode,
    getSession: () => supabaseSessionRef.current,
    getSupabaseUrl,
    setAuthError,
    handleSignIn,
    fetchWithSupabaseAuth,
    getSupabaseAuthUid,
    getEffectiveWorkspacePath,
    readSupabaseError,
    setActiveView,
    setSettingsPage,
    setPersonalMemoryQuery,
    loadPersonalMemoryItems,
    ensureThreadId,
    setCommandInput,
    dispatchRunPhase,
    setAgentStatus,
    setRunningTools,
  });

  const ensureThreadReadyForDesktopSend = useCallback(
    async (threadId: string, session: SupabaseSession | null): Promise<boolean> => {
      const service = resolveThreadServiceForThreadId(threadId);
      if (service.storageMode === "cloud" && !session) {
        const message = "Sign in to send cloud chat messages.";
        setAuthError(message);
        setMemoryToast(message);
        await handleSignIn();
        return false;
      }
      return ensureThreadReadyForSend(threadId, session);
    },
    [ensureThreadReadyForSend, handleSignIn],
  );

  const { handleSendMessage } = useDesktopSendMessageFlow<
    ThreadRecord,
    MessageRecord,
    SupabaseSession | null
  >({
    commandInput,
    attachments,
    activeThreadId,
    effectiveCwd,
    sendInFlightRef,
    autoScrollEnabledRef,
    dispatchRunPhase,
    ensureThreadId,
    getSession: () => supabaseSessionRef.current,
    ensureWorkspaceThreadLensBeforeSend,
    traceThreadContext: (event, payload) =>
      traceThreadContext(event, {
        surface: "desktop",
        ...payload,
      }),
    setCommandInput,
    setAttachments,
    handleSlashCommand,
    getThreadServiceById: resolveThreadServiceForThreadId,
    loadMessages,
    setMessages,
    setThreads,
    ensureThreadReadyForSend: ensureThreadReadyForDesktopSend,
    prepareSessionForSend: async (session, threadId) => {
      const service = resolveThreadServiceForThreadId(threadId);
      if (service.storageMode !== "local") return session;
      if (!session) return session;
      const thread = threads.find((candidate) => candidate.id === threadId) ?? null;
      const modelId = (thread?.model_id ?? activeModelId ?? "").trim();
      if (isFreeModelId(modelId, DESKTOP_FREE_MODEL_ALLOWLIST)) {
        return session;
      }
      const fresh = await ensureAuthenticatedSendSession(session);
      if (!fresh) {
        setAuthError(SUPABASE_SESSION_EXPIRED_MESSAGE);
        throw new Error(SUPABASE_SESSION_EXPIRED_MESSAGE);
      }
      return fresh;
    },
    clearStreamingState,
    setStreamingRunId,
    scheduleStreamingUpdate,
    streamingContentRef,
    streamingTokensRef,
    streamingMetaRef,
    getSupabaseUrl,
    getSupabaseAnonKey,
    setMemoryToast,
    setAgentStatus,
    setRunningTools,
    getSendPolicySnapshot: (threadId) => {
      const thread = threads.find((candidate) => candidate.id === threadId) ?? null;
      const selectedModelId = (activeModelId ?? thread?.model_id ?? "").trim() || null;
      return {
        selectedModelId,
        hasChatgptAuth: Boolean(chatgptAuthSummary),
        approvalMode,
      };
    },
  });

  async function applyApprovalMode(mode: "read-only" | "agent" | "agent-full") {
    const preset = APPROVAL_PRESETS[mode];
    setApprovalMode(mode);
    setExecPolicyRules(preset.rules);
    await runtimeClient.setApprovalMode(mode);
    await runtimeClient.setExecPolicyRules(preset.rules);
  }

  const { resolvePendingToolApproval } = useDesktopToolApprovalActions<ToolApprovalRequestedPayload>({
    runtimeClient,
    setMemoryToast,
    pendingToolApproval,
    setPendingToolApproval,
    setIsToolApprovalSubmitting,
    onApprovalResolved: () => {
      dispatchRunPhase({ type: "approval_resolved" });
    },
  });

  const activeToolCalls = useMemo(() => {
    if (!activeThreadId) return [];
    return toolCalls.filter((call) => call.session_id === activeThreadId);
  }, [toolCalls, activeThreadId]);

  type ToolGroupRecord = {
    id: string;
    session_id: string;
    run_id: string | null;
    created_at: number;
    updated_at: number;
    tool_calls: ToolCallRecord[];
  };

  const shouldHideToolCallFromFeed = (call: ToolCallRecord): boolean =>
    call.tool_name === "update_plan";
  const shouldHideToolNameFromUi = (toolName: string | null | undefined): boolean =>
    (toolName ?? "").trim() === "update_plan";

  const { cancelActiveRun } = useDesktopRunOrchestration<
    ToolApprovalRequestedPayload,
    AgentStatusPayload,
    RunningTool
  >({
    activeThreadId,
    activePage,
    slashQuery: slashState.query,
    isSending,
    streamingContent,
    pendingToolApproval,
    runningToolCallId,
    runtimeClient,
    cancelRunForThread,
    dispatchRunPhase,
    setPendingToolApproval,
    setIsToolApprovalSubmitting,
    setAgentStatus,
    setRunningTools,
    setRunningToolCallId,
    setMemoryToast,
    memoryToastTimeoutRef,
    clearStreamingRefs,
    scheduleStreamingUpdate,
    setStreamingContent,
    setStreamingRunId,
    setStreamingTokens,
    setStreamingMeta,
    streamingContentRef,
    streamingTokensRef,
    streamingMetaRef,
    loadMessages,
    loadToolCalls,
    handleOpenedUrls,
    shouldHideToolNameFromUi,
  });

  const isAgentToolCallRecord = (call: ToolCallRecord): boolean =>
    ([
      "read",
      "list_dir",
      "sha256",
      "write",
      "edit",
      "glob",
      "grep",
      "bash"
    ] as const).includes(call.tool_name as any) &&
    (["requested", "approved", "denied", "started", "finished"] as const).includes(call.status as any);

  const activeToolGroups = useMemo((): ToolGroupRecord[] => {
    const groups = new Map<string, ToolGroupRecord>();
    for (const call of activeToolCalls) {
      if (shouldHideToolCallFromFeed(call)) continue;
      if (!isAgentToolCallRecord(call)) continue;

      const runId = (call.run_id ?? "").trim();
      const groupId = runId ? `tools_run::${runId}` : `tools_run::unknown::${call.session_id}`;
      const existing = groups.get(groupId);
      if (!existing) {
        groups.set(groupId, {
          id: groupId,
          session_id: call.session_id,
          run_id: runId || null,
          created_at: call.created_at,
          updated_at: call.updated_at,
          tool_calls: [call],
        });
      } else {
        existing.tool_calls.push(call);
        existing.created_at = Math.min(existing.created_at, call.created_at);
        existing.updated_at = Math.max(existing.updated_at, call.updated_at);
      }
    }

    const out = Array.from(groups.values());
    for (const group of out) {
      group.tool_calls.sort((a, b) => a.created_at - b.created_at);
      // Place the group at the end of the tool activity window.
      group.created_at = group.updated_at;
    }
    out.sort((a, b) => a.created_at - b.created_at);
    return out;
  }, [activeToolCalls]);

  const activeUngroupedToolCalls = useMemo(() => {
    return activeToolCalls.filter(
      (call) => !shouldHideToolCallFromFeed(call) && !isAgentToolCallRecord(call)
    );
  }, [activeToolCalls]);

  // Combined feed: messages + tool groups sorted by created_at
  type FeedItem =
    | { type: "message"; data: MessageRecord }
    | { type: "tool_group"; data: ToolGroupRecord }
    | { type: "tool"; data: ToolCallRecord };

  const combinedFeed = useMemo((): FeedItem[] => {
    const items: FeedItem[] = [
      ...messages.filter((m) => m.role !== "system").map((m): FeedItem => ({ type: "message", data: m })),
      ...activeToolGroups.map((t): FeedItem => ({ type: "tool_group", data: t })),
      ...activeUngroupedToolCalls.map((t): FeedItem => ({ type: "tool", data: t })),
    ];
    return items.sort((a, b) => {
      const aTime = a.type === "message" ? a.data.created_at : a.data.created_at;
      const bTime = b.type === "message" ? b.data.created_at : b.data.created_at;
      return aTime - bTime;
    });
  }, [messages, activeToolGroups, activeUngroupedToolCalls]);
  const turnMetaByMessageId = useMemo(() => {
    const result = new Map<string, { isEndOfTurn: boolean; turnContent: string }>();
    const messageItems = combinedFeed.filter(
      (item): item is { type: "message"; data: MessageRecord } => item.type === "message",
    );
    if (messageItems.length === 0 || streamingContent) {
      return result;
    }

    let assistantBuffer: MessageRecord[] = [];
    const flushAssistantTurn = () => {
      if (assistantBuffer.length === 0) return;
      const endMessage = assistantBuffer[assistantBuffer.length - 1];
      const turnContent = assistantBuffer
        .map((message) => parseMessageText(message.content_json))
        .join("\n\n");
      result.set(endMessage.id, {
        isEndOfTurn: true,
        turnContent,
      });
      assistantBuffer = [];
    };

    for (const item of messageItems) {
      const message = item.data;
      if (message.role === "assistant") {
        assistantBuffer.push(message);
        continue;
      }
      if (message.role === "user") {
        flushAssistantTurn();
      }
    }
    flushAssistantTurn();
    return result;
  }, [combinedFeed, streamingContent]);
  const hasPersistedAssistantForStreamingRun = useMemo(() => {
    const runId = (streamingRunId ?? "").trim();
    if (!runId) return false;
    return messages.some(
      (message) => message.role === "assistant" && (message.run_id ?? "").trim() === runId,
    );
  }, [messages, streamingRunId]);

  useEffect(() => {
    if (!hasPersistedAssistantForStreamingRun) return;
    clearStreamingState();
  }, [clearStreamingState, hasPersistedAssistantForStreamingRun]);
  const [expandedOutputIds, setExpandedOutputIds] = useState<Set<string>>(new Set());
  const [expandedToolGroupIds, setExpandedToolGroupIds] = useState<Set<string>>(new Set());
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [sourcesUsed, setSourcesUsed] = useState<SourcesUsedState>({ open: false });
  const { handleOpenSourcesUsed } = useDesktopSourcesUsed({
    activeThreadId,
    runtimeClient,
    setSourcesUsed,
  });

  const toggleToolGroupExpanded = useCallback((groupId: string) => {
    setExpandedToolGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  useEffect(() => {
    setExpandedToolGroupIds(new Set());
  }, [activeThreadId]);

  async function handleCopyMessage(messageId: string, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }

  function toggleOutputExpanded(toolCallId: string) {
    setExpandedOutputIds((prev) => {
      const next = new Set(prev);
      if (next.has(toolCallId)) {
        next.delete(toolCallId);
      } else {
        next.add(toolCallId);
      }
      return next;
    });
  }

  const persistActiveProjectForPanel = useCallback(
    async (projectId: string) => {
      try {
        await runtimeClient.setActiveProject(projectId);
      } catch {
        // best-effort persistence; local UI state is authoritative for immediate draft routing.
      }
    },
    [runtimeClient],
  );

  const threadPanelController = useDesktopThreadPanelActions<ProjectRecord>({
    activeProjectId: activeProject?.id ?? null,
    setActiveProject: (project) => setActiveProject(project),
    persistActiveProject: persistActiveProjectForPanel,
    enterDraftThread,
    projectMenuProjectId,
    setProjectMenuProjectId,
    setProjectExpandedById,
    projectMenuRef,
  });

  const handleSelectThreadFromSidebar = (thread: ThreadRecord) => {
    desktopThreadContextController.selectThread(thread);
  };

  const renderSessionItem = (
    thread: ThreadRecord,
    opts?: { showProjectHint?: boolean },
  ) => {
    const resolvedLabel = getSidebarThreadTitle(thread, opts);
    return (
      <ThreadSidebarSessionItem
        key={thread.id}
        title={resolvedLabel}
        isActive={thread.id === activeThreadId}
        onSelect={() => handleSelectThreadFromSidebar(thread)}
        onDelete={() => handleDeleteThread(thread.id)}
      />
    );
  };

  const defaultBackLabel = "workspace";
  const backTargetSnapshot = navStackRef.current.length > 0 ? navStackRef.current[navStackRef.current.length - 1] : null;
  const backTargetLabel = backTargetSnapshot ? formatBackTargetLabelShared(backTargetSnapshot) : null;
  const handleTopbarBackFromWorkspaceSettings = () => {
    if (goBack()) return;
    const transition = deriveBackFromWorkspaceSettingsFallbackTransition();
    setActiveView(transition.nextView);
  };
  const handleTopbarToggleThreadsPanel = () => {
    setUserWantsSessions((prev) => !prev);
  };
  const handleTopbarNewThread = () => {
    pendingCloudDraftProjectIdRef.current = null;
    if (threadLaneFilter === "chat" && !supabaseSession) {
      setThreadLaneFilter("agent");
      showAppToastMessage("Cloud chat requires sign-in. Started a local agent thread instead.");
    }
    enterDraftThread();
  };
  const handleTopbarBackToWorkspace = () => {
    if (goBack()) return;
    const transition = deriveBackToWorkspaceFallbackTransition({ activeView });
    setActivePage(transition.nextPage);
    setActiveView(transition.nextView);
  };
  const handleTopbarOpenCommunity = () => {
    if (!activeCommunity) return;
    const nextCommunityId = activeCommunityId ?? activeCommunity.id;
    openCommunityTab(nextCommunityId, "chat", { pushSnapshot: true, clearUnread: true });
  };
  const handleRailOpenDiscover = () => {
    const transition = deriveOpenDiscoverTransition({ activePage });
    if (transition.shouldPushSnapshot) pushNavSnapshot();
    setActiveView(transition.nextView);
    setActivePage(transition.nextPage);
  };
  const handleRailToggleSettings = () => {
    const transition = deriveToggleWorkspaceSettingsTransition({ activePage, activeView });
    if (transition.shouldPushSnapshot) pushNavSnapshot();
    setActivePage(transition.nextPage);
    setActiveView(transition.nextView);
  };

  return (
    <div className="app-root desktop-root">
      <DesktopTopbar
			                state={{
          activePage,
          activeView,
          userWantsSessions,
          backTargetLabel,
          defaultBackLabel,
          activeCommunity,
          unreadCount,
        }}
        actions={{
          getCommunityInitials: communityInitials,
          onBackFromWorkspaceSettings: handleTopbarBackFromWorkspaceSettings,
          onToggleThreadsPanel: handleTopbarToggleThreadsPanel,
          onNewThread: handleTopbarNewThread,
          onBackToWorkspace: handleTopbarBackToWorkspace,
          onOpenCommunity: handleTopbarOpenCommunity,
        }}
      />
      {appToast && (
        <div className="app-toast" role="status" aria-live="polite">
          <div className="app-toast-inner">{appToast}</div>
        </div>
      )}
      <div
        className={`app-shell${activePage === "workspace" ? " desktop-sessions-layout" : ""}${showCommunityRail ? " with-community-rail" : ""}${((activePage === "workspace" && !showSidePanel) || activePage === "discover") ? " no-left" : ""}${(activePage === "workspace" || !showCommunityPanel) ? " no-right" : ""}${sessionsCompact ? " sessions-compact" : ""}`}
      >
      {showCommunityRail && (
        <DesktopCommunityRail
          state={{
            activePage,
            activeView,
            communities: railCommunities,
            activeCommunityId,
            emptyMessage: communityRailEmptyMessage,
          }}
          actions={{
            getCommunityInitials: communityInitials,
            onOpenDiscover: handleRailOpenDiscover,
            onSelectCommunity: handleSelectActiveCommunity,
            onMoveCommunityToIndex: handleReorderCommunityRail,
            onOpenCreateCommunity: openCreateCommunityModal,
            onToggleSettings: handleRailToggleSettings,
          }}
        />
      )}
      {activePage === "workspace" && (
        <aside className={`sessions${showSidePanel ? "" : " is-collapsed"}`} aria-hidden={!showSidePanel}>
          {activeView === "settings" ? (
            <>
              <div className="panel-title">Settings</div>
              <div className="session-list">
                <SettingsNavList settingsGroup={settingsGroup} onSelectPage={setSettingsPage} />
              </div>
            </>
	          ) : (
	            <>
			              <ThreadSidebarPanel<ThreadRecord, ProjectRecord | CloudProjectRecord>
			                state={{
			                  threadLaneFilter,
			                  threadSearchQuery,
			                  normalizedThreadSearch,
			                  threadSearchResults: laneFilteredThreadSearchResults,
			                  projectThreadGroups: laneProjectThreadGroups,
			                  projectExpandedById,
			                  projectMenuProjectId,
		                  generalThreads: laneGeneralThreads,
					                  agentThreadsCount: agentThreads.length,
					                  chatThreadsCount: chatThreads.length,
					                  chatThreadGroups,
			                      showChatSignInPrompt: !supabaseSession,
					                }}
						                actions={{
			                  onThreadLaneFilterChange: setThreadLaneFilter,
			                  onThreadSearchQueryChange: setThreadSearchQuery,
			                  onAddProject: () =>
			                    threadLaneFilter === "agent"
			                      ? handleAddProjectFromFolderPicker()
			                      : handleAddCloudProject(),
			                  onToggleProjectExpanded: threadPanelController.toggleProjectExpanded,
		                  onStartDraftInProject: (project) =>
		                    threadLaneFilter === "agent"
		                      ? threadPanelController.startDraftInProject(project as ProjectRecord)
		                      : handleStartDraftInCloudProject(project as CloudProjectRecord),
		                  onToggleProjectMenu: threadPanelController.toggleProjectMenu,
		                  projectMenuRef,
		                  onRenameProject: (project) =>
		                    threadLaneFilter === "agent"
		                      ? handleRenameProject(project as ProjectRecord)
		                      : handleRenameCloudProject(project as CloudProjectRecord),
		                  onRemoveProject: (project) =>
		                    threadLaneFilter === "agent"
		                      ? handleRemoveProject(project as ProjectRecord)
		                      : handleRemoveCloudProject(project as CloudProjectRecord),
			                  renderSessionItem,
			                      onSignInForChat: handleSignIn,
					                }}
					              />
            </>
          )}
        </aside>
      )}
      {activePage === "community" && (
        <CommunityNav
          activeCommunity={activeCommunity}
          communityTab={communityTab}
          canViewActiveCommunitySettings={canViewActiveCommunitySettings}
          canManageMembersActiveCommunity={canManageMembersActiveCommunity}
          canViewActiveCommunityAnalytics={canViewActiveCommunityAnalytics}
          activeCommunityOwnerIsPro={activeCommunityOwnerIsPro}
          onSelectTab={(tab) => {
            if (isCommunityRouteManagedTab(tab)) {
              const nextCommunityId = activeCommunityId ?? activeCommunity?.id ?? null;
              if (nextCommunityId) {
                openCommunityTab(nextCommunityId, tab);
                return;
              }
            }
            setCommunityTab(tab);
          }}
        />
      )}
      <main className={`workspace${activePage !== "workspace" ? " community-mode" : ""}`}>
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
                        onClick={() =>
                          setCommunityChatLightboxIndex((prev) => (prev - 1 + total) % total)
                        }
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
	        {showCreateCommunityModal && (
	          <div className="modal-overlay" onClick={closeCreateCommunityModal}>
	            <div className="modal create-community-modal" onClick={(event) => event.stopPropagation()}>
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
                          onChange={(event) =>
                            void handleCreateCommunityAvatarUpload(event.target.files?.[0] ?? null)
                          }
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
                {(() => {
			                  const tier = builderBillingStatus?.builder_tier ?? "unknown";
			                  const max = builderBillingStatus?.max_communities ?? 0;
			                  const ownedCount = Object.values(communityRoleById).filter((role) => role === "owner").length;
			                  const needsPlan = Boolean(supabaseSession && isBuilderTierFree(tier));
			                  const limitReached = Boolean(supabaseSession && !isBuilderTierFree(tier) && max > 0 && ownedCount >= max);
	                  if (!supabaseSession) {
	                    return (
	                      <button className="create-community-primary" onClick={() => void handleSignIn()}>
	                        Sign in to create
	                      </button>
	                    );
	                  }
	                  return (
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
	                  );
	                })()}
                <button className="create-community-secondary" onClick={closeCreateCommunityModal}>
                  Cancel
                </button>
              </div>
            </div>
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
        {showResourceModal && (
          <div className="modal-overlay" onClick={closeResourceModal}>
            <div className="modal resource-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">
                  {editingResourceId ? "Edit resource" : "Add resource"}
                </div>
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
                    {isSavingResource
                      ? "Saving..."
                      : editingResourceId
                        ? "Save changes"
                        : "Save resource"}
                  </button>
                  <button className="secondary" onClick={() => { resetResourceForm(); closeResourceModal(); }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
	        {activeInviteGateKey && inviteGateRecord && inviteGateRecord.status === "pending" && (
	          <div className="modal-overlay" onClick={() => void handleInviteGateDismiss()}>
	            <div className="modal invite-gate-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">Community invite</div>
                <button
                  className="modal-close"
                  onClick={() => void handleInviteGateDismiss()}
                  title="Not now"
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                <div className="invite-gate-body">
                  <div className="invite-gate-name">
                    {(inviteGateRecord.community_name ?? "").trim() || "You have an invite"}
                  </div>
                  <div className="invite-gate-code">{inviteGateRecord.invite_key}</div>
                  <div className="invite-gate-desc">
                    {supabaseSession
                      ? "Join this community now."
                      : "Sign in to join this community."}
                  </div>
                  {inviteJoinError && <div className="auth-error">{inviteJoinError}</div>}
                </div>
              </div>
              <div className="modal-footer">
                <div className="invite-gate-actions">
                  <button onClick={() => void handleInviteGateJoin()} disabled={isJoiningInvite}>
                    {isJoiningInvite ? "Joining…" : "Join"}
                  </button>
                  <button className="secondary" onClick={() => void handleInviteGateDismiss()}>
                    Not now
                  </button>
                </div>
              </div>
	            </div>
	          </div>
	        )}
        <DesktopTeachCandidateModal
          draft={teachCandidateDraft}
          titleInput={teachCandidateTitleInput}
          memoryInput={teachCandidateMemoryInput}
          submitError={teachCandidateSubmitError}
          isSubmitting={isSubmittingTeachCandidate}
          onClose={closeTeachCandidateModal}
          onSubmit={handleSubmitTeachCommunityCandidate}
          onChangeTitle={setTeachCandidateTitleInput}
          onChangeMemory={setTeachCandidateMemoryInput}
        />
        <DesktopSourcesUsedModal
          sourcesUsed={sourcesUsed}
          onClose={() => setSourcesUsed({ open: false })}
        />
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
                      : "Sign in to set your profile details."}
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
                        <span className="profile-avatar-placeholder" aria-hidden="true">
                          <svg viewBox="0 0 24 24">
                            <circle cx="12" cy="8" r="4.2" />
                            <path d="M4.5 20c1.8-4 5-6 7.5-6s5.7 2 7.5 6" />
                          </svg>
                        </span>
                      )}
                    </div>
                    <div className="profile-avatar-actions">
                      {supabaseSession ? (
                        <label className="create-avatar-btn">
                          Upload photo
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) =>
                              void handleProfileAvatarUpload(event.target.files?.[0] ?? null)
                            }
                          />
                        </label>
                      ) : (
                        <button className="create-avatar-btn" type="button" disabled>
                          Sign in to upload
                        </button>
                      )}
                      {supabaseSession && profileAvatarUrl && (
                        <button
                          className="create-avatar-remove"
                          type="button"
                          onClick={() => setProfileAvatarUrl(null)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="profile-row">
                    <input
                      type="text"
                      placeholder="Name"
                      value={supabaseSession ? profileName : ""}
                      disabled={!supabaseSession}
                      onChange={(event) => setProfileName(event.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Username"
                      value={supabaseSession ? profileUsername : ""}
                      disabled={!supabaseSession}
                      onChange={(event) => setProfileUsername(event.target.value)}
                    />
                  </div>
                  <textarea
                    className="profile-bio"
                    placeholder="Bio"
                    value={supabaseSession ? profileBio : ""}
                    disabled={!supabaseSession}
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
                        <strong>
                          {supabaseSession.user.email ?? supabaseSession.user.id}
                        </strong>
                      </div>
                      <button className="secondary" onClick={() => void handleSignOut()}>
                        Sign out
                      </button>
                    </div>
                  ) : (
                    <div className="account-row">
                      <button className="google-sign-in" onClick={() => void handleSignIn()}>
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
                      const ownedCount = Object.values(communityRoleById).filter((role) => role === "owner").length;
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
                    <div className="settings-section-desc">
                      Open a community to manage pricing and payouts.
                    </div>
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
                                      !confirmDiscardUnsavedCommunitySettingsDesktop({
                                        isCommunitySettingsDirty: communitySettingsDirtyRef.current,
                                        activeCommunityId,
                                        nextCommunityId: community.id,
                                        confirmDiscard: (message) => window.confirm(message),
                                      })
                                    ) {
                                      return;
                                    }
                                    openCommunityTab(community.id, "settings");
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
                        Recover access if you paid but didn't finish the join flow.
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
                      {!isLoadingPendingPurchases &&
                        pendingPurchaseClaims.length === 0 &&
                        pendingPurchasesSuccess && <div className="auth-status">{pendingPurchasesSuccess}</div>}
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
	                    <svg className="section-icon-logo" viewBox="0 0 24 24"><path d="M22.28 9.37a5.93 5.93 0 0 0-.51-4.89 6.01 6.01 0 0 0-6.47-2.87A5.93 5.93 0 0 0 10.82.13a6.01 6.01 0 0 0-5.73 3.93A5.93 5.93 0 0 0 1.13 8a6.01 6.01 0 0 0 .74 7.07 5.93 5.93 0 0 0 .51 4.89 6.01 6.01 0 0 0 6.47 2.87A5.93 5.93 0 0 0 13.33 24a6.01 6.01 0 0 0 5.73-3.93A5.93 5.93 0 0 0 23.02 16a6.01 6.01 0 0 0-.74-6.63zM13.33 22.5a4.47 4.47 0 0 1-2.88-1.05l.14-.08 4.79-2.77a.78.78 0 0 0 .39-.67v-6.77l2.02 1.17a.07.07 0 0 1 .04.06v5.6a4.5 4.5 0 0 1-4.5 4.5zM3.6 18.37a4.47 4.47 0 0 1-.54-3.02l.14.09 4.79 2.77a.78.78 0 0 0 .78 0l5.85-3.38v2.33a.07.07 0 0 1-.03.06l-4.84 2.8a4.5 4.5 0 0 1-6.15-1.65zM2.34 7.89A4.47 4.47 0 0 1 4.7 5.91v5.71a.78.78 0 0 0 .39.67l5.85 3.38-2.02 1.17a.07.07 0 0 1-.07 0l-4.84-2.8A4.5 4.5 0 0 1 2.34 7.9zm17.32 4.03l-5.85-3.38 2.02-1.17a.07.07 0 0 1 .07 0l4.84 2.8a4.5 4.5 0 0 1-.7 8.11v-5.7a.78.78 0 0 0-.38-.66zm2.01-3.03l-.14-.09-4.79-2.77a.78.78 0 0 0-.78 0l-5.85 3.38V7.08a.07.07 0 0 1 .03-.06l4.84-2.8a4.5 4.5 0 0 1 6.69 4.67zM8.56 13.39l-2.02-1.17a.07.07 0 0 1-.04-.06v-5.6a4.5 4.5 0 0 1 7.38-3.45l-.14.08-4.79 2.77a.78.78 0 0 0-.39.67v6.76zm1.1-2.37l2.6-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5v-3z" fill="currentColor" /></svg>
	                    ChatGPT
	                  </div>
	                  <div className="settings-section-desc">
	                    Sign in to use your ChatGPT account for OpenAI models. This does not consume your Arx quota.
	                  </div>
	                  {chatgptAuthSummary && (
	                    <div className="auth-status">
	                      Connected{chatgptAuthSummary.email ? ` as ${chatgptAuthSummary.email}` : ""}
	                    </div>
	                  )}
		                  <div className="auth-actions">
		                    {!chatgptAuthSummary ? (
		                      <button type="button" onClick={() => void handleChatgptLogin()} disabled={isChatgptLoggingIn}>
		                        {isChatgptLoggingIn ? "Signing in..." : "Sign in with ChatGPT"}
		                      </button>
		                    ) : (
		                      <button type="button" className="secondary" onClick={() => void handleChatgptLogout()}>
		                        Sign out
		                      </button>
		                    )}
		                  </div>
		                  {chatgptAuthError && <div className="auth-error">{chatgptAuthError}</div>}
		                </div>

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
	                    disabled={isLoadingSystemPrompt || isSavingSystemPrompt}
	                  />
	                  <div className="exec-policy-actions">
	                    <button
	                      type="button"
	                      onClick={() => void saveSystemPrompt(systemPromptDraft)}
	                      disabled={isLoadingSystemPrompt || isSavingSystemPrompt}
	                    >
	                      {isSavingSystemPrompt ? "Saving..." : "Save"}
	                    </button>
	                    <button
	                      type="button"
	                      className="secondary"
	                      onClick={() => {
	                        setSystemPromptDraft("");
	                        void saveSystemPrompt("");
	                      }}
	                      disabled={isLoadingSystemPrompt || isSavingSystemPrompt}
	                    >
	                      Clear
	                    </button>
	                    {systemPromptError && <div className="exec-policy-error">{systemPromptError}</div>}
	                  </div>
	                </div>

              </>
            )}
	            {settingsGroup === "agent" && (
	              <>
	                <div className="settings-section">
	                  <div className="settings-section-title">
	                    <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
	                    Approval Mode
	                  </div>
	                  <div className="settings-section-desc">Control how tool executions are approved</div>
	                  <div className="approval-selector">
	                    {(["read-only", "agent", "agent-full"] as const).map((mode) => {
	                      const preset = APPROVAL_PRESETS[mode];
	                      const isActive = approvalMode === mode;
	                      return (
	                        <button
	                          key={mode}
	                          className={`approval-option${isActive ? " active" : ""}`}
	                          onClick={() => void applyApprovalMode(mode)}
	                        >
	                          <div className="approval-option-title">{preset.label}</div>
	                          <div className="approval-option-desc">{preset.description}</div>
	                        </button>
	                      );
	                    })}
	                  </div>
	                </div>

	                <div className="settings-section">
	                  <div className="settings-section-title">
	                    <svg viewBox="0 0 24 24"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>
	                    Global Policy Rules
	                  </div>
	                  <div className="settings-section-desc">Default rules applied to all threads</div>
	                  <div className="exec-policy">
                    <textarea
                      className="exec-policy-input"
                      value={execPolicyRules}
                      onChange={(event) => setExecPolicyRules(event.target.value)}
                      placeholder="prompt\ndefault\nallow git status\nforbid rm -rf /"
                    />
                    <div className="exec-policy-actions">
                      <button onClick={() => void handleSaveExecPolicyRules()} disabled={isSavingExecPolicy}>
                        {isSavingExecPolicy ? "Saving..." : "Save rules"}
                      </button>
                      {execPolicyError && <div className="exec-policy-error">{execPolicyError}</div>}
                    </div>
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

		                  <div className="settings-section">
			                    <div className="settings-section-title">
		                      <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
		                      Export
		                    </div>
			                    <div className="settings-section-desc">
			                      Download your threads, messages, and personal memory as CSV.
			                    </div>
			                    <div className="export-actions">
			                      <button className="secondary" onClick={() => void exportThreadsCsv()}>
			                        Threads CSV
			                      </button>
			                      <button className="secondary" onClick={() => void exportMessagesCsv()}>
			                        Messages CSV
			                      </button>
			                      <button className="secondary" onClick={() => void exportPersonalMemoryCsv()}>
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
                      <button className="secondary" onClick={() => void resetLocalCache()} disabled={isSending || isResettingLocalCache}>
                        {isResettingLocalCache ? "Resetting..." : "Reset local cache"}
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
                          <div className="memory-block-meta">
                            Workspace scope uses: {getEffectiveWorkspacePath()}
                          </div>
                          <div className="memory-editor-actions">
                            <button
                              className="secondary"
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
                                      onClick={() => void handleTogglePersonalMemoryPinned(item)}
                                    >
                                      {item.pinned ? "Unpin" : "Pin"}
                                    </button>
                                    <button
                                      className="secondary"
                                      onClick={() => void handleDeletePersonalMemoryItem(item.id)}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                                <div className="memory-block-meta">
                                  {item.scope}
                                  {item.scope === "workspace" && item.scope_id
                                    ? ` · ${item.scope_id}`
                                    : ""}
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
                              onClick={() => void handleCreatePersonalMemoryItem()}
                              disabled={!newPersonalMemoryContent.trim()}
                            >
                              Save memory
                            </button>
                            <button
                              className="secondary"
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
	        <div className="workspace-body desktop-ai-workspace-body">
	          {memoryToast && (
	            <div className="memory-toast success-toast">{memoryToast}</div>
	          )}
	          <div
            className="message-list"
            ref={workspaceMessageListRef}
            onScroll={handleWorkspaceScroll}
          >
            {toolDebug && (
              <div className="message-item debug">
                <div className="message-text">{toolDebug.text}</div>
              </div>
            )}
            {activeThreadId && hasOlderMessagesForActiveThread && (
              <div className="message-item system">
                <div className="message-text">
                  <button
                    type="button"
                    className="message-copy-btn"
                    disabled={isLoadingOlderMessages || isSending}
                    onClick={() => {
                      void handleLoadOlderMessages();
                    }}
                  >
                    {isLoadingOlderMessages ? "Loading older messages..." : "Load older messages"}
                  </button>
                </div>
              </div>
            )}
            {!activeThreadId && (
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
                                disabled={isSending}
                                onClick={() => {
                                  void handleSendMessage({ text: prompt });
                                  askInputRef.current?.focus();
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
                          {showDesktopChatgptRateLimitCard && (
                            <div className="desktop-chatgpt-rate-card" role="note" aria-label="ChatGPT rate limits">
                              <div className="desktop-chatgpt-rate-body">
                                <div className="desktop-chatgpt-rate-icon" aria-hidden="true">
                                  <img className="desktop-chatgpt-rate-logo monochrome" src={openAiLogo} alt="" />
                                </div>
                                <div className="desktop-chatgpt-rate-copy">
                                  <div className="desktop-chatgpt-rate-title">Use ChatGPT rate limits</div>
                                  <div className="desktop-chatgpt-rate-subtitle">
                                    Log in with ChatGPT to use your ChatGPT plan limits on desktop.
                                  </div>
                                </div>
                              </div>
                              <div className="desktop-chatgpt-rate-actions">
                                <button
                                  className="desktop-chatgpt-rate-button"
                                  type="button"
                                  onClick={() => void handleChatgptLogin()}
                                  disabled={isChatgptLoggingIn}
                                >
                                  <img className="desktop-chatgpt-rate-button-logo" src={openAiLogo} alt="" aria-hidden="true" />
                                  {isChatgptLoggingIn ? "Connecting..." : "Log in with ChatGPT"}
                                </button>
                              </div>
                            </div>
                          )}
	                        </>
	                      );
	                    })()}
	                  </div>
                )}
              </>
            )}
            {activeThreadId &&
              combinedFeed.length === 0 &&
              !isSending &&
              (Boolean(messageLoadErrorForActiveThread) ||
                (activeThread?.storage_mode === "cloud" && !supabaseSession)) && (
              <div className="message-item system">
                <div className="message-text">
                  {messageLoadErrorForActiveThread
                    ? `Couldn't load thread messages: ${messageLoadErrorForActiveThread}`
                    : activeThread?.storage_mode === "cloud" && !supabaseSession
                      ? "This is a cloud chat thread. Sign in to load messages, or switch to a local agent thread."
                      : null}
                </div>
              </div>
            )}
            {combinedFeed.map((item) => {
              if (item.type === "message") {
                const message = item.data;
                const isUser = message.role === "user";
                const parsedContent = parseMessageContent(message.content_json);
                const textContent = parsedContent.text;
                const isTerminal = parsedContent.format === "terminal";
	                const turnForMessage = !isUser ? (turnsByAssistantEventId[message.id] ?? null) : null;
	                  const messageInferenceSource = !isUser
	                    ? extractInferenceSourceFromMessageContent(message.content_json)
	                    : null;
	                  const messageModelId = !isUser
	                  ? (message.model_id || extractModelIdFromMessageContent(message.content_json))
	                  : null;
	                const messageInferenceLaneFallbacks = !isUser
	                  ? extractInferenceLaneFallbacksFromMessageContent(message.content_json)
	                  : [];
	                const messageSignature = !isUser
		                  ? formatExecutionLabel(
                                  message.engine_id,
                                  messageModelId,
                                  modelToggles,
                                  messageInferenceSource,
                                  messageInferenceLaneFallbacks,
                                )
		                  : null;
	                const turnMeta = !isUser ? (turnMetaByMessageId.get(message.id) ?? null) : null;
	                const isEndOfTurn = Boolean(turnMeta?.isEndOfTurn);
	                const turnContent = turnMeta?.turnContent ?? "";

                return (
                  <div
                    key={message.id}
                    className={
                      isUser ? "message-item user" : "message-item assistant"
                    }
                  >
                    <div className="message-text">
                      {isUser
                        ? textContent
                        : isTerminal
                          ? <pre className="terminal-message">{textContent}</pre>
                          : renderMarkdown(textContent, { onCopyCode: copyTextToClipboard })}
                    </div>
                    {!isUser && (
                      <MessageFooter metaLabel={messageSignature}>
	                        {isEndOfTurn && (
	                          <MessageCopyAction
	                            copied={copiedMessageId === message.id}
	                            onClick={() => handleCopyMessage(message.id, turnContent)}
	                            title="Copy"
	                            ariaLabel="Copy"
	                          />
	                        )}
		                        {isEndOfTurn && turnForMessage && (
		                          <MessageSourcesAction
		                            onClick={() => {
		                              void handleOpenSourcesUsed(turnForMessage);
		                            }}
		                            title="Sources used"
		                            ariaLabel="Sources used"
		                          />
		                        )}
		                      </MessageFooter>
		                    )}
	                  </div>
	                );
              } else if (item.type === "tool_group") {
                const group = item.data;
                const calls = group.tool_calls;

                const counts = (() => {
                  let ok = 0;
                  let error = 0;
                  let denied = 0;
                  for (const call of calls) {
                    if (call.status === "denied") denied += 1;
                    if (call.status === "finished") {
                      if (typeof call.exit_code === "number") {
                        if (call.exit_code === 0) ok += 1;
                        else error += 1;
                        continue;
                      }
                      try {
                        const summary = call.output_summary_json ? JSON.parse(call.output_summary_json) : null;
                        const execStatus = typeof summary?.exec_status === "string" ? summary.exec_status : null;
                        if (execStatus === "ok") ok += 1;
                        else if (execStatus) error += 1;
                      } catch {
                        // ignore
                      }
                    }
                  }
                  return { ok, error, denied };
                })();

                const isGroupExpanded = expandedToolGroupIds.has(group.id);

                const hasErrors = counts.error > 0 || counts.denied > 0;

                return (
                  <div className={`tool-group-inline${isGroupExpanded ? " expanded" : ""}`} key={group.id}>
                    <button
                      type="button"
                      className="tool-group-inline-summary"
                      onClick={() => toggleToolGroupExpanded(group.id)}
                      aria-expanded={isGroupExpanded}
                    >
                      <span className="tool-group-inline-label">
                        {calls.length} tool{calls.length !== 1 ? "s" : ""} ran
                        {hasErrors && (
                          <span className="tool-group-inline-errors">
                            {counts.error > 0 && ` · ${counts.error} error${counts.error !== 1 ? "s" : ""}`}
                            {counts.denied > 0 && ` · ${counts.denied} denied`}
                          </span>
                        )}
                      </span>
                      <span className="tool-group-inline-toggle">{isGroupExpanded ? "▾" : "▸"}</span>
                    </button>
                    {isGroupExpanded && (
                      <div className="tool-group-inline-items">
                        {calls.map((toolCall) => {
                        let args: any = {};
                        try {
                          args = JSON.parse(toolCall.args_json) as any;
                        } catch {
                          args = {};
                        }
                        let summary: any = null;
                        try {
                          summary = toolCall.output_summary_json ? JSON.parse(toolCall.output_summary_json) : null;
                        } catch {
                          summary = null;
                        }

                        const wp = activeThread?.workspace_path ?? null;
                        const rawPath = typeof args.path === "string" ? args.path : null;
                        const p = rawPath ? trimWorkspacePath(rawPath, wp) : null;
                        const cmd = typeof args.cmd === "string" ? args.cmd : null;
                        const pat = typeof args.pat === "string" ? args.pat : null;

                        const label = (() => {
                          if (toolCall.tool_name === "bash") return cmd ? `bash ${cmd}` : "bash";
                          if (toolCall.tool_name === "grep") {
                            const base = rawPath ? trimWorkspacePath(rawPath, wp) : ".";
                            return pat ? `grep ${pat} in ${base}` : `grep in ${base}`;
                          }
                          if (toolCall.tool_name === "glob") {
                            const base = rawPath ? trimWorkspacePath(rawPath, wp) : ".";
                            return pat ? `glob ${pat} in ${base}` : `glob in ${base}`;
                          }
                          if (toolCall.tool_name === "list_dir") return p ? `ls ${p}` : "ls";
                          if (toolCall.tool_name === "sha256") return p ? `sha256 ${p}` : "sha256";
                          if (toolCall.tool_name === "read") return p ? `read ${p}` : "read";
                          if (toolCall.tool_name === "write") return p ? `write ${p}` : "write";
                          if (toolCall.tool_name === "edit") return p ? `edit ${p}` : "edit";
                          return toolCall.tool_name;
                        })();

                        const execStatus = typeof summary?.exec_status === "string" ? summary.exec_status : null;
                        const note = typeof summary?.note === "string" ? summary.note : null;
                        const isOk = toolCall.status === "finished" && execStatus === "ok";
                        const statusText = (() => {
                          if (isOk) return "";
                          if (toolCall.status === "requested") return "requested";
                          if (toolCall.status === "approved") return "approved";
                          if (toolCall.status === "denied") return "denied";
                          if (toolCall.status === "started") return "running";
                          if (toolCall.status === "finished") return "error";
                          return toolCall.status;
                        })();
                        const statusIcon = (() => {
                          if (toolCall.status === "denied") return "✗";
                          if (toolCall.status === "finished") return execStatus === "ok" ? "✓" : "✗";
                          if (toolCall.status === "approved") return "✓";
                          if (toolCall.status === "started" || toolCall.status === "requested") return "⏳";
                          return "•";
                        })();
                        const artifactLines = formatToolArtifactLines(summary, { includeFilePatchHashes: true });

                        const output = [toolCall.stdout_excerpt, toolCall.stderr_excerpt].filter(Boolean).join("\n");
                        const isExpanded = expandedOutputIds.has(toolCall.id);

                          return (
                            <div key={toolCall.id} className="tool-inline">
                              <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
                                <div className="tool-command">
                                  <span className="tool-prompt">›</span>
                                  <code>{label}</code>
                                </div>
                                <div className="tool-status-row">
                                  <span className={`tool-status ${statusText}`}>
                                    {statusIcon} {statusText}
                                  </span>
                                  {(output || artifactLines.length > 0 || note) && (
                                    <button className="tool-toggle" onClick={() => toggleOutputExpanded(toolCall.id)}>
                                      {isExpanded ? "▼" : "▶"}
                                    </button>
                                  )}
                                </div>
                              </div>
                              {isExpanded && (
                                <>
                                  {note && <div className="tool-output-meta">note: {note}</div>}
                                  {artifactLines.length > 0 && (
                                    <pre className="tool-output">{artifactLines.join("\n\n")}</pre>
                                  )}
                                  {output && <ToolOutputBlock content={output} />}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              } else {
                const toolCall = item.data;
	                const isAgentToolCall =
	                  ([
	                    "read",
	                    "list_dir",
	                    "sha256",
	                    "write",
	                    "edit",
	                    "glob",
	                    "grep",
	                    "bash"
	                  ] as const).includes(toolCall.tool_name as any) &&
	                  (["requested", "approved", "denied", "started", "finished"] as const).includes(
	                    toolCall.status as any
	                  );

                if (isAgentToolCall) {
                  let args: any = {};
                  try {
                    args = JSON.parse(toolCall.args_json) as any;
                  } catch {
                    args = {};
                  }
                  let summary: any = null;
                  try {
                    summary = toolCall.output_summary_json ? JSON.parse(toolCall.output_summary_json) : null;
                  } catch {
                    summary = null;
                  }

                  const wp = activeThread?.workspace_path ?? null;
                  const rawPath = typeof args.path === "string" ? args.path : null;
                  const p = rawPath ? trimWorkspacePath(rawPath, wp) : null;
                  const cmd = typeof args.cmd === "string" ? args.cmd : null;
                  const pat = typeof args.pat === "string" ? args.pat : null;

                  const label = (() => {
                    if (toolCall.tool_name === "bash") return cmd ? `bash ${cmd}` : "bash";
                    if (toolCall.tool_name === "grep") {
                      const base = rawPath ? trimWorkspacePath(rawPath, wp) : ".";
                      return pat ? `grep ${pat} in ${base}` : `grep in ${base}`;
                    }
                    if (toolCall.tool_name === "glob") {
                      const base = rawPath ? trimWorkspacePath(rawPath, wp) : ".";
                      return pat ? `glob ${pat} in ${base}` : `glob in ${base}`;
                    }
                    if (toolCall.tool_name === "sha256") return p ? `sha256 ${p}` : "sha256";
                    if (toolCall.tool_name === "read") return p ? `read ${p}` : "read";
                    if (toolCall.tool_name === "write") return p ? `write ${p}` : "write";
                    if (toolCall.tool_name === "edit") return p ? `edit ${p}` : "edit";
                    return toolCall.tool_name;
                  })();

                  const execStatus = typeof summary?.exec_status === "string" ? summary.exec_status : null;
                  const note = typeof summary?.note === "string" ? summary.note : null;
                  const isOk = toolCall.status === "finished" && execStatus === "ok";
                  const statusText = (() => {
                    if (isOk) return "";
                    if (toolCall.status === "requested") return "requested";
                    if (toolCall.status === "approved") return "approved";
                    if (toolCall.status === "denied") return "denied";
                    if (toolCall.status === "started") return "running";
                    if (toolCall.status === "finished") return "error";
                    return toolCall.status;
                  })();
                  const statusIcon = (() => {
                    if (toolCall.status === "denied") return "✗";
                    if (toolCall.status === "finished") return execStatus === "ok" ? "✓" : "✗";
                    if (toolCall.status === "approved") return "✓";
                    if (toolCall.status === "started" || toolCall.status === "requested") return "⏳";
                    return "•";
                  })();

                  const artifactLines = formatToolArtifactLines(summary);

                  const output = [toolCall.stdout_excerpt, toolCall.stderr_excerpt].filter(Boolean).join("\n");
                  const isExpanded = expandedOutputIds.has(toolCall.id);

                  return (
                    <div key={toolCall.id} className="tool-inline">
                      <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
                        <div className="tool-command">
                          <span className="tool-prompt">›</span>
                          <code>{label}</code>
                        </div>
                        <div className="tool-status-row">
                          <span className={`tool-status ${statusText}`}>
                            {statusIcon} {statusText}
                          </span>
                          {(output || artifactLines.length > 0 || note) && (
                            <button className="tool-toggle" onClick={() => toggleOutputExpanded(toolCall.id)}>
                              {isExpanded ? "▼" : "▶"}
                            </button>
                          )}
                        </div>
                      </div>
                      {isExpanded && (
                        <>
                          {note && <div className="tool-output-meta">note: {note}</div>}
                          {artifactLines.length > 0 && (
                            <pre className="tool-output">{artifactLines.join("\n\n")}</pre>
                          )}
                          {output && <ToolOutputBlock content={output} />}
                        </>
                      )}
                    </div>
                  );
                }

                const details = parseToolCall(toolCall);
                const actionError = actionErrors[toolCall.id];
                const fallbackOutput = [toolCall.stdout_excerpt, toolCall.stderr_excerpt]
                  .filter(Boolean)
                  .join("\n\n");
                const output = fallbackOutput;
                const isOutputExpanded = expandedOutputIds.has(toolCall.id);
                const isRunning = runningToolCallId === toolCall.id;

                const cmdPreview = formatCommandPreview(details.command);
                const isCommandExpanded = expandedCommandIds.has(toolCall.id);
                const toolLabel = formatToolLabel(details, cmdPreview);

                return (
                  <div key={toolCall.id} className="tool-inline">
                    <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
                      <div className="tool-command">
                        <span className="tool-prompt">›</span>
                        <code>{toolLabel}</code>
                        {cmdPreview?.truncated && cmdPreview.cmdCount > 1 && (
                          <span className="tool-cmd-count">[+{cmdPreview.cmdCount - 1} cmds]</span>
                        )}
                      </div>
                      <div className="tool-status-row">
                        <span className={`tool-status ${toolCall.exit_code === 0 ? "executed" : toolCall.status}`}>
                        {toolCall.status === "proposed" && "⏳"}
                        {toolCall.status === "approved" && "✓"}
                        {(toolCall.status === "executed" || toolCall.exit_code === 0) && "✓"}
                        {toolCall.status === "failed" && toolCall.exit_code !== 0 && "✗"}
                        {toolCall.status === "canceled" && "○"}
                        {" "}{toolCall.exit_code === 0 ? "executed" : toolCall.status}
                      </span>
                      {output && (
                        <button
                          className="tool-toggle"
                          onClick={() => toggleOutputExpanded(toolCall.id)}
                        >
                          {isOutputExpanded ? "▼" : "▶"}
                        </button>
                      )}
                      {cmdPreview?.truncated && (
                        <button
                          className="tool-toggle"
                          onClick={() => {
                            setExpandedCommandIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(toolCall.id)) {
                                next.delete(toolCall.id);
                              } else {
                                next.add(toolCall.id);
                              }
                              return next;
                            });
                          }}
                        >
                          {isCommandExpanded ? "▼ full command" : "▶ full command"}
                        </button>
                      )}
                      {isRunning && (
                        <button
                          className="tool-action danger"
                          onClick={async () => {
                            setRunningToolCallId(null);
                            setToolCalls((prev) =>
                              prev.map((item) =>
                                item.id === toolCall.id ? { ...item, status: "canceled" } : item
                              )
                            );
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                    </div>
                    {isCommandExpanded && cmdPreview?.truncated && (
                      <pre className="tool-command-full">{formatCommandForDisplay(details.command)}</pre>
                    )}
                    {isOutputExpanded && output && (
                      <pre className="tool-output">{output}</pre>
                    )}
                    {actionError && (
                      <div className="tool-error">Error: {actionError}</div>
                    )}
                  </div>
                );
              }
            })}
		            {streamingContent && !hasPersistedAssistantForStreamingRun && (() => {
		              const { cleaned } = cleanStreamingContent(streamingContent);
                  const rendered = streamingRenderedContent ?? cleaned;
                  const usePlainTextFallback = rendered.length > 24000;
		              const streamingSignature = formatExecutionLabel(
		                streamingMeta?.engine_id,
		                streamingMeta?.model_id,
		                modelToggles,
                    streamingMeta?.inference_source
		              );
	              return (
	                <div className="message-item streaming">
	                  <div className="message-text">
                    {streamingTokens && (
                      <div className="streaming-meta">
                        {typeof streamingTokens.prompt_tokens === "number" && (
                          <span>in: {streamingTokens.prompt_tokens}</span>
                        )}
                        {typeof streamingTokens.completion_tokens === "number" && (
                          <span>out: {streamingTokens.completion_tokens}</span>
                        )}
                      </div>
		                    )}
                      {rendered &&
                        (usePlainTextFallback ? (
                          <pre className="streaming-plain-text">{rendered}</pre>
                        ) : (
                          renderMarkdown(rendered, { onCopyCode: copyTextToClipboard })
                        ))}
	                  </div>
	                  {streamingSignature && (
	                    <div className="message-meta block">{streamingSignature}</div>
	                  )}
                </div>
              );
	            })()}
            {/* Run activity indicator (works for streaming + non-streaming) */}
            {isSending && !pendingToolApproval && (() => {
              const hasStreamingStarted = Boolean((streamingContent ?? "").trim());

              // Hide the indicator once token streaming begins.
              if (hasStreamingStarted) {
                return null;
              }

              // Derive activity verb from live running tools
              const liveRunning = runningTools.filter((t) => t.status === "running");
              const activityVerb = (() => {
                if (runPhase === "preparing") return "preparing";
                if (runPhase === "cancelling") return "cancelling";
                if (runPhase === "awaiting_approval") return "awaiting approval";
                if (liveRunning.length > 0) {
                  return toolActivityVerb(liveRunning[liveRunning.length - 1].name);
                }
                return "thinking";
              })();

              return (
                <div className="run-activity-container">
                  <ActivityNarrator verb={activityVerb} />
                </div>
              );
            })()}
	            {pendingToolApproval && (() => {
	              const formatted = formatToolApproval(pendingToolApproval.tool_name, pendingToolApproval.args_json);
                const canApproveForSession = canEnableWriteEditSessionApproval(pendingToolApproval.tool_name);
	              return (
	                <div className="tool-approval-card">
                  <div className="tool-approval-header">
                    <span className="tool-approval-badge">{formatted.badge}</span>
                    <div className="tool-approval-title">
                      <span className="tool-approval-kicker">Permission Request</span>
                      <span className="tool-approval-name">{formatted.title}</span>
                      {formatted.subtitle && (
                        <span className="tool-approval-path">{formatted.subtitle}</span>
                      )}
                    </div>
                  </div>
                  {formatted.preview && (
                    <div className={`tool-approval-preview ${formatted.previewType}`}>
                      <pre>{formatted.preview}</pre>
                    </div>
                  )}
	                  <div className="tool-approval-actions">
	                    <button
	                      className="tool-action tool-approval-button tool-approval-button-deny"
	                      onClick={() => void resolvePendingToolApproval(false)}
	                      disabled={isToolApprovalSubmitting}
	                    >
	                      Deny
	                    </button>
	                    <button
	                      className="tool-action tool-approval-button tool-approval-button-once"
	                      onClick={() => void resolvePendingToolApproval(true)}
	                      disabled={isToolApprovalSubmitting}
	                    >
	                      Approve once
	                    </button>
                      {canApproveForSession && (
                        <button
                          className="tool-action tool-approval-button tool-approval-button-session"
                          onClick={() =>
                            void resolvePendingToolApproval(true, {
                              allow_write_edit_for_session: true,
                            })
                          }
                          disabled={isToolApprovalSubmitting}
                        >
                          Approve for session
                        </button>
                      )}
	                  </div>
                    {canApproveForSession && (
                      <div className="tool-approval-note">
                        Session approval keeps future <code>write/edit</code> actions moving without additional prompts.
                      </div>
                    )}
	                </div>
	              );
	            })()}
	          </div>
          {!isWorkspaceAtBottom && (
            <button
              className="scroll-to-bottom workspace"
              onClick={() => {
                autoScrollEnabledRef.current = true;
                setIsWorkspaceAtBottom(true);
                workspaceMessageListRef.current?.scrollTo({
                  top: workspaceMessageListRef.current.scrollHeight,
                  behavior: "smooth"
                });
              }}
            >
              ↓
            </button>
	          )}
	        </div>
	        <div
	          className={`ask-bar${isDraggingOver ? " drag-over" : ""}`}
	          onDrop={handleDrop}
	          onDragOver={handleDragOver}
	        >
	          {isDraggingOver && (
	            <div className="drop-overlay">
	              <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
	              <span>Drop files here</span>
	            </div>
	          )}
	          {slashState.query !== null && (
	            <div className="slash-menu">
	              {slashState.filtered.length === 0 && (
	                <div className="slash-empty">No matching commands.</div>
	              )}
              {slashState.filtered.map((cmd, index) => (
                <button
                  key={cmd.name}
                  className={`slash-item${slashHover === cmd.name || index === slashIndex ? " active" : ""}`}
                  onMouseEnter={() => setSlashHover(cmd.name)}
                  onMouseLeave={() => setSlashHover(null)}
                  onClick={() => void handleSlashSelect(cmd.name)}
                  type="button"
                >
                  <span className="slash-name">{cmd.name}</span>
                  <span className="slash-desc">{cmd.description}</span>
                </button>
              ))}
            </div>
          )}
          {slashPanel && (
            <div className="slash-panel">
              <div className="slash-panel-header">
                <span>{slashPanel.title}</span>
                <button
                  className="slash-panel-close"
                  onClick={() => setSlashPanel(null)}
                  type="button"
                >
                  ✕
                </button>
              </div>
              {slashPanel.body && (
                <pre className="slash-panel-body">{slashPanel.body}</pre>
              )}
              {slashPanel.kind === "approvals" && (
                <div className="slash-panel-actions">
                  <div className="approval-selector compact">
                    {(["read-only", "agent", "agent-full"] as const).map((mode, index) => {
                      const preset = APPROVAL_PRESETS[mode];
                      const isActive = approvalMode === mode;
                      return (
                        <button
                          key={mode}
                          className={`approval-option${isActive ? " active" : ""}`}
                          onClick={() => void applyApprovalMode(mode)}
                        >
                          <div className="approval-option-title">
                            {index + 1}. {preset.label}
                            {isActive ? " (current)" : ""}
                          </div>
                          <div className="approval-option-desc">{preset.description}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          {attachments.length > 0 && (
            <div className="attachments-preview">
              {attachments.map((att) => (
                <div key={att.id} className="attachment-item">
                  {att.type === "image" && att.previewDataUrl ? (
                    <img src={att.previewDataUrl} alt={att.name} className="attachment-thumb" />
                  ) : (
                    <div className="attachment-icon">
                      <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>
                    </div>
                  )}
                  <span className="attachment-name" title={att.path}>{att.name}</span>
                  <button
                    className="attachment-remove"
                    onClick={() => handleRemoveAttachment(att.id)}
                    title="Remove"
                  >
                    <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
	          <input
	            className="ask-input"
	            ref={askInputRef}
	            value={commandInput}
	            onChange={(event) => setCommandInput(event.target.value)}
	            placeholder={attachments.length > 0 ? "Add a message or send files..." : "Ask anything"}
	            onKeyDown={(event) => {
	              if (slashState.query !== null && SLASH_COMMAND_KEYS.has(event.key)) {
	                if (event.key === "ArrowDown") {
	                  event.preventDefault();
	                  if (slashState.filtered.length === 0) return;
                  setSlashIndex((prev) => {
                    const next = Math.min(prev + 1, slashState.filtered.length - 1);
                    setSlashHover(slashState.filtered[next]?.name ?? null);
                    return next;
                  });
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  if (slashState.filtered.length === 0) return;
                  setSlashIndex((prev) => {
                    const next = Math.max(prev - 1, 0);
                    setSlashHover(slashState.filtered[next]?.name ?? null);
                    return next;
                  });
                  return;
                }
                if (event.key === "Enter") {
                  if (slashState.active) {
                    event.preventDefault();
                    void handleSlashSelect(slashState.active.name);
                    return;
                  }
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setCommandInput("");
                  setSlashHover(null);
                  return;
                }
              }
              if (event.key === "Enter") {
                event.preventDefault();
                void handleSendMessage();
              }
            }}
          />
          <div className="ask-toolbar">
            <div className="ask-toolbar-left">
              <button className="toolbar-icon" title="Add files" onClick={handleAddAttachment}>
                <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
              </button>
              <DesktopModelPickerPopover
                modelPickerRef={modelPickerRef}
                modelPickerSearchRef={modelPickerSearchRef}
                isOpen={isModelPickerOpen}
                curatedPickerModels={curatedPickerModels}
                selectedModelLabel={selectedModelLabel}
                modelPickerQuery={modelPickerQuery}
                setModelPickerQuery={setModelPickerQuery}
                modelPickerSection={modelPickerSection}
                setModelPickerSection={setModelPickerSection}
                visiblePickerModels={visiblePickerModels}
                activeModelId={activeModelId}
                canSelectPickerModel={canSelectPickerModel}
                onSelectModel={handleSelectPickerModel}
                modelToggles={modelToggles}
                hasPaidAccess={hasPaidAccess}
                hasChatgptAuth={Boolean(chatgptAuthSummary)}
                providerIdForModelId={providerIdForModelId}
                onOpen={openModelPicker}
                onClose={closeModelPicker}
              />
            </div>
		            <div className="ask-toolbar-right">
			              <VoiceInputButton
			                state={workspaceVoiceUiState}
			                title={workspaceVoiceIntent.title}
			                onClick={() => void handleVoiceInputClick("workspace")}
			              />
              {(() => {
                const isTurnRunning = isSending || Boolean(streamingContent);
                return (
              <button
                className="chat-send ask-send-btn"
                onClick={() => {
		                  if (isTurnRunning) {
		                    cancelActiveRun();
	                    return;
                  }
	                  void handleSendMessage();
	                }}
                disabled={
                  isTurnRunning
                    ? !activeThreadId
                    : isSending || (commandInput.trim().length === 0 && attachments.length === 0)
                }
                title={isTurnRunning ? "Stop" : "Send"}
                aria-label={isTurnRunning ? "Stop" : "Send"}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {isTurnRunning ? (
                    <rect x="7" y="7" width="10" height="10" rx="2" />
                  ) : (
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  )}
                </svg>
              </button>
                );
              })()}
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
	                        <div className="chat-loading">
	                          <div className="loading-spinner" />
	                          <span>Loading communities…</span>
	                        </div>
	                      )}
	                      {!isLoadingDiscover && discoverError && <div className="auth-error">{discoverError}</div>}
	                      {!isLoadingDiscover && !discoverError && filteredDiscoverCommunities.length === 0 && (
	                        <div className="discover-empty">
	                          <div className="discover-empty-title">
	                            {supabaseSession ? "No communities yet." : "No public communities yet."}
	                          </div>
	                          <div className="discover-empty-text">Start one to make discovery meaningful.</div>
	                          <button className="discover-empty-btn" onClick={openCreateCommunityModal}>
	                            Create community
	                          </button>
	                        </div>
	                      )}
	                      {filteredDiscoverCommunities.map((community) => {
	                          const memberCommunity = communities.find((c) => c.slug === community.slug) ?? null;
	                          const alreadyMember = Boolean(memberCommunity);
	                          const visibilityLabel = formatCommunityVisibilityLabel(community.visibility);
	                          const priceLabel = community.active_plan ? formatPlanPrice(community.active_plan) : "Free";
	                          const isJoinable = isPublishedCommunityVisibility(community.visibility);
	                          const description =
	                            community.description && community.description.trim().length > 0
	                              ? community.description
	                              : "No description yet.";
                            const canActivate = alreadyMember || Boolean(community.slug);
		                          return (
		                            <DiscoverCommunityCard
		                              key={community.slug}
		                              name={community.name}
		                              slug={community.slug}
		                              description={description}
		                              avatarUrl={community.avatar_url}
		                              bannerUrl={community.banner_url}
		                              priceLabel={priceLabel}
		                              visibilityClass={isJoinable ? "published" : "unlisted"}
		                              visibilityLabel={visibilityLabel}
		                              isPublishedVisibility={isJoinable}
		                              clickable={canActivate}
		                              ariaLabel={
		                                canActivate ? (alreadyMember ? `Open ${community.name}` : `View ${community.name}`) : undefined
		                              }
	                                onActivate={() => {
	                                  if (!canActivate) return;
                                  if (alreadyMember) {
                                    if (!memberCommunity) return;
                                    if (
                                      !confirmDiscardUnsavedCommunitySettingsDesktop({
                                        isCommunitySettingsDirty: communitySettingsDirtyRef.current,
                                        activeCommunityId,
                                        nextCommunityId: memberCommunity.id,
                                        confirmDiscard: (message) => window.confirm(message),
                                      })
                                    ) {
                                      return;
                                    }
                                    openCommunityTab(memberCommunity.id, "chat", { pushSnapshot: true });
                                    return;
                                  }
		                                void openCommunityLandingExternal(community);
		                              }}
		                            />
		                          );
		                        })}
	                    </div>
	                  </div>
	                </div>
              </div>
            )}
	            <DesktopCommunityChatTab
                showChat={activePage === "community" && communityTab === "chat"}
                supabaseSession={supabaseSession}
                activeCommunity={activeCommunity}
                isLoadingChat={isLoadingChat}
                communityMessages={communityMessages}
                communityChatListRef={communityChatListRef}
                handleChatScroll={handleChatScroll}
                isLoadingMoreChat={isLoadingMoreChat}
                communityChatHasMore={communityChatHasMore}
                shouldShowCommunitySenderMeta={shouldShowCommunitySenderMeta}
                shouldShowDateSeparator={shouldShowDateSeparator}
                displayName={displayName}
                profileAvatarUrl={profileAvatarUrl}
                profilesByUserId={profilesByUserId}
                getAvatarColor={getAvatarColor}
                communityMessageById={communityMessageById}
                editingMessageId={editingMessageId}
                editingMessageText={editingMessageText}
                reactionPickerMessageId={reactionPickerMessageId}
                messageReactions={messageReactions}
                REACTION_EMOJIS={REACTION_EMOJIS}
                getInitials={getInitials}
                parseReplyPrefix={parseReplyPrefix}
                truncateReplyPreview={truncateReplyPreview}
                renderTextWithLinks={renderTextWithLinks}
                scrollToCommunityMessage={scrollToCommunityMessage}
                openCommunityChatLightbox={openCommunityChatLightbox}
                handleToggleReaction={handleToggleReaction}
                setReactionPickerMessageId={setReactionPickerMessageId}
                handleStartReply={handleStartReply}
                copyTextToClipboard={copyTextToClipboard}
                handleStartEdit={handleStartEdit}
                handleDeleteMessage={handleDeleteMessage}
                setEditingMessageText={setEditingMessageText}
                handleSaveEdit={handleSaveEdit}
                handleCancelEdit={handleCancelEdit}
                formatChatTime={formatChatTime}
                isUserAtBottom={isUserAtBottom}
                setIsUserAtBottom={setIsUserAtBottom}
                isUserAtBottomRef={isUserAtBottomRef}
                setUnreadCount={setUnreadCount}
                unreadCount={unreadCount}
                replyingToMessage={replyingToMessage}
                setReplyingToMessage={setReplyingToMessage}
                communityTypingUserIds={communityTypingUserIds}
                communityAttachments={communityAttachments}
                removeCommunityAttachment={removeCommunityAttachment}
                communityFileInputRef={communityFileInputRef}
                canPostMessagesActiveCommunity={canPostMessagesActiveCommunity}
                isSendingCommunityMessage={isSendingCommunityMessage}
                handleCommunityFileInputChange={handleCommunityFileInputChange}
                chatInputRef={chatInputRef}
                communityMessageInput={communityMessageInput}
                setCommunityMessageInput={setCommunityMessageInput}
                maybeBroadcastCommunityTyping={maybeBroadcastCommunityTyping}
                handleSendCommunityMessage={handleSendCommunityMessage}
                communityVoiceUiState={communityVoiceUiState}
                communityVoiceIntent={communityVoiceIntent}
                handleVoiceInputClick={handleVoiceInputClick}
                communityChatError={communityChatError}
              />

              <DesktopCommunitySettingsTab
                showSettings={activePage === "community" && communityTab === "settings"}
                activeCommunity={activeCommunity}
                hasSession={Boolean(supabaseSession)}
                canViewSettings={canViewActiveCommunitySettings}
                canManageMembers={canManageMembersActiveCommunity}
                isActiveCommunityOwner={isActiveCommunityOwner}
                activeCommunityAccess={activeCommunityAccess}
                isSettingsBannerDragOver={isSettingsBannerDragOver}
                isSettingsAvatarDragOver={isSettingsAvatarDragOver}
                isProcessingCommunitySettingsBanner={isProcessingCommunitySettingsBanner}
                communitySettingsBannerUrl={communitySettingsBannerUrl}
                communitySettingsBannerUploadError={communitySettingsBannerUploadError}
                communitySettingsAvatarUrl={communitySettingsAvatarUrl}
                communitySettingsName={communitySettingsName}
                communitySettingsSlug={communitySettingsSlug}
                communitySettingsDescription={communitySettingsDescription}
                communitySettingsVisibility={communitySettingsVisibility}
                communitySettingsPricingMode={communitySettingsPricingMode}
                communitySettingsPriceUsdMonthly={communitySettingsPriceUsdMonthly}
                communitySettingsPriceUsdYearly={communitySettingsPriceUsdYearly}
                communitySettingsError={communitySettingsError}
                isSavingCommunitySettings={isSavingCommunitySettings}
                communityMemberMuted={communityMemberMuted}
                isLoadingCommunityMemberSettings={isLoadingCommunityMemberSettings}
                isLeavingCommunity={isLeavingCommunity}
                communityMemberSettingsError={communityMemberSettingsError}
                hasPayouts={Boolean(builderBillingStatus?.has_payouts)}
                isStartingConnectOnboarding={isStartingConnectOnboarding}
                onSetIsSettingsBannerDragOver={setIsSettingsBannerDragOver}
                onSetIsSettingsAvatarDragOver={setIsSettingsAvatarDragOver}
                onSettingsBannerDrop={handleSettingsBannerDrop}
                onSettingsAvatarDrop={handleSettingsAvatarDrop}
                onCommunityBannerUpload={handleCommunityBannerUpload}
                onCommunityAvatarUpload={handleCommunityAvatarUpload}
                onSetCommunitySettingsBannerUrl={setCommunitySettingsBannerUrl}
                onSetCommunitySettingsBannerUploadError={setCommunitySettingsBannerUploadError}
                onSetCommunitySettingsAvatarUrl={setCommunitySettingsAvatarUrl}
                onSetCommunitySettingsName={setCommunitySettingsName}
                onSetCommunitySettingsSlug={setCommunitySettingsSlug}
                onSetCommunitySettingsDescription={setCommunitySettingsDescription}
                onSetCommunitySettingsVisibility={setCommunitySettingsVisibility}
                onSetCommunitySettingsPricingMode={setCommunitySettingsPricingMode}
                onSetCommunitySettingsPriceUsdMonthly={setCommunitySettingsPriceUsdMonthly}
                onSetCommunitySettingsPriceUsdYearly={setCommunitySettingsPriceUsdYearly}
                onMarkCommunitySettingsDirty={markCommunitySettingsDirty}
                onMarkCommunityPricingDirty={() => {
                  communityPricingDirtyRef.current = true;
                  markCommunitySettingsDirty();
                }}
                onStartConnectOnboarding={startConnectOnboarding}
                onSaveCommunitySettings={handleSaveCommunitySettings}
                onOpenDeleteCommunityModal={openDeleteCommunityModal}
                onToggleCommunityMute={handleToggleCommunityMute}
                onLeaveCommunity={handleLeaveCommunity}
                formatChatTime={formatChatTime}
                slugifyCommunityName={slugifyCommunityName}
              />

              <DesktopCommunityAiAgentTab
                showAiAgent={activePage === "community" && communityTab === "ai_agent"}
                activeCommunity={activeCommunity}
                supabaseSession={supabaseSession}
                canManageMembersActiveCommunity={canManageMembersActiveCommunity}
                isLoadingCommunityAgentDrafts={isLoadingCommunityAgentDrafts}
                communityAgentDraftsError={communityAgentDraftsError}
                isActiveCommunityOwner={isActiveCommunityOwner}
                setBuilderUpgradeContext={setBuilderUpgradeContext}
                setIsBuilderUpgradeOpen={setIsBuilderUpgradeOpen}
                communityAgentDrafts={communityAgentDrafts}
                communityAgentDraftLanding={communityAgentDraftLanding}
                communityAgentPreviewTabId={communityAgentPreviewTabId}
                setCommunityAgentPreviewTabId={setCommunityAgentPreviewTabId}
                communityAgentDraftDirtyRef={communityAgentDraftDirtyRef}
                markCommunityAgentDraftDirty={markCommunityAgentDraftDirty}
                communityAgentDraftSaveError={communityAgentDraftSaveError}
                communityAgentLandingEdit={communityAgentLandingEdit}
                communityAgentLandingEditValue={communityAgentLandingEditValue}
                setCommunityAgentLandingEditValue={setCommunityAgentLandingEditValue}
                setCommunityAgentDraftLanding={setCommunityAgentDraftLanding}
                clearCommunityAgentLandingEdit={clearCommunityAgentLandingEdit}
                beginCommunityAgentLandingEdit={beginCommunityAgentLandingEdit}
                handleSaveCommunityAgentDraft={handleSaveCommunityAgentDraft}
                isSavingCommunityAgentDraft={isSavingCommunityAgentDraft}
                handleSetLiveCommunityAgentDraft={handleSetLiveCommunityAgentDraft}
                communityAgentDraftSystemPrompt={communityAgentDraftSystemPrompt}
                setCommunityAgentDraftSystemPrompt={setCommunityAgentDraftSystemPrompt}
              />

            <DesktopCommunitySecondaryTabs
              showAnalytics={activePage === "community" && communityTab === "analytics"}
              showLibrary={activePage === "community" && communityTab === "library"}
              showResources={activePage === "community" && communityTab === "resources"}
              showMembers={activePage === "community" && communityTab === "members"}
              analyticsPanelProps={{
                capabilities: {
                  hasActiveCommunity: Boolean(activeCommunity),
                  hasSession: Boolean(supabaseSession),
                  canViewActiveCommunityAnalytics,
                },
                state: {
                  communityAnalyticsRange,
                  isLoadingCommunityAnalytics,
                  communityAnalyticsError,
                  communityAnalyticsSummary,
                  communityAnalyticsChartMode,
                  communityAnalyticsSeries,
                  communityRevenueMeta,
                  communityRevenueSeries,
                  communityRevenueError,
                },
                actions: {
                  setCommunityAnalyticsRange,
                  setCommunityAnalyticsChartMode,
                },
              }}
              libraryPanelProps={{
                capabilities: {
                  hasActiveCommunity: Boolean(activeCommunity),
                },
                state: {
                  isLoadingResources,
                  libraryResources,
                  selectedLibraryResourceId,
                  selectedLibraryResource,
                },
                actions: {
                  setSelectedLibraryResourceId,
                },
              }}
              resourcesPanelProps={{
                capabilities: {
                  hasActiveCommunity: Boolean(activeCommunity),
                  activeCommunityName: activeCommunity?.name ?? null,
                  canCreateResources: canCreateResourcesActiveCommunity,
                  canManageResources: canManageResourcesActiveCommunity,
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
              }}
              membersPanelProps={{
                capabilities: {
                  hasActiveCommunity: Boolean(activeCommunity),
                  hasSession: Boolean(supabaseSession),
                  isActiveCommunityOwner,
                  canInvite: canInviteActiveCommunity,
                  canManageMembers: canManageMembersActiveCommunity,
                },
                state: {
                  activeCommunityOwnerId: activeCommunity?.owner_id ?? null,
                  communityMembers,
                  profilesByUserId,
                  memoryReview: {
                    pendingCommunityMemoryCandidates,
                    reviewedCommunityMemoryCandidates,
                    rejectedReviewedCommunityMemoryCandidatesCount: rejectedReviewedCommunityMemoryCandidates.length,
                    isLoadingCommunityMemoryCandidates,
                    communityMemoryCandidatesError,
                    communityMemoryRejectReasonById,
                    reviewingCommunityMemoryCandidateId,
                  },
                  invites: {
                    activeCommunityId: activeCommunity?.id ?? null,
                    inviteMaxUsesPreset,
                    inviteExpiryPreset,
                    isCreatingInvite,
                    inviteMaxUsesCustom,
                    inviteExpiryCustom,
                    inviteCreateError,
                    isLoadingCommunityInvites,
                    communityInvites,
                  },
                },
                actions: {
                  displayName,
                  handleSetCommunityMemberRole,
                  handleRemoveCommunityMember,
                  memoryReview: {
                    setCommunityMemoryRejectReasonById,
                    handlePromoteCommunityMemoryCandidate,
                    handleRejectCommunityMemoryCandidate,
                    displayName,
                    previewText,
                  },
                  invites: {
                    setInviteMaxUsesPreset,
                    setInviteExpiryPreset,
                    handleCreateInvite,
                    setInviteMaxUsesCustom,
                    setInviteExpiryCustom,
                    getPublicShareBaseUrl,
                    handleRevokeInvite,
                    handleDeleteInvite,
                  },
                },
              }}
            />
          </div>
        )}
      </main>
      {activePage === "community" && showCommunityPanel && (
        <aside className="community-info">
          <div className="panel-title">Community</div>
          <div className="context-body">
            {activeCommunity ? activeCommunity.name : "No community selected."}
          </div>
          <div className="panel-title">
            Members
          </div>
          <CommunityMemberList
            members={communityMembers}
            profilesByUserId={profilesByUserId}
            displayName={displayName}
            canManageMembers={canManageMembersActiveCommunity}
            containerClassName="member-list"
            emptyClassName="member-empty"
          />
	        </aside>
	      )}
      </div>
    </div>
  );
}

export default App;

// Format tool approval for inline display
const canEnableWriteEditSessionApproval = (toolName: string): boolean => {
  const normalized = toolName.trim().toLowerCase();
  return normalized === "write" || normalized === "edit" || normalized === "write_file" || normalized === "edit_file";
};

const truncateApprovalPreview = (value: string, limit = 1200): string => {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n...`;
};

const formatToolApproval = (toolName: string, argsJson: string): {
  badge: string;
  title: string;
  subtitle: string | null;
  preview: string | null;
  previewType: "code" | "diff" | "text";
} => {
  let args: Record<string, unknown> = {};
  let argsRawFallback: string | null = null;
  try {
    const parsed = JSON.parse(argsJson) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      args = parsed as Record<string, unknown>;
    } else {
      argsRawFallback = argsJson;
    }
  } catch {
    argsRawFallback = argsJson;
  }

  const normalizedTool = toolName.trim().toLowerCase();

  switch (normalizedTool) {
    case "write":
    case "write_file": {
      const writes = Array.isArray(args.writes) ? (args.writes as Array<Record<string, unknown>>) : [];
      const primaryWrite = writes[0] ?? args;
      const path =
        (primaryWrite.path as string) ||
        (primaryWrite.file_path as string) ||
        (args.path as string) ||
        (args.file_path as string) ||
        "file";
      const content = (primaryWrite.content as string) || (args.content as string) || "";
      const isNew = primaryWrite.expected_before_sha256 === null || args.expected_before_sha256 === null;
      const totalWrites = writes.length > 0 ? writes.length : 1;
      return {
        badge: "WRITE",
        title: isNew ? "Create File" : "Write File",
        subtitle: totalWrites > 1 ? `${path} (+${totalWrites - 1} more)` : path,
        preview: content ? truncateApprovalPreview(content) : null,
        previewType: "code",
      };
    }
    case "edit":
    case "edit_file": {
      const path = (args.path as string) || (args.file_path as string) || "file";
      const oldValue = typeof args.old === "string" ? args.old : "";
      const newValue = typeof args.new === "string" ? args.new : "";
      const allMatches = Boolean(args.all);
      const preview = [
        "--- before",
        oldValue || "(empty)",
        "+++ after",
        newValue || "(empty)",
      ].join("\n");
      return {
        badge: "EDIT",
        title: allMatches ? "Replace in File (all matches)" : "Edit File",
        subtitle: path,
        preview: truncateApprovalPreview(preview),
        previewType: "diff",
      };
    }
    case "bash":
    case "run_shell_command": {
      const command = (args.cmd as string) || (args.command as string) || "";
      const cwd = (args.cwd as string) || ".";
      return {
        badge: "SHELL",
        title: "Run Command",
        subtitle: cwd !== "." ? `in ${cwd}` : null,
        preview: command ? truncateApprovalPreview(command, 900) : null,
        previewType: "code",
      };
    }
    case "read_file": {
      const path = (args.path as string) || (args.file_path as string) || "file";
      return {
        badge: "READ",
        title: "Read File",
        subtitle: path,
        preview: null,
        previewType: "text",
      };
    }
    case "list_dir":
    case "glob": {
      const path = (args.path as string) || (args.pat as string) || (args.pattern as string) || ".";
      return {
        badge: "LIST",
        title: toolName === "glob" ? "Search Files" : "List Directory",
        subtitle: path,
        preview: null,
        previewType: "text",
      };
    }
    case "grep": {
      const query = (args.pat as string) || (args.query as string) || (args.pattern as string) || "";
      const path = (args.path as string) || ".";
      return {
        badge: "SEARCH",
        title: "Search Content",
        subtitle: `"${query}" in ${path}`,
        preview: null,
        previewType: "text",
      };
    }
    default:
      return {
        badge: "TOOL",
        title: normalizedTool || "Tool Call",
        subtitle: null,
        preview: argsRawFallback ?? JSON.stringify(args, null, 2),
        previewType: "code",
      };
  }
};

const parseToolCall = (toolCall: ToolCallRecord): {
  toolName: string;
  command: string;
  shell: string;
  cwd: string;
  patch?: string;
  path?: string;
  maxBytes?: number;
  pattern?: string;
  include?: string;
  limit?: number;
  offset?: number;
  endLine?: number;
  depth?: number;
  srcPath?: string;
  destPath?: string;
  label?: string;
  query?: string;
} => {
  if (toolCall.command) {
    return { toolName: "bash", command: toolCall.command, shell: "zsh", cwd: "." };
  }
  try {
    const parsed = JSON.parse(toolCall.args_json) as {
      tool?: string;
      command?: string;
      shell?: string;
      cwd?: string;
      workdir?: string;
      patch?: string;
      path?: string;
      file_path?: string;
      dir_path?: string;
      max_bytes?: number;
      pattern?: string;
      include?: string;
      limit?: number;
      offset?: number;
      end_line?: number;
      depth?: number;
      src_path?: string;
      dest_path?: string;
      label?: string;
      query?: string;
    };
    const normalizedPath = parsed.path ?? parsed.file_path ?? parsed.dir_path;
    return {
      toolName: toolCall.tool_name || parsed.tool || "bash",
      command: parsed.command ?? "",
      shell: parsed.shell ?? "zsh",
      cwd: parsed.cwd ?? parsed.workdir ?? ".",
      patch: parsed.patch,
      path: normalizedPath,
      maxBytes: parsed.max_bytes,
      pattern: parsed.pattern,
      include: parsed.include,
      limit: parsed.limit,
      offset: parsed.offset,
      endLine: parsed.end_line,
      depth: parsed.depth,
      srcPath: parsed.src_path,
      destPath: parsed.dest_path,
      label: parsed.label,
      query: parsed.query
    };
  } catch {
    return { toolName: toolCall.tool_name || "bash", command: "", shell: "zsh", cwd: "." };
  }
};

/** Map a tool name to a human-readable activity verb. */
const toolActivityVerb = (name: string): string => {
  if (name === "read" || name === "list_dir" || name === "glob" || name === "grep") return "exploring";
  if (name === "write") return "writing";
  if (name === "edit" || name === "apply_patch") return "editing";
  if (name === "bash") return "running";
  if (name === "sha256") return "checking";
  if (name === "task") return "thinking";
  return "working";
};

/** Synonym pools for activity verb rotation. */
const ACTIVITY_SYNONYMS: Record<string, string[]> = {
  thinking:   ["thinking", "reasoning", "considering", "reflecting"],
  exploring:  ["exploring", "reading", "scanning", "examining"],
  writing:    ["writing", "composing", "creating", "drafting"],
  editing:    ["editing", "refining", "adjusting", "updating"],
  running:    ["running", "executing", "processing"],
  checking:   ["checking", "verifying", "validating"],
  preparing:  ["preparing", "setting up", "initializing"],
  cancelling: ["cancelling"],
  working:    ["working", "processing", "computing"],
};

/**
 * Rotating activity narrator with crossfade.
 * Cycles through synonym words for the current activity verb.
 * When the base verb changes (e.g. "thinking" → "exploring"), it
 * immediately shows the new verb, then resumes cycling synonyms.
 */
const ActivityNarrator = ({ verb }: { verb: string }) => {
  const pool = ACTIVITY_SYNONYMS[verb] ?? [verb];
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const prevVerbRef = useRef(verb);

  // When the base verb changes, reset to first synonym immediately
  useEffect(() => {
    if (verb !== prevVerbRef.current) {
      prevVerbRef.current = verb;
      setIndex(0);
      setVisible(true);
    }
  }, [verb]);

  // Cycle through synonyms
  useEffect(() => {
    if (pool.length <= 1) return;
    const interval = setInterval(() => {
      // Fade out
      setVisible(false);
      // After fade-out, swap word and fade in
      setTimeout(() => {
        setIndex((i) => (i + 1) % pool.length);
        setVisible(true);
      }, 350);
    }, 2800);
    return () => clearInterval(interval);
  }, [pool]);

  const word = pool[index % pool.length];

  return (
    <span className="activity-narrator">
      <span className={`activity-verb shimmer ${visible ? "visible" : "fading"}`}>
        {word}
      </span>
    </span>
  );
};

/** Strip workspace root prefix from a path for compact display. */

function trimWorkspacePath(fullPath: string, workspacePath: string | null | undefined): string {
  if (!workspacePath) return fullPath;
  const prefix = workspacePath.endsWith("/") ? workspacePath : workspacePath + "/";
  if (fullPath.startsWith(prefix)) return fullPath.slice(prefix.length);
  if (fullPath === workspacePath) return ".";
  return fullPath;
}

function formatExecutionLabel(
  engineIdInput: string | null | undefined,
  modelIdInput: string | null | undefined,
  modelToggles: ModelToggle[],
  inferenceSourceInput?: string | null,
  inferenceLaneFallbacksInput?: ReadonlyArray<{ from: string; to: string; reason: string }> | null,
): string | null {
  const inferInferenceSourceFromEngine = (engineId: string | null | undefined): string | null => {
    const normalized = String(engineId ?? "").trim().toLowerCase();
    if (!normalized) return null;
    if (normalized.includes("chatgpt")) return "chatgpt";
    if (normalized.includes("public")) return "free";
    if (
      normalized.includes("runtime_turn") ||
      normalized.includes("agent_turn") ||
      normalized.includes("agent_web") ||
      normalized.includes("platform")
    ) {
      return "platform";
    }
    return null;
  };

  const effectiveInferenceSource =
    (inferenceSourceInput ?? "").trim() || inferInferenceSourceFromEngine(engineIdInput) || null;

  const modelSignature = formatModelAttributionLabel({
    modelId: modelIdInput,
    inferenceSource: effectiveInferenceSource,
    modelToggles,
    inferenceLaneFallbacks: inferenceLaneFallbacksInput,
    freeModelAllowlist: DESKTOP_FREE_MODEL_ALLOWLIST,
    freeModelLabels: DESKTOP_FREE_MODEL_LABELS,
  });
  if (modelSignature) return modelSignature;

  const engineId = (engineIdInput ?? "").trim();
  if (!engineId) return null;
  return engineId.replace(/_/g, " ");
}

function previewText(value: string, limit = 160): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function formatToolArtifactLines(
  summary: any,
  opts?: { includeFilePatchHashes?: boolean },
): string[] {
  const includeFilePatchHashes = opts?.includeFilePatchHashes ?? false;
  const artifacts: any[] = Array.isArray(summary?.artifacts) ? summary.artifacts : [];
  return artifacts
    .map((artifact) => {
      if (!artifact || typeof artifact !== "object") return null;
      const type = typeof (artifact as any).type === "string" ? (artifact as any).type : "artifact";
      const artifactPath =
        typeof (artifact as any).path === "string" ? (artifact as any).path : "(unknown)";
      const treatAsEditArtifact =
        type === "file_edit" || type === "file_write" || (includeFilePatchHashes && type === "file_patch");
      if (treatAsEditArtifact) {
        const before = typeof (artifact as any).before_sha256 === "string" ? (artifact as any).before_sha256 : null;
        const after = typeof (artifact as any).after_sha256 === "string" ? (artifact as any).after_sha256 : null;
        return `${type}: ${artifactPath}${before && after ? `\n  ${before} → ${after}` : ""}`;
      }
      if (type === "file_hash") {
        const sha = typeof (artifact as any).sha256 === "string" ? (artifact as any).sha256 : null;
        return `file_hash: ${artifactPath}${sha ? `\n  ${sha}` : ""}`;
      }
      return `${type}: ${artifactPath}`;
    })
    .filter(Boolean) as string[];
}

function parseMessageContent(contentJson: string): { text: string; format: string | null } {
  try {
    const parsed = JSON.parse(contentJson) as { text?: string; format?: string };
    const text = typeof parsed.text === "string" ? parsed.text : contentJson;
    const format = typeof parsed.format === "string" ? parsed.format : null;
    return { text, format };
  } catch {
    return { text: contentJson, format: null };
  }
}

function parseMessageText(contentJson: string): string {
  return parseMessageContent(contentJson).text;
}

/** Renders tool output with diff coloring or syntax highlighting. */
function ToolOutputBlock({ content }: { content: string }) {
  const isDiff = /^[-+]{3} |^@@ /.test(content) || (
    content.includes("\n+") && content.includes("\n-") && content.includes("--- ")
  );

  if (isDiff) {
    const lines = content.split("\n");
    return (
      <pre className="tool-output tool-output-diff">
        {lines.map((line, i) => {
          let cls = "diff-ctx";
          if (line.startsWith("+++") || line.startsWith("---")) cls = "diff-hdr";
          else if (line.startsWith("@@")) cls = "diff-range";
          else if (line.startsWith("+")) cls = "diff-add";
          else if (line.startsWith("-")) cls = "diff-del";
          return <span key={i} className={cls}>{line}{"\n"}</span>;
        })}
      </pre>
    );
  }

  // For non-diff output, just render as plain monospace
  return <pre className="tool-output">{content}</pre>;
}


// Clean streaming content: remove TOOL_CALL/TOOLCALL and JSON tool content
function cleanStreamingContent(text: string): {
  cleaned: string;
  toolCallRaw: string;
  toolName: string;
  commandPreview: string;
  hasToolCall: boolean;
} {
  const normalizeToolName = (raw: string): string => {
    const normalized = raw
      .split("")
      .filter((ch) => /[a-zA-Z0-9]/.test(ch))
      .join("")
      .toLowerCase();
    if (["runshellcommand", "shellcommand", "shell", "bash"].includes(normalized)) {
      return "run_shell_command";
    }
    if (["readfile"].includes(normalized)) {
      return "read_file";
    }
    if (["proposememoryupdate", "proposememoryblockupdate"].includes(normalized)) {
      return "propose_memory_update";
    }
    return raw;
  };

  const formatToolName = (tool: string): string => {
    if (tool === "run_shell_command") return "run shell command";
    if (tool === "read_file") return "read file";
    if (tool === "propose_memory_update") return "update memory";
    return tool;
  };

  // Match TOOL_CALL: or TOOLCALL: (with or without underscore, case insensitive)
  // Also match raw JSON tool calls starting with {"tool":
  const toolCallPattern = /\b(TOOL_?CALL:\s*\{.*|\{"tool":\s*"[^"]+".*)$/is;

  let cleaned = text;
  let toolCallRaw = '';
  let toolName = '';
  let commandPreview = '';
  let hasToolCall = false;
  let toolKey = '';

  // Check for tool call pattern anywhere in the text
  const match = text.match(toolCallPattern);
  if (match) {
    hasToolCall = true;
    toolCallRaw = match[0];
    // Remove everything from the tool call pattern onwards
    cleaned = text.slice(0, match.index).trim();

    // Try to extract tool name and command from the JSON
    try {
      const jsonStart = toolCallRaw.indexOf('{');
      if (jsonStart >= 0) {
        // Try to parse partial JSON - find matching brace or use what we have
        let jsonStr = toolCallRaw.slice(jsonStart);
        // For partial JSON, just extract what we can with regex
        const toolMatch = jsonStr.match(/"tool"\s*:\s*"([^"]+)"/);
        const cmdMatch = jsonStr.match(/"command"\s*:\s*"([^"]+)"/);
        const patchMatch = jsonStr.match(/"patch"\s*:\s*"([^"]{0,50})/);
        const pathMatch = jsonStr.match(/"path"\s*:\s*"([^"]+)"/);
        const labelMatch = jsonStr.match(/"label"\s*:\s*"([^"]+)"/);

        if (toolMatch) {
          toolKey = normalizeToolName(toolMatch[1]);
          toolName = formatToolName(toolKey);
        }

        if (toolKey === "run_shell_command") {
          if (cmdMatch) commandPreview = cmdMatch[1];
        } else if (toolKey === "read_file") {
          if (pathMatch) commandPreview = pathMatch[1];
        } else if (toolKey === "propose_memory_update") {
          if (labelMatch) commandPreview = labelMatch[1];
        } else {
          if (cmdMatch) commandPreview = cmdMatch[1];
          else if (patchMatch) commandPreview = patchMatch[1] + '...';
          else if (pathMatch) commandPreview = pathMatch[1];
        }
      }
    } catch {
      // Ignore parse errors for partial JSON
    }
  }

  return { cleaned, toolCallRaw, toolName, commandPreview, hasToolCall };
}

function openExternalUrlBestEffort(url: string): void {
  const trimmed = url.trim();
  if (!trimmed) return;
  void desktopShellClientSingleton.openExternalUrl(trimmed).catch(() => {
    try {
      window.open(trimmed, "_blank", "noopener,noreferrer");
    } catch {
      // Ignore.
    }
  });
}

function renderTextWithLinks(text: string): ReactNode {
  return renderTextWithLinksShared(text, { onOpenUrl: openExternalUrlBestEffort });
}

function formatSecretScanError(scan: SecretScanResult): string {
  if (!scan.redactions || scan.redactions.length === 0) {
    return "Blocked: sensitive content detected. Remove secrets before sending.";
  }
  const parts = scan.redactions.map((r) => `${r.kind}(${r.count})`);
  return `Blocked: sensitive content detected (${parts.join(", ")}). Remove secrets before sending.`;
}

async function scanPublishContent(text: string): Promise<SecretScanResult | null> {
  try {
    return await desktopShellClientSingleton.scanPublishContent(text);
  } catch {
    return null;
  }
}
