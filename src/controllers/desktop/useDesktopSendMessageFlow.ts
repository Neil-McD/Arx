import { useCallback, type Dispatch, type SetStateAction } from "react";
import { executeSendMessageFlow } from "../../features/harness/sendTurn";
import type { SupabaseSession } from "../../../shared/supabaseAuthCore";
import type { ThreadService, ThreadServiceTurnStreamEvent } from "../../../shared/threadService";
import { deriveThreadTitleFromUserText, isMissingThreadTitleValue } from "../../../shared/threadTitleUi";
import type { StreamingMeta, StreamingTokens } from "../../features/harness/useStreamingState";

type SendFlowThread = {
  id: string;
  title: string | null;
  updated_at: number;
  last_seq?: number;
  storage_mode?: "cloud" | "local";
};

type SendFlowMessage = {
  id: string;
  session_id: string;
  role: string;
  content_json: string;
  created_at: number;
};

type SendFlowAttachment = {
  id: string;
  path: string;
  name: string;
  type: "image" | "file";
  size: number;
};

type UseDesktopSendMessageFlowArgs<
  ThreadT extends SendFlowThread,
  MessageT extends SendFlowMessage,
  SessionT extends SupabaseSession | null,
> = {
  commandInput: string;
  attachments: SendFlowAttachment[];
  activeThreadId: string | null;
  effectiveCwd: string;
  sendInFlightRef: { current: boolean };
  autoScrollEnabledRef: { current: boolean };
  dispatchRunPhase: (action: { type: "send_start" | "reset" }) => void;
  ensureThreadId: () => Promise<string | null>;
  getSession: () => SessionT;
  ensureWorkspaceThreadLensBeforeSend: (threadId: string) => Promise<void>;
  traceThreadContext?: (event: string, payload: Record<string, unknown>) => void;
  setCommandInput: Dispatch<SetStateAction<string>>;
  setAttachments: Dispatch<SetStateAction<SendFlowAttachment[]>>;
  handleSlashCommand: (userText: string, threadId: string) => Promise<boolean>;
  getThreadServiceById: (threadId: string) => ThreadService;
  loadMessages: (threadId: string) => Promise<void>;
  setMessages: Dispatch<SetStateAction<MessageT[]>>;
  setThreads: Dispatch<SetStateAction<ThreadT[]>>;
  ensureThreadReadyForSend: (threadId: string, session: SessionT) => Promise<boolean>;
  prepareSessionForSend?: (session: SessionT, threadId: string) => Promise<SessionT>;
  clearStreamingState: () => void;
  setStreamingRunId: Dispatch<SetStateAction<string | null>>;
  scheduleStreamingUpdate: () => void;
  streamingContentRef: { current: string | null };
  streamingTokensRef: { current: StreamingTokens | null };
  streamingMetaRef: { current: StreamingMeta | null };
  getSupabaseUrl: () => string | null;
  getSupabaseAnonKey: () => string | null;
  setMemoryToast: (message: string) => void;
  setAgentStatus: (value: null) => void;
  setRunningTools: (value: []) => void;
  getSendPolicySnapshot?: (threadId: string) => {
    selectedModelId?: string | null;
    hasChatgptAuth?: boolean;
  } | null;
};

export function useDesktopSendMessageFlow<
  ThreadT extends SendFlowThread,
  MessageT extends SendFlowMessage,
  SessionT extends SupabaseSession | null,
