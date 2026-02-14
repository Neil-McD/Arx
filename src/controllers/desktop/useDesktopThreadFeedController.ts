import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { RuntimeClient } from "../../runtime/arp/client";
import type { EventRecord, MessageRecord, ThreadRecord, ToolCallRecord } from "../../runtime/arp/types";
import type { SupabaseSession } from "../../../shared/supabaseAuthCore";

const MESSAGE_PAGE_SIZE = 200;
const DELTA_EVENTS_PAGE_SIZE = 300;
const TOOL_CALL_PAGE_SIZE = 120;
const TOOL_CALLS_MIN_RELOAD_INTERVAL_MS = 400;

type CloudThreadMessageRow = {
  id: string;
  thread_id: string;
  seq: number;
  role: string;
  content_json: unknown;
  engine_id: string | null;
  model_id: string | null;
  run_id: string | null;
  created_at: string | number | null;
};

type UseDesktopThreadFeedControllerArgs = {
  activeThreadId: string | null;
  runtimeClient: RuntimeClient;
  runtimeSupportsCursorResume: boolean;
  messages: MessageRecord[];
  setMessages: Dispatch<SetStateAction<MessageRecord[]>>;
  setToolCalls: Dispatch<SetStateAction<ToolCallRecord[]>>;
  threads: ThreadRecord[];
  resolveThreadStorageMode: (threadId: string) => "cloud" | "local";
  supabaseSessionRef: { current: SupabaseSession | null };
  getSupabaseUrl: () => string | null;
  fetchWithSupabaseAuth: (
    input: string,
    init: RequestInit,
    session: SupabaseSession,
  ) => Promise<Response>;
  readSupabaseError: (response: Response) => Promise<string>;
};

function toUnixSecondsFromIso(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000);
}

function serializeCloudContentJson(content: unknown): string {
  if (content && typeof content === "object") {
    return JSON.stringify(content);
  }
  if (typeof content === "string") {
    const trimmed = content.trim();
    if (!trimmed) return JSON.stringify({ text: "" });
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        return JSON.stringify(parsed);
      }
    } catch {
      // Keep as plain text payload.
    }
    return JSON.stringify({ text: content });
  }
  if (typeof content === "number" || typeof content === "boolean") {
    return JSON.stringify({ text: String(content) });
  }
  return JSON.stringify({ text: "" });
}

function toMessageRecordFromCloud(row: CloudThreadMessageRow): MessageRecord {
  const createdAt =
    typeof row.created_at === "number" && Number.isFinite(row.created_at)
      ? row.created_at
      : toUnixSecondsFromIso(typeof row.created_at === "string" ? row.created_at : null) ??
        Math.floor(Date.now() / 1000);
  return {
    id: row.id,
    session_id: row.thread_id,
    seq: typeof row.seq === "number" && Number.isFinite(row.seq) ? row.seq : null,
    role: row.role,
    content_json: serializeCloudContentJson(row.content_json),
    created_at: createdAt,
    engine_id: row.engine_id ?? null,
    model_id: row.model_id ?? null,
    run_id: row.run_id ?? null,
  };
}

function normalizeContentJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch {
    return raw;
  }
}

function sameToolCallList(prev: ToolCallRecord[], next: ToolCallRecord[]): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    const a = prev[i];
    const b = next[i];
    if (
      a.id !== b.id ||
      a.status !== b.status ||
      a.updated_at !== b.updated_at ||
      a.run_id !== b.run_id ||
      a.tool_name !== b.tool_name
    ) {
      return false;
    }
  }
  return true;
}

