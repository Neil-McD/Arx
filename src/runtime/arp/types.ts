export const ARP_PROTOCOL_VERSION = 1 as const;
export type ArpProtocolVersion = typeof ARP_PROTOCOL_VERSION;

export type RuntimeTransport = "tauri" | "websocket";

export type RuntimeCapabilities = {
  transport: RuntimeTransport;
  cursor_resume: boolean;
  tool_approvals: boolean;
  local_db_events: boolean;
  streaming_tokens: boolean;
};

export type InitializeResponse = {
  protocol_version: ArpProtocolVersion;
  runtime_id: string;
  capabilities: RuntimeCapabilities;
};

export type ThreadId = string;
export type EventId = string;
export type RunId = string;
export type ToolCallId = string;

export type EventRecord = {
  id: EventId;
  thread_id: ThreadId;
  seq: number;
  type: string;
  created_at: number;
  text: string | null;
  payload_json: string | null;
  blob_ref: string | null;
};

export type MessageRecord = {
  id: string;
  session_id: ThreadId;
  role: string;
  content_json: string;
  created_at: number;
  engine_id?: string | null;
  model_id?: string | null;
  run_id?: string | null;
};

export type TurnRecord = {
  id: string;
  thread_id: ThreadId;
  user_event_id: string;
  memory_retrieval_event_id: string | null;
  engine_input_event_id: string | null;
  assistant_event_id: string | null;
  seq_start: number;
  seq_end: number | null;
  created_at: number;
};

export type SessionResume = {
  session_id: ThreadId;
  last_message_id: string | null;
  last_message_at: number | null;
  last_response_id: string | null;
};

export type ThreadRecord = {
  id: ThreadId;
  title: string | null;
  engine_id: string;
  model_id: string | null;
  workspace_path: string | null;
  workspace_fingerprint?: string | null;
  community_id: string | null;
  created_at: number;
  updated_at: number;
  last_event_at: number | null;
  last_seq?: number;
};

export type ToolCallRecord = {
  id: ToolCallId;
  session_id: ThreadId;
  run_id?: RunId | null;
  tool_name: string;
  args_json: string;
  status: string;
  output_summary_json?: string | null;
  stdout_excerpt?: string | null;
  stderr_excerpt?: string | null;
  exit_code?: number | null;
  created_at: number;
  updated_at: number;
};

export type ToolApprovalRequestedNotification = {
  type: "tool_approval_requested";
  session_id: ThreadId;
  tool_call_id: ToolCallId;
  tool_name: string;
  args_json: string;
};

export type AgentStatusNotification = {
  type: "agent_status";
  session_id: ThreadId;
  status: "thinking" | "working" | "idle";
  tool_name: string | null;
  tool_args_preview: string | null;
};

export type ToolCallProgressNotification = {
  type: "tool_call_progress";
  session_id: ThreadId;
  tool_call_id: ToolCallId;
  tool_name: string;
  tool_args_preview: string | null;
  status: "started" | "finished";
  result: "ok" | "error" | null;
};

export type TurnFinishedNotification = {
  type: "turn_finished";
  session_id: ThreadId;
};

export type OpenRouterStreamNotification = {
  type: "openrouter_stream";
  session_id: ThreadId;
  run_id: RunId;
  engine_id: string;
  model_id: string;
  inference_source?: string | null;
  chunk: string;
  full_content: string;
  seq: number;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  max_tokens: number;
};

export type PlanUpdatedNotification = {
  type: "plan_updated";
  session_id: ThreadId;
  args: unknown;
};

export type ToolCallsUpdatedNotification = {
  type: "tool_calls_updated";
  session_id: ThreadId;
};

export type MemoryUpdatedNotification = {
  type: "memory_updated";
  session_id: ThreadId;
  label: string;
  scope: string;
};

export type OpenedUrlsNotification = {
  type: "opened_urls";
  urls: string[];
};

export type InferenceFallbackNotification = {
  type: "inference_fallback";
  session_id: ThreadId;
  from: string;
  to: string;
  reason: string;
};

export type PlatformInferenceActionRequiredNotification = {
  type: "platform_inference_action_required";
  session_id: ThreadId;
  approval_id: string;
  provider_id: string;
  provider_label: string;
  model_id: string;
  reason: string;
};

export type RuntimeNotification =
  | ToolApprovalRequestedNotification
  | AgentStatusNotification
  | ToolCallProgressNotification
  | TurnFinishedNotification
  | OpenRouterStreamNotification
  | PlanUpdatedNotification
  | ToolCallsUpdatedNotification
  | MemoryUpdatedNotification
  | OpenedUrlsNotification
  | InferenceFallbackNotification
  | PlatformInferenceActionRequiredNotification;

export type Unsubscribe = () => void;

export type RuntimeItemStatus = "created" | "in_progress" | "completed" | "failed";

export type RuntimeItemBase = {
  v: 1;
  kind: string;
  id: string;
  thread_id: ThreadId;
  seq?: number;
  status: RuntimeItemStatus;
  created_at: number;
  updated_at?: number;
};

export type MessageItem = RuntimeItemBase & {
  kind: "message";
  role: "user" | "assistant";
  content_json: string;
  meta?: { engine_id?: string; model_id?: string; run_id?: string };
};

export type ToolCallItem = RuntimeItemBase & {
  kind: "tool_call";
  tool_call_id: ToolCallId;
  tool_name: string;
  args_json: string;
  approved?: boolean;
  approved_by?: "user" | "policy";
  note?: string | null;
  exec_status?: "ok" | "error" | "unknown";
  reason?: string | null;
  exit_code?: number | null;
};

export type RunItem = RuntimeItemBase & {
  kind: "run";
  run_id: RunId;
  mode: "build" | "explore" | "plan";
  status?: "ok" | "cancelled" | "error";
  reason?: string | null;
};

export type RuntimeItem = MessageItem | ToolCallItem | RunItem;
