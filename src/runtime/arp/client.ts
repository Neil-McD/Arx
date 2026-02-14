import type {
  EventRecord,
  InitializeResponse,
  MessageRecord,
  ProjectRecord,
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

  getWorkspaceRoot(): Promise<string>;
  getAgentMode(thread_id: ThreadId): Promise<string>;
  isPathWithinWorkspace(path: string): Promise<boolean>;
  getEvent(args: { thread_id: ThreadId; event_id: string }): Promise<EventRecord | null>;

  listProjects(): Promise<ProjectRecord[]>;
  getActiveProject(): Promise<ProjectRecord | null>;
  createProject(path: string): Promise<ProjectRecord>;
  updateProjectName(project_id: string, name: string | null): Promise<ProjectRecord>;
  deleteProject(project_id: string): Promise<void>;
  setActiveProject(project_id: string | null): Promise<void>;

  createThread(args: {
    title: string;
    engine_id?: string | null;
    model_id?: string | null;
    thread_lane?: "chat" | "agent" | null;
    project_id?: string | null;
  }): Promise<ThreadRecord>;
  deleteThread(thread_id: ThreadId): Promise<void>;
  setThreadWorkspace(thread_id: ThreadId, workspace_path: string | null): Promise<void>;
  setThreadContext(args: {
    thread_id: ThreadId;
    thread_lane?: "chat" | "agent" | null;
    project_id?: string | null;
    community_id?: string | null;
    expected_context_version?: number | null;
    update_thread_lane?: boolean;
    update_project_id?: boolean;
    update_community_id?: boolean;
  }): Promise<ThreadRecord>;
  setThreadEngine(args: {
    thread_id: ThreadId;
    engine_id: string;
    model_id?: string | null;
  }): Promise<ThreadRecord>;
  upsertThread(args: {
    thread_id: ThreadId;
    title?: string | null;
    engine_id?: string | null;
    model_id?: string | null;
    thread_lane?: "chat" | "agent" | null;
    project_id?: string | null;
    community_id?: string | null;
    created_at?: number | null;
    updated_at?: number | null;
  }): Promise<ThreadRecord>;
  setThreadTitle(thread_id: ThreadId, title: string | null): Promise<void>;
  addMessage(args: {
    thread_id: ThreadId;
    role: string;
    content_json: string;
  }): Promise<void>;

  listThreads(): Promise<ThreadRecord[]>;
  getThread(thread_id: ThreadId): Promise<ThreadRecord | null>;

  listMessages(thread_id: ThreadId): Promise<MessageRecord[]>;
  listMessagesTail(thread_id: ThreadId, limit: number): Promise<MessageRecord[]>;
  listMessagesBeforeSeq(thread_id: ThreadId, before_seq: number, limit: number): Promise<MessageRecord[]>;
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

  setAgentMode(thread_id: ThreadId, mode: "build" | "plan" | "explore"): Promise<void>;
  detectTestCommands(cwd: string): Promise<string[]>;
  setApprovalMode(mode: string): Promise<void>;
  setExecPolicyRules(rules: string): Promise<void>;
  setActiveModel(model_id: string): Promise<void>;

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
