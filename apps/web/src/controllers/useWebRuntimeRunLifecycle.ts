import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import {
  getConvexCloudRunningRuntimeRunByThreadKey,
  listConvexCloudRuntimeRunEvents,
} from "../../../../shared/cloudThreadsRead";
import type { ThreadStreamingRuntimeEvent, ThreadStreamingState } from "../../../../shared/webTurnRunnerCore";

type ThreadMessageLike = {
  run_id: string | null;
};

const RUNTIME_EVENT_PAGE_LIMIT = 500;
const COMPLETED_RUNTIME_EVENT_MAX_ROWS = 2000;

function runtimeEventsIncludeFinished(rows: ThreadStreamingRuntimeEvent[] | undefined): boolean {
  return Array.isArray(rows) && rows.some((row) => row.event_type === "run_finished");
}

function mergeRuntimeEvents(
  existing: ThreadStreamingRuntimeEvent[],
  rows: ThreadStreamingRuntimeEvent[],
): ThreadStreamingRuntimeEvent[] {
  if (rows.length === 0) return existing;
  const seenIds = new Set(existing.map((row) => row.id));
  const merged = [...existing];
  for (const row of rows) {
    if (seenIds.has(row.id)) continue;
    merged.push(row);
    seenIds.add(row.id);
  }
  merged.sort((a, b) => a.seq - b.seq);
  return merged;
}

async function listCompletedRuntimeRunEvents(
  session: unknown,
  runId: string,
): Promise<ThreadStreamingRuntimeEvent[] | null> {
  const rows: ThreadStreamingRuntimeEvent[] = [];
  let afterSeq = 0;

  while (rows.length < COMPLETED_RUNTIME_EVENT_MAX_ROWS) {
    const page = await listConvexCloudRuntimeRunEvents({
      session: session as any,
      runId,
      afterSeq,
      limit: Math.min(
        RUNTIME_EVENT_PAGE_LIMIT,
        COMPLETED_RUNTIME_EVENT_MAX_ROWS - rows.length,
      ),
    });
    if (!page) return null;
    if (page.length === 0) break;

    rows.push(...page);
    afterSeq = page.reduce(
      (maxSeq, row) => Math.max(maxSeq, Math.max(0, Math.floor(row.seq ?? 0))),
      afterSeq,
    );
    if (runtimeEventsIncludeFinished(page)) break;
    if (page.length < RUNTIME_EVENT_PAGE_LIMIT) break;
  }

  return rows;
}

export function useWebRuntimeRunLifecycle<
  SessionT,
  ThreadMessageT extends ThreadMessageLike,
  MemoryUsedItemT,
  HistoryUsedItemT,
  CommunityEvidenceUsedT,