>(args: UseDesktopSendMessageFlowArgs<ThreadT, MessageT, SessionT>) {
  const handleSendMessage = useCallback(
    async (opts?: { text?: string }) => {
      await executeSendMessageFlow({
        commandInput: args.commandInput,
        attachments: args.attachments.map(({ path, name, type, size }) => ({ path, name, type, size })),
        activeThreadId: args.activeThreadId,
        effectiveCwd: args.effectiveCwd,
        sendInFlightRef: args.sendInFlightRef,
        dispatchRunPhase: args.dispatchRunPhase,
        onSendStart: () => {
          args.autoScrollEnabledRef.current = true;
        },
        ensureThreadId: args.ensureThreadId,
        getSession: args.getSession,
        ensureWorkspaceThreadLensBeforeSend: args.ensureWorkspaceThreadLensBeforeSend,
        traceThreadContext: args.traceThreadContext,
        setCommandInput: args.setCommandInput,
        setAttachments: (next) =>
          args.setAttachments(
            next.map((attachment) => ({
              ...attachment,
              id: crypto.randomUUID(),
              type: attachment.type === "image" ? "image" : "file",
            })),
          ),
        handleSlashCommand: args.handleSlashCommand,
        addMessage: async ({ thread_id, role, content_json }) => {
          const service = args.getThreadServiceById(thread_id);
          await service.addMessage({
            threadId: thread_id,
            role: role === "assistant" ? "assistant" : "user",
            contentJson: content_json,
          });
        },
        loadMessages: args.loadMessages,
        appendOptimisticUserMessage: (threadId, contentJson) => {
          args.setMessages((prev) => [
            ...prev,
            {
              id: `optimistic-user-${crypto.randomUUID()}`,
              session_id: threadId,
              role: "user",
              content_json: contentJson,
              created_at: Math.floor(Date.now() / 1000),
            } as MessageT,
          ]);
        },
        touchThreadForOptimisticMessage: (threadId, userText) => {
          const derivedTitle = deriveThreadTitleFromUserText(userText);
          let shouldPersistTitle = false;
          args.setThreads((prev) =>
            prev.map((thread) => {
              if (thread.id !== threadId) return thread;
              const nowSec = Math.floor(Date.now() / 1000);
              const nextThread: ThreadT = {
                ...thread,
                last_seq: Math.max(thread.last_seq ?? 0, 1),
                updated_at: Math.max(thread.updated_at ?? 0, nowSec),
              };
              if (derivedTitle && isMissingThreadTitleValue(thread.title)) {
                nextThread.title = derivedTitle;
                shouldPersistTitle = true;
              }
              return nextThread;
            }),
          );
          if (shouldPersistTitle && derivedTitle) {
            const service = args.getThreadServiceById(threadId);
            void service.setThreadTitle(threadId, derivedTitle).catch(() => {
              // best-effort; local optimistic title keeps UI stable if persistence fails.
            });
          }
        },
        ensureThreadReadyForSend: args.ensureThreadReadyForSend,
        prepareSessionForSend: args.prepareSessionForSend,
        clearStreamingState: args.clearStreamingState,
        scheduleStreamingUpdate: args.scheduleStreamingUpdate,
        sendTurn: async ({
          thread_id,
          cwd,
          input,
          user_content_json,
          supabase_url,
          supabase_anon_key,
          supabase_access_token,
        }) => {
          const service = args.getThreadServiceById(thread_id);
          const sendPolicySnapshot = args.getSendPolicySnapshot?.(thread_id) ?? undefined;
          const onStreamEvent = (event: ThreadServiceTurnStreamEvent): void => {
            if (event.type === "start") {
              args.setStreamingRunId(event.runId?.trim() || null);
              args.streamingMetaRef.current = {
                engine_id: event.engineId ?? "agent_web",
                model_id: event.modelId ?? "",
                inference_source: event.inferenceSource ?? null,
              };
              args.streamingTokensRef.current = {
                prompt_tokens: event.promptTokens ?? undefined,
                completion_tokens: event.completionTokens ?? undefined,
                max_tokens: event.maxTokens ?? undefined,
              };
              args.scheduleStreamingUpdate();
              return;
            }
            if (event.type === "delta") {
              args.dispatchRunPhase({ type: "stream_chunk" });
              if (event.fullContent !== null) {
                args.streamingContentRef.current = event.fullContent;
              } else if (event.delta.length > 0) {
                const prior = args.streamingContentRef.current ?? "";
                args.streamingContentRef.current = `${prior}${event.delta}`;
              }
              args.streamingTokensRef.current = {
                prompt_tokens: event.promptTokens ?? undefined,
                completion_tokens: event.completionTokens ?? undefined,
                max_tokens: event.maxTokens ?? undefined,
              };
              args.scheduleStreamingUpdate();
              return;
            }
            if (event.type === "done") {
              args.clearStreamingState();
            }
          };
          await service.sendTurn({
            threadId: thread_id,
            cwd: cwd ?? args.effectiveCwd,
            input,
            userContentJson: user_content_json,
            supabaseUrl: supabase_url,
            supabaseAnonKey: supabase_anon_key,
            supabaseAccessToken: supabase_access_token,
            sendPolicySnapshot,
            onStreamEvent,
          });
        },
        getSupabaseUrl: args.getSupabaseUrl,
        getSupabaseAnonKey: args.getSupabaseAnonKey,
        getSupabaseAccessToken: (session) => session.access_token ?? "",
        setMemoryToast: args.setMemoryToast,
        setAgentStatus: args.setAgentStatus,
        setRunningTools: args.setRunningTools,
      }, opts);
    },
    [args],
  );

  return { handleSendMessage };
}
