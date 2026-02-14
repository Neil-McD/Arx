import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { RuntimeClient } from "../../runtime/arp/client";
import type { RuntimeNotification } from "../../runtime/arp/types";
import type { StreamingMeta, StreamingTokens } from "../../features/harness/useStreamingState";

const TOOL_CALLS_RELOAD_DEBOUNCE_MS = 250;

type RunPhaseAction =
  | { type: "turn_finished" }
  | { type: "stream_chunk" }
  | { type: "approval_requested" }
  | { type: "agent_working" | "agent_thinking" }
  | { type: "tool_started" }
  | { type: "cancel_requested" };

type ToolCallsReloadRequest = {
  sessionId: string;
  force?: boolean;
};

type PendingToolApprovalLike = {
  session_id: string;
  tool_call_id: string;
  tool_name: string;
  args_json: string;
};

type AgentStatusLike = {
  session_id: string;
  status: "thinking" | "working" | "idle";
  tool_name: string | null;
  tool_args_preview: string | null;
};

type RunningToolLike = {
  id: string;
  name: string;
  preview: string | null;
  status: "running" | "ok" | "error";
};

type UseDesktopRunOrchestrationArgs<
  PendingToolApprovalT extends PendingToolApprovalLike,
  AgentStatusT extends AgentStatusLike,
  RunningToolT extends RunningToolLike,
> = {
  activeThreadId: string | null;
  activePage: "workspace" | "community" | "discover";
  slashQuery: string | null;
  isSending: boolean;
  streamingContent: string | null;
  pendingToolApproval: PendingToolApprovalT | null;
  runningToolCallId: string | null;
  runtimeClient: RuntimeClient;
  cancelRunForThread: (threadId: string) => Promise<boolean>;
  dispatchRunPhase: (action: RunPhaseAction) => void;
  setPendingToolApproval: Dispatch<SetStateAction<PendingToolApprovalT | null>>;
  setIsToolApprovalSubmitting: Dispatch<SetStateAction<boolean>>;
  setAgentStatus: Dispatch<SetStateAction<AgentStatusT | null>>;
  setRunningTools: Dispatch<SetStateAction<RunningToolT[]>>;
  setRunningToolCallId: Dispatch<SetStateAction<string | null>>;
  setMemoryToast: Dispatch<SetStateAction<string | null>>;
  memoryToastTimeoutRef: { current: number | null };
  clearStreamingRefs: () => void;
  scheduleStreamingUpdate: () => void;
  setStreamingContent: Dispatch<SetStateAction<string | null>>;
  setStreamingTokens: Dispatch<SetStateAction<StreamingTokens | null>>;
  setStreamingMeta: Dispatch<SetStateAction<StreamingMeta | null>>;
  streamingContentRef: { current: string | null };
  streamingTokensRef: { current: StreamingTokens | null };
  streamingMetaRef: { current: StreamingMeta | null };
  loadMessages: (threadId: string) => Promise<void>;
  loadToolCalls: (threadId: string, opts?: { force?: boolean }) => Promise<void>;
  handleOpenedUrls: (urls: string[]) => Promise<void> | void;
  shouldHideToolNameFromUi: (toolName: string) => boolean;
};

export function useDesktopRunOrchestration<
  PendingToolApprovalT extends PendingToolApprovalLike,
  AgentStatusT extends AgentStatusLike,
  RunningToolT extends RunningToolLike,
