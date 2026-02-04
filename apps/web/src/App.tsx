import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";
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
import {
  captureBrandosAidFromLocation,
  clearPendingPublicJoin,
  clearPendingPurchaseClaimToken,
  getBrandosAidForCommunitySlug,
  joinPublicCommunityRpc,
  listPendingPurchaseClaimsRpc,
  readPendingPublicJoinBrandosAid,
  readPendingPublicJoinCommunityId,
  readPendingPublicJoinCommunitySlug,
  readPendingPurchaseClaimToken,
  redeemPendingPurchaseClaimsRpc,
  redeemPurchaseClaimRpc,
  storePendingPublicJoin,
  storePendingPurchaseClaimToken,
  type PendingPurchaseClaim
} from "../../../shared/pay_first";

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

type ThreadRecord = {
  id: string;
  title: string | null;
  engine_id: string;
  model_id: string | null;
  community_id: string | null;
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

type UserMemorySettings = {
  memory_mode: "off" | "suggest" | "auto";
  remember_intent_enabled: boolean;
};

type UserModelSettings = {
  system_prompt: string;
};

type MessageAttachment = {
  id: string;
  name: string;
  type: "image" | "file";
  mime: string | null;
  size: number;
  data_url?: string | null;
  text?: string | null;
  truncated?: boolean | null;
};

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

type CommunityAgentLandingTab = {
  id: string;
  label: string;
  prompts: string[];
};

type CommunityAgentLanding = {
  title: string;
  subtitle: string;
  tabs: CommunityAgentLandingTab[];
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
const MODEL_FAVORITES_STORAGE_KEY = "arx_model_favorites_v1";
const DEFAULT_GUEST_MODEL_ID = "gpt-oss-120b-free";
const GUEST_MODEL_ALLOWLIST = new Set<string>([DEFAULT_GUEST_MODEL_ID, "deepseek-r1-free"]);
const GUEST_MODEL_LABELS: Record<string, string> = {
  "gpt-oss-120b-free": "GPT OSS 120B (Free)",
  "deepseek-r1-free": "DeepSeek R1 (Free)",
};

type ModelSectionId = "all" | "favorites" | "free" | "openai" | "anthropic" | "google" | "x-ai" | "openrouter";

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

function loadModelFavorites(): string[] {
  try {
    const raw = localStorage.getItem(MODEL_FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    for (const item of parsed) {
      if (typeof item !== "string") continue;
      const id = item.trim();
      if (!id) continue;
      out.push(id);
    }
    return Array.from(new Set(out)).slice(0, 50);
  } catch {
    return [];
  }
}

function storeModelFavorites(ids: string[]): void {
  try {
    localStorage.setItem(MODEL_FAVORITES_STORAGE_KEY, JSON.stringify(ids));
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

const DEFAULT_EMPTY_THREAD_LANDING: CommunityAgentLanding = {
  title: "How can I help?",
  subtitle: "Start with a prompt, or ask anything.",
  tabs: [
    {
      id: "community",
      label: "Community",
      prompts: [
        "What is a community, and why would I start one?",
        "Help me pick a community topic people will care about.",
        "Write my welcome message and simple rules.",
        "How do I get my first 20 members? Give me a simple plan.",
      ],
    },
    {
      id: "plan",
      label: "Plan",
      prompts: [
        "Help me plan my week so I actually ship.",
        "Turn my big goal into 5 small steps. Ask me 2 questions first.",
        "Make a simple 30-day plan for a launch.",
        "What should I do first today? Ask me 3 questions.",
      ],
    },
    {
      id: "ops",
      label: "Desktop",
      prompts: [
        "What can the desktop app do that the web can't?",
        "Help me set up the desktop app in a safe way.",
        "How do I use the desktop app with my project folder (simple steps)?",
        "Should I use web or desktop for this? Ask me a few questions.",
      ],
    },
    {
      id: "learn",
      label: "Learn",
      prompts: [
        "What is Arx, in plain English?",
        "What does Arx remember, and what does it forget?",
        "What gets saved online vs on my computer?",
        "How do paid communities work here (simple version)?",
      ],
    },
  ],
};

function buildDefaultCommunityEmptyThreadLanding(communityName: string): CommunityAgentLanding {
  const name = communityName.trim();
  return {
    title: name ? `Welcome to ${name}` : "Welcome",
    subtitle: "Say hi in Chat, browse Resources, or ask the AI agent for help.",
    tabs: [
      {
        id: "start",
        label: "Start here",
        prompts: [
          "Where do I find Chat, Library, and Resources in this community?",
          "Help me write a short intro message to post in Chat.",
          "Ask me 5 questions so you can point me to the right place in this community.",
          "What should I do first to get value here?",
        ],
      },
      {
        id: "community",
        label: "Community",
        prompts: [
          "Help me write a post asking for feedback (short + clear).",
          "Help me turn my idea into a good question for the community.",
          "Write a friendly reply to someone who responded to my post.",
          "Suggest 3 ways I can contribute here this week (even as a beginner).",
        ],
      },
      {
        id: "agent",
        label: "AI Agent",
        prompts: [
          "What can the AI agent help me do here? Give me 5 simple examples.",
          "Help me make a simple plan for the next 7 days.",
          "Turn my notes into a clean outline, then a first draft.",
          "Ask me 5 questions to scope my goal before we start.",
        ],
      },
    ],
  };
}

function normalizeCommunityAgentLanding(input: unknown): CommunityAgentLanding | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const subtitle = typeof raw.subtitle === "string" ? raw.subtitle.trim() : "";
  const tabsRaw = Array.isArray(raw.tabs) ? raw.tabs : [];
  const tabs: CommunityAgentLandingTab[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < tabsRaw.length; i++) {
    if (tabs.length >= 4) break;
    const tabRaw = tabsRaw[i];
    if (!tabRaw || typeof tabRaw !== "object") continue;
    const tab = tabRaw as Record<string, unknown>;
    const label = typeof tab.label === "string" ? tab.label.trim() : "";
    const promptsRaw = Array.isArray(tab.prompts) ? tab.prompts : [];
    const prompts = promptsRaw
      .map((p) => (typeof p === "string" ? p.trim() : ""))
      .filter((p) => p)
      .slice(0, 12);
    if (!label || prompts.length === 0) continue;
    let id = typeof tab.id === "string" ? tab.id.trim() : "";
    if (!id) id = `tab-${i + 1}`;
    while (seenIds.has(id)) id = `${id}-x`;
    seenIds.add(id);
    tabs.push({ id, label, prompts });
  }
  if (tabs.length === 0) return null;
  return {
    title: title || DEFAULT_EMPTY_THREAD_LANDING.title,
    subtitle: subtitle || DEFAULT_EMPTY_THREAD_LANDING.subtitle,
    tabs,
  };
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
};

type CommunityMemberSettings = {
  community_id: string;
  user_id: string;
  muted: boolean;
  muted_until: string | null;
  created_at: string;
  updated_at: string;
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

type SettingsPage = "account" | "models" | "execution" | "memory" | "appearance";

type AppTheme = "light" | "dark" | "light-warm" | "dark-warm";

type ModelToggle = {
  id: string;
  label: string;
  enabled: boolean;
};

type ModelRegistryListRow = {
  id: string;
  display_name: string | null;
  sort_order: number | null;
};

type ProviderId = "openai" | "anthropic" | "google" | "x-ai";

type ProviderKey = {
  id: ProviderId;
  label: string;
  hasKey: boolean;
  inputValue: string;
  error: string | null;
};

const DEFAULT_PROVIDER_KEYS: ProviderKey[] = [
  { id: "openai", label: "OpenAI", hasKey: false, inputValue: "", error: null },
  { id: "anthropic", label: "Anthropic", hasKey: false, inputValue: "", error: null },
  { id: "google", label: "Google", hasKey: false, inputValue: "", error: null },
  { id: "x-ai", label: "xAI", hasKey: false, inputValue: "", error: null },
];

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

type PublicChatPreviewMessage = {
  seq: number;
  created_at: string;
  sender_key: string;
  sender_display_name: string | null;
  sender_avatar_url: string | null;
  body: string;
};

type BuilderBillingStatus = {
  user_id: string;
  builder_tier: "free" | "builder" | "pro";
  max_communities: number;
  platform_fee_bps: number;
  has_payouts: boolean;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
};

type BuilderBillingReturn = {
  status: "success" | "cancel" | "return";
  source: "web" | "desktop" | "unknown";
  context: "builder" | "create_community" | "unknown";
};

type BuilderUpgradeContext = "builder" | "create_community";

type CreateCommunityDraft = {
  v: 1;
  id: string;
  created_at: number;
  user_id: string | null;
  name: string;
  slug: string;
  slug_edited: boolean;
  visibility: "public" | "unlisted" | "private";
  avatar_url: string | null;
  banner_url: string | null;
  description: string | null;
};

type AutomationEndpoint = {
  id: string;
  name: string;
  url: string;
  is_enabled: boolean;
  event_types: string[] | null;
  include_email: boolean;
  created_at: string;
  updated_at: string;
};

type BrandosConnector = {
  endpoint_id: string;
  base_url: string;
  brandos_account_id: string;
  is_enabled: boolean;
  updated_at: string;
};

type AutomationDelivery = {
  attempted_at: string;
  event_type: string;
  endpoint_name: string;
  status: "success" | "fail";
  response_code: number | null;
  duration_ms: number | null;
  error: string | null;
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
  | "analytics"
  | "automations";

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
  { id: "gemini-3-flash", label: "Gemini 3 Flash", enabled: true },
  { id: "gemini-3-pro", label: "Gemini 3 Pro", enabled: true },
  { id: "grok-4.1", label: "Grok 4.1", enabled: true }
];

const MODEL_TOGGLES_STORAGE_KEY = "arx_model_toggles";
const ACTIVE_MODEL_STORAGE_KEY = "arx_active_model_id";
const CREATE_COMMUNITY_DRAFT_STORAGE_KEY = "arx_create_community_draft_v1";
const CREATE_COMMUNITY_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

function isUuid(value: string): boolean {
  return /^[0-9a-fA-F-]{36}$/.test(value);
}

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
                : rawCommunityTab === "automations"
                  ? "automations"
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

function formatPlanPrice(plan: PublicPlanSummary): string {
  const raw = String(plan.amount_base_units ?? "").trim();
  const amount = Number(raw);
  const decimals = Number(plan.currency_decimals ?? 2);
  const value = Number.isFinite(amount) ? amount / Math.pow(10, decimals) : 0;
  const currency = String(plan.currency ?? "").toUpperCase();
  const suffix = plan.billing_period === "yearly" ? "/year" : plan.billing_period === "monthly" ? "/month" : "";
  if (currency === "USD") return `$${value.toFixed(0)}${suffix}`;
  return `${value.toFixed(0)} ${currency}${suffix}`;
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

    const side = Math.min(img.width, img.height);
    const sx = Math.floor((img.width - side) / 2);
    const sy = Math.floor((img.height - side) / 2);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function readBannerFileAsWideDataUrlWithinLimit(file: File, maxChars: number): Promise<string> {
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

    const sourceWidth = img.naturalWidth || img.width;
    const sourceHeight = img.naturalHeight || img.height;
    if (!sourceWidth || !sourceHeight) throw new Error("Invalid image dimensions.");

    const candidates: Array<{ width: number; height: number; quality: number }> = [
      { width: 960, height: 320, quality: 0.86 },
      { width: 768, height: 256, quality: 0.82 },
      { width: 576, height: 192, quality: 0.78 },
      { width: 480, height: 160, quality: 0.74 }
    ];

    const targetAspect = candidates[0].width / candidates[0].height;
    const sourceAspect = sourceWidth / sourceHeight;
    let sx = 0;
    let sy = 0;
    let sw = sourceWidth;
    let sh = sourceHeight;

    if (sourceAspect > targetAspect) {
      // Source is wider: crop left/right.
      sh = sourceHeight;
      sw = Math.max(1, Math.floor(sourceHeight * targetAspect));
      sx = Math.max(0, Math.floor((sourceWidth - sw) / 2));
      sy = 0;
    } else if (sourceAspect < targetAspect) {
      // Source is taller: crop top/bottom.
      sw = sourceWidth;
      sh = Math.max(1, Math.floor(sourceWidth / targetAspect));
      sx = 0;
      sy = Math.max(0, Math.floor((sourceHeight - sh) / 2));
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported.");

    let lastDataUrl = "";
    for (const { width, height, quality } of candidates) {
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      lastDataUrl = dataUrl;
      if (dataUrl.length <= maxChars) return dataUrl;
    }

    if (lastDataUrl && lastDataUrl.length <= maxChars) return lastDataUrl;
    throw new Error("Banner image is too large. Try a smaller image.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

const MAX_WEB_ATTACHMENTS_PER_MESSAGE = 8;
const MAX_WEB_IMAGE_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB (client-side; still compressed before sending)
const MAX_WEB_FILE_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_WEB_TEXT_ATTACHMENT_BYTES = 200 * 1024; // 200KB
const MAX_WEB_IMAGE_DATA_URL_CHARS = 600_000; // ~0.6MB base64 payload

function isLikelyTextFile(file: File): boolean {
  const mime = (file.type ?? "").toLowerCase();
  if (mime.startsWith("text/")) return true;
  if (mime === "application/json") return true;
  if (mime === "application/xml") return true;
  if (mime === "application/x-yaml") return true;
  const name = (file.name ?? "").toLowerCase();
  return (
    name.endsWith(".md") ||
    name.endsWith(".txt") ||
    name.endsWith(".csv") ||
    name.endsWith(".ts") ||
    name.endsWith(".tsx") ||
    name.endsWith(".js") ||
    name.endsWith(".jsx") ||
    name.endsWith(".json") ||
    name.endsWith(".py") ||
    name.endsWith(".rs") ||
    name.endsWith(".go") ||
    name.endsWith(".html") ||
    name.endsWith(".css") ||
    name.endsWith(".yml") ||
    name.endsWith(".yaml")
  );
}

function isLikelyImageFile(file: File): boolean {
  const mime = (file.type ?? "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const name = (file.name ?? "").toLowerCase();
  return (
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".gif") ||
    name.endsWith(".webp") ||
    name.endsWith(".avif")
  );
}

function isSupportedChatRasterImage(file: File): boolean {
  const mime = (file.type ?? "").toLowerCase();
  const name = (file.name ?? "").toLowerCase();
  const isSvg = mime.includes("svg") || name.endsWith(".svg");
  const isHeic = mime.includes("heic") || mime.includes("heif") || name.endsWith(".heic") || name.endsWith(".heif");
  return !isSvg && !isHeic && isLikelyImageFile(file);
}

async function readTextAttachmentPreview(file: File): Promise<{ text: string; truncated: boolean }> {
  const truncated = file.size > MAX_WEB_TEXT_ATTACHMENT_BYTES;
  const slice = truncated ? file.slice(0, MAX_WEB_TEXT_ATTACHMENT_BYTES) : file;
  const text = await slice.text();
  return { text, truncated };
}

async function readChatImageAsDataUrl(file: File): Promise<string> {
  // Fallback: if canvas path fails (some formats), try direct data URL when small enough.
  const tryDirectDataUrl = async (): Promise<string | null> => {
    if (file.size > 2 * 1024 * 1024) return null;
    const raw = await fileToDataUrl(file);
    if (!raw.startsWith("data:image/")) return null;
    return raw.length <= MAX_WEB_IMAGE_DATA_URL_CHARS ? raw : null;
  };

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

    const candidates: Array<{ maxDim: number; quality: number }> = [
      { maxDim: 1280, quality: 0.85 },
      { maxDim: 1024, quality: 0.82 },
      { maxDim: 768, quality: 0.78 },
      { maxDim: 512, quality: 0.74 },
      { maxDim: 384, quality: 0.70 },
      { maxDim: 320, quality: 0.66 }
    ];

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported.");

    const sourceWidth = img.naturalWidth || img.width;
    const sourceHeight = img.naturalHeight || img.height;
    if (!sourceWidth || !sourceHeight) throw new Error("Invalid image dimensions.");

    let lastDataUrl = "";
    for (const { maxDim, quality } of candidates) {
      const scale = Math.min(1, maxDim / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      try {
        lastDataUrl = canvas.toDataURL("image/jpeg", quality);
      } catch {
        const direct = await tryDirectDataUrl();
        if (direct) return direct;
        throw new Error("Could not process image. Try exporting as PNG or JPG.");
      }
      if (lastDataUrl.length <= MAX_WEB_IMAGE_DATA_URL_CHARS) return lastDataUrl;
    }

    if (lastDataUrl && lastDataUrl.length <= MAX_WEB_IMAGE_DATA_URL_CHARS) return lastDataUrl;
    const direct = await tryDirectDataUrl();
    if (direct) return direct;
    throw new Error("Image is too large to attach. Try a smaller one.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function parseMessageAttachments(contentJson: unknown): MessageAttachment[] {
  if (contentJson === null || contentJson === undefined) return [];
  let parsed: unknown = contentJson;
  if (typeof parsed === "string") {
    const trimmed = parsed.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return [];
    }
  }
  if (!parsed || typeof parsed !== "object") return [];
  const raw = (parsed as any).attachments;
  if (!Array.isArray(raw)) return [];
  const out: MessageAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const id = typeof (item as any).id === "string" ? String((item as any).id) : crypto.randomUUID();
    const name = typeof (item as any).name === "string" ? String((item as any).name) : "attachment";
    const type = (item as any).type === "image" ? "image" : "file";
    const mime = typeof (item as any).mime === "string" ? String((item as any).mime) : null;
    const size = Number.isFinite((item as any).size) ? Number((item as any).size) : 0;
    const data_url = typeof (item as any).data_url === "string" ? String((item as any).data_url) : null;
    const text = typeof (item as any).text === "string" ? String((item as any).text) : null;
    const truncated = typeof (item as any).truncated === "boolean" ? Boolean((item as any).truncated) : null;
    out.push({ id, name, type, mime, size, data_url, text, truncated });
  }
  return out;
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

function createCommunityDraftId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // ignore
  }
  return `draft_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function loadCreateCommunityDraft(): CreateCommunityDraft | null {
  try {
    const raw = localStorage.getItem(CREATE_COMMUNITY_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    if (record.v !== 1) return null;
    const createdAt = Number(record.created_at);
    if (!Number.isFinite(createdAt) || createdAt <= 0) return null;
    if (Date.now() - createdAt > CREATE_COMMUNITY_DRAFT_TTL_MS) {
      localStorage.removeItem(CREATE_COMMUNITY_DRAFT_STORAGE_KEY);
      return null;
    }

    const id = typeof record.id === "string" ? record.id : createCommunityDraftId();
    const user_id = typeof record.user_id === "string" ? record.user_id : null;
    const name = typeof record.name === "string" ? record.name : "";
    const slug = typeof record.slug === "string" ? record.slug : "";
    const slug_edited = Boolean(record.slug_edited);
    const visibility =
      record.visibility === "public" || record.visibility === "unlisted" || record.visibility === "private"
        ? (record.visibility as "public" | "unlisted" | "private")
        : "private";
    const avatar_url = typeof record.avatar_url === "string" ? record.avatar_url : null;
    const banner_url = typeof record.banner_url === "string" ? record.banner_url : null;
    const description = typeof record.description === "string" ? record.description : null;

    if (!name.trim() || !slug.trim() || !isValidSlug(slug.trim().toLowerCase())) return null;

    return {
      v: 1,
      id,
      created_at: createdAt,
      user_id,
      name,
      slug,
      slug_edited,
      visibility,
      avatar_url,
      banner_url,
      description,
    };
  } catch {
    return null;
  }
}

function saveCreateCommunityDraft(draft: CreateCommunityDraft): void {
  try {
    localStorage.setItem(CREATE_COMMUNITY_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // ignore
  }
}

function clearCreateCommunityDraft(): void {
  try {
    localStorage.removeItem(CREATE_COMMUNITY_DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
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
    await copyTextToClipboard(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        {language && <span className="code-block-lang">{language}</span>}
        <button className="code-block-copy" type="button" onClick={() => void handleCopy()}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="md-code-block">
        <code
          className={language ? `language-${language} hljs` : "hljs"}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </div>
  );
}

function renderMarkdown(text: string): ReactNode {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const elements: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith("```")) {
      const lang = trimmedLine.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
        codeLines.push(lines[i] ?? "");
        i++;
      }
      elements.push(<CodeBlock key={key++} code={codeLines.join("\n")} language={lang || undefined} />);
      i++;
      continue;
    }

    if (/^(-{3,}|_{3,}|\*{3,})$/.test(trimmedLine)) {
      elements.push(<hr key={key++} className="md-hr" />);
      i++;
      continue;
    }

    const headerMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1]?.length ?? 1;
      const content = headerMatch[2] ?? "";
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      elements.push(
        <Tag key={key++} className="md-header">
          {renderInline(content)}
        </Tag>
      );
      i++;
      continue;
    }

    if (trimmedLine.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length) {
        const raw = lines[i] ?? "";
        const trimmed = raw.trim();
        if (trimmed === "") {
          quoteLines.push("");
          i++;
          continue;
        }
        if (!trimmed.startsWith(">")) break;
        let inner = trimmed.slice(1);
        if (inner.startsWith(" ")) inner = inner.slice(1);
        quoteLines.push(inner);
        i++;
      }
      elements.push(
        <blockquote key={key++} className="md-blockquote">
          {renderMarkdown(quoteLines.join("\n"))}
        </blockquote>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\.\s+/.test(trimmedLine)) {
      const listItems: Array<{ kind: "text"; lines: string[] } | { kind: "code"; code: string; language?: string }> =
        [];
      while (i < lines.length) {
        const rawLine = lines[i] ?? "";
        const currentLine = rawLine.trim();
        if (/^\d+\.\s+/.test(currentLine)) {
          const content = currentLine.replace(/^\d+\.\s+/, "");
          listItems.push({ kind: "text", lines: [content] });
          i++;
        } else if (currentLine.startsWith("```")) {
          const lang = currentLine.slice(3).trim();
          const codeLines: string[] = [];
          i++;
          while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
            codeLines.push(lines[i] ?? "");
            i++;
          }
          listItems.push({ kind: "code", code: codeLines.join("\n"), language: lang || undefined });
          i++;
        } else if (currentLine === "") {
          i++;
        } else if (/^( {2,}|\t)/.test(rawLine) && listItems.length > 0) {
          const last = listItems[listItems.length - 1];
          if (last && last.kind === "text") {
            last.lines.push(currentLine);
            i++;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      elements.push(
        <ol key={key++} className="md-list">
          {listItems.map((item) =>
            item.kind === "code" ? (
              <li key={key++} className="md-list-code">
                <CodeBlock code={item.code} language={item.language} />
              </li>
            ) : (
              <li key={key++}>{renderInline(item.lines.join("\n"))}</li>
            )
          )}
        </ol>
      );
      continue;
    }

    // Bullet list
    if (/^[-*]\s+/.test(trimmedLine)) {
      const listItems: Array<{ kind: "text"; lines: string[] } | { kind: "code"; code: string; language?: string }> =
        [];
      while (i < lines.length) {
        const rawLine = lines[i] ?? "";
        const currentLine = rawLine.trim();
        if (/^[-*]\s+/.test(currentLine)) {
          const content = currentLine.replace(/^[-*]\s+/, "");
          listItems.push({ kind: "text", lines: [content] });
          i++;
        } else if (currentLine.startsWith("```")) {
          const lang = currentLine.slice(3).trim();
          const codeLines: string[] = [];
          i++;
          while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
            codeLines.push(lines[i] ?? "");
            i++;
          }
          listItems.push({ kind: "code", code: codeLines.join("\n"), language: lang || undefined });
          i++;
        } else if (currentLine === "") {
          i++;
        } else if (/^( {2,}|\t)/.test(rawLine) && listItems.length > 0) {
          const last = listItems[listItems.length - 1];
          if (last && last.kind === "text") {
            last.lines.push(currentLine);
            i++;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      elements.push(
        <ul key={key++} className="md-list">
          {listItems.map((item) =>
            item.kind === "code" ? (
              <li key={key++} className="md-list-code">
                <CodeBlock code={item.code} language={item.language} />
              </li>
            ) : (
              <li key={key++}>{renderInline(item.lines.join("\n"))}</li>
            )
          )}
        </ul>
      );
      continue;
    }

    if (trimmedLine === "") {
      i++;
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const raw = lines[i] ?? "";
      const trimmed = raw.trim();
      if (trimmed === "") break;
      if (
        trimmed.startsWith("```") ||
        /^(-{3,}|_{3,}|\*{3,})$/.test(trimmed) ||
        /^(#{1,6})\s+(.+)$/.test(trimmed) ||
        trimmed.startsWith(">") ||
        /^\d+\.\s+/.test(trimmed) ||
        /^[-*]\s+/.test(trimmed)
      ) {
        break;
      }
      paragraphLines.push(raw);
      i++;
    }
    elements.push(
      <p key={key++} className="md-paragraph">
        {renderInline(paragraphLines.join("\n"))}
      </p>
    );
  }

  return <>{elements}</>;
}

function renderInline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(
        <code key={key++} className="md-inline-code">
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const label = linkMatch[1] ?? "";
      const href = (linkMatch[2] ?? "").trim();
      const safeHref =
        href.startsWith("https://") || href.startsWith("http://") || href.startsWith("mailto:") ? href : null;
      parts.push(
        safeHref ? (
          <a key={key++} className="md-link" href={safeHref} target="_blank" rel="noreferrer">
            {label}
          </a>
        ) : (
          label
        )
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    const strikeMatch = remaining.match(/^~~([^~]+)~~/);
    if (strikeMatch) {
      parts.push(<s key={key++}>{strikeMatch[1]}</s>);
      remaining = remaining.slice(strikeMatch[0].length);
      continue;
    }

    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/) ?? remaining.match(/^__([^_]+)__/);
    if (boldMatch) {
      parts.push(<strong key={key++}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    const italicMatch = remaining.match(/^\*([^*]+)\*/) ?? remaining.match(/^_([^_]+)_/);
    if (italicMatch) {
      parts.push(<em key={key++}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    const nextSpecial = remaining.search(/[`*_\[~]/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    }
    if (nextSpecial === 0) {
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
      continue;
    }
    parts.push(remaining.slice(0, nextSpecial));
    remaining = remaining.slice(nextSpecial);
  }

  return <>{parts}</>;
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

function formatInferenceSourceLabel(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "platform") return "Arx";
  if (raw === "user") return "BYOK";
  if (raw === "chatgpt") return "ChatGPT";
  return null;
}

function formatModelSignature(modelId: string | null | undefined, inferenceSource: string | null | undefined): string | null {
  const base = formatModelLabel(modelId);
  if (!base) return null;
  const source = formatInferenceSourceLabel(inferenceSource);
  return source ? `${base} · ${source}` : base;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(columns: string[], rows: Array<Record<string, unknown>>): string {
  const header = columns.map(csvEscape).join(",");
  const lines = rows.map((row) => columns.map((col) => csvEscape(row[col])).join(","));
  return [header, ...lines].join("\n");
}

function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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

const CHAT_LINK_RE = /\b(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;

function splitUrlAndTrailingPunctuation(candidate: string): { url: string; trailing: string } {
  let url = candidate;
  let trailing = "";
  while (url.length > 0) {
    const last = url.slice(-1);
    if (").,!?;:]}'\"".includes(last)) {
      trailing = last + trailing;
      url = url.slice(0, -1);
      continue;
    }
    break;
  }
  return { url, trailing };
}

function renderTextWithLinks(text: string): ReactNode {
  if (!text) return "";
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(CHAT_LINK_RE)) {
    const index = match.index ?? -1;
    if (index < 0) continue;
    if (index > lastIndex) nodes.push(text.slice(lastIndex, index));
    const raw = match[0] ?? "";
    const { url, trailing } = splitUrlAndTrailingPunctuation(raw);
    const href = url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;
    nodes.push(
      <a key={`link-${index}`} href={href} target="_blank" rel="noreferrer noopener">
        {url}
      </a>
    );
    if (trailing) nodes.push(trailing);
    lastIndex = index + raw.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.length > 0 ? <>{nodes}</> : text;
}

function parseContentRangeTotal(value: string | null): number | null {
  if (!value) return null;
  const parts = value.split("/");
  if (parts.length !== 2) return null;
  const total = Number(parts[1]);
  return Number.isFinite(total) ? total : null;
}

function formatCount(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString();
}

function formatPercent(value: number | null, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function formatMoneyBaseUnits(
  value: number | null,
  currency: string | null,
  currencyDecimals: number | null
): string {
  if (value == null || currency == null || currencyDecimals == null) return "—";
  const major = value / Math.pow(10, currencyDecimals);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: currencyDecimals,
    }).format(major);
  } catch {
    return major.toFixed(Math.min(Math.max(currencyDecimals, 0), 6));
  }
}

function dateKeyLocal(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function AnalyticsLineChart({
  points,
  valueFormatter,
}: {
  points: AnalyticsPoint[];
  valueFormatter?: (value: number) => string;
}) {
  const width = 720;
  const height = 180;
  const paddingX = 22;
  const paddingY = 22;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const formatValue = valueFormatter ?? ((value: number) => formatCount(value));

  if (!points || points.length === 0) {
    return <div className="analytics-line-chart analytics-line-chart-empty">No trend data yet.</div>;
  }

  const maxValue = Math.max(1, ...points.map((point) => point.value));
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;
  const stepX = points.length > 1 ? innerWidth / (points.length - 1) : innerWidth;
  const bottomY = height - paddingY;

  const coords = points.map((point, index) => {
    const x = paddingX + stepX * index;
    const y = paddingY + innerHeight - (point.value / maxValue) * innerHeight;
    return { x, y };
  });

  const linePath = coords
    .map((coord, index) => `${index === 0 ? "M" : "L"}${coord.x.toFixed(2)},${coord.y.toFixed(2)}`)
    .join(" ");
  const areaPath = `M${coords[0].x.toFixed(2)},${bottomY.toFixed(2)} L ${coords
    .map((coord) => `${coord.x.toFixed(2)},${coord.y.toFixed(2)}`)
    .join(" L ")} L ${coords[coords.length - 1].x.toFixed(2)},${bottomY.toFixed(2)} Z`;

  const startLabel = points[0]?.label ?? "";
  const endLabel = points[points.length - 1]?.label ?? "";
  const gradientId = "analyticsAreaGradient";
  const activeIndex = hoverIndex == null ? null : Math.min(Math.max(hoverIndex, 0), points.length - 1);
  const activeCoord = activeIndex == null ? null : coords[activeIndex];
  const activePoint = activeIndex == null ? null : points[activeIndex];
  const activeLabel = activePoint?.label ?? "";
  const activeValue = activePoint?.value ?? null;

  return (
    <div className="analytics-line-chart">
      <svg
        className="analytics-chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Trend chart"
        preserveAspectRatio="none"
        onPointerLeave={() => setHoverIndex(null)}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          if (rect.width <= 0) return;
          const x = (event.clientX - rect.left) * (width / rect.width);
          const idx = Math.round((x - paddingX) / stepX);
          const clamped = Math.min(Math.max(idx, 0), points.length - 1);
          setHoverIndex(clamped);
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-gold)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent-gold)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((ratio) => {
          const y = paddingY + innerHeight * ratio;
          return (
            <line
              key={ratio}
              className="analytics-chart-grid"
              x1={paddingX}
              y1={y}
              x2={width - paddingX}
              y2={y}
            />
          );
        })}

        <path className="analytics-chart-area" d={areaPath} fill={`url(#${gradientId})`} />
        <path className="analytics-chart-line" d={linePath} />

        {activeCoord && (
          <>
            <line
              className="analytics-chart-hover-line"
              x1={activeCoord.x}
              y1={paddingY}
              x2={activeCoord.x}
              y2={height - paddingY}
            />
            <circle className="analytics-chart-hover-dot" cx={activeCoord.x} cy={activeCoord.y} r="4" />
          </>
        )}

        {coords.length > 0 && !activeCoord && (
          <circle className="analytics-chart-dot" cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="3" />
        )}
      </svg>
      {activeCoord && (
        <div
          className="analytics-chart-tooltip"
          style={{
            left: `${(activeCoord.x / width) * 100}%`,
            top: "50%",
          }}
        >
          <div className="analytics-chart-tooltip-label">{activeLabel}</div>
          <div className="analytics-chart-tooltip-value">
            {activeValue == null ? "—" : formatValue(activeValue)}
          </div>
        </div>
      )}
      <div className="analytics-chart-axis">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}

function analyticsRangeLabel(range: AnalyticsRange): string {
  switch (range) {
    case "7d":
      return "Last 7 days";
    case "30d":
      return "Last 30 days";
    case "90d":
      return "Last 90 days";
    case "1y":
      return "Last year";
    case "all":
      return "All time";
    default:
      return "Last 30 days";
  }
}

function analyticsRangeDays(range: AnalyticsRange): number | null {
  switch (range) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
    case "1y":
      return 365;
    default:
      return null;
  }
}

function analyticsRangeBucket(range: AnalyticsRange): "day" | "week" | "month" {
  if (range === "7d" || range === "30d") return "day";
  if (range === "90d") return "week";
  return "month";
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

function formatRelativeTime(iso: string): string {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (deltaSeconds < 45) return "just now";
  if (deltaSeconds < 90) return "1m ago";
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

function formatAutomationDeliveryError(error: string | null): string | null {
  if (!error) return null;
  if (error === "skipped_missing_brandos_aid") return "Skipped (missing BrandOS token)";
  if (error === "skipped_invalid_brandos_aid") return "Skipped (invalid BrandOS token)";
  if (error === "skipped_unknown_brandos_aid") return "Skipped (no tracked click found)";
  return error;
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

export default function App() {
  const ARX_OWNER_EMAIL = "neilmcdevittd@gmail.com";
  const initialPublicRoute = readPublicRouteFromLocation();
  const initialAppRoute = initialPublicRoute.kind === "app" ? readAppRouteFromLocation() : null;

  const [supabaseSession, setSupabaseSession] = useState<SupabaseSession | null>(() => loadPersistedSupabaseSession());
  const [authError, setAuthError] = useState<string | null>(null);
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [magicLinkStatus, setMagicLinkStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null);

  const sessionRef = useRef<SupabaseSession | null>(null);
  const refreshInFlightRef = useRef<Promise<SupabaseSession | null> | null>(null);
  const refreshTimeoutRef = useRef<number | null>(null);
  const lastCheckoutFinalizeSessionIdRef = useRef<string | null>(null);

  const [publicRoute, setPublicRoute] = useState<PublicRoute>(() => initialPublicRoute);

  const [activePage, setActivePage] = useState<AppPage>(() => initialAppRoute?.page ?? "workspace");
  const [activeView, setActiveView] = useState<AppView>(() => initialAppRoute?.view ?? "home");
  const [settingsPage, setSettingsPage] = useState<SettingsPage>(() => initialAppRoute?.settingsPage ?? "models");
  const [userWantsSessions, setUserWantsSessions] = useState(false);
  const [appTheme, setAppTheme] = useState<AppTheme>(() => {
    try {
      const stored = localStorage.getItem("arx-theme");
      if (stored && ["light", "dark", "light-warm", "dark-warm"].includes(stored)) {
        return stored as AppTheme;
      }
      return "dark";
    } catch {
      return "dark";
    }
  });
  const [profileName, setProfileName] = useState(() => {
    try {
      return localStorage.getItem("arx_profile_name") ?? localStorage.getItem("arx_profile_display_name") ?? "";
    } catch {
      return "";
    }
  });
  const [profileUsername, setProfileUsername] = useState(() => {
    try {
      return localStorage.getItem("arx_profile_username") ?? "";
    } catch {
      return "";
    }
  });
  const [profileBio, setProfileBio] = useState(() => {
    try {
      return localStorage.getItem("arx_profile_bio") ?? "";
    } catch {
      return "";
    }
  });
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(() => {
    try {
      return localStorage.getItem("arx_profile_avatar");
    } catch {
      return null;
    }
  });
  const [cloudProfile, setCloudProfile] = useState<UserProfileDetail | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);
  const profileSaveTimeoutRef = useRef<number | null>(null);
  const [isProfileAvatarDragOver, setIsProfileAvatarDragOver] = useState(false);
  const [providerKeys, setProviderKeys] = useState<ProviderKey[]>(() => DEFAULT_PROVIDER_KEYS);

  const [publicCommunity, setPublicCommunity] = useState<PublicCommunityRecord | null>(null);
  const [publicCommunityPlans, setPublicCommunityPlans] = useState<PublicPlanSummary[]>([]);
  const [selectedPublicCommunityBillingPeriod, setSelectedPublicCommunityBillingPeriod] = useState<string | null>(null);
  const [publicCommunityError, setPublicCommunityError] = useState<string | null>(null);
  const [isLoadingPublicCommunity, setIsLoadingPublicCommunity] = useState(false);
  const [publicChatPreviewMessages, setPublicChatPreviewMessages] = useState<PublicChatPreviewMessage[]>([]);
  const [isLoadingPublicChatPreview, setIsLoadingPublicChatPreview] = useState(false);
  const [publicChatPreviewError, setPublicChatPreviewError] = useState<string | null>(null);
  const [isJoiningPublicCommunity, setIsJoiningPublicCommunity] = useState(false);
  const [publicJoinError, setPublicJoinError] = useState<string | null>(null);

  const [pendingPurchaseClaims, setPendingPurchaseClaims] = useState<PendingPurchaseClaim[]>([]);
  const [isLoadingPendingPurchases, setIsLoadingPendingPurchases] = useState(false);
  const [pendingPurchasesError, setPendingPurchasesError] = useState<string | null>(null);
  const [isRedeemingPendingPurchases, setIsRedeemingPendingPurchases] = useState(false);
  const [pendingPurchasesSuccess, setPendingPurchasesSuccess] = useState<string | null>(null);
  const [isPendingPurchasesBannerDismissed, setIsPendingPurchasesBannerDismissed] = useState(false);

  const [builderBillingStatus, setBuilderBillingStatus] = useState<BuilderBillingStatus | null>(null);
  const [isLoadingBuilderBilling, setIsLoadingBuilderBilling] = useState(false);
  const [builderBillingError, setBuilderBillingError] = useState<string | null>(null);
  const [isDevSettingBuilderTier, setIsDevSettingBuilderTier] = useState(false);
  const [devSetBuilderTierError, setDevSetBuilderTierError] = useState<string | null>(null);
  const [isStartingBuilderCheckout, setIsStartingBuilderCheckout] = useState(false);
  const [isStartingBuilderPortal, setIsStartingBuilderPortal] = useState(false);
  const [isStartingConnectOnboarding, setIsStartingConnectOnboarding] = useState(false);
  const [isBuilderUpgradeOpen, setIsBuilderUpgradeOpen] = useState(false);
  const [builderUpgradeContext, setBuilderUpgradeContext] = useState<BuilderUpgradeContext>("builder");
  const [builderBillingReturn, setBuilderBillingReturn] = useState<BuilderBillingReturn | null>(null);
  const [isFinalizingBuilderReturn, setIsFinalizingBuilderReturn] = useState(false);
  const [isFinalizingCreateCommunityFromBilling, setIsFinalizingCreateCommunityFromBilling] = useState(false);
  const [finalizeCreateCommunityError, setFinalizeCreateCommunityError] = useState<string | null>(null);
  const builderUpgradeModalBodyRef = useRef<HTMLDivElement | null>(null);
  const [showBuilderUpgradeScrollHint, setShowBuilderUpgradeScrollHint] = useState(false);

  const [checkoutStatus, setCheckoutStatus] = useState<"idle" | "loading" | "pending" | "succeeded" | "error">("idle");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutClaimToken, setCheckoutClaimToken] = useState<string | null>(null);
  const [isRedeemingClaim, setIsRedeemingClaim] = useState(false);
  const [redeemClaimError, setRedeemClaimError] = useState<string | null>(null);
  const [manualClaimToken, setManualClaimToken] = useState("");
  const [checkoutFinalizeNonce, setCheckoutFinalizeNonce] = useState(0);
  const checkoutFinalizeInFlightRef = useRef(false);
  const checkoutFinalizePollCountRef = useRef(0);
  const checkoutFinalizePollTimeoutRef = useRef<number | null>(null);
  const redeemPendingPurchasesInFlightRef = useRef(false);
  const lastAutoRedeemPendingPurchasesUserIdRef = useRef<string | null>(null);
  const autoRedeemPendingPurchasesAttemptRef = useRef(0);
  const autoRedeemPendingPurchasesTimeoutRef = useRef<number | null>(null);

  const updateBuilderUpgradeScrollHint = useCallback(() => {
    const el = builderUpgradeModalBodyRef.current;
    if (!el) return;
    const threshold = 8;
    const scrollable = el.scrollHeight - el.clientHeight > threshold;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
    setShowBuilderUpgradeScrollHint(scrollable && !atBottom);
  }, []);

  useEffect(() => {
    if (!isBuilderUpgradeOpen) {
      setShowBuilderUpgradeScrollHint(false);
      return;
    }
    updateBuilderUpgradeScrollHint();
    const handleResize = () => updateBuilderUpgradeScrollHint();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isBuilderUpgradeOpen, updateBuilderUpgradeScrollHint]);

  useEffect(() => {
    if (!isBuilderUpgradeOpen) return;
    updateBuilderUpgradeScrollHint();
  }, [builderBillingStatus?.builder_tier, builderUpgradeContext, isBuilderUpgradeOpen, updateBuilderUpgradeScrollHint]);

  const [modelToggles, setModelToggles] = useState<ModelToggle[]>(() => {
    try {
      const raw = localStorage.getItem(MODEL_TOGGLES_STORAGE_KEY);
      if (!raw) return DEFAULT_MODEL_TOGGLES;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return DEFAULT_MODEL_TOGGLES;
      const normalized = parsed
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const id = (item as { id?: unknown }).id;
          const label = (item as { label?: unknown }).label;
          const enabled = (item as { enabled?: unknown }).enabled;
          if (typeof id !== "string" || typeof label !== "string" || typeof enabled !== "boolean") return null;
          return { id, label, enabled } satisfies ModelToggle;
        })
        .filter(Boolean) as ModelToggle[];
      const allowedIds = new Set(DEFAULT_MODEL_TOGGLES.map((toggle) => toggle.id));
      const pruned = normalized.filter((toggle) => allowedIds.has(toggle.id));
      return pruned.length ? pruned : DEFAULT_MODEL_TOGGLES;
    } catch {
      return DEFAULT_MODEL_TOGGLES;
    }
  });
  const [activeModelId, setActiveModelId] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(ACTIVE_MODEL_STORAGE_KEY);
      const allowedIds = new Set(DEFAULT_MODEL_TOGGLES.map((toggle) => toggle.id));
      return stored && allowedIds.has(stored) ? stored : null;
    } catch {
      return null;
    }
  });
  const [modelAvailability, setModelAvailability] = useState<Record<string, boolean>>({});
  const [personalMemoryItems, setPersonalMemoryItems] = useState<PersonalMemoryItem[]>([]);
  const [personalMemoryQuery, setPersonalMemoryQuery] = useState("");
  const [personalMemoryError, setPersonalMemoryError] = useState<string | null>(null);
  const [isLoadingPersonalMemory, setIsLoadingPersonalMemory] = useState(false);
  const [newPersonalMemoryContent, setNewPersonalMemoryContent] = useState("");
  const [newPersonalMemoryScope, setNewPersonalMemoryScope] = useState<"global" | "workspace">("global");
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
  const [createCommunityVisibility, setCreateCommunityVisibility] = useState<"public" | "unlisted" | "private">(
    "private"
  );
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
  const [communityAttachments, setCommunityAttachments] = useState<MessageAttachment[]>([]);
  const communityAttachmentsRef = useRef<MessageAttachment[]>([]);
  const [communityChatError, setCommunityChatError] = useState<string | null>(null);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isLoadingMoreChat, setIsLoadingMoreChat] = useState(false);
  const [communityChatHasMore, setCommunityChatHasMore] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isUserAtBottom, setIsUserAtBottom] = useState(true);
  const isUserAtBottomRef = useRef(true);
  const communityChatOldestSeqRef = useRef<number | null>(null);
  const pendingChatPrependScrollRef = useRef<{ elementId: string; offset: number } | null>(null);
  const communityChatAnchorRef = useRef<{ elementId: string; offset: number } | null>(null);
  const communityMessageIdsRef = useRef<Set<string>>(new Set());
  const communityChatListRef = useRef<HTMLDivElement | null>(null);
  const communitySocketRef = useRef<WebSocket | null>(null);
  const communityHeartbeatRef = useRef<number | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const communityFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isSendingCommunityMessage, setIsSendingCommunityMessage] = useState(false);
  const [isCommunityChatLightboxOpen, setIsCommunityChatLightboxOpen] = useState(false);
  const [communityChatLightboxImages, setCommunityChatLightboxImages] = useState<ChatLightboxImage[]>([]);
  const [communityChatLightboxIndex, setCommunityChatLightboxIndex] = useState(0);
  const [replyingToMessage, setReplyingToMessage] = useState<CommunityChatMessage | null>(null);
  const [communityTypingUserIds, setCommunityTypingUserIds] = useState<string[]>([]);
  const communityTypingTimeoutsRef = useRef<Map<string, number>>(new Map());
  const communityTypingTopicRef = useRef<string | null>(null);
  const lastCommunityTypingSentAtRef = useRef<number>(0);
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

  const [automationEndpoints, setAutomationEndpoints] = useState<AutomationEndpoint[]>([]);
  const [automationDeliveries, setAutomationDeliveries] = useState<AutomationDelivery[]>([]);
  const [isLoadingAutomations, setIsLoadingAutomations] = useState(false);
  const [automationError, setAutomationError] = useState<string | null>(null);
  const [isAutomationCreateOpen, setIsAutomationCreateOpen] = useState(false);
  const [automationNameInput, setAutomationNameInput] = useState("");
  const [automationUrlInput, setAutomationUrlInput] = useState("");
  const [automationIsEnabledInput, setAutomationIsEnabledInput] = useState(true);
  const [automationSelectedEventTypes, setAutomationSelectedEventTypes] = useState<string[]>([]);
  const [automationRevealSecret, setAutomationRevealSecret] = useState<{ label: string; secret: string } | null>(null);
  const [automationNotice, setAutomationNotice] = useState<string | null>(null);
  const [brandosConnector, setBrandosConnector] = useState<BrandosConnector | null>(null);
  const [isBrandosConnectOpen, setIsBrandosConnectOpen] = useState(false);
  const [brandosBaseUrlInput, setBrandosBaseUrlInput] = useState("https://app.brandos.com");
  const [brandosAccountIdInput, setBrandosAccountIdInput] = useState("");
  const [brandosIdentifySecretInput, setBrandosIdentifySecretInput] = useState("");
  const [brandosIsEnabledInput, setBrandosIsEnabledInput] = useState(true);
  const [brandosError, setBrandosError] = useState<string | null>(null);
  const [brandosNotice, setBrandosNotice] = useState<string | null>(null);
  const [isSavingBrandosConnector, setIsSavingBrandosConnector] = useState(false);
  const [isDeletingBrandosConnector, setIsDeletingBrandosConnector] = useState(false);

  const lastBrandosIdentifyDelivery = useMemo(() => {
    let best: AutomationDelivery | null = null;
    let bestMs = -1;
    for (const delivery of automationDeliveries) {
      if (delivery.endpoint_name !== "BrandOS") continue;
      if (delivery.event_type !== "identity.email_captured") continue;
      const ms = new Date(delivery.attempted_at).getTime();
      if (!Number.isFinite(ms)) continue;
      if (!best || ms > bestMs) {
        best = delivery;
        bestMs = ms;
      }
    }
    return best;
  }, [automationDeliveries]);

  const [communitySettingsName, setCommunitySettingsName] = useState("");
  const [communitySettingsSlug, setCommunitySettingsSlug] = useState("");
  const [communitySettingsDescription, setCommunitySettingsDescription] = useState("");
  const [communitySettingsVisibility, setCommunitySettingsVisibility] = useState("private");
  const [communitySettingsAvatarUrl, setCommunitySettingsAvatarUrl] = useState<string | null>(null);
  const [communitySettingsBannerUrl, setCommunitySettingsBannerUrl] = useState<string | null>(null);
  const [communitySettingsMonthlyPlanId, setCommunitySettingsMonthlyPlanId] = useState<string | null>(null);
  const [communitySettingsYearlyPlanId, setCommunitySettingsYearlyPlanId] = useState<string | null>(null);
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
    if (!communitySettingsDirtyRef.current && !communityAgentDraftDirtyRef.current) return true;
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
  const markCommunityAgentDraftDirty = () => {
    communityAgentDraftDirtyRef.current = true;
  };
  const flashCommunityAgentTemplateSaved = (slot: number) => {
    setCommunityAgentSavedSlot(slot);
    if (communityAgentSavedTimerRef.current) {
      window.clearTimeout(communityAgentSavedTimerRef.current);
    }
    communityAgentSavedTimerRef.current = window.setTimeout(() => {
      setCommunityAgentSavedSlot(null);
      communityAgentSavedTimerRef.current = null;
    }, 1200);
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
      const tab = snapshot.communityTab.replace(/_/g, " ").trim().toLowerCase();
      return tab && tab !== "chat" ? `community / ${tab}` : "community";
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
  const [workspaceAttachments, setWorkspaceAttachments] = useState<MessageAttachment[]>([]);
  const workspaceAttachmentsRef = useRef<MessageAttachment[]>([]);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [streamingThreadId, setStreamingThreadId] = useState<string | null>(null);
  const [streamingRunId, setStreamingRunId] = useState<string | null>(null);
  const [streamingMeta, setStreamingMeta] = useState<{
    engine_id: string;
    model_id: string | null;
    inference_source?: string | null;
    memory_used?: MemoryUsedItem[];
    history_used?: HistoryUsedItem[];
  } | null>(null);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const streamingContentRef = useRef<string | null>(null);
  const streamingRafRef = useRef<number | null>(null);
  const streamingAbortRef = useRef<AbortController | null>(null);
  const streamingUserCancelledRef = useRef(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [memoryToast, setMemoryToast] = useState<string | null>(null);
  const memoryToastTimeoutRef = useRef<number | null>(null);
  const [inferenceToast, setInferenceToast] = useState<string | null>(null);
  const inferenceToastTimeoutRef = useRef<number | null>(null);
  const [appToast, setAppToast] = useState<string | null>(null);
  const appToastTimeoutRef = useRef<number | null>(null);
  const [platformQuotaModal, setPlatformQuotaModal] = useState<{
    reason: "quota" | "unavailable";
    threadId: string;
    mode: "respond" | "regenerate";
    providerId: ProviderId;
    providerLabel: string;
    hasKey: boolean;
    byokAllowed: boolean;
    message: string | null;
  } | null>(null);
  const [isPlatformQuotaModalRunning, setIsPlatformQuotaModalRunning] = useState(false);
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
  const [contextModal, setContextModal] = useState<{
    memory_used: MemoryUsedItem[];
    history_used: HistoryUsedItem[];
    memory_suggestions: MemorySuggestion[];
    memory_added: MemoryUsedItem[];
  } | null>(null);
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
  const [modelFavorites, setModelFavorites] = useState<string[]>(() => loadModelFavorites());
  const [modelPickerNotice, setModelPickerNotice] = useState<string | null>(null);
  const modelPickerRef = useRef<HTMLDivElement | null>(null);
  const modelPickerSearchRef = useRef<HTMLInputElement | null>(null);

  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [discoverQuery, setDiscoverQuery] = useState("");
  const [discoverCommunities, setDiscoverCommunities] = useState<DiscoverCommunity[]>([]);
  const [isLoadingDiscover, setIsLoadingDiscover] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

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

  useEffect(() => {
    sessionRef.current = supabaseSession;
  }, [supabaseSession]);

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

    const url = getSupabaseUrl();
    if (!url) return;

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
    try {
      localStorage.setItem("arx-community-analytics-range", communityAnalyticsRange);
    } catch {
      // ignore
    }
  }, [communityAnalyticsRange]);

  useEffect(() => {
    captureBrandosAidFromLocation();
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const billing = (url.searchParams.get("billing") ?? "").trim().toLowerCase();
    if (billing !== "success" && billing !== "cancel" && billing !== "return") return;

    const rawSource = (url.searchParams.get("billing_source") ?? "").trim().toLowerCase();
    const source = rawSource === "desktop" ? "desktop" : rawSource === "web" ? "web" : "unknown";
    const rawContext = (url.searchParams.get("billing_context") ?? "").trim().toLowerCase();
    const context = rawContext === "create_community" ? "create_community" : rawContext === "builder" ? "builder" : "unknown";

    setFinalizeCreateCommunityError(null);
    setBuilderBillingReturn({ status: billing as BuilderBillingReturn["status"], source, context });

    url.searchParams.delete("billing");
    url.searchParams.delete("billing_source");
    url.searchParams.delete("billing_context");
    url.searchParams.delete("draft_id");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setPublicRoute(readPublicRouteFromLocation());
  }, []);

  useEffect(() => {
    const handlePopState = () => setPublicRoute(readPublicRouteFromLocation());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (publicRoute.kind !== "app") return;

    const url = new URL(window.location.href);
    const threadToken =
      activeThreadId ?? (workspaceWantsNewChat || threadsHydratedRef.current ? "new" : null);

    const nextHash = buildAppRouteHash({
      page: activePage,
      view: activeView,
      settingsPage,
      communityId: activeCommunityId,
      communityTab,
      threadToken,
    });

    if (url.hash === nextHash) return;
    window.history.replaceState({}, "", `${url.pathname}${url.search}${nextHash}`);
  }, [publicRoute.kind, activePage, activeView, settingsPage, activeCommunityId, communityTab, activeThreadId, workspaceWantsNewChat]);

  useEffect(() => {
    workspaceAttachmentsRef.current = workspaceAttachments;
  }, [workspaceAttachments]);

  useEffect(() => {
    communityAttachmentsRef.current = communityAttachments;
  }, [communityAttachments]);

  useEffect(() => {
    const onFocus = () => {
      const current = sessionRef.current;
      if (!current) return;
      void loadProviderKeyStatus(current);
      void loadModelRegistry(current);
      void loadBuilderBillingStatus(current);
      void loadCommunities(current);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-theme", appTheme);
      localStorage.setItem("arx-theme", appTheme);
    } catch {
      return;
    }
  }, [appTheme]);

  useEffect(() => {
    const trimmed = profileName.trim();
    try {
      if (trimmed) {
        localStorage.setItem("arx_profile_name", trimmed);
      } else {
        localStorage.removeItem("arx_profile_name");
      }
    } catch {
      return;
    }
  }, [profileName]);

  useEffect(() => {
    const trimmed = profileUsername.trim();
    try {
      if (trimmed) {
        localStorage.setItem("arx_profile_username", trimmed);
      } else {
        localStorage.removeItem("arx_profile_username");
      }
    } catch {
      return;
    }
  }, [profileUsername]);

  useEffect(() => {
    const trimmed = profileBio.trim();
    try {
      if (trimmed) {
        localStorage.setItem("arx_profile_bio", trimmed);
      } else {
        localStorage.removeItem("arx_profile_bio");
      }
    } catch {
      return;
    }
  }, [profileBio]);

  useEffect(() => {
    try {
      if (profileAvatarUrl) {
        localStorage.setItem("arx_profile_avatar", profileAvatarUrl);
      } else {
        localStorage.removeItem("arx_profile_avatar");
      }
    } catch {
      return;
    }
  }, [profileAvatarUrl]);

  useEffect(() => {
    try {
      localStorage.setItem(MODEL_TOGGLES_STORAGE_KEY, JSON.stringify(modelToggles));
    } catch {
      return;
    }
  }, [modelToggles]);

  useEffect(() => {
    try {
      if (activeModelId) {
        localStorage.setItem(ACTIVE_MODEL_STORAGE_KEY, activeModelId);
      } else {
        localStorage.removeItem(ACTIVE_MODEL_STORAGE_KEY);
      }
    } catch {
      return;
    }
  }, [activeModelId]);

  useEffect(() => {
    storeGuestModelId(guestModelId);
  }, [guestModelId]);

  useEffect(() => {
    storeModelFavorites(modelFavorites);
  }, [modelFavorites]);

  // Supabase session is bootstrapped from localStorage in useState(), so refresh keeps app state stable.

  useLayoutEffect(() => {
    const el = workspaceAskInputRef.current;
    if (!el) return;
	    el.style.height = "0px";
	    const maxPx = 220;
	    const next = Math.min(el.scrollHeight, maxPx);
	    el.style.height = `${Math.max(next, 24)}px`;
	  }, [messageInput]);

  useEffect(() => {
    if (!isModelPickerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsModelPickerOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    const raf = window.requestAnimationFrame(() => modelPickerSearchRef.current?.focus());
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.cancelAnimationFrame(raf);
    };
  }, [isModelPickerOpen]);

  useEffect(() => {
    if (!isCommunityAgentTemplateMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const root = communityAgentTemplatePickerRef.current;
      if (!root) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!root.contains(target)) setIsCommunityAgentTemplateMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsCommunityAgentTemplateMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCommunityAgentTemplateMenuOpen]);

  useEffect(() => {
    if (isCommunityAgentTemplateMenuOpen) return;
    setCommunityAgentRenamingSlot(null);
    setCommunityAgentRenamingValue("");
  }, [isCommunityAgentTemplateMenuOpen]);

  useEffect(() => {
    const first = communityAgentDraftLanding.tabs[0]?.id ?? "";
    if (!first) return;
    if (!communityAgentDraftLanding.tabs.some((t) => t.id === communityAgentPreviewTabId)) {
      setCommunityAgentPreviewTabId(first);
    }
  }, [communityAgentDraftLanding.tabs, communityAgentPreviewTabId]);

  useEffect(() => {
    return () => {
      if (communityAgentSavedTimerRef.current) {
        window.clearTimeout(communityAgentSavedTimerRef.current);
        communityAgentSavedTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const parsed = parseOAuthHash();
    if (!parsed) return;

    void (async () => {
      setAuthError(null);
      setMagicLinkStatus("idle");
      setMagicLinkError(null);
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
    void loadProviderKeyStatus(supabaseSession);
    void loadModelRegistry(supabaseSession);
    void loadSelfProfile(supabaseSession);
  }, [supabaseSession]);

  useEffect(() => {
    if (supabaseSession) return;
    setCommunities([]);
    setIsLoadingCommunities(false);
    setActiveCommunityId(null);
    setThreads([]);
    setWorkspaceWantsNewChatMode(false);
    setActiveThreadId(null);
    threadsHydratedRef.current = false;
    setThreadMessages([]);
    setPersonalMemoryItems([]);
    setProviderKeys(DEFAULT_PROVIDER_KEYS);
    setPendingPurchaseClaims([]);
    setPendingPurchasesError(null);
    setPendingPurchasesSuccess(null);
    setCloudProfile(null);
    setProfileSaveError(null);
    setProfileSaveSuccess(false);
  }, [supabaseSession]);

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

  useEffect(() => {
    if (!supabaseSession) return;
    if (!activeThreadId || activeThreadId === GUEST_THREAD_ID) {
      setThreadMessages([]);
      return;
    }
    isLoadingThreadRef.current = true;
    autoScrollEnabledRef.current = true;
    setIsWorkspaceAtBottom(true);
    lastWorkspaceScrollTopRef.current = 0;
    void loadThreadMessages(activeThreadId, supabaseSession);
  }, [supabaseSession, activeThreadId]);

  useEffect(() => {
    if (supabaseSession) return;
    if (publicRoute.kind !== "app") return;
    const storage = loadGuestThreadStorage();
    setGuestModelId(storage.model_id);
    const guestMessages = guestStoredToThreadMessages(storage);
    if (guestMessages.length === 0) {
      if (activeThreadId !== null) setActiveThreadId(null);
      setWorkspaceWantsNewChatMode(true);
      setThreadMessages([]);
      return;
    }
    if (activeThreadId !== GUEST_THREAD_ID) setActiveThreadId(GUEST_THREAD_ID);
    setWorkspaceWantsNewChatMode(false);
    setThreadMessages(guestMessages);
  }, [supabaseSession, publicRoute.kind]);

  useEffect(() => {
    if (!supabaseSession) return;
    if (activeThreadId !== GUEST_THREAD_ID) return;
    setActiveThreadId(null);
    setThreadMessages([]);
  }, [supabaseSession, activeThreadId]);

  useEffect(() => {
    if (!activeThreadId) return;
    const threadModelId = threads.find((t) => t.id === activeThreadId)?.model_id ?? null;
    if (threadModelId) setActiveModelId(threadModelId);
  }, [activeThreadId, threads]);

  // Workspace auto-scroll: keep the view pinned to bottom until the user scrolls up.
  useEffect(() => {
    const isThreadLoad = isLoadingThreadRef.current;
    if (!autoScrollEnabledRef.current && !isThreadLoad) return;

    const raf = window.requestAnimationFrame(() => {
      const el = workspaceMessageListRef.current;
      if (!el) return;
      if (!autoScrollEnabledRef.current && !isLoadingThreadRef.current) return;

      el.scrollTo({
        top: el.scrollHeight,
        behavior: "auto",
      });

      if (isLoadingThreadRef.current) {
        lastWorkspaceScrollTopRef.current = el.scrollTop;
        isLoadingThreadRef.current = false;
        setIsWorkspaceAtBottom(true);
        autoScrollEnabledRef.current = true;
      }
    });

    return () => window.cancelAnimationFrame(raf);
  }, [threadMessages, streamingContent]);

  const handleWorkspaceScroll = () => {
    const el = workspaceMessageListRef.current;
    if (!el) return;
    if (isLoadingThreadRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
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

    if (scrolledUp) {
      autoScrollEnabledRef.current = false;
      setIsWorkspaceAtBottom(false);
      return;
    }

    setIsWorkspaceAtBottom(atBottom);
    autoScrollEnabledRef.current = atBottom;
  };

  useEffect(() => {
    if (activeView !== "settings" || settingsPage !== "memory") return;
    const q = personalMemoryQuery.trim();
    const handle = window.setTimeout(() => {
      void searchPersonalMemoryItems(q);
    }, 150);
    return () => window.clearTimeout(handle);
  }, [activeView, settingsPage, personalMemoryQuery, supabaseSession]);

  useEffect(() => {
    if (activePage !== "discover") return;
    void loadDiscoverCommunities();
  }, [activePage]);

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
    communityChatOldestSeqRef.current = null;
    pendingChatPrependScrollRef.current = null;
    setOpenResourceEmbedId(null);
    if (chatInputRef.current) {
      chatInputRef.current.style.height = "auto";
    }
  }, [activeCommunityId]);

		  useEffect(() => {
		    const nextLoadedId = activeCommunityId ?? null;
		    const switchingCommunity = communitySettingsLoadedCommunityIdRef.current !== nextLoadedId;
		    if (switchingCommunity) {
		      communitySettingsLoadedCommunityIdRef.current = nextLoadedId;
		      communitySettingsDirtyRef.current = false;
		      communityPricingDirtyRef.current = false;
		      setCommunitySettingsMonthlyPlanId(null);
		      setCommunitySettingsYearlyPlanId(null);
		      setCommunitySettingsPricingMode("free");
		      setCommunitySettingsPriceUsdMonthly("");
		      setCommunitySettingsPriceUsdYearly("");
		    }

	    const current = communities.find((c) => c.id === activeCommunityId) ?? null;
	    if (!current) {
	      setCommunitySettingsError(null);
	      setCommunityMemberSettingsError(null);
	      setCommunitySettingsName("");
	      setCommunitySettingsSlug("");
	      setCommunitySettingsDescription("");
	      setCommunitySettingsVisibility("private");
	      setCommunitySettingsAvatarUrl(null);
	      setCommunitySettingsBannerUrl(null);
	      setCommunitySettingsMonthlyPlanId(null);
	      setCommunitySettingsYearlyPlanId(null);
	      setCommunitySettingsPriceUsdMonthly("");
	      setCommunitySettingsPriceUsdYearly("");
	      setCommunityMemberMuted(false);
	      setCommunityInvites([]);
	      setInviteCreateError(null);
	      return;
	    }

	    if (!switchingCommunity && communitySettingsDirtyRef.current) return;

	    setCommunitySettingsError(null);
	    setCommunityMemberSettingsError(null);
	    setCommunitySettingsName(current.name ?? "");
	    setCommunitySettingsSlug(slugify(current.slug ?? ""));
	    setCommunitySettingsDescription(current.description ?? "");
	    setCommunitySettingsVisibility(current.visibility ?? "private");
	    setCommunitySettingsAvatarUrl(current.avatar_url ?? null);
	    setCommunitySettingsBannerUrl(current.banner_url ?? null);
	    setCommunitySettingsBannerUploadError(null);
	    setIsProcessingCommunitySettingsBanner(false);
	    setInviteCreateError(null);
	  }, [activeCommunityId, communities]);

	  useEffect(() => {
	    if (activePage !== "community" || communityTab !== "settings") return;
	    if (!supabaseSession || !activeCommunityId) {
	      setCommunityMemberMuted(false);
	      return;
	    }
	    if (!activeCommunityAccess?.can_view) return;
	    if (activeCommunityAccess.is_owner || activeCommunityAccess.can_manage_members) return;
	    const url = getSupabaseUrl();
	    if (!url) return;

	    setIsLoadingCommunityMemberSettings(true);
	    setCommunityMemberSettingsError(null);
	    (async () => {
	      try {
	        const response = await fetchWithSupabaseAuth(
	          `${url}/rest/v1/community_member_settings?select=community_id,user_id,muted,muted_until,created_at,updated_at&community_id=eq.${encodeURIComponent(
	            activeCommunityId
	          )}&user_id=eq.${encodeURIComponent(supabaseSession.user.id)}&limit=1`,
	          { method: "GET" },
	          supabaseSession
	        );
	        if (!response.ok) {
	          setCommunityMemberMuted(false);
	          return;
	        }
	        const rows = (await response.json()) as CommunityMemberSettings[];
	        const row = rows[0];
	        setCommunityMemberMuted(Boolean(row?.muted));
	      } catch {
	        setCommunityMemberMuted(false);
	      } finally {
	        setIsLoadingCommunityMemberSettings(false);
	      }
	    })();
	  }, [
	    activePage,
	    communityTab,
	    supabaseSession,
	    activeCommunityId,
	    activeCommunityAccess?.can_view,
	    activeCommunityAccess?.is_owner,
	    activeCommunityAccess?.can_manage_members,
	  ]);

	  async function handleToggleCommunityMute(nextMuted: boolean) {
	    if (!supabaseSession || !activeCommunityId) return;
	    const url = getSupabaseUrl();
	    if (!url) return;
	    setCommunityMemberSettingsError(null);
	    setIsLoadingCommunityMemberSettings(true);
	    try {
	      const response = await fetchWithSupabaseAuth(
	        `${url}/rest/v1/community_member_settings?on_conflict=community_id,user_id`,
	        {
	          method: "POST",
	          headers: {
	            "Content-Type": "application/json",
	            Prefer: "resolution=merge-duplicates,return=representation",
	          },
	          body: JSON.stringify({
	            community_id: activeCommunityId,
	            user_id: supabaseSession.user.id,
	            muted: nextMuted,
	            muted_until: null,
	          }),
	        },
	        supabaseSession
	      );
	      if (!response.ok) throw new Error(await readSupabaseError(response));
	      setCommunityMemberMuted(nextMuted);
	    } catch (error) {
	      const message =
	        typeof error === "string"
	          ? error
	          : error instanceof Error
	            ? error.message
	            : "Failed to update settings.";
	      setCommunityMemberSettingsError(message);
	    } finally {
	      setIsLoadingCommunityMemberSettings(false);
	    }
	  }

	  async function handleLeaveCommunity() {
	    if (!supabaseSession || !activeCommunityId) return;
	    if (!confirm("Leave this community? You will lose access immediately.")) return;
	    const url = getSupabaseUrl();
	    if (!url) return;
	    setCommunityMemberSettingsError(null);
	    setIsLeavingCommunity(true);
	    try {
	      const response = await fetchWithSupabaseAuth(
	        `${url}/rest/v1/rpc/leave_community`,
	        {
	          method: "POST",
	          headers: { "Content-Type": "application/json" },
	          body: JSON.stringify({ p_community_id: activeCommunityId }),
	        },
	        supabaseSession
	      );
	      if (!response.ok) throw new Error(await readSupabaseError(response));
	      const leavingId = activeCommunityId;
	      setActiveCommunityId(null);
	      setActivePage("workspace");
	      setActiveView("home");
	      setCommunityTab("chat");
	      setCommunities((prev) => prev.filter((c) => c.id !== leavingId));
	      await loadCommunities(supabaseSession);
	    } catch (error) {
	      const message =
	        typeof error === "string"
	          ? error
	          : error instanceof Error
	            ? error.message
	            : "Failed to leave community.";
	      setCommunityMemberSettingsError(message);
	    } finally {
	      setIsLeavingCommunity(false);
	    }
	  }

		  useEffect(() => {
		    if (activePage !== "community" || communityTab !== "settings") return;
		    if (!supabaseSession || !activeCommunityId) {
		      setCommunitySettingsMonthlyPlanId(null);
		      setCommunitySettingsYearlyPlanId(null);
		      setCommunitySettingsPricingMode("free");
		      setCommunitySettingsPriceUsdMonthly("");
		      setCommunitySettingsPriceUsdYearly("");
		      return;
		    }
		    if (!activeCommunityAccess?.can_manage_members) return;
		    const url = getSupabaseUrl();
		    if (!url) return;

		    let cancelled = false;
		    const communityId = activeCommunityId;
		    (async () => {
		      try {
		        const response = await fetchWithSupabaseAuth(
		          `${url}/rest/v1/rpc/get_community_pricing`,
		          {
		            method: "POST",
		            headers: { "Content-Type": "application/json" },
		            body: JSON.stringify({ p_community_id: communityId }),
		          },
		          supabaseSession
		        );
		        if (!response.ok) return;
		        const rows = (await response.json()) as Array<{
		          billing_period: string;
		          plan_id: string;
		          amount_base_units: number | string;
		          currency: string;
		          currency_decimals: number;
		        }>;
		        if (cancelled) return;
		        if (communitySettingsLoadedCommunityIdRef.current !== communityId) return;
		        if (communityPricingDirtyRef.current) return;
		        const monthly = rows.find((row) => row.billing_period === "monthly") ?? null;
		        const yearly = rows.find((row) => row.billing_period === "yearly") ?? null;
		        setCommunitySettingsMonthlyPlanId(monthly?.plan_id ?? null);
		        setCommunitySettingsYearlyPlanId(yearly?.plan_id ?? null);

	        const formatPlanAmount = (row: typeof monthly): string => {
	          if (!row) return "";
	          const decimals = Number(row.currency_decimals ?? 2) || 2;
	          const major = Number(row.amount_base_units ?? 0) / Math.pow(10, decimals);
	          return Number.isFinite(major) ? major.toFixed(decimals).replace(/\.?0+$/, "") : "";
	        };
	        setCommunitySettingsPriceUsdMonthly(formatPlanAmount(monthly));
	        setCommunitySettingsPriceUsdYearly(formatPlanAmount(yearly));
		        setCommunitySettingsPricingMode(
		          monthly && yearly ? "both" : monthly ? "monthly" : yearly ? "yearly" : "free"
		        );
		      } catch {
		        // ignore
		      }
		    })();
		    return () => {
		      cancelled = true;
		    };
		  }, [
		    activePage,
		    communityTab,
		    supabaseSession,
		    activeCommunityId,
	    activeCommunityAccess?.can_manage_members,
	  ]);

  useEffect(() => {
    if (createCommunitySlugEdited) return;
    const next = slugify(createCommunityName);
    setCreateCommunitySlug(next);
  }, [createCommunityName, createCommunitySlugEdited]);

  async function handleCreateCommunityAvatarUpload(file: File | null) {
    if (!file) return;
    try {
      const dataUrl = await readAvatarFileAsSquareDataUrl(file, 128);
      setCreateCommunityAvatarUrl(dataUrl);
    } catch (error) {
      const message =
        typeof error === "string" ? error : error instanceof Error ? error.message : "Failed to load image.";
      setCreateCommunityError(message);
    }
  }

  async function handleCreateCommunityBannerUpload(file: File | null) {
    if (!file) return;
    if (!isLikelyImageFile(file)) {
      setCreateCommunityError("Banner must be an image file.");
      return;
    }
    try {
      const dataUrl = await readBannerFileAsWideDataUrlWithinLimit(file, MAX_WEB_IMAGE_DATA_URL_CHARS);
      setCreateCommunityBannerUrl(dataUrl);
    } catch (error) {
      const message =
        typeof error === "string" ? error : error instanceof Error ? error.message : "Failed to load banner.";
      setCreateCommunityError(message);
    }
  }

  function handleCreateBannerDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsCreateBannerDragOver(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    if (file) void handleCreateCommunityBannerUpload(file);
  }

  function handleCreateAvatarDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsCreateAvatarDragOver(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    if (file) void handleCreateCommunityAvatarUpload(file);
  }

  function openCreateCommunityModal() {
    const tier = (builderBillingStatus?.builder_tier ?? "free").toLowerCase();
    const max = builderBillingStatus?.max_communities ?? 0;
    const ownedCount = communities.reduce(
      (acc, community) => acc + (communityRoleById[community.id] === "owner" ? 1 : 0),
      0,
    );
    if (tier === "pro" && max > 0 && ownedCount >= max) {
      showAppToastMessage("You've built the maximum number of communities");
      return;
    }
    setCreateCommunityError(null);
    const draft = loadCreateCommunityDraft();
    const currentUserId = supabaseSession?.user.id ?? null;
    if (draft && draft.user_id && currentUserId && draft.user_id !== currentUserId) {
      clearCreateCommunityDraft();
    }
    const safeDraft = draft && (!draft.user_id || !currentUserId || draft.user_id === currentUserId) ? draft : null;
    setCreateCommunityName(safeDraft?.name ?? "");
    setCreateCommunitySlug(safeDraft?.slug ?? "");
    setCreateCommunitySlugEdited(Boolean(safeDraft?.slug_edited));
    setCreateCommunityVisibility(safeDraft?.visibility ?? "private");
    setCreateCommunityAvatarUrl(safeDraft?.avatar_url ?? null);
    setCreateCommunityDescription(safeDraft?.description ?? "");
    setCreateCommunityBannerUrl(safeDraft?.banner_url ?? null);
    setIsCreateAvatarDragOver(false);
    setIsCreateBannerDragOver(false);
    setShowCreateCommunityModal(true);
  }

  function closeCreateCommunityModal() {
    setShowCreateCommunityModal(false);
    setCreateCommunityError(null);
  }

  function buildCreateCommunityDraftFromState(): CreateCommunityDraft | null {
    setCreateCommunityError(null);
    const name = createCommunityName.trim();
    const rawSlug = createCommunitySlug.trim() || slugify(name);
    const slug = rawSlug.toLowerCase();
    if (!name || !slug) {
      setCreateCommunityError("Name and slug are required.");
      return null;
    }
    if (!isValidSlug(slug)) {
      setCreateCommunityError("Slug must be 3–32 chars, lowercase, and may include dashes.");
      return null;
    }
    if (!["public", "unlisted", "private"].includes(createCommunityVisibility)) {
      setCreateCommunityError("Visibility must be public, unlisted, or private.");
      return null;
    }
    const userId = supabaseSession?.user.id ?? null;
    const draft: CreateCommunityDraft = {
      v: 1,
      id: createCommunityDraftId(),
      created_at: Date.now(),
      user_id: userId,
      name,
      slug,
      slug_edited: createCommunitySlugEdited,
      visibility: createCommunityVisibility,
      avatar_url: createCommunityAvatarUrl?.trim() || null,
      banner_url: createCommunityBannerUrl?.trim() || null,
      description: createCommunityDescription.trim() || null,
    };
    saveCreateCommunityDraft(draft);
    return draft;
  }

  async function createCommunityFromDraft(
    draft: CreateCommunityDraft,
    session: SupabaseSession,
  ): Promise<CommunityRecord | null> {
    const url = getSupabaseUrl();
    const apiKey = getSupabaseAnonKey();
    if (!url || !apiKey) {
      setFinalizeCreateCommunityError("Missing Supabase config.");
      return null;
    }
    setFinalizeCreateCommunityError(null);
    setIsFinalizingCreateCommunityFromBilling(true);
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/create_community`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            p_name: draft.name,
            p_slug: draft.slug,
            p_visibility: draft.visibility,
            p_avatar_url: draft.avatar_url,
            p_description: draft.description,
            p_banner_url: draft.banner_url,
          }),
        },
        session,
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      const created = (await response.json()) as CommunityRecord[];
      const community = created[0] ?? null;
      if (!community?.id) throw new Error("Failed to create community.");
      setCommunities((prev) => [community, ...prev]);
      setCommunityRoleById((prev) => ({ ...prev, [community.id]: "owner" }));
      setActiveCommunityId(community.id);
      setActivePage("community");
      setCommunityTab("chat");
      setActiveView("home");
      clearCreateCommunityDraft();
      closeCreateCommunityModal();
      setBuilderBillingReturn(null);
      return community;
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to create community.";
      setFinalizeCreateCommunityError(message);
      return null;
    } finally {
      setIsFinalizingCreateCommunityFromBilling(false);
    }
  }

  async function handleCreateCommunityPrimaryAction(): Promise<void> {
    setFinalizeCreateCommunityError(null);
    if (!supabaseSession) {
      handleSignIn();
      return;
    }
    const status = builderBillingStatus ?? (await loadBuilderBillingStatus(supabaseSession));
    if (!status) {
      setCreateCommunityError("Couldn't check your plan. Try again.");
      return;
    }
    const tier = (status.builder_tier ?? "free").toLowerCase();
    const max = status.max_communities ?? 0;
    const ownedCount = communities.reduce(
      (acc, community) => acc + (communityRoleById[community.id] === "owner" ? 1 : 0),
      0,
    );
    const needsPlan = tier === "free";
    const limitReached = tier !== "free" && max > 0 && ownedCount >= max;
    const canCreate = !needsPlan && !limitReached;
    if (canCreate) {
      await handleCreateCommunity();
      return;
    }

    const draft = buildCreateCommunityDraftFromState();
    if (!draft) return;

    closeCreateCommunityModal();

    if (limitReached) {
      await openBuilderBillingPortal("create_community");
      return;
    }

    setBuilderUpgradeContext("create_community");
    setIsBuilderUpgradeOpen(true);
  }

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
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/create_community`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            p_name: name,
            p_slug: slug,
            p_visibility: createCommunityVisibility,
            p_avatar_url: createCommunityAvatarUrl?.trim() || null,
            p_description: createCommunityDescription.trim() || null,
            p_banner_url: createCommunityBannerUrl?.trim() || null
          })
        },
        supabaseSession
      );
      if (!response.ok) {
        const text = await response.text();
        setCreateCommunityError(text || "Failed to create community.");
        return;
      }
      const created = (await response.json()) as CommunityRecord[];
      const community = created[0];
      if (!community?.id) {
        setCreateCommunityError("Failed to create community.");
        return;
      }
      setCommunities((prev) => [community, ...prev]);
      setCommunityRoleById((prev) => ({ ...prev, [community.id]: "owner" }));
	      setActiveCommunityId(community.id);
	      setActivePage("community");
	      setCommunityTab("chat");
	      setActiveView("home");
	      clearCreateCommunityDraft();
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

  useEffect(() => {
    if (!supabaseSession || !activeCommunityId) {
      setActiveCommunityAccess(null);
      setIsLoadingCommunityAccess(false);
      return;
    }
    void loadCommunityAccess(activeCommunityId, supabaseSession);
  }, [supabaseSession, activeCommunityId]);

  const canInviteActiveCommunity = Boolean(activeCommunityAccess?.can_invite);
  const isActiveCommunityOwner = Boolean(activeCommunityAccess?.is_owner);
  const canViewActiveCommunitySettings = Boolean(activeCommunityAccess?.can_view);
  const canPostMessagesActiveCommunity = Boolean(activeCommunityAccess?.can_post_message);
  const canCreateResourcesActiveCommunity = Boolean(activeCommunityAccess?.can_create_resource);
  const canManageResourcesActiveCommunity = Boolean(activeCommunityAccess?.can_manage_resources);
  const canManageMembersActiveCommunity = Boolean(activeCommunityAccess?.can_manage_members);
  const canViewActiveCommunityAnalytics = canManageMembersActiveCommunity;
  const canViewActiveCommunityAutomations = canManageMembersActiveCommunity;
  const [activeCommunityOwnerIsPro, setActiveCommunityOwnerIsPro] = useState<boolean | null>(null);
  const activeCommunityOwnerIsProLoadedCommunityIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!supabaseSession || !activeCommunityId || !canManageMembersActiveCommunity) {
      setActiveCommunityOwnerIsPro(null);
      activeCommunityOwnerIsProLoadedCommunityIdRef.current = null;
      return;
    }
    if (activeCommunityOwnerIsProLoadedCommunityIdRef.current === activeCommunityId) return;
    activeCommunityOwnerIsProLoadedCommunityIdRef.current = activeCommunityId;

    const url = getSupabaseUrl();
    if (!url) return;

    void (async () => {
      try {
        const response = await fetchWithSupabaseAuth(
          `${url}/rest/v1/rpc/community_owner_is_pro`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ p_community_id: activeCommunityId }),
          },
          supabaseSession,
        );
        if (!response.ok) {
          setActiveCommunityOwnerIsPro(null);
          return;
        }
        const data = (await response.json()) as unknown;
        setActiveCommunityOwnerIsPro(typeof data === "boolean" ? data : null);
      } catch {
        setActiveCommunityOwnerIsPro(null);
      }
    })();
  }, [supabaseSession, activeCommunityId, canManageMembersActiveCommunity]);

  useEffect(() => {
    if (activePage !== "community" || communityTab !== "members") return;
    if (!supabaseSession || !activeCommunityId || !canInviteActiveCommunity) {
      setCommunityInvites([]);
      return;
    }
    void loadCommunityInvites(activeCommunityId, supabaseSession);
  }, [activePage, communityTab, supabaseSession, activeCommunityId, canInviteActiveCommunity]);

  useEffect(() => {
    if (!supabaseSession || !activeCommunityId || activePage !== "community") return;
    if (communityTab !== "resources" && communityTab !== "library") return;
    void loadCommunityResources(activeCommunityId, supabaseSession);
  }, [supabaseSession, activeCommunityId, activePage, communityTab]);

  useEffect(() => {
    if (activePage !== "community" || communityTab !== "ai_agent") return;
    if (!supabaseSession || !activeCommunityId || !canManageMembersActiveCommunity) {
      setCommunityAgentDrafts([]);
      setCommunityAgentDraftsError(null);
      communityAgentDraftsLoadedCommunityIdRef.current = null;
      return;
    }
    // If we already know the community owner's tier isn't Pro, avoid calling Pro-only RPCs.
    if (activeCommunityOwnerIsPro === false) {
      setCommunityAgentDrafts([]);
      setCommunityAgentDraftsError("pro_plan_required");
      communityAgentDraftsLoadedCommunityIdRef.current = activeCommunityId;
      return;
    }
    if (communityAgentDraftsLoadedCommunityIdRef.current === activeCommunityId) return;
    void loadCommunityAgentDrafts(activeCommunityId, supabaseSession);
  }, [activePage, communityTab, supabaseSession, activeCommunityId, canManageMembersActiveCommunity, activeCommunityOwnerIsPro]);

  useEffect(() => {
    if (!supabaseSession || !activeCommunityId || activePage !== "community") return;
    void loadCommunityMembers(activeCommunityId, supabaseSession, { includeStatus: canManageMembersActiveCommunity });
  }, [supabaseSession, activeCommunityId, activePage, canManageMembersActiveCommunity]);

  useEffect(() => {
    if (activePage !== "community" || communityTab !== "analytics") return;
    if (!supabaseSession || !activeCommunityId || !canViewActiveCommunityAnalytics) {
      setCommunityAnalyticsSummary({
        total_members: null,
        new_members_window: null,
        active_members_window: null,
        retention_window: null,
        total_resources: null,
        resources_added_window: null,
      });
      setCommunityAnalyticsSeries([]);
      setCommunityRevenueSeries([]);
      setCommunityRevenueMeta(null);
      setCommunityRevenueError(null);
      setCommunityAnalyticsError(null);
      setIsLoadingCommunityAnalytics(false);
      return;
    }
    const createdAt = communities.find((community) => community.id === activeCommunityId)?.created_at ?? null;
    void loadCommunityAnalytics(activeCommunityId, supabaseSession, communityAnalyticsRange, createdAt);
  }, [
    activePage,
    communityTab,
    supabaseSession,
    activeCommunityId,
    canViewActiveCommunityAnalytics,
    communityAnalyticsRange,
    communities,
  ]);

  useEffect(() => {
    if (activePage !== "community" || communityTab !== "automations") return;
    if (!supabaseSession || !activeCommunityId || !canViewActiveCommunityAutomations) {
      setAutomationEndpoints([]);
      setAutomationDeliveries([]);
      setAutomationError(null);
      setIsLoadingAutomations(false);
      return;
    }
    void loadCommunityAutomations(activeCommunityId, supabaseSession);
  }, [activePage, communityTab, supabaseSession, activeCommunityId, canViewActiveCommunityAutomations]);

  function captureCommunityChatScrollAnchor(
    container: HTMLElement,
  ): { elementId: string; offset: number } | null {
    const rect = container.getBoundingClientRect();
    const x = rect.left + Math.min(32, rect.width / 2);
    const yCandidates = [rect.top + 20, rect.top + 60, rect.top + 100];
    for (const y of yCandidates) {
      if (y >= rect.bottom) continue;
      const hit = document.elementFromPoint(x, y);
      const messageEl = hit?.closest?.(".chat-message[id^='msg-']") as HTMLElement | null;
      if (messageEl?.id) {
        return { elementId: messageEl.id, offset: messageEl.offsetTop - container.scrollTop };
      }
    }

    // Fallback for odd layouts (rare): scan message nodes.
    const scrollTop = container.scrollTop;
    const nodes = container.querySelectorAll<HTMLElement>(".chat-message[id^='msg-']");
    for (const node of nodes) {
      const top = node.offsetTop;
      const bottom = top + node.offsetHeight;
      if (bottom > scrollTop + 1) {
        return { elementId: node.id, offset: top - scrollTop };
      }
    }
    return null;
  }

  function restoreCommunityChatScrollAnchor(container: HTMLElement, anchor: { elementId: string; offset: number }) {
    const el = document.getElementById(anchor.elementId) as HTMLElement | null;
    if (!el) return;
    container.scrollTop = el.offsetTop - anchor.offset;
  }

  useEffect(() => {
    const container = communityChatListRef.current;
    if (!container || !isUserAtBottom) return;
    container.scrollTop = container.scrollHeight;
  }, [communityMessages, isUserAtBottom]);

  useLayoutEffect(() => {
    const pending = pendingChatPrependScrollRef.current;
    if (!pending) return;
    const container = communityChatListRef.current;
    if (!container) return;
    restoreCommunityChatScrollAnchor(container, pending);
    pendingChatPrependScrollRef.current = null;
  }, [communityMessages]);

  useEffect(() => {
    if (activePage !== "community" || communityTab !== "chat") return;
    const container = communityChatListRef.current;
    if (!container) return;
    let raf: number | null = null;
    const observer = new ResizeObserver(() => {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = communityChatListRef.current;
        if (!el) return;
        if (isUserAtBottomRef.current) {
          el.scrollTop = el.scrollHeight;
          return;
        }
        const anchor = communityChatAnchorRef.current;
        if (!anchor) return;
        restoreCommunityChatScrollAnchor(el, anchor);
      });
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [activePage, communityTab, activeCommunityId]);

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
    let socket: WebSocket | null = null;
    let cancelled = false;
    const joinRef = `${Date.now()}`;
    const messagesTopic = "realtime:public:messages";
    const reactionsJoinRef = `${Date.now()}-reactions`;
    const reactionsTopic = "realtime:public:message_reactions";

    void (async () => {
      let threadId: string;
      try {
        threadId = await ensureCommunityChatThread(activeCommunityId, supabaseSession);
      } catch {
        return;
      }
      if (cancelled) return;

      const typingJoinRef = `${Date.now()}-typing`;
      const typingTopic = `realtime:typing_${threadId}`;
      communityTypingTopicRef.current = typingTopic;

      socket = new WebSocket(wsUrl);
      communitySocketRef.current = socket;

      socket.addEventListener("open", () => {
        if (!socket) return;

        socket.send(
          JSON.stringify({
            topic: messagesTopic,
            event: "phx_join",
            payload: {
              config: {
                broadcast: { ack: false },
                postgres_changes: [
                  {
                    event: "INSERT",
                    schema: "public",
                    table: "messages",
                    filter: `thread_id=eq.${threadId}`
                  },
                  {
                    event: "UPDATE",
                    schema: "public",
                    table: "messages",
                    filter: `thread_id=eq.${threadId}`
                  },
                  {
                    event: "DELETE",
                    schema: "public",
                    table: "messages",
                    filter: `thread_id=eq.${threadId}`
                  }
                ]
              },
              access_token: supabaseSession.access_token
            },
            ref: joinRef
          })
        );

        socket.send(
          JSON.stringify({
            topic: reactionsTopic,
            event: "phx_join",
            payload: {
              config: {
                broadcast: { ack: false },
                postgres_changes: [
                  { event: "INSERT", schema: "public", table: "message_reactions" },
                  { event: "UPDATE", schema: "public", table: "message_reactions" },
                  { event: "DELETE", schema: "public", table: "message_reactions" }
                ]
              },
              access_token: supabaseSession.access_token
            },
            ref: reactionsJoinRef
          })
        );

        socket.send(
          JSON.stringify({
            topic: typingTopic,
            event: "phx_join",
            payload: {
              config: {
                broadcast: { ack: false }
              },
              access_token: supabaseSession.access_token
            },
            ref: typingJoinRef
          })
        );

        communityHeartbeatRef.current = window.setInterval(() => {
          if (!socket || socket.readyState !== WebSocket.OPEN) return;
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
            topic?: string;
            event?: string;
            payload?: Record<string, unknown>;
          };

	          if (data.event === "broadcast" && data.topic === typingTopic) {
	            const payload = data.payload as { event?: unknown; payload?: unknown; type?: unknown };
	            const name =
	              (typeof payload.event === "string" ? payload.event : null) ??
	              (typeof payload.type === "string" ? payload.type : null) ??
	              "";
	            if (name !== "typing") return;
	            const details = payload.payload as { user_id?: unknown; userId?: unknown } | null;
	            const userId =
	              (details && typeof details.user_id === "string" ? details.user_id : null) ??
	              (details && typeof details.userId === "string" ? details.userId : null);
	            if (!userId) return;
	            if (userId === supabaseSession?.user.id) return;
	            void loadUserProfiles([userId], supabaseSession);

	            const existing = communityTypingTimeoutsRef.current.get(userId);
	            if (existing) window.clearTimeout(existing);
	            const timeoutId = window.setTimeout(() => {
	              communityTypingTimeoutsRef.current.delete(userId);
              setCommunityTypingUserIds(Array.from(communityTypingTimeoutsRef.current.keys()));
            }, 2500);
            communityTypingTimeoutsRef.current.set(userId, timeoutId);
            setCommunityTypingUserIds(Array.from(communityTypingTimeoutsRef.current.keys()));
            return;
          }

          if (data.event !== "postgres_changes") return;

          if (data.topic === messagesTopic) {
            const payload = data.payload as {
              eventType?: string;
              type?: string;
              new?: CloudMessageRow;
              old?: CloudMessageRow;
              record?: CloudMessageRow;
              old_record?: CloudMessageRow;
              data?: {
                type?: string;
                new?: CloudMessageRow;
                record?: CloudMessageRow;
                old?: CloudMessageRow;
                old_record?: CloudMessageRow;
              };
            };

            const eventType = (payload.eventType ?? payload.type ?? payload.data?.type ?? "").toUpperCase();
            const newRecord = payload.new ?? payload.record ?? payload.data?.new ?? payload.data?.record;
            const oldRecord = payload.old ?? payload.old_record ?? payload.data?.old ?? payload.data?.old_record;

            if (eventType === "DELETE") {
              const deleted = oldRecord ?? newRecord;
              if (!deleted) return;
              if (deleted.thread_id !== threadId) return;
              setCommunityMessages((prev) => prev.filter((m) => m.id !== deleted.id));
              setMessageReactions((prev) => prev.filter((r) => r.message_id !== deleted.id));
              return;
            }

	            if (!newRecord) return;
	            if (newRecord.thread_id !== threadId) return;
	            const mapped = toCommunityChatMessage(newRecord);
	            if (!mapped) return;
	            void loadUserProfiles([mapped.sender_id], supabaseSession);

	            setCommunityMessages((prev) => {
	              const idx = prev.findIndex((item) => item.id === mapped.id);
	              if (idx >= 0) {
	                const next = [...prev];
                next[idx] = { ...next[idx], ...mapped };
                next.sort((a, b) => a.seq - b.seq);
                return next;
              }
              const next = [...prev, mapped];
              next.sort((a, b) => a.seq - b.seq);
              return next;
            });

            if (
              eventType === "INSERT" &&
              mapped.sender_id !== supabaseSession.user.id &&
              !isUserAtBottomRef.current
            ) {
              setUnreadCount((prev) => prev + 1);
            }
            return;
          }

          if (data.topic === reactionsTopic) {
            const payload = data.payload as {
              eventType?: string;
              type?: string;
              new?: MessageReaction;
              old?: MessageReaction;
              record?: MessageReaction;
              old_record?: MessageReaction;
              data?: {
                type?: string;
                new?: MessageReaction;
                record?: MessageReaction;
                old?: MessageReaction;
                old_record?: MessageReaction;
              };
            };

            const eventType = (payload.eventType ?? payload.type ?? payload.data?.type ?? "").toUpperCase();
            const newRecord = payload.new ?? payload.record ?? payload.data?.new ?? payload.data?.record;
            const oldRecord = payload.old ?? payload.old_record ?? payload.data?.old ?? payload.data?.old_record;
            const target = eventType === "DELETE" ? oldRecord ?? newRecord : newRecord;
            if (!target) return;
            if (!communityMessageIdsRef.current.has(target.message_id)) return;

            if (eventType === "DELETE") {
              setMessageReactions((prev) => prev.filter((r) => r.id !== target.id));
              return;
            }

            setMessageReactions((prev) => {
              const idx = prev.findIndex((item) => item.id === target.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = { ...next[idx], ...target };
                return next;
              }
              return [...prev, target];
            });
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
    })();

    return () => {
      cancelled = true;
      socket?.close();
      communitySocketRef.current = null;
      if (communityHeartbeatRef.current) {
        window.clearInterval(communityHeartbeatRef.current);
        communityHeartbeatRef.current = null;
      }
      communityTypingTopicRef.current = null;
      for (const timeoutId of communityTypingTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      communityTypingTimeoutsRef.current.clear();
      setCommunityTypingUserIds([]);
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
    setIsLoadingCommunities(false);
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
    setWorkspaceWantsNewChatMode(false);
    setActiveThreadId(null);
    setThreadMessages([]);
    streamingAbortRef.current?.abort();
    streamingAbortRef.current = null;
    if (streamingRafRef.current) {
      window.cancelAnimationFrame(streamingRafRef.current);
      streamingRafRef.current = null;
    }
    streamingContentRef.current = null;
    setStreamingContent(null);
    setStreamingThreadId(null);
    setStreamingRunId(null);
    setStreamingMeta(null);
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

  async function redeemPurchaseClaim(token: string): Promise<void> {
    const session = sessionRef.current;
    const url = session ? getSupabaseUrl() : null;
    if (!session || !url) {
      storePendingPurchaseClaimToken(token);
      handleSignIn();
      return;
    }

    setIsRedeemingClaim(true);
    setRedeemClaimError(null);
    try {
      const communityId = await redeemPurchaseClaimRpc({
        url,
        session,
        token,
        fetchWithSupabaseAuth,
        readSupabaseError
      });
      clearPendingPurchaseClaimToken();
      setCheckoutClaimToken(null);
      setCheckoutStatus("idle");

      // Return into the main app and open the community.
      navigateTo("/", { replace: true });
      setActiveView("home");
      setActivePage("community");
      setCommunityTab("chat");
      setActiveCommunityId(communityId);
      await loadCommunities(session);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to redeem.";
      setRedeemClaimError(message);
    } finally {
      setIsRedeemingClaim(false);
    }
  }

  async function joinPublicCommunity(opts: { communityId?: string; communitySlug?: string | null }): Promise<void> {
    const trimmedId = (opts.communityId ?? "").trim();
    const trimmedSlug = (opts.communitySlug ?? "").trim();
    if (!trimmedId && !trimmedSlug) return;

    const brandosAid = trimmedSlug ? getBrandosAidForCommunitySlug(trimmedSlug) : null;

    const session = sessionRef.current;
    const url = session ? getSupabaseUrl() : null;
    if (!session || !url) {
      storePendingPublicJoin(trimmedSlug || trimmedId, brandosAid);
      handleSignIn();
      return;
    }

    setIsJoiningPublicCommunity(true);
    setPublicJoinError(null);
    try {
      const pendingBrandosAid = readPendingPublicJoinBrandosAid();
      const resolvedBrandosAid =
        (brandosAid && isUuid(brandosAid) ? brandosAid : null) ||
        (pendingBrandosAid && isUuid(pendingBrandosAid) ? pendingBrandosAid : null);

      const joinedId = await joinPublicCommunityRpc({
        url,
        session,
        communityId: trimmedId || undefined,
        communitySlug: trimmedSlug || undefined,
        brandosAid: resolvedBrandosAid,
        fetchWithSupabaseAuth,
        readSupabaseError
      });
      clearPendingPublicJoin();

      navigateTo("/", { replace: true });
      setActiveView("home");
      setActivePage("community");
      setCommunityTab("chat");
      setActiveCommunityId(joinedId);
      await loadCommunities(session);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to join community.";
      setPublicJoinError(message);
    } finally {
      setIsJoiningPublicCommunity(false);
    }
  }

  async function loadPublicChatPreview(communitySlug: string): Promise<void> {
    const trimmed = communitySlug.trim();
    if (!trimmed) return;
    const url = getSupabaseUrl();
    if (!url) return;
    setIsLoadingPublicChatPreview(true);
    setPublicChatPreviewError(null);
    setPublicChatPreviewMessages([]);
    try {
      const response = await fetchWithSupabasePublic(
        `${url}/functions/v1/public_chat_preview?community_slug=${encodeURIComponent(trimmed)}&limit=20`,
        { method: "GET" },
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      const payload = (await response.json()) as { ok?: boolean; messages?: PublicChatPreviewMessage[] };
      setPublicChatPreviewMessages(Array.isArray(payload?.messages) ? payload.messages : []);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to load chat preview.";
      setPublicChatPreviewError(message);
    } finally {
      setIsLoadingPublicChatPreview(false);
    }
  }

  async function loadPublicCommunity(slug: string): Promise<void> {
    const url = getSupabaseUrl();
    if (!url) {
      setPublicCommunityError("Missing Supabase URL.");
      return;
    }
    setIsLoadingPublicCommunity(true);
    setPublicCommunityError(null);
    setPublicCommunity(null);
    setPublicCommunityPlans([]);
    setSelectedPublicCommunityBillingPeriod(null);
    setPublicChatPreviewMessages([]);
    setPublicChatPreviewError(null);
    setIsLoadingPublicChatPreview(false);
    try {
      const response = await fetchWithSupabasePublic(
        `${url}/functions/v1/public_community?slug=${encodeURIComponent(slug)}`,
        { method: "GET" },
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      const payload = (await response.json()) as {
        ok?: boolean;
        community?: PublicCommunityRecord;
        active_plan?: PublicPlanSummary | null;
        active_plans?: PublicPlanSummary[] | null;
      };
      if (!payload?.community?.slug) throw new Error("Community not found.");

      const session = sessionRef.current;
      if (session) {
        try {
          const accessResponse = await fetchWithSupabaseAuth(
            `${url}/rest/v1/rpc/get_my_community_access_by_slug`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ p_community_slug: payload.community.slug })
            },
            session,
          );
          if (accessResponse.ok) {
            const rows = (await accessResponse.json()) as CommunityAccess[];
            const access = rows[0] ?? null;
            if (access && (access.can_view || access.is_owner)) {
              navigateTo("/", { replace: true });
              setActiveView("home");
              setActivePage("community");
              setCommunityTab("chat");
              setActiveCommunityId(access.community_id);
              await loadCommunities(session);
              return;
            }
          }
        } catch {
          // ignore; fall back to public landing
        }
      }

      setPublicCommunity(payload.community);
      const plans = Array.isArray(payload.active_plans)
        ? payload.active_plans
        : payload.active_plan
          ? [payload.active_plan]
          : [];
      setPublicCommunityPlans(plans);
      const preferred =
        plans.find((plan) => plan.billing_period === "monthly") ??
        plans.find((plan) => plan.billing_period === "yearly") ??
        plans[0] ??
        null;
      setSelectedPublicCommunityBillingPeriod(preferred?.billing_period ?? null);

      if (payload.community.visibility === "public") {
        void loadPublicChatPreview(payload.community.slug);
      }
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to load community.";
      setPublicCommunityError(message);
    } finally {
      setIsLoadingPublicCommunity(false);
    }
  }

  async function startCheckoutForPlan(
    communitySlug: string,
    billingPeriod: string,
    cancelPath: string,
  ): Promise<void> {
    const url = getSupabaseUrl();
    if (!url) {
      setCheckoutError("Missing Supabase URL.");
      setCheckoutStatus("error");
      return;
    }
    setCheckoutStatus("loading");
    setCheckoutError(null);
    try {
      const origin = window.location.origin.replace(/\/+$/, "");
      const successUrl = `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${origin}${cancelPath}`;
      const brandosAid = getBrandosAidForCommunitySlug(communitySlug);
      const body = JSON.stringify({
        community_slug: communitySlug,
        billing_period: billingPeriod,
        success_url: successUrl,
        cancel_url: cancelUrl,
        tracking: brandosAid ? { brandos_aid: brandosAid } : undefined,
      });
      const session = sessionRef.current;
      const response = session
        ? await fetchWithSupabaseAuth(
            `${url}/functions/v1/checkout_start`,
            { method: "POST", headers: { "Content-Type": "application/json" }, body },
            session,
          )
        : await fetchWithSupabasePublic(`${url}/functions/v1/checkout_start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
      if (!response.ok) throw new Error(await readSupabaseError(response));
      const data = (await response.json()) as { checkout_url?: unknown };
      const checkoutUrl = typeof data?.checkout_url === "string" ? data.checkout_url : "";
      if (!checkoutUrl) throw new Error("Missing checkout_url.");
      window.location.assign(checkoutUrl);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to start checkout.";
      setCheckoutError(message);
      setCheckoutStatus("error");
    }
  }

  async function startBuilderPlanCheckout(
    tier: "builder" | "pro",
    opts?: { context?: BuilderUpgradeContext },
  ): Promise<void> {
    const session = sessionRef.current;
    const url = session ? getSupabaseUrl() : null;
    if (!session || !url) {
      setAuthError("Sign in to upgrade.");
      handleSignIn();
      return;
    }
    setBuilderBillingError(null);
    setIsStartingBuilderCheckout(true);
    try {
      const origin = window.location.origin.replace(/\/+$/, "");
      const context: BuilderUpgradeContext = opts?.context ?? "builder";
      const successUrl = `${origin}/?billing=success&billing_source=web&billing_context=${encodeURIComponent(context)}`;
      const cancelUrl = `${origin}/?billing=cancel&billing_source=web&billing_context=${encodeURIComponent(context)}`;
      const response = await fetchWithSupabaseAuth(
        `${url}/functions/v1/builder_checkout_start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier, success_url: successUrl, cancel_url: cancelUrl }),
        },
        session,
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      const data = (await response.json()) as { checkout_url?: unknown };
      const checkoutUrl = typeof data?.checkout_url === "string" ? data.checkout_url : "";
      if (!checkoutUrl) throw new Error("Missing checkout_url.");
      window.location.assign(checkoutUrl);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to start checkout.";
      setBuilderBillingError(message);
    } finally {
      setIsStartingBuilderCheckout(false);
    }
  }

  async function openBuilderBillingPortal(context: BuilderUpgradeContext = "builder"): Promise<void> {
    const session = sessionRef.current;
    const url = session ? getSupabaseUrl() : null;
    if (!session || !url) {
      setAuthError("Sign in to manage billing.");
      handleSignIn();
      return;
    }
	    setBuilderBillingError(null);
	    setIsStartingBuilderPortal(true);
	    try {
	      const origin = window.location.origin.replace(/\/+$/, "");
	      const returnUrl = `${origin}/?billing=return&billing_source=web&billing_context=${encodeURIComponent(context)}`;
	      const response = await fetchWithSupabaseAuth(
	        `${url}/functions/v1/builder_billing_portal`,
	        {
	          method: "POST",
	          headers: { "Content-Type": "application/json" },
	          body: JSON.stringify({ return_url: returnUrl }),
	        },
	        session,
	      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      const data = (await response.json()) as { url?: unknown };
      const portalUrl = typeof data?.url === "string" ? data.url : "";
      if (!portalUrl) throw new Error("Missing portal URL.");
      window.location.assign(portalUrl);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to open billing portal.";
      setBuilderBillingError(message);
    } finally {
      setIsStartingBuilderPortal(false);
    }
  }

  async function startConnectOnboarding(): Promise<void> {
    const session = sessionRef.current;
    const url = session ? getSupabaseUrl() : null;
    if (!session || !url) {
      setAuthError("Sign in to set up payouts.");
      handleSignIn();
      return;
    }
    setBuilderBillingError(null);
    setIsStartingConnectOnboarding(true);
    try {
      const origin = window.location.origin.replace(/\/+$/, "");
      const returnUrl = `${origin}/?payouts=done`;
      const refreshUrl = `${origin}/?payouts=refresh`;
      const response = await fetchWithSupabaseAuth(
        `${url}/functions/v1/connect_onboard_start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ return_url: returnUrl, refresh_url: refreshUrl }),
        },
        session,
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      const data = (await response.json()) as { url?: unknown };
      const linkUrl = typeof data?.url === "string" ? data.url : "";
      if (!linkUrl) throw new Error("Missing onboarding URL.");
      window.location.assign(linkUrl);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to start payout setup.";
      setBuilderBillingError(message);
    } finally {
      setIsStartingConnectOnboarding(false);
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
        `${url}/rest/v1/rpc/get_builder_billing_status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
        session,
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      const rows = (await response.json()) as BuilderBillingStatus[];
      const row = rows[0] ?? null;
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

  async function handleDevSetBuilderTier(nextTier: "free" | "builder" | "pro") {
    const session = sessionRef.current;
    const url = session ? getSupabaseUrl() : null;
    if (!session || !url) return;

    // Defense-in-depth: the RPC is also server-guarded.
    if ((session.user.email ?? "").toLowerCase() !== ARX_OWNER_EMAIL) return;

    if (isDevSettingBuilderTier) return;
    setIsDevSettingBuilderTier(true);
    setDevSetBuilderTierError(null);
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/dev_set_my_builder_tier`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p_builder_tier: nextTier }),
        },
        session,
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));

      await loadBuilderBillingStatus(session);

      // Clear cached Pro checks so gated UX updates immediately.
      setActiveCommunityOwnerIsPro(null);
      activeCommunityOwnerIsProLoadedCommunityIdRef.current = null;
      communityAgentDraftsLoadedCommunityIdRef.current = null;
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to update builder tier.";
      setDevSetBuilderTierError(message);
    } finally {
      setIsDevSettingBuilderTier(false);
    }
  }

  async function redeemPendingPurchases(opts?: { navigate?: boolean; silentNoop?: boolean }): Promise<number> {
    const session = sessionRef.current;
    const url = session ? getSupabaseUrl() : null;
    if (!session || !url) {
      setAuthError("Sign in to claim access.");
      handleSignIn();
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
      const claimedCommunityId = rows[0]?.community_id;
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
        navigateTo("/", { replace: true });
        setActiveView("home");
        setActivePage("community");
        setCommunityTab("chat");
        setActiveCommunityId(claimedCommunityId);
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

  useEffect(() => {
    if (checkoutSuccessSessionId) return;
    if (checkoutFinalizePollTimeoutRef.current) {
      window.clearTimeout(checkoutFinalizePollTimeoutRef.current);
      checkoutFinalizePollTimeoutRef.current = null;
    }
    checkoutFinalizePollCountRef.current = 0;
    checkoutFinalizeInFlightRef.current = false;
  }, [checkoutSuccessSessionId]);

  useEffect(() => {
    const url = getSupabaseUrl();
    if (!url) return;
    if (!checkoutSuccessSessionId) return;
    const sessionId = checkoutSuccessSessionId.trim();
    if (!sessionId) {
      setCheckoutStatus("error");
      setCheckoutError("Missing session_id.");
      return;
    }
    if (lastCheckoutFinalizeSessionIdRef.current !== sessionId) {
      lastCheckoutFinalizeSessionIdRef.current = sessionId;
      checkoutFinalizePollCountRef.current = 0;
      if (checkoutFinalizePollTimeoutRef.current) {
        window.clearTimeout(checkoutFinalizePollTimeoutRef.current);
        checkoutFinalizePollTimeoutRef.current = null;
      }
    }

    let cancelled = false;
    const run = async () => {
      if (checkoutFinalizeInFlightRef.current) return;
      checkoutFinalizeInFlightRef.current = true;
      setCheckoutStatus((prev) => (prev === "pending" ? "pending" : "loading"));
      setCheckoutError(null);
      setCheckoutClaimToken(null);
      setRedeemClaimError(null);
      try {
        const response = await fetchWithSupabasePublic(
          `${url}/functions/v1/checkout_finalize?session_id=${encodeURIComponent(sessionId)}`,
          { method: "GET" },
        );
        if (!response.ok) throw new Error(await readSupabaseError(response));
        const payload = (await response.json()) as {
          ok?: boolean;
          status?: string;
          claim?: { token?: string };
        };
        if (cancelled) return;
        if (payload?.status === "pending") {
          setCheckoutStatus("pending");
          checkoutFinalizePollCountRef.current += 1;
          const attempt = checkoutFinalizePollCountRef.current;
          if (attempt <= 20) {
            const delayMs = Math.min(8000, 900 + attempt * 450);
            if (checkoutFinalizePollTimeoutRef.current) {
              window.clearTimeout(checkoutFinalizePollTimeoutRef.current);
            }
            checkoutFinalizePollTimeoutRef.current = window.setTimeout(() => {
              if (cancelled) return;
              setCheckoutFinalizeNonce((prev) => prev + 1);
            }, delayMs);
          }
          return;
        }
        const token = typeof payload?.claim?.token === "string" ? payload.claim.token.trim() : "";
        if (!token) throw new Error("Missing claim token.");
        setCheckoutStatus("succeeded");
        setCheckoutClaimToken(token);
        if (checkoutFinalizePollTimeoutRef.current) {
          window.clearTimeout(checkoutFinalizePollTimeoutRef.current);
          checkoutFinalizePollTimeoutRef.current = null;
        }
        storePendingPurchaseClaimToken(token);
        if (sessionRef.current) {
          await redeemPurchaseClaim(token);
        }
      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "Failed to finalize checkout.";
        setCheckoutStatus("error");
        setCheckoutError(message);
      } finally {
        checkoutFinalizeInFlightRef.current = false;
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [checkoutSuccessSessionId, checkoutFinalizeNonce]);

  useEffect(() => {
    const token = (claimTokenParam ?? "").trim();
    if (!token) return;
    storePendingPurchaseClaimToken(token);
    if (!sessionRef.current) return;
    void redeemPurchaseClaim(token);
  }, [claimTokenParam]);

  useEffect(() => {
    if (!supabaseSession) return;
    const token = readPendingPurchaseClaimToken();
    if (!token) return;
    if (isRedeemingClaim) return;
    void redeemPurchaseClaim(token);
  }, [supabaseSession]);

  useEffect(() => {
    if (!supabaseSession) return;
    void loadPendingPurchaseClaims(supabaseSession);
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
    if (!supabaseSession) {
      setBuilderBillingStatus(null);
      setBuilderBillingError(null);
      setIsLoadingBuilderBilling(false);
      return;
    }
    void loadBuilderBillingStatus(supabaseSession);
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
		        const ownedCount = communities.reduce(
		          (acc, community) => acc + (communityRoleById[community.id] === "owner" ? 1 : 0),
		          0,
		        );
		        let lastStatus: BuilderBillingStatus | null = null;
		        for (let attempt = 0; attempt < maxAttempts; attempt++) {
		          if (cancelled) return;
		          const status = await loadBuilderBillingStatus(supabaseSession);
		          lastStatus = status;
		          const tier = (status?.builder_tier ?? "free").toLowerCase();
		          const max = status?.max_communities ?? 0;
		          const hasCapacity = tier !== "free" && max > 0 && ownedCount < max;
		          if (tier !== "free" && (!wantsCreate || hasCapacity)) break;
		          if (builderBillingReturn.status !== "success" && !wantsCreate) break;
		          await new Promise((resolve) => window.setTimeout(resolve, 1000));
		        }

	        if (cancelled) return;
	        if (!wantsCreate) return;
	        if (builderBillingReturn.source === "desktop") return;
	        if (isFinalizingCreateCommunityFromBilling) return;

	        const draft = loadCreateCommunityDraft();
	        if (!draft) {
	          setFinalizeCreateCommunityError("Draft not found. Re-open Create community to continue.");
	          return;
	        }
		        if (draft.user_id && draft.user_id !== supabaseSession.user.id) {
		          setFinalizeCreateCommunityError("Draft belongs to a different account. Re-open Create community to continue.");
		          return;
		        }
		        const tier = (lastStatus?.builder_tier ?? builderBillingStatus?.builder_tier ?? "free").toLowerCase();
		        const max = lastStatus?.max_communities ?? builderBillingStatus?.max_communities ?? 0;
		        if (tier === "free") {
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
    if (isRedeemingClaim || isJoiningPublicCommunity) return;
    const claimToken = readPendingPurchaseClaimToken();
    if (claimToken) return;
    const communitySlug = readPendingPublicJoinCommunitySlug();
    const communityId = readPendingPublicJoinCommunityId();
    if (!communitySlug && !communityId) return;
    void joinPublicCommunity({ communitySlug: communitySlug || null, communityId: communityId || undefined });
  }, [supabaseSession, isRedeemingClaim, isJoiningPublicCommunity]);

  async function loadCommunities(session: SupabaseSession) {
    const url = getSupabaseUrl();
    if (!url) return;
    const userId = getSupabaseAuthUid(session);
    try {
      setIsLoadingCommunities(true);
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
      // Keep the previous list so the rail doesn't flicker to "empty" on transient failures.
      // (The canonical list will refresh on the next successful request.)
    } finally {
      setIsLoadingCommunities(false);
    }
  }

  async function loadThreads(session: SupabaseSession) {
    const url = getSupabaseUrl();
    if (!url) return;
    setThreadError(null);
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/threads?select=id,title,engine_id,model_id,community_id,created_at,updated_at,last_seq&engine_id=neq.community_chat&order=updated_at.desc&limit=200`,
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
        last_seq: unknown;
      }>;
      const list: ThreadRecord[] = rows
        .filter((row) => (row.engine_id ?? "").trim() !== "community_chat")
        .map((row) => {
          const parsedLastSeq =
            typeof row.last_seq === "number"
              ? row.last_seq
              : typeof row.last_seq === "string"
                ? Number(row.last_seq)
                : Number.NaN;
          return {
            id: row.id,
            title: row.title ?? null,
            engine_id: row.engine_id,
            model_id: row.model_id ?? null,
            community_id: row.community_id ?? null,
            last_seq: Number.isFinite(parsedLastSeq) ? parsedLastSeq : 0,
            created_at: toEpochSeconds(row.created_at),
            updated_at: toEpochSeconds(row.updated_at)
          };
        });
      setThreads(list);
      const visible = list.filter((thread) => thread.last_seq > 0);

      // Default selection (first load only): open the most recent real thread.
      if (!activeThreadId) {
        if (!threadsHydratedRef.current) {
          if (!workspaceWantsNewChatRef.current) {
            setActiveThreadId(visible[0]?.id ?? null);
          }
        }
        threadsHydratedRef.current = true;
        return;
      }

      // If the selected thread is an empty stub, fall back to the latest real chat.
      // When the active thread isn't in the list (e.g., older than the current limit),
      // keep the selection so refresh/deep links don't jump elsewhere.
      const selected = list.find((t) => t.id === activeThreadId) ?? null;
      if (selected && selected.last_seq <= 0) {
        setActiveThreadId(visible[0]?.id ?? null);
      }
      threadsHydratedRef.current = true;
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
    } catch (error) {
      console.warn("Failed to load messages:", error);
      setThreadMessages([]);
    }
  }

  async function loadProviderKeyStatus(session: SupabaseSession): Promise<void> {
    const url = getSupabaseUrl();
    if (!url) return;
    try {
      const results = await Promise.all(
        DEFAULT_PROVIDER_KEYS.map(async (provider) => {
          try {
            const response = await fetchWithSupabaseAuth(
              `${url}/functions/v1/provider_key`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "get", provider: provider.id }),
              },
              session,
            );
            if (!response.ok) return { id: provider.id, hasKey: false };
            const data = (await response.json()) as { has_key?: unknown };
            return { id: provider.id, hasKey: Boolean(data?.has_key) };
          } catch {
            return { id: provider.id, hasKey: false };
          }
        }),
      );
      const nextById = new Map(results.map((row) => [row.id, row.hasKey] as const));
      setProviderKeys((prev) => {
        const normalized = prev.length ? prev : DEFAULT_PROVIDER_KEYS;
        return normalized.map((item) => {
          const hasKey = nextById.get(item.id);
          return typeof hasKey === "boolean" ? { ...item, hasKey } : item;
        });
      });
    } catch {
      // ignore (BYO is optional in some flows)
    }
  }

  async function loadModelRegistry(session: SupabaseSession): Promise<void> {
    const url = getSupabaseUrl();
    if (!url) return;
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/model_registry?select=id,display_name,sort_order,enabled&enabled=eq.true&order=sort_order.asc,id.asc`,
        {},
        session,
      );
      if (!response.ok) return;
      const rows = (await response.json()) as Array<Partial<ModelRegistryListRow>>;
      const catalog = rows
        .map((row) => {
          const id = typeof row?.id === "string" ? row.id.trim() : "";
          if (!id) return null;
          const label =
            (typeof row.display_name === "string" ? row.display_name.trim() : "") ||
            formatModelLabel(id) ||
            id;
          return { id, label, enabled: true } satisfies ModelToggle;
        })
        .filter(Boolean) as ModelToggle[];

      if (!catalog.length) return;
      setModelToggles((prev) => {
        const prevById = new Map(prev.map((t) => [t.id, t]));
        return catalog.map((toggle) => {
          const existing = prevById.get(toggle.id);
          return existing ? { ...toggle, enabled: existing.enabled } : toggle;
        });
      });
    } catch {
      // ignore
    }
  }

  async function createThread(session: SupabaseSession): Promise<ThreadRecord | null> {
    const url = getSupabaseUrl();
    if (!url) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    const id = crypto.randomUUID();
    const ownerId = getSupabaseAuthUid(session);
    const communityId = activeCommunityId;
    const enabled = modelToggles.filter((toggle) => toggle.enabled);
    const preferredModelId =
      (activeModelId ?? "").trim() ||
      enabled.find((toggle) => toggle.id === DEFAULT_ACTIVE_MODEL_ID)?.id ||
      enabled[0]?.id ||
      DEFAULT_ACTIVE_MODEL_ID;
    const body = {
      id,
      owner_id: ownerId,
      title: null,
      engine_id: "arx_harness",
      model_id: preferredModelId,
      community_id: communityId
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
        model_id: preferredModelId,
        community_id: communityId,
        last_seq: 0,
        created_at: nowSec,
        updated_at: nowSec
      };
      setThreads((prev) => [record, ...prev]);
      setWorkspaceWantsNewChatMode(false);
      setActiveThreadId(id);
      return record;
    } catch (error) {
      console.warn("Failed to create thread:", error);
      return null;
    }
  }

  async function updateThreadModel(threadId: string, modelId: string, session: SupabaseSession): Promise<void> {
    const url = getSupabaseUrl();
    if (!url) return;
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/threads?id=eq.${encodeURIComponent(threadId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ model_id: modelId })
        },
        session
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, model_id: modelId } : t)));
    } catch (error) {
      console.warn("Failed to update thread model:", error);
    }
  }

  async function setThreadCommunityLens(
    threadId: string,
    communityId: string | null,
    session: SupabaseSession,
  ): Promise<{ thread_id: string; community_id: string | null; updated_at: string } | null> {
    const url = getSupabaseUrl();
    if (!url) return null;
    const response = await fetchWithSupabaseAuth(
      `${url}/rest/v1/rpc/set_thread_community_lens`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p_thread_id: threadId, p_community_id: communityId }),
      },
      session,
    );
    if (!response.ok) throw new Error(await readSupabaseError(response));
    const rows = (await response.json()) as Array<{ thread_id: string; community_id: string | null; updated_at: string }>;
    const row = rows[0] ?? null;
    if (!row?.thread_id) return null;
    setThreads((prev) =>
      prev.map((t) =>
        t.id === threadId
          ? { ...t, community_id: row.community_id ?? null, updated_at: toEpochSeconds(row.updated_at) }
          : t,
      ),
    );
    return row;
  }

  type WorkspaceLensTarget = {
    threadId: string;
    communityId: string | null;
    communityName: string;
    session: SupabaseSession;
  };

  // "Last click wins" lens switching: keep a single in-flight RPC and coalesce rapid
  // community changes so the active thread ends up in the user's last-selected lens.
  const workspaceLensEpochRef = useRef(0);
  const workspaceLensAppliedEpochRef = useRef(0);
  const workspaceLensDesiredRef = useRef<WorkspaceLensTarget | null>(null);
  const workspaceLensInFlightRef = useRef(false);
  const workspaceLensWaitersRef = useRef<
    Array<{ epoch: number; resolve: () => void; reject: (error: unknown) => void }>
  >([]);
  const [workspaceLensStatus, setWorkspaceLensStatus] = useState<{ inFlight: boolean; targetName: string | null }>({
    inFlight: false,
    targetName: null,
  });

  const settleWorkspaceLensWaiters = (upToEpoch: number, error: unknown | null) => {
    const remaining: Array<{ epoch: number; resolve: () => void; reject: (error: unknown) => void }> = [];
    for (const waiter of workspaceLensWaitersRef.current) {
      if (waiter.epoch <= upToEpoch) {
        if (error) waiter.reject(error);
        else waiter.resolve();
      } else {
        remaining.push(waiter);
      }
    }
    workspaceLensWaitersRef.current = remaining;
  };

  const runWorkspaceLensWorker = async (): Promise<void> => {
    if (workspaceLensInFlightRef.current) return;
    workspaceLensInFlightRef.current = true;
    setWorkspaceLensStatus((prev) => (prev.inFlight ? prev : { inFlight: true, targetName: prev.targetName }));
    try {
      while (workspaceLensAppliedEpochRef.current < workspaceLensEpochRef.current) {
        const epoch = workspaceLensEpochRef.current;
        const desired = workspaceLensDesiredRef.current;
        if (!desired) {
          workspaceLensAppliedEpochRef.current = epoch;
          settleWorkspaceLensWaiters(epoch, null);
          break;
        }

        setWorkspaceLensStatus({ inFlight: true, targetName: desired.communityName });
        try {
          await setThreadCommunityLens(desired.threadId, desired.communityId, desired.session);
          workspaceLensAppliedEpochRef.current = epoch;
          settleWorkspaceLensWaiters(epoch, null);
          // Only toast once the final requested lens has settled (avoid spam on rapid clicks).
          if (epoch === workspaceLensEpochRef.current) {
            showAppToastMessage(
              desired.communityId ? `Now using ${desired.communityName}.` : "Cleared community context.",
            );
          }
        } catch (error) {
          workspaceLensAppliedEpochRef.current = epoch;
          settleWorkspaceLensWaiters(epoch, error);
          if (epoch === workspaceLensEpochRef.current) {
            const message =
              typeof error === "string"
                ? error
                : error instanceof Error
                  ? error.message
                  : "Failed to switch community context.";
            showAppToastMessage(message);
          }
        }
      }
    } finally {
      workspaceLensInFlightRef.current = false;
      setWorkspaceLensStatus({ inFlight: false, targetName: null });
    }
  };

  const requestWorkspaceThreadLens = (target: WorkspaceLensTarget): Promise<void> => {
    const currentLens = threads.find((t) => t.id === target.threadId)?.community_id ?? null;
    if (currentLens === target.communityId && !workspaceLensInFlightRef.current) {
      return Promise.resolve();
    }

    const epoch = (workspaceLensEpochRef.current += 1);
    workspaceLensDesiredRef.current = target;
    void runWorkspaceLensWorker();
    return new Promise<void>((resolve, reject) => {
      workspaceLensWaitersRef.current.push({ epoch, resolve, reject });
    });
  };

  const ensureWorkspaceThreadLensBeforeSend = async (threadId: string, session: SupabaseSession): Promise<void> => {
    if (activePage !== "workspace") return;
    const desiredCommunityId = activeCommunityId ?? null;
    const currentLens = threads.find((t) => t.id === threadId)?.community_id ?? null;
    if (currentLens === desiredCommunityId) return;
    if (!desiredCommunityId) return;
    const desiredName = communities.find((c) => c.id === desiredCommunityId)?.name ?? desiredCommunityId;
    await requestWorkspaceThreadLens({ threadId, communityId: desiredCommunityId, communityName: desiredName, session });
  };

  function getLastThreadMessageId(messages: ThreadMessage[], role: "user" | "assistant" | "system"): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg?.role === role) return msg.id;
    }
    return null;
  }

  function isAbortError(error: unknown): boolean {
    if (!error) return false;
    if (error instanceof DOMException && error.name === "AbortError") return true;
    if (error instanceof Error && error.name === "AbortError") return true;
    return false;
  }

  function stopStreamingTurn(): void {
    if (!streamingAbortRef.current) return;
    streamingUserCancelledRef.current = true;
    streamingAbortRef.current.abort();
  }

  async function runPublicTurn(params: {
    modelId: string;
    threadId: string;
    runIdHint: string;
    messages: ThreadMessage[];
  }): Promise<{ cancelled: boolean; error: string | null; content: string; runId: string | null }> {
    const url = getSupabaseUrl();
    if (!url) return { cancelled: false, error: "Missing Supabase URL.", content: "", runId: null };

    streamingAbortRef.current?.abort();
    const abort = new AbortController();
    streamingAbortRef.current = abort;
    streamingUserCancelledRef.current = false;
    streamingContentRef.current = "";
    setStreamingContent("");
    setStreamingThreadId(params.threadId);
    setStreamingRunId(params.runIdHint);
    setStreamingMeta({
      engine_id: "public_web",
      model_id: params.modelId,
      inference_source: "platform",
      memory_used: [],
      history_used: [],
    });

    const scheduleStreamingFlush = () => {
      if (streamingRafRef.current) return;
      streamingRafRef.current = window.requestAnimationFrame(() => {
        streamingRafRef.current = null;
        setStreamingContent(streamingContentRef.current);
      });
    };

    const toPublicMessages = (items: ThreadMessage[]): Array<{ role: "user" | "assistant" | "system"; content: string }> => {
      const out: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];
      for (const msg of items) {
        if (!msg) continue;
        const role = msg.role;
        if (role !== "user" && role !== "assistant" && role !== "system") continue;
        const content = extractTextFromContentJson(msg.content_json).trim();
        if (!content) continue;
        out.push({ role, content });
      }
      return out;
    };

    let finalContent = "";
    let runIdFromServer: string | null = null;
    try {
      const turn = await fetchWithSupabasePublic(`${url}/functions/v1/public_turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_id: params.modelId,
          stream: true,
          messages: toPublicMessages(params.messages),
        }),
        signal: abort.signal,
      });
      if (!turn.ok) {
        let parsed: any = null;
        try {
          parsed = await turn.clone().json();
        } catch {
          parsed = null;
        }
        const code = typeof parsed?.code === "string" ? parsed.code.trim() : "";
        if (code === "rate_limited") {
          return { cancelled: false, error: "Too many requests. Try again soon.", content: "", runId: null };
        }
        if (code === "platform_inference_misconfigured") {
          return { cancelled: false, error: "Guest chat is temporarily unavailable.", content: "", runId: null };
        }
        const message = await readSupabaseError(turn);
        throw new Error(message || "Failed to run model.");
      }
      const reader = turn.body?.getReader();
      if (!reader) throw new Error("Missing streaming response.");

      const decoder = new TextDecoder();
      let buffer = "";
      let eventName = "message";
      let dataBuffer = "";
      let seenDone = false;

      const flushEvent = () => {
        const raw = dataBuffer.trim();
        dataBuffer = "";
        if (!raw) return;
        let parsed: any = null;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = { raw };
        }
        if (eventName === "start") {
          if (typeof parsed?.run_id === "string") {
            runIdFromServer = parsed.run_id;
            setStreamingRunId(parsed.run_id);
          }
          if (typeof parsed?.engine_id === "string") {
            setStreamingMeta({
              engine_id: parsed.engine_id,
              model_id: typeof parsed?.model_id === "string" ? parsed.model_id : params.modelId,
              inference_source: "platform",
              memory_used: [],
              history_used: [],
            });
          }
        } else if (eventName === "delta") {
          const full = typeof parsed?.full_content === "string" ? parsed.full_content : "";
          finalContent = full;
          streamingContentRef.current = full;
          scheduleStreamingFlush();
        } else if (eventName === "done") {
          seenDone = true;
        } else if (eventName === "error") {
          const msg =
            (typeof parsed?.error === "string" && parsed.error.trim()) ||
            (typeof parsed?.message === "string" && parsed.message.trim()) ||
            (typeof parsed?.raw === "string" && parsed.raw.trim()) ||
            "Failed to run model.";
          throw new Error(msg);
        }
        eventName = "message";
      };

      while (!seenDone) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        while (true) {
          const idx = buffer.indexOf("\n");
          if (idx < 0) break;
          let line = buffer.slice(0, idx);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          buffer = buffer.slice(idx + 1);
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
            continue;
          }
          if (line.startsWith("data:")) {
            dataBuffer += line.slice(5).trim();
            continue;
          }
          if (line === "") {
            flushEvent();
            continue;
          }
        }
      }
      flushEvent();
      return { cancelled: false, error: null, content: finalContent, runId: runIdFromServer };
    } catch (error) {
      const cancelled = streamingUserCancelledRef.current || abort.signal.aborted || isAbortError(error);
      if (cancelled) return { cancelled: true, error: null, content: "", runId: null };
      const message = typeof error === "string" ? error : error instanceof Error ? error.message : "Failed to run model.";
      return { cancelled: false, error: message, content: "", runId: null };
    } finally {
      if (streamingRafRef.current) {
        window.cancelAnimationFrame(streamingRafRef.current);
        streamingRafRef.current = null;
      }
      streamingAbortRef.current = null;
      streamingContentRef.current = null;
      setStreamingContent(null);
      setStreamingThreadId(null);
      setStreamingRunId(null);
      setStreamingMeta(null);
      streamingUserCancelledRef.current = false;
    }
  }

  async function runAgentTurn(
    session: SupabaseSession,
    threadId: string,
    params: {
      preferredModelId: string;
      mode?: "respond" | "regenerate";
      runIdHint: string;
      inferenceSource?: "platform" | "user";
    },
  ): Promise<{ cancelled: boolean; error: string | null }> {
    const url = getSupabaseUrl();
    if (!url) return { cancelled: false, error: "Missing Supabase URL." };

    streamingAbortRef.current?.abort();
    const abort = new AbortController();
    streamingAbortRef.current = abort;
    streamingUserCancelledRef.current = false;
    streamingContentRef.current = "";
    setStreamingContent("");
    setStreamingThreadId(threadId);
    setStreamingRunId(params.runIdHint);
    setStreamingMeta({
      engine_id: "agent_web",
      model_id: params.preferredModelId,
      inference_source: params.inferenceSource ?? null,
      memory_used: [],
      history_used: [],
    });

    const scheduleStreamingFlush = () => {
      if (streamingRafRef.current) return;
      streamingRafRef.current = window.requestAnimationFrame(() => {
        streamingRafRef.current = null;
        setStreamingContent(streamingContentRef.current);
      });
    };

    try {
      const turn = await fetchWithSupabaseAuth(
        `${url}/functions/v1/agent_turn`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            thread_id: threadId,
            stream: true,
            ...(params.mode ? { mode: params.mode } : null),
            ...(params.inferenceSource ? { inference_source: params.inferenceSource } : null),
          }),
          signal: abort.signal,
        },
        session,
      );
      if (!turn.ok) {
        let parsed: any = null;
        try {
          parsed = await turn.clone().json();
        } catch {
          parsed = null;
        }
        const code = typeof parsed?.code === "string" ? parsed.code.trim() : "";
        if (code === "rate_limited") {
          const retryAfter =
            typeof parsed?.retry_after_seconds === "number" && Number.isFinite(parsed.retry_after_seconds)
              ? Math.max(0, Math.floor(parsed.retry_after_seconds))
              : null;
          const messageFromServer = typeof parsed?.message === "string" ? parsed.message.trim() : "";
          const message = retryAfter
            ? `Too many requests. Try again in ${retryAfter}s.`
            : messageFromServer || "Too many requests. Try again soon.";
          return { cancelled: false, error: message };
        }
        if (
          code === "platform_inference_quota_exceeded" ||
          code === "platform_inference_misconfigured" ||
          code === "platform_inference_disabled" ||
          code === "platform_inference_not_allowed"
        ) {
          const rawProvider = typeof parsed?.provider === "string" ? parsed.provider.trim().toLowerCase() : "";
          const providerId: ProviderId | null =
            rawProvider === "openai"
              ? "openai"
              : rawProvider === "anthropic"
                ? "anthropic"
                : rawProvider === "google"
                  ? "google"
                  : rawProvider === "x-ai" || rawProvider === "xai"
                    ? "x-ai"
                    : null;
          if (providerId) {
            const providerLabel = DEFAULT_PROVIDER_KEYS.find((p) => p.id === providerId)?.label ?? providerId;
            const hasKeyFromServer = typeof parsed?.has_byok_key === "boolean" ? parsed.has_byok_key : null;
            const hasKeyFromState = Boolean(providerKeys.find((p) => p.id === providerId)?.hasKey);
            const byokAllowedFromServer = typeof parsed?.byok_allowed === "boolean" ? parsed.byok_allowed : true;
            const messageFromServer = typeof parsed?.message === "string" ? parsed.message.trim() : null;
            setPlatformQuotaModal({
              reason: code === "platform_inference_quota_exceeded" ? "quota" : "unavailable",
              threadId,
              mode: params.mode === "regenerate" ? "regenerate" : "respond",
              providerId,
              providerLabel,
              hasKey: hasKeyFromServer ?? hasKeyFromState,
              byokAllowed: byokAllowedFromServer,
              message: messageFromServer,
            });
            return { cancelled: false, error: null };
          }
        }
        const message = await readSupabaseError(turn);
        throw new Error(message || "Failed to run model.");
      }
      const reader = turn.body?.getReader();
      if (!reader) throw new Error("Missing streaming response.");

      const decoder = new TextDecoder();
      let buffer = "";
      let eventName = "message";
      let dataBuffer = "";
      let seenDone = false;

      const flushEvent = () => {
        const raw = dataBuffer.trim();
        dataBuffer = "";
        if (!raw) return;
        let parsed: any = null;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = { raw };
        }
        if (eventName === "start") {
          if (typeof parsed?.run_id === "string") setStreamingRunId(parsed.run_id);
          if (typeof parsed?.engine_id === "string") {
            const memoryUsed = parseMemoryUsedArray(parsed?.memory_used);
            const historyUsed = parseHistoryUsedArray(parsed?.history_used);
            setStreamingMeta({
              engine_id: parsed.engine_id,
              model_id: typeof parsed?.model_id === "string" ? parsed.model_id : null,
              inference_source: typeof parsed?.inference_source === "string" ? parsed.inference_source : null,
              memory_used: memoryUsed,
              history_used: historyUsed,
            });
          }
        } else if (eventName === "delta") {
          const full = typeof parsed?.full_content === "string" ? parsed.full_content : "";
          streamingContentRef.current = full;
          scheduleStreamingFlush();
        } else if (eventName === "done") {
          const memoryAdded = parseMemoryUsedArray(parsed?.memory_added);
          if (memoryAdded.length > 0) showMemoryToastMessage("Memory updated");
          seenDone = true;
        } else if (eventName === "error") {
          const msg =
            (typeof parsed?.error === "string" && parsed.error.trim()) ||
            (typeof parsed?.message === "string" && parsed.message.trim()) ||
            (typeof parsed?.raw === "string" && parsed.raw.trim()) ||
            "Failed to run model.";
          throw new Error(msg);
        }
        eventName = "message";
      };

      while (!seenDone) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        while (true) {
          const idx = buffer.indexOf("\n");
          if (idx < 0) break;
          let line = buffer.slice(0, idx);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          buffer = buffer.slice(idx + 1);
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
            continue;
          }
          if (line.startsWith("data:")) {
            dataBuffer += line.slice(5).trim();
            continue;
          }
          if (line === "") {
            flushEvent();
            continue;
          }
        }
      }
      flushEvent();

      await loadThreadMessages(threadId, session);
      await loadThreads(session);
      return { cancelled: false, error: null };
    } catch (error) {
      const cancelled = streamingUserCancelledRef.current || abort.signal.aborted || isAbortError(error);
      if (cancelled) {
        window.setTimeout(() => {
          void loadThreadMessages(threadId, session).catch(() => null);
          void loadThreads(session).catch(() => null);
        }, 350);
        return { cancelled: true, error: null };
      }
      const message =
        typeof error === "string" ? error : error instanceof Error ? error.message : "Failed to run model.";
      return { cancelled: false, error: message };
    } finally {
      if (streamingRafRef.current) {
        window.cancelAnimationFrame(streamingRafRef.current);
        streamingRafRef.current = null;
      }
      streamingAbortRef.current = null;
      streamingContentRef.current = null;
      setStreamingContent(null);
      setStreamingThreadId(null);
      setStreamingRunId(null);
      setStreamingMeta(null);
      streamingUserCancelledRef.current = false;
    }
  }

  async function retryTurnWithByokFromQuotaModal(): Promise<void> {
    const modal = platformQuotaModal;
    if (!modal) return;
    if (!supabaseSession) {
      setPlatformQuotaModal(null);
      handleSignIn();
      return;
    }
    if (isPlatformQuotaModalRunning) return;
    if (!modal.hasKey) {
      setActiveView("settings");
      setSettingsPage("models");
      return;
    }

    setIsPlatformQuotaModalRunning(true);
    setThreadError(null);
    setPlatformQuotaModal(null);
    setActiveThreadId(modal.threadId);
    try {
      const threadModelId = (threads.find((t) => t.id === modal.threadId)?.model_id ?? "").trim();
      const preferredModelId = threadModelId || DEFAULT_ACTIVE_MODEL_ID;
      const result = await runAgentTurn(supabaseSession, modal.threadId, {
        preferredModelId,
        mode: modal.mode,
        runIdHint: `byok_web:${modal.threadId}:${Date.now()}`,
        inferenceSource: "user",
      });
      if (result.error) setThreadError(result.error);
    } finally {
      setIsPlatformQuotaModalRunning(false);
    }
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
          base.data_url = await readChatImageAsDataUrl(file);
          next.push(base);
          continue;
        } else if (isLikelyTextFile(file)) {
          const { text, truncated } = await readTextAttachmentPreview(file);
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

  async function handleWorkspaceFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const files = input.files;
    if (!files || files.length === 0) {
      input.value = "";
      return;
    }
    setThreadError(null);
    const updated = await ingestAttachmentsFromFileList(files, workspaceAttachmentsRef.current, (message) => {
      setThreadError(message);
    });
    setWorkspaceAttachments(updated);
    input.value = "";
  }

  async function handleCommunityFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const files = input.files;
    if (!files || files.length === 0) {
      input.value = "";
      return;
    }
    setCommunityChatError(null);
    const updated = await ingestAttachmentsFromFileList(files, communityAttachmentsRef.current, (message) => {
      setCommunityChatError(message);
    });
    setCommunityAttachments(updated);
    input.value = "";
  }

  function removeWorkspaceAttachment(id: string) {
    setWorkspaceAttachments((prev) => prev.filter((att) => att.id !== id));
  }

  function removeCommunityAttachment(id: string) {
    setCommunityAttachments((prev) => prev.filter((att) => att.id !== id));
  }

  function openCommunityChatLightbox(images: ChatLightboxImage[], index: number) {
    if (!images || images.length === 0) return;
    const clamped = Math.min(Math.max(index, 0), images.length - 1);
    setCommunityChatLightboxImages(images);
    setCommunityChatLightboxIndex(clamped);
    setIsCommunityChatLightboxOpen(true);
  }

  function closeCommunityChatLightbox() {
    setIsCommunityChatLightboxOpen(false);
  }

  useEffect(() => {
    if (!isCommunityChatLightboxOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeCommunityChatLightbox();
        return;
      }
      if (communityChatLightboxImages.length <= 1) return;
      if (event.key === "ArrowLeft") {
        setCommunityChatLightboxIndex((prev) => {
          const next = prev - 1;
          return next < 0 ? communityChatLightboxImages.length - 1 : next;
        });
      }
      if (event.key === "ArrowRight") {
        setCommunityChatLightboxIndex((prev) => (prev + 1) % communityChatLightboxImages.length);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isCommunityChatLightboxOpen, communityChatLightboxImages.length]);

  async function sendUserMessage(opts?: { text?: string }) {
    const text = (opts?.text ?? messageInput).trim();
    const hasAttachments = workspaceAttachments.length > 0;
    if (!text && !hasAttachments) return;

    if (!supabaseSession) {
      if (hasAttachments) {
        setThreadError("Sign in to send files.");
        handleSignIn();
        return;
      }
      const now = new Date().toISOString();
      const existing = threadMessages.filter((m) => m.thread_id === GUEST_THREAD_ID);
      const userMsg: ThreadMessage = {
        id: crypto.randomUUID(),
        thread_id: GUEST_THREAD_ID,
        seq: existing.length + 1,
        role: "user",
        content_json: { text },
        created_at: now,
        engine_id: null,
        model_id: null,
        run_id: null,
      };
      const baseMessages = [...existing, userMsg];
      const persistGuestFromMessages = (messages: ThreadMessage[]) => {
        const stored: GuestThreadStorageV1 = {
          v: 1,
          model_id: guestModelId,
          messages: [],
        };
        for (const msg of messages) {
          if (msg.role !== "user" && msg.role !== "assistant") continue;
          const content = extractTextFromContentJson(msg.content_json).trim();
          if (!content) continue;
          stored.messages.push({
            id: msg.id,
            role: msg.role,
            content,
            created_at: msg.created_at,
            run_id: msg.run_id,
          });
        }
        storeGuestThreadStorage(stored);
      };

      setThreadError(null);
      setIsSendingMessage(true);
      autoScrollEnabledRef.current = true;
      setIsWorkspaceAtBottom(true);
      try {
        setWorkspaceWantsNewChatMode(false);
        if (activeThreadId !== GUEST_THREAD_ID) setActiveThreadId(GUEST_THREAD_ID);
        setThreadMessages(baseMessages);
        setMessageInput("");
        setWorkspaceAttachments([]);
        persistGuestFromMessages(baseMessages);

        const turnResult = await runPublicTurn({
          modelId: guestModelId,
          threadId: GUEST_THREAD_ID,
          runIdHint: `public_web:${userMsg.id}`,
          messages: baseMessages,
        });
        if (turnResult.error) throw new Error(turnResult.error);
        if (turnResult.cancelled) return;
        const assistantContent = (turnResult.content ?? "").trim();
        if (!assistantContent) return;
        const assistantMsg: ThreadMessage = {
          id: crypto.randomUUID(),
          thread_id: GUEST_THREAD_ID,
          seq: baseMessages.length + 1,
          role: "assistant",
          content_json: { text: assistantContent },
          created_at: new Date().toISOString(),
          engine_id: "public_openrouter",
          model_id: guestModelId,
          run_id: turnResult.runId ?? null,
        };
        const nextMessages = [...baseMessages, assistantMsg];
        setThreadMessages(nextMessages);
        persistGuestFromMessages(nextMessages);
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
      return;
    }

    const startedInDraft = !activeThreadId;
    let createdThreadId: string | null = null;
    let postedUserMessage = false;

    const tier = (builderBillingStatus?.builder_tier ?? "free").toLowerCase();
    const hasPersonalMemoryAccess = tier === "builder" || tier === "pro";

    setThreadError(null);
    setIsSendingMessage(true);
    autoScrollEnabledRef.current = true;
    setIsWorkspaceAtBottom(true);
    try {
      const session = supabaseSession;
      let threadId = activeThreadId;
      if (!threadId) {
        const created = await createThread(session);
        threadId = created?.id ?? null;
        createdThreadId = threadId;
      }
      if (!threadId) throw new Error("No thread available.");

      const url = getSupabaseUrl();
      if (!url) throw new Error("Missing Supabase URL.");

      const currentThreadModel = threads.find((t) => t.id === threadId)?.model_id;
      const enabled = modelToggles.filter((toggle) => toggle.enabled);
      const preferredModelId =
        (activeModelId ?? "").trim() ||
        enabled.find((toggle) => toggle.id === DEFAULT_ACTIVE_MODEL_ID)?.id ||
        enabled[0]?.id ||
        DEFAULT_ACTIVE_MODEL_ID;
      if (!currentThreadModel || currentThreadModel !== preferredModelId) {
        await updateThreadModel(threadId, preferredModelId, session);
      }

      // Option 1: on the AI/workspace page, the selected community is the lens.
      // Ensure the cloud thread lens is up to date before inference so we don't
      // accidentally answer under a stale community context.
      await ensureWorkspaceThreadLensBeforeSend(threadId, session);

      const rememberEnabled = userMemorySettings.remember_intent_enabled !== false;
      const remembered = rememberEnabled ? extractRememberIntent(text) : null;
      if (remembered && hasPersonalMemoryAccess) {
        try {
          await createPersonalMemoryItemDirect({ content: remembered, pinned: false });
          showMemoryToastMessage("Memory updated");
        } catch (error) {
          console.warn("Failed to save memory intent:", error);
        }
      }

      const messageId = crypto.randomUUID();
      const attachmentsToSend = [...workspaceAttachmentsRef.current];
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
            content_json: {
              text,
              ...(attachmentsToSend.length > 0 ? { attachments: attachmentsToSend } : {})
            }
          })
        },
        session
      );
      if (!response.ok) {
        const message = await readSupabaseError(response);
        throw new Error(message);
      }
      postedUserMessage = true;
      if (startedInDraft) {
        const nowSec = Math.floor(Date.now() / 1000);
        setThreads((prev) =>
          prev.map((t) =>
            t.id === threadId ? { ...t, last_seq: Math.max(t.last_seq, 1), updated_at: nowSec } : t
          )
        );
      }
      setMessageInput("");
      setWorkspaceAttachments([]);
      await loadThreadMessages(threadId, session);

      const turnResult = await runAgentTurn(session, threadId, {
        preferredModelId,
        mode: "respond",
        runIdHint: `agent_web:${messageId}`,
      });
      if (turnResult.error) throw new Error(turnResult.error);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to send message.";
      setThreadError(message);
      if (startedInDraft && createdThreadId && !postedUserMessage) {
        setThreads((prev) => prev.filter((t) => t.id !== createdThreadId));
        setWorkspaceWantsNewChatMode(true);
        setActiveThreadId(null);
      }
      const normalized = message.toLowerCase();
      if (normalized.includes("cloud history limit reached")) {
        setBuilderUpgradeContext("builder");
        setBuilderBillingError(message);
        setIsBuilderUpgradeOpen(true);
      }
    } finally {
      setIsSendingMessage(false);
    }
  }

  async function retryLastTurn() {
    if (isSendingMessage) return;
    if (!supabaseSession) {
      handleSignIn();
      return;
    }
    const threadId = activeThreadId;
    if (!threadId) return;
    const lastMessage = threadMessages[threadMessages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") return;

    const lastUserMessageId = getLastThreadMessageId(threadMessages, "user");
    if (!lastUserMessageId) return;

    setThreadError(null);
    setIsSendingMessage(true);
    autoScrollEnabledRef.current = true;
    setIsWorkspaceAtBottom(true);
    try {
      const session = supabaseSession;
      const currentThreadModel = threads.find((t) => t.id === threadId)?.model_id;
      const enabled = modelToggles.filter((toggle) => toggle.enabled);
      const preferredModelId =
        (activeModelId ?? "").trim() ||
        enabled.find((toggle) => toggle.id === DEFAULT_ACTIVE_MODEL_ID)?.id ||
        enabled[0]?.id ||
        DEFAULT_ACTIVE_MODEL_ID;
      if (!currentThreadModel || currentThreadModel !== preferredModelId) {
        await updateThreadModel(threadId, preferredModelId, session);
      }

      const turnResult = await runAgentTurn(session, threadId, {
        preferredModelId,
        mode: "respond",
        runIdHint: `agent_web:${lastUserMessageId}`,
      });
      if (turnResult.error) throw new Error(turnResult.error);
    } catch (error) {
      const message =
        typeof error === "string" ? error : error instanceof Error ? error.message : "Failed to run model.";
      setThreadError(message);
      const normalized = message.toLowerCase();
      if (normalized.includes("cloud history limit reached")) {
        setBuilderUpgradeContext("builder");
        setBuilderBillingError(message);
        setIsBuilderUpgradeOpen(true);
      }
    } finally {
      setIsSendingMessage(false);
    }
  }

  async function regenerateLastTurn() {
    if (isSendingMessage) return;
    if (!supabaseSession) {
      handleSignIn();
      return;
    }
    const threadId = activeThreadId;
    if (!threadId) return;
    const lastUserMessageId = getLastThreadMessageId(threadMessages, "user");
    if (!lastUserMessageId) return;

    setThreadError(null);
    setIsSendingMessage(true);
    autoScrollEnabledRef.current = true;
    setIsWorkspaceAtBottom(true);
    try {
      const session = supabaseSession;
      const currentThreadModel = threads.find((t) => t.id === threadId)?.model_id;
      const enabled = modelToggles.filter((toggle) => toggle.enabled);
      const preferredModelId =
        (activeModelId ?? "").trim() ||
        enabled.find((toggle) => toggle.id === DEFAULT_ACTIVE_MODEL_ID)?.id ||
        enabled[0]?.id ||
        DEFAULT_ACTIVE_MODEL_ID;
      if (!currentThreadModel || currentThreadModel !== preferredModelId) {
        await updateThreadModel(threadId, preferredModelId, session);
      }

      const turnResult = await runAgentTurn(session, threadId, {
        preferredModelId,
        mode: "regenerate",
        runIdHint: `agent_web_regen:${lastUserMessageId}:${Date.now()}`,
      });
      if (turnResult.error) throw new Error(turnResult.error);
    } catch (error) {
      const message =
        typeof error === "string" ? error : error instanceof Error ? error.message : "Failed to run model.";
      setThreadError(message);
      const normalized = message.toLowerCase();
      if (normalized.includes("cloud history limit reached")) {
        setBuilderUpgradeContext("builder");
        setBuilderBillingError(message);
        setIsBuilderUpgradeOpen(true);
      }
    } finally {
      setIsSendingMessage(false);
    }
  }

  async function handleCopyMessage(messageId: string, text: string) {
    await copyTextToClipboard(text);
    setCopiedMessageId(messageId);
    window.setTimeout(() => setCopiedMessageId((prev) => (prev === messageId ? null : prev)), 2000);
  }

  async function handleSaveProviderKey(id: ProviderKey["id"]) {
    const provider = providerKeys.find((item) => item.id === id);
    const value = provider?.inputValue.trim() ?? "";
    if (!value) return;
    if (!supabaseSession) {
      handleSignIn();
      return;
    }
    const url = getSupabaseUrl();
    if (!url) return;
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/functions/v1/provider_key`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "set", provider: id, key: value }),
        },
        supabaseSession,
      );
      if (!response.ok) throw new Error(await response.text());
      setProviderKeys((prev) =>
        prev.map((item) => (item.id === id ? { ...item, hasKey: true, inputValue: "", error: null } : item)),
      );
    } catch (error) {
      const message =
        typeof error === "string" ? error : error instanceof Error ? error.message : "Failed to save key";
      setProviderKeys((prev) => prev.map((item) => (item.id === id ? { ...item, error: message } : item)));
    }
  }

  async function handleClearProviderKey(id: ProviderKey["id"]) {
    if (!supabaseSession) return;
    const url = getSupabaseUrl();
    if (!url) return;
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/functions/v1/provider_key`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "clear", provider: id }),
        },
        supabaseSession,
      );
      if (!response.ok) throw new Error(await response.text());
      setProviderKeys((prev) =>
        prev.map((item) => (item.id === id ? { ...item, hasKey: false, inputValue: "", error: null } : item)),
      );
      setModelAvailability({});
    } catch (error) {
      const message =
        typeof error === "string" ? error : error instanceof Error ? error.message : "Failed to clear key";
      setProviderKeys((prev) => prev.map((item) => (item.id === id ? { ...item, error: message } : item)));
    }
  }

  async function handleToggleModel(id: string) {
    setModelToggles((prev) => prev.map((toggle) => (toggle.id === id ? { ...toggle, enabled: !toggle.enabled } : toggle)));
  }

  async function exportThreadsCsv() {
    if (!supabaseSession) return;
    const url = getSupabaseUrl();
    if (!url) return;
    setExportError(null);
    setIsExporting(true);
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/threads?select=id,title,engine_id,model_id,community_id,created_at,updated_at&order=updated_at.desc&limit=1000`,
        {},
        supabaseSession
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      const rows = (await response.json()) as Array<Record<string, unknown>>;
      const csv = buildCsv(["id", "title", "engine_id", "model_id", "community_id", "created_at", "updated_at"], rows);
      downloadTextFile("arx_threads.csv", csv);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Failed to export threads.");
    } finally {
      setIsExporting(false);
    }
  }

  async function exportMessagesCsv() {
    if (!supabaseSession) return;
    const url = getSupabaseUrl();
    if (!url) return;
    setExportError(null);
    setIsExporting(true);
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/messages?select=id,thread_id,seq,role,content_json,engine_id,model_id,run_id,created_at&order=thread_id.asc,seq.asc&limit=10000`,
        {},
        supabaseSession
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      const rawRows = (await response.json()) as ThreadMessage[];
      const rows = rawRows.map((row) => ({
        id: row.id,
        thread_id: row.thread_id,
        seq: row.seq,
        role: row.role,
        content: parseMessageText(row.content_json),
        engine_id: row.engine_id ?? "",
        model_id: row.model_id ?? "",
        run_id: row.run_id ?? "",
        created_at: row.created_at
      }));
      const csv = buildCsv(["id", "thread_id", "seq", "role", "content", "engine_id", "model_id", "run_id", "created_at"], rows);
      downloadTextFile("arx_messages.csv", csv);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Failed to export messages.");
    } finally {
      setIsExporting(false);
    }
  }

  async function exportMemoryCsv() {
    if (!supabaseSession) return;
    const url = getSupabaseUrl();
    if (!url) return;
    setExportError(null);
    setIsExporting(true);
    try {
      const userId = getSupabaseAuthUid(supabaseSession);
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/personal_memory_items?select=id,content,scope,scope_id,pinned,created_at,updated_at&user_id=eq.${encodeURIComponent(userId)}&order=pinned.desc,updated_at.desc&limit=2000`,
        {},
        supabaseSession
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      const rows = (await response.json()) as Array<Record<string, unknown>>;
      const csv = buildCsv(["id", "scope", "scope_id", "pinned", "content", "created_at", "updated_at"], rows);
      downloadTextFile("arx_personal_memory.csv", csv);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Failed to export memory.");
    } finally {
      setIsExporting(false);
    }
  }

  function showMemoryToastMessage(message: string) {
    if (memoryToastTimeoutRef.current) {
      window.clearTimeout(memoryToastTimeoutRef.current);
      memoryToastTimeoutRef.current = null;
    }
    setMemoryToast(message);
    memoryToastTimeoutRef.current = window.setTimeout(() => {
      setMemoryToast(null);
      memoryToastTimeoutRef.current = null;
    }, 2400);
  }

  function showInferenceToastMessage(message: string) {
    if (inferenceToastTimeoutRef.current) {
      window.clearTimeout(inferenceToastTimeoutRef.current);
      inferenceToastTimeoutRef.current = null;
    }
    setInferenceToast(message);
    inferenceToastTimeoutRef.current = window.setTimeout(() => {
      setInferenceToast(null);
      inferenceToastTimeoutRef.current = null;
    }, 3200);
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

  async function loadUserMemorySettings(session: SupabaseSession): Promise<void> {
    const url = getSupabaseUrl();
    if (!url) return;
    setIsLoadingUserMemorySettings(true);
    try {
      const userId = getSupabaseAuthUid(session);
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/user_memory_settings?select=memory_mode,remember_intent_enabled&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
        {},
        session,
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      const rows = (await response.json()) as Array<Partial<UserMemorySettings>>;
      const row = rows[0];
      const mode = row?.memory_mode;
      setUserMemorySettings({
        memory_mode: mode === "suggest" || mode === "auto" ? mode : "off",
        remember_intent_enabled: row?.remember_intent_enabled !== false,
      });
    } catch {
      setUserMemorySettings({ memory_mode: "off", remember_intent_enabled: true });
    } finally {
      setIsLoadingUserMemorySettings(false);
    }
  }

  async function saveUserMemorySettings(next: UserMemorySettings): Promise<void> {
    const session = sessionRef.current;
    const url = session ? getSupabaseUrl() : null;
    if (!session || !url) return;
    setIsLoadingUserMemorySettings(true);
    try {
      const userId = getSupabaseAuthUid(session);
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/user_memory_settings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify({
            user_id: userId,
            memory_mode: next.memory_mode,
            remember_intent_enabled: Boolean(next.remember_intent_enabled),
          }),
        },
        session,
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      setUserMemorySettings(next);
    } catch (error) {
      console.warn("Failed to save memory settings:", error);
    } finally {
      setIsLoadingUserMemorySettings(false);
    }
  }

  async function loadUserModelSettings(session: SupabaseSession): Promise<void> {
    const url = getSupabaseUrl();
    if (!url) return;
    setIsLoadingUserModelSettings(true);
    setUserModelSettingsError(null);
    try {
      const userId = getSupabaseAuthUid(session);
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/user_model_settings?select=system_prompt&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
        {},
        session,
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      const rows = (await response.json()) as Array<Partial<UserModelSettings>>;
      const prompt = typeof rows[0]?.system_prompt === "string" ? rows[0]!.system_prompt! : "";
      setUserModelSettings({ system_prompt: prompt });
      setSystemPromptDraft(prompt);
    } catch (error) {
      setUserModelSettings({ system_prompt: "" });
      setSystemPromptDraft("");
      setUserModelSettingsError(
        typeof error === "string" ? error : error instanceof Error ? error.message : "Failed to load system prompt",
      );
    } finally {
      setIsLoadingUserModelSettings(false);
    }
  }

  async function saveUserModelSettings(next: UserModelSettings): Promise<void> {
    const session = sessionRef.current;
    const url = session ? getSupabaseUrl() : null;
    if (!session || !url) return;
    setIsSavingUserModelSettings(true);
    setUserModelSettingsError(null);
    try {
      const userId = getSupabaseAuthUid(session);
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/user_model_settings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            user_id: userId,
            system_prompt: String(next.system_prompt ?? ""),
          }),
        },
        session,
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      setUserModelSettings({ system_prompt: String(next.system_prompt ?? "") });
    } catch (error) {
      setUserModelSettingsError(
        typeof error === "string" ? error : error instanceof Error ? error.message : "Failed to save system prompt",
      );
    } finally {
      setIsSavingUserModelSettings(false);
    }
  }

  function sortPersonalMemory(items: PersonalMemoryItem[]): PersonalMemoryItem[] {
    return [...items].sort((a, b) => {
      const pinnedDiff = Number(b.pinned) - Number(a.pinned);
      if (pinnedDiff !== 0) return pinnedDiff;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }

  async function fetchCloudPersonalMemoryItems(session: SupabaseSession): Promise<PersonalMemoryItem[]> {
    const url = getSupabaseUrl();
    if (!url) return [];

    const userId = getSupabaseAuthUid(session);
    const baseSelect = "id,content,scope,scope_id,pinned,created_at,updated_at";

    const fetchRows = async (scope: "global" | "workspace"): Promise<PersonalMemoryItem[]> => {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/personal_memory_items?select=${baseSelect}` +
          `&user_id=eq.${encodeURIComponent(userId)}` +
          `&scope=eq.${scope}` +
          `&order=pinned.desc,updated_at.desc` +
          `&limit=1000`,
        {},
        session
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      const rows = (await response.json()) as Array<{
        id: string;
        content: string;
        scope: string;
        scope_id: string | null;
        pinned: boolean;
        created_at: string;
        updated_at: string;
      }>;
      return rows.map((row) => ({
        id: row.id,
        content: row.content,
        scope: row.scope === "workspace" ? "workspace" : "global",
        scope_id: row.scope_id ?? null,
        pinned: Boolean(row.pinned),
        created_at: row.created_at,
        updated_at: row.updated_at
      }));
    };

    const [globalRows, workspaceRows] = await Promise.all([fetchRows("global"), fetchRows("workspace")]);
    return [...globalRows, ...workspaceRows];
  }

  async function loadPersonalMemoryItems() {
    setIsLoadingPersonalMemory(true);
    setPersonalMemoryError(null);
    try {
      const session = sessionRef.current;
      if (!session) {
        setPersonalMemoryItems([]);
        return;
      }
      const items = await fetchCloudPersonalMemoryItems(session);
      setPersonalMemoryItems(sortPersonalMemory(items));
    } catch (error) {
      const message =
        typeof error === "string" ? error : error instanceof Error ? error.message : "Unknown error";
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
      const session = sessionRef.current;
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
        typeof error === "string" ? error : error instanceof Error ? error.message : "Unknown error";
      setPersonalMemoryError(message);
    } finally {
      setIsLoadingPersonalMemory(false);
    }
  }

  async function createPersonalMemoryItemDirect(params: { content: string; pinned: boolean }): Promise<PersonalMemoryItem | null> {
    const content = params.content.trim();
    if (!content) return null;
    const session = sessionRef.current;
    const url = session ? getSupabaseUrl() : null;
    if (!session || !url) return null;
    const response = await fetchWithSupabaseAuth(
      `${url}/rest/v1/personal_memory_items?select=id,content,scope,scope_id,pinned,created_at,updated_at`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({
          user_id: getSupabaseAuthUid(session),
          content,
          scope: "global",
          scope_id: null,
          pinned: Boolean(params.pinned),
        }),
      },
      session,
    );
    if (!response.ok) throw new Error(await readSupabaseError(response));
    const rows = (await response.json()) as PersonalMemoryItem[];
    return rows[0] ?? null;
  }

  async function handleCreatePersonalMemoryItem() {
    const content = newPersonalMemoryContent.trim();
    if (!content) return;
    setPersonalMemoryError(null);
    try {
      const session = sessionRef.current;
      const url = session ? getSupabaseUrl() : null;
      if (!session || !url) {
        setAuthError("Sign in to save memory.");
        handleSignIn();
        return;
      }
      const scope = newPersonalMemoryScope === "workspace" ? "global" : newPersonalMemoryScope;
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/personal_memory_items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({
            user_id: getSupabaseAuthUid(session),
            content,
            scope,
            scope_id: null,
            pinned: Boolean(newPersonalMemoryPinned)
          })
        },
        session
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      setNewPersonalMemoryContent("");
      setNewPersonalMemoryPinned(false);
      await loadPersonalMemoryItems();
    } catch (error) {
      const message =
        typeof error === "string" ? error : error instanceof Error ? error.message : "Unknown error";
      setPersonalMemoryError(message);
    }
  }

  async function handleTogglePersonalMemoryPinned(item: PersonalMemoryItem) {
    setPersonalMemoryError(null);
    try {
      const session = sessionRef.current;
      const url = session ? getSupabaseUrl() : null;
      if (!session || !url) {
        setAuthError("Sign in to update memory.");
        handleSignIn();
        return;
      }
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/personal_memory_items?id=eq.${encodeURIComponent(item.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({
            pinned: !item.pinned,
            updated_at: new Date().toISOString()
          })
        },
        session
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      await loadPersonalMemoryItems();
    } catch (error) {
      const message =
        typeof error === "string" ? error : error instanceof Error ? error.message : "Unknown error";
      setPersonalMemoryError(message);
    }
  }

  async function handleDeletePersonalMemoryItem(id: string) {
    setPersonalMemoryError(null);
    try {
      const session = sessionRef.current;
      const url = session ? getSupabaseUrl() : null;
      if (!session || !url) {
        setAuthError("Sign in to delete memory.");
        handleSignIn();
        return;
      }
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/personal_memory_items?id=eq.${encodeURIComponent(id)}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } },
        session
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      await loadPersonalMemoryItems();
    } catch (error) {
      const message =
        typeof error === "string" ? error : error instanceof Error ? error.message : "Unknown error";
      setPersonalMemoryError(message);
    }
  }

  async function loadDiscoverCommunities() {
    const url = getSupabaseUrl();
    if (!url) return;
    setIsLoadingDiscover(true);
    setDiscoverError(null);
    try {
      // Discover is public; use the anon path for better caching and to avoid extra refetches on auth changes.
      const response = await fetchWithSupabasePublic(`${url}/functions/v1/public_discover?limit=60`, { method: "GET" });
      if (!response.ok) {
        const message = await readSupabaseError(response);
        throw new Error(message);
      }
      const payload = (await response.json()) as { ok?: boolean; communities?: DiscoverCommunity[] };
      setDiscoverCommunities(Array.isArray(payload?.communities) ? payload.communities : []);
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

  function communityChatThreadIdForCommunity(communityId: string): string {
    return communityId;
  }

  function extractTextFromContentJson(contentJson: unknown): string {
    if (contentJson === null || contentJson === undefined) return "";
    if (typeof contentJson === "string") {
      const trimmed = contentJson.trim();
      if (!trimmed) return "";
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        return extractTextFromContentJson(parsed);
      } catch {
        return trimmed;
      }
    }
    if (typeof contentJson === "object") {
      const asAny = contentJson as any;
      if (typeof asAny.text === "string") return asAny.text;
      if (typeof asAny.body === "string") return asAny.body;
    }
    return "";
  }

  type CloudMessageRow = {
    id: string;
    thread_id: string;
    seq: number;
    role: string;
    content_json: unknown;
    sender_id: string | null;
    reply_to_id: string | null;
    created_at: string;
  };

  function toCommunityChatMessage(row: CloudMessageRow): CommunityChatMessage | null {
    const threadId = (row.thread_id ?? "").trim();
    if (!threadId) return null;
    const id = (row.id ?? "").trim();
    if (!id) return null;
    if ((row.role ?? "").trim() !== "user") return null;
    const senderId = (row.sender_id ?? "").trim() || "unknown";
    const body = extractTextFromContentJson(row.content_json);
    const attachments = parseMessageAttachments(row.content_json);
    return {
      id,
      community_id: threadId,
      sender_id: senderId,
      body,
      attachments: attachments.length > 0 ? attachments : undefined,
      reply_to_id: row.reply_to_id ?? null,
      created_at: row.created_at,
      seq: Number(row.seq) || 0,
    };
  }

  async function ensureCommunityChatThread(communityId: string, session: SupabaseSession): Promise<string> {
    const url = getSupabaseUrl();
    if (!url) throw new Error("Missing Supabase URL.");

    const response = await fetchWithSupabaseAuth(
      `${url}/rest/v1/rpc/ensure_community_chat_thread`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p_community_id: communityId }),
      },
      session,
    );
    if (!response.ok) throw new Error(await readSupabaseError(response));
    const rows = (await response.json()) as Array<{ thread_id: string }>;
    const threadId = (rows[0]?.thread_id ?? "").trim();
    if (!threadId) throw new Error("Failed to ensure community chat thread.");
    return threadId;
  }

  const handleChatScroll = () => {
    if (!communityChatListRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = communityChatListRef.current;
    const atBottom = scrollHeight - scrollTop <= clientHeight + 100;
    if (atBottom !== isUserAtBottomRef.current) {
      setIsUserAtBottom(atBottom);
      isUserAtBottomRef.current = atBottom;
    }
    if (atBottom) setUnreadCount(0);
    if (atBottom) {
      communityChatAnchorRef.current = null;
    } else {
      communityChatAnchorRef.current = captureCommunityChatScrollAnchor(communityChatListRef.current);
    }

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
    communityChatOldestSeqRef.current = null;
    pendingChatPrependScrollRef.current = null;
    try {
      const threadId = await ensureCommunityChatThread(communityId, session);
      let response: Response;
      try {
        response = await fetchWithSupabaseAuth(
          `${url}/rest/v1/messages?select=id,thread_id,seq,role,content_json,sender_id,reply_to_id,created_at&thread_id=eq.${encodeURIComponent(
            threadId
          )}&order=seq.desc&limit=${COMMUNITY_CHAT_PAGE_SIZE}`,
          { method: "GET" },
          session
        );
      } catch {
        return;
      }
      if (!response.ok) return;
      const rowsDesc = (await response.json()) as CloudMessageRow[];
      const mappedDesc = rowsDesc.map(toCommunityChatMessage).filter(Boolean) as CommunityChatMessage[];
      const hasMore = mappedDesc.length >= COMMUNITY_CHAT_PAGE_SIZE;
      const rows = [...mappedDesc].reverse();
      setCommunityChatHasMore(hasMore);
      setCommunityMessages(rows);
      communityChatOldestSeqRef.current = rows[0]?.seq ?? null;
      void loadUserProfiles(
        Array.from(new Set(rows.map((m) => m.sender_id))),
        session
      );
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
    const cursor = communityChatOldestSeqRef.current;
    if (!cursor) {
      setCommunityChatHasMore(false);
      return;
    }
    const url = getSupabaseUrl();
    if (!url) return;

    const container = communityChatListRef.current;
    if (container) {
      pendingChatPrependScrollRef.current = captureCommunityChatScrollAnchor(container);
    }

    setIsLoadingMoreChat(true);
    try {
      const threadId = await ensureCommunityChatThread(communityId, session);
      let response: Response;
      try {
        response = await fetchWithSupabaseAuth(
          `${url}/rest/v1/messages?select=id,thread_id,seq,role,content_json,sender_id,reply_to_id,created_at&thread_id=eq.${encodeURIComponent(
            threadId
          )}&seq=lt.${cursor}&order=seq.desc&limit=${COMMUNITY_CHAT_PAGE_SIZE}`,
          { method: "GET" },
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
      const rowsDesc = (await response.json()) as CloudMessageRow[];
      const mappedDesc = rowsDesc.map(toCommunityChatMessage).filter(Boolean) as CommunityChatMessage[];
      if (mappedDesc.length === 0) {
        setCommunityChatHasMore(false);
        pendingChatPrependScrollRef.current = null;
        return;
      }

      const hasMore = mappedDesc.length >= COMMUNITY_CHAT_PAGE_SIZE;
      const rows = [...mappedDesc].reverse();
      setCommunityChatHasMore(hasMore);
      communityChatOldestSeqRef.current = rows[0]?.seq ?? cursor;
      void loadUserProfiles(
        Array.from(new Set(rows.map((m) => m.sender_id))),
        session
      );

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

  function maybeBroadcastCommunityTyping(nextValue: string) {
    if (!supabaseSession || !activeCommunityId || activePage !== "community" || communityTab !== "chat") return;
    if (!nextValue.trim()) return;
    const socket = communitySocketRef.current;
    const topic = communityTypingTopicRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !topic) return;
    const now = Date.now();
    if (now - lastCommunityTypingSentAtRef.current < 1200) return;
    lastCommunityTypingSentAtRef.current = now;
    socket.send(
      JSON.stringify({
        topic,
        event: "broadcast",
        payload: {
          event: "typing",
          payload: {
            user_id: supabaseSession.user.id
          }
        },
        ref: `${now}`
      })
    );
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

    const existingAttachments =
      communityMessages.find((m) => m.id === editingMessageId)?.attachments ?? [];

    const bodyToSave = editingMessagePrefix ? editingMessagePrefix + text : text;

    setCommunityMessages((prev) => prev.map((m) => (m.id === editingMessageId ? { ...m, body: bodyToSave } : m)));
    setEditingMessageId(null);
    setEditingMessageText("");
    setEditingMessagePrefix(null);

    let response: Response | null = null;
    try {
      response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/messages?id=eq.${editingMessageId}&sender_id=eq.${supabaseSession.user.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content_json: {
              text: bodyToSave,
              ...(existingAttachments.length > 0 ? { attachments: existingAttachments } : {})
            }
          })
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
        `${url}/rest/v1/messages?id=eq.${messageId}&sender_id=eq.${supabaseSession.user.id}`,
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
    if (!supabaseSession || !activeCommunityId) return false;
    const rawText = communityMessageInput.trim();
    const attachmentsToSend = [...communityAttachmentsRef.current];
    if (!rawText && attachmentsToSend.length === 0) return;

    const replySnapshot = replyingToMessage;
    const replyToId = replySnapshot ? replySnapshot.id : null;
    const bodyToSend = rawText;

    const optimisticId = `pending-${Date.now()}`;
    const optimisticMessage: CommunityChatMessage = {
      id: optimisticId,
      community_id: activeCommunityId,
      sender_id: supabaseSession.user.id,
      body: bodyToSend,
      attachments: attachmentsToSend,
      reply_to_id: replyToId,
      created_at: new Date().toISOString(),
      seq: Number.MAX_SAFE_INTEGER,
    };
    setCommunityMessages((prev) => [...prev, optimisticMessage]);
    setCommunityMessageInput("");
    setCommunityAttachments([]);
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
      setCommunityAttachments(attachmentsToSend);
      setReplyingToMessage(replySnapshot);
      setIsSendingCommunityMessage(false);
      return;
    }

    try {
      const threadId = await ensureCommunityChatThread(activeCommunityId, supabaseSession);
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/messages?select=id,thread_id,seq,role,content_json,sender_id,reply_to_id,created_at`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=representation"
          },
	          body: JSON.stringify({
	            thread_id: threadId,
	            role: "user",
	            content_json: {
	              text: bodyToSend,
	              ...(attachmentsToSend.length > 0 ? { attachments: attachmentsToSend } : {})
	            },
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
        setCommunityAttachments(attachmentsToSend);
        setReplyingToMessage(replySnapshot);
        return;
      }
      const created = (await response.json()) as CloudMessageRow[];
      const record = created[0] ? toCommunityChatMessage(created[0]) : null;
      if (!record) {
        setCommunityChatError("Message sent, but no payload returned.");
        setCommunityMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setCommunityMessageInput(rawText);
        setCommunityAttachments(attachmentsToSend);
        setReplyingToMessage(replySnapshot);
        return;
      }
      setCommunityMessages((prev) => {
        const withoutOptimistic = prev.filter((m) => m.id !== optimisticId);
        if (withoutOptimistic.some((m) => m.id === record.id)) return withoutOptimistic;
        const next = [...withoutOptimistic, record];
        next.sort((a, b) => a.seq - b.seq);
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
      setCommunityAttachments(attachmentsToSend);
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

  function hydrateCommunityAgentEditor(slot: number, drafts: CommunityAgentDraft[]) {
    const safeSlot = Math.max(1, Math.min(3, Math.floor(slot)));
    const row = drafts.find((d) => d.slot === safeSlot) ?? null;
    const communityName =
      activeCommunityId ? (communities.find((c) => c.id === activeCommunityId)?.name ?? "").trim() : "";
    const fallbackLanding = communityName
      ? buildDefaultCommunityEmptyThreadLanding(communityName)
      : DEFAULT_EMPTY_THREAD_LANDING;
    const landing = normalizeCommunityAgentLanding(row?.landing_json) ?? fallbackLanding;
    setCommunityAgentSelectedSlot(safeSlot);
    setCommunityAgentDraftName(row?.name ?? "");
    setCommunityAgentDraftLanding(landing);
    setCommunityAgentDraftSystemPrompt(row?.system_prompt ?? "");
    setCommunityAgentDraftSaveError(null);
    communityAgentDraftDirtyRef.current = false;
    setCommunityAgentPreviewTabId(landing.tabs[0]?.id ?? "");
    clearCommunityAgentLandingEdit();
  }

  function normalizeCommunityAgentDraftForSave(draft: CommunityAgentLanding): CommunityAgentLanding | null {
    const tabs = draft.tabs
      .map((tab) => ({
        id: tab.id,
        label: (tab.label ?? "").trim(),
        prompts: (tab.prompts ?? []).map((p) => (p ?? "").trim()).filter(Boolean),
      }))
      .filter((tab) => tab.label && tab.prompts.length > 0)
      .slice(0, 4);
    if (tabs.length === 0) return null;
    return {
      title: (draft.title ?? "").trim() || DEFAULT_EMPTY_THREAD_LANDING.title,
      subtitle: (draft.subtitle ?? "").trim() || DEFAULT_EMPTY_THREAD_LANDING.subtitle,
      tabs,
    };
  }

  async function loadCommunityAgentDrafts(communityId: string, session: SupabaseSession) {
    const url = getSupabaseUrl();
    if (!url) return;
    setIsLoadingCommunityAgentDrafts(true);
    setCommunityAgentDraftsError(null);
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/list_community_agent_drafts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p_community_id: communityId }),
        },
        session,
      );
      if (!response.ok) {
        const message = await readSupabaseError(response);
        setCommunityAgentDrafts([]);
        setCommunityAgentDraftsError(message);
        communityAgentDraftsLoadedCommunityIdRef.current = communityId;
        return;
      }
      const rows = (await response.json()) as CommunityAgentDraft[];
      rows.sort((a, b) => a.slot - b.slot);
      setCommunityAgentDrafts(rows);
      communityAgentDraftsLoadedCommunityIdRef.current = communityId;

      const activeSlot = rows.find((d) => d.is_active)?.slot ?? 1;
      hydrateCommunityAgentEditor(activeSlot, rows);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to load AI agent drafts.";
      setCommunityAgentDrafts([]);
      setCommunityAgentDraftsError(message);
      communityAgentDraftsLoadedCommunityIdRef.current = communityId;
    } finally {
      setIsLoadingCommunityAgentDrafts(false);
    }
  }

  async function handleSaveCommunityAgentDraft() {
    if (!supabaseSession || !activeCommunityId) return;
    const normalized = normalizeCommunityAgentDraftForSave(communityAgentDraftLanding);
    if (!normalized) {
      setCommunityAgentDraftSaveError("Add at least one tab with a label and one prompt.");
      return;
    }
    const url = getSupabaseUrl();
    if (!url) return;
    setIsSavingCommunityAgentDraft(true);
    setCommunityAgentDraftSaveError(null);
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/upsert_community_agent_draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            p_community_id: activeCommunityId,
            p_slot: communityAgentSelectedSlot,
            p_name: communityAgentDraftName,
            p_landing_json: normalized,
            p_system_prompt: communityAgentDraftSystemPrompt,
          }),
        },
        supabaseSession,
      );
      if (!response.ok) {
        const message = await readSupabaseError(response);
        setCommunityAgentDraftSaveError(message);
        return;
      }
      const rows = (await response.json()) as Array<{ id: string; slot: number; is_active: boolean; updated_at: string }>;
      const row = rows[0];
      if (!row) return;
      setCommunityAgentDrafts((prev) => {
        const without = prev.filter((d) => d.slot !== row.slot);
        const next: CommunityAgentDraft[] = [
          ...without,
          {
            id: row.id,
            community_id: activeCommunityId,
            slot: row.slot,
            name: communityAgentDraftName.trim() ? communityAgentDraftName.trim() : null,
            landing_json: normalized,
            system_prompt: communityAgentDraftSystemPrompt,
            is_active: row.is_active,
            updated_at: row.updated_at,
          },
        ];
        next.sort((a, b) => a.slot - b.slot);
        return next;
      });
      communityAgentDraftDirtyRef.current = false;
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to save AI agent draft.";
      setCommunityAgentDraftSaveError(message);
    } finally {
      setIsSavingCommunityAgentDraft(false);
    }
  }

  async function persistCommunityAgentTemplateName(slot: number, nextName: string): Promise<boolean> {
    if (!supabaseSession || !activeCommunityId) return;

    const row = communityAgentDrafts.find((d) => d.slot === slot);
    if (!row) return false;

    const url = getSupabaseUrl();
    if (!url) return false;

    try {
      const normalized = nextName.trim();
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/upsert_community_agent_draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            p_community_id: activeCommunityId,
            p_slot: slot,
            p_name: normalized ? normalized : null,
            p_landing_json: row.landing_json ?? {},
            p_system_prompt: row.system_prompt ?? "",
          }),
        },
        supabaseSession,
      );
      if (!response.ok) {
        const message = await readSupabaseError(response);
        setCommunityAgentDraftSaveError(message);
        return false;
      }
      const rows = (await response.json()) as Array<{ id: string; slot: number; is_active: boolean; updated_at: string }>;
      const updated = rows[0];
      if (!updated) return false;
      setCommunityAgentDrafts((prev) =>
        prev.map((d) =>
          d.slot === slot
            ? {
                ...d,
                id: updated.id,
                name: normalized ? normalized : null,
                is_active: updated.is_active,
                updated_at: updated.updated_at,
              }
            : d,
        ),
      );
      return true;
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to rename template.";
      setCommunityAgentDraftSaveError(message);
      return false;
    }
  }

  async function handleSetLiveCommunityAgentDraft() {
    if (!supabaseSession || !activeCommunityId) return;
    const url = getSupabaseUrl();
    if (!url) return;
    setIsSavingCommunityAgentDraft(true);
    setCommunityAgentDraftSaveError(null);
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/set_active_community_agent_draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p_community_id: activeCommunityId, p_slot: communityAgentSelectedSlot }),
        },
        supabaseSession,
      );
      if (!response.ok) {
        const message = await readSupabaseError(response);
        setCommunityAgentDraftSaveError(message);
        return;
      }
      setCommunityAgentDrafts((prev) =>
        prev.map((d) => (d.community_id === activeCommunityId ? { ...d, is_active: d.slot === communityAgentSelectedSlot } : d)),
      );
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to set live draft.";
      setCommunityAgentDraftSaveError(message);
    } finally {
      setIsSavingCommunityAgentDraft(false);
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

	  async function loadCommunityMembers(
      communityId: string,
      session: SupabaseSession,
      opts?: { includeStatus?: boolean },
    ) {
	    const url = getSupabaseUrl();
	    if (!url) return;
      const membershipsUrl = `${url}/rest/v1/community_memberships?select=id,community_id,user_id,role,created_at&community_id=eq.${communityId}&order=created_at.asc&limit=200`;
      const adminUrl = `${url}/rest/v1/rpc/list_community_members_admin`;
	    let response: Response;
	    try {
      response = await fetchWithSupabaseAuth(
        opts?.includeStatus
          ? adminUrl
          : membershipsUrl,
        opts?.includeStatus
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ p_community_id: communityId }),
            }
          : {},
        session
      );
    } catch {
      return;
    }
    if (!response.ok && opts?.includeStatus) {
      // Fallback during rollout if the admin RPC is missing/unavailable.
      try {
        response = await fetchWithSupabaseAuth(membershipsUrl, {}, session);
      } catch {
        return;
      }
    }
    if (!response.ok) return;
	    const rows = (await response.json()) as CommunityMember[];
	    setCommunityMembers(rows);

	    const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
	    void loadUserProfiles(userIds, session);
	  }

	  async function loadUserProfiles(userIds: string[], session: SupabaseSession) {
	    const url = getSupabaseUrl();
	    if (!url) return;
	    const unique = Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)));
	    if (unique.length === 0) return;
	    const idsFilter = unique.map((id) => `"${id}"`).join(",");
	    try {
	      const profilesResponse = await fetchWithSupabaseAuth(
	        `${url}/rest/v1/profiles?select=user_id,display_name,avatar_url&user_id=in.(${idsFilter})`,
	        { method: "GET" },
	        session
	      );
	      if (!profilesResponse.ok) return;
	      const profiles = (await profilesResponse.json()) as UserProfile[];
	      if (profiles.length === 0) return;
	      setProfilesByUserId((prev) => {
	        const next = { ...prev };
	        for (const profile of profiles) {
	          next[profile.user_id] = profile;
	        }
	        return next;
	      });
	    } catch {
	      // ignore
	    }
	  }

	  async function loadSelfProfile(session: SupabaseSession) {
	    const url = getSupabaseUrl();
	    if (!url) return;
	    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/profiles?select=user_id,display_name,avatar_url,bio&user_id=eq.${encodeURIComponent(
          session.user.id
        )}&limit=1`,
        { method: "GET" },
        session
      );
      if (!response.ok) return;
      const rows = (await response.json()) as UserProfileDetail[];
      const row = rows[0];
      if (!row) return;
      setCloudProfile(row);
      setProfilesByUserId((prev) => ({
        ...prev,
        [row.user_id]: { user_id: row.user_id, display_name: row.display_name, avatar_url: row.avatar_url },
      }));
      setProfileName((prev) => (prev.trim() ? prev : row.display_name ?? ""));
      setProfileBio((prev) => (prev.trim() ? prev : row.bio ?? ""));
      setProfileAvatarUrl((prev) => prev ?? row.avatar_url ?? null);
    } catch {
      // ignore
    }
  }

  async function saveProfileToCloud() {
    const session = sessionRef.current ?? supabaseSession;
    const url = getSupabaseUrl();
    if (!session || !url) {
      setProfileSaveError("Sign in to save your profile.");
      return;
    }

    const trimmedName = profileName.trim();
    const trimmedBio = profileBio.trim();
    if (trimmedName !== profileName) setProfileName(trimmedName);
    if (trimmedBio !== profileBio) setProfileBio(trimmedBio);

    if (profileSaveTimeoutRef.current) {
      window.clearTimeout(profileSaveTimeoutRef.current);
      profileSaveTimeoutRef.current = null;
    }

    setIsSavingProfile(true);
    setProfileSaveError(null);
    setProfileSaveSuccess(false);
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/profiles?on_conflict=user_id&select=user_id,display_name,avatar_url,bio`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=representation",
          },
          body: JSON.stringify({
            user_id: session.user.id,
            display_name: trimmedName || null,
            avatar_url: profileAvatarUrl ?? null,
            bio: trimmedBio || null,
          }),
        },
        session
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      const rows = (await response.json()) as UserProfileDetail[];
      const saved = rows[0];
      if (saved) {
        setCloudProfile(saved);
        setProfilesByUserId((prev) => ({
          ...prev,
          [saved.user_id]: { user_id: saved.user_id, display_name: saved.display_name, avatar_url: saved.avatar_url },
        }));
        setProfileName(saved.display_name ?? "");
        setProfileBio(saved.bio ?? "");
        setProfileAvatarUrl(saved.avatar_url ?? null);
      }
      setProfileSaveSuccess(true);
      profileSaveTimeoutRef.current = window.setTimeout(() => setProfileSaveSuccess(false), 2000);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to save profile.";
      setProfileSaveError(message);
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function loadCommunityAnalytics(
    communityId: string,
    session: SupabaseSession,
    range: AnalyticsRange,
    communityCreatedAt: string | null
  ) {
    const url = getSupabaseUrl();
	    if (!url) return;
	    setIsLoadingCommunityAnalytics(true);
	    setCommunityAnalyticsError(null);
	    setCommunityRevenueError(null);

    const now = Date.now();
    const rangeToWindowStart = (): Date | null => {
      switch (range) {
        case "7d":
          return new Date(now - 7 * 86400000);
        case "30d":
          return new Date(now - 30 * 86400000);
        case "90d":
          return new Date(now - 90 * 86400000);
        case "1y":
          return new Date(now - 365 * 86400000);
        case "all": {
          if (!communityCreatedAt) return null;
          const created = new Date(communityCreatedAt);
          return Number.isNaN(created.getTime()) ? null : created;
        }
        default:
          return new Date(now - 30 * 86400000);
      }
    };

    const windowStart = rangeToWindowStart();
    const sinceWindowIso = windowStart ? windowStart.toISOString() : null;
    const chartBucket: "day" | "week" | "month" =
      range === "7d" || range === "30d" ? "day" : range === "90d" ? "week" : "month";

    const fetchCount = async (queryUrl: string): Promise<number | null> => {
      let response: Response;
      try {
        response = await fetchWithSupabaseAuth(
          queryUrl,
          { method: "HEAD", headers: { Prefer: "count=exact" } },
          session
        );
      } catch {
        return null;
      }
      if (!response.ok) return null;
      return parseContentRangeTotal(response.headers.get("content-range"));
    };

    const fetchEntitledMemberCount = async (): Promise<number | null> => {
      try {
        const response = await fetchWithSupabaseAuth(
          `${url}/rest/v1/rpc/community_entitled_member_count`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ p_community_id: communityId }),
          },
          session
        );
        if (!response.ok) return null;
        const data = await response.json();
        if (typeof data === "number") return data;
        if (typeof data === "string") return Number(data) || 0;
        const asObj = data as Record<string, unknown> | null;
        const maybeValue = asObj && typeof asObj === "object" ? asObj["community_entitled_member_count"] : null;
        if (typeof maybeValue === "number") return maybeValue;
        if (typeof maybeValue === "string") return Number(maybeValue) || 0;
        return null;
      } catch {
        return null;
      }
    };

    const startOfBucket = (date: Date, bucket: "day" | "week" | "month"): Date => {
      if (bucket === "month") return new Date(date.getFullYear(), date.getMonth(), 1);
      if (bucket === "week") {
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const day = d.getDay(); // 0=Sun..6=Sat
        const diff = (day + 6) % 7; // days since Monday
        d.setDate(d.getDate() - diff);
        return d;
      }
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    };

    const addBucket = (date: Date, bucket: "day" | "week" | "month"): Date => {
      if (bucket === "month") return new Date(date.getFullYear(), date.getMonth() + 1, 1);
      if (bucket === "week") return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7);
      return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    };

    const bucketKey = (date: Date, bucket: "day" | "week" | "month"): string => {
      if (bucket === "month") return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (bucket === "week") return dateKeyLocal(date);
      return dateKeyLocal(date);
    };

    const bucketLabel = (date: Date, bucket: "day" | "week" | "month"): string => {
      if (bucket === "month") return date.toLocaleDateString([], { month: "short", year: "2-digit" });
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    };

    const buildSeries = (
      rows: Array<{ created_at: string }>,
      start: Date,
      bucket: "day" | "week" | "month"
    ): AnalyticsPoint[] => {
      const end = new Date();
      const startBucket = startOfBucket(start, bucket);
      const endBucket = startOfBucket(end, bucket);

      const counts = new Map<string, number>();
      for (const row of rows) {
        const created = new Date(row.created_at);
        if (Number.isNaN(created.getTime())) continue;
        if (created < startBucket) continue;
        const key = bucketKey(startOfBucket(created, bucket), bucket);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      const points: AnalyticsPoint[] = [];
      for (let cursor = startBucket; cursor <= endBucket; cursor = addBucket(cursor, bucket)) {
        const key = bucketKey(cursor, bucket);
        points.push({ label: bucketLabel(cursor, bucket), value: counts.get(key) ?? 0 });
      }
      return points;
    };

    try {
      const [entitledMembers, rosterMembers, totalResources, newMembersWindow, resourcesAddedWindow] = await Promise.all([
        fetchEntitledMemberCount(),
        fetchCount(`${url}/rest/v1/community_memberships?select=id&community_id=eq.${communityId}`),
        fetchCount(`${url}/rest/v1/community_resources?select=id&community_id=eq.${communityId}`),
        sinceWindowIso
          ? fetchCount(
              `${url}/rest/v1/community_memberships?select=id&community_id=eq.${communityId}&created_at=gte.${encodeURIComponent(
                sinceWindowIso
              )}`
            )
          : null,
        sinceWindowIso
          ? fetchCount(
              `${url}/rest/v1/community_resources?select=id&community_id=eq.${communityId}&created_at=gte.${encodeURIComponent(
                sinceWindowIso
              )}`
            )
          : null,
      ]);

      const totalMembers = entitledMembers ?? rosterMembers;

      let memberJoinsWindow: Array<{ created_at: string }> = [];
      try {
        const joinQueryBase = `${url}/rest/v1/community_memberships?select=created_at&community_id=eq.${communityId}`;
        const joinQuery =
          sinceWindowIso !== null
            ? `${joinQueryBase}&created_at=gte.${encodeURIComponent(sinceWindowIso)}`
            : joinQueryBase;
        const response = await fetchWithSupabaseAuth(
          `${joinQuery}&order=created_at.asc&limit=5000`,
          {},
          session
        );
        if (response.ok) {
          memberJoinsWindow = (await response.json()) as Array<{ created_at: string }>;
        }
      } catch {
        // ignore
      }

      let activeMembersWindow: number | null = null;
      try {
        const threadId = await ensureCommunityChatThread(communityId, session);
        const messagesQueryBase = `${url}/rest/v1/messages?select=sender_id&thread_id=eq.${encodeURIComponent(
          threadId
        )}&role=eq.user`;
        const messagesQuery =
          sinceWindowIso !== null
            ? `${messagesQueryBase}&created_at=gte.${encodeURIComponent(sinceWindowIso)}`
            : messagesQueryBase;
        const response = await fetchWithSupabaseAuth(
          `${messagesQuery}&limit=5000`,
          {},
          session
        );
        if (response.ok) {
          const rows = (await response.json()) as Array<{ sender_id: string | null }>;
          const senders = new Set<string>();
          for (const row of rows) {
            const sender = (row.sender_id ?? "").trim();
            if (sender) senders.add(sender);
          }
          activeMembersWindow = senders.size;
        }
      } catch {
        // ignore
      }

      const retentionWindow =
        totalMembers && totalMembers > 0 && activeMembersWindow != null ? activeMembersWindow / totalMembers : null;

      setCommunityAnalyticsSummary({
        total_members: totalMembers,
        new_members_window: newMembersWindow ?? totalMembers,
        active_members_window: activeMembersWindow,
        retention_window: retentionWindow,
        total_resources: totalResources,
        resources_added_window: resourcesAddedWindow ?? totalResources,
      });
      setCommunityAnalyticsSeries(
        buildSeries(memberJoinsWindow, windowStart ?? new Date(now - 30 * 86400000), chartBucket)
      );

      try {
        const response = await fetchWithSupabaseAuth(
          `${url}/rest/v1/rpc/community_revenue_series`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ p_community_id: communityId, p_range: range }),
          },
          session
        );
        if (!response.ok) {
          const message = await readSupabaseError(response);
          if (message.includes("schema cache")) {
            setCommunityRevenueSeries(
              buildSeries([], windowStart ?? new Date(now - 30 * 86400000), chartBucket)
            );
            setCommunityRevenueMeta(null);
            setCommunityRevenueError(null);
          } else {
            setCommunityRevenueSeries([]);
            setCommunityRevenueMeta(null);
            setCommunityRevenueError(message);
          }
        } else {
          const rows = (await response.json()) as Array<{
            bucket_start: string;
            net_base_units: number | string | null;
            currency: string | null;
            currency_decimals: number | null;
          }>;
          const metaCurrency = rows[0]?.currency ?? null;
          const metaDecimals = rows[0]?.currency_decimals ?? null;
          if (metaCurrency && metaDecimals != null) {
            setCommunityRevenueMeta({ currency: metaCurrency, currency_decimals: metaDecimals });
          } else {
            setCommunityRevenueMeta(null);
          }
          setCommunityRevenueSeries(
            rows.map((row) => {
              const date = new Date(row.bucket_start);
              return {
                label: bucketLabel(date, chartBucket),
                value: Number(row.net_base_units ?? 0) || 0,
              };
            })
          );
        }
      } catch {
        setCommunityRevenueSeries([]);
        setCommunityRevenueMeta(null);
        setCommunityRevenueError("Failed to load revenue.");
      }
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to load analytics.";
      setCommunityAnalyticsError(message);
    } finally {
      setIsLoadingCommunityAnalytics(false);
    }
  }

  async function loadCommunityAutomations(communityId: string, session: SupabaseSession) {
    const url = getSupabaseUrl();
    if (!url) return;
    setIsLoadingAutomations(true);
    setAutomationError(null);
    setBrandosError(null);

    try {
      const [endpointsRes, deliveriesRes, brandosRes] = await Promise.all([
        fetchWithSupabaseAuth(
          `${url}/rest/v1/rpc/list_automation_endpoints`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ p_community_id: communityId }),
          },
          session,
        ),
        fetchWithSupabaseAuth(
          `${url}/rest/v1/rpc/list_automation_deliveries`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ p_community_id: communityId, p_limit: 50 }),
          },
          session,
        ),
        fetchWithSupabaseAuth(
          `${url}/rest/v1/rpc/get_brandos_connector`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ p_community_id: communityId }),
          },
          session,
        ),
      ]);

      if (!endpointsRes.ok) throw new Error(await readSupabaseError(endpointsRes));
      if (!deliveriesRes.ok) throw new Error(await readSupabaseError(deliveriesRes));

      const endpoints = (await endpointsRes.json()) as AutomationEndpoint[];
      const deliveries = (await deliveriesRes.json()) as AutomationDelivery[];
      setAutomationEndpoints(endpoints);
      setAutomationDeliveries(deliveries);

      if (brandosRes.ok) {
        const brandosRows = (await brandosRes.json()) as BrandosConnector[];
        setBrandosConnector(brandosRows[0] ?? null);
      } else {
        setBrandosConnector(null);
        setBrandosError(await readSupabaseError(brandosRes));
      }
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to load automations.";
      if (message.includes("schema cache")) {
        setAutomationError("Automations are still syncing. Refresh in a moment.");
      } else {
        setAutomationError(message);
      }
    } finally {
      setIsLoadingAutomations(false);
    }
  }

  function resetAutomationForm() {
    setAutomationNameInput("");
    setAutomationUrlInput("");
    setAutomationIsEnabledInput(true);
    setAutomationSelectedEventTypes(["community.member_joined", "community.member_left"]);
  }

  function openBrandosConnect() {
    setBrandosNotice(null);
    setBrandosError(null);
    setBrandosIdentifySecretInput("");
    setBrandosBaseUrlInput(brandosConnector?.base_url?.trim() || "https://app.brandos.com");
    setBrandosAccountIdInput(brandosConnector?.brandos_account_id?.trim() || "");
    setBrandosIsEnabledInput(brandosConnector?.is_enabled ?? true);
    setIsBrandosConnectOpen(true);
  }

  function closeBrandosConnect() {
    setIsBrandosConnectOpen(false);
    setBrandosIdentifySecretInput("");
  }

  async function handleSaveBrandosConnector() {
    if (!supabaseSession || !activeCommunityId) return;
    const url = getSupabaseUrl();
    if (!url) {
      setBrandosError("Missing Supabase URL.");
      return;
    }

    setBrandosNotice(null);
    setBrandosError(null);

    const baseUrl = brandosBaseUrlInput.trim();
    const accountId = brandosAccountIdInput.trim();
    const secret = brandosIdentifySecretInput.trim();

    if (!baseUrl) {
      setBrandosError("BrandOS base URL is required.");
      return;
    }
    if (!/^https?:\/\//.test(baseUrl)) {
      setBrandosError("BrandOS base URL must start with https://");
      return;
    }
    if (!accountId || !isUuid(accountId)) {
      setBrandosError("BrandOS account id must be a UUID.");
      return;
    }
    if (!secret) {
      setBrandosError("BrandOS identify secret is required.");
      return;
    }

    setIsSavingBrandosConnector(true);
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/upsert_brandos_connector`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            p_community_id: activeCommunityId,
            p_base_url: baseUrl,
            p_brandos_account_id: accountId,
            p_identify_secret: secret,
            p_is_enabled: brandosIsEnabledInput,
          }),
        },
        supabaseSession,
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      const rows = (await response.json()) as BrandosConnector[];
      setBrandosConnector(rows[0] ?? null);
      setBrandosNotice("BrandOS connected.");
      closeBrandosConnect();
      await loadCommunityAutomations(activeCommunityId, supabaseSession);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to connect BrandOS.";
      setBrandosError(message);
    } finally {
      setIsSavingBrandosConnector(false);
      setBrandosIdentifySecretInput("");
    }
  }

  async function handleDeleteBrandosConnector() {
    if (!supabaseSession || !activeCommunityId) return;
    const url = getSupabaseUrl();
    if (!url) return;
    setBrandosNotice(null);
    setBrandosError(null);
    setIsDeletingBrandosConnector(true);
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/delete_brandos_connector`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p_community_id: activeCommunityId }),
        },
        supabaseSession,
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      setBrandosConnector(null);
      setBrandosNotice("BrandOS disconnected.");
      closeBrandosConnect();
      await loadCommunityAutomations(activeCommunityId, supabaseSession);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to disconnect BrandOS.";
      setBrandosError(message);
    } finally {
      setIsDeletingBrandosConnector(false);
    }
  }

  async function handleCreateAutomationEndpoint() {
    if (!supabaseSession || !activeCommunityId) return;
    const url = getSupabaseUrl();
    if (!url) {
      setAutomationError("Missing Supabase URL.");
      return;
    }

    setAutomationError(null);
    setAutomationNotice(null);

    const name = automationNameInput.trim();
    const hookUrl = automationUrlInput.trim();
    if (!name) {
      setAutomationError("Name is required.");
      return;
    }
    if (!hookUrl) {
      setAutomationError("Webhook URL is required.");
      return;
    }
    if (automationSelectedEventTypes.length === 0) {
      setAutomationError("Select at least one event.");
      return;
    }

    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/create_automation_endpoint`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            p_community_id: activeCommunityId,
            p_name: name,
            p_url: hookUrl,
            p_event_types: automationSelectedEventTypes,
            p_include_email: false,
            p_is_enabled: automationIsEnabledInput,
          }),
        },
        supabaseSession,
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      const rows = (await response.json()) as Array<AutomationEndpoint & { signing_secret: string | null }>;
      const created = rows[0];
      if (!created?.id || !created.signing_secret) throw new Error("Failed to create webhook.");

      setAutomationRevealSecret({ label: `${created.name} signing secret`, secret: created.signing_secret });
      setAutomationNotice("Webhook created. Copy the signing secret now.");
      setIsAutomationCreateOpen(false);
      resetAutomationForm();
      await loadCommunityAutomations(activeCommunityId, supabaseSession);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to create webhook.";
      setAutomationError(message);
    }
  }

  async function handleToggleAutomationEndpointEnabled(endpoint: AutomationEndpoint) {
    if (!supabaseSession) return;
    const url = getSupabaseUrl();
    if (!url) return;
    setAutomationError(null);
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/update_automation_endpoint`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            p_endpoint_id: endpoint.id,
            p_is_enabled: !endpoint.is_enabled,
          }),
        },
        supabaseSession,
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      setAutomationEndpoints((prev) =>
        prev.map((row) => (row.id === endpoint.id ? { ...row, is_enabled: !endpoint.is_enabled } : row)),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update webhook.";
      setAutomationError(message);
    }
  }

  async function handleRotateAutomationEndpointSecret(endpoint: AutomationEndpoint) {
    if (!supabaseSession) return;
    const url = getSupabaseUrl();
    if (!url) return;
    setAutomationError(null);
    setAutomationNotice(null);
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/rotate_automation_endpoint_secret`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p_endpoint_id: endpoint.id }),
        },
        supabaseSession,
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      const rows = (await response.json()) as Array<{ signing_secret: string | null }>;
      const secret = rows[0]?.signing_secret ?? null;
      if (!secret) throw new Error("Failed to rotate secret.");
      setAutomationRevealSecret({ label: `${endpoint.name} signing secret`, secret });
      setAutomationNotice("Secret rotated. Update your webhook receiver.");
      if (activeCommunityId) await loadCommunityAutomations(activeCommunityId, supabaseSession);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to rotate secret.";
      setAutomationError(message);
    }
  }

  async function handleDeleteAutomationEndpoint(endpoint: AutomationEndpoint) {
    if (!supabaseSession) return;
    if (!confirm(`Delete webhook “${endpoint.name}”?`)) return;
    const url = getSupabaseUrl();
    if (!url) return;
    setAutomationError(null);
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/delete_automation_endpoint`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p_endpoint_id: endpoint.id }),
        },
        supabaseSession,
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      setAutomationEndpoints((prev) => prev.filter((row) => row.id !== endpoint.id));
      setAutomationNotice("Webhook deleted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete webhook.";
      setAutomationError(message);
    }
  }

  async function handleTestAutomationEndpoint(endpoint: AutomationEndpoint) {
    if (!supabaseSession) return;
    const url = getSupabaseUrl();
    if (!url) return;
    setAutomationError(null);
    setAutomationNotice(null);
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/functions/v1/automations_test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint_id: endpoint.id }),
        },
        supabaseSession,
      );
      const data = (await response.json().catch(() => null)) as
        | { ok: true; delivered: boolean; response_code: number | null; error: string | null }
        | { ok: false; error?: string }
        | null;
      if (!response.ok || !data || data.ok !== true) {
        throw new Error((data as { error?: string } | null)?.error ?? "Test failed.");
      }
      setAutomationNotice(
        data.delivered ? `Test delivered (${data.response_code ?? "ok"}).` : `Test failed: ${data.error ?? "unknown"}`,
      );
      if (activeCommunityId) await loadCommunityAutomations(activeCommunityId, supabaseSession);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Test failed.";
      setAutomationError(message);
    }
  }

  async function handleSetCommunityMemberRole(userId: string, role: string) {
    if (!supabaseSession || !activeCommunityId) return;
    const url = getSupabaseUrl();
    if (!url) return;
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/set_member_role`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            p_community_id: activeCommunityId,
            p_user_id: userId,
            p_role: role
          })
        },
        supabaseSession
      );
      if (!response.ok) {
        const message = await readSupabaseError(response);
        console.warn("Failed to set member role:", message);
      }
    } catch (error) {
      console.warn("Failed to set member role:", error);
    } finally {
      await loadCommunityMembers(activeCommunityId, supabaseSession, { includeStatus: canManageMembersActiveCommunity });
      await loadCommunities(supabaseSession);
      await loadCommunityAccess(activeCommunityId, supabaseSession);
    }
  }

  async function handleRemoveCommunityMember(userId: string) {
    if (!supabaseSession || !activeCommunityId) return;
    const url = getSupabaseUrl();
    if (!url) return;
    if (!window.confirm("Remove this member?")) return;
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/remove_member`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            p_community_id: activeCommunityId,
            p_user_id: userId
          })
        },
        supabaseSession
      );
      if (!response.ok) {
        const message = await readSupabaseError(response);
        console.warn("Failed to remove member:", message);
      }
    } catch (error) {
      console.warn("Failed to remove member:", error);
    } finally {
      await loadCommunityMembers(activeCommunityId, supabaseSession, { includeStatus: canManageMembersActiveCommunity });
      await loadCommunities(supabaseSession);
      await loadCommunityAccess(activeCommunityId, supabaseSession);
    }
  }

  async function loadCommunityInvites(communityId: string, session: SupabaseSession) {
    const url = getSupabaseUrl();
    if (!url) return;
    setIsLoadingCommunityInvites(true);
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/community_invites?select=id,community_id,code,max_uses,expires_at,revoked_at,created_by,created_at&community_id=eq.${communityId}&order=created_at.desc`,
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
    const slug = communitySettingsSlug.trim().toLowerCase();
    if (!name || !slug) {
      setCommunitySettingsError("Name and slug are required.");
      setIsSavingCommunitySettings(false);
      return;
    }
    if (!isValidSlug(slug)) {
      setCommunitySettingsError("Slug must be 3–32 characters (letters, numbers, hyphens).");
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
        const parsePriceBaseUnits = (raw: string): number | null => {
          const text = raw.trim();
          if (!text) return null;
          const parsed = Number(text.replace(/[^0-9.]/g, ""));
          if (!Number.isFinite(parsed) || parsed <= 0) {
            throw new Error("Prices must be positive numbers.");
          }
          return Math.round(parsed * 100);
        };

        const monthlyEnabled =
          communitySettingsPricingMode === "monthly" || communitySettingsPricingMode === "both";
        const yearlyEnabled =
          communitySettingsPricingMode === "yearly" || communitySettingsPricingMode === "both";
        const monthlyAmount = monthlyEnabled ? parsePriceBaseUnits(communitySettingsPriceUsdMonthly) : null;
        const yearlyAmount = yearlyEnabled ? parsePriceBaseUnits(communitySettingsPriceUsdYearly) : null;
        if (monthlyEnabled && monthlyAmount == null) throw new Error("Enter a monthly price.");
        if (yearlyEnabled && yearlyAmount == null) throw new Error("Enter an annual price.");

        const response = await fetchWithSupabaseAuth(
          `${url}/rest/v1/rpc/save_community_settings`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              p_community_id: activeCommunityId,
              p_name: name,
              p_slug: slug,
              p_description: communitySettingsDescription.trim() || null,
              p_avatar_url: communitySettingsAvatarUrl?.trim() || null,
              p_banner_url: communitySettingsBannerUrl?.trim() || null,
              p_visibility: visibility,
              p_monthly_amount_base_units: monthlyAmount,
              p_yearly_amount_base_units: yearlyAmount,
              p_currency: "usd",
              p_currency_decimals: 2,
            }),
          },
          supabaseSession
        );
        if (!response.ok) throw new Error(await readSupabaseError(response));
        const rows = (await response.json()) as Array<{
          community_id: string;
          name: string;
          slug: string;
          description: string | null;
          avatar_url: string | null;
          banner_url: string | null;
          visibility: string;
          updated_at: string;
          monthly_plan_id: string | null;
          yearly_plan_id: string | null;
        }>;
        const result = rows[0];
        if (result?.community_id) {
          setCommunities((prev) =>
            prev.map((c) =>
              c.id === result.community_id
                ? {
                    ...c,
                    name: result.name,
                    slug: result.slug,
                    description: result.description,
                    avatar_url: result.avatar_url,
                    banner_url: result.banner_url,
                    visibility: result.visibility,
                    updated_at: result.updated_at,
                  }
                : c
            )
          );
	          setCommunitySettingsMonthlyPlanId(result.monthly_plan_id);
	          setCommunitySettingsYearlyPlanId(result.yearly_plan_id);
	          communitySettingsDirtyRef.current = false;
	          communityPricingDirtyRef.current = false;
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

  function openDeleteCommunityModal() {
    setDeleteCommunityError(null);
    setDeleteCommunityNameInput("");
    setDeleteCommunityConfirmInput("");
    setShowDeleteCommunityModal(true);
  }

  function closeDeleteCommunityModal() {
    setShowDeleteCommunityModal(false);
    setDeleteCommunityError(null);
    setDeleteCommunityNameInput("");
    setDeleteCommunityConfirmInput("");
    setIsDeletingCommunity(false);
  }

  async function handleConfirmDeleteCommunity() {
    if (!supabaseSession || !activeCommunityId) return;
    const url = getSupabaseUrl();
    if (!url) return;
    setDeleteCommunityError(null);
    setIsDeletingCommunity(true);
    try {
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/communities?id=eq.${activeCommunityId}`,
        { method: "DELETE" },
        supabaseSession
      );
      if (!response.ok) throw new Error(await readSupabaseError(response));
      const deletedId = activeCommunityId;
      setShowDeleteCommunityModal(false);
      setActiveCommunityId(null);
      setActivePage("workspace");
      setActiveView("home");
      setCommunityTab("chat");
      setCommunities((prev) => prev.filter((c) => c.id !== deletedId));
      setCommunityRoleById((prev) => {
        const next = { ...prev };
        delete next[deletedId];
        return next;
      });
      await loadCommunities(supabaseSession);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to delete community.";
      setDeleteCommunityError(message);
    } finally {
      setIsDeletingCommunity(false);
    }
  }

  async function handleCommunityAvatarUpload(file: File | null) {
    if (!file) return;
    try {
      const dataUrl = await readAvatarFileAsSquareDataUrl(file, 128);
      if (dataUrl.length > MAX_WEB_IMAGE_DATA_URL_CHARS) {
        throw new Error("Avatar image is too large. Try a smaller image.");
      }
      setCommunitySettingsAvatarUrl(dataUrl);
      markCommunitySettingsDirty();
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to read avatar file.";
      setCommunitySettingsError(message);
    }
  }

  async function handleCommunityBannerUpload(file: File | null) {
    if (!file) return;
    if (!isLikelyImageFile(file)) {
      setCommunitySettingsBannerUploadError("Banner must be an image file.");
      return;
    }
    setCommunitySettingsBannerUploadError(null);
    setIsProcessingCommunitySettingsBanner(true);
    try {
      const dataUrl = await readBannerFileAsWideDataUrlWithinLimit(file, MAX_WEB_IMAGE_DATA_URL_CHARS);
      setCommunitySettingsBannerUrl(dataUrl);
      markCommunitySettingsDirty();
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to read banner file.";
      setCommunitySettingsBannerUploadError(message);
    } finally {
      setIsProcessingCommunitySettingsBanner(false);
    }
  }

  async function handleProfileAvatarUpload(file: File | null) {
    if (!file) return;
    try {
      const dataUrl = await readAvatarFileAsSquareDataUrl(file, 128);
      setProfileAvatarUrl(dataUrl);
    } catch (error) {
      const message =
        typeof error === "string" ? error : error instanceof Error ? error.message : "Failed to load image.";
      setAuthError(message);
    }
  }

  function handleProfileAvatarDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsProfileAvatarDragOver(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    if (file) void handleProfileAvatarUpload(file);
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

  useEffect(() => {
    const first = communityAgentDraftLanding.tabs[0]?.id ?? "";
    setCommunityAgentPreviewTabId((prev) => {
      if (!prev) return first;
      if (communityAgentDraftLanding.tabs.some((tab) => tab.id === prev)) return prev;
      return first;
    });
  }, [communityAgentDraftLanding]);

  const visibleThreads = useMemo(() => threads.filter((thread) => thread.last_seq > 0), [threads]);
  const normalizedThreadSearch = threadSearchQuery.trim().toLowerCase();
  const threadSearchResults = useMemo(() => {
    if (!normalizedThreadSearch) return visibleThreads;
    return visibleThreads.filter((thread) => {
      const title = (thread.title ?? "").trim() || "Untitled thread";
      const communityName = thread.community_id
        ? (communities.find((c) => c.id === thread.community_id)?.name ?? "")
        : "";
      const haystack = `${title} ${communityName}`.toLowerCase();
      return haystack.includes(normalizedThreadSearch);
    });
  }, [communities, normalizedThreadSearch, visibleThreads]);

	  const enabledModels = useMemo(() => modelToggles.filter((toggle) => toggle.enabled), [modelToggles]);

	  const guestModelLabel = useMemo(() => {
	    const label = (GUEST_MODEL_LABELS[guestModelId] ?? "").trim();
	    return label || guestModelId || "Model";
	  }, [guestModelId]);

	  const selectedModelId = useMemo(() => {
	    const threadModel = (activeThread?.model_id ?? "").trim();
	    if (threadModel && modelToggles.some((toggle) => toggle.id === threadModel)) return threadModel;

    const stored = (activeModelId ?? "").trim();
    if (stored && modelToggles.some((toggle) => toggle.id === stored)) return stored;

    return (
      enabledModels.find((toggle) => toggle.id === DEFAULT_ACTIVE_MODEL_ID)?.id ??
      enabledModels[0]?.id ??
      modelToggles[0]?.id ??
      ""
    );
  }, [activeThread?.model_id, activeModelId, enabledModels, modelToggles]);

	  const selectedModelLabel = useMemo(() => {
	    if (!selectedModelId) return "Model";
	    return enabledModels.find((toggle) => toggle.id === selectedModelId)?.label ?? selectedModelId;
	  }, [enabledModels, selectedModelId]);

	  const activeModelLabel = supabaseSession ? selectedModelLabel : guestModelLabel;

	  const favoriteSet = useMemo(() => new Set(modelFavorites), [modelFavorites]);

	  const toggleFavoriteModel = (modelId: string) => {
	    const id = modelId.trim();
	    if (!id) return;
	    setModelFavorites((prev) => {
	      const set = new Set(prev);
	      if (set.has(id)) set.delete(id);
	      else set.add(id);
	      return Array.from(set).slice(0, 50);
	    });
	  };

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

		  const effectiveTier = ((builderBillingStatus?.builder_tier ?? "free") as string).toLowerCase();
		  const hasPaidAccess = Boolean(supabaseSession) && (effectiveTier === "builder" || effectiveTier === "pro");
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

		  const visiblePickerModels = useMemo(() => {
		    const q = modelPickerQuery.trim().toLowerCase();
		    const wantsFavorites = modelPickerSection === "favorites";
		    const filtered = curatedPickerModels.filter((m) => {
		      if (wantsFavorites && !favoriteSet.has(m.id)) return false;
		      if (!wantsFavorites && modelPickerSection !== "all" && m.section !== modelPickerSection) return false;
		      if (!q) return true;
		      return m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q);
		    });

		    const sectionOrder: Record<ModelSectionId, number> = {
		      favorites: 0,
		      all: 1,
		      free: 2,
		      openai: 3,
		      anthropic: 4,
		      google: 5,
		      "x-ai": 6,
		      openrouter: 7,
		    };

		    return filtered.slice().sort((a, b) => {
		      const af = favoriteSet.has(a.id) ? 0 : 1;
		      const bf = favoriteSet.has(b.id) ? 0 : 1;
		      if (af !== bf) return af - bf;
		      const as = sectionOrder[a.section] ?? 99;
		      const bs = sectionOrder[b.section] ?? 99;
		      if (as !== bs) return as - bs;
		      return a.label.localeCompare(b.label);
		    });
		  }, [curatedPickerModels, favoriteSet, modelPickerQuery, modelPickerSection]);

		  const canSelectPickerModel = (model: CuratedPickerModel): boolean => {
		    if (!supabaseSession) return model.access === "guest";
		    if (model.access === "guest") return false;
		    if (!modelToggles.some((toggle) => toggle.id === model.id)) return false;
		    if (model.access === "paid") return hasPaidAccess;
		    return true;
		  };

		  const openModelPicker = () => {
		    setModelPickerNotice(null);
		    setModelPickerQuery("");
		    if (!supabaseSession) {
		      setModelPickerSection("free");
		    } else if (favoriteSet.size > 0) {
		      setModelPickerSection("favorites");
		    } else {
		      setModelPickerSection(inferProviderSection(selectedModelId || DEFAULT_ACTIVE_MODEL_ID));
		    }
		    setIsModelPickerOpen(true);
		  };

		  const closeModelPicker = () => {
		    setIsModelPickerOpen(false);
		    setModelPickerNotice(null);
		    setModelPickerQuery("");
		  };

		  const handleSelectPickerModel = (model: CuratedPickerModel) => {
		    if (!canSelectPickerModel(model)) {
		      if (supabaseSession && !modelToggles.some((toggle) => toggle.id === model.id)) {
		        setModelPickerNotice("These models are coming next (backend not wired yet).");
		        return;
		      }
		      if (!supabaseSession && model.access !== "guest") {
		        setModelPickerNotice("Sign in to unlock more models.");
		      } else if (supabaseSession && model.access === "paid" && !hasPaidAccess) {
		        setModelPickerNotice("Upgrade to unlock OpenRouter models (payments coming soon).");
		      } else if (supabaseSession && model.access === "guest") {
		        setModelPickerNotice("Guest demo models are available only when signed out.");
		      } else {
		        setModelPickerNotice("This model is not available yet.");
		      }
		      return;
		    }

		    setModelPickerNotice(null);
		    if (!supabaseSession) {
		      setGuestModelId(model.id);
		      try {
		        const storage = loadGuestThreadStorage();
		        storeGuestThreadStorage({ ...storage, model_id: model.id });
		      } catch {
		        // ignore
		      }
		      closeModelPicker();
		      workspaceAskInputRef.current?.focus();
		      return;
		    }

		    setActiveModelId(model.id);
		    if (activeThreadId) {
		      void updateThreadModel(activeThreadId, model.id, supabaseSession);
		    }
		    closeModelPicker();
		    workspaceAskInputRef.current?.focus();
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

	  const showCommunityRail = true;
	  const showCommunityNav = activePage === "community";
	  const isWorkspaceSettings = activePage === "workspace" && activeView === "settings";
	  const sessionsDrawerEnabled = Boolean(supabaseSession) && activePage === "workspace" && !isWorkspaceSettings;
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

  if (publicRoute.kind !== "app") {
    const showSignIn = !supabaseSession;
    const selectedPublicCommunityPlan =
      publicCommunityPlans.find((plan) => plan.billing_period === selectedPublicCommunityBillingPeriod) ??
      publicCommunityPlans.find((plan) => plan.billing_period === "monthly") ??
      publicCommunityPlans.find((plan) => plan.billing_period === "yearly") ??
      publicCommunityPlans[0] ??
      null;
    const publicVisibility = (publicCommunity?.visibility ?? "").trim();
    const publicVisibilityLabel =
      publicVisibility === "public" ? "Public" : publicVisibility === "unlisted" ? "Unlisted" : "Private";
    const publicVisibilityHint =
      publicVisibility === "public"
        ? "Preview is available. Join to participate."
        : publicVisibility === "unlisted"
          ? "Not listed in discovery. Share the link when you're ready."
          : "Discoverable, but chat is gated until you join.";
    const canJoinForFree = Boolean(publicCommunity && publicVisibility === "public" && !selectedPublicCommunityPlan);
    const canJoinWithCheckout = Boolean(publicCommunity && selectedPublicCommunityPlan);
    const pendingToken =
      (checkoutClaimToken ?? (publicRoute.kind === "claim" ? publicRoute.token : "")).trim() ||
      readPendingPurchaseClaimToken();

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
              <button className="secondary" type="button" onClick={handleSignIn}>
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
	                      (!canJoinWithCheckout && !canJoinForFree)
	                    }
	                    onClick={() => {
	                      if (!publicCommunity) return;
	                      if (selectedPublicCommunityPlan) {
	                        void startCheckoutForPlan(
	                          publicCommunity.slug,
	                          selectedPublicCommunityPlan.billing_period,
	                          `/c/${encodeURIComponent(publicCommunity.slug)}`,
	                        );
	                        return;
	                      }
	                      if (publicCommunity.visibility !== "public") return;
	                      void joinPublicCommunity({ communitySlug: publicCommunity.slug });
	                    }}
	                  >
	                    {isJoiningPublicCommunity
	                      ? "Joining…"
	                      : selectedPublicCommunityPlan
	                        ? "Join now"
	                        : publicCommunity?.visibility === "public"
	                          ? "Join free"
	                          : "Invite only"}
	                  </button>
	                </div>
	              </div>
              {isLoadingPublicCommunity && <div className="chat-empty">Loading…</div>}
              {!isLoadingPublicCommunity && publicCommunityError && (
                <div className="auth-error">{publicCommunityError}</div>
              )}
              {publicJoinError && <div className="auth-error">{publicJoinError}</div>}
              {checkoutError && <div className="auth-error">{checkoutError}</div>}
	              {showSignIn && publicCommunity && canJoinForFree && (
	                <div className="chat-empty">
	                  <div className="discover-empty-text">Or join with a magic link:</div>
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
                        storePendingPublicJoin(publicCommunity.slug, aid);
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
	                {publicCommunity?.visibility === "public" ? (
	                  <>
	                    {isLoadingPublicChatPreview && <div className="chat-empty">Loading preview…</div>}
	                    {!isLoadingPublicChatPreview && publicChatPreviewError && (
	                      <div className="auth-error">{publicChatPreviewError}</div>
	                    )}
	                    {!isLoadingPublicChatPreview && !publicChatPreviewError && publicChatPreviewMessages.length === 0 && (
	                      <div className="discover-empty">
	                        <div className="discover-empty-title">Preview chat</div>
	                        <div className="discover-empty-text">No messages yet.</div>
	                      </div>
	                    )}
	                    {!isLoadingPublicChatPreview &&
	                      !publicChatPreviewError &&
	                      publicChatPreviewMessages.length > 0 &&
	                      publicChatPreviewMessages.map((msg) => {
	                        const senderLabel = msg.sender_display_name ?? "Member";
	                        const avatarColor = getAvatarColor(msg.sender_key);
	                        return (
	                          <div key={msg.seq} className="chat-message">
	                            <div className="chat-avatar" style={{ backgroundColor: avatarColor }} title={senderLabel}>
	                              {msg.sender_avatar_url ? (
	                                <img src={msg.sender_avatar_url} alt={senderLabel} />
	                              ) : (
	                                <span>{getInitials(senderLabel)}</span>
	                              )}
	                            </div>
	                            <div className="chat-content">
	                              <div className="chat-header">
	                                <span className="chat-sender">{senderLabel}</span>
	                                <span className="chat-time">{formatChatTime(msg.created_at)}</span>
	                              </div>
	                                <div className="chat-body">{renderTextWithLinks(msg.body)}</div>
	                              </div>
	                            </div>
	                          );
	                      })}
	                    <div className="discover-empty" style={{ marginTop: 18 }}>
	                      <div className="discover-empty-title">Powered by Arx</div>
	                      <div className="discover-empty-text">This is a read-only preview. Join to participate.</div>
	                      <button className="secondary" type="button" onClick={() => navigateTo("/claim")}>
	                        Paid but can't access? Recover
	                      </button>
	                    </div>
	                  </>
	                ) : (
	                  <div className="discover-empty">
	                    <div className="discover-empty-title">Powered by Arx</div>
	                    <div className="discover-empty-text">
	                      {publicCommunity
	                        ? publicCommunity.visibility === "unlisted"
	                          ? "This community is unlisted. Join to enter."
	                          : "This community is private. Join to enter."
	                        : "Join to access chat, resources, and the community copilot."}
	                    </div>
	                    <button className="secondary" type="button" onClick={() => navigateTo("/claim")}>
	                      Paid but can't access? Recover
	                    </button>
	                  </div>
	                )}
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
                        handleSignIn();
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
	                      onClick={() => setCheckoutFinalizeNonce((prev) => prev + 1)}
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
      </div>
    );
  }

  const showHeaderIslands = activePage === "workspace" && activeView === "home";
  const communityHomeButton = (
    <button
      className={`icon-button community-btn${activePage === "community" ? " active" : ""}`}
      onClick={() => {
        const nextPage: AppPage = communities.length === 0 ? "discover" : "community";
        const nextCommunityId = nextPage === "community" ? activeCommunityId ?? communities[0]?.id ?? null : activeCommunityId;
        const willChange =
          activeView !== "home" ||
          activePage !== nextPage ||
          (nextPage === "community" &&
            (communityTab !== "chat" || (activeCommunityId ?? null) !== nextCommunityId));
        if (willChange) pushNavSnapshot();
        setActiveView("home");
        if (communities.length === 0) {
          setActivePage("discover");
          return;
        }
        setActivePage("community");
        setCommunityTab("chat");
        setUnreadCount(0);
        setActiveCommunityId((prev) => prev ?? communities[0]?.id ?? null);
      }}
      aria-label="Community"
      title={activeCommunity?.name ?? "Community"}
      type="button"
    >
      {activeCommunity ? (
        activeCommunity.avatar_url ? (
          <img
            className="community-btn-avatar"
            src={activeCommunity.avatar_url}
            alt={activeCommunity.name}
            loading="lazy"
          />
        ) : (
          <span className="community-btn-initials">{communityInitials(activeCommunity.name)}</span>
        )
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )}
      {unreadCount > 0 && activePage !== "community" && (
        <span className="unread-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
      )}
    </button>
  );

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
			                    if (!supabaseSession) {
			                      setThreadError(null);
			                      setMessageInput("");
			                      setWorkspaceAttachments([]);
			                      if (activeThreadId !== null) setActiveThreadId(null);
			                      setWorkspaceWantsNewChatMode(true);
			                      storeGuestThreadStorage({ v: 1, model_id: guestModelId, messages: [] });
			                      setThreadMessages([]);
			                      workspaceAskInputRef.current?.focus();
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
                          setWorkspaceWantsNewChatMode(false);
                          setActiveCommunityId(thread.community_id ?? null);
                          setActiveThreadId(thread.id);
                        }}
                      >
                        <div className="session-content">
                          <div className="session-title">{(thread.title ?? "").trim() || "Untitled thread"}</div>
                          <div className="session-preview">
                            {thread.id === activeThreadId && activeThread ? "Open" : ""}
                          </div>
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
                              setWorkspaceWantsNewChatMode(false);
                              setActiveCommunityId(thread.community_id ?? null);
                              setActiveThreadId(thread.id);
                            }}
                          >
                            <div className="session-content">
                              <div className="session-title">{(thread.title ?? "").trim() || "Untitled thread"}</div>
                              <div className="session-preview">
                                {thread.id === activeThreadId && activeThread ? "Open" : ""}
                              </div>
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
	                        const session = supabaseSession;
	                        if (session && activeThreadId) {
	                          void requestWorkspaceThreadLens({
	                            threadId: activeThreadId,
	                            communityId: community.id,
	                            communityName: community.name,
	                            session,
	                          });
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
	              {(["account", "models", "execution", "memory", "appearance"] as const).map((page) => (
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
	                      title={activeCommunityOwnerIsPro === false ? "AI Agent (Pro)" : "AI Agent"}
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
	                    {canViewActiveCommunityAutomations && (
	                      <button
	                        className={communityTab === "automations" ? "nav-item active" : "nav-item"}
	                        type="button"
	                        onClick={() => {
	                          setActivePage("community");
	                          setActiveView("home");
	                          setCommunityTab("automations");
	                        }}
	                        title="Automations"
	                      >
	                        <span className="nav-icon">
	                          <svg viewBox="0 0 24 24">
	                            <circle cx="6" cy="6" r="2" />
	                            <circle cx="18" cy="6" r="2" />
	                            <circle cx="12" cy="18" r="2" />
	                            <path d="M8 6h8" />
	                            <path d="M7.4 7.4l3.7 8.1" />
	                            <path d="M16.6 7.4l-3.7 8.1" />
	                          </svg>
	                        </span>
	                        Automations
	                      </button>
	                    )}
	                  </>
	                )}
	              </>
	            )}
          </aside>
        )}

        <main className={`workspace${activePage !== "workspace" ? " community-mode" : ""}`}>
          {supabaseSession && pendingPurchaseClaims.length > 0 && !isPendingPurchasesBannerDismissed && (
            <div className="pending-purchase-banner" role="status">
              <div className="pending-purchase-banner-copy">
                <div className="pending-purchase-banner-title">Pending community access</div>
                <div className="pending-purchase-banner-subtitle">
                  {pendingPurchaseClaims.length === 1
                    ? `You paid for ${
                        pendingPurchaseClaims[0]?.community_name ??
                        pendingPurchaseClaims[0]?.community_slug ??
                        "a community"
                      } but didn’t finish joining.`
                    : `You have ${pendingPurchaseClaims.length} communities waiting to be claimed.`}
                </div>
              </div>
              <div className="pending-purchase-banner-actions">
                <button
                  type="button"
                  onClick={() => void redeemPendingPurchases()}
                  disabled={isRedeemingPendingPurchases}
                >
                  {isRedeemingPendingPurchases ? "Claiming…" : "Claim access"}
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => setIsPendingPurchasesBannerDismissed(true)}
                  disabled={isRedeemingPendingPurchases}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
	          {activeView === "settings" ? (
	            <div className="settings-panel">
	              {settingsPage === "account" && (
	                <>
	                  <div className="settings-section">
	                    <div className="settings-section-title">Profile</div>
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
                    <div className="settings-section-title">Account</div>
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
                        <button type="button" onClick={handleSignIn}>
                          Sign in
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
                        const tierLabel = tier === "pro" ? "Builder Pro" : tier === "builder" ? "Builder" : "Free";
                        const isArxOwner = (supabaseSession.user.email ?? "").toLowerCase() === ARX_OWNER_EMAIL;
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
                                      disabled={isDevSettingBuilderTier || tier === "pro"}
                                      onClick={() => void handleDevSetBuilderTier("pro")}
                                    >
                                      Pro
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
                      <div className="settings-section-title">Your communities</div>
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
                        <div className="settings-section-title">Pending purchases</div>
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

              {settingsPage === "models" && (
                <>
		                  <div className="settings-section">
		                    <div className="settings-section-title">API Keys</div>
		                    <div className="settings-section-desc">
		                      Optional: add provider API keys for BYOK. When your Arx AI quota runs out, you&apos;ll be prompted before using your keys.
		                    </div>
                      {providerKeys.map((provider) => (
                        <div key={provider.id} style={{ marginTop: 12 }}>
                          <div className="model-note" style={{ marginBottom: 8 }}>
                            {provider.label}
                          </div>
                          <div className="key-row">
                            <input
                              type="password"
                              value={provider.inputValue}
                              placeholder={provider.hasKey ? "Key saved" : `Enter ${provider.label} API key`}
                              onChange={(event) => {
                                const value = event.target.value;
                                setProviderKeys((prev) =>
                                  prev.map((item) => (item.id === provider.id ? { ...item, inputValue: value } : item)),
                                );
                              }}
                            />
                            <button type="button" onClick={() => void handleSaveProviderKey(provider.id)}>
                              Save
                            </button>
                            <button
                              className="secondary"
                              type="button"
                              onClick={() => void handleClearProviderKey(provider.id)}
                            >
                              Clear
                            </button>
                          </div>
                          {provider.error && <div className="key-error">{provider.error}</div>}
                        </div>
                      ))}
	                  </div>

	                  <div className="settings-section">
	                    <div className="settings-section-title">System prompt</div>
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

	                  <div className="settings-section">
	                    <div className="settings-section-title">Available Models</div>
	                    <div className="settings-section-desc">Select which models to enable</div>
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
                    <div className="settings-section-title">Desktop execution</div>
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

              {settingsPage === "memory" && (
                <>
                  <div className="panel-title">Memory</div>
                  <div className="memory-panel">
                    {personalMemoryError &&
                      (builderBillingStatus?.builder_tier ?? "free").toLowerCase() !== "free" && (
                        <div className="memory-error">{personalMemoryError}</div>
                      )}
                    {exportError && <div className="auth-error">{exportError}</div>}

		                    <div className="settings-section">
		                      <div className="settings-section-title">Export</div>
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
                      <div className="settings-section-title">Local Cache</div>
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
                      const hasPersonalMemoryAccess = tier === "builder" || tier === "pro";
                      if (!supabaseSession) return null;
                      if (!hasPersonalMemoryAccess) {
                        return (
                          <div className="settings-section">
                            <div className="settings-section-title">Personal memory</div>
                            <div className="settings-section-desc">
                              Personal memory is included with Starter and Pro.
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
                            <div className="settings-section-title">Memory behavior</div>
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
                          { id: "dark-warm", label: "Dark (Warm)", description: "Warm obsidian + champagne gold", disabled: false }
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
	                                <div className="web-download-title">Download desktop app</div>
	                                <div className="web-download-subtitle">Get access to full agents on desktop.</div>
	                                <div className="web-download-actions">
	                                  <button
	                                    className="secondary web-download-button"
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
                        const hasContext =
                          memoryUsed.length > 0 || historyUsed.length > 0 || memorySuggestions.length > 0 || memoryAdded.length > 0;
                        const inferenceSource = !isUser ? extractInferenceSourceFromContent(message.content_json) : null;
	                      const modelLabel = !isUser
	                        ? formatModelSignature(message.model_id ?? activeThread?.model_id ?? null, inferenceSource)
	                        : null;
	                      return (
	                        <div
	                          key={message.id}
	                          className={isUser ? "message-item user" : "message-item assistant"}
	                        >
	                          <div className="message-text">{isUser ? textContent : renderMarkdown(textContent)}</div>
                            {attachments.length > 0 && (
                              <div className="attachments-preview message-attachments-preview">
                                {attachments.map((att) => {
                                  const openUrl =
                                    att.type === "image" && typeof att.data_url === "string" && att.data_url.startsWith("data:image/")
                                      ? att.data_url
                                      : null;
                                  return (
                                    <button
                                      key={att.id}
                                      type="button"
                                      className="attachment-item attachment-chip"
                                      onClick={() => {
                                        if (!openUrl) return;
                                        window.open(openUrl, "_blank", "noopener,noreferrer");
                                      }}
                                      disabled={!openUrl}
                                      title={att.name}
                                    >
                                      {att.type === "image" && openUrl ? (
                                        <img src={openUrl} alt={att.name} className="attachment-thumb" />
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
                                      <span className="attachment-name">{att.name}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
	                          {!isUser && (
	                            <div className="message-footer">
	                              <button
	                                className={`message-copy-btn${copiedMessageId === message.id ? " copied" : ""}`}
	                                type="button"
	                                onClick={() => void handleCopyMessage(message.id, textContent)}
	                                title="Copy"
	                                aria-label="Copy"
	                              >
	                                <svg viewBox="0 0 24 24" aria-hidden="true">
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
	                              <button
	                                className="message-copy-btn"
	                                type="button"
	                                disabled={!hasContext}
	                                onClick={() => {
	                                  if (!hasContext) return;
	                                  setContextModal({
	                                    memory_used: memoryUsed,
	                                    history_used: historyUsed,
	                                    memory_suggestions: memorySuggestions,
	                                    memory_added: memoryAdded,
	                                  });
	                                }}
	                                title={!hasContext ? "No memory/context" : "Memory & context"}
	                                aria-label={!hasContext ? "No memory/context" : "Memory & context"}
	                              >
	                                <svg viewBox="0 0 24 24" aria-hidden="true">
	                                  <path d="M9 3v2" />
	                                  <path d="M15 3v2" />
	                                  <path d="M9 19v2" />
	                                  <path d="M15 19v2" />
	                                  <path d="M3 9h2" />
	                                  <path d="M3 15h2" />
	                                  <path d="M19 9h2" />
	                                  <path d="M19 15h2" />
	                                  <rect x="7" y="7" width="10" height="10" rx="2" />
	                                  <path d="M10 10h4" />
	                                  <path d="M10 14h4" />
	                                </svg>
	                              </button>
                                {canRegenerateLastThreadTurn && message.id === lastThreadAssistantMessageId && (
                                  <button
                                    className="message-copy-btn"
                                    type="button"
                                    onClick={() => void regenerateLastTurn()}
                                    title="Regenerate"
                                    aria-label="Regenerate"
                                  >
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                      <path d="M21 12a9 9 0 1 1-3-6.7" />
                                      <path d="M21 3v6h-6" />
                                    </svg>
                                  </button>
                                )}
	                              {modelLabel && <span className="message-meta">{modelLabel}</span>}
	                            </div>
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
                                  {renderMarkdown(streamingContent)}
                                  <span className="streaming-caret" aria-hidden="true" />
                                </>
                              ) : (
                                <span className="streaming-placeholder">
                                  Thinking
                                  <span className="running-dots" aria-hidden="true">
                                    <span />
                                    <span />
                                    <span />
                                  </span>
                                </span>
                              )}
                            </div>
                            {streamingMeta && (
                              <div className="message-footer">
                                <button
                                  className="message-copy-btn"
                                  type="button"
                                  disabled={
                                    (!streamingMeta.memory_used || streamingMeta.memory_used.length === 0) &&
                                    (!streamingMeta.history_used || streamingMeta.history_used.length === 0)
                                  }
                                  onClick={() => {
                                    const used = streamingMeta.memory_used ?? [];
                                    const history = streamingMeta.history_used ?? [];
                                    if (used.length === 0 && history.length === 0) return;
                                    setContextModal({
                                      memory_used: used,
                                      history_used: history,
                                      memory_suggestions: [],
                                      memory_added: [],
                                    });
                                  }}
                                  title={
                                    (streamingMeta.memory_used && streamingMeta.memory_used.length > 0) ||
                                    (streamingMeta.history_used && streamingMeta.history_used.length > 0)
                                      ? "Memory & context"
                                      : "No memory/context"
                                  }
                                  aria-label={
                                    (streamingMeta.memory_used && streamingMeta.memory_used.length > 0) ||
                                    (streamingMeta.history_used && streamingMeta.history_used.length > 0)
                                      ? "Memory & context"
                                      : "No memory/context"
                                  }
                                >
                                  <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M9 3v2" />
                                    <path d="M15 3v2" />
                                    <path d="M9 19v2" />
                                    <path d="M15 19v2" />
                                    <path d="M3 9h2" />
                                    <path d="M3 15h2" />
                                    <path d="M19 9h2" />
                                    <path d="M19 15h2" />
                                    <rect x="7" y="7" width="10" height="10" rx="2" />
                                    <path d="M10 10h4" />
                                    <path d="M10 14h4" />
                                  </svg>
                                </button>
                                <span className="message-meta">
                                  {formatModelSignature(
                                    streamingMeta.model_id ?? activeThread?.model_id ?? null,
                                    streamingMeta.inference_source ?? null,
                                  )}
                                </span>
                              </div>
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
	                          className="model-picker-overlay"
	                          role="dialog"
	                          aria-modal="true"
	                          aria-label="Choose a model"
	                          onMouseDown={(event) => {
	                            if (event.target === event.currentTarget) closeModelPicker();
	                          }}
	                        >
	                          <div className="model-picker-modal" onMouseDown={(event) => event.stopPropagation()}>
	                            <div className="model-picker-top">
	                              <div className="model-picker-cta">
	                                <div className="model-picker-cta-title">
	                                  {hasPaidAccess ? "All models unlocked" : "Unlock all models"}
	                                </div>
	                                <div className="model-picker-cta-subtitle">
	                                  {hasPaidAccess ? "Thanks for supporting Arx." : "Upgrade (payments coming soon)"}
	                                </div>
	                              </div>
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

	                            <div className="model-picker-search-row">
	                              <input
	                                ref={modelPickerSearchRef}
	                                className="model-picker-search"
	                                type="text"
	                                placeholder="Search models…"
	                                value={modelPickerQuery}
	                                onChange={(event) => setModelPickerQuery(event.target.value)}
	                              />
	                            </div>

	                            {modelPickerNotice && <div className="model-picker-notice">{modelPickerNotice}</div>}

	                            <div className="model-picker-body">
	                              <nav className="model-picker-nav" aria-label="Model sections">
	                                {(
	                                  [
	                                    { id: "favorites", label: "★" },
	                                    { id: "all", label: "All" },
	                                    { id: "free", label: "Free" },
	                                    { id: "openai", label: "OpenAI" },
	                                    { id: "anthropic", label: "Anthropic" },
	                                    { id: "google", label: "Google" },
	                                    { id: "x-ai", label: "xAI" },
	                                    { id: "openrouter", label: "OpenRouter" },
	                                  ] as Array<{ id: ModelSectionId; label: string }>
	                                ).map((section) => (
	                                  <button
	                                    key={section.id}
	                                    className={
	                                      modelPickerSection === section.id
	                                        ? "model-picker-nav-btn active"
	                                        : "model-picker-nav-btn"
	                                    }
	                                    type="button"
	                                    aria-pressed={modelPickerSection === section.id}
	                                    onClick={() => setModelPickerSection(section.id)}
	                                  >
	                                    {section.label}
	                                  </button>
	                                ))}
	                              </nav>
	                              <div className="model-picker-list" role="list">
	                                {visiblePickerModels.map((model) => {
	                                  const isSelected = model.id === selectedPickerModelId;
	                                  const selectable = canSelectPickerModel(model);
	                                  const canFavorite = model.access !== "guest";
	                                  const isFavorited = favoriteSet.has(model.id);

	                                  const lockedLabel = !supabaseSession
	                                    ? model.access === "guest"
	                                      ? "Free"
	                                      : "Sign in"
	                                    : !modelToggles.some((toggle) => toggle.id === model.id)
	                                      ? "Soon"
	                                      : model.access === "paid" && !hasPaidAccess
	                                        ? "Locked"
	                                      : model.access === "guest"
	                                        ? "Guest only"
	                                        : null;

	                                  return (
	                                    <div
	                                      key={model.id}
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
	                                        <div className="model-picker-row-title">
	                                          {model.label}
	                                          {lockedLabel && (
	                                            <span className="model-picker-row-pill">{lockedLabel}</span>
	                                          )}
	                                        </div>
	                                        {model.description && (
	                                          <div className="model-picker-row-subtitle">{model.description}</div>
	                                        )}
	                                      </button>
	                                      <div className="model-picker-row-actions">
	                                        <button
	                                          className={
	                                            isFavorited ? "model-picker-star active" : "model-picker-star"
	                                          }
	                                          type="button"
	                                          disabled={!canFavorite}
	                                          aria-label={isFavorited ? "Unfavorite model" : "Favorite model"}
	                                          title={
	                                            canFavorite ? (isFavorited ? "Unfavorite" : "Favorite") : "Guest-only"
	                                          }
	                                          onClick={() => toggleFavoriteModel(model.id)}
	                                        >
	                                          <svg viewBox="0 0 24 24" aria-hidden="true">
	                                            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
	                                          </svg>
	                                        </button>
	                                      </div>
	                                    </div>
	                                  );
	                                })}
	                              </div>
	                            </div>
	                          </div>
	                        </div>
	                      )}
	                    </div>
                  </div>
                  <div className="ask-actions">
                    <button
                      className="ask-icon-btn ask-mic"
                      type="button"
                      disabled
                      aria-label="Voice input"
                      title="Voice input (coming soon)"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 14a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v4a3 3 0 0 0 3 3z" />
                        <path d="M19 11a7 7 0 0 1-14 0" />
                        <path d="M12 18v4" />
                        <path d="M8 22h8" />
                      </svg>
                    </button>
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
	                        {filteredDiscoverCommunities.map((community) => {
	                            const memberCommunity = communities.find((c) => c.slug === community.slug) ?? null;
	                            const alreadyMember = Boolean(memberCommunity);
	                            const priceLabel = community.active_plan ? formatPlanPrice(community.active_plan) : "Free";
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
	                                        <span className={`discover-visibility-icon ${community.visibility ?? "private"}`} title={visibilityLabel}>
	                                          {community.visibility === "public" ? (
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
	                              const senderLabel = displayName(message.sender_id);
	                              const avatarUrl = isOwn
	                                ? profileAvatarUrl
	                                : profilesByUserId[message.sender_id]?.avatar_url ?? null;
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
	                                      title={senderLabel}
	                                    >
	                                      {avatarUrl ? (
	                                        <img src={avatarUrl} alt={senderLabel} />
	                                      ) : (
	                                        getInitials(senderLabel)
	                                      )}
	                                    </div>
	                                    <div className="chat-content">
	                                      <div className="chat-header">
	                                        <span className="chat-sender">{senderLabel}</span>
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
	                                              {(() => {
	                                                const thumb = replyTarget.attachments?.find(
	                                                  (att) =>
	                                                    att.type === "image" &&
	                                                    typeof att.data_url === "string" &&
	                                                    att.data_url.startsWith("data:image/"),
	                                                );
	                                                const text = truncateReplyPreview(
	                                                  (parseReplyPrefix(replyTarget.body)?.rest ?? replyTarget.body).trim() ||
	                                                    (thumb ? "Image" : "Message"),
	                                                );
	                                                return (
	                                                  <>
	                                              <svg className="chat-reply-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
	                                                <polyline points="9 14 4 9 9 4" />
	                                                <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
	                                              </svg>
	                                              {thumb?.data_url && (
	                                                <img
	                                                  className="chat-reply-thumb"
	                                                  src={thumb.data_url}
	                                                  alt=""
	                                                  aria-hidden="true"
	                                                  loading="lazy"
	                                                />
	                                              )}
	                                              <span className="chat-reply-sender">{displayName(replyTarget.sender_id)}</span>
	                                              <span className="chat-reply-text">{text}</span>
	                                                  </>
	                                                );
	                                              })()}
	                                            </button>
	                                          )}
                                          {!replyTarget && replyToId && (
                                            <div className="chat-reply-quote" title={`Reply to ${replyToId}`}>
                                              <svg className="chat-reply-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="9 14 4 9 9 4" />
                                                <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                                              </svg>
                                              <span className="chat-reply-sender">Reply</span>
                                              <span className="chat-reply-text">Replied message not loaded</span>
                                            </div>
                                          )}
	                                      {legacyReply && (
	                                        <div className="chat-reply-quote">
	                                          <svg className="chat-reply-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
	                                            <polyline points="9 14 4 9 9 4" />
	                                            <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
	                                          </svg>
	                                          <span className="chat-reply-sender">{legacyReply.sender}</span>
	                                          <span className="chat-reply-text">{legacyReply.preview}</span>
	                                        </div>
	                                      )}
	                                      <div className="chat-body">
	                                        {renderTextWithLinks(legacyReply ? legacyReply.rest : message.body)}
	                                      </div>
	                                    </>
	                                  )}

                                      {message.attachments && message.attachments.length > 0 && (() => {
                                        const imageAttachments = message.attachments
                                          .filter(
                                            (att) =>
                                              att.type === "image" &&
                                              typeof att.data_url === "string" &&
                                              att.data_url.startsWith("data:image/")
                                          )
                                          .map((att) => ({ url: att.data_url as string, name: att.name }));
                                        const fileAttachments = message.attachments.filter(
                                          (att) =>
                                            !(
                                              att.type === "image" &&
                                              typeof att.data_url === "string" &&
                                              att.data_url.startsWith("data:image/")
                                            )
                                        );
                                        const gridCount = Math.min(imageAttachments.length, 4);
                                        return (
                                          <>
                                            {imageAttachments.length > 0 && (
                                              <div className={`chat-media-grid count-${gridCount}`}>
                                                {imageAttachments.slice(0, 4).map((img, idx) => (
                                                  <button
                                                    key={`${message.id}-img-${idx}`}
                                                    type="button"
                                                    className="chat-media-item"
                                                    onClick={() => openCommunityChatLightbox(imageAttachments, idx)}
                                                    title={img.name}
                                                    aria-label={img.name}
                                                  >
                                                    <img src={img.url} alt={img.name} loading="lazy" />
                                                    {idx === 3 && imageAttachments.length > 4 && (
                                                      <div className="chat-media-more">+{imageAttachments.length - 4}</div>
                                                    )}
                                                  </button>
                                                ))}
                                              </div>
                                            )}

                                            {fileAttachments.length > 0 && (
                                              <div className="attachments-preview chat-attachments-preview">
                                                {fileAttachments.map((att) => (
                                                  <button
                                                    key={att.id}
                                                    type="button"
                                                    className="attachment-item attachment-chip"
                                                    disabled
                                                    title={att.name}
                                                  >
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
                                                  </button>
                                                ))}
                                              </div>
                                            )}
                                          </>
                                        );
                                      })()}

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
                        const images = communityAttachments.filter(
                          (att) =>
                            att.type === "image" &&
                            typeof att.data_url === "string" &&
                            att.data_url.startsWith("data:image/")
                        );
                        const files = communityAttachments.filter(
                          (att) =>
                            !(
                              att.type === "image" &&
                              typeof att.data_url === "string" &&
                              att.data_url.startsWith("data:image/")
                            )
                        );
                        const gridCount = Math.min(Math.max(images.length, 1), 4);
                        return (
                          <div className="community-attachments-preview">
                            {images.length > 0 && (
                              <div className={`chat-media-grid count-${gridCount} chat-media-grid-composer`}>
                                {images.map((att) => (
                                  <div key={att.id} className="chat-media-item chat-media-item-static">
                                    <img src={att.data_url ?? ""} alt={att.name} />
                                    <button
                                      type="button"
                                      className="chat-media-remove"
                                      onClick={() => removeCommunityAttachment(att.id)}
                                      title="Remove"
                                      aria-label={`Remove ${att.name}`}
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            {files.length > 0 && (
                              <div className="attachments-preview">
                                {files.map((att) => (
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
                        <button
                          className="ask-icon-btn ask-mic"
                          type="button"
                          disabled
                          aria-label="Voice input"
                          title="Voice input (coming soon)"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 14a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v4a3 3 0 0 0 3 3z" />
                            <path d="M19 11a7 7 0 0 1-14 0" />
                            <path d="M12 18v4" />
                            <path d="M8 22h8" />
                          </svg>
                        </button>
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
			                        <div className="chat-empty">Sign in to view community settings.</div>
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
			                                    setCommunitySettingsSlug(slugify(event.target.value));
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
			                                  <option value="private">Private</option>
			                                  <option value="unlisted">Unlisted</option>
			                                  <option value="public">Public</option>
			                                </select>
				                                <span className="create-community-hint">
				                                  {communitySettingsVisibility === "public"
				                                    ? "Discoverable. Anyone can preview chat and join to participate."
				                                    : communitySettingsVisibility === "unlisted"
				                                      ? "Not listed in discovery. Share the link when you're ready."
				                                      : "Discoverable, but chat is gated until you join."}
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
		                                { label: "Visibility", value: activeCommunity.visibility },
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
                        <div className="chat-empty">Sign in to configure the AI agent.</div>
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
                                    <div className="premium-gate-eyebrow">PRO</div>
                                    <div className="premium-gate-title">For Pro members only</div>
                                    <div className="model-note" style={{ marginTop: 8 }}>
                                      Upgrade to Builder Pro ($100/mo) to customize the empty-thread landing page and a
                                      community system prompt.
                                    </div>
                                    {isActiveCommunityOwner ? (
                                      <div className="create-community-actions" style={{ marginTop: 12 }}>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setBuilderUpgradeContext("builder");
                                            setIsBuilderUpgradeOpen(true);
                                          }}
                                        >
                                          Upgrade to Pro
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="model-note" style={{ marginTop: 12 }}>
                                        Ask the community owner to upgrade to Builder Pro.
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
	                        <div className="chat-empty">Sign in to view community analytics.</div>
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

	                  {communityTab === "automations" && (
	                    <div className="settings-panel community-settings-panel">
	                      {!activeCommunity ? (
	                        <div className="chat-empty">Select a community to view automations.</div>
	                      ) : !supabaseSession ? (
	                        <div className="chat-empty">Sign in to view community automations.</div>
	                      ) : !canViewActiveCommunityAutomations ? (
	                        <div className="chat-empty">Only owners and admins can manage automations.</div>
	                      ) : (
	                        <>
	                          {automationNotice && (
	                            <div className="success-toast" style={{ marginBottom: 12 }}>
	                              {automationNotice}
	                            </div>
	                          )}
	                          {brandosNotice && (
	                            <div className="success-toast" style={{ marginBottom: 12 }}>
	                              {brandosNotice}
	                            </div>
	                          )}
	                          {automationError && (
	                            <div className="auth-error" style={{ marginBottom: 12 }}>
	                              {automationError}
	                            </div>
	                          )}
	                          {brandosError && (
	                            <div className="auth-error" style={{ marginBottom: 12 }}>
	                              {brandosError}
	                            </div>
	                          )}
	                          {automationRevealSecret && (
	                            <div className="analytics-chart-card" style={{ marginBottom: 12 }}>
	                              <div className="analytics-chart-header">
	                                <div className="analytics-chart-title">{automationRevealSecret.label}</div>
	                                <button type="button" className="secondary" onClick={() => setAutomationRevealSecret(null)}>
	                                  Close
	                                </button>
	                              </div>
	                              <div className="tool-output">{automationRevealSecret.secret}</div>
	                              <div className="model-note">
	                                Copy this secret now. You can rotate it later, but it won't be shown again.
	                              </div>
	                            </div>
	                          )}
	                          <div className="settings-section">
	                            <div className="settings-section-title">Presets</div>
	                            <div className="analytics-chart-card">
	                              <div className="analytics-chart-header">
	                                <div className="analytics-chart-title">BrandOS</div>
	                                <div className="analytics-chart-header-right">
	                                  {isBrandosConnectOpen ? (
	                                    <>
	                                      <button
	                                        type="button"
	                                        className="secondary"
	                                        onClick={closeBrandosConnect}
	                                        disabled={isSavingBrandosConnector}
	                                      >
	                                        Cancel
	                                      </button>
	                                      <button
	                                        type="button"
	                                        onClick={() => void handleSaveBrandosConnector()}
	                                        disabled={isSavingBrandosConnector}
	                                      >
	                                        {isSavingBrandosConnector ? "Saving…" : brandosConnector ? "Save" : "Connect"}
	                                      </button>
	                                    </>
	                                  ) : brandosConnector ? (
	                                    <>
	                                      <button type="button" className="secondary" onClick={openBrandosConnect}>
	                                        Manage
	                                      </button>
	                                      <button
	                                        type="button"
	                                        className="danger"
	                                        onClick={() => void handleDeleteBrandosConnector()}
	                                        disabled={isDeletingBrandosConnector}
	                                      >
	                                        {isDeletingBrandosConnector ? "Disconnecting…" : "Disconnect"}
	                                      </button>
	                                    </>
	                                  ) : (
	                                    <button type="button" onClick={openBrandosConnect}>
	                                      Connect
	                                    </button>
	                                  )}
	                                </div>
	                              </div>
	                              <div className="model-note">
	                                One-click attribution: Arx captures bid/aid and identifies on email capture.
	                              </div>
	                              {brandosConnector && !isBrandosConnectOpen && (
	                                <div className="model-note">Connected to {brandosConnector.base_url}.</div>
	                              )}
	                              {isBrandosConnectOpen && (
	                                <div style={{ marginTop: 12 }}>
	                                  <div className="invite-create-row invite-create-row-custom">
	                                    <label className="create-community-field">
	                                      <span>Base URL</span>
	                                      <input
	                                        type="text"
	                                        placeholder="https://app.brandos.com"
	                                        value={brandosBaseUrlInput}
	                                        onChange={(event) => setBrandosBaseUrlInput(event.target.value)}
	                                      />
	                                    </label>
	                                    <label className="create-community-field">
	                                      <span>Account id</span>
	                                      <input
	                                        type="text"
	                                        placeholder="00000000-0000-0000-0000-000000000000"
	                                        value={brandosAccountIdInput}
	                                        onChange={(event) => setBrandosAccountIdInput(event.target.value)}
	                                      />
	                                    </label>
	                                  </div>
	                                  <div className="invite-create-row invite-create-row-custom" style={{ marginTop: 12 }}>
	                                    <label className="create-community-field" style={{ flex: 1 }}>
	                                      <span>Identify secret</span>
	                                      <input
	                                        type="password"
	                                        placeholder="Paste your BrandOS identify secret"
	                                        value={brandosIdentifySecretInput}
	                                        onChange={(event) => setBrandosIdentifySecretInput(event.target.value)}
	                                      />
	                                    </label>
	                                  </div>
	                                  <div className="model-list" style={{ marginTop: 12 }}>
	                                    <label className="model-toggle">
	                                      <input
	                                        type="checkbox"
	                                        checked={brandosIsEnabledInput}
	                                        onChange={(event) => setBrandosIsEnabledInput(event.target.checked)}
	                                      />
	                                      <span>Enabled</span>
	                                    </label>
	                                  </div>
	                                  <div className="model-note" style={{ marginTop: 10 }}>
	                                    Arx will POST to <span className="token">/api/identify</span> on{" "}
	                                    <span className="token">Email captured</span>.
	                                  </div>
	                                  <div className="model-note" style={{ marginTop: 8 }}>
	                                    {lastBrandosIdentifyDelivery ? (
	                                      (() => {
	                                        const isSkipped =
	                                          lastBrandosIdentifyDelivery.status === "success" &&
	                                          (lastBrandosIdentifyDelivery.error ?? "").startsWith("skipped_");
	                                        const statusLabel = isSkipped
	                                          ? "Skipped"
	                                          : lastBrandosIdentifyDelivery.status === "success"
	                                            ? "Success"
	                                            : "Failed";
	                                        const detail = [
	                                          "Last identify",
	                                          formatRelativeTime(lastBrandosIdentifyDelivery.attempted_at),
	                                          statusLabel,
	                                          formatAutomationDeliveryError(lastBrandosIdentifyDelivery.error),
	                                        ]
	                                          .filter(Boolean)
	                                          .join(" • ");
	                                        return <>{detail}</>;
	                                      })()
	                                    ) : (
	                                      <>No identify attempts yet.</>
	                                    )}
	                                  </div>
	                                </div>
	                              )}
	                            </div>
	                          </div>
	                          <div className="settings-section">
	                            <div className="settings-section-title">Webhooks</div>
	                            <div className="analytics-chart-card">
	                              <div className="analytics-chart-header">
	                                <div className="analytics-chart-title">
	                                  {isAutomationCreateOpen ? "New webhook" : "Webhook endpoints"}
	                                </div>
	                                <div className="analytics-chart-header-right">
	                                  {isAutomationCreateOpen ? (
	                                    <>
	                                      <button
	                                        type="button"
	                                        className="secondary"
	                                        onClick={() => {
	                                          setIsAutomationCreateOpen(false);
	                                          resetAutomationForm();
	                                        }}
	                                      >
	                                        Cancel
	                                      </button>
	                                      <button type="button" onClick={() => void handleCreateAutomationEndpoint()}>
	                                        Create
	                                      </button>
	                                    </>
	                                  ) : (
	                                    <button
	                                      type="button"
	                                      onClick={() => {
	                                        setAutomationNotice(null);
	                                        setAutomationError(null);
	                                        setAutomationRevealSecret(null);
	                                        resetAutomationForm();
	                                        setIsAutomationCreateOpen(true);
	                                      }}
	                                    >
	                                      Add webhook
	                                    </button>
	                                  )}
	                                </div>
	                              </div>
	                              {isAutomationCreateOpen && (
	                                <div style={{ marginBottom: 14 }}>
	                                  <div className="invite-create-row invite-create-row-custom">
	                                    <label className="create-community-field">
	                                      <span>Name</span>
	                                      <input
	                                        type="text"
	                                        placeholder="Zapier"
	                                        value={automationNameInput}
	                                        onChange={(event) => setAutomationNameInput(event.target.value)}
	                                      />
	                                    </label>
	                                    <label className="create-community-field">
	                                      <span>Webhook URL</span>
	                                      <input
	                                        type="text"
	                                        placeholder="https://hooks.zapier.com/..."
	                                        value={automationUrlInput}
	                                        onChange={(event) => setAutomationUrlInput(event.target.value)}
	                                      />
	                                    </label>
	                                  </div>

	                                  <div className="model-note" style={{ marginTop: 10 }}>
	                                    Select which events to send. Email captured includes email.
	                                  </div>
	                                  <div className="model-list">
	                                    {[
	                                      { id: "identity.email_captured", label: "Email captured" },
	                                      { id: "community.member_joined", label: "Member joined" },
	                                      { id: "community.member_left", label: "Member churned" },
	                                    ].map((option) => (
	                                      <label key={option.id} className="model-toggle">
	                                        <input
	                                          type="checkbox"
	                                          checked={automationSelectedEventTypes.includes(option.id)}
	                                          onChange={(event) => {
	                                            const checked = event.target.checked;
	                                            setAutomationSelectedEventTypes((prev) => {
	                                              if (checked) return Array.from(new Set([...prev, option.id]));
	                                              return prev.filter((value) => value !== option.id);
	                                            });
	                                          }}
	                                        />
	                                        <span>{option.label}</span>
	                                      </label>
	                                    ))}
	                                    <label className="model-toggle">
	                                      <input
	                                        type="checkbox"
	                                        checked={automationIsEnabledInput}
	                                        onChange={(event) => setAutomationIsEnabledInput(event.target.checked)}
	                                      />
	                                      <span>Enabled</span>
	                                    </label>
	                                  </div>
	                                </div>
	                              )}

	                              {isLoadingAutomations ? (
	                                <div className="chat-empty">Loading…</div>
	                              ) : automationEndpoints.length === 0 ? (
	                                <div className="model-note">No webhooks yet.</div>
	                              ) : (
	                                <div className="invite-list">
	                                  {automationEndpoints.map((endpoint) => {
	                                    const statusClass = endpoint.is_enabled ? "active" : "revoked";
	                                    const statusText = endpoint.is_enabled ? "Enabled" : "Disabled";
	                                    const eventLabels: Record<string, string> = {
	                                      "identity.email_captured": "Email captured",
	                                      "community.member_joined": "Member joined",
	                                      "community.member_left": "Member churned",
	                                    };
	                                    const events =
	                                      endpoint.event_types && endpoint.event_types.length > 0
	                                        ? endpoint.event_types
	                                        : ["community.member_joined", "community.member_left"];
	                                    const eventsLabel = events.map((eventType) => eventLabels[eventType] ?? eventType).join(", ");
	                                    return (
	                                      <div key={endpoint.id} className="invite-row">
	                                        <div className="invite-main">
	                                          <div className="invite-code">{endpoint.name}</div>
	                                          <div className={`invite-status ${statusClass}`}>
	                                            {statusText} • {eventsLabel} • {endpoint.url}
	                                          </div>
	                                        </div>
	                                        <div className="invite-actions">
	                                          <button type="button" onClick={() => void handleTestAutomationEndpoint(endpoint)}>
	                                            Test
	                                          </button>
	                                          <button
	                                            type="button"
	                                            className="secondary"
	                                            onClick={() => void handleToggleAutomationEndpointEnabled(endpoint)}
	                                          >
	                                            {endpoint.is_enabled ? "Disable" : "Enable"}
	                                          </button>
	                                          <button
	                                            type="button"
	                                            className="secondary"
	                                            onClick={() => void handleRotateAutomationEndpointSecret(endpoint)}
	                                          >
	                                            Rotate secret
	                                          </button>
	                                          <button
	                                            type="button"
	                                            className="danger"
	                                            onClick={() => void handleDeleteAutomationEndpoint(endpoint)}
	                                          >
	                                            Delete
	                                          </button>
	                                        </div>
	                                      </div>
	                                    );
	                                  })}
	                                </div>
	                              )}
	                            </div>
	                          </div>
	                          <div className="settings-section">
	                            <div className="settings-section-title">Delivery log</div>
	                            <div className="analytics-chart-card">
	                              {isLoadingAutomations ? (
	                                <div className="chat-empty">Loading…</div>
	                              ) : automationDeliveries.length === 0 ? (
	                                <div className="model-note">No deliveries yet.</div>
	                              ) : (
	                                <div className="invite-list">
	                                  {automationDeliveries.map((delivery) => {
	                                    const key = `${delivery.attempted_at}:${delivery.endpoint_name}:${delivery.event_type}`;
	                                    const statusClass = delivery.status === "success" ? "active" : "revoked";
	                                    const formattedError = formatAutomationDeliveryError(delivery.error);
	                                    const details = [
	                                      formatRelativeTime(delivery.attempted_at),
	                                      delivery.endpoint_name,
	                                      delivery.response_code != null ? `HTTP ${delivery.response_code}` : null,
	                                    ]
	                                      .filter(Boolean)
	                                      .join(" • ");
	                                    return (
	                                      <div key={key} className="invite-row">
	                                        <div className="invite-main">
	                                          <div className="invite-code">{delivery.event_type}</div>
	                                          <div className={`invite-status ${statusClass}`}>
	                                            {details}
	                                            {formattedError ? ` • ${formattedError}` : ""}
	                                          </div>
	                                        </div>
	                                      </div>
	                                    );
	                                  })}
	                                </div>
	                              )}
	                            </div>
	                          </div>
	                        </>
	                      )}
	                    </div>
	                  )}

	                  {communityTab === "members" && (
	                    <div className="community-panel members-panel">
	                      <div className={`members-layout${canInviteActiveCommunity ? " with-invites" : ""}`}>
                        <section className="members-section">
                          <div className="members-header-row">
                            <div className="members-header">Members</div>
                            <div className="members-count">{communityMembers.length}</div>
                          </div>
                          <div className="members-list">
                            {communityMembers.length === 0 ? (
                              <div className="members-empty">No members yet.</div>
                            ) : (
	                              communityMembers.map((member) => {
	                                const profile = profilesByUserId[member.user_id] ?? null;
	                                const avatarUrl = profile?.avatar_url ?? null;
	                                const initials = profile?.display_name
	                                  ? communityInitials(profile.display_name)
	                                  : getInitials(member.user_id);
	                                const memberIsOwner = Boolean(
	                                  (activeCommunity && activeCommunity.owner_id === member.user_id) ||
	                                    member.role === "owner"
	                                );
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
	                                        <span className="member-role">{member.role}</span>
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
              contextModal.memory_added.length === 0 ? (
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
                                      handleSignIn();
                                      return;
                                    }
                                    const tier = (builderBillingStatus?.builder_tier ?? "free").toLowerCase();
                                    if (tier === "free") {
                                      setBuilderUpgradeContext("builder");
                                      setBuilderBillingError("Upgrade to Starter to use personal memory.");
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
	                To continue with {platformQuotaModal.providerLabel}, you can use your own API key.
	              </div>
                {!platformQuotaModal.byokAllowed && (
                  <div className="auth-error" style={{ marginBottom: 12 }}>
                    This model can&apos;t be used with BYOK. Choose a different model.
                  </div>
                )}
	              {platformQuotaModal.byokAllowed && !platformQuotaModal.hasKey && (
	                <div className="auth-error">
	                  No {platformQuotaModal.providerLabel} API key is saved yet. Add one in Settings → Models.
	                </div>
	              )}
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
                  {(!platformQuotaModal.byokAllowed || !platformQuotaModal.hasKey) && (
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
                  )}
                  {platformQuotaModal.byokAllowed && !platformQuotaModal.hasKey && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setActiveView("settings");
                        setSettingsPage("models");
                        setPlatformQuotaModal(null);
                      }}
                      disabled={isPlatformQuotaModalRunning}
                    >
                      Add API key
                    </button>
                  )}
                  {platformQuotaModal.byokAllowed && platformQuotaModal.hasKey && (
                    <button
                      type="button"
                      onClick={() => void retryTurnWithByokFromQuotaModal()}
                      disabled={isPlatformQuotaModalRunning}
                    >
                      {isPlatformQuotaModalRunning ? "Running…" : "Use my API key"}
                    </button>
                  )}
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
		                const starterIsCurrent = tier === "builder";
		                const proIsCurrent = tier === "pro";
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
		                        {feature(true, "Use any AI model (BYOK)")}
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

		                    <div className={`plan-card${starterIsCurrent ? " current" : ""}`}>
		                      <div className="plan-card-header">
		                        <div className="plan-name">Starter</div>
		                        {starterIsCurrent && <div className="plan-badge">Current</div>}
		                      </div>
		                      <div className="plan-price">
		                        <span className="plan-price-amount">$20</span>
		                        <span className="plan-price-period">/mo</span>
		                      </div>
		                      <div className="plan-subtitle">10% take · 1 community</div>
		                      <ul className="plan-features plan-features-checks">
		                        {feature(true, "AI chats (5GB cloud history)")}
		                        {feature(true, "Use any AI model (BYOK)")}
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
		                        disabled={isStartingBuilderCheckout || starterIsCurrent}
		                      >
		                        {starterIsCurrent ? "Current plan" : isStartingBuilderCheckout ? "Starting…" : "Get Starter"}
		                      </button>
		                    </div>

		                    <div className={`plan-card${proIsCurrent ? " current" : ""}`}>
		                      <div className="plan-card-header">
		                        <div className="plan-name">Pro</div>
		                        {proIsCurrent && <div className="plan-badge">Current</div>}
		                      </div>
		                      <div className="plan-price">
		                        <span className="plan-price-amount">$100</span>
		                        <span className="plan-price-period">/mo</span>
		                      </div>
		                      <div className="plan-subtitle">3% take · 3 communities</div>
		                      <ul className="plan-features plan-features-checks">
		                        {feature(true, "AI chats (25GB cloud history)")}
		                        {feature(true, "Use any AI model (BYOK)")}
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
		                          void startBuilderPlanCheckout("pro", { context: builderUpgradeContext });
		                        }}
		                        disabled={isStartingBuilderCheckout || proIsCurrent}
		                      >
		                        {proIsCurrent ? "Current plan" : isStartingBuilderCheckout ? "Starting…" : "Get Pro"}
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

	      {builderBillingReturn && (
	        <div className="modal-overlay" onClick={() => setBuilderBillingReturn(null)}>
	          <div className="modal" onClick={(event) => event.stopPropagation()}>
	            <div className="modal-header">
              <div className="modal-title">Billing</div>
              <button className="modal-close" onClick={() => setBuilderBillingReturn(null)} title="Close">
                ×
              </button>
            </div>
            <div className="modal-body">
	              {builderBillingReturn.status === "cancel" ? (
	                <div className="model-note">Checkout canceled.</div>
	              ) : builderBillingReturn.status === "return" ? (
	                <div className="model-note">Manage your plan and billing details.</div>
	              ) : (
	                <div className="model-note">
	                  {(() => {
	                    const wantsCreate = builderBillingReturn.context === "create_community";
	                    if (isFinalizingCreateCommunityFromBilling) return "Creating your community…";
	                    if (isFinalizingBuilderReturn) return "Finalizing your plan…";
	                    return wantsCreate ? "Plan confirmed — finishing your community setup." : "Thanks — confirming your plan.";
	                  })()}
	                </div>
	              )}

              {!supabaseSession ? (
                <div className="model-note" style={{ marginTop: 10 }}>
                  Sign in to confirm your plan status.
                </div>
              ) : (
                <div className="model-note" style={{ marginTop: 10 }}>
                  {(() => {
                    const tier = (builderBillingStatus?.builder_tier ?? "free").toLowerCase();
                    const max = builderBillingStatus?.max_communities ?? 0;
                    const feeBps = builderBillingStatus?.platform_fee_bps ?? 1000;
                    const feePct = (feeBps / 100).toFixed(0);
                    const label = tier === "pro" ? "Builder Pro" : tier === "builder" ? "Builder" : "Free";
                    const limitLabel = max > 0 ? `${max} communities` : "0 communities";
                    return `${label} · ${limitLabel} · ${feePct}% take`;
                  })()}
                </div>
              )}

	              {builderBillingReturn.source === "desktop" && (
	                <div className="auth-actions" style={{ marginTop: 14 }}>
	                  <button
	                    type="button"
                    onClick={() => {
                      const status = builderBillingReturn.status;
                      const ctx = builderBillingReturn.context;
                      const deepLink = `arx://billing?status=${encodeURIComponent(status)}&context=${encodeURIComponent(ctx)}`;
                      window.location.assign(deepLink);
                    }}
                  >
                    Open Arx Desktop
	                  </button>
	                </div>
	              )}

	              {finalizeCreateCommunityError && <div className="auth-error">{finalizeCreateCommunityError}</div>}
	              {builderBillingError && <div className="auth-error">{builderBillingError}</div>}
	            </div>
            <div className="modal-footer">
              <button type="button" className="secondary" onClick={() => setBuilderBillingReturn(null)}>
                Close
              </button>
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
                      setCreateCommunityVisibility(event.target.value as "public" | "unlisted" | "private")
                    }
                  >
                    <option value="private">Private</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="public">Public</option>
                  </select>
                </label>
                {createCommunityError && <div className="auth-error">{createCommunityError}</div>}
                {builderBillingError && <div className="auth-error">{builderBillingError}</div>}
                    </div>
                  </div>
                  <div className="modal-footer">
                    <div className="create-community-actions">
	                {!supabaseSession ? (
	                  <button className="create-community-primary" onClick={() => void handleSignIn()}>
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

      {authError && (
        <div className="toast error" role="status">
          {authError}
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
