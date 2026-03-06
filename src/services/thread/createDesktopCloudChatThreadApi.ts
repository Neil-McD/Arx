import { ThreadRecord } from "../../runtime/arp/types";
import type { ThreadServiceTurnStreamEvent } from "../../../shared/threadService";
import { normalizeThreadLane } from "../../../shared/threadSidebarSelectors";
import { resolveDesktopCloudInferenceExecutionPlan } from "../../../shared/inferenceLaneResolver";
import { deriveThreadTitleFromUserText, isMissingThreadTitleValue } from "../../../shared/threadTitleUi";
import { buildCloudCommunityContextEnvelope } from "../../../shared/communityContextEnvelope";

import { fetchActiveCloudCommunityAgentSystemPrompt } from "../../../shared/cloudCommunityAgentGateway";
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
  formatCloudFunctionErrorMessage,
  readCloudFunctionError,
  shouldFallbackFromChatgptErrorToPlatform,
} from "../../../shared/cloudFunctionErrors";
import {
  invokeCloudRuntimeTurn,
  requireCloudRuntimeBaseUrl,
  type CloudRuntimeTransport,
} from "../../../shared/cloudRuntimeTransport";
import { probeConvexAuthenticatedActorSession } from "../../../shared/convexAuthSessionProbe";
import { DEFAULT_GUEST_MODEL_ID } from "../../../shared/modelCatalog";
import { ensureDefaultCloudProjectId } from "../../../shared/daytonaCloudProjects";
import {
  getConvexCloudThreadRowByThreadKey,
  isConvexCloudThreadsEnabled,
  listConvexCloudThreadMessagesPageByThreadKey,
  listConvexCloudThreadRows,
} from "../../../shared/daytonaCloudThreadsRead";
import {
  addCloudThreadMessage,
  archiveCloudThreadRecord,
  ensureCloudThreadRecord,
  updateCloudThreadRecord,
} from "../../../shared/cloudThreadsGateway";

type DesktopCloudSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: {
    id: string;
    email?: string;
  };
};

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

type FetchWithCloudAuth = (
  url: string,
  init: RequestInit,
  session: DesktopCloudSession,
) => Promise<Response>;
type FetchWithCloudPublic = (url: string, init?: RequestInit) => Promise<Response>;

type CreateDesktopCloudChatThreadApiDeps = {
  getCloudRuntimeBaseUrl: () => string | null;
  fetchWithCloudAuth: FetchWithCloudAuth;
  fetchWithCloudPublic: FetchWithCloudPublic;
  readCloudError: (response: Response) => Promise<string>;
  getCloudAuthUid: (session: DesktopCloudSession) => string;
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
  session: DesktopCloudSession;
};

type SetCloudThreadEngineInput = {
  thread_id: string;
  engine_id: string;
  model_id: string | null;
  session: DesktopCloudSession;
};

type AddCloudMessageInput = {
  id?: string;
  thread_id: string;
  role: "user" | "assistant";
  content_json: string;
  engine_id?: string | null;
  model_id?: string | null;
  run_id?: string | null;
  session: DesktopCloudSession;
};

