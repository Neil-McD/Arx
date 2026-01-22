import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  clearPersistedSupabaseSession,
  fetchSupabaseUser,
  getOAuthRedirectUrl,
  getSupabaseAuthUid,
  getSupabaseAnonKey,
  getSupabaseUrl,
  isSupabaseJwtExpired,
  loadPersistedSupabaseSession,
  parseOAuthHash,
  persistSupabaseSession,
  readSupabaseError,
  refreshSupabaseSession,
  type SupabaseSession
} from "./supabase";

type CommunityRecord = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  visibility: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
};

type ThreadRecord = {
  id: string;
  title: string | null;
  engine_id: string;
  model_id: string | null;
  community_id: string | null;
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
};

type CommunityInviteRecord = {
  id: string;
  community_id: string;
  code: string;
  role: string;
  tier_id: string;
  max_uses: number | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
};

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];
const COMMUNITY_CHAT_PAGE_SIZE = 50;
const COMMUNITY_CHAT_LOAD_MORE_THRESHOLD_PX = 140;

async function copyTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Fall back to a hidden textarea for older browsers / denied clipboard permission.
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.left = "-1000px";
  textarea.setAttribute("readonly", "true");
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
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

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function buildCommunityInviteLink(communityId: string, inviteCode: string): string {
  const origin = window.location.origin;
  return `${origin}/c/${communityId}?invite=${encodeURIComponent(inviteCode)}`;
}

function communityInitials(name: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "AR";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  const combined = initials.join("");
  return combined || trimmed.slice(0, 2).toUpperCase();
}

function toEpochSeconds(input: string): number {
  const ms = Date.parse(input);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : Math.floor(Date.now() / 1000);
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

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

function getAvatarColor(id: string): string {
  const colors = [
    "#e57373",
    "#f06292",
    "#ba68c8",
    "#9575cd",
    "#7986cb",
    "#64b5f6",
    "#4fc3f7",
    "#4dd0e1",
    "#4db6ac",
    "#81c784",
    "#aed581",
    "#dce775",
    "#fff176",
    "#ffd54f",
    "#ffb74d",
    "#ff8a65",
    "#a1887f",
    "#90a4ae"
  ];
  const index = Math.abs(hashCode(id)) % colors.length;
  return colors[index];
}

function getInitials(id: string): string {
  return id.slice(0, 2).toUpperCase();
}

function shortId(id: string, currentUserId?: string, currentUserEmail?: string): string {
  if (currentUserId && id === currentUserId && currentUserEmail) {
    const prefix = currentUserEmail.split("@")[0];
    return prefix.length > 12 ? prefix.slice(0, 12) + "…" : prefix;
  }
  if (id.length > 8) return `Member #${id.slice(-4).toUpperCase()}`;
  return id;
}

function formatChatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const timeStr = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (messageDate.getTime() === today.getTime()) return timeStr;
  if (messageDate.getTime() === yesterday.getTime()) return `Yesterday ${timeStr}`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" }) + ` ${timeStr}`;
}

function shouldShowSender(messages: { sender_id: string; created_at: string }[], index: number): boolean {
  if (index === 0) return true;
  const prev = messages[index - 1];
  const curr = messages[index];
  if (prev.sender_id !== curr.sender_id) return true;
  const prevTime = new Date(prev.created_at).getTime();
  const currTime = new Date(curr.created_at).getTime();
  return currTime - prevTime > 2 * 60 * 1000;
}

function shouldShowDateSeparator(messages: { created_at: string }[], index: number): string | null {
  const curr = new Date(messages[index].created_at);
  const currDateStr = curr.toDateString();

  if (index === 0) return formatDateSeparator(curr);

  const prev = new Date(messages[index - 1].created_at);
  if (prev.toDateString() !== currDateStr) return formatDateSeparator(curr);
  return null;
}

