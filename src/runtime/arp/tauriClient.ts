import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { RuntimeClient, SubscribeNotificationsOptions } from "./client";
import {
  ARP_PROTOCOL_VERSION,
  type AgentStatusNotification,
  type EventRecord,
  type InitializeResponse,
  type SessionResume,
  type MemoryUpdatedNotification,
  type MessageRecord,
  type InferenceFallbackNotification,
  type OpenedUrlsNotification,
  type OpenRouterStreamNotification,
  type PlatformInferenceActionRequiredNotification,
  type PlanUpdatedNotification,
  type RuntimeNotification,
  type ThreadId,
  type ThreadRecord,
  type ToolApprovalRequestedNotification,
  type ToolCallRecord,
  type ToolCallId,
  type ToolCallProgressNotification,
  type ToolCallsUpdatedNotification,
  type TurnRecord,
  type TurnFinishedNotification,
  type Unsubscribe,
} from "./types";

type SessionIdPayload = { session_id: string };

type ToolApprovalRequestedPayload = {
  session_id: string;
  tool_call_id: string;
  tool_name: string;
  args_json: string;
};

type AgentStatusPayload = {
  session_id: string;
  status: "thinking" | "working" | "idle";
  tool_name: string | null;
  tool_args_preview: string | null;
};

type ToolCallProgressPayload = {
  session_id: string;
  tool_call_id: string;
  tool_name: string;
  tool_args_preview: string | null;
  status: "started" | "finished";
  result: "ok" | "error" | null;
};

