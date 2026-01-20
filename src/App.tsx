import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";

type ThreadRecord = {
  id: string;
  title: string | null;
  engine_id: string;
  model_id: string | null;
  workspace_path: string | null;
  community_id: string | null;
  created_at: number;
  updated_at: number;
  last_event_at: number | null;
};

type ProjectRecord = {
  id: string;
  name: string | null;
  root_path: string;
  git_root: string | null;
  git_remote: string | null;
  fingerprint: string;
  created_at: number;
  updated_at: number;
};

type ToolCallRecord = {
  id: string;
  session_id: string;
  run_id?: string | null;
  tool_name: string;
  args_json: string;
  status: string;
  output_summary_json?: string | null;
  stdout_excerpt?: string | null;
  stderr_excerpt?: string | null;
  exit_code?: number | null;
  duration_ms?: number | null;
  raw_output_file_id?: string | null;
  egress_policy?: string;
  created_at: number;
  updated_at: number;
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

type ToolCallProgressPayload = {
  session_id: string;
  tool_call_id: string;
  tool_name: string;
  tool_args_preview: string | null;
  status: "started" | "finished";
  result: "ok" | "error" | null;
};

type OpenedUrlsPayload = {
  urls: string[];
};

type RunningTool = {
  id: string;
  name: string;
  preview: string | null;
  status: "running" | "ok" | "error";
};

type ToolUiSpec = {
  name: string;
  description: string;
  parameters: unknown;
  requires_approval: boolean;
  auto_apply: boolean;
  parallel_safe: boolean;
};

type AgentMode = "build" | "plan" | "explore";

type MessageRecord = {
  id: string;
  session_id: string;
  role: string;
  content_json: string;
  created_at: number;
  engine_id?: string | null;
  model_id?: string | null;
  run_id?: string | null;
};

type TurnRecord = {
  id: string;
  thread_id: string;
  user_event_id: string;
  memory_retrieval_event_id: string | null;
  engine_input_event_id: string | null;
  assistant_event_id: string | null;
  seq_start: number;
  seq_end: number | null;
  created_at: number;
};

type EventRecord = {
  id: string;
  thread_id: string;
  seq: number;
  type: string;
  created_at: number;
  text: string | null;
  payload_json: string | null;
  blob_ref: string | null;
};

type SendTurnResult = {
  thread_id: string;
  engine_id: string;
  engine_input_event_id: string | null;
  engine_input_seq: number | null;
  run_id: string | null;
};

type SessionResume = {
  session_id: string;
  last_message_id: string | null;
  last_message_at: number | null;
  last_response_id: string | null;
};

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

type TaskPlanItem = {
  step: string;
  status: string;
};

type TaskPlanPayload = {
  explanation?: string;
  plan: TaskPlanItem[];
};

type ToolDebug = {
  id: string;
  text: string;
};

type ModelToggle = {
  id: string;
  label: string;
  enabled: boolean;
};

type ModelAvailability = {
  id: string;
  available: boolean;
};

type ProviderKey = {
  id: string;
  label: string;
  hasKey: boolean;
  inputValue: string;
  error?: string | null;
};

type SupabaseUser = {
  id: string;
  email?: string;
};

type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: SupabaseUser;
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

type OpenRouterStreamPayload = {
  session_id: string;
  run_id: string;
  engine_id: string;
  model_id: string;
  chunk: string;
  full_content: string;
  seq: number;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  max_tokens: number;
};

type SessionIdPayload = {
  session_id: string;
};

type SecretScanRedaction = {
  kind: string;
  count: number;
};

type SecretScanResult = {
  redacted: string;
  blocked: boolean;
  redactions: SecretScanRedaction[];
};

type SourcesUsedState =
  | { open: false }
  | {
      open: true;
      turnId: string;
      isLoading: boolean;
      error: string | null;
      workspacePath: string | null;
      personalMemory: Array<{ id: string; content: string }>;
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

type CommunityChatMessage = {
  id: string;
  community_id: string;
  sender_id: string;
  body: string;
  reply_to_id?: string | null;
  created_at: string;
};

type MessageReaction = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

type Attachment = {
  id: string;
  path: string;
  name: string;
  type: "image" | "file";
  size: number;
  previewDataUrl?: string; // base64 data URL for image thumbnails
};

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];
const COMMUNITY_CHAT_PAGE_SIZE = 50;
const COMMUNITY_CHAT_LOAD_MORE_THRESHOLD_PX = 140;
const PENDING_PUBLIC_JOIN_COMMUNITY_ID_KEY = "arx_pending_public_join_community_id";
const DEFAULT_ACTIVE_MODEL_ID = "gpt-5.2";
const DEFAULT_MODEL_TOGGLES: ModelToggle[] = [
  { id: "gpt-5.2", label: "GPT 5.2", enabled: true },
  { id: "gpt-5.1", label: "GPT 5.1", enabled: true },
  { id: "sonnet-4.5", label: "Sonnet 4.5", enabled: true },
  { id: "opus-4.5", label: "Opus 4.5", enabled: true },
  { id: "gemini-3-flash", label: "Gemini 3 Flash", enabled: true },
  { id: "gemini-3-pro", label: "Gemini 3 Pro", enabled: true },
  { id: "grok-4.1", label: "Grok 4.1", enabled: true },
];
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

type CommunityResource = {
  id: string;
  community_id: string;
  type: "post" | "embed" | "link" | "file";
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
};

type CommunityArtifact = {
  id: string;
  community_id: string;
  author_id: string;
  type: "vision" | "decision" | "playbook" | "outcome";
  title: string;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
};

type ArtifactVersion = {
  id: string;
  artifact_id: string;
  body_md: string;
  summary: string | null;
  tags: string[] | null;
  created_at: string;
  created_by: string;
};

type CommunityInviteRecord = {
  id: string;
  community_id: string;
  code: string;
  role: string;
  tier_id: string | null;
  max_uses: number | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
  communities?: CommunityRecord;
};

type SettingsPage = "account" | "models" | "execution" | "memory" | "appearance";

type AppTheme = "light" | "dark" | "light-warm" | "dark-warm";

function App() {
  const [threads, setThreads] = useState<ThreadRecord[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [newThreadTitle] = useState("Untitled thread");
  const [commandInput, setCommandInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallRecord[]>([]);
  const [toolSpecsByName, setToolSpecsByName] = useState<Record<string, ToolUiSpec>>({});
  const [agentMode, setAgentMode] = useState<AgentMode>("build");
  const [pendingToolApproval, setPendingToolApproval] = useState<ToolApprovalRequestedPayload | null>(null);
  const [isToolApprovalSubmitting, setIsToolApprovalSubmitting] = useState(false);
  const [agentStatus, setAgentStatus] = useState<AgentStatusPayload | null>(null);
  const [runningTools, setRunningTools] = useState<RunningTool[]>([]);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [turnsByAssistantEventId, setTurnsByAssistantEventId] = useState<Record<string, TurnRecord>>({});
  const [isSending, setIsSending] = useState(false);
  const sendStartedAtRef = useRef<number | null>(null);
  const [sendElapsedSec, setSendElapsedSec] = useState(0);
  const [streamingTokens, setStreamingTokens] = useState<{
    prompt_tokens?: number;
    completion_tokens?: number;
    max_tokens?: number;
  } | null>(null);
  const [streamingMeta, setStreamingMeta] = useState<{ engine_id: string; model_id: string } | null>(null);
  const [activeView, setActiveView] = useState<"home" | "settings">("home");
  const [settingsPage, setSettingsPage] = useState<SettingsPage>("models");
  const [appTheme, setAppTheme] = useState<AppTheme>(() => {
    const stored = localStorage.getItem("arx-theme");
    if (stored && ["light", "dark", "light-warm", "dark-warm"].includes(stored)) {
      return stored as AppTheme;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [activePage, setActivePage] = useState<"workspace" | "community" | "discover">("workspace");
  const [communityTab, setCommunityTab] = useState<"chat" | "library" | "resources" | "members" | "settings">("chat");
  const [modelToggles, setModelToggles] = useState<ModelToggle[]>(DEFAULT_MODEL_TOGGLES);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [toolDebug] = useState<ToolDebug | null>(null);
  const [providerKeys, setProviderKeys] = useState<ProviderKey[]>([
    { id: "openrouter", label: "OpenRouter", hasKey: false, inputValue: "", error: null }
  ]);
  const [modelAvailability, setModelAvailability] = useState<Record<string, boolean>>({});
		  const [supabaseSession, setSupabaseSession] = useState<SupabaseSession | null>(null);
		  const supabaseSessionRef = useRef<SupabaseSession | null>(null);
		  const supabaseAutoRefreshTimeoutRef = useRef<number | null>(null);
		  const autoJoinInvitesAttemptedRef = useRef<Set<string>>(new Set());
		  const autoJoinPublicCommunitiesAttemptedRef = useRef<Set<string>>(new Set());
		  const supabaseRefreshInFlightRef = useRef<Promise<SupabaseSession | null> | null>(null);
		  const [authError, setAuthError] = useState<string | null>(null);
  const [showCreateCommunityModal, setShowCreateCommunityModal] = useState(false);
  const [createCommunityName, setCreateCommunityName] = useState("");
  const [createCommunitySlug, setCreateCommunitySlug] = useState("");
  const [createCommunitySlugEdited, setCreateCommunitySlugEdited] = useState(false);
  const [createCommunityVisibility, setCreateCommunityVisibility] = useState<"public" | "unlisted" | "private">("private");
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
		  const [communityRoleById, setCommunityRoleById] = useState<Record<string, string>>({});
		  const [communityInvites, setCommunityInvites] = useState<CommunityInviteRecord[]>([]);
		  const [isLoadingCommunityInvites, setIsLoadingCommunityInvites] = useState(false);
		  const [inviteMaxUsesPreset, setInviteMaxUsesPreset] = useState("unlimited");
		  const [inviteMaxUsesCustom, setInviteMaxUsesCustom] = useState("");
		  const [inviteExpiryPreset, setInviteExpiryPreset] = useState("7d");
		  const [inviteExpiryCustom, setInviteExpiryCustom] = useState("");
		  const [inviteCreateError, setInviteCreateError] = useState<string | null>(null);
		  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
		  const [communitySettingsName, setCommunitySettingsName] = useState("");
		  const [communitySettingsSlug, setCommunitySettingsSlug] = useState("");
		  const [communitySettingsDescription, setCommunitySettingsDescription] = useState("");
		  const [communitySettingsVisibility, setCommunitySettingsVisibility] = useState("private");
  const [communitySettingsAvatarUrl, setCommunitySettingsAvatarUrl] = useState<string | null>(null);
  const [communitySettingsBannerUrl, setCommunitySettingsBannerUrl] = useState<string | null>(null);
		  const [communitySettingsError, setCommunitySettingsError] = useState<string | null>(null);
		  const [isSavingCommunitySettings, setIsSavingCommunitySettings] = useState(false);
		  const [communityMessages, setCommunityMessages] = useState<CommunityChatMessage[]>([]);
  const [communityMessageInput, setCommunityMessageInput] = useState("");
  const [communityChatError, setCommunityChatError] = useState<string | null>(null);
  const [isSendingCommunityMessage, setIsSendingCommunityMessage] = useState(false);
  const [replyingToMessage, setReplyingToMessage] = useState<CommunityChatMessage | null>(null);
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
  const [artifacts, setArtifacts] = useState<CommunityArtifact[]>([]);
  const [artifactVersions, setArtifactVersions] = useState<ArtifactVersion[]>([]);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
	  const [isLoadingArtifacts, setIsLoadingArtifacts] = useState(false);
	  const [isLoadingArtifactVersions, setIsLoadingArtifactVersions] = useState(false);
	  const [isLoadingChat, setIsLoadingChat] = useState(false);
	  const [isLoadingMoreChat, setIsLoadingMoreChat] = useState(false);
	  const [communityChatHasMore, setCommunityChatHasMore] = useState(true);
		  const [isLoadingResources, setIsLoadingResources] = useState(false);
      const [discoverCommunities, setDiscoverCommunities] = useState<CommunityRecord[]>([]);
      const [discoverQuery, setDiscoverQuery] = useState("");
      const [discoverError, setDiscoverError] = useState<string | null>(null);
      const [isLoadingDiscover, setIsLoadingDiscover] = useState(false);
      const [joiningDiscoverCommunityId, setJoiningDiscoverCommunityId] = useState<string | null>(null);
  const [messageReactions, setMessageReactions] = useState<MessageReaction[]>([]);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [editingMessagePrefix, setEditingMessagePrefix] = useState<string | null>(null);
  const [resourceSuccess, setResourceSuccess] = useState(false);
  const [memoryToast, setMemoryToast] = useState<string | null>(null);
  const [taskPlan, setTaskPlan] = useState<TaskPlanPayload | null>(null);
	  const [unreadCount, setUnreadCount] = useState(0);
	  const [isUserAtBottom, setIsUserAtBottom] = useState(true);
	  const isUserAtBottomRef = useRef(true);
	  const communityChatOldestCreatedAtRef = useRef<string | null>(null);
	  const pendingChatPrependScrollRef = useRef<{ prevScrollHeight: number; prevScrollTop: number } | null>(null);
	  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [slashHover, setSlashHover] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  // User preference for panels (what they toggled)
  const [userWantsSessions, setUserWantsSessions] = useState(true);
  const [userWantsCommunity, setUserWantsCommunity] = useState(true);

  // Actual visibility (computed based on window size)
  const [showSidePanel, setShowSidePanel] = useState(true);
  const [showCommunityPanel, setShowCommunityPanel] = useState(false); // Right panel hidden - members moved to left nav
    const [sessionsCompact, setSessionsCompact] = useState(false);
  const [profileName, setProfileName] = useState(() =>
    localStorage.getItem("arx_profile_name") ??
    localStorage.getItem("arx_profile_display_name") ??
    ""
  );
  const [profileUsername, setProfileUsername] = useState(() =>
    localStorage.getItem("arx_profile_username") ?? ""
  );
  const [profileBio, setProfileBio] = useState(() =>
    localStorage.getItem("arx_profile_bio") ?? ""
  );
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(() =>
    localStorage.getItem("arx_profile_avatar")
  );
  const [isProfileAvatarDragOver, setIsProfileAvatarDragOver] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const resizeRaf = useRef<number | null>(null);
  const [expandedToolCallId, setExpandedToolCallId] = useState<string | null>(null);
  const [expandedCommandIds, setExpandedCommandIds] = useState<Set<string>>(new Set());
  const [actionErrors] = useState<Record<string, string>>({});
  const memoryToastTimeoutRef = useRef<number | null>(null);
  const [execPolicyRules, setExecPolicyRules] = useState("");
  const [isSavingExecPolicy, setIsSavingExecPolicy] = useState(false);
  const [execPolicyError, setExecPolicyError] = useState<string | null>(null);
  const [sessionExecPolicyRules, setSessionExecPolicyRules] = useState("");
  const [isSavingSessionExecPolicy, setIsSavingSessionExecPolicy] = useState(false);
  const [sessionExecPolicyError, setSessionExecPolicyError] = useState<string | null>(null);
  const [policyByToolCallId, setPolicyByToolCallId] = useState<Record<
    string,
    { decision: "allow" | "prompt" | "forbid"; reason: string; matched_rule?: string | null }
  >>({});
  const [sessionResume, setSessionResume] = useState<SessionResume | null>(null);
  const [personalMemoryItems, setPersonalMemoryItems] = useState<PersonalMemoryItemRecord[]>([]);
  const [personalMemoryQuery, setPersonalMemoryQuery] = useState("");
  const [personalMemoryError, setPersonalMemoryError] = useState<string | null>(null);
  const [isLoadingPersonalMemory, setIsLoadingPersonalMemory] = useState(false);
  const [newPersonalMemoryContent, setNewPersonalMemoryContent] = useState("");
  const [newPersonalMemoryScope, setNewPersonalMemoryScope] = useState<"global" | "workspace">(
    "workspace"
  );
  const [newPersonalMemoryPinned, setNewPersonalMemoryPinned] = useState(false);
  const [slashPanel, setSlashPanel] = useState<{
    kind: "status" | "approvals" | "info";
    title: string;
    body?: string;
  } | null>(null);
  const [approvalMode, setApprovalMode] = useState<"read-only" | "agent" | "agent-full">("agent");
  const [autoApproveWriteEdit, setAutoApproveWriteEdit] = useState(false);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<ProjectRecord | null>(null);
  const askInputRef = useRef<HTMLInputElement | null>(null);
  const [runningToolCallId, setRunningToolCallId] = useState<string | null>(null);
  const toolCallsRef = useRef<ToolCallRecord[]>([]);
  const activeModelIdRef = useRef<string | null>(null);
  const autoExecutedToolCallsRef = useRef<Set<string>>(new Set());
  const communitySocketRef = useRef<WebSocket | null>(null);
  const communityHeartbeatRef = useRef<number | null>(null);
  const communityChatListRef = useRef<HTMLDivElement | null>(null);
  const workspaceMessageListRef = useRef<HTMLDivElement | null>(null);
  const [isWorkspaceAtBottom, setIsWorkspaceAtBottom] = useState(true);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const autoScrollEnabledRef = useRef(true);
  const lastWorkspaceScrollTopRef = useRef(0);
  const isLoadingThreadRef = useRef(false); // Suppresses scroll handler during thread transitions

  // Throttled streaming: accumulate content in ref, update state via RAF
  const streamingContentRef = useRef<string | null>(null);
  const streamingTokensRef = useRef<{prompt_tokens?: number; completion_tokens?: number; max_tokens?: number} | null>(null);
  const streamingMetaRef = useRef<{ engine_id: string; model_id: string } | null>(null);
  const streamingRafRef = useRef<number | null>(null);

  // Throttled streaming update: accumulate in refs, flush to state on next animation frame
  const scheduleStreamingUpdate = useCallback(() => {
    if (streamingRafRef.current !== null) return; // Already scheduled
    streamingRafRef.current = requestAnimationFrame(() => {
      streamingRafRef.current = null;
      setStreamingContent(streamingContentRef.current);
      if (streamingTokensRef.current) {
        setStreamingTokens(streamingTokensRef.current);
      }
      if (streamingMetaRef.current) {
        setStreamingMeta(streamingMetaRef.current);
      }
    });
  }, []);

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

	  useEffect(() => {
	    void loadThreads();
	    void loadWorkspaceRoot();
	    void loadActiveProject();
	    void loadModelToggles();
	    void loadActiveModel();
	    void loadProviderKeys();
	    void loadExecPolicyRules();
	    void loadPendingInvites();
	    void consumeInviteQueryParam();
	    void consumeOAuthHash();
	    void loadSupabaseSession();
	  }, []);

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
    document.documentElement.setAttribute("data-theme", appTheme);
    localStorage.setItem("arx-theme", appTheme);
  }, [appTheme]);

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

    if (!activeThreadId) {
      isLoadingThreadRef.current = false;
      return;
    }
    void loadMessages(activeThreadId);
    void loadTurns(activeThreadId);
    void loadSessionResume(activeThreadId);
    void loadSessionExecPolicyRules(activeThreadId);
  }, [activeThreadId, activeProject?.id]);

  useEffect(() => {
    if (!activeThreadId) return;
    void invoke<ThreadRecord | null>("get_thread_cmd", { threadId: activeThreadId })
      .then((thread) => {
        if (!thread) return;
        setThreads((prev) => {
          const idx = prev.findIndex((t) => t.id === thread.id);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = thread;
          return next;
        });
        if (thread.model_id) {
          setActiveModelId(thread.model_id);
        }
        if (thread.community_id) {
          setActiveCommunityId(thread.community_id);
        }
      })
      .catch(() => {
        // Non-fatal; keep current selection.
      });
  }, [activeThreadId]);

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
    return activeProject?.root_path ?? workspaceRoot ?? ".";
  }

  function sortPersonalMemory(items: PersonalMemoryItemRecord[]): PersonalMemoryItemRecord[] {
    return [...items].sort((a, b) => {
      const pinnedDiff = (b.pinned ?? 0) - (a.pinned ?? 0);
      if (pinnedDiff !== 0) return pinnedDiff;
      return (b.updated_at ?? 0) - (a.updated_at ?? 0);
    });
  }

  async function loadPersonalMemoryItems() {
    setIsLoadingPersonalMemory(true);
    setPersonalMemoryError(null);
    try {
      const workspacePath = getEffectiveWorkspacePath();
      const [globalItems, workspaceItems] = await Promise.all([
        invoke<PersonalMemoryItemRecord[]>("list_personal_memory_items_cmd", {
          scope: "global",
          scopeId: null,
          limit: 200
        }),
        invoke<PersonalMemoryItemRecord[]>("list_personal_memory_items_cmd", {
          scope: "workspace",
          scopeId: workspacePath,
          limit: 200
        })
      ]);
      setPersonalMemoryItems(sortPersonalMemory([...globalItems, ...workspaceItems]));
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
      const results = await invoke<PersonalMemoryItemRecord[]>("search_personal_memory_items_cmd", {
        query: q,
        limit: 200
      });
      setPersonalMemoryItems(sortPersonalMemory(results));
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
      const scope = newPersonalMemoryScope;
      const scopeId = scope === "workspace" ? getEffectiveWorkspacePath() : null;
      await invoke("create_personal_memory_item_cmd", {
        threadId: activeThreadId ?? null,
        content,
        scope,
        scopeId,
        pinned: newPersonalMemoryPinned,
        provenanceEventId: null
      });
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
      await invoke("set_personal_memory_item_pinned_cmd", {
        threadId: activeThreadId ?? null,
        id: item.id,
        pinned: item.pinned === 0
      });
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
      await invoke("delete_personal_memory_item_cmd", { threadId: activeThreadId ?? null, id });
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

  useEffect(() => {
    supabaseSessionRef.current = supabaseSession;
  }, [supabaseSession]);

  useEffect(() => {
    if (supabaseAutoRefreshTimeoutRef.current) {
      window.clearTimeout(supabaseAutoRefreshTimeoutRef.current);
      supabaseAutoRefreshTimeoutRef.current = null;
    }
    if (!supabaseSession) return;

    const nowSec = Math.floor(Date.now() / 1000);
    const refreshAtSec = Math.max(supabaseSession.expires_at - 90, nowSec + 5);
    const delayMs = Math.max((refreshAtSec - nowSec) * 1000, 0);

    const attemptRefresh = async () => {
      const current = supabaseSessionRef.current;
      if (!current) return;
      const refreshed = await refreshSupabaseSessionLocked(current.refresh_token);
      if (refreshed) return;

      // Network flake or transient failure; retry a bit later if not fully expired yet.
      const now = Math.floor(Date.now() / 1000);
      if (current.expires_at > now) {
        supabaseAutoRefreshTimeoutRef.current = window.setTimeout(() => {
          void attemptRefresh();
        }, 30_000);
      }
    };

    supabaseAutoRefreshTimeoutRef.current = window.setTimeout(() => {
      void attemptRefresh();
    }, delayMs);

    return () => {
      if (supabaseAutoRefreshTimeoutRef.current) {
        window.clearTimeout(supabaseAutoRefreshTimeoutRef.current);
        supabaseAutoRefreshTimeoutRef.current = null;
      }
    };
  }, [supabaseSession]);

  useEffect(() => {
    const onFocus = () => {
      const current = supabaseSessionRef.current;
      if (!current) return;
      const now = Math.floor(Date.now() / 1000);
      if (current.expires_at <= now + 60) {
        void refreshSupabaseSessionLocked(current.refresh_token);
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

	  useEffect(() => {
	    if (!supabaseSession) return;
	    void loadCommunities(supabaseSession);
	    void maybeAutoJoinPendingInvites(supabaseSession);
	    void maybeAutoJoinPendingPublicCommunity(supabaseSession);
	  }, [supabaseSession]);

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
	    setIsLoadingMoreChat(false);
	    setCommunityChatHasMore(true);
	    communityChatOldestCreatedAtRef.current = null;
	    pendingChatPrependScrollRef.current = null;
	    setOpenResourceEmbedId(null);
	    if (chatInputRef.current) {
	      chatInputRef.current.style.height = "auto";
	    }
	  }, [activeCommunityId]);

	  useEffect(() => {
	    const current = communities.find((c) => c.id === activeCommunityId) ?? null;
	    setCommunitySettingsError(null);
    if (!current) {
      setCommunitySettingsName("");
      setCommunitySettingsSlug("");
      setCommunitySettingsDescription("");
      setCommunitySettingsVisibility("private");
      setCommunitySettingsAvatarUrl(null);
      setCommunitySettingsBannerUrl(null);
      setCommunityInvites([]);
      setInviteCreateError(null);
      return;
    }
    setCommunitySettingsName(current.name ?? "");
    setCommunitySettingsSlug(current.slug ?? "");
    setCommunitySettingsDescription(current.description ?? "");
    setCommunitySettingsVisibility(current.visibility ?? "private");
    setCommunitySettingsAvatarUrl(current.avatar_url ?? null);
    setCommunitySettingsBannerUrl(current.banner_url ?? null);
    setInviteCreateError(null);
  }, [activeCommunityId, communities]);

	  useEffect(() => {
	    if (activePage !== "community" || communityTab !== "members") return;
	    if (!supabaseSession || !activeCommunityId) {
	      setCommunityInvites([]);
	      return;
	    }
    const current = communities.find((c) => c.id === activeCommunityId) ?? null;
    const role = communityRoleById[activeCommunityId];
    const isAdmin = Boolean(
      current && (role === "owner" || role === "admin" || current.owner_id === supabaseSession.user.id)
    );
    if (!isAdmin) {
      setCommunityInvites([]);
      return;
    }
	    void loadCommunityInvites(activeCommunityId, supabaseSession);
	  }, [activePage, communityTab, supabaseSession, activeCommunityId, communities, communityRoleById]);

  useEffect(() => {
    if (!supabaseSession || !activeCommunityId || communityTab !== "resources") return;
    void loadCommunityResources(activeCommunityId, supabaseSession);
  }, [supabaseSession, activeCommunityId, communityTab]);

  useEffect(() => {
    if (activePage !== "discover") return;
    void loadDiscoverCommunities();
  }, [activePage, supabaseSession]);

  useEffect(() => {
    if (!supabaseSession || !activeCommunityId || activePage !== "community") return;
    void loadCommunityMembers(activeCommunityId, supabaseSession);
  }, [supabaseSession, activeCommunityId, activePage]);

  useEffect(() => {
    if (!supabaseSession || !activeCommunityId || communityTab !== "library") return;
    void loadArtifacts(activeCommunityId, supabaseSession);
  }, [supabaseSession, activeCommunityId, communityTab]);

  useEffect(() => {
    if (!supabaseSession || !selectedArtifactId || communityTab !== "library") return;
    void loadArtifactVersions(selectedArtifactId, supabaseSession);
  }, [supabaseSession, selectedArtifactId, communityTab]);

	  // Smart auto-scroll: only scroll to bottom if user is already near bottom
	  useEffect(() => {
	    if (!communityChatListRef.current || !isUserAtBottom) return;
	    communityChatListRef.current.scrollTo({
	      top: communityChatListRef.current.scrollHeight,
	      behavior: "smooth"
	    });
	  }, [communityMessages, isUserAtBottom]);

	  useLayoutEffect(() => {
	    const pending = pendingChatPrependScrollRef.current;
	    if (!pending) return;
	    const container = communityChatListRef.current;
	    if (!container) return;
	    const delta = container.scrollHeight - pending.prevScrollHeight;
	    container.scrollTop = pending.prevScrollTop + delta;
	    pendingChatPrependScrollRef.current = null;
	  }, [communityMessages]);

	  // Track if user has scrolled up
	  const handleChatScroll = () => {
	    if (!communityChatListRef.current) return;
	    const { scrollTop, scrollHeight, clientHeight } = communityChatListRef.current;
	    const atBottom = scrollHeight - scrollTop <= clientHeight + 100;
	    setIsUserAtBottom(atBottom);
	    isUserAtBottomRef.current = atBottom;
	    // Reset unread count when scrolled to bottom
	    if (atBottom) setUnreadCount(0);

	    const nearTop = scrollTop <= COMMUNITY_CHAT_LOAD_MORE_THRESHOLD_PX;
	    if (
	      nearTop &&
	      !atBottom &&
	      supabaseSession &&
	      activeCommunityId &&
	      communityTab === "chat" &&
	      communityChatHasMore &&
	      !isLoadingChat &&
	      !isLoadingMoreChat
	    ) {
	      void loadOlderCommunityChat(activeCommunityId, supabaseSession);
	    }
	  };

  // Workspace auto-scroll: scroll to bottom when new messages/tool calls/streaming content arrive
  // Also handles thread transitions (isLoadingThreadRef) to ensure we start at bottom
  // Use requestAnimationFrame to ensure DOM has painted before reading scrollHeight
  useEffect(() => {
    const isThreadLoad = isLoadingThreadRef.current;
    // Scroll if auto-scroll is enabled OR if we're loading a new thread
    if (!autoScrollEnabledRef.current && !isThreadLoad) return;

    const raf = requestAnimationFrame(() => {
      if (!workspaceMessageListRef.current) return;
      // Re-check conditions inside RAF (state may have changed)
      if (!autoScrollEnabledRef.current && !isLoadingThreadRef.current) return;

      workspaceMessageListRef.current.scrollTo({
        top: workspaceMessageListRef.current.scrollHeight,
        behavior: "instant"
      });

      // After thread load scroll completes, clear the loading flag and ensure correct state
      if (isLoadingThreadRef.current) {
        // Update lastScrollTop to current position to prevent false "scrolled up" detection
        lastWorkspaceScrollTopRef.current = workspaceMessageListRef.current.scrollTop;
        isLoadingThreadRef.current = false;
        setIsWorkspaceAtBottom(true);
        autoScrollEnabledRef.current = true;
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [messages, toolCalls, streamingContent]);

  // Track workspace scroll position
  const handleWorkspaceScroll = () => {
    if (!workspaceMessageListRef.current) return;
    // Ignore scroll events during thread transitions to prevent race conditions
    if (isLoadingThreadRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = workspaceMessageListRef.current;

    // If content doesn't overflow, always consider "at bottom" (nothing to scroll to)
    const hasScrollableContent = scrollHeight > clientHeight + 1;
    if (!hasScrollableContent) {
      setIsWorkspaceAtBottom(true);
      autoScrollEnabledRef.current = true;
      return;
    }

    const atBottom = scrollHeight - scrollTop <= clientHeight + 24;

    const prevScrollTop = lastWorkspaceScrollTopRef.current;
    lastWorkspaceScrollTopRef.current = scrollTop;
    const scrolledUp = scrollTop < prevScrollTop - 2;

    // If the user scrolls up even slightly, pause auto-scroll immediately (ChatGPT-style).
    if (scrolledUp) {
      autoScrollEnabledRef.current = false;
      setIsWorkspaceAtBottom(false);
      return;
    }

    setIsWorkspaceAtBottom(atBottom);
    // Re-enable auto-scroll automatically when the user returns to the bottom.
    autoScrollEnabledRef.current = atBottom;
  };

  useEffect(() => {
    if (!supabaseSession || !activeCommunityId || communityTab !== "chat") {
      if (communitySocketRef.current) {
        communitySocketRef.current.close();
        communitySocketRef.current = null;
      }
      if (communityHeartbeatRef.current) {
        window.clearInterval(communityHeartbeatRef.current);
        communityHeartbeatRef.current = null;
      }
      return;
    }

    const url = getSupabaseUrl();
    const apiKey = getSupabaseAnonKey();
    if (!url || !apiKey) return;

    const wsUrl = `${url.replace("https://", "wss://").replace("http://", "ws://")}/realtime/v1/websocket?apikey=${apiKey}&vsn=1.0.0`;
    const socket = new WebSocket(wsUrl);
    communitySocketRef.current = socket;
    const joinRef = `${Date.now()}`;
    const topic = "realtime:public:community_chat_messages";

    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          topic,
          event: "phx_join",
          payload: {
            config: {
              broadcast: { ack: false },
              postgres_changes: [
                {
                  event: "INSERT",
                  schema: "public",
                  table: "community_chat_messages",
                  filter: `community_id=eq.${activeCommunityId}`
                }
              ]
            },
            access_token: supabaseSession.access_token
          },
          ref: joinRef
        })
      );

      communityHeartbeatRef.current = window.setInterval(() => {
        if (socket.readyState !== WebSocket.OPEN) return;
        socket.send(
          JSON.stringify({
            topic: "phoenix",
            event: "heartbeat",
            payload: {},
            ref: `${Date.now()}`
          })
        );
      }, 25000);
    });

    socket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data) as {
          event?: string;
          payload?: Record<string, unknown>;
        };

        if (data.event !== "postgres_changes") return;
        const payload = data.payload as {
          eventType?: string;
          new?: CommunityChatMessage;
          record?: CommunityChatMessage;
          data?: { new?: CommunityChatMessage; record?: CommunityChatMessage };
        };
        const record =
          payload.new ??
          payload.record ??
          payload.data?.new ??
          payload.data?.record;
        if (!record) return;
        if (record.community_id !== activeCommunityId) return;
        setCommunityMessages((prev) => {
          if (prev.some((item) => item.id === record.id)) return prev;
          const next = [...prev, record];
          next.sort((a, b) => a.created_at.localeCompare(b.created_at));
          return next;
        });
        // Increment unread count only when the user isn't at bottom.
        if (record.sender_id !== supabaseSession?.user.id && !isUserAtBottomRef.current) {
          setUnreadCount((prev) => prev + 1);
        }
      } catch {
        // Ignore malformed payloads
      }
    });

    socket.addEventListener("close", () => {
      if (communityHeartbeatRef.current) {
        window.clearInterval(communityHeartbeatRef.current);
        communityHeartbeatRef.current = null;
      }
    });

    return () => {
      socket.close();
      if (communityHeartbeatRef.current) {
        window.clearInterval(communityHeartbeatRef.current);
        communityHeartbeatRef.current = null;
      }
    };
  }, [supabaseSession, activeCommunityId, communityTab]);

  useEffect(() => {
    toolCallsRef.current = toolCalls;
  }, [toolCalls]);

  useEffect(() => {
    activeModelIdRef.current = activeModelId;
  }, [activeModelId]);

  useEffect(() => {
    void invoke<ToolUiSpec[]>("list_tools_cmd")
      .then((tools) => {
        const next: Record<string, ToolUiSpec> = {};
        for (const tool of tools) {
          next[tool.name] = tool;
        }
        setToolSpecsByName(next);
      })
      .catch(() => {
        // Non-fatal: tool metadata is used only for nicer UI labels.
      });
  }, []);

  useEffect(() => {
    if (!activeThreadId) return;
    void invoke<string>("get_agent_mode_cmd", { sessionId: activeThreadId })
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
  }, [activeThreadId]);

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

  useEffect(() => {
    // Stream model output updates into the chat UI.
    const unlistenAgent = listen<{ session_id: string }>(
      "agent-turn-finished",
      async (event) => {
        if (!event.payload.session_id) return;
        // Cancel any pending RAF and clear refs
        if (streamingRafRef.current !== null) {
          cancelAnimationFrame(streamingRafRef.current);
          streamingRafRef.current = null;
        }
        streamingContentRef.current = null;
        streamingTokensRef.current = null;
        streamingMetaRef.current = null;
        // Load messages first, then clear streaming to avoid flicker
        await loadMessages(event.payload.session_id);
        setStreamingContent(null);
        setStreamingMeta(null);
      }
    );

    const unlistenStream = listen<{ session_id: string; chunk: string; full_content: string }>(
      "agent-stream",
      (event) => {
        if (event.payload.session_id !== activeThreadId) return;
        // Use throttled updates to avoid React batching all updates together
        streamingContentRef.current = event.payload.full_content;
        scheduleStreamingUpdate();
      }
    );

    const unlistenOpenRouterStream = listen<OpenRouterStreamPayload>(
      "openrouter-stream",
      (event) => {
        if (event.payload.session_id !== activeThreadId) return;
        // Use throttled updates to ensure smooth token-by-token streaming
        streamingContentRef.current = event.payload.full_content;
        streamingTokensRef.current = {
          prompt_tokens: event.payload.prompt_tokens ?? undefined,
          completion_tokens: event.payload.completion_tokens ?? undefined,
          max_tokens: event.payload.max_tokens
        };
        streamingMetaRef.current = {
          engine_id: event.payload.engine_id,
          model_id: event.payload.model_id
        };
        scheduleStreamingUpdate();
      }
    );

    const unlistenOpenRouterDone = listen<SessionIdPayload>(
      "openrouter-turn-finished",
      async (event) => {
        if (event.payload.session_id !== activeThreadId) return;
        // Cancel any pending RAF and clear refs
        if (streamingRafRef.current !== null) {
          cancelAnimationFrame(streamingRafRef.current);
          streamingRafRef.current = null;
        }
        streamingContentRef.current = null;
        streamingTokensRef.current = null;
        streamingMetaRef.current = null;
        await loadMessages(event.payload.session_id);
        setStreamingContent(null);
        setStreamingTokens(null);
        setStreamingMeta(null);
      }
    );
    const unlistenMemory = listen<{ session_id: string; label: string; scope: string }>(
      "memory-updated",
      (event) => {
        if (event.payload.session_id !== activeThreadId) return;
        const label = event.payload.label?.trim() || "memory";
        const scope = event.payload.scope?.trim();
        const message = scope ? `Memory updated: ${label} (${scope})` : `Memory updated: ${label}`;
        setMemoryToast(message);
        if (memoryToastTimeoutRef.current) {
          window.clearTimeout(memoryToastTimeoutRef.current);
        }
        memoryToastTimeoutRef.current = window.setTimeout(() => {
          setMemoryToast(null);
        }, 2000);
      }
    );

    const unlistenPlan = listen<{ session_id: string; args: TaskPlanPayload }>(
      "plan-updated",
      (event) => {
        if (event.payload.session_id !== activeThreadId) return;
        setTaskPlan(event.payload.args);
      }
    );

    const unlistenToolCallsUpdated = listen<{ session_id: string }>(
      "tool-calls-updated",
      async (event) => {
        if (event.payload.session_id !== activeThreadId) return;
        await loadToolCalls(event.payload.session_id);
      }
    );

    const unlistenToolApproval = listen<ToolApprovalRequestedPayload>(
      "tool-approval-requested",
      (event) => {
        if (event.payload.session_id !== activeThreadId) return;
        setIsToolApprovalSubmitting(false);
        setPendingToolApproval(event.payload);
      }
    );

    const unlistenAgentStatus = listen<AgentStatusPayload>(
      "agent-status",
      (event) => {
        if (event.payload.session_id !== activeThreadId) return;
        if (event.payload.status === "idle") {
          setAgentStatus(null);
          setRunningTools([]);
        } else {
          setAgentStatus(event.payload);
        }
      }
    );

    const unlistenToolProgress = listen<ToolCallProgressPayload>(
      "tool-call-progress",
      (event) => {
        if (event.payload.session_id !== activeThreadId) return;
        if (event.payload.status === "started") {
          setRunningTools((prev) => [
            ...prev,
            {
              id: event.payload.tool_call_id,
              name: event.payload.tool_name,
              preview: event.payload.tool_args_preview,
              status: "running",
            },
          ]);
        } else if (event.payload.status === "finished") {
          setRunningTools((prev) =>
            prev.map((tool) =>
              tool.id === event.payload.tool_call_id
                ? { ...tool, status: event.payload.result === "ok" ? "ok" : "error" }
                : tool
            )
          );
        }
      }
    );

    const unlistenOpenedUrls = listen<OpenedUrlsPayload>(
      "app-opened-urls",
      async (event) => {
        const urls = event.payload.urls ?? [];
        if (urls.length === 0) return;

        let newestInvite: string | null = null;
        for (const raw of urls) {
          let parsed: URL;
          try {
            parsed = new URL(raw);
          } catch {
            continue;
          }
          const inviteKey = parsed.searchParams.get("invite") ?? parsed.searchParams.get("join");
          if (!inviteKey) continue;

          const normalized = normalizeInviteCode(inviteKey);
          if (!normalized) continue;

          newestInvite = normalized;
          try {
            await invoke("upsert_pending_invite_cmd", { inviteKey: normalized, source: "url" });
          } catch {
            // ignore
          }
        }

        if (!newestInvite) return;
        await loadPendingInvites();
        setActivePage("workspace");
        setActiveView("home");
        setActiveInviteGateKey(newestInvite);
      }
    );

    return () => {
      // Cancel any pending streaming RAF
      if (streamingRafRef.current !== null) {
        cancelAnimationFrame(streamingRafRef.current);
        streamingRafRef.current = null;
      }
      streamingContentRef.current = null;
      streamingTokensRef.current = null;
      void unlistenAgent.then((fn) => fn());
      void unlistenStream.then((fn) => fn());
      void unlistenOpenRouterStream.then((fn) => fn());
      void unlistenOpenRouterDone.then((fn) => fn());
      void unlistenMemory.then((fn) => fn());
      void unlistenPlan.then((fn) => fn());
      void unlistenToolCallsUpdated.then((fn) => fn());
      void unlistenToolApproval.then((fn) => fn());
      void unlistenAgentStatus.then((fn) => fn());
      void unlistenToolProgress.then((fn) => fn());
      void unlistenOpenedUrls.then((fn) => fn());
      if (memoryToastTimeoutRef.current) {
        window.clearTimeout(memoryToastTimeoutRef.current);
        memoryToastTimeoutRef.current = null;
      }
    };
  }, [activeThreadId, scheduleStreamingUpdate]);

  useEffect(() => {
    const handleGlobalEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;
      if (activePage !== "workspace") return;
      if (!activeThreadId) return;

      // If the slash menu is active, let the input handler consume Escape.
      if (slashState.query !== null) return;

      const cancelActiveRun = () => {
        setPendingToolApproval(null);
        void invoke<boolean>("cancel_run_cmd", { threadId: activeThreadId }).catch(() => {
          // best-effort
        });
      };

      // Cancel a running tool call if present, otherwise cancel the agent turn.
      if (runningToolCallId) {
        event.preventDefault();
        setRunningToolCallId(null);
        cancelActiveRun();
        return;
      }

      if (pendingToolApproval) {
        event.preventDefault();
        cancelActiveRun();
        return;
      }

      if (isSending || streamingContent) {
        event.preventDefault();
        cancelActiveRun();
      }
    };

    window.addEventListener("keydown", handleGlobalEscape);
    return () => window.removeEventListener("keydown", handleGlobalEscape);
  }, [
    activePage,
    activeThreadId,
    isSending,
    pendingToolApproval,
    runningToolCallId,
    slashState.query,
    streamingContent,
  ]);

  useEffect(() => {
    if (!activeThreadId) {
      setAutoApproveWriteEdit(false);
      return;
    }
    void invoke<boolean>("get_auto_approve_write_edit_cmd", { threadId: activeThreadId })
      .then((value) => setAutoApproveWriteEdit(Boolean(value)))
      .catch(() => setAutoApproveWriteEdit(false));
  }, [activeThreadId]);

  async function loadThreads() {
    try {
      const data = await invoke<ThreadRecord[]>("list_threads_cmd");
      const visible = data.filter((t) => t.id !== "system" && t.engine_id !== "system");
      setThreads(visible);
      if (!activeThreadId && visible.length > 0) {
        setActiveThreadId(visible[0].id);
      }
    } catch (error) {
      console.error("Failed to load threads:", error);
      setThreads([]);
    }
  }

  async function loadToolCalls(_sessionId: string) {
    setToolCalls([]);
  }

	  async function loadMessages(sessionId: string) {
	    const buildAgentToolCallsFromEvents = (events: EventRecord[]): ToolCallRecord[] => {
	      type AgentToolCallState = {
	        id: string;
	        session_id: string;
	        run_id: string | null;
	        tool_name: string;
	        args: unknown;
	        status: "requested" | "approved" | "denied" | "started" | "finished";
	        created_at: number;
	        updated_at: number;
        approved_by?: string | null;
        note?: string | null;
        exec_status?: string | null;
        reason?: string | null;
        exit_code?: number | null;
        result_preview?: string | null;
        artifacts?: unknown[] | null;
      };

      const states = new Map<string, AgentToolCallState>();
	      const ensure = (
	        toolCallId: string,
	        init: Omit<AgentToolCallState, "status" | "updated_at"> & {
	          status?: AgentToolCallState["status"];
	          updated_at?: number;
	        }
	      ): AgentToolCallState => {
	        const existing = states.get(toolCallId);
	        if (existing) return existing;
	        const state: AgentToolCallState = {
	          id: init.id,
	          session_id: init.session_id,
	          run_id: init.run_id,
	          tool_name: init.tool_name,
	          args: init.args,
	          status: init.status ?? "requested",
	          created_at: init.created_at,
          updated_at: init.updated_at ?? init.created_at,
          approved_by: null,
          note: null,
          exec_status: null,
          reason: null,
          exit_code: null,
          result_preview: null,
          artifacts: null,
        };
        states.set(toolCallId, state);
        return state;
      };

	      for (const evt of events) {
	        const evtType = (evt.type ?? "").trim();
	        if (!evtType.startsWith("tool_call_")) continue;
	        if (!evt.payload_json) continue;
	        let payload: any = null;
	        try {
	          payload = JSON.parse(evt.payload_json);
	        } catch {
	          continue;
	        }
	        const toolCallId: string | null = typeof payload?.tool_call_id === "string" ? payload.tool_call_id : null;
	        if (!toolCallId) continue;
	        const runId: string | null = typeof payload?.run_id === "string" ? payload.run_id : null;

	        if (evtType === "tool_call_requested") {
	          const toolName = typeof payload?.tool_name === "string" ? payload.tool_name : "tool";
	          const args = payload?.args ?? {};
	          ensure(toolCallId, {
	            id: toolCallId,
	            session_id: evt.thread_id,
	            run_id: runId,
	            tool_name: toolName,
	            args,
	            status: "requested",
	            created_at: evt.created_at,
            updated_at: evt.created_at,
          });
          continue;
        }

	        const state = ensure(toolCallId, {
	          id: toolCallId,
	          session_id: evt.thread_id,
	          run_id: runId,
	          tool_name: "tool",
	          args: {},
	          status: "requested",
	          created_at: evt.created_at,
	        });
	        state.updated_at = evt.created_at;
	        if (!state.run_id && runId) state.run_id = runId;

        if (evtType === "tool_call_approved") {
          state.status = "approved";
          state.approved_by = typeof payload?.approved_by === "string" ? payload.approved_by : null;
          state.note = typeof payload?.note === "string" ? payload.note : null;
        } else if (evtType === "tool_call_denied") {
          state.status = "denied";
          state.approved_by = typeof payload?.approved_by === "string" ? payload.approved_by : null;
          state.note = typeof payload?.note === "string" ? payload.note : null;
        } else if (evtType === "tool_call_started") {
          state.status = "started";
        } else if (evtType === "tool_call_finished") {
          state.status = "finished";
          state.exec_status = typeof payload?.status === "string" ? payload.status : null;
          state.reason = typeof payload?.reason === "string" ? payload.reason : null;
          state.exit_code = typeof payload?.exit_code === "number" ? payload.exit_code : null;
          state.result_preview = typeof payload?.result_preview === "string" ? payload.result_preview : null;
          state.artifacts = Array.isArray(payload?.artifacts) ? payload.artifacts : null;
        }
      }

	      const out: ToolCallRecord[] = [];
	      for (const state of states.values()) {
	        const summary = {
	          approved_by: state.approved_by,
	          note: state.note,
	          exec_status: state.exec_status,
	          reason: state.reason,
	          artifacts: state.artifacts,
	        };
	        out.push({
	          id: state.id,
	          session_id: state.session_id,
	          run_id: state.run_id,
	          tool_name: state.tool_name,
	          args_json: JSON.stringify(state.args ?? {}),
	          status: state.status,
	          stdout_excerpt: state.result_preview,
          stderr_excerpt: state.exec_status === "error" ? state.reason : null,
          exit_code: state.exit_code,
          output_summary_json: JSON.stringify(summary),
          created_at: state.created_at,
          updated_at: state.updated_at,
        });
      }
      out.sort((a, b) => a.created_at - b.created_at);
      return out;
    };

    const eventToMessage = (evt: EventRecord): MessageRecord | null => {
      const evtType = (evt.type ?? "").trim();
      const role =
        evtType === "user_message" ? "user" : evtType === "assistant_message" ? "assistant" : null;
      if (!role) return null;

      let contentJson: string | null = null;
      let engineId: string | null = null;
      let modelId: string | null = null;
      let runId: string | null = null;
      if (evt.payload_json) {
        try {
          const parsed = JSON.parse(evt.payload_json) as { content?: unknown; meta?: unknown };
          if (parsed && typeof parsed === "object" && "content" in parsed) {
            contentJson = JSON.stringify((parsed as { content: unknown }).content ?? { text: evt.text ?? "" });
          }
          const meta = (parsed as { meta?: unknown }).meta;
          if (meta && typeof meta === "object") {
            const metaObj = meta as { engine_id?: unknown; model_id?: unknown; run_id?: unknown };
            engineId = typeof metaObj.engine_id === "string" ? metaObj.engine_id : null;
            modelId = typeof metaObj.model_id === "string" ? metaObj.model_id : null;
            runId = typeof metaObj.run_id === "string" ? metaObj.run_id : null;
          }
        } catch {
          // ignore
        }
      }
      if (!contentJson) {
        contentJson = JSON.stringify({ text: evt.text ?? "" });
      }

      return {
        id: evt.id,
        session_id: evt.thread_id,
        role,
        content_json: contentJson,
        created_at: evt.created_at,
        engine_id: engineId,
        model_id: modelId,
        run_id: runId
      };
    };

    try {
      const events = await invoke<EventRecord[]>("list_events_cmd", {
        threadId: sessionId,
        limit: 2000
      });
      const mapped = events.map(eventToMessage).filter(Boolean) as MessageRecord[];
      if (mapped.length > 0) {
        setMessages(mapped);
        setToolCalls(buildAgentToolCallsFromEvents(events));
        return;
      }
    } catch {
      // Fallback for older builds/DBs.
    }

    const data = await invoke<MessageRecord[]>("list_messages_cmd", {
      sessionId
    });
    setMessages(data);
    setToolCalls([]);
  }

  async function loadTurns(sessionId: string) {
    try {
      const turns = await invoke<TurnRecord[]>("list_turns_cmd", {
        threadId: sessionId,
        limit: 500
      });
      const map: Record<string, TurnRecord> = {};
      for (const turn of turns) {
        if (turn.assistant_event_id) {
          map[turn.assistant_event_id] = turn;
        }
      }
      setTurnsByAssistantEventId(map);
    } catch (error) {
      console.error(error);
      setTurnsByAssistantEventId({});
    }
  }

  async function loadSessionResume(sessionId: string) {
    try {
      const data = await invoke<SessionResume>("get_session_resume_cmd", {
        sessionId
      });
      setSessionResume(data);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadModelToggles() {
    try {
      const data = await invoke<ModelToggle[]>("get_model_toggles_cmd");
      setModelToggles(data);
    } catch (error) {
      console.error(error);
      setModelToggles(DEFAULT_MODEL_TOGGLES);
    }
  }

  async function loadActiveModel() {
    const modelId = await invoke<string | null>("get_active_model_cmd");
    setActiveModelId(modelId);
  }

  async function loadProviderKeys() {
    const updated = await Promise.all(
      providerKeys.map(async (provider) => {
        const hasKey = await invoke<boolean>("has_provider_key_cmd", {
          provider: provider.id
        });
        return { ...provider, hasKey, error: null };
      })
    );
    setProviderKeys(updated);
  }

  async function refreshModelAvailability() {
    if (!providerKeys[0]?.hasKey) {
      setModelAvailability({});
      return;
    }
    try {
      const data = await invoke<ModelAvailability[]>("refresh_openrouter_models_cmd");
      const byId: Record<string, boolean> = {};
      for (const item of data) {
        byId[item.id] = item.available;
      }
      setModelAvailability(byId);
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    if (activeView !== "settings") return;
    if (settingsPage !== "models") return;
    if (!providerKeys[0]?.hasKey) return;
    void refreshModelAvailability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, settingsPage, providerKeys[0]?.hasKey]);

  useEffect(() => {
    if (!providerKeys[0]?.hasKey) return;
    void refreshModelAvailability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerKeys[0]?.hasKey]);

function isModelReady(modelId: string): boolean {
  if (!providerKeys[0]?.hasKey) return false;
  const available = modelAvailability[modelId];
  return available !== false;
}

  async function loadExecPolicyRules() {
    try {
      const value = await invoke<string | null>("get_exec_policy_rules_cmd");
      setExecPolicyRules(value ?? "prompt");
    } catch (error) {
      console.error(error);
    }
  }

  async function loadApprovalMode() {
    try {
      const value = await invoke<string | null>("get_approval_mode_cmd");
      if (value === "read-only" || value === "agent" || value === "agent-full") {
        setApprovalMode(value);
      } else {
        setApprovalMode("agent");
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function loadSessionExecPolicyRules(sessionId: string) {
    try {
      const value = await invoke<string | null>("get_session_exec_policy_rules_cmd", {
        sessionId
      });
      setSessionExecPolicyRules(value ?? "");
    } catch (error) {
      console.error(error);
    }
  }

  async function handleSaveExecPolicyRules() {
    setIsSavingExecPolicy(true);
    setExecPolicyError(null);
    try {
      await invoke("set_exec_policy_rules_cmd", { rules: execPolicyRules });
    } catch (error) {
      setExecPolicyError(
        typeof error === "string" ? error : error instanceof Error ? error.message : "Failed to save rules"
      );
    } finally {
      setIsSavingExecPolicy(false);
    }
  }

  async function handleSaveSessionExecPolicyRules() {
    if (!activeThreadId) return;
    setIsSavingSessionExecPolicy(true);
    setSessionExecPolicyError(null);
    try {
      await invoke("set_session_exec_policy_rules_cmd", {
        sessionId: activeThreadId,
        rules: sessionExecPolicyRules
      });
    } catch (error) {
      setSessionExecPolicyError(
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to save session rules"
      );
    } finally {
      setIsSavingSessionExecPolicy(false);
    }
  }

  useEffect(() => {
    if (!activeThreadId) return;
    const run = async () => {
      const next: Record<
        string,
        { decision: "allow" | "prompt" | "forbid"; reason: string; matched_rule?: string | null }
      > = {};
      for (const toolCall of toolCalls) {
        const details = parseToolCall(toolCall);
        if (details.toolName !== "run_shell_command") {
          continue;
        }
        if (!details.command.trim()) {
          continue;
        }
        try {
          const result = await invoke<{
            decision: "allow" | "prompt" | "forbid";
            reason: string;
            matched_rule?: string | null;
          }>("classify_command_cmd", {
            sessionId: activeThreadId,
            command: details.command
          });
          next[toolCall.id] = result;
        } catch (error) {
          console.error(error);
        }
      }
      setPolicyByToolCallId(next);
    };
    void run();
  }, [activeThreadId, execPolicyRules, sessionExecPolicyRules, toolCalls]);

  // Auto-execute tool calls when policy decision is "allow" or read_file within workspace
  useEffect(() => {
    if (!activeThreadId) return;
    const autoExecute = async () => {
      for (const toolCall of toolCalls) {
        // Skip if not proposed or already auto-executed
        if (toolCall.status !== "proposed") continue;
        if (autoExecutedToolCallsRef.current.has(toolCall.id)) continue;
        // Skip if another tool is running
        if (runningToolCallId) continue;

        const details = parseToolCall(toolCall);

        // Auto-execute read_file within workspace (always allowed, no policy check needed)
        if (details.toolName === "read_file") {
          const filePath = details.path ?? "";
          // Check if path is within workspace using backend's canonicalized check
          let isWithinWorkspace = false;
          try {
            isWithinWorkspace = await invoke<boolean>("is_path_within_workspace_cmd", { path: filePath });
          } catch {
            // If check fails (e.g., workspace not set), don't auto-execute
            isWithinWorkspace = false;
          }
          if (isWithinWorkspace) {
            autoExecutedToolCallsRef.current.add(toolCall.id);
            try {
              await runToolCallThroughBackend(toolCall);
            } catch (error) {
              console.error("Auto-execute read_file failed:", error);
            }
            break;
          }
          // If not within workspace, skip (require manual approval)
          continue;
        }

        // Only auto-execute run_shell_command (not apply_patch or future tools)
        if (details.toolName !== "run_shell_command") continue;
        // Check policy
        const policy = policyByToolCallId[toolCall.id];
        if (!policy || policy.decision !== "allow") continue;
        // Mark as auto-executed to avoid re-running
        autoExecutedToolCallsRef.current.add(toolCall.id);
        try {
          await runToolCallThroughBackend(toolCall);
        } catch (error) {
          console.error("Auto-execute failed:", error);
        }
        // Only run one at a time
        break;
      }
    };
    void autoExecute();
  }, [activeThreadId, toolCalls, policyByToolCallId, runningToolCallId]);

  async function loadSupabaseSession() {
    let stored: string | null = null;
    try {
      stored = await invoke<string | null>("get_supabase_session_cmd");
    } catch {
      stored = null;
    }

    // Legacy migration: move any localStorage session into the OS keychain.
    if (!stored) {
      const legacy = localStorage.getItem("arx_supabase_session");
      if (legacy) {
        stored = legacy;
        try {
          await invoke("set_supabase_session_cmd", { sessionJson: legacy });
          localStorage.removeItem("arx_supabase_session");
        } catch {
          // Keep legacy storage if keychain write fails, but don't crash.
        }
      }
    }

    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as SupabaseSession;
      const refreshed = await ensureFreshSession(parsed);
      if (!refreshed) return;
      setSupabaseSession(refreshed);
      try {
        await invoke("set_supabase_session_cmd", { sessionJson: JSON.stringify(refreshed) });
      } catch {
        // If keychain write fails, keep session in memory only.
      }
    } catch {
      try {
        await invoke("clear_supabase_session_cmd");
      } catch {
        // ignore
      }
      localStorage.removeItem("arx_supabase_session");
    }
  }

  async function loadPendingInvites() {
    try {
      const invites = await invoke<PendingInviteRecord[]>("list_pending_invites_cmd");
      setPendingInvites(invites);
    } catch {
      // Non-fatal; keep any in-memory state.
    }
  }

  async function consumeInviteQueryParam() {
    const params = new URLSearchParams(window.location.search);
    const inviteKey = params.get("invite") ?? params.get("join");
    if (!inviteKey) return;

    const normalized = normalizeInviteCode(inviteKey);
    try {
      await invoke("upsert_pending_invite_cmd", { inviteKey: normalized, source: "url" });
    } catch {
      // ignore
    }

    await loadPendingInvites();

    params.delete("invite");
    params.delete("join");
    const nextQuery = params.toString();
    const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
    window.history.replaceState({}, document.title, nextUrl);
  }

  function formatInviteLabel(inviteKey: string, communityName?: string | null): string {
    const cleaned = (communityName ?? "").trim();
    return cleaned ? cleaned : inviteKey;
  }

  function normalizeInviteCode(inviteKey: string): string {
    return inviteKey.trim().replace(/\s+/g, "").toUpperCase();
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

  function buildInviteLink(community: CommunityRecord | null, inviteCode: string): string | null {
    const base = getPublicShareBaseUrl();
    if (!base) return null;
    const code = encodeURIComponent(normalizeInviteCode(inviteCode));
    const communityPath = community?.id ? `/c/${encodeURIComponent(community.id)}` : "";
    return `${base}${communityPath}?invite=${code}`;
  }

  function buildDeepInviteLink(inviteCode: string): string {
    const code = encodeURIComponent(normalizeInviteCode(inviteCode));
    return `arx://join?invite=${code}`;
  }

  function buildBestInviteLink(
    community: CommunityRecord | null,
    inviteCode: string
  ): { kind: "web" | "app"; link: string } {
    const web = buildInviteLink(community, inviteCode);
    if (web) return { kind: "web", link: web };
    return { kind: "app", link: buildDeepInviteLink(inviteCode) };
  }

  async function joinCommunityForInviteKey(
    inviteKey: string,
    session: SupabaseSession,
  ): Promise<CommunityRecord> {
    const url = getSupabaseUrl();
    if (!url) throw new Error("Missing Supabase URL.");
    const key = normalizeInviteCode(inviteKey);
    if (!key) throw new Error("Invite code is required.");

    let response: Response;
    try {
      response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/accept_community_invite`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ invite_code: key })
        },
        session
      );
    } catch {
      throw new Error("Failed to reach Supabase.");
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Failed to join community.");
    }
    const rows = (await response.json()) as Array<{
      community_id: string;
      community_slug: string;
      community_name: string;
      role: string;
      tier_id: string | null;
    }>;
    const first = rows[0];
    if (!first) throw new Error("Failed to join community.");

    // Best-effort entitlement grant (some deployments use entitlements for RLS).
    try {
      await fetchWithSupabaseAuth(
        `${url}/rest/v1/entitlements`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            user_id: session.user.id,
            community_id: first.community_id,
            role: first.role ?? "member",
            tier_id: first.tier_id ?? "member",
            source: "invite",
            status: "active",
            starts_at: new Date().toISOString()
          })
        },
        session
      );
    } catch {
      // ignore
    }

    return { id: first.community_id, slug: first.community_slug, name: first.community_name };
  }

  async function handleDismissInvite(inviteKey: string) {
    setInviteJoinError(null);
    try {
      await invoke("dismiss_pending_invite_cmd", { inviteKey });
      await loadPendingInvites();
    } catch {
      // ignore
    }
  }

  async function handleJoinInvite(inviteKey: string) {
    const cleaned = normalizeInviteCode(inviteKey);
    if (!cleaned) {
      setInviteJoinError("Invite code is required.");
      return;
    }
    setInviteJoinError(null);

    if (!supabaseSession) {
      try {
        await invoke("request_join_pending_invite_cmd", { inviteKey: cleaned });
        await loadPendingInvites();
      } catch {
        // ignore
      }
      await handleSignIn();
      return;
    }

    setIsJoiningInvite(true);
    try {
      await invoke("upsert_pending_invite_cmd", { inviteKey: cleaned, source: "manual" });
      await loadPendingInvites();

      const joined = await joinCommunityForInviteKey(cleaned, supabaseSession);
      await invoke("mark_pending_invite_joined_cmd", {
        inviteKey: cleaned,
        communityId: joined.id,
        communityName: joined.name
      });
      await loadPendingInvites();

      await loadCommunities(supabaseSession);
      setActiveCommunityId(joined.id);
      setActivePage("community");
      setCommunityTab("chat");
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to join community.";
      setInviteJoinError(message);
    } finally {
      setIsJoiningInvite(false);
    }
  }

  async function handleInviteGateJoin() {
    if (!activeInviteGateKey) return;
    const key = activeInviteGateKey;
    setActiveInviteGateKey(null);
    await handleJoinInvite(key);
  }

  async function handleInviteGateDismiss() {
    if (!activeInviteGateKey) return;
    const key = activeInviteGateKey;
    setActiveInviteGateKey(null);
    await handleDismissInvite(key);
  }

  async function maybeAutoJoinPendingInvites(session: SupabaseSession) {
    let invites: PendingInviteRecord[] = [];
    try {
      invites = await invoke<PendingInviteRecord[]>("list_pending_invites_cmd");
      setPendingInvites(invites);
    } catch {
      invites = pendingInvites;
    }

    const candidates = invites
      .filter((invite) => invite.status === "pending" && Boolean(invite.join_intent_at))
      .sort((a, b) => (a.join_intent_at ?? 0) - (b.join_intent_at ?? 0));

    const next = candidates.find((invite) => !autoJoinInvitesAttemptedRef.current.has(invite.invite_key));
    if (!next) return;

    autoJoinInvitesAttemptedRef.current.add(next.invite_key);
    try {
      const joined = await joinCommunityForInviteKey(next.invite_key, session);
      await invoke("mark_pending_invite_joined_cmd", {
        inviteKey: next.invite_key,
        communityId: joined.id,
        communityName: joined.name
      });
      await loadPendingInvites();
      await loadCommunities(session);
      setActiveCommunityId(joined.id);
      setActivePage("community");
      setCommunityTab("chat");
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to join community.";
      setInviteJoinError(message);
    }
  }

  async function maybeAutoJoinPendingPublicCommunity(session: SupabaseSession) {
    let communityId: string | null = null;
    try {
      communityId = localStorage.getItem(PENDING_PUBLIC_JOIN_COMMUNITY_ID_KEY);
    } catch {
      communityId = null;
    }
    if (!communityId) return;
    const id = communityId.trim();
    if (!id) return;
    if (autoJoinPublicCommunitiesAttemptedRef.current.has(id)) return;
    autoJoinPublicCommunitiesAttemptedRef.current.add(id);

    const url = getSupabaseUrl();
    if (!url) return;

    setJoiningDiscoverCommunityId(id);
    setDiscoverError(null);
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/join_public_community`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ p_community_id: id })
        },
        session
      );
      if (!response.ok) {
        const message = await readSupabaseError(response);
        throw new Error(message);
      }
      const rows = (await response.json()) as Array<{
        community_id: string;
        community_slug: string;
        community_name: string;
        role: string;
        tier_id: string;
      }>;
      const first = rows[0];
      if (!first) throw new Error("Failed to join community.");

      try {
        await fetchWithSupabaseAuth(
          `${url}/rest/v1/entitlements`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              user_id: session.user.id,
              community_id: first.community_id,
              role: first.role ?? "member",
              tier_id: first.tier_id ?? "member",
              source: "public_join",
              status: "active",
              starts_at: new Date().toISOString()
            })
          },
          session
        );
      } catch {
        // ignore
      }

      try {
        localStorage.removeItem(PENDING_PUBLIC_JOIN_COMMUNITY_ID_KEY);
      } catch {
        // ignore
      }

      await loadCommunities(session);
      setActiveCommunityId(first.community_id);
      setActivePage("community");
      setCommunityTab("chat");
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to join community.";
      setDiscoverError(message);
    } finally {
      setJoiningDiscoverCommunityId(null);
    }
  }

  async function ensureFreshSession(session: SupabaseSession): Promise<SupabaseSession | null> {
    const now = Math.floor(Date.now() / 1000);
    if (session.expires_at > now + 60) {
      return session;
    }
    const refreshed = await refreshSupabaseSession(session.refresh_token);
    return refreshed;
  }

  async function refreshSupabaseSession(refreshToken: string): Promise<SupabaseSession | null> {
    const url = getSupabaseUrl();
    const apiKey = getSupabaseAnonKey();
    if (!url || !apiKey) return null;
    const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      user: SupabaseUser;
    };
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
      user: data.user
    };
  }

  async function persistSupabaseSession(session: SupabaseSession) {
    try {
      await invoke("set_supabase_session_cmd", { sessionJson: JSON.stringify(session) });
      localStorage.removeItem("arx_supabase_session");
    } catch {
      localStorage.setItem("arx_supabase_session", JSON.stringify(session));
    }
  }

  async function clearPersistedSupabaseSession() {
    try {
      await invoke("clear_supabase_session_cmd");
    } catch {
      // ignore
    }
    localStorage.removeItem("arx_supabase_session");
  }

  async function refreshSupabaseSessionLocked(refreshToken: string): Promise<SupabaseSession | null> {
    if (!refreshToken) return null;
    if (supabaseRefreshInFlightRef.current) {
      return await supabaseRefreshInFlightRef.current;
    }
    const promise = (async () => {
      const refreshed = await refreshSupabaseSession(refreshToken);
      if (!refreshed) return null;
      setAuthError(null);
      setSupabaseSession(refreshed);
      supabaseSessionRef.current = refreshed;
      await persistSupabaseSession(refreshed);
      return refreshed;
    })();
    supabaseRefreshInFlightRef.current = promise;
    try {
      return await promise;
    } finally {
      supabaseRefreshInFlightRef.current = null;
    }
  }

  async function ensureSupabaseSessionForRequest(
    session: SupabaseSession,
  ): Promise<SupabaseSession | null> {
    const now = Math.floor(Date.now() / 1000);
    if (session.expires_at > now + 60) return session;
    return await refreshSupabaseSessionLocked(session.refresh_token);
  }

  async function isSupabaseJwtExpired(response: Response): Promise<boolean> {
    if (response.ok) return false;
    if (response.status !== 401 && response.status !== 403) return false;
    try {
      const data = (await response.clone().json()) as { code?: unknown; message?: unknown };
      const code = typeof data?.code === "string" ? data.code : "";
      const message = typeof data?.message === "string" ? data.message : "";
      if (code === "PGRST303") return true;
      if (message.toLowerCase().includes("jwt expired")) return true;
    } catch {
      try {
        const text = await response.clone().text();
        if (text.toLowerCase().includes("jwt expired")) return true;
      } catch {
        // ignore
      }
    }
    return false;
  }

  function decodeJwtPayload(token: string): unknown | null {
    try {
      const parts = token.split(".");
      if (parts.length < 2) return null;
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
      const json = atob(padded);
      return JSON.parse(json) as unknown;
    } catch {
      return null;
    }
  }

  function getSupabaseAuthUid(session: SupabaseSession): string {
    const payload = decodeJwtPayload(session.access_token);
    const sub =
      payload && typeof payload === "object" && "sub" in payload && typeof (payload as any).sub === "string"
        ? String((payload as any).sub)
        : null;
    return sub ?? session.user.id;
  }

  async function readSupabaseError(response: Response): Promise<string> {
    try {
      const json = (await response.clone().json()) as { message?: unknown };
      if (typeof json?.message === "string" && json.message.trim()) return json.message;
    } catch {
      // ignore
    }
    try {
      const text = await response.clone().text();
      if (text.trim()) return text;
    } catch {
      // ignore
    }
    return `Supabase error (${response.status})`;
  }

  async function fetchWithSupabaseAuth(
    url: string,
    init: RequestInit,
    session: SupabaseSession,
  ): Promise<Response> {
    const apiKey = getSupabaseAnonKey();
    if (!apiKey) {
      throw new Error("Missing Supabase anon key.");
    }

    const baseSession = supabaseSessionRef.current ?? session;

    const ensureOrFail = async (current: SupabaseSession): Promise<SupabaseSession> => {
      const fresh = await ensureSupabaseSessionForRequest(current);
      if (fresh) return fresh;
      await clearPersistedSupabaseSession();
      setSupabaseSession(null);
      supabaseSessionRef.current = null;
      setAuthError("Session expired. Please sign in again.");
      throw new Error("Session expired. Please sign in again.");
    };

    const doFetch = async (current: SupabaseSession): Promise<Response> => {
      const headers = new Headers(init.headers);
      headers.set("apikey", apiKey);
      headers.set("Authorization", `Bearer ${current.access_token}`);
      return await fetch(url, { ...init, headers });
    };

    const fresh = await ensureOrFail(baseSession);
    const first = await doFetch(fresh);
    if (!(await isSupabaseJwtExpired(first))) return first;

    const refreshed = await refreshSupabaseSessionLocked(fresh.refresh_token);
    const latest = await ensureOrFail(refreshed ?? supabaseSessionRef.current ?? fresh);
    return await doFetch(latest);
  }

  async function fetchWithSupabasePublic(url: string, init: RequestInit = {}): Promise<Response> {
    const apiKey = getSupabaseAnonKey();
    if (!apiKey) throw new Error("Missing Supabase anon key.");
    const headers = new Headers(init.headers);
    headers.set("apikey", apiKey);
    // Use the anon JWT as the bearer token for PostgREST.
    headers.set("Authorization", `Bearer ${apiKey}`);
    return await fetch(url, { ...init, headers });
  }

  async function fetchSupabaseUser(accessToken: string): Promise<SupabaseUser | null> {
    const url = getSupabaseUrl();
    const apiKey = getSupabaseAnonKey();
    if (!url || !apiKey) return null;
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (!response.ok) return null;
    return (await response.json()) as SupabaseUser;
  }

  async function consumeOAuthHash() {
    if (!window.location.hash) return;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const expiresIn = hash.get("expires_in");
    if (!accessToken || !refreshToken || !expiresIn) return;
    const user = await fetchSupabaseUser(accessToken);
    if (!user) {
      setAuthError("Failed to load user profile.");
      return;
    }
    const session: SupabaseSession = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: Math.floor(Date.now() / 1000) + Number(expiresIn),
      user
    };
    try {
      await invoke("set_supabase_session_cmd", { sessionJson: JSON.stringify(session) });
      localStorage.removeItem("arx_supabase_session");
    } catch {
      // If keychain write fails (e.g., permissions), fall back to legacy localStorage.
      localStorage.setItem("arx_supabase_session", JSON.stringify(session));
	    }
	    setSupabaseSession(session);
	    // Preserve query params (e.g. invite codes) while clearing the OAuth hash.
	    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
	  }

  function getOAuthRedirectUrl(): string {
    return import.meta.env.VITE_SUPABASE_REDIRECT_URL ?? window.location.origin;
  }

  async function handleSignIn() {
    setAuthError(null);
    const url = getSupabaseUrl();
    const apiKey = getSupabaseAnonKey();
    if (!url || !apiKey) {
      setAuthError("Missing Supabase URL or anon key.");
      return;
    }
    const redirectTo = encodeURIComponent(getOAuthRedirectUrl());
    const authUrl = `${url}/auth/v1/authorize?provider=google&redirect_to=${redirectTo}`;
    window.location.assign(authUrl);
  }

  async function handleSignOut() {
    const url = getSupabaseUrl();
    const apiKey = getSupabaseAnonKey();
    const accessToken = supabaseSession?.access_token;
    if (url && apiKey && accessToken) {
      await fetch(`${url}/auth/v1/logout`, {
        method: "POST",
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${accessToken}`
        }
      });
    }
    try {
      await invoke("clear_supabase_session_cmd");
    } catch {
      // ignore
    }
    localStorage.removeItem("arx_supabase_session");
    setSupabaseSession(null);
    setCommunities([]);
    setActiveCommunityId(null);
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

	  async function loadDiscoverCommunities() {
	    const url = getSupabaseUrl();
	    if (!url) return;
	    setIsLoadingDiscover(true);
	    setDiscoverError(null);
	    try {
	      const endpoint = supabaseSession
	        ? `${url}/rest/v1/communities?select=id,slug,name,owner_id,description,avatar_url,visibility,created_at,updated_at&order=updated_at.desc&limit=200`
	        : `${url}/rest/v1/communities?select=id,slug,name,owner_id,description,avatar_url,visibility,created_at,updated_at&visibility=eq.public&order=updated_at.desc&limit=200`;
	      const response = supabaseSession
	        ? await fetchWithSupabaseAuth(endpoint, {}, supabaseSession)
	        : await fetchWithSupabasePublic(endpoint);
	      if (!response.ok) {
	        const message = await readSupabaseError(response);
	        throw new Error(message);
	      }
	      const rows = (await response.json()) as CommunityRecord[];
	      setDiscoverCommunities(rows);
	    } catch (error) {
	      const message =
	        typeof error === "string"
	          ? error
	          : error instanceof Error
	            ? error.message
	            : "Failed to load communities.";
	      setDiscoverError(message);
	    } finally {
	      setIsLoadingDiscover(false);
	    }
	  }

	  async function handleJoinDiscoverCommunity(community: CommunityRecord) {
	    const url = getSupabaseUrl();
	    if (!url) {
	      setDiscoverError("Missing Supabase URL.");
	      return;
	    }
	    setDiscoverError(null);

	    if (!supabaseSession) {
	      try {
	        localStorage.setItem(PENDING_PUBLIC_JOIN_COMMUNITY_ID_KEY, community.id);
	      } catch {
	        // ignore
	      }
	      await handleSignIn();
	      return;
	    }

	    setJoiningDiscoverCommunityId(community.id);
	    try {
	      const response = await fetchWithSupabaseAuth(
	        `${url}/rest/v1/rpc/join_public_community`,
	        {
	          method: "POST",
	          headers: {
	            "Content-Type": "application/json"
	          },
	          body: JSON.stringify({ p_community_id: community.id })
	        },
	        supabaseSession
	      );
	      if (!response.ok) {
	        const message = await readSupabaseError(response);
	        throw new Error(message);
	      }
	      const rows = (await response.json()) as Array<{
	        community_id: string;
	        community_slug: string;
	        community_name: string;
	        role: string;
	        tier_id: string;
	      }>;
	      const first = rows[0];
	      if (!first) throw new Error("Failed to join community.");

	      try {
	        await fetchWithSupabaseAuth(
	          `${url}/rest/v1/entitlements`,
	          {
	            method: "POST",
	            headers: {
	              "Content-Type": "application/json"
	            },
	            body: JSON.stringify({
	              user_id: supabaseSession.user.id,
	              community_id: first.community_id,
	              role: first.role ?? "member",
	              tier_id: first.tier_id ?? "member",
	              source: "public_join",
	              status: "active",
	              starts_at: new Date().toISOString()
	            })
	          },
	          supabaseSession
	        );
	      } catch {
	        // ignore
	      }

	      try {
	        localStorage.removeItem(PENDING_PUBLIC_JOIN_COMMUNITY_ID_KEY);
	      } catch {
	        // ignore
	      }

	      await loadCommunities(supabaseSession);
	      setActiveCommunityId(first.community_id);
	      setActivePage("community");
	      setCommunityTab("chat");
	    } catch (error) {
	      const message =
	        typeof error === "string"
	          ? error
	          : error instanceof Error
	            ? error.message
	            : "Failed to join community.";
	      setDiscoverError(message);
	    } finally {
	      setJoiningDiscoverCommunityId(null);
	    }
	  }

	  function generateInviteCode(length = 10): string {
	    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	    const bytes = new Uint8Array(length);
	    crypto.getRandomValues(bytes);
	    let out = "";
	    for (let i = 0; i < bytes.length; i++) {
	      out += alphabet[bytes[i] % alphabet.length];
	    }
	    return out;
	  }

	  async function loadCommunityInvites(communityId: string, session: SupabaseSession) {
	    const url = getSupabaseUrl();
	    if (!url) return;
	    setIsLoadingCommunityInvites(true);
	    try {
	      const response = await fetchWithSupabaseAuth(
	        `${url}/rest/v1/community_invites?select=id,community_id,code,role,tier_id,max_uses,expires_at,revoked_at,created_by,created_at&community_id=eq.${communityId}&order=created_at.desc`,
	        {},
	        session
	      );
	      if (!response.ok) {
	        const text = await response.text();
	        throw new Error(text || "Failed to load invites.");
	      }
	      const rows = (await response.json()) as CommunityInviteRecord[];
	      setCommunityInvites(rows);
	    } catch (error) {
	      console.warn("Failed to load community invites:", error);
	      setCommunityInvites([]);
	    } finally {
	      setIsLoadingCommunityInvites(false);
	    }
	  }

	  async function handleCreateInvite() {
	    if (!supabaseSession || !activeCommunityId) return;
	    setInviteCreateError(null);
	    setIsCreatingInvite(true);
	    const url = getSupabaseUrl();
	    if (!url) {
	      setInviteCreateError("Missing Supabase URL.");
	      setIsCreatingInvite(false);
	      return;
	    }

    let maxUses: number | null = null;
    if (inviteMaxUsesPreset === "custom") {
      const raw = inviteMaxUsesCustom.trim();
      const parsed = Number(raw);
      if (!raw || !Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
        setInviteCreateError("Custom max uses must be a positive integer.");
        setIsCreatingInvite(false);
        return;
      }
      maxUses = parsed;
    } else if (inviteMaxUsesPreset !== "unlimited") {
      maxUses = Number(inviteMaxUsesPreset);
    }

    let expiresAt: string | null = null;
    if (inviteExpiryPreset === "custom") {
      const raw = inviteExpiryCustom.trim();
      const parsed = Number(raw);
      if (!raw || !Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
        setInviteCreateError("Custom expiry must be a positive integer (days).");
        setIsCreatingInvite(false);
        return;
      }
      expiresAt = new Date(Date.now() + parsed * 86400000).toISOString();
    } else if (inviteExpiryPreset !== "never") {
      const expiryMillisMap: Record<string, number> = {
        "24h": 24 * 60 * 60 * 1000,
        "7d": 7 * 86400000,
        "30d": 30 * 86400000,
        "90d": 90 * 86400000
      };
      const ms = expiryMillisMap[inviteExpiryPreset] ?? 0;
      if (ms > 0) {
        expiresAt = new Date(Date.now() + ms).toISOString();
      }
    }

	    // Retry a couple times to avoid rare collisions on unique(code).
	    let lastError: string | null = null;
	    for (let attempt = 0; attempt < 3; attempt++) {
	      const code = generateInviteCode(10);
	      try {
	        const response = await fetchWithSupabaseAuth(
	          `${url}/rest/v1/community_invites`,
	          {
	            method: "POST",
	            headers: {
	              "Content-Type": "application/json",
	              Prefer: "return=representation"
	            },
	            body: JSON.stringify({
	              community_id: activeCommunityId,
	              code,
	              role: "member",
	              tier_id: "member",
	              max_uses: maxUses,
	              expires_at: expiresAt,
	              created_by: supabaseSession.user.id
	            })
	          },
	          supabaseSession
	        );
	        if (!response.ok) {
	          const text = await response.text();
	          throw new Error(text || "Failed to create invite.");
	        }
	        const created = (await response.json()) as CommunityInviteRecord[];
	        const invite = created[0];
	        setCommunityInvites((prev) => [invite, ...prev]);
	        setInviteMaxUsesPreset("unlimited");
        setInviteMaxUsesCustom("");
	        setInviteExpiryPreset("7d");
        setInviteExpiryCustom("");
	        try {
	          const best = buildBestInviteLink(activeCommunity, invite.code);
	          await copyTextToClipboard(best.link);
	        } catch {
	          // ignore
	        }
	        setIsCreatingInvite(false);
	        return;
	      } catch (error) {
	        lastError =
	          typeof error === "string"
	            ? error
	            : error instanceof Error
	              ? error.message
	              : "Failed to create invite.";
	      }
	    }
	    setInviteCreateError(lastError ?? "Failed to create invite.");
	    setIsCreatingInvite(false);
	  }

	  async function handleRevokeInvite(inviteId: string) {
	    if (!supabaseSession) return;
	    const url = getSupabaseUrl();
	    if (!url) return;
	    try {
	      const response = await fetchWithSupabaseAuth(
	        `${url}/rest/v1/community_invites?id=eq.${inviteId}`,
	        {
	          method: "PATCH",
	          headers: {
	            "Content-Type": "application/json",
	            Prefer: "return=representation"
	          },
	          body: JSON.stringify({ revoked_at: new Date().toISOString() })
	        },
	        supabaseSession
	      );
	      if (!response.ok) {
	        const text = await response.text();
	        throw new Error(text || "Failed to revoke invite.");
	      }
	      const updated = (await response.json()) as CommunityInviteRecord[];
	      const row = updated[0];
	      if (row) {
	        setCommunityInvites((prev) => prev.map((inv) => (inv.id === inviteId ? row : inv)));
	      }
	    } catch (error) {
	      console.warn("Failed to revoke invite:", error);
	    }
	  }

	  async function handleDeleteInvite(inviteId: string) {
	    if (!supabaseSession) return;
	    const url = getSupabaseUrl();
	    if (!url) return;
	    try {
	      const response = await fetchWithSupabaseAuth(
	        `${url}/rest/v1/community_invites?id=eq.${inviteId}`,
	        { method: "DELETE" },
	        supabaseSession
	      );
	      if (!response.ok) {
	        const text = await response.text();
	        throw new Error(text || "Failed to delete invite.");
	      }
	      setCommunityInvites((prev) => prev.filter((inv) => inv.id !== inviteId));
	    } catch (error) {
	      console.warn("Failed to delete invite:", error);
	    }
	  }

  async function loadCommunityChat(communityId: string, session: SupabaseSession) {
    const url = getSupabaseUrl();
    if (!url) return;
    setIsLoadingChat(true);
    setIsLoadingMoreChat(false);
    setCommunityChatHasMore(true);
    communityChatOldestCreatedAtRef.current = null;
    pendingChatPrependScrollRef.current = null;
    try {
      let response: Response;
      try {
        response = await fetchWithSupabaseAuth(
          `${url}/rest/v1/community_chat_messages?select=id,community_id,sender_id,body,reply_to_id,created_at&community_id=eq.${communityId}&order=created_at.desc&limit=${COMMUNITY_CHAT_PAGE_SIZE}`,
          {},
          session
        );
      } catch {
        return;
      }
      if (!response.ok) return;
      const rowsDesc = (await response.json()) as CommunityChatMessage[];
      const hasMore = rowsDesc.length >= COMMUNITY_CHAT_PAGE_SIZE;
      const rows = [...rowsDesc].reverse();
      setCommunityChatHasMore(hasMore);
      setCommunityMessages(rows);
      communityChatOldestCreatedAtRef.current = rows[0]?.created_at ?? null;
      setUnreadCount(0);
      setIsUserAtBottom(true); // Reset scroll state on load
      isUserAtBottomRef.current = true;
      // Load reactions for these messages
      if (rows.length > 0) {
        const messageIds = rows.map(m => m.id);
        await loadMessageReactions(messageIds, session);
      }
    } finally {
      setIsLoadingChat(false);
    }
  }

  async function loadOlderCommunityChat(communityId: string, session: SupabaseSession) {
    if (isLoadingChat || isLoadingMoreChat) return;
    if (!communityChatHasMore) return;
    const cursor = communityChatOldestCreatedAtRef.current;
    if (!cursor) {
      setCommunityChatHasMore(false);
      return;
    }
    const url = getSupabaseUrl();
    if (!url) return;

    const container = communityChatListRef.current;
    if (container) {
      pendingChatPrependScrollRef.current = {
        prevScrollHeight: container.scrollHeight,
        prevScrollTop: container.scrollTop
      };
    }

    setIsLoadingMoreChat(true);
    try {
      let response: Response;
      try {
        response = await fetchWithSupabaseAuth(
          `${url}/rest/v1/community_chat_messages?select=id,community_id,sender_id,body,reply_to_id,created_at&community_id=eq.${communityId}&created_at=lt.${encodeURIComponent(cursor)}&order=created_at.desc&limit=${COMMUNITY_CHAT_PAGE_SIZE}`,
          {},
          session
        );
      } catch {
        pendingChatPrependScrollRef.current = null;
        return;
      }
      if (!response.ok) {
        pendingChatPrependScrollRef.current = null;
        return;
      }
      const rowsDesc = (await response.json()) as CommunityChatMessage[];
      if (rowsDesc.length === 0) {
        setCommunityChatHasMore(false);
        pendingChatPrependScrollRef.current = null;
        return;
      }

      const hasMore = rowsDesc.length >= COMMUNITY_CHAT_PAGE_SIZE;
      const rows = [...rowsDesc].reverse();
      setCommunityChatHasMore(hasMore);
      communityChatOldestCreatedAtRef.current = rows[0]?.created_at ?? cursor;

      setCommunityMessages((prev) => {
        const existing = new Set(prev.map((m) => m.id));
        const unique = rows.filter((m) => !existing.has(m.id));
        if (unique.length === 0) {
          pendingChatPrependScrollRef.current = null;
          return prev;
        }
        return [...unique, ...prev];
      });

      await loadMessageReactions(rows.map((m) => m.id), session);
    } finally {
      setIsLoadingMoreChat(false);
    }
  }

  async function loadMessageReactions(messageIds: string[], session: SupabaseSession) {
    const url = getSupabaseUrl();
    if (!url || messageIds.length === 0) return;
    const idsFilter = messageIds.map(id => `"${id}"`).join(",");
    let response: Response;
    try {
      response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/message_reactions?select=id,message_id,user_id,emoji,created_at&message_id=in.(${idsFilter})`,
        {},
        session
      );
    } catch {
      return;
    }
    if (!response.ok) return;
    const rows = (await response.json()) as MessageReaction[];
    setMessageReactions((prev) => {
      if (prev.length === 0) return rows;
      const byId = new Map<string, MessageReaction>();
      for (const reaction of prev) {
        byId.set(reaction.id, reaction);
      }
      for (const reaction of rows) {
        byId.set(reaction.id, reaction);
      }
      return Array.from(byId.values());
    });
  }

  async function handleToggleReaction(messageId: string, emoji: string) {
    if (!supabaseSession) return;
    const url = getSupabaseUrl();
    if (!url) return;

    const existingReaction = messageReactions.find(
      r => r.message_id === messageId && r.user_id === supabaseSession.user.id && r.emoji === emoji
    );

    if (existingReaction) {
      // Remove reaction
      setMessageReactions(prev => prev.filter(r => r.id !== existingReaction.id));
      try {
        const response = await fetchWithSupabaseAuth(
          `${url}/rest/v1/message_reactions?id=eq.${existingReaction.id}`,
          { method: "DELETE" },
          supabaseSession
        );
        if (!response.ok) {
          setMessageReactions(prev => [...prev, existingReaction]);
        }
      } catch {
        setMessageReactions(prev => [...prev, existingReaction]);
      }
    } else {
      // Add reaction (optimistic)
      const optimisticId = `pending-${Date.now()}`;
      const optimisticReaction: MessageReaction = {
        id: optimisticId,
        message_id: messageId,
        user_id: supabaseSession.user.id,
        emoji,
        created_at: new Date().toISOString()
      };
      setMessageReactions(prev => [...prev, optimisticReaction]);

      try {
        const response = await fetchWithSupabaseAuth(
          `${url}/rest/v1/message_reactions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Prefer: "return=representation"
            },
            body: JSON.stringify({
              message_id: messageId,
              user_id: supabaseSession.user.id,
              emoji
            })
          },
          supabaseSession
        );
        if (response.ok) {
          const created = (await response.json()) as MessageReaction[];
          if (created.length > 0) {
            setMessageReactions(prev =>
              prev.map(r => r.id === optimisticId ? created[0] : r)
            );
          }
        } else {
          setMessageReactions(prev => prev.filter(r => r.id !== optimisticId));
        }
      } catch {
        setMessageReactions(prev => prev.filter(r => r.id !== optimisticId));
      }
    }
    setReactionPickerMessageId(null);
  }

  function handleStartEdit(message: CommunityChatMessage) {
    const reply = parseReplyPrefix(message.body);
    setEditingMessageId(message.id);
    setEditingMessageText(reply ? reply.rest : message.body);
    setEditingMessagePrefix(reply ? buildReplyPrefix(reply.sender, reply.preview) : null);
  }

  function handleCancelEdit() {
    setEditingMessageId(null);
    setEditingMessageText("");
    setEditingMessagePrefix(null);
  }

  async function handleSaveEdit() {
    if (!supabaseSession || !editingMessageId) return;
    const text = editingMessageText.trim();
    if (!text) return;

    const url = getSupabaseUrl();
    if (!url) return;

    const bodyToSave = editingMessagePrefix ? editingMessagePrefix + text : text;

    // Optimistic update
    setCommunityMessages(prev =>
      prev.map(m => m.id === editingMessageId ? { ...m, body: bodyToSave } : m)
    );
    setEditingMessageId(null);
    setEditingMessageText("");
    setEditingMessagePrefix(null);

    let response: Response | null = null;
    try {
      response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/community_chat_messages?id=eq.${editingMessageId}&sender_id=eq.${supabaseSession.user.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ body: bodyToSave })
        },
        supabaseSession
      );
    } catch {
      response = null;
    }
    if (!response || !response.ok) {
      // Reload to revert on error
      if (activeCommunityId) {
        await loadCommunityChat(activeCommunityId, supabaseSession);
      }
    }
  }

  async function handleDeleteMessage(messageId: string) {
    if (!supabaseSession) return;
    const url = getSupabaseUrl();
    if (!url) return;

    // Optimistic update
    setCommunityMessages(prev => prev.filter(m => m.id !== messageId));
    setMessageReactions(prev => prev.filter(r => r.message_id !== messageId));

    let response: Response | null = null;
    try {
      response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/community_chat_messages?id=eq.${messageId}&sender_id=eq.${supabaseSession.user.id}`,
        { method: "DELETE" },
        supabaseSession
      );
    } catch {
      response = null;
    }
    if (!response || !response.ok) {
      // Reload to revert on error
      if (activeCommunityId) {
        await loadCommunityChat(activeCommunityId, supabaseSession);
      }
    }
  }

  async function loadCommunityResources(communityId: string, session: SupabaseSession) {
    const url = getSupabaseUrl();
    if (!url) return;
    setIsLoadingResources(true);
    try {
      let response: Response;
      try {
        response = await fetchWithSupabaseAuth(
          `${url}/rest/v1/community_resources?select=id,community_id,type,title,body_md,url,file_key,pinned,created_at&community_id=eq.${communityId}&order=pinned.desc,created_at.desc&limit=200`,
          {},
          session
        );
      } catch {
        return;
      }
      if (!response.ok) return;
      const rows = (await response.json()) as CommunityResource[];
      setCommunityResources(rows);
    } finally {
      setIsLoadingResources(false);
    }
  }

  async function loadCommunityMembers(communityId: string, session: SupabaseSession) {
    const url = getSupabaseUrl();
    if (!url) return;
    let response: Response;
    try {
      response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/community_memberships?select=id,community_id,user_id,role,created_at&community_id=eq.${communityId}&order=created_at.asc&limit=200`,
        {},
        session
      );
    } catch {
      return;
    }
    if (!response.ok) return;
    const rows = (await response.json()) as CommunityMember[];
    setCommunityMembers(rows);
  }

  async function loadArtifacts(communityId: string, session: SupabaseSession) {
    const url = getSupabaseUrl();
    if (!url) return;
    setIsLoadingArtifacts(true);
    try {
      let response: Response;
      try {
        response = await fetchWithSupabaseAuth(
          `${url}/rest/v1/artifacts?select=id,community_id,author_id,type,title,current_version_id,created_at,updated_at&community_id=eq.${communityId}&order=updated_at.desc&limit=200`,
          {},
          session
        );
      } catch {
        return;
      }
      if (!response.ok) return;
      const rows = (await response.json()) as CommunityArtifact[];
      setArtifacts(rows);
      if (rows.length > 0 && !selectedArtifactId) {
        setSelectedArtifactId(rows[0].id);
      }
    } finally {
      setIsLoadingArtifacts(false);
    }
  }

  async function loadArtifactVersions(artifactId: string, session: SupabaseSession) {
    const url = getSupabaseUrl();
    if (!url) return;
    setIsLoadingArtifactVersions(true);
    try {
      let response: Response;
      try {
        response = await fetchWithSupabaseAuth(
          `${url}/rest/v1/artifact_versions?select=id,artifact_id,body_md,summary,tags,created_at,created_by&artifact_id=eq.${artifactId}&order=created_at.desc`,
          {},
          session
        );
      } catch {
        return;
      }
      if (!response.ok) return;
      const rows = (await response.json()) as ArtifactVersion[];
      setArtifactVersions(rows);
    } finally {
      setIsLoadingArtifactVersions(false);
    }
  }

  function slugify(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
  }

  function isValidSlug(value: string): boolean {
    if (value.length < 3 || value.length > 32) return false;
    return /^(?!-)[a-z0-9-]+(?<!-)$/.test(value);
  }

  function openCreateCommunityModal() {
    setCreateCommunityError(null);
    setCreateCommunityName("");
    setCreateCommunitySlug("");
    setCreateCommunitySlugEdited(false);
    setCreateCommunityVisibility("private");
    setCreateCommunityAvatarUrl(null);
    setCreateCommunityDescription("");
    setCreateCommunityBannerUrl(null);
    setShowCreateCommunityModal(true);
  }

  function closeCreateCommunityModal() {
    setShowCreateCommunityModal(false);
    setCreateCommunityError(null);
  }

  useEffect(() => {
    if (createCommunitySlugEdited) return;
    const next = slugify(createCommunityName);
    setCreateCommunitySlug(next);
  }, [createCommunityName, createCommunitySlugEdited]);

  async function handleCreateCommunity() {
    setCreateCommunityError(null);
    if (!supabaseSession) {
      setCreateCommunityError("Sign in to create a community.");
      return;
    }
    const name = createCommunityName.trim();
    const rawSlug = createCommunitySlug.trim() || slugify(name);
    const slug = rawSlug.toLowerCase();
    if (!name || !slug) {
      setCreateCommunityError("Name and slug are required.");
      return;
    }
    if (!isValidSlug(slug)) {
      setCreateCommunityError("Slug must be 3–32 chars, lowercase, and may include dashes.");
      return;
    }
    const url = getSupabaseUrl();
    const apiKey = getSupabaseAnonKey();
    if (!url || !apiKey) {
      setCreateCommunityError("Missing Supabase config.");
      return;
    }
    if (!["public", "unlisted", "private"].includes(createCommunityVisibility)) {
      setCreateCommunityError("Visibility must be public, unlisted, or private.");
      return;
    }
    setIsCreatingCommunity(true);
    try {
      const communityResponse = await fetchWithSupabaseAuth(
        `${url}/rest/v1/communities`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=representation"
          },
          body: JSON.stringify({
            name,
            slug,
            owner_id: supabaseSession.user.id,
            visibility: createCommunityVisibility,
            avatar_url: createCommunityAvatarUrl?.trim() || null,
            description: createCommunityDescription.trim() || null,
            banner_url: createCommunityBannerUrl?.trim() || null
          })
        },
        supabaseSession
      );
      if (!communityResponse.ok) {
        const text = await communityResponse.text();
        setCreateCommunityError(text || "Failed to create community.");
        return;
      }
      const created = (await communityResponse.json()) as CommunityRecord[];
      const community = created[0];
      const membershipResponse = await fetchWithSupabaseAuth(
        `${url}/rest/v1/community_memberships`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            community_id: community.id,
            user_id: supabaseSession.user.id,
            role: "owner"
          })
        },
        supabaseSession
      );
      if (!membershipResponse.ok) {
        const text = await membershipResponse.text();
        setCreateCommunityError(text || "Failed to add you as a community member.");
        return;
      }

      const entitlementResponse = await fetchWithSupabaseAuth(
        `${url}/rest/v1/entitlements`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            user_id: supabaseSession.user.id,
            community_id: community.id,
            role: "owner",
            tier_id: "founder",
            source: "manual_grant",
            status: "active",
            starts_at: new Date().toISOString()
          })
        },
        supabaseSession
      );
      if (!entitlementResponse.ok) {
        const text = await entitlementResponse.text();
        setCreateCommunityError(text || "Failed to create entitlements.");
        return;
      }

      setCommunities((prev) => [community, ...prev]);
      setActiveCommunityId(community.id);
      setActivePage("community");
      setCommunityTab("chat");
      closeCreateCommunityModal();
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to create community.";
      setCreateCommunityError(message);
    } finally {
      setIsCreatingCommunity(false);
    }
  }

  async function copyTextToClipboard(text: string): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch {
      // Fall back below.
    }
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.top = "0";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    } catch {
      // ignore
    }
  }

  async function readAvatarFileAsSquareDataUrl(file: File, size = 128): Promise<string> {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      const loaded = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image."));
      });
      img.src = url;
      await loaded;

      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported.");

      const s = Math.min(img.width, img.height);
      const sx = Math.floor((img.width - s) / 2);
      const sy = Math.floor((img.height - s) / 2);
      ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);

      return canvas.toDataURL("image/png");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function readFileAsDataUrl(file: File): Promise<string> {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  async function handleCreateCommunityAvatarUpload(file: File | null) {
    if (!file) return;
    try {
      const dataUrl = await readAvatarFileAsSquareDataUrl(file, 128);
      setCreateCommunityAvatarUrl(dataUrl);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to load image.";
      setCreateCommunityError(message);
    }
  }

  async function handleCreateCommunityBannerUpload(file: File | null) {
    if (!file) return;
    try {
      const dataUrl = await readAvatarFileAsSquareDataUrl(file, 320);
      setCreateCommunityBannerUrl(dataUrl);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to load image.";
      setCreateCommunityError(message);
    }
  }

  function handleCreateBannerDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsCreateBannerDragOver(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    if (file) void handleCreateCommunityBannerUpload(file);
  }

  function handleCreateAvatarDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsCreateAvatarDragOver(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    if (file) void handleCreateCommunityAvatarUpload(file);
  }

  function handleSettingsBannerDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsSettingsBannerDragOver(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    if (file) void handleCommunityBannerUpload(file);
  }

  function handleSettingsAvatarDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsSettingsAvatarDragOver(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    if (file) void handleCommunityAvatarUpload(file);
  }

  async function handleCommunityAvatarUpload(file: File | null) {
    if (!file) return;
    try {
      const dataUrl = await readAvatarFileAsSquareDataUrl(file, 128);
      setCommunitySettingsAvatarUrl(dataUrl);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to load image.";
      setCommunitySettingsError(message);
    }
  }

  async function handleCommunityBannerUpload(file: File | null) {
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setCommunitySettingsBannerUrl(dataUrl);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to load banner.";
      setCommunitySettingsError(message);
    }
  }

  async function handleProfileAvatarUpload(file: File | null) {
    if (!file) return;
    try {
      const dataUrl = await readAvatarFileAsSquareDataUrl(file, 128);
      setProfileAvatarUrl(dataUrl);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to load image.";
      setAuthError(message);
    }
  }

  function handleProfileAvatarDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsProfileAvatarDragOver(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    if (file) void handleProfileAvatarUpload(file);
  }

  async function handleSaveCommunitySettings() {
    if (!supabaseSession || !activeCommunityId) return;
    setCommunitySettingsError(null);
    setIsSavingCommunitySettings(true);
    const url = getSupabaseUrl();
    if (!url) {
      setCommunitySettingsError("Missing Supabase URL.");
      setIsSavingCommunitySettings(false);
      return;
    }

    const name = communitySettingsName.trim();
    const slug = communitySettingsSlug.trim();
    if (!name || !slug) {
      setCommunitySettingsError("Name and slug are required.");
      setIsSavingCommunitySettings(false);
      return;
    }

    const visibility = communitySettingsVisibility;
    if (!["public", "unlisted", "private"].includes(visibility)) {
      setCommunitySettingsError("Visibility must be public, unlisted, or private.");
      setIsSavingCommunitySettings(false);
      return;
    }

    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/communities?id=eq.${activeCommunityId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=representation"
          },
          body: JSON.stringify({
            name,
            slug,
            description: communitySettingsDescription.trim() || null,
            avatar_url: communitySettingsAvatarUrl?.trim() || null,
            banner_url: communitySettingsBannerUrl?.trim() || null,
            visibility
          })
        },
        supabaseSession
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to save settings.");
      }
      const updated = (await response.json()) as CommunityRecord[];
      const row = updated[0];
      if (row) {
        setCommunities((prev) => prev.map((c) => (c.id === row.id ? { ...c, ...row } : c)));
      }
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to save settings.";
      setCommunitySettingsError(message);
    } finally {
      setIsSavingCommunitySettings(false);
    }
  }

  function scrollToCommunityMessage(messageId: string) {
    const target = document.getElementById(`msg-${messageId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function truncateReplyPreview(body: string): string {
    const singleLine = body.replace(/\s+/g, " ").trim();
    if (singleLine.length <= 90) return singleLine;
    return singleLine.slice(0, 90) + "…";
  }

  function handleStartReply(message: CommunityChatMessage) {
    if (message.id.startsWith("pending-")) return;
    setReplyingToMessage(message);
    setReactionPickerMessageId(null);
    setEditingMessageId(null);
    setEditingMessageText("");
    setEditingMessagePrefix(null);
    setTimeout(() => chatInputRef.current?.focus(), 0);
  }

  async function handleSendCommunityMessage() {
    if (!supabaseSession || !activeCommunityId) return;
    const rawText = communityMessageInput.trim();
    if (!rawText) return;

    const replySnapshot = replyingToMessage;
    const replyToId = replySnapshot ? replySnapshot.id : null;
    const bodyToSend = rawText;

    const scan = await scanPublishContent(bodyToSend);
    if (scan?.blocked) {
      setCommunityChatError(formatSecretScanError(scan));
      return;
    }

    // Optimistic update: add message immediately with pending state
    const optimisticId = `pending-${Date.now()}`;
    const optimisticMessage: CommunityChatMessage = {
      id: optimisticId,
      community_id: activeCommunityId,
      sender_id: supabaseSession.user.id,
      body: bodyToSend,
      reply_to_id: replyToId,
      created_at: new Date().toISOString(),
    };
    setCommunityMessages((prev) => [...prev, optimisticMessage]);
    setCommunityMessageInput("");
    setReplyingToMessage(null);
    setIsUserAtBottom(true); // Scroll to show new message

    // Reset textarea height
    if (chatInputRef.current) {
      chatInputRef.current.style.height = "auto";
    }

    setIsSendingCommunityMessage(true);
    setCommunityChatError(null);
    const url = getSupabaseUrl();
    const apiKey = getSupabaseAnonKey();
    if (!url || !apiKey) {
      setCommunityChatError("Missing Supabase config.");
      // Remove optimistic message on error
      setCommunityMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setCommunityMessageInput(rawText);
      setReplyingToMessage(replySnapshot);
      setIsSendingCommunityMessage(false);
      return;
    }
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/community_chat_messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=representation"
          },
          body: JSON.stringify({
            community_id: activeCommunityId,
            sender_id: supabaseSession.user.id,
            body: bodyToSend,
            reply_to_id: replyToId
          })
        },
        supabaseSession
      );
      if (!response.ok) {
        const errText = await response.text();
        setCommunityChatError(errText || "Failed to send message.");
        // Remove optimistic message on error
        setCommunityMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setCommunityMessageInput(rawText);
        setReplyingToMessage(replySnapshot);
        return;
      }
      const created = (await response.json()) as CommunityChatMessage[];
      const record = created[0] ?? null;
      if (!record) {
        setCommunityChatError("Message sent, but no response payload returned.");
        setCommunityMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setCommunityMessageInput(rawText);
        setReplyingToMessage(replySnapshot);
        return;
      }
      // Dedupe against realtime inserts: if the record already arrived via WS, drop the optimistic row.
      setCommunityMessages((prev) => {
        const withoutOptimistic = prev.filter((m) => m.id !== optimisticId);
        if (withoutOptimistic.some((m) => m.id === record.id)) return withoutOptimistic;
        const next = [...withoutOptimistic, record];
        next.sort((a, b) => a.created_at.localeCompare(b.created_at));
        return next;
      });
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to send message.";
      setCommunityChatError(message);
      setCommunityMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setCommunityMessageInput(rawText);
      setReplyingToMessage(replySnapshot);
    } finally {
      setIsSendingCommunityMessage(false);
    }
  }

  async function handleSaveCommunityResource() {
    if (!supabaseSession || !activeCommunityId) return;
    const title = resourceTitleInput.trim();
    if (!title) {
      setResourceError("Title is required.");
      return;
    }
    const description = resourceBodyInput.trim();
    if (!description) {
      setResourceError("Description is required.");
      return;
    }
    const rawUrl = resourceUrlInput.trim();
    const embedInfo = rawUrl ? parseEmbedUrl(rawUrl) : null;
    const resourceType: CommunityResource["type"] = embedInfo
      ? "embed"
      : rawUrl
        ? "link"
        : "post";
    const scan = await scanPublishContent(
      [title, description, rawUrl].filter(Boolean).join("\n\n")
    );
    if (scan?.blocked) {
      setResourceError(formatSecretScanError(scan));
      return;
    }
    setResourceError(null);
    setIsSavingResource(true);
    const url = getSupabaseUrl();
    const apiKey = getSupabaseAnonKey();
    if (!url || !apiKey) {
      setResourceError("Missing Supabase config.");
      setIsSavingResource(false);
      return;
    }
    const payload = {
      community_id: activeCommunityId,
      type: resourceType,
      title,
      body_md: description,
      url: rawUrl || null,
      file_key: null,
      pinned: resourcePinnedInput
    };
    let response: Response;
    try {
      response = await fetchWithSupabaseAuth(
        editingResourceId
          ? `${url}/rest/v1/community_resources?id=eq.${editingResourceId}`
          : `${url}/rest/v1/community_resources`,
        {
          method: editingResourceId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=representation"
          },
          body: JSON.stringify(payload)
        },
        supabaseSession
      );
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to save resource.";
      setResourceError(message);
      setIsSavingResource(false);
      return;
    }
    if (!response.ok) {
      const errText = await response.text();
      setResourceError(errText || "Failed to save resource.");
      setIsSavingResource(false);
      return;
    }
    setResourceTitleInput("");
    setResourceUrlInput("");
    setResourceBodyInput("");
    setResourcePinnedInput(false);
    setEditingResourceId(null);
    setShowResourceModal(false);
    await loadCommunityResources(activeCommunityId, supabaseSession);
    setIsSavingResource(false);
    // Show success toast
    setResourceSuccess(true);
    setTimeout(() => setResourceSuccess(false), 2000);
  }

  function handleEditResource(resource: CommunityResource) {
    setEditingResourceId(resource.id);
    setResourceTitleInput(resource.title);
    setResourceUrlInput(resource.url ?? "");
    setResourceBodyInput(resource.body_md ?? "");
    setResourcePinnedInput(resource.pinned);
    setResourceError(null);
    setShowResourceModal(true);
  }

  function resetResourceForm() {
    setEditingResourceId(null);
    setResourceTitleInput("");
    setResourceUrlInput("");
    setResourceBodyInput("");
    setResourcePinnedInput(false);
    setResourceError(null);
  }

  function openNewResourceModal() {
    resetResourceForm();
    setShowResourceModal(true);
  }

  function closeResourceModal() {
    setShowResourceModal(false);
    resetResourceForm();
  }

  async function handleDeleteResource(resourceId: string) {
    if (!supabaseSession || !activeCommunityId) return;
    const url = getSupabaseUrl();
    const apiKey = getSupabaseAnonKey();
    if (!url || !apiKey) return;
    let response: Response;
    try {
      response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/community_resources?id=eq.${resourceId}`,
        { method: "DELETE" },
        supabaseSession
      );
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to delete resource.";
      setResourceError(message);
      return;
    }
    if (!response.ok) {
      const errText = await response.text();
      setResourceError(errText || "Failed to delete resource.");
      return;
    }
    if (editingResourceId === resourceId) {
      setEditingResourceId(null);
      setResourceTitleInput("");
      setResourceUrlInput("");
      setResourceBodyInput("");
      setResourcePinnedInput(false);
    }
    await loadCommunityResources(activeCommunityId, supabaseSession);
  }

  async function handleSaveProviderKey(id: string) {
    const provider = providerKeys.find((item) => item.id === id);
    if (!provider || !provider.inputValue.trim()) return;
    try {
      await invoke("set_provider_key_cmd", {
        provider: id,
        key: provider.inputValue.trim()
      });
      const hasKey = await invoke<boolean>("has_provider_key_cmd", { provider: id });
      setProviderKeys((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, hasKey, inputValue: "", error: null }
            : item
        )
      );
      if (id === "openrouter" && hasKey) {
        await refreshModelAvailability();
      }
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to save key";
      setProviderKeys((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, error: message } : item
        )
      );
    }
  }

  async function handleClearProviderKey(id: string) {
    try {
      await invoke("clear_provider_key_cmd", { provider: id });
      setProviderKeys((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, hasKey: false, inputValue: "", error: null } : item
        )
      );
      if (id === "openrouter") {
        setModelAvailability({});
      }
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to clear key";
      setProviderKeys((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, error: message } : item
        )
      );
    }
  }

  async function syncActiveModel(nextToggles: ModelToggle[]) {
    const enabled = nextToggles.filter((toggle) => toggle.enabled);
    if (enabled.length === 0) {
      setActiveModelId(null);
      return;
    }
    const enabledReady = enabled.filter((toggle) => isModelReady(toggle.id));

    const shouldKeepActive =
      activeModelId &&
      enabled.some((toggle) => toggle.id === activeModelId) &&
      (enabledReady.length === 0 || enabledReady.some((toggle) => toggle.id === activeModelId));

    if (shouldKeepActive) return;

    const preferredReady = enabledReady.find((toggle) => toggle.id === DEFAULT_ACTIVE_MODEL_ID)?.id;
    const preferredEnabled = enabled.find((toggle) => toggle.id === DEFAULT_ACTIVE_MODEL_ID)?.id;
    const fallback =
      preferredReady ??
      enabledReady[0]?.id ??
      preferredEnabled ??
      enabled[0].id;
    setActiveModelId(fallback);
    await invoke("set_active_model_cmd", { modelId: fallback });
  }

  async function handleToggleModel(id: string) {
    const next = modelToggles.map((toggle) =>
      toggle.id === id ? { ...toggle, enabled: !toggle.enabled } : toggle
    );
    setModelToggles(next);
    await invoke("set_model_toggles_cmd", { toggles: next });
    await syncActiveModel(next);
  }

  useEffect(() => {
    void syncActiveModel(modelToggles);
  }, [modelToggles, activeModelId, providerKeys[0]?.hasKey, modelAvailability]);

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

	  const enabledModels = modelToggles.filter((toggle) => toggle.enabled);
	  const activeCommunity = communities.find((item) => item.id === activeCommunityId) ?? null;
	  const activeCommunityRole = activeCommunityId ? (communityRoleById[activeCommunityId] ?? null) : null;
	  const isActiveCommunityAdmin = Boolean(
	    supabaseSession &&
	      activeCommunity &&
	      (activeCommunityRole === "owner" ||
	        activeCommunityRole === "admin" ||
	        activeCommunity.owner_id === supabaseSession.user.id)
	  );
  const filteredDiscoverCommunities = useMemo(() => {
    const query = discoverQuery.trim().toLowerCase();
    const list = supabaseSession
      ? discoverCommunities
      : discoverCommunities.filter((c) => c.visibility === "public");
    if (!query) return list;
    return list.filter((c) => {
      const haystack = `${c.name ?? ""}\n${c.slug ?? ""}\n${c.description ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [discoverCommunities, discoverQuery, supabaseSession]);
	  const communityMessageById = useMemo(() => {
	    const map = new Map<string, CommunityChatMessage>();
	    for (const message of communityMessages) {
	      map.set(message.id, message);
	    }
	    return map;
	  }, [communityMessages]);
	  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null;
	  const pinnedThreadCommunityId = activeThread?.community_id ?? null;
	  const actionablePendingInvites = useMemo(
	    () => pendingInvites.filter((invite) => invite.status === "pending"),
	    [pendingInvites]
	  );

	  const inviteGateRecord = useMemo(() => {
	    if (!activeInviteGateKey) return null;
	    return pendingInvites.find((invite) => invite.invite_key === activeInviteGateKey) ?? null;
	  }, [activeInviteGateKey, pendingInvites]);
	  const showCommunityRail = true;
	  const effectiveCwd = activeProject?.root_path ?? workspaceRoot ?? ".";
	  const lastThreadWorkspaceRef = useRef<string | null>(null);

  function communityInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  function handleSelectActiveCommunity(next: string) {
    setActiveCommunityId(next);
    if (!activeThreadId) return;
    if (!pinnedThreadCommunityId) return;
    if (next === pinnedThreadCommunityId) return;
    void invoke<ThreadRecord>("set_thread_community_cmd", { threadId: activeThreadId, communityId: next })
      .then((updated) => {
        setThreads((prev) => {
          const idx = prev.findIndex((t) => t.id === updated.id);
          if (idx === -1) return prev;
          const copy = [...prev];
          copy[idx] = updated;
          return copy;
        });
      })
      .catch((error) => {
        console.error("Failed to sync thread community:", error);
      });
  }

  // Helper to display user names with session context
  const displayName = useCallback((userId: string): string => {
    const trimmedName = profileName.trim();
    const trimmedUsername = profileUsername.trim();
    if (supabaseSession?.user.id === userId) {
      if (trimmedName) return trimmedName;
      if (trimmedUsername) return trimmedUsername.startsWith("@") ? trimmedUsername : `@${trimmedUsername}`;
    }
    return shortId(userId, supabaseSession?.user.id, supabaseSession?.user.email ?? undefined);
  }, [profileName, profileUsername, supabaseSession?.user.id, supabaseSession?.user.email]);

  useEffect(() => {
    const trimmed = profileName.trim();
    if (trimmed) {
      localStorage.setItem("arx_profile_name", trimmed);
    } else {
      localStorage.removeItem("arx_profile_name");
    }
  }, [profileName]);

  useEffect(() => {
    const trimmed = profileUsername.trim();
    if (trimmed) {
      localStorage.setItem("arx_profile_username", trimmed);
    } else {
      localStorage.removeItem("arx_profile_username");
    }
  }, [profileUsername]);

  useEffect(() => {
    const trimmed = profileBio.trim();
    if (trimmed) {
      localStorage.setItem("arx_profile_bio", trimmed);
    } else {
      localStorage.removeItem("arx_profile_bio");
    }
  }, [profileBio]);

  useEffect(() => {
    if (profileAvatarUrl) {
      localStorage.setItem("arx_profile_avatar", profileAvatarUrl);
    } else {
      localStorage.removeItem("arx_profile_avatar");
    }
  }, [profileAvatarUrl]);

  function settingsPageLabel(page: SettingsPage): string {
    switch (page) {
      case "account":
        return "Account";
      case "models":
        return "Models";
      case "execution":
        return "Execution";
      case "memory":
        return "Memory";
      case "appearance":
        return "Appearance";
    }
  }

  async function loadWorkspaceRoot() {
    const root = await invoke<string>("get_workspace_root_cmd");
    setWorkspaceRoot(root);
  }

  async function loadActiveProject() {
    const active = await invoke<ProjectRecord | null>("get_active_project_cmd");
    setActiveProject(active);
  }

  async function handleChangeWorkspace() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Arx Workspace Root"
    });
    if (!selected || Array.isArray(selected)) return;
    await invoke("set_workspace_root_cmd", { path: selected });
    setWorkspaceRoot(selected);
    setActiveProject(null);
    await invoke("set_active_project_cmd", { projectId: null });
    if (activeThreadId) {
      await invoke("set_thread_workspace_cmd", { threadId: activeThreadId, workspacePath: selected });
      lastThreadWorkspaceRef.current = selected;
    }
  }

  async function handleAddAttachment() {
    const selected = await open({
      multiple: true,
      title: "Add files to message",
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] },
        { name: "Documents", extensions: ["txt", "md", "json", "csv", "pdf"] },
        { name: "Code", extensions: ["ts", "tsx", "js", "jsx", "py", "rs", "go", "html", "css"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    for (const path of paths) {
      try {
        const result = await invoke<{
          id: string;
          path: string;
          name: string;
          file_type: "image" | "file";
          size: number;
          preview_data_url: string | null;
        }>("ingest_attachment_cmd", { path });
        setAttachments((prev) => [
          ...prev,
          {
            id: result.id,
            path: result.path,
            name: result.name,
            type: result.file_type,
            size: result.size,
            previewDataUrl: result.preview_data_url ?? undefined
          }
        ]);
      } catch (error) {
        console.error("Failed to add attachment:", error);
      }
    }
  }

  function handleRemoveAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  // Tauri drag-drop listener (gets actual file paths)
  useEffect(() => {
    const webview = getCurrentWebviewWindow();
    const unlistenDrop = webview.onDragDropEvent(async (event) => {
      if (event.payload.type === "over") {
        setIsDraggingOver(true);
      } else if (event.payload.type === "leave") {
        setIsDraggingOver(false);
      } else if (event.payload.type === "drop") {
        setIsDraggingOver(false);
        const paths = event.payload.paths;
        for (const path of paths) {
          try {
            const result = await invoke<{
              id: string;
              path: string;
              name: string;
              file_type: "image" | "file";
              size: number;
              preview_data_url: string | null;
            }>("ingest_attachment_cmd", { path });
            setAttachments((prev) => [
              ...prev,
              {
                id: result.id,
                path: result.path,
                name: result.name,
                type: result.file_type,
                size: result.size,
                previewDataUrl: result.preview_data_url ?? undefined
              }
            ]);
          } catch (error) {
            console.error("Failed to add dropped file:", error);
          }
        }
      }
    });

    return () => {
      unlistenDrop.then((fn) => fn());
    };
  }, []);

  // Prevent default browser behavior for drag events
  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  async function handleToggleThreadCommunityPin() {
    if (!activeThreadId) return;
    const next = pinnedThreadCommunityId ? null : activeCommunityId;
    if (!next && !pinnedThreadCommunityId) return;
    try {
      const updated = await invoke<ThreadRecord>("set_thread_community_cmd", {
        threadId: activeThreadId,
        communityId: next
      });
      setThreads((prev) => {
        const idx = prev.findIndex((t) => t.id === updated.id);
        if (idx === -1) return prev;
        const copy = [...prev];
        copy[idx] = updated;
        return copy;
      });
    } catch (error) {
      console.error("Failed to set thread community:", error);
    }
  }

  async function handleCreateThread() {
    if (!activeModelId) {
      setMemoryToast("No model selected. Enable a model in Settings → Models.");
      return;
    }
    const thread = await invoke<ThreadRecord>("create_thread_cmd", {
      title: newThreadTitle,
      engineId: "openrouter_messages_agent",
      modelId: activeModelId
    });
    setThreads((prev) => [thread, ...prev]);
    setActiveThreadId(thread.id);
    const nextWorkspace = effectiveCwd;
    await invoke("set_thread_workspace_cmd", {
      threadId: thread.id,
      workspacePath: nextWorkspace
    });
    lastThreadWorkspaceRef.current = nextWorkspace;
    setMessages([]);
    setToolCalls([]);
  }

  useEffect(() => {
    if (!activeThreadId) return;
    const nextWorkspace = effectiveCwd;
    if (!nextWorkspace) return;
    if (lastThreadWorkspaceRef.current === nextWorkspace) return;
    lastThreadWorkspaceRef.current = nextWorkspace;
    void invoke("set_thread_workspace_cmd", {
      threadId: activeThreadId,
      workspacePath: nextWorkspace
    }).catch(() => {
      // Non-fatal; workspace is best-effort metadata.
    });
  }, [activeThreadId, effectiveCwd]);

  async function handleDeleteThread(threadId: string) {
    await invoke("delete_thread_cmd", { threadId });
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    if (activeThreadId === threadId) {
      const remaining = threads.filter((t) => t.id !== threadId);
      setActiveThreadId(remaining.length > 0 ? remaining[0].id : null);
      setMessages([]);
    }
  }

  function getThreadPreview(threadId: string): string {
    if (threadId !== activeThreadId) return "";
    const firstUserMsg = messages.find((m) => m.role === "user");
    if (!firstUserMsg) return "No messages";
    const text = parseMessageText(firstUserMsg.content_json);
    return text.length > 40 ? text.slice(0, 40) + "..." : text;
  }

  async function ensureThreadId(): Promise<string | null> {
    if (activeThreadId) return activeThreadId;
    if (!activeModelId) {
      setMemoryToast("No model selected. Enable a model in Settings → Models.");
      return null;
    }
    const thread = await invoke<ThreadRecord>("create_thread_cmd", {
      title: newThreadTitle,
      engineId: "openrouter_messages_agent",
      modelId: activeModelId
    });
    setThreads((prev) => [thread, ...prev]);
    setActiveThreadId(thread.id);
    return thread.id;
  }

  async function handleSendMessage() {
    const hasText = commandInput.trim().length > 0;
    const hasAttachments = attachments.length > 0;
    if (!hasText && !hasAttachments) return;

    if (providerKeys[0]?.hasKey !== true) {
      let hasKey = false;
      try {
        hasKey = await invoke<boolean>("has_provider_key_cmd", { provider: "openrouter" });
      } catch {
        hasKey = false;
      }
      if (!hasKey) {
        setMemoryToast("Missing OpenRouter key. Add it in Settings → Models.");
        setActiveView("settings");
        setSettingsPage("models");
        return;
      }
      setProviderKeys((prev) =>
        prev.map((item) =>
          item.id === "openrouter" ? { ...item, hasKey: true, error: null } : item
        )
      );
    }

    const sessionId = await ensureThreadId();
    if (!sessionId) return;
    const userText = commandInput.trim();
    const currentAttachments = [...attachments];
    setCommandInput("");
    setAttachments([]);
    setIsSending(true);
    autoScrollEnabledRef.current = true;
    try {
      // Build content JSON with text and attachments
      const contentPayload: {
        text: string;
        attachments?: Array<{ path: string; name: string; type: string; size: number }>;
      } = { text: userText };
      if (currentAttachments.length > 0) {
        contentPayload.attachments = currentAttachments.map((a) => ({
          path: a.path,
          name: a.name,
          type: a.type,
          size: a.size
        }));
      }
      await invoke("add_message_cmd", {
        sessionId,
        role: "user",
        contentJson: JSON.stringify(contentPayload)
      });
      await loadMessages(sessionId);
      const handledSlash = await handleSlashCommand(userText, sessionId);
      if (handledSlash) {
        return;
      }

      if (userText.length > 0) {
        // Ensure the active thread has an engine/model selected (legacy threads may be missing model_id).
        const ensured = await (async () => {
          const fromState = threads.find((t) => t.id === sessionId) ?? null;
          const fromDb = fromState ?? (await invoke<ThreadRecord | null>("get_thread_cmd", { threadId: sessionId }));
          const currentModel = (fromDb?.model_id ?? "").trim();
          const desiredModel = (activeModelId ?? "").trim();
          const modelToUse = desiredModel || currentModel;
          if (!modelToUse) {
            setMemoryToast("No model selected. Enable a model in Settings → Models.");
            return null;
          }
          if (!isModelReady(modelToUse)) {
            setMemoryToast("Selected model is unavailable. Pick another model in Settings → Models.");
            setActiveView("settings");
            setSettingsPage("models");
            return null;
          }
	          if (
	            fromDb &&
	            fromDb.engine_id === "openrouter_messages_agent" &&
	            (fromDb.model_id ?? "").trim() === modelToUse
	          ) {
	            return fromDb;
	          }
	          try {
	            const updated = await invoke<ThreadRecord>("set_thread_engine_cmd", {
	              threadId: sessionId,
	              engineId: "openrouter_messages_agent",
	              modelId: modelToUse
	            });
            setThreads((prev) => {
              const existingIndex = prev.findIndex((t) => t.id === updated.id);
              if (existingIndex === -1) return [updated, ...prev];
              const next = [...prev];
              next[existingIndex] = updated;
              return next;
            });
            return updated;
          } catch (error) {
            console.error("Failed to set thread model:", error);
            return null;
          }
        })();
        if (!ensured) return;

        // Clear any prior streaming state before issuing a new turn.
        streamingContentRef.current = null;
        streamingTokensRef.current = null;
        streamingMetaRef.current = null;
        scheduleStreamingUpdate();

        await invoke<SendTurnResult>("engine_send_turn_cmd", {
          threadId: sessionId,
          cwd: activeProject?.root_path ?? workspaceRoot ?? ".",
          input: userText
        });
        await loadMessages(sessionId);
      }
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Unknown error";
      await invoke("add_message_cmd", {
        sessionId,
        role: "assistant",
        contentJson: JSON.stringify({ text: `Engine error: ${message}` })
      });
      await loadMessages(sessionId);
    } finally {
      setIsSending(false);
      setAgentStatus(null);
      setRunningTools([]);
    }
  }

  async function proposeShellCommand(_sessionId: string, _command: string) {
    setSlashPanel({
      kind: "info",
      title: "Disabled",
      body: "Internal tool execution is disabled in MVP; use the engine terminal."
    });
  }

  async function handleSlashCommand(userText: string, sessionId: string): Promise<boolean> {
    if (!userText.startsWith("/")) return false;
    const [rawName] = userText.slice(1).trim().split(/\s+/);
    const name = (rawName || "").toLowerCase();
    if (!name) return false;

    const showPanel = (kind: "status" | "approvals" | "info", title: string, body?: string) => {
      setSlashPanel({ kind, title, body });
    };

    if (name === "status") {
      const lastMsg = sessionResume?.last_message_at
        ? formatRelativeTime(sessionResume.last_message_at)
        : "—";
      const responseId = sessionResume?.last_response_id ?? "—";
      const text = [
        "Status",
        `Session: ${sessionId}`,
        `Mode: ${agentMode}`,
        `Model: ${activeModelId ?? "none"}`,
        `Workspace: ${workspaceRoot ?? "."}`,
        `Project: ${activeProject?.name ?? activeProject?.root_path ?? "none"}`,
        `Last message: ${lastMsg}`,
        `Last response: ${responseId}`,
        "Internal tool system: disabled (use engine terminal)"
      ].join("\n");
      showPanel("status", "Status", text);
      return true;
    }

    if (name === "mode") {
      const rest = userText.slice(userText.indexOf("mode") + "mode".length).trim();
      const requested = (rest || "").toLowerCase();
      if (!requested) {
        showPanel("info", "Mode", `Current mode: ${agentMode}\n\nUsage: /mode build|plan|explore`);
        return true;
      }
      if (requested !== "build" && requested !== "plan" && requested !== "explore") {
        showPanel("info", "Mode", "Invalid mode. Usage: /mode build|plan|explore");
        return true;
      }
      await invoke("set_agent_mode_cmd", { sessionId, mode: requested });
      setAgentMode(requested as AgentMode);
      showPanel("info", "Mode", `Set mode: ${requested}`);
      return true;
    }

    if (name === "approvals") {
      const globalRules = execPolicyRules.trim() ? execPolicyRules.trim() : "prompt";
      const sessionRules = sessionExecPolicyRules.trim()
        ? sessionExecPolicyRules.trim()
        : "(none)";
      const text = [
        "Approvals",
        "Session rules (applied first):",
        sessionRules,
        "",
        "Global rules:",
        globalRules
      ].join("\n");
      showPanel("approvals", "Approvals", text);
      return true;
    }

    if (name === "diff") {
      await proposeShellCommand(sessionId, "git diff");
      showPanel("info", "Diff", "Proposed: git diff");
      return true;
    }

    if (name === "test") {
      const cwd = activeProject?.root_path ?? workspaceRoot ?? ".";
      const commands = await invoke<string[]>("detect_test_commands_cmd", {
        cwd
      });
      if (!commands || commands.length === 0) {
        showPanel("info", "Test", "No test command detected for this project.");
        return true;
      }
      const command = commands[0];
      await proposeShellCommand(sessionId, command);
      const more = commands.length > 1 ? ` (also found: ${commands.slice(1).join(", ")})` : "";
      showPanel("info", "Test", `Proposed: ${command}${more}`);
      return true;
    }

    if (name === "remember") {
      const rest = userText.slice(userText.indexOf("remember") + "remember".length).trim();
      try {
        if (!rest) {
          showPanel(
            "info",
            "Memory",
            "Usage:\n/remember <content>\n/remember global: <content>\n/remember workspace: <content>"
          );
          return true;
        }

        let scope: "global" | "workspace" = "workspace";
        let content = rest;
        const scopeMatch = rest.match(/^(global|workspace)\s*:\s*([\s\S]+)$/i);
        if (scopeMatch) {
          scope = scopeMatch[1].toLowerCase() as "global" | "workspace";
          content = scopeMatch[2];
        }
        content = content.trim();
        if (!content) {
          showPanel(
            "info",
            "Memory",
            "Usage:\n/remember <content>\n/remember global: <content>\n/remember workspace: <content>"
          );
          return true;
        }

        await invoke("create_personal_memory_item_cmd", {
          threadId: sessionId,
          content,
          scope,
          scopeId: scope === "workspace" ? getEffectiveWorkspacePath() : null,
          pinned: false,
          provenanceEventId: null
        });
        setActiveView("settings");
        setSettingsPage("memory");
        setPersonalMemoryQuery("");
        await loadPersonalMemoryItems();
        showPanel("info", "Memory", `Saved to ${scope} memory.`);
      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to save memory";
        showPanel("info", "Memory", message);
      }
      return true;
    }

    showPanel("info", "Slash command", `Unknown slash command: /${name}`);
    return true;
  }

  async function applyApprovalMode(mode: "read-only" | "agent" | "agent-full") {
    const preset = APPROVAL_PRESETS[mode];
    setApprovalMode(mode);
    setExecPolicyRules(preset.rules);
    await invoke("set_approval_mode_cmd", { mode });
    await invoke("set_exec_policy_rules_cmd", { rules: preset.rules });
  }

	  async function handleSlashSelect(command: string) {
	    const sessionId = await ensureThreadId();
	    if (!sessionId) return;
	    setCommandInput("");
	    setIsSending(true);
	    try {
	      await handleSlashCommand(command, sessionId);
	    } finally {
	      setIsSending(false);
	      setAgentStatus(null);
	      setRunningTools([]);
	    }
		  }

	  async function runToolCallThroughBackend(_toolCall: ToolCallRecord) {
	    setSlashPanel({
	      kind: "info",
	      title: "Disabled",
	      body: "Internal tool execution is disabled in this MVP."
	    });
	  }

	  async function respondPermission(toolCall: ToolCallRecord, response: "session" | "always") {
	    if (!activeThreadId) return;
	    const modelId = activeModelId ?? "";
	    const cwd = activeProject?.root_path ?? workspaceRoot ?? ".";
	    try {
	      const message = await invoke<string>("respond_permission_cmd", {
	        sessionId: activeThreadId,
	        modelId,
	        toolCallId: toolCall.id,
	        response,
	        cwd
	      });
	      setMemoryToast(message);
	      if (memoryToastTimeoutRef.current) {
	        window.clearTimeout(memoryToastTimeoutRef.current);
	      }
	      memoryToastTimeoutRef.current = window.setTimeout(() => {
	        setMemoryToast(null);
	      }, 2000);
	    } catch (error) {
	      console.error("Failed to respond to permission:", error);
	    }
	  }

	  async function handleApproveAndRun(toolCall: ToolCallRecord) {
	    await runToolCallThroughBackend(toolCall);
	  }

	  async function handleRejectToolCall(toolCall: ToolCallRecord) {
	    setToolCalls((prev) =>
	      prev.map((item) =>
	        item.id === toolCall.id ? { ...item, status: "rejected" } : item
	      )
	    );
	  }

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

  const isAgentToolCallRecord = (call: ToolCallRecord): boolean =>
    ([
      "read",
      "list_dir",
      "sha256",
      "write",
      "edit",
      "apply_patch",
      "glob",
      "grep",
      "task",
      "invalid",
      "bash"
    ] as const).includes(call.tool_name as any) &&
    (["requested", "approved", "denied", "started", "finished"] as const).includes(call.status as any);

  const activeToolGroups = useMemo((): ToolGroupRecord[] => {
    const groups = new Map<string, ToolGroupRecord>();
    for (const call of activeToolCalls) {
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
    return activeToolCalls.filter((call) => !isAgentToolCallRecord(call));
  }, [activeToolCalls]);

  // Combined feed: messages + tool groups sorted by created_at
  type FeedItem =
    | { type: "message"; data: MessageRecord }
    | { type: "tool_group"; data: ToolGroupRecord }
    | { type: "tool"; data: ToolCallRecord };

  const combinedFeed = useMemo((): FeedItem[] => {
    const items: FeedItem[] = [
      ...messages.map((m): FeedItem => ({ type: "message", data: m })),
      ...activeToolGroups.map((t): FeedItem => ({ type: "tool_group", data: t })),
      ...activeUngroupedToolCalls.map((t): FeedItem => ({ type: "tool", data: t })),
    ];
    return items.sort((a, b) => {
      const aTime = a.type === "message" ? a.data.created_at : a.data.created_at;
      const bTime = b.type === "message" ? b.data.created_at : b.data.created_at;
      return aTime - bTime;
    });
  }, [messages, activeToolGroups, activeUngroupedToolCalls]);

  const [expandedOutputIds, setExpandedOutputIds] = useState<Set<string>>(new Set());
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [sourcesUsed, setSourcesUsed] = useState<SourcesUsedState>({ open: false });

  async function resolvePendingToolApproval(
    approved: boolean,
    allowWriteEditForSession?: boolean
  ) {
    const pending = pendingToolApproval;
    if (!pending) return;
    setIsToolApprovalSubmitting(true);
    try {
      await invoke("decide_tool_call_cmd", {
        toolCallId: pending.tool_call_id,
        approved,
        allowWriteEditForSession,
      });
      setPendingToolApproval(null);
      if (approved && allowWriteEditForSession && activeThreadId) {
        setAutoApproveWriteEdit(true);
      }
    } catch (error) {
      console.error("Failed to resolve tool approval:", error);
      setMemoryToast("Failed to send tool approval decision.");
    } finally {
      setIsToolApprovalSubmitting(false);
    }
  }

  async function handleCopyMessage(messageId: string, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }

  async function handleOpenSourcesUsed(turn: TurnRecord) {
    setSourcesUsed({
      open: true,
      turnId: turn.id,
      isLoading: true,
      error: null,
      workspacePath: null,
      personalMemory: []
    });

    if (!activeThreadId) {
      setSourcesUsed({
        open: true,
        turnId: turn.id,
        isLoading: false,
        error: "No active thread.",
        workspacePath: null,
        personalMemory: []
      });
      return;
    }

    if (!turn.memory_retrieval_event_id) {
      setSourcesUsed({
        open: true,
        turnId: turn.id,
        isLoading: false,
        error: null,
        workspacePath: null,
        personalMemory: []
      });
      return;
    }

    try {
      const evt = await invoke<EventRecord | null>("get_event_cmd", {
        threadId: activeThreadId,
        eventId: turn.memory_retrieval_event_id
      });
      const payload = evt?.payload_json ? JSON.parse(evt.payload_json) : null;
      const workspacePath =
        payload && typeof payload === "object" ? (payload as { workspace_path?: unknown }).workspace_path : null;
      const personal = (payload as any)?.personal_memory?.items;
      const personalMemory: Array<{ id: string; content: string }> = Array.isArray(personal)
        ? personal
            .map((it: any) => ({
              id: typeof it?.id === "string" ? it.id : "",
              content: typeof it?.content === "string" ? it.content : ""
            }))
            .filter((it: any) => it.id && it.content)
        : [];

      setSourcesUsed({
        open: true,
        turnId: turn.id,
        isLoading: false,
        error: null,
        workspacePath: typeof workspacePath === "string" ? workspacePath : null,
        personalMemory
      });
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to load sources.";
      setSourcesUsed({
        open: true,
        turnId: turn.id,
        isLoading: false,
        error: message,
        workspacePath: null,
        personalMemory: []
      });
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

  return (
    <div className="app-root">
      <header className="app-topbar" data-tauri-drag-region>
        <div className="topbar-left" data-tauri-drag-region>
          {activePage === "workspace" ? (
            activeView === "settings" ? (
              <button
                className="back-to-workspace"
                data-tauri-drag-region="false"
                onClick={() => setActiveView("home")}
                title="Back"
              >
                <svg viewBox="0 0 24 24" className="back-icon">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                <span className="back-path">
                  settings / {settingsPageLabel(settingsPage)}
                </span>
              </button>
            ) : (
              <>
                <button
                  className={`icon-button${userWantsSessions ? " active" : ""}`}
                  data-tauri-drag-region="false"
                  onClick={() => setUserWantsSessions((prev) => !prev)}
                  aria-label="Toggle threads panel"
                  title="Toggle threads panel"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M9 4v16" />
                  </svg>
                </button>
                <button
                  className="workspace-selector"
                  data-tauri-drag-region="false"
                  onClick={handleChangeWorkspace}
                  title={
                    workspaceRoot
                      ? `CWD: ${effectiveCwd}\nWorkspace root: ${workspaceRoot}`
                      : `CWD: ${effectiveCwd}`
                  }
                >
                  <svg viewBox="0 0 24 24" className="workspace-icon">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  <span className="workspace-name">
                    {effectiveCwd === "."
                      ? "Select directory..."
                      : effectiveCwd.split("/").pop() ?? effectiveCwd}
                  </span>
                </button>
                <button
                  className="new-session-header-btn"
                  data-tauri-drag-region="false"
                  onClick={handleCreateThread}
                  title="New thread"
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              </>
            )
          ) : (
            <button
              className="back-to-workspace"
              data-tauri-drag-region="false"
              onClick={() => setActivePage("workspace")}
              title="Back to workspace"
            >
              <svg viewBox="0 0 24 24" className="back-icon">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span className="back-path">
                workspace{workspaceRoot ? ` / ${workspaceRoot.split("/").pop()}` : ""}
              </span>
            </button>
          )}
        </div>
        <div className="topbar-right" data-tauri-drag-region>
          {activeThreadId && (
            <button
              className={`icon-button${pinnedThreadCommunityId ? " active" : ""}`}
              data-tauri-drag-region="false"
              onClick={handleToggleThreadCommunityPin}
              disabled={!activeCommunityId && !pinnedThreadCommunityId}
              aria-label="Toggle community context for thread"
              title={
                pinnedThreadCommunityId
                  ? "Disable community context for this thread"
                  : "Enable community context for this thread"
              }
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M16 3l5 5-4 4v6l-2 2-4-4H5l6-6-4-4 2-2h6z" />
              </svg>
            </button>
          )}
          <button
            className={`icon-button community-btn${activePage !== "workspace" ? " active" : ""}`}
            data-tauri-drag-region="false"
            onClick={() => {
              if (activeView === "settings") {
                setActiveView("home");
              }

              if (activePage !== "workspace") {
                setActiveView("home");
                setActivePage("workspace");
                return;
              }

              if (communities.length === 0) {
                setActiveView("home");
                setActivePage("discover");
                return;
              }

              setActiveView("home");
              setActivePage("community");
              setCommunityTab("chat");
              setUnreadCount(0); // Clear unread when opening community
            }}
            aria-label="Community"
            title="Community"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            {unreadCount > 0 && activePage !== "community" && (
              <span className="unread-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
            )}
          </button>
        </div>
      </header>
      <div className={`app-shell${showCommunityRail ? " with-community-rail" : ""}${((activePage === "workspace" && !showSidePanel) || activePage === "discover") ? " no-left" : ""}${(activePage === "workspace" || !showCommunityPanel) ? " no-right" : ""}${sessionsCompact ? " sessions-compact" : ""}`}>
      {showCommunityRail && (
        <aside className="rail community-rail" aria-label="Communities">
          <div className="rail-main">
            <button
              type="button"
              className={`community-rail-button${activePage === "discover" ? " active" : ""}`}
              onClick={() => {
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
                className={`community-rail-button${community.id === activeCommunityId ? " active" : ""}`}
                onClick={() => handleSelectActiveCommunity(community.id)}
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
            {communities.length === 0 && (
              <div className="community-rail-empty">
                {actionablePendingInvites.length > 0
                  ? `Invite waiting: ${formatInviteLabel(
                      actionablePendingInvites[0].invite_key,
                      actionablePendingInvites[0].community_name
                    )}`
                  : supabaseSession
                    ? communitiesLoadError
                      ? "Couldn't load communities. Open Settings → Community."
                      : "No communities yet."
                    : "Sign in to access communities."}
              </div>
            )}
            <div className="community-rail-divider" />
            <button
              type="button"
              className="community-rail-button community-rail-add"
              onClick={openCreateCommunityModal}
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
                setActivePage("workspace");
                setActiveView((prev) => (prev === "settings" ? "home" : "settings"));
                setUserWantsSessions(true);
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
            {showSidePanel && activePage === "workspace" && (
        <aside className="sessions">
          {activeView === "settings" ? (
            <>
              <div className="panel-title">Settings</div>
              <div className="session-list">
                {(
                  ["account", "models", "execution", "memory", "appearance"] as const
                ).map((page) => (
                  <button
                    key={page}
                    className={settingsPage === page ? "nav-item active" : "nav-item"}
                    onClick={() => setSettingsPage(page)}
                    type="button"
                  >
                    {settingsPageLabel(page)}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
	              <div className="panel-title">Threads</div>
	              <div className="session-list">
	                {groupThreadsByDate(threads).map((group) => (
	                  <div key={group.label} className="session-group">
	                    <div className="session-group-label">{group.label}</div>
	                    {group.threads.map((thread) => (
	                      <div
	                        key={thread.id}
	                        className={`session-item${thread.id === activeThreadId ? " active" : ""}`}
	                        onClick={() => setActiveThreadId(thread.id)}
	                      >
	                        <div className="session-content">
	                          <div className="session-title">
	                            {(thread.title ?? "").trim() || "Untitled thread"}
	                          </div>
	                          <div className="session-preview">
	                            {getThreadPreview(thread.id)}
	                          </div>
	                        </div>
                        <div className="session-meta">
                          <div className="session-actions">
                            <button
                              className="session-action"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteThread(thread.id);
                              }}
                              title="Delete thread"
                            >
                              <svg viewBox="0 0 24 24">
                                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                {threads.length === 0 && (
                  <div className="empty-state">No threads yet. Click + to start.</div>
                )}
              </div>
            </>
          )}
        </aside>
      )}
      {activePage === "community" && (
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
            onClick={() => setCommunityTab("chat")}
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
            onClick={() => setCommunityTab("library")}
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
            onClick={() => setCommunityTab("resources")}
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
            onClick={() => setCommunityTab("members")}
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
          {isActiveCommunityAdmin && (
            <>
              <div className="community-nav-divider" />
              <button
                className={communityTab === "settings" ? "nav-item active" : "nav-item"}
                onClick={() => {
                  setActivePage("community");
                  setActiveView("home");
                  setCommunityTab("settings");
                }}
              >
                <span className="nav-icon">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
                    <path d="M19.4 15a1 1 0 0 0 .2 1.1l.2.2a2 2 0 1 1-2.8 2.8l-.2-.2a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.2.2a2 2 0 1 1-2.8-2.8l.2-.2a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.2-.2a2 2 0 1 1 2.8-2.8l.2.2a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.2-.2a2 2 0 1 1 2.8 2.8l-.2.2a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6z" />
                  </svg>
                </span>
                Settings
              </button>
            </>
          )}
        </aside>
      )}
      <main className={`workspace${activePage !== "workspace" ? " community-mode" : ""}`}>
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
                        onChange={(event) =>
                          void handleCreateCommunityBannerUpload(event.target.files?.[0] ?? null)
                        }
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
                        setCreateCommunityVisibility(event.target.value as "public" | "unlisted" | "private")
                      }
                    >
                      <option value="private">Private</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="public">Public</option>
                    </select>
                  </label>
                  {createCommunityError && <div className="auth-error">{createCommunityError}</div>}
                </div>
              </div>
              <div className="modal-footer">
                <div className="create-community-actions">
                  {supabaseSession ? (
                    <button
                      className="create-community-primary"
                      onClick={() => void handleCreateCommunity()}
                      disabled={isCreatingCommunity || createCommunityName.trim().length === 0}
                    >
                      {isCreatingCommunity ? "Creating..." : "Create community"}
                    </button>
                  ) : (
                    <button className="create-community-primary" onClick={() => void handleSignIn()}>
                      Sign in to create
                    </button>
                  )}
                  <button className="create-community-secondary" onClick={closeCreateCommunityModal}>
                    Cancel
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
                    placeholder="Optional link or video URL (YouTube/Wistia)"
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
                  <button className="secondary" onClick={closeResourceModal}>
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
        {sourcesUsed.open && (
          <div className="modal-overlay" onClick={() => setSourcesUsed({ open: false })}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">Sources used</div>
                <button className="modal-close" onClick={() => setSourcesUsed({ open: false })} title="Close">
                  ×
                </button>
              </div>
              <div className="modal-body">
                {sourcesUsed.isLoading && <div className="chat-loading"><div className="loading-spinner" /><span>Loading…</span></div>}
                {!sourcesUsed.isLoading && sourcesUsed.error && (
                  <div className="auth-error">{sourcesUsed.error}</div>
                )}
                {!sourcesUsed.isLoading && !sourcesUsed.error && (
                  <>
                    {sourcesUsed.workspacePath && (
                      <div className="resource-meta">
                        <span>Workspace</span>
                        <span>{sourcesUsed.workspacePath}</span>
                      </div>
                    )}
                    <div className="panel-title">Personal memory</div>
                    {sourcesUsed.personalMemory.length === 0 ? (
                      <div className="chat-empty">No personal memory injected for this turn.</div>
                    ) : (
                      <div className="model-list">
                        {sourcesUsed.personalMemory.map((item) => (
                          <div key={item.id} className="model-toggle">
                            <span>{item.content}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        {activeView === "settings" ? (
          <div className="settings-panel">
            {settingsPage === "account" && (
              <>
                <div className="settings-section">
                  <div className="settings-section-title">Account</div>
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
                      <button onClick={() => void handleSignIn()}>Sign in</button>
                    </div>
                  )}
                  {authError && <div className="key-error">{authError}</div>}
                </div>

                <div className="settings-section">
                  <div className="settings-section-title">Profile</div>
                  <div className="settings-section-desc">
                    Local profile details shown in communities on this device.
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
                            (profileName || profileUsername || supabaseSession?.user.email || "AR")
                              .replace(/^@/, "")
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
                          onChange={(event) =>
                            void handleProfileAvatarUpload(event.target.files?.[0] ?? null)
                          }
                        />
                      </label>
                      {profileAvatarUrl && (
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
                </div>
              </>
            )}
            {settingsPage === "models" && (
              <>
                <div className="settings-section">
                  <div className="settings-section-title">API Key</div>
                  <div className="settings-section-desc">Connect your OpenRouter key to access models</div>
                  <div className="key-row">
                    <input
                      type="password"
                      value={providerKeys[0]?.inputValue ?? ""}
                      placeholder={providerKeys[0]?.hasKey ? "Key saved" : "Enter OpenRouter API key"}
                      onChange={(event) =>
                        setProviderKeys((prev) => [
                          { ...prev[0], inputValue: event.target.value }
                        ])
                      }
                    />
                    <button onClick={() => void handleSaveProviderKey("openrouter")}>
                      Save
                    </button>
                    <button
                      className="secondary"
                      onClick={() => void handleClearProviderKey("openrouter")}
                    >
                      Clear
                    </button>
                  </div>
                  {providerKeys[0]?.error && <div className="key-error">{providerKeys[0].error}</div>}
                </div>

                <div className="settings-section">
                  <div className="settings-section-title">Available Models</div>
                  <div className="settings-section-desc">Select which models to enable</div>
                  <div className="model-list">
                    {modelToggles.map((toggle) => (
                      <label key={toggle.id} className="model-toggle">
                        <input
                          type="checkbox"
                          checked={toggle.enabled}
                          disabled={providerKeys[0]?.hasKey === true && modelAvailability[toggle.id] === false}
                          onChange={() => void handleToggleModel(toggle.id)}
                        />
                        <span>
                          {toggle.label}
                          {!providerKeys[0]?.hasKey && " (missing key)"}
                          {providerKeys[0]?.hasKey === true && modelAvailability[toggle.id] === false && " (unavailable)"}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
            {settingsPage === "execution" && (
              <>
                <div className="settings-section">
                  <div className="settings-section-title">Approval Mode</div>
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
                  <div className="settings-section-title">Thread Overrides</div>
                  <div className="settings-section-desc">Settings for the current thread only</div>
                  <label className="model-toggle">
                    <input
                      type="checkbox"
                      checked={autoApproveWriteEdit}
                      disabled={!activeThreadId}
                      onChange={async (event) => {
                        const next = event.target.checked;
                        setAutoApproveWriteEdit(next);
                        if (!activeThreadId) return;
                        try {
                          await invoke("set_auto_approve_write_edit_cmd", {
                            threadId: activeThreadId,
                            enabled: next,
                          });
                        } catch {
                          setAutoApproveWriteEdit(!next);
                        }
                      }}
                    />
                    <span>Auto-approve write/edit for this thread</span>
                  </label>
                  <div className="approval-note">
                    Read/search tools never require approval. When enabled, write/edit skip prompts.
                  </div>
                  <div className="exec-policy">
                    <textarea
                      className="exec-policy-input"
                      value={sessionExecPolicyRules}
                      onChange={(event) => setSessionExecPolicyRules(event.target.value)}
                      placeholder="allow git status\nallow ls"
                    />
                    <div className="exec-policy-actions">
                      <button
                        onClick={() => void handleSaveSessionExecPolicyRules()}
                        disabled={isSavingSessionExecPolicy || !activeThreadId}
                      >
                        {isSavingSessionExecPolicy ? "Saving..." : "Save"}
                      </button>
                      <button
                        className="secondary"
                        onClick={() => {
                          setSessionExecPolicyRules("");
                          if (activeThreadId) {
                            void invoke("set_session_exec_policy_rules_cmd", {
                              sessionId: activeThreadId,
                              rules: ""
                            });
                          }
                        }}
                        disabled={!activeThreadId}
                      >
                        Clear
                      </button>
                      {sessionExecPolicyError && (
                        <div className="exec-policy-error">{sessionExecPolicyError}</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-title">Global Policy Rules</div>
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
            {settingsPage === "memory" && (
              <>
                <div className="panel-title">Memory</div>
                <div className="memory-panel">
                  {personalMemoryError && (
                    <div className="memory-error">{personalMemoryError}</div>
                  )}

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
                      <div className="memory-editor-meta">
                        {newPersonalMemoryScope}
                      </div>
                    </div>
                    <textarea
                      value={newPersonalMemoryContent}
                      onChange={(event) => setNewPersonalMemoryContent(event.target.value)}
                      placeholder="Write a durable preference/fact…"
                    />
                    <div className="memory-editor-actions">
                      <select
                        className="select-styled"
                        value={newPersonalMemoryScope}
                        onChange={(event) =>
                          setNewPersonalMemoryScope(event.target.value as "global" | "workspace")
                        }
                      >
                        <option value="workspace">Workspace</option>
                        <option value="global">Global</option>
                      </select>
                      <label className="memory-pin-toggle">
                        <input
                          type="checkbox"
                          checked={newPersonalMemoryPinned}
                          onChange={(event) => setNewPersonalMemoryPinned(event.target.checked)}
                        />
                        Pinned
                      </label>
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
                </div>
              </>
            )}
            {settingsPage === "appearance" && (
              <>
                <div className="panel-title">Appearance</div>
                <div className="appearance-panel">
                  <div className="appearance-selector">
                    <div className="appearance-title">Theme</div>
                    <div className="appearance-options">
                      {([
                        { id: "light", label: "Light", description: "Default light theme", disabled: false },
                        { id: "dark", label: "Dark", description: "Default dark theme", disabled: false },
                        { id: "light-warm", label: "Light (Warm)", description: "Stone + charcoal + gold", disabled: false },
                        { id: "dark-warm", label: "Dark (Warm)", description: "Warm obsidian + champagne gold", disabled: false },
                      ] as const).map((theme) => (
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
        <div className="workspace-body">
          {taskPlan && (
            <div className="plan-panel">
              <div className="plan-panel-title">Plan</div>
              {taskPlan.explanation && (
                <div className="plan-panel-explanation">{taskPlan.explanation}</div>
              )}
              <div className="plan-panel-items">
                {taskPlan.plan.map((item, idx) => (
                  <div key={`${item.status}-${idx}`} className="plan-panel-item">
                    <span className="plan-panel-status">{item.status}</span>
                    <span className="plan-panel-step">{item.step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
            {combinedFeed.map((item, index) => {
              if (item.type === "message") {
                const message = item.data;
                const isUser = message.role === "user";
                const parsedContent = parseMessageContent(message.content_json);
                const textContent = parsedContent.text;
                const isTerminal = parsedContent.format === "terminal";
                const messageSignature = !isUser
                  ? formatExecutionLabel(message.engine_id, message.model_id, modelToggles)
                  : null;

                // Check if this is the end of an agent turn:
                // - Not a user message
                // - Next item is either a user message or end of feed
                // - Not currently streaming
                const nextMessageItem = (() => {
                  for (let i = index + 1; i < combinedFeed.length; i++) {
                    const candidate = combinedFeed[i];
                    if (candidate.type === "message") return candidate;
                  }
                  return null;
                })();
                const isEndOfTurn = !isUser &&
                  !streamingContent &&
                  (!nextMessageItem || nextMessageItem.data.role === "user");

                // Collect all assistant message text from this turn for copying
                let turnContent = "";
                if (isEndOfTurn) {
                  // Walk backwards to collect all assistant messages in this turn
                  for (let i = index; i >= 0; i--) {
                    const turnItem = combinedFeed[i];
                    if (turnItem.type === "message") {
                      if (turnItem.data.role === "user") break;
                      turnContent = parseMessageText(turnItem.data.content_json) + (turnContent ? "\n\n" + turnContent : "");
                    }
                  }
                }

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
                          : renderMarkdown(textContent)}
                    </div>
                    {!isUser && (
                      <div className="message-footer">
                        {isEndOfTurn && (
                          <button
                            className={`message-copy-btn${copiedMessageId === message.id ? " copied" : ""}`}
                            onClick={() => handleCopyMessage(message.id, turnContent)}
                            title="Copy response"
                          >
                            <svg viewBox="0 0 24 24">
                              {copiedMessageId === message.id ? (
                                <polyline points="20 6 9 17 4 12" />
                              ) : (
                                <>
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </>
                              )}
                            </svg>
                          </button>
                        )}
                        {isEndOfTurn && turnsByAssistantEventId[message.id] && (
                          <button
                            className="message-copy-btn"
                            onClick={() => void handleOpenSourcesUsed(turnsByAssistantEventId[message.id])}
                            title="Sources used"
                          >
                            <svg viewBox="0 0 24 24">
                              <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20" />
                              <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 0 4 19.5z" />
                            </svg>
                          </button>
                        )}
                        {messageSignature && (
                          <span className="message-meta">{messageSignature}</span>
                        )}
                      </div>
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

                const latest = calls[calls.length - 1] ?? null;
                const latestLabel = (() => {
                  if (!latest) return null;
                  try {
                    const args = JSON.parse(latest.args_json) as any;
                    const path = typeof args?.path === "string" ? args.path : null;
                    const cmd = typeof args?.cmd === "string" ? args.cmd : null;
                    const pat = typeof args?.pat === "string" ? args.pat : null;
                    const query = typeof args?.query === "string" ? args.query : null;
                    const invalidTool = typeof args?.tool === "string" ? args.tool : null;
                    if (latest.tool_name === "bash") return cmd ? `bash ${cmd}` : "bash";
                    if (latest.tool_name === "grep") return pat ? `grep ${pat}` : "grep";
                    if (latest.tool_name === "glob") return pat ? `glob ${pat}` : "glob";
                    if (latest.tool_name === "list_dir") return path ? `ls ${path}` : "ls";
                    if (latest.tool_name === "sha256") return path ? `sha256 ${path}` : "sha256";
                    if (latest.tool_name === "read") return path ? `read ${path}` : "read";
                    if (latest.tool_name === "write") return path ? `write ${path}` : "write";
                    if (latest.tool_name === "edit") return path ? `edit ${path}` : "edit";
                    if (latest.tool_name === "apply_patch") return path ? `apply_patch ${path}` : "apply_patch";
                    if (latest.tool_name === "task") {
                      const base = path ?? ".";
                      return query ? `task "${query}" in ${base}` : `task in ${base}`;
                    }
                    if (latest.tool_name === "invalid") return invalidTool ? `invalid ${invalidTool}` : "invalid";
                    return latest.tool_name;
                  } catch {
                    return latest.tool_name;
                  }
                })();

                return (
                  <details className="tool-group" key={group.id}>
                    <summary className="tool-group-summary">
                      <span className="tool-group-title">Tools ({calls.length})</span>
                      <span className="tool-group-counts">
                        {counts.ok > 0 && <span className="tool-group-count ok">✓ {counts.ok}</span>}
                        {counts.error > 0 && <span className="tool-group-count error">✗ {counts.error}</span>}
                        {counts.denied > 0 && <span className="tool-group-count denied">⛔ {counts.denied}</span>}
                      </span>
                      {latestLabel && <span className="tool-group-latest">{latestLabel}</span>}
                    </summary>
                    <div className="tool-group-items">
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

                        const path = typeof args.path === "string" ? args.path : null;
                        const cmd = typeof args.cmd === "string" ? args.cmd : null;
                        const pat = typeof args.pat === "string" ? args.pat : null;
                        const query = typeof args.query === "string" ? args.query : null;
                        const invalidTool = typeof args.tool === "string" ? args.tool : null;

                        const label = (() => {
                          if (toolCall.tool_name === "bash") return cmd ? `bash ${cmd}` : "bash";
                          if (toolCall.tool_name === "grep") {
                            const base = typeof args.path === "string" ? args.path : ".";
                            return pat ? `grep ${pat} in ${base}` : `grep in ${base}`;
                          }
                          if (toolCall.tool_name === "glob") {
                            const base = typeof args.path === "string" ? args.path : ".";
                            return pat ? `glob ${pat} in ${base}` : `glob in ${base}`;
                          }
                          if (toolCall.tool_name === "list_dir") return path ? `ls ${path}` : "ls";
                          if (toolCall.tool_name === "sha256") return path ? `sha256 ${path}` : "sha256";
                          if (toolCall.tool_name === "read") return path ? `read ${path}` : "read";
                          if (toolCall.tool_name === "write") return path ? `write ${path}` : "write";
                          if (toolCall.tool_name === "edit") return path ? `edit ${path}` : "edit";
                          if (toolCall.tool_name === "apply_patch") return path ? `apply_patch ${path}` : "apply_patch";
                          if (toolCall.tool_name === "task") {
                            const base = path ?? ".";
                            return query ? `task "${query}" in ${base}` : `task in ${base}`;
                          }
                          if (toolCall.tool_name === "invalid") return invalidTool ? `invalid ${invalidTool}` : "invalid";
                          return toolCall.tool_name;
                        })();

                        const execStatus = typeof summary?.exec_status === "string" ? summary.exec_status : null;
                        const note = typeof summary?.note === "string" ? summary.note : null;
                        const statusText = (() => {
                          if (toolCall.status === "requested") return "requested";
                          if (toolCall.status === "approved") return "approved";
                          if (toolCall.status === "denied") return "denied";
                          if (toolCall.status === "started") return "running";
                          if (toolCall.status === "finished") return execStatus === "ok" ? "ok" : "error";
                          return toolCall.status;
                        })();
                        const statusIcon = (() => {
                          if (toolCall.status === "denied") return "✗";
                          if (toolCall.status === "finished") return execStatus === "ok" ? "✓" : "✗";
                          if (toolCall.status === "approved") return "✓";
                          if (toolCall.status === "started" || toolCall.status === "requested") return "⏳";
                          return "•";
                        })();

                        const artifacts: any[] = Array.isArray(summary?.artifacts) ? summary.artifacts : [];
                        const artifactLines = artifacts
                          .map((artifact) => {
                            if (!artifact || typeof artifact !== "object") return null;
                            const type = typeof (artifact as any).type === "string" ? (artifact as any).type : "artifact";
                            const artifactPath =
                              typeof (artifact as any).path === "string" ? (artifact as any).path : "(unknown)";
                            if (type === "file_edit" || type === "file_write" || type === "file_patch") {
                              const before =
                                typeof (artifact as any).before_sha256 === "string" ? (artifact as any).before_sha256 : null;
                              const after =
                                typeof (artifact as any).after_sha256 === "string" ? (artifact as any).after_sha256 : null;
                              return `${type}: ${artifactPath}${before && after ? `\n  ${before} → ${after}` : ""}`;
                            }
                            if (type === "file_hash") {
                              const sha = typeof (artifact as any).sha256 === "string" ? (artifact as any).sha256 : null;
                              return `file_hash: ${artifactPath}${sha ? `\n  ${sha}` : ""}`;
                            }
                            return `${type}: ${artifactPath}`;
                          })
                          .filter(Boolean) as string[];

                        const output = [toolCall.stdout_excerpt, toolCall.stderr_excerpt].filter(Boolean).join("\n");
                        const isExpanded = expandedOutputIds.has(toolCall.id);

                        return (
                          <div key={toolCall.id} className="tool-inline">
                            <div className="tool-command">
                              <span className="tool-prompt">↳</span>
                              <code>{label}</code>
                            </div>
                            <div className="tool-status-row">
                              <span className={`tool-status ${statusText}`}>
                                {statusIcon} {statusText}
                              </span>
                              {(output || artifactLines.length > 0 || note) && (
                                <button className="tool-toggle" onClick={() => toggleOutputExpanded(toolCall.id)}>
                                  {isExpanded ? "▼ details" : "▶ details"}
                                </button>
                              )}
                            </div>
                            {isExpanded && (
                              <>
                                {note && <div className="tool-output-meta">note: {note}</div>}
                                {artifactLines.length > 0 && (
                                  <pre className="tool-output">{artifactLines.join("\n\n")}</pre>
                                )}
                                {output && <pre className="tool-output">{output}</pre>}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </details>
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
	                    "apply_patch",
	                    "glob",
	                    "grep",
	                    "task",
	                    "invalid",
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

                  const path = typeof args.path === "string" ? args.path : null;
                  const cmd = typeof args.cmd === "string" ? args.cmd : null;
                  const pat = typeof args.pat === "string" ? args.pat : null;

                  const label = (() => {
                    if (toolCall.tool_name === "bash") return cmd ? `bash ${cmd}` : "bash";
                    if (toolCall.tool_name === "grep") {
                      const base = typeof args.path === "string" ? args.path : ".";
                      return pat ? `grep ${pat} in ${base}` : `grep in ${base}`;
                    }
                    if (toolCall.tool_name === "glob") {
                      const base = typeof args.path === "string" ? args.path : ".";
                      return pat ? `glob ${pat} in ${base}` : `glob in ${base}`;
                    }
                    if (toolCall.tool_name === "sha256") return path ? `sha256 ${path}` : "sha256";
                    if (toolCall.tool_name === "read") return path ? `read ${path}` : "read";
                    if (toolCall.tool_name === "write") return path ? `write ${path}` : "write";
                    if (toolCall.tool_name === "edit") return path ? `edit ${path}` : "edit";
                    return toolCall.tool_name;
                  })();

                  const execStatus = typeof summary?.exec_status === "string" ? summary.exec_status : null;
                  const note = typeof summary?.note === "string" ? summary.note : null;
                  const statusText = (() => {
                    if (toolCall.status === "requested") return "requested";
                    if (toolCall.status === "approved") return "approved";
                    if (toolCall.status === "denied") return "denied";
                    if (toolCall.status === "started") return "running";
                    if (toolCall.status === "finished") return execStatus === "ok" ? "ok" : "error";
                    return toolCall.status;
                  })();
                  const statusIcon = (() => {
                    if (toolCall.status === "denied") return "✗";
                    if (toolCall.status === "finished") return execStatus === "ok" ? "✓" : "✗";
                    if (toolCall.status === "approved") return "✓";
                    if (toolCall.status === "started" || toolCall.status === "requested") return "⏳";
                    return "•";
                  })();

                  const artifacts: any[] = Array.isArray(summary?.artifacts) ? summary.artifacts : [];
                  const artifactLines = artifacts
                    .map((artifact) => {
                      if (!artifact || typeof artifact !== "object") return null;
                      const type = typeof (artifact as any).type === "string" ? (artifact as any).type : "artifact";
                      const artifactPath =
                        typeof (artifact as any).path === "string" ? (artifact as any).path : "(unknown)";
                      if (type === "file_edit" || type === "file_write") {
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

                  const output = [toolCall.stdout_excerpt, toolCall.stderr_excerpt].filter(Boolean).join("\n");
                  const isExpanded = expandedOutputIds.has(toolCall.id);

                  return (
                    <div key={toolCall.id} className="tool-inline">
                      <div className="tool-command">
                        <span className="tool-prompt">↳</span>
                        <code>{label}</code>
                      </div>
                      <div className="tool-status-row">
                        <span className={`tool-status ${statusText}`}>
                          {statusIcon} {statusText}
                        </span>
                        {(output || artifactLines.length > 0 || note) && (
                          <button className="tool-toggle" onClick={() => toggleOutputExpanded(toolCall.id)}>
                            {isExpanded ? "▼ details" : "▶ details"}
                          </button>
                        )}
                      </div>
                      {isExpanded && (
                        <>
                          {note && <div className="tool-output-meta">note: {note}</div>}
                          {artifactLines.length > 0 && (
                            <pre className="tool-output">{artifactLines.join("\n\n")}</pre>
                          )}
                          {output && <pre className="tool-output">{output}</pre>}
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
                const isPatch = details.toolName === "apply_patch";
                const policy = policyByToolCallId[toolCall.id];
                const isForbidden = policy?.decision === "forbid";
                const isShell = details.toolName === "run_shell_command";
                const toolSpec = toolSpecsByName[details.toolName];
                const isDoomLoopGuarded = (() => {
                  if (!toolCall.output_summary_json) return false;
                  try {
                    const parsed = JSON.parse(toolCall.output_summary_json) as { guard?: string };
                    return parsed.guard === "doom_loop";
                  } catch {
                    return false;
                  }
                })();

                const cmdPreview = isPatch ? null : formatCommandPreview(details.command);
                const isCommandExpanded = expandedCommandIds.has(toolCall.id);
                const toolLabel = formatToolLabel(details, cmdPreview);

                return (
                  <div key={toolCall.id} className="tool-inline">
                    <div className="tool-command">
                      <span className="tool-prompt">$</span>
                      <code>{toolLabel}</code>
                      {toolSpec?.description && (
                        <span className="tool-command-meta">{toolSpec.description}</span>
                      )}
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
                      {policy && (
                        <span className={`tool-policy ${policy.decision}`}>
                          {policy.decision}
                        </span>
                      )}
                      {output && (
                        <button
                          className="tool-toggle"
                          onClick={() => toggleOutputExpanded(toolCall.id)}
                        >
                          {isOutputExpanded ? "▼ output" : "▶ output"}
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
	                      {isPatch && (
	                        <button
	                          className="tool-toggle"
	                          onClick={() => {
	                            setExpandedToolCallId((prev) =>
	                              prev === toolCall.id ? null : toolCall.id
	                            );
	                          }}
	                        >
	                          {expandedToolCallId === toolCall.id ? "▼ diff" : "▶ diff"}
	                        </button>
	                      )}
                      {toolCall.status === "proposed" && (
                        <>
                          <button
                            className="tool-action"
                            onClick={() => handleApproveAndRun(toolCall)}
                            disabled={isForbidden}
                          >
                            {isPatch ? "Apply" : "Run"}
                          </button>
                          <button
                            className="tool-action secondary"
                            onClick={() => handleRejectToolCall(toolCall)}
                          >
                            Reject
                          </button>
                          {!isPatch && !isShell && toolSpec?.requires_approval && (
                            <>
                              <button
                                className="tool-action secondary"
                                onClick={async () => {
                                  await respondPermission(toolCall, "session");
                                }}
                              >
                                Allow session
                              </button>
                              <button
                                className="tool-action secondary"
                                onClick={async () => {
                                  await respondPermission(toolCall, "always");
                                }}
                              >
                                Allow always
                              </button>
                            </>
                          )}
                          {!isPatch && isShell && (
                            <>
                              <button
                                className="tool-action secondary"
                                onClick={async () => {
                                  await respondPermission(toolCall, "session");
                                }}
                                disabled={isForbidden}
                              >
                                Allow session
                              </button>
                              <button
                                className="tool-action secondary"
                                onClick={async () => {
                                  await respondPermission(toolCall, "always");
                                }}
                                disabled={isForbidden}
                              >
                                Allow always
                              </button>
                            </>
                          )}
                          {!isPatch && !isShell && isDoomLoopGuarded && toolSpec && toolSpec.requires_approval === false && (
                            <>
                              <button
                                className="tool-action secondary"
                                onClick={async () => {
                                  await respondPermission(toolCall, "session");
                                }}
                              >
                                Allow session
                              </button>
                              <button
                                className="tool-action secondary"
                                onClick={async () => {
                                  await respondPermission(toolCall, "always");
                                }}
                              >
                                Allow always
                              </button>
                            </>
                          )}
                        </>
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
                    {isCommandExpanded && cmdPreview?.truncated && (
                      <pre className="tool-command-full">{formatCommandForDisplay(details.command)}</pre>
                    )}
                    {toolCall.status === "proposed" && isDoomLoopGuarded && (
                      <div className="tool-output-meta">
                        Possible doom loop: identical tool call repeated. Run once, allow session, allow always, or reject.
                      </div>
                    )}
                    {toolCall.status === "proposed" && isShell && (
                      <div className="tool-output-meta">
                        Note: approved shell commands are not confined to the workspace root (no OS sandbox).
                      </div>
                    )}
                    {isOutputExpanded && output && (
                      <pre className="tool-output">{output}</pre>
                    )}
                    {isPatch && expandedToolCallId === toolCall.id && (
                      <div className="diff-preview">
                        <div className="diff-toolbar">
                          <button
                            className="diff-copy"
                            onClick={() => {
                              if (!details.patch) return;
                              void navigator.clipboard.writeText(details.patch);
                            }}
                          >
                            Copy patch
                          </button>
                        </div>
                        {details.patch ? renderPatch(details.patch) : "No patch content."}
                      </div>
                    )}
                    {actionError && (
                      <div className="tool-error">Error: {actionError}</div>
                    )}
                    {policy?.matched_rule && (
                      <div className="tool-policy-reason">rule: {policy.matched_rule}</div>
                    )}
                  </div>
                );
              }
            })}
		            {streamingContent && (() => {
		              const { cleaned } = cleanStreamingContent(streamingContent);
		              const streamingSignature = formatExecutionLabel(
		                streamingMeta?.engine_id,
		                streamingMeta?.model_id,
		                modelToggles
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
                        {typeof streamingTokens.max_tokens === "number" && (
                          <span>max: {streamingTokens.max_tokens}</span>
                        )}
                      </div>
		                    )}
		                    {cleaned && renderMarkdown(cleaned)}
	                  </div>
	                  {streamingSignature && (
	                    <div className="message-meta block">{streamingSignature}</div>
	                  )}
                </div>
              );
	            })()}
            {/* Run activity indicator (works for streaming + non-streaming) */}
            {isSending && !pendingToolApproval && (() => {
              const activeThread = threads.find((t) => t.id === activeThreadId);
              const indicatorSignature = streamingMeta
                ? formatExecutionLabel(streamingMeta.engine_id, streamingMeta.model_id, modelToggles)
                : formatExecutionLabel(
                    activeThread?.engine_id ?? "openrouter_messages_agent",
                    activeModelId,
                    modelToggles
                  );
              const isWorking = agentStatus?.status === "working";
              const timeLabel = sendElapsedSec > 0 ? ` (${sendElapsedSec}s)` : "";
              const hasRunningTools = runningTools.length > 0;
              const hasStreamingStarted = Boolean((streamingContent ?? "").trim());

              // Hide the "thinking" indicator once token streaming begins.
              // Keep showing the tool stack while tools are running.
              if (hasStreamingStarted && !hasRunningTools) {
                return null;
              }

              return (
                <div className="run-activity-container">
                  {/* Running tools stack */}
                  {hasRunningTools && (
                    <div className="running-tools-stack">
                      {runningTools.map((tool) => (
                        <div key={tool.id} className={`running-tool-row ${tool.status}`}>
                          <span className="running-tool-icon">↳</span>
                          <span className="running-tool-name">{tool.name}</span>
                          {tool.preview && (
                            <span className="running-tool-preview">{tool.preview}</span>
                          )}
                          <span className={`running-tool-status ${tool.status}`}>
                            {tool.status === "running" ? (
                              <span className="running-dots">
                                <span></span><span></span><span></span>
                              </span>
                            ) : tool.status === "ok" ? (
                              "✓ ok"
                            ) : (
                              "✗ error"
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Status line (only before streaming starts) */}
                  {!hasStreamingStarted && (
                    <div className={`run-status-line${isWorking ? " working" : ""}`}>
                      <span className="run-status-label">
                        {isWorking ? "Working" : "Thinking"}
                        {timeLabel}
                      </span>
                      {indicatorSignature && <span className="run-status-model">{indicatorSignature}</span>}
                    </div>
                  )}
                </div>
              );
            })()}
            {pendingToolApproval && (() => {
              const formatted = formatToolApproval(pendingToolApproval.tool_name, pendingToolApproval.args_json);
              return (
                <div className="tool-approval-card">
                  <div className="tool-approval-header">
                    <span className="tool-approval-icon">{formatted.icon}</span>
                    <div className="tool-approval-title">
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
                      className="tool-action danger"
                      onClick={() => void resolvePendingToolApproval(false)}
                      disabled={isToolApprovalSubmitting}
                    >
                      Deny
                    </button>
                    <button
                      className="tool-action primary"
                      onClick={() => void resolvePendingToolApproval(true)}
                      disabled={isToolApprovalSubmitting}
                    >
                      Approve once
                    </button>
                    {(pendingToolApproval.tool_name === "write" ||
                      pendingToolApproval.tool_name === "edit" ||
                      pendingToolApproval.tool_name === "apply_patch") && (
                      <button
                        className="tool-action secondary"
                        onClick={() => void resolvePendingToolApproval(true, true)}
                        disabled={isToolApprovalSubmitting}
                        title="Automatically approve future file-change tool calls in this session"
                      >
                        Approve + allow file changes (session)
                      </button>
                    )}
                  </div>
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
              <button className="toolbar-icon" title="Web">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
              </button>
	              <div className="model-select">
	                <select
	                  value={activeModelId ?? ""}
	                  onChange={async (event) => {
	                    const modelId = event.target.value.trim();
	                    if (!modelId) return;
	                    setActiveModelId(modelId);
	                    await invoke("set_active_model_cmd", { modelId });
	                    if (!activeThreadId) return;
		                    try {
		                      await invoke<ThreadRecord>("set_thread_engine_cmd", {
		                        threadId: activeThreadId,
		                        engineId: "openrouter_messages_agent",
		                        modelId
		                      });
		                    } catch {
		                      // Non-fatal; keep local selection.
		                    }
	                  }}
	                >
	                  <optgroup label="Models">
	                    {enabledModels.length === 0 && <option value="" disabled>No models enabled</option>}
	                    {enabledModels.map((toggle) => (
	                      <option
	                        key={toggle.id}
	                        value={toggle.id}
	                        disabled={!isModelReady(toggle.id)}
	                      >
	                        {toggle.label}
	                        {!providerKeys[0]?.hasKey && " (missing key)"}
	                        {providerKeys[0]?.hasKey === true && modelAvailability[toggle.id] === false && " (unavailable)"}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>
            <div className="ask-toolbar-right">
              <button
                className="toolbar-send"
                onClick={handleSendMessage}
                disabled={isSending}
                title="Send"
              >
                <svg viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
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
                    <button className="discover-refresh" onClick={() => void loadDiscoverCommunities()}>
                      Refresh
                    </button>
                  </div>
                </div>
                <div className="workspace-body chat-feed">
                  <div className="chat-messages discover-grid">
                    {isLoadingDiscover && (
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
                        <div className="discover-empty-text">
                          Start one to make discovery meaningful.
                        </div>
                        <button
                          className="discover-empty-btn"
                          onClick={openCreateCommunityModal}
                        >
                          Create community
                        </button>
                      </div>
                    )}
                    {!isLoadingDiscover &&
                      filteredDiscoverCommunities.map((community) => {
                        const alreadyMember = communities.some((c) => c.id === community.id);
                        const isJoining = joiningDiscoverCommunityId === community.id;
                        const visibilityLabel =
                          community.visibility === "public"
                            ? "Public"
                            : community.visibility === "unlisted"
                              ? "Unlisted"
                              : "Private";
                        const isJoinable = community.visibility === "public";
                        const description =
                          community.description && community.description.trim().length > 0
                            ? community.description
                            : "No description yet.";
                        return (
                          <div key={community.id} className="discover-card">
                            <div className="discover-card-banner" />
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
                                    <span className={`discover-tag ${community.visibility ?? "private"}`}>
                                      {visibilityLabel}
                                    </span>
                                  </div>
                                  {community.slug && (
                                    <div className="discover-card-slug">/{community.slug}</div>
                                  )}
                                </div>
                              </div>
                              <div className="discover-card-stats">
                                <span>— Members</span>
                                <span className="discover-card-dot">•</span>
                                <span>— Active today</span>
                              </div>
                              <div className="discover-card-desc">{description}</div>
                              <div className="discover-card-foot">
                                <div className="discover-card-actions">
                                  {alreadyMember ? (
                                    <button
                                      className="discover-btn secondary"
                                      onClick={() => {
                                        setActiveCommunityId(community.id);
                                        setActivePage("community");
                                        setCommunityTab("chat");
                                      }}
                                    >
                                      Open
                                    </button>
                                  ) : !isJoinable ? (
                                    <button className="discover-btn secondary" disabled>
                                      Invite only
                                    </button>
                                  ) : (
                                    <button
                                      className="discover-btn primary"
                                      onClick={() => void handleJoinDiscoverCommunity(community)}
                                      disabled={isJoining}
                                    >
                                      {isJoining ? "Joining…" : supabaseSession ? "Join" : "Sign in"}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}
            {activePage === "community" && communityTab === "chat" && (
              <div className="community-chat">
                <div className="workspace-body chat-feed">
                  <div
                    className="chat-messages"
                    ref={communityChatListRef}
                    onScroll={handleChatScroll}
                  >
                    {!supabaseSession && (
                      <div className="chat-empty">Sign in to access community chat.</div>
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
                        <div className="chat-empty-title">Welcome to {activeCommunity.name}</div>
                        <div className="chat-empty-text">This is the beginning of your community chat. Say hello!</div>
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
	                      const avatarColor = getAvatarColor(message.sender_id);
	                      const shortTime = new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
	                      const replyToId = message.reply_to_id ?? null;
	                      const replyTarget = replyToId ? (communityMessageById.get(replyToId) ?? null) : null;
	                      const legacyReply = !replyToId ? parseReplyPrefix(message.body) : null;
	                      return (
                        <Fragment key={message.id}>
                          {dateSeparator && (
                            <div className="chat-date-separator">
                              <span>{dateSeparator}</span>
                            </div>
                          )}
                          <div
                            id={`msg-${message.id}`}
                            className={`chat-message${isPending ? " pending" : ""}${!showMeta ? " grouped" : ""}`}
                            data-time={shortTime}
                        >
                          <div
                            className="chat-avatar"
                            style={{ backgroundColor: avatarColor }}
                            title={displayName(message.sender_id)}
                          >
                            {getInitials(message.sender_id)}
                          </div>
                          <div className="chat-content">
                            <div className="chat-header">
                              <span className="chat-sender">{displayName(message.sender_id)}</span>
                              <span className="chat-time">{formatChatTime(message.created_at)}</span>
                            </div>
                            {editingMessageId === message.id ? (
                              <div className="chat-edit-form">
                                <textarea
                                  className="chat-edit-input"
                                  value={editingMessageText}
                                  onChange={(e) => setEditingMessageText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                      e.preventDefault();
                                      void handleSaveEdit();
                                    }
                                    if (e.key === "Escape") {
                                      handleCancelEdit();
                                    }
                                  }}
                                  autoFocus
                                  rows={1}
                                />
                                <div className="chat-edit-actions">
                                  <button className="chat-edit-btn save" onClick={() => void handleSaveEdit()}>
                                    Save
                                  </button>
                                  <button className="chat-edit-btn cancel" onClick={handleCancelEdit}>
                                    Cancel
                                  </button>
                                </div>
                              </div>
	                            ) : (
	                              <>
	                                {replyTarget && (
	                                  <button
	                                    type="button"
	                                    className="chat-reply-quote"
	                                    onClick={() => scrollToCommunityMessage(replyToId!)}
	                                    title="Jump to replied message"
	                                  >
	                                    <div className="chat-reply-sender">{displayName(replyTarget.sender_id)}</div>
	                                    <div className="chat-reply-text">
	                                      {truncateReplyPreview(parseReplyPrefix(replyTarget.body)?.rest ?? replyTarget.body)}
	                                    </div>
	                                  </button>
	                                )}
	                                {!replyTarget && replyToId && (
	                                  <div className="chat-reply-quote" title={`Reply to ${replyToId}`}>
	                                    <div className="chat-reply-sender">Reply</div>
	                                    <div className="chat-reply-text">Replied message not loaded</div>
	                                  </div>
	                                )}
	                                {legacyReply && (
	                                  <div className="chat-reply-quote">
	                                    <div className="chat-reply-sender">{legacyReply.sender}</div>
	                                    <div className="chat-reply-text">{legacyReply.preview}</div>
	                                  </div>
	                                )}
	                                <div className="chat-body">{legacyReply ? legacyReply.rest : message.body}</div>
	                              </>
	                            )}
                            {reactionPickerMessageId === message.id && (
                              <div className="reaction-picker">
                                {REACTION_EMOJIS.map(emoji => (
                                  <button
                                    key={emoji}
                                    className="reaction-picker-btn"
                                    onClick={() => void handleToggleReaction(message.id, emoji)}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                            {(() => {
                              const msgReactions = messageReactions.filter(r => r.message_id === message.id);
                              if (msgReactions.length === 0) return null;
                              const groups: Record<string, MessageReaction[]> = {};
                              for (const r of msgReactions) {
                                if (!groups[r.emoji]) groups[r.emoji] = [];
                                groups[r.emoji].push(r);
                              }
                              return (
                                <div className="chat-reactions">
                                  {Object.entries(groups).map(([emoji, reactions]) => {
                                    const hasOwn = reactions.some(r => r.user_id === supabaseSession?.user.id);
                                    return (
                                      <button
                                        key={emoji}
                                        className={`reaction-badge${hasOwn ? " own" : ""}`}
                                        onClick={() => void handleToggleReaction(message.id, emoji)}
                                        title={reactions.map(r => displayName(r.user_id)).join(", ")}
                                      >
                                        <span className="reaction-emoji">{emoji}</span>
                                        <span className="reaction-count">{reactions.length}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </div>
                          <div className="chat-actions">
                            <button
                              className="chat-action-btn"
                              onClick={() => setReactionPickerMessageId(
                                reactionPickerMessageId === message.id ? null : message.id
                              )}
                              title="Add reaction"
                            >
                              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></svg>
                            </button>
                            {!isPending && (
                              <button
                                className="chat-action-btn"
                                onClick={() => handleStartReply(message)}
                                title="Reply"
                              >
                                <svg viewBox="0 0 24 24">
                                  <path d="M9 17l-5-5 5-5" />
                                  <path d="M4 12h9a7 7 0 0 1 7 7v2" />
                                </svg>
                              </button>
                            )}
                            <button
                              className="chat-action-btn"
                              onClick={() => void copyTextToClipboard(message.body)}
                              title="Copy message"
                            >
                              <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                            </button>
                            {isOwn && !isPending && (
                              <>
                                <button
                                  className="chat-action-btn"
                                  onClick={() => handleStartEdit(message)}
                                  title="Edit"
                                >
                                  <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                </button>
                                <button
                                  className="chat-action-btn delete"
                                  onClick={() => void handleDeleteMessage(message.id)}
                                  title="Delete"
                                >
                                  <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                                </button>
                              </>
                            )}
                            </div>
                          </div>
                        </Fragment>
                        );
                      })}
                  </div>
                </div>
                {!isUserAtBottom && unreadCount > 0 && (
                  <button
                    className="scroll-to-bottom"
                    onClick={() => {
                      setIsUserAtBottom(true);
                      communityChatListRef.current?.scrollTo({
                        top: communityChatListRef.current.scrollHeight,
                        behavior: "smooth"
                      });
                    }}
                  >
                    {unreadCount} new message{unreadCount > 1 ? "s" : ""} ↓
                  </button>
                )}
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
                      <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                )}
                <div className="chat-input-bar">
                  <textarea
                    ref={chatInputRef}
                    className="chat-input"
                    placeholder={
                      !activeCommunity
                        ? "Select a community to chat..."
                        : "Message the community..."
                    }
                    value={communityMessageInput}
                    onChange={(event) => {
                      setCommunityMessageInput(event.target.value);
                      // Auto-resize
                      event.target.style.height = "auto";
                      event.target.style.height = Math.min(event.target.scrollHeight, 120) + "px";
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void handleSendCommunityMessage();
                      }
                    }}
                    disabled={!activeCommunity}
                    rows={1}
                  />
                  <button
                    className="chat-send"
                    onClick={() => void handleSendCommunityMessage()}
                    disabled={!activeCommunity || isSendingCommunityMessage}
                  >
                    <svg viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                  </button>
                </div>
                {communityChatError && (
                  <div className="auth-error">{communityChatError}</div>
                )}
              </div>
            )}
            {activePage === "community" && communityTab === "settings" && (
              <div className="settings-panel community-settings-panel">
                {!activeCommunity ? (
                  <div className="chat-empty">Select a community to edit settings.</div>
                ) : !supabaseSession ? (
                  <div className="chat-empty">Sign in to edit community settings.</div>
                ) : !isActiveCommunityAdmin ? (
                  <div className="chat-empty">Only admins can edit community settings.</div>
                ) : (
                  <>
                    <div className="panel-title">Community Settings</div>
                    <div className="create-community community-settings">
                      <div
                        className={`create-community-banner${isSettingsBannerDragOver ? " drag-over" : ""}`}
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
                        <label className="create-banner-btn">
                          Upload banner
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) =>
                              void handleCommunityBannerUpload(event.target.files?.[0] ?? null)
                            }
                          />
                        </label>
                        {communitySettingsBannerUrl && (
                          <button
                            className="create-banner-remove"
                            type="button"
                            onClick={() => setCommunitySettingsBannerUrl(null)}
                          >
                            Remove
                          </button>
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
                            <span>{communityInitials(communitySettingsName || activeCommunity?.name || "Community")}</span>
                          )}
                        </div>
                        <div className="create-community-avatar-actions">
                          <label className="create-avatar-btn">
                            Upload avatar
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(event) =>
                                void handleCommunityAvatarUpload(event.target.files?.[0] ?? null)
                              }
                            />
                          </label>
                          {communitySettingsAvatarUrl && (
                            <button
                              className="create-avatar-remove"
                              type="button"
                              onClick={() => setCommunitySettingsAvatarUrl(null)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                      <input
                        type="text"
                        placeholder="Name"
                        value={communitySettingsName}
                        onChange={(event) => setCommunitySettingsName(event.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="Slug"
                        value={communitySettingsSlug}
                        onChange={(event) => setCommunitySettingsSlug(event.target.value)}
                      />
                      <textarea
                        className="community-settings-textarea"
                        placeholder="Description (optional)"
                        value={communitySettingsDescription}
                        onChange={(event) => setCommunitySettingsDescription(event.target.value)}
                        rows={3}
                      />
                      <select
                        className="community-settings-select select-styled"
                        value={communitySettingsVisibility}
                        onChange={(event) => setCommunitySettingsVisibility(event.target.value)}
                      >
                        <option value="private">Private</option>
                        <option value="unlisted">Unlisted</option>
                        <option value="public">Public</option>
                      </select>
                      <button
                        onClick={() => void handleSaveCommunitySettings()}
                        disabled={isSavingCommunitySettings}
                      >
                        {isSavingCommunitySettings ? "Saving..." : "Save settings"}
                      </button>
                      {communitySettingsError && <div className="auth-error">{communitySettingsError}</div>}
                    </div>
                  </>
                )}
              </div>
            )}
            {activePage === "community" && communityTab === "library" && (
              <div className="community-panel library-panel">
                {!activeCommunity && "Select a community."}
                {activeCommunity && (
                  <div className="library-layout">
                    <div className="library-column">
                      <div className="resources-header">Artifacts</div>
                      <div className="library-list">
                        {isLoadingArtifacts && (
                          <div className="chat-loading">
                            <div className="loading-spinner" />
                            <span>Loading artifacts...</span>
                          </div>
                        )}
                        {!isLoadingArtifacts && artifacts.length === 0 && (
                          <div className="chat-empty">No artifacts yet.</div>
                        )}
                        {!isLoadingArtifacts &&
                          artifacts.map((artifact) => (
                            <button
                              key={artifact.id}
                              className={
                                artifact.id === selectedArtifactId
                                  ? "library-item active"
                                  : "library-item"
                              }
                              onClick={() => setSelectedArtifactId(artifact.id)}
                            >
                              <div className="library-item-title">{artifact.title}</div>
                              <div className="library-item-meta">
                                <span>{artifact.type}</span>
                                <span>{formatChatTime(artifact.updated_at)}</span>
                              </div>
                            </button>
                          ))}
                      </div>
                    </div>
                    <div className="library-column">
                      <div className="resources-header">Versions</div>
                      <div className="library-versions">
                        {!selectedArtifactId && (
                          <div className="chat-empty">Select an artifact.</div>
                        )}
                        {selectedArtifactId && isLoadingArtifactVersions && (
                          <div className="chat-loading">
                            <div className="loading-spinner" />
                            <span>Loading versions...</span>
                          </div>
                        )}
                        {selectedArtifactId &&
                          !isLoadingArtifactVersions &&
                          artifactVersions.length === 0 && (
                            <div className="chat-empty">No versions yet.</div>
                          )}
                        {selectedArtifactId &&
                          !isLoadingArtifactVersions &&
                          artifactVersions.map((version) => (
                            <div key={version.id} className="library-version">
                              <div className="library-version-meta">
                                <span>{formatChatTime(version.created_at)}</span>
                                <span>{displayName(version.created_by)}</span>
                              </div>
                              <div className="library-version-body">{version.body_md}</div>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {activePage === "community" && communityTab === "resources" && (
              <div className="community-panel resources-panel">
                <div className="resources-header-row">
                  <div className="resources-header">Resources</div>
                  <button
                    className="resources-add-btn"
                    onClick={openNewResourceModal}
                    disabled={!activeCommunity}
                    title="Add resource"
                  >
                    +
                  </button>
                </div>
                {resourceSuccess && (
                  <div className="success-toast">Resource saved successfully!</div>
                )}
                <div className="resource-list">
                  {isLoadingResources && (
                    <div className="chat-loading">
                      <div className="loading-spinner" />
                      <span>Loading resources...</span>
                    </div>
                  )}
                  {!isLoadingResources && communityResources.length === 0 && (
                    <div className="chat-empty">No resources yet.</div>
                  )}
                  {!isLoadingResources && communityResources.map((resource) => (
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
                              <img src={embedInfo.thumbnailUrl} alt="YouTube thumbnail" loading="lazy" />
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
                      {resource.body_md && (
                        <div className="resource-body">{resource.body_md}</div>
                      )}
                      <div className="resource-actions">
                        <button
                          className="secondary"
                          onClick={() => handleEditResource(resource)}
                        >
                          Edit
                        </button>
                        <button
                          className="danger"
                          onClick={() => void handleDeleteResource(resource.id)}
                        >
                          Delete
                        </button>
                      </div>
                          </>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activePage === "community" && communityTab === "members" && (
              <div className="community-panel members-panel">
                <div className={`members-layout${isActiveCommunityAdmin ? " with-invites" : ""}`}>
                  <section className="members-section">
                    <div className="members-header-row">
                      <div className="members-header">Members</div>
                      <div className="members-count">{communityMembers.length}</div>
                    </div>
                    <div className="members-list">
                      {communityMembers.length === 0 ? (
                        <div className="members-empty">No members yet.</div>
                      ) : (
                        communityMembers.map((member) => (
                          <div key={member.id} className="member-item">
                            <div
                              className="member-avatar"
                              style={{ backgroundColor: getAvatarColor(member.user_id) }}
                            >
                              {getInitials(member.user_id)}
                            </div>
                            <div className="member-info">
                              <span className="member-name">{displayName(member.user_id)}</span>
                              <span className="member-role">{member.role}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  {activeCommunity && supabaseSession && isActiveCommunityAdmin && (
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
                          <button
                            className="invite-create-btn"
                            onClick={() => void handleCreateInvite()}
                            disabled={isCreatingInvite}
                          >
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
                              const expired = Boolean(
                                invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()
                              );
                              const status = revoked ? "revoked" : expired ? "expired" : "active";
                              const bestInviteLink = buildBestInviteLink(activeCommunity, invite.code);
                              return (
                                <div key={invite.id} className="invite-row">
                                  <div className="invite-main">
                                    <div className="invite-code">{invite.code}</div>
                                    <div className={`invite-status ${status}`}>
                                      {status}
                                      {invite.max_uses ? ` • max ${invite.max_uses}` : ""}
                                      {invite.expires_at
                                        ? ` • exp ${new Date(invite.expires_at).toLocaleDateString()}`
                                        : ""}
                                    </div>
                                  </div>
                                  <div className="invite-actions">
                                    <button
                                      className="secondary"
                                      onClick={() =>
                                        void copyTextToClipboard(
                                          bestInviteLink.link
                                        )
                                      }
                                      title={bestInviteLink.kind === "web" ? "Copy web join link" : "Copy app link"}
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
          <div className="member-list">
            {communityMembers.length === 0 && (
              <div className="member-empty">No members yet.</div>
            )}
            {communityMembers.map((member) => (
              <div key={member.id} className="member-item">
                <div
                  className="member-avatar"
                  style={{ backgroundColor: getAvatarColor(member.user_id) }}
                >
                  {getInitials(member.user_id)}
                </div>
                <div className="member-info">
                  <span className="member-name">{displayName(member.user_id)}</span>
                  <span className="member-role">{member.role}</span>
                </div>
              </div>
            ))}
          </div>
        </aside>
      )}
      </div>
    </div>
  );
}

export default App;

// Format tool approval for inline display
function formatToolApproval(toolName: string, argsJson: string): {
  icon: string;
  title: string;
  subtitle: string | null;
  preview: string | null;
  previewType: "code" | "diff" | "text";
} {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson) as Record<string, unknown>;
  } catch {
    // fallback to raw
  }

  switch (toolName) {
    case "write":
    case "write_file": {
      const path = (args.path as string) || (args.file_path as string) || "file";
      const content = (args.content as string) || "";
      const isNew = args.expected_before_sha256 === null;
      return {
        icon: "✏️",
        title: isNew ? "Create File" : "Write File",
        subtitle: path,
        preview: content.length > 1000 ? content.slice(0, 1000) + "\n..." : content,
        previewType: "code",
      };
    }
    case "apply_patch": {
      const path = (args.path as string) || (args.file_path as string) || "file";
      const patch = (args.patch as string) || (args.unified_diff as string) || "";
      return {
        icon: "📝",
        title: "Apply Patch",
        subtitle: path,
        preview: patch.length > 1500 ? patch.slice(0, 1500) + "\n..." : patch,
        previewType: "diff",
      };
    }
    case "bash":
    case "run_shell_command": {
      const command = (args.cmd as string) || (args.command as string) || "";
      const cwd = (args.cwd as string) || ".";
      return {
        icon: "⚡",
        title: "Run Command",
        subtitle: cwd !== "." ? `in ${cwd}` : null,
        preview: command,
        previewType: "code",
      };
    }
    case "read_file": {
      const path = (args.path as string) || (args.file_path as string) || "file";
      return {
        icon: "📄",
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
        icon: "📂",
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
        icon: "🔍",
        title: "Search Content",
        subtitle: `"${query}" in ${path}`,
        preview: null,
        previewType: "text",
      };
    }
    default:
      return {
        icon: "🔧",
        title: toolName,
        subtitle: null,
        preview: JSON.stringify(args, null, 2),
        previewType: "code",
      };
  }
}

function parseToolCall(toolCall: ToolCallRecord): {
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
} {
  if (toolCall.command) {
    return { toolName: "run_shell_command", command: toolCall.command, shell: "zsh", cwd: "." };
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
      toolName: toolCall.tool_name || parsed.tool || "run_shell_command",
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
    return { toolName: toolCall.tool_name || "run_shell_command", command: "", shell: "zsh", cwd: "." };
  }
}

function formatCommandPreview(command: string): { preview: string; truncated: boolean; cmdCount: number } {
  // Split by && or | to count commands
  const segments = command.split(/\s*(?:&&|\|)\s*/).filter(Boolean);
  const cmdCount = segments.length;

  // Get first segment and truncate if needed
  const firstSegment = segments[0] || command;
  const maxLen = 80;

  // Also check for heredocs - truncate at first <<
  const heredocIndex = firstSegment.indexOf("<<");
  let preview = heredocIndex > 0 ? firstSegment.slice(0, heredocIndex + 10) + "..." : firstSegment;

  if (preview.length > maxLen) {
    preview = preview.slice(0, maxLen - 3) + "...";
  }

  const truncated = cmdCount > 1 || firstSegment !== preview || command.includes("<<");

  return { preview, truncated, cmdCount };
}

function formatCommandForDisplay(cmd: string): string {
  // Format multi-line commands for readability
  return cmd
    .replace(/\s*&&\s*/g, " \\\n  && ")
    .replace(/\s*\|\s*/g, " \\\n  | ");
}

function formatToolLabel(
  details: {
    toolName: string;
    command: string;
    path?: string;
    pattern?: string;
    srcPath?: string;
    destPath?: string;
    label?: string;
    query?: string;
  },
  cmdPreview: { preview: string } | null
): string {
  if (details.toolName === "run_shell_command") {
    return cmdPreview?.preview || details.command || "run shell command";
  }
  if (details.toolName === "read_file") {
    return details.path ? `read file ${details.path}` : "read file";
  }
  if (details.toolName === "list_dir") {
    return details.path ? `list dir ${details.path}` : "list dir";
  }
  if (details.toolName === "list_files") {
    return details.path ? `list files ${details.path}` : "list files";
  }
  if (details.toolName === "grep_files") {
    if (details.pattern?.trim()) {
      return `search ${details.pattern}`;
    }
    return "search files";
  }
  if (details.toolName === "grep_lines") {
    if (details.pattern?.trim()) {
      return `search lines ${details.pattern}`;
    }
    return "search lines";
  }
  if (details.toolName === "stat_file") {
    return details.path ? `stat ${details.path}` : "stat file";
  }
  if (details.toolName === "apply_patch") {
    return "apply patch";
  }
  if (details.toolName === "task") {
    const base = details.path ?? ".";
    return details.query?.trim() ? `task "${details.query}" in ${base}` : `task in ${base}`;
  }
  if (details.toolName === "invalid") {
    return "invalid tool call";
  }
  if (details.toolName === "propose_memory_update") {
    return "update memory";
  }
  if (details.toolName === "update_plan") {
    return "update plan";
  }
  if (details.toolName === "write_file") {
    return details.path ? `write file ${details.path}` : "write file";
  }
  if (details.toolName === "edit_file") {
    return details.path ? `edit file ${details.path}` : "edit file";
  }
  if (details.toolName === "multi_edit") {
    return "multi edit";
  }
  if (details.toolName === "mkdir") {
    return details.path ? `mkdir ${details.path}` : "mkdir";
  }
  if (details.toolName === "delete_file") {
    return details.path ? `delete file ${details.path}` : "delete file";
  }
  if (details.toolName === "copy_file") {
    if (details.srcPath && details.destPath) return `copy ${details.srcPath} → ${details.destPath}`;
    return "copy file";
  }
  if (details.toolName === "move_file") {
    if (details.srcPath && details.destPath) return `move ${details.srcPath} → ${details.destPath}`;
    return "move file";
  }
  return details.toolName || "tool";
}

function formatExecutionLabel(
  engineIdInput: string | null | undefined,
  modelIdInput: string | null | undefined,
  modelToggles: ModelToggle[]
): string | null {
  const engineId = (engineIdInput ?? "").trim();
  if (!engineId) return null;
  const normalizedEngineId = engineId.replace(/\s+/g, "_");
  if (normalizedEngineId === "openrouter_chat" || normalizedEngineId === "openrouter_messages_agent") {
    const modelId = (modelIdInput ?? "").trim();
    if (!modelId) return null;
    const modelLabel = modelToggles.find((toggle) => toggle.id === modelId)?.label;
    return modelLabel ?? modelId;
  }
  return engineId.replace(/_/g, " ");
}

function renderPatch(patch: string) {
  const lines = patch.split("\n");
  const lineCount = lines.length;
  const gutterWidth = String(lineCount).length;
  return (
    <div className="diff-lines">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        let kind = "context";
        if (trimmed.startsWith("***") || trimmed.startsWith("@@")) {
          kind = "header";
        } else if (line.startsWith("+")) {
          kind = "add";
        } else if (line.startsWith("-")) {
          kind = "del";
        } else if (line.startsWith(" ")) {
          kind = "context";
        }
        return (
          <div key={index} className={`diff-line ${kind}`}>
            <span className="diff-line-number">
              {String(index + 1).padStart(gutterWidth, " ")}
            </span>
            <span className="diff-line-text">{line.length === 0 ? " " : line}</span>
          </div>
        );
      })}
    </div>
  );
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

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const highlighted = useMemo(() => {
    if (language && hljs.getLanguage(language)) {
      try {
        return hljs.highlight(code, { language }).value;
      } catch {
        return hljs.highlightAuto(code).value;
      }
    }
    return hljs.highlightAuto(code).value;
  }, [code, language]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        {language && <span className="code-block-lang">{language}</span>}
        <button className="code-block-copy" onClick={handleCopy}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="md-code-block">
        <code
          className={language ? `language-${language} hljs` : 'hljs'}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </div>
  );
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
    if (["applypatch", "patch"].includes(normalized)) {
      return "apply_patch";
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
    if (tool === "apply_patch") return "apply patch";
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
        } else if (toolKey === "apply_patch") {
          if (patchMatch) commandPreview = "diff";
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

function renderMarkdown(text: string): ReactNode {
  const lines = text.split('\n');
  const elements: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Code block (handle indented code blocks too)
    if (trimmedLine.startsWith('```')) {
      const lang = trimmedLine.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <CodeBlock key={key++} code={codeLines.join('\n')} language={lang || undefined} />
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(trimmedLine)) {
      elements.push(<hr key={key++} className="md-hr" />);
      i++;
      continue;
    }

    // Headers
    const headerMatch = trimmedLine.match(/^(#{1,3})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const content = headerMatch[2];
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      elements.push(<Tag key={key++} className="md-header">{renderInline(content)}</Tag>);
      i++;
      continue;
    }

    // Numbered list
    if (/^\d+\.\s+/.test(trimmedLine)) {
      const listItems: ReactNode[] = [];
      while (i < lines.length) {
        const currentLine = lines[i].trim();
        if (/^\d+\.\s+/.test(currentLine)) {
          const content = currentLine.replace(/^\d+\.\s+/, '');
          listItems.push(<li key={key++}>{renderInline(content)}</li>);
          i++;
        } else if (currentLine.startsWith('```')) {
          // Code block inside list
          const lang = currentLine.slice(3).trim();
          const codeLines: string[] = [];
          i++;
          while (i < lines.length && !lines[i].trim().startsWith('```')) {
            codeLines.push(lines[i]);
            i++;
          }
          listItems.push(
            <li key={key++} className="md-list-code">
              <CodeBlock code={codeLines.join('\n')} language={lang || undefined} />
            </li>
          );
          i++;
        } else if (currentLine === '') {
          i++;
        } else {
          break;
        }
      }
      elements.push(<ol key={key++} className="md-list">{listItems}</ol>);
      continue;
    }

    // Bullet list
    if (/^[-*]\s+/.test(trimmedLine)) {
      const listItems: ReactNode[] = [];
      while (i < lines.length) {
        const currentLine = lines[i].trim();
        if (/^[-*]\s+/.test(currentLine)) {
          const content = currentLine.replace(/^[-*]\s+/, '');
          listItems.push(<li key={key++}>{renderInline(content)}</li>);
          i++;
        } else if (currentLine.startsWith('```')) {
          // Code block inside list
          const lang = currentLine.slice(3).trim();
          const codeLines: string[] = [];
          i++;
          while (i < lines.length && !lines[i].trim().startsWith('```')) {
            codeLines.push(lines[i]);
            i++;
          }
          listItems.push(
            <li key={key++} className="md-list-code">
              <CodeBlock code={codeLines.join('\n')} language={lang || undefined} />
            </li>
          );
          i++;
        } else if (currentLine === '') {
          i++;
        } else {
          break;
        }
      }
      elements.push(<ul key={key++} className="md-list">{listItems}</ul>);
      continue;
    }

    // Empty line
    if (trimmedLine === '') {
      i++;
      continue;
    }

    // Paragraph
    elements.push(<p key={key++} className="md-paragraph">{renderInline(line)}</p>);
    i++;
  }

  return <>{elements}</>;
}

function renderInline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Inline code
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(<code key={key++} className="md-inline-code">{codeMatch[1]}</code>);
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Bold
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/) || remaining.match(/^__([^_]+)__/);
    if (boldMatch) {
      parts.push(<strong key={key++}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic
    const italicMatch = remaining.match(/^\*([^*]+)\*/) || remaining.match(/^_([^_]+)_/);
    if (italicMatch) {
      parts.push(<em key={key++}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Plain text until next special character
    const nextSpecial = remaining.search(/[`*_]/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    } else if (nextSpecial === 0) {
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      parts.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return <>{parts}</>;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp * 1000;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return new Date(timestamp * 1000).toLocaleDateString();
}

function shortId(id: string, currentUserId?: string, currentUserEmail?: string): string {
  // For current user, show email prefix
  if (currentUserId && id === currentUserId && currentUserEmail) {
    const prefix = currentUserEmail.split("@")[0];
    return prefix.length > 12 ? prefix.slice(0, 12) + "…" : prefix;
  }
  // For others, show friendlier "Member #XXXX" format
  if (id.length > 8) {
    return `Member #${id.slice(-4).toUpperCase()}`;
  }
  return id;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

function getAvatarColor(id: string): string {
  const colors = [
    "#e57373", "#f06292", "#ba68c8", "#9575cd", "#7986cb",
    "#64b5f6", "#4fc3f7", "#4dd0e1", "#4db6ac", "#81c784",
    "#aed581", "#dce775", "#fff176", "#ffd54f", "#ffb74d",
    "#ff8a65", "#a1887f", "#90a4ae"
  ];
  const index = Math.abs(hashCode(id)) % colors.length;
  return colors[index];
}

function getInitials(id: string): string {
  // For now, just use first 2 chars of the ID
  return id.slice(0, 2).toUpperCase();
}

type ReplyPrefix = {
  sender: string;
  preview: string;
  rest: string;
};

function buildReplyPrefix(sender: string, preview: string): string {
  return `> ↪︎ ${sender}: ${preview}\n\n`;
}

function parseReplyPrefix(body: string): ReplyPrefix | null {
  if (!body.startsWith(">")) return null;
  const lines = body.split(/\r?\n/);
  if (lines.length === 0) return null;
  const first = lines[0] ?? "";
  const match = first.match(/^>\s*↪︎\s*(.+)$/);
  if (!match) return null;
  const content = (match[1] ?? "").trim();
  const colonIndex = content.indexOf(":");
  if (colonIndex === -1) return null;
  const sender = content.slice(0, colonIndex).trim();
  const preview = content.slice(colonIndex + 1).trim();

  let start = 1;
  while (start < lines.length && lines[start]?.trim() === "") {
    start += 1;
  }
  const rest = lines.slice(start).join("\n");
  return { sender, preview, rest };
}

function formatChatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const timeStr = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (messageDate.getTime() === today.getTime()) {
    return timeStr;
  } else if (messageDate.getTime() === yesterday.getTime()) {
    return `Yesterday ${timeStr}`;
  } else {
    return date.toLocaleDateString([], { month: "short", day: "numeric" }) + ` ${timeStr}`;
  }
}

function shouldShowSender(
  messages: { sender_id: string; created_at: string }[],
  index: number
): boolean {
  if (index === 0) return true;
  const prev = messages[index - 1];
  const curr = messages[index];
  if (prev.sender_id !== curr.sender_id) return true;
  // Show sender if more than 2 minutes apart
  const prevTime = new Date(prev.created_at).getTime();
  const currTime = new Date(curr.created_at).getTime();
  return currTime - prevTime > 2 * 60 * 1000;
}

function shouldShowDateSeparator(
  messages: { created_at: string }[],
  index: number
): string | null {
  const curr = new Date(messages[index].created_at);
  const currDateStr = curr.toDateString();

  if (index === 0) {
    return formatDateSeparator(curr);
  }

  const prev = new Date(messages[index - 1].created_at);
  if (prev.toDateString() !== currDateStr) {
    return formatDateSeparator(curr);
  }

  return null;
}

function formatDateSeparator(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (msgDate.getTime() === today.getTime()) {
    return "Today";
  }
  if (msgDate.getTime() === yesterday.getTime()) {
    return "Yesterday";
  }
  return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

type ParsedEmbed =
  | { provider: "youtube"; id: string; src: string; thumbnailUrl: string }
  | { provider: "wistia"; id: string; src: string };

function parseTimeToSeconds(value: string): number | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  let seconds = 0;
  let matched = false;
  const re = /(\d+)(h|m|s)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(trimmed))) {
    matched = true;
    const qty = Number.parseInt(m[1] ?? "0", 10);
    const unit = m[2];
    if (unit === "h") seconds += qty * 3600;
    if (unit === "m") seconds += qty * 60;
    if (unit === "s") seconds += qty;
  }
  return matched ? seconds : null;
}

function normalizeExternalUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed);
  } catch {
    // Allow bare domains like youtu.be/VIDEOID
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}

function parseYouTubeId(url: URL): { id: string; startSeconds: number | null } | null {
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  let id: string | null = null;
  if (host === "youtu.be") {
    id = parts[0] ?? null;
  } else if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    if (url.pathname === "/watch") {
      id = url.searchParams.get("v");
    } else if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live" || parts[0] === "v") {
      id = parts[1] ?? null;
    }
  }

  if (!id) return null;
  id = id.replace(/[^a-zA-Z0-9_-]/g, "");
  if (id.length < 6) return null;

  const startRaw = url.searchParams.get("start") ?? url.searchParams.get("t");
  const startSeconds = startRaw ? parseTimeToSeconds(startRaw) : null;
  return { id, startSeconds };
}

function parseWistiaId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (!host.includes("wistia.com") && !host.includes("wistia.net")) return null;

  const fromQuery = url.searchParams.get("wvideo");
  if (fromQuery && /^[a-zA-Z0-9]+$/.test(fromQuery)) return fromQuery;

  const match = url.pathname.match(/(?:medias|iframe)\/([a-zA-Z0-9]+)/);
  if (match && match[1]) return match[1];
  return null;
}

function parseEmbedUrl(rawUrl: string): ParsedEmbed | null {
  const url = normalizeExternalUrl(rawUrl);
  if (!url) return null;

  const youtube = parseYouTubeId(url);
  if (youtube) {
    const params = new URLSearchParams();
    if (youtube.startSeconds && youtube.startSeconds > 0) {
      params.set("start", String(youtube.startSeconds));
    }
    const src = `https://www.youtube.com/embed/${youtube.id}${params.toString() ? `?${params.toString()}` : ""}`;
    const thumbnailUrl = `https://i.ytimg.com/vi/${youtube.id}/hqdefault.jpg`;
    return { provider: "youtube", id: youtube.id, src, thumbnailUrl };
  }

  const wistiaId = parseWistiaId(url);
  if (wistiaId) {
    const src = `https://fast.wistia.net/embed/iframe/${wistiaId}?seo=false&videoFoam=true`;
    return { provider: "wistia", id: wistiaId, src };
  }

  return null;
}

function groupThreadsByDate(threads: ThreadRecord[]): { label: string; threads: ThreadRecord[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; threads: ThreadRecord[] }[] = [
    { label: "Today", threads: [] },
    { label: "Yesterday", threads: [] },
    { label: "This Week", threads: [] },
    { label: "Older", threads: [] }
  ];

  for (const thread of threads) {
    const date = new Date(thread.updated_at * 1000);
    if (date >= today) {
      groups[0].threads.push(thread);
    } else if (date >= yesterday) {
      groups[1].threads.push(thread);
    } else if (date >= weekAgo) {
      groups[2].threads.push(thread);
    } else {
      groups[3].threads.push(thread);
    }
  }

  return groups.filter((g) => g.threads.length > 0);
}

function getSupabaseUrl(): string | null {
  return import.meta.env.VITE_SUPABASE_URL ?? null;
}

function getSupabaseAnonKey(): string | null {
  return import.meta.env.VITE_SUPABASE_ANON_KEY ?? null;
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
    return await invoke<SecretScanResult>("scan_publish_content_cmd", { text });
  } catch {
    return null;
  }
}
