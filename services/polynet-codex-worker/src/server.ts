import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { CodexAppServerClient } from "./codexAppServerClient.ts";
import {
  buildBlaxelBashDynamicToolSpec,
  destroyBlaxelSandboxBestEffort,
  ensureBlaxelSandbox,
  normalizeToolCommand,
  previewText,
  readBlaxelEnvStatus,
  runBlaxelBash,
  safeResourceName,
  type BlaxelToolCallSummary,
} from "./blaxelTool.ts";
import { TimingCollector, elapsedMs, nowMs } from "./timing.ts";

type JsonRecord = Record<string, unknown>;

type RuntimeEvent = {
  id: string;
  run_id: string;
  seq: number;
  event_type: string;
  payload: JsonRecord;
  created_at: string;
};

type StreamWriter = {
  send: (event: string, data: JsonRecord) => void;
};

type ActiveTurn = {
  runId: string;
  sandboxName: string;
  fallbackCommand: string;
  commandTimeoutSeconds: number;
  timing: TimingCollector;
  toolCalls: BlaxelToolCallSummary[];
  assistantText: string;
  turnId: string | null;
  firstCodexEventAtMs: number | null;
  firstAssistantDeltaAtMs: number | null;
  firstBlaxelToolRequestAtMs: number | null;
  completedAtMs: number | null;
  eventSeq: number;
  eventLog: RuntimeEvent[];
  writer: StreamWriter | null;
  turnCompletionResolvers: Map<string, Array<(value: JsonRecord) => void>>;
};

type WorkerChatgptAuth = {
  accessToken: string;
  chatgptAccountId: string;
  chatgptPlanType: string | null;
};

type WorkerIngestConfig = {
  url: string;
  token: string;
  context: JsonRecord;
};

type RunTurnParams = {
  runId: string;
  prompt: string;
  model: string;
  sandboxName: string;
  sandboxProvided: boolean;
  command: string;
  commandTimeoutSeconds: number;
  destroyAfterRun: boolean;
  probeMode: boolean;
  chatgptAuth: WorkerChatgptAuth | null;
  ingest: WorkerIngestConfig | null;
  writer: StreamWriter | null;
};

type WorkerRuntimeOptions = {
  cwd: string;
  codexBin: string;
  model: string;
  authToken: string;
};

type WorkerRuntimeHealth = {
  ok: boolean;
  status: "ok" | "degraded";
  codex: {
    bin: string;
    version: string | null;
    running: boolean;
    initialized: boolean;
    codex_home: string | null;
    platform_family: string | null;
    platform_os: string | null;
  };
  blaxel: ReturnType<typeof readBlaxelEnvStatus>;
};