type SendCloudTurnInput = {
  thread_id: string;
  input: string;
  user_content_json: string;
  session: DesktopCloudSession;
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
const MAX_DERIVED_THREAD_TITLES_PER_LIST = 80;

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
  assistantMessageId: string | null;
  assistantMessageKey: string | null;
  assistantMessageSeq: number | null;
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
  let assistantMessageId: string | null = null;
  let assistantMessageKey: string | null = null;
  let assistantMessageSeq: number | null = null;

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
      if (typeof parsed?.assistant_message_id === "string" && parsed.assistant_message_id.trim()) {
        assistantMessageId = parsed.assistant_message_id.trim();
      }
      if (typeof parsed?.assistant_message_key === "string" && parsed.assistant_message_key.trim()) {
        assistantMessageKey = parsed.assistant_message_key.trim();
      }
      const maybeAssistantSeq = parseOptionalNumber(parsed?.assistant_message_seq);
      if (maybeAssistantSeq !== null) {
        assistantMessageSeq = Math.max(0, Math.floor(maybeAssistantSeq));
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
    assistantMessageId,
    assistantMessageKey,
    assistantMessageSeq,
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
    session: DesktopCloudSession,
  ): Promise<ThreadRecord | null> => {
    if (!isConvexCloudThreadsEnabled()) {
      throw new Error("Convex is required for cloud thread records in this build.");
    }
    try {
      const convexRow = await getConvexCloudThreadRowByThreadKey({
        session,
        threadKey: threadId,
      });
      if (!convexRow?.id) return null;
      const next = toThreadRecordFromCloud(convexRow);
      deps.setThreads((prev) => {
        const index = prev.findIndex((thread) => thread.id === next.id);
        if (index === -1) return [next, ...prev];
        const copy = [...prev];
        copy[index] = next;
        return copy;
      });
      return next;
    } catch (error) {
      console.warn("Failed to load cloud thread context from Convex:", error);
      return null;
    }
  };

  const listCloudChatThreads = async (session: DesktopCloudSession): Promise<ThreadRecord[]> => {
    if (!isConvexCloudThreadsEnabled()) {
      throw new Error("Convex is required for cloud threads in this build.");
    }
    const convexRows = await listConvexCloudThreadRows(session);
    if (!convexRows) return [];
    const threads = convexRows
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
      await Promise.all(
        untitledThreadIds.map(async (threadId) => {
          const current = titleByThreadId.get(threadId);
          if (!current) return;
          const rows = await listConvexCloudThreadMessagesPageByThreadKey({
            session,
            threadKey: threadId,
            pageSize: 12,
            maxScan: 2000,
          });
          if (!rows || rows.length === 0) return;
          const orderedRows = [...rows].sort((a, b) => {
            const left = parseOptionalNumber(a.seq) ?? 0;
            const right = parseOptionalNumber(b.seq) ?? 0;
            return left - right;
          });
          for (const row of orderedRows) {
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
            if (current.user && current.assistant) break;
          }
        }),
      );

      return threads.map((thread) => {
        if (!isMissingThreadTitleValue(thread.title)) return thread;
        const candidate = titleByThreadId.get(thread.id);
        const nextTitle = candidate?.user ?? candidate?.assistant ?? null;
        if (!nextTitle) return thread;
        return { ...thread, title: nextTitle };
      });
    } catch (error) {
      console.warn("Failed to derive cloud thread titles from Convex message history:", error);
      return threads;
    }
  };

  const ensureDefaultCloudProjectIdForSession = async (session: DesktopCloudSession): Promise<string> => {
    return await ensureDefaultCloudProjectId({
      session,
    });
  };

  const resolveCloudProjectId = async (
    preferredProjectId: string | null | undefined,
    session: DesktopCloudSession,
  ): Promise<string> => {
    const projectId = String(preferredProjectId ?? "").trim();
    if (projectId) return projectId;
    return ensureDefaultCloudProjectIdForSession(session);
  };

  const createCloudChatThread = async (
    thread: ThreadRecord,
    session: DesktopCloudSession,
  ): Promise<ThreadRecord | null> => {
    const projectId = await resolveCloudProjectId(thread.project_id, session);
    await ensureCloudThreadRecord({
      session,
      thread: {
        threadId: thread.id,
        title: thread.title,
        engineId: thread.engine_id,
        modelId: thread.model_id,
        projectId,
        communityId: thread.community_id,
        contextVersion: thread.context_version,
      },
    });
    return await getCloudThreadRecord(thread.id, session);
  };

  const deleteCloudChatThread = async (threadId: string, session: DesktopCloudSession): Promise<void> => {
    await archiveCloudThreadRecord({
      session,
      threadId,
    });
  };

  const ensureCloudThreadExists = async (
    threadId: string,
    session: DesktopCloudSession,
  ): Promise<ThreadRecord | null> => {
    const thread = deps.getThreads().find((candidate) => candidate.id === threadId) ?? null;
    const modelId = (thread?.model_id ?? deps.getActiveModelId() ?? "").trim();
    const projectId = await resolveCloudProjectId(thread?.project_id ?? null, session);
    await ensureCloudThreadRecord({
      session,
      thread: {
        threadId,
        title: thread?.title ?? null,
        engineId: thread?.engine_id ?? "messages_agent",
        modelId: modelId || null,
        projectId,
        communityId: thread?.community_id ?? null,
        contextVersion: thread?.context_version ?? 0,
      },
    });
    return await getCloudThreadRecord(threadId, session);
  };

  const setCloudThreadTitle = async (params: SetCloudThreadTitleInput): Promise<void> => {
    await updateCloudThreadRecord({
      session: params.session,
      thread: {
        threadId: params.thread_id,
        title: params.title,
      },
    });
  };

  const setCloudThreadEngine = async (
    params: SetCloudThreadEngineInput,
  ): Promise<ThreadRecord | null> => {
    await updateCloudThreadRecord({
      session: params.session,
      thread: {
        threadId: params.thread_id,
        engineId: params.engine_id,
        modelId: params.model_id,
      },
    });
    return getCloudThreadRecord(params.thread_id, params.session);
  };

  const addCloudMessage = async (params: AddCloudMessageInput): Promise<void> => {
    if (!isConvexCloudThreadsEnabled()) {
      throw new Error("Convex cloud threads are not enabled.");
    }
    await ensureCloudThreadExists(params.thread_id, params.session);
    const messageId = (params.id ?? crypto.randomUUID()).trim() || crypto.randomUUID();
    const parsedContentJson = parseCloudContentJson(params.content_json);
    await addCloudThreadMessage({
      session: params.session,
      message: {
        threadId: params.thread_id,
        messageId,
        role: params.role,
        contentJson: parsedContentJson,
        engineId: params.engine_id,
        modelId: params.model_id,
        runId: params.run_id,
      },
    });
  };

  const loadCommunityCustomSystemPrompt = async (params: {
    thread: ThreadRecord | null;
    session: DesktopCloudSession;
  }): Promise<CommunityCustomSystemPromptResult | null> => {
    const communityId = String(params.thread?.community_id ?? "").trim();
    if (!communityId) return null;
    const url = deps.getCloudRuntimeBaseUrl();
    if (!url) return null;
    try {
      const result = await fetchActiveCloudCommunityAgentSystemPrompt({
        session: params.session,
        userId: deps.getCloudAuthUid(params.session),
        communityId,
      });
      if (!result?.systemPrompt) return null;
      return {
        draftId: result.draftId,
        systemPrompt: result.systemPrompt,
      };
    } catch {
      return null;
    }
  };

  const sendCloudTurn = async (params: SendCloudTurnInput): Promise<void> => {
    const baseUrl = requireCloudRuntimeBaseUrl(deps.getCloudRuntimeBaseUrl);
    const cloudTransport: CloudRuntimeTransport<DesktopCloudSession> = {
      baseUrl,
      fetchPublic: deps.fetchWithCloudPublic,
      fetchAuth: deps.fetchWithCloudAuth,
    };
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
        const rowsDesc: CloudMessageRow[] = isConvexCloudThreadsEnabled()
          ? ((await listConvexCloudThreadMessagesPageByThreadKey({
              session: params.session,
              threadKey: params.thread_id,
              pageSize: 40,
              maxScan: 2000,
            })) ?? [])
              .slice()
              .sort((a, b) => {
                const left = parseOptionalNumber(a.seq) ?? 0;
                const right = parseOptionalNumber(b.seq) ?? 0;
                return right - left;
              })
          : [];
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
          getCloudRuntimeBaseUrl: deps.getCloudRuntimeBaseUrl,
          fetchWithCloudAuth: deps.fetchWithCloudAuth,
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

    const runPlatformLane = async (): Promise<void> => {

      const prepared = await loadPreparedMessages();
      if (isCommunityHarnessUnavailablePreflight(prepared.communityPreflight)) {
        throw new RetryNextInferenceLaneError({
          lane: "platform",
          reasonCode: COMMUNITY_HARNESS_UNAVAILABLE_FAILURE_CLASS,
          message: getCommunityHarnessUnavailableErrorMessage(),
        });
      }
      const runtimeTurnResponse = await invokeCloudRuntimeTurn({
        transport: cloudTransport,
        session: params.session,
        payload: {
          thread_id: params.thread_id,
          stream: true,
          surface: "desktop",
          requires_tools: true,
          model_id: modelId,
          idempotency_key: `desktop_runtime:${replyToId}`,
          messages: prepared.laneMessages,
        },
      });
      if (!runtimeTurnResponse.ok) {
        const failure = await readCloudFunctionError(runtimeTurnResponse);
        let message = formatCloudFunctionErrorMessage(failure);
        if (failure.category === "auth") {
          // Function-lane auth failures can be verifier/config drift while the
          // desktop session is still valid. Confirm auth truth before showing
          // a sign-in error.
          try {
            const hasConvexActorSession = await probeConvexAuthenticatedActorSession(params.session);
            if (hasConvexActorSession) {
              const base = "Arx AI is temporarily unavailable. Please retry.";
              message =
                failure.requestId && !base.toLowerCase().includes("request_id=")
                  ? `${base} (request_id=${failure.requestId})`
                  : base;
            }
          } catch {
            // fall through: true auth/session failure should keep sign-in copy.
          }
        }
        // Tool-capable cloud turns are deterministic Daytona runs; never degrade to public lane.
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
      if (!streamResult.assistantMessageId) {
        throw new Error("Runtime turn did not persist assistant message.");
      }
    };

    const fallbackTrace: Array<{ from: string; to: string; reason: string }> = [];
    for (const lane of inferencePlan.laneOrder) {
      try {
        if (lane === "chatgpt") {
          await runChatgptLane(fallbackTrace);
          return;
        }
        if (lane === "platform") {
          await runPlatformLane();
          return;
        }
        throw new Error("Cloud tool turns do not support public-lane fallback.");
      } catch (error) {
        if (!(error instanceof RetryNextInferenceLaneError)) throw error;
        const nextIndex = inferencePlan.laneOrder.indexOf(lane) + 1;
        const nextLane = inferencePlan.laneOrder[nextIndex] ?? null;
        if (!nextLane) throw error;
        if (nextLane === "public") {
          throw new Error("Cloud tool turns do not support public-lane fallback.");
        }
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
