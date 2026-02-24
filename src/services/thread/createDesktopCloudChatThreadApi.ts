import type { ThreadRecord } from "../../runtime/arp/types";
import type { SupabaseSession } from "../../../shared/supabaseAuthCore";
import type { ThreadServiceTurnStreamEvent } from "../../../shared/threadService";
import { normalizeThreadLane } from "../../../shared/threadSidebarSelectors";
import { resolveDesktopCloudInferenceExecutionPlan } from "../../../shared/inferenceLaneResolver";
import { deriveThreadTitleFromUserText, isMissingThreadTitleValue } from "../../../shared/threadTitleUi";
import { buildCloudCommunityContextEnvelope } from "../../../shared/communityContextEnvelope";
import {
  buildChatgptLaneMessages,
  prependCommunityPreludeMessages,
  resolveLatestUserQueryFromInferenceMessages,
  type CommunityInferenceChatMessage,
} from "../../../shared/communityLaneMessageBuilder";
import { sanitizeUserFacingAssistantText } from "../../../shared/communityUserFacingOutputSanitizer.mjs";
import {
  loadCloudCommunityContextPreflight,
  isCommunityHarnessUnavailablePreflight,
  getCommunityHarnessUnavailableErrorMessage,
  COMMUNITY_HARNESS_UNAVAILABLE_FAILURE_CLASS,
  type CloudCommunityContextPreflightResult,
} from "../../../shared/cloudCommunityContextPreflight";
import {
  formatSupabaseFunctionErrorMessage,
  readSupabaseFunctionError,
  shouldFallbackFromChatgptErrorToPlatform,
  shouldFallbackFromPlatformErrorToPublic,
} from "../../../shared/supabaseFunctionErrors";
import { DEFAULT_GUEST_MODEL_ID } from "../../../shared/modelCatalog";

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
type FetchWithSupabasePublic = (url: string, init: RequestInit) => Promise<Response>;

type CreateDesktopCloudChatThreadApiDeps = {
  getSupabaseUrl: () => string | null;
  fetchWithSupabaseAuth: FetchWithSupabaseAuth;
  fetchWithSupabasePublic: FetchWithSupabasePublic;
  readSupabaseError: (response: Response) => Promise<string>;
  getSupabaseAuthUid: (session: SupabaseSession) => string;
  toUnixSecondsFromIso: (value: string | null | undefined) => number | null;
  getThreads: () => ThreadRecord[];
  setThreads: (updater: (prev: ThreadRecord[]) => ThreadRecord[]) => void;
  getActiveModelId: () => string | null;
  getPersonalSystemPrompt: () => string | null | undefined;
  getCommunityNameById?: (communityId: string) => string | null;
  freeModelAllowlist: ReadonlySet<string>;
  hasChatgptAuth: () => boolean;
  refreshHasChatgptAuth?: () => Promise<boolean>;
  runtimeTurnV2Enabled?: boolean;
  chatgptCloudTurn: (args: {
    model_id: string;
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    max_tokens?: number | null;
  }) => Promise<{
    text: string;
    model_id: string;
    inference_source: string;
  }>;
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
  id?: string;
  thread_id: string;
  role: "user" | "assistant";
  content_json: string;
  engine_id?: string | null;
  model_id?: string | null;
  run_id?: string | null;
  session: SupabaseSession;
};

type SendCloudTurnInput = {
  thread_id: string;
  input: string;
  user_content_json: string;
  session: SupabaseSession;
  sendPolicySnapshot?: {
    selectedModelId?: string | null;
    hasChatgptAuth?: boolean;
  };
  onStreamEvent?: (event: ThreadServiceTurnStreamEvent) => void;
};

type CloudMessageRow = {
  role: string;
  content_json: unknown;
  seq: unknown;
};

type CloudThreadTitleProbeRow = {
  thread_id: string;
  role: string;
  content_json: unknown;
  seq: unknown;
};

type CommunityCustomSystemPromptResult = {
  draftId: string | null;
  systemPrompt: string;
};

type LanePreparedMessages = {
  laneMessages: CommunityInferenceChatMessage[];
  contextEnvelope: ReturnType<typeof buildCloudCommunityContextEnvelope>;
  communityPreflight: CloudCommunityContextPreflightResult;
};

class RetryNextInferenceLaneError extends Error {
  readonly lane: "chatgpt" | "platform";
  readonly reasonCode: string;

  constructor(params: { lane: "chatgpt" | "platform"; reasonCode: string; message: string }) {
    super(params.message);
    this.name = "RetryNextInferenceLaneError";
    this.lane = params.lane;
    this.reasonCode = params.reasonCode;
  }
}

