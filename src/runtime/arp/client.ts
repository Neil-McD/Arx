import type {
  EventRecord,
  InitializeResponse,
  MessageRecord,
  RuntimeNotification,
  SessionResume,
  ThreadId,
  ThreadRecord,
  ToolCallRecord,
  ToolCallId,
  TurnRecord,
  Unsubscribe,
} from "./types";

export type SubscribeNotificationsOptions = {
  thread_id?: ThreadId;
};

export interface RuntimeClient {
  initialize(): Promise<InitializeResponse>;

  createThread(args: {
    title: string;
    engine_id?: string | null;
    model_id?: string | null;
  }): Promise<ThreadRecord>;
  deleteThread(thread_id: ThreadId): Promise<void>;
  setThreadWorkspace(thread_id: ThreadId, workspace_path: string | null): Promise<void>;
  setThreadCommunity(thread_id: ThreadId, community_id: string | null): Promise<ThreadRecord>;
  setThreadEngine(args: {
    thread_id: ThreadId;
    engine_id: string;
    model_id?: string | null;
  }): Promise<ThreadRecord>;
  addMessage(args: {
    thread_id: ThreadId;
    role: string;
    content_json: string;
  }): Promise<void>;
  getAutoApproveWriteEdit(thread_id: ThreadId): Promise<boolean>;

  listThreads(): Promise<ThreadRecord[]>;
  getThread(thread_id: ThreadId): Promise<ThreadRecord | null>;

  listMessages(thread_id: ThreadId): Promise<MessageRecord[]>;
  listTurns(thread_id: ThreadId, limit: number): Promise<TurnRecord[]>;
  getSessionResume(thread_id: ThreadId): Promise<SessionResume>;
  listEvents(thread_id: ThreadId, limit: number): Promise<EventRecord[]>;
  listEventsSince(
    thread_id: ThreadId,
    after_seq: number,
    limit: number,
    opts?: { include_engine_io_chunk?: boolean }
  ): Promise<EventRecord[]>;
  listToolCalls(thread_id: ThreadId, limit: number): Promise<ToolCallRecord[]>;

  sendTurn(args: {
    thread_id: ThreadId;
    cwd: string;
    input: string;
    user_content_json: string;
    supabase_url?: string | null;
    supabase_anon_key?: string | null;
    supabase_access_token?: string | null;
  }): Promise<{
    thread_id: ThreadId;
    engine_id: string;
    engine_input_event_id?: string | null;
    engine_input_seq?: number | null;
    run_id?: string | null;
  }>;

  cancelRun(thread_id: ThreadId): Promise<boolean>;

  decideToolCall(
    tool_call_id: ToolCallId,
    decision: { approved: boolean; allow_write_edit_for_session?: boolean }
  ): Promise<void>;

  subscribeNotifications(
    onNotification: (n: RuntimeNotification) => void,
    opts?: SubscribeNotificationsOptions
  ): Promise<{ unsubscribe: Unsubscribe }>;
}
