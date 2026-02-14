import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

type PlatformQuotaModalState = {
  reason: "quota" | "unavailable";
  threadId: string;
  mode: "respond" | "regenerate";
  message: string | null;
};

type WebStreamingMeta<MemoryUsedItemT, HistoryUsedItemT, CommunityEvidenceUsedT> = {
  engine_id: string;
  model_id: string | null;
  inference_source?: string | null;
  memory_used?: MemoryUsedItemT[];
  history_used?: HistoryUsedItemT[];
  community_evidence_used?: CommunityEvidenceUsedT | null;
};

type UseWebTurnRunnerControllerArgs<
  SessionT,
  MemoryUsedItemT,
  HistoryUsedItemT,
  CommunityEvidenceUsedT,
> = {
  getSupabaseUrl: () => string | null;
  fetchWithSupabasePublic: (url: string, init?: RequestInit) => Promise<Response>;
  fetchWithSupabaseAuth: (url: string, init: RequestInit, session: SessionT) => Promise<Response>;
  readSupabaseError: (response: Response) => Promise<string>;

  extractTextFromContentJson: (value: unknown) => string;
  parseMemoryUsedArray: (value: unknown) => MemoryUsedItemT[];
  parseHistoryUsedArray: (value: unknown) => HistoryUsedItemT[];
  extractCommunityEvidenceUsedV1: (value: unknown) => CommunityEvidenceUsedT | null;

  loadThreadMessages: (threadId: string, session: SessionT) => Promise<void>;
  loadThreads: (session: SessionT) => Promise<void>;
  showMemoryToastMessage: (message: string) => void;

  setPlatformQuotaModal: Dispatch<SetStateAction<PlatformQuotaModalState | null>>;
  setStreamingContent: Dispatch<SetStateAction<string | null>>;
  setStreamingThreadId: Dispatch<SetStateAction<string | null>>;
  setStreamingRunId: Dispatch<SetStateAction<string | null>>;
  setStreamingMeta: Dispatch<
    SetStateAction<WebStreamingMeta<MemoryUsedItemT, HistoryUsedItemT, CommunityEvidenceUsedT> | null>
  >;

  streamingContentRef: MutableRefObject<string | null>;
  streamingRafRef: MutableRefObject<number | null>;
  streamingAbortRef: MutableRefObject<AbortController | null>;
  streamingUserCancelledRef: MutableRefObject<boolean>;
};

type PublicTurnThreadMessage = {
  role: "user" | "assistant" | "system";
  content_json: unknown;
};

type RunPublicTurnParams<ThreadMessageT extends PublicTurnThreadMessage> = {
  modelId: string;
  threadId: string;
  runIdHint: string;
  messages: ThreadMessageT[];
};

type RunAgentTurnParams = {
  preferredModelId: string;
  mode?: "respond" | "regenerate";
  runIdHint: string;
  inferenceSource?: "platform" | "user";
};

type CreateThreadMessageParams = {
  id?: string;
  threadId: string;
  role: "user" | "assistant" | "system";
  content_json: unknown;
};

type CreateAssistantMessageParams = {
  threadId: string;
  text: string;
};

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}

function normalizeGuestInferenceError(message: string): string {
  const raw = (message ?? "").trim();
  if (!raw) return "Failed to run model.";
  const lower = raw.toLowerCase();
  if (
    lower.includes("no endpoints found matching your data policy") ||
    (lower.includes("free model publication") && lower.includes("privacy"))
  ) {
    return "Guest chat is unavailable because the OpenRouter key blocks free guest models. Enable Free model publication in OpenRouter privacy settings, or map guest models to non-free models.";
  }
  return raw;
}

export function useWebTurnRunnerController<
  SessionT,
  ThreadMessageT extends PublicTurnThreadMessage,
  MemoryUsedItemT,
  HistoryUsedItemT,
  CommunityEvidenceUsedT,