export class WorkerBusyError extends Error {
  constructor() {
    super("worker_turn_in_progress");
    this.name = "WorkerBusyError";
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function readEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = readEnv(name).toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function readIntegerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(readEnv(name), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > 1_000_000) {
        reject(new Error("request_body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendWorkerBusy(res: ServerResponse, runId: string | null): void {
  res.writeHead(409, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Retry-After": "1",
  });
  res.end(
    JSON.stringify(
      {
        ok: false,
        code: "worker_busy",
        message: "worker_turn_in_progress",
        run_id: runId,
      },
      null,
      2,
    ),
  );
}

function sendSseHeaders(res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });
}

function writeSse(res: ServerResponse, event: string, data: JsonRecord): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function readBearer(req: IncomingMessage): string {
  const raw = String(req.headers.authorization ?? "").trim();
  if (!raw.toLowerCase().startsWith("bearer ")) return "";
  return raw.slice(7).trim();
}

function getCodexVersion(codexBin: string): string | null {
  const result = spawnSync(codexBin, ["--version"], {
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) return null;
  return String(result.stdout || result.stderr || "").trim() || null;
}

function describeError(error: unknown): JsonRecord | null {
  if (!error) return null;
  return {
    code: error instanceof WorkerBusyError ? "worker_busy" : "polynet_codex_worker_turn_failed",
    message: error instanceof Error ? error.message : String(error),
  };
}

export class PolynetCodexWorkerRuntime {
  private readonly options: WorkerRuntimeOptions;
  private client: CodexAppServerClient | null = null;
  private initializePromise: Promise<void> | null = null;
  private activeTurn: ActiveTurn | null = null;

  constructor(options: WorkerRuntimeOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.initializePromise) return this.initializePromise;
    this.initializePromise = this.startInner();
    return this.initializePromise;
  }

  async stop(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.initializePromise = null;
    this.activeTurn = null;
    if (client) await client.stop();
  }

  isAuthorizedBearer(token: string): boolean {
    return Boolean(this.options.authToken) && token === this.options.authToken;
  }

  isBusy(): boolean {
    return this.activeTurn !== null;
  }

  health(): WorkerRuntimeHealth {
    const init = this.client?.initResult ?? null;
    const blaxel = readBlaxelEnvStatus();
    const initialized = this.client?.isInitialized === true;
    return {
      ok: initialized && blaxel.configured,
      status: initialized && blaxel.configured ? "ok" : "degraded",
      codex: {
        bin: this.options.codexBin,
        version: getCodexVersion(this.options.codexBin),
        running: this.client?.isRunning === true,
        initialized,
        codex_home: (init?.codexHome ?? readEnv("CODEX_HOME")) || null,
        platform_family: init?.platformFamily ?? null,
        platform_os: init?.platformOs ?? null,
      },
      blaxel,
    };
  }

  async runTurn(params: RunTurnParams): Promise<JsonRecord> {
    if (this.activeTurn) throw new WorkerBusyError();

    const activeTurn: ActiveTurn = {
      runId: params.runId,
      sandboxName: params.sandboxName,
      fallbackCommand: params.command,
      commandTimeoutSeconds: params.commandTimeoutSeconds,
      timing: new TimingCollector(),
      toolCalls: [],
      assistantText: "",
      turnId: null,
      firstCodexEventAtMs: null,
      firstAssistantDeltaAtMs: null,
      firstBlaxelToolRequestAtMs: null,
      completedAtMs: null,
      eventSeq: 0,
      eventLog: [],
      writer: params.writer,
      turnCompletionResolvers: new Map(),
    };
    this.activeTurn = activeTurn;
    let pendingError: unknown = null;
    let summary: JsonRecord | null = null;
    let finalSummary: JsonRecord | null = null;
    let proof: { ok: boolean; failures: string[] } | null = null;

    const emitWorkerEvent = (eventType: string, payload: JsonRecord): RuntimeEvent => {
      activeTurn.eventSeq += 1;
      const event: RuntimeEvent = {
        id: `${params.runId}:${activeTurn.eventSeq}:${eventType}`,
        run_id: params.runId,
        seq: activeTurn.eventSeq,
        event_type: eventType,
        payload,
        created_at: new Date().toISOString(),
      };
      activeTurn.eventLog.push(event);
      activeTurn.writer?.send("runtime_event", event as unknown as JsonRecord);
      return event;
    };

    const waitForTurnCompletion = (turnId: string, timeoutMs = 300_000): Promise<JsonRecord> =>
      new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          activeTurn.turnCompletionResolvers.delete(turnId);
          reject(new Error(`timed out waiting for turn completion: ${turnId}`));
        }, timeoutMs);
        const wrappedResolve = (value: JsonRecord) => {
          clearTimeout(timeout);
          resolve(value);
        };
        const current = activeTurn.turnCompletionResolvers.get(turnId) ?? [];
        current.push(wrappedResolve);
        activeTurn.turnCompletionResolvers.set(turnId, current);
      });

    let sandboxEnsured = false;
    let chatgptAuthApplied = false;
    try {
      await this.start();
      if (!this.client) throw new Error("codex_app_server_missing");

      if (params.chatgptAuth) {
        activeTurn.timing.startBucket("codex_account_login_ms");
        await this.client.request("account/login/start", {
          type: "chatgptAuthTokens",
          accessToken: params.chatgptAuth.accessToken,
          chatgptAccountId: params.chatgptAuth.chatgptAccountId,
          chatgptPlanType: params.chatgptAuth.chatgptPlanType,
        });
        chatgptAuthApplied = true;
        const accountLoginMs = activeTurn.timing.endBucket("codex_account_login_ms");
        emitWorkerEvent("codex_account_login_finished", {
          auth_mode: "user_chatgpt",
          chatgpt_account_id: params.chatgptAuth.chatgptAccountId,
          latency_ms: accountLoginMs,
        });
      }

      activeTurn.writer?.send("start", {
        run_id: params.runId,
        engine_id: "polynet_codex_worker",
        model_id: params.model,
        stage: "start",
      });
      activeTurn.timing.mark("worker_turn_started", {
        run_id: params.runId,
        model: params.model,
        probe_mode: params.probeMode,
      });

      activeTurn.timing.startBucket("sandbox_ensure_ms");
      emitWorkerEvent("sandbox_ensure_started", {
        sandbox_name: params.sandboxName,
      });
      const ensured = await ensureBlaxelSandbox({
        sandboxName: params.sandboxName,
        requireExisting: params.sandboxProvided,
        labels: {
          run_id: safeResourceName(params.runId) || "unknown-run",
        },
      });
      sandboxEnsured = true;
      const sandboxEnsureMs = activeTurn.timing.endBucket("sandbox_ensure_ms");
      emitWorkerEvent("sandbox_ensure_finished", {
        sandbox_name: params.sandboxName,
        provider_sandbox_id: ensured.providerSandboxId,
        workspace_root: ensured.workspaceRoot,
        latency_ms: sandboxEnsureMs,
      });

      activeTurn.timing.startBucket("codex_thread_start_ms");
      const threadResponse = asRecord(
        await this.client.request("thread/start", {
          model: params.model,
          cwd: this.options.cwd,
          approvalPolicy: "never",
          sandbox: "read-only",
          ephemeral: true,
          developerInstructions: [
            "You are running inside the PolyNet Codex worker service.",
            "Your workspace is a full-access remote Linux environment rooted at /workspace, reached only through the dynamic tool named workspace_bash.",
            "workspace_bash can read, write, install, and run anything in that workspace.",
            "Never mention internal infrastructure, vendor, or hosting names; refer to the environment simply as the workspace.",
            "The local environment is not your workspace: never use local shell commands, local file edits, or local paths.",
            "Report the tool output concisely.",
          ].join(" "),
          dynamicTools: [buildBlaxelBashDynamicToolSpec()],
          experimentalRawEvents: false,
          persistExtendedHistory: false,
        }),
      );
      const codexThreadStartMs = activeTurn.timing.endBucket("codex_thread_start_ms");
      const thread = asRecord(threadResponse?.thread);
      const threadId = typeof thread?.id === "string" ? thread.id : null;
      if (!threadId) throw new Error("thread/start did not return a thread id.");
      emitWorkerEvent("codex_thread_started", {
        codex_thread_id: threadId,
        latency_ms: codexThreadStartMs,
      });

      activeTurn.timing.startBucket("codex_turn_start_ack_ms");
      const turnStartedAtMs = nowMs();
      const turnResponse = asRecord(
        await this.client.request("turn/start", {
          threadId,
          input: [{ type: "text", text: params.prompt, text_elements: [] }],
          approvalPolicy: "never",
          sandboxPolicy: { type: "readOnly", networkAccess: false },
          model: params.model,
        }),
      );
      const turnStartAckMs = activeTurn.timing.endBucket("codex_turn_start_ack_ms");
      const turn = asRecord(turnResponse?.turn);
      const turnId = typeof turn?.id === "string" ? turn.id : null;
      if (!turnId) throw new Error("turn/start did not return a turn id.");
      activeTurn.turnId = turnId;
      emitWorkerEvent("codex_turn_start_acknowledged", {
        codex_thread_id: threadId,
        codex_turn_id: turnId,
        latency_ms: turnStartAckMs,
      });
      await waitForTurnCompletion(turnId);
      activeTurn.timing.setBucket("codex_turn_total_ms", elapsedMs(turnStartedAtMs));

      proof = params.probeMode
        ? validateProbeProof({
            toolCalls: activeTurn.toolCalls,
          })
        : { ok: true, failures: [] as string[] };
      summary = {
        ok: proof.ok,
        run_id: params.runId,
        engine_id: "polynet_codex_worker",
        model_id: params.model,
        sandbox_name: params.sandboxName,
        codex_turn_id: activeTurn.turnId,
        assistant_text: activeTurn.assistantText,
        tool_calls: activeTurn.toolCalls.map((call) => ({
          turn_id: call.turnId,
          call_id: call.callId,
          command: call.command,
          latency_ms: call.latencyMs,
          ok: call.ok,
          exit_code: call.exitCode,
          stdout_preview: previewText(call.stdout, 1000),
          stderr_preview: previewText(call.stderr, 1000),
          provider_command_id: call.providerCommandId,
        })),
        proof,
        timing: activeTurn.timing.summary(),
      };
      const modelFinishedPayload = {
        run_id: params.runId,
        engine_id: "polynet_codex_worker",
        model_id: params.model,
        stage: "model_finished",
        ok: proof.ok,
        full_content: activeTurn.assistantText,
        proof,
        timing: activeTurn.timing.summary(),
      };
      emitWorkerEvent("run_model_finished", modelFinishedPayload);
      activeTurn.writer?.send("run_model_finished", modelFinishedPayload);
      if (!proof.ok) {
        throw new Error(`polynet_codex_worker_probe_failed:${proof.failures.join(",")}`);
      }
      activeTurn.writer?.send("done", {
        run_id: params.runId,
        engine_id: "polynet_codex_worker",
        model_id: params.model,
        stage: "done",
        full_content: activeTurn.assistantText,
        proof,
        timing: activeTurn.timing.summary(),
      });
    } catch (error) {
      pendingError = error;
    } finally {
      if (chatgptAuthApplied && this.client) {
        try {
          await this.client.request("account/logout", {});
          emitWorkerEvent("codex_account_logout_finished", { ok: true });
        } catch (logoutError) {
          emitWorkerEvent("codex_account_logout_finished", {
            ok: false,
            message:
              logoutError instanceof Error ? logoutError.message : String(logoutError),
          });
        }
      }
      if (params.destroyAfterRun && sandboxEnsured) {
        activeTurn.timing.startBucket("sandbox_destroy_ms");
        const cleanup = await destroyBlaxelSandboxBestEffort(params.sandboxName);
        const sandboxDestroyMs = activeTurn.timing.endBucket("sandbox_destroy_ms");
        emitWorkerEvent("sandbox_destroy_finished", {
          sandbox_name: params.sandboxName,
          ok: cleanup.ok,
          failure_code: cleanup.failureCode,
          latency_ms: sandboxDestroyMs,
        });
      }
      finalSummary = summary
        ? {
            ...summary,
            ok: pendingError ? false : summary.ok,
            error: describeError(pendingError),
            timing: activeTurn.timing.summary(),
          }
        : {
            ok: false,
            run_id: params.runId,
            engine_id: "polynet_codex_worker",
            model_id: params.model,
            sandbox_name: params.sandboxName,
            codex_turn_id: activeTurn.turnId,
            assistant_text: activeTurn.assistantText,
            tool_calls: activeTurn.toolCalls.map((call) => ({
              turn_id: call.turnId,
              call_id: call.callId,
              command: call.command,
              latency_ms: call.latencyMs,
              ok: call.ok,
              exit_code: call.exitCode,
              stdout_preview: previewText(call.stdout, 1000),
              stderr_preview: previewText(call.stderr, 1000),
              provider_command_id: call.providerCommandId,
            })),
            proof,
            error: describeError(pendingError),
            timing: activeTurn.timing.summary(),
          };
      const finalizedPayload = {
        run_id: params.runId,
        engine_id: "polynet_codex_worker",
        model_id: params.model,
        stage: "finalized",
        ok: !pendingError,
        proof,
        error: describeError(pendingError),
        timing: activeTurn.timing.summary(),
      };
      emitWorkerEvent("run_finalized", finalizedPayload);
      activeTurn.writer?.send("run_finalized", finalizedPayload);
      if (params.ingest) {
        await pushIngestPayloadBestEffort({
          ingest: params.ingest,
          payload: {
            context: params.ingest.context,
            status: pendingError ? "error" : "ok",
            error: describeError(pendingError),
            assistant_text: activeTurn.assistantText,
            events: activeTurn.eventLog.map((event) => ({
              seq: event.seq,
              event_type: event.event_type,
              payload: event.payload,
              created_at: event.created_at,
            })),
            timing: activeTurn.timing.summary(),
          },
        });
      }
      this.activeTurn = null;
    }
    if (pendingError) throw pendingError;
    if (!finalSummary) throw new Error("polynet_codex_worker_missing_summary");
    return finalSummary;
  }

  private async startInner(): Promise<void> {
    this.client = new CodexAppServerClient({
      codexBin: this.options.codexBin,
      cwd: this.options.cwd,
      env: process.env,
      onNotification: (message) => this.handleNotification(message),
      onServerRequest: (message) => this.handleServerRequest(message),
      onStderr: (line) => {
        process.stderr.write(`[codex app-server] ${line}\n`);
      },
    });
    const startedAtMs = nowMs();
    await this.client.initialize({
      clientName: "polynet_codex_worker",
      clientTitle: "PolyNet Codex Worker",
      clientVersion: "0.1.0",
      experimentalApi: true,
    });
    process.stdout.write(
      `${JSON.stringify({
        kind: "polynet_codex_worker_service_event",
        event: "codex_app_server_ready",
        latency_ms: elapsedMs(startedAtMs),
        codex_home: this.client.initResult?.codexHome ?? null,
      })}\n`,
    );
  }

  private handleNotification(message: JsonRecord): void {
    const activeTurn = this.activeTurn;
    if (!activeTurn) return;
    const method = String(message.method ?? "");
    const params = asRecord(message.params);

    if (activeTurn.firstCodexEventAtMs === null && method.startsWith("turn/")) {
      activeTurn.firstCodexEventAtMs = nowMs();
      activeTurn.timing.setBucket(
        "first_codex_event_ms",
        activeTurn.firstCodexEventAtMs - activeTurn.timing.startedAtMs,
      );
    }

    if (method === "turn/started" && params) {
      const turn = asRecord(params.turn);
      const turnId = typeof turn?.id === "string" ? turn.id : null;
      if (turnId && !activeTurn.turnId) activeTurn.turnId = turnId;
      this.emitRuntimeEvent("codex_turn_started", {
        codex_turn_id: activeTurn.turnId,
      });
      return;
    }

    if (method === "item/agentMessage/delta" && params) {
      if (activeTurn.firstAssistantDeltaAtMs === null) {
        activeTurn.firstAssistantDeltaAtMs = nowMs();
        activeTurn.timing.setBucket(
          "first_assistant_delta_ms",
          activeTurn.firstAssistantDeltaAtMs - activeTurn.timing.startedAtMs,
        );
      }
      const delta = String(params.delta ?? "");
      if (!delta) return;
      activeTurn.assistantText += delta;
      activeTurn.writer?.send("delta", {
        run_id: activeTurn.runId,
        delta,
        full_content: activeTurn.assistantText,
      });
      return;
    }

    if (method === "item/started" && params) {
      const item = asRecord(params.item);
      if (String(item?.type ?? "") === "dynamicToolCall") {
        this.emitRuntimeEvent("tool_call_started", {
          codex_turn_id: String(params.turnId ?? ""),
          item_id: String(item?.id ?? ""),
          tool: String(item?.tool ?? ""),
          arguments: item?.arguments ?? null,
        });
      }
      return;
    }

    if (method === "item/completed" && params) {
      const item = asRecord(params.item);
      if (String(item?.type ?? "") === "dynamicToolCall") {
        this.emitRuntimeEvent("tool_call_finished", {
          codex_turn_id: String(params.turnId ?? ""),
          item_id: String(item?.id ?? ""),
          tool: String(item?.tool ?? ""),
          status: String(item?.status ?? ""),
          success: item?.success === true,
          duration_ms: typeof item?.durationMs === "number" ? item.durationMs : null,
        });
      }
      return;
    }

    if (method === "turn/completed" && params) {
      const turn = asRecord(params.turn);
      const turnId = typeof turn?.id === "string" ? turn.id : null;
      activeTurn.completedAtMs = nowMs();
      this.emitRuntimeEvent("codex_turn_completed", {
        codex_turn_id: turnId,
        status: String(turn?.status ?? ""),
      });
      if (turnId) {
        const waiters = activeTurn.turnCompletionResolvers.get(turnId) ?? [];
        activeTurn.turnCompletionResolvers.delete(turnId);
        for (const waiter of waiters) waiter(params);
      }
    }
  }

  private async handleServerRequest(message: JsonRecord): Promise<void> {
    if (!this.client) throw new Error("codex_app_server_client_missing");
    const activeTurn = this.activeTurn;
    const method = String(message.method ?? "");
    if (method !== "item/tool/call") {
      if (method === "account/chatgptAuthTokens/refresh") {
        this.client.respondError(
          message.id,
          -32000,
          "chatgpt token refresh is unavailable in the PolyNet worker; restart the turn",
        );
        return;
      }
      if (method === "item/commandExecution/requestApproval") {
        this.client.respond(message.id, { decision: "decline" });
        return;
      }
      if (method === "execCommandApproval" || method === "applyPatchApproval") {
        this.client.respond(message.id, { decision: "denied" });
        return;
      }
      this.client.respondError(message.id, -32601, `unsupported server request: ${method}`);
      return;
    }
    if (!activeTurn) {
      this.client.respondError(message.id, -32000, "no active PolyNet worker turn");
      return;
    }
    const params = asRecord(message.params);
    if (!params || String(params.tool ?? "") !== "workspace_bash") {
      this.client.respondError(message.id, -32601, "unsupported dynamic tool");
      return;
    }
    const command = normalizeToolCommand(params.arguments, activeTurn.fallbackCommand);
    if (activeTurn.firstBlaxelToolRequestAtMs === null) {
      activeTurn.firstBlaxelToolRequestAtMs = nowMs();
      activeTurn.timing.setBucket(
        "first_workspace_exec_ms",
        activeTurn.firstBlaxelToolRequestAtMs - activeTurn.timing.startedAtMs,
      );
    }
    this.emitRuntimeEvent("workspace_exec_requested", {
      codex_turn_id: typeof params.turnId === "string" ? params.turnId : null,
      call_id: typeof params.callId === "string" ? params.callId : null,
      sandbox_name: activeTurn.sandboxName,
      command,
    });
    const result = await runBlaxelBash({
      sandboxName: activeTurn.sandboxName,
      turnId: typeof params.turnId === "string" ? params.turnId : null,
      callId: typeof params.callId === "string" ? params.callId : null,
      command,
      timeoutSeconds: activeTurn.commandTimeoutSeconds,
    });
    activeTurn.toolCalls.push(result.summary);
    activeTurn.timing.setBucket("latest_workspace_exec_latency_ms", result.summary.latencyMs);
    this.emitRuntimeEvent("workspace_exec_finished", {
      ok: result.summary.ok,
      latency_ms: result.summary.latencyMs,
      exit_code: result.summary.exitCode,
      provider_command_id: result.summary.providerCommandId,
      stdout_preview: previewText(result.summary.stdout),
      stderr_preview: previewText(result.summary.stderr),
    });
    this.client.respond(message.id, {
      success: result.summary.ok,
      contentItems: [{ type: "inputText", text: result.contentText }],
    });
  }

  private emitRuntimeEvent(eventType: string, payload: JsonRecord): void {
    const activeTurn = this.activeTurn;
    if (!activeTurn) return;
    activeTurn.eventSeq += 1;
    const event: RuntimeEvent = {
      id: `${activeTurn.runId}:${activeTurn.eventSeq}:${eventType}`,
      run_id: activeTurn.runId,
      seq: activeTurn.eventSeq,
      event_type: eventType,
      payload,
      created_at: new Date().toISOString(),
    };
    activeTurn.eventLog.push(event);
    activeTurn.writer?.send("runtime_event", event as unknown as JsonRecord);
  }
}