type OpenRouterStreamPayload = {
  session_id: string;
  run_id: string;
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

type PlanUpdatedPayload = { session_id: string; args: unknown };
type ToolCallsUpdatedPayload = { session_id: string };
type MemoryUpdatedPayload = { session_id: string; label: string; scope: string };
type OpenedUrlsPayload = { urls: string[] };
type InferenceFallbackPayload = { session_id: string; from: string; to: string; reason: string };
type PlatformInferenceActionRequiredPayload = {
  session_id: string;
  approval_id: string;
  provider_id: string;
  provider_label: string;
  model_id: string;
  reason: string;
};

export class TauriRuntimeClient implements RuntimeClient {
  async initialize(): Promise<InitializeResponse> {
    try {
      return await invoke<InitializeResponse>("initialize_cmd");
    } catch {
      return {
        protocol_version: ARP_PROTOCOL_VERSION,
        runtime_id: "arx_harness_tauri",
        capabilities: {
          transport: "tauri",
          // Fail closed on handshake errors; callers can fall back to full refresh mode.
          cursor_resume: false,
          tool_approvals: true,
          local_db_events: true,
          streaming_tokens: true,
        },
      };
    }
  }

  async listThreads(): Promise<ThreadRecord[]> {
    return invoke<ThreadRecord[]>("list_threads_cmd");
  }

  async createThread(args: {
    title: string;
    engine_id?: string | null;
    model_id?: string | null;
  }): Promise<ThreadRecord> {
    return invoke<ThreadRecord>("create_thread_cmd", {
      title: args.title,
      engineId: args.engine_id ?? null,
      modelId: args.model_id ?? null,
    });
  }

  async deleteThread(thread_id: ThreadId): Promise<void> {
    await invoke("delete_thread_cmd", { threadId: thread_id });
  }

  async setThreadWorkspace(thread_id: ThreadId, workspace_path: string | null): Promise<void> {
    await invoke("set_thread_workspace_cmd", { threadId: thread_id, workspacePath: workspace_path });
  }

  async setThreadCommunity(thread_id: ThreadId, community_id: string | null): Promise<ThreadRecord> {
    return invoke<ThreadRecord>("set_thread_community_cmd", {
      threadId: thread_id,
      communityId: community_id,
    });
  }

  async setThreadEngine(args: {
    thread_id: ThreadId;
    engine_id: string;
    model_id?: string | null;
  }): Promise<ThreadRecord> {
    return invoke<ThreadRecord>("set_thread_engine_cmd", {
      threadId: args.thread_id,
      engineId: args.engine_id,
      modelId: args.model_id ?? null,
    });
  }

  async addMessage(args: {
    thread_id: ThreadId;
    role: string;
    content_json: string;
  }): Promise<void> {
    await invoke("add_message_cmd", {
      sessionId: args.thread_id,
      role: args.role,
      contentJson: args.content_json,
    });
  }

  async getAutoApproveWriteEdit(thread_id: ThreadId): Promise<boolean> {
    return invoke<boolean>("get_auto_approve_write_edit_cmd", { threadId: thread_id });
  }

  async getThread(thread_id: ThreadId): Promise<ThreadRecord | null> {
    return invoke<ThreadRecord | null>("get_thread_cmd", { threadId: thread_id });
  }

  async listMessages(thread_id: ThreadId): Promise<MessageRecord[]> {
    return invoke<MessageRecord[]>("list_messages_cmd", { sessionId: thread_id });
  }

  async listTurns(thread_id: ThreadId, limit: number): Promise<TurnRecord[]> {
    return invoke<TurnRecord[]>("list_turns_cmd", { threadId: thread_id, limit });
  }

  async getSessionResume(thread_id: ThreadId): Promise<SessionResume> {
    return invoke<SessionResume>("get_session_resume_cmd", { sessionId: thread_id });
  }

  async listEvents(thread_id: ThreadId, limit: number): Promise<EventRecord[]> {
    return invoke<EventRecord[]>("list_events_cmd", { threadId: thread_id, limit });
  }

  async listEventsSince(
    thread_id: ThreadId,
    after_seq: number,
    limit: number,
    opts?: { include_engine_io_chunk?: boolean }
  ): Promise<EventRecord[]> {
    return invoke<EventRecord[]>("list_events_since_cmd", {
      threadId: thread_id,
      afterSeq: after_seq,
      limit,
      includeEngineIoChunk: opts?.include_engine_io_chunk ?? null,
    });
  }

  async listToolCalls(thread_id: ThreadId, limit: number): Promise<ToolCallRecord[]> {
    return invoke<ToolCallRecord[]>("list_tool_calls_cmd", { threadId: thread_id, limit });
  }

  async sendTurn(args: {
    thread_id: ThreadId;
    cwd: string;
    input: string;
    history_messages_json?: string | null;
    personal_memory_items_json?: string | null;
    community_system_prompt?: string | null;
    supabase_url?: string | null;
    supabase_anon_key?: string | null;
    supabase_access_token?: string | null;
  }) {
    return invoke<{
      thread_id: ThreadId;
      engine_id: string;
      engine_input_event_id?: string | null;
      engine_input_seq?: number | null;
      run_id?: string | null;
    }>("engine_send_turn_cmd", {
      threadId: args.thread_id,
      cwd: args.cwd,
      input: args.input,
      historyMessagesJson: args.history_messages_json ?? null,
      personalMemoryItemsJson: args.personal_memory_items_json ?? null,
      communitySystemPrompt: args.community_system_prompt ?? null,
      supabaseUrl: args.supabase_url ?? null,
      supabaseAnonKey: args.supabase_anon_key ?? null,
      supabaseAccessToken: args.supabase_access_token ?? null,
    });
  }

  async cancelRun(thread_id: ThreadId): Promise<boolean> {
    return invoke<boolean>("cancel_run_cmd", { threadId: thread_id });
  }

  async decideToolCall(
    tool_call_id: ToolCallId,
    decision: { approved: boolean; allow_write_edit_for_session?: boolean }
  ): Promise<void> {
    await invoke("decide_tool_call_cmd", {
      toolCallId: tool_call_id,
      approved: decision.approved,
      allowWriteEditForSession: decision.allow_write_edit_for_session ?? null,
    });
  }

  async subscribeNotifications(
    onNotification: (n: RuntimeNotification) => void,
    opts?: SubscribeNotificationsOptions
  ): Promise<{ unsubscribe: Unsubscribe }> {
    const threadIdFilter = opts?.thread_id?.trim() || null;

    const wrap = (n: RuntimeNotification) => {
      if (!threadIdFilter) {
        onNotification(n);
        return;
      }
      if ("session_id" in n) {
        if (n.session_id === threadIdFilter) onNotification(n);
        return;
      }
      if (n.type === "opened_urls") {
        onNotification(n);
      }
    };

    const unsubs: Array<Promise<() => void>> = [];

    unsubs.push(
      listen<ToolApprovalRequestedPayload>("tool-approval-requested", (event) => {
        const payload = event.payload;
        const n: ToolApprovalRequestedNotification = {
          type: "tool_approval_requested",
          session_id: payload.session_id,
          tool_call_id: payload.tool_call_id,
          tool_name: payload.tool_name,
          args_json: payload.args_json,
        };
        wrap(n);
      })
    );

    unsubs.push(
      listen<AgentStatusPayload>("agent-status", (event) => {
        const payload = event.payload;
        const n: AgentStatusNotification = {
          type: "agent_status",
          session_id: payload.session_id,
          status: payload.status,
          tool_name: payload.tool_name,
          tool_args_preview: payload.tool_args_preview,
        };
        wrap(n);
      })
    );

    unsubs.push(
      listen<ToolCallProgressPayload>("tool-call-progress", (event) => {
        const payload = event.payload;
        const n: ToolCallProgressNotification = {
          type: "tool_call_progress",
          session_id: payload.session_id,
          tool_call_id: payload.tool_call_id,
          tool_name: payload.tool_name,
          tool_args_preview: payload.tool_args_preview,
          status: payload.status,
          result: payload.result,
        };
        wrap(n);
      })
    );

    unsubs.push(
      listen<OpenRouterStreamPayload>("openrouter-stream", (event) => {
        const payload = event.payload;
        const n: OpenRouterStreamNotification = {
          type: "openrouter_stream",
          session_id: payload.session_id,
          run_id: payload.run_id,
          engine_id: payload.engine_id,
          model_id: payload.model_id,
          inference_source: payload.inference_source ?? null,
          chunk: payload.chunk,
          full_content: payload.full_content,
          seq: payload.seq,
          prompt_tokens: payload.prompt_tokens ?? null,
          completion_tokens: payload.completion_tokens ?? null,
          max_tokens: payload.max_tokens,
        };
        wrap(n);
      })
    );

    unsubs.push(
      listen<SessionIdPayload>("openrouter-turn-finished", (event) => {
        const payload = event.payload;
        const n: TurnFinishedNotification = {
          type: "turn_finished",
          session_id: payload.session_id,
        };
        wrap(n);
      })
    );

    unsubs.push(
      listen<MemoryUpdatedPayload>("memory-updated", (event) => {
        const payload = event.payload;
        const n: MemoryUpdatedNotification = {
          type: "memory_updated",
          session_id: payload.session_id,
          label: payload.label,
          scope: payload.scope,
        };
        wrap(n);
      })
    );

    unsubs.push(
      listen<PlanUpdatedPayload>("plan-updated", (event) => {
        const payload = event.payload;
        const n: PlanUpdatedNotification = {
          type: "plan_updated",
          session_id: payload.session_id,
          args: payload.args,
        };
        wrap(n);
      })
    );

    unsubs.push(
      listen<ToolCallsUpdatedPayload>("tool-calls-updated", (event) => {
        const payload = event.payload;
        const n: ToolCallsUpdatedNotification = {
          type: "tool_calls_updated",
          session_id: payload.session_id,
        };
        wrap(n);
      })
    );

    unsubs.push(
      listen<OpenedUrlsPayload>("app-opened-urls", (event) => {
        const payload = event.payload;
        const n: OpenedUrlsNotification = { type: "opened_urls", urls: payload.urls ?? [] };
        wrap(n);
      })
    );

    unsubs.push(
      listen<InferenceFallbackPayload>("inference-fallback", (event) => {
        const payload = event.payload;
        const n: InferenceFallbackNotification = {
          type: "inference_fallback",
          session_id: payload.session_id,
          from: payload.from,
          to: payload.to,
          reason: payload.reason,
        };
        wrap(n);
      })
    );

    unsubs.push(
      listen<PlatformInferenceActionRequiredPayload>("platform-inference-action-required", (event) => {
        const payload = event.payload;
        const n: PlatformInferenceActionRequiredNotification = {
          type: "platform_inference_action_required",
          session_id: payload.session_id,
          approval_id: payload.approval_id,
          provider_id: payload.provider_id,
          provider_label: payload.provider_label,
          model_id: payload.model_id,
          reason: payload.reason,
        };
        wrap(n);
      })
    );

    const unsubscribe: Unsubscribe = () => {
      void Promise.all(unsubs).then((fns) => {
        for (const fn of fns) {
          try {
            fn();
          } catch {
            // ignore
          }
        }
      });
    };

    return { unsubscribe };
  }
}
