export type SendMessageAttachment = {
  path: string;
  name: string;
  type: string;
  size: number;
};

type SendMessageParams = {
  thread_id: string;
  role: "user" | "assistant";
  content_json: string;
};

type SendTurnParams = {
  thread_id: string;
  cwd: string;
  input: string;
  user_content_json: string;
  supabase_url: string;
  supabase_anon_key: string;
  supabase_access_token: string;
};

type SendMessageFlowDeps<TSession> = {
  commandInput: string;
  attachments: SendMessageAttachment[];
  activeThreadId: string | null;
  effectiveCwd: string | null;
  sendInFlightRef: { current: boolean };
  dispatchRunPhase: (action: { type: "send_start" | "reset" }) => void;
  onSendStart?: () => void;
  ensureThreadId: () => Promise<string | null>;
  getSession: () => TSession;
  ensureWorkspaceThreadLensBeforeSend: (threadId: string) => Promise<void>;
  setCommandInput: (value: string) => void;
  setAttachments: (value: SendMessageAttachment[]) => void;
  handleSlashCommand: (userText: string, threadId: string) => Promise<boolean>;
  addMessage: (params: SendMessageParams) => Promise<void>;
  loadMessages: (threadId: string) => Promise<void>;
  appendOptimisticUserMessage: (threadId: string, contentJson: string) => void;
  touchThreadForOptimisticMessage: (threadId: string, userText: string) => void;
  ensureThreadReadyForSend: (threadId: string, session: TSession) => Promise<boolean>;
  clearStreamingRefs: () => void;
  scheduleStreamingUpdate: () => void;
  sendTurn: (params: SendTurnParams) => Promise<void>;
  getSupabaseUrl: () => string | null;
  getSupabaseAnonKey: () => string | null;
  getSupabaseAccessToken: (session: NonNullable<TSession>) => string;
  setMemoryToast: (message: string) => void;
  setAgentStatus: (value: null) => void;
  setRunningTools: (value: []) => void;
  traceThreadContext?: (event: string, payload: Record<string, unknown>) => void;
};

function getErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

export async function executeSendMessageFlow<TSession>(
  deps: SendMessageFlowDeps<TSession>,
  opts?: { text?: string },
): Promise<void> {
  const inputText = typeof opts?.text === "string" ? opts.text : deps.commandInput;
  const hasText = inputText.trim().length > 0;
  const hasAttachments = deps.attachments.length > 0;
  if (!hasText && !hasAttachments) return;
  if (deps.sendInFlightRef.current) return;
  deps.sendInFlightRef.current = true;

  deps.onSendStart?.();

  let threadId: string | null = null;
  let session = deps.getSession();

  // Capture input at click time, before any async work mutates UI state.
  const userText = inputText.trim();
  const currentAttachments = [...deps.attachments];

  deps.dispatchRunPhase({ type: "send_start" });
  try {
    threadId = await deps.ensureThreadId();
    if (!threadId) return;
    session = deps.getSession();

    deps.traceThreadContext?.("send_preflight_lens_start", {
      thread_id: threadId,
      has_session: Boolean(session),
    });
    await deps.ensureWorkspaceThreadLensBeforeSend(threadId);
    deps.traceThreadContext?.("send_preflight_lens_complete", {
      thread_id: threadId,
    });

    deps.setCommandInput("");
    deps.setAttachments([]);

    const contentPayload: {
      text: string;
      attachments?: Array<{ path: string; name: string; type: string; size: number }>;
    } = { text: userText };
    if (currentAttachments.length > 0) {
      contentPayload.attachments = currentAttachments.map((attachment) => ({
        path: attachment.path,
        name: attachment.name,
        type: attachment.type,
        size: attachment.size,
      }));
    }
    const contentJson = JSON.stringify(contentPayload);

    const handledSlash = await deps.handleSlashCommand(userText, threadId);
    if (handledSlash) return;

    if (userText.length === 0) {
      await deps.addMessage({
        thread_id: threadId,
        role: "user",
        content_json: contentJson,
      });
      await deps.loadMessages(threadId);
      return;
    }

    const ensured = await deps.ensureThreadReadyForSend(threadId, session);
    if (!ensured) {
      deps.setCommandInput(userText);
      deps.setAttachments(currentAttachments);
      await deps.loadMessages(threadId);
      return;
    }

    deps.appendOptimisticUserMessage(threadId, contentJson);
    deps.touchThreadForOptimisticMessage(threadId, userText);

    deps.clearStreamingRefs();
    deps.scheduleStreamingUpdate();

    const cwd = deps.effectiveCwd || "";
    const supabase_url = deps.getSupabaseUrl() ?? "";
    const supabase_anon_key = deps.getSupabaseAnonKey() ?? "";
    const supabase_access_token = session ? deps.getSupabaseAccessToken(session as NonNullable<TSession>) : "";

    deps.traceThreadContext?.("send_turn_dispatch", {
      thread_id: threadId,
      input_chars: userText.length,
      has_supabase_access_token: Boolean(supabase_access_token),
    });
    await deps.sendTurn({
      thread_id: threadId,
      cwd,
      input: userText,
      user_content_json: contentJson,
      supabase_url,
      supabase_anon_key,
      supabase_access_token,
    });
    deps.traceThreadContext?.("send_turn_dispatch_complete", {
      thread_id: threadId,
    });

    await deps.loadMessages(threadId);
  } catch (error) {
    const message = getErrorMessage(error);
    const targetThreadId = threadId ?? deps.activeThreadId;
    deps.traceThreadContext?.("send_turn_error", {
      thread_id: targetThreadId,
      message,
    });
    if (!targetThreadId) {
      deps.setMemoryToast(`Failed to send message: ${message}`);
      return;
    }

    await deps.addMessage({
      thread_id: targetThreadId,
      role: "assistant",
      content_json: JSON.stringify({ text: `Engine error: ${message}` }),
    });

    await deps.loadMessages(targetThreadId);
  } finally {
    deps.traceThreadContext?.("send_turn_finalize", {
      thread_id: threadId ?? deps.activeThreadId,
    });
    deps.sendInFlightRef.current = false;
    deps.dispatchRunPhase({ type: "reset" });
    deps.setAgentStatus(null);
    deps.setRunningTools([]);
  }
}
