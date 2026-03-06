import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { RuntimeClient } from "../../runtime/arp/client";
import type { EventRecord, MessageRecord, ThreadRecord, ToolCallRecord } from "../../runtime/arp/types";
import type { CloudAuthSession } from "../../../shared/cloudAuthSession";
import {
  DELTA_EVENTS_PAGE_SIZE,
  MESSAGE_PAGE_SIZE,
  TOOL_CALL_PAGE_SIZE,
  TOOL_CALLS_MIN_RELOAD_INTERVAL_MS,
  eventToMessageRecord,
  findOldestThreadMessageSeq,
  mergeMessagesWithDelta,
  sameToolCallList,
  toMessageRecordFromCloud,
  type CloudThreadMessageRow,
} from "./desktopThreadFeedCore";
import {
  isConvexCloudThreadsEnabled,
  listConvexCloudThreadMessagesPageByThreadKey,
} from "../../../shared/daytonaCloudThreadsRead";

type DesktopCloudSession = Exclude<CloudAuthSession, null>;

type UseDesktopThreadFeedControllerArgs = {
  activeThreadId: string | null;
  runtimeClient: RuntimeClient;
  runtimeSupportsCursorResume: boolean;
  messages: MessageRecord[];
  setMessages: Dispatch<SetStateAction<MessageRecord[]>>;
  setToolCalls: Dispatch<SetStateAction<ToolCallRecord[]>>;
  threads: ThreadRecord[];
  resolveThreadStorageMode: (threadId: string) => "cloud" | "local";
  cloudSessionRef: { current: DesktopCloudSession | null };
};

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
    cloudSessionRef,
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

  useLayoutEffect(() => {
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
      if (!isConvexCloudThreadsEnabled()) {
        throw new Error("Convex is required for cloud thread messages in this build.");
      }
      const session = cloudSessionRef.current;
      if (!session) {
        throw new Error("Sign in to load cloud chat thread messages.");
      }
      const convexRows = await listConvexCloudThreadMessagesPageByThreadKey({
        session,
        threadKey: sessionId,
        pageSize: MESSAGE_PAGE_SIZE,
        beforeSeq,
        maxScan: 4000,
      });
      return (convexRows ?? []).map((row) => toMessageRecordFromCloud(row as CloudThreadMessageRow));
    },
    [cloudSessionRef],
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
              .map(eventToMessageRecord)
              .filter(Boolean) as MessageRecord[];
            if (mappedDelta.length > 0) {
              setMessages((prev) =>
                mergeMessagesWithDelta({
                  prev,
                  sessionId,
                  mappedDelta,
                }),
              );
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
              .map(eventToMessageRecord)
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

    const oldestSeq = findOldestThreadMessageSeq(messages, threadId);
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
