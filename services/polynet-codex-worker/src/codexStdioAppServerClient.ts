import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";

import type { PolynetCodexWorkerTransportPayload } from "../../../convex/polynetCodexWorkerBridge.ts";

type JsonRecord = Record<string, unknown>;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

export type CodexStdioAppServerClientConfig = {
  codexBin: string;
  cwd: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv | null;
};

export type CodexStdioAppServerInitializeResult = {
  codexHome: string | null;
  platformFamily: string | null;
  platformOs: string | null;
  userAgent: string | null;
};

export type CodexStdioAppServerRunSuccess = {
  ok: true;
  assistantText: string;
  promptTokens: null;
  completionTokens: null;
};

export type CodexStdioAppServerRunFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  retryable: boolean;
};

export type CodexStdioAppServerRunResult =
  | CodexStdioAppServerRunSuccess
  | CodexStdioAppServerRunFailure;

type StdioClientOptions = CodexStdioAppServerClientConfig & {
  onNotification: (message: JsonRecord) => void;
  onServerRequest: (
    message: JsonRecord,
    client: CodexStdioAppServerClientLike,
  ) => Promise<void> | void;
  onClosed?: (error: Error) => void;
};

type CodexStdioAppServerClientLike = {
  initialize: (timeoutMs?: number) => Promise<CodexStdioAppServerInitializeResult>;
  request: (
    method: string,
    params: unknown,
    timeoutMs?: number,
  ) => Promise<unknown>;
  notify: (method: string, params?: unknown) => void;
  respond: (id: unknown, result: unknown) => void;
  respondError: (id: unknown, code: number, message: string) => void;
  stop: () => Promise<void>;
};

export type CodexStdioAppServerClientFactory = (
  options: StdioClientOptions,
) => CodexStdioAppServerClientLike;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeErrorMessage(code: string): string {
  return `Codex stdio app-server request failed with code ${code}.`;
}

function extractThreadId(response: unknown): string | null {
  const body = asRecord(response);
  const thread = asRecord(body?.thread);
  return readString(thread?.id);
}

function extractTurn(response: unknown): JsonRecord | null {
  const body = asRecord(response);
  return asRecord(body?.turn);
}

function extractTurnId(response: unknown): string | null {
  return readString(extractTurn(response)?.id);
}

function extractTurnStatus(turn: JsonRecord | null): string | null {
  return readString(turn?.status);
}

function extractAssistantTextFromTurn(turn: JsonRecord | null): string {
  const items = Array.isArray(turn?.items) ? turn.items : [];
  return items
    .map((item) => {
      const record = asRecord(item);
      if (record?.type !== "agentMessage") return "";
      return typeof record.text === "string" ? record.text : "";
    })
    .filter((text) => text.trim())
    .join("\n")
    .trim();
}

function makeFailure(params: {
  status?: number;
  code: string;
  retryable?: boolean;
}): CodexStdioAppServerRunFailure {
  return {
    ok: false,
    status: params.status ?? 502,
    code: params.code,
    message: normalizeErrorMessage(params.code),
    retryable: params.retryable !== false,
  };
}

export class CodexStdioAppServerClient implements CodexStdioAppServerClientLike {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private rl: ReadlineInterface | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private closed = false;
  private readonly options: StdioClientOptions;

  constructor(options: StdioClientOptions) {
    this.options = options;
  }

  async initialize(timeoutMs = this.options.timeoutMs): Promise<CodexStdioAppServerInitializeResult> {
    this.start();
    const response = asRecord(
      await this.request(
        "initialize",
        {
          clientInfo: {
            name: "polynet_codex_worker",
            title: "PolyNet Codex Worker",
            version: "0.1.0",
          },
          capabilities: {
            experimentalApi: true,
          },
        },
        timeoutMs,
      ),
    );
    this.notify("initialized");
    return {
      codexHome: readString(response?.codexHome),
      platformFamily: readString(response?.platformFamily),
      platformOs: readString(response?.platformOs),
      userAgent: readString(response?.userAgent),
    };
  }

