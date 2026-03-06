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
  type ProjectRecord,
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

type SetThreadContextArgs = {
  thread_id: ThreadId;
  thread_lane?: "chat" | "agent" | null;
  project_id?: string | null;
  community_id?: string | null;
  expected_context_version?: number | null;
  update_thread_lane?: boolean;
  update_project_id?: boolean;
  update_community_id?: boolean;
};

export class TauriRuntimeClient implements RuntimeClient {
  private static isThreadContextVersionConflict(error: unknown): boolean {
    const message =
      typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "";
    const normalized = message.toLowerCase();
    return normalized.includes("thread context version conflict")
      || normalized.includes("thread_context_version_conflict");
  }

  private async invokeSetThreadContext(args: SetThreadContextArgs): Promise<ThreadRecord> {
    return invoke<ThreadRecord>("set_thread_context_cmd", {
      threadId: args.thread_id,
      threadLane: args.thread_lane ?? null,
      projectId: args.project_id ?? null,
      communityId: args.community_id ?? null,
      expectedContextVersion: args.expected_context_version ?? null,
      updateThreadLane: args.update_thread_lane ?? false,
      updateProjectId: args.update_project_id ?? false,
      updateCommunityId: args.update_community_id ?? false,
    });
  }

  private async setThreadContextWithOptimisticRetry(args: SetThreadContextArgs): Promise<ThreadRecord> {
    const firstRead = await this.getThread(args.thread_id);
    if (!firstRead) throw new Error("Thread not found.");
    let expectedContextVersion = firstRead.context_version ?? 0;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.invokeSetThreadContext({
          ...args,
          expected_context_version: expectedContextVersion,
        });
      } catch (error) {
        if (attempt > 0 || !TauriRuntimeClient.isThreadContextVersionConflict(error)) {
          throw error;
        }
        const latest = await this.getThread(args.thread_id);
        if (!latest) throw error;

        const targetLane = args.thread_lane ?? null;
        const targetProject = args.project_id ?? null;
        const targetCommunity = args.community_id ?? null;
        const laneAlreadyApplied =
          !args.update_thread_lane || (latest.thread_lane ?? null) === targetLane;
        const projectAlreadyApplied =
          !args.update_project_id || (latest.project_id ?? null) === targetProject;
        const communityAlreadyApplied =
          !args.update_community_id || (latest.community_id ?? null) === targetCommunity;
        if (laneAlreadyApplied && projectAlreadyApplied && communityAlreadyApplied) {
          return latest;
        }

        expectedContextVersion = latest.context_version ?? 0;
      }
    }

    throw new Error("Failed to set thread context.");
  }

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

  async getWorkspaceRoot(): Promise<string> {
    return invoke<string>("get_workspace_root_cmd");
  }

  async getAgentMode(thread_id: ThreadId): Promise<string> {
    return invoke<string>("get_agent_mode_cmd", { sessionId: thread_id });
  }

  async isPathWithinWorkspace(path: string): Promise<boolean> {
    return invoke<boolean>("is_path_within_workspace_cmd", { path });
  }

  async getEvent(args: { thread_id: ThreadId; event_id: string }): Promise<EventRecord | null> {
    return invoke<EventRecord | null>("get_event_cmd", {
      threadId: args.thread_id,
      eventId: args.event_id,
    });
  }

  async listProjects(): Promise<ProjectRecord[]> {
    return invoke<ProjectRecord[]>("list_projects_cmd");
  }

  async getActiveProject(): Promise<ProjectRecord | null> {
    return invoke<ProjectRecord | null>("get_active_project_cmd");
  }

  async createProject(path: string): Promise<ProjectRecord> {
    return invoke<ProjectRecord>("create_project_cmd", { path });
  }

  async updateProjectName(project_id: string, name: string | null): Promise<ProjectRecord> {
    return invoke<ProjectRecord>("update_project_name_cmd", {
      projectId: project_id,
      name: name ?? null,
    });
  }

  async deleteProject(project_id: string): Promise<void> {
    await invoke("delete_project_cmd", { projectId: project_id });
  }

  async setActiveProject(project_id: string | null): Promise<void> {
    await invoke("set_active_project_cmd", { projectId: project_id ?? null });
  }

  async listThreads(): Promise<ThreadRecord[]> {
    return invoke<ThreadRecord[]>("list_threads_cmd");
  }

  async createThread(args: {
    title: string;
    engine_id?: string | null;
    model_id?: string | null;
    thread_lane?: "chat" | "agent" | null;
    project_id?: string | null;
  }): Promise<ThreadRecord> {
    return invoke<ThreadRecord>("create_thread_cmd", {
      title: args.title,
      engineId: args.engine_id ?? null,
      modelId: args.model_id ?? null,
      threadLane: args.thread_lane ?? null,
      projectId: args.project_id ?? null,
    });
  }

  async deleteThread(thread_id: ThreadId): Promise<void> {
    await invoke("delete_thread_cmd", { threadId: thread_id });
  }

  async setThreadWorkspace(thread_id: ThreadId, workspace_path: string | null): Promise<void> {
    await invoke("set_thread_workspace_cmd", { threadId: thread_id, workspacePath: workspace_path });
  }

  async setThreadContext(args: SetThreadContextArgs): Promise<ThreadRecord> {
    const hasPatch =
      Boolean(args.update_thread_lane) ||
      Boolean(args.update_project_id) ||
      Boolean(args.update_community_id);
    const hasExpectedVersion =
      typeof args.expected_context_version === "number" &&
      Number.isFinite(args.expected_context_version);
    if (hasPatch && !hasExpectedVersion) {
      return this.setThreadContextWithOptimisticRetry(args);
    }
    return this.invokeSetThreadContext(args);
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

  async upsertThread(args: {
    thread_id: ThreadId;
    title?: string | null;
    engine_id?: string | null;
    model_id?: string | null;
    thread_lane?: "chat" | "agent" | null;
    project_id?: string | null;
    community_id?: string | null;
    created_at?: number | null;
    updated_at?: number | null;
  }): Promise<ThreadRecord> {
    return invoke<ThreadRecord>("upsert_thread_cmd", {
      threadId: args.thread_id,
      title: args.title ?? null,
      engineId: args.engine_id ?? null,
      modelId: args.model_id ?? null,
      threadLane: args.thread_lane ?? null,
      projectId: args.project_id ?? null,
      communityId: args.community_id ?? null,
      createdAt: args.created_at ?? null,
      updatedAt: args.updated_at ?? null,
    });
  }

  async setThreadTitle(thread_id: ThreadId, title: string | null): Promise<void> {
    await invoke("set_thread_title_cmd", {
      threadId: thread_id,
      title: title ?? null,
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

  async getThread(thread_id: ThreadId): Promise<ThreadRecord | null> {
    return invoke<ThreadRecord | null>("get_thread_cmd", { threadId: thread_id });
  }

  async listMessages(thread_id: ThreadId): Promise<MessageRecord[]> {
    return invoke<MessageRecord[]>("list_messages_cmd", { sessionId: thread_id });
  }

  async listMessagesTail(thread_id: ThreadId, limit: number): Promise<MessageRecord[]> {
    return invoke<MessageRecord[]>("list_messages_tail_cmd", { sessionId: thread_id, limit });
  }

  async listMessagesBeforeSeq(
    thread_id: ThreadId,
    before_seq: number,
    limit: number,
  ): Promise<MessageRecord[]> {
    return invoke<MessageRecord[]>("list_messages_before_seq_cmd", {
      sessionId: thread_id,
      beforeSeq: before_seq,
      limit,
    });
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
    user_content_json: string;
    community_name?: string | null;
    cloud_runtime_base_url?: string | null;
    cloud_publishable_key?: string | null;
    cloud_access_token?: string | null;
  }) {
    return invoke<{
      thread_id: ThreadId;
      engine_id: string;
      engine_input_event_id?: string | null;
      engine_input_seq?: number | null;
      run_id?: string | null;
    }>("submit_turn_cmd", {
      threadId: args.thread_id,
      cwd: args.cwd,
      input: args.input,
      userContentJson: args.user_content_json,
      communityName: args.community_name ?? null,
      cloudRuntimeBaseUrl: args.cloud_runtime_base_url ?? null,
      cloudPublishableKey: args.cloud_publishable_key ?? null,
      cloudAccessToken: args.cloud_access_token ?? null,
    });
  }

  async setAgentMode(thread_id: ThreadId, mode: "build" | "plan" | "explore"): Promise<void> {
    await invoke("set_agent_mode_cmd", { sessionId: thread_id, mode });
  }

  async detectTestCommands(cwd: string): Promise<string[]> {
    return invoke<string[]>("detect_test_commands_cmd", { cwd });
  }

  async setApprovalMode(mode: string): Promise<void> {
    await invoke("set_approval_mode_cmd", { mode });
  }

  async setExecPolicyRules(rules: string): Promise<void> {
    await invoke("set_exec_policy_rules_cmd", { rules });
  }

  async setActiveModel(model_id: string): Promise<void> {
    await invoke("set_active_model_cmd", { modelId: model_id });
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
