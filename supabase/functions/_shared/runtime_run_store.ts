import { supabaseAdminFetch } from "./supabase_admin.ts";

export type RuntimeLane = "public" | "daytona" | "chatgpt_desktop" | "platform_fallback";

export type RuntimeRunRow = {
  id: string;
  user_id: string;
  thread_id: string;
  project_id: string | null;
  lane: RuntimeLane;
  model_id: string | null;
  requires_tools: boolean;
  sandbox_id: string | null;
  idempotency_key: string;
  status:
    | "queued"
    | "running"
    | "awaiting_approval"
    | "resuming"
    | "completed"
    | "failed"
    | "cancelled"
    | "timed_out";
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type RuntimeToolDecisionRow = {
  run_id: string;
  tool_call_id: string;
  approved: boolean;
  note: string | null;
  decided_by: string;
  created_at: string;
  updated_at: string;
};

type ApiErrorFactory = (code: string, message: string, status: number) => Error;

type CreateRuntimeRunParams = {
  userId: string;
  threadId: string;
  projectId: string | null;
  lane: RuntimeLane;
  modelId: string;
  requiresTools: boolean;
  idempotencyKey: string;
  sandboxId: string | null;
  surface: string;
};

const TOOL_APPROVAL_WAIT_TIMEOUT_MS = 5 * 60 * 1000;
const TOOL_APPROVAL_WAIT_POLL_MS = 750;

export function createRuntimeRunStore(createApiError: ApiErrorFactory) {
  async function findExistingRun(
    userId: string,
    threadId: string,
    idempotencyKey: string,
  ): Promise<RuntimeRunRow | null> {
    const res = await supabaseAdminFetch(
      `/rest/v1/runtime_runs?select=id,user_id,thread_id,project_id,lane,model_id,requires_tools,sandbox_id,idempotency_key,status,error_code,error_message,created_at,started_at,finished_at&user_id=eq.${encodeURIComponent(
        userId,
      )}&thread_id=eq.${encodeURIComponent(threadId)}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&limit=1`,
      { method: "GET" },
    );
    if (!res.ok) throw createApiError("run_lookup_failed", await res.text(), 500);
    const rows = (await res.json()) as RuntimeRunRow[];
    return rows[0] ?? null;
  }

  async function loadRuntimeRunByIdForUser(runId: string, userId: string): Promise<RuntimeRunRow | null> {
    const res = await supabaseAdminFetch(
      `/rest/v1/runtime_runs?select=id,user_id,thread_id,project_id,lane,model_id,requires_tools,sandbox_id,idempotency_key,status,error_code,error_message,created_at,started_at,finished_at&id=eq.${encodeURIComponent(
        runId,
      )}&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
      { method: "GET" },
    );
    if (!res.ok) throw createApiError("run_lookup_failed", await res.text(), 500);
    const rows = (await res.json()) as RuntimeRunRow[];
    return rows[0] ?? null;
  }

  async function createRuntimeRun(params: CreateRuntimeRunParams): Promise<RuntimeRunRow> {
    const res = await supabaseAdminFetch("/rest/v1/runtime_runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        user_id: params.userId,
        thread_id: params.threadId,
        project_id: params.projectId,
        lane: params.lane,
        model_id: params.modelId,
        requires_tools: params.requiresTools,
        sandbox_id: params.sandboxId,
        idempotency_key: params.idempotencyKey,
        status: "running",
        started_at: new Date().toISOString(),
        metadata: {
          surface: params.surface,
        },
      }),
    });
    if (!res.ok) throw createApiError("run_create_failed", await res.text(), 500);
    const rows = (await res.json()) as RuntimeRunRow[];
    const row = rows[0];
    if (!row) throw createApiError("run_create_failed", "Failed to create runtime run.", 500);
    return row;
  }

  async function appendRuntimeRunEvent(
    runId: string,
    seq: number,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const res = await supabaseAdminFetch("/rest/v1/runtime_run_events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        run_id: runId,
        seq,
        event_type: eventType,
        payload,
      }),
    });
    if (!res.ok) throw createApiError("run_event_append_failed", await res.text(), 500);
  }

  async function patchRuntimeRun(runId: string, patch: Record<string, unknown>): Promise<void> {
    const res = await supabaseAdminFetch(`/rest/v1/runtime_runs?id=eq.${encodeURIComponent(runId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw createApiError("run_update_failed", await res.text(), 500);
  }

  async function upsertRuntimeToolDecision(params: {
    runId: string;
    userId: string;
    toolCallId: string;
    approved: boolean;
    note: string | null;
  }): Promise<RuntimeToolDecisionRow> {
    const res = await supabaseAdminFetch(
      `/rest/v1/runtime_tool_decisions?on_conflict=run_id,tool_call_id`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify({
          run_id: params.runId,
          user_id: params.userId,
          tool_call_id: params.toolCallId,
          approved: params.approved,
          note: params.note,
          decided_by: params.userId,
        }),
      },
    );
    if (!res.ok) throw createApiError("tool_decision_write_failed", await res.text(), 500);
    const rows = (await res.json()) as RuntimeToolDecisionRow[];
    const row = rows[0] ?? null;
    if (!row) {
      throw createApiError("tool_decision_write_failed", "Failed to record tool decision.", 500);
    }
    return row;
  }

  async function loadRuntimeToolDecision(
    runId: string,
    toolCallId: string,
  ): Promise<RuntimeToolDecisionRow | null> {
    const res = await supabaseAdminFetch(
      `/rest/v1/runtime_tool_decisions?select=run_id,tool_call_id,approved,note,decided_by,created_at,updated_at&run_id=eq.${encodeURIComponent(
        runId,
      )}&tool_call_id=eq.${encodeURIComponent(toolCallId)}&limit=1`,
      { method: "GET" },
    );
    if (!res.ok) throw createApiError("tool_decision_lookup_failed", await res.text(), 500);
    const rows = (await res.json()) as RuntimeToolDecisionRow[];
    return rows[0] ?? null;
  }

  async function waitForRuntimeToolDecision(params: {
    runId: string;
    toolCallId: string;
    timeoutMs?: number;
    pollMs?: number;
  }): Promise<RuntimeToolDecisionRow | null> {
    const timeoutMs = params.timeoutMs ?? TOOL_APPROVAL_WAIT_TIMEOUT_MS;
    const pollMs = params.pollMs ?? TOOL_APPROVAL_WAIT_POLL_MS;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const decision = await loadRuntimeToolDecision(params.runId, params.toolCallId);
      if (decision) return decision;
      await new Promise((resolve) => {
        setTimeout(resolve, pollMs);
      });
    }
    return null;
  }

  return {
    findExistingRun,
    loadRuntimeRunByIdForUser,
    createRuntimeRun,
    appendRuntimeRunEvent,
    patchRuntimeRun,
    upsertRuntimeToolDecision,
    loadRuntimeToolDecision,
    waitForRuntimeToolDecision,
  };
}