async function pushIngestPayloadBestEffort(params: {
  ingest: WorkerIngestConfig;
  payload: JsonRecord;
}): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(params.ingest.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.ingest.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params.payload),
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) {
        process.stdout.write(
          `${JSON.stringify({
            kind: "polynet_codex_worker_service_event",
            event: "ingest_push_succeeded",
            attempt,
          })}\n`,
        );
        return;
      }
      // 4xx means the payload or auth is wrong; retrying cannot help.
      if (response.status >= 400 && response.status < 500) break;
    } catch {
      // Network failure: retry below.
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
  }
  process.stderr.write(
    `${JSON.stringify({
      kind: "polynet_codex_worker_service_event",
      event: "ingest_push_failed",
    })}\n`,
  );
}

function validateProbeProof(params: {
  toolCalls: BlaxelToolCallSummary[];
}): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  if (params.toolCalls.length !== 1) failures.push("expected_exactly_one_blaxel_tool_call");
  const first = params.toolCalls[0] ?? null;
  if (!first?.ok) failures.push("blaxel_tool_call_not_ok");
  const combined = `${first?.stdout ?? ""}\n${first?.stderr ?? ""}`;
  if (!combined.includes("POLYNET_CODEX_WORKER_SERVICE_PROBE")) {
    failures.push("probe_marker_missing");
  }
  if (!combined.includes("/workspace")) failures.push("workspace_root_missing");
  return {
    ok: failures.length === 0,
    failures,
  };
}