export function useDesktopThreadFeedController(args: UseDesktopThreadFeedControllerArgs) {
  const {
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
  } = args;

  const activeThreadIdRef = useRef<string | null>(activeThreadId);
  const loadMessagesRequestSeqRef = useRef(0);
  const eventCursorByThreadRef = useRef<Record<string, number>>({});
  const cursorResumeDisabledByThreadRef = useRef<Record<string, true>>({});
  const toolCallsLastLoadedAtByThreadRef = useRef<Record<string, number>>({});
  const toolCallsReloadTimerByThreadRef = useRef<Record<string, number>>({});
  const toolCallsLoadInFlightByThreadRef = useRef<Record<string, true>>({});
  const toolCallsQueuedByThreadRef = useRef<Record<string, true>>({});
  const [hasOlderMessagesByThreadId, setHasOlderMessagesByThreadId] = useState<
    Record<string, boolean>
  >({});
  const [messageLoadErrorByThreadId, setMessageLoadErrorByThreadId] = useState<
    Record<string, string | null>
  >({});
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
    setIsLoadingOlderMessages(false);
  }, [activeThreadId]);

  useEffect(() => {
    return () => {
      for (const timerId of Object.values(toolCallsReloadTimerByThreadRef.current)) {
        window.clearTimeout(timerId);
      }
      toolCallsReloadTimerByThreadRef.current = {};
    };
  }, []);

  const setHasOlderMessages = useCallback((threadId: string, value: boolean) => {
    setHasOlderMessagesByThreadId((prev) =>
      prev[threadId] === value ? prev : { ...prev, [threadId]: value },
    );
  }, []);

  const setMessageLoadError = useCallback((threadId: string, message: string | null) => {
    setMessageLoadErrorByThreadId((prev) => {
      if ((prev[threadId] ?? null) === message) return prev;
      return { ...prev, [threadId]: message };
    });
  }, []);

  const resolveThreadStorageModeSafe = useCallback(
    (threadId: string): "cloud" | "local" => {
      try {
        return resolveThreadStorageMode(threadId);
      } catch (error) {
        console.warn(`Failed to resolve thread storage mode for ${threadId}; defaulting to local.`, error);
        return "local";
      }
    },
    [resolveThreadStorageMode],
  );

  const loadToolCalls = useCallback(
    async (sessionId: string, opts?: { force?: boolean }) => {
      if (activeThreadIdRef.current !== sessionId) return;
      const storageMode = resolveThreadStorageModeSafe(sessionId);
      if (storageMode === "cloud") {
        setToolCalls((prev) => (prev.length === 0 ? prev : []));
        return;
      }

      const now = Date.now();
      const lastLoadedAt = toolCallsLastLoadedAtByThreadRef.current[sessionId] ?? 0;
      const force = opts?.force === true;
      if (!force && now - lastLoadedAt < TOOL_CALLS_MIN_RELOAD_INTERVAL_MS) {
        toolCallsQueuedByThreadRef.current[sessionId] = true;
        if (!toolCallsReloadTimerByThreadRef.current[sessionId]) {
          const waitMs = TOOL_CALLS_MIN_RELOAD_INTERVAL_MS - (now - lastLoadedAt);
          toolCallsReloadTimerByThreadRef.current[sessionId] = window.setTimeout(() => {
            delete toolCallsReloadTimerByThreadRef.current[sessionId];
            void loadToolCalls(sessionId);
          }, Math.max(1, waitMs));
        }
        return;
      }

      if (toolCallsLoadInFlightByThreadRef.current[sessionId]) {
        toolCallsQueuedByThreadRef.current[sessionId] = true;
        return;
      }

      toolCallsLoadInFlightByThreadRef.current[sessionId] = true;
      try {
        const data = await runtimeClient.listToolCalls(sessionId, TOOL_CALL_PAGE_SIZE);
        toolCallsLastLoadedAtByThreadRef.current[sessionId] = Date.now();
        if (activeThreadIdRef.current !== sessionId) return;
        setToolCalls((prev) => (sameToolCallList(prev, data) ? prev : data));
      } catch {
        if (activeThreadIdRef.current !== sessionId) return;
        setToolCalls((prev) => (prev.length === 0 ? prev : []));
      } finally {
        delete toolCallsLoadInFlightByThreadRef.current[sessionId];
        const queued = toolCallsQueuedByThreadRef.current[sessionId];
        delete toolCallsQueuedByThreadRef.current[sessionId];
        if (queued) {
          if (toolCallsReloadTimerByThreadRef.current[sessionId]) {
            window.clearTimeout(toolCallsReloadTimerByThreadRef.current[sessionId]);
            delete toolCallsReloadTimerByThreadRef.current[sessionId];
          }
          const elapsed = Date.now() - (toolCallsLastLoadedAtByThreadRef.current[sessionId] ?? 0);
          const waitMs = Math.max(0, TOOL_CALLS_MIN_RELOAD_INTERVAL_MS - elapsed);
          toolCallsReloadTimerByThreadRef.current[sessionId] = window.setTimeout(() => {
            delete toolCallsReloadTimerByThreadRef.current[sessionId];
            void loadToolCalls(sessionId);
          }, waitMs);
        }
      }
    },
    [resolveThreadStorageModeSafe, runtimeClient, setToolCalls],
  );

  const fetchCloudMessagesPage = useCallback(
    async (sessionId: string, beforeSeq?: number): Promise<MessageRecord[]> => {
      const session = supabaseSessionRef.current;
      const url = session ? getSupabaseUrl() : null;
      if (!session || !url) {
        throw new Error("Sign in to load cloud chat thread messages.");
      }

      const beforeFilter =
        typeof beforeSeq === "number" && Number.isFinite(beforeSeq) && beforeSeq > 0
          ? `&seq=lt.${Math.floor(beforeSeq)}`
          : "";
      const response = await fetchWithSupabaseAuth(
        `${url}/rest/v1/messages?select=id,thread_id,seq,role,content_json,engine_id,model_id,run_id,created_at&thread_id=eq.${encodeURIComponent(
          sessionId,
        )}${beforeFilter}&order=seq.desc&limit=${MESSAGE_PAGE_SIZE}`,
        { method: "GET" },
        session,
      );
      if (!response.ok) {
        throw new Error(await readSupabaseError(response));
      }
      const rows = (await response.json()) as CloudThreadMessageRow[];
      const mapped = rows.map(toMessageRecordFromCloud);
      mapped.reverse();
      return mapped;
    },
    [fetchWithSupabaseAuth, getSupabaseUrl, readSupabaseError, supabaseSessionRef],
  );

  const loadMessages = useCallback(
    async (sessionId: string) => {
      const requestId = loadMessagesRequestSeqRef.current + 1;
      loadMessagesRequestSeqRef.current = requestId;
      const isCurrentRequest = () =>
        activeThreadIdRef.current === sessionId &&
        loadMessagesRequestSeqRef.current === requestId;
      if (!isCurrentRequest()) return;
      setMessageLoadError(sessionId, null);

      const storageMode = resolveThreadStorageModeSafe(sessionId);
      if (storageMode === "cloud") {
        try {
          const page = await fetchCloudMessagesPage(sessionId);
          if (!isCurrentRequest()) return;
          setMessages(page);
          setToolCalls((prev) => (prev.length === 0 ? prev : []));
          setHasOlderMessages(sessionId, page.length >= MESSAGE_PAGE_SIZE);
          eventCursorByThreadRef.current[sessionId] = 0;
        } catch (error) {
          if (!isCurrentRequest()) return;
          console.warn("Failed to load cloud thread messages:", error);
          const message = error instanceof Error ? error.message : "Failed to load cloud thread messages.";
          setMessageLoadError(sessionId, message);
          setMessages([]);
          setToolCalls((prev) => (prev.length === 0 ? prev : []));
          setHasOlderMessages(sessionId, false);
          eventCursorByThreadRef.current[sessionId] = 0;
        }
        return;
      }

      const eventToMessage = (evt: EventRecord): MessageRecord | null => {
        const evtType = (evt.type ?? "").trim();
        const role =
          evtType === "user_message"
            ? "user"
            : evtType === "assistant_message"
              ? "assistant"
              : null;
        if (!role) return null;

        let contentJson: string | null = null;
        let engineId: string | null = null;
        let modelId: string | null = null;
        let runId: string | null = null;
        if (evt.payload_json) {
          try {
            const parsed = JSON.parse(evt.payload_json) as { content?: unknown; meta?: unknown };
            if (parsed && typeof parsed === "object" && "content" in parsed) {
              contentJson = JSON.stringify(
                (parsed as { content: unknown }).content ?? { text: evt.text ?? "" },
              );
            }
            const meta = (parsed as { meta?: unknown }).meta;
            if (meta && typeof meta === "object") {
              const metaObj = meta as {
                engine_id?: unknown;
                model_id?: unknown;
                run_id?: unknown;
              };
              engineId = typeof metaObj.engine_id === "string" ? metaObj.engine_id : null;
              modelId = typeof metaObj.model_id === "string" ? metaObj.model_id : null;
              runId = typeof metaObj.run_id === "string" ? metaObj.run_id : null;
            }
          } catch {
            // Ignore malformed payloads.
          }
        }
        if (!contentJson) {
          contentJson = JSON.stringify({ text: evt.text ?? "" });
        }

        return {
          id: evt.id,
          session_id: evt.thread_id,
          seq: evt.seq,
          role,
          content_json: contentJson,
          created_at: evt.created_at,
          engine_id: engineId,
          model_id: modelId,
          run_id: runId,
        };
      };

      const cursorResumeDisabledForThread = Boolean(
        cursorResumeDisabledByThreadRef.current[sessionId],
      );
      if (runtimeSupportsCursorResume && !cursorResumeDisabledForThread) {
        const currentCursor = eventCursorByThreadRef.current[sessionId];
        const hasLoadedCurrentThread =
          messages.length > 0 && messages[0]?.session_id === sessionId;
        if (typeof currentCursor === "number" && hasLoadedCurrentThread) {
          try {
            let nextCursor = currentCursor;
            const deltaEvents: EventRecord[] = [];

            while (true) {
              if (!isCurrentRequest()) return;
              const page = await runtimeClient.listEventsSince(
                sessionId,
                nextCursor,
                DELTA_EVENTS_PAGE_SIZE,
              );
              if (page.length === 0) break;
              const lastEvent = page[page.length - 1];
              if (!lastEvent || lastEvent.seq <= nextCursor) {
                throw new Error("listEventsSince returned a non-advancing cursor");
              }
              deltaEvents.push(...page);
              nextCursor = lastEvent.seq;
              if (page.length < DELTA_EVENTS_PAGE_SIZE) break;
            }

            if (!isCurrentRequest()) return;
            if (deltaEvents.length === 0) return;
            eventCursorByThreadRef.current[sessionId] = nextCursor;

            const mappedDelta = deltaEvents
              .map(eventToMessage)
              .filter(Boolean) as MessageRecord[];
            if (mappedDelta.length > 0) {
              const canonicalUserPayloads = new Set(
                mappedDelta
                  .filter((message) => message.role === "user")
                  .map((message) => normalizeContentJson(message.content_json)),
              );
              setMessages((prev) => {
                if (prev.length === 0 || prev[0]?.session_id !== sessionId) {
                  return mappedDelta;
                }
                let next = [...prev];
                if (canonicalUserPayloads.size > 0) {
                  next = next.filter((message) => {
                    if (message.role !== "user") return true;
                    if (!message.id.startsWith("optimistic-user-")) return true;
                    const payload = normalizeContentJson(message.content_json);
                    return !canonicalUserPayloads.has(payload);
                  });
                }
                const seen = new Set(next.map((message) => message.id));
                for (const message of mappedDelta) {
                  if (seen.has(message.id)) continue;
                  next.push(message);
                  seen.add(message.id);
                }
                return next;
              });
            }

            const hasToolCallEvents = deltaEvents.some((evt) =>
              (evt.type ?? "").trim().startsWith("tool_call_"),
            );
            if (hasToolCallEvents) {
              await loadToolCalls(sessionId);
            }
            return;
          } catch (error) {
            cursorResumeDisabledByThreadRef.current[sessionId] = true;
            console.warn(
              `[ARP] Incremental sync failed; disabling cursor resume for thread ${sessionId}.`,
              error,
            );
          }
        }
      }

      const threadLastSeq =
        threads.find((thread) => thread.id === sessionId)?.last_seq ?? 0;
      if (threadLastSeq > 0) {
        const priorCursor = eventCursorByThreadRef.current[sessionId] ?? 0;
        eventCursorByThreadRef.current[sessionId] = Math.max(priorCursor, threadLastSeq);
      }

      await loadToolCalls(sessionId);
      if (!isCurrentRequest()) return;

      try {
        const page = await runtimeClient.listMessagesTail(sessionId, MESSAGE_PAGE_SIZE);
        if (!isCurrentRequest()) return;
        if (page.length > 0) {
          setMessages(page);
          setHasOlderMessages(sessionId, page.length >= MESSAGE_PAGE_SIZE);
          return;
        }

        if (threadLastSeq > 0) {
          // Projection can be stale in existing local DBs; reconstruct a read-only message view from events.
          try {
            const fallbackEvents = await runtimeClient.listEvents(sessionId, MESSAGE_PAGE_SIZE * 4);
            if (!isCurrentRequest()) return;
            const fallbackMessages = fallbackEvents
              .map(eventToMessage)
              .filter(Boolean) as MessageRecord[];
            if (fallbackMessages.length > 0) {
              setMessages(fallbackMessages);
              setHasOlderMessages(sessionId, fallbackMessages.length >= MESSAGE_PAGE_SIZE);
              return;
            }
          } catch {
            // Fall through to empty state.
          }
        }

        setMessages([]);
        setHasOlderMessages(sessionId, false);
      } catch {
        if (!isCurrentRequest()) return;
        setMessageLoadError(sessionId, "Failed to load local thread messages.");
        setMessages([]);
        setHasOlderMessages(sessionId, false);
      }
    },
    [
      fetchCloudMessagesPage,
      loadToolCalls,
      messages,
      resolveThreadStorageModeSafe,
      runtimeClient,
      runtimeSupportsCursorResume,
      setHasOlderMessages,
      setMessageLoadError,
      setMessages,
      setToolCalls,
      threads,
    ],
  );

  const handleLoadOlderMessages = useCallback(async () => {
    const threadId = activeThreadIdRef.current;
    if (!threadId) return;
    if (isLoadingOlderMessages) return;
    if (!hasOlderMessagesByThreadId[threadId]) return;

    const oldestSeq = messages.reduce<number | null>((acc, message) => {
      if (message.session_id !== threadId) return acc;
      const seq = typeof message.seq === "number" && Number.isFinite(message.seq) ? message.seq : null;
      if (seq === null || seq <= 0) return acc;
      return acc === null ? seq : Math.min(acc, seq);
    }, null);
    if (!oldestSeq || oldestSeq <= 1) {
      setHasOlderMessages(threadId, false);
      return;
    }

    const requestId = loadMessagesRequestSeqRef.current + 1;
    loadMessagesRequestSeqRef.current = requestId;
    const isCurrentRequest = () =>
      activeThreadIdRef.current === threadId &&
      loadMessagesRequestSeqRef.current === requestId;

    setIsLoadingOlderMessages(true);
    try {
      const storageMode = resolveThreadStorageModeSafe(threadId);
      const olderMessages =
        storageMode === "cloud"
          ? await fetchCloudMessagesPage(threadId, oldestSeq)
          : await runtimeClient.listMessagesBeforeSeq(
              threadId,
              oldestSeq,
              MESSAGE_PAGE_SIZE,
            );

      if (!isCurrentRequest()) return;
      if (olderMessages.length === 0) {
        setHasOlderMessages(threadId, false);
        return;
      }

      setMessages((prev) => {
        if (prev.length === 0 || prev[0]?.session_id !== threadId) {
          return prev;
        }
        const seen = new Set(prev.map((message) => message.id));
        const prepend = olderMessages.filter((message) => !seen.has(message.id));
        if (prepend.length === 0) return prev;
        return [...prepend, ...prev];
      });
      setHasOlderMessages(threadId, olderMessages.length >= MESSAGE_PAGE_SIZE);
    } catch (error) {
      if (!isCurrentRequest()) return;
      console.warn("Failed to load older thread messages:", error);
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }, [
    fetchCloudMessagesPage,
    hasOlderMessagesByThreadId,
    isLoadingOlderMessages,
    messages,
    resolveThreadStorageModeSafe,
    runtimeClient,
    setHasOlderMessages,
    setMessages,
  ]);

  const hasOlderMessagesForActiveThread = activeThreadId
    ? Boolean(hasOlderMessagesByThreadId[activeThreadId])
    : false;
  const messageLoadErrorForActiveThread = activeThreadId
    ? messageLoadErrorByThreadId[activeThreadId] ?? null
    : null;

  return {
    loadMessages,
    loadToolCalls,
    handleLoadOlderMessages,
    hasOlderMessagesForActiveThread,
    messageLoadErrorForActiveThread,
    isLoadingOlderMessages,
  };
}
