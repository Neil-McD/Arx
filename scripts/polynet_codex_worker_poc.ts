import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import { performance } from "node:perf_hooks";
import {
  destroyBlaxelWorkspaceComputer,
  ensureBlaxelWorkspaceComputer,
  executeBlaxelWorkspaceCommand,
} from "../convex/blaxelWorkspaceComputerProvider.ts";

type JsonRecord = Record<string, unknown>;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

type TimelineEvent = {
  event: string;
  t_ms: number;
  data?: JsonRecord;
};

type TurnMetrics = {
  label: string;
  turnId: string | null;
  startedAtMs: number;
  firstEventAtMs: number | null;
  firstAssistantDeltaAtMs: number | null;
  completedAtMs: number | null;
  assistantText: string;
};

type ToolCallSummary = {
  turnId: string | null;
  callId: string | null;
  command: string;
  latencyMs: number;
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

function nowMs(): number {
  return Math.round(performance.now());
}

function elapsedMs(startedAtMs: number): number {
  return Math.max(0, nowMs() - startedAtMs);
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

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function safeResourceName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 54);
}

function previewText(value: unknown, max = 500): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizeToolCommand(args: unknown, fallbackCommand: string): string {
  const record = asRecord(args);
  const raw = record && typeof record.command === "string" ? record.command : fallbackCommand;
  const command = raw.trim();
  if (!command) return fallbackCommand;
  if (command.length > 1000) {
    throw new Error("blaxel_bash command is too long for this POC.");
  }
  return command;
}

function commandResultText(params: {
  sandboxName: string;
  command: string;
  ok: boolean;
  exitCode: number | null;
  status: string | null;
  stdout: string;
  stderr: string;
  providerCommandId: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
}): string {
  return JSON.stringify(
    {
      provider: "blaxel",
      sandboxName: params.sandboxName,
      command: params.command,
      ok: params.ok,
      exitCode: params.exitCode,
      status: params.status,
      stdout: params.stdout,
      stderr: params.stderr,
      providerCommandId: params.providerCommandId,
      failureCode: params.failureCode ?? null,
      failureMessage: params.failureMessage ?? null,
    },
    null,
    2,
  );
}

class CodexAppServerClient {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private rl: ReadlineInterface | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private closed = false;
  private readonly onNotification: (message: JsonRecord) => void;
  private readonly onServerRequest: (message: JsonRecord) => Promise<void>;
  private readonly mark: (event: string, data?: JsonRecord) => void;

  constructor(
    onNotification: (message: JsonRecord) => void,
    onServerRequest: (message: JsonRecord) => Promise<void>,
    mark: (event: string, data?: JsonRecord) => void,
  ) {
    this.onNotification = onNotification;
    this.onServerRequest = onServerRequest;
    this.mark = mark;
  }

  start(): void {
    if (this.proc) return;
    this.proc = spawn("codex", ["app-server", "--listen", "stdio://"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.mark("codex_app_server_spawned", {
      pid: this.proc.pid ?? null,
    });
    this.proc.stderr.on("data", (chunk) => {
      const text = String(chunk ?? "").trim();
      if (text) {
        process.stderr.write(`[codex app-server] ${text}\n`);
      }
    });
    this.proc.on("exit", (code, signal) => {
      this.closed = true;
      const error = new Error(`codex app-server exited: code=${code ?? "null"} signal=${signal ?? "null"}`);
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timeout);
        pending.reject(error);
        this.pending.delete(id);
      }
      this.mark("codex_app_server_exited", {
        code: code ?? null,
        signal: signal ?? null,
      });
    });
    this.rl = createInterface({ input: this.proc.stdout });
    this.rl.on("line", (line) => {
      void this.handleLine(line);
    });
  }

