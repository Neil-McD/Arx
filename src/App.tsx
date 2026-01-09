import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, TauriEvent } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import hljs from "highlight.js";
import "xterm/css/xterm.css";
import "highlight.js/styles/github-dark.css";

type SessionRecord = {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
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

type ToolUiSpec = {
  name: string;
  description: string;
  parameters: unknown;
  requires_approval: boolean;
  auto_apply: boolean;
  parallel_safe: boolean;
};

type AgentMode = "build" | "plan" | "explore";

type AuditRecord = {
  id: string;
  session_id: string;
  event_type: string;
  tool_name: string | null;
  risk_level: string;
  user_approved: number;
  created_at: number;
};

type MessageRecord = {
  id: string;
  session_id: string;
  role: string;
  content_json: string;
  created_at: number;
};

type SessionResume = {
  session_id: string;
  last_message_id: string | null;
  last_message_at: number | null;
  last_response_id: string | null;
};

type MemoryBlockRecord = {
  id: string;
  label: string;
  scope: string;
  scope_id: string | null;
  value: string;
  format: string;
  char_limit: number;
  read_only: number;
  egress_policy: string;
  description?: string | null;
  created_at: number;
  updated_at: number;
};

type OutputEvent =
  | { type: "output"; chunk: string; seq: number }
  | { type: "exit"; exitCode: number; seq: number };

type ApplyPatchResult = {
  applied: boolean;
  changed_files: string[];
  errors: string[];
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

type CommunityRecord = {
  id: string;
  slug: string;
  name: string;
};

type CommunityChatMessage = {
  id: string;
  community_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  reply_to_id: string | null;
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
const OUTPUT_MAX_CHARS = 60000;
const OUTPUT_TRUNCATION_MARKER = "\n<<<OUTPUT TRUNCATED>>>\n";
const MODEL_PROVIDERS: Record<string, string> = {
  "gpt-5.1": "openai",
  "gpt-5.2": "openai",
  "sonnet-4.5": "anthropic",
  "opus-4.5": "anthropic",
  "gemini-3-flash": "google",
  "gemini-3-pro": "google",
  "grok-4.1": "xai"
};
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

function App() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [newSessionTitle, setNewSessionTitle] = useState("Untitled session");
  const [commandInput, setCommandInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallRecord[]>([]);
  const [toolSpecsByName, setToolSpecsByName] = useState<Record<string, ToolUiSpec>>({});
  const [agentMode, setAgentMode] = useState<AgentMode>("build");
  const [auditLog, setAuditLog] = useState<AuditRecord[]>([]);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [activeView, setActiveView] = useState<"home" | "settings">("home");
  const [activePage, setActivePage] = useState<"workspace" | "community">("workspace");
  const [communityTab, setCommunityTab] = useState<"chat" | "library" | "resources">("chat");
  const [modelToggles, setModelToggles] = useState<ModelToggle[]>([]);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [toolDebug, setToolDebug] = useState<ToolDebug | null>(null);
  const [providerKeys, setProviderKeys] = useState<ProviderKey[]>([
    { id: "openai", label: "OpenAI", hasKey: false, inputValue: "", error: null },
    { id: "anthropic", label: "Anthropic", hasKey: false, inputValue: "", error: null },
    { id: "google", label: "Google", hasKey: false, inputValue: "", error: null },
    { id: "xai", label: "xAI", hasKey: false, inputValue: "", error: null }
  ]);
  const [supabaseSession, setSupabaseSession] = useState<SupabaseSession | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [communityNameInput, setCommunityNameInput] = useState("");
  const [communitySlugInput, setCommunitySlugInput] = useState("");
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [communities, setCommunities] = useState<CommunityRecord[]>([]);
  const [activeCommunityId, setActiveCommunityId] = useState<string | null>(null);
  const [communityMessages, setCommunityMessages] = useState<CommunityChatMessage[]>([]);
  const [communityMessageInput, setCommunityMessageInput] = useState("");
  const [communityChatError, setCommunityChatError] = useState<string | null>(null);
  const [isSendingCommunityMessage, setIsSendingCommunityMessage] = useState(false);
  const [communityResources, setCommunityResources] = useState<CommunityResource[]>([]);
  const [resourceTitleInput, setResourceTitleInput] = useState("");
  const [resourceTypeInput, setResourceTypeInput] = useState<CommunityResource["type"]>("post");
  const [resourceUrlInput, setResourceUrlInput] = useState("");
  const [resourceBodyInput, setResourceBodyInput] = useState("");
  const [resourcePinnedInput, setResourcePinnedInput] = useState(false);
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [isSavingResource, setIsSavingResource] = useState(false);
  const [communityMembers, setCommunityMembers] = useState<CommunityMember[]>([]);
  const [artifacts, setArtifacts] = useState<CommunityArtifact[]>([]);
  const [artifactVersions, setArtifactVersions] = useState<ArtifactVersion[]>([]);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [artifactTitleInput, setArtifactTitleInput] = useState("");
  const [artifactTypeInput, setArtifactTypeInput] = useState<CommunityArtifact["type"]>("vision");
  const [artifactBodyInput, setArtifactBodyInput] = useState("");
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [isSavingArtifact, setIsSavingArtifact] = useState(false);
  const [isLoadingArtifacts, setIsLoadingArtifacts] = useState(false);
  const [isLoadingArtifactVersions, setIsLoadingArtifactVersions] = useState(false);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isLoadingResources, setIsLoadingResources] = useState(false);
  const [replyingTo, setReplyingTo] = useState<CommunityChatMessage | null>(null);
  const [messageReactions, setMessageReactions] = useState<MessageReaction[]>([]);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [resourceSuccess, setResourceSuccess] = useState(false);
  const [memoryToast, setMemoryToast] = useState<string | null>(null);
  const [taskPlan, setTaskPlan] = useState<TaskPlanPayload | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isUserAtBottom, setIsUserAtBottom] = useState(true);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const typingTimeoutRef = useRef<number | null>(null);
  const lastTypingBroadcast = useRef<number>(0);
  const presenceSocketRef = useRef<WebSocket | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [slashHover, setSlashHover] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  // User preference for panels (what they toggled)
  const [userWantsSessions, setUserWantsSessions] = useState(true);
  const [userWantsCommunity, setUserWantsCommunity] = useState(true);

  // Actual visibility (computed based on window size)
  const [showSidePanel, setShowSidePanel] = useState(true);
  const [showCommunityPanel, setShowCommunityPanel] = useState(true);
  const [sessionsCompact, setSessionsCompact] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const resizeRaf = useRef<number | null>(null);
  const [outputByToolCallId, setOutputByToolCallId] = useState<Record<string, string>>({});
  const [outputMetaByToolCallId, setOutputMetaByToolCallId] = useState<Record<
    string,
    { truncated: boolean; length: number }
  >>({});
  const [expandedToolCallId, setExpandedToolCallId] = useState<string | null>(null);
  const [expandedCommandIds, setExpandedCommandIds] = useState<Set<string>>(new Set());
  const [viewedPatchToolCalls, setViewedPatchToolCalls] = useState<Record<string, boolean>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
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
  const [memoryBlocks, setMemoryBlocks] = useState<MemoryBlockRecord[]>([]);
  const [memoryBlocksError, setMemoryBlocksError] = useState<string | null>(null);
  const [memoryEditorBlock, setMemoryEditorBlock] = useState<MemoryBlockRecord | null>(null);
  const [memoryEditorValue, setMemoryEditorValue] = useState("");
  const [memoryEditorError, setMemoryEditorError] = useState<string | null>(null);
  const [memoryEditorSuccess, setMemoryEditorSuccess] = useState<string | null>(null);
  const [isSavingMemoryProposal, setIsSavingMemoryProposal] = useState(false);
  const [isExportingLog, setIsExportingLog] = useState(false);
  const [exportLogMessage, setExportLogMessage] = useState<string | null>(null);
  const [slashPanel, setSlashPanel] = useState<{
    kind: "status" | "approvals" | "info";
    title: string;
    body?: string;
  } | null>(null);
  const [approvalMode, setApprovalMode] = useState<"read-only" | "agent" | "agent-full">("agent");
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectRecord | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const terminalRootRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [activeOutputId, setActiveOutputId] = useState<string | null>(null);
  const [runningToolCallId, setRunningToolCallId] = useState<string | null>(null);
  const toolCallsRef = useRef<ToolCallRecord[]>([]);
  const activeModelIdRef = useRef<string | null>(null);
  const autoExecutedToolCallsRef = useRef<Set<string>>(new Set());
  const outputRef = useRef<Record<string, string>>({});
  const outputMetaRef = useRef<Record<string, { truncated: boolean; length: number }>>({});
  const outputSeqRef = useRef<Record<string, number>>({});
  const outputBufferRef = useRef<Record<string, Record<number, OutputEvent>>>({});
  const communitySocketRef = useRef<WebSocket | null>(null);
  const communityHeartbeatRef = useRef<number | null>(null);
  const communityChatListRef = useRef<HTMLDivElement | null>(null);
  const workspaceMessageListRef = useRef<HTMLDivElement | null>(null);
  const [isWorkspaceAtBottom, setIsWorkspaceAtBottom] = useState(true);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const autoScrollEnabledRef = useRef(true);

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

  const globalMemoryBlocks = useMemo(
    () => memoryBlocks.filter((block) => block.scope === "global"),
    [memoryBlocks]
  );

  const projectMemoryBlocks = useMemo(
    () => memoryBlocks.filter((block) => block.scope === "project"),
    [memoryBlocks]
  );





  useEffect(() => {
    void loadSessions();
    void loadWorkspaceRoot();
    void loadActiveProject();
    void loadModelToggles();
    void loadActiveModel();
    void loadProviderKeys();
    void loadExecPolicyRules();
    void loadMemoryBlocks();
    void consumeOAuthHash();
    void loadSupabaseSession();
  }, []);

  useEffect(() => {
    if (!activeSessionId) return;
    resetOutputState();
    void loadToolCalls(activeSessionId);
    void loadAuditLog(activeSessionId);
    void loadMessages(activeSessionId);
    void loadSessionResume(activeSessionId);
    void loadSessionExecPolicyRules(activeSessionId);
  }, [activeSessionId, activeProject?.id]);

  useEffect(() => {
    void loadMemoryBlocks();
  }, [activeProject?.id, activeView]);

  useEffect(() => {
    void loadApprovalMode();
  }, []);

  useEffect(() => {
    if (!supabaseSession) return;
    void loadCommunities(supabaseSession);
  }, [supabaseSession]);

  useEffect(() => {
    if (!supabaseSession || !activeCommunityId || communityTab !== "chat") return;
    void loadCommunityChat(activeCommunityId, supabaseSession);
  }, [supabaseSession, activeCommunityId, communityTab]);

  useEffect(() => {
    if (!supabaseSession || !activeCommunityId || communityTab !== "resources") return;
    void loadCommunityResources(activeCommunityId, supabaseSession);
  }, [supabaseSession, activeCommunityId, communityTab]);

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

  // Track if user has scrolled up
  const handleChatScroll = () => {
    if (!communityChatListRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = communityChatListRef.current;
    const atBottom = scrollHeight - scrollTop <= clientHeight + 100;
    setIsUserAtBottom(atBottom);
    // Reset unread count when scrolled to bottom
    if (atBottom) setUnreadCount(0);
  };

  // Workspace auto-scroll: scroll to bottom when new messages/tool calls/streaming content arrive
  // Only scroll if auto-scroll is enabled (user hasn't scrolled up)
  useEffect(() => {
    if (!workspaceMessageListRef.current || !autoScrollEnabledRef.current) return;
    workspaceMessageListRef.current.scrollTo({
      top: workspaceMessageListRef.current.scrollHeight,
      behavior: "instant"
    });
  }, [messages, toolCalls, streamingContent]);

  // Track workspace scroll position
  const handleWorkspaceScroll = () => {
    if (!workspaceMessageListRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = workspaceMessageListRef.current;
    const atBottom = scrollHeight - scrollTop <= clientHeight + 100;
    setIsWorkspaceAtBottom(atBottom);
    // Disable auto-scroll when user scrolls up
    if (!atBottom) {
      autoScrollEnabledRef.current = false;
    }
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
        // Increment unread count if user isn't at bottom and message is from someone else
        if (record.sender_id !== supabaseSession?.user.id) {
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

  // Presence tracking for online users
  useEffect(() => {
    if (!supabaseSession || !activeCommunityId || activePage !== "community") {
      if (presenceSocketRef.current) {
        presenceSocketRef.current.close();
        presenceSocketRef.current = null;
      }
      setOnlineUsers([]);
      return;
    }

    const url = getSupabaseUrl();
    const apiKey = getSupabaseAnonKey();
    if (!url || !apiKey) return;

    const wsUrl = `${url.replace("https://", "wss://").replace("http://", "ws://")}/realtime/v1/websocket?apikey=${apiKey}&vsn=1.0.0`;
    const socket = new WebSocket(wsUrl);
    presenceSocketRef.current = socket;
    const joinRef = `presence-${Date.now()}`;
    const topic = `realtime:presence:community:${activeCommunityId}`;
    let heartbeatInterval: number | null = null;

    socket.addEventListener("open", () => {
      // Join presence channel
      socket.send(
        JSON.stringify({
          topic,
          event: "phx_join",
          payload: {
            config: {
              presence: {
                key: supabaseSession.user.id
              }
            },
            access_token: supabaseSession.access_token
          },
          ref: joinRef
        })
      );

      // Send heartbeat
      heartbeatInterval = window.setInterval(() => {
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

      // Track presence after join
      setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) return;
        socket.send(
          JSON.stringify({
            topic,
            event: "presence",
            payload: {
              type: "track",
              event: "track",
              payload: {
                user_id: supabaseSession.user.id,
                online_at: new Date().toISOString()
              }
            },
            ref: `track-${Date.now()}`
          })
        );
      }, 500);
    });

    socket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data) as {
          event?: string;
          payload?: Record<string, unknown>;
        };
        if (data.event === "presence_state" || data.event === "presence_diff") {
          // Extract online user IDs from presence state
          const payload = data.payload as Record<string, unknown>;
          if (data.event === "presence_state") {
            const userIds = Object.keys(payload).filter(k => k !== "phx_ref");
            setOnlineUsers(userIds);
          } else if (data.event === "presence_diff") {
            const joins = (payload.joins as Record<string, unknown>) || {};
            const leaves = (payload.leaves as Record<string, unknown>) || {};
            setOnlineUsers(prev => {
              let next = [...prev];
              for (const userId of Object.keys(joins)) {
                if (!next.includes(userId)) next.push(userId);
              }
              for (const userId of Object.keys(leaves)) {
                next = next.filter(id => id !== userId);
              }
              return next;
            });
          }
        }
      } catch {
        // Ignore
      }
    });

    return () => {
      socket.close();
      if (heartbeatInterval) window.clearInterval(heartbeatInterval);
      setOnlineUsers([]);
    };
  }, [supabaseSession, activeCommunityId, activePage]);

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
    if (!activeSessionId) return;
    void invoke<string>("get_agent_mode_cmd", { sessionId: activeSessionId })
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
  }, [activeSessionId]);

  useEffect(() => {
    outputRef.current = outputByToolCallId;
  }, [outputByToolCallId]);

  useEffect(() => {
    outputMetaRef.current = outputMetaByToolCallId;
  }, [outputMetaByToolCallId]);

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
    setUserWantsCommunity(activePage === "community");
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
    const wantsLeft = activePage === "community" ? true : userWantsSessions;
    const wantsRight = activePage === "community" ? true : userWantsCommunity;

    if (activePage === "community") {
      // Always keep left panel compact on community page
      setSessionsCompact(true);
      setShowSidePanel(true);
      if (width > 670) {
        setShowCommunityPanel(true);
      } else {
        setShowCommunityPanel(false);
      }
      return;
    }

    if (wantsLeft && wantsRight) {
      // Both panels wanted: community closes first, then sessions goes compact
      if (width > 750) {
        setShowSidePanel(true);
        setShowCommunityPanel(true);
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
      setShowCommunityPanel(true);
      setShowSidePanel(false);
      setSessionsCompact(false);
    } else {
      // Neither wanted
      setShowSidePanel(false);
      setShowCommunityPanel(false);
      setSessionsCompact(false);
    }
  }, [windowWidth, userWantsSessions, userWantsCommunity, activePage]);

  useEffect(() => {
    if (!terminalRootRef.current) return;
    const term = new Terminal({
      fontFamily: "\"IBM Plex Mono\", ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 12,
      theme: {
        background: "#0f0f0d",
        foreground: "#f1ede5",
        cursor: "#f1ede5"
      }
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRootRef.current);
    fitAddon.fit();
    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    const handleResize = () => fitAddon.fit();
    window.addEventListener("resize", handleResize);

    const unlistenOutput = listen<{ tool_call_id: string; chunk: string; seq: number }>(
      "pty-output",
      (event) => {
        enqueueOutputEvent(
          event.payload.tool_call_id,
          { type: "output", chunk: event.payload.chunk, seq: event.payload.seq },
          term,
          activeSessionId
        );
      }
    );
    const unlistenExit = listen<{ tool_call_id: string; exit_code: number; seq: number }>(
      "pty-exit",
      (event) => {
        const toolCallId = event.payload.tool_call_id;
        enqueueOutputEvent(
          toolCallId,
          { type: "exit", exitCode: event.payload.exit_code, seq: event.payload.seq },
          term,
          activeSessionId
        );
      }
    );

    const unlistenAgent = listen<{ session_id: string }>(
      "agent-turn-finished",
      async (event) => {
        if (!event.payload.session_id) return;
        // Load messages first, then clear streaming to avoid flicker
        await loadMessages(event.payload.session_id);
        setStreamingContent(null);
      }
    );

    const unlistenStream = listen<{ session_id: string; chunk: string; full_content: string }>(
      "agent-stream",
      (event) => {
        if (event.payload.session_id !== activeSessionId) return;
        setStreamingContent(event.payload.full_content);
      }
    );
    const unlistenCancelled = listen<{ session_id: string }>(
      "agent-cancelled",
      (event) => {
        if (event.payload.session_id !== activeSessionId) return;
        setStreamingContent(null);
        setMemoryToast("Operation cancelled.");
        if (memoryToastTimeoutRef.current) {
          window.clearTimeout(memoryToastTimeoutRef.current);
        }
        memoryToastTimeoutRef.current = window.setTimeout(() => {
          setMemoryToast(null);
        }, 2000);
      }
    );
    const unlistenMemory = listen<{ session_id: string; label: string; scope: string }>(
      "memory-updated",
      (event) => {
        if (event.payload.session_id !== activeSessionId) return;
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
        if (event.payload.session_id !== activeSessionId) return;
        setTaskPlan(event.payload.args);
      }
    );

    const unlistenToolCallsUpdated = listen<{ session_id: string }>(
      "tool-calls-updated",
      async (event) => {
        if (event.payload.session_id !== activeSessionId) return;
        await loadToolCalls(event.payload.session_id);
      }
    );

    return () => {
      window.removeEventListener("resize", handleResize);
      term.dispose();
      void unlistenOutput.then((fn) => fn());
      void unlistenExit.then((fn) => fn());
      void unlistenAgent.then((fn) => fn());
      void unlistenStream.then((fn) => fn());
      void unlistenCancelled.then((fn) => fn());
      void unlistenMemory.then((fn) => fn());
      void unlistenPlan.then((fn) => fn());
      void unlistenToolCallsUpdated.then((fn) => fn());
      if (memoryToastTimeoutRef.current) {
        window.clearTimeout(memoryToastTimeoutRef.current);
        memoryToastTimeoutRef.current = null;
      }
    };
  }, [activeSessionId]);

  useEffect(() => {
    const handleGlobalEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;
      if (activePage !== "workspace") return;
      if (!activeSessionId) return;

      // If the slash menu is active, let the input handler consume Escape.
      if (slashState.query !== null) return;

      // Cancel a running tool call if present, otherwise cancel the agent turn.
      if (runningToolCallId) {
        event.preventDefault();
        void invoke("cancel_tool_call_cmd", {
          sessionId: activeSessionId,
          toolCallId: runningToolCallId
        });
        setRunningToolCallId(null);
        return;
      }

      if (isSending || streamingContent) {
        event.preventDefault();
        void invoke("cancel_session_cmd", { sessionId: activeSessionId });
      }
    };

    window.addEventListener("keydown", handleGlobalEscape);
    return () => window.removeEventListener("keydown", handleGlobalEscape);
  }, [activePage, activeSessionId, isSending, runningToolCallId, slashState.query, streamingContent]);

  async function loadSessions() {
    const data = await invoke<SessionRecord[]>("list_sessions_cmd");
    setSessions(data);
    if (!activeSessionId && data.length > 0) {
      setActiveSessionId(data[0].id);
    }
  }

  async function loadToolCalls(sessionId: string) {
    const data = await invoke<ToolCallRecord[]>("list_tool_calls_cmd", {
      sessionId
    });
    setToolCalls(data);
  }

  async function loadAuditLog(sessionId: string) {
    const data = await invoke<AuditRecord[]>("list_audit_log_cmd", {
      sessionId
    });
    setAuditLog(data);
  }

  async function loadMessages(sessionId: string) {
    const data = await invoke<MessageRecord[]>("list_messages_cmd", {
      sessionId
    });
    setMessages(data);
  }

  async function loadMemoryBlocks() {
    try {
      const globalBlocks = await invoke<MemoryBlockRecord[]>("list_memory_blocks_cmd", {
        scope: "global",
        scopeId: null
      });
      let projectBlocks: MemoryBlockRecord[] = [];
      if (activeProject) {
        projectBlocks = await invoke<MemoryBlockRecord[]>("list_memory_blocks_cmd", {
          scope: "project",
          scopeId: activeProject.id
        });
      }
      setMemoryBlocks([...globalBlocks, ...projectBlocks]);
      setMemoryBlocksError(null);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to load memory blocks";
      setMemoryBlocksError(message);
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

  async function handleExportEventLog() {
    if (!activeSessionId) return;
    setIsExportingLog(true);
    setExportLogMessage(null);
    try {
      const data = await invoke<string>("export_event_log_cmd", {
        sessionId: activeSessionId
      });
      await navigator.clipboard.writeText(data);
      setExportLogMessage("Exported to clipboard.");
      window.setTimeout(() => setExportLogMessage(null), 2500);
    } catch (error) {
      setExportLogMessage(
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Export failed"
      );
    } finally {
      setIsExportingLog(false);
    }
  }

  async function loadModelToggles() {
    const data = await invoke<ModelToggle[]>("get_model_toggles_cmd");
    setModelToggles(data);
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

  function isProviderReady(providerId: string | undefined): boolean {
    if (!providerId) return false;
    const provider = providerKeys.find((item) => item.id === providerId);
    return !!provider?.hasKey;
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
    if (!activeSessionId) return;
    setIsSavingSessionExecPolicy(true);
    setSessionExecPolicyError(null);
    try {
      await invoke("set_session_exec_policy_rules_cmd", {
        sessionId: activeSessionId,
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

  function getAllowRuleTokens(command: string): string {
    return command
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .join(" ");
  }

  useEffect(() => {
    if (!activeSessionId) return;
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
            sessionId: activeSessionId,
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
  }, [activeSessionId, execPolicyRules, sessionExecPolicyRules, toolCalls]);

  // Auto-execute tool calls when policy decision is "allow" or read_file within workspace
  useEffect(() => {
    if (!activeSessionId) return;
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
  }, [activeSessionId, toolCalls, policyByToolCallId, runningToolCallId]);

  async function loadSupabaseSession() {
    const stored = localStorage.getItem("arx_supabase_session");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as SupabaseSession;
      const refreshed = await ensureFreshSession(parsed);
      if (!refreshed) return;
      setSupabaseSession(refreshed);
      localStorage.setItem("arx_supabase_session", JSON.stringify(refreshed));
    } catch {
      localStorage.removeItem("arx_supabase_session");
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
    localStorage.setItem("arx_supabase_session", JSON.stringify(session));
    setSupabaseSession(session);
    window.history.replaceState({}, document.title, window.location.pathname);
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
    localStorage.removeItem("arx_supabase_session");
    setSupabaseSession(null);
    setCommunities([]);
    setActiveCommunityId(null);
  }

  async function loadCommunities(session: SupabaseSession) {
    const url = getSupabaseUrl();
    const apiKey = getSupabaseAnonKey();
    if (!url || !apiKey) return;
    const response = await fetch(
      `${url}/rest/v1/community_memberships?select=community_id,communities(id,slug,name)&user_id=eq.${session.user.id}`,
      {
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${session.access_token}`
        }
      }
    );
    if (!response.ok) return;
    const rows = (await response.json()) as {
      community_id: string;
      communities: CommunityRecord;
    }[];
    const list = rows
      .map((row) => row.communities)
      .filter((item): item is CommunityRecord => Boolean(item));
    setCommunities(list);
    if (!activeCommunityId && list.length > 0) {
      setActiveCommunityId(list[0].id);
    }
  }

  async function loadCommunityChat(communityId: string, session: SupabaseSession) {
    const url = getSupabaseUrl();
    const apiKey = getSupabaseAnonKey();
    if (!url || !apiKey) return;
    setIsLoadingChat(true);
    try {
      const response = await fetch(
        `${url}/rest/v1/community_chat_messages?select=id,community_id,sender_id,body,created_at,reply_to_id&community_id=eq.${communityId}&order=created_at.asc&limit=200`,
        {
          headers: {
            apikey: apiKey,
            Authorization: `Bearer ${session.access_token}`
          }
        }
      );
      if (!response.ok) return;
      const rows = (await response.json()) as CommunityChatMessage[];
      setCommunityMessages(rows);
      setIsUserAtBottom(true); // Reset scroll state on load
      // Load reactions for these messages
      if (rows.length > 0) {
        const messageIds = rows.map(m => m.id);
        await loadMessageReactions(messageIds, session);
      }
    } finally {
      setIsLoadingChat(false);
    }
  }

  async function loadMessageReactions(messageIds: string[], session: SupabaseSession) {
    const url = getSupabaseUrl();
    const apiKey = getSupabaseAnonKey();
    if (!url || !apiKey || messageIds.length === 0) return;
    const idsFilter = messageIds.map(id => `"${id}"`).join(",");
    const response = await fetch(
      `${url}/rest/v1/message_reactions?select=id,message_id,user_id,emoji,created_at&message_id=in.(${idsFilter})`,
      {
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${session.access_token}`
        }
      }
    );
    if (!response.ok) return;
    const rows = (await response.json()) as MessageReaction[];
    setMessageReactions(rows);
  }

  async function handleToggleReaction(messageId: string, emoji: string) {
    if (!supabaseSession) return;
    const url = getSupabaseUrl();
    const apiKey = getSupabaseAnonKey();
    if (!url || !apiKey) return;

    const existingReaction = messageReactions.find(
      r => r.message_id === messageId && r.user_id === supabaseSession.user.id && r.emoji === emoji
    );

    if (existingReaction) {
      // Remove reaction
      setMessageReactions(prev => prev.filter(r => r.id !== existingReaction.id));
      await fetch(`${url}/rest/v1/message_reactions?id=eq.${existingReaction.id}`, {
        method: "DELETE",
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${supabaseSession.access_token}`
        }
      });
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

      const response = await fetch(`${url}/rest/v1/message_reactions`, {
        method: "POST",
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${supabaseSession.access_token}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          message_id: messageId,
          user_id: supabaseSession.user.id,
          emoji
        })
      });
      if (response.ok) {
        const created = (await response.json()) as MessageReaction[];
        if (created.length > 0) {
          setMessageReactions(prev =>
            prev.map(r => r.id === optimisticId ? created[0] : r)
          );
        }
      } else {
        // Remove optimistic reaction on error
        setMessageReactions(prev => prev.filter(r => r.id !== optimisticId));
      }
    }
    setReactionPickerMessageId(null);
  }

  function handleStartEdit(message: CommunityChatMessage) {
    setEditingMessageId(message.id);
    setEditingMessageText(message.body);
  }

  function handleCancelEdit() {
    setEditingMessageId(null);
    setEditingMessageText("");
  }

  async function handleSaveEdit() {
    if (!supabaseSession || !editingMessageId) return;
    const text = editingMessageText.trim();
    if (!text) return;

    const url = getSupabaseUrl();
    const apiKey = getSupabaseAnonKey();
    if (!url || !apiKey) return;

    // Optimistic update
    setCommunityMessages(prev =>
      prev.map(m => m.id === editingMessageId ? { ...m, body: text } : m)
    );
    setEditingMessageId(null);
    setEditingMessageText("");

    const response = await fetch(
      `${url}/rest/v1/community_chat_messages?id=eq.${editingMessageId}&sender_id=eq.${supabaseSession.user.id}`,
      {
        method: "PATCH",
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${supabaseSession.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ body: text })
      }
    );
    if (!response.ok) {
      // Reload to revert on error
      if (activeCommunityId) {
        await loadCommunityChat(activeCommunityId, supabaseSession);
      }
    }
  }

  async function handleDeleteMessage(messageId: string) {
    if (!supabaseSession) return;
    const url = getSupabaseUrl();
    const apiKey = getSupabaseAnonKey();
    if (!url || !apiKey) return;

    // Optimistic update
    setCommunityMessages(prev => prev.filter(m => m.id !== messageId));
    setMessageReactions(prev => prev.filter(r => r.message_id !== messageId));

    const response = await fetch(
      `${url}/rest/v1/community_chat_messages?id=eq.${messageId}&sender_id=eq.${supabaseSession.user.id}`,
      {
        method: "DELETE",
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${supabaseSession.access_token}`
        }
      }
    );
    if (!response.ok) {
      // Reload to revert on error
      if (activeCommunityId) {
        await loadCommunityChat(activeCommunityId, supabaseSession);
      }
    }
  }

  async function loadCommunityResources(communityId: string, session: SupabaseSession) {
    const url = getSupabaseUrl();
    const apiKey = getSupabaseAnonKey();
    if (!url || !apiKey) return;
    setIsLoadingResources(true);
    try {
      const response = await fetch(
        `${url}/rest/v1/community_resources?select=id,community_id,type,title,body_md,url,file_key,pinned,created_at&community_id=eq.${communityId}&order=pinned.desc,created_at.desc&limit=200`,
        {
          headers: {
            apikey: apiKey,
            Authorization: `Bearer ${session.access_token}`
          }
        }
      );
      if (!response.ok) return;
      const rows = (await response.json()) as CommunityResource[];
      setCommunityResources(rows);
    } finally {
      setIsLoadingResources(false);
    }
  }

  async function loadCommunityMembers(communityId: string, session: SupabaseSession) {
    const url = getSupabaseUrl();
    const apiKey = getSupabaseAnonKey();
    if (!url || !apiKey) return;
    const response = await fetch(
      `${url}/rest/v1/community_memberships?select=id,community_id,user_id,role,created_at&community_id=eq.${communityId}&order=created_at.asc&limit=200`,
      {
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${session.access_token}`
        }
      }
    );
    if (!response.ok) return;
    const rows = (await response.json()) as CommunityMember[];
    setCommunityMembers(rows);
  }

  async function loadArtifacts(communityId: string, session: SupabaseSession) {
    const url = getSupabaseUrl();
    const apiKey = getSupabaseAnonKey();
    if (!url || !apiKey) return;
    setIsLoadingArtifacts(true);
    try {
      const response = await fetch(
        `${url}/rest/v1/artifacts?select=id,community_id,author_id,type,title,current_version_id,created_at,updated_at&community_id=eq.${communityId}&order=updated_at.desc&limit=200`,
        {
          headers: {
            apikey: apiKey,
            Authorization: `Bearer ${session.access_token}`
          }
        }
      );
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
    const apiKey = getSupabaseAnonKey();
    if (!url || !apiKey) return;
    setIsLoadingArtifactVersions(true);
    try {
      const response = await fetch(
        `${url}/rest/v1/artifact_versions?select=id,artifact_id,body_md,summary,tags,created_at,created_by&artifact_id=eq.${artifactId}&order=created_at.desc`,
        {
          headers: {
            apikey: apiKey,
            Authorization: `Bearer ${session.access_token}`
          }
        }
      );
      if (!response.ok) return;
      const rows = (await response.json()) as ArtifactVersion[];
      setArtifactVersions(rows);
    } finally {
      setIsLoadingArtifactVersions(false);
    }
  }

  async function handleCreateArtifact() {
    if (!supabaseSession || !activeCommunityId) return;
    const title = artifactTitleInput.trim();
    const body = artifactBodyInput.trim();
    if (!title || !body) {
      setArtifactError("Title and body are required.");
      return;
    }
    setArtifactError(null);
    setIsSavingArtifact(true);
    const url = getSupabaseUrl();
    const apiKey = getSupabaseAnonKey();
    if (!url || !apiKey) {
      setArtifactError("Missing Supabase config.");
      setIsSavingArtifact(false);
      return;
    }
    try {
      const artifactResponse = await fetch(`${url}/rest/v1/artifacts`, {
        method: "POST",
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${supabaseSession.access_token}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          community_id: activeCommunityId,
          author_id: supabaseSession.user.id,
          type: artifactTypeInput,
          title
        })
      });
      if (!artifactResponse.ok) {
        const errText = await artifactResponse.text();
        setArtifactError(errText || "Failed to create artifact.");
        return;
      }
      const created = (await artifactResponse.json()) as CommunityArtifact[];
      const artifact = created[0];
      const versionResponse = await fetch(`${url}/rest/v1/artifact_versions`, {
        method: "POST",
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${supabaseSession.access_token}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          artifact_id: artifact.id,
          body_md: body,
          summary: null,
          tags: null,
          created_by: supabaseSession.user.id
        })
      });
      if (!versionResponse.ok) {
        const errText = await versionResponse.text();
        setArtifactError(errText || "Failed to create artifact version.");
        return;
      }
      const versions = (await versionResponse.json()) as ArtifactVersion[];
      const version = versions[0];
      await fetch(`${url}/rest/v1/artifacts?id=eq.${artifact.id}`, {
        method: "PATCH",
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${supabaseSession.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          current_version_id: version.id,
          updated_at: new Date().toISOString()
        })
      });
      setArtifactTitleInput("");
      setArtifactBodyInput("");
      await loadArtifacts(activeCommunityId, supabaseSession);
      setSelectedArtifactId(artifact.id);
      await loadArtifactVersions(artifact.id, supabaseSession);
    } finally {
      setIsSavingArtifact(false);
    }
  }

  function slugify(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
  }

  async function handleCreateCommunity() {
    setCommunityError(null);
    if (!supabaseSession) {
      setCommunityError("Sign in first.");
      return;
    }
    const name = communityNameInput.trim();
    const slug = communitySlugInput.trim() || slugify(name);
    if (!name || !slug) {
      setCommunityError("Name and slug are required.");
      return;
    }
    const url = getSupabaseUrl();
    const apiKey = getSupabaseAnonKey();
    if (!url || !apiKey) {
      setCommunityError("Missing Supabase config.");
      return;
    }
    try {
      const communityResponse = await fetch(`${url}/rest/v1/communities`, {
        method: "POST",
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${supabaseSession.access_token}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          name,
          slug,
          owner_id: supabaseSession.user.id
        })
      });
      if (!communityResponse.ok) {
        const text = await communityResponse.text();
        setCommunityError(text || "Failed to create community.");
        return;
      }
      const created = (await communityResponse.json()) as CommunityRecord[];
      const community = created[0];
      await fetch(`${url}/rest/v1/community_memberships`, {
        method: "POST",
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${supabaseSession.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          community_id: community.id,
          user_id: supabaseSession.user.id,
          role: "owner"
        })
      });
      await fetch(`${url}/rest/v1/entitlements`, {
        method: "POST",
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${supabaseSession.access_token}`,
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
      });
      setCommunityNameInput("");
      setCommunitySlugInput("");
      setCommunities((prev) => [community, ...prev]);
      setActiveCommunityId(community.id);
      setActivePage("community");
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to create community.";
      setCommunityError(message);
    }
  }

  async function handleSendCommunityMessage() {
    if (!supabaseSession || !activeCommunityId) return;
    const text = communityMessageInput.trim();
    if (!text) return;

    // Optimistic update: add message immediately with pending state
    const optimisticId = `pending-${Date.now()}`;
    const optimisticMessage: CommunityChatMessage = {
      id: optimisticId,
      community_id: activeCommunityId,
      sender_id: supabaseSession.user.id,
      body: text,
      created_at: new Date().toISOString(),
      reply_to_id: replyingTo?.id ?? null
    };
    setCommunityMessages((prev) => [...prev, optimisticMessage]);
    setCommunityMessageInput("");
    setReplyingTo(null);
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
      setIsSendingCommunityMessage(false);
      return;
    }
    const replyToId = optimisticMessage.reply_to_id;
    const response = await fetch(`${url}/rest/v1/community_chat_messages`, {
      method: "POST",
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${supabaseSession.access_token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        community_id: activeCommunityId,
        sender_id: supabaseSession.user.id,
        body: text,
        reply_to_id: replyToId
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      setCommunityChatError(errText || "Failed to send message.");
      // Remove optimistic message on error
      setCommunityMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setIsSendingCommunityMessage(false);
      return;
    }
    // Replace optimistic message with real one
    const created = (await response.json()) as CommunityChatMessage[];
    if (created.length > 0) {
      setCommunityMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? created[0] : m))
      );
    }
    setIsSendingCommunityMessage(false);
  }

  async function handleSaveCommunityResource() {
    if (!supabaseSession || !activeCommunityId) return;
    const title = resourceTitleInput.trim();
    if (!title) {
      setResourceError("Title is required.");
      return;
    }
    if ((resourceTypeInput === "link" || resourceTypeInput === "embed") && !resourceUrlInput.trim()) {
      setResourceError("URL is required for links and embeds.");
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
      type: resourceTypeInput,
      title,
      body_md: resourceBodyInput.trim() || null,
      url: resourceUrlInput.trim() || null,
      file_key: null,
      pinned: resourcePinnedInput
    };
    const response = await fetch(
      editingResourceId
        ? `${url}/rest/v1/community_resources?id=eq.${editingResourceId}`
        : `${url}/rest/v1/community_resources`,
      {
        method: editingResourceId ? "PATCH" : "POST",
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${supabaseSession.access_token}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify(payload)
      }
    );
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
    await loadCommunityResources(activeCommunityId, supabaseSession);
    setIsSavingResource(false);
    // Show success toast
    setResourceSuccess(true);
    setTimeout(() => setResourceSuccess(false), 2000);
  }

  function handleEditResource(resource: CommunityResource) {
    setEditingResourceId(resource.id);
    setResourceTitleInput(resource.title);
    setResourceTypeInput(resource.type);
    setResourceUrlInput(resource.url ?? "");
    setResourceBodyInput(resource.body_md ?? "");
    setResourcePinnedInput(resource.pinned);
    setResourceError(null);
  }

  async function handleDeleteResource(resourceId: string) {
    if (!supabaseSession || !activeCommunityId) return;
    const url = getSupabaseUrl();
    const apiKey = getSupabaseAnonKey();
    if (!url || !apiKey) return;
    const response = await fetch(
      `${url}/rest/v1/community_resources?id=eq.${resourceId}`,
      {
        method: "DELETE",
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${supabaseSession.access_token}`
        }
      }
    );
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
    if (activeModelId && enabled.some((toggle) => toggle.id === activeModelId)) {
      return;
    }
    const fallback = enabled[0].id;
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
  }, [modelToggles, activeModelId]);

  const enabledModels = modelToggles.filter((toggle) => toggle.enabled);
  const activeCommunity = communities.find((item) => item.id === activeCommunityId) ?? null;

  async function loadWorkspaceRoot() {
    const root = await invoke<string>("get_workspace_root_cmd");
    setWorkspaceRoot(root);
    void loadProjects();
  }

  async function loadProjects() {
    const list = await invoke<ProjectRecord[]>("list_projects_cmd");
    setProjects(list);
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
    void loadProjects();
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
      } else if (event.payload.type === "leave" || event.payload.type === "cancel") {
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
  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
  }

  async function handleCreateProject() {
    if (!newProjectName.trim()) return;
    const created = await invoke<ProjectRecord>("create_project_cmd", {
      name: newProjectName
    });
    setNewProjectName("");
    setActiveProject(created);
    await invoke("set_active_project_cmd", { projectId: created.id });
    void loadProjects();
  }

  async function handleCreateSession() {
    const session = await invoke<SessionRecord>("create_session_cmd", {
      title: newSessionTitle
    });
    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(session.id);
    setMessages([]);
    setToolCalls([]);
    setOutputByToolCallId({});
    setOutputMetaByToolCallId({});
    setActiveOutputId(null);
  }

  async function handleDeleteSession(sessionId: string) {
    // For now, just remove from local state
    // TODO: Add backend delete command
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      const remaining = sessions.filter((s) => s.id !== sessionId);
      setActiveSessionId(remaining.length > 0 ? remaining[0].id : null);
      setMessages([]);
    }
  }

  function getSessionPreview(sessionId: string): string {
    if (sessionId !== activeSessionId) return "";
    const firstUserMsg = messages.find((m) => m.role === "user");
    if (!firstUserMsg) return "No messages";
    const text = parseMessageText(firstUserMsg.content_json);
    return text.length > 40 ? text.slice(0, 40) + "..." : text;
  }

  function resetOutputState() {
    setOutputByToolCallId({});
    setOutputMetaByToolCallId({});
    outputSeqRef.current = {};
    outputBufferRef.current = {};
  }

  function appendOutput(toolCallId: string, chunk: string) {
    setOutputByToolCallId((prev) => {
      const current = prev[toolCallId] ?? "";
      const meta = outputMetaRef.current[toolCallId] ?? { truncated: false, length: 0 };
      if (meta.truncated) return prev;
      let nextText = current + chunk;
      let truncated = false;
      if (nextText.length > OUTPUT_MAX_CHARS) {
        nextText = nextText.slice(0, OUTPUT_MAX_CHARS) + OUTPUT_TRUNCATION_MARKER;
        truncated = true;
      }
      const next = { ...prev, [toolCallId]: nextText };
      const length = Math.min(nextText.length, OUTPUT_MAX_CHARS);
      setOutputMetaByToolCallId((prevMeta) => ({
        ...prevMeta,
        [toolCallId]: { truncated: meta.truncated || truncated, length }
      }));
      // Also update ref immediately so handleExitEvent can read it synchronously
      outputRef.current = next;
      return next;
    });
  }

  async function submitToolOutputFollowup(
    sessionId: string,
    toolCallId: string,
    command: string,
    output: string
  ) {
    if (!activeModelIdRef.current) return;
    const cwd = activeProject?.root_path ?? workspaceRoot ?? ".";
    const truncatedOutput = output.length > 8000 ? output.slice(-8000) : output;
    const response = await invoke<string>("submit_tool_output_cmd", {
      sessionId,
      modelId: activeModelIdRef.current,
      command,
      output: truncatedOutput,
      toolCallId,
      cwd
    });
    if (response && response.trim()) {
      await invoke("add_message_cmd", {
        sessionId,
        role: "assistant",
        contentJson: JSON.stringify({ text: response })
      });
      await loadMessages(sessionId);
    }
    await loadToolCalls(sessionId);
  }

  function handleExitEvent(
    toolCallId: string,
    exitCode: number,
    term: Terminal,
    sessionId: string | null
  ) {
    setToolCalls((prev) =>
      prev.map((item) =>
        item.id === toolCallId
          ? { ...item, status: "executed" }
          : item
      )
    );
    setRunningToolCallId((prev) =>
      prev === toolCallId ? null : prev
    );
    if (sessionId) {
      void loadAuditLog(sessionId);
    }
    const exitLine = `\r\n[process exited: ${exitCode}]\r\n`;
    appendOutput(toolCallId, exitLine);
    if (import.meta.env.DEV) {
      console.debug("exit output bytes", {
        toolCallId,
        length: outputRef.current[toolCallId]?.length ?? 0
      });
    }
    if (toolCallId === activeOutputId) {
      term.write(exitLine);
    }
  }


  function enqueueOutputEvent(
    toolCallId: string,
    event: OutputEvent,
    term: Terminal,
    sessionId: string | null
  ) {
    if (event.seq === 0) {
      if (event.type === "output") {
        appendOutput(toolCallId, event.chunk);
        if (toolCallId === activeOutputId) {
          term.write(event.chunk);
        }
      } else {
        handleExitEvent(toolCallId, event.exitCode, term, sessionId);
      }
      return;
    }
    const buffer = outputBufferRef.current[toolCallId] ?? {};
    buffer[event.seq] = event;
    outputBufferRef.current[toolCallId] = buffer;
    let next = outputSeqRef.current[toolCallId] ?? 1;
    while (buffer[next]) {
      const nextEvent = buffer[next];
      delete buffer[next];
      if (nextEvent.type === "output") {
        appendOutput(toolCallId, nextEvent.chunk);
        if (toolCallId === activeOutputId) {
          term.write(nextEvent.chunk);
        }
      } else {
        handleExitEvent(toolCallId, nextEvent.exitCode, term, sessionId);
      }
      next += 1;
    }
    outputSeqRef.current[toolCallId] = next;
  }

  async function ensureSessionId(): Promise<string | null> {
    if (activeSessionId) return activeSessionId;
    const session = await invoke<SessionRecord>("create_session_cmd", {
      title: newSessionTitle
    });
    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(session.id);
    return session.id;
  }

  async function handleSendMessage() {
    const hasText = commandInput.trim().length > 0;
    const hasAttachments = attachments.length > 0;
    if (!hasText && !hasAttachments) return;
    const sessionId = await ensureSessionId();
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
      if (!activeModelId) {
        await invoke("add_message_cmd", {
          sessionId,
          role: "assistant",
          contentJson: JSON.stringify({
            text: "No model selected. Enable a model in Settings to get a response."
          })
        });
        await loadMessages(sessionId);
        return;
      }
      const provider = MODEL_PROVIDERS[activeModelId];
      if (!provider || !isProviderReady(provider)) {
        await invoke("add_message_cmd", {
          sessionId,
          role: "assistant",
          contentJson: JSON.stringify({
            text: "Provider not configured. Add the API key in Settings."
          })
        });
        await loadMessages(sessionId);
        return;
      }

      const assistantText = await invoke<string>("generate_assistant_message_cmd", {
        sessionId,
        modelId: activeModelId,
        cwd: activeProject?.root_path ?? workspaceRoot ?? "."
      });
      await invoke("add_message_cmd", {
        sessionId,
        role: "assistant",
        contentJson: JSON.stringify({ text: assistantText })
      });
      await loadMessages(sessionId);
      await loadToolCalls(sessionId);
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
        contentJson: JSON.stringify({ text: `LLM error: ${message}` })
      });
      await loadMessages(sessionId);
    } finally {
      setIsSending(false);
    }
  }

  function openMemoryEditor(block: MemoryBlockRecord, prefill?: string) {
    setMemoryEditorBlock(block);
    setMemoryEditorValue(prefill ?? block.value);
    setMemoryEditorError(null);
    setMemoryEditorSuccess(null);
  }

  function resetMemoryEditor() {
    setMemoryEditorBlock(null);
    setMemoryEditorValue("");
    setMemoryEditorError(null);
    setMemoryEditorSuccess(null);
  }

  function extractLastAction(value: string): string | null {
    const match = value.match(/^\s*last_action:\s*(.+)\s*$/m);
    if (!match) return null;
    const raw = match[1].trim();
    return raw.replace(/^['"]|['"]$/g, "").trim() || null;
  }

  async function handleSaveMemoryUpdate() {
    if (!memoryEditorBlock) return;
    setMemoryEditorError(null);
    setMemoryEditorSuccess(null);
    setIsSavingMemoryProposal(true);
    try {
      const updated = await invoke<MemoryBlockRecord>("save_memory_block_update_cmd", {
        sessionId: activeSessionId,
        label: memoryEditorBlock.label,
        scope: memoryEditorBlock.scope,
        scopeId: memoryEditorBlock.scope_id,
        value: memoryEditorValue
      });
      setMemoryEditorBlock(updated);
      setMemoryEditorValue(updated.value);
      setMemoryEditorSuccess("Saved.");
      await loadMemoryBlocks();
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to save memory update";
      setMemoryEditorError(message);
    } finally {
      setIsSavingMemoryProposal(false);
    }
  }

  async function proposeShellCommand(sessionId: string, command: string) {
    const cwd = activeProject?.root_path ?? workspaceRoot ?? ".";
    const args = {
      tool: "run_shell_command",
      command,
      shell: "zsh",
      cwd,
      timeout_ms: 120000
    };
    await invoke("propose_tool_call_cmd", {
      sessionId,
      toolName: "run_shell_command",
      argsJson: JSON.stringify(args),
      riskLevel: "high",
      commandPreviewRedacted: command
    });
    await loadToolCalls(sessionId);
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
      const counts = toolCalls.reduce(
        (acc, tool) => {
          acc[tool.status] = (acc[tool.status] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );
      const running = runningToolCallId
        ? toolCalls.find((tool) => tool.id === runningToolCallId)
        : null;
      const runningLabel = running
        ? parseToolCall(running).command || running.tool_name
        : "none";
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
        `Running: ${runningLabel}`,
        `Tool calls: proposed ${counts.proposed ?? 0}, approved ${counts.approved ?? 0}, executed ${counts.executed ?? 0}, failed ${counts.failed ?? 0}, canceled ${counts.canceled ?? 0}`
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
      showPanel("approvals", "Select Approval Mode");
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
      if (rest.includes("::")) {
        const parts = rest.split("::");
        const title = (parts[0] ?? "").trim();
        const body = parts.slice(1).join("::").trim();
        if (!title || !body) {
          showPanel("info", "Memory", "Usage: /remember <title> :: <body>");
          return true;
        }
        try {
          await invoke("create_memory_note_cmd", {
            sessionId,
            title,
            bodyMd: body,
            tags: null
          });
          showPanel("info", "Memory", `Saved note: ${title}`);
        } catch (error) {
          const message =
            typeof error === "string"
              ? error
              : error instanceof Error
                ? error.message
                : "Failed to save memory note";
          showPanel("info", "Memory", message);
        }
        return true;
      }
      setActiveView("settings");
      let targetLabel: string | null = null;
      let prefillValue: string | null = null;
      const match = rest.match(/^([a-z_]+)\s*:\s*([\s\S]*)$/i);
      if (match) {
        targetLabel = match[1].toLowerCase();
        prefillValue = match[2];
      }
      const allowedLabels = new Set(["persona", "preferences", "codebase_context"]);
      if (!targetLabel || !allowedLabels.has(targetLabel)) {
        resetMemoryEditor();
        showPanel("info", "Memory", "Open Settings → Memory to propose an update.");
        return true;
      }
      if (targetLabel === "codebase_context" && !activeProject) {
        resetMemoryEditor();
        showPanel("info", "Memory", "Select a project before updating codebase_context.");
        return true;
      }
      try {
        const globalBlocks = await invoke<MemoryBlockRecord[]>("list_memory_blocks_cmd", {
          scope: "global",
          scopeId: null
        });
        const projectBlocks = activeProject
          ? await invoke<MemoryBlockRecord[]>("list_memory_blocks_cmd", {
              scope: "project",
              scopeId: activeProject.id
            })
          : [];
        const combined = [...globalBlocks, ...projectBlocks];
        setMemoryBlocks(combined);
        const target = combined.find(
          (block) =>
            block.label === targetLabel &&
            block.scope === (targetLabel === "codebase_context" ? "project" : "global")
        );
        if (!target) {
          resetMemoryEditor();
          showPanel("info", "Memory", "Memory block not found. Open Settings → Memory.");
          return true;
        }
        openMemoryEditor(target, prefillValue ?? undefined);
        showPanel("info", "Memory", `Editing ${target.label}.`);
        return true;
      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to load memory blocks";
        resetMemoryEditor();
        showPanel("info", "Memory", message);
        return true;
      }
    }

    showPanel("info", "Slash command", `Unknown slash command: /${name}`);
    return true;
  }

  async function clearSessionApprovals() {
    setSessionExecPolicyRules("");
    if (!activeSessionId) return;
    await invoke("set_session_exec_policy_rules_cmd", {
      sessionId: activeSessionId,
      rules: ""
    });
    void loadToolCalls(activeSessionId);
  }

  async function applyApprovalMode(mode: "read-only" | "agent" | "agent-full") {
    const preset = APPROVAL_PRESETS[mode];
    setApprovalMode(mode);
    setExecPolicyRules(preset.rules);
    await invoke("set_approval_mode_cmd", { mode });
    await invoke("set_exec_policy_rules_cmd", { rules: preset.rules });
    if (activeSessionId) {
      void loadToolCalls(activeSessionId);
    }
  }

  async function handleSlashSelect(command: string) {
    const sessionId = await ensureSessionId();
    if (!sessionId) return;
    setCommandInput("");
    setIsSending(true);
    try {
      await handleSlashCommand(command, sessionId);
    } finally {
      setIsSending(false);
    }
  }

	  async function handleApprove(toolCall: ToolCallRecord) {
	    await invoke("approve_tool_call_cmd", {
	      sessionId: toolCall.session_id,
	      toolCallId: toolCall.id
	    });
	    setToolCalls((prev) =>
	      prev.map((item) =>
        item.id === toolCall.id ? { ...item, status: "approved" } : item
      )
    );
    void loadAuditLog(toolCall.session_id);
  }

  async function runToolCallThroughBackend(toolCall: ToolCallRecord) {
    if (!activeModelIdRef.current) {
      throw new Error("No model selected.");
    }
    const cwd = activeProject?.root_path ?? workspaceRoot ?? ".";
    const details = parseToolCall(toolCall);

    // Prepare terminal view for shell runs
    if (details.toolName === "run_shell_command") {
      setActiveOutputId(toolCall.id);
      terminalRef.current?.reset();
      terminalRef.current?.write(`$ ${details.command}\r\n`);
    }

    setRunningToolCallId(toolCall.id);
    try {
      const response = await invoke<string>("approve_and_run_tool_call_cmd", {
        sessionId: toolCall.session_id,
        modelId: activeModelIdRef.current,
        toolCallId: toolCall.id,
        cwd
      });

      if (response && response.trim()) {
        await invoke("add_message_cmd", {
          sessionId: toolCall.session_id,
          role: "assistant",
          contentJson: JSON.stringify({ text: response })
        });
        await loadMessages(toolCall.session_id);
      }

      await loadToolCalls(toolCall.session_id);
      void loadAuditLog(toolCall.session_id);
    } finally {
      setRunningToolCallId((prev) => (prev === toolCall.id ? null : prev));
    }
  }

  async function respondPermission(toolCall: ToolCallRecord, response: "session" | "always") {
    if (!activeModelIdRef.current) {
      throw new Error("No model selected.");
    }
    const cwd = activeProject?.root_path ?? workspaceRoot ?? ".";
    const details = parseToolCall(toolCall);

    // Prepare terminal view for shell runs
    if (details.toolName === "run_shell_command") {
      setActiveOutputId(toolCall.id);
      terminalRef.current?.reset();
      terminalRef.current?.write(`$ ${details.command}\r\n`);
    }

    setRunningToolCallId(toolCall.id);
    try {
      const result = await invoke<string>("respond_permission_cmd", {
        sessionId: toolCall.session_id,
        modelId: activeModelIdRef.current,
        toolCallId: toolCall.id,
        response,
        cwd
      });

      if (result && result.trim()) {
        await invoke("add_message_cmd", {
          sessionId: toolCall.session_id,
          role: "assistant",
          contentJson: JSON.stringify({ text: result })
        });
        await loadMessages(toolCall.session_id);
      }

      await loadToolCalls(toolCall.session_id);
      void loadAuditLog(toolCall.session_id);
    } finally {
      setRunningToolCallId((prev) => (prev === toolCall.id ? null : prev));
    }
  }

  async function handleApproveAndRun(toolCall: ToolCallRecord) {
    await runToolCallThroughBackend(toolCall);
  }

  async function handleRejectToolCall(toolCall: ToolCallRecord) {
    if (!activeModelIdRef.current) {
      throw new Error("No model selected.");
    }
    const cwd = activeProject?.root_path ?? workspaceRoot ?? ".";

    setRunningToolCallId(toolCall.id);
    try {
      const response = await invoke<string>("reject_tool_call_cmd", {
        sessionId: toolCall.session_id,
        modelId: activeModelIdRef.current,
        toolCallId: toolCall.id,
        reason: null,
        cwd
      });

      if (response && response.trim()) {
        await invoke("add_message_cmd", {
          sessionId: toolCall.session_id,
          role: "assistant",
          contentJson: JSON.stringify({ text: response })
        });
        await loadMessages(toolCall.session_id);
      }

      await loadToolCalls(toolCall.session_id);
      void loadAuditLog(toolCall.session_id);
    } finally {
      setRunningToolCallId((prev) => (prev === toolCall.id ? null : prev));
    }
  }

  async function handleExecute(toolCall: ToolCallRecord) {
    await runToolCallThroughBackend(toolCall);
  }

  const activeToolCalls = useMemo(() => {
    if (!activeSessionId) return [];
    return toolCalls.filter((toolCall) => toolCall.session_id === activeSessionId);
  }, [toolCalls, activeSessionId]);

  // Combined feed: messages + tool calls sorted by created_at
  type FeedItem =
    | { type: "message"; data: MessageRecord }
    | { type: "tool"; data: ToolCallRecord };

  const combinedFeed = useMemo((): FeedItem[] => {
    const items: FeedItem[] = [
      ...messages.map((m): FeedItem => ({ type: "message", data: m })),
      ...activeToolCalls.map((t): FeedItem => ({ type: "tool", data: t })),
    ];
    return items.sort((a, b) => {
      const aTime = a.type === "message" ? a.data.created_at : a.data.created_at;
      const bTime = b.type === "message" ? b.data.created_at : b.data.created_at;
      return aTime - bTime;
    });
  }, [messages, activeToolCalls]);

  const [expandedOutputIds, setExpandedOutputIds] = useState<Set<string>>(new Set());
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

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

  useEffect(() => {
    const targetId = activeOutputId ?? activeToolCalls[0]?.id ?? null;
    if (!targetId) return;
    setActiveOutputId(targetId);
    const existing = outputByToolCallId[targetId];
    if (existing && terminalRef.current) {
      terminalRef.current.reset();
      terminalRef.current.write(existing);
    }
  }, [activeOutputId, activeToolCalls, outputByToolCallId]);

  return (
    <div className="app-root">
      <header className="app-topbar" data-tauri-drag-region>
        <div className="topbar-left" data-tauri-drag-region>
          {activePage === "workspace" ? (
            <>
              <button
                className={`icon-button${userWantsSessions ? " active" : ""}`}
                data-tauri-drag-region="false"
                onClick={() => setUserWantsSessions((prev) => !prev)}
                aria-label="Toggle sessions panel"
                title="Toggle sessions panel"
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
                title="Select directory"
              >
                <svg viewBox="0 0 24 24" className="workspace-icon">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span className="workspace-name">
                  {workspaceRoot?.split("/").pop() ?? "Select directory..."}
                </span>
              </button>
              <button
                className="new-session-header-btn"
                data-tauri-drag-region="false"
                onClick={handleCreateSession}
                title="New session"
              >
                <svg viewBox="0 0 24 24">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </>
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
          {activeCommunity && (
            <div className="community-breadcrumb" data-tauri-drag-region>
              {activeCommunity.name}
            </div>
          )}
          <button
            className={`icon-button community-btn${activePage === "community" ? " active" : ""}`}
            data-tauri-drag-region="false"
            onClick={() => {
              setActivePage((prev) => (prev === "community" ? "workspace" : "community"));
              setCommunityTab("chat");
              if (activePage !== "community") {
                setUnreadCount(0); // Clear unread when opening community
              }
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
      <div className={`app-shell${(activePage === "workspace" && !showSidePanel) ? " no-left" : ""}${(activePage === "workspace" || !showCommunityPanel) ? " no-right" : ""}${sessionsCompact ? " sessions-compact" : ""}`}>
      {showSidePanel && activePage === "workspace" && (
        <aside className="sessions">
          <div className="panel-title">Sessions</div>
          <div className="session-list">
            {groupSessionsByDate(sessions).map((group) => (
              <div key={group.label} className="session-group">
                <div className="session-group-label">{group.label}</div>
                {group.sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`session-item${session.id === activeSessionId ? " active" : ""}`}
                    onClick={() => setActiveSessionId(session.id)}
                  >
                    <div className="session-content">
                      <div className="session-title">{session.title}</div>
                      <div className="session-preview">
                        {getSessionPreview(session.id)}
                      </div>
                    </div>
                    <div className="session-meta">
                      <div className="session-actions">
                        <button
                          className="session-action"
                          onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id); }}
                          title="Delete session"
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
            {sessions.length === 0 && (
              <div className="empty-state">No sessions yet. Click + to start.</div>
            )}
          </div>
          <div className="sessions-footer">
            <button
              className={`icon-button${activeView === "settings" ? " active" : ""}`}
              onClick={() => setActiveView((prev) => (prev === "settings" ? "home" : "settings"))}
              aria-label="Settings"
              title="Settings"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </aside>
      )}
      {activePage === "community" && (
        <aside className="community-nav">
          <div className="panel-title">Community</div>
          <button
            className={communityTab === "chat" ? "nav-item active" : "nav-item"}
            onClick={() => setCommunityTab("chat")}
          >
            Chat
          </button>
          <button
            className={communityTab === "library" ? "nav-item active" : "nav-item"}
            onClick={() => setCommunityTab("library")}
          >
            Library
          </button>
          <button
            className={communityTab === "resources" ? "nav-item active" : "nav-item"}
            onClick={() => setCommunityTab("resources")}
          >
            Resources
          </button>
        </aside>
      )}
      <main className={`workspace${activePage === "community" ? " community-mode" : ""}`}>
        {activeView === "settings" ? (
          <div className="settings-panel">
            <div className="panel-title">Models</div>
            <div className="model-list">
              {modelToggles.map((toggle) => (
                <label key={toggle.id} className="model-toggle">
                  <input
                    type="checkbox"
                    checked={toggle.enabled}
                    onChange={() => void handleToggleModel(toggle.id)}
                  />
                  <span>
                    {toggle.label}
                    {!isProviderReady(MODEL_PROVIDERS[toggle.id]) && " (missing key)"}
                  </span>
                </label>
              ))}
            </div>
            <div className="panel-title">API Keys</div>
            <div className="key-list">
              {providerKeys.map((provider) => (
                <div key={provider.id} className="key-row">
                  <div className="key-label">{provider.label}</div>
                  <input
                    type="password"
                    value={provider.inputValue}
                    placeholder={provider.hasKey ? "Key saved" : "Enter key"}
                    onChange={(event) =>
                      setProviderKeys((prev) =>
                        prev.map((item) =>
                          item.id === provider.id
                            ? { ...item, inputValue: event.target.value }
                            : item
                        )
                      )
                    }
                  />
                  <button onClick={() => void handleSaveProviderKey(provider.id)}>
                    Save
                  </button>
                  <button
                    className="secondary"
                    onClick={() => void handleClearProviderKey(provider.id)}
                  >
                    Clear
                  </button>
                  {provider.error && <div className="key-error">{provider.error}</div>}
                </div>
              ))}
            </div>
            <div className="panel-title">Community Account</div>
            <div className="auth-panel">
              {supabaseSession ? (
                <div className="auth-row">
                  <div className="auth-status">
                    Signed in as {supabaseSession.user.email ?? "user"}
                  </div>
                  <button onClick={() => void handleSignOut()}>Sign out</button>
                </div>
              ) : (
                <>
                <div className="auth-row">
                  <button onClick={() => void handleSignIn()}>
                    Continue with Google
                  </button>
                </div>
                {authError && <div className="auth-error">{authError}</div>}
              </>
              )}
            </div>
            <div className="panel-title">Create Community</div>
            <div className="create-community">
              <input
                type="text"
                placeholder="Community name"
                value={communityNameInput}
                onChange={(event) => setCommunityNameInput(event.target.value)}
              />
              <input
                type="text"
                placeholder="Slug (optional)"
                value={communitySlugInput}
                onChange={(event) => setCommunitySlugInput(event.target.value)}
              />
              <button onClick={() => void handleCreateCommunity()}>
                Create community
              </button>
              {communityError && <div className="auth-error">{communityError}</div>}
            </div>
            <div className="panel-title">Execution Rules</div>
            <div className="approval-selector">
              <div className="approval-title">Select Approval Mode</div>
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
              <div className="approval-note">
                Approval mode updates global exec policy rules (commands still require explicit approval).
              </div>
            </div>
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
            <div className="panel-title">Session Allow Rules</div>
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
                  disabled={isSavingSessionExecPolicy || !activeSessionId}
                >
                  {isSavingSessionExecPolicy ? "Saving..." : "Save session rules"}
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    setSessionExecPolicyRules("");
                    if (activeSessionId) {
                      void invoke("set_session_exec_policy_rules_cmd", {
                        sessionId: activeSessionId,
                        rules: ""
                      });
                    }
                  }}
                  disabled={!activeSessionId}
                >
                  Clear session rules
                </button>
                {sessionExecPolicyError && (
                  <div className="exec-policy-error">{sessionExecPolicyError}</div>
                )}
              </div>
            </div>
            <div className="panel-title">Session Resume</div>
            <div className="session-resume">
              {sessionResume ? (
                <>
                  <div className="session-resume-row">
                    <span>Last message</span>
                    <span>
                      {sessionResume.last_message_at
                        ? formatRelativeTime(sessionResume.last_message_at)
                        : "—"}
                    </span>
                  </div>
                  <div className="session-resume-row">
                    <span>Last response</span>
                    <span>{sessionResume.last_response_id ?? "—"}</span>
                  </div>
                </>
              ) : (
                <div className="session-resume-empty">No resume data.</div>
              )}
              <button
                className="secondary"
                onClick={() => void handleExportEventLog()}
                disabled={!activeSessionId || isExportingLog}
              >
                {isExportingLog ? "Exporting..." : "Copy event log JSONL"}
              </button>
              {exportLogMessage && (
                <div className="session-resume-msg">{exportLogMessage}</div>
              )}
            </div>
            <div className="panel-title">Memory</div>
            <div className="memory-panel">
              {memoryBlocksError && (
                <div className="memory-error">{memoryBlocksError}</div>
              )}
              <div className="memory-blocks">
                <div className="memory-block-group">
                  <div className="memory-block-group-title">Global</div>
                  {globalMemoryBlocks.length === 0 ? (
                    <div className="memory-block-empty">No global blocks.</div>
                  ) : (
                    globalMemoryBlocks.map((block) => (
                      <div
                        key={block.id}
                        className={`memory-block${block.read_only ? " read-only" : ""}`}
                      >
                        <div className="memory-block-header">
                          <div className="memory-block-label">{block.label}</div>
                          <div className="memory-block-actions">
                            <button
                              className="secondary"
                              onClick={() => openMemoryEditor(block)}
                            >
                              Edit
                            </button>
                          </div>
                        </div>
                        {block.description && (
                          <div className="memory-block-desc">{block.description}</div>
                        )}
                        <div className="memory-block-meta">
                          {block.format} · limit {block.char_limit}
                          {block.read_only ? " · read-only" : ""}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="memory-block-group">
                  <div className="memory-block-group-title">Project</div>
                  {!activeProject && (
                    <div className="memory-block-empty">Select a project to view project memory.</div>
                  )}
                  {activeProject && projectMemoryBlocks.length === 0 && (
                    <div className="memory-block-empty">No project blocks yet.</div>
                  )}
                  {activeProject && projectMemoryBlocks.map((block) => (
                    <div
                      key={block.id}
                      className={`memory-block${block.read_only ? " read-only" : ""}`}
                    >
                      <div className="memory-block-header">
                        <div className="memory-block-label">{block.label}</div>
                        <div className="memory-block-actions">
                          <button
                            className="secondary"
                            onClick={() => openMemoryEditor(block)}
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                      {block.description && (
                        <div className="memory-block-desc">{block.description}</div>
                      )}
                      {block.label === "working_set" && (
                        <div className="memory-block-preview">
                          last_action: {extractLastAction(block.value) ?? "—"}
                        </div>
                      )}
                      <div className="memory-block-meta">
                        {block.format} · limit {block.char_limit}
                        {block.read_only ? " · read-only" : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="memory-editor">
                {memoryEditorBlock ? (
                  <>
                    <div className="memory-editor-header">
                      <div className="memory-editor-title">{memoryEditorBlock.label}</div>
                      <div className="memory-editor-meta">
                        {memoryEditorBlock.scope}
                      </div>
                    </div>
                    <textarea
                      value={memoryEditorValue}
                      onChange={(event) => setMemoryEditorValue(event.target.value)}
                      placeholder="Update memory block content..."
                    />
                    <div className="memory-editor-count">
                      {memoryEditorValue.length}/{memoryEditorBlock.char_limit}
                    </div>
                    <div className="memory-editor-actions">
                      <button
                        onClick={() => void handleSaveMemoryUpdate()}
                        disabled={
                          isSavingMemoryProposal ||
                          memoryEditorBlock.read_only !== 0 ||
                          !memoryEditorValue.trim()
                        }
                      >
                        {isSavingMemoryProposal ? "Saving..." : "Save update"}
                      </button>
                      <button className="secondary" onClick={() => resetMemoryEditor()}>
                        Clear
                      </button>
                    </div>
                    {memoryEditorBlock.read_only !== 0 && (
                      <div className="memory-editor-note">
                        This block is read-only.
                      </div>
                    )}
                    {memoryEditorError && (
                      <div className="memory-editor-error">{memoryEditorError}</div>
                    )}
                    {memoryEditorSuccess && (
                      <div className="memory-editor-success">{memoryEditorSuccess}</div>
                    )}
                  </>
                ) : (
                  <div className="memory-editor-empty">
                    Select a block to update.
                  </div>
                )}
              </div>
            </div>
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
                const textContent = parseMessageText(message.content_json);

                // Check if this is the end of an agent turn:
                // - Not a user message
                // - Next item is either a user message or end of feed
                // - Not currently streaming
                const nextItem = combinedFeed[index + 1];
                const isEndOfTurn = !isUser &&
                  !streamingContent &&
                  (!nextItem || (nextItem.type === "message" && nextItem.data.role === "user"));

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
                        : renderMarkdown(textContent)}
                    </div>
                    {isEndOfTurn && (
                      <div className="message-footer">
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
                      </div>
                    )}
                  </div>
                );
              } else {
                const toolCall = item.data;
                const details = parseToolCall(toolCall);
                const hasPreviewed = !!viewedPatchToolCalls[toolCall.id];
                const actionError = actionErrors[toolCall.id];
                const fallbackOutput = [toolCall.stdout_excerpt, toolCall.stderr_excerpt]
                  .filter(Boolean)
                  .join("\n\n");
                const output = outputByToolCallId[toolCall.id] ?? fallbackOutput;
                const outputMeta = outputMetaByToolCallId[toolCall.id];
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
                            setViewedPatchToolCalls((prev) => ({
                              ...prev,
                              [toolCall.id]: true
                            }));
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
                            await invoke("cancel_tool_call_cmd", {
                              sessionId: toolCall.session_id,
                              toolCallId: toolCall.id
                            });
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
                    {outputMeta?.truncated && (
                      <div className="tool-output-meta">Output truncated to {OUTPUT_MAX_CHARS} chars.</div>
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
              const { cleaned, toolCallRaw, toolName, commandPreview, hasToolCall } = cleanStreamingContent(streamingContent);
              return (
                <div className="message-item streaming">
                  <div className="message-text">
                    {cleaned && renderMarkdown(cleaned)}
                    {hasToolCall && (
                      <details className="tool-call-indicator">
                        <summary>
                          <span className="spinner">⏳</span>
                          {toolName ? `${toolName}` : 'Preparing tool call'}
                          {commandPreview && <code className="command-preview">{commandPreview}</code>}
                        </summary>
                        <div className="tool-call-details">
                          {toolName && <div className="tool-detail"><strong>Tool:</strong> {toolName}</div>}
                          {commandPreview && <div className="tool-detail"><strong>Command:</strong> <code>{commandPreview}</code></div>}
                          <div className="tool-detail"><strong>Raw:</strong></div>
                          <pre className="tool-call-raw">{toolCallRaw}</pre>
                        </div>
                      </details>
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
        <div className="terminal-panel">
          <div className="terminal-root" ref={terminalRootRef} />
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
                    const nextId = event.target.value;
                    setActiveModelId(nextId);
                    await invoke("set_active_model_cmd", { modelId: nextId });
                  }}
                  disabled={enabledModels.length === 0}
                >
                  {enabledModels.length === 0 && (
                    <option value="">No models</option>
                  )}
                  {enabledModels.map((toggle) => (
                    <option
                      key={toggle.id}
                      value={toggle.id}
                      disabled={!isProviderReady(MODEL_PROVIDERS[toggle.id])}
                    >
                      {toggle.label}
                      {!isProviderReady(MODEL_PROVIDERS[toggle.id]) && " (missing key)"}
                    </option>
                  ))}
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
            {communityTab === "chat" && (
              <div className="community-chat">
                <div
                  className="chat-messages"
                  ref={communityChatListRef}
                  onScroll={handleChatScroll}
                >
                  {!activeCommunity && (
                    <div className="chat-empty">Select a community to start chatting.</div>
                  )}
                  {activeCommunity && isLoadingChat && (
                    <div className="chat-loading">
                      <div className="loading-spinner" />
                      <span>Loading messages...</span>
                    </div>
                  )}
                  {activeCommunity && !isLoadingChat && communityMessages.length === 0 && (
                    <div className="chat-empty">No messages yet. Start the conversation!</div>
                  )}
                  {activeCommunity &&
                    !isLoadingChat &&
                    communityMessages.map((message, index) => {
                      const isOwn = message.sender_id === supabaseSession?.user.id;
                      const isPending = message.id.startsWith("pending-");
                      const showMeta = shouldShowSender(communityMessages, index);
                      const avatarColor = getAvatarColor(message.sender_id);
                      return (
                        <div
                          key={message.id}
                          id={`msg-${message.id}`}
                          className={`chat-message${isOwn ? " own" : ""}${isPending ? " pending" : ""}${!showMeta ? " grouped" : ""}`}
                        >
                          <div className="chat-message-row">
                            {!isOwn && showMeta && (
                              <div
                                className="chat-avatar"
                                style={{ backgroundColor: avatarColor }}
                                title={shortId(message.sender_id)}
                              >
                                {getInitials(message.sender_id)}
                              </div>
                            )}
                            {!isOwn && !showMeta && (
                              <div className="chat-avatar-spacer" />
                            )}
                            <div className="chat-content">
                              {showMeta && (
                                <div className="chat-meta">
                                  <span className="chat-sender">
                                    {isOwn ? "You" : shortId(message.sender_id)}
                                  </span>
                                  <span className="chat-time">{formatChatTime(message.created_at)}</span>
                                </div>
                              )}
                              <div className={`chat-bubble${editingMessageId === message.id ? " editing" : ""}`}>
                                {message.reply_to_id && (() => {
                                  const originalMsg = communityMessages.find(m => m.id === message.reply_to_id);
                                  if (!originalMsg) return null;
                                  const isOwnReply = originalMsg.sender_id === supabaseSession?.user.id;
                                  return (
                                    <div
                                      className="chat-reply-quote"
                                      style={{ borderLeftColor: getAvatarColor(originalMsg.sender_id) }}
                                      onClick={() => {
                                        const el = document.getElementById(`msg-${originalMsg.id}`);
                                        el?.scrollIntoView({ behavior: "smooth", block: "center" });
                                      }}
                                    >
                                      <span className="chat-reply-sender">
                                        {isOwnReply ? "You" : shortId(originalMsg.sender_id)}
                                      </span>
                                      <span className="chat-reply-text">
                                        {originalMsg.body.length > 80 ? originalMsg.body.slice(0, 80) + "..." : originalMsg.body}
                                      </span>
                                    </div>
                                  );
                                })()}
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
                                  message.body
                                )}
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
                                  <button
                                    className="chat-action-btn"
                                    onClick={() => setReplyingTo(message)}
                                    title="Reply"
                                  >
                                    <svg viewBox="0 0 24 24"><path d="M9 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-4 4v-4z" /></svg>
                                  </button>
                                  <button
                                    className="chat-action-btn"
                                    onClick={() => void navigator.clipboard.writeText(message.body)}
                                    title="Copy message"
                                  >
                                    <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                                  </button>
                                  {isOwn && !isPending && (
                                    <>
                                      <button
                                        className="chat-action-btn"
                                        onClick={() => handleStartEdit(message)}
                                        title="Edit message"
                                      >
                                        <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                      </button>
                                      <button
                                        className="chat-action-btn delete"
                                        onClick={() => void handleDeleteMessage(message.id)}
                                        title="Delete message"
                                      >
                                        <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                                      </button>
                                    </>
                                  )}
                                </div>
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
                              </div>
                              {(() => {
                                const msgReactions = messageReactions.filter(r => r.message_id === message.id);
                                if (msgReactions.length === 0) return null;
                                // Group by emoji
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
                                          title={reactions.map(r => shortId(r.user_id)).join(", ")}
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
                            {isOwn && showMeta && (
                              <div
                                className="chat-avatar"
                                style={{ backgroundColor: avatarColor }}
                                title="You"
                              >
                                {getInitials(message.sender_id)}
                              </div>
                            )}
                            {isOwn && !showMeta && (
                              <div className="chat-avatar-spacer" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  {typingUsers.length > 0 && (
                    <div className="typing-indicator">
                      <span className="typing-dots"><span /><span /><span /></span>
                      {typingUsers.length === 1
                        ? `${shortId(typingUsers[0])} is typing...`
                        : `${typingUsers.length} people are typing...`}
                    </div>
                  )}
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
                {replyingTo && (
                  <div className="chat-replying-bar">
                    <div className="chat-replying-content">
                      <span className="chat-replying-label">Replying to</span>
                      <span className="chat-replying-sender">
                        {replyingTo.sender_id === supabaseSession?.user.id
                          ? "yourself"
                          : shortId(replyingTo.sender_id)}
                      </span>
                      <span className="chat-replying-preview">
                        {replyingTo.body.length > 50 ? replyingTo.body.slice(0, 50) + "..." : replyingTo.body}
                      </span>
                    </div>
                    <button
                      className="chat-replying-cancel"
                      onClick={() => setReplyingTo(null)}
                      title="Cancel reply"
                    >
                      <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                )}
                <div className="chat-input-bar">
                  <textarea
                    ref={chatInputRef}
                    className="chat-input"
                    placeholder={replyingTo ? "Write a reply..." : "Message the community..."}
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
            {communityTab === "library" && (
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
                                <span>{shortId(version.created_by)}</span>
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
            {communityTab === "resources" && (
              <div className="community-panel resources-panel">
                <div className="resources-header">Resources</div>
                {resourceSuccess && (
                  <div className="success-toast">Resource saved successfully!</div>
                )}
                <div className="resource-form">
                  {editingResourceId && (
                    <div className="resource-editing">Editing resource</div>
                  )}
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
                  <select
                    value={resourceTypeInput}
                    onChange={(event) =>
                      setResourceTypeInput(event.target.value as CommunityResource["type"])
                    }
                    disabled={!activeCommunity}
                  >
                    <option value="post">Post</option>
                    <option value="link">Link</option>
                    <option value="embed">Embed</option>
                    <option value="file">File</option>
                  </select>
                  {(resourceTypeInput === "link" || resourceTypeInput === "embed") && (
                    <input
                      type="text"
                      placeholder="URL"
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
                  )}
                  {resourceTypeInput === "post" && (
                    <textarea
                      placeholder="Notes"
                      value={resourceBodyInput}
                      onChange={(event) => setResourceBodyInput(event.target.value)}
                      disabled={!activeCommunity}
                    />
                  )}
                  <label className="resource-pin">
                    <input
                      type="checkbox"
                      checked={resourcePinnedInput}
                      onChange={(event) => setResourcePinnedInput(event.target.checked)}
                      disabled={!activeCommunity}
                    />
                    Pin to top
                  </label>
                  <button
                    onClick={() => void handleSaveCommunityResource()}
                    disabled={!activeCommunity || isSavingResource}
                  >
                    {isSavingResource
                      ? "Saving..."
                      : editingResourceId
                        ? "Save changes"
                        : "Save resource"}
                  </button>
                  {editingResourceId && (
                    <button
                      className="secondary"
                      onClick={() => {
                        setEditingResourceId(null);
                        setResourceTitleInput("");
                        setResourceUrlInput("");
                        setResourceBodyInput("");
                        setResourcePinnedInput(false);
                        setResourceError(null);
                      }}
                    >
                      Cancel
                    </button>
                  )}
                  {resourceError && <div className="auth-error">{resourceError}</div>}
                </div>
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
                      <div className="resource-title">
                        {resource.pinned && <span className="resource-pin-tag">Pinned</span>}
                        {resource.title}
                      </div>
                      <div className="resource-meta">
                        <span>{resource.type}</span>
                        <span>{formatChatTime(resource.created_at)}</span>
                      </div>
                      {resource.url && (
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
                    </div>
                  ))}
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
            Members {onlineUsers.length > 0 && (
              <span className="online-count">{onlineUsers.length} online</span>
            )}
          </div>
          <div className="member-list">
            {communityMembers.length === 0 && (
              <div className="member-empty">No members yet.</div>
            )}
            {communityMembers.map((member) => {
              const isOnline = onlineUsers.includes(member.user_id);
              return (
                <div key={member.id} className="member-item">
                  <div
                    className="member-avatar"
                    style={{ backgroundColor: getAvatarColor(member.user_id) }}
                  >
                    {getInitials(member.user_id)}
                    {isOnline && <span className="online-dot" />}
                  </div>
                  <div className="member-info">
                    <span className="member-name">{shortId(member.user_id)}</span>
                    <span className="member-role">{member.role}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      )}
      </div>
    </div>
  );
}

export default App;

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
  if (details.toolName === "read_many") {
    return "read many";
  }
  if (details.toolName === "get_memory_block") {
    return details.label ? `get memory block ${details.label}` : "get memory block";
  }
  if (details.toolName === "search_memory_notes") {
    return details.query ? `search memory ${details.query}` : "search memory notes";
  }
  if (details.toolName === "apply_patch") {
    return "apply patch";
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

function parseMessageText(contentJson: string): string {
  try {
    const parsed = JSON.parse(contentJson) as { text?: string };
    return parsed.text ?? contentJson;
  } catch {
    return contentJson;
  }
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

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
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
      const listItems: React.ReactNode[] = [];
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
      const listItems: React.ReactNode[] = [];
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

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
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

function shortId(id: string): string {
  if (id.length <= 8) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
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

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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
  // Show sender if more than 5 minutes apart
  const prevTime = new Date(prev.created_at).getTime();
  const currTime = new Date(curr.created_at).getTime();
  return currTime - prevTime > 5 * 60 * 1000;
}

function groupSessionsByDate(sessions: SessionRecord[]): { label: string; sessions: SessionRecord[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; sessions: SessionRecord[] }[] = [
    { label: "Today", sessions: [] },
    { label: "Yesterday", sessions: [] },
    { label: "This Week", sessions: [] },
    { label: "Older", sessions: [] }
  ];

  for (const session of sessions) {
    const date = new Date(session.updated_at * 1000);
    if (date >= today) {
      groups[0].sessions.push(session);
    } else if (date >= yesterday) {
      groups[1].sessions.push(session);
    } else if (date >= weekAgo) {
      groups[2].sessions.push(session);
    } else {
      groups[3].sessions.push(session);
    }
  }

  return groups.filter((g) => g.sessions.length > 0);
}

function getSupabaseUrl(): string | null {
  return import.meta.env.VITE_SUPABASE_URL ?? null;
}

function getSupabaseAnonKey(): string | null {
  return import.meta.env.VITE_SUPABASE_ANON_KEY ?? null;
}
