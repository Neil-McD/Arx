import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";

type JsonRecord = Record<string, unknown>;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

export type CodexAppServerClientOptions = {
  codexBin?: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  onNotification: (message: JsonRecord) => void;
  onServerRequest: (message: JsonRecord) => Promise<void>;
  onTrace?: (event: string, data?: JsonRecord) => void;
  onStderr?: (line: string) => void;
};

export type CodexAppServerInitializeResult = {
  codexHome: string | null;
  platformFamily: string | null;
  platformOs: string | null;
  userAgent: string | null;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function previewText(value: unknown, max = 800): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export class CodexAppServerClient {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private rl: ReadlineInterface | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private closed = false;
  private initialized = false;
  private initializeResult: CodexAppServerInitializeResult | null = null;
  private readonly options: CodexAppServerClientOptions;

  constructor(options: CodexAppServerClientOptions) {
    this.options = options;
  }

  get isRunning(): boolean {
    return Boolean(this.proc) && !this.closed;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  get initResult(): CodexAppServerInitializeResult | null {
    return this.initializeResult;
  }

  start(): void {
    if (this.proc) return;
    this.closed = false;
    const codexBin = String(this.options.codexBin ?? "codex").trim() || "codex";
    this.proc = spawn(codexBin, ["app-server", "--listen", "stdio://"], {
      cwd: this.options.cwd,
      env: this.options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.trace("codex_app_server_spawned", {
      pid: this.proc.pid ?? null,
      codex_bin: codexBin,
      transport: "stdio://",
    });
    this.proc.stderr.on("data", (chunk) => {
      const text = String(chunk ?? "").trim();
      if (!text) return;
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed) this.options.onStderr?.(trimmed);
      }
    });
    this.proc.on("error", (error) => {
      this.closed = true;
      this.initialized = false;
      this.failPending(error);
      this.trace("codex_app_server_process_error", {
        message: error.message,
      });
    });
    this.proc.on("exit", (code, signal) => {
      this.closed = true;
      this.initialized = false;
      const error = new Error(`codex app-server exited: code=${code ?? "null"} signal=${signal ?? "null"}`);
      this.failPending(error);
      this.trace("codex_app_server_exited", {
        code: code ?? null,
        signal: signal ?? null,
      });
    });
    this.proc.stdin.on("error", (error) => {
      this.closed = true;
      this.initialized = false;
      this.failPending(error);
      this.trace("codex_app_server_stdin_error", {
        message: error.message,
      });
    });
    this.rl = createInterface({ input: this.proc.stdout });
    this.rl.on("line", (line) => {
      void this.handleLine(line).catch((error) => {
        this.trace("codex_app_server_line_handler_error", {
          message: error instanceof Error ? error.message : String(error ?? "line handler failed"),
        });
      });
    });
  }

  async initialize(params?: {
    clientName?: string;
    clientTitle?: string;
    clientVersion?: string;
    experimentalApi?: boolean;
  }): Promise<CodexAppServerInitializeResult> {
    this.start();
    const response = asRecord(
      await this.request("initialize", {
        clientInfo: {
          name: params?.clientName ?? "polynet_codex_worker",
          title: params?.clientTitle ?? "PolyNet Codex Worker",
          version: params?.clientVersion ?? "0.1.0",
        },
        capabilities: {
          experimentalApi: params?.experimentalApi !== false,
        },
      }),
    );
    this.notify("initialized");
    this.initialized = true;
    this.initializeResult = {
      codexHome: typeof response?.codexHome === "string" ? response.codexHome : null,
      platformFamily: typeof response?.platformFamily === "string" ? response.platformFamily : null,
      platformOs: typeof response?.platformOs === "string" ? response.platformOs : null,
      userAgent: typeof response?.userAgent === "string" ? response.userAgent : null,
    };
    this.trace("codex_app_server_initialized", this.initializeResult as JsonRecord);
    return this.initializeResult;
  }

  async stop(): Promise<void> {
    this.closed = true;
    this.initialized = false;
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
    const id = this.nextId;
    this.nextId += 1;
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
    try {
      this.proc.stdin.write(`${JSON.stringify(message)}\n`);
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error ?? "codex app-server write failed"));
      this.closed = true;
      this.initialized = false;
      this.failPending(normalized);
      throw normalized;
    }
  }

  private failPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  private async handleLine(line: string): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      this.trace("codex_app_server_non_json_line", {
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
        await this.options.onServerRequest(message);
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
      this.options.onNotification(message);
    }
  }

  private trace(event: string, data?: JsonRecord): void {
    this.options.onTrace?.(event, data);
  }
}