  async stop(): Promise<void> {
    this.closed = true;
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    const proc = this.proc;
    if (!proc) return;
    this.proc = null;
    if (proc.exitCode !== null || proc.signalCode !== null) return;
    proc.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (proc.exitCode === null && proc.signalCode === null) {
          proc.kill("SIGKILL");
        }
        resolve();
      }, 1500);
      proc.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  request(method: string, params: unknown, timeoutMs = 300_000): Promise<unknown> {
    if (!this.proc || this.closed) {
      return Promise.reject(new Error("codex app-server is not running."));
    }
    const id = this.nextId++;
    const message = { method, id, params };
    const promise = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`codex app-server request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
    });
    this.send(message);
    return promise;
  }

  notify(method: string, params?: unknown): void {
    this.send(params === undefined ? { method } : { method, params });
  }

  respond(id: unknown, result: unknown): void {
    this.send({ id, result });
  }

  respondError(id: unknown, code: number, message: string): void {
    this.send({ id, error: { code, message } });
  }

  private send(message: unknown): void {
    if (!this.proc || this.closed) {
      throw new Error("cannot send to stopped codex app-server.");
    }
    this.proc.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private async handleLine(line: string): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      this.mark("codex_app_server_non_json_line", {
        text: previewText(trimmed),
      });
      return;
    }
    const message = asRecord(parsed);
    if (!message) return;
    const id = typeof message.id === "number" ? message.id : null;
    const method = typeof message.method === "string" ? message.method : null;
    if (id !== null && !method && ("result" in message || "error" in message)) {
      const pending = this.pending.get(id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(id);
      if ("error" in message && message.error) {
        pending.reject(new Error(`codex app-server error for request ${id}: ${JSON.stringify(message.error)}`));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (method && "id" in message) {
      try {
        await this.onServerRequest(message);
      } catch (error) {
        this.respondError(
          message.id,
          -32000,
          error instanceof Error ? error.message : String(error ?? "server request failed"),
        );
      }
      return;
    }
    if (method) {
      this.onNotification(message);
    }
  }
}

async function main(): Promise<void> {
  const processStartedAt = nowMs();
  const timeline: TimelineEvent[] = [];
  const toolCalls: ToolCallSummary[] = [];
  const completedTurns = new Map<string, JsonRecord>();
  const turnWaiters = new Map<string, Array<(value: JsonRecord) => void>>();
  let activeTurn: TurnMetrics | null = null;
  let client: CodexAppServerClient | null = null;
  let sandboxEnsured = false;

  const model = readEnv("POLYNET_CODEX_WORKER_POC_MODEL") || "gpt-5.5";
  const sandboxName = safeResourceName(
    readEnv("POLYNET_CODEX_WORKER_POC_SANDBOX_NAME") ||
      `polynet-codex-worker-poc-${randomUUID().slice(0, 8)}`,
  );
  const destroyAfterRun = readBooleanEnv("POLYNET_CODEX_WORKER_POC_DESTROY_AFTER_RUN", true);
  const commandTimeoutSeconds = readIntegerEnv("POLYNET_CODEX_WORKER_POC_COMMAND_TIMEOUT_SECONDS", 60);
  const toolCommand =
    readEnv("POLYNET_CODEX_WORKER_POC_COMMAND") ||
    "pwd && echo POLYNET_CODEX_WORKER_POC && uname -s";

  const mark = (event: string, data?: JsonRecord): void => {
    const entry: TimelineEvent = {
      event,
      t_ms: elapsedMs(processStartedAt),
      ...(data ? { data } : null),
    };
    timeline.push(entry);
    process.stdout.write(`${JSON.stringify({ kind: "polynet_codex_worker_poc_event", ...entry })}\n`);
  };

  function completeTurn(turnId: string, payload: JsonRecord): void {
    completedTurns.set(turnId, payload);
    const waiters = turnWaiters.get(turnId) ?? [];
    turnWaiters.delete(turnId);
    for (const waiter of waiters) waiter(payload);
  }

  function waitForTurnCompletion(turnId: string, timeoutMs = 300_000): Promise<JsonRecord> {
    const completed = completedTurns.get(turnId);
    if (completed) return Promise.resolve(completed);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const current = turnWaiters.get(turnId) ?? [];
        turnWaiters.set(
          turnId,
          current.filter((waiter) => waiter !== wrappedResolve),
        );
        reject(new Error(`timed out waiting for turn completion: ${turnId}`));
      }, timeoutMs);
      const wrappedResolve = (value: JsonRecord) => {
        clearTimeout(timeout);
        resolve(value);
      };
      const current = turnWaiters.get(turnId) ?? [];
      current.push(wrappedResolve);
      turnWaiters.set(turnId, current);
    });
  }

  const onNotification = (message: JsonRecord): void => {
    const method = String(message.method ?? "");
    const params = asRecord(message.params);
    if (activeTurn && activeTurn.firstEventAtMs === null && method.startsWith("turn/")) {
      activeTurn.firstEventAtMs = nowMs();
      mark("turn_first_codex_event", {
        label: activeTurn.label,
        method,
        latency_ms: activeTurn.firstEventAtMs - activeTurn.startedAtMs,
      });
    }
    if (method === "turn/started" && activeTurn && params) {
      const turn = asRecord(params.turn);
      const turnId = typeof turn?.id === "string" ? turn.id : null;
      if (turnId && !activeTurn.turnId) activeTurn.turnId = turnId;
      mark("turn_started", {
        label: activeTurn.label,
        turn_id: activeTurn.turnId,
      });
      return;
    }
    if (method === "item/agentMessage/delta" && params && activeTurn) {
      if (activeTurn.firstAssistantDeltaAtMs === null) {
        activeTurn.firstAssistantDeltaAtMs = nowMs();
        mark("turn_first_assistant_delta", {
          label: activeTurn.label,
          latency_ms: activeTurn.firstAssistantDeltaAtMs - activeTurn.startedAtMs,
        });
      }
      activeTurn.assistantText += String(params.delta ?? "");
      return;
    }
    if (method === "item/started" && params) {
      const item = asRecord(params.item);
      const itemType = String(item?.type ?? "");
      if (itemType === "dynamicToolCall") {
        mark("codex_dynamic_tool_item_started", {
          turn_id: String(params.turnId ?? ""),
          item_id: String(item?.id ?? ""),
          tool: String(item?.tool ?? ""),
        });
      }
      return;
    }
    if (method === "item/completed" && params) {
      const item = asRecord(params.item);
      const itemType = String(item?.type ?? "");
      if (itemType === "dynamicToolCall") {
        mark("codex_dynamic_tool_item_completed", {
          turn_id: String(params.turnId ?? ""),
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
      const turnId = typeof params.threadId === "string" && typeof turn?.id === "string"
        ? turn.id
        : typeof turn?.id === "string"
          ? turn.id
          : null;
      if (activeTurn && (!activeTurn.turnId || activeTurn.turnId === turnId)) {
        activeTurn.completedAtMs = nowMs();
        mark("turn_completed", {
          label: activeTurn.label,
          turn_id: turnId,
          status: String(turn?.status ?? ""),
          latency_ms: activeTurn.completedAtMs - activeTurn.startedAtMs,
        });
      }
      if (turnId) completeTurn(turnId, params);
    }
  };

  const onServerRequest = async (message: JsonRecord): Promise<void> => {
    if (!client) throw new Error("codex app-server client is not initialized.");
    const method = String(message.method ?? "");
    if (method !== "item/tool/call") {
      mark("codex_server_request_denied", { method });
      if (method === "item/commandExecution/requestApproval") {
        client.respond(message.id, { decision: "decline" });
        return;
      }
      if (method === "execCommandApproval" || method === "applyPatchApproval") {
        client.respond(message.id, { decision: "denied" });
        return;
      }
      client.respondError(message.id, -32601, `unsupported server request: ${method}`);
      return;
    }

    const params = asRecord(message.params);
    if (!params || String(params.tool ?? "") !== "blaxel_bash") {
      client.respondError(message.id, -32601, "unsupported dynamic tool");
      return;
    }

    const command = normalizeToolCommand(params.arguments, toolCommand);
    const toolStartedAt = nowMs();
    mark("blaxel_bash_requested", {
      turn_id: typeof params.turnId === "string" ? params.turnId : null,
      call_id: typeof params.callId === "string" ? params.callId : null,
      sandbox_name: sandboxName,
      command,
    });
    const result = await executeBlaxelWorkspaceCommand({
      sandboxName,
      cwd: ".",
      command,
      processName: safeResourceName(`polynet-codex-worker-${randomUUID().slice(0, 8)}`),
      waitForCompletion: true,
      timeoutSeconds: commandTimeoutSeconds,
    });
    const latencyMs = elapsedMs(toolStartedAt);
    if (result.ok === false) {
      const output = commandResultText({
        sandboxName,
        command,
        ok: false,
        exitCode: null,
        status: null,
        stdout: "",
        stderr: "",
        providerCommandId: null,
        failureCode: result.code,
        failureMessage: result.message,
      });
      toolCalls.push({
        turnId: typeof params.turnId === "string" ? params.turnId : null,
        callId: typeof params.callId === "string" ? params.callId : null,
        command,
        latencyMs,
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: result.message,
      });
      mark("blaxel_bash_completed", {
        ok: false,
        latency_ms: latencyMs,
        failure_code: result.code,
      });
      client.respond(message.id, {
        success: false,
        contentItems: [{ type: "inputText", text: output }],
      });
      return;
    }

    const stdout = String(result.stdout ?? "");
    const stderr = String(result.stderr ?? "");
    const ok = (result.exitCode ?? 0) === 0;
    toolCalls.push({
      turnId: typeof params.turnId === "string" ? params.turnId : null,
      callId: typeof params.callId === "string" ? params.callId : null,
      command,
      latencyMs,
      ok,
      exitCode: result.exitCode ?? null,
      stdout,
      stderr,
    });
    mark("blaxel_bash_completed", {
      ok,
      latency_ms: latencyMs,
      exit_code: result.exitCode ?? null,
      provider_command_id: result.providerCommandId,
      stdout_preview: previewText(stdout),
      stderr_preview: previewText(stderr),
    });
    client.respond(message.id, {
      success: ok,
      contentItems: [
        {
          type: "inputText",
          text: commandResultText({
            sandboxName,
            command,
            ok,
            exitCode: result.exitCode ?? null,
            status: result.status ?? null,
            stdout,
            stderr,
            providerCommandId: result.providerCommandId,
          }),
        },
      ],
    });
  };

  async function runTurn(label: string, prompt: string, threadId: string): Promise<TurnMetrics> {
    const metrics: TurnMetrics = {
      label,
      turnId: null,
      startedAtMs: nowMs(),
      firstEventAtMs: null,
      firstAssistantDeltaAtMs: null,
      completedAtMs: null,
      assistantText: "",
    };
    activeTurn = metrics;
    mark("turn_start_requested", { label });
    const response = asRecord(
      await client!.request("turn/start", {
        threadId,
        input: [{ type: "text", text: prompt, text_elements: [] }],
        approvalPolicy: "never",
        sandboxPolicy: { type: "readOnly", networkAccess: false },
        model,
      }),
    );
    const turn = asRecord(response?.turn);
    const turnId = typeof turn?.id === "string" ? turn.id : null;
    if (!turnId) throw new Error(`turn/start did not return a turn id for ${label}`);
    metrics.turnId = turnId;
    mark("turn_start_acknowledged", { label, turn_id: turnId });
    await waitForTurnCompletion(turnId);
    activeTurn = null;
    return metrics;
  }

  mark("worker_start", {
    cwd: process.cwd(),
    model,
    sandbox_name: sandboxName,
    destroy_after_run: destroyAfterRun,
  });

  try {
    const blaxelEnsureStartedAt = nowMs();
    mark("blaxel_sandbox_ensure_started", { sandbox_name: sandboxName });
    const ensured = await ensureBlaxelWorkspaceComputer({
      sandboxName,
      lifecycleIntent: "agent_run",
      labels: {
        purpose: "polynet-codex-worker-poc",
      },
    });
    if (ensured.ok === false) {
      throw new Error(`Blaxel sandbox ensure failed: ${ensured.code}: ${ensured.message}`);
    }
    sandboxEnsured = true;
    mark("blaxel_sandbox_ensure_completed", {
      sandbox_name: sandboxName,
      provider_sandbox_id: ensured.providerSandboxId,
      workspace_root: ensured.workspaceRoot,
      latency_ms: elapsedMs(blaxelEnsureStartedAt),
    });

    client = new CodexAppServerClient(onNotification, onServerRequest, mark);
    client.start();

    const initializeStartedAt = nowMs();
    const initializeResponse = asRecord(
      await client.request("initialize", {
        clientInfo: {
          name: "polynet_codex_worker_poc",
          title: "PolyNet Codex Worker POC",
          version: "0.1.0",
        },
        capabilities: {
          experimentalApi: true,
        },
      }),
    );
    client.notify("initialized");
    mark("codex_app_server_initialized", {
      platform_family: String(initializeResponse?.platformFamily ?? ""),
      platform_os: String(initializeResponse?.platformOs ?? ""),
      latency_ms: elapsedMs(initializeStartedAt),
    });

    const threadStartedAt = nowMs();
    const threadResponse = asRecord(
      await client.request("thread/start", {
        model,
        cwd: process.cwd(),
        approvalPolicy: "never",
        sandbox: "read-only",
        ephemeral: true,
        developerInstructions:
          "You are running inside the PolyNet Codex worker POC. Do not use local shell commands or local file edits. When you need to run a workspace command, call the dynamic tool named blaxel_bash. Report the tool output concisely.",
        dynamicTools: [
          {
            name: "blaxel_bash",
            description:
              "Run a shell command inside the remote Blaxel workspace sandbox. Use this instead of local shell commands.",
            inputSchema: {
              type: "object",
              properties: {
                command: {
                  type: "string",
                  description: "Shell command to run in the Blaxel workspace.",
                },
              },
              required: ["command"],
              additionalProperties: false,
            },
          },
        ],
        experimentalRawEvents: false,
        persistExtendedHistory: false,
      }),
    );
    const thread = asRecord(threadResponse?.thread);
    const threadId = typeof thread?.id === "string" ? thread.id : null;
    if (!threadId) throw new Error("thread/start did not return a thread id.");
    mark("codex_thread_started", {
      thread_id: threadId,
      latency_ms: elapsedMs(threadStartedAt),
    });

    const firstPrompt =
      "Call blaxel_bash exactly once with command `pwd && echo POLYNET_CODEX_WORKER_POC && uname -s`. Then summarize the output and say whether it ran in Blaxel.";
    const secondPrompt =
      "Call blaxel_bash exactly once with command `pwd && echo POLYNET_CODEX_WORKER_POC_WARM`. Then summarize the output and mention that this is the second turn on the same worker process.";
    const firstTurn = await runTurn("first", firstPrompt, threadId);
    const secondTurn = await runTurn("second", secondPrompt, threadId);

    const toolOutputCombined = toolCalls.map((call) => `${call.stdout}\n${call.stderr}`).join("\n");
    const proof = {
      ok:
        sandboxEnsured &&
        toolCalls.length >= 2 &&
        toolCalls.every((call) => call.ok) &&
        toolOutputCombined.includes("POLYNET_CODEX_WORKER_POC") &&
        toolOutputCombined.includes("/workspace"),
      sandboxName,
      model,
      appServerReusedAcrossTurns: true,
      turnCount: 2,
      toolCallCount: toolCalls.length,
      firstTurn: {
        turnId: firstTurn.turnId,
        firstEventLatencyMs: firstTurn.firstEventAtMs === null ? null : firstTurn.firstEventAtMs - firstTurn.startedAtMs,
        firstAssistantDeltaLatencyMs:
          firstTurn.firstAssistantDeltaAtMs === null ? null : firstTurn.firstAssistantDeltaAtMs - firstTurn.startedAtMs,
        completedLatencyMs: firstTurn.completedAtMs === null ? null : firstTurn.completedAtMs - firstTurn.startedAtMs,
        assistantPreview: previewText(firstTurn.assistantText, 1000),
      },
      secondTurn: {
        turnId: secondTurn.turnId,
        firstEventLatencyMs: secondTurn.firstEventAtMs === null ? null : secondTurn.firstEventAtMs - secondTurn.startedAtMs,
        firstAssistantDeltaLatencyMs:
          secondTurn.firstAssistantDeltaAtMs === null ? null : secondTurn.firstAssistantDeltaAtMs - secondTurn.startedAtMs,
        completedLatencyMs: secondTurn.completedAtMs === null ? null : secondTurn.completedAtMs - secondTurn.startedAtMs,
        assistantPreview: previewText(secondTurn.assistantText, 1000),
      },
      toolCalls: toolCalls.map((call) => ({
        turnId: call.turnId,
        callId: call.callId,
        command: call.command,
        latencyMs: call.latencyMs,
        ok: call.ok,
        exitCode: call.exitCode,
        stdoutPreview: previewText(call.stdout, 1000),
        stderrPreview: previewText(call.stderr, 1000),
      })),
      timeline,
    };
    process.stdout.write(`${JSON.stringify({ kind: "polynet_codex_worker_poc_summary", proof }, null, 2)}\n`);
    if (!proof.ok) {
      throw new Error("PolyNet Codex worker POC proof failed.");
    }
  } finally {
    if (client) {
      await client.stop();
    }
    if (destroyAfterRun && sandboxEnsured) {
      const cleanupStartedAt = nowMs();
      mark("blaxel_sandbox_destroy_started", { sandbox_name: sandboxName });
      const cleanup = await destroyBlaxelWorkspaceComputer({ sandboxName });
      mark("blaxel_sandbox_destroy_completed", {
        sandbox_name: sandboxName,
        ok: cleanup.ok,
        latency_ms: elapsedMs(cleanupStartedAt),
        failure_code: cleanup.ok ? null : cleanup.code,
      });
    }
  }
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      kind: "polynet_codex_worker_poc_error",
      message: error instanceof Error ? error.message : String(error ?? "unknown error"),
    })}\n`,
  );
  process.exitCode = 1;
});