function isDesktopChatgptEligibleAlias(modelId: string | null | undefined): boolean {
  const cleaned = String(modelId ?? "").trim().toLowerCase();
  return cleaned.startsWith("gpt-") && !cleaned.startsWith("gpt-oss-");
}

const inferenceFallbackReasonCounters = new Map<string, number>();
const runtimeTurnLegacyFallbackCodes = new Set([
  "runner_unavailable",
  "runtime_turn_failed",
  "run_lookup_failed",
  "run_create_failed",
  "run_update_failed",
  "run_event_append_failed",
]);
const PUBLIC_EMPTY_RESPONSE_MAX_RETRIES = 1;
const MAX_DERIVED_THREAD_TITLES_PER_LIST = 80;
const TITLE_DERIVATION_CHUNK_SIZE = 40;

function recordInferenceFallbackTelemetry(params: {
  threadId: string;
  modelId: string;
  from: "chatgpt" | "platform";
  to: "chatgpt" | "platform" | "public";
  reason: string;
}): void {
  const reason = String(params.reason ?? "").trim() || "unknown";
  const count = (inferenceFallbackReasonCounters.get(reason) ?? 0) + 1;
  inferenceFallbackReasonCounters.set(reason, count);
  console.info("[desktop-inference-fallback]", {
    thread_id: params.threadId,
    model_id: params.modelId,
    from: params.from,
    to: params.to,
    reason,
    reason_count: count,
  });
}

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

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractTextFromCloudContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const record = content as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (typeof record.content === "string") return record.content;
  }
  return "";
}

function deriveThreadTitleFromCloudMessage(content: unknown): string {
  const text = extractTextFromCloudContent(content).trim();
  if (!text) return "";
  return deriveThreadTitleFromUserText(text).trim();
}

function chunkArray<T>(values: ReadonlyArray<T>, chunkSize: number): T[][] {
  if (!Number.isFinite(chunkSize) || chunkSize <= 0) return [values.slice() as T[]];
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    out.push(values.slice(index, index + chunkSize) as T[]);
  }
  return out;
}

type ConsumeSseOptions = {
  defaultEngineId?: string | null;
  defaultModelId?: string | null;
  defaultInferenceSource?: string | null;
  sanitizeText?: (text: string) => string;
  onStreamEvent?: (event: ThreadServiceTurnStreamEvent) => void;
};