>(args: UseDesktopRunOrchestrationArgs<PendingToolApprovalT, AgentStatusT, RunningToolT>) {
  const loadMessagesRef = useRef(args.loadMessages);
  const loadToolCallsRef = useRef(args.loadToolCalls);
  const handleOpenedUrlsRef = useRef(args.handleOpenedUrls);
  const activeThreadIdRef = useRef(args.activeThreadId);
  const dispatchRunPhaseRef = useRef(args.dispatchRunPhase);
  const setPendingToolApprovalRef = useRef(args.setPendingToolApproval);
  const setIsToolApprovalSubmittingRef = useRef(args.setIsToolApprovalSubmitting);
  const setAgentStatusRef = useRef(args.setAgentStatus);
  const setRunningToolsRef = useRef(args.setRunningTools);
  const setStreamingContentRef = useRef(args.setStreamingContent);
  const setStreamingTokensRef = useRef(args.setStreamingTokens);
  const setStreamingMetaRef = useRef(args.setStreamingMeta);
  const clearStreamingRefsRef = useRef(args.clearStreamingRefs);
  const scheduleStreamingUpdateRef = useRef(args.scheduleStreamingUpdate);
  const shouldHideToolNameFromUiRef = useRef(args.shouldHideToolNameFromUi);
  const toolCallsReloadTimerRef = useRef<number | null>(null);
  const toolCallsReloadInFlightRef = useRef(false);
  const pendingToolCallsReloadRef = useRef<ToolCallsReloadRequest | null>(null);

  useEffect(() => {
    loadMessagesRef.current = args.loadMessages;
  }, [args.loadMessages]);

  useEffect(() => {
    loadToolCallsRef.current = args.loadToolCalls;
  }, [args.loadToolCalls]);

  useEffect(() => {
    handleOpenedUrlsRef.current = args.handleOpenedUrls;
  }, [args.handleOpenedUrls]);

  useEffect(() => {
    activeThreadIdRef.current = args.activeThreadId;
  }, [args.activeThreadId]);

  useEffect(() => {
    dispatchRunPhaseRef.current = args.dispatchRunPhase;
  }, [args.dispatchRunPhase]);

  useEffect(() => {
    setPendingToolApprovalRef.current = args.setPendingToolApproval;
  }, [args.setPendingToolApproval]);

  useEffect(() => {
    setIsToolApprovalSubmittingRef.current = args.setIsToolApprovalSubmitting;
  }, [args.setIsToolApprovalSubmitting]);

  useEffect(() => {
    setAgentStatusRef.current = args.setAgentStatus;
  }, [args.setAgentStatus]);

  useEffect(() => {
    setRunningToolsRef.current = args.setRunningTools;
  }, [args.setRunningTools]);

  useEffect(() => {
    setStreamingContentRef.current = args.setStreamingContent;
  }, [args.setStreamingContent]);

  useEffect(() => {
    setStreamingTokensRef.current = args.setStreamingTokens;
  }, [args.setStreamingTokens]);

  useEffect(() => {
    setStreamingMetaRef.current = args.setStreamingMeta;
  }, [args.setStreamingMeta]);

  useEffect(() => {
    clearStreamingRefsRef.current = args.clearStreamingRefs;
  }, [args.clearStreamingRefs]);

  useEffect(() => {
    scheduleStreamingUpdateRef.current = args.scheduleStreamingUpdate;
  }, [args.scheduleStreamingUpdate]);

  useEffect(() => {
    shouldHideToolNameFromUiRef.current = args.shouldHideToolNameFromUi;
  }, [args.shouldHideToolNameFromUi]);

  const showMemoryToast = useCallback(
    (message: string, durationMs: number) => {
      args.setMemoryToast(message);
      if (args.memoryToastTimeoutRef.current) {
        window.clearTimeout(args.memoryToastTimeoutRef.current);
      }
      args.memoryToastTimeoutRef.current = window.setTimeout(() => {
        args.setMemoryToast(null);
      }, durationMs);
    },
    [args.memoryToastTimeoutRef, args.setMemoryToast],
  );

  const flushToolCallsReload = useCallback(() => {
    if (toolCallsReloadInFlightRef.current) return;
    const nextRequest = pendingToolCallsReloadRef.current;
    if (!nextRequest) return;
    pendingToolCallsReloadRef.current = null;
    toolCallsReloadInFlightRef.current = true;

    void loadToolCallsRef.current(nextRequest.sessionId, { force: nextRequest.force })
      .catch(() => {
        // best-effort; next event will retry
      })
      .finally(() => {
        toolCallsReloadInFlightRef.current = false;
        if (pendingToolCallsReloadRef.current && toolCallsReloadTimerRef.current === null) {
          toolCallsReloadTimerRef.current = window.setTimeout(() => {
            toolCallsReloadTimerRef.current = null;
            flushToolCallsReload();
          }, TOOL_CALLS_RELOAD_DEBOUNCE_MS);
        }
      });
  }, []);

  const scheduleToolCallsReload = useCallback(
    (sessionId: string, opts?: { immediate?: boolean; force?: boolean }) => {
      const current = pendingToolCallsReloadRef.current;
      pendingToolCallsReloadRef.current = {
        sessionId,
        force: Boolean(opts?.force) || Boolean(current?.force),
      };
      if (opts?.immediate) {
        if (toolCallsReloadTimerRef.current !== null) {
          window.clearTimeout(toolCallsReloadTimerRef.current);
          toolCallsReloadTimerRef.current = null;
        }
        flushToolCallsReload();
        return;
      }
      if (toolCallsReloadTimerRef.current !== null) return;
      toolCallsReloadTimerRef.current = window.setTimeout(() => {
        toolCallsReloadTimerRef.current = null;
        flushToolCallsReload();
      }, TOOL_CALLS_RELOAD_DEBOUNCE_MS);
    },
    [flushToolCallsReload],
  );

  const cancelActiveRun = useCallback(() => {
    if (!args.activeThreadId) return;
    args.setPendingToolApproval(null);
    args.dispatchRunPhase({ type: "cancel_requested" });
    void args.cancelRunForThread(args.activeThreadId).catch(() => {
      // best-effort
    });
  }, [
    args.activeThreadId,
    args.cancelRunForThread,
    args.dispatchRunPhase,
    args.setPendingToolApproval,
  ]);

  const handleRuntimeNotification = useCallback(
    (n: RuntimeNotification) => {
      const activeThreadId = activeThreadIdRef.current;

      if (n.type === "turn_finished") {
        if (n.session_id !== activeThreadId) return;
        void (async () => {
          dispatchRunPhaseRef.current({ type: "turn_finished" });
          clearStreamingRefsRef.current();
          await loadMessagesRef.current(n.session_id);
          setStreamingContentRef.current(null);
          setStreamingTokensRef.current(null);
          setStreamingMetaRef.current(null);
        })();
        return;
      }

      if (n.type === "openrouter_stream") {
        if (n.session_id !== activeThreadId) return;
        dispatchRunPhaseRef.current({ type: "stream_chunk" });
        const maybeFullContent = (n as RuntimeNotification & { full_content?: unknown }).full_content;
        const fullContent = typeof maybeFullContent === "string" ? maybeFullContent : null;
        if (fullContent !== null) {
          args.streamingContentRef.current = fullContent;
        } else if (typeof n.chunk === "string" && n.chunk.length > 0) {
          const prior = args.streamingContentRef.current ?? "";
          args.streamingContentRef.current = `${prior}${n.chunk}`;
        }
        args.streamingTokensRef.current = {
          prompt_tokens: n.prompt_tokens ?? undefined,
          completion_tokens: n.completion_tokens ?? undefined,
          max_tokens: n.max_tokens,
        };
        args.streamingMetaRef.current = {
          engine_id: n.engine_id,
          model_id: n.model_id,
          inference_source: n.inference_source ?? null,
        };
        scheduleStreamingUpdateRef.current();
        return;
      }

      if (n.type === "memory_updated") {
        if (n.session_id !== activeThreadId) return;
        const label = n.label?.trim() || "memory";
        const scope = n.scope?.trim();
        const message = scope ? `Memory updated: ${label} (${scope})` : `Memory updated: ${label}`;
        showMemoryToast(message, 2000);
        return;
      }

      if (n.type === "inference_fallback") {
        if (n.session_id !== activeThreadId) return;
        const reason = (n.reason ?? "").trim();
        const from = (n.from ?? "").trim().toLowerCase();
        const to = (n.to ?? "").trim().toLowerCase();
        const message =
          from === "chatgpt" && to === "platform"
            ? (() => {
                const match = reason.match(/chatgpt_http_(\d+)/i);
                const code = match?.[1] ?? null;
                const detail = (() => {
                  const idx = reason.indexOf(":");
                  if (idx === -1) return null;
                  const parsed = reason.slice(idx + 1).trim();
                  return parsed.length ? parsed : null;
                })();
                return code
                  ? detail
                    ? `ChatGPT unavailable (HTTP ${code}) — ${detail.slice(0, 140)}`
                    : `ChatGPT unavailable (HTTP ${code}) — using Arx.`
                  : "ChatGPT unavailable — using Arx.";
              })()
            : reason === "platform_quota_exceeded"
              ? "Arx AI quota reached for this model. Select another model or upgrade."
              : "Arx AI unavailable for this model. Select another model or upgrade.";
        showMemoryToast(message, 2500);
        return;
      }

      if (n.type === "tool_calls_updated") {
        if (n.session_id !== activeThreadId) return;
        scheduleToolCallsReload(n.session_id);
        return;
      }

      if (n.type === "tool_approval_requested") {
        if (n.session_id !== activeThreadId) return;
        dispatchRunPhaseRef.current({ type: "approval_requested" });
        setIsToolApprovalSubmittingRef.current(false);
        setPendingToolApprovalRef.current({
          session_id: n.session_id,
          tool_call_id: n.tool_call_id,
          tool_name: n.tool_name,
          args_json: n.args_json,
        } as PendingToolApprovalT);
        scheduleToolCallsReload(n.session_id, { immediate: true, force: true });
        return;
      }

      if (n.type === "agent_status") {
        if (n.session_id !== activeThreadId) return;
        if (n.status === "idle") {
          dispatchRunPhaseRef.current({ type: "turn_finished" });
          setAgentStatusRef.current(null);
          setRunningToolsRef.current([]);
        } else {
          dispatchRunPhaseRef.current({ type: n.status === "working" ? "agent_working" : "agent_thinking" });
          setAgentStatusRef.current({
            session_id: n.session_id,
            status: n.status,
            tool_name: n.tool_name,
            tool_args_preview: n.tool_args_preview,
          } as AgentStatusT);
        }
        return;
      }

      if (n.type === "tool_call_progress") {
        if (n.session_id !== activeThreadId) return;
        if (shouldHideToolNameFromUiRef.current(n.tool_name)) return;
        if (n.status === "started") {
          dispatchRunPhaseRef.current({ type: "tool_started" });
          setRunningToolsRef.current((prev) => [
            ...prev,
            {
              id: n.tool_call_id,
              name: n.tool_name,
              preview: n.tool_args_preview,
              status: "running",
            } as RunningToolT,
          ]);
        } else if (n.status === "finished") {
          setRunningToolsRef.current((prev) =>
            prev.map((tool) =>
              tool.id === n.tool_call_id
                ? ({ ...tool, status: n.result === "ok" ? "ok" : "error" } as RunningToolT)
                : tool,
            ),
          );
        }
        return;
      }

      if (n.type === "opened_urls") {
        void handleOpenedUrlsRef.current(n.urls ?? []);
      }
    },
    [args.streamingContentRef, args.streamingMetaRef, args.streamingTokensRef, scheduleToolCallsReload, showMemoryToast],
  );

  useEffect(() => {
    let cancelled = false;
    let runtimeUnsubscribe: (() => void) | null = null;

    void args.runtimeClient
      .subscribeNotifications(handleRuntimeNotification, {
        thread_id: args.activeThreadId ?? undefined,
      })
      .then(({ unsubscribe }) => {
        if (cancelled) {
          unsubscribe();
          return;
        }
        runtimeUnsubscribe = unsubscribe;
      })
      .catch((error) => {
        console.warn("Failed to subscribe to runtime notifications:", error);
      });

    return () => {
      clearStreamingRefsRef.current();
      if (toolCallsReloadTimerRef.current !== null) {
        window.clearTimeout(toolCallsReloadTimerRef.current);
        toolCallsReloadTimerRef.current = null;
      }
      pendingToolCallsReloadRef.current = null;
      if (runtimeUnsubscribe) {
        try {
          runtimeUnsubscribe();
        } catch {
          // ignore
        }
      }
      cancelled = true;
      if (args.memoryToastTimeoutRef.current) {
        window.clearTimeout(args.memoryToastTimeoutRef.current);
        args.memoryToastTimeoutRef.current = null;
      }
    };
  }, [
    args.activeThreadId,
    args.memoryToastTimeoutRef,
    args.runtimeClient,
    handleRuntimeNotification,
  ]);

  useEffect(() => {
    const handleGlobalEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;
      if (args.activePage !== "workspace") return;
      if (!args.activeThreadId) return;
      if (args.slashQuery !== null) return;

      if (args.runningToolCallId) {
        event.preventDefault();
        args.setRunningToolCallId(null);
        cancelActiveRun();
        return;
      }

      if (args.pendingToolApproval) {
        event.preventDefault();
        cancelActiveRun();
        return;
      }

      if (args.isSending || args.streamingContent) {
        event.preventDefault();
        cancelActiveRun();
      }
    };

    window.addEventListener("keydown", handleGlobalEscape);
    return () => window.removeEventListener("keydown", handleGlobalEscape);
  }, [
    args.activePage,
    args.activeThreadId,
    args.isSending,
    args.pendingToolApproval,
    args.runningToolCallId,
    args.setRunningToolCallId,
    args.slashQuery,
    args.streamingContent,
    cancelActiveRun,
  ]);

  return {
    cancelActiveRun,
  };
}