function buildProbePrompt(command: string): string {
  return [
    `Call workspace_bash exactly once with command \`${command}\`.`,
    "Then summarize the output and say whether it ran in the workspace.",
    "Do not call any other tools.",
  ].join(" ");
}

async function handleTurnEndpoint(params: {
  runtime: PolynetCodexWorkerRuntime;
  req: IncomingMessage;
  res: ServerResponse;
  probeMode: boolean;
}): Promise<void> {
  const body = asRecord(await readJsonBody(params.req)) ?? {};
  const url = new URL(params.req.url ?? "/", "http://localhost");
  const stream = body.stream === true || url.searchParams.get("stream") === "1";
  const model = String(body.model ?? readEnv("POLYNET_CODEX_WORKER_MODEL") ?? "gpt-5.5").trim() || "gpt-5.5";
  const runId =
    String(body.run_id ?? body.runId ?? "").trim() || `polynet_codex_worker:${randomUUID()}`;
  const command = String(
    body.command ??
      "pwd && echo POLYNET_CODEX_WORKER_SERVICE_PROBE && uname -s",
  ).trim();
  const prompt = params.probeMode
    ? buildProbePrompt(command)
    : String(body.prompt ?? "").trim();
  if (!prompt) {
    sendJson(params.res, 400, {
      ok: false,
      code: "prompt_required",
      message: "prompt_required",
    });
    return;
  }
  const providedSandboxName = String(body.sandbox_name ?? body.sandboxName ?? "").trim();
  const sandboxProvided = providedSandboxName.length > 0;
  const rawSandboxName =
    providedSandboxName || `polynet-codex-worker-svc-${randomUUID().slice(0, 8)}`;
  const sandboxName = safeResourceName(rawSandboxName);
  if (!sandboxName) {
    sendJson(params.res, 400, {
      ok: false,
      code: "invalid_sandbox_name",
      message: "sandbox_name must contain at least one ASCII letter or number.",
      run_id: runId,
    });
    return;
  }
  const commandTimeoutSeconds =
    typeof body.command_timeout_seconds === "number" && Number.isFinite(body.command_timeout_seconds)
      ? Math.max(1, Math.floor(body.command_timeout_seconds))
      : readIntegerEnv("POLYNET_CODEX_WORKER_COMMAND_TIMEOUT_SECONDS", 60);
  const destroyAfterRun =
    typeof body.destroy_after_run === "boolean"
      ? body.destroy_after_run
      : readBooleanEnv("POLYNET_CODEX_WORKER_DESTROY_AFTER_RUN", true);

  const rawChatgptAuth = asRecord(body.chatgpt_auth);
  const chatgptAccessToken = String(rawChatgptAuth?.access_token ?? "").trim();
  const chatgptAccountId = String(rawChatgptAuth?.chatgpt_account_id ?? "").trim();
  const chatgptPlanType = String(rawChatgptAuth?.chatgpt_plan_type ?? "").trim() || null;
  const chatgptAuth: WorkerChatgptAuth | null =
    chatgptAccessToken && chatgptAccountId
      ? {
          accessToken: chatgptAccessToken,
          chatgptAccountId,
          chatgptPlanType,
        }
      : null;
  const rawIngest = asRecord(body.ingest);
  const ingestUrl = String(rawIngest?.url ?? "").trim();
  const ingestToken = String(rawIngest?.token ?? "").trim();
  const ingestContext = asRecord(rawIngest?.context);
  const ingest: WorkerIngestConfig | null =
    ingestUrl && ingestToken && ingestContext
      ? { url: ingestUrl, token: ingestToken, context: ingestContext }
      : null;

  if (!params.probeMode && !chatgptAuth) {
    sendJson(params.res, 400, {
      ok: false,
      code: "chatgpt_auth_required",
      message:
        "chatgpt_auth with access_token and chatgpt_account_id is required for worker turns.",
      run_id: runId,
    });
    return;
  }

  if (params.runtime.isBusy()) {
    sendWorkerBusy(params.res, runId);
    return;
  }

  if (stream) {
    sendSseHeaders(params.res);
    const writer: StreamWriter = {
      send(event, data) {
        writeSse(params.res, event, data);
      },
    };
    try {
      await params.runtime.runTurn({
        runId,
        prompt,
        model,
        sandboxName,
        sandboxProvided,
        command,
        commandTimeoutSeconds,
        destroyAfterRun,
        probeMode: params.probeMode,
        chatgptAuth,
        ingest,
        writer,
      });
    } catch (error) {
      writeSse(params.res, "error", {
        run_id: runId,
        code: error instanceof WorkerBusyError ? "worker_busy" : "polynet_codex_worker_turn_failed",
        message: error instanceof Error ? error.message : String(error ?? "unknown error"),
      });
    } finally {
      params.res.end();
    }
    return;
  }

  try {
    const result = await params.runtime.runTurn({
      runId,
      prompt,
      model,
      sandboxName,
      sandboxProvided,
      command,
      commandTimeoutSeconds,
      destroyAfterRun,
      probeMode: params.probeMode,
      chatgptAuth,
      ingest,
      writer: null,
    });
    sendJson(params.res, 200, result);
  } catch (error) {
    if (error instanceof WorkerBusyError) {
      sendWorkerBusy(params.res, runId);
      return;
    }
    throw error;
  }
}

