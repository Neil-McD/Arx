export const POLYNET_CODEX_WORKER_ENGINE_ID = "polynet_codex_worker";
export const POLYNET_CODEX_WORKER_CONTRACT_NAME = "polynet_codex_worker_fly_bridge_v1";
export const POLYNET_CODEX_WORKER_CONTRACT_VERSION = "v1";

type JsonRecord = Record<string, unknown>;

export type PolynetCodexWorkerSseEvent = {
  event: string;
  data: JsonRecord;
};

export type PolynetCodexWorkerBridgeResult =
  | {
      ok: true;
      assistantText: string;
      timing: JsonRecord | null;
      proof: JsonRecord | null;
      finalPayload: JsonRecord | null;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      assistantText: string;
      timing: JsonRecord | null;
      proof: JsonRecord | null;
    };

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // Convex exposes environment variables through process.env in actions.
  }
  return "";
}

function readBooleanEnv(name: string): boolean {
  const raw = readEnv(name).toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function getPolynetCodexWorkerBridgeConfig(): {
  enabled: boolean;
  baseUrl: string | null;
  authToken: string | null;
  disabledReason: string | null;
} {
  if (!readBooleanEnv("POLYNET_CODEX_WORKER_RUNTIME_ENABLED")) {
    return {
      enabled: false,
      baseUrl: null,
      authToken: null,
      disabledReason: "polynet_codex_worker_runtime_disabled",
    };
  }
  if (readEnv("POLYNET_DEPLOYMENT_KIND") !== "staging") {
    return {
      enabled: false,
      baseUrl: null,
      authToken: null,
      disabledReason: "polynet_codex_worker_staging_only",
    };
  }
  const baseUrl = readEnv("POLYNET_CODEX_WORKER_URL").replace(/\/+$/, "");
  const authToken = readEnv("POLYNET_CODEX_WORKER_AUTH_TOKEN");
  if (!baseUrl || !authToken) {
    return {
      enabled: false,
      baseUrl: baseUrl || null,
      authToken: authToken || null,
      disabledReason: "polynet_codex_worker_env_missing",
    };
  }
  return {
    enabled: true,
    baseUrl,
    authToken,
    disabledReason: null,
  };
}

export function shouldUsePolynetCodexWorkerBridge(params: {
  runtimeExecutionMode: "agentic" | "chat";
  stream: boolean;
  inferenceSource: "free" | "platform" | "user_key" | "chatgpt";
}): boolean {
  if (params.runtimeExecutionMode !== "agentic") return false;
  if (!params.stream) return false;
  if (params.inferenceSource !== "chatgpt") return false;
  return getPolynetCodexWorkerBridgeConfig().enabled;
}

export type PolynetCodexWorkerChatgptAuth = {
  accessToken: string;
  accountId: string;
  planType: string | null;
};

export function buildPolynetCodexWorkerPrompt(params: {
  conversationMessages: Array<{ role: "user" | "assistant"; content: string }>;
  latestUserText: string;
  communityName: string | null;
  communitySlug: string | null;
  communityOneLiner: string | null;
  communityAbout: string | null;
  communitySystemPrompt: string | null;
  agentName: string | null;
  agentSoul: string | null;
  threadWorkingState: unknown;
  allowedToolNames: string[];
  projectId: string | null;
}): string {
  const recentMessages = params.conversationMessages.slice(-12);
  const transcript = recentMessages
    .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}: ${message.content}`)
    .join("\n\n");
  const communityLines = [
    params.communityName ? `Community: ${params.communityName}` : "",
    params.communitySlug ? `Community slug: ${params.communitySlug}` : "",
    params.communityOneLiner ? `Community one-liner: ${params.communityOneLiner}` : "",
    params.communityAbout ? `Community about: ${params.communityAbout}` : "",
    params.communitySystemPrompt ? `Community instructions: ${params.communitySystemPrompt}` : "",
  ].filter(Boolean);
  const agentLines = [
    params.agentName ? `Agent name: ${params.agentName}` : "",
    params.agentSoul ? `Agent soul: ${params.agentSoul}` : "",
  ].filter(Boolean);
  const workingState =
    params.threadWorkingState && typeof params.threadWorkingState === "object"
      ? JSON.stringify(params.threadWorkingState).slice(0, 4000)
      : "";
  return [
    "You are PolyNet's headless Codex runtime for an authenticated workspace thread.",
    "Use the workspace_bash tool when real workspace commands are needed.",
    "Do not claim local PolyNet server state unless tool output or provided context proves it.",
    "Return a concise, user-facing answer when the work is done.",
    "",
    params.projectId ? `Project id: ${params.projectId}` : "",
    communityLines.length ? communityLines.join("\n") : "",
    agentLines.length ? agentLines.join("\n") : "",
    params.allowedToolNames.length ? `PolyNet allowed tool families: ${params.allowedToolNames.join(", ")}` : "",
    workingState ? `Thread working state:\n${workingState}` : "",
    transcript ? `Recent conversation:\n${transcript}` : "",
    `Latest user request:\n${params.latestUserText}`,
  ]
    .filter((line) => String(line ?? "").trim().length > 0)
    .join("\n\n");
}

function parseSseBlock(block: string): PolynetCodexWorkerSseEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }
  if (dataLines.length === 0) return null;
  const parsed = asRecord(JSON.parse(dataLines.join("\n"))) ?? {};
  return { event, data: parsed };
}

async function readResponseJson(response: Response): Promise<JsonRecord> {
  try {
    return asRecord(await response.json()) ?? {};
  } catch {
    return {};
  }
}

function normalizeWorkerErrorPayload(payload: JsonRecord, fallbackStatus: number): {
  code: string;
  message: string;
} {
  const code =
    String(payload.code ?? payload.error ?? "").trim() ||
    (fallbackStatus === 409 ? "worker_busy" : "polynet_codex_worker_failed");
  const message =
    String(payload.message ?? payload.error ?? "").trim() ||
    (fallbackStatus === 409
      ? "PolyNet Codex worker is busy."
      : "PolyNet Codex worker request failed.");
  return { code, message };
}

export async function cancelPolynetCodexWorkerTurn(params: {
  runId: string;
  machineId?: string | null;
}): Promise<{ ok: boolean; status: number }> {
  const config = getPolynetCodexWorkerBridgeConfig();
  if (!config.enabled || !config.baseUrl || !config.authToken) {
    return { ok: false, status: 503 };
  }
  const machineId = String(params.machineId ?? "").trim();
  try {
    const response = await fetch(`${config.baseUrl}/v1/codex/turn/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.authToken}`,
        "Content-Type": "application/json",
        // With a multi-machine pool, the cancel must reach the specific
        // machine running this turn, not whichever sibling is idle.
        ...(machineId ? { "fly-force-instance-id": machineId } : {}),
      },
      body: JSON.stringify({ run_id: params.runId }),
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 502 };
  }
}

export async function streamPolynetCodexWorkerTurn(params: {
  runId: string;
  prompt: string;
  model: string;
  sandboxName?: string | null;
  destroyAfterRun?: boolean;
  chatgptAuth: PolynetCodexWorkerChatgptAuth;
  ingest?: {
    url: string;
    token: string;
    context: Record<string, unknown>;
  } | null;
  onEvent: (event: PolynetCodexWorkerSseEvent) => Promise<void> | void;
}): Promise<PolynetCodexWorkerBridgeResult> {
  const config = getPolynetCodexWorkerBridgeConfig();
  if (!config.enabled || !config.baseUrl || !config.authToken) {
    return {
      ok: false,
      status: 503,
      code: config.disabledReason ?? "polynet_codex_worker_env_missing",
      message: "PolyNet Codex worker is not configured for this deployment.",
      assistantText: "",
      timing: null,
      proof: null,
    };
  }

  // A 409 means every awake machine is mid-turn; fly-proxy needs seconds to
  // boot a stopped pool sibling (cold start + Codex login), so retry with a
  // wake-sized backoff before declaring the pool full. 409 is always safe to
  // retry: the turn never started.
  const WORKER_BUSY_RETRY_DELAYS_MS = [1_500, 3_000, 4_500, 6_000];
  let busyAttempt = 0;
  let response: Response;
  // eslint-disable-next-line no-constant-condition
  while (true) {
  try {
    response = await fetch(`${config.baseUrl}/v1/codex/turn?stream=1`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      run_id: params.runId,
      model: params.model,
      prompt: params.prompt,
      stream: true,
      ...(String(params.sandboxName ?? "").trim()
        ? { sandbox_name: String(params.sandboxName ?? "").trim() }
        : {}),
      destroy_after_run: params.destroyAfterRun ?? true,
      chatgpt_auth: {
        access_token: params.chatgptAuth.accessToken,
        chatgpt_account_id: params.chatgptAuth.accountId,
        chatgpt_plan_type: params.chatgptAuth.planType,
      },
      ...(params.ingest
        ? {
            ingest: {
              url: params.ingest.url,
              token: params.ingest.token,
              context: params.ingest.context,
            },
          }
        : {}),
    }),
    });
  } catch (error) {
    return {
      ok: false,
      status: 502,
      code: "polynet_codex_worker_unreachable",
      message: error instanceof Error ? error.message : "PolyNet Codex worker is unreachable.",
      assistantText: "",
      timing: null,
      proof: null,
    };
  }
  if (response.status === 409 && busyAttempt < WORKER_BUSY_RETRY_DELAYS_MS.length) {
    await new Promise((resolve) =>
      setTimeout(resolve, WORKER_BUSY_RETRY_DELAYS_MS[busyAttempt]),
    );
    busyAttempt += 1;
    continue;
  }
  break;
  }

  if (!response.ok) {
    const payload = await readResponseJson(response);
    const error = normalizeWorkerErrorPayload(payload, response.status);
    return {
      ok: false,
      status: response.status,
      code: error.code,
      message: error.message,
      assistantText: "",
      timing: asRecord(payload.timing) ?? null,
      proof: asRecord(payload.proof) ?? null,
    };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return {
      ok: false,
      status: 502,
      code: "polynet_codex_worker_stream_missing",
      message: "PolyNet Codex worker response did not include a stream.",
      assistantText: "",
      timing: null,
      proof: null,
    };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let assistantText = "";
  let finalPayload: JsonRecord | null = null;
  let timing: JsonRecord | null = null;
  let proof: JsonRecord | null = null;
  const streamState: {
    errorPayload: { code: string; message: string } | null;
  } = {
    errorPayload: null,
  };

  const handleEvent = async (event: PolynetCodexWorkerSseEvent): Promise<void> => {
    if (event.event === "delta") {
      const full = typeof event.data.full_content === "string" ? event.data.full_content : null;
      const delta = typeof event.data.delta === "string" ? event.data.delta : "";
      if (full !== null) assistantText = full;
      else if (delta) assistantText += delta;
    } else if (event.event === "done") {
      if (typeof event.data.full_content === "string") assistantText = event.data.full_content;
      timing = asRecord(event.data.timing) ?? timing;
      proof = asRecord(event.data.proof) ?? proof;
      finalPayload = event.data;
    } else if (event.event === "run_finalized") {
      timing = asRecord(event.data.timing) ?? timing;
      proof = asRecord(event.data.proof) ?? proof;
      finalPayload = event.data;
      if (event.data.ok === false) {
        const workerError = asRecord(event.data.error);
        streamState.errorPayload = {
          code: String(workerError?.code ?? "polynet_codex_worker_turn_failed"),
          message:
            String(workerError?.message ?? workerError?.name ?? "").trim() ||
            "PolyNet Codex worker turn failed.",
        };
      }
    } else if (event.event === "error") {
      streamState.errorPayload = normalizeWorkerErrorPayload(event.data, 502);
    }
    await params.onEvent(event);
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let separatorIndex = buffer.indexOf("\n\n");
      while (separatorIndex >= 0) {
        const rawBlock = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const parsed = parseSseBlock(rawBlock);
        if (parsed) await handleEvent(parsed);
        separatorIndex = buffer.indexOf("\n\n");
      }
    }
    if (buffer.trim()) {
      const parsed = parseSseBlock(buffer);
      if (parsed) await handleEvent(parsed);
    }
  } catch (error) {
    // A dropped stream or a failing event callback must become a structured
    // result so the caller settles leases and finishes the run.
    return {
      ok: false,
      status: 502,
      code: "polynet_codex_worker_stream_failed",
      message: error instanceof Error ? error.message : "Worker stream failed.",
      assistantText,
      timing,
      proof,
    };
  }

  if (streamState.errorPayload) {
    return {
      ok: false,
      status: 502,
      code: streamState.errorPayload.code,
      message: streamState.errorPayload.message,
      assistantText,
      timing,
      proof,
    };
  }
  return {
    ok: true,
    assistantText,
    timing,
    proof,
    finalPayload,
  };
}