function formatDateSeparator(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (msgDate.getTime() === today.getTime()) return "Today";
  if (msgDate.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

type ReplyPrefix = { sender: string; preview: string; rest: string };

function buildReplyPrefix(sender: string, preview: string): string {
  return `> ↪︎ ${sender}: ${preview}\n\n`;
}

function parseReplyPrefix(body: string): ReplyPrefix | null {
  if (!body.startsWith(">")) return null;
  const lines = body.split(/\r?\n/);
  const first = lines[0] ?? "";
  const match = first.match(/^>\s*↪︎\s*(.+)$/);
  if (!match) return null;
  const content = (match[1] ?? "").trim();
  const colonIndex = content.indexOf(":");
  if (colonIndex === -1) return null;
  const sender = content.slice(0, colonIndex).trim();
  const preview = content.slice(colonIndex + 1).trim();

  let start = 1;
  while (start < lines.length && (lines[start]?.trim() ?? "") === "") start += 1;
  const rest = lines.slice(start).join("\n");
  return { sender, preview, rest };
}

function truncateReplyPreview(body: string): string {
  const singleLine = body.replace(/\s+/g, " ").trim();
  if (singleLine.length <= 90) return singleLine;
  return singleLine.slice(0, 90) + "…";
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
    if (youtube.startSeconds && youtube.startSeconds > 0) params.set("start", String(youtube.startSeconds));
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

export default function App() {
  const [supabaseSession, setSupabaseSession] = useState<SupabaseSession | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const sessionRef = useRef<SupabaseSession | null>(null);
  const refreshInFlightRef = useRef<Promise<SupabaseSession | null> | null>(null);
  const refreshTimeoutRef = useRef<number | null>(null);

  const [activePage, setActivePage] = useState<"workspace" | "community" | "discover">("workspace");
  const [activeView, setActiveView] = useState<"home" | "settings">("home");
  const [communities, setCommunities] = useState<CommunityRecord[]>([]);
  const [communityRoleById, setCommunityRoleById] = useState<Record<string, string>>({});
  const [activeCommunityId, setActiveCommunityId] = useState<string | null>(null);
  const [communityTab, setCommunityTab] = useState<"chat" | "library" | "resources" | "members" | "settings">(
    "chat"
  );

  const [communityMessages, setCommunityMessages] = useState<CommunityChatMessage[]>([]);
  const [communityMessageInput, setCommunityMessageInput] = useState("");
  const [communityChatError, setCommunityChatError] = useState<string | null>(null);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isLoadingMoreChat, setIsLoadingMoreChat] = useState(false);
  const [communityChatHasMore, setCommunityChatHasMore] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isUserAtBottom, setIsUserAtBottom] = useState(true);
  const isUserAtBottomRef = useRef(true);
  const communityChatOldestCreatedAtRef = useRef<string | null>(null);
  const pendingChatPrependScrollRef = useRef<{ prevScrollHeight: number; prevScrollTop: number } | null>(null);
  const communityChatListRef = useRef<HTMLDivElement | null>(null);
  const communitySocketRef = useRef<WebSocket | null>(null);
  const communityHeartbeatRef = useRef<number | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [isSendingCommunityMessage, setIsSendingCommunityMessage] = useState(false);
  const [replyingToMessage, setReplyingToMessage] = useState<CommunityChatMessage | null>(null);
  const [messageReactions, setMessageReactions] = useState<MessageReaction[]>([]);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [editingMessagePrefix, setEditingMessagePrefix] = useState<string | null>(null);

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
  const [isSettingsBannerDragOver, setIsSettingsBannerDragOver] = useState(false);
  const [isSettingsAvatarDragOver, setIsSettingsAvatarDragOver] = useState(false);

  const [threads, setThreads] = useState<ThreadRecord[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [threadError, setThreadError] = useState<string | null>(null);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const workspaceMessageListRef = useRef<HTMLDivElement | null>(null);

  const [discoverQuery, setDiscoverQuery] = useState("");
  const [discoverCommunities, setDiscoverCommunities] = useState<CommunityRecord[]>([]);
  const [isLoadingDiscover, setIsLoadingDiscover] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  useEffect(() => {
    sessionRef.current = supabaseSession;
  }, [supabaseSession]);

  useEffect(() => {
    const stored = loadPersistedSupabaseSession();
    if (stored) {
      setSupabaseSession(stored);
    }
  }, []);

  useEffect(() => {
    const parsed = parseOAuthHash();
    if (!parsed) return;

    void (async () => {
      setAuthError(null);
      const user = await fetchSupabaseUser(parsed.session.access_token);
      if (!user) {
        setAuthError("Failed to load user profile from Supabase.");
        return;
      }

      const session: SupabaseSession = { ...parsed.session, user };
      persistSupabaseSession(session);
      setSupabaseSession(session);
      // Preserve query params (e.g. invite codes) while clearing the OAuth hash.
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    })();
  }, []);

  useEffect(() => {
    if (refreshTimeoutRef.current) {
      window.clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
    if (!supabaseSession) return;

    const nowSec = Math.floor(Date.now() / 1000);
    const refreshAtSec = Math.max(supabaseSession.expires_at - 90, nowSec + 5);
    const delayMs = Math.max(0, (refreshAtSec - nowSec) * 1000);

    refreshTimeoutRef.current = window.setTimeout(() => {
      const current = sessionRef.current;
      if (!current) return;
      void refreshSupabaseSessionLocked(current.refresh_token);
    }, delayMs);

    return () => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, [supabaseSession]);

  useEffect(() => {
    if (!supabaseSession) return;
    void loadCommunities(supabaseSession);
    void loadThreads(supabaseSession);
  }, [supabaseSession]);

  useEffect(() => {
    if (supabaseSession) return;
    setCommunities([]);
    setActiveCommunityId(null);
    setThreads([]);
    setActiveThreadId(null);
    setThreadMessages([]);
  }, [supabaseSession]);

  useEffect(() => {
    if (!supabaseSession || !activeThreadId) {
      setThreadMessages([]);
      return;
    }
    void loadThreadMessages(activeThreadId, supabaseSession);
  }, [supabaseSession, activeThreadId]);

  useEffect(() => {
    if (activePage !== "discover") return;
    void loadDiscoverCommunities();
  }, [activePage, supabaseSession]);

  useEffect(() => {
    if (!supabaseSession || !activeCommunityId || activePage !== "community" || communityTab !== "chat") return;
    void loadCommunityChat(activeCommunityId, supabaseSession);
  }, [supabaseSession, activeCommunityId, activePage, communityTab]);

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

  const activeCommunityRole = activeCommunityId ? (communityRoleById[activeCommunityId] ?? null) : null;
  const isActiveCommunityAdmin = activeCommunityRole === "owner" || activeCommunityRole === "admin";

  useEffect(() => {
    if (activePage !== "community" || communityTab !== "members") return;
    if (!supabaseSession || !activeCommunityId || !isActiveCommunityAdmin) {
      setCommunityInvites([]);
      return;
    }
    void loadCommunityInvites(activeCommunityId, supabaseSession);
  }, [activePage, communityTab, supabaseSession, activeCommunityId, isActiveCommunityAdmin]);

  useEffect(() => {
    if (!supabaseSession || !activeCommunityId || activePage !== "community" || communityTab !== "resources") return;
    void loadCommunityResources(activeCommunityId, supabaseSession);
  }, [supabaseSession, activeCommunityId, activePage, communityTab]);

  useEffect(() => {
    if (!supabaseSession || !activeCommunityId || activePage !== "community") return;
    void loadCommunityMembers(activeCommunityId, supabaseSession);
  }, [supabaseSession, activeCommunityId, activePage]);

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

  useEffect(() => {
    if (!supabaseSession || !activeCommunityId || activePage !== "community" || communityTab !== "chat") {
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
          new?: CommunityChatMessage;
          record?: CommunityChatMessage;
          data?: { new?: CommunityChatMessage; record?: CommunityChatMessage };
        };
        const record = payload.new ?? payload.record ?? payload.data?.new ?? payload.data?.record;
        if (!record) return;
        if (record.community_id !== activeCommunityId) return;

        setCommunityMessages((prev) => {
          if (prev.some((item) => item.id === record.id)) return prev;
          const next = [...prev, record];
          next.sort((a, b) => a.created_at.localeCompare(b.created_at));
          return next;
        });

        if (record.sender_id !== supabaseSession.user.id && !isUserAtBottomRef.current) {
          setUnreadCount((prev) => prev + 1);
        }
      } catch {
        // Ignore malformed payloads.
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
  }, [supabaseSession, activeCommunityId, activePage, communityTab]);

  async function refreshSupabaseSessionLocked(refreshToken: string): Promise<SupabaseSession | null> {
    if (!refreshToken) return null;
    if (refreshInFlightRef.current) {
      return await refreshInFlightRef.current;
    }
    const promise = (async () => {
      const refreshed = await refreshSupabaseSession(refreshToken);
      if (!refreshed) return null;
      setAuthError(null);
      setSupabaseSession(refreshed);
      sessionRef.current = refreshed;
      persistSupabaseSession(refreshed);
      return refreshed;
    })();
    refreshInFlightRef.current = promise;
    try {
      return await promise;
    } finally {
      refreshInFlightRef.current = null;
    }
  }

  function handleSignIn() {
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
    clearPersistedSupabaseSession();
    setSupabaseSession(null);
    setCommunities([]);
    setCommunityRoleById({});
    setActiveCommunityId(null);
    setCommunityTab("chat");
    setCommunityMessages([]);
    setCommunityMessageInput("");
    setCommunityChatError(null);
    setIsLoadingChat(false);
    setIsLoadingMoreChat(false);
    setCommunityChatHasMore(true);
    setUnreadCount(0);
    setIsUserAtBottom(true);
    isUserAtBottomRef.current = true;
    setIsSendingCommunityMessage(false);
    setReplyingToMessage(null);
    setMessageReactions([]);
    setReactionPickerMessageId(null);
    setEditingMessageId(null);
    setEditingMessageText("");
    setEditingMessagePrefix(null);
    setCommunityResources([]);
    setIsLoadingResources(false);
    setShowResourceModal(false);
    setEditingResourceId(null);
    setResourceTitleInput("");
    setResourceUrlInput("");
    setResourceBodyInput("");
    setResourcePinnedInput(false);
    setResourceError(null);
    setIsSavingResource(false);
    setResourceSuccess(false);
    setOpenResourceEmbedId(null);
    setCommunityMembers([]);
    setCommunityInvites([]);
    setIsLoadingCommunityInvites(false);
    setInviteMaxUsesPreset("unlimited");
    setInviteMaxUsesCustom("");
    setInviteExpiryPreset("7d");
    setInviteExpiryCustom("");
    setInviteCreateError(null);
    setIsCreatingInvite(false);
    setCommunitySettingsName("");
    setCommunitySettingsSlug("");
    setCommunitySettingsDescription("");
    setCommunitySettingsVisibility("private");
    setCommunitySettingsAvatarUrl(null);
    setCommunitySettingsBannerUrl(null);
    setCommunitySettingsError(null);
    setIsSavingCommunitySettings(false);
    setIsSettingsBannerDragOver(false);
    setIsSettingsAvatarDragOver(false);
    setThreads([]);
    setActiveThreadId(null);
    setThreadMessages([]);
    setDiscoverCommunities([]);
  }

  async function fetchWithSupabasePublic(url: string, init: RequestInit = {}): Promise<Response> {
    const apiKey = getSupabaseAnonKey();
    if (!apiKey) throw new Error("Missing Supabase anon key.");
    const headers = new Headers(init.headers);
    headers.set("apikey", apiKey);
    // PostgREST expects a bearer token even for anon access.
    headers.set("Authorization", `Bearer ${apiKey}`);
    return await fetch(url, { ...init, headers });
  }

  async function fetchWithSupabaseAuth(url: string, init: RequestInit, session: SupabaseSession): Promise<Response> {
    const apiKey = getSupabaseAnonKey();
    if (!apiKey) throw new Error("Missing Supabase anon key.");

    const ensureOrFail = async (current: SupabaseSession): Promise<SupabaseSession> => {
      const now = Math.floor(Date.now() / 1000);
      if (current.expires_at > now + 60) return current;
      const refreshed = await refreshSupabaseSessionLocked(current.refresh_token);
      if (refreshed) return refreshed;
      clearPersistedSupabaseSession();
      setSupabaseSession(null);
      throw new Error("Session expired. Please sign in again.");
    };

    const doFetch = async (current: SupabaseSession): Promise<Response> => {
      const headers = new Headers(init.headers);
      headers.set("apikey", apiKey);
      headers.set("Authorization", `Bearer ${current.access_token}`);
      return await fetch(url, { ...init, headers });
    };

    const baseSession = sessionRef.current ?? session;
    const fresh = await ensureOrFail(baseSession);
    const first = await doFetch(fresh);
    if (!(await isSupabaseJwtExpired(first))) return first;

    const refreshed = await refreshSupabaseSessionLocked(fresh.refresh_token);
    const latest = await ensureOrFail(refreshed ?? sessionRef.current ?? fresh);
    return await doFetch(latest);
  }

  async function loadCommunities(session: SupabaseSession) {
    const url = getSupabaseUrl();
    if (!url) return;
    const userId = getSupabaseAuthUid(session);
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/community_memberships?select=community_id,role,communities(id,slug,name,owner_id,description,avatar_url,banner_url,visibility,created_at,updated_at)&user_id=eq.${userId}`,
        {},
        session
      );
      if (!response.ok) {
        const message = await readSupabaseError(response);
        throw new Error(message);
      }
      const rows = (await response.json()) as Array<{ community_id: string; role: string; communities: CommunityRecord }>;
      const roleMap: Record<string, string> = {};
      for (const row of rows) {
        if (row.community_id) roleMap[row.community_id] = row.role;
      }
      setCommunityRoleById(roleMap);
      const list = rows.map((row) => row.communities).filter(Boolean);
      setCommunities(list);
      if (!activeCommunityId) {
        if (list.length > 0) setActiveCommunityId(list[0].id);
        return;
      }
      if (!list.some((item) => item.id === activeCommunityId) && list.length > 0) {
        setActiveCommunityId(list[0].id);
      }
    } catch (error) {
      console.warn("Failed to load communities:", error);
      setCommunities([]);
    }
  }

  async function loadThreads(session: SupabaseSession) {
    const url = getSupabaseUrl();
    if (!url) return;
    setThreadError(null);
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/threads?select=id,title,engine_id,model_id,community_id,created_at,updated_at&order=updated_at.desc&limit=200`,
        {},
        session
      );
      if (!response.ok) {
        const message = await readSupabaseError(response);
        throw new Error(message);
      }
      const rows = (await response.json()) as Array<{
        id: string;
        title: string | null;
        engine_id: string;
        model_id: string | null;
        community_id: string | null;
        created_at: string;
        updated_at: string;
      }>;
      const list: ThreadRecord[] = rows.map((row) => ({
        id: row.id,
        title: row.title ?? null,
        engine_id: row.engine_id,
        model_id: row.model_id ?? null,
        community_id: row.community_id ?? null,
        created_at: toEpochSeconds(row.created_at),
        updated_at: toEpochSeconds(row.updated_at)
      }));
      setThreads(list);
      if (!activeThreadId && list.length > 0) setActiveThreadId(list[0].id);
      if (activeThreadId && !list.some((t) => t.id === activeThreadId) && list.length > 0) {
        setActiveThreadId(list[0].id);
      }
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to load threads.";
      setThreadError(message);
      setThreads([]);
    }
  }

  async function loadThreadMessages(threadId: string, session: SupabaseSession) {
    const url = getSupabaseUrl();
    if (!url) return;
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/messages?select=id,thread_id,seq,role,content_json,engine_id,model_id,run_id,created_at&thread_id=eq.${threadId}&order=seq.asc&limit=1000`,
        {},
        session
      );
      if (!response.ok) {
        const message = await readSupabaseError(response);
        throw new Error(message);
      }
      const rows = (await response.json()) as ThreadMessage[];
      setThreadMessages(rows);
      window.requestAnimationFrame(() => {
        const el = workspaceMessageListRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
      });
    } catch (error) {
      console.warn("Failed to load messages:", error);
      setThreadMessages([]);
    }
  }

  async function createThread(session: SupabaseSession): Promise<ThreadRecord | null> {
    const url = getSupabaseUrl();
    if (!url) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    const id = crypto.randomUUID();
    const ownerId = getSupabaseAuthUid(session);
    const body = {
      id,
      owner_id: ownerId,
      title: null,
      engine_id: "arx_harness",
      model_id: null,
      community_id: null
    };
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/threads`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        },
        session
      );
      if (!response.ok) {
        const message = await readSupabaseError(response);
        throw new Error(message);
      }
      const record: ThreadRecord = {
        id,
        title: null,
        engine_id: "arx_harness",
        model_id: null,
        community_id: null,
        created_at: nowSec,
        updated_at: nowSec
      };
      setThreads((prev) => [record, ...prev]);
      setActiveThreadId(id);
      return record;
    } catch (error) {
      console.warn("Failed to create thread:", error);
      return null;
    }
  }

  async function sendUserMessage() {
    const text = messageInput.trim();
    if (!text) return;

    if (!supabaseSession) {
      handleSignIn();
      return;
    }

    setIsSendingMessage(true);
    try {
      const session = supabaseSession;
      const threadId =
        activeThreadId ?? (await createThread(session))?.id ?? null;
      if (!threadId) throw new Error("No thread available.");

      const url = getSupabaseUrl();
      if (!url) throw new Error("Missing Supabase URL.");

      const messageId = crypto.randomUUID();
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: messageId,
            thread_id: threadId,
            seq: 0,
            role: "user",
            content_json: { text }
          })
        },
        session
      );
      if (!response.ok) {
        const message = await readSupabaseError(response);
        throw new Error(message);
      }
      setMessageInput("");
      await loadThreadMessages(threadId, session);
      await loadThreads(session);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to send message.";
      setThreadError(message);
    } finally {
      setIsSendingMessage(false);
    }
  }

  async function loadDiscoverCommunities() {
    const url = getSupabaseUrl();
    if (!url) return;
    setIsLoadingDiscover(true);
    setDiscoverError(null);
    try {
      const endpoint = supabaseSession
        ? `${url}/rest/v1/communities?select=id,slug,name,owner_id,description,avatar_url,banner_url,visibility,created_at,updated_at&order=updated_at.desc&limit=200`
        : `${url}/rest/v1/communities?select=id,slug,name,owner_id,description,avatar_url,banner_url,visibility,created_at,updated_at&visibility=eq.public&order=updated_at.desc&limit=200`;
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

  function scrollToCommunityMessage(messageId: string) {
    const target = document.getElementById(`msg-${messageId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const handleChatScroll = () => {
    if (!communityChatListRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = communityChatListRef.current;
    const atBottom = scrollHeight - scrollTop <= clientHeight + 100;
    setIsUserAtBottom(atBottom);
    isUserAtBottomRef.current = atBottom;
    if (atBottom) setUnreadCount(0);

    const nearTop = scrollTop <= COMMUNITY_CHAT_LOAD_MORE_THRESHOLD_PX;
    if (
      nearTop &&
      !atBottom &&
      supabaseSession &&
      activeCommunityId &&
      activePage === "community" &&
      communityTab === "chat" &&
      communityChatHasMore &&
      !isLoadingChat &&
      !isLoadingMoreChat
    ) {
      void loadOlderCommunityChat(activeCommunityId, supabaseSession);
    }
  };

  async function loadCommunityChat(communityId: string, session: SupabaseSession) {
    const url = getSupabaseUrl();
    if (!url) return;
    setIsLoadingChat(true);
    setCommunityChatError(null);
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
      setIsUserAtBottom(true);
      isUserAtBottomRef.current = true;
      if (rows.length > 0) {
        await loadMessageReactions(
          rows.map((m) => m.id),
          session
        );
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

      await loadMessageReactions(
        rows.map((m) => m.id),
        session
      );
    } finally {
      setIsLoadingMoreChat(false);
    }
  }

  async function loadMessageReactions(messageIds: string[], session: SupabaseSession) {
    const url = getSupabaseUrl();
    if (!url || messageIds.length === 0) return;
    const idsFilter = messageIds.map((id) => `"${id}"`).join(",");
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
      for (const reaction of prev) byId.set(reaction.id, reaction);
      for (const reaction of rows) byId.set(reaction.id, reaction);
      return Array.from(byId.values());
    });
  }

  async function handleToggleReaction(messageId: string, emoji: string) {
    if (!supabaseSession) return;
    const url = getSupabaseUrl();
    if (!url) return;

    const existingReaction = messageReactions.find(
      (r) => r.message_id === messageId && r.user_id === supabaseSession.user.id && r.emoji === emoji
    );

    if (existingReaction) {
      setMessageReactions((prev) => prev.filter((r) => r.id !== existingReaction.id));
      try {
        const response = await fetchWithSupabaseAuth(
          `${url}/rest/v1/message_reactions?id=eq.${existingReaction.id}`,
          { method: "DELETE" },
          supabaseSession
        );
        if (!response.ok) {
          setMessageReactions((prev) => [...prev, existingReaction]);
        }
      } catch {
        setMessageReactions((prev) => [...prev, existingReaction]);
      }
    } else {
      const optimisticId = `pending-${Date.now()}`;
      const optimisticReaction: MessageReaction = {
        id: optimisticId,
        message_id: messageId,
        user_id: supabaseSession.user.id,
        emoji,
        created_at: new Date().toISOString()
      };
      setMessageReactions((prev) => [...prev, optimisticReaction]);

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
            setMessageReactions((prev) => prev.map((r) => (r.id === optimisticId ? created[0] : r)));
          }
        } else {
          setMessageReactions((prev) => prev.filter((r) => r.id !== optimisticId));
        }
      } catch {
        setMessageReactions((prev) => prev.filter((r) => r.id !== optimisticId));
      }
    }

    setReactionPickerMessageId(null);
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

    setCommunityMessages((prev) => prev.map((m) => (m.id === editingMessageId ? { ...m, body: bodyToSave } : m)));
    setEditingMessageId(null);
    setEditingMessageText("");
    setEditingMessagePrefix(null);

    let response: Response | null = null;
    try {
      response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/community_chat_messages?id=eq.${editingMessageId}&sender_id=eq.${supabaseSession.user.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: bodyToSave })
        },
        supabaseSession
      );
    } catch {
      response = null;
    }
    if (!response || !response.ok) {
      if (activeCommunityId) {
        await loadCommunityChat(activeCommunityId, supabaseSession);
      }
    }
  }

  async function handleDeleteMessage(messageId: string) {
    if (!supabaseSession) return;
    const url = getSupabaseUrl();
    if (!url) return;

    setCommunityMessages((prev) => prev.filter((m) => m.id !== messageId));
    setMessageReactions((prev) => prev.filter((r) => r.message_id !== messageId));

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
      if (activeCommunityId) {
        await loadCommunityChat(activeCommunityId, supabaseSession);
      }
    }
  }

  async function handleSendCommunityMessage() {
    if (!supabaseSession || !activeCommunityId) return;
    const rawText = communityMessageInput.trim();
    if (!rawText) return;

    const replySnapshot = replyingToMessage;
    const replyToId = replySnapshot ? replySnapshot.id : null;
    const bodyToSend = rawText;

    const optimisticId = `pending-${Date.now()}`;
    const optimisticMessage: CommunityChatMessage = {
      id: optimisticId,
      community_id: activeCommunityId,
      sender_id: supabaseSession.user.id,
      body: bodyToSend,
      reply_to_id: replyToId,
      created_at: new Date().toISOString()
    };
    setCommunityMessages((prev) => [...prev, optimisticMessage]);
    setCommunityMessageInput("");
    setReplyingToMessage(null);
    setIsUserAtBottom(true);
    isUserAtBottomRef.current = true;

    if (chatInputRef.current) {
      chatInputRef.current.style.height = "auto";
    }

    setIsSendingCommunityMessage(true);
    setCommunityChatError(null);

    const url = getSupabaseUrl();
    if (!url) {
      setCommunityChatError("Missing Supabase URL.");
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
        setCommunityMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setCommunityMessageInput(rawText);
        setReplyingToMessage(replySnapshot);
        return;
      }
      const created = (await response.json()) as CommunityChatMessage[];
      const record = created[0] ?? null;
      if (!record) {
        setCommunityChatError("Message sent, but no payload returned.");
        setCommunityMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setCommunityMessageInput(rawText);
        setReplyingToMessage(replySnapshot);
        return;
      }
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

  function handleEditResource(resource: CommunityResource) {
    setEditingResourceId(resource.id);
    setResourceTitleInput(resource.title);
    setResourceUrlInput(resource.url ?? "");
    setResourceBodyInput(resource.body_md ?? "");
    setResourcePinnedInput(resource.pinned);
    setResourceError(null);
    setShowResourceModal(true);
  }

  async function handleDeleteResource(resourceId: string) {
    if (!supabaseSession || !activeCommunityId) return;
    const url = getSupabaseUrl();
    if (!url) return;
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
      resetResourceForm();
    }
    await loadCommunityResources(activeCommunityId, supabaseSession);
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
    const resourceType: CommunityResource["type"] = embedInfo ? "embed" : rawUrl ? "link" : "post";

    setIsSavingResource(true);
    setResourceError(null);
    const url = getSupabaseUrl();
    if (!url) {
      setResourceError("Missing Supabase URL.");
      setIsSavingResource(false);
      return;
    }

    const basePayload = {
      type: resourceType,
      title,
      body_md: description,
      url: rawUrl ? rawUrl : null,
      pinned: resourcePinnedInput
    };

    try {
      const response = await fetchWithSupabaseAuth(
        editingResourceId
          ? `${url}/rest/v1/community_resources?id=eq.${editingResourceId}`
          : `${url}/rest/v1/community_resources`,
        {
          method: editingResourceId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=representation"
          },
          body: JSON.stringify(
            editingResourceId
              ? basePayload
              : {
                  community_id: activeCommunityId,
                  ...basePayload
                }
          )
        },
        supabaseSession
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to save resource.");
      }
      setShowResourceModal(false);
      resetResourceForm();
      await loadCommunityResources(activeCommunityId, supabaseSession);
      setResourceSuccess(true);
      window.setTimeout(() => setResourceSuccess(false), 2000);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to save resource.";
      setResourceError(message);
    } finally {
      setIsSavingResource(false);
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
      if (ms > 0) expiresAt = new Date(Date.now() + ms).toISOString();
    }

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
        if (invite) {
          setCommunityInvites((prev) => [invite, ...prev]);
          setInviteMaxUsesPreset("unlimited");
          setInviteMaxUsesCustom("");
          setInviteExpiryPreset("7d");
          setInviteExpiryCustom("");
          try {
            await copyTextToClipboard(buildCommunityInviteLink(activeCommunityId, invite.code));
          } catch {
            // ignore
          }
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

  async function handleCommunityAvatarUpload(file: File | null) {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setCommunitySettingsAvatarUrl(dataUrl);
    } catch {
      setCommunitySettingsError("Failed to read avatar file.");
    }
  }

  async function handleCommunityBannerUpload(file: File | null) {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setCommunitySettingsBannerUrl(dataUrl);
    } catch {
      setCommunitySettingsError("Failed to read banner file.");
    }
  }

  function handleSettingsBannerDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsSettingsBannerDragOver(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    void handleCommunityBannerUpload(file);
  }

  function handleSettingsAvatarDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsSettingsAvatarDragOver(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    void handleCommunityAvatarUpload(file);
  }

  const activeCommunity = useMemo(() => {
    if (!activeCommunityId) return null;
    return communities.find((c) => c.id === activeCommunityId) ?? null;
  }, [activeCommunityId, communities]);

  const communityMessageById = useMemo(() => {
    const map = new Map<string, CommunityChatMessage>();
    for (const message of communityMessages) map.set(message.id, message);
    return map;
  }, [communityMessages]);

  const displayName = (id: string): string => shortId(id, supabaseSession?.user.id, supabaseSession?.user.email);

  const activeThread = useMemo(() => {
    if (!activeThreadId) return null;
    return threads.find((t) => t.id === activeThreadId) ?? null;
  }, [activeThreadId, threads]);

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

  const showCommunityRail = true;
  const showSessionsPanel = activePage === "workspace";
  const showCommunityNav = activePage === "community";
  const hasLeftPanel = showSessionsPanel || showCommunityNav;

  return (
    <div className="app-root">
      <button
        className={`icon-button web-community-toggle${activePage !== "workspace" ? " active" : ""}`}
        onClick={() => {
          setActiveView("home");
          if (activeView === "settings") setActiveView("home");
          if (activePage !== "workspace") {
            setActivePage("workspace");
            return;
          }
          if (communities.length === 0) {
            setActivePage("discover");
            return;
          }
          setActivePage("community");
          setCommunityTab("chat");
          setActiveCommunityId((prev) => prev ?? communities[0]?.id ?? null);
        }}
        aria-label="Community"
        title="Community"
        type="button"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </button>

      <div
        className={`app-shell${showCommunityRail ? " with-community-rail" : ""}${!hasLeftPanel ? " no-left" : ""} no-right`}
      >
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
                  onClick={() => {
                    setActiveView("home");
                    setActiveCommunityId(community.id);
                    setActivePage("community");
                    setCommunityTab("chat");
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
              {communities.length === 0 && (
                <div className="community-rail-empty">
                  {supabaseSession ? "No communities yet." : "Sign in to access communities."}
                </div>
              )}
              <div className="community-rail-divider" />
              <button
                type="button"
                className="community-rail-button community-rail-add"
                onClick={() => alert("Create community (web) not wired yet.")}
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

        {showSessionsPanel && (
          <aside className="sessions">
            <div className="sessions-header">
              <div className="project-selector" role="button" tabIndex={0}>
                <span className="project-name">Threads</span>
              </div>
              <button
                className="new-session-btn"
                type="button"
                onClick={() => {
                  if (!supabaseSession) {
                    handleSignIn();
                    return;
                  }
                  void createThread(supabaseSession);
                }}
                title="New thread"
                aria-label="New thread"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>

            {threadError && <div className="auth-error">{threadError}</div>}

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
                          {thread.id === activeThreadId && activeThread ? "Open" : ""}
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
                  type="button"
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
          {activeView === "settings" ? (
            <div className="settings-panel">
              <div className="settings-section">
                <div className="settings-section-title">Account</div>
                <div className="settings-section-desc">
                  Sign in to join communities and sync your threads across devices.
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
                    <button type="button" onClick={handleSignIn}>
                      Sign in
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : activePage === "workspace" ? (
            <>
              <div className="workspace-body">
                <div className="message-list" ref={workspaceMessageListRef}>
                  {!supabaseSession && (
                    <div className="chat-empty">Sign in to start a thread.</div>
                  )}
                  {supabaseSession && !activeThreadId && threads.length === 0 && (
                    <div className="chat-empty">No threads yet. Click + to start.</div>
                  )}
                  {supabaseSession && activeThreadId && threadMessages.length === 0 && (
                    <div className="chat-empty">No messages yet.</div>
                  )}
                  {threadMessages.map((message) => {
                    const isUser = message.role === "user";
                    return (
                      <div
                        key={message.id}
                        className={isUser ? "message-item user" : "message-item assistant"}
                      >
                        <div className="message-text">{parseMessageText(message.content_json)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="ask-bar">
                <textarea
                  className="ask-input"
                  placeholder={supabaseSession ? "Ask anything" : "Sign in to send messages"}
                  value={messageInput}
                  onChange={(event) => setMessageInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendUserMessage();
                    }
                  }}
                  disabled={!supabaseSession || isSendingMessage}
                  rows={1}
                />
                <div className="ask-toolbar">
                  <div className="ask-toolbar-left">
                    {activeThread && (
                      <div className="model-select">
                        <span>{(activeThread.title ?? "").trim() || "Untitled thread"}</span>
                      </div>
                    )}
                  </div>
                  <div className="ask-toolbar-right">
                    <button
                      className="toolbar-send"
                      type="button"
                      onClick={() => void sendUserMessage()}
                      disabled={!supabaseSession || isSendingMessage || messageInput.trim().length === 0}
                      title="Send"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
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
                      <button className="discover-refresh" type="button" onClick={() => void loadDiscoverCommunities()}>
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
                          <div className="discover-empty-title">No communities yet.</div>
                          <div className="discover-empty-text">
                            Create one on desktop to make discovery meaningful.
                          </div>
                        </div>
                      )}
                      {!isLoadingDiscover &&
                        filteredDiscoverCommunities.map((community) => {
                          const alreadyMember = communities.some((c) => c.id === community.id);
                          const visibilityLabel =
                            community.visibility === "public"
                              ? "Public"
                              : community.visibility === "unlisted"
                                ? "Unlisted"
                                : "Private";
                          const description =
                            community.description && community.description.trim().length > 0
                              ? community.description
                              : "No description yet.";
                          return (
                            <div key={community.id} className="discover-card">
                              <div
                                className={`discover-card-banner${community.banner_url ? " has-image" : ""}`}
                                style={
                                  community.banner_url
                                    ? { backgroundImage: `url(${community.banner_url})` }
                                    : undefined
                                }
                              />
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
                                    {community.slug && <div className="discover-card-slug">/{community.slug}</div>}
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
                                        type="button"
                                        onClick={() => {
                                          setActiveView("home");
                                          setActiveCommunityId(community.id);
                                          setActivePage("community");
                                          setCommunityTab("chat");
                                        }}
                                      >
                                        Open
                                      </button>
                                    ) : (
                                      <button className="discover-btn secondary" type="button" disabled>
                                        Join (desktop)
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

              {activePage === "community" && (
                <>
                  {communityTab === "chat" && (
                    <div className="community-chat">
                      <div className="workspace-body chat-feed">
                        <div className="chat-messages" ref={communityChatListRef} onScroll={handleChatScroll}>
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
                              const avatarColor = getAvatarColor(message.sender_id);
                              const shortTime = new Date(message.created_at).toLocaleTimeString([], {
                                hour: "numeric",
                                minute: "2-digit"
                              });
                              const replyToId = message.reply_to_id ?? null;
                              const replyTarget = replyToId ? communityMessageById.get(replyToId) ?? null : null;
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
                                          {REACTION_EMOJIS.map((emoji) => (
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
                                        const msgReactions = messageReactions.filter((r) => r.message_id === message.id);
                                        if (msgReactions.length === 0) return null;
                                        const groups: Record<string, MessageReaction[]> = {};
                                        for (const r of msgReactions) {
                                          if (!groups[r.emoji]) groups[r.emoji] = [];
                                          groups[r.emoji].push(r);
                                        }
                                        return (
                                          <div className="chat-reactions">
                                            {Object.entries(groups).map(([emoji, reactions]) => {
                                              const hasOwn = reactions.some((r) => r.user_id === supabaseSession?.user.id);
                                              return (
                                                <button
                                                  key={emoji}
                                                  className={`reaction-badge${hasOwn ? " own" : ""}`}
                                                  onClick={() => void handleToggleReaction(message.id, emoji)}
                                                  title={reactions.map((r) => displayName(r.user_id)).join(", ")}
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
                                        onClick={() =>
                                          setReactionPickerMessageId(reactionPickerMessageId === message.id ? null : message.id)
                                        }
                                        title="Add reaction"
                                      >
                                        <svg viewBox="0 0 24 24">
                                          <circle cx="12" cy="12" r="10" />
                                          <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
                                        </svg>
                                      </button>
                                      {!isPending && (
                                        <button className="chat-action-btn" onClick={() => handleStartReply(message)} title="Reply">
                                          <svg viewBox="0 0 24 24">
                                            <path d="M9 17l-5-5 5-5" />
                                            <path d="M4 12h9a7 7 0 0 1 7 7v2" />
                                          </svg>
                                        </button>
                                      )}
                                      <button className="chat-action-btn" onClick={() => void copyTextToClipboard(message.body)} title="Copy message">
                                        <svg viewBox="0 0 24 24">
                                          <rect x="9" y="9" width="13" height="13" rx="2" />
                                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                        </svg>
                                      </button>
                                      {isOwn && !isPending && (
                                        <>
                                          <button className="chat-action-btn" onClick={() => handleStartEdit(message)} title="Edit">
                                            <svg viewBox="0 0 24 24">
                                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                              <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                            </svg>
                                          </button>
                                          <button className="chat-action-btn delete" onClick={() => void handleDeleteMessage(message.id)} title="Delete">
                                            <svg viewBox="0 0 24 24">
                                              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                            </svg>
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
                            isUserAtBottomRef.current = true;
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
                            <svg viewBox="0 0 24 24">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      )}

                      <div className="chat-input-bar">
                        <textarea
                          ref={chatInputRef}
                          className="chat-input"
                          placeholder={
                            !supabaseSession
                              ? "Sign in to chat..."
                              : !activeCommunity
                                ? "Select a community to chat..."
                                : "Message the community..."
                          }
                          value={communityMessageInput}
                          onChange={(event) => {
                            setCommunityMessageInput(event.target.value);
                            event.target.style.height = "auto";
                            event.target.style.height = Math.min(event.target.scrollHeight, 120) + "px";
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              void handleSendCommunityMessage();
                            }
                          }}
                          disabled={!supabaseSession || !activeCommunity}
                          rows={1}
                        />
                        <button
                          className="chat-send"
                          onClick={() => void handleSendCommunityMessage()}
                          disabled={!supabaseSession || !activeCommunity || isSendingCommunityMessage}
                        >
                          <svg viewBox="0 0 24 24">
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
                            <button onClick={() => void handleSaveCommunitySettings()} disabled={isSavingCommunitySettings}>
                              {isSavingCommunitySettings ? "Saving..." : "Save settings"}
                            </button>
                            {communitySettingsError && <div className="auth-error">{communitySettingsError}</div>}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {communityTab === "resources" && (
                    <div className="community-panel resources-panel">
                      <div className="resources-header-row">
                        <div className="resources-header">Resources</div>
                        <button
                          className="resources-add-btn"
                          onClick={openNewResourceModal}
                          disabled={!supabaseSession || !activeCommunity}
                          title="Add resource"
                        >
                          +
                        </button>
                      </div>
                      {resourceSuccess && <div className="success-toast">Resource saved successfully!</div>}
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
                                    <div className="resource-actions">
                                      <button className="secondary" onClick={() => handleEditResource(resource)}>
                                        Edit
                                      </button>
                                      <button className="danger" onClick={() => void handleDeleteResource(resource.id)}>
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

                  {communityTab === "members" && (
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
                                  <div className="member-avatar" style={{ backgroundColor: getAvatarColor(member.user_id) }}>
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
                                    const inviteLink = buildCommunityInviteLink(activeCommunity.id, invite.code);
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
                                            title="Copy web join link"
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

                  {communityTab === "library" && (
                    <div className="community-panel library-panel">
                      <div className="chat-empty">Library on web is coming next.</div>
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
                              {isSavingResource ? "Saving..." : editingResourceId ? "Save changes" : "Save resource"}
                            </button>
                            <button className="secondary" onClick={closeResourceModal}>
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

      {authError && (
        <div className="toast error" role="status">
          {authError}
        </div>
      )}
    </div>
  );
}