>(
  args: UseWebTurnRunnerControllerArgs<SessionT, MemoryUsedItemT, HistoryUsedItemT, CommunityEvidenceUsedT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const stopStreamingTurn = useCallback((): void => {
    const current = argsRef.current;
    if (!current.streamingAbortRef.current) return;
    current.streamingUserCancelledRef.current = true;
    current.streamingAbortRef.current.abort();
  }, []);

  const runPublicTurn = useCallback(
    async (
      params: RunPublicTurnParams<ThreadMessageT>,
    ): Promise<{ cancelled: boolean; error: string | null; content: string; runId: string | null }> => {
      const current = argsRef.current;
      const url = current.getSupabaseUrl();
      if (!url) return { cancelled: false, error: "Missing Supabase URL.", content: "", runId: null };

      current.streamingAbortRef.current?.abort();
      const abort = new AbortController();
      current.streamingAbortRef.current = abort;
      current.streamingUserCancelledRef.current = false;
      current.streamingContentRef.current = "";
      current.setStreamingContent("");
      current.setStreamingThreadId(params.threadId);
      current.setStreamingRunId(params.runIdHint);
      current.setStreamingMeta({
        engine_id: "public_web",
        model_id: params.modelId,
        inference_source: "platform",
        memory_used: [],
        history_used: [],
        community_evidence_used: null,
      });

      const scheduleStreamingFlush = () => {
        if (current.streamingRafRef.current) return;
        current.streamingRafRef.current = window.requestAnimationFrame(() => {
          current.streamingRafRef.current = null;
          current.setStreamingContent(current.streamingContentRef.current);
        });
      };

      const toPublicMessages = (
        items: ThreadMessageT[],
      ): Array<{ role: "user" | "assistant" | "system"; content: string }> => {
        const out: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];
        for (const msg of items) {
          if (!msg) continue;
          const role = msg.role;
          if (role !== "user" && role !== "assistant" && role !== "system") continue;
          const content = current.extractTextFromContentJson(msg.content_json).trim();
          if (!content) continue;
          out.push({ role, content });
        }
        return out;
      };

      let finalContent = "";
      let runIdFromServer: string | null = null;
      try {
        const turn = await current.fetchWithSupabasePublic(`${url}/functions/v1/public_turn`, {
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
            const messageFromServer = typeof parsed?.message === "string" ? parsed.message.trim() : "";
            const errorMessage = messageFromServer
              ? normalizeGuestInferenceError(messageFromServer)
              : "Guest chat is temporarily unavailable.";
            return { cancelled: false, error: errorMessage, content: "", runId: null };
          }
          const message = await current.readSupabaseError(turn);
          throw new Error(normalizeGuestInferenceError(message || "Failed to run model."));
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
              current.setStreamingRunId(parsed.run_id);
            }
            if (typeof parsed?.engine_id === "string") {
              current.setStreamingMeta({
                engine_id: parsed.engine_id,
                model_id: typeof parsed?.model_id === "string" ? parsed.model_id : params.modelId,
                inference_source: "platform",
                memory_used: [],
                history_used: [],
                community_evidence_used: null,
              });
            }
          } else if (eventName === "delta") {
            const full = typeof parsed?.full_content === "string" ? parsed.full_content : null;
            const delta = typeof parsed?.delta === "string" ? parsed.delta : "";
            if (full !== null) {
              finalContent = full;
              current.streamingContentRef.current = full;
            } else if (delta) {
              finalContent += delta;
              current.streamingContentRef.current = finalContent;
            }
            scheduleStreamingFlush();
          } else if (eventName === "done") {
            if (typeof parsed?.full_content === "string") {
              finalContent = parsed.full_content;
              current.streamingContentRef.current = parsed.full_content;
              scheduleStreamingFlush();
            }
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
        const cancelled = current.streamingUserCancelledRef.current || abort.signal.aborted || isAbortError(error);
        if (cancelled) return { cancelled: true, error: null, content: "", runId: null };
        const rawMessage =
          typeof error === "string" ? error : error instanceof Error ? error.message : "Failed to run model.";
        return { cancelled: false, error: normalizeGuestInferenceError(rawMessage), content: "", runId: null };
      } finally {
        if (current.streamingRafRef.current) {
          window.cancelAnimationFrame(current.streamingRafRef.current);
          current.streamingRafRef.current = null;
        }
        current.streamingAbortRef.current = null;
        current.streamingContentRef.current = null;
        current.setStreamingContent(null);
        current.setStreamingThreadId(null);
        current.setStreamingRunId(null);
        current.setStreamingMeta(null);
        current.streamingUserCancelledRef.current = false;
      }
    },
    [],
  );

  const runAgentTurn = useCallback(
    async (session: SessionT, threadId: string, params: RunAgentTurnParams): Promise<{ cancelled: boolean; error: string | null }> => {
      const current = argsRef.current;
      const url = current.getSupabaseUrl();
      if (!url) return { cancelled: false, error: "Missing Supabase URL." };

      current.streamingAbortRef.current?.abort();
      const abort = new AbortController();
      current.streamingAbortRef.current = abort;
      current.streamingUserCancelledRef.current = false;
      current.streamingContentRef.current = "";
      current.setStreamingContent("");
      current.setStreamingThreadId(threadId);
      current.setStreamingRunId(params.runIdHint);
      current.setStreamingMeta({
        engine_id: "agent_web",
        model_id: params.preferredModelId,
        inference_source: params.inferenceSource ?? null,
        memory_used: [],
        history_used: [],
        community_evidence_used: null,
      });

      const scheduleStreamingFlush = () => {
        if (current.streamingRafRef.current) return;
        current.streamingRafRef.current = window.requestAnimationFrame(() => {
          current.streamingRafRef.current = null;
          current.setStreamingContent(current.streamingContentRef.current);
        });
      };

      try {
        const turn = await current.fetchWithSupabaseAuth(
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
            const messageFromServer = typeof parsed?.message === "string" ? parsed.message.trim() : null;
            current.setPlatformQuotaModal({
              reason: code === "platform_inference_quota_exceeded" ? "quota" : "unavailable",
              threadId,
              mode: params.mode === "regenerate" ? "regenerate" : "respond",
              message: messageFromServer,
            });
            return { cancelled: false, error: null };
          }
          const message = await current.readSupabaseError(turn);
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
            if (typeof parsed?.run_id === "string") current.setStreamingRunId(parsed.run_id);
            if (typeof parsed?.engine_id === "string") {
              const memoryUsed = current.parseMemoryUsedArray(parsed?.memory_used);
              const historyUsed = current.parseHistoryUsedArray(parsed?.history_used);
              const communityEvidence = current.extractCommunityEvidenceUsedV1(parsed);
              current.setStreamingMeta({
                engine_id: parsed.engine_id,
                model_id: typeof parsed?.model_id === "string" ? parsed.model_id : null,
                inference_source: typeof parsed?.inference_source === "string" ? parsed.inference_source : null,
                memory_used: memoryUsed,
                history_used: historyUsed,
                community_evidence_used: communityEvidence,
              });
            }
          } else if (eventName === "delta") {
            const full = typeof parsed?.full_content === "string" ? parsed.full_content : null;
            const delta = typeof parsed?.delta === "string" ? parsed.delta : "";
            if (full !== null) {
              current.streamingContentRef.current = full;
            } else if (delta) {
              const prior = current.streamingContentRef.current ?? "";
              current.streamingContentRef.current = `${prior}${delta}`;
            }
            scheduleStreamingFlush();
          } else if (eventName === "done") {
            const memoryAdded = current.parseMemoryUsedArray(parsed?.memory_added);
            if (memoryAdded.length > 0) current.showMemoryToastMessage("Memory updated");
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

        await current.loadThreadMessages(threadId, session);
        await current.loadThreads(session);
        return { cancelled: false, error: null };
      } catch (error) {
        const cancelled = current.streamingUserCancelledRef.current || abort.signal.aborted || isAbortError(error);
        if (cancelled) {
          window.setTimeout(() => {
            void current.loadThreadMessages(threadId, session).catch(() => null);
            void current.loadThreads(session).catch(() => null);
          }, 350);
          return { cancelled: true, error: null };
        }
        const message =
          typeof error === "string" ? error : error instanceof Error ? error.message : "Failed to run model.";
        return { cancelled: false, error: message };
      } finally {
        if (current.streamingRafRef.current) {
          window.cancelAnimationFrame(current.streamingRafRef.current);
          current.streamingRafRef.current = null;
        }
        current.streamingAbortRef.current = null;
        current.streamingContentRef.current = null;
        current.setStreamingContent(null);
        current.setStreamingThreadId(null);
        current.setStreamingRunId(null);
        current.setStreamingMeta(null);
        current.streamingUserCancelledRef.current = false;
      }
    },
    [],
  );

  const createThreadMessage = useCallback(
    async (session: SessionT, params: CreateThreadMessageParams): Promise<string> => {
      const current = argsRef.current;
      const url = current.getSupabaseUrl();
      if (!url) throw new Error("Missing Supabase URL.");
      const messageId = (params.id ?? crypto.randomUUID()).trim() || crypto.randomUUID();
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: messageId,
            thread_id: params.threadId,
            seq: 0,
            role: params.role,
            content_json: params.content_json,
          }),
        },
        session,
      );
      if (!response.ok) {
        const message = await current.readSupabaseError(response);
        throw new Error(message || "Failed to save message.");
      }
      return messageId;
    },
    [],
  );

  const createAssistantTextMessage = useCallback(
    async (session: SessionT, params: CreateAssistantMessageParams): Promise<string> => {
      return await createThreadMessage(session, {
        threadId: params.threadId,
        role: "assistant",
        content_json: { text: params.text },
      });
    },
    [createThreadMessage],
  );

  const deleteThreadMessagesByIds = useCallback(async (session: SessionT, messageIds: string[]): Promise<void> => {
    const current = argsRef.current;
    const url = current.getSupabaseUrl();
    if (!url) throw new Error("Missing Supabase URL.");
    for (const messageId of messageIds) {
      const trimmed = messageId.trim();
      if (!trimmed) continue;
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/messages?id=eq.${encodeURIComponent(trimmed)}`,
        { method: "DELETE" },
        session,
      );
      if (!response.ok) {
        const message = await current.readSupabaseError(response);
        throw new Error(message || "Failed to delete message.");
      }
    }
  }, []);

  return {
    stopStreamingTurn,
    runPublicTurn,
    runAgentTurn,
    createThreadMessage,
    createAssistantTextMessage,
    deleteThreadMessagesByIds,
  };
}