export function createPolynetCodexWorkerServer(runtime: PolynetCodexWorkerRuntime): http.Server {
  return http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/healthz") {
        sendJson(res, 200, runtime.health());
        return;
      }
      if (req.method === "POST" && (url.pathname === "/v1/codex/probe" || url.pathname === "/v1/codex/turn")) {
        if (!runtime.isAuthorizedBearer(readBearer(req))) {
          sendJson(res, 401, {
            ok: false,
            code: "unauthorized",
            message: "Missing or invalid bearer token.",
          });
          return;
        }
        await handleTurnEndpoint({
          runtime,
          req,
          res,
          probeMode: url.pathname === "/v1/codex/probe",
        });
        return;
      }
      sendJson(res, 404, {
        ok: false,
        code: "not_found",
        message: "not_found",
      });
    })().catch((error) => {
      sendJson(res, 500, {
        ok: false,
        code: "polynet_codex_worker_unhandled",
        message: error instanceof Error ? error.message : String(error ?? "unknown error"),
      });
    });
  });
}

export async function startPolynetCodexWorkerServer(): Promise<{
  runtime: PolynetCodexWorkerRuntime;
  server: http.Server;
  port: number;
}> {
  const port = readIntegerEnv("PORT", readIntegerEnv("POLYNET_CODEX_WORKER_PORT", 8787));
  const host = readEnv("POLYNET_CODEX_WORKER_HOST") || "127.0.0.1";
  const authToken = readEnv("POLYNET_CODEX_WORKER_AUTH_TOKEN");
  if (!authToken) throw new Error("POLYNET_CODEX_WORKER_AUTH_TOKEN is required.");
  const runtime = new PolynetCodexWorkerRuntime({
    cwd: readEnv("POLYNET_CODEX_WORKER_AGENT_CWD") || process.cwd(),
    codexBin: readEnv("POLYNET_CODEX_WORKER_CODEX_BIN") || "codex",
    model: readEnv("POLYNET_CODEX_WORKER_MODEL") || "gpt-5.5",
    authToken,
  });
  await runtime.start();
  const server = createPolynetCodexWorkerServer(runtime);
  await new Promise<void>((resolve) => {
    server.listen(port, host, resolve);
  });
  const displayHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  process.stdout.write(
    `${JSON.stringify({
      kind: "polynet_codex_worker_service_event",
      event: "http_server_listening",
      host,
      url: `http://${displayHost}:${port}`,
    })}\n`,
  );
  return { runtime, server, port };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const running = await startPolynetCodexWorkerServer();
  const shutdown = async () => {
    await running.runtime.stop();
    await new Promise<void>((resolve) => running.server.close(() => resolve()));
  };
  process.on("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.on("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });
}