  request(
    method: string,
    params: unknown,
    timeoutMs = this.options.timeoutMs,
  ): Promise<unknown> {
    if (!this.proc || this.closed) {
      return Promise.reject(new Error("codex stdio app-server is not running."));
    }
    const id = this.nextId;
    this.nextId += 1;
    const promise = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`codex stdio app-server request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
    });
    this.send({ method, id, params });
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

  private start(): void {
    if (this.proc) return;
    this.closed = false;
    const codexBin = this.options.codexBin.trim() || "codex";
    this.proc = spawn(codexBin, ["app-server", "--listen", "stdio://"], {
      cwd: this.options.cwd,
      env: this.options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.proc.on("error", (error) => {
      this.closed = true;
      this.failPending(error);
      this.options.onClosed?.(error);
    });
    this.proc.on("exit", (code, signal) => {
      this.closed = true;
      const error = new Error(
        `codex stdio app-server exited: code=${code ?? "null"} signal=${signal ?? "null"}`,
      );
      this.failPending(error);
      this.options.onClosed?.(error);
    });
    this.proc.stdin.on("error", (error) => {
      this.closed = true;
      this.failPending(error);
      this.options.onClosed?.(error);
    });
    this.proc.stderr.on("data", () => {
      // Stderr can contain CLI diagnostics. Keep it out of worker responses.
    });
    this.rl = createInterface({ input: this.proc.stdout });
    this.rl.on("line", (line) => {
      void this.handleLine(line).catch((error) => {
        this.options.onClosed?.(
          error instanceof Error ? error : new Error(String(error)),
        );
      });
    });
  }

  private send(message: unknown): void {
    if (!this.proc || this.closed) {
      throw new Error("cannot send to stopped codex stdio app-server.");
    }
    this.proc.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private failPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  private async handleLine(line: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }
    const message = asRecord(parsed);
    if (!message) return;
    const id = typeof message.id === "number" ? message.id : null;
    const method = readString(message.method);
    if (id !== null && !method && ("result" in message || "error" in message)) {
      const pending = this.pending.get(id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(id);
      if (message.error) {
        pending.reject(new Error("codex stdio app-server returned an error."));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (method && id !== null) {
      await this.options.onServerRequest(message, this);
      return;
    }
    if (method) this.options.onNotification(message);
  }
}

async function waitForTurnCompletion(params: {
  turnId: string;
  timeoutMs: number;
  getCompletedTurn: () => JsonRecord | null;
}): Promise<JsonRecord | null> {
  const existing = params.getCompletedTurn();
  if (existing) return existing;
  return await new Promise<JsonRecord | null>((resolve, reject) => {
    const startedAt = Date.now();
    const interval = setInterval(() => {
      const completed = params.getCompletedTurn();
      if (completed) {
        clearInterval(interval);
        clearTimeout(timeout);
        resolve(completed);
      }
    }, 25);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      reject(
        new Error(
          `codex stdio app-server turn timed out after ${Date.now() - startedAt}ms: ${params.turnId}`,
        ),
      );
    }, params.timeoutMs);
  });
}

export async function probeCodexStdioAppServer(params: {
  config: CodexStdioAppServerClientConfig;
  createClient?: CodexStdioAppServerClientFactory;
}): Promise<
  | { ok: true; result: CodexStdioAppServerInitializeResult }
  | { ok: false; code: string; message: string }
> {
  const client = (params.createClient ?? ((options) => new CodexStdioAppServerClient(options)))({
    ...params.config,
    onNotification: () => {},
    onServerRequest: (_message, appServerClient) => {
      appServerClient.respondError(
        _message.id,
        -32000,
        "PolyNet readiness probe does not handle Codex server requests.",
      );
    },
  });
  try {
    return {
      ok: true,
      result: await client.initialize(params.config.timeoutMs),
    };
  } catch {
    return {
      ok: false,
      code: "codex_stdio_app_server_unavailable",
      message: "Codex stdio app-server did not initialize successfully.",
    };
  } finally {
    await client.stop().catch(() => {});
  }
}

export async function runCodexStdioAppServerRequest(params: {
  payload: PolynetCodexWorkerTransportPayload;
  config: CodexStdioAppServerClientConfig;
  createClient?: CodexStdioAppServerClientFactory;
}): Promise<CodexStdioAppServerRunResult> {
  let activeTurnId: string | null = null;
  let assistantText = "";
  let completedTurn: JsonRecord | null = null;
  let closedError: Error | null = null;
  const client = (params.createClient ?? ((options) => new CodexStdioAppServerClient(options)))({
    ...params.config,
    onClosed: (error) => {
      closedError = error;
    },
    onNotification: (message) => {
      if (
        message.method === "agent-message/delta" ||
        message.method === "item/agentMessage/delta"
      ) {
        const body = asRecord(message.params);
        if (readString(body?.turnId) === activeTurnId && typeof body?.delta === "string") {
          assistantText += body.delta;
        }
        return;
      }
      if (message.method === "item/completed") {
        const body = asRecord(message.params);
        if (readString(body?.turnId) !== activeTurnId) return;
        const item = asRecord(body?.item);
        if (item?.type !== "agentMessage") return;
        if (typeof item.text === "string" && item.text.trim()) {
          assistantText = item.text.trim();
        }
        return;
      }
      if (message.method === "turn/completed") {
        const body = asRecord(message.params);
        const turn = asRecord(body?.turn);
        if (readString(turn?.id) !== activeTurnId) return;
        const finalText = extractAssistantTextFromTurn(turn);
        if (finalText) assistantText = finalText;
        completedTurn = turn;
      }
    },
    onServerRequest: (message, appServerClient) => {
      appServerClient.respondError(
        message.id,
        -32000,
        "PolyNet Codex stdio adapter does not expose interactive tool or approval requests yet.",
      );
    },
  });

  try {
    await client.initialize(params.config.timeoutMs);
    const threadResponse = await client.request(
      "thread/start",
      {
        model: params.payload.model_id,
        cwd: params.config.cwd,
        approvalPolicy: "on-request",
        sandbox: "read-only",
        ephemeral: true,
        developerInstructions: params.payload.developer_instructions,
      },
      params.config.timeoutMs,
    );
    const threadId = extractThreadId(threadResponse);
    if (!threadId) return makeFailure({ code: "codex_stdio_thread_start_invalid_response" });

    const turnResponse = await client.request(
      "turn/start",
      {
        threadId,
        input: [{ type: "text", text: params.payload.prompt, text_elements: [] }],
        approvalPolicy: "on-request",
        sandboxPolicy: {
          type: "readOnly",
          networkAccess: false,
        },
        model: params.payload.model_id,
      },
      params.config.timeoutMs,
    );
    activeTurnId = extractTurnId(turnResponse);
    if (!activeTurnId) return makeFailure({ code: "codex_stdio_turn_start_invalid_response" });

    const turn = extractTurn(turnResponse);
    const initialStatus = extractTurnStatus(turn);
    if (initialStatus === "completed") {
      completedTurn = turn;
      const finalText = extractAssistantTextFromTurn(turn);
      if (finalText) assistantText = finalText;
    } else {
      completedTurn = await waitForTurnCompletion({
        turnId: activeTurnId,
        timeoutMs: params.config.timeoutMs,
        getCompletedTurn: () => completedTurn,
      });
    }

    const completedStatus = extractTurnStatus(completedTurn);
    if (closedError) return makeFailure({ code: "codex_stdio_app_server_closed" });
    if (completedStatus !== "completed") {
      return makeFailure({
        code: completedStatus
          ? `codex_stdio_turn_${completedStatus}`
          : "codex_stdio_turn_did_not_complete",
      });
    }
    if (!assistantText.trim()) {
      return makeFailure({ code: "codex_stdio_empty_assistant_text" });
    }
    return {
      ok: true,
      assistantText,
      promptTokens: null,
      completionTokens: null,
    };
  } catch {
    return makeFailure({ code: "codex_stdio_app_server_failed" });
  } finally {
    await client.stop().catch(() => {});
  }
}