>(params: {
  session: SessionT | null;
  activeThreadId: string | null;
  threadSendingStateById: Record<string, boolean>;
  threadStreamingStateById: Record<string, ThreadStreamingState<MemoryUsedItemT, HistoryUsedItemT, CommunityEvidenceUsedT>>;
  setThreadStreamingStateById: Dispatch<
    SetStateAction<Record<string, ThreadStreamingState<MemoryUsedItemT, HistoryUsedItemT, CommunityEvidenceUsedT>>>
  >;
  runtimeEventsByRunId: Record<string, ThreadStreamingRuntimeEvent[]>;
  setRuntimeEventsByRunId: Dispatch<SetStateAction<Record<string, ThreadStreamingRuntimeEvent[]>>>;
  threadMessages: ThreadMessageT[];
  setThreadErrorForThread: (threadId: string, value: string | null) => void;
  loadThreads: (session: SessionT) => Promise<void>;
  loadThreadMessages: (threadId: string, session: SessionT) => Promise<void>;
}) {
  const threadStreamingStateByIdRef = useRef(params.threadStreamingStateById);
  const runtimeEventsLoadingByRunIdRef = useRef<Record<string, boolean>>({});
  const runtimeEventsHydratedByRunIdRef = useRef<Record<string, boolean>>({});
  const activeRuntimeRunHydrationByThreadIdRef = useRef<Record<string, boolean>>({});
  const loadThreadsRef = useRef(params.loadThreads);
  const loadThreadMessagesRef = useRef(params.loadThreadMessages);

  const hasActiveStreamingRuns = useMemo(
    () =>
      Object.values(params.threadStreamingStateById).some(
        (value) => typeof value?.runId === "string" && value.runId.trim().length > 0,
      ),
    [params.threadStreamingStateById],
  );

  useEffect(() => {
    threadStreamingStateByIdRef.current = params.threadStreamingStateById;
  }, [params.threadStreamingStateById]);

  useEffect(() => {
    loadThreadsRef.current = params.loadThreads;
  }, [params.loadThreads]);

  useEffect(() => {
    loadThreadMessagesRef.current = params.loadThreadMessages;
  }, [params.loadThreadMessages]);

  useEffect(() => {
    if (params.session) return;
    params.setRuntimeEventsByRunId({});
    runtimeEventsLoadingByRunIdRef.current = {};
    runtimeEventsHydratedByRunIdRef.current = {};
    activeRuntimeRunHydrationByThreadIdRef.current = {};
  }, [params.session, params.setRuntimeEventsByRunId]);

  useEffect(() => {
    if (!params.session || !params.activeThreadId) return;
    if (params.threadSendingStateById[params.activeThreadId]) return;
    if (params.threadStreamingStateById[params.activeThreadId]) return;
    if (activeRuntimeRunHydrationByThreadIdRef.current[params.activeThreadId]) return;
    activeRuntimeRunHydrationByThreadIdRef.current[params.activeThreadId] = true;
    let cancelled = false;

    void getConvexCloudRunningRuntimeRunByThreadKey({
      session: params.session as any,
      threadKey: params.activeThreadId,
    })
      .then((row) => {
        if (cancelled || !row) return;
        const existingEvents = params.runtimeEventsByRunId[row.run_id] ?? [];
        const lastRuntimeEventSeq = existingEvents.reduce(
          (maxSeq, event) => Math.max(maxSeq, Math.max(0, Math.floor(event.seq ?? 0))),
          0,
        );
        params.setThreadStreamingStateById((prev) => {
          if (prev[params.activeThreadId!]) return prev;
          return {
            ...prev,
            [params.activeThreadId!]: {
              runId: row.run_id,
              meta: null,
              content: "",
              streamTransport: "recovery",
              runtimeEvents: existingEvents,
              lastRuntimeEventSeq,
            },
          };
        });
      })
      .catch(() => null)
      .finally(() => {
        delete activeRuntimeRunHydrationByThreadIdRef.current[params.activeThreadId!];
      });

    return () => {
      cancelled = true;
      delete activeRuntimeRunHydrationByThreadIdRef.current[params.activeThreadId!];
    };
  }, [
    params.activeThreadId,
    params.session,
    params.runtimeEventsByRunId,
    params.setThreadErrorForThread,
    params.setThreadStreamingStateById,
    params.threadSendingStateById,
    params.threadStreamingStateById,
  ]);

  useEffect(() => {
    if (!params.session || !hasActiveStreamingRuns) return;
    let cancelled = false;
    let timeoutId: number | null = null;

    const pollRuntimeEvents = async () => {
      if (cancelled) return;
      try {
        const activeEntries = Object.entries(threadStreamingStateByIdRef.current).filter(
          ([, value]) =>
            typeof value?.runId === "string" &&
            value.runId.trim().length > 0 &&
            value.streamTransport !== "sse",
        );
        for (const [threadId, state] of activeEntries) {
          const runId = String(state?.runId ?? "").trim();
          if (!runId) continue;
          try {
            const afterSeq =
              typeof state?.lastRuntimeEventSeq === "number" && Number.isFinite(state.lastRuntimeEventSeq)
                ? Math.max(0, Math.floor(state.lastRuntimeEventSeq))
                : 0;
            const rows = await listConvexCloudRuntimeRunEvents({
              session: params.session as any,
              runId,
              afterSeq,
              limit: 200,
            });
            if (cancelled || !rows || rows.length === 0) continue;
            const runFinished = rows.some((row) => row.event_type === "run_finished");
            const latestRunFinished = [...rows]
              .filter((row) => row.event_type === "run_finished")
              .sort((a, b) => b.seq - a.seq)[0] ?? null;
            params.setRuntimeEventsByRunId((prev) => {
              const existing = prev[runId] ?? [];
              return {
                ...prev,
                [runId]: mergeRuntimeEvents(existing, rows),
              };
            });
            params.setThreadStreamingStateById((prev) => {
              const current = prev[threadId] ?? null;
              if (!current || String(current.runId ?? "").trim() !== runId) return prev;
              const nextRows = [...(current.runtimeEvents ?? [])];
              const seenIds = new Set(nextRows.map((row) => row.id));
              let nextLastSeq = Math.max(0, Math.floor(current.lastRuntimeEventSeq ?? 0));
              for (const row of rows) {
                if (seenIds.has(row.id)) continue;
                nextRows.push(row);
                seenIds.add(row.id);
                nextLastSeq = Math.max(nextLastSeq, Math.floor(row.seq ?? 0));
              }
              nextRows.sort((a, b) => a.seq - b.seq);
              return {
                ...prev,
                [threadId]: {
                  ...current,
                  runtimeEvents: nextRows,
                  lastRuntimeEventSeq: nextLastSeq,
                },
              };
            });
            if (runFinished) {
              const payload =
                latestRunFinished?.payload && typeof latestRunFinished.payload === "object" && !Array.isArray(latestRunFinished.payload)
                  ? (latestRunFinished.payload as Record<string, unknown>)
                  : null;
              const runStatus = String(payload?.status ?? "").trim().toLowerCase();
              const runErrorMessage = String(payload?.error_message ?? "").trim();
              const runErrorCode = String(payload?.error_code ?? "").trim();
              if (runStatus === "ok") {
                params.setThreadErrorForThread(threadId, null);
              } else {
                const nextError =
                  runErrorMessage ||
                  (runErrorCode ? `Run failed: ${runErrorCode}.` : "Run failed before producing a response.");
                params.setThreadErrorForThread(threadId, nextError);
              }
              params.setThreadStreamingStateById((prev) => {
                if (!(threadId in prev)) return prev;
                const next = { ...prev };
                delete next[threadId];
                return next;
              });
              const session = params.session;
              if (!session) return;
              void loadThreadMessagesRef.current?.(threadId, session).catch(() => null);
              void loadThreadsRef.current?.(session).catch(() => null);
            }
          } catch {
            // Keep polling alive after transient event-read failures.
          }
        }
      } finally {
        if (!cancelled) {
          timeoutId = window.setTimeout(pollRuntimeEvents, 900);
        }
      }
    };

    void pollRuntimeEvents();
    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [
    params.session,
    hasActiveStreamingRuns,
    params.setRuntimeEventsByRunId,
    params.setThreadErrorForThread,
    params.setThreadStreamingStateById,
  ]);

  useEffect(() => {
    if (!params.session) return;
    const runIds = Array.from(
      new Set(
        params.threadMessages
          .map((message) => (typeof message.run_id === "string" ? message.run_id.trim() : ""))
          .filter(Boolean),
      ),
    );
    for (const runId of runIds) {
      if (runtimeEventsIncludeFinished(params.runtimeEventsByRunId[runId])) continue;
      if (runtimeEventsHydratedByRunIdRef.current[runId]) continue;
      if (runtimeEventsLoadingByRunIdRef.current[runId]) continue;
      runtimeEventsLoadingByRunIdRef.current[runId] = true;
      void listCompletedRuntimeRunEvents(params.session, runId)
        .then((rows) => {
          if (!rows) return;
          params.setRuntimeEventsByRunId((prev) => {
            const existing = prev[runId] ?? [];
            return {
              ...prev,
              [runId]: mergeRuntimeEvents(existing, rows),
            };
          });
          runtimeEventsHydratedByRunIdRef.current[runId] = true;
        })
        .catch(() => null)
        .finally(() => {
          delete runtimeEventsLoadingByRunIdRef.current[runId];
        });
    }
  }, [params.runtimeEventsByRunId, params.session, params.setRuntimeEventsByRunId, params.threadMessages]);
}