async function consumeSseResponse(
  response: Response,
  options: ConsumeSseOptions,
): Promise<{
  fullContent: string;
  runId: string | null;
  engineId: string | null;
  modelId: string | null;
  inferenceSource: string | null;
}> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing streaming response.");

  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let dataBuffer = "";
  let seenDone = false;
  const sanitizeText = options.sanitizeText ?? ((text: string) => text);
  let rawFullContent = "";
  let fullContent = "";
  let runId: string | null = null;
  let engineId: string | null = options.defaultEngineId ?? null;
  let modelId: string | null = options.defaultModelId ?? null;
  let inferenceSource: string | null = options.defaultInferenceSource ?? null;

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
      runId = typeof parsed?.run_id === "string" ? parsed.run_id : runId;
      engineId = typeof parsed?.engine_id === "string" ? parsed.engine_id : engineId;
      modelId = typeof parsed?.model_id === "string" ? parsed.model_id : modelId;
      inferenceSource =
        typeof parsed?.inference_source === "string"
          ? parsed.inference_source
          : inferenceSource;
      options.onStreamEvent?.({
        type: "start",
        runId,
        engineId,
        modelId,
        inferenceSource,
        promptTokens: parseOptionalNumber(parsed?.prompt_tokens),
        completionTokens: parseOptionalNumber(parsed?.completion_tokens),
        maxTokens: parseOptionalNumber(parsed?.max_tokens),
      });
    } else if (eventName === "delta") {
      const delta = typeof parsed?.delta === "string" ? parsed.delta : "";
      const full = typeof parsed?.full_content === "string" ? parsed.full_content : null;
      if (full !== null) {
        rawFullContent = full;
      } else if (delta) {
        rawFullContent += delta;
      }
      const nextFullContent = sanitizeText(rawFullContent);
      const emittedDelta = nextFullContent.startsWith(fullContent)
        ? nextFullContent.slice(fullContent.length)
        : nextFullContent;
      fullContent = nextFullContent;
      options.onStreamEvent?.({
        type: "delta",
        delta: emittedDelta,
        fullContent,
        promptTokens: parseOptionalNumber(parsed?.prompt_tokens),
        completionTokens: parseOptionalNumber(parsed?.completion_tokens),
        maxTokens: parseOptionalNumber(parsed?.max_tokens),
      });
    } else if (eventName === "done") {
      if (typeof parsed?.run_id === "string" && parsed.run_id.trim()) {
        runId = parsed.run_id;
      }
      if (typeof parsed?.engine_id === "string" && parsed.engine_id.trim()) {
        engineId = parsed.engine_id.trim();
      }
      if (typeof parsed?.model_id === "string" && parsed.model_id.trim()) {
        modelId = parsed.model_id.trim();
      }
      if (typeof parsed?.inference_source === "string" && parsed.inference_source.trim()) {
        inferenceSource = parsed.inference_source.trim();
      }
      if (typeof parsed?.full_content === "string") {
        rawFullContent = parsed.full_content;
        fullContent = sanitizeText(rawFullContent);
      }
      seenDone = true;
      options.onStreamEvent?.({ type: "done" });
    } else if (eventName === "error") {
      const message =
        (typeof parsed?.error === "string" && parsed.error.trim()) ||
        (typeof parsed?.message === "string" && parsed.message.trim()) ||
        (typeof parsed?.raw === "string" && parsed.raw.trim()) ||
        "Failed to run model.";
      throw new Error(message);
    }
    eventName = "message";
  };

  while (!seenDone) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    while (true) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) break;
      let line = buffer.slice(0, newlineIndex);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      buffer = buffer.slice(newlineIndex + 1);
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

  return {
    fullContent,
    runId,
    engineId,
    modelId,
    inferenceSource,
  };
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
    const threads = rows
      .map(toThreadRecordFromCloud)
      .filter((thread) => thread.storage_mode === "cloud" && thread.thread_lane === "chat");

    try {
      const untitledThreadIds = threads
        .filter((thread) => isMissingThreadTitleValue(thread.title))
        .slice(0, MAX_DERIVED_THREAD_TITLES_PER_LIST)
        .map((thread) => thread.id);
      if (untitledThreadIds.length === 0) return threads;

      const titleByThreadId = new Map<string, { user: string | null; assistant: string | null }>();
      for (const threadId of untitledThreadIds) {
        titleByThreadId.set(threadId, { user: null, assistant: null });
      }

      for (const idsChunk of chunkArray(untitledThreadIds, TITLE_DERIVATION_CHUNK_SIZE)) {
        const encodedIds = idsChunk.map((id) => encodeURIComponent(id)).join(",");
        const limit = Math.max(idsChunk.length * 8, idsChunk.length);
        const response = await deps.fetchWithSupabaseAuth(
          `${url}/rest/v1/messages?select=thread_id,role,content_json,seq&thread_id=in.(${encodedIds})&role=in.(user,assistant)&order=seq.asc&limit=${limit}`,
          { method: "GET" },
          session,
        );
        if (!response.ok) throw new Error(await deps.readSupabaseError(response));
        const rows = (await response.json()) as CloudThreadTitleProbeRow[];
        for (const row of rows) {
          const threadId = String(row?.thread_id ?? "").trim();
          if (!threadId) continue;
          const current = titleByThreadId.get(threadId);
          if (!current) continue;
          const role = String(row?.role ?? "").trim().toLowerCase();
          const candidate = deriveThreadTitleFromCloudMessage(row?.content_json);
          if (!candidate) continue;
          if (role === "user" && !current.user) {
            current.user = candidate;
            continue;
          }
          if (role === "assistant" && !current.assistant) {
            current.assistant = candidate;
          }
        }
      }

      return threads.map((thread) => {
        if (!isMissingThreadTitleValue(thread.title)) return thread;
        const candidate = titleByThreadId.get(thread.id);
        const nextTitle = candidate?.user ?? candidate?.assistant ?? null;
        if (!nextTitle) return thread;
        return { ...thread, title: nextTitle };
      });
    } catch (error) {
      console.warn("Failed to derive cloud thread titles from message history:", error);
      return threads;
    }
  };

  const ensureDefaultCloudProjectId = async (session: SupabaseSession): Promise<string> => {
    const url = deps.getSupabaseUrl();
    if (!url) throw new Error("Missing Supabase URL.");
    const response = await deps.fetchWithSupabaseAuth(
      `${url}/rest/v1/rpc/ensure_default_cloud_project`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      session,
    );
    if (!response.ok) throw new Error(await deps.readSupabaseError(response));
    const payload = (await response.json()) as unknown;
    const rows = Array.isArray(payload) ? payload : [payload];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const projectId = String((row as Record<string, unknown>).id ?? "").trim();
      if (projectId) return projectId;
    }
    throw new Error("Default cloud project payload is missing id.");
  };

  const resolveCloudProjectId = async (
    preferredProjectId: string | null | undefined,
    session: SupabaseSession,
  ): Promise<string> => {
    const projectId = String(preferredProjectId ?? "").trim();
    if (projectId) return projectId;
    return ensureDefaultCloudProjectId(session);
  };

  const createCloudChatThread = async (
    thread: ThreadRecord,
    session: SupabaseSession,
  ): Promise<ThreadRecord | null> => {
    const url = deps.getSupabaseUrl();
    if (!url) throw new Error("Missing Supabase URL.");
    const projectId = await resolveCloudProjectId(thread.project_id, session);
    const response = await deps.fetchWithSupabaseAuth(
      `${url}/rest/v1/threads`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Thread identity fields are immutable after insert; do not upsert-update on conflict.
          Prefer: "resolution=ignore-duplicates,return=minimal",
        },
        body: JSON.stringify({
          id: thread.id,
          owner_id: deps.getSupabaseAuthUid(session),
          title: thread.title ?? null,
          engine_id: thread.engine_id,
          model_id: thread.model_id ?? null,
          thread_lane: "chat",
          project_id: projectId,
          community_id: thread.community_id ?? null,
        }),
      },
      session,
    );
    if (!response.ok) throw new Error(await deps.readSupabaseError(response));
    return (await getCloudThreadRecord(thread.id, session)) ?? thread;
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
  ): Promise<ThreadRecord | null> => {
    const url = deps.getSupabaseUrl();
    if (!url) throw new Error("Missing Supabase URL.");
    const thread = deps.getThreads().find((candidate) => candidate.id === threadId) ?? null;
    const canonicalThread = await getCloudThreadRecord(threadId, session);
    if (canonicalThread) return canonicalThread;
    const modelId = (thread?.model_id ?? deps.getActiveModelId() ?? "").trim();
    const projectId = await resolveCloudProjectId(thread?.project_id ?? null, session);
    const response = await deps.fetchWithSupabaseAuth(
      `${url}/rest/v1/threads`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Insert-only guardrail: conflict should be a no-op, never an UPDATE,
          // because owner/engine/community/created_at are immutable for normal users.
          Prefer: "resolution=ignore-duplicates,return=minimal",
        },
        body: JSON.stringify({
          id: threadId,
          owner_id: deps.getSupabaseAuthUid(session),
          title: thread?.title ?? null,
          engine_id: thread?.engine_id ?? "messages_agent",
          model_id: modelId || null,
          // Cloud chat API always manages chat-lane threads.
          thread_lane: "chat",
          project_id: projectId,
          community_id: thread?.community_id ?? null,
        }),
      },
      session,
    );
    if (!response.ok) {
      throw new Error(await deps.readSupabaseError(response));
    }
    return (await getCloudThreadRecord(threadId, session)) ?? thread;
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
    const messageId = (params.id ?? crypto.randomUUID()).trim() || crypto.randomUUID();
    const response = await deps.fetchWithSupabaseAuth(
      `${url}/rest/v1/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: messageId,
          thread_id: params.thread_id,
          seq: 0,
          role: params.role,
          content_json: parseCloudContentJson(params.content_json),
          ...(params.engine_id ? { engine_id: params.engine_id } : null),
          ...(params.model_id ? { model_id: params.model_id } : null),
          ...(params.run_id ? { run_id: params.run_id } : null),
        }),
      },
      params.session,
    );
    if (!response.ok) {
      throw new Error(await deps.readSupabaseError(response));
    }
  };

  const loadCommunityCustomSystemPrompt = async (params: {
    thread: ThreadRecord | null;
    session: SupabaseSession;
  }): Promise<CommunityCustomSystemPromptResult | null> => {
    const communityId = String(params.thread?.community_id ?? "").trim();
    if (!communityId) return null;
    const url = deps.getSupabaseUrl();
    if (!url) return null;
    try {
      const response = await deps.fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/get_active_community_agent_system_prompt`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            p_user_id: deps.getSupabaseAuthUid(params.session),
            p_community_id: communityId,
          }),
        },
        params.session,
      );
      if (!response.ok) return null;
      const payload = (await response.json()) as unknown;
      let prompt: string | null = null;
      let draftId: string | null = null;
      if (Array.isArray(payload)) {
        const row = payload[0] as Record<string, unknown> | undefined;
        prompt = typeof row?.system_prompt === "string" ? row.system_prompt.trim() : null;
        draftId = typeof row?.draft_id === "string" ? row.draft_id.trim() || null : null;
      } else if (payload && typeof payload === "object") {
        prompt = typeof (payload as Record<string, unknown>).system_prompt === "string"
          ? String((payload as Record<string, unknown>).system_prompt).trim()
          : null;
        draftId = typeof (payload as Record<string, unknown>).draft_id === "string"
          ? String((payload as Record<string, unknown>).draft_id).trim() || null
          : null;
      }
      if (!prompt) return null;
      return {
        draftId,
        systemPrompt: prompt,
      };
    } catch {
      return null;
    }
  };

  const sendCloudTurn = async (params: SendCloudTurnInput): Promise<void> => {
    const url = deps.getSupabaseUrl();
    if (!url) throw new Error("Missing Supabase URL.");
    const thread =
      (await ensureCloudThreadExists(params.thread_id, params.session)) ??
      deps.getThreads().find((candidate) => candidate.id === params.thread_id) ??
      null;
    if (!thread) {
      throw new Error("Cloud chat thread context unavailable. Please retry.");
    }
    const activeCommunityId = String(thread?.community_id ?? "").trim();
    const activeCommunityName =
      activeCommunityId && deps.getCommunityNameById ? deps.getCommunityNameById(activeCommunityId) : null;
    const threadLane = normalizeThreadLane(thread?.thread_lane ?? null, thread?.engine_id ?? null);
    if (threadLane !== "chat") {
      throw new Error(`Cloud turn requested for non-chat thread (${threadLane}).`);
    }
    const snapshotModelId = (params.sendPolicySnapshot?.selectedModelId ?? "").trim();
    const modelId = (snapshotModelId || thread?.model_id || deps.getActiveModelId() || "").trim();
    let hasChatgptAuth =
      Boolean(params.sendPolicySnapshot?.hasChatgptAuth) || deps.hasChatgptAuth();
    if (
      !hasChatgptAuth &&
      isDesktopChatgptEligibleAlias(modelId) &&
      deps.refreshHasChatgptAuth
    ) {
      try {
        hasChatgptAuth = Boolean(await deps.refreshHasChatgptAuth());
      } catch {
        // Fall back to local state when chatgpt auth refresh check fails.
      }
    }

    const userContentJson =
      params.user_content_json.trim().length > 0
        ? params.user_content_json
        : JSON.stringify({ text: params.input });

    const replyToId = crypto.randomUUID();
    await addCloudMessage({
      id: replyToId,
      thread_id: params.thread_id,
      role: "user",
      content_json: userContentJson,
      session: params.session,
    });

    const inferencePlan = resolveDesktopCloudInferenceExecutionPlan({
      modelId,
      freeModelAllowlist: deps.freeModelAllowlist,
      hasChatgptAuth,
      defaultGuestModelId: DEFAULT_GUEST_MODEL_ID,
    });

    const sanitizeAssistantText = (text: string, runId: string | null): string =>
      sanitizeUserFacingAssistantText({
        text,
        communityId: activeCommunityId || null,
        communityName: activeCommunityName,
        blockedIds: [params.thread_id, replyToId, runId],
      });

    let preparedMessagesPromise: Promise<LanePreparedMessages> | null = null;
    const loadPreparedMessages = async (): Promise<LanePreparedMessages> => {
      if (preparedMessagesPromise) return preparedMessagesPromise;

      preparedMessagesPromise = (async () => {
        const communityId = String(thread?.community_id ?? "").trim();
        const communityName =
          communityId && deps.getCommunityNameById ? deps.getCommunityNameById(communityId) : null;
        const customCommunitySystemPromptResult = await loadCommunityCustomSystemPrompt({
          thread,
          session: params.session,
        });
        const contextEnvelope = buildCloudCommunityContextEnvelope({
          communityId: communityId || null,
          communityName,
          customCommunitySystemPrompt: customCommunitySystemPromptResult?.systemPrompt ?? "",
          communityPromptDraftId: customCommunitySystemPromptResult?.draftId ?? null,
          personalSystemPrompt: deps.getPersonalSystemPrompt(),
        });
        const messagesResponse = await deps.fetchWithSupabaseAuth(
          `${url}/rest/v1/messages?select=role,content_json,seq&thread_id=eq.${encodeURIComponent(
            params.thread_id,
          )}&order=seq.desc&limit=40`,
          { method: "GET" },
          params.session,
        );
        if (!messagesResponse.ok) {
          throw new Error(await deps.readSupabaseError(messagesResponse));
        }
        const rowsDesc = (await messagesResponse.json()) as CloudMessageRow[];
        const publicMessages: CommunityInferenceChatMessage[] = [];
        for (const row of [...rowsDesc].reverse()) {
          const roleRaw = typeof row?.role === "string" ? row.role.trim().toLowerCase() : "";
          if (roleRaw !== "user" && roleRaw !== "assistant" && roleRaw !== "system") continue;
          const content = extractTextFromCloudContent(row.content_json).trim();
          if (!content) continue;
          publicMessages.push({
            role: roleRaw,
            content,
          });
        }
        if (publicMessages.length === 0 || publicMessages[publicMessages.length - 1]?.role !== "user") {
          const fallbackText = extractTextFromCloudContent(parseCloudContentJson(userContentJson)).trim();
          const content = fallbackText || params.input.trim();
          if (content) {
            publicMessages.push({
              role: "user",
              content,
            });
          }
        }
        if (publicMessages.length === 0 || publicMessages[publicMessages.length - 1]?.role !== "user") {
          throw new Error("No user message available for turn.");
        }
        const latestUserText = resolveLatestUserQueryFromInferenceMessages({
          messages: publicMessages,
          fallbackQuery: params.input,
        });
        const communityPreflight = await loadCloudCommunityContextPreflight({
          getSupabaseUrl: deps.getSupabaseUrl,
          fetchWithSupabaseAuth: deps.fetchWithSupabaseAuth,
          session: params.session,
          communityId: communityId || null,
          communityName,
          query: latestUserText,
        });

        const laneMessages = prependCommunityPreludeMessages({
          messages: publicMessages,
          systemPrompt: contextEnvelope.scopedSystemPrompt,
          communityEvidenceUserMessage: communityPreflight.communityEvidenceUserMessage,
        });
        return { laneMessages, contextEnvelope, communityPreflight };
      })();

      return preparedMessagesPromise;
    };

    const persistAssistantMessage = async (args: {
      text: string;
      runId: string | null;
      engineId: string;
      resolvedModelId: string;
      inferenceSource: string;
      prepared: LanePreparedMessages;
      fallbackTrace?: Array<{ from: string; to: string; reason: string }>;
    }): Promise<void> => {
      const assistantMeta: Record<string, unknown> = {
        ...(args.resolvedModelId ? { model_id: args.resolvedModelId } : null),
        inference_source: args.inferenceSource,
      };
      if (args.prepared.contextEnvelope.communityId) {
        assistantMeta.context_community_id = args.prepared.contextEnvelope.communityId;
      }
      if (args.prepared.contextEnvelope.communityPromptDraftId) {
        assistantMeta.community_agent_draft_id = args.prepared.contextEnvelope.communityPromptDraftId;
      }
      if (args.prepared.contextEnvelope.communitySystemPromptSource) {
        assistantMeta.community_system_prompt_source = args.prepared.contextEnvelope.communitySystemPromptSource;
      }
      if (args.prepared.communityPreflight.communityEvidenceUsedV1) {
        assistantMeta.community_evidence_used_v1 = args.prepared.communityPreflight.communityEvidenceUsedV1;
      }
      if (args.prepared.communityPreflight.communityContextDiagnostics) {
        assistantMeta.community_context_diagnostics = args.prepared.communityPreflight.communityContextDiagnostics;
      }
      if (args.fallbackTrace && args.fallbackTrace.length > 0) {
        assistantMeta.inference_lane_fallbacks = args.fallbackTrace;
      }
      const safeAssistantText = sanitizeAssistantText(args.text, args.runId);
      const assistantPayload = JSON.stringify({
        text: safeAssistantText,
        meta: assistantMeta,
      });
      await addCloudMessage({
        thread_id: params.thread_id,
        role: "assistant",
        content_json: assistantPayload,
        engine_id: args.engineId,
        model_id: args.resolvedModelId || null,
        run_id: args.runId,
        session: params.session,
      });
    };

    const runPublicLane = async (
      publicModelId: string,
      fallbackTrace: Array<{ from: string; to: string; reason: string }>,
    ): Promise<void> => {
      const prepared = await loadPreparedMessages();
      if (isCommunityHarnessUnavailablePreflight(prepared.communityPreflight)) {
        throw new Error(getCommunityHarnessUnavailableErrorMessage());
      }
      const laneMessages = prepared.laneMessages;

      for (let attempt = 0; attempt <= PUBLIC_EMPTY_RESPONSE_MAX_RETRIES; attempt += 1) {
        const publicResponse = await deps.fetchWithSupabasePublic(
          `${url}/functions/v1/public_turn`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model_id: publicModelId,
              stream: true,
              messages: laneMessages,
            }),
          },
        );
        if (!publicResponse.ok) {
          const failure = await readSupabaseFunctionError(publicResponse);
          throw new Error(formatSupabaseFunctionErrorMessage(failure));
        }
        const streamResult = await consumeSseResponse(publicResponse, {
          defaultEngineId: "public_openrouter",
          defaultModelId: publicModelId,
          defaultInferenceSource: "free",
          sanitizeText: (text) => sanitizeAssistantText(text, null),
          onStreamEvent: params.onStreamEvent,
        });
        const assistantText = streamResult.fullContent.trim();
        if (assistantText) {
          const resolvedModelId = (streamResult.modelId ?? modelId ?? "").trim();
          const resolvedInferenceSource = (streamResult.inferenceSource ?? "free").trim() || "free";
          await persistAssistantMessage({
            text: assistantText,
            runId: streamResult.runId,
            engineId: (streamResult.engineId ?? "public_openrouter").trim() || "public_openrouter",
            resolvedModelId: resolvedModelId || publicModelId,
            inferenceSource: resolvedInferenceSource,
            prepared,
            fallbackTrace,
          });
          return;
        }

        const hasRetryRemaining = attempt < PUBLIC_EMPTY_RESPONSE_MAX_RETRIES;
        if (!hasRetryRemaining) break;
        console.warn("Public lane returned empty assistant text; retrying once.", {
          thread_id: params.thread_id,
          model_id: publicModelId,
          attempt: attempt + 1,
        });
      }

      throw new Error("Public model returned an empty response. Please retry.");
    };

    const runChatgptLane = async (
      fallbackTrace: Array<{ from: string; to: string; reason: string }>,
    ): Promise<void> => {
      const prepared = await loadPreparedMessages();
      if (isCommunityHarnessUnavailablePreflight(prepared.communityPreflight)) {
        throw new RetryNextInferenceLaneError({
          lane: "chatgpt",
          reasonCode: COMMUNITY_HARNESS_UNAVAILABLE_FAILURE_CLASS,
          message: getCommunityHarnessUnavailableErrorMessage(),
        });
      }
      const laneMessages = buildChatgptLaneMessages({
        messages: prepared.laneMessages,
        communityEvidenceUserMessage: prepared.communityPreflight.communityEvidenceUserMessage,
      });
      const runId = `desktop_chatgpt:${crypto.randomUUID()}`;
      let chatgptResult: Awaited<ReturnType<CreateDesktopCloudChatThreadApiDeps["chatgptCloudTurn"]>>;
      try {
        chatgptResult = await deps.chatgptCloudTurn({
          model_id: modelId,
          messages: laneMessages,
          max_tokens: null,
        });
      } catch (error) {
        const message =
          typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "ChatGPT inference failed.";
        if (shouldFallbackFromChatgptErrorToPlatform(message)) {
          throw new RetryNextInferenceLaneError({
            lane: "chatgpt",
            reasonCode: "chatgpt_unavailable",
            message,
          });
        }
        throw error;
      }

      const assistantText = chatgptResult.text.trim();
      if (!assistantText) {
        throw new RetryNextInferenceLaneError({
          lane: "chatgpt",
          reasonCode: "chatgpt_empty_response",
          message: "ChatGPT returned an empty response.",
        });
      }
      const safeAssistantText = sanitizeAssistantText(assistantText, runId);

      params.onStreamEvent?.({
        type: "start",
        runId,
        engineId: "desktop_chatgpt",
        modelId: chatgptResult.model_id ?? modelId ?? null,
        inferenceSource: "chatgpt",
        promptTokens: null,
        completionTokens: null,
        maxTokens: null,
      });
      params.onStreamEvent?.({
        type: "delta",
        delta: safeAssistantText,
        fullContent: safeAssistantText,
        promptTokens: null,
        completionTokens: null,
        maxTokens: null,
      });
      params.onStreamEvent?.({ type: "done" });

      const resolvedModelId = (chatgptResult.model_id ?? modelId ?? "").trim();
      await persistAssistantMessage({
        text: safeAssistantText,
        runId,
        engineId: "desktop_chatgpt",
        resolvedModelId: resolvedModelId || modelId,
        inferenceSource: "chatgpt",
        prepared,
        fallbackTrace,
      });
    };

    const runPlatformLane = async (
      fallbackTrace: Array<{ from: string; to: string; reason: string }>,
    ): Promise<void> => {
      const runLegacyPlatformLane = async (): Promise<void> => {
        const turnResponse = await deps.fetchWithSupabaseAuth(
          `${url}/functions/v1/agent_turn`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              thread_id: params.thread_id,
              reply_to_id: replyToId,
              stream: true,
              mode: "respond",
              ...(modelId ? { model_id: modelId } : null),
              ...(fallbackTrace.length > 0
                ? { inference_lane_fallbacks: fallbackTrace }
                : null),
            }),
          },
          params.session,
        );
        if (!turnResponse.ok) {
          const failure = await readSupabaseFunctionError(turnResponse);
          const message = formatSupabaseFunctionErrorMessage(failure);
          if (shouldFallbackFromPlatformErrorToPublic(failure)) {
            throw new RetryNextInferenceLaneError({
              lane: "platform",
              reasonCode: failure.code ?? failure.category,
              message,
            });
          }
          throw new Error(message);
        }
        await consumeSseResponse(turnResponse, {
          sanitizeText: (text) => sanitizeAssistantText(text, null),
          onStreamEvent: params.onStreamEvent,
        });
      };

      if (!deps.runtimeTurnV2Enabled) {
        await runLegacyPlatformLane();
        return;
      }

      const prepared = await loadPreparedMessages();
      if (isCommunityHarnessUnavailablePreflight(prepared.communityPreflight)) {
        throw new RetryNextInferenceLaneError({
          lane: "platform",
          reasonCode: COMMUNITY_HARNESS_UNAVAILABLE_FAILURE_CLASS,
          message: getCommunityHarnessUnavailableErrorMessage(),
        });
      }
      const runtimeTurnResponse = await deps.fetchWithSupabaseAuth(
        `${url}/functions/v1/runtime_turn`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            thread_id: params.thread_id,
            stream: true,
            surface: "desktop",
            requires_tools: false,
            model_id: modelId,
            prefer_chatgpt_lane: false,
            idempotency_key: `desktop_runtime:${replyToId}`,
            messages: prepared.laneMessages,
          }),
        },
        params.session,
      );
      if (!runtimeTurnResponse.ok) {
        const failure = await readSupabaseFunctionError(runtimeTurnResponse);
        const message = formatSupabaseFunctionErrorMessage(failure);
        if (shouldFallbackFromPlatformErrorToPublic(failure)) {
          throw new RetryNextInferenceLaneError({
            lane: "platform",
            reasonCode: failure.code ?? failure.category,
            message,
          });
        }
        const code = String(failure.code ?? "").trim().toLowerCase();
        if (failure.status >= 500 || runtimeTurnLegacyFallbackCodes.has(code)) {
          await runLegacyPlatformLane();
          return;
        }
        throw new Error(message);
      }

      const streamResult = await consumeSseResponse(runtimeTurnResponse, {
        defaultEngineId: "runtime_turn",
        defaultModelId: modelId,
        defaultInferenceSource: "platform",
        sanitizeText: (text) => sanitizeAssistantText(text, null),
        onStreamEvent: params.onStreamEvent,
      });
      const assistantText = streamResult.fullContent.trim();
      if (!assistantText) {
        throw new Error("Runtime turn returned an empty response.");
      }
      await persistAssistantMessage({
        text: assistantText,
        runId: streamResult.runId,
        engineId: (streamResult.engineId ?? "runtime_turn").trim() || "runtime_turn",
        resolvedModelId: (streamResult.modelId ?? modelId ?? "").trim() || modelId,
        inferenceSource: (streamResult.inferenceSource ?? "platform").trim() || "platform",
        prepared,
        fallbackTrace,
      });
    };

    const fallbackTrace: Array<{ from: string; to: string; reason: string }> = [];
    for (const lane of inferencePlan.laneOrder) {
      try {
        if (lane === "chatgpt") {
          await runChatgptLane(fallbackTrace);
          return;
        }
        if (lane === "platform") {
          await runPlatformLane(fallbackTrace);
          return;
        }
        const publicModelId =
          inferencePlan.primaryLane === "public"
            ? modelId
            : inferencePlan.publicFallbackModelId;
        await runPublicLane(publicModelId, fallbackTrace);
        return;
      } catch (error) {
        if (!(error instanceof RetryNextInferenceLaneError)) throw error;
        const nextIndex = inferencePlan.laneOrder.indexOf(lane) + 1;
        const nextLane = inferencePlan.laneOrder[nextIndex] ?? null;
        if (!nextLane) throw error;
        recordInferenceFallbackTelemetry({
          threadId: params.thread_id,
          modelId,
          from: error.lane,
          to: nextLane,
          reason: error.reasonCode,
        });
        fallbackTrace.push({
          from: error.lane,
          to: nextLane,
          reason: error.reasonCode,
        });
      }
    }
    throw new Error("No inference lane available.");
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
