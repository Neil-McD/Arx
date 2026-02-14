import type { ThreadRecord } from "../../runtime/arp/types";
import type { SupabaseSession } from "../../../shared/supabaseAuthCore";
import { normalizeThreadLane } from "../../../shared/threadSidebarSelectors";

type CloudThreadRow = {
  id: string;
  title: string | null;
  engine_id: string;
  model_id: string | null;
  thread_lane: string | null;
  project_id: string | null;
  community_id: string | null;
  context_version: unknown;
  created_at: string;
  updated_at: string;
  last_seq: unknown;
};

type FetchWithSupabaseAuth = (
  url: string,
  init: RequestInit,
  session: SupabaseSession,
) => Promise<Response>;

type CreateDesktopCloudChatThreadApiDeps = {
  getSupabaseUrl: () => string | null;
  fetchWithSupabaseAuth: FetchWithSupabaseAuth;
  readSupabaseError: (response: Response) => Promise<string>;
  getSupabaseAuthUid: (session: SupabaseSession) => string;
  toUnixSecondsFromIso: (value: string | null | undefined) => number | null;
  getThreads: () => ThreadRecord[];
  setThreads: (updater: (prev: ThreadRecord[]) => ThreadRecord[]) => void;
  getActiveModelId: () => string | null;
};

type SetCloudThreadTitleInput = {
  thread_id: string;
  title: string;
  session: SupabaseSession;
};

type SetCloudThreadEngineInput = {
  thread_id: string;
  engine_id: string;
  model_id: string | null;
  session: SupabaseSession;
};

type AddCloudMessageInput = {
  thread_id: string;
  role: "user" | "assistant";
  content_json: string;
  session: SupabaseSession;
};

type SendCloudTurnInput = {
  thread_id: string;
  input: string;
  user_content_json: string;
  session: SupabaseSession;
};

function parseCloudContentJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall back to plain-text payload.
  }
  return { text: raw };
}

