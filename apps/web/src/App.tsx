import { useEffect, useMemo, useRef, useState } from "react";
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

export default function App() {
  const [supabaseSession, setSupabaseSession] = useState<SupabaseSession | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const sessionRef = useRef<SupabaseSession | null>(null);
  const refreshInFlightRef = useRef<Promise<SupabaseSession | null> | null>(null);
  const refreshTimeoutRef = useRef<number | null>(null);

  const [activePage, setActivePage] = useState<"workspace" | "community" | "discover">("workspace");
  const [activeView, setActiveView] = useState<"home" | "settings">("home");
  const [communities, setCommunities] = useState<CommunityRecord[]>([]);
  const [activeCommunityId, setActiveCommunityId] = useState<string | null>(null);
  const [communityTab, setCommunityTab] = useState<"chat" | "library" | "resources" | "members" | "settings">(
    "chat"
  );

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
    setActiveCommunityId(null);
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

  const activeCommunity = useMemo(() => {
    if (!activeCommunityId) return null;
    return communities.find((c) => c.id === activeCommunityId) ?? null;
  }, [activeCommunityId, communities]);

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
    <div className="app">
      <header className="app-topbar">
        <div className="topbar-left">
          <button
            className={`icon-button${activePage === "workspace" ? " active" : ""}`}
            onClick={() => {
              setActiveView("home");
              setActivePage("workspace");
            }}
            aria-label="Agent"
            title="Agent"
            type="button"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2l9 4.9v5.8c0 5-3.8 9.5-9 11.3C6.8 22.2 3 17.7 3 12.7V6.9L12 2z" />
              <path d="M9 12h6M12 9v6" />
            </svg>
          </button>
          <button
            className={`icon-button community-btn${activePage !== "workspace" ? " active" : ""}`}
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
        </div>

        <div className="topbar-center">
          <div className="workspace-title">
            <span className="workspace-name">Arx</span>
          </div>
        </div>

        <div className="topbar-right">
          {supabaseSession ? (
            <>
              <span className="topbar-status">
                {supabaseSession.user.email ?? supabaseSession.user.id}
              </span>
              <button className="topbar-button" type="button" onClick={() => void handleSignOut()}>
                Sign out
              </button>
            </>
          ) : (
            <button className="topbar-button" type="button" onClick={handleSignIn}>
              Sign in
            </button>
          )}
        </div>
      </header>

      <div
        className={`app-shell${showCommunityRail ? " with-community-rail" : ""}${!hasLeftPanel || activePage === "discover" ? " no-left" : ""} no-right`}
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
                <div className="community-chat">
                  <div className="chat-empty">
                    Web community chat UI is next (this page is wired for discovery + memberships first).
                  </div>
                </div>
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