export function createDesktopCloudChatThreadApi(deps: CreateDesktopCloudChatThreadApiDeps) {
  const toThreadRecordFromCloud = (row: CloudThreadRow): ThreadRecord => {
    const nowSec = Math.floor(Date.now() / 1000);
    const createdAt = deps.toUnixSecondsFromIso(row.created_at) ?? nowSec;
    const updatedAt = deps.toUnixSecondsFromIso(row.updated_at) ?? createdAt;
    const parsedLastSeq =
      typeof row.last_seq === "number"
        ? row.last_seq
        : typeof row.last_seq === "string"
          ? Number(row.last_seq)
          : Number.NaN;
    const parsedContextVersion =
      typeof row.context_version === "number"
        ? row.context_version
        : typeof row.context_version === "string"
          ? Number(row.context_version)
          : Number.NaN;
    return {
      id: row.id,
      title: row.title ?? null,
      engine_id: row.engine_id,
      model_id: row.model_id ?? null,
      thread_lane: normalizeThreadLane(row.thread_lane, row.engine_id),
      storage_mode: "cloud",
      project_id: row.project_id ?? null,
      workspace_path: null,
      workspace_fingerprint: null,
      community_id: row.community_id ?? null,
      context_version: Number.isFinite(parsedContextVersion) ? parsedContextVersion : 0,
      created_at: createdAt,
      updated_at: updatedAt,
      last_event_at: updatedAt,
      last_seq: Number.isFinite(parsedLastSeq) ? parsedLastSeq : 0,
    };
  };

  const getCloudThreadRecord = async (
    threadId: string,
    session: SupabaseSession,
  ): Promise<ThreadRecord | null> => {
    const fallback = deps.getThreads().find((thread) => thread.id === threadId) ?? null;
    const url = deps.getSupabaseUrl();
    if (!url) return fallback;
    try {
      const response = await deps.fetchWithSupabaseAuth(
        `${url}/rest/v1/threads?select=id,title,engine_id,model_id,thread_lane,project_id,community_id,context_version,created_at,updated_at,last_seq&id=eq.${encodeURIComponent(
          threadId,
        )}&limit=1`,
        { method: "GET" },
        session,
      );
      if (!response.ok) throw new Error(await deps.readSupabaseError(response));
      const rows = (await response.json()) as CloudThreadRow[];
      const row = rows[0] ?? null;
      if (!row?.id) return null;
      const next = toThreadRecordFromCloud(row);
      deps.setThreads((prev) => {
        const index = prev.findIndex((thread) => thread.id === next.id);
        if (index === -1) return [next, ...prev];
        const copy = [...prev];
        copy[index] = next;
        return copy;
      });
      return next;
    } catch (error) {
      console.warn("Failed to load cloud thread context:", error);
      return fallback;
    }
  };

  const listCloudChatThreads = async (session: SupabaseSession): Promise<ThreadRecord[]> => {
    const url = deps.getSupabaseUrl();
    if (!url) return [];
    const response = await deps.fetchWithSupabaseAuth(
      `${url}/rest/v1/threads?select=id,title,engine_id,model_id,thread_lane,project_id,community_id,context_version,created_at,updated_at,last_seq&engine_id=neq.community_chat&order=updated_at.desc&limit=500`,
      { method: "GET" },
      session,
    );
    if (!response.ok) throw new Error(await deps.readSupabaseError(response));
    const rows = (await response.json()) as CloudThreadRow[];
    return rows
      .map(toThreadRecordFromCloud)
      .filter((thread) => thread.storage_mode === "cloud" && thread.thread_lane === "chat");
  };

  const createCloudChatThread = async (
    thread: ThreadRecord,
    session: SupabaseSession,
  ): Promise<ThreadRecord | null> => {
    const url = deps.getSupabaseUrl();
    if (!url) throw new Error("Missing Supabase URL.");
    const response = await deps.fetchWithSupabaseAuth(
      `${url}/rest/v1/threads`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify({
          id: thread.id,
          owner_id: deps.getSupabaseAuthUid(session),
          title: thread.title ?? null,
          engine_id: thread.engine_id,
          model_id: thread.model_id ?? null,
          thread_lane: "chat",
          project_id: null,
          community_id: thread.community_id ?? null,
        }),
      },
      session,
    );
    if (!response.ok) throw new Error(await deps.readSupabaseError(response));
    const rows = (await response.json()) as CloudThreadRow[];
    const row = rows[0] ?? null;
    return row?.id ? toThreadRecordFromCloud(row) : thread;
  };

  const deleteCloudChatThread = async (threadId: string, session: SupabaseSession): Promise<void> => {
    const url = deps.getSupabaseUrl();
    if (!url) throw new Error("Missing Supabase URL.");
    const response = await deps.fetchWithSupabaseAuth(
      `${url}/rest/v1/threads?id=eq.${encodeURIComponent(threadId)}`,
      {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      },
      session,
    );
    if (!response.ok) throw new Error(await deps.readSupabaseError(response));
  };

  const ensureCloudThreadExists = async (
    threadId: string,
    session: SupabaseSession,
  ): Promise<void> => {
    const url = deps.getSupabaseUrl();
    if (!url) throw new Error("Missing Supabase URL.");
    const thread = deps.getThreads().find((candidate) => candidate.id === threadId) ?? null;
    const modelId = (thread?.model_id ?? deps.getActiveModelId() ?? "").trim();
    const lane = normalizeThreadLane(thread?.thread_lane, thread?.engine_id);
    const response = await deps.fetchWithSupabaseAuth(
      `${url}/rest/v1/threads`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          id: threadId,
          owner_id: deps.getSupabaseAuthUid(session),
          title: thread?.title ?? null,
          engine_id: thread?.engine_id ?? "messages_agent",
          model_id: modelId || null,
          thread_lane: lane,
          project_id: thread?.project_id ?? null,
          community_id: thread?.community_id ?? null,
        }),
      },
      session,
    );
    if (!response.ok) {
      throw new Error(await deps.readSupabaseError(response));
    }
  };

  const setCloudThreadTitle = async (params: SetCloudThreadTitleInput): Promise<void> => {
    const url = deps.getSupabaseUrl();
    if (!url) throw new Error("Missing Supabase URL.");
    const response = await deps.fetchWithSupabaseAuth(
      `${url}/rest/v1/threads?id=eq.${encodeURIComponent(params.thread_id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ title: params.title }),
      },
      params.session,
    );
    if (!response.ok) {
      throw new Error(await deps.readSupabaseError(response));
    }
  };

  const setCloudThreadEngine = async (
    params: SetCloudThreadEngineInput,
  ): Promise<ThreadRecord | null> => {
    const url = deps.getSupabaseUrl();
    if (!url) throw new Error("Missing Supabase URL.");
    const response = await deps.fetchWithSupabaseAuth(
      `${url}/rest/v1/threads?id=eq.${encodeURIComponent(params.thread_id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          engine_id: params.engine_id,
          model_id: params.model_id,
        }),
      },
      params.session,
    );
    if (!response.ok) {
      throw new Error(await deps.readSupabaseError(response));
    }
    return getCloudThreadRecord(params.thread_id, params.session);
  };

  const addCloudMessage = async (params: AddCloudMessageInput): Promise<void> => {
    const url = deps.getSupabaseUrl();
    if (!url) throw new Error("Missing Supabase URL.");
    await ensureCloudThreadExists(params.thread_id, params.session);
    const response = await deps.fetchWithSupabaseAuth(
      `${url}/rest/v1/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          thread_id: params.thread_id,
          seq: 0,
          role: params.role,
          content_json: parseCloudContentJson(params.content_json),
        }),
      },
      params.session,
    );
    if (!response.ok) {
      throw new Error(await deps.readSupabaseError(response));
    }
  };

  const sendCloudTurn = async (params: SendCloudTurnInput): Promise<void> => {
    const url = deps.getSupabaseUrl();
    if (!url) throw new Error("Missing Supabase URL.");
    await ensureCloudThreadExists(params.thread_id, params.session);

    const thread = deps.getThreads().find((candidate) => candidate.id === params.thread_id) ?? null;
    const modelId = (thread?.model_id ?? deps.getActiveModelId() ?? "").trim();
    if (modelId) {
      const patchResponse = await deps.fetchWithSupabaseAuth(
        `${url}/rest/v1/threads?id=eq.${encodeURIComponent(params.thread_id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ model_id: modelId }),
        },
        params.session,
      );
      if (!patchResponse.ok) {
        throw new Error(await deps.readSupabaseError(patchResponse));
      }
    }

    const userContentJson =
      params.user_content_json.trim().length > 0
        ? params.user_content_json
        : JSON.stringify({ text: params.input });

    await addCloudMessage({
      thread_id: params.thread_id,
      role: "user",
      content_json: userContentJson,
      session: params.session,
    });

    const turnResponse = await deps.fetchWithSupabaseAuth(
      `${url}/functions/v1/agent_turn`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: params.thread_id,
          stream: false,
          mode: "respond",
        }),
      },
      params.session,
    );
    if (!turnResponse.ok) {
      throw new Error(await deps.readSupabaseError(turnResponse));
    }
    try {
      const payload = (await turnResponse.clone().json()) as {
        error?: unknown;
        message?: unknown;
      };
      const errorMessage =
        typeof payload?.error === "string"
          ? payload.error.trim()
          : typeof payload?.message === "string"
            ? payload.message.trim()
            : "";
      if (errorMessage) throw new Error(errorMessage);
    } catch (error) {
      if (error instanceof Error && error.message.trim()) {
        throw error;
      }
    }
  };

  return {
    listCloudChatThreads,
    getCloudThreadRecord,
    createCloudChatThread,
    deleteCloudChatThread,
    setCloudThreadTitle,
    setCloudThreadEngine,
    addCloudMessage,
    sendCloudTurn,
  };
}
